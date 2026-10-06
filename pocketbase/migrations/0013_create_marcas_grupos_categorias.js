migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    // 1. Coleção marcas
    const colMarcas = new Collection({
      name: 'marcas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'nome', type: 'text', required: true },
        { name: 'fabricante', type: 'text' },
        { name: 'observacao', type: 'text' },
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
        'CREATE UNIQUE INDEX idx_marcas_nome ON marcas (nome)',
        'CREATE INDEX idx_marcas_ativo ON marcas (ativo)',
      ],
    })
    app.save(colMarcas)

    // 2. Coleção grupos (nível 1 da classificação)
    const colGrupos = new Collection({
      name: 'grupos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'margem_padrao_percentual', type: 'number' },
        { name: 'perfil_tributario_id', type: 'text' },
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
        'CREATE UNIQUE INDEX idx_grupos_codigo ON grupos (codigo)',
        'CREATE UNIQUE INDEX idx_grupos_nome ON grupos (nome)',
        'CREATE INDEX idx_grupos_ativo ON grupos (ativo)',
      ],
    })
    app.save(colGrupos)

    // 3. Coleção categorias (nível 2, pertence a um grupo)
    const gruposColId = app.findCollectionByNameOrId('grupos').id
    const colCategorias = new Collection({
      name: 'categorias',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'grupo_id',
          type: 'relation',
          required: true,
          collectionId: gruposColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'codigo', type: 'text' },
        { name: 'nome', type: 'text', required: true },
        { name: 'margem_padrao_percentual', type: 'number' },
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
        'CREATE UNIQUE INDEX idx_categorias_grupo_nome ON categorias (grupo_id, nome)',
        'CREATE INDEX idx_categorias_grupo ON categorias (grupo_id)',
        'CREATE INDEX idx_categorias_ativo ON categorias (ativo)',
      ],
    })
    app.save(colCategorias)
  },
  (app) => {
    try {
      const colCat = app.findCollectionByNameOrId('categorias')
      app.delete(colCat)
    } catch (_) {}

    try {
      const colGrup = app.findCollectionByNameOrId('grupos')
      app.delete(colGrup)
    } catch (_) {}

    try {
      const colMarc = app.findCollectionByNameOrId('marcas')
      app.delete(colMarc)
    } catch (_) {}
  },
)
