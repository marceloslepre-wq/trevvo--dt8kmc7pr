/**
 * Serviço de Apuração de Fluxo de Caixa (Realizado x Previsto)
 * Módulo: financeiro_bancos
 *
 * Regras:
 * - Filtros: período (início e fim), empresas (multiempresa — filtro OR), contas financeiras
 *   (padrão todas das empresas marcadas), agrupamento (dia, semana, mês)
 * - "Incluir vencidos em aberto": somados no 1º período projetado
 * - Transferências entre contas selecionadas são NEUTRALIZADAS (não contam como entrada nem saída)
 *   e só dentro da MESMA empresa (nunca cruza contas de lojas diferentes)
 * - Períodos passados: só realizados
 * - Período atual e futuros: realizados + previstos (títulos em aberto de contas_pagar e contas_receber)
 * - Saldo inicial computado por CONTA financeira: contas de empresas diferentes nunca somam
 *   seu saldo na mesma linha (quebra por empresa segregada no ResumoFluxoCaixa.porEmpresa)
 */

import pb from '@/lib/pocketbase/client'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { MovimentoExtratoItem } from '@/services/movimentacoesExtratos'
import { montarFiltroEmpresas } from '@/services/filtroMultiempresa'

export type AgrupamentoFluxo = 'dia' | 'semana' | 'mes'

