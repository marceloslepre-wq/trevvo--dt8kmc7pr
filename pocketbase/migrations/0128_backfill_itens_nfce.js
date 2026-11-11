/// <reference path="../pb_data/types.d.ts" />
/**
 * Migration 0128 — Backfill de itens de NFC-e em documentos_fiscais_itens.
 *
 * Causa raiz: fiscal_nfce_emitir.js gravava o documento fiscal (modelo 65) sem
 * gravar os itens — Livro de saídas e SPED (C190) precisavam de item sintético
 * do cabeçalho com CST deduzido (v0.0.281), errado quando a mesma venda tem
 * itens com tributação diferente (tributado + isento + ST).
 *
 * Correção aqui (emissões novas passam a gravar os itens no próprio hook):
 * para cada documento 65 sem itens em documentos_fiscais_itens, cria os itens
 * a partir do json_enviado do documento (payload Focus — os MESMOS dados
 * fiscais que foram à SEFAZ); sem json_enviado, deriva de vendas_itens da
 * venda de origem (venda_id do documento), replicando a tributação da emissão.
 *
 * Formato dos campos: igual ao que a NF-e grava (fiscal_nfe_operacoes.js) —
 * cst_icms com origem na frente ("0102", "0000"), cst_pis/cst_cofins sem a
 * origem, valores arredondados em 2 casas. A emissão da NFC-e grava cst_icms
 * neste mesmo formato.
 *
 * Idempotente: só cria quando o documento NÃO tem itens. Rodar de novo é
 * no-op. Escopo: apenas documentos_fiscais_itens — nada em documentos_fiscais,
 * vendas, estoque, títulos ou movimentações.
 */
