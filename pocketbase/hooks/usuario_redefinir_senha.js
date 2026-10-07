routerAdd(
  'POST',
  '/backend/v1/usuarios-admin/redefinir-senha',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    // Checar admin exclusivamente pelo perfil do registro em usuarios ligado ao login
    let isAllowed = false
    try {
      let callerUser = null
      try {
        callerUser = $app.findFirstRecordByData('usuarios', 'auth_user_id', authRecord.id)
      } catch (_) {
        if (authRecord.email) {
          callerUser = $app.findFirstRecordByData('usuarios', 'email', authRecord.email)
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
            const perms = $app.findRecordsByFilter(
              'permissoes',
              `perfil_id = '${perfilRec.id}' && modulo = 'usuarios' && pode_editar = true && ativo = true`,
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
      return e.json(403, { error: 'Acesso negado: permissão insuficiente para redefinir senha.' })
    }

    const data = e.requestInfo().body || {}
    const usuario_id = data.usuario_id
    const nova_senha = (data.nova_senha || '').trim()

    if (!usuario_id || !nova_senha || nova_senha.length < 8) {
      return e.json(400, { error: 'Usuário e nova senha (mínimo 8 caracteres) são obrigatórios.' })
    }

    let usuarioRec
    try {
      usuarioRec = $app.findFirstRecordByData('usuarios', 'id', usuario_id)
    } catch (_) {
      return e.json(404, { error: 'Usuário não encontrado.' })
    }

    let authRec = null
    const authId = usuarioRec.getString('auth_user_id')
    if (authId) {
      try {
        authRec = $app.findFirstRecordByData('_pb_users_auth_', 'id', authId)
      } catch (_) {}
    }

    if (!authRec) {
      // Buscar por email
      try {
        authRec = $app.findAuthRecordByEmail('_pb_users_auth_', usuarioRec.getString('email'))
      } catch (_) {}
    }

    if (!authRec) {
      return e.json(404, { error: 'Conta de login do usuário não encontrada no Skip Cloud.' })
    }

    authRec.setPassword(nova_senha)
    $app.save(authRec)

    return e.json(200, { success: true, message: 'Senha redefinida com sucesso.' })
  },
  $apis.requireAuth(),
)
