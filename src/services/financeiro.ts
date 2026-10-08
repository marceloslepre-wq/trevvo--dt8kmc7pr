/**
 * Serviço Central do Financeiro (Contas a Pagar e Movimentações Financeiras)
 *
 * Responsável por:
 * - Listar e consultar títulos a pagar
 * - Criar e salvar títulos a pagar (manuais e recorrentes)
 * - Calcular encargos (multa, juros por dia com carência e descontos) usando config_financeira_empresa
 * - Baixar pagamentos via hook transacional /financeiro/pagar/baixar (atualiza saldo_atual da conta_financeira)
 * - Estornar baixas de pagamento via hook transacional /financeiro/pagar/estornar-baixa
 * - Cancelar títulos a pagar (bloqueia se tiver baixas ativas ou se a origem for 'NF Entrada')
 * - Buscar comprovante do lote de pagamento
 * - Resumo financeiro por fornecedor (últimos 12 meses)
 */

import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'

// ==========================================
// TIPOS E INTERFACES
// ==========================================

export type StatusContaPagar = 'Em aberto' | 'Pago parcial' | 'Pago' | 'Cancelado'
export type OrigemContaPagar = 'Manual' | 'NF Entrada' | 'Recorrência' | 'Outro'

export interface ContaPagar {
  id: string
  empresa_id: string
  fornecedor_id: string
  numero_documento: string
  parcela: string
  descricao: string
  data_emissao: string
  data_competencia: string
  data_vencimento: string
  plano_conta_id: string
  centro_custo_id?: string
  forma_pagamento_prevista_id?: string
  codigo_barras?: string
  valor_original: number
  valor_pago: number
  saldo: number
  status: StatusContaPagar
  origem: OrigemContaPagar
  origem_id?: string
  nota_entrada_parcela_id?: string
  recorrencia_id?: string
  recorrencia_numero?: number
  recorrencia_total?: number
  data_pagamento?: string
  anexo?: string
  observacao?: string
  motivo_cancelamento?: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string

  // Expansões comuns
  expand?: {
    empresa_id?: { id: string; razao_social: string; nome_fantasia?: string }
    fornecedor_id?: {
      id: string
      razao_social: string
      nome_fantasia?: string
      cpf_cnpj?: string
      tipo_pessoa?: string
    }
    plano_conta_id?: { id: string; codigo: string; descricao: string; tipo: string }
    centro_custo_id?: { id: string; codigo: string; descricao: string }
    forma_pagamento_prevista_id?: { id: string; codigo_tpag: string; descricao: string }
  }
}

export interface PagamentoLote {
  id: string
  empresa_id: string
  data_pagamento: string
  conta_financeira_id: string
  forma_pagamento_id?: string
  valor_total: number
  total_titulos?: number
  observacao?: string
  ativo: boolean
  created?: string
  expand?: {
    conta_financeira_id?: { id: string; nome: string; banco_nome?: string }
    forma_pagamento_id?: { id: string; codigo_tpag: string; descricao: string }
  }
}

export interface PagamentoBaixa {
  id: string
  empresa_id: string
  conta_pagar_id?: string
  conta_receber_id?: string
  lote_baixa_id?: string
  data_pagamento: string
  conta_financeira_id: string
  forma_pagamento_id?: string
  valor_original: number
  valor_pago: number
  valor_principal?: number
  valor_multa?: number
  valor_juros?: number
  valor_desconto?: number
  valor_total_pago: number
  valor_total?: number
  data_baixa?: string
  acrescimo?: number
  desconto?: number
  estornado: boolean
  data_estorno?: string
  motivo_estorno?: string
  usuario_estorno_id?: string
  observacao?: string
  ativo: boolean
  created?: string
  expand?: {
    conta_financeira_id?: { id: string; nome: string }
    forma_pagamento_id?: { id: string; descricao: string }
    usuario_estorno_id?: { id: string; name?: string; email?: string }
    lote_baixa_id?: PagamentoLote
  }
}

export interface MovimentacaoFinanceira {
  id: string
  empresa_id: string
  conta_financeira_id: string
  data_movimento: string
  tipo: 'Entrada' | 'Saída'
  origem: string
  valor: number
  saldo_anterior: number
  saldo_posterior: number
  documento_tipo?: string
  documento_id?: string
  documento_numero?: string
  lote_baixa_id?: string
  historico: string
  estornado: boolean
  ativo: boolean
  created?: string
}