export interface FiltrosFluxoCaixa {
  /** @deprecated use empresaIds (multiempresa). Mantido para retrocompatibilidade. */
  empresaId?: string
  /** TODAS as empresas marcadas (o escopo de assinante é garantido pelas regras de acesso) */
  empresaIds: string[]
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  contasIds?: string[] // vazio ou indefinido = todas das empresas marcadas
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
  empresa_id?: string
  conta_financeira_id?: string
  contaNome?: string
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

/** Quebra de um período por empresa (para o painel "Totais por Empresa") */
export interface PeriodoPorEmpresa {
  empresa_id: string
  saldoInicial: number
  entradasRealizadas: number
  saidasRealizadas: number
  aReceberPrevisto: number
  aPagarPrevisto: number
  totalEntradas: number
  totalSaidas: number
  saldoLiquido: number
  saldoFinalProjetado: number
}

/** Saldo por CONTA financeira — cada conta carrega o saldo da SUA empresa (nunca somado a outra) */
export interface SaldoPorConta {
  conta_id: string
  empresa_id: string
  nome: string
  tipo: string
  saldoEmDataInicio: number
}

export interface ResumoFluxoCaixa {
  saldoInicialGeral: number
  totalEntradasRealizadas: number
  totalSaidasRealizadas: number
  totalAReceberPrevisto: number
  totalAPagarPrevisto: number
  saldoFinalGeral: number
  periodos: PeriodoFluxoCaixa[]
  /** Quebra por empresa por período (mesma ordem de `periodos`) */
  porEmpresa: PeriodoPorEmpresa[][]
  /** Saldo na data inicial por CONTA, segregado por empresa */
  saldosPorConta: SaldoPorConta[]
  contasAnalisadas: ContaFinanceira[]
  empresaIds: string[]
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

/** Estrutura interna de acumulação por empresa por período */
interface AcumEmpresa {
  saldoInicial: number
  entradasRealizadas: number
  saidasRealizadas: number
  aReceberPrevisto: number
  aPagarPrevisto: number
}

/**
 * Apura o Fluxo de Caixa completo (multiempresa: TODAS as empresas marcadas via filtro OR)
 */
export async function apurarFluxoCaixa(filtros: FiltrosFluxoCaixa): Promise<ResumoFluxoCaixa> {
  const { dataInicio, dataFim, contasIds, agrupamento, incluirVencidos } = filtros

  // Multiempresa: TODAS as empresas marcadas (nunca colapsa na primeira)
  const empresaIdsEfetivas = Array.from(
    new Set(
      [filtros.empresaIds || [], filtros.empresaId ? [filtros.empresaId] : []]
        .flat()
        .filter(Boolean),
    ),
  )
  if (empresaIdsEfetivas.length === 0) {
    throw new Error('Selecione pelo menos uma empresa para apurar o fluxo de caixa.')
  }

  const filtroEmpresas = montarFiltroEmpresas(empresaIdsEfetivas)

  // 1. Contas financeiras das EMPRESAS MARCADAS (saldo por conta, segregado por empresa)
  const todasContas = await listarContasFinanceiras({ situacao: 'ativos' })
  const setEmpresas = new Set(empresaIdsEfetivas)
  const contasDasEmpresas = todasContas.filter((c) => setEmpresas.has(c.empresa_id))

  const contasFiltradas =
    contasIds && contasIds.length > 0
      ? contasDasEmpresas.filter((c) => contasIds.includes(c.id))
      : contasDasEmpresas

  const setContasIds = new Set(contasFiltradas.map((c) => c.id))

  // 2. Movimentações financeiras de TODAS as empresas marcadas até dataFim
  const movs = await pb.collection('movimentacoes_financeiras').getFullList<MovimentoExtratoItem>({
    filter: `${filtroEmpresas} && ativo = true`,
    sort: 'data_movimento,created',
    expand: 'conta_financeira_id',
    requestKey: null,
  })

  // 3. Títulos a pagar em aberto ou pagos parciais (todas as empresas marcadas)
  const titulosPagar = await pb.collection('contas_pagar').getFullList<any>({
    filter: `${filtroEmpresas} && ativo = true && status != 'Pago' && status != 'Cancelado'`,
    sort: 'data_vencimento',
    expand: 'fornecedor_id,plano_conta_id',
    requestKey: null,
  })

  // 4. Títulos a receber em aberto ou parciais
  const titulosReceber = await pb.collection('contas_receber').getFullList<any>({
    filter: `${filtroEmpresas} && ativo = true && status != 'Recebido' && status != 'Cancelado'`,
    sort: 'data_vencimento',
    expand: 'cliente_id,plano_conta_id',
    requestKey: null,
  })

  // 5. Apurar Saldo Inicial por CONTA na dataInicio (saldo por empresa, nunca somado entre lojas):
  let saldoInicialGeral = 0
  const saldosPorContaMap = new Map<string, number>() // conta_id -> saldo em dataInicio

  contasFiltradas.forEach((c) => {
    saldosPorContaMap.set(c.id, Number(c.saldo_inicial) || 0)
  })

  for (const m of movs) {
    if (!setContasIds.has(m.conta_financeira_id)) continue
    if (m.estornado) continue

    const dataM = (m.data_movimento || '').slice(0, 10)
    const valor = Number(m.valor) || 0

    if (dataM < dataInicio) {
      const atual = saldosPorContaMap.get(m.conta_financeira_id) || 0
      if (m.tipo === 'Entrada') {
        saldosPorContaMap.set(m.conta_financeira_id, Number((atual + valor).toFixed(2)))
      } else {
        saldosPorContaMap.set(m.conta_financeira_id, Number((atual - valor).toFixed(2)))
      }
    }
  }

  // Quebra do saldo inicial por empresa: cada conta só soma no saldo da SUA empresa
  const saldoInicialPorEmpresa = new Map<string, number>()
  const saldosPorContaLista: SaldoPorConta[] = []
  for (const c of contasFiltradas) {
    const saldo = saldosPorContaMap.get(c.id) || 0
    saldoInicialPorEmpresa.set(
      c.empresa_id,
      Number(((saldoInicialPorEmpresa.get(c.empresa_id) || 0) + saldo).toFixed(2)),
    )
    saldoInicialGeral += saldo
    saldosPorContaLista.push({
      conta_id: c.id,
      empresa_id: c.empresa_id,
      nome: c.nome,
      tipo: c.tipo,
      saldoEmDataInicio: Number(saldo.toFixed(2)),
    })
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
      porEmpresa: [],
      saldosPorConta: saldosPorContaLista,
      contasAnalisadas: contasFiltradas,
      empresaIds: empresaIdsEfetivas,
    }
  }

  const hojeIso = new Date().toISOString().slice(0, 10)

