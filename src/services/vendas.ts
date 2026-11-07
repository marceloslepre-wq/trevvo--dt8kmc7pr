import pb from '@/lib/pocketbase/client'

// ============================================================================
// TIPOS DAS 3 TABELAS CENTRAIS DE VENDAS
// ============================================================================

export type TipoVenda = 'Orçamento' | 'Pedido' | 'PDV' | 'Devolução'
export type StatusVenda =
  | 'Orçamento'
  | 'Pedido em aberto'
  | 'Finalizada'
  | 'Cancelada'
  | 'Orçamento expirado'
  | 'Pendente de nota'

export type DocumentoFiscalStatus =
  | 'Não emitido'
  | 'Processando'
  | 'Autorizada'
  | 'Cancelada'
  | 'Rejeitada'
  | 'Denegada'

export interface Venda {
  id: string
  empresa_id: string
  numero: number
  tipo: TipoVenda
  status: StatusVenda
  cliente_id: string
  cpf_cnpj_consumidor?: string
  vendedor_id?: string
  operador_id?: string
  pdv_terminal_id?: string
  caixa_sessao_id?: string
  data_emissao: string
  data_validade?: string
  data_finalizacao?: string
  valor_produtos: number
  valor_desconto_itens: number
  valor_desconto_total: number
  valor_acrescimo: number
  valor_frete: number
  valor_total: number
  valor_troco?: number
  custo_total?: number
  condicao_pagamento_id?: string
  observacao?: string
  observacao_cliente?: string
  venda_origem_id?: string
  documento_fiscal_status?: DocumentoFiscalStatus
  documento_fiscal_id?: string
  motivo_cancelamento?: string
  data_cancelamento?: string
  usuario_cancelamento_id?: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    empresa_id?: {
      id: string
      razao_social?: string
      nome_fantasia?: string
      cnpj?: string
      telefone?: string
      email?: string
      logradouro?: string
      numero?: string
      bairro?: string
      cidade?: string
      uf?: string
    }
    cliente_id?: {
      id: string
      nome_razao_social?: string
      nome?: string
      nome_fantasia?: string
      cpf_cnpj?: string
      telefone?: string
      celular?: string
      email?: string
      logradouro?: string
      numero?: string
      bairro?: string
      cidade?: string
      uf?: string
      cep?: string
      vendedor_padrao_id?: string
    }
    vendedor_id?: { id: string; nome: string; email?: string }
    operador_id?: { id: string; nome: string; email?: string }
    condicao_pagamento_id?: {
      id: string
      nome: string
      quantidade_parcelas?: number
      dias_parcelas?: number[] | string
    }
    pdv_terminal_id?: { id: string; nome: string }
  }
}

export interface VendaItem {
  id: string
  venda_id: string
  item: number
  produto_id: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  preco_tabela?: number
  desconto_percentual?: number
  desconto_valor?: number
  acrescimo_valor?: number
  valor_total: number
  custo_unitario?: number
  lote_id?: string
  ncm?: string
  cest?: string
  cfop?: string
  origem?: string
  cst_icms?: string
  csosn?: string
  aliquota_icms?: number
  cst_pis?: string
  cst_cofins?: string
  perfil_tributario_id?: string
  quantidade_devolvida?: number
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    produto_id?: {
      id: string
      codigo?: number
      descricao: string
      gtin?: string
      preco_venda?: number
      preco_custo?: number
      unidade_medida?: string
      permite_desconto?: boolean
      desconto_maximo_percentual?: number
    }
    lote_id?: { id: string; numero_lote: string; data_validade?: string }
    venda_id?: Venda
  }
}

