/**
 * Migration 0153: produtos_vinculos_anuncios.preco_anuncio
 *
 * Preço fixo do anúncio (ex.: caixa com 100 unidades vendida a 215,00 no site), independente
 * do preço da unidade. Vazio/0 = preço da loja x unidades. Não altera nenhum dado.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos_vinculos_anuncios')
    if (!col.fields.getByName('preco_anuncio')) {
      col.fields.add(new NumberField({ name: 'preco_anuncio', required: false, min: 0 }))
      app.save(col)
      console.log('[Migration 0153] produtos_vinculos_anuncios.preco_anuncio criado.')
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos_vinculos_anuncios')
    const f = col.fields.getByName('preco_anuncio')
    if (f) {
      col.fields.removeById(f.id)
      app.save(col)
    }
  },
)
