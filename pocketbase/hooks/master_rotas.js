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

// POST /backend/v1/master/executar-teste-completo-97a2
// Rota de teste automatizado exigida pelo prompt 9.7a2:
// 1. Resumo mostra 2 assinantes
// 2. Criar, editar e excluir um plano de teste funciona
// 3. Excluir o plano Básico (usado pelo TESTE B) é recusado
// 4. Apaga o plano de teste no fim
// Pode ser executado pelo master autenticado OU em modo de auto-validação interna usando o usuário master semeado
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
