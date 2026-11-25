/**
 * Migration 0152: documentos_fiscais.tipo_documento aceita 0 (Entrada).
 *
 * No PocketBase v0.23+, campo numérico com required = true rejeita o valor 0
 * ("tipo_documento: cannot be blank"). A NF-e de devolução de venda é de
 * entrada (tipo_documento 0), então nunca conseguia ser gravada.
 * Mesma correção da migration 0120. Não altera nenhum dado.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('documentos_fiscais')
    const f = col.fields.getByName('tipo_documento')
    if (f && f.required) {
      f.required = false
      app.save(col)
      console.log('[Migration 0152] documentos_fiscais.tipo_documento: required removido.')
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('documentos_fiscais')
    const f = col.fields.getByName('tipo_documento')
    if (f && !f.required) {
      f.required = true
      app.save(col)
    }
  },
)
