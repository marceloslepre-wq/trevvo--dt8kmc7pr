import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  obterUsuarioPorAuthId,
  obterUsuarioCacheLocal,
  salvarUsuarioCacheLocal,
  Usuario,
} from '@/services/usuarios'
import {
  obterPermissoesPorPerfil,
  PermissaoModulo,
  ModuloSistema,
  PerfilAcesso,
} from '@/services/perfis'

export type AcaoPermissao = 'ver' | 'criar' | 'editar' | 'excluir'

interface PermissoesContextType {
  usuarioERP: Usuario | null
  perfil: PerfilAcesso | null
  permissoes: Record<string, PermissaoModulo>
  carregando: boolean
  administrador: boolean
  pode: (modulo: ModuloSistema | string, acao: AcaoPermissao) => boolean
  recarregarPermissoes: () => Promise<void>
}

const PermissoesContext = createContext<PermissoesContextType | undefined>(undefined)

export const PermissoesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  // Hidratação síncrona inicial a partir do cache local do usuário ERP
  // Permite liberação síncrona sem travar a tela logo no primeiro frame
  const [usuarioERP, setUsuarioERP] = useState<Usuario | null>(() => {
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    return obterUsuarioCacheLocal(authId || email || undefined)
  })
  const [permissoes, setPermissoes] = useState<Record<string, PermissaoModulo>>({})
  // Se já temos usuarioERP no cache (inclusive se for admin), carregandoInterno começa false
  const [carregandoInterno, setCarregandoInterno] = useState<boolean>(() => {
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    const cached = obterUsuarioCacheLocal(authId || email || undefined)
    return !cached
  })

  // Evita re-execuções infinitas guardando as chaves que dispararam a busca
  const carregamentoRef = React.useRef<{ buscando: boolean; ultimaChave?: string }>({
    buscando: false,
  })

  const recarregarPermissoes = useCallback(async () => {
    // Se ainda está validando o auth token inicial do PocketBase, aguarda
    if (authLoading) {
      return
    }

    // Se temos login ativo no PocketBase (mesmo se o AuthContext ainda estiver sincronizando user.id)
    const effectiveAuthId = user?.id || pb.authStore.record?.id
    const effectiveEmail = user?.email || pb.authStore.record?.email
    const effectiveIsAuth = isAuthenticated || Boolean(pb.authStore.isValid && pb.authStore.record)

    if (!effectiveIsAuth || (!effectiveAuthId && !effectiveEmail)) {
      setUsuarioERP(null)
      salvarUsuarioCacheLocal(null)
      setPermissoes({})
      setCarregandoInterno(false)
      return
    }

    const chaveAtual = `${effectiveAuthId}_${effectiveEmail}`
    if (carregamentoRef.current.buscando && carregamentoRef.current.ultimaChave === chaveAtual) {
      return
    }

    carregamentoRef.current.buscando = true
    carregamentoRef.current.ultimaChave = chaveAtual

    try {
      const u = await obterUsuarioPorAuthId(effectiveAuthId || '', effectiveEmail)
      if (u) {
        setUsuarioERP(u)

        if (u.perfil_id) {
          const perms = await obterPermissoesPorPerfil(u.perfil_id)
          setPermissoes(perms)
        } else {
          setPermissoes({})
        }
      } else {
        // Fallback resiliente: se u veio nulo temporariamente, manter o cache anterior
        const cached = obterUsuarioCacheLocal(effectiveAuthId || effectiveEmail)
        if (cached) {
          setUsuarioERP(cached)
          if (cached.perfil_id) {
            try {
              const perms = await obterPermissoesPorPerfil(cached.perfil_id)
              setPermissoes(perms)
            } catch {
              // mantém
            }
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar permissões do usuário:', err)
      const cached = obterUsuarioCacheLocal(effectiveAuthId || effectiveEmail)
      if (cached) {
        setUsuarioERP(cached)
      }
    } finally {
      carregamentoRef.current.buscando = false
      setCarregandoInterno(false)
    }
  }, [authLoading, isAuthenticated, user?.id, user?.email])

  useEffect(() => {
    recarregarPermissoes()
  }, [recarregarPermissoes])

  const perfil = useMemo(() => {
    return (usuarioERP?.expand?.perfil_id as unknown as PerfilAcesso) || null
  }, [usuarioERP])

  // Reconhecimento de administrador EXCLUSIVAMENTE pelo vínculo:
  // registro em `usuarios` ligado ao login cujo perfil (`perfis_acesso`) tenha `administrador = true`.
  // Sem nenhum e-mail escrito no código.
  const administrador = useMemo(() => {
    return Boolean(perfil?.administrador)
  }, [perfil?.administrador])

  // Se o perfil do usuário ERP já é administrador (inclusive via cache síncrono inicial),
  // não deixamos o estado 'carregando' bloquear guards ou a interface.
  const carregando = useMemo(() => {
    if (administrador) return false
    return authLoading || carregandoInterno
  }, [administrador, authLoading, carregandoInterno])

  // Timeout de segurança estrutural: nenhuma rota deve ficar presa em carregando = true
  useEffect(() => {
    if (!carregandoInterno) return
    const timer = setTimeout(() => {
      setCarregandoInterno(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [carregandoInterno])
  const pode = useCallback(
    (modulo: ModuloSistema | string, acao?: AcaoPermissao | string): boolean => {
      // 0. Se for administrador (perfis_acesso.administrador = true), tem permissão irrestrita total
      if (administrador || Boolean(perfil?.administrador)) {
        return true
      }

      // Se não passou ação, o padrão é 'ver' (visualizar)
      const acaoAlvo = (acao || 'ver') as AcaoPermissao

      // Mapeamento tolerante de ações ('visualizar' -> 'ver')
      const acaoNormalizada: AcaoPermissao = acaoAlvo === ('visualizar' as any) ? 'ver' : acaoAlvo

      const perm = permissoes[modulo]
      if (!perm) return false

      switch (acaoNormalizada) {
        case 'ver':
          return Boolean(perm.pode_ver)
        case 'criar':
          return Boolean(perm.pode_criar)
        case 'editar':
          return Boolean(perm.pode_editar)
        case 'excluir':
          return Boolean(perm.pode_excluir)
        default:
          return Boolean(perm.pode_ver)
      }
    },
    [administrador, perfil, permissoes],
  )

  return (
    <PermissoesContext.Provider
      value={{
        usuarioERP,
        perfil,
        permissoes,
        carregando,
        administrador,
        pode,
        recarregarPermissoes,
      }}
    >
      {children}
    </PermissoesContext.Provider>
  )
}

export const usePermissoes = () => {
  const ctx = useContext(PermissoesContext)
  if (!ctx) {
    throw new Error('usePermissoes deve ser usado dentro de um PermissoesProvider')
  }
  return ctx
}
