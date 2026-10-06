migrate(
  (app) => {
    const usersAuthId = '_pb_users_auth_'

    const fornecedoresCol = new Collection({
      name: 'fornecedores',
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
        { name: 'razao_social', type: 'text', required: true, max: 60 },
        { name: 'nome_fantasia', type: 'text', required: false, max: 60 },
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
        {
          name: 'crt_fornecedor',
          type: 'select',
          required: false,
          values: ['1', '2', '3', '4'],
          maxSelect: 1,
        },
        {
          name: 'tipo_fornecedor',
          type: 'select',
          required: false,
          values: ['Mercadorias', 'Serviços', 'Transportadora', 'Uso e consumo', 'Outros'],
          maxSelect: 5,
        },
        { name: 'produtor_rural', type: 'bool' },

        // Endereço
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

        // Contato
        { name: 'telefone', type: 'text', required: false },
        { name: 'celular', type: 'text', required: false },
        { name: 'email', type: 'text', required: false },
        { name: 'email_financeiro', type: 'text', required: false },
        { name: 'site', type: 'text', required: false },
        { name: 'contato_nome', type: 'text', required: false },
        { name: 'contato_cargo', type: 'text', required: false },
        { name: 'contato_telefone', type: 'text', required: false },

        // Comercial
        { name: 'prazo_entrega_dias', type: 'number', required: false, min: 0 },
        { name: 'condicao_pagamento_padrao', type: 'text', required: false },
        { name: 'pedido_minimo', type: 'number', required: false, min: 0 },
        { name: 'representante_nome', type: 'text', required: false },
        { name: 'representante_telefone', type: 'text', required: false },
        { name: 'representante_email', type: 'text', required: false },

        // Dados bancários
        { name: 'banco_codigo', type: 'text', required: false },
        { name: 'banco_nome', type: 'text', required: false },
        { name: 'agencia', type: 'text', required: false },
        { name: 'conta', type: 'text', required: false },
        {
          name: 'tipo_conta',
          type: 'select',
          required: false,
          values: ['Corrente', 'Poupança'],
          maxSelect: 1,
        },
        { name: 'titular', type: 'text', required: false },
        { name: 'cpf_cnpj_titular', type: 'text', required: false },
        {
          name: 'pix_tipo',
          type: 'select',
          required: false,
          values: ['CPF/CNPJ', 'E-mail', 'Telefone', 'Chave aleatória'],
          maxSelect: 1,
        },
        { name: 'pix_chave', type: 'text', required: false },

        // Outros
        { name: 'observacoes', type: 'text', required: false },

        // Auditoria e metadados padrão
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
        'CREATE INDEX idx_fornecedores_codigo ON fornecedores (codigo)',
        'CREATE INDEX idx_fornecedores_cpf_cnpj ON fornecedores (cpf_cnpj)',
        'CREATE INDEX idx_fornecedores_razao_social ON fornecedores (razao_social)',
        'CREATE INDEX idx_fornecedores_tipo_pessoa ON fornecedores (tipo_pessoa)',
        'CREATE INDEX idx_fornecedores_ativo ON fornecedores (ativo)',
        'CREATE INDEX idx_fornecedores_uf ON fornecedores (uf)',
      ],
    })

    app.save(fornecedoresCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('fornecedores')
      app.delete(col)
    } catch (_) {}
  },
)
