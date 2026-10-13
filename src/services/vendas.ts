import pb from '@/lib/pocketbase/client'

// ============================================================================
// TIPOS DAS 3 TABELAS CENTRAIS DE VENDAS
// ============================================================================

export type TipoVenda = 'Venda' | 'PDV' | 'Orcamento' | 'Condicional' | 'Devolucao'
export type StatusVenda = 'Rascunho' | 'Finalizada' | 'Cancelada'
export type DocumentoFiscalModelo = '55' | '65' | 'Nenhum'
export type DocumentoFiscalStatus =
  | 'Pendente'
  | 'Emitida'
  | 'Autorizada'
  | 'Cancelada'
  | 'Rejeitada'

export interface Venda {
  id: string
  empresa_id: string
  numero: number
  tipo: TipoVenda
  status: StatusVenda
  cliente_id?: string
  usuario_id?: string
  caixa_sessao_id?: string
  pdv_terminal_id?: string
  condicao_pagamento_id?: string
  tabela_preco_id?: string
  data_venda: string
  data_finalizacao?: string
  data_cancelamento?: string
  motivo_cancelamento?: string
  usuario_cancelamento_id?: string
  valor_produtos: number
  valor_frete: number
  valor_seguro: number
  valor_outras_despesas: number
  desconto_percentual: number
  desconto_valor: number
  acrescimo_valor: number
  valor_total: number
  valor_troco: number
  custo_total: number
  documento_fiscal_modelo: DocumentoFiscalModelo
  documento_fiscal_status: DocumentoFiscalStatus
  documento_fiscal_chave?: string
  documento_fiscal_numero?: number
  documento_fiscal_serie?: number
  observacoes?: string
  observacoes_internas?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    empresa_id?: { id: string; razao_social?: string; nome_fantasia?: string }
    cliente_id?: { id: string; nome: string; cpf_cnpj?: string; telefone?: string }
    usuario_id?: { id: string; nome: string; email?: string }
    condicao_pagamento_id?: { id: string; nome: string }
    pdv_terminal_id?: { id: string; nome: string }
  }
}

export interface VendaItem {
  id: string
  venda_id: string
  sequencial: number
  produto_id: string
  unidade_medida?: string
  quantidade: number
  preco_tabela: number
  preco_unitario: number
  desconto_percentual: number
  desconto_valor: number
  acrescimo_valor: number
  subtotal: number
  valor_total: number
  custo_unitario: number
  custo_total: number
  cfop?: string
  ncm?: string
  cest?: string
  origem?: string
  cst_icms?: string
  csosn?: string
  aliquota_icms?: number
  cst_pis?: string
  aliquota_pis?: number
  cst_cofins?: string
  aliquota_cofins?: number
  lote_id?: string
  numero_serie?: string
  observacao?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    produto_id?: {
      id: string
      codigo?: number
      descricao: string
      gtin?: string
      preco_venda?: number
    }
    lote_id?: { id: string; numero_lote: string; data_validade?: string }
  }
}

export interface VendaPagamento {
  id: string
  venda_id: string
  forma_pagamento_id: string
  valor: number
  parcelas: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  taxa_percentual: number
  valor_taxa: number
  conta_financeira_id?: string
  conta_receber_ids?: string // JSON string array com IDs dos títulos em contas_receber
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    forma_pagamento_id?: { id: string; descricao: string; tipo: string; codigo_tpag?: string }
    conta_financeira_id?: { id: string; nome: string }
  }
}

// ============================================================================
// DTOs PARA ENTRADA E FILTROS
// ============================================================================

export interface CriarVendaInput {
  empresa_id: string
  tipo?: TipoVenda
  cliente_id?: string
  usuario_id?: string
  caixa_sessao_id?: string
  pdv_terminal_id?: string
  condicao_pagamento_id?: string
  data_venda?: string
  valor_frete?: number
  valor_seguro?: number
  valor_outras_despesas?: number
  desconto_percentual?: number
  desconto_valor?: number
  acrescimo_valor?: number
  observacoes?: string
  observacoes_internas?: string
  itens?: ItemVendaInput[]
}

export interface ItemVendaInput {
  id?: string
  sequencial?: number
  produto_id: string
  unidade_medida?: string
  quantidade: number
  preco_tabela?: number
  preco_unitario: number
  desconto_percentual?: number
  desconto_valor?: number
  acrescimo_valor?: number
  cfop?: string
  ncm?: string
  cest?: string
  origem?: string
  cst_icms?: string
  csosn?: string
  aliquota_icms?: number
  cst_pis?: string
  aliquota_pis?: number
  cst_cofins?: string
  aliquota_cofins?: number
  lote_id?: string
  numero_serie?: string
  observacao?: string
}

