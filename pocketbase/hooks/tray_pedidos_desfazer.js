/// <reference path="../types.d.ts" />

/**
 * tray_pedidos_desfazer.js — Apaga pedidos importados da Tray que ainda estão em aberto
 *
 * Só apaga vendas da empresa com origem_externa = 'tray', status "Pedido em aberto" e sem
 * documento fiscal (nada faturado, nenhum estoque baixado, nenhum título gerado). Clientes
 * cadastrados pela importação ficam (são clientes reais). Não mexe na Tray.
 * previa = true só conta. Apaga no máximo 150 pedidos por chamada; a tela repete até zerar.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; sem spread; sem require.
 *
 * Rota:
 *   POST /backend/v1/tray/pedidos/desfazer   (administrador)
 *   body { empresa_id, previa: bool, confirmar: true }
 */
routerAdd(
  'POST',
  '/backend/v1/tray/pedidos/desfazer',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    // ---- Helpers locais (JSVM: precisam ficar DENTRO do callback) ----
    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }

    function eMasterLocal(auth) {
      if (!auth) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    // Devolve { usuarioRec, assinanteId, admin, empresas[] } seguindo a mesma regra de tenancy.js
    function contextoDoUsuario(auth) {
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')

      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')

      const master = eMasterLocal(auth)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + auth.id + "'",
              '-created',
              1,
              0,
            )
            if (imp && imp.length > 0 && imp[0].getString('assinante_id')) {
              assinanteId = imp[0].getString('assinante_id')
            }
          }
        } catch (_) {}
      }

      let admin = master
      const perfilId = usuarioRec.getString('perfil_id')
      if (!admin && perfilId) {
        try {
          const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
          if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
            admin = true
          }
        } catch (_) {}
      }

      let empresas = []
      if (admin) {
        try {
          empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
        } catch (_) {
          empresas = []
        }
      } else {
        const ids = {}
        const padraoId = usuarioRec.getString('empresa_padrao_id')
        if (padraoId) ids[padraoId] = true
        try {
          const vinc = $app.findRecordsByFilter(
            'usuarios_empresas',
            "usuario_id = '" + usuarioRec.id + "' && ativo = true",
            '',
            500,
            0,
          )
          for (let i = 0; i < vinc.length; i++) {
            const eId = vinc[i].getString('empresa_id')
            if (eId) ids[eId] = true
          }
        } catch (_) {}
        Object.keys(ids).forEach((eId) => {
          try {
            const emp = $app.findRecordById('empresas', eId)
            if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
              empresas.push(emp)
            }
          } catch (_) {}
        })
      }

      return { usuarioRec: usuarioRec, assinanteId: assinanteId, admin: admin, empresas: empresas }
    }

    function exigirEmpresa(ctx, empresaId) {
      if (!idValido(empresaId)) throw new BadRequestError('ID da empresa é obrigatório.')
      for (let i = 0; i < ctx.empresas.length; i++) {
        if (ctx.empresas[i].id === empresaId) return ctx.empresas[i]
      }
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }

    try {
      let corpo = {}
      try {
        corpo = (c.requestInfo() || {}).body || {}
      } catch (_) {
        corpo = {}
      }
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Somente administradores podem apagar pedidos importados.',
        })
      }
      if (corpo.confirmar !== true) {
        return c.json(400, { sucesso: false, mensagem: 'Confirmação obrigatória.' })
      }
      const empresa = exigirEmpresa(ctx, String(corpo.empresa_id || '').trim())
      const filtro =
        "empresa_id = '" +
        empresa.id +
        "' && origem_externa = 'tray' && status = 'Pedido em aberto' && documento_fiscal_id = ''" +
        " && documento_fiscal_status != 'Autorizada'"

      let recs = []
      try {
        recs = $app.findRecordsByFilter('vendas', filtro, '-numero', 5000, 0)
      } catch (_) {
        recs = []
      }

      if (corpo.previa === true) {
        let total = 0
        let maisAntigo = ''
        let maisNovo = ''
        for (let i = 0; i < recs.length; i++) {
          total += recs[i].getFloat('valor_total') || 0
          const d = recs[i].getString('data_emissao').slice(0, 10)
          if (d && (!maisAntigo || d < maisAntigo)) maisAntigo = d
          if (d && (!maisNovo || d > maisNovo)) maisNovo = d
        }
        return c.json(200, {
          sucesso: true,
          quantidade: recs.length,
          valor_total: Math.round(total * 100) / 100,
          data_mais_antiga: maisAntigo,
          data_mais_nova: maisNovo,
        })
      }

      let apagados = 0
      const falhas = []
      const limite = Math.min(recs.length, 150)
      for (let i = 0; i < limite; i++) {
        const v = recs[i]
        try {
          $app.runInTransaction((tx) => {
            const itens = tx.findRecordsByFilter(
              'vendas_itens',
              "venda_id = '" + v.id + "'",
              '',
              1000,
              0,
            )
            for (let k = 0; k < itens.length; k++) tx.delete(itens[k])
            tx.delete(tx.findRecordById('vendas', v.id))
          })
          apagados++
        } catch (errDel) {
          falhas.push({
            numero: v.getInt('numero'),
            motivo: String(errDel && errDel.message ? errDel.message : errDel).slice(0, 200),
          })
        }
      }
      console.log(
        '[tray/pedidos/desfazer] empresa ' +
          empresa.id +
          ': ' +
          apagados +
          ' pedidos importados apagados pelo usuário ' +
          auth.id,
      )
      return c.json(200, {
        sucesso: true,
        apagados: apagados,
        falhas: falhas,
        restantes: recs.length - apagados,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao apagar os pedidos importados.',
      })
    }
  },
  $apis.requireAuth(),
)
