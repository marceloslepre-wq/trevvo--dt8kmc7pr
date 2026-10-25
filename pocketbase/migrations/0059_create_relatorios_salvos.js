// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0059: Criação da collection relatorios_salvos (Prompt 8.6)
 *
 * Permite que usuários salvem configurações completas de relatórios personalizados
 * (base, agrupamentos, valores_metricas, filtros, grafico, etc.)
 * e compartilhem relatórios com a empresa ("Relatórios da empresa").
 */

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    const collection = new Collection({
      name: 'relatorios_salvos',
      type: 'base',
      listRule: "@request.auth.id != '' && (usuario_id = @request.auth.id || compartilhado = true)",
      viewRule: "@request.auth.id != '' && (usuario_id = @request.auth.id || compartilhado = true)",
      createRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      updateRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      deleteRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'descricao',
          type: 'text',
          required: false,
        },
        {
          name: 'tipo',
          type: 'text',
          required: true, // ex: 'personalizado'
        },
        {
          name: 'base',
          type: 'text',
          required: true, // 'itens_vendidos' | 'itens_comprados'
        },
        {
          name: 'agrupamentos',
          type: 'json',
          required: true, // array com até 3 agrupamentos
        },
        {
          name: 'valores',
          type: 'json',
          required: true, // array com chaves de valores/métricas
        },
        {
          name: 'filtros',
          type: 'json',
          required: true, // ObjetoFiltrosRelatorio
        },
        {
          name: 'tipo_grafico',
          type: 'text',
          required: false, // 'nenhum' | 'barras' | 'linhas'
        },
        {
          name: 'compartilhado',
          type: 'bool',
          required: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_rel_salvos_usuario ON relatorios_salvos (usuario_id)',
        'CREATE INDEX idx_rel_salvos_tipo ON relatorios_salvos (tipo)',
        'CREATE INDEX idx_rel_salvos_compartilhado ON relatorios_salvos (compartilhado)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('relatorios_salvos')
      app.delete(col)
    } catch (_) {}
  },
)
