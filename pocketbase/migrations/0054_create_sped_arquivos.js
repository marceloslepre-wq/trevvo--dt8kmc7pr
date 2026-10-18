/// <reference path="../types.d.ts" />

/**
 * Migration 0054: Cria tabela sped_arquivos.
 * Registra arquivos gerados da EFD ICMS/IPI com status, resumo da apuração,
 * contagem de registros por bloco e validações.
 *
 * Regras de acesso:
 * - Leitura: usuários autenticados da empresa (@request.auth.id != '')
 * - Criação e alteração: bloqueados no navegador (createRule: null, updateRule: null, deleteRule: null);
 *   feitas 100% pelo backend, exceto marcar como Entregue via endpoint /backend/v1/sped/marcar-entregue.
 */
migrate(
  (app) => {
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    if (!app.hasTable('sped_arquivos')) {
      const col = new Collection({
        name: 'sped_arquivos',
        type: 'base',
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
            name: 'periodo',
            type: 'text',
            required: true, // Formato AAAA-MM
          },
          {
            name: 'finalidade',
            type: 'select',
            required: true,
            values: ['0', '1'], // 0 original, 1 retificadora
            maxSelect: 1,
          },
          {
            name: 'modo',
            type: 'select',
            required: true,
            values: ['Oficial', 'Teste'],
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Gerando', 'Gerado', 'Gerado com erros', 'Erro', 'Substituído', 'Entregue'],
            maxSelect: 1,
          },
          {
            name: 'arquivo',
            type: 'file',
            required: false,
            maxSelect: 1,
            maxSize: 52428800, // 50MB
            mimeTypes: ['text/plain'],
          },
          {
            name: 'nome_arquivo',
            type: 'text',
            required: false,
          },
          {
            name: 'quantidade_linhas',
            type: 'number',
            required: false,
          },
          {
            name: 'contagem_registros',
            type: 'json',
            required: false,
          },
          {
            name: 'resumo_apuracao',
            type: 'json',
            required: false,
          },
          {
            name: 'validacoes',
            type: 'json',
            required: false,
          },
          {
            name: 'gerado_por',
            type: 'relation',
            required: false,
            collectionId: usuariosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'entregue_em',
            type: 'date',
            required: false,
          },
          {
            name: 'recibo_entrega',
            type: 'text',
            required: false,
          },
          {
            name: 'observacoes',
            type: 'text',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sped_arquivos_empresa ON sped_arquivos (empresa_id)',
          'CREATE INDEX idx_sped_arquivos_periodo ON sped_arquivos (periodo)',
          'CREATE INDEX idx_sped_arquivos_status ON sped_arquivos (status)',
          'CREATE INDEX idx_sped_arquivos_modo ON sped_arquivos (modo)',
        ],
      })

      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sped_arquivos')
      app.delete(col)
    } catch (_) {}
  },
)
