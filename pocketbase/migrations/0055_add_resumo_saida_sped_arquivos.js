/// <reference path="../types.d.ts" />

/**
 * Migration 0055: Adiciona campo resumo_saida (JSON) na tabela sped_arquivos.
 * Armazena totais analíticos das saídas do período:
 * - quantidade de NF-e (55)
 * - quantidade de NFC-e (65)
 * - quantidade de canceladas
 * - quantidade de denegadas
 * - quantidade de inutilizadas
 * - total do VL_DOC (valor contábil)
 * - total do VL_ICMS
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('sped_arquivos')
    if (!col.fields.getByName('resumo_saida')) {
      col.fields.add(
        new JSONField({
          name: 'resumo_saida',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sped_arquivos')
      const campo = col.fields.getByName('resumo_saida')
      if (campo) {
        col.fields.removeByName('resumo_saida')
        app.save(col)
      }
    } catch (_) {}
  },
)
