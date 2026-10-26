// @ts-check
/// <reference path="../types.d.ts" />

/**
 * fiscal_credenciais_rotas.js
 *
 * Gerenciamento seguro de credenciais fiscais da Focus NFe por empresa (Prompt 9.6).
 *
 * ATENÇÃO JSVM (Goja): NUNCA declarar funções no topo deste arquivo.
 * Toda lógica auxiliar deve residir DENTRO de cada callback de rota ou em módulos
 * importados via require(`${__hooks}/...`).
 *
 * Endpoints:
 * - GET  /backend/v1/fiscal/credenciais?empresa_id=X
 * - POST /backend/v1/fiscal/credenciais
 * - POST /backend/v1/fiscal/credenciais/testar-conexao
 * - POST /backend/v1/fiscal/registrar-webhook-assinante
 */

/**
 * 1) GET /backend/v1/fiscal/credenciais?empresa_id=X
 * Retorna estado do cadastro das credenciais fiscais da empresa sem NUNCA expor o token.
 */
routerAdd(
  'GET',
  '/backend/v1/fiscal/credenciais',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)

    // Verificar se é administrador do assinante ou master
    let isAdmin = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', authRecord.id)
      if (userRec && userRec.getString('tipo') === 'master') {
        isAdmin = true
      }
    } catch (_) {}

    if (!isAdmin) {
      const perfilId = authRecord.getString('perfil_acesso_id') || authRecord.getString('perfil_id')
      if (perfilId) {
        try {
          const perfil = $app.findRecordById('perfis_acesso', perfilId)
          if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
            isAdmin = true
          }
        } catch (_) {}
      }
    }

    if (!isAdmin) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRecord.id + "' || id = '" + authRecord.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          const pId = uRecs[0].getString('perfil_id')
          if (pId) {
            const perfil = $app.findRecordById('perfis_acesso', pId)
            if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
              isAdmin = true
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return c.json(403, {
        sucesso: false,
        message: 'Apenas Administradores podem consultar credenciais fiscais.',
      })
    }

    const empresaId = (c.requestInfo().query['empresa_id'] || '').trim()
    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'Parâmetro empresa_id é obrigatório.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    let cred = null
    try {
      const creds = $app.findRecordsByFilter(
        'credenciais_fiscais',
        "empresa_id = '" + empresaId + "'",
        '-created',
        1,
        0,
      )
      if (creds && creds.length > 0) {
        cred = creds[0]
      }
    } catch (_) {}

    const tokenInfo = obterTokenFocus(empresaId, $app)

    if (!cred) {
      return c.json(200, {
        sucesso: true,
        cadastrado: false,
        origem_efetiva: tokenInfo.origem,
        ambiente: tokenInfo.ambiente,
        tem_homologacao: false,
        tem_producao: false,
        token_final_homologacao: '',
        token_final_producao: '',
        webhook_registrado: false,
        atualizado_em: null,
      })
    }

    // Prompt 9.7b2 - Requisito 1: As credenciais fiscais do cliente continuam ocultas para o master
    let ehModoMaster = false
    try {
      const masterLib = require(`${__hooks}/master_lib.js`)
      if (
        masterLib.checarSeMaster(authRecord, $app) &&
        masterLib.obterAssinanteImpersonado(authRecord.id, $app)
      ) {
        ehModoMaster = true
      }
    } catch (_) {}

    const tHomolog = (cred.getString('token_homologacao') || '').trim()
    const tProd = (cred.getString('token_producao') || '').trim()
    const wSec = (cred.getString('webhook_secret') || '').trim()

    return c.json(200, {
      sucesso: true,
      cadastrado: Boolean(tHomolog.length > 0 || tProd.length > 0),
      origem_efetiva: tokenInfo.origem,
      ambiente: tokenInfo.ambiente,
      tem_homologacao: Boolean(tHomolog.length > 0),
      tem_producao: Boolean(tProd.length > 0),
      token_final_homologacao: ehModoMaster
        ? '••••'
        : tHomolog.length >= 4
          ? tHomolog.slice(-4)
          : tHomolog
            ? '****'
            : '',
      token_final_producao: ehModoMaster
        ? '••••'
        : tProd.length >= 4
          ? tProd.slice(-4)
          : tProd
            ? '****'
            : '',
      webhook_registrado: Boolean(wSec.length > 0),
      modo_master_oculto: ehModoMaster,
      atualizado_em: cred.getString('atualizado_em') || cred.getString('updated'),
    })
  },
  $apis.requireAuth(),
)

