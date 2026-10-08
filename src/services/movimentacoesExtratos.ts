/**
 * Serviço Central de Movimentações Bancárias, Extrato e Conciliação OFX
 *
 * Módulo: financeiro_bancos
 * Regras do projeto:
 * - Toda movimentação em contas_financeiras grava em movimentacoes_financeiras e atualiza saldo_atual
 * - Logs de auditoria em todas as operações
 * - Multiempresa (empresa_id)
 * - Exclusão lógica (ativo = false)
 * - pt-BR em todas as mensagens
 */

import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'
import { obterContaFinanceiraPorId } from '@/services/contasFinanceiras'

// ==========================================
// TIPOS E INTERFACES
// ==========================================

export type TipoMovimentoBancario = 'Entrada' | 'Saída'

export interface MovimentoExtratoItem {
  id: string
  empresa_id: string
  conta_financeira_id: string
  data_movimento: string
  tipo: TipoMovimentoBancario
  origem: string
  valor: number
  saldo_anterior: number
  saldo_posterior: number
  documento_tipo?: string
  documento_id?: string
  documento_numero?: string
  lote_baixa_id?: string
  transferencia_id?: string
  lancamento_avulso?: boolean
  historico: string
  estornado: boolean
  motivo_estorno?: string
  data_estorno?: string
  usuario_estorno_id?: string
  conciliado: boolean
  data_conciliacao?: string
  ativo: boolean
  created?: string
  expand?: {
    conta_financeira_id?: { id: string; nome: string; banco_nome?: string }
    usuario_estorno_id?: { id: string; name?: string; email?: string }
    lote_baixa_id?: { id: string; data_pagamento: string; valor_total: number }
  }
}

export interface ExtratoLinha {
  id: string
  empresa_id: string
  conta_financeira_id: string
  fitid: string
  data: string
  valor: number
  descricao: string
  situacao: 'Pendente' | 'Conciliada' | 'Ignorada'
  movimentos_ids?: string[]
  arquivo_importacao?: string
  ativo: boolean
  created?: string
  updated?: string
  expand?: {
    conta_financeira_id?: { id: string; nome: string; banco_nome?: string }
  }
}

export interface ListarExtratoParams {
  empresaId: string
  contaFinanceiraId: string
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
}

export interface ResumoExtrato {
  saldoAnterior: number
  entradasPeriodo: number
  saidasPeriodo: number
  saldoFinal: number
  saldoConciliado: number
  saldoSistema: number
  diferencaConciliacao: number
  movimentos: MovimentoExtratoItem[]
}

// ==========================================
// 1. CONSULTA DE EXTRATO (CRONOLÓGICO)
// ==========================================

/**
 * Consulta movimentos cronológicos de uma conta financeira em um período,
 * computando o saldo anterior, entradas, saídas, saldo final e saldo conciliado.
 */
