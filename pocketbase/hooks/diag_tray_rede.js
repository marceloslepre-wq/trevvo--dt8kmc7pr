/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (SOMENTE LEITURA) — rede a partir do PRÓPRIO backend.
 * GET /backend/v1/diag-tray-rede?token=...
 *
 * Faz as mesmas chamadas à Tray de dentro do backend PocketBase, então o IP de
 * saída é o mesmo que o hook tray_conexao usa. Usa credenciais FALSAS.
 * Não grava nada, não altera nenhum registro. REMOVER após o diagnóstico.
 */
routerAdd('GET', '/backend/v1/diag-tray-rede', (e) => {
  if (e.request.url.query().get('token') !== 'diag_9f3k2m1q8v7x') {
    return e.unauthorizedError('token inválido')
  }

  var HOST = 'mcadl04b.commercesuite.com.br'
  var API = 'https://' + HOST + '/web_api'

  function resumir(rotulo, res) {
    var hs = res.headers || {}
    var pegar = function (nome) {
      for (var k in hs) {
        if (String(k).toLowerCase() === nome) {
          var v = hs[k]
          if (v && v.length !== undefined && typeof v === 'object') return String(v.join(', '))
          return String(v)
        }
      }
      return ''
    }
    var corpo = ''
    try {
      corpo = String(res.raw || '')
    } catch (_) {
      corpo = ''
    }
    corpo = corpo.replace(/\s+/g, ' ').trim().slice(0, 300)
    return {
      chamada: rotulo,
      http: res.statusCode,
      server: pegar('server'),
      content_type: pegar('content-type'),
      cf_ray: pegar('cf-ray'),
      x_azion_request_id: pegar('x-azion-request-id'),
      x_azion_edge_location: pegar('x-azion-edge-location'),
      corpo_inicio: corpo,
    }
  }

  var resultados = []
  var erro = ''

  try {
    // (a) GET /info — sem credenciais
    var a = $http.send({
      method: 'GET',
      url: API + '/info',
      headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
      timeout: 20,
    })
    resultados.push(resumir('a) GET /info (com User-Agent)', a))
  } catch (err) {
    erro += 'a: ' + (err && err.message) + ' | '
  }

  try {
    // (b) POST /auth com credenciais FALSAS e User-Agent
    var b = $http.send({
      method: 'POST',
      url: API + '/auth',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Trevvo-ERP/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'consumer_key=teste&consumer_secret=teste&code=teste',
      timeout: 20,
    })
    resultados.push(resumir('b) POST /auth (com User-Agent)', b))
  } catch (err) {
    erro += 'b: ' + (err && err.message) + ' | '
  }

  try {
    // (c) POST /auth idêntico, SEM User-Agent
    var c = $http.send({
      method: 'POST',
      url: API + '/auth',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'consumer_key=teste&consumer_secret=teste&code=teste',
      timeout: 20,
    })
    resultados.push(resumir('c) POST /auth (sem User-Agent)', c))
  } catch (err) {
    erro += 'c: ' + (err && err.message) + ' | '
  }

  try {
    // (d) GET /auth?refresh_token= — o caminho que o renovador usa
    var d = $http.send({
      method: 'GET',
      url: API + '/auth?refresh_token=teste',
      headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
      timeout: 20,
    })
    resultados.push(resumir('d) GET /auth?refresh_token (renovador)', d))
  } catch (err) {
    erro += 'd: ' + (err && err.message) + ' | '
  }

  try {
    // (e) o mesmo POST sem User-Agent nenhum e sem Accept (cliente "cru")
    var f = $http.send({
      method: 'POST',
      url: API + '/auth',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'consumer_key=teste&consumer_secret=teste&code=teste',
      timeout: 20,
    })
    resultados.push(resumir('e) POST /auth (cru, sem Accept/UA)', f))
  } catch (err) {
    erro += 'e: ' + (err && err.message) + ' | '
  }

  return e.json(200, {
    somenteLeitura: true,
    executadoNoBackend: true,
    hostTestado: HOST,
    errosDeRede: erro || null,
    resultados: resultados,
  })
})
