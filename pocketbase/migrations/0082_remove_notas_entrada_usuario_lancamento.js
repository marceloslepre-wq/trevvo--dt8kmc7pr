/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('notas_entrada')
    const field = col.fields.getByName('usuario_lancamento_id')
    if (field) {
      col.fields.removeByName('usuario_lancamento_id')
      app.save(col)
    }
  },
  (app) => {
    // no-op
  },
)
