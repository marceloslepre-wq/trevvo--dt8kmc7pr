import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { ContaFinanceira } from '@/services/contasFinanceiras'
import type { Cliente } from '@/services/clientes'

export type TipoFormaPagamento =
  | 'Dinheiro'
  | 'Cheque'
  | 'Cartão de crédito'
  | 'Cartão de débito'
  | 'PIX'
  | 'Boleto'
  | 'Transferência'
  | 'Crédito loja'
  | 'Outros'

export interface FormaPagamento {
  id: string
  codigo_tpag: string
  descricao: string
  tipo: TipoFormaPagamento
  taxa_percentual?: number
  dias_para_recebimento?: number
  conta_financeira_padrao_id?: string
  operadora_cliente_id?: string
  parcelado_pela_operadora?: boolean
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    conta_financeira_padrao_id?: ContaFinanceira
    operadora_cliente_id?: Cliente
  }
}

export interface FormaPagamentoTaxa {
  id: string
  forma_pagamento_id: string
  parcelas_de: number
  parcelas_ate: number
  taxa_percentual: number
  dias_para_recebimento?: number
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarFormasPagamentoParams {
  busca?: string
  tipo?: TipoFormaPagamento | 'todos'
  situacao?: 'todos' | 'ativos' | 'inativos'
}

export async function listarFormasPagamento(
  params?: ListarFormasPagamentoParams | string,
): Promise<FormaPagamento[]> {
  const normParams: ListarFormasPagamentoParams = typeof params === 'string' ? {} : params || {}
  params = normParams
  const condicoes: string[] = []

  if (params.situacao === 'ativos' || !params.situacao) {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.tipo && params.tipo !== 'todos') {
    condicoes.push(`tipo = '${params.tipo}'`)
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(codigo_tpag ~ '${b}' || descricao ~ '${b}')`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('formas_pagamento').getFullList<FormaPagamento>({
    filter,
    sort: 'codigo_tpag',
    expand: 'conta_financeira_padrao_id,operadora_cliente_id',
  })

  return res
}

export async function obterFormaPagamentoPorId(id: string): Promise<FormaPagamento> {
  return await pb.collection('formas_pagamento').getOne<FormaPagamento>(id, {
    expand: 'conta_financeira_padrao_id,operadora_cliente_id',
  })
}

export async function obterFormaPagamentoPorCodigoTpag(
  codigo: string,
): Promise<FormaPagamento | null> {
  try {
    const rec = await pb
      .collection('formas_pagamento')
      .getFirstListItem<FormaPagamento>(`codigo_tpag = '${codigo.trim()}'`, {
        expand: 'conta_financeira_padrao_id,operadora_cliente_id',
      })
    return rec
  } catch {
    return null
  }
}

export async function salvarFormaPagamento(
  dados: Partial<FormaPagamento>,
): Promise<FormaPagamento> {
  const ehEdicao = Boolean(dados.id)
  let antes: FormaPagamento | null = null

  if (!dados.codigo_tpag || !dados.codigo_tpag.trim()) {
    throw new Error('O código tPag (NF-e/NFC-e) é obrigatório.')
  }
  if (!dados.descricao || !dados.descricao.trim()) {
    throw new Error('A descrição da forma de pagamento é obrigatória.')
  }
  if (!dados.tipo) {
    throw new Error('O tipo da forma de pagamento é obrigatório.')
  }

  const payload: Record<string, unknown> = {
    codigo_tpag: dados.codigo_tpag.trim(),
    descricao: dados.descricao.trim(),
    tipo: dados.tipo,
    taxa_percentual:
      dados.taxa_percentual !== undefined &&
      dados.taxa_percentual !== null &&
      !isNaN(Number(dados.taxa_percentual))
        ? Number(dados.taxa_percentual)
        : null,
    dias_para_recebimento:
      dados.dias_para_recebimento !== undefined &&
      dados.dias_para_recebimento !== null &&
      !isNaN(Number(dados.dias_para_recebimento))
        ? Math.max(0, Math.floor(Number(dados.dias_para_recebimento)))
        : null,
    conta_financeira_padrao_id: dados.conta_financeira_padrao_id || null,
    operadora_cliente_id: dados.operadora_cliente_id || null,
    parcelado_pela_operadora: Boolean(dados.parcelado_pela_operadora),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: FormaPagamento
  if (ehEdicao && dados.id) {
    antes = await obterFormaPagamentoPorId(dados.id)
    salva = await pb.collection('formas_pagamento').update<FormaPagamento>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'formas_pagamento',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('formas_pagamento').create<FormaPagamento>(payload)

    await registrarAuditoria({
      tabela: 'formas_pagamento',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarFormaPagamento(id: string): Promise<void> {
  const antes = await obterFormaPagamentoPorId(id)

  const atualizado = await pb.collection('formas_pagamento').update<FormaPagamento>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'formas_pagamento',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarFormaPagamento(id: string): Promise<void> {
  const antes = await obterFormaPagamentoPorId(id)

  const atualizado = await pb.collection('formas_pagamento').update<FormaPagamento>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'formas_pagamento',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

// =========================================================================
// MÉTODOS DE FAIXAS DE TAXAS (formas_pagamento_taxas)
// =========================================================================

export async function listarTaxasPorFormaPagamento(
  formaPagamentoId: string,
): Promise<FormaPagamentoTaxa[]> {
  if (!formaPagamentoId) return []
  return await pb.collection('formas_pagamento_taxas').getFullList<FormaPagamentoTaxa>({
    filter: `forma_pagamento_id = '${formaPagamentoId}' && ativo = true`,
    sort: 'parcelas_de',
  })
}

export async function salvarFormaPagamentoTaxa(
  dados: Partial<FormaPagamentoTaxa> & { forma_pagamento_id: string },
): Promise<FormaPagamentoTaxa> {
  if (!dados.forma_pagamento_id) {
    throw new Error('A forma de pagamento é obrigatória.')
  }
  const parcelasDe = Number(dados.parcelas_de)
  const parcelasAte = Number(dados.parcelas_ate)
  if (isNaN(parcelasDe) || parcelasDe < 1) {
    throw new Error('Parcelas de início inválida (mínimo 1).')
  }
  if (isNaN(parcelasAte) || parcelasAte < parcelasDe) {
    throw new Error('Parcelas fim deve ser maior ou igual às parcelas de início.')
  }
  const taxaPercentual = Number(dados.taxa_percentual)
  if (isNaN(taxaPercentual) || taxaPercentual < 0) {
    throw new Error('A taxa percentual deve ser um número maior ou igual a zero.')
  }

  const payload: Record<string, unknown> = {
    forma_pagamento_id: dados.forma_pagamento_id,
    parcelas_de: Math.floor(parcelasDe),
    parcelas_ate: Math.floor(parcelasAte),
    taxa_percentual: taxaPercentual,
    dias_para_recebimento:
      dados.dias_para_recebimento !== undefined &&
      dados.dias_para_recebimento !== null &&
      !isNaN(Number(dados.dias_para_recebimento))
        ? Math.max(0, Math.floor(Number(dados.dias_para_recebimento)))
        : null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: FormaPagamentoTaxa
  if (dados.id) {
    const antes = await pb.collection('formas_pagamento_taxas').getOne<FormaPagamentoTaxa>(dados.id)
    salva = await pb
      .collection('formas_pagamento_taxas')
      .update<FormaPagamentoTaxa>(dados.id, payload)
    await registrarAuditoria({
      tabela: 'formas_pagamento_taxas',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('formas_pagamento_taxas').create<FormaPagamentoTaxa>(payload)
    await registrarAuditoria({
      tabela: 'formas_pagamento_taxas',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function excluirFormaPagamentoTaxa(id: string): Promise<void> {
  const antes = await pb.collection('formas_pagamento_taxas').getOne<FormaPagamentoTaxa>(id)
  await pb.collection('formas_pagamento_taxas').delete(id)
  await registrarAuditoria({
    tabela: 'formas_pagamento_taxas',
    registro_id: id,
    acao: 'exclusao',
    valores_antes: antes as unknown as Record<string, unknown>,
  })
}

/**
 * Retorna a taxa e o prazo aplicáveis a determinado número de parcelas.
 * Se houver faixa em formas_pagamento_taxas onde parcelas_de <= parcelas <= parcelas_ate, usa a faixa.
 * Caso contrário, utiliza taxa_percentual e dias_para_recebimento da própria forma de pagamento.
 */
export async function obterTaxaEPrazoFormaPagamento(params: {
  formaPagamentoId: string
  numeroParcelas?: number
}): Promise<{ taxaPercentual: number; diasRecebimento: number }> {
  const { formaPagamentoId, numeroParcelas = 1 } = params
  const forma = await obterFormaPagamentoPorId(formaPagamentoId)

  try {
    const faixas = await listarTaxasPorFormaPagamento(formaPagamentoId)
    const faixaEncontrada = faixas.find(
      (f) => numeroParcelas >= f.parcelas_de && numeroParcelas <= f.parcelas_ate,
    )
    if (faixaEncontrada) {
      return {
        taxaPercentual: faixaEncontrada.taxa_percentual,
        diasRecebimento:
          faixaEncontrada.dias_para_recebimento !== undefined &&
          faixaEncontrada.dias_para_recebimento !== null
            ? faixaEncontrada.dias_para_recebimento
            : forma.dias_para_recebimento || 0,
      }
    }
  } catch {
    // fallback para a forma
  }

  return {
    taxaPercentual: forma.taxa_percentual || 0,
    diasRecebimento: forma.dias_para_recebimento || 0,
  }
}
