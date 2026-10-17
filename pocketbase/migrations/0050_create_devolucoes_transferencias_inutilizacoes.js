/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('users')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    // 1. Campo quantidade_devolvida em notas_entrada_itens
    if (app.hasTable('notas_entrada_itens')) {
      const colItens = app.findCollectionByNameOrId('notas_entrada_itens')
      if (!colItens.fields.getByName('quantidade_devolvida')) {
        colItens.fields.add(
          new NumberField({
            name: 'quantidade_devolvida',
            required: false,
          }),
        )
        app.save(colItens)
      }
    }

    // 2. Campo transferencia_id e opção 'Transferência' em origem na documentos_fiscais
    if (app.hasTable('documentos_fiscais')) {
      const docCol = app.findCollectionByNameOrId('documentos_fiscais')
      let saveDoc = false

      if (!docCol.fields.getByName('transferencia_id')) {
        docCol.fields.add(
          new TextField({
            name: 'transferencia_id',
            required: false,
          }),
        )
        saveDoc = true
      }

      // Adicionar 'Transferência' nas opções de origem
      const campoOrigem = docCol.fields.getByName('origem')
      if (campoOrigem && campoOrigem.type === 'select') {
        const valoresOrigem = campoOrigem.values || []
        if (!valoresOrigem.includes('Transferência')) {
          valoresOrigem.push('Transferência')
          campoOrigem.values = valoresOrigem
          saveDoc = true
        }
      }

      if (saveDoc) {
        app.save(docCol)
      }
    }

    // 3. Campos emitir_nfe_ao_enviar_transferencia e natureza_operacao_transferencia em config_emissao_fiscal
    if (app.hasTable('config_emissao_fiscal')) {
      const cfgCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      let saveCfg = false

      if (!cfgCol.fields.getByName('emitir_nfe_ao_enviar_transferencia')) {
        cfgCol.fields.add(
          new BoolField({
            name: 'emitir_nfe_ao_enviar_transferencia',
            required: false,
          }),
        )
        saveCfg = true
      }

      if (!cfgCol.fields.getByName('natureza_operacao_transferencia')) {
        cfgCol.fields.add(
          new TextField({
            name: 'natureza_operacao_transferencia',
            required: false,
          }),
        )
        saveCfg = true
      }

      if (saveCfg) {
        app.save(cfgCol)
      }
    }

    // 4. Criação da tabela inutilizacoes
    if (!app.hasTable('inutilizacoes')) {
      const colInut = new Collection({
        name: 'inutilizacoes',
        type: 'base',
        // Leitura para usuários autenticados
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Gravação exclusiva no backend ou por usuários autenticados
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
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
            name: 'serie',
            type: 'text',
            required: true,
          },
          {
            name: 'numero_inicial',
            type: 'number',
            required: true,
          },
          {
            name: 'numero_final',
            type: 'number',
            required: true,
          },
          {
            name: 'justificativa',
            type: 'text',
            required: true,
          },
          {
            name: 'status',
            type: 'text',
            required: false,
          },
          {
            name: 'protocolo',
            type: 'text',
            required: false,
          },
          {
            name: 'mensagem_sefaz',
            type: 'text',
            required: false,
          },
          {
            name: 'xml_arquivo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['text/xml', 'application/xml'],
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'data_inutilizacao',
            type: 'text',
            required: false,
          },
          {
            name: 'ativo',
            type: 'bool',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_inutilizacoes_empresa ON inutilizacoes (empresa_id)',
          'CREATE INDEX idx_inutilizacoes_modelo_serie ON inutilizacoes (modelo, serie)',
          'CREATE INDEX idx_inutilizacoes_data ON inutilizacoes (data_inutilizacao)',
        ],
      })

      app.save(colInut)
    }
  },
  (app) => {
    try {
      const colInut = app.findCollectionByNameOrId('inutilizacoes')
      app.delete(colInut)
    } catch (_) {}

    try {
      const cfgCol = app.findCollectionByNameOrId('config_emissao_fiscal')
      if (cfgCol.fields.getByName('emitir_nfe_ao_enviar_transferencia')) {
        cfgCol.fields.removeByName('emitir_nfe_ao_enviar_transferencia')
      }
      if (cfgCol.fields.getByName('natureza_operacao_transferencia')) {
        cfgCol.fields.removeByName('natureza_operacao_transferencia')
      }
      app.save(cfgCol)
    } catch (_) {}

    try {
      const docCol = app.findCollectionByNameOrId('documentos_fiscais')
      if (docCol.fields.getByName('transferencia_id')) {
        docCol.fields.removeByName('transferencia_id')
      }
      app.save(docCol)
    } catch (_) {}

    try {
      const colItens = app.findCollectionByNameOrId('notas_entrada_itens')
      if (colItens.fields.getByName('quantidade_devolvida')) {
        colItens.fields.removeByName('quantidade_devolvida')
      }
      app.save(colItens)
    } catch (_) {}
  },
)
