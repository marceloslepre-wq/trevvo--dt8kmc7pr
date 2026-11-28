/**
 * Migration 0155: vendas.origem_externa / pedido_externo_id / pedido_marketplace / canal_externo
 *
 * Guarda de onde veio um pedido importado (ex.: origem 'tray', pedido Tray 123456, canal
 * MERCADO LIVRE, número do pedido no marketplace). O índice único impede importar o mesmo
 * pedido duas vezes na mesma empresa. Não altera nenhum dado existente. Idempotente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    let mudou = false
    const novos = [
      { name: 'origem_externa', max: 20 },
      { name: 'pedido_externo_id', max: 40 },
      { name: 'pedido_marketplace', max: 60 },
      { name: 'canal_externo', max: 60 },
    ]
    for (let i = 0; i < novos.length; i++) {
      if (!col.fields.getByName(novos[i].name)) {
        col.fields.add(new TextField({ name: novos[i].name, required: false, max: novos[i].max }))
        mudou = true
      }
    }
    if (mudou) app.save(col)

    const atual = app.findCollectionByNameOrId('vendas')
    let temIndice = false
    for (let i = 0; i < atual.indexes.length; i++) {
      if (String(atual.indexes[i]).indexOf('idx_vendas_pedido_externo') >= 0) temIndice = true
    }
    if (!temIndice) {
      atual.addIndex(
        'idx_vendas_pedido_externo',
        true,
        'empresa_id, origem_externa, pedido_externo_id',
        "pedido_externo_id != ''",
      )
      app.save(atual)
    }
    console.log('[Migration 0155] vendas: campos de pedido externo prontos.')
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    try {
      col.removeIndex('idx_vendas_pedido_externo')
    } catch (_) {}
    const nomes = ['origem_externa', 'pedido_externo_id', 'pedido_marketplace', 'canal_externo']
    for (let i = 0; i < nomes.length; i++) {
      const f = col.fields.getByName(nomes[i])
      if (f) col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
