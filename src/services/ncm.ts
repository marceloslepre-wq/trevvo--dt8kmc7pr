import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface Ncm {
  id: string
  ativo: boolean
  codigo: string
  descricao: string
  ex_tipi?: string
  aliquota_ipi?: number
  unidade_tributavel?: string
  data_inicio?: string
  data_fim?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarNcmParams {
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

/**
 * Normaliza o código NCM removendo pontos, traços, espaços e outros não dígitos.
 */
export function normalizarCodigoNcm(codigo: string): string {
  if (!codigo) return ''
  return codigo.replace(/\D/g, '').trim()
}

/**
 * Formata o código NCM em 0000.00.00
 */
export function formatarCodigoNcm(codigo: string): string {
  const norm = normalizarCodigoNcm(codigo)
  if (norm.length !== 8) return codigo || ''
  return `${norm.slice(0, 4)}.${norm.slice(4, 6)}.${norm.slice(6, 8)}`
}

export async function listarNcm(params: ListarNcmParams = {}): Promise<ResultadoPaginado<Ncm>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const raw = params.busca.trim()
    const limpo = raw.replace(/['"]/g, '')
    const normalizado = normalizarCodigoNcm(raw)

    if (normalizado && normalizado.length >= 2) {
      condicoes.push(`(codigo ~ '${normalizado}' || descricao ~ '${limpo}')`)
    } else {
      condicoes.push(`(codigo ~ '${limpo}' || descricao ~ '${limpo}')`)
    }
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'codigo'

  const res = await pb.collection('ncm').getList<Ncm>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function obterNcmPorId(id: string): Promise<Ncm> {
  return await pb.collection('ncm').getOne<Ncm>(id)
}

export async function obterNcmPorCodigo(codigo: string): Promise<Ncm | null> {
  const norm = normalizarCodigoNcm(codigo)
  if (!norm) return null
  try {
    const res = await pb.collection('ncm').getList<Ncm>(1, 1, {
      filter: `codigo = '${norm}'`,
    })
    return res.items[0] || null
  } catch {
    return null
  }
}

export async function salvarNcm(dados: {
  id?: string
  codigo: string
  descricao: string
  ex_tipi?: string
  aliquota_ipi?: number | null
  unidade_tributavel?: string
  data_inicio?: string
  data_fim?: string
  ativo?: boolean
}): Promise<Ncm> {
  const codigoLimpo = normalizarCodigoNcm(dados.codigo)
  const descricaoLimpa = dados.descricao?.trim() || ''

  if (!codigoLimpo) {
    throw new Error('O código NCM é obrigatório.')
  }
  if (codigoLimpo.length !== 8) {
    throw new Error('O código NCM deve conter exatamente 8 dígitos numéricos.')
  }
  if (!descricaoLimpa) {
    throw new Error('A descrição da NCM é obrigatória.')
  }

  // Verifica duplicidade de código
  const duplicados = await pb.collection('ncm').getList<Ncm>(1, 1, {
    filter: dados.id
      ? `codigo = '${codigoLimpo}' && id != '${dados.id}'`
      : `codigo = '${codigoLimpo}'`,
  })
  if (duplicados.totalItems > 0) {
    throw new Error(`A NCM com código "${formatarCodigoNcm(codigoLimpo)}" já está cadastrada.`)
  }

  const payload = {
    codigo: codigoLimpo,
    descricao: descricaoLimpa,
    ex_tipi: dados.ex_tipi?.trim() || '',
    aliquota_ipi:
      dados.aliquota_ipi !== null && dados.aliquota_ipi !== undefined
        ? Number(dados.aliquota_ipi)
        : null,
    unidade_tributavel: dados.unidade_tributavel?.trim().toUpperCase() || '',
    data_inicio: dados.data_inicio?.trim() || '',
    data_fim: dados.data_fim?.trim() || '',
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: Ncm
  if (dados.id) {
    const antes = await obterNcmPorId(dados.id)
    salva = await pb.collection('ncm').update<Ncm>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'ncm',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('ncm').create<Ncm>({
      ...payload,
      created_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'ncm',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarNcm(id: string): Promise<void> {
  const antes = await obterNcmPorId(id)
  const atualizada = await pb.collection('ncm').update<Ncm>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'ncm',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarNcm(id: string): Promise<void> {
  const antes = await obterNcmPorId(id)
  const atualizada = await pb.collection('ncm').update<Ncm>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'ncm',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}
