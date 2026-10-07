migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const marcasColId = app.findCollectionByNameOrId('marcas').id
    const gruposColId = app.findCollectionByNameOrId('grupos').id
    const categoriasColId = app.findCollectionByNameOrId('categorias').id
    const fornecedoresColId = app.findCollectionByNameOrId('fornecedores').id
    const unidadesColId = app.findCollectionByNameOrId('unidades_medida').id
    const perfisTribColId = app.findCollectionByNameOrId('perfis_tributarios').id

    // 1. Coleção produtos
    const produtosCol = new Collection({
      name: 'produtos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'number', required: false },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['Produto', 'Serviço', 'Kit'],
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true, max: 120 },
        { name: 'descricao_reduzida', type: 'text', required: false, max: 40 },
        { name: 'gtin', type: 'text', required: false, max: 14 },
        { name: 'gtin_tributavel', type: 'text', required: false, max: 14 },
        { name: 'referencia', type: 'text', required: false, max: 60 },
        {
          name: 'marca_id',
          type: 'relation',
          required: false,
          collectionId: marcasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'grupo_id',
          type: 'relation',
          required: false,
          collectionId: gruposColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'categoria_id',
          type: 'relation',
          required: false,
          collectionId: categoriasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'fornecedor_principal_id',
          type: 'relation',
          required: false,
          collectionId: fornecedoresColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'foto',
          type: 'file',
          required: false,
          maxSelect: 1,
          maxSize: 2097152, // 2MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
        {
          name: 'fotos_adicionais',
          type: 'file',
          required: false,
          maxSelect: 5,
          maxSize: 2097152, // 2MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
        { name: 'observacoes', type: 'text', required: false },

        // Unidades
        {
          name: 'unidade_id',
          type: 'relation',
          required: false,
          collectionId: unidadesColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'unidade_tributavel_id',
          type: 'relation',
          required: false,
          collectionId: unidadesColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'fator_conversao_tributavel', type: 'number', required: false },

        // Preços
        { name: 'preco_custo', type: 'number', required: false },
        { name: 'outras_despesas_percentual', type: 'number', required: false },
        { name: 'custo_final', type: 'number', required: false },
        { name: 'margem_percentual', type: 'number', required: false },
        { name: 'preco_venda', type: 'number', required: false },
        { name: 'preco_promocional', type: 'number', required: false },
        { name: 'promocao_inicio', type: 'text', required: false },
        { name: 'promocao_fim', type: 'text', required: false },
        { name: 'permite_desconto', type: 'bool' },
        { name: 'desconto_maximo_percentual', type: 'number', required: false },

        // Estoque
        { name: 'controla_estoque', type: 'bool' },
        { name: 'estoque_minimo', type: 'number', required: false },
        { name: 'estoque_maximo', type: 'number', required: false },
        { name: 'localizacao', type: 'text', required: false, max: 60 },
        { name: 'controla_lote_validade', type: 'bool' },
        { name: 'dias_validade', type: 'number', required: false },
        { name: 'vende_fracionado', type: 'bool' },
        { name: 'vende_no_pdv', type: 'bool' },
        { name: 'peso_liquido_kg', type: 'number', required: false },
        { name: 'peso_bruto_kg', type: 'number', required: false },
        { name: 'altura_cm', type: 'number', required: false },
        { name: 'largura_cm', type: 'number', required: false },
        { name: 'comprimento_cm', type: 'number', required: false },

        // Campos fiscais
        {
          name: 'perfil_tributario_id',
          type: 'relation',
          required: false,
          collectionId: perfisTribColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'ncm', type: 'text', required: false, max: 8 },
        { name: 'ex_tipi', type: 'text', required: false, max: 3 },
        { name: 'cest', type: 'text', required: false, max: 7 },
        { name: 'origem', type: 'text', required: false, max: 2 },
        { name: 'tipo_item_sped', type: 'text', required: false, max: 2 },
        { name: 'codigo_genero', type: 'text', required: false, max: 2 },
        { name: 'codigo_servico_lc116', type: 'text', required: false, max: 10 },
        { name: 'indicador_escala_relevante', type: 'text', required: false, max: 1 },
        { name: 'cnpj_fabricante', type: 'text', required: false, max: 14 },
        { name: 'c_benef', type: 'text', required: false, max: 10 },
        { name: 'codigo_anp', type: 'text', required: false, max: 10 },
        { name: 'descricao_anp', type: 'text', required: false, max: 100 },

        // CFOPs
        { name: 'cfop_venda_interna', type: 'text', required: false, max: 4 },
        { name: 'cfop_venda_interestadual', type: 'text', required: false, max: 4 },
        { name: 'cfop_compra_interna', type: 'text', required: false, max: 4 },
        { name: 'cfop_compra_interestadual', type: 'text', required: false, max: 4 },

        // ICMS
        { name: 'cst_icms', type: 'text', required: false, max: 4 },
        { name: 'csosn', type: 'text', required: false, max: 4 },
        { name: 'mod_bc_icms', type: 'text', required: false, max: 2 },
        { name: 'aliquota_icms', type: 'number', required: false },
        { name: 'reducao_bc_icms_percentual', type: 'number', required: false },
        { name: 'aliquota_fcp', type: 'number', required: false },
        { name: 'mod_bc_icms_st', type: 'text', required: false, max: 2 },
        { name: 'mva_percentual', type: 'number', required: false },
        { name: 'reducao_bc_icms_st_percentual', type: 'number', required: false },
        { name: 'aliquota_icms_st', type: 'number', required: false },
        { name: 'aliquota_fcp_st', type: 'number', required: false },
        { name: 'percentual_diferimento', type: 'number', required: false },
        { name: 'motivo_desoneracao', type: 'text', required: false, max: 2 },
        { name: 'aliquota_icms_interestadual', type: 'number', required: false },

        // IPI
        { name: 'cst_ipi_saida', type: 'text', required: false, max: 2 },
        { name: 'cst_ipi_entrada', type: 'text', required: false, max: 2 },
        { name: 'codigo_enquadramento_ipi', type: 'text', required: false, max: 3 },
        {
          name: 'tipo_calculo_ipi',
          type: 'select',
          required: false,
          values: ['Percentual', 'Valor por unidade'],
          maxSelect: 1,
        },
        { name: 'aliquota_ipi', type: 'number', required: false },
        { name: 'valor_ipi_unidade', type: 'number', required: false },

        // PIS / COFINS
        { name: 'cst_pis_saida', type: 'text', required: false, max: 2 },
        { name: 'cst_pis_entrada', type: 'text', required: false, max: 2 },
        { name: 'aliquota_pis', type: 'number', required: false },
        { name: 'cst_cofins_saida', type: 'text', required: false, max: 2 },
        { name: 'cst_cofins_entrada', type: 'text', required: false, max: 2 },
        { name: 'aliquota_cofins', type: 'number', required: false },
        {
          name: 'tipo_calculo_pis_cofins',
          type: 'select',
          required: false,
          values: ['Percentual', 'Valor por unidade'],
          maxSelect: 1,
        },
        { name: 'valor_pis_unidade', type: 'number', required: false },
        { name: 'valor_cofins_unidade', type: 'number', required: false },
        { name: 'natureza_receita_pis_cofins', type: 'text', required: false, max: 3 },

        // IBS / CBS
        { name: 'cst_ibs_cbs', type: 'text', required: false, max: 4 },
        { name: 'c_class_trib', type: 'text', required: false, max: 10 },
        { name: 'aliquota_ibs_uf', type: 'number', required: false },
        { name: 'aliquota_ibs_municipio', type: 'number', required: false },
        { name: 'aliquota_cbs', type: 'number', required: false },
        { name: 'reducao_ibs_cbs_percentual', type: 'number', required: false },

        // InfAdProd e revisão fiscal
        { name: 'informacoes_adicionais_item', type: 'text', required: false },
        { name: 'fiscal_revisado', type: 'bool' },
        {
          name: 'fiscal_revisado_por',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'fiscal_revisado_em', type: 'text', required: false },

        // Metadados
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
        'CREATE UNIQUE INDEX idx_produtos_codigo ON produtos (codigo)',
        'CREATE INDEX idx_produtos_descricao ON produtos (descricao)',
        'CREATE INDEX idx_produtos_gtin ON produtos (gtin)',
        'CREATE INDEX idx_produtos_referencia ON produtos (referencia)',
        'CREATE INDEX idx_produtos_tipo ON produtos (tipo)',
        'CREATE INDEX idx_produtos_grupo ON produtos (grupo_id)',
        'CREATE INDEX idx_produtos_categoria ON produtos (categoria_id)',
        'CREATE INDEX idx_produtos_marca ON produtos (marca_id)',
        'CREATE INDEX idx_produtos_fornecedor ON produtos (fornecedor_principal_id)',
        'CREATE INDEX idx_produtos_ncm ON produtos (ncm)',
        'CREATE INDEX idx_produtos_ativo ON produtos (ativo)',
        'CREATE INDEX idx_produtos_fiscal_revisado ON produtos (fiscal_revisado)',
      ],
    })
    app.save(produtosCol)

    const produtosColId = app.findCollectionByNameOrId('produtos').id

    // 2. Coleção produtos_kit_itens
    const kitCol = new Collection({
      name: 'produtos_kit_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'produto_kit_id',
          type: 'relation',
          required: true,
          collectionId: produtosColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'produto_item_id',
          type: 'relation',
          required: true,
          collectionId: produtosColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'quantidade', type: 'number', required: true },
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
        'CREATE INDEX idx_kit_itens_kit ON produtos_kit_itens (produto_kit_id)',
        'CREATE INDEX idx_kit_itens_item ON produtos_kit_itens (produto_item_id)',
        'CREATE INDEX idx_kit_itens_ativo ON produtos_kit_itens (ativo)',
      ],
    })
    app.save(kitCol)

    // 3. Coleção produtos_fornecedores
    const prodFornCol = new Collection({
      name: 'produtos_fornecedores',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'fornecedor_id',
          type: 'relation',
          required: true,
          collectionId: fornecedoresColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'codigo_no_fornecedor', type: 'text', required: false, max: 60 },
        { name: 'descricao_no_fornecedor', type: 'text', required: false, max: 120 },
        { name: 'unidade_fornecedor', type: 'text', required: false, max: 10 },
        { name: 'fator_conversao', type: 'number', required: false },
        { name: 'ultimo_preco_compra', type: 'number', required: false },
        { name: 'data_ultima_compra', type: 'text', required: false },
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
        'CREATE INDEX idx_prod_forn_produto ON produtos_fornecedores (produto_id)',
        'CREATE INDEX idx_prod_forn_fornecedor ON produtos_fornecedores (fornecedor_id)',
        'CREATE INDEX idx_prod_forn_ativo ON produtos_fornecedores (ativo)',
      ],
    })
    app.save(prodFornCol)

    // 4. Coleção produtos_conversoes_unidade (SPED 0220)
    const convCol = new Collection({
      name: 'produtos_conversoes_unidade',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'unidade_id',
          type: 'relation',
          required: true,
          collectionId: unidadesColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'fator_conversao', type: 'number', required: true },
        { name: 'gtin_unidade', type: 'text', required: false, max: 14 },
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
        'CREATE INDEX idx_prod_conv_produto ON produtos_conversoes_unidade (produto_id)',
        'CREATE INDEX idx_prod_conv_unidade ON produtos_conversoes_unidade (unidade_id)',
        'CREATE INDEX idx_prod_conv_ativo ON produtos_conversoes_unidade (ativo)',
      ],
    })
    app.save(convCol)

    // 5. Coleção produtos_historico (SPED 0205)
    const histCol = new Collection({
      name: 'produtos_historico',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data_alteracao', type: 'text', required: true },
        { name: 'descricao_anterior', type: 'text', required: true },
        { name: 'codigo_anterior', type: 'number', required: false },
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
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
        'CREATE INDEX idx_prod_hist_produto ON produtos_historico (produto_id)',
        'CREATE INDEX idx_prod_hist_data ON produtos_historico (data_alteracao)',
        'CREATE INDEX idx_prod_hist_ativo ON produtos_historico (ativo)',
      ],
    })
    app.save(histCol)
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId('produtos_historico')
      app.delete(hist)
    } catch (_) {}

    try {
      const conv = app.findCollectionByNameOrId('produtos_conversoes_unidade')
      app.delete(conv)
    } catch (_) {}

    try {
      const forn = app.findCollectionByNameOrId('produtos_fornecedores')
      app.delete(forn)
    } catch (_) {}

    try {
      const kit = app.findCollectionByNameOrId('produtos_kit_itens')
      app.delete(kit)
    } catch (_) {}

    try {
      const prod = app.findCollectionByNameOrId('produtos')
      app.delete(prod)
    } catch (_) {}
  },
)
