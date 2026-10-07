migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const fornecedoresColId = app.findCollectionByNameOrId('fornecedores').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const condicoesColId = app.findCollectionByNameOrId('condicoes_pagamento').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const usersColId = '_pb_users_auth_'

    // 1. Criar collection pedidos_compra
    if (!app.hasTable('pedidos_compra')) {
      const pedidosCol = new Collection({
        name: 'pedidos_compra',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
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
            name: 'numero',
            type: 'number',
            required: true,
          },
          {
            name: 'fornecedor_id',
            type: 'relation',
            required: true,
            collectionId: fornecedoresColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'comprador_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_emissao',
            type: 'text',
            required: false,
          },
          {
            name: 'data_previsao_entrega',
            type: 'text',
            required: false,
          },
          {
            name: 'condicao_pagamento_id',
            type: 'relation',
            required: false,
            collectionId: condicoesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Rascunho', 'Enviado', 'Parcialmente recebido', 'Recebido', 'Cancelado'],
            maxSelect: 1,
          },
          {
            name: 'valor_produtos',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_desconto',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_frete',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_outras_despesas',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_ipi',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_icms_st',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_total',
            type: 'number',
            required: false,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'observacao_fornecedor',
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
          'CREATE INDEX idx_pedidos_compra_empresa ON pedidos_compra (empresa_id)',
          'CREATE INDEX idx_pedidos_compra_fornecedor ON pedidos_compra (fornecedor_id)',
          'CREATE INDEX idx_pedidos_compra_comprador ON pedidos_compra (comprador_id)',
          'CREATE INDEX idx_pedidos_compra_status ON pedidos_compra (status)',
          'CREATE INDEX idx_pedidos_compra_emp_num ON pedidos_compra (empresa_id, numero)',
          'CREATE INDEX idx_pedidos_compra_ativo ON pedidos_compra (ativo)',
        ],
      })
      app.save(pedidosCol)
    }

    const pedidosColId = app.findCollectionByNameOrId('pedidos_compra').id

    // 2. Criar collection pedidos_compra_itens
    if (!app.hasTable('pedidos_compra_itens')) {
      const itensCol = new Collection({
        name: 'pedidos_compra_itens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'pedido_id',
            type: 'relation',
            required: true,
            collectionId: pedidosColId,
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
            name: 'desconto_percentual',
            type: 'number',
            required: false,
          },
          {
            name: 'aliquota_ipi',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_icms_st_estimado',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_total',
            type: 'number',
            required: false,
          },
          {
            name: 'quantidade_recebida',
            type: 'number',
            required: false,
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
          'CREATE INDEX idx_pedidos_itens_pedido ON pedidos_compra_itens (pedido_id)',
          'CREATE INDEX idx_pedidos_itens_produto ON pedidos_compra_itens (produto_id)',
          'CREATE INDEX idx_pedidos_itens_ativo ON pedidos_compra_itens (ativo)',
        ],
      })
      app.save(itensCol)
    }
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('pedidos_compra_itens')
      app.delete(itensCol)
    } catch (_) {}

    try {
      const pedidosCol = app.findCollectionByNameOrId('pedidos_compra')
      app.delete(pedidosCol)
    } catch (_) {}
  },
)
