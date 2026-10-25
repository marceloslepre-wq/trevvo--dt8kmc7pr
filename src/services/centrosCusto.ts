import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface CentroCusto {
  id: string
  codigo: string
  descricao: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarCentrosCustoParams {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  assinante_id?: string
}

export interface ResultadoPaginadoCentrosCusto {
  items: CentroCusto[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

export async function listarCentrosCusto(
  params: ListarCentrosCustoParams = {},
): Promise<ResultadoPaginadoCentrosCusto> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.assinante_id) {
    condicoes.push(`assinante_id = '${params.assinante_id}'`)
  }

  if (params.situacao === 'ativos' || !params.situacao) {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(codigo ~ '${b}' || descricao ~ '${b}')`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('centros_custo').getList<CentroCusto>(page, perPage, {
    filter,
    sort: 'codigo',
  })

  return {
    items: res.items,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
    page: res.page,
    perPage: res.perPage,
  }
}

export async function listarTodosCentrosCustoAtivos(assinanteId?: string): Promise<CentroCusto[]> {
  const conds = ['ativo = true']
  if (assinanteId) {
    conds.push(`assinante_id = '${assinanteId}'`)
  }
  return await pb.collection('centros_custo').getFullList<CentroCusto>({
    filter: conds.join(' && '),
    sort: 'codigo',
  })
}

export async function obterCentroCustoPorId(id: string): Promise<CentroCusto> {
  return await pb.collection('centros_custo').getOne<CentroCusto>(id)
}

export async function obterCentroCustoPorCodigo(
  codigo: string,
  assinanteId?: string,
): Promise<CentroCusto | null> {
  try {
    const filter = assinanteId
      ? `codigo = '${codigo.trim()}' && assinante_id = '${assinanteId}'`
      : `codigo = '${codigo.trim()}'`
    const rec = await pb.collection('centros_custo').getFirstListItem<CentroCusto>(filter)
    return rec
  } catch {
    return null
  }
}

export async function salvarCentroCusto(dados: Partial<CentroCusto>): Promise<CentroCusto> {
  const ehEdicao = Boolean(dados.id)
  let antes: CentroCusto | null = null

  if (!dados.codigo || !dados.codigo.trim()) {
    throw new Error('O código do centro de custo é obrigatório.')
  }
  if (!dados.descricao || !dados.descricao.trim()) {
    throw new Error('A descrição do centro de custo é obrigatória.')
  }

  const codigoLimpo = dados.codigo.trim()
  const existente = await obterCentroCustoPorCodigo(codigoLimpo)
  if (existente && (!ehEdicao || existente.id !== dados.id)) {
    throw new Error(`Já existe um centro de custo cadastrado com o código "${codigoLimpo}".`)
  }

  const payload: Record<string, unknown> = {
    codigo: codigoLimpo,
    descricao: dados.descricao.trim(),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salvo: CentroCusto
  if (ehEdicao && dados.id) {
    antes = await obterCentroCustoPorId(dados.id)
    salvo = await pb.collection('centros_custo').update<CentroCusto>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'centros_custo',
      registro_id: salvo.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salvo = await pb.collection('centros_custo').create<CentroCusto>(payload)

    await registrarAuditoria({
      tabela: 'centros_custo',
      registro_id: salvo.id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  return salvo
}

export async function inativarCentroCusto(id: string): Promise<void> {
  const antes = await obterCentroCustoPorId(id)

  const atualizado = await pb.collection('centros_custo').update<CentroCusto>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'centros_custo',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarCentroCusto(id: string): Promise<void> {
  const antes = await obterCentroCustoPorId(id)

  const atualizado = await pb.collection('centros_custo').update<CentroCusto>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'centros_custo',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}
