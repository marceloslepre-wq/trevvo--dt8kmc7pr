/**
 * Hook de estorno de movimento de estoque
 * Endpoint: POST /estoque/estornar
 *
 * Regras:
 * - Localiza o movimento original
 * - Verifica se já foi estornado
 * - Cria um novo movimento inverso com origem 'ESTORNO', vinculando movimento_estornado_id
 * - Marca o movimento original com estornado = true e movimento_estorno_id
 * - Atualiza a quantidade do lote correspondente se movimento tiver lote_id vinculado
 * - Atualiza estoque_saldos com o novo saldo resultante
 * - Se produto controla lote, preserva a invariante (soma dos lotes = saldo geral)
 * - Tudo executado dentro de uma transação atômica do SQLite (runInTransaction)
 */

routerAdd('POST', '/estoque/estornar', (c) => {
  const authRecord = c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Usuário não autenticado.' })
  }

  let body = {}
  try {
    body = $apis.requestInfo(c).data || {}
  } catch (err) {
    return c.json(400, { sucesso: false, message: 'Corpo da requisição inválido.' })
  }

  const movimentoId = body.movimento_id
  const motivo = body.motivo || 'Estorno manual'

  if (!movimentoId) {
    return c.json(400, { sucesso: false, message: 'movimento_id é obrigatório.' })
  }

  const userId = authRecord.id
  let novoMovimentoId = ''

  try {
    $app.runInTransaction((txApp) => {
      // 1. Buscar movimento original
      const movOrig = txApp.findRecordById('estoque_movimentos', movimentoId)
      if (!movOrig) {
        throw new Error('Movimento de estoque não encontrado.')
      }

      if (movOrig.getBool('estornado')) {
        throw new Error('Este movimento já foi estornado anteriormente.')
      }

      if (movOrig.getString('origem') === 'ESTORNO') {
        throw new Error('Não é possível estornar um movimento que já é um estorno.')
      }

      const empresaId = movOrig.getString('empresa_id')
      const produtoId = movOrig.getString('produto_id')
      const tipoOriginal = movOrig.getString('tipo') // 'Entrada' ou 'Saída'
      const qtdOriginal = movOrig.getFloat('quantidade') || 0
      const custoUnitario = movOrig.getFloat('custo_unitario') || 0
      const loteIdOriginal = movOrig.getString('lote_id')

      const prod = txApp.findRecordById('produtos', produtoId)
      const descProd = prod ? prod.getString('descricao') : 'Produto'
      const controlaLote = prod ? prod.getBool('controla_lote_validade') : false

      // 2. Tipo inverso para o estorno
      const tipoEstorno = tipoOriginal === 'Entrada' ? 'Saída' : 'Entrada'

      // 3. Atualizar estoque_saldos
      const saldos = txApp.findRecordsByFilter(
        'estoque_saldos',
        `empresa_id = '${empresaId}' && produto_id = '${produtoId}'`,
        '',
        1,
        0,
      )

      if (saldos.length === 0) {
        throw new Error('Saldo de estoque do produto não encontrado.')
      }

      const saldoRec = saldos[0]
      const saldoAnterior = saldoRec.getFloat('quantidade') || 0
      const custoMedio = saldoRec.getFloat('custo_medio') || 0

      // Se original foi entrada, estorno é saída (subtrai)
      // Se original foi saída, estorno é entrada (soma)
      const saldoPosterior =
        tipoEstorno === 'Entrada' ? saldoAnterior + qtdOriginal : saldoAnterior - qtdOriginal

      // Se estorno resultar em negativo, checar regra da filial
      const emp = txApp.findRecordById('empresas', empresaId)
      if (saldoPosterior < 0 && (!emp || !emp.getBool('permite_estoque_negativo'))) {
        throw new Error(
          `Não é possível estornar: o saldo ficaria negativo (${saldoPosterior.toFixed(4)}), o que não é permitido nesta filial.`,
        )
      }

      saldoRec.set('quantidade', saldoPosterior)
      saldoRec.set('valor_total', Math.max(0, saldoPosterior * custoMedio))
      saldoRec.set('updated_by', userId)
      txApp.save(saldoRec)

      // 4. Se o movimento possui lote vinculado, reverte a quantidade no lote correto
      if (loteIdOriginal) {
        try {
          const loteRec = txApp.findRecordById('lotes', loteIdOriginal)
          if (loteRec) {
            const saldoLoteAtual = loteRec.getFloat('quantidade') || 0
            // Se o original foi Entrada, o estorno retira do lote (- qtdOriginal)
            // Se o original foi Saída, o estorno devolve ao lote (+ qtdOriginal)
            const novoSaldoLote =
              tipoEstorno === 'Entrada'
                ? saldoLoteAtual + qtdOriginal
                : saldoLoteAtual - qtdOriginal

            if (novoSaldoLote < 0 && (!emp || !emp.getBool('permite_estoque_negativo'))) {
              throw new Error(
                `Não é possível estornar: o saldo do lote ${loteRec.getString('numero_lote')} ficaria negativo (${novoSaldoLote.toFixed(4)}).`,
              )
            }

            loteRec.set('quantidade', novoSaldoLote)
            loteRec.set('updated_by', userId)
            txApp.save(loteRec)
          }
        } catch (errLote) {
          throw new Error(`Erro ao estornar lote vinculado: ${errLote.message || errLote}`)
        }
      }

      // 5. Invariante de integridade: se produto controla lote, valida a soma
      if (controlaLote) {
        const todosLotes = txApp.findRecordsByFilter(
          'lotes',
          `empresa_id = '${empresaId}' && produto_id = '${produtoId}' && ativo = true`,
        )
        let somaLotes = 0
        for (let s = 0; s < todosLotes.length; s++) {
          somaLotes += todosLotes[s].getFloat('quantidade') || 0
        }

        const dif = Math.abs(somaLotes - saldoPosterior)
        if (dif > 0.001) {
          throw new Error(
            `Invariante de estoque violada no estorno de "${descProd}": soma dos lotes (${somaLotes.toFixed(4)}) difere do saldo geral (${saldoPosterior.toFixed(4)}).`,
          )
        }
      }

      // 6. Criar movimento inverso de estorno
      const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
      const movEstorno = new Record(movsCol)
      movEstorno.set('empresa_id', empresaId)
      movEstorno.set('produto_id', produtoId)
      movEstorno.set('data_movimento', new Date().toISOString())
      movEstorno.set('tipo', tipoEstorno)
      movEstorno.set('origem', 'ESTORNO')
      movEstorno.set('quantidade', qtdOriginal)
      movEstorno.set('custo_unitario', custoUnitario)
      movEstorno.set('valor_total', qtdOriginal * custoUnitario)
      movEstorno.set('saldo_anterior', saldoAnterior)
      movEstorno.set('saldo_posterior', saldoPosterior)
      movEstorno.set('custo_medio_anterior', custoMedio)
      movEstorno.set('custo_medio_posterior', custoMedio)
      movEstorno.set('lote_id', loteIdOriginal || '')
      movEstorno.set('documento_tipo', 'Estorno')
      movEstorno.set('documento_id', movOrig.id)
      movEstorno.set('documento_numero', movOrig.getString('documento_numero') || '')
      movEstorno.set('motivo', motivo)
      movEstorno.set('observacao', `Estorno referente ao movimento #${movOrig.id}`)
      movEstorno.set('movimento_estornado_id', movOrig.id)
      movEstorno.set('usuario_id', userId)
      movEstorno.set('estornado', false)
      movEstorno.set('ativo', true)
      movEstorno.set('created_by', userId)
      movEstorno.set('updated_by', userId)
      txApp.save(movEstorno)

      novoMovimentoId = movEstorno.id

      // 7. Marcar movimento original como estornado
      movOrig.set('estornado', true)
      movOrig.set('movimento_estorno_id', novoMovimentoId)
      movOrig.set('updated_by', userId)
      txApp.save(movOrig)
    })

    return c.json(200, {
      sucesso: true,
      message: 'Movimento estornado com sucesso.',
      movimento_estorno_id: novoMovimentoId,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
