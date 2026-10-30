// reenvio 9.8r2
// @ts-check
/// <reference path="../types.d.ts" />

/**
 * MÓDULO CENTRAL DE TENANCY (Etapa 9 - Multi-tenant, Prompts 9.1 e 9.2)
 *
 * Funções essenciais para governança multi-tenant:
 * 1. assinanteDoUsuario(auth): Retorna o registro do assinante a partir do usuário logado
 *    (via usuarios.assinante_id). Lança erro se o usuário não possuir assinante.
 * 2. eMaster(auth): Retorna true estritamente se users.tipo = 'master' (lido no backend).
 * 3. empresasDoUsuario(auth):
 *    - Para administrador do assinante (perfis_acesso.administrador = true, INCLUSIVE o master,
 *      dentro da HOSPITAL HOME): retorna TODAS as empresas ativas do PRÓPRIO assinante.
 *    - Para os demais: retorna apenas as empresas ativas em usuarios_empresas do usuário.
 *    - NUNCA retorna empresas de outro assinante.
 * 4. exigirEmpresaDoUsuario(auth, empresaId): Retorna o registro da empresa se autorizado,
 *    ou lança erro 403 se a empresa não pertencer ao escopo permitido do usuário.
 *
 * Endpoints:
 * - GET /backend/v1/empresas/acessiveis: Devolve a lista de empresas acessíveis pelo usuário logado
 *   respeitando a semântica rigorosa de empresasDoUsuario.
 * - GET /backend/v1/tenancy/me: Devolve dados básicos do assinante e status de master para o frontend.
 */

/**
 * 1) GET /backend/v1/empresas/acessiveis
 * Retorna as empresas acessíveis para o usuário autenticado segundo regras de tenancy.
 */
/**
 * Retorna o registro do assinante a partir do auth record do PocketBase.
 * Lança erro se o usuário não possuir assinante ativo.
 * @param {models.Record|any} auth
 * @returns {models.Record}
 */
