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
  Scale,
} from 'lucide-react'
import { ModuloSistema } from '@/services/perfis'

export type CategoriaRelatorio = 'Vendas' | 'Estoque' | 'Compras' | 'Financeiro' | 'Fiscal'

import { ChaveFiltroDeclaravel } from '@/services/relatorios'

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
  /** Catálogo de filtros declaráveis que este relatório utiliza (Prompt 8.0b) */
  filtrosPermitidos?: ChaveFiltroDeclaravel[]
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
    filtrosPermitidos: [
      'produto_grupos_categorias',
      'produto_marcas',
      'produto_produtos',
      'pessoas_clientes',
      'pessoas_vendedores',
      'pessoas_operadores_caixa',
      'pessoas_cliente_ufs',
      'pessoas_cliente_cidades',
      'vendas_tipos',
      'vendas_status',
      'vendas_formas_pagamento',
      'vendas_terminais_pdv',
      'vendas_intermediadores',
      'vendas_com_sem_nota',
      'datas_tipo_data',
    ],
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
    filtrosPermitidos: [
      'pessoas_vendedores',
      'vendas_status',
      'vendas_formas_pagamento',
      'datas_tipo_data',
    ],
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
    filtrosPermitidos: [
      'produto_grupos_categorias',
      'produto_marcas',
      'produto_produtos',
      'produto_fornecedores',
      'produto_ncms',
      'produto_situacao',
      'produto_so_fiscal_nao_revisado',
    ],
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
    filtrosPermitidos: [
      'produto_grupos_categorias',
      'produto_marcas',
      'produto_produtos',
      'datas_tipo_data',
    ],
  },
  {
    id: 'estoque_lotes',
    nome: 'Lotes e Validades',
    descricao: 'Rastreabilidade de lotes, produtos a vencer, vencidos e quarentena de validade.',
    rota: '/estoque/lotes',
    modulo: 'estoque',
    categoria: 'Estoque',
    icone: Tag,
    filtrosPermitidos: ['produto_grupos_categorias', 'produto_marcas', 'produto_produtos'],
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
    filtrosPermitidos: [
      'produto_grupos_categorias',
      'produto_marcas',
      'produto_produtos',
      'produto_fornecedores',
      'produto_ncms',
      'pessoas_fornecedores',
      'fiscal_cfops',
      'fiscal_csts_csosns',
      'datas_tipo_data',
    ],
  },
  {
    id: 'compras_livro_entradas',
    nome: 'Livro de Registro de Entradas',
    descricao: 'Espelho contábil e fiscal de todas as notas de entrada e aquisições da empresa.',
    rota: '/compras/livro-entradas',
    modulo: 'notas_entrada',
    categoria: 'Compras',
    icone: BookOpen,
    filtrosPermitidos: [
      'pessoas_fornecedores',
      'fiscal_modelos',
      'fiscal_cfops',
      'fiscal_csts_csosns',
      'fiscal_situacoes_nota',
      'datas_tipo_data',
    ],
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
    filtrosPermitidos: ['financeiro_plano_contas', 'financeiro_centros_custo', 'datas_tipo_data'],
  },
  {
    id: 'financeiro_fluxo_caixa',
    nome: 'Fluxo de Caixa',
    descricao: 'Demonstrativo de entradas e saídas financeiras realizadas e projeções diárias.',
    rota: '/financeiro/fluxo-caixa',
    modulo: 'financeiro_bancos',
    categoria: 'Financeiro',
    icone: TrendingUp,
    filtrosPermitidos: [
      'financeiro_contas_financeiras',
      'financeiro_plano_contas',
      'financeiro_centros_custo',
      'datas_tipo_data',
    ],
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
    filtrosPermitidos: [
      'pessoas_clientes',
      'pessoas_cliente_ufs',
      'pessoas_cliente_cidades',
      'financeiro_situacoes_titulo',
      'financeiro_origens_titulo',
      'datas_tipo_data',
    ],
  },

  // ===================== FISCAL =====================
  {
    id: 'fiscal_livro_saidas',
    nome: 'Livro de Registro de Saídas',
    descricao:
      'Escrituração das saídas, modelo P2/A, inutilizações, apuração por CFOP/CST e resumo interestadual por UF com CSV e impressão.',
    rota: '/fiscal/livro-saidas',
    modulo: 'notas_saida',
    categoria: 'Fiscal',
    icone: BookOpen,
    novo: true,
    filtrosPermitidos: [
      'fiscal_modelos',
      'fiscal_cfops',
      'fiscal_csts_csosns',
      'fiscal_situacoes_nota',
      'fiscal_ufs_destino',
      'pessoas_clientes',
      'datas_tipo_data',
    ],
  },
  {
    id: 'fiscal_resumo_icms',
    nome: 'Resumo da Apuração do ICMS do Mês',
    descricao:
      'Conferência gerencial de débitos das saídas contra créditos aproveitados das entradas/transferências e confronto com o Registro E110 do SPED.',
    rota: '/fiscal/resumo-icms',
    modulo: 'notas_saida',
    categoria: 'Fiscal',
    icone: Scale,
    novo: true,
    filtrosPermitidos: ['datas_tipo_data'],
  },
  {
    id: 'fiscal_sped',
    nome: 'SPED Fiscal (EFD ICMS/IPI)',
    descricao:
      'Geração, auditoria e conferência dos arquivos oficiais da escrituração fiscal digital.',
    rota: '/fiscal/sped',
    modulo: 'sped',
    categoria: 'Fiscal',
    icone: FileSpreadsheet,
    filtrosPermitidos: [
      'fiscal_modelos',
      'fiscal_cfops',
      'fiscal_csts_csosns',
      'fiscal_situacoes_nota',
      'fiscal_ufs_destino',
      'datas_tipo_data',
    ],
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
