/// <reference path="../types.d.ts" />

/**
 * tray_envio.js — Envio de ESTOQUE e PREÇO do Trevvo para a Tray (manual, por anúncio).
 *
 * Para cada anúncio pedido (produto ou variação da Tray), procura o vínculo em
 * produtos_vinculos_anuncios (marketplace 'tray', empresa = loja conectada) e calcula:
 *  - estoque = saldo do produto na loja + saldos NEGATIVOS das empresas em
 *    descontar_negativo_ids, ÷ unidades do anúncio, arredondado para baixo, mínimo 0
 *    (produto inativo no Trevvo = 0);
 *  - preço = preco_anuncio do vínculo, se > 0; senão preço próprio da loja
 *    (produtos_precos_empresa) ou preço geral, x unidades.
 * Mesmas regras do card de simulação (SimulacaoEnvioTray.tsx).
 *
 * Grava na Tray:
 *  - estoque: PUT /multicd/distribution-centers/{cd}/stock  corpo PLANO
 *    { product_id | variation_id, stock } (formato validado na homologação, 19/11/2026);
 *  - preço: PUT /products/{id} { Product: { price } } ou
 *    PUT /products/variants/{id} { Variant: { price } }.
 * Cada envio fica registrado em tray_envios_log (sem tokens).
 *
 * Só administrador. No máximo 25 anúncios por chamada. Exige confirmar = true.
 * ATENÇÃO JSVM (Goja): nenhuma função no topo do arquivo; sem spread; sem require; rota sem
 * parâmetro de caminho.
 *
 * Rota:
 *   POST /backend/v1/tray/envio/executar
 *   body { empresa_id, itens: [{ anuncio_id, variacao_id }], enviar_estoque, enviar_preco,
 *          descontar_negativo_ids: [], confirmar: true }
 */
