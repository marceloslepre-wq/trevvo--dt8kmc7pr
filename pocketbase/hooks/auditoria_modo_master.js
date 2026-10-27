// reenvio 9.8r2
/// <reference path="../types.d.ts" />

/**
 * Hook para auditar ações em modo master e marcar `modo_master = true` em logs_auditoria.
 * (Prompt 9.7b2 - Requisito 1: "Tudo o que o master fizer lá é gravado em logs_auditoria com a marca 'modo master'")
 */
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  // Se já veio marcado, respeita
  if (record.getBool('modo_master')) {
    return e.next()
  }

  // Verificar se o usuário autenticado é master em modo impersonado
  const auth = e.auth || e.get('authRecord')
  if (auth && auth.id) {
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

    try {
      if (checarSeMasterLocal(auth, $app)) {
        const impId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impId) {
          record.set('modo_master', true)
        }
      }
    } catch (_) {}
  }

  return e.next()
}, 'logs_auditoria')
