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

  const assinanteId = usuarioRec.getString('assinante_id')
  if (!assinanteId) {
    throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
  }

  const assinante = $app.findRecordById('assinantes', assinanteId)
  if (!assinante) {
    throw new BadRequestError('Assinante não encontrado.')
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

  const assinanteId = usuarioRec.getString('assinante_id')
  if (!assinanteId) return []

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

  if (isAdmin) {
    try {
      return $app.findRecordsByFilter(
        'empresas',
        "assinante_id = '" + assinanteId + "' && ativo = true",
        'codigo',
        500,
        0,
      )
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

      const assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) {
        return c.json(200, { sucesso: true, empresas: [] })
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
      if (isAdmin) {
        // Administrador vê todas as empresas do PRÓPRIO assinante
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
      if (usuarioRec) {
        const assId = usuarioRec.getString('assinante_id')
        if (assId) {
          try {
            const assRec = $app.findRecordById('assinantes', assId)
            if (assRec) {
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
      }

      return c.json(200, {
        sucesso: true,
        is_master: ehMaster,
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
