/**
 * Hook do serviço central financeiro: Estorno de Baixa de Pagamento
 * Endpoint: POST /financeiro/pagar/estornar-baixa
 *
 * Executa o estorno atômico de uma baixa previamente realizada em contas_pagar.
 *
 * Invariantes mantidas:
 * 1. Localiza a baixa em pagamentos_baixas (rejeita se já estiver estornada).
 * 2. Marca a baixa como estornada (estornado = true, data_estorno, motivo_estorno, usuario_estorno_id).
 * 3. Restaura o saldo e valor_pago do título em contas_pagar (saldo += valor_pago_principal, valor_pago -= valor_pago_principal).
 *    Recalcula status: se saldo >= valor_original => 'Em aberto', se saldo > 0 => 'Pago parcial', etc.
 * 4. Devolve o dinheiro à conta_financeira (saldo_atual = saldo_atual + valor_total_pago).
 * 5. Registra a movimentação financeira de estorno em movimentacoes_financeiras (tipo: 'Entrada', origem: 'ESTORNO_PAGAMENTO').
 * 6. Registra auditoria em logs_auditoria.
 */

routerAdd('POST', '/financeiro/pagar/estornar-baixa', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Usuário não autenticado.' })
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
    body = c.requestInfo().body || {}
  } catch (err) {
    return c.json(400, { sucesso: false, message: 'Corpo da requisição inválido.' })
  }

  const baixaId = body.baixa_id
  const motivo = body.motivo || ''

  if (!baixaId) {
    return c.json(400, { sucesso: false, message: 'baixa_id é obrigatório.' })
  }
  if (!motivo.trim()) {
    return c.json(400, { sucesso: false, message: 'Justificativa do estorno é obrigatória.' })
  }

  const userId = authRecord.id
  let resultadoEstorno = null

  try {
    // Validação multi-tenant com a empresa gravada na baixa
    const baixaCheck = $app.findRecordById('pagamentos_baixas', baixaId)
    if (!baixaCheck || !baixaCheck.getBool('ativo')) {
      return c.json(404, {
        sucesso: false,
        message: 'Registro de baixa não encontrado ou inativo.',
      })
    }
    const empresaIdGravada = baixaCheck.getString('empresa_id')
    try {
      exigirEmpresaDoUsuario(authRecord, empresaIdGravada)
    } catch (errTenancy) {
      return c.json(403, {
        sucesso: false,
        message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
      })
    }

    $app.runInTransaction((txApp) => {
      // 1. Carregar baixa
      const baixaRec = txApp.findRecordById('pagamentos_baixas', baixaId)
      if (!baixaRec || !baixaRec.getBool('ativo')) {
        throw new Error('Registro de baixa não encontrado ou inativo.')
      }
      if (baixaRec.getBool('estornado')) {
        throw new Error('Esta baixa já se encontra estornada.')
      }

      const contaPagarId = baixaRec.getString('conta_pagar_id')
      const contaFinanceiraId = baixaRec.getString('conta_financeira_id')
      const empresaId = baixaRec.getString('empresa_id')
      const valorPrincipalBaixado = baixaRec.getFloat('valor_pago') || 0
      const valorTotalBaixado = baixaRec.getFloat('valor_total_pago') || 0
      const dataEstorno = new Date().toISOString().slice(0, 10)

      // 2. Carregar título contas_pagar
      const tituloRec = txApp.findRecordById('contas_pagar', contaPagarId)
      if (!tituloRec || !tituloRec.getBool('ativo')) {
        throw new Error('Título vinculado à baixa não encontrado ou inativo.')
      }

      // 3. Carregar conta financeira
      const contaRec = txApp.findRecordById('contas_financeiras', contaFinanceiraId)
      if (!contaRec || !contaRec.getBool('ativo')) {
        throw new Error('Conta financeira vinculada à baixa não encontrada ou inativa.')
      }

      // 4. Marcar baixa como estornada
      baixaRec.set('estornado', true)
      baixaRec.set('data_estorno', dataEstorno)
      baixaRec.set('motivo_estorno', motivo.trim())
      baixaRec.set('usuario_estorno_id', userId)
      baixaRec.set('updated_by', userId)
      txApp.save(baixaRec)

      // 5. Atualizar título em contas_pagar
      const saldoAtualTitulo = tituloRec.getFloat('saldo') || 0
      const valorPagoAtualTitulo = tituloRec.getFloat('valor_pago') || 0
      const valorOriginalTitulo = tituloRec.getFloat('valor_original') || 0

      const novoSaldoTitulo = Math.min(
        valorOriginalTitulo,
        saldoAtualTitulo + valorPrincipalBaixado,
      )
      const novoValorPagoTitulo = Math.max(0, valorPagoAtualTitulo - valorPrincipalBaixado)

      let novoStatus = 'Em aberto'
      if (novoSaldoTitulo <= 0.005) {
        novoStatus = 'Pago'
      } else if (novoSaldoTitulo < valorOriginalTitulo - 0.005) {
        novoStatus = 'Pago parcial'
      } else {
        novoStatus = 'Em aberto'
      }

      const valoresAntesTitulo = {
        status: tituloRec.getString('status'),
        saldo: saldoAtualTitulo,
        valor_pago: valorPagoAtualTitulo,
        data_pagamento: tituloRec.getString('data_pagamento'),
      }

      tituloRec.set('saldo', novoSaldoTitulo)
      tituloRec.set('valor_pago', novoValorPagoTitulo)
      tituloRec.set('status', novoStatus)
      if (novoStatus !== 'Pago') {
        tituloRec.set('data_pagamento', '')
      }
      tituloRec.set('updated_by', userId)
      txApp.save(tituloRec)

      // 6. Atualizar saldo_atual da conta_financeira (estorno devolve saldo)
      const saldoContaAnterior = contaRec.getFloat('saldo_atual') || 0
      const saldoContaPosterior = saldoContaAnterior + valorTotalBaixado
      contaRec.set('saldo_atual', saldoContaPosterior)
      contaRec.set('updated_by', userId)
      txApp.save(contaRec)

      // 7. Gravar movimentação financeira de estorno em movimentacoes_financeiras
      const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
      const movEstornoRec = new Record(movsFinCol)
      movEstornoRec.set('empresa_id', empresaId)
      movEstornoRec.set('conta_financeira_id', contaFinanceiraId)
      movEstornoRec.set('data_movimento', dataEstorno)
      movEstornoRec.set('tipo', 'Entrada')
      movEstornoRec.set('origem', 'ESTORNO_PAGAMENTO')
      movEstornoRec.set('valor', valorTotalBaixado)
      movEstornoRec.set('saldo_anterior', saldoContaAnterior)
      movEstornoRec.set('saldo_posterior', saldoContaPosterior)
      movEstornoRec.set('documento_tipo', 'pagamentos_baixas')
      movEstornoRec.set('documento_id', baixaRec.id)
      movEstornoRec.set('documento_numero', tituloRec.getString('numero_documento'))
      movEstornoRec.set('lote_baixa_id', baixaRec.getString('lote_baixa_id') || '')
      movEstornoRec.set(
        'historico',
        `Estorno de pagamento ref doc ${tituloRec.getString('numero_documento')} parc ${tituloRec.getString('parcela')} - Motivo: ${motivo.trim()}`,
      )
      movEstornoRec.set('estornado', false)
      movEstornoRec.set('ativo', true)
      movEstornoRec.set('created_by', userId)
      movEstornoRec.set('updated_by', userId)
      txApp.save(movEstornoRec)

      // 8. Registrar auditoria do estorno
      const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')
      const logRec = new Record(logsCol)
      logRec.set('tabela', 'contas_pagar')
      logRec.set('registro_id', tituloRec.id)
      logRec.set('acao', 'alteracao')
      logRec.set('usuario_id', userId)
      logRec.set('valores_antes', JSON.stringify(valoresAntesTitulo))
      logRec.set(
        'valores_depois',
        JSON.stringify({
          status: novoStatus,
          saldo: novoSaldoTitulo,
          valor_pago: novoValorPagoTitulo,
          estorno_baixa_id: baixaRec.id,
          valor_estornado: valorTotalBaixado,
          motivo: motivo.trim(),
        }),
      )
      txApp.save(logRec)

      resultadoEstorno = {
        baixa_id: baixaRec.id,
        conta_pagar_id: tituloRec.id,
        novo_saldo: novoSaldoTitulo,
        novo_status: novoStatus,
        valor_estornado: valorTotalBaixado,
      }
    })

    return c.json(200, {
      sucesso: true,
      message: 'Baixa de pagamento estornada com sucesso.',
      estorno: resultadoEstorno,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