export interface PagamentoVendaInput {
  forma_pagamento_id: string
  valor: number
  parcelas?: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  conta_financeira_id?: string
  condicao_pagamento_id?: string
}

export interface FinalizarVendaInput {
  venda_id: string
  pagamentos: PagamentoVendaInput[]
}

export interface FinalizarVendaResponse {
  sucesso: boolean
  venda_id: string
  numero: number
  status: 'Finalizada'
  valor_total: number
  valor_troco: number
  custo_total: number
  pagamentos: string[]
  titulos_gerados: string[]
  message?: string
}

export interface CancelarVendaInput {
  venda_id: string
  motivo: string
}

export interface CancelarVendaResponse {
  sucesso: boolean
  venda_id: string
  numero: number
  status: 'Cancelada'
  motivo_cancelamento: string
  titulos_cancelados: number
  movimentos_estornados: number
  message?: string
}

export interface FiltrosVendas {
  empresa_id?: string
  status?: StatusVenda
  tipo?: TipoVenda
  cliente_id?: string
  usuario_id?: string
  data_inicio?: string
  data_fim?: string
  termo_busca?: string
  pagina?: number
  por_pagina?: number
}

export interface ListagemVendasPaginada {
  items: Venda[]
  totalItems: number
  page: number
  perPage: number
  totalPages: number
}

// ============================================================================
// FUNÇÕES DO SERVIÇO CENTRAL DE VENDAS
// ============================================================================

/**
 * Cria uma venda / rascunho com seus itens.
 * Calcula automaticamente o próximo número sequencial da empresa e os totais da venda.
 */
export async function criarVendaRascunho(input: CriarVendaInput): Promise<Venda> {
  if (!input.empresa_id) {
    throw new Error('Empresa é obrigatória para criar venda.')
  }

  // 1. Apurar próximo número sequencial da venda para a empresa
  let proximoNumero = 1
  try {
    const ultimas = await pb.collection('vendas').getList<Venda>(1, 1, {
      filter: `empresa_id = '${input.empresa_id}'`,
      sort: '-numero',
      requestKey: null,
    })
    if (ultimas.items.length > 0 && ultimas.items[0].numero) {
      proximoNumero = Number(ultimas.items[0].numero) + 1
    }
  } catch {
    /* intentionally ignored */
  }

  // 2. Calcular totais dos itens se fornecidos
  const itensInput = input.itens || []
  let totalProdutos = 0
  for (const it of itensInput) {
    const qtd = Number(it.quantidade) || 0
    const preco = Number(it.preco_unitario) || 0
    const desc = Number(it.desconto_valor) || 0
    const acresc = Number(it.acrescimo_valor) || 0
    const totItem = Math.max(0, qtd * preco - desc + acresc)
    totalProdutos += totItem
  }

  const frete = Number(input.valor_frete) || 0
  const seguro = Number(input.valor_seguro) || 0
  const outras = Number(input.valor_outras_despesas) || 0
  const descGlobal = Number(input.desconto_valor) || 0
  const acrescGlobal = Number(input.acrescimo_valor) || 0
  const valorTotal = Math.max(
    0,
    totalProdutos + frete + seguro + outras - descGlobal + acrescGlobal,
  )

  // 3. Criar registro na tabela vendas
  const dataVenda = input.data_venda || new Date().toISOString().slice(0, 10)
  const vendaData: Partial<Venda> = {
    empresa_id: input.empresa_id,
    numero: proximoNumero,
    tipo: input.tipo || 'Venda',
    status: 'Rascunho',
    cliente_id: input.cliente_id || '',
    usuario_id: input.usuario_id || pb.authStore.record?.id || '',
    caixa_sessao_id: input.caixa_sessao_id || '',
    pdv_terminal_id: input.pdv_terminal_id || '',
    condicao_pagamento_id: input.condicao_pagamento_id || '',
    data_venda: dataVenda,
    valor_produtos: totalProdutos,
    valor_frete: frete,
    valor_seguro: seguro,
    valor_outras_despesas: outras,
    desconto_percentual: Number(input.desconto_percentual) || 0,
    desconto_valor: descGlobal,
    acrescimo_valor: acrescGlobal,
    valor_total: valorTotal,
    valor_troco: 0,
    custo_total: 0,
    documento_fiscal_modelo: 'Nenhum',
    documento_fiscal_status: 'Pendente',
    observacoes: input.observacoes || '',
    observacoes_internas: input.observacoes_internas || '',
    ativo: true,
  }

  const novaVenda = await pb.collection('vendas').create<Venda>(vendaData, { requestKey: null })

  // 4. Gravar itens se houver
  if (itensInput.length > 0) {
    for (let i = 0; i < itensInput.length; i++) {
      const it = itensInput[i]
      const qtd = Number(it.quantidade) || 0
      const precoUnit = Number(it.preco_unitario) || 0
      const subtotal = qtd * precoUnit
      const descVal = Number(it.desconto_valor) || 0
      const acrescVal = Number(it.acrescimo_valor) || 0
      const vTot = Math.max(0, subtotal - descVal + acrescVal)

      const itemData: Partial<VendaItem> = {
        venda_id: novaVenda.id,
        sequencial: it.sequencial || i + 1,
        produto_id: it.produto_id,
        unidade_medida: it.unidade_medida || 'UN',
        quantidade: qtd,
        preco_tabela: Number(it.preco_tabela) || precoUnit,
        preco_unitario: precoUnit,
        desconto_percentual: Number(it.desconto_percentual) || 0,
        desconto_valor: descVal,
        acrescimo_valor: acrescVal,
        subtotal: subtotal,
        valor_total: vTot,
        custo_unitario: 0,
        custo_total: 0,
        cfop: it.cfop || '',
        ncm: it.ncm || '',
        cest: it.cest || '',
        origem: it.origem || '0',
        cst_icms: it.cst_icms || '',
        csosn: it.csosn || '',
        aliquota_icms: Number(it.aliquota_icms) || 0,
        cst_pis: it.cst_pis || '',
        aliquota_pis: Number(it.aliquota_pis) || 0,
        cst_cofins: it.cst_cofins || '',
        aliquota_cofins: Number(it.aliquota_cofins) || 0,
        lote_id: it.lote_id || '',
        numero_serie: it.numero_serie || '',
        observacao: it.observacao || '',
        ativo: true,
      }
      await pb.collection('vendas_itens').create<VendaItem>(itemData, { requestKey: null })
    }
  }

  return novaVenda
}

