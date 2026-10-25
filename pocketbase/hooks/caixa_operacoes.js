/**
 * pb_hook: Operações Transacionais de Caixa
 * - POST /backend/v1/caixa/abrir
 * - POST /backend/v1/caixa/fechar
 * - POST /backend/v1/caixa/sangria
 * - POST /backend/v1/caixa/suprimento
 * - POST /backend/v1/caixa/conferir
 */

// 1. ABERTURA DE CAIXA
routerAdd('POST', '/backend/v1/caixa/abrir', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = reqInfo && reqInfo.body ? reqInfo.body : {}
  } catch (_) {
    body = {}
  }

  const { empresa_id, pdv_terminal_id, valor_abertura, realizar_suprimento } = body
  if (!empresa_id) return c.json(400, { message: 'empresa_id é obrigatório.' })
  if (!pdv_terminal_id) return c.json(400, { message: 'pdv_terminal_id é obrigatório.' })

  try {
    exigirEmpresaDoUsuario(authRecord, empresa_id)
  } catch (errEmp) {
    return c.json(403, { message: errEmp.message || 'Acesso negado à empresa especificada.' })
  }

  const fundoInformado = Number(valor_abertura) || 0
  if (fundoInformado < 0) {
    return c.json(400, { message: 'O valor do fundo de troco não pode ser negativo.' })
  }

  let sessaoCriada = null

  try {
    $app.runInTransaction((txApp) => {
      // 1. Validar operador e permissão e_caixa
      const users = txApp.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (!users || users.length === 0) {
        throw new BadRequestError('Usuário ERP correspondente não encontrado ou inativo.')
      }
      const usuarioERP = users[0]

      if (!usuarioERP.getBool('e_caixa')) {
        throw new BadRequestError(
          'Apenas usuários configurados com permissão de operador de caixa (e_caixa) podem abrir sessão.',
        )
      }

      // 2. Verificar se o operador já possui sessão aberta
      const sessoesOperador = txApp.findRecordsByFilter(
        'caixa_sessoes',
        `operador_id = '${usuarioERP.id}' && status = 'Aberto' && ativo = true`,
        '',
        1,
        0,
      )
      if (sessoesOperador.length > 0) {
        throw new BadRequestError(
          'O operador já possui uma sessão de caixa aberta. Feche a sessão anterior antes de abrir uma nova.',
        )
      }

      // 3. Validar terminal
      const terminal = txApp.findRecordById('pdv_terminais', pdv_terminal_id)
      if (
        !terminal ||
        !terminal.getBool('ativo') ||
        terminal.getString('empresa_id') !== empresa_id
      ) {
        throw new BadRequestError('Terminal de caixa inválido ou inativo para esta filial.')
      }

      // 4. Verificar se o terminal já possui sessão aberta
      const sessoesTerminal = txApp.findRecordsByFilter(
        'caixa_sessoes',
        `pdv_terminal_id = '${pdv_terminal_id}' && status = 'Aberto' && ativo = true`,
        '',
        1,
        0,
      )
      if (sessoesTerminal.length > 0) {
        throw new BadRequestError(
          `O terminal "${terminal.getString('nome')}" já possui uma sessão de caixa aberta.`,
        )
      }

      const contaCaixaId = terminal.getString('conta_financeira_id')
      if (!contaCaixaId) {
        throw new BadRequestError('O terminal não possui conta física de caixa vinculada.')
      }
      const contaCaixa = txApp.findRecordById('contas_financeiras', contaCaixaId)
      if (!contaCaixa || !contaCaixa.getBool('ativo')) {
        throw new BadRequestError('Conta de caixa físico do terminal não encontrada ou inativa.')
      }

      const saldoAtualCaixa = Number(contaCaixa.getFloat('saldo_atual') || 0)
      const diferenca = Number((fundoInformado - saldoAtualCaixa).toFixed(2))

      let suprimentoTransferenciaId = null
      let suprimentoMovId = null

      // Se solicitado suprimento e houver diferença positiva (fundoInformado > saldoAtualCaixa)
      if (realizar_suprimento && diferenca > 0) {
        const contaCofreId = terminal.getString('conta_cofre_id')
        if (!contaCofreId) {
          throw new BadRequestError(
            'Terminal não possui conta cofre configurada para realização do suprimento.',
          )
        }
        const contaCofre = txApp.findRecordById('contas_financeiras', contaCofreId)
        if (!contaCofre || !contaCofre.getBool('ativo')) {
          throw new BadRequestError('Conta cofre do terminal não encontrada ou inativa.')
        }

        const saldoCofre = Number(contaCofre.getFloat('saldo_atual') || 0)
        const novoSaldoCofre = Number((saldoCofre - diferenca).toFixed(2))
        if (novoSaldoCofre < 0 && !contaCofre.getBool('permite_saldo_negativo')) {
          throw new BadRequestError(
            `Saldo insuficiente no cofre (${contaCofre.getString('nome')}) para suprimento de R$ ${diferenca.toFixed(2)}.`,
          )
        }

        const novoSaldoCaixa = Number((saldoAtualCaixa + diferenca).toFixed(2))
        const trfId = 'TRF_SUP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const hojeIso = new Date().toISOString()
        const hojeYmd = hojeIso.slice(0, 10)
        const histBase = `Suprimento de abertura de caixa (${terminal.getString('nome')})`

        const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

        // Débito no Cofre
        const movSaida = new Record(movsCol)
        movSaida.set('empresa_id', empresa_id)
        movSaida.set('conta_financeira_id', contaCofreId)
        movSaida.set('data_movimento', hojeYmd)
        movSaida.set('tipo', 'Saída')
        movSaida.set('origem', 'TRANSFERENCIA_SAIDA')
        movSaida.set('valor', diferenca)
        movSaida.set('saldo_anterior', saldoCofre)
        movSaida.set('saldo_posterior', novoSaldoCofre)
        movSaida.set('documento_tipo', 'TRANSFERENCIA')
        movSaida.set('documento_id', trfId)
        movSaida.set('documento_numero', trfId)
        movSaida.set('transferencia_id', trfId)
        movSaida.set('historico', histBase + ' - Saída Cofre')
        movSaida.set('conciliado', false)
        movSaida.set('estornado', false)
        movSaida.set('ativo', true)
        movSaida.set('created_by', authRecord.id)
        txApp.save(movSaida)

        // Crédito no Caixa
        const movEntrada = new Record(movsCol)
        movEntrada.set('empresa_id', empresa_id)
        movEntrada.set('conta_financeira_id', contaCaixaId)
        movEntrada.set('data_movimento', hojeYmd)
        movEntrada.set('tipo', 'Entrada')
        movEntrada.set('origem', 'TRANSFERENCIA_ENTRADA')
        movEntrada.set('valor', diferenca)
        movEntrada.set('saldo_anterior', saldoAtualCaixa)
        movEntrada.set('saldo_posterior', novoSaldoCaixa)
        movEntrada.set('documento_tipo', 'TRANSFERENCIA')
        movEntrada.set('documento_id', trfId)
        movEntrada.set('documento_numero', trfId)
        movEntrada.set('transferencia_id', trfId)
        movEntrada.set('historico', histBase + ' - Entrada Caixa')
        movEntrada.set('conciliado', false)
        movEntrada.set('estornado', false)
        movEntrada.set('ativo', true)
        movEntrada.set('created_by', authRecord.id)
        txApp.save(movEntrada)

        // Atualizar saldos
        contaCofre.set('saldo_atual', novoSaldoCofre)
        txApp.save(contaCofre)

        contaCaixa.set('saldo_atual', novoSaldoCaixa)
        txApp.save(contaCaixa)

        suprimentoTransferenciaId = trfId
        suprimentoMovId = movEntrada.id
      }

      // 5. Criar a sessão de caixa
      const agora = new Date().toISOString()
      const sessoesCol = txApp.findCollectionByNameOrId('caixa_sessoes')
      const sessao = new Record(sessoesCol)
      sessao.set('empresa_id', empresa_id)
      sessao.set('pdv_terminal_id', pdv_terminal_id)
      sessao.set('operador_id', usuarioERP.id)
      sessao.set('status', 'Aberto')
      sessao.set('data_abertura', agora)
      sessao.set('valor_abertura', fundoInformado)
      sessao.set('valor_esperado_dinheiro', 0)
      sessao.set('valor_contado_dinheiro', 0)
      sessao.set('diferenca_dinheiro', 0)
      sessao.set('totais_por_forma', JSON.stringify([]))
      sessao.set('quantidade_vendas', 0)
      sessao.set('valor_vendas', 0)
      sessao.set('valor_cancelado', 0)
      sessao.set('valor_sangrias', 0)
      sessao.set('valor_suprimentos', suprimentoTransferenciaId ? diferenca : 0)
      sessao.set('ativo', true)
      sessao.set('created_by', authRecord.id)
      txApp.save(sessao)

      // Se houve suprimento na abertura, registrar em caixa_sessoes_movimentos
      if (suprimentoTransferenciaId) {
        const cxMovCol = txApp.findCollectionByNameOrId('caixa_sessoes_movimentos')
        const cxMov = new Record(cxMovCol)
        cxMov.set('empresa_id', empresa_id)
        cxMov.set('caixa_sessao_id', sessao.id)
        cxMov.set('tipo', 'Suprimento')
        cxMov.set('valor', diferenca)
        cxMov.set('motivo', 'Suprimento de acerto de troco na abertura')
        cxMov.set('transferencia_id', suprimentoTransferenciaId)
        if (suprimentoMovId) cxMov.set('movimentacao_financeira_id', suprimentoMovId)
        cxMov.set('operador_id', usuarioERP.id)
        cxMov.set('data_hora', agora)
        cxMov.set('ativo', true)
        cxMov.set('created_by', authRecord.id)
        txApp.save(cxMov)
      }

      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresa_id)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'caixa_sessoes')
        auditRec.set('registro_id', sessao.id)
        auditRec.set('acao', 'inclusao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'abertura_caixa',
            terminal_id: pdv_terminal_id,
            operador_id: usuarioERP.id,
            valor_abertura: fundoInformado,
            saldo_anterior_caixa: saldoAtualCaixa,
            suprimento_realizado: Boolean(suprimentoTransferenciaId),
            valor_suprimento: suprimentoTransferenciaId ? diferenca : 0,
          }),
        )
        txApp.save(auditRec)
      } catch (_) {}

      sessaoCriada = {
        id: sessao.id,
        empresa_id: empresa_id,
        pdv_terminal_id: pdv_terminal_id,
        operador_id: usuarioERP.id,
        status: 'Aberto',
        data_abertura: agora,
        valor_abertura: fundoInformado,
        valor_suprimentos: suprimentoTransferenciaId ? diferenca : 0,
      }
    })

    return c.json(200, { success: true, sessao: sessaoCriada })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao abrir caixa.',
    })
  }
})