export async function obterExtratoConta(params: ListarExtratoParams): Promise<ResumoExtrato> {
  const { empresaId, contaFinanceiraId, dataInicio, dataFim } = params

  const conta = await obterContaFinanceiraPorId(contaFinanceiraId)

  // 1. Busca todos os movimentos da conta até a data final
  // Para calcular com exatidão o saldo anterior e cada linha cronológica
  const todosMovimentos = await pb
    .collection('movimentacoes_financeiras')
    .getFullList<MovimentoExtratoItem>({
      filter: `empresa_id = '${empresaId}' && conta_financeira_id = '${contaFinanceiraId}' && ativo = true`,
      sort: 'data_movimento,created',
      expand: 'conta_financeira_id,usuario_estorno_id,lote_baixa_id',
      requestKey: null,
    })

  // Saldo base: saldo_inicial da conta
  let saldoAcumulado = Number(conta.saldo_inicial) || 0
  let saldoAnterior = saldoAcumulado
  let entradasPeriodo = 0
  let saidasPeriodo = 0
  let saldoConciliadoPeriodo = 0

  const movimentosDoPeriodo: MovimentoExtratoItem[] = []

  for (const mov of todosMovimentos) {
    const dataMov = mov.data_movimento ? mov.data_movimento.slice(0, 10) : ''
    const valor = Number(mov.valor) || 0

    const antesMov = saldoAcumulado
    if (mov.tipo === 'Entrada') {
      saldoAcumulado = Number((saldoAcumulado + valor).toFixed(2))
    } else {
      saldoAcumulado = Number((saldoAcumulado - valor).toFixed(2))
    }
    const depoisMov = saldoAcumulado

    if (dataMov < dataInicio) {
      // Movimento anterior à data inicial
      saldoAnterior = depoisMov
    } else if (dataMov <= dataFim) {
      // Movimento dentro do período solicitado
      if (mov.tipo === 'Entrada') {
        entradasPeriodo = Number((entradasPeriodo + valor).toFixed(2))
      } else {
        saidasPeriodo = Number((saidasPeriodo + valor).toFixed(2))
      }

      // Adiciona cópia com saldos reconstruídos com precisão para exibição
      movimentosDoPeriodo.push({
        ...mov,
        saldo_anterior: antesMov,
        saldo_posterior: depoisMov,
      })
    }
  }

  // Saldo final do período = saldo anterior + entradas - saídas
  const saldoFinal = Number((saldoAnterior + entradasPeriodo - saidasPeriodo).toFixed(2))

  // Saldo atual real do sistema na conta
  const saldoSistema = Number(conta.saldo_atual) || 0

  // Saldo conciliado de todos os tempos até a data final
  // Somando saldo inicial + movimentos conciliados
  let saldoConciliadoGeral = Number(conta.saldo_inicial) || 0
  for (const mov of todosMovimentos) {
    const dataMov = mov.data_movimento ? mov.data_movimento.slice(0, 10) : ''
    if (dataMov <= dataFim && mov.conciliado) {
      const v = Number(mov.valor) || 0
      if (mov.tipo === 'Entrada') {
        saldoConciliadoGeral += v
      } else {
        saldoConciliadoGeral -= v
      }
    }
  }
  saldoConciliadoPeriodo = Number(saldoConciliadoGeral.toFixed(2))

  const diferencaConciliacao = Number((saldoFinal - saldoConciliadoPeriodo).toFixed(2))

  return {
    saldoAnterior: Number(saldoAnterior.toFixed(2)),
    entradasPeriodo,
    saidasPeriodo,
    saldoFinal,
    saldoConciliado: saldoConciliadoPeriodo,
    saldoSistema,
    diferencaConciliacao,
    movimentos: movimentosDoPeriodo,
  }
}

// ==========================================
// 2. TRANSFERÊNCIA ENTRE CONTAS
// ==========================================

export interface TransferirContasParams {
  empresa_id: string
  conta_origem_id: string
  conta_destino_id: string
  data: string // YYYY-MM-DD
  valor: number
  historico?: string
}

