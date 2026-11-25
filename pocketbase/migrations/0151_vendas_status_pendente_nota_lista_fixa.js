/// <reference path="../types.d.ts" />

// Garante o valor 'Pendente de nota' no select 'status' da coleção vendas.
// As migrations 0147 a 0150 foram applied mas o schema ao vivo não mostrou o valor.
// Aqui o campo 'status' é removido e recriado com a lista completa fixa,
// mantendo required e maxSelect 1.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    col.fields.removeByName('status')
    col.fields.add(
      new SelectField({
        name: 'status',
        required: true,
        values: [
          'Orçamento',
          'Pedido em aberto',
          'Finalizada',
          'Cancelada',
          'Orçamento expirado',
          'Pendente de nota',
        ],
        maxSelect: 1,
      }),
    )
    app.save(col)
  },
  (app) => {
    // sem rollback: remover a opção quebraria devoluções já gravadas com esse status
  },
)
