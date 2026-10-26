/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    let empresasCol
    try {
      empresasCol = app.findCollectionByNameOrId('empresas')
    } catch (_) {
      empresasCol = null
    }

    let credenciaisCol
    try {
      credenciaisCol = app.findCollectionByNameOrId('credenciais_fiscais')
    } catch (_) {
      credenciaisCol = null
    }

    if (!credenciaisCol) {
      credenciaisCol = new Collection({
        name: 'credenciais_fiscais',
        type: 'base',
        // Totalmente fechada para o navegador — só o backend (pb_hooks) lê e grava
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasCol ? empresasCol.id : 'empresas',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'token_homologacao',
            type: 'text',
            required: false,
          },
          {
            name: 'token_producao',
            type: 'text',
            required: false,
          },
          {
            name: 'webhook_secret',
            type: 'text',
            required: false,
          },
          {
            name: 'atualizado_por',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'atualizado_em',
            type: 'text',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_credenciais_fiscais_empresa ON credenciais_fiscais (empresa_id)',
        ],
      })

      app.save(credenciaisCol)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('credenciais_fiscais')
      if (col) {
        app.delete(col)
      }
    } catch (_) {}
  },
)
