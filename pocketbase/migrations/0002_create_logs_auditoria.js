migrate(
  (app) => {
    const collection = new Collection({
      name: 'logs_auditoria',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'usuario_nome', type: 'text', required: false },
        { name: 'tabela', type: 'text', required: true },
        { name: 'registro_id', type: 'text', required: true },
        {
          name: 'acao',
          type: 'select',
          required: true,
          values: ['inclusao', 'alteracao', 'inativacao', 'ativacao', 'exclusao'],
          maxSelect: 1,
        },
        { name: 'valores_antes', type: 'json', required: false },
        { name: 'valores_depois', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_logs_auditoria_tabela_reg ON logs_auditoria (tabela, registro_id)',
        'CREATE INDEX idx_logs_auditoria_created ON logs_auditoria (created DESC)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('logs_auditoria')
      app.delete(collection)
    } catch (_) {}
  },
)
