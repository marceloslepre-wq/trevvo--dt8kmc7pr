// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0062: Garantir preenchimento do assinante_id em empresas, usuarios e perfis_acesso
 */

migrate(
  (app) => {
    // 1. Obter assinante HOSPITAL HOME
    const assinantes = app.findRecordsByFilter(
      'assinantes',
      "origem = true || nome = 'HOSPITAL HOME'",
      '-created',
      1,
      0,
    )
    if (assinantes.length === 0) {
      console.warn('[0062] Assinante HOSPITAL HOME não encontrado.')
      return
    }

    const assinanteHomeId = assinantes[0].id
    console.log('[0062] Vinculando registros ao assinante HOSPITAL HOME:', assinanteHomeId)

    // 2. Preencher empresas
    const empresas = app.findRecordsByFilter('empresas', '', '', 500, 0)
    for (let i = 0; i < empresas.length; i++) {
      const emp = empresas[i]
      emp.set('assinante_id', assinanteHomeId)
      app.save(emp)
    }

    // 3. Preencher perfis_acesso
    const perfis = app.findRecordsByFilter('perfis_acesso', '', '', 500, 0)
    for (let i = 0; i < perfis.length; i++) {
      const p = perfis[i]
      p.set('assinante_id', assinanteHomeId)
      app.save(p)
    }

    // 4. Preencher usuarios
    const usuarios = app.findRecordsByFilter('usuarios', '', '', 500, 0)
    for (let i = 0; i < usuarios.length; i++) {
      const u = usuarios[i]
      u.set('assinante_id', assinanteHomeId)
      app.save(u)
    }

    // 5. Garantir users.tipo
    const users = app.findRecordsByFilter('_pb_users_auth_', '', '', 500, 0)
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      const email = user.getString('email')
      if (email === 'marceloslepre@gmail.com') {
        user.set('tipo', 'master')
        app.save(user)
      } else if (!user.getString('tipo')) {
        user.set('tipo', 'usuario')
        app.save(user)
      }
    }
  },
  (app) => {
    // Reversão
  },
)
