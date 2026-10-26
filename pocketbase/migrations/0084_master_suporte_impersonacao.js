/// <reference path="../types.d.ts" />

/**
 * Migration 0084: Suporte Master (Impersonação de Assinante) e Auditoria Modo Master (Prompt 9.7b2)
 *
 * 1. Adiciona o campo `modo_master` (bool) à coleção `logs_auditoria` para identificar
 *    ações executadas pelo usuário master durante o suporte a um cliente.
 * 2. Cria a coleção `master_impersonacoes` no servidor para armazenar com segurança
 *    qual assinante o usuário master está acessando no momento (sem confiar em valores do navegador).
 */
migrate(
  (app) => {
    // 1. Campo modo_master na coleção logs_auditoria
    try {
      const laCol = app.findCollectionByNameOrId('logs_auditoria')
      if (!laCol.fields.getByName('modo_master')) {
        laCol.fields.add(new BoolField({ name: 'modo_master' }))
        app.save(laCol)
      }
    } catch (errLa) {
      console.error('[0084] Erro ao adicionar modo_master em logs_auditoria:', errLa)
    }

    // 2. Coleção master_impersonacoes
    if (!app.hasTable('master_impersonacoes')) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      const assinantesCol = app.findCollectionByNameOrId('assinantes')

      const col = new Collection({
        name: 'master_impersonacoes',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user_id',
            type: 'relation',
            required: true,
            collectionId: usersCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
            collectionId: assinantesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_master_impersonacoes_user ON master_impersonacoes (user_id)',
        ],
      })
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('master_impersonacoes')
      app.delete(col)
    } catch (_) {}
  },
)
