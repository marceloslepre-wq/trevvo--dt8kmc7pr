// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0060: Índices compostos de performance para relatórios da Etapa 8
 * Cria índices em empresa_id + campos de data consultados frequentemente:
 * - vendas (empresa_id, data_emissao)
 * - documentos_fiscais (empresa_id, data_emissao)
 * - estoque_movimentos (empresa_id, data_movimento)
 * - contas_pagar (empresa_id, data_vencimento)
 * - contas_pagar (empresa_id, data_emissao)
 * - contas_receber (empresa_id, data_vencimento)
 * - contas_receber (empresa_id, data_emissao)
 */

migrate(
  (app) => {
    function tryCreateIndex(collectionName, indexSql) {
      try {
        const col = app.findCollectionByNameOrId(collectionName)
        if (!col) return
        const existingIndexes = col.indexes || []
        const indexNameMatch = indexSql.match(
          /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i,
        )
        const indexName = indexNameMatch ? indexNameMatch[1] : null

        if (indexName) {
          const alreadyExists = existingIndexes.some((idx) => idx.includes(indexName))
          if (alreadyExists) return
        }

        col.indexes = [...existingIndexes, indexSql]
        app.save(col)
      } catch (err) {
        console.warn(`Aviso ao criar índice em ${collectionName}:`, err)
      }
    }

    tryCreateIndex(
      'vendas',
      'CREATE INDEX idx_vendas_empresa_data_emissao ON vendas (empresa_id, data_emissao)',
    )
    tryCreateIndex(
      'documentos_fiscais',
      'CREATE INDEX idx_doc_fiscais_empresa_emissao ON documentos_fiscais (empresa_id, data_emissao)',
    )
    tryCreateIndex(
      'estoque_movimentos',
      'CREATE INDEX idx_est_mov_empresa_data ON estoque_movimentos (empresa_id, data_movimento)',
    )
    tryCreateIndex(
      'contas_pagar',
      'CREATE INDEX idx_cp_empresa_vencimento ON contas_pagar (empresa_id, data_vencimento)',
    )
    tryCreateIndex(
      'contas_pagar',
      'CREATE INDEX idx_cp_empresa_emissao ON contas_pagar (empresa_id, data_emissao)',
    )
    tryCreateIndex(
      'contas_receber',
      'CREATE INDEX idx_cr_empresa_vencimento ON contas_receber (empresa_id, data_vencimento)',
    )
    tryCreateIndex(
      'contas_receber',
      'CREATE INDEX idx_cr_empresa_emissao ON contas_receber (empresa_id, data_emissao)',
    )
  },
  (app) => {
    // Reversão opcional (não remove índices para não degradar performance caso rollback)
  },
)
