import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface UnidadeMedida {
  id: string
  ativo: boolean
  sigla: string
  descricao: string
  aceita_fracionado: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarUnidadesMedidaParams {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export interface ResultadoPaginado<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export async function listarUnidadesMedida(
  params: ListarUnidadesMedidaParams = {},
): Promise<ResultadoPaginado<UnidadeMedida>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(sigla ~ '${b}' || descricao ~ '${b}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'sigla'

  const res = await pb.collection('unidades_medida').getList<UnidadeMedida>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarTodasUnidadesMedidaAtivas(): Promise<UnidadeMedida[]> {
  return await pb.collection('unidades_medida').getFullList<UnidadeMedida>({
    filter: 'ativo = true',
    sort: 'sigla',
  })
}

export async function obterUnidadeMedida(id: string): Promise<UnidadeMedida> {
  return await pb.collection('unidades_medida').getOne<UnidadeMedida>(id)
}

export async function salvarUnidadeMedida(dados: {
  id?: string
  sigla: string
  descricao: string
  aceita_fracionado: boolean
  ativo?: boolean
}): Promise<UnidadeMedida> {
  const siglaFormatada = dados.sigla.trim().toUpperCase()
  const descricaoFormatada = dados.descricao.trim()

  if (!siglaFormatada) {
    throw new Error('A sigla da unidade de medida é obrigatória.')
  }
  if (siglaFormatada.length > 6) {
    throw new Error('A sigla deve ter no máximo 6 caracteres.')
  }
  if (!descricaoFormatada) {
    throw new Error('A descrição da unidade de medida é obrigatória.')
  }

  // Verifica unicidade da sigla
  const duplicados = await pb.collection('unidades_medida').getList<UnidadeMedida>(1, 1, {
    filter: dados.id
      ? `sigla = '${siglaFormatada}' && id != '${dados.id}'`
      : `sigla = '${siglaFormatada}'`,
  })
  if (duplicados.totalItems > 0) {
    throw new Error(`A sigla "${siglaFormatada}" já está cadastrada.`)
  }

  let salva: UnidadeMedida
  if (dados.id) {
    const antes = await obterUnidadeMedida(dados.id)
    salva = await pb.collection('unidades_medida').update<UnidadeMedida>(dados.id, {
      sigla: siglaFormatada,
      descricao: descricaoFormatada,
      aceita_fracionado: Boolean(dados.aceita_fracionado),
      ativo: dados.ativo !== undefined ? dados.ativo : antes.ativo,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'unidades_medida',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('unidades_medida').create<UnidadeMedida>({
      sigla: siglaFormatada,
      descricao: descricaoFormatada,
      aceita_fracionado: Boolean(dados.aceita_fracionado),
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'unidades_medida',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarUnidadeMedida(id: string): Promise<void> {
  const antes = await obterUnidadeMedida(id)
  const atualizada = await pb.collection('unidades_medida').update<UnidadeMedida>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'unidades_medida',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarUnidadeMedida(id: string): Promise<void> {
  const antes = await obterUnidadeMedida(id)
  const atualizada = await pb.collection('unidades_medida').update<UnidadeMedida>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'unidades_medida',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}
