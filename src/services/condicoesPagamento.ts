import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from './auditoria'

export type TipoCondicaoPagamento = 'À vista' | 'A prazo'
export type UsoCondicaoPagamento = 'Vendas' | 'Compras' | 'Ambos'

export interface CondicaoPagamento {
  id: string
  ativo: boolean
  codigo: number
  nome: string
  tipo: TipoCondicaoPagamento
  uso: UsoCondicaoPagamento
  quantidade_parcelas: number
  dias_parcelas: number[]
  percentual_entrada?: number
  acrescimo_percentual?: number
  desconto_percentual?: number
  dia_fixo_vencimento?: number
  observacao?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ParcelaCalculada {
  numero: number
  data_vencimento: string // formato YYYY-MM-DD
  valor: number
}

export interface ListarCondicoesParams {
  pagina?: number
  porPagina?: number
  busca?: string
  tipo?: 'todos' | TipoCondicaoPagamento
  uso?: 'todos' | UsoCondicaoPagamento
  situacao?: 'todos' | 'ativos' | 'inativos'
  ordenarPor?: string
  ordem?: 'asc' | 'desc'
}

export interface ResultadoPaginado<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

/**
 * Normaliza e ajusta uma data no formato YYYY-MM-DD adicionando N dias
 */
function adicionarDias(dataBaseStr: string, dias: number): Date {
  const [ano, mes, dia] = dataBaseStr.split('-').map(Number)
  // Criar data em meio-dia UTC para evitar problemas com fuso horário e horário de verão
  const dt = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt
}

/**
 * Aplica dia fixo de vencimento se configurado.
 * Se diaFixo estiver preenchido (1 a 31):
 * - Vencimento deve cair no dia indicado do mês da data calculada (ou do mês seguinte se já tiver passado).
 * - Tratamento para meses com menos dias (ex: dia 31 em fevereiro ou abril): ajusta para o último dia do mês.
 */
function ajustarDiaFixo(dataCalculada: Date, diaFixo?: number): Date {
  if (!diaFixo || diaFixo < 1 || diaFixo > 31) {
    return dataCalculada
  }

  const ano = dataCalculada.getUTCFullYear()
  const mes = dataCalculada.getUTCMonth() // 0-indexed
  const diaCalc = dataCalculada.getUTCDate()

  // Se o dia calculado já for maior que o dia fixo, o vencimento vai para o mês seguinte
  let alvoAno = ano
  let alvoMes = mes
  if (diaCalc > diaFixo) {
    alvoMes += 1
    if (alvoMes > 11) {
      alvoMes = 0
      alvoAno += 1
    }
  }

  // Descobre o último dia do mês alvo
  const ultimoDiaMes = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate()
  const diaFinal = Math.min(diaFixo, ultimoDiaMes)

  return new Date(Date.UTC(alvoAno, alvoMes, diaFinal, 12, 0, 0))
}

function formatarDataIso(dt: Date): string {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * FUNÇÃO REUTILIZÁVEL: gerarParcelas
 * Gera o cronograma de parcelas a partir da condição de pagamento, valor total e data base.
 *
 * Regras aplicadas:
 * 1. Calcula o valor líquido base considerando acréscimo (+) e desconto (-).
 * 2. Se houver percentual de entrada > 0, a primeira parcela representa a entrada (data da operação ou dias_parcelas[0]).
 * 3. O restante é dividido entre as parcelas subsequentes.
 * 4. Valores arredondados para 2 casas decimais. A diferença de centavos decorrente da divisão é ajustada na última parcela.
 * 5. Se houver dia_fixo_vencimento, ajusta o vencimento para o dia fixo do mês.
 *
 * @param condicao Dados da condição de pagamento
 * @param valorTotal Valor bruto base da operação (ex: 1000.00)
 * @param dataBase Data inicial da operação no formato YYYY-MM-DD (padrão: hoje)
 */
export function gerarParcelas(
  condicao: Pick<
    CondicaoPagamento,
    | 'tipo'
    | 'quantidade_parcelas'
    | 'dias_parcelas'
    | 'percentual_entrada'
    | 'acrescimo_percentual'
    | 'desconto_percentual'
    | 'dia_fixo_vencimento'
  >,
  valorTotal: number,
  dataBase?: string,
): ParcelaCalculada[] {
  const totalBase = Math.max(0, Number(valorTotal) || 0)

  // Data base padrão: hoje em YYYY-MM-DD
  const hojeIso = dataBase || new Date().toISOString().split('T')[0]

  if (totalBase <= 0) {
    return []
  }

  // 1. Aplicar acréscimo e desconto no valor total
  const acrescimoPct = Number(condicao.acrescimo_percentual) || 0
  const descontoPct = Number(condicao.desconto_percentual) || 0

  let valorFinal = totalBase
  if (descontoPct > 0) {
    valorFinal = valorFinal * (1 - descontoPct / 100)
  }
  if (acrescimoPct > 0) {
    valorFinal = valorFinal * (1 + acrescimoPct / 100)
  }
  valorFinal = Math.round(valorFinal * 100) / 100

  // Se for "À vista", apenas 1 parcela
  if (condicao.tipo === 'À vista') {
    const dt = adicionarDias(hojeIso, 0)
    return [
      {
        numero: 1,
        data_vencimento: formatarDataIso(dt),
        valor: valorFinal,
      },
    ]
  }

  // "A prazo"
  const qtdParcelas = Math.max(1, Number(condicao.quantidade_parcelas) || 1)
  const dias =
    Array.isArray(condicao.dias_parcelas) && condicao.dias_parcelas.length > 0
      ? condicao.dias_parcelas
      : [30]

  const pctEntrada = Math.min(100, Math.max(0, Number(condicao.percentual_entrada) || 0))
  const diaFixo = condicao.dia_fixo_vencimento ? Number(condicao.dia_fixo_vencimento) : undefined

  const parcelas: ParcelaCalculada[] = []

  if (pctEntrada > 0 && qtdParcelas > 1) {
    // Parcela 1: entrada
    const valorEntrada = Math.round(valorFinal * (pctEntrada / 100) * 100) / 100
    const valorRestante = Math.round((valorFinal - valorEntrada) * 100) / 100
    const parcelasRestantes = qtdParcelas - 1

    // Data da entrada: dia da operação (0 dias ou primeiro item de dias se for 0)
    const dtEntrada = adicionarDias(hojeIso, dias[0] === 0 ? 0 : 0)
    parcelas.push({
      numero: 1,
      data_vencimento: formatarDataIso(dtEntrada),
      valor: valorEntrada,
    })

    // Divisão do restante nas parcelas subsequentes
    const valorParcelaBase = Math.floor((valorRestante / parcelasRestantes) * 100) / 100
    let somaRestante = 0

    for (let i = 1; i < qtdParcelas; i++) {
      const diasPrazo = dias[i] !== undefined ? dias[i] : dias[i - 1] || 30
      let dtVenc = adicionarDias(hojeIso, diasPrazo)
      if (diaFixo) {
        dtVenc = ajustarDiaFixo(dtVenc, diaFixo)
      }

      let val = valorParcelaBase
      if (i === qtdParcelas - 1) {
        // Última parcela absorve a diferença de centavos
        val = Math.round((valorRestante - somaRestante) * 100) / 100
      } else {
        somaRestante = Math.round((somaRestante + val) * 100) / 100
      }

      parcelas.push({
        numero: i + 1,
        data_vencimento: formatarDataIso(dtVenc),
        valor: val,
      })
    }
  } else {
    // Sem entrada destacada: divide igualmente em todas as parcelas
    const valorParcelaBase = Math.floor((valorFinal / qtdParcelas) * 100) / 100
    let somaAcumulada = 0

    for (let i = 0; i < qtdParcelas; i++) {
      const diasPrazo = dias[i] !== undefined ? dias[i] : (i + 1) * 30
      let dtVenc = adicionarDias(hojeIso, diasPrazo)
      if (diaFixo && diasPrazo > 0) {
        dtVenc = ajustarDiaFixo(dtVenc, diaFixo)
      }

      let val = valorParcelaBase
      if (i === qtdParcelas - 1) {
        // Última parcela absorve a diferença de centavos
        val = Math.round((valorFinal - somaAcumulada) * 100) / 100
      } else {
        somaAcumulada = Math.round((somaAcumulada + val) * 100) / 100
      }

      parcelas.push({
        numero: i + 1,
        data_vencimento: formatarDataIso(dtVenc),
        valor: val,
      })
    }
  }

  return parcelas
}

/**
 * Valida os dados de uma condição de pagamento conforme as regras de negócio
 */
export function validarDadosCondicao(dados: Partial<CondicaoPagamento>): {
  valido: boolean
  erros: Record<string, string>
} {
  const erros: Record<string, string> = {}

  const nome = (dados.nome || '').trim()
  if (!nome) {
    erros.nome = 'O nome da condição é obrigatório.'
  } else if (nome.length > 100) {
    erros.nome = 'O nome pode ter no máximo 100 caracteres.'
  }

  if (!dados.tipo || !['À vista', 'A prazo'].includes(dados.tipo)) {
    erros.tipo = 'Selecione o tipo ("À vista" ou "A prazo").'
  }

  if (!dados.uso || !['Vendas', 'Compras', 'Ambos'].includes(dados.uso)) {
    erros.uso = 'Selecione a aplicabilidade ("Vendas", "Compras" ou "Ambos").'
  }

  const qtd = Number(dados.quantidade_parcelas)
  if (!qtd || qtd < 1 || !Number.isInteger(qtd)) {
    erros.quantidade_parcelas =
      'A quantidade de parcelas deve ser um número inteiro maior ou igual a 1.'
  }

  const dias = dados.dias_parcelas
  if (!Array.isArray(dias) || dias.length === 0) {
    erros.dias_parcelas = 'Informe os dias de cada parcela.'
  } else {
    if (dias.length !== qtd) {
      erros.dias_parcelas = `A quantidade de parcelas (${qtd}) deve ser exatamente igual ao número de prazos informados (${dias.length}).`
    }

    // Verificar se são inteiros e não negativos
    for (let i = 0; i < dias.length; i++) {
      const d = Number(dias[i])
      if (Number.isNaN(d) || d < 0 || !Number.isInteger(d)) {
        erros.dias_parcelas =
          'Todos os dias de parcela devem ser números inteiros maiores ou iguais a 0.'
        break
      }
    }

    // Verificar ordem crescente
    for (let i = 1; i < dias.length; i++) {
      if (dias[i] <= dias[i - 1]) {
        erros.dias_parcelas =
          'Os dias das parcelas devem estar em ordem estritamente crescente (ex: [30, 60, 90]).'
        break
      }
    }
  }

  // Validação À vista
  if (dados.tipo === 'À vista') {
    if (qtd !== 1) {
      erros.quantidade_parcelas = 'Para o tipo "À vista", a quantidade de parcelas deve ser 1.'
    }
    if (Array.isArray(dias) && (dias.length !== 1 || dias[0] !== 0)) {
      erros.dias_parcelas = 'Para o tipo "À vista", o prazo deve ser [0].'
    }
  }

  if (dados.dia_fixo_vencimento !== undefined && dados.dia_fixo_vencimento !== null) {
    const df = Number(dados.dia_fixo_vencimento)
    if (df !== 0 && (df < 1 || df > 31 || !Number.isInteger(df))) {
      erros.dia_fixo_vencimento = 'O dia fixo de vencimento deve ser entre 1 e 31.'
    }
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
  }
}

/**
 * Retorna o próximo código sequencial para condicao_pagamento
 */
export async function obterProximoCodigoCondicao(): Promise<number> {
  try {
    const res = await pb.collection('condicoes_pagamento').getList(1, 1, {
      sort: '-codigo',
    })
    if (res.items.length > 0) {
      const maior = (res.items[0] as unknown as { codigo?: number }).codigo || 0
      return Number(maior) + 1
    }
    return 1
  } catch (_) {
    return 1
  }
}

/**
 * Lista condições de pagamento com filtros, busca e paginação
 */
export async function listarCondicoesPagamento(
  params: ListarCondicoesParams = {},
): Promise<ResultadoPaginado<CondicaoPagamento>> {
  const {
    pagina = 1,
    porPagina = 20,
    busca = '',
    tipo = 'todos',
    uso = 'todos',
    situacao = 'ativos',
    ordenarPor = 'codigo',
    ordem = 'asc',
  } = params

  const filters: string[] = []

  if (situacao === 'ativos') {
    filters.push('ativo = true')
  } else if (situacao === 'inativos') {
    filters.push('ativo = false')
  }

  if (tipo && tipo !== 'todos') {
    filters.push(`tipo = "${tipo}"`)
  }

  if (uso && uso !== 'todos') {
    filters.push(`uso = "${uso}"`)
  }

  if (busca && busca.trim()) {
    const termo = busca.trim().replace(/['"]/g, '')
    const subConds: string[] = [`nome ~ "${termo}"`, `observacao ~ "${termo}"`]
    const numeroBusca = parseInt(termo, 10)
    if (!Number.isNaN(numeroBusca)) {
      subConds.push(`codigo = ${numeroBusca}`)
    }
    filters.push(`(${subConds.join(' || ')})`)
  }

  const sortPrefix = ordem === 'desc' ? '-' : ''
  const sort = `${sortPrefix}${ordenarPor}`

  const res = await pb
    .collection('condicoes_pagamento')
    .getList<CondicaoPagamento>(pagina, porPagina, {
      filter: filters.length > 0 ? filters.join(' && ') : '',
      sort,
    })

  return {
    items: res.items,
    page: res.page,
    perPage: res.perPage,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
  }
}

/**
 * Retorna todas as condições de pagamento ativas compatíveis com o uso informado
 */
export async function listarTodasCondicoesAtivas(
  usoFiltro?: 'Vendas' | 'Compras',
): Promise<CondicaoPagamento[]> {
  try {
    const condicoes: string[] = ['ativo = true']
    if (usoFiltro === 'Vendas') {
      condicoes.push('(uso = "Vendas" || uso = "Ambos")')
    } else if (usoFiltro === 'Compras') {
      condicoes.push('(uso = "Compras" || uso = "Ambos")')
    }

    return await pb.collection('condicoes_pagamento').getFullList<CondicaoPagamento>({
      filter: condicoes.join(' && '),
      sort: 'nome',
    })
  } catch (err) {
    console.error('Erro ao listar condições de pagamento ativas:', err)
    return []
  }
}

export async function obterCondicaoPorId(id: string): Promise<CondicaoPagamento> {
  return await pb.collection('condicoes_pagamento').getOne<CondicaoPagamento>(id)
}

/**
 * Salva condição de pagamento com auditoria em logs_auditoria
 */
export async function salvarCondicaoPagamento(
  dados: Partial<CondicaoPagamento>,
): Promise<CondicaoPagamento> {
  const user = pb.authStore.record
  const ehNovo = !dados.id

  const checagem = validarDadosCondicao(dados)
  if (!checagem.valido) {
    const primeiroErro = Object.values(checagem.erros)[0]
    throw new Error(primeiroErro)
  }

  let codigo = dados.codigo
  if (ehNovo && !codigo) {
    codigo = await obterProximoCodigoCondicao()
  }

  const payload: Record<string, unknown> = {
    ...dados,
    codigo,
    nome: (dados.nome || '').trim(),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  // Sanitização
  if (payload.percentual_entrada === '' || payload.percentual_entrada === undefined) {
    payload.percentual_entrada = 0
  }
  if (payload.acrescimo_percentual === '' || payload.acrescimo_percentual === undefined) {
    payload.acrescimo_percentual = 0
  }
  if (payload.desconto_percentual === '' || payload.desconto_percentual === undefined) {
    payload.desconto_percentual = 0
  }
  if (
    payload.dia_fixo_vencimento === '' ||
    payload.dia_fixo_vencimento === undefined ||
    payload.dia_fixo_vencimento === 0
  ) {
    payload.dia_fixo_vencimento = null
  }

  let condicaoSalva: CondicaoPagamento
  let registroAntes: CondicaoPagamento | null = null

  if (ehNovo) {
    payload.created_by = user?.id || null
    condicaoSalva = await pb.collection('condicoes_pagamento').create<CondicaoPagamento>(payload)

    await registrarAuditoria({
      tabela: 'condicoes_pagamento',
      registro_id: condicaoSalva.id,
      acao: 'inclusao',
      valores_antes: null,
      valores_depois: condicaoSalva as unknown as Record<string, unknown>,
    })
  } else {
    registroAntes = await obterCondicaoPorId(dados.id!)
    condicaoSalva = await pb
      .collection('condicoes_pagamento')
      .update<CondicaoPagamento>(dados.id!, payload)

    await registrarAuditoria({
      tabela: 'condicoes_pagamento',
      registro_id: condicaoSalva.id,
      acao: 'alteracao',
      valores_antes: registroAntes as unknown as Record<string, unknown>,
      valores_depois: condicaoSalva as unknown as Record<string, unknown>,
    })
  }

  return condicaoSalva
}

/**
 * Inativa condição de pagamento com auditoria
 */
export async function inativarCondicaoPagamento(id: string): Promise<CondicaoPagamento> {
  const registroAntes = await obterCondicaoPorId(id)
  const user = pb.authStore.record

  const atualizado = await pb.collection('condicoes_pagamento').update<CondicaoPagamento>(id, {
    ativo: false,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'condicoes_pagamento',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

/**
 * Reativa condição de pagamento com auditoria
 */
export async function ativarCondicaoPagamento(id: string): Promise<CondicaoPagamento> {
  const registroAntes = await obterCondicaoPorId(id)
  const user = pb.authStore.record

  const atualizado = await pb.collection('condicoes_pagamento').update<CondicaoPagamento>(id, {
    ativo: true,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'condicoes_pagamento',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}
