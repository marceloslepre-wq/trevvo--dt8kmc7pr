/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0035: Extratos Linhas para Conciliação Bancária e Atualização de Movimentações Financeiras
 *
 * 1. Adicionar em movimentacoes_financeiras:
 *    - conciliado (bool, padrão false)
 *    - data_conciliacao (text, formato YYYY-MM-DD ou ISO)
 *    - transferencia_id (text, UUID/ID de correlação entre as duas pontas da transferência)
 *    - lancamento_avulso (bool, indica se foi lançamento avulso direto)
 *    - motivo_estorno (text)
 *    - data_estorno (text)
 *    - usuario_estorno_id (relation users)
 *
 * 2. Criar coleção extratos_linhas:
 *    - empresa_id (relation empresas, obrigatório)
 *    - conta_financeira_id (relation contas_financeiras, obrigatório)
 *    - fitid (text, ID único da transação no extrato bancário)
 *    - data (text, data da transação YYYY-MM-DD)
 *    - valor (number, positivo crédito, negativo débito)
 *    - descricao (text, histórico/memo do extrato)
 *    - situacao (select: 'Pendente', 'Conciliada', 'Ignorada')
 *    - movimentos_ids (json, array de IDs das movimentações casadas)
 *    - arquivo_importacao (text, nome do arquivo OFX ou identificador do lote)
 *    - campos padrão: ativo, created_by, updated_by, created, updated
 *    - índice único conta_financeira_id + fitid
 *    - API rules: @request.auth.id != '' (módulo financeiro_bancos)
 */
migrate(
  (app) => {
    const empresasColId = app.findCollectionByNameOrId('empresas').id
    const contasFinanceirasColId = app.findCollectionByNameOrId('contas_financeiras').id
    const usersColId = '_pb_users_auth_'

    // =========================================================================
    // 1. ATUALIZAR movimentacoes_financeiras
    // =========================================================================
    try {
      const movsFinCol = app.findCollectionByNameOrId('movimentacoes_financeiras')
      if (movsFinCol) {
        if (!movsFinCol.fields.getByName('conciliado')) {
          movsFinCol.fields.add(
            new BoolField({
              name: 'conciliado',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('data_conciliacao')) {
          movsFinCol.fields.add(
            new TextField({
              name: 'data_conciliacao',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('transferencia_id')) {
          movsFinCol.fields.add(
            new TextField({
              name: 'transferencia_id',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('lancamento_avulso')) {
          movsFinCol.fields.add(
            new BoolField({
              name: 'lancamento_avulso',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('motivo_estorno')) {
          movsFinCol.fields.add(
            new TextField({
              name: 'motivo_estorno',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('data_estorno')) {
          movsFinCol.fields.add(
            new TextField({
              name: 'data_estorno',
              required: false,
            }),
          )
        }

        if (!movsFinCol.fields.getByName('usuario_estorno_id')) {
          movsFinCol.fields.add(
            new RelationField({
              name: 'usuario_estorno_id',
              collectionId: usersColId,
              cascadeDelete: false,
              required: false,
              maxSelect: 1,
            }),
          )
        }

        // Permitir update por autenticados caso o serviço central precise atualizar conciliado/estorno
        // Se updateRule for null, mudamos para @request.auth.id != ''
        movsFinCol.updateRule = "@request.auth.id != ''"
        movsFinCol.createRule = "@request.auth.id != ''"

        // Índices adicionais para agilidade na busca de conciliação
        let hasIdxConciliado = false
        for (let i = 0; i < movsFinCol.indexes.length; i++) {
          if (movsFinCol.indexes[i].indexOf('conciliado') !== -1) {
            hasIdxConciliado = true
            break
          }
        }
        if (!hasIdxConciliado) {
          movsFinCol.indexes.push(
            'CREATE INDEX idx_mov_fin_conciliado ON movimentacoes_financeiras (conta_financeira_id, conciliado, data_movimento)',
          )
        }

        app.save(movsFinCol)
      }
    } catch (errMovs) {
      console.error('Aviso ao atualizar movimentacoes_financeiras:', errMovs)
    }

    // Preencher default conciliado = false nos registros anteriores
    try {
      app
        .db()
        .newQuery(
          'UPDATE movimentacoes_financeiras SET conciliado = false WHERE conciliado IS NULL',
        )
        .execute()
    } catch (_) {}

    // =========================================================================
    // 2. CRIAR TABELA extratos_linhas
    // =========================================================================
    if (!app.hasTable('extratos_linhas')) {
      const extratosCol = new Collection({
        name: 'extratos_linhas',
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
            name: 'conta_financeira_id',
            type: 'relation',
            required: true,
            collectionId: contasFinanceirasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'fitid',
            type: 'text',
            required: true,
          },
          {
            name: 'data',
            type: 'text',
            required: true,
          },
          {
            name: 'valor',
            type: 'number',
            required: true,
          },
          {
            name: 'descricao',
            type: 'text',
            required: true,
          },
          {
            name: 'situacao',
            type: 'select',
            required: true,
            values: ['Pendente', 'Conciliada', 'Ignorada'],
            maxSelect: 1,
          },
          {
            name: 'movimentos_ids',
            type: 'json',
            required: false,
          },
          {
            name: 'arquivo_importacao',
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
          'CREATE UNIQUE INDEX idx_extratos_linhas_conta_fitid ON extratos_linhas (conta_financeira_id, fitid)',
          'CREATE INDEX idx_extratos_linhas_empresa ON extratos_linhas (empresa_id)',
          'CREATE INDEX idx_extratos_linhas_conta_data ON extratos_linhas (conta_financeira_id, data)',
          'CREATE INDEX idx_extratos_linhas_situacao ON extratos_linhas (situacao)',
          'CREATE INDEX idx_extratos_linhas_ativo ON extratos_linhas (ativo)',
        ],
      })

      app.save(extratosCol)
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('extratos_linhas')
      if (c) app.delete(c)
    } catch (_) {}
  },
)
