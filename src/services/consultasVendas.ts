import pb from '@/lib/pocketbase/client'

export interface FiltrosConsultasVendas {
  /** Uma ou várias empresas (multiempresa). Precedência sobre empresa_id. */
  empresa_ids?: string[]
  empresa_id?: string
  data_inicio: string
  data_fim: string
}

/** Monta o filtro de empresas: (empresa_id = "id1" || empresa_id = "id2" || ...) */
function filtroEmpresas(empresaIds: string[], campo = 'empresa_id'): string {
  const ids = (empresaIds || []).filter(Boolean)
  if (ids.length === 0) return `1 != 1`
  if (ids.length === 1) return `${campo} = '${ids[0]}'`
  return `(${ids.map((id) => `${campo} = '${id}'`).join(' || ')})`
}

export interface TotaisPeriodoVendas {
  valor_total: number
  quantidade_vendas: number
  ticket_medio: number
  valor_devolucoes: number
  quantidade_devolucoes: number
  valor_liquido: number
}

export interface TotaisPorEmpresaVendas {
  empresa_id: string
  valor_total: number
  quantidade_vendas: number
  valor_devolucoes: number
  valor_liquido: number
}

export interface VendaPorDia {
  data: string
  valor: number
  quantidade: number
  ticket_medio: number
}

export interface VendaPorFormaPagamento {
  forma_id: string
  descricao: string
  codigo_tpag: string
  valor: number
  percentual: number
}

export interface VendaPorVendedor {
  vendedor_id: string
  nome: string
  valor: number
  quantidade: number
  ticket_medio: number
  percentual: number
}

export interface VendaPorTerminal {
  terminal_id: string
  nome: string
  valor: number
  quantidade: number
  percentual: number
}

export interface ConsultaPeriodoResultado {
  totais: TotaisPeriodoVendas
  totais_por_empresa: TotaisPorEmpresaVendas[]
  por_dia: VendaPorDia[]
  por_forma_pagamento: VendaPorFormaPagamento[]
  por_vendedor: VendaPorVendedor[]
  por_terminal: VendaPorTerminal[]
}

export interface ItemCurvaAbcProduto {
  produto_id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_vendida: number
  valor_total: number
  preco_medio_venda: number
  custo_medio_venda: number
  margem_bruta_valor: number
  margem_bruta_percentual: number
  percentual_sobre_total: number
  percentual_acumulado: number
  classe_abc: 'A' | 'B' | 'C'
}

export interface CurvaAbcResultado {
  criterio: 'valor' | 'quantidade'
  total_geral_valor: number
  total_geral_quantidade: number
  itens: ItemCurvaAbcProduto[]
  totais_por_empresa: TotaisPorEmpresaVendas[]
}

export interface MargemVendaItem {
  venda_id: string
  numero: number
  data_emissao: string
  tipo: string
  empresa_id: string
  cliente_nome: string
  vendedor_nome: string
  valor_venda: number
  custo_total: number
  margem_lucro_valor: number
  margem_lucro_percentual: number
}

/** Normaliza a lista de empresas de um filtro (aceita empresa_ids plural ou empresa_id simples) */
export function normalizarEmpresasIds(filtros: FiltrosConsultasVendas): string[] {
  const plural = (filtros.empresa_ids || []).filter(Boolean)
  if (plural.length > 0) return plural
  return filtros.empresa_id ? [filtros.empresa_id] : []
}

/**
 * Consulta vendas por período agrupadas por totais, dia, forma, vendedor e terminal
 */
