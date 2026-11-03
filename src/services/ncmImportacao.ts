import pb from '@/lib/pocketbase/client'
import { normalizarCodigoNcm } from '@/services/ncm'

export interface ErroImportacaoNcm {
  linha: number
  codigo: string
  motivo: string
}

export interface ItemImportacaoNcm {
  linha: number
  codigo: string
  codigoFormatado: string
  descricao: string
  descricaoCompleta: string
  dataInicio: string
  dataFim: string
  atoLegal: string
}

export interface ResumoImportacaoNcm {
  totalLidos: number
  validos: number
  ignorados: number
  itensValidos: ItemImportacaoNcm[]
  erros: ErroImportacaoNcm[]
}

export interface ResultadoImportacaoNcm {
  criados: number
  atualizados: number
  semMudanca: number
  erros: number
  primeirosErros: ErroImportacaoNcm[]
}

interface NcmRegistro {
  id: string
  codigo: string
  descricao?: string
  descricao_completa?: string
  data_inicio?: string
  data_fim?: string
}

const TAMANHO_LOTE = 200
const CONCORRENCIA = 10

/**
 * Parser de linha CSV com separador ";" respeitando campos entre aspas
 * (aspas duplas internas escapadas como ""). Não aceita quebra de linha
 * dentro do campo (o arquivo oficial da Receita não usa).
 */
function parsearLinhaCsv(linha: string): string[] {
  const campos: string[] = []
  let campo = ''
  let dentroAspas = false

  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (dentroAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          dentroAspas = false
        }
      } else {
        campo += ch
      }
    } else if (ch === '"') {
      dentroAspas = true
    } else if (ch === ';') {
      campos.push(campo)
      campo = ''
    } else {
      campo += ch
    }
  }
  campos.push(campo)

  return campos.map((c) => c.trim())
}

/**
 * Traduz o erro do PocketBase em motivo legível (campo + razão).
 */
function motivoErroPb(err: unknown): string {
  const e = err as {
    response?: { message?: string; data?: Record<string, { message?: string }> }
    message?: string
    status?: number
  }

  const partes: string[] = []

  if (e?.response?.data) {
    for (const [campo, valor] of Object.entries(e.response.data)) {
      partes.push(`campo "${campo}": ${valor?.message || 'valor inválido'}`)
    }
  }
  if (e?.response?.message) {
    partes.push(e.response.message)
  }
  if (partes.length === 0) {
    partes.push(e?.message || `erro HTTP ${e?.status || 'desconhecido'}`)
  }

  return partes.join(' | ')
}

/**
 * Faz a análise do arquivo CSV oficial da Receita/Siscomex (ncm_vigente_AAAA-MM-DD):
 * UTF-8, separador ";", colunas codigo; codigo_formatado; descricao;
 * descricao_completa; data_inicio; data_fim; ato_legal.
 */
export async function analisarArquivoNcm(conteudo: string): Promise<ResumoImportacaoNcm> {
  const itensValidos: ItemImportacaoNcm[] = []
  const erros: ErroImportacaoNcm[] = []

  const texto = conteudo.replace(/^\uFEFF/, '').trim()

  if (texto.startsWith('{') || texto.startsWith('[')) {
    throw new Error(
      'O arquivo parece ser JSON. Envie o CSV oficial da Receita/Siscomex convertido ' +
        '(ncm_vigente_AAAA-MM-DD.csv, separado por ponto e vírgula).',
    )
  }

  const linhas = texto.split(/\r?\n/)
  const linhasComDado = linhas.filter((l) => l.trim().length > 0)

  if (linhasComDado.length === 0) {
    throw new Error('O arquivo está vazio.')
  }

  // Mapeia as colunas pelo cabeçalho (quando existir)
  const indices: Record<string, number> = {
    codigo: -1,
    codigo_formatado: -1,
    descricao: -1,
    descricao_completa: -1,
    data_inicio: -1,
    data_fim: -1,
    ato_legal: -1,
  }

  const primeira = parsearLinhaCsv(linhasComDado[0]).map((c) => c.toLowerCase().trim())
  const temCabecalho = primeira.some((c) => c === 'codigo' || c === 'codigo_formatado')

  let inicio = 0
  if (temCabecalho) {
    inicio = 1
    primeira.forEach((nome, idx) => {
      if (nome in indices) indices[nome] = idx
    })
  }

  // Sem cabeçalho: ordem fixa do arquivo oficial
  if (indices.codigo < 0) indices.codigo = 0
  if (indices.codigo_formatado < 0) indices.codigo_formatado = 1
  if (indices.descricao < 0) indices.descricao = 2
  if (indices.descricao_completa < 0) indices.descricao_completa = 3
  if (indices.data_inicio < 0) indices.data_inicio = 4
  if (indices.data_fim < 0) indices.data_fim = 5
  if (indices.ato_legal < 0) indices.ato_legal = 6

  const totalLidos = linhasComDado.length - inicio
  let ignorados = 0

  const mapaUnicos = new Map<string, ItemImportacaoNcm>()

  for (let i = inicio; i < linhasComDado.length; i++) {
    const linhaNum = i + 1
    const campos = parsearLinhaCsv(linhasComDado[i])

    const rawCodigo = campos[indices.codigo] || ''
    const rawCodigoFormatado = campos[indices.codigo_formatado] || ''
    const descricao = campos[indices.descricao] || ''
    const descricaoCompleta = campos[indices.descricao_completa] || ''
    const dataInicio = campos[indices.data_inicio] || ''
    const dataFim = campos[indices.data_fim] || ''
    const atoLegal = campos[indices.ato_legal] || ''

    // Grava no MESMO formato dos NCMs já existentes: 8 dígitos sem pontos.
    // Aceita tanto "87131000" quanto "8713.10.00" (usa codigo_formatado como reserva).
    let codigo = normalizarCodigoNcm(rawCodigo)
    if (codigo.length !== 8) {
      codigo = normalizarCodigoNcm(rawCodigoFormatado)
    }

    if (codigo.length !== 8) {
      erros.push({
        linha: linhaNum,
        codigo: rawCodigo || rawCodigoFormatado || '(vazio)',
        motivo: `Código inválido: esperado 8 dígitos, recebido "${rawCodigo || rawCodigoFormatado || '(vazio)'}".`,
      })
      continue
    }

    if (!descricao.trim()) {
      erros.push({
        linha: linhaNum,
        codigo,
        motivo: 'Descrição obrigatória ausente (coluna descricao vazia).',
      })
      continue
    }

    const item: ItemImportacaoNcm = {
      linha: linhaNum,
      codigo,
      codigoFormatado: rawCodigoFormatado,
      descricao: descricao.trim(),
      descricaoCompleta: descricaoCompleta.trim(),
      dataInicio: dataInicio.trim(),
      dataFim: dataFim.trim(),
      atoLegal: atoLegal.trim(),
    }

    const anterior = mapaUnicos.get(codigo)
    if (anterior) {
      ignorados++
    }
    mapaUnicos.set(codigo, item)
  }

  return {
    totalLidos,
    validos: mapaUnicos.size,
    ignorados,
    itensValidos: Array.from(mapaUnicos.values()),
    erros,
  }
}

