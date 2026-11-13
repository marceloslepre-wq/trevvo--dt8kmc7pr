/// <reference path="../types.d.ts" />

/**
 * tray_conexao.js — Etapa 11 / Parte 11.1
 * BISSEÇÃO: diagnostico + conexao/iniciar + oauth/callback.
 */

routerAdd('GET', '/backend/v1/tray/diagnostico', (c) => {
  let key = ''
  let secret = ''
  try {
    key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
  } catch (_) {}
  try {
    secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
  } catch (_) {}
  let t1 = false
  let t2 = false
  try {
    t1 = $app.hasTable('tray_contas')
  } catch (_) {}
  try {
    t2 = $app.hasTable('tray_oauth_estados')
  } catch (_) {}
  return c.json(200, {
    sucesso: true,
    rotas_carregadas: true,
    colecao_tray_contas: t1,
    colecao_tray_oauth_estados: t2,
    segredo_TRAY_CONSUMER_KEY_configurado: !!key,
    segredo_TRAY_CONSUMER_SECRET_configurado: !!secret,
    url_base_de_callback: 'https://' + c.request.host + '/backend/v1/tray/oauth/callback',
  })
})

routerAdd(
  'POST',
  '/backend/v1/tray/conexao/iniciar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }
    function eMasterLocal(a) {
      if (!a) return false
      try {
        const u = $app.findRecordById('_pb_users_auth_', a.id)
        return !!(u && u.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }
    function contextoDoUsuario(a) {
      let usuarioRec = null
      try {
        const recs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + a.id + "' || id = '" + a.id + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) usuarioRec = recs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')
      const master = eMasterLocal(a)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + a.id + "'",
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
          const p = $app.findRecordById('perfis_acesso', perfilId)
          if (p && p.getBool('ativo') && p.getBool('administrador')) admin = true
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
    function hostDaLoja(raw) {
      let s = String(raw || '')
        .trim()
        .toLowerCase()
      if (!s) return ''
      if (s.indexOf('://') >= 0) s = s.split('://')[1] || ''
      s = s.split('/')[0]
      s = s.split(':')[0]
      s = s.split('?')[0]
      if (s.indexOf('www.') === 0) s = s.slice(4)
      return s
    }

    try {
      let key = ''
      let secret = ''
      try {
        key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
      } catch (_) {}
      try {
        secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
      } catch (_) {}
      if (!key || !secret) {
        return c.json(400, {
          sucesso: false,
          erro: 'segredos_ausentes',
          mensagem:
            'Integração não configurada: cadastre os Segredos TRAY_CONSUMER_KEY e TRAY_CONSUMER_SECRET no Skip Cloud.',
        })
      }

      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem conectar a loja da Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())

      const host = hostDaLoja(String(body.loja_url || '').trim())
      if (!host || host.indexOf('.') < 0) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Informe a URL da loja Tray (ex.: https://sualoja.tray.com.br).',
        })
      }

      let retornoUrl = String(body.retorno_url || '').trim()
      if (
        retornoUrl &&
        !/^https:\/\/[^\s]+$/.test(retornoUrl) &&
        !/^http:\/\/localhost[:\/]/.test(retornoUrl)
      ) {
        retornoUrl = ''
      }

      // Endereço da API da Tray: lojas *.tray.com.br usam a API em api.tray.com.br;
      // domínio próprio usa a API no próprio host da loja (padrão Tray).
      let apiAddress = 'https://api.tray.com.br'
      if (host.indexOf('.tray.com.br') < 0) {
        apiAddress = 'https://' + host
      }

      const estado = $security.randomString(48)
      const col = $app.findCollectionByNameOrId('tray_oauth_estados')
      const rec = new Record(col)
      rec.set('estado', estado)
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('empresa_id', empresa.id)
      rec.set('usuario_id', auth.id)
      rec.set('loja_host', host)
      rec.set('retorno_url', retornoUrl)
      rec.set('expira_em', new Date(Date.now() + 10 * 60 * 1000).toISOString())
      rec.set('usado', false)
      $app.save(rec)

      const url =
        'https://' +
        host +
        '/auth_code?consumer_key=' +
        encodeURIComponent(key) +
        '&callback=' +
        encodeURIComponent('https://' + c.request.host + '/backend/v1/tray/oauth/callback') +
        '&state=' +
        encodeURIComponent(estado)

      return c.json(200, { sucesso: true, url_autorizacao: url, loja_host: host })
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

// 5) Testar a conexão: renova o token se estiver perto de vencer e consulta a loja.
routerAdd(
  'POST',
  '/backend/v1/tray/conexao/testar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }
    function eMasterLocal(a) {
      if (!a) return false
      try {
        const u = $app.findRecordById('_pb_users_auth_', a.id)
        return !!(u && u.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }
    function contextoDoUsuario(a) {
      let usuarioRec = null
      try {
        const recs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + a.id + "' || id = '" + a.id + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) usuarioRec = recs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')
      const master = eMasterLocal(a)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + a.id + "'",
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
          const p = $app.findRecordById('perfis_acesso', perfilId)
          if (p && p.getBool('ativo') && p.getBool('administrador')) admin = true
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
    function hostDaLoja(raw) {
      let s = String(raw || '')
        .trim()
        .toLowerCase()
      if (!s) return ''
      if (s.indexOf('://') >= 0) s = s.split('://')[1] || ''
      s = s.split('/')[0]
      s = s.split(':')[0]
      s = s.split('?')[0]
      if (s.indexOf('www.') === 0) s = s.slice(4)
      return s
    }
    function segredosTray() {
      let key = ''
      let secret = ''
      try {
        key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
      } catch (_) {}
      try {
        secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
      } catch (_) {}
      return { key: key, secret: secret, ok: !!(key && secret) }
    }

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const seg = segredosTray()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Segredos TRAY_CONSUMER_KEY e TRAY_CONSUMER_SECRET não configurados.',
        })
      }
      let conta = null
      try {
        const recs = $app.findRecordsByFilter(
          'tray_contas',
          "empresa_id = '" + empresa.id + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) conta = recs[0]
      } catch (_) {}
      if (
        !conta ||
        conta.getString('status') === 'Desconectada' ||
        !conta.getString('refresh_token')
      ) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Nenhuma loja Tray conectada nesta empresa.',
        })
      }

      const lojaHost = hostDaLoja(conta.getString('loja_host'))
      if (!lojaHost) {
        return c.json(400, { sucesso: false, mensagem: 'Loja sem host registrado.' })
      }
      const apiAddress = conta.getString('api_address') || 'https://' + lojaHost

      // Renova na hora se faltar menos de 10 minutos (ou se já venceu).
      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 10 * 60 * 1000) {
        const urlToken =
          'https://' +
          lojaHost +
          '/api/v3/auth_server?code=' +
          encodeURIComponent(conta.getString('refresh_token')) +
          '&consumer_key=' +
          encodeURIComponent(seg.key) +
          '&consumer_secret=' +
          encodeURIComponent(seg.secret)
        const res = $http.send({
          method: 'GET',
          url: urlToken,
          headers: { Accept: 'application/json' },
          timeout: 20,
        })
        let dados = {}
        try {
          if (res && res.json) dados = res.json
          else dados = JSON.parse(res.raw || '{}')
        } catch (_) {
          dados = {}
        }
        if (!dados || !dados.access_token) {
          conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', 'Falha ao renovar o token (HTTP ' + res.statusCode + ').')
          $app.save(conta)
          return c.json(400, {
            sucesso: false,
            mensagem: 'Falha ao renovar o token (HTTP ' + res.statusCode + ').',
          })
        }
        conta.set('access_token', String(dados.access_token || ''))
        if (dados.refresh_token) conta.set('refresh_token', String(dados.refresh_token || ''))
        conta.set(
          'token_expira_em',
          new Date(Date.now() + (parseInt(dados.expires_in, 10) || 3600) * 1000).toISOString(),
        )
        conta.set(
          'refresh_expira_em',
          new Date(
            Date.now() + (parseInt(dados.refresh_expires_in, 10) || 30 * 24 * 3600) * 1000,
          ).toISOString(),
        )
        conta.set('status', 'Conectada')
        conta.set('ultimo_erro', '')
        conta.set('ultima_renovacao_em', new Date().toISOString())
        $app.save(conta)
      }

      // Consulta simples na loja para confirmar que o token funciona.
      const resConsulta = $http.send({
        method: 'GET',
        url:
          apiAddress +
          '/api/v3/store_information?access_token=' +
          encodeURIComponent(conta.getString('access_token')),
        headers: { Accept: 'application/json' },
        timeout: 20,
      })
      if (resConsulta.statusCode !== 200) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'A Tray respondeu HTTP ' + resConsulta.statusCode + ' na consulta da loja.',
        })
      }
      return c.json(200, {
        sucesso: true,
        mensagem: 'Conexão funcionando.',
        loja_host: lojaHost,
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

routerAdd('GET', '/backend/v1/tray/oauth/callback', (c) => {
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
    const titulo = ok ? 'Loja Tray conectada' : 'Não foi possível conectar'
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

  function segredosTray() {
    let key = ''
    let secret = ''
    try {
      key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
    } catch (_) {}
    try {
      secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
    } catch (_) {}
    return { key: key, secret: secret, ok: !!(key && secret) }
  }

  function hostDaLoja(raw) {
    let s = String(raw || '')
      .trim()
      .toLowerCase()
    if (!s) return ''
    if (s.indexOf('://') >= 0) s = s.split('://')[1] || ''
    s = s.split('/')[0]
    s = s.split(':')[0]
    s = s.split('?')[0]
    if (s.indexOf('www.') === 0) s = s.slice(4)
    return s
  }

  let retornoUrl = ''
  try {
    const q = c.requestInfo().query || {}
    const code = String(q['code'] || '').trim()
    const estado = String(q['state'] || '').trim()
    const erroTray = String(q['error'] || '').trim()

    if (!/^[A-Za-z0-9]{20,100}$/.test(estado)) {
      return responder(false, 'Parâmetro state inválido.', '')
    }

    let estRec = null
    try {
      const recs = $app.findRecordsByFilter(
        'tray_oauth_estados',
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
    if (erroTray) {
      return responder(false, 'Autorização não concedida na Tray (' + erroTray + ').', retornoUrl)
    }
    if (!code) return responder(false, 'A Tray não devolveu o código de autorização.', retornoUrl)

    const seg = segredosTray()
    if (!seg.ok) {
      return responder(
        false,
        'Segredos TRAY_CONSUMER_KEY e TRAY_CONSUMER_SECRET não configurados.',
        retornoUrl,
      )
    }

    const lojaHost = hostDaLoja(estRec.getString('loja_host'))
    if (!lojaHost)
      return responder(false, 'Host da loja não registrado nesta solicitação.', retornoUrl)

    // A mesma loja não pode ficar ligada a duas empresas.
    const limpo = lojaHost.replace(/[^a-z0-9.-]/g, '')
    try {
      const outras = $app.findRecordsByFilter(
        'tray_contas',
        "loja_host = '" +
          limpo +
          "' && empresa_id != '" +
          estRec.getString('empresa_id') +
          "' && status != 'Desconectada'",
        '-created',
        1,
        0,
      )
      if (outras && outras.length > 0) {
        return responder(
          false,
          'Esta loja Tray já está conectada a outra empresa. Desconecte lá primeiro.',
          retornoUrl,
        )
      }
    } catch (_) {}

    // Troca o code pelo token (Tray: GET na loja, /auth_code → /api/v3/auth_server).
    const urlToken =
      'https://' +
      lojaHost +
      '/api/v3/auth_server?code=' +
      encodeURIComponent(code) +
      '&consumer_key=' +
      encodeURIComponent(seg.key) +
      '&consumer_secret=' +
      encodeURIComponent(seg.secret)
    const res = $http.send({
      method: 'GET',
      url: urlToken,
      headers: { Accept: 'application/json' },
      timeout: 20,
    })
    let dados = {}
    try {
      if (res && res.json) dados = res.json
      else dados = JSON.parse(res.raw || '{}')
    } catch (_) {
      dados = {}
    }
    if (!dados || !dados.access_token) {
      console.log('[tray] Falha na troca do code: HTTP ' + res.statusCode)
      return responder(
        false,
        'A Tray não devolveu o access_token (HTTP ' + res.statusCode + ').',
        retornoUrl,
      )
    }

    let conta = null
    try {
      const recsConta = $app.findRecordsByFilter(
        'tray_contas',
        "empresa_id = '" + estRec.getString('empresa_id') + "'",
        '-created',
        1,
        0,
      )
      if (recsConta && recsConta.length > 0) conta = recsConta[0]
    } catch (_) {}
    if (!conta) {
      conta = new Record($app.findCollectionByNameOrId('tray_contas'))
      conta.set('empresa_id', estRec.getString('empresa_id'))
      conta.set('ativo', true)
    }
    conta.set('assinante_id', estRec.getString('assinante_id'))
    conta.set('loja_host', lojaHost)
    conta.set('api_address', 'https://' + lojaHost)
    conta.set('store_id', String(dados.store_id || ''))
    conta.set('loja_nome', String(dados.store_name || dados.name || ''))
    conta.set('access_token', String(dados.access_token || ''))
    conta.set('refresh_token', String(dados.refresh_token || ''))
    conta.set(
      'token_expira_em',
      new Date(Date.now() + (parseInt(dados.expires_in, 10) || 3600) * 1000).toISOString(),
    )
    conta.set(
      'refresh_expira_em',
      new Date(
        Date.now() + (parseInt(dados.refresh_expires_in, 10) || 30 * 24 * 3600) * 1000,
      ).toISOString(),
    )
    conta.set('status', 'Conectada')
    conta.set('ultimo_erro', '')
    conta.set('conectada_em', new Date().toISOString())
    conta.set('conectada_por', estRec.getString('usuario_id'))
    $app.save(conta)

    return responder(true, '', retornoUrl)
  } catch (err) {
    console.log('[tray] Erro no callback: ' + (err && err.message ? err.message : String(err)))
    return responder(false, 'Erro interno ao concluir a conexão.', retornoUrl)
  }
})

// 4) Status da conexão da empresa (nunca devolve os tokens).
routerAdd(
  'GET',
  '/backend/v1/tray/conexao/status',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }
    function eMasterLocal(a) {
      if (!a) return false
      try {
        const u = $app.findRecordById('_pb_users_auth_', a.id)
        return !!(u && u.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }
    function contextoDoUsuario(a) {
      let usuarioRec = null
      try {
        const recs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + a.id + "' || id = '" + a.id + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) usuarioRec = recs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')
      const master = eMasterLocal(a)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + a.id + "'",
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
          const p = $app.findRecordById('perfis_acesso', perfilId)
          if (p && p.getBool('ativo') && p.getBool('administrador')) admin = true
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
          'tray_contas',
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
      const conta = contaDaEmpresa(empresa.id)

      return c.json(200, {
        sucesso: true,
        pode_gerenciar: ctx.admin,
        status: conta ? conta.getString('status') || 'Desconectada' : 'Desconectada',
        loja_host: conta ? conta.getString('loja_host') : '',
        loja_nome: conta ? conta.getString('loja_nome') : '',
        store_id: conta ? conta.getString('store_id') : '',
        token_expira_em: conta ? conta.getString('token_expira_em') : '',
        refresh_expira_em: conta ? conta.getString('refresh_expira_em') : '',
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

// 6) Desconectar a loja Tray da empresa (marca a conta como 'Desconectada').
routerAdd(
  'POST',
  '/backend/v1/tray/conexao/desconectar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }
    function eMasterLocal(a) {
      if (!a) return false
      try {
        const u = $app.findRecordById('_pb_users_auth_', a.id)
        return !!(u && u.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }
    function contextoDoUsuario(a) {
      let usuarioRec = null
      try {
        const recs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + a.id + "' || id = '" + a.id + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) usuarioRec = recs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')
      const master = eMasterLocal(a)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + a.id + "'",
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
          const p = $app.findRecordById('perfis_acesso', perfilId)
          if (p && p.getBool('ativo') && p.getBool('administrador')) admin = true
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
          'tray_contas',
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
          mensagem: 'Apenas administradores podem desconectar a loja da Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())

      const conta = contaDaEmpresa(empresa.id)
      if (!conta) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Nenhuma loja Tray conectada nesta empresa.',
        })
      }

      conta.set('status', 'Desconectada')
      conta.set('ativo', false)
      conta.set('access_token', '')
      conta.set('refresh_token', '')
      conta.set('token_expira_em', '')
      conta.set('refresh_expira_em', '')
      conta.set('ultimo_erro', '')
      $app.save(conta)

      return c.json(200, {
        sucesso: true,
        mensagem: 'Loja Tray desconectada com sucesso.',
        status: 'Desconectada',
        loja_host: conta.getString('loja_host'),
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao desconectar a loja.',
      })
    }
  },
  $apis.requireAuth(),
)

// 7) Cron: renovação preventiva do access_token das contas conectadas (a cada 6 h).
cronAdd('trayRenovarTokens', '0 */6 * * *', () => {
  function segredosTray() {
    let key = ''
    let secret = ''
    try {
      key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
    } catch (_) {}
    try {
      secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
    } catch (_) {}
    return { key: key, secret: secret, ok: !!(key && secret) }
  }

  function hostDaLoja(raw) {
    let s = String(raw || '')
      .trim()
      .toLowerCase()
    if (!s) return ''
    if (s.indexOf('://') >= 0) s = s.split('://')[1] || ''
    s = s.split('/')[0]
    s = s.split(':')[0]
    s = s.split('?')[0]
    if (s.indexOf('www.') === 0) s = s.slice(4)
    return s
  }

  let renovadas = 0
  let falhas = 0
  try {
    const contas = $app.findRecordsByFilter(
      'tray_contas',
      "status = 'Conectada' && refresh_token != ''",
      '-created',
      500,
      0,
    )
    for (let i = 0; i < contas.length; i++) {
      const conta = contas[i]
      try {
        const expira = new Date(conta.getString('token_expira_em')).getTime()
        if (expira - Date.now() > 30 * 60 * 1000) continue // ainda válido por > 30 min

        const seg = segredosTray()
        if (!seg.ok) break

        const lojaHost = hostDaLoja(conta.getString('loja_host'))
        if (!lojaHost) continue

        const res = $http.send({
          method: 'POST',
          url: 'https://' + lojaHost + '/api/v3/auth_server',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body:
            'refresh_token=' +
            encodeURIComponent(conta.getString('refresh_token')) +
            '&consumer_key=' +
            encodeURIComponent(seg.key) +
            '&consumer_secret=' +
            encodeURIComponent(seg.secret) +
            '&grant_type=refresh_token',
          timeout: 20,
        })
        let dados = {}
        try {
          if (res && res.json) dados = res.json
          else dados = JSON.parse(res.raw || '{}')
        } catch (_) {
          dados = {}
        }
        if (!dados || !dados.access_token) {
          falhas++
          conta.set('ultimo_erro', 'Renovação falhou (HTTP ' + res.statusCode + ')')
          conta.set('status', 'Erro')
          $app.save(conta)
          continue
        }
        conta.set('access_token', String(dados.access_token || ''))
        if (dados.refresh_token) conta.set('refresh_token', String(dados.refresh_token))
        conta.set(
          'token_expira_em',
          new Date(Date.now() + (parseInt(dados.expires_in, 10) || 3600) * 1000).toISOString(),
        )
        conta.set(
          'refresh_expira_em',
          new Date(
            Date.now() + (parseInt(dados.refresh_expires_in, 10) || 30 * 24 * 3600) * 1000,
          ).toISOString(),
        )
        conta.set('ultima_renovacao_em', new Date().toISOString())
        conta.set('status', 'Conectada')
        conta.set('ultimo_erro', '')
        $app.save(conta)
        renovadas++
      } catch (errConta) {
        falhas++
        console.log(
          '[tray-cron] Erro na conta ' +
            conta.id +
            ': ' +
            (errConta && errConta.message ? errConta.message : String(errConta)),
        )
      }
    }
  } catch (err) {
    console.log('[tray-cron] Erro geral: ' + (err && err.message ? err.message : String(err)))
  }
  if (renovadas > 0 || falhas > 0) {
    console.log(
      '[tray-cron] Renovação de tokens Tray: ' + renovadas + ' renovadas, ' + falhas + ' falhas.',
    )
  }
})
