/// <reference path="../types.d.ts" />

/**
 * shopee_conexao.js — Conexão da loja da Shopee por empresa (Open Platform v2)
 * e renovação automática do acesso. Mesmo padrão do Mercado Livre (mercadolivre_conexao.js).
 *
 * ATENÇÃO JSVM (Goja): nenhuma função no topo do arquivo; helpers DENTRO de cada callback.
 *
 * Segredos (Skip Cloud, lidos com $os.getenv — nunca gravados em arquivo):
 *   SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY
 *   SHOPEE_AMBIENTE  (opcional: 'teste' usa partner.test-stable.shopeemobile.com)
 *   SHOPEE_REDIRECT_URI (opcional; se vazio, usa https://{host}/backend/v1/shopee/oauth/callback)
 *
 * Rotas:
 *   GET  /backend/v1/shopee/diagnostico            (pública, sem dados sensíveis)
 *   POST /backend/v1/shopee/conexao/iniciar        (autenticada, administrador)
 *   GET  /backend/v1/shopee/oauth/callback         (pública, chamada pela Shopee)
 *   GET  /backend/v1/shopee/conexao/status         (autenticada)
 *   POST /backend/v1/shopee/conexao/testar         (autenticada)
 *   POST /backend/v1/shopee/conexao/desconectar    (autenticada, administrador)
 *
 * Agendamento: shopee_renovar_tokens — a cada 30 minutos (acesso vale 4h; renovação 30 dias).
 */

// 1) Diagnóstico público.
routerAdd('GET', '/backend/v1/shopee/diagnostico', (c) => {
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
  const seg = segredosShopee()
  let redirect = ''
  try {
    redirect = ($os.getenv('SHOPEE_REDIRECT_URI') || '').trim()
  } catch (_) {}
  return c.json(200, {
    sucesso: true,
    segredos_configurados: seg.ok,
    ambiente: seg.host.indexOf('test-stable') >= 0 ? 'teste' : 'produção',
    colecoes: $app.hasTable('shopee_contas') && $app.hasTable('shopee_oauth_estados'),
    url_callback: redirect || 'https://' + c.request.host + '/backend/v1/shopee/oauth/callback',
  })
})

// 2) Iniciar conexão: devolve a URL de autorização da Shopee.
routerAdd(
  'POST',
  '/backend/v1/shopee/conexao/iniciar',
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
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
    try {
      const seg = segredosShopee()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          erro: 'segredos_ausentes',
          mensagem:
            'Integração não configurada: cadastre os Segredos SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no Skip Cloud.',
        })
      }
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem conectar a loja da Shopee.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())

      let redirectBase = ''
      try {
        redirectBase = ($os.getenv('SHOPEE_REDIRECT_URI') || '').trim()
      } catch (_) {}
      if (!redirectBase) {
        redirectBase = 'https://' + c.request.host + '/backend/v1/shopee/oauth/callback'
      }

      let retornoUrl = String(body.retorno_url || '').trim()
      if (
        retornoUrl &&
        !/^https:\/\/[^\s]+$/.test(retornoUrl) &&
        !/^http:\/\/localhost[:\/]/.test(retornoUrl)
      ) {
        retornoUrl = ''
      }

      // A Shopee não tem "state": o valor de uso único vai na própria URL de retorno.
      const estado = $security.randomString(48)
      const rec = new Record($app.findCollectionByNameOrId('shopee_oauth_estados'))
      rec.set('estado', estado)
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('empresa_id', empresa.id)
      rec.set('usuario_id', auth.id)
      rec.set('retorno_url', retornoUrl)
      rec.set('expira_em', new Date(Date.now() + 10 * 60 * 1000).toISOString())
      rec.set('usado', false)
      $app.save(rec)

      const redirect =
        redirectBase + (redirectBase.indexOf('?') >= 0 ? '&' : '?') + 'estado=' + estado
      const caminho = '/api/v2/shop/auth_partner'
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '') +
        '&redirect=' +
        encodeURIComponent(redirect)

      return c.json(200, { sucesso: true, url_autorizacao: url, url_callback: redirectBase })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao iniciar a conexão.',
      })
    }
  },
  $apis.requireAuth(),
)

