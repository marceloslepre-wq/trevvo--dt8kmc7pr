/// <reference path="../types.d.ts" />

/**
 * mercadolivre_conexao.js — Etapa 10 / Parte 10.1
 *
 * Conexão da conta do Mercado Livre por empresa (OAuth 2.0) e renovação automática do token.
 * Documentação: docs/MERCADO_LIVRE.md
 *
 * ATENÇÃO JSVM (Goja): nenhuma função é declarada no topo deste arquivo. Todos os helpers
 * ficam DENTRO de cada callback, no mesmo padrão dos demais hooks do projeto.
 *
 * Segredos (Skip Cloud, lidos com $os.getenv — nunca gravados em arquivo):
 *   ML_APP_ID, ML_CLIENT_SECRET
 *   ML_REDIRECT_URI (opcional; se vazio, usa https://{host do backend}/backend/v1/mercadolivre/oauth/callback)
 *
 * Rotas:
 *   GET  /backend/v1/mercadolivre/diagnostico          (pública, sem dados sensíveis)
 *   POST /backend/v1/mercadolivre/conexao/iniciar      (autenticada, administrador)
 *   GET  /backend/v1/mercadolivre/oauth/callback       (pública, chamada pelo Mercado Livre)
 *   GET  /backend/v1/mercadolivre/conexao/status       (autenticada)
 *   POST /backend/v1/mercadolivre/conexao/testar       (autenticada)
 *   POST /backend/v1/mercadolivre/conexao/desconectar  (autenticada, administrador)
 *
 * Agendamento:
 *   mercadolivre_renovar_tokens — a cada 30 minutos
 */

// 1) Diagnóstico público: confirma que rotas e coleções existem e informa a URL de callback.
routerAdd('GET', '/backend/v1/mercadolivre/diagnostico', (c) => {
  let appId = ''
  let secret = ''
  let redirectFixo = ''
  try {
    appId = ($os.getenv('ML_APP_ID') || '').trim()
  } catch (_) {}
  try {
    secret = ($os.getenv('ML_CLIENT_SECRET') || '').trim()
  } catch (_) {}
  try {
    redirectFixo = ($os.getenv('ML_REDIRECT_URI') || '').trim()
  } catch (_) {}

  let tabContas = false
  let tabEstados = false
  try {
    tabContas = $app.hasTable('mercadolivre_contas')
  } catch (_) {}
  try {
    tabEstados = $app.hasTable('mercadolivre_oauth_estados')
  } catch (_) {}

  const urlCallback =
    redirectFixo || 'https://' + c.request.host + '/backend/v1/mercadolivre/oauth/callback'

  return c.json(200, {
    sucesso: true,
    rotas_carregadas: true,
    colecao_mercadolivre_contas: tabContas,
    colecao_mercadolivre_oauth_estados: tabEstados,
    segredo_ML_APP_ID_configurado: !!appId,
    segredo_ML_CLIENT_SECRET_configurado: !!secret,
    url_callback_para_cadastrar_no_mercado_livre: urlCallback,
  })
})

// 2) Iniciar a conexão: devolve a URL de autorização do Mercado Livre.
routerAdd(
  'POST',
  '/backend/v1/mercadolivre/conexao/iniciar',
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
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
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

    try {
      const seg = segredosML()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          erro: 'segredos_ausentes',
          mensagem:
            'Integração não configurada: cadastre os Segredos ML_APP_ID e ML_CLIENT_SECRET no Skip Cloud.',
        })
      }

      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem conectar a conta do Mercado Livre.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())

      let redirectUri = ''
      try {
        redirectUri = ($os.getenv('ML_REDIRECT_URI') || '').trim()
      } catch (_) {}
      if (!redirectUri) {
        redirectUri = 'https://' + c.request.host + '/backend/v1/mercadolivre/oauth/callback'
      }

      let retornoUrl = String(body.retorno_url || '').trim()
      if (retornoUrl && !/^https:\/\/[^\s]+$/.test(retornoUrl) && !/^http:\/\/localhost[:\/]/.test(retornoUrl)) {
        retornoUrl = ''
      }

      const estado = $security.randomString(48)
      const col = $app.findCollectionByNameOrId('mercadolivre_oauth_estados')
      const rec = new Record(col)
      rec.set('estado', estado)
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('empresa_id', empresa.id)
      rec.set('usuario_id', auth.id)
      rec.set('redirect_uri', redirectUri)
      rec.set('retorno_url', retornoUrl)
      rec.set('expira_em', new Date(Date.now() + 10 * 60 * 1000).toISOString())
      rec.set('usado', false)
      $app.save(rec)

      const url =
        'https://auth.mercadolivre.com.br/authorization?response_type=code' +
        '&client_id=' +
        encodeURIComponent(seg.appId) +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&state=' +
        encodeURIComponent(estado)

      return c.json(200, { sucesso: true, url_autorizacao: url, url_callback: redirectUri })
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

