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
  FileSpreadsheet,
  BarChart3,
  Settings,
  ChevronDown,
  Building,
  Users,
  ShieldCheck,
  UserCheck,
  Truck,
  Box,
  Tag,
  Layers,
  Ruler,
  FileCode,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

interface NavSubItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

interface NavGroupItem {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  path?: string
  status?: 'active' | 'soon'
  items?: NavSubItem[]
}

const navItems: NavGroupItem[] = [
  {
    id: 'painel',
    title: 'Painel',
    path: '/painel',
    icon: LayoutDashboard,
    status: 'active',
  },
  {
    id: 'cadastros',
    title: 'Cadastros',
    icon: FolderTree,
    status: 'active',
    items: [
      { title: 'Empresa e filiais', path: '/cadastros/empresas', icon: Building },
      { title: 'Usuários', path: '/cadastros/usuarios', icon: Users },
      { title: 'Perfis de acesso', path: '/cadastros/perfis-acesso', icon: ShieldCheck },
      { title: 'Clientes', path: '/cadastros/clientes', icon: UserCheck },
      { title: 'Fornecedores', path: '/cadastros/fornecedores', icon: Truck },
      { title: 'Produtos', path: '/cadastros/produtos', icon: Box },
      { title: 'Marcas', path: '/cadastros/marcas', icon: Tag },
      { title: 'Grupos e categorias', path: '/cadastros/grupos-categorias', icon: Layers },
      { title: 'Unidades de medida', path: '/cadastros/unidades-medida', icon: Ruler },
      { title: 'Tabelas fiscais', path: '/cadastros/tabelas-fiscais', icon: FileCode },
    ],
  },
  {
    id: 'estoque',
    title: 'Estoque',
    icon: Package,
    status: 'soon',
  },
  {
    id: 'compras',
    title: 'Compras e entrada de notas',
    icon: ShoppingCart,
    status: 'soon',
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    icon: DollarSign,
    status: 'soon',
  },
  {
    id: 'vendas',
    title: 'Vendas, PDV e caixa',
    icon: TrendingUp,
    status: 'soon',
  },
  {
    id: 'fiscal',
    title: 'Fiscal: NF-e e NFC-e',
    icon: Receipt,
    status: 'soon',
  },
  {
    id: 'sped',
    title: 'SPED Fiscal',
    icon: FileSpreadsheet,
    status: 'soon',
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    icon: BarChart3,
    status: 'soon',
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    path: '/configuracoes',
    icon: Settings,
    status: 'active',
  },
]

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation()
  const isCadastrosActive = location.pathname.startsWith('/cadastros')
  const [cadastrosOpen, setCadastrosOpen] = useState(true)

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
          {navItems.map((item) => {
            const Icon = item.icon
            const isSoon = item.status === 'soon'

            // Item 'Em breve' desabilitado
            if (isSoon) {
              const disabledContent = (
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 cursor-not-allowed select-none ${
                    isCollapsed ? 'justify-center' : 'justify-between'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className="flex-shrink-0 text-slate-400" />
                    {!isCollapsed && (
                      <span className="text-xs font-medium truncate text-slate-400">
                        {item.title}
                      </span>
                    )}
                  </div>
                  {!isCollapsed && (
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase px-1.5 py-0 font-semibold bg-slate-100 text-slate-400 border-slate-200 flex-shrink-0"
                    >
                      Em breve
                    </Badge>
                  )}
                </div>
              )

              if (isCollapsed) {
                return (
                  <Tooltip key={item.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div>{disabledContent}</div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-normal">
                      <span>{item.title}</span>
                      <span className="ml-1.5 text-slate-400 font-semibold">(Em breve)</span>
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return <div key={item.id}>{disabledContent}</div>
            }

            // Grupo com subitens (ex: Cadastros)
            if (item.items) {
              const isOpen = cadastrosOpen

              if (isCollapsed) {
                return (
                  <Tooltip key={item.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          onToggleCollapse()
                          setCadastrosOpen(true)
                        }}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                          isCadastrosActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-200/60'
                        }`}
                      >
                        <Icon size={18} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <div key={item.id} className="space-y-0.5">
                  <button
                    onClick={() => setCadastrosOpen(!isOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                      isCadastrosActive
                        ? 'text-blue-700 bg-blue-50/70 font-semibold'
                        : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        size={18}
                        className={isCadastrosActive ? 'text-blue-600' : 'text-slate-500'}
                      />
                      <span>{item.title}</span>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`text-slate-400 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l border-slate-200 ml-5 my-1">
                      {item.items.map((sub) => {
                        const SubIcon = sub.icon
                        return (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
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
                            <SubIcon size={14} className="flex-shrink-0" />
                            <span className="truncate">{sub.title}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // Item funcional simples (Painel, Configurações)
            if (isCollapsed) {
              return (
                <Tooltip key={item.id} delayDuration={150}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.path!}
                      className={({ isActive }) =>
                        `flex items-center justify-center p-2 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`
                      }
                    >
                      <Icon size={18} />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return (
              <NavLink
                key={item.id}
                to={item.path!}
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
                <Icon size={18} className="flex-shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
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
