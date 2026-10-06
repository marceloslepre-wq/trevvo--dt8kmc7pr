migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    const collection = new Collection({
      name: 'tabelas_fiscais_codigos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'tipo', type: 'text', required: true },
        { name: 'codigo', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: true },
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
        'CREATE UNIQUE INDEX idx_tabelas_fiscais_tipo_codigo ON tabelas_fiscais_codigos (tipo, codigo)',
        'CREATE INDEX idx_tabelas_fiscais_tipo ON tabelas_fiscais_codigos (tipo)',
        'CREATE INDEX idx_tabelas_fiscais_ativo ON tabelas_fiscais_codigos (ativo)',
      ],
    })
    app.save(collection)

    const seeds = [
      // ORIGEM
      {
        tipo: 'ORIGEM',
        codigo: '0',
        descricao: 'Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '1',
        descricao: 'Estrangeira - importação direta, exceto a indicada no código 6',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '2',
        descricao: 'Estrangeira - adquirida no mercado interno, exceto a indicada no código 7',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '3',
        descricao: 'Nacional, com conteúdo de importação superior a 40% e inferior ou igual a 70%',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '4',
        descricao: 'Nacional, produzida conforme processos produtivos básicos (PPB)',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '5',
        descricao: 'Nacional, com conteúdo de importação inferior ou igual a 40%',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '6',
        descricao:
          'Estrangeira - importação direta, sem similar nacional, constante em lista CAMEX e gás natural',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '7',
        descricao:
          'Estrangeira - adquirida no mercado interno, sem similar nacional, constante em lista CAMEX e gás natural',
        observacao: '',
      },
      {
        tipo: 'ORIGEM',
        codigo: '8',
        descricao: 'Nacional, com conteúdo de importação superior a 70%',
        observacao: '',
      },

      // CST_ICMS
      { tipo: 'CST_ICMS', codigo: '00', descricao: 'Tributada integralmente', observacao: '' },
      {
        tipo: 'CST_ICMS',
        codigo: '02',
        descricao: 'Tributação monofásica própria sobre combustíveis',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '10',
        descricao: 'Tributada e com cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '15',
        descricao:
          'Tributação monofásica própria e com responsabilidade pela retenção sobre combustíveis',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '20',
        descricao: 'Com redução de base de cálculo',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '30',
        descricao: 'Isenta ou não tributada e com cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      { tipo: 'CST_ICMS', codigo: '40', descricao: 'Isenta', observacao: '' },
      { tipo: 'CST_ICMS', codigo: '41', descricao: 'Não tributada', observacao: '' },
      { tipo: 'CST_ICMS', codigo: '50', descricao: 'Suspensão', observacao: '' },
      { tipo: 'CST_ICMS', codigo: '51', descricao: 'Diferimento', observacao: '' },
      {
        tipo: 'CST_ICMS',
        codigo: '53',
        descricao: 'Tributação monofásica sobre combustíveis com recolhimento diferido',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '60',
        descricao: 'ICMS cobrado anteriormente por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '61',
        descricao: 'Tributação monofásica sobre combustíveis cobrada anteriormente',
        observacao: '',
      },
      {
        tipo: 'CST_ICMS',
        codigo: '70',
        descricao: 'Com redução de base de cálculo e cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      { tipo: 'CST_ICMS', codigo: '90', descricao: 'Outras', observacao: '' },

      // CSOSN
      {
        tipo: 'CSOSN',
        codigo: '101',
        descricao: 'Tributada pelo Simples Nacional com permissão de crédito',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '102',
        descricao: 'Tributada pelo Simples Nacional sem permissão de crédito',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '103',
        descricao: 'Isenção do ICMS no Simples Nacional para faixa de receita bruta',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '201',
        descricao:
          'Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '202',
        descricao:
          'Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '203',
        descricao:
          'Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por substituição tributária',
        observacao: '',
      },
      { tipo: 'CSOSN', codigo: '300', descricao: 'Imune', observacao: '' },
      {
        tipo: 'CSOSN',
        codigo: '400',
        descricao: 'Não tributada pelo Simples Nacional',
        observacao: '',
      },
      {
        tipo: 'CSOSN',
        codigo: '500',
        descricao:
          'ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação',
        observacao: '',
      },
      { tipo: 'CSOSN', codigo: '900', descricao: 'Outros', observacao: '' },

      // MOD_BC_ICMS
      { tipo: 'MOD_BC_ICMS', codigo: '0', descricao: 'Margem Valor Agregado (%)', observacao: '' },
      { tipo: 'MOD_BC_ICMS', codigo: '1', descricao: 'Pauta (valor)', observacao: '' },
      {
        tipo: 'MOD_BC_ICMS',
        codigo: '2',
        descricao: 'Preço tabelado máximo (valor)',
        observacao: '',
      },
      { tipo: 'MOD_BC_ICMS', codigo: '3', descricao: 'Valor da operação', observacao: '' },

      // MOD_BC_ICMS_ST
      {
        tipo: 'MOD_BC_ICMS_ST',
        codigo: '0',
        descricao: 'Preço tabelado ou máximo sugerido',
        observacao: '',
      },
      { tipo: 'MOD_BC_ICMS_ST', codigo: '1', descricao: 'Lista negativa (valor)', observacao: '' },
      { tipo: 'MOD_BC_ICMS_ST', codigo: '2', descricao: 'Lista positiva (valor)', observacao: '' },
      { tipo: 'MOD_BC_ICMS_ST', codigo: '3', descricao: 'Lista neutra (valor)', observacao: '' },
      {
        tipo: 'MOD_BC_ICMS_ST',
        codigo: '4',
        descricao: 'Margem Valor Agregado (%)',
        observacao: '',
      },
      { tipo: 'MOD_BC_ICMS_ST', codigo: '5', descricao: 'Pauta (valor)', observacao: '' },
      { tipo: 'MOD_BC_ICMS_ST', codigo: '6', descricao: 'Valor da operação', observacao: '' },

      // CST_IPI
      {
        tipo: 'CST_IPI',
        codigo: '00',
        descricao: 'Entrada com recuperação de crédito',
        observacao: '',
      },
      {
        tipo: 'CST_IPI',
        codigo: '01',
        descricao: 'Entrada tributada com alíquota zero',
        observacao: '',
      },
      { tipo: 'CST_IPI', codigo: '02', descricao: 'Entrada isenta', observacao: '' },
      { tipo: 'CST_IPI', codigo: '03', descricao: 'Entrada não tributada', observacao: '' },
      { tipo: 'CST_IPI', codigo: '04', descricao: 'Entrada imune', observacao: '' },
      { tipo: 'CST_IPI', codigo: '05', descricao: 'Entrada com suspensão', observacao: '' },
      { tipo: 'CST_IPI', codigo: '49', descricao: 'Outras entradas', observacao: '' },
      { tipo: 'CST_IPI', codigo: '50', descricao: 'Saída tributada', observacao: '' },
      {
        tipo: 'CST_IPI',
        codigo: '51',
        descricao: 'Saída tributada com alíquota zero',
        observacao: '',
      },
      { tipo: 'CST_IPI', codigo: '52', descricao: 'Saída isenta', observacao: '' },
      { tipo: 'CST_IPI', codigo: '53', descricao: 'Saída não tributada', observacao: '' },
      { tipo: 'CST_IPI', codigo: '54', descricao: 'Saída imune', observacao: '' },
      { tipo: 'CST_IPI', codigo: '55', descricao: 'Saída com suspensão', observacao: '' },
      { tipo: 'CST_IPI', codigo: '99', descricao: 'Outras saídas', observacao: '' },

      // CST_PIS_COFINS
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '01',
        descricao: 'Operação tributável com alíquota básica',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '02',
        descricao: 'Operação tributável com alíquota diferenciada',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '03',
        descricao: 'Operação tributável com alíquota por unidade de medida de produto',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '04',
        descricao: 'Operação tributável monofásica - revenda a alíquota zero',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '05',
        descricao: 'Operação tributável por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '06',
        descricao: 'Operação tributável a alíquota zero',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '07',
        descricao: 'Operação isenta da contribuição',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '08',
        descricao: 'Operação sem incidência da contribuição',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '09',
        descricao: 'Operação com suspensão da contribuição',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '49',
        descricao: 'Outras operações de saída',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '50',
        descricao:
          'Operação com direito a crédito - vinculada exclusivamente a receita tributada no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '51',
        descricao:
          'Operação com direito a crédito - vinculada exclusivamente a receita não tributada no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '52',
        descricao:
          'Operação com direito a crédito - vinculada exclusivamente a receita de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '53',
        descricao:
          'Operação com direito a crédito - vinculada a receitas tributadas e não tributadas no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '54',
        descricao:
          'Operação com direito a crédito - vinculada a receitas tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '55',
        descricao:
          'Operação com direito a crédito - vinculada a receitas não tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '56',
        descricao:
          'Operação com direito a crédito - vinculada a receitas tributadas e não tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '60',
        descricao:
          'Crédito presumido - operação de aquisição vinculada exclusivamente a receita tributada no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '61',
        descricao:
          'Crédito presumido - operação de aquisição vinculada exclusivamente a receita não tributada no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '62',
        descricao:
          'Crédito presumido - operação de aquisição vinculada exclusivamente a receita de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '63',
        descricao:
          'Crédito presumido - operação de aquisição vinculada a receitas tributadas e não tributadas no mercado interno',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '64',
        descricao:
          'Crédito presumido - operação de aquisição vinculada a receitas tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '65',
        descricao:
          'Crédito presumido - operação de aquisição vinculada a receitas não tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '66',
        descricao:
          'Crédito presumido - operação de aquisição vinculada a receitas tributadas e não tributadas no mercado interno e de exportação',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '67',
        descricao: 'Crédito presumido - outras operações',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '70',
        descricao: 'Operação de aquisição sem direito a crédito',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '71',
        descricao: 'Operação de aquisição com isenção',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '72',
        descricao: 'Operação de aquisição com suspensão',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '73',
        descricao: 'Operação de aquisição a alíquota zero',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '74',
        descricao: 'Operação de aquisição sem incidência da contribuição',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '75',
        descricao: 'Operação de aquisição por substituição tributária',
        observacao: '',
      },
      {
        tipo: 'CST_PIS_COFINS',
        codigo: '98',
        descricao: 'Outras operações de entrada',
        observacao: '',
      },
      { tipo: 'CST_PIS_COFINS', codigo: '99', descricao: 'Outras operações', observacao: '' },

      // TIPO_ITEM_SPED
      {
        tipo: 'TIPO_ITEM_SPED',
        codigo: '00',
        descricao: 'Mercadoria para revenda',
        observacao: '',
      },
      { tipo: 'TIPO_ITEM_SPED', codigo: '01', descricao: 'Matéria-prima', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '02', descricao: 'Embalagem', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '03', descricao: 'Produto em processo', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '04', descricao: 'Produto acabado', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '05', descricao: 'Subproduto', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '06', descricao: 'Produto intermediário', observacao: '' },
      {
        tipo: 'TIPO_ITEM_SPED',
        codigo: '07',
        descricao: 'Material de uso e consumo',
        observacao: '',
      },
      { tipo: 'TIPO_ITEM_SPED', codigo: '08', descricao: 'Ativo imobilizado', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '09', descricao: 'Serviços', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '10', descricao: 'Outros insumos', observacao: '' },
      { tipo: 'TIPO_ITEM_SPED', codigo: '99', descricao: 'Outras', observacao: '' },

      // CRT
      { tipo: 'CRT', codigo: '1', descricao: 'Simples Nacional', observacao: '' },
      {
        tipo: 'CRT',
        codigo: '2',
        descricao: 'Simples Nacional - excesso de sublimite de receita bruta',
        observacao: '',
      },
      { tipo: 'CRT', codigo: '3', descricao: 'Regime Normal', observacao: '' },
      { tipo: 'CRT', codigo: '4', descricao: 'Simples Nacional - MEI', observacao: '' },

      // IND_IE_DEST
      { tipo: 'IND_IE_DEST', codigo: '1', descricao: 'Contribuinte ICMS', observacao: '' },
      {
        tipo: 'IND_IE_DEST',
        codigo: '2',
        descricao: 'Contribuinte isento de inscrição no cadastro de contribuintes',
        observacao: '',
      },
      { tipo: 'IND_IE_DEST', codigo: '9', descricao: 'Não contribuinte', observacao: '' },

      // CST_IBS_CBS e CCLASSTRIB (Reforma Tributária)
      {
        tipo: 'CST_IBS_CBS',
        codigo: '000',
        descricao: 'Tributação integral',
        observacao: 'Conferir na tabela oficial',
      },
      {
        tipo: 'CCLASSTRIB',
        codigo: '000001',
        descricao: 'Situações tributadas integralmente pelo IBS e CBS',
        observacao: 'Conferir na tabela oficial',
      },
    ]

    for (let i = 0; i < seeds.length; i++) {
      const item = seeds[i]
      try {
        const existing = app.findRecordsByFilter(
          'tabelas_fiscais_codigos',
          `tipo = '${item.tipo}' && codigo = '${item.codigo}'`,
          '',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          continue
        }
      } catch (_) {}

      const record = new Record(collection)
      record.set('tipo', item.tipo)
      record.set('codigo', item.codigo)
      record.set('descricao', item.descricao)
      record.set('observacao', item.observacao || '')
      record.set('ativo', true)
      app.save(record)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('tabelas_fiscais_codigos')
      app.delete(col)
    } catch (_) {}
  },
)
