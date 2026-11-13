routerAdd(
  'POST',
  '/backend/v1/usuarios-admin/criar',
  (e) => {
    // 1. Verificar autenticação
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    // E-mail do token: o JSVM nem sempre expõe `.email` como propriedade direta,
    // então preferir getString (campo hidden do auth é acessível via Get).
    let tokenEmail = ''
    try {
      if (authRecord.getString) {
        tokenEmail = authRecord.getString('email')
      }
      if (!tokenEmail && authRecord.email) {
        tokenEmail = authRecord.email
      }
      if (tokenEmail) {
        tokenEmail = String(tokenEmail).toLowerCase()
      }
    } catch (_) {
      tokenEmail = ''
    }

    // 2. Verificar se o chamador tem permissão de administrador ou pode_criar usuarios
    //    O id declarado no token pode não existir na coleção users (ex.: sessão emitida
    //    antes de uma troca de banco/limpeza), então a resolução do chamador nunca pode
    //    confiar só no id: o e-mail do token é o fallback confiável.
    let isAllowed = false
    let callerUser = null
    try {
      try {
        callerUser = $app.findFirstRecordByData('usuarios', 'auth_user_id', authRecord.id)
      } catch (_) {
        callerUser = null
      }

      // Fallback: o id do token pode não existir no banco (sessão emitida antes de
      // uma troca de banco/limpeza); o e-mail do token casa com o cadastro real.
      if (!callerUser && tokenEmail) {
        try {
          callerUser = $app.findFirstRecordByData('usuarios', 'email', tokenEmail)
        } catch (_) {
          callerUser = null
        }
      }

      if (callerUser && callerUser.getBool('ativo')) {
        const perfilRec = $app.findFirstRecordByData(
          'perfis_acesso',
          'id',
          callerUser.getString('perfil_id'),
        )
        if (perfilRec && perfilRec.getBool('ativo')) {
          if (perfilRec.getBool('administrador')) {
            isAllowed = true
          } else {
            // checar permissoes modulo usuarios pode_criar
            const perms = $app.findRecordsByFilter(
              'permissoes',
              `perfil_id = '${perfilRec.id}' && modulo = 'usuarios' && pode_criar = true && ativo = true`,
              '',
              1,
              0,
            )
            if (perms && perms.length > 0) {
              isAllowed = true
            }
          }
        }
      }
    } catch (_) {}

    if (!isAllowed) {
      return e.json(403, { error: 'Acesso negado: permissão insuficiente para criar usuários.' })
    }

    const data = e.requestInfo().body || {}
    const email = (data.email || '').trim().toLowerCase()
    const password = (data.password || '').trim()
    const nome = (data.nome || '').trim()
    const perfil_id = data.perfil_id
    const cpf = data.cpf || ''
    const telefone = data.telefone || ''
    const empresa_padrao_id = data.empresa_padrao_id || null
    const desconto_maximo_percentual = Number(data.desconto_maximo_percentual) || 0
    const comissao_percentual = Number(data.comissao_percentual) || 0
    const e_vendedor = Boolean(data.e_vendedor)
    const e_caixa = Boolean(data.e_caixa)
    const empresas_ids = Array.isArray(data.empresas_ids) ? data.empresas_ids : []

    if (!email || !nome || !perfil_id) {
      return e.json(400, { error: 'Nome, e-mail e perfil são campos obrigatórios.' })
    }

    if (!password || password.length < 8) {
      return e.json(400, { error: 'A senha provisória deve ter pelo menos 8 caracteres.' })
    }

    const usersAuthCol = $app.findCollectionByNameOrId('_pb_users_auth_')
    const usuariosCol = $app.findCollectionByNameOrId('usuarios')
    const usuariosEmpresasCol = $app.findCollectionByNameOrId('usuarios_empresas')

    // Verificar se já existe login ou usuario com esse email
    let existingAuth = null
    try {
      existingAuth = $app.findAuthRecordByEmail('_pb_users_auth_', email)
    } catch (_) {}

    if (existingAuth) {
      return e.json(400, { error: 'Já existe um login com este e-mail no sistema.' })
    }

    let existingUsuario = null
    try {
      existingUsuario = $app.findFirstRecordByData('usuarios', 'email', email)
    } catch (_) {}

    if (existingUsuario) {
      return e.json(400, { error: 'Já existe um cadastro de usuário com este e-mail.' })
    }

    // Obter assinante do chamador para isolamento rigoroso
    let assinanteId = ''
    try {
      if (callerUser) {
        assinanteId = callerUser.getString('assinante_id')
      }
      if (!assinanteId && authRecord.getString) {
        assinanteId = authRecord.getString('assinante_id')
      }
    } catch (_) {}

    // Última tentativa: se o assinante não veio nem do cadastro nem do token,
    // resolver pelo e-mail (o id do token pode não existir no banco).
    if (!assinanteId && tokenEmail) {
      try {
        const porEmail = $app.findFirstRecordByData('usuarios', 'email', tokenEmail)
        if (porEmail) {
          assinanteId = porEmail.getString('assinante_id')
          if (assinanteId) callerUser = porEmail
        }
      } catch (_) {}
    }

    if (!assinanteId) {
      return e.json(401, {
        error: 'Sessão inválida ou expirada. Faça login novamente.',
      })
    }

    // Validar se o perfil pertence ao mesmo assinante
    try {
      const pAlvo = $app.findRecordById('perfis_acesso', perfil_id)
      if (!pAlvo || pAlvo.getString('assinante_id') !== assinanteId) {
        return e.json(403, {
          error: 'Operação rejeitada: o perfil selecionado pertence a outro assinante.',
        })
      }
    } catch (errP) {
      return e.json(400, { error: 'Perfil inválido ou não encontrado.' })
    }

    // Helper local (JSVM): verifica se a empresa informada pertence ao assinante
    // do chamador. Padrão igual ao dos demais hooks (empresasDoUsuario/exigirEmpresaDoUsuario
    // são declarados dentro de cada callback, nunca no topo do arquivo).
    function exigirEmpresaDoUsuarioLocal(auth, empresaId) {
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
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

      if (!usuarioRec && tokenEmail) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + tokenEmail + "'",
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
        throw new BadRequestError('Usuário ERP correspondente não encontrado.')
      }

      const assinanteLocal = usuarioRec.getString('assinante_id') || assinanteId
      if (!assinanteLocal) {
        throw new BadRequestError('Usuário autenticado sem vínculo com assinante.')
      }

      // Master/admin pode qualquer empresa do próprio assinante
      let ehMasterLocal = false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        ehMasterLocal = !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {}

      let isAdminLocal = false
      const perfilIdLocal = usuarioRec.getString('perfil_id')
      if (perfilIdLocal) {
        try {
          const perfilRec = $app.findRecordById('perfis_acesso', perfilIdLocal)
          if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
            isAdminLocal = true
          }
        } catch (_) {}
      }

      try {
        const emp = $app.findRecordById('empresas', empresaId)
        if (!emp || !emp.getBool('ativo')) {
          throw new BadRequestError('Empresa não encontrada ou inativa.')
        }
        if (emp.getString('assinante_id') !== assinanteLocal) {
          throw new ForbiddenError(
            'Operação rejeitada: a empresa selecionada pertence a outro assinante.',
          )
        }
        if (!ehMasterLocal && !isAdminLocal) {
          // Usuário comum: empresa deve estar entre as permitidas dele
          let permitida = emp.id === usuarioRec.getString('empresa_padrao_id')
          if (!permitida) {
            try {
              const vinculos = $app.findRecordsByFilter(
                'usuarios_empresas',
                "usuario_id = '" + usuarioRec.id + "' && ativo = true",
                '',
                500,
                0,
              )
              for (let v = 0; v < vinculos.length; v++) {
                if (vinculos[v].getString('empresa_id') === empresaId) {
                  permitida = true
                  break
                }
              }
            } catch (_) {}
          }
          if (!permitida) {
            throw new ForbiddenError('Operação rejeitada: empresa não permitida para este usuário.')
          }
        }
        return emp
      } catch (errEmp) {
        throw errEmp
      }
    }

    // Validar empresa padrão se informada
    if (empresa_padrao_id) {
      try {
        exigirEmpresaDoUsuarioLocal(authRecord, empresa_padrao_id)
      } catch (errE) {
        return e.json(403, {
          error: errE.message || 'Empresa padrão inválida ou não permitida para seu usuário.',
        })
      }
    }

    // Validar empresas_ids: nenhuma pode pertencer a outro assinante / empresa não permitida
    for (let i = 0; i < empresas_ids.length; i++) {
      const empId = empresas_ids[i]
      if (empId) {
        try {
          exigirEmpresaDoUsuarioLocal(authRecord, empId)
        } catch (errE) {
          return e.json(403, {
            error: `Operação rejeitada: ${errE.message || 'empresa não permitida'}`,
          })
        }
      }
    }

    // Checar se perfil alvo é admin para setar is_admin no users
    let isTargetAdmin = false
    try {
      const pAlvo = $app.findRecordById('perfis_acesso', perfil_id)
      if (pAlvo && pAlvo.getBool('administrador')) {
        isTargetAdmin = true
      }
    } catch (_) {}

    // Criar auth record (_pb_users_auth_) com assinante_id e is_admin e tipo='usuario'
    const authRec = new Record(usersAuthCol)
    authRec.setEmail(email)
    authRec.setPassword(password)
    authRec.setVerified(true)
    authRec.set('name', nome)
    authRec.set('tipo', 'usuario')
    authRec.set('assinante_id', assinanteId)
    authRec.set('is_admin', isTargetAdmin)
    $app.save(authRec)

    // Criar usuarios record
    const usuarioRec = new Record(usuariosCol)
    usuarioRec.set('ativo', true)
    usuarioRec.set('auth_user_id', authRec.id)
    usuarioRec.set('nome', nome)
    usuarioRec.set('email', email)
    usuarioRec.set('cpf', cpf)
    usuarioRec.set('telefone', telefone)
    usuarioRec.set('perfil_id', perfil_id)
    usuarioRec.set('assinante_id', assinanteId)
    if (empresa_padrao_id) {
      usuarioRec.set('empresa_padrao_id', empresa_padrao_id)
    }
    usuarioRec.set('desconto_maximo_percentual', desconto_maximo_percentual)
    usuarioRec.set('comissao_percentual', comissao_percentual)
    usuarioRec.set('e_vendedor', e_vendedor)
    usuarioRec.set('e_caixa', e_caixa)
    usuarioRec.set('created_by', authRecord.id)
    usuarioRec.set('updated_by', authRecord.id)
    $app.save(usuarioRec)

    // Vincular empresas permitidas
    for (let i = 0; i < empresas_ids.length; i++) {
      const empId = empresas_ids[i]
      if (empId) {
        const ueRec = new Record(usuariosEmpresasCol)
        ueRec.set('usuario_id', usuarioRec.id)
        ueRec.set('empresa_id', empId)
        ueRec.set('ativo', true)
        ueRec.set('created_by', authRecord.id)
        ueRec.set('updated_by', authRecord.id)
        $app.save(ueRec)
      }
    }

    return e.json(200, {
      success: true,
      usuario_id: usuarioRec.id,
      auth_user_id: authRec.id,
    })
  },
  $apis.requireAuth(),
)
