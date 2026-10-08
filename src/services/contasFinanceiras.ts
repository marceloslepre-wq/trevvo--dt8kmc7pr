import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type TipoContaFinanceira =
  | 'Conta corrente'
  | 'Poupança'
  | 'Aplicação'
  | 'Caixa físico'
  | 'Carteira digital'

export interface ContaFinanceira {
  id: string
  empresa_id: string
  nome: string
  tipo: TipoContaFinanceira
  banco_codigo?: string
  banco_nome?: string
  agencia?: string
  agencia_digito?: string
  conta?: string
  conta_digito?: string
  chave_pix?: string
  saldo_inicial: number
  data_saldo_inicial: string
  saldo_atual: number
  permite_saldo_negativo: boolean
  conta_padrao_pagamentos: boolean
  conta_padrao_recebimentos: boolean
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    empresa_id?: {
      id: string
      razao_social: string
      nome_fantasia?: string
    }
  }
}

export interface ListarContasFinanceirasParams {
  empresa_id?: string
  busca?: string
  tipo?: TipoContaFinanceira | 'todos'
  situacao?: 'todos' | 'ativos' | 'inativos'
}

export async function listarContasFinanceiras(
  params?: ListarContasFinanceirasParams | string,
): Promise<ContaFinanceira[]> {
  const normParams: ListarContasFinanceirasParams =
    typeof params === 'string' ? { empresa_id: params } : params || {}
  params = normParams
  const condicoes: string[] = []

  if (params.empresa_id) {
    condicoes.push(`empresa_id = '${params.empresa_id}'`)
  }

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
    condicoes.push(`(nome ~ '${b}' || banco_nome ~ '${b}' || conta ~ '${b}' || agencia ~ '${b}')`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('contas_financeiras').getFullList<ContaFinanceira>({
    filter,
    sort: 'nome',
    expand: 'empresa_id',
  })

  return res
}

export async function obterContaFinanceiraPorId(id: string): Promise<ContaFinanceira> {
  return await pb.collection('contas_financeiras').getOne<ContaFinanceira>(id, {
    expand: 'empresa_id',
  })
}

/**
 * Trava estrutural: verifica se a conta possui movimentações financeiras.
 * Por enquanto as movimentações (extrato/lançamentos financeiros) ainda não existem,
 * mas a trava já fica registrada no serviço conforme regra da tarefa.
 */
export async function verificarSeContaPossuiMovimentacoes(id: string): Promise<boolean> {
  try {
    const res = await pb.collection('movimentacoes_financeiras').getList(1, 1, {
      filter: `conta_financeira_id = '${id}' && ativo = true`,
    })
    if (res.totalItems > 0) return true
  } catch {
    // Coleção ou erro
  }
  return false
}

export async function salvarContaFinanceira(
  dados: Partial<ContaFinanceira>,
): Promise<ContaFinanceira> {
  const ehEdicao = Boolean(dados.id)
  let antes: ContaFinanceira | null = null

  if (!dados.empresa_id) {
    throw new Error('A empresa é obrigatória.')
  }
  if (!dados.nome || !dados.nome.trim()) {
    throw new Error('O nome da conta é obrigatório.')
  }
  if (!dados.tipo) {
    throw new Error('O tipo da conta é obrigatório.')
  }
  if (
    dados.saldo_inicial === undefined ||
    dados.saldo_inicial === null ||
    isNaN(Number(dados.saldo_inicial))
  ) {
    throw new Error('O saldo inicial é obrigatório.')
  }
  if (!dados.data_saldo_inicial || !dados.data_saldo_inicial.trim()) {
    throw new Error('A data do saldo inicial é obrigatória.')
  }

  // Trava de saldo inicial se tiver movimentos
  if (ehEdicao && dados.id) {
    antes = await obterContaFinanceiraPorId(dados.id)
    const temMovimentos = await verificarSeContaPossuiMovimentacoes(dados.id)
    if (temMovimentos) {
      if (
        Number(dados.saldo_inicial) !== Number(antes.saldo_inicial) ||
        dados.data_saldo_inicial !== antes.data_saldo_inicial
      ) {
        throw new Error(
          'O saldo inicial e a data do saldo inicial não podem ser alterados após a conta possuir movimentações.',
        )
      }
    }
  }

  // Se marcar conta_padrao_pagamentos ou conta_padrao_recebimentos, desmarcar as outras da mesma empresa
  if (dados.conta_padrao_pagamentos) {
    const outras = await pb.collection('contas_financeiras').getFullList<ContaFinanceira>({
      filter: `empresa_id = '${dados.empresa_id}' && conta_padrao_pagamentos = true${ehEdicao && dados.id ? ` && id != '${dados.id}'` : ''}`,
    })
    for (const c of outras) {
      await pb.collection('contas_financeiras').update(c.id, {
        conta_padrao_pagamentos: false,
        updated_by: pb.authStore.record?.id || null,
      })
    }
  }

  if (dados.conta_padrao_recebimentos) {
    const outras = await pb.collection('contas_financeiras').getFullList<ContaFinanceira>({
      filter: `empresa_id = '${dados.empresa_id}' && conta_padrao_recebimentos = true${ehEdicao && dados.id ? ` && id != '${dados.id}'` : ''}`,
    })
    for (const c of outras) {
      await pb.collection('contas_financeiras').update(c.id, {
        conta_padrao_recebimentos: false,
        updated_by: pb.authStore.record?.id || null,
      })
    }
  }

  // Define padrão permite_saldo_negativo se não foi informado
  let permiteSaldoNegativo = dados.permite_saldo_negativo
  if (permiteSaldoNegativo === undefined) {
    permiteSaldoNegativo = dados.tipo !== 'Caixa físico'
  }

  const saldoInicialNum = Number(dados.saldo_inicial)
  const saldoAtualCalculado = ehEdicao && antes ? antes.saldo_atual : saldoInicialNum

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    nome: dados.nome.trim(),
    tipo: dados.tipo,
    banco_codigo: dados.banco_codigo?.trim() || '',
    banco_nome: dados.banco_nome?.trim() || '',
    agencia: dados.agencia?.trim() || '',
    agencia_digito: dados.agencia_digito?.trim() || '',
    conta: dados.conta?.trim() || '',
    conta_digito: dados.conta_digito?.trim() || '',
    chave_pix: dados.chave_pix?.trim() || '',
    saldo_inicial: saldoInicialNum,
    data_saldo_inicial: dados.data_saldo_inicial.trim(),
    saldo_atual: saldoAtualCalculado,
    permite_saldo_negativo: Boolean(permiteSaldoNegativo),
    conta_padrao_pagamentos: Boolean(dados.conta_padrao_pagamentos),
    conta_padrao_recebimentos: Boolean(dados.conta_padrao_recebimentos),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: ContaFinanceira
  if (ehEdicao && dados.id) {
    salva = await pb.collection('contas_financeiras').update<ContaFinanceira>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'contas_financeiras',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('contas_financeiras').create<ContaFinanceira>(payload)

    await registrarAuditoria({
      tabela: 'contas_financeiras',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarContaFinanceira(id: string): Promise<void> {
  const antes = await obterContaFinanceiraPorId(id)

  const atualizado = await pb.collection('contas_financeiras').update<ContaFinanceira>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'contas_financeiras',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarContaFinanceira(id: string): Promise<void> {
  const antes = await obterContaFinanceiraPorId(id)

  const atualizado = await pb.collection('contas_financeiras').update<ContaFinanceira>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'contas_financeiras',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

/**
 * Calcula o saldo consolidado de todas as contas ativas de uma empresa
 */
export async function obterTotalSaldoEmpresa(empresaId: string): Promise<number> {
  const contas = await listarContasFinanceiras({ empresa_id: empresaId, situacao: 'ativos' })
  return contas.reduce((acc, c) => acc + (Number(c.saldo_atual) || 0), 0)
}
