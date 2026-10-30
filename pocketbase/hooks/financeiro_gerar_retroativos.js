/**
 * Hook para Administrador: Gerar Títulos de Notas de Entrada já lançadas
 * Endpoint: POST /financeiro/pagar/gerar-titulos-retroativos
 *
 * Busca notas com status 'Lançada' que não possuem títulos em contas_pagar
 * (ex.: notas lançadas antes da Etapa 4) e gera seus títulos retroativos
 * respeitando os vencimentos originais no passado.
 *
 * Acesso exclusivo para administradores (perfis_acesso.administrador = true).
 */

routerAdd('POST', '/financeiro/pagar/gerar-titulos-retroativos', (c) => {
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
  } catch (_) {
    body = {}
  }

  const empresaId = body.empresa_id
  if (!empresaId) {
    return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
  }

  // Validação multi-tenant central: o admin do assinante só vale dentro do próprio assinante
  try {
    exigirEmpresaDoUsuario(authRecord, empresaId)
  } catch (errTenancy) {
    return c.json(403, {
      sucesso: false,
      message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
    })
  }

  const userId = authRecord.id

  // 1. Verificar se o usuário autenticado é Administrador
  // Regra do projeto: perfis_acesso.administrador = true via usuários vinculado ao login; NUNCA por e-mail fixo
  try {
    const usuarios = $app.findRecordsByFilter(
      'usuarios',
      `auth_user_id = '${userId}' && ativo = true`,
      '',
      1,
      0,
    )
    if (usuarios.length === 0) {
      return c.json(403, {
        sucesso: false,
        message: 'Acesso restrito: usuário ERP não vinculado ao login.',
      })
    }

    const usuarioErp = usuarios[0]
    const perfilId = usuarioErp.getString('perfil_id')
    if (!perfilId) {
      return c.json(403, { sucesso: false, message: 'Acesso restrito: perfil não informado.' })
    }

    const perfil = $app.findRecordById('perfis_acesso', perfilId)
    if (!perfil || !perfil.getBool('administrador')) {
      return c.json(403, {
        sucesso: false,
        message: 'Acesso restrito: apenas administradores do sistema podem executar esta rotina.',
      })
    }
  } catch (errAuth) {
    return c.json(403, {
      sucesso: false,
      message:
        'Falha ao validar privilégios de administrador: ' + (errAuth.message || String(errAuth)),
    })
  }

  // 2. Se ação for apenas consultar (modo 'listar')
  const apenasListar = Boolean(body.apenas_listar)

  let notasSemTitulos = []
  let totalTitulosGerados = 0

  try {
    $app.runInTransaction((txApp) => {
      // Carregar todas as notas Lançadas da empresa
      const notasLancadas = txApp.findRecordsByFilter(
        'notas_entrada',
        `empresa_id = '${empresaId}' && status = 'Lançada' && ativo = true`,
        '-data_entrada,-numero',
      )

      for (let n = 0; n < notasLancadas.length; n++) {
        const nota = notasLancadas[n]
        const tipoEntrada = nota.getString('tipo_entrada')
        if (tipoEntrada === 'Bonificação' || tipoEntrada === 'Devolução de venda') {
          continue // não geram títulos
        }

        const notaId = nota.id
        // Checar se já possui algum título em contas_pagar
        const titulosExistentes = txApp.findRecordsByFilter(
          'contas_pagar',
          `origem_id = '${notaId}' && origem = 'NF Entrada' && ativo = true`,
          '',
          1,
          0,
        )

        if (titulosExistentes.length === 0) {
          // Busca fornecedor para exibir nome amigável
          let fornecedorNome = 'Fornecedor'
          try {
            const forn = txApp.findRecordById('fornecedores', nota.getString('fornecedor_id'))
            if (forn) {
              fornecedorNome =
                forn.getString('razao_social') || forn.getString('nome_fantasia') || fornecedorNome
            }
          } catch (_) {}

          notasSemTitulos.push({
            nota_id: notaId,
            numero: nota.getInt('numero'),
            serie: nota.getString('serie'),
            data_emissao: nota.getString('data_emissao'),
            data_entrada: nota.getString('data_entrada'),
            fornecedor_nome: fornecedorNome,
            valor_total: nota.getFloat('valor_total') || 0,
            tipo_entrada: tipoEntrada,
          })
        }
      }

      // Se não for apenas listar, gerar os títulos agora
      if (!apenasListar && notasSemTitulos.length > 0) {
        // Obter plano padrão da empresa
        let planoContaIdFinal = ''
        let centroCustoIdPadrao = ''

        try {
          const configsFin = txApp.findRecordsByFilter(
            'config_financeira_empresa',
            `empresa_id = '${empresaId}' && ativo = true`,
            '',
            1,
            0,
          )
          if (configsFin.length > 0) {
            const cfg = configsFin[0]
            centroCustoIdPadrao = cfg.getString('centro_custo_padrao_id') || ''
            planoContaIdFinal =
              cfg.getString('plano_compras_revenda_id') ||
              cfg.getString('plano_outras_entradas_id') ||
              ''
          }
        } catch (_) {}

        if (!planoContaIdFinal) {
          try {
            const planosDespesa = txApp.findRecordsByFilter(
              'plano_contas',
              `natureza = 'Analítica' && tipo = 'Despesa' && ativo = true`,
              'codigo',
              1,
              0,
            )
            if (planosDespesa.length > 0) planoContaIdFinal = planosDespesa[0].id
          } catch (_) {}
        }

        const pagarCol = txApp.findCollectionByNameOrId('contas_pagar')

        for (let i = 0; i < notasSemTitulos.length; i++) {
          const itemNota = notasSemTitulos[i]
          const notaRec = txApp.findRecordById('notas_entrada', itemNota.nota_id)

          const parcelasNota = txApp.findRecordsByFilter(
            'notas_entrada_parcelas',
            `nota_id = '${itemNota.nota_id}' && ativo = true`,
            'numero',
          )

          if (parcelasNota.length > 0) {
            const totalParc = parcelasNota.length
            for (let pIdx = 0; pIdx < parcelasNota.length; pIdx++) {
              const parc = parcelasNota[pIdx]
              const valorParc = parc.getFloat('valor') || 0
              const vencParc =
                parc.getString('data_vencimento') || itemNota.data_entrada || itemNota.data_emissao
              const tPagParc = parc.getString('forma_pagamento') || ''

              let formaPrevistaId = ''
              if (tPagParc) {
                try {
                  const fPag = txApp.findRecordsByFilter(
                    'formas_pagamento',
                    `codigo_tpag = '${tPagParc}' && ativo = true`,
                    '',
                    1,
                    0,
                  )
                  if (fPag.length > 0) formaPrevistaId = fPag[0].id
                } catch (_) {}
              }

              const titRec = new Record(pagarCol)
              titRec.set('empresa_id', empresaId)
              titRec.set('fornecedor_id', notaRec.getString('fornecedor_id'))
              titRec.set('numero_documento', String(itemNota.numero))
              titRec.set('parcela', `${pIdx + 1}/${totalParc}`)
              titRec.set(
                'descricao',
                `NF Entrada #${itemNota.numero} - Parc ${pIdx + 1}/${totalParc} - ${itemNota.fornecedor_nome}`,
              )
              titRec.set('data_emissao', itemNota.data_emissao)
              titRec.set('data_competencia', itemNota.data_entrada || itemNota.data_emissao)
              titRec.set('data_vencimento', vencParc)
              titRec.set('plano_conta_id', planoContaIdFinal)
              if (centroCustoIdPadrao) titRec.set('centro_custo_id', centroCustoIdPadrao)
              if (formaPrevistaId) titRec.set('forma_pagamento_prevista_id', formaPrevistaId)
              titRec.set('valor_original', valorParc)
              titRec.set('valor_pago', 0)
              titRec.set('saldo', valorParc)
              titRec.set('status', 'Em aberto')
              titRec.set('origem', 'NF Entrada')
              titRec.set('origem_id', itemNota.nota_id)
              titRec.set('nota_entrada_parcela_id', parc.id)
              titRec.set('ativo', true)
              titRec.set('created_by', userId)
              titRec.set('updated_by', userId)
              txApp.save(titRec)
              totalTitulosGerados++
            }
          } else {
            // Nota sem parcelas
            const titRec = new Record(pagarCol)
            titRec.set('empresa_id', empresaId)
            titRec.set('fornecedor_id', notaRec.getString('fornecedor_id'))
            titRec.set('numero_documento', String(itemNota.numero))
            titRec.set('parcela', '1/1')
            titRec.set('descricao', `NF Entrada #${itemNota.numero} - ${itemNota.fornecedor_nome}`)
            titRec.set('data_emissao', itemNota.data_emissao)
            titRec.set('data_competencia', itemNota.data_entrada || itemNota.data_emissao)
            titRec.set('data_vencimento', itemNota.data_entrada || itemNota.data_emissao)
            titRec.set('plano_conta_id', planoContaIdFinal)
            if (centroCustoIdPadrao) titRec.set('centro_custo_id', centroCustoIdPadrao)
            titRec.set('valor_original', itemNota.valor_total)
            titRec.set('valor_pago', 0)
            titRec.set('saldo', itemNota.valor_total)
            titRec.set('status', 'Em aberto')
            titRec.set('origem', 'NF Entrada')
            titRec.set('origem_id', itemNota.nota_id)
            titRec.set('ativo', true)
            titRec.set('created_by', userId)
            titRec.set('updated_by', userId)
            txApp.save(titRec)
            totalTitulosGerados++
          }
        }
      }
    })

    return c.json(200, {
      sucesso: true,
      message: apenasListar
        ? `Encontrada(s) ${notasSemTitulos.length} nota(s) lançada(s) sem títulos.`
        : `${totalTitulosGerados} título(s) a pagar gerado(s) com sucesso para ${notasSemTitulos.length} nota(s).`,
      total_notas: notasSemTitulos.length,
      total_titulos_gerados: totalTitulosGerados,
      notas: notasSemTitulos,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
