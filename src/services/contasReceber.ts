import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from './auditoria'
import { PlanoConta } from './planoContas'
import { CentroCusto } from './centrosCusto'
import { FormaPagamento } from './formasPagamento'
import { Cliente } from './clientes'
import { ConfigFinanceiraEmpresa, obterOuCriarConfigFinanceiraEmpresa } from './configFinanceira'
import { PagamentoLote, PagamentoBaixa, EncargosCalculados, calcularEncargos } from './financeiro'

export type StatusContaReceber =
  | 'Em aberto'
  | 'Recebido parcial'
  | 'Recebido'
  | 'Cancelado'
  | 'Aberto'
  | 'Parcial'
export type OrigemContaReceber = 'Manual' | 'Venda' | 'Recorrência' | 'Outro'

export interface ContaReceber {
  id: string
  empresa_id: string
  cliente_id: string
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
  valor_recebido?: number
  saldo: number
  status: StatusContaReceber
  origem: OrigemContaReceber
  origem_id?: string
  venda_parcela_id?: string
  recorrencia_id?: string
  recorrencia_numero?: number
  recorrencia_total?: number
  data_recebimento?: string
  anexo?: string
  observacao?: string
  motivo_cancelamento?: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    cliente_id?: Cliente
    plano_conta_id?: PlanoConta
    centro_custo_id?: CentroCusto
    forma_pagamento_prevista_id?: FormaPagamento
  }
}

export interface ListarContasReceberParams {
  empresa_id?: string
  empresaId?: string
  pagina?: number
  page?: number
  por_pagina?: number
  perPage?: number
  busca?: string
  cliente_id?: string
  clienteId?: string
  plano_conta_id?: string
  planoContaId?: string
  centro_custo_id?: string
  centroCustoId?: string
  origem?: string
  situacao?: 'aberto' | 'abertos' | 'vencidos' | 'pagos' | 'cancelados' | 'todos'
  data_vencimento_inicio?: string
  periodoInicio?: string
  data_vencimento_fim?: string
  periodoFim?: string
  dias_atraso_min?: number
  diasAtrasoMinimo?: number
  ordenar_por?: string
  sort?: string
}

