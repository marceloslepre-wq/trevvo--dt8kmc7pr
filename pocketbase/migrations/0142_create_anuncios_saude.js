// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0142: Saúde dos anúncios (monitor diário dos marketplaces)
 *
 * anuncios_saude: um registro por anúncio COM PROBLEMA encontrado na última verificação
 *   (pausado por política, pausado com estoque sem motivo, sem estoque no canal mas com
 *   estoque no Trevvo). Anúncio que voltou ao normal é apagado na verificação seguinte.
 * anuncios_saude_execucoes: histórico das verificações (agendada todo dia às 6h ou manual).
 *
 * Só o backend grava (hook anuncios_saude.js). O usuário apenas lê, dentro do assinante.
 * marketplace: 'mercadolivre' (shopee e amazon depois). Idempotente.
 */
migrate(
  (app) => {
    const regraAssinante = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
    const assinantesCol = app.findCollectionByNameOrId('assinantes')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const produtosCol = app.findCollectionByNameOrId('produtos')

    let existeSaude = false
    try {
      app.findCollectionByNameOrId('anuncios_saude')
      existeSaude = true
    } catch (_) {}

    if (!existeSaude) {
      const col = new Collection({
        name: 'anuncios_saude',
        type: 'base',
        listRule: regraAssinante,
        viewRule: regraAssinante,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
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
          {
            name: 'produto_id',
            type: 'relation',
            required: false,
            collectionId: produtosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'marketplace', type: 'text', required: true, max: 30 },
          { name: 'anuncio_id', type: 'text', required: true, max: 40 },
          { name: 'titulo', type: 'text', required: false, max: 300 },
          { name: 'sku', type: 'text', required: false, max: 300 },
          { name: 'produto_codigo', type: 'text', required: false, max: 60 },
          { name: 'situacao', type: 'text', required: false, max: 40 },
          { name: 'status_canal', type: 'text', required: false, max: 40 },
          { name: 'sub_status', type: 'text', required: false, max: 200 },
          { name: 'motivo', type: 'text', required: false, max: 500 },
          { name: 'acao_sugerida', type: 'text', required: false, max: 1000 },
          { name: 'estoque_canal', type: 'number', required: false },
          { name: 'estoque_trevvo', type: 'number', required: false },
          { name: 'vendidos', type: 'number', required: false },
          { name: 'link', type: 'text', required: false, max: 500 },
          { name: 'primeira_vez_em', type: 'text', required: false, max: 40 },
          { name: 'verificado_em', type: 'text', required: false, max: 40 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_as_unico ON anuncios_saude (empresa_id, marketplace, anuncio_id)',
          'CREATE INDEX idx_as_assinante ON anuncios_saude (assinante_id, situacao)',
        ],
      })
      app.save(col)
    }

    let existeExec = false
    try {
      app.findCollectionByNameOrId('anuncios_saude_execucoes')
      existeExec = true
    } catch (_) {}

    if (!existeExec) {
      const colExec = new Collection({
        name: 'anuncios_saude_execucoes',
        type: 'base',
        listRule: regraAssinante,
        viewRule: regraAssinante,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'assinante_id',
            type: 'relation',
            required: true,
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
          { name: 'marketplace', type: 'text', required: true, max: 30 },
          // Pendente | Executando | Concluída | Erro
          { name: 'status', type: 'text', required: true, max: 20 },
          // Agendada | Manual
          { name: 'origem', type: 'text', required: false, max: 20 },
          { name: 'dia', type: 'text', required: false, max: 10 },
          { name: 'iniciada_em', type: 'text', required: false, max: 40 },
          { name: 'concluida_em', type: 'text', required: false, max: 40 },
          { name: 'total_lidos', type: 'number', required: false },
          { name: 'total_problemas', type: 'number', required: false },
          { name: 'resumo', type: 'json', required: false },
          { name: 'mensagem', type: 'text', required: false, max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_ase_empresa ON anuncios_saude_execucoes (empresa_id, marketplace, status)',
        ],
      })
      app.save(colExec)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('anuncios_saude'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('anuncios_saude_execucoes'))
    } catch (_) {}
  },
)
