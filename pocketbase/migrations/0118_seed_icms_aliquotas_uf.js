migrate(
  (app) => {
    // Seed idempotente das alíquotas internas de ICMS por UF (icms_aliquotas_uf).
    // - Só cria a UF que AINDA NÃO EXISTE na coleção; UFs já cadastradas não são alteradas.
    // - FCP fica 0 para o contador completar (ver aviso na tela Alíquotas ICMS por UF).
    // Alíquotas internas modais vigentes (em %):
    const lista = [
      ['AC', 19],
      ['AL', 19],
      ['AM', 20],
      ['AP', 18],
      ['BA', 20.5],
      ['CE', 20],
      ['DF', 20],
      ['ES', 17],
      ['GO', 19],
      ['MA', 23],
      ['MG', 18],
      ['MS', 17],
      ['MT', 17],
      ['PA', 19],
      ['PB', 20],
      ['PE', 20.5],
      ['PI', 22.5],
      ['PR', 19.5],
      ['RJ', 20],
      ['RN', 20],
      ['RO', 19.5],
      ['RR', 20],
      ['RS', 17],
      ['SC', 17],
      ['SE', 19],
      ['SP', 18],
      ['TO', 20],
    ]

    let criadas = 0
    for (let i = 0; i < lista.length; i++) {
      const uf = lista[i][0]
      const aliquota = lista[i][1]
      try {
        const existentes = app.findRecordsByFilter('icms_aliquotas_uf', `uf = '${uf}'`, '', 1, 0)
        if (existentes && existentes.length > 0) {
          continue // já existe: NÃO altera
        }
        const col = app.findCollectionByNameOrId('icms_aliquotas_uf')
        const rec = new Record(col)
        rec.set('uf', uf)
        rec.set('aliquota_interna', aliquota)
        rec.set('aliquota_fcp', 0)
        rec.set('ativo', true)
        rec.set('observacao', 'Semeadura automática (0118) — conferir com o contador.')
        app.save(rec)
        criadas++
      } catch (e) {
        console.log(`[migration 0118] Erro ao semear UF ${uf}: ${e}`)
      }
    }
    console.log(`[migration 0118] icms_aliquotas_uf: ${criadas} UFs criadas.`)
  },
  (app) => {
    // Revert: nada a reverter (seed idempotente; UFs podem ser removidas pelo painel)
  },
)
