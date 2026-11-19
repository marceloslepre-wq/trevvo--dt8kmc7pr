/// <reference path="../types.d.ts" />

/**
 * tray_homologacao.js — Etapa 11 / Homologação do aplicativo na Tray
 *
 * A Tray pede, para homologar o aplicativo, o par requisição/resposta (texto, sem prints) de
 * todas as rotas usadas, o código do limite de 180 requisições por minuto e o código da
 * renovação do access_token. Para ERP, é obrigatório consumir a API do Multi CD.
 *
 * Este hook executa um roteiro curto de chamadas na loja Tray conectada à empresa e grava cada
 * par requisição/resposta em `tray_evidencias`, sem tokens nem chaves (trocados por
 * {access_token}, {refresh_token} e ***).
 *
 * Gravação na Tray: só o PUT de estoque do Multi CD, e com o MESMO saldo que o CD já tem
 * (lido no passo anterior). Se o saldo atual não puder ser lido, o PUT não é feito.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; rotas sem parâmetro de
 * caminho; sem spread de objetos; sem require.
 *
 * Rotas:
 *   POST /backend/v1/tray/homologacao/executar     (administrador)  body { empresa_id, produto_id?, variacao_id?, gravar_estoque? }
 *   GET  /backend/v1/tray/homologacao/evidencias?empresa_id=   (autenticada) — última execução
 */
