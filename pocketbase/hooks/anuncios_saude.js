/// <reference path="../types.d.ts" />

/**
 * anuncios_saude.js — Saúde dos anúncios (monitor diário dos marketplaces)
 *
 * SOMENTE LEITURA nos marketplaces: lê os anúncios e grava no Trevvo os que têm problema
 * (tabela anuncios_saude) e o histórico das verificações (anuncios_saude_execucoes).
 * Nada é alterado no Mercado Livre.
 *
 * Situações gravadas:
 *  - 'Política'            pausado/inativo/em revisão/finalizado pelo canal por regra (ANVISA, catálogo...)
 *  - 'Pausado sem motivo'  pausado, com estoque no canal, sem motivo informado pelo canal
 *  - 'Estoque divergente'  sem estoque no canal, mas o Trevvo tem saldo na empresa
 *
 * Como roda:
 *  - Agendado (cron a cada 5 min): todo dia, a partir das 6h (Brasília), cria e executa a
 *    verificação do dia de cada conta conectada. Também executa as pedidas pelo botão.
 *  - Botão "Verificar agora": POST /backend/v1/anuncios-saude/verificar?empresa_id=&marketplace=mercadolivre
 *    só cria a execução 'Pendente'; o agendamento a processa em até 5 minutos.
 *    (Assim a lógica fica em um lugar só, no cron.)
 *
 * ATENÇÃO JSVM (Goja): nenhuma função no topo do arquivo, sem require, sem spread.
 */
routerAdd(
  'POST',
  '/backend/v1/anuncios-saude/verificar',
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

    try {
      const q = c.requestInfo().query || {}
      const ctx = contextoDoUsuario(auth)
      const empresa = exigirEmpresa(ctx, String(q['empresa_id'] || '').trim())
      const marketplace = String(q['marketplace'] || 'mercadolivre').trim()
      if (marketplace !== 'mercadolivre') {
        return c.json(400, { sucesso: false, mensagem: 'Canal ainda não suportado.' })
      }

      // Já existe uma verificação na fila ou rodando? Não cria outra.
      try {
        const abertas = $app.findRecordsByFilter(
          'anuncios_saude_execucoes',
          "empresa_id = '" +
            empresa.id +
            "' && marketplace = '" +
            marketplace +
            "' && (status = 'Pendente' || status = 'Executando')",
          '-created',
          1,
          0,
        )
        if (abertas && abertas.length > 0) {
          return c.json(200, {
            sucesso: true,
            execucao_id: abertas[0].id,
            mensagem:
              'Já existe uma verificação em andamento. O resultado aparece em alguns minutos.',
          })
        }
      } catch (_) {}

      const agora = new Date()
      const dia = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const col = $app.findCollectionByNameOrId('anuncios_saude_execucoes')
      const rec = new Record(col)
      rec.set('assinante_id', ctx.assinanteId)
      rec.set('empresa_id', empresa.id)
      rec.set('marketplace', marketplace)
      rec.set('status', 'Pendente')
      rec.set('origem', 'Manual')
      rec.set('dia', dia)
      $app.save(rec)

      return c.json(200, {
        sucesso: true,
        execucao_id: rec.id,
        mensagem: 'Verificação pedida. O resultado aparece em até 5 minutos.',
      })
    } catch (err) {
      const status = err && err.status ? err.status : 400
      return c.json(status, {
        sucesso: false,
        mensagem: err && err.message ? err.message : 'Falha ao pedir a verificação.',
      })
    }
  },
  $apis.requireAuth(),
)

