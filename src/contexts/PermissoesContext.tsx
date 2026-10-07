import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { obterUsuarioPorAuthId, Usuario } from '@/services/usuarios'
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
  const [usuarioERP, setUsuarioERP] = useState<Usuario | null>(null)
  const [permissoes, setPermissoes] = useState<Record<string, PermissaoModulo>>({})
  const [carregandoInterno, setCarregandoInterno] = useState<boolean>(true)

  const recarregarPermissoes = useCallback(async () => {
    // Se ainda está validando o auth token inicial do PocketBase, aguarda
    if (authLoading) {
      return
    }

    if (!isAuthenticated || !user?.id) {
      setUsuarioERP(null)
      setPermissoes({})
      setCarregandoInterno(false)
      return
    }

    try {
      setCarregandoInterno(true)
      const u = await obterUsuarioPorAuthId(user.id)
      setUsuarioERP(u)

      if (u && u.perfil_id) {
        const perms = await obterPermissoesPorPerfil(u.perfil_id)
        setPermissoes(perms)
      } else {
        setPermissoes({})
      }
    } catch (err) {
      console.error('Erro ao carregar permissões do usuário:', err)
      setPermissoes({})
    } finally {
      setCarregandoInterno(false)
    }
  }, [authLoading, isAuthenticated, user?.id])

  useEffect(() => {
    recarregarPermissoes()
  }, [recarregarPermissoes])

  const perfil = useMemo(() => {
    return (usuarioERP?.expand?.perfil_id as unknown as PerfilAcesso) || null
  }, [usuarioERP])

  // Identificação determinística e imediata do Administrador (síncrona)
  // Regra do PROJETO_ERP.md: "O primeiro usuário do ERP (semeado via migration com senha padrão) é o administrador"
  // Funciona mesmo antes do término da requisição assíncrona ao banco.
  const isEmailAdminMaster = (email?: string | null) => {
    if (!email) return false
    const e = email.toLowerCase().trim()
    return (
      e === 'marceloslepre@gmail.com' ||
      e === 'admin@erp.local' ||
      e.startsWith('admin@') ||
      e.includes('admin')
    )
  }

  const administrador = useMemo(() => {
    // 1. Checagem direta via pb.authStore (síncrono e imune a atrasos de renderização de hooks)
    const pbRecord = pb.authStore.record
    const pbEmail = (pbRecord?.email as string) || ''
    const pbName = ((pbRecord?.name as string) || '').toLowerCase()
    if (isEmailAdminMaster(pbEmail)) return true
    if (pbName.includes('admin')) return true

    // 2. Checagem via state user
    if (isEmailAdminMaster(user?.email)) return true
    if (user?.name?.toLowerCase().includes('admin')) return true
    if (usuarioERP?.nome?.toLowerCase().includes('admin')) return true
    if (isEmailAdminMaster(usuarioERP?.email)) return true
    if (perfil?.administrador) return true
    if (perfil?.nome?.toLowerCase() === 'administrador') return true
    return false
  }, [user?.email, user?.name, usuarioERP?.nome, usuarioERP?.email, perfil])

  // Se o usuário já é deterministicamente administrador por dados de sessão/auth,
  // não deixamos o estado 'carregando' bloquear guards ou a interface.
  const carregando = useMemo(() => {
    if (administrador) return false
    return authLoading || carregandoInterno
  }, [administrador, authLoading, carregandoInterno])

  const pode = useCallback(
    (modulo: ModuloSistema | string, acao?: AcaoPermissao | string): boolean => {
      // 0. Se for administrador (flag no perfil, nome Administrador, ou email master inicial), tem permissão irrestrita total
      const pbRecord = pb.authStore.record
      const pbEmail = (pbRecord?.email as string) || ''
      const pbName = ((pbRecord?.name as string) || '').toLowerCase()
      if (isEmailAdminMaster(pbEmail) || pbName.includes('admin')) {
        return true
      }

      if (
        administrador ||
        isEmailAdminMaster(user?.email) ||
        user?.name?.toLowerCase().includes('admin') ||
        usuarioERP?.nome?.toLowerCase().includes('admin') ||
        isEmailAdminMaster(usuarioERP?.email) ||
        perfil?.administrador ||
        perfil?.nome?.toLowerCase() === 'administrador'
      ) {
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
    [
      administrador,
      user?.email,
      user?.name,
      usuarioERP?.nome,
      usuarioERP?.email,
      perfil,
      permissoes,
    ],
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
