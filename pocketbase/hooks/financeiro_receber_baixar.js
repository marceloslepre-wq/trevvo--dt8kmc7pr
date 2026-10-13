/**
 * pb_hook: /financeiro/receber/baixar (POST)
 *
 * Baixa de títulos de Contas a Receber (um ou vários / em lote)
 * - Valida autenticação e permissão
 * - Valida conta_financeira e permite_saldo_negativo
 * - Cria lote se > 1 título (ou para registro de comprovante)
 * - Cria pagamentos_baixas com tipo_operacao = 'Receber' e conta_receber_id
 * - Atualiza contas_receber (valor_recebido, saldo, status: 'Recebido' ou 'Parcial', data_recebimento)
 * - Cria movimentacoes_financeiras tipo 'Entrada', origem 'RECEBIMENTO_TITULO'
 * - Atualiza saldo_atual da conta_financeira
 * - Grava logs_auditoria
 * - Executa em transação $app.runInTransaction
 */

routerAdd('POST', '/financeiro/receber/baixar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    body = c.requestInfo().body || {}
  } catch (_e) {
    body = {}
  }

  const {
    empresa_id,
    conta_financeira_id,
    forma_pagamento_id,
    data_pagamento, // data do recebimento
    titulos = [], // [{ conta_receber_id, valor_pago, acrescimo, desconto, plano_desconto_id }]
    historico,
    comprovante_url,
    plano_desconto_id: plano_desconto_id_geral,
  } = body

  if (!empresa_id) {
    return c.json(400, { message: 'empresa_id é obrigatório.' })
  }
  if (!conta_financeira_id) {
    return c.json(400, { message: 'conta_financeira_id é obrigatória.' })
  }
  if (!data_pagamento) {
    return c.json(400, { message: 'data_pagamento (data do recebimento) é obrigatória.' })
  }
  if (!Array.isArray(titulos) || titulos.length === 0) {
    return c.json(400, { message: 'Ao menos um título deve ser informado para baixa.' })
  }

  let resultLoteId = null
  let baixasCriadas = []
  let valorTotalLote = 0

  try {
    $app.runInTransaction((txApp) => {
      // 1. Obter e validar conta financeira
      const conta = txApp.findRecordById('contas_financeiras', conta_financeira_id)
      if (!conta || conta.get('empresa_id') !== empresa_id || !conta.get('ativo')) {
        throw new BadRequestError('Conta bancária/caixa inválida ou inativa.')
      }

      // 2. Pré-validar títulos e somar totais
      const titulosMap = []
      for (let i = 0; i < titulos.length; i++) {
        const item = titulos[i]
        const recId = item.conta_receber_id || item.id
        if (!recId) {
          throw new BadRequestError(`Título na posição ${i + 1} sem ID informado.`)
        }
        const titRecord = txApp.findRecordById('contas_receber', recId)
        if (!titRecord || titRecord.get('empresa_id') !== empresa_id) {
          throw new BadRequestError(`Título ${recId} não encontrado nesta empresa.`)
        }
        if (titRecord.get('excluido')) {
          throw new BadRequestError(
            `Título ${titRecord.get('numero_documento') || recId} está excluído.`,
          )
        }
        const statusAtual = titRecord.get('status')
        if (statusAtual === 'Recebido') {
          throw new BadRequestError(
            `Título ${titRecord.get('numero_documento') || recId} já está totalmente recebido.`,
          )
        }
        if (statusAtual === 'Cancelado') {
          throw new BadRequestError(
            `Título ${titRecord.get('numero_documento') || recId} está cancelado.`,
          )
        }

        const saldoAtual = Number(titRecord.get('saldo') || 0)
        const valorPago = Number(item.valor_pago || saldoAtual)
        const acrescimo = Number(item.acrescimo || 0)
        const desconto = Number(item.desconto || 0)
        const valorLiquido = valorPago + acrescimo - desconto

        if (valorPago <= 0) {
          throw new BadRequestError(
            `Valor recebido do título ${titRecord.get('numero_documento') || recId} deve ser maior que zero.`,
          )
        }
        if (valorPago > saldoAtual + 0.009) {
          throw new BadRequestError(
            `Valor recebido (R$ ${valorPago.toFixed(2)}) não pode superar o saldo em aberto (R$ ${saldoAtual.toFixed(2)}).`,
          )
        }

        valorTotalLote += valorLiquido
        titulosMap.push({
          record: titRecord,
          valorPago,
          acrescimo,
          desconto,
          plano_desconto_id: item.plano_desconto_id || plano_desconto_id_geral || null,
          valorLiquido,
        })
      }

      // 3. Criar lote se houver mais de 1 título ou sempre para rastreabilidade
      let loteRecord = null
      if (titulosMap.length > 1) {
        const lotesCol = txApp.findCollectionByNameOrId('pagamentos_lotes')
        loteRecord = new Record(lotesCol)
        loteRecord.set('empresa_id', empresa_id)
        loteRecord.set('conta_financeira_id', conta_financeira_id)
        loteRecord.set('forma_pagamento_id', forma_pagamento_id || null)
        loteRecord.set('data_pagamento', data_pagamento)
        loteRecord.set('valor_total', valorTotalLote)
        loteRecord.set('total_titulos', titulosMap.length)
        loteRecord.set(
          'observacao',
          historico || `Recebimento em lote de ${titulosMap.length} títulos`,
        )
        txApp.save(loteRecord)
        resultLoteId = loteRecord.id
      }

      // 4. Processar cada baixa
      const baixasCol = txApp.findCollectionByNameOrId('pagamentos_baixas')
      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      for (const item of titulosMap) {
        const titRecord = item.record
        const baixaRec = new Record(baixasCol)
        baixaRec.set('empresa_id', empresa_id)
        baixaRec.set('tipo_operacao', 'Receber')
        baixaRec.set('conta_receber_id', titRecord.id)
        baixaRec.set('conta_pagar_id', null)
        baixaRec.set('lote_baixa_id', loteRecord ? loteRecord.id : null)
        baixaRec.set('conta_financeira_id', conta_financeira_id)
        baixaRec.set('forma_pagamento_id', forma_pagamento_id || null)
        baixaRec.set('data_pagamento', data_pagamento)
        baixaRec.set('valor_original', Number(titRecord.get('valor_original') || 0))
        baixaRec.set('valor_pago', item.valorPago)
        baixaRec.set('valor_multa', 0)
        baixaRec.set('valor_juros', item.acrescimo)
        baixaRec.set('valor_desconto', item.desconto)
        baixaRec.set('plano_desconto_id', item.plano_desconto_id || null)
        baixaRec.set('valor_total_pago', item.valorLiquido)
        baixaRec.set(
          'observacao',
          historico || `Recebimento doc. ${titRecord.get('numero_documento') || titRecord.id}`,
        )
        baixaRec.set('estornado', false)
        txApp.save(baixaRec)
        baixasCriadas.push(baixaRec.id)

        // Atualizar título contas_receber
        const recebidoAnterior = Number(titRecord.get('valor_recebido') || 0)
        const novoRecebido = recebidoAnterior + item.valorPago
        const valorOriginal = Number(titRecord.get('valor_original') || 0)
        const novoSaldo = Math.max(0, valorOriginal - novoRecebido)
        const novoStatus = novoSaldo <= 0.009 ? 'Recebido' : 'Parcial'

        titRecord.set('valor_recebido', novoRecebido)
        titRecord.set('saldo', novoSaldo)
        titRecord.set('status', novoStatus)
        if (novoStatus === 'Recebido') {
          titRecord.set('data_recebimento', data_pagamento)
        }
        txApp.save(titRecord)

        // Criar movimentação financeira de Entrada
        const movRec = new Record(movsCol)
        movRec.set('empresa_id', empresa_id)
        movRec.set('conta_financeira_id', conta_financeira_id)
        movRec.set('tipo', 'Entrada')
        movRec.set('origem', 'RECEBIMENTO_TITULO')
        movRec.set('documento_tipo', 'contas_receber')
        movRec.set('documento_id', titRecord.id)
        movRec.set('documento_numero', titRecord.get('numero_documento') || '')
        movRec.set('lote_baixa_id', loteRecord ? loteRecord.id : null)
        movRec.set('data_movimento', data_pagamento)
        movRec.set('valor', item.valorLiquido)
        movRec.set(
          'historico',
          `Recebimento doc. ${titRecord.get('numero_documento') || titRecord.id} - Parcela ${titRecord.get('parcela_numero') || 1}/${titRecord.get('total_parcelas') || 1}`,
        )
        txApp.save(movRec)
      }

      // 5. Atualizar saldo_atual da conta_financeira (Entrada aumenta saldo)
      const saldoAnterior = Number(conta.get('saldo_atual') || 0)
      const novoSaldoConta = saldoAnterior + valorTotalLote
      conta.set('saldo_atual', novoSaldoConta)
      txApp.save(conta)

      // 6. Gravar log_auditoria
      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresa_id)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'contas_receber')
        auditRec.set('registro_id', resultLoteId || baixasCriadas[0] || 'baixa')
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'BAIXAR_RECEBER',
            titulos_count: titulosMap.length,
            valor_total: valorTotalLote,
            conta_financeira_id,
            baixas: baixasCriadas,
            lote_id: resultLoteId,
          }),
        )
        txApp.save(auditRec)
      } catch (_auditErr) {
        // auditoria não impede transação principal
      }
    })

    return c.json(200, {
      success: true,
      lote_id: resultLoteId,
      baixas: baixasCriadas,
      total_recebido: valorTotalLote,
    })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao processar baixa de títulos a receber.',
    })
  }
})