export async function transferir(params: TransferirContasParams) {
  const { empresa_id, conta_origem_id, conta_destino_id, data, valor, historico } = params
  const user = pb.authStore.record

  if (!empresa_id) throw new Error('Empresa é obrigatória.')
  if (!conta_origem_id || !conta_destino_id) {
    throw new Error('Conta de origem e conta de destino são obrigatórias.')
  }
  if (conta_origem_id === conta_destino_id) {
    throw new Error('A conta de origem e a conta de destino devem ser diferentes.')
  }
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0) {
    throw new Error('O valor da transferência deve ser maior que zero.')
  }
  if (!data) throw new Error('A data da transferência é obrigatória.')

  const contaOrigem = await obterContaFinanceiraPorId(conta_origem_id)
  const contaDestino = await obterContaFinanceiraPorId(conta_destino_id)

  if (!contaOrigem.ativo) throw new Error('A conta de origem está inativa.')
  if (!contaDestino.ativo) throw new Error('A conta de destino está inativa.')

  // Validação de saldo negativo na origem
  const saldoOrigemAtual = Number(contaOrigem.saldo_atual) || 0
  const novoSaldoOrigem = Number((saldoOrigemAtual - valorNum).toFixed(2))
  if (novoSaldoOrigem < 0 && !contaOrigem.permite_saldo_negativo) {
    throw new Error(
      `Saldo insuficiente na conta de origem (${contaOrigem.nome}). Saldo disponível: R$ ${saldoOrigemAtual.toFixed(
        2,
      )}. A conta não permite saldo negativo.`,
    )
  }

  const saldoDestinoAtual = Number(contaDestino.saldo_atual) || 0
  const novoSaldoDestino = Number((saldoDestinoAtual + valorNum).toFixed(2))

  // Configuração financeira para obter plano_transferencias_id e centro de custo padrão
  const config = await obterOuCriarConfigFinanceiraEmpresa(empresa_id)

  const transferenciaId = `TRF_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const histBase =
    historico?.trim() || `Transferência entre contas (${contaOrigem.nome} -> ${contaDestino.nome})`

  // 1. Gravar movimentação de Saída na Origem
  const movSaida = await pb.collection('movimentacoes_financeiras').create({
    empresa_id,
    conta_financeira_id: conta_origem_id,
    data_movimento: data,
    tipo: 'Saída',
    origem: 'TRANSFERENCIA_SAIDA',
    valor: valorNum,
    saldo_anterior: saldoOrigemAtual,
    saldo_posterior: novoSaldoOrigem,
    documento_tipo: 'TRANSFERENCIA',
    documento_id: transferenciaId,
    documento_numero: transferenciaId,
    transferencia_id: transferenciaId,
    historico: `${histBase} - Débito`,
    conciliado: false,
    estornado: false,
    ativo: true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  })

  // 2. Gravar movimentação de Entrada no Destino
  const movEntrada = await pb.collection('movimentacoes_financeiras').create({
    empresa_id,
    conta_financeira_id: conta_destino_id,
    data_movimento: data,
    tipo: 'Entrada',
    origem: 'TRANSFERENCIA_ENTRADA',
    valor: valorNum,
    saldo_anterior: saldoDestinoAtual,
    saldo_posterior: novoSaldoDestino,
    documento_tipo: 'TRANSFERENCIA',
    documento_id: transferenciaId,
    documento_numero: transferenciaId,
    transferencia_id: transferenciaId,
    historico: `${histBase} - Crédito`,
    conciliado: false,
    estornado: false,
    ativo: true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  })

  // 3. Atualizar saldo_atual nas duas contas
  await pb.collection('contas_financeiras').update(conta_origem_id, {
    saldo_atual: novoSaldoOrigem,
    updated_by: user?.id || null,
  })

  await pb.collection('contas_financeiras').update(conta_destino_id, {
    saldo_atual: novoSaldoDestino,
    updated_by: user?.id || null,
  })

  // 4. Auditoria
  await registrarAuditoria({
    tabela: 'movimentacoes_financeiras',
    registro_id: transferenciaId,
    acao: 'inclusao',
    valores_depois: {
      operacao: 'transferencia_entre_contas',
      transferencia_id: transferenciaId,
      origem_id: conta_origem_id,
      destino_id: conta_destino_id,
      valor: valorNum,
      data,
      movimento_saida_id: movSaida.id,
      movimento_entrada_id: movEntrada.id,
    },
  })

  return {
    transferencia_id: transferenciaId,
    mov_saida_id: movSaida.id,
    mov_entrada_id: movEntrada.id,
    novo_saldo_origem: novoSaldoOrigem,
    novo_saldo_destino: novoSaldoDestino,
  }
}

// ==========================================
// 3. LANÇAMENTO AVULSO
// ==========================================

export interface LancarAvulsoParams {
  empresa_id: string
  conta_financeira_id: string
  data: string // YYYY-MM-DD
  tipo: TipoMovimentoBancario // Entrada ou Saída
  valor: number
  plano_conta_id: string
  centro_custo_id?: string
  historico: string
}

export async function lancarAvulso(params: LancarAvulsoParams) {
  const {
    empresa_id,
    conta_financeira_id,
    data,
    tipo,
    valor,
    plano_conta_id,
    centro_custo_id,
    historico,
  } = params
  const user = pb.authStore.record

  if (!empresa_id) throw new Error('Empresa é obrigatória.')
  if (!conta_financeira_id) throw new Error('Conta financeira é obrigatória.')
  if (!tipo) throw new Error('Tipo (Entrada ou Saída) é obrigatório.')
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0) {
    throw new Error('O valor do lançamento deve ser maior que zero.')
  }
  if (!data) throw new Error('A data do lançamento é obrigatória.')
  if (!historico || !historico.trim()) {
    throw new Error('O histórico do lançamento é obrigatório.')
  }
  if (!plano_conta_id) {
    throw new Error('O plano de contas (analítico) é obrigatório.')
  }

  // Verifica se o plano é analítico
  const plano = await pb.collection('plano_contas').getOne(plano_conta_id)
  if (plano.natureza !== 'Analítica') {
    throw new Error('Apenas contas analíticas podem receber lançamentos.')
  }

  const conta = await obterContaFinanceiraPorId(conta_financeira_id)
  if (!conta.ativo) throw new Error('A conta financeira selecionada está inativa.')

  const saldoAtual = Number(conta.saldo_atual) || 0
  let novoSaldo = 0
  if (tipo === 'Entrada') {
    novoSaldo = Number((saldoAtual + valorNum).toFixed(2))
  } else {
    novoSaldo = Number((saldoAtual - valorNum).toFixed(2))
    if (novoSaldo < 0 && !conta.permite_saldo_negativo) {
      throw new Error(
        `Saldo insuficiente na conta ${conta.nome}. Saldo disponível: R$ ${saldoAtual.toFixed(
          2,
        )}. A conta não permite saldo negativo.`,
      )
    }
  }

  const docId = `AVU_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // 1. Gravar movimentação financeira
  const mov = await pb.collection('movimentacoes_financeiras').create({
    empresa_id,
    conta_financeira_id,
    data_movimento: data,
    tipo,
    origem: 'AJUSTE',
    valor: valorNum,
    saldo_anterior: saldoAtual,
    saldo_posterior: novoSaldo,
    documento_tipo: 'AVULSO',
    documento_id: docId,
    documento_numero: docId,
    lancamento_avulso: true,
    historico: historico.trim(),
    conciliado: false,
    estornado: false,
    ativo: true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  })

  // 2. Atualizar saldo_atual na conta
  await pb.collection('contas_financeiras').update(conta_financeira_id, {
    saldo_atual: novoSaldo,
    updated_by: user?.id || null,
  })

  // 3. Auditoria
  await registrarAuditoria({
    tabela: 'movimentacoes_financeiras',
    registro_id: mov.id,
    acao: 'inclusao',
    valores_depois: {
      operacao: 'lancamento_avulso',
      conta_financeira_id,
      tipo,
      valor: valorNum,
      plano_conta_id,
      centro_custo_id: centro_custo_id || null,
      saldo_anterior: saldoAtual,
      saldo_posterior: novoSaldo,
      historico: historico.trim(),
    },
  })

  return {
    movimento: mov,
    novo_saldo: novoSaldo,
  }
}

