migrate(
  (app) => {
    const usersColId = '_pb_users_auth_'
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const planoContasColId = app.findCollectionByNameOrId('plano_contas').id
    const contasFinanceirasColId = app.findCollectionByNameOrId('contas_financeiras').id
    const formasPagamentoCol = app.findCollectionByNameOrId('formas_pagamento')

    // 1. Alterar formas_pagamento: adicionar operadora_cliente_id e parcelado_pela_operadora
    if (!formasPagamentoCol.fields.getByName('operadora_cliente_id')) {
      formasPagamentoCol.fields.add(
        new RelationField({
          name: 'operadora_cliente_id',
          collectionId: clientesColId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!formasPagamentoCol.fields.getByName('parcelado_pela_operadora')) {
      formasPagamentoCol.fields.add(
        new BoolField({
          name: 'parcelado_pela_operadora',
          required: false,
        }),
      )
    }

    app.save(formasPagamentoCol)

    // 2. Criar coleção formas_pagamento_taxas
    if (!app.hasTable('formas_pagamento_taxas')) {
      const taxasCol = new Collection({
        name: 'formas_pagamento_taxas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'forma_pagamento_id',
            type: 'relation',
            required: true,
            collectionId: formasPagamentoCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'parcelas_de', type: 'number', required: true, onlyInt: true },
          { name: 'parcelas_ate', type: 'number', required: true, onlyInt: true },
          { name: 'taxa_percentual', type: 'number', required: true },
          { name: 'dias_para_recebimento', type: 'number', required: false, onlyInt: true },
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
          'CREATE INDEX idx_formas_taxas_forma ON formas_pagamento_taxas (forma_pagamento_id)',
          'CREATE INDEX idx_formas_taxas_ativo ON formas_pagamento_taxas (ativo)',
        ],
      })
      app.save(taxasCol)
    }

    // 3. Criar coleção config_vendas_empresa (empresa_id único)
    if (!app.hasTable('config_vendas_empresa')) {
      const configVendasCol = new Collection({
        name: 'config_vendas_empresa',
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
          {
            name: 'cliente_padrao_id',
            type: 'relation',
            required: false,
            collectionId: clientesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'permite_vender_sem_estoque', type: 'bool', required: false },
          { name: 'exige_cliente_identificado_acima_de', type: 'number', required: false },
          { name: 'bloquear_venda_prazo_cliente_bloqueado', type: 'bool', required: false },
          { name: 'validade_orcamento_dias', type: 'number', required: false, onlyInt: true },
          { name: 'dias_para_troca', type: 'number', required: false, onlyInt: true },
          { name: 'mensagem_rodape_comprovante', type: 'text', required: false },
          {
            name: 'plano_vendas_id',
            type: 'relation',
            required: false,
            collectionId: planoContasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_taxas_cartao_id',
            type: 'relation',
            required: false,
            collectionId: planoContasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_quebra_caixa_id',
            type: 'relation',
            required: false,
            collectionId: planoContasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_sobra_caixa_id',
            type: 'relation',
            required: false,
            collectionId: planoContasColId,
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
          'CREATE UNIQUE INDEX idx_config_vendas_empresa_uid ON config_vendas_empresa (empresa_id)',
          'CREATE INDEX idx_config_vendas_empresa_ativo ON config_vendas_empresa (ativo)',
        ],
      })
      app.save(configVendasCol)
    }

    // 4. Criar coleção pdv_terminais
    if (!app.hasTable('pdv_terminais')) {
      const terminaisCol = new Collection({
        name: 'pdv_terminais',
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
          { name: 'nome', type: 'text', required: true },
          {
            name: 'conta_financeira_id',
            type: 'relation',
            required: true,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'conta_cofre_id',
            type: 'relation',
            required: false,
            collectionId: contasFinanceirasColId,
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
          'CREATE INDEX idx_pdv_terminais_empresa ON pdv_terminais (empresa_id)',
          'CREATE INDEX idx_pdv_terminais_ativo ON pdv_terminais (ativo)',
        ],
      })
      app.save(terminaisCol)
    }
  },
  (app) => {
    try {
      const c1 = app.findCollectionByNameOrId('pdv_terminais')
      app.delete(c1)
    } catch (_) {}
    try {
      const c2 = app.findCollectionByNameOrId('config_vendas_empresa')
      app.delete(c2)
    } catch (_) {}
    try {
      const c3 = app.findCollectionByNameOrId('formas_pagamento_taxas')
      app.delete(c3)
    } catch (_) {}
    try {
      const fp = app.findCollectionByNameOrId('formas_pagamento')
      fp.fields.removeByName('operadora_cliente_id')
      fp.fields.removeByName('parcelado_pela_operadora')
      app.save(fp)
    } catch (_) {}
  },
)
