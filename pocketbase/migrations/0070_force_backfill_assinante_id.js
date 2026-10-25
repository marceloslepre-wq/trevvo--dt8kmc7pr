// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0070: Forçar backfill de assinante_id via UPDATE SQL direto com id do assinante HOSPITAL HOME
 */
migrate(
  (app) => {
    const assinanteHomeId = 'wqxiw7olvkup3sm'
    const colecoes15 = [
      'produtos',
      'clientes',
      'fornecedores',
      'marcas',
      'grupos',
      'categorias',
      'condicoes_pagamento',
      'plano_contas',
      'centros_custo',
      'formas_pagamento',
      'perfis_tributarios',
      'regras_fiscais_ncm',
      'configuracoes',
      'relatorios_filtros_salvos',
      'relatorios_salvos',
    ]

    for (let i = 0; i < colecoes15.length; i++) {
      const colName = colecoes15[i]
      try {
        app.db().newQuery(`UPDATE ${colName} SET assinante_id = '${assinanteHomeId}'`).execute()
      } catch (err) {
        console.warn(`[0070] Falha ao atualizar ${colName}:`, err)
      }
    }
  },
  (app) => {},
)