/**
 * 2) POST /backend/v1/fiscal/credenciais
 * Grava credenciais da empresa (só administrador do assinante).
 * Body: { empresa_id: string, token_homologacao?: string, token_producao?: string }
 * Resposta NUNCA devolve o token completo.
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/credenciais',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)
    const { gerarWebhookSecret, obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)

    let isAdmin = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', authRecord.id)
      if (userRec && userRec.getString('tipo') === 'master') {
        isAdmin = true
      }
    } catch (_) {}

    if (!isAdmin) {
      const perfilId = authRecord.getString('perfil_acesso_id') || authRecord.getString('perfil_id')
      if (perfilId) {
        try {
          const perfil = $app.findRecordById('perfis_acesso', perfilId)
          if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
            isAdmin = true
          }
        } catch (_) {}
      }
    }

    if (!isAdmin) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRecord.id + "' || id = '" + authRecord.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          const pId = uRecs[0].getString('perfil_id')
          if (pId) {
            const perfil = $app.findRecordById('perfis_acesso', pId)
            if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
              isAdmin = true
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return c.json(403, {
        sucesso: false,
        message: 'Apenas Administradores podem configurar credenciais fiscais.',
      })
    }

    const data = c.requestInfo().body || {}
    const empresaId = (data.empresa_id || '').trim()

    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    let cred = null
    try {
      const creds = $app.findRecordsByFilter(
        'credenciais_fiscais',
        "empresa_id = '" + empresaId + "'",
        '-created',
        1,
        0,
      )
      if (creds && creds.length > 0) {
        cred = creds[0]
      }
    } catch (_) {}

    if (!cred) {
      const col = $app.findCollectionByNameOrId('credenciais_fiscais')
      cred = new Record(col)
      cred.set('empresa_id', empresaId)
      cred.set('webhook_secret', gerarWebhookSecret(32))
    } else {
      if (!cred.getString('webhook_secret')) {
        cred.set('webhook_secret', gerarWebhookSecret(32))
      }
    }

    if (data.token_homologacao !== undefined) {
      cred.set('token_homologacao', String(data.token_homologacao).trim())
    }
    if (data.token_producao !== undefined) {
      cred.set('token_producao', String(data.token_producao).trim())
    }

    cred.set('atualizado_por', authRecord.id)
    cred.set('atualizado_em', new Date().toISOString())

    $app.save(cred)

    const tHomolog = (cred.getString('token_homologacao') || '').trim()
    const tProd = (cred.getString('token_producao') || '').trim()
    const wSec = (cred.getString('webhook_secret') || '').trim()
    const tokenInfo = obterTokenFocus(empresaId, $app)

    return c.json(200, {
      sucesso: true,
      cadastrado: Boolean(tHomolog.length > 0 || tProd.length > 0),
      origem_efetiva: tokenInfo.origem,
      ambiente: tokenInfo.ambiente,
      token_final_homologacao: tHomolog.length >= 4 ? tHomolog.slice(-4) : tHomolog ? '****' : '',
      token_final_producao: tProd.length >= 4 ? tProd.slice(-4) : tProd ? '****' : '',
      webhook_registrado: Boolean(wSec.length > 0),
      message: 'Credenciais fiscais salvas com sucesso.',
    })
  },
  $apis.requireAuth(),
)

/**
 * 3) POST /backend/v1/fiscal/credenciais/testar-conexao
 * Testa conexão usando o token JÁ GRAVADO no sistema (banco ou segredo), sem aceitar token no corpo.
 * Body: { empresa_id: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/credenciais/testar-conexao',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)

    const data = c.requestInfo().body || {}
    const empresaId = (data.empresa_id || '').trim()

    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', empresaId)
    } catch (_) {}

    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(200, {
        sucesso: false,
        message: 'Empresa emitente não encontrada ou inativa no sistema.',
      })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    let configs = []
    try {
      configs = $app.findRecordsByFilter(
        'config_emissao_fiscal',
        `empresa_id = '${empresaId}' && ativo = true`,
        '-created',
        1,
        0,
      )
    } catch (_) {}

    const config = configs && configs.length > 0 ? configs[0] : null
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const token = tokenInfo.token
    const ambiente = tokenInfo.ambiente

    if (!token) {
      const msgSemToken = `Nenhum token da Focus NFe encontrado para ${nomeEmpresa}. Cadastre o token da empresa na tela de configuração fiscal.`
      if (config) {
        try {
          config.set('ultimo_teste_conexao_data', new Date().toISOString())
          config.set('ultimo_teste_conexao_sucesso', false)
          config.set('ultimo_teste_conexao_mensagem', msgSemToken)
          config.set('updated_by', authRecord.id)
          $app.save(config)
        } catch (_) {}
      }

      return c.json(200, {
        sucesso: false,
        message: msgSemToken,
        ambiente: ambiente,
        origem: tokenInfo.origem,
        status_code: null,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const encodeBase64 = (str) => {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        try {
          return Buffer.from(str, 'utf8').toString('base64')
        } catch (_) {}
      }
      if (typeof btoa === 'function') {
        try {
          return btoa(str)
        } catch (_) {}
      }
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      let i = 0
      const len = str.length
      while (i < len) {
        const c1 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt((c1 & 0x3) << 4)
          out += '=='
          break
        }
        const c2 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
          out += chars.charAt((c2 & 0x0f) << 2)
          out += '='
          break
        }
        const c3 = str.charCodeAt(i++) & 0xff
        out += chars.charAt(c1 >> 2)
        out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
        out += chars.charAt(((c2 & 0x0f) << 2) | ((c3 & 0xc0) >> 6))
        out += chars.charAt(c3 & 0x3f)
      }
      return out
    }

    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')
    let sucesso = false
    let mensagemRetorno = ''
    let statusCode = 0
    let jsonResp = null

    try {
      const res = $http.send({
        method: 'GET',
        url: `${baseUrl}/hooks`,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
        },
        timeout: 45,
      })

      statusCode = res.statusCode || 200
      try {
        jsonResp = JSON.parse(res.raw || '')
      } catch (_) {
        jsonResp = null
      }

      if (statusCode === 200) {
        sucesso = true
        mensagemRetorno = `Conexão com a Focus NFe (${ambiente}) estabelecida com sucesso.`
      } else if (statusCode === 401) {
        sucesso = false
        mensagemRetorno = 'Token inválido ou não autorizado pela Focus NFe.'
      } else {
        sucesso = false
        if (jsonResp && (jsonResp.mensagem || jsonResp.message)) {
          mensagemRetorno = jsonResp.mensagem || jsonResp.message
        } else {
          mensagemRetorno = `Focus NFe retornou status HTTP ${statusCode}`
        }
      }
    } catch (err) {
      sucesso = false
      mensagemRetorno = 'Sem comunicação com a API da Focus NFe.'
    }

    if (config) {
      try {
        config.set('ultimo_teste_conexao_data', new Date().toISOString())
        config.set('ultimo_teste_conexao_sucesso', sucesso)
        config.set('ultimo_teste_conexao_mensagem', mensagemRetorno)
        config.set('updated_by', authRecord.id)
        $app.save(config)
      } catch (_) {}
    }

    return c.json(200, {
      sucesso: sucesso,
      message: mensagemRetorno,
      ambiente: ambiente,
      origem: tokenInfo.origem,
      status_code: statusCode,
    })
  },
  $apis.requireAuth(),
)

/**
 * 4) POST /backend/v1/fiscal/registrar-webhook-assinante
 * Registra o webhook na Focus NFe para todas as empresas do assinante do usuário logado.
 * Usa URL específica por empresa: /backend/v1/fiscal/webhook-focus/{empresa_id}
 * e o webhook_secret exclusivo da credenciais_fiscais de cada empresa.
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/registrar-webhook-assinante',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { empresasDoUsuario } = require(`${__hooks}/tenancy.js`)
    const { obterTokenFocus, gerarWebhookSecret } = require(`${__hooks}/fiscal_token_lib.js`)

    // Verificar se é administrador
    let isAdmin = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', authRecord.id)
      if (userRec && userRec.getString('tipo') === 'master') {
        isAdmin = true
      }
    } catch (_) {}

    if (!isAdmin) {
      const perfilId = authRecord.getString('perfil_acesso_id') || authRecord.getString('perfil_id')
      if (perfilId) {
        try {
          const perfil = $app.findRecordById('perfis_acesso', perfilId)
          if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
            isAdmin = true
          }
        } catch (_) {}
      }
    }

    if (!isAdmin) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRecord.id + "' || id = '" + authRecord.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          const pId = uRecs[0].getString('perfil_id')
          if (pId) {
            const perfil = $app.findRecordById('perfis_acesso', pId)
            if (perfil && perfil.getBool('ativo') && perfil.getBool('administrador')) {
              isAdmin = true
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return c.json(403, {
        sucesso: false,
        message: 'Apenas Administradores podem registrar webhooks em lote.',
      })
    }

    const empresas = empresasDoUsuario(authRecord)
    if (!empresas || empresas.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Nenhuma empresa ativa encontrada para o assinante.',
      })
    }

    const encodeBase64 = (str) => {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        try {
          return Buffer.from(str, 'utf8').toString('base64')
        } catch (_) {}
      }
      if (typeof btoa === 'function') {
        try {
          return btoa(str)
        } catch (_) {}
      }
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      let i = 0
      const len = str.length
      while (i < len) {
        const c1 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt((c1 & 0x3) << 4)
          out += '=='
          break
        }
        const c2 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
          out += chars.charAt((c2 & 0x0f) << 2)
          out += '='
          break
        }
        const c3 = str.charCodeAt(i++) & 0xff
        out += chars.charAt(c1 >> 2)
        out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
        out += chars.charAt(((c2 & 0x0f) << 2) | ((c3 & 0xc0) >> 6))
        out += chars.charAt(c3 & 0x3f)
      }
      return out
    }

    const resultados = []

    for (let i = 0; i < empresas.length; i++) {
      const emp = empresas[i]
      const empId = emp.id
      const nomeEmp = emp.getString('nome_fantasia') || emp.getString('razao_social')
      const cnpjEmp = (emp.getString('cnpj') || '').replace(/\D/g, '')

      let cred = null
      try {
        const creds = $app.findRecordsByFilter(
          'credenciais_fiscais',
          "empresa_id = '" + empId + "'",
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) cred = creds[0]
      } catch (_) {}

      if (!cred) {
        try {
          const col = $app.findCollectionByNameOrId('credenciais_fiscais')
          cred = new Record(col)
          cred.set('empresa_id', empId)
          cred.set('webhook_secret', gerarWebhookSecret(32))
          cred.set('atualizado_por', authRecord.id)
          cred.set('atualizado_em', new Date().toISOString())
          $app.save(cred)
        } catch (errC) {
          console.warn('Erro ao criar credenciais_fiscais:', errC)
        }
      } else if (!cred.getString('webhook_secret')) {
        try {
          cred.set('webhook_secret', gerarWebhookSecret(32))
          $app.save(cred)
        } catch (_) {}
      }

      const webhookSecret = cred ? cred.getString('webhook_secret') : ''
      const tokenInfo = obterTokenFocus(empId, $app)
      const token = tokenInfo.token
      const ambiente = tokenInfo.ambiente

      if (!token) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: 'Token fiscal não configurado (nem no banco nem em segredos).',
        })
        continue
      }

      const urlWebhook = `https://erp-de-gestao-comercial-24560.goskip.app/backend/v1/fiscal/webhook-focus/${empId}`
      const baseUrl =
        ambiente === 'Produção'
          ? 'https://api.focusnfe.com.br/v2'
          : 'https://homologacao.focusnfe.com.br/v2'

      const basicAuth = 'Basic ' + encodeBase64(token + ':')
      const payloadHook = {
        cnpj: cnpjEmp,
        event: 'nfe',
        url: urlWebhook,
        authorization: webhookSecret,
      }

      try {
        const res = $http.send({
          method: 'POST',
          url: `${baseUrl}/hooks`,
          headers: {
            Authorization: basicAuth,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payloadHook),
          timeout: 30,
        })

        const status = res.statusCode || 200
        let respJson = null
        try {
          respJson = JSON.parse(res.raw || '{}')
        } catch (_) {}

        if (status >= 200 && status < 300) {
          resultados.push({
            empresa_id: empId,
            empresa_nome: nomeEmp,
            sucesso: true,
            origem_token: tokenInfo.origem,
            url: urlWebhook,
            mensagem: 'Webhook registrado na Focus NFe com sucesso.',
          })
        } else {
          resultados.push({
            empresa_id: empId,
            empresa_nome: nomeEmp,
            sucesso: false,
            origem_token: tokenInfo.origem,
            url: urlWebhook,
            mensagem: respJson?.mensagem || respJson?.message || `HTTP ${status}`,
          })
        }
      } catch (errHook) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          origem_token: tokenInfo.origem,
          url: urlWebhook,
          mensagem: 'Falha na comunicação com a Focus NFe.',
        })
      }
    }

    const sucessoGeral = resultados.some((r) => r.sucesso)
    return c.json(200, {
      sucesso: sucessoGeral,
      message: sucessoGeral
        ? 'Processamento de registro de webhooks concluído.'
        : 'Nenhum webhook pôde ser registrado.',
      resultados: resultados,
    })
  },
  $apis.requireAuth(),
)
