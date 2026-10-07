import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
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
  const administrador = useMemo(() => {
    const emailNormalizado = user?.email?.toLowerCase().trim() || ''
    if (emailNormalizado === 'marceloslepre@gmail.com') return true
    if (user?.name?.toLowerCase().includes('admin')) return true
    if (usuarioERP?.nome?.toLowerCase().includes('admin')) return true
    if (perfil?.administrador) return true
    if (perfil?.nome?.toLowerCase() === 'administrador') return true
    return false
  }, [user?.email, user?.name, usuarioERP?.nome, perfil])

  // Se o usuário já é deterministicamente administrador por dados de sessão/auth,
  // não deixamos o estado 'carregando' bloquear guards ou a interface.
  const carregando = useMemo(() => {
    if (administrador) return false
    return authLoading || carregandoInterno
  }, [administrador, authLoading, carregandoInterno])

  const pode = useCallback(
    (modulo: ModuloSistema | string, acao: AcaoPermissao): boolean => {
      // Se for administrador (flag no perfil, nome Administrador, ou email master inicial), tem permissão irrestrita total
      const emailNormalizado = user?.email?.toLowerCase().trim()
      if (
        administrador ||
        emailNormalizado === 'marceloslepre@gmail.com' ||
        user?.name?.toLowerCase().includes('admin') ||
        usuarioERP?.nome?.toLowerCase().includes('admin') ||
        perfil?.administrador ||
        perfil?.nome?.toLowerCase() === 'administrador'
      ) {
        return true
      }

      const perm = permissoes[modulo]
      if (!perm) return false

      switch (acao) {
        case 'ver':
          return Boolean(perm.pode_ver)
        case 'criar':
          return Boolean(perm.pode_criar)
        case 'editar':
          return Boolean(perm.pode_editar)
        case 'excluir':
          return Boolean(perm.pode_excluir)
        default:
          return false
      }
    },
    [administrador, user?.email, user?.name, usuarioERP?.nome, perfil, permissoes],
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
