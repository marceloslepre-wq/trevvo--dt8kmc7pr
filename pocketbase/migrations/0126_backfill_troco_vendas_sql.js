/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0126 — Backfill de troco retroativo (2ª tentativa; 0124 e 0125
 * rodaram sem casar nenhuma venda).
 *
 * Causa raiz: a 0124 usava findRecordsByFilter com "valor_troco = 0" na
 * coleção vendas — no parser de filtros do PocketBase, comparação numérica
 * com 0 não casa registros (0 é tratado como vazio). Nenhuma venda foi
 * encontrada e a migration "aplicou" sem efeito algum.
 *
 * Correção aqui: a seleção NÃO filtra por valor_troco — pega todas as vendas
 * Finalizadas + ativas e checa o zero em JS (getFloat). O resto da regra é o
 * mesmo da 0124: soma dos pagamentos ativos MAIOR que valor_total →
 * diferença gravada em vendas.valor_troco e na PRIMEIRA linha de pagamento
 * em Dinheiro (vendas_pagamentos.troco). Vendas sem excesso de pagamento não
 * são tocadas.
 *
 * Idempotente: só grava quando soma > valor_total && valor_troco = 0; rodar
 * de novo não muda nada. Escopo: SOMENTE vendas.valor_troco e
 * vendas_pagamentos.troco — nada em movimentacoes_financeiras, caixa,
 * estoque, títulos ou NF-e. Filtrado por assinante via empresas.assinante_id.
 */
migrate(
  (app) => {
    const colVendas = app.findCollectionByNameOrId('vendas')
    if (!colVendas.fields.getByName('valor_troco')) {
      throw new Error('vendas.valor_troco não existe — rode a migration 0122 antes desta.')
    }

    // Assinante por empresa (evita expand em goja)
    const assinantePorEmpresa = {}
    const empresas = app.findRecordsByFilter('empresas', "assinante_id != ''", 'created', 0, 0)
    for (let e = 0; e < empresas.length; e++) {
      assinantePorEmpresa[empresas[e].id] = empresas[e].getString('assinante_id')
    }

    // Formas de pagamento em dinheiro por assinante (tipo, código e descrição)
    const dinheiroIdPorAssinante = {}
    let formas = []
    try {
      formas = app.findRecordsByFilter('formas_pagamento', 'ativo = true', 'created', 0, 0)
    } catch (err) {
      console.log('[0126] filtro ativo=true em formas_pagamento falhou, listando todas: ' + err)
      formas = app.findRecordsByFilter('formas_pagamento', '', 'created', 0, 0)
    }
    for (let f = 0; f < formas.length; f++) {
      const fm = formas[f]
      const isDinheiro =
        fm.getString('tipo') === 'Dinheiro' ||
        fm.getString('codigo_tpag') === '01' ||
        (fm.getString('descricao') || '').toLowerCase().indexOf('dinheiro') !== -1
      if (!isDinheiro) continue
      const assId = fm.getString('assinante_id')
      if (!dinheiroIdPorAssinante[assId]) dinheiroIdPorAssinante[assId] = []
      dinheiroIdPorAssinante[assId].push(fm.id)
    }

    // Sem filtro por valor_troco (é o que não casa no PocketBase): seleção
    // ampla e checagem do zero em JS.
    const candidatas = app.findRecordsByFilter(
      'vendas',
      "status = 'Finalizada' && ativo = true",
      'created',
      0,
      0,
    )

    let corrigidas = 0
    for (let i = 0; i < candidatas.length; i++) {
      const venda = candidatas[i]
      const valorTrocoAtual = venda.getFloat('valor_troco') || 0
      if (valorTrocoAtual !== 0) continue // já tem troco gravado: não mexe

      const vendaId = venda.id
      const valorTotal = venda.getFloat('valor_total') || 0

      const pags = app.findRecordsByFilter(
        'vendas_pagamentos',
        `venda_id = '${vendaId}' && ativo = true`,
        'created',
        0,
        0,
      )
      if (!pags || pags.length === 0) continue

      let somaPagamentos = 0
      let primeiraDinheiro = null
      const assId = assinantePorEmpresa[venda.getString('empresa_id')] || ''
      const idsDinheiro = dinheiroIdPorAssinante[assId] || []
      for (let p = 0; p < pags.length; p++) {
        const pg = pags[p]
        somaPagamentos += pg.getFloat('valor') || 0
        if (
          primeiraDinheiro === null &&
          idsDinheiro.indexOf(pg.getString('forma_pagamento_id')) !== -1
        ) {
          primeiraDinheiro = pg
        }
      }

      const troco = Math.round((somaPagamentos - valorTotal) * 100) / 100
      if (troco <= 0) continue // soma de pagamentos não excede o total: não mexe

      venda.set('valor_troco', troco)
      app.save(venda)
      if (primeiraDinheiro !== null) {
        primeiraDinheiro.set('troco', troco)
        app.save(primeiraDinheiro)
      }
      corrigidas++
      console.log(
        `[0126] Venda ${vendaId} (nº ${venda.getString('numero')}): troco ${troco} gravado em valor_troco e na linha Dinheiro.`,
      )
    }
    console.log(`[0126] Backfill concluído: ${corrigidas} venda(s) corrigida(s).`)
  },
  (app) => {
    // Revert: zera apenas os trocos retroativos gravados por esta migração.
    const vendas = app.findRecordsByFilter(
      'vendas',
      "status = 'Finalizada' && ativo = true",
      'created',
      0,
      0,
    )
    for (let i = 0; i < vendas.length; i++) {
      const venda = vendas[i]
      if ((venda.getFloat('valor_troco') || 0) <= 0) continue
      venda.set('valor_troco', 0)
      app.save(venda)
      const pags = app.findRecordsByFilter(
        'vendas_pagamentos',
        `venda_id = '${venda.id}' && ativo = true && troco > 0`,
        'created',
        0,
        0,
      )
      for (let p = 0; p < pags.length; p++) {
        pags[p].set('troco', 0)
        app.save(pags[p])
      }
    }
  },
)
