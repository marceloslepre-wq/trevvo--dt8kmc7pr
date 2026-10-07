migrate(
  (app) => {
    // 1. Criar collection configuracoes
    const collection = new Collection({
      name: 'configuracoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool', required: false },
        { name: 'nome_sistema', type: 'text', required: true },
        {
          name: 'logo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
        },
        { name: 'cor_principal', type: 'text', required: false },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'updated_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_configuracoes_ativo ON configuracoes (ativo)'],
    })

    app.save(collection)

    // 2. Semear registro de configuração inicial caso não exista
    try {
      const col = app.findCollectionByNameOrId('configuracoes')
      const records = app.findRecordsByFilter('configuracoes', '', '-created', 1, 0)
      if (records.length === 0) {
        const record = new Record(col)
        record.set('ativo', true)
        record.set('nome_sistema', 'ERP Gestão Comercial')
        record.set('cor_principal', '#2563eb')
        app.save(record)
      }
    } catch (e) {
      console.log('Aviso ao semear configuracao inicial:', e)
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('configuracoes')
      app.delete(collection)
    } catch (_) {}
  },
)
