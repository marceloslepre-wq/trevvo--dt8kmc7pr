/// <reference path="../types.d.ts" />

/**
 * mercadolivre_precos.js — preço e "você recebe" dos anúncios de um produto (SOMENTE LEITURA)
 *
 * Procura no Mercado Livre os anúncios cujo SKU é a referência do produto no Trevvo e, para cada
 * anúncio/variação, devolve o preço, a tarifa de venda (listing_prices) e o custo de envio pago
 * pelo vendedor, com a estimativa do valor recebido. Não grava nada no Mercado Livre nem no
 * Trevvo (exceto a renovação do token da própria conta, quando está para vencer).
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; sem spread de objetos.
 *
 * Rota:
 *   GET /backend/v1/mercadolivre/precos-produto?empresa_id=&produto_id=[&sku=][&anuncio=MLB...]   (autenticada)
 *   sku = SKU a procurar no lugar da Referência (ex.: código da Tray); anuncio = lê direto esse anúncio.
 */
routerAdd(
  'GET',
  '/backend/v1/mercadolivre/precos-produto',
  (c) => {
    const auth = c.auth || c.get('authRecord')
    if (!auth) return c.json(401, { sucesso: false, mensagem: 'Autenticação obrigatória.' })

    // ---- Helpers locais (JSVM: precisam ficar DENTRO do callback) ----
    function idValido(v) {
      return typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)
    }

    function eMasterLocal(auth) {
      if (!auth) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    // Devolve { usuarioRec, assinanteId, admin, empresas[] } seguindo a mesma regra de tenancy.js
    function contextoDoUsuario(auth) {
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
      if (!usuarioRec) throw new BadRequestError('Registro de usuário ERP não encontrado.')

      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) throw new BadRequestError('Usuário sem vínculo com assinante.')

      const master = eMasterLocal(auth)
      if (master) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imp = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + auth.id + "'",
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
      } else {
        const ids = {}
        const padraoId = usuarioRec.getString('empresa_padrao_id')
        if (padraoId) ids[padraoId] = true
        try {
          const vinc = $app.findRecordsByFilter(
            'usuarios_empresas',
            "usuario_id = '" + usuarioRec.id + "' && ativo = true",
            '',
            500,
            0,
          )
          for (let i = 0; i < vinc.length; i++) {
            const eId = vinc[i].getString('empresa_id')
            if (eId) ids[eId] = true
          }
        } catch (_) {}
        Object.keys(ids).forEach((eId) => {
          try {
            const emp = $app.findRecordById('empresas', eId)
            if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
              empresas.push(emp)
            }
          } catch (_) {}
        })
      }

      return { usuarioRec: usuarioRec, assinanteId: assinanteId, admin: admin, empresas: empresas }
    }

    function exigirEmpresa(ctx, empresaId) {
      if (!idValido(empresaId)) throw new BadRequestError('ID da empresa é obrigatório.')
      for (let i = 0; i < ctx.empresas.length; i++) {
        if (ctx.empresas[i].id === empresaId) return ctx.empresas[i]
      }
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }

    function contaDaEmpresa(empresaId) {
      try {
        const recs = $app.findRecordsByFilter(
          'mercadolivre_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }

    // ---- Helpers de chamada ao Mercado Livre (locais ao callback) ----
    function segredosML() {
      let appId = ''
      let secret = ''
      try {
        appId = ($os.getenv('ML_APP_ID') || '').trim()
      } catch (_) {}
      try {
        secret = ($os.getenv('ML_CLIENT_SECRET') || '').trim()
      } catch (_) {}
      return { appId: appId, secret: secret, ok: !!(appId && secret) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Nunca registrar em log os parâmetros desta chamada (contêm segredo, code e tokens).
    function pedirToken(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      const res = $http.send({
        method: 'POST',
        url: 'https://api.mercadolibre.com/oauth/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: partes.join('&'),
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function consultarUsuarioML(accessToken) {
      const res = $http.send({
        method: 'GET',
        url: 'https://api.mercadolibre.com/users/me',
        headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function gravarTokens(conta, dados) {
      const expiraSeg = parseInt(dados.expires_in, 10) || 21600
      conta.set('access_token', dados.access_token || '')
      // O refresh_token do Mercado Livre é de uso único: sempre gravar o novo.
      if (dados.refresh_token) conta.set('refresh_token', dados.refresh_token)
      conta.set('token_expira_em', new Date(Date.now() + expiraSeg * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    function mensagemErroML(r) {
      const d = (r && r.dados) || {}
      const txt = d.message || d.error_description || d.error || ''
      return 'Mercado Livre respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    function chamarML(caminho, token) {
      const res = $http.send({
        method: 'GET',
        url: 'https://api.mercadolibre.com' + caminho,
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        timeout: 15,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    // Procura o atributo SELLER_SKU em uma lista de atributos do Mercado Livre.
    function skuDosAtributos(attrs) {
      if (!attrs || !attrs.length) return ''
      for (let i = 0; i < attrs.length; i++) {
        if (attrs[i] && attrs[i].id === 'SELLER_SKU') {
          return String(attrs[i].value_name || '').trim()
        }
      }
      return ''
    }

    function descreverVariacao(v) {
      const comb = (v && v.attribute_combinations) || []
      const partes = []
      for (let i = 0; i < comb.length; i++) {
        partes.push(
          String(comb[i].name || comb[i].id || '') + ': ' + String(comb[i].value_name || ''),
        )
      }
      return partes.join(' / ')
    }

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())

      const produtoId = String(q['produto_id'] || '').trim()
      if (!idValido(produtoId)) throw new BadRequestError('Produto inválido.')
      let produto = null
      try {
        produto = $app.findRecordById('produtos', produtoId)
      } catch (_) {
        produto = null
      }
      if (!produto || produto.getString('assinante_id') !== ctx.assinanteId) {
        throw new BadRequestError('Produto não encontrado.')
      }
      const skuInformado = String(q['sku'] || '').trim()
      const anuncioInformado = String(q['anuncio'] || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
      if (skuInformado && !/^[A-Za-z0-9._\-\/ ]{1,60}$/.test(skuInformado)) {
        throw new BadRequestError('SKU inválido.')
      }
      const sku = skuInformado || produto.getString('referencia').trim()
      if (!sku && !anuncioInformado) {
        return c.json(200, {
          sucesso: true,
          sku: '',
          anuncios: [],
          mensagem:
            'O produto não tem Referência. O SKU do anúncio no Mercado Livre deve ser igual à Referência do produto.',
        })
      }
      const seg = segredosML()
      if (!seg.ok) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Segredos ML_APP_ID e ML_CLIENT_SECRET não configurados.',
        })
      }
      const conta = contaDaEmpresa(empresa.id)
      if (
        !conta ||
        conta.getString('status') !== 'Conectada' ||
        !conta.getString('refresh_token')
      ) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Nenhuma conta do Mercado Livre conectada nesta empresa.',
        })
      }

      // Renova o token se faltar menos de 5 minutos.
      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 5 * 60 * 1000) {
        const r = pedirToken({
          grant_type: 'refresh_token',
          client_id: seg.appId,
          client_secret: seg.secret,
          refresh_token: conta.getString('refresh_token'),
        })
        if (r.status === 200 && r.dados && r.dados.access_token) {
          gravarTokens(conta, r.dados)
          $app.save(conta)
        } else {
          return c.json(400, {
            sucesso: false,
            mensagem: 'Falha ao renovar o token. ' + mensagemErroML(r),
          })
        }
      }
      const token = conta.getString('access_token')
      const mlUserId = conta.getString('ml_user_id').replace(/[^0-9]/g, '')

      // Anúncios com este SKU (o filtro seller_sku pega SKU do anúncio e das variações).
      const ids = []
      if (anuncioInformado)
        ids.push(
          anuncioInformado.indexOf('MLB') === 0 ? anuncioInformado : 'MLB' + anuncioInformado,
        )
      const filtros = anuncioInformado || !sku ? [] : ['seller_sku=', 'sku=']
      for (let f = 0; f < filtros.length && ids.length === 0; f++) {
        const busca = chamarML(
          '/users/' +
            mlUserId +
            '/items/search?' +
            filtros[f] +
            encodeURIComponent(sku) +
            '&limit=20',
          token,
        )
        if (busca.status === 200 && busca.dados && busca.dados.results) {
          for (let i = 0; i < busca.dados.results.length; i++) {
            const id = String(busca.dados.results[i]).replace(/[^A-Za-z0-9]/g, '')
            if (id && ids.indexOf(id) < 0) ids.push(id)
          }
        }
      }

      const anuncios = []
      const falhas = []
      for (let i = 0; i < ids.length && i < 10; i++) {
        const itemId = ids[i]
        const r = chamarML('/items/' + itemId + '?include_attributes=all', token)
        if (r.status !== 200 || !r.dados) {
          falhas.push({ anuncio_id: itemId, erro: mensagemErroML(r) })
          continue
        }
        const item = r.dados
        const listingType = String(item.listing_type_id || '')
        const categoria = String(item.category_id || '')
        const shipping = item.shipping || {}
        const freteGratis = !!shipping.free_shipping

        // Preço de venda atual (promoção, se houver); senão o preço do anúncio
        // Diagnóstico (só leitura): o que o Mercado Livre devolveu em cada consulta, resumido.
        function resumo(obj, max) {
          let t = ''
          try {
            t = JSON.stringify(obj)
          } catch (_) {
            t = ''
          }
          return t.length > max ? t.slice(0, max) + '…' : t
        }
        const diagnostico = {
          item_price: Number(item.price) || 0,
          item_original_price: Number(item.original_price) || 0,
          item_base_price: Number(item.base_price) || 0,
          shipping_mode: String(shipping.mode || ''),
          logistic_type: String(shipping.logistic_type || ''),
          free_shipping: freteGratis,
          sale_price: '',
          shipping_free: '',
          listing_prices: '',
        }

        let precoAtual = 0
        try {
          const sp = chamarML('/items/' + itemId + '/sale_price?context=channel_marketplace', token)
          diagnostico.sale_price = 'HTTP ' + sp.status + ' ' + resumo(sp.dados, 400)
          if (sp.status === 200 && sp.dados && Number(sp.dados.amount) > 0) {
            precoAtual = Number(sp.dados.amount)
          }
        } catch (_) {}

        // Custo de envio pago pelo vendedor
        let custoEnvio = null
        try {
          const fr = chamarML(
            '/users/' + mlUserId + '/shipping_options/free?item_id=' + itemId,
            token,
          )
          diagnostico.shipping_free = 'HTTP ' + fr.status + ' ' + resumo(fr.dados, 600)
          const cov = fr.dados && fr.dados.coverage && fr.dados.coverage.all_country
          if (fr.status === 200 && cov && cov.list_cost !== undefined && cov.list_cost !== null) {
            custoEnvio = Number(cov.list_cost) || 0
          }
        } catch (_) {}

        // Variações cujo SKU bate; sem variações = o próprio anúncio
        const variacoes = item.variations || []
        const alvos = []
        // Com anúncio informado: só filtra variações se alguma tiver o SKU procurado.
        let algumaBate = false
        for (let v = 0; v < variacoes.length; v++) {
          const va0 = variacoes[v] || {}
          const s0 = skuDosAtributos(va0.attributes) || String(va0.seller_custom_field || '').trim()
          if (sku && s0 === sku) algumaBate = true
        }
        const filtrarVariacao = !anuncioInformado || algumaBate
        if (variacoes.length === 0) {
          alvos.push({ variacao_id: '', variacao: '', preco: Number(item.price) || 0 })
        } else {
          for (let v = 0; v < variacoes.length; v++) {
            const va = variacoes[v] || {}
            const skuVa =
              skuDosAtributos(va.attributes) || String(va.seller_custom_field || '').trim()
            if (filtrarVariacao && skuVa && skuVa !== sku) continue
            alvos.push({
              variacao_id: String(va.id || ''),
              variacao: descreverVariacao(va),
              preco: Number(va.price || item.price) || 0,
            })
          }
        }

        for (let a = 0; a < alvos.length; a++) {
          const alvo = alvos[a]
          // Sem variações: vale o preço de venda atual (promoção); com variação, o preço dela.
          const preco = !alvo.variacao_id && precoAtual > 0 ? precoAtual : alvo.preco
          let tarifa = null
          let tarifaPercentual = null
          let tarifaFixa = null
          try {
            const lp = chamarML(
              '/sites/MLB/listing_prices?price=' +
                preco.toFixed(2) +
                '&listing_type_id=' +
                encodeURIComponent(listingType) +
                (categoria ? '&category_id=' + encodeURIComponent(categoria) : ''),
              token,
            )
            diagnostico.listing_prices = 'HTTP ' + lp.status + ' ' + resumo(lp.dados, 600)
            let d = lp.dados
            if (d && d.length !== undefined) d = d[0]
            if (lp.status === 200 && d && d.sale_fee_amount !== undefined) {
              tarifa = Number(d.sale_fee_amount) || 0
              const det = d.sale_fee_details || {}
              if (det.percentage_fee !== undefined)
                tarifaPercentual = Number(det.percentage_fee) || 0
              if (det.fixed_fee !== undefined) tarifaFixa = Number(det.fixed_fee) || 0
            }
          } catch (_) {}

          const recebido =
            tarifa === null
              ? null
              : Number((preco - tarifa - (custoEnvio === null ? 0 : custoEnvio)).toFixed(2))

          anuncios.push({
            anuncio_id: itemId,
            titulo: String(item.title || ''),
            status_anuncio: String(item.status || ''),
            link: String(item.permalink || ''),
            tipo_anuncio: listingType,
            sku_anuncio:
              skuDosAtributos(item.attributes) || String(item.seller_custom_field || '').trim(),
            variacao_id: alvo.variacao_id,
            variacao: alvo.variacao,
            preco: Number(preco.toFixed(2)),
            tarifa_venda: tarifa,
            tarifa_percentual: tarifaPercentual,
            tarifa_fixa: tarifaFixa,
            frete_gratis: freteGratis,
            custo_envio: custoEnvio,
            valor_recebido: recebido,
            diagnostico: diagnostico,
          })
        }
      }

      return c.json(200, {
        sucesso: true,
        somente_leitura: true,
        sku: sku,
        anuncios: anuncios,
        falhas: falhas,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao consultar o Mercado Livre.',
      })
    }
  },
  $apis.requireAuth(),
)
