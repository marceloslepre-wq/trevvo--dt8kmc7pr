migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    // 1. Criar collection condicoes_pagamento
    const condicoesCol = new Collection({
      name: 'condicoes_pagamento',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'number', required: false },
        { name: 'nome', type: 'text', required: true, max: 100 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['À vista', 'A prazo'],
          maxSelect: 1,
        },
        {
          name: 'uso',
          type: 'select',
          required: true,
          values: ['Vendas', 'Compras', 'Ambos'],
          maxSelect: 1,
        },
        { name: 'quantidade_parcelas', type: 'number', required: true, min: 1, onlyInt: true },
        { name: 'dias_parcelas', type: 'json', required: true },
        { name: 'percentual_entrada', type: 'number', required: false, min: 0, max: 100 },
        { name: 'acrescimo_percentual', type: 'number', required: false, min: 0 },
        { name: 'desconto_percentual', type: 'number', required: false, min: 0, max: 100 },
        {
          name: 'dia_fixo_vencimento',
          type: 'number',
          required: false,
          min: 1,
          max: 31,
          onlyInt: true,
        },
        { name: 'observacao', type: 'text', required: false },
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
        'CREATE UNIQUE INDEX idx_condicoes_pagamento_nome ON condicoes_pagamento (nome)',
        'CREATE INDEX idx_condicoes_pagamento_codigo ON condicoes_pagamento (codigo)',
        'CREATE INDEX idx_condicoes_pagamento_tipo ON condicoes_pagamento (tipo)',
        'CREATE INDEX idx_condicoes_pagamento_uso ON condicoes_pagamento (uso)',
        'CREATE INDEX idx_condicoes_pagamento_ativo ON condicoes_pagamento (ativo)',
      ],
    })

    app.save(condicoesCol)

    // 2. Semear as condições iniciais
    const condicoesIniciais = [
      {
        codigo: 1,
        nome: 'À vista',
        tipo: 'À vista',
        uso: 'Ambos',
        quantidade_parcelas: 1,
        dias_parcelas: [0],
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
        observacao: 'Pagamento integral no ato da operação.',
      },
      {
        codigo: 2,
        nome: '30 dias',
        tipo: 'A prazo',
        uso: 'Ambos',
        quantidade_parcelas: 1,
        dias_parcelas: [30],
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
        observacao: 'Pagamento em parcela única com vencimento em 30 dias.',
      },
      {
        codigo: 3,
        nome: '30/60',
        tipo: 'A prazo',
        uso: 'Ambos',
        quantidade_parcelas: 2,
        dias_parcelas: [30, 60],
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
        observacao: 'Pagamento em 2 parcelas (30 e 60 dias).',
      },
      {
        codigo: 4,
        nome: '30/60/90',
        tipo: 'A prazo',
        uso: 'Ambos',
        quantidade_parcelas: 3,
        dias_parcelas: [30, 60, 90],
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
        observacao: 'Pagamento em 3 parcelas (30, 60 e 90 dias).',
      },
      {
        codigo: 5,
        nome: '28 DDL',
        tipo: 'A prazo',
        uso: 'Ambos',
        quantidade_parcelas: 1,
        dias_parcelas: [28],
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
        observacao: 'Prazo comercial de 28 dias da data líquida.',
      },
    ]

    for (let i = 0; i < condicoesIniciais.length; i++) {
      const c = condicoesIniciais[i]
      try {
        app.findFirstRecordByData('condicoes_pagamento', 'nome', c.nome)
      } catch (_) {
        const rec = new Record(condicoesCol)
        rec.set('ativo', true)
        rec.set('codigo', c.codigo)
        rec.set('nome', c.nome)
        rec.set('tipo', c.tipo)
        rec.set('uso', c.uso)
        rec.set('quantidade_parcelas', c.quantidade_parcelas)
        rec.set('dias_parcelas', c.dias_parcelas)
        rec.set('percentual_entrada', c.percentual_entrada)
        rec.set('acrescimo_percentual', c.acrescimo_percentual)
        rec.set('desconto_percentual', c.desconto_percentual)
        rec.set('observacao', c.observacao)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('condicoes_pagamento')
      app.delete(col)
    } catch (_) {}
  },
)
