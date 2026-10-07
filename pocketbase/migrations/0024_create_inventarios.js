migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const lotesColId = app.findCollectionByNameOrId('lotes').id
    const usersColId = '_pb_users_auth_'

    // 1. Criar collection inventarios
    if (!app.hasTable('inventarios')) {
      const inventariosCol = new Collection({
        name: 'inventarios',
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
            name: 'descricao',
            type: 'text',
            required: true,
          },
          {
            name: 'data_referencia',
            type: 'text',
            required: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Geral', 'Parcial', 'Anual (Bloco H)'],
            maxSelect: 1,
          },
          {
            name: 'filtros_usados',
            type: 'json',
            required: false,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Aberto', 'Em contagem', 'Finalizado', 'Cancelado'],
            maxSelect: 1,
          },
          {
            name: 'motivo_bloco_h',
            type: 'select',
            required: false,
            values: [
              '01 No final do período',
              '02 Na mudança de forma de tributação da mercadoria (ICMS)',
              '03 Na solicitação da baixa cadastral, paralisação temporária e outras situações',
              '04 Na alteração de regime de pagamento – condição do contribuinte',
              '05 Por determinação dos fiscos',
              '06 Para controle das mercadorias sujeitas ao regime de substituição tributária – restituição/ressarcimento/complementação',
            ],
            maxSelect: 1,
          },
          {
            name: 'usuario_abertura_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'usuario_finalizacao_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_finalizacao',
            type: 'text',
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
          'CREATE INDEX idx_inventarios_empresa ON inventarios (empresa_id)',
          'CREATE INDEX idx_inventarios_status ON inventarios (status)',
          'CREATE INDEX idx_inventarios_emp_num ON inventarios (empresa_id, numero)',
          'CREATE INDEX idx_inventarios_data_ref ON inventarios (data_referencia)',
          'CREATE INDEX idx_inventarios_ativo ON inventarios (ativo)',
        ],
      })
      app.save(inventariosCol)
    }

    const inventariosColId = app.findCollectionByNameOrId('inventarios').id

    // 2. Criar collection inventarios_itens
    if (!app.hasTable('inventarios_itens')) {
      const itensCol = new Collection({
        name: 'inventarios_itens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'inventario_id',
            type: 'relation',
            required: true,
            collectionId: inventariosColId,
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
            name: 'saldo_sistema',
            type: 'number',
            required: true,
          },
          {
            name: 'quantidade_contada',
            type: 'number',
            required: false,
          },
          {
            name: 'diferenca',
            type: 'number',
            required: false,
          },
          {
            name: 'custo_unitario',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_diferenca',
            type: 'number',
            required: false,
          },
          {
            name: 'contado_por',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'contado_em',
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
          'CREATE INDEX idx_inv_itens_inv ON inventarios_itens (inventario_id)',
          'CREATE INDEX idx_inv_itens_prod ON inventarios_itens (produto_id)',
          'CREATE INDEX idx_inv_itens_lote ON inventarios_itens (lote_id)',
          'CREATE INDEX idx_inv_itens_ativo ON inventarios_itens (ativo)',
        ],
      })
      app.save(itensCol)
    }
  },
  (app) => {
    try {
      const itensCol = app.findCollectionByNameOrId('inventarios_itens')
      app.delete(itensCol)
    } catch (_) {}

    try {
      const invCol = app.findCollectionByNameOrId('inventarios')
      app.delete(invCol)
    } catch (_) {}
  },
)
