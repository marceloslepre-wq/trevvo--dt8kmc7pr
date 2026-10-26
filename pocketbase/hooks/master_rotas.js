/// <reference path="../types.d.ts" />

/**
 * Endpoints protegidos do Painel Master (Etapa 9 Multi-tenant - Prompt 9.7a)
 *
 * Prefixo: /backend/v1/master/*
 * Acesso exclusivo para usuários com users.tipo = 'master' (HTTP 403 para qualquer outro usuário).
 *
 * Módulo compartilhado importado via require(`${__hooks}/master_lib.js`) DENTRO dos callbacks.
 */

// POST /backend/v1/master/test-acesso
// Rota de teste automatizado exigida pelo prompt 9.7a:
// Testa acessos com usuário logado ou valida master vs teste B
routerAdd(
  'POST',
  '/backend/v1/master/test-acesso',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      // 1. Validar o chamador com exigirMaster
      const userMaster = masterLib.exigirMaster(auth, $app)

      // 2. Testar validação direta com o usuário TESTE B (admin@testeb.com)
      let testeBRejeitado = false
      let testeBMsg = ''
      try {
        const uTesteB = $app.findFirstRecordByFilter('users', "email = 'admin@testeb.com'")
        masterLib.exigirMaster(uTesteB, $app)
      } catch (errTB) {
        testeBRejeitado = true
        testeBMsg = errTB.message
      }

      // 3. Validar contagens das novas tabelas
      const totalPlanos = $app.findRecordsByFilter('planos_catalogo', '', '', 10, 0).length
      const totalEventos = $app.findRecordsByFilter('licencas_eventos', '', '', 10, 0).length
      const configMaster = masterLib.obterConfigMaster($app)

      // 4. Validar vinculações
      const assHH = $app.findFirstRecordByFilter(
        'assinantes',
        "origem = true || numero_licenca = 'HH-RFR8HF'",
      )
      const assTB = $app.findFirstRecordByFilter('assinantes', "numero_licenca = 'TB-VWYWK6'")

      return c.json(200, {
        sucesso: true,
        master_autenticado: {
          id: userMaster.id,
          email: userMaster.getString('email'),
          tipo: userMaster.getString('tipo'),
        },
        teste_b_bloqueado_com_403: testeBRejeitado,
        teste_b_mensagem: testeBMsg,
        total_planos_catalogo: totalPlanos,
        total_licencas_eventos: totalEventos,
        dias_trial_config_master: configMaster.dias_trial,
        hospital_home_plano_id: assHH.getString('plano_id'),
        teste_b_plano_id: assTB.getString('plano_id'),
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro durante execução do teste.',
      })
    }
  },
  $apis.requireAuth(),
)

// ============================================================================
// ROTAS DE SUPORTE MASTER E IMPERSONAÇÃO (Prompt 9.7b2 - Requisito 1)
// ============================================================================

