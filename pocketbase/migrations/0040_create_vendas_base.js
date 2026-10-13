migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const produtosColId = app.findCollectionByNameOrId('produtos').id
    const formasPagamentoColId = app.findCollectionByNameOrId('formas_pagamento').id
    const contasFinanceirasColId = app.findCollectionByNameOrId('contas_financeiras').id
    const condicoesPagamentoColId = app.findCollectionByNameOrId('condicoes_pagamento').id
    const pdvTerminaisColId = app.findCollectionByNameOrId('pdv_terminais').id
    const lotesColId = app.findCollectionByNameOrId('lotes').id
    const perfisTributariosColId = app.findCollectionByNameOrId('perfis_tributarios').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id

    // =========================================================================
    // 1. TABELA vendas
    // =========================================================================
    if (!app.hasTable('vendas')) {
      const vendasCol = new Collection({
        name: 'vendas',
        type: 'base',
        // Leitura para autenticados
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Criação liberada para autenticados (ou pré-venda/orçamento/pedido)
        createRule: "@request.auth.id != ''",
        // Edição e exclusão bloqueadas se Finalizada ou Cancelada (só leitura pelo navegador)
        updateRule: "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada'",
        deleteRule: "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada'",
        fields: [
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'numero', type: 'number', required: true, onlyInt: true },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Orçamento', 'Pedido', 'PDV'],
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: [
              'Orçamento',
              'Pedido em aberto',
              'Finalizada',
              'Cancelada',
              'Orçamento expirado',
            ],
            maxSelect: 1,
          },
          {
            name: 'cliente_id',
            type: 'relation',
            required: true,
            collectionId: clientesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'cpf_cnpj_consumidor', type: 'text', required: false },
          {
            name: 'vendedor_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'operador_id',
            type: 'relation',
            required: false,
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'pdv_terminal_id',
            type: 'relation',
            required: false,
            collectionId: pdvTerminaisColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'caixa_sessao_id', type: 'text', required: false },
          { name: 'data_emissao', type: 'text', required: true },
          { name: 'data_validade', type: 'text', required: false },
          { name: 'data_finalizacao', type: 'text', required: false },
          { name: 'valor_produtos', type: 'number', required: true },
          { name: 'valor_desconto_itens', type: 'number', required: false },
          { name: 'valor_desconto_total', type: 'number', required: false },
          { name: 'valor_acrescimo', type: 'number', required: false },
          { name: 'valor_frete', type: 'number', required: false },
          { name: 'valor_total', type: 'number', required: true },
          { name: 'custo_total', type: 'number', required: false },
          {
            name: 'condicao_pagamento_id',
            type: 'relation',
            required: false,
            collectionId: condicoesPagamentoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'observacao', type: 'text', required: false },
          { name: 'observacao_cliente', type: 'text', required: false },
          { name: 'venda_origem_id', type: 'text', required: false },
          {
            name: 'documento_fiscal_status',
            type: 'select',
            required: false,
            values: ['Não emitido', 'Autorizada', 'Cancelada', 'Rejeitada'],
            maxSelect: 1,
          },
          { name: 'documento_fiscal_id', type: 'text', required: false },
          { name: 'motivo_cancelamento', type: 'text', required: false },
          { name: 'data_cancelamento', type: 'text', required: false },
          {
            name: 'usuario_cancelamento_id',
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
          'CREATE INDEX idx_vendas_empresa_num ON vendas (empresa_id, numero)',
          'CREATE INDEX idx_vendas_cliente ON vendas (cliente_id)',
          'CREATE INDEX idx_vendas_tipo ON vendas (tipo)',
          'CREATE INDEX idx_vendas_status ON vendas (status)',
          'CREATE INDEX idx_vendas_data_emissao ON vendas (data_emissao)',
          'CREATE INDEX idx_vendas_vendedor ON vendas (vendedor_id)',
          'CREATE INDEX idx_vendas_operador ON vendas (operador_id)',
          'CREATE INDEX idx_vendas_terminal ON vendas (pdv_terminal_id)',
          'CREATE INDEX idx_vendas_ativo ON vendas (ativo)',
        ],
      })
      app.save(vendasCol)
    }

    const vendasColId = app.findCollectionByNameOrId('vendas').id

    // =========================================================================
    // 2. TABELA vendas_itens
    // =========================================================================
    if (!app.hasTable('vendas_itens')) {
      const itensCol = new Collection({
        name: 'vendas_itens',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Criação/edição/exclusão pelo navegador apenas enquanto a venda pai NÃO estiver Finalizada nem Cancelada
        createRule:
          "@request.auth.id != '' && @collection.vendas.id = venda_id && @collection.vendas.status != 'Finalizada' && @collection.vendas.status != 'Cancelada'",
        updateRule:
          "@request.auth.id != '' && @collection.vendas.id = venda_id && @collection.vendas.status != 'Finalizada' && @collection.vendas.status != 'Cancelada'",
        deleteRule:
          "@request.auth.id != '' && @collection.vendas.id = venda_id && @collection.vendas.status != 'Finalizada' && @collection.vendas.status != 'Cancelada'",
        fields: [
          {
            name: 'venda_id',
            type: 'relation',
            required: true,
            collectionId: vendasColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'item', type: 'number', required: true, onlyInt: true },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            collectionId: produtosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'descricao', type: 'text', required: true },
          { name: 'unidade', type: 'text', required: true },
          { name: 'quantidade', type: 'number', required: true },
          { name: 'preco_unitario', type: 'number', required: true },
          { name: 'preco_tabela', type: 'number', required: false },
          { name: 'desconto_percentual', type: 'number', required: false },
          { name: 'desconto_valor', type: 'number', required: false },
          { name: 'acrescimo_valor', type: 'number', required: false },
          { name: 'valor_total', type: 'number', required: true },
          { name: 'custo_unitario', type: 'number', required: false },
          {
            name: 'lote_id',
            type: 'relation',
            required: false,
            collectionId: lotesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Dados fiscais copiados na venda para Etapa 6
          { name: 'ncm', type: 'text', required: false },
          { name: 'cest', type: 'text', required: false },
          { name: 'cfop', type: 'text', required: false },
          { name: 'origem', type: 'text', required: false },
          { name: 'cst_icms', type: 'text', required: false },
          { name: 'csosn', type: 'text', required: false },
          { name: 'aliquota_icms', type: 'number', required: false },
          { name: 'cst_pis', type: 'text', required: false },
          { name: 'cst_cofins', type: 'text', required: false },
          {
            name: 'perfil_tributario_id',
            type: 'relation',
            required: false,
            collectionId: perfisTributariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'quantidade_devolvida', type: 'number', required: false },
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
          'CREATE INDEX idx_vendas_itens_venda ON vendas_itens (venda_id)',
          'CREATE INDEX idx_vendas_itens_produto ON vendas_itens (produto_id)',
          'CREATE INDEX idx_vendas_itens_lote ON vendas_itens (lote_id)',
          'CREATE INDEX idx_vendas_itens_ativo ON vendas_itens (ativo)',
        ],
      })
      app.save(itensCol)
    }

    // =========================================================================
    // 3. TABELA vendas_pagamentos
    // =========================================================================
    if (!app.hasTable('vendas_pagamentos')) {
      const pagamentosCol = new Collection({
        name: 'vendas_pagamentos',
        type: 'base',
        // Leitura para autenticados
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Gravação/edição/exclusão pelo navegador FECHADA (null) — padrão migrations 0036/0037
        // Somente o serviço central / hooks gravam pagamentos
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'venda_id',
            type: 'relation',
            required: true,
            collectionId: vendasColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'forma_pagamento_id',
            type: 'relation',
            required: true,
            collectionId: formasPagamentoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'valor', type: 'number', required: true },
          { name: 'troco', type: 'number', required: false },
          { name: 'parcelas', type: 'number', required: false, onlyInt: true },
          { name: 'bandeira', type: 'text', required: false },
          { name: 'nsu', type: 'text', required: false },
          { name: 'codigo_autorizacao', type: 'text', required: false },
          { name: 'taxa_percentual', type: 'number', required: false },
          { name: 'valor_taxa', type: 'number', required: false },
          {
            name: 'conta_financeira_id',
            type: 'relation',
            required: false,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'conta_receber_ids', type: 'json', required: false },
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
          'CREATE INDEX idx_vendas_pag_venda ON vendas_pagamentos (venda_id)',
          'CREATE INDEX idx_vendas_pag_forma ON vendas_pagamentos (forma_pagamento_id)',
          'CREATE INDEX idx_vendas_pag_conta ON vendas_pagamentos (conta_financeira_id)',
          'CREATE INDEX idx_vendas_pag_ativo ON vendas_pagamentos (ativo)',
        ],
      })
      app.save(pagamentosCol)
    }

    // =========================================================================
    // 4. Adicionar campo plano_desconto_id em pagamentos_baixas (opcional)
    // =========================================================================
    try {
      const baixasCol = app.findCollectionByNameOrId('pagamentos_baixas')
      const planoContasCol = app.findCollectionByNameOrId('plano_contas')
      if (baixasCol && !baixasCol.fields.getByName('plano_desconto_id')) {
        baixasCol.fields.add(
          new RelationField({
            name: 'plano_desconto_id',
            collectionId: planoContasCol.id,
            cascadeDelete: false,
            required: false,
            maxSelect: 1,
          }),
        )
        app.save(baixasCol)
      }
    } catch (errBaixas) {
      console.warn('Aviso ao adicionar plano_desconto_id em pagamentos_baixas:', errBaixas)
    }
  },
  (app) => {
    try {
      const c3 = app.findCollectionByNameOrId('vendas_pagamentos')
      app.delete(c3)
    } catch (_) {}
    try {
      const c2 = app.findCollectionByNameOrId('vendas_itens')
      app.delete(c2)
    } catch (_) {}
    try {
      const c1 = app.findCollectionByNameOrId('vendas')
      app.delete(c1)
    } catch (_) {}
  },
)
