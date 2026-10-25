onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  // Se o campo 'ativo' mudou de true para false, ou se ativo é false
  const ativoAtual = record.getBool('ativo')
  const originalAtivo = record.original().getBool('ativo')

  // Se foi inativado
  if (originalAtivo === true && ativoAtual === false) {
    const authId = record.getString('auth_user_id')
    const email = record.getString('email')
    let authRec = null

    if (authId) {
      try {
        authRec = $app.findFirstRecordByData('_pb_users_auth_', 'id', authId)
      } catch (_) {}
    }

    if (!authRec && email) {
      try {
        authRec = $app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {}
    }

    if (authRec) {
      // Bloquear login: altera a senha para um hash imprevisível ou random
      const randomPassword = $security.randomString(32) + '!Aa1'
      authRec.setPassword(randomPassword)
      $app.save(authRec)
    }
  }

  // Se o usuário foi reativado (original = false, atual = true), garantir que o authRecord continue associado
  if (originalAtivo === false && ativoAtual === true) {
    // Mantém íntegro
  }

  return e.next()
}, 'usuarios')
