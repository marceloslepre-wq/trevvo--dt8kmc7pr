/// <reference path="../types.d.ts" />

/**
 * mercadolivre_auditoria.js — Etapa 10 / Parte 10.5a
 *
 * Auditoria SOMENTE LEITURA dos anúncios da conta conectada. Lê os anúncios no Mercado Livre,
 * abre cada variação e compara o SKU gravado nela com o campo `referencia` dos produtos do Trevvo.
 * Não grava nada no Mercado Livre e não altera produtos, estoque ou vendas no Trevvo.
 * (A única gravação possível é a renovação do token da própria conta, quando está para vencer.)
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo.
 *
 * Rota:
 *   GET /backend/v1/mercadolivre/anuncios/auditoria?empresa_id=&offset=0&limite=10   (autenticada)
 */
routerAdd(
  'GET',
  '/backend/v1/mercadolivre/anuncios/auditoria',
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

    // Busca produtos do assinante pela referência (matrícula). Devolve lista resumida.
    function produtosPorReferencia(assinanteId, sku) {
      if (!sku) return []
      // Só consulta quando o SKU tem caracteres seguros para o filtro.
      if (!/^[A-Za-z0-9._\-\/ ]{1,60}$/.test(sku)) return []
      try {
        const recs = $app.findRecordsByFilter(
          'produtos',
          "assinante_id = '" + assinanteId + "' && referencia = '" + sku + "'",
          'codigo',
          5,
          0,
        )
        const out = []
        for (let i = 0; i < recs.length; i++) {
          out.push({
            id: recs[i].id,
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

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())

      let offset = parseInt(q['offset'], 10) || 0
      if (offset < 0) offset = 0
      let limite = parseInt(q['limite'], 10) || 10
      if (limite < 1) limite = 1
      if (limite > 15) limite = 15

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

      const busca = chamarML(
        '/users/' + mlUserId + '/items/search?offset=' + offset + '&limit=' + limite,
        token,
      )
      if (busca.status !== 200) {
        return c.json(400, {
          sucesso: false,
          mensagem: 'Falha ao listar anúncios. ' + mensagemErroML(busca),
        })
      }
      const ids = (busca.dados && busca.dados.results) || []
      const total = (busca.dados && busca.dados.paging && busca.dados.paging.total) || 0

      const linhas = []
      const falhas = []
      for (let i = 0; i < ids.length; i++) {
        const itemId = String(ids[i]).replace(/[^A-Za-z0-9]/g, '')
        if (!itemId) continue
        const r = chamarML('/items/' + itemId + '?include_attributes=all', token)
        if (r.status !== 200 || !r.dados) {
          falhas.push({ anuncio_id: itemId, erro: mensagemErroML(r) })
          continue
        }
        const item = r.dados
        const variacoes = item.variations || []
        const base = {
          anuncio_id: itemId,
          titulo: String(item.title || ''),
          status_anuncio: String(item.status || ''),
          link: String(item.permalink || ''),
          user_product_id: String(item.user_product_id || ''),
          familia: String(item.family_name || ''),
          tem_variacoes: variacoes.length > 0,
        }

        const doItem = []
        if (variacoes.length === 0) {
          const sku =
            skuDosAtributos(item.attributes) || String(item.seller_custom_field || '').trim()
          doItem.push({
            variacao_id: '',
            variacao: '',
            sku: sku,
            estoque_ml: parseInt(item.available_quantity, 10) || 0,
            preco_ml: Number(item.price) || 0,
          })
        } else {
          for (let v = 0; v < variacoes.length; v++) {
            const va = variacoes[v] || {}
            const sku =
              skuDosAtributos(va.attributes) || String(va.seller_custom_field || '').trim()
            doItem.push({
              variacao_id: String(va.id || ''),
              variacao: descreverVariacao(va),
              sku: sku,
              estoque_ml: parseInt(va.available_quantity, 10) || 0,
              preco_ml: Number(va.price || item.price) || 0,
            })
          }
        }

        // SKU repetido dentro do mesmo anúncio = duas variações apontando para a mesma matrícula.
        const contagem = {}
        for (let k = 0; k < doItem.length; k++) {
          if (doItem[k].sku) contagem[doItem[k].sku] = (contagem[doItem[k].sku] || 0) + 1
        }

        for (let k = 0; k < doItem.length; k++) {
          const d = doItem[k]
          const produtos = produtosPorReferencia(ctx.assinanteId, d.sku)
          let situacao = 'OK'
          if (!d.sku) situacao = 'SKU vazio'
          else if (contagem[d.sku] > 1) situacao = 'SKU repetido no anúncio'
          else if (produtos.length === 0) situacao = 'Sem produto no Trevvo'
          else if (produtos.length > 1) situacao = 'Referência duplicada no Trevvo'
          else if (!produtos[0].ativo) situacao = 'Produto inativo no Trevvo'

          linhas.push({
            anuncio_id: base.anuncio_id,
            titulo: base.titulo,
            status_anuncio: base.status_anuncio,
            link: base.link,
            user_product_id: base.user_product_id,
            familia: base.familia,
            tem_variacoes: base.tem_variacoes,
            variacao_id: d.variacao_id,
            variacao: d.variacao,
            sku: d.sku,
            estoque_ml: d.estoque_ml,
            preco_ml: d.preco_ml,
            situacao: situacao,
            produto_codigo: produtos.length === 1 ? produtos[0].codigo : '',
            produto_descricao: produtos.length === 1 ? produtos[0].descricao : '',
          })
        }
      }

      const proximo = offset + ids.length
      return c.json(200, {
        sucesso: true,
        somente_leitura: true,
        total_anuncios: total,
        offset: offset,
        anuncios_nesta_pagina: ids.length,
        proximo_offset: proximo < total && ids.length > 0 ? proximo : null,
        linhas: linhas,
        falhas: falhas,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha na auditoria de anúncios.',
      })
    }
  },
  $apis.requireAuth(),
)
