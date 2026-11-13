/**
 * TABELA ÚNICA DE ROTAS x MÓDULOS (rodada: permissões no menu e nas rotas)
 *
 * Fonte única de verdade usada para:
 *  (a) montar o menu lateral (Sidebar) — cada grupo aparece UMA vez, com só os itens filtrados;
 *  (b) proteger as rotas (PermissaoGuard) — abrir URL sem pode_ver mostra "Acesso negado";
 *  (c) mostrar/ocultar botões Novo/Editar/Excluir (podeCriar/ podeAcaoRotas).
 *
 * Requisito do PROJETO_ERP.md: o módulo precisa existir na lista fixa de módulos do select
 * "modulo" da collection "permissoes".
 */
import {
  LayoutDashboard,
  Users,
  Truck,
  Box,
  Terminal,
  Settings,
  Percent,
  CreditCard,
  ClipboardCheck,
  ShoppingBag,
  ShoppingCart,
  PackageSearch,
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  RotateCcw,
  FileText,
  Receipt,
  Landmark,
  FileSpreadsheet,
  ArrowDownUp,
  BarChart3,
  Calculator,
  UserCog,
  ShieldCheck,
  Building2,
  Layers,
  ListTree,
  Ruler,
  Tags,
  Shapes,
  GitCompare,
  KeyRound,
  Database,
  FileClock,
  FileCheck2,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

export type AcaoMinima = 'ver' | 'criar' | 'editar' | 'excluir'

export interface ItemRota {
  /** Caminho da rota (o mesmo registrado no App.tsx) */
  rota: string
  /** Rótulo exibido no menu lateral */
  rotulo: string
  /** Grupo do menu lateral */
  grupo: string
  /** Módulo da collection permissoes (lista fixa do select "modulo") */
  modulo: string
  /** Ação mínima exigida para o item aparecer no menu/rota abrir */
  acaoMinima: AcaoMinima
  /** Ordem do item dentro do grupo */
  ordem: number
  icone: LucideIcon
  /** Esconde do menu (rota de detalhe/edição, acessível pela lista) */
  ocultoNoMenu?: boolean
}

/**
 * MÓDULOS FIXOS — mesmos valores do select "modulo" da collection permissoes
 * (schema). A tabela de rotas só pode usar módulos desta lista.
 */
export const MODULOS_FIXOS = [
  'dashboard',
  'vendas',
  'pdv',
  'caixa',
  'clientes',
  'produtos',
  'estoque',
  'compras',
  'financeiro',
  'fiscal',
  'relatorios',
  'configuracoes',
  'usuarios',
  'perfis_acesso',
  'empresas',
  'tabelas_fiscais',
  'cfop',
  'ncm',
  'cest',
  'matriz_icms',
  'perfis_tributarios',
  'regras_ncm',
  'codigos_fiscais',
] as const

/** Ordem fixa dos grupos do menu lateral (evita grupos duplicados/intercalados) */
export const GRUPOS_MENU: { nome: string; ordem: number }[] = [
  { nome: 'Painel', ordem: 1 },
  { nome: 'Vendas e PDV', ordem: 2 },
  { nome: 'Estoque', ordem: 3 },
  { nome: 'Compras', ordem: 4 },
  { nome: 'Financeiro', ordem: 5 },
  { nome: 'Fiscal', ordem: 6 },
  { nome: 'Relatórios', ordem: 7 },
  { nome: 'Cadastros', ordem: 8 },
  { nome: 'Configurações', ordem: 9 },
]

/**
 * A TABELA. Cada item do menu (e cada rota protegida) aparece aqui uma única vez.
 * Terminais/Config. de vendas/Comissões ficam no módulo "configuracoes" (não em "vendas").
 * Conferência fiscal fica em "tabelas_fiscais" e Condições de pagamento em "configuracoes".
 */
export const ROTAS: ItemRota[] = [
  // ---------- Painel ----------
  {
    rota: '/',
    rotulo: 'Painel',
    grupo: 'Painel',
    modulo: 'dashboard',
    acaoMinima: 'ver',
    ordem: 1,
    icone: LayoutDashboard,
  },
  {
    rota: '/painel',
    rotulo: 'Painel',
    grupo: 'Painel',
    modulo: 'dashboard',
    acaoMinima: 'ver',
    ordem: 2,
    ocultoNoMenu: true,
  },

  // ---------- Vendas e PDV ----------
  {
    rota: '/vendas/pdv',
    rotulo: 'PDV',
    grupo: 'Vendas e PDV',
    modulo: 'pdv',
    acaoMinima: 'ver',
    ordem: 1,
    icone: ShoppingBag,
  },
  {
    rota: '/vendas/caixa',
    rotulo: 'Controle de Caixa',
    grupo: 'Vendas e PDV',
    modulo: 'caixa',
    acaoMinima: 'ver',
    ordem: 2,
    icone: CreditCard,
  },
  {
    rota: '/vendas/pedidos',
    rotulo: 'Orçamentos e Pedidos',
    grupo: 'Vendas e PDV',
    modulo: 'vendas',
    acaoMinima: 'ver',
    ordem: 3,
    icone: ShoppingCart,
  },
  {
    rota: '/vendas/pedidos/novo',
    rotulo: 'Novo Pedido',
    grupo: 'Vendas e PDV',
    modulo: 'vendas',
    acaoMinima: 'criar',
    ordem: 4,
    ocultoNoMenu: true,
  },
  {
    rota: '/vendas/pedidos/:id/editar',
    rotulo: 'Editar Pedido',
    grupo: 'Vendas e PDV',
    modulo: 'vendas',
    acaoMinima: 'editar',
    ordem: 5,
    ocultoNoMenu: true,
  },
  {
    rota: '/vendas/trocas',
    rotulo: 'Trocas e Devoluções',
    grupo: 'Vendas e PDV',
    modulo: 'vendas',
    acaoMinima: 'ver',
    ordem: 6,
    icone: RotateCcw,
  },

  // ---------- Estoque ----------
  {
    rota: '/estoque/posicao',
    rotulo: 'Posição de Estoque',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 1,
    icone: PackageSearch,
  },
  {
    rota: '/estoque/lancamentos',
    rotulo: 'Lançamentos Manuais',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'criar',
    ordem: 2,
    icone: ArrowLeftRight,
  },
  {
    rota: '/estoque/transferencias',
    rotulo: 'Transferências',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 3,
    icone: Boxes,
  },
  {
    rota: '/estoque/transferencias/nova',
    rotulo: 'Nova Transferência',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'criar',
    ordem: 4,
    ocultoNoMenu: true,
  },
  {
    rota: '/estoque/lotes',
    rotulo: 'Lotes e Validades',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 5,
    icone: CalendarClock,
  },
  {
    rota: '/estoque/inventarios',
    rotulo: 'Inventários',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 6,
    icone: ClipboardList,
  },
  {
    rota: '/estoque/kardex',
    rotulo: 'Kardex',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 7,
    icone: FileClock,
  },
  {
    rota: '/estoque/sugestao-compra',
    rotulo: 'Sugestão de Compra',
    grupo: 'Estoque',
    modulo: 'estoque',
    acaoMinima: 'ver',
    ordem: 8,
    icone: ClipboardCheck,
  },

  // ---------- Compras ----------
  {
    rota: '/compras/pedidos',
    rotulo: 'Pedidos de Compra',
    grupo: 'Compras',
    modulo: 'compras',
    acaoMinima: 'ver',
    ordem: 1,
    icone: Receipt,
  },
  {
    rota: '/compras/pedidos/novo',
    rotulo: 'Novo Pedido de Compra',
    grupo: 'Compras',
    modulo: 'compras',
    acaoMinima: 'criar',
    ordem: 2,
    ocultoNoMenu: true,
  },
  {
    rota: '/compras/notas-entrada',
    rotulo: 'Notas de Entrada',
    grupo: 'Compras',
    modulo: 'compras',
    acaoMinima: 'ver',
    ordem: 3,
    icone: FileText,
  },
  {
    rota: '/compras/livro-entradas',
    rotulo: 'Livro de Entradas',
    grupo: 'Compras',
    modulo: 'compras',
    acaoMinima: 'ver',
    ordem: 4,
    icone: FileSpreadsheet,
  },

  // ---------- Financeiro ----------
  {
    rota: '/financeiro/contas-pagar',
    rotulo: 'Contas a Pagar',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 1,
    icone: ArrowDownUp,
  },
  {
    rota: '/financeiro/contas-receber',
    rotulo: 'Contas a Receber',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 2,
    icone: ArrowDownUp,
  },
  {
    rota: '/financeiro/fluxo-caixa',
    rotulo: 'Fluxo de Caixa',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 3,
    icone: BarChart3,
  },
  {
    rota: '/financeiro/extrato',
    rotulo: 'Extrato Bancário',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 4,
    icone: Landmark,
  },
  {
    rota: '/financeiro/conciliacao',
    rotulo: 'Conciliação Bancária',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 5,
    icone: ArrowDownUp,
  },
  {
    rota: '/financeiro/inadimplencia',
    rotulo: 'Inadimplência',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 6,
    icone: FileCheck2,
  },
  {
    rota: '/financeiro/dre',
    rotulo: 'DRE',
    grupo: 'Financeiro',
    modulo: 'financeiro',
    acaoMinima: 'ver',
    ordem: 7,
    icone: BarChart3,
  },

  // ---------- Fiscal ----------
  {
    rota: '/fiscal/documentos',
    rotulo: 'Documentos Fiscais',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 1,
    icone: FileText,
  },
  {
    rota: '/fiscal/livro-saidas',
    rotulo: 'Livro de Saídas',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 2,
    icone: FileSpreadsheet,
  },
  {
    rota: '/fiscal/resumo-icms',
    rotulo: 'Resumo ICMS',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 3,
    icone: Calculator,
  },
  {
    rota: '/fiscal/exportar-xmls',
    rotulo: 'Exportar XMLs',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 4,
    icone: FileText,
  },
  {
    rota: '/fiscal/inutilizacao',
    rotulo: 'Inutilização de Numeração',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 5,
    icone: FileText,
  },
  {
    rota: '/fiscal/intermediadores',
    rotulo: 'Intermediadores',
    grupo: 'Fiscal',
    modulo: 'fiscal',
    acaoMinima: 'ver',
    ordem: 6,
    icone: Globe,
  },

  // ---------- Relatórios ----------
  {
    rota: '/relatorios',
    rotulo: 'Central de Relatórios',
    grupo: 'Relatórios',
    modulo: 'relatorios',
    acaoMinima: 'ver',
    ordem: 1,
    icone: BarChart3,
  },

  // ---------- Cadastros ----------
  {
    rota: '/cadastros/clientes',
    rotulo: 'Clientes',
    grupo: 'Cadastros',
    modulo: 'clientes',
    acaoMinima: 'ver',
    ordem: 1,
    icone: Users,
  },
  {
    rota: '/cadastros/clientes/novo',
    rotulo: 'Novo Cliente',
    grupo: 'Cadastros',
    modulo: 'clientes',
    acaoMinima: 'criar',
    ordem: 2,
    ocultoNoMenu: true,
  },
  {
    rota: '/cadastros/clientes/:id/editar',
    rotulo: 'Editar Cliente',
    grupo: 'Cadastros',
    modulo: 'clientes',
    acaoMinima: 'editar',
    ordem: 3,
    ocultoNoMenu: true,
  },
  {
    rota: '/cadastros/fornecedores',
    rotulo: 'Fornecedores',
    grupo: 'Cadastros',
    modulo: 'produtos',
    acaoMinima: 'ver',
    ordem: 4,
    icone: Truck,
  },
  {
    rota: '/cadastros/produtos',
    rotulo: 'Produtos',
    grupo: 'Cadastros',
    modulo: 'produtos',
    acaoMinima: 'ver',
    ordem: 5,
    icone: Box,
  },
  {
    rota: '/cadastros/produtos/novo',
    rotulo: 'Novo Produto',
    grupo: 'Cadastros',
    modulo: 'produtos',
    acaoMinima: 'criar',
    ordem: 6,
    ocultoNoMenu: true,
  },
  {
    rota: '/cadastros/produtos/:id/editar',
    rotulo: 'Editar Produto',
    grupo: 'Cadastros',
    modulo: 'produtos',
    acaoMinima: 'editar',
    ordem: 7,
    ocultoNoMenu: true,
  },

  // ---------- Configurações ----------
  {
    rota: '/cadastros/conferencia-fiscal',
    rotulo: 'Conferência fiscal',
    grupo: 'Configurações',
    modulo: 'tabelas_fiscais',
    acaoMinima: 'editar',
    ordem: 1,
    icone: ClipboardCheck,
  },
  {
    rota: '/cadastros/condicoes-pagamento',
    rotulo: 'Condições de pagamento',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 2,
    icone: Percent,
  },
  {
    rota: '/vendas/terminais',
    rotulo: 'Terminais',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 3,
    icone: Terminal,
  },
  {
    rota: '/vendas/config',
    rotulo: 'Configurações de vendas',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 4,
    icone: Settings,
  },
  {
    rota: '/vendas/comissoes',
    rotulo: 'Comissões',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 5,
    icone: Percent,
  },
  {
    rota: '/configuracoes/geral',
    rotulo: 'Configurações gerais',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 6,
    icone: Settings,
  },
  {
    rota: '/configuracoes/fiscal',
    rotulo: 'Configuração fiscal',
    grupo: 'Configurações',
    modulo: 'configuracoes',
    acaoMinima: 'ver',
    ordem: 7,
    icone: Settings,
  },
  {
    rota: '/cadastros/usuarios',
    rotulo: 'Usuários',
    grupo: 'Configurações',
    modulo: 'usuarios',
    acaoMinima: 'ver',
    ordem: 8,
    icone: UserCog,
  },
  {
    rota: '/cadastros/usuarios/novo',
    rotulo: 'Novo Usuário',
    grupo: 'Configurações',
    modulo: 'usuarios',
    acaoMinima: 'criar',
    ordem: 9,
    ocultoNoMenu: true,
  },
  {
    rota: '/cadastros/usuarios/:id/editar',
    rotulo: 'Editar Usuário',
    grupo: 'Configurações',
    modulo: 'usuarios',
    acaoMinima: 'editar',
    ordem: 10,
    ocultoNoMenu: true,
  },
  {
    rota: '/cadastros/perfis-acesso',
    rotulo: 'Perfis de acesso',
    grupo: 'Configurações',
    modulo: 'perfis_acesso',
    acaoMinima: 'ver',
    ordem: 11,
    icone: ShieldCheck,
  },
  {
    rota: '/cadastros/empresas',
    rotulo: 'Empresas',
    grupo: 'Configurações',
    modulo: 'empresas',
    acaoMinima: 'ver',
    ordem: 12,
    icone: Building2,
  },
  {
    rota: '/tabelas-fiscais',
    rotulo: 'Tabelas fiscais',
    grupo: 'Configurações',
    modulo: 'tabelas_fiscais',
    acaoMinima: 'ver',
    ordem: 13,
    icone: Layers,
  },
  {
    rota: '/tabelas-fiscais/ncm',
    rotulo: 'NCM',
    grupo: 'Configurações',
    modulo: 'ncm',
    acaoMinima: 'ver',
    ordem: 14,
    icone: ListTree,
  },
  {
    rota: '/tabelas-fiscais/cest',
    rotulo: 'CEST',
    grupo: 'Configurações',
    modulo: 'cest',
    acaoMinima: 'ver',
    ordem: 15,
    icone: Tags,
  },
  {
    rota: '/tabelas-fiscais/cfop',
    rotulo: 'CFOP',
    grupo: 'Configurações',
    modulo: 'cfop',
    acaoMinima: 'ver',
    ordem: 16,
    icone: Shapes,
  },
  {
    rota: '/tabelas-fiscais/cfop-conversao',
    rotulo: 'Conversão de CFOP',
    grupo: 'Configurações',
    modulo: 'cfop',
    acaoMinima: 'ver',
    ordem: 17,
    icone: GitCompare,
  },
  {
    rota: '/tabelas-fiscais/perfis-tributarios',
    rotulo: 'Perfis tributários',
    grupo: 'Configurações',
    modulo: 'perfis_tributarios',
    acaoMinima: 'ver',
    ordem: 18,
    icone: KeyRound,
  },
  {
    rota: '/tabelas-fiscais/matriz-icms',
    rotulo: 'Matriz ICMS',
    grupo: 'Configurações',
    modulo: 'matriz_icms',
    acaoMinima: 'ver',
    ordem: 19,
    icone: Calculator,
  },
  {
    rota: '/tabelas-fiscais/regras-ncm',
    rotulo: 'Regras por NCM',
    grupo: 'Configurações',
    modulo: 'regras_ncm',
    acaoMinima: 'ver',
    ordem: 20,
    icone: ListTree,
  },
  {
    rota: '/tabelas-fiscais/codigos-fiscais',
    rotulo: 'Códigos fiscais',
    grupo: 'Configurações',
    modulo: 'codigos_fiscais',
    acaoMinima: 'ver',
    ordem: 21,
    icone: Database,
  },
]

/** Busca um item da tabela pelo caminho exato da rota */
export function buscarRota(rota: string): ItemRota | undefined {
  return ROTAS.find((r) => r.rota === rota)
}

/** Itens visíveis no menu, agrupados na ordem fixa de GRUPOS_MENU, sem duplicar grupo */
export function gruposFiltrados(temAcesso: (item: ItemRota) => boolean) {
  return GRUPOS_MENU.map((g) => ({
    ...g,
    itens: ROTAS.filter((r) => r.grupo === g.nome && !r.ocultoNoMenu && temAcesso(r)).sort(
      (a, b) => a.ordem - b.ordem,
    ),
  })).filter((g) => g.itens.length > 0)
}