migrate(
  (app) => {
    const colDocItens = app.findCollectionByNameOrId('documentos_fiscais_itens')

    // Helpers locais (escopo da migration, dentro do callback)
    function round2(v) {
      return Math.round((Number(v) || 0) * 100) / 100
    }
    function num(v) {
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }
    function parseJsonSeguro(raw) {
      if (!raw) return null
      try {
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw
      } catch (_) {
        return null
      }
    }

    // Documentos NFC-e (modelo 65), qualquer status — canceladas também
    // recebem itens (e o Livro/SPED as exclui pelo status).
    const docs = app.findRecordsByFilter('documentos_fiscais', "modelo = '65'", 'created', 0, 0)

    let documentosComItens = 0
    let itensCriados = 0

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]

      // Só cria quando o documento NÃO tem itens (idempotente)
      let itensExistentes = []
      try {
        itensExistentes = app.findRecordsByFilter(
          'documentos_fiscais_itens',
          `documento_id = '${doc.id}'`,
          'item,created',
          1,
          0,
        )
      } catch (errFiltro) {
        itensExistentes = []
      }
      if (itensExistentes && itensExistentes.length > 0) continue

      const jsonEnviado = parseJsonSeguro(doc.get('json_enviado'))
      const vendaId = doc.getString('venda_id') || ''

      let linhas = []
      let fonte = ''

      // ===== Fonte 1: json_enviado (payload Focus) =====
      if (jsonEnviado && Array.isArray(jsonEnviado.items) && jsonEnviado.items.length > 0) {
        fonte = 'json_enviado'
        for (let j = 0; j < jsonEnviado.items.length; j++) {
          const it = jsonEnviado.items[j]
          const cfopItem = String(it.cfop || '').replace(/\D/g, '') || '5102'
          const origemItem = String(it.icms_origem || '0')
          const situacaoIcms = String(it.icms_situacao_tributaria || '')
          const cstIcmsComOrigem =
            situacaoIcms.length === 3 ? origemItem + situacaoIcms : situacaoIcms
          const cstPisItem = String(it.pis_situacao_tributaria || '')
          const cstCofinsItem = String(it.cofins_situacao_tributaria || '')
          const informarIbs = Boolean(it.ibs_cbs_situacao_tributaria)
          linhas.push({
            item: num(it.numero_item) || j + 1,
            produto_id: '',
            codigo: String(it.codigo_produto || ''),
            descricao: String(it.descricao || `Item ${j + 1}`),
            ncm: String(it.codigo_ncm || ''),
            cest: String(it.codigo_cest || ''),
            cfop: cfopItem,
            unidade: String(it.unidade_comercial || ''),
            quantidade: num(it.quantidade_comercial),
            valor_unitario: num(it.valor_unitario_comercial),
            valor_bruto: round2(num(it.valor_bruto)),
            valor_desconto: round2(num(it.valor_desconto)),
            valor_frete: 0,
            valor_outras: 0,
            valor_total: round2(num(it.valor_bruto) - num(it.valor_desconto)),
            origem: origemItem,
            cst_icms: cstIcmsComOrigem,
            csosn: '',
            mod_bc_icms: it.icms_modalidade_base_calculo
              ? String(it.icms_modalidade_base_calculo)
              : '',
            reducao_bc_icms: 0,
            base_icms: round2(num(it.icms_base_calculo)),
            aliquota_icms: num(it.icms_aliquota),
            valor_icms: round2(num(it.icms_valor)),
            aliquota_fcp: 0,
            valor_fcp: 0,
            base_icms_st: 0,
            aliquota_icms_st: 0,
            valor_icms_st: 0,
            cst_pis: cstPisItem,
            base_pis: round2(num(it.pis_base_calculo)),
            aliquota_pis: num(it.pis_aliquota_porcentual),
            valor_pis: round2(num(it.pis_valor)),
            cst_cofins: cstCofinsItem,
            base_cofins: round2(num(it.cofins_base_calculo)),
            aliquota_cofins: num(it.cofins_aliquota_porcentual),
            valor_cofins: round2(num(it.cofins_valor)),
            cst_ibs_cbs: informarIbs ? String(it.ibs_cbs_situacao_tributaria) : '',
            c_class_trib: informarIbs ? String(it.ibs_cbs_classificacao_tributaria || '') : '',
            base_ibs_cbs: informarIbs ? round2(num(it.ibs_cbs_base_calculo)) : 0,
            aliquota_ibs_uf: informarIbs ? num(it.ibs_uf_aliquota) : 0,
            aliquota_ibs_municipio: informarIbs ? num(it.ibs_mun_aliquota) : 0,
            aliquota_cbs: informarIbs ? num(it.cbs_aliquota) : 0,
            valor_ibs: informarIbs ? round2(num(it.ibs_valor_total)) : 0,
            valor_cbs: informarIbs ? round2(num(it.cbs_valor)) : 0,
            gtin: String(it.codigo_barra_comercial || ''),
          })
        }
      }

      // ===== Fonte 2: vendas_itens da venda de origem (sem json_enviado) =====
      if (linhas.length === 0 && vendaId) {
        try {
          const vItens = app.findRecordsByFilter(
            'vendas_itens',
            `venda_id = '${vendaId}' && ativo = true`,
            'item,created',
            0,
            0,
          )
          if (vItens && vItens.length > 0) {
            fonte = 'vendas_itens'
            for (let k = 0; k < vItens.length; k++) {
              const v = vItens[k]
              const prodIdVenda = v.getString('produto_id')
              let codigoProd = ''
              let ncmProd = ''
              let cestProd = ''
              let gtinProd = ''
              if (prodIdVenda) {
                try {
                  const prod = app.findRecordById('produtos', prodIdVenda)
                  codigoProd = prod.getString('codigo') || prodIdVenda
                  ncmProd = (prod.getString('ncm') || '').replace(/\D/g, '')
                  cestProd = (prod.getString('cest') || '').replace(/\D/g, '')
                  gtinProd = prod.getString('gtin') || ''
                } catch (_) {}
              }
              const brutoVenda = round2(
                (v.getFloat('quantidade') || 0) * (v.getFloat('preco_unitario') || 0),
              )
              const descontoVenda = round2(
                (v.getFloat('desconto_valor') || 0) - (v.getFloat('acrescimo_valor') || 0),
              )
              const totalVenda = round2(brutoVenda - descontoVenda)
              const origemVenda = v.getString('origem') || '0'
              const cstVenda = v.getString('cst_icms') || ''
              const csosnVenda = v.getString('csosn') || ''
              const situacaoVenda = csosnVenda || cstVenda || '40'
              linhas.push({
                item: v.getInt('item') || k + 1,
                produto_id: prodIdVenda,
                codigo: codigoProd || prodIdVenda,
                descricao: v.getString('descricao') || `Item ${k + 1}`,
                ncm: v.getString('ncm') || ncmProd,
                cest: v.getString('cest') || cestProd,
                cfop: v.getString('cfop') || '5102',
                unidade: v.getString('unidade') || 'UN',
                quantidade: v.getFloat('quantidade') || 0,
                valor_unitario: v.getFloat('preco_unitario') || 0,
                valor_bruto: brutoVenda,
                valor_desconto: descontoVenda,
                valor_frete: 0,
                valor_outras: 0,
                valor_total: totalVenda,
                origem: origemVenda,
                cst_icms:
                  situacaoVenda.length === 3 ? (origemVenda || '0') + situacaoVenda : situacaoVenda,
                csosn: '',
                mod_bc_icms: '',
                reducao_bc_icms: 0,
                base_icms: 0,
                aliquota_icms: 0,
                valor_icms: 0,
                aliquota_fcp: 0,
                valor_fcp: 0,
                base_icms_st: 0,
                aliquota_icms_st: 0,
                valor_icms_st: 0,
                cst_pis: v.getString('cst_pis') || '',
                base_pis: 0,
                aliquota_pis: 0,
                valor_pis: 0,
                cst_cofins: v.getString('cst_cofins') || '',
                base_cofins: 0,
                aliquota_cofins: 0,
                valor_cofins: 0,
                cst_ibs_cbs: '',
                c_class_trib: '',
                base_ibs_cbs: 0,
                aliquota_ibs_uf: 0,
                aliquota_ibs_municipio: 0,
                aliquota_cbs: 0,
                valor_ibs: 0,
                valor_cbs: 0,
                gtin: gtinProd,
              })
            }
          }
        } catch (errVItens) {
          console.log(
            '[0128] venda_id ' + vendaId + ': falha ao carregar vendas_itens — ' + errVItens,
          )
        }
      }

      if (linhas.length === 0) {
        console.log(
          '[0128] Documento 65 ' +
            doc.id +
            ' (venda ' +
            vendaId +
            ') sem json_enviado nem vendas_itens — itens NÃO criados.',
        )
        continue
      }

      for (let g = 0; g < linhas.length; g++) {
        const d = linhas[g]
        const itemRec = new Record(colDocItens)
        itemRec.set('documento_id', doc.id)
        itemRec.set('item', d.item)
        if (d.produto_id) itemRec.set('produto_id', d.produto_id)
        itemRec.set('codigo', d.codigo)
        itemRec.set('descricao', d.descricao)
        itemRec.set('ncm', d.ncm)
        itemRec.set('cest', d.cest)
        itemRec.set('cfop', d.cfop)
        itemRec.set('unidade', d.unidade)
        itemRec.set('quantidade', d.quantidade)
        itemRec.set('valor_unitario', d.valor_unitario)
        itemRec.set('valor_bruto', d.valor_bruto)
        itemRec.set('valor_desconto', d.valor_desconto)
        itemRec.set('valor_frete', d.valor_frete)
        itemRec.set('valor_outras', d.valor_outras)
        itemRec.set('valor_total', d.valor_total)
        itemRec.set('origem', d.origem)
        itemRec.set('cst_icms', d.cst_icms)
        itemRec.set('csosn', d.csosn)
        itemRec.set('mod_bc_icms', d.mod_bc_icms)
        itemRec.set('reducao_bc_icms', d.reducao_bc_icms)
        itemRec.set('base_icms', d.base_icms)
        itemRec.set('aliquota_icms', d.aliquota_icms)
        itemRec.set('valor_icms', d.valor_icms)
        itemRec.set('aliquota_fcp', d.aliquota_fcp)
        itemRec.set('valor_fcp', d.valor_fcp)
        itemRec.set('base_icms_st', d.base_icms_st)
        itemRec.set('aliquota_icms_st', d.aliquota_icms_st)
        itemRec.set('valor_icms_st', d.valor_icms_st)
        itemRec.set('cst_pis', d.cst_pis)
        itemRec.set('base_pis', d.base_pis)
        itemRec.set('aliquota_pis', d.aliquota_pis)
        itemRec.set('valor_pis', d.valor_pis)
        itemRec.set('cst_cofins', d.cst_cofins)
        itemRec.set('base_cofins', d.base_cofins)
        itemRec.set('aliquota_cofins', d.aliquota_cofins)
        itemRec.set('valor_cofins', d.valor_cofins)
        itemRec.set('cst_ibs_cbs', d.cst_ibs_cbs)
        itemRec.set('c_class_trib', d.c_class_trib)
        itemRec.set('base_ibs_cbs', d.base_ibs_cbs)
        itemRec.set('aliquota_ibs_uf', d.aliquota_ibs_uf)
        itemRec.set('aliquota_ibs_municipio', d.aliquota_ibs_municipio)
        itemRec.set('aliquota_cbs', d.aliquota_cbs)
        itemRec.set('valor_ibs', d.valor_ibs)
        itemRec.set('valor_cbs', d.valor_cbs)
        itemRec.set('gtin', d.gtin)
        app.save(itemRec)
        itensCriados++
      }
      documentosComItens++
      console.log(
        '[0128] Documento 65 ' +
          doc.id +
          ' (venda ' +
          vendaId +
          '): ' +
          linhas.length +
          ' item(ns) criado(s) a partir de ' +
          fonte +
          '.',
      )
    }

    console.log(
      '[0128] Backfill concluído: ' +
        documentosComItens +
        ' NFC-e(s) receberam itens (' +
        itensCriados +
        ' itens no total).',
    )
  },
  (app) => {
    // Revert: remove os itens de NFC-e criados por esta migration.
    // Marca: itens cujo documento é modelo 65. Itens de NF-e 55 nunca são tocados.
    const colDocItens = app.findCollectionByNameOrId('documentos_fiscais_itens')
    let removidos = 0
    try {
      const itens65 = app.findRecordsByFilter(
        'documentos_fiscais_itens',
        "documento_id.modelo = '65'",
        '',
        0,
        0,
      )
      for (let i = 0; i < itens65.length; i++) {
        app.delete(itens65[i])
        removidos++
      }
    } catch (errRevert) {
      console.log(
        '[0128 revert] filtro com expand falhou (' + errRevert + '); revert não remove nada.',
      )
    }
    console.log(
      '[0128 revert] Itens de NFC-e removidos: ' +
        removidos +
        ' (coleção: ' +
        colDocItens.name +
        ')',
    )
  },
)
