import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface Marca {
  id: string
  ativo: boolean
  nome: string
  fabricante?: string
  observacao?: string
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

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'nome'

  const res = await pb.collection('marcas').getList<Marca>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarTodasMarcasAtivas(): Promise<Marca[]> {
  return await pb.collection('marcas').getFullList<Marca>({
    filter: 'ativo = true',
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
}): Promise<Marca> {
  const nomeFormatado = dados.nome.trim()
  const fabricanteFormatado = dados.fabricante?.trim() || ''
  const observacaoFormatada = dados.observacao?.trim() || ''

  if (!nomeFormatado) {
    throw new Error('O nome da marca é obrigatório.')
  }

  // Verificar duplicidade de nome
  const duplicados = await pb.collection('marcas').getList<Marca>(1, 1, {
    filter: dados.id
      ? `nome = '${nomeFormatado.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `nome = '${nomeFormatado.replace(/'/g, "\\'")}'`,
  })

  if (duplicados.totalItems > 0) {
    throw new Error(`A marca "${nomeFormatado}" já está cadastrada.`)
  }

  let salva: Marca
  if (dados.id) {
    const antes = await obterMarca(dados.id)
    salva = await pb.collection('marcas').update<Marca>(dados.id, {
      nome: nomeFormatado,
      fabricante: fabricanteFormatado,
      observacao: observacaoFormatada,
      ativo: dados.ativo !== undefined ? dados.ativo : antes.ativo,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'marcas',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('marcas').create<Marca>({
      nome: nomeFormatado,
      fabricante: fabricanteFormatado,
      observacao: observacaoFormatada,
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'marcas',
      registro_id: salva.id,
      acao: 'inclusao',
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
