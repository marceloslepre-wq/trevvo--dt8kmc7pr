import pb from '@/lib/pocketbase/client'
import { GrupoDrePlano, PlanoConta } from './planoContas'
import { ContaPagar } from './financeiro'
import { ContaReceber } from './contasReceber'
import { MovimentoBancario } from './movimentacoesExtratos'

export type RegimeDre = 'Caixa' | 'Competencia'

export interface LancamentoDreItem {
  id: string
  origem: 'pagar_baixa' | 'receber_baixa' | 'titulo_pagar' | 'titulo_receber' | 'movimento_avulso'
  data: string
  descricao: string
  contraparte: string // Fornecedor, Cliente ou "Avulso"
  documento?: string
  valor: number
  tipo: 'Receita' | 'Despesa'
  plano_conta_id: string
  conta_codigo: string
  conta_descricao: string
}

export interface ContaAnaliticaDre {
  id: string
  codigo: string
  descricao: string
  valorPeriodoAtual: number
  valorPeriodoAnterior: number
  variacaoPercentual: number | null
  lancamentos: LancamentoDreItem[]
}

export interface LinhaDreEstruturada {
  id: string
  ordem: number
  grupo: GrupoDrePlano | 'Calculada'
  titulo: string
  sinal: '+' | '−' | '=' | '±'
  ehSubtotal: boolean
  valorPeriodoAtual: number
  valorPeriodoAnterior: number
  variacaoPercentual: number | null
  percentualReceitaLiquidaAtual: number | null
  percentualReceitaLiquidaAnterior: number | null
  contas: ContaAnaliticaDre[]
}

export interface RelatorioDreCompleto {
  regime: RegimeDre
  periodoAtual: {
    dataInicio: string
    dataFim: string
  }
  periodoAnterior: {
    dataInicio: string
    dataFim: string
  }
  linhas: LinhaDreEstruturada[]
  totais: {
    receitaBruta: number
    deducoes: number
    receitaLiquida: number
    custoMercadorias: number
    lucroBruto: number
    despesasOperacionais: number
    resultadoFinanceiro: number
    outrasReceitasDespesas: number
    resultadoPeriodo: number
  }
}

/**
 * Calcula período anterior equivalente com a mesma duração de dias imediatamente antes
 */
export function calcularPeriodoAnteriorEquivalente(
  dataInicioIso: string,
  dataFimIso: string,
): {
  dataInicio: string
  dataFim: string
} {
  const dInicio = new Date(dataInicioIso + 'T00:00:00')
  const dFim = new Date(dataFimIso + 'T00:00:00')

  const diffMs = dFim.getTime() - dInicio.getTime()
  const diffDias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)

  const dFimAnt = new Date(dInicio.getTime() - 1000 * 60 * 60 * 24)
  const dInicioAnt = new Date(dFimAnt.getTime() - (diffDias - 1) * 1000 * 60 * 60 * 24)

  return {
    dataInicio: dInicioAnt.toISOString().slice(0, 10),
    dataFim: dFimAnt.toISOString().slice(0, 10),
  }
}

function calcularVariacao(atual: number, anterior: number): number | null {
  if (anterior === 0) {
    if (atual === 0) return 0
    return null // Infinito ou indefinido
  }
  return Number((((atual - anterior) / Math.abs(anterior)) * 100).toFixed(2))
}

function calcularMargem(valor: number, baseReceitaLiquida: number): number | null {
  if (baseReceitaLiquida <= 0) return null
  return Number(((valor / baseReceitaLiquida) * 100).toFixed(2))
}

/**
 * Carrega a DRE gerencial para o período e regime informados
 */
