/**
 * Serviço de Verificação de Integridade do Financeiro
 *
 * Conferências realizadas (sem correção automática — apenas relatório de divergências):
 * (a) Para cada conta financeira:
 *     saldo_atual deve ser igual a saldo_inicial + entradas − saídas das movimentacoes_financeiras não estornadas da conta.
 * (b) Para cada título de contas_pagar e contas_receber:
 *     valor_pago / valor_recebido e saldo devem bater com a soma das baixas NÃO estornadas (pagamentos_baixas).
 * (c) Nenhum título com situação "Pago" (ou "Recebido") pode ter saldo diferente de zero.
 */

import pb from '@/lib/pocketbase/client'

export type CategoriaIntegridadeFinanceiro = 'conta_financeira' | 'conta_pagar' | 'conta_receber'

export type GravidadeDivergencia = 'alta' | 'media' | 'baixa'

export interface DivergenciaFinanceira {
  id: string
  categoria: CategoriaIntegridadeFinanceiro
  categoriaRotulo: string
  referenciaId: string
  referenciaCodigo?: string
  descricao: string
  empresaId: string
  empresaNome?: string
  valorEsperado: number
  valorEncontrado: number
  diferenca: number
  gravidade: GravidadeDivergencia
  detalhes: string
}

export interface ResultadoIntegridadeFinanceiro {
  dataExecucao: string
  totalContasAnalisadas: number
  totalTitulosPagarAnalisados: number
  totalTitulosReceberAnalisados: number
  totalDivergencias: number
  divergencias: DivergenciaFinanceira[]
}

function arredondar2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * Executa as conferências de integridade do módulo financeiro.
 * Pode ser filtrado por empresaId ou executado para todas as empresas.
 */
