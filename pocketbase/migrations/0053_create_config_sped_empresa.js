/// <reference path="../types.d.ts" />

/**
 * Migration 0053: Cria tabela config_sped_empresa.
 * Armazena a parametrização do SPED Fiscal (EFD ICMS/IPI) por empresa/estabelecimento.
 *
 * Regras de acesso:
 * - Leitura: usuários autenticados com acesso ao menu Fiscal (@request.auth.id != '')
 * - Criação e edição: administradores (@request.auth.id != '')
 */
migrate(
  (app) => {
    const empresasCol = app.findCollectionByNameOrId('empresas')

    if (!app.hasTable('config_sped_empresa')) {
      const col = new Collection({
        name: 'config_sped_empresa',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
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
            name: 'versao_leiaute',
            type: 'text',
            required: false,
          },
          {
            name: 'codigo_receita_icms',
            type: 'text',
            required: false,
          },
          {
            name: 'dia_vencimento_icms',
            type: 'number',
            required: false,
            min: 1,
            max: 31,
          },
          {
            name: 'periodo_saldo_inicial',
            type: 'text',
            required: false,
          },
          {
            name: 'saldo_credor_inicial',
            type: 'number',
            required: false,
          },
          {
            name: 'mes_bloco_h',
            type: 'number',
            required: false,
            min: 1,
            max: 12,
          },
          {
            name: 'conta_contabil_estoque',
            type: 'text',
            required: false,
          },
          {
            name: 'gerar_bloco_k',
            type: 'bool',
            required: false,
          },
          {
            name: 'incluir_homologacao_em_teste',
            type: 'bool',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_config_sped_empresa_uid ON config_sped_empresa (empresa_id)',
        ],
      })

      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('config_sped_empresa')
      app.delete(col)
    } catch (_) {}
  },
)
