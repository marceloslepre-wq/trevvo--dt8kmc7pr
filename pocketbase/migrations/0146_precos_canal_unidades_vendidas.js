// @ts-check
/// <reference path='../types.d.ts' />

/**
 * Migration 0146: unidades vendidas por produto e canal (relatório "Margem por canal")
 *
 * produtos_precos_canal ganha:
 * - unidades_vendidas: unidades vendidas no período do último relatório importado
 *   (Amazon: transações; Shopee: pedidos). Usado para ordenar por "mais vendidos".
 * - vendas_atualizadas_em: data da importação que gravou as unidades.
 * Campos opcionais (zero = sem venda no período). Idempotente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos_precos_canal')
    let mudou = false
    if (!col.fields.getByName('unidades_vendidas')) {
      col.fields.add(new NumberField({ name: 'unidades_vendidas', required: false, min: 0 }))
      mudou = true
    }
    if (!col.fields.getByName('vendas_atualizadas_em')) {
      col.fields.add(new DateField({ name: 'vendas_atualizadas_em', required: false }))
      mudou = true
    }
    if (mudou) app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos_precos_canal')
    const nomes = ['unidades_vendidas', 'vendas_atualizadas_em']
    for (let i = 0; i < nomes.length; i++) {
      const f = col.fields.getByName(nomes[i])
      if (f) col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