export interface ResultadoPaginadoContasReceber {
  items: ContaReceber[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
  totais: {
    totalOriginal: number
    totalRecebido: number
    totalSaldo: number
    totalVencido: number
    valorOriginal?: number
    valorRecebido?: number
    saldo?: number
  }
}

export interface SituacaoCreditoCliente {
  cliente_id: string
  total_aberto: number
  total_vencido: number
  maior_atraso_dias: number
  limite_credito: number | null
  credito_disponivel: number | null // null se ilimitado
  dias_tolerancia: number
  situacao: 'Liberado' | 'Atenção' | 'Bloqueado'
  motivos: string[]
  // Aliases camelCase para compatibilidade
  totalEmAberto?: number
  totalVencido?: number
  maiorAtrasoDias?: number
  limiteCredito?: number
  creditoDisponivel?: number
  motivo?: string
}

/**
 * Calcula a situação de crédito de um cliente específico com base nos títulos de contas a receber.
 * Regras:
 * - total em aberto: soma dos saldos de títulos com status 'Em aberto' ou 'Recebido parcial'
 * - total vencido: soma dos saldos com vencimento anterior a hoje
 * - maior atraso: maior diferença em dias entre hoje e o vencimento vencido
 * - limite_credito do cadastro do cliente (se <= 0 ou nulo, considera ilimitado)
 * - credito_disponivel: limite - total_aberto
 * - situacao:
 *   * "Bloqueado": se cliente.bloqueado manual OU atraso > dias_tolerancia OU credito_disponivel < 0
 *   * "Atenção": se não bloqueado, mas tem atraso > 0 (até dias_tolerancia)
 *   * "Liberado": sem títulos vencidos e com limite ok
 */
export async function creditoCliente(
  clienteId: string,
  empresaId?: string,
): Promise<SituacaoCreditoCliente> {
  if (!clienteId) {
    throw new Error('ID do cliente é obrigatório para consultar crédito.')
  }

  // 1. Obter cadastro do cliente
  const cliente = await pb.collection('clientes').getOne<Cliente>(clienteId)
  const limiteCredito =
    cliente.limite_credito && Number(cliente.limite_credito) > 0
      ? Number(cliente.limite_credito)
      : null

  // 2. Obter tolerância da config financeira da empresa
  let diasTolerancia = 5
  if (empresaId) {
    try {
      const cfg = await obterOuCriarConfigFinanceiraEmpresa(empresaId)
      if (typeof cfg.dias_tolerancia_bloqueio === 'number') {
        diasTolerancia = cfg.dias_tolerancia_bloqueio
      }
    } catch {
      diasTolerancia = 5
    }
  }

  // 3. Buscar títulos ativos do cliente que não estão cancelados nem totalmente quitados
  let filter = `ativo = true && cliente_id = '${clienteId}' && status != 'Cancelado' && status != 'Recebido'`
  if (empresaId) {
    filter += ` && empresa_id = '${empresaId}'`
  }

  const titulos = await pb.collection('contas_receber').getFullList<ContaReceber>({
    filter,
    sort: 'data_vencimento',
  })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const hojeIso = hoje.toISOString().split('T')[0]

  let totalAberto = 0
  let totalVencido = 0
  let maiorAtrasoDias = 0

  for (const t of titulos) {
    const saldo = Number(t.saldo) || 0
    if (saldo <= 0) continue

    totalAberto += saldo

    const vcto = t.data_vencimento ? t.data_vencimento.split('T')[0] : ''
    if (vcto && vcto < hojeIso) {
      totalVencido += saldo
      const diffMs = hoje.getTime() - new Date(vcto + 'T00:00:00').getTime()
      const diffDias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
      if (diffDias > maiorAtrasoDias) {
        maiorAtrasoDias = diffDias
      }
    }
  }

  const creditoDisponivel = limiteCredito !== null ? limiteCredito - totalAberto : null

  const motivos: string[] = []
  let situacao: 'Liberado' | 'Atenção' | 'Bloqueado' = 'Liberado'

  if (cliente.bloqueado) {
    situacao = 'Bloqueado'
    motivos.push(
      cliente.motivo_bloqueio
        ? `Bloqueio cadastral: ${cliente.motivo_bloqueio}`
        : 'Cliente bloqueado no cadastro',
    )
  }

  if (maiorAtrasoDias > diasTolerancia) {
    situacao = 'Bloqueado'
    motivos.push(
      `Título(s) vencido(s) há ${maiorAtrasoDias} dias (tolerância da empresa: ${diasTolerancia} dias)`,
    )
  }

  if (limiteCredito !== null && creditoDisponivel !== null && creditoDisponivel < 0) {
    situacao = 'Bloqueado'
    motivos.push(
      `Limite de crédito excedido em R$ ${Math.abs(creditoDisponivel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    )
  }

  if (situacao !== 'Bloqueado' && maiorAtrasoDias > 0 && maiorAtrasoDias <= diasTolerancia) {
    situacao = 'Atenção'
    motivos.push(
      `Possui título(s) vencido(s) há ${maiorAtrasoDias} dias (dentro do período de tolerância de ${diasTolerancia} dias)`,
    )
  }

  return {
    cliente_id: clienteId,
    total_aberto: totalAberto,
    total_vencido: totalVencido,
    maior_atraso_dias: maiorAtrasoDias,
    limite_credito: limiteCredito,
    credito_disponivel: creditoDisponivel,
    dias_tolerancia: diasTolerancia,
    situacao,
    motivos,
    totalEmAberto: totalAberto,
    totalVencido: totalVencido,
    maiorAtrasoDias: maiorAtrasoDias,
    limiteCredito: limiteCredito || 0,
    creditoDisponivel: creditoDisponivel || 0,
    motivo: motivos.join('; '),
  }
}

/**
 * Listagem com filtros e paginação para Contas a Receber
 */
export async function listarContasReceber(
  params: ListarContasReceberParams,
): Promise<ResultadoPaginadoContasReceber> {
  const empresaId = params.empresa_id || params.empresaId || ''
  const pagina = params.pagina || params.page || 1
  const porPagina = params.por_pagina || params.perPage || 50
  const clienteId = params.cliente_id || params.clienteId
  const planoContaId = params.plano_conta_id || params.planoContaId
  const centroCustoId = params.centro_custo_id || params.centroCustoId
  const dtInicio = params.data_vencimento_inicio || params.periodoInicio
  const dtFim = params.data_vencimento_fim || params.periodoFim
  const minAtraso =
    params.dias_atraso_min !== undefined ? params.dias_atraso_min : params.diasAtrasoMinimo
  const ordenacao = params.ordenar_por || params.sort || 'data_vencimento'
  const situacao = params.situacao || 'todos'
  const busca = params.busca

  const hoje = new Date().toISOString().split('T')[0]
  const filtros: string[] = [`empresa_id = '${empresaId}'`, 'ativo = true']

  if (clienteId) filtros.push(`cliente_id = '${clienteId}'`)
  if (planoContaId) filtros.push(`plano_conta_id = '${planoContaId}'`)
  if (centroCustoId) filtros.push(`centro_custo_id = '${centroCustoId}'`)
  if (params.origem) filtros.push(`origem = '${params.origem}'`)

  if (busca && busca.trim()) {
    const b = busca.trim().replace(/['"\\]/g, '')
    filtros.push(`(numero_documento ~ '${b}' || descricao ~ '${b}' || codigo_barras ~ '${b}')`)
  }

  if (situacao === 'aberto' || situacao === 'abertos') {
    filtros.push(
      "(status = 'Em aberto' || status = 'Recebido parcial' || status = 'Aberto' || status = 'Parcial')",
    )
  } else if (situacao === 'vencidos') {
    filtros.push(
      `(status = 'Em aberto' || status = 'Recebido parcial' || status = 'Aberto' || status = 'Parcial') && data_vencimento < '${hoje}'`,
    )
  } else if (situacao === 'pagos') {
    filtros.push("(status = 'Recebido' || status = 'Pago')")
  } else if (situacao === 'cancelados') {
    filtros.push("status = 'Cancelado'")
  }

  if (dtInicio) {
    filtros.push(`data_vencimento >= '${dtInicio}'`)
  }
  if (dtFim) {
    filtros.push(`data_vencimento <= '${dtFim}'`)
  }

  const filterString = filtros.join(' && ')

  // Obter página com expand
  const resultado = await pb.collection('contas_receber').getList<ContaReceber>(pagina, porPagina, {
    filter: filterString,
    sort: ordenacao,
    expand: 'cliente_id,plano_conta_id,centro_custo_id,forma_pagamento_prevista_id',
  })

  // Se houver filtro por dias_atraso_min em memória:
  let items = resultado.items
  if (typeof minAtraso === 'number' && minAtraso > 0) {
    const hojeDate = new Date()
    hojeDate.setHours(0, 0, 0, 0)
    items = items.filter((t) => {
      if (
        t.status !== 'Em aberto' &&
        t.status !== 'Recebido parcial' &&
        t.status !== 'Aberto' &&
        t.status !== 'Parcial'
      )
        return false
      const vDate = new Date(t.data_vencimento + 'T00:00:00')
      const diffDias = Math.floor((hojeDate.getTime() - vDate.getTime()) / (1000 * 60 * 60 * 24))
      return diffDias >= minAtraso
    })
  }

  // Totais agregados
  const todosFiltrados = await pb.collection('contas_receber').getFullList<ContaReceber>({
    filter: filterString,
    fields: 'valor_original,valor_recebido,saldo,data_vencimento,status',
  })

  let totalOriginal = 0
  let totalRecebido = 0
  let totalSaldo = 0
  let totalVencido = 0

  for (const t of todosFiltrados) {
    totalOriginal += Number(t.valor_original) || 0
    totalRecebido += Number(t.valor_recebido) || 0
    const saldo = Number(t.saldo) || 0
    totalSaldo += saldo

    if (t.status !== 'Recebido' && t.status !== 'Cancelado' && t.data_vencimento < hoje) {
      totalVencido += saldo
    }
  }

  return {
    items,
    totalItems: resultado.totalItems,
    totalPages: resultado.totalPages,
    page: resultado.page,
    perPage: resultado.perPage,
    totais: {
      totalOriginal,
      totalRecebido,
      totalSaldo,
      totalVencido,
      valorOriginal: totalOriginal,
      valorRecebido: totalRecebido,
      saldo: totalSaldo,
    },
  }
}

export async function obterContaReceberPorId(id: string): Promise<ContaReceber> {
  return await pb.collection('contas_receber').getOne<ContaReceber>(id, {
    expand: 'cliente_id,plano_conta_id,centro_custo_id,forma_pagamento_prevista_id',
  })
}

/**
 * Salva ou atualiza um título a receber manual
 */
export async function salvarContaReceber(
  dados: Partial<ContaReceber> & { empresa_id: string; cliente_id: string; plano_conta_id: string },
): Promise<ContaReceber> {
  let antes: ContaReceber | null = null
  const ehEdicao = Boolean(dados.id)

  if (ehEdicao && dados.id) {
    antes = await pb.collection('contas_receber').getOne<ContaReceber>(dados.id)
  }

  const valorOriginal = Number(dados.valor_original) || 0
  const valorRecebido = Number(dados.valor_recebido) || 0
  const saldo = Math.max(0, valorOriginal - valorRecebido)

  let statusCalculado: StatusContaReceber = dados.status || 'Em aberto'
  if (saldo <= 0.0001 && valorOriginal > 0) {
    statusCalculado = 'Recebido'
  } else if (valorRecebido > 0 && saldo > 0.0001) {
    statusCalculado = 'Recebido parcial'
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    cliente_id: dados.cliente_id,
    numero_documento: dados.numero_documento || 'REC',
    parcela: dados.parcela || '1/1',
    descricao: dados.descricao || 'Recebimento',
    data_emissao: dados.data_emissao || new Date().toISOString().split('T')[0],
    data_competencia:
      dados.data_competencia || dados.data_emissao || new Date().toISOString().split('T')[0],
    data_vencimento: dados.data_vencimento || new Date().toISOString().split('T')[0],
    plano_conta_id: dados.plano_conta_id,
    centro_custo_id: dados.centro_custo_id || null,
    forma_pagamento_prevista_id: dados.forma_pagamento_prevista_id || null,
    codigo_barras: dados.codigo_barras || '',
    valor_original: valorOriginal,
    valor_recebido: valorRecebido,
    saldo: saldo,
    status: statusCalculado,
    origem: dados.origem || 'Manual',
    origem_id: dados.origem_id || null,
    venda_parcela_id: dados.venda_parcela_id || null,
    recorrencia_id: dados.recorrencia_id || null,
    recorrencia_numero: dados.recorrencia_numero || null,
    recorrencia_total: dados.recorrencia_total || null,
    data_recebimento: dados.data_recebimento || null,
    observacao: dados.observacao || '',
    ativo: dados.ativo !== undefined ? dados.ativo : true,
  }

  let gravado: ContaReceber
  if (ehEdicao && dados.id) {
    payload.updated_by = pb.authStore.record?.id || null
    gravado = await pb.collection('contas_receber').update<ContaReceber>(dados.id, payload)
    await registrarAuditoria({
      tabela: 'contas_receber',
      registro_id: gravado.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: gravado as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    gravado = await pb.collection('contas_receber').create<ContaReceber>(payload)
    await registrarAuditoria({
      tabela: 'contas_receber',
      registro_id: gravado.id,
      acao: 'inclusao',
      valores_depois: gravado as unknown as Record<string, unknown>,
    })
  }

  return await obterContaReceberPorId(gravado.id)
}

/**
 * Cria parcelas recorrentes mensais no Contas a Receber
 */
export interface CriarTitulosRecorrentesReceberInput {
  empresa_id: string
  cliente_id: string
  numero_documento?: string
  descricao: string
  plano_conta_id: string
  centro_custo_id?: string
  forma_pagamento_prevista_id?: string
  valor_original: number
  data_emissao?: string
  data_competencia_inicial?: string
  data_vencimento_inicial?: string
  data_vencimento?: string
  quantidade_meses: number
  observacao?: string
}

export interface AtualizarRecorrenciaReceberInput {
  recorrencia_id: string
  a_partir_de?: string
  recorrencia_numero_min?: number
  dados_atualizacao?: Partial<ContaReceber>
}

/**
 * Cria parcelas recorrentes mensais no Contas a Receber
 */
export async function criarTitulosRecorrentesReceber(
  inputOuBase: CriarTitulosRecorrentesReceberInput | any,
  qtdMesesParam?: number,
): Promise<ContaReceber[]> {
  const recorrenciaId = 'REC_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const criados: ContaReceber[] = []

  const quantidadeMeses = inputOuBase?.quantidade_meses || qtdMesesParam || 12

  const vencimentoBaseStr =
    inputOuBase.data_vencimento_inicial ||
    inputOuBase.data_vencimento ||
    inputOuBase.data_competencia_inicial ||
    new Date().toISOString().split('T')[0]

  const [anoStr, mesStr, diaStr] = vencimentoBaseStr.split('-')
  const diaBase = parseInt(diaStr, 10) || 1
  const mesBase = (parseInt(mesStr, 10) || 1) - 1
  const anoBase = parseInt(anoStr, 10) || new Date().getFullYear()

  for (let i = 0; i < quantidadeMeses; i++) {
    const dataAlvo = new Date(anoBase, mesBase + i, 1)
    const ultimoDiaDoMes = new Date(dataAlvo.getFullYear(), dataAlvo.getMonth() + 1, 0).getDate()
    const diaReal = Math.min(diaBase, ultimoDiaDoMes)
    const vencimentoMes = new Date(dataAlvo.getFullYear(), dataAlvo.getMonth(), diaReal)
    const vencimentoIso = vencimentoMes.toISOString().split('T')[0]

    const parcelaLabel = `${i + 1}/${quantidadeMeses}`

    const item = await salvarContaReceber({
      empresa_id: inputOuBase.empresa_id,
      cliente_id: inputOuBase.cliente_id,
      numero_documento: `${inputOuBase.numero_documento || 'REC'}-${i + 1}`,
      parcela: parcelaLabel,
      descricao: inputOuBase.descricao,
      plano_conta_id: inputOuBase.plano_conta_id,
      centro_custo_id: inputOuBase.centro_custo_id || null,
      forma_pagamento_prevista_id: inputOuBase.forma_pagamento_prevista_id || null,
      data_emissao: inputOuBase.data_emissao || new Date().toISOString().split('T')[0],
      data_vencimento: vencimentoIso,
      data_competencia: vencimentoIso,
      origem: 'Recorrência',
      recorrencia_id: recorrenciaId,
      recorrencia_numero: i + 1,
      recorrencia_total: quantidadeMeses,
      status: 'Em aberto',
      valor_original: inputOuBase.valor_original,
      valor_recebido: 0,
      saldo: inputOuBase.valor_original,
      observacao: inputOuBase.observacao || '',
    })
    criados.push(item)
  }

  return criados
}

/**
 * Atualiza parcelas futuras de uma recorrência no Contas a Receber
 */
export async function atualizarRecorrenciaReceber(
  recorrenciaIdOuObj: string | AtualizarRecorrenciaReceberInput,
  recorrenciaNumeroMin?: number,
  novosDados?: Partial<ContaReceber>,
): Promise<number> {
  let recId: string
  let numMin: number | undefined
  let aPartirDe: string | undefined
  let dados: Partial<ContaReceber>

  if (typeof recorrenciaIdOuObj === 'object') {
    recId = recorrenciaIdOuObj.recorrencia_id
    numMin = recorrenciaIdOuObj.recorrencia_numero_min
    aPartirDe = recorrenciaIdOuObj.a_partir_de
    dados = recorrenciaIdOuObj.dados_atualizacao || {}
  } else {
    recId = recorrenciaIdOuObj
    numMin = recorrenciaNumeroMin
    dados = novosDados || {}
  }

  let filter = `recorrencia_id = '${recId}' && status = 'Em aberto' && ativo = true`
  if (numMin !== undefined) {
    filter += ` && recorrencia_numero >= ${numMin}`
  } else if (aPartirDe) {
    filter += ` && data_vencimento >= '${aPartirDe}'`
  }

  const itens = await pb.collection('contas_receber').getFullList<ContaReceber>({
    filter,
  })

  let count = 0
  for (const item of itens) {
    const payload: Record<string, unknown> = {
      updated_by: pb.authStore.record?.id || null,
    }
    if (dados.cliente_id) payload.cliente_id = dados.cliente_id
    if (dados.descricao) payload.descricao = dados.descricao
    if (dados.plano_conta_id) payload.plano_conta_id = dados.plano_conta_id
    if (dados.centro_custo_id !== undefined) payload.centro_custo_id = dados.centro_custo_id
    if (dados.forma_pagamento_prevista_id !== undefined) {
      payload.forma_pagamento_prevista_id = dados.forma_pagamento_prevista_id
    }
    if (dados.valor_original !== undefined) {
      payload.valor_original = dados.valor_original
      payload.saldo = dados.valor_original
    }
    if (dados.observacao !== undefined) payload.observacao = dados.observacao

    await pb.collection('contas_receber').update(item.id, payload)
    count++
  }

  return count
}

/**
 * Cancela um título a receber (somente se não tiver baixas ativas)
 */
export async function cancelarContaReceber(id: string, motivo: string): Promise<ContaReceber> {
  if (!motivo || !motivo.trim()) {
    throw new Error('O motivo do cancelamento é obrigatório.')
  }

  const titulo = await obterContaReceberPorId(id)

  const baixasAtivas = await pb.collection('pagamentos_baixas').getList(1, 1, {
    filter: `conta_receber_id = '${id}' && estornado = false && ativo = true`,
  })

  if (baixasAtivas.totalItems > 0) {
    throw new Error(
      'Não é possível cancelar um título que possui recebimentos ativos. Estorne os recebimentos antes.',
    )
  }

  const alterado = await pb.collection('contas_receber').update<ContaReceber>(id, {
    status: 'Cancelado',
    motivo_cancelamento: motivo.trim(),
    saldo: 0,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'contas_receber',
    registro_id: id,
    acao: 'alteracao',
    valores_antes: titulo as unknown as Record<string, unknown>,
    valores_depois: alterado as unknown as Record<string, unknown>,
  })

  return alterado
}

/**
 * Exclusão lógica (ativo = false) de título a receber
 */
export async function inativarContaReceber(id: string): Promise<void> {
  const titulo = await obterContaReceberPorId(id)

  const baixasAtivas = await pb.collection('pagamentos_baixas').getList(1, 1, {
    filter: `conta_receber_id = '${id}' && estornado = false && ativo = true`,
  })
  if (baixasAtivas.totalItems > 0) {
    throw new Error('Não é possível excluir um título com baixas de recebimento ativas.')
  }

  await pb.collection('contas_receber').update(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'contas_receber',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: titulo as unknown as Record<string, unknown>,
  })
}

/**
 * Input para baixa de recebimento
 */
export interface ItemReceberInput {
  conta_receber_id: string
  valor_pago: number // valor principal amortizado
  valor_multa?: number
  valor_juros?: number
  valor_desconto?: number
  valor_total_pago?: number
  acrescimo?: number
  desconto?: number
}

export interface ReceberTitulosInput {
  empresa_id: string
  conta_financeira_id: string
  forma_pagamento_id?: string
  data_pagamento: string // data do recebimento
  itens?: ItemReceberInput[]
  titulos?: ItemReceberInput[]
  observacao?: string
}

export interface ResultadoRecebimento {
  lote: PagamentoLote
  baixas: PagamentoBaixa[]
}

/**
 * Chama endpoint de baixa centralizada de Contas a Receber
 */
export async function receberTitulos(dados: ReceberTitulosInput): Promise<ResultadoRecebimento> {
  // Chamada ao hook backend centralizado (/financeiro/receber/baixar)
  const listaTitulos = dados.titulos || dados.itens || []

  const payload = {
    empresa_id: dados.empresa_id,
    conta_financeira_id: dados.conta_financeira_id,
    forma_pagamento_id: dados.forma_pagamento_id,
    data_pagamento: dados.data_pagamento,
    titulos: listaTitulos.map((t) => ({
      conta_receber_id: t.conta_receber_id,
      valor_pago: t.valor_pago,
      acrescimo:
        t.acrescimo !== undefined
          ? t.acrescimo
          : Number(((t.valor_multa || 0) + (t.valor_juros || 0)).toFixed(2)),
      desconto: t.desconto !== undefined ? t.desconto : t.valor_desconto || 0,
    })),
    historico: dados.observacao,
  }

  const res = await pb.send<any>('/financeiro/receber/baixar', {
    method: 'POST',
    body: payload,
  })

  // Se o hook retornou o lote_id ou baixas
  let lote: any = null
  if (res?.lote_id) {
    try {
      lote = await pb.collection('pagamentos_lotes').getOne<PagamentoLote>(res.lote_id)
    } catch {
      lote = {
        id: res.lote_id,
        empresa_id: dados.empresa_id,
        conta_financeira_id: dados.conta_financeira_id,
        forma_pagamento_id: dados.forma_pagamento_id,
        data_pagamento: dados.data_pagamento,
        valor_total: res.total_recebido || 0,
        quantidade_titulos: listaTitulos.length,
        ativo: true,
        created: new Date().toISOString(),
      } as unknown as PagamentoLote
    }
  }

  const baixas: PagamentoBaixa[] = []
  if (Array.isArray(res?.baixas)) {
    for (const bId of res.baixas) {
      try {
        const bRec = await pb.collection('pagamentos_baixas').getOne<PagamentoBaixa>(bId)
        baixas.push(bRec)
      } catch {
        // ignora se falhar busca individual
      }
    }
  }

  return {
    lote: lote || ({} as PagamentoLote),
    baixas,
  }
}

/**
 * Chama endpoint de estorno centralizado de recebimento
 */
export async function estornarRecebimento(
  baixaId: string,
  motivoEstorno: string,
  empresaId?: string,
): Promise<{ success: boolean; baixa?: PagamentoBaixa; message?: string }> {
  let resolvedEmpresaId = empresaId
  if (!resolvedEmpresaId) {
    try {
      const bRec = await pb.collection('pagamentos_baixas').getOne<PagamentoBaixa>(baixaId)
      resolvedEmpresaId = bRec.empresa_id
    } catch {
      // fallback
    }
  }

  const res = await pb.send<any>('/financeiro/receber/estornar-recebimento', {
    method: 'POST',
    body: {
      empresa_id: resolvedEmpresaId,
      baixa_id: baixaId,
      motivo: motivoEstorno,
    },
  })

  let baixaAtualizada: PagamentoBaixa | undefined
  try {
    baixaAtualizada = await pb.collection('pagamentos_baixas').getOne<PagamentoBaixa>(baixaId)
  } catch {
    //
  }

  return {
    success: true,
    baixa: baixaAtualizada,
    message: 'Recebimento estornado com sucesso.',
  }
}

/**
 * Lista histórico de baixas de um título a receber
 */
export async function listarBaixasContaReceber(contaReceberId: string): Promise<PagamentoBaixa[]> {
  const resultado = await pb.collection('pagamentos_baixas').getFullList<PagamentoBaixa>({
    filter: `conta_receber_id = '${contaReceberId}' && ativo = true`,
    sort: '-created',
    expand: 'conta_financeira_id,forma_pagamento_id,lote_baixa_id,usuario_estorno_id',
  })
  return resultado
}

// Reexporta cálculo de encargos e tipos comuns
export { calcularEncargos }
export type { EncargosCalculados }