// 2. SANGRIA DE CAIXA
routerAdd('POST', '/backend/v1/caixa/sangria', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = reqInfo && reqInfo.body ? reqInfo.body : {}
  } catch (_) {
    body = {}
  }

  const { caixa_sessao_id, valor, motivo } = body
  if (!caixa_sessao_id) return c.json(400, { message: 'caixa_sessao_id é obrigatório.' })
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0)
    return c.json(400, { message: 'O valor da sangria deve ser maior que zero.' })
  if (!motivo || !motivo.trim())
    return c.json(400, { message: 'O motivo da sangria é obrigatório.' })

  let resultado = null

  try {
    $app.runInTransaction((txApp) => {
      const users = txApp.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (!users || users.length === 0) {
        throw new BadRequestError('Usuário ERP correspondente não encontrado ou inativo.')
      }
      const usuarioERP = users[0]

      const sessao = txApp.findRecordById('caixa_sessoes', caixa_sessao_id)
      if (!sessao || !sessao.getBool('ativo')) {
        throw new BadRequestError('Sessão de caixa não encontrada ou inativa.')
      }
      if (sessao.getString('status') !== 'Aberto') {
        throw new BadRequestError('Esta sessão de caixa já está fechada.')
      }

      const empresaId = sessao.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)
      const terminalId = sessao.getString('pdv_terminal_id')
      const terminal = txApp.findRecordById('pdv_terminais', terminalId)
      if (!terminal) throw new BadRequestError('Terminal do caixa não encontrado.')

      const contaCaixaId = terminal.getString('conta_financeira_id')
      const contaCofreId = terminal.getString('conta_cofre_id')
      if (!contaCofreId) {
        throw new BadRequestError(
          'Terminal não possui conta cofre configurada para destino da sangria.',
        )
      }

      const contaCaixa = txApp.findRecordById('contas_financeiras', contaCaixaId)
      const contaCofre = txApp.findRecordById('contas_financeiras', contaCofreId)

      const saldoCaixa = Number(contaCaixa.getFloat('saldo_atual') || 0)
      const novoSaldoCaixa = Number((saldoCaixa - valorNum).toFixed(2))
      if (novoSaldoCaixa < 0 && !contaCaixa.getBool('permite_saldo_negativo')) {
        throw new BadRequestError(
          `Saldo insuficiente no caixa (${contaCaixa.getString('nome')}). Saldo atual: R$ ${saldoCaixa.toFixed(2)}.`,
        )
      }

      const saldoCofre = Number(contaCofre.getFloat('saldo_atual') || 0)
      const novoSaldoCofre = Number((saldoCofre + valorNum).toFixed(2))

      const trfId = 'TRF_SNG_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      const hojeIso = new Date().toISOString()
      const hojeYmd = hojeIso.slice(0, 10)
      const histBase = `Sangria de caixa - ${motivo.trim()} (${terminal.getString('nome')})`

      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      // Saída do Caixa
      const movSaida = new Record(movsCol)
      movSaida.set('empresa_id', empresaId)
      movSaida.set('conta_financeira_id', contaCaixaId)
      movSaida.set('data_movimento', hojeYmd)
      movSaida.set('tipo', 'Saída')
      movSaida.set('origem', 'TRANSFERENCIA_SAIDA')
      movSaida.set('valor', valorNum)
      movSaida.set('saldo_anterior', saldoCaixa)
      movSaida.set('saldo_posterior', novoSaldoCaixa)
      movSaida.set('documento_tipo', 'TRANSFERENCIA')
      movSaida.set('documento_id', trfId)
      movSaida.set('documento_numero', trfId)
      movSaida.set('transferencia_id', trfId)
      movSaida.set('historico', histBase + ' - Saída Caixa')
      movSaida.set('conciliado', false)
      movSaida.set('estornado', false)
      movSaida.set('ativo', true)
      movSaida.set('created_by', authRecord.id)
      txApp.save(movSaida)

      // Entrada no Cofre
      const movEntrada = new Record(movsCol)
      movEntrada.set('empresa_id', empresaId)
      movEntrada.set('conta_financeira_id', contaCofreId)
      movEntrada.set('data_movimento', hojeYmd)
      movEntrada.set('tipo', 'Entrada')
      movEntrada.set('origem', 'TRANSFERENCIA_ENTRADA')
      movEntrada.set('valor', valorNum)
      movEntrada.set('saldo_anterior', saldoCofre)
      movEntrada.set('saldo_posterior', novoSaldoCofre)
      movEntrada.set('documento_tipo', 'TRANSFERENCIA')
      movEntrada.set('documento_id', trfId)
      movEntrada.set('documento_numero', trfId)
      movEntrada.set('transferencia_id', trfId)
      movEntrada.set('historico', histBase + ' - Entrada Cofre')
      movEntrada.set('conciliado', false)
      movEntrada.set('estornado', false)
      movEntrada.set('ativo', true)
      movEntrada.set('created_by', authRecord.id)
      txApp.save(movEntrada)

      contaCaixa.set('saldo_atual', novoSaldoCaixa)
      txApp.save(contaCaixa)

      contaCofre.set('saldo_atual', novoSaldoCofre)
      txApp.save(contaCofre)

      // Registrar movimento da sessão
      const cxMovCol = txApp.findCollectionByNameOrId('caixa_sessoes_movimentos')
      const cxMov = new Record(cxMovCol)
      cxMov.set('empresa_id', empresaId)
      cxMov.set('caixa_sessao_id', sessao.id)
      cxMov.set('tipo', 'Sangria')
      cxMov.set('valor', valorNum)
      cxMov.set('motivo', motivo.trim())
      cxMov.set('transferencia_id', trfId)
      cxMov.set('movimentacao_financeira_id', movSaida.id)
      cxMov.set('operador_id', usuarioERP.id)
      cxMov.set('data_hora', hojeIso)
      cxMov.set('ativo', true)
      cxMov.set('created_by', authRecord.id)
      txApp.save(cxMov)

      // Atualizar totalizador de sangrias na sessão
      const sangriaAcum = Number(sessao.getFloat('valor_sangrias') || 0) + valorNum
      sessao.set('valor_sangrias', Number(sangriaAcum.toFixed(2)))
      txApp.save(sessao)

      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresaId)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'caixa_sessoes_movimentos')
        auditRec.set('registro_id', cxMov.id)
        auditRec.set('acao', 'inclusao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'sangria',
            sessao_id: sessao.id,
            valor: valorNum,
            motivo: motivo.trim(),
            transferencia_id: trfId,
          }),
        )
        txApp.save(auditRec)
      } catch (_) {}

      resultado = {
        movimento_id: cxMov.id,
        transferencia_id: trfId,
        valor: valorNum,
        motivo: motivo.trim(),
        data_hora: hojeIso,
        operador_nome: usuarioERP.getString('nome'),
        terminal_nome: terminal.getString('nome'),
        novo_saldo_caixa: novoSaldoCaixa,
      }
    })

    return c.json(200, { success: true, sangria: resultado })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao realizar sangria.',
    })
  }
})

