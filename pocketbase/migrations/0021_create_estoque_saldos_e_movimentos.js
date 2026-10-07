migrate(
  (app) => {
    const empresasCol = app.findCollectionByNameOrId('empresas')

    // 1. Adicionar campo permite_estoque_negativo em empresas se não existir
    if (!empresasCol.fields.getByName('permite_estoque_negativo')) {
      empresasCol.fields.add(
        new BoolField({
          name: 'permite_estoque_negativo',
          required: false,
        }),
      )
      app.save(empresasCol)
    }

    const empresasColId = empresasCol.id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const usersColId = '_pb_users_auth_'

    // 2. Criar tabela estoque_saldos
    // Regra: bloqueado para criação/edição/exclusão direta pelo usuário comum (null = superuser only)
    if (!app.hasTable('estoque_saldos')) {
      const saldosCol = new Collection({
        name: 'estoque_saldos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
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
            name: 'quantidade',
            type: 'number',
            required: false,
          },
          {
            name: 'custo_medio',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_total',
            type: 'number',
            required: false,
          },
          {
            name: 'data_ultima_entrada',
            type: 'text',
            required: false,
          },
          {
            name: 'data_ultima_saida',
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
          'CREATE UNIQUE INDEX idx_estoque_saldos_empresa_produto ON estoque_saldos (empresa_id, produto_id)',
          'CREATE INDEX idx_estoque_saldos_empresa ON estoque_saldos (empresa_id)',
          'CREATE INDEX idx_estoque_saldos_produto ON estoque_saldos (produto_id)',
          'CREATE INDEX idx_estoque_saldos_ativo ON estoque_saldos (ativo)',
        ],
      })
      app.save(saldosCol)
    }

    // 3. Criar tabela estoque_movimentos (kardex imutável)
    // Regra: bloqueado para criação/edição/exclusão direta pelo usuário comum (null = superuser only)
    if (!app.hasTable('estoque_movimentos')) {
      const movimentosCol = new Collection({
        name: 'estoque_movimentos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
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
            name: 'data_movimento',
            type: 'text',
            required: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Entrada', 'Saída'],
            maxSelect: 1,
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            values: [
              'SALDO_INICIAL',
              'AJUSTE_ENTRADA',
              'AJUSTE_SAIDA',
              'PERDA',
              'CONSUMO_INTERNO',
              'BONIFICACAO_ENTRADA',
              'BONIFICACAO_SAIDA',
              'TRANSFERENCIA_ENTRADA',
              'TRANSFERENCIA_SAIDA',
              'INVENTARIO_ENTRADA',
              'INVENTARIO_SAIDA',
              'COMPRA',
              'DEVOLUCAO_COMPRA',
              'VENDA',
              'DEVOLUCAO_VENDA',
              'ESTORNO',
            ],
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
            name: 'valor_total',
            type: 'number',
            required: false,
          },
          {
            name: 'saldo_anterior',
            type: 'number',
            required: false,
          },
          {
            name: 'saldo_posterior',
            type: 'number',
            required: false,
          },
          {
            name: 'custo_medio_anterior',
            type: 'number',
            required: false,
          },
          {
            name: 'custo_medio_posterior',
            type: 'number',
            required: false,
          },
          {
            name: 'lote_id',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_tipo',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_id',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_numero',
            type: 'text',
            required: false,
          },
          {
            name: 'motivo',
            type: 'text',
            required: false,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: false,
            collectionId: usersColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'estornado',
            type: 'bool',
            required: false,
          },
          {
            name: 'movimento_estornado_id',
            type: 'text',
            required: false,
          },
          {
            name: 'movimento_estorno_id',
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
          'CREATE INDEX idx_mov_empresa_prod_data ON estoque_movimentos (empresa_id, produto_id, data_movimento)',
          'CREATE INDEX idx_mov_empresa ON estoque_movimentos (empresa_id)',
          'CREATE INDEX idx_mov_produto ON estoque_movimentos (produto_id)',
          'CREATE INDEX idx_mov_data ON estoque_movimentos (data_movimento)',
          'CREATE INDEX idx_mov_tipo ON estoque_movimentos (tipo)',
          'CREATE INDEX idx_mov_origem ON estoque_movimentos (origem)',
          'CREATE INDEX idx_mov_doc ON estoque_movimentos (documento_tipo, documento_id)',
          'CREATE INDEX idx_mov_estornado ON estoque_movimentos (estornado)',
          'CREATE INDEX idx_mov_ativo ON estoque_movimentos (ativo)',
        ],
      })
      app.save(movimentosCol)
    }
  },
  (app) => {
    try {
      const movimentosCol = app.findCollectionByNameOrId('estoque_movimentos')
      app.delete(movimentosCol)
    } catch (_) {}

    try {
      const saldosCol = app.findCollectionByNameOrId('estoque_saldos')
      app.delete(saldosCol)
    } catch (_) {}

    try {
      const empresasCol = app.findCollectionByNameOrId('empresas')
      empresasCol.fields.removeByName('permite_estoque_negativo')
      app.save(empresasCol)
    } catch (_) {}
  },
)