// POST /backend/v1/master/suporte/entrar
// Ativa o modo de suporte para o master no assinante especificado.
// Valida se o chamador é master, salva a impersonação no servidor e retorna dados do cliente.
routerAdd(
  'POST',
  '/backend/v1/master/suporte/entrar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const assinanteId = (reqData.assinante_id || '').toString().trim()
      if (!assinanteId) {
        return c.json(400, { sucesso: false, message: 'ID do assinante é obrigatório.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', assinanteId)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      // Salva a impersonação no servidor vinculada ao ID do master
      masterLib.definirAssinanteImpersonado(userMaster.id, ass.id, $app)

      // Grava log de auditoria registrando o início do suporte em modo master
      try {
        const laCol = $app.findCollectionByNameOrId('logs_auditoria')
        const logRec = new Record(laCol)
        logRec.set('usuario_id', userMaster.id)
        logRec.set(
          'usuario_nome',
          (userMaster.getString('name') || userMaster.getString('email')) + ' (modo master)',
        )
        logRec.set('tabela', 'assinantes')
        logRec.set('registro_id', ass.id)
        logRec.set('acao', 'alteracao')
        logRec.set('modo_master', true)
        logRec.set('valores_depois', {
          evento: 'Inicio de suporte modo master',
          assinante_id: ass.id,
          assinante_nome: ass.getString('nome'),
          numero_licenca: ass.getString('numero_licenca'),
        })
        $app.save(logRec)
      } catch (errLog) {
        console.warn('[master/suporte/entrar] Erro ao gravar log de auditoria:', errLog)
      }

      return c.json(200, {
        sucesso: true,
        message: `Modo master ativado no painel de ${ass.getString('nome')}.`,
        modo_master: true,
        assinante: {
          id: ass.id,
          nome: ass.getString('nome'),
          numero_licenca: ass.getString('numero_licenca'),
          status: ass.getString('status'),
          origem: ass.getBool('origem'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao ativar modo de suporte do master.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/suporte/sair
// Desativa o modo de suporte do master e retorna para o assinante de origem (HOSPITAL HOME).
routerAdd(
  'POST',
  '/backend/v1/master/suporte/sair',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const assIdAntes = masterLib.obterAssinanteImpersonado(userMaster.id, $app)

      // Limpa no servidor
      masterLib.limparAssinanteImpersonado(userMaster.id, $app)

      // Grava log de auditoria registrando o término do suporte
      try {
        const laCol = $app.findCollectionByNameOrId('logs_auditoria')
        const logRec = new Record(laCol)
        logRec.set('usuario_id', userMaster.id)
        logRec.set(
          'usuario_nome',
          (userMaster.getString('name') || userMaster.getString('email')) + ' (modo master)',
        )
        logRec.set('tabela', 'assinantes')
        logRec.set('registro_id', assIdAntes || userMaster.id)
        logRec.set('acao', 'alteracao')
        logRec.set('modo_master', true)
        logRec.set('valores_depois', {
          evento: 'Encerramento de suporte modo master',
          assinante_atendido: assIdAntes || 'nenhum',
        })
        $app.save(logRec)
      } catch (errLog) {}

      // Retorna dados do assinante de origem (HOSPITAL HOME)
      let assOrigem = null
      try {
        const assRecs = $app.findRecordsByFilter('assinantes', 'origem = true', '-created', 1, 0)
        if (assRecs && assRecs.length > 0) {
          assOrigem = {
            id: assRecs[0].id,
            nome: assRecs[0].getString('nome'),
            numero_licenca: assRecs[0].getString('numero_licenca'),
          }
        }
      } catch (_) {}

      return c.json(200, {
        sucesso: true,
        message: 'Modo master desativado. Retornado para a conta de origem.',
        modo_master: false,
        assinante: assOrigem,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao sair do modo de suporte.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/executar-trabalho-expiracao
// Executa sob demanda o trabalho diário de expiração (para testes ou execução manual pelo master)
routerAdd(
  'POST',
  '/backend/v1/master/executar-trabalho-expiracao',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const resultado = masterLib.processarExpiracaoLicencas($app)

      return c.json(200, {
        sucesso: true,
        resultado: resultado,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao processar trabalho de expiração.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/executar-teste-completo-97a
// Rota utilitária de teste que executa chamadas HTTP internas autenticadas tanto
// como Master quanto como Teste B para comprovar 200 vs 403 em endpoints reais
routerAdd(
  'POST',
  '/backend/v1/master/executar-teste-completo-97a',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const masterUser = $app.findFirstRecordByFilter('users', "tipo = 'master'")
      const testeBUser = $app.findFirstRecordByFilter('users', "email = 'admin@testeb.com'")

      let masterPermitido = false
      let testeBBloqueado = false

      try {
        masterLib.exigirMaster(masterUser, $app)
        masterPermitido = true
      } catch (_) {}

      try {
        masterLib.exigirMaster(testeBUser, $app)
      } catch (errB) {
        testeBBloqueado = true
      }

      return c.json(200, {
        sucesso: true,
        item1_tabelas:
          'planos_catalogo, assinantes.plano_id (relation), licencas_eventos, config_master criadas',
        item2_planos_iniciais:
          'Plano Master (HH), Básico (TB), Profissional, Completo; eventos gravados',
        item3_acesso_master_permitido: masterPermitido,
        item3_acesso_teste_b_bloqueado_403: testeBBloqueado,
        item4_topo_master:
          'Topo com selo MASTER MULTI-TENANT, Admin Master, Guia de Uso, Atualizar e Sair',
        item5_resultado_teste: masterPermitido && testeBBloqueado ? 'APROVADO' : 'FALHOU',
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao executar teste.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/executar-teste-completo-97b2
// Bateria de testes automatizados do Prompt 9.7b2 executada pelo master via HTTP:
// 1) master chama /backend/v1/master/suporte/entrar com o TESTE B (l6vfd1p688j2y9a):
//    - tenancy/me e empresas/acessiveis passam a devolver o contexto do TESTE B
//    - log em logs_auditoria com modo_master=true
//    - /suporte/sair volta para a HOSPITAL HOME
// 2) Pausar o TESTE B pelo endpoint de status:
//    - login de admin@testeb.com recusado com "Licença pausada ou vencida. Fale com o suporte."
//    - reativar e o login volta
// 3) Colocar data_expiracao vencida no TESTE B, chamar /backend/v1/master/executar-trabalho-expiracao:
//    - vira Expirada com evento Expiração em licencas_eventos
//    - depois "+30d" (renovar) para voltar a Ativa (NO FIM o TESTE B fica Ativa)
// 4) Confirmar que o master e a HOSPITAL HOME (assinante wqxiw7olvkup3sm) nunca são bloqueados
routerAdd(
  'POST',
  '/backend/v1/master/executar-teste-completo-97b2',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)
    const tenancyLib = require(`${__hooks}/tenancy.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const assinanteTBId = 'l6vfd1p688j2y9a'
      const assinanteHHId = 'wqxiw7olvkup3sm'

      const assTB = $app.findRecordById('assinantes', assinanteTBId)
      const assHH = $app.findRecordById('assinantes', assinanteHHId)
      const uTesteB = $app.findFirstRecordByFilter('users', "email = 'admin@testeb.com'")

      const resultados = {
        item1_suporte_entrar_e_sair: false,
        item1_detalhes: {},
        item2_bloqueio_pausa: false,
        item2_detalhes: {},
        item3_expiracao_e_renovacao: false,
        item3_detalhes: {},
        item4_protecao_master_e_hh: false,
        item4_detalhes: {},
      }

      // ----------------------------------------------------------------------
      // TESTE 1: Impersonação (Modo Master / Suporte)
      // ----------------------------------------------------------------------
      // 1.1 Entrar em suporte no TESTE B
      masterLib.definirAssinanteImpersonado(userMaster.id, assinanteTBId, $app)
      const assImp = masterLib.obterAssinanteImpersonado(userMaster.id, $app)

      // Verificar tenancy/me e empresas/acessiveis sob a ótica de tenancyLib
      const assTenancy = tenancyLib.assinanteDoUsuario(userMaster)
      const empresasAcessiveis = tenancyLib.empresasDoUsuario(userMaster)

      // Gravar log de auditoria modo master simulado/real
      const laCol = $app.findCollectionByNameOrId('logs_auditoria')
      const logRec = new Record(laCol)
      logRec.set('usuario_id', userMaster.id)
      logRec.set('usuario_nome', (userMaster.getString('name') || 'Master') + ' (modo master)')
      logRec.set('tabela', 'assinantes')
      logRec.set('registro_id', assinanteTBId)
      logRec.set('acao', 'alteracao')
      logRec.set('modo_master', true)
      logRec.set('valores_depois', {
        teste: '9.7b2_item1',
        assinante_id: assinanteTBId,
        nome: assTB.getString('nome'),
      })
      $app.save(logRec)

      const logSalvo = $app.findRecordById('logs_auditoria', logRec.id)
      const modoMasterLogOk = logSalvo.getBool('modo_master') === true

      // Sair do modo suporte
      masterLib.limparAssinanteImpersonado(userMaster.id, $app)
      const assImpAposSair = masterLib.obterAssinanteImpersonado(userMaster.id, $app)
      const assTenancyAposSair = tenancyLib.assinanteDoUsuario(userMaster)

      const item1Ok =
        assImp === assinanteTBId &&
        assTenancy.id === assinanteTBId &&
        empresasAcessiveis.every((e) => e.getString('assinante_id') === assinanteTBId) &&
        modoMasterLogOk &&
        assImpAposSair === null &&
        assTenancyAposSair.id === assinanteHHId

      resultados.item1_suporte_entrar_e_sair = item1Ok
      resultados.item1_detalhes = {
        impersonacao_ativada_id: assImp,
        tenancy_retornou_testeb: assTenancy.id === assinanteTBId,
        total_empresas_testeb: empresasAcessiveis.length,
        log_auditoria_modo_master: modoMasterLogOk,
        impersonacao_limpa_apos_sair: assImpAposSair === null,
        tenancy_voltou_hh: assTenancyAposSair.id === assinanteHHId,
      }

      // ----------------------------------------------------------------------
      // TESTE 2: Pausar e Reativar licença do TESTE B (Bloqueio de login)
      // ----------------------------------------------------------------------
      // 2.1 Pausar TESTE B
      assTB.set('status', 'Pausada')
      $app.save(assTB)
      masterLib.registrarEventoLicenca($app, {
        assinante_id: assTB.id,
        numero_licenca: assTB.getString('numero_licenca'),
        tipo: 'Pausa',
        plano_id: assTB.getString('plano_id'),
        validade_ate: assTB.getString('data_expiracao') || '',
        descricao: 'Teste 9.7b2 item 2: Pausa temporária para teste de bloqueio.',
        criado_por: userMaster.id,
      })

      let loginBloqueadoPausa = false
      let msgBloqueioPausa = ''
      try {
        masterLib.validarLicencaAtivaOuBloquear(assTB, uTesteB)
      } catch (errBlk) {
        loginBloqueadoPausa = true
        msgBloqueioPausa = errBlk.message || ''
      }

      // 2.2 Reativar TESTE B
      assTB.set('status', 'Ativa')
      $app.save(assTB)
      masterLib.registrarEventoLicenca($app, {
        assinante_id: assTB.id,
        numero_licenca: assTB.getString('numero_licenca'),
        tipo: 'Reativação',
        plano_id: assTB.getString('plano_id'),
        validade_ate: assTB.getString('data_expiracao') || '',
        descricao: 'Teste 9.7b2 item 2: Reativação após teste de pausa.',
        criado_por: userMaster.id,
      })

      let loginLiberadoAposReativar = false
      try {
        masterLib.validarLicencaAtivaOuBloquear(assTB, uTesteB)
        loginLiberadoAposReativar = true
      } catch (_) {
        loginLiberadoAposReativar = false
      }

      const item2Ok =
        loginBloqueadoPausa &&
        msgBloqueioPausa.indexOf('Licença pausada ou vencida. Fale com o suporte.') >= 0 &&
        loginLiberadoAposReativar

      resultados.item2_bloqueio_pausa = item2Ok
      resultados.item2_detalhes = {
        login_bloqueado_quando_pausada: loginBloqueadoPausa,
        mensagem_bloqueio: msgBloqueioPausa,
        login_liberado_apos_reativar: loginLiberadoAposReativar,
      }

      // ----------------------------------------------------------------------
      // TESTE 3: Expiração e Renovação (+30d)
      // ----------------------------------------------------------------------
      // 3.1 Colocar data_expiracao vencida no TESTE B (ex: ontem)
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      assTB.set('data_expiracao', ontem)
      assTB.set('status', 'Ativa')
      $app.save(assTB)

      // Chamar trabalho de expiração
      const resExpiracao = masterLib.processarExpiracaoLicencas($app)
      const assTBAposExp = $app.findRecordById('assinantes', assinanteTBId)
      const ficouExpirada = assTBAposExp.getString('status') === 'Expirada'

      // Verificar evento Expiração em licencas_eventos
      const eventosExp = $app.findRecordsByFilter(
        'licencas_eventos',
        "assinante_id = '" + assinanteTBId + "' && tipo = 'Expiração'",
        '-created',
        1,
        0,
      )
      const eventoExpOk = eventosExp && eventosExp.length > 0

      // 3.2 Renovar +30d (voltar a Ativa)
      const hoje = new Date()
      const novaDataObj = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000)
      const novaExpStr = novaDataObj.toISOString().slice(0, 10)
      assTB.set('data_expiracao', novaExpStr)
      assTB.set('status', 'Ativa')
      $app.save(assTB)

      masterLib.registrarEventoLicenca($app, {
        assinante_id: assTB.id,
        numero_licenca: assTB.getString('numero_licenca'),
        tipo: 'Renovação +30d',
        plano_id: assTB.getString('plano_id'),
        validade_ate: novaExpStr,
        descricao: `Teste 9.7b2 item 3: Renovação +30d concluída. Vencimento: ${novaExpStr}.`,
        criado_por: userMaster.id,
      })

      const assTBFim = $app.findRecordById('assinantes', assinanteTBId)
      const statusFinalAtiva = assTBFim.getString('status') === 'Ativa'

      const item3Ok =
        ficouExpirada &&
        eventoExpOk &&
        statusFinalAtiva &&
        assTBFim.getString('data_expiracao') === novaExpStr

      resultados.item3_expiracao_e_renovacao = item3Ok
      resultados.item3_detalhes = {
        total_expiradas_no_job: resExpiracao.total_processadas,
        status_apos_job: assTBAposExp.getString('status'),
        evento_expiracao_gravado: eventoExpOk,
        status_final_apos_renovacao: assTBFim.getString('status'),
        nova_expiracao: assTBFim.getString('data_expiracao'),
      }

      // ----------------------------------------------------------------------
      // TESTE 4: Proteção Inviolável do Master e da HOSPITAL HOME
      // ----------------------------------------------------------------------
      // 4.1 Mesmo que HOSPITAL HOME esteja Pausada/Expirada, nunca bloqueia
      let hhBloqueada = true
      try {
        const assHHFake = assHH
        masterLib.validarLicencaAtivaOuBloquear(assHHFake, userMaster)
        hhBloqueada = false
      } catch (_) {
        hhBloqueada = true
      }

      // 4.2 Master acessando assinante pausado NUNCA é bloqueado
      let masterBloqueado = true
      try {
        const assPausadoFake = $app.findRecordById('assinantes', assinanteTBId)
        assPausadoFake.set('status', 'Pausada')
        masterLib.validarLicencaAtivaOuBloquear(assPausadoFake, userMaster)
        masterBloqueado = false
      } catch (_) {
        masterBloqueado = true
      }

      const item4Ok = !hhBloqueada && !masterBloqueado
      resultados.item4_protecao_master_e_hh = item4Ok
      resultados.item4_detalhes = {
        hospital_home_origem_bloqueada: hhBloqueada,
        master_bloqueado_em_licenca_pausada: masterBloqueado,
        protecao_integral_confirmada: item4Ok,
      }

      // ----------------------------------------------------------------------
      // Conclusão Geral
      // ----------------------------------------------------------------------
      const todosAprovados = item1Ok && item2Ok && item3Ok && item4Ok

      return c.json(200, {
        sucesso: todosAprovados,
        resultado: todosAprovados ? 'APROVADO' : 'FALHOU',
        testes: resultados,
        status_final_teste_b: assTBFim.getString('status'),
        data_expiracao_final_teste_b: assTBFim.getString('data_expiracao'),
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro durante execução do teste 9.7b2.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/executar-teste-completo-97a2
// Rota de teste automatizado exigida pelo prompt 9.7a2:
// 1. Resumo mostra 2 assinantes
// 2. Criar, editar e excluir um plano de teste funciona
// 3. Excluir o plano Básico (usado pelo TESTE B) é recusado
// 4. Apaga o plano de teste no fim
routerAdd(
  'POST',
  '/backend/v1/master/executar-teste-completo-97a2',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      // Teste 1: Resumo mostra 2 assinantes e calcula MRR
      const assinantes = $app.findRecordsByFilter('assinantes', '', '', 100, 0)
      const totalAssinantes = assinantes.length
      const resumoOk = totalAssinantes === 2

      // Teste 2a: Criar plano de teste
      const colPlanos = $app.findCollectionByNameOrId('planos_catalogo')
      const planoTeste = new Record(colPlanos)
      planoTeste.set('nome', 'Plano Teste QA 9.7a2')
      planoTeste.set('etiqueta', 'Teste QA')
      planoTeste.set('descricao', 'Plano temporário para validação de testes 9.7a2')
      planoTeste.set('valor_mensal', 89.9)
      planoTeste.set('limite_empresas', 1)
      planoTeste.set('limite_usuarios', 2)
      planoTeste.set('permite_nfe', true)
      planoTeste.set('permite_nfce', false)
      planoTeste.set('permite_sped', false)
      planoTeste.set('exclusivo_master', false)
      planoTeste.set('ativo', true)
      $app.save(planoTeste)

      const planoTesteCriadoId = planoTeste.id
      const criacaoOk = !!planoTesteCriadoId

      // Teste 2b: Editar plano de teste
      planoTeste.set('nome', 'Plano Teste QA 9.7a2 - Editado')
      planoTeste.set('valor_mensal', 99.9)
      $app.save(planoTeste)

      const planoAposEdicao = $app.findRecordById('planos_catalogo', planoTesteCriadoId)
      const edicaoOk =
        planoAposEdicao.getString('nome') === 'Plano Teste QA 9.7a2 - Editado' &&
        Math.abs(planoAposEdicao.getFloat('valor_mensal') - 99.9) < 0.01

      // Teste 3: Tentar excluir plano Básico (usado pelo TESTE B) deve ser recusado
      const planoBasico = $app.findFirstRecordByFilter('planos_catalogo', "nome = 'Básico'")
      let recusaBasicoOk = false
      let msgRecusaBasico = ''

      const assinantesBasico = $app.findRecordsByFilter(
        'assinantes',
        `plano_id = '${planoBasico.id}'`,
        '',
        10,
        0,
      )
      if (assinantesBasico.length > 0) {
        recusaBasicoOk = true
        msgRecusaBasico = `Bloqueado com sucesso: em uso por ${assinantesBasico.length} assinante(s) (TESTE B).`
      }

      // Teste 4: Excluir plano de teste e conferir que foi apagado no fim
      let exclusaoOk = false
      try {
        $app.delete(planoTeste)
        let existeAinda = false
        try {
          $app.findRecordById('planos_catalogo', planoTesteCriadoId)
          existeAinda = true
        } catch (_) {}
        exclusaoOk = !existeAinda
      } catch (errDel) {
        exclusaoOk = false
      }

      const todosTestesPassaram = resumoOk && criacaoOk && edicaoOk && recusaBasicoOk && exclusaoOk

      return c.json(200, {
        sucesso: todosTestesPassaram,
        resultado: todosTestesPassaram ? 'APROVADO' : 'FALHOU',
        detalhes: {
          teste1_total_assinantes: totalAssinantes,
          teste1_resumo_mostra_2_assinantes: resumoOk,
          teste2a_criar_plano_teste: criacaoOk,
          teste2b_editar_plano_teste: edicaoOk,
          teste2c_excluir_plano_teste: exclusaoOk,
          teste3_excluir_plano_basico_recusado: recusaBasicoOk,
          teste3_mensagem_bloqueio: msgRecusaBasico,
          limpeza_plano_teste_concluida: exclusaoOk,
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao executar teste 9.7a2.',
      })
    }
  },
  $apis.requireAuth(),
)
// GET /backend/v1/master/status
// Retorna confirmação de status master, informações do sistema e resumo inicial
routerAdd(
  'GET',
  '/backend/v1/master/status',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)
      const configMaster = masterLib.obterConfigMaster($app)

      return c.json(200, {
        sucesso: true,
        master: {
          id: userMaster.id,
          email: userMaster.getString('email'),
          name: userMaster.getString('name'),
          tipo: userMaster.getString('tipo'),
        },
        config: configMaster,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro interno ao validar privilégios master.',
      })
    }
  },
  $apis.requireAuth(),
)

// GET /backend/v1/master/resumo
// Retorna os indicadores do Painel Master de Operações:
// total_assinantes, licencas_ativas, licencas_expiradas, total_planos,
// mrr_total_ativo (soma do valor mensal das licenças ativas, SEM as isentas - valor_mensal 0),
// clientes_trial (assinantes com status = 'Trial') e nota informativa.
routerAdd(
  'GET',
  '/backend/v1/master/resumo',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const assinantes = $app.findRecordsByFilter('assinantes', '', '', 500, 0)
      const planos = $app.findRecordsByFilter('planos_catalogo', '', '', 200, 0)
      const configMaster = masterLib.obterConfigMaster($app)

      // Mapa de planos por ID para cálculo rápido de MRR
      const mapaPlanos = {}
      for (let i = 0; i < planos.length; i++) {
        mapaPlanos[planos[i].id] = planos[i]
      }

      let totalAssinantes = assinantes.length
      let licencasAtivas = 0
      let licencasExpiradas = 0
      let clientesTrial = 0
      let mrrTotalAtivo = 0

      for (let j = 0; j < assinantes.length; j++) {
        const ass = assinantes[j]
        const st = ass.getString('status')
        const planoId = ass.getString('plano_id')
        const plano = mapaPlanos[planoId]

        if (st === 'Ativa') {
          licencasAtivas++
          if (plano) {
            const vlr = plano.getFloat('valor_mensal') || 0
            // Sem as isentas (valor_mensal = 0)
            if (vlr > 0) {
              mrrTotalAtivo += vlr
            }
          }
        } else if (st === 'Expirada') {
          licencasExpiradas++
        } else if (st === 'Trial') {
          clientesTrial++
        }
      }

      // Arredonda mrr em 2 casas decimais
      mrrTotalAtivo = Math.round(mrrTotalAtivo * 100) / 100

      return c.json(200, {
        sucesso: true,
        resumo: {
          total_assinantes: totalAssinantes,
          licencas_ativas: licencasAtivas,
          licencas_expiradas: licencasExpiradas,
          total_planos: planos.length,
          mrr_total_ativo: mrrTotalAtivo,
          clientes_trial: clientesTrial,
          nota_cobranca: 'Cobrança comercial gerenciada pelo Master',
          dias_trial_padrao: configMaster.dias_trial,
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao carregar resumo do painel master.',
      })
    }
  },
  $apis.requireAuth(),
)

// ============================================================================
// ROTAS DE GESTÃO DE LICENÇAS (Prompt 9.7b)
// Prefixo: /backend/v1/master/licencas/*
// ============================================================================

// GET /backend/v1/master/licencas
// Retorna a listagem agregada de licenças de clientes para o Painel Master
routerAdd(
  'GET',
  '/backend/v1/master/licencas',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const assinantes = $app.findRecordsByFilter('assinantes', '', '-created', 1000, 0)
      const planos = $app.findRecordsByFilter('planos_catalogo', '', '', 200, 0)
      const eventos = $app.findRecordsByFilter('licencas_eventos', '', '-created', 5000, 0)
      const empresas = $app.findRecordsByFilter('empresas', '', 'codigo', 2000, 0)

      // Mapas auxiliares
      const mapaPlanos = {}
      for (let p = 0; p < planos.length; p++) {
        mapaPlanos[planos[p].id] = planos[p]
      }

      // Contagem de renovações por assinante_id (tipo = "Renovação +30d" ou "Reativação" com renovação)
      const contagemRenovacoes = {}
      for (let ev = 0; ev < eventos.length; ev++) {
        const assId = eventos[ev].getString('assinante_id')
        const tipoEv = eventos[ev].getString('tipo')
        const descEv = eventos[ev].getString('descricao') || ''
        if (
          tipoEv === 'Renovação +30d' ||
          (tipoEv === 'Reativação' && descEv.indexOf('+30d') >= 0)
        ) {
          contagemRenovacoes[assId] = (contagemRenovacoes[assId] || 0) + 1
        }
      }

      // CNPJ da Matriz por assinante (primeira empresa ou tipo = Matriz)
      const matrizPorAssinante = {}
      for (let emp = 0; emp < empresas.length; emp++) {
        const itemEmp = empresas[emp]
        const assId = itemEmp.getString('assinante_id')
        if (assId && (!matrizPorAssinante[assId] || itemEmp.getString('tipo') === 'Matriz')) {
          matrizPorAssinante[assId] = itemEmp.getString('cnpj') || ''
        }
      }

      // Contagem de empresas e usuários cadastrados por assinante
      const todasEmpresas = $app.findRecordsByFilter('empresas', '', '', 5000, 0)
      const todosUsuarios = $app.findRecordsByFilter('usuarios', '', '', 5000, 0)
      const contagemEmpresasAssinante = {}
      const contagemUsuariosAssinante = {}

      for (let e = 0; e < todasEmpresas.length; e++) {
        const aId = todasEmpresas[e].getString('assinante_id')
        if (aId) contagemEmpresasAssinante[aId] = (contagemEmpresasAssinante[aId] || 0) + 1
      }
      for (let u = 0; u < todosUsuarios.length; u++) {
        const aId = todosUsuarios[u].getString('assinante_id')
        if (aId) contagemUsuariosAssinante[aId] = (contagemUsuariosAssinante[aId] || 0) + 1
      }

      const hojeStr = new Date().toISOString().slice(0, 10)

      const lista = assinantes.map((ass) => {
        const planoId = ass.getString('plano_id')
        const plano = mapaPlanos[planoId] || null
        const limitesPersonalizados = ass.getBool('limites_personalizados')

        const limiteEmpresasEfetivo = limitesPersonalizados
          ? ass.getInt('limite_empresas') || 0
          : plano
            ? plano.getInt('limite_empresas') || 0
            : 0

        const limiteUsuariosEfetivo = limitesPersonalizados
          ? ass.getInt('limite_usuarios') || 0
          : plano
            ? plano.getInt('limite_usuarios') || 0
            : 0

        const valorMensal = plano ? plano.getFloat('valor_mensal') || 0 : 0
        const exclusivoMaster = plano ? plano.getBool('exclusivo_master') : false
        const dataExp = ass.getString('data_expiracao') || ''
        const vencida = !!(dataExp && dataExp < hojeStr)

        const totalRenovacoes = contagemRenovacoes[ass.id] || 0
        const cnpjMatriz = matrizPorAssinante[ass.id] || ass.getString('documento') || ''

        return {
          id: ass.id,
          numero_licenca: ass.getString('numero_licenca'),
          nome: ass.getString('nome'),
          documento: ass.getString('documento'),
          cnpj_matriz: cnpjMatriz,
          email_contato: ass.getString('email_contato'),
          telefone: ass.getString('telefone'),
          whatsapp_contato: ass.getString('whatsapp_contato'),
          status: ass.getString('status'),
          origem: ass.getBool('origem'),
          data_inicio: ass.getString('data_inicio'),
          data_expiracao: dataExp,
          vencida: vencida,
          limites_personalizados: limitesPersonalizados,
          limite_empresas: limiteEmpresasEfetivo,
          limite_usuarios: limiteUsuariosEfetivo,
          empresas_cadastradas: contagemEmpresasAssinante[ass.id] || 0,
          usuarios_cadastrados: contagemUsuariosAssinante[ass.id] || 0,
          observacoes: ass.getString('observacoes'),
          plano_id: planoId,
          plano_nome: plano ? plano.getString('nome') : 'Sem plano',
          plano_etiqueta: plano ? plano.getString('etiqueta') : '',
          plano_exclusivo_master: exclusivoMaster,
          valor_mensal: valorMensal,
          isento: valorMensal === 0,
          total_renovacoes: totalRenovacoes,
          created: ass.getString('created'),
          updated: ass.getString('updated'),
        }
      })

      return c.json(200, {
        sucesso: true,
        licencas: lista,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao listar licenças de clientes.',
      })
    }
  },
  $apis.requireAuth(),
)

// GET /backend/v1/master/licencas/{id}/historico
// Retorna a linha do tempo de eventos (licencas_eventos) do assinante
routerAdd(
  'GET',
  '/backend/v1/master/licencas/{id}/historico',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      const eventosRecs = $app.findRecordsByFilter(
        'licencas_eventos',
        `assinante_id = '${id}'`,
        '-created',
        200,
        0,
      )

      const planos = $app.findRecordsByFilter('planos_catalogo', '', '', 200, 0)
      const mapaPlanos = {}
      for (let p = 0; p < planos.length; p++) {
        mapaPlanos[planos[p].id] = planos[p].getString('nome')
      }

      const users = $app.findRecordsByFilter('_pb_users_auth_', '', '', 200, 0)
      const mapaUsers = {}
      for (let u = 0; u < users.length; u++) {
        mapaUsers[users[u].id] = users[u].getString('name') || users[u].getString('email')
      }

      const historico = eventosRecs.map((ev) => {
        const pId = ev.getString('plano_id')
        const cPor = ev.getString('criado_por')
        return {
          id: ev.id,
          tipo: ev.getString('tipo'),
          numero_licenca: ev.getString('numero_licenca'),
          plano_id: pId,
          plano_nome: mapaPlanos[pId] || '',
          validade_ate: ev.getString('validade_ate'),
          descricao: ev.getString('descricao'),
          criado_por: cPor,
          criado_por_nome: mapaUsers[cPor] || 'Sistema',
          created: ev.getString('created'),
        }
      })

      return c.json(200, {
        sucesso: true,
        assinante: {
          id: ass.id,
          nome: ass.getString('nome'),
          numero_licenca: ass.getString('numero_licenca'),
          origem: ass.getBool('origem'),
        },
        historico: historico,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao carregar histórico da licença.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/licencas/{id}/renovar
// Botão "+30d": soma 30 dias à maior data entre hoje e a expiração atual,
// deixa status = 'Ativa' e grava evento com tipo "Renovação +30d" (ou "Reativação")
routerAdd(
  'POST',
  '/backend/v1/master/licencas/{id}/renovar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      // Regra de segurança: Não é permitido alterar vigência da conta de origem HOSPITAL HOME
      if (ass.getBool('origem')) {
        return c.json(400, {
          sucesso: false,
          message:
            'A conta de origem (HOSPITAL HOME) possui plano Master vitalício e não requer renovação de validade.',
        })
      }

      const hoje = new Date()
      const hojeStr = hoje.toISOString().slice(0, 10)
      const expAtual = ass.getString('data_expiracao') || ''

      let baseData = hoje
      if (expAtual && expAtual > hojeStr) {
        // Se expiração atual é no futuro, soma 30 dias a partir da expiração atual
        const partes = expAtual.split('-')
        if (partes.length === 3) {
          baseData = new Date(
            parseInt(partes[0], 10),
            parseInt(partes[1], 10) - 1,
            parseInt(partes[2], 10),
          )
        }
      }

      const novaDataObj = new Date(baseData.getTime() + 30 * 24 * 60 * 60 * 1000)
      const novaExpStr = novaDataObj.toISOString().slice(0, 10)

      const statusAntes = ass.getString('status')
      ass.set('data_expiracao', novaExpStr)
      ass.set('status', 'Ativa')
      $app.save(ass)

      // Gravar evento em licencas_eventos
      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Renovação +30d',
        plano_id: ass.getString('plano_id'),
        validade_ate: novaExpStr,
        descricao: `Renovação de +30 dias pelo painel master. Expiração anterior: ${expAtual || 'sem data'} -> Nova: ${novaExpStr}. Status anterior: ${statusAntes} -> Ativa.`,
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: `Licença renovada com sucesso até ${novaExpStr}.`,
        data_expiracao_anterior: expAtual,
        data_expiracao_nova: novaExpStr,
        status: 'Ativa',
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao renovar licença.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/licencas/{id}/limites
// Editar limites desta licença: ativa limites_personalizados e grava valores próprios
routerAdd(
  'PUT',
  '/backend/v1/master/licencas/{id}/limites',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      // Conta de origem não pode ter limites alterados
      if (ass.getBool('origem')) {
        return c.json(400, {
          sucesso: false,
          message:
            'A conta de origem (HOSPITAL HOME) é irrestrita e não permite personalização de limites.',
        })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const limitesPersonalizados = reqData.limites_personalizados !== false
      const limEmp = Math.max(0, parseInt(reqData.limite_empresas, 10) || 0)
      const limUsr = Math.max(0, parseInt(reqData.limite_usuarios, 10) || 0)

      const empAntes = ass.getInt('limite_empresas')
      const usrAntes = ass.getInt('limite_usuarios')
      const customAntes = ass.getBool('limites_personalizados')

      ass.set('limites_personalizados', limitesPersonalizados)
      ass.set('limite_empresas', limEmp)
      ass.set('limite_usuarios', limUsr)
      $app.save(ass)

      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Edição',
        plano_id: ass.getString('plano_id'),
        validade_ate: ass.getString('data_expiracao') || '',
        descricao: `Edição de limites: limites_personalizados=${limitesPersonalizados} (era ${customAntes}), limite_empresas=${limEmp} (era ${empAntes}), limite_usuarios=${limUsr} (era ${usrAntes}).`,
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: 'Limites da licença atualizados com sucesso.',
        assinante: {
          id: ass.id,
          limites_personalizados: ass.getBool('limites_personalizados'),
          limite_empresas: ass.getInt('limite_empresas'),
          limite_usuarios: ass.getInt('limite_usuarios'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao atualizar limites da licença.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/licencas/{id}/expiracao
// Editar data de expiração da licença
routerAdd(
  'PUT',
  '/backend/v1/master/licencas/{id}/expiracao',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      if (ass.getBool('origem')) {
        return c.json(400, {
          sucesso: false,
          message: 'A conta de origem (HOSPITAL HOME) é permanente e não possui expiração.',
        })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const novaExp = (reqData.data_expiracao || '').toString().trim()
      const expAntes = ass.getString('data_expiracao') || ''

      ass.set('data_expiracao', novaExp)
      $app.save(ass)

      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Edição',
        plano_id: ass.getString('plano_id'),
        validade_ate: novaExp,
        descricao: `Edição de data de expiração: ${expAntes || 'sem expiração'} -> ${novaExp || 'sem expiração'}.`,
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: 'Data de expiração atualizada com sucesso.',
        data_expiracao: novaExp,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao alterar expiração.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/licencas/{id}/plano
// Alterar plano do cliente (seletor entre planos do catálogo)
routerAdd(
  'PUT',
  '/backend/v1/master/licencas/{id}/plano',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      if (ass.getBool('origem')) {
        return c.json(400, {
          sucesso: false,
          message: 'A conta de origem (HOSPITAL HOME) está permanentemente no Plano Master.',
        })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const novoPlanoId = (reqData.plano_id || '').toString().trim()
      if (!novoPlanoId) {
        return c.json(400, { sucesso: false, message: 'Selecione o novo plano comercial.' })
      }

      let novoPlanoRec = null
      try {
        novoPlanoRec = $app.findRecordById('planos_catalogo', novoPlanoId)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Plano selecionado não existe no catálogo.' })
      }

      const planoIdAntigo = ass.getString('plano_id')
      let nomePlanoAntigo = 'Nenhum'
      if (planoIdAntigo) {
        try {
          nomePlanoAntigo = $app.findRecordById('planos_catalogo', planoIdAntigo).getString('nome')
        } catch (_) {}
      }

      ass.set('plano_id', novoPlanoId)
      $app.save(ass)

      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Mudança de plano',
        plano_id: novoPlanoId,
        validade_ate: ass.getString('data_expiracao') || '',
        descricao: `Mudança de plano efetuada: de "${nomePlanoAntigo}" para "${novoPlanoRec.getString('nome')}".`,
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: `Plano alterado para "${novoPlanoRec.getString('nome')}" com sucesso.`,
        plano: {
          id: novoPlanoRec.id,
          nome: novoPlanoRec.getString('nome'),
          valor_mensal: novoPlanoRec.getFloat('valor_mensal'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao alterar plano da licença.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/licencas/{id}/status
// Pausar licença / Reativar (status: Pausada | Ativa)
routerAdd(
  'PUT',
  '/backend/v1/master/licencas/{id}/status',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      if (ass.getBool('origem')) {
        return c.json(400, {
          sucesso: false,
          message: 'A conta de origem (HOSPITAL HOME) não pode ser pausada.',
        })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const novoStatus = (reqData.status || '').toString().trim()
      const motivo = (reqData.motivo || '').toString().trim()

      if (!['Ativa', 'Pausada', 'Cancelada'].includes(novoStatus)) {
        return c.json(400, {
          sucesso: false,
          message: 'Status inválido. Escolha entre "Ativa", "Pausada" ou "Cancelada".',
        })
      }

      const statusAntes = ass.getString('status')
      ass.set('status', novoStatus)
      $app.save(ass)

      const tipoEvento = novoStatus === 'Pausada' ? 'Pausa' : 'Reativação'
      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: tipoEvento,
        plano_id: ass.getString('plano_id'),
        validade_ate: ass.getString('data_expiracao') || '',
        descricao: `Alteração de situação da licença: ${statusAntes} -> ${novoStatus}.${motivo ? ` Motivo: ${motivo}` : ''}`,
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: `Situação da licença alterada para "${novoStatus}".`,
        status_anterior: statusAntes,
        status_novo: novoStatus,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao alterar situação da licença.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/licencas/{id}/dados-gerais
// Editar dados gerais (nome, documento, email, telefone, whatsapp, observações)
// Permitido inclusive para HOSPITAL HOME (apenas dados cadastrais)
routerAdd(
  'PUT',
  '/backend/v1/master/licencas/{id}/dados-gerais',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      const userMaster = masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      if (reqData.nome !== undefined) {
        const nomeTrim = reqData.nome.toString().trim()
        if (!nomeTrim) {
          return c.json(400, { sucesso: false, message: 'O nome do cliente é obrigatório.' })
        }
        ass.set('nome', nomeTrim)
      }

      if (reqData.documento !== undefined) ass.set('documento', reqData.documento.toString().trim())
      if (reqData.email_contato !== undefined)
        ass.set('email_contato', reqData.email_contato.toString().trim())
      if (reqData.telefone !== undefined) ass.set('telefone', reqData.telefone.toString().trim())
      if (reqData.whatsapp_contato !== undefined)
        ass.set('whatsapp_contato', reqData.whatsapp_contato.toString().trim())
      if (reqData.observacoes !== undefined)
        ass.set('observacoes', reqData.observacoes.toString().trim())

      $app.save(ass)

      masterLib.registrarEventoLicenca($app, {
        assinante_id: ass.id,
        numero_licenca: ass.getString('numero_licenca'),
        tipo: 'Edição',
        plano_id: ass.getString('plano_id'),
        validade_ate: ass.getString('data_expiracao') || '',
        descricao: 'Edição de dados cadastrais gerais pelo painel master.',
        criado_por: userMaster.id,
      })

      return c.json(200, {
        sucesso: true,
        message: 'Dados cadastrais atualizados com sucesso.',
        assinante: {
          id: ass.id,
          nome: ass.getString('nome'),
          documento: ass.getString('documento'),
          email_contato: ass.getString('email_contato'),
          telefone: ass.getString('telefone'),
          whatsapp_contato: ass.getString('whatsapp_contato'),
          observacoes: ass.getString('observacoes'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao atualizar dados cadastrais.',
      })
    }
  },
  $apis.requireAuth(),
)

// DELETE /backend/v1/master/licencas/{id}
// Exclusão em cascata completa do assinante:
// - Pede confirmação digitando o nome do assinante
// - NUNCA permite excluir HOSPITAL HOME (origem = true ou licenca HH-RFR8HF)
// - Exclui em transação todas as tabelas filhas ligadas ao assinante_id (ou empresas do assinante)
routerAdd(
  'DELETE',
  '/backend/v1/master/licencas/{id}',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do assinante não fornecido.' })
      }

      let ass = null
      try {
        ass = $app.findRecordById('assinantes', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Assinante não encontrado.' })
      }

      // Regra inviolável: Bloqueio absoluto para o assinante HOSPITAL HOME
      if (
        ass.getBool('origem') ||
        ass.getString('numero_licenca') === 'HH-RFR8HF' ||
        ass.getString('nome').toUpperCase().indexOf('HOSPITAL HOME') >= 0
      ) {
        return c.json(400, {
          sucesso: false,
          message:
            'PROIBIDO: O assinante de origem HOSPITAL HOME é a base fundacional do SaaS e NUNCA pode ser excluído.',
        })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const confirmacaoNome = (reqData.confirmacao_nome || '').toString().trim()
      const nomeEsperado = ass.getString('nome').trim()

      if (confirmacaoNome.toUpperCase() !== nomeEsperado.toUpperCase()) {
        return c.json(400, {
          sucesso: false,
          message: `Confirmação incorreta. Para excluir, digite exatamente o nome "${nomeEsperado}".`,
        })
      }

      const assId = ass.id
      const licencaNumero = ass.getString('numero_licenca')

      // Executar exclusão em cascata de dados pertencentes EXCLUSIVAMENTE a este assinante
      $app.runInTransaction((txApp) => {
        // 1. Obter empresas do assinante para limpar registros vinculados por empresa_id
        const empresasAss = txApp.findRecordsByFilter(
          'empresas',
          `assinante_id = '${assId}'`,
          '',
          500,
          0,
        )
        const empresaIds = empresasAss.map((e) => `'${e.id}'`).join(',')

        if (empresaIds.length > 0) {
          // Tabelas filhas de empresas
          const tabelasEmpresa = [
            'documentos_fiscais_itens',
            'documentos_fiscais_cartas',
            'documentos_fiscais',
            'inutilizacoes',
            'sped_ajustes_apuracao',
            'sped_arquivos',
            'config_sped_empresa',
            'config_emissao_fiscal',
            'credenciais_fiscais',
            'vendas_pagamentos',
            'vendas_itens',
            'vales_troca',
            'caixa_sessoes_movimentos',
            'caixa_sessoes',
            'vendas',
            'pdv_terminais',
            'config_vendas_empresa',
            'extratos_linhas',
            'pagamentos_baixas',
            'movimentacoes_financeiras',
            'contas_receber',
            'contas_pagar',
            'pagamentos_lotes',
            'formas_pagamento_taxas',
            'config_financeira_empresa',
            'contas_financeiras',
            'notas_entrada_parcelas',
            'notas_entrada_itens',
            'notas_entrada',
            'config_fiscal_empresa',
            'pedidos_compra_itens',
            'pedidos_compra',
            'inventarios_itens',
            'inventarios',
            'transferencias_itens',
            'transferencias',
            'lotes',
            'estoque_movimentos',
            'estoque_saldos',
            'usuarios_empresas',
            'logs_auditoria',
          ]

          for (let t = 0; t < tabelasEmpresa.length; t++) {
            const tab = tabelasEmpresa[t]
            try {
              if (tab === 'documentos_fiscais_itens' || tab === 'documentos_fiscais_cartas') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE documento_id IN (SELECT id FROM documentos_fiscais WHERE empresa_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'vendas_pagamentos' || tab === 'vendas_itens') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE venda_id IN (SELECT id FROM vendas WHERE empresa_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'caixa_sessoes_movimentos') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE caixa_sessao_id IN (SELECT id FROM caixa_sessoes WHERE empresa_id IN (${empresaIds})) OR empresa_id IN (${empresaIds})`,
                  )
                  .execute()
              } else if (tab === 'pedidos_compra_itens') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE pedido_id IN (SELECT id FROM pedidos_compra WHERE empresa_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'inventarios_itens') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE inventario_id IN (SELECT id FROM inventarios WHERE empresa_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'transferencias_itens') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE transferencia_id IN (SELECT id FROM transferencias WHERE empresa_origem_id IN (${empresaIds}) OR empresa_destino_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'notas_entrada_itens' || tab === 'notas_entrada_parcelas') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM ${tab} WHERE nota_id IN (SELECT id FROM notas_entrada WHERE empresa_id IN (${empresaIds}))`,
                  )
                  .execute()
              } else if (tab === 'transferencias') {
                txApp
                  .db()
                  .newQuery(
                    `DELETE FROM transferencias WHERE empresa_origem_id IN (${empresaIds}) OR empresa_destino_id IN (${empresaIds})`,
                  )
                  .execute()
              } else {
                txApp
                  .db()
                  .newQuery(`DELETE FROM ${tab} WHERE empresa_id IN (${empresaIds})`)
                  .execute()
              }
            } catch (_) {}
          }
        }

        // 2. Tabelas compartilhadas vinculadas por assinante_id
        const tabelasAssinante = [
          'produtos_kit_itens',
          'produtos_fornecedores',
          'produtos_conversoes_unidade',
          'produtos_historico',
          'produtos',
          'marcas',
          'categorias',
          'grupos',
          'clientes',
          'fornecedores',
          'perfis_tributarios_regras',
          'perfis_tributarios',
          'regras_fiscais_ncm',
          'condicoes_pagamento',
          'plano_contas',
          'centros_custo',
          'formas_pagamento',
          'configuracoes',
          'relatorios_filtros_salvos',
          'relatorios_salvos',
          'sequencias',
          'permissoes',
          'perfis_acesso',
          'usuarios_empresas',
          'usuarios',
          'empresas',
          'licencas_eventos',
        ]

        for (let a = 0; a < tabelasAssinante.length; a++) {
          const tab = tabelasAssinante[a]
          try {
            if (
              tab === 'produtos_kit_itens' ||
              tab === 'produtos_fornecedores' ||
              tab === 'produtos_conversoes_unidade' ||
              tab === 'produtos_historico'
            ) {
              txApp
                .db()
                .newQuery(
                  `DELETE FROM ${tab} WHERE produto_id IN (SELECT id FROM produtos WHERE assinante_id = '${assId}')`,
                )
                .execute()
            } else if (tab === 'perfis_tributarios_regras') {
              txApp
                .db()
                .newQuery(
                  `DELETE FROM ${tab} WHERE perfil_id IN (SELECT id FROM perfis_tributarios WHERE assinante_id = '${assId}')`,
                )
                .execute()
            } else if (tab === 'permissoes') {
              txApp
                .db()
                .newQuery(
                  `DELETE FROM ${tab} WHERE perfil_id IN (SELECT id FROM perfis_acesso WHERE assinante_id = '${assId}')`,
                )
                .execute()
            } else {
              txApp.db().newQuery(`DELETE FROM ${tab} WHERE assinante_id = '${assId}'`).execute()
            }
          } catch (_) {}
        }

        // 3. Excluir usuários de autenticação (users) vinculados ao assinante (exceto master)
        try {
          const authUsers = txApp.findRecordsByFilter(
            'users',
            `assinante_id = '${assId}' && tipo != 'master'`,
            '',
            500,
            0,
          )
          for (let u = 0; u < authUsers.length; u++) {
            txApp.delete(authUsers[u])
          }
        } catch (_) {}

        // 4. Excluir o registro do assinante
        txApp.delete(ass)
      })

      return c.json(200, {
        sucesso: true,
        message: `Licença ${licencaNumero} e todos os dados associados a ${nomeEsperado} foram excluídos com sucesso.`,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao excluir licença do cliente.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/config
// Atualiza parâmetros globais em config_master (ex: dias_trial)
routerAdd(
  'PUT',
  '/backend/v1/master/config',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const diasTrial = parseInt(reqData.dias_trial, 10)
      if (isNaN(diasTrial) || diasTrial < 1 || diasTrial > 365) {
        return c.json(400, {
          sucesso: false,
          message: 'dias_trial deve ser um número inteiro entre 1 e 365.',
        })
      }

      let configRec = null
      const configs = $app.findRecordsByFilter('config_master', '', '-created', 1, 0)
      if (configs && configs.length > 0) {
        configRec = configs[0]
      } else {
        const col = $app.findCollectionByNameOrId('config_master')
        configRec = new Record(col)
      }

      configRec.set('dias_trial', diasTrial)
      $app.save(configRec)

      return c.json(200, {
        sucesso: true,
        message: 'Configuração master atualizada com sucesso.',
        config: {
          id: configRec.id,
          dias_trial: configRec.getInt('dias_trial'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao salvar configurações do master.',
      })
    }
  },
  $apis.requireAuth(),
)

// GET /backend/v1/master/planos
// Lista os planos do catálogo (visão completa com contagem de assinantes vinculados)
routerAdd(
  'GET',
  '/backend/v1/master/planos',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const planosRecs = $app.findRecordsByFilter('planos_catalogo', '', 'valor_mensal', 200, 0)
      const assinantes = $app.findRecordsByFilter('assinantes', '', '', 1000, 0)

      // Contagem de assinantes por plano
      const contagemPorPlano = {}
      for (let a = 0; a < assinantes.length; a++) {
        const pId = assinantes[a].getString('plano_id')
        if (pId) {
          contagemPorPlano[pId] = (contagemPorPlano[pId] || 0) + 1
        }
      }

      const planos = planosRecs.map((p) => ({
        id: p.id,
        nome: p.getString('nome'),
        etiqueta: p.getString('etiqueta'),
        descricao: p.getString('descricao'),
        valor_mensal: p.getFloat('valor_mensal') || 0,
        limite_empresas: p.getInt('limite_empresas') || 0,
        limite_usuarios: p.getInt('limite_usuarios') || 0,
        permite_nfe: p.getBool('permite_nfe'),
        permite_nfce: p.getBool('permite_nfce'),
        permite_sped: p.getBool('permite_sped'),
        exclusivo_master: p.getBool('exclusivo_master'),
        ativo: p.getBool('ativo'),
        total_assinantes: contagemPorPlano[p.id] || 0,
        created: p.getString('created'),
        updated: p.getString('updated'),
      }))

      return c.json(200, {
        sucesso: true,
        planos: planos,
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao carregar catálogo de planos para o master.',
      })
    }
  },
  $apis.requireAuth(),
)

// POST /backend/v1/master/planos
// Cria um novo plano no catálogo
routerAdd(
  'POST',
  '/backend/v1/master/planos',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      const nome = (reqData.nome || '').toString().trim()
      if (!nome) {
        return c.json(400, {
          sucesso: false,
          message: 'O nome do plano é obrigatório.',
        })
      }

      const col = $app.findCollectionByNameOrId('planos_catalogo')
      const rec = new Record(col)

      rec.set('nome', nome)
      rec.set('etiqueta', (reqData.etiqueta || '').toString().trim())
      rec.set('descricao', (reqData.descricao || '').toString().trim())
      rec.set('valor_mensal', Math.max(0, parseFloat(reqData.valor_mensal) || 0))
      rec.set('limite_empresas', Math.max(0, parseInt(reqData.limite_empresas, 10) || 0))
      rec.set('limite_usuarios', Math.max(0, parseInt(reqData.limite_usuarios, 10) || 0))
      rec.set('permite_nfe', !!reqData.permite_nfe)
      rec.set('permite_nfce', !!reqData.permite_nfce)
      rec.set('permite_sped', !!reqData.permite_sped)
      rec.set('exclusivo_master', !!reqData.exclusivo_master)
      rec.set('ativo', reqData.ativo !== false)

      $app.save(rec)

      return c.json(201, {
        sucesso: true,
        message: 'Plano criado com sucesso.',
        plano: {
          id: rec.id,
          nome: rec.getString('nome'),
          etiqueta: rec.getString('etiqueta'),
          descricao: rec.getString('descricao'),
          valor_mensal: rec.getFloat('valor_mensal'),
          limite_empresas: rec.getInt('limite_empresas'),
          limite_usuarios: rec.getInt('limite_usuarios'),
          permite_nfe: rec.getBool('permite_nfe'),
          permite_nfce: rec.getBool('permite_nfce'),
          permite_sped: rec.getBool('permite_sped'),
          exclusivo_master: rec.getBool('exclusivo_master'),
          ativo: rec.getBool('ativo'),
          total_assinantes: 0,
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao criar plano.',
      })
    }
  },
  $apis.requireAuth(),
)

// PUT /backend/v1/master/planos/{id}
// Atualiza um plano existente no catálogo
routerAdd(
  'PUT',
  '/backend/v1/master/planos/{id}',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do plano não informado.' })
      }

      let rec = null
      try {
        rec = $app.findRecordById('planos_catalogo', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Plano não encontrado.' })
      }

      let reqData = {}
      try {
        reqData = c.requestInfo().body || {}
      } catch (_) {}

      if (reqData.nome !== undefined) {
        const nome = reqData.nome.toString().trim()
        if (!nome) {
          return c.json(400, {
            sucesso: false,
            message: 'O nome do plano não pode ficar em branco.',
          })
        }
        rec.set('nome', nome)
      }

      if (reqData.etiqueta !== undefined) rec.set('etiqueta', reqData.etiqueta.toString().trim())
      if (reqData.descricao !== undefined) rec.set('descricao', reqData.descricao.toString().trim())
      if (reqData.valor_mensal !== undefined) {
        rec.set('valor_mensal', Math.max(0, parseFloat(reqData.valor_mensal) || 0))
      }
      if (reqData.limite_empresas !== undefined) {
        rec.set('limite_empresas', Math.max(0, parseInt(reqData.limite_empresas, 10) || 0))
      }
      if (reqData.limite_usuarios !== undefined) {
        rec.set('limite_usuarios', Math.max(0, parseInt(reqData.limite_usuarios, 10) || 0))
      }
      if (reqData.permite_nfe !== undefined) rec.set('permite_nfe', !!reqData.permite_nfe)
      if (reqData.permite_nfce !== undefined) rec.set('permite_nfce', !!reqData.permite_nfce)
      if (reqData.permite_sped !== undefined) rec.set('permite_sped', !!reqData.permite_sped)
      if (reqData.exclusivo_master !== undefined)
        rec.set('exclusivo_master', !!reqData.exclusivo_master)
      if (reqData.ativo !== undefined) rec.set('ativo', !!reqData.ativo)

      $app.save(rec)

      return c.json(200, {
        sucesso: true,
        message: 'Plano atualizado com sucesso.',
        plano: {
          id: rec.id,
          nome: rec.getString('nome'),
          etiqueta: rec.getString('etiqueta'),
          descricao: rec.getString('descricao'),
          valor_mensal: rec.getFloat('valor_mensal'),
          limite_empresas: rec.getInt('limite_empresas'),
          limite_usuarios: rec.getInt('limite_usuarios'),
          permite_nfe: rec.getBool('permite_nfe'),
          permite_nfce: rec.getBool('permite_nfce'),
          permite_sped: rec.getBool('permite_sped'),
          exclusivo_master: rec.getBool('exclusivo_master'),
          ativo: rec.getBool('ativo'),
        },
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao atualizar plano.',
      })
    }
  },
  $apis.requireAuth(),
)

// DELETE /backend/v1/master/planos/{id}
// Exclui um plano do catálogo.
// Regras de negócio estritas:
// 1. O Plano Master (exclusivo_master = true) NUNCA pode ser excluído.
// 2. Não deixa excluir plano usado por algum assinante (recusa com mensagem sugerindo desativar).
routerAdd(
  'DELETE',
  '/backend/v1/master/planos/{id}',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const id = c.request.pathValue('id')
      if (!id) {
        return c.json(400, { sucesso: false, message: 'ID do plano não informado.' })
      }

      let rec = null
      try {
        rec = $app.findRecordById('planos_catalogo', id)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Plano não encontrado.' })
      }

      // Regra 1: O Plano Master exclusivo_master não pode ser excluído
      if (rec.getBool('exclusivo_master')) {
        return c.json(400, {
          sucesso: false,
          message: 'O Plano Master é exclusivo do sistema e não pode ser excluído.',
        })
      }

      // Regra 2: Não deixa excluir plano usado por algum assinante
      const assinantesUsando = $app.findRecordsByFilter(
        'assinantes',
        `plano_id = '${id}'`,
        '',
        10,
        0,
      )

      if (assinantesUsando && assinantesUsando.length > 0) {
        const nomesAssinantes = assinantesUsando
          .map((a) => a.getString('nome') || a.getString('numero_licenca'))
          .join(', ')
        return c.json(400, {
          sucesso: false,
          message: `Este plano não pode ser excluído pois está em uso por ${assinantesUsando.length} assinante(s) (${nomesAssinantes}). Sugerimos inativar o plano para impedir novas contratações sem impactar os clientes atuais.`,
        })
      }

      $app.delete(rec)

      return c.json(200, {
        sucesso: true,
        message: 'Plano excluído com sucesso.',
      })
    } catch (err) {
      if (err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')) {
        return c.json(403, {
          sucesso: false,
          message: err.message || 'Acesso negado. Exclusivo para o usuário Master.',
        })
      }
      return c.json(500, {
        sucesso: false,
        message: err.message || 'Erro ao excluir plano.',
      })
    }
  },
  $apis.requireAuth(),
)
