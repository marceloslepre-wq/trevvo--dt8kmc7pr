/// <reference path="../types.d.ts" />

/**
 * Trabalho agendado diário de expiração de licenças (Prompt 9.7b2 - Requisito 3)
 *
 * "Trabalho agendado diário: passa para Expirada as licenças Trial e Ativa com a expiração vencida
 * e grava o evento Expiração. O assinante de origem nunca expira."
 *
 * Agendado para rodar diariamente à meia-noite (0 0 * * *).
 */
cronAdd('expiracao_diaria_licencas', '0 0 * * *', () => {
  try {
    const masterLib = require(`${__hooks}/master_lib.js`)
    const res = masterLib.processarExpiracaoLicencas($app)
    console.log(
      `[CRON: expiracao_diaria_licencas] Processamento concluído. Total expiradas: ${res.total_processadas}`,
    )
  } catch (err) {
    console.error(
      '[CRON: expiracao_diaria_licencas] Erro ao executar processamento de expiração:',
      err,
    )
  }
})