routerAdd(
  'POST',
  '/backend/v1/tray/homologacao/executar',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth)
      return c.json(401, {
        sucesso: false,
        mensagem: 'Autenticação obrigatória.',
      })

    // ---- Helpers locais (JSVM: precisam ficar DENTRO do callback) ----
    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }

    function eMasterLocal(a) {
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', a.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    // Mesma regra de tenancy.js: devolve { assinanteId, admin, empresas[] }.
    function contextoDoUsuario(a) {
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + a.id + "' || id = '" + a.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')

      const master = eMasterLocal(a)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + a.id + "'",
              '-created',
              1,
              0,
            )
            if (imp && imp.length > 0 && imp[0].getString('assinante_id')) {
              assinanteId = imp[0].getString('assinante_id')
            }
          }
        } catch (_) {}
      }

      let admin = master
      const perfilId = usuarioRec.getString('perfil_id')
      if (!admin && perfilId) {
        try {
          const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
          if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
            admin = true
          }
        } catch (_) {}
      }

      let empresas = []
      if (admin) {
        try {
          empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
        } catch (_) {
          empresas = []
        }
      }
      return { assinanteId: assinanteId, admin: admin, empresas: empresas }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // =====================================================================================
    // LIMITE DA TRAY: 180 requisições por minuto por loja.
    // Janela deslizante de 60 s guardada na memória compartilhada do servidor ($app.store()),
    // por loja (api_address). Trabalhamos com 170 para ter margem. Quando a janela está cheia,
    // a chamada espera até a requisição mais antiga sair da janela. Se a memória compartilhada
    // não estiver disponível, cai num intervalo fixo de 350 ms entre chamadas (≈171 por minuto).
    // =====================================================================================
    function aguardarLimiteTray(chaveLoja) {
      const LIMITE_POR_MINUTO = 170
      const JANELA_MS = 60 * 1000
      const chave = 'tray_limite_' + chaveLoja
      for (let tentativa = 0; tentativa < 400; tentativa++) {
        let marcas = []
        let memoriaOk = true
        try {
          const bruto = $app.store().get(chave)
          if (bruto) marcas = JSON.parse(String(bruto))
        } catch (_) {
          memoriaOk = false
          marcas = []
        }
        const agora = Date.now()
        const recentes = []
        for (let i = 0; i < marcas.length; i++) {
          if (agora - marcas[i] < JANELA_MS) recentes.push(marcas[i])
        }
        if (recentes.length < LIMITE_POR_MINUTO) {
          recentes.push(agora)
          try {
            $app.store().set(chave, JSON.stringify(recentes))
          } catch (_) {
            memoriaOk = false
          }
          if (!memoriaOk) sleep(350)
          return
        }
        // Janela cheia: espera a requisição mais antiga completar 60 s.
        const espera = JANELA_MS - (agora - recentes[0]) + 50
        sleep(Math.min(Math.max(espera, 100), 5000))
      }
    }

    // Esconde tokens e chaves de qualquer texto antes de gravar a evidência.
    function mascarar(textoOriginal, segredos) {
      let t = String(textoOriginal === null || textoOriginal === undefined ? '' : textoOriginal)
      for (let i = 0; i < segredos.length; i++) {
        const s = segredos[i]
        if (s && s.valor && s.valor.length >= 6) {
          t = t.split(s.valor).join(s.nome)
          const cod = encodeURIComponent(s.valor)
          if (cod !== s.valor) t = t.split(cod).join(s.nome)
        }
      }
      t = t.replace(
        /"(access_token|refresh_token|consumer_key|consumer_secret|code)"\s*:\s*"[^"]*"/g,
        '"$1": "***"',
      )
      return t
    }

    function jsonBonito(valor) {
      if (valor === null || valor === undefined || valor === '') return ''
      try {
        if (typeof valor === 'string') return JSON.stringify(JSON.parse(valor), null, 2)
        return JSON.stringify(valor, null, 2)
      } catch (_) {
        return String(valor)
      }
    }

    // A Tray devolve itens como { DistributionCenter: {...} }, { Product: {...} } etc.
    function desembrulhar(item, chave) {
      if (item && item[chave] && typeof item[chave] === 'object') return item[chave]
      return item || {}
    }

    // Procura, em qualquer nível do JSON, objetos que pareçam centros de distribuição.
    function acharCds(dados) {
      const achados = []
      const vistos = {}
      function andar(no, profundidade) {
        if (!no || typeof no !== 'object' || profundidade > 6) return
        if (Array.isArray(no)) {
          for (let i = 0; i < no.length; i++) andar(no[i], profundidade + 1)
          return
        }
        if (no.DistributionCenter && typeof no.DistributionCenter === 'object') {
          const cd = no.DistributionCenter
          if (cd.id !== undefined && !vistos[String(cd.id)]) {
            vistos[String(cd.id)] = true
            achados.push(cd)
          }
          return
        }
        // A API devolve { data: [ { id, name, main, status, postal_code, ... } ] }.
        if (
          no.id !== undefined &&
          (no.zip_code !== undefined || no.postal_code !== undefined) &&
          !vistos[String(no.id)]
        ) {
          vistos[String(no.id)] = true
          achados.push(no)
          return
        }
        const chaves = Object.keys(no)
        for (let i = 0; i < chaves.length; i++) andar(no[chaves[i]], profundidade + 1)
      }
      andar(dados, 0)
      return achados
    }

    // No estoque detalhado, procura o saldo do CD informado. Devolve null se não achar.
    function saldoNoCd(dados, cdId) {
      let achado = null
      function andar(no, profundidade) {
        if (achado !== null || !no || typeof no !== 'object' || profundidade > 8) return
        if (Array.isArray(no)) {
          for (let i = 0; i < no.length; i++) andar(no[i], profundidade + 1)
          return
        }
        let idCd = undefined
        if (no.distribution_center_id !== undefined) idCd = no.distribution_center_id
        else if (no.DistributionCenter && no.DistributionCenter.id !== undefined)
          idCd = no.DistributionCenter.id
        else if (no.distribution_center && no.distribution_center.id !== undefined)
          idCd = no.distribution_center.id
        else if (no.postal_code !== undefined && no.id !== undefined) idCd = no.id
        let qtd = undefined
        if (no.stock !== undefined && typeof no.stock !== 'object') qtd = no.stock
        else if (no.quantity !== undefined) qtd = no.quantity
        else if (no.stock_quantity !== undefined) qtd = no.stock_quantity
        if (idCd !== undefined && String(idCd) === String(cdId) && qtd !== undefined) {
          const n = parseInt(String(qtd), 10)
          if (!isNaN(n)) achado = n
          return
        }
        const chaves = Object.keys(no)
        for (let i = 0; i < chaves.length; i++) andar(no[chaves[i]], profundidade + 1)
      }
      andar(dados, 0)
      return achado
    }

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem executar o roteiro de homologação.',
        })
      }
      const empresaId = String(body['empresa_id'] || '').trim()
      if (!idValido(empresaId))
        return c.json(400, {
          sucesso: false,
          mensagem: 'ID da empresa é obrigatório.',
        })
      let empresa = null
      for (let i = 0; i < ctx.empresas.length; i++) {
        if (ctx.empresas[i].id === empresaId) empresa = ctx.empresas[i]
      }
      if (!empresa)
        return c.json(403, {
          sucesso: false,
          mensagem: 'Acesso negado à empresa especificada.',
        })

      let conta = null
      try {
        const recs = $app.findRecordsByFilter(
          'tray_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) conta = recs[0]
      } catch (_) {}
      if (
        !conta ||
        conta.getString('status') === 'Desconectada' ||
        !conta.getString('refresh_token')
      ) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Nenhuma loja Tray conectada nesta empresa.',
        })
      }

      const produtoIdInformado = /^[0-9]{1,20}$/.test(String(body['produto_id'] || ''))
        ? String(body['produto_id'])
        : ''
      const variacaoIdInformada = /^[0-9]{1,20}$/.test(String(body['variacao_id'] || ''))
        ? String(body['variacao_id'])
        : ''
      const produtoComVariacaoInformado = /^[0-9]{1,20}$/.test(
        String(body['produto_variacao_id'] || ''),
      )
        ? String(body['produto_variacao_id'])
        : ''
      const gravarEstoque = body['gravar_estoque'] === true

      const api = conta.getString('api_address')
      const execucaoId = 'H' + Date.now()
      let ordem = 0
      const resumo = []

      let consumerKey = ''
      let consumerSecret = ''
      try {
        consumerKey = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
      } catch (_) {}
      try {
        consumerSecret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
      } catch (_) {}

      function segredosAtuais() {
        return [
          { nome: '{access_token}', valor: conta.getString('access_token') },
          { nome: '{refresh_token}', valor: conta.getString('refresh_token') },
          { nome: '***', valor: consumerKey },
          { nome: '***', valor: consumerSecret },
        ]
      }

      function registrar(
        etapa,
        metodo,
        rota,
        urlExemplo,
        requestObj,
        status,
        respostaTexto,
        ms,
        obs,
      ) {
        ordem++
        const segs = segredosAtuais()
        let resp = mascarar(jsonBonito(respostaTexto), segs)
        if (resp.length > 60000)
          resp = resp.slice(0, 60000) + '\n... (resposta cortada em 60.000 caracteres)'
        try {
          const col = $app.findCollectionByNameOrId('tray_evidencias')
          const rec = new Record(col)
          rec.set('empresa_id', empresaId)
          rec.set('execucao_id', execucaoId)
          rec.set('ordem', ordem)
          rec.set('etapa', etapa)
          rec.set('metodo', metodo)
          rec.set('rota', rota)
          rec.set('url_exemplo', mascarar(urlExemplo, segs))
          rec.set('request_json', requestObj ? mascarar(jsonBonito(requestObj), segs) : '')
          rec.set('status_http', status)
          rec.set('response_json', resp)
          rec.set('duracao_ms', ms)
          rec.set('observacao', obs || '')
          $app.save(rec)
        } catch (e) {
          console.log(
            '[tray-homologacao] Falha ao gravar evidência: ' + (e && e.message ? e.message : e),
          )
        }
        resumo.push({
          ordem: ordem,
          etapa: etapa,
          metodo: metodo,
          rota: rota,
          status_http: status,
          observacao: obs || '',
        })
      }

      // Chamada à Tray com limite de 180/min e nova tentativa em HTTP 429 (1 s, 2 s, 4 s, 8 s).
      // Nunca registrar a URL em log (contém o token).
      function chamarTray(metodo, caminho, corpo, comToken) {
        const esperas = [1000, 2000, 4000, 8000]
        let url = api + caminho
        if (comToken) {
          url +=
            (caminho.indexOf('?') >= 0 ? '&' : '?') +
            'access_token=' +
            encodeURIComponent(conta.getString('access_token'))
        }
        for (let t = 0; t <= esperas.length; t++) {
          aguardarLimiteTray(api)
          const inicio = Date.now()
          const opcoes = {
            method: metodo,
            url: url,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Trevvo-ERP/1.0',
            },
            timeout: 30,
          }
          if (corpo) {
            opcoes.headers['Content-Type'] = 'application/json'
            opcoes.body = JSON.stringify(corpo)
          }
          const res = $http.send(opcoes)
          const ms = Date.now() - inicio
          if (res.statusCode === 429 && t < esperas.length) {
            sleep(esperas[t])
            continue
          }
          let raw = ''
          try {
            raw = res.raw ? String(res.raw) : JSON.stringify(lerJson(res))
          } catch (_) {}
          return {
            status: res.statusCode,
            dados: lerJson(res),
            raw: raw,
            ms: ms,
            url: url,
          }
        }
        return { status: 429, dados: {}, raw: '', ms: 0, url: url }
      }

      // ---- 1) Renovação do access_token: GET /auth?refresh_token= ----
      const refreshAntes = conta.getString('refresh_token')
      const rAuth = chamarTray(
        'GET',
        '/auth?refresh_token=' + encodeURIComponent(refreshAntes),
        null,
        false,
      )
      // Mascara também o refresh token usado na chamada (pode mudar depois da renovação).
      const segsAntes = [{ nome: '{refresh_token}', valor: refreshAntes }]
      if (
        (rAuth.status === 200 || rAuth.status === 201) &&
        rAuth.dados &&
        rAuth.dados.access_token
      ) {
        conta.set('access_token', String(rAuth.dados.access_token))
        if (rAuth.dados.refresh_token) {
          conta.set('refresh_token', String(rAuth.dados.refresh_token))
          conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
        }
        conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
        conta.set('ultima_renovacao_em', new Date().toISOString())
        conta.set('status', 'Conectada')
        conta.set('ultimo_erro', '')
        $app.save(conta)
      }
      registrar(
        'Renovação do access_token',
        'GET',
        '/auth',
        mascarar(rAuth.url, segsAntes),
        null,
        rAuth.status,
        mascarar(rAuth.raw, segsAntes),
        rAuth.ms,
        'Feita automaticamente a cada 30 minutos pelo agendamento tray_renovar_tokens (token dura 3 h).',
      )
      if (rAuth.status !== 200 && rAuth.status !== 201) {
        return c.json(400, {
          sucesso: false,
          mensagem:
            'A renovação do token falhou (HTTP ' +
            rAuth.status +
            '). Reconecte a loja e tente de novo.',
          execucao_id: execucaoId,
          passos: resumo,
        })
      }

      // ---- 2) Dados da loja: GET /info ----
      const rInfo = chamarTray('GET', '/info', null, true)
      registrar(
        'Dados da loja',
        'GET',
        '/info',
        rInfo.url,
        null,
        rInfo.status,
        rInfo.raw,
        rInfo.ms,
        '',
      )

      // ---- 3) Produtos: GET /products ----
      const rProd = chamarTray('GET', '/products?limit=3&page=1', null, true)
      registrar(
        'Listagem de produtos',
        'GET',
        '/products',
        rProd.url,
        null,
        rProd.status,
        rProd.raw,
        rProd.ms,
        '',
      )
      let produtoSimplesId = produtoIdInformado
      let produtoComVariacaoId = produtoComVariacaoInformado
      const listaProd = (rProd.dados && (rProd.dados.Products || rProd.dados.products)) || []
      for (let i = 0; i < listaProd.length; i++) {
        const p = desembrulhar(listaProd[i], 'Product')
        const temVar =
          (p.Variant && p.Variant.length > 0) ||
          String(p.has_variation) === '1' ||
          p.has_variation === true
        if (temVar && !produtoComVariacaoId) produtoComVariacaoId = String(p.id || '')
        if (!temVar && !produtoSimplesId) produtoSimplesId = String(p.id || '')
      }

      // ---- 4) Variações: GET /products/variants?product_id= ----
      let variacaoId = variacaoIdInformada
      if (produtoComVariacaoId && /^[0-9]{1,20}$/.test(produtoComVariacaoId)) {
        const rVar = chamarTray(
          'GET',
          '/products/variants?product_id=' + produtoComVariacaoId + '&limit=5',
          null,
          true,
        )
        registrar(
          'Variações do produto',
          'GET',
          '/products/variants',
          rVar.url,
          null,
          rVar.status,
          rVar.raw,
          rVar.ms,
          '',
        )
        const lv = (rVar.dados && (rVar.dados.Variants || rVar.dados.variants)) || []
        if (!variacaoId && lv.length > 0)
          variacaoId = String(desembrulhar(lv[0], 'Variant').id || '')
      } else {
        resumo.push({
          ordem: 0,
          etapa: 'Variações do produto',
          metodo: 'GET',
          rota: '/products/variants',
          status_http: 0,
          observacao:
            'Nenhum produto com variação entre os primeiros. Informe produto/variação para gerar esta evidência.',
        })
      }

      // ---- 5) Multi CD: lista de centros de distribuição ----
      const rCds = chamarTray(
        'GET',
        '/multicd/distribution-centers?limit=50&page=1&page%5Bsize%5D=50',
        null,
        true,
      )
      const cds = rCds.status === 200 ? acharCds(rCds.dados) : []
      registrar(
        'Multi CD: listar centros de distribuição',
        'GET',
        '/multicd/distribution-centers',
        rCds.url,
        null,
        rCds.status,
        rCds.raw,
        rCds.ms,
        rCds.status === 404 ? 'HTTP 404: o recurso Multi CD parece não estar ativo na loja.' : '',
      )
      let cd = null
      for (let i = 0; i < cds.length; i++) {
        // Prefere o CD principal e ativo (main/status na API atual; active nas versões antigas).
        const pontos = function (x) {
          let p = 0
          if (x.main === true || String(x.main) === '1') p += 2
          if (x.status === true || String(x.status) === '1' || String(x.active) === '1') p += 1
          return p
        }
        if (!cd || pontos(cds[i]) > pontos(cd)) cd = cds[i]
      }
      const cdId = cd && /^[0-9]{1,20}$/.test(String(cd.id)) ? String(cd.id) : ''

      if (cdId) {
        // ---- 6) Multi CD: consultar um CD ----
        const rCd = chamarTray('GET', '/multicd/distribution-centers/' + cdId, null, true)
        registrar(
          'Multi CD: consultar centro de distribuição',
          'GET',
          '/multicd/distribution-centers/{id}',
          rCd.url,
          null,
          rCd.status,
          rCd.raw,
          rCd.ms,
          '',
        )

        // ---- 7) Multi CD: estoque detalhado do produto e PUT com o mesmo saldo ----
        if (produtoSimplesId) {
          const rEp = chamarTray(
            'GET',
            '/multicd/stock/detailed/product/' + produtoSimplesId,
            null,
            true,
          )
          registrar(
            'Multi CD: estoque do produto por CD',
            'GET',
            '/multicd/stock/detailed/product/{id}',
            rEp.url,
            null,
            rEp.status,
            rEp.raw,
            rEp.ms,
            '',
          )
          const saldo = rEp.status === 200 ? saldoNoCd(rEp.dados, cdId) : null
          if (gravarEstoque && saldo !== null) {
            const corpo = {
              DistributionCenterProduct: {
                product_id: parseInt(produtoSimplesId, 10),
                stock: saldo,
              },
            }
            const rPut = chamarTray(
              'PUT',
              '/multicd/distribution-centers/' + cdId + '/stock',
              corpo,
              true,
            )
            registrar(
              'Multi CD: atualizar estoque do produto no CD',
              'PUT',
              '/multicd/distribution-centers/{id}/stock',
              rPut.url,
              corpo,
              rPut.status,
              rPut.raw,
              rPut.ms,
              'Enviado o mesmo saldo que o CD já tinha (' + saldo + ').',
            )
          } else {
            resumo.push({
              ordem: 0,
              etapa: 'Multi CD: atualizar estoque do produto no CD',
              metodo: 'PUT',
              rota: '/multicd/distribution-centers/{id}/stock',
              status_http: 0,
              observacao: !gravarEstoque
                ? 'Não executado: a gravação de estoque não foi autorizada nesta execução.'
                : 'Não executado: não foi possível ler o saldo atual do produto neste CD.',
            })
          }
        }

        // ---- 8) Multi CD: estoque detalhado da variação e PUT com o mesmo saldo ----
        if (variacaoId) {
          const rEv = chamarTray('GET', '/multicd/stock/detailed/variant/' + variacaoId, null, true)
          registrar(
            'Multi CD: estoque da variação por CD',
            'GET',
            '/multicd/stock/detailed/variant/{id}',
            rEv.url,
            null,
            rEv.status,
            rEv.raw,
            rEv.ms,
            '',
          )
          const saldoV = rEv.status === 200 ? saldoNoCd(rEv.dados, cdId) : null
          if (gravarEstoque && saldoV !== null) {
            const corpoV = {
              DistributionCenterVariant: {
                variant_id: parseInt(variacaoId, 10),
                stock: saldoV,
              },
            }
            const rPutV = chamarTray(
              'PUT',
              '/multicd/distribution-centers/' + cdId + '/stock',
              corpoV,
              true,
            )
            registrar(
              'Multi CD: atualizar estoque da variação no CD',
              'PUT',
              '/multicd/distribution-centers/{id}/stock',
              rPutV.url,
              corpoV,
              rPutV.status,
              rPutV.raw,
              rPutV.ms,
              'Enviado o mesmo saldo que o CD já tinha (' + saldoV + ').',
            )
          }
        }
      }

      // ---- 9) Pedidos: listagem e pedido completo ----
      const rPed = chamarTray('GET', '/orders?limit=3&page=1', null, true)
      registrar(
        'Listagem de pedidos',
        'GET',
        '/orders',
        rPed.url,
        null,
        rPed.status,
        rPed.raw,
        rPed.ms,
        '',
      )
      const listaPed = (rPed.dados && (rPed.dados.Orders || rPed.dados.orders)) || []
      let pedidoId = ''
      if (listaPed.length > 0) pedidoId = String(desembrulhar(listaPed[0], 'Order').id || '')
      if (/^[0-9]{1,20}$/.test(pedidoId)) {
        let rCompleto = chamarTray('GET', '/orders/' + pedidoId + '/complete', null, true)
        let rotaCompleta = '/orders/{id}/complete'
        if (rCompleto.status === 404) {
          rCompleto = chamarTray('GET', '/orders/' + pedidoId + '/full', null, true)
          rotaCompleta = '/orders/{id}/full'
        }
        registrar(
          'Pedido completo',
          'GET',
          rotaCompleta,
          rCompleto.url,
          null,
          rCompleto.status,
          rCompleto.raw,
          rCompleto.ms,
          '',
        )
      }

      // ---- IP público de saída do servidor (a Tray pede quando há callback) ----
      let ipPublico = ''
      try {
        const rIp = $http.send({
          method: 'GET',
          url: 'https://api.ipify.org?format=json',
          timeout: 10,
        })
        const dIp = lerJson(rIp)
        ipPublico = String((dIp && dIp.ip) || '').slice(0, 60)
      } catch (_) {}

      return c.json(200, {
        sucesso: true,
        execucao_id: execucaoId,
        loja_host: conta.getString('loja_host'),
        ip_publico_saida: ipPublico,
        url_callback: 'https://' + c.request.host + '/backend/v1/tray/oauth/callback',
        multicd_ativo: rCds.status === 200,
        centros_distribuicao: cds.length,
        passos: resumo,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao executar o roteiro de homologação.',
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/tray/homologacao/evidencias',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth)
      return c.json(401, {
        sucesso: false,
        mensagem: 'Autenticação obrigatória.',
      })
    try {
      const q = c.requestInfo().query || {}
      const empresaId = String(q['empresa_id'] || '').trim()
      if (!/^[A-Za-z0-9_]{1,40}$/.test(empresaId))
        return c.json(400, {
          sucesso: false,
          mensagem: 'ID da empresa é obrigatório.',
        })

      // Só administradores do assinante dono da empresa (ou master) leem as evidências.
      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}
      if (!usuarioRec)
        return c.json(403, {
          sucesso: false,
          mensagem: 'Usuário ERP não encontrado.',
        })
      let master = false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        master = !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {}
      let admin = master
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', usuarioRec.getString('perfil_id'))
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador'))
          admin = true
      } catch (_) {}
      let empresa = null
      try {
        empresa = $app.findRecordById('empresas', empresaId)
      } catch (_) {}
      if (
        !admin ||
        !empresa ||
        (!master && empresa.getString('assinante_id') !== usuarioRec.getString('assinante_id'))
      ) {
        return c.json(403, { sucesso: false, mensagem: 'Acesso negado.' })
      }

      let ultima = []
      try {
        ultima = $app.findRecordsByFilter(
          'tray_evidencias',
          "empresa_id = '" + empresaId + "' && execucao_id != 'CONEXAO'",
          '-created',
          1,
          0,
        )
      } catch (_) {}
      const execucaoId = ultima && ultima.length > 0 ? ultima[0].getString('execucao_id') : ''
      // A troca do code (POST /auth) só acontece ao conectar a loja: entra a mais recente.
      let recs = []
      try {
        const rc = $app.findRecordsByFilter(
          'tray_evidencias',
          "empresa_id = '" + empresaId + "' && execucao_id = 'CONEXAO'",
          '-created',
          1,
          0,
        )
        for (let i = 0; i < rc.length; i++) recs.push(rc[i])
      } catch (_) {}
      if (execucaoId) {
        const re = $app.findRecordsByFilter(
          'tray_evidencias',
          "empresa_id = '" + empresaId + "' && execucao_id = '" + execucaoId + "'",
          'ordem',
          200,
          0,
        )
        for (let i = 0; i < re.length; i++) recs.push(re[i])
      }
      const evidencias = []
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i]
        evidencias.push({
          ordem: r.getInt('ordem'),
          etapa: r.getString('etapa'),
          metodo: r.getString('metodo'),
          rota: r.getString('rota'),
          url_exemplo: r.getString('url_exemplo'),
          request_json: r.getString('request_json'),
          status_http: r.getInt('status_http'),
          response_json: r.getString('response_json'),
          duracao_ms: r.getInt('duracao_ms'),
          observacao: r.getString('observacao'),
          criado_em: r.getString('created'),
        })
      }
      return c.json(200, {
        sucesso: true,
        execucao_id: execucaoId,
        evidencias: evidencias,
      })
    } catch (err) {
      return c.json(400, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao ler as evidências.',
      })
    }
  },
  $apis.requireAuth(),
)
