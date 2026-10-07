// Endpoint transacional para movimentação de estoque
routerAdd(
  'POST',
  '/backend/v1/estoque/movimentar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const itensEntrada = Array.isArray(body.itens) ? body.itens : []
    if (itensEntrada.length === 0) {
      return e.json(400, { message: 'Nenhum item informado para movimentação de estoque' })
    }

    // 1. Validar permissão do módulo estoque para o usuário autenticado
    const authId = authRecord.id
    const userEmail = (authRecord.getString('email') || '').toLowerCase().trim()
    const isMasterEmail = userEmail === 'marceloslepre@gmail.com'

    let podeMovimentar = isMasterEmail

    if (!podeMovimentar) {
      try {
        const uERP = $app.findFirstRecordByData('usuarios', 'auth_user_id', authId)
        if (uERP && uERP.getString('perfil_id')) {
          const perfil = $app.findRecordById('perfis_acesso', uERP.getString('perfil_id'))
          if (perfil && perfil.getBool('administrador')) {
            podeMovimentar = true
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
              // Pode criar ou editar no módulo estoque
              if (p.getBool('pode_criar') || p.getBool('pode_editar')) {
                podeMovimentar = true
              }
            }
          }
        }
      } catch (errAuth) {
        // Ignora ou trata abaixo
      }
    }

    if (!podeMovimentar) {
      return e.json(403, {
        message: 'Acesso negado: você não tem permissão para movimentar estoque',
      })
    }

    // 2. Processar itens dentro de uma transação atômica
    const resultadosMovimentos = []

    try {
      $app.runInTransaction((txApp) => {
        // Expandir kits
        const itensProcessar = []

        for (let i = 0; i < itensEntrada.length; i++) {
          const item = itensEntrada[i]
          if (!item.empresa_id || !item.produto_id) {
            throw new Error(`Item ${i + 1}: empresa_id e produto_id são obrigatórios`)
          }

          const produto = txApp.findRecordById('produtos', item.produto_id)
          if (!produto) {
            throw new Error(`Produto não encontrado: ${item.produto_id}`)
          }

          if (!produto.getBool('ativo')) {
            throw new Error(
              `Produto inativo não pode ser movimentado: ${produto.getString('descricao')}`,
            )
          }

          // Se controla_estoque for false, ignora sem erro
          if (!produto.getBool('controla_estoque')) {
            continue
          }

          const qtdItem = parseFloat(item.quantidade)
          if (isNaN(qtdItem) || qtdItem <= 0) {
            throw new Error(
              `Quantidade inválida para o produto ${produto.getString('descricao')}: deve ser maior que 0`,
            )
          }

          const tipoProd = produto.getString('tipo')
          if (tipoProd === 'Kit') {
            // Kit não possui saldo próprio: expande componentes de produtos_kit_itens
            const kitItens = txApp.findRecordsByFilter(
              'produtos_kit_itens',
              `produto_kit_id = '${produto.id}' && ativo = true`,
              '',
              100,
              0,
            )

            if (!kitItens || kitItens.length === 0) {
              throw new Error(
                `O kit "${produto.getString('descricao')}" não possui componentes ativos cadastrados`,
              )
            }

            for (let k = 0; k < kitItens.length; k++) {
              const kitComponente = kitItens[k]
              const componenteProdId = kitComponente.getString('produto_item_id')
              const qtdCompPorKit = kitComponente.getFloat('quantidade') || 1
              const qtdTotalComp = qtdItem * qtdCompPorKit

              itensProcessar.push({
                ...item,
                produto_id: componenteProdId,
                quantidade: qtdTotalComp,
                observacao:
                  (item.observacao ? item.observacao + ' ' : '') +
                  `(Componente do kit: ${produto.getString('descricao')})`,
              })
            }
          } else {
            itensProcessar.push({
              ...item,
              quantidade: qtdItem,
            })
          }
        }

        // Processar cada item expandido
        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')

        for (let j = 0; j < itensProcessar.length; j++) {
          const item = itensProcessar[j]
          const produto = txApp.findRecordById('produtos', item.produto_id)
          const empresa = txApp.findRecordById('empresas', item.empresa_id)

          if (!empresa) {
            throw new Error(`Empresa não encontrada: ${item.empresa_id}`)
          }

          const unidadeId = produto.getString('unidade_id')
          if (unidadeId) {
            try {
              const unidade = txApp.findRecordById('unidades_medida', unidadeId)
              if (unidade && !unidade.getBool('aceita_fracionado')) {
                if (Math.floor(item.quantidade) !== item.quantidade) {
                  throw new Error(
                    `A unidade de medida "${unidade.getString('sigla')}" do produto "${produto.getString(
                      'descricao',
                    )}" não aceita quantidade fracionada (${item.quantidade})`,
                  )
                }
              }
            } catch (_) {}
          }

          const tipoMov = item.tipo // "Entrada" | "Saída"
          if (tipoMov !== 'Entrada' && tipoMov !== 'Saída') {
            throw new Error(`Tipo de movimento inválido: ${tipoMov}. Use "Entrada" ou "Saída"`)
          }

          const origensValidas = [
            'SALDO_INICIAL',
            'AJUSTE_ENTRADA',
            'AJUSTE_SAIDA',
            'PERDA',
            'CONSUMO_INTERNO',
            'BONIFICACAO_ENTRADA',
            'BONIFICACAO_SAIDA',
            'TRANSFERENCIA_ENTRADA',
            'TRANSFERENCIA_SAIDA',
            'INVENTARIO_ENTRADA',
            'INVENTARIO_SAIDA',
            'COMPRA',
            'DEVOLUCAO_COMPRA',
            'VENDA',
            'DEVOLUCAO_VENDA',
            'ESTORNO',
          ]

          if (!origensValidas.includes(item.origem)) {
            throw new Error(`Origem de movimento inválida: ${item.origem}`)
          }

          // Motivo obrigatório para AJUSTE_*, PERDA, CONSUMO_INTERNO
          const exigeMotivo =
            item.origem.startsWith('AJUSTE_') ||
            item.origem === 'PERDA' ||
            item.origem === 'CONSUMO_INTERNO'
          if (exigeMotivo && (!item.motivo || !item.motivo.trim())) {
            throw new Error(`O motivo é obrigatório para operações do tipo ${item.origem}`)
          }

          // Buscar saldo atual em estoque_saldos
          let saldoRecord = null
          try {
            const saldos = txApp.findRecordsByFilter(
              'estoque_saldos',
              `empresa_id = '${item.empresa_id}' && produto_id = '${item.produto_id}'`,
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
            // Se não existe registro de saldo ainda, pega o preco_custo cadastrado no produto
            custoMedioAnt = produto.getFloat('preco_custo') || 0
          }

          const qtdMov = item.quantidade

          // Validação de saldo negativo para Saída
          if (tipoMov === 'Saída') {
            const saldoAposSaida = Math.round((saldoAnt - qtdMov) * 10000) / 10000
            const permiteNegativo = empresa.getBool('permite_estoque_negativo')
            if (saldoAposSaida < 0 && !permiteNegativo) {
              throw new Error(
                `Estoque insuficiente: produto ${produto.getString(
                  'descricao',
                )}, saldo ${saldoAnt.toFixed(4)}, solicitado ${qtdMov.toFixed(4)}`,
              )
            }
          }

          // Cálculo de custo médio ponderado
          let custoUnitarioMov = 0
          let custoMedioPos = custoMedioAnt
          let saldoPos = 0

          if (tipoMov === 'Entrada') {
            saldoPos = Math.round((saldoAnt + qtdMov) * 10000) / 10000
            if (
              item.custo_unitario !== undefined &&
              item.custo_unitario !== null &&
              item.custo_unitario !== ''
            ) {
              custoUnitarioMov = parseFloat(item.custo_unitario) || 0
              if (saldoAnt <= 0) {
                custoMedioPos = custoUnitarioMov
              } else {
                const somaValores = saldoAnt * custoMedioAnt + qtdMov * custoUnitarioMov
                const divisor = saldoAnt + qtdMov
                custoMedioPos = divisor > 0 ? somaValores / divisor : custoUnitarioMov
              }
            } else {
              // Entrada sem custo informado: mantém o custo médio atual
              custoUnitarioMov = custoMedioAnt
              custoMedioPos = custoMedioAnt
            }
          } else {
            // Saída: custo unitário é sempre o custo médio atual (não altera o custo médio do saldo)
            saldoPos = Math.round((saldoAnt - qtdMov) * 10000) / 10000
            custoUnitarioMov = custoMedioAnt
            custoMedioPos = custoMedioAnt
          }

          // Arredondamentos regulamentares (4 casas para qtd/custo, 2 para valor_total)
          saldoPos = Math.round(saldoPos * 10000) / 10000
          custoMedioPos = Math.round(custoMedioPos * 10000) / 10000
          custoUnitarioMov = Math.round(custoUnitarioMov * 10000) / 10000

          const valorTotalMov = Math.round(qtdMov * custoUnitarioMov * 100) / 100
          const valorTotalSaldo = Math.round(saldoPos * custoMedioPos * 100) / 100

          const dataHoraAgora = item.data_movimento || new Date().toISOString()

          // 1. Gravar/atualizar estoque_saldos
          if (!saldoRecord) {
            saldoRecord = new Record(saldosCol)
            saldoRecord.set('empresa_id', item.empresa_id)
            saldoRecord.set('produto_id', item.produto_id)
            saldoRecord.set('ativo', true)
            saldoRecord.set('created_by', authId)
          }

          saldoRecord.set('quantidade', saldoPos)
          saldoRecord.set('custo_medio', custoMedioPos)
          saldoRecord.set('valor_total', valorTotalSaldo)
          if (tipoMov === 'Entrada') {
            saldoRecord.set('data_ultima_entrada', dataHoraAgora)
          } else {
            saldoRecord.set('data_ultima_saida', dataHoraAgora)
          }
          saldoRecord.set('updated_by', authId)
          txApp.save(saldoRecord)

          // 2. Gravar estoque_movimentos (kardex)
          const movRecord = new Record(movsCol)
          movRecord.set('empresa_id', item.empresa_id)
          movRecord.set('produto_id', item.produto_id)
          movRecord.set('data_movimento', dataHoraAgora)
          movRecord.set('tipo', tipoMov)
          movRecord.set('origem', item.origem)
          movRecord.set('quantidade', qtdMov)
          movRecord.set('custo_unitario', custoUnitarioMov)
          movRecord.set('valor_total', valorTotalMov)
          movRecord.set('saldo_anterior', saldoAnt)
          movRecord.set('saldo_posterior', saldoPos)
          movRecord.set('custo_medio_anterior', custoMedioAnt)
          movRecord.set('custo_medio_posterior', custoMedioPos)
          if (item.lote_id) movRecord.set('lote_id', item.lote_id)
          if (item.documento_tipo) movRecord.set('documento_tipo', item.documento_tipo)
          if (item.documento_id) movRecord.set('documento_id', item.documento_id)
          if (item.documento_numero) movRecord.set('documento_numero', item.documento_numero)
          if (item.motivo) movRecord.set('motivo', item.motivo.trim())
          if (item.observacao) movRecord.set('observacao', item.observacao.trim())
          movRecord.set('usuario_id', authId)
          movRecord.set('estornado', false)
          movRecord.set('ativo', true)
          movRecord.set('created_by', authId)
          movRecord.set('updated_by', authId)

          txApp.save(movRecord)

          // 3. Gravar log de auditoria
          try {
            const logRec = new Record(logsCol)
            logRec.set('usuario_id', authId)
            logRec.set('usuario_nome', authRecord.getString('name') || userEmail)
            logRec.set('empresa_id', item.empresa_id)
            logRec.set('tabela', 'estoque_movimentos')
            logRec.set('registro_id', movRecord.id)
            logRec.set('acao', 'inclusao')
            logRec.set('valores_depois', {
              empresa_id: item.empresa_id,
              produto_id: item.produto_id,
              tipo: tipoMov,
              origem: item.origem,
              quantidade: qtdMov,
              custo_unitario: custoUnitarioMov,
              saldo_anterior: saldoAnt,
              saldo_posterior: saldoPos,
              custo_medio_anterior: custoMedioAnt,
              custo_medio_posterior: custoMedioPos,
            })
            txApp.save(logRec)
          } catch (_) {}

          resultadosMovimentos.push({
            id: movRecord.id,
            empresa_id: item.empresa_id,
            produto_id: item.produto_id,
            produto_descricao: produto.getString('descricao'),
            tipo: tipoMov,
            origem: item.origem,
            quantidade: qtdMov,
            custo_unitario: custoUnitarioMov,
            valor_total: valorTotalMov,
            saldo_anterior: saldoAnt,
            saldo_posterior: saldoPos,
            custo_medio_anterior: custoMedioAnt,
            custo_medio_posterior: custoMedioPos,
            data_movimento: dataHoraAgora,
          })
        }
      })

      return e.json(200, {
        sucesso: true,
        total: resultadosMovimentos.length,
        movimentos: resultadosMovimentos,
      })
    } catch (errTx) {
      const errMsg = errTx instanceof Error ? errTx.message : String(errTx)
      return e.json(400, {
        sucesso: false,
        message: errMsg,
      })
    }
  },
  $apis.requireAuth(),
)
