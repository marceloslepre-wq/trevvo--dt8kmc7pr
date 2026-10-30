/**
 * pb_hook: /financeiro/bancos/transferir (POST)
 * pb_hook: /financeiro/bancos/avulso (POST)
 * pb_hook: /financeiro/bancos/estornar (POST)
 * pb_hook: /financeiro/bancos/importar-ofx (POST)
 * pb_hook: /financeiro/bancos/conciliar (POST)
 * pb_hook: /financeiro/bancos/desconciliar (POST)
 * pb_hook: /financeiro/bancos/alternar-ignorar-ofx (POST)
 *
 * Módulo: financeiro_bancos
 * Garante que movimentacoes_financeiras e extratos_linhas sejam criadas/alteradas exclusivamente via hooks transacionais seguros.
 */

// 1. TRANSFERÊNCIA ENTRE CONTAS
routerAdd('POST', '/financeiro/bancos/transferir', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { empresa_id, conta_origem_id, conta_destino_id, data, valor, historico } = body

  if (!empresa_id) return c.json(400, { message: 'empresa_id é obrigatório.' })
  try {
    exigirEmpresaDoUsuario(authRecord, empresa_id)
  } catch (errEmp) {
    return c.json(403, { message: errEmp.message || 'Acesso negado à empresa especificada.' })
  }
  if (!conta_origem_id || !conta_destino_id) {
    return c.json(400, { message: 'conta_origem_id e conta_destino_id são obrigatórias.' })
  }
  if (conta_origem_id === conta_destino_id) {
    return c.json(400, { message: 'A conta de origem e destino devem ser diferentes.' })
  }
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0) {
    return c.json(400, { message: 'Valor deve ser maior que zero.' })
  }
  if (!data) return c.json(400, { message: 'Data é obrigatória.' })

  let resultado = {}

  try {
    $app.runInTransaction((txApp) => {
      const contaOrigem = txApp.findRecordById('contas_financeiras', conta_origem_id)
      const contaDestino = txApp.findRecordById('contas_financeiras', conta_destino_id)

      if (
        !contaOrigem ||
        contaOrigem.get('empresa_id') !== empresa_id ||
        !contaOrigem.get('ativo')
      ) {
        throw new BadRequestError('Conta de origem inválida ou inativa.')
      }
      if (
        !contaDestino ||
        contaDestino.get('empresa_id') !== empresa_id ||
        !contaDestino.get('ativo')
      ) {
        throw new BadRequestError('Conta de destino inválida ou inativa.')
      }

      const saldoOrigem = Number(contaOrigem.get('saldo_atual') || 0)
      const novoSaldoOrigem = Number((saldoOrigem - valorNum).toFixed(2))
      if (novoSaldoOrigem < 0 && !contaOrigem.get('permite_saldo_negativo')) {
        throw new BadRequestError(
          'Saldo insuficiente na conta de origem (' +
            contaOrigem.get('nome') +
            '). A conta não permite saldo negativo.',
        )
      }

      const saldoDestino = Number(contaDestino.get('saldo_atual') || 0)
      const novoSaldoDestino = Number((saldoDestino + valorNum).toFixed(2))

      const transferenciaId = 'TRF_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      const histBase =
        (historico && historico.trim()) ||
        'Transferência entre contas (' +
          contaOrigem.get('nome') +
          ' -> ' +
          contaDestino.get('nome') +
          ')'

      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      // Saída na Origem
      const movSaida = new Record(movsCol)
      movSaida.set('empresa_id', empresa_id)
      movSaida.set('conta_financeira_id', conta_origem_id)
      movSaida.set('data_movimento', data)
      movSaida.set('tipo', 'Saída')
      movSaida.set('origem', 'TRANSFERENCIA_SAIDA')
      movSaida.set('valor', valorNum)
      movSaida.set('saldo_anterior', saldoOrigem)
      movSaida.set('saldo_posterior', novoSaldoOrigem)
      movSaida.set('documento_tipo', 'TRANSFERENCIA')
      movSaida.set('documento_id', transferenciaId)
      movSaida.set('documento_numero', transferenciaId)
      movSaida.set('transferencia_id', transferenciaId)
      movSaida.set('historico', histBase + ' - Débito')
      movSaida.set('conciliado', false)
      movSaida.set('estornado', false)
      movSaida.set('ativo', true)
      movSaida.set('created_by', authRecord.id)
      txApp.save(movSaida)

      // Entrada no Destino
      const movEntrada = new Record(movsCol)
      movEntrada.set('empresa_id', empresa_id)
      movEntrada.set('conta_financeira_id', conta_destino_id)
      movEntrada.set('data_movimento', data)
      movEntrada.set('tipo', 'Entrada')
      movEntrada.set('origem', 'TRANSFERENCIA_ENTRADA')
      movEntrada.set('valor', valorNum)
      movEntrada.set('saldo_anterior', saldoDestino)
      movEntrada.set('saldo_posterior', novoSaldoDestino)
      movEntrada.set('documento_tipo', 'TRANSFERENCIA')
      movEntrada.set('documento_id', transferenciaId)
      movEntrada.set('documento_numero', transferenciaId)
      movEntrada.set('transferencia_id', transferenciaId)
      movEntrada.set('historico', histBase + ' - Crédito')
      movEntrada.set('conciliado', false)
      movEntrada.set('estornado', false)
      movEntrada.set('ativo', true)
      movEntrada.set('created_by', authRecord.id)
      txApp.save(movEntrada)

      // Atualiza saldos nas contas
      contaOrigem.set('saldo_atual', novoSaldoOrigem)
      txApp.save(contaOrigem)

      contaDestino.set('saldo_atual', novoSaldoDestino)
      txApp.save(contaDestino)

      // Auditoria
      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresa_id)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'movimentacoes_financeiras')
        auditRec.set('registro_id', transferenciaId)
        auditRec.set('acao', 'inclusao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'transferencia_entre_contas',
            transferencia_id: transferenciaId,
            origem_id: conta_origem_id,
            destino_id: conta_destino_id,
            valor: valorNum,
            data: data,
          }),
        )
        txApp.save(auditRec)
      } catch (_eAud) {}

      resultado = {
        transferencia_id: transferenciaId,
        mov_saida_id: movSaida.id,
        mov_entrada_id: movEntrada.id,
        novo_saldo_origem: novoSaldoOrigem,
        novo_saldo_destino: novoSaldoDestino,
      }
    })

    return c.json(200, { success: true, ...resultado })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao processar transferência entre contas.',
    })
  }
})

