import pb from '@/lib/pocketbase/client'
import { ObjetoFiltrosRelatorio } from './relatorios'

export interface ComparativoMetrica {
  valor_anterior: number
  variacao_anterior_valor: number
  variacao_anterior_pct: number
  valor_ano_anterior: number
  variacao_ano_anterior_valor: number
  variacao_ano_anterior_pct: number
}

export interface RelatorioEmpresaVendasItem {
  empresa_id: string
  empresa_nome: string
  empresa_razao_social: string
  empresa_cnpj: string
  empresa_uf: string
  faturamento_bruto: number
  devolucoes: number
  faturamento_liquido: number
  quantidade_vendas: number
  ticket_medio: number
  custo_total: number
  margem_bruta_valor: number
  margem_bruta_percentual: number
  desconto_concedido: number
  comparacao_faturamento: ComparativoMetrica
  comparacao_quantidade: ComparativoMetrica
  comparacao_ticket_medio: ComparativoMetrica
}

export interface RelatorioConsolidadoVendas {
  faturamento_bruto: number
  devolucoes: number
  faturamento_liquido: number
  quantidade_vendas: number
  ticket_medio: number
  custo_total: number
  margem_bruta_valor: number
  margem_bruta_percentual: number
  desconto_concedido: number
  comparacao_faturamento: ComparativoMetrica
  comparacao_quantidade: ComparativoMetrica
  comparacao_ticket_medio: ComparativoMetrica
}

export interface RelatorioUfItem {
  uf: string
  faturamento: number
  quantidade: number
  ticket_medio: number
  percentual: number
}

export interface RelatorioCanalItem {
  chave: string
  nome: string
  tipo: string
  faturamento: number
  quantidade: number
  ticket_medio: number
  percentual: number
}

export interface RelatorioPagamentoItem {
  forma_pagamento_id: string
  descricao: string
  tipo: string
  valor: number
  quantidade: number
  valor_taxa: number
  taxa_percentual: number
  percentual_sobre_total: number
}

export interface RelatorioConsolidadoPagamentos {
  valor_total: number
  quantidade_total: number
  valor_taxas_total: number
  taxa_media_percentual: number
}

export interface RelatorioCategoriaItem {
  categoria_id: string
  categoria_nome: string
  faturamento: number
  quantidade: number
  percentual_grupo: number
}

export interface RelatorioGrupoItem {
  grupo_id: string
  grupo_nome: string
  faturamento: number
  quantidade: number
  percentual_total: number
  categorias: RelatorioCategoriaItem[]
}

export interface RelatorioVendasCanaisResultado {
  sucesso: boolean
  metadados: {
    periodo_atual: {
      data_inicio: string
      data_fim: string
      dias: number
    }
    periodo_anterior: {
      data_inicio: string
      data_fim: string
      dias: number
    }
    mesmo_periodo_ano_anterior: {
      data_inicio: string
      data_fim: string
      dias: number
    }
    tem_filtro_produto: boolean
    aviso_filtro_produto?: string | null
  }
  empresas: RelatorioEmpresaVendasItem[]
  consolidado: RelatorioConsolidadoVendas
  tabela_uf: RelatorioUfItem[]
  tabela_canal: RelatorioCanalItem[]
  tabela_pagamentos: RelatorioPagamentoItem[]
  consolidado_pagamentos: RelatorioConsolidadoPagamentos
  quadro_grupos_categorias: RelatorioGrupoItem[]
}

/**
 * Consulta o relatório backend de vendas por loja e por canal com filtros comuns da etapa 8
 */
export async function obterRelatorioVendasCanais(
  filtros: ObjetoFiltrosRelatorio,
): Promise<RelatorioVendasCanaisResultado> {
  const res = await pb.send<RelatorioVendasCanaisResultado>(
    '/backend/v1/relatorios/vendas-canais',
    {
      method: 'POST',
      body: {
        filtros,
      },
    },
  )
  return res
}
