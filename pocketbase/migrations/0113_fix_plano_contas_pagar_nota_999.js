migrate(
  (app) => {
    // Localizar empresa código 3
    let empresa = null
    try {
      const empresas = app.findRecordsByFilter('empresas', 'codigo = 3', '', 1, 0)
      if (empresas && empresas.length > 0) {
        empresa = empresas[0]
      }
    } catch (_) {}

    if (!empresa) {
      console.log(
        '[0113_fix_plano_contas_pagar_nota_999] Empresa código 3 não encontrada. Nada a fazer.',
      )
      return
    }

    // Localizar plano de contas 2.1.01 (Compras de mercadorias para revenda)
    let planoRevenda = null
    try {
      const planos = app.findRecordsByFilter(
        'plano_contas',
        "codigo = '2.1.01' && ativo = true",
        '',
        1,
        0,
      )
      if (planos && planos.length > 0) {
        planoRevenda = planos[0]
      }
    } catch (_) {}

    // Fallback: verificar na config_financeira_empresa da empresa 3
    if (!planoRevenda) {
      try {
        const configs = app.findRecordsByFilter(
          'config_financeira_empresa',
          "empresa_id = '" + empresa.id + "' && ativo = true",
          '',
          1,
          0,
        )
        if (configs && configs.length > 0 && configs[0].getString('plano_compras_revenda_id')) {
          planoRevenda = app.findRecordById(
            'plano_contas',
            configs[0].getString('plano_compras_revenda_id'),
          )
        }
      } catch (_) {}
    }

    if (!planoRevenda) {
      console.log('[0113_fix_plano_contas_pagar_nota_999] Plano de contas 2.1.01 não encontrado.')
      return
    }

    // Localizar plano 2.8.01 para checagem
    let planoOutrasDespesasId = ''
    try {
      const planosOutras = app.findRecordsByFilter('plano_contas', "codigo = '2.8.01'", '', 1, 0)
      if (planosOutras && planosOutras.length > 0) {
        planoOutrasDespesasId = planosOutras[0].id
      }
    } catch (_) {}

    // Localizar o contas a pagar da nota 999 da empresa código 3
    // Pode estar com numero_documento = '55/1/999' ou '999' ou vinculado pela nota
    let titulos = []
    try {
      titulos = app.findRecordsByFilter(
        'contas_pagar',
        "empresa_id = '" + empresa.id + "' && numero_documento ~ '999'",
        '',
        50,
        0,
      )
    } catch (_) {}

    // Se não achou por numero_documento, buscar via nota_entrada
    if (!titulos || titulos.length === 0) {
      try {
        const notas = app.findRecordsByFilter(
          'notas_entrada',
          "empresa_id = '" + empresa.id + "' && numero = 999",
          '',
          1,
          0,
        )
        if (notas && notas.length > 0) {
          titulos = app.findRecordsByFilter(
            'contas_pagar',
            "origem_id = '" + notas[0].id + "'",
            '',
            50,
            0,
          )
        }
      } catch (_) {}
    }

    let atualizados = 0
    for (let i = 0; i < titulos.length; i++) {
      const tit = titulos[i]
      const planoAtual = tit.getString('plano_conta_id')
      // Atualiza se estiver em 2.8.01 ou diferente de 2.1.01
      if (planoAtual !== planoRevenda.id) {
        tit.set('plano_conta_id', planoRevenda.id)
        app.save(tit)
        atualizados++
      }
    }

    console.log(
      '[0113_fix_plano_contas_pagar_nota_999] Títulos atualizados para o plano 2.1.01:',
      atualizados,
    )
  },
  (app) => {
    // Revert opcional: não reverter dado corrigido
  },
)
