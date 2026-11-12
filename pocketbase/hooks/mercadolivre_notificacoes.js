/// <reference path="../types.d.ts" />

/**
 * mercadolivre_notificacoes.js — Etapa 10 / Parte 10.2a
 *
 * Recebe as notificações (webhooks) do Mercado Livre e apenas as guarda em fila.
 * O Mercado Livre exige resposta HTTP 200 em até 500 ms, então esta rota NÃO chama
 * a API nem processa nada: só valida, grava e responde. O processamento da fila
 * virá em outra parte (agendamento), respeitando o modo somente leitura.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo.
 *
 * Rotas:
 *   POST /backend/v1/mercadolivre/notificacoes               (pública, chamada pelo Mercado Livre)
 *   GET  /backend/v1/mercadolivre/notificacoes/diagnostico   (pública, só contagens)
 */

// 1) Recebimento. Responde 200 sempre que o aviso for aceito ou for repetido.
routerAdd('POST', '/backend/v1/mercadolivre/notificacoes', (c) => {
  try {
    const body = c.requestInfo().body || {}

    const topico = String(body.topic || '').slice(0, 80)
    const recurso = String(body.resource || '').slice(0, 500)
    const mlUserId = String(body.user_id || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 40)
    const appIdAviso = String(body.application_id || '')
    let notifId = String(body._id || body.id || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 80)

    if (!topico || !recurso || !mlUserId) {
      // Corpo que não é uma notificação do Mercado Livre: recusa sem gravar.
      return c.json(400, { sucesso: false, mensagem: 'Notificação inválida.' })
    }

    // Só aceita avisos destinados à aplicação do Trevvo.
    let appId = ''
    try {
      appId = ($os.getenv('ML_APP_ID') || '').trim()
    } catch (_) {}
    if (appId && appIdAviso && appIdAviso !== appId) {
      return c.json(403, { sucesso: false, mensagem: 'Aplicação não reconhecida.' })
    }

    // Só aceita avisos de contas conectadas; descobre a empresa pela conta.
    let conta = null
    try {
      const contas = $app.findRecordsByFilter(
        'mercadolivre_contas',
        "ml_user_id = '" + mlUserId + "' && status != 'Desconectada'",
        '-created',
        1,
        0,
      )
      if (contas && contas.length > 0) conta = contas[0]
    } catch (_) {}
    if (!conta) {
      // 200 para o Mercado Livre não ficar reenviando avisos de conta que não é nossa.
      return c.json(200, { sucesso: true, gravada: false, motivo: 'conta_nao_conectada' })
    }

    if (!notifId) {
      notifId = (topico + '_' + mlUserId + '_' + recurso + '_' + String(body.sent || '')).replace(
        /[^0-9A-Za-z_-]/g,
        '_',
      ).slice(0, 200)
    }

    // Aviso repetido (o Mercado Livre reenvia): não grava de novo.
    try {
      const ja = $app.findRecordsByFilter(
        'mercadolivre_notificacoes',
        "notificacao_id = '" + notifId + "'",
        '',
        1,
        0,
      )
      if (ja && ja.length > 0) return c.json(200, { sucesso: true, gravada: false, motivo: 'repetida' })
    } catch (_) {}

    let conteudo = ''
    try {
      conteudo = JSON.stringify(body).slice(0, 19000)
    } catch (_) {
      conteudo = ''
    }

    const rec = new Record($app.findCollectionByNameOrId('mercadolivre_notificacoes'))
    rec.set('notificacao_id', notifId)
    rec.set('topico', topico)
    rec.set('recurso', recurso)
    rec.set('ml_user_id', mlUserId)
    rec.set('empresa_id', conta.getString('empresa_id'))
    rec.set('assinante_id', conta.getString('assinante_id'))
    rec.set('tentativa_ml', parseInt(body.attempts, 10) || 1)
    rec.set('enviada_em', String(body.sent || '').slice(0, 40))
    rec.set('recebida_em', new Date().toISOString())
    rec.set('status', 'Pendente')
    rec.set('conteudo', conteudo)
    try {
      $app.save(rec)
    } catch (errSave) {
      // Corrida com um reenvio simultâneo (índice único): trata como repetida.
      return c.json(200, { sucesso: true, gravada: false, motivo: 'repetida' })
    }

    return c.json(200, { sucesso: true, gravada: true })
  } catch (err) {
    console.log('[mercadolivre] Erro ao receber notificação: ' + (err && err.message ? err.message : String(err)))
    // 500 faz o Mercado Livre tentar de novo mais tarde.
    return c.json(500, { sucesso: false })
  }
})

// 2) Diagnóstico público: só contagens, sem conteúdo das notificações.
routerAdd('GET', '/backend/v1/mercadolivre/notificacoes/diagnostico', (c) => {
  let colecao = false
  try {
    colecao = $app.hasTable('mercadolivre_notificacoes')
  } catch (_) {}

  const porTopico = {}
  let total = 0
  let ultima = ''
  if (colecao) {
    try {
      const recs = $app.findRecordsByFilter('mercadolivre_notificacoes', "id != ''", '-created', 500, 0)
      total = recs.length
      for (let i = 0; i < recs.length; i++) {
        const t = recs[i].getString('topico') || '(sem tópico)'
        porTopico[t] = (porTopico[t] || 0) + 1
        if (i === 0) ultima = recs[i].getString('recebida_em')
      }
    } catch (_) {}
  }

  return c.json(200, {
    sucesso: true,
    rota_carregada: true,
    colecao_mercadolivre_notificacoes: colecao,
    url_de_notificacoes_para_cadastrar_no_mercado_livre:
      'https://' + c.request.host + '/backend/v1/mercadolivre/notificacoes',
    notificacoes_guardadas_ultimas_500: total,
    por_topico: porTopico,
    ultima_recebida_em: ultima,
  })
})
