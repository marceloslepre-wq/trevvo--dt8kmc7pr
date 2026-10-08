migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('notas_entrada')
    if (!col.fields.getByName('motivo_cancelamento')) {
      col.fields.add(
        new TextField({
          name: 'motivo_cancelamento',
          required: false,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('notas_entrada')
      const campo = col.fields.getByName('motivo_cancelamento')
      if (campo) {
        col.fields.removeById(campo.id)
        app.save(col)
      }
    } catch (_) {}
  },
)
