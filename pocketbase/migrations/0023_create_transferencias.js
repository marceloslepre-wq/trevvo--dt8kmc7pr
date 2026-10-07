migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const lotesColId = app.findCollectionByNameOrId('lotes').id
    const usersColId = '_pb_users_auth_'

    // 1. Criar collection transferencias
    if (!app.hasTable('transferencias')) {
      const transferenciasCol = new Collection({
        name: 'transferencias',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'numero',
            type: 'number',
            required: true,
          },
          {
            name: 'empresa_origem_id',
            type: 'relation',
            required: true,
            collectionId: empresasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa_destino_id',
            type: 'relation',
            required: true,
            collectionId: empresasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_envio',
            type: 'text',
            required: false,
          },
          {
            name: 'data_recebimento',
            type: 'text',
            required: false,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Rascunho', 'Enviada', 'Recebida', 'Cancelada'],
            maxSelect: 1,
          },
          {
            name: 'nota_fiscal_numero',
            type: 'text',
            required: false,
          },
          {
            name: 'nota_fiscal_chave',
            type: 'text',
            required: false,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'usuario_envio_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'usuario_recebimento_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_transf_origem ON transferencias (empresa_origem_id)',
          'CREATE INDEX idx_transf_destino ON transferencias (empresa_destino_id)',
          'CREATE INDEX idx_transf_status ON transferencias (status)',
          'CREATE INDEX idx_transf_origem_num ON transferencias (empresa_origem_id, numero)',
          'CREATE INDEX idx_transf_ativo ON transferencias (ativo)',
        ],
      })
      app.save(transferenciasCol)
    }

    const transferenciasColId = app.findCollectionByNameOrId('transferencias').id

    // 2. Criar collection transferencias_itens
    if (!app.hasTable('transferencias_itens')) {
      const itensCol = new Collection({
        name: 'transferencias_itens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'transferencia_id',
            type: 'relation',
            required: true,
            collectionId: transferenciasColId,
            cascadeDelete: true,
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
            name: 'lote_id',
            type: 'relation',
            required: false,
            collectionId: lotesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'quantidade',
            type: 'number',
            required: true,
          },
          {
            name: 'custo_unitario',
            type: 'number',
            required: false,
          },
          {
            name: 'quantidade_recebida',
            type: 'number',
            required: false,
          },
          {
            name: 'divergencia',
            type: 'number',
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_transf_itens_transf ON transferencias_itens (transferencia_id)',
          'CREATE INDEX idx_transf_itens_prod ON transferencias_itens (produto_id)',
          'CREATE INDEX idx_transf_itens_lote ON transferencias_itens (lote_id)',
          'CREATE INDEX idx_transf_itens_ativo ON transferencias_itens (ativo)',
        ],
      })
      app.save(itensCol)
    }
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('transferencias_itens')
      app.delete(itensCol)
    } catch (_) {}

    try {
      const transfCol = app.findCollectionByNameOrId('transferencias')
      app.delete(transfCol)
    } catch (_) {}
  },
)
