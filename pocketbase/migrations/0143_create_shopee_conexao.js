/// <reference path="../types.d.ts" />

/**
 * Shopee — conexão da loja (Open Platform v2), no mesmo padrão do Mercado Livre (0131).
 *
 * Coleções totalmente fechadas para o navegador (todas as regras = null): só o backend
 * (pb_hooks/shopee_conexao.js) lê e grava. Os tokens nunca chegam ao navegador.
 *
 * - shopee_contas: uma loja da Shopee por empresa, com os tokens.
 * - shopee_oauth_estados: valores de uso único do fluxo de autorização.
 *
 * Só cria o que ainda não existe. Idempotente.
 */
migrate(
  (app) => {
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const assinantesCol = app.findCollectionByNameOrId('assinantes')

    let existeContas = false
    try {
      app.findCollectionByNameOrId('shopee_contas')
      existeContas = true
    } catch (_) {}

    if (!existeContas) {
      app.save(
        new Collection({
          name: 'shopee_contas',
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
              collectionId: assinantesCol.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            {
              name: 'empresa_id',
              type: 'relation',
              required: true,
              collectionId: empresasCol.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'shop_id', type: 'text', required: false },
            { name: 'shop_nome', type: 'text', required: false },
            { name: 'regiao', type: 'text', required: false },
            { name: 'access_token', type: 'text', required: false },
            { name: 'refresh_token', type: 'text', required: false },
            { name: 'token_expira_em', type: 'text', required: false },
            { name: 'refresh_expira_em', type: 'text', required: false },
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
            { name: 'conectada_por', type: 'text', required: false },
            { name: 'ativo', type: 'bool', required: false },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_shopee_contas_empresa ON shopee_contas (empresa_id)'],
        }),
      )
    }

    let existeEstados = false
    try {
      app.findCollectionByNameOrId('shopee_oauth_estados')
      existeEstados = true
    } catch (_) {}

    if (!existeEstados) {
      app.save(
        new Collection({
          name: 'shopee_oauth_estados',
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
            { name: 'retorno_url', type: 'text', required: false },
            { name: 'expira_em', type: 'text', required: false },
            { name: 'usado', type: 'bool', required: false },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_shopee_estados_estado ON shopee_oauth_estados (estado)'],
        }),
      )
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('shopee_oauth_estados'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('shopee_contas'))
    } catch (_) {}
  },
)
