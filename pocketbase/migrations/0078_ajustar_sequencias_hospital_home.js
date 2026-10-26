/// <reference path="../types.d.ts" />

migrate(
  (app) => {
    // 0078_ajustar_sequencias_hospital_home.js
    // Ajuste dos contadores de sequências da HOSPITAL HOME (id wqxiw7olvkup3sm)
    // para o maior número que REALMENTE existe no banco naquela empresa e tipo
    // (0 se não existir nenhum registro real).
    // NÃO mexe nos contadores do assinante TESTE B (id l6vfd1p688j2y9a).
    // Migration idempotente e no-op caso banco esteja vazio.

    const assinanteHHId = 'wqxiw7olvkup3sm'

    let sequenciasCol = null
    try {
      sequenciasCol = app.findCollectionByNameOrId('sequencias')
    } catch (_) {
      return
    }
    if (!sequenciasCol) return

    // Busca todas as sequências registradas para HOSPITAL HOME
    let seqsHH = []
    try {
      seqsHH = app.findRecordsByFilter(
        'sequencias',
        "assinante_id = '" + assinanteHHId + "'",
        '',
        100,
        0,
      )
    } catch (e) {
      console.log('[0078] Erro ao buscar sequencias da HH: ' + e.message)
      seqsHH = []
    }

    const tipos = ['vendas', 'pedidos_compra', 'inventarios', 'transferencias']

    for (let i = 0; i < seqsHH.length; i++) {
      const seqRec = seqsHH[i]
      const tipo = seqRec.getString('tipo')
      const empId = seqRec.getString('empresa_id')

      let maiorReal = 0
      try {
        if (tipo === 'vendas') {
          const filtro = empId ? "empresa_id = '" + empId + "'" : ''
          const recs = app.findRecordsByFilter('vendas', filtro, '-numero', 1, 0)
          if (recs && recs.length > 0) {
            maiorReal = recs[0].getInt('numero') || 0
          }
        } else if (tipo === 'pedidos_compra') {
          const filtro = empId ? "empresa_id = '" + empId + "'" : ''
          const recs = app.findRecordsByFilter('pedidos_compra', filtro, '-numero', 1, 0)
          if (recs && recs.length > 0) {
            maiorReal = recs[0].getInt('numero') || 0
          }
        } else if (tipo === 'inventarios') {
          const filtro = empId ? "empresa_id = '" + empId + "'" : ''
          const recs = app.findRecordsByFilter('inventarios', filtro, '-numero', 1, 0)
          if (recs && recs.length > 0) {
            maiorReal = recs[0].getInt('numero') || 0
          }
        } else if (tipo === 'transferencias') {
          const filtro = empId ? "empresa_origem_id = '" + empId + "'" : ''
          const recs = app.findRecordsByFilter('transferencias', filtro, '-numero', 1, 0)
          if (recs && recs.length > 0) {
            maiorReal = recs[0].getInt('numero') || 0
          }
        }
      } catch (errCheck) {
        console.log('[0078] Erro ao consultar tabela real ' + tipo + ': ' + errCheck.message)
      }

      console.log(
        '[0078] Ajustando sequencia: tipo=' +
          tipo +
          ', empresa=' +
          empId +
          ', antes=' +
          seqRec.getInt('ultimo_numero') +
          ', depois=' +
          maiorReal,
      )

      seqRec.set('ultimo_numero', maiorReal)
      app.save(seqRec)
    }

    console.log('[0078] Ajuste de sequências concluído.')
  },
  (app) => {
    // Reversão no-op pois restauração de números de teste descartados não se aplica
  },
)
