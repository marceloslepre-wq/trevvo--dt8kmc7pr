/**
 * Migration 0032: Criação das tabelas do Contas a Pagar e Movimentações Financeiras
 * - contas_pagar: títulos a pagar (fornecedor, plano, centro de custo, valores, encargos, saldo, status)
 * - pagamentos_lotes: agrupa baixas de um pagamento conjunto (ou individual) com comprovante e valor total
 * - pagamentos_baixas: histórico detalhado de baixas por título (com estorno rastreado)
 * - movimentacoes_financeiras: kardex financeiro por conta_financeira (somente o serviço central atualiza saldo_atual)
 */
migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const fornecedoresColId = app.findCollectionByNameOrId('fornecedores').id
    const planoContasColId = app.findCollectionByNameOrId('plano_contas').id
    const centrosCustoColId = app.findCollectionByNameOrId('centros_custo').id
    const contasFinanceirasColId = app.findCollectionByNameOrId('contas_financeiras').id
    const formasPagamentoColId = app.findCollectionByNameOrId('formas_pagamento').id
    const usersColId = '_pb_users_auth_'

    // =========================================================================
    // 1. TABELA pagamentos_lotes
    // =========================================================================
    if (!app.hasTable('pagamentos_lotes')) {
      const lotesCol = new Collection({
        name: 'pagamentos_lotes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
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
            name: 'data_pagamento',
            type: 'text',
            required: true,
          },
          {
            name: 'conta_financeira_id',
            type: 'relation',
            required: true,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'forma_pagamento_id',
            type: 'relation',
            required: false,
            collectionId: formasPagamentoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'valor_total',
            type: 'number',
            required: true,
          },
          {
            name: 'total_titulos',
            type: 'number',
            required: false,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_pag_lotes_empresa ON pagamentos_lotes (empresa_id)',
          'CREATE INDEX idx_pag_lotes_data ON pagamentos_lotes (data_pagamento)',
          'CREATE INDEX idx_pag_lotes_conta ON pagamentos_lotes (conta_financeira_id)',
          'CREATE INDEX idx_pag_lotes_ativo ON pagamentos_lotes (ativo)',
        ],
      })
      app.save(lotesCol)
    }

    // =========================================================================
    // 2. TABELA contas_pagar
    // =========================================================================
    if (!app.hasTable('contas_pagar')) {
      const pagarCol = new Collection({
        name: 'contas_pagar',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
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
            required: true,
            collectionId: fornecedoresColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'numero_documento',
            type: 'text',
            required: true,
          },
          {
            name: 'parcela',
            type: 'text',
            required: true,
          },
          {
            name: 'descricao',
            type: 'text',
            required: true,
          },
          {
            name: 'data_emissao',
            type: 'text',
            required: true,
          },
          {
            name: 'data_competencia',
            type: 'text',
            required: true,
          },
          {
            name: 'data_vencimento',
            type: 'text',
            required: true,
          },
          {
            name: 'plano_conta_id',
            type: 'relation',
            required: true,
            collectionId: planoContasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'centro_custo_id',
            type: 'relation',
            required: false,
            collectionId: centrosCustoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'forma_pagamento_prevista_id',
            type: 'relation',
            required: false,
            collectionId: formasPagamentoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'codigo_barras',
            type: 'text',
            required: false,
          },
          {
            name: 'valor_original',
            type: 'number',
            required: true,
          },
          {
            name: 'valor_pago',
            type: 'number',
            required: false,
          },
          {
            name: 'saldo',
            type: 'number',
            required: true,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Em aberto', 'Pago parcial', 'Pago', 'Cancelado'],
            maxSelect: 1,
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            values: ['Manual', 'NF Entrada', 'Recorrência', 'Outro'],
            maxSelect: 1,
          },
          {
            name: 'origem_id',
            type: 'text',
            required: false,
          },
          {
            name: 'nota_entrada_parcela_id',
            type: 'text',
            required: false,
          },
          {
            name: 'recorrencia_id',
            type: 'text',
            required: false,
          },
          {
            name: 'recorrencia_numero',
            type: 'number',
            required: false,
          },
          {
            name: 'recorrencia_total',
            type: 'number',
            required: false,
          },
          {
            name: 'data_pagamento',
            type: 'text',
            required: false,
          },
          {
            name: 'anexo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760, // 10MB
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'motivo_cancelamento',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_contas_pagar_empresa ON contas_pagar (empresa_id)',
          'CREATE INDEX idx_contas_pagar_fornecedor ON contas_pagar (fornecedor_id)',
          'CREATE INDEX idx_contas_pagar_venc ON contas_pagar (data_vencimento)',
          'CREATE INDEX idx_contas_pagar_status ON contas_pagar (status)',
          'CREATE INDEX idx_contas_pagar_origem ON contas_pagar (origem, origem_id)',
          'CREATE INDEX idx_contas_pagar_recorrencia ON contas_pagar (recorrencia_id)',
          'CREATE INDEX idx_contas_pagar_doc ON contas_pagar (numero_documento)',
          'CREATE INDEX idx_contas_pagar_ativo ON contas_pagar (ativo)',
        ],
      })
      app.save(pagarCol)
    }

    const contasPagarColId = app.findCollectionByNameOrId('contas_pagar').id
    const pagamentosLotesColId = app.findCollectionByNameOrId('pagamentos_lotes').id

    // =========================================================================
    // 3. TABELA pagamentos_baixas
    // =========================================================================
    if (!app.hasTable('pagamentos_baixas')) {
      const baixasCol = new Collection({
        name: 'pagamentos_baixas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null, // superuser/hook apenas
        updateRule: null,
        deleteRule: null,
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
            name: 'conta_pagar_id',
            type: 'relation',
            required: true,
            collectionId: contasPagarColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'lote_baixa_id',
            type: 'relation',
            required: false,
            collectionId: pagamentosLotesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_pagamento',
            type: 'text',
            required: true,
          },
          {
            name: 'conta_financeira_id',
            type: 'relation',
            required: true,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'forma_pagamento_id',
            type: 'relation',
            required: false,
            collectionId: formasPagamentoColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'valor_original',
            type: 'number',
            required: true,
          },
          {
            name: 'valor_pago',
            type: 'number',
            required: true,
          },
          {
            name: 'valor_multa',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_juros',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_desconto',
            type: 'number',
            required: false,
          },
          {
            name: 'valor_total_pago',
            type: 'number',
            required: true,
          },
          {
            name: 'estornado',
            type: 'bool',
            required: false,
          },
          {
            name: 'data_estorno',
            type: 'text',
            required: false,
          },
          {
            name: 'motivo_estorno',
            type: 'text',
            required: false,
          },
          {
            name: 'usuario_estorno_id',
            type: 'relation',
            required: false,
            collectionId: usersColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_pag_baixas_empresa ON pagamentos_baixas (empresa_id)',
          'CREATE INDEX idx_pag_baixas_titulo ON pagamentos_baixas (conta_pagar_id)',
          'CREATE INDEX idx_pag_baixas_lote ON pagamentos_baixas (lote_baixa_id)',
          'CREATE INDEX idx_pag_baixas_data ON pagamentos_baixas (data_pagamento)',
          'CREATE INDEX idx_pag_baixas_estornado ON pagamentos_baixas (estornado)',
          'CREATE INDEX idx_pag_baixas_ativo ON pagamentos_baixas (ativo)',
        ],
      })
      app.save(baixasCol)
    }

    // =========================================================================
    // 4. TABELA movimentacoes_financeiras (kardex financeiro por conta)
    // =========================================================================
    if (!app.hasTable('movimentacoes_financeiras')) {
      const movsFinCol = new Collection({
        name: 'movimentacoes_financeiras',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null, // superuser/hook apenas
        updateRule: null,
        deleteRule: null,
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
            name: 'conta_financeira_id',
            type: 'relation',
            required: true,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_movimento',
            type: 'text',
            required: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['Entrada', 'Saída'],
            maxSelect: 1,
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            values: [
              'SALDO_INICIAL',
              'PAGAMENTO_TITULO',
              'RECEBIMENTO_TITULO',
              'TRANSFERENCIA_ENTRADA',
              'TRANSFERENCIA_SAIDA',
              'ESTORNO_PAGAMENTO',
              'ESTORNO_RECEBIMENTO',
              'AJUSTE',
            ],
            maxSelect: 1,
          },
          {
            name: 'valor',
            type: 'number',
            required: true,
          },
          {
            name: 'saldo_anterior',
            type: 'number',
            required: false,
          },
          {
            name: 'saldo_posterior',
            type: 'number',
            required: false,
          },
          {
            name: 'documento_tipo',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_id',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_numero',
            type: 'text',
            required: false,
          },
          {
            name: 'lote_baixa_id',
            type: 'relation',
            required: false,
            collectionId: pagamentosLotesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'historico',
            type: 'text',
            required: true,
          },
          {
            name: 'estornado',
            type: 'bool',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
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
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE INDEX idx_mov_fin_empresa ON movimentacoes_financeiras (empresa_id)',
          'CREATE INDEX idx_mov_fin_conta_data ON movimentacoes_financeiras (conta_financeira_id, data_movimento)',
          'CREATE INDEX idx_mov_fin_tipo ON movimentacoes_financeiras (tipo)',
          'CREATE INDEX idx_mov_fin_origem ON movimentacoes_financeiras (origem)',
          'CREATE INDEX idx_mov_fin_doc ON movimentacoes_financeiras (documento_tipo, documento_id)',
          'CREATE INDEX idx_mov_fin_ativo ON movimentacoes_financeiras (ativo)',
        ],
      })
      app.save(movsFinCol)
    }
  },
  (app) => {
    try {
      const c1 = app.findCollectionByNameOrId('movimentacoes_financeiras')
      app.delete(c1)
    } catch (_) {}
    try {
      const c2 = app.findCollectionByNameOrId('pagamentos_baixas')
      app.delete(c2)
    } catch (_) {}
    try {
      const c3 = app.findCollectionByNameOrId('contas_pagar')
      app.delete(c3)
    } catch (_) {}
    try {
      const c4 = app.findCollectionByNameOrId('pagamentos_lotes')
      app.delete(c4)
    } catch (_) {}
  },
)