// 2. LANÇAMENTO AVULSO / AJUSTE DE SALDO
routerAdd('POST', '/financeiro/bancos/avulso', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const {
    empresa_id,
    conta_financeira_id,
    data,
    tipo,
    valor,
    plano_conta_id,
    centro_custo_id,
    historico,
  } = body

  if (!empresa_id) return c.json(400, { message: 'empresa_id é obrigatório.' })
  try {
    exigirEmpresaDoUsuario(authRecord, empresa_id)
  } catch (errEmp) {
    return c.json(403, { message: errEmp.message || 'Acesso negado à empresa especificada.' })
  }
  if (!conta_financeira_id) return c.json(400, { message: 'conta_financeira_id é obrigatória.' })
  if (tipo !== 'Entrada' && tipo !== 'Saída') {
    return c.json(400, { message: "tipo deve ser 'Entrada' ou 'Saída'." })
  }
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0) {
    return c.json(400, { message: 'Valor deve ser maior que zero.' })
  }
  if (!data) return c.json(400, { message: 'Data é obrigatória.' })
  if (!historico || !historico.trim()) {
    return c.json(400, { message: 'Histórico é obrigatório.' })
  }

  let resultado = {}

  try {
    $app.runInTransaction((txApp) => {
      const conta = txApp.findRecordById('contas_financeiras', conta_financeira_id)
      if (!conta || conta.get('empresa_id') !== empresa_id || !conta.get('ativo')) {
        throw new BadRequestError('Conta financeira inválida ou inativa.')
      }

      const saldoAtual = Number(conta.get('saldo_atual') || 0)
      let novoSaldo = 0
      if (tipo === 'Entrada') {
        novoSaldo = Number((saldoAtual + valorNum).toFixed(2))
      } else {
        novoSaldo = Number((saldoAtual - valorNum).toFixed(2))
        if (novoSaldo < 0 && !conta.get('permite_saldo_negativo')) {
          throw new BadRequestError(
            'Saldo insuficiente na conta (' + conta.get('nome') + '). Não permite saldo negativo.',
          )
        }
      }

      const docId = 'AVU_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      const mov = new Record(movsCol)
      mov.set('empresa_id', empresa_id)
      mov.set('conta_financeira_id', conta_financeira_id)
      mov.set('data_movimento', data)
      mov.set('tipo', tipo)
      mov.set('origem', 'AJUSTE')
      mov.set('valor', valorNum)
      mov.set('saldo_anterior', saldoAtual)
      mov.set('saldo_posterior', novoSaldo)
      mov.set('documento_tipo', 'AVULSO')
      mov.set('documento_id', docId)
      mov.set('documento_numero', docId)
      mov.set('lancamento_avulso', true)
      mov.set('historico', historico.trim())
      mov.set('conciliado', false)
      mov.set('estornado', false)
      mov.set('ativo', true)
      mov.set('created_by', authRecord.id)
      txApp.save(mov)

      conta.set('saldo_atual', novoSaldo)
      txApp.save(conta)

      // Auditoria
      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresa_id)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'movimentacoes_financeiras')
        auditRec.set('registro_id', mov.id)
        auditRec.set('acao', 'inclusao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'lancamento_avulso',
            conta_financeira_id,
            tipo,
            valor: valorNum,
            plano_conta_id,
            centro_custo_id: centro_custo_id || null,
          }),
        )
        txApp.save(auditRec)
      } catch (_eAud) {}

      resultado = {
        movimento_id: mov.id,
        novo_saldo: novoSaldo,
      }
    })

    return c.json(200, { success: true, ...resultado })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao processar lançamento avulso.',
    })
  }
})

