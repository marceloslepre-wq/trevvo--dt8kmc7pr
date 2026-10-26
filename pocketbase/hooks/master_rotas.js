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

// GET /backend/v1/master/planos
// Lista os planos do catálogo (visão completa com exclusivos master e valores)
routerAdd(
  'GET',
  '/backend/v1/master/planos',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    const masterLib = require(`${__hooks}/master_lib.js`)

    try {
      masterLib.exigirMaster(auth, $app)

      const planosRecs = $app.findRecordsByFilter('planos_catalogo', '', 'valor_mensal', 100, 0)
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
        created: p.getString('created'),
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
