/// <reference path="../types.d.ts" />

/**
 * Etapa 10 / Parte 10.1 — Conexão com o Mercado Livre.
 *
 * Cria duas coleções totalmente fechadas para o navegador (todas as regras = null),
 * no mesmo padrão de credenciais_fiscais: só o backend (pb_hooks) lê e grava.
 *
 * - mercadolivre_contas: uma conta do Mercado Livre por empresa, com os tokens OAuth.
 * - mercadolivre_oauth_estados: valores "state" de uso único do fluxo de autorização.
 *
 * A migration só cria o que ainda não existe e não altera nenhuma coleção atual.
 */
migrate(
  (app) => {
    let empresasCol = null
    let assinantesCol = null
    try {
      empresasCol = app.findCollectionByNameOrId('empresas')
    } catch (_) {}
    try {
      assinantesCol = app.findCollectionByNameOrId('assinantes')
    } catch (_) {}

    let contasCol = null
    try {
      contasCol = app.findCollectionByNameOrId('mercadolivre_contas')
    } catch (_) {
      contasCol = null
    }

    if (!contasCol) {
      contasCol = new Collection({
        name: 'mercadolivre_contas',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: false,
            collectionId: assinantesCol ? assinantesCol.id : 'assinantes',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasCol ? empresasCol.id : 'empresas',
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'ml_user_id', type: 'text', required: false },
          { name: 'ml_nickname', type: 'text', required: false },
          { name: 'site_id', type: 'text', required: false },
          { name: 'access_token', type: 'text', required: false },
          { name: 'refresh_token', type: 'text', required: false },
          { name: 'token_expira_em', type: 'text', required: false },
          {
            name: 'status',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['Conectada', 'Reconectar', 'Desconectada'],
          },
          { name: 'ultimo_erro', type: 'text', required: false },
          { name: 'ultima_renovacao_em', type: 'text', required: false },
          { name: 'conectada_em', type: 'text', required: false },
          {
            name: 'conectada_por',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_mercadolivre_contas_empresa ON mercadolivre_contas (empresa_id)',
          'CREATE INDEX idx_mercadolivre_contas_ml_user ON mercadolivre_contas (ml_user_id)',
        ],
      })
      app.save(contasCol)
    }

    let estadosCol = null
    try {
      estadosCol = app.findCollectionByNameOrId('mercadolivre_oauth_estados')
    } catch (_) {
      estadosCol = null
    }

    if (!estadosCol) {
      estadosCol = new Collection({
        name: 'mercadolivre_oauth_estados',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'estado', type: 'text', required: true },
          { name: 'assinante_id', type: 'text', required: false },
          { name: 'empresa_id', type: 'text', required: false },
          { name: 'usuario_id', type: 'text', required: false },
          { name: 'redirect_uri', type: 'text', required: false },
          { name: 'retorno_url', type: 'text', required: false },
          { name: 'expira_em', type: 'text', required: false },
          { name: 'usado', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_mercadolivre_oauth_estados_estado ON mercadolivre_oauth_estados (estado)',
        ],
      })
      app.save(estadosCol)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('mercadolivre_oauth_estados')
      if (col) app.delete(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('mercadolivre_contas')
      if (col) app.delete(col)
    } catch (_) {}
  },
)
