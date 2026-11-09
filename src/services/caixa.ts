import pb from '@/lib/pocketbase/client'
import type { Terminal } from '@/services/terminais'

export interface TotalPorForma {
  forma_id: string
  forma_descricao: string
  codigo_tpag?: string
  tipo?: string
  quantidade_vendas: number
  valor_esperado: number
  valor_informado: number
  diferenca: number
}

export interface CaixaSessao {
  id: string
  empresa_id: string
  pdv_terminal_id: string
  operador_id: string
  status: 'Aberto' | 'Fechado'
  data_abertura: string
  valor_abertura: number
  data_fechamento?: string
  valor_esperado_dinheiro?: number
  valor_contado_dinheiro?: number
  diferenca_dinheiro?: number
  totais_por_forma?: TotalPorForma[] | string
  quantidade_vendas?: number
  valor_vendas?: number
  valor_cancelado?: number
  valor_sangrias?: number
  valor_suprimentos?: number
  observacao_fechamento?: string
  conferido_por_id?: string
  data_conferencia?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    empresa_id?: { id: string; nome_fantasia?: string; razao_social?: string }
    pdv_terminal_id?: Terminal
    operador_id?: { id: string; nome: string; email: string; e_caixa?: boolean }
    conferido_por_id?: { id: string; nome: string; email: string }
  }
}

export interface CaixaSessaoMovimento {
  id: string
  empresa_id: string
  caixa_sessao_id: string
  tipo: 'Sangria' | 'Suprimento' | 'Fundo_Inicial' | 'Ajuste_Falta' | 'Ajuste_Sobra'
  valor: number
  motivo: string
  movimentacao_financeira_id?: string
  transferencia_id?: string
  operador_id?: string
  data_hora: string
  ativo: boolean
  created?: string
  expand?: {
    operador_id?: { id: string; nome: string }
  }
}

export interface AbrirCaixaPayload {
  empresa_id: string
  pdv_terminal_id: string
  valor_abertura: number
  realizar_suprimento?: boolean
}

export interface SangriaPayload {
  caixa_sessao_id: string
  valor: number
  motivo: string
}

export interface SuprimentoPayload {
  caixa_sessao_id: string
  valor: number
  motivo: string
}

export interface FecharCaixaPayload {
  caixa_sessao_id: string
  valor_contado_dinheiro: number
  totais_informados_formas: Array<{ forma_id: string; valor_informado: number }>
  observacao_fechamento?: string
}

export interface ConferirCaixaPayload {
  caixa_sessao_id: string
  observacao_conferencia?: string
}

export interface SangriaResultado {
  movimento_id: string
  transferencia_id: string
  valor: number
  motivo: string
  data_hora: string
  operador_nome: string
  terminal_nome: string
  novo_saldo_caixa: number
}

export interface SuprimentoResultado {
  movimento_id: string
  transferencia_id: string
  valor: number
  motivo: string
  data_hora: string
  operador_nome: string
  terminal_nome: string
  novo_saldo_caixa: number
}

/**
 * Chamadas para os endpoints transacionais de caixa
 */
export async function abrirSessaoCaixa(payload: AbrirCaixaPayload): Promise<CaixaSessao> {
  const json = await pb.send<{ success: boolean; message?: string; sessao?: CaixaSessao }>(
    '/backend/v1/caixa/abrir',
    {
      method: 'POST',
      body: payload,
    },
  )

  if (!json?.success || !json.sessao) {
    throw new Error(json?.message || 'Falha ao abrir sessão de caixa.')
  }
  return json.sessao
}

export async function realizarSangriaCaixa(payload: SangriaPayload): Promise<SangriaResultado> {
  const json = await pb.send<{ success: boolean; message?: string; sangria?: SangriaResultado }>(
    '/backend/v1/caixa/sangria',
    {
      method: 'POST',
      body: payload,
    },
  )

  if (!json?.success || !json.sangria) {
    throw new Error(json?.message || 'Falha ao registrar sangria de caixa.')
  }
  return json.sangria
}

