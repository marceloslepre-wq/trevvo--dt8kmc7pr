migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const fornecedoresColId = app.findCollectionByNameOrId('fornecedores').id
    const pedidosColId = app.findCollectionByNameOrId('pedidos_compra').id
    const condicoesColId = app.findCollectionByNameOrId('condicoes_pagamento').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const usersColId = '_pb_users_auth_'

    // 1. TABELA cfop_conversao_entrada
    if (!app.hasTable('cfop_conversao_entrada')) {
      const col = new Collection({
        name: 'cfop_conversao_entrada',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'cfop_fornecedor', type: 'text', required: true },
          {
            name: 'tipo_entrada',
            type: 'select',
            required: true,
            values: [
              'Compra para revenda',
              'Compra para industrialização',
              'Uso e consumo',
              'Ativo imobilizado',
              'Bonificação',
              'Devolução de venda',
              'Outras entradas',
            ],
            maxSelect: 1,
          },
          { name: 'cfop_entrada', type: 'text', required: true },
          { name: 'descricao', type: 'text', required: false },
          { name: 'ativo', type: 'bool', required: false },
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
          'CREATE UNIQUE INDEX idx_cfop_conv_par ON cfop_conversao_entrada (cfop_fornecedor, tipo_entrada)',
          'CREATE INDEX idx_cfop_conv_ativo ON cfop_conversao_entrada (ativo)',
        ],
      })
      app.save(col)
    }

    // 2. TABELA notas_entrada
    if (!app.hasTable('notas_entrada')) {
      const col = new Collection({
        name: 'notas_entrada',
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
            name: 'fornecedor_id',
            type: 'relation',
            required: false,
            collectionId: fornecedoresColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'pedido_compra_id',
            type: 'relation',
            required: false,
            collectionId: pedidosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'origem_lancamento',
            type: 'select',
            required: true,
            values: ['XML', 'Digitação'],
            maxSelect: 1,
          },
          {
            name: 'modelo',
            type: 'select',
            required: true,
            values: ['55', '65', '01', '1B', '04'],
            maxSelect: 1,
          },
          { name: 'serie', type: 'text', required: false },
          { name: 'numero', type: 'number', required: true },
          { name: 'chave_acesso', type: 'text', required: false },
          { name: 'data_emissao', type: 'text', required: true },
          { name: 'data_entrada', type: 'text', required: true },
          { name: 'natureza_operacao', type: 'text', required: false },
          {
            name: 'tipo_entrada',
            type: 'select',
            required: true,
            values: [
              'Compra para revenda',
              'Compra para industrialização',
              'Uso e consumo',
              'Ativo imobilizado',
              'Bonificação',
              'Devolução de venda',
              'Outras entradas',
            ],
            maxSelect: 1,
          },
          { name: 'finalidade', type: 'number', required: false },
          {
            name: 'situacao_documento',
            type: 'select',
            required: false,
            values: ['00', '02', '08'],
            maxSelect: 1,
          },
          { name: 'indicador_pagamento', type: 'number', required: false },
          {
            name: 'condicao_pagamento_id',
            type: 'relation',
            required: false,
            collectionId: condicoesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'modalidade_frete', type: 'number', required: false },
          {
            name: 'transportadora_id',
            type: 'relation',
            required: false,
            collectionId: fornecedoresColId,
            cascadeDelete: false,
            maxSelect: 1,
          },

          // Totais (2 casas decimais)
          { name: 'valor_produtos', type: 'number', required: false },
          { name: 'valor_frete', type: 'number', required: false },
          { name: 'valor_seguro', type: 'number', required: false },
          { name: 'valor_desconto', type: 'number', required: false },
          { name: 'valor_outras_despesas', type: 'number', required: false },
          { name: 'valor_ipi', type: 'number', required: false },
          { name: 'base_icms', type: 'number', required: false },
          { name: 'valor_icms', type: 'number', required: false },
          { name: 'base_icms_st', type: 'number', required: false },
          { name: 'valor_icms_st', type: 'number', required: false },
          { name: 'valor_fcp_st', type: 'number', required: false },
          { name: 'valor_pis', type: 'number', required: false },
          { name: 'valor_cofins', type: 'number', required: false },
          { name: 'valor_ibs', type: 'number', required: false },
          { name: 'valor_cbs', type: 'number', required: false },
          { name: 'valor_total', type: 'number', required: false },

          // Créditos aproveitados
          { name: 'credito_icms', type: 'number', required: false },
          { name: 'credito_ipi', type: 'number', required: false },
          { name: 'credito_pis', type: 'number', required: false },
          { name: 'credito_cofins', type: 'number', required: false },

          { name: 'informacoes_complementares', type: 'text', required: false },
          { name: 'observacao', type: 'text', required: false },

          // Arquivo e protocolo SEFAZ
          {
            name: 'xml_arquivo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['text/xml', 'application/xml'],
          },
          { name: 'protocolo_autorizacao', type: 'text', required: false },
          { name: 'status_sefaz_xml', type: 'text', required: false },

          // Status e controle
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Em conferência', 'Lançada', 'Cancelada'],
            maxSelect: 1,
          },
          { name: 'data_lancamento', type: 'text', required: false },
          {
            name: 'usuario_lancamento_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },

          { name: 'ativo', type: 'bool', required: false },
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
          'CREATE INDEX idx_notas_entrada_empresa ON notas_entrada (empresa_id)',
          'CREATE INDEX idx_notas_entrada_fornecedor ON notas_entrada (fornecedor_id)',
          'CREATE INDEX idx_notas_entrada_chave ON notas_entrada (empresa_id, chave_acesso)',
          'CREATE INDEX idx_notas_entrada_status ON notas_entrada (status)',
          'CREATE INDEX idx_notas_entrada_data ON notas_entrada (data_emissao)',
          'CREATE INDEX idx_notas_entrada_ativo ON notas_entrada (ativo)',
        ],
      })
      app.save(col)
    }

    const notasEntradaColId = app.findCollectionByNameOrId('notas_entrada').id

    // 3. TABELA notas_entrada_itens
    if (!app.hasTable('notas_entrada_itens')) {
      const col = new Collection({
        name: 'notas_entrada_itens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'nota_id',
            type: 'relation',
            required: true,
            collectionId: notasEntradaColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'numero_item', type: 'number', required: true },

          // Dados como vieram do fornecedor
          { name: 'codigo_fornecedor', type: 'text', required: false },
          { name: 'descricao_fornecedor', type: 'text', required: true },
          { name: 'gtin_fornecedor', type: 'text', required: false },
          { name: 'ncm_fornecedor', type: 'text', required: false },
          { name: 'cest_fornecedor', type: 'text', required: false },
          { name: 'cfop_fornecedor', type: 'text', required: false },
          { name: 'unidade_fornecedor', type: 'text', required: false },
          { name: 'quantidade_fornecedor', type: 'number', required: true },
          { name: 'valor_unitario_fornecedor', type: 'number', required: true },

          // Vínculo ao nosso cadastro
          {
            name: 'produto_id',
            type: 'relation',
            required: false,
            collectionId: produtosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'fator_conversao', type: 'number', required: false },
          { name: 'quantidade_estoque', type: 'number', required: false },
          { name: 'lote_numero', type: 'text', required: false },
          { name: 'lote_fabricacao', type: 'text', required: false },
          { name: 'lote_validade', type: 'text', required: false },

          // Valores do item
          { name: 'valor_produto', type: 'number', required: false },
          { name: 'valor_desconto', type: 'number', required: false },
          { name: 'valor_frete', type: 'number', required: false },
          { name: 'valor_seguro', type: 'number', required: false },
          { name: 'valor_outras', type: 'number', required: false },

          // ICMS do fornecedor
          { name: 'origem', type: 'text', required: false },
          { name: 'cst_icms_fornecedor', type: 'text', required: false },
          { name: 'base_icms', type: 'number', required: false },
          { name: 'aliquota_icms', type: 'number', required: false },
          { name: 'valor_icms', type: 'number', required: false },
          { name: 'base_icms_st', type: 'number', required: false },
          { name: 'aliquota_icms_st', type: 'number', required: false },
          { name: 'valor_icms_st', type: 'number', required: false },
          { name: 'valor_fcp_st', type: 'number', required: false },

          // IPI
          { name: 'cst_ipi', type: 'text', required: false },
          { name: 'base_ipi', type: 'number', required: false },
          { name: 'aliquota_ipi', type: 'number', required: false },
          { name: 'valor_ipi', type: 'number', required: false },

          // PIS/COFINS do fornecedor
          { name: 'cst_pis_fornecedor', type: 'text', required: false },
          { name: 'valor_pis', type: 'number', required: false },
          { name: 'cst_cofins_fornecedor', type: 'text', required: false },
          { name: 'valor_cofins', type: 'number', required: false },

          // IBS/CBS
          { name: 'cst_ibs_cbs', type: 'text', required: false },
          { name: 'c_class_trib', type: 'text', required: false },
          { name: 'valor_ibs', type: 'number', required: false },
          { name: 'valor_cbs', type: 'number', required: false },

          // Escrituração do nosso lado
          { name: 'cfop_entrada', type: 'text', required: false },
          { name: 'cst_icms_entrada', type: 'text', required: false },
          { name: 'aproveita_credito_icms', type: 'bool', required: false },
          { name: 'valor_credito_icms', type: 'number', required: false },
          { name: 'cst_pis_entrada', type: 'text', required: false },
          { name: 'cst_cofins_entrada', type: 'text', required: false },
          { name: 'valor_credito_pis', type: 'number', required: false },
          { name: 'valor_credito_cofins', type: 'number', required: false },
          { name: 'aproveita_credito_ipi', type: 'bool', required: false },
          { name: 'valor_credito_ipi', type: 'number', required: false },

          // Custo
          { name: 'custo_total_item', type: 'number', required: false },
          { name: 'custo_unitario_estoque', type: 'number', required: false },

          { name: 'ativo', type: 'bool', required: false },
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
          'CREATE INDEX idx_notas_itens_nota ON notas_entrada_itens (nota_id)',
          'CREATE INDEX idx_notas_itens_produto ON notas_entrada_itens (produto_id)',
          'CREATE INDEX idx_notas_itens_ativo ON notas_entrada_itens (ativo)',
        ],
      })
      app.save(col)
    }

    // 4. TABELA notas_entrada_parcelas
    if (!app.hasTable('notas_entrada_parcelas')) {
      const col = new Collection({
        name: 'notas_entrada_parcelas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'nota_id',
            type: 'relation',
            required: true,
            collectionId: notasEntradaColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'numero', type: 'text', required: true },
          { name: 'data_vencimento', type: 'text', required: true },
          { name: 'valor', type: 'number', required: true },
          { name: 'forma_pagamento', type: 'text', required: false },
          { name: 'ativo', type: 'bool', required: false },
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
          'CREATE INDEX idx_notas_parc_nota ON notas_entrada_parcelas (nota_id)',
          'CREATE INDEX idx_notas_parc_venc ON notas_entrada_parcelas (data_vencimento)',
          'CREATE INDEX idx_notas_parc_ativo ON notas_entrada_parcelas (ativo)',
        ],
      })
      app.save(col)
    }

    // 5. Semear conversões de CFOP iniciais
    const cfopConvCol = app.findCollectionByNameOrId('cfop_conversao_entrada')
    const sementes = [
      // Compra para revenda
      { cfop_fornecedor: '5101', tipo_entrada: 'Compra para revenda', cfop_entrada: '1102' },
      { cfop_fornecedor: '5102', tipo_entrada: 'Compra para revenda', cfop_entrada: '1102' },
      { cfop_fornecedor: '5401', tipo_entrada: 'Compra para revenda', cfop_entrada: '1403' },
      { cfop_fornecedor: '5403', tipo_entrada: 'Compra para revenda', cfop_entrada: '1403' },
      { cfop_fornecedor: '5405', tipo_entrada: 'Compra para revenda', cfop_entrada: '1403' },
      { cfop_fornecedor: '6101', tipo_entrada: 'Compra para revenda', cfop_entrada: '2102' },
      { cfop_fornecedor: '6102', tipo_entrada: 'Compra para revenda', cfop_entrada: '2102' },
      { cfop_fornecedor: '6108', tipo_entrada: 'Compra para revenda', cfop_entrada: '2102' },
      { cfop_fornecedor: '6401', tipo_entrada: 'Compra para revenda', cfop_entrada: '2403' },
      { cfop_fornecedor: '6403', tipo_entrada: 'Compra para revenda', cfop_entrada: '2403' },
      { cfop_fornecedor: '6404', tipo_entrada: 'Compra para revenda', cfop_entrada: '2403' },

      // Compra para industrialização
      {
        cfop_fornecedor: '5101',
        tipo_entrada: 'Compra para industrialização',
        cfop_entrada: '1101',
      },
      {
        cfop_fornecedor: '5102',
        tipo_entrada: 'Compra para industrialização',
        cfop_entrada: '1101',
      },
      {
        cfop_fornecedor: '6101',
        tipo_entrada: 'Compra para industrialização',
        cfop_entrada: '2101',
      },
      {
        cfop_fornecedor: '6102',
        tipo_entrada: 'Compra para industrialização',
        cfop_entrada: '2101',
      },

      // Uso e consumo
      { cfop_fornecedor: '5101', tipo_entrada: 'Uso e consumo', cfop_entrada: '1556' },
      { cfop_fornecedor: '5102', tipo_entrada: 'Uso e consumo', cfop_entrada: '1556' },
      { cfop_fornecedor: '5401', tipo_entrada: 'Uso e consumo', cfop_entrada: '1407' },
      { cfop_fornecedor: '5403', tipo_entrada: 'Uso e consumo', cfop_entrada: '1407' },
      { cfop_fornecedor: '5405', tipo_entrada: 'Uso e consumo', cfop_entrada: '1407' },
      { cfop_fornecedor: '6101', tipo_entrada: 'Uso e consumo', cfop_entrada: '2556' },
      { cfop_fornecedor: '6102', tipo_entrada: 'Uso e consumo', cfop_entrada: '2556' },
      { cfop_fornecedor: '6403', tipo_entrada: 'Uso e consumo', cfop_entrada: '2407' },
      { cfop_fornecedor: '6404', tipo_entrada: 'Uso e consumo', cfop_entrada: '2407' },

      // Ativo imobilizado
      { cfop_fornecedor: '5101', tipo_entrada: 'Ativo imobilizado', cfop_entrada: '1551' },
      { cfop_fornecedor: '5102', tipo_entrada: 'Ativo imobilizado', cfop_entrada: '1551' },
      { cfop_fornecedor: '6101', tipo_entrada: 'Ativo imobilizado', cfop_entrada: '2551' },
      { cfop_fornecedor: '6102', tipo_entrada: 'Ativo imobilizado', cfop_entrada: '2551' },

      // Bonificação
      { cfop_fornecedor: '5910', tipo_entrada: 'Bonificação', cfop_entrada: '1910' },
      { cfop_fornecedor: '6910', tipo_entrada: 'Bonificação', cfop_entrada: '2910' },

      // Devolução de venda
      { cfop_fornecedor: '5202', tipo_entrada: 'Devolução de venda', cfop_entrada: '1202' },
      { cfop_fornecedor: '5411', tipo_entrada: 'Devolução de venda', cfop_entrada: '1411' },
      { cfop_fornecedor: '6202', tipo_entrada: 'Devolução de venda', cfop_entrada: '2202' },
      { cfop_fornecedor: '6411', tipo_entrada: 'Devolução de venda', cfop_entrada: '2411' },

      // Outras entradas
      { cfop_fornecedor: '5949', tipo_entrada: 'Outras entradas', cfop_entrada: '1949' },
      { cfop_fornecedor: '6949', tipo_entrada: 'Outras entradas', cfop_entrada: '2949' },
    ]

    for (let i = 0; i < sementes.length; i++) {
      const s = sementes[i]
      try {
        const existente = app.findRecordsByFilter(
          'cfop_conversao_entrada',
          `cfop_fornecedor = '${s.cfop_fornecedor}' && tipo_entrada = '${s.tipo_entrada}'`,
          '',
          1,
          0,
        )
        if (existente && existente.length > 0) continue
      } catch (_) {}

      const rec = new Record(cfopConvCol)
      rec.set('cfop_fornecedor', s.cfop_fornecedor)
      rec.set('tipo_entrada', s.tipo_entrada)
      rec.set('cfop_entrada', s.cfop_entrada)
      rec.set(
        'descricao',
        `Conversão de ${s.cfop_fornecedor} para ${s.cfop_entrada} (${s.tipo_entrada})`,
      )
      rec.set('ativo', true)
      app.save(rec)
    }
  },
  (app) => {
    try {
      const p = app.findCollectionByNameOrId('notas_entrada_parcelas')
      app.delete(p)
    } catch (_) {}
    try {
      const i = app.findCollectionByNameOrId('notas_entrada_itens')
      app.delete(i)
    } catch (_) {}
    try {
      const n = app.findCollectionByNameOrId('notas_entrada')
      app.delete(n)
    } catch (_) {}
    try {
      const c = app.findCollectionByNameOrId('cfop_conversao_entrada')
      app.delete(c)
    } catch (_) {}
  },
)