function assinanteDoUsuario(auth) {
  if (!auth) {
    throw new BadRequestError('Autenticação necessária para identificar o assinante.')
  }

  let usuarioRec = null
  try {
    const uRecs = $app.findRecordsByFilter(
      'usuarios',
      "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
      '-created',
      1,
      0,
    )
    if (uRecs && uRecs.length > 0) {
      usuarioRec = uRecs[0]
    }
  } catch (_) {}

  if (!usuarioRec && auth.getString && auth.getString('email')) {
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "email = '" + auth.getString('email') + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
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

  function checarSeMasterLocal(authRec, appInstance) {
    const app = appInstance || $app
    if (!authRec || !authRec.id) return false
    try {
      const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
    if (!assinanteRec) return

    // Assinante de origem NUNCA é bloqueado
    if (
      assinanteRec.getBool('origem') ||
      assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
    ) {
      return
    }

    // O master NUNCA é bloqueado
    if (authRecord && checarSeMasterLocal(authRecord)) {
      return
    }

    const status = assinanteRec.getString('status')
    if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
      throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
    }
  }

  // Prompt 9.7b2: Se for Master e estiver com modo master (impersonação) ligado no servidor,
  // tenancy.js passa a usar o assinante do cliente que o master está atendendo
  if (eMaster(auth)) {
    try {
      const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
      if (impersonadoId) {
        assinanteId = impersonadoId
      }
    } catch (_) {}
  }

  const assinante = $app.findRecordById('assinantes', assinanteId)
  if (!assinante) {
    throw new BadRequestError('Assinante não encontrado.')
  }

  // Prompt 9.7b2: Bloqueio de licença Pausada, Expirada ou Cancelada
  try {
    validarLicencaAtivaOuBloquearLocal(assinante, auth)
  } catch (errBloq) {
    throw errBloq
  }

  return assinante
}

/**
 * Retorna true estritamente se o usuário logado for 'master' (lido em _pb_users_auth_).
 * @param {models.Record|any} auth
 * @returns {boolean}
 */
function eMaster(auth) {
  if (!auth) return false
  try {
    const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
    return !!(userRec && userRec.getString('tipo') === 'master')
  } catch (_) {
    return false
  }
}

/**
 * Retorna a lista de empresas acessíveis pelo usuário logado respeitando a tenancy.
 * @param {models.Record|any} auth
 * @returns {models.Record[]}
 */
function empresasDoUsuario(auth) {
  if (!auth) return []

  let usuarioRec = null
  try {
    const uRecs = $app.findRecordsByFilter(
      'usuarios',
      "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
      '-created',
      1,
      0,
    )
    if (uRecs && uRecs.length > 0) {
      usuarioRec = uRecs[0]
    }
  } catch (_) {}

  if (!usuarioRec && auth.getString && auth.getString('email')) {
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "email = '" + auth.getString('email') + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
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

  // Prompt 9.7b2: Se o usuário autenticado for Master em modo de suporte,
  // usa o assinante impersonado para consultar empresas
  const ehMasterUser = eMaster(auth)
  if (ehMasterUser) {
    try {
      const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
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

  // Se for admin do assinante OU for Master, vê todas as empresas ativas do assinante
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

/**
 * Exige e retorna o registro da empresa se pertencer ao escopo permitido do usuário logado.
 * @param {models.Record|any} auth
 * @param {string} empresaId
 * @returns {models.Record}
 */
function exigirEmpresaDoUsuario(auth, empresaId) {
  if (!empresaId) {
    throw new BadRequestError('ID da empresa é obrigatório.')
  }
  const permitidas = empresasDoUsuario(auth)
  const encontrada = permitidas.find((e) => e.id === empresaId)
  if (!encontrada) {
    throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
  }
  return encontrada
}

routerAdd(
  'GET',
  '/backend/v1/empresas/acessiveis',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) {
      return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
    }

    try {
      // Localizar registro em usuarios
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}

      if (!usuarioRec && auth.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + auth.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) {
            usuarioRec = uRecs[0]
          }
        } catch (_) {}
      }

      if (!usuarioRec) {
        return c.json(200, { sucesso: true, empresas: [] })
      }

      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) {
        return c.json(200, { sucesso: true, empresas: [] })
      }

      // Checar se é master lido no banco
      let ehMaster = false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        ehMaster = !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {}

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

      function checarSeMasterLocal(authRec, appInstance) {
        const app = appInstance || $app
        if (!authRec || !authRec.id) return false
        try {
          const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
        if (!assinanteRec) return

        // Assinante de origem NUNCA é bloqueado
        if (
          assinanteRec.getBool('origem') ||
          assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
        ) {
          return
        }

        // O master NUNCA é bloqueado
        if (authRecord && checarSeMasterLocal(authRecord)) {
          return
        }

        const status = assinanteRec.getString('status')
        if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
          throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
        }
      }

      if (ehMaster) {
        try {
          const impId = obterAssinanteImpersonadoLocal(auth.id, $app)
          if (impId) {
            assinanteId = impId
          }
        } catch (_) {}
      }

      // Validar se a licença do assinante está bloqueada
      try {
        const assRec = $app.findRecordById('assinantes', assinanteId)
        validarLicencaAtivaOuBloquearLocal(assRec, auth)
      } catch (errBloq) {
        return c.json(403, {
          sucesso: false,
          message: errBloq.message || 'Licença pausada ou vencida. Fale com o suporte.',
        })
      }

      // Checar se é administrador via perfis_acesso
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

      let empresas = []
      if (isAdmin || ehMaster) {
        // Administrador (ou Master) vê todas as empresas ativas do assinante em foco
        try {
          empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
        } catch (errAdmin) {
          console.error('[empresas/acessiveis] Erro admin:', errAdmin)
        }
      } else {
        // Usuário comum: apenas as de usuarios_empresas que pertençam ao mesmo assinante
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

        permitidosIds.forEach((eId) => {
          try {
            const emp = $app.findRecordById('empresas', eId)
            if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
              empresas.push(emp)
            }
          } catch (_) {}
        })

        empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
      }

      const lista = empresas.map((e) => ({
        id: e.id,
        codigo: e.getInt('codigo') || 0,
        tipo: e.getString('tipo') || 'Matriz',
        razao_social: e.getString('razao_social') || '',
        nome_fantasia: e.getString('nome_fantasia') || e.getString('razao_social') || '',
        cnpj: e.getString('cnpj') || '',
        uf: e.getString('uf') || '',
        municipio: e.getString('municipio') || '',
        ativo: e.getBool('ativo'),
        assinante_id: e.getString('assinante_id') || '',
        crt: e.getInt('crt') || 0,
        regime_apuracao: e.getString('regime_apuracao') || '',
        regime_pis_cofins: e.getString('regime_pis_cofins') || '',
      }))

      return c.json(200, {
        sucesso: true,
        empresas: lista,
      })
    } catch (err) {
      console.error('[GET /backend/v1/empresas/acessiveis] Erro:', err)
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao consultar empresas acessíveis.',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * 2) GET /backend/v1/tenancy/me
 * Retorna dados do assinante ativo e confirmação se o usuário é master.
 */
routerAdd(
  'GET',
  '/backend/v1/tenancy/me',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) {
      return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
    }

    try {
      // 1. Checar se é master lido no banco
      let ehMaster = false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        if (userRec) {
          ehMaster = userRec.getString('tipo') === 'master'
        }
      } catch (_) {}

      // 2. Localizar registro de usuarios
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}

      if (!usuarioRec && auth.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + auth.getString('email') + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) {
            usuarioRec = uRecs[0]
          }
        } catch (_) {}
      }

      let assinante = null
      let modoMasterAtivo = false
      let assinanteOrigem = null

      if (usuarioRec) {
        let assId = usuarioRec.getString('assinante_id')

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

        function checarSeMasterLocal(authRec, appInstance) {
          const app = appInstance || $app
          if (!authRec || !authRec.id) return false
          try {
            const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
            return !!(userRec && userRec.getString('tipo') === 'master')
          } catch (_) {
            return false
          }
        }

        function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
          if (!assinanteRec) return

          // Assinante de origem NUNCA é bloqueado
          if (
            assinanteRec.getBool('origem') ||
            assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
          ) {
            return
          }

          // O master NUNCA é bloqueado
          if (authRecord && checarSeMasterLocal(authRecord)) {
            return
          }

          const status = assinanteRec.getString('status')
          if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
            throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
          }
        }

        if (ehMaster) {
          try {
            const impId = obterAssinanteImpersonadoLocal(auth.id, $app)
            if (impId) {
              modoMasterAtivo = true
              assId = impId
            }
          } catch (_) {}
        }

        if (assId) {
          try {
            const assRec = $app.findRecordById('assinantes', assId)
            if (assRec) {
              // Validar bloqueio de licença se não for master
              try {
                validarLicencaAtivaOuBloquearLocal(assRec, auth)
              } catch (errBloq) {
                return c.json(403, {
                  sucesso: false,
                  message: errBloq.message || 'Licença pausada ou vencida. Fale com o suporte.',
                })
              }

              assinante = {
                id: assRec.id,
                numero_licenca: assRec.getString('numero_licenca'),
                nome: assRec.getString('nome'),
                documento: assRec.getString('documento'),
                email_contato: assRec.getString('email_contato'),
                telefone: assRec.getString('telefone'),
                whatsapp_contato: assRec.getString('whatsapp_contato'),
                status: assRec.getString('status'),
                origem: assRec.getBool('origem'),
                data_inicio: assRec.getString('data_inicio'),
                data_expiracao: assRec.getString('data_expiracao'),
                limites_personalizados: assRec.getBool('limites_personalizados'),
                limite_usuarios: assRec.getInt('limite_usuarios') || 0,
                limite_empresas: assRec.getInt('limite_empresas') || 0,
              }
            }
          } catch (_) {}
        }

        // Se modo master estiver ativo, carrega também os dados do assinante de origem para facilitar o retorno
        if (modoMasterAtivo && usuarioRec.getString('assinante_id')) {
          try {
            const oRec = $app.findRecordById('assinantes', usuarioRec.getString('assinante_id'))
            if (oRec) {
              assinanteOrigem = {
                id: oRec.id,
                nome: oRec.getString('nome'),
                numero_licenca: oRec.getString('numero_licenca'),
              }
            }
          } catch (_) {}
        }
      }

      return c.json(200, {
        sucesso: true,
        is_master: ehMaster,
        modo_master: modoMasterAtivo,
        assinante_origem: assinanteOrigem,
        assinante,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao consultar tenancy.',
      })
    }
  },
  $apis.requireAuth(),
)

module.exports = {
  assinanteDoUsuario: assinanteDoUsuario,
  eMaster: eMaster,
  empresasDoUsuario: empresasDoUsuario,
  exigirEmpresaDoUsuario: exigirEmpresaDoUsuario,
}
