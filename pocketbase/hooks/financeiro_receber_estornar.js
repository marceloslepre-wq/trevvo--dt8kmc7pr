/**
 * pb_hook: /financeiro/receber/estornar-recebimento (POST)
 *
 * Estorno de recebimento (baixa individual ou estorno de todas as baixas ativas de um título)
 * - Valida autenticação
 * - Reverte baixa(s) marcando estornado = true, data_estorno, motivo_estorno
 * - Reverte contas_receber: subtrai valor recebido, recalcula saldo e status
 * - Cria movimentação financeira de saída (ESTORNO_RECEBIMENTO)
 * - Atualiza saldo_atual da conta_financeira (diminui pelo valor do estorno)
 * - Valida permite_saldo_negativo caso o estorno torne o saldo da conta negativo
 * - Grava log de auditoria
 * - Transação atômica
 */

routerAdd('POST', '/financeiro/receber/estornar-recebimento', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

  let body = {}
  try {
    body = c.requestInfo().body || {}
  } catch (_e) {
    body = {}
  }

  const { empresa_id, baixa_id, conta_receber_id, motivo } = body

  if (!empresa_id) {
    return c.json(400, { message: 'empresa_id é obrigatório.' })
  }
  if (!baixa_id && !conta_receber_id) {
    return c.json(400, { message: 'Informe baixa_id ou conta_receber_id para estorno.' })
  }
  if (!motivo || !motivo.trim()) {
    return c.json(400, { message: 'Motivo do estorno é obrigatório.' })
  }

  // Validação multi-tenant: o usuário precisa ter vínculo com a empresa
  try {
    exigirEmpresaDoUsuario(authRecord, empresa_id)
  } catch (errTenancy) {
    return c.json(403, {
      message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
    })
  }

  let totalEstornado = 0
  let baixasEstornadas = []

  try {
    $app.runInTransaction((txApp) => {
      // 1. Identificar baixas a estornar
      let recordsBaixas = []
      if (baixa_id) {
        const b = txApp.findRecordById('pagamentos_baixas', baixa_id)
        if (!b || b.get('empresa_id') !== empresa_id) {
          throw new BadRequestError('Baixa não encontrada nesta empresa.')
        }
        if (b.get('estornado')) {
          throw new BadRequestError('Esta baixa já se encontra estornada.')
        }
        recordsBaixas.push(b)
      } else if (conta_receber_id) {
        // Todas as baixas ativas do título
        const rows = txApp.findRecordsByFilter(
          'pagamentos_baixas',
          `empresa_id = '${empresa_id}' && conta_receber_id = '${conta_receber_id}' && estornado = false`,
          '-created',
          100,
          0,
        )
        if (!rows || rows.length === 0) {
          throw new BadRequestError('Nenhuma baixa ativa encontrada para este título.')
        }
        recordsBaixas = rows
      }

      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
      const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
      const dataEstorno = new Date().toISOString()

      // 2. Processar cada baixa
      for (const baixa of recordsBaixas) {
        const contaFinId = baixa.get('conta_financeira_id')
        const conta = txApp.findRecordById('contas_financeiras', contaFinId)
        if (!conta) {
          throw new BadRequestError(
            `Conta financeira vinculada à baixa ${baixa.id} não encontrada.`,
          )
        }

        const valorTotalBaixa = Number(
          baixa.get('valor_total_pago') || baixa.get('valor_total') || 0,
        )
        const valorPrincipalBaixa = Number(
          baixa.get('valor_pago') || baixa.get('valor_principal') || 0,
        )
        const titId = baixa.get('conta_receber_id')

        // Validar se estorno deixará saldo negativo e se a conta permite
        const saldoConta = Number(conta.get('saldo_atual') || 0)
        const novoSaldoConta = saldoConta - valorTotalBaixa
        const permiteNegativo = Boolean(conta.get('permite_saldo_negativo'))
        if (novoSaldoConta < 0 && !permiteNegativo) {
          throw new BadRequestError(
            `Estorno não permitido: saldo da conta '${conta.get('nome')}' ficaria negativo (R$ ${novoSaldoConta.toFixed(2)}) e a conta não permite saldo negativo.`,
          )
        }

        // Marcar baixa como estornada
        baixa.set('estornado', true)
        baixa.set('data_estorno', dataEstorno)
        baixa.set('motivo_estorno', motivo.trim())
        txApp.save(baixa)
        baixasEstornadas.push(baixa.id)
        totalEstornado += valorTotalBaixa

        // Atualizar conta financeira (Subtrai entrada anterior)
        conta.set('saldo_atual', novoSaldoConta)
        txApp.save(conta)

        // Criar movimentação de estorno (Saída)
        const movEstorno = new Record(movsCol)
        movEstorno.set('empresa_id', empresa_id)
        movEstorno.set('conta_financeira_id', contaFinId)
        movEstorno.set('tipo', 'Saída')
        movEstorno.set('origem', 'ESTORNO_RECEBIMENTO')
        movEstorno.set('documento_tipo', 'contas_receber')
        movEstorno.set('documento_id', titId || '')
        movEstorno.set('documento_numero', baixa.id)
        movEstorno.set('data_movimento', dataEstorno.split('T')[0])
        movEstorno.set('valor', valorTotalBaixa)
        movEstorno.set('historico', `Estorno recebimento baixa #${baixa.id}: ${motivo.trim()}`)
        txApp.save(movEstorno)

        // Atualizar contas_receber
        if (titId) {
          try {
            const tit = txApp.findRecordById('contas_receber', titId)
            if (tit) {
              const recAtual = Number(tit.get('valor_recebido') || 0)
              const novoRecebido = Math.max(0, recAtual - valorPrincipalBaixa)
              const valorOriginal = Number(tit.get('valor_original') || 0)
              const novoSaldo = Math.max(0, valorOriginal - novoRecebido)

              let novoStatus = 'Aberto'
              if (novoRecebido > 0) {
                novoStatus = 'Parcial'
              }

              tit.set('valor_recebido', novoRecebido)
              tit.set('saldo', novoSaldo)
              tit.set('status', novoStatus)
              if (novoStatus !== 'Recebido') {
                tit.set('data_recebimento', null)
              }
              txApp.save(tit)
            }
          } catch (_titErr) {
            // continua se o título foi removido
          }
        }
      }

      // 3. Log de auditoria
      try {
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresa_id)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'contas_receber')
        auditRec.set('registro_id', baixa_id || conta_receber_id || 'estorno')
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'ESTORNAR_RECEBIMENTO',
            baixas_estornadas: baixasEstornadas,
            total_estornado: totalEstornado,
            motivo: motivo.trim(),
          }),
        )
        txApp.save(auditRec)
      } catch (_auditErr) {
        // auditoria secundária
      }
    })

    return c.json(200, {
      success: true,
      baixas_estornadas: baixasEstornadas,
      total_estornado: totalEstornado,
    })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao estornar recebimento.',
    })
  }
})
