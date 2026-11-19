/// <reference path="../types.d.ts" />

/**
 * Etapa 11 — Homologação do aplicativo na Tray.
 * Guarda o par requisição/resposta de cada chamada feita no roteiro de homologação, já sem
 * tokens nem chaves, para montar o documento de evidências pedido pela Tray.
 * Coleção fechada para o navegador (regras = null); só o backend lê e grava.
 */
migrate(
  (app) => {
    let existente = null
    try {
      existente = app.findCollectionByNameOrId('tray_evidencias')
    } catch (_) {
      existente = null
    }
    if (existente) return

    let empresasCol = null
    try {
      empresasCol = app.findCollectionByNameOrId('empresas')
    } catch (_) {}

    const col = new Collection({
      name: 'tray_evidencias',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'empresa_id',
          type: 'relation',
          required: false,
          collectionId: empresasCol ? empresasCol.id : 'empresas',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'execucao_id', type: 'text', required: false },
        { name: 'ordem', type: 'number', required: false },
        { name: 'etapa', type: 'text', required: false },
        { name: 'metodo', type: 'text', required: false },
        { name: 'rota', type: 'text', required: false },
        { name: 'url_exemplo', type: 'text', required: false, max: 200000 },
        { name: 'request_json', type: 'text', required: false, max: 200000 },
        { name: 'status_http', type: 'number', required: false },
        { name: 'response_json', type: 'text', required: false, max: 200000 },
        { name: 'duracao_ms', type: 'number', required: false },
        { name: 'observacao', type: 'text', required: false, max: 200000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tray_evidencias_execucao ON tray_evidencias (empresa_id, execucao_id)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('tray_evidencias')
      app.delete(col)
    } catch (_) {}
  },
)
