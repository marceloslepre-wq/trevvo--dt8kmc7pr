import pb from '@/lib/pocketbase/client'
import { movimentarEstoque } from './estoque'
import { lancarAvulso } from './movimentacoesExtratos'
import { receberTitulos } from './contasReceber'
import { obterVendaCompleta } from './vendas'

export interface ValeTroca {
  id: string
  empresa_id: string
  codigo: string
  cliente_id?: string
  valor: number
  saldo: number
  validade?: string
  venda_origem_id?: string
  status: 'Ativo' | 'Usado' | 'Expirado' | 'Cancelado'
  observacao?: string
  ativo?: boolean
  created?: string
  updated?: string
  expand?: {
    cliente_id?: { id: string; nome: string; cpf_cnpj?: string }
    venda_origem_id?: { id: string; numero: number; valor_total: number }
  }
}

export interface DevolucaoVendaRegistro {
  id: string
  numero: number
  tipo: string
  status: string
  empresa_id: string
  venda_origem_id?: string
  cliente_id?: string
  cpf_cnpj_consumidor?: string
  valor_total: number
  documento_fiscal_status?: string
  documento_fiscal_id?: string
  motivo_cancelamento?: string
  observacao?: string
  created?: string
  updated?: string
  expand?: {
    venda_origem_id?: {
      id: string
      numero: number
      valor_total: number
      documento_fiscal_status?: string
    }
    cliente_id?: { id: string; nome_razao_social?: string; nome?: string; cpf_cnpj?: string }
    documento_fiscal_id?: {
      id: string
      numero?: number
      serie?: string
      chave_acesso?: string
      status?: string
      danfe_url?: string
      xml_arquivo?: string
    }
  }
}

export interface ItemDevolucaoInput {
  venda_item_id: string
  produto_id: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  desconto_unitario?: number
  lote_id?: string
}

export type DestinoDevolucaoTipo = 'vale_troca' | 'dinheiro_volta' | 'abater_crediario'

export interface ProcessarDevolucaoInput {
  empresa_id: string
  venda_origem_id: string
  itens: ItemDevolucaoInput[]
  destino: DestinoDevolucaoTipo
  observacao?: string
  // Se destino for dinheiro_volta:
  conta_financeira_id?: string
  caixa_sessao_id?: string
  // Se destino for vale_troca:
  dias_validade_vale?: number
  // Se destino for abater_crediario:
  titulos_crediario_ids?: string[]
  /**
   * Se true, cria a devolução com status 'Pendente de nota' e não toca em estoque nem financeiro agora
   */
  com_emissao_nfe?: boolean
}

export interface ResultadoDevolucao {
  sucesso: boolean
  venda_devolucao_id: string
  numero_devolucao: number
  valor_total: number
  vale_troca?: ValeTroca
  movimento_financeiro_id?: string
  titulos_abatidos_count?: number
  status?: string
}

/**
 * Gera um código único legível para o Vale-Troca (ex: VT-9482-K3X)
 */
export function gerarCodigoValeTroca(): string {
  const aleat = Math.random().toString(36).substring(2, 6).toUpperCase()
  const timestamp = Date.now().toString().slice(-4)
  return `VT-${timestamp}-${aleat}`
}

/**
 * Valida se um vale-troca está ativo, com saldo e dentro da validade
 */
export async function consultarValeTroca(
  empresaId: string,
  codigo: string,
): Promise<ValeTroca | null> {
  if (!empresaId || !codigo) return null
  const codLimpo = codigo.trim().toUpperCase()
  try {
    const res = await pb.collection('vales_troca').getList<ValeTroca>(1, 1, {
      filter: `empresa_id = '${empresaId}' && codigo = '${codLimpo}' && ativo = true`,
      expand: 'cliente_id,venda_origem_id',
    })
    if (res.items.length === 0) return null
    const vale = res.items[0]

    // Verifica se expirou
    if (vale.validade && vale.status === 'Ativo') {
      const hoje = new Date().toISOString().slice(0, 10)
      if (vale.validade < hoje) {
        await pb.collection('vales_troca').update(vale.id, { status: 'Expirado' })
        vale.status = 'Expirado'
      }
    }

    return vale
  } catch {
    return null
  }
}

