import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Empresa, listarEmpresasAtivas } from '@/services/empresas'
import { useAuth } from '@/contexts/AuthContext'

interface EmpresaContextType {
  empresas: Empresa[]
  empresaAtiva: Empresa | null
  carregando: boolean
  selecionarEmpresa: (empresaId: string) => void
  recarregarEmpresas: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined)

const CHAVE_STORAGE = 'erp_empresa_ativa_id'

export const EmpresaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaAtiva, setEmpresaAtiva] = useState<Empresa | null>(null)
  const [carregando, setCarregando] = useState(false)

  const recarregarEmpresas = useCallback(async () => {
    if (!isAuthenticated) {
      setEmpresas([])
      setEmpresaAtiva(null)
      return
    }

    try {
      setCarregando(true)
      const lista = await listarEmpresasAtivas()
      setEmpresas(lista)

      if (lista.length === 0) {
        setEmpresaAtiva(null)
        localStorage.removeItem(CHAVE_STORAGE)
        return
      }

      // Tenta recuperar do localStorage
      const salvoId = localStorage.getItem(CHAVE_STORAGE)
      const encontrada = lista.find((e) => e.id === salvoId)

      if (encontrada) {
        setEmpresaAtiva(encontrada)
      } else {
        // Seleciona a Matriz por padrão, ou a primeira disponível
        const matriz = lista.find((e) => e.tipo === 'Matriz') || lista[0]
        setEmpresaAtiva(matriz)
        localStorage.setItem(CHAVE_STORAGE, matriz.id)
      }
    } catch (err) {
      console.error('Erro ao carregar empresas ativas:', err)
    } finally {
      setCarregando(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    recarregarEmpresas()
  }, [recarregarEmpresas])

  const selecionarEmpresa = (empresaId: string) => {
    const escolhida = empresas.find((e) => e.id === empresaId)
    if (escolhida) {
      setEmpresaAtiva(escolhida)
      localStorage.setItem(CHAVE_STORAGE, escolhida.id)
    }
  }

  return (
    <EmpresaContext.Provider
      value={{
        empresas,
        empresaAtiva,
        carregando,
        selecionarEmpresa,
        recarregarEmpresas,
      }}
    >
      {children}
    </EmpresaContext.Provider>
  )
}

export const useEmpresaAtiva = () => {
  const ctx = useContext(EmpresaContext)
  if (!ctx) {
    throw new Error('useEmpresaAtiva deve ser usado dentro de um EmpresaProvider')
  }
  return ctx
}