export async function verificarIntegridadeFinanceiro(
  empresaId?: string,
): Promise<ResultadoIntegridadeFinanceiro> {
  const filtroEmpresa = empresaId ? `empresa_id = '${empresaId}'` : 'ativo = true'
  const divergencias: DivergenciaFinanceira[] = []

  // 1. Carregar contas financeiras
  const contasFilter = empresaId ? `empresa_id = '${empresaId}' && ativo = true` : 'ativo = true'

  const contas = await pb.collection('contas_financeiras').getFullList<any>({
    filter: contasFilter,
    expand: 'empresa_id',
    requestKey: null,
  })

  // 2. Carregar movimentações financeiras ativas
  const movsFilter = empresaId ? `empresa_id = '${empresaId}' && ativo = true` : 'ativo = true'

  const movs = await pb.collection('movimentacoes_financeiras').getFullList<any>({
    filter: movsFilter,
    requestKey: null,
  })

  // Agrupar movimentações não estornadas por conta_financeira_id
  const totalEntradasPorConta = new Map<string, number>()
  const totalSaidasPorConta = new Map<string, number>()

  for (const m of movs) {
    if (m.estornado) continue
    const cId = m.conta_financeira_id
    if (!cId) continue

    const val = Number(m.valor) || 0
    if (m.tipo === 'Entrada') {
      const prev = totalEntradasPorConta.get(cId) || 0
      totalEntradasPorConta.set(cId, arredondar2(prev + val))
    } else {
      const prev = totalSaidasPorConta.get(cId) || 0
      totalSaidasPorConta.set(cId, arredondar2(prev + val))
    }
  }

  // Conferência (a): saldo_atual de cada conta vs (saldo_inicial + entradas - saídas)
  for (const c of contas) {
    const saldoInicial = Number(c.saldo_inicial) || 0
    const saldoAtual = Number(c.saldo_atual) || 0
    const entradas = totalEntradasPorConta.get(c.id) || 0
    const saidas = totalSaidasPorConta.get(c.id) || 0

    const saldoEsperado = arredondar2(saldoInicial + entradas - saidas)
    const diff = arredondar2(saldoAtual - saldoEsperado)

    if (Math.abs(diff) > 0.009) {
      divergencias.push({
        id: `conta_${c.id}`,
        categoria: 'conta_financeira',
        categoriaRotulo: 'Conta Financeira',
        referenciaId: c.id,
        referenciaCodigo: c.nome,
        descricao: `Conta "${c.nome}" com saldo divergente das movimentações registradas`,
        empresaId: c.empresa_id,
        empresaNome: c.expand?.empresa_id?.nome_fantasia || c.expand?.empresa_id?.razao_social,
        valorEsperado: saldoEsperado,
        valorEncontrado: saldoAtual,
        diferenca: diff,
        gravidade: 'alta',
        detalhes: `Saldo inicial: R$ ${saldoInicial.toFixed(2)} | Entradas: R$ ${entradas.toFixed(2)} | Saídas: R$ ${saidas.toFixed(2)} | Esperado: R$ ${saldoEsperado.toFixed(2)} | Cadastrado no registro: R$ ${saldoAtual.toFixed(2)}`,
      })
    }
  }

  // 3. Carregar baixas não estornadas
  const baixasFilter = empresaId
    ? `empresa_id = '${empresaId}' && ativo = true && estornado != true`
    : 'ativo = true && estornado != true'

  const baixas = await pb.collection('pagamentos_baixas').getFullList<any>({
    filter: baixasFilter,
    requestKey: null,
  })

  // Mapear baixas por conta_pagar_id e conta_receber_id
  const baixasPorPagar = new Map<string, number>()
  const baixasPorReceber = new Map<string, number>()

  for (const b of baixas) {
    const valPago = Number(b.valor_pago) || 0
    if (b.conta_pagar_id) {
      const prev = baixasPorPagar.get(b.conta_pagar_id) || 0
      baixasPorPagar.set(b.conta_pagar_id, arredondar2(prev + valPago))
    }
    if (b.conta_receber_id) {
      const prev = baixasPorReceber.get(b.conta_receber_id) || 0
      baixasPorReceber.set(b.conta_receber_id, arredondar2(prev + valPago))
    }
  }

  // 4. Carregar títulos a pagar
  const pagarFilter = empresaId ? `empresa_id = '${empresaId}' && ativo = true` : 'ativo = true'

  const titulosPagar = await pb.collection('contas_pagar').getFullList<any>({
    filter: pagarFilter,
    expand: 'fornecedor_id,empresa_id',
    requestKey: null,
  })

  for (const cp of titulosPagar) {
    // Ignorar cancelados
    if (cp.status === 'Cancelado') continue

    const valorOriginal = Number(cp.valor_original) || 0
    const valorPagoCadastrado = Number(cp.valor_pago) || 0
    const saldoCadastrado = Number(cp.saldo) || 0
    const fornecedorNome =
      cp.expand?.fornecedor_id?.razao_social ||
      cp.expand?.fornecedor_id?.nome_fantasia ||
      'Fornecedor'

    const somaBaixas = baixasPorPagar.get(cp.id) || 0
    const saldoEsperado = arredondar2(Math.max(0, valorOriginal - somaBaixas))

    // Conferência (b): valor_pago deve bater com a soma das baixas não estornadas
    const diffValorPago = arredondar2(valorPagoCadastrado - somaBaixas)
    if (Math.abs(diffValorPago) > 0.009) {
      divergencias.push({
        id: `cp_pago_${cp.id}`,
        categoria: 'conta_pagar',
        categoriaRotulo: 'Conta a Pagar',
        referenciaId: cp.id,
        referenciaCodigo: cp.numero_documento
          ? `Doc ${cp.numero_documento} (${cp.parcela || '1'})`
          : cp.id,
        descricao: `Título a pagar (${fornecedorNome}) com valor pago divergente da soma das baixas`,
        empresaId: cp.empresa_id,
        empresaNome: cp.expand?.empresa_id?.nome_fantasia || cp.expand?.empresa_id?.razao_social,
        valorEsperado: somaBaixas,
        valorEncontrado: valorPagoCadastrado,
        diferenca: diffValorPago,
        gravidade: 'alta',
        detalhes: `Soma das baixas ativas: R$ ${somaBaixas.toFixed(2)} | Valor pago no título: R$ ${valorPagoCadastrado.toFixed(2)}`,
      })
    }

    // Conferência (b2): saldo deve bater com valor_original - somaBaixas
    const diffSaldo = arredondar2(saldoCadastrado - saldoEsperado)
    if (Math.abs(diffSaldo) > 0.009) {
      divergencias.push({
        id: `cp_saldo_${cp.id}`,
        categoria: 'conta_pagar',
        categoriaRotulo: 'Conta a Pagar',
        referenciaId: cp.id,
        referenciaCodigo: cp.numero_documento
          ? `Doc ${cp.numero_documento} (${cp.parcela || '1'})`
          : cp.id,
        descricao: `Título a pagar (${fornecedorNome}) com saldo em aberto divergente`,
        empresaId: cp.empresa_id,
        empresaNome: cp.expand?.empresa_id?.nome_fantasia || cp.expand?.empresa_id?.razao_social,
        valorEsperado: saldoEsperado,
        valorEncontrado: saldoCadastrado,
        diferenca: diffSaldo,
        gravidade: 'alta',
        detalhes: `Valor original: R$ ${valorOriginal.toFixed(2)} | Baixas: R$ ${somaBaixas.toFixed(2)} | Saldo esperado: R$ ${saldoEsperado.toFixed(2)} | Saldo gravado: R$ ${saldoCadastrado.toFixed(2)}`,
      })
    }

    // Conferência (c): nenhum título com situação "Pago" pode ter saldo diferente de zero
    if (cp.status === 'Pago' && Math.abs(saldoCadastrado) > 0.009) {
      divergencias.push({
        id: `cp_status_pago_${cp.id}`,
        categoria: 'conta_pagar',
        categoriaRotulo: 'Conta a Pagar',
        referenciaId: cp.id,
        referenciaCodigo: cp.numero_documento
          ? `Doc ${cp.numero_documento} (${cp.parcela || '1'})`
          : cp.id,
        descricao: `Título com situação "Pago" possui saldo residual em aberto`,
        empresaId: cp.empresa_id,
        empresaNome: cp.expand?.empresa_id?.nome_fantasia || cp.expand?.empresa_id?.razao_social,
        valorEsperado: 0,
        valorEncontrado: saldoCadastrado,
        diferenca: saldoCadastrado,
        gravidade: 'alta',
        detalhes: `O título está com status "Pago", mas seu saldo residual é de R$ ${saldoCadastrado.toFixed(2)} (deveria ser 0,00).`,
      })
    }
  }

  // 5. Carregar títulos a receber
  const receberFilter = empresaId ? `empresa_id = '${empresaId}' && ativo = true` : 'ativo = true'

  const titulosReceber = await pb.collection('contas_receber').getFullList<any>({
    filter: receberFilter,
    expand: 'cliente_id,empresa_id',
    requestKey: null,
  })

  for (const cr of titulosReceber) {
    if (cr.status === 'Cancelado') continue

    const valorOriginal = Number(cr.valor_original) || 0
    const valorRecebidoCadastrado = Number(cr.valor_recebido) || 0
    const saldoCadastrado = Number(cr.saldo) || 0
    const clienteNome =
      cr.expand?.cliente_id?.nome_razao_social || cr.expand?.cliente_id?.nome_fantasia || 'Cliente'

    const somaBaixas = baixasPorReceber.get(cr.id) || 0
    const saldoEsperado = arredondar2(Math.max(0, valorOriginal - somaBaixas))

    // Conferência (b): valor_recebido deve bater com a soma das baixas não estornadas
    const diffValorRecebido = arredondar2(valorRecebidoCadastrado - somaBaixas)
    if (Math.abs(diffValorRecebido) > 0.009) {
      divergencias.push({
        id: `cr_recebido_${cr.id}`,
        categoria: 'conta_receber',
        categoriaRotulo: 'Conta a Receber',
        referenciaId: cr.id,
        referenciaCodigo: cr.numero_documento
          ? `Doc ${cr.numero_documento} (${cr.parcela || '1'})`
          : cr.id,
        descricao: `Título a receber (${clienteNome}) com valor recebido divergente da soma das baixas`,
        empresaId: cr.empresa_id,
        empresaNome: cr.expand?.empresa_id?.nome_fantasia || cr.expand?.empresa_id?.razao_social,
        valorEsperado: somaBaixas,
        valorEncontrado: valorRecebidoCadastrado,
        diferenca: diffValorRecebido,
        gravidade: 'alta',
        detalhes: `Soma das baixas ativas: R$ ${somaBaixas.toFixed(2)} | Valor recebido no título: R$ ${valorRecebidoCadastrado.toFixed(2)}`,
      })
    }

    // Conferência (b2): saldo deve bater com valor_original - somaBaixas
    const diffSaldo = arredondar2(saldoCadastrado - saldoEsperado)
    if (Math.abs(diffSaldo) > 0.009) {
      divergencias.push({
        id: `cr_saldo_${cr.id}`,
        categoria: 'conta_receber',
        categoriaRotulo: 'Conta a Receber',
        referenciaId: cr.id,
        referenciaCodigo: cr.numero_documento
          ? `Doc ${cr.numero_documento} (${cr.parcela || '1'})`
          : cr.id,
        descricao: `Título a receber (${clienteNome}) com saldo em aberto divergente`,
        empresaId: cr.empresa_id,
        empresaNome: cr.expand?.empresa_id?.nome_fantasia || cr.expand?.empresa_id?.razao_social,
        valorEsperado: saldoEsperado,
        valorEncontrado: saldoCadastrado,
        diferenca: diffSaldo,
        gravidade: 'alta',
        detalhes: `Valor original: R$ ${valorOriginal.toFixed(2)} | Baixas: R$ ${somaBaixas.toFixed(2)} | Saldo esperado: R$ ${saldoEsperado.toFixed(2)} | Saldo gravado: R$ ${saldoCadastrado.toFixed(2)}`,
      })
    }

    // Conferência (c): nenhum título com situação "Recebido" pode ter saldo diferente de zero
    if (cr.status === 'Recebido' && Math.abs(saldoCadastrado) > 0.009) {
      divergencias.push({
        id: `cr_status_recebido_${cr.id}`,
        categoria: 'conta_receber',
        categoriaRotulo: 'Conta a Receber',
        referenciaId: cr.id,
        referenciaCodigo: cr.numero_documento
          ? `Doc ${cr.numero_documento} (${cr.parcela || '1'})`
          : cr.id,
        descricao: `Título com situação "Recebido" possui saldo residual em aberto`,
        empresaId: cr.empresa_id,
        empresaNome: cr.expand?.empresa_id?.nome_fantasia || cr.expand?.empresa_id?.razao_social,
        valorEsperado: 0,
        valorEncontrado: saldoCadastrado,
        diferenca: saldoCadastrado,
        gravidade: 'alta',
        detalhes: `O título está com status "Recebido", mas seu saldo residual é de R$ ${saldoCadastrado.toFixed(2)} (deveria ser 0,00).`,
      })
    }
  }

  return {
    dataExecucao: new Date().toISOString(),
    totalContasAnalisadas: contas.length,
    totalTitulosPagarAnalisados: titulosPagar.length,
    totalTitulosReceberAnalisados: titulosReceber.length,
    totalDivergencias: divergencias.length,
    divergencias,
  }
}
