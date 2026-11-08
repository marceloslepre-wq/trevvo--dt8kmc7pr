/**
 * Reposição do dia
 * Cria uma transferência em RASCUNHO com os produtos e quantidades vendidos
 * (Finalizadas, sem devolução) pela empresa de destino na data escolhida.
 * Origem = config_vendas_empresa.empresa_reposicao_id da empresa destino.
 *
 * POST /backend/v1/transferencias/reposicao-do-dia
 * body: { empresa_id: <empresa que recebe a reposição>, data: 'YYYY-MM-DD' }
 *
 * IMPORTANTE (JSVM do PocketBase): callbacks executam em pool separado —
 * NADA de top-level pode ser referenciado dentro do callback e NÃO se usa
 * require de módulo próprio dentro dele. Toda a lógica está inline no
 * handler, em variáveis LOCAIS, seguindo o padrão dos demais hooks deste
 * projeto (tenancy copiado, não requerido).
 */
routerAdd('POST', '/backend/v1/transferencias/reposicao-do-dia', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Usuário não autenticado.' })
  }

  let body = {}
  try {
    body = c.requestInfo().body || {}
  } catch (_) {
    return c.json(400, { sucesso: false, message: 'Corpo da requisição inválido.' })
  }

  const empresaId = body.empresa_id || ''
  const data = body.data || ''
  if (!empresaId || !data) {
    return c.json(400, {
      sucesso: false,
      message: 'empresa_id e data (YYYY-MM-DD) são obrigatórios.',
    })
  }

  try {
    // ------------------------------------------------------------------
    // Tenancy (copiado localmente — sem require em callback)
    // ------------------------------------------------------------------

    // 1) Registro do usuário ERP + assinante
    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + authRecord.id + "' || id = '" + authRecord.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && authRecord.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + authRecord.getString('email') + "'",
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
      return c.json(400, {
        sucesso: false,
        message: 'Registro de usuário ERP não encontrado.',
      })
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      return c.json(400, {
        sucesso: false,
        message: 'Usuário não possui vínculo com nenhum assinante cadastrado.',
      })
    }

    // 2) Master pode estar impersonando outro assinante
    let ehMaster = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', authRecord.id)
      ehMaster = !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {}

    if (ehMaster) {
      try {
        const impRecs = $app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + authRecord.id + "'",
          '-created',
          1,
          0,
        )
        if (impRecs && impRecs.length > 0 && impRecs[0].getString('assinante_id')) {
          assinanteId = impRecs[0].getString('assinante_id')
        }
      } catch (_) {}
    }

    // 3) Empresas acessíveis ao usuário (vínculos diretos ou todas, se admin/master)
    let isAdmin = false
    try {
      const perfilId = usuarioRec.getString('perfil_id')
      if (perfilId) {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      }
    } catch (_) {}

    let permitidas = []
    if (isAdmin || ehMaster) {
      try {
        permitidas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
      } catch (_) {
        permitidas = []
      }
    } else {
      const permitidosIds = {}
      try {
        const padraoId = usuarioRec.getString('empresa_padrao_id')
        if (padraoId) permitidosIds[padraoId] = true
        const vinculos = $app.findRecordsByFilter(
          'usuarios_empresas',
          "usuario_id = '" + usuarioRec.id + "' && ativo = true",
          '',
          500,
          0,
        )
        for (let i = 0; i < vinculos.length; i++) {
          const eId = vinculos[i].getString('empresa_id')
          if (eId) permitidosIds[eId] = true
        }
      } catch (_) {}

      permitidas = []
      for (const eId of Object.keys(permitidosIds)) {
        try {
          const emp = $app.findRecordById('empresas', eId)
          if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
            permitidas.push(emp)
          }
        } catch (_) {}
      }
    }

    // A empresa destino deve pertencer ao assinante do usuário
    let empresa = null
    for (let i = 0; i < permitidas.length; i++) {
      if (permitidas[i].id === empresaId) {
        empresa = permitidas[i]
        break
      }
    }
    if (!empresa) {
      return c.json(403, {
        sucesso: false,
        message: 'Acesso negado à empresa especificada para este usuário/assinante.',
      })
    }

    // ------------------------------------------------------------------
    // Config de vendas da empresa destino
    // ------------------------------------------------------------------
    let cfg = null
    try {
      const cfgs = $app.findRecordsByFilter(
        'config_vendas_empresa',
        "empresa_id = '" + empresaId + "'",
        '',
        1,
        0,
      )
      if (cfgs.length > 0) cfg = cfgs[0]
    } catch (_) {}

    const empresaReposicaoId = cfg ? cfg.getString('empresa_reposicao_id') : ''
    if (!empresaReposicaoId) {
      return c.json(400, {
        sucesso: false,
        message: 'Esta empresa não possui "empresa de reposição" configurada.',
      })
    }

    if (empresaReposicaoId === empresaId) {
      return c.json(400, {
        sucesso: false,
        message: 'A empresa de reposição deve ser diferente da empresa selecionada.',
      })
    }

    // Empresa de reposição deve pertencer ao MESMO assinante
    let empOrigem = null
    try {
      empOrigem = $app.findRecordById('empresas', empresaReposicaoId)
    } catch (_) {}
    if (!empOrigem || empOrigem.getString('assinante_id') !== assinanteId) {
      return c.json(400, {
        sucesso: false,
        message: 'A empresa de reposição configurada não pertence a este assinante.',
      })
    }

    // ------------------------------------------------------------------
    // Duplicidade: já existe reposição para empresa destino + data?
    // ------------------------------------------------------------------
    const dtInicio = data + ' 00:00:00.000Z'
    const dtFim = data + ' 23:59:59.999Z'
    const obsMarker = '[REPOSICAO_DIA data=' + data + ']'
    try {
      const duplicadas = $app.findRecordsByFilter(
        'transferencias',
        "empresa_destino_id = '" +
          empresaId +
          "' && ativo != false && status != 'Cancelada' && observacao ~ '" +
          obsMarker +
          "'",
        '-created',
        1,
        0,
      )
      if (duplicadas.length > 0) {
        return c.json(409, {
          sucesso: false,
          message: 'Já existe reposição para esta empresa nesta data.',
          transferencia_id: duplicadas[0].id,
        })
      }
    } catch (_) {}

    // ------------------------------------------------------------------
    // Vendas finalizadas da empresa na data (exclui canceladas e devoluções)
    // ------------------------------------------------------------------
    const vendas = $app.findRecordsByFilter(
      'vendas',
      "empresa_id = '" +
        empresaId +
        "' && status = 'Finalizada' && tipo != 'Devolução' && data_emissao >= '" +
        dtInicio +
        "' && data_emissao <= '" +
        dtFim +
        "' && ativo != false",
      '',
      5000,
      0,
    )

    if (vendas.length === 0) {
      return c.json(200, {
        sucesso: true,
        criada: false,
        message: 'Nenhuma venda finalizada encontrada nesta data para esta empresa.',
        itens: [],
      })
    }

    // Soma quantidades vendidas por produto, descontando o já devolvido
    const mapaProduto = {} // produto_id -> { quantidade, lote_id }
    for (let v = 0; v < vendas.length; v++) {
      let itens = []
      try {
        itens = $app.findRecordsByFilter(
          'vendas_itens',
          "venda_id = '" + vendas[v].id + "' && ativo != false",
          '',
          1000,
          0,
        )
      } catch (_) {
        continue
      }
      for (let i = 0; i < itens.length; i++) {
        const produtoId = itens[i].getString('produto_id')
        if (!produtoId) continue
        const qtd = itens[i].getFloat('quantidade') || 0
        const qtdDevolvida = itens[i].getFloat('quantidade_devolvida') || 0
        const efetiva = qtd - qtdDevolvida
        if (efetiva <= 0) continue
        if (!mapaProduto[produtoId]) {
          mapaProduto[produtoId] = { quantidade: 0, lote_id: itens[i].getString('lote_id') }
        }
        mapaProduto[produtoId].quantidade += efetiva
      }
    }

    const produtoIds = Object.keys(mapaProduto)
    if (produtoIds.length === 0) {
      return c.json(200, {
        sucesso: true,
        criada: false,
        message:
          'Todos os produtos vendidos nesta data já foram integralmente devolvidos — nada a repor.',
        itens: [],
      })
    }

    const obsFinal = obsMarker + ' Origem: reposição automática das vendas de ' + data + '.'

    let transferenciaId = ''

    // ------------------------------------------------------------------
    // Criação da transferência + itens (transação, com revalidação)
    // ------------------------------------------------------------------
    $app.runInTransaction((txApp) => {
      // Revalida duplicidade dentro da transação (código local, sem top-level)
      let jaExiste = false
      try {
        const dupTx = txApp.findRecordsByFilter(
          'transferencias',
          "empresa_destino_id = '" +
            empresaId +
            "' && ativo != false && status != 'Cancelada' && observacao ~ '" +
            obsMarker +
            "'",
          '-created',
          1,
          0,
        )
        if (dupTx.length > 0) jaExiste = true
      } catch (_) {}
      if (jaExiste) {
        throw new Error('Já existe reposição para esta empresa nesta data.')
      }

      const colTransf = txApp.findCollectionByNameOrId('transferencias')
      const transf = new Record(colTransf)
      transf.set('empresa_origem_id', empresaReposicaoId)
      transf.set('empresa_destino_id', empresaId)
      transf.set('status', 'Rascunho')
      transf.set('observacao', obsFinal)
      transf.set('nota_fiscal_numero', '')
      transf.set('nota_fiscal_chave', '')
      transf.set('ativo', true)
      transf.set('created_by', authRecord.id)
      transf.set('updated_by', authRecord.id)
      txApp.save(transf)
      transferenciaId = transf.id

      const colItens = txApp.findCollectionByNameOrId('transferencias_itens')
      for (let p = 0; p < produtoIds.length; p++) {
        const produtoId = produtoIds[p]
        const item = new Record(colItens)
        item.set('transferencia_id', transferenciaId)
        item.set('produto_id', produtoId)
        item.set('lote_id', mapaProduto[produtoId].lote_id || '')
        item.set('quantidade', mapaProduto[produtoId].quantidade)
        item.set('custo_unitario', 0)
        item.set('quantidade_recebida', 0)
        item.set('divergencia', mapaProduto[produtoId].quantidade)
        item.set('ativo', true)
        item.set('created_by', authRecord.id)
        item.set('updated_by', authRecord.id)
        txApp.save(item)
      }
    })

    // ------------------------------------------------------------------
    // Custo médio da ORIGEM para cada item (fora da transação, enriquecimento)
    // ------------------------------------------------------------------
    try {
      const itensSalvos = $app.findRecordsByFilter(
        'transferencias_itens',
        "transferencia_id = '" + transferenciaId + "'",
        '',
        1000,
        0,
      )
      for (let i = 0; i < itensSalvos.length; i++) {
        const produtoId = itensSalvos[i].getString('produto_id')
        let custo = 0
        try {
          const saldos = $app.findRecordsByFilter(
            'estoque_saldos',
            "empresa_id = '" + empresaReposicaoId + "' && produto_id = '" + produtoId + "'",
            '',
            1,
            0,
          )
          if (saldos.length > 0) custo = saldos[0].getFloat('custo_medio') || 0
        } catch (_) {}
        if (custo <= 0) {
          try {
            const prod = $app.findRecordById('produtos', produtoId)
            custo = prod.getFloat('preco_custo') || 0
          } catch (_) {}
        }
        if (custo > 0) {
          itensSalvos[i].set('custo_unitario', custo)
          itensSalvos[i].set('updated_by', authRecord.id)
          $app.save(itensSalvos[i])
        }
      }
    } catch (_) {}

    return c.json(200, {
      sucesso: true,
      criada: true,
      message: 'Reposição do dia gerada em rascunho.',
      transferencia_id: transferenciaId,
      itens: produtoIds.length,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    if (msg.indexOf('Já existe reposição') === 0) {
      return c.json(409, { sucesso: false, message: msg })
    }
    console.error('[POST /backend/v1/transferencias/reposicao-do-dia] Erro:', err)
    return c.json(500, { sucesso: false, message: msg || 'Erro ao gerar reposição do dia.' })
  }
})
