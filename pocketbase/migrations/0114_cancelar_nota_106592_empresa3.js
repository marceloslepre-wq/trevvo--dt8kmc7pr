migrate(
  (app) => {
    // 3. Localizar nota de entrada numero 106592, serie 1, empresa_id '3teuj5yxh5odfio'
    // id do registro: a31v4lmcx88cgeo
    let nota = null
    try {
      nota = app.findRecordById('notas_entrada', 'a31v4lmcx88cgeo')
    } catch (_) {}

    if (!nota) {
      try {
        const notas = app.findRecordsByFilter(
          'notas_entrada',
          "numero = 106592 && serie = '1' && empresa_id = '3teuj5yxh5odfio'",
          '',
          1,
          0,
        )
        if (notas && notas.length > 0) {
          nota = notas[0]
        }
      } catch (_) {}
    }

    if (!nota) {
      console.log('[0114_cancelar_nota_106592_empresa3] Nota 106592 não encontrada. Nada a fazer.')
      return
    }

    // Idempotência: se já estiver Cancelada, não faz nada
    if (nota.getString('status') === 'Cancelada') {
      console.log(
        '[0114_cancelar_nota_106592_empresa3] Nota 106592 já está Cancelada. Nada a fazer.',
      )
      return
    }

    nota.set('status', 'Cancelada')
    nota.set('motivo_cancelamento', 'erros no teste')
    app.save(nota)

    console.log(
      '[0114_cancelar_nota_106592_empresa3] Nota 106592 cancelada com sucesso com motivo "erros no teste".',
    )
  },
  (app) => {
    // Reverter apenas se necessário
    try {
      const nota = app.findRecordById('notas_entrada', 'a31v4lmcx88cgeo')
      if (
        nota &&
        nota.getString('status') === 'Cancelada' &&
        nota.getString('motivo_cancelamento') === 'erros no teste'
      ) {
        nota.set('status', 'Em conferência')
        nota.set('motivo_cancelamento', '')
        app.save(nota)
      }
    } catch (_) {}
  },
)
