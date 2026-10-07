import pb from '@/lib/pocketbase/client'

export interface Lote {
  id: string
  empresa_id: string
  produto_id: string
  numero_lote: string
  data_fabricacao?: string
  data_validade: string
  quantidade: number
  observacao?: string
  ativo: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    produto_id?: {
      id: string
      codigo: number | string
      descricao: string
      unidade_id?: string
      expand?: {
        unidade_id?: {
          sigla: string
          nome: string
        }
      }
    }
    empresa_id?: {
      id: string
      razao_social: string
      nome_fantasia: string
    }
  }
}

export type SituacaoLote = 'vencido' | 'alerta' | 'ok'

/**
 * Calcula os dias até a validade do lote.
 * Valor negativo indica que o lote já está vencido.
 */
export function calcularDiasParaVencer(dataValidadeStr: string): number {
  if (!dataValidadeStr) return 0
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  // Extrai data sem desvio de timezone
  const parteData = dataValidadeStr.includes('T')
    ? dataValidadeStr.split('T')[0]
    : dataValidadeStr.slice(0, 10)
  const partes = parteData.split('-')
  if (partes.length !== 3) return 0

  const dataValidade = new Date(
    parseInt(partes[0], 10),
    parseInt(partes[1], 10) - 1,
    parseInt(partes[2], 10),
  )

  const diffMs = dataValidade.getTime() - hoje.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Determina a situação do lote baseada na validade e nos dias de alerta
 */
export function classificarSituacaoLote(
  dataValidadeStr: string,
  diasAlerta: number = 30,
): { situacao: SituacaoLote; diasParaVencer: number; rotulo: string } {
  const dias = calcularDiasParaVencer(dataValidadeStr)

  if (dias < 0) {
    return {
      situacao: 'vencido',
      diasParaVencer: dias,
      rotulo: 'Vencido',
    }
  }

  if (dias <= diasAlerta) {
    return {
      situacao: 'alerta',
      diasParaVencer: dias,
      rotulo: `Vence em até ${diasAlerta} dias`,
    }
  }

  return {
    situacao: 'ok',
    diasParaVencer: dias,
    rotulo: 'OK',
  }
}

export interface ListarLotesParams {
  empresaId: string
  produtoId?: string
  situacao?: 'todos' | 'vencido' | 'alerta' | 'ok'
  dataValidadeInicio?: string
  dataValidadeFim?: string
  apenasComSaldo?: boolean
  diasAlerta?: number
}

/**
 * Lista lotes de uma empresa com suporte a filtros e ordenação por FEFO
 */
export async function listarLotes(params: ListarLotesParams): Promise<Lote[]> {
  const {
    empresaId,
    produtoId,
    situacao = 'todos',
    dataValidadeInicio,
    dataValidadeFim,
    apenasComSaldo = false,
    diasAlerta = 30,
  } = params

  if (!empresaId) return []

  const filtros: string[] = [`empresa_id = '${empresaId}'`, `ativo = true`]

  if (produtoId) {
    filtros.push(`produto_id = '${produtoId}'`)
  }

  if (apenasComSaldo) {
    filtros.push(`quantidade > 0`)
  }

  if (dataValidadeInicio) {
    filtros.push(`data_validade >= '${dataValidadeInicio}T00:00:00.000Z'`)
  }

  if (dataValidadeFim) {
    filtros.push(`data_validade <= '${dataValidadeFim}T23:59:59.999Z'`)
  }

  try {
    const lotes = await pb.collection('lotes').getFullList<Lote>({
      filter: filtros.join(' && '),
      sort: 'data_validade,created',
      expand: 'produto_id,produto_id.unidade_id,empresa_id',
    })

    // Filtra no cliente pela situação dinâmica (dias até a data de hoje)
    if (situacao === 'todos') {
      return lotes
    }

    return lotes.filter((l) => {
      const cls = classificarSituacaoLote(l.data_validade, diasAlerta)
      return cls.situacao === situacao
    })
  } catch (err) {
    console.error('Erro ao listar lotes:', err)
    return []
  }
}

/**
 * Lista os lotes disponíveis (com saldo > 0) de um produto em uma filial,
 * pré-ordenados por FEFO (vence primeiro primeiro).
 */
export async function listarLotesDisponiveisProduto(
  empresaId: string,
  produtoId: string,
): Promise<Lote[]> {
  if (!empresaId || !produtoId) return []

  try {
    return await pb.collection('lotes').getFullList<Lote>({
      filter: `empresa_id = '${empresaId}' && produto_id = '${produtoId}' && ativo = true && quantidade > 0`,
      sort: 'data_validade,created',
    })
  } catch (err) {
    console.error('Erro ao listar lotes disponíveis do produto:', err)
    return []
  }
}

/**
 * Consulta todos os lotes de um produto na empresa (inclusive zerados),
 * para exibição detalhada no cadastro ou ficha de estoque.
 */
export async function listarTodosLotesProduto(
  empresaId: string,
  produtoId: string,
): Promise<Lote[]> {
  if (!empresaId || !produtoId) return []

  try {
    return await pb.collection('lotes').getFullList<Lote>({
      filter: `empresa_id = '${empresaId}' && produto_id = '${produtoId}' && ativo = true`,
      sort: 'data_validade,-quantidade',
    })
  } catch (err) {
    console.error('Erro ao listar todos os lotes do produto:', err)
    return []
  }
}