export async function realizarSuprimentoCaixa(
  payload: SuprimentoPayload,
): Promise<SuprimentoResultado> {
  const json = await pb.send<{
    success: boolean
    message?: string
    suprimento?: SuprimentoResultado
  }>('/backend/v1/caixa/suprimento', {
    method: 'POST',
    body: payload,
  })

  if (!json?.success || !json.suprimento) {
    throw new Error(json?.message || 'Falha ao registrar suprimento de caixa.')
  }
  return json.suprimento
}

export async function fecharSessaoCaixa(payload: FecharCaixaPayload): Promise<CaixaSessao> {
  const json = await pb.send<{ success: boolean; message?: string; sessao?: CaixaSessao }>(
    '/backend/v1/caixa/fechar',
    {
      method: 'POST',
      body: payload,
    },
  )

  if (!json?.success || !json.sessao) {
    throw new Error(json?.message || 'Falha ao fechar sessão de caixa.')
  }
  return json.sessao
}

export async function conferirSessaoCaixa(payload: ConferirCaixaPayload): Promise<CaixaSessao> {
  const json = await pb.send<{ success: boolean; message?: string; sessao?: CaixaSessao }>(
    '/backend/v1/caixa/conferir',
    {
      method: 'POST',
      body: payload,
    },
  )

  if (!json?.success || !json.sessao) {
    throw new Error(json?.message || 'Falha ao conferir sessão de caixa.')
  }
  return json.sessao
}

/**
 * Consultas de Sessões e Movimentos de Caixa
 */
export interface FiltrosCaixaSessoes {
  empresaId: string
  terminalId?: string
  operadorId?: string
  status?: 'Aberto' | 'Fechado' | ''
  dataInicio?: string
  dataFim?: string
}

export async function listarSessoesCaixa(
  filtros: FiltrosCaixaSessoes,
  page = 1,
  perPage = 50,
): Promise<{ items: CaixaSessao[]; totalItems: number; totalPages: number }> {
  const filterParts: string[] = [`empresa_id = '${filtros.empresaId}'`, 'ativo = true']

  if (filtros.terminalId) {
    filterParts.push(`pdv_terminal_id = '${filtros.terminalId}'`)
  }
  if (filtros.operadorId) {
    filterParts.push(`operador_id = '${filtros.operadorId}'`)
  }
  if (filtros.status) {
    filterParts.push(`status = '${filtros.status}'`)
  }
  if (filtros.dataInicio) {
    filterParts.push(`data_abertura >= '${filtros.dataInicio} 00:00:00'`)
  }
  if (filtros.dataFim) {
    filterParts.push(`data_abertura <= '${filtros.dataFim} 23:59:59'`)
  }

  const result = await pb.collection('caixa_sessoes').getList<CaixaSessao>(page, perPage, {
    filter: filterParts.join(' && '),
    sort: '-data_abertura',
    expand: 'pdv_terminal_id,operador_id,conferido_por_id,empresa_id',
  })

  return {
    items: result.items,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  }
}

export async function obterSessaoPorId(id: string): Promise<CaixaSessao> {
  return await pb.collection('caixa_sessoes').getOne<CaixaSessao>(id, {
    expand: 'pdv_terminal_id,operador_id,conferido_por_id,empresa_id',
  })
}

export async function obterSessaoAbertaOperador(
  empresaId: string,
  operadorId: string,
): Promise<CaixaSessao | null> {
  try {
    const list = await pb.collection('caixa_sessoes').getList<CaixaSessao>(1, 1, {
      filter: `empresa_id = '${empresaId}' && operador_id = '${operadorId}' && status = 'Aberto' && ativo = true`,
      expand: 'pdv_terminal_id,operador_id',
    })
    return list.items[0] || null
  } catch {
    return null
  }
}

export async function listarMovimentosSessao(
  caixaSessaoId: string,
): Promise<CaixaSessaoMovimento[]> {
  try {
    const list = await pb.collection('caixa_sessoes_movimentos').getFullList<CaixaSessaoMovimento>({
      filter: `caixa_sessao_id = '${caixaSessaoId}' && ativo = true`,
      sort: 'data_hora',
      expand: 'operador_id',
    })
    return list
  } catch {
    return []
  }
}

/**
 * Apuração em tempo real dos números da sessão (usado no fechamento antes de enviar)
 */
