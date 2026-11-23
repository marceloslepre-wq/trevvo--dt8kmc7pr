/// <reference path="../types.d.ts" />

/**
 * tray_midia.js — importa descrição e imagens dos produtos da Tray para o Trevvo.
 *
 * Lê os produtos da loja Tray conectada (uma página por chamada), e para cada produto ou variação
 * encontra o produto do Trevvo (código = referência da Tray; senão referencia = código da Tray) e
 * grava: descricao_site (HTML limpo), foto + até 5 fotos adicionais (baixadas e guardadas no
 * Trevvo), e peso/medidas quando estiverem vazios. Não grava nada na Tray.
 * Por padrão não substitui descrição nem fotos que o produto já tem (body.sobrescrever = true
 * para substituir). body.simular = true só mostra o que seria feito.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; rotas sem parâmetro de caminho;
 * sem spread de objetos.
 *
 * Rota:
 *   POST /backend/v1/tray/produtos/importar-midia
 *     body: { empresa_id, pagina = 1, limite = 5 (máx. 10), sobrescrever = false, simular = false }
 *   (administradores)
 */
routerAdd(
  'POST',
  '/backend/v1/tray/produtos/importar-midia',
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

    // Produtos do Trevvo que correspondem a um item da Tray. A referência da Tray é a matrícula
    // do Uniplus (= CÓDIGO no Trevvo). Se não achar, tenta o campo referencia do Trevvo, que
    // desde 21/11/2026 guarda o código da Tray (produto ou produto_variação).
    function alvosNoTrevvo(assinanteId, refTray, codigoTray) {
      const vistos = {}
      const out = []
      function juntar(recs) {
        for (let i = 0; i < recs.length; i++) {
          if (!vistos[recs[i].id]) {
            vistos[recs[i].id] = true
            out.push(recs[i])
          }
        }
      }
      if (refTray && /^[0-9]{1,12}$/.test(refTray)) {
        try {
          juntar(
            $app.findRecordsByFilter(
              'produtos',
              "assinante_id = '" + assinanteId + "' && codigo = " + parseInt(refTray, 10),
              'codigo',
              5,
              0,
            ),
          )
        } catch (_) {}
      }
      if (out.length === 0 && codigoTray && /^[0-9_]{1,40}$/.test(codigoTray)) {
        try {
          juntar(
            $app.findRecordsByFilter(
              'produtos',
              "assinante_id = '" + assinanteId + "' && referencia = '" + codigoTray + "'",
              'codigo',
              5,
              0,
            ),
          )
        } catch (_) {}
      }
      return out
    }

    // Remove o que não pode ir para uma descrição de produto (scripts, iframes, eventos on*).
    function limparHtml(html) {
      let s = String(html || '')
      s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
      s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      s = s.replace(/<(script|iframe|object|embed)[^>]*>/gi, '')
      s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      s = s.replace(/javascript:/gi, '')
      return s.trim().slice(0, 100000)
    }

    // Lista de URLs https das imagens de um produto ou variação da Tray, na ordem da loja.
    function urlsDeImagens(obj, chave) {
      const lista = (obj && (obj[chave] || obj[chave.toLowerCase()])) || []
      const urls = []
      for (let i = 0; i < lista.length; i++) {
        const im = lista[i] || {}
        let u = String(im.https || im.http || im.url || '').trim()
        if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7)
        if (/^https:\/\/[^\s"'<>]+$/.test(u) && urls.indexOf(u) < 0) urls.push(u)
      }
      return urls
    }

    const LIMITE_ARQUIVO = 2097152 // 2 MB, mesmo limite dos campos foto e fotos_adicionais

    try {
      const body = c.requestInfo().body || {}
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Apenas administradores podem importar descrição e imagens da Tray.',
        })
      }
      const empresa = exigirEmpresa(ctx, String(body['empresa_id'] || '').trim())
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

      let pagina = parseInt(String(body['pagina'] || '1'), 10)
      if (isNaN(pagina) || pagina < 1) pagina = 1
      let limite = parseInt(String(body['limite'] || '5'), 10)
      if (isNaN(limite) || limite < 1) limite = 5
      if (limite > 10) limite = 10
      const sobrescrever = body['sobrescrever'] === true
      const simular = body['simular'] === true

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

      // Baixa uma imagem uma única vez; devolve os bytes (ou null) para gravar em vários produtos.
      const cacheImagens = {}
      function baixarImagem(url) {
        if (cacheImagens[url] !== undefined) return cacheImagens[url]
        let out = null
        try {
          const r = $http.send({
            method: 'GET',
            url: url,
            headers: { 'User-Agent': 'Trevvo-ERP/1.0' },
            timeout: 30,
          })
          if (r.statusCode === 200 && r.body && r.body.length > 0) {
            out = { bytes: r.body, tamanho: r.body.length, url: url }
          } else if (r.statusCode === 200) {
            // Versões antigas do PocketBase não expõem os bytes em r.body: baixa pelo arquivo.
            out = { bytes: null, tamanho: 0, url: url }
          }
        } catch (_) {
          out = null
        }
        cacheImagens[url] = out
        return out
      }

      function nomeArquivo(url, prefixo, n) {
        let ext = 'jpg'
        const m = /\.(jpe?g|png|webp|gif)(\?|$)/i.exec(url)
        if (m) ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
        return prefixo + '_' + n + '.' + ext
      }

      const rp = lerTray('/products?limit=' + limite + '&page=' + pagina)
      if (rp.status !== 200) {
        return c.json(400, { sucesso: false, mensagem: mensagemErroTray(rp) })
      }
      const lista = (rp.dados && (rp.dados.Products || rp.dados.products)) || []
      const pag = (rp.dados && rp.dados.paging) || {}
      const total = parseInt(String(pag.total || lista.length), 10) || lista.length

      const linhas = []
      const agoraIso = new Date().toISOString()

      for (let i = 0; i < lista.length; i++) {
        const resumido = desembrulhar(lista[i], 'Product')
        const produtoId = texto(resumido.id, 40)
        const nome = texto(resumido.name, 200)
        if (!/^[0-9]{1,20}$/.test(produtoId)) continue

        // Detalhe do produto (descrição completa, imagens, peso e medidas).
        let p = resumido
        const rd = lerTray('/products/' + produtoId)
        if (rd.status === 200) {
          p = desembrulhar(rd.dados, 'Product')
        } else {
          linhas.push({
            produto_tray: produtoId,
            nome: nome,
            variacao: '',
            referencia: '',
            produtos_trevvo: '',
            descricao: '',
            imagens: 0,
            situacao: 'Erro',
            observacao: mensagemErroTray(rd),
          })
          continue
        }

        const descricao = limparHtml(p.description || '')
        const imagensProduto = urlsDeImagens(p, 'ProductImage')
        const pesoKg = numero(p.weight) > 0 ? numero(p.weight) / 1000 : 0
        const altura = numero(p.height)
        const largura = numero(p.width)
        const comprimento = numero(p.length)

        // Itens a atualizar: o próprio produto ou cada variação (cada variação é um produto no Trevvo).
        const itens = []
        const idsVar = p.Variant || p.variant || []
        const temVariacao =
          (idsVar && idsVar.length > 0) ||
          String(p.has_variation) === '1' ||
          p.has_variation === true
        if (temVariacao) {
          const rv = lerTray('/products/variants?product_id=' + produtoId + '&limit=50')
          const lv =
            rv.status === 200 ? (rv.dados && (rv.dados.Variants || rv.dados.variants)) || [] : []
          for (let j = 0; j < lv.length; j++) {
            const v = desembrulhar(lv[j], 'Variant')
            const imgsVar = urlsDeImagens(v, 'VariantImage')
            itens.push({
              variacao: descreverVariacao(v),
              referencia: texto(v.reference, 60),
              codigo_tray: produtoId + '_' + texto(v.id, 40),
              // Fotos da variação primeiro; depois as do produto, sem repetir.
              imagens: imgsVar.concat(imagensProduto.filter((u) => imgsVar.indexOf(u) < 0)),
              peso: numero(v.weight) > 0 ? numero(v.weight) / 1000 : pesoKg,
            })
          }
        }
        // Produto sem variação, ou com variações que a Tray não devolveu: usa o próprio produto.
        if (itens.length === 0) {
          itens.push({
            variacao: '',
            referencia: texto(p.reference, 60),
            codigo_tray: produtoId,
            imagens: imagensProduto,
            peso: pesoKg,
          })
        }

        for (let j = 0; j < itens.length; j++) {
          const it = itens[j]
          const alvos = alvosNoTrevvo(ctx.assinanteId, it.referencia, it.codigo_tray)
          const linha = {
            produto_tray: it.codigo_tray,
            nome: nome,
            variacao: it.variacao,
            referencia: it.referencia,
            produtos_trevvo: '',
            descricao: '',
            imagens: 0,
            situacao: '',
            observacao: '',
          }
          if (alvos.length === 0) {
            linha.situacao = 'Sem produto no Trevvo'
            linhas.push(linha)
            continue
          }
          const codigos = []
          for (let k = 0; k < alvos.length; k++) codigos.push(alvos[k].getString('codigo'))
          linha.produtos_trevvo = codigos.join(', ')

          for (let k = 0; k < alvos.length; k++) {
            const prod = alvos[k]
            const obs = []
            let mudou = false

            // Descrição
            if (descricao && (sobrescrever || !prod.getString('descricao_site'))) {
              if (!simular) prod.set('descricao_site', descricao)
              linha.descricao = 'Importada'
              mudou = true
            } else if (!descricao) {
              linha.descricao = 'Tray sem descrição'
            } else {
              linha.descricao = 'Mantida (já tinha)'
            }

            // Imagens: a primeira vira a foto principal, as 5 seguintes as adicionais.
            const jaTemFoto = !!prod.getString('foto')
            if (it.imagens.length > 0 && (sobrescrever || !jaTemFoto)) {
              const arquivos = []
              let grandes = 0
              let falhas = 0
              for (let n = 0; n < it.imagens.length && arquivos.length < 6; n++) {
                const img = simular ? { bytes: null, tamanho: 1 } : baixarImagem(it.imagens[n])
                if (!img) {
                  falhas++
                  continue
                }
                if (img.tamanho > LIMITE_ARQUIVO) {
                  grandes++
                  continue
                }
                if (simular) {
                  arquivos.push(null)
                  continue
                }
                let arq = null
                try {
                  if (img.bytes) {
                    arq = $filesystem.fileFromBytes(
                      img.bytes,
                      nomeArquivo(it.imagens[n], 'tray_' + it.codigo_tray, arquivos.length + 1),
                    )
                  } else {
                    arq = $filesystem.fileFromURL(img.url, 30)
                    if (arq && arq.size > LIMITE_ARQUIVO) {
                      grandes++
                      continue
                    }
                  }
                } catch (_) {
                  arq = null
                }
                if (!arq) {
                  falhas++
                  continue
                }
                arquivos.push(arq)
              }
              if (arquivos.length > 0) {
                if (!simular) {
                  prod.set('foto', arquivos[0])
                  const extras = []
                  for (let n = 1; n < arquivos.length; n++) extras.push(arquivos[n])
                  prod.set('fotos_adicionais', extras)
                }
                linha.imagens = arquivos.length
                mudou = true
              }
              if (it.imagens.length > 6)
                obs.push(it.imagens.length - 6 + ' imagem(ns) além do limite de 6')
              if (grandes > 0) obs.push(grandes + ' imagem(ns) acima de 2 MB')
              if (falhas > 0) obs.push(falhas + ' imagem(ns) não baixada(s)')
            } else if (it.imagens.length === 0) {
              obs.push('Tray sem imagens')
            } else {
              obs.push('Fotos mantidas (já tinha)')
            }

            // Peso e medidas: só preenche o que estiver vazio no Trevvo.
            if (it.peso > 0 && !(prod.getFloat('peso_bruto_kg') > 0)) {
              if (!simular) prod.set('peso_bruto_kg', Math.round(it.peso * 1000) / 1000)
              mudou = true
            }
            if (altura > 0 && !(prod.getFloat('altura_cm') > 0)) {
              if (!simular) prod.set('altura_cm', altura)
              mudou = true
            }
            if (largura > 0 && !(prod.getFloat('largura_cm') > 0)) {
              if (!simular) prod.set('largura_cm', largura)
              mudou = true
            }
            if (comprimento > 0 && !(prod.getFloat('comprimento_cm') > 0)) {
              if (!simular) prod.set('comprimento_cm', comprimento)
              mudou = true
            }

            if (mudou && !simular) {
              prod.set('tray_midia_importada_em', agoraIso)
              try {
                $app.save(prod)
              } catch (e) {
                obs.push(
                  'Erro ao gravar: ' + (e && e.message ? e.message : String(e)).slice(0, 200),
                )
                linha.situacao = 'Erro'
              }
            }
            if (!linha.situacao)
              linha.situacao = mudou
                ? simular
                  ? 'Seria atualizado'
                  : 'Atualizado'
                : 'Nada a mudar'
            if (obs.length) linha.observacao = obs.join('; ')
          }
          linhas.push(linha)
        }
      }

      const temMais = lista.length > 0 && pagina * limite < total
      return c.json(200, {
        sucesso: true,
        simulacao: simular,
        pagina: pagina,
        limite: limite,
        total_produtos: total,
        produtos_nesta_pagina: lista.length,
        proxima_pagina: temMais ? pagina + 1 : null,
        linhas: linhas,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem:
          err && err.message ? err.message : 'Falha ao importar descrição e imagens da Tray.',
      })
    }
  },
  $apis.requireAuth(),
)
