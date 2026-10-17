/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('users')

    // 1. Criar tabela intermediadores
    // Controlada por permissão notas_saida no frontend; leitura e gravação por usuários autenticados
    if (!app.hasTable('intermediadores')) {
      const colIntermediadores = new Collection({
        name: 'intermediadores',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'nome',
            type: 'text',
            required: true,
          },
          {
            name: 'cnpj',
            type: 'text',
            required: true,
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
          'CREATE INDEX idx_intermediadores_nome ON intermediadores (nome)',
          'CREATE INDEX idx_intermediadores_cnpj ON intermediadores (cnpj)',
          'CREATE INDEX idx_intermediadores_ativo ON intermediadores (ativo)',
        ],
      })
      app.save(colIntermediadores)

      // Carga inicial comum de intermediadores
      const intermediadoresIniciais = [
        { nome: 'Mercado Livre', cnpj: '03007331000141', ativo: true },
        { nome: 'Shopee', cnpj: '35635824000104', ativo: true },
        { nome: 'Amazon Marketplace', cnpj: '15436940000103', ativo: true },
        { nome: 'Magazine Luiza (Magalu)', cnpj: '47960950000121', ativo: true },
      ]

      for (let i = 0; i < intermediadoresIniciais.length; i++) {
        const item = intermediadoresIniciais[i]
        const rec = new Record(colIntermediadores)
        rec.set('nome', item.nome)
        rec.set('cnpj', item.cnpj)
        rec.set('ativo', item.ativo)
        app.save(rec)
      }
    }

    // 2. Criar tabela documentos_fiscais_cartas (CC-e)
    // Registro de Cartas de Correção da NF-e vinculadas a documentos_fiscais
    if (!app.hasTable('documentos_fiscais_cartas')) {
      const docCol = app.findCollectionByNameOrId('documentos_fiscais')
      const colCartas = new Collection({
        name: 'documentos_fiscais_cartas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null, // Gravação exclusiva pelo backend
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'documento_id',
            type: 'relation',
            required: true,
            collectionId: docCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'sequencia',
            type: 'number',
            required: true,
          },
          {
            name: 'texto',
            type: 'text',
            required: true,
          },
          {
            name: 'data',
            type: 'text',
            required: true,
          },
          {
            name: 'status',
            type: 'text',
            required: true,
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
            name: 'pdf_arquivo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf'],
          },
          {
            name: 'pdf_url',
            type: 'text',
            required: false,
          },
          {
            name: 'usuario_id',
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
          'CREATE INDEX idx_doc_cartas_documento ON documentos_fiscais_cartas (documento_id)',
          'CREATE INDEX idx_doc_cartas_data ON documentos_fiscais_cartas (data)',
        ],
      })
      app.save(colCartas)
    }
  },
  (app) => {
    try {
      const colCartas = app.findCollectionByNameOrId('documentos_fiscais_cartas')
      app.delete(colCartas)
    } catch (_) {}

    try {
      const colInter = app.findCollectionByNameOrId('intermediadores')
      app.delete(colInter)
    } catch (_) {}
  },
)
