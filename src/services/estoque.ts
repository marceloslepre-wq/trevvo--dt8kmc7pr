import pb from '@/lib/pocketbase/client'

/**
 * SERVIÇO CENTRAL DE ESTOQUE (Etapa 2)
 *
 * ⚠ ATENÇÃO / REGRA DE ARQUITETURA MANDATÓRIA:
 * Nenhuma tela ou serviço pode gravar diretamente nas tabelas `estoque_saldos`
 * ou `estoque_movimentos`. Toda e qualquer alteração de saldo ou histórico
 * DEVE obrigatoriamente transitar por `movimentarEstoque()` ou `estornarMovimento()`.
 * O backend bloqueia acessos de gravação direta nessas tabelas para usuários comuns.
 */

export type TipoMovimentoEstoque = 'Entrada' | 'Saída'

export type OrigemMovimentoEstoque =
  | 'SALDO_INICIAL'
  | 'AJUSTE_ENTRADA'
  | 'AJUSTE_SAIDA'
  | 'PERDA'
  | 'CONSUMO_INTERNO'
  | 'BONIFICACAO_ENTRADA'
  | 'BONIFICACAO_SAIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'TRANSFERENCIA_SAIDA'
  | 'INVENTARIO_ENTRADA'
  | 'INVENTARIO_SAIDA'
  | 'COMPRA'
  | 'DEVOLUCAO_COMPRA'
  | 'VENDA'
  | 'DEVOLUCAO_VENDA'
  | 'ESTORNO'

export interface ItemMovimentacaoEstoque {
  empresa_id: string
  produto_id: string
  tipo: TipoMovimentoEstoque
  origem: OrigemMovimentoEstoque
  quantidade: number
  custo_unitario?: number
  data_movimento?: string
  lote_id?: string
  documento_tipo?: string
  documento_id?: string
  documento_numero?: string
  motivo?: string
  observacao?: string
}

export interface MovimentoEstoqueResultado {
  id: string
  empresa_id: string
  produto_id: string
  produto_descricao: string
  tipo: TipoMovimentoEstoque
  origem: OrigemMovimentoEstoque
  quantidade: number
  custo_unitario: number
  valor_total: number
  saldo_anterior: number
  saldo_posterior: number
  custo_medio_anterior: number
  custo_medio_posterior: number
  data_movimento: string
}

export interface RespostaMovimentarEstoque {
  sucesso: boolean
  total: number
  movimentos: MovimentoEstoqueResultado[]
  message?: string
}

export interface RespostaEstornoEstoque {
  sucesso: boolean
  message: string
  resultado?: {
    movimento_estorno_id: string
    movimento_original_id: string
    tipo: TipoMovimentoEstoque
    quantidade: number
    saldo_posterior: number
    custo_medio_posterior: number
  }
}

export interface EstoqueSaldo {
  id: string
  empresa_id: string
  produto_id: string
  quantidade: number
  custo_medio: number
  valor_total: number
  data_ultima_entrada?: string
  data_ultima_saida?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    produto_id?: {
      id: string
      codigo: number
      descricao: string
      gtin?: string
    }
    empresa_id?: {
      id: string
      razao_social: string
      nome_fantasia: string
    }
  }
}

export interface EstoqueMovimento {
  id: string
  empresa_id: string
  produto_id: string
  data_movimento: string
  tipo: TipoMovimentoEstoque
  origem: OrigemMovimentoEstoque
  quantidade: number
  custo_unitario?: number
  valor_total?: number
  saldo_anterior?: number
  saldo_posterior?: number
  custo_medio_anterior?: number
  custo_medio_posterior?: number
  lote_id?: string
  documento_tipo?: string
  documento_id?: string
  documento_numero?: string
  motivo?: string
  observacao?: string
  usuario_id?: string
  estornado?: boolean
  movimento_estornado_id?: string
  movimento_estorno_id?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    produto_id?: {
      id: string
      codigo: number
      descricao: string
    }
  }
}

/**
 * Movimenta o estoque de um ou mais itens de forma atômica e transacional.
 *
 * Exemplo de uso:
 * ```ts
 * const resultado = await movimentarEstoque([
 *   {
 *     empresa_id: 'empresa_123',
 *     produto_id: 'produto_456',
 *     tipo: 'Entrada',
 *     origem: 'COMPRA',
 *     quantidade: 10,
 *     custo_unitario: 25.50,
 *     documento_tipo: 'NF-e',
 *     documento_numero: '1234'
 *   }
 * ])
 * ```
 */
export async function movimentarEstoque(
  itens: ItemMovimentacaoEstoque[],
): Promise<RespostaMovimentarEstoque> {
  if (!itens || itens.length === 0) {
    throw new Error('Nenhum item informado para movimentação de estoque')
  }

  const res = await pb.send<RespostaMovimentarEstoque>('/backend/v1/estoque/movimentar', {
    method: 'POST',
    body: { itens },
  })

  return res
}