// 3) Retorno da autorização (público): troca o code pelos tokens.
routerAdd('GET', '/backend/v1/shopee/oauth/callback', (c) => {
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
  function responder(ok, motivo, retornoUrl) {
    if (retornoUrl) {
      const sep = retornoUrl.indexOf('?') >= 0 ? '&' : '?'
      return c.redirect(
        302,
        retornoUrl +
          sep +
          'resultado=' +
          (ok ? 'ok' : 'erro') +
          (ok ? '' : '&motivo=' + encodeURIComponent(motivo || '')),
      )
    }
    const titulo = ok ? 'Loja da Shopee conectada' : 'Não foi possível conectar'
    const texto = ok
      ? 'Pode fechar esta aba e voltar ao Trevvo.'
      : String(motivo || 'Erro desconhecido.')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
    return c.html(
      ok ? 200 : 400,
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' +
        titulo +
        '</title></head><body style="font-family:sans-serif;padding:40px"><h2>' +
        titulo +
        '</h2><p>' +
        texto +
        '</p></body></html>',
    )
  }

  let retornoUrl = ''
  try {
    const q = c.requestInfo().query || {}
    const estado = String(q['estado'] || '').trim()
    const code = String(q['code'] || '').trim()
    const shopId = String(q['shop_id'] || '').replace(/[^0-9]/g, '')

    if (!/^[A-Za-z0-9]{20,100}$/.test(estado)) return responder(false, 'Parâmetro estado inválido.', '')

    let estRec = null
    try {
      const recs = $app.findRecordsByFilter(
        'shopee_oauth_estados',
        "estado = '" + estado + "'",
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) estRec = recs[0]
    } catch (_) {}
    if (!estRec) return responder(false, 'Solicitação de conexão não encontrada.', '')
    retornoUrl = estRec.getString('retorno_url')

    if (estRec.getBool('usado')) {
      return responder(false, 'Esta solicitação de conexão já foi utilizada.', retornoUrl)
    }
    estRec.set('usado', true)
    $app.save(estRec)

    if (new Date(estRec.getString('expira_em')).getTime() < Date.now()) {
      return responder(false, 'A solicitação de conexão expirou. Tente novamente.', retornoUrl)
    }
    if (!code || !shopId) {
      return responder(
        false,
        'A Shopee não devolveu a autorização da loja (code/shop_id).',
        retornoUrl,
      )
    }

    const seg = segredosShopee()
    if (!seg.ok) {
      return responder(false, 'Segredos SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY não configurados.', retornoUrl)
    }

    const r = pedirToken(seg, '/api/v2/auth/token/get', {
      code: code,
      shop_id: parseInt(shopId, 10),
      partner_id: parseInt(seg.partnerId, 10),
    })
    if (r.status !== 200 || !r.dados || !r.dados.access_token) {
      console.log('[shopee] Falha na troca do code: HTTP ' + r.status)
      return responder(false, mensagemErroShopee(r), retornoUrl)
    }

    const empresaId = estRec.getString('empresa_id')

    // A mesma loja não pode ficar ligada a duas empresas.
    try {
      const outras = $app.findRecordsByFilter(
        'shopee_contas',
        "shop_id = '" +
          shopId +
          "' && empresa_id != '" +
          empresaId +
          "' && status != 'Desconectada'",
        '-created',
        1,
        0,
      )
      if (outras && outras.length > 0) {
        return responder(
          false,
          'Esta loja da Shopee já está conectada a outra empresa. Desconecte lá primeiro.',
          retornoUrl,
        )
      }
    } catch (_) {}

    let conta = contaDaEmpresa(empresaId)
    if (!conta) {
      conta = new Record($app.findCollectionByNameOrId('shopee_contas'))
      conta.set('empresa_id', empresaId)
      conta.set('ativo', true)
    }
    conta.set('assinante_id', estRec.getString('assinante_id'))
    conta.set('shop_id', shopId)
    conta.set('conectada_em', new Date().toISOString())
    conta.set('conectada_por', estRec.getString('usuario_id'))
    gravarTokens(conta, r.dados)

    // Nome da loja (não impede a conexão se falhar).
    try {
      const info = chamarLoja(seg, '/api/v2/shop/get_shop_info', r.dados.access_token, shopId, '')
      if (info.status === 200 && info.dados && !info.dados.error) {
        conta.set('shop_nome', String(info.dados.shop_name || ''))
        conta.set('regiao', String(info.dados.region || ''))
      }
    } catch (_) {}
    $app.save(conta)

    return responder(true, '', retornoUrl)
  } catch (err) {
    console.log('[shopee] Erro no callback: ' + (err && err.message ? err.message : String(err)))
    return responder(false, 'Erro interno ao concluir a conexão.', retornoUrl)
  }
})

