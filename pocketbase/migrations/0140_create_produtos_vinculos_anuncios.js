// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0140: vínculo produto <-> anúncio em marketplace
 *
 * produtos_vinculos_anuncios guarda "este produto do Trevvo é vendido neste anúncio" para
 * cada empresa (conta do marketplace). Serve para anúncios sem SKU (ex.: catálogo do
 * Mercado Livre) e, no futuro, para kits (unidades) e variações.
 * - marketplace: 'mercadolivre' (outros canais depois: shopee, amazon, ...)
 * - anuncio_id: ex. MLB4372496283; variacao_id vazio = anúncio inteiro
 * - unidades: quantas unidades do produto o anúncio vende (kit); 0/vazio = 1
 * Gravado pelo hook mercadolivre_precos.js quando o usuário informa o número do anúncio.
 * Idempotente.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('produtos_vinculos_anuncios')
      return
    } catch (_) {}

    const regraAssinante = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    const col = new Collection({
      name: 'produtos_vinculos_anuncios',
      type: 'base',
      listRule: regraAssinante,
      viewRule: regraAssinante,
      createRule: regraAssinante,
      updateRule: regraAssinante + ' && @request.body.assinante_id:isset = false',
      deleteRule: regraAssinante,
      fields: [
        {
          name: 'assinante_id',
          type: 'relation',
          required: true,
          collectionId: assinantesCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'empresa_id',
          type: 'relation',
          required: true,
          collectionId: empresasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'marketplace', type: 'text', required: true, max: 30 },
        { name: 'anuncio_id', type: 'text', required: true, max: 40 },
        { name: 'variacao_id', type: 'text', required: false, max: 40 },
        { name: 'titulo', type: 'text', required: false, max: 300 },
        { name: 'unidades', type: 'number', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_pva_unico ON produtos_vinculos_anuncios (produto_id, empresa_id, marketplace, anuncio_id, variacao_id)',
        'CREATE INDEX idx_pva_anuncio ON produtos_vinculos_anuncios (marketplace, anuncio_id)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('produtos_vinculos_anuncios'))
    } catch (_) {}
  },
)