/**
 * Atualiza os itens de uma venda em status Rascunho e recalcula os totais da venda.
 */
export async function sincronizarItensVenda(
  vendaId: string,
  novosItens: ItemVendaInput[],
): Promise<Venda> {
  const venda = await pb.collection('vendas').getOne<Venda>(vendaId, { requestKey: null })
  if (venda.status !== 'Rascunho') {
    throw new Error('Apenas vendas em status Rascunho podem ter seus itens alterados diretamente.')
  }

  // Buscar itens existentes
  const itensExistentes = await pb.collection('vendas_itens').getFullList<VendaItem>({
    filter: `venda_id = '${vendaId}'`,
    requestKey: null,
  })

  // Excluir itens existentes
  for (const it of itensExistentes) {
    await pb.collection('vendas_itens').delete(it.id, { requestKey: null })
  }

  // Inserir novos itens e somar produtos
  let totalProdutos = 0
  for (let i = 0; i < novosItens.length; i++) {
    const it = novosItens[i]
    const qtd = Number(it.quantidade) || 0
    const precoUnit = Number(it.preco_unitario) || 0
    const subtotal = qtd * precoUnit
    const descVal = Number(it.desconto_valor) || 0
    const acrescVal = Number(it.acrescimo_valor) || 0
    const vTot = Math.max(0, subtotal - descVal + acrescVal)
    totalProdutos += vTot

    const itemData: Partial<VendaItem> = {
      venda_id: vendaId,
      sequencial: it.sequencial || i + 1,
      produto_id: it.produto_id,
      unidade_medida: it.unidade_medida || 'UN',
      quantidade: qtd,
      preco_tabela: Number(it.preco_tabela) || precoUnit,
      preco_unitario: precoUnit,
      desconto_percentual: Number(it.desconto_percentual) || 0,
      desconto_valor: descVal,
      acrescimo_valor: acrescVal,
      subtotal: subtotal,
      valor_total: vTot,
      custo_unitario: 0,
      custo_total: 0,
      cfop: it.cfop || '',
      ncm: it.ncm || '',
      cest: it.cest || '',
      origem: it.origem || '0',
      cst_icms: it.cst_icms || '',
      csosn: it.csosn || '',
      aliquota_icms: Number(it.aliquota_icms) || 0,
      cst_pis: it.cst_pis || '',
      aliquota_pis: Number(it.aliquota_pis) || 0,
      cst_cofins: it.cst_cofins || '',
      aliquota_cofins: Number(it.aliquota_cofins) || 0,
      lote_id: it.lote_id || '',
      numero_serie: it.numero_serie || '',
      observacao: it.observacao || '',
      ativo: true,
    }
    await pb.collection('vendas_itens').create<VendaItem>(itemData, { requestKey: null })
  }

  // Recalcular totais da venda
  const frete = Number(venda.valor_frete) || 0
  const seguro = Number(venda.valor_seguro) || 0
  const outras = Number(venda.valor_outras_despesas) || 0
  const descGlobal = Number(venda.desconto_valor) || 0
  const acrescGlobal = Number(venda.acrescimo_valor) || 0
  const valorTotal = Math.max(
    0,
    totalProdutos + frete + seguro + outras - descGlobal + acrescGlobal,
  )

  return await pb.collection('vendas').update<Venda>(
    vendaId,
    {
      valor_produtos: totalProdutos,
      valor_total: valorTotal,
    },
    { requestKey: null },
  )
}

