/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const planoContasColId = app.findCollectionByNameOrId('plano_contas').id
    const centrosCustoColId = app.findCollectionByNameOrId('centros_custo').id
    const formasPagamentoColId = app.findCollectionByNameOrId('formas_pagamento').id
    const usersColId = '_pb_users_auth_'

    // =========================================================================
    // 1. TABELA contas_receber
    // =========================================================================
    if (!app.hasTable('contas_receber')) {
      const contasReceber = new Collection({
        name: 'contas_receber',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null, // Exclusão lógica obrigatória (ativo = false)
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
            name: 'cliente_id',
            type: 'relation',
            required: true,
            collectionId: clientesColId,
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
            name: 'valor_recebido',
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
            values: ['Em aberto', 'Recebido parcial', 'Recebido', 'Cancelado'],
            maxSelect: 1,
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            values: ['Manual', 'Venda', 'Recorrência', 'Outro'],
            maxSelect: 1,
          },
          {
            name: 'origem_id',
            type: 'text',
            required: false,
          },
          {
            name: 'venda_parcela_id',
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
            name: 'data_recebimento',
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
          'CREATE INDEX idx_contas_receber_empresa ON contas_receber (empresa_id)',
          'CREATE INDEX idx_contas_receber_cliente ON contas_receber (cliente_id)',
          'CREATE INDEX idx_contas_receber_venc ON contas_receber (data_vencimento)',
          'CREATE INDEX idx_contas_receber_status ON contas_receber (status)',
          'CREATE INDEX idx_contas_receber_origem ON contas_receber (origem, origem_id)',
          'CREATE INDEX idx_contas_receber_recorrencia ON contas_receber (recorrencia_id)',
          'CREATE INDEX idx_contas_receber_doc ON contas_receber (numero_documento)',
          'CREATE INDEX idx_contas_receber_ativo ON contas_receber (ativo)',
        ],
      })
      app.save(contasReceber)
    }

    const contasReceberColId = app.findCollectionByNameOrId('contas_receber').id

    // =========================================================================
    // 2. GENERALIZAR pagamentos_baixas para recebimentos
    // =========================================================================
    try {
      const pagBaixasCol = app.findCollectionByNameOrId('pagamentos_baixas')
      if (pagBaixasCol) {
        const cpField = pagBaixasCol.fields.getByName('conta_pagar_id')
        if (cpField) {
          cpField.required = false
        }

        if (!pagBaixasCol.fields.getByName('conta_receber_id')) {
          pagBaixasCol.fields.add(
            new RelationField({
              name: 'conta_receber_id',
              collectionId: contasReceberColId,
              cascadeDelete: false,
              required: false,
              maxSelect: 1,
            }),
          )
        }

        if (!pagBaixasCol.fields.getByName('tipo_operacao')) {
          pagBaixasCol.fields.add(
            new SelectField({
              name: 'tipo_operacao',
              values: ['Pagar', 'Receber'],
              required: false,
              maxSelect: 1,
            }),
          )
        }

        let hasIdxCr = false
        for (let i = 0; i < pagBaixasCol.indexes.length; i++) {
          if (pagBaixasCol.indexes[i].indexOf('conta_receber_id') !== -1) {
            hasIdxCr = true
            break
          }
        }
        if (!hasIdxCr) {
          pagBaixasCol.indexes.push(
            'CREATE INDEX idx_pag_baixas_receber ON pagamentos_baixas (conta_receber_id)',
          )
        }

        app.save(pagBaixasCol)
      }
    } catch (errBaixas) {
      console.error('Aviso ao atualizar pagamentos_baixas:', errBaixas)
    }

    // =========================================================================
    // 3. CAMPO dias_tolerancia_bloqueio em config_financeira_empresa
    // =========================================================================
    try {
      const configFinCol = app.findCollectionByNameOrId('config_financeira_empresa')
      if (configFinCol) {
        if (!configFinCol.fields.getByName('dias_tolerancia_bloqueio')) {
          configFinCol.fields.add(
            new NumberField({
              name: 'dias_tolerancia_bloqueio',
              required: false,
            }),
          )
          app.save(configFinCol)
        }
      }
    } catch (errCfg) {
      console.error('Aviso ao atualizar config_financeira_empresa:', errCfg)
    }

    // Atualizar configs existentes via SQL direto
    try {
      app
        .db()
        .newQuery(
          'UPDATE config_financeira_empresa SET dias_tolerancia_bloqueio = 5 WHERE dias_tolerancia_bloqueio IS NULL',
        )
        .execute()
    } catch (_) {}

    // =========================================================================
    // 4. PERMISSÕES financeiro_receber
    // =========================================================================
    try {
      // Perfil financeiro u2h6b7wff0xv94z (Financeiro), 111omvszd6rfvl7 (Administrador), x2gp9hf9c20j9gd (Gerente)
      // Ajusta pode_ver/criar/editar/excluir para Financeiro, Gerente e Admin
      app
        .db()
        .newQuery(`
        UPDATE permissoes 
        SET pode_ver = true, pode_criar = true, pode_editar = true, pode_excluir = true, ativo = true
        WHERE modulo = 'financeiro_receber' 
          AND perfil_id IN (
            SELECT id FROM perfis_acesso WHERE administrador = true OR nome IN ('Gerente', 'Financeiro')
          )
      `)
        .execute()

      app
        .db()
        .newQuery(`
        UPDATE permissoes 
        SET pode_ver = false, pode_criar = false, pode_editar = false, pode_excluir = false, ativo = true
        WHERE modulo = 'financeiro_receber' 
          AND perfil_id IN (
            SELECT id FROM perfis_acesso WHERE administrador = false AND nome NOT IN ('Gerente', 'Financeiro')
          )
      `)
        .execute()
    } catch (errPerm) {
      console.error('Aviso ao atualizar permissoes financeiro_receber:', errPerm)
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('contas_receber')
      app.delete(c)
    } catch (_) {}
  },
)