  // Mapear transferências entre contas que estão no filtro para neutralizar
  // IMPORTANTE: a neutralização é por transferência_id e SÓ quando AMBAS as pontas estão no
  // conjunto de contas E na MESMA empresa (transferência entre lojas não é neutralizada —
  // é saída na loja de origem e entrada na de destino).
  const transfEntreContasSelecionadas = new Set<string>()
  const transfMap = new Map<string, { contas: Set<string>; empresa: string }>()

  for (const m of movs) {
    if (m.transferencia_id && !m.estornado) {
      const atual = transfMap.get(m.transferencia_id)
      if (atual) {
        atual.contas.add(m.conta_financeira_id)
      } else {
        const contas = new Set<string>()
        contas.add(m.conta_financeira_id)
        transfMap.set(m.transferencia_id, { contas, empresa: m.empresa_id })
      }
    }
  }

  for (const [transfId, info] of transfMap.entries()) {
    // Só neutraliza quando TODAS as pontas estão nas contas filtradas e na MESMA empresa
    const todasDentro = Array.from(info.contas).every((id) => setContasIds.has(id))
    if (info.empresa && todasDentro && info.contas.size >= 2) {
      transfEntreContasSelecionadas.add(transfId)
    }
  }

  // 7. Estruturar cada período (com acumulação por empresa)
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

  // Acumuladores por empresa (por período): matrizes paralelas às periods
  const acumPorEmpresa: Map<string, AcumEmpresa>[] = periodos.map(() => {
    const m = new Map<string, AcumEmpresa>()
    for (const eid of empresaIdsEfetivas) {
      m.set(eid, {
        saldoInicial: 0,
        entradasRealizadas: 0,
        saidasRealizadas: 0,
        aReceberPrevisto: 0,
        aPagarPrevisto: 0,
      })
    }
    return m
  })

  // Função auxiliar para encontrar o período de uma data
  function encontrarPeriodo(dataIso: string): PeriodoFluxoCaixa | undefined {
    return periodos.find((p) => dataIso >= p.dataInicioPeriodo && dataIso <= p.dataFimPeriodo)
  }

