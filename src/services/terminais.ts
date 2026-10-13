import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { ContaFinanceira } from '@/services/contasFinanceiras'

export interface PdvTerminal {
  id: string
  empresa_id: string
  nome: string
  conta_financeira_id: string
  conta_cofre_id?: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    conta_financeira_id?: ContaFinanceira
    conta_cofre_id?: ContaFinanceira
  }
}

export interface ListarTerminaisParams {
  empresa_id: string
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
}

export async function listarTerminais(params: ListarTerminaisParams): Promise<PdvTerminal[]> {
  if (!params.empresa_id) return []

  const condicoes: string[] = [`empresa_id = '${params.empresa_id}'`]

  if (params.situacao === 'ativos' || !params.situacao) {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`nome ~ '${b}'`)
  }

  const filter = condicoes.join(' && ')

  return await pb.collection('pdv_terminais').getFullList<PdvTerminal>({
    filter,
    sort: 'nome',
    expand: 'conta_financeira_id,conta_cofre_id',
  })
}

export async function obterTerminalPorId(id: string): Promise<PdvTerminal> {
  return await pb.collection('pdv_terminais').getOne<PdvTerminal>(id, {
    expand: 'conta_financeira_id,conta_cofre_id',
  })
}

export async function salvarTerminal(
  dados: Partial<PdvTerminal> & { empresa_id: string },
): Promise<PdvTerminal> {
  const ehEdicao = Boolean(dados.id)
  let antes: PdvTerminal | null = null

  if (!dados.nome || !dados.nome.trim()) {
    throw new Error('O nome do terminal é obrigatório (ex: "Caixa 01").')
  }
  if (!dados.conta_financeira_id) {
    throw new Error('A conta do caixa físico é obrigatória.')
  }

  // Validação: a conta_financeira_id deve ser obrigatoriamente do tipo "Caixa físico" e da MESMA empresa
  const conta = await pb
    .collection('contas_financeiras')
    .getOne<ContaFinanceira>(dados.conta_financeira_id)
  if (conta.empresa_id !== dados.empresa_id) {
    throw new Error('A conta financeira selecionada pertence a outra empresa.')
  }
  if (conta.tipo !== 'Caixa físico') {
    throw new Error('A conta do terminal deve ser obrigatoriamente do tipo "Caixa físico".')
  }

  // Validação opcional da conta cofre
  if (dados.conta_cofre_id) {
    const contaCofre = await pb
      .collection('contas_financeiras')
      .getOne<ContaFinanceira>(dados.conta_cofre_id)
    if (contaCofre.empresa_id !== dados.empresa_id) {
      throw new Error('A conta de cofre/sangria selecionada pertence a outra empresa.')
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    nome: dados.nome.trim(),
    conta_financeira_id: dados.conta_financeira_id,
    conta_cofre_id: dados.conta_cofre_id || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salvo: PdvTerminal
  if (ehEdicao && dados.id) {
    antes = await obterTerminalPorId(dados.id)
    salvo = await pb.collection('pdv_terminais').update<PdvTerminal>(dados.id, payload)
    await registrarAuditoria({
      tabela: 'pdv_terminais',
      registro_id: salvo.id,
      empresa_id: dados.empresa_id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salvo = await pb.collection('pdv_terminais').create<PdvTerminal>(payload)
    await registrarAuditoria({
      tabela: 'pdv_terminais',
      registro_id: salvo.id,
      empresa_id: dados.empresa_id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  return await obterTerminalPorId(salvo.id)
}

export async function inativarTerminal(id: string): Promise<void> {
  const antes = await obterTerminalPorId(id)
  const atualizado = await pb.collection('pdv_terminais').update<PdvTerminal>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })
  await registrarAuditoria({
    tabela: 'pdv_terminais',
    registro_id: id,
    empresa_id: antes.empresa_id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarTerminal(id: string): Promise<void> {
  const antes = await obterTerminalPorId(id)
  const atualizado = await pb.collection('pdv_terminais').update<PdvTerminal>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })
  await registrarAuditoria({
    tabela: 'pdv_terminais',
    registro_id: id,
    empresa_id: antes.empresa_id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}
