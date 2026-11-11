/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0129 — Correção dos itens de NFC-e gravados pela 0128.
 *
 * Auditoria da rodada de deploy (v0.0.282) mostrou que a 0128 backfillou os
 * itens das NFC-e da loja 01 pela fonte "vendas_itens" (esses documentos não
 * tinham json_enviado no formato novo), que grava CST 40/41 com base e ICMS
 * zerados — enquanto o cabeçalho do documento AUTORIZADO tem base_icms e
 * valor_icms > 0. No Livro de saídas a seção 2 saía com base 0/ICMS 0 em vez
 * de 300,00/51,00.
 *
 * Correção: para cada documento modelo 65 cujo item tem assinatura do fallback
 * (cst 40/41, base_icms e valor_icms zerados) mas cabeçalho com base_icms > 0,
 * recalcula o item a partir do cabeçalho autorizado pela SEFAZ:
 * cst_icms = origem + "00", base_icms = base do documento, valor_icms = ICMS
 * do documento, alíquota = ICMS/base, mod_bc_icms = 3 (valor da operação).
 *
 * Idempotente: itens com base/ICMS já preenchidos são ignorados; documentos
 * com base_icms = 0 no cabeçalho (isentas) continuam CST 40.
 */
migrate(
  (app) => {
    function round2(v) {
      return Math.round((Number(v) || 0) * 100) / 100
    }

    const docs = app.findRecordsByFilter('documentos_fiscais', "modelo = '65'", 'created', 0, 0)

    let itensCorrigidos = 0

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      const bcDoc = round2(doc.getFloat('base_icms') || 0)
      const vIcmsDoc = round2(doc.getFloat('valor_icms') || 0)

      // Cabeçalho sem ICMS: item CST 40 está correto — nada a corrigir.
      if (bcDoc <= 0) continue

      let itens = []
      try {
        itens = app.findRecordsByFilter(
          'documentos_fiscais_itens',
          `documento_id = '${doc.id}'`,
          'item,created',
          0,
          0,
        )
      } catch (errItens) {
        itens = []
      }
      if (!itens || itens.length === 0) continue

      for (let j = 0; j < itens.length; j++) {
        const it = itens[j]
        const cst = (it.getString('cst_icms') || '').trim()
        const baseIt = round2(it.getFloat('base_icms') || 0)
        const vIcmsIt = round2(it.getFloat('valor_icms') || 0)

        // Item já tributado (ou correção já aplicada): idempotente
        if (baseIt > 0 || vIcmsIt > 0) continue

        // Assinatura do fallback da 0128: situação isenta/não tributada
        let ehIsentaFallback = false
        if (cst.length === 3) {
          ehIsentaFallback = cst === '40' || cst === '41'
        } else if (cst.length === 4) {
          ehIsentaFallback = cst.endsWith('40') || cst.endsWith('41')
        }
        if (!ehIsentaFallback) continue

        const origem = (it.getString('origem') || '0').toString() || '0'
        it.set('cst_icms', origem + '00')
        it.set('base_icms', bcDoc)
        it.set('valor_icms', vIcmsDoc)
        it.set('aliquota_icms', round2((vIcmsDoc / bcDoc) * 100))
        it.set('mod_bc_icms', '3')
        app.save(it)
        itensCorrigidos++
      }
    }

    console.log('[0129] Itens de NFC-e corrigidos a partir do cabeçalho: ' + itensCorrigidos)
  },
  (app) => {
    // Revert: no-op — a correção é determinística a partir do cabeçalho
    // autorizado; desfazer recriaria a divergência que motivou esta migration.
    console.log('[0129 revert] no-op')
  },
)