routerAdd(
  'POST',
  '/backend/v1/tray/envio/executar',
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
          'tray_contas',
          "empresa_id = '" + empresaId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
      return null
    }

    // ---- Helpers de chamada à Tray (locais ao callback) ----
    function segredosTray() {
      let key = ''
      let secret = ''
      try {
        key = ($os.getenv('TRAY_CONSUMER_KEY') || '').trim()
      } catch (_) {}
      try {
        secret = ($os.getenv('TRAY_CONSUMER_SECRET') || '').trim()
      } catch (_) {}
      return { key: key, secret: secret, ok: !!(key && secret) }
    }

    function lerJson(res) {
      if (res && res.json) return res.json
      try {
        return JSON.parse(res.raw || '{}')
      } catch (_) {
        return {}
      }
    }

    // Aceita "https://loja.com.br/qualquer/coisa" ou "loja.com.br" e devolve só o host em minúsculas.
    function hostDaLoja(valor) {
      let v = String(valor || '')
        .trim()
        .toLowerCase()
      v = v.replace(/^https?:\/\//, '')
      v = v.split('/')[0].split('?')[0].split('#')[0]
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return ''
      if (v.length > 200) return ''
      return v
    }

    // A API da loja fica sempre em https://{host da loja}/web_api
    function apiDaLoja(host) {
      return 'https://' + host + '/web_api'
    }

    function formUrlEncoded(campos) {
      const partes = []
      Object.keys(campos).forEach((k) => {
        partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]))
      })
      return partes.join('&')
    }

    function mensagemErroTray(r) {
      const d = (r && r.dados) || {}
      let txt = d.message || d.error || ''
      if (!txt && d.causes) {
        try {
          txt = JSON.stringify(d.causes).slice(0, 200)
        } catch (_) {}
      }
      return 'Tray respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
    }

    // Grava os tokens. A validade é calculada aqui (3 h e 30 dias, com margem), sem depender de fuso da Tray.
    function gravarTokensTray(conta, dados) {
      conta.set('access_token', String(dados.access_token || ''))
      if (dados.refresh_token) {
        conta.set('refresh_token', String(dados.refresh_token))
        conta.set('refresh_expira_em', new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString())
      }
      conta.set('token_expira_em', new Date(Date.now() + 170 * 60 * 1000).toISOString())
      conta.set('ultima_renovacao_em', new Date().toISOString())
      conta.set('status', 'Conectada')
      conta.set('ultimo_erro', '')
    }

    // Nunca registrar em log os parâmetros destas chamadas.
    function renovarTokenTray(conta) {
      const res = $http.send({
        method: 'GET',
        url:
          conta.getString('api_address') +
          '/auth?refresh_token=' +
          encodeURIComponent(conta.getString('refresh_token')),
        headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
        timeout: 20,
      })
      return { status: res.statusCode, dados: lerJson(res) }
    }

    function lerCorpo() {
      try {
        const info = c.requestInfo()
        return (info && info.body) || {}
      } catch (_) {
        return {}
      }
    }

    function arred2(v) {
      return Math.round(v * 100) / 100
    }

    try {
      const corpo = lerCorpo()
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Só administrador pode enviar estoque e preço para a Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(corpo.empresa_id || '').trim())
      if (corpo.confirmar !== true) {
        return c.json(400, { sucesso: false, mensagem: 'Envio não confirmado.' })
      }
      const enviarEstoque = corpo.enviar_estoque === true
      const enviarPreco = corpo.enviar_preco === true
      if (!enviarEstoque && !enviarPreco) {
        return c.json(400, { sucesso: false, mensagem: 'Escolha estoque e/ou preço.' })
      }
      const itens = Array.isArray(corpo.itens) ? corpo.itens : []
      if (itens.length === 0 || itens.length > 25) {
        return c.json(400, { sucesso: false, mensagem: 'Envie de 1 a 25 anúncios por vez.' })
      }
      const descontar = []
      const listaDesc = Array.isArray(corpo.descontar_negativo_ids)
        ? corpo.descontar_negativo_ids
        : []
      for (let i = 0; i < listaDesc.length; i++) {
        const eId = String(listaDesc[i] || '')
        if (!idValido(eId) || eId === empresa.id) continue
        let permitida = false
        for (let j = 0; j < ctx.empresas.length; j++) {
          if (ctx.empresas[j].id === eId) permitida = true
        }
        if (permitida) descontar.push(eId)
      }

      const conta = contaDaEmpresa(empresa.id)
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

      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira - Date.now() < 5 * 60 * 1000) {
        const rr = renovarTokenTray(conta)
        if ((rr.status === 200 || rr.status === 201) && rr.dados && rr.dados.access_token) {
          gravarTokensTray(conta, rr.dados)
          $app.save(conta)
        } else {
          if (rr.status === 400 || rr.status === 401) conta.set('status', 'Reconectar')
          conta.set('ultimo_erro', mensagemErroTray(rr))
          $app.save(conta)
          return c.json(400, {
            sucesso: false,
            mensagem: 'Falha ao renovar o token. ' + mensagemErroTray(rr),
          })
        }
      }

      const api = conta.getString('api_address')
      const token = encodeURIComponent(conta.getString('access_token'))

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

      // Chamada à Tray com limite de 180/min e nova tentativa em 429. Nunca logar a URL (token).
      function chamarTray(metodo, caminho, corpoReq) {
        const esperas = [1000, 2000, 4000, 8000]
        const url =
          api + caminho + (caminho.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + token
        for (let t = 0; t <= esperas.length; t++) {
          aguardarLimiteTray(api)
          const opcoes = {
            method: metodo,
            url: url,
            headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
            timeout: 30,
          }
          if (corpoReq) {
            opcoes.headers['Content-Type'] = 'application/json'
            opcoes.body = JSON.stringify(corpoReq)
          }
          const res = $http.send(opcoes)
          if (res.statusCode === 429 && t < esperas.length) {
            sleep(esperas[t])
            continue
          }
          return { status: res.statusCode, dados: lerJson(res) }
        }
        return { status: 429, dados: {} }
      }

      // ---- Centro de distribuição principal (Multi CD) ----
      let cdId = ''
      if (enviarEstoque) {
        const rCds = chamarTray(
          'GET',
          '/multicd/distribution-centers?limit=50&page=1&page%5Bsize%5D=50',
          null,
        )
        if (rCds.status !== 200) {
          return c.json(400, {
            sucesso: false,
            mensagem: 'Não foi possível ler os centros de distribuição. ' + mensagemErroTray(rCds),
          })
        }
        const lista = (rCds.dados && (rCds.dados.data || rCds.dados.DistributionCenters)) || []
        let melhor = null
        let melhorPontos = -1
        for (let i = 0; i < lista.length; i++) {
          const cd =
            lista[i] && lista[i].DistributionCenter ? lista[i].DistributionCenter : lista[i]
          if (!cd || cd.id === undefined) continue
          let p = 0
          if (cd.main === true || String(cd.main) === '1') p += 2
          if (cd.status === true || String(cd.status) === '1' || String(cd.active) === '1') p += 1
          if (p > melhorPontos) {
            melhor = cd
            melhorPontos = p
          }
        }
        if (melhor && /^[0-9]{1,20}$/.test(String(melhor.id))) cdId = String(melhor.id)
        if (!cdId) {
          return c.json(400, {
            sucesso: false,
            mensagem: 'Nenhum centro de distribuição encontrado na Tray (Multi CD).',
          })
        }
      }

      function saldoDe(empresaId, produtoId) {
        try {
          const r = $app.findFirstRecordByFilter(
            'estoque_saldos',
            "empresa_id = '" + empresaId + "' && produto_id = '" + produtoId + "'",
          )
          return r ? r.getFloat('quantidade') || 0 : 0
        } catch (_) {
          return 0
        }
      }

      function precoDaLoja(produto) {
        try {
          const r = $app.findFirstRecordByFilter(
            'produtos_precos_empresa',
            "empresa_id = '" + empresa.id + "' && produto_id = '" + produto.id + "'",
          )
          if (r && r.getFloat('preco_venda') > 0) return r.getFloat('preco_venda')
        } catch (_) {}
        return produto.getFloat('preco_venda') || 0
      }

      function registrarLog(dados) {
        try {
          const col = $app.findCollectionByNameOrId('tray_envios_log')
          const rec = new Record(col)
          rec.set('assinante_id', ctx.assinanteId)
          rec.set('empresa_id', empresa.id)
          rec.set('usuario_id', ctx.usuarioRec.id)
          rec.set('origem', 'manual')
          rec.set('anuncio_id', dados.anuncio_id)
          rec.set('variacao_id', dados.variacao_id)
          rec.set('produto_id', dados.produto_id || '')
          rec.set('tipo', dados.tipo)
          rec.set('valor_enviado', dados.valor)
          rec.set('status_http', dados.status)
          rec.set('sucesso', dados.sucesso)
          rec.set('mensagem', String(dados.mensagem || '').slice(0, 500))
          $app.save(rec)
        } catch (_) {}
      }

      const resultados = []
      for (let i = 0; i < itens.length; i++) {
        const anuncioId = String((itens[i] && itens[i].anuncio_id) || '')
        const variacaoId = String((itens[i] && itens[i].variacao_id) || '')
        const res = {
          anuncio_id: anuncioId,
          variacao_id: variacaoId,
          estoque: null,
          preco: null,
          ok_estoque: null,
          ok_preco: null,
          mensagem: '',
        }
        resultados.push(res)
        if (!/^[0-9]{1,20}$/.test(anuncioId) || (variacaoId && !/^[0-9]{1,20}$/.test(variacaoId))) {
          res.mensagem = 'Código de anúncio inválido.'
          continue
        }
        let vinc = null
        try {
          vinc = $app.findFirstRecordByFilter(
            'produtos_vinculos_anuncios',
            "assinante_id = '" +
              ctx.assinanteId +
              "' && empresa_id = '" +
              empresa.id +
              "' && marketplace = 'tray' && anuncio_id = '" +
              anuncioId +
              "' && variacao_id = '" +
              variacaoId +
              "'",
          )
        } catch (_) {
          vinc = null
        }
        if (!vinc) {
          res.mensagem = 'Anúncio sem vínculo com produto do Trevvo.'
          continue
        }
        let produto = null
        try {
          produto = $app.findRecordById('produtos', vinc.getString('produto_id'))
        } catch (_) {
          produto = null
        }
        if (!produto) {
          res.mensagem = 'Produto do vínculo não encontrado.'
          continue
        }
        let unidades = parseInt(String(vinc.getFloat('unidades') || 1), 10)
        if (!unidades || unidades < 1) unidades = 1

        if (enviarEstoque) {
          let saldo = saldoDe(empresa.id, produto.id)
          for (let j = 0; j < descontar.length; j++) {
            const s = saldoDe(descontar[j], produto.id)
            if (s < 0) saldo += s
          }
          let estoque = produto.getBool('ativo') ? Math.floor(saldo / unidades) : 0
          if (!(estoque > 0)) estoque = 0
          res.estoque = estoque
          const corpoEst = variacaoId
            ? { variation_id: parseInt(variacaoId, 10), stock: estoque }
            : { product_id: parseInt(anuncioId, 10), stock: estoque }
          const rEst = chamarTray(
            'PUT',
            '/multicd/distribution-centers/' + cdId + '/stock',
            corpoEst,
          )
          res.ok_estoque = rEst.status === 200 || rEst.status === 201
          if (!res.ok_estoque) res.mensagem = 'Estoque: ' + mensagemErroTray(rEst)
          registrarLog({
            anuncio_id: anuncioId,
            variacao_id: variacaoId,
            produto_id: produto.id,
            tipo: 'estoque',
            valor: estoque,
            status: rEst.status,
            sucesso: res.ok_estoque,
            mensagem: res.ok_estoque ? '' : mensagemErroTray(rEst),
          })
        }

        if (enviarPreco) {
          const precoFixo = vinc.getFloat('preco_anuncio') || 0
          const preco = precoFixo > 0 ? arred2(precoFixo) : arred2(precoDaLoja(produto) * unidades)
          res.preco = preco
          if (!(preco > 0)) {
            res.ok_preco = false
            res.mensagem = (res.mensagem ? res.mensagem + ' | ' : '') + 'Preço zerado: não enviado.'
          } else {
            const rPre = variacaoId
              ? chamarTray('PUT', '/products/variants/' + variacaoId, {
                  Variant: { price: preco.toFixed(2) },
                })
              : chamarTray('PUT', '/products/' + anuncioId, {
                  Product: { price: preco.toFixed(2) },
                })
            res.ok_preco = rPre.status === 200 || rPre.status === 201
            if (!res.ok_preco) {
              res.mensagem =
                (res.mensagem ? res.mensagem + ' | ' : '') + 'Preço: ' + mensagemErroTray(rPre)
            }
            registrarLog({
              anuncio_id: anuncioId,
              variacao_id: variacaoId,
              produto_id: produto.id,
              tipo: 'preco',
              valor: preco,
              status: rPre.status,
              sucesso: res.ok_preco,
              mensagem: res.ok_preco ? '' : mensagemErroTray(rPre),
            })
          }
        }
      }

      return c.json(200, { sucesso: true, cd_id: cdId, resultados: resultados })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao enviar para a Tray.',
      })
    }
  },
  $apis.requireAuth(),
)
