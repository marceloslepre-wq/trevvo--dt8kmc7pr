/**
 * Migration 0154: tray_envios_log
 *
 * Registro de cada envio de estoque/preço do Trevvo para a Tray (hook tray_envio.js).
 * Sem tokens. Leitura pelo assinante; gravação só pelo servidor. Idempotente.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('tray_envios_log')
      return
    } catch (_) {}
    const regraAssinante = "@request.auth.id != '' && assinante_id = @request.auth.assinante_id"
    const col = new Collection({
      name: 'tray_envios_log',
      type: 'base',
      listRule: regraAssinante,
      viewRule: regraAssinante,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'assinante_id', type: 'text', required: true, max: 40 },
        { name: 'empresa_id', type: 'text', required: true, max: 40 },
        { name: 'usuario_id', type: 'text', required: false, max: 40 },
        { name: 'origem', type: 'text', required: false, max: 20 },
        { name: 'anuncio_id', type: 'text', required: true, max: 40 },
        { name: 'variacao_id', type: 'text', required: false, max: 40 },
        { name: 'produto_id', type: 'text', required: false, max: 40 },
        { name: 'tipo', type: 'text', required: true, max: 20 },
        { name: 'valor_enviado', type: 'number', required: false },
        { name: 'status_http', type: 'number', required: false },
        { name: 'sucesso', type: 'bool', required: false },
        { name: 'mensagem', type: 'text', required: false, max: 500 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tray_envios_log_empresa ON tray_envios_log (empresa_id, created)',
        'CREATE INDEX idx_tray_envios_log_anuncio ON tray_envios_log (anuncio_id, variacao_id)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('tray_envios_log'))
    } catch (_) {}
  },
)