/**
 * Abate saldo de um vale-troca no momento da venda/PDV
 */
export async function abaterSaldoValeTroca(params: {
  valeId: string
  valorAbater: number
}): Promise<{ sucesso: boolean; novoSaldo: number }> {
  const { valeId, valorAbater } = params
  const vale = await pb.collection('vales_troca').getOne<ValeTroca>(valeId)
  if (!vale || vale.status !== 'Ativo') {
    throw new Error('Vale-troca não disponível para uso.')
  }
  const saldoAtual = Number(vale.saldo) || 0
  if (valorAbater > saldoAtual + 0.009) {
    throw new Error(
      `Saldo do vale insuficiente (Saldo: R$ ${saldoAtual.toFixed(2)} / Solicitado: R$ ${valorAbater.toFixed(2)}).`,
    )
  }
  const novoSaldo = Math.max(0, Number((saldoAtual - valorAbater).toFixed(2)))
  const novoStatus = novoSaldo <= 0.009 ? 'Usado' : 'Ativo'

  await pb.collection('vales_troca').update(valeId, {
    saldo: novoSaldo,
    status: novoStatus,
  })

  return { sucesso: true, novoSaldo }
}

/**
 * Processa a Troca/Devolução de forma atômica seguindo os requisitos do ERP:
 * 1. Valida itens e limites (até a quantidade vendida menos a já devolvida)
 * 2. Atualiza quantidade_devolvida em vendas_itens original
 * 3. Entrada no estoque com origem DEVOLUCAO_VENDA pelo custo_unitario da venda original
 * 4. Destino do valor:
 *    - Vale-troca: cria registro em vales_troca
 *    - Dinheiro de volta: saída avulsa (/financeiro/bancos/avulso) na conta 2.2.05 Devoluções de vendas
 *    - Abater do crediário: baixa nos títulos em aberto da venda original
 * 5. Registra venda com NOVO tipo "Devolução", venda_origem_id = venda original, status "Finalizada"
 */
