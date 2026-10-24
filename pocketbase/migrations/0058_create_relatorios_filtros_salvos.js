migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    const collection = new Collection({
      name: 'relatorios_filtros_salvos',
      type: 'base',
      // O navegador só lê os próprios OU os que forem compartilhados:
      listRule: "@request.auth.id != '' && (usuario_id = @request.auth.id || compartilhado = true)",
      viewRule: "@request.auth.id != '' && (usuario_id = @request.auth.id || compartilhado = true)",
      // O navegador só cria para o próprio usuário:
      createRule: "@request.auth.id != '' && usuario_id = @request.auth.id",
      // Só o dono pode editar ou excluir:
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
          name: 'relatorio',
          type: 'text',
          required: true,
        },
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'filtros',
          type: 'json',
          required: true,
        },
        {
          name: 'compartilhado',
          type: 'bool',
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
        'CREATE INDEX idx_rel_filtros_usuario ON relatorios_filtros_salvos (usuario_id)',
        'CREATE INDEX idx_rel_filtros_relatorio ON relatorios_filtros_salvos (relatorio)',
        'CREATE INDEX idx_rel_filtros_compartilhado ON relatorios_filtros_salvos (compartilhado)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('relatorios_filtros_salvos')
    app.delete(collection)
  },
)
