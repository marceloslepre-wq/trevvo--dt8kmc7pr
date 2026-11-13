import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export interface UserProfile {
  id: string
  email: string
  name: string
  avatar?: string
  verified: boolean
  tipo?: string
}

interface AuthContextType {
  user: UserProfile | null
  token: string
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<UserProfile>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<boolean>
  confirmPasswordReset: (
    token: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<boolean>
  confirmVerification: (token: string) => Promise<boolean>
  confirmEmailChange: (token: string, password: string) => Promise<boolean>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function mapRecordToUser(record: AuthRecord | null): UserProfile | null {
  if (!record) return null
  return {
    id: record.id,
    email: record.email || '',
    name: (record.name as string) || (record.email?.split('@')[0] ?? 'Usuário'),
    avatar: (record.avatar as string) || undefined,
    verified: Boolean(record.verified),
    tipo: (record as any).tipo || '',
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    return pb.authStore.isValid ? mapRecordToUser(pb.authStore.record) : null
  })
  const [token, setToken] = useState<string>(() => pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // Escuta mudanças de authStore do PocketBase
    const unsubscribe = pb.authStore.onChange((newToken, model) => {
      setToken(newToken)
      setUser(mapRecordToUser(model))
    })

    // Valida o token salvo no PocketBase
    const validateSession = async () => {
      try {
        if (pb.authStore.isValid) {
          const authData = await pb.collection('users').authRefresh()
          setUser(mapRecordToUser(authData.record))
        } else {
          setUser(null)
        }
      } catch {
        pb.authStore.clear()
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    validateSession()

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const authData = await pb.collection('users').authWithPassword(email.trim(), password)
    const profile = mapRecordToUser(authData.record)!
    setUser(profile)
    setToken(authData.token)

    // Pré-carrega e hidrata no cache o usuário ERP com perfil expandido
    try {
      const u = await pb
        .collection('usuarios')
        .getFirstListItem(`auth_user_id = '${authData.record.id}'`, {
          expand: 'perfil_id,empresa_padrao_id',
          requestKey: null,
        })
      if (u) {
        localStorage.setItem('erp_usuario_logado_cache', JSON.stringify(u))
      }
    } catch {
      // não bloqueia o login
    }

    return profile
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken('')
  }

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    return await pb.collection('users').requestPasswordReset(email.trim())
  }

  const confirmPasswordReset = async (
    resetToken: string,
    password: string,
    passwordConfirm: string,
  ): Promise<boolean> => {
    return await pb.collection('users').confirmPasswordReset(resetToken, password, passwordConfirm)
  }

  const confirmVerification = async (verificationToken: string): Promise<boolean> => {
    return await pb.collection('users').confirmVerification(verificationToken)
  }

  const confirmEmailChange = async (changeToken: string, password: string): Promise<boolean> => {
    return await pb.collection('users').confirmEmailChange(changeToken, password)
  }

  const refreshUser = async () => {
    if (pb.authStore.isValid) {
      try {
        const authData = await pb.collection('users').authRefresh()
        setUser(mapRecordToUser(authData.record))
      } catch {
        // Falha no refresh mantém estado até logout manual
      }
    }
  }

  // isAuthenticated derivado de user/token (mantido fora do state para não criar
  // ciclos de atualização em cascata).
  const isAuthenticated = !!user && !!token

  // Value memoizado: sem isso, um objeto NOVO de contexto a cada render do provider
  // re-renderiza todos os consumidores (guards, Header, páginas) em cascata a cada ciclo
  // de commit dos componentes Radix (refs/setState internos do Presence), alimentando o
  // loop "Maximum update depth exceeded" — mesmo motivo já tratado no PermissoesContext.
  const contextValue = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated,
      login,
      logout,
      requestPasswordReset,
      confirmPasswordReset,
      confirmVerification,
      confirmEmailChange,
      refreshUser,
    }),
    [
      user,
      token,
      isLoading,
      isAuthenticated,
      login,
      logout,
      requestPasswordReset,
      confirmPasswordReset,
      confirmVerification,
      confirmEmailChange,
      refreshUser,
    ],
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
