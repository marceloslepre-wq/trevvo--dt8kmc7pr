migrate(
  (app) => {
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const usersAuthId = '_pb_users_auth_'

    const usuariosEmpresasCol = new Collection({
      name: 'usuarios_empresas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usuariosColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'empresa_id',
          type: 'relation',
          required: true,
          collectionId: empresasColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
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
        'CREATE UNIQUE INDEX idx_usuarios_empresas_pair ON usuarios_empresas (usuario_id, empresa_id)',
        'CREATE INDEX idx_usuarios_empresas_user ON usuarios_empresas (usuario_id)',
        'CREATE INDEX idx_usuarios_empresas_empresa ON usuarios_empresas (empresa_id)',
      ],
    })
    app.save(usuariosEmpresasCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('usuarios_empresas')
      app.delete(col)
    } catch (_) {}
  },
)
