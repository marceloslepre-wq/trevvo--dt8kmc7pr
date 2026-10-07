migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const usersColId = '_pb_users_auth_'

    // 1. Criar collection lotes
    // Regras de acesso: somente leitura via app para usuários autenticados.
    // Criação/edição/exclusão de lotes só via serviço central de estoque (pb_hooks / migrations / app.save).
    if (!app.hasTable('lotes')) {
      const collectionLotes = new Collection({
        name: 'lotes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null, // bloqueia criação direta via API do client
        updateRule: null, // bloqueia edição direta via API do client
        deleteRule: null, // bloqueia exclusão direta via API do client
        fields: [
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            collectionId: produtosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'numero_lote',
            type: 'text',
            required: true,
          },
          {
            name: 'data_fabricacao',
            type: 'date',
            required: false,
          },
          {
            name: 'data_validade',
            type: 'date',
            required: true,
          },
          {
            name: 'quantidade',
            type: 'number',
            required: true,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
          {
            name: 'created_by',
            type: 'relation',
            required: false,
            collectionId: usersColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'updated_by',
            type: 'relation',
            required: false,
            collectionId: usersColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_lotes_empresa_produto_numero ON lotes (empresa_id, produto_id, numero_lote)',
          'CREATE INDEX idx_lotes_data_validade ON lotes (data_validade)',
          'CREATE INDEX idx_lotes_produto_ativo ON lotes (produto_id, ativo)',
        ],
      })

      app.save(collectionLotes)
    }

    // 2. Adicionar campo dias_alerta_validade na collection configuracoes
    try {
      const colConfig = app.findCollectionByNameOrId('configuracoes')
      if (!colConfig.fields.getByName('dias_alerta_validade')) {
        colConfig.fields.add(
          new NumberField({
            name: 'dias_alerta_validade',
            required: false,
            min: 1,
            max: 365,
          }),
        )
        app.save(colConfig)

        // Atualizar registro inicial de configurações existente com 30 dias padrão
        const records = app.findRecordsByFilter('configuracoes', '', '-created', 1, 0)
        if (records.length > 0) {
          const r = records[0]
          if (!r.get('dias_alerta_validade')) {
            r.set('dias_alerta_validade', 30)
            app.save(r)
          }
        }
      }
    } catch (e) {
      console.log('Aviso ao adicionar dias_alerta_validade em configuracoes:', e)
    }
  },
  (app) => {
    try {
      const colLotes = app.findCollectionByNameOrId('lotes')
      app.delete(colLotes)
    } catch (_) {}

    try {
      const colConfig = app.findCollectionByNameOrId('configuracoes')
      colConfig.fields.removeByName('dias_alerta_validade')
      app.save(colConfig)
    } catch (_) {}
  },
)
