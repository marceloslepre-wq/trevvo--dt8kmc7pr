// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0108: Alterar campo cfop em perfis_tributarios_regras para text via col.fields.remove()
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('perfis_tributarios_regras')
    const campoCfop = col.fields.getByName('cfop')
    if (campoCfop && campoCfop.type === 'relation') {
      col.fields.remove(campoCfop)
      col.fields.add(
        new TextField({
          name: 'cfop',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {},
)
