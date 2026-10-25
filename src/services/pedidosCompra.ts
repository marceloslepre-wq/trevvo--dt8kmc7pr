import pb from '@/lib/pocketbase/client'
import { Empresa } from '@/services/empresas'
import { Fornecedor } from '@/services/fornecedores'
import { Usuario } from '@/services/usuarios'
import { CondicaoPagamento } from '@/services/condicoesPagamento'
import { Produto } from '@/services/produtos'
import { registrarAuditoria } from '@/services/auditoria'

export type StatusPedidoCompra =
  | 'Rascunho'
  | 'Enviado'
  | 'Parcialmente recebido'
  | 'Recebido'
  | 'Cancelado'

export interface PedidoCompra {
  id: string
  empresa_id: string
  numero: number
  fornecedor_id: string
  comprador_id?: string
  data_emissao?: string
  data_previsao_entrega?: string
  condicao_pagamento_id?: string
  status: StatusPedidoCompra
  valor_produtos: number
  valor_desconto: number
  valor_frete: number
  valor_outras_despesas: number
  valor_ipi: number
  valor_icms_st: number
  valor_total: number
  observacao?: string
  observacao_fornecedor?: string
  ativo: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    empresa_id?: Empresa
    fornecedor_id?: Fornecedor
    comprador_id?: Usuario
    condicao_pagamento_id?: CondicaoPagamento
  }
}

export interface PedidoCompraItem {
  id: string
  pedido_id: string
  produto_id: string
  quantidade: number
  custo_unitario: number
  desconto_percentual: number
  aliquota_ipi: number
  valor_icms_st_estimado: number
  valor_total: number
  quantidade_recebida: number
  observacao?: string
  ativo: boolean
  created?: string
  updated?: string
  created_by?: string
  updated_by?: string
  expand?: {
    produto_id?: Produto
  }
}

export interface PedidoCompraCompleto extends PedidoCompra {
  itens: PedidoCompraItem[]
}

export interface ListarPedidosCompraParams {
  empresaId: string
  status?: string
  fornecedorId?: string
  compradorId?: string
  dataInicio?: string
  dataFim?: string
  busca?: string
  pagina?: number
  itensPorPagina?: number
}

export interface ResultadoPaginadoPedidosCompra {
  items: PedidoCompra[]
  totalItems: number
  page: number
  perPage: number
  totalPages: number
}

export interface NovoItemPedidoCompraInput {
  id?: string
  produto_id: string
  quantidade: number
  custo_unitario: number
  desconto_percentual?: number
  aliquota_ipi?: number
  valor_icms_st_estimado?: number
  valor_total?: number
  observacao?: string
}

export interface SalvarPedidoCompraInput {
  id?: string
  empresa_id: string
  fornecedor_id: string
  comprador_id?: string
  data_emissao?: string
  data_previsao_entrega?: string
  condicao_pagamento_id?: string
  observacao?: string
  observacao_fornecedor?: string
  valor_desconto?: number
  valor_frete?: number
  valor_outras_despesas?: number
  itens: NovoItemPedidoCompraInput[]
}

/**
 * Sugere o custo unitário do produto para um determinado fornecedor:
 * 1) Busca em produtos_fornecedores pelo ultimo_preco_compra do produto com esse fornecedor
 * 2) Se não houver, fallback para o preco_custo do cadastro do produto
 */
export async function sugerirCustoUnitarioProduto(
  produtoId: string,
  fornecedorId?: string,
): Promise<number> {
  if (fornecedorId) {
    try {
      const pf = await pb.collection('produtos_fornecedores').getList(1, 1, {
        filter: `produto_id = '${produtoId}' && fornecedor_id = '${fornecedorId}' && ativo != false`,
      })
      if (pf.items.length > 0) {
        const ultPreco = Number(pf.items[0].ultimo_preco_compra || 0)
        if (ultPreco > 0) {
          return ultPreco
        }
      }
    } catch {
      // Ignora erro e recorre ao fallback
    }
  }

  try {
    const prod = await pb.collection('produtos').getOne<Produto>(produtoId)
    return Number(prod.preco_custo || 0)
  } catch {
    return 0
  }
}

