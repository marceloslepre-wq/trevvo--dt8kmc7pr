import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import { obterUsuarioCacheLocal } from './usuarios'

export interface Marca {
  id: string
  ativo: boolean
  nome: string
  fabricante?: string
  observacao?: string
  assinante_id?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarMarcasParams {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
  assinante_id?: string
}

export interface ResultadoPaginado<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

export async function listarMarcas(
  params: ListarMarcasParams = {},
): Promise<ResultadoPaginado<Marca>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(nome ~ '${b}' || fabricante ~ '${b}' || observacao ~ '${b}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.assinante_id) {
    condicoes.push(`assinante_id = '${params.assinante_id}'`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'nome'

  const res = await pb.collection('marcas').getList<Marca>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarTodasMarcasAtivas(assinanteId?: string): Promise<Marca[]> {
  const conds = ['ativo = true']
  if (assinanteId) {
    conds.push(`assinante_id = '${assinanteId}'`)
  }
  return await pb.collection('marcas').getFullList<Marca>({
    filter: conds.join(' && '),
    sort: 'nome',
  })
}

export async function obterMarca(id: string): Promise<Marca> {
  return await pb.collection('marcas').getOne<Marca>(id)
}

export async function salvarMarca(dados: {
  id?: string
  nome: string
  fabricante?: string
  observacao?: string
  ativo?: boolean
  assinante_id?: string
}): Promise<Marca> {
  const user = pb.authStore.record
  const nomeFormatado = dados.nome.trim()
  const fabricanteFormatado = dados.fabricante?.trim() || ''
  const observacaoFormatada = dados.observacao?.trim() || ''

  if (!nomeFormatado) {
    throw new Error('O nome da marca é obrigatório.')
  }

  const authRecord = user as { assinante_id?: string; id?: string; email?: string } | null
  const assinanteIdAtivo =
    dados.assinante_id ||
    authRecord?.assinante_id ||
    obterUsuarioCacheLocal(user?.id || authRecord?.email)?.assinante_id ||
    null

  // Verificar duplicidade de nome dentro do mesmo assinante (ou geral se assinante não definido)
  const condsDuplicidade: string[] = [
    dados.id
      ? `nome = '${nomeFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `nome = '${nomeFormatado.replace(/'/g, "\\'")}'`,
  ]
  if (assinanteIdAtivo) {
    condsDuplicidade.push(`assinante_id = '${assinanteIdAtivo}'`)
  }

  const duplicados = await pb.collection('marcas').getList<Marca>(1, 1, {
    filter: condsDuplicidade.join(' && '),
  })

  if (duplicados.totalItems > 0) {
    throw new Error(`A marca "${nomeFormatado}" já está cadastrada.`)
  }

  const payload: Record<string, unknown> = {
    nome: nomeFormatado,
    fabricante: fabricanteFormatado,
    observacao: observacaoFormatada,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  let salva: Marca
  if (dados.id) {
    const antes = await obterMarca(dados.id)
    if (dados.ativo === undefined) {
      payload.ativo = antes.ativo
    }

    // Sanitizar payload no update: remover assinante_id (a regra exige @request.body.assinante_id:isset = false)
    // e campos de sistema imutáveis (id, collectionId, collectionName, created, updated, created_by, expand)
    const {
      assinante_id: _a,
      id: _i,
      collectionId: _c1,
      collectionName: _c2,
      created: _c,
      updated: _u,
      created_by: _cb,
      expand: _exp,
      ...payloadUpdate
    } = payload

    salva = await pb.collection('marcas').update<Marca>(dados.id, payloadUpdate)

    await registrarAuditoria({
      tabela: 'marcas',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    // No create, a regra exige assinante_id = @request.auth.assinante_id
    payload.assinante_id = assinanteIdAtivo
    payload.created_by = user?.id || null

    delete payload.id
    delete (payload as Record<string, unknown>).collectionId
    delete (payload as Record<string, unknown>).collectionName
    delete (payload as Record<string, unknown>).created
    delete (payload as Record<string, unknown>).updated
    delete (payload as Record<string, unknown>).expand

    salva = await pb.collection('marcas').create<Marca>(payload)

    await registrarAuditoria({
      tabela: 'marcas',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_antes: null,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarMarca(id: string): Promise<void> {
  const antes = await obterMarca(id)
  const atualizada = await pb.collection('marcas').update<Marca>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'marcas',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarMarca(id: string): Promise<void> {
  const antes = await obterMarca(id)
  const atualizada = await pb.collection('marcas').update<Marca>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'marcas',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}
