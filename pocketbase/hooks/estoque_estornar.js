/**
 * Hook de estorno de movimento de estoque
 * Endpoint: POST /estoque/estornar
 *
 * Regras:
 * - Localiza o movimento original
 * - Verifica se já foi estornado
 * - Cria um novo movimento inverso com origem 'ESTORNO', vinculando movimento_estornado_id
 * - Marca o movimento original com estornado = true e movimento_estorno_id
 * - Atualiza a quantidade do lote correspondente se movimento tiver lote_id vinculado
 * - Atualiza estoque_saldos com o novo saldo resultante
 * - Se produto controla lote, preserva a invariante (soma dos lotes = saldo geral)
 * - Tudo executado dentro de uma transação atômica do SQLite (runInTransaction)
 */

routerAdd('POST', '/estoque/estornar', (c) => {
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

  const movimentoId = body.movimento_id
  const motivo = body.motivo || 'Estorno manual'

  if (!movimentoId) {
    return c.json(400, { sucesso: false, message: 'movimento_id é obrigatório.' })
  }

  const userId = authRecord.id
  let novoMovimentoId = ''

  try {
    // 1. Buscar movimento original para validar vínculo multi-tenant com a empresa gravada
    const movOrigCheck = $app.findRecordById('estoque_movimentos', movimentoId)
    if (!movOrigCheck) {
      return c.json(404, { sucesso: false, message: 'Movimento de estoque não encontrado.' })
    }
    const empresaIdGravada = movOrigCheck.getString('empresa_id')
    try {
      exigirEmpresaDoUsuario(authRecord, empresaIdGravada)
    } catch (errTenancy) {
      return c.json(403, {
        sucesso: false,
        message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
      })
    }

    $app.runInTransaction((txApp) => {
      // 1. Buscar movimento original dentro da transação
      const movOrig = txApp.findRecordById('estoque_movimentos', movimentoId)
      if (!movOrig) {
        throw new Error('Movimento de estoque não encontrado.')
      }

      if (movOrig.getBool('estornado')) {
        throw new Error('Este movimento já foi estornado anteriormente.')
      }

      if (movOrig.getString('origem') === 'ESTORNO') {
        throw new Error('Não é possível estornar um movimento que já é um estorno.')
      }

      const empresaId = movOrig.getString('empresa_id')
      const produtoId = movOrig.getString('produto_id')
      const tipoOriginal = movOrig.getString('tipo') // 'Entrada' ou 'Saída'
      const qtdOriginal = movOrig.getFloat('quantidade') || 0
      const custoUnitario = movOrig.getFloat('custo_unitario') || 0
      const loteIdOriginal = movOrig.getString('lote_id')

      const prod = txApp.findRecordById('produtos', produtoId)
      const descProd = prod ? prod.getString('descricao') : 'Produto'
      const controlaLote = prod ? prod.getBool('controla_lote_validade') : false

      // 2. Tipo inverso para o estorno
      const tipoEstorno = tipoOriginal === 'Entrada' ? 'Saída' : 'Entrada'

      // 3. Atualizar estoque_saldos
      const saldos = txApp.findRecordsByFilter(
        'estoque_saldos',
        `empresa_id = '${empresaId}' && produto_id = '${produtoId}'`,
        '',
        1,
        0,
      )

      if (saldos.length === 0) {
        throw new Error('Saldo de estoque do produto não encontrado.')
      }

      const saldoRec = saldos[0]
      const saldoAnterior = saldoRec.getFloat('quantidade') || 0
      const custoMedio = saldoRec.getFloat('custo_medio') || 0

      // Se original foi entrada, estorno é saída (subtrai)
      // Se original foi saída, estorno é entrada (soma)
      const saldoPosterior =
        tipoEstorno === 'Entrada' ? saldoAnterior + qtdOriginal : saldoAnterior - qtdOriginal

      // Se estorno resultar em negativo, checar regra da filial
      const emp = txApp.findRecordById('empresas', empresaId)
      if (saldoPosterior < 0 && (!emp || !emp.getBool('permite_estoque_negativo'))) {
        throw new Error(
          `Não é possível estornar: o saldo ficaria negativo (${saldoPosterior.toFixed(4)}), o que não é permitido nesta filial.`,
        )
      }

      saldoRec.set('quantidade', saldoPosterior)
      saldoRec.set('valor_total', Math.max(0, saldoPosterior * custoMedio))
      saldoRec.set('updated_by', userId)
      txApp.save(saldoRec)

      // 4. Se o movimento possui lote vinculado, reverte a quantidade no lote correto
      if (loteIdOriginal) {
        try {
          const loteRec = txApp.findRecordById('lotes', loteIdOriginal)
          if (loteRec) {
            const saldoLoteAtual = loteRec.getFloat('quantidade') || 0
            // Se o original foi Entrada, o estorno retira do lote (- qtdOriginal)
            // Se o original foi Saída, o estorno devolve ao lote (+ qtdOriginal)
            const novoSaldoLote =
              tipoEstorno === 'Entrada'
                ? saldoLoteAtual + qtdOriginal
                : saldoLoteAtual - qtdOriginal

            if (novoSaldoLote < 0 && (!emp || !emp.getBool('permite_estoque_negativo'))) {
              throw new Error(
                `Não é possível estornar: o saldo do lote ${loteRec.getString('numero_lote')} ficaria negativo (${novoSaldoLote.toFixed(4)}).`,
              )
            }

            loteRec.set('quantidade', novoSaldoLote)
            loteRec.set('updated_by', userId)
            txApp.save(loteRec)
          }
        } catch (errLote) {
          throw new Error(`Erro ao estornar lote vinculado: ${errLote.message || errLote}`)
        }
      }

      // 5. Invariante de integridade: se produto controla lote, valida a soma
      if (controlaLote) {
        const todosLotes = txApp.findRecordsByFilter(
          'lotes',
          `empresa_id = '${empresaId}' && produto_id = '${produtoId}' && ativo = true`,
        )
        let somaLotes = 0
        for (let s = 0; s < todosLotes.length; s++) {
          somaLotes += todosLotes[s].getFloat('quantidade') || 0
        }

        const dif = Math.abs(somaLotes - saldoPosterior)
        if (dif > 0.001) {
          throw new Error(
            `Invariante de estoque violada no estorno de "${descProd}": soma dos lotes (${somaLotes.toFixed(4)}) difere do saldo geral (${saldoPosterior.toFixed(4)}).`,
          )
        }
      }

      // 6. Criar movimento inverso de estorno
      const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
      const movEstorno = new Record(movsCol)
      movEstorno.set('empresa_id', empresaId)
      movEstorno.set('produto_id', produtoId)
      movEstorno.set('data_movimento', new Date().toISOString())
      movEstorno.set('tipo', tipoEstorno)
      movEstorno.set('origem', 'ESTORNO')
      movEstorno.set('quantidade', qtdOriginal)
      movEstorno.set('custo_unitario', custoUnitario)
      movEstorno.set('valor_total', qtdOriginal * custoUnitario)
      movEstorno.set('saldo_anterior', saldoAnterior)
      movEstorno.set('saldo_posterior', saldoPosterior)
      movEstorno.set('custo_medio_anterior', custoMedio)
      movEstorno.set('custo_medio_posterior', custoMedio)
      movEstorno.set('lote_id', loteIdOriginal || '')
      movEstorno.set('documento_tipo', 'Estorno')
      movEstorno.set('documento_id', movOrig.id)
      movEstorno.set('documento_numero', movOrig.getString('documento_numero') || '')
      movEstorno.set('motivo', motivo)
      movEstorno.set('observacao', `Estorno referente ao movimento #${movOrig.id}`)
      movEstorno.set('movimento_estornado_id', movOrig.id)
      movEstorno.set('usuario_id', userId)
      movEstorno.set('estornado', false)
      movEstorno.set('ativo', true)
      movEstorno.set('created_by', userId)
      movEstorno.set('updated_by', userId)
      txApp.save(movEstorno)

      novoMovimentoId = movEstorno.id

      // 7. Marcar movimento original como estornado
      movOrig.set('estornado', true)
      movOrig.set('movimento_estorno_id', novoMovimentoId)
      movOrig.set('updated_by', userId)
      txApp.save(movOrig)
    })

    return c.json(200, {
      sucesso: true,
      message: 'Movimento estornado com sucesso.',
      movimento_estorno_id: novoMovimentoId,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
