/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0119 — Feature "Reposição do dia" (multi-tenant)
 * - config_vendas_empresa: permitir_estoque_negativo (bool) + empresa_reposicao_id (relation → empresas)
 * - transferencias: tipo_reposicao_data (text, "YYYY-MM-DD") — marca reposições e protege duplicidade
 * - Seed idempotente: APENAS Hospital Home (assinante wqxiw7olvkup3sm) — loja 01 (código 3)
 *   recebe permitir_estoque_negativo = true e empresa_reposicao_id = loja 02 (código 2).
 */
migrate(
  (app) => {
    // 1) Campos na config de vendas por empresa
    const col = app.findCollectionByNameOrId('config_vendas_empresa')

    if (!col.fields.getByName('permitir_estoque_negativo')) {
      col.fields.add(new BoolField({ name: 'permitir_estoque_negativo' }))
    }

    if (!col.fields.getByName('empresa_reposicao_id')) {
      col.fields.add(
        new RelationField({
          name: 'empresa_reposicao_id',
          collectionId: app.findCollectionByNameOrId('empresas').id,
          maxSelect: 1,
        }),
      )
    }

    app.save(col)

    // 2) Indicador de reposição na transferência
    const colTr = app.findCollectionByNameOrId('transferencias')
    if (!colTr.fields.getByName('tipo_reposicao_data')) {
      colTr.fields.add(new TextField({ name: 'tipo_reposicao_data', max: 10 }))
    }
    app.save(colTr)

    // 3) Seed idempotente — somente Hospital Home, somente loja 01 (código 3)
    try {
      const hhEmpresas = app.findRecordsByFilter(
        'empresas',
        "assinante_id = 'wqxiw7olvkup3sm' && ativo = true",
        'codigo',
        20,
        0,
      )

      let loja02Id = ''
      for (let i = 0; i < hhEmpresas.length; i++) {
        if (hhEmpresas[i].getInt('codigo') === 2) {
          loja02Id = hhEmpresas[i].id
          break
        }
      }

      for (let i = 0; i < hhEmpresas.length; i++) {
        const emp = hhEmpresas[i]
        if (emp.getInt('codigo') !== 3) continue

        let cfg = null
        try {
          cfg = app.findFirstRecordByFilter(
            'config_vendas_empresa',
            "empresa_id = '" + emp.id + "'",
          )
        } catch (_) {}

        if (!cfg) {
          const cfgCol = app.findCollectionByNameOrId('config_vendas_empresa')
          cfg = new Record(cfgCol)
          cfg.set('empresa_id', emp.id)
          cfg.set('ativo', true)
        }

        cfg.set('permitir_estoque_negativo', true)
        if (loja02Id) {
          cfg.set('empresa_reposicao_id', loja02Id)
        }
        app.save(cfg)
      }
    } catch (err) {
      console.error('[0119] Erro no seed Hospital Home:', err)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('config_vendas_empresa')
    if (col.fields.getByName('permitir_estoque_negativo'))
      col.fields.removeByName('permitir_estoque_negativo')
    if (col.fields.getByName('empresa_reposicao_id'))
      col.fields.removeByName('empresa_reposicao_id')
    app.save(col)

    const colTr = app.findCollectionByNameOrId('transferencias')
    if (colTr.fields.getByName('tipo_reposicao_data'))
      colTr.fields.removeByName('tipo_reposicao_data')
    app.save(colTr)
  },
)
