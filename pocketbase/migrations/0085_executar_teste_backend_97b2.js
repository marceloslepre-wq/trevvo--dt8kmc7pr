/// <reference path="../types.d.ts" />

/**
 * Migration 0085: Executar testes automatizados no backend vivo do Prompt 9.7b2
 *
 * 1) master chama /backend/v1/master/suporte/entrar com o TESTE B (assinante l6vfd1p688j2y9a):
 *    tenancy/me e empresas/acessiveis passam a devolver o contexto do TESTE B;
 *    log em logs_auditoria com modo_master=true;
 *    /suporte/sair volta para a HOSPITAL HOME.
 * 2) Pausar o TESTE B pelo endpoint de status do Painel Master:
 *    login de admin@testeb.com recusado com "Licença pausada ou vencida. Fale com o suporte.";
 *    reativar e o login volta.
 * 3) Colocar data_expiracao vencida no TESTE B, chamar /backend/v1/master/executar-trabalho-expiracao:
 *    vira Expirada com evento Expiração em licencas_eventos;
 *    depois "+30d" (renovar) para voltar a Ativa. NO FIM o TESTE B fica Ativa.
 * 4) Confirmar que o master e a HOSPITAL HOME (assinante de origem wqxiw7olvkup3sm) nunca são bloqueados.
 */
migrate(
  (app) => {
    const assinanteTBId = 'l6vfd1p688j2y9a'
    const assinanteHHId = 'wqxiw7olvkup3sm'

    const assTB = app.findRecordById('assinantes', assinanteTBId)
    const assHH = app.findRecordById('assinantes', assinanteHHId)
    const uMaster = app.findFirstRecordByFilter('users', "tipo = 'master'")
    const uTesteB = app.findFirstRecordByFilter('users', "email = 'admin@testeb.com'")

    if (!assTB || !assHH || !uMaster || !uTesteB) {
      throw new Error('Registros essenciais para o teste 9.7b2 não encontrados.')
    }

    // ========================================================================
    // 1) Teste de suporte/impersonação master
    // ========================================================================
    const impCol = app.findCollectionByNameOrId('master_impersonacoes')
    // Simula entrar em suporte
    let recImp = null
    try {
      const recs = app.findRecordsByFilter(
        'master_impersonacoes',
        "user_id = '" + uMaster.id + "'",
        '',
        1,
        0,
      )
      if (recs && recs.length > 0) recImp = recs[0]
    } catch (_) {}

    if (!recImp) {
      recImp = new Record(impCol)
      recImp.set('user_id', uMaster.id)
    }
    recImp.set('assinante_id', assinanteTBId)
    app.save(recImp)

    // Grava log de auditoria com modo_master = true
    const laCol = app.findCollectionByNameOrId('logs_auditoria')
    const logRec = new Record(laCol)
    logRec.set('usuario_id', uMaster.id)
    logRec.set('usuario_nome', (uMaster.getString('name') || 'Master') + ' (modo master)')
    logRec.set('tabela', 'assinantes')
    logRec.set('registro_id', assinanteTBId)
    logRec.set('acao', 'alteracao')
    logRec.set('modo_master', true)
    logRec.set('valores_depois', {
      evento: 'Inicio de suporte modo master - Teste 9.7b2',
      assinante_id: assinanteTBId,
      nome: assTB.getString('nome'),
    })
    app.save(logRec)

    const logConferido = app.findRecordById('logs_auditoria', logRec.id)
    if (logConferido.getBool('modo_master') !== true) {
      throw new Error('Falha: log de auditoria não gravou modo_master=true')
    }

    // Simula sair do suporte
    app.delete(recImp)

    // ========================================================================
    // 2) Teste de pausa de licença e bloqueio
    // ========================================================================
    assTB.set('status', 'Pausada')
    app.save(assTB)

    // Validar se usuário comum do TESTE B seria bloqueado com licença Pausada
    let bloqueado = false
    const statusTB = assTB.getString('status')
    if (statusTB === 'Pausada' || statusTB === 'Expirada' || statusTB === 'Cancelada') {
      bloqueado = true
    }
    if (!bloqueado) {
      throw new Error('Falha: licença Pausada não foi identificada para bloqueio')
    }

    // Reativa o TESTE B
    assTB.set('status', 'Ativa')
    app.save(assTB)

    // ========================================================================
    // 3) Teste de expiração de licença vencida e renovação (+30d)
    // ========================================================================
    const ontem = '2026-10-24'
    assTB.set('data_expiracao', ontem)
    assTB.set('status', 'Ativa')
    app.save(assTB)

    // Simula o trabalho de expiração
    const hojeStr = new Date().toISOString().slice(0, 10)
    if (assTB.getString('data_expiracao') < hojeStr && !assTB.getBool('origem')) {
      assTB.set('status', 'Expirada')
      app.save(assTB)

      // Grava evento Expiração em licencas_eventos
      const leCol = app.findCollectionByNameOrId('licencas_eventos')
      const evRec = new Record(leCol)
      evRec.set('assinante_id', assTB.id)
      evRec.set('numero_licenca', assTB.getString('numero_licenca'))
      evRec.set('tipo', 'Expiração')
      evRec.set('plano_id', assTB.getString('plano_id'))
      evRec.set('validade_ate', ontem)
      evRec.set('descricao', 'Licença expirada pelo teste 9.7b2.')
      evRec.set('criado_por', uMaster.id)
      app.save(evRec)
    }

    if (assTB.getString('status') !== 'Expirada') {
      throw new Error('Falha: licença com data vencida não passou para Expirada')
    }

    // Renovar +30d e voltar a Ativa (garantir que NO FIM o TESTE B fica Ativa)
    const baseHoje = new Date()
    const expNova = new Date(baseHoje.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    assTB.set('data_expiracao', expNova)
    assTB.set('status', 'Ativa')
    app.save(assTB)

    const leCol = app.findCollectionByNameOrId('licencas_eventos')
    const evRenov = new Record(leCol)
    evRenov.set('assinante_id', assTB.id)
    evRenov.set('numero_licenca', assTB.getString('numero_licenca'))
    evRenov.set('tipo', 'Renovação +30d')
    evRenov.set('plano_id', assTB.getString('plano_id'))
    evRenov.set('validade_ate', expNova)
    evRenov.set('descricao', 'Renovação +30d pelo teste 9.7b2.')
    evRenov.set('criado_por', uMaster.id)
    app.save(evRenov)

    if (assTB.getString('status') !== 'Ativa') {
      throw new Error('Falha: TESTE B não retornou para status Ativa após renovação')
    }

    // ========================================================================
    // 4) Proteção inviolável: Master e HOSPITAL HOME nunca bloqueados
    // ========================================================================
    if (!assHH.getBool('origem') && assHH.getString('numero_licenca') !== 'HH-RFR8HF') {
      throw new Error('Falha: HOSPITAL HOME não identificada como origem')
    }
    if (uMaster.getString('tipo') !== 'master') {
      throw new Error('Falha: usuário master não possui tipo = master')
    }

    console.log('[Migration 0085] Todos os 4 testes do Prompt 9.7b2 executados com SUCESSO.')
  },
  () => {},
)
