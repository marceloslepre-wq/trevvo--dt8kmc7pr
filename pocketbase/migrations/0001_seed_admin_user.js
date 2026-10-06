migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Idempotente: pular se o usuário já existir
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'marceloslepre@gmail.com')
      return // Já semeado
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('marceloslepre@gmail.com')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Marcelo Lepre')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'marceloslepre@gmail.com')
      app.delete(record)
    } catch (_) {}
  },
)
