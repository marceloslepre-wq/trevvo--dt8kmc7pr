/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0130 — Corrige CST/base/ICMS dos itens de NFC-e tributadas (modelo 65).
 *
 * Auditoria do Livro de saídas (loja 01, nov/2026): os itens backfillados pela
 * 0128 ficaram com cst_icms = '40' (2 DÍGITOS, sem a origem na frente), base_icms
 * e valor_icms zerados — inclusive nas NFC-e 1, 2 e 3, cujo cabeçalho AUTORIZADO
 * tem base_icms 100 e valor_icms 17 cada (alíquota 17%). A migration 0129 não
 * corrigiu nada porque só casa assinatura de 3 ou 4 dígitos ('040'/'0400') e os
 * itens reais têm '40' com 2 dígitos.
 *
 * Fonte de verdade = nota autorizada: para cada item com assinatura do fallback
 * (situação 40/41 — tolerando 2, 3 ou 4 dígitos — e base/ICMS zerados) em
 * documento 65 Autorizada com ICMS no cabeçalho, grava os valores do item
 * correspondente no json_enviado; quando o JSON não traz o grupo de ICMS do item,
 * deriva do cabeçalho autorizado (somente quando o documento tem 1 item).
 * cst_icms gravado com 2 dígitos ('00'), MESMO formato que a NF-e 55 grava e que
 * fiscal_relatorio_livro_saidas.js e sped_gerar.js leem (o SPED monta o CST final
 * como origem + CST; o livro exibe o CST de 2 dígitos).
 *
 * Idempotente: itens com base_icms ou valor_icms já preenchidos são ignorados;
 * NFC-e isentas (cabeçalho sem ICMS, ex. nº 4) continuam CST 40/base 0.
 */
migrate(
  (app) => {
    function round2(v) {
      return Math.round((Number(v) || 0) * 100) / 100
    }
    function soDigitos(v) {
      return String(v === null || v === undefined ? '' : v).replace(/\D/g, '')
    }

    let docsAnalisados = 0
    let itensCorrigidos = 0

    const docs = app.findRecordsByFilter(
      'documentos_fiscais',
      "modelo = '65' && status = 'Autorizada'",
      'created',
      0,
      0,
    )

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      const bcDoc = round2(doc.getFloat('base_icms') || 0)
      const vIcmsDoc = round2(doc.getFloat('valor_icms') || 0)

      let itens = []
      try {
        itens = app.findRecordsByFilter(
          'documentos_fiscais_itens',
          `documento_id = '${doc.id}'`,
          'item,created',
          0,
          0,
        )
      } catch (_) {
        itens = []
      }
      if (!itens || itens.length === 0) continue
      docsAnalisados++

      // Fonte de verdade preferencial: JSON da nota enviado/autorizado
      let itensJson = null
      try {
        const rawJson = doc.getString('json_enviado') || ''
        if (rawJson) {
          const j = JSON.parse(rawJson)
          if (j && j.items && j.items.length > 0) itensJson = j.items
        }
      } catch (_) {
        itensJson = null
      }

      for (let jIdx = 0; jIdx < itens.length; jIdx++) {
        const it = itens[jIdx]
        const baseIt = round2(it.getFloat('base_icms') || 0)
        const vIcmsIt = round2(it.getFloat('valor_icms') || 0)

        // Item já tributado (ou correção já aplicada): idempotente
        if (baseIt > 0 || vIcmsIt > 0) continue

        // Assinatura do fallback: situação isenta/não tributada (tolera 2/3/4 dígitos)
        const cstDigitos = soDigitos(it.getString('cst_icms'))
        const situacao = cstDigitos.length >= 2 ? cstDigitos.slice(-2) : cstDigitos
        const ehIsentaFallback = situacao === '40' || situacao === '41' || situacao === ''
        if (!ehIsentaFallback) continue

        // 1) Valores do item no json_enviado autorizado
        let novoCst = ''
        let novaBase = 0
        let novoIcms = 0
        let novaAliq = 0
        let novoModBc = ''
        if (itensJson) {
          const numItem = it.getInt('item') || jIdx + 1
          for (let k = 0; k < itensJson.length; k++) {
            const ij = itensJson[k]
            if (Number(ij.numero_item || 0) === numItem) {
              const bcJson = round2(Number(ij.icms_base_calculo || 0))
              const icJson = round2(Number(ij.icms_valor || 0))
              const alJson = round2(Number(ij.icms_aliquota || 0))
              if (bcJson > 0 || icJson > 0) {
                const sitJson = soDigitos(ij.icms_situacao_tributaria || '')
                novoCst = sitJson ? (sitJson.length >= 2 ? sitJson.slice(-2) : '0' + sitJson) : '00'
                novaBase = bcJson
                novoIcms = icJson
                novaAliq = alJson > 0 ? alJson : bcJson > 0 ? round2((icJson / bcJson) * 100) : 0
                novoModBc = soDigitos(ij.icms_modalidade_base_calculo || '') || '3'
              }
              break
            }
          }
        }

        // 2) Fallback: cabeçalho autorizado (somente documento com 1 item, sem
        //    ambiguidade entre itens tributados e isentos)
        if (!novoCst && !novaBase && !novoIcms && bcDoc > 0 && itens.length === 1) {
          novoCst = '00'
          novaBase = bcDoc
          novoIcms = vIcmsDoc
          novaAliq = round2((vIcmsDoc / bcDoc) * 100)
          novoModBc = '3'
        }

        // Nada autorizado com ICMS para este item (ex.: NFC-e isenta): não altera
        if (!novoCst || (novaBase <= 0 && novoIcms <= 0)) continue

        const origem = soDigitos(it.getString('origem')) || '0'
        it.set('origem', origem)
        it.set('cst_icms', novoCst)
        it.set('base_icms', novaBase)
        it.set('valor_icms', novoIcms)
        it.set('aliquota_icms', novaAliq)
        if (novoModBc) it.set('mod_bc_icms', novoModBc)
        app.save(it)
        itensCorrigidos++
      }
    }

    console.log(
      '[0130] Documentos 65 analisados: ' +
        docsAnalisados +
        '; itens corrigidos a partir da nota autorizada: ' +
        itensCorrigidos,
    )
  },
  (app) => {
    // Revert: no-op — a correção é determinística a partir da nota autorizada;
    // desfazer recriaria a divergência (base 0 / ICMS 0) que motivou esta migration.
    console.log('[0130 revert] no-op')
  },
)
