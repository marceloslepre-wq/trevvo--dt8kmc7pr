import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type TipoMovimentoCfop = 'Entrada' | 'Saída'
export type AbrangenciaCfop = 'Estadual' | 'Interestadual' | 'Exterior'

export interface Cfop {
  id: string
  ativo: boolean
  codigo: string
  descricao: string
  aplicacao?: string
  tipo_movimento: TipoMovimentoCfop
  abrangencia: AbrangenciaCfop
  gera_financeiro: boolean
  movimenta_estoque: boolean
  devolucao: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarCfopParams {
  busca?: string
  tipo_movimento?: 'todos' | TipoMovimentoCfop
  abrangencia?: 'todas' | AbrangenciaCfop
  situacao?: 'todos' | 'ativos' | 'inativos'
  gera_financeiro?: boolean
  movimenta_estoque?: boolean
  devolucao?: boolean
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

export interface ItemImportacaoCfop {
  codigo: string
  descricao: string
  aplicacao?: string
}

export interface ResumoImportacaoCfop {
  totalLidos: number
  validos: number
  ignorados: number
  itensValidos: ItemImportacaoCfop[]
  erros: { linha: number; mensagem: string }[]
}

/**
 * Normaliza o código CFOP removendo pontos e espaços (4 dígitos numéricos).
 */
export function normalizarCodigoCfop(codigo: string): string {
  if (!codigo) return ''
  return codigo.replace(/\D/g, '').trim()
}

/**
 * Formata CFOP no padrão 0.000
 */
export function formatarCodigoCfop(codigo: string): string {
  const norm = normalizarCodigoCfop(codigo)
  if (norm.length !== 4) return codigo || ''
  return `${norm.slice(0, 1)}.${norm.slice(1, 4)}`
}

/**
 * Deriva automaticamente o tipo de movimento a partir do primeiro dígito do código CFOP.
 * 1, 2 ou 3 = Entrada; 5, 6 ou 7 = Saída.
 */
export function derivarTipoMovimentoCfop(codigo: string): TipoMovimentoCfop {
  const norm = normalizarCodigoCfop(codigo)
  const primeiro = norm.charAt(0)
  if (primeiro === '1' || primeiro === '2' || primeiro === '3') {
    return 'Entrada'
  }
  return 'Saída'
}

/**
 * Deriva automaticamente a abrangência a partir do primeiro dígito do código CFOP.
 * 1 ou 5 = Estadual; 2 ou 6 = Interestadual; 3 ou 7 = Exterior.
 */
export function derivarAbrangenciaCfop(codigo: string): AbrangenciaCfop {
  const norm = normalizarCodigoCfop(codigo)
  const primeiro = norm.charAt(0)
  if (primeiro === '2' || primeiro === '6') {
    return 'Interestadual'
  }
  if (primeiro === '3' || primeiro === '7') {
    return 'Exterior'
  }
  return 'Estadual'
}

export async function listarCfop(params: ListarCfopParams = {}): Promise<ResultadoPaginado<Cfop>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const raw = params.busca.trim()
    const limpo = raw.replace(/['"]/g, '')
    const cfopNorm = normalizarCodigoCfop(raw)

    if (cfopNorm && cfopNorm.length >= 2) {
      condicoes.push(`(codigo ~ '${cfopNorm}' || descricao ~ '${limpo}' || aplicacao ~ '${limpo}')`)
    } else {
      condicoes.push(`(codigo ~ '${limpo}' || descricao ~ '${limpo}' || aplicacao ~ '${limpo}')`)
    }
  }

  if (params.tipo_movimento && params.tipo_movimento !== 'todos') {
    condicoes.push(`tipo_movimento = '${params.tipo_movimento}'`)
  }

  if (params.abrangencia && params.abrangencia !== 'todas') {
    condicoes.push(`abrangencia = '${params.abrangencia}'`)
  }

  if (params.gera_financeiro !== undefined) {
    condicoes.push(`gera_financeiro = ${params.gera_financeiro}`)
  }

  if (params.movimenta_estoque !== undefined) {
    condicoes.push(`movimenta_estoque = ${params.movimenta_estoque}`)
  }

  if (params.devolucao !== undefined) {
    condicoes.push(`devolucao = ${params.devolucao}`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'codigo'

  const res = await pb.collection('cfop').getList<Cfop>(page, perPage, {
    filter,
    sort,
  })

  return res
}

export async function listarTodosCfopAtivos(tipoMovimento?: TipoMovimentoCfop): Promise<Cfop[]> {
  const condicoes = ['ativo = true']
  if (tipoMovimento) {
    condicoes.push(`tipo_movimento = '${tipoMovimento}'`)
  }
  return await pb.collection('cfop').getFullList<Cfop>({
    filter: condicoes.join(' && '),
    sort: 'codigo',
  })
}

export async function obterCfopPorId(id: string): Promise<Cfop> {
  return await pb.collection('cfop').getOne<Cfop>(id)
}

export async function obterCfopPorCodigo(codigo: string): Promise<Cfop | null> {
  const norm = normalizarCodigoCfop(codigo)
  if (!norm) return null
  try {
    const res = await pb.collection('cfop').getList<Cfop>(1, 1, {
      filter: `codigo = '${norm}'`,
    })
    return res.items[0] || null
  } catch {
    return null
  }
}

export async function salvarCfop(dados: {
  id?: string
  codigo: string
  descricao: string
  aplicacao?: string
  gera_financeiro: boolean
  movimenta_estoque: boolean
  devolucao: boolean
  ativo?: boolean
}): Promise<Cfop> {
  const codigoLimpo = normalizarCodigoCfop(dados.codigo)
  const descricaoLimpa = dados.descricao?.trim() || ''
  const aplicacaoLimpa = (dados.aplicacao || '').trim()

  if (!codigoLimpo) {
    throw new Error('O código CFOP é obrigatório.')
  }
  if (codigoLimpo.length !== 4) {
    throw new Error('O código CFOP deve conter exatamente 4 dígitos numéricos.')
  }
  const primeiro = codigoLimpo.charAt(0)
  if (!['1', '2', '3', '5', '6', '7'].includes(primeiro)) {
    throw new Error('O código CFOP deve iniciar com 1, 2, 3, 5, 6 ou 7.')
  }
  if (!descricaoLimpa) {
    throw new Error('A descrição do CFOP é obrigatória.')
  }

  // Verifica duplicidade
  const duplicados = await pb.collection('cfop').getList<Cfop>(1, 1, {
    filter: dados.id
      ? `codigo = '${codigoLimpo}' && id != '${dados.id}'`
      : `codigo = '${codigoLimpo}'`,
  })
  if (duplicados.totalItems > 0) {
    throw new Error(`O CFOP "${formatarCodigoCfop(codigoLimpo)}" já está cadastrado.`)
  }

  const tipo_movimento = derivarTipoMovimentoCfop(codigoLimpo)
  const abrangencia = derivarAbrangenciaCfop(codigoLimpo)

  const payload = {
    codigo: codigoLimpo,
    descricao: descricaoLimpa,
    aplicacao: aplicacaoLimpa,
    tipo_movimento,
    abrangencia,
    gera_financeiro: Boolean(dados.gera_financeiro),
    movimenta_estoque: Boolean(dados.movimenta_estoque),
    devolucao: Boolean(dados.devolucao),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: Cfop
  if (dados.id) {
    const antes = await obterCfopPorId(dados.id)
    salva = await pb.collection('cfop').update<Cfop>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'cfop',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('cfop').create<Cfop>({
      ...payload,
      created_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'cfop',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarCfop(id: string): Promise<void> {
  const antes = await obterCfopPorId(id)
  const atualizada = await pb.collection('cfop').update<Cfop>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'cfop',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarCfop(id: string): Promise<void> {
  const antes = await obterCfopPorId(id)
  const atualizada = await pb.collection('cfop').update<Cfop>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'cfop',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

/**
 * Analisa arquivo CSV com colunas: codigo;descricao;aplicacao
 */
export async function analisarCSVCfop(conteudoCSV: string): Promise<ResumoImportacaoCfop> {
  const linhas = conteudoCSV.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const erros: { linha: number; mensagem: string }[] = []
  const itensValidos: ItemImportacaoCfop[] = []
  let totalLidos = 0
  let ignorados = 0

  let indiceInicio = 0
  if (linhas.length > 0) {
    const p1 = linhas[0].toLowerCase()
    if (p1.includes('codigo') && p1.includes('descricao')) {
      indiceInicio = 1
    }
  }

  totalLidos = linhas.length - indiceInicio

  for (let i = indiceInicio; i < linhas.length; i++) {
    const linhaNum = i + 1
    const texto = linhas[i].trim()
    if (!texto) continue

    const partes = texto.includes(';') ? texto.split(';') : texto.split(',')
    if (partes.length < 2) {
      erros.push({
        linha: linhaNum,
        mensagem: 'Formato inválido. Esperado pelo menos: codigo;descricao',
      })
      ignorados++
      continue
    }

    const rawCodigo = partes[0]?.trim().replace(/^["']|["']$/g, '') || ''
    const codigoNorm = normalizarCodigoCfop(rawCodigo)
    const descricao = partes[1]?.trim().replace(/^["']|["']$/g, '') || ''
    const aplicacao = partes[2]
      ? partes
          .slice(2)
          .join(';')
          .trim()
          .replace(/^["']|["']$/g, '')
      : ''

    if (codigoNorm.length !== 4) {
      erros.push({
        linha: linhaNum,
        mensagem: `CFOP "${rawCodigo}" inválido: deve ter 4 dígitos numéricos.`,
      })
      ignorados++
      continue
    }

    const primeiro = codigoNorm.charAt(0)
    if (!['1', '2', '3', '5', '6', '7'].includes(primeiro)) {
      erros.push({
        linha: linhaNum,
        mensagem: `CFOP ${codigoNorm} não possui primeiro dígito válido (esperado 1, 2, 3, 5, 6 ou 7).`,
      })
      ignorados++
      continue
    }

    if (!descricao) {
      erros.push({
        linha: linhaNum,
        mensagem: `CFOP ${codigoNorm} sem descrição.`,
      })
      ignorados++
      continue
    }

    itensValidos.push({
      codigo: codigoNorm,
      descricao,
      aplicacao,
    })
  }

  // Deduplica pelo código do CFOP mantendo o último
  const mapUnicos = new Map<string, ItemImportacaoCfop>()
  for (const item of itensValidos) {
    mapUnicos.set(item.codigo, item)
  }
  const listaFinal = Array.from(mapUnicos.values())

  return {
    totalLidos,
    validos: listaFinal.length,
    ignorados: ignorados + (itensValidos.length - listaFinal.length),
    itensValidos: listaFinal,
    erros,
  }
}

/**
 * Executa importação em lotes com upsert por código CFOP
 */
export async function executarImportacaoCfopEmLotes(
  itens: ItemImportacaoCfop[],
  onProgresso?: (
    processados: number,
    total: number,
    stats: { inseridos: number; atualizados: number },
  ) => void,
): Promise<{ inseridos: number; atualizados: number; erros: number }> {
  let inseridos = 0
  let atualizados = 0
  let erros = 0

  const batchSize = 25
  const total = itens.length

  for (let i = 0; i < total; i += batchSize) {
    const lote = itens.slice(i, i + batchSize)

    await Promise.all(
      lote.map(async (item) => {
        try {
          const existente = await pb.collection('cfop').getList<Cfop>(1, 1, {
            filter: `codigo = '${item.codigo}'`,
          })

          const tipoMov = derivarTipoMovimentoCfop(item.codigo)
          const abrang = derivarAbrangenciaCfop(item.codigo)

          if (existente.totalItems > 0) {
            const antes = existente.items[0]
            const salvo = await pb.collection('cfop').update<Cfop>(antes.id, {
              descricao: item.descricao,
              aplicacao: item.aplicacao || antes.aplicacao || '',
              tipo_movimento: tipoMov,
              abrangencia: abrang,
              ativo: true,
              updated_by: pb.authStore.record?.id || null,
            })
            atualizados++

            await registrarAuditoria({
              tabela: 'cfop',
              registro_id: salvo.id,
              acao: 'alteracao',
              valores_antes: antes as unknown as Record<string, unknown>,
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          } else {
            const salvo = await pb.collection('cfop').create<Cfop>({
              codigo: item.codigo,
              descricao: item.descricao,
              aplicacao: item.aplicacao || '',
              tipo_movimento: tipoMov,
              abrangencia: abrang,
              gera_financeiro: true,
              movimenta_estoque: true,
              devolucao:
                item.descricao.toLowerCase().includes('devolução') ||
                item.descricao.toLowerCase().includes('devolucao'),
              ativo: true,
              created_by: pb.authStore.record?.id || null,
            })
            inseridos++

            await registrarAuditoria({
              tabela: 'cfop',
              registro_id: salvo.id,
              acao: 'inclusao',
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          }
        } catch (err) {
          console.error(`Erro ao importar CFOP ${item.codigo}:`, err)
          erros++
        }
      }),
    )

    const processados = Math.min(i + batchSize, total)
    if (onProgresso) {
      onProgresso(processados, total, { inseridos, atualizados })
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return { inseridos, atualizados, erros }
}