export interface VendaPagamento {
  id: string
  venda_id: string
  forma_pagamento_id: string
  valor: number
  troco?: number
  parcelas?: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  taxa_percentual?: number
  valor_taxa?: number
  conta_financeira_id?: string
  conta_receber_ids?: string // JSON string array com IDs dos títulos em contas_receber
  ativo: boolean
  created_by?: string
  updated_by?: string
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

export interface ItemVendaInput {
  id?: string
  item?: number
  produto_id: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  preco_tabela?: number
  desconto_percentual?: number
  desconto_valor?: number
  acrescimo_valor?: number
  valor_total?: number
  custo_unitario?: number
  lote_id?: string
  ncm?: string
  cest?: string
  cfop?: string
  origem?: string
  cst_icms?: string
  csosn?: string
  aliquota_icms?: number
  cst_pis?: string
  cst_cofins?: string
  perfil_tributario_id?: string
}

export interface SalvarVendaInput {
  id?: string
  empresa_id: string
  tipo: TipoVenda // 'Orçamento' | 'Pedido'
  status?: StatusVenda // 'Orçamento' | 'Pedido em aberto' | 'Orçamento expirado'
  cliente_id: string
  cpf_cnpj_consumidor?: string
  vendedor_id?: string
  operador_id?: string
  data_emissao?: string
  data_validade?: string
  valor_frete?: number
  valor_acrescimo?: number
  valor_desconto_total?: number
  condicao_pagamento_id?: string
  observacao?: string
  observacao_cliente?: string
  venda_origem_id?: string
  itens: ItemVendaInput[]
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
  status?: string // 'todos' | StatusVenda
  tipo?: string // 'todos' | TipoVenda
  cliente_id?: string
  vendedor_id?: string
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
 * Cria ou salva (edita) uma venda / orçamento / pedido em aberto e sincroniza seus itens.
 * O número sequencial é atribuído de forma atômica e exclusiva pelo backend.
 */
export async function salvarVenda(input: SalvarVendaInput): Promise<Venda> {
  if (!input.empresa_id) {
    throw new Error('Empresa é obrigatória.')
  }
  if (!input.cliente_id) {
    throw new Error('Cliente é obrigatório.')
  }
  if (!input.itens || input.itens.length === 0) {
    throw new Error('Adicione ao menos um produto à venda.')
  }

  // 1. Totais dos itens
  let totalProdutos = 0
  let totalDescontoItens = 0
  const itensCalculados = input.itens.map((it, idx) => {
    const qtd = Number(it.quantidade) || 0
    const preco = Number(it.preco_unitario) || 0
    const desc = Number(it.desconto_valor) || 0
    const acresc = Number(it.acrescimo_valor) || 0
    const subtotal = qtd * preco
    const valorTot = Math.max(0, subtotal - desc + acresc)

    totalProdutos += subtotal
    totalDescontoItens += desc

    return {
      ...it,
      item: it.item || idx + 1,
      quantidade: qtd,
      preco_unitario: preco,
      preco_tabela: Number(it.preco_tabela) || preco,
      desconto_percentual: Number(it.desconto_percentual) || 0,
      desconto_valor: desc,
      acrescimo_valor: acresc,
      valor_total: valorTot,
      ativo: true,
    }
  })

  const valorFrete = Number(input.valor_frete) || 0
  const valorAcrescimo = Number(input.valor_acrescimo) || 0
  const valorDescontoTotal = Number(input.valor_desconto_total) || 0
  const valorTotal = Math.max(
    0,
    totalProdutos - totalDescontoItens - valorDescontoTotal + valorAcrescimo + valorFrete,
  )

  const hojeIso = new Date().toISOString().slice(0, 10)
  const dataEmissao = input.data_emissao || hojeIso

  let statusDefinido: StatusVenda =
    input.status || (input.tipo === 'Orçamento' ? 'Orçamento' : 'Pedido em aberto')

  // Se for orçamento e data_validade estiver vencida, marca como Orçamento expirado
  if (
    input.tipo === 'Orçamento' &&
    input.data_validade &&
    input.data_validade < hojeIso &&
    statusDefinido === 'Orçamento'
  ) {
    statusDefinido = 'Orçamento expirado'
  }

  let vendaId = input.id
  let vendaSalva: Venda

  if (vendaId) {
    // Atualizar cabeçalho existente
    const payloadUpdate: Partial<Venda> = {
      tipo: input.tipo,
      status: statusDefinido,
      cliente_id: input.cliente_id,
      cpf_cnpj_consumidor: input.cpf_cnpj_consumidor || '',
      vendedor_id: input.vendedor_id || '',
      operador_id: input.operador_id || pb.authStore.record?.id || '',
      data_emissao: dataEmissao,
      data_validade: input.data_validade || '',
      valor_produtos: totalProdutos,
      valor_desconto_itens: totalDescontoItens,
      valor_desconto_total: valorDescontoTotal,
      valor_acrescimo: valorAcrescimo,
      valor_frete: valorFrete,
      valor_total: valorTotal,
      condicao_pagamento_id: input.condicao_pagamento_id || '',
      observacao: input.observacao || '',
      observacao_cliente: input.observacao_cliente || '',
      venda_origem_id: input.venda_origem_id || '',
      updated_by: pb.authStore.record?.id || '',
    }

    vendaSalva = await pb
      .collection('vendas')
      .update<Venda>(vendaId, payloadUpdate, { requestKey: null })

    // Remover itens antigos
    const itensExistentes = await pb.collection('vendas_itens').getFullList<VendaItem>({
      filter: `venda_id = '${vendaId}'`,
      requestKey: null,
    })
    for (const it of itensExistentes) {
      await pb.collection('vendas_itens').delete(it.id, { requestKey: null })
    }
  } else {
    // Criar nova venda (número gerado no backend pelo hook onRecordCreate)
    const payloadCreate: Partial<Venda> = {
      empresa_id: input.empresa_id,
      tipo: input.tipo,
      status: statusDefinido,
      cliente_id: input.cliente_id,
      cpf_cnpj_consumidor: input.cpf_cnpj_consumidor || '',
      vendedor_id: input.vendedor_id || '',
      operador_id: input.operador_id || pb.authStore.record?.id || '',
      pdv_terminal_id: '',
      caixa_sessao_id: '',
      data_emissao: dataEmissao,
      data_validade: input.data_validade || '',
      valor_produtos: totalProdutos,
      valor_desconto_itens: totalDescontoItens,
      valor_desconto_total: valorDescontoTotal,
      valor_acrescimo: valorAcrescimo,
      valor_frete: valorFrete,
      valor_total: valorTotal,
      custo_total: 0,
      condicao_pagamento_id: input.condicao_pagamento_id || '',
      observacao: input.observacao || '',
      observacao_cliente: input.observacao_cliente || '',
      venda_origem_id: input.venda_origem_id || '',
      documento_fiscal_status: 'Não emitido',
      documento_fiscal_id: '',
      ativo: true,
      created_by: pb.authStore.record?.id || '',
      updated_by: pb.authStore.record?.id || '',
    }

    vendaSalva = await pb.collection('vendas').create<Venda>(payloadCreate, { requestKey: null })
    vendaId = vendaSalva.id
  }

  // Gravar novos itens
  for (const it of itensCalculados) {
    const itemData: Partial<VendaItem> = {
      venda_id: vendaId,
      item: it.item,
      produto_id: it.produto_id,
      descricao: it.descricao,
      unidade: it.unidade || 'UN',
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
      preco_tabela: it.preco_tabela,
      desconto_percentual: it.desconto_percentual,
      desconto_valor: it.desconto_valor,
      acrescimo_valor: it.acrescimo_valor,
      valor_total: it.valor_total,
      custo_unitario: it.custo_unitario || 0,
      lote_id: it.lote_id || '',
      ncm: it.ncm || '',
      cest: it.cest || '',
      cfop: it.cfop || '',
      origem: it.origem || '0',
      cst_icms: it.cst_icms || '',
      csosn: it.csosn || '',
      aliquota_icms: Number(it.aliquota_icms) || 0,
      cst_pis: it.cst_pis || '',
      cst_cofins: it.cst_cofins || '',
      perfil_tributario_id: it.perfil_tributario_id || '',
      ativo: true,
      created_by: pb.authStore.record?.id || '',
      updated_by: pb.authStore.record?.id || '',
    }
    await pb.collection('vendas_itens').create<VendaItem>(itemData, { requestKey: null })
  }

  return vendaSalva
}

export interface ConverterOrcamentoResponse {
  sucesso: boolean
  message: string
  venda_id?: string
  numero?: number
  tipo?: string
  status?: string
}

/**
 * Converte um Orçamento existente em Pedido em aberto via rota transacional do backend.
 * POST /backend/v1/vendas/converter-orcamento
 */
export async function converterOrcamentoEmPedido(orcamentoId: string): Promise<Venda> {
  if (!orcamentoId) {
    throw new Error('ID do orçamento é obrigatório.')
  }

  try {
    const res = await pb.send<ConverterOrcamentoResponse>(
      '/backend/v1/vendas/converter-orcamento',
      {
        method: 'POST',
        body: {
          venda_id: orcamentoId,
        },
      },
    )

    if (!res || !res.sucesso) {
      throw new Error(res?.message || 'Falha ao converter orçamento em pedido.')
    }
  } catch (err: unknown) {
    const pbErr = err as {
      response?: { message?: string }
      data?: { message?: string }
      message?: string
    }
    const backendMsg =
      pbErr.response?.message ||
      pbErr.data?.message ||
      pbErr.message ||
      'Erro ao converter orçamento em pedido.'
    throw new Error(backendMsg)
  }

  return await pb.collection('vendas').getOne<Venda>(orcamentoId, { requestKey: null })
}

/**
 * Duplica uma venda existente (seja orçamento, pedido ou finalizada) criando um novo Orçamento/Pedido.
 */
export async function duplicarVenda(
  vendaOrigemId: string,
  tipoDestino: TipoVenda = 'Pedido',
): Promise<Venda> {
  const { venda, itens } = await obterVendaCompleta(vendaOrigemId)

  const hojeIso = new Date().toISOString().slice(0, 10)

  return await salvarVenda({
    empresa_id: venda.empresa_id,
    tipo: tipoDestino,
    cliente_id: venda.cliente_id,
    cpf_cnpj_consumidor: venda.cpf_cnpj_consumidor,
    vendedor_id: venda.vendedor_id,
    operador_id: pb.authStore.record?.id || '',
    data_emissao: hojeIso,
    data_validade: venda.data_validade,
    valor_frete: venda.valor_frete,
    valor_acrescimo: venda.valor_acrescimo,
    valor_desconto_total: venda.valor_desconto_total,
    condicao_pagamento_id: venda.condicao_pagamento_id,
    observacao: venda.observacao
      ? `Cópia da Venda #${venda.numero}: ${venda.observacao}`
      : `Cópia da Venda #${venda.numero}`,
    observacao_cliente: venda.observacao_cliente,
    venda_origem_id: vendaOrigemId,
    itens: itens.map((it, idx) => ({
      item: idx + 1,
      produto_id: it.produto_id,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
      preco_tabela: it.preco_tabela,
      desconto_percentual: it.desconto_percentual,
      desconto_valor: it.desconto_valor,
      acrescimo_valor: it.acrescimo_valor,
      custo_unitario: it.custo_unitario,
      ncm: it.ncm,
      cest: it.cest,
      cfop: it.cfop,
      origem: it.origem,
      cst_icms: it.cst_icms,
      csosn: it.csosn,
      aliquota_icms: it.aliquota_icms,
      cst_pis: it.cst_pis,
      cst_cofins: it.cst_cofins,
      perfil_tributario_id: it.perfil_tributario_id,
    })),
  })
}

/**
 * Verifica orçamentos com data_validade vencida da empresa e os marca como 'Orçamento expirado'.
 * Chamado automaticamente na abertura da listagem de vendas.
 */
export async function atualizarOrcamentosExpirados(empresaId: string): Promise<number> {
  if (!empresaId) return 0
  const hojeIso = new Date().toISOString().slice(0, 10)
  try {
    const expirados = await pb.collection('vendas').getFullList<Venda>({
      filter: `empresa_id = '${empresaId}' && tipo = 'Orçamento' && status = 'Orçamento' && data_validade != '' && data_validade < '${hojeIso}' && ativo = true`,
      requestKey: null,
    })

    let count = 0
    for (const v of expirados) {
      try {
        await pb.collection('vendas').update(
          v.id,
          {
            status: 'Orçamento expirado',
            updated_by: pb.authStore.record?.id || '',
          },
          { requestKey: null },
        )
        count++
      } catch {
        /* continua */
      }
    }
    return count
  } catch {
    return 0
  }
}

/**
 * Finaliza a venda através do endpoint transacional seguro do backend.
 * POST /backend/v1/vendas/finalizar
 */
export async function finalizarVenda(input: FinalizarVendaInput): Promise<FinalizarVendaResponse> {
  const res = await pb.send<FinalizarVendaResponse>('/backend/v1/vendas/finalizar', {
    method: 'POST',
    body: input,
  })

  if (!res || !res.sucesso) {
    throw new Error(res?.message || 'Erro ao finalizar venda.')
  }

  return res
}

/**
 * Cancela a venda através do endpoint transacional seguro do backend.
 * POST /backend/v1/vendas/cancelar
 */
export async function cancelarVenda(input: CancelarVendaInput): Promise<CancelarVendaResponse> {
  const res = await pb.send<CancelarVendaResponse>('/backend/v1/vendas/cancelar', {
    method: 'POST',
    body: input,
  })

  if (!res || !res.sucesso) {
    throw new Error(res?.message || 'Erro ao cancelar venda.')
  }

  return res
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
    expand: 'empresa_id,cliente_id,vendedor_id,operador_id,condicao_pagamento_id,pdv_terminal_id',
    requestKey: null,
  })

