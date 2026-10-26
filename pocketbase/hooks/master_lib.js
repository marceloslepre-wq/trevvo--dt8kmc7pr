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

/**
 * Retorna o ID do assinante ativo em modo de suporte (impersonação) para um usuário master, se houver.
 * Retorna null se não houver impersonação ativa.
 * @param {string} userId
 * @param {any} [appInstance]
 * @returns {string|null}
 */
function obterAssinanteImpersonado(userId, appInstance) {
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

/**
 * Ativa o modo de suporte para o usuário master no assinante informado.
 * @param {string} userId
 * @param {string} assinanteId
 * @param {any} [appInstance]
 */
function definirAssinanteImpersonado(userId, assinanteId, appInstance) {
  const app = appInstance || $app
  if (!userId || !assinanteId) return

  try {
    const col = app.findCollectionByNameOrId('master_impersonacoes')
    let rec = null
    try {
      const recs = app.findRecordsByFilter(
        'master_impersonacoes',
        "user_id = '" + userId + "'",
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) {
        rec = recs[0]
      }
    } catch (_) {}

    if (!rec) {
      rec = new Record(col)
      rec.set('user_id', userId)
    }
    rec.set('assinante_id', assinanteId)
    app.save(rec)
  } catch (err) {
    console.error('[master_lib] Erro ao definir assinante impersonado:', err)
    throw err
  }
}

/**
 * Limpa a impersonação do usuário master, voltando para o assinante de origem.
 * @param {string} userId
 * @param {any} [appInstance]
 */
function limparAssinanteImpersonado(userId, appInstance) {
  const app = appInstance || $app
  if (!userId) return

  try {
    if (!app.hasTable('master_impersonacoes')) return
    const recs = app.findRecordsByFilter(
      'master_impersonacoes',
      "user_id = '" + userId + "'",
      '',
      10,
      0,
    )
    for (let i = 0; i < recs.length; i++) {
      app.delete(recs[i])
    }
  } catch (err) {
    console.error('[master_lib] Erro ao limpar impersonacao:', err)
  }
}

/**
 * Valida a situação da licença do assinante.
 * Bloqueia se Pausada, Expirada ou Cancelada, a menos que:
 * - O usuário autenticado seja Master;
 * - O assinante seja o assinante de origem (origem = true ou HH-RFR8HF).
 *
 * Lança ForbiddenError com a mensagem padrão: "Licença pausada ou vencida. Fale com o suporte."
 *
 * @param {any} assinanteRec
 * @param {any} authRecord
 */
function validarLicencaAtivaOuBloquear(assinanteRec, authRecord) {
  if (!assinanteRec) return

  // Assinante de origem NUNCA é bloqueado
  if (assinanteRec.getBool('origem') || assinanteRec.getString('numero_licenca') === 'HH-RFR8HF') {
    return
  }

  // O master NUNCA é bloqueado
  if (authRecord && checarSeMaster(authRecord)) {
    return
  }

  const status = assinanteRec.getString('status')
  if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
    throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
  }
}

/**
 * Executa a rotina diária de expiração:
 * Passa para 'Expirada' as licenças 'Trial' e 'Ativa' cuja data_expiracao seja anterior ao dia de hoje (YYYY-MM-DD).
 * Grava o evento 'Expiração' em licencas_eventos.
 * O assinante de origem NUNCA expira.
 *
 * @param {any} [appInstance]
 * @returns {{ total_processadas: number, expiradas: Array<{ id: string, nome: string, licenca: string }> }}
 */
function processarExpiracaoLicencas(appInstance) {
  const app = appInstance || $app
  const hojeStr = new Date().toISOString().slice(0, 10)
  const expiradas = []

  try {
    const assinantes = app.findRecordsByFilter(
      'assinantes',
      "(status = 'Trial' || status = 'Ativa') && data_expiracao != '' && data_expiracao < '" +
        hojeStr +
        "'",
      'created',
      500,
      0,
    )

    for (let i = 0; i < assinantes.length; i++) {
      const ass = assinantes[i]
      // Assinante de origem nunca expira
      if (ass.getBool('origem') || ass.getString('numero_licenca') === 'HH-RFR8HF') {
        continue
      }

      const statusAntes = ass.getString('status')
      const expData = ass.getString('data_expiracao')
      ass.set('status', 'Expirada')
      app.save(ass)

      registrarEventoLicenca(app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Expiração',
        plano_id: ass.getString('plano_id'),
        validade_ate: expData,
        descricao: `Licença expirada automaticamente pelo trabalho agendado. Status anterior: ${statusAntes} -> Expirada. Vencimento: ${expData}.`,
        criado_por: '',
      })

      expiradas.push({
        id: ass.id,
        nome: ass.getString('nome'),
        licenca: ass.getString('numero_licenca'),
      })
    }
  } catch (err) {
    console.error('[master_lib] Erro ao processar expiração de licenças:', err)
    throw err
  }

  return {
    total_processadas: expiradas.length,
    expiradas: expiradas,
  }
}

module.exports = {
  exigirMaster: exigirMaster,
  checarSeMaster: checarSeMaster,
  obterConfigMaster: obterConfigMaster,
  registrarEventoLicenca: registrarEventoLicenca,
  obterAssinanteImpersonado: obterAssinanteImpersonado,
  definirAssinanteImpersonado: definirAssinanteImpersonado,
  limparAssinanteImpersonado: limparAssinanteImpersonado,
  validarLicencaAtivaOuBloquear: validarLicencaAtivaOuBloquear,
  processarExpiracaoLicencas: processarExpiracaoLicencas,
}
