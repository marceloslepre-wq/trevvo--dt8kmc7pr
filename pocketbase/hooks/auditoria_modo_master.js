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
    try {
      const masterLib = require(`${__hooks}/master_lib.js`)
      if (masterLib.checarSeMaster(auth, $app)) {
        const impId = masterLib.obterAssinanteImpersonado(auth.id, $app)
        if (impId) {
          record.set('modo_master', true)
        }
      }
    } catch (_) {}
  }

  return e.next()
}, 'logs_auditoria')