// 3. SUPRIMENTO DE CAIXA
routerAdd('POST', '/backend/v1/caixa/suprimento', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = reqInfo && reqInfo.body ? reqInfo.body : {}
  } catch (_) {
    body = {}
  }

  const { caixa_sessao_id, valor, motivo } = body
  if (!caixa_sessao_id) return c.json(400, { message: 'caixa_sessao_id é obrigatório.' })
  const valorNum = Number(valor)
  if (!valorNum || valorNum <= 0)
    return c.json(400, { message: 'O valor do suprimento deve ser maior que zero.' })
  if (!motivo || !motivo.trim())
    return c.json(400, { message: 'O motivo do suprimento é obrigatório.' })

  let resultado = null

  try {
    $app.runInTransaction((txApp) => {
      const users = txApp.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (!users || users.length === 0) {
        throw new BadRequestError('Usuário ERP correspondente não encontrado ou inativo.')
      }
      const usuarioERP = users[0]

      const sessao = txApp.findRecordById('caixa_sessoes', caixa_sessao_id)
      if (!sessao || !sessao.getBool('ativo')) {
        throw new BadRequestError('Sessão de caixa não encontrada ou inativa.')
      }
      if (sessao.getString('status') !== 'Aberto') {
        throw new BadRequestError('Esta sessão de caixa já está fechada.')
      }

      const empresaId = sessao.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)
      const terminalId = sessao.getString('pdv_terminal_id')
      const terminal = txApp.findRecordById('pdv_terminais', terminalId)
      if (!terminal) throw new BadRequestError('Terminal do caixa não encontrado.')

      const contaCaixaId = terminal.getString('conta_financeira_id')
      const contaCofreId = terminal.getString('conta_cofre_id')
      if (!contaCofreId) {
        throw new BadRequestError(
          'Terminal não possui conta cofre configurada para origem do suprimento.',
        )
      }

      const contaCaixa = txApp.findRecordById('contas_financeiras', contaCaixaId)
      const contaCofre = txApp.findRecordById('contas_financeiras', contaCofreId)

      const saldoCofre = Number(contaCofre.getFloat('saldo_atual') || 0)
      const novoSaldoCofre = Number((saldoCofre - valorNum).toFixed(2))
      if (novoSaldoCofre < 0 && !contaCofre.getBool('permite_saldo_negativo')) {
        throw new BadRequestError(
          `Saldo insuficiente no cofre (${contaCofre.getString('nome')}). Saldo atual: R$ ${saldoCofre.toFixed(2)}.`,
        )
      }

      const saldoCaixa = Number(contaCaixa.getFloat('saldo_atual') || 0)
      const novoSaldoCaixa = Number((saldoCaixa + valorNum).toFixed(2))

      const trfId = 'TRF_SUP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      const hojeIso = new Date().toISOString()
      const hojeYmd = hojeIso.slice(0, 10)
      const histBase = `Suprimento de caixa - ${motivo.trim()} (${terminal.getString('nome')})`

      const movsCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

      // Saída do Cofre
      const movSaida = new Record(movsCol)
      movSaida.set('empresa_id', empresaId)
      movSaida.set('conta_financeira_id', contaCofreId)
      movSaida.set('data_movimento', hojeYmd)
      movSaida.set('tipo', 'Saída')
      movSaida.set('origem', 'TRANSFERENCIA_SAIDA')
      movSaida.set('valor', valorNum)
      movSaida.set('saldo_anterior', saldoCofre)
      movSaida.set('saldo_posterior', novoSaldoCofre)
      movSaida.set('documento_tipo', 'TRANSFERENCIA')
      movSaida.set('documento_id', trfId)
      movSaida.set('documento_numero', trfId)
      movSaida.set('transferencia_id', trfId)
      movSaida.set('historico', histBase + ' - Saída Cofre')
      movSaida.set('conciliado', false)
      movSaida.set('estornado', false)
      movSaida.set('ativo', true)
      movSaida.set('created_by', authRecord.id)
      txApp.save(movSaida)

      // Entrada no Caixa
      const movEntrada = new Record(movsCol)
      movEntrada.set('empresa_id', empresaId)
      movEntrada.set('conta_financeira_id', contaCaixaId)
      movEntrada.set('data_movimento', hojeYmd)
      movEntrada.set('tipo', 'Entrada')
      movEntrada.set('origem', 'TRANSFERENCIA_ENTRADA')
      movEntrada.set('valor', valorNum)
      movEntrada.set('saldo_anterior', saldoCaixa)
      movEntrada.set('saldo_posterior', novoSaldoCaixa)
      movEntrada.set('documento_tipo', 'TRANSFERENCIA')
      movEntrada.set('documento_id', trfId)
      movEntrada.set('documento_numero', trfId)
      movEntrada.set('transferencia_id', trfId)
      movEntrada.set('historico', histBase + ' - Entrada Caixa')
      movEntrada.set('conciliado', false)
      movEntrada.set('estornado', false)
      movEntrada.set('ativo', true)
      movEntrada.set('created_by', authRecord.id)
      txApp.save(movEntrada)

      contaCaixa.set('saldo_atual', novoSaldoCaixa)
      txApp.save(contaCaixa)

      contaCofre.set('saldo_atual', novoSaldoCofre)
      txApp.save(contaCofre)

      // Registrar movimento da sessão
      const cxMovCol = txApp.findCollectionByNameOrId('caixa_sessoes_movimentos')
      const cxMov = new Record(cxMovCol)
      cxMov.set('empresa_id', empresaId)
      cxMov.set('caixa_sessao_id', sessao.id)
      cxMov.set('tipo', 'Suprimento')
      cxMov.set('valor', valorNum)
      cxMov.set('motivo', motivo.trim())
      cxMov.set('transferencia_id', trfId)
      cxMov.set('movimentacao_financeira_id', movEntrada.id)
      cxMov.set('operador_id', usuarioERP.id)
      cxMov.set('data_hora', hojeIso)
      cxMov.set('ativo', true)
      cxMov.set('created_by', authRecord.id)
      txApp.save(cxMov)

      // Atualizar totalizador de suprimentos na sessão
      const supAcum = Number(sessao.getFloat('valor_suprimentos') || 0) + valorNum
      sessao.set('valor_suprimentos', Number(supAcum.toFixed(2)))
      txApp.save(sessao)

      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresaId)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'caixa_sessoes_movimentos')
        auditRec.set('registro_id', cxMov.id)
        auditRec.set('acao', 'inclusao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'suprimento',
            sessao_id: sessao.id,
            valor: valorNum,
            motivo: motivo.trim(),
            transferencia_id: trfId,
          }),
        )
        txApp.save(auditRec)
      } catch (_) {}

      resultado = {
        movimento_id: cxMov.id,
        transferencia_id: trfId,
        valor: valorNum,
        motivo: motivo.trim(),
        data_hora: hojeIso,
        operador_nome: usuarioERP.getString('nome'),
        terminal_nome: terminal.getString('nome'),
        novo_saldo_caixa: novoSaldoCaixa,
      }
    })

    return c.json(200, { success: true, suprimento: resultado })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao realizar suprimento.',
    })
  }
})

