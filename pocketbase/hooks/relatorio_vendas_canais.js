// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório: Vendas por Loja e por Canal (Etapa 8 - Prompt 8.2)
 * Rota: POST /backend/v1/relatorios/vendas-canais
 *
 * Parâmetros:
 * {
 *   filtros: ObjetoFiltrosRelatorio
 * }
 */

routerAdd('POST', '/backend/v1/relatorios/vendas-canais', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
  }

  const body = c.requestInfo().body || {}
  const f = body.filtros && typeof body.filtros === 'object' ? body.filtros : body

  // Normalização de empresas
  const empresasIds = Array.isArray(f.empresas_ids)
    ? f.empresas_ids.map((x) => String(x).trim()).filter(Boolean)
    : []

  if (empresasIds.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione ao menos uma empresa para a consulta.',
    })
  }

  // Período
  const periodo = f.periodo && typeof f.periodo === 'object' ? f.periodo : {}
  const dataInicio = String(periodo.dataInicio || f.data_inicio || '').trim()
  const dataFim = String(periodo.dataFim || f.data_fim || '').trim()

  if (!dataInicio || !dataFim) {
    return c.json(400, {
      sucesso: false,
      message: 'Data inicial e final do período são obrigatórias.',
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

  // Conferência de permissões multiempresa
  const userId = authRecord.id
  let isAdmin = false
  let callerUser = null

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
        } else {
          // Checar permissão vendas
          const perms = $app.findRecordsByFilter(
            'permissoes',
            "perfil_id = '" + perfilRec.id + "' && modulo = 'vendas'",
            '',
            1,
            0,
          )
          if (perms.length > 0 && perms[0].getBool('pode_ver')) {
            // tem permissão vendas
          } else {
            return c.json(403, {
              sucesso: false,
              message: 'Acesso negado: módulo Vendas é obrigatório para este relatório.',
            })
          }
        }
      }
    }
  } catch (_) {}

  try {
    for (let j = 0; j < empresasIds.length; j++) {
      exigirEmpresaDoUsuario(authRecord, empresasIds[j])
    }
  } catch (errEmp) {
    return c.json(403, {
      sucesso: false,
      message:
        errEmp && errEmp.message
          ? errEmp.message
          : 'Acesso negado: você não tem permissão para consultar as empresas selecionadas.',
    })
  }

  // Cálculo dos períodos de comparação:
  // 1. Período anterior de mesmo tamanho (exatamente diffDias dias antes de dataInicio)
  // 2. Mesmo período do ano anterior (exatamente 1 ano antes: mesmo mês e dia, ou ajustado)
  function subtrairDias(dateIsoStr, numDias) {
    const dt = new Date(dateIsoStr + 'T12:00:00Z')
    dt.setUTCDate(dt.getUTCDate() - numDias)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }

  function subtrairUmAno(dateIsoStr) {
    const p = dateIsoStr.split('-')
    const ano = parseInt(p[0], 10) - 1
    const mes = p[1]
    let dia = p[2]
    // Tratamento para 29 de fevereiro em ano bissexto
    if (mes === '02' && dia === '29') {
      dia = '28'
    }
    return ano + '-' + mes + '-' + dia
  }

  const antFim = subtrairDias(dataInicio, 1)
  const antIni = subtrairDias(antFim, diffDias - 1)

  const anoAntIni = subtrairUmAno(dataInicio)
  const anoAntFim = subtrairUmAno(dataFim)

  // Filtros de produto do 8.0b
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

  const temFiltroProduto =
    gruposIds.length > 0 ||
    categoriasIds.length > 0 ||
    marcasIds.length > 0 ||
    produtosIds.length > 0 ||
    fornecedoresProdutoIds.length > 0 ||
    ncms.length > 0 ||
    situacaoProduto.length > 0 ||
    soFiscalNaoRevisado

  // Filtros de pessoas
  const clientesIds = Array.isArray(f.clientes_ids)
    ? f.clientes_ids.map(String).filter(Boolean)
    : []
  const vendedoresIds = Array.isArray(f.vendedores_ids)
    ? f.vendedores_ids.map(String).filter(Boolean)
    : []
  const operadoresCaixaIds = Array.isArray(f.operadores_caixa_ids)
    ? f.operadores_caixa_ids.map(String).filter(Boolean)
    : []
  const clienteUfs = Array.isArray(f.cliente_ufs)
    ? f.cliente_ufs.map((u) => String(u).toUpperCase()).filter(Boolean)
    : []
  const clienteCidades = Array.isArray(f.cliente_cidades)
    ? f.cliente_cidades.map((c) => String(c).toLowerCase()).filter(Boolean)
    : []

  // Filtros de vendas
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

  // Carregar dados cadastrais das empresas marcadas
  const mapaEmpresas = new Map()
  for (let e = 0; e < empresasIds.length; e++) {
    try {
      const empRec = $app.findRecordById('empresas', empresasIds[e])
      mapaEmpresas.set(empRec.id, {
        id: empRec.id,
        razao_social: empRec.getString('razao_social'),
        nome_fantasia: empRec.getString('nome_fantasia') || empRec.getString('razao_social'),
        cnpj: empRec.getString('cnpj'),
        uf: (empRec.getString('uf') || 'ES').trim().toUpperCase(),
        codigo: empRec.getInt('codigo') || 0,
      })
    } catch (_) {}
  }

  // Carregar clientes relevantes para obter UF, cidade e dados cadastrais
  const mapaClientes = new Map()
  try {
    const clientesRecs = $app.findRecordsByFilter('clientes', 'ativo = true', '', 10000, 0)
    for (let cIdx = 0; cIdx < clientesRecs.length; cIdx++) {
      const cl = clientesRecs[cIdx]
      mapaClientes.set(cl.id, {
        id: cl.id,
        nome: cl.getString('nome_razao_social') || cl.getString('nome_fantasia') || 'Cliente',
        uf: (cl.getString('uf') || '').trim().toUpperCase(),
        cidade: (cl.getString('cidade') || '').trim(),
      })
    }
  } catch (_) {}

  // Carregar intermediadores cadastrados
  const mapaIntermediadores = new Map()
  try {
    const intRecs = $app.findRecordsByFilter('intermediadores', 'ativo = true', 'nome', 1000, 0)
    for (let iIdx = 0; iIdx < intRecs.length; iIdx++) {
      const itemInter = intRecs[iIdx]
      mapaIntermediadores.set(itemInter.id, {
        id: itemInter.id,
        nome: itemInter.getString('nome'),
        cnpj: itemInter.getString('cnpj'),
      })
    }
  } catch (_) {}

  // Carregar grupos e categorias cadastrados
  const mapaGrupos = new Map()
  try {
    const gruposRecs = $app.findRecordsByFilter('grupos', 'ativo = true', 'nome', 1000, 0)
    for (let gIdx = 0; gIdx < gruposRecs.length; gIdx++) {
      const g = gruposRecs[gIdx]
      mapaGrupos.set(g.id, { id: g.id, nome: g.getString('nome') })
    }
  } catch (_) {}

  const mapaCategorias = new Map()
  try {
    const catRecs = $app.findRecordsByFilter('categorias', 'ativo = true', 'nome', 2000, 0)
    for (let ctIdx = 0; ctIdx < catRecs.length; ctIdx++) {
      const cat = catRecs[ctIdx]
      mapaCategorias.set(cat.id, {
        id: cat.id,
        nome: cat.getString('nome'),
        grupo_id: cat.getString('grupo_id'),
      })
    }
  } catch (_) {}

  // Carregar produtos com grupo_id, categoria_id, marca_id, fornecedor_id, ncm, etc.
  const mapaProdutos = new Map()
  try {
    const prodsRecs = $app.findRecordsByFilter('produtos', '', '', 15000, 0)
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
        ncm: pr.getString('ncm'),
        ativo: pr.getBool('ativo'),
        dados_fiscais_revisados: pr.getBool('dados_fiscais_revisados'),
      })
    }
  } catch (_) {}

  // Carregar formas de pagamento
  const mapaFormasPagamento = new Map()
  try {
    const fpsRecs = $app.findRecordsByFilter(
      'formas_pagamento',
      'ativo = true',
      'descricao',
      500,
      0,
    )
    for (let fpIdx = 0; fpIdx < fpsRecs.length; fpIdx++) {
      const fp = fpsRecs[fpIdx]
      mapaFormasPagamento.set(fp.id, {
        id: fp.id,
        descricao: fp.getString('descricao'),
        tipo: fp.getString('tipo'),
        taxa_percentual_padrao: fp.getFloat('taxa_percentual_padrao') || 0,
      })
    }
  } catch (_) {}

  // Helper para verificar se um produto atende aos filtros de produto do 8.0b
  function produtoAtendeFiltros(produtoId) {
    if (!temFiltroProduto) return true
    if (!produtoId) return false
    const pr = mapaProdutos.get(produtoId)
    if (!pr) return false

    if (produtosIds.length > 0 && !produtosIds.includes(produtoId)) {
      return false
    }
    if (gruposIds.length > 0 && (!pr.grupo_id || !gruposIds.includes(pr.grupo_id))) {
      return false
    }
    if (
      categoriasIds.length > 0 &&
      (!pr.categoria_id || !categoriasIds.includes(pr.categoria_id))
    ) {
      return false
    }
    if (marcasIds.length > 0 && (!pr.marca_id || !marcasIds.includes(pr.marca_id))) {
      return false
    }
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
      const stPr = pr.ativo ? 'ativo' : 'inativo'
      if (!situacaoProduto.includes(stPr)) return false
    }
    if (soFiscalNaoRevisado && pr.dados_fiscais_revisados) {
      return false
    }
    return true
  }

  // Helper para extrair data ISO (YYYY-MM-DD) no horário de Brasília (UTC-3)
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

  function round2(valor) {
    const num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
    if (isNaN(num)) return 0
    return Math.round(num * 100) / 100
  }

  // Função para carregar e agregar vendas de um determinado intervalo de datas
  function processarVendasDoPeriodo(iniIso, fimIso, ehPeriodoPrincipal) {
    // Monta o filtro das empresas
    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterPrincipal = '(' + empFilters + ") && ativo = true && status = 'Finalizada'"

    let vendasRecords = []
    try {
      vendasRecords = $app.findRecordsByFilter('vendas', filterPrincipal, 'data_emissao', 25000, 0)
    } catch (errV) {
      console.warn('Erro ao carregar vendas:', errV)
    }

    // Filtrar por data no horário de Brasília
    const vendasValidas = []
    for (let i = 0; i < vendasRecords.length; i++) {
      const v = vendasRecords[i]
      const dtEmissao = v.getString('data_emissao') || v.getString('created')
      const dtIso = extrairDataBrasilia(dtEmissao)
      if (!dtIso) continue

      if (dtIso >= iniIso && dtIso <= fimIso) {
        vendasValidas.push({
          rec: v,
          dtIso: dtIso,
        })
      }
    }

    // Se houver filtros de pessoas ou vendas adicionais, aplica agora
    const vendasFiltradas = []
    for (let j = 0; j < vendasValidas.length; j++) {
      const itemV = vendasValidas[j]
      const v = itemV.rec

      const tipoVenda = v.getString('tipo') // 'PDV', 'Pedido', 'Devolução', 'Orçamento'
      if (tipoVenda === 'Orçamento') {
        continue // Orçamentos não entram
      }

      if (vendasTipos.length > 0 && !vendasTipos.includes(tipoVenda)) {
        continue
      }

      const clienteId = v.getString('cliente_id')
      if (clientesIds.length > 0 && !clientesIds.includes(clienteId)) {
        continue
      }

      const cl = clienteId ? mapaClientes.get(clienteId) : null
      if (clienteUfs.length > 0) {
        const clUf = cl ? cl.uf : ''
        if (!clienteUfs.includes(clUf)) {
          continue
        }
      }
      if (clienteCidades.length > 0) {
        const clCid = cl ? cl.cidade.toLowerCase() : ''
        let bateuCid = false
        for (let c = 0; c < clienteCidades.length; c++) {
          if (clCid.includes(clienteCidades[c])) {
            bateuCid = true
            break
          }
        }
        if (!bateuCid) continue
      }

      const vendedorId = v.getString('vendedor_id')
      if (vendedoresIds.length > 0 && !vendedoresIds.includes(vendedorId)) {
        continue
      }

      const operadorId = v.getString('operador_id')
      if (operadoresCaixaIds.length > 0 && !operadoresCaixaIds.includes(operadorId)) {
        continue
      }

      const termId = v.getString('pdv_terminal_id')
      if (terminaisPdvIds.length > 0 && !terminaisPdvIds.includes(termId)) {
        continue
      }

      const docFiscalStatus = v.getString('documento_fiscal_status')
      if (vendasNotaFiscal === 'com_nota' && docFiscalStatus !== 'Autorizada') {
        continue
      }
      if (vendasNotaFiscal === 'sem_nota' && docFiscalStatus === 'Autorizada') {
        continue
      }

      vendasFiltradas.push(itemV)
    }

    // Carregar itens de vendas e documentos fiscais se for o período principal ou se houver filtro de produto
    const vendaIds = vendasFiltradas.map((x) => x.rec.id)
    const itensPorVenda = new Map() // venda_id -> Array<Record>
    const docsFiscaisPorVenda = new Map() // venda_id -> Record

    // Carregar itens em lotes
    if (ehPeriodoPrincipal || temFiltroProduto) {
      const loteTam = 40
      for (let l = 0; l < vendaIds.length; l += loteTam) {
        const pedaco = vendaIds.slice(l, l + loteTam)
        const filterItens = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
        try {
          const itensLote = $app.findRecordsByFilter(
            'vendas_itens',
            '(' + filterItens + ') && ativo = true',
            'item',
            5000,
            0,
          )
          for (let itIdx = 0; itIdx < itensLote.length; itIdx++) {
            const itRec = itensLote[itIdx]
            const vId = itRec.getString('venda_id')
            if (!itensPorVenda.has(vId)) {
              itensPorVenda.set(vId, [])
            }
            itensPorVenda.get(vId).push(itRec)
          }
        } catch (_) {}
      }

      // Carregar documentos fiscais vinculados às vendas autorizadas
      for (let l = 0; l < vendaIds.length; l += loteTam) {
        const pedaco = vendaIds.slice(l, l + loteTam)
        const filterDocs = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
        try {
          const docsLote = $app.findRecordsByFilter(
            'documentos_fiscais',
            '(' + filterDocs + ") && status = 'Autorizada' && ativo = true",
            '',
            1000,
            0,
          )
          for (let docIdx = 0; docIdx < docsLote.length; docIdx++) {
            const dRec = docsLote[docIdx]
            const vId = dRec.getString('venda_id')
            if (vId && !docsFiscaisPorVenda.has(vId)) {
              docsFiscaisPorVenda.set(vId, dRec)
            }
          }
        } catch (_) {}
      }
    }

    // Agregação dos dados por empresa
    // mapaPorEmpresa: empresa_id -> { faturamento, devolucoes, qtdVendas, custoTotal, descontoConcedido }
    const mapaPorEmpresa = new Map()
    for (let e = 0; e < empresasIds.length; e++) {
      mapaPorEmpresa.set(empresasIds[e], {
        faturamento_bruto: 0,
        devolucoes: 0,
        faturamento_liquido: 0,
        quantidade_vendas: 0,
        custo_total: 0,
        desconto_concedido: 0,
      })
    }

    // Coletores específicos para o período principal:
    // 1. Por UF de destino: uf -> { faturamento, quantidade, ticket_medio }
    const mapaUf = new Map()
    // 2. Por Canal: canalId/nome -> { canal, tipo, intermediador_id, nome, faturamento, quantidade, ticket_medio }
    const mapaCanais = new Map()
    // 3. Por Grupos e Categorias: grupo_id -> { grupo_nome, faturamento, quantidade_itens, categorias: Map<cat_id, { cat_nome, faturamento, qtd }> }
    const mapaGruposVendas = new Map()

    for (let k = 0; k < vendasFiltradas.length; k++) {
      const itemV = vendasFiltradas[k]
      const v = itemV.rec
      const empId = v.getString('empresa_id')
      const tipo = v.getString('tipo') // 'PDV', 'Pedido', 'Devolução'
      const valorTotal = v.getFloat('valor_total') || 0
      const valorDesconto =
        (v.getFloat('valor_desconto_itens') || 0) + (v.getFloat('valor_desconto_total') || 0)
      const custoTotalVenda = v.getFloat('custo_total') || 0

      const empStats = mapaPorEmpresa.get(empId)
      if (!empStats) continue

      const itensDaVenda = itensPorVenda.get(v.id) || []

      // Se houver filtro de produto ativo (8.0b):
      // Apenas os itens filtrados contam para faturamento, custo e descontos da venda!
      let valorEfetivoVenda = 0
      let custoEfetivoVenda = 0
      let descontoEfetivoVenda = 0
      let teveItemValido = false

      if (temFiltroProduto) {
        if (itensDaVenda.length === 0) {
          // Sem itens carregados, não podemos validar o filtro
          continue
        }
        for (let it = 0; it < itensDaVenda.length; it++) {
          const itemRec = itensDaVenda[it]
          const pId = itemRec.getString('produto_id')
          if (produtoAtendeFiltros(pId)) {
            teveItemValido = true
            const valItem = itemRec.getFloat('valor_total') || 0
            const qtdItem = itemRec.getFloat('quantidade') || 0
            const cUnit = itemRec.getFloat('custo_unitario') || 0
            const descItem = itemRec.getFloat('desconto_valor') || 0
            valorEfetivoVenda += valItem
            custoEfetivoVenda += qtdItem * cUnit
            descontoEfetivoVenda += descItem
          }
        }
        if (!teveItemValido) {
          // Nenhum item atendeu ao filtro de produto nesta venda
          continue
        }
      } else {
        valorEfetivoVenda = valorTotal
        custoEfetivoVenda = custoTotalVenda
        descontoEfetivoVenda = valorDesconto
      }

      // Devoluções do período
      if (tipo === 'Devolução') {
        empStats.devolucoes += valorEfetivoVenda
        continue // Devoluções já abatem o faturamento líquido
      }

      // Venda normal (PDV ou Pedido)
      empStats.faturamento_bruto += valorEfetivoVenda
      empStats.quantidade_vendas += 1
      empStats.custo_total += custoEfetivoVenda
      empStats.desconto_concedido += descontoEfetivoVenda

      // Se também for o período principal, preenche as outras agregações (UF, Canal, Grupo/Categoria)
      if (ehPeriodoPrincipal) {
        // --- 1. UF de destino ---
        // Regra: "UF do cliente, ou destinatario_uf da nota quando houver. Venda de balcão sem cliente conta como UF da própria empresa"
        const docFiscal = docsFiscaisPorVenda.get(v.id)
        let ufDestino = ''

        if (docFiscal && docFiscal.getString('destinatario_uf')) {
          ufDestino = docFiscal.getString('destinatario_uf').trim().toUpperCase()
        }
        if (!ufDestino) {
          const clId = v.getString('cliente_id')
          const clienteInfo = clId ? mapaClientes.get(clId) : null
          if (clienteInfo && clienteInfo.uf) {
            ufDestino = clienteInfo.uf.trim().toUpperCase()
          }
        }
        if (!ufDestino) {
          const empInfo = mapaEmpresas.get(empId)
          ufDestino = empInfo && empInfo.uf ? empInfo.uf : 'ES'
        }

        const ufStat = mapaUf.get(ufDestino) || { faturamento: 0, quantidade: 0 }
        ufStat.faturamento += valorEfetivoVenda
        ufStat.quantidade += 1
        mapaUf.set(ufDestino, ufStat)

        // --- 2. Canal de Venda ---
        // Regra: "Balcão/PDV (tipo PDV), Pedido (tipo Pedido) e, nas vendas com NF-e, por intermediador (site próprio ou cada marketplace, pelo intermediador_id da nota)"
        let canalChave = ''
        let canalNome = ''
        let canalTipo = ''

        if (docFiscal && docFiscal.getString('modelo') === '55') {
          // Venda com NF-e modelo 55: verificar intermediador
          const interId = docFiscal.getString('intermediador_id')
          if (interId && mapaIntermediadores.has(interId)) {
            const interInfo = mapaIntermediadores.get(interId)
            canalChave = 'marketplace_' + interId
            canalNome = 'Marketplace - ' + interInfo.nome
            canalTipo = 'Marketplace'
          } else {
            // Sem intermediador cadastrado na NF-e -> Site / E-commerce Próprio
            canalChave = 'site_proprio'
            canalNome = 'Site Próprio (E-commerce)'
            canalTipo = 'Site Próprio'
          }
        } else if (tipo === 'PDV') {
          canalChave = 'pdv_balcao'
          canalNome = 'Balcão / PDV'
          canalTipo = 'PDV'
        } else {
          // Tipo 'Pedido' ou outros
          canalChave = 'pedido_venda'
          canalNome = 'Pedido de Venda'
          canalTipo = 'Pedido'
        }

        const canalStat = mapaCanais.get(canalChave) || {
          chave: canalChave,
          nome: canalNome,
          tipo: canalTipo,
          faturamento: 0,
          quantidade: 0,
        }
        canalStat.faturamento += valorEfetivoVenda
        canalStat.quantidade += 1
        mapaCanais.set(canalChave, canalStat)

        // --- 3. Quadro de Vendas por Grupo e Categoria ---
        // Soma os itens vendidos da venda
        for (let it = 0; it < itensDaVenda.length; it++) {
          const itemRec = itensDaVenda[it]
          const pId = itemRec.getString('produto_id')
          if (temFiltroProduto && !produtoAtendeFiltros(pId)) {
            continue
          }

          const valItem = itemRec.getFloat('valor_total') || 0
          const qtdItem = itemRec.getFloat('quantidade') || 0
          const pr = mapaProdutos.get(pId)

          const gId = pr && pr.grupo_id ? pr.grupo_id : 'sem_grupo'
          const gNome =
            pr && pr.grupo_id && mapaGrupos.has(pr.grupo_id)
              ? mapaGrupos.get(pr.grupo_id).nome
              : 'Sem Grupo'

          const catId = pr && pr.categoria_id ? pr.categoria_id : 'sem_categoria'
          const catNome =
            pr && pr.categoria_id && mapaCategorias.has(pr.categoria_id)
              ? mapaCategorias.get(pr.categoria_id).nome
              : 'Sem Categoria'

          if (!mapaGruposVendas.has(gId)) {
            mapaGruposVendas.set(gId, {
              grupo_id: gId,
              grupo_nome: gNome,
              faturamento: 0,
              quantidade: 0,
              categorias: new Map(),
            })
          }
          const grupoEntry = mapaGruposVendas.get(gId)
          grupoEntry.faturamento += valItem
          grupoEntry.quantidade += qtdItem

          if (!grupoEntry.categorias.has(catId)) {
            grupoEntry.categorias.set(catId, {
              categoria_id: catId,
              categoria_nome: catNome,
              faturamento: 0,
              quantidade: 0,
            })
          }
          const catEntry = grupoEntry.categorias.get(catId)
          catEntry.faturamento += valItem
          catEntry.quantidade += qtdItem
        }
      }
    }

    // Finalizar cálculos por empresa
    const resultadoEmpresas = []
    let totalFatBruto = 0
    let totalDevolucoes = 0
    let totalFatLiquido = 0
    let totalQtdVendas = 0
    let totalCusto = 0
    let totalDesconto = 0

    for (let e = 0; e < empresasIds.length; e++) {
      const eId = empresasIds[e]
      const st = mapaPorEmpresa.get(eId)
      const empInfo = mapaEmpresas.get(eId) || {
        id: eId,
        nome_fantasia: 'Empresa ' + eId,
        razao_social: '',
        cnpj: '',
        uf: 'ES',
      }

      const fatLiquido = Math.max(0, round2(st.faturamento_bruto - st.devolucoes))
      st.faturamento_liquido = fatLiquido

      const ticketMedio = st.quantidade_vendas > 0 ? round2(fatLiquido / st.quantidade_vendas) : 0
      const margemValor = round2(fatLiquido - st.custo_total)
      const margemPercentual = fatLiquido > 0 ? round2((margemValor / fatLiquido) * 100) : 0

      totalFatBruto += st.faturamento_bruto
      totalDevolucoes += st.devolucoes
      totalFatLiquido += fatLiquido
      totalQtdVendas += st.quantidade_vendas
      totalCusto += st.custo_total
      totalDesconto += st.desconto_concedido

      resultadoEmpresas.push({
        empresa_id: eId,
        empresa_nome: empInfo.nome_fantasia,
        empresa_razao_social: empInfo.razao_social,
        empresa_cnpj: empInfo.cnpj,
        empresa_uf: empInfo.uf,
        faturamento_bruto: round2(st.faturamento_bruto),
        devolucoes: round2(st.devolucoes),
        faturamento_liquido: fatLiquido,
        quantidade_vendas: st.quantidade_vendas,
        ticket_medio: ticketMedio,
        custo_total: round2(st.custo_total),
        margem_bruta_valor: margemValor,
        margem_bruta_percentual: margemPercentual,
        desconto_concedido: round2(st.desconto_concedido),
      })
    }

    const totalMargemValor = round2(totalFatLiquido - totalCusto)
    const totalMargemPct =
      totalFatLiquido > 0 ? round2((totalMargemValor / totalFatLiquido) * 100) : 0
    const totalTicketMedio = totalQtdVendas > 0 ? round2(totalFatLiquido / totalQtdVendas) : 0

    const consolidado = {
      faturamento_bruto: round2(totalFatBruto),
      devolucoes: round2(totalDevolucoes),
      faturamento_liquido: round2(totalFatLiquido),
      quantidade_vendas: totalQtdVendas,
      ticket_medio: totalTicketMedio,
      custo_total: round2(totalCusto),
      margem_bruta_valor: totalMargemValor,
      margem_bruta_percentual: totalMargemPct,
      desconto_concedido: round2(totalDesconto),
    }

    return {
      vendasFiltradas: vendasFiltradas,
      porEmpresa: resultadoEmpresas,
      consolidado: consolidado,
      mapaUf: mapaUf,
      mapaCanais: mapaCanais,
      mapaGruposVendas: mapaGruposVendas,
    }
  }

  // 1. Processa o período atual solicitado
  const dadosAtual = processarVendasDoPeriodo(dataInicio, dataFim, true)

  // 2. Processa o período anterior de mesmo tamanho
  const dadosAnterior = processarVendasDoPeriodo(antIni, antFim, false)

  // 3. Processa o mesmo período do ano anterior
  const dadosAnoAnterior = processarVendasDoPeriodo(anoAntIni, anoAntFim, false)

  // Associar comparações em cada empresa e no consolidado
  function montarComparativo(atualVal, antVal, anoAntVal) {
    const varAntValor = round2(atualVal - antVal)
    const varAntPct =
      antVal > 0 ? round2(((atualVal - antVal) / antVal) * 100) : atualVal > 0 ? 100 : 0

    const varAnoAntValor = round2(atualVal - anoAntVal)
    const varAnoAntPct =
      anoAntVal > 0 ? round2(((atualVal - anoAntVal) / anoAntVal) * 100) : atualVal > 0 ? 100 : 0

    return {
      valor_anterior: round2(antVal),
      variacao_anterior_valor: varAntValor,
      variacao_anterior_pct: varAntPct,
      valor_ano_anterior: round2(anoAntVal),
      variacao_ano_anterior_valor: varAnoAntValor,
      variacao_ano_anterior_pct: varAnoAntPct,
    }
  }

  const mapaAntPorEmpresa = new Map()
  dadosAnterior.porEmpresa.forEach((item) => mapaAntPorEmpresa.set(item.empresa_id, item))

  const mapaAnoAntPorEmpresa = new Map()
  dadosAnoAnterior.porEmpresa.forEach((item) => mapaAnoAntPorEmpresa.set(item.empresa_id, item))

  const empresasComComparacao = dadosAtual.porEmpresa.map((item) => {
    const ant = mapaAntPorEmpresa.get(item.empresa_id) || {
      faturamento_liquido: 0,
      quantidade_vendas: 0,
      ticket_medio: 0,
    }
    const anoAnt = mapaAnoAntPorEmpresa.get(item.empresa_id) || {
      faturamento_liquido: 0,
      quantidade_vendas: 0,
      ticket_medio: 0,
    }

    return {
      ...item,
      comparacao_faturamento: montarComparativo(
        item.faturamento_liquido,
        ant.faturamento_liquido,
        anoAnt.faturamento_liquido,
      ),
      comparacao_quantidade: montarComparativo(
        item.quantidade_vendas,
        ant.quantidade_vendas,
        anoAnt.quantidade_vendas,
      ),
      comparacao_ticket_medio: montarComparativo(
        item.ticket_medio,
        ant.ticket_medio,
        anoAnt.ticket_medio,
      ),
    }
  })

  const consolidadoComComparacao = {
    ...dadosAtual.consolidado,
    comparacao_faturamento: montarComparativo(
      dadosAtual.consolidado.faturamento_liquido,
      dadosAnterior.consolidado.faturamento_liquido,
      dadosAnoAnterior.consolidado.faturamento_liquido,
    ),
    comparacao_quantidade: montarComparativo(
      dadosAtual.consolidado.quantidade_vendas,
      dadosAnterior.consolidado.quantidade_vendas,
      dadosAnoAnterior.consolidado.quantidade_vendas,
    ),
    comparacao_ticket_medio: montarComparativo(
      dadosAtual.consolidado.ticket_medio,
      dadosAnterior.consolidado.ticket_medio,
      dadosAnoAnterior.consolidado.ticket_medio,
    ),
  }

  // 4. Formatação por UF de Destino (ordenada pelo faturamento desc)
  const totalFatAtual = dadosAtual.consolidado.faturamento_liquido
  const tabelaUf = Array.from(dadosAtual.mapaUf.entries())
    .map(([uf, st]) => {
      const ticket = st.quantidade > 0 ? round2(st.faturamento / st.quantidade) : 0
      const pct = totalFatAtual > 0 ? round2((st.faturamento / totalFatAtual) * 100) : 0
      return {
        uf: uf,
        faturamento: round2(st.faturamento),
        quantidade: st.quantidade,
        ticket_medio: ticket,
        percentual: pct,
      }
    })
    .sort((a, b) => b.faturamento - a.faturamento)

  // 5. Formatação por Canal (ordenada pelo faturamento desc)
  const tabelaCanal = Array.from(dadosAtual.mapaCanais.values())
    .map((canal) => {
      const ticket = canal.quantidade > 0 ? round2(canal.faturamento / canal.quantidade) : 0
      const pct = totalFatAtual > 0 ? round2((canal.faturamento / totalFatAtual) * 100) : 0
      return {
        chave: canal.chave,
        nome: canal.nome,
        tipo: canal.tipo,
        faturamento: round2(canal.faturamento),
        quantidade: canal.quantidade,
        ticket_medio: ticket,
        percentual: pct,
      }
    })
    .sort((a, b) => b.faturamento - a.faturamento)

  // 6. Formas de Pagamento no período das vendas filtradas
  // Requisito: "por forma de pagamento (vendas_pagamentos): valor, quantidade, e o custo das taxas (valor_taxa) com o % sobre o valor."
  const vendaIdsAtual = dadosAtual.vendasFiltradas
    .filter((x) => x.rec.getString('tipo') !== 'Devolução')
    .map((x) => x.rec.id)

  const mapaPagamentos = new Map()
  let totalValorPagamentos = 0
  let totalTaxasPagamentos = 0
  let totalQtdPagamentos = 0

  if (vendaIdsAtual.length > 0) {
    const loteTam = 40
    for (let l = 0; l < vendaIdsAtual.length; l += loteTam) {
      const pedaco = vendaIdsAtual.slice(l, l + loteTam)
      const filterPag = pedaco.map((id) => "venda_id = '" + id + "'").join(' || ')
      try {
        const pagsLote = $app.findRecordsByFilter(
          'vendas_pagamentos',
          '(' + filterPag + ') && ativo = true',
          '',
          2000,
          0,
        )
        for (let pIdx = 0; pIdx < pagsLote.length; pIdx++) {
          const pg = pagsLote[pIdx]
          const fpId = pg.getString('forma_pagamento_id') || 'outros'

          // Filtro por formas de pagamento específicas se selecionado
          if (formasPagamentoIds.length > 0 && !formasPagamentoIds.includes(fpId)) {
            continue
          }

          const fpInfo = mapaFormasPagamento.get(fpId) || {
            descricao: 'Outros / Não identificado',
            tipo: 'Outros',
            taxa_percentual_padrao: 0,
          }

          const val = pg.getFloat('valor') || 0
          let valTaxa = pg.getFloat('valor_taxa') || 0
          if (!valTaxa && pg.getFloat('taxa_percentual')) {
            valTaxa = (val * pg.getFloat('taxa_percentual')) / 100
          } else if (!valTaxa && fpInfo.taxa_percentual_padrao > 0) {
            valTaxa = (val * fpInfo.taxa_percentual_padrao) / 100
          }

          if (!mapaPagamentos.has(fpId)) {
            mapaPagamentos.set(fpId, {
              forma_pagamento_id: fpId,
              descricao: fpInfo.descricao,
              tipo: fpInfo.tipo,
              valor: 0,
              quantidade: 0,
              valor_taxa: 0,
            })
          }
          const itemPg = mapaPagamentos.get(fpId)
          itemPg.valor += val
          itemPg.quantidade += 1
          itemPg.valor_taxa += valTaxa

          totalValorPagamentos += val
          totalTaxasPagamentos += valTaxa
          totalQtdPagamentos += 1
        }
      } catch (errP) {
        console.warn('Erro ao carregar pagamentos das vendas:', errP)
      }
    }
  }

  const tabelaPagamentos = Array.from(mapaPagamentos.values())
    .map((pg) => {
      const pctTaxa = pg.valor > 0 ? round2((pg.valor_taxa / pg.valor) * 100) : 0
      const pctDoTotal =
        totalValorPagamentos > 0 ? round2((pg.valor / totalValorPagamentos) * 100) : 0
      return {
        forma_pagamento_id: pg.forma_pagamento_id,
        descricao: pg.descricao,
        tipo: pg.tipo,
        valor: round2(pg.valor),
        quantidade: pg.quantidade,
        valor_taxa: round2(pg.valor_taxa),
        taxa_percentual: pctTaxa,
        percentual_sobre_total: pctDoTotal,
      }
    })
    .sort((a, b) => b.valor - a.valor)

  const consolidadoPagamentos = {
    valor_total: round2(totalValorPagamentos),
    quantidade_total: totalQtdPagamentos,
    valor_taxas_total: round2(totalTaxasPagamentos),
    taxa_media_percentual:
      totalValorPagamentos > 0 ? round2((totalTaxasPagamentos / totalValorPagamentos) * 100) : 0,
  }

  // 7. Quadro de Vendas por Grupo e Categoria
  const quadroGruposCategorias = Array.from(dadosAtual.mapaGruposVendas.values())
    .map((g) => {
      const catsArray = Array.from(g.categorias.values())
        .map((cat) => {
          const pctCat = g.faturamento > 0 ? round2((cat.faturamento / g.faturamento) * 100) : 0
          return {
            categoria_id: cat.categoria_id,
            categoria_nome: cat.categoria_nome,
            faturamento: round2(cat.faturamento),
            quantidade: round2(cat.quantidade),
            percentual_grupo: pctCat,
          }
        })
        .sort((a, b) => b.faturamento - a.faturamento)

      const pctTotal = totalFatAtual > 0 ? round2((g.faturamento / totalFatAtual) * 100) : 0

      return {
        grupo_id: g.grupo_id,
        grupo_nome: g.grupo_nome,
        faturamento: round2(g.faturamento),
        quantidade: round2(g.quantidade),
        percentual_total: pctTotal,
        categorias: catsArray,
      }
    })
    .sort((a, b) => b.faturamento - a.faturamento)

  // Metadados do relatório e períodos
  const metadados = {
    periodo_atual: {
      data_inicio: dataInicio,
      data_fim: dataFim,
      dias: diffDias,
    },
    periodo_anterior: {
      data_inicio: antIni,
      data_fim: antFim,
      dias: diffDias,
    },
    mesmo_periodo_ano_anterior: {
      data_inicio: anoAntIni,
      data_fim: anoAntFim,
      dias: diffDias,
    },
    tem_filtro_produto: temFiltroProduto,
    aviso_filtro_produto: temFiltroProduto
      ? 'Atenção: Filtro de produto aplicado. Os valores e quantidades exibem apenas os itens que atendem aos filtros do catálogo.'
      : null,
  }

  return c.json(200, {
    sucesso: true,
    metadados: metadados,
    empresas: empresasComComparacao,
    consolidado: consolidadoComComparacao,
    tabela_uf: tabelaUf,
    tabela_canal: tabelaCanal,
    tabela_pagamentos: tabelaPagamentos,
    consolidado_pagamentos: consolidadoPagamentos,
    quadro_grupos_categorias: quadroGruposCategorias,
  })
})
