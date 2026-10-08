/**
 * Serviço de Apuração de Fluxo de Caixa (Realizado x Previsto)
 * Módulo: financeiro_bancos
 *
 * Regras:
 * - Filtros: período (início e fim), contas financeiras (padrão todas da empresa), agrupamento (dia, semana, mês)
 * - "Incluir vencidos em aberto": somados no 1º período projetado
 * - Transferências entre contas selecionadas são NEUTRALIZADAS (não contam como entrada nem saída)
 * - Períodos passados: só realizados
 * - Período atual e futuros: realizados + previstos (títulos em aberto de contas_pagar e contas_receber)
 * - Saldo inicial computado da conta na data_inicio
 * - Composição detalhada por período (títulos e movimentações) para modal drill-down
 */

import pb from '@/lib/pocketbase/client'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { MovimentoExtratoItem } from '@/services/movimentacoesExtratos'

export type AgrupamentoFluxo = 'dia' | 'semana' | 'mes'

export interface FiltrosFluxoCaixa {
  empresaId: string
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  contasIds?: string[] // vazio ou indefinido = todas da empresa
  agrupamento: AgrupamentoFluxo
  incluirVencidos: boolean
}

export interface ItemComposicaoFluxo {
  id: string
  tipo: 'Entrada Realizada' | 'Saída Realizada' | 'Receber Previsto' | 'Pagar Previsto'
  data: string
  descricao: string
  entidadeNome: string // Fornecedor / Cliente / Conta
  documentoNumero?: string
  valor: number
  origem: string
  status?: string
}

export interface PeriodoFluxoCaixa {
  chave: string // identificador do período (ex: "2025-05-10" ou "Semana 19/2025" ou "2025-05")
  rotulo: string // rótulo legível para tela/gráfico (ex: "10/05/2025", "Sem 19 (05/05 a 11/05)", "Mai/2025")
  dataInicioPeriodo: string
  dataFimPeriodo: string
  saldoInicial: number
  entradasRealizadas: number
  saidasRealizadas: number
  aReceberPrevisto: number
  aPagarPrevisto: number
  totalEntradas: number // entradasRealizadas + (se atual/futuro: aReceberPrevisto)
  totalSaidas: number // saidasRealizadas + (se atual/futuro: aPagarPrevisto)
  saldoLiquido: number // totalEntradas - totalSaidas
  saldoFinalProjetado: number // saldoInicial + saldoLiquido
  ehPassado: boolean
  ehAtual: boolean
  ehFuturo: boolean
  itens: ItemComposicaoFluxo[]
}

export interface ResumoFluxoCaixa {
  saldoInicialGeral: number
  totalEntradasRealizadas: number
  totalSaidasRealizadas: number
  totalAReceberPrevisto: number
  totalAPagarPrevisto: number
  saldoFinalGeral: number
  periodos: PeriodoFluxoCaixa[]
  contasAnalisadas: ContaFinanceira[]
}

/**
 * Funções auxiliares de data (formatação e agrupamento)
 */
function toDateObj(dStr: string): Date {
  return new Date(dStr.slice(0, 10) + 'T00:00:00')
}

function formatIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Segunda-feira como início
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

/**
 * Cria a lista de buckets/períodos entre dataInicio e dataFim conforme o agrupamento
 */
