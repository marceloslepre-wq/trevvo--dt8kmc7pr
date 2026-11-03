migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ncm')
    if (!col.fields.getByName('descricao_completa')) {
      col.fields.add(new TextField({ name: 'descricao_completa', max: 2000 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ncm')
    const f = col.fields.getByName('descricao_completa')
    if (f) {
      col.fields.removeByName('descricao_completa')
      app.save(col)
    }
  },
)