/**
 * Estorna um movimento de estoque existente criando um movimento de ESTORNO
 * com tipo invertido, mantendo histórico e recalculando saldo e custo médio.
 *
 * Exemplo de uso:
 * ```ts
 * const estorno = await estornarMovimento('mov_123', 'Digitação incorreta do ajuste')
 * ```
 */
export async function estornarMovimento(
  movimentoId: string,
  motivo: string,
): Promise<RespostaEstornoEstoque> {
  if (!movimentoId) {
    throw new Error('movimentoId é obrigatório')
  }
  if (!motivo || !motivo.trim()) {
    throw new Error('O motivo do estorno é obrigatório')
  }

  const res = await pb.send<RespostaEstornoEstoque>('/backend/v1/estoque/estornar', {
    method: 'POST',
    body: {
      movimento_id: movimentoId,
      motivo: motivo.trim(),
    },
  })

  return res
}

/**
 * Retorna o saldo físico e o custo médio ponderado de um produto em uma empresa
 * na data especificada (fim do dia, 23:59:59.999), recompondo a partir dos movimentos
 * do kardex (`estoque_movimentos`) registrados até a data.
 *
 * @param empresaId ID da empresa/filial
 * @param produtoId ID do produto
 * @param data Data base no formato 'AAAA-MM-DD' ou ISO
 * @returns Objeto com { quantidade, custo_medio, valor_total }
 */
export async function saldoEmData(
  empresaId: string,
  produtoId: string,
  data: string,
): Promise<{ quantidade: number; custo_medio: number; valor_total: number }> {
  if (!empresaId || !produtoId || !data) {
    return { quantidade: 0, custo_medio: 0, valor_total: 0 }
  }

  // Normalizar limite da data para o final do dia
  const dataFimDia = data.includes('T') ? data : `${data}T23:59:59.999Z`

  try {
    // Buscar o último movimento do produto naquela empresa até a data informada
    const ultimosMovimentos = await pb
      .collection('estoque_movimentos')
      .getList<EstoqueMovimento>(1, 1, {
        filter: `empresa_id = '${empresaId}' && produto_id = '${produtoId}' && data_movimento <= '${dataFimDia}'`,
        sort: '-data_movimento,-created',
      })

    if (ultimosMovimentos.items.length > 0) {
      const ultMov = ultimosMovimentos.items[0]
      const quantidade = ultMov.saldo_posterior ?? 0
      const custoMedio = ultMov.custo_medio_posterior ?? ultMov.custo_unitario ?? 0
      const valorTotal = Math.round(quantidade * custoMedio * 100) / 100
      return {
        quantidade,
        custo_medio: custoMedio,
        valor_total: valorTotal,
      }
    }

    // Se não há movimentos até a data, verifica se o produto já tem preco_custo padrão
    const prod = await pb.collection('produtos').getOne<{ preco_custo?: number }>(produtoId)
    const custo = prod.preco_custo || 0

    return {
      quantidade: 0,
      custo_medio: custo,
      valor_total: 0,
    }
  } catch (err) {
    console.error('Erro ao calcular saldoEmData:', err)
    return { quantidade: 0, custo_medio: 0, valor_total: 0 }
  }
}

/**
 * Consulta o saldo atual de um produto na empresa ativa direto de estoque_saldos
 */
export async function obterSaldoAtual(
  empresaId: string,
  produtoId: string,
): Promise<EstoqueSaldo | null> {
  try {
    const saldos = await pb.collection('estoque_saldos').getList<EstoqueSaldo>(1, 1, {
      filter: `empresa_id = '${empresaId}' && produto_id = '${produtoId}'`,
      expand: 'produto_id,empresa_id',
    })
    return saldos.items[0] || null
  } catch {
    return null
  }
}

/**
 * Consulta o histórico de movimentações (Kardex) com paginação e filtros
 */
export async function listarMovimentosKardex(params: {
  empresaId: string
  produtoId?: string
  dataInicio?: string
  dataFim?: string
  tipo?: TipoMovimentoEstoque
  origem?: OrigemMovimentoEstoque
  page?: number
  perPage?: number
}) {
  const condicoes: string[] = [`empresa_id = '${params.empresaId}'`]

  if (params.produtoId) {
    condicoes.push(`produto_id = '${params.produtoId}'`)
  }
  if (params.tipo) {
    condicoes.push(`tipo = '${params.tipo}'`)
  }
  if (params.origem) {
    condicoes.push(`origem = '${params.origem}'`)
  }
  if (params.dataInicio) {
    condicoes.push(`data_movimento >= '${params.dataInicio}'`)
  }
  if (params.dataFim) {
    const fim = params.dataFim.includes('T') ? params.dataFim : `${params.dataFim}T23:59:59.999Z`
    condicoes.push(`data_movimento <= '${fim}'`)
  }

  const res = await pb
    .collection('estoque_movimentos')
    .getList<EstoqueMovimento>(params.page || 1, params.perPage || 20, {
      filter: condicoes.join(' && '),
      sort: '-data_movimento,-created',
      expand: 'produto_id',
    })

  return res
}
