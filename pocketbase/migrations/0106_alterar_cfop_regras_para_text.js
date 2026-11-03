// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0106: Alterar tipo do campo `cfop` em `perfis_tributarios_regras` para text
 *
 * Contexto:
 * A coleção `perfis_tributarios_regras` foi criada originalmente com o campo `cfop` como
 * `relation -> cfop`. No entanto, em todo o ERP (tela de perfis tributários, SelectCfop,
 * motorFiscal, e migrations 0096, 0100-0104), o valor armazenado e manipulado é o código
 * textual do CFOP (ex: "5102", "6102", "5202", "1102").
 *
 * Como o PocketBase valida campos relation esperando um ID de 15 caracteres existente na
 * coleção de destino, qualquer PATCH/update enviado pelo SDK ou navegador contendo
 * o código de 4 dígitos (ex: {"cfop": "5102"}) era recusado com:
 * "Failed to update record" -> {"cfop": {"code": "validation_missing_rel_records", "message": "Failed to find relation record..."}}.
 *
 * Em PocketBase / SQLite, para alterar o tipo de um campo existente:
 * remove-se o campo pelo ID (`col.fields.removeById(f.id)`), salva-se a coleção, e adiciona-se
 * o novo `TextField({ name: 'cfop' })` seguido de `app.save(col)`.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('perfis_tributarios_regras')

    const cfopField = col.fields.getByName('cfop')
    if (cfopField) {
      if (cfopField.type === 'relation') {
        col.fields.removeById(cfopField.id)
        app.save(col)

        col.fields.add(
          new TextField({
            name: 'cfop',
            required: false,
          }),
        )
        app.save(col)
        console.log(
          '[0106] Campo cfop alterado com sucesso de relation para text em perfis_tributarios_regras.',
        )
      } else {
        console.log('[0106] Campo cfop já é do tipo text em perfis_tributarios_regras.')
      }
    } else {
      col.fields.add(
        new TextField({
          name: 'cfop',
          required: false,
        }),
      )
      app.save(col)
      console.log('[0106] Campo cfop adicionado como text em perfis_tributarios_regras.')
    }

    // Conferir se há algum registro onde o campo cfop ainda é um ID antigo de 15 caracteres da tabela cfop
    // e mapear para o código correspondente
    try {
      const mapaCfops = {
        '7a5xo6gm918mtl9': '5102',
        fprn4zrlwrmwh0x: '6102',
        yaxu8lsceli24is: '6108',
        lag9w7o536u0f5l: '5202',
        wemr60mhlpe8jjv: '5152',
        '5hca13gg307sj3d': '1102',
        j7ikbotbsxld8vi: '2102',
      }

      const ids = Object.keys(mapaCfops)
      for (let i = 0; i < ids.length; i++) {
        const idCfop = ids[i]
        const cod = mapaCfops[idCfop]
        app
          .db()
          .newQuery('UPDATE perfis_tributarios_regras SET cfop = {:cod} WHERE cfop = {:idCfop}')
          .bind({ cod, idCfop })
          .execute()
      }
      console.log('[0106] Backfill de eventuais IDs residuais de CFOP concluído.')
    } catch (e) {
      console.log('[0106] Aviso ao normalizar cfop residuais:', e)
    }
  },
  (app) => {
    // Reversão
    try {
      const col = app.findCollectionByNameOrId('perfis_tributarios_regras')
      const cfopCol = app.findCollectionByNameOrId('cfop')
      const cfopField = col.fields.getByName('cfop')
      if (cfopField) {
        col.fields.removeById(cfopField.id)
        app.save(col)
      }
      col.fields.add(
        new RelationField({
          name: 'cfop',
          required: false,
          collectionId: cfopCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(col)
    } catch (_) {}
  },
)
