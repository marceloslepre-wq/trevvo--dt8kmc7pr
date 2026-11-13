/// <reference path="../types.d.ts" />

/**
 * tray_conexao.js — Etapa 11 / Parte 11.1
 *
 * Conexão de uma loja Tray por empresa (fluxo de autorização da Tray) e renovação do token.
 * Documentação: docs/TRAY.md
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo.
 * ATENÇÃO ROTAS: não usar parâmetro de caminho ({nome}) neste arquivo. Uma rota assim impediu
 * a carga do hook inteiro no servidor (12/11/2026). A solicitação de conexão é localizada pelo
 * endereço da loja que a Tray devolve no retorno, não por parâmetro na URL.
 *
 * Segredos (Skip Cloud): TRAY_CONSUMER_KEY, TRAY_CONSUMER_SECRET
 *
 * Rotas:
 *   GET  /backend/v1/tray/diagnostico                 (pública, sem dados sensíveis)
 *   POST /backend/v1/tray/conexao/iniciar             (autenticada, administrador)
 *   GET  /backend/v1/tray/oauth/callback              (pública, chamada pela Tray)
 *   GET  /backend/v1/tray/conexao/status              (autenticada)
 *   POST /backend/v1/tray/conexao/testar              (autenticada)
 *   POST /backend/v1/tray/conexao/desconectar         (autenticada, administrador)
 *
 * Agendamento: tray_renovar_tokens — a cada 30 minutos
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

    // ---- Helpers de chamada à Tray (locais ao callback) ----
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

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
    function hostDaLoja(valor) {
      let v = String(valor || '')
        .trim()
        .toLowerCase()
      v = v.replace(/^https?:\/\//, '')
      v = v.split('/')[0].split('?')[0].split('#')[0]
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
      if (v.length > 200) return ''
      return v
    }

    // A API da loja fica sempre em https://{host da loja}/web_api
    function apiDaLoja(host) {
      return 'https://' + host + '/web_api'
    }

    function formUrlEncoded(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      return partes.join('&')
    }

    function mensagemErroTray(r) {
      const d = (r && r.dados) || {}
      let txt = d.message || d.error || ''
      if (!txt && d.causes) {
        try {
          txt = JSON.stringify(d.causes).slice(0, 200)
        } catch (_) {}
      }
      return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
    function gravarTokensTray(conta, dados) {
      conta.set('access_token', String(dados.access_token || ''))
      if (dados.refresh_token) {
        conta.set('refresh_token', String(dados.refresh_token))
        conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    // Nunca registrar em log os parâmetros destas chamadas.
    function renovarTokenTray(conta) {
      const res = $http.send({
        method: 'GET',
        url:
          conta.getString('api_address') +
          '/auth?refresh_token=' +
          encodeURIComponent(conta.getString('refresh_token')),
        headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    try {
      const seg = segredosTray()
      if (!seg.ok) {
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
          mensagem: 'Apenas administradores podem conectar a loja Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const host = hostDaLoja(body.loja_url)
      if (!host) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Informe o endereço da loja Tray, por exemplo: minhaloja.com.br',
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

      const estado = $security.randomString(48)
      const rec = new Record($app.findCollectionByNameOrId('tray_oauth_estados'))
      rec.set('estado', estado)
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('empresa_id', empresa.id)
      rec.set('usuario_id', auth.id)
      rec.set('loja_host', host)
      rec.set('retorno_url', retornoUrl)
      rec.set('expira_em', new Date(Date.now() + 15 * 60 * 1000).toISOString())
      rec.set('usado', false)
      $app.save(rec)

      // URL de callback fixa, sem parâmetros: a Tray acrescenta code, store e api_address.
      const callback = 'https://' + c.request.host + '/backend/v1/tray/oauth/callback'
      const url =
        'https://' +
        host +
        '/auth.php?response_type=code&consumer_key=' +
        encodeURIComponent(seg.key) +
        '&callback=' +
        encodeURIComponent(callback)

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

routerAdd('GET', '/backend/v1/tray/oauth/callback', (c) => {
  // ---- Helpers de chamada à Tray (locais ao callback) ----
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

  function lerJson(res) {
    if (res && res.json) return res.json
    try {
      return JSON.parse(res.raw || '{}')
    } catch (_) {
      return {}
    }
  }

  // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
  function hostDaLoja(valor) {
    let v = String(valor || '')
      .trim()
      .toLowerCase()
    v = v.replace(/^https?:\/\//, '')
    v = v.split('/')[0].split('?')[0].split('#')[0]
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
    if (v.length > 200) return ''
    return v
  }

  // A API da loja fica sempre em https://{host da loja}/web_api
  function apiDaLoja(host) {
    return 'https://' + host + '/web_api'
  }

  function formUrlEncoded(campos) {
    const partes = []
    Object.keys(campos).forEach((k) => {
      partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
    })
    return partes.join('&')
  }

  function mensagemErroTray(r) {
    const d = (r && r.dados) || {}
    let txt = d.message || d.error || ''
    if (!txt && d.causes) {
      try {
        txt = JSON.stringify(d.causes).slice(0, 200)
      } catch (_) {}
    }
    return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
  }

  // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
  function gravarTokensTray(conta, dados) {
    conta.set('access_token', String(dados.access_token || ''))
    if (dados.refresh_token) {
      conta.set('refresh_token', String(dados.refresh_token))
      conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
    }
    conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
    conta.set('ultima_renovacao_em', new Date().toISOString())
    conta.set('status', 'Conectada')
    conta.set('ultimo_erro', '')
  }

  // Nunca registrar em log os parâmetros destas chamadas.
  function renovarTokenTray(conta) {
    const res = $http.send({
      method: 'GET',
      url:
        conta.getString('api_address') +
        '/auth?refresh_token=' +
        encodeURIComponent(conta.getString('refresh_token')),
      headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
      timeout: 20,
    })
    return { status: res.statusCode, dados: lerJson(res) }
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
    const titulo = ok ? 'Loja Tray conectada' : 'Não foi possível conectar'
    const texto = ok
      ? 'Pode fechar esta aba e voltar ao sistema.'
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

    // 1) Solicitações de conexão pendentes (não usadas e não expiradas), da mais recente para a mais antiga.
    let candidatos = []
    try {
      const recs = $app.findRecordsByFilter(
        'tray_oauth_estados',
        'usado = false',
        '-created',
        20,
        0,
      )
      for (let i = 0; i < recs.length; i++) {
        if (new Date(recs[i].getString('expira_em')).getTime() >= Date.now())
          candidatos.push(recs[i])
      }
    } catch (_) {}
    if (candidatos.length === 0) {
      return responder(
        false,
        'Não há solicitação de conexão pendente (ou ela expirou). Inicie a conexão pela tela Configurações > Tray.',
        '',
      )
    }
    if (candidatos.length === 1) retornoUrl = candidatos[0].getString('retorno_url')

    if (!code) return responder(false, 'A Tray não devolveu o código de autorização.', retornoUrl)

    // 2) Endereço da API. A Tray devolve em api_address um host próprio dela, diferente do
    //    endereço da loja (ex.: xxxx.commercesuite.com.br). Como as chaves do aplicativo são
    //    enviadas para esse endereço, só aceitamos domínios da Tray ou o host de uma loja
    //    informada por um administrador em solicitação pendente.
    const hostApi = hostDaLoja(q['api_address'] || '')
    let api = ''
    if (hostApi) {
      const sufixos = ['.commercesuite.com.br', '.tray.com.br', '.corpsuite.com.br']
      let permitido = false
      for (let i = 0; i < sufixos.length; i++) {
        if (hostApi.length > sufixos[i].length && hostApi.slice(-sufixos[i].length) === sufixos[i])
          permitido = true
      }
      for (let i = 0; i < candidatos.length; i++) {
        if (candidatos[i].getString('loja_host') === hostApi) permitido = true
      }
      if (!permitido) {
        return responder(
          false,
          'Endereço de API não reconhecido como da Tray (' + hostApi + ').',
          retornoUrl,
        )
      }
      api = apiDaLoja(hostApi)
    } else if (candidatos.length === 1) {
      api = apiDaLoja(candidatos[0].getString('loja_host'))
    } else {
      return responder(false, 'A Tray não informou o endereço da API da loja.', retornoUrl)
    }

    const seg = segredosTray()
    if (!seg.ok)
      return responder(
        false,
        'Segredos TRAY_CONSUMER_KEY e TRAY_CONSUMER_SECRET não configurados.',
        retornoUrl,
      )

    const res = $http.send({
      method: 'POST',
      url: api + '/auth',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'Trevvo-ERP/1.0',
      },
      body: formUrlEncoded({ consumer_key: seg.key, consumer_secret: seg.secret, code: code }),
      timeout: 20,
    })
    const r = { status: res.statusCode, dados: lerJson(res) }
    if ((r.status !== 200 && r.status !== 201) || !r.dados || !r.dados.access_token) {
      console.log('[tray] Falha ao gerar chave de acesso: HTTP ' + r.status)
      // Quando a resposta não é o JSON de erro da Tray (ex.: bloqueio do firewall dela),
      // mostra um trecho curto do que veio, sem chaves nem código, para identificar a causa.
      let msg = mensagemErroTray(r)
      if (msg.indexOf(': ') < 0) {
        let trecho = ''
        try {
          trecho = String(res.raw || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const ocultar = [seg.key, seg.secret, code]
          for (let i = 0; i < ocultar.length; i++) {
            if (ocultar[i]) trecho = trecho.split(ocultar[i]).join('***')
          }
          trecho = trecho.slice(0, 220)
        } catch (_) {}
        let servidor = ''
        try {
          const hs = res.headers || {}
          for (const k in hs) {
            if (String(k).toLowerCase() === 'server') servidor = String(hs[k]).slice(0, 40)
          }
        } catch (_) {}
        msg += ' em ' + hostApi + (servidor ? ' (servidor: ' + servidor + ')' : '') + (trecho ? ' — ' + trecho : ' — resposta vazia')
      }
      return responder(false, msg, retornoUrl)
    }

    // 3) Com mais de uma solicitação pendente, descobre a qual loja o acesso pertence
    //    consultando os dados da loja e comparando com o endereço informado em cada solicitação.
    let estRec = null
    if (candidatos.length === 1) {
      estRec = candidatos[0]
    } else {
      let texto = ''
      try {
        const ri = $http.send({
          method: 'GET',
          url: api + '/info?access_token=' + encodeURIComponent(String(r.dados.access_token)),
          headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
          timeout: 20,
        })
        texto = String(ri.raw || JSON.stringify(lerJson(ri)) || '').toLowerCase()
      } catch (_) {}
      const achados = []
      for (let i = 0; i < candidatos.length; i++) {
        const h = candidatos[i].getString('loja_host')
        if (h && texto.indexOf(h) >= 0) achados.push(candidatos[i])
      }
      if (achados.length >= 1) estRec = achados[0]
    }
    if (!estRec) {
      return responder(
        false,
        'Há mais de uma conexão em andamento e não foi possível identificar a sua. Aguarde 15 minutos e tente de novo.',
        '',
      )
    }
    retornoUrl = estRec.getString('retorno_url')
    estRec.set('usado', true)
    $app.save(estRec)
    const host = estRec.getString('loja_host')

    const empresaId = estRec.getString('empresa_id')
    let conta = null
    try {
      const recs = $app.findRecordsByFilter(
        'tray_contas',
        "empresa_id = '" + empresaId + "'",
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) conta = recs[0]
    } catch (_) {}
    if (!conta) {
      conta = new Record($app.findCollectionByNameOrId('tray_contas'))
      conta.set('empresa_id', empresaId)
      conta.set('ativo', true)
    }
    conta.set('assinante_id', estRec.getString('assinante_id'))
    conta.set('loja_host', host)
    conta.set('api_address', api)
    conta.set('store_id', String(r.dados.store_id || q['store'] || '').slice(0, 40))
    conta.set('conectada_em', new Date().toISOString())
    conta.set('conectada_por', estRec.getString('usuario_id'))
    gravarTokensTray(conta, r.dados)
    $app.save(conta)

    return responder(true, '', retornoUrl)
  } catch (err) {
    console.log('[tray] Erro no callback: ' + (err && err.message ? err.message : String(err)))
    return responder(false, 'Erro interno ao concluir a conexão.', retornoUrl)
  }
})

routerAdd(
  'GET',
  '/backend/v1/tray/conexao/status',
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

    // ---- Helpers de chamada à Tray (locais ao callback) ----
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

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
    function hostDaLoja(valor) {
      let v = String(valor || '')
        .trim()
        .toLowerCase()
      v = v.replace(/^https?:\/\//, '')
      v = v.split('/')[0].split('?')[0].split('#')[0]
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
      if (v.length > 200) return ''
      return v
    }

    // A API da loja fica sempre em https://{host da loja}/web_api
    function apiDaLoja(host) {
      return 'https://' + host + '/web_api'
    }

    function formUrlEncoded(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      return partes.join('&')
    }

    function mensagemErroTray(r) {
      const d = (r && r.dados) || {}
      let txt = d.message || d.error || ''
      if (!txt && d.causes) {
        try {
          txt = JSON.stringify(d.causes).slice(0, 200)
        } catch (_) {}
      }
      return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
    function gravarTokensTray(conta, dados) {
      conta.set('access_token', String(dados.access_token || ''))
      if (dados.refresh_token) {
        conta.set('refresh_token', String(dados.refresh_token))
        conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    // Nunca registrar em log os parâmetros destas chamadas.
    function renovarTokenTray(conta) {
      const res = $http.send({
        method: 'GET',
        url:
          conta.getString('api_address') +
          '/auth?refresh_token=' +
          encodeURIComponent(conta.getString('refresh_token')),
        headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
      const conta = contaDaEmpresa(empresa.id)
      return c.json(200, {
        sucesso: true,
        segredos_configurados: segredosTray().ok,
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

routerAdd(
  'POST',
  '/backend/v1/tray/conexao/testar',
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

    // ---- Helpers de chamada à Tray (locais ao callback) ----
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

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
    function hostDaLoja(valor) {
      let v = String(valor || '')
        .trim()
        .toLowerCase()
      v = v.replace(/^https?:\/\//, '')
      v = v.split('/')[0].split('?')[0].split('#')[0]
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
      if (v.length > 200) return ''
      return v
    }

    // A API da loja fica sempre em https://{host da loja}/web_api
    function apiDaLoja(host) {
      return 'https://' + host + '/web_api'
    }

    function formUrlEncoded(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      return partes.join('&')
    }

    function mensagemErroTray(r) {
      const d = (r && r.dados) || {}
      let txt = d.message || d.error || ''
      if (!txt && d.causes) {
        try {
          txt = JSON.stringify(d.causes).slice(0, 200)
        } catch (_) {}
      }
      return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
    function gravarTokensTray(conta, dados) {
      conta.set('access_token', String(dados.access_token || ''))
      if (dados.refresh_token) {
        conta.set('refresh_token', String(dados.refresh_token))
        conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    // Nunca registrar em log os parâmetros destas chamadas.
    function renovarTokenTray(conta) {
      const res = $http.send({
        method: 'GET',
        url:
          conta.getString('api_address') +
          '/auth?refresh_token=' +
          encodeURIComponent(conta.getString('refresh_token')),
        headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(body.empresa_id || '').trim())
      const conta = contaDaEmpresa(empresa.id)
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

      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 5 * 60 * 1000) {
        const r = renovarTokenTray(conta)
        if ((r.status === 200 || r.status === 201) && r.dados && r.dados.access_token) {
          gravarTokensTray(conta, r.dados)
          $app.save(conta)
        } else {
          if (r.status === 400 || r.status === 401) conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', mensagemErroTray(r))
          $app.save(conta)
          return c.json(400, {
            sucesso: false,
            mensagem: 'Falha ao renovar o token. ' + mensagemErroTray(r),
          })
        }
      }

      const res = $http.send({
        method: 'GET',
        url:
          conta.getString('api_address') +
          '/info?access_token=' +
          encodeURIComponent(conta.getString('access_token')),
        headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
        timeout: 20,
      })
      const r = { status: res.statusCode, dados: lerJson(res) }
      if (r.status !== 200) return c.json(400, { sucesso: false, mensagem: mensagemErroTray(r) })

      const info = (r.dados && (r.dados.Informations || r.dados.informations || r.dados)) || {}
      const nome = String(info.name || info.store_name || info.company_name || '').slice(0, 200)
      if (nome && nome !== conta.getString('loja_nome')) {
        conta.set('loja_nome', nome)
        $app.save(conta)
      }
      return c.json(200, {
        sucesso: true,
        mensagem: 'Conexão funcionando.',
        loja_nome: nome,
        loja_host: conta.getString('loja_host'),
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

routerAdd(
  'POST',
  '/backend/v1/tray/conexao/desconectar',
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
          mensagem: 'Apenas administradores podem desconectar a loja Tray.',
        })
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
        console.log('[tray] Loja desconectada. empresa=' + empresa.id + ' usuario=' + auth.id)
      }
      return c.json(200, { sucesso: true, mensagem: 'Loja desconectada.' })
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

cronAdd('tray_renovar_tokens', '*/30 * * * *', () => {
  // ---- Helpers de chamada à Tray (locais ao callback) ----
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

  function lerJson(res) {
    if (res && res.json) return res.json
    try {
      return JSON.parse(res.raw || '{}')
    } catch (_) {
      return {}
    }
  }

  // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
  function hostDaLoja(valor) {
    let v = String(valor || '')
      .trim()
      .toLowerCase()
    v = v.replace(/^https?:\/\//, '')
    v = v.split('/')[0].split('?')[0].split('#')[0]
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
    if (v.length > 200) return ''
    return v
  }

  // A API da loja fica sempre em https://{host da loja}/web_api
  function apiDaLoja(host) {
    return 'https://' + host + '/web_api'
  }

  function formUrlEncoded(campos) {
    const partes = []
    Object.keys(campos).forEach((k) => {
      partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
    })
    return partes.join('&')
  }

  function mensagemErroTray(r) {
    const d = (r && r.dados) || {}
    let txt = d.message || d.error || ''
    if (!txt && d.causes) {
      try {
        txt = JSON.stringify(d.causes).slice(0, 200)
      } catch (_) {}
    }
    return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
  }

  // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
  function gravarTokensTray(conta, dados) {
    conta.set('access_token', String(dados.access_token || ''))
    if (dados.refresh_token) {
      conta.set('refresh_token', String(dados.refresh_token))
      conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
    }
    conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
    conta.set('ultima_renovacao_em', new Date().toISOString())
    conta.set('status', 'Conectada')
    conta.set('ultimo_erro', '')
  }

  // Nunca registrar em log os parâmetros destas chamadas.
  function renovarTokenTray(conta) {
    const res = $http.send({
      method: 'GET',
      url:
        conta.getString('api_address') +
        '/auth?refresh_token=' +
        encodeURIComponent(conta.getString('refresh_token')),
      headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
      timeout: 20,
    })
    return { status: res.statusCode, dados: lerJson(res) }
  }

  try {
    if (!$app.hasTable('tray_contas')) return
    if (!segredosTray().ok) return
    let contas = []
    try {
      contas = $app.findRecordsByFilter(
        'tray_contas',
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
        // O token dura 3 horas: renova o que vence nos próximos 75 minutos.
        if (expira && expira - Date.now() > 75 * 60 * 1000) continue
        const r = renovarTokenTray(conta)
        if ((r.status === 200 || r.status === 201) && r.dados && r.dados.access_token) {
          gravarTokensTray(conta, r.dados)
          $app.save(conta)
        } else if (r.status === 400 || r.status === 401) {
          conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', mensagemErroTray(r))
          $app.save(conta)
          console.log('[tray] Loja precisa reconectar. empresa=' + conta.getString('empresa_id'))
        } else {
          console.log(
            '[tray] Renovação adiada: HTTP ' +
              r.status +
              ' empresa=' +
              conta.getString('empresa_id'),
          )
        }
      } catch (e1) {
        console.log('[tray] Erro ao renovar token: ' + (e1 && e1.message ? e1.message : String(e1)))
      }
    }
  } catch (err) {
    console.log('[tray] Erro no agendamento: ' + (err && err.message ? err.message : String(err)))
  }
})
