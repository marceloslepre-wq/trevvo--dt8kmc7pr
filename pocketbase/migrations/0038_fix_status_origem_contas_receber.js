migrate(
  (app) => {
    // 1. Atualizar registros existentes de contas_receber (se houver) via SQL direto
    try {
      app
        .db()
        .newQuery("UPDATE contas_receber SET status = 'Aberto' WHERE status = 'Em aberto'")
        .execute()
    } catch (errUpd1) {
      console.error('[Migration 0038] Erro ao atualizar status Em aberto -> Aberto:', errUpd1)
    }

    try {
      app
        .db()
        .newQuery("UPDATE contas_receber SET status = 'Parcial' WHERE status = 'Recebido parcial'")
        .execute()
    } catch (errUpd2) {
      console.error(
        '[Migration 0038] Erro ao atualizar status Recebido parcial -> Parcial:',
        errUpd2,
      )
    }

    // 2. Atualizar definição do select dos campos status e origem em contas_receber
    const col = app.findCollectionByNameOrId('contas_receber')
    if (col) {
      const statusField = col.fields.getByName('status')
      if (statusField) {
        statusField.values = ['Aberto', 'Parcial', 'Recebido', 'Cancelado']
      }

      const origemField = col.fields.getByName('origem')
      if (origemField) {
        origemField.values = ['Manual', 'Venda', 'PDV', 'Recorrência', 'Outro']
      }

      app.save(col)
      console.log('[Migration 0038] Coleção contas_receber atualizada com sucesso.')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('contas_receber')
      if (col) {
        const statusField = col.fields.getByName('status')
        if (statusField) {
          statusField.values = ['Em aberto', 'Recebido parcial', 'Recebido', 'Cancelado']
        }

        const origemField = col.fields.getByName('origem')
        if (origemField) {
          origemField.values = ['Manual', 'Venda', 'Recorrência', 'Outro']
        }

        app.save(col)
      }
    } catch (_) {}

    try {
      app
        .db()
        .newQuery("UPDATE contas_receber SET status = 'Em aberto' WHERE status = 'Aberto'")
        .execute()
    } catch (_) {}

    try {
      app
        .db()
        .newQuery("UPDATE contas_receber SET status = 'Recebido parcial' WHERE status = 'Parcial'")
        .execute()
    } catch (_) {}
  },
)
