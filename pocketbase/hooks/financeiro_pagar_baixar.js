/**
 * Hook do serviço central financeiro: Baixa de Contas a Pagar
 * Endpoint: POST /financeiro/pagar/baixar
 *
 * Executa as baixas de um ou mais títulos dentro de uma transação atômica do SQLite (runInTransaction).
 *
 * Invariantes mantidas:
 * 1. Cada baixa grava um registro em pagamentos_baixas.
 * 2. Atualiza o valor_pago e o saldo do título em contas_pagar, recalculando o status ('Pago' se saldo <= 0.005, senão 'Pago parcial').
 * 3. Se múltiplos títulos forem baixados juntos, compartilha um registro em pagamentos_lotes.
 * 4. Para cada baixa ou para o lote, gera a movimentação financeira correspondente em movimentacoes_financeiras (tipo: 'Saída', origem: 'PAGAMENTO_TITULO').
 * 5. Atualiza o saldo_atual da conta_financeira (saldo_atual = saldo_atual - valor_total_pago).
 *    Se permite_saldo_negativo = false e o saldo for ficar negativo, recusa com erro formatado.
 * 6. Registra auditoria em logs_auditoria para cada título e para o lote.
 */

routerAdd('POST', '/financeiro/pagar/baixar', (c) => {
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

  const empresaId = body.empresa_id
  const contaFinanceiraId = body.conta_financeira_id
  const formaPagamentoId = body.forma_pagamento_id || null
  const dataPagamento = body.data_pagamento || new Date().toISOString().slice(0, 10)
  const observacao = body.observacao || ''
  const itens = body.itens // Array<{ conta_pagar_id, valor_pago, valor_multa?, valor_juros?, valor_desconto?, observacao? }>

  if (!empresaId) {
    return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
  }
  if (!contaFinanceiraId) {
    return c.json(400, { sucesso: false, message: 'conta_financeira_id é obrigatória.' })
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return c.json(400, { sucesso: false, message: 'Lista de títulos (itens) vazia.' })
  }

  // Validação multi-tenant: o usuário precisa pertencer à empresa do pagamento
  try {
    exigirEmpresaDoUsuario(authRecord, empresaId)
  } catch (errTenancy) {
    return c.json(403, {
      sucesso: false,
      message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
    })
  }

  const userId = authRecord.id
  let loteId = null
  let totalLote = 0
  const baixasRealizadas = []

  try {
    $app.runInTransaction((txApp) => {
      // 1. Validar e carregar conta financeira
      const contaRec = txApp.findRecordById('contas_financeiras', contaFinanceiraId)
      if (!contaRec || !contaRec.getBool('ativo')) {
        throw new Error('Conta financeira não encontrada ou inativa.')
      }
      if (contaRec.getString('empresa_id') !== empresaId) {
        throw new Error('A conta financeira não pertence à empresa informada.')
      }

      const permiteNegativo = contaRec.getBool('permite_saldo_negativo')
      const saldoContaAnterior = contaRec.getFloat('saldo_atual') || 0

      // 2. Pré-validar todos os títulos e somar total do pagamento
      let somaTotalPagamento = 0
      const titulosInfo = []

      for (let i = 0; i < itens.length; i++) {
        const it = itens[i]
        if (!it.conta_pagar_id) {
          throw new Error(`Item ${i + 1}: conta_pagar_id é obrigatório.`)
        }

        const tituloRec = txApp.findRecordById('contas_pagar', it.conta_pagar_id)
        if (!tituloRec || !tituloRec.getBool('ativo')) {
          throw new Error(`Título ${it.conta_pagar_id} não encontrado ou inativo.`)
        }
        if (tituloRec.getString('empresa_id') !== empresaId) {
          throw new Error(`Título ${it.conta_pagar_id} pertence a outra empresa.`)
        }

        const statusTitulo = tituloRec.getString('status')
        if (statusTitulo === 'Pago') {
          throw new Error(
            `Título doc ${tituloRec.getString('numero_documento')} (${tituloRec.getString('descricao')}) já se encontra totalmente pago.`,
          )
        }
        if (statusTitulo === 'Cancelado') {
          throw new Error(
            `Título doc ${tituloRec.getString('numero_documento')} está cancelado e não pode ser pago.`,
          )
        }

        const saldoAtualTitulo = tituloRec.getFloat('saldo') || 0
        const valorPagoPrincipal = Number(it.valor_pago || 0)
        const valorMulta = Number(it.valor_multa || 0)
        const valorJuros = Number(it.valor_juros || 0)
        const valorDesconto = Number(it.valor_desconto || 0)

        if (valorPagoPrincipal <= 0) {
          throw new Error(`Item ${i + 1}: o valor principal pago deve ser maior que zero.`)
        }
        if (valorPagoPrincipal > saldoAtualTitulo + 0.005) {
          throw new Error(
            `Item ${i + 1}: o valor pago (R$ ${valorPagoPrincipal.toFixed(2)}) não pode ser superior ao saldo do título (R$ ${saldoAtualTitulo.toFixed(2)}).`,
          )
        }

        const totalEfetivoLinha = valorPagoPrincipal + valorMulta + valorJuros - valorDesconto
        if (totalEfetivoLinha < 0) {
          throw new Error(`Item ${i + 1}: o total pago não pode ser negativo após o desconto.`)
        }

        somaTotalPagamento += totalEfetivoLinha

        titulosInfo.push({
          rec: tituloRec,
          item: it,
          valorPagoPrincipal,
          valorMulta,
          valorJuros,
          valorDesconto,
          totalEfetivoLinha,
          saldoAnterior: saldoAtualTitulo,
        })
      }

      totalLote = somaTotalPagamento

      // 3. Validar se a conta financeira suporta o saldo negativo
      const saldoContaPosterior = saldoContaAnterior - totalLote
      if (saldoContaPosterior < -0.005 && !permiteNegativo) {
        throw new Error(
          `Saldo insuficiente na conta "${contaRec.getString('nome')}". Saldo atual: R$ ${saldoContaAnterior.toFixed(2)}, pagamento: R$ ${totalLote.toFixed(2)}. Esta conta não permite saldo negativo.`,
        )
      }

      // 4. Criar registro do lote em pagamentos_lotes
      const lotesCol = txApp.findCollectionByNameOrId('pagamentos_lotes')
      const loteRec = new Record(lotesCol)
      loteRec.set('empresa_id', empresaId)
      loteRec.set('data_pagamento', dataPagamento)
      loteRec.set('conta_financeira_id', contaFinanceiraId)
      if (formaPagamentoId) {
        loteRec.set('forma_pagamento_id', formaPagamentoId)
      }
      loteRec.set('valor_total', totalLote)
      loteRec.set('total_titulos', titulosInfo.length)
      loteRec.set('observacao', observacao)
      loteRec.set('ativo', true)
      loteRec.set('created_by', userId)
      loteRec.set('updated_by', userId)
      txApp.save(loteRec)
      loteId = loteRec.id

      // 5. Processar cada baixa
      const baixasCol = txApp.findCollectionByNameOrId('pagamentos_baixas')
      const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
      let saldoAcumuladoConta = saldoContaAnterior

      for (let k = 0; k < titulosInfo.length; k++) {
        const info = titulosInfo[k]
        const tRec = info.rec

        // Gravar baixa
        const baixaRec = new Record(baixasCol)
        baixaRec.set('empresa_id', empresaId)
        baixaRec.set('conta_pagar_id', tRec.id)
        baixaRec.set('lote_baixa_id', loteId)
        baixaRec.set('data_pagamento', dataPagamento)
        baixaRec.set('conta_financeira_id', contaFinanceiraId)
        if (formaPagamentoId) {
          baixaRec.set('forma_pagamento_id', formaPagamentoId)
        }
        baixaRec.set('valor_original', tRec.getFloat('valor_original') || 0)
        baixaRec.set('valor_pago', info.valorPagoPrincipal)
        baixaRec.set('valor_multa', info.valorMulta)
        baixaRec.set('valor_juros', info.valorJuros)
        baixaRec.set('valor_desconto', info.valorDesconto)
        baixaRec.set('valor_total_pago', info.totalEfetivoLinha)
        baixaRec.set('estornado', false)
        baixaRec.set('observacao', info.item.observacao || observacao)
        baixaRec.set('ativo', true)
        baixaRec.set('created_by', userId)
        baixaRec.set('updated_by', userId)
        txApp.save(baixaRec)

        // Atualizar título
        const valorJaPago = tRec.getFloat('valor_pago') || 0
        const novoValorPago = valorJaPago + info.valorPagoPrincipal
        const novoSaldo = Math.max(0, info.saldoAnterior - info.valorPagoPrincipal)
        const novoStatus = novoSaldo <= 0.005 ? 'Pago' : 'Pago parcial'

        const valoresAntes = {
          status: tRec.getString('status'),
          valor_pago: valorJaPago,
          saldo: info.saldoAnterior,
          data_pagamento: tRec.getString('data_pagamento'),
        }

        tRec.set('valor_pago', novoValorPago)
        tRec.set('saldo', novoSaldo)
        tRec.set('status', novoStatus)
        if (novoStatus === 'Pago') {
          tRec.set('data_pagamento', dataPagamento)
        }
        tRec.set('updated_by', userId)
        txApp.save(tRec)

        // Registrar auditoria da baixa no título
        const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const logRec = new Record(logsCol)
        logRec.set('tabela', 'contas_pagar')
        logRec.set('registro_id', tRec.id)
        logRec.set('acao', 'alteracao')
        logRec.set('usuario_id', userId)
        logRec.set('valores_antes', JSON.stringify(valoresAntes))
        logRec.set(
          'valores_depois',
          JSON.stringify({
            status: novoStatus,
            valor_pago: novoValorPago,
            saldo: novoSaldo,
            data_pagamento: dataPagamento,
            baixa_id: baixaRec.id,
            lote_baixa_id: loteId,
            valor_efetivo: info.totalEfetivoLinha,
          }),
        )
        txApp.save(logRec)

        // Gravar movimentação financeira por título
        const saldoFinAntLinha = saldoAcumuladoConta
        const saldoFinPosLinha = saldoFinAntLinha - info.totalEfetivoLinha
        saldoAcumuladoConta = saldoFinPosLinha

        const movFinRec = new Record(movsFinCol)
        movFinRec.set('empresa_id', empresaId)
        movFinRec.set('conta_financeira_id', contaFinanceiraId)
        movFinRec.set('data_movimento', dataPagamento)
        movFinRec.set('tipo', 'Saída')
        movFinRec.set('origem', 'PAGAMENTO_TITULO')
        movFinRec.set('valor', info.totalEfetivoLinha)
        movFinRec.set('saldo_anterior', saldoFinAntLinha)
        movFinRec.set('saldo_posterior', saldoFinPosLinha)
        movFinRec.set('documento_tipo', 'contas_pagar')
        movFinRec.set('documento_id', tRec.id)
        movFinRec.set('documento_numero', tRec.getString('numero_documento'))
        movFinRec.set('lote_baixa_id', loteId)
        movFinRec.set(
          'historico',
          `Pagamento título doc ${tRec.getString('numero_documento')} parc ${tRec.getString('parcela')} - ${tRec.getString('descricao')}`,
        )
        movFinRec.set('estornado', false)
        movFinRec.set('ativo', true)
        movFinRec.set('created_by', userId)
        movFinRec.set('updated_by', userId)
        txApp.save(movFinRec)

        baixasRealizadas.push({
          baixa_id: baixaRec.id,
          conta_pagar_id: tRec.id,
          numero_documento: tRec.getString('numero_documento'),
          descricao: tRec.getString('descricao'),
          valor_original: tRec.getFloat('valor_original') || 0,
          valor_pago: info.valorPagoPrincipal,
          valor_multa: info.valorMulta,
          valor_juros: info.valorJuros,
          valor_desconto: info.valorDesconto,
          valor_total_pago: info.totalEfetivoLinha,
          saldo_restante: novoSaldo,
          status_novo: novoStatus,
        })
      }

      // 6. Atualizar saldo_atual da conta_financeira
      contaRec.set('saldo_atual', saldoContaPosterior)
      contaRec.set('updated_by', userId)
      txApp.save(contaRec)
    })

    return c.json(200, {
      sucesso: true,
      message: 'Pagamento(s) realizado(s) com sucesso.',
      lote_baixa_id: loteId,
      valor_total: totalLote,
      total_titulos: baixasRealizadas.length,
      baixas: baixasRealizadas,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
