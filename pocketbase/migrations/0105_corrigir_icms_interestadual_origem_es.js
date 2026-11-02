migrate(
  (app) => {
    // Alíquotas interestaduais com origem no Espírito Santo (ES):
    // - Para Sul e Sudeste (SP, RJ, MG, PR, SC, RS): 12%
    // - Para Norte, Nordeste e Centro-Oeste (inclusive DF): 7%
    const sulSudeste = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
    const outros = [
      'AC',
      'AL',
      'AM',
      'AP',
      'BA',
      'CE',
      'DF',
      'GO',
      'MA',
      'MS',
      'MT',
      'PA',
      'PB',
      'PE',
      'PI',
      'RN',
      'RO',
      'RR',
      'SE',
      'TO',
    ]

    for (let i = 0; i < outros.length; i++) {
      const dest = outros[i]
      try {
        const records = app.findRecordsByFilter(
          'icms_interestadual',
          `uf_origem = 'ES' && uf_destino = '${dest}'`,
          '',
          1,
          0,
        )
        if (records && records.length > 0) {
          const rec = records[0]
          rec.set('aliquota', 7)
          rec.set('ativo', true)
          app.save(rec)
        } else {
          const col = app.findCollectionByNameOrId('icms_interestadual')
          const rec = new Record(col)
          rec.set('uf_origem', 'ES')
          rec.set('uf_destino', dest)
          rec.set('aliquota', 7)
          rec.set('ativo', true)
          app.save(rec)
        }
      } catch (e) {
        console.log(`[migration 0105] Erro ao atualizar ES -> ${dest}: ${e}`)
      }
    }

    for (let i = 0; i < sulSudeste.length; i++) {
      const dest = sulSudeste[i]
      try {
        const records = app.findRecordsByFilter(
          'icms_interestadual',
          `uf_origem = 'ES' && uf_destino = '${dest}'`,
          '',
          1,
          0,
        )
        if (records && records.length > 0) {
          const rec = records[0]
          rec.set('aliquota', 12)
          rec.set('ativo', true)
          app.save(rec)
        } else {
          const col = app.findCollectionByNameOrId('icms_interestadual')
          const rec = new Record(col)
          rec.set('uf_origem', 'ES')
          rec.set('uf_destino', dest)
          rec.set('aliquota', 12)
          rec.set('ativo', true)
          app.save(rec)
        }
      } catch (e) {
        console.log(`[migration 0105] Erro ao atualizar ES -> ${dest}: ${e}`)
      }
    }
  },
  (app) => {
    // Reverter não altera nada de crítico
  },
)