export interface ListarContasPagarParams {
  empresaId: string
  periodoInicio?: string // data vencimento
  periodoFim?: string // data vencimento
  situacao?: 'abertos' | 'vencidos' | 'pagos' | 'cancelados' | 'todos'
  fornecedorId?: string
  planoContaId?: string
  centroCustoId?: string
  origem?: string
  busca?: string // doc ou descrição
  page?: number
  perPage?: number
  ordenacao?: string
}

export interface ResultadoPaginadoContasPagar {
  items: ContaPagar[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
  totais: {
    valorOriginal: number
    valorPago: number
    saldo: number
    totalOriginal?: number
    totalRecebido?: number
    totalSaldo?: number
    totalVencido?: number
  }
}

// ==========================================
// CÁLCULO DE ENCARGOS
// ==========================================

export interface EncargosCalculados {
  diasAtraso: number
  diasCobranca: number
  multaPercentual: number
  valorMulta: number
  jurosMensalPercentual: number
  jurosDiarioPercentual: number
  valorJuros: number
  valorTotalSugerido: number
}

/**
 * Calcula encargos de atraso com base na data de vencimento, data do pagamento
 * e configurações da empresa (multa_atraso_percentual, juros_mora_mensal_percentual, dias_carencia).
 *
 * Regras:
 * - Multa cobrada uma única vez após o vencimento (se diasAtraso > dias_carencia)
 * - Juros mora proporcional ao dia: jurosMensal ÷ 30 × diasAtraso (se diasAtraso > dias_carencia)
 */
export function calcularEncargos(params: {
  saldo: number
  dataVencimento: string
  dataPagamento: string
  multaPercentual?: number
  jurosMensalPercentual?: number
  diasCarencia?: number
}): EncargosCalculados {
  const saldo = Math.max(0, params.saldo)
  const dtVenc = new Date(params.dataVencimento.slice(0, 10) + 'T00:00:00')
  const dtPag = new Date(params.dataPagamento.slice(0, 10) + 'T00:00:00')

  const diffMs = dtPag.getTime() - dtVenc.getTime()
  const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  const carencia = params.diasCarencia || 0

  let valorMulta = 0
  let valorJuros = 0
  const multaPerc = params.multaPercentual || 0
  const jurosMensalPerc = params.jurosMensalPercentual || 0
  const jurosDiarioPerc = jurosMensalPerc / 30

  if (diasAtraso > carencia && saldo > 0) {
    if (multaPerc > 0) {
      valorMulta = Number(((saldo * multaPerc) / 100).toFixed(2))
    }
    if (jurosMensalPerc > 0) {
      // Juros simples diário sobre o saldo
      valorJuros = Number((saldo * (jurosDiarioPerc / 100) * diasAtraso).toFixed(2))
    }
  }

  const valorTotalSugerido = Number((saldo + valorMulta + valorJuros).toFixed(2))

  return {
    diasAtraso,
    diasCobranca: diasAtraso > carencia ? diasAtraso : 0,
    multaPercentual: multaPerc,
    valorMulta,
    jurosMensalPercentual: jurosMensalPerc,
    jurosDiarioPercentual: Number(jurosDiarioPerc.toFixed(4)),
    valorJuros,
    valorTotalSugerido,
  }
}

// ==========================================
// CONSULTAS E LISTAGEM
// ==========================================

export async function listarContasPagar(
  params: ListarContasPagarParams,
): Promise<ResultadoPaginadoContasPagar> {
  const page = params.page || 1
  const perPage = params.perPage || 30
  const condicoes: string[] = [`empresa_id = '${params.empresaId}'`, 'ativo = true']
  const hojeStr = new Date().toISOString().slice(0, 10)

  // Filtro de vencimento
  if (params.periodoInicio) {
    condicoes.push(`data_vencimento >= '${params.periodoInicio}'`)
  }
  if (params.periodoFim) {
    condicoes.push(`data_vencimento <= '${params.periodoFim}'`)
  }

  // Situação
  if (params.situacao === 'abertos') {
    condicoes.push(
      `(status = 'Em aberto' || status = 'Pago parcial') && data_vencimento >= '${hojeStr}'`,
    )
  } else if (params.situacao === 'vencidos') {
    condicoes.push(
      `(status = 'Em aberto' || status = 'Pago parcial') && data_vencimento < '${hojeStr}'`,
    )
  } else if (params.situacao === 'pagos') {
    condicoes.push(`status = 'Pago'`)
  } else if (params.situacao === 'cancelados') {
    condicoes.push(`status = 'Cancelado'`)
  } // 'todos' não restringe status

  // Fornecedor
  if (params.fornecedorId) {
    condicoes.push(`fornecedor_id = '${params.fornecedorId}'`)
  }

  // Plano de contas
  if (params.planoContaId) {
    condicoes.push(`plano_conta_id = '${params.planoContaId}'`)
  }

  // Centro de custo
  if (params.centroCustoId) {
    condicoes.push(`centro_custo_id = '${params.centroCustoId}'`)
  }

  // Origem
  if (params.origem) {
    condicoes.push(`origem = '${params.origem}'`)
  }

  // Busca textual por documento ou descrição
  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(numero_documento ~ '${b}' || descricao ~ '${b}')`)
  }

  const filter = condicoes.join(' && ')
  const sort = params.ordenacao || 'data_vencimento,numero_documento'

  const res = await pb.collection('contas_pagar').getList<ContaPagar>(page, perPage, {
    filter,
    sort,
    expand: 'fornecedor_id,plano_conta_id,centro_custo_id,forma_pagamento_prevista_id',
  })

  // Para os totais gerais do filtro (não só da página), buscamos com getFullList leve
  // ou somamos da página se totalPages for 1
  let totalOriginal = 0
  let totalPago = 0
  let totalSaldo = 0

  if (res.totalItems <= perPage) {
    res.items.forEach((item) => {
      totalOriginal += item.valor_original || 0
      totalPago += item.valor_pago || 0
      totalSaldo += item.saldo || 0
    })
  } else {
    // Busca resumida para cálculo dos totais
    try {
      const todosFiltro = await pb.collection('contas_pagar').getFullList<ContaPagar>({
        filter,
        fields: 'valor_original,valor_pago,saldo',
      })
      todosFiltro.forEach((item) => {
        totalOriginal += item.valor_original || 0
        totalPago += item.valor_pago || 0
        totalSaldo += item.saldo || 0
      })
    } catch {
      res.items.forEach((item) => {
        totalOriginal += item.valor_original || 0
        totalPago += item.valor_pago || 0
        totalSaldo += item.saldo || 0
      })
    }
  }

  return {
    items: res.items,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
    page: res.page,
    perPage: res.perPage,
    totais: {
      valorOriginal: Number(totalOriginal.toFixed(2)),
      valorPago: Number(totalPago.toFixed(2)),
      saldo: Number(totalSaldo.toFixed(2)),
    },
  }
}

export async function obterContaPagarPorId(id: string): Promise<ContaPagar> {
  return await pb.collection('contas_pagar').getOne<ContaPagar>(id, {
    expand: 'empresa_id,fornecedor_id,plano_conta_id,centro_custo_id,forma_pagamento_prevista_id',
  })
}

export async function listarBaixasDoTitulo(contaPagarId: string): Promise<PagamentoBaixa[]> {
  return await pb.collection('pagamentos_baixas').getFullList<PagamentoBaixa>({
    filter: `conta_pagar_id = '${contaPagarId}' && ativo = true`,
    sort: '-created',
    expand: 'conta_financeira_id,forma_pagamento_id,usuario_estorno_id,lote_baixa_id',
  })
}

// ==========================================
// OPERAÇÃO CENTRAL: BAIXA (via Hook Backend)
// ==========================================

export interface ItemBaixaInput {
  conta_pagar_id: string
  valor_pago: number
  valor_multa?: number
  valor_juros?: number
  valor_desconto?: number
  observacao?: string
}

export interface BaixarPagamentoParams {
  empresa_id: string
  conta_financeira_id: string
  forma_pagamento_id?: string
  data_pagamento: string
  observacao?: string
  itens: ItemBaixaInput[]
}

export interface ResultadoBaixaItem {
  baixa_id: string
  conta_pagar_id: string
  numero_documento: string
  descricao: string
  valor_original: number
  valor_pago: number
  valor_multa: number
  valor_juros: number
  valor_desconto: number
  valor_total_pago: number
  saldo_restante: number
  status_novo: StatusContaPagar
}

export interface RespostaBaixarPagamento {
  sucesso: boolean
  message: string
  lote_baixa_id: string
  valor_total: number
  total_titulos: number
  baixas: ResultadoBaixaItem[]
}

/**
 * Baixa de pagamento usando o serviço central financeiro (transacional em pb_hooks).
 * Atualiza saldo_atual da conta_financeira e o kardex movimentacoes_financeiras.
 */
export async function baixar(params: BaixarPagamentoParams): Promise<RespostaBaixarPagamento> {
  const res = await pb.send<RespostaBaixarPagamento>('/financeiro/pagar/baixar', {
    method: 'POST',
    body: params,
  })
  return res
}

// ==========================================
// OPERAÇÃO CENTRAL: ESTORNO (via Hook Backend)
// ==========================================

export interface RespostaEstornoBaixa {
  sucesso: boolean
  message: string
  estorno: {
    baixa_id: string
    conta_pagar_id: string
    novo_saldo: number
    novo_status: StatusContaPagar
    valor_estornado: number
  }
}

/**
 * Estorna uma baixa de pagamento usando o serviço central financeiro (transacional em pb_hooks).
 * Restaura o saldo do título, devolve o saldo na conta_financeira e grava movimentação de estorno.
 */
export async function estornarBaixa(
  baixaId: string,
  motivo: string,
): Promise<RespostaEstornoBaixa> {
  const res = await pb.send<RespostaEstornoBaixa>('/financeiro/pagar/estornar-baixa', {
    method: 'POST',
    body: {
      baixa_id: baixaId,
      motivo,
    },
  })
  return res
}

// ==========================================
// CRIAÇÃO E EDIÇÃO MANUAL DE TÍTULOS
// ==========================================

export interface SalvarTituloPagarInput {
  id?: string
  empresa_id: string
  fornecedor_id: string
  numero_documento: string
  parcela?: string
  descricao: string
  data_emissao: string
  data_competencia: string
  data_vencimento: string
  plano_conta_id: string
  centro_custo_id?: string
  forma_pagamento_prevista_id?: string
  codigo_barras?: string
  valor_original: number
  anexo?: File | null
  observacao?: string

  // Recorrência
  repetir_meses?: number // se informado > 1, cria múltiplos títulos
}

/**
 * Calcula a data somando N meses mantendo o mesmo dia ou último dia válido do mês
 */
export function somarMesesPreservandoDia(dataIso: string, meses: number): string {
  const parts = dataIso.slice(0, 10).split('-')
  const ano = parseInt(parts[0], 10)
  const mes = parseInt(parts[1], 10) - 1
  const diaDesejado = parseInt(parts[2], 10)

  const novaData = new Date(Date.UTC(ano, mes + meses, 1))
  const anoFinal = novaData.getUTCFullYear()
  const mesFinal = novaData.getUTCMonth()

  // Quantidade de dias no mês final
  const diasNoMes = new Date(Date.UTC(anoFinal, mesFinal + 1, 0)).getUTCDate()
  const diaFinal = Math.min(diaDesejado, diasNoMes)

  return new Date(Date.UTC(anoFinal, mesFinal, diaFinal)).toISOString().slice(0, 10)
}

/**
 * Criação de um ou mais títulos a pagar
 */
export async function criarTituloPagar(input: SalvarTituloPagarInput): Promise<ContaPagar[]> {
  const user = pb.authStore.record
  const meses = Math.max(1, input.repetir_meses || 1)
  const titulosCriados: ContaPagar[] = []

  const recorrenciaId =
    meses > 1 ? `REC_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : undefined

  for (let m = 0; m < meses; m++) {
    const vencimento =
      m === 0 ? input.data_vencimento : somarMesesPreservandoDia(input.data_vencimento, m)
    const competencia =
      m === 0 ? input.data_competencia : somarMesesPreservandoDia(input.data_competencia, m)
    const parcelaStr = meses > 1 ? `${m + 1}/${meses}` : input.parcela || '1/1'

    const payload: Record<string, unknown> = {
      empresa_id: input.empresa_id,
      fornecedor_id: input.fornecedor_id,
      numero_documento: input.numero_documento,
      parcela: parcelaStr,
      descricao: input.descricao,
      data_emissao: input.data_emissao,
      data_competencia: competencia,
      data_vencimento: vencimento,
      plano_conta_id: input.plano_conta_id,
      centro_custo_id: input.centro_custo_id || null,
      forma_pagamento_prevista_id: input.forma_pagamento_prevista_id || null,
      codigo_barras: input.codigo_barras || '',
      valor_original: input.valor_original,
      valor_pago: 0,
      saldo: input.valor_original,
      status: 'Em aberto',
      origem: meses > 1 ? 'Recorrência' : 'Manual',
      recorrencia_id: recorrenciaId || null,
      recorrencia_numero: meses > 1 ? m + 1 : null,
      recorrencia_total: meses > 1 ? meses : null,
      observacao: input.observacao || '',
      ativo: true,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    }

    if (input.anexo && m === 0) {
      payload.anexo = input.anexo
    }

    const criado = await pb.collection('contas_pagar').create<ContaPagar>(payload)
    titulosCriados.push(criado)

    await registrarAuditoria({
      tabela: 'contas_pagar',
      registro_id: criado.id,
      acao: 'inclusao',
      valores_depois: {
        numero_documento: criado.numero_documento,
        parcela: criado.parcela,
        descricao: criado.descricao,
        valor_original: criado.valor_original,
        data_vencimento: criado.data_vencimento,
        origem: criado.origem,
        recorrencia_id: criado.recorrencia_id,
      },
    })
  }

  return titulosCriados
}

/**
 * Atualizar dados cadastrais de um título a pagar
 */
export async function atualizarTituloPagar(
  id: string,
  dados: Partial<ContaPagar>,
  opcoesRecorrencia?: { modo: 'so_este' | 'este_e_proximos' },
): Promise<ContaPagar> {
  const user = pb.authStore.record
  const antes = await obterContaPagarPorId(id)

  const camposPermitidos: (keyof ContaPagar)[] = [
    'fornecedor_id',
    'numero_documento',
    'parcela',
    'descricao',
    'data_emissao',
    'data_competencia',
    'data_vencimento',
    'plano_conta_id',
    'centro_custo_id',
    'forma_pagamento_prevista_id',
    'codigo_barras',
    'observacao',
  ]

  const payload: Record<string, unknown> = {
    updated_by: user?.id || null,
  }

  camposPermitidos.forEach((k) => {
    if (dados[k] !== undefined) {
      payload[k] = dados[k]
    }
  })

  // Se o valor original foi alterado e o título ainda está 100% em aberto
  if (dados.valor_original !== undefined && dados.valor_original > 0) {
    if (antes.valor_pago === 0 && antes.status === 'Em aberto') {
      payload.valor_original = dados.valor_original
      payload.saldo = dados.valor_original
    }
  }

  const atualizado = await pb.collection('contas_pagar').update<ContaPagar>(id, payload)

  await registrarAuditoria({
    tabela: 'contas_pagar',
    registro_id: id,
    acao: 'alteracao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  // Se foi escolhido aplicar para os próximos em aberto da mesma recorrência
  if (
    opcoesRecorrencia?.modo === 'este_e_proximos' &&
    antes.recorrencia_id &&
    antes.recorrencia_numero
  ) {
    const proximos = await pb.collection('contas_pagar').getFullList<ContaPagar>({
      filter: `recorrencia_id = '${antes.recorrencia_id}' && recorrencia_numero > ${antes.recorrencia_numero} && status = 'Em aberto' && ativo = true`,
    })

    for (const prox of proximos) {
      const payloadProx: Record<string, unknown> = {
        fornecedor_id: payload.fornecedor_id ?? prox.fornecedor_id,
        plano_conta_id: payload.plano_conta_id ?? prox.plano_conta_id,
        centro_custo_id: payload.centro_custo_id ?? prox.centro_custo_id,
        forma_pagamento_prevista_id:
          payload.forma_pagamento_prevista_id ?? prox.forma_pagamento_prevista_id,
        updated_by: user?.id || null,
      }
      if (payload.descricao) payloadProx.descricao = payload.descricao
      if (payload.valor_original && prox.valor_pago === 0) {
        payloadProx.valor_original = payload.valor_original
        payloadProx.saldo = payload.valor_original
      }
      await pb.collection('contas_pagar').update(prox.id, payloadProx)
    }
  }

  return atualizado
}

/**
 * Cancelar um título a pagar:
 * - Só pode se não tiver baixas ativas (estornadas não contam)
 * - Títulos gerados por "NF Entrada" NÃO podem ser cancelados aqui (deve cancelar a nota)
 */
export async function cancelarTituloPagar(id: string, motivo: string): Promise<ContaPagar> {
  const user = pb.authStore.record
  const titulo = await obterContaPagarPorId(id)

  if (titulo.origem === 'NF Entrada') {
    throw new Error(
      'Este título foi gerado pelo lançamento de uma Nota Fiscal de Entrada. Para cancelá-lo, realize o cancelamento do lançamento da respectiva nota no módulo de Compras.',
    )
  }

  // Verifica se há baixas ativas (não estornadas)
  const baixas = await listarBaixasDoTitulo(id)
  const baixasAtivas = baixas.filter((b) => !b.estornado)
  if (baixasAtivas.length > 0) {
    throw new Error(
      `Não é possível cancelar um título que possui ${baixasAtivas.length} pagamento(s) ativo(s). Estorne os pagamentos antes de cancelar.`,
    )
  }

  const antes = { ...titulo }
  const atualizado = await pb.collection('contas_pagar').update<ContaPagar>(id, {
    status: 'Cancelado',
    motivo_cancelamento: motivo.trim(),
    saldo: 0,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'contas_pagar',
    registro_id: id,
    acao: 'alteracao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: {
      status: 'Cancelado',
      motivo_cancelamento: motivo.trim(),
    },
  })

  return atualizado
}

// ==========================================
// RESUMO FINANCEIRO DO FORNECEDOR (Últimos 12 Meses)
// ==========================================

export interface ResumoFinanceiroFornecedor {
  abertos: {
    quantidade: number
    valorTotal: number
    titulos: ContaPagar[]
  }
  vencidos: {
    quantidade: number
    valorTotal: number
    titulos: ContaPagar[]
  }
  pagos: {
    quantidade: number
    valorTotal: number
    titulos: ContaPagar[]
  }
  totaisGerais: {
    quantidadeTotal: number
    valorOriginalTotal: number
    valorPagoTotal: number
    saldoTotal: number
  }
}

export async function obterResumoFinanceiroFornecedor(
  fornecedorId: string,
  empresaId?: string,
): Promise<ResumoFinanceiroFornecedor> {
  const hoje = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)

  // 12 meses atrás a partir do primeiro dia do mês
  const dozeMesesAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)
  const dataCorteStr = dozeMesesAtras.toISOString().slice(0, 10)