/**
 * Finaliza a venda através do endpoint transacional seguro do backend.
 * POST /backend/v1/vendas/finalizar
 */
export async function finalizarVenda(input: FinalizarVendaInput): Promise<FinalizarVendaResponse> {
  const token = pb.authStore.token
  const response = await fetch('/backend/v1/vendas/finalizar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(input),
  })

  const data = await response.json()
  if (!response.ok || !data.sucesso) {
    throw new Error(data.message || data.error || 'Erro ao finalizar venda.')
  }

  return data as FinalizarVendaResponse
}

/**
 * Cancela a venda através do endpoint transacional seguro do backend.
 * POST /backend/v1/vendas/cancelar
 */
export async function cancelarVenda(input: CancelarVendaInput): Promise<CancelarVendaResponse> {
  const token = pb.authStore.token
  const response = await fetch('/backend/v1/vendas/cancelar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(input),
  })

  const data = await response.json()
  if (!response.ok || !data.sucesso) {
    throw new Error(data.message || data.error || 'Erro ao cancelar venda.')
  }

  return data as CancelarVendaResponse
}

/**
 * Obtém uma venda com seus itens e pagamentos expandidos.
 */
export async function obterVendaCompleta(vendaId: string): Promise<{
  venda: Venda
  itens: VendaItem[]
  pagamentos: VendaPagamento[]
}> {
  const venda = await pb.collection('vendas').getOne<Venda>(vendaId, {
    expand: 'empresa_id,cliente_id,usuario_id,condicao_pagamento_id,pdv_terminal_id',
    requestKey: null,
  })

  const itens = await pb.collection('vendas_itens').getFullList<VendaItem>({
    filter: `venda_id = '${vendaId}' && ativo = true`,
    sort: 'sequencial,created',
    expand: 'produto_id,lote_id',
    requestKey: null,
  })

  const pagamentos = await pb.collection('vendas_pagamentos').getFullList<VendaPagamento>({
    filter: `venda_id = '${vendaId}' && ativo = true`,
    expand: 'forma_pagamento_id,conta_financeira_id',
    requestKey: null,
  })

  return { venda, itens, pagamentos }
}

/**
 * Lista vendas com filtros combinados e paginação.
 */
export async function listarVendas(filtros: FiltrosVendas = {}): Promise<ListagemVendasPaginada> {
  const page = filtros.pagina || 1
  const perPage = filtros.por_pagina || 20

  const condicoes: string[] = ['ativo = true']

  if (filtros.empresa_id) {
    condicoes.push(`empresa_id = '${filtros.empresa_id}'`)
  }
  if (filtros.status) {
    condicoes.push(`status = '${filtros.status}'`)
  }
  if (filtros.tipo) {
    condicoes.push(`tipo = '${filtros.tipo}'`)
  }
  if (filtros.cliente_id) {
    condicoes.push(`cliente_id = '${filtros.cliente_id}'`)
  }
  if (filtros.usuario_id) {
    condicoes.push(`usuario_id = '${filtros.usuario_id}'`)
  }
  if (filtros.data_inicio) {
    condicoes.push(`data_venda >= '${filtros.data_inicio}'`)
  }
  if (filtros.data_fim) {
    condicoes.push(`data_venda <= '${filtros.data_fim}'`)
  }
  if (filtros.termo_busca) {
    const termo = filtros.termo_busca.replace(/'/g, "\\'")
    const num = Number(termo)
    if (!isNaN(num) && num > 0) {
      condicoes.push(`(numero = ${num} || observacoes ~ '${termo}')`)
    } else {
      condicoes.push(`observacoes ~ '${termo}'`)
    }
  }

  const filterStr = condicoes.join(' && ')

  const res = await pb.collection('vendas').getList<Venda>(page, perPage, {
    filter: filterStr,
    sort: '-numero,-data_venda,-created',
    expand: 'empresa_id,cliente_id,usuario_id',
    requestKey: null,
  })

  return {
    items: res.items,
    totalItems: res.totalItems,
    page: res.page,
    perPage: res.perPage,
    totalPages: res.totalPages,
  }
}
