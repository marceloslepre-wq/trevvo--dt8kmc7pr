/// <reference path="../types.d.ts" />

/**
 * Módulo compartilhado master_lib.js (Etapa 9 Multi-tenant - Prompt 9.7a)
 *
 * Funções auxiliares para o ecossistema do Painel Master.
 * NÃO registra hooks nem rotas — apenas exporta funções via module.exports.
 * Deve ser importado com require(`${__hooks}/master_lib.js`) DENTRO dos callbacks onde for utilizado.
 */

/**
 * Valida estritamente se a requisição provém de um usuário 'master'.
 * Lança ForbiddenError (HTTP 403) caso contrário.
 *
 * @param {any} auth
 * @param {any} [appInstance]
 * @returns {models.Record}
 */
function exigirMaster(auth, appInstance) {
  const app = appInstance || $app
  if (!auth || !auth.id) {
    throw new ForbiddenError('Acesso restrito ao administrador Master do sistema.')
  }

  let userRec = null
  try {
    userRec = app.findRecordById('_pb_users_auth_', auth.id)
  } catch (_) {
    throw new ForbiddenError('Usuário não localizado para verificação de privilégios.')
  }

  if (!userRec || userRec.getString('tipo') !== 'master') {
    throw new ForbiddenError(
      'Acesso negado. Apenas o usuário Master tem permissão para esta operação.',
    )
  }

  return userRec
}

/**
 * Retorna se o usuário é master sem disparar erro.
 * @param {any} auth
 * @param {any} [appInstance]
 * @returns {boolean}
 */
function checarSeMaster(auth, appInstance) {
  const app = appInstance || $app
  if (!auth || !auth.id) return false
  try {
    const userRec = app.findRecordById('_pb_users_auth_', auth.id)
    return !!(userRec && userRec.getString('tipo') === 'master')
  } catch (_) {
    return false
  }
}

/**
 * Obtém as configurações do painel master (registro único de config_master)
 * @param {any} [appInstance]
 * @returns {{ dias_trial: number }}
 */
function obterConfigMaster(appInstance) {
  const app = appInstance || $app
  try {
    const configs = app.findRecordsByFilter('config_master', '', '-created', 1, 0)
    if (configs && configs.length > 0) {
      return {
        id: configs[0].id,
        dias_trial: configs[0].getInt('dias_trial') || 15,
      }
    }
  } catch (_) {}
  return { id: '', dias_trial: 15 }
}

/**
 * Registra um evento de ciclo de vida em licencas_eventos.
 * @param {any} app
 * @param {{
 *   assinante_id: string,
 *   numero_licenca: string,
 *   tipo: string,
 *   plano_id?: string,
 *   validade_ate?: string,
 *   descricao?: string,
 *   criado_por?: string
 * }} dados
 */
function registrarEventoLicenca(app, dados) {
  try {
    const col = app.findCollectionByNameOrId('licencas_eventos')
    const rec = new Record(col)
    rec.set('assinante_id', dados.assinante_id)
    rec.set('numero_licenca', dados.numero_licenca)
    rec.set('tipo', dados.tipo)
    if (dados.plano_id) rec.set('plano_id', dados.plano_id)
    if (dados.validade_ate !== undefined) rec.set('validade_ate', dados.validade_ate || '')
    if (dados.descricao) rec.set('descricao', dados.descricao)
    if (dados.criado_por) rec.set('criado_por', dados.criado_por)
    app.save(rec)
    return rec
  } catch (err) {
    console.error('Erro ao registrar evento de licenca:', err)
    return null
  }
}

module.exports = {
  exigirMaster: exigirMaster,
  checarSeMaster: checarSeMaster,
  obterConfigMaster: obterConfigMaster,
  registrarEventoLicenca: registrarEventoLicenca,
}
