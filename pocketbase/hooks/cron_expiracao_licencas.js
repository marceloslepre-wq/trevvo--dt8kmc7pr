// reenvio 9.8r2
/// <reference path="../types.d.ts" />

/**
 * Trabalho agendado diário de expiração de licenças (Prompt 9.7b2 - Requisito 3)
 *
 * "Trabalho agendado diário: passa para Expirada as licenças Trial e Ativa com a expiração vencida
 * e grava o evento Expiração. O assinante de origem nunca expira."
 *
 * Agendado para rodar diariamente à meia-noite (0 0 * * *).
 */
// Remoção de segurança para limpar resíduo de teste anterior que possa ter persistido no agendador em runtime
try {
  cronRemove('teste97b_runner')
} catch (_) {}

cronAdd('expiracao_diaria_licencas', '0 0 * * *', () => {
  try {
    function registrarEventoLicencaLocal(app, dados) {
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

    function processarExpiracaoLicencasLocal(appInstance) {
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

          registrarEventoLicencaLocal(app, {
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
        console.error('[cron_expiracao_licencas] Erro ao processar expiração de licenças:', err)
        throw err
      }

      return {
        total_processadas: expiradas.length,
        expiradas: expiradas,
      }
    }

    const res = processarExpiracaoLicencasLocal($app)
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
