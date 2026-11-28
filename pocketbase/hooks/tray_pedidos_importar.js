/// <reference path="../types.d.ts" />

/**
 * tray_pedidos_importar.js — Integração Tray / IMPORTAÇÃO de pedidos "A ENVIAR"
 *
 * Traz para o Trevvo, como "Pedido em aberto" da empresa conectada (loja 02), os pedidos da
 * Tray com status A ENVIAR (ainda sem nota). Mesmas regras da prévia (tray_pedidos.js):
 *  - cliente pelo CPF/CNPJ; se não existir, é cadastrado com o endereço de entrega do pedido
 *    (código IBGE pelo ViaCEP ou por outro cliente da mesma cidade); cliente existente só tem
 *    completados os campos vazios;
 *  - itens pelo vínculo do anúncio, já em unidades do produto (caixa/kit x unidades) e com os
 *    dados fiscais do produto;
 *  - frete, desconto e acréscimo ajustados para o total bater com o da Tray;
 *  - canal (MERCADO LIVRE, SHOPEE, AMAZON...) e número do pedido no marketplace guardados.
 * O mesmo pedido nunca entra duas vezes (vendas.origem_externa + pedido_externo_id, índice
 * único). Pedido com item sem vínculo, produto inativo ou sem CPF/CNPJ NÃO entra: volta na
 * lista de ignorados com o motivo. Não grava nada na Tray e não mexe no estoque: o pedido em
 * aberto só reserva (o envio de estoque para a Tray desconta essa reserva). O estoque baixa
 * quando o pedido é finalizado/faturado.
 *
 * Trabalha em lotes curtos (até 8 pedidos novos por chamada); a tela chama de novo até
 * proxima_pagina = null.
 *
 * ATENÇÃO JSVM (Goja): nenhuma função declarada no topo do arquivo; rotas sem parâmetro de caminho;
 * sem spread de objeto; sem require.
 *
 * Rota:
 *   POST /backend/v1/tray/pedidos/importar   (administrador)
 *   body { empresa_id, pagina, pedido_ids?: [], ignorar_ids?: [], confirmar: true }
 */
