// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório Personalizado (Montador) - Parte 1: Vendas e Compras (Prompt 8.6)
 * Rota: POST /backend/v1/relatorios/personalizado
 *
 * Parâmetros recebidos:
 * {
 *   base: 'itens_vendidos' | 'itens_comprados',
 *   agrupamentos: string[], // até 3 itens da lista permitida
 *   valores: string[],      // métricas da lista permitida
 *   filtros: ObjetoFiltrosRelatorio
 * }
 */

routerAdd('POST', '/backend/v1/relatorios/personalizado', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
  }

  const body = c.requestInfo().body || {}
  const base = String(body.base || '').trim()
  const agrupamentos = Array.isArray(body.agrupamentos)
    ? body.agrupamentos.map(String).filter(Boolean)
    : []
  const valores = Array.isArray(body.valores) ? body.valores.map(String).filter(Boolean) : []
  const f = body.filtros && typeof body.filtros === 'object' ? body.filtros : {}

  // 1. Validação estrita da base
  if (base !== 'itens_vendidos' && base !== 'itens_comprados') {
    return c.json(400, {
      sucesso: false,
      message:
        'Base de dados inválida. Escolha "Itens vendidos" (itens_vendidos) ou "Itens comprados" (itens_comprados).',
    })
  }

  // 2. Validação dos agrupamentos (máximo 3, lista permitida)
  if (agrupamentos.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione ao menos um nível de agrupamento.',
    })
  }
  if (agrupamentos.length > 3) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione no máximo 3 níveis de agrupamento.',
    })
  }

  const agrupamentosPermitidosVendas = [
    'empresa',
    'dia',
    'semana',
    'mes',
    'ano',
    'grupo',
    'categoria',
    'marca',
    'produto',
    'fornecedor_produto',
    'cliente',
    'uf_cliente',
    'cidade_cliente',
    'vendedor',
    'forma_pagamento',
    'canal',
    'terminal',
    'cfop',
    'ncm',
  ]

  const agrupamentosPermitidosCompras = [
    'empresa',
    'dia',
    'semana',
    'mes',
    'ano',
    'grupo',
    'categoria',
    'marca',
    'produto',
    'fornecedor_produto',
    'fornecedor_nota',
    'cfop_entrada',
    'tipo_entrada',
    'ncm',
  ]

  const listaAgrupamentosPermitidos =
    base === 'itens_vendidos' ? agrupamentosPermitidosVendas : agrupamentosPermitidosCompras

  for (let i = 0; i < agrupamentos.length; i++) {
    const ag = agrupamentos[i]
    if (!listaAgrupamentosPermitidos.includes(ag)) {
      return c.json(400, {
        sucesso: false,
        message: 'Agrupamento não permitido para esta base: ' + ag,
      })
    }
  }

  // 3. Validação das métricas de valores
  if (valores.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione ao menos um valor ou métrica para exibir no relatório.',
    })
  }

  const valoresPermitidosVendas = [
    'quantidade',
    'valor_bruto',
    'desconto',
    'valor_liquido',
    'custo',
    'margem_valor',
    'margem_percentual',
    'quantidade_vendas',
    'ticket_medio',
    'preco_medio',
    'percentual_total',
  ]

  const valoresPermitidosCompras = [
    'quantidade',
    'valor_produtos',
    'frete',
    'ipi',
    'icms_st',
    'credito_icms',
    'custo_total',
    'quantidade_notas',
    'preco_medio',
    'percentual_total',
  ]

  const listaValoresPermitidos =
    base === 'itens_vendidos' ? valoresPermitidosVendas : valoresPermitidosCompras

  for (let j = 0; j < valores.length; j++) {
    const v = valores[j]
    if (!listaValoresPermitidos.includes(v)) {
      return c.json(400, {
        sucesso: false,
        message: 'Valor/métrica não permitida para esta base: ' + v,
      })
    }
  }

  // 4. Validação de empresas e período (máximo 366 dias)
  const empresasIds = Array.isArray(f.empresas_ids)
    ? f.empresas_ids.map((x) => String(x).trim()).filter(Boolean)
    : []

  if (empresasIds.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione ao menos uma empresa para a consulta.',
    })
  }

  const periodo = f.periodo && typeof f.periodo === 'object' ? f.periodo : {}
  const dataInicio = String(periodo.dataInicio || f.data_inicio || '').trim()
  const dataFim = String(periodo.dataFim || f.data_fim || '').trim()

  if (!dataInicio || !dataFim) {
    return c.json(400, {
      sucesso: false,
      message: 'Data inicial e data final do período são obrigatórias.',
    })
  }

  const tIni = new Date(dataInicio + 'T00:00:00Z').getTime()
  const tFim = new Date(dataFim + 'T23:59:59Z').getTime()
  if (isNaN(tIni) || isNaN(tFim)) {
    return c.json(400, {
      sucesso: false,
      message: 'Formato de data inválido. Use AAAA-MM-DD.',
    })
  }
  if (tIni > tFim) {
    return c.json(400, {
      sucesso: false,
      message: 'A data inicial não pode ser superior à data final.',
    })
  }
  const diffDias = Math.ceil((tFim - tIni) / (1000 * 60 * 60 * 24))
  if (diffDias > 366) {
    return c.json(400, {
      sucesso: false,
      message: 'O período solicitado excede o limite máximo permitido de 366 dias.',
    })
  }

  // 5. Permissões de usuário (multiempresa, compras pode_ver, produtos pode_ver para custos/margens)
  const userId = authRecord.id
  let isAdmin = false
  let callerUser = null
  let podeVerCompras = false
  let podeVerProdutos = false

  try {
    const uRecs = $app.findRecordsByFilter(
      'usuarios',
      "auth_user_id = '" + userId + "' || id = '" + userId + "'",
      '',
      1,
      0,
    )
    if (uRecs.length > 0) callerUser = uRecs[0]

    if (callerUser && callerUser.getBool('ativo')) {
      const perfilRec = $app.findRecordById('perfis_acesso', callerUser.getString('perfil_id'))
      if (perfilRec && perfilRec.getBool('ativo')) {
        if (perfilRec.getBool('administrador')) {
          isAdmin = true
          podeVerCompras = true
          podeVerProdutos = true
        } else {
          // Permissões granulares da tabela permissoes
          const permissoesUser = $app.findRecordsByFilter(
            'permissoes',
            "perfil_id = '" + perfilRec.id + "'",
            '',
            500,
            0,
          )
          for (let pIdx = 0; pIdx < permissoesUser.length; pIdx++) {
            const p = permissoesUser[pIdx]
            const mod = p.getString('modulo')
            const podeV = p.getBool('pode_ver')
            if (mod === 'compras' && podeV) podeVerCompras = true
            if (mod === 'produtos' && podeV) podeVerProdutos = true
          }
        }
      }
    }
  } catch (_) {}

  // A base de compras exige o módulo compras (pode_ver)
  if (base === 'itens_comprados' && !podeVerCompras && !isAdmin) {
    return c.json(403, {
      sucesso: false,
      message: 'Acesso negado: a base de compras exige permissão no módulo de Compras.',
    })
  }

  // Validação de acesso às empresas
  if (!isAdmin) {
    if (!callerUser) {
      return c.json(403, { sucesso: false, message: 'Usuário não localizado no ERP.' })
    }
    const empresasPermitidas = new Set()
    const padraoId = callerUser.getString('empresa_padrao_id')
    if (padraoId) empresasPermitidas.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + callerUser.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) empresasPermitidas.add(eId)
      }
    } catch (_) {}

    for (let j = 0; j < empresasIds.length; j++) {
      const id = empresasIds[j]
      if (!empresasPermitidas.has(id)) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso negado: você não tem permissão para consultar a empresa ID ' + id + '.',
        })
      }
    }
  }

  // Custos e margens só para quem tem permissão de ver produtos
  const temPermissaoCustos = isAdmin || podeVerProdutos

  // 6. Carregamento de tabelas auxiliares para decodificação rápida
  const mapaEmpresas = new Map()
  for (let e = 0; e < empresasIds.length; e++) {
    try {
      const empRec = $app.findRecordById('empresas', empresasIds[e])
      mapaEmpresas.set(empRec.id, {
        id: empRec.id,
        codigo: empRec.getInt('codigo') || 0,
        razao_social: empRec.getString('razao_social'),
        nome_fantasia: empRec.getString('nome_fantasia') || empRec.getString('razao_social'),
        cnpj: empRec.getString('cnpj'),
        uf: (empRec.getString('uf') || 'ES').trim().toUpperCase(),
      })
    } catch (_) {}
  }

  const mapaProdutos = new Map()
  try {
    const prodsRecs = $app.findRecordsByFilter('produtos', '', '', 20000, 0)
    for (let pIdx = 0; pIdx < prodsRecs.length; pIdx++) {
      const pr = prodsRecs[pIdx]
      mapaProdutos.set(pr.id, {
        id: pr.id,
        codigo: pr.getInt('codigo') || 0,
        descricao: pr.getString('descricao'),
        grupo_id: pr.getString('grupo_id'),
        categoria_id: pr.getString('categoria_id'),
        marca_id: pr.getString('marca_id'),
        fornecedor_padrao_id: pr.getString('fornecedor_padrao_id'),
        ncm: pr.getString('ncm') || '',
        ativo: pr.getBool('ativo'),
        dados_fiscais_revisados: pr.getBool('dados_fiscais_revisados'),
      })
    }
  } catch (_) {}

  const mapaGrupos = new Map()
  try {
    const gruposRecs = $app.findRecordsByFilter('grupos', '', 'nome', 1500, 0)
    for (let gIdx = 0; gIdx < gruposRecs.length; gIdx++) {
      const grp = gruposRecs[gIdx]
      mapaGrupos.set(grp.id, grp.getString('nome'))
    }
  } catch (_) {}

  const mapaCategorias = new Map()
  try {
    const catsRecs = $app.findRecordsByFilter('categorias', '', 'nome', 2500, 0)
    for (let cIdx = 0; cIdx < catsRecs.length; cIdx++) {
      const ct = catsRecs[cIdx]
      mapaCategorias.set(ct.id, ct.getString('nome'))
    }
  } catch (_) {}

  const mapaMarcas = new Map()
  try {
    const marcasRecs = $app.findRecordsByFilter('marcas', '', 'nome', 2000, 0)
    for (let mIdx = 0; mIdx < marcasRecs.length; mIdx++) {
      const m = marcasRecs[mIdx]
      mapaMarcas.set(m.id, m.getString('nome'))
    }
  } catch (_) {}

  const mapaFornecedores = new Map()
  try {
    const fornsRecs = $app.findRecordsByFilter('fornecedores', '', 'razao_social', 5000, 0)
    for (let fIdx = 0; fIdx < fornsRecs.length; fIdx++) {
      const fr = fornsRecs[fIdx]
      mapaFornecedores.set(fr.id, {
        id: fr.id,
        nome: fr.getString('nome_fantasia') || fr.getString('razao_social') || 'Fornecedor',
        uf: (fr.getString('uf') || '').trim().toUpperCase(),
      })
    }
  } catch (_) {}

  const mapaClientes = new Map()
  try {
    const clsRecs = $app.findRecordsByFilter('clientes', '', 'nome_razao_social', 10000, 0)
    for (let clIdx = 0; clIdx < clsRecs.length; clIdx++) {
      const cl = clsRecs[clIdx]
      mapaClientes.set(cl.id, {
        id: cl.id,
        nome: cl.getString('nome_fantasia') || cl.getString('nome_razao_social') || 'Cliente',
        uf: (cl.getString('uf') || '').trim().toUpperCase(),
        cidade: (cl.getString('cidade') || '').trim(),
      })
    }
  } catch (_) {}

  const mapaVendedores = new Map()
  try {
    const usrRecs = $app.findRecordsByFilter('usuarios', '', 'nome', 1000, 0)
    for (let uIdx = 0; uIdx < usrRecs.length; uIdx++) {
      const u = usrRecs[uIdx]
      mapaVendedores.set(u.id, u.getString('nome') || 'Vendedor')
    }
  } catch (_) {}

  const mapaFormasPagamento = new Map()
  try {
    const fpRecs = $app.findRecordsByFilter('formas_pagamento', '', 'descricao', 500, 0)
    for (let fpIdx = 0; fpIdx < fpRecs.length; fpIdx++) {
      const fp = fpRecs[fpIdx]
      mapaFormasPagamento.set(fp.id, fp.getString('descricao'))
    }
  } catch (_) {}

  const mapaTerminais = new Map()
  try {
    const termRecs = $app.findRecordsByFilter('terminais_pdv', '', 'nome', 500, 0)
    for (let tIdx = 0; tIdx < termRecs.length; tIdx++) {
      const tr = termRecs[tIdx]
      mapaTerminais.set(tr.id, tr.getString('nome'))
    }
  } catch (_) {}

  const mapaIntermediadores = new Map()
  try {
    const intRecs = $app.findRecordsByFilter('intermediadores', '', 'nome', 1000, 0)
    for (let iIdx = 0; iIdx < intRecs.length; iIdx++) {
      const ir = intRecs[iIdx]
      mapaIntermediadores.set(ir.id, ir.getString('nome'))
    }
  } catch (_) {}

  // 7. Filtros do catálogo 8.0b
  const gruposIds = Array.isArray(f.grupos_ids) ? f.grupos_ids.map(String).filter(Boolean) : []
  const categoriasIds = Array.isArray(f.categorias_ids)
    ? f.categorias_ids.map(String).filter(Boolean)
    : []
  const marcasIds = Array.isArray(f.marcas_ids) ? f.marcas_ids.map(String).filter(Boolean) : []
  const produtosIds = Array.isArray(f.produtos_ids)
    ? f.produtos_ids.map(String).filter(Boolean)
    : []
  const fornecedoresProdutoIds = Array.isArray(f.fornecedores_produto_ids)
    ? f.fornecedores_produto_ids.map(String).filter(Boolean)
    : []
  const ncms = Array.isArray(f.ncms) ? f.ncms.map(String).filter(Boolean) : []
  const situacaoProduto = Array.isArray(f.situacao_produto)
    ? f.situacao_produto.map(String).filter(Boolean)
    : []
  const soFiscalNaoRevisado = Boolean(f.so_fiscal_nao_revisado)

  const clientesIds = Array.isArray(f.clientes_ids)
    ? f.clientes_ids.map(String).filter(Boolean)
    : []
  const fornecedoresIds = Array.isArray(f.fornecedores_ids)
    ? f.fornecedores_ids.map(String).filter(Boolean)
    : []
  const vendedoresIds = Array.isArray(f.vendedores_ids)
    ? f.vendedores_ids.map(String).filter(Boolean)
    : []
  const clienteUfs = Array.isArray(f.cliente_ufs)
    ? f.cliente_ufs.map((x) => String(x).toUpperCase()).filter(Boolean)
    : []
  const clienteCidades = Array.isArray(f.cliente_cidades)
    ? f.cliente_cidades.map((x) => String(x).toLowerCase()).filter(Boolean)
    : []

  const vendasTipos = Array.isArray(f.vendas_tipos)
    ? f.vendas_tipos.map(String).filter(Boolean)
    : []
  const formasPagamentoIds = Array.isArray(f.formas_pagamento_ids)
    ? f.formas_pagamento_ids.map(String).filter(Boolean)
    : []
  const terminaisPdvIds = Array.isArray(f.terminais_pdv_ids)
    ? f.terminais_pdv_ids.map(String).filter(Boolean)
    : []
  const intermediadoresIds = Array.isArray(f.intermediadores_ids)
    ? f.intermediadores_ids.map(String).filter(Boolean)
    : []
  const vendasNotaFiscal = f.vendas_nota_fiscal || 'todas'

  const fiscalCfops = Array.isArray(f.fiscal_cfops)
    ? f.fiscal_cfops.map(String).filter(Boolean)
    : []

  // Helpers de data e horário de Brasília
  function extrairDataBrasilia(dataStr) {
    if (!dataStr) return null
    const raw = String(dataStr).trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw
    }
    const d = new Date(raw)
    if (!d || isNaN(d.getTime())) return null
    const utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
    const spOffsetMillis = -3 * 60 * 60000
    const spDate = new Date(utcMillis + spOffsetMillis)

    const ano = spDate.getFullYear()
    const m = spDate.getMonth() + 1
    const dia = spDate.getDate()
    const mesStr = m < 10 ? '0' + m : String(m)
    const diaStr = dia < 10 ? '0' + dia : String(dia)
    return ano + '-' + mesStr + '-' + diaStr
  }

  function obterAno(dtIso) {
    return dtIso ? dtIso.substring(0, 4) : 'Outros'
  }

  function obterMes(dtIso) {
    return dtIso ? dtIso.substring(0, 7) : 'Outros' // YYYY-MM
  }

  function obterSemana(dtIso) {
    if (!dtIso) return 'Outros'
    const d = new Date(dtIso + 'T12:00:00Z')
    if (isNaN(d.getTime())) return 'Outros'
    // Semana do ano (ISO week)
    const target = new Date(d.valueOf())
    const dayNr = (d.getUTCDay() + 6) % 7
    target.setUTCDate(target.getUTCDate() - dayNr + 3)
    const firstThursday = target.valueOf()
    target.setUTCMonth(0, 1)
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7))
    }
    const weekNr = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
    const weekStr = weekNr < 10 ? '0' + weekNr : String(weekNr)
    return dtIso.substring(0, 4) + '-Sem ' + weekStr
  }

  function round2(valor) {
    const num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
    if (isNaN(num)) return 0
    return Math.round(num * 100) / 100
  }

  function round4(valor) {
    const num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
    if (isNaN(num)) return 0
    return Math.round(num * 10000) / 10000
  }

  function produtoAtendeFiltros(pId) {
    if (!pId) return false
    const pr = mapaProdutos.get(pId)
    if (!pr) return false

    if (produtosIds.length > 0 && !produtosIds.includes(pId)) return false
    if (gruposIds.length > 0 && (!pr.grupo_id || !gruposIds.includes(pr.grupo_id))) return false
    if (
      categoriasIds.length > 0 &&
      (!pr.categoria_id || !categoriasIds.includes(pr.categoria_id))
    ) {
      return false
    }
    if (marcasIds.length > 0 && (!pr.marca_id || !marcasIds.includes(pr.marca_id))) return false
    if (
      fornecedoresProdutoIds.length > 0 &&
      (!pr.fornecedor_padrao_id || !fornecedoresProdutoIds.includes(pr.fornecedor_padrao_id))
    ) {
      return false
    }
    if (ncms.length > 0) {
      let bateuNcm = false
      for (let n = 0; n < ncms.length; n++) {
        if (pr.ncm && pr.ncm.startsWith(ncms[n])) {
          bateuNcm = true
          break
        }
      }
      if (!bateuNcm) return false
    }
    if (situacaoProduto.length > 0) {
      const st = pr.ativo ? 'ativo' : 'inativo'
      if (!situacaoProduto.includes(st)) return false
    }
    if (soFiscalNaoRevisado && pr.dados_fiscais_revisados) return false

    return true
  }

  // =========================================================================================
  // PROCESSAMENTO DA BASE 1: ITENS VENDIDOS
  // =========================================================================================
  if (base === 'itens_vendidos') {
    // 1. Carregar vendas das empresas selecionadas com status 'Finalizada' e ativo = true
    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterVendas = '(' + empFilters + ") && ativo = true && status = 'Finalizada'"

    let vendasRecords = []
    try {
      vendasRecords = $app.findRecordsByFilter('vendas', filterVendas, 'data_emissao', 30000, 0)
    } catch (errV) {
      console.warn('Erro ao carregar vendas:', errV)
    }

    // Filtrar por período de data e filtros de venda/pessoa
    const vendasValidasMap = new Map() // venda_id -> { rec, dtIso, ufDestino, canalNome, canalTipo }
    const devolucoesValidasMap = new Map() // venda_id (tipo 'Devolução')
    const todasVendasIds = []

    for (let i = 0; i < vendasRecords.length; i++) {
      const v = vendasRecords[i]
      const dtIso = extrairDataBrasilia(v.getString('data_emissao') || v.getString('created'))
      if (!dtIso || dtIso < dataInicio || dtIso > dataFim) continue

      const tipo = v.getString('tipo') // 'PDV', 'Pedido', 'Devolução', 'Orçamento'
      if (tipo === 'Orçamento') continue

      // Filtro de tipos de vendas
      if (vendasTipos.length > 0 && !vendasTipos.includes(tipo)) continue

      // Filtro de clientes
      const clId = v.getString('cliente_id')
      if (clientesIds.length > 0 && !clientesIds.includes(clId)) continue

      const cl = clId ? mapaClientes.get(clId) : null
      if (clienteUfs.length > 0) {
        const ufc = cl ? cl.uf : ''
        if (!clienteUfs.includes(ufc)) continue
      }
      if (clienteCidades.length > 0) {
        const cid = cl ? cl.cidade.toLowerCase() : ''
        let bateuC = false
        for (let c = 0; c < clienteCidades.length; c++) {
          if (cid.includes(clienteCidades[c])) {
            bateuC = true
            break
          }
        }
        if (!bateuC) continue
      }

      // Filtro de vendedor
      const vendId = v.getString('vendedor_id')
      if (vendedoresIds.length > 0 && !vendedoresIds.includes(vendId)) continue

      // Filtro de terminais
      const termId = v.getString('pdv_terminal_id')
      if (terminaisPdvIds.length > 0 && !terminaisPdvIds.includes(termId)) continue

      // Filtro com/sem nota
      const docFiscalStatus = v.getString('documento_fiscal_status')
      if (vendasNotaFiscal === 'com_nota' && docFiscalStatus !== 'Autorizada') continue
      if (vendasNotaFiscal === 'sem_nota' && docFiscalStatus === 'Autorizada') continue

      if (tipo === 'Devolução') {
        devolucoesValidasMap.set(v.id, { rec: v, dtIso })
      } else {
        vendasValidasMap.set(v.id, { rec: v, dtIso })
      }
      todasVendasIds.push(v.id)
    }

    // Carregar documentos fiscais autorizados dessas vendas para UF e canal
    const docsFiscaisPorVenda = new Map()
    const loteTam = 40
    for (let l = 0; l < todasVendasIds.length; l += loteTam) {
      const pedaco = todasVendasIds.slice(l, l + loteTam)
      const filterDocs = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
      try {
        const docsLote = $app.findRecordsByFilter(
          'documentos_fiscais',
          '(' + filterDocs + ") && status = 'Autorizada' && ativo = true",
          '',
          1000,
          0,
        )
        for (let d = 0; d < docsLote.length; d++) {
          const docRec = docsLote[d]
          const vId = docRec.getString('venda_id')
          if (vId && !docsFiscaisPorVenda.has(vId)) {
            docsFiscaisPorVenda.set(vId, docRec)
          }
        }
      } catch (_) {}
    }

    // Carregar pagamentos das vendas para mapear forma de pagamento
    const formasPorVenda = new Map() // venda_id -> string forma de pagamento
    for (let l = 0; l < todasVendasIds.length; l += loteTam) {
      const pedaco = todasVendasIds.slice(l, l + loteTam)
      const filterPags = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
      try {
        const pagsLote = $app.findRecordsByFilter(
          'vendas_pagamentos',
          '(' + filterPags + ') && ativo = true',
          'created',
          2000,
          0,
        )
        for (let pg = 0; pg < pagsLote.length; pg++) {
          const pRec = pagsLote[pg]
          const vId = pRec.getString('venda_id')
          const fpId = pRec.getString('forma_pagamento_id')
          if (vId && fpId && !formasPorVenda.has(vId)) {
            formasPorVenda.set(vId, fpId)
          }
        }
      } catch (_) {}
    }

    // Se houver filtro de formas de pagamento, filtrar as vendas
    if (formasPagamentoIds.length > 0) {
      const vendasParaRemover = []
      for (const [vId] of vendasValidasMap.entries()) {
        const fpId = formasPorVenda.get(vId)
        if (!fpId || !formasPagamentoIds.includes(fpId)) {
          vendasParaRemover.push(vId)
        }
      }
      for (let r = 0; r < vendasParaRemover.length; r++) {
        vendasValidasMap.delete(vendasParaRemover[r])
      }
    }

    // Carregar itens das vendas válidas
    const vendasFinalIds = Array.from(vendasValidasMap.keys()).concat(
      Array.from(devolucoesValidasMap.keys()),
    )
    const itensValidos = [] // { rec, vendaInfo, ehDevolucao }

    for (let l = 0; l < vendasFinalIds.length; l += loteTam) {
      const pedaco = vendasFinalIds.slice(l, l + loteTam)
      const filterItens = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
      try {
        const itensLote = $app.findRecordsByFilter(
          'vendas_itens',
          '(' + filterItens + ') && ativo = true',
          'item',
          5000,
          0,
        )
        for (let it = 0; it < itensLote.length; it++) {
          const itemRec = itensLote[it]
          const vId = itemRec.getString('venda_id')
          const pId = itemRec.getString('produto_id')

          // Aplicação de filtros de produtos
          const temFiltroProd =
            gruposIds.length > 0 ||
            categoriasIds.length > 0 ||
            marcasIds.length > 0 ||
            produtosIds.length > 0 ||
            fornecedoresProdutoIds.length > 0 ||
            ncms.length > 0 ||
            situacaoProduto.length > 0 ||
            soFiscalNaoRevisado

          if (temFiltroProd && !produtoAtendeFiltros(pId)) {
            continue
          }

          // Filtro de CFOP
          const cfopItem = itemRec.getString('cfop')
          if (fiscalCfops.length > 0 && !fiscalCfops.includes(cfopItem)) {
            continue
          }

          const ehDev = devolucoesValidasMap.has(vId)
          const vInfo = ehDev ? devolucoesValidasMap.get(vId) : vendasValidasMap.get(vId)

          if (vInfo) {
            itensValidos.push({
              rec: itemRec,
              vendaInfo: vInfo,
              ehDevolucao: ehDev,
            })
          }
        }
      } catch (_) {}
    }

    // Helper para extrair o valor da dimensão para um agrupamento de venda
    function extrairDimensaoVenda(agrupamento, itemObj) {
      const itRec = itemObj.rec
      const vRec = itemObj.vendaInfo.rec
      const dtIso = itemObj.vendaInfo.dtIso
      const pId = itRec.getString('produto_id')
      const pr = mapaProdutos.get(pId)

      switch (agrupamento) {
        case 'empresa': {
          const empId = vRec.getString('empresa_id')
          const emp = mapaEmpresas.get(empId)
          return emp ? emp.nome_fantasia : 'Empresa ' + empId
        }
        case 'dia':
          return dtIso || 'Sem data'
        case 'semana':
          return obterSemana(dtIso)
        case 'mes':
          return obterMes(dtIso)
        case 'ano':
          return obterAno(dtIso)
        case 'grupo': {
          const gId = pr ? pr.grupo_id : ''
          return gId && mapaGrupos.has(gId) ? mapaGrupos.get(gId) : 'Sem Grupo'
        }
        case 'categoria': {
          const cId = pr ? pr.categoria_id : ''
          return cId && mapaCategorias.has(cId) ? mapaCategorias.get(cId) : 'Sem Categoria'
        }
        case 'marca': {
          const mId = pr ? pr.marca_id : ''
          return mId && mapaMarcas.has(mId) ? mapaMarcas.get(mId) : 'Sem Marca'
        }
        case 'produto': {
          if (!pr) return itRec.getString('descricao') || 'Produto sem cadastro'
          return (pr.codigo ? '[' + pr.codigo + '] ' : '') + pr.descricao
        }
        case 'fornecedor_produto': {
          const fId = pr ? pr.fornecedor_padrao_id : ''
          return fId && mapaFornecedores.has(fId)
            ? mapaFornecedores.get(fId).nome
            : 'Sem Fornecedor'
        }
        case 'cliente': {
          const cId = vRec.getString('cliente_id')
          return cId && mapaClientes.has(cId) ? mapaClientes.get(cId).nome : 'Consumidor / Balcão'
        }
        case 'uf_cliente': {
          const docFiscal = docsFiscaisPorVenda.get(vRec.id)
          if (docFiscal && docFiscal.getString('destinatario_uf')) {
            return docFiscal.getString('destinatario_uf').trim().toUpperCase()
          }
          const cId = vRec.getString('cliente_id')
          const cl = cId ? mapaClientes.get(cId) : null
          if (cl && cl.uf) return cl.uf
          const empId = vRec.getString('empresa_id')
          const emp = mapaEmpresas.get(empId)
          return emp ? emp.uf : 'ES'
        }
        case 'cidade_cliente': {
          const cId = vRec.getString('cliente_id')
          const cl = cId ? mapaClientes.get(cId) : null
          return cl && cl.cidade ? cl.cidade : 'Não informada'
        }
        case 'vendedor': {
          const vendId = vRec.getString('vendedor_id')
          return vendId && mapaVendedores.has(vendId) ? mapaVendedores.get(vendId) : 'Sem Vendedor'
        }
        case 'forma_pagamento': {
          const fpId = formasPorVenda.get(vRec.id)
          return fpId && mapaFormasPagamento.has(fpId)
            ? mapaFormasPagamento.get(fpId)
            : 'Não informada'
        }
        case 'canal': {
          const docFiscal = docsFiscaisPorVenda.get(vRec.id)
          const tipoVenda = vRec.getString('tipo')
          if (docFiscal && docFiscal.getString('modelo') === '55') {
            const interId = docFiscal.getString('intermediador_id')
            if (interId && mapaIntermediadores.has(interId)) {
              return 'Marketplace - ' + mapaIntermediadores.get(interId)
            }
            return 'Site Próprio (E-commerce)'
          } else if (tipoVenda === 'PDV') {
            return 'Balcão / PDV'
          }
          return 'Pedido de Venda'
        }
        case 'terminal': {
          const tId = vRec.getString('pdv_terminal_id')
          return tId && mapaTerminais.has(tId) ? mapaTerminais.get(tId) : 'Sem Terminal'
        }
        case 'cfop':
          return itRec.getString('cfop') || 'Sem CFOP'
        case 'ncm':
          return (pr && pr.ncm) || itRec.getString('ncm') || 'Sem NCM'
        default:
          return 'Outros'
      }
    }

    // Agrupamento hierárquico em até 3 níveis
    const tree = new Map()
    const totalGeralAcum = {
      quantidade: 0,
      valor_bruto: 0,
      desconto: 0,
      valor_liquido: 0,
      custo: 0,
      margem_valor: 0,
      vendasSet: new Set(),
    }

    for (let idx = 0; idx < itensValidos.length; idx++) {
      const itemObj = itensValidos[idx]
      const it = itemObj.rec
      const vId = itemObj.vendaInfo.rec.id
      const ehDev = itemObj.ehDevolucao

      const qtd = it.getFloat('quantidade') || 0
      const valBruto = it.getFloat('valor_total') || 0
      const desc = it.getFloat('desconto_valor') || 0
      const valLiq = Math.max(0, valBruto - desc)
      const custoUnit = it.getFloat('custo_unitario') || 0
      const custoTot = qtd * custoUnit

      const sinal = ehDev ? -1 : 1

      const effQtd = qtd * sinal
      const effBruto = valBruto * sinal
      const effDesc = desc * sinal
      const effLiq = valLiq * sinal
      const effCusto = custoTot * sinal

      // Chaves dos níveis
      const k1 = extrairDimensaoVenda(agrupamentos[0], itemObj)
      const k2 = agrupamentos.length > 1 ? extrairDimensaoVenda(agrupamentos[1], itemObj) : null
      const k3 = agrupamentos.length > 2 ? extrairDimensaoVenda(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          quantidade: 0,
          valor_bruto: 0,
          desconto: 0,
          valor_liquido: 0,
          custo: 0,
          vendasSet: new Set(),
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.quantidade += effQtd
      node1.valor_bruto += effBruto
      node1.desconto += effDesc
      node1.valor_liquido += effLiq
      node1.custo += effCusto
      if (!ehDev) node1.vendasSet.add(vId)

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            quantidade: 0,
            valor_bruto: 0,
            desconto: 0,
            valor_liquido: 0,
            custo: 0,
            vendasSet: new Set(),
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.quantidade += effQtd
        node2.valor_bruto += effBruto
        node2.desconto += effDesc
        node2.valor_liquido += effLiq
        node2.custo += effCusto
        if (!ehDev) node2.vendasSet.add(vId)

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              quantidade: 0,
              valor_bruto: 0,
              desconto: 0,
              valor_liquido: 0,
              custo: 0,
              vendasSet: new Set(),
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.quantidade += effQtd
          node3.valor_bruto += effBruto
          node3.desconto += effDesc
          node3.valor_liquido += effLiq
          node3.custo += effCusto
          if (!ehDev) node3.vendasSet.add(vId)
        }
      }

      totalGeralAcum.quantidade += effQtd
      totalGeralAcum.valor_bruto += effBruto
      totalGeralAcum.desconto += effDesc
      totalGeralAcum.valor_liquido += effLiq
      totalGeralAcum.custo += effCusto
      if (!ehDev) totalGeralAcum.vendasSet.add(vId)
    }

    const totalLiquidoGeral = Math.max(0, totalGeralAcum.valor_liquido)

    // Converter nós em linhas achatadas com identificadores de nível e subtotais
    const linhas = []

    function calcularMetricas(node) {
      const q = round2(node.quantidade)
      const vb = round2(node.valor_bruto)
      const desc = round2(node.desconto)
      const vl = round2(Math.max(0, node.valor_liquido))
      const c = temPermissaoCustos ? round2(node.custo) : null
      const mv = temPermissaoCustos ? round2(vl - (c || 0)) : null
      const mp = temPermissaoCustos && vl > 0 ? round2(((mv || 0) / vl) * 100) : null
      const qVendas = node.vendasSet ? node.vendasSet.size : 0
      const ticket = qVendas > 0 ? round2(vl / qVendas) : 0
      const precoMed = q > 0 ? round2(vl / q) : 0
      const pctTotal = totalLiquidoGeral > 0 ? round2((vl / totalLiquidoGeral) * 100) : 0

      return {
        quantidade: q,
        valor_bruto: vb,
        desconto: desc,
        valor_liquido: vl,
        custo: c,
        margem_valor: mv,
        margem_percentual: mp,
        quantidade_vendas: qVendas,
        ticket_medio: ticket,
        preco_medio: precoMed,
        percentual_total: pctTotal,
      }
    }

    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricas(n1)
      const temFilhosN1 = n1.filhos.size > 0

      linhas.push({
        nivel: 1,
        eh_subtotal: temFilhosN1,
        grupo_1: k1,
        grupo_2: null,
        grupo_3: null,
        rotulo: k1,
        metricas: metricasN1,
      })

      if (temFilhosN1) {
        for (const [k2, n2] of n1.filhos.entries()) {
          const metricasN2 = calcularMetricas(n2)
          const temFilhosN2 = n2.filhos.size > 0

          linhas.push({
            nivel: 2,
            eh_subtotal: temFilhosN2,
            grupo_1: k1,
            grupo_2: k2,
            grupo_3: null,
            rotulo: k2,
            metricas: metricasN2,
          })

          if (temFilhosN2) {
            for (const [k3, n3] of n2.filhos.entries()) {
              const metricasN3 = calcularMetricas(n3)
              linhas.push({
                nivel: 3,
                eh_subtotal: false,
                grupo_1: k1,
                grupo_2: k2,
                grupo_3: k3,
                rotulo: k3,
                metricas: metricasN3,
              })
            }
          }
        }
      }
    }

    // Regra do limite de 5.000 linhas
    if (linhas.length > 5000) {
      return c.json(400, {
        sucesso: false,
        totalLinhas: linhas.length,
        message:
          'O relatório gerou ' +
          linhas.length +
          ' linhas (limite máximo de 5.000 linhas). Por favor, aplique mais filtros para refinar a consulta.',
      })
    }

    // Total Geral
    const totalGeralMetricas = {
      quantidade: round2(totalGeralAcum.quantidade),
      valor_bruto: round2(totalGeralAcum.valor_bruto),
      desconto: round2(totalGeralAcum.desconto),
      valor_liquido: round2(totalLiquidoGeral),
      custo: temPermissaoCustos ? round2(totalGeralAcum.custo) : null,
      margem_valor: temPermissaoCustos ? round2(totalLiquidoGeral - totalGeralAcum.custo) : null,
      margem_percentual:
        temPermissaoCustos && totalLiquidoGeral > 0
          ? round2(((totalLiquidoGeral - totalGeralAcum.custo) / totalLiquidoGeral) * 100)
          : null,
      quantidade_vendas: totalGeralAcum.vendasSet.size,
      ticket_medio:
        totalGeralAcum.vendasSet.size > 0
          ? round2(totalLiquidoGeral / totalGeralAcum.vendasSet.size)
          : 0,
      preco_medio:
        totalGeralAcum.quantidade > 0 ? round2(totalLiquidoGeral / totalGeralAcum.quantidade) : 0,
      percentual_total: 100,
    }

    // Séries para gráfico se o primeiro agrupamento for tempo ou tiver até 20 linhas
    const ehTempo = ['dia', 'semana', 'mes', 'ano'].includes(agrupamentos[0])
    const podeGrafico = ehTempo || tree.size <= 20
    let dadosGrafico = null

    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricas(n1)
        dadosGrafico.push({
          rotulo: k1,
          valor_liquido: m.valor_liquido,
          quantidade: m.quantidade,
          margem_valor: m.margem_valor,
          ticket_medio: m.ticket_medio,
        })
      }
      if (ehTempo) {
        dadosGrafico.sort((a, b) => a.rotulo.localeCompare(b.rotulo))
      } else {
        dadosGrafico.sort((a, b) => b.valor_liquido - a.valor_liquido)
      }
    }

    return c.json(200, {
      sucesso: true,
      base: 'itens_vendidos',
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos,
    })
  }

  // =========================================================================================
  // PROCESSAMENTO DA BASE 2: ITENS COMPRADOS
  // =========================================================================================
  if (base === 'itens_comprados') {
    // 1. Carregar notas de entrada Lançadas no período
    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterNotas = '(' + empFilters + ") && ativo = true && status = 'Lançada'"

    let notasRecords = []
    try {
      notasRecords = $app.findRecordsByFilter(
        'notas_entrada',
        filterNotas,
        'data_entrada',
        25000,
        0,
      )
    } catch (errN) {
      console.warn('Erro ao carregar notas de entrada:', errN)
    }

    const notasValidasMap = new Map() // nota_id -> { rec, dtIso }
    const todasNotasIds = []

    for (let i = 0; i < notasRecords.length; i++) {
      const n = notasRecords[i]
      // Data de referência: data_entrada ou data_emissao
      const dtRef =
        f.tipo_data === 'emissao' ? n.getString('data_emissao') : n.getString('data_entrada')
      const dtIso = extrairDataBrasilia(dtRef || n.getString('created'))
      if (!dtIso || dtIso < dataInicio || dtIso > dataFim) continue

      const fId = n.getString('fornecedor_id')
      if (fornecedoresIds.length > 0 && !fornecedoresIds.includes(fId)) continue

      notasValidasMap.set(n.id, { rec: n, dtIso })
      todasNotasIds.push(n.id)
    }

    // Carregar itens dessas notas de entrada
    const loteTam = 40
    const itensValidos = [] // { rec, notaInfo }

    for (let l = 0; l < todasNotasIds.length; l += loteTam) {
      const pedaco = todasNotasIds.slice(l, l + loteTam)
      const filterItens = pedaco.map((id) => "nota_id = '" + id + "'").join(' || ')
      try {
        const itensLote = $app.findRecordsByFilter(
          'notas_entrada_itens',
          '(' + filterItens + ') && ativo = true',
          'numero_item',
          5000,
          0,
        )
        for (let it = 0; it < itensLote.length; it++) {
          const itemRec = itensLote[it]
          const nId = itemRec.getString('nota_id')
          const pId = itemRec.getString('produto_id')

          // Aplicação de filtros de produtos
          const temFiltroProd =
            gruposIds.length > 0 ||
            categoriasIds.length > 0 ||
            marcasIds.length > 0 ||
            produtosIds.length > 0 ||
            fornecedoresProdutoIds.length > 0 ||
            ncms.length > 0 ||
            situacaoProduto.length > 0 ||
            soFiscalNaoRevisado

          if (temFiltroProd && !produtoAtendeFiltros(pId)) {
            continue
          }

          // Filtro de CFOP
          const cfopItem = itemRec.getString('cfop_entrada') || itemRec.getString('cfop_fornecedor')
          if (fiscalCfops.length > 0 && !fiscalCfops.includes(cfopItem)) {
            continue
          }

          const nInfo = notasValidasMap.get(nId)
          if (nInfo) {
            itensValidos.push({
              rec: itemRec,
              notaInfo: nInfo,
            })
          }
        }
      } catch (_) {}
    }

    // Helper para extrair a dimensão para um agrupamento de compras
    function extrairDimensaoCompras(agrupamento, itemObj) {
      const itRec = itemObj.rec
      const nRec = itemObj.notaInfo.rec
      const dtIso = itemObj.notaInfo.dtIso
      const pId = itRec.getString('produto_id')
      const pr = mapaProdutos.get(pId)

      switch (agrupamento) {
        case 'empresa': {
          const empId = nRec.getString('empresa_id')
          const emp = mapaEmpresas.get(empId)
          return emp ? emp.nome_fantasia : 'Empresa ' + empId
        }
        case 'dia':
          return dtIso || 'Sem data'
        case 'semana':
          return obterSemana(dtIso)
        case 'mes':
          return obterMes(dtIso)
        case 'ano':
          return obterAno(dtIso)
        case 'grupo': {
          const gId = pr ? pr.grupo_id : ''
          return gId && mapaGrupos.has(gId) ? mapaGrupos.get(gId) : 'Sem Grupo'
        }
        case 'categoria': {
          const cId = pr ? pr.categoria_id : ''
          return cId && mapaCategorias.has(cId) ? mapaCategorias.get(cId) : 'Sem Categoria'
        }
        case 'marca': {
          const mId = pr ? pr.marca_id : ''
          return mId && mapaMarcas.has(mId) ? mapaMarcas.get(mId) : 'Sem Marca'
        }
        case 'produto': {
          if (!pr) return itRec.getString('descricao_fornecedor') || 'Item sem cadastro'
          return (pr.codigo ? '[' + pr.codigo + '] ' : '') + pr.descricao
        }
        case 'fornecedor_produto': {
          const fId = pr ? pr.fornecedor_padrao_id : ''
          return fId && mapaFornecedores.has(fId)
            ? mapaFornecedores.get(fId).nome
            : 'Sem Fornecedor Padrão'
        }
        case 'fornecedor_nota': {
          const fnId = nRec.getString('fornecedor_id')
          return fnId && mapaFornecedores.has(fnId)
            ? mapaFornecedores.get(fnId).nome
            : 'Fornecedor da Nota'
        }
        case 'cfop_entrada':
          return itRec.getString('cfop_entrada') || itRec.getString('cfop_fornecedor') || 'Sem CFOP'
        case 'tipo_entrada':
          return nRec.getString('tipo_entrada') || 'Não informado'
        case 'ncm':
          return (pr && pr.ncm) || itRec.getString('ncm_fornecedor') || 'Sem NCM'
        default:
          return 'Outros'
      }
    }

    // Agrupamento hierárquico em até 3 níveis
    const tree = new Map()
    const totalGeralAcum = {
      quantidade: 0,
      valor_produtos: 0,
      frete: 0,
      ipi: 0,
      icms_st: 0,
      credito_icms: 0,
      custo_total: 0,
      notasSet: new Set(),
    }

    for (let idx = 0; idx < itensValidos.length; idx++) {
      const itemObj = itensValidos[idx]
      const it = itemObj.rec
      const nId = itemObj.notaInfo.rec.id

      const qtd = it.getFloat('quantidade_estoque') || it.getFloat('quantidade_fornecedor') || 0
      const valProd = it.getFloat('valor_produto') || 0
      const frete = it.getFloat('valor_frete') || 0
      const ipi = it.getFloat('valor_ipi') || 0
      const icmsSt = (it.getFloat('valor_icms_st') || 0) + (it.getFloat('valor_fcp_st') || 0)
      const credIcms = it.getFloat('valor_credito_icms') || 0
      const custoTot = it.getFloat('custo_total_item') || valProd + frete + ipi + icmsSt

      const k1 = extrairDimensaoCompras(agrupamentos[0], itemObj)
      const k2 = agrupamentos.length > 1 ? extrairDimensaoCompras(agrupamentos[1], itemObj) : null
      const k3 = agrupamentos.length > 2 ? extrairDimensaoCompras(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          quantidade: 0,
          valor_produtos: 0,
          frete: 0,
          ipi: 0,
          icms_st: 0,
          credito_icms: 0,
          custo_total: 0,
          notasSet: new Set(),
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.quantidade += qtd
      node1.valor_produtos += valProd
      node1.frete += frete
      node1.ipi += ipi
      node1.icms_st += icmsSt
      node1.credito_icms += credIcms
      node1.custo_total += custoTot
      node1.notasSet.add(nId)

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            quantidade: 0,
            valor_produtos: 0,
            frete: 0,
            ipi: 0,
            icms_st: 0,
            credito_icms: 0,
            custo_total: 0,
            notasSet: new Set(),
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.quantidade += qtd
        node2.valor_produtos += valProd
        node2.frete += frete
        node2.ipi += ipi
        node2.icms_st += icmsSt
        node2.credito_icms += credIcms
        node2.custo_total += custoTot
        node2.notasSet.add(nId)

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              quantidade: 0,
              valor_produtos: 0,
              frete: 0,
              ipi: 0,
              icms_st: 0,
              credito_icms: 0,
              custo_total: 0,
              notasSet: new Set(),
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.quantidade += qtd
          node3.valor_produtos += valProd
          node3.frete += frete
          node3.ipi += ipi
          node3.icms_st += icmsSt
          node3.credito_icms += credIcms
          node3.custo_total += custoTot
          node3.notasSet.add(nId)
        }
      }

      totalGeralAcum.quantidade += qtd
      totalGeralAcum.valor_produtos += valProd
      totalGeralAcum.frete += frete
      totalGeralAcum.ipi += ipi
      totalGeralAcum.icms_st += icmsSt
      totalGeralAcum.credito_icms += credIcms
      totalGeralAcum.custo_total += custoTot
      totalGeralAcum.notasSet.add(nId)
    }

    const totalCustoGeral = Math.max(0, totalGeralAcum.custo_total)

    function calcularMetricasCompras(node) {
      const q = round2(node.quantidade)
      const vp = round2(node.valor_produtos)
      const fr = round2(node.frete)
      const ip = round2(node.ipi)
      const st = round2(node.icms_st)
      const cr = round2(node.credito_icms)
      const ct = round2(node.custo_total)
      const qNotas = node.notasSet ? node.notasSet.size : 0
      const precoMed = q > 0 ? round2(vp / q) : 0
      const pctTot = totalCustoGeral > 0 ? round2((ct / totalCustoGeral) * 100) : 0

      return {
        quantidade: q,
        valor_produtos: vp,
        frete: fr,
        ipi: ip,
        icms_st: st,
        credito_icms: cr,
        custo_total: ct,
        quantidade_notas: qNotas,
        preco_medio: precoMed,
        percentual_total: pctTot,
      }
    }

    const linhas = []
    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricasCompras(n1)
      const temFilhosN1 = n1.filhos.size > 0

      linhas.push({
        nivel: 1,
        eh_subtotal: temFilhosN1,
        grupo_1: k1,
        grupo_2: null,
        grupo_3: null,
        rotulo: k1,
        metricas: metricasN1,
      })

      if (temFilhosN1) {
        for (const [k2, n2] of n1.filhos.entries()) {
          const metricasN2 = calcularMetricasCompras(n2)
          const temFilhosN2 = n2.filhos.size > 0

          linhas.push({
            nivel: 2,
            eh_subtotal: temFilhosN2,
            grupo_1: k1,
            grupo_2: k2,
            grupo_3: null,
            rotulo: k2,
            metricas: metricasN2,
          })

          if (temFilhosN2) {
            for (const [k3, n3] of n2.filhos.entries()) {
              const metricasN3 = calcularMetricasCompras(n3)
              linhas.push({
                nivel: 3,
                eh_subtotal: false,
                grupo_1: k1,
                grupo_2: k2,
                grupo_3: k3,
                rotulo: k3,
                metricas: metricasN3,
              })
            }
          }
        }
      }
    }

    if (linhas.length > 5000) {
      return c.json(400, {
        sucesso: false,
        totalLinhas: linhas.length,
        message:
          'O relatório gerou ' +
          linhas.length +
          ' linhas (limite máximo de 5.000 linhas). Por favor, aplique mais filtros para refinar a consulta.',
      })
    }

    const totalGeralMetricas = {
      quantidade: round2(totalGeralAcum.quantidade),
      valor_produtos: round2(totalGeralAcum.valor_produtos),
      frete: round2(totalGeralAcum.frete),
      ipi: round2(totalGeralAcum.ipi),
      icms_st: round2(totalGeralAcum.icms_st),
      credito_icms: round2(totalGeralAcum.credito_icms),
      custo_total: round2(totalCustoGeral),
      quantidade_notas: totalGeralAcum.notasSet.size,
      preco_medio:
        totalGeralAcum.quantidade > 0
          ? round2(totalGeralAcum.valor_produtos / totalGeralAcum.quantidade)
          : 0,
      percentual_total: 100,
    }

    const ehTempo = ['dia', 'semana', 'mes', 'ano'].includes(agrupamentos[0])
    const podeGrafico = ehTempo || tree.size <= 20
    let dadosGrafico = null

    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricasCompras(n1)
        dadosGrafico.push({
          rotulo: k1,
          custo_total: m.custo_total,
          valor_produtos: m.valor_produtos,
          quantidade: m.quantidade,
        })
      }
      if (ehTempo) {
        dadosGrafico.sort((a, b) => a.rotulo.localeCompare(b.rotulo))
      } else {
        dadosGrafico.sort((a, b) => b.custo_total - a.custo_total)
      }
    }

    return c.json(200, {
      sucesso: true,
      base: 'itens_comprados',
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos: true, // quem vê compras vê os custos de compra
    })
  }

  return c.json(400, { sucesso: false, message: 'Base não suportada.' })
})
