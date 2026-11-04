/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Localizar empresa código 3
    let empresaId = ''
    try {
      const empresas = app.findRecordsByFilter('empresas', 'codigo = 3 || codigo = "3"', '', 1, 0)
      if (empresas.length > 0) {
        empresaId = empresas[0].id
      }
    } catch (_) {}

    // 2. Localizar a nota de entrada #999
    let filterNota = 'numero = 999 || numero = "999"'
    if (empresaId) {
      filterNota = `(${filterNota}) && empresa_id = '${empresaId}'`
    }

    const notas = app.findRecordsByFilter('notas_entrada', filterNota, '-created', 1, 0)
    if (notas.length === 0) {
      return
    }

    const nota = notas[0]
    const notaId = nota.id

    // 3. Verificar se já existe parcela para esta nota
    const parcelasExistentes = app.findRecordsByFilter(
      'notas_entrada_parcelas',
      `nota_id = '${notaId}' && ativo = true`,
      '',
      1,
      0,
    )

    if (parcelasExistentes.length > 0) {
      // Já possui parcela, garantir que os dados estão corretos de forma idempotente
      const parc = parcelasExistentes[0]
      let mudou = false
      if (parc.getFloat('valor') !== 250.0) {
        parc.set('valor', 250.0)
        mudou = true
      }
      if (parc.getString('data_vencimento') !== '2026-12-04') {
        parc.set('data_vencimento', '2026-12-04')
        mudou = true
      }
      if (parc.getString('forma_pagamento') !== '15') {
        parc.set('forma_pagamento', '15')
        mudou = true
      }
      if (mudou) {
        app.save(parc)
      }
      return
    }

    // 4. Criar a parcela de R$ 250,00 vencendo em 04/12/2026 (30 dias após emissão 04/11/2026)
    const parcelasCol = app.findCollectionByNameOrId('notas_entrada_parcelas')
    const novaParcela = new Record(parcelasCol)
    novaParcela.set('nota_id', notaId)
    novaParcela.set('numero', '001')
    novaParcela.set('data_vencimento', '2026-12-04')
    novaParcela.set('valor', 250.0)
    novaParcela.set('forma_pagamento', '15') // 15 - Boleto Bancário
    novaParcela.set('ativo', true)
    app.save(novaParcela)
  },
  (app) => {
    // Reversão opcional (não destrutiva)
    try {
      const notas = app.findRecordsByFilter(
        'notas_entrada',
        'numero = 999 || numero = "999"',
        '',
        1,
        0,
      )
      if (notas.length > 0) {
        const parcelas = app.findRecordsByFilter(
          'notas_entrada_parcelas',
          `nota_id = '${notas[0].id}' && numero = '001'`,
          '',
          1,
          0,
        )
        if (parcelas.length > 0) {
          app.delete(parcelas[0])
        }
      }
    } catch (_) {}
  },
)