routerAdd(
  'POST',
  '/backend/v1/tray/pedidos/importar',
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

    function primeiroNaoVazio() {
      for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i]
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
      }
      return ''
    }

    function lerCorpo() {
      try {
        const info = c.requestInfo()
        return (info && info.body) || {}
      } catch (_) {
        return {}
      }
    }

    // Produto completo para montar o item do pedido (mesmos campos que a tela de pedido usa)
    const cacheProdutosImp = {}
    const cacheUnidades = {}
    function produtoParaItem(id, empresaId) {
      if (cacheProdutosImp[id] !== undefined) return cacheProdutosImp[id]
      let out = null
      try {
        const r = $app.findRecordById('produtos', id)
        let sigla = 'UN'
        const unId = r.getString('unidade_id')
        if (unId) {
          if (cacheUnidades[unId] === undefined) {
            let s = ''
            try {
              s = $app.findRecordById('unidades_medida', unId).getString('sigla')
            } catch (_) {}
            cacheUnidades[unId] = s
          }
          if (cacheUnidades[unId]) sigla = cacheUnidades[unId]
        }
        let precoLoja = r.getFloat('preco_venda') || 0
        try {
          const pe = $app.findFirstRecordByFilter(
            'produtos_precos_empresa',
            "empresa_id = '" + empresaId + "' && produto_id = '" + r.id + "'",
          )
          if (pe && pe.getFloat('preco_venda') > 0) precoLoja = pe.getFloat('preco_venda')
        } catch (_) {}
        out = {
          id: r.id,
          codigo: r.getString('codigo'),
          descricao: r.getString('descricao'),
          ativo: r.getBool('ativo'),
          unidade: sigla,
          preco_loja: precoLoja,
          custo: r.getFloat('preco_custo') || 0,
          ncm: r.getString('ncm'),
          cest: r.getString('cest'),
          cfop: r.getString('cfop_venda_interna'),
          origem: r.getString('origem') || '0',
          cst_icms: r.getString('cst_icms'),
          csosn: r.getString('csosn'),
          aliquota_icms: r.getFloat('aliquota_icms') || 0,
          perfil_tributario_id: r.getString('perfil_tributario_id'),
        }
      } catch (_) {}
      cacheProdutosImp[id] = out
      return out
    }

    // Código IBGE do município: ViaCEP; se falhar, um cliente já cadastrado na mesma cidade/UF.
    const cacheIbge = {}
    function ibgePorCep(cep, cidade, uf, assinanteId) {
      const chave = cep + '|' + cidade + '|' + uf
      if (cacheIbge[chave] !== undefined) return cacheIbge[chave]
      let out = { ibge: '', cidade: '', uf: '' }
      if (cep.length === 8) {
        try {
          const r = $http.send({
            method: 'GET',
            url: 'https://viacep.com.br/ws/' + cep + '/json/',
            headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
            timeout: 8,
          })
          if (r.statusCode === 200) {
            const d = lerJson(r)
            if (d && !d.erro && /^[0-9]{7}$/.test(String(d.ibge || ''))) {
              out = {
                ibge: String(d.ibge),
                cidade: texto(d.localidade, 60),
                uf: texto(d.uf, 2).toUpperCase(),
              }
            }
          }
        } catch (_) {}
      }
      if (!out.ibge && cidade && uf) {
        try {
          const recs = $app.findRecordsByFilter(
            'clientes',
            "assinante_id = '" +
              assinanteId +
              "' && municipio = {:cidade} && uf = {:uf} && codigo_municipio_ibge != ''",
            '',
            1,
            0,
            { cidade: cidade, uf: uf },
          )
          if (recs && recs.length > 0) {
            out = {
              ibge: recs[0].getString('codigo_municipio_ibge'),
              cidade: recs[0].getString('municipio'),
              uf: recs[0].getString('uf'),
            }
          }
        } catch (_) {}
      }
      cacheIbge[chave] = out
      return out
    }

    // Endereço de entrega do pedido: o endereço ligado ao pedido; senão o de entrega do
    // cliente; senão o primeiro; senão o endereço do próprio cadastro do cliente na Tray.
    function enderecoDoPedido(o, cli) {
      const lista = comoLista(cli.CustomerAddresses || cli.CustomerAddress)
      const idPedido = primeiroNaoVazio(o.customer_address_id, o.address_id, o.delivery_address_id)
      let esc = null
      for (let i = 0; i < lista.length && !esc; i++) {
        const e = desembrulhar(lista[i], 'CustomerAddress')
        if (idPedido && String(e.id) === idPedido) esc = e
      }
      for (let i = 0; i < lista.length && !esc; i++) {
        const e = desembrulhar(lista[i], 'CustomerAddress')
        const tipo = String(e.type || e.type_delivery || '').toLowerCase()
        if (tipo === '1' || tipo.indexOf('entrega') >= 0 || tipo.indexOf('delivery') >= 0) esc = e
      }
      if (!esc && lista.length > 0) esc = desembrulhar(lista[0], 'CustomerAddress')
      const base = esc || cli
      return {
        cep: soDigitos(primeiroNaoVazio(base.zip_code, base.zipcode, base.cep)).slice(0, 8),
        logradouro: texto(primeiroNaoVazio(base.address, base.street), 60),
        numero: texto(primeiroNaoVazio(base.number), 60) || 'S/N',
        complemento: texto(primeiroNaoVazio(base.complement), 60),
        bairro: texto(primeiroNaoVazio(base.neighborhood), 60),
        municipio: texto(primeiroNaoVazio(base.city), 60),
        uf: texto(primeiroNaoVazio(base.state), 2).toUpperCase(),
      }
    }

    // Acha o cliente pelo CPF/CNPJ ou cria. Cliente já existente: só completa o que estiver
    // vazio (endereço sem código IBGE, e-mail, celular); nunca troca dados já preenchidos.
    function clienteDoPedido(ctx, doc, cli, end, dadosAuth) {
      const achado = clientePorDocumento(ctx.assinanteId, doc)
      const ibge = ibgePorCep(end.cep, end.municipio, end.uf, ctx.assinanteId)
      const email = texto(cli.email, 120)
      const celular = soDigitos(primeiroNaoVazio(cli.cellphone, cli.phone)).slice(0, 20)
      const avisos = []
      if (!ibge.ibge) avisos.push('Município sem código IBGE (conferir o endereço do cliente)')

      function gravarEndereco(rec) {
        rec.set('cep', end.cep)
        rec.set('logradouro', end.logradouro)
        rec.set('numero', end.numero)
        rec.set('complemento', end.complemento)
        rec.set('bairro', end.bairro)
        rec.set('municipio', ibge.cidade || end.municipio)
        rec.set('uf', ibge.uf || end.uf)
        rec.set('codigo_municipio_ibge', ibge.ibge)
        rec.set('codigo_pais', '1058')
        rec.set('pais', 'Brasil')
        rec.set('entrega_mesmo_endereco', true)
      }

      if (achado) {
        const rec = $app.findRecordById('clientes', achado.id)
        let mudou = false
        if (!rec.getString('codigo_municipio_ibge') || !rec.getString('logradouro')) {
          if (end.logradouro && ibge.ibge) {
            gravarEndereco(rec)
            mudou = true
          }
        }
        if (!rec.getString('email') && email) {
          rec.set('email', email)
          mudou = true
        }
        if (!rec.getString('celular') && celular) {
          rec.set('celular', celular)
          mudou = true
        }
        if (!rec.getString('codigo_municipio_ibge') && !ibge.ibge) {
          avisos.push('Cliente sem código IBGE no cadastro')
        }
        if (mudou) {
          rec.set('updated_by', dadosAuth)
          $app.save(rec)
        }
        if (achado.duplicado) avisos.push('CPF/CNPJ repetido no cadastro de clientes')
        return { id: rec.id, novo: false, nome: achado.nome, avisos: avisos }
      }

      const col = $app.findCollectionByNameOrId('clientes')
      const rec = new Record(col)
      const pj = doc.length === 14
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('ativo', true)
      rec.set('tipo_pessoa', pj ? 'Jurídica' : 'Física')
      rec.set('cpf_cnpj', doc)
      rec.set(
        'nome_razao_social',
        texto(pj ? primeiroNaoVazio(cli.company_name, cli.name) : cli.name, 60) || 'CLIENTE TRAY',
      )
      rec.set('indicador_ie', '9')
      rec.set('consumidor_final', true)
      gravarEndereco(rec)
      rec.set('email', email)
      rec.set('celular', celular)
      const ie = texto(cli.state_inscription, 30)
      rec.set(
        'observacoes',
        'Cadastrado pela importação de pedidos da Tray' +
          (ie && ie.toUpperCase() !== 'ISENTO' ? '. IE informada na Tray: ' + ie : ''),
      )
      rec.set('created_by', dadosAuth)
      rec.set('updated_by', dadosAuth)
      $app.save(rec)
      return {
        id: rec.id,
        novo: true,
        nome: rec.getString('nome_razao_social'),
        avisos: avisos,
      }
    }

    function jaImportado(empresaId, pedidoId) {
      try {
        const r = $app.findFirstRecordByFilter(
          'vendas',
          "empresa_id = '" +
            empresaId +
            "' && origem_externa = 'tray' && pedido_externo_id = '" +
            pedidoId +
            "'",
        )
        return r ? r.getInt('numero') || -1 : 0
      } catch (_) {
        return 0
      }
    }

    function statusAEnviar(s) {
      return (
        String(s || '')
          .trim()
          .toUpperCase()
          .replace(/\s+/g, ' ') === 'A ENVIAR'
      )
    }

    try {
      const corpo = lerCorpo()
      const ctx = contextoDoUsuario(auth)
      if (!ctx.admin) {
        return c.json(403, {
          sucesso: false,
          mensagem: 'Somente administradores podem importar os pedidos da Tray.',
        })
      }
      if (corpo.confirmar !== true) {
        return c.json(400, { sucesso: false, mensagem: 'Confirmação obrigatória.' })
      }
      const empresa = exigirEmpresa(ctx, String(corpo.empresa_id || '').trim())
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

      let pagina = parseInt(String(corpo.pagina || '1'), 10)
      if (isNaN(pagina) || pagina < 1) pagina = 1
      if (pagina > 40) pagina = 40
      const LISTA_POR_PAGINA = 50
      const MAX_NOVOS_POR_CHAMADA = 8

      // Pedidos pedidos um a um (ex.: reimportar um que deu problema); senão, lê a lista.
      const idsPedidos = []
      if (Array.isArray(corpo.pedido_ids)) {
        for (let i = 0; i < corpo.pedido_ids.length && idsPedidos.length < 20; i++) {
          const v = String(corpo.pedido_ids[i] || '').trim()
          if (/^[0-9]{1,20}$/.test(v)) idsPedidos.push(v)
        }
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

      let lista = []
      let total = 0
      if (idsPedidos.length > 0) {
        for (let i = 0; i < idsPedidos.length; i++) lista.push({ id: idsPedidos[i], status: '' })
        total = lista.length
      } else {
        const rl = lerTray(
          '/orders?status=' +
            encodeURIComponent('A ENVIAR') +
            '&sort=id_asc&limit=' +
            LISTA_POR_PAGINA +
            '&page=' +
            pagina,
        )
        if (rl.status !== 200) {
          return c.json(400, { sucesso: false, mensagem: mensagemErroTray(rl) })
        }
        const brutos = (rl.dados && (rl.dados.Orders || rl.dados.orders)) || []
        for (let i = 0; i < brutos.length; i++) {
          const r0 = desembrulhar(brutos[i], 'Order')
          lista.push({ id: texto(r0.id, 20), status: texto(r0.status, 60) })
        }
        // Proteção: se a Tray ignorar o filtro de status, a lista viria com pedidos de todo o
        // histórico (do mais antigo). Nesse caso para, em vez de varrer pedidos antigos.
        let foraDoStatus = 0
        for (let i = 0; i < lista.length; i++) {
          if (lista[i].status && !statusAEnviar(lista[i].status)) foraDoStatus++
        }
        if (lista.length >= 10 && foraDoStatus > lista.length / 2) {
          return c.json(400, {
            sucesso: false,
            mensagem:
              'A Tray não aplicou o filtro de status A ENVIAR na lista de pedidos. Nada foi importado.',
          })
        }
        const pag = (rl.dados && rl.dados.paging) || {}
        total = parseInt(String(pag.total || lista.length), 10) || lista.length
      }

      // Pedidos que já deram problema nesta rodada (a tela manda de volta): não abre de novo.
      const pular = {}
      if (Array.isArray(corpo.ignorar_ids)) {
        for (let i = 0; i < corpo.ignorar_ids.length && i < 2000; i++) {
          pular[String(corpo.ignorar_ids[i] || '')] = true
        }
      }

      const vinculos = carregarVinculos(empresa.id)
      const importados = []
      const ignorados = []
      let jaImportados = 0
      let outrosStatus = 0
      let novos = 0
      let paginaConcluida = true

      for (let i = 0; i < lista.length; i++) {
        const pedidoId = lista[i].id
        if (!/^[0-9]{1,20}$/.test(pedidoId)) continue
        if (pular[pedidoId]) continue
        if (jaImportado(empresa.id, pedidoId)) {
          jaImportados++
          continue
        }
        // Status do resumo da lista (quando veio): pula sem abrir o pedido.
        if (lista[i].status && !statusAEnviar(lista[i].status)) {
          outrosStatus++
          continue
        }
        if (novos >= MAX_NOVOS_POR_CHAMADA) {
          paginaConcluida = false
          break
        }
        novos++

        const rc = lerTray('/orders/' + pedidoId + '/complete')
        if (rc.status !== 200) {
          ignorados.push({ pedido_id: pedidoId, canal: '', motivo: mensagemErroTray(rc) })
          continue
        }
        const o = desembrulhar(rc.dados, 'Order')
        const canal = texto(o.point_sale, 60)
        const codigoMarketplace = texto(o.external_code, 60)
        if (!statusAEnviar(o.status)) {
          if (idsPedidos.length > 0) {
            ignorados.push({
              pedido_id: pedidoId,
              canal: canal,
              motivo: 'Status na Tray é "' + texto(o.status, 60) + '", não "A ENVIAR"',
            })
          } else {
            outrosStatus++
          }
          continue
        }

        // ---- Itens: todos precisam estar vinculados a um produto ativo ----
        const vendidos = comoLista(o.ProductsSold || o.products_sold)
        const itensVenda = []
        const problemas = []
        for (let j = 0; j < vendidos.length; j++) {
          const it = desembrulhar(vendidos[j], 'ProductsSold')
          const anuncio = texto(it.product_id, 20)
          let variacao = texto(it.variant_id, 20)
          if (variacao === '0') variacao = ''
          const qtd = numero(it.quantity)
          const preco = numero(it.price)
          const nomeItem = texto(it.name, 80)
          const lv = vinculos[anuncio + '|' + variacao] || []
          if (lv.length === 0) {
            problemas.push('Sem vínculo: ' + nomeItem + ' (anúncio ' + anuncio + ')')
            continue
          }
          if (lv.length > 1) {
            problemas.push('Mais de um produto vinculado: ' + nomeItem)
            continue
          }
          const prod = produtoParaItem(lv[0].produto_id, empresa.id)
          if (!prod) {
            problemas.push('Produto do vínculo não existe: ' + nomeItem)
            continue
          }
          if (!prod.ativo) {
            problemas.push('Produto ' + prod.codigo + ' inativo no Trevvo')
            continue
          }
          if (!(qtd > 0) || !(preco > 0)) {
            problemas.push('Quantidade ou preço zerado: ' + nomeItem)
            continue
          }
          const unidades = lv[0].unidades > 0 ? lv[0].unidades : 1
          const qtdTrevvo = Math.round(qtd * unidades * 10000) / 10000
          const precoUnit = Math.round((preco / unidades) * 10000) / 10000
          itensVenda.push({
            prod: prod,
            quantidade: qtdTrevvo,
            preco: precoUnit,
            total: arred(qtdTrevvo * precoUnit),
          })
        }
        if (vendidos.length === 0) problemas.push('Pedido sem itens')

        // ---- Cliente ----
        const cli = desembrulhar(o.Customer || o.customer || {}, 'Customer')
        const cnpj = soDigitos(cli.cnpj)
        const cpf = soDigitos(cli.cpf)
        const doc = cnpj.length === 14 ? cnpj : cpf.length === 11 ? cpf : ''
        if (!doc) problemas.push('Pedido sem CPF/CNPJ do cliente')

        if (problemas.length > 0) {
          ignorados.push({ pedido_id: pedidoId, canal: canal, motivo: problemas.join('; ') })
          continue
        }

        let vendaCriadaId = ''
        try {
          const end = enderecoDoPedido(o, cli)
          const cliente = clienteDoPedido(ctx, doc, cli, end, auth.id)

          // ---- Totais: produtos + frete − desconto + acréscimo = total da Tray ----
          let valorProdutos = 0
          for (let j = 0; j < itensVenda.length; j++) valorProdutos += itensVenda[j].total
          valorProdutos = arred(valorProdutos)
          const frete = arred(numero(o.shipment_value))
          let desconto = arred(numero(o.discount))
          let acrescimo = 0
          let totalTray = arred(numero(o.total))
          if (!(totalTray > 0)) totalTray = arred(valorProdutos + frete - desconto)
          const dif = arred(totalTray - (valorProdutos + frete - desconto))
          if (dif > 0) acrescimo = dif
          else if (dif < 0) desconto = arred(desconto - dif)
          let custoTotal = 0
          for (let j = 0; j < itensVenda.length; j++) {
            custoTotal += itensVenda[j].prod.custo * itensVenda[j].quantidade
          }

          let dataPedido = texto(o.date, 10)
          if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dataPedido)) {
            dataPedido = new Date().toISOString().slice(0, 10)
          }
          const forma = texto(o.payment_form, 60)
          const obs =
            'Pedido Tray #' +
            pedidoId +
            (canal ? ' · ' + canal : '') +
            (codigoMarketplace ? ' · pedido ' + codigoMarketplace : '') +
            (forma ? ' · ' + forma : '') +
            (texto(o.shipment, 60) ? ' · envio ' + texto(o.shipment, 60) : '')

          const vendasCol = $app.findCollectionByNameOrId('vendas')
          const venda = new Record(vendasCol)
          venda.set('empresa_id', empresa.id)
          venda.set('numero', 0)
          venda.set('tipo', 'Pedido')
          venda.set('status', 'Pedido em aberto')
          venda.set('cliente_id', cliente.id)
          venda.set('cpf_cnpj_consumidor', doc)
          venda.set('operador_id', ctx.usuarioRec.id)
          venda.set('data_emissao', dataPedido)
          venda.set('valor_produtos', valorProdutos)
          venda.set('valor_desconto_itens', 0)
          venda.set('valor_desconto_total', desconto)
          venda.set('valor_acrescimo', acrescimo)
          venda.set('valor_frete', frete)
          venda.set('valor_total', totalTray)
          venda.set('custo_total', arred(custoTotal))
          venda.set('observacao', texto(obs, 500))
          venda.set('documento_fiscal_status', 'Não emitido')
          venda.set('origem_externa', 'tray')
          venda.set('pedido_externo_id', pedidoId)
          venda.set('pedido_marketplace', codigoMarketplace)
          venda.set('canal_externo', canal)
          venda.set('ativo', true)
          venda.set('created_by', auth.id)
          venda.set('updated_by', auth.id)
          // Sem transação: o hook de numeração abre a dele. Se um item falhar, o pedido é apagado.
          $app.save(venda)
          vendaCriadaId = venda.id

          const itensCol = $app.findCollectionByNameOrId('vendas_itens')
          for (let j = 0; j < itensVenda.length; j++) {
            const iv = itensVenda[j]
            const r = new Record(itensCol)
            r.set('venda_id', venda.id)
            r.set('item', j + 1)
            r.set('produto_id', iv.prod.id)
            r.set('descricao', iv.prod.descricao)
            r.set('unidade', iv.prod.unidade || 'UN')
            r.set('quantidade', iv.quantidade)
            r.set('preco_unitario', iv.preco)
            r.set('preco_tabela', iv.prod.preco_loja || iv.preco)
            r.set('desconto_percentual', 0)
            r.set('desconto_valor', 0)
            r.set('acrescimo_valor', 0)
            r.set('valor_total', iv.total)
            r.set('custo_unitario', iv.prod.custo)
            r.set('ncm', iv.prod.ncm)
            r.set('cest', iv.prod.cest)
            r.set('cfop', iv.prod.cfop)
            r.set('origem', iv.prod.origem)
            r.set('cst_icms', iv.prod.cst_icms)
            r.set('csosn', iv.prod.csosn)
            r.set('aliquota_icms', iv.prod.aliquota_icms)
            r.set('perfil_tributario_id', iv.prod.perfil_tributario_id)
            r.set('ativo', true)
            r.set('created_by', auth.id)
            r.set('updated_by', auth.id)
            $app.save(r)
          }

          importados.push({
            pedido_id: pedidoId,
            venda_id: venda.id,
            venda_numero: venda.getInt('numero'),
            canal: canal,
            pedido_marketplace: codigoMarketplace,
            cliente: cliente.nome,
            cliente_novo: cliente.novo,
            total: totalTray,
            avisos: cliente.avisos,
          })
        } catch (errPed) {
          if (vendaCriadaId) {
            try {
              const itensGravados = $app.findRecordsByFilter(
                'vendas_itens',
                "venda_id = '" + vendaCriadaId + "'",
                '',
                500,
                0,
              )
              for (let k = 0; k < itensGravados.length; k++) $app.delete(itensGravados[k])
              $app.delete($app.findRecordById('vendas', vendaCriadaId))
            } catch (_) {}
          }
          ignorados.push({
            pedido_id: pedidoId,
            canal: canal,
            motivo:
              'Erro ao gravar: ' +
              texto(errPed && errPed.message ? errPed.message : String(errPed), 300),
          })
        }
      }

      const temMaisPaginas =
        idsPedidos.length === 0 &&
        lista.length >= LISTA_POR_PAGINA &&
        pagina * LISTA_POR_PAGINA < total
      return c.json(200, {
        sucesso: true,
        pagina: pagina,
        total_pedidos_lista: total,
        pagina_concluida: paginaConcluida,
        proxima_pagina: paginaConcluida ? (temMaisPaginas ? pagina + 1 : null) : pagina,
        importados: importados,
        ignorados: ignorados,
        ja_importados: jaImportados,
        outros_status: outrosStatus,
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao importar os pedidos da Tray.',
      })
    }
  },
  $apis.requireAuth(),
)
