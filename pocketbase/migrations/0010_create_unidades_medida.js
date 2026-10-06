migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    const collection = new Collection({
      name: 'unidades_medida',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'sigla', type: 'text', required: true, min: 1, max: 6 },
        { name: 'descricao', type: 'text', required: true },
        { name: 'aceita_fracionado', type: 'bool' },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'updated_by',
          type: 'relation',
          required: false,
          collectionId: usersAuthId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_unidades_medida_sigla ON unidades_medida (sigla)',
        'CREATE INDEX idx_unidades_medida_ativo ON unidades_medida (ativo)',
      ],
    })
    app.save(collection)

    // Seed inicial exato
    const sementes = [
      { sigla: 'UN', descricao: 'Unidade', aceita_fracionado: false },
      { sigla: 'PC', descricao: 'Peça', aceita_fracionado: false },
      { sigla: 'CX', descricao: 'Caixa', aceita_fracionado: false },
      { sigla: 'PCT', descricao: 'Pacote', aceita_fracionado: false },
      { sigla: 'FD', descricao: 'Fardo', aceita_fracionado: false },
      { sigla: 'DZ', descricao: 'Dúzia', aceita_fracionado: false },
      { sigla: 'KG', descricao: 'Quilograma', aceita_fracionado: true },
      { sigla: 'G', descricao: 'Grama', aceita_fracionado: true },
      { sigla: 'L', descricao: 'Litro', aceita_fracionado: true },
      { sigla: 'ML', descricao: 'Mililitro', aceita_fracionado: true },
      { sigla: 'M', descricao: 'Metro', aceita_fracionado: true },
      { sigla: 'M2', descricao: 'Metro quadrado', aceita_fracionado: true },
      { sigla: 'M3', descricao: 'Metro cúbico', aceita_fracionado: true },
      { sigla: 'PAR', descricao: 'Par', aceita_fracionado: false },
      { sigla: 'KIT', descricao: 'Kit', aceita_fracionado: false },
      { sigla: 'RL', descricao: 'Rolo', aceita_fracionado: false },
      { sigla: 'SC', descricao: 'Saco', aceita_fracionado: false },
      { sigla: 'TON', descricao: 'Tonelada', aceita_fracionado: true },
    ]

    for (let i = 0; i < sementes.length; i++) {
      const item = sementes[i]
      try {
        app.findFirstRecordByData('unidades_medida', 'sigla', item.sigla)
      } catch (_) {
        const record = new Record(collection)
        record.set('sigla', item.sigla)
        record.set('descricao', item.descricao)
        record.set('aceita_fracionado', item.aceita_fracionado)
        record.set('ativo', true)
        app.save(record)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('unidades_medida')
      app.delete(col)
    } catch (_) {}
  },
)