// 3. ESTORNO DE MOVIMENTAÇÃO (TRANSFERÊNCIA OU AVULSO)
routerAdd('POST', '/financeiro/bancos/estornar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { movimento_id, motivo } = body
  if (!movimento_id) return c.json(400, { message: 'movimento_id é obrigatório.' })
  if (!motivo || !motivo.trim()) return c.json(400, { message: 'motivo do estorno é obrigatório.' })

  const hoje = new Date().toISOString().slice(0, 10)

  try {
    $app.runInTransaction((txApp) => {
      const mov = txApp.findRecordById('movimentacoes_financeiras', movimento_id)
      if (!mov || !mov.get('ativo')) {
        throw new BadRequestError('Movimento financeiro não encontrado ou inativo.')
      }
      const movEmpresaId = mov.getString('empresa_id') || mov.get('empresa_id')
      exigirEmpresaDoUsuario(authRecord, movEmpresaId)

      if (mov.get('estornado')) {
        throw new BadRequestError('Este movimento já foi estornado anteriormente.')
      }

      const origem = mov.get('origem')
      if (
        origem === 'PAGAMENTO_TITULO' ||
        origem === 'RECEBIMENTO_TITULO' ||
        origem === 'ESTORNO_PAGAMENTO' ||
        origem === 'ESTORNO_RECEBIMENTO' ||
        mov.get('lote_baixa_id')
      ) {
        throw new BadRequestError(
          'Movimentações originadas de títulos a pagar ou a receber devem ser estornadas através dos seus módulos de Contas a Pagar/Receber.',
        )
      }

      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      // CASO A: Transferência entre contas
      const transfId = mov.get('transferencia_id')
      if (transfId) {
        const pontas = txApp.findRecordsByFilter(
          'movimentacoes_financeiras',
          "transferencia_id = '" + transfId + "' && ativo = true && estornado = false",
          '',
          10,
          0,
        )

        for (let i = 0; i < pontas.length; i++) {
          const p = pontas[i]
          const cId = p.get('conta_financeira_id')
          const conta = txApp.findRecordById('contas_financeiras', cId)
          const saldoAtual = Number(conta.get('saldo_atual') || 0)
          const v = Number(p.get('valor') || 0)

          let novoSaldo = 0
          let tipoEstorno = 'Entrada'
          if (p.get('tipo') === 'Saída') {
            novoSaldo = Number((saldoAtual + v).toFixed(2))
            tipoEstorno = 'Entrada'
          } else {
            novoSaldo = Number((saldoAtual - v).toFixed(2))
            tipoEstorno = 'Saída'
            if (novoSaldo < 0 && !conta.get('permite_saldo_negativo')) {
              throw new BadRequestError(
                'Não foi possível estornar a transferência: a conta de destino (' +
                  conta.get('nome') +
                  ') ficaria com saldo negativo.',
              )
            }
          }

          p.set('estornado', true)
          p.set('motivo_estorno', motivo.trim())
          p.set('data_estorno', hoje)
          p.set('usuario_estorno_id', authRecord.id)
          txApp.save(p)

          const estRec = new Record(movsCol)
          estRec.set('empresa_id', p.get('empresa_id'))
          estRec.set('conta_financeira_id', cId)
          estRec.set('data_movimento', hoje)
          estRec.set('tipo', tipoEstorno)
          estRec.set('origem', 'AJUSTE')
          estRec.set('valor', v)
          estRec.set('saldo_anterior', saldoAtual)
          estRec.set('saldo_posterior', novoSaldo)
          estRec.set('documento_tipo', 'ESTORNO_TRANSFERENCIA')
          estRec.set('documento_id', p.id)
          estRec.set('documento_numero', transfId)
          estRec.set('transferencia_id', transfId)
          estRec.set('historico', 'Estorno de transferência: ' + motivo.trim())
          estRec.set('conciliado', false)
          estRec.set('estornado', false)
          estRec.set('ativo', true)
          estRec.set('created_by', authRecord.id)
          txApp.save(estRec)

          conta.set('saldo_atual', novoSaldo)
          txApp.save(conta)
        }
      } else {
        // CASO B: Lançamento avulso
        const cId = mov.get('conta_financeira_id')
        const conta = txApp.findRecordById('contas_financeiras', cId)
        const saldoAtual = Number(conta.get('saldo_atual') || 0)
        const v = Number(mov.get('valor') || 0)

        let novoSaldo = 0
        let tipoEstorno = 'Entrada'
        if (mov.get('tipo') === 'Saída') {
          novoSaldo = Number((saldoAtual + v).toFixed(2))
          tipoEstorno = 'Entrada'
        } else {
          novoSaldo = Number((saldoAtual - v).toFixed(2))
          tipoEstorno = 'Saída'
          if (novoSaldo < 0 && !conta.get('permite_saldo_negativo')) {
            throw new BadRequestError(
              'Não é possível estornar: a conta (' +
                conta.get('nome') +
                ') ficaria com saldo negativo (' +
                novoSaldo.toFixed(2) +
                ').',
            )
          }
        }

        mov.set('estornado', true)
        mov.set('motivo_estorno', motivo.trim())
        mov.set('data_estorno', hoje)
        mov.set('usuario_estorno_id', authRecord.id)
        txApp.save(mov)

        const estRec = new Record(movsCol)
        estRec.set('empresa_id', mov.get('empresa_id'))
        estRec.set('conta_financeira_id', cId)
        estRec.set('data_movimento', hoje)
        estRec.set('tipo', tipoEstorno)
        estRec.set('origem', 'AJUSTE')
        estRec.set('valor', v)
        estRec.set('saldo_anterior', saldoAtual)
        estRec.set('saldo_posterior', novoSaldo)
        estRec.set('documento_tipo', 'ESTORNO_AVULSO')
        estRec.set('documento_id', mov.id)
        estRec.set('documento_numero', mov.get('documento_numero') || mov.id)
        estRec.set('historico', 'Estorno de lançamento avulso: ' + motivo.trim())
        estRec.set('conciliado', false)
        estRec.set('estornado', false)
        estRec.set('ativo', true)
        estRec.set('created_by', authRecord.id)
        txApp.save(estRec)

        conta.set('saldo_atual', novoSaldo)
        txApp.save(conta)
      }
    })

    return c.json(200, { success: true, message: 'Estorno realizado com sucesso.' })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao processar estorno.',
    })
  }
})