export async function processarDevolucao(
  input: ProcessarDevolucaoInput,
): Promise<ResultadoDevolucao> {
  const { empresa_id, venda_origem_id, itens, destino, observacao } = input

  if (!itens || itens.length === 0) {
    throw new Error('Selecione ao menos um item para devolução.')
  }

  // 1. Carregar venda original completa
  const vendaOrigComp = await obterVendaCompleta(venda_origem_id)
  const vendaOrig = vendaOrigComp.venda
  const itensOrig = vendaOrigComp.itens

  if (!vendaOrig || vendaOrig.status !== 'Finalizada') {
    throw new Error('Apenas vendas finalizadas podem ser devolvidas.')
  }

  // 2. Validar cada item devolvido contra a venda original
  let valorTotalDevolucao = 0
  let custoTotalDevolucao = 0

  const mapaItensOrig = new Map<string, (typeof itensOrig)[0]>()
  itensOrig.forEach((it) => mapaItensOrig.set(it.id, it))

  const itensParaAtualizar: Array<{ id: string; novaQtdDevolvida: number }> = []

  for (const itemInput of itens) {
    const itemOrig = mapaItensOrig.get(itemInput.venda_item_id)
    if (!itemOrig) {
      throw new Error(`Item "${itemInput.descricao}" não pertence à venda original.`)
    }

    const qtdVendida = Number(itemOrig.quantidade) || 0
    const qtdJaDevolvida = Number(itemOrig.quantidade_devolvida) || 0
    const saldoDevolvivel = Math.max(0, qtdVendida - qtdJaDevolvida)

    if (itemInput.quantidade <= 0) {
      throw new Error(`Quantidade do item "${itemInput.descricao}" deve ser maior que zero.`)
    }

    if (itemInput.quantidade > saldoDevolvivel + 0.0001) {
      throw new Error(
        `Quantidade a devolver do item "${itemInput.descricao}" (${itemInput.quantidade}) supera a quantidade disponível (${saldoDevolvivel}).`,
      )
    }

    const precoEfetivo = Number(itemOrig.preco_unitario) || 0
    const descUnit =
      Number(itemOrig.desconto_valor) && qtdVendida > 0
        ? Number(itemOrig.desconto_valor) / qtdVendida
        : 0
    const valorUnitarioLiq = Math.max(0, precoEfetivo - descUnit)
    const valorItemDevolvido = Number((itemInput.quantidade * valorUnitarioLiq).toFixed(2))
    const custoUnitario = Number(itemOrig.custo_unitario) || 0

    valorTotalDevolucao += valorItemDevolvido
    custoTotalDevolucao += Number((itemInput.quantidade * custoUnitario).toFixed(2))

    itensParaAtualizar.push({
      id: itemOrig.id,
      novaQtdDevolvida: Number((qtdJaDevolvida + itemInput.quantidade).toFixed(4)),
    })
  }

  valorTotalDevolucao = Number(valorTotalDevolucao.toFixed(2))
  custoTotalDevolucao = Number(custoTotalDevolucao.toFixed(2))

  const dataHojeIso = new Date().toISOString().slice(0, 10)

  // 4. Criar registro de Venda do tipo "Devolução" (número atribuído pelo hook de numeração do backend)
  // Quando com_emissao_nfe for true, o status inicial é "Pendente de nota" e NÃO movimenta
  // estoque nem financeiro agora (espera a autorização da NF-e no backend).
  const authUserId = pb.authStore.record?.id || undefined
  const statusInicial = input.com_emissao_nfe ? 'Pendente de nota' : 'Finalizada'

  const novaVendaDevolucao = await pb.collection('vendas').create({
    empresa_id,
    tipo: 'Devolução',
    status: statusInicial,
    cliente_id: vendaOrig.cliente_id,
    cpf_cnpj_consumidor: vendaOrig.cpf_cnpj_consumidor,
    vendedor_id: vendaOrig.vendedor_id,
    operador_id: authUserId,
    data_emissao: dataHojeIso,
    data_finalizacao: input.com_emissao_nfe ? undefined : new Date().toISOString(),
    valor_produtos: valorTotalDevolucao,
    valor_desconto_itens: 0,
    valor_desconto_total: 0,
    valor_acrescimo: 0,
    valor_frete: 0,
    valor_total: valorTotalDevolucao,
    custo_total: custoTotalDevolucao,
    observacao:
      observacao ||
      `Devolução da Venda #${vendaOrig.numero}. Destino do valor: ${
        destino === 'vale_troca'
          ? 'Vale-troca'
          : destino === 'dinheiro_volta'
            ? 'Dinheiro de volta'
            : 'Abatimento de crediário'
      }.${input.com_emissao_nfe ? ' Aguardando autorização de NF-e.' : ''}`,
    venda_origem_id: vendaOrig.id,
    ativo: true,
  })

  // 5. Gravar os itens na tabela vendas_itens da venda de devolução
  for (let idx = 0; idx < itens.length; idx++) {
    const it = itens[idx]
    const itOrig = mapaItensOrig.get(it.venda_item_id)
    await pb.collection('vendas_itens').create({
      venda_id: novaVendaDevolucao.id,
      item: idx + 1,
      produto_id: it.produto_id,
      descricao: it.descricao,
      unidade: it.unidade || 'UN',
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
      valor_total: Number((it.quantidade * it.preco_unitario).toFixed(2)),
      custo_unitario: it.custo_unitario,
      lote_id: it.lote_id || itOrig?.lote_id || undefined,
      ativo: true,
    })
  }

  // Se a devolução for com NF-e, encerra aqui sem tocar estoque nem financeiro.
  // O endpoint /backend/v1/fiscal/confirmar-autorizacao-devolucao-venda atualizará
  // estoque, financeiro e quantidade_devolvida assim que a SEFAZ autorizar.
  const docNumero = Number(novaVendaDevolucao.numero || 0)

  if (input.com_emissao_nfe) {
    return {
      sucesso: true,
      venda_devolucao_id: novaVendaDevolucao.id,
      numero_devolucao: docNumero,
      valor_total: valorTotalDevolucao,
      status: 'Pendente de nota',
    }
  }

  // 6. Atualizar quantidade_devolvida nos itens da venda original (fluxo sem nota)
  for (const upd of itensParaAtualizar) {
    await pb.collection('vendas_itens').update(upd.id, {
      quantidade_devolvida: upd.novaQtdDevolvida,
    })
  }

  // 7. Movimentação de estoque: entrada com origem DEVOLUCAO_VENDA pelo custo_unitario da venda original
  const itensEstoque = itens.map((it) => ({
    empresa_id,
    produto_id: it.produto_id,
    tipo: 'Entrada' as const,
    origem: 'DEVOLUCAO_VENDA' as const,
    quantidade: it.quantidade,
    custo_unitario: it.custo_unitario,
    data_movimento: dataHojeIso,
    documento_tipo: 'Devolução de Venda',
    documento_id: novaVendaDevolucao.id,
    documento_numero: String(docNumero),
    motivo: `Devolução de Venda #${docNumero} (Ref. Venda #${vendaOrig.numero})`,
    lote_id: it.lote_id || undefined,
  }))

  await movimentarEstoque(itensEstoque)

  // 8. Processar Destino do Valor (fluxo sem nota)
  let valeCriado: ValeTroca | undefined
  let movFinanceiroId: string | undefined
  let titulosAbatidosCount = 0

  if (destino === 'vale_troca') {
    const validadeDias = input.dias_validade_vale || 30
    const dtValidade = new Date()
    dtValidade.setDate(dtValidade.getDate() + validadeDias)
    const validadeIso = dtValidade.toISOString().slice(0, 10)
    const codigoVale = gerarCodigoValeTroca()

    valeCriado = await pb.collection('vales_troca').create<ValeTroca>({
      empresa_id,
      codigo: codigoVale,
      cliente_id: vendaOrig.cliente_id || undefined,
      valor: valorTotalDevolucao,
      saldo: valorTotalDevolucao,
      validade: validadeIso,
      venda_origem_id: vendaOrig.id,
      status: 'Ativo',
      observacao: `Gerado por Devolução #${docNumero} (Venda #${vendaOrig.numero})`,
      ativo: true,
    })
  } else if (destino === 'dinheiro_volta') {
    // Buscar conta analítica 2.2.05 Devoluções de vendas
    let planoDevolucaoId = ''
    try {
      const contaRec = await pb
        .collection('plano_contas')
        .getFirstListItem("codigo = '2.2.05' && ativo = true")
      planoDevolucaoId = contaRec.id
    } catch {
      // Fallback para qualquer conta de dedução ou analítica de despesa
      const contaRec = await pb
        .collection('plano_contas')
        .getFirstListItem("grupo_dre = 'Deduções da receita' && ativo = true")
      planoDevolucaoId = contaRec.id
    }

    // Conta financeira para saída
    let contaFinId = input.conta_financeira_id
    if (!contaFinId) {
      const cfs = await pb.collection('contas_financeiras').getList(1, 1, {
        filter: `empresa_id = '${empresa_id}' && ativo = true`,
        sort: '-saldo_atual',
      })
      if (cfs.items.length > 0) contaFinId = cfs.items[0].id
    }

    if (!contaFinId) {
      throw new Error('Conta financeira para saída de dinheiro não configurada.')
    }

    const resAvulso = await lancarAvulso({
      empresa_id,
      conta_financeira_id: contaFinId,
      data: dataHojeIso,
      tipo: 'Saída',
      valor: valorTotalDevolucao,
      plano_conta_id: planoDevolucaoId,
      historico: `Devolução em dinheiro - Venda #${vendaOrig.numero} (Devolução #${docNumero})`,
    })

    movFinanceiroId = resAvulso.movimento.id
  } else if (destino === 'abater_crediario') {
    // Buscar títulos em aberto da venda original
    const titulosOriginais = await pb.collection('contas_receber').getFullList({
      filter: `empresa_id = '${empresa_id}' && origem_id = '${vendaOrig.id}' && (status = 'Aberto' || status = 'Parcial') && ativo = true`,
      sort: 'data_vencimento',
    })

    if (titulosOriginais.length === 0) {
      throw new Error('Não há títulos em aberto da venda original para abater.')
    }

    // Buscar plano analítico de desconto ou devolução
    let planoDescontoId = ''
    try {
      const cDesc = await pb
        .collection('plano_contas')
        .getFirstListItem("codigo = '2.2.05' || codigo = '2.6.03' && ativo = true")
      planoDescontoId = cDesc.id
    } catch {
      //
    }

    let saldoParaAbater = valorTotalDevolucao
    const baixasParaProcessar = []

    for (const tit of titulosOriginais) {
      if (saldoParaAbater <= 0.009) break
      const saldoTit = Number(tit.saldo) || 0
      if (saldoTit <= 0) continue

      const valorAbateItem = Math.min(saldoParaAbater, saldoTit)
      saldoParaAbater = Number((saldoParaAbater - valorAbateItem).toFixed(2))

      baixasParaProcessar.push({
        conta_receber_id: tit.id,
        valor_pago: 0,
        acrescimo: 0,
        desconto: valorAbateItem,
        plano_desconto_id: planoDescontoId || undefined,
      })
    }

    if (baixasParaProcessar.length > 0) {
      // Obter conta financeira da empresa (para registrar baixa com desconto)
      const cfs = await pb.collection('contas_financeiras').getList(1, 1, {
        filter: `empresa_id = '${empresa_id}' && ativo = true`,
      })
      const contaFinId = cfs.items[0]?.id || ''

      const formas = await pb.collection('formas_pagamento').getList(1, 1, {
        filter: `ativo = true && (codigo_tpag = '99' || tipo = 'Crédito loja' || codigo_tpag = '05')`,
      })
      const formaPagId = formas.items[0]?.id || ''

      await receberTitulos({
        empresa_id,
        conta_financeira_id: contaFinId,
        forma_pagamento_id: formaPagId,
        data_pagamento: dataHojeIso,
        titulos: baixasParaProcessar,
        observacao: `Abatimento por Devolução #${docNumero} (Venda #${vendaOrig.numero})`,
        plano_desconto_id: planoDescontoId,
      })

      titulosAbatidosCount = baixasParaProcessar.length
    }
  }

  return {
    sucesso: true,
    venda_devolucao_id: novaVendaDevolucao.id,
    numero_devolucao: docNumero,
    valor_total: valorTotalDevolucao,
    vale_troca: valeCriado,
    movimento_financeiro_id: movFinanceiroId,
    titulos_abatidos_count: titulosAbatidosCount,
  }
}

/**
 * Lista vales-troca de uma empresa com filtros opcionais
 */
export async function listarValesTroca(params: {
  empresaId: string
  status?: string
  clienteId?: string
  termoBusca?: string
  page?: number
  perPage?: number
}) {
  const conds = [`empresa_id = '${params.empresaId}'`, 'ativo = true']
  if (params.status && params.status !== 'todos') {
    conds.push(`status = '${params.status}'`)
  }
  if (params.clienteId) {
    conds.push(`cliente_id = '${params.clienteId}'`)
  }
  if (params.termoBusca) {
    const t = params.termoBusca.replace(/'/g, "\\'")
    conds.push(`codigo ~ '${t}'`)
  }

  const res = await pb
    .collection('vales_troca')
    .getList<ValeTroca>(params.page || 1, params.perPage || 30, {
      filter: conds.join(' && '),
      sort: '-created',
      expand: 'cliente_id,venda_origem_id',
    })

  return res
}
