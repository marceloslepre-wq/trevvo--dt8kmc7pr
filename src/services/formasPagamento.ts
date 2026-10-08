import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { ContaFinanceira } from '@/services/contasFinanceiras'

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
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    conta_financeira_padrao_id?: ContaFinanceira
  }
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
    expand: 'conta_financeira_padrao_id',
  })

  return res
}

export async function obterFormaPagamentoPorId(id: string): Promise<FormaPagamento> {
  return await pb.collection('formas_pagamento').getOne<FormaPagamento>(id, {
    expand: 'conta_financeira_padrao_id',
  })
}

export async function obterFormaPagamentoPorCodigoTpag(
  codigo: string,
): Promise<FormaPagamento | null> {
  try {
    const rec = await pb
      .collection('formas_pagamento')
      .getFirstListItem<FormaPagamento>(`codigo_tpag = '${codigo.trim()}'`)
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
