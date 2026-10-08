/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0036: Fechamento das API rules de movimentacoes_financeiras e extratos_linhas
 *
 * Regra do ERP:
 * - movimentacoes_financeiras e extratos_linhas possuem createRule, updateRule e deleteRule fechadas (null).
 * - Apenas superuser / hooks transacionais em pocketbase/hooks/ podem gravar, alterar ou excluir registros.
 * - Leitura (listRule / viewRule) permanece liberada para usuários autenticados (@request.auth.id != '').
 */

migrate(
  (app) => {
    // 1. movimentacoes_financeiras
    try {
      const movsCol = app.findCollectionByNameOrId('movimentacoes_financeiras')
      if (movsCol) {
        movsCol.listRule = "@request.auth.id != ''"
        movsCol.viewRule = "@request.auth.id != ''"
        movsCol.createRule = null
        movsCol.updateRule = null
        movsCol.deleteRule = null
        app.save(movsCol)
      }
    } catch (errMovs) {
      console.error('Erro ao atualizar regras de movimentacoes_financeiras:', errMovs)
    }

    // 2. extratos_linhas
    try {
      const extratosCol = app.findCollectionByNameOrId('extratos_linhas')
      if (extratosCol) {
        extratosCol.listRule = "@request.auth.id != ''"
        extratosCol.viewRule = "@request.auth.id != ''"
        extratosCol.createRule = null
        extratosCol.updateRule = null
        extratosCol.deleteRule = null
        app.save(extratosCol)
      }
    } catch (errExtratos) {
      console.error('Erro ao atualizar regras de extratos_linhas:', errExtratos)
    }
  },
  (app) => {
    // Reverter para as regras anteriores (@request.auth.id != '')
    try {
      const movsCol = app.findCollectionByNameOrId('movimentacoes_financeiras')
      if (movsCol) {
        movsCol.createRule = "@request.auth.id != ''"
        movsCol.updateRule = "@request.auth.id != ''"
        movsCol.deleteRule = null
        app.save(movsCol)
      }
    } catch (_) {}

    try {
      const extratosCol = app.findCollectionByNameOrId('extratos_linhas')
      if (extratosCol) {
        extratosCol.createRule = "@request.auth.id != ''"
        extratosCol.updateRule = "@request.auth.id != ''"
        extratosCol.deleteRule = null
        app.save(extratosCol)
      }
    } catch (_) {}
  },
)
