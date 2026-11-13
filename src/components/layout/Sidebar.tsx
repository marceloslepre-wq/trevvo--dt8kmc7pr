import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderTree,
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Receipt,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Crown,
  type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { gruposFiltrados, type ItemRota } from '@/config/tabelaRotas'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

/** Ícone do CABEÇALHO de cada grupo (mantém os ícones que o admin vê hoje) */
const ICONE_GRUPO: Record<string, LucideIcon> = {
  Painel: LayoutDashboard,
  'Vendas e PDV': TrendingUp,
  Estoque: Package,
  Compras: ShoppingCart,
  Financeiro: DollarSign,
  Fiscal: Receipt,
  Relatórios: BarChart3,
  Cadastros: FolderTree,
  Configurações: Settings,
}

/** Prefixo de URL que ativa o grupo no menu */
const PREFIXO_GRUPO: Record<string, string> = {
  Painel: '/painel',
  'Vendas e PDV': '/vendas',
  Estoque: '/estoque',
  Compras: '/compras',
  Financeiro: '/financeiro',
  Fiscal: '/fiscal',
  Relatórios: '/relatorios',
  Cadastros: '/cadastros',
  Configurações: '/configuracoes',
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation()
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})

  const { pode, administrador, isMaster } = usePermissoes()
  const { empresas } = useEmpresaAtiva()
  const temMultiplasEmpresas = empresas.length > 1

  // Regra 8.5: Painel do Grupo só com mais de 1 empresa (e permissão de relatórios)
  const temAcesso = (item: ItemRota): boolean => {
    if (item.rota === '/painel-grupo') {
      if (!temMultiplasEmpresas) return false
      return administrador || pode('relatorios', 'ver')
    }
    if (administrador) return true
    return pode(item.modulo, item.acaoMinima)
  }

  // Menu montado SÓ a partir da tabelaRotas: grupos únicos, itens deduplicados por rota
  const grupos = gruposFiltrados(temAcesso).map((g) => {
    const vistos = new Set<string>()
    const itens = g.itens.filter((i) => {
      if (vistos.has(i.rota)) return false
      vistos.add(i.rota)
      return true
    })
    return { ...g, itens }
  })

  const grupoAtivo = (nome: string): boolean => {
    const prefixo = PREFIXO_GRUPO[nome]
    if (!prefixo) return false
    return location.pathname === prefixo || location.pathname.startsWith(prefixo + '/')
  }

  const estaAberto = (nome: string): boolean => abertos[nome] ?? true

  const alternar = (nome: string) => {
    setAbertos((prev) => ({ ...prev, [nome]: !(prev[nome] ?? true) }))
  }

  const abrirGrupo = (nome: string) => {
    setAbertos((prev) => ({ ...prev, [nome]: true }))
  }

  const renderContent = (isMobileView = false) => {
    const isCollapsed = isMobileView ? false : collapsed

    return (
      <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 select-none">
        {/* Top Header Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white">
          <Logo collapsed={isCollapsed} size="sm" />
          {isMobileView && (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Fechar menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
          {/* Regra 9.7a: Painel Master aparece EXCLUSIVAMENTE para o usuário master */}
          {isMaster && (
            <NavLink
              to="/master"
              onClick={() => {
                if (isMobileView) onCloseMobile()
              }}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                }`
              }
            >
              <Crown size={18} className="flex-shrink-0" />
              {!isCollapsed && <span className="truncate">Painel Master</span>}
            </NavLink>
          )}

          {grupos.map((grupo) => {
            const Icone = ICONE_GRUPO[grupo.nome] ?? grupo.itens[0]?.icone
            const ativo = grupoAtivo(grupo.nome)
            const aberto = estaAberto(grupo.nome)

            // Grupo com um único item vira link direto (como Painel hoje)
            if (grupo.itens.length === 1 && !isCollapsed) {
              const item = grupo.itens[0]
              const ItemIcone = item.icone ?? Icone
              return (
                <NavLink
                  key={grupo.nome}
                  to={item.rota}
                  onClick={() => {
                    if (isMobileView) onCloseMobile()
                  }}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                    }`
                  }
                >
                  {ItemIcone && <ItemIcone size={18} className="flex-shrink-0" />}
                  <span className="truncate">{item.rotulo}</span>
                </NavLink>
              )
            }

            if (isCollapsed) {
              return (
                <Tooltip key={grupo.nome} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        onToggleCollapse()
                        abrirGrupo(grupo.nome)
                      }}
                      className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                        ativo ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-200/60'
                      }`}
                    >
                      {Icone && <Icone size={18} />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {grupo.nome}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return (
              <div key={grupo.nome} className="space-y-0.5">
                <button
                  onClick={() => alternar(grupo.nome)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                    ativo
                      ? 'text-blue-700 bg-blue-50/70 font-semibold'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {Icone && (
                      <Icone size={18} className={ativo ? 'text-blue-600' : 'text-slate-500'} />
                    )}
                    <span>{grupo.nome}</span>
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-slate-400 transition-transform duration-200 ${
                      aberto ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {aberto && (
                  <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l border-slate-200 ml-5 my-1">
                    {grupo.itens.map((item) => {
                      const SubIcone = item.icone
                      return (
                        <NavLink
                          key={item.rota}
                          to={item.rota}
                          onClick={() => {
                            if (isMobileView) onCloseMobile()
                          }}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                            }`
                          }
                        >
                          {SubIcone && <SubIcone size={14} className="flex-shrink-0" />}
                          <span className="truncate">{item.rotulo}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Rodapé do Menu com botão recolher/expandir (Desktop) */}
        {!isMobileView && (
          <div className="p-2 border-t border-slate-200 bg-white">
            <button
              onClick={onToggleCollapse}
              className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors`}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? (
                <ChevronRight size={16} />
              ) : (
                <>
                  <ChevronLeft size={16} />
                  <span>Recolher menu</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Sidebar Desktop e Tablet */}
      <aside
        className={`hidden md:block fixed top-0 left-0 bottom-0 z-30 transition-[width] duration-200 ease-in-out ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderContent(false)}
      </aside>

      {/* Drawer Mobile */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl">
            {renderContent(true)}
          </div>
        </div>
      )}
    </>
  )
}
