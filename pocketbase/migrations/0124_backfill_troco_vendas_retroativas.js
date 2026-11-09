/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0124 — Backfill de troco retroativo: vendas.valor_troco e
 * vendas_pagamentos.troco para vendas gravadas ANTES da v0.0.261.
 *
 * A partir da v0.0.261 o resumo da sessão soma o líquido por forma de
 * pagamento (valor recebido − troco). Vendas antigas não têm troco gravado:
 * o resumo soma o bruto e o "esperado na gaveta" estoura. Referência: venda
 * #7 da sessão #O4LYX7 (loja 01, empresa 3teuj5yxh5odfio, assinante
 * wqxiw7olvkup3sm) — Dinheiro R$ 150 numa venda de R$ 100, troco R$ 50.
 *
 * Regra (idempotente):
 *  - venda ATIVA com status 'Finalizada';
 *  - soma dos pagamentos ativos da venda MAIOR que vendas.valor_total;
 *  - a diferença (soma − valor_total) é o troco → gravada em
 *    vendas.valor_troco (0122) e na PRIMEIRA linha de pagamento 'Dinheiro'
 *    (vendas_pagamentos.troco); linhas seguintes não são duplicadas;
 *  - vendas cuja soma não excede o valor_total e vendas já com valor_troco
 *    não são tocadas (rodar de novo não muda nada).
 *
 * Escopo: SOMENTE vendas.valor_troco e vendas_pagamentos.troco — nada em
 * movimentacoes_financeiras, caixa_movimentos, estoque, títulos ou NF-e.
 * Filtrado por assinante: empresas.assinante_id da venda.
 */
migrate(
  (app) => {
    const colVendas = app.findCollectionByNameOrId('vendas')
    if (!colVendas.fields.getByName('valor_troco')) {
      throw new Error('vendas.valor_troco não existe — rode a migration 0122 antes desta.')
    }

    // Assinante por empresa (evita expand em goja)
    const assinantePorEmpresa = {}
    const empresas = app.findRecordsByFilter('empresas', "assinante_id != ''", '')
    for (let e = 0; e < empresas.length; e++) {
      assinantePorEmpresa[empresas[e].id] = empresas[e].getString('assinante_id')
    }
    // Formas de pagamento em dinheiro por assinante (tipo, código e descrição)
    const dinheiroIdPorAssinante = {}
    const formas = app.findRecordsByFilter('formas_pagamento', 'ativo = true', '')
    for (let f = 0; f < formas.length; f++) {
      const fm = formas[f]
      const isDinheiro =
        fm.getString('tipo') === 'Dinheiro' ||
        fm.getString('codigo_tpag') === '01' ||
        fm.getString('descricao').toLowerCase().includes('dinheiro')
      if (!isDinheiro) continue
      const assId = fm.getString('assinante_id')
      if (!dinheiroIdPorAssinante[assId]) dinheiroIdPorAssinante[assId] = []
      dinheiroIdPorAssinante[assId].push(fm.id)
    }

    const vendas = app.findRecordsByFilter(
      'vendas',
      "status = 'Finalizada' && ativo = true && valor_troco = 0",
      '',
    )
    let corrigidas = 0
    for (let i = 0; i < vendas.length; i++) {
      const venda = vendas[i]
      const vendaId = venda.id
      const valorTotal = Number(venda.getFloat('valor_total') || 0)

      let pags
      try {
        pags = $app.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${vendaId}' && ativo = true`,
          '',
        )
      } catch (_) {
        continue
      }
      if (!pags || pags.length === 0) continue

      let somaPagamentos = 0
      let primeiraDinheiro = null
      const empresaId = venda.getString('empresa_id')
      const assId = assinantePorEmpresa[empresaId] || ''
      const idsDinheiro = dinheiroIdPorAssinante[assId] || []
      for (let p = 0; p < pags.length; p++) {
        const pg = pags[p]
        somaPagamentos += Number(pg.getFloat('valor') || 0)
        if (
          primeiraDinheiro === null &&
          idsDinheiro.indexOf(pg.getString('forma_pagamento_id')) !== -1
        ) {
          primeiraDinheiro = pg
        }
      }

      const troco = Number((somaPagamentos - valorTotal).toFixed(2))
      if (troco <= 0) continue // soma de pagamentos não excede o total: não mexe

      venda.set('valor_troco', troco)
      $app.save(venda)
      if (primeiraDinheiro !== null) {
        primeiraDinheiro.set('troco', troco)
        $app.save(primeiraDinheiro)
      }
      corrigidas++
      console.log(
        `[0124] Venda ${vendaId} (nº ${venda.getString('numero')}): troco ${troco} gravado em valor_troco e na linha Dinheiro.`,
      )
    }
    console.log(`[0124] Backfill concluído: ${corrigidas} venda(s) corrigida(s).`)
  },
  (app) => {
    // Revert: zera apenas os trocos retroativos gravados por esta migration.
    const vendas = app.findRecordsByFilter('vendas', "status = 'Finalizada' && ativo = true", '')
    for (let i = 0; i < vendas.length; i++) {
      const venda = vendas[i]
      if (Number(venda.getFloat('valor_troco') || 0) <= 0) continue
      venda.set('valor_troco', 0)
      $app.save(venda)
      let pags
      try {
        pags = $app.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${venda.id}' && ativo = true && troco > 0`,
          '',
        )
      } catch (_) {
        continue
      }
      for (let p = 0; p < pags.length; p++) {
        pags[p].set('troco', 0)
        $app.save(pags[p])
      }
    }
  },
)
