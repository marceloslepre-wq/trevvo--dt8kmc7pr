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

export type AcaoPermissao = 'ver' | 'criar' | 'editar' | 'excluir' | 'visualizar'

interface PermissoesContextType {
  usuarioERP: Usuario | null
  perfil: PerfilAcesso | null
  permissoes: Record<string, PermissaoModulo>
  carregando: boolean
  administrador: boolean
  pode: (modulo: ModuloSistema | string, acao?: AcaoPermissao | string) => boolean
  podeGravar: (modulo: ModuloSistema | string) => boolean
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
  // SWR: se já temos usuário em cache ou sessão PocketBase, nunca começamos bloqueados
  const [carregandoInterno, setCarregandoInterno] = useState<boolean>(() => {
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    const cached = obterUsuarioCacheLocal(authId || email || undefined)
    return !cached && !pb.authStore.isValid
  })
  const jaResolveuUmaVezRef = React.useRef<boolean>(false)

  // Evita re-execuções infinitas guardando as chaves que dispararam a busca
  const carregamentoRef = React.useRef<{ buscando: boolean; ultimaChave?: string }>({
    buscando: false,
  })

  const recarregarPermissoes = useCallback(async () => {
    // Se temos login ativo no PocketBase (mesmo se o AuthContext ainda estiver sincronizando user.id)
    const effectiveAuthId = user?.id || pb.authStore.record?.id
    const effectiveEmail = user?.email || pb.authStore.record?.email
    const effectiveIsAuth = isAuthenticated || Boolean(pb.authStore.isValid && pb.authStore.record)

    if (!effectiveIsAuth || (!effectiveAuthId && !effectiveEmail)) {
      if (!authLoading) {
        setUsuarioERP(null)
        salvarUsuarioCacheLocal(null)
        setPermissoes({})
        setCarregandoInterno(false)
        jaResolveuUmaVezRef.current = true
      }
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
      jaResolveuUmaVezRef.current = true
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

  // Se já resolveu uma vez ou se temos cache / admin / token válido, nunca bloqueia como 'carregando'
  // Carregando: se temos usuário ERP (ou cache), administrador, ou se a sessão já resolveu,
  // NUNCA bloqueia. Só fica true estritamente se não temos usuário ERP E estiver carregando autenticação.
  const carregando = useMemo(() => {
    if (jaResolveuUmaVezRef.current) return false
    if (administrador || Boolean(perfil?.administrador)) return false
    if (usuarioERP) return false
    // Se temos login ativo no PocketBase ou cache salvo, nunca bloqueia como 'carregando' (SWR)
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    const cached = obterUsuarioCacheLocal(authId || email || undefined)
    if (cached || (pb.authStore.isValid && pb.authStore.record)) return false
    return Boolean(authLoading || carregandoInterno)
  }, [administrador, perfil?.administrador, usuarioERP, authLoading, carregandoInterno])

  // Timeout de segurança absoluto: após 250ms nenhuma tela pode continuar bloqueada
  useEffect(() => {
    const timer = setTimeout(() => {
      setCarregandoInterno(false)
      jaResolveuUmaVezRef.current = true
    }, 250)
    return () => clearTimeout(timer)
  }, [])
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

  const podeGravar = useCallback(
    (modulo: ModuloSistema | string): boolean => {
      return pode(modulo, 'criar') || pode(modulo, 'editar')
    },
    [pode],
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
        podeGravar,
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
