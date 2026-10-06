migrate(
  (app) => {
    const collection = new Collection({
      name: 'empresas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        // Padrão do ERP
        { name: 'ativo', type: 'bool' },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'updated_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },

        // Identificação
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['Matriz', 'Filial'],
          maxSelect: 1,
        },
        { name: 'matriz_id', type: 'text', required: false },
        { name: 'codigo', type: 'number', required: true, onlyInt: true },
        { name: 'razao_social', type: 'text', required: true, max: 60 },
        { name: 'nome_fantasia', type: 'text', required: false, max: 60 },
        { name: 'cnpj', type: 'text', required: true, max: 18 },
        { name: 'inscricao_estadual', type: 'text', required: false },
        { name: 'inscricao_estadual_st', type: 'text', required: false },
        { name: 'inscricao_municipal', type: 'text', required: false },
        { name: 'cnae_principal', type: 'text', required: false, max: 10 },
        { name: 'cnaes_secundarios', type: 'json', required: false },
        { name: 'data_abertura', type: 'date', required: false },
        {
          name: 'logo',
          type: 'file',
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        },

        // Regime tributário
        { name: 'crt', type: 'number', required: true, onlyInt: true },
        {
          name: 'regime_apuracao',
          type: 'select',
          required: false,
          values: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'],
          maxSelect: 1,
        },
        {
          name: 'regime_pis_cofins',
          type: 'select',
          required: false,
          values: ['Cumulativo', 'Não cumulativo'],
          maxSelect: 1,
        },
        { name: 'aliquota_credito_simples', type: 'number', required: false },
        { name: 'contribuinte_ipi', type: 'bool' },
        { name: 'indicador_atividade_sped', type: 'number', required: false, onlyInt: true },
        {
          name: 'perfil_sped',
          type: 'select',
          required: false,
          values: ['A', 'B', 'C'],
          maxSelect: 1,
        },
        { name: 'obrigado_efd_icms_ipi', type: 'bool' },

        // Endereço
        { name: 'cep', type: 'text', required: false, max: 9 },
        { name: 'logradouro', type: 'text', required: false },
        { name: 'numero', type: 'text', required: false },
        { name: 'complemento', type: 'text', required: false },
        { name: 'bairro', type: 'text', required: false },
        { name: 'municipio', type: 'text', required: false },
        { name: 'codigo_municipio_ibge', type: 'text', required: true, max: 7 },
        { name: 'uf', type: 'text', required: false, max: 2 },
        { name: 'codigo_pais', type: 'text', required: false, max: 4 },
        { name: 'pais', type: 'text', required: false },

        // Contato
        { name: 'telefone', type: 'text', required: false },
        { name: 'celular', type: 'text', required: false },
        { name: 'email', type: 'email', required: false },
        { name: 'email_fiscal', type: 'email', required: false },
        { name: 'site', type: 'text', required: false },

        // Responsável legal
        { name: 'responsavel_nome', type: 'text', required: false },
        { name: 'responsavel_cpf', type: 'text', required: false, max: 14 },
        { name: 'responsavel_cargo', type: 'text', required: false },

        // Contabilidade (registro 0100 SPED)
        { name: 'contador_nome', type: 'text', required: false },
        { name: 'contador_cpf', type: 'text', required: false, max: 14 },
        { name: 'contador_crc', type: 'text', required: false },
        { name: 'contador_cnpj_escritorio', type: 'text', required: false, max: 18 },
        { name: 'contador_cep', type: 'text', required: false, max: 9 },
        { name: 'contador_logradouro', type: 'text', required: false },
        { name: 'contador_numero', type: 'text', required: false },
        { name: 'contador_complemento', type: 'text', required: false },
        { name: 'contador_bairro', type: 'text', required: false },
        { name: 'contador_codigo_municipio_ibge', type: 'text', required: false, max: 7 },
        { name: 'contador_telefone', type: 'text', required: false },
        { name: 'contador_email', type: 'email', required: false },

        // Autodate obrigatórios para base collection
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_empresas_cnpj ON empresas (cnpj)',
        'CREATE UNIQUE INDEX idx_empresas_codigo ON empresas (codigo)',
        'CREATE INDEX idx_empresas_tipo ON empresas (tipo)',
        'CREATE INDEX idx_empresas_ativo ON empresas (ativo)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('empresas')
      app.delete(collection)
    } catch (_) {}
  },
)