// 3) Callback do OAuth (público): troca o code pelos tokens e grava na conta da empresa.
routerAdd('GET', '/backend/v1/mercadolivre/oauth/callback', (c) => {

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
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
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

    function responder(ok, motivo, retornoUrl) {
      if (retornoUrl) {
        const sep = retornoUrl.indexOf('?') >= 0 ? '&' : '?'
        const destino =
          retornoUrl +
          sep +
          'resultado=' +
          (ok ? 'ok' : 'erro') +
          (ok ? '' : '&motivo=' + encodeURIComponent(motivo || ''))
        return c.redirect(302, destino)
      }
      const titulo = ok ? 'Conta do Mercado Livre conectada' : 'Não foi possível conectar'
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
    const code = String(q['code'] || '').trim()
    const estado = String(q['state'] || '').trim()
    const erroML = String(q['error'] || '').trim()

    if (!/^[A-Za-z0-9]{20,100}$/.test(estado)) {
      return responder(false, 'Parâmetro state inválido.', '')
    }

    let estRec = null
    try {
      const recs = $app.findRecordsByFilter(
        'mercadolivre_oauth_estados',
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
    // Uso único: marca como usado antes de qualquer chamada externa.
    estRec.set('usado', true)
    $app.save(estRec)

    if (new Date(estRec.getString('expira_em')).getTime() < Date.now()) {
      return responder(false, 'A solicitação de conexão expirou. Tente novamente.', retornoUrl)
    }
    if (erroML) {
      return responder(false, 'Autorização não concedida no Mercado Livre (' + erroML + ').', retornoUrl)
    }
    if (!code) return responder(false, 'O Mercado Livre não devolveu o código de autorização.', retornoUrl)

    const seg = segredosML()
    if (!seg.ok) {
      return responder(false, 'Segredos ML_APP_ID e ML_CLIENT_SECRET não configurados.', retornoUrl)
    }

    const r = pedirToken({
      grant_type: 'authorization_code',
      client_id: seg.appId,
      client_secret: seg.secret,
      code: code,
      redirect_uri: estRec.getString('redirect_uri'),
    })
    if (r.status !== 200 || !r.dados || !r.dados.access_token) {
      console.log('[mercadolivre] Falha na troca do code: HTTP ' + r.status)
      return responder(false, mensagemErroML(r), retornoUrl)
    }

    const u = consultarUsuarioML(r.dados.access_token)
    if (u.status !== 200 || !u.dados || !u.dados.id) {
      return responder(false, 'Não foi possível ler os dados da conta. ' + mensagemErroML(u), retornoUrl)
    }
    const mlUserId = String(u.dados.id)
    const empresaId = estRec.getString('empresa_id')

    // A mesma conta do Mercado Livre não pode ficar ligada a duas empresas.
    try {
      const outras = $app.findRecordsByFilter(
        'mercadolivre_contas',
        "ml_user_id = '" + mlUserId.replace(/[^0-9A-Za-z]/g, '') + "' && empresa_id != '" + empresaId + "' && status != 'Desconectada'",
        '-created',
        1,
        0,
      )
      if (outras && outras.length > 0) {
        return responder(
          false,
          'Esta conta do Mercado Livre já está conectada a outra empresa. Desconecte lá primeiro.',
          retornoUrl,
        )
      }
    } catch (_) {}

    let conta = null
    try {
      const recs = $app.findRecordsByFilter(
        'mercadolivre_contas',
        "empresa_id = '" + empresaId + "'",
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) conta = recs[0]
    } catch (_) {}
    if (!conta) {
      conta = new Record($app.findCollectionByNameOrId('mercadolivre_contas'))
      conta.set('empresa_id', empresaId)
      conta.set('ativo', true)
    }
    conta.set('assinante_id', estRec.getString('assinante_id'))
    conta.set('ml_user_id', mlUserId)
    conta.set('ml_nickname', String(u.dados.nickname || ''))
    conta.set('site_id', String(u.dados.site_id || 'MLB'))
    conta.set('conectada_em', new Date().toISOString())
    conta.set('conectada_por', estRec.getString('usuario_id'))
    gravarTokens(conta, r.dados)
    $app.save(conta)

    return responder(true, '', retornoUrl)
  } catch (err) {
    console.log('[mercadolivre] Erro no callback: ' + (err && err.message ? err.message : String(err)))
    return responder(false, 'Erro interno ao concluir a conexão.', retornoUrl)
  }
})

// 4) Status da conexão da empresa (nunca devolve os tokens).
routerAdd(
  'GET',
  '/backend/v1/mercadolivre/conexao/status',
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
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
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

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
      const seg = segredosML()
      const conta = contaDaEmpresa(empresa.id)

      let redirectUri = ''
      try {
        redirectUri = ($os.getenv('ML_REDIRECT_URI') || '').trim()
      } catch (_) {}
      if (!redirectUri) {
        redirectUri = 'https://' + c.request.host + '/backend/v1/mercadolivre/oauth/callback'
      }

      return c.json(200, {
        sucesso: true,
        segredos_configurados: seg.ok,
        url_callback: redirectUri,
        pode_gerenciar: ctx.admin,
        status: conta ? conta.getString('status') || 'Desconectada' : 'Desconectada',
        ml_nickname: conta ? conta.getString('ml_nickname') : '',
        ml_user_id: conta ? conta.getString('ml_user_id') : '',
        token_expira_em: conta ? conta.getString('token_expira_em') : '',
        ultima_renovacao_em: conta ? conta.getString('ultima_renovacao_em') : '',
        conectada_em: conta ? conta.getString('conectada_em') : '',
        ultimo_erro: conta ? conta.getString('ultimo_erro') : '',
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao consultar o status.',
      })
    }
  },
  $apis.requireAuth(),
)

