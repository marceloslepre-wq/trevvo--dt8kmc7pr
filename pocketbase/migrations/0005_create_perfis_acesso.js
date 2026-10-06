migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    // 1. perfis_acesso
    const perfisCol = new Collection({
      name: 'perfis_acesso',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: false },
        { name: 'administrador', type: 'bool' },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'updated_by',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_perfis_acesso_nome ON perfis_acesso (nome)',
        'CREATE INDEX idx_perfis_acesso_ativo ON perfis_acesso (ativo)',
      ],
    })
    app.save(perfisCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('perfis_acesso')
      app.delete(col)
    } catch (_) {}
  },
)