export interface ResumoApuracaoFechamento {
  fundo_inicial: number
  total_suprimentos: number
  total_sangrias: number
  total_vendas: number
  quantidade_vendas: number
  total_cancelado: number
  total_dinheiro_vendas: number
  esperado_dinheiro: number
  formas: Array<{
    forma_id: string
    forma_descricao: string
    codigo_tpag?: string
    tipo?: string
    quantidade_vendas: number
    valor_esperado: number
  }>
}

/**
 * Apuração em TEMPO REAL da sessão, reutilizando o endpoint backend
 * (/backend/v1/caixa/resumo, em pocketbase/hooks/caixa_resumo.js) para não
 * duplicar a regra. Em caso de falha da rota, cai na apuração local.
 */
export async function apurarSessaoTempoReal(
  sessaoId: string,
  fundoInicialFallback = 0,
): Promise<ResumoApuracaoFechamento> {
  try {
    const json = await pb.send<{
      success: boolean
      message?: string
      resumo?: ResumoApuracaoFechamento
    }>('/backend/v1/caixa/resumo', {
      method: 'POST',
      body: { caixa_sessao_id: sessaoId },
    })
    if (json?.success && json.resumo) {
      return json.resumo
    }
    throw new Error(json?.message || 'Falha ao apurar resumo da sessão.')
  } catch {
    // Fallback: apuração local (mesma regra do endpoint)
    return apurarDadosFechamento(sessaoId, fundoInicialFallback)
  }
}

/**
 * Apuração AGRUPADA (uma única consulta) das vendas finalizadas por sessão,
 * usada na lista de sessões: enquanto a sessão está aberta, os campos
 * gravados (valor_vendas/quantidade_vendas) ainda são 0 — conta-se então
 * pelas vendas com caixa_sessao_id.
 */
export interface VendasApuradasPorSessao {
  quantidade: number
  valor_total: number
}

export async function apurarVendasSessoes(
  sessaoIds: string[],
): Promise<Record<string, VendasApuradasPorSessao>> {
  const mapa: Record<string, VendasApuradasPorSessao> = {}
  const validos = sessaoIds.filter(Boolean)
  if (validos.length === 0) return mapa
  for (const id of validos) {
    mapa[id] = { quantidade: 0, valor_total: 0 }
  }
  try {
    const filtro = `(${validos
      .map((id) => `caixa_sessao_id = '${id}'`)
      .join(' || ')}) && ativo = true && status = 'Finalizada'`
    const vendas = await pb.collection('vendas').getFullList<{
      id: string
      caixa_sessao_id: string
      valor_total: number
    }>({
      filter: filtro,
    })
    for (const v of vendas) {
      const entry = mapa[v.caixa_sessao_id]
      if (entry) {
        entry.quantidade++
        entry.valor_total += Number(v.valor_total || 0)
      }
    }
  } catch {
    // silencioso: a lista mostra os valores gravados
  }
  return mapa
}