// 4) Status da conexão da empresa (nunca devolve os tokens).
routerAdd(
  'GET',
  '/backend/v1/shopee/conexao/status',
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
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
      const seg = segredosShopee()
      let redirect = ''
      try {
        redirect = ($os.getenv('SHOPEE_REDIRECT_URI') || '').trim()
      } catch (_) {}
      const conta = contaDaEmpresa(empresa.id)
      const st = conta ? conta.getString('status') || 'Desconectada' : 'Desconectada'
      return c.json(200, {
        sucesso: true,
        segredos_configurados: seg.ok,
        ambiente: seg.host.indexOf('test-stable') >= 0 ? 'teste' : 'produção',
        pode_gerenciar: ctx.admin,
        status: st,
        shop_id: conta ? conta.getString('shop_id') : '',
        shop_nome: conta ? conta.getString('shop_nome') : '',
        regiao: conta ? conta.getString('regiao') : '',
        conectada_em: conta ? conta.getString('conectada_em') : '',
        ultima_renovacao_em: conta ? conta.getString('ultima_renovacao_em') : '',
        token_expira_em: conta ? conta.getString('token_expira_em') : '',
        refresh_expira_em: conta ? conta.getString('refresh_expira_em') : '',
        ultimo_erro: conta ? conta.getString('ultimo_erro') : '',
        url_callback: redirect || 'https://' + c.request.host + '/backend/v1/shopee/oauth/callback',
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao consultar a conexão.',
      })
    }
  },
  $apis.requireAuth(),
)

// 5) Testar: renova se preciso e lê os dados da loja.
routerAdd(
  'POST',
  '/backend/v1/shopee/conexao/testar',
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
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const seg = segredosShopee()
      if (!seg.ok) return c.json(400, { sucesso: false, mensagem: 'Segredos da Shopee não configurados.' })
      const conta = contaDaEmpresa(empresa.id)
      if (!conta || conta.getString('status') === 'Desconectada' || !conta.getString('refresh_token')) {
        return c.json(400, { sucesso: false, mensagem: 'Nenhuma loja da Shopee conectada nesta empresa.' })
      }
      const shopId = conta.getString('shop_id')
      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 5 * 60 * 1000) {
        const r = pedirToken(seg, '/api/v2/auth/access_token/get', {
          refresh_token: conta.getString('refresh_token'),
          shop_id: parseInt(shopId, 10),
          partner_id: parseInt(seg.partnerId, 10),
        })
        if (r.status === 200 && r.dados && r.dados.access_token) {
          gravarTokens(conta, r.dados)
          $app.save(conta)
        } else {
          conta.set('ultimo_erro', mensagemErroShopee(r))
          $app.save(conta)
          return c.json(400, { sucesso: false, mensagem: 'Falha ao renovar o acesso. ' + mensagemErroShopee(r) })
        }
      }
      const info = chamarLoja(seg, '/api/v2/shop/get_shop_info', conta.getString('access_token'), shopId, '')
      if (info.status !== 200 || !info.dados || info.dados.error) {
        return c.json(400, { sucesso: false, mensagem: mensagemErroShopee(info) })
      }
      conta.set('shop_nome', String(info.dados.shop_name || ''))
      conta.set('regiao', String(info.dados.region || ''))
      $app.save(conta)
      return c.json(200, {
        sucesso: true,
        shop_nome: String(info.dados.shop_name || ''),
        status_loja: String(info.dados.status || ''),
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha no teste de conexão.',
      })
    }
  },
  $apis.requireAuth(),
)

// 6) Desconectar: apaga os tokens desta empresa (a autorização na Shopee pode ser revogada lá).
routerAdd(
  'POST',
  '/backend/v1/shopee/conexao/desconectar',
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
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, { sucesso: false, mensagem: 'Apenas administradores podem desconectar.' })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const conta = contaDaEmpresa(empresa.id)
      if (conta) {
        conta.set('access_token', '')
        conta.set('refresh_token', '')
        conta.set('token_expira_em', '')
        conta.set('refresh_expira_em', '')
        conta.set('status', 'Desconectada')
        conta.set('ultimo_erro', '')
        $app.save(conta)
      }
      return c.json(200, { sucesso: true, mensagem: 'Loja da Shopee desconectada desta empresa.' })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao desconectar.',
      })
    }
  },
  $apis.requireAuth(),
)

