// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0067: Backfill executável via Record.set e app.save
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

    for (const colName of colecoes15) {
      try {
        const registros = app.findRecordsByFilter(colName, '', '', 5000, 0)
        for (let i = 0; i < registros.length; i++) {
          const r = registros[i]
          const atual = r.getString('assinante_id')
          if (!atual) {
            r.set('assinante_id', assinanteHomeId)
            app.save(r)
          }
        }
      } catch (err) {
        // ignora se vazio
      }
    }
  },
  (app) => {},
)
