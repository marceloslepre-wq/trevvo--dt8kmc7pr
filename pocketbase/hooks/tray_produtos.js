/// <reference path="../types.d.ts" />

/**
 * tray_produtos.js — Etapa 11 / Parte 11.2
 *
 * Conferência SOMENTE LEITURA dos produtos da loja Tray conectada. Lê os produtos e, para os que
 * têm variação, cada variação (código, referência, estoque e preço), e compara a referência com o
 * campo `referencia` dos produtos do Trevvo.
 * Não grava nada na Tray e não altera produtos, estoque ou vendas no Trevvo.
 * (A única gravação possível é a renovação do token da própria conta, quando está para vencer.)
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; rotas sem parâmetro de caminho.
 *
 * Rota:
 *   GET /backend/v1/tray/produtos/conferencia?empresa_id=&pagina=1&limite=10   (autenticada)
 */
routerAdd(
  'GET',
  '/backend/v1/tray/produtos/conferencia',
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

    // Busca produtos do assinante pela referência (matrícula). Devolve lista resumida.
    function produtosPorReferencia(assinanteId, ref) {
      if (!ref) return []
      // Só consulta quando a referência tem caracteres seguros para o filtro.
      if (!/^[A-Za-z0-9._\-\/ ]{1,60}$/.test(ref)) return []
      try {
        const recs = $app.findRecordsByFilter(
          'produtos',
          "assinante_id = '" + assinanteId + "' && referencia = '" + ref + "'",
          'codigo',
          5,
          0,
        )
        const out = []
        for (let i = 0; i < recs.length; i++) {
          out.push({
            codigo: recs[i].getString('codigo'),
            descricao: recs[i].getString('descricao'),
            ativo: recs[i].getBool('ativo'),
          })
        }
        return out
      } catch (_) {
        return []
      }
    }

    function texto(v, max) {
      if (v === null || v === undefined) return ''
      return String(v).trim().slice(0, max || 200)
    }

    function numero(v) {
      const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'))
      return isNaN(n) ? 0 : n
    }

    // A Tray devolve listas como [{ Product: {...} }] ou [{ Variant: {...} }]; aceita também sem o invólucro.
    function desembrulhar(item, chave) {
      if (item && item[chave] && typeof item[chave] === 'object') return item[chave]
      return item || {}
    }

    // Ex.: [{ type: 'Tamanho', value: 'M' }, { type: 'Cor', value: 'Bege' }] -> "Tamanho: M / Cor: Bege"
    function descreverVariacao(v) {
      const partes = []
      const sku = v.Sku || v.sku || []
      if (sku && sku.length) {
        for (let i = 0; i < sku.length; i++) {
          const s = sku[i] || {}
          const tipo = texto(s.type, 40)
          const valor = texto(s.value, 60)
          if (valor) partes.push(tipo ? tipo + ': ' + valor : valor)
        }
      }
      return partes.join(' / ')
    }

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
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
      if (limite > 25) limite = 25

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

      // Somente GET. Nunca registrar a URL em log (contém o token).
      function lerTray(caminho) {
        const res = $http.send({
          method: 'GET',
          url: api + caminho + (caminho.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + token,
          headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
          timeout: 25,
        })
        return { status: res.statusCode, dados: lerJson(res) }
      }

      const rp = lerTray('/products?limit=' + limite + '&page=' + pagina)
      if (rp.status !== 200) {
        return c.json(400, { sucesso: false, mensagem: mensagemErroTray(rp) })
      }
      const lista = (rp.dados && (rp.dados.Products || rp.dados.products)) || []
      const pag = (rp.dados && rp.dados.paging) || {}
      const total = parseInt(String(pag.total || lista.length), 10) || lista.length

      const linhas = []
      const falhas = []
      let camposProduto = []
      let camposVariacao = []

      for (let i = 0; i < lista.length; i++) {
        const p = desembrulhar(lista[i], 'Product')
        if (i === 0) camposProduto = Object.keys(p).slice(0, 80)
        const produtoId = texto(p.id, 40)
        const nome = texto(p.name, 200)
        const refProduto = texto(p.reference, 60)
        const ativo = String(p.available) === '1' || p.available === true
        const idsVar = p.Variant || p.variant || []
        const temVariacao =
          (idsVar && idsVar.length > 0) || String(p.has_variation) === '1' || p.has_variation === true

        let variacoes = []
        if (temVariacao && /^[0-9]{1,20}$/.test(produtoId)) {
          const rv = lerTray('/products/variants?product_id=' + produtoId + '&limit=50')
          if (rv.status === 200) {
            const lv = (rv.dados && (rv.dados.Variants || rv.dados.variants)) || []
            for (let j = 0; j < lv.length; j++) {
              const v = desembrulhar(lv[j], 'Variant')
              if (camposVariacao.length === 0) camposVariacao = Object.keys(v).slice(0, 80)
              variacoes.push(v)
            }
          } else {
            falhas.push({ produto_id: produtoId, motivo: mensagemErroTray(rv) })
          }
        }

        // Referência repetida em mais de uma variação do mesmo produto: o pedido não distingue qual foi vendida.
        const contagem = {}
        for (let j = 0; j < variacoes.length; j++) {
          const r0 = texto(variacoes[j].reference, 60)
          if (r0) contagem[r0] = (contagem[r0] || 0) + 1
        }

        const itens = []
        if (variacoes.length === 0) {
          itens.push({
            variacao_id: '',
            variacao: '',
            referencia: refProduto,
            estoque: numero(p.stock),
            preco: numero(p.price),
            repetida: false,
          })
        } else {
          for (let j = 0; j < variacoes.length; j++) {
            const v = variacoes[j]
            const rf = texto(v.reference, 60)
            itens.push({
              variacao_id: texto(v.id, 40),
              variacao: descreverVariacao(v),
              referencia: rf,
              estoque: numero(v.stock),
              preco: numero(v.price),
              repetida: !!(rf && contagem[rf] > 1),
            })
          }
        }

        for (let j = 0; j < itens.length; j++) {
          const it = itens[j]
          const achados = produtosPorReferencia(ctx.assinanteId, it.referencia)
          let situacao = 'OK'
          if (!it.referencia) situacao = 'Sem referência na Tray'
          else if (it.repetida) situacao = 'Referência repetida entre variações'
          else if (achados.length === 0) situacao = 'Sem produto no Trevvo'
          else if (achados.length > 1) situacao = 'Referência duplicada no Trevvo'
          else if (!achados[0].ativo) situacao = 'Produto inativo no Trevvo'

          linhas.push({
            produto_id: produtoId,
            nome: nome,
            ativo_na_tray: ativo,
            referencia_produto: refProduto,
            variacao_id: it.variacao_id,
            variacao: it.variacao,
            // Código usado nos anúncios do Mercado Livre: produto ou produto_variação.
            codigo_tray: it.variacao_id ? produtoId + '_' + it.variacao_id : produtoId,
            referencia: it.referencia,
            estoque: it.estoque,
            preco: it.preco,
            situacao: situacao,
            produto_codigo: achados.length === 1 ? achados[0].codigo : '',
            produto_descricao: achados.length === 1 ? achados[0].descricao : '',
          })
        }
      }

      const temMais = lista.length > 0 && pagina * limite < total
      return c.json(200, {
        sucesso: true,
        pagina: pagina,
        limite: limite,
        total_produtos: total,
        produtos_nesta_pagina: lista.length,
        proxima_pagina: temMais ? pagina + 1 : null,
        linhas: linhas,
        falhas: falhas,
        // Nomes dos campos devolvidos pela Tray (sem valores), para conferência do formato.
        campos_produto: camposProduto,
        campos_variacao: camposVariacao,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao ler os produtos da Tray.',
      })
    }
  },
  $apis.requireAuth(),
)