  const condicoes = [
    `fornecedor_id = '${fornecedorId}'`,
    'ativo = true',
    `status != 'Cancelado'`,
    `data_vencimento >= '${dataCorteStr}'`,
  ]
  if (empresaId) {
    condicoes.push(`empresa_id = '${empresaId}'`)
  }

  const titulos = await pb.collection('contas_pagar').getFullList<ContaPagar>({
    filter: condicoes.join(' && '),
    sort: 'data_vencimento',
    expand: 'plano_conta_id,forma_pagamento_prevista_id',
  })

  const abertos: ContaPagar[] = []
  const vencidos: ContaPagar[] = []
  const pagos: ContaPagar[] = []

  let valorOriginalTotal = 0
  let valorPagoTotal = 0
  let saldoTotal = 0

  titulos.forEach((t) => {
    valorOriginalTotal += t.valor_original || 0
    valorPagoTotal += t.valor_pago || 0
    saldoTotal += t.saldo || 0

    if (t.status === 'Pago') {
      pagos.push(t)
    } else {
      if (t.data_vencimento < hojeStr) {
        vencidos.push(t)
      } else {
        abertos.push(t)
      }
    }
  })

  return {
    abertos: {
      quantidade: abertos.length,
      valorTotal: Number(abertos.reduce((acc, t) => acc + (t.saldo || 0), 0).toFixed(2)),
      titulos: abertos,
    },
    vencidos: {
      quantidade: vencidos.length,
      valorTotal: Number(vencidos.reduce((acc, t) => acc + (t.saldo || 0), 0).toFixed(2)),
      titulos: vencidos,
    },
    pagos: {
      quantidade: pagos.length,
      valorTotal: Number(pagos.reduce((acc, t) => acc + (t.valor_pago || 0), 0).toFixed(2)),
      titulos: pagos,
    },
    totaisGerais: {
      quantidadeTotal: titulos.length,
      valorOriginalTotal: Number(valorOriginalTotal.toFixed(2)),
      valorPagoTotal: Number(valorPagoTotal.toFixed(2)),
      saldoTotal: Number(saldoTotal.toFixed(2)),
    },
  }
}
