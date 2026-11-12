import pb from '@/lib/pocketbase/client'
import { EstoqueMovimento } from '@/services/estoque'
import { montarFiltroEmpresas } from '@/services/filtroMultiempresa'

/**
 * Serviço do Kardex multiempresa (9.8 / multiempresa v0.0.313)
 *
 * O saldo é por produto E por empresa: nunca misturar saldos de lojas
 * diferentes na mesma coluna. Este serviço devolve UMA SEÇÃO POR EMPRESA
 * (saldo por produto, movimentos e saldo final) e um consolidado
 * (soma das empresas) para o painel "Totais por Empresa" e para o modo
 * "Ver só o total consolidado".
 *
 * Filtro multiempresa usa o helper comum filtroMultiempresa.ts:
 * (empresa_id = 'id1' || empresa_id = 'id2' || ...), sempre dentro do
 * assinante do usuário (as API rules da coleção garantem o tenancy).
 */

export interface SaldoKardex {
  quantidade: number
  custo_medio: number
  valor_total: number
}

export interface TotaisPeriodoKardex {
  entradasQtd: number
  saidasQtd: number
  entradasValor: number
  saidasValor: number
}

/** Linha de saldo por produto (dentro de uma empresa ou no consolidado) */
export interface KardexProdutoLinha {
  produtoId: string
  produtoCodigo: string
  produtoNome: string
  saldoInicial: SaldoKardex
  saldoFinal: SaldoKardex
  entradasQtd: number
  saidasQtd: number
  entradasValor: number
  saidasValor: number
}

/** Linha de movimento já resolvida (produto, lote e operador expandidos) */
export interface KardexLinha {
  id: string
  empresa_id: string
  produto_id: string
  produto_nome: string
  produto_codigo: string
  data_movimento: string
  tipo: string
  origem: string
  quantidade: number
  custo_unitario: number
  valor_total: number
  saldo_posterior: number
  custo_medio_posterior: number
  documento_tipo?: string
  documento_numero?: string
  numero_lote?: string
  usuario_nome?: string
  motivo?: string
  observacao?: string
  estornado?: boolean
  movimento_estorno_id?: string
}

/** Bloco do Kardex de UMA empresa */
export interface KardexEmpresaSecao {
  empresaId: string
  produtos: KardexProdutoLinha[]
  movimentos: KardexLinha[]
  saldoInicial: SaldoKardex
  saldoFinal: SaldoKardex
  totaisPeriodo: TotaisPeriodoKardex
}

export interface KardexResposta {
  secoes: KardexEmpresaSecao[]
  saldoInicialPorEmpresa: Record<string, SaldoKardex>
  saldoFinalPorEmpresa: Record<string, SaldoKardex>
  saldoInicialConsolidado: SaldoKardex
  saldoFinalConsolidado: SaldoKardex
  totaisConsolidados: TotaisPeriodoKardex
  consolidadoProdutos: KardexProdutoLinha[]
}

export const SALDO_ZERO: SaldoKardex = { quantidade: 0, custo_medio: 0, valor_total: 0 }
export const TOTAIS_ZERO: TotaisPeriodoKardex = {
  entradasQtd: 0,
  saidasQtd: 0,
  entradasValor: 0,
  saidasValor: 0,
}

function somarSaldos(a: SaldoKardex, b: SaldoKardex): SaldoKardex {
  const quantidade = a.quantidade + b.quantidade
  const valorTotal = a.valor_total + b.valor_total
  const custoMedio = quantidade > 0 ? valorTotal / quantidade : 0
  return {
    quantidade,
    custo_medio: Math.round(custoMedio * 100) / 100,
    valor_total: Math.round(valorTotal * 100) / 100,
  }
}

function valorizado(quantidade: number, custo: number): SaldoKardex {
  return {
    quantidade,
    custo_medio: custo,
    valor_total: Math.round(quantidade * custo * 100) / 100,
  }
}

/** Totais do período de um conjunto de movimentos (estornados não somam no fluxo) */
function computarTotais(movs: KardexLinha[]): TotaisPeriodoKardex {
  const t: TotaisPeriodoKardex = { ...TOTAIS_ZERO }
  for (const m of movs) {
    if (m.estornado) continue
    if (m.tipo === 'Entrada') {
      t.entradasQtd += m.quantidade
      t.entradasValor += m.valor_total
    } else {
      t.saidasQtd += m.quantidade
      t.saidasValor += m.valor_total
    }
  }
  return t
}

function respostaVazia(): KardexResposta {
  return {
    secoes: [],
    saldoInicialPorEmpresa: {},
    saldoFinalPorEmpresa: {},
    saldoInicialConsolidado: SALDO_ZERO,
    saldoFinalConsolidado: SALDO_ZERO,
    totaisConsolidados: TOTAIS_ZERO,
    consolidadoProdutos: [],
  }
}