  const itens = await pb.collection('vendas_itens').getFullList<VendaItem>({
    filter: `venda_id = '${vendaId}' && ativo = true`,
    sort: 'item,created',
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
  if (filtros.status && filtros.status !== 'todos') {
    condicoes.push(`status = '${filtros.status}'`)
  }
  if (filtros.tipo && filtros.tipo !== 'todos') {
    condicoes.push(`tipo = '${filtros.tipo}'`)
  }
  if (filtros.cliente_id) {
    condicoes.push(`cliente_id = '${filtros.cliente_id}'`)
  }
  if (filtros.vendedor_id) {
    condicoes.push(`vendedor_id = '${filtros.vendedor_id}'`)
  }
  if (filtros.data_inicio) {
    condicoes.push(`data_emissao >= '${filtros.data_inicio}'`)
  }
  if (filtros.data_fim) {
    condicoes.push(`data_emissao <= '${filtros.data_fim}'`)
  }
  if (filtros.termo_busca) {
    const termo = filtros.termo_busca.replace(/'/g, "\\'")
    const num = Number(termo)
    if (!isNaN(num) && num > 0) {
      condicoes.push(`(numero = ${num} || observacao ~ '${termo}')`)
    } else {
      condicoes.push(`observacao ~ '${termo}'`)
    }
  }

  const filterStr = condicoes.join(' && ')

  const res = await pb.collection('vendas').getList<Venda>(page, perPage, {
    filter: filterStr,
    sort: '-numero,-data_emissao,-created',
    expand: 'empresa_id,cliente_id,vendedor_id',
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

/**
 * Consulta histórico de vendas de um determinado cliente para exibir na aba de cadastro do cliente.
 * Retorna as últimas vendas e o resumo de totais por ano.
 */
export interface ResumoVendasCliente {
  ultimasVendas: Venda[]
  totalPorAno: { ano: number; quantidade: number; valorTotal: number }[]
  totalGeral: number
  quantidadeGeral: number
}

export async function obterHistoricoVendasCliente(
  clienteId: string,
  empresaId?: string,
): Promise<ResumoVendasCliente> {
  if (!clienteId) {
    return { ultimasVendas: [], totalPorAno: [], totalGeral: 0, quantidadeGeral: 0 }
  }

  const conds = [`cliente_id = '${clienteId}'`, 'ativo = true', `status = 'Finalizada'`]
  if (empresaId) conds.push(`empresa_id = '${empresaId}'`)

  const vendas = await pb.collection('vendas').getFullList<Venda>({
    filter: conds.join(' && '),
    sort: '-data_emissao,-created',
    expand: 'vendedor_id,condicao_pagamento_id',
    requestKey: null,
  })

  const anosMap = new Map<number, { ano: number; quantidade: number; valorTotal: number }>()
  let totalGeral = 0

  for (const v of vendas) {
    const ano = v.data_emissao ? new Date(v.data_emissao).getFullYear() : new Date().getFullYear()
    const valor = Number(v.valor_total) || 0
    totalGeral += valor

    const atual = anosMap.get(ano) || { ano, quantidade: 0, valorTotal: 0 }
    atual.quantidade += 1
    atual.valorTotal += valor
    anosMap.set(ano, atual)
  }

  const totalPorAno = Array.from(anosMap.values()).sort((a, b) => b.ano - a.ano)

  return {
    ultimasVendas: vendas.slice(0, 15),
    totalPorAno,
    totalGeral,
    quantidadeGeral: vendas.length,
  }
}

/**
 * Consulta histórico das últimas saídas de um produto por venda.
 * Exibe data, cliente, quantidade, preço unitário e valor total.
 */
export interface SaidaVendaProduto {
  id: string
  venda_id: string
  venda_numero: number
  data: string
  cliente_nome: string
  quantidade: number
  unidade: string
  preco_unitario: number
  valor_total: number
}

export async function obterHistoricoSaidasProduto(
  produtoId: string,
  empresaId?: string,
): Promise<SaidaVendaProduto[]> {
  if (!produtoId) return []

  // Busca itens de vendas ativas vinculadas a vendas finalizadas
  const itens = await pb.collection('vendas_itens').getList<VendaItem>(1, 30, {
    filter: `produto_id = '${produtoId}' && ativo = true && venda_id.status = 'Finalizada'`,
    sort: '-created',
    expand: 'venda_id,venda_id.cliente_id',
    requestKey: null,
  })

  const res: SaidaVendaProduto[] = []
  for (const it of itens.items) {
    const v = it.expand?.venda_id as unknown as Venda | undefined
    if (empresaId && v && v.empresa_id !== empresaId) continue

    const clienteExpand = (v?.expand as any)?.cliente_id
    const clienteNome =
      clienteExpand?.nome_razao_social ||
      clienteExpand?.nome ||
      v?.cpf_cnpj_consumidor ||
      'Consumidor'

    res.push({
      id: it.id,
      venda_id: it.venda_id,
      venda_numero: v?.numero || 0,
      data: v?.data_emissao || (it.created ? it.created.slice(0, 10) : ''),
      cliente_nome: clienteNome,
      quantidade: Number(it.quantidade) || 0,
      unidade: it.unidade || 'UN',
      preco_unitario: Number(it.preco_unitario) || 0,
      valor_total: Number(it.valor_total) || 0,
    })
  }

  return res
}