// Renovação automática do acesso (vale 4h). Renova o que vence nos próximos 90 minutos.
cronAdd('shopee_renovar_tokens', '*/30 * * * *', () => {
    // ---- Helpers Shopee (locais: JSVM não enxerga funções do topo do arquivo) ----
    function segredosShopee() {
      let pid = ''
      let key = ''
      let amb = ''
      try {
        pid = ($os.getenv('SHOPEE_PARTNER_ID') || '').trim()
      } catch (_) {}
      try {
        key = ($os.getenv('SHOPEE_PARTNER_KEY') || '').trim()
      } catch (_) {}
      try {
        amb = ($os.getenv('SHOPEE_AMBIENTE') || '').trim().toLowerCase()
      } catch (_) {}
      const host =
        amb === 'teste' || amb === 'sandbox'
          ? 'https://partner.test-stable.shopeemobile.com'
          : 'https://partner.shopeemobile.com'
      return { partnerId: pid.replace(/[^0-9]/g, ''), key: key, host: host, ok: !!(pid && key) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Assinatura Shopee v2: HMAC-SHA256 (hex) de partner_id + caminho + timestamp [+ token + shop_id].
    function assinar(seg, caminho, ts, token, shopId) {
      return $security.hs256(seg.partnerId + caminho + ts + (token || '') + (shopId || ''), seg.key)
    }

    // Chamadas de token (code ou refresh). Nunca registrar em log o corpo (contém tokens).
    function pedirToken(seg, caminho, corpo) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&sign=' +
        assinar(seg, caminho, ts, '', '')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Chamada GET de loja (com access_token e shop_id).
    function chamarLoja(seg, caminho, token, shopId, extras) {
      const ts = Math.floor(Date.now() / 1000)
      const url =
        seg.host +
        caminho +
        '?partner_id=' +
        seg.partnerId +
        '&timestamp=' +
        ts +
        '&access_token=' +
        encodeURIComponent(token) +
        '&shop_id=' +
        shopId +
        '&sign=' +
        assinar(seg, caminho, ts, token, shopId) +
        (extras || '')
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expire_in, 10) || 14400
      conta.set('access_token', dados.access_token || '')
      // O refresh_token da Shopee muda a cada renovação: sempre gravar o novo.
      if (dados.refresh_token) {
        conta.set('refresh_token', dados.refresh_token)
        conta.set('refresh_expira_em', new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroShopee(r) {
      const d = (r && r.dados) || {}
      const txt = [d.error || '', d.message || ''].filter((x) => !!x).join(' - ')
      return 'Shopee respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'shopee_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }
  try {
    if (!$app.hasTable('shopee_contas')) return
    const seg = segredosShopee()
    if (!seg.ok) return
    let contas = []
    try {
      contas = $app.findRecordsByFilter(
        'shopee_contas',
        "status = 'Conectada' && refresh_token != ''",
        'token_expira_em',
        500,
        0,
      )
    } catch (_) {
      contas = []
    }
    for (let i = 0; i < contas.length; i++) {
      const conta = contas[i]
      try {
        const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
        if (expira && expira - Date.now() > 90 * 60 * 1000) continue
        const r = pedirToken(seg, '/api/v2/auth/access_token/get', {
          refresh_token: conta.getString('refresh_token'),
          shop_id: parseInt(conta.getString('shop_id'), 10),
          partner_id: parseInt(seg.partnerId, 10),
        })
        if (r.status === 200 && r.dados && r.dados.access_token) {
          gravarTokens(conta, r.dados)
          $app.save(conta)
        } else if (
          r.dados &&
          (r.dados.error === 'error_auth' || r.dados.error === 'error_param' || r.status === 403)
        ) {
          conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', mensagemErroShopee(r))
          $app.save(conta)
          console.log('[shopee] Loja precisa reconectar. empresa=' + conta.getString('empresa_id'))
        } else {
          console.log('[shopee] Renovação adiada: HTTP ' + r.status + ' empresa=' + conta.getString('empresa_id'))
        }
      } catch (errConta) {
        console.log('[shopee] Erro ao renovar: ' + (errConta && errConta.message ? errConta.message : String(errConta)))
      }
    }
  } catch (err) {
    console.log('[shopee] Erro no agendamento: ' + (err && err.message ? err.message : String(err)))
  }
})