function resolverLinha(m: EstoqueMovimento): KardexLinha {
  const prod: any = (m.expand as any)?.produto_id
  const lote: any = (m.expand as any)?.lote_id
  const usuario: any = (m.expand as any)?.usuario_id
  return {
    id: m.id,
    empresa_id: m.empresa_id,
    produto_id: m.produto_id,
    produto_nome: prod?.descricao || '(produto)',
    produto_codigo: prod?.codigo !== undefined && prod?.codigo !== null ? String(prod.codigo) : '',
    data_movimento: m.data_movimento,
    tipo: m.tipo,
    origem: m.origem,
    quantidade: m.quantidade || 0,
    custo_unitario: m.custo_unitario || 0,
    valor_total: m.valor_total || 0,
    saldo_posterior: m.saldo_posterior ?? 0,
    custo_medio_posterior: m.custo_medio_posterior ?? m.custo_unitario ?? 0,
    documento_tipo: m.documento_tipo,
    documento_numero: m.documento_numero,
    numero_lote: lote?.numero_lote || m.lote_id || undefined,
    usuario_nome: usuario?.name || undefined,
    motivo: m.motivo,
    observacao: m.observacao,
    estornado: m.estornado === true,
    movimento_estorno_id: m.movimento_estorno_id,
  }
}

export interface ParametrosKardex {
  empresaIds: string[]
  produtoIds?: string[]
  dataInicio: string
  dataFim: string
}

/**
 * Carrega o Kardex de TODAS as empresas marcadas:
 * 1. movimentos do período (filtro OR de empresas);
 * 2. último movimento ANTES do período por (empresa, produto) — saldo inicial;
 * 3. monta uma seção por empresa e o consolidado (soma das empresas).
 */