  // 8. Distribuir Movimentações Realizadas
  for (const m of movs) {
    if (!setContasIds.has(m.conta_financeira_id)) continue
    if (m.estornado) continue

    // Se é transferência entre contas filtradas da MESMA empresa, NEUTRALIZA
    if (m.transferencia_id && transfEntreContasSelecionadas.has(m.transferencia_id)) {
      continue
    }

    const dataM = (m.data_movimento || '').slice(0, 10)
    if (dataM < dataInicio || dataM > dataFim) continue

    const p = encontrarPeriodo(dataM)
    if (!p) continue

    const valor = Number(m.valor) || 0
    const nomeConta = m.expand?.conta_financeira_id?.nome || 'Conta'

    const idx = periodos.indexOf(p)
    const empAcum = acumPorEmpresa[idx]?.get(m.empresa_id)
    if (empAcum) {
      if (m.tipo === 'Entrada') {
        empAcum.entradasRealizadas = Number((empAcum.entradasRealizadas + valor).toFixed(2))
      } else {
        empAcum.saidasRealizadas = Number((empAcum.saidasRealizadas + valor).toFixed(2))
      }
    }

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
        empresa_id: m.empresa_id,
        conta_financeira_id: m.conta_financeira_id,
        contaNome: nomeConta,
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
        empresa_id: m.empresa_id,
        conta_financeira_id: m.conta_financeira_id,
        contaNome: nomeConta,
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
        const idx = 0
        const empAcum = acumPorEmpresa[idx].get(tit.empresa_id)
        if (empAcum) {
          empAcum.aReceberPrevisto = Number((empAcum.aReceberPrevisto + saldo).toFixed(2))
        }
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
          empresa_id: tit.empresa_id,
        })
      }
      continue
    }

    if (venc > dataFim) continue

    const p = encontrarPeriodo(venc)
    if (p) {
      // Períodos passados não recebem previstos
      if (p.ehPassado) continue

      const idx = periodos.indexOf(p)
      const empAcum = acumPorEmpresa[idx].get(tit.empresa_id)
      if (empAcum) {
        empAcum.aReceberPrevisto = Number((empAcum.aReceberPrevisto + saldo).toFixed(2))
      }

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
        empresa_id: tit.empresa_id,
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
        const empAcum = acumPorEmpresa[0].get(tit.empresa_id)
        if (empAcum) {
          empAcum.aPagarPrevisto = Number((empAcum.aPagarPrevisto + saldo).toFixed(2))
        }
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
          empresa_id: tit.empresa_id,
        })
      }
      continue
    }

    if (venc > dataFim) continue

    const p = encontrarPeriodo(venc)
    if (p) {
      if (p.ehPassado) continue

      const idx = periodos.indexOf(p)
      const empAcum = acumPorEmpresa[idx].get(tit.empresa_id)
      if (empAcum) {
        empAcum.aPagarPrevisto = Number((empAcum.aPagarPrevisto + saldo).toFixed(2))
      }

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
        empresa_id: tit.empresa_id,
      })
    }
  }

  // 11. Calcular Saldo Inicial, Totais e Saldo Final encadeados por período
  // (consolidado geral = soma das empresas; quebra por empresa calculada em paralelo)
  let saldoAcumulado = saldoInicialGeral
  const saldoAcumPorEmpresa = new Map<string, number>()
  for (const eid of empresaIdsEfetivas) {
    saldoAcumPorEmpresa.set(eid, saldoInicialPorEmpresa.get(eid) || 0)
  }

  const porEmpresa: PeriodoPorEmpresa[][] = []
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

    // Quebra por empresa deste período (consistente com a regra passado/atual/futuro)
    const linhaEmpresa: PeriodoPorEmpresa[] = []
    for (const eid of empresaIdsEfetivas) {
      const acum = acumPorEmpresa[i].get(eid)
      if (!acum) continue
      const saldoInicialEmp = saldoAcumPorEmpresa.get(eid) || 0

      const totalEntradasEmp = p.ehPassado
        ? acum.entradasRealizadas
        : Number((acum.entradasRealizadas + acum.aReceberPrevisto).toFixed(2))
      const totalSaidasEmp = p.ehPassado
        ? acum.saidasRealizadas
        : Number((acum.saidasRealizadas + acum.aPagarPrevisto).toFixed(2))
      const saldoLiquidoEmp = Number((totalEntradasEmp - totalSaidasEmp).toFixed(2))
      const saldoFinalEmp = Number((saldoInicialEmp + saldoLiquidoEmp).toFixed(2))

      linhaEmpresa.push({
        empresa_id: eid,
        saldoInicial: Number(saldoInicialEmp.toFixed(2)),
        entradasRealizadas: acum.entradasRealizadas,
        saidasRealizadas: acum.saidasRealizadas,
        aReceberPrevisto: acum.aReceberPrevisto,
        aPagarPrevisto: acum.aPagarPrevisto,
        totalEntradas: totalEntradasEmp,
        totalSaidas: totalSaidasEmp,
        saldoLiquido: saldoLiquidoEmp,
        saldoFinalProjetado: saldoFinalEmp,
      })

      saldoAcumPorEmpresa.set(eid, saldoFinalEmp)
    }
    porEmpresa.push(linhaEmpresa)
  }

  return {
    saldoInicialGeral,
    totalEntradasRealizadas: Number(totalEntradasRealizadas.toFixed(2)),
    totalSaidasRealizadas: Number(totalSaidasRealizadas.toFixed(2)),
    totalAReceberPrevisto: Number(totalAReceberPrevisto.toFixed(2)),
    totalAPagarPrevisto: Number(totalAPagarPrevisto.toFixed(2)),
    saldoFinalGeral: Number(saldoAcumulado.toFixed(2)),
    periodos,
    porEmpresa,
    saldosPorConta: saldosPorContaLista,
    contasAnalisadas: contasFiltradas,
    empresaIds: empresaIdsEfetivas,
  }
}
