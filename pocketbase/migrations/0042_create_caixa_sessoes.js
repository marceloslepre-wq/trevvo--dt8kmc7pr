migrate(
  (app) => {
    // 1. Adicionar campo fechamento_cego em config_vendas_empresa
    const cfgCol = app.findCollectionByNameOrId('config_vendas_empresa')
    if (!cfgCol.fields.getByName('fechamento_cego')) {
      cfgCol.fields.add(
        new BoolField({
          name: 'fechamento_cego',
          required: false,
        }),
      )
      app.save(cfgCol)
    }

    // Preencher fechamento_cego = true para registros existentes
    try {
      app
        .db()
        .newQuery(
          'UPDATE config_vendas_empresa SET fechamento_cego = 1 WHERE fechamento_cego IS NULL',
        )
        .execute()
    } catch (_) {}

    // 2. Criar coleção caixa_sessoes
    const empresasId = app.findCollectionByNameOrId('empresas').id
    const terminaisId = app.findCollectionByNameOrId('pdv_terminais').id
    const usuariosId = app.findCollectionByNameOrId('usuarios').id

    const sessoesCol = new Collection({
      name: 'caixa_sessoes',
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
          collectionId: empresasId,
          maxSelect: 1,
        },
        {
          name: 'pdv_terminal_id',
          type: 'relation',
          required: true,
          collectionId: terminaisId,
          maxSelect: 1,
        },
        {
          name: 'operador_id',
          type: 'relation',
          required: true,
          collectionId: usuariosId,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Aberto', 'Fechado'],
          maxSelect: 1,
        },
        { name: 'data_abertura', type: 'text', required: true },
        { name: 'valor_abertura', type: 'number' },
        { name: 'data_fechamento', type: 'text' },
        { name: 'valor_esperado_dinheiro', type: 'number' },
        { name: 'valor_contado_dinheiro', type: 'number' },
        { name: 'diferenca_dinheiro', type: 'number' },
        { name: 'totais_por_forma', type: 'json' },
        { name: 'quantidade_vendas', type: 'number' },
        { name: 'valor_vendas', type: 'number' },
        { name: 'valor_cancelado', type: 'number' },
        { name: 'valor_sangrias', type: 'number' },
        { name: 'valor_suprimentos', type: 'number' },
        { name: 'observacao_fechamento', type: 'text' },
        { name: 'conferido_por_id', type: 'relation', collectionId: usuariosId, maxSelect: 1 },
        { name: 'data_conferencia', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'updated_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_caixa_sessoes_empresa ON caixa_sessoes (empresa_id)',
        'CREATE INDEX idx_caixa_sessoes_terminal ON caixa_sessoes (pdv_terminal_id)',
        'CREATE INDEX idx_caixa_sessoes_operador ON caixa_sessoes (operador_id)',
        'CREATE INDEX idx_caixa_sessoes_status ON caixa_sessoes (status)',
        'CREATE INDEX idx_caixa_sessoes_abertura ON caixa_sessoes (data_abertura)',
      ],
    })
    app.save(sessoesCol)

    // 3. Criar coleção caixa_sessoes_movimentos
    const sessoesId = app.findCollectionByNameOrId('caixa_sessoes').id
    const movsFinId = app.findCollectionByNameOrId('movimentacoes_financeiras').id

    const movsCol = new Collection({
      name: 'caixa_sessoes_movimentos',
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
          collectionId: empresasId,
          maxSelect: 1,
        },
        {
          name: 'caixa_sessao_id',
          type: 'relation',
          required: true,
          collectionId: sessoesId,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['Sangria', 'Suprimento', 'Fundo_Inicial', 'Ajuste_Falta', 'Ajuste_Sobra'],
          maxSelect: 1,
        },
        { name: 'valor', type: 'number', required: true },
        { name: 'motivo', type: 'text' },
        {
          name: 'movimentacao_financeira_id',
          type: 'relation',
          collectionId: movsFinId,
          maxSelect: 1,
        },
        { name: 'transferencia_id', type: 'text' },
        { name: 'operador_id', type: 'relation', collectionId: usuariosId, maxSelect: 1 },
        { name: 'data_hora', type: 'text', required: true },
        { name: 'ativo', type: 'bool' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'updated_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_caixa_mov_sessao ON caixa_sessoes_movimentos (caixa_sessao_id)',
        'CREATE INDEX idx_caixa_mov_tipo ON caixa_sessoes_movimentos (tipo)',
        'CREATE INDEX idx_caixa_mov_empresa ON caixa_sessoes_movimentos (empresa_id)',
      ],
    })
    app.save(movsCol)
  },
  (app) => {
    try {
      const movsCol = app.findCollectionByNameOrId('caixa_sessoes_movimentos')
      app.delete(movsCol)
    } catch (_) {}

    try {
      const sessoesCol = app.findCollectionByNameOrId('caixa_sessoes')
      app.delete(sessoesCol)
    } catch (_) {}

    try {
      const cfgCol = app.findCollectionByNameOrId('config_vendas_empresa')
      const field = cfgCol.fields.getByName('fechamento_cego')
      if (field) {
        cfgCol.fields.remove(field)
        app.save(cfgCol)
      }
    } catch (_) {}
  },
)
