/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('notas_entrada')
    const usersCol = app.findCollectionByNameOrId('users')

    col.fields.add(
      new RelationField({
        name: 'usuario_lancamento_id',
        collectionId: usersCol.id,
        maxSelect: 1,
        cascadeDelete: false,
        required: false,
      }),
    )

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('notas_entrada')
      if (col) {
        col.fields.removeByName('usuario_lancamento_id')
        app.save(col)
      }
    } catch (_) {}
  },
)
