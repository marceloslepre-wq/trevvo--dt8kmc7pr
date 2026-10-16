/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    if (app.hasTable('config_emissao_fiscal')) {
      const configCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      if (!configCol.fields.getByName('emite_nfce')) {
        configCol.fields.add(
          new BoolField({
            name: 'emite_nfce',
            required: false,
          }),
        )
        app.save(configCol)
      }
    }
  },
  (app) => {
    try {
      const configCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      const campo = configCol.fields.getByName('emite_nfce')
      if (campo) {
        configCol.fields.removeByName('emite_nfce')
        app.save(configCol)
      }
    } catch (_) {}
  },
)
