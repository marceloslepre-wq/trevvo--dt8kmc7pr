/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('users')
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const produtosCol = app.findCollectionByNameOrId('produtos')

    // 1. Adicionar campo calcular_difal_consumidor_final na tabela config_emissao_fiscal se não existir
    if (app.hasTable('config_emissao_fiscal')) {
      const configCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      if (!configCol.fields.getByName('calcular_difal_consumidor_final')) {
        configCol.fields.add(
          new BoolField({
            name: 'calcular_difal_consumidor_final',
            required: false,
          }),
        )
        app.save(configCol)
      }
    }

    // 2. Criar tabela documentos_fiscais
    if (!app.hasTable('documentos_fiscais')) {
      const colDoc = new Collection({
        name: 'documentos_fiscais',
        type: 'base',
        // REGRAS DE ACESSO: SÓ LEITURA pelo navegador (list/view); gravação exclusivamente pelo backend
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'empresa_id',
            type: 'relation',
            required: true,
            collectionId: empresasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'modelo',
            type: 'select',
            required: true,
            values: ['55', '65'],
            maxSelect: 1,
          },
          {
            name: 'tipo_documento',
            type: 'number',
            required: true, // 0 entrada, 1 saída
          },
          {
            name: 'finalidade',
            type: 'number',
            required: true, // 1 normal, 4 devolução
          },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            values: ['Homologação', 'Produção'],
            maxSelect: 1,
          },
          {
            name: 'origem',
            type: 'select',
            required: true,
            values: ['Venda', 'Devolução de venda', 'Devolução de compra'],
            maxSelect: 1,
          },
          {
            name: 'venda_id',
            type: 'text',
            required: false,
          },
          {
            name: 'nota_entrada_id',
            type: 'text',
            required: false,
          },
          {
            name: 'documento_referenciado_chave',
            type: 'text',
            required: false,
          },
          {
            name: 'referencia',
            type: 'text',
            required: true,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Rascunho', 'Processando', 'Autorizada', 'Rejeitada', 'Cancelada', 'Denegada'],
            maxSelect: 1,
          },
          {
            name: 'contingencia',
            type: 'bool',
            required: false,
          },
          {
            name: 'numero',
            type: 'number',
            required: false,
          },
          {
            name: 'serie',
            type: 'text',
            required: false,
          },
          {
            name: 'chave_acesso',
            type: 'text',
            required: false,
          },
          {
            name: 'protocolo',
            type: 'text',
            required: false,
          },
          {
            name: 'data_emissao',
            type: 'text',
            required: false,
          },
          {
            name: 'data_autorizacao',
            type: 'text',
            required: false,
          },
          {
            name: 'status_sefaz',
            type: 'text',
            required: false,
          },
          {
            name: 'mensagem_sefaz',
            type: 'text',
            required: false,
          },
          {
            name: 'erros',
            type: 'json',
            required: false,
          },
          {
            name: 'presenca_comprador',
            type: 'text',
            required: false,
          },
          {
            name: 'intermediador_id',
            type: 'text',
            required: false,
          },
          {
            name: 'identificador_intermediador',
            type: 'text',
            required: false,
          },
          {
            name: 'natureza_operacao',
            type: 'text',
            required: false,
          },
          {
            name: 'cfop_principal',
            type: 'text',
            required: false,
          },
          {
            name: 'destinatario_nome',
            type: 'text',
            required: false,
          },
          {
            name: 'destinatario_cpf_cnpj',
            type: 'text',
            required: false,
          },
          {
            name: 'destinatario_uf',
            type: 'text',
            required: false,
          },
          // Totais
          { name: 'valor_produtos', type: 'number', required: false },
          { name: 'valor_desconto', type: 'number', required: false },
          { name: 'valor_frete', type: 'number', required: false },
          { name: 'valor_seguro', type: 'number', required: false },
          { name: 'valor_outras_despesas', type: 'number', required: false },
          { name: 'base_icms', type: 'number', required: false },
          { name: 'valor_icms', type: 'number', required: false },
          { name: 'base_icms_st', type: 'number', required: false },
          { name: 'valor_icms_st', type: 'number', required: false },
          { name: 'valor_fcp', type: 'number', required: false },
          { name: 'valor_icms_uf_destino', type: 'number', required: false },
          { name: 'valor_fcp_uf_destino', type: 'number', required: false },
          { name: 'valor_icms_uf_remetente', type: 'number', required: false },
          { name: 'valor_ipi', type: 'number', required: false },
          { name: 'valor_pis', type: 'number', required: false },
          { name: 'valor_cofins', type: 'number', required: false },
          { name: 'valor_ibs', type: 'number', required: false },
          { name: 'valor_cbs', type: 'number', required: false },
          { name: 'valor_total', type: 'number', required: false },
          // Auditoria e anexos
          { name: 'json_enviado', type: 'json', required: false },
          { name: 'json_retorno', type: 'json', required: false },
          {
            name: 'xml_arquivo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['text/xml', 'application/xml'],
          },
          { name: 'danfe_url', type: 'text', required: false },
          { name: 'qrcode_url', type: 'text', required: false },
          { name: 'url_consulta', type: 'text', required: false },
          // Cancelamento
          { name: 'motivo_cancelamento', type: 'text', required: false },
          { name: 'data_cancelamento', type: 'text', required: false },
          {
            name: 'xml_cancelamento',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['text/xml', 'application/xml'],
          },
          {
            name: 'usuario_emissao_id',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'usuario_cancelamento_id',
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
          'CREATE UNIQUE INDEX idx_documentos_fiscais_ref ON documentos_fiscais (referencia)',
          'CREATE INDEX idx_documentos_fiscais_empresa ON documentos_fiscais (empresa_id)',
          'CREATE INDEX idx_documentos_fiscais_modelo_status ON documentos_fiscais (modelo, status)',
          'CREATE INDEX idx_documentos_fiscais_venda ON documentos_fiscais (venda_id)',
          'CREATE INDEX idx_documentos_fiscais_chave ON documentos_fiscais (chave_acesso)',
        ],
      })
      app.save(colDoc)
    }

    // 3. Criar tabela documentos_fiscais_itens
    if (!app.hasTable('documentos_fiscais_itens')) {
      const docColCreated = app.findCollectionByNameOrId('documentos_fiscais')
      const colItens = new Collection({
        name: 'documentos_fiscais_itens',
        type: 'base',
        // REGRAS DE ACESSO: SÓ LEITURA pelo navegador (list/view); gravação exclusivamente pelo backend
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'documento_id',
            type: 'relation',
            required: true,
            collectionId: docColCreated.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'item', type: 'number', required: true },
          {
            name: 'produto_id',
            type: 'relation',
            required: false,
            collectionId: produtosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'codigo', type: 'text', required: false },
          { name: 'descricao', type: 'text', required: true },
          { name: 'ncm', type: 'text', required: false },
          { name: 'cest', type: 'text', required: false },
          { name: 'cfop', type: 'text', required: false },
          { name: 'unidade', type: 'text', required: false },
          { name: 'quantidade', type: 'number', required: true },
          { name: 'valor_unitario', type: 'number', required: true },
          { name: 'valor_bruto', type: 'number', required: false },
          { name: 'valor_desconto', type: 'number', required: false },
          { name: 'valor_frete', type: 'number', required: false },
          { name: 'valor_outras', type: 'number', required: false },
          { name: 'valor_total', type: 'number', required: true },
          // ICMS próprio
          { name: 'origem', type: 'text', required: false },
          { name: 'cst_icms', type: 'text', required: false },
          { name: 'csosn', type: 'text', required: false },
          { name: 'mod_bc_icms', type: 'text', required: false },
          { name: 'reducao_bc_icms', type: 'number', required: false },
          { name: 'base_icms', type: 'number', required: false },
          { name: 'aliquota_icms', type: 'number', required: false },
          { name: 'valor_icms', type: 'number', required: false },
          { name: 'aliquota_fcp', type: 'number', required: false },
          { name: 'valor_fcp', type: 'number', required: false },
          // DIFAL
          { name: 'base_icms_uf_destino', type: 'number', required: false },
          { name: 'aliquota_interna_uf_destino', type: 'number', required: false },
          { name: 'aliquota_interestadual', type: 'number', required: false },
          { name: 'percentual_partilha', type: 'number', required: false },
          { name: 'aliquota_fcp_uf_destino', type: 'number', required: false },
          { name: 'valor_fcp_uf_destino', type: 'number', required: false },
          { name: 'valor_icms_uf_destino', type: 'number', required: false },
          { name: 'valor_icms_uf_remetente', type: 'number', required: false },
          // ST
          { name: 'mod_bc_icms_st', type: 'text', required: false },
          { name: 'mva', type: 'number', required: false },
          { name: 'base_icms_st', type: 'number', required: false },
          { name: 'aliquota_icms_st', type: 'number', required: false },
          { name: 'valor_icms_st', type: 'number', required: false },
          { name: 'valor_fcp_st', type: 'number', required: false },
          // IPI
          { name: 'cst_ipi', type: 'text', required: false },
          { name: 'codigo_enquadramento_ipi', type: 'text', required: false },
          { name: 'base_ipi', type: 'number', required: false },
          { name: 'aliquota_ipi', type: 'number', required: false },
          { name: 'valor_ipi', type: 'number', required: false },
          // PIS/COFINS
          { name: 'cst_pis', type: 'text', required: false },
          { name: 'base_pis', type: 'number', required: false },
          { name: 'aliquota_pis', type: 'number', required: false },
          { name: 'valor_pis', type: 'number', required: false },
          { name: 'cst_cofins', type: 'text', required: false },
          { name: 'base_cofins', type: 'number', required: false },
          { name: 'aliquota_cofins', type: 'number', required: false },
          { name: 'valor_cofins', type: 'number', required: false },
          // Reforma
          { name: 'cst_ibs_cbs', type: 'text', required: false },
          { name: 'c_class_trib', type: 'text', required: false },
          { name: 'base_ibs_cbs', type: 'number', required: false },
          { name: 'aliquota_ibs_uf', type: 'number', required: false },
          { name: 'aliquota_ibs_municipio', type: 'number', required: false },
          { name: 'aliquota_cbs', type: 'number', required: false },
          { name: 'valor_ibs', type: 'number', required: false },
          { name: 'valor_cbs', type: 'number', required: false },
          // Benefício, GTIN, lote
          { name: 'c_benef', type: 'text', required: false },
          { name: 'gtin', type: 'text', required: false },
          { name: 'lote', type: 'text', required: false },
          { name: 'validade', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_doc_itens_documento ON documentos_fiscais_itens (documento_id)',
          'CREATE INDEX idx_doc_itens_produto ON documentos_fiscais_itens (produto_id)',
        ],
      })
      app.save(colItens)
    }
  },
  (app) => {
    try {
      const colItens = app.findCollectionByNameOrId('documentos_fiscais_itens')
      app.delete(colItens)
    } catch (_) {}

    try {
      const colDoc = app.findCollectionByNameOrId('documentos_fiscais')
      app.delete(colDoc)
    } catch (_) {}

    try {
      const configCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      const campo = configCol.fields.getByName('calcular_difal_consumidor_final')
      if (campo) {
        configCol.fields.removeByName('calcular_difal_consumidor_final')
        app.save(configCol)
      }
    } catch (_) {}
  },
)