// 4. FECHAMENTO DE CAIXA
routerAdd('POST', '/backend/v1/caixa/fechar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = reqInfo && reqInfo.body ? reqInfo.body : {}
  } catch (_) {
    body = {}
  }

  const {
    caixa_sessao_id,
    valor_contado_dinheiro,
    totais_informados_formas, // array [{ forma_id, valor_informado }]
    observacao_fechamento,
  } = body

  if (!caixa_sessao_id) return c.json(400, { message: 'caixa_sessao_id é obrigatório.' })
  const dinheiroContado = Number(valor_contado_dinheiro) || 0
  if (dinheiroContado < 0) {
    return c.json(400, { message: 'O valor contado em dinheiro não pode ser negativo.' })
  }

  let resultadoFechamento = null

  try {
    $app.runInTransaction((txApp) => {
      const users = txApp.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (!users || users.length === 0) {
        throw new BadRequestError('Usuário ERP correspondente não encontrado ou inativo.')
      }
      const usuarioERP = users[0]

      const sessao = txApp.findRecordById('caixa_sessoes', caixa_sessao_id)
      if (!sessao || !sessao.getBool('ativo')) {
        throw new BadRequestError('Sessão de caixa não encontrada ou inativa.')
      }
      if (sessao.getString('status') !== 'Aberto') {
        throw new BadRequestError(
          'Esta sessão de caixa já se encontra fechada e não pode ser fechada novamente.',
        )
      }

      const empresaId = sessao.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)
      const terminalId = sessao.getString('pdv_terminal_id')
      const terminal = txApp.findRecordById('pdv_terminais', terminalId)
      if (!terminal) throw new BadRequestError('Terminal do caixa não encontrado.')
      const contaCaixaId = terminal.getString('conta_financeira_id')
      const contaCaixa = txApp.findRecordById('contas_financeiras', contaCaixaId)

      // Carregar configurações de vendas da empresa (planos de quebra e sobra)
      let cfgVendas = null
      try {
        const cfgs = txApp.findRecordsByFilter(
          'config_vendas_empresa',
          `empresa_id = '${empresaId}' && ativo = true`,
          '',
          1,
          0,
        )
        if (cfgs.length > 0) cfgVendas = cfgs[0]
      } catch (_) {}

      let planoQuebraId = cfgVendas ? cfgVendas.getString('plano_quebra_caixa_id') : ''
      let planoSobraId = cfgVendas ? cfgVendas.getString('plano_sobra_caixa_id') : ''

      if (!planoQuebraId) {
        try {
          const p = txApp.findRecordsByFilter(
            'plano_contas',
            "codigo = '2.8.01' && ativo = true",
            '',
            1,
            0,
          )
          if (p.length > 0) planoQuebraId = p[0].id
        } catch (_) {}
      }
      if (!planoSobraId) {
        try {
          const p = txApp.findRecordsByFilter(
            'plano_contas',
            "codigo = '1.3.01' && ativo = true",
            '',
            1,
            0,
          )
          if (p.length > 0) planoSobraId = p[0].id
        } catch (_) {}
      }

      // 1. Apurar todas as vendas finalizadas e canceladas desta sessão
      const vendasSessao = txApp.findRecordsByFilter(
        'vendas',
        `caixa_sessao_id = '${caixa_sessao_id}' && ativo = true`,
        'created',
      )

      let qtdVendasFinalizadas = 0
      let totalVendasFinalizadas = 0
      let totalVendasCanceladas = 0
      const idsVendasFinalizadas = []

      for (let v = 0; v < vendasSessao.length; v++) {
        const vd = vendasSessao[v]
        const st = vd.getString('status')
        const valTot = Number(vd.getFloat('valor_total') || 0)
        if (st === 'Finalizada') {
          qtdVendasFinalizadas++
          totalVendasFinalizadas += valTot
          idsVendasFinalizadas.push(vd.id)
        } else if (st === 'Cancelada') {
          totalVendasCanceladas += valTot
        }
      }

      // 2. Apurar pagamentos por forma de pagamento das vendas finalizadas
      const formasMap = new Map()

      // Todas as formas de pagamento ativas para permitir informar mesmo sem venda
      const todasFormas = txApp.findRecordsByFilter('formas_pagamento', 'ativo = true', 'descricao')
      for (let f = 0; f < todasFormas.length; f++) {
        const fm = todasFormas[f]
        formasMap.set(fm.id, {
          forma_id: fm.id,
          forma_descricao: fm.getString('descricao'),
          codigo_tpag: fm.getString('codigo_tpag'),
          tipo: fm.getString('tipo'),
          quantidade_vendas: 0,
          valor_esperado: 0,
          valor_informado: 0,
        })
      }

      let totalDinheiroVendas = 0

      // Para cada venda finalizada, buscar vendas_pagamentos
      for (let i = 0; i < idsVendasFinalizadas.length; i++) {
        const vId = idsVendasFinalizadas[i]
        const pags = txApp.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${vId}' && ativo = true`,
          '',
        )

        for (let p = 0; p < pags.length; p++) {
          const pg = pags[p]
          const fId = pg.getString('forma_pagamento_id')
          const vBruto = Number(pg.getFloat('valor') || 0)
          const vTroco = Number(pg.getFloat('troco') || 0)
          const vLiquido = Math.max(0, vBruto - vTroco)

          let entry = formasMap.get(fId)
          if (!entry) {
            try {
              const fm = txApp.findRecordById('formas_pagamento', fId)
              entry = {
                forma_id: fm.id,
                forma_descricao: fm.getString('descricao'),
                codigo_tpag: fm.getString('codigo_tpag'),
                tipo: fm.getString('tipo'),
                quantidade_vendas: 0,
                valor_esperado: 0,
                valor_informado: 0,
              }
              formasMap.set(fId, entry)
            } catch (_) {}
          }

          if (entry) {
            entry.quantidade_vendas++
            entry.valor_esperado = Number((entry.valor_esperado + vLiquido).toFixed(2))

            if (entry.tipo === 'Dinheiro' || entry.codigo_tpag === '01') {
              totalDinheiroVendas += vLiquido
            }
          }
        }
      }

      // Preencher valores informados pelo operador
      const informadosArr = Array.isArray(totais_informados_formas) ? totais_informados_formas : []
      for (let k = 0; k < informadosArr.length; k++) {
        const itemInf = informadosArr[k]
        if (itemInf && itemInf.forma_id && formasMap.has(itemInf.forma_id)) {
          const entry = formasMap.get(itemInf.forma_id)
          entry.valor_informado = Number(Number(itemInf.valor_informado || 0).toFixed(2))
        }
      }

      // Para forma dinheiro, o valor informado é o dinheiroContado
      for (const entry of formasMap.values()) {
        if (entry.tipo === 'Dinheiro' || entry.codigo_tpag === '01') {
          entry.valor_informado = dinheiroContado
        }
      }

      // Filtrar apenas formas que tiveram movimento ou valor informado
      const totaisPorFormaLista = []
      for (const entry of formasMap.values()) {
        if (entry.quantidade_vendas > 0 || entry.valor_esperado > 0 || entry.valor_informado > 0) {
          totaisPorFormaLista.push({
            forma_id: entry.forma_id,
            forma_descricao: entry.forma_descricao,
            codigo_tpag: entry.codigo_tpag,
            tipo: entry.tipo,
            quantidade_vendas: entry.quantidade_vendas,
            valor_esperado: entry.valor_esperado,
            valor_informado: entry.valor_informado,
            diferenca: Number((entry.valor_informado - entry.valor_esperado).toFixed(2)),
          })
        }
      }

      // 3. Apurar movimentos de sangria e suprimento da sessão
      const movsSessao = txApp.findRecordsByFilter(
        'caixa_sessoes_movimentos',
        `caixa_sessao_id = '${caixa_sessao_id}' && ativo = true`,
        '',
      )
      let totalSangrias = 0
      let totalSuprimentos = 0
      for (let m = 0; m < movsSessao.length; m++) {
        const mv = movsSessao[m]
        const tp = mv.getString('tipo')
        const vl = Number(mv.getFloat('valor') || 0)
        if (tp === 'Sangria') totalSangrias += vl
        else if (tp === 'Suprimento') totalSuprimentos += vl
      }

      // 4. Cálculo do valor esperado em dinheiro
      const fundoInicial = Number(sessao.getFloat('valor_abertura') || 0)
      const esperadoDinheiro = Number(
        (fundoInicial + totalSuprimentos + totalDinheiroVendas - totalSangrias).toFixed(2),
      )
      const diferencaDinheiro = Number((dinheiroContado - esperadoDinheiro).toFixed(2))

      const agora = new Date().toISOString()
      const hojeYmd = agora.slice(0, 10)
      const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
      const cxMovCol = txApp.findCollectionByNameOrId('caixa_sessoes_movimentos')

      let ajusteMovFinId = null

      // 5. Tratamento de diferença no dinheiro via lançamento avulso:
      // Falta (< 0): Saída com plano_quebra_caixa_id
      // Sobra (> 0): Entrada com plano_sobra_caixa_id
      if (Math.abs(diferencaDinheiro) >= 0.01) {
        const saldoAtualCaixa = Number(contaCaixa.getFloat('saldo_atual') || 0)
        let novoSaldoCaixa = saldoAtualCaixa
        let tipoMov = ''
        let planoId = ''
        let historicoAjuste = ''
        let tipoAjusteSessao = ''
        const valorAjuste = Math.abs(diferencaDinheiro)

        if (diferencaDinheiro < 0) {
          // Falta
          tipoMov = 'Saída'
          tipoAjusteSessao = 'Ajuste_Falta'
          planoId = planoQuebraId
          if (!planoId)
            throw new BadRequestError('Plano de contas para quebra/falta de caixa não configurado.')
          novoSaldoCaixa = Number((saldoAtualCaixa - valorAjuste).toFixed(2))
          if (novoSaldoCaixa < 0 && !contaCaixa.getBool('permite_saldo_negativo')) {
            throw new BadRequestError(
              `Saldo insuficiente no caixa para lançamento de quebra de caixa de R$ ${valorAjuste.toFixed(2)}.`,
            )
          }
          historicoAjuste = `Quebra/falta de caixa no fechamento da sessão #${sessao.id.slice(-6)} (${terminal.getString('nome')})`
        } else {
          // Sobra
          tipoMov = 'Entrada'
          tipoAjusteSessao = 'Ajuste_Sobra'
          planoId = planoSobraId
          if (!planoId)
            throw new BadRequestError('Plano de contas para sobra de caixa não configurado.')
          novoSaldoCaixa = Number((saldoAtualCaixa + valorAjuste).toFixed(2))
          historicoAjuste = `Sobra de caixa no fechamento da sessão #${sessao.id.slice(-6)} (${terminal.getString('nome')})`
        }

        const docId = 'AVU_FECH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const movAvulso = new Record(movsFinCol)
        movAvulso.set('empresa_id', empresaId)
        movAvulso.set('conta_financeira_id', contaCaixaId)
        movAvulso.set('data_movimento', hojeYmd)
        movAvulso.set('tipo', tipoMov)
        movAvulso.set('origem', 'AJUSTE')
        movAvulso.set('valor', valorAjuste)
        movAvulso.set('saldo_anterior', saldoAtualCaixa)
        movAvulso.set('saldo_posterior', novoSaldoCaixa)
        movAvulso.set('documento_tipo', 'AVULSO')
        movAvulso.set('documento_id', docId)
        movAvulso.set('documento_numero', docId)
        movAvulso.set('lancamento_avulso', true)
        movAvulso.set('historico', historicoAjuste)
        movAvulso.set('conciliado', false)
        movAvulso.set('estornado', false)
        movAvulso.set('ativo', true)
        movAvulso.set('created_by', authRecord.id)
        txApp.save(movAvulso)

        contaCaixa.set('saldo_atual', novoSaldoCaixa)
        txApp.save(contaCaixa)

        ajusteMovFinId = movAvulso.id

        // Registrar em caixa_sessoes_movimentos
        const cxMov = new Record(cxMovCol)
        cxMov.set('empresa_id', empresaId)
        cxMov.set('caixa_sessao_id', sessao.id)
        cxMov.set('tipo', tipoAjusteSessao)
        cxMov.set('valor', valorAjuste)
        cxMov.set('motivo', historicoAjuste)
        cxMov.set('movimentacao_financeira_id', movAvulso.id)
        cxMov.set('operador_id', usuarioERP.id)
        cxMov.set('data_hora', agora)
        cxMov.set('ativo', true)
        cxMov.set('created_by', authRecord.id)
        txApp.save(cxMov)
      }

      // 6. Atualizar a sessão para Fechado (imutável a partir daqui)
      sessao.set('status', 'Fechado')
      sessao.set('data_fechamento', agora)
      sessao.set('valor_esperado_dinheiro', esperadoDinheiro)
      sessao.set('valor_contado_dinheiro', dinheiroContado)
      sessao.set('diferenca_dinheiro', diferencaDinheiro)
      sessao.set('totais_por_forma', JSON.stringify(totaisPorFormaLista))
      sessao.set('quantidade_vendas', qtdVendasFinalizadas)
      sessao.set('valor_vendas', Number(totalVendasFinalizadas.toFixed(2)))
      sessao.set('valor_cancelado', Number(totalVendasCanceladas.toFixed(2)))
      sessao.set('valor_sangrias', Number(totalSangrias.toFixed(2)))
      sessao.set('valor_suprimentos', Number(totalSuprimentos.toFixed(2)))
      sessao.set('observacao_fechamento', observacao_fechamento ? observacao_fechamento.trim() : '')
      sessao.set('updated_by', authRecord.id)
      txApp.save(sessao)

      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresaId)
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'caixa_sessoes')
        auditRec.set('registro_id', sessao.id)
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'fechamento_caixa',
            sessao_id: sessao.id,
            esperado_dinheiro: esperadoDinheiro,
            contado_dinheiro: dinheiroContado,
            diferenca_dinheiro: diferencaDinheiro,
            quantidade_vendas: qtdVendasFinalizadas,
            valor_vendas: totalVendasFinalizadas,
            ajuste_mov_fin_id: ajusteMovFinId,
          }),
        )
        txApp.save(auditRec)
      } catch (_) {}

      resultadoFechamento = {
        id: sessao.id,
        status: 'Fechado',
        data_fechamento: agora,
        valor_abertura: fundoInicial,
        valor_esperado_dinheiro: esperadoDinheiro,
        valor_contado_dinheiro: dinheiroContado,
        diferenca_dinheiro: diferencaDinheiro,
        totais_por_forma: totaisPorFormaLista,
        quantidade_vendas: qtdVendasFinalizadas,
        valor_vendas: totalVendasFinalizadas,
        valor_cancelado: totalVendasCanceladas,
        valor_sangrias: totalSangrias,
        valor_suprimentos: totalSuprimentos,
        observacao_fechamento: sessao.getString('observacao_fechamento'),
      }
    })

    return c.json(200, { success: true, sessao: resultadoFechamento })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao fechar sessão de caixa.',
    })
  }
})

