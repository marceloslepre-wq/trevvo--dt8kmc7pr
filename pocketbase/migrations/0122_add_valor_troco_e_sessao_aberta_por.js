/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0122 — Campos valor_troco (vendas) e sessao_aberta_por (caixa_sessoes).
 *
 * O hook vendas/finalizar grava venda.set('valor_troco', ...) mas o campo não
 * existia no schema (o set de campo inexistente é ignorado silenciosamente),
 * então o resumo da sessão não tinha como obter o troco da venda e somava o
 * valor bruto do pagamento em dinheiro (R$ 150 numa venda de R$ 100 com troco
 * de R$ 50). Sessão de referência: #O4LYX7 (loja 01).
 *
 * sessao_aberta_por já é gravado pelo hook caixa/abrir — aqui só entra no schema.
 *
 * Idempotente: só cria o campo se não existir. Nenhum dado é alterado — os
 * movimentos de gaveta já estão corretos; a correção do resumo é no hook
 * caixa_resumo.js + fallback src/services/caixa.ts.
 */
migrate(
  (app) => {
    const colVendas = app.findCollectionByNameOrId('vendas')
    if (!colVendas.fields.getByName('valor_troco')) {
      colVendas.fields.add(new NumberField({ name: 'valor_troco' }))
      app.save(colVendas)
      console.log('[0122] Campo vendas.valor_troco criado.')
    }

    const colSessoes = app.findCollectionByNameOrId('caixa_sessoes')
    if (!colSessoes.fields.getByName('sessao_aberta_por')) {
      colSessoes.fields.add(new TextField({ name: 'sessao_aberta_por', max: 200 }))
      app.save(colSessoes)
      console.log('[0122] Campo caixa_sessoes.sessao_aberta_por criado.')
    }
  },
  (app) => {
    const colVendas = app.findCollectionByNameOrId('vendas')
    if (colVendas.fields.getByName('valor_troco')) {
      colVendas.fields.removeByName('valor_troco')
      app.save(colVendas)
    }
    const colSessoes = app.findCollectionByNameOrId('caixa_sessoes')
    if (colSessoes.fields.getByName('sessao_aberta_por')) {
      colSessoes.fields.removeByName('sessao_aberta_por')
      app.save(colSessoes)
    }
  },
)