export async function obterDreGerencial(params: {
  empresaId: string
  dataInicio: string
  dataFim: string
  regime: RegimeDre
}): Promise<RelatorioDreCompleto> {
  const { empresaId, dataInicio, dataFim, regime } = params
  const anterior = calcularPeriodoAnteriorEquivalente(dataInicio, dataFim)

  // 1. Carrega o plano de contas completo da empresa/sistema
  const todasContas = await pb.collection('plano_contas').getFullList<PlanoConta>({
    filter: `ativo = true && grupo_dre != 'Fora da DRE'`,
    sort: 'codigo',
  })
  const mapaContas = new Map<string, PlanoConta>()
  todasContas.forEach((c) => mapaContas.set(c.id, c))

  // 2. Busca lançamentos nos períodos (atual e anterior) conforme o regime
  const [lancamentosAtual, lancamentosAnterior] = await Promise.all([
    obterLancamentosPorPeriodo(empresaId, dataInicio, dataFim, regime, mapaContas),
    obterLancamentosPorPeriodo(
      empresaId,
      anterior.dataInicio,
      anterior.dataFim,
      regime,
      mapaContas,
    ),
  ])

  // 3. Agrupamento por grupo DRE e por conta analítica
  // Linhas conforme regra do negócio:
  // 1. Receita bruta
  // 2. (−) Deduções da receita
  // 3. (=) Receita líquida (Calculada: 1 - 2)
  // 4. (−) Custo das mercadorias
  // 5. (=) Lucro bruto (Calculada: 3 - 4)
  // 6. (−) Despesas operacionais
  // 7. (±) Resultado financeiro
  // 8. (±) Outras receitas e despesas
  // 9. (=) Resultado do período (Calculada: 5 - 6 + 7 + 8)

  type AcumuladorGrupo = {
    atual: number
    anterior: number
    contas: Map<string, ContaAnaliticaDre>
  }

  const mapaGrupos = new Map<GrupoDrePlano, AcumuladorGrupo>()
  const gruposValidos: GrupoDrePlano[] = [
    'Receita bruta',
    'Deduções da receita',
    'Custo das mercadorias',
    'Despesas operacionais',
    'Resultado financeiro',
    'Outras receitas e despesas',
  ]

  gruposValidos.forEach((g) => {
    mapaGrupos.set(g, {
      atual: 0,
      anterior: 0,
      contas: new Map(),
    })
  })

  // Agrega lançamentos do período atual
  for (const l of lancamentosAtual) {
    const conta = mapaContas.get(l.plano_conta_id)
    if (!conta || conta.grupo_dre === 'Fora da DRE') continue

    const ag = mapaGrupos.get(conta.grupo_dre)
    if (!ag) continue

    ag.atual += l.valor

    if (!ag.contas.has(conta.id)) {
      ag.contas.set(conta.id, {
        id: conta.id,
        codigo: conta.codigo,
        descricao: conta.descricao,
        valorPeriodoAtual: 0,
        valorPeriodoAnterior: 0,
        variacaoPercentual: null,
        lancamentos: [],
      })
    }
    const cItem = ag.contas.get(conta.id)!
    cItem.valorPeriodoAtual += l.valor
    cItem.lancamentos.push(l)
  }

  // Agrega lançamentos do período anterior
  for (const l of lancamentosAnterior) {
    const conta = mapaContas.get(l.plano_conta_id)
    if (!conta || conta.grupo_dre === 'Fora da DRE') continue

    const ag = mapaGrupos.get(conta.grupo_dre)
    if (!ag) continue

    ag.anterior += l.valor

    if (!ag.contas.has(conta.id)) {
      ag.contas.set(conta.id, {
        id: conta.id,
        codigo: conta.codigo,
        descricao: conta.descricao,
        valorPeriodoAtual: 0,
        valorPeriodoAnterior: 0,
        variacaoPercentual: null,
        lancamentos: [],
      })
    }
    const cItem = ag.contas.get(conta.id)!
    cItem.valorPeriodoAnterior += l.valor
  }

  // Preenche contas analíticas com variação e ordenação
  for (const ag of mapaGrupos.values()) {
    for (const c of ag.contas.values()) {
      c.variacaoPercentual = calcularVariacao(c.valorPeriodoAtual, c.valorPeriodoAnterior)
      // Ordena lançamentos por data decrescente
      c.lancamentos.sort((a, b) => b.data.localeCompare(a.data))
    }
  }

  // Helper para obter totais de um grupo
  const getG = (g: GrupoDrePlano) => {
    const ag = mapaGrupos.get(g)!
    const contasArr = Array.from(ag.contas.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true }),
    )
    return {
      atual: Number(ag.atual.toFixed(2)),
      anterior: Number(ag.anterior.toFixed(2)),
      contas: contasArr,
    }
  }

  const gReceitaBruta = getG('Receita bruta')
  const gDeducoes = getG('Deduções da receita')
  const recLiqAtual = Number((gReceitaBruta.atual - gDeducoes.atual).toFixed(2))
  const recLiqAnterior = Number((gReceitaBruta.anterior - gDeducoes.anterior).toFixed(2))

  const gCustos = getG('Custo das mercadorias')
  const lucroBrutoAtual = Number((recLiqAtual - gCustos.atual).toFixed(2))
  const lucroBrutoAnterior = Number((recLiqAnterior - gCustos.anterior).toFixed(2))

  const gDespesasOp = getG('Despesas operacionais')
  const gResFinanceiro = getG('Resultado financeiro')
  const gOutras = getG('Outras receitas e despesas')

  const resPeriodoAtual = Number(
    (lucroBrutoAtual - gDespesasOp.atual + gResFinanceiro.atual + gOutras.atual).toFixed(2),
  )
  const resPeriodoAnterior = Number(
    (
      lucroBrutoAnterior -
      gDespesasOp.anterior +
      gResFinanceiro.anterior +
      gOutras.anterior
    ).toFixed(2),
  )

  const linhas: LinhaDreEstruturada[] = [
    {
      id: 'receita_bruta',
      ordem: 1,
      grupo: 'Receita bruta',
      titulo: 'Receita bruta',
      sinal: '+',
      ehSubtotal: false,
      valorPeriodoAtual: gReceitaBruta.atual,
      valorPeriodoAnterior: gReceitaBruta.anterior,
      variacaoPercentual: calcularVariacao(gReceitaBruta.atual, gReceitaBruta.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gReceitaBruta.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gReceitaBruta.anterior, recLiqAnterior),
      contas: gReceitaBruta.contas,
    },
    {
      id: 'deducoes_receita',
      ordem: 2,
      grupo: 'Deduções da receita',
      titulo: '(−) Deduções da receita',
      sinal: '−',
      ehSubtotal: false,
      valorPeriodoAtual: gDeducoes.atual,
      valorPeriodoAnterior: gDeducoes.anterior,
      variacaoPercentual: calcularVariacao(gDeducoes.atual, gDeducoes.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gDeducoes.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gDeducoes.anterior, recLiqAnterior),
      contas: gDeducoes.contas,
    },
    {
      id: 'receita_liquida',
      ordem: 3,
      grupo: 'Calculada',
      titulo: '(=) Receita líquida',
      sinal: '=',
      ehSubtotal: true,
      valorPeriodoAtual: recLiqAtual,
      valorPeriodoAnterior: recLiqAnterior,
      variacaoPercentual: calcularVariacao(recLiqAtual, recLiqAnterior),
      percentualReceitaLiquidaAtual: recLiqAtual > 0 ? 100 : null,
      percentualReceitaLiquidaAnterior: recLiqAnterior > 0 ? 100 : null,
      contas: [],
    },
    {
      id: 'custo_mercadorias',
      ordem: 4,
      grupo: 'Custo das mercadorias',
      titulo: '(−) Custo das mercadorias',
      sinal: '−',
      ehSubtotal: false,
      valorPeriodoAtual: gCustos.atual,
      valorPeriodoAnterior: gCustos.anterior,
      variacaoPercentual: calcularVariacao(gCustos.atual, gCustos.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gCustos.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gCustos.anterior, recLiqAnterior),
      contas: gCustos.contas,
    },
    {
      id: 'lucro_bruto',
      ordem: 5,
      grupo: 'Calculada',
      titulo: '(=) Lucro bruto',
      sinal: '=',
      ehSubtotal: true,
      valorPeriodoAtual: lucroBrutoAtual,
      valorPeriodoAnterior: lucroBrutoAnterior,
      variacaoPercentual: calcularVariacao(lucroBrutoAtual, lucroBrutoAnterior),
      percentualReceitaLiquidaAtual: calcularMargem(lucroBrutoAtual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(lucroBrutoAnterior, recLiqAnterior),
      contas: [],
    },
    {
      id: 'despesas_operacionais',
      ordem: 6,
      grupo: 'Despesas operacionais',
      titulo: '(−) Despesas operacionais',
      sinal: '−',
      ehSubtotal: false,
      valorPeriodoAtual: gDespesasOp.atual,
      valorPeriodoAnterior: gDespesasOp.anterior,
      variacaoPercentual: calcularVariacao(gDespesasOp.atual, gDespesasOp.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gDespesasOp.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gDespesasOp.anterior, recLiqAnterior),
      contas: gDespesasOp.contas,
    },
    {
      id: 'resultado_financeiro',
      ordem: 7,
      grupo: 'Resultado financeiro',
      titulo: '(±) Resultado financeiro',
      sinal: '±',
      ehSubtotal: false,
      valorPeriodoAtual: gResFinanceiro.atual,
      valorPeriodoAnterior: gResFinanceiro.anterior,
      variacaoPercentual: calcularVariacao(gResFinanceiro.atual, gResFinanceiro.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gResFinanceiro.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gResFinanceiro.anterior, recLiqAnterior),
      contas: gResFinanceiro.contas,
    },
    {
      id: 'outras_receitas_despesas',
      ordem: 8,
      grupo: 'Outras receitas e despesas',
      titulo: '(±) Outras receitas e despesas',
      sinal: '±',
      ehSubtotal: false,
      valorPeriodoAtual: gOutras.atual,
      valorPeriodoAnterior: gOutras.anterior,
      variacaoPercentual: calcularVariacao(gOutras.atual, gOutras.anterior),
      percentualReceitaLiquidaAtual: calcularMargem(gOutras.atual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(gOutras.anterior, recLiqAnterior),
      contas: gOutras.contas,
    },
    {
      id: 'resultado_periodo',
      ordem: 9,
      grupo: 'Calculada',
      titulo: '(=) Resultado do período',
      sinal: '=',
      ehSubtotal: true,
      valorPeriodoAtual: resPeriodoAtual,
      valorPeriodoAnterior: resPeriodoAnterior,
      variacaoPercentual: calcularVariacao(resPeriodoAtual, resPeriodoAnterior),
      percentualReceitaLiquidaAtual: calcularMargem(resPeriodoAtual, recLiqAtual),
      percentualReceitaLiquidaAnterior: calcularMargem(resPeriodoAnterior, recLiqAnterior),
      contas: [],
    },
  ]

  return {
    regime,
    periodoAtual: { dataInicio, dataFim },
    periodoAnterior: anterior,
    linhas,
    totais: {
      receitaBruta: gReceitaBruta.atual,
      deducoes: gDeducoes.atual,
      receitaLiquida: recLiqAtual,
      custoMercadorias: gCustos.atual,
      lucroBruto: lucroBrutoAtual,
      despesasOperacionais: gDespesasOp.atual,
      resultadoFinanceiro: gResFinanceiro.atual,
      outrasReceitasDespesas: gOutras.atual,
      resultadoPeriodo: resPeriodoAtual,
    },
  }
}

/**
 * Consulta e padroniza os lançamentos individuais de acordo com o regime (Caixa ou Competência)
 */
async function obterLancamentosPorPeriodo(
  empresaId: string,
  dataInicio: string,
  dataFim: string,
  regime: RegimeDre,
  mapaContas: Map<string, PlanoConta>,
): Promise<LancamentoDreItem[]> {
  const itens: LancamentoDreItem[] = []

  if (regime === 'Caixa') {
    // REGIME DE CAIXA:
    // A) Baixas de títulos a pagar (pagamentos_baixas) pela data_pagamento
    // B) Baixas de títulos a receber (pagamentos_baixas) pela data_pagamento
    // C) Movimentações avulsas bancárias (origem = 'avulso') pela data_movimento
    const baixas = await pb.collection('pagamentos_baixas').getFullList({
      filter: `empresa_id = '${empresaId}' && estornado = false && ativo = true && data_pagamento >= '${dataInicio}' && data_pagamento <= '${dataFim}'`,
      expand: 'conta_pagar_id,conta_receber_id',
    })

    for (const b of baixas) {
      if (b.conta_pagar_id && b.expand?.conta_pagar_id) {
        const tit = b.expand.conta_pagar_id as ContaPagar
        const conta = mapaContas.get(tit.plano_conta_id)
        if (conta) {
          itens.push({
            id: `bx_pg_${b.id}`,
            origem: 'pagar_baixa',
            data: b.data_pagamento,
            descricao: tit.descricao || 'Pagamento de título',
            contraparte: tit.numero_documento ? `Doc: ${tit.numero_documento}` : 'Fornecedor',
            documento: tit.numero_documento,
            valor: Number(b.valor_pago || 0),
            tipo: 'Despesa',
            plano_conta_id: tit.plano_conta_id,
            conta_codigo: conta.codigo,
            conta_descricao: conta.descricao,
          })
        }
      } else if (b.conta_receber_id && b.expand?.conta_receber_id) {
        const tit = b.expand.conta_receber_id as ContaReceber
        const conta = mapaContas.get(tit.plano_conta_id)
        if (conta) {
          itens.push({
            id: `bx_rc_${b.id}`,
            origem: 'receber_baixa',
            data: b.data_pagamento,
            descricao: tit.descricao || 'Recebimento de título',
            contraparte: tit.numero_documento ? `Doc: ${tit.numero_documento}` : 'Cliente',
            documento: tit.numero_documento,
            valor: Number(b.valor_pago || 0),
            tipo: 'Receita',
            plano_conta_id: tit.plano_conta_id,
            conta_codigo: conta.codigo,
            conta_descricao: conta.descricao,
          })
        }
      }
    }

    // C) Movimentações bancárias avulsas
    const movs = await pb.collection('movimentacoes_financeiras').getFullList<MovimentoBancario>({
      filter: `empresa_id = '${empresaId}' && estornado = false && ativo = true && origem = 'avulso' && data_movimento >= '${dataInicio}' && data_movimento <= '${dataFim}'`,
    })

    for (const m of movs) {
      if (!m.plano_conta_id) continue
      const conta = mapaContas.get(m.plano_conta_id)
      if (conta) {
        itens.push({
          id: `mov_${m.id}`,
          origem: 'movimento_avulso',
          data: m.data_movimento,
          descricao: m.historico || 'Lançamento avulso bancário',
          contraparte: m.documento || 'Avulso bancário',
          documento: m.documento,
          valor: Number(m.valor || 0),
          tipo: m.tipo === 'Entrada' ? 'Receita' : 'Despesa',
          plano_conta_id: m.plano_conta_id,
          conta_codigo: conta.codigo,
          conta_descricao: conta.descricao,
        })
      }
    }
  } else {
    // REGIME DE COMPETÊNCIA:
    // A) Contas a pagar pela data_competencia (exclui status Cancelado)
    // B) Contas a receber pela data_competencia (exclui status Cancelado)
    // C) Lançamentos avulsos bancários pela data_movimento (já que são gerados diretamente)
    const [pagar, receber, movs] = await Promise.all([
      pb.collection('contas_pagar').getFullList<ContaPagar>({
        filter: `empresa_id = '${empresaId}' && status != 'Cancelado' && ativo = true && data_competencia >= '${dataInicio}' && data_competencia <= '${dataFim}'`,
      }),
      pb.collection('contas_receber').getFullList<ContaReceber>({
        filter: `empresa_id = '${empresaId}' && status != 'Cancelado' && ativo = true && data_competencia >= '${dataInicio}' && data_competencia <= '${dataFim}'`,
      }),
      pb.collection('movimentacoes_financeiras').getFullList<MovimentoBancario>({
        filter: `empresa_id = '${empresaId}' && estornado = false && ativo = true && origem = 'avulso' && data_movimento >= '${dataInicio}' && data_movimento <= '${dataFim}'`,
      }),
    ])

    for (const p of pagar) {
      const conta = mapaContas.get(p.plano_conta_id)
      if (conta) {
        itens.push({
          id: `tit_pg_${p.id}`,
          origem: 'titulo_pagar',
          data: p.data_competencia || p.data_emissao,
          descricao: p.descricao || 'Despesa compromissada',
          contraparte: p.numero_documento ? `Doc: ${p.numero_documento}` : 'Fornecedor',
          documento: p.numero_documento,
          valor: Number(p.valor_original || 0),
          tipo: 'Despesa',
          plano_conta_id: p.plano_conta_id,
          conta_codigo: conta.codigo,
          conta_descricao: conta.descricao,
        })
      }
    }

    for (const r of receber) {
      const conta = mapaContas.get(r.plano_conta_id)
      if (conta) {
        itens.push({
          id: `tit_rc_${r.id}`,
          origem: 'titulo_receber',
          data: r.data_competencia || r.data_emissao,
          descricao: r.descricao || 'Receita reconhecida',
          contraparte: r.numero_documento ? `Doc: ${r.numero_documento}` : 'Cliente',
          documento: r.numero_documento,
          valor: Number(r.valor_original || 0),
          tipo: 'Receita',
          plano_conta_id: r.plano_conta_id,
          conta_codigo: conta.codigo,
          conta_descricao: conta.descricao,
        })
      }
    }

    for (const m of movs) {
      if (!m.plano_conta_id) continue
      const conta = mapaContas.get(m.plano_conta_id)
      if (conta) {
        itens.push({
          id: `mov_${m.id}`,
          origem: 'movimento_avulso',
          data: m.data_movimento,
          descricao: m.historico || 'Lançamento avulso bancário',
          contraparte: m.documento || 'Avulso bancário',
          documento: m.documento,
          valor: Number(m.valor || 0),
          tipo: m.tipo === 'Entrada' ? 'Receita' : 'Despesa',
          plano_conta_id: m.plano_conta_id,
          conta_codigo: conta.codigo,
          conta_descricao: conta.descricao,
        })
      }
    }
  }

  return itens
}

/**
 * Exporta os dados da DRE formatados em CSV no padrão brasileiro (delimitador ';' e decimais com vírgula)
 */
export function exportarDreCsv(dre: RelatorioDreCompleto): string {
  const linhas: string[] = []
  const formatarValorPtBr = (v: number | null | undefined) => {
    if (v === null || v === undefined) return ''
    return v.toFixed(2).replace('.', ',')
  }

  linhas.push(`DRE GERENCIAL - REGIME DE ${dre.regime.toUpperCase()}`)
  linhas.push(
    `Periodo Atual: ${dre.periodoAtual.dataInicio} ate ${dre.periodoAtual.dataFim};Periodo Anterior: ${dre.periodoAnterior.dataInicio} ate ${dre.periodoAnterior.dataFim}`,
  )
  linhas.push('')
  linhas.push(
    'Estrutura;Descricao;Periodo Atual (R$);% Margem Liq.;Periodo Anterior (R$);% Margem Liq. Ant.;Variacao %',
  )

  for (const l of dre.linhas) {
    const tituloFormatado = `"${l.titulo}"`
    linhas.push(
      [
        l.ordem,
        tituloFormatado,
        formatarValorPtBr(l.valorPeriodoAtual),
        formatarValorPtBr(l.percentualReceitaLiquidaAtual),
        formatarValorPtBr(l.valorPeriodoAnterior),
        formatarValorPtBr(l.percentualReceitaLiquidaAnterior),
        formatarValorPtBr(l.variacaoPercentual),
      ].join(';'),
    )

    // Contas analíticas filhas
    for (const c of l.contas) {
      linhas.push(
        [
          '',
          `"  ${c.codigo} - ${c.descricao}"`,
          formatarValorPtBr(c.valorPeriodoAtual),
          '',
          formatarValorPtBr(c.valorPeriodoAnterior),
          '',
          formatarValorPtBr(c.variacaoPercentual),
        ].join(';'),
      )
    }
  }

  linhas.push('')
  linhas.push(
    '"Nota: O custo das mercadorias aqui e o das compras pagas ou lancadas; o custo das mercadorias vendidas pelo estoque entra quando houver vendas (Etapa 5)."',
  )

  return linhas.join('\r\n')
}
