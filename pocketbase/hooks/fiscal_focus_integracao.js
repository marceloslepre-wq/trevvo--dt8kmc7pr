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
 * para evitar require(`${__hooks}/...`) que causa 'Invalid module' no JSVM.
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

function copiarTenancyLocal(auth) {
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
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  return { assinanteDoUsuario, eMaster, empresasDoUsuario, exigirEmpresaDoUsuario }
}

function obterTokenFocusLocal(empresaId, appInstance) {
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
        ehProducao ? credRec.getString('token_producao') : credRec.getString('token_homologacao')
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
        const segFilial05 = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || '').trim()
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
