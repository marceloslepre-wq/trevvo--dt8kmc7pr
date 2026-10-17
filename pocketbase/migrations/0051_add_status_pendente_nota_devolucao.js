/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    // 1. Atualizar select do status na tabela vendas para aceitar 'Pendente de nota'
    if (app.hasTable('vendas')) {
      const colVendas = app.findCollectionByNameOrId('vendas')
      const campoStatus = colVendas.fields.getByName('status')
      if (campoStatus && campoStatus.type === 'select') {
        const vals = campoStatus.values || []
        if (!vals.includes('Pendente de nota')) {
          vals.push('Pendente de nota')
          campoStatus.values = vals
          app.save(colVendas)
        }
      }
    }

    // 2. Garantir campo devolucao_id em documentos_fiscais se não existir (para rastreio direto da venda de devolução)
    if (app.hasTable('documentos_fiscais')) {
      const colDocs = app.findCollectionByNameOrId('documentos_fiscais')
      let mudou = false
      if (!colDocs.fields.getByName('devolucao_venda_id')) {
        colDocs.fields.add(
          new TextField({
            name: 'devolucao_venda_id',
            required: false,
          }),
        )
        mudou = true
      }
      if (mudou) {
        app.save(colDocs)
      }
    }
  },
  (app) => {
    try {
      const colDocs = app.findCollectionByNameOrId('documentos_fiscais')
      if (colDocs && colDocs.fields.getByName('devolucao_venda_id')) {
        colDocs.fields.removeByName('devolucao_venda_id')
        app.save(colDocs)
      }
    } catch (_) {}
  },
)
