migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const perfisColId = app.findCollectionByNameOrId('perfis_acesso').id
    const empresasColId = app.findCollectionByNameOrId('empresas').id

    const usuariosCol = new Collection({
      name: 'usuarios',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'auth_user_id',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'cpf', type: 'text', required: false },
        { name: 'telefone', type: 'text', required: false },
        {
          name: 'foto',
          type: 'file',
          required: false,
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
          name: 'perfil_id',
          type: 'relation',
          required: true,
          collectionId: perfisColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'empresa_padrao_id',
          type: 'relation',
          required: false,
          collectionId: empresasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'desconto_maximo_percentual', type: 'number', required: false, min: 0, max: 100 },
        { name: 'comissao_percentual', type: 'number', required: false, min: 0, max: 100 },
        { name: 'e_vendedor', type: 'bool' },
        { name: 'e_caixa', type: 'bool' },
        { name: 'ultimo_acesso', type: 'date', required: false },
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
        'CREATE UNIQUE INDEX idx_usuarios_email ON usuarios (email)',
        'CREATE INDEX idx_usuarios_auth_user_id ON usuarios (auth_user_id)',
        'CREATE INDEX idx_usuarios_perfil_id ON usuarios (perfil_id)',
        'CREATE INDEX idx_usuarios_ativo ON usuarios (ativo)',
      ],
    })
    app.save(usuariosCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('usuarios')
      app.delete(col)
    } catch (_) {}
  },
)
