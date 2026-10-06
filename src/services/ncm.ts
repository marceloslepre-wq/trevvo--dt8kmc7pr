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

export interface ItemImportacaoNcm {
  codigo: string
  descricao: string
  aliquota_ipi?: number
  data_inicio?: string
  data_fim?: string
  ex_tipi?: string
  unidade_tributavel?: string
}

export interface ResumoImportacaoNcm {
  totalLidos: number
  validos: number
  ignorados: number
  novos: number
  atualizados: number
  itensValidos: ItemImportacaoNcm[]
  erros: { linha: number; mensagem: string }[]
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

/**
 * Faz a análise do arquivo (JSON oficial Siscomex ou CSV) para NCM
 */
export async function analisarArquivoNcm(conteudo: string): Promise<ResumoImportacaoNcm> {
  const itensValidos: ItemImportacaoNcm[] = []
  const erros: { linha: number; mensagem: string }[] = []
  let totalLidos = 0
  let ignorados = 0

  const conteudoTrim = conteudo.trim()

  // Caso 1: JSON do Siscomex ou Array JSON
  if (conteudoTrim.startsWith('{') || conteudoTrim.startsWith('[')) {
    try {
      const parsed = JSON.parse(conteudoTrim)
      let lista: Array<Record<string, unknown>> = []

      if (Array.isArray(parsed)) {
        lista = parsed
      } else if (parsed && Array.isArray(parsed.Nomenclaturas)) {
        lista = parsed.Nomenclaturas
      } else if (parsed && Array.isArray(parsed.nomenclaturas)) {
        lista = parsed.nomenclaturas
      } else if (parsed && typeof parsed === 'object') {
        // Tenta encontrar alguma propriedade que seja array
        const keys = Object.keys(parsed)
        for (const k of keys) {
          if (Array.isArray(parsed[k])) {
            lista = parsed[k]
            break
          }
        }
      }

      totalLidos = lista.length

      for (let i = 0; i < lista.length; i++) {
        const item = lista[i]
        const rawCodigo = String(item.Codigo || item.codigo || item.CODIGO || item.cod || '')
        const codigoNorm = normalizarCodigoNcm(rawCodigo)
        const descricao = String(item.Descricao || item.descricao || item.DESCRICAO || '').trim()
        const dataInicio = String(
          item.Data_Inicio || item.data_inicio || item.dataInicio || '',
        ).trim()
        const dataFim = String(item.Data_Fim || item.data_fim || item.dataFim || '').trim()
        const exTipi = String(item.ex_tipi || item.Ex_Tipi || '').trim()
        const aliqRaw = item.aliquota_ipi ?? item.Aliquota_Ipi ?? item.aliquotaIpi

        if (!codigoNorm || codigoNorm.length !== 8) {
          ignorados++
          continue
        }

        if (!descricao) {
          erros.push({
            linha: i + 1,
            mensagem: `NCM ${codigoNorm} sem descrição.`,
          })
          ignorados++
          continue
        }

        itensValidos.push({
          codigo: codigoNorm,
          descricao,
          data_inicio: dataInicio,
          data_fim: dataFim,
          ex_tipi: exTipi,
          aliquota_ipi: aliqRaw !== undefined && aliqRaw !== '' ? Number(aliqRaw) : undefined,
        })
      }
    } catch (jsonErr) {
      throw new Error(`Falha ao ler JSON: ${(jsonErr as Error).message}`)
    }
  } else {
    // Caso 2: CSV (codigo;descricao;aliquota_ipi)
    const linhas = conteudoTrim.split(/\r?\n/).filter((l) => l.trim().length > 0)
    let inicio = 0

    if (linhas.length > 0) {
      const p1 = linhas[0].toLowerCase()
      if (p1.includes('codigo') && p1.includes('descricao')) {
        inicio = 1
      }
    }

    totalLidos = linhas.length - inicio

    for (let i = inicio; i < linhas.length; i++) {
      const linhaNum = i + 1
      const linhaTexto = linhas[i].trim()
      if (!linhaTexto) continue

      const partes = linhaTexto.includes(';') ? linhaTexto.split(';') : linhaTexto.split(',')
      if (partes.length < 2) {
        erros.push({
          linha: linhaNum,
          mensagem: 'Linha CSV incompleta (esperado pelo menos codigo;descricao).',
        })
        ignorados++
        continue
      }

      const rawCodigo = partes[0]?.trim().replace(/^["']|["']$/g, '') || ''
      const codigoNorm = normalizarCodigoNcm(rawCodigo)
      const descricao = partes[1]?.trim().replace(/^["']|["']$/g, '') || ''
      const rawAliq =
        partes[2]
          ?.trim()
          .replace(/^["']|["']$/g, '')
          .replace(',', '.') || ''

      if (codigoNorm.length !== 8) {
        ignorados++
        continue
      }

      if (!descricao) {
        erros.push({
          linha: linhaNum,
          mensagem: `NCM ${codigoNorm} sem descrição.`,
        })
        ignorados++
        continue
      }

      itensValidos.push({
        codigo: codigoNorm,
        descricao,
        aliquota_ipi: rawAliq && !isNaN(Number(rawAliq)) ? Number(rawAliq) : undefined,
      })
    }
  }

  // Deduplicar itens do próprio arquivo mantendo o último
  const mapUnicos = new Map<string, ItemImportacaoNcm>()
  for (const item of itensValidos) {
    mapUnicos.set(item.codigo, item)
  }
  const listaDeduplicada = Array.from(mapUnicos.values())

  return {
    totalLidos,
    validos: listaDeduplicada.length,
    ignorados: ignorados + (itensValidos.length - listaDeduplicada.length),
    novos: 0,
    atualizados: 0,
    itensValidos: listaDeduplicada,
    erros,
  }
}

/**
 * Executa a importação em lotes para não travar o navegador nem sobrecarregar o backend.
 */
export async function executarImportacaoNcmEmLotes(
  itens: ItemImportacaoNcm[],
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
          // Busca registro existente por código
          const existente = await pb.collection('ncm').getList<Ncm>(1, 1, {
            filter: `codigo = '${item.codigo}'`,
          })

          const payload = {
            codigo: item.codigo,
            descricao: item.descricao,
            ex_tipi: item.ex_tipi || '',
            aliquota_ipi: item.aliquota_ipi !== undefined ? item.aliquota_ipi : null,
            unidade_tributavel: item.unidade_tributavel || '',
            data_inicio: item.data_inicio || '',
            data_fim: item.data_fim || '',
            ativo: true,
            updated_by: pb.authStore.record?.id || null,
          }

          if (existente.totalItems > 0) {
            const antes = existente.items[0]
            const salvo = await pb.collection('ncm').update<Ncm>(antes.id, payload)
            atualizados++

            await registrarAuditoria({
              tabela: 'ncm',
              registro_id: salvo.id,
              acao: 'alteracao',
              valores_antes: antes as unknown as Record<string, unknown>,
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          } else {
            const salvo = await pb.collection('ncm').create<Ncm>({
              ...payload,
              created_by: pb.authStore.record?.id || null,
            })
            inseridos++

            await registrarAuditoria({
              tabela: 'ncm',
              registro_id: salvo.id,
              acao: 'inclusao',
              valores_depois: salvo as unknown as Record<string, unknown>,
            })
          }
        } catch (err) {
          console.error(`Erro ao salvar NCM ${item.codigo}:`, err)
          erros++
        }
      }),
    )

    const processados = Math.min(i + batchSize, total)
    if (onProgresso) {
      onProgresso(processados, total, { inseridos, atualizados })
    }

    // Yield para manter a UI responsiva
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return { inseridos, atualizados, erros }
}
