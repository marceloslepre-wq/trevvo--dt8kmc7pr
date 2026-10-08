migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const usersColId = '_pb_users_auth_'

    // =========================================================================
    // 1. ATUALIZAR MÓDULOS DE PERMISSÕES E CRIAR PERMISSÃO financeiro_bancos
    // =========================================================================
    const permissoesCol = app.findCollectionByNameOrId('permissoes')
    const moduloField = permissoesCol.fields.getByName('modulo')
    if (moduloField) {
      const modulosAtuais = moduloField.values || []
      if (modulosAtuais.indexOf('financeiro_bancos') === -1) {
        moduloField.values = [...modulosAtuais, 'financeiro_bancos']
        app.save(permissoesCol)
      }
    }

    // Configurar permissão para perfis existentes
    // Acesso total (ver/criar/editar/excluir) para Administrador, Gerente e Financeiro.
    // Nenhum acesso (tudo false) para os demais perfis.
    const perfis = app.findRecordsByFilter('perfis_acesso', '', '', 100, 0)
    for (let p = 0; p < perfis.length; p++) {
      const perfil = perfis[p]
      const nome = perfil.getString('nome')
      const isAdmin = perfil.getBool('administrador') || nome === 'Administrador'

      let podeTotal = false
      if (isAdmin || ['Administrador', 'Gerente', 'Financeiro'].indexOf(nome) !== -1) {
        podeTotal = true
      }

      let permRecord = null
      try {
        const exist = app.findRecordsByFilter(
          'permissoes',
          `perfil_id = '${perfil.id}' && modulo = 'financeiro_bancos'`,
          '',
          1,
          0,
        )
        if (exist && exist.length > 0) {
          permRecord = exist[0]
        }
      } catch (_) {}

      if (!permRecord) {
        permRecord = new Record(permissoesCol)
        permRecord.set('perfil_id', perfil.id)
        permRecord.set('modulo', 'financeiro_bancos')
      }

      permRecord.set('ativo', true)
      permRecord.set('pode_ver', podeTotal)
      permRecord.set('pode_criar', podeTotal)
      permRecord.set('pode_editar', podeTotal)
      permRecord.set('pode_excluir', podeTotal)
      app.save(permRecord)
    }

    // =========================================================================
    // 2. COLEÇÃO plano_contas (compartilhada — sem empresa_id)
    // =========================================================================
    let planoContasCol
    if (!app.hasTable('plano_contas')) {
      planoContasCol = new Collection({
        name: 'plano_contas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'codigo', type: 'text', required: true },
          { name: 'descricao', type: 'text', required: true },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Receita', 'Despesa', 'Sem resultado'],
            maxSelect: 1,
          },
          {
            name: 'natureza',
            type: 'select',
            required: true,
            values: ['Sintética', 'Analítica'],
            maxSelect: 1,
          },
          {
            name: 'grupo_dre',
            type: 'select',
            required: true,
            values: [
              'Receita bruta',
              'Deduções da receita',
              'Custo das mercadorias',
              'Despesas operacionais',
              'Resultado financeiro',
              'Outras receitas e despesas',
              'Fora da DRE',
            ],
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
          'CREATE UNIQUE INDEX idx_plano_contas_codigo ON plano_contas (codigo)',
          'CREATE INDEX idx_plano_contas_ativo ON plano_contas (ativo)',
        ],
      })
      app.save(planoContasCol)

      // Auto-referência conta_pai_id adicionada após salvar a coleção
      planoContasCol = app.findCollectionByNameOrId('plano_contas')
      planoContasCol.fields.add(
        new RelationField({
          name: 'conta_pai_id',
          required: false,
          collectionId: planoContasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      planoContasCol.addIndex('idx_plano_contas_conta_pai', false, 'conta_pai_id', '')
      app.save(planoContasCol)
    } else {
      planoContasCol = app.findCollectionByNameOrId('plano_contas')
    }

    // =========================================================================
    // 3. COLEÇÃO centros_custo (compartilhada)
    // =========================================================================
    let centrosCustoCol
    if (!app.hasTable('centros_custo')) {
      centrosCustoCol = new Collection({
        name: 'centros_custo',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'codigo', type: 'text', required: true },
          { name: 'descricao', type: 'text', required: true },
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
          'CREATE UNIQUE INDEX idx_centros_custo_codigo ON centros_custo (codigo)',
          'CREATE INDEX idx_centros_custo_ativo ON centros_custo (ativo)',
        ],
      })
      app.save(centrosCustoCol)
    } else {
      centrosCustoCol = app.findCollectionByNameOrId('centros_custo')
    }

    // =========================================================================
    // 4. COLEÇÃO contas_financeiras (POR empresa — com empresa_id)
    // =========================================================================
    let contasFinanceirasCol
    if (!app.hasTable('contas_financeiras')) {
      contasFinanceirasCol = new Collection({
        name: 'contas_financeiras',
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
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Conta corrente', 'Poupança', 'Aplicação', 'Caixa físico', 'Carteira digital'],
            maxSelect: 1,
          },
          { name: 'banco_codigo', type: 'text', required: false },
          { name: 'banco_nome', type: 'text', required: false },
          { name: 'agencia', type: 'text', required: false },
          { name: 'agencia_digito', type: 'text', required: false },
          { name: 'conta', type: 'text', required: false },
          { name: 'conta_digito', type: 'text', required: false },
          { name: 'chave_pix', type: 'text', required: false },
          { name: 'saldo_inicial', type: 'number', required: true },
          { name: 'data_saldo_inicial', type: 'text', required: true },
          { name: 'saldo_atual', type: 'number', required: false },
          { name: 'permite_saldo_negativo', type: 'bool', required: false },
          { name: 'conta_padrao_pagamentos', type: 'bool', required: false },
          { name: 'conta_padrao_recebimentos', type: 'bool', required: false },
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
          'CREATE INDEX idx_contas_fin_empresa ON contas_financeiras (empresa_id)',
          'CREATE INDEX idx_contas_fin_ativo ON contas_financeiras (ativo)',
        ],
      })
      app.save(contasFinanceirasCol)
    } else {
      contasFinanceirasCol = app.findCollectionByNameOrId('contas_financeiras')
    }

    // =========================================================================
    // 5. COLEÇÃO formas_pagamento (compartilhada)
    // =========================================================================
    let formasPagamentoCol
    if (!app.hasTable('formas_pagamento')) {
      formasPagamentoCol = new Collection({
        name: 'formas_pagamento',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'codigo_tpag', type: 'text', required: true },
          { name: 'descricao', type: 'text', required: true },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: [
              'Dinheiro',
              'Cheque',
              'Cartão de crédito',
              'Cartão de débito',
              'PIX',
              'Boleto',
              'Transferência',
              'Crédito loja',
              'Outros',
            ],
            maxSelect: 1,
          },
          { name: 'taxa_percentual', type: 'number', required: false },
          { name: 'dias_para_recebimento', type: 'number', required: false, onlyInt: true },
          {
            name: 'conta_financeira_padrao_id',
            type: 'relation',
            required: false,
            collectionId: contasFinanceirasCol.id,
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
          'CREATE INDEX idx_formas_pag_codigo_tpag ON formas_pagamento (codigo_tpag)',
          'CREATE INDEX idx_formas_pag_ativo ON formas_pagamento (ativo)',
        ],
      })
      app.save(formasPagamentoCol)
    } else {
      formasPagamentoCol = app.findCollectionByNameOrId('formas_pagamento')
    }

    // =========================================================================
    // 6. COLEÇÃO config_financeira_empresa (uma por empresa, empresa_id único)
    // =========================================================================
    if (!app.hasTable('config_financeira_empresa')) {
      const col = new Collection({
        name: 'config_financeira_empresa',
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
          { name: 'multa_atraso_percentual', type: 'number', required: false },
          { name: 'juros_mora_mensal_percentual', type: 'number', required: false },
          { name: 'dias_carencia', type: 'number', required: false, onlyInt: true },
          {
            name: 'plano_compras_revenda_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_industrializacao_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_uso_consumo_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_imobilizado_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_outras_entradas_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_vendas_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_juros_recebidos_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_juros_pagos_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_descontos_obtidos_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_descontos_concedidos_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'plano_transferencias_id',
            type: 'relation',
            required: false,
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'centro_custo_padrao_id',
            type: 'relation',
            required: false,
            collectionId: centrosCustoCol.id,
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
          'CREATE UNIQUE INDEX idx_config_fin_empresa_uid ON config_financeira_empresa (empresa_id)',
          'CREATE INDEX idx_config_fin_empresa_ativo ON config_financeira_empresa (ativo)',
        ],
      })
      app.save(col)
    }

    // =========================================================================
    // 7. CARGA INICIAL: CENTROS DE CUSTO ("Geral")
    // =========================================================================
    try {
      app.findFirstRecordByData('centros_custo', 'codigo', '1')
    } catch (_) {
      const cc = new Record(centrosCustoCol)
      cc.set('codigo', '1')
      cc.set('descricao', 'Geral')
      cc.set('ativo', true)
      app.save(cc)
    }

    // =========================================================================
    // 8. CARGA INICIAL: PLANO DE CONTAS COMPLETO
    // =========================================================================
    const planoItens = [
      // 1 RECEITAS
      {
        codigo: '1',
        descricao: 'RECEITAS',
        tipo: 'Receita',
        natureza: 'Sintética',
        pai: null,
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '1.1',
        descricao: 'Receitas operacionais',
        tipo: 'Receita',
        natureza: 'Sintética',
        pai: '1',
        grupo_dre: 'Receita bruta',
      },
      {
        codigo: '1.1.01',
        descricao: 'Vendas de mercadorias',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.1',
        grupo_dre: 'Receita bruta',
      },
      {
        codigo: '1.1.02',
        descricao: 'Prestação de serviços',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.1',
        grupo_dre: 'Receita bruta',
      },
      {
        codigo: '1.2',
        descricao: 'Receitas financeiras',
        tipo: 'Receita',
        natureza: 'Sintética',
        pai: '1',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '1.2.01',
        descricao: 'Juros e multas recebidos',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.2',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '1.2.02',
        descricao: 'Descontos obtidos',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.2',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '1.2.03',
        descricao: 'Rendimentos de aplicações',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.2',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '1.3',
        descricao: 'Outras receitas',
        tipo: 'Receita',
        natureza: 'Sintética',
        pai: '1',
        grupo_dre: 'Outras receitas e despesas',
      },
      {
        codigo: '1.3.01',
        descricao: 'Outras receitas',
        tipo: 'Receita',
        natureza: 'Analítica',
        pai: '1.3',
        grupo_dre: 'Outras receitas e despesas',
      },

      // 2 DESPESAS
      {
        codigo: '2',
        descricao: 'DESPESAS',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: null,
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '2.1',
        descricao: 'Custo das mercadorias',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Custo das mercadorias',
      },
      {
        codigo: '2.1.01',
        descricao: 'Compras de mercadorias para revenda',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.1',
        grupo_dre: 'Custo das mercadorias',
      },
      {
        codigo: '2.1.02',
        descricao: 'Fretes sobre compras',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.1',
        grupo_dre: 'Custo das mercadorias',
      },
      {
        codigo: '2.1.03',
        descricao: 'Matéria-prima e insumos',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.1',
        grupo_dre: 'Custo das mercadorias',
      },

      {
        codigo: '2.2',
        descricao: 'Impostos sobre vendas',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Deduções da receita',
      },
      {
        codigo: '2.2.01',
        descricao: 'Simples Nacional (DAS)',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.2',
        grupo_dre: 'Deduções da receita',
      },
      {
        codigo: '2.2.02',
        descricao: 'ICMS',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.2',
        grupo_dre: 'Deduções da receita',
      },
      {
        codigo: '2.2.03',
        descricao: 'PIS e COFINS',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.2',
        grupo_dre: 'Deduções da receita',
      },
      {
        codigo: '2.2.04',
        descricao: 'ICMS ST e DIFAL',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.2',
        grupo_dre: 'Deduções da receita',
      },

      {
        codigo: '2.3',
        descricao: 'Pessoal',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.3.01',
        descricao: 'Salários',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.3',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.3.02',
        descricao: 'Encargos (INSS e FGTS)',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.3',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.3.03',
        descricao: 'Pró-labore',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.3',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.3.04',
        descricao: 'Benefícios',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.3',
        grupo_dre: 'Despesas operacionais',
      },

      {
        codigo: '2.4',
        descricao: 'Administrativas',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.01',
        descricao: 'Aluguel',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.02',
        descricao: 'Energia elétrica',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.03',
        descricao: 'Água',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.04',
        descricao: 'Telefone e internet',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.05',
        descricao: 'Contabilidade',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.06',
        descricao: 'Sistemas e softwares',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.07',
        descricao: 'Material de uso e consumo',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.4.08',
        descricao: 'Manutenção',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.4',
        grupo_dre: 'Despesas operacionais',
      },

      {
        codigo: '2.5',
        descricao: 'Comerciais',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.5.01',
        descricao: 'Comissões',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.5',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.5.02',
        descricao: 'Marketing e publicidade',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.5',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.5.03',
        descricao: 'Taxas de cartão e meios de pagamento',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.5',
        grupo_dre: 'Despesas operacionais',
      },
      {
        codigo: '2.5.04',
        descricao: 'Fretes sobre vendas',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.5',
        grupo_dre: 'Despesas operacionais',
      },

      {
        codigo: '2.6',
        descricao: 'Financeiras',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '2.6.01',
        descricao: 'Juros e multas pagos',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.6',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '2.6.02',
        descricao: 'Tarifas bancárias',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.6',
        grupo_dre: 'Resultado financeiro',
      },
      {
        codigo: '2.6.03',
        descricao: 'Descontos concedidos',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.6',
        grupo_dre: 'Resultado financeiro',
      },

      {
        codigo: '2.7',
        descricao: 'Investimentos',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '2.7.01',
        descricao: 'Imobilizado',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.7',
        grupo_dre: 'Fora da DRE',
      },

      {
        codigo: '2.8',
        descricao: 'Outras despesas',
        tipo: 'Despesa',
        natureza: 'Sintética',
        pai: '2',
        grupo_dre: 'Outras receitas e despesas',
      },
      {
        codigo: '2.8.01',
        descricao: 'Outras despesas',
        tipo: 'Despesa',
        natureza: 'Analítica',
        pai: '2.8',
        grupo_dre: 'Outras receitas e despesas',
      },

      // 3 MOVIMENTAÇÕES SEM RESULTADO
      {
        codigo: '3',
        descricao: 'MOVIMENTAÇÕES SEM RESULTADO',
        tipo: 'Sem resultado',
        natureza: 'Sintética',
        pai: null,
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1',
        descricao: 'Movimentações',
        tipo: 'Sem resultado',
        natureza: 'Sintética',
        pai: '3',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1.01',
        descricao: 'Transferências entre contas',
        tipo: 'Sem resultado',
        natureza: 'Analítica',
        pai: '3.1',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1.02',
        descricao: 'Empréstimos recebidos',
        tipo: 'Sem resultado',
        natureza: 'Analítica',
        pai: '3.1',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1.03',
        descricao: 'Pagamento de empréstimos (principal)',
        tipo: 'Sem resultado',
        natureza: 'Analítica',
        pai: '3.1',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1.04',
        descricao: 'Aportes de sócios',
        tipo: 'Sem resultado',
        natureza: 'Analítica',
        pai: '3.1',
        grupo_dre: 'Fora da DRE',
      },
      {
        codigo: '3.1.05',
        descricao: 'Retiradas de sócios',
        tipo: 'Sem resultado',
        natureza: 'Analítica',
        pai: '3.1',
        grupo_dre: 'Fora da DRE',
      },
    ]

    const mapaIdsPorCodigo = {}

    // Inserção em ordem para garantir que pais já existam
    for (let i = 0; i < planoItens.length; i++) {
      const item = planoItens[i]
      let rec
      try {
        rec = app.findFirstRecordByData('plano_contas', 'codigo', item.codigo)
      } catch (_) {
        rec = new Record(planoContasCol)
        rec.set('codigo', item.codigo)
        rec.set('descricao', item.descricao)
        rec.set('tipo', item.tipo)
        rec.set('natureza', item.natureza)
        rec.set('grupo_dre', item.grupo_dre)
        rec.set('ativo', true)
        if (item.pai && mapaIdsPorCodigo[item.pai]) {
          rec.set('conta_pai_id', mapaIdsPorCodigo[item.pai])
        }
        app.save(rec)
      }
      mapaIdsPorCodigo[item.codigo] = rec.id

      // Se já existia e não tinha conta_pai_id mas deveria ter
      if (item.pai && mapaIdsPorCodigo[item.pai] && !rec.getString('conta_pai_id')) {
        rec.set('conta_pai_id', mapaIdsPorCodigo[item.pai])
        app.save(rec)
      }
    }

    // =========================================================================
    // 9. CARGA INICIAL: FORMAS DE PAGAMENTO
    // =========================================================================
    const formasIniciais = [
      { codigo_tpag: '01', descricao: 'Dinheiro', tipo: 'Dinheiro' },
      { codigo_tpag: '02', descricao: 'Cheque', tipo: 'Cheque' },
      { codigo_tpag: '03', descricao: 'Cartão de crédito', tipo: 'Cartão de crédito' },
      { codigo_tpag: '04', descricao: 'Cartão de débito', tipo: 'Cartão de débito' },
      { codigo_tpag: '05', descricao: 'Crédito loja', tipo: 'Crédito loja' },
      { codigo_tpag: '15', descricao: 'Boleto', tipo: 'Boleto' },
      { codigo_tpag: '16', descricao: 'Depósito bancário', tipo: 'Transferência' },
      { codigo_tpag: '17', descricao: 'PIX', tipo: 'PIX' },
      { codigo_tpag: '18', descricao: 'Transferência bancária', tipo: 'Transferência' },
      { codigo_tpag: '90', descricao: 'Sem pagamento', tipo: 'Outros' },
      { codigo_tpag: '99', descricao: 'Outros', tipo: 'Outros' },
    ]

    for (let f = 0; f < formasIniciais.length; f++) {
      const forma = formasIniciais[f]
      try {
        app.findFirstRecordByData('formas_pagamento', 'codigo_tpag', forma.codigo_tpag)
      } catch (_) {
        const fRec = new Record(formasPagamentoCol)
        fRec.set('codigo_tpag', forma.codigo_tpag)
        fRec.set('descricao', forma.descricao)
        fRec.set('tipo', forma.tipo)
        fRec.set('ativo', true)
        app.save(fRec)
      }
    }
  },
  (app) => {
    // Reversão segura
    try {
      const c1 = app.findCollectionByNameOrId('config_financeira_empresa')
      app.delete(c1)
    } catch (_) {}
    try {
      const c2 = app.findCollectionByNameOrId('formas_pagamento')
      app.delete(c2)
    } catch (_) {}
    try {
      const c3 = app.findCollectionByNameOrId('contas_financeiras')
      app.delete(c3)
    } catch (_) {}
    try {
      const c4 = app.findCollectionByNameOrId('centros_custo')
      app.delete(c4)
    } catch (_) {}
    try {
      const c5 = app.findCollectionByNameOrId('plano_contas')
      app.delete(c5)
    } catch (_) {}
  },
)