// ==========================================
// 4. ESTORNO DE MOVIMENTAÇÃO (TRANSFERÊNCIAS E AVULSOS)
// ==========================================

export async function estornarMovimentoAvulsoOuTransferencia(movimentoId: string, motivo: string) {
  const user = pb.authStore.record
  if (!motivo || !motivo.trim()) {
    throw new Error('O motivo do estorno é obrigatório.')
  }

  const mov = await pb
    .collection('movimentacoes_financeiras')
    .getOne<MovimentoExtratoItem>(movimentoId)

  if (mov.estornado) {
    throw new Error('Este movimento já foi estornado anteriormente.')
  }

  // Títulos pagar/receber não podem ser estornados por aqui
  if (
    mov.origem === 'PAGAMENTO_TITULO' ||
    mov.origem === 'RECEBIMENTO_TITULO' ||
    mov.origem === 'ESTORNO_PAGAMENTO' ||
    mov.origem === 'ESTORNO_RECEBIMENTO' ||
    mov.lote_baixa_id
  ) {
    throw new Error(
      'Movimentações originadas de títulos a pagar ou a receber devem ser estornadas através dos seus respectivos módulos.',
    )
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // CASO A: Transferência entre contas (estorna ambas as pontas)
  if (mov.transferencia_id) {
    const pontas = await pb
      .collection('movimentacoes_financeiras')
      .getFullList<MovimentoExtratoItem>({
        filter: `transferencia_id = '${mov.transferencia_id}' && ativo = true && estornado = false`,
      })

    for (const p of pontas) {
      const conta = await obterContaFinanceiraPorId(p.conta_financeira_id)
      const saldoAtual = Number(conta.saldo_atual) || 0
      const valor = Number(p.valor) || 0

      // Reverte o valor
      let novoSaldo = 0
      let tipoEstorno: TipoMovimentoBancario = 'Entrada'
      if (p.tipo === 'Saída') {
        // Devolve na origem
        novoSaldo = Number((saldoAtual + valor).toFixed(2))
        tipoEstorno = 'Entrada'
      } else {
        // Retira do destino
        novoSaldo = Number((saldoAtual - valor).toFixed(2))
        tipoEstorno = 'Saída'
        if (novoSaldo < 0 && !conta.permite_saldo_negativo) {
          throw new Error(
            `Não foi possível estornar a transferência: a conta de destino (${conta.nome}) ficaria com saldo negativo.`,
          )
        }
      }

      // Marca o movimento original como estornado
      await pb.collection('movimentacoes_financeiras').update(p.id, {
        estornado: true,
        motivo_estorno: motivo.trim(),
        data_estorno: hoje,
        usuario_estorno_id: user?.id || null,
        updated_by: user?.id || null,
      })

      // Grava movimento de estorno
      await pb.collection('movimentacoes_financeiras').create({
        empresa_id: p.empresa_id,
        conta_financeira_id: p.conta_financeira_id,
        data_movimento: hoje,
        tipo: tipoEstorno,
        origem: 'AJUSTE',
        valor,
        saldo_anterior: saldoAtual,
        saldo_posterior: novoSaldo,
        documento_tipo: 'ESTORNO_TRANSFERENCIA',
        documento_id: p.id,
        documento_numero: p.transferencia_id,
        transferencia_id: p.transferencia_id,
        historico: `Estorno de transferência: ${motivo.trim()}`,
        conciliado: false,
        estornado: false,
        ativo: true,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      })

      // Atualiza saldo_atual da conta
      await pb.collection('contas_financeiras').update(p.conta_financeira_id, {
        saldo_atual: novoSaldo,
        updated_by: user?.id || null,
      })

      await registrarAuditoria({
        tabela: 'movimentacoes_financeiras',
        registro_id: p.id,
        acao: 'alteracao',
        valores_antes: { estornado: false },
        valores_depois: { estornado: true, motivo_estorno: motivo.trim() },
      })
    }

    return { sucesso: true, mensagem: 'Transferência estornada com sucesso em ambas as contas.' }
  }

  // CASO B: Lançamento avulso / ajuste
  const conta = await obterContaFinanceiraPorId(mov.conta_financeira_id)
  const saldoAtual = Number(conta.saldo_atual) || 0
  const valor = Number(mov.valor) || 0

  let novoSaldo = 0
  let tipoEstorno: TipoMovimentoBancario = 'Entrada'
  if (mov.tipo === 'Saída') {
    novoSaldo = Number((saldoAtual + valor).toFixed(2))
    tipoEstorno = 'Entrada'
  } else {
    novoSaldo = Number((saldoAtual - valor).toFixed(2))
    tipoEstorno = 'Saída'
    if (novoSaldo < 0 && !conta.permite_saldo_negativo) {
      throw new Error(
        `Não é possível estornar este lançamento: a conta ficaria com saldo negativo (${novoSaldo.toFixed(
          2,
        )}).`,
      )
    }
  }

  // Marca original como estornado
  await pb.collection('movimentacoes_financeiras').update(mov.id, {
    estornado: true,
    motivo_estorno: motivo.trim(),
    data_estorno: hoje,
    usuario_estorno_id: user?.id || null,
    updated_by: user?.id || null,
  })

  // Grava movimentação de contrapartida do estorno
  await pb.collection('movimentacoes_financeiras').create({
    empresa_id: mov.empresa_id,
    conta_financeira_id: mov.conta_financeira_id,
    data_movimento: hoje,
    tipo: tipoEstorno,
    origem: 'AJUSTE',
    valor,
    saldo_anterior: saldoAtual,
    saldo_posterior: novoSaldo,
    documento_tipo: 'ESTORNO_AVULSO',
    documento_id: mov.id,
    documento_numero: mov.documento_numero || mov.id,
    historico: `Estorno de lançamento avulso: ${motivo.trim()}`,
    conciliado: false,
    estornado: false,
    ativo: true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  })

  // Atualiza saldo da conta
  await pb.collection('contas_financeiras').update(mov.conta_financeira_id, {
    saldo_atual: novoSaldo,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'movimentacoes_financeiras',
    registro_id: mov.id,
    acao: 'alteracao',
    valores_antes: { estornado: false },
    valores_depois: { estornado: true, motivo_estorno: motivo.trim() },
  })

  return { sucesso: true, mensagem: 'Lançamento estornado com sucesso.' }
}

// ==========================================
// 5. PARSER E IMPORTAÇÃO DE EXTRATO OFX
// ==========================================

export interface TransacaoOfx {
  tipo: string
  dtPosted: string // YYYY-MM-DD
  valor: number
  fitid: string
  memo: string
}

export interface HeaderOfxInfo {
  bankId?: string
  acctId?: string
  transacoes: TransacaoOfx[]
}

/**
 * Faz parse do conteúdo de texto de um arquivo OFX bancário brasileiro.
 * Extrai BANKID, ACCTID e blocos <STMTTRN> (TRNTYPE, DTPOSTED, TRNAMT, FITID, MEMO).
 */
export function parseOFX(conteudo: string): HeaderOfxInfo {
  const transacoes: TransacaoOfx[] = []

  // Extrai BANKID e ACCTID
  const matchBankId = conteudo.match(/<BANKID>([^<\r\n]+)/i)
  const matchAcctId = conteudo.match(/<ACCTID>([^<\r\n]+)/i)

  const bankId = matchBankId ? matchBankId[1].trim() : undefined
  const acctId = matchAcctId ? matchAcctId[1].trim() : undefined

  // Quebra por blocos STMTTRN
  const blocos = conteudo.split(/<STMTTRN>/i)

  for (let i = 1; i < blocos.length; i++) {
    const bloco = blocos[i].split(/<\/STMTTRN>/i)[0]

    const matchType = bloco.match(/<TRNTYPE>([^<\r\n]+)/i)
    const matchDt = bloco.match(/<DTPOSTED>([0-9]{8})/i)
    const matchAmt = bloco.match(/<TRNAMT>([^<\r\n]+)/i)
    const matchFitid = bloco.match(/<FITID>([^<\r\n]+)/i)
    const matchMemo = bloco.match(/<MEMO>([^<\r\n]+)/i)

    if (matchDt && matchAmt && matchFitid) {
      const dtRaw = matchDt[1] // YYYYMMDD
      const dataIso = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`
      const valor = parseFloat(matchAmt[1].trim().replace(',', '.'))
      const fitid = matchFitid[1].trim()
      const memo = matchMemo
        ? matchMemo[1].trim()
        : matchType
          ? matchType[1].trim()
          : 'Transação Bancária'
      const tipo = matchType ? matchType[1].trim() : valor >= 0 ? 'CREDIT' : 'DEBIT'

      transacoes.push({
        tipo,
        dtPosted: dataIso,
        valor: isNaN(valor) ? 0 : Number(valor.toFixed(2)),
        fitid,
        memo,
      })
    }
  }

  return {
    bankId,
    acctId,
    transacoes,
  }
}

export interface ResultadoImportacaoOfx {
  totalNoArquivo: number
  novasInseridas: number
  ignoradasDuplicadas: number
  linhas: ExtratoLinha[]
}

/**
 * Importa transações de um arquivo OFX para a tabela extratos_linhas:
 * - Confere se FITID já existe para a mesma conta (ignora duplicados)
 * - Grava novas linhas como situacao = 'Pendente'
 */
export async function importarExtratoOfx(params: {
  empresaId: string
  contaFinanceiraId: string
  arquivoNome: string
  transacoes: TransacaoOfx[]
}): Promise<ResultadoImportacaoOfx> {
  const { empresaId, contaFinanceiraId, arquivoNome, transacoes } = params
  const user = pb.authStore.record

  // 1. Busca todos os FITIDs existentes para essa conta
  const existentes = await pb.collection('extratos_linhas').getFullList<ExtratoLinha>({
    filter: `conta_financeira_id = '${contaFinanceiraId}'`,
    fields: 'fitid',
    requestKey: null,
  })
  const setExistentes = new Set(existentes.map((e) => e.fitid))

  let novas = 0
  let ignoradas = 0
  const linhasCriadas: ExtratoLinha[] = []

  for (const t of transacoes) {
    if (setExistentes.has(t.fitid)) {
      ignoradas++
      continue
    }

    try {
      const criado = await pb.collection('extratos_linhas').create<ExtratoLinha>({
        empresa_id: empresaId,
        conta_financeira_id: contaFinanceiraId,
        fitid: t.fitid,
        data: t.dtPosted,
        valor: t.valor,
        descricao: t.memo,
        situacao: 'Pendente',
        movimentos_ids: [],
        arquivo_importacao: arquivoNome,
        ativo: true,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      })
      setExistentes.add(t.fitid)
      linhasCriadas.push(criado)
      novas++
    } catch (e: any) {
      // Se deu erro de índice único por corrida concorrente, conta como ignorada
      ignoradas++
    }
  }

  await registrarAuditoria({
    tabela: 'extratos_linhas',
    registro_id: `IMP_${Date.now()}`,
    acao: 'inclusao',
    valores_depois: {
      arquivo: arquivoNome,
      conta_financeira_id: contaFinanceiraId,
      novas,
      ignoradas,
    },
  })

  return {
    totalNoArquivo: transacoes.length,
    novasInseridas: novas,
    ignoradasDuplicadas: ignoradas,
    linhas: linhasCriadas,
  }
}

// ==========================================
// 6. CASAMENTO AUTOMÁTICO E MANUAL DE CONCILIAÇÃO
// ==========================================

export interface ResultadoCasamentoAutomatico {
  linhasAnalisadas: number
  casamentosRealizados: number
}

/**
 * Diferença em dias entre duas datas YYYY-MM-DD
 */
function diferencaEmDias(data1: string, data2: string): number {
  const d1 = new Date(data1.slice(0, 10) + 'T00:00:00')
  const d2 = new Date(data2.slice(0, 10) + 'T00:00:00')
  const diffMs = Math.abs(d1.getTime() - d2.getTime())
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Realiza o casamento automático das linhas pendentes com os movimentos do sistema não conciliados:
 * - Mesma conta financeira
 * - Mesmo valor (positivo = Entrada, negativo = Saída)
 * - Data com diferença de até 3 dias
 * - Suporta também a soma dos movimentos com mesmo lote_baixa_id ou transferencia_id
 */
export async function conciliarAutomaticamente(params: {
  empresaId: string
  contaFinanceiraId: string
}): Promise<ResultadoCasamentoAutomatico> {
  const { empresaId, contaFinanceiraId } = params
  const user = pb.authStore.record

  // 1. Linhas pendentes do extrato
  const pendentes = await pb.collection('extratos_linhas').getFullList<ExtratoLinha>({
    filter: `empresa_id = '${empresaId}' && conta_financeira_id = '${contaFinanceiraId}' && situacao = 'Pendente' && ativo = true`,
    sort: 'data',
    requestKey: null,
  })

  // 2. Movimentos não conciliados da mesma conta
  const movimentos = await pb
    .collection('movimentacoes_financeiras')
    .getFullList<MovimentoExtratoItem>({
      filter: `empresa_id = '${empresaId}' && conta_financeira_id = '${contaFinanceiraId}' && conciliado = false && estornado = false && ativo = true`,
      sort: 'data_movimento',
      requestKey: null,
    })

  const movimentosUsados = new Set<string>()
  let casamentosRealizados = 0
  const hoje = new Date().toISOString().slice(0, 10)

  // A. Agrupamentos por lote_baixa_id ou transferencia_id
  const gruposMovimentos = new Map<string, MovimentoExtratoItem[]>()
  movimentos.forEach((m) => {
    if (m.lote_baixa_id) {
      const k = `LOTE_${m.lote_baixa_id}`
      const arr = gruposMovimentos.get(k) || []
      arr.push(m)
      gruposMovimentos.set(k, arr)
    } else if (m.transferencia_id) {
      const k = `TRF_${m.transferencia_id}`
      const arr = gruposMovimentos.get(k) || []
      arr.push(m)
      gruposMovimentos.set(k, arr)
    }
  })

  for (const linha of pendentes) {
    const valorLinha = Number(linha.valor) || 0
    const tipoEsperado: TipoMovimentoBancario = valorLinha >= 0 ? 'Entrada' : 'Saída'
    const valorAbsoluto = Math.abs(valorLinha)

    let matchMovimentosIds: string[] = []

    // 1º: Tenta casamento direto 1 para 1
    const cand = movimentos.find((m) => {
      if (movimentosUsados.has(m.id)) return false
      if (m.tipo !== tipoEsperado) return false
      const v = Number(m.valor) || 0
      if (Math.abs(v - valorAbsoluto) > 0.009) return false
      const diff = diferencaEmDias(linha.data, m.data_movimento)
      return diff <= 3
    })

    if (cand) {
      matchMovimentosIds = [cand.id]
      movimentosUsados.add(cand.id)
    } else {
      // 2º: Tenta casamento por lote/transferência (soma dos movimentos)
      for (const [k, grupo] of gruposMovimentos.entries()) {
        const disponiveis = grupo.filter(
          (m) => !movimentosUsados.has(m.id) && m.tipo === tipoEsperado,
        )
        if (disponiveis.length > 0) {
          const somaGrupo = disponiveis.reduce((acc, m) => acc + (Number(m.valor) || 0), 0)
          if (Math.abs(somaGrupo - valorAbsoluto) <= 0.009) {
            const dataBase = disponiveis[0].data_movimento
            if (diferencaEmDias(linha.data, dataBase) <= 3) {
              matchMovimentosIds = disponiveis.map((m) => m.id)
              matchMovimentosIds.forEach((id) => movimentosUsados.add(id))
              break
            }
          }
        }
      }
    }

    if (matchMovimentosIds.length > 0) {
      // Atualiza linha do extrato para Conciliada
      await pb.collection('extratos_linhas').update(linha.id, {
        situacao: 'Conciliada',
        movimentos_ids: matchMovimentosIds,
        updated_by: user?.id || null,
      })

      // Atualiza os movimentos vinculados como conciliados
      for (const mId of matchMovimentosIds) {
        await pb.collection('movimentacoes_financeiras').update(mId, {
          conciliado: true,
          data_conciliacao: hoje,
          updated_by: user?.id || null,
        })
      }

      casamentosRealizados++
    }
  }

  return {
    linhasAnalisadas: pendentes.length,
    casamentosRealizados,
  }
}

/**
 * Casamento Manual: vincula uma ou mais linhas de extrato a um ou mais movimentos do sistema.
 * Valida estritamente se o total de valores é igual dos dois lados.
 */
export async function conciliarManual(params: { linhasIds: string[]; movimentosIds: string[] }) {
  const { linhasIds, movimentosIds } = params
  const user = pb.authStore.record

  if (!linhasIds.length || !movimentosIds.length) {
    throw new Error('Selecione ao menos uma linha do extrato e um movimento do sistema.')
  }

  const linhas = await Promise.all(
    linhasIds.map((id) => pb.collection('extratos_linhas').getOne<ExtratoLinha>(id)),
  )
  const movimentos = await Promise.all(
    movimentosIds.map((id) =>
      pb.collection('movimentacoes_financeiras').getOne<MovimentoExtratoItem>(id),
    ),
  )

  // Soma líquida das linhas do extrato (valor já vem com sinal)
  const totalExtrato = Number(linhas.reduce((acc, l) => acc + (Number(l.valor) || 0), 0).toFixed(2))

  // Soma líquida dos movimentos (Entrada positivo, Saída negativo)
  const totalMovimentos = Number(
    movimentos
      .reduce((acc, m) => {
        const v = Number(m.valor) || 0
        return acc + (m.tipo === 'Entrada' ? v : -v)
      }, 0)
      .toFixed(2),
  )

  if (Math.abs(totalExtrato - totalMovimentos) > 0.009) {
    throw new Error(
      `Totais divergentes: Total Extrato: R$ ${totalExtrato.toFixed(
        2,
      )} x Total Sistema: R$ ${totalMovimentos.toFixed(2)}. Os totais devem ser exatamente iguais.`,
    )
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // Atualiza linhas
  for (const l of linhas) {
    await pb.collection('extratos_linhas').update(l.id, {
      situacao: 'Conciliada',
      movimentos_ids: movimentosIds,
      updated_by: user?.id || null,
    })
  }

  // Atualiza movimentos
  for (const m of movimentos) {
    await pb.collection('movimentacoes_financeiras').update(m.id, {
      conciliado: true,
      data_conciliacao: hoje,
      updated_by: user?.id || null,
    })
  }

  return { sucesso: true, mensagem: 'Conciliação realizada com sucesso.' }
}

/**
 * Desfazer Conciliação:
 * Volta a linha de extrato para 'Pendente' e os movimentos vinculados para conciliado = false.
 */
export async function desfazerConciliacao(linhaId: string) {
  const user = pb.authStore.record
  const linha = await pb.collection('extratos_linhas').getOne<ExtratoLinha>(linhaId)

  const movimentosIds = Array.isArray(linha.movimentos_ids) ? linha.movimentos_ids : []

  // 1. Desconcilia os movimentos vinculados
  for (const mId of movimentosIds) {
    try {
      await pb.collection('movimentacoes_financeiras').update(mId, {
        conciliado: false,
        data_conciliacao: null,
        updated_by: user?.id || null,
      })
    } catch {
      // Ignora se não existir mais
    }
  }

  // 2. Retorna a linha para Pendente
  const atualizada = await pb.collection('extratos_linhas').update<ExtratoLinha>(linhaId, {
    situacao: 'Pendente',
    movimentos_ids: [],
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'extratos_linhas',
    registro_id: linhaId,
    acao: 'alteracao',
    valores_antes: { situacao: 'Conciliada' },
    valores_depois: { situacao: 'Pendente' },
  })

  return atualizada
}

/**
 * Ignorar linha de extrato bancário (ex: estornos pontuais de teste do banco)
 */
export async function alternarIgnorarLinhaExtrato(linhaId: string, ignorar: boolean) {
  const user = pb.authStore.record
  const antes = await pb.collection('extratos_linhas').getOne<ExtratoLinha>(linhaId)

  const novaSituacao = ignorar ? 'Ignorada' : 'Pendente'
  const atualizada = await pb.collection('extratos_linhas').update<ExtratoLinha>(linhaId, {
    situacao: novaSituacao,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'extratos_linhas',
    registro_id: linhaId,
    acao: 'alteracao',
    valores_antes: { situacao: antes.situacao },
    valores_depois: { situacao: novaSituacao },
  })

  return atualizada
}
