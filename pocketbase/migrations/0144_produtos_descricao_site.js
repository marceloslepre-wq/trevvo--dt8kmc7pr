// @ts-check
/// <reference path='../types.d.ts' />

/**
 * Migration 0144: descrição para o site e controle da importação de mídia da Tray
 *
 * - descricao_site: descrição longa do produto para loja virtual e marketplaces (aceita HTML,
 *   como vem da Tray). O campo `descricao` continua sendo o nome do produto (até 120 caracteres).
 * - tray_midia_importada_em: data/hora da última importação de descrição e imagens da Tray.
 * Idempotente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    let mudou = false
    if (!col.fields.getByName('descricao_site')) {
      col.fields.add(new TextField({ name: 'descricao_site', required: false, max: 100000 }))
      mudou = true
    }
    if (!col.fields.getByName('tray_midia_importada_em')) {
      col.fields.add(new TextField({ name: 'tray_midia_importada_em', required: false, max: 40 }))
      mudou = true
    }
    if (mudou) app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const nomes = ['descricao_site', 'tray_midia_importada_em']
    for (let i = 0; i < nomes.length; i++) {
      const f = col.fields.getByName(nomes[i])
      if (f) col.fields.removeById(f.id)
    }
    app.save(col)
  },
)