function gerarBuckets(
  dataInicio: string,
  dataFim: string,
  agrupamento: AgrupamentoFluxo,
): Array<{
  chave: string
  rotulo: string
  inicio: string
  fim: string
}> {
  const buckets: Array<{ chave: string; rotulo: string; inicio: string; fim: string }> = []
  const dtInicio = toDateObj(dataInicio)
  const dtFim = toDateObj(dataFim)

  if (dtInicio > dtFim) return buckets

  const curr = new Date(dtInicio)

  if (agrupamento === 'dia') {
    while (curr <= dtFim) {
      const iso = formatIso(curr)
      const [y, m, d] = iso.split('-')
      buckets.push({
        chave: iso,
        rotulo: `${d}/${m}`,
        inicio: iso,
        fim: iso,
      })
      curr.setDate(curr.getDate() + 1)
    }
  } else if (agrupamento === 'semana') {
    while (curr <= dtFim) {
      const startW = getStartOfWeek(curr)
      const endW = getEndOfWeek(curr)
      const startIso = formatIso(startW)
      const endIso = formatIso(endW)
      const weekNum = getWeekNumber(startW)
      const chave = `${startW.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

      if (!buckets.some((b) => b.chave === chave)) {
        const [_, sm, sd] = startIso.split('-')
        const [__, em, ed] = endIso.split('-')
        buckets.push({
          chave,
          rotulo: `Sem ${weekNum} (${sd}/${sm} a ${ed}/${em})`,
          inicio: startIso,
          fim: endIso,
        })
      }
      curr.setDate(curr.getDate() + 7)
    }
  } else {
    // Mês
    while (curr <= dtFim) {
      const y = curr.getFullYear()
      const m = curr.getMonth()
      const chave = `${y}-${String(m + 1).padStart(2, '0')}`
      const startM = new Date(y, m, 1)
      const endM = new Date(y, m + 1, 0)
      const startIso = formatIso(startM)
      const endIso = formatIso(endM)

      const mesesNomes = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ]
      const rotulo = `${mesesNomes[m]}/${String(y).slice(2)}`

      if (!buckets.some((b) => b.chave === chave)) {
        buckets.push({
          chave,
          rotulo,
          inicio: startIso,
          fim: endIso,
        })
      }
      curr.setMonth(curr.getMonth() + 1)
      curr.setDate(1)
    }
  }

  return buckets
}

/**
 * Apura o Fluxo de Caixa completo
 */
export async function apurarFluxoCaixa(filtros: FiltrosFluxoCaixa): Promise<ResumoFluxoCaixa> {
  const { empresaId, dataInicio, dataFim, contasIds, agrupamento, incluirVencidos } = filtros

  // 1. Obter contas da empresa ativa
  const todasContas = await listarContasFinanceiras({
    empresa_id: empresaId,
    situacao: 'ativos',
  })

  const contasFiltradas =
    contasIds && contasIds.length > 0
      ? todasContas.filter((c) => contasIds.includes(c.id))
      : todasContas

  const setContasIds = new Set(contasFiltradas.map((c) => c.id))

  // 2. Buscar TODAS as movimentações financeiras da empresa até dataFim
  // Necessário para calcular exatamente o saldo_inicial em dataInicio e neutralizar transferências internas
  const movs = await pb.collection('movimentacoes_financeiras').getFullList<MovimentoExtratoItem>({
    filter: `empresa_id = '${empresaId}' && ativo = true`,
    sort: 'data_movimento,created',
    expand: 'conta_financeira_id',
    requestKey: null,
  })

  // 3. Buscar títulos a pagar em aberto ou pagos parciais
  // status: 'Em aberto' ou 'Pago parcial'
  const titulosPagar = await pb.collection('contas_pagar').getFullList<any>({
    filter: `empresa_id = '${empresaId}' && ativo = true && status != 'Pago' && status != 'Cancelado'`,
    sort: 'data_vencimento',
    expand: 'fornecedor_id,plano_conta_id',
    requestKey: null,
  })

  // 4. Buscar títulos a receber em aberto ou parciais
  const titulosReceber = await pb.collection('contas_receber').getFullList<any>({
    filter: `empresa_id = '${empresaId}' && ativo = true && status != 'Recebido' && status != 'Cancelado'`,
    sort: 'data_vencimento',
    expand: 'cliente_id,plano_conta_id',
    requestKey: null,
  })

  // 5. Apurar Saldo Inicial das contas na dataInicio:
  // Saldo inicial de cada conta cadastrado + movimentos anteriores a dataInicio
  let saldoInicialGeral = 0
  const saldosPorConta = new Map<string, number>()

  contasFiltradas.forEach((c) => {
    saldosPorConta.set(c.id, Number(c.saldo_inicial) || 0)
  })

  for (const m of movs) {
    if (!setContasIds.has(m.conta_financeira_id)) continue
    if (m.estornado) continue

    const dataM = (m.data_movimento || '').slice(0, 10)
    const valor = Number(m.valor) || 0

    if (dataM < dataInicio) {
      const atual = saldosPorConta.get(m.conta_financeira_id) || 0
      if (m.tipo === 'Entrada') {
        saldosPorConta.set(m.conta_financeira_id, Number((atual + valor).toFixed(2)))
      } else {
        saldosPorConta.set(m.conta_financeira_id, Number((atual - valor).toFixed(2)))
      }
    }
  }

  for (const val of saldosPorConta.values()) {
    saldoInicialGeral += val
  }
  saldoInicialGeral = Number(saldoInicialGeral.toFixed(2))

  // 6. Gerar os buckets do período
  const buckets = gerarBuckets(dataInicio, dataFim, agrupamento)
  if (buckets.length === 0) {
    return {
      saldoInicialGeral,
      totalEntradasRealizadas: 0,
      totalSaidasRealizadas: 0,
      totalAReceberPrevisto: 0,
      totalAPagarPrevisto: 0,
      saldoFinalGeral: saldoInicialGeral,
      periodos: [],
      contasAnalisadas: contasFiltradas,
    }
  }

  const hojeIso = new Date().toISOString().slice(0, 10)

  // Mapear transferências entre contas que estão no filtro para neutralizar
  // Se uma transferência tem origem e destino pertencentes a setContasIds, ambas pontas devem ser neutralizadas
  const transfEntreContasSelecionadas = new Set<string>()
  const transfMap = new Map<string, Set<string>>() // transfId -> Set de conta_ids

  for (const m of movs) {
    if (m.transferencia_id && !m.estornado) {
      const setC = transfMap.get(m.transferencia_id) || new Set<string>()
      setC.add(m.conta_financeira_id)
      transfMap.set(m.transferencia_id, setC)
    }
  }

  for (const [tId, setC] of transfMap.entries()) {
    // Se há pelo menos 2 contas do grupo selecionado envolvidas na transferência, neutraliza
    const contasDentro = Array.from(setC).filter((id) => setContasIds.has(id))
    if (contasDentro.length >= 2) {
      transfEntreContasSelecionadas.add(tId)
    }
  }

  // 7. Estruturar cada período
  const periodos: PeriodoFluxoCaixa[] = buckets.map((b) => {
    const ehPassado = b.fim < hojeIso
    const ehAtual = b.inicio <= hojeIso && b.fim >= hojeIso
    const ehFuturo = b.inicio > hojeIso

    return {
      chave: b.chave,
      rotulo: b.rotulo,
      dataInicioPeriodo: b.inicio,
      dataFimPeriodo: b.fim,
      saldoInicial: 0,
      entradasRealizadas: 0,
      saidasRealizadas: 0,
      aReceberPrevisto: 0,
      aPagarPrevisto: 0,
      totalEntradas: 0,
      totalSaidas: 0,
      saldoLiquido: 0,
      saldoFinalProjetado: 0,
      ehPassado,
      ehAtual,
      ehFuturo,
      itens: [],
    }
  })

  // Função auxiliar para encontrar o período de uma data
  function encontrarPeriodo(dataIso: string): PeriodoFluxoCaixa | undefined {
    return periodos.find((p) => dataIso >= p.dataInicioPeriodo && dataIso <= p.dataFimPeriodo)
  }

  // 8. Distribuir Movimentações Realizadas
  for (const m of movs) {
    if (!setContasIds.has(m.conta_financeira_id)) continue
    if (m.estornado) continue

    // Se é transferência entre contas filtradas, NEUTRALIZA
    if (m.transferencia_id && transfEntreContasSelecionadas.has(m.transferencia_id)) {
      continue
    }

    const dataM = (m.data_movimento || '').slice(0, 10)
    if (dataM < dataInicio || dataM > dataFim) continue

    const p = encontrarPeriodo(dataM)
    if (!p) continue

    const valor = Number(m.valor) || 0
    const nomeConta = m.expand?.conta_financeira_id?.nome || 'Conta'

    if (m.tipo === 'Entrada') {
      p.entradasRealizadas = Number((p.entradasRealizadas + valor).toFixed(2))
      p.itens.push({
        id: m.id,
        tipo: 'Entrada Realizada',
        data: dataM,
        descricao: m.historico,
        entidadeNome: nomeConta,
        documentoNumero: m.documento_numero,
        valor,
        origem: m.origem,
      })
    } else {
      p.saidasRealizadas = Number((p.saidasRealizadas + valor).toFixed(2))
      p.itens.push({
        id: m.id,
        tipo: 'Saída Realizada',
        data: dataM,
        descricao: m.historico,
        entidadeNome: nomeConta,
        documentoNumero: m.documento_numero,
        valor,
        origem: m.origem,
      })
    }
  }

  // 9. Distribuir Títulos a Receber Previstos
  const primeiroPeriodo = periodos[0]

  for (const tit of titulosReceber) {
    const venc = (tit.data_vencimento || '').slice(0, 10)
    const saldo = Number(tit.saldo) || 0
    if (saldo <= 0) continue

    const clienteNome = tit.expand?.cliente_id?.nome_razao_social || 'Cliente'
    const docNum = tit.numero_documento ? `${tit.numero_documento} (${tit.parcela || '1'})` : tit.id

    // Vencidos antes de hoje / antes de dataInicio
    if (venc < hojeIso || venc < dataInicio) {
      if (incluirVencidos && primeiroPeriodo) {
        primeiroPeriodo.aReceberPrevisto = Number(
          (primeiroPeriodo.aReceberPrevisto + saldo).toFixed(2),
        )
        primeiroPeriodo.itens.push({
          id: tit.id,
          tipo: 'Receber Previsto',
          data: venc,
          descricao: `[VENCIDO] ${tit.descricao || 'Título a receber em atraso'}`,
          entidadeNome: clienteNome,
          documentoNumero: docNum,
          valor: saldo,
          origem: tit.origem || 'Manual',
          status: 'Vencido',
        })
      }
      continue
    }

    if (venc > dataFim) continue

    const p = encontrarPeriodo(venc)
    if (p) {
      // Períodos passados não recebem previstos
      if (p.ehPassado) continue

      p.aReceberPrevisto = Number((p.aReceberPrevisto + saldo).toFixed(2))
      p.itens.push({
        id: tit.id,
        tipo: 'Receber Previsto',
        data: venc,
        descricao: tit.descricao || 'Título a receber previsto',
        entidadeNome: clienteNome,
        documentoNumero: docNum,
        valor: saldo,
        origem: tit.origem || 'Manual',
        status: tit.status,
      })
    }
  }

  // 10. Distribuir Títulos a Pagar Previstos
  for (const tit of titulosPagar) {
    const venc = (tit.data_vencimento || '').slice(0, 10)
    const saldo = Number(tit.saldo) || 0
    if (saldo <= 0) continue

    const fornecedorNome = tit.expand?.fornecedor_id?.razao_social || 'Fornecedor'
    const docNum = tit.numero_documento ? `${tit.numero_documento} (${tit.parcela || '1'})` : tit.id

    // Vencidos antes de hoje / antes de dataInicio
    if (venc < hojeIso || venc < dataInicio) {
      if (incluirVencidos && primeiroPeriodo) {
        primeiroPeriodo.aPagarPrevisto = Number((primeiroPeriodo.aPagarPrevisto + saldo).toFixed(2))
        primeiroPeriodo.itens.push({
          id: tit.id,
          tipo: 'Pagar Previsto',
          data: venc,
          descricao: `[VENCIDO] ${tit.descricao || 'Título a pagar em atraso'}`,
          entidadeNome: fornecedorNome,
          documentoNumero: docNum,
          valor: saldo,
          origem: tit.origem || 'Manual',
          status: 'Vencido',
        })
      }
      continue
    }

    if (venc > dataFim) continue

    const p = encontrarPeriodo(venc)
    if (p) {
      if (p.ehPassado) continue

      p.aPagarPrevisto = Number((p.aPagarPrevisto + saldo).toFixed(2))
      p.itens.push({
        id: tit.id,
        tipo: 'Pagar Previsto',
        data: venc,
        descricao: tit.descricao || 'Título a pagar previsto',
        entidadeNome: fornecedorNome,
        documentoNumero: docNum,
        valor: saldo,
        origem: tit.origem || 'Manual',
        status: tit.status,
      })
    }
  }

  // 11. Calcular Saldo Inicial, Totais e Saldo Final encadeados por período
  let saldoAcumulado = saldoInicialGeral
  let totalEntradasRealizadas = 0
  let totalSaidasRealizadas = 0
  let totalAReceberPrevisto = 0
  let totalAPagarPrevisto = 0

  for (let i = 0; i < periodos.length; i++) {
    const p = periodos[i]
    p.saldoInicial = Number(saldoAcumulado.toFixed(2))

    totalEntradasRealizadas += p.entradasRealizadas
    totalSaidasRealizadas += p.saidasRealizadas
    totalAReceberPrevisto += p.aReceberPrevisto
    totalAPagarPrevisto += p.aPagarPrevisto

    // Regra: Passado = só realizados. Atual e Futuro = realizados + previstos.
    if (p.ehPassado) {
      p.totalEntradas = p.entradasRealizadas
      p.totalSaidas = p.saidasRealizadas
    } else {
      p.totalEntradas = Number((p.entradasRealizadas + p.aReceberPrevisto).toFixed(2))
      p.totalSaidas = Number((p.saidasRealizadas + p.aPagarPrevisto).toFixed(2))
    }

    p.saldoLiquido = Number((p.totalEntradas - p.totalSaidas).toFixed(2))
    p.saldoFinalProjetado = Number((p.saldoInicial + p.saldoLiquido).toFixed(2))
    saldoAcumulado = p.saldoFinalProjetado
  }

  return {
    saldoInicialGeral,
    totalEntradasRealizadas: Number(totalEntradasRealizadas.toFixed(2)),
    totalSaidasRealizadas: Number(totalSaidasRealizadas.toFixed(2)),
    totalAReceberPrevisto: Number(totalAReceberPrevisto.toFixed(2)),
    totalAPagarPrevisto: Number(totalAPagarPrevisto.toFixed(2)),
    saldoFinalGeral: Number(saldoAcumulado.toFixed(2)),
    periodos,
    contasAnalisadas: contasFiltradas,
  }
}
