migrate(
  (app) => {
    const logsAuditoria = app.findCollectionByNameOrId('logs_auditoria')
    if (!logsAuditoria.fields.getByName('empresa_id')) {
      logsAuditoria.fields.add(
        new RelationField({
          name: 'empresa_id',
          required: false,
          collectionId: app.findCollectionByNameOrId('empresas').id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(logsAuditoria)
    }
  },
  (app) => {
    try {
      const logsAuditoria = app.findCollectionByNameOrId('logs_auditoria')
      logsAuditoria.fields.removeByName('empresa_id')
      app.save(logsAuditoria)
    } catch (_) {}
  },
)
