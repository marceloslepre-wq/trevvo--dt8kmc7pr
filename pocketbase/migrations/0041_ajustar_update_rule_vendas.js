migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    if (col) {
      col.updateRule =
        "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada' && (@request.body.status = '' || (@request.body.status != 'Finalizada' && @request.body.status != 'Cancelada')) && @request.body.documento_fiscal_status = '' && @request.body.custo_total = '' && @request.body.data_finalizacao = '' && @request.body.caixa_sessao_id = ''"
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('vendas')
      if (col) {
        col.updateRule = "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada'"
        app.save(col)
      }
    } catch (_) {}
  },
)
