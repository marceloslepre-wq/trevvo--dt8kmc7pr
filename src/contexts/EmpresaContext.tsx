import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { Empresa, listarEmpresasAcessiveis, listarEmpresasAtivas } from '@/services/empresas'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { obterEmpresasDoUsuario } from '@/services/usuarios'
import pb from '@/lib/pocketbase/client'

interface AssinanteTenancy {
  id: string
  numero_licenca: string
  nome: string
  documento?: string
  email_contato?: string
  telefone?: string
  status: string
  origem: boolean
}

interface EmpresaContextType {
  empresas: Empresa[]
  empresaAtiva: Empresa | null
  assinanteId: string | null
  assinante: AssinanteTenancy | null
  carregando: boolean
  isMaster: boolean
  modoMaster: boolean
  selecionarEmpresa: (empresaId: string) => void
  recarregarEmpresas: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined)

const CHAVE_STORAGE = 'erp_empresa_ativa_id'

/**
 * Lista de empresas acessíveis ao usuário logado (multiempresa).
 * Complementa useEmpresaAtiva (que traz só a empresa ativa do seletor do topo).
 */
export const useEmpresasAcessiveis = () => {
  const ctx = useContext(EmpresaContext)
  if (!ctx) {
    throw new Error('useEmpresasAcessiveis deve ser usado dentro de um EmpresaProvider')
  }
  return { empresasAcessiveis: ctx.empresas }
}

export const EmpresaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaAtiva, setEmpresaAtiva] = useState<Empresa | null>(null)
  const [assinante, setAssinante] = useState<AssinanteTenancy | null>(null)
  const [isMaster, setIsMaster] = useState<boolean>(() => {
    return Boolean(pb.authStore.record && (pb.authStore.record as any).tipo === 'master')
  })
  const [modoMaster, setModoMaster] = useState<boolean>(false)
  const [carregando, setCarregando] = useState(false)

  const { usuarioERP, administrador, carregando: carregandoPerms } = usePermissoes()

  const recarregarEmpresas = useCallback(async () => {
    if (!isAuthenticated) {
      setEmpresas([])
      setEmpresaAtiva(null)
      return
    }

    if (carregandoPerms) {
      return
    }

    try {
      setCarregando(true)

      // Obter dados de tenancy se ainda não carregados
      try {
        const respTenancy = await pb.send('/backend/v1/tenancy/me', { method: 'GET' })
        if (respTenancy) {
          if (respTenancy.assinante) {
            setAssinante(respTenancy.assinante)
          }
          if (typeof respTenancy.is_master === 'boolean') {
            setIsMaster(respTenancy.is_master)
          }
          if (typeof respTenancy.modo_master === 'boolean') {
            setModoMaster(respTenancy.modo_master)
          } else {
            setModoMaster(false)
          }
        }
      } catch (errTen) {
        console.warn('Não foi possível obter dados de tenancy/me:', errTen)
        if (pb.authStore.record) {
          setIsMaster((pb.authStore.record as any).tipo === 'master')
        }
        setModoMaster(false)
      }

      // Etapa 9 (Multi-tenant): Consome o endpoint backend /backend/v1/empresas/acessiveis,
      // onde o backend já aplica a governança estrita de assinante (empresasDoUsuario):
      // - Administrador vê apenas as empresas ativas do PRÓPRIO assinante;
      // - Demais usuários veem apenas as empresas vinculadas e ativas do mesmo assinante.
      let listaFiltrada: Empresa[] = []
      try {
        listaFiltrada = await listarEmpresasAcessiveis()
      } catch (errAcessiveis) {
        console.warn(
          'Falha em listarEmpresasAcessiveis, aplicando fallback resiliente:',
          errAcessiveis,
        )
        const todasAtivas = await listarEmpresasAtivas()
        if (administrador) {
          listaFiltrada = todasAtivas
        } else if (usuarioERP) {
          const permitidas = await obterEmpresasDoUsuario(usuarioERP.id)
          const permitidasIds = new Set(permitidas.filter((p) => p.ativo).map((p) => p.empresa_id))
          listaFiltrada = todasAtivas.filter((e) => permitidasIds.has(e.id))
        } else {
          listaFiltrada = todasAtivas
        }
      }

      setEmpresas(listaFiltrada)

      if (listaFiltrada.length === 0) {
        setEmpresaAtiva(null)
        localStorage.removeItem(CHAVE_STORAGE)
        return
      }

      // Tenta recuperar do localStorage
      const salvoId = localStorage.getItem(CHAVE_STORAGE)
      const encontrada = listaFiltrada.find((e) => e.id === salvoId)

      if (encontrada) {
        setEmpresaAtiva(encontrada)
      } else {
        // Se usuário tem empresa_padrao_id configurada e autorizada
        if (usuarioERP?.empresa_padrao_id) {
          const padrao = listaFiltrada.find((e) => e.id === usuarioERP.empresa_padrao_id)
          if (padrao) {
            setEmpresaAtiva(padrao)
            localStorage.setItem(CHAVE_STORAGE, padrao.id)
            return
          }
        }

        // Seleciona a Matriz por padrão, ou a primeira disponível
        const matriz = listaFiltrada.find((e) => e.tipo === 'Matriz') || listaFiltrada[0]
        setEmpresaAtiva(matriz)
        localStorage.setItem(CHAVE_STORAGE, matriz.id)
      }
    } catch (err) {
      console.error('Erro ao carregar empresas ativas:', err)
    } finally {
      setCarregando(false)
    }
  }, [isAuthenticated, administrador, usuarioERP, carregandoPerms])

  useEffect(() => {
    recarregarEmpresas()
  }, [recarregarEmpresas])

  // useCallback: sem isso, a função seria recriada a cada render e anularia o
  // useMemo do value abaixo (uma dependência que muda sempre derruba a memoização).
  const selecionarEmpresa = useCallback(
    (empresaId: string) => {
      const escolhida = empresas.find((e) => e.id === empresaId)
      if (escolhida) {
        setEmpresaAtiva(escolhida)
        localStorage.setItem(CHAVE_STORAGE, escolhida.id)
      }
    },
    [empresas],
  )

  const assinanteIdCalculado = useMemo(() => {
    return (
      assinante?.id ||
      usuarioERP?.assinante_id ||
      empresaAtiva?.assinante_id ||
      (empresas.length > 0 ? empresas[0].assinante_id : null) ||
      null
    )
  }, [assinante, usuarioERP, empresaAtiva, empresas])

  // Value memoizado: sem isso, um objeto NOVO de contexto a cada render re-renderiza
  // todos os consumidores (Header, guards e páginas) em cascata a cada ciclo de commit
  // dos componentes Radix (refs/setState internos), alimentando o loop
  // "Maximum update depth exceeded" — mesmo motivo já tratado no PermissoesContext.
  const contextValue = useMemo(
    () => ({
      empresas,
      empresaAtiva,
      assinanteId: assinanteIdCalculado,
      assinante,
      carregando,
      isMaster,
      modoMaster,
      selecionarEmpresa,
      recarregarEmpresas,
    }),
    [
      empresas,
      empresaAtiva,
      assinanteIdCalculado,
      assinante,
      carregando,
      isMaster,
      modoMaster,
      selecionarEmpresa,
      recarregarEmpresas,
    ],
  )

  return <EmpresaContext.Provider value={contextValue}>{children}</EmpresaContext.Provider>
}

export const useEmpresaAtiva = () => {
  const ctx = useContext(EmpresaContext)
  if (!ctx) {
    throw new Error('useEmpresaAtiva deve ser usado dentro de um EmpresaProvider')
  }
  return ctx
}
