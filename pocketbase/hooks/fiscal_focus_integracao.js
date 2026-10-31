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
 * Funções de tenancy e fiscal_token_lib são copiadas localmente dentro dos callbacks
 * para evitar require(`${__hooks}/...`) que causa 'Invalid module' no JSVM e para evitar
 * referenciar funções top-level dentro de callbacks.
 *
 * Endpoints:
 * - POST /backend/v1/fiscal/testar-conexao
 * - GET  /backend/v1/fiscal/status-segredos
 */

/**
 * 1) POST /backend/v1/fiscal/testar-conexao
 * Testa conexão com a API da Focus NFe usando o token configurado (banco ou segredo).
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

    function assinanteDoUsuario(authRec) {
      if (!authRec) {
        throw new BadRequestError('Autenticação necessária para identificar o assinante.')
      }
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
        } catch (_) {}
      }

      if (!usuarioRec) {
        throw new BadRequestError('Registro de usuário ERP não encontrado.')
      }

      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) {
        throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
      }

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

      function checarSeMasterLocal(aRec, appInstance) {
        const app = appInstance || $app
        if (!aRec || !aRec.id) return false
        try {
          const userRec = app.findRecordById('_pb_users_auth_', aRec.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function validarLicencaAtivaOuBloquearLocal(assinanteRec, aRecord) {
        if (!assinanteRec) return
        if (
          assinanteRec.getBool('origem') ||
          assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
        ) {
          return
        }
        if (aRecord && checarSeMasterLocal(aRecord)) {
          return
        }
        const status = assinanteRec.getString('status')
        if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
          throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
        }
      }

      if (eMaster(authRec)) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
          }
        } catch (_) {}
      }

      const assinante = $app.findRecordById('assinantes', assinanteId)
      if (!assinante) {
        throw new BadRequestError('Assinante não encontrado.')
      }

      try {
        validarLicencaAtivaOuBloquearLocal(assinante, authRec)
      } catch (errBloq) {
        throw errBloq
      }

      return assinante
    }

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
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

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
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

    function exigirEmpresaDoUsuario(authRec, empresaId) {
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    try {
      assinanteDoUsuario(authRecord)
    } catch (errTenancy) {
      return c.json(401, {
        sucesso: false,
        message: errTenancy.message || 'Falha na autenticação do assinante.',
      })
    }

    let empresaId = ''
    try {
      const body = c.requestInfo().body || {}
      empresaId = (body.empresa_id || '').trim()
    } catch (_) {}

    if (!empresaId) {
      try {
        empresaId = (c.requestInfo().query.empresa_id || '').trim()
      } catch (_) {}
    }

    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'ID da empresa é obrigatório.' })
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
        segredo_nome: tokenInfo.nomeSegredo,
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
      segredo_nome: tokenInfo.nomeSegredo,
      status_code: statusCode,
      dados: jsonResp,
    })
  },
  $apis.requireAuth(),
)

/**
 * 2) GET /backend/v1/fiscal/status-segredos
 * Retorna o status de configuração de segredos de ambiente ou tokens das empresas acessíveis.
 * Formato esperado pelo frontend (StatusSegredosResponse):
 * {
 *   sucesso: true,
 *   status: {
 *     [empresaId]: {
 *       segredo_nome: string,
 *       segredo_configurado: boolean,
 *       ambiente: 'Homologação' | 'Produção'
 *     }
 *   }
 * }
 */
routerAdd(
  'GET',
  '/backend/v1/fiscal/status-segredos',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, status: {} })
    }

    function assinanteDoUsuario(authRec) {
      if (!authRec) {
        throw new BadRequestError('Autenticação necessária para identificar o assinante.')
      }
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
        } catch (_) {}
      }

      if (!usuarioRec) {
        throw new BadRequestError('Registro de usuário ERP não encontrado.')
      }

      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) {
        throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
      }

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

      function checarSeMasterLocal(aRec, appInstance) {
        const app = appInstance || $app
        if (!aRec || !aRec.id) return false
        try {
          const userRec = app.findRecordById('_pb_users_auth_', aRec.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function validarLicencaAtivaOuBloquearLocal(assinanteRec, aRecord) {
        if (!assinanteRec) return
        if (
          assinanteRec.getBool('origem') ||
          assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
        ) {
          return
        }
        if (aRecord && checarSeMasterLocal(aRecord)) {
          return
        }
        const status = assinanteRec.getString('status')
        if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
          throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
        }
      }

      if (eMaster(authRec)) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
          }
        } catch (_) {}
      }

      const assinante = $app.findRecordById('assinantes', assinanteId)
      if (!assinante) {
        throw new BadRequestError('Assinante não encontrado.')
      }

      try {
        validarLicencaAtivaOuBloquearLocal(assinante, authRec)
      } catch (errBloq) {
        throw errBloq
      }

      return assinante
    }

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
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

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
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

    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    try {
      assinanteDoUsuario(authRecord)
    } catch (_) {
      return c.json(401, { sucesso: false, status: {} })
    }

    let empresas = []
    try {
      empresas = empresasDoUsuario(authRecord)
    } catch (_) {
      empresas = []
    }

    const statusObj = {}
    for (let i = 0; i < empresas.length; i++) {
      const emp = empresas[i]
      if (!emp || !emp.id) continue
      try {
        const info = obterTokenFocus(emp.id, $app)
        const configurado = Boolean(info.token && info.token.length > 0)
        statusObj[emp.id] = {
          segredo_nome: info.nomeSegredo || '',
          segredo_configurado: configurado,
          ambiente: info.ambiente === 'Produção' ? 'Produção' : 'Homologação',
        }
      } catch (_) {}
    }

    return c.json(200, {
      sucesso: true,
      status: statusObj,
    })
  },
  $apis.requireAuth(),
)
