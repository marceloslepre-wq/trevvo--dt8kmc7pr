migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const perfisColId = app.findCollectionByNameOrId('perfis_tributarios').id
    const gruposColId = app.findCollectionByNameOrId('grupos').id
    const categoriasColId = app.findCollectionByNameOrId('categorias').id
    const usersColId = '_pb_users_auth_'

    // 1. TABELA config_fiscal_empresa (uma configuração por empresa)
    if (!app.hasTable('config_fiscal_empresa')) {
      const col = new Collection({
        name: 'config_fiscal_empresa',
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
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'aliquota_icms_interna_padrao', type: 'number', required: false },
          { name: 'aliquota_fcp_padrao', type: 'number', required: false },
          {
            name: 'csosn_padrao_tributado',
            type: 'select',
            required: false,
            values: ['101', '102'],
            maxSelect: 1,
          },
          {
            name: 'grupo_padrao_id',
            type: 'relation',
            required: false,
            collectionId: gruposColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'categoria_padrao_id',
            type: 'relation',
            required: false,
            collectionId: categoriasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'margem_padrao_percentual', type: 'number', required: false },
          {
            name: 'criar_produtos_automaticamente',
            type: 'select',
            required: true,
            values: ['Perguntar', 'Sempre', 'Nunca'],
            maxSelect: 1,
          },
          {
            name: 'aplicar_sugestao_fiscal_em_produtos_existentes_vazios',
            type: 'bool',
            required: false,
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
          'CREATE UNIQUE INDEX idx_config_fiscal_empresa_uid ON config_fiscal_empresa (empresa_id)',
          'CREATE INDEX idx_config_fiscal_empresa_ativo ON config_fiscal_empresa (ativo)',
        ],
      })
      app.save(col)
    }

    // 2. TABELA regras_fiscais_ncm
    if (!app.hasTable('regras_fiscais_ncm')) {
      const col = new Collection({
        name: 'regras_fiscais_ncm',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'ncm_prefixo', type: 'text', required: true },
          { name: 'cest', type: 'text', required: false },
          { name: 'uf', type: 'text', required: false },
          {
            name: 'regime_empresa',
            type: 'select',
            required: true,
            values: ['Simples Nacional', 'Regime Normal', 'Todos'],
            maxSelect: 1,
          },
          {
            name: 'perfil_tributario_id',
            type: 'relation',
            required: true,
            collectionId: perfisColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'sujeito_st', type: 'bool', required: false },
          { name: 'monofasico_pis_cofins', type: 'bool', required: false },
          { name: 'natureza_receita_pis_cofins', type: 'text', required: false },
          { name: 'observacao', type: 'text', required: false },
          { name: 'prioridade', type: 'number', required: false, onlyInt: true },
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
          'CREATE INDEX idx_regras_fiscais_ncm_prefixo ON regras_fiscais_ncm (ncm_prefixo)',
          'CREATE INDEX idx_regras_fiscais_ncm_uf ON regras_fiscais_ncm (uf)',
          'CREATE INDEX idx_regras_fiscais_ncm_regime ON regras_fiscais_ncm (regime_empresa)',
          'CREATE INDEX idx_regras_fiscais_ncm_prioridade ON regras_fiscais_ncm (prioridade)',
          'CREATE INDEX idx_regras_fiscais_ncm_ativo ON regras_fiscais_ncm (ativo)',
        ],
      })
      app.save(col)
    }

    // 3. TABELA icms_aliquotas_uf
    if (!app.hasTable('icms_aliquotas_uf')) {
      const col = new Collection({
        name: 'icms_aliquotas_uf',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'uf', type: 'text', required: true },
          { name: 'aliquota_interna', type: 'number', required: true },
          { name: 'aliquota_fcp', type: 'number', required: false },
          { name: 'vigencia_inicio', type: 'text', required: false },
          { name: 'observacao', type: 'text', required: false },
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
          'CREATE UNIQUE INDEX idx_icms_aliq_uf_unique ON icms_aliquotas_uf (uf)',
          'CREATE INDEX idx_icms_aliq_uf_ativo ON icms_aliquotas_uf (ativo)',
        ],
      })
      app.save(col)
    }

    // 4. TABELA icms_interestadual
    if (!app.hasTable('icms_interestadual')) {
      const col = new Collection({
        name: 'icms_interestadual',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'uf_origem', type: 'text', required: true },
          { name: 'uf_destino', type: 'text', required: true },
          { name: 'aliquota', type: 'number', required: true },
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
          'CREATE UNIQUE INDEX idx_icms_inter_par ON icms_interestadual (uf_origem, uf_destino)',
          'CREATE INDEX idx_icms_inter_origem ON icms_interestadual (uf_origem)',
          'CREATE INDEX idx_icms_inter_destino ON icms_interestadual (uf_destino)',
          'CREATE INDEX idx_icms_inter_ativo ON icms_interestadual (ativo)',
        ],
      })
      app.save(col)
    }

    // 5. CARGA INICIAL (SEED) icms_interestadual - Resolução do Senado 22/1989
    // 27 UFs brasileiras
    const todasUfs = [
      'AC',
      'AL',
      'AM',
      'AP',
      'BA',
      'CE',
      'DF',
      'ES',
      'GO',
      'MA',
      'MG',
      'MS',
      'MT',
      'PA',
      'PB',
      'PE',
      'PI',
      'PR',
      'RJ',
      'RN',
      'RO',
      'RR',
      'RS',
      'SC',
      'SE',
      'SP',
      'TO',
    ]

    const sulSudesteSemEs = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
    const norteNordesteCentroOesteMaisEs = [
      'AC',
      'AL',
      'AM',
      'AP',
      'BA',
      'CE',
      'DF',
      'ES',
      'GO',
      'MA',
      'MT',
      'MS',
      'PA',
      'PB',
      'PE',
      'PI',
      'RN',
      'RO',
      'RR',
      'SE',
      'TO',
    ]

    const icmsInterCol = app.findCollectionByNameOrId('icms_interestadual')

    for (let i = 0; i < todasUfs.length; i++) {
      const orig = todasUfs[i]
      for (let j = 0; j < todasUfs.length; j++) {
        const dest = todasUfs[j]
        if (orig === dest) continue

        let aliq = 12
        if (
          sulSudesteSemEs.indexOf(orig) !== -1 &&
          norteNordesteCentroOesteMaisEs.indexOf(dest) !== -1
        ) {
          aliq = 7
        }

        try {
          const recExistente = app.findRecordsByFilter(
            'icms_interestadual',
            `uf_origem = '${orig}' && uf_destino = '${dest}'`,
            '',
            1,
            0,
          )
          if (!recExistente || recExistente.length === 0) {
            const r = new Record(icmsInterCol)
            r.set('uf_origem', orig)
            r.set('uf_destino', dest)
            r.set('aliquota', aliq)
            r.set('ativo', true)
            app.save(r)
          }
        } catch (_) {
          // ignora se falhar checagem
        }
      }
    }
  },
  (app) => {
    try {
      const c1 = app.findCollectionByNameOrId('icms_interestadual')
      app.delete(c1)
    } catch (_) {}
    try {
      const c2 = app.findCollectionByNameOrId('icms_aliquotas_uf')
      app.delete(c2)
    } catch (_) {}
    try {
      const c3 = app.findCollectionByNameOrId('regras_fiscais_ncm')
      app.delete(c3)
    } catch (_) {}
    try {
      const c4 = app.findCollectionByNameOrId('config_fiscal_empresa')
      app.delete(c4)
    } catch (_) {}
  },
)
