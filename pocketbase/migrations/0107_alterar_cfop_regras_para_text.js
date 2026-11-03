// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0107: Mudar cfop de relation para text em perfis_tributarios_regras
 */
migrate(
  (app) => {
    // 1. Atualizar schema da coleção em _collections via update no record ou fields API
    const col = app.findCollectionByNameOrId('perfis_tributarios_regras')

    // Obter todos os campos atuais exceto cfop
    const fields = col.fields
    console.log('[0107] Total campos antes:', fields.length)

    const campoCfop = fields.getByName('cfop')
    if (campoCfop) {
      console.log('[0107] Tipo atual do campo cfop:', campoCfop.type)
      if (campoCfop.type === 'relation') {
        fields.removeByName('cfop')
        fields.add(
          new TextField({
            name: 'cfop',
            required: false,
          }),
        )
        app.save(col)
        console.log('[0107] col.fields atualizado e salvo com sucesso.')
      }
    }
  },
  (app) => {
    // No-op
  },
)
