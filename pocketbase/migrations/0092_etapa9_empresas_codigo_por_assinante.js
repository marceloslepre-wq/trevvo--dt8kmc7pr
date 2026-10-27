// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0092: Etapa 9 Multi-tenant (Ajuste de Unicidade de Empresas por Assinante)
 *
 * Remove o índice único global `idx_empresas_codigo` da coleção `empresas`
 * e cria em seu lugar o índice único composto `idx_empresas_assinante_codigo` (assinante_id, codigo),
 * pois a numeração de código de empresas é por assinante (sequencias gera codigo_empresas por assinante).
 *
 * Idempotente:
 * - Só remove `idx_empresas_codigo` se ele existir.
 * - Só cria `idx_empresas_assinante_codigo` se ainda não existir.
 * - Não altera dados, registros ou campos.
 * - Índices globais como idx_empresas_cnpj permanecem intocados.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('empresas')

    // 1. Remover o índice único global idx_empresas_codigo se existir
    const idxs = col.indexes || []
    const idxsFiltrados = idxs.filter((i) => !i.includes('idx_empresas_codigo'))

    let alterado = false
    if (idxsFiltrados.length !== idxs.length) {
      col.indexes = idxsFiltrados
      alterado = true
    }

    // 2. Adicionar o índice único composto idx_empresas_assinante_codigo se não existir
    const existeComposto = col.indexes.some((i) => i.includes('idx_empresas_assinante_codigo'))
    if (!existeComposto) {
      col.indexes.push(
        'CREATE UNIQUE INDEX idx_empresas_assinante_codigo ON empresas (assinante_id, codigo)',
      )
      alterado = true
    }

    if (alterado) {
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('empresas')
    const idxs = col.indexes || []
    const idxsFiltrados = idxs.filter((i) => !i.includes('idx_empresas_assinante_codigo'))

    let alterado = false
    if (idxsFiltrados.length !== idxs.length) {
      col.indexes = idxsFiltrados
      alterado = true
    }

    const existeGlobal = col.indexes.some((i) => i.includes('idx_empresas_codigo'))
    if (!existeGlobal) {
      col.indexes.push('CREATE UNIQUE INDEX idx_empresas_codigo ON empresas (codigo)')
      alterado = true
    }

    if (alterado) {
      app.save(col)
    }
  },
)
