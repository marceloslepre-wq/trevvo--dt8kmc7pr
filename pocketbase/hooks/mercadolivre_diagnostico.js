/// <reference path="../types.d.ts" />

/**
 * mercadolivre_diagnostico.js — diagnóstico de UM anúncio do Mercado Livre (SOMENTE LEITURA)
 *
 * Mostra como o Mercado Livre descreve o anúncio (status, sub_status, tags, estoque, saúde e
 * avisos de moderação) e se ele aparece nas buscas por status usadas pela verificação diária
 * da saúde dos anúncios (anuncios_saude.js). Serve para ajustar as regras de classificação.
 * Não grava nada no Mercado Livre. No Trevvo grava só a renovação do token da conta.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; sem spread de objetos.
 *
 * Rota (administradores):
 *   GET /backend/v1/mercadolivre/anuncio-diagnostico?empresa_id=&anuncio=MLB...
 */
routerAdd(
  'GET',
  '/backend/v1/mercadolivre/anuncio-diagnostico',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth)
      return c.json(401, {
        sucesso: false,
        mensagem: 'Autenticação obrigatória.',
      })

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

      return {
        usuarioRec: usuarioRec,
        assinanteId: assinanteId,
        admin: admin,
        empresas: empresas,
      }
    }

    function exigirEmpresa(ctx, empresaId) {
      if (!idValido(empresaId)) throw new BadRequestError('ID da empresa é obrigatório.')
      for (let i = 0; i < ctx.empresas.length; i++) {
        if (ctx.empresas[i].id === empresaId) return ctx.empresas[i]
      }
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'mercadolivre_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }

    // ---- Helpers de chamada ao Mercado Livre (locais ao callback) ----
    function segredosML() {
      let appId = ''
      let secret = ''
      try {
        appId = ($os.getenv('ML_APP_ID') || '').trim()
      } catch (_) {}
      try {
        secret = ($os.getenv('ML_CLIENT_SECRET') || '').trim()
      } catch (_) {}
      return { appId: appId, secret: secret, ok: !!(appId && secret) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Nunca registrar em log os parâmetros desta chamada (contêm segredo, code e tokens).
    function pedirToken(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      const res = $http.send({
        method: 'POST',
        url: 'https://api.mercadolibre.com/oauth/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: partes.join('&'),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function consultarUsuarioML(accessToken) {
      const res = $http.send({
        method: 'GET',
        url: 'https://api.mercadolibre.com/users/me',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          Accept: 'application/json',
        },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expires_in, 10) || 21600
      conta.set('access_token', dados.access_token || '')
      // O refresh_token do Mercado Livre é de uso único: sempre gravar o novo.
      if (dados.refresh_token) conta.set('refresh_token', dados.refresh_token)
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroML(r) {
      const d = (r && r.dados) || {}
      const txt = d.message || d.error_description || d.error || ''
      return 'Mercado Livre respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function chamarML(caminho, token) {
      const res = $http.send({
        method: 'GET',
        url: 'https://api.mercadolibre.com' + caminho,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        },
        timeout: 15,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Procura o atributo SELLER_SKU em uma lista de atributos do Mercado Livre.
    function skuDosAtributos(attrs) {
      if (!attrs || !attrs.length) return ''
      for (let i = 0; i < attrs.length; i++) {
        if (attrs[i] && attrs[i].id === 'SELLER_SKU') {
          return String(attrs[i].value_name || '').trim()
        }
      }
      return ''
    }

    // Corta textos longos para a resposta não ficar enorme.
    function resumir(obj, max) {
      let s = ''
      try {
        s = JSON.stringify(obj)
      } catch (_) {
        s = String(obj)
      }
      if (s.length > max) s = s.slice(0, max) + '... (cortado)'
      return s
    }

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, { sucesso: false, mensagem: 'Apenas administradores.' })
      }
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
      const anuncio = String(q['anuncio'] || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
      if (!/^MLB[0-9]{5,15}$/.test(anuncio))
        throw new BadRequestError('Informe o anúncio (MLB...).')

      const seg = segredosML()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Segredos do Mercado Livre não configurados.',
        })
      }
      const conta = contaDaEmpresa(empresa.id)
      if (
        !conta ||
        conta.getString('status') !== 'Conectada' ||
        !conta.getString('refresh_token')
      ) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Nenhuma conta do Mercado Livre conectada nesta empresa.',
        })
      }
      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 5 * 60 * 1000) {
        const r = pedirToken({
          grant_type: 'refresh_token',
          client_id: seg.appId,
          client_secret: seg.secret,
          refresh_token: conta.getString('refresh_token'),
        })
        if (r.status === 200 && r.dados && r.dados.access_token) {
          gravarTokens(conta, r.dados)
          $app.save(conta)
        } else {
          return c.json(400, {
            sucesso: false,
            mensagem: 'Falha ao renovar o token. ' + mensagemErroML(r),
          })
        }
      }
      const token = conta.getString('access_token')
      const mlUserId = conta.getString('ml_user_id').replace(/[^0-9]/g, '')

      const ri = chamarML('/items/' + anuncio + '?include_attributes=all', token)
      const item = ri.dados || {}
      const variacoes = []
      const vars = item.variations || []
      for (let i = 0; i < vars.length; i++) {
        variacoes.push({
          id: vars[i].id,
          sku: skuDosAtributos(vars[i].attributes) || String(vars[i].seller_custom_field || ''),
          estoque: vars[i].available_quantity,
        })
      }

      // Em quais buscas por status (as mesmas da verificação diária) o anúncio aparece.
      const buscas = {}
      if (mlUserId) {
        const status = ['active', 'paused', 'inactive', 'under_review', 'closed']
        const skuItem =
          skuDosAtributos(item.attributes) || String(item.seller_custom_field || '').trim()
        for (let s = 0; s < status.length; s++) {
          if (!skuItem) {
            buscas[status[s]] = 'sem SKU para buscar'
            continue
          }
          const rb = chamarML(
            '/users/' +
              mlUserId +
              '/items/search?status=' +
              status[s] +
              '&seller_sku=' +
              encodeURIComponent(skuItem) +
              '&limit=50',
            token,
          )
          const res = (rb.dados && rb.dados.results) || []
          let achou = false
          for (let k = 0; k < res.length; k++) if (String(res[k]) === anuncio) achou = true
          buscas[status[s]] =
            rb.status === 200 ? (achou ? 'aparece' : 'não aparece') : 'HTTP ' + rb.status
        }
      }

      // Outros pontos de leitura que podem trazer o motivo do bloqueio (alguns podem não existir).
      const extras = {}
      const caminhos = {
        saude: '/items/' + anuncio + '/health',
        saude_acoes: '/items/' + anuncio + '/health/actions',
        moderacao: '/moderations/last_moderation/' + anuncio,
      }
      Object.keys(caminhos).forEach((k) => {
        const r = chamarML(caminhos[k], token)
        extras[k] = { http: r.status, dados: resumir(r.dados, 3000) }
      })

      return c.json(200, {
        sucesso: true,
        somente_leitura: true,
        anuncio: anuncio,
        http_item: ri.status,
        item: {
          titulo: item.title,
          status: item.status,
          sub_status: item.sub_status,
          tags: item.tags,
          estoque: item.available_quantity,
          vendidos: item.sold_quantity,
          tipo: item.listing_type_id,
          catalogo: item.catalog_listing,
          health: item.health,
          warnings: item.warnings,
          criado_em: item.date_created,
          atualizado_em: item.last_updated,
          sku: skuDosAtributos(item.attributes) || String(item.seller_custom_field || ''),
          variacoes: variacoes,
          campos: Object.keys(item),
        },
        buscas_por_status: buscas,
        extras: extras,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao consultar o Mercado Livre.',
      })
    }
  },
  $apis.requireAuth(),
)