// 4. IMPORTAÇÃO DE EXTRATO OFX
routerAdd('POST', '/financeiro/bancos/importar-ofx', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { empresaId, contaFinanceiraId, arquivoNome, transacoes = [] } = body
  if (!empresaId || !contaFinanceiraId) {
    return c.json(400, { message: 'empresaId e contaFinanceiraId são obrigatórios.' })
  }
  try {
    exigirEmpresaDoUsuario(authRecord, empresaId)
  } catch (errEmp) {
    return c.json(403, { message: errEmp.message || 'Acesso negado à empresa especificada.' })
  }

  let novas = 0
  let ignoradas = 0

  try {
    $app.runInTransaction((txApp) => {
      const extratosCol = txApp.findCollectionByNameOrId('extratos_linhas')

      for (let i = 0; i < transacoes.length; i++) {
        const t = transacoes[i]
        // Verifica se FITID já existe
        try {
          const existentes = txApp.findRecordsByFilter(
            'extratos_linhas',
            "conta_financeira_id = '" + contaFinanceiraId + "' && fitid = '" + t.fitid + "'",
            '',
            1,
            0,
          )
          if (existentes && existentes.length > 0) {
            ignoradas++
            continue
          }
        } catch (_) {}

        try {
          const r = new Record(extratosCol)
          r.set('empresa_id', empresaId)
          r.set('conta_financeira_id', contaFinanceiraId)
          r.set('fitid', t.fitid)
          r.set('data', t.dtPosted)
          r.set('valor', Number(t.valor))
          r.set('descricao', t.memo || 'Transação OFX')
          r.set('situacao', 'Pendente')
          r.set('movimentos_ids', JSON.stringify([]))
          r.set('arquivo_importacao', arquivoNome)
          r.set('ativo', true)
          r.set('created_by', authRecord.id)
          txApp.save(r)
          novas++
        } catch (_err) {
          ignoradas++
        }
      }
    })

    return c.json(200, {
      success: true,
      totalNoArquivo: transacoes.length,
      novasInseridas: novas,
      ignoradasDuplicadas: ignoradas,
    })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao importar transações OFX.',
    })
  }
})

