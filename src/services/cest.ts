import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface Cest {
  id: string
  ativo: boolean
  codigo: string
  ncm_codigos?: string
  segmento?: string
  item?: string
  descricao: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarCestParams {
  busca?: string
  ncmFiltro?: string
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

export interface ItemImportacaoCest {
  codigo: string
  ncm: string
  segmento: string
  item: string
  descricao: string
}

export interface ResumoImportacaoCest {
  totalLidos: number
  validos: number
  ignorados: number
  itensValidos: ItemImportacaoCest[]
  erros: { linha: number; mensagem: string }[]
}

/**
 * Normaliza o código CEST removendo pontos, traços e espaços (7 dígitos numéricos).
 */
export function normalizarCodigoCest(codigo: string): string {
  if (!codigo) return ''
  return codigo.replace(/\D/g, '').trim()
}

/**
 * Formata CEST no padrão 00.000.00
 */
export function formatarCodigoCest(codigo: string): string {
  const norm = normalizarCodigoCest(codigo)
  if (norm.length !== 7) return codigo || ''
  return `${norm.slice(0, 2)}.${norm.slice(2, 5)}.${norm.slice(5, 7)}`
}

/**
 * Normaliza uma string de NCMs ou prefixos separados por vírgula.
 */
export function normalizarListaNcm(ncmCodigos: string): string {
  if (!ncmCodigos) return ''
  return ncmCodigos
    .split(/[,;\s]+/)
    .map((item) => item.replace(/\D/g, '').trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * Verifica se um NCM informado corresponde a um registro CEST (exato ou por prefixo).
 * Ex: Se ncm_codigos tem "2202, 22030000", uma busca por "22021000" casará porque "2202" é prefixo de "22021000".
 * Se a busca for "22030000", casará por igualdade exata.
 * Também aceita se o NCM cadastrado for mais longo e começar com o termo buscado.
 */
export function ncmCorrespondeAoCest(ncmInformado: string, ncmCodigosCest?: string): boolean {
  if (!ncmInformado || !ncmCodigosCest) return false
  const ncmAlvo = ncmInformado.replace(/\D/g, '').trim()
  if (!ncmAlvo) return false

  const lista = ncmCodigosCest
    .split(/[,;\s]+/)
    .map((item) => item.replace(/\D/g, '').trim())
    .filter(Boolean)

  for (const ncmItem of lista) {
    if (ncmItem === ncmAlvo) return true
    // Se o NCM cadastrado no CEST é um prefixo do NCM informado (ex: ncmItem = '2202' e alvo = '22021000')
    if (ncmAlvo.startsWith(ncmItem)) return true
    // Se o NCM informado é um prefixo do NCM cadastrado (ex: alvo = '2203' e ncmItem = '22030000')
    if (ncmItem.startsWith(ncmAlvo)) return true
  }

  return false
}

/**
 * Função reutilizável: sugere os registros CEST aplicáveis a um determinado NCM.
 * Retorna os CEST cujo ncm_codigos contém o NCM exato ou um prefixo dele.
 * REGISTRADA no PROJETO_ERP.md conforme requisitos.
 */
export async function sugerirCestPorNcm(ncm: string): Promise<Cest[]> {
  const ncmLimpo = ncm.replace(/\D/g, '').trim()
  if (!ncmLimpo) return []

  // Carrega os CEST ativos
  const todosCest = await pb.collection('cest').getFullList<Cest>({
    filter: 'ativo = true',
    sort: 'codigo',
  })

  return todosCest.filter((c) => ncmCorrespondeAoCest(ncmLimpo, c.ncm_codigos))
}

export async function listarCest(params: ListarCestParams = {}): Promise<ResultadoPaginado<Cest>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  const termoBusca = params.busca?.trim() || ''
  const ncmFiltro = params.ncmFiltro?.replace(/\D/g, '').trim() || ''

  // Se houver busca por NCM com lógica de prefixos
  const precisaFiltroNcmEmMemoria =
    Boolean(ncmFiltro) || (Boolean(termoBusca) && /^\d{4,8}$/.test(termoBusca.replace(/\D/g, '')))

  if (!precisaFiltroNcmEmMemoria) {
    if (termoBusca) {
      const limpo = termoBusca.replace(/['"]/g, '')
      const cestNorm = normalizarCodigoCest(termoBusca)
      if (cestNorm && cestNorm.length >= 2) {
        condicoes.push(
          `(codigo ~ '${cestNorm}' || descricao ~ '${limpo}' || segmento ~ '${limpo}' || ncm_codigos ~ '${cestNorm}')`,
        )
      } else {
        condicoes.push(
          `(codigo ~ '${limpo}' || descricao ~ '${limpo}' || segmento ~ '${limpo}' || ncm_codigos ~ '${limpo}')`,
        )
      }
    }

    if (params.situacao === 'ativos') {
      condicoes.push('ativo = true')
    } else if (params.situacao === 'inativos') {
      condicoes.push('ativo = false')
    }

    const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
    const sort = params.ordenacao || 'codigo'

    return await pb.collection('cest').getList<Cest>(page, perPage, {
      filter,
      sort,
    })
  }

  // Quando busca por NCM exato/prefixo: filtramos no banco por ativo/situação e aplicamos o casamento de prefixo
  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }
  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  // Carrega todos para aplicar a verificação precisa de prefixo e paginação
  const todos = await pb.collection('cest').getFullList<Cest>({
    filter,
    sort: params.ordenacao || 'codigo',
  })

  const alvoNcm = ncmFiltro || termoBusca.replace(/\D/g, '')

  const filtrados = todos.filter((item) => {
    // Casamento por NCM (exato ou prefixo)
    const casaNcm = ncmCorrespondeAoCest(alvoNcm, item.ncm_codigos)
    if (casaNcm) return true

    // Se usuário digitou texto que não é só NCM
    if (termoBusca) {
      const t = termoBusca.toLowerCase()
      if (
        item.codigo.toLowerCase().includes(t) ||
        item.descricao.toLowerCase().includes(t) ||
        (item.segmento && item.segmento.toLowerCase().includes(t))
      ) {
        return true
      }
    }

    return false
  })

  const totalItems = filtrados.length
  const totalPages = Math.ceil(totalItems / perPage) || 1
  const offset = (page - 1) * perPage
  const paginados = filtrados.slice(offset, offset + perPage)

  return {
    page,
    perPage,
    totalItems,
    totalPages,
    items: paginados,
  }
}

export async function obterCestPorId(id: string): Promise<Cest> {
  return await pb.collection('cest').getOne<Cest>(id)
}

export async function obterCestPorCodigo(codigo: string): Promise<Cest | null> {
  const norm = normalizarCodigoCest(codigo)
  if (!norm) return null
  try {
    const res = await pb.collection('cest').getList<Cest>(1, 1, {
      filter: `codigo = '${norm}'`,
    })
    return res.items[0] || null
  } catch {
    return null
  }
}

export async function salvarCest(dados: {
  id?: string
  codigo: string
  ncm_codigos?: string
  segmento?: string
  item?: string
  descricao: string
  ativo?: boolean
}): Promise<Cest> {
  const codigoLimpo = normalizarCodigoCest(dados.codigo)
  const descricaoLimpa = dados.descricao?.trim() || ''
  const ncmCodigosFormatados = normalizarListaNcm(dados.ncm_codigos || '')
  const segmentoLimpo = dados.segmento?.trim() || ''
  const itemLimpo = dados.item?.trim() || ''

  if (!codigoLimpo) {
    throw new Error('O código CEST é obrigatório.')
  }
  if (codigoLimpo.length !== 7) {
    throw new Error('O código CEST deve conter exatamente 7 dígitos numéricos.')
  }
  if (!descricaoLimpa) {
    throw new Error('A descrição do CEST é obrigatória.')
  }

  // Verifica duplicidade
  const duplicados = await pb.collection('cest').getList<Cest>(1, 1, {
    filter: dados.id
      ? `codigo = '${codigoLimpo}' && id != '${dados.id}'`
      : `codigo = '${codigoLimpo}'`,
  })
  if (duplicados.totalItems > 0) {
    throw new Error(`O CEST "${formatarCodigoCest(codigoLimpo)}" já está cadastrado.`)
  }

  const payload = {
    codigo: codigoLimpo,
    ncm_codigos: ncmCodigosFormatados,
    segmento: segmentoLimpo,
    item: itemLimpo,
    descricao: descricaoLimpa,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: Cest
  if (dados.id) {
    const antes = await obterCestPorId(dados.id)
    salva = await pb.collection('cest').update<Cest>(dados.id, payload)

    await registrarAuditoria({
      tabela: 'cest',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    salva = await pb.collection('cest').create<Cest>({
      ...payload,
      created_by: pb.authStore.record?.id || null,
    })

    await registrarAuditoria({
      tabela: 'cest',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarCest(id: string): Promise<void> {
  const antes = await obterCestPorId(id)
  const atualizada = await pb.collection('cest').update<Cest>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'cest',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

export async function ativarCest(id: string): Promise<void> {
  const antes = await obterCestPorId(id)
  const atualizada = await pb.collection('cest').update<Cest>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'cest',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })
}

/**
 * Analisa CSV com colunas: codigo;ncm;segmento;item;descricao
 */
export async function analisarCSVCest(conteudoCSV: string): Promise<ResumoImportacaoCest> {
  const linhas = conteudoCSV.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const erros: { linha: number; mensagem: string }[] = []
  const itensValidos: ItemImportacaoCest[] = []
  let totalLidos = 0
  let ignorados = 0

  let indiceInicio = 0
  if (linhas.length > 0) {
    const p1 = linhas[0].toLowerCase()
    if (p1.includes('codigo') && (p1.includes('ncm') || p1.includes('descricao'))) {
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
        mensagem: 'Formato inválido. Esperado: codigo;ncm;segmento;item;descricao',
      })
      ignorados++
      continue
    }

    const rawCodigo = partes[0]?.trim().replace(/^["']|["']$/g, '') || ''
    const codigoNorm = normalizarCodigoCest(rawCodigo)
    const ncm = partes[1]?.trim().replace(/^["']|["']$/g, '') || ''
    const segmento = partes[2]?.trim().replace(/^["']|["']$/g, '') || ''
    const item = partes[3]?.trim().replace(/^["']|["']$/g, '') || ''
    const descricao = (partes.length > 4 ? partes.slice(4).join(';') : partes[1] || '')
      .trim()
      .replace(/^["']|["']$/g, '')

    if (codigoNorm.length !== 7) {
      erros.push({
        linha: linhaNum,
        mensagem: `CEST "${rawCodigo}" inválido: precisa ter 7 dígitos.`,
      })
      ignorados++
      continue
    }

    if (!descricao) {
      erros.push({
        linha: linhaNum,
        mensagem: `CEST ${codigoNorm} sem descrição.`,
      })
      ignorados++
      continue
    }

    itensValidos.push({
      codigo: codigoNorm,
      ncm: normalizarListaNcm(ncm),
      segmento,
      item,
      descricao,
    })
  }

  // Deduplica pelo código do CEST
  const mapUnicos = new Map<string, ItemImportacaoCest>()
  for (const item of itensValidos) {
    if (mapUnicos.has(item.codigo)) {
      // Se já existe, mescla os NCMs
      const anterior = mapUnicos.get(item.codigo)!
      const ncmsCombinados = normalizarListaNcm(`${anterior.ncm}, ${item.ncm}`)
      mapUnicos.set(item.codigo, {
        ...item,
        ncm: ncmsCombinados,
      })
    } else {
      mapUnicos.set(item.codigo, item)
    }
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
 * Executa a importação em lotes com upsert por código CEST
 */
export async function executarImportacaoCestEmLotes(
  itens: ItemImportacaoCest[],
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
          const existente = await pb.collection('cest').getList<Cest>(1, 1, {
            filter: `codigo = '${item.codigo}'`,
          })

          const payload = {
            codigo: item.codigo,
            ncm_codigos: item.ncm,
            segmento: item.segmento,
            item: item.item,
            descricao: item.descricao,
            ativo: true,
            updated_by: pb.authStore.record?.id || null,
          }

          if (existente.totalItems > 0) {
            const antes = existente.items[0]
            // Se o antes já tem NCMs e o novo também, mescla
            const ncms = normalizarListaNcm(`${antes.ncm_codigos || ''}, ${item.ncm || ''}`)
            const salvo = await pb.collection('cest').update<Cest>(antes.id, {
              ...payload,
              ncm_codigos: ncms || payload.ncm_codigos,
            })
            atualizados++

            await registrarAuditoria({
              tabela: 'cest',
              registro_id: salvo.id,
              acao: 'alteracao',
              valores_antes: antes as unknown as Record<string, unknown>,
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          } else {
            const salvo = await pb.collection('cest').create<Cest>({
              ...payload,
              created_by: pb.authStore.record?.id || null,
            })
            inseridos++

            await registrarAuditoria({
              tabela: 'cest',
              registro_id: salvo.id,
              acao: 'inclusao',
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          }
        } catch (err) {
          console.error(`Erro ao importar CEST ${item.codigo}:`, err)
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
