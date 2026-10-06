migrate(
  (app) => {
    const perfisColId = app.findCollectionByNameOrId('perfis_acesso').id
    const usersAuthId = '_pb_users_auth_'

    const permissoesCol = new Collection({
      name: 'permissoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'perfil_id',
          type: 'relation',
          required: true,
          collectionId: perfisColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'modulo',
          type: 'select',
          required: true,
          values: [
            'painel',
            'empresas',
            'usuarios',
            'perfis_acesso',
            'clientes',
            'fornecedores',
            'produtos',
            'marcas',
            'grupos_categorias',
            'unidades_medida',
            'tabelas_fiscais',
            'estoque',
            'compras',
            'notas_entrada',
            'financeiro_pagar',
            'financeiro_receber',
            'vendas',
            'pdv',
            'caixa',
            'notas_saida',
            'sped',
            'relatorios',
            'configuracoes',
          ],
          maxSelect: 1,
        },
        { name: 'pode_ver', type: 'bool' },
        { name: 'pode_criar', type: 'bool' },
        { name: 'pode_editar', type: 'bool' },
        { name: 'pode_excluir', type: 'bool' },
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
        'CREATE UNIQUE INDEX idx_permissoes_perfil_modulo ON permissoes (perfil_id, modulo)',
        'CREATE INDEX idx_permissoes_perfil ON permissoes (perfil_id)',
      ],
    })
    app.save(permissoesCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('permissoes')
      app.delete(col)
    } catch (_) {}
  },
)
