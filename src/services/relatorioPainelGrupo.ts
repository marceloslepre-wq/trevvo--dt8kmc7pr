import pb from '@/lib/pocketbase/client'

export interface TopUfItem {
  uf: string
  valor: number
  percentual: number
}

export type StatusSped = 'não gerado' | 'gerado com erros' | 'gerado' | 'entregue' | 'não se aplica'

export interface IndicadoresPainelEmpresa {
  empresa_id: string
  empresa_nome: string
  empresa_uf: string
  empresa_codigo: number
  empresa_cnpj: string
  // Faturamento e comparativos
  faturamento_mes_atual: number
  faturamento_mes_anterior: number
  faturamento_ano_anterior: number
  var_percentual_mes_anterior: number
  var_percentual_ano_anterior: number
  // Margem, vendas e ticket médio
  margem_bruta_valor: number
  margem_bruta_percentual: number
  custo_total_vendas: number
  quantidade_vendas: number
  ticket_medio: number
  // Vendas interestaduais e top 5 UFs
  vendas_outros_estados_valor: number
  vendas_outros_estados_percentual: number
  top_5_ufs: TopUfItem[]
  // Estoque
  estoque_valorizado: number
  estoque_parado_mais_90d_valor: number
  estoque_parado_mais_90d_qtd_itens: number
  // Financeiro
  a_receber_proximos_30d: number
  a_receber_vencidos: number
  a_pagar_proximos_30d: number
  a_pagar_vencidos: number
  saldo_contas_financeiras: number
  // Fiscal
  documentos_fiscais_rejeitados: number
  documentos_fiscais_processando: number
  sped_mes_anterior_status: StatusSped
  sped_mes_anterior_periodo: string
}

export interface PontoGraficoDiario {
  dia: string
  rotulo: string
  total: number
  [empresaId: string]: string | number
}

export interface PontoGrafico12Meses {
  mes: string
  rotulo: string
  total: number
  [empresaId: string]: string | number
}

export interface RespostaPainelGrupo {
  sucesso: boolean
  metadados: {
    mes_referencia: string
    periodo_atual: {
      inicio: string
      fim: string
      dia_corte: number
    }
    periodo_mes_anterior: {
      inicio: string
      fim: string
      dia_corte: number
    }
    periodo_ano_anterior: {
      inicio: string
      fim: string
      dia_corte: number
    }
    total_empresas_acesso: number
    data_geracao: string
  }
  total_grupo: IndicadoresPainelEmpresa
  por_empresa: IndicadoresPainelEmpresa[]
  graficos: {
    diario_mes: PontoGraficoDiario[]
    ultimos_12_meses: PontoGrafico12Meses[]
  }
}

/**
 * Consulta o endpoint consolidado do Painel do Grupo (Prompt 8.5)
 */
export async function obterDadosPainelGrupo(mesReferencia?: string): Promise<RespostaPainelGrupo> {
  const res = await pb.send<RespostaPainelGrupo>('/backend/v1/relatorios/painel-grupo', {
    method: 'POST',
    body: {
      mes_referencia: mesReferencia,
    },
  })
  return res
}
