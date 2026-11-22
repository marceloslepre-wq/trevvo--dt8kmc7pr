// @ts-check
/// <reference path='../types.d.ts' />

/**
 * Migration 0141: registro na ANVISA no cadastro de produtos
 *
 * Marketplaces (Mercado Livre e outros) e a loja virtual exigem o número de registro ou de
 * notificação na ANVISA para produtos para saúde, cosméticos, saneantes e alimentos.
 * - anvisa_tipo: '' (não informado) | 'Registro' | 'Notificação' | 'Isento'
 * - anvisa_numero: número como aparece na embalagem (ex.: 80246910003)
 * Idempotente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    let mudou = false
    if (!col.fields.getByName('anvisa_tipo')) {
      col.fields.add(
        new TextField({ name: 'anvisa_tipo', required: false, max: 20 }),
      )
      mudou = true
    }
    if (!col.fields.getByName('anvisa_numero')) {
      col.fields.add(
        new TextField({ name: 'anvisa_numero', required: false, max: 40 }),
      )
      mudou = true
    }
    if (mudou) app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const nomes = ['anvisa_tipo', 'anvisa_numero']
    for (let i = 0; i < nomes.length; i++) {
      const f = col.fields.getByName(nomes[i])
      if (f) col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
