/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    let assinantesCol
    try {
      assinantesCol = app.findCollectionByNameOrId('assinantes')
    } catch (_) {
      assinantesCol = null
    }

    let empresasCol
    try {
      empresasCol = app.findCollectionByNameOrId('empresas')
    } catch (_) {
      empresasCol = null
    }

    let sequenciasCol
    try {
      sequenciasCol = app.findCollectionByNameOrId('sequencias')
    } catch (_) {
      sequenciasCol = null
    }

    if (!sequenciasCol) {
      sequenciasCol = new Collection({
        name: 'sequencias',
        type: 'base',
        // Totalmente bloqueado para o navegador — apenas backend / pb_hooks
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
            collectionId: assinantesCol ? assinantesCol.id : 'assinantes',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'empresa_id',
            type: 'relation',
            required: false,
            collectionId: empresasCol ? empresasCol.id : 'empresas',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'text',
            required: true,
          },
          {
            name: 'ultimo_numero',
            type: 'number',
            required: true,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_sequencias_chave ON sequencias (assinante_id, empresa_id, tipo)',
        ],
      })

      app.save(sequenciasCol)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sequencias')
      if (col) {
        app.delete(col)
      }
    } catch (_) {}
  },
)