export async function apurarDadosFechamento(
  sessaoId: string,
  fundoInicial: number,
): Promise<ResumoApuracaoFechamento> {
  // 1. Movimentos de sangria e suprimento
  const movs = await listarMovimentosSessao(sessaoId)
  let totalSangrias = 0
  let totalSuprimentos = 0
  for (const m of movs) {
    if (m.tipo === 'Sangria') totalSangrias += Number(m.valor || 0)
    else if (m.tipo === 'Suprimento') totalSuprimentos += Number(m.valor || 0)
  }

  // 2. Vendas da sessão
  const vendas = await pb.collection('vendas').getFullList<{
    id: string
    status: string
    valor_total: number
  }>({
    filter: `caixa_sessao_id = '${sessaoId}' && ativo = true`,
  })

  let qtdVendas = 0
  let totalVendas = 0
  let totalCancelado = 0
  const idsFinalizadas: string[] = []

  for (const v of vendas) {
    if (v.status === 'Finalizada') {
      qtdVendas++
      totalVendas += Number(v.valor_total || 0)
      idsFinalizadas.push(v.id)
    } else if (v.status === 'Cancelada') {
      totalCancelado += Number(v.valor_total || 0)
    }
  }

  // 3. Pagamentos das vendas finalizadas
  const formasCadastradas = await pb.collection('formas_pagamento').getFullList<{
    id: string
    descricao: string
    codigo_tpag?: string
    tipo?: string
  }>({
    filter: 'ativo = true',
    sort: 'descricao',
  })

  const formasMap = new Map<
    string,
    {
      forma_id: string
      forma_descricao: string
      codigo_tpag?: string
      tipo?: string
      quantidade_vendas: number
      valor_esperado: number
    }
  >()

  for (const fc of formasCadastradas) {
    formasMap.set(fc.id, {
      forma_id: fc.id,
      forma_descricao: fc.descricao,
      codigo_tpag: fc.codigo_tpag,
      tipo: fc.tipo,
      quantidade_vendas: 0,
      valor_esperado: 0,
    })
  }

  let totalDinheiroVendas = 0

  if (idsFinalizadas.length > 0) {
    // Troco por venda: prioriza o campo troco do pagamento; se vier zerado
    // (gravações antigas, ex. venda #7 da sessão #O4LYX7), usa o valor_troco
    // do cabeçalho da venda para não somar o bruto recebido.
    const trocoPorVenda = new Map<string, number>()
    try {
      const vendasComTroco = await pb.collection('vendas').getFullList<{
        id: string
        valor_troco?: number
      }>({
        filter: `(${idsFinalizadas.map((id) => `id = '${id}'`).join(' || ')}) && valor_troco > 0`,
      })
      for (const v of vendasComTroco) {
        trocoPorVenda.set(v.id, Number(v.valor_troco || 0))
      }
    } catch {
      // sem fallback de troco por venda, segue só com o troco do pagamento
    }

    // Buscar em lotes se necessário
    const filterIds = idsFinalizadas.map((id) => `venda_id = '${id}'`).join(' || ')
    const pagamentos = await pb.collection('vendas_pagamentos').getFullList<{
      venda_id: string
      forma_pagamento_id: string
      valor: number
      troco?: number
    }>({
      filter: `(${filterIds}) && ativo = true`,
    })

    for (const p of pagamentos) {
      const vBruto = Number(p.valor || 0)
      const vTrocoPg = Number(p.troco || 0)
      // pagamento com troco próprio gravado vence; senão cai no troco da venda
      const vTroco =
        vTrocoPg > 0
          ? vTrocoPg
          : (trocoPorVenda.get(p.venda_id) || 0) > 0
            ? Math.min(trocoPorVenda.get(p.venda_id) || 0, vBruto)
            : 0
      const vLiquido = Math.max(0, vBruto - vTroco)
      const entry = formasMap.get(p.forma_pagamento_id)
      if (entry) {
        entry.quantidade_vendas++
        entry.valor_esperado = Number((entry.valor_esperado + vLiquido).toFixed(2))
        if (
          entry.tipo === 'Dinheiro' ||
          entry.codigo_tpag === '01' ||
          entry.forma_descricao.toLowerCase().includes('dinheiro')
        ) {
          totalDinheiroVendas += vLiquido
        }
      }
    }
  }

  const esperadoDinheiro = Number(
    (fundoInicial + totalSuprimentos + totalDinheiroVendas - totalSangrias).toFixed(2),
  )

  const formasLista = Array.from(formasMap.values()).filter(
    (f) =>
      f.quantidade_vendas > 0 ||
      f.valor_esperado > 0 ||
      f.tipo === 'Dinheiro' ||
      f.codigo_tpag === '01' ||
      f.forma_descricao.toLowerCase().includes('dinheiro'),
  )

  return {
    fundo_inicial: fundoInicial,
    total_suprimentos: Number(totalSuprimentos.toFixed(2)),
    total_sangrias: Number(totalSangrias.toFixed(2)),
    total_vendas: Number(totalVendas.toFixed(2)),
    quantidade_vendas: qtdVendas,
    total_cancelado: Number(totalCancelado.toFixed(2)),
    total_dinheiro_vendas: Number(totalDinheiroVendas.toFixed(2)),
    esperado_dinheiro: esperadoDinheiro,
    formas: formasLista,
  }
}
