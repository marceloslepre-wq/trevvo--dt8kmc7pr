// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório: Estoque Gerencial (Etapa 8 - Prompt 8.3)
 * Rota: POST /backend/v1/relatorios/estoque-gerencial
 *
 * Parâmetros:
 * {
 *   filtros: ObjetoFiltrosRelatorio,
 *   data_base?: string,
 *   dias_analise?: number (padrão 90),
 *   dias_cobertura_alvo?: number (padrão 30),
 *   dias_parado?: number (padrão 90)
 * }
 */

routerAdd('POST', '/backend/v1/relatorios/estoque-gerencial', (c) => {
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
      if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
        isAdmin = true
      }
    }
  } catch (_) {}

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

  // Helper para extrair data ISO (YYYY-MM-DD) no fuso de Brasília
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

  function subtrairDias(dateIsoStr, numDias) {
    const dt = new Date(dateIsoStr + 'T12:00:00Z')
    dt.setUTCDate(dt.getUTCDate() - numDias)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
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

  const hojeIso =
    extrairDataBrasilia(new Date().toISOString()) || new Date().toISOString().slice(0, 10)

  // Parâmetros do relatório:
  // data_base: padrão hoje
  const dataBaseParam = String(
    body.data_base || f.data_base || (f.periodo && f.periodo.dataFim) || hojeIso,
  ).trim()
  const dataBaseIso = extrairDataBrasilia(dataBaseParam) || hojeIso

  // dias_analise: padrão 90 (limite 366)
  let diasAnalise = parseInt(String(body.dias_analise || f.dias_analise || 90), 10)
  if (isNaN(diasAnalise) || diasAnalise <= 0) diasAnalise = 90
  if (diasAnalise > 366) diasAnalise = 366

  // dias_cobertura_alvo: padrão 30
  let diasCoberturaAlvo = parseInt(
    String(body.dias_cobertura_alvo || f.dias_cobertura_alvo || 30),
    10,
  )
  if (isNaN(diasCoberturaAlvo) || diasCoberturaAlvo <= 0) diasCoberturaAlvo = 30

  // dias_parado: padrão 90
  let diasParado = parseInt(String(body.dias_parado || f.dias_parado || 90), 10)
  if (isNaN(diasParado) || diasParado <= 0) diasParado = 90

  // Intervalo de análise das vendas: [dataInicioAnalise, dataBaseIso]
  // exatamente diasAnalise anteriores a dataBaseIso
  const dataInicioAnalise = subtrairDias(dataBaseIso, diasAnalise)

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

  // 1. Carregar Grupos, Categorias, Marcas, Unidades e Fornecedores
  const mapaGrupos = new Map()
  try {
    const grRecs = $app.findRecordsByFilter('grupos', 'ativo = true', 'nome', 1000, 0)
    for (let i = 0; i < grRecs.length; i++) {
      mapaGrupos.set(grRecs[i].id, grRecs[i].getString('nome'))
    }
  } catch (_) {}

  const mapaCategorias = new Map()
  try {
    const ctRecs = $app.findRecordsByFilter('categorias', 'ativo = true', 'nome', 2000, 0)
    for (let i = 0; i < ctRecs.length; i++) {
      mapaCategorias.set(ctRecs[i].id, {
        nome: ctRecs[i].getString('nome'),
        grupo_id: ctRecs[i].getString('grupo_id'),
      })
    }
  } catch (_) {}

  const mapaMarcas = new Map()
  try {
    const mcRecs = $app.findRecordsByFilter('marcas', 'ativo = true', 'nome', 1000, 0)
    for (let i = 0; i < mcRecs.length; i++) {
      mapaMarcas.set(mcRecs[i].id, mcRecs[i].getString('nome'))
    }
  } catch (_) {}

  const mapaUnidades = new Map()
  try {
    const unRecs = $app.findRecordsByFilter('unidades_medida', 'ativo = true', 'sigla', 500, 0)
    for (let i = 0; i < unRecs.length; i++) {
      mapaUnidades.set(unRecs[i].id, unRecs[i].getString('sigla'))
    }
  } catch (_) {}

  const mapaFornecedores = new Map()
  try {
    const fnRecs = $app.findRecordsByFilter('fornecedores', 'ativo = true', 'razao_social', 5000, 0)
    for (let i = 0; i < fnRecs.length; i++) {
      const fItem = fnRecs[i]
      mapaFornecedores.set(fItem.id, {
        id: fItem.id,
        nome: fItem.getString('nome_fantasia') || fItem.getString('razao_social') || 'Fornecedor',
        razao_social: fItem.getString('razao_social'),
        cnpj: fItem.getString('cnpj') || fItem.getString('cpf_cnpj') || '',
        telefone: fItem.getString('telefone') || fItem.getString('celular') || '',
      })
    }
  } catch (_) {}

  // 2. Carregar produtos elegíveis: ativo = true && controla_estoque = true
  // Aplicando filtros de produto do 8.0b
  const produtosElegiveis = []
  try {
    const prodsRecs = $app.findRecordsByFilter(
      'produtos',
      'ativo = true && controla_estoque = true',
      'descricao',
      15000,
      0,
    )

    for (let pIdx = 0; pIdx < prodsRecs.length; pIdx++) {
      const pr = prodsRecs[pIdx]
      const pId = pr.id

      if (produtosIds.length > 0 && !produtosIds.includes(pId)) continue
      if (
        gruposIds.length > 0 &&
        (!pr.getString('grupo_id') || !gruposIds.includes(pr.getString('grupo_id')))
      ) {
        continue
      }
      if (
        categoriasIds.length > 0 &&
        (!pr.getString('categoria_id') || !categoriasIds.includes(pr.getString('categoria_id')))
      ) {
        continue
      }
      if (
        marcasIds.length > 0 &&
        (!pr.getString('marca_id') || !marcasIds.includes(pr.getString('marca_id')))
      ) {
        continue
      }
      const fornPadraoId =
        pr.getString('fornecedor_principal_id') || pr.getString('fornecedor_padrao_id')
      if (
        fornecedoresProdutoIds.length > 0 &&
        (!fornPadraoId || !fornecedoresProdutoIds.includes(fornPadraoId))
      ) {
        continue
      }
      if (ncms.length > 0) {
        const pNcm = pr.getString('ncm') || ''
        let bateuNcm = false
        for (let n = 0; n < ncms.length; n++) {
          if (pNcm.startsWith(ncms[n])) {
            bateuNcm = true
            break
          }
        }
        if (!bateuNcm) continue
      }
      if (situacaoProduto.length > 0) {
        const stPr = pr.getBool('ativo') ? 'ativo' : 'inativo'
        if (!situacaoProduto.includes(stPr)) continue
      }
      if (soFiscalNaoRevisado && pr.getBool('dados_fiscais_revisados')) {
        continue
      }

      const unidSigla = mapaUnidades.get(pr.getString('unidade_id')) || 'UN'
      const marcaNome = mapaMarcas.get(pr.getString('marca_id')) || 'Sem marca'
      const grupoNome = mapaGrupos.get(pr.getString('grupo_id')) || 'Sem grupo'
      const catObj = mapaCategorias.get(pr.getString('categoria_id'))
      const catNome = catObj ? catObj.nome : 'Sem categoria'

      produtosElegiveis.push({
        id: pId,
        codigo: pr.getInt('codigo') || 0,
        descricao: pr.getString('descricao') || '',
        unidade_sigla: unidSigla,
        grupo_id: pr.getString('grupo_id') || '',
        grupo_nome: grupoNome,
        categoria_id: pr.getString('categoria_id') || '',
        categoria_nome: catNome,
        marca_id: pr.getString('marca_id') || '',
        marca_nome: marcaNome,
        estoque_minimo: pr.getFloat('estoque_minimo') || 0,
        estoque_maximo: pr.getFloat('estoque_maximo') || 0,
        preco_custo_cadastro: pr.getFloat('preco_custo') || 0,
        fornecedor_principal_id: fornPadraoId || '',
      })
    }
  } catch (errProds) {
    return c.json(500, {
      sucesso: false,
      message: 'Erro ao carregar catálogo de produtos: ' + errProds.message,
    })
  }

  if (produtosElegiveis.length === 0) {
    return c.json(200, {
      sucesso: true,
      metadados: {
        data_base: dataBaseIso,
        dias_analise: diasAnalise,
        dias_cobertura_alvo: diasCoberturaAlvo,
        dias_parado: diasParado,
        data_inicio_analise: dataInicioAnalise,
        total_produtos_avaliados: 0,
        tem_filtro_produto: temFiltroProduto,
      },
      totais: {
        saldo_total: 0,
        valor_total: 0,
        itens_parados: 0,
        valor_parados: 0,
        itens_sugestao: 0,
        sugestao_total_qtd: 0,
        sugestao_total_valor: 0,
      },
      produtos: [],
      por_grupo_categoria: [],
      por_marca: [],
      produtos_parados: [],
      produtos_sugestao: [],
    })
  }

  const produtosIdsSet = new Set(produtosElegiveis.map((p) => p.id))

  // 3. Obter saldo e custo médio na data_base
  // Se data_base >= hoje: busca direto em estoque_saldos
  // Se data_base < hoje: busca pelo saldo_posterior e custo_medio_posterior do último estoque_movimentos até data_base 23:59:59
  const ehHojeOuFuturo = dataBaseIso >= hojeIso

  // Mapa de saldo e valor na data_base por produto_id (agregando as empresas selecionadas)
  // produto_id => { saldo, valor, custo_medio, data_ultima_saida }
  const mapaSaldos = new Map()

  if (ehHojeOuFuturo) {
    // Buscar em estoque_saldos para as empresas marcadas
    for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
      const empId = empresasIds[eIdx]
      try {
        const saldosRecs = $app.findRecordsByFilter(
          'estoque_saldos',
          "empresa_id = '" + empId + "' && ativo = true",
          '',
          15000,
          0,
        )
        for (let sIdx = 0; sIdx < saldosRecs.length; sIdx++) {
          const s = saldosRecs[sIdx]
          const pId = s.getString('produto_id')
          if (!produtosIdsSet.has(pId)) continue

          const qtd = s.getFloat('quantidade') || 0
          const custoMedio = s.getFloat('custo_medio') || 0
          const valorTot = s.getFloat('valor_total') || qtd * custoMedio
          const dtSaida = s.getString('data_ultima_saida') || ''

          let item = mapaSaldos.get(pId)
          if (!item) {
            item = {
              saldo: 0,
              valor: 0,
              custo_medio: 0,
              data_ultima_saida: '',
            }
            mapaSaldos.set(pId, item)
          }

          item.saldo += qtd
          item.valor += valorTot
          if (dtSaida && (!item.data_ultima_saida || dtSaida > item.data_ultima_saida)) {
            item.data_ultima_saida = dtSaida
          }
        }
      } catch (_) {}
    }
  } else {
    // Data passada: para cada empresa e produto elegível, pegar o saldo_posterior e custo_medio_posterior
    // do último movimento até dataBaseIso + ' 23:59:59'
    // Para performance e precisão, buscamos os movimentos até dataBase e agrupamos em memória
    for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
      const empId = empresasIds[eIdx]
      try {
        const movs = $app.findRecordsByFilter(
          'estoque_movimentos',
          "empresa_id = '" +
            empId +
            "' && ativo = true && estornado = false && data_movimento <= '" +
            dataBaseIso +
            " 23:59:59'",
          'data_movimento,created',
          25000,
          0,
        )

        // mapa de ultimo movimento por produto nesta filial
        const ultPorProd = new Map()
        for (let mIdx = 0; mIdx < movs.length; mIdx++) {
          const m = movs[mIdx]
          const pId = m.getString('produto_id')
          if (!produtosIdsSet.has(pId)) continue
          ultPorProd.set(pId, m)
        }

        ultPorProd.forEach((ultM, pId) => {
          const sPost = ultM.getFloat('saldo_posterior') || 0
          const cPost =
            ultM.getFloat('custo_medio_posterior') || ultM.getFloat('custo_unitario') || 0
          const valTot = sPost * cPost

          let item = mapaSaldos.get(pId)
          if (!item) {
            item = {
              saldo: 0,
              valor: 0,
              custo_medio: 0,
              data_ultima_saida: '',
            }
            mapaSaldos.set(pId, item)
          }
          item.saldo += sPost
          item.valor += valTot
        })
      } catch (_) {}
    }

    // Complementar data_ultima_saida a partir de estoque_saldos caso não preenchida
    for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
      const empId = empresasIds[eIdx]
      try {
        const saldosRecs = $app.findRecordsByFilter(
          'estoque_saldos',
          "empresa_id = '" + empId + "' && ativo = true",
          '',
          15000,
          0,
        )
        for (let sIdx = 0; sIdx < saldosRecs.length; sIdx++) {
          const s = saldosRecs[sIdx]
          const pId = s.getString('produto_id')
          const dtSaida = s.getString('data_ultima_saida') || ''
          if (dtSaida && mapaSaldos.has(pId)) {
            const item = mapaSaldos.get(pId)
            if (!item.data_ultima_saida || dtSaida > item.data_ultima_saida) {
              item.data_ultima_saida = dtSaida
            }
          }
        }
      } catch (_) {}
    }
  }

  // 4. Saídas por venda nos dias_analise anteriores (origem VENDA menos DEVOLUCAO_VENDA)
  // intervalo: [dataInicioAnalise 00:00:00, dataBaseIso 23:59:59]
  // produto_id => { qtdVendida, somaSaldoMedioDiario }
  const mapaVendas = new Map()

  for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
    const empId = empresasIds[eIdx]
    try {
      const movsVenda = $app.findRecordsByFilter(
        'estoque_movimentos',
        "empresa_id = '" +
          empId +
          "' && ativo = true && estornado = false && data_movimento >= '" +
          dataInicioAnalise +
          " 00:00:00' && data_movimento <= '" +
          dataBaseIso +
          " 23:59:59' && (origem = 'VENDA' || origem = 'DEVOLUCAO_VENDA')",
        'data_movimento',
        25000,
        0,
      )

      for (let mvIdx = 0; mvIdx < movsVenda.length; mvIdx++) {
        const mv = movsVenda[mvIdx]
        const pId = mv.getString('produto_id')
        if (!produtosIdsSet.has(pId)) continue

        const orig = mv.getString('origem')
        const qtd = mv.getFloat('quantidade') || 0
        const sinal = orig === 'DEVOLUCAO_VENDA' ? -1 : 1

        const prev = mapaVendas.get(pId) || 0
        mapaVendas.set(pId, prev + sinal * qtd)

        // Registrar também se este movimento teve saída de venda para data_ultima_saida
        if (orig === 'VENDA') {
          const dtMov = mv.getString('data_movimento') || ''
          const itemSaldo = mapaSaldos.get(pId)
          if (itemSaldo && dtMov) {
            if (!itemSaldo.data_ultima_saida || dtMov > itemSaldo.data_ultima_saida) {
              itemSaldo.data_ultima_saida = dtMov
            }
          }
        }
      }
    } catch (_) {}
  }

  // 5. Saldo inicial no início do período de análise (dataInicioAnalise)
  // para calcular o saldo médio = (saldo_inicio + saldo_fim) / 2
  // Buscamos o saldo_posterior do último movimento até dataInicioAnalise 00:00:00
  const mapaSaldoInicio = new Map()
  for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
    const empId = empresasIds[eIdx]
    try {
      const movsIni = $app.findRecordsByFilter(
        'estoque_movimentos',
        "empresa_id = '" +
          empId +
          "' && ativo = true && estornado = false && data_movimento < '" +
          dataInicioAnalise +
          " 00:00:00'",
        'data_movimento,created',
        25000,
        0,
      )

      const ultIniPorProd = new Map()
      for (let miIdx = 0; miIdx < movsIni.length; miIdx++) {
        const mi = movsIni[miIdx]
        const pId = mi.getString('produto_id')
        if (!produtosIdsSet.has(pId)) continue
        ultIniPorProd.set(pId, mi.getFloat('saldo_posterior') || 0)
      }

      ultIniPorProd.forEach((sIni, pId) => {
        const prev = mapaSaldoInicio.get(pId) || 0
        mapaSaldoInicio.set(pId, prev + sIni)
      })
    } catch (_) {}
  }

  // 6. Pedidos de compra em aberto (status != 'Recebido' && status != 'Cancelado')
  // para cada produto, somar (quantidade - quantidade_recebida)
  const mapaEmPedido = new Map()
  for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
    const empId = empresasIds[eIdx]
    try {
      const peds = $app.findRecordsByFilter(
        'pedidos_compra',
        "empresa_id = '" +
          empId +
          "' && ativo = true && status != 'Recebido' && status != 'Cancelado'",
        '',
        5000,
        0,
      )

      for (let pdIdx = 0; pdIdx < peds.length; pdIdx++) {
        const ped = peds[pdIdx]
        try {
          const itensPed = $app.findRecordsByFilter(
            'pedidos_compra_itens',
            "pedido_id = '" + ped.id + "' && ativo = true",
            '',
            500,
            0,
          )
          for (let itIdx = 0; itIdx < itensPed.length; itIdx++) {
            const itP = itensPed[itIdx]
            const pId = itP.getString('produto_id')
            if (!produtosIdsSet.has(pId)) continue
            const qtdPed = itP.getFloat('quantidade') || 0
            const qtdRec = itP.getFloat('quantidade_recebida') || 0
            const pendente = Math.max(0, qtdPed - qtdRec)

            const prev = mapaEmPedido.get(pId) || 0
            mapaEmPedido.set(pId, prev + pendente)
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 7. Último fornecedor e custo da última nota de entrada lançada
  // Varre notas_entrada das empresas marcadas com status = 'Lançada' e pega o último custo_unitario_estoque
  const mapaUltimaEntrada = new Map()
  for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
    const empId = empresasIds[eIdx]
    try {
      const notasLancadas = $app.findRecordsByFilter(
        'notas_entrada',
        "empresa_id = '" + empId + "' && status = 'Lançada' && ativo = true",
        'data_entrada,created',
        2000,
        0,
      )

      for (let nIdx = 0; nIdx < notasLancadas.length; nIdx++) {
        const nota = notasLancadas[nIdx]
        const fornId = nota.getString('fornecedor_id')
        const dtEntrada = nota.getString('data_entrada') || nota.getString('created') || ''

        try {
          const itNotas = $app.findRecordsByFilter(
            'notas_entrada_itens',
            "nota_id = '" + nota.id + "' && ativo = true",
            'numero_item',
            500,
            0,
          )

          for (let inIdx = 0; inIdx < itNotas.length; inIdx++) {
            const itN = itNotas[inIdx]
            const pId = itN.getString('produto_id')
            if (!produtosIdsSet.has(pId)) continue

            const custoUnit =
              itN.getFloat('custo_unitario_estoque') ||
              itN.getFloat('valor_unitario_fornecedor') ||
              0

            const atual = mapaUltimaEntrada.get(pId)
            if (!atual || dtEntrada >= atual.data) {
              mapaUltimaEntrada.set(pId, {
                fornecedor_id: fornId,
                custo: custoUnit,
                data: dtEntrada,
              })
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 8. Processar métricas de cada produto elegível
  const agoraMs = new Date(dataBaseIso + 'T23:59:59Z').getTime()
  const listaProdutos = []

  let somaSaldoTotal = 0
  let somaValorTotal = 0
  let itensParadosCount = 0
  let somaValorParados = 0
  let itensSugestaoCount = 0
  let somaQtdSugestao = 0
  let somaValorSugestao = 0

  const porGrupoMap = new Map()
  const porMarcaMap = new Map()

  for (let i = 0; i < produtosElegiveis.length; i++) {
    const prod = produtosElegiveis[i]
    const pId = prod.id

    const saldoInfo = mapaSaldos.get(pId)
    const saldo = saldoInfo ? saldoInfo.saldo : 0
    let valor = saldoInfo ? saldoInfo.valor : 0
    let custoMedio = 0
    if (saldo > 0) {
      custoMedio = round4(valor / saldo)
    } else {
      custoMedio = prod.preco_custo_cadastro || 0
      valor = 0
    }

    const dtUltimaSaida = saldoInfo ? saldoInfo.data_ultima_saida : ''

    // Vendas e média diária
    const qtdVendidaPeriodo = Math.max(0, mapaVendas.get(pId) || 0)
    const mediaDiaria = round4(qtdVendidaPeriodo / diasAnalise)

    // Cobertura em dias: saldo / mediaDiaria
    let coberturaDias = null
    let coberturaDescricao = 'sem giro'
    if (mediaDiaria > 0) {
      if (saldo <= 0) {
        coberturaDias = 0
        coberturaDescricao = '0 dias'
      } else {
        const cDias = Math.round(saldo / mediaDiaria)
        coberturaDias = cDias
        coberturaDescricao = cDias + ' dias'
      }
    } else {
      coberturaDias = null
      coberturaDescricao = 'sem giro'
    }

    // Giro no período = quantidade vendida / saldo médio
    // saldo médio = (saldoInicio + saldoFim) / 2
    const saldoInicio = mapaSaldoInicio.get(pId) || 0
    const saldoMedio = Math.max(0, (saldoInicio + saldo) / 2)
    let giroPeriodo = 0
    if (saldoMedio > 0 && qtdVendidaPeriodo > 0) {
      giroPeriodo = round2(qtdVendidaPeriodo / saldoMedio)
    }

    // Dias desde a última saída
    let diasUltimaSaida = null
    if (dtUltimaSaida) {
      const dtSaidaMs = new Date(dtUltimaSaida.slice(0, 10) + 'T12:00:00Z').getTime()
      if (!isNaN(dtSaidaMs)) {
        const difMs = Math.max(0, agoraMs - dtSaidaMs)
        diasUltimaSaida = Math.floor(difMs / (1000 * 60 * 60 * 24))
      }
    }

    // Em pedidos de compra em aberto
    const emPedido = mapaEmPedido.get(pId) || 0

    // Sugestão de compra:
    // (mediaDiaria * diasCoberturaAlvo) - saldo - emPedido, quando > 0,
    // OU quando saldo estiver abaixo do estoque mínimo
    let sugestaoCompraQtd = 0
    const metaCobertura = mediaDiaria * diasCoberturaAlvo
    const calculoSugestao = metaCobertura - saldo - emPedido

    if (calculoSugestao > 0) {
      sugestaoCompraQtd = Math.ceil(calculoSugestao)
    } else if (prod.estoque_minimo > 0 && saldo < prod.estoque_minimo) {
      // Reposição até estoque mínimo (ou estoque máximo se existir) deduzindo em pedido
      const alvoMinimo =
        prod.estoque_maximo > prod.estoque_minimo ? prod.estoque_maximo : prod.estoque_minimo
      const falta = alvoMinimo - saldo - emPedido
      if (falta > 0) {
        sugestaoCompraQtd = Math.ceil(falta)
      }
    }

    // Último fornecedor e custo
    const ultEnt = mapaUltimaEntrada.get(pId)
    let ultimoFornecedorId = ''
    let ultimoFornecedorNome = 'Não registrado'
    let ultimoCusto = custoMedio || prod.preco_custo_cadastro || 0

    if (ultEnt) {
      ultimoFornecedorId = ultEnt.fornecedor_id
      ultimoCusto = ultEnt.custo || ultimoCusto
      const fnObj = mapaFornecedores.get(ultimoFornecedorId)
      if (fnObj) ultimoFornecedorNome = fnObj.nome
    } else if (prod.fornecedor_principal_id) {
      ultimoFornecedorId = prod.fornecedor_principal_id
      const fnObj = mapaFornecedores.get(ultimoFornecedorId)
      if (fnObj) ultimoFornecedorNome = fnObj.nome
    }

    // Identificar se o produto está parado há mais de dias_parado:
    // Saldo > 0 E (sem saída ou diasUltimaSaida >= dias_parado)
    const ehParado =
      saldo > 0 &&
      (diasUltimaSaida === null || diasUltimaSaida >= diasParado) &&
      qtdVendidaPeriodo === 0

    const valorParado = ehParado ? valor : 0
    const valorSugestao = round2(sugestaoCompraQtd * ultimoCusto)

    // Totalizadores
    somaSaldoTotal += saldo
    somaValorTotal += valor
    if (ehParado) {
      itensParadosCount++
      somaValorParados += valor
    }
    if (sugestaoCompraQtd > 0) {
      itensSugestaoCount++
      somaQtdSugestao += sugestaoCompraQtd
      somaValorSugestao += valorSugestao
    }

    // Agrupamento por Grupo / Categoria
    const grChave = prod.grupo_id || 'sem_grupo'
    let grItem = porGrupoMap.get(grChave)
    if (!grItem) {
      grItem = {
        grupo_id: prod.grupo_id,
        grupo_nome: prod.grupo_nome,
        saldo_total: 0,
        valor_total: 0,
        itens_count: 0,
        categorias: new Map(),
      }
      porGrupoMap.set(grChave, grItem)
    }
    grItem.saldo_total += saldo
    grItem.valor_total += valor
    grItem.itens_count++

    const ctChave = prod.categoria_id || 'sem_categoria'
    let ctItem = grItem.categorias.get(ctChave)
    if (!ctItem) {
      ctItem = {
        categoria_id: prod.categoria_id,
        categoria_nome: prod.categoria_nome,
        saldo_total: 0,
        valor_total: 0,
        itens_count: 0,
      }
      grItem.categorias.set(ctChave, ctItem)
    }
    ctItem.saldo_total += saldo
    ctItem.valor_total += valor
    ctItem.itens_count++

    // Agrupamento por Marca
    const mcChave = prod.marca_id || 'sem_marca'
    let mcItem = porMarcaMap.get(mcChave)
    if (!mcItem) {
      mcItem = {
        marca_id: prod.marca_id,
        marca_nome: prod.marca_nome,
        saldo_total: 0,
        valor_total: 0,
        itens_count: 0,
      }
      porMarcaMap.set(mcChave, mcItem)
    }
    mcItem.saldo_total += saldo
    mcItem.valor_total += valor
    mcItem.itens_count++

    listaProdutos.push({
      produto_id: pId,
      codigo: prod.codigo,
      descricao: prod.descricao,
      unidade_sigla: prod.unidade_sigla,
      grupo_nome: prod.grupo_nome,
      categoria_nome: prod.categoria_nome,
      marca_nome: prod.marca_nome,
      saldo: round4(saldo),
      custo_medio: round4(custoMedio),
      valor_total: round2(valor),
      qtd_vendida_periodo: round4(qtdVendidaPeriodo),
      media_diaria: round4(mediaDiaria),
      cobertura_dias: coberturaDias,
      cobertura_descricao: coberturaDescricao,
      cobertura_acima_180: coberturaDias !== null && coberturaDias > 180,
      giro_periodo: giroPeriodo,
      data_ultima_saida: dtUltimaSaida ? dtUltimaSaida.slice(0, 10) : null,
      dias_ultima_saida: diasUltimaSaida,
      em_pedido: round4(emPedido),
      estoque_minimo: prod.estoque_minimo,
      sugestao_compra: sugestaoCompraQtd,
      valor_sugestao: valorSugestao,
      ultimo_fornecedor_id: ultimoFornecedorId,
      ultimo_fornecedor_nome: ultimoFornecedorNome,
      ultimo_custo: round4(ultimoCusto),
      eh_parado: ehParado,
      valor_parado: round2(valorParado),
    })
  }

  // Converter grupos e marcas para arrays ordenados
  const porGrupoCategoria = Array.from(porGrupoMap.values())
    .map((g) => ({
      grupo_id: g.grupo_id,
      grupo_nome: g.grupo_nome,
      saldo_total: round4(g.saldo_total),
      valor_total: round2(g.valor_total),
      itens_count: g.itens_count,
      percentual_valor: somaValorTotal > 0 ? round2((g.valor_total / somaValorTotal) * 100) : 0,
      categorias: Array.from(g.categorias.values())
        .map((cItem) => ({
          categoria_id: cItem.categoria_id,
          categoria_nome: cItem.categoria_nome,
          saldo_total: round4(cItem.saldo_total),
          valor_total: round2(cItem.valor_total),
          itens_count: cItem.itens_count,
          percentual_grupo:
            g.valor_total > 0 ? round2((cItem.valor_total / g.valor_total) * 100) : 0,
        }))
        .sort((a, b) => b.valor_total - a.valor_total),
    }))
    .sort((a, b) => b.valor_total - a.valor_total)

  const porMarca = Array.from(porMarcaMap.values())
    .map((m) => ({
      marca_id: m.marca_id,
      marca_nome: m.marca_nome,
      saldo_total: round4(m.saldo_total),
      valor_total: round2(m.valor_total),
      itens_count: m.itens_count,
      percentual_valor: somaValorTotal > 0 ? round2((m.valor_total / somaValorTotal) * 100) : 0,
    }))
    .sort((a, b) => b.valor_total - a.valor_total)

  // Separar lista de parados e de sugestão
  const produtosParados = listaProdutos
    .filter((p) => p.eh_parado)
    .sort((a, b) => (b.dias_ultima_saida || 9999) - (a.dias_ultima_saida || 9999))

  const produtosSugestao = listaProdutos
    .filter((p) => p.sugestao_compra > 0)
    .sort((a, b) => b.valor_sugestao - a.valor_sugestao)

  return c.json(200, {
    sucesso: true,
    metadados: {
      data_base: dataBaseIso,
      dias_analise: diasAnalise,
      dias_cobertura_alvo: diasCoberturaAlvo,
      dias_parado: diasParado,
      data_inicio_analise: dataInicioAnalise,
      total_produtos_avaliados: listaProdutos.length,
      tem_filtro_produto: temFiltroProduto,
      aviso_filtro_produto: temFiltroProduto
        ? 'Atenção: Filtro de produto aplicado. Apenas os produtos que atendem aos filtros são exibidos.'
        : null,
    },
    totais: {
      saldo_total: round4(somaSaldoTotal),
      valor_total: round2(somaValorTotal),
      itens_parados: itensParadosCount,
      valor_parados: round2(somaValorParados),
      itens_sugestao: itensSugestaoCount,
      sugestao_total_qtd: round4(somaQtdSugestao),
      sugestao_total_valor: round2(somaValorSugestao),
    },
    produtos: listaProdutos,
    por_grupo_categoria: porGrupoCategoria,
    por_marca: porMarca,
    produtos_parados: produtosParados,
    produtos_sugestao: produtosSugestao,
  })
})