cronAdd('anuncios_saude_monitor', '*/5 * * * *', () => {
  // ---- Helpers locais (JSVM: precisam ficar DENTRO do callback) ----
  function lerJson(res) {
    if (res && res.json) return res.json
    try {
      return JSON.parse(res.raw || '{}')
    } catch (_) {
      return {}
    }
  }

  function chamarML(caminho, token) {
    const res = $http.send({
      method: 'GET',
      url: 'https://api.mercadolibre.com' + caminho,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      timeout: 20,
    })
    return { status: res.statusCode, dados: lerJson(res) }
  }

  function mensagemErroML(r) {
    const d = (r && r.dados) || {}
    const txt = d.message || d.error_description || d.error || ''
    return 'Mercado Livre respondeu HTTP ' + (r ? r.status : '?') + (txt ? ': ' + txt : '')
  }

  function diaBrasilia(ms) {
    return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  function horaBrasilia(ms) {
    return new Date(ms - 3 * 60 * 60 * 1000).getUTCHours()
  }

  function skuDosAtributos(attrs) {
    if (!attrs || !attrs.length) return ''
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i] && attrs[i].id === 'SELLER_SKU') return String(attrs[i].value_name || '').trim()
    }
    return ''
  }

  // Traduz o motivo (sub_status) do Mercado Livre e sugere o que fazer.
  function explicarSubStatus(codigo, statusItem) {
    const mapa = {
      forbidden: [
        'Produto proibido pelo Mercado Livre (ex.: falta do registro ANVISA, medicamento ou item restrito).',
        'Se for produto para saúde com registro, crie um anúncio novo e preencha o número ANVISA em "Informação regulatória". Medicamento não pode ser vendido no ML.',
      ],
      waiting_for_patch: [
        'Aguardando correção pedida pelo Mercado Livre (catálogo, título, fotos ou ficha técnica).',
        'Abra o anúncio no ML e faça a correção indicada em "Status e recomendações".',
      ],
      held: [
        'Retido pelo Mercado Livre.',
        'Abra o anúncio no ML e veja o motivo em "Preciso de ajuda".',
      ],
      suspended: [
        'Suspenso pelo Mercado Livre.',
        'Abra o anúncio no ML e veja o motivo em "Preciso de ajuda".',
      ],
      freezed: [
        'Congelado pela moderação do Mercado Livre.',
        'Abra o anúncio no ML e veja o motivo em "Preciso de ajuda".',
      ],
      warning: [
        'Anúncio com aviso do Mercado Livre.',
        'Abra o anúncio no ML e corrija o que está indicado.',
      ],
      moderation_penalty: [
        'Penalidade de moderação do Mercado Livre.',
        'Abra o anúncio no ML e corrija o que está indicado.',
      ],
      picture_download_pending: [
        'Fotos ainda sendo processadas pelo Mercado Livre.',
        'Aguarde. Se continuar amanhã, envie as fotos de novo.',
      ],
    }
    if (mapa[codigo]) return mapa[codigo]
    if (statusItem === 'under_review') {
      return [
        'Em revisão pelo Mercado Livre' + (codigo ? ' (' + codigo + ')' : '') + '.',
        'Abra o anúncio no ML e veja o que ele pede para revisar.',
      ]
    }
    return [
      'Motivo informado pelo Mercado Livre: ' + (codigo || statusItem) + '.',
      'Abra o anúncio no ML para ver o detalhe.',
    ]
  }

  const MOTIVOS_IGNORAR = { out_of_stock: true, deleted: true, expired: true }
  // Pausa feita pelo próprio vendedor (manual ou pela Tray): não é regra do ML.
  const MOTIVOS_VENDEDOR = { paused_by_seller: true }

  // Produto do Trevvo pelo SKU (referência) ou pelo vínculo do anúncio.
  function produtoDoAnuncio(assinanteId, empresaId, anuncioId, skus) {
    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i]
      if (!sku || !/^[A-Za-z0-9._\-\/ ]{1,60}$/.test(sku)) continue
      try {
        const recs = $app.findRecordsByFilter(
          'produtos',
          "assinante_id = '" + assinanteId + "' && referencia = '" + sku + "'",
          'codigo',
          1,
          0,
        )
        if (recs && recs.length > 0) return recs[0]
      } catch (_) {}
    }
    try {
      if ($app.hasTable('produtos_vinculos_anuncios')) {
        const v = $app.findRecordsByFilter(
          'produtos_vinculos_anuncios',
          "empresa_id = '" +
            empresaId +
            "' && marketplace = 'mercadolivre' && anuncio_id = '" +
            anuncioId +
            "'",
          '',
          1,
          0,
        )
        if (v && v.length > 0) return $app.findRecordById('produtos', v[0].getString('produto_id'))
      }
    } catch (_) {}
    return null
  }

  function saldoTrevvo(empresaId, produtoId) {
    if (!produtoId) return 0
    try {
      const s = $app.findRecordsByFilter(
        'estoque_saldos',
        "empresa_id = '" + empresaId + "' && produto_id = '" + produtoId + "'",
        '',
        1,
        0,
      )
      if (s && s.length > 0) return s[0].getFloat('quantidade') || 0
    } catch (_) {}
    return 0
  }

  // Estoque do produto na Tray (fonte que pausa/reativa o anúncio no ML enquanto a Tray
  // integra os marketplaces). SKU do ML = código da Tray ("6005") ou produto_variação
  // ("6005_123"). Devolve { estoque, ativo } ou null quando não dá para conferir.
  // Só leitura (GET); nunca registrar a URL em log (contém o token).
  function contaTray(empresaId) {
    try {
      if (!$app.hasTable('tray_contas')) return null
      const recs = $app.findRecordsByFilter(
        'tray_contas',
        "empresa_id = '" + empresaId + "' && status = 'Conectada'",
        '-created',
        1,
        0,
      )
      if (!recs || recs.length === 0) return null
      const conta = recs[0]
      const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
      if (!expira || expira < Date.now() + 60 * 1000) return null
      if (!conta.getString('access_token') || !conta.getString('api_address')) return null
      return conta
    } catch (_) {
      return null
    }
  }

  // Códigos da Tray a tentar, em ordem: o SKU do anúncio ("6005" = produto; "6005-123" ou
  // "6005_123" = variação 123), a referência do produto do Trevvo (= código da Tray) e, quando
  // o SKU é o código do Trevvo/Uniplus, a referência desse produto.
  function codigosTray(assinanteId, skus, produto) {
    const out = []
    function add(tipo, id) {
      const k = tipo + ':' + id
      for (let i = 0; i < out.length; i++) if (out[i].k === k) return
      out.push({ k: k, tipo: tipo, id: id })
    }
    function porCodigo(cod) {
      try {
        const r = $app.findRecordsByFilter(
          'produtos',
          "assinante_id = '" + assinanteId + "' && codigo = " + parseInt(cod, 10),
          '',
          1,
          0,
        )
        if (r && r.length > 0) {
          const ref = r[0].getString('referencia').trim()
          if (/^[0-9]{1,12}$/.test(ref)) add('produto', ref)
        }
      } catch (_) {}
    }
    for (let i = 0; i < skus.length; i++) {
      const sku = String(skus[i] || '').trim()
      let m = sku.match(/^([0-9]{1,12})$/)
      if (m) add('produto', m[1])
      m = sku.match(/^[0-9]{1,12}[-_]([0-9]{1,12})$/)
      if (m) add('variacao', m[1])
    }
    if (produto) {
      const ref = produto.getString('referencia').trim()
      if (/^[0-9]{1,12}$/.test(ref)) add('produto', ref)
    }
    for (let i = 0; i < skus.length; i++) {
      const sku = String(skus[i] || '').trim()
      if (/^[0-9]{1,9}$/.test(sku)) porCodigo(sku)
    }
    return out
  }

  // Devolve { ok: true, estoque, ativo, codigo } ou { ok: false, detalhe }.
  function estoqueTray(conta, codigos) {
    if (!conta) return { ok: false, detalhe: 'loja Tray não conectada ou acesso vencido' }
    if (codigos.length === 0) return { ok: false, detalhe: 'SKU sem código da Tray' }
    const api = conta.getString('api_address')
    const token = encodeURIComponent(conta.getString('access_token'))
    const falhas = []
    for (let i = 0; i < codigos.length && i < 4; i++) {
      const cod = codigos[i]
      const caminho = (cod.tipo === 'variacao' ? '/products/variants/' : '/products/') + cod.id
      const chave = cod.tipo === 'variacao' ? 'Variant' : 'Product'
      let status = 0
      let d = null
      const esperas = [0, 1000, 2000, 4000]
      for (let t = 0; t < esperas.length; t++) {
        sleep(350 + esperas[t]) // limite da Tray: 180 requisições por minuto
        try {
          const res = $http.send({
            method: 'GET',
            url: api + caminho + '?access_token=' + token,
            headers: { Accept: 'application/json', 'User-Agent': 'Trevvo-ERP/1.0' },
            timeout: 20,
          })
          status = res.statusCode
          if (status === 200) d = lerJson(res)
        } catch (_) {
          status = -1
        }
        if (status !== 429 && status !== -1) break
      }
      if (status === 200 && d) {
        const no = d[chave] || d
        const estoque = parseFloat(String(no.stock === undefined ? '' : no.stock)) || 0
        const disp = no.available
        const ativo = disp === undefined ? true : String(disp) === '1' || disp === true
        return {
          ok: true,
          estoque: estoque,
          ativo: ativo,
          codigo: (cod.tipo === 'variacao' ? 'variação ' : '') + cod.id,
        }
      }
      falhas.push((cod.tipo === 'variacao' ? 'variação ' : '') + cod.id + ' HTTP ' + status)
    }
    return { ok: false, detalhe: falhas.join(', ') }
  }

  // Executa uma verificação do Mercado Livre. Devolve { lidos, problemas, resumo }.
  function verificarMercadoLivre(exec) {
    const empresaId = exec.getString('empresa_id')
    const assinanteId = exec.getString('assinante_id')
    const contas = $app.findRecordsByFilter(
      'mercadolivre_contas',
      "empresa_id = '" + empresaId + "' && status = 'Conectada'",
      '-created',
      1,
      0,
    )
    if (!contas || contas.length === 0) throw new Error('Conta do Mercado Livre não conectada.')
    const conta = contas[0]
    const expira = new Date(conta.getString('token_expira_em') || 0).getTime()
    if (!expira || expira < Date.now() + 60 * 1000) {
      throw new Error('Acesso ao Mercado Livre vencido; a renovação automática tenta de novo.')
    }
    const token = conta.getString('access_token')
    const mlUserId = conta.getString('ml_user_id').replace(/[^0-9]/g, '')

    // 1) Ids dos anúncios fora do ar (pausados, inativos, em revisão, finalizados).
    const statusBusca = ['paused', 'inactive', 'under_review', 'closed']
    const ids = []
    const visto = {}
    for (let s = 0; s < statusBusca.length; s++) {
      let offset = 0
      for (let pag = 0; pag < 10; pag++) {
        const r = chamarML(
          '/users/' +
            mlUserId +
            '/items/search?status=' +
            statusBusca[s] +
            '&offset=' +
            offset +
            '&limit=100',
          token,
        )
        if (r.status !== 200) throw new Error('Falha ao listar anúncios. ' + mensagemErroML(r))
        const res = (r.dados && r.dados.results) || []
        for (let i = 0; i < res.length; i++) {
          const id = String(res[i]).replace(/[^A-Za-z0-9]/g, '')
          if (id && !visto[id]) {
            visto[id] = true
            ids.push(id)
          }
        }
        const total = (r.dados && r.dados.paging && r.dados.paging.total) || 0
        offset += res.length
        if (res.length === 0 || offset >= total || offset >= 1000) break
      }
    }
    const fontes = { busca_status: ids.length }

    // 1b) O ML não devolve na busca por status os anúncios bloqueados por regra
    //     (ex.: under_review + forbidden/ANVISA). Fontes extras, todas opcionais:
    //     se uma falhar, segue com as outras.
    function juntarId(valor, fonte) {
      const id = String(valor || '').replace(/[^A-Za-z0-9]/g, '')
      if (!/^MLB[0-9]+$/.test(id) || visto[id]) return
      visto[id] = true
      ids.push(id)
      fontes[fonte] = (fontes[fonte] || 0) + 1
    }
    function idsNoObjeto(obj, fonte, prof) {
      if (obj === null || obj === undefined || prof > 6) return
      if (typeof obj === 'string') {
        if (/^MLB[0-9]+$/.test(obj)) juntarId(obj, fonte)
        return
      }
      if (typeof obj !== 'object') return
      if (Array.isArray(obj)) {
        for (let q = 0; q < obj.length; q++) idsNoObjeto(obj[q], fonte, prof + 1)
        return
      }
      for (const chave in obj) idsNoObjeto(obj[chave], fonte, prof + 1)
    }

    // a) Busca por motivo (sub_status) em vez de status.
    const buscasMotivo = ['sub_status=forbidden', 'status=under_review&sub_status=forbidden']
    for (let s = 0; s < buscasMotivo.length; s++) {
      try {
        let offset = 0
        for (let pag = 0; pag < 10; pag++) {
          const r = chamarML(
            '/users/' +
              mlUserId +
              '/items/search?' +
              buscasMotivo[s] +
              '&offset=' +
              offset +
              '&limit=100',
            token,
          )
          if (r.status !== 200) break
          const res = (r.dados && r.dados.results) || []
          for (let i = 0; i < res.length; i++) juntarId(res[i], 'busca_motivo')
          const total = (r.dados && r.dados.paging && r.dados.paging.total) || 0
          offset += res.length
          if (res.length === 0 || offset >= total || offset >= 1000) break
        }
      } catch (_) {}
    }

    // b) Varredura completa da conta (search_type=scan, sem filtro de status).
    try {
      let scroll = ''
      for (let pag = 0; pag < 60; pag++) {
        const r = chamarML(
          '/users/' +
            mlUserId +
            '/items/search?search_type=scan&limit=100' +
            (scroll ? '&scroll_id=' + encodeURIComponent(scroll) : ''),
          token,
        )
        if (r.status !== 200) break
        const res = (r.dados && r.dados.results) || []
        for (let i = 0; i < res.length; i++) juntarId(res[i], 'varredura')
        scroll = String((r.dados && r.dados.scroll_id) || '')
        if (res.length === 0 || !scroll) break
      }
    } catch (_) {}

    // c) Infrações (moderações) da conta.
    try {
      for (let pag = 0; pag < 10; pag++) {
        const r = chamarML(
          '/moderations/infractions/' + mlUserId + '?limit=50&offset=' + pag * 50,
          token,
        )
        if (r.status !== 200) break
        const antes = ids.length
        idsNoObjeto(r.dados, 'infracoes', 0)
        const lista = (r.dados && (r.dados.infractions || r.dados.results)) || []
        if (!lista.length || ids.length === antes) break
      }
    } catch (_) {}

    // d) Anúncios que o Trevvo já conhece: vínculos e os já listados na Saúde dos anúncios.
    try {
      const vinc = $app.findRecordsByFilter(
        'produtos_vinculos_anuncios',
        "empresa_id = '" + empresaId + "' && marketplace = 'mercadolivre'",
        '',
        5000,
        0,
      )
      for (let i = 0; i < vinc.length; i++) juntarId(vinc[i].getString('anuncio_id'), 'vinculos')
    } catch (_) {}
    try {
      const ant = $app.findRecordsByFilter(
        'anuncios_saude',
        "empresa_id = '" + empresaId + "' && marketplace = 'mercadolivre'",
        '',
        5000,
        0,
      )
      for (let i = 0; i < ant.length; i++) juntarId(ant[i].getString('anuncio_id'), 'ja_listados')
    } catch (_) {}

    // 2) Detalhe em lotes de 20 e classificação.
    const agoraIso = new Date().toISOString()
    const limiteFinalizado = Date.now() - 60 * 24 * 60 * 60 * 1000
    const problemas = []
    let contaTrayEmpresa = undefined
    let pausadosSemEstoqueTray = 0
    for (let i = 0; i < ids.length; i += 20) {
      const lote = ids.slice(i, i + 20)
      const r = chamarML('/items?ids=' + lote.join(',') + '&include_attributes=all', token)
      if (r.status !== 200 || !r.dados || !r.dados.length) continue
      for (let k = 0; k < r.dados.length; k++) {
        const item = r.dados[k] && r.dados[k].code === 200 ? r.dados[k].body : null
        if (!item) continue
        const statusItem = String(item.status || '')
        const subs = item.sub_status || []
        const subsUteis = []
        let pausaVendedor = false
        for (let m = 0; m < subs.length; m++) {
          if (MOTIVOS_VENDEDOR[subs[m]]) pausaVendedor = true
          else if (!MOTIVOS_IGNORAR[subs[m]]) subsUteis.push(String(subs[m]))
        }
        const semEstoqueCanal = subs.indexOf('out_of_stock') >= 0
        let estoqueCanal = parseInt(item.available_quantity, 10) || 0

        // SKUs do anúncio (anúncio simples ou variações).
        const skus = []
        const s1 = skuDosAtributos(item.attributes) || String(item.seller_custom_field || '').trim()
        if (s1) skus.push(s1)
        const vars = item.variations || []
        if (vars.length > 0) estoqueCanal = 0
        for (let v = 0; v < vars.length; v++) {
          const sv =
            skuDosAtributos(vars[v].attributes) || String(vars[v].seller_custom_field || '').trim()
          if (sv && skus.indexOf(sv) < 0) skus.push(sv)
          estoqueCanal += parseInt(vars[v].available_quantity, 10) || 0
        }

        if (statusItem === 'closed') {
          // Finalizado: só interessa o que o ML finalizou por regra, nos últimos 60 dias.
          if (subs.indexOf('deleted') >= 0 || subsUteis.length === 0) continue
          const atualizado = new Date(item.last_updated || 0).getTime()
          if (atualizado && atualizado < limiteFinalizado) continue
        }

        let situacao = ''
        let motivo = ''
        let acao = ''
        const produto = produtoDoAnuncio(assinanteId, empresaId, String(item.id), skus)
        const saldo = produto ? saldoTrevvo(empresaId, produto.id) : 0

        if (subsUteis.length > 0 || statusItem === 'under_review' || statusItem === 'inactive') {
          situacao = 'Política'
          const ex = explicarSubStatus(subsUteis[0] || '', statusItem)
          motivo = ex[0]
          acao = ex[1]
          if (statusItem === 'closed') {
            motivo = 'Finalizado pelo Mercado Livre. ' + motivo
            acao = 'Use "Voltar a anunciar" no ML (ou republique pela Tray) e corrija o motivo.'
          }
        } else if (statusItem === 'paused' && (semEstoqueCanal || estoqueCanal <= 0)) {
          if (saldo > 0) {
            situacao = 'Estoque divergente'
            motivo = 'Sem estoque no Mercado Livre, mas o Trevvo tem ' + saldo + ' na empresa.'
            acao = 'A Tray não enviou o estoque. Confira o estoque do produto na Tray.'
          } else {
            continue // pausado só por falta de estoque: não é problema
          }
        } else if (statusItem === 'paused') {
          // A Tray pausa o anúncio quando o produto fica sem estoque (ou inativo) nela, mas não
          // zera o estoque do ML. Confere na Tray antes de acusar "pausado sem motivo".
          if (contaTrayEmpresa === undefined) contaTrayEmpresa = contaTray(empresaId)
          const tray = estoqueTray(
            contaTrayEmpresa,
            codigosTray(assinanteId, skus, produto),
          )
          if (tray.ok && (tray.estoque <= 0 || !tray.ativo)) {
            pausadosSemEstoqueTray++
            continue // pausado porque a Tray está sem estoque ou com o produto inativo: normal
          }
          situacao = 'Pausado sem motivo'
          motivo = pausaVendedor
            ? 'Pausado pelo vendedor (manual ou pela Tray) com ' +
              estoqueCanal +
              ' em estoque no ML.'
            : 'Pausado com ' +
              estoqueCanal +
              ' em estoque no ML e sem motivo informado (pausa manual ou da Tray).'
          if (tray.ok) {
            motivo +=
              ' Na Tray (código ' + tray.codigo + ') o produto está ativo com ' + tray.estoque + ' em estoque.'
            acao = 'O produto tem estoque e está ativo na Tray: reative o anúncio no ML.'
          } else {
            motivo += ' Não foi possível conferir o estoque na Tray (' + tray.detalhe + ').'
            acao =
              'Confira na Tray se o produto está ativo e com estoque. Se estiver, reative o anúncio no ML.'
          }
        } else {
          continue
        }

        problemas.push({
          anuncio_id: String(item.id),
          titulo: String(item.title || ''),
          sku: skus.join(', '),
          produto_id: produto ? produto.id : '',
          produto_codigo: produto ? produto.getString('codigo') : '',
          situacao: situacao,
          status_canal: statusItem,
          sub_status: subs.join(', '),
          motivo: motivo,
          acao: acao,
          estoque_canal: estoqueCanal,
          estoque_trevvo: saldo,
          vendidos: parseInt(item.sold_quantity, 10) || 0,
          link: String(item.permalink || ''),
        })
      }
    }

    // 3) Grava: atualiza os que continuam com problema, cria os novos, apaga os resolvidos.
    const col = $app.findCollectionByNameOrId('anuncios_saude')
    let existentes = []
    try {
      existentes = $app.findRecordsByFilter(
        'anuncios_saude',
        "empresa_id = '" + empresaId + "' && marketplace = 'mercadolivre'",
        '',
        5000,
        0,
      )
    } catch (_) {
      existentes = []
    }
    const porAnuncio = {}
    for (let i = 0; i < existentes.length; i++) {
      porAnuncio[existentes[i].getString('anuncio_id')] = existentes[i]
    }
    const resumo = { Política: 0, 'Pausado sem motivo': 0, 'Estoque divergente': 0 }
    const encontrados = {}
    for (let i = 0; i < problemas.length; i++) {
      const p = problemas[i]
      encontrados[p.anuncio_id] = true
      resumo[p.situacao] = (resumo[p.situacao] || 0) + 1
      let rec = porAnuncio[p.anuncio_id]
      if (!rec) {
        rec = new Record(col)
        rec.set('assinante_id', assinanteId)
        rec.set('empresa_id', empresaId)
        rec.set('marketplace', 'mercadolivre')
        rec.set('anuncio_id', p.anuncio_id)
        rec.set('primeira_vez_em', agoraIso)
      }
      rec.set('titulo', p.titulo.slice(0, 300))
      rec.set('sku', p.sku.slice(0, 300))
      rec.set('produto_id', p.produto_id)
      rec.set('produto_codigo', p.produto_codigo)
      rec.set('situacao', p.situacao)
      rec.set('status_canal', p.status_canal)
      rec.set('sub_status', p.sub_status.slice(0, 200))
      rec.set('motivo', p.motivo.slice(0, 500))
      rec.set('acao_sugerida', p.acao.slice(0, 1000))
      rec.set('estoque_canal', p.estoque_canal)
      rec.set('estoque_trevvo', p.estoque_trevvo)
      rec.set('vendidos', p.vendidos)
      rec.set('link', p.link.slice(0, 500))
      rec.set('verificado_em', agoraIso)
      try {
        $app.save(rec)
      } catch (errSave) {
        console.log('[anuncios_saude] Falha ao gravar ' + p.anuncio_id + ': ' + errSave)
      }
    }
    for (let i = 0; i < existentes.length; i++) {
      if (!encontrados[existentes[i].getString('anuncio_id')]) {
        try {
          $app.delete(existentes[i])
        } catch (_) {}
      }
    }
    // Quantos anúncios vieram de cada fonte (para conferir a cobertura).
    for (const f in fontes) resumo['fonte_' + f] = fontes[f]
    resumo.pausados_sem_estoque_tray = pausadosSemEstoqueTray
    return { lidos: ids.length, problemas: problemas.length, resumo: resumo }
  }

  try {
    if (!$app.hasTable('anuncios_saude_execucoes') || !$app.hasTable('mercadolivre_contas')) return
    const agora = Date.now()
    const hoje = diaBrasilia(agora)

    // a) Execução travada há mais de 30 minutos vira erro.
    try {
      const travadas = $app.findRecordsByFilter(
        'anuncios_saude_execucoes',
        "status = 'Executando'",
        '',
        50,
        0,
      )
      for (let i = 0; i < travadas.length; i++) {
        const ini = new Date(travadas[i].getString('iniciada_em') || 0).getTime()
        if (!ini || agora - ini > 30 * 60 * 1000) {
          travadas[i].set('status', 'Erro')
          travadas[i].set('mensagem', 'A verificação não terminou (tempo esgotado).')
          $app.save(travadas[i])
        }
      }
    } catch (_) {}

    // b) A partir das 6h (Brasília), agenda a verificação do dia de cada conta conectada.
    if (horaBrasilia(agora) >= 6) {
      let contas = []
      try {
        contas = $app.findRecordsByFilter('mercadolivre_contas', "status = 'Conectada'", '', 500, 0)
      } catch (_) {
        contas = []
      }
      const colExec = $app.findCollectionByNameOrId('anuncios_saude_execucoes')
      for (let i = 0; i < contas.length; i++) {
        const empresaId = contas[i].getString('empresa_id')
        if (!empresaId) continue
        let jaTem = false
        try {
          const ex = $app.findRecordsByFilter(
            'anuncios_saude_execucoes',
            "empresa_id = '" +
              empresaId +
              "' && marketplace = 'mercadolivre' && origem = 'Agendada' && dia = '" +
              hoje +
              "'",
            '',
            1,
            0,
          )
          jaTem = ex && ex.length > 0
        } catch (_) {}
        if (jaTem) continue
        try {
          const emp = $app.findRecordById('empresas', empresaId)
          const rec = new Record(colExec)
          rec.set('assinante_id', emp.getString('assinante_id'))
          rec.set('empresa_id', empresaId)
          rec.set('marketplace', 'mercadolivre')
          rec.set('status', 'Pendente')
          rec.set('origem', 'Agendada')
          rec.set('dia', hoje)
          $app.save(rec)
        } catch (errAg) {
          console.log('[anuncios_saude] Falha ao agendar: ' + errAg)
        }
      }
    }

    // c) Processa UMA execução pendente por vez (a mais antiga).
    let pendentes = []
    try {
      pendentes = $app.findRecordsByFilter(
        'anuncios_saude_execucoes',
        "status = 'Pendente'",
        'created',
        1,
        0,
      )
    } catch (_) {
      pendentes = []
    }
    if (!pendentes || pendentes.length === 0) return
    const exec = pendentes[0]
    exec.set('status', 'Executando')
    exec.set('iniciada_em', new Date().toISOString())
    $app.save(exec)
    try {
      const r = verificarMercadoLivre(exec)
      exec.set('status', 'Concluída')
      exec.set('total_lidos', r.lidos)
      exec.set('total_problemas', r.problemas)
      exec.set('resumo', r.resumo)
      exec.set('mensagem', '')
    } catch (errExec) {
      exec.set('status', 'Erro')
      exec.set(
        'mensagem',
        String(errExec && errExec.message ? errExec.message : errExec).slice(0, 1000),
      )
    }
    exec.set('concluida_em', new Date().toISOString())
    $app.save(exec)
  } catch (err) {
    console.log(
      '[anuncios_saude] Erro no agendamento: ' + (err && err.message ? err.message : String(err)),
    )
  }
})
