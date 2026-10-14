migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('config_vendas_empresa')

    if (!col.fields.getByName('balanca_ativa')) {
      col.fields.add(new BoolField({ name: 'balanca_ativa' }))
    }

    if (!col.fields.getByName('balanca_prefixo')) {
      col.fields.add(new TextField({ name: 'balanca_prefixo', max: 5 }))
    }

    if (!col.fields.getByName('balanca_tipo')) {
      col.fields.add(
        new SelectField({
          name: 'balanca_tipo',
          values: ['Preço', 'Peso'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('balanca_posicao_codigo')) {
      col.fields.add(new NumberField({ name: 'balanca_posicao_codigo' }))
    }

    if (!col.fields.getByName('balanca_tamanho_codigo')) {
      col.fields.add(new NumberField({ name: 'balanca_tamanho_codigo' }))
    }

    app.save(col)

    // Inicializar defaults para registros existentes
    try {
      app
        .db()
        .newQuery(
          `UPDATE config_vendas_empresa
         SET balanca_prefixo = '2'
         WHERE balanca_prefixo IS NULL OR balanca_prefixo = ''`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE config_vendas_empresa
         SET balanca_tipo = 'Preço'
         WHERE balanca_tipo IS NULL OR balanca_tipo = ''`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE config_vendas_empresa
         SET balanca_posicao_codigo = 2
         WHERE balanca_posicao_codigo IS NULL OR balanca_posicao_codigo = 0`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE config_vendas_empresa
         SET balanca_tamanho_codigo = 5
         WHERE balanca_tamanho_codigo IS NULL OR balanca_tamanho_codigo = 0`,
        )
        .execute()
    } catch (_) {}
  },
  (app) => {
    const col = app.findCollectionByNameOrId('config_vendas_empresa')
    if (col.fields.getByName('balanca_ativa')) col.fields.removeByName('balanca_ativa')
    if (col.fields.getByName('balanca_prefixo')) col.fields.removeByName('balanca_prefixo')
    if (col.fields.getByName('balanca_tipo')) col.fields.removeByName('balanca_tipo')
    if (col.fields.getByName('balanca_posicao_codigo'))
      col.fields.removeByName('balanca_posicao_codigo')
    if (col.fields.getByName('balanca_tamanho_codigo'))
      col.fields.removeByName('balanca_tamanho_codigo')
    app.save(col)
  },
)
