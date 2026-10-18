/// <reference path="../types.d.ts" />

/**
 * Migration 0056: Adiciona campo resumo_entrada (JSON) na tabela sped_arquivos.
 * Armazena totais analíticos das entradas do período:
 * - quantidade de notas de compra (entrada de terceiros)
 * - quantidade de transferências recebidas
 * - total do VL_DOC (valor contábil das entradas)
 * - total do crédito de ICMS aproveitado
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('sped_arquivos')
    if (!col.fields.getByName('resumo_entrada')) {
      col.fields.add(
        new JSONField({
          name: 'resumo_entrada',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sped_arquivos')
      const campo = col.fields.getByName('resumo_entrada')
      if (campo) {
        col.fields.removeByName('resumo_entrada')
        app.save(col)
      }
    } catch (_) {}
  },
)
