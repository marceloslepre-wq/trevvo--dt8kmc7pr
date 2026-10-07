// Endpoint para estorno de movimento de estoque
routerAdd(
  'POST',
  '/backend/v1/estoque/estornar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const movimentoId = body.movimento_id
    const motivo = body.motivo

    if (!movimentoId) {
      return e.json(400, { message: 'movimento_id é obrigatório' })
    }

    if (!motivo || !motivo.trim()) {
      return e.json(400, { message: 'O motivo do estorno é obrigatório' })
    }

    // 1. Validar permissão
    const authId = authRecord.id
    const userEmail = (authRecord.getString('email') || '').toLowerCase().trim()
    const isMasterEmail = userEmail === 'marceloslepre@gmail.com'

    let podeEstornar = isMasterEmail

    if (!podeEstornar) {
      try {
        const uERP = $app.findFirstRecordByData('usuarios', 'auth_user_id', authId)
        if (uERP && uERP.getString('perfil_id')) {
          const perfil = $app.findRecordById('perfis_acesso', uERP.getString('perfil_id'))
          if (perfil && perfil.getBool('administrador')) {
            podeEstornar = true
          } else {
            const perms = $app.findRecordsByFilter(
              'permissoes',
              `perfil_id = '${perfil.id}' && modulo = 'estoque'`,
              '',
              1,
              0,
            )
            if (perms && perms.length > 0) {
              const p = perms[0]
              if (p.getBool('pode_editar') || p.getBool('pode_excluir')) {
                podeEstornar = true
              }
            }
          }
        }
      } catch (_) {}
    }

    if (!podeEstornar) {
      return e.json(403, {
        message: 'Acesso negado: você não tem permissão para estornar movimentos de estoque',
      })
    }

    let resultadoEstorno = null

    try {
      $app.runInTransaction((txApp) => {
        const movOriginal = txApp.findRecordById('estoque_movimentos', movimentoId)
        if (!movOriginal) {
          throw new Error('Movimento não encontrado')
        }

        if (movOriginal.getBool('estornado')) {
          throw new Error('Este movimento já foi estornado anteriormente')
        }

        if (movOriginal.getString('origem') === 'ESTORNO') {
          throw new Error('Não é permitido estornar um movimento de ESTORNO')
        }

        const docTipo = movOriginal.getString('documento_tipo') || ''
        if (docTipo && docTipo !== 'Ajuste') {
          throw new Error(
            `Este movimento possui documento de origem "${docTipo}". Movimentos vinculados a documentos só podem ser estornados pelo cancelamento/estorno do próprio documento (${docTipo}).`,
          )
        }

        const empresaId = movOriginal.getString('empresa_id')
        const produtoId = movOriginal.getString('produto_id')
        const tipoOriginal = movOriginal.getString('tipo') // "Entrada" ou "Saída"
        const tipoInvertido = tipoOriginal === 'Entrada' ? 'Saída' : 'Entrada'
        const qtdMov = movOriginal.getFloat('quantidade')
        const custoUnitario = movOriginal.getFloat('custo_unitario') || 0

        const produto = txApp.findRecordById('produtos', produtoId)
        const empresa = txApp.findRecordById('empresas', empresaId)

        // Buscar saldo atual
        let saldoRecord = null
        try {
          const saldos = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${produtoId}'`,
            '',
            1,
            0,
          )
          if (saldos && saldos.length > 0) {
            saldoRecord = saldos[0]
          }
        } catch (_) {}

        let saldoAnt = 0
        let custoMedioAnt = 0
        if (saldoRecord) {
          saldoAnt = saldoRecord.getFloat('quantidade') || 0
          custoMedioAnt = saldoRecord.getFloat('custo_medio') || 0
        } else {
          custoMedioAnt = produto.getFloat('preco_custo') || 0
        }

        // Validação de saldo negativo se o estorno resultar em Saída
        if (tipoInvertido === 'Saída') {
          const saldoAposSaida = Math.round((saldoAnt - qtdMov) * 10000) / 10000
          const permiteNegativo = empresa.getBool('permite_estoque_negativo')
          if (saldoAposSaida < 0 && !permiteNegativo) {
            throw new Error(
              `Estoque insuficiente para estorno: produto ${produto.getString(
                'descricao',
              )}, saldo atual ${saldoAnt.toFixed(4)}, necessário ${qtdMov.toFixed(4)}`,
            )
          }
        }

        let saldoPos = 0
        let custoMedioPos = custoMedioAnt

        if (tipoInvertido === 'Entrada') {
          saldoPos = Math.round((saldoAnt + qtdMov) * 10000) / 10000
          if (saldoAnt <= 0) {
            custoMedioPos = custoUnitario
          } else {
            const somaVal = saldoAnt * custoMedioAnt + qtdMov * custoUnitario
            const div = saldoAnt + qtdMov
            custoMedioPos = div > 0 ? somaVal / div : custoUnitario
          }
        } else {
          saldoPos = Math.round((saldoAnt - qtdMov) * 10000) / 10000
          custoMedioPos = custoMedioAnt
        }

        saldoPos = Math.round(saldoPos * 10000) / 10000
        custoMedioPos = Math.round(custoMedioPos * 10000) / 10000
        const valorTotalMov = Math.round(qtdMov * custoUnitario * 100) / 100
        const valorTotalSaldo = Math.round(saldoPos * custoMedioPos * 100) / 100

        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const dataHoraAgora = new Date().toISOString()

        // 1. Atualizar ou criar estoque_saldos
        if (!saldoRecord) {
          saldoRecord = new Record(saldosCol)
          saldoRecord.set('empresa_id', empresaId)
          saldoRecord.set('produto_id', produtoId)
          saldoRecord.set('ativo', true)
          saldoRecord.set('created_by', authId)
        }

        saldoRecord.set('quantidade', saldoPos)
        saldoRecord.set('custo_medio', custoMedioPos)
        saldoRecord.set('valor_total', valorTotalSaldo)
        if (tipoInvertido === 'Entrada') {
          saldoRecord.set('data_ultima_entrada', dataHoraAgora)
        } else {
          saldoRecord.set('data_ultima_saida', dataHoraAgora)
        }
        saldoRecord.set('updated_by', authId)
        txApp.save(saldoRecord)

        // 2. Criar novo movimento de ESTORNO
        const movEstorno = new Record(movsCol)
        movEstorno.set('empresa_id', empresaId)
        movEstorno.set('produto_id', produtoId)
        movEstorno.set('data_movimento', dataHoraAgora)
        movEstorno.set('tipo', tipoInvertido)
        movEstorno.set('origem', 'ESTORNO')
        movEstorno.set('quantidade', qtdMov)
        movEstorno.set('custo_unitario', custoUnitario)
        movEstorno.set('valor_total', valorTotalMov)
        movEstorno.set('saldo_anterior', saldoAnt)
        movEstorno.set('saldo_posterior', saldoPos)
        movEstorno.set('custo_medio_anterior', custoMedioAnt)
        movEstorno.set('custo_medio_posterior', custoMedioPos)
        movEstorno.set('motivo', motivo.trim())
        movEstorno.set('observacao', `Estorno referente ao movimento #${movOriginal.id}`)
        movEstorno.set('movimento_estornado_id', movOriginal.id)
        movEstorno.set('documento_tipo', docTipo || 'Ajuste')
        movEstorno.set('documento_id', movOriginal.getString('documento_id'))
        movEstorno.set('documento_numero', movOriginal.getString('documento_numero'))
        movEstorno.set('usuario_id', authId)
        movEstorno.set('estornado', false)
        movEstorno.set('ativo', true)
        movEstorno.set('created_by', authId)
        movEstorno.set('updated_by', authId)
        txApp.save(movEstorno)

        // 3. Atualizar o movimento original como estornado
        movOriginal.set('estornado', true)
        movOriginal.set('movimento_estorno_id', movEstorno.id)
        movOriginal.set('updated_by', authId)
        txApp.save(movOriginal)

        // 4. Auditoria
        try {
          const logRec = new Record(logsCol)
          logRec.set('usuario_id', authId)
          logRec.set('usuario_nome', authRecord.getString('name') || userEmail)
          logRec.set('empresa_id', empresaId)
          logRec.set('tabela', 'estoque_movimentos')
          logRec.set('registro_id', movEstorno.id)
          logRec.set('acao', 'inclusao')
          logRec.set('valores_depois', {
            movimento_estornado_id: movOriginal.id,
            movimento_estorno_id: movEstorno.id,
            motivo: motivo.trim(),
            quantidade: qtdMov,
            tipo: tipoInvertido,
          })
          txApp.save(logRec)
        } catch (_) {}

        resultadoEstorno = {
          movimento_estorno_id: movEstorno.id,
          movimento_original_id: movOriginal.id,
          tipo: tipoInvertido,
          quantidade: qtdMov,
          saldo_posterior: saldoPos,
          custo_medio_posterior: custoMedioPos,
        }
      })

      return e.json(200, {
        sucesso: true,
        message: 'Movimento estornado com sucesso',
        resultado: resultadoEstorno,
      })
    } catch (errEstorno) {
      const msg = errEstorno instanceof Error ? errEstorno.message : String(errEstorno)
      return e.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)