// 5. CONCILIAR (AUTOMÁTICA OU MANUAL)
routerAdd('POST', '/financeiro/bancos/conciliar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { casamentos = [] } = body // [{ linha_id, movimentos_ids }]
  if (!Array.isArray(casamentos) || casamentos.length === 0) {
    return c.json(400, { message: 'Ao menos um casamento de conciliação deve ser informado.' })
  }

  const hoje = new Date().toISOString().slice(0, 10)
  let realizados = 0

  try {
    $app.runInTransaction((txApp) => {
      for (let i = 0; i < casamentos.length; i++) {
        const item = casamentos[i]
        const linha = txApp.findRecordById('extratos_linhas', item.linha_id)
        if (!linha || !linha.get('ativo')) continue

        const linhaEmpresaId = linha.getString('empresa_id') || linha.get('empresa_id')
        exigirEmpresaDoUsuario(authRecord, linhaEmpresaId)

        linha.set('situacao', 'Conciliada')
        linha.set('movimentos_ids', JSON.stringify(item.movimentos_ids || []))
        txApp.save(linha)

        if (Array.isArray(item.movimentos_ids)) {
          for (let j = 0; j < item.movimentos_ids.length; j++) {
            const mId = item.movimentos_ids[j]
            try {
              const m = txApp.findRecordById('movimentacoes_financeiras', mId)
              if (m && m.get('ativo')) {
                m.set('conciliado', true)
                m.set('data_conciliacao', hoje)
                txApp.save(m)
              }
            } catch (_) {}
          }
        }
        realizados++
      }
    })

    return c.json(200, { success: true, casamentosRealizados: realizados })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao processar conciliação.',
    })
  }
})

// 6. DESCONCILIAR LINHA DE EXTRATO
routerAdd('POST', '/financeiro/bancos/desconciliar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { linha_id } = body
  if (!linha_id) return c.json(400, { message: 'linha_id é obrigatória.' })

  try {
    $app.runInTransaction((txApp) => {
      const linha = txApp.findRecordById('extratos_linhas', linha_id)
      if (!linha || !linha.get('ativo')) {
        throw new BadRequestError('Linha de extrato não encontrada.')
      }
      const linhaEmpresaId = linha.getString('empresa_id') || linha.get('empresa_id')
      exigirEmpresaDoUsuario(authRecord, linhaEmpresaId)

      let movs = []
      try {
        const raw = linha.get('movimentos_ids')
        movs = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw || []
      } catch (_) {
        movs = []
      }

      for (let i = 0; i < movs.length; i++) {
        try {
          const m = txApp.findRecordById('movimentacoes_financeiras', movs[i])
          if (m && m.get('ativo')) {
            m.set('conciliado', false)
            m.set('data_conciliacao', null)
            txApp.save(m)
          }
        } catch (_) {}
      }

      linha.set('situacao', 'Pendente')
      linha.set('movimentos_ids', JSON.stringify([]))
      txApp.save(linha)
    })

    return c.json(200, { success: true, message: 'Desconciliado com sucesso.' })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao desconciliar.',
    })
  }
})

// 7. ALTERNAR IGNORAR LINHA OFX
routerAdd('POST', '/financeiro/bancos/alternar-ignorar-ofx', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = (reqInfo && reqInfo.body) || {}
  } catch (_e) {
    body = {}
  }

  const { linha_id, ignorar } = body
  if (!linha_id) return c.json(400, { message: 'linha_id é obrigatória.' })

  try {
    const linha = $app.findRecordById('extratos_linhas', linha_id)
    if (!linha || !linha.get('ativo')) {
      throw new BadRequestError('Linha de extrato não encontrada.')
    }
    const linhaEmpresaId = linha.getString('empresa_id') || linha.get('empresa_id')
    exigirEmpresaDoUsuario(authRecord, linhaEmpresaId)

    const novaSituacao = ignorar ? 'Ignorada' : 'Pendente'
    linha.set('situacao', novaSituacao)
    $app.save(linha)

    return c.json(200, { success: true, situacao: novaSituacao })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao alterar situação da linha.',
    })
  }
})
