/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('empresas')
    if (!col.fields.getByName('nome_documentos_fiscais')) {
      col.fields.add(
        new TextField({
          name: 'nome_documentos_fiscais',
          max: 60,
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('empresas')
      const field = col.fields.getByName('nome_documentos_fiscais')
      if (field) {
        col.fields.remove(field)
        app.save(col)
      }
    } catch (_) {}
  },
)