/**
 * Executa a importação em lotes de 200 linhas com upsert pelo código:
 * - atualiza SOMENTE os campos que vêm no CSV (descricao, descricao_completa,
 *   data_inicio, data_fim); nunca mexe em aliquota_ipi, ex_tipi,
 *   unidade_tributavel ou ativo dos registros existentes;
 * - cria o que falta; nunca duplica (código é único no banco);
 * - linha idêntica ao registro gravado é contada como "sem mudança".
 */
export async function executarImportacaoNcmEmLotes(
  itens: ItemImportacaoNcm[],
  onProgresso?: (
    processados: number,
    total: number,
    stats: { criados: number; atualizados: number; semMudanca: number },
  ) => void,
): Promise<ResultadoImportacaoNcm> {
  const usuarioId = pb.authStore.record?.id || null

  // Carrega os códigos existentes uma única vez para o upsert
  const existentes = new Map<string, NcmRegistro>()
  let pagina = 1
  for (;;) {
    const res = await pb.collection('ncm').getList<NcmRegistro>(pagina, 500, { sort: 'codigo' })
    for (const reg of res.items) {
      existentes.set(normalizarCodigoNcm(reg.codigo) || reg.codigo, reg)
    }
    if (pagina >= res.totalPages) break
    pagina++
  }

  let criados = 0
  let atualizados = 0
  let semMudanca = 0
  const erros: ErroImportacaoNcm[] = []

  const processarItem = async (item: ItemImportacaoNcm) => {
    const existente = existentes.get(item.codigo)

    try {
      if (!existente) {
        await pb.collection('ncm').create({
          codigo: item.codigo,
          descricao: item.descricao,
          descricao_completa: item.descricaoCompleta,
          data_inicio: item.dataInicio,
          data_fim: item.dataFim,
          ativo: true,
          created_by: usuarioId,
        })
        criados++
        return
      }

      const payload: Record<string, unknown> = { updated_by: usuarioId }
      let mudou = false

      if ((existente.descricao || '').trim() !== item.descricao) {
        payload.descricao = item.descricao
        mudou = true
      }
      if ((existente.descricao_completa || '') !== item.descricaoCompleta) {
        payload.descricao_completa = item.descricaoCompleta
        mudou = true
      }
      if ((existente.data_inicio || '') !== item.dataInicio) {
        payload.data_inicio = item.dataInicio
        mudou = true
      }
      if ((existente.data_fim || '') !== item.dataFim) {
        payload.data_fim = item.dataFim
        mudou = true
      }

      if (!mudou) {
        semMudanca++
        return
      }

      await pb.collection('ncm').update(existente.id, payload)
      atualizados++
    } catch (err) {
      erros.push({
        linha: item.linha,
        codigo: item.codigo,
        motivo: motivoErroPb(err),
      })
    }
  }

  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE)

    for (let j = 0; j < lote.length; j += CONCORRENCIA) {
      await Promise.all(lote.slice(j, j + CONCORRENCIA).map(processarItem))
    }

    if (onProgresso) {
      onProgresso(Math.min(i + TAMANHO_LOTE, itens.length), itens.length, {
        criados,
        atualizados,
        semMudanca,
      })
    }

    // Yield para manter a UI responsiva
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return {
    criados,
    atualizados,
    semMudanca,
    erros: erros.length,
    primeirosErros: erros.slice(0, 20),
  }
}