// 5) Testar a conexão: renova o token se estiver perto de vencer e chama /users/me.
routerAdd(
  'POST',
  '/backend/v1/mercadolivre/conexao/testar',
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
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
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

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const seg = segredosML()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Segredos ML_APP_ID e ML_CLIENT_SECRET não configurados.',
        })
      }
      const conta = contaDaEmpresa(empresa.id)
      if (!conta || conta.getString('status') === 'Desconectada' || !conta.getString('refresh_token')) {
        return c.json(400, { sucesso: false, mensagem: 'Nenhuma conta do Mercado Livre conectada nesta empresa.' })
      }

      // Renova na hora se faltar menos de 5 minutos (ou se já venceu).
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
          if (r.status === 400 || r.status === 401) {
            conta.set('status', 'Reconectar')
          }
          conta.set('ultimo_erro', mensagemErroML(r))
          $app.save(conta)
          return c.json(400, { sucesso: false, mensagem: 'Falha ao renovar o token. ' + mensagemErroML(r) })
        }
      }

      const u = consultarUsuarioML(conta.getString('access_token'))
      if (u.status !== 200) {
        return c.json(400, { sucesso: false, mensagem: mensagemErroML(u) })
      }
      return c.json(200, {
        sucesso: true,
        mensagem: 'Conexão funcionando.',
        ml_nickname: String((u.dados && u.dados.nickname) || ''),
        ml_user_id: String((u.dados && u.dados.id) || ''),
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao testar a conexão.',
      })
    }
  },
  $apis.requireAuth(),
)

// 6) Desconectar: apaga os tokens guardados.
routerAdd(
  'POST',
  '/backend/v1/mercadolivre/conexao/desconectar',
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

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem desconectar a conta do Mercado Livre.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const conta = contaDaEmpresa(empresa.id)
      if (conta) {
        conta.set('access_token', '')
        conta.set('refresh_token', '')
        conta.set('token_expira_em', '')
        conta.set('status', 'Desconectada')
        conta.set('ultimo_erro', '')
        $app.save(conta)
        console.log('[mercadolivre] Conta desconectada. empresa=' + empresa.id + ' usuario=' + auth.id)
      }
      return c.json(200, { sucesso: true, mensagem: 'Conta desconectada.' })
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

// 7) Renovação automática dos tokens, a cada 30 minutos.
cronAdd('mercadolivre_renovar_tokens', '*/30 * * * *', () => {

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
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
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

  try {
    if (!$app.hasTable('mercadolivre_contas')) return
    const seg = segredosML()
    if (!seg.ok) return

    let contas = []
    try {
      contas = $app.findRecordsByFilter(
        'mercadolivre_contas',
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
        // Só renova o que vence nos próximos 90 minutos.
        if (expira && expira - Date.now() > 90 * 60 * 1000) continue

        const r = pedirToken({
          grant_type: 'refresh_token',
          client_id: seg.appId,
          client_secret: seg.secret,
          refresh_token: conta.getString('refresh_token'),
        })
        if (r.status === 200 && r.dados && r.dados.access_token) {
          gravarTokens(conta, r.dados)
          $app.save(conta)
        } else if (r.status === 400 || r.status === 401) {
          // Autorização perdida: o vendedor precisa conectar de novo.
          conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', mensagemErroML(r))
          $app.save(conta)
          console.log('[mercadolivre] Conta precisa reconectar. empresa=' + conta.getString('empresa_id'))
        } else {
          // Falha temporária (rede, 5xx, 429): tenta na próxima execução.
          console.log('[mercadolivre] Renovação adiada: HTTP ' + r.status + ' empresa=' + conta.getString('empresa_id'))
        }
      } catch (errConta) {
        console.log(
          '[mercadolivre] Erro ao renovar token: ' +
            (errConta && errConta.message ? errConta.message : String(errConta)),
        )
      }
    }
  } catch (err) {
    console.log('[mercadolivre] Erro no agendamento: ' + (err && err.message ? err.message : String(err)))
  }
})
