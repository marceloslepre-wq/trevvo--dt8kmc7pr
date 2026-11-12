/// <reference path="../types.d.ts" />

/**
 * Etapa 10 / Parte 10.2a — Fila de notificações do Mercado Livre.
 * Coleção fechada para o navegador; só o backend grava e lê.
 * Só cria o que ainda não existe e não altera nenhuma coleção atual.
 */
migrate(
  (app) => {
    let col = null
    try {
      col = app.findCollectionByNameOrId('mercadolivre_notificacoes')
    } catch (_) {
      col = null
    }
    if (col) return

    col = new Collection({
      name: 'mercadolivre_notificacoes',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'notificacao_id', type: 'text', required: true },
        { name: 'topico', type: 'text', required: false },
        { name: 'recurso', type: 'text', required: false },
        { name: 'ml_user_id', type: 'text', required: false },
        { name: 'empresa_id', type: 'text', required: false },
        { name: 'assinante_id', type: 'text', required: false },
        { name: 'tentativa_ml', type: 'number', required: false },
        { name: 'enviada_em', type: 'text', required: false },
        { name: 'recebida_em', type: 'text', required: false },
        // Pendente | Processada | Ignorada | Erro
        { name: 'status', type: 'text', required: false },
        { name: 'processada_em', type: 'text', required: false },
        { name: 'erro', type: 'text', required: false },
        { name: 'conteudo', type: 'text', required: false, max: 20000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_ml_notificacoes_id ON mercadolivre_notificacoes (notificacao_id)',
        'CREATE INDEX idx_ml_notificacoes_status ON mercadolivre_notificacoes (status, topico)',
        'CREATE INDEX idx_ml_notificacoes_empresa ON mercadolivre_notificacoes (empresa_id)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('mercadolivre_notificacoes')
      if (col) app.delete(col)
    } catch (_) {}
  },
)