export async function consultarKardexMultiempresa(
  params: ParametrosKardex,
): Promise<KardexResposta> {
  const ids = (params.empresaIds || []).filter(Boolean)
  if (ids.length === 0 || !params.dataInicio || !params.dataFim) return respostaVazia()

  const produtoIds = (params.produtoIds || []).filter(Boolean)
  const filtroEmpresas = montarFiltroEmpresas(ids)
  const filtroProdutos = produtoIds.length ? montarFiltroEmpresas(produtoIds, 'produto_id') : ''

  // 1. Movimentos do período (sem filtro de tipo/origem: posição é da data, o
  //    corte por tipo/origem é visual e fica na página)
  const condsPeriodo = [
    filtroEmpresas,
    `data_movimento >= '${params.dataInicio}T00:00:00.000Z'`,
    `data_movimento <= '${params.dataFim}T23:59:59.999Z'`,
  ]
  if (filtroProdutos) condsPeriodo.push(filtroProdutos)

  // 2. Saldo inicial: último movimento por (empresa, produto) antes do período
  const condsAntes = [filtroEmpresas, `data_movimento < '${params.dataInicio}T00:00:00.000Z'`]
  if (filtroProdutos) condsAntes.push(filtroProdutos)

  const [movPeriodo, movAntes] = await Promise.all([
    pb.collection('estoque_movimentos').getFullList<EstoqueMovimento>({
      filter: condsPeriodo.join(' && '),
      sort: 'data_movimento,created',
      expand: 'produto_id,lote_id,usuario_id',
      requestKey: null,
    }),
    pb.collection('estoque_movimentos').getFullList<EstoqueMovimento>({
      filter: condsAntes.join(' && '),
      sort: '-data_movimento,-created',
      fields:
        'id,empresa_id,produto_id,saldo_posterior,custo_medio_posterior,custo_unitario,expand.produto_id.descricao,expand.produto_id.codigo',
      expand: 'produto_id',
      requestKey: null,
    }),
  ])

  // Último saldo por (empresa, produto) antes do período — lista vem desc, o 1º de cada chave é o mais recente
  const saldoInicialMap = new Map<string, SaldoKardex>()
  for (const m of movAntes) {
    const chave = `${m.empresa_id}:${m.produto_id}`
    if (saldoInicialMap.has(chave)) continue
    const qtd = m.saldo_posterior ?? 0
    const custo = m.custo_medio_posterior ?? m.custo_unitario ?? 0
    saldoInicialMap.set(chave, valorizado(qtd, custo))
  }

  // 3. Agrupa movimentos por empresa (saldos nunca se cruzam entre lojas)
  const movsPorEmpresa = new Map<string, KardexLinha[]>()
  for (const m of movPeriodo) {
    const linha = resolverLinha(m)
    const lista = movsPorEmpresa.get(linha.empresa_id)
    if (lista) lista.push(linha)
    else movsPorEmpresa.set(linha.empresa_id, [linha])
  }

  // Defensivo: empresas fora do filtro (não deveria ocorrer — API rules)
  const ordemEmpresas = [...ids]
  for (const eid of movsPorEmpresa.keys()) {
    if (!ordemEmpresas.includes(eid)) ordemEmpresas.push(eid)
  }

  const secoes: KardexEmpresaSecao[] = []
  const saldoInicialPorEmpresa: Record<string, SaldoKardex> = {}
  const saldoFinalPorEmpresa: Record<string, SaldoKardex> = {}
  const consolidadoMap = new Map<string, KardexProdutoLinha>()

  for (const eid of ordemEmpresas) {
    const movs = movsPorEmpresa.get(eid) || []

    // Produtos da seção = com saldo antes do período OU com movimento no período
    const produtosIdsSecao = new Set<string>()
    for (const m of movs) produtosIdsSecao.add(m.produto_id)
    for (const chave of saldoInicialMap.keys()) {
      const [emp, prod] = chave.split(':')
      if (emp === eid) produtosIdsSecao.add(prod)
    }

    const produtos: KardexProdutoLinha[] = []
    let saldoInicialSecao = SALDO_ZERO
    let saldoFinalSecao = SALDO_ZERO

    for (const pid of produtosIdsSecao) {
      const movsProduto = movs.filter((m) => m.produto_id === pid)
      const saldoInicial = saldoInicialMap.get(`${eid}:${pid}`) || SALDO_ZERO
      let saldoFinal = saldoInicial
      if (movsProduto.length > 0) {
        const ultimo = movsProduto[movsProduto.length - 1]
        saldoFinal = valorizado(ultimo.saldo_posterior, ultimo.custo_medio_posterior)
      }
      const totais = computarTotais(movsProduto)
      const referencia = movsProduto[0]
      const linha: KardexProdutoLinha = {
        produtoId: pid,
        produtoCodigo: referencia?.produto_codigo || '',
        produtoNome: referencia?.produto_nome || '(produto)',
        saldoInicial,
        saldoFinal,
        entradasQtd: totais.entradasQtd,
        saidasQtd: totais.saidasQtd,
        entradasValor: totais.entradasValor,
        saidasValor: totais.saidasValor,
      }
      produtos.push(linha)
      saldoInicialSecao = somarSaldos(saldoInicialSecao, saldoInicial)
      saldoFinalSecao = somarSaldos(saldoFinalSecao, saldoFinal)

      // Consolidado entre empresas (somando saldos, custo médio ponderado)
      const atual = consolidadoMap.get(pid)
      if (atual) {
        atual.saldoInicial = somarSaldos(atual.saldoInicial, saldoInicial)
        atual.saldoFinal = somarSaldos(atual.saldoFinal, saldoFinal)
        atual.entradasQtd += totais.entradasQtd
        atual.saidasQtd += totais.saidasQtd
        atual.entradasValor += totais.entradasValor
        atual.saidasValor += totais.saidasValor
      } else {
        consolidadoMap.set(pid, { ...linha })
      }
    }

    produtos.sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, 'pt-BR'))

    secoes.push({
      empresaId: eid,
      produtos,
      movimentos: movs,
      saldoInicial: saldoInicialSecao,
      saldoFinal: saldoFinalSecao,
      totaisPeriodo: computarTotais(movs),
    })
    saldoInicialPorEmpresa[eid] = saldoInicialSecao
    saldoFinalPorEmpresa[eid] = saldoFinalSecao
  }

  const consolidadoProdutos = Array.from(consolidadoMap.values()).sort((a, b) =>
    a.produtoNome.localeCompare(b.produtoNome, 'pt-BR'),
  )

  const totaisConsolidados = secoes.reduce(
    (acc, s) => ({
      entradasQtd: acc.entradasQtd + s.totaisPeriodo.entradasQtd,
      saidasQtd: acc.saidasQtd + s.totaisPeriodo.saidasQtd,
      entradasValor: acc.entradasValor + s.totaisPeriodo.entradasValor,
      saidasValor: acc.saidasValor + s.totaisPeriodo.saidasValor,
    }),
    TOTAIS_ZERO,
  )

  return {
    secoes,
    saldoInicialPorEmpresa,
    saldoFinalPorEmpresa,
    saldoInicialConsolidado: secoes.reduce(
      (acc, s) => somarSaldos(acc, s.saldoInicial),
      SALDO_ZERO,
    ),
    saldoFinalConsolidado: secoes.reduce((acc, s) => somarSaldos(acc, s.saldoFinal), SALDO_ZERO),
    totaisConsolidados,
    consolidadoProdutos,
  }
}
