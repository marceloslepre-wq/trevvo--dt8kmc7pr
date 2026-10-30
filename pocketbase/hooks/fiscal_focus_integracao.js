// reenvio 9.8r2
// @ts-check
/// <reference path="../types.d.ts" />

/**
 * SERVIÇO ÚNICO DE INTEGRAÇÃO FISCAL COM A FOCUS NFE
 *
 * É o ÚNICO código do sistema que se comunica com a API da Focus NFe.
 * O token da Focus NFe NUNCA vai para o navegador.
 *
 * Em conformidade com o JSVM do PocketBase (Goja / isolate pool), todas as
 * rotinas de negócio e chamadas $http são executadas internamente em cada callback.
 *
 * Endpoints:
 * - POST /backend/v1/fiscal/testar-conexao
 * - POST /backend/v1/fiscal/emitir-nfce
 * - POST /backend/v1/fiscal/emitir-nfe
 * - POST /backend/v1/fiscal/consultar
 * - POST /backend/v1/fiscal/cancelar
 * - POST /backend/v1/fiscal/carta-correcao
 * - POST /backend/v1/fiscal/inutilizar
 * - POST /backend/v1/fiscal/baixar-arquivo
 * - GET  /backend/v1/fiscal/status-segredos
 */

/**
 * POST /backend/v1/fiscal/testar-conexao
 * Testa conexão GET /hooks no ambiente da empresa
 * Body: { empresa_id: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/testar-conexao',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id

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

    // Validação da empresa
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      empresa = null
    }

    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(200, {
        sucesso: false,
        message: 'Empresa emitente não encontrada ou inativa no sistema.',
      })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    // Carregar config fiscal
    let configs = []
    try {
      configs = $app.findRecordsByFilter(
        'config_emissao_fiscal',
        `empresa_id = '${empresaId}' && ativo = true`,
        '-created',
        1,
        0,
      )
    } catch (_) {
      configs = []
    }

    if (!configs || configs.length === 0) {
      return c.json(200, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa. Salve os parâmetros antes de testar.`,
      })
    }

    const config = configs[0]
    if (!config.getBool('emite_documentos_fiscais')) {
      return c.json(200, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não está configurada para emitir NF-e/NFC-e (opção desativada).`,
      })
    }

    const ie = (empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      return c.json(200, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) possui Inscrição Estadual ${ie || 'vazia'} e não pode emitir NF-e/NFC-e.`,
      })
    }

    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const nomeSegredo = tokenInfo.nomeSegredo
    const token = tokenInfo.token

    if (!token) {
      const msgSemToken = `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${nomeSegredo} no Skip Cloud.`
      try {
        config.set('ultimo_teste_conexao_data', new Date().toISOString())
        config.set('ultimo_teste_conexao_sucesso', false)
        config.set('ultimo_teste_conexao_mensagem', msgSemToken)
        config.set('updated_by', authRecord.id)
        $app.save(config)
      } catch (_) {}

      return c.json(200, {
        sucesso: false,
        message: msgSemToken,
        ambiente: ambiente,
        segredo_nome: nomeSegredo,
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
        timeout: 60,
      })

      statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {
        jsonResp = null
      }

      if (statusCode === 200) {
        sucesso = true
        mensagemRetorno = 'Conexão com a Focus NFe funcionando'
      } else if (statusCode === 401) {
        sucesso = false
        mensagemRetorno = 'Token inválido: confira o segredo do ambiente'
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
      mensagemRetorno = 'Sem comunicação com a API emissora'
    }

    // Gravar resultado na config_emissao_fiscal
    try {
      config.set('ultimo_teste_conexao_data', new Date().toISOString())
      config.set('ultimo_teste_conexao_sucesso', sucesso)
      config.set('ultimo_teste_conexao_mensagem', mensagemRetorno)
      config.set('updated_by', authRecord.id)
      $app.save(config)
    } catch (_) {}

    return c.json(200, {
      sucesso: sucesso,
      message: mensagemRetorno,
      ambiente: ambiente,
      segredo_nome: nomeSegredo,
      status_code: statusCode,
      dados: jsonResp,
    })
  },
  $apis.requireAuth(),
)

/**
 * GET /backend/v1/fiscal/status-segredos
 * Retorna, por empresa acessível, a origem do token ('banco' ou 'segredo'), se está configurado e ambiente, sem NUNCA mostrar o valor.
 */
