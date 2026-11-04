migrate(
  (app) => {
    // 1. Garantir campo pedido_compra_id na coleção notas_entrada
    const notasCol = app.findCollectionByNameOrId('notas_entrada')
    if (!notasCol.fields.getByName('pedido_compra_id')) {
      const pedidosCol = app.findCollectionByNameOrId('pedidos_compra')
      notasCol.fields.add(
        new RelationField({
          name: 'pedido_compra_id',
          collectionId: pedidosCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(notasCol)
    }

    // 2. Garantir campo de quantidade recebida nos itens de pedido de compra
    // (caso não exista quantidade_recebida ou qtd_recebida)
    const itensCol = app.findCollectionByNameOrId('pedidos_compra_itens')
    if (
      !itensCol.fields.getByName('quantidade_recebida') &&
      !itensCol.fields.getByName('qtd_recebida')
    ) {
      itensCol.fields.add(
        new NumberField({
          name: 'quantidade_recebida',
          required: false,
        }),
      )
      app.save(itensCol)
    }
    // Também adicionar alias opcional qtd_recebida se necessário, ou manter quantidade_recebida
    if (!itensCol.fields.getByName('qtd_recebida')) {
      itensCol.fields.add(
        new NumberField({
          name: 'qtd_recebida',
          required: false,
        }),
      )
      app.save(itensCol)
    }
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('pedidos_compra_itens')
      const f = itensCol.fields.getByName('qtd_recebida')
      if (f) {
        itensCol.fields.removeByName('qtd_recebida')
        app.save(itensCol)
      }
    } catch (_) {}
  },
)
