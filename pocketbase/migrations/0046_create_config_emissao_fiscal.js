/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('users')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    if (!app.hasTable('config_emissao_fiscal')) {
      const col = new Collection({
        name: 'config_emissao_fiscal',
        type: 'base',
        // Leitura: quem tem acesso ao ERP (validação fina de notas_saida no client/guard)
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Gravação apenas para Administrador (regra PocketBase via @request.auth)
        // No ERP, administrador é perfis_acesso.administrador = true via usuarios
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
        fields: [
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'provedor',
            type: 'text',
            required: false,
          },
          {
            name: 'emite_documentos_fiscais',
            type: 'bool',
            required: false,
          },
          {
            name: 'codigo_token',
            type: 'text',
            required: false,
          },
          {
            name: 'presenca_comprador_padrao_nfe',
            type: 'select',
            required: false,
            values: [
              '1 Presencial',
              '2 Internet',
              '3 Teleatendimento',
              '4 Entrega em domicílio',
              '9 Outros',
            ],
          },
          {
            name: 'ambiente',
            type: 'select',
            required: false,
            values: ['Homologação', 'Produção'],
          },
          {
            name: 'serie_nfe',
            type: 'text',
            required: false,
          },
          {
            name: 'serie_nfce',
            type: 'text',
            required: false,
          },
          {
            name: 'emitir_nfce_automaticamente_no_pdv',
            type: 'bool',
            required: false,
          },
          {
            name: 'natureza_operacao_venda',
            type: 'text',
            required: false,
          },
          {
            name: 'natureza_operacao_devolucao_compra',
            type: 'text',
            required: false,
          },
          {
            name: 'natureza_operacao_devolucao_venda',
            type: 'text',
            required: false,
          },
          {
            name: 'informacoes_complementares_padrao',
            type: 'text',
            required: false,
          },
          {
            name: 'enviar_email_cliente',
            type: 'bool',
            required: false,
          },
          {
            name: 'certificado_validade',
            type: 'date',
            required: false,
          },
          {
            name: 'csc_configurado',
            type: 'bool',
            required: false,
          },
          {
            name: 'informar_ibs_cbs',
            type: 'bool',
            required: false,
          },
          {
            name: 'ultimo_teste_conexao_data',
            type: 'date',
            required: false,
          },
          {
            name: 'ultimo_teste_conexao_sucesso',
            type: 'bool',
            required: false,
          },
          {
            name: 'ultimo_teste_conexao_mensagem',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
          {
            name: 'created_by',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'updated_by',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_config_emissao_fiscal_empresa ON config_emissao_fiscal (empresa_id)',
          'CREATE INDEX idx_config_emissao_fiscal_ativo ON config_emissao_fiscal (ativo)',
        ],
      })

      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('config_emissao_fiscal')
      app.delete(col)
    } catch (_) {}
  },
)
