// @ts-check
/// <reference path="../types.d.ts" />

/**
 * POST /backend/v1/caixa/resumo
 * Apuração em TEMPO REAL de uma sessão de caixa (aberta ou fechada):
 * - vendas finalizadas e canceladas (quantidade/valor)
 * - totais por forma de pagamento (vendas_pagamentos, valor líquido já
 *   descontado o troco)
 * - sangrias e suprimentos
 * - dinheiro esperado na gaveta = fundo + dinheiro líquido + suprimentos - sangrias
 *
 * Funções de tenancy copiadas localmente no callback para evitar
 * require(`${__hooks}/...`) no runtime JSVM (Goja).
 */

routerAdd(
  'POST',
  '/backend/v1/caixa/resumo',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, { message: 'Não autenticado.' })
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
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      const data = c.requestInfo().body || {}
      const sessaoId = data.caixa_sessao_id
      if (!sessaoId) {
        return c.json(400, { message: 'Campo caixa_sessao_id é obrigatório.' })
      }

      const sessao = $app.findRecordById('caixa_sessoes', sessaoId)
      if (!sessao || !sessao.getBool('ativo')) {
        throw new BadRequestError('Sessão de caixa não encontrada.')
      }
      const empresaId = sessao.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)

      // 1. Movimentos de sangria e suprimento
      let totalSangrias = 0
      let totalSuprimentos = 0
      try {
        const movs = $app.findRecordsByFilter(
          'caixa_sessoes_movimentos',
          `caixa_sessao_id = '${sessaoId}' && ativo = true`,
          '',
        )
        for (let m = 0; m < movs.length; m++) {
          const tp = movs[m].getString('tipo')
          const vl = Number(movs[m].getFloat('valor') || 0)
          if (tp === 'Sangria') totalSangrias += vl
          else if (tp === 'Suprimento') totalSuprimentos += vl
        }
      } catch (_) {}

      // 2. Vendas da sessão
      let qtdVendasFinalizadas = 0
      let totalVendasFinalizadas = 0
      let totalVendasCanceladas = 0
      const idsFinalizadas = []
      try {
        const vendasSessao = $app.findRecordsByFilter(
          'vendas',
          `caixa_sessao_id = '${sessaoId}' && ativo = true`,
          'created',
        )
        for (let v = 0; v < vendasSessao.length; v++) {
          const vd = vendasSessao[v]
          const st = vd.getString('status')
          const valTot = Number(vd.getFloat('valor_total') || 0)
          if (st === 'Finalizada') {
            qtdVendasFinalizadas++
            totalVendasFinalizadas += valTot
            idsFinalizadas.push(vd.id)
          } else if (st === 'Cancelada') {
            totalVendasCanceladas += valTot
          }
        }
      } catch (_) {}

      // 3. Pagamentos por forma de pagamento (valor líquido = bruto - troco)
      const formasMap = new Map()
      try {
        const todasFormas = $app.findRecordsByFilter(
          'formas_pagamento',
          'ativo = true',
          'descricao',
        )
        for (let f = 0; f < todasFormas.length; f++) {
          const fm = todasFormas[f]
          formasMap.set(fm.id, {
            forma_id: fm.id,
            forma_descricao: fm.getString('descricao'),
            codigo_tpag: fm.getString('codigo_tpag'),
            tipo: fm.getString('tipo'),
            quantidade_vendas: 0,
            valor_esperado: 0,
          })
        }
      } catch (_) {}

      let totalDinheiroVendas = 0

      for (let i = 0; i < idsFinalizadas.length; i++) {
        const vId = idsFinalizadas[i]
        let pags = []
        try {
          pags = $app.findRecordsByFilter(
            'vendas_pagamentos',
            `venda_id = '${vId}' && ativo = true`,
            '',
          )
        } catch (_) {
          continue
        }

        for (let p = 0; p < pags.length; p++) {
          const pg = pags[p]
          const fId = pg.getString('forma_pagamento_id')
          const vBruto = Number(pg.getFloat('valor') || 0)
          const vTroco = Number(pg.getFloat('troco') || 0)
          const vLiquido = Math.max(0, vBruto - vTroco)

          let entry = formasMap.get(fId)
          if (!entry) {
            try {
              const fm = $app.findRecordById('formas_pagamento', fId)
              entry = {
                forma_id: fm.id,
                forma_descricao: fm.getString('descricao'),
                codigo_tpag: fm.getString('codigo_tpag'),
                tipo: fm.getString('tipo'),
                quantidade_vendas: 0,
                valor_esperado: 0,
              }
              formasMap.set(fId, entry)
            } catch (_) {
              continue
            }
          }

          entry.quantidade_vendas++
          entry.valor_esperado = Number((entry.valor_esperado + vLiquido).toFixed(2))

          const descricao = (entry.forma_descricao || '').toLowerCase()
          if (
            entry.tipo === 'Dinheiro' ||
            entry.codigo_tpag === '01' ||
            descricao.includes('dinheiro')
          ) {
            totalDinheiroVendas += vLiquido
          }
        }
      }

      // 4. Dinheiro esperado na gaveta
      const fundoInicial = Number(sessao.getFloat('valor_abertura') || 0)
      const esperadoDinheiro = Number(
        (fundoInicial + totalSuprimentos + totalDinheiroVendas - totalSangrias).toFixed(2),
      )

      // Filtrar formas que tiveram movimento
      const formasLista = []
      for (const entry of formasMap.values()) {
        if (entry.quantidade_vendas > 0 || entry.valor_esperado > 0) {
          formasLista.push({
            forma_id: entry.forma_id,
            forma_descricao: entry.forma_descricao,
            codigo_tpag: entry.codigo_tpag,
            tipo: entry.tipo,
            quantidade_vendas: entry.quantidade_vendas,
            valor_esperado: entry.valor_esperado,
          })
        }
      }

      return c.json(200, {
        success: true,
        resumo: {
          fundo_inicial: fundoInicial,
          total_suprimentos: Number(totalSuprimentos.toFixed(2)),
          total_sangrias: Number(totalSangrias.toFixed(2)),
          total_vendas: Number(totalVendasFinalizadas.toFixed(2)),
          quantidade_vendas: qtdVendasFinalizadas,
          total_cancelado: Number(totalVendasCanceladas.toFixed(2)),
          total_dinheiro_vendas: Number(totalDinheiroVendas.toFixed(2)),
          esperado_dinheiro: esperadoDinheiro,
          formas: formasLista,
        },
      })
    } catch (err) {
      return c.json(err.status || 400, {
        message: (err && err.message) || 'Erro ao apurar resumo da sessão de caixa.',
      })
    }
  },
  $apis.requireAuth(),
)
