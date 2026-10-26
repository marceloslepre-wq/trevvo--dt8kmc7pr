/// <reference path="../types.d.ts" />

/**
 * Hook de autenticação: Bloqueio de login por licença Pausada, Expirada ou Cancelada
 * (Prompt 9.7b2 - Requisito 2).
 *
 * "Bloqueio: licença Pausada, Expirada ou Cancelada não usa o ERP.
 * O login e os endpoints conferem a situação do assinante, e o usuário vê
 * 'Licença pausada ou vencida. Fale com o suporte.'
 * O master não é bloqueado. O assinante de origem nunca é bloqueado."
 *
 * onRecordAuthWithPasswordRequest intercepta antes ou durante a autenticação de auth collections (users).
 */
onRecordAuthWithPasswordRequest((e) => {
  const record = e.record
  if (!record) {
    return e.next()
  }

  // O master NUNCA é bloqueado
  try {
    if (record.getString('tipo') === 'master') {
      return e.next()
    }
  } catch (_) {}

  // Buscar assinante vinculado ao usuário
  let assinanteId = ''
  try {
    assinanteId = record.getString('assinante_id')
  } catch (_) {}

  if (!assinanteId) {
    // Tentar localizar pelo registro na coleção usuarios
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + record.id + "' || email = '" + record.getString('email') + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        assinanteId = uRecs[0].getString('assinante_id')
      }
    } catch (_) {}
  }

  if (assinanteId) {
    try {
      const assinante = $app.findRecordById('assinantes', assinanteId)
      if (assinante) {
        const masterLib = require(`${__hooks}/master_lib.js`)
        masterLib.validarLicencaAtivaOuBloquear(assinante, record)
      }
    } catch (errBloq) {
      throw new ForbiddenError(errBloq.message || 'Licença pausada ou vencida. Fale com o suporte.')
    }
  }

  return e.next()
}, 'users')
