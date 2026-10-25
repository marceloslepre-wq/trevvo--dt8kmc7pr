import pb from '@/lib/pocketbase/client'
import { ObjetoFiltrosRelatorio } from './relatorios'

export interface ProdutoEstoqueGerencialItem {
  produto_id: string
  codigo: number
  descricao: string
  unidade_sigla: string
  grupo_nome: string
  categoria_nome: string
  marca_nome: string
  saldo: number
  custo_medio: number
  valor_total: number
  qtd_vendida_periodo: number
  media_diaria: number
  cobertura_dias: number | null
  cobertura_descricao: string
  cobertura_acima_180: boolean
  giro_periodo: number
  data_ultima_saida: string | null
  dias_ultima_saida: number | null
  em_pedido: number
  estoque_minimo: number
  sugestao_compra: number
  valor_sugestao: number
  ultimo_fornecedor_id: string
  ultimo_fornecedor_nome: string
  ultimo_custo: number
  eh_parado: boolean
  valor_parado: number
}

export interface CategoriaResumoEstoque {
  categoria_id: string
  categoria_nome: string
  saldo_total: number
  valor_total: number
  itens_count: number
  percentual_grupo: number
}

export interface GrupoResumoEstoque {
  grupo_id: string
  grupo_nome: string
  saldo_total: number
  valor_total: number
  itens_count: number
  percentual_valor: number
  categorias: CategoriaResumoEstoque[]
}

export interface MarcaResumoEstoque {
  marca_id: string
  marca_nome: string
  saldo_total: number
  valor_total: number
  itens_count: number
  percentual_valor: number
}

export interface RelatorioEstoqueGerencialResultado {
  sucesso: boolean
  metadados: {
    data_base: string
    dias_analise: number
    dias_cobertura_alvo: number
    dias_parado: number
    data_inicio_analise: string
    total_produtos_avaliados: number
    tem_filtro_produto: boolean
    aviso_filtro_produto?: string | null
  }
  totais: {
    saldo_total: number
    valor_total: number
    itens_parados: number
    valor_parados: number
    itens_sugestao: number
    sugestao_total_qtd: number
    sugestao_total_valor: number
  }
  produtos: ProdutoEstoqueGerencialItem[]
  por_grupo_categoria: GrupoResumoEstoque[]
  por_marca: MarcaResumoEstoque[]
  produtos_parados: ProdutoEstoqueGerencialItem[]
  produtos_sugestao: ProdutoEstoqueGerencialItem[]
}

export interface ParametrosEstoqueGerencial {
  filtros: ObjetoFiltrosRelatorio
  data_base?: string
  dias_analise?: number
  dias_cobertura_alvo?: number
  dias_parado?: number
}

/**
 * Consulta o endpoint backend /backend/v1/relatorios/estoque-gerencial
 */
export async function obterRelatorioEstoqueGerencial(
  params: ParametrosEstoqueGerencial,
): Promise<RelatorioEstoqueGerencialResultado> {
  const res = await pb.send<RelatorioEstoqueGerencialResultado>(
    '/backend/v1/relatorios/estoque-gerencial',
    {
      method: 'POST',
      body: {
        filtros: params.filtros,
        data_base: params.data_base,
        dias_analise: params.dias_analise,
        dias_cobertura_alvo: params.dias_cobertura_alvo,
        dias_parado: params.dias_parado,
      },
    },
  )
  return res
}
