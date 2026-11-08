/**
 * Migration 0120: Remover required de campos numéricos em que 0 é um valor legítimo.
 *
 * No PocketBase v0.23+, campos numéricos com `required = true` rejeitam o valor 0
 * ("saldo_inicial: cannot be blank") porque 0 é tratado como zero-value/vazio.
 * Mesma causa corrigida na migration 0115 (contas_pagar/contas_receber/movimentacoes_financeiras).
 *
 * Caso reportado: criar conta financeira "Caixa físico" com saldo inicial 0 → HTTP 400.
 *
 * Esta migration NÃO altera nenhum dado: apenas afrouxa validação de schema.
 * As telas continuam validando o preenchimento; 0 passa a ser aceito.
 */
migrate(
  (app) => {
    const alvos = {
      contas_financeiras: ['saldo_inicial'],
      vendas: ['valor_produtos', 'valor_total'],
      vendas_itens: ['preco_unitario', 'valor_total'],
      caixa_sessoes_movimentos: ['valor'],
      vales_troca: ['saldo'],
      lotes: ['quantidade'],
      notas_entrada_itens: ['valor_unitario_fornecedor'],
      documentos_fiscais_itens: ['valor_unitario', 'valor_total'],
      formas_pagamento_taxas: ['taxa_percentual'],
      inventarios_itens: ['saldo_sistema'],
      extratos_linhas: ['valor'],
    }

    Object.keys(alvos).forEach((colecao) => {
      try {
        const col = app.findCollectionByNameOrId(colecao)
        if (!col) {
          console.log('[Migration 0120] Coleção não encontrada, ignorando: ' + colecao)
          return
        }
        let mudou = false
        alvos[colecao].forEach((campo) => {
          const f = col.fields.getByName(campo)
          if (f && f.required) {
            f.required = false
            mudou = true
          }
        })
        if (mudou) {
          app.save(col)
          console.log(
            '[Migration 0120] ' +
              colecao +
              ': required removido de ' +
              alvos[colecao].join(', ') +
              '.',
          )
        }
      } catch (err) {
        console.error('[Migration 0120] Erro ao atualizar ' + colecao + ':', err)
        throw err
      }
    })
  },
  (app) => {
    // Reverter: restaurar required nos campos afetados (não restaura dados, só schema)
    const alvos = {
      contas_financeiras: ['saldo_inicial'],
      vendas: ['valor_produtos', 'valor_total'],
      vendas_itens: ['preco_unitario', 'valor_total'],
      caixa_sessoes_movimentos: ['valor'],
      vales_troca: ['saldo'],
      lotes: ['quantidade'],
      notas_entrada_itens: ['valor_unitario_fornecedor'],
      documentos_fiscais_itens: ['valor_unitario', 'valor_total'],
      formas_pagamento_taxas: ['taxa_percentual'],
      inventarios_itens: ['saldo_sistema'],
      extratos_linhas: ['valor'],
    }

    Object.keys(alvos).forEach((colecao) => {
      try {
        const col = app.findCollectionByNameOrId(colecao)
        if (!col) return
        let mudou = false
        alvos[colecao].forEach((campo) => {
          const f = col.fields.getByName(campo)
          if (f && !f.required) {
            f.required = true
            mudou = true
          }
        })
        if (mudou) app.save(col)
      } catch (_) {}
    })
  },
)
