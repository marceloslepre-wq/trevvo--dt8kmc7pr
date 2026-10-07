import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type TipoEntradaNota =
  | 'Compra para revenda'
  | 'Compra para industrialização'
  | 'Uso e consumo'
  | 'Ativo imobilizado'
  | 'Bonificação'
  | 'Devolução de venda'
  | 'Outras entradas'

export const TIPOS_ENTRADA: TipoEntradaNota[] = [
  'Compra para revenda',
  'Compra para industrialização',
  'Uso e consumo',
  'Ativo imobilizado',
  'Bonificação',
  'Devolução de venda',
  'Outras entradas',
]

export interface CfopConversaoEntrada {
  id: string
  cfop_fornecedor: string
  tipo_entrada: TipoEntradaNota
  cfop_entrada: string
  descricao?: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarCfopConversaoParams {
  busca?: string
  tipo_entrada?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export interface ResultadoPaginadoConversao {
  items: CfopConversaoEntrada[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

export async function listarCfopConversao(
  params: ListarCfopConversaoParams = {},
): Promise<ResultadoPaginadoConversao> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(cfop_fornecedor ~ '${b}' || cfop_entrada ~ '${b}' || descricao ~ '${b}')`)
  }

  if (params.tipo_entrada && params.tipo_entrada !== 'todos') {
    condicoes.push(`tipo_entrada = '${params.tipo_entrada}'`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'cfop_fornecedor,tipo_entrada'

  const res = await pb
    .collection('cfop_conversao_entrada')
    .getList<CfopConversaoEntrada>(page, perPage, {
      filter,
      sort,
    })

  return {
    items: res.items,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
    page: res.page,
    perPage: res.perPage,
  }
}

export async function obterCfopConversao(id: string): Promise<CfopConversaoEntrada> {
  return await pb.collection('cfop_conversao_entrada').getOne<CfopConversaoEntrada>(id)
}

export async function salvarCfopConversao(dados: {
  id?: string
  cfop_fornecedor: string
  tipo_entrada: TipoEntradaNota
  cfop_entrada: string
  descricao?: string
  ativo?: boolean
}): Promise<CfopConversaoEntrada> {
  const user = pb.authStore.record
  const limpoFornecedor = dados.cfop_fornecedor.replace(/\D/g, '').slice(0, 4)
  const limpoEntrada = dados.cfop_entrada.replace(/\D/g, '').slice(0, 4)

  if (limpoFornecedor.length !== 4) {
    throw new Error('CFOP do fornecedor deve ter 4 dígitos numéricos.')
  }
  if (limpoEntrada.length !== 4) {
    throw new Error('CFOP de entrada deve ter 4 dígitos numéricos.')
  }

  const payload: Record<string, unknown> = {
    cfop_fornecedor: limpoFornecedor,
    tipo_entrada: dados.tipo_entrada,
    cfop_entrada: limpoEntrada,
    descricao:
      dados.descricao?.trim() ||
      `Conversão ${limpoFornecedor} → ${limpoEntrada} (${dados.tipo_entrada})`,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  if (dados.id) {
    const antes = await obterCfopConversao(dados.id)
    const atualizado = await pb
      .collection('cfop_conversao_entrada')
      .update<CfopConversaoEntrada>(dados.id, payload)
    await registrarAuditoria({
      tabela: 'cfop_conversao_entrada',
      registro_id: dados.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: atualizado as unknown as Record<string, unknown>,
    })
    return atualizado
  }

  payload.created_by = user?.id || null
  const criado = await pb.collection('cfop_conversao_entrada').create<CfopConversaoEntrada>(payload)
  await registrarAuditoria({
    tabela: 'cfop_conversao_entrada',
    registro_id: criado.id,
    acao: 'inclusao',
    valores_depois: criado as unknown as Record<string, unknown>,
  })
  return criado
}

export async function inativarCfopConversao(id: string): Promise<CfopConversaoEntrada> {
  const antes = await obterCfopConversao(id)
  const user = pb.authStore.record
  const atualizado = await pb
    .collection('cfop_conversao_entrada')
    .update<CfopConversaoEntrada>(id, {
      ativo: false,
      updated_by: user?.id || null,
    })
  await registrarAuditoria({
    tabela: 'cfop_conversao_entrada',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
  return atualizado
}

export async function ativarCfopConversao(id: string): Promise<CfopConversaoEntrada> {
  const antes = await obterCfopConversao(id)
  const user = pb.authStore.record
  const atualizado = await pb
    .collection('cfop_conversao_entrada')
    .update<CfopConversaoEntrada>(id, {
      ativo: true,
      updated_by: user?.id || null,
    })
  await registrarAuditoria({
    tabela: 'cfop_conversao_entrada',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
  return atualizado
}

/**
 * Converte o CFOP do fornecedor para o CFOP da nossa entrada com base no tipo_entrada.
 * Se houver conversão cadastrada e ativa, retorna o cfop_entrada e marcadoRevisao = false.
 * Se não houver conversão cadastrada, aplica a regra padrão (5->1, 6->2, 7->3) e marcadoRevisao = true.
 */
export async function converterCfopEntrada(
  cfopFornecedor: string,
  tipoEntrada: TipoEntradaNota,
): Promise<{ cfopEntrada: string; marcadoRevisao: boolean }> {
  const limpo = (cfopFornecedor || '').replace(/\D/g, '')
  if (!limpo) {
    return { cfopEntrada: '', marcadoRevisao: true }
  }

  try {
    const res = await pb.collection('cfop_conversao_entrada').getFullList<CfopConversaoEntrada>({
      filter: `cfop_fornecedor = '${limpo}' && tipo_entrada = '${tipoEntrada}' && ativo = true`,
    })
    if (res.length > 0 && res[0].cfop_entrada) {
      return { cfopEntrada: res[0].cfop_entrada, marcadoRevisao: false }
    }
  } catch {
    // continua para a regra padrão
  }

  // Regra padrão de espelhamento:
  // primeiro dígito: 5 -> 1, 6 -> 2, 7 -> 3
  const primeiro = limpo.charAt(0)
  const resto = limpo.slice(1)
  let primeiroConvertido = primeiro
  if (primeiro === '5') primeiroConvertido = '1'
  else if (primeiro === '6') primeiroConvertido = '2'
  else if (primeiro === '7') primeiroConvertido = '3'

  const derivado = `${primeiroConvertido}${resto}`
  return { cfopEntrada: derivado, marcadoRevisao: true }
}