routerAdd(
  'GET',
  '/backend/v1/fiscal/status-segredos',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { empresasDoUsuario } = require(`${__hooks}/tenancy.js`)
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)

    const permitidas = empresasDoUsuario(authRecord)
    const statusPorEmpresa = {}

    for (let i = 0; i < permitidas.length; i++) {
      const emp = permitidas[i]
      const empId = emp.id
      const tokenInfo = obterTokenFocus(empId, $app)

      statusPorEmpresa[empId] = {
        empresa_nome: emp.getString('nome_fantasia') || emp.getString('razao_social') || '',
        segredo_nome: tokenInfo.nomeSegredo,
        segredo_configurado: Boolean(tokenInfo.token && tokenInfo.token.length > 0),
        origem: tokenInfo.origem, // 'banco', 'segredo' ou 'nenhuma'
        ambiente: tokenInfo.ambiente,
        codigo_token: tokenInfo.codigoToken,
      }
    }

    return c.json(200, { sucesso: true, status: statusPorEmpresa })
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/emitir-nfce
 * POST /nfce?ref={ref} (síncrona; status "autorizado" ou "erro_autorizacao").
 * Body: { empresa_id: string, ref: string, dados: object, forma_emissao?: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfce',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const ref = (data.ref || '').trim()
    const dados = data.dados || {}
    const formaEmissao = (data.forma_emissao || '').trim()

    if (!empresaId || !ref) {
      return c.json(400, { sucesso: false, message: 'Campos empresa_id e ref são obrigatórios.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    if (!config.getBool('emite_documentos_fiscais')) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não emite NF-e/NFC-e.`,
      })
    }

    const ie = (empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) possui Inscrição Estadual ${ie || 'vazia'} e não pode emitir NF-e/NFC-e.`,
      })
    }

    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    let url = `${baseUrl}/nfce?ref=${encodeURIComponent(ref)}`
    if (formaEmissao) {
      url += `&forma_emissao=${encodeURIComponent(formaEmissao)}`
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

    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados),
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && typeof jsonResp === 'object') {
        const principal = jsonResp.mensagem || jsonResp.message || ''
        const cod = jsonResp.codigo ? `[${jsonResp.codigo}] ` : ''
        if (Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
          const det = jsonResp.erros
            .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
            .join('; ')
          msg = `${cod}${principal ? principal + ' - ' : ''}${det}`
        } else {
          msg = `${cod}${principal || 'Erro na Focus NFe'}`
        }
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/emitir-nfe
 * POST /nfe?ref={ref} (assíncrona; volta "processando_autorizacao").
 * Body: { empresa_id: string, ref: string, dados: object }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const ref = (data.ref || '').trim()
    const dados = data.dados || {}

    if (!empresaId || !ref) {
      return c.json(400, { sucesso: false, message: 'Campos empresa_id e ref são obrigatórios.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    if (!config.getBool('emite_documentos_fiscais')) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não emite NF-e/NFC-e.`,
      })
    }

    const ie = (empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) possui Inscrição Estadual ${ie || 'vazia'} e não pode emitir NF-e/NFC-e.`,
      })
    }

    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
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

    const url = `${baseUrl}/nfe?ref=${encodeURIComponent(ref)}`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dados),
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && typeof jsonResp === 'object') {
        const principal = jsonResp.mensagem || jsonResp.message || ''
        const cod = jsonResp.codigo ? `[${jsonResp.codigo}] ` : ''
        if (Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
          const det = jsonResp.erros
            .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
            .join('; ')
          msg = `${cod}${principal ? principal + ' - ' : ''}${det}`
        } else {
          msg = `${cod}${principal || 'Erro na Focus NFe'}`
        }
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/consultar
 * GET /nfe/{ref}?completa=1 ou GET /nfce/{ref}?completa=1
 * Body: { empresa_id: string, modelo: '55' | '65', ref: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/consultar',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const modelo = String(data.modelo || '55').trim()
    const ref = (data.ref || '').trim()

    if (!empresaId || !ref) {
      return c.json(400, { sucesso: false, message: 'Campos empresa_id e ref são obrigatórios.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
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

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const url = `${baseUrl}/${endpoint}/${encodeURIComponent(ref)}?completa=1`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'GET',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
        },
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && (jsonResp.mensagem || jsonResp.message)) {
        msg = jsonResp.mensagem || jsonResp.message
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/cancelar
 * DELETE /nfe/{ref} ou /nfce/{ref} com {"justificativa": ...} (15 a 255 caracteres)
 * Body: { empresa_id: string, modelo: '55' | '65', ref: string, justificativa: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/cancelar',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const modelo = String(data.modelo || '55').trim()
    const ref = (data.ref || '').trim()
    const justificativa = (data.justificativa || '').trim()

    if (!empresaId || !ref) {
      return c.json(400, { sucesso: false, message: 'Campos empresa_id e ref são obrigatórios.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    if (!justificativa || justificativa.length < 15 || justificativa.length > 255) {
      return c.json(400, {
        sucesso: false,
        message: 'A justificativa de cancelamento deve ter entre 15 e 255 caracteres.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
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

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const url = `${baseUrl}/${endpoint}/${encodeURIComponent(ref)}`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'DELETE',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ justificativa: justificativa }),
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && typeof jsonResp === 'object') {
        const principal = jsonResp.mensagem || jsonResp.message || ''
        const cod = jsonResp.codigo ? `[${jsonResp.codigo}] ` : ''
        if (Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
          const det = jsonResp.erros
            .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
            .join('; ')
          msg = `${cod}${principal ? principal + ' - ' : ''}${det}`
        } else {
          msg = `${cod}${principal || 'Erro na Focus NFe'}`
        }
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/carta-correcao
 * POST /nfe/{ref}/carta_correcao com {"correcao": ...} (15 a 1000 caracteres)
 * Body: { empresa_id: string, ref: string, correcao: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/carta-correcao',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const ref = (data.ref || '').trim()
    const correcao = (data.correcao || '').trim()

    if (!empresaId || !ref) {
      return c.json(400, { sucesso: false, message: 'Campos empresa_id e ref são obrigatórios.' })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    if (!correcao || correcao.length < 15 || correcao.length > 1000) {
      return c.json(400, {
        sucesso: false,
        message: 'A carta de correção deve ter entre 15 e 1000 caracteres.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
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

    const url = `${baseUrl}/nfe/${encodeURIComponent(ref)}/carta_correcao`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correcao: correcao }),
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && typeof jsonResp === 'object') {
        const principal = jsonResp.mensagem || jsonResp.message || ''
        const cod = jsonResp.codigo ? `[${jsonResp.codigo}] ` : ''
        if (Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
          const det = jsonResp.erros
            .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
            .join('; ')
          msg = `${cod}${principal ? principal + ' - ' : ''}${det}`
        } else {
          msg = `${cod}${principal || 'Erro na Focus NFe'}`
        }
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/inutilizar
 * POST /nfe/inutilizacao ou /nfce/inutilizacao com cnpj, serie, numero_inicial, numero_final e justificativa (mínimo 15 caracteres)
 * Body: { empresa_id: string, modelo: '55' | '65', serie: string, numero_inicial: number, numero_final: number, justificativa: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/inutilizar',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const modelo = String(data.modelo || '55').trim()
    const serie = String(data.serie || '1').trim()
    const numeroInicial = Number(data.numero_inicial)
    const numeroFinal = Number(data.numero_final)
    const justificativa = (data.justificativa || '').trim()

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

    if (
      !serie ||
      isNaN(numeroInicial) ||
      isNaN(numeroFinal) ||
      numeroInicial <= 0 ||
      numeroFinal < numeroInicial
    ) {
      return c.json(400, {
        sucesso: false,
        message: 'Parâmetros de numeração inválidos (série, número inicial e número final).',
      })
    }

    if (!justificativa || justificativa.length < 15) {
      return c.json(400, {
        sucesso: false,
        message: 'A justificativa de inutilização deve ter no mínimo 15 caracteres.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const cnpjLimpo = (empresa.getString('cnpj') || '').replace(/\D/g, '')
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

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const url = `${baseUrl}/${endpoint}/inutilizacao`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    const bodyInutilizacao = {
      cnpj: cnpjLimpo,
      serie: serie,
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      justificativa: justificativa,
    }

    try {
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyInutilizacao),
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let jsonResp = null
      try {
        jsonResp = JSON.parse(rawText)
      } catch (_) {}

      // Gravar na tabela inutilizacoes
      const statusRet = statusCode >= 200 && statusCode < 300 ? 'Autorizada' : 'Rejeitada'
      const protocoloRet =
        jsonResp?.protocolo_sefaz ||
        jsonResp?.protocolo ||
        jsonResp?.dados?.protocolo_sefaz ||
        jsonResp?.dados?.protocolo ||
        ''
      const msgSefazRet = jsonResp?.mensagem_sefaz || jsonResp?.mensagem || ''
      const caminhoXmlRet = jsonResp?.caminho_xml || jsonResp?.dados?.caminho_xml || ''

      // Se retornou caminho_xml e status foi autorizado, podemos baixar o XML e persistir no registro
      let xmlArquivoFile = null
      if (caminhoXmlRet && statusRet === 'Autorizada') {
        try {
          let urlXml = caminhoXmlRet
          if (caminhoXmlRet.startsWith('/')) {
            const serverOrigin =
              ambiente === 'Produção'
                ? 'https://api.focusnfe.com.br'
                : 'https://homologacao.focusnfe.com.br'
            urlXml = `${serverOrigin}${caminhoXmlRet}`
          }
          const resXml = $http.send({
            method: 'GET',
            url: urlXml,
            headers: {
              Authorization: basicAuthHeader,
            },
            timeout: 30,
          })
          if (resXml.statusCode >= 200 && resXml.statusCode < 300 && resXml.raw) {
            const nomeArquivo = `inutilizacao_${modelo}_serie${serie}_${numeroInicial}_${numeroFinal}.xml`
            xmlArquivoFile = $filesystem.fileFromBytes(
              typeof resXml.raw === 'string' ? $security.stringToBytes(resXml.raw) : resXml.raw,
              nomeArquivo,
            )
          }
        } catch (errXml) {
          console.warn('Não foi possível pré-baixar XML da inutilização:', errXml)
        }
      }

      try {
        const inutCol = $app.findCollectionByNameOrId('inutilizacoes')
        const inutRec = new Record(inutCol)
        inutRec.set('empresa_id', empresaId)
        inutRec.set('modelo', modelo)
        inutRec.set('serie', serie)
        inutRec.set('numero_inicial', numeroInicial)
        inutRec.set('numero_final', numeroFinal)
        inutRec.set('justificativa', justificativa)
        inutRec.set('status', statusRet)
        inutRec.set('protocolo', protocoloRet)
        inutRec.set('mensagem_sefaz', msgSefazRet)
        inutRec.set('usuario_id', authRecord.id)
        inutRec.set('data_inutilizacao', new Date().toISOString())
        inutRec.set('ativo', true)
        if (xmlArquivoFile) {
          inutRec.set('xml_arquivo', xmlArquivoFile)
        }
        $app.save(inutRec)
      } catch (errInut) {
        console.warn('Erro ao salvar registro de inutilizacao:', errInut)
      }

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          dados: jsonResp,
        })
      }

      let msg = ''
      if (statusCode === 401) {
        msg = 'Token inválido: confira o segredo do ambiente'
      } else if (jsonResp && typeof jsonResp === 'object') {
        const principal = jsonResp.mensagem || jsonResp.message || ''
        const cod = jsonResp.codigo ? `[${jsonResp.codigo}] ` : ''
        if (Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
          const det = jsonResp.erros
            .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
            .join('; ')
          msg = `${cod}${principal ? principal + ' - ' : ''}${det}`
        } else {
          msg = `${cod}${principal || 'Erro na Focus NFe'}`
        }
      } else {
        msg = `Focus NFe retornou status HTTP ${statusCode}`
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: msg,
        detalhes: jsonResp || rawText,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/baixar-arquivo
 * Baixa o XML ou DANFE retornado pela Focus NFe
 * Body: { empresa_id: string, caminho: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/baixar-arquivo',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

    const data = c.requestInfo().body || {}
    const empresaId = data.empresa_id
    const caminho = (data.caminho || '').trim()

    if (!empresaId || !caminho) {
      return c.json(400, {
        sucesso: false,
        message: 'Campos empresa_id e caminho são obrigatórios.',
      })
    }

    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }

    const empresa = $app.findRecordById('empresas', empresaId)
    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da empresa ${nomeEmpresa} não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
      })
    }

    let urlFinal = caminho
    if (caminho.startsWith('/')) {
      const serverOrigin =
        ambiente === 'Produção'
          ? 'https://api.focusnfe.com.br'
          : 'https://homologacao.focusnfe.com.br'
      urlFinal = `${serverOrigin}${caminho}`
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

    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'GET',
        url: urlFinal,
        headers: {
          Authorization: basicAuthHeader,
        },
        timeout: 60,
      })

      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''

      if (statusCode >= 200 && statusCode < 300) {
        return c.json(200, {
          sucesso: true,
          ambiente: ambiente,
          conteudo: rawText,
        })
      }

      return c.json(statusCode >= 400 && statusCode < 500 ? statusCode : 400, {
        sucesso: false,
        message: `Erro ao baixar arquivo (HTTP ${statusCode})`,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a API emissora',
      })
    }
  },
  $apis.requireAuth(),
)