/**
 * Lista pedidos de compra com paginação e filtros
 */
export async function listarPedidosCompra(
  params: ListarPedidosCompraParams,
): Promise<ResultadoPaginadoPedidosCompra> {
  const {
    empresaId,
    status,
    fornecedorId,
    compradorId,
    dataInicio,
    dataFim,
    busca,
    pagina = 1,
    itensPorPagina = 20,
  } = params

  const filters: string[] = ['ativo != false', `empresa_id = '${empresaId}'`]

  if (status && status !== 'todos') {
    filters.push(`status = '${status}'`)
  }

  if (fornecedorId && fornecedorId !== 'todos') {
    filters.push(`fornecedor_id = '${fornecedorId}'`)
  }

  if (compradorId && compradorId !== 'todos') {
    filters.push(`comprador_id = '${compradorId}'`)
  }

  if (dataInicio) {
    filters.push(`(data_emissao >= '${dataInicio}' || created >= '${dataInicio} 00:00:00')`)
  }
  if (dataFim) {
    filters.push(`(data_emissao <= '${dataFim}' || created <= '${dataFim} 23:59:59')`)
  }

  if (busca && busca.trim()) {
    const b = busca.trim()
    const num = parseInt(b, 10)
    if (!isNaN(num)) {
      filters.push(
        `(numero = ${num} || observacao ~ '${b}' || observacao_fornecedor ~ '${b}' || fornecedor_id.razao_social ~ '${b}' || fornecedor_id.nome_fantasia ~ '${b}')`,
      )
    } else {
      filters.push(
        `(observacao ~ '${b}' || observacao_fornecedor ~ '${b}' || fornecedor_id.razao_social ~ '${b}' || fornecedor_id.nome_fantasia ~ '${b}')`,
      )
    }
  }

  const res = await pb.collection('pedidos_compra').getList<PedidoCompra>(pagina, itensPorPagina, {
    filter: filters.join(' && '),
    sort: '-created',
    expand: 'empresa_id,fornecedor_id,comprador_id,condicao_pagamento_id',
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
 * Obtém um pedido por ID com itens e dados relacionados expandidos
 */
export async function obterPedidoCompraPorId(id: string): Promise<PedidoCompraCompleto> {
  const pedido = await pb.collection('pedidos_compra').getOne<PedidoCompra>(id, {
    expand: 'empresa_id,fornecedor_id,comprador_id,condicao_pagamento_id',
  })

  const itensRes = await pb.collection('pedidos_compra_itens').getFullList<PedidoCompraItem>({
    filter: `pedido_id = '${id}' && ativo != false`,
    expand: 'produto_id,produto_id.unidade_id',
  })

  return {
    ...pedido,
    itens: itensRes,
  }
}

/**
 * Calcula totais de itens e pedido
 */
export function calcularTotaisPedido(
  itens: NovoItemPedidoCompraInput[],
  valorDescontoGeral = 0,
  valorFrete = 0,
  valorOutrasDespesas = 0,
) {
  let somaProdutos = 0
  let somaIpi = 0
  let somaIcmsSt = 0

  const itensCalculados = itens.map((item) => {
    const qtd = Number(item.quantidade || 0)
    const custo = Number(item.custo_unitario || 0)
    const descPerc = Number(item.desconto_percentual || 0)
    const aliqIpi = Number(item.aliquota_ipi || 0)
    const icmsSt = Number(item.valor_icms_st_estimado || 0)

    const subtotalBruto = qtd * custo
    const valorDesc = subtotalBruto * (descPerc / 100)
    const subtotalLiquido = Math.max(0, subtotalBruto - valorDesc)
    const valorIpiItem = subtotalLiquido * (aliqIpi / 100)
    const totalItem = Number((subtotalLiquido + valorIpiItem + icmsSt).toFixed(2))

    somaProdutos += subtotalBruto
    somaIpi += valorIpiItem
    somaIcmsSt += icmsSt

    return {
      ...item,
      valor_total: totalItem,
    }
  })

  const valorProdutos = Number(somaProdutos.toFixed(2))
  const valorDesconto = Number(valorDescontoGeral || 0)
  const valorFreteNum = Number(valorFrete || 0)
  const valorOutrasNum = Number(valorOutrasDespesas || 0)
  const valorIpi = Number(somaIpi.toFixed(2))
  const valorIcmsSt = Number(somaIcmsSt.toFixed(2))

  const valorTotal = Number(
    Math.max(
      0,
      valorProdutos - valorDesconto + valorFreteNum + valorOutrasNum + valorIpi + valorIcmsSt,
    ).toFixed(2),
  )

  return {
    itensCalculados,
    valorProdutos,
    valorDesconto,
    valorFrete: valorFreteNum,
    valorOutrasDespesas: valorOutrasNum,
    valorIpi,
    valorIcmsSt,
    valorTotal,
  }
}

/**
 * Salva ou atualiza um pedido de compra (Rascunho)
 */
export async function salvarPedidoCompra(
  input: SalvarPedidoCompraInput,
  usuarioId?: string,
): Promise<PedidoCompraCompleto> {
  if (!input.fornecedor_id) {
    throw new Error('Informe o fornecedor do pedido de compra.')
  }

  if (!input.itens || input.itens.length === 0) {
    throw new Error('Adicione ao menos um item ao pedido de compra.')
  }

  const {
    itensCalculados,
    valorProdutos,
    valorDesconto,
    valorFrete,
    valorOutrasDespesas,
    valorIpi,
    valorIcmsSt,
    valorTotal,
  } = calcularTotaisPedido(
    input.itens,
    input.valor_desconto,
    input.valor_frete,
    input.valor_outras_despesas,
  )

  let pedidoId = input.id
  let numero = 0
  const isNovo = !pedidoId
  let antes: PedidoCompra | null = null

  if (isNovo) {
    const criada = await pb.collection('pedidos_compra').create<PedidoCompra>({
      empresa_id: input.empresa_id,
      fornecedor_id: input.fornecedor_id,
      comprador_id: input.comprador_id || null,
      data_emissao: input.data_emissao || new Date().toISOString().slice(0, 10),
      data_previsao_entrega: input.data_previsao_entrega || '',
      condicao_pagamento_id: input.condicao_pagamento_id || null,
      status: 'Rascunho',
      valor_produtos: valorProdutos,
      valor_desconto: valorDesconto,
      valor_frete: valorFrete,
      valor_outras_despesas: valorOutrasDespesas,
      valor_ipi: valorIpi,
      valor_icms_st: valorIcmsSt,
      valor_total: valorTotal,
      observacao: input.observacao || '',
      observacao_fornecedor: input.observacao_fornecedor || '',
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })
    pedidoId = criada.id
    numero = criada.numero

    await registrarAuditoria({
      acao: 'inclusao',
      tabela: 'pedidos_compra',
      registro_id: pedidoId,
      empresa_id: input.empresa_id,
      valores_depois: {
        numero,
        fornecedor_id: input.fornecedor_id,
        valor_total: valorTotal,
        qtd_itens: input.itens.length,
      },
    })
  } else {
    antes = await pb.collection('pedidos_compra').getOne<PedidoCompra>(pedidoId!)
    if (antes.status !== 'Rascunho') {
      throw new Error(
        `Apenas pedidos em Rascunho podem ser editados (status atual: ${antes.status}).`,
      )
    }
    numero = antes.numero

    await pb.collection('pedidos_compra').update(pedidoId!, {
      fornecedor_id: input.fornecedor_id,
      comprador_id: input.comprador_id || null,
      data_emissao: input.data_emissao || antes.data_emissao,
      data_previsao_entrega: input.data_previsao_entrega || '',
      condicao_pagamento_id: input.condicao_pagamento_id || null,
      valor_produtos: valorProdutos,
      valor_desconto: valorDesconto,
      valor_frete: valorFrete,
      valor_outras_despesas: valorOutrasDespesas,
      valor_ipi: valorIpi,
      valor_icms_st: valorIcmsSt,
      valor_total: valorTotal,
      observacao: input.observacao || '',
      observacao_fornecedor: input.observacao_fornecedor || '',
      ativo: true,
      updated_by: pb.authStore.record?.id || null,
    })

    // Remove itens anteriores para recriar
    const itensAntigos = await pb.collection('pedidos_compra_itens').getFullList({
      filter: `pedido_id = '${pedidoId}'`,
      fields: 'id',
    })
    for (const it of itensAntigos) {
      await pb.collection('pedidos_compra_itens').delete(it.id)
    }

    await registrarAuditoria({
      acao: 'alteracao',
      tabela: 'pedidos_compra',
      registro_id: pedidoId!,
      empresa_id: input.empresa_id,
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: {
        numero,
        fornecedor_id: input.fornecedor_id,
        valor_total: valorTotal,
        qtd_itens: input.itens.length,
      },
    })
  }

  // Criação dos itens
  for (const item of itensCalculados) {
    if (item.quantidade <= 0) {
      throw new Error('A quantidade de cada item deve ser maior que zero.')
    }

    await pb.collection('pedidos_compra_itens').create({
      pedido_id: pedidoId,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      custo_unitario: item.custo_unitario || 0,
      desconto_percentual: item.desconto_percentual || 0,
      aliquota_ipi: item.aliquota_ipi || 0,
      valor_icms_st_estimado: item.valor_icms_st_estimado || 0,
      valor_total: item.valor_total || 0,
      quantidade_recebida: 0,
      observacao: item.observacao || '',
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })
  }

  return obterPedidoCompraPorId(pedidoId!)
}

/**
 * Enviar pedido: Rascunho -> Enviado
 */
export async function enviarPedidoCompra(
  pedidoId: string,
  empresaAtivaId: string,
): Promise<PedidoCompraCompleto> {
  const pedido = await obterPedidoCompraPorId(pedidoId)

  if (pedido.status !== 'Rascunho') {
    throw new Error(`Apenas pedidos em Rascunho podem ser enviados (atual: ${pedido.status}).`)
  }

  if (pedido.empresa_id !== empresaAtivaId) {
    throw new Error('Apenas a empresa dona do pedido pode enviá-lo.')
  }

  if (pedido.itens.length === 0) {
    throw new Error('O pedido não possui itens para envio.')
  }

  await pb.collection('pedidos_compra').update(pedido.id, {
    status: 'Enviado',
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    acao: 'alteracao',
    tabela: 'pedidos_compra',
    registro_id: pedido.id,
    empresa_id: pedido.empresa_id,
    valores_depois: {
      acao_fluxo: 'ENVIO',
      numero: pedido.numero,
      status: 'Enviado',
    },
  })

  return obterPedidoCompraPorId(pedido.id)
}

/**
 * Reabrir pedido: Enviado -> Rascunho (apenas quem tem permissão de editar)
 */
export async function reabrirPedidoCompra(
  pedidoId: string,
  empresaAtivaId: string,
): Promise<PedidoCompraCompleto> {
  const pedido = await obterPedidoCompraPorId(pedidoId)

  if (pedido.status !== 'Enviado') {
    throw new Error(
      `Apenas pedidos com status "Enviado" podem ser reabertos (atual: ${pedido.status}).`,
    )
  }

  if (pedido.empresa_id !== empresaAtivaId) {
    throw new Error('Apenas a empresa dona do pedido pode reabri-lo.')
  }

  await pb.collection('pedidos_compra').update(pedido.id, {
    status: 'Rascunho',
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    acao: 'alteracao',
    tabela: 'pedidos_compra',
    registro_id: pedido.id,
    empresa_id: pedido.empresa_id,
    valores_depois: {
      acao_fluxo: 'REABERTURA',
      numero: pedido.numero,
      status: 'Rascunho',
    },
  })

  return obterPedidoCompraPorId(pedido.id)
}

/**
 * Cancelar pedido: só antes de qualquer recebimento
 */
export async function cancelarPedidoCompra(
  pedidoId: string,
  empresaAtivaId: string,
  motivo?: string,
): Promise<PedidoCompraCompleto> {
  const pedido = await obterPedidoCompraPorId(pedidoId)

  if (pedido.status === 'Parcialmente recebido' || pedido.status === 'Recebido') {
    throw new Error(
      `Pedidos com recebimento (${pedido.status}) são imutáveis e não podem ser cancelados.`,
    )
  }

  if (pedido.status === 'Cancelado') {
    throw new Error('Este pedido já se encontra cancelado.')
  }

  // Verifica se algum item teve quantidade recebida > 0
  const temRecebimento = pedido.itens.some((i) => Number(i.quantidade_recebida || 0) > 0)
  if (temRecebimento) {
    throw new Error('O pedido já possui itens recebidos e não pode ser cancelado.')
  }

  const obsAtualizada = motivo?.trim()
    ? pedido.observacao
      ? `${pedido.observacao}\n[Cancelamento: ${motivo.trim()}]`
      : `[Cancelamento: ${motivo.trim()}]`
    : pedido.observacao

  await pb.collection('pedidos_compra').update(pedido.id, {
    status: 'Cancelado',
    observacao: obsAtualizada,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    acao: 'exclusao',
    tabela: 'pedidos_compra',
    registro_id: pedido.id,
    empresa_id: empresaAtivaId,
    valores_depois: {
      acao_fluxo: 'CANCELAMENTO',
      numero: pedido.numero,
      status_anterior: pedido.status,
      motivo: motivo || '',
    },
  })

  return obterPedidoCompraPorId(pedido.id)
}

/**
 * Duplicar pedido: cria novo Rascunho copiando cabeçalho e itens
 */
export async function duplicarPedidoCompra(
  pedidoId: string,
  empresaAtivaId: string,
): Promise<PedidoCompraCompleto> {
  const pedido = await obterPedidoCompraPorId(pedidoId)

  const novaDataEmissao = new Date().toISOString().slice(0, 10)

  const novoPedido = await pb.collection('pedidos_compra').create<PedidoCompra>({
    empresa_id: empresaAtivaId,
    fornecedor_id: pedido.fornecedor_id,
    comprador_id: pedido.comprador_id || null,
    data_emissao: novaDataEmissao,
    data_previsao_entrega: pedido.data_previsao_entrega || '',
    condicao_pagamento_id: pedido.condicao_pagamento_id || null,
    status: 'Rascunho',
    valor_produtos: pedido.valor_produtos,
    valor_desconto: pedido.valor_desconto,
    valor_frete: pedido.valor_frete,
    valor_outras_despesas: pedido.valor_outras_despesas,
    valor_ipi: pedido.valor_ipi,
    valor_icms_st: pedido.valor_icms_st,
    valor_total: pedido.valor_total,
    observacao: pedido.observacao
      ? `[Duplicado do pedido #${pedido.numero}] ${pedido.observacao}`
      : `[Duplicado do pedido #${pedido.numero}]`,
    observacao_fornecedor: pedido.observacao_fornecedor || '',
    ativo: true,
    created_by: pb.authStore.record?.id || null,
    updated_by: pb.authStore.record?.id || null,
  })

  for (const it of pedido.itens) {
    await pb.collection('pedidos_compra_itens').create({
      pedido_id: novoPedido.id,
      produto_id: it.produto_id,
      quantidade: it.quantidade,
      custo_unitario: it.custo_unitario,
      desconto_percentual: it.desconto_percentual || 0,
      aliquota_ipi: it.aliquota_ipi || 0,
      valor_icms_st_estimado: it.valor_icms_st_estimado || 0,
      valor_total: it.valor_total,
      quantidade_recebida: 0,
      observacao: it.observacao || '',
      ativo: true,
      created_by: pb.authStore.record?.id || null,
      updated_by: pb.authStore.record?.id || null,
    })
  }

  await registrarAuditoria({
    acao: 'inclusao',
    tabela: 'pedidos_compra',
    registro_id: novoPedido.id,
    empresa_id: empresaAtivaId,
    valores_depois: {
      acao_fluxo: 'DUPLICACAO',
      pedido_origem_id: pedido.id,
      pedido_origem_numero: pedido.numero,
      novo_numero: novoPedido.numero,
    },
  })

  return obterPedidoCompraPorId(novoPedido.id)
}
