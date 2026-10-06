migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    // ==========================================
    // 1. COLLECTION: ncm
    // ==========================================
    const ncmCollection = new Collection({
      name: 'ncm',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'ex_tipi', type: 'text', required: false },
        { name: 'aliquota_ipi', type: 'number', required: false },
        { name: 'unidade_tributavel', type: 'text', required: false },
        { name: 'data_inicio', type: 'text', required: false },
        { name: 'data_fim', type: 'text', required: false },
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
        'CREATE UNIQUE INDEX idx_ncm_codigo ON ncm (codigo)',
        'CREATE INDEX idx_ncm_ativo ON ncm (ativo)',
      ],
    })
    app.save(ncmCollection)

    // ==========================================
    // 2. COLLECTION: cest
    // ==========================================
    const cestCollection = new Collection({
      name: 'cest',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'text', required: true },
        { name: 'ncm_codigos', type: 'text', required: false },
        { name: 'segmento', type: 'text', required: false },
        { name: 'item', type: 'text', required: false },
        { name: 'descricao', type: 'text', required: true },
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
        'CREATE UNIQUE INDEX idx_cest_codigo ON cest (codigo)',
        'CREATE INDEX idx_cest_ativo ON cest (ativo)',
      ],
    })
    app.save(cestCollection)

    // ==========================================
    // 3. COLLECTION: cfop
    // ==========================================
    const cfopCollection = new Collection({
      name: 'cfop',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
        { name: 'aplicacao', type: 'text', required: false },
        {
          name: 'tipo_movimento',
          type: 'select',
          required: true,
          values: ['Entrada', 'Saída'],
          maxSelect: 1,
        },
        {
          name: 'abrangencia',
          type: 'select',
          required: true,
          values: ['Estadual', 'Interestadual', 'Exterior'],
          maxSelect: 1,
        },
        { name: 'gera_financeiro', type: 'bool' },
        { name: 'movimenta_estoque', type: 'bool' },
        { name: 'devolucao', type: 'bool' },
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
        'CREATE UNIQUE INDEX idx_cfop_codigo ON cfop (codigo)',
        'CREATE INDEX idx_cfop_tipo_movimento ON cfop (tipo_movimento)',
        'CREATE INDEX idx_cfop_abrangencia ON cfop (abrangencia)',
        'CREATE INDEX idx_cfop_ativo ON cfop (ativo)',
      ],
    })
    app.save(cfopCollection)

    // ==========================================
    // 4. SEED CFOPs
    // ==========================================
    const cfopSeeds = [
      {
        codigo: '1102',
        descricao: 'Compra para comercialização',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '1101',
        descricao: 'Compra para industrialização ou produção rural',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '1403',
        descricao:
          'Compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '1202',
        descricao: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '1411',
        descricao:
          'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '1152',
        descricao: 'Transferência para comercialização',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '1409',
        descricao:
          'Transferência para comercialização em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '1556',
        descricao: 'Compra de material para uso ou consumo',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '1407',
        descricao:
          'Compra de mercadoria para uso ou consumo cuja mercadoria está sujeita ao regime de substituição tributária',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '1551',
        descricao: 'Compra de bem para o ativo imobilizado',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '1910',
        descricao: 'Entrada de bonificação, doação ou brinde',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '1949',
        descricao: 'Outra entrada de mercadoria ou prestação de serviço não especificada',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '2102',
        descricao: 'Compra para comercialização',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '2101',
        descricao: 'Compra para industrialização ou produção rural',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '2403',
        descricao:
          'Compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '2202',
        descricao: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '2411',
        descricao:
          'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '2556',
        descricao: 'Compra de material para uso ou consumo',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '2407',
        descricao:
          'Compra de mercadoria para uso ou consumo cuja mercadoria está sujeita ao regime de substituição tributária',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '2551',
        descricao: 'Compra de bem para o ativo imobilizado',
        fin: true,
        est: false,
        dev: false,
      },
      {
        codigo: '2910',
        descricao: 'Entrada de bonificação, doação ou brinde',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '2949',
        descricao: 'Outra entrada de mercadoria ou prestação de serviço não especificada',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5101',
        descricao: 'Venda de produção do estabelecimento',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '5102',
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '5401',
        descricao:
          'Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '5403',
        descricao:
          'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituto',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '5405',
        descricao:
          'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '5202',
        descricao: 'Devolução de compra para comercialização',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '5411',
        descricao:
          'Devolução de compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '5152',
        descricao: 'Transferência de mercadoria adquirida ou recebida de terceiros',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5409',
        descricao:
          'Transferência de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5910',
        descricao: 'Remessa em bonificação, doação ou brinde',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5915',
        descricao: 'Remessa de mercadoria ou bem para conserto ou reparo',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5927',
        descricao:
          'Lançamento efetuado a título de baixa de estoque decorrente de perda, roubo ou deterioração',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '5929',
        descricao:
          'Lançamento efetuado em decorrência de emissão de documento fiscal relativo a operação ou prestação também registrada em equipamento Emissor de Cupom Fiscal - ECF',
        fin: false,
        est: false,
        dev: false,
      },
      {
        codigo: '5949',
        descricao: 'Outra saída de mercadoria ou prestação de serviço não especificado',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '6101',
        descricao: 'Venda de produção do estabelecimento',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '6102',
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '6108',
        descricao:
          'Venda de mercadoria adquirida ou recebida de terceiros, destinada a não contribuinte',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '6403',
        descricao:
          'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituto',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '6404',
        descricao:
          'Venda de mercadoria sujeita ao regime de substituição tributária, cujo imposto já tenha sido retido anteriormente',
        fin: true,
        est: true,
        dev: false,
      },
      {
        codigo: '6202',
        descricao: 'Devolução de compra para comercialização',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '6411',
        descricao:
          'Devolução de compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária',
        fin: true,
        est: true,
        dev: true,
      },
      {
        codigo: '6152',
        descricao: 'Transferência de mercadoria adquirida ou recebida de terceiros',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '6910',
        descricao: 'Remessa em bonificação, doação ou brinde',
        fin: false,
        est: true,
        dev: false,
      },
      {
        codigo: '6949',
        descricao: 'Outra saída de mercadoria ou prestação de serviço não especificado',
        fin: false,
        est: true,
        dev: false,
      },
    ]

    for (let i = 0; i < cfopSeeds.length; i++) {
      const item = cfopSeeds[i]
      try {
        const existing = app.findRecordsByFilter('cfop', `codigo = '${item.codigo}'`, '', 1, 0)
        if (existing && existing.length > 0) {
          continue
        }
      } catch (_) {}

      const primeiroDigito = item.codigo.charAt(0)
      let tipoMovimento = 'Saída'
      if (['1', '2', '3'].indexOf(primeiroDigito) !== -1) {
        tipoMovimento = 'Entrada'
      }

      let abrangencia = 'Estadual'
      if (primeiroDigito === '2' || primeiroDigito === '6') {
        abrangencia = 'Interestadual'
      } else if (primeiroDigito === '3' || primeiroDigito === '7') {
        abrangencia = 'Exterior'
      }

      const record = new Record(cfopCollection)
      record.set('codigo', item.codigo)
      record.set('descricao', item.descricao)
      record.set('aplicacao', '')
      record.set('tipo_movimento', tipoMovimento)
      record.set('abrangencia', abrangencia)
      record.set('gera_financeiro', item.fin)
      record.set('movimenta_estoque', item.est)
      record.set('devolucao', item.dev)
      record.set('ativo', true)
      app.save(record)
    }
  },
  (app) => {
    try {
      const cfop = app.findCollectionByNameOrId('cfop')
      app.delete(cfop)
    } catch (_) {}
    try {
      const cest = app.findCollectionByNameOrId('cest')
      app.delete(cest)
    } catch (_) {}
    try {
      const ncm = app.findCollectionByNameOrId('ncm')
      app.delete(ncm)
    } catch (_) {}
  },
)
