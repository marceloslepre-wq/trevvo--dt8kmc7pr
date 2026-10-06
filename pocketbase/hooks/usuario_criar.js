routerAdd(
  'POST',
  '/backend/v1/usuarios-admin/criar',
  (e) => {
    // 1. Verificar autenticação
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    // 2. Verificar se o chamador tem permissão de administrador ou pode_criar usuarios
    let isAllowed = false
    try {
      const callerUser = $app.findFirstRecordByData('usuarios', 'auth_user_id', authRecord.id)
      if (callerUser && callerUser.getBool('ativo')) {
        const callerPerfil = $app.findCollectionByNameOrId('perfis_acesso')
        const perfilRec = $app.findFirstRecordByData(
          'perfis_acesso',
          'id',
          callerUser.getString('perfil_id'),
        )
        if (perfilRec && (perfilRec.getBool('administrador') || callerPerfil)) {
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
    } catch (err) {
      // Se não encontrou usuario, mas o email for marceloslepre@gmail.com, permitir
      if (authRecord.email === 'marceloslepre@gmail.com') {
        isAllowed = true
      }
    }

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

    // Criar auth record
    const authRec = new Record(usersAuthCol)
    authRec.setEmail(email)
    authRec.setPassword(password)
    authRec.setVerified(true)
    authRec.set('name', nome)
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
