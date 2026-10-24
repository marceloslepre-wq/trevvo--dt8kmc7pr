import React from 'react'
import {
  TrendingUp,
  Award,
  Package,
  Layers,
  Tag,
  ShoppingCart,
  BookOpen,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  BarChart3,
  FileText,
} from 'lucide-react'
import { ModuloSistema } from '@/services/perfis'

export type CategoriaRelatorio = 'Vendas' | 'Estoque' | 'Compras' | 'Financeiro' | 'Fiscal'

export interface ItemRelatorioCatalogo {
  id: string
  nome: string
  descricao: string
  rota: string
  modulo: ModuloSistema
  categoria: CategoriaRelatorio
  icone: React.ComponentType<{ className?: string; size?: number }>
  novo?: boolean
  emBreve?: boolean
}

/**
 * Catálogo central de relatórios do ERP agrupados por assunto.
 * Permite que os próximos prompts da Etapa 8 acrescentem novos relatórios de forma declarativa.
 */
export const CATALOGO_RELATORIOS: ItemRelatorioCatalogo[] = [
  // ===================== VENDAS =====================
  {
    id: 'vendas_consultas',
    nome: 'Consultas de Vendas',
    descricao: 'Análise de vendas por período, faturamento, ticket médio, vendedores e curva ABC.',
    rota: '/vendas/consultas',
    modulo: 'vendas',
    categoria: 'Vendas',
    icone: BarChart3,
  },
  {
    id: 'vendas_comissoes',
    nome: 'Relatório de Comissões',
    descricao:
      'Apuração e acompanhamento de comissões por vendedor, período e status de liquidação.',
    rota: '/vendas/comissoes',
    modulo: 'vendas',
    categoria: 'Vendas',
    icone: Award,
  },

  // ===================== ESTOQUE =====================
  {
    id: 'estoque_posicao',
    nome: 'Posição de Estoque',
    descricao:
      'Saldos físicos atuais por produto, custos médios, valorização total e itens abaixo do mínimo.',
    rota: '/estoque/posicao',
    modulo: 'estoque',
    categoria: 'Estoque',
    icone: Package,
  },
  {
    id: 'estoque_kardex',
    nome: 'Extrato de Movimentações (Kardex)',
    descricao:
      'Histórico cronológico detalhado de entradas, saídas, transferências e ajustes por produto.',
    rota: '/estoque/kardex',
    modulo: 'estoque',
    categoria: 'Estoque',
    icone: Layers,
  },
  {
    id: 'estoque_lotes',
    nome: 'Lotes e Validades',
    descricao: 'Rastreabilidade de lotes, produtos a vencer, vencidos e quarentena de validade.',
    rota: '/estoque/lotes',
    modulo: 'estoque',
    categoria: 'Estoque',
    icone: Tag,
  },

  // ===================== COMPRAS =====================
  {
    id: 'compras_itens_comprados',
    nome: 'Itens Comprados',
    descricao:
      'Relatório analítico de mercadorias adquiridas por período, fornecedor e evolução de custos.',
    rota: '/compras/itens-comprados',
    modulo: 'compras',
    categoria: 'Compras',
    icone: ShoppingCart,
  },
  {
    id: 'compras_livro_entradas',
    nome: 'Livro de Registro de Entradas',
    descricao: 'Espelho contábil e fiscal de todas as notas de entrada e aquisições da empresa.',
    rota: '/compras/livro-entradas',
    modulo: 'notas_entrada',
    categoria: 'Compras',
    icone: BookOpen,
  },

  // ===================== FINANCEIRO =====================
  {
    id: 'financeiro_dre',
    nome: 'Demonstrativo do Resultado (DRE)',
    descricao: 'Resultado econômico por competência com receita bruta, deduções, CMV e despesas.',
    rota: '/financeiro/dre',
    modulo: 'financeiro_bancos',
    categoria: 'Financeiro',
    icone: FileText,
  },
  {
    id: 'financeiro_fluxo_caixa',
    nome: 'Fluxo de Caixa',
    descricao: 'Demonstrativo de entradas e saídas financeiras realizadas e projeções diárias.',
    rota: '/financeiro/fluxo-caixa',
    modulo: 'financeiro_bancos',
    categoria: 'Financeiro',
    icone: TrendingUp,
  },
  {
    id: 'financeiro_inadimplencia',
    nome: 'Relatório de Inadimplência',
    descricao:
      'Relação de clientes com títulos em atraso, aging de vencimento e valores pendentes.',
    rota: '/financeiro/inadimplencia',
    modulo: 'financeiro_receber',
    categoria: 'Financeiro',
    icone: AlertTriangle,
  },

  // ===================== FISCAL =====================
  {
    id: 'fiscal_sped',
    nome: 'SPED Fiscal (EFD ICMS/IPI)',
    descricao:
      'Geração, auditoria e conferência dos arquivos oficiais da escrituração fiscal digital.',
    rota: '/fiscal/sped',
    modulo: 'sped',
    categoria: 'Fiscal',
    icone: FileSpreadsheet,
  },
]

export const CATEGORIAS_RELATORIOS: {
  id: CategoriaRelatorio
  label: string
  descricao: string
}[] = [
  {
    id: 'Vendas',
    label: 'Vendas e Comercial',
    descricao: 'Faturamento, volume de vendas, comissões de atendentes e rentabilidade.',
  },
  {
    id: 'Estoque',
    label: 'Estoque e Suprimentos',
    descricao: 'Posição física, valorização do inventário, rastreabilidade de lotes e Kardex.',
  },
  {
    id: 'Compras',
    label: 'Compras e Fornecedores',
    descricao: 'Aquisição de mercadorias, conferência de custos e livros de escrituração.',
  },
  {
    id: 'Financeiro',
    label: 'Financeiro e Controladoria',
    descricao: 'Resultados econômicos (DRE), fluxo de caixa, títulos e inadimplência.',
  },
  {
    id: 'Fiscal',
    label: 'Fiscal e Obrigações Acessórias',
    descricao: 'SPED Fiscal EFD ICMS/IPI, conferência de apuração e documentos fiscais.',
  },
]
