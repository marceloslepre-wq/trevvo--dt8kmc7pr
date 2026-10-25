import pb from '@/lib/pocketbase/client'
import { ObjetoFiltrosRelatorio } from './relatorios'

export interface ItemFaixaVencimento {
  id: string
  nome: string
  ordem: number
  cor: 'rose' | 'amber' | 'blue' | 'emerald' | 'slate'
  quantidade_titulos: number
  saldo_total: number
  percentual_saldo: number
}

export interface TotalPorFornecedorCP {
  fornecedor_id: string
  fornecedor_nome: string
  fornecedor_razao_social: string
  fornecedor_cnpj_cpf: string
  quantidade_titulos: number
  saldo_total: number
  saldo_vencido: number
  saldo_vence_hoje: number
  saldo_a_vencer: number
  percentual: number
}

export interface TotalPorPlanoContasCP {
  plano_conta_id: string
  codigo: string
  descricao: string
  quantidade_titulos: number
  saldo_total: number
  percentual: number
}

export interface TituloAnaliticoCP {
  id: string
  empresa_id: string
  empresa_nome: string
  fornecedor_id: string
  fornecedor_nome: string
  fornecedor_razao_social: string
  fornecedor_cnpj_cpf: string
  numero_documento: string
  parcela: string
  descricao: string
  data_emissao: string
  data_competencia: string
  data_vencimento: string
  dias_vencimento: number
  faixa_id: string
  faixa_nome: string
  faixa_ordem: number
  situacao_vencimento: 'Vencido' | 'Vence hoje' | 'A vencer'
  plano_conta_id: string
  plano_conta_codigo: string
  plano_conta_descricao: string
  centro_custo_id: string
  centro_custo_nome: string
  valor_original: number
  valor_pago: number
  saldo: number
  status: string
  origem: string
  origem_id: string
  nota_entrada_parcela_id: string
  link_nota_entrada: string | null
}

export interface RelatorioContasPagarResponse {
  sucesso: boolean
  message?: string
  metadados: {
    data_base: string
    tipo_data: string
    campo_data_filtro: string
    periodo: {
      dataInicio: string | null
      dataFim: string | null
    }
    empresas_ids: string[]
  }
  totais: {
    saldo_total: number
    quantidade_total: number
    vencido_saldo: number
    vencido_quantidade: number
    vence_hoje_saldo: number
    vence_hoje_quantidade: number
    a_vencer_saldo: number
    a_vencer_quantidade: number
  }
  faixas_vencimento: ItemFaixaVencimento[]
  totais_por_fornecedor: TotalPorFornecedorCP[]
  totais_por_plano_contas: TotalPorPlanoContasCP[]
  titulos: TituloAnaliticoCP[]
}

/**
 * Consulta o endpoint de relatório de contas a pagar por vencimento
 */
export async function obterRelatorioContasPagarPorVencimento(params: {
  filtros: ObjetoFiltrosRelatorio
}): Promise<RelatorioContasPagarResponse> {
  const token = pb.authStore.token
  const baseUrl = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
  const url = `${baseUrl}/backend/v1/relatorios/contas-pagar`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({ filtros: params.filtros }),
  })

  if (!resp.ok) {
    let msg = `Erro na requisição (${resp.status})`
    try {
      const errJson = await resp.json()
      if (errJson.message) msg = errJson.message
    } catch {
      /* intentionally ignored */
    }
    throw new Error(msg)
  }

  const data: RelatorioContasPagarResponse = await resp.json()
  return data
}
