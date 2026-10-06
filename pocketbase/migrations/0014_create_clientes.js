migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id

    const clientesCol = new Collection({
      name: 'clientes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'ativo', type: 'bool' },
        { name: 'codigo', type: 'number', required: false },
        {
          name: 'tipo_pessoa',
          type: 'select',
          required: true,
          values: ['Física', 'Jurídica', 'Estrangeiro'],
          maxSelect: 1,
        },
        { name: 'cpf_cnpj', type: 'text', required: false },
        { name: 'id_estrangeiro', type: 'text', required: false },
        { name: 'nome_razao_social', type: 'text', required: true, max: 60 },
        { name: 'nome_fantasia', type: 'text', required: false, max: 60 },
        { name: 'rg', type: 'text', required: false },
        { name: 'data_nascimento', type: 'text', required: false },
        {
          name: 'indicador_ie',
          type: 'select',
          required: true,
          values: ['1', '2', '9'],
          maxSelect: 1,
        },
        { name: 'inscricao_estadual', type: 'text', required: false },
        { name: 'inscricao_municipal', type: 'text', required: false },
        { name: 'inscricao_suframa', type: 'text', required: false },
        { name: 'consumidor_final', type: 'bool' },
        {
          name: 'regime_tributario_cliente',
          type: 'select',
          required: false,
          values: ['1', '2', '3', '4'],
          maxSelect: 1,
        },
        // Endereço principal
        { name: 'cep', type: 'text', required: false },
        { name: 'logradouro', type: 'text', required: false },
        { name: 'numero', type: 'text', required: false },
        { name: 'complemento', type: 'text', required: false },
        { name: 'bairro', type: 'text', required: false },
        { name: 'municipio', type: 'text', required: false },
        { name: 'codigo_municipio_ibge', type: 'text', required: false },
        { name: 'uf', type: 'text', required: false },
        { name: 'codigo_pais', type: 'text', required: false },
        { name: 'pais', type: 'text', required: false },
        // Endereço de entrega
        { name: 'entrega_mesmo_endereco', type: 'bool' },
        { name: 'entrega_cep', type: 'text', required: false },
        { name: 'entrega_logradouro', type: 'text', required: false },
        { name: 'entrega_numero', type: 'text', required: false },
        { name: 'entrega_complemento', type: 'text', required: false },
        { name: 'entrega_bairro', type: 'text', required: false },
        { name: 'entrega_municipio', type: 'text', required: false },
        { name: 'entrega_codigo_municipio_ibge', type: 'text', required: false },
        { name: 'entrega_uf', type: 'text', required: false },
        // Contato
        { name: 'telefone', type: 'text', required: false },
        { name: 'celular', type: 'text', required: false },
        { name: 'whatsapp', type: 'bool' },
        { name: 'email', type: 'text', required: false },
        { name: 'email_nfe', type: 'text', required: false },
        { name: 'contato_nome', type: 'text', required: false },
        // Comercial
        {
          name: 'vendedor_id',
          type: 'relation',
          required: false,
          collectionId: usuariosColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'limite_credito', type: 'number', required: false, min: 0 },
        { name: 'dia_vencimento_preferencial', type: 'number', required: false, min: 1, max: 31 },
        { name: 'condicao_pagamento_padrao', type: 'text', required: false },
        { name: 'desconto_padrao_percentual', type: 'number', required: false, min: 0, max: 100 },
        { name: 'bloqueado', type: 'bool' },
        { name: 'motivo_bloqueio', type: 'text', required: false },
        { name: 'observacoes', type: 'text', required: false },
        { name: 'observacao_nota', type: 'text', required: false },
        // Campos padrão
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
        'CREATE INDEX idx_clientes_codigo ON clientes (codigo)',
        'CREATE INDEX idx_clientes_cpf_cnpj ON clientes (cpf_cnpj)',
        'CREATE INDEX idx_clientes_nome ON clientes (nome_razao_social)',
        'CREATE INDEX idx_clientes_tipo_pessoa ON clientes (tipo_pessoa)',
        'CREATE INDEX idx_clientes_ativo ON clientes (ativo)',
        'CREATE INDEX idx_clientes_vendedor ON clientes (vendedor_id)',
        'CREATE INDEX idx_clientes_bloqueado ON clientes (bloqueado)',
      ],
    })

    app.save(clientesCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('clientes')
      app.delete(col)
    } catch (_) {}
  },
)