export async function consultarVendasPorPeriodo(
  filtros: FiltrosConsultasVendas,
): Promise<ConsultaPeriodoResultado> {
  const { data_inicio, data_fim } = filtros
  const empresas = normalizarEmpresasIds(filtros)
  const filtroEmpresa = filtroEmpresas(empresas)

  // Buscar vendas do período
  const vendas = await pb.collection('vendas').getFullList({
    filter: `${filtroEmpresa} && ativo = true && status = 'Finalizada' && data_emissao >= '${data_inicio}' && data_emissao <= '${data_fim}'`,
    sort: 'data_emissao,numero',
    expand: 'vendedor_id,cliente_id,pdv_terminal_id',
  })

  // Buscar todos os pagamentos das vendas finalizadas no período
  let pagamentos: any[] = []
  if (vendas.length > 0) {
    const filtroVendaEmpresas = filtroEmpresas(empresas, 'venda_id.empresa_id')
    pagamentos = await pb.collection('vendas_pagamentos').getFullList({
      filter: `ativo = true && ${filtroVendaEmpresas} && venda_id.status = 'Finalizada' && venda_id.data_emissao >= '${data_inicio}' && venda_id.data_emissao <= '${data_fim}'`,
      expand: 'forma_pagamento_id',
    })
  }

  // 1. Totais
  let valorTotalVendas = 0
  let qtdVendas = 0
  let valorDevolucoes = 0
  let qtdDevolucoes = 0

  const mapDia = new Map<string, { valor: number; qtd: number }>()
  const mapVendedor = new Map<string, { nome: string; valor: number; qtd: number }>()
  const mapTerminal = new Map<string, { nome: string; valor: number; qtd: number }>()
  const mapEmpresa = new Map<
    string,
    { valor: number; qtd: number; devolucoes: number; qtdDev: number }
  >()

  for (const v of vendas) {
    const val = Number((v as any).valor_total) || 0
    const tipo = (v as any).tipo || 'Pedido'
    const dataIso = (v as any).data_emissao || (v.created ? v.created.slice(0, 10) : '')
    const empId = (v as any).empresa_id || '(sem empresa)'

    if (tipo === 'Devolução') {
      valorDevolucoes += val
      qtdDevolucoes += 1
      const eInfo = mapEmpresa.get(empId) || { valor: 0, qtd: 0, devolucoes: 0, qtdDev: 0 }
      eInfo.devolucoes += val
      eInfo.qtdDev += 1
      mapEmpresa.set(empId, eInfo)
      continue
    }

    valorTotalVendas += val
    qtdVendas += 1
    const eInfo = mapEmpresa.get(empId) || { valor: 0, qtd: 0, devolucoes: 0, qtdDev: 0 }
    eInfo.valor += val
    eInfo.qtd += 1
    mapEmpresa.set(empId, eInfo)

    // Dia
    if (dataIso) {
      const d = mapDia.get(dataIso) || { valor: 0, qtd: 0 }
      d.valor += val
      d.qtd += 1
      mapDia.set(dataIso, d)
    }

    // Vendedor
    const vendId = (v as any).vendedor_id || 'sem_vendedor'
    const vendNome =
      (v.expand as any)?.vendedor_id?.name ||
      (v.expand as any)?.vendedor_id?.email ||
      'Não identificado'
    const vInfo = mapVendedor.get(vendId) || { nome: vendNome, valor: 0, qtd: 0 }
    vInfo.valor += val
    vInfo.qtd += 1
    mapVendedor.set(vendId, vInfo)

    // Terminal
    const termId = (v as any).pdv_terminal_id || 'balcao'
    const termNome = (v.expand as any)?.pdv_terminal_id?.nome || 'Balcão / Pedidos Web'
    const tInfo = mapTerminal.get(termId) || { nome: termNome, valor: 0, qtd: 0 }
    tInfo.valor += val
    tInfo.qtd += 1
    mapTerminal.set(termId, tInfo)
  }

  const ticketMedio = qtdVendas > 0 ? Number((valorTotalVendas / qtdVendas).toFixed(2)) : 0
  const valorLiquido = Number((valorTotalVendas - valorDevolucoes).toFixed(2))

  // 2. Formatar por dia
  const porDia: VendaPorDia[] = Array.from(mapDia.entries())
    .map(([data, info]) => ({
      data,
      valor: Number(info.valor.toFixed(2)),
      quantidade: info.qtd,
      ticket_medio: info.qtd > 0 ? Number((info.valor / info.qtd).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

  // 3. Formatar por vendedor
  const porVendedor: VendaPorVendedor[] = Array.from(mapVendedor.entries())
    .map(([vendedor_id, info]) => ({
      vendedor_id,
      nome: info.nome,
      valor: Number(info.valor.toFixed(2)),
      quantidade: info.qtd,
      ticket_medio: info.qtd > 0 ? Number((info.valor / info.qtd).toFixed(2)) : 0,
      percentual:
        valorTotalVendas > 0 ? Number(((info.valor / valorTotalVendas) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  // 4. Formatar por terminal
  const porTerminal: VendaPorTerminal[] = Array.from(mapTerminal.entries())
    .map(([terminal_id, info]) => ({
      terminal_id,
      nome: info.nome,
      valor: Number(info.valor.toFixed(2)),
      quantidade: info.qtd,
      percentual:
        valorTotalVendas > 0 ? Number(((info.valor / valorTotalVendas) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  // 5. Formatar por forma de pagamento
  const mapFormas = new Map<string, { desc: string; cod: string; valor: number }>()
  let totalPagamentos = 0

  for (const pg of pagamentos) {
    const val = Number((pg as any).valor) || 0
    const fId = (pg as any).forma_pagamento_id || 'sem_forma'
    const fExp = (pg.expand as any)?.forma_pagamento_id
    const fDesc = fExp?.descricao || 'Outros'
    const fCod = fExp?.codigo_tpag || '99'

    totalPagamentos += val
    const atual = mapFormas.get(fId) || { desc: fDesc, cod: fCod, valor: 0 }
    atual.valor += val
    mapFormas.set(fId, atual)
  }

  const porFormaPagamento: VendaPorFormaPagamento[] = Array.from(mapFormas.entries())
    .map(([forma_id, f]) => ({
      forma_id,
      descricao: f.desc,
      codigo_tpag: f.cod,
      valor: Number(f.valor.toFixed(2)),
      percentual: totalPagamentos > 0 ? Number(((f.valor / totalPagamentos) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  // 6. Quebra por empresa
  const totaisPorEmpresa: TotaisPorEmpresaVendas[] = Array.from(mapEmpresa.entries())
    .map(([empresa_id, e]) => ({
      empresa_id,
      valor_total: Number(e.valor.toFixed(2)),
      quantidade_vendas: e.qtd,
      valor_devolucoes: Number(e.devolucoes.toFixed(2)),
      valor_liquido: Number((e.valor - e.devolucoes).toFixed(2)),
    }))
    .sort((a, b) => b.valor_total - a.valor_total)

  return {
    totais: {
      valor_total: Number(valorTotalVendas.toFixed(2)),
      quantidade_vendas: qtdVendas,
      ticket_medio: ticketMedio,
      valor_devolucoes: Number(valorDevolucoes.toFixed(2)),
      quantidade_devolucoes: qtdDevolucoes,
      valor_liquido: valorLiquido,
    },
    totais_por_empresa: totaisPorEmpresa,
    por_dia: porDia,
    por_forma_pagamento: porFormaPagamento,
    por_vendedor: porVendedor,
    por_terminal: porTerminal,
  }
}

/**
 * Consulta produtos mais vendidos e curva ABC (por valor ou por quantidade)
 */
export async function consultarCurvaAbcProdutos(params: {
  empresa_ids?: string[]
  empresa_id?: string
  data_inicio: string
  data_fim: string
  criterio: 'valor' | 'quantidade'
}): Promise<CurvaAbcResultado> {
  const { data_inicio, data_fim, criterio } = params
  const empresas = normalizarEmpresasIds(params)
  const filtroEmpresa = filtroEmpresas(empresas, 'venda_id.empresa_id')

  // Buscar itens de vendas finalizadas (não devoluções) no período
  const itensVenda = await pb.collection('vendas_itens').getFullList({
    filter: `ativo = true && ${filtroEmpresa} && venda_id.status = 'Finalizada' && venda_id.tipo != 'Devolução' && venda_id.data_emissao >= '${data_inicio}' && venda_id.data_emissao <= '${data_fim}'`,
    // expand venda_id é obrigatório: a quebra por empresa lê venda_id.empresa_id do item
    // (sem o expand, tudo caía em "(sem empresa)" e virava a linha fantasma "Sem empresa")
    expand: 'produto_id,venda_id',
  })

  const mapaProdutos = new Map<
    string,
    {
      id: string
      codigo: string
      descricao: string
      unidade: string
      qtd: number
      valor: number
      custo: number
    }
  >()

  let totalGeralValor = 0
  let totalGeralQtd = 0
  const mapEmpresa = new Map<string, { valor: number; qtd: number }>()

  for (const it of itensVenda) {
    const prodId = (it as any).produto_id
    if (!prodId) continue

    const qtd = Number((it as any).quantidade) || 0
    const val = Number((it as any).valor_total) || 0
    const custoUnit = Number((it as any).custo_unitario) || 0
    const custoTot = Number((qtd * custoUnit).toFixed(2))

    totalGeralValor += val
    totalGeralQtd += qtd

    const empId = ((it.expand as any)?.venda_id as any)?.empresa_id || '(sem empresa)'
    const eInfo = mapEmpresa.get(empId) || { valor: 0, qtd: 0 }
    eInfo.valor += val
    eInfo.qtd += qtd
    mapEmpresa.set(empId, eInfo)

    const prodExp = (it.expand as any)?.produto_id
    const codigo = prodExp?.codigo || ''
    const desc = (it as any).descricao || prodExp?.descricao || 'Produto'
    const un = (it as any).unidade || prodExp?.unidade || 'UN'

    const atual = mapaProdutos.get(prodId) || {
      id: prodId,
      codigo: String(codigo),
      descricao: desc,
      unidade: un,
      qtd: 0,
      valor: 0,
      custo: 0,
    }

    atual.qtd += qtd
    atual.valor += val
    atual.custo += custoTot
    mapaProdutos.set(prodId, atual)
  }

  // Ordenar conforme critério (valor ou quantidade)
  const itensLista = Array.from(mapaProdutos.values())
  if (criterio === 'quantidade') {
    itensLista.sort((a, b) => b.qtd - a.qtd)
  } else {
    itensLista.sort((a, b) => b.valor - a.valor)
  }

  // Calcular curva ABC
  // Curva A: até 80% do acumulado
  // Curva B: de 80% até 95% do acumulado
  // Curva C: de 95% a 100%
  const totalBase = criterio === 'quantidade' ? totalGeralQtd : totalGeralValor

  let acumulado = 0
  const resultadoItens: ItemCurvaAbcProduto[] = []

  for (const p of itensLista) {
    const valorBaseItem = criterio === 'quantidade' ? p.qtd : p.valor
    const pctSobreTotal = totalBase > 0 ? (valorBaseItem / totalBase) * 100 : 0
    acumulado += pctSobreTotal

    let classe: 'A' | 'B' | 'C' = 'C'
    if (acumulado <= 80.01) {
      classe = 'A'
    } else if (acumulado <= 95.01) {
      classe = 'B'
    } else {
      classe = 'C'
    }

    const margemValor = p.valor - p.custo
    const margemPct = p.valor > 0 ? (margemValor / p.valor) * 100 : 0
    const precoMedio = p.qtd > 0 ? p.valor / p.qtd : 0
    const custoMedio = p.qtd > 0 ? p.custo / p.qtd : 0

    resultadoItens.push({
      produto_id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      unidade: p.unidade,
      quantidade_vendida: Number(p.qtd.toFixed(4)),
      valor_total: Number(p.valor.toFixed(2)),
      preco_medio_venda: Number(precoMedio.toFixed(2)),
      custo_medio_venda: Number(custoMedio.toFixed(2)),
      margem_bruta_valor: Number(margemValor.toFixed(2)),
      margem_bruta_percentual: Number(margemPct.toFixed(1)),
      percentual_sobre_total: Number(pctSobreTotal.toFixed(2)),
      percentual_acumulado: Number(Math.min(100, acumulado).toFixed(2)),
      classe_abc: classe,
    })
  }

  const totaisPorEmpresa: TotaisPorEmpresaVendas[] = Array.from(mapEmpresa.entries())
    .map(([empresa_id, e]) => ({
      empresa_id,
      valor_total: Number(e.valor.toFixed(2)),
      quantidade_vendas: e.qtd,
      valor_devolucoes: 0,
      valor_liquido: Number(e.valor.toFixed(2)),
    }))
    .sort((a, b) => b.valor_total - a.valor_total)

  return {
    criterio,
    total_geral_valor: Number(totalGeralValor.toFixed(2)),
    total_geral_quantidade: Number(totalGeralQtd.toFixed(4)),
    itens: resultadoItens,
    totais_por_empresa: totaisPorEmpresa,
  }
}

/**
 * Consulta de margem de lucro por venda e por produto
 */
export async function consultarMargemVendas(params: {
  empresa_ids?: string[]
  empresa_id?: string
  data_inicio: string
  data_fim: string
}): Promise<MargemVendaItem[]> {
  const { data_inicio, data_fim } = params
  const empresas = normalizarEmpresasIds(params)
  const filtroEmpresa = filtroEmpresas(empresas)

  const vendas = await pb.collection('vendas').getFullList({
    filter: `${filtroEmpresa} && ativo = true && status = 'Finalizada' && tipo != 'Devolução' && data_emissao >= '${data_inicio}' && data_emissao <= '${data_fim}'`,
    sort: '-data_emissao,-numero',
    expand: 'cliente_id,vendedor_id',
  })

  return vendas.map((v) => {
    const valVenda = Number((v as any).valor_total) || 0
    const custoTot = Number((v as any).custo_total) || 0
    const margemVal = valVenda - custoTot
    const margemPct = valVenda > 0 ? (margemVal / valVenda) * 100 : 0

    const cExp = (v.expand as any)?.cliente_id
    const cNome =
      cExp?.nome_razao_social || cExp?.nome || (v as any).cpf_cnpj_consumidor || 'Consumidor'
    const vendExp = (v.expand as any)?.vendedor_id
    const vNome = vendExp?.name || vendExp?.email || 'Vendedor'

    return {
      venda_id: v.id,
      numero: Number((v as any).numero) || 0,
      data_emissao: (v as any).data_emissao || (v.created ? v.created.slice(0, 10) : ''),
      tipo: (v as any).tipo || 'Pedido',
      empresa_id: (v as any).empresa_id || '(sem empresa)',
      cliente_nome: cNome,
      vendedor_nome: vNome,
      valor_venda: Number(valVenda.toFixed(2)),
      custo_total: Number(custoTot.toFixed(2)),
      margem_lucro_valor: Number(margemVal.toFixed(2)),
      margem_lucro_percentual: Number(margemPct.toFixed(1)),
    }
  })
}

/**
 * Exportador CSV genérico para consultas de vendas
 */
export function exportarConsultaCsv(
  cabecalhos: string[],
  linhasDados: (string | number)[][],
): string {
  const formatarCelula = (c: string | number) => {
    if (typeof c === 'number') {
      return c.toFixed(2).replace('.', ',')
    }
    return `"${String(c).replace(/"/g, '""')}"`
  }

  const out: string[] = []
  out.push(cabecalhos.map((h) => `"${h}"`).join(';'))
  for (const row of linhasDados) {
    out.push(row.map(formatarCelula).join(';'))
  }

  return out.join('\r\n')
}
