/**
 * Migration 0115: Remover required de campos numéricos que legitimamente podem ser 0
 * em contas_pagar, contas_receber e movimentacoes_financeiras.
 *
 * No PocketBase v0.23+, campos numéricos com `required = true` rejeitam o valor 0
 * com o erro de validação: "cannot be blank." porque 0 é tratado como zero-value/vazio.
 * Ao pagar/receber o valor total de um título, o saldo residual é 0, o que gerava HTTP 400.
 */
migrate(
  (app) => {
    // 1. contas_pagar
    try {
      const col = app.findCollectionByNameOrId('contas_pagar')
      if (col) {
        let mudou = false
        const campos = [
          'saldo',
          'valor_pago',
          'valor_original',
          'recorrencia_numero',
          'recorrencia_total',
        ]
        for (let i = 0; i < campos.length; i++) {
          const f = col.fields.getByName(campos[i])
          if (f && f.required) {
            f.required = false
            mudou = true
          }
        }
        if (mudou) {
          app.save(col)
          console.log('[Migration 0115] contas_pagar: required removido de campos numéricos.')
        }
      }
    } catch (errPagar) {
      console.error('[Migration 0115] Erro ao atualizar contas_pagar:', errPagar)
      throw errPagar
    }

    // 2. contas_receber
    try {
      const col = app.findCollectionByNameOrId('contas_receber')
      if (col) {
        let mudou = false
        const campos = [
          'saldo',
          'valor_recebido',
          'valor_original',
          'recorrencia_numero',
          'recorrencia_total',
        ]
        for (let i = 0; i < campos.length; i++) {
          const f = col.fields.getByName(campos[i])
          if (f && f.required) {
            f.required = false
            mudou = true
          }
        }
        if (mudou) {
          app.save(col)
          console.log('[Migration 0115] contas_receber: required removido de campos numéricos.')
        }
      }
    } catch (errReceber) {
      console.error('[Migration 0115] Erro ao atualizar contas_receber:', errReceber)
      throw errReceber
    }

    // 3. movimentacoes_financeiras
    try {
      const col = app.findCollectionByNameOrId('movimentacoes_financeiras')
      if (col) {
        let mudou = false
        const campos = ['valor', 'saldo_anterior', 'saldo_posterior']
        for (let i = 0; i < campos.length; i++) {
          const f = col.fields.getByName(campos[i])
          if (f && f.required) {
            f.required = false
            mudou = true
          }
        }
        if (mudou) {
          app.save(col)
          console.log(
            '[Migration 0115] movimentacoes_financeiras: required removido de campos numéricos.',
          )
        }
      }
    } catch (errMov) {
      console.error('[Migration 0115] Erro ao atualizar movimentacoes_financeiras:', errMov)
      throw errMov
    }

    // 4. pagamentos_baixas (garantir que valores que podem ser 0 não sejam rejeitados)
    try {
      const col = app.findCollectionByNameOrId('pagamentos_baixas')
      if (col) {
        let mudou = false
        const campos = [
          'valor_original',
          'valor_pago',
          'valor_multa',
          'valor_juros',
          'valor_desconto',
          'valor_total_pago',
        ]
        for (let i = 0; i < campos.length; i++) {
          const f = col.fields.getByName(campos[i])
          if (f && f.required) {
            f.required = false
            mudou = true
          }
        }
        if (mudou) {
          app.save(col)
          console.log('[Migration 0115] pagamentos_baixas: required removido de campos numéricos.')
        }
      }
    } catch (errBaixas) {
      console.error('[Migration 0115] Erro ao atualizar pagamentos_baixas:', errBaixas)
      throw errBaixas
    }
  },
  (app) => {
    // Reverter caso necessário
    try {
      const colCp = app.findCollectionByNameOrId('contas_pagar')
      if (colCp) {
        const fSaldo = colCp.fields.getByName('saldo')
        if (fSaldo) fSaldo.required = true
        const fVal = colCp.fields.getByName('valor_original')
        if (fVal) fVal.required = true
        app.save(colCp)
      }
    } catch (_) {}

    try {
      const colCr = app.findCollectionByNameOrId('contas_receber')
      if (colCr) {
        const fSaldo = colCr.fields.getByName('saldo')
        if (fSaldo) fSaldo.required = true
        const fVal = colCr.fields.getByName('valor_original')
        if (fVal) fVal.required = true
        app.save(colCr)
      }
    } catch (_) {}
  },
)
