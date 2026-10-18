// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0052: Reforça regras de acesso da tabela inutilizacoes.
 * Somente leitura pelo navegador (listRule / viewRule);
 * Gravação (create/update/delete) exclusiva pelo backend (pb_hooks via fiscal_focus_integracao.js).
 */
migrate(
  (app) => {
    if (app.hasTable('inutilizacoes')) {
      const colInut = app.findCollectionByNameOrId('inutilizacoes')
      colInut.listRule = "@request.auth.id != ''"
      colInut.viewRule = "@request.auth.id != ''"
      colInut.createRule = null // exclusivo pelo backend
      colInut.updateRule = null // exclusivo pelo backend
      colInut.deleteRule = null // exclusivo pelo backend
      app.save(colInut)
    }
  },
  (app) => {
    if (app.hasTable('inutilizacoes')) {
      const colInut = app.findCollectionByNameOrId('inutilizacoes')
      colInut.createRule = "@request.auth.id != ''"
      colInut.updateRule = "@request.auth.id != ''"
      app.save(colInut)
    }
  },
)
