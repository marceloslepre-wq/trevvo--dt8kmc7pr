/// <reference path="../types.d.ts" />

/**
 * tray_pedidos.js — Integração Tray / pedidos (SOMENTE LEITURA)
 *
 * Lê os últimos pedidos da loja Tray conectada e monta a PRÉVIA de como cada um entraria no
 * Trevvo como pedido de venda da empresa (loja 02): cliente achado pelo CPF/CNPJ, itens achados
 * pelo vínculo do anúncio (produtos_vinculos_anuncios, marketplace 'tray') já convertidos em
 * unidades do produto (caixa/kit x unidades), frete, desconto e total.
 * Não grava nada na Tray nem no Trevvo (só renova o token da conta quando está para vencer).
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; rotas sem parâmetro de caminho;
 * sem spread de objeto.
 *
 * Rota:
 *   GET /backend/v1/tray/pedidos/conferencia?empresa_id=&pagina=1&limite=10   (administrador)
 */
routerAdd(
  'GET',
  '/backend/v1/tray/pedidos/conferencia',
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

    function texto(v, max) {
      if (v === null || v === undefined) return ''
      return String(v)
        .trim()
        .slice(0, max || 200)
    }

    function numero(v) {
      const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'))
      return isNaN(n) ? 0 : n
    }

    function arred(v) {
      return Math.round(v * 100) / 100
    }

    function desembrulhar(item, chave) {
      if (item && item[chave] && typeof item[chave] === 'object') return item[chave]
      return item || {}
    }

    function comoLista(v) {
      if (!v) return []
      if (Array.isArray(v)) return v
      if (typeof v === 'object') return [v]
      return []
    }

    function soDigitos(v) {
      return String(v || '').replace(/[^0-9]/g, '')
    }

    function formatarDoc(d) {
      if (d.length === 11) {
        return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9)
      }
      if (d.length === 14) {
        return (
          d.slice(0, 2) +
          '.' +
          d.slice(2, 5) +
          '.' +
          d.slice(5, 8) +
          '/' +
          d.slice(8, 12) +
          '-' +
          d.slice(12)
        )
      }
      return d
    }

    // Cliente do Trevvo pelo CPF/CNPJ (gravado só com dígitos na importação; aceita também formatado)
    function clientePorDocumento(assinanteId, doc) {
      if (!doc || (doc.length !== 11 && doc.length !== 14)) return null
      try {
        const recs = $app.findRecordsByFilter(
          'clientes',
          "assinante_id = '" +
            assinanteId +
            "' && (cpf_cnpj = '" +
            doc +
            "' || cpf_cnpj = '" +
            formatarDoc(doc) +
            "')",
          'codigo',
          2,
          0,
        )
        if (recs && recs.length > 0) {
          return {
            id: recs[0].id,
            codigo: recs[0].getString('codigo'),
            nome: recs[0].getString('nome_razao_social') || recs[0].getString('nome'),
            duplicado: recs.length > 1,
          }
        }
      } catch (_) {}
      return null
    }

    // Vínculos Tray da empresa, por "anuncio|variacao" (lidos uma vez por chamada)
    function carregarVinculos(empresaId) {
      const mapa = {}
      try {
        const recs = $app.findRecordsByFilter(
          'produtos_vinculos_anuncios',
          "empresa_id = '" + empresaId + "' && marketplace = 'tray'",
          '',
          10000,
          0,
        )
        for (let i = 0; i < recs.length; i++) {
          const k = recs[i].getString('anuncio_id') + '|' + recs[i].getString('variacao_id')
          if (!mapa[k]) mapa[k] = []
          mapa[k].push({
            produto_id: recs[i].getString('produto_id'),
            unidades: recs[i].getFloat('unidades') || 1,
          })
        }
      } catch (_) {}
      return mapa
    }

    const cacheProdutos = {}
    function produtoPorId(id) {
      if (cacheProdutos[id] !== undefined) return cacheProdutos[id]
      let out = null
      try {
        const r = $app.findRecordById('produtos', id)
        out = {
          id: r.id,
          codigo: r.getString('codigo'),
          descricao: r.getString('descricao'),
          ativo: r.getBool('ativo'),
        }
      } catch (_) {}
      cacheProdutos[id] = out
      return out
    }

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Somente administradores podem ver os pedidos da Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
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

      let pagina = parseInt(String(q['pagina'] || '1'), 10)
      if (isNaN(pagina) || pagina < 1) pagina = 1
      let limite = parseInt(String(q['limite'] || '10'), 10)
      if (isNaN(limite) || limite < 1) limite = 10
      if (limite > 20) limite = 20

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

      // Somente GET. Nunca registrar a URL em log (contém o token).
      // Respeita o limite de 180/min e tenta de novo em HTTP 429 (1 s, 2 s, 4 s, 8 s).
      function lerTray(caminho) {
        const esperas429 = [1000, 2000, 4000, 8000]
        for (let t = 0; t < esperas429.length; t++) {
          aguardarLimiteTray(api)
          const r0 = $http.send({
            method: 'GET',
            url: api + caminho + (caminho.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + token,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Trevvo-ERP/1.0',
            },
            timeout: 25,
          })
          if (r0.statusCode !== 429) return { status: r0.statusCode, dados: lerJson(r0) }
          sleep(esperas429[t])
        }
        aguardarLimiteTray(api)
        const res = $http.send({
          method: 'GET',
          url: api + caminho + (caminho.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + token,
          headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
          timeout: 25,
        })
        return { status: res.statusCode, dados: lerJson(res) }
      }

      const rl = lerTray('/orders?sort=id_desc&limit=' + limite + '&page=' + pagina)
      if (rl.status !== 200) {
        return c.json(400, { sucesso: false, mensagem: mensagemErroTray(rl) })
      }
      const lista = (rl.dados && (rl.dados.Orders || rl.dados.orders)) || []
      const pag = (rl.dados && rl.dados.paging) || {}
      const total = parseInt(String(pag.total || lista.length), 10) || lista.length

      const vinculos = carregarVinculos(empresa.id)
      const pedidos = []
      const falhas = []
      let camposPedido = []
      let camposItem = []
      let camposCliente = []

      for (let i = 0; i < lista.length; i++) {
        const resumo = desembrulhar(lista[i], 'Order')
        const pedidoId = texto(resumo.id, 20)
        if (!/^[0-9]{1,20}$/.test(pedidoId)) continue

        const rc = lerTray('/orders/' + pedidoId + '/complete')
        if (rc.status !== 200) {
          falhas.push({ pedido_id: pedidoId, motivo: mensagemErroTray(rc) })
          continue
        }
        const o = desembrulhar(rc.dados, 'Order')
        if (camposPedido.length === 0) camposPedido = Object.keys(o).slice(0, 120)

        // ---- Cliente ----
        const cli = desembrulhar(o.Customer || o.customer || {}, 'Customer')
        if (camposCliente.length === 0) camposCliente = Object.keys(cli).slice(0, 80)
        const cnpj = soDigitos(cli.cnpj)
        const cpf = soDigitos(cli.cpf)
        const doc = cnpj.length === 14 ? cnpj : cpf
        const achado = clientePorDocumento(ctx.assinanteId, doc)
        const enderecos = comoLista(cli.CustomerAddresses || cli.CustomerAddress)
        let cidade = texto(cli.city, 80)
        let uf = texto(cli.state, 2)
        if ((!cidade || !uf) && enderecos.length > 0) {
          const e0 = desembrulhar(enderecos[0], 'CustomerAddress')
          cidade = cidade || texto(e0.city, 80)
          uf = uf || texto(e0.state, 2)
        }

        // ---- Itens ----
        const vendidos = comoLista(o.ProductsSold || o.products_sold)
        const itens = []
        let itensOk = 0
        for (let j = 0; j < vendidos.length; j++) {
          const it = desembrulhar(vendidos[j], 'ProductsSold')
          if (camposItem.length === 0) camposItem = Object.keys(it).slice(0, 80)
          const anuncio = texto(it.product_id, 20)
          let variacao = texto(it.variant_id, 20)
          if (variacao === '0') variacao = ''
          const qtd = numero(it.quantity)
          const preco = numero(it.price)
          const lv = vinculos[anuncio + '|' + variacao] || []
          let situacao = 'OK'
          let prod = null
          let unidades = 1
          if (lv.length === 0) situacao = 'Sem vínculo'
          else if (lv.length > 1) situacao = 'Mais de um produto vinculado'
          else {
            prod = produtoPorId(lv[0].produto_id)
            unidades = lv[0].unidades > 0 ? lv[0].unidades : 1
            if (!prod) situacao = 'Produto do vínculo não existe'
            else if (!prod.ativo) situacao = 'Produto inativo no Trevvo'
          }
          if (situacao === 'OK') itensOk++
          itens.push({
            anuncio_id: anuncio,
            variacao_id: variacao,
            nome: texto(it.name, 200),
            referencia: texto(it.reference, 60),
            quantidade: qtd,
            preco: preco,
            unidades: unidades,
            produto_codigo: prod ? prod.codigo : '',
            produto_descricao: prod ? prod.descricao : '',
            quantidade_trevvo: arred(qtd * unidades),
            preco_unitario_trevvo:
              unidades > 0 ? Math.round((preco / unidades) * 10000) / 10000 : 0,
            situacao: situacao,
          })
        }

        const pagamentos = comoLista(o.Payment || o.payment)
        let formaPagamento = texto(o.payment_form, 80)
        if (!formaPagamento && pagamentos.length > 0) {
          const p0 = desembrulhar(pagamentos[0], 'Payment')
          formaPagamento = texto(p0.method || p0.payment_method, 80)
        }

        pedidos.push({
          pedido_id: pedidoId,
          data: texto(o.date, 10),
          hora: texto(o.hour, 8),
          status: texto(o.status, 60),
          canal: texto(o.point_sale, 60),
          codigo_externo: texto(o.external_code, 60),
          cliente_nome: texto(cli.name || cli.company_name, 120),
          cliente_documento: doc,
          cliente_cidade: cidade,
          cliente_uf: uf,
          cliente_trevvo_codigo: achado ? achado.codigo : '',
          cliente_trevvo_nome: achado ? achado.nome : '',
          cliente_situacao: !doc
            ? 'Sem CPF/CNPJ no pedido'
            : achado
              ? achado.duplicado
                ? 'CPF/CNPJ repetido no Trevvo'
                : 'Cliente encontrado'
              : 'Cliente novo',
          forma_pagamento: formaPagamento,
          envio: texto(o.shipment, 80),
          subtotal: numero(o.partial_total),
          frete: numero(o.shipment_value),
          desconto: numero(o.discount),
          total: numero(o.total),
          itens: itens,
          itens_ok: itensOk,
          pronto: itens.length > 0 && itensOk === itens.length,
        })
      }

      const temMais = lista.length > 0 && pagina * limite < total
      return c.json(200, {
        sucesso: true,
        pagina: pagina,
        limite: limite,
        total_pedidos: total,
        proxima_pagina: temMais ? pagina + 1 : null,
        pedidos: pedidos,
        falhas: falhas,
        // Nomes dos campos devolvidos pela Tray (sem valores), para conferir o formato.
        campos_pedido: camposPedido,
        campos_item: camposItem,
        campos_cliente: camposCliente,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao ler os pedidos da Tray.',
      })
    }
  },
  $apis.requireAuth(),
)
