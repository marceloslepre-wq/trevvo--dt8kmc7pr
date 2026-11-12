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
  Monitor,
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
  ArrowLeftRight,
  Ruler,
  FileCode,
  FileCheck,
  Calculator,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  ClipboardCheck,
  BookOpen,
  AlertTriangle,
  RotateCcw,
  Award,
  Store,
  FileX2,
  FileArchive,
  Scale,
  SlidersHorizontal,
  Crown,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { ModuloSistema } from '@/services/perfis'

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
  modulo?: ModuloSistema
  adminOnly?: boolean
}

interface NavGroupItem {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  path?: string
  status?: 'active' | 'soon'
  modulo?: ModuloSistema
  adminOnly?: boolean
  masterOnly?: boolean
  items?: NavSubItem[]
}

const navItems: NavGroupItem[] = [
  {
    id: 'master-panel',
    title: 'Painel Master',
    icon: Crown,
    path: '/master',
    status: 'active',
    masterOnly: true,
  },
  {
    id: 'painel',
    title: 'Painel',
    path: '/painel',
    icon: LayoutDashboard,
    status: 'active',
    modulo: 'painel',
  },
  {
    id: 'painel-grupo',
    title: 'Painel do Grupo',
    path: '/painel-grupo',
    icon: Building,
    status: 'active',
    modulo: 'relatorios',
  },
  {
    id: 'cadastros',
    title: 'Cadastros',
    icon: FolderTree,
    status: 'active',
    items: [
      {
        title: 'Empresa e filiais',
        path: '/cadastros/empresas',
        icon: Building,
        modulo: 'empresas',
      },
      { title: 'Usuários', path: '/cadastros/usuarios', icon: Users, modulo: 'usuarios' },
      {
        title: 'Perfis de acesso',
        path: '/cadastros/perfis-acesso',
        icon: ShieldCheck,
        modulo: 'perfis_acesso',
      },
      { title: 'Clientes', path: '/cadastros/clientes', icon: UserCheck, modulo: 'clientes' },
      {
        title: 'Fornecedores',
        path: '/cadastros/fornecedores',
        icon: Truck,
        modulo: 'fornecedores',
      },
      { title: 'Produtos', path: '/cadastros/produtos', icon: Box, modulo: 'produtos' },
      {
        title: 'Conferência fiscal',
        path: '/cadastros/produtos/conferencia',
        icon: FileCheck,
        modulo: 'produtos',
      },
      { title: 'Marcas', path: '/cadastros/marcas', icon: Tag, modulo: 'marcas' },
      {
        title: 'Grupos e categorias',
        path: '/cadastros/grupos-categorias',
        icon: Layers,
        modulo: 'grupos_categorias',
      },
      {
        title: 'Unidades de medida',
        path: '/cadastros/unidades-medida',
        icon: Ruler,
        modulo: 'unidades_medida',
      },
      {
        title: 'Condições de pagamento',
        path: '/cadastros/condicoes-pagamento',
        icon: CreditCard,
        modulo: 'condicoes_pagamento',
      },
      {
        title: 'Tabelas fiscais',
        path: '/cadastros/tabelas-fiscais',
        icon: FileCode,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'NCM',
        path: '/cadastros/tabelas-fiscais/ncm',
        icon: FileCheck,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'CEST',
        path: '/cadastros/tabelas-fiscais/cest',
        icon: Layers,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'CFOP',
        path: '/cadastros/tabelas-fiscais/cfop',
        icon: FileSpreadsheet,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'Conversão CFOP Entrada',
        path: '/cadastros/tabelas-fiscais/conversao-cfop',
        icon: ArrowLeftRight,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'Perfis tributários',
        path: '/cadastros/tabelas-fiscais/perfis',
        icon: Calculator,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'Regras fiscais por NCM',
        path: '/cadastros/tabelas-fiscais/regras-ncm',
        icon: FileCheck,
        modulo: 'tabelas_fiscais',
      },
      {
        title: 'Matriz ICMS Interestadual',
        path: '/cadastros/tabelas-fiscais/matriz-icms',
        icon: Calculator,
        modulo: 'tabelas_fiscais',
      },
    ],
  },
  {
    id: 'estoque',
    title: 'Estoque',
    icon: Package,
    status: 'active',
    modulo: 'estoque',
    items: [
      {
        title: 'Posição de estoque',
        path: '/estoque/posicao',
        icon: Box,
        modulo: 'estoque',
      },
      {
        title: 'Sugestão de compra',
        path: '/estoque/sugestao-compra',
        icon: ShoppingCart,
        modulo: 'estoque',
      },
      {
        title: 'Inventários',
        path: '/estoque/inventarios',
        icon: ClipboardCheck,
        modulo: 'estoque',
      },
      {
        title: 'Transferências',
        path: '/estoque/transferencias',
        icon: ArrowLeftRight,
        modulo: 'estoque',
      },
      {
        title: 'Kardex',
        path: '/estoque/kardex',
        icon: FileSpreadsheet,
        modulo: 'estoque',
      },
      {
        title: 'Lançamentos',
        path: '/estoque/lancamentos',
        icon: Layers,
        modulo: 'estoque',
      },
      {
        title: 'Lotes e Validade',
        path: '/estoque/lotes',
        icon: Tag,
        modulo: 'estoque',
      },
    ],
  },
  {
    id: 'compras',
    title: 'Compras e entrada de notas',
    icon: ShoppingCart,
    status: 'active',
    modulo: 'compras',
    items: [
      {
        title: 'Pedidos de compra',
        path: '/compras/pedidos',
        icon: ShoppingCart,
        modulo: 'compras',
      },
      {
        title: 'Notas de entrada',
        path: '/compras/notas-entrada',
        icon: FileText,
        modulo: 'notas_entrada',
      },
      {
        title: 'Itens comprados',
        path: '/compras/itens-comprados',
        icon: Package,
        modulo: 'compras',
      },
      {
        title: 'Livro de entradas',
        path: '/compras/livro-entradas',
        icon: BookOpen,
        modulo: 'notas_entrada',
      },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    icon: DollarSign,
    status: 'active',
    items: [
      {
        title: 'Contas a pagar',
        path: '/financeiro/contas-pagar',
        icon: DollarSign,
        modulo: 'financeiro_pagar',
      },
      {
        title: 'Contas a receber',
        path: '/financeiro/receber',
        icon: TrendingUp,
        modulo: 'financeiro_receber',
      },
      {
        title: 'Resultado (DRE)',
        path: '/financeiro/dre',
        icon: FileText,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Fluxo de caixa',
        path: '/financeiro/fluxo-caixa',
        icon: TrendingUp,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Inadimplência',
        path: '/financeiro/inadimplencia',
        icon: AlertTriangle,
        modulo: 'financeiro_receber',
      },
      {
        title: 'Bancos e caixas',
        path: '/financeiro/bancos',
        icon: Building,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Conciliação',
        path: '/financeiro/conciliacao',
        icon: Building,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Plano de contas',
        path: '/financeiro/cadastros/plano-contas',
        icon: FolderTree,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Centros de custo',
        path: '/financeiro/cadastros/centros-custo',
        icon: Tag,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Contas bancárias e caixas',
        path: '/financeiro/cadastros/contas-bancarias',
        icon: Building,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Formas de pagamento',
        path: '/financeiro/cadastros/formas-pagamento',
        icon: CreditCard,
        modulo: 'financeiro_bancos',
      },
      {
        title: 'Configurações financeiras',
        path: '/financeiro/cadastros/configuracoes',
        icon: Settings,
        modulo: 'financeiro_bancos',
      },
    ],
  },
  {
    id: 'vendas',
    title: 'Vendas e PDV',
    icon: TrendingUp,
    status: 'active',
    items: [
      {
        title: 'PDV (Frente de Caixa)',
        path: '/vendas/pdv',
        icon: Monitor,
        modulo: 'pdv',
      },
      {
        title: 'Orçamentos e pedidos',
        path: '/vendas/pedidos',
        icon: FileText,
        modulo: 'vendas',
      },
      {
        title: 'Trocas e devoluções',
        path: '/vendas/trocas',
        icon: RotateCcw,
        modulo: 'vendas',
      },
      {
        title: 'Caixa',
        path: '/vendas/caixa',
        icon: Receipt,
        modulo: 'caixa',
      },
      {
        title: 'Terminais',
        path: '/vendas/terminais',
        icon: Monitor,
        modulo: 'caixa',
      },
      {
        title: 'Comissões',
        path: '/vendas/comissoes',
        icon: Award,
        modulo: 'vendas',
      },
      {
        title: 'Consultas',
        path: '/vendas/consultas',
        icon: BarChart3,
        modulo: 'vendas',
      },
      {
        title: 'Configurações de vendas',
        path: '/vendas/configuracoes',
        icon: Settings,
        modulo: 'vendas',
      },
    ],
  },
  {
    id: 'fiscal',
    title: 'Fiscal',
    icon: Receipt,
    status: 'active',
    modulo: 'notas_saida',
    items: [
      {
        title: 'Configuração de emissão',
        path: '/fiscal/configuracoes',
        icon: Settings,
        modulo: 'notas_saida',
      },
      {
        title: 'Documentos fiscais',
        path: '/fiscal/documentos',
        icon: FileText,
        modulo: 'notas_saida',
      },
      {
        title: 'Intermediadores',
        path: '/fiscal/intermediadores',
        icon: Store,
        modulo: 'notas_saida',
      },
      {
        title: 'Inutilização',
        path: '/fiscal/inutilizacao',
        icon: FileX2,
        adminOnly: true,
      },
      {
        title: 'Exportar XMLs',
        path: '/fiscal/exportar-xmls',
        icon: FileArchive,
        modulo: 'notas_saida',
      },
      {
        title: 'SPED Fiscal (EFD)',
        path: '/fiscal/sped',
        icon: FileSpreadsheet,
        modulo: 'notas_saida',
      },
      {
        title: 'Configuração do SPED',
        path: '/fiscal/sped/configuracoes',
        icon: Settings,
        modulo: 'notas_saida',
      },
      {
        title: 'Livro de saídas',
        path: '/fiscal/livro-saidas',
        icon: BookOpen,
        modulo: 'notas_saida',
      },
      {
        title: 'Resumo do ICMS do mês',
        path: '/fiscal/resumo-icms',
        icon: Scale,
        modulo: 'notas_saida',
      },
    ],
  },
  {
    id: 'sped',
    title: 'SPED Fiscal',
    path: '/fiscal/sped',
    icon: FileSpreadsheet,
    status: 'active',
    modulo: 'sped',
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    icon: BarChart3,
    status: 'active',
    modulo: 'relatorios',
    items: [
      {
        title: 'Central de Relatórios',
        path: '/relatorios',
        icon: BarChart3,
        modulo: 'relatorios',
      },
      {
        title: 'Relatório Personalizado',
        path: '/relatorios/personalizado',
        icon: SlidersHorizontal,
        modulo: 'relatorios',
      },
    ],
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    icon: Settings,
    status: 'active',
    modulo: 'configuracoes',
    items: [
      {
        title: 'Geral',
        path: '/configuracoes/geral',
        icon: Settings,
        modulo: 'configuracoes',
      },
      {
        title: 'Fiscal',
        path: '/configuracoes/fiscal',
        icon: Receipt,
        modulo: 'config_fiscal',
      },
      {
        title: 'Mercado Livre',
        path: '/configuracoes/mercado-livre',
        icon: Store,
        modulo: 'configuracoes',
      },
      {
        title: 'Tray',
        path: '/configuracoes/tray',
        icon: Store,
        modulo: 'configuracoes',
      },
      {
        title: 'Log de Auditoria',
        path: '/configuracoes/auditoria',
        icon: FileText,
        adminOnly: true,
      },
      {
        title: 'Integridade do Estoque',
        path: '/configuracoes/integridade-estoque',
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        title: 'Integridade Financeira',
        path: '/configuracoes/integridade-financeiro',
        icon: ShieldCheck,
        adminOnly: true,
      },
    ],
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
  const isEstoqueActive = location.pathname.startsWith('/estoque')
  const isComprasActive = location.pathname.startsWith('/compras')
  const isFinanceiroActive = location.pathname.startsWith('/financeiro')
  const isVendasActive = location.pathname.startsWith('/vendas')
  const isFiscalActive = location.pathname.startsWith('/fiscal')
  const isRelatoriosActive = location.pathname.startsWith('/relatorios')
  const isConfiguracoesActive = location.pathname.startsWith('/configuracoes')
  const [cadastrosOpen, setCadastrosOpen] = useState(true)
  const [estoqueOpen, setEstoqueOpen] = useState(true)
  const [comprasOpen, setComprasOpen] = useState(true)
  const [financeiroOpen, setFinanceiroOpen] = useState(true)
  const [vendasOpen, setVendasOpen] = useState(true)
  const [fiscalOpen, setFiscalOpen] = useState(true)
  const [relatoriosOpen, setRelatoriosOpen] = useState(true)
  const [configuracoesOpen, setConfiguracoesOpen] = useState(true)

  const { pode, administrador, isMaster } = usePermissoes()
  const { empresas } = useEmpresaAtiva()
  const temMultiplasEmpresas = empresas.length > 1

  // Filtra itens visíveis conforme permissão
  const itensVisiveis = navItems
    .filter((group) => {
      // Regra 9.7a: Painel Master aparece EXCLUSIVAMENTE para o usuário master
      if (group.masterOnly && !isMaster) {
        return false
      }
      // Regra 8.5: Painel do Grupo só aparece se tiver permissão relatorios pode_ver E acesso a mais de 1 empresa
      if (group.id === 'painel-grupo') {
        if (!temMultiplasEmpresas) return false
        if (!pode('relatorios', 'ver') && !administrador) return false
      }
      return true
    })
    .map((group) => {
      // Se tiver subitens
      if (group.items) {
        const subFiltrados = group.items.filter((sub) => {
          if (sub.adminOnly && !administrador) return false
          if (sub.modulo && !pode(sub.modulo, 'ver')) return false
          return true
        })

        if (subFiltrados.length === 0) return null
        return {
          ...group,
          items: subFiltrados,
        }
      }

      // Item raiz direto
      if (group.masterOnly && !isMaster) return null
      if (group.adminOnly && !administrador) return null
      if (group.modulo && !pode(group.modulo, 'ver')) return null
      return group
    })
    .filter(Boolean) as NavGroupItem[]

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
          {itensVisiveis.map((item) => {
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

            // Grupo com subitens (ex: Cadastros, Estoque, Compras, Configurações)
            if (item.items) {
              const isGroupActive =
                item.id === 'cadastros'
                  ? isCadastrosActive
                  : item.id === 'estoque'
                    ? isEstoqueActive
                    : item.id === 'compras'
                      ? isComprasActive
                      : item.id === 'financeiro'
                        ? isFinanceiroActive
                        : item.id === 'vendas'
                          ? isVendasActive
                          : item.id === 'fiscal'
                            ? isFiscalActive
                            : item.id === 'relatorios'
                              ? isRelatoriosActive
                              : isConfiguracoesActive
              const isOpen =
                item.id === 'cadastros'
                  ? cadastrosOpen
                  : item.id === 'estoque'
                    ? estoqueOpen
                    : item.id === 'compras'
                      ? comprasOpen
                      : item.id === 'financeiro'
                        ? financeiroOpen
                        : item.id === 'vendas'
                          ? vendasOpen
                          : item.id === 'fiscal'
                            ? fiscalOpen
                            : item.id === 'relatorios'
                              ? relatoriosOpen
                              : configuracoesOpen
              const setOpen =
                item.id === 'cadastros'
                  ? setCadastrosOpen
                  : item.id === 'estoque'
                    ? setEstoqueOpen
                    : item.id === 'compras'
                      ? setComprasOpen
                      : item.id === 'financeiro'
                        ? setFinanceiroOpen
                        : item.id === 'vendas'
                          ? setVendasOpen
                          : item.id === 'fiscal'
                            ? setFiscalOpen
                            : item.id === 'relatorios'
                              ? setRelatoriosOpen
                              : setConfiguracoesOpen

              if (isCollapsed) {
                return (
                  <Tooltip key={item.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          onToggleCollapse()
                          setOpen(true)
                        }}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                          isGroupActive
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
                    onClick={() => setOpen(!isOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                      isGroupActive
                        ? 'text-blue-700 bg-blue-50/70 font-semibold'
                        : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        size={18}
                        className={isGroupActive ? 'text-blue-600' : 'text-slate-500'}
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
