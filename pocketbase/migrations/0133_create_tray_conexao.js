/// <reference path="../types.d.ts" />

/**
 * Etapa 11 / Parte 11.1 — Conexão com a Tray.
 * Coleções fechadas para o navegador (todas as regras = null), no padrão de credenciais_fiscais.
 * Só cria o que ainda não existe e não altera nenhuma coleção atual.
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

    let contas = null
    try {
      contas = app.findCollectionByNameOrId('tray_contas')
    } catch (_) {
      contas = null
    }
    if (!contas) {
      contas = new Collection({
        name: 'tray_contas',
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
          { name: 'loja_host', type: 'text', required: false },
          { name: 'api_address', type: 'text', required: false },
          { name: 'store_id', type: 'text', required: false },
          { name: 'loja_nome', type: 'text', required: false },
          { name: 'access_token', type: 'text', required: false },
          { name: 'refresh_token', type: 'text', required: false },
          { name: 'token_expira_em', type: 'text', required: false },
          { name: 'refresh_expira_em', type: 'text', required: false },
          // Conectada | Reconectar | Desconectada
          { name: 'status', type: 'text', required: false },
          { name: 'ultimo_erro', type: 'text', required: false },
          { name: 'ultima_renovacao_em', type: 'text', required: false },
          { name: 'conectada_em', type: 'text', required: false },
          { name: 'conectada_por', type: 'text', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_tray_contas_empresa ON tray_contas (empresa_id)'],
      })
      app.save(contas)
    }

    let estados = null
    try {
      estados = app.findCollectionByNameOrId('tray_oauth_estados')
    } catch (_) {
      estados = null
    }
    if (!estados) {
      estados = new Collection({
        name: 'tray_oauth_estados',
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
          { name: 'loja_host', type: 'text', required: false },
          { name: 'retorno_url', type: 'text', required: false },
          { name: 'expira_em', type: 'text', required: false },
          { name: 'usado', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_tray_oauth_estados_estado ON tray_oauth_estados (estado)'],
      })
      app.save(estados)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('tray_oauth_estados'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('tray_contas'))
    } catch (_) {}
  },
)