// 5. CONFERÊNCIA POR SUPERVISOR
routerAdd('POST', '/backend/v1/caixa/conferir', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { message: 'Não autenticado.' })
  }

  let body = {}
  try {
    const reqInfo = c.requestInfo()
    body = reqInfo && reqInfo.body ? reqInfo.body : {}
  } catch (_) {
    body = {}
  }

  const { caixa_sessao_id, observacao_conferencia } = body
  if (!caixa_sessao_id) return c.json(400, { message: 'caixa_sessao_id é obrigatório.' })

  let sessaoConferida = null

  try {
    $app.runInTransaction((txApp) => {
      const users = txApp.findRecordsByFilter(
        'usuarios',
        `auth_user_id = '${authRecord.id}' && ativo = true`,
        '',
        1,
        0,
      )
      if (!users || users.length === 0) {
        throw new BadRequestError('Usuário ERP correspondente não encontrado ou inativo.')
      }
      const usuarioERP = users[0]

      // Verificar perfil e permissão editar no módulo caixa
      const perfilId = usuarioERP.getString('perfil_id')
      if (!perfilId) throw new BadRequestError('Usuário sem perfil de acesso definido.')
      const perfil = txApp.findRecordById('perfis_acesso', perfilId)
      const ehAdmin = perfil && perfil.getBool('administrador')

      if (!ehAdmin) {
        const perms = txApp.findRecordsByFilter(
          'permissoes',
          `perfil_id = '${perfilId}' && modulo = 'caixa' && ativo = true`,
          '',
          1,
          0,
        )
        if (perms.length === 0 || !perms[0].getBool('pode_editar')) {
          throw new BadRequestError(
            'Apenas supervisores/administradores com permissão de edição em caixa podem marcar como Conferido.',
          )
        }
      }

      const sessao = txApp.findRecordById('caixa_sessoes', caixa_sessao_id)
      if (!sessao || !sessao.getBool('ativo')) {
        throw new BadRequestError('Sessão de caixa não encontrada ou inativa.')
      }
      if (sessao.getString('status') !== 'Fechado') {
        throw new BadRequestError(
          'Apenas sessões de caixa com status "Fechado" podem ser conferidas.',
        )
      }

      const empresaId = sessao.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)

      const agora = new Date().toISOString()
      sessao.set('conferido_por_id', usuarioERP.id)
      sessao.set('data_conferencia', agora)
      if (observacao_conferencia) {
        const obsAtual = sessao.getString('observacao_fechamento') || ''
        sessao.set(
          'observacao_fechamento',
          (obsAtual ? obsAtual + ' | ' : '') +
            `[Conferência por ${usuarioERP.getString('nome')} em ${agora.slice(0, 10)}]: ${observacao_conferencia.trim()}`,
        )
      }
      sessao.set('updated_by', authRecord.id)
      txApp.save(sessao)

      try {
        const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', sessao.getString('empresa_id'))
        auditRec.set('usuario_id', authRecord.id)
        auditRec.set('tabela', 'caixa_sessoes')
        auditRec.set('registro_id', sessao.id)
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'conferencia_caixa',
            sessao_id: sessao.id,
            conferido_por: usuarioERP.id,
            data_conferencia: agora,
          }),
        )
        txApp.save(auditRec)
      } catch (_) {}

      sessaoConferida = {
        id: sessao.id,
        conferido_por_id: usuarioERP.id,
        conferido_por_nome: usuarioERP.getString('nome'),
        data_conferencia: agora,
      }
    })

    return c.json(200, { success: true, sessao: sessaoConferida })
  } catch (err) {
    return c.json(err.status || 400, {
      message: err.message || 'Erro ao conferir sessão de caixa.',
    })
  }
})
