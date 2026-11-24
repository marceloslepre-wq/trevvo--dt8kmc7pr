// @ts-check
/// <reference path='../types.d.ts' />

/**
 * Migration 0145: rebaixa (bonificação do fornecedor) no custo do produto
 *
 * - rebaixa_percentual: % de desconto/bonificação recebida do fornecedor que é repassada ao custo
 *   gerencial do produto. Entra no Custo Final (custo × (1 - rebaixa%) × (1 + outras despesas%)),
 *   que é a base da margem e do preço de venda. Não altera o custo médio do estoque nem notas fiscais.
 * Idempotente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    if (!col.fields.getByName('rebaixa_percentual')) {
      col.fields.add(
        new NumberField({ name: 'rebaixa_percentual', required: false, min: 0, max: 100 }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const f = col.fields.getByName('rebaixa_percentual')
    if (f) {
      col.fields.removeById(f.id)
      app.save(col)
    }
  },
)
