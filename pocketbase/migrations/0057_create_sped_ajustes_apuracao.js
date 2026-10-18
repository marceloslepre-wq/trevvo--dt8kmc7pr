/// <reference path="../types.d.ts" />

/**
 * Migration 0057: Cria tabela sped_ajustes_apuracao.
 * Armazena os ajustes manuais da apuração do ICMS (tabela 5.1.1 da SEFAZ/ES)
 * para escrituração nos registros E111 e composição do E110 do Bloco E.
 *
 * Campos:
 * - empresa_id: relation para empresas
 * - periodo: texto "AAAA-MM"
 * - codigo_ajuste: texto 8 chars (Tabela 5.1.1 da UF da empresa)
 * - descricao: texto explicativo
 * - valor: number (positivo)
 * - criado_por: relation para usuarios
 *
 * Regras de acesso:
 * - Leitura: usuários com acesso ao menu Fiscal / SPED (@request.auth.id != '')
 * - Criar, editar e excluir: apenas Administrador via endpoints backend seguros,
 *   e apenas enquanto o período não possuir arquivo oficial 'Entregue'.
 *   Para garantir a integridade, createRule/updateRule/deleteRule são null no navegador.
 */
migrate(
  (app) => {
    const empresasCol = app.findCollectionByNameOrId('empresas')
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    if (!app.hasTable('sped_ajustes_apuracao')) {
      const col = new Collection({
        name: 'sped_ajustes_apuracao',
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
            name: 'codigo_ajuste',
            type: 'text',
            required: true, // 8 caracteres (Ex: ES000001, ES020005)
          },
          {
            name: 'descricao',
            type: 'text',
            required: true,
          },
          {
            name: 'valor',
            type: 'number',
            required: true,
          },
          {
            name: 'criado_por',
            type: 'relation',
            required: false,
            collectionId: usuariosCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sped_ajustes_empresa ON sped_ajustes_apuracao (empresa_id)',
          'CREATE INDEX idx_sped_ajustes_periodo ON sped_ajustes_apuracao (periodo)',
          'CREATE INDEX idx_sped_ajustes_emp_per ON sped_ajustes_apuracao (empresa_id, periodo)',
        ],
      })

      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sped_ajustes_apuracao')
      app.delete(col)
    } catch (_) {}
  },
)
