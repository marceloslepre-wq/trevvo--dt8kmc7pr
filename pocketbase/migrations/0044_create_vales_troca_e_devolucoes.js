migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const vendasCol = app.findCollectionByNameOrId('vendas')
    const vendasColId = vendasCol.id

    // =========================================================================
    // 1. ATUALIZAR SELECT DO CAMPO tipo NA TABELA vendas PARA INCLUIR 'Devolução'
    // =========================================================================
    const tipoField = vendasCol.fields.getByName('tipo')
    if (tipoField) {
      const valores = tipoField.values || ['Orçamento', 'Pedido', 'PDV']
      if (valores.indexOf('Devolução') === -1) {
        tipoField.values = [...valores, 'Devolução']
        app.save(vendasCol)
      }
    }

    // =========================================================================
    // 2. CRIAR CONTA ANALÍTICA 2.2.05 "Devoluções de vendas" (Deduções da receita)
    // =========================================================================
    try {
      const planoContasCol = app.findCollectionByNameOrId('plano_contas')
      let recExistente = null
      try {
        recExistente = app.findFirstRecordByData('plano_contas', 'codigo', '2.2.05')
      } catch (_) {}

      if (!recExistente) {
        let contaPaiId = ''
        try {
          const paiRec = app.findFirstRecordByData('plano_contas', 'codigo', '2.2')
          if (paiRec) contaPaiId = paiRec.id
        } catch (_) {}

        const novaConta = new Record(planoContasCol)
        novaConta.set('codigo', '2.2.05')
        novaConta.set('descricao', 'Devoluções de vendas')
        novaConta.set('tipo', 'Despesa')
        novaConta.set('natureza', 'Analítica')
        novaConta.set('grupo_dre', 'Deduções da receita')
        novaConta.set('ativo', true)
        if (contaPaiId) {
          novaConta.set('conta_pai_id', contaPaiId)
        }
        app.save(novaConta)
      }
    } catch (errPlano) {
      console.warn('Aviso ao criar conta 2.2.05 Devoluções de vendas:', errPlano)
    }

    // =========================================================================
    // 3. CRIAR FORMA DE PAGAMENTO "Vale-troca" (codigo_tpag 99) SE NÃO EXISTIR
    // =========================================================================
    try {
      const formasCol = app.findCollectionByNameOrId('formas_pagamento')
      let formaVale = null
      try {
        const achados = app.findRecordsByFilter(
          'formas_pagamento',
          `descricao = 'Vale-troca' || descricao = 'Vale troca'`,
          '',
          1,
          0,
        )
        if (achados && achados.length > 0) formaVale = achados[0]
      } catch (_) {}

      if (!formaVale) {
        const novaForma = new Record(formasCol)
        novaForma.set('codigo_tpag', '99')
        novaForma.set('descricao', 'Vale-troca')
        novaForma.set('tipo', 'Crédito loja')
        novaForma.set('taxa_percentual', 0)
        novaForma.set('dias_para_recebimento', 0)
        novaForma.set('ativo', true)
        app.save(novaForma)
      }
    } catch (errForma) {
      console.warn('Aviso ao registrar forma de pagamento Vale-troca:', errForma)
    }

    // =========================================================================
    // 4. CRIAR TABELA vales_troca
    // =========================================================================
    if (!app.hasTable('vales_troca')) {
      const valesCol = new Collection({
        name: 'vales_troca',
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
          { name: 'codigo', type: 'text', required: true },
          {
            name: 'cliente_id',
            type: 'relation',
            required: false,
            collectionId: clientesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'valor', type: 'number', required: true },
          { name: 'saldo', type: 'number', required: true },
          { name: 'validade', type: 'text', required: false },
          {
            name: 'venda_origem_id',
            type: 'relation',
            required: false,
            collectionId: vendasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Ativo', 'Usado', 'Expirado', 'Cancelado'],
            maxSelect: 1,
          },
          { name: 'observacao', type: 'text', required: false },
          { name: 'ativo', type: 'bool', required: false },
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
          'CREATE UNIQUE INDEX idx_vales_troca_empresa_codigo ON vales_troca (empresa_id, codigo)',
          'CREATE INDEX idx_vales_troca_cliente ON vales_troca (cliente_id)',
          'CREATE INDEX idx_vales_troca_status ON vales_troca (status)',
          'CREATE INDEX idx_vales_troca_venda_origem ON vales_troca (venda_origem_id)',
          'CREATE INDEX idx_vales_troca_ativo ON vales_troca (ativo)',
        ],
      })
      app.save(valesCol)
    }
  },
  (app) => {
    try {
      const valesCol = app.findCollectionByNameOrId('vales_troca')
      if (valesCol) app.delete(valesCol)
    } catch (_) {}
  },
)
