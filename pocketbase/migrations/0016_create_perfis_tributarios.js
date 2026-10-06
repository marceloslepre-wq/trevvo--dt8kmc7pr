migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const cfopColId = app.findCollectionByNameOrId('cfop').id

    // 1. Coleção perfis_tributarios (cabeçalho)
    const perfisCol = new Collection({
      name: 'perfis_tributarios',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'nome', type: 'text', required: true },
        { name: 'descricao', type: 'text', required: false },
        {
          name: 'regime',
          type: 'select',
          required: true,
          values: ['Simples Nacional', 'Regime Normal'],
          maxSelect: 1,
        },
        { name: 'origem_padrao', type: 'text', required: false },
        { name: 'tipo_item_sped_padrao', type: 'text', required: false },
        { name: 'c_benef', type: 'text', required: false, max: 10 },
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
        'CREATE UNIQUE INDEX idx_perfis_trib_nome ON perfis_tributarios (nome)',
        'CREATE INDEX idx_perfis_trib_regime ON perfis_tributarios (regime)',
        'CREATE INDEX idx_perfis_trib_ativo ON perfis_tributarios (ativo)',
      ],
    })
    app.save(perfisCol)

    const perfisColId = app.findCollectionByNameOrId('perfis_tributarios').id

    // 2. Coleção perfis_tributarios_regras (linhas por cenário)
    const regrasCol = new Collection({
      name: 'perfis_tributarios_regras',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        {
          name: 'perfil_id',
          type: 'relation',
          required: true,
          collectionId: perfisColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'cenario',
          type: 'select',
          required: true,
          values: [
            'VENDA_INTERNA_CONTRIBUINTE',
            'VENDA_INTERNA_CONSUMIDOR',
            'VENDA_INTERESTADUAL_CONTRIBUINTE',
            'VENDA_INTERESTADUAL_CONSUMIDOR',
            'DEVOLUCAO_COMPRA',
            'TRANSFERENCIA',
            'COMPRA_INTERNA',
            'COMPRA_INTERESTADUAL',
          ],
          maxSelect: 1,
        },
        {
          name: 'cfop',
          type: 'relation',
          required: false,
          collectionId: cfopColId,
          cascadeDelete: false,
          maxSelect: 1,
        },

        // ICMS
        { name: 'cst_icms', type: 'text', required: false },
        { name: 'csosn', type: 'text', required: false },
        { name: 'mod_bc_icms', type: 'text', required: false },
        { name: 'aliquota_icms', type: 'number', required: false },
        { name: 'reducao_bc_icms_percentual', type: 'number', required: false },
        { name: 'aliquota_fcp', type: 'number', required: false },

        // ICMS ST
        { name: 'mod_bc_icms_st', type: 'text', required: false },
        { name: 'mva_percentual', type: 'number', required: false },
        { name: 'reducao_bc_icms_st_percentual', type: 'number', required: false },
        { name: 'aliquota_icms_st', type: 'number', required: false },
        { name: 'aliquota_fcp_st', type: 'number', required: false },

        // ICMS diferimento e desonerado
        { name: 'percentual_diferimento', type: 'number', required: false },
        { name: 'motivo_desoneracao', type: 'text', required: false },

        // IPI
        { name: 'cst_ipi', type: 'text', required: false },
        { name: 'codigo_enquadramento_ipi', type: 'text', required: false, max: 3 },
        { name: 'aliquota_ipi', type: 'number', required: false },

        // PIS
        { name: 'cst_pis', type: 'text', required: false },
        { name: 'aliquota_pis', type: 'number', required: false },

        // COFINS
        { name: 'cst_cofins', type: 'text', required: false },
        { name: 'aliquota_cofins', type: 'number', required: false },

        // Natureza da receita PIS/COFINS
        { name: 'natureza_receita_pis_cofins', type: 'text', required: false, max: 3 },

        // IBS/CBS (Reforma Tributária)
        { name: 'cst_ibs_cbs', type: 'text', required: false },
        { name: 'c_class_trib', type: 'text', required: false },
        { name: 'aliquota_ibs_uf', type: 'number', required: false },
        { name: 'aliquota_ibs_municipio', type: 'number', required: false },
        { name: 'aliquota_cbs', type: 'number', required: false },
        { name: 'reducao_ibs_cbs_percentual', type: 'number', required: false },

        // Observação fiscal
        { name: 'observacao_fiscal', type: 'text', required: false },

        // Auditoria e metadados
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
        'CREATE UNIQUE INDEX idx_regras_perfil_cenario ON perfis_tributarios_regras (perfil_id, cenario)',
        'CREATE INDEX idx_regras_perfil ON perfis_tributarios_regras (perfil_id)',
        'CREATE INDEX idx_regras_cenario ON perfis_tributarios_regras (cenario)',
        'CREATE INDEX idx_regras_ativo ON perfis_tributarios_regras (ativo)',
      ],
    })
    app.save(regrasCol)
  },
  (app) => {
    try {
      const colRegras = app.findCollectionByNameOrId('perfis_tributarios_regras')
      app.delete(colRegras)
    } catch (_) {}

    try {
      const colPerfis = app.findCollectionByNameOrId('perfis_tributarios')
      app.delete(colPerfis)
    } catch (_) {}
  },
)
