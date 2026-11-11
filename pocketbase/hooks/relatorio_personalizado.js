// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório Personalizado (Montador) - Prompt 8.6 & 8.7
 * Rota: POST /backend/v1/relatorios/personalizado
 *
 * Bases suportadas:
 * 1) 'itens_vendidos' (Prompt 8.6)
 * 2) 'itens_comprados' (Prompt 8.6)
 * 3) 'estoque_data' (Prompt 8.7) - Estoque em uma data
 * 4) 'estoque_movimentos' (Prompt 8.7) - Movimentações de estoque
 * 5) 'contas_pagar' (Prompt 8.7) - Contas a pagar
 * 6) 'contas_receber' (Prompt 8.7) - Contas a receber
 * 7) 'movimentacoes_financeiras' (Prompt 8.7) - Movimentações financeiras
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

  const basesPermitidas = [
    'itens_vendidos',
    'itens_comprados',
    'estoque_data',
    'estoque_movimentos',
    'contas_pagar',
    'contas_receber',
    'movimentacoes_financeiras',
  ]

  // 1. Validação estrita da base
  if (!basesPermitidas.includes(base)) {
    return c.json(400, {
      sucesso: false,
      message: 'Base de dados inválida. Escolha entre: ' + basesPermitidas.join(', ') + '.',
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

  // Definições de agrupamentos permitidos por base
  const agrupamentosPorBase = {
    itens_vendidos: [
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
    ],
    itens_comprados: [
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
    ],
    estoque_data: ['empresa', 'grupo', 'categoria', 'marca', 'produto', 'fornecedor_produto'],
    estoque_movimentos: [
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
      'origem',
      'tipo',
    ],
    contas_pagar: [
      'empresa',
      'fornecedor',
      'plano_contas',
      'centro_custo',
      'situacao',
      'origem',
      'mes_vencimento',
      'faixa_atraso',
    ],
    contas_receber: [
      'empresa',
      'cliente',
      'plano_contas',
      'centro_custo',
      'situacao',
      'origem',
      'mes_vencimento',
      'faixa_atraso',
    ],
    movimentacoes_financeiras: [
      'empresa',
      'dia',
      'semana',
      'mes',
      'ano',
      'conta_financeira',
      'plano_contas',
      'centro_custo',
      'origem',
      'tipo',
    ],
  }

  const listaAgrupamentosPermitidos = agrupamentosPorBase[base] || []
  for (let i = 0; i < agrupamentos.length; i++) {
    const ag = agrupamentos[i]
    if (!listaAgrupamentosPermitidos.includes(ag)) {
      return c.json(400, {
        sucesso: false,
        message: 'Agrupamento não permitido para a base ' + base + ': ' + ag,
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

  const valoresPorBase = {
    itens_vendidos: [
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
    ],
    itens_comprados: [
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
    ],
    estoque_data: ['quantidade', 'custo_medio', 'valor_estoque', 'percentual_total'],
    estoque_movimentos: ['quantidade', 'valor'],
    contas_pagar: ['valor_original', 'valor_pago', 'saldo', 'quantidade_titulos', 'atraso_medio'],
    contas_receber: [
      'valor_original',
      'valor_recebido',
      'saldo',
      'quantidade_titulos',
      'atraso_medio',
    ],
    movimentacoes_financeiras: ['entradas', 'saidas', 'saldo_periodo'],
  }

  const listaValoresPermitidos = valoresPorBase[base] || []
  for (let j = 0; j < valores.length; j++) {
    const v = valores[j]
    if (!listaValoresPermitidos.includes(v)) {
      return c.json(400, {
        sucesso: false,
        message: 'Valor/métrica não permitida para a base ' + base + ': ' + v,
      })
    }
  }

  // 4. Validação de empresas e período
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
  let dataFim = String(periodo.dataFim || f.data_fim || '').trim()

  // Para estoque_data, a data_base pode ser a dataFim ou dataInicio ou f.data_base
  let dataBaseEstoque = String(f.data_base || dataFim || dataInicio || '').trim()
  if (base === 'estoque_data') {
    if (!dataBaseEstoque) {
      const agoraD = new Date()
      dataBaseEstoque = agoraD.toISOString().slice(0, 10)
    }
  } else {
    // Para todas as outras bases, período inicial e final é mandatório
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
  }

  // 5. Permissões de usuário por módulo
  const userId = authRecord.id
  let isAdmin = false
  let callerUser = null
  let podeVerCompras = false
  let podeVerProdutos = false
  let podeVerEstoque = false
  let podeVerFinanceiroPagar = false
  let podeVerFinanceiroReceber = false
  let podeVerFinanceiroBancos = false

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
          podeVerEstoque = true
          podeVerFinanceiroPagar = true
          podeVerFinanceiroReceber = true
          podeVerFinanceiroBancos = true
        } else {
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
            if (podeV) {
              if (mod === 'compras') podeVerCompras = true
              if (mod === 'produtos') podeVerProdutos = true
              if (mod === 'estoque') podeVerEstoque = true
              if (mod === 'financeiro_pagar') podeVerFinanceiroPagar = true
              if (mod === 'financeiro_receber') podeVerFinanceiroReceber = true
              if (mod === 'financeiro_bancos') podeVerFinanceiroBancos = true
            }
          }
        }
      }
    }
  } catch (_) {}

  // Verificação de permissão específica da base
  if (base === 'itens_comprados' && !podeVerCompras && !isAdmin) {
    return c.json(403, {
      sucesso: false,
      message: 'Acesso negado: a base de compras exige permissão no módulo Compras.',
    })
  }

  if ((base === 'estoque_data' || base === 'estoque_movimentos') && !podeVerEstoque && !isAdmin) {
    return c.json(403, {
      sucesso: false,
      message: 'Acesso negado: bases de estoque exigem permissão no módulo Estoque.',
    })
  }

  if (base === 'contas_pagar' && !podeVerFinanceiroPagar && !isAdmin) {
    return c.json(403, {
      sucesso: false,
      message:
        'Acesso negado: a base de Contas a Pagar exige permissão no módulo Financeiro Pagar.',
    })
  }

  if (base === 'contas_receber' && !podeVerFinanceiroReceber && !isAdmin) {
    return c.json(403, {
      sucesso: false,
      message:
        'Acesso negado: a base de Contas a Receber exige permissão no módulo Financeiro Receber.',
    })
  }

  if (
    base === 'movimentacoes_financeiras' &&
    !podeVerFinanceiroReceber &&
    !podeVerFinanceiroBancos &&
    !isAdmin
  ) {
    return c.json(403, {
      sucesso: false,
      message:
        'Acesso negado: a base de Movimentações Financeiras exige permissão no módulo Financeiro.',
    })
  }

  // Validação de acesso às empresas (helpers de tenancy locais ao callback)
  function eMasterLocal(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function obterAssinanteImpersonadoLocal(userId, appInstance) {
    const app = appInstance || $app
    if (!userId) return null
    try {
      if (!app.hasTable('master_impersonacoes')) return null
      const recs = app.findRecordsByFilter(
        'master_impersonacoes',
        "user_id = '" + userId + "'",
        '-created',
        1,
        0,
      )
      if (recs && recs.length > 0) {
        return recs[0].getString('assinante_id') || null
      }
    } catch (_) {}
    return null
  }

  function obterEmpresasUsuarioLocal(authRec) {
    if (!authRec) return []
    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && authRec.getString && authRec.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + authRec.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    // Master em modo de suporte usa o assinante impersonado
    const ehMasterUser = eMasterLocal(authRec)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    // Se for admin do assinante OU for Master, vê todas as empresas ativas do assinante
    if (isAdmin || ehMasterUser) {
      try {
        return $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuarioLocal(authRec, empId) {
    if (!empId) throw new BadRequestError('ID da empresa é obrigatório.')
    const permitidas = obterEmpresasUsuarioLocal(authRec)
    const achou = permitidas.find((e) => e.id === empId)
    if (!achou)
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    return achou
  }

  try {
    for (let j = 0; j < empresasIds.length; j++) {
      exigirEmpresaDoUsuarioLocal(authRecord, empresasIds[j])
    }
  } catch (errEmp) {
    console.error('personalizado: erro ao validar empresas do usuário:', errEmp)
    return c.json(403, {
      sucesso: false,
      message:
        errEmp && errEmp.message
          ? errEmp.message
          : 'Acesso negado: você não tem permissão para consultar as empresas selecionadas.',
    })
  }

  // Valores de custo só para quem tem permissão de ver produtos
  const temPermissaoCustos = isAdmin || podeVerProdutos

  // 6. Carregamento de mapas auxiliares comuns
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
        fornecedor_padrao_id:
          pr.getString('fornecedor_principal_id') || pr.getString('fornecedor_padrao_id'),
        ncm: pr.getString('ncm') || '',
        ativo: pr.getBool('ativo'),
        dados_fiscais_revisados:
          pr.getBool('fiscal_revisado') || pr.getBool('dados_fiscais_revisados'),
        preco_custo: pr.getFloat('preco_custo') || 0,
        custo_final: pr.getFloat('custo_final') || 0,
        controla_estoque: pr.getBool('controla_estoque'),
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
        cidade: (cl.getString('municipio') || cl.getString('cidade') || '').trim(),
      })
    }
  } catch (_) {}

  const mapaPlanoContas = new Map()
  try {
    const pcRecs = $app.findRecordsByFilter('plano_contas', '', 'codigo', 3000, 0)
    for (let pcIdx = 0; pcIdx < pcRecs.length; pcIdx++) {
      const pc = pcRecs[pcIdx]
      mapaPlanoContas.set(pc.id, {
        id: pc.id,
        codigo: pc.getString('codigo'),
        descricao: pc.getString('descricao'),
        rotulo:
          (pc.getString('codigo') ? pc.getString('codigo') + ' - ' : '') +
          pc.getString('descricao'),
      })
    }
  } catch (_) {}

  const mapaCentrosCusto = new Map()
  try {
    const ccRecs = $app.findRecordsByFilter('centros_custo', '', 'codigo', 1000, 0)
    for (let ccIdx = 0; ccIdx < ccRecs.length; ccIdx++) {
      const cc = ccRecs[ccIdx]
      mapaCentrosCusto.set(cc.id, {
        id: cc.id,
        codigo: cc.getString('codigo'),
        descricao: cc.getString('descricao'),
        rotulo:
          (cc.getString('codigo') ? cc.getString('codigo') + ' - ' : '') +
          cc.getString('descricao'),
      })
    }
  } catch (_) {}

  const mapaContasFinanceiras = new Map()
  try {
    const cfRecs = $app.findRecordsByFilter('contas_financeiras', '', 'nome', 500, 0)
    for (let cfIdx = 0; cfIdx < cfRecs.length; cfIdx++) {
      const cf = cfRecs[cfIdx]
      mapaContasFinanceiras.set(cf.id, cf.getString('nome'))
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

  const planoContasIds = Array.isArray(f.plano_contas_ids)
    ? f.plano_contas_ids.map(String).filter(Boolean)
    : []
  const centrosCustoIds = Array.isArray(f.centros_custo_ids)
    ? f.centros_custo_ids.map(String).filter(Boolean)
    : []
  const contasFinanceirasIds = Array.isArray(f.contas_financeiras_ids)
    ? f.contas_financeiras_ids.map(String).filter(Boolean)
    : []
  const situacoesTitulo = Array.isArray(f.situacoes_titulo)
    ? f.situacoes_titulo.map(String).filter(Boolean)
    : []
  const origensTitulo = Array.isArray(f.origens_titulo)
    ? f.origens_titulo.map(String).filter(Boolean)
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

  const hojeIso = extrairDataBrasilia(new Date().toISOString())

  function calcularFaixaAtraso(dataVencimentoIso, status) {
    if (!dataVencimentoIso) return 'Sem vencimento'
    const stNorm = String(status || '').toLowerCase()
    if (stNorm === 'pago' || stNorm === 'recebido' || stNorm === 'cancelado') {
      return 'Quitado / Cancelado'
    }
    const dtV = new Date(dataVencimentoIso + 'T00:00:00Z').getTime()
    const dtH = new Date(hojeIso + 'T00:00:00Z').getTime()
    const diffDias = Math.floor((dtH - dtV) / (1000 * 60 * 60 * 24))

    if (diffDias <= 0) return 'Em dia (A vencer)'
    if (diffDias <= 30) return '1 a 30 dias de atraso'
    if (diffDias <= 60) return '31 a 60 dias de atraso'
    if (diffDias <= 90) return '61 a 90 dias de atraso'
    return 'Acima de 90 dias de atraso'
  }

  // =========================================================================================
  // EXECUÇÃO POR BASE
  // =========================================================================================

  // -----------------------------------------------------------------------------------------
  // BASE 1: ITENS VENDIDOS
  // -----------------------------------------------------------------------------------------
  if (base === 'itens_vendidos') {
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
      const termRecs = $app.findRecordsByFilter('pdv_terminais', '', 'nome', 500, 0)
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

    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterVendas = '(' + empFilters + ") && ativo = true && status = 'Finalizada'"

    let vendasRecords = []
    try {
      vendasRecords = $app.findRecordsByFilter('vendas', filterVendas, 'data_emissao', 30000, 0)
    } catch (errV) {
      console.warn('Erro ao carregar vendas:', errV)
    }

    const vendasValidasMap = new Map()
    const devolucoesValidasMap = new Map()
    const todasVendasIds = []

    for (let i = 0; i < vendasRecords.length; i++) {
      const v = vendasRecords[i]
      const dtIso = extrairDataBrasilia(v.getString('data_emissao') || v.getString('created'))
      if (!dtIso || dtIso < dataInicio || dtIso > dataFim) continue

      const tipo = v.getString('tipo')
      if (tipo === 'Orçamento') continue
      if (vendasTipos.length > 0 && !vendasTipos.includes(tipo)) continue

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

      const vendId = v.getString('vendedor_id')
      if (vendedoresIds.length > 0 && !vendedoresIds.includes(vendId)) continue

      const termId = v.getString('pdv_terminal_id')
      if (terminaisPdvIds.length > 0 && !terminaisPdvIds.includes(termId)) continue

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

    const formasPorVenda = new Map()
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

    const vendasFinalIds = Array.from(vendasValidasMap.keys()).concat(
      Array.from(devolucoesValidasMap.keys()),
    )
    const itensValidos = []

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

          const temFiltroProd =
            gruposIds.length > 0 ||
            categoriasIds.length > 0 ||
            marcasIds.length > 0 ||
            produtosIds.length > 0 ||
            fornecedoresProdutoIds.length > 0 ||
            ncms.length > 0 ||
            situacaoProduto.length > 0 ||
            soFiscalNaoRevisado

          if (temFiltroProd && !produtoAtendeFiltros(pId)) continue

          const cfopItem = itemRec.getString('cfop')
          if (fiscalCfops.length > 0 && !fiscalCfops.includes(cfopItem)) continue

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

    const linhas = []
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

  // -----------------------------------------------------------------------------------------
  // BASE 2: ITENS COMPRADOS
  // -----------------------------------------------------------------------------------------
  if (base === 'itens_comprados') {
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

    const notasValidasMap = new Map()
    const todasNotasIds = []

    for (let i = 0; i < notasRecords.length; i++) {
      const n = notasRecords[i]
      const dtRef =
        f.tipo_data === 'emissao' ? n.getString('data_emissao') : n.getString('data_entrada')
      const dtIso = extrairDataBrasilia(dtRef || n.getString('created'))
      if (!dtIso || dtIso < dataInicio || dtIso > dataFim) continue

      const fId = n.getString('fornecedor_id')
      if (fornecedoresIds.length > 0 && !fornecedoresIds.includes(fId)) continue

      notasValidasMap.set(n.id, { rec: n, dtIso })
      todasNotasIds.push(n.id)
    }

    const loteTam = 40
    const itensValidos = []

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

          const temFiltroProd =
            gruposIds.length > 0 ||
            categoriasIds.length > 0 ||
            marcasIds.length > 0 ||
            produtosIds.length > 0 ||
            fornecedoresProdutoIds.length > 0 ||
            ncms.length > 0 ||
            situacaoProduto.length > 0 ||
            soFiscalNaoRevisado

          if (temFiltroProd && !produtoAtendeFiltros(pId)) continue

          const cfopItem = itemRec.getString('cfop_entrada') || itemRec.getString('cfop_fornecedor')
          if (fiscalCfops.length > 0 && !fiscalCfops.includes(cfopItem)) continue

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
      temPermissaoCustos: true,
    })
  }

  // -----------------------------------------------------------------------------------------
  // BASE 3: ESTOQUE EM UMA DATA (Prompt 8.7)
  // Reutiliza a lógica do 8.3 / estoque-gerencial:
  // - Se data_base >= hoje: estoque_saldos
  // - Se data_base < hoje: saldo_posterior e custo_medio_posterior do último estoque_movimentos
  // -----------------------------------------------------------------------------------------
  if (base === 'estoque_data') {
    const ehHojeOuFuturo = dataBaseEstoque >= hojeIso

    // Produtos elegíveis atendendo aos filtros de produtos
    const produtosElegiveisIds = []
    for (const [pId] of mapaProdutos.entries()) {
      if (produtoAtendeFiltros(pId)) {
        produtosElegiveisIds.push(pId)
      }
    }
    const produtosIdsSet = new Set(produtosElegiveisIds)

    // Mapa de saldos por par [empresa_id, produto_id]
    // key: empId + '_' + pId -> { empId, pId, saldo, custoMedio, valor }
    const mapaItensEstoque = new Map()

    if (ehHojeOuFuturo) {
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
            const cMed = s.getFloat('custo_medio') || 0
            const valTot = s.getFloat('valor_total') || qtd * cMed

            const key = empId + '_' + pId
            mapaItensEstoque.set(key, {
              empId,
              pId,
              saldo: qtd,
              custoMedio: cMed,
              valor: valTot,
            })
          }
        } catch (_) {}
      }
    } else {
      for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
        const empId = empresasIds[eIdx]
        try {
          const movs = $app.findRecordsByFilter(
            'estoque_movimentos',
            "empresa_id = '" +
              empId +
              "' && ativo = true && estornado = false && data_movimento <= '" +
              dataBaseEstoque +
              " 23:59:59'",
            'data_movimento,created',
            25000,
            0,
          )
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

            const key = empId + '_' + pId
            mapaItensEstoque.set(key, {
              empId,
              pId,
              saldo: sPost,
              custoMedio: cPost,
              valor: valTot,
            })
          })
        } catch (_) {}
      }
    }

    function extrairDimensaoEstoqueData(agrupamento, itemObj) {
      const empId = itemObj.empId
      const pId = itemObj.pId
      const pr = mapaProdutos.get(pId)

      switch (agrupamento) {
        case 'empresa': {
          const emp = mapaEmpresas.get(empId)
          return emp ? emp.nome_fantasia : 'Empresa ' + empId
        }
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
          if (!pr) return 'Produto ' + pId
          return (pr.codigo ? '[' + pr.codigo + '] ' : '') + pr.descricao
        }
        case 'fornecedor_produto': {
          const fId = pr ? pr.fornecedor_padrao_id : ''
          return fId && mapaFornecedores.has(fId)
            ? mapaFornecedores.get(fId).nome
            : 'Sem Fornecedor'
        }
        default:
          return 'Outros'
      }
    }

    const tree = new Map()
    const totalGeralAcum = {
      quantidade: 0,
      valor_estoque: 0,
    }

    for (const itemObj of mapaItensEstoque.values()) {
      const q = itemObj.saldo
      const v = itemObj.valor

      const k1 = extrairDimensaoEstoqueData(agrupamentos[0], itemObj)
      const k2 =
        agrupamentos.length > 1 ? extrairDimensaoEstoqueData(agrupamentos[1], itemObj) : null
      const k3 =
        agrupamentos.length > 2 ? extrairDimensaoEstoqueData(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          quantidade: 0,
          valor_estoque: 0,
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.quantidade += q
      node1.valor_estoque += v

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            quantidade: 0,
            valor_estoque: 0,
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.quantidade += q
        node2.valor_estoque += v

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              quantidade: 0,
              valor_estoque: 0,
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.quantidade += q
          node3.valor_estoque += v
        }
      }

      totalGeralAcum.quantidade += q
      totalGeralAcum.valor_estoque += v
    }

    const totalValorEstoqueGeral = Math.max(0, totalGeralAcum.valor_estoque)

    function calcularMetricasEstoqueData(node) {
      const q = round2(node.quantidade)
      const val = temPermissaoCustos ? round2(node.valor_estoque) : null
      const cMed = temPermissaoCustos && q > 0 ? round4(node.valor_estoque / q) : null
      const pctTot =
        temPermissaoCustos && totalValorEstoqueGeral > 0
          ? round2((node.valor_estoque / totalValorEstoqueGeral) * 100)
          : null

      return {
        quantidade: q,
        custo_medio: cMed,
        valor_estoque: val,
        percentual_total: pctTot,
      }
    }

    const linhas = []
    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricasEstoqueData(n1)
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
          const metricasN2 = calcularMetricasEstoqueData(n2)
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
              const metricasN3 = calcularMetricasEstoqueData(n3)
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
      custo_medio:
        temPermissaoCustos && totalGeralAcum.quantidade > 0
          ? round4(totalValorEstoqueGeral / totalGeralAcum.quantidade)
          : null,
      valor_estoque: temPermissaoCustos ? round2(totalValorEstoqueGeral) : null,
      percentual_total: 100,
    }

    const podeGrafico = tree.size <= 20
    let dadosGrafico = null
    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricasEstoqueData(n1)
        dadosGrafico.push({
          rotulo: k1,
          valor_estoque: m.valor_estoque,
          quantidade: m.quantidade,
        })
      }
      dadosGrafico.sort(
        (a, b) => (b.valor_estoque || b.quantidade) - (a.valor_estoque || a.quantidade),
      )
    }

    return c.json(200, {
      sucesso: true,
      base: 'estoque_data',
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos,
    })
  }

  // -----------------------------------------------------------------------------------------
  // BASE 4: MOVIMENTAÇÕES DE ESTOQUE (Prompt 8.7)
  // estoque_movimentos (sem os estornados)
  // Agrupar também por: empresa, grupo, categoria, marca, produto, fornecedor_produto,
  // origem do movimento, tipo (entrada ou saída) e tempo (dia, semana, mes, ano)
  // Valores: quantidade, valor
  // -----------------------------------------------------------------------------------------
  if (base === 'estoque_movimentos') {
    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterMovs =
      '(' +
      empFilters +
      ") && ativo = true && estornado = false && data_movimento >= '" +
      dataInicio +
      " 00:00:00' && data_movimento <= '" +
      dataFim +
      " 23:59:59'"

    let movsRecords = []
    try {
      movsRecords = $app.findRecordsByFilter(
        'estoque_movimentos',
        filterMovs,
        'data_movimento',
        30000,
        0,
      )
    } catch (errM) {
      console.warn('Erro ao carregar movimentos de estoque:', errM)
    }

    const itensValidos = []
    for (let i = 0; i < movsRecords.length; i++) {
      const m = movsRecords[i]
      const pId = m.getString('produto_id')

      const temFiltroProd =
        gruposIds.length > 0 ||
        categoriasIds.length > 0 ||
        marcasIds.length > 0 ||
        produtosIds.length > 0 ||
        fornecedoresProdutoIds.length > 0 ||
        ncms.length > 0 ||
        situacaoProduto.length > 0 ||
        soFiscalNaoRevisado

      if (temFiltroProd && !produtoAtendeFiltros(pId)) continue

      const dtIso = extrairDataBrasilia(m.getString('data_movimento') || m.getString('created'))
      itensValidos.push({
        rec: m,
        dtIso,
      })
    }

    function extrairDimensaoMovEstoque(agrupamento, itemObj) {
      const m = itemObj.rec
      const dtIso = itemObj.dtIso
      const pId = m.getString('produto_id')
      const pr = mapaProdutos.get(pId)
      const empId = m.getString('empresa_id')

      switch (agrupamento) {
        case 'empresa': {
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
          if (!pr) return 'Produto ' + pId
          return (pr.codigo ? '[' + pr.codigo + '] ' : '') + pr.descricao
        }
        case 'fornecedor_produto': {
          const fId = pr ? pr.fornecedor_padrao_id : ''
          return fId && mapaFornecedores.has(fId)
            ? mapaFornecedores.get(fId).nome
            : 'Sem Fornecedor'
        }
        case 'origem':
          return m.getString('origem') || 'Não informada'
        case 'tipo':
          return m.getString('tipo') || 'Entrada'
        default:
          return 'Outros'
      }
    }

    const tree = new Map()
    const totalGeralAcum = {
      quantidade: 0,
      valor: 0,
    }

    for (let idx = 0; idx < itensValidos.length; idx++) {
      const itemObj = itensValidos[idx]
      const m = itemObj.rec
      const q = m.getFloat('quantidade') || 0
      const v = m.getFloat('valor_total') || q * (m.getFloat('custo_unitario') || 0)

      const k1 = extrairDimensaoMovEstoque(agrupamentos[0], itemObj)
      const k2 =
        agrupamentos.length > 1 ? extrairDimensaoMovEstoque(agrupamentos[1], itemObj) : null
      const k3 =
        agrupamentos.length > 2 ? extrairDimensaoMovEstoque(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          quantidade: 0,
          valor: 0,
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.quantidade += q
      node1.valor += v

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            quantidade: 0,
            valor: 0,
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.quantidade += q
        node2.valor += v

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              quantidade: 0,
              valor: 0,
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.quantidade += q
          node3.valor += v
        }
      }

      totalGeralAcum.quantidade += q
      totalGeralAcum.valor += v
    }

    function calcularMetricasMovEstoque(node) {
      const q = round2(node.quantidade)
      const v = temPermissaoCustos ? round2(node.valor) : null
      return {
        quantidade: q,
        valor: v,
      }
    }

    const linhas = []
    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricasMovEstoque(n1)
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
          const metricasN2 = calcularMetricasMovEstoque(n2)
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
              const metricasN3 = calcularMetricasMovEstoque(n3)
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
      valor: temPermissaoCustos ? round2(totalGeralAcum.valor) : null,
    }

    const ehTempo = ['dia', 'semana', 'mes', 'ano'].includes(agrupamentos[0])
    const podeGrafico = ehTempo || tree.size <= 20
    let dadosGrafico = null

    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricasMovEstoque(n1)
        dadosGrafico.push({
          rotulo: k1,
          quantidade: m.quantidade,
          valor: m.valor,
        })
      }
      if (ehTempo) {
        dadosGrafico.sort((a, b) => a.rotulo.localeCompare(b.rotulo))
      } else {
        dadosGrafico.sort((a, b) => (b.valor || b.quantidade) - (a.valor || a.quantidade))
      }
    }

    return c.json(200, {
      sucesso: true,
      base: 'estoque_movimentos',
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos,
    })
  }

  // -----------------------------------------------------------------------------------------
  // BASE 5 e 6: CONTAS A PAGAR E CONTAS A RECEBER (Prompt 8.7)
  // Títulos sem os cancelados.
  // Agrupar por: empresa, fornecedor ou cliente, conta do plano de contas, centro de custo,
  // situação, origem, mês de vencimento, faixa de atraso.
  // Valores: valor original, pago ou recebido, saldo, quantidade de títulos, atraso médio em dias.
  // -----------------------------------------------------------------------------------------
  if (base === 'contas_pagar' || base === 'contas_receber') {
    const isPagar = base === 'contas_pagar'
    const colName = isPagar ? 'contas_pagar' : 'contas_receber'

    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterTitulos = '(' + empFilters + ") && ativo = true && status != 'Cancelado'"

    let titulosRecords = []
    try {
      titulosRecords = $app.findRecordsByFilter(colName, filterTitulos, 'data_vencimento', 30000, 0)
    } catch (errT) {
      console.warn('Erro ao carregar títulos ' + colName + ':', errT)
    }

    const tipoData = f.tipo_data || 'vencimento'
    const itensValidos = []

    for (let i = 0; i < titulosRecords.length; i++) {
      const t = titulosRecords[i]

      // Campo de data conforme tipo_data
      let dtCampo = t.getString('data_vencimento')
      if (tipoData === 'emissao') dtCampo = t.getString('data_emissao')
      else if (tipoData === 'pagamento')
        dtCampo = isPagar ? t.getString('data_pagamento') : t.getString('data_recebimento')
      else if (tipoData === 'competencia') dtCampo = t.getString('data_competencia')

      const dtIso = extrairDataBrasilia(dtCampo || t.getString('created'))
      if (!dtIso || dtIso < dataInicio || dtIso > dataFim) continue

      // Filtro de Fornecedor / Cliente
      if (isPagar) {
        const fId = t.getString('fornecedor_id')
        if (fornecedoresIds.length > 0 && !fornecedoresIds.includes(fId)) continue
      } else {
        const clId = t.getString('cliente_id')
        if (clientesIds.length > 0 && !clientesIds.includes(clId)) continue
      }

      // Filtro de Plano de Contas
      const pcId = t.getString('plano_conta_id')
      if (planoContasIds.length > 0 && !planoContasIds.includes(pcId)) continue

      // Filtro de Centro de Custo
      const ccId = t.getString('centro_custo_id')
      if (centrosCustoIds.length > 0 && !centrosCustoIds.includes(ccId)) continue

      // Filtro de Situações do Título
      const status = t.getString('status')
      if (situacoesTitulo.length > 0 && !situacoesTitulo.includes(status)) continue

      // Filtro de Origens do Título
      const origem = t.getString('origem')
      if (origensTitulo.length > 0 && !origensTitulo.includes(origem)) continue

      const dtVencIso = extrairDataBrasilia(t.getString('data_vencimento'))
      itensValidos.push({
        rec: t,
        dtIso,
        dtVencIso,
      })
    }

    function extrairDimensaoFinanceiro(agrupamento, itemObj) {
      const t = itemObj.rec
      const empId = t.getString('empresa_id')

      switch (agrupamento) {
        case 'empresa': {
          const emp = mapaEmpresas.get(empId)
          return emp ? emp.nome_fantasia : 'Empresa ' + empId
        }
        case 'fornecedor': {
          const fId = t.getString('fornecedor_id')
          return fId && mapaFornecedores.has(fId)
            ? mapaFornecedores.get(fId).nome
            : 'Sem Fornecedor'
        }
        case 'cliente': {
          const cId = t.getString('cliente_id')
          return cId && mapaClientes.has(cId) ? mapaClientes.get(cId).nome : 'Sem Cliente'
        }
        case 'plano_contas': {
          const pcId = t.getString('plano_conta_id')
          return pcId && mapaPlanoContas.has(pcId)
            ? mapaPlanoContas.get(pcId).rotulo
            : 'Sem Plano de Contas'
        }
        case 'centro_custo': {
          const ccId = t.getString('centro_custo_id')
          return ccId && mapaCentrosCusto.has(ccId)
            ? mapaCentrosCusto.get(ccId).rotulo
            : 'Sem Centro de Custo'
        }
        case 'situacao':
          return t.getString('status') || 'Não informada'
        case 'origem':
          return t.getString('origem') || 'Manual'
        case 'mes_vencimento':
          return obterMes(itemObj.dtVencIso)
        case 'faixa_atraso':
          return calcularFaixaAtraso(itemObj.dtVencIso, t.getString('status'))
        default:
          return 'Outros'
      }
    }

    const tree = new Map()
    const totalGeralAcum = {
      valor_original: 0,
      valor_liquidado: 0, // pago ou recebido
      saldo: 0,
      quantidade_titulos: 0,
      soma_dias_atraso: 0,
    }

    for (let idx = 0; idx < itensValidos.length; idx++) {
      const itemObj = itensValidos[idx]
      const t = itemObj.rec
      const vo = t.getFloat('valor_original') || 0
      const vl = isPagar ? t.getFloat('valor_pago') || 0 : t.getFloat('valor_recebido') || 0
      const s = t.getFloat('saldo') || 0

      // Cálculo de atraso em dias (somente se título em aberto com vencimento < hoje)
      const stNorm = String(t.getString('status') || '').toLowerCase()
      let diasAtraso = 0
      if (
        stNorm !== 'pago' &&
        stNorm !== 'recebido' &&
        stNorm !== 'cancelado' &&
        itemObj.dtVencIso &&
        itemObj.dtVencIso < hojeIso
      ) {
        const dtV = new Date(itemObj.dtVencIso + 'T00:00:00Z').getTime()
        const dtH = new Date(hojeIso + 'T00:00:00Z').getTime()
        diasAtraso = Math.max(0, Math.floor((dtH - dtV) / (1000 * 60 * 60 * 24)))
      }

      const k1 = extrairDimensaoFinanceiro(agrupamentos[0], itemObj)
      const k2 =
        agrupamentos.length > 1 ? extrairDimensaoFinanceiro(agrupamentos[1], itemObj) : null
      const k3 =
        agrupamentos.length > 2 ? extrairDimensaoFinanceiro(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          valor_original: 0,
          valor_liquidado: 0,
          saldo: 0,
          quantidade_titulos: 0,
          soma_dias_atraso: 0,
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.valor_original += vo
      node1.valor_liquidado += vl
      node1.saldo += s
      node1.quantidade_titulos += 1
      node1.soma_dias_atraso += diasAtraso

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            valor_original: 0,
            valor_liquidado: 0,
            saldo: 0,
            quantidade_titulos: 0,
            soma_dias_atraso: 0,
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.valor_original += vo
        node2.valor_liquidado += vl
        node2.saldo += s
        node2.quantidade_titulos += 1
        node2.soma_dias_atraso += diasAtraso

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              valor_original: 0,
              valor_liquidado: 0,
              saldo: 0,
              quantidade_titulos: 0,
              soma_dias_atraso: 0,
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.valor_original += vo
          node3.valor_liquidado += vl
          node3.saldo += s
          node3.quantidade_titulos += 1
          node3.soma_dias_atraso += diasAtraso
        }
      }

      totalGeralAcum.valor_original += vo
      totalGeralAcum.valor_liquidado += vl
      totalGeralAcum.saldo += s
      totalGeralAcum.quantidade_titulos += 1
      totalGeralAcum.soma_dias_atraso += diasAtraso
    }

    function calcularMetricasTitulos(node) {
      const vo = round2(node.valor_original)
      const vl = round2(node.valor_liquidado)
      const s = round2(node.saldo)
      const q = node.quantidade_titulos
      const atrasoMed = q > 0 ? round2(node.soma_dias_atraso / q) : 0

      if (isPagar) {
        return {
          valor_original: vo,
          valor_pago: vl,
          saldo: s,
          quantidade_titulos: q,
          atraso_medio: atrasoMed,
        }
      } else {
        return {
          valor_original: vo,
          valor_recebido: vl,
          saldo: s,
          quantidade_titulos: q,
          atraso_medio: atrasoMed,
        }
      }
    }

    const linhas = []
    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricasTitulos(n1)
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
          const metricasN2 = calcularMetricasTitulos(n2)
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
              const metricasN3 = calcularMetricasTitulos(n3)
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

    const qTot = totalGeralAcum.quantidade_titulos
    const atrasoMedTot = qTot > 0 ? round2(totalGeralAcum.soma_dias_atraso / qTot) : 0
    let totalGeralMetricas = {}
    if (isPagar) {
      totalGeralMetricas = {
        valor_original: round2(totalGeralAcum.valor_original),
        valor_pago: round2(totalGeralAcum.valor_liquidado),
        saldo: round2(totalGeralAcum.saldo),
        quantidade_titulos: qTot,
        atraso_medio: atrasoMedTot,
      }
    } else {
      totalGeralMetricas = {
        valor_original: round2(totalGeralAcum.valor_original),
        valor_recebido: round2(totalGeralAcum.valor_liquidado),
        saldo: round2(totalGeralAcum.saldo),
        quantidade_titulos: qTot,
        atraso_medio: atrasoMedTot,
      }
    }

    const podeGrafico = tree.size <= 20
    let dadosGrafico = null
    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricasTitulos(n1)
        dadosGrafico.push({
          rotulo: k1,
          saldo: m.saldo,
          valor_original: m.valor_original,
          quantidade_titulos: m.quantidade_titulos,
        })
      }
      dadosGrafico.sort((a, b) => (b.saldo || 0) - (a.saldo || 0))
    }

    return c.json(200, {
      sucesso: true,
      base,
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos: true,
    })
  }

  // -----------------------------------------------------------------------------------------
  // BASE 7: MOVIMENTAÇÕES FINANCEIRAS (Prompt 8.7)
  // movimentacoes_financeiras sem as estornadas
  // Agrupar por: empresa, conta financeira, plano de contas, centro de custo,
  // origem, tipo (entrada ou saída) e tempo (dia, semana, mes, ano).
  // Valores: entradas, saídas, saldo do período.
  // -----------------------------------------------------------------------------------------
  if (base === 'movimentacoes_financeiras') {
    const empFilters = empresasIds.map((id) => "empresa_id = '" + id + "'").join(' || ')
    const filterMovs =
      '(' +
      empFilters +
      ") && ativo = true && estornado = false && data_movimento >= '" +
      dataInicio +
      " 00:00:00' && data_movimento <= '" +
      dataFim +
      " 23:59:59'"

    let movsRecords = []
    try {
      movsRecords = $app.findRecordsByFilter(
        'movimentacoes_financeiras',
        filterMovs,
        'data_movimento',
        30000,
        0,
      )
    } catch (errM) {
      console.warn('Erro ao carregar movimentações financeiras:', errM)
    }

    // Carregar pagamentos_baixas para vincular plano de contas e centro de custo quando houver lote_baixa_id
    // ou documento_id correspondente
    const mapaBaixas = new Map() // lote_baixa_id ou conta_pagar_id -> { plano_conta_id, centro_custo_id }
    try {
      const baixas = $app.findRecordsByFilter(
        'pagamentos_baixas',
        'ativo = true && estornado = false',
        'data_pagamento',
        25000,
        0,
      )
      for (let bIdx = 0; bIdx < baixas.length; bIdx++) {
        const b = baixas[bIdx]
        const lId = b.getString('lote_baixa_id')
        const cpId = b.getString('conta_pagar_id')
        const crId = b.getString('conta_receber_id')
        const pcId = b.getString('plano_desconto_id')

        const info = {
          plano_conta_id: pcId || '',
          centro_custo_id: '',
        }
        if (lId && !mapaBaixas.has('lote_' + lId)) mapaBaixas.set('lote_' + lId, info)
        if (cpId && !mapaBaixas.has('pagar_' + cpId)) mapaBaixas.set('pagar_' + cpId, info)
        if (crId && !mapaBaixas.has('receber_' + crId)) mapaBaixas.set('receber_' + crId, info)
      }
    } catch (_) {}

    // Pré-carregar planos e centros dos títulos para resolver movimentações financeiras originadas de títulos
    const mapaTitulosPagarInfo = new Map()
    try {
      const cps = $app.findRecordsByFilter('contas_pagar', 'ativo = true', '', 20000, 0)
      for (let cpIdx = 0; cpIdx < cps.length; cpIdx++) {
        const cp = cps[cpIdx]
        mapaTitulosPagarInfo.set(cp.id, {
          plano_conta_id: cp.getString('plano_conta_id'),
          centro_custo_id: cp.getString('centro_custo_id'),
        })
      }
    } catch (_) {}

    const mapaTitulosReceberInfo = new Map()
    try {
      const crs = $app.findRecordsByFilter('contas_receber', 'ativo = true', '', 20000, 0)
      for (let crIdx = 0; crIdx < crs.length; crIdx++) {
        const cr = crs[crIdx]
        mapaTitulosReceberInfo.set(cr.id, {
          plano_conta_id: cr.getString('plano_conta_id'),
          centro_custo_id: cr.getString('centro_custo_id'),
        })
      }
    } catch (_) {}

    const itensValidos = []
    for (let i = 0; i < movsRecords.length; i++) {
      const m = movsRecords[i]
      const cfId = m.getString('conta_financeira_id')
      if (contasFinanceirasIds.length > 0 && !contasFinanceirasIds.includes(cfId)) continue

      const dtIso = extrairDataBrasilia(m.getString('data_movimento') || m.getString('created'))

      // Resolver plano de contas e centro de custo da movimentação
      let pcId = ''
      let ccId = ''
      const docTipo = m.getString('documento_tipo')
      const docId = m.getString('documento_id')
      const lId = m.getString('lote_baixa_id')

      if (docTipo === 'contas_pagar' && docId && mapaTitulosPagarInfo.has(docId)) {
        const cpInfo = mapaTitulosPagarInfo.get(docId)
        pcId = cpInfo.plano_conta_id
        ccId = cpInfo.centro_custo_id
      } else if (docTipo === 'contas_receber' && docId && mapaTitulosReceberInfo.has(docId)) {
        const crInfo = mapaTitulosReceberInfo.get(docId)
        pcId = crInfo.plano_conta_id
        ccId = crInfo.centro_custo_id
      } else if (lId && mapaBaixas.has('lote_' + lId)) {
        const bInfo = mapaBaixas.get('lote_' + lId)
        pcId = bInfo.plano_conta_id
        ccId = bInfo.centro_custo_id
      }

      if (planoContasIds.length > 0 && (!pcId || !planoContasIds.includes(pcId))) continue
      if (centrosCustoIds.length > 0 && (!ccId || !centrosCustoIds.includes(ccId))) continue

      itensValidos.push({
        rec: m,
        dtIso,
        pcId,
        ccId,
      })
    }

    function extrairDimensaoMovFin(agrupamento, itemObj) {
      const m = itemObj.rec
      const dtIso = itemObj.dtIso
      const empId = m.getString('empresa_id')

      switch (agrupamento) {
        case 'empresa': {
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
        case 'conta_financeira': {
          const cfId = m.getString('conta_financeira_id')
          return cfId && mapaContasFinanceiras.has(cfId)
            ? mapaContasFinanceiras.get(cfId)
            : 'Sem Conta'
        }
        case 'plano_contas': {
          const pcId = itemObj.pcId
          return pcId && mapaPlanoContas.has(pcId)
            ? mapaPlanoContas.get(pcId).rotulo
            : 'Sem Plano de Contas'
        }
        case 'centro_custo': {
          const ccId = itemObj.ccId
          return ccId && mapaCentrosCusto.has(ccId)
            ? mapaCentrosCusto.get(ccId).rotulo
            : 'Sem Centro de Custo'
        }
        case 'origem':
          return m.getString('origem') || 'Não informada'
        case 'tipo':
          return m.getString('tipo') || 'Entrada'
        default:
          return 'Outros'
      }
    }

    const tree = new Map()
    const totalGeralAcum = {
      entradas: 0,
      saidas: 0,
      saldo_periodo: 0,
    }

    for (let idx = 0; idx < itensValidos.length; idx++) {
      const itemObj = itensValidos[idx]
      const m = itemObj.rec
      const val = m.getFloat('valor') || 0
      const tipo = m.getString('tipo') // 'Entrada' | 'Saída'
      const ent = tipo === 'Entrada' ? val : 0
      const sai = tipo === 'Saída' ? val : 0
      const saldoDelta = ent - sai

      const k1 = extrairDimensaoMovFin(agrupamentos[0], itemObj)
      const k2 = agrupamentos.length > 1 ? extrairDimensaoMovFin(agrupamentos[1], itemObj) : null
      const k3 = agrupamentos.length > 2 ? extrairDimensaoMovFin(agrupamentos[2], itemObj) : null

      if (!tree.has(k1)) {
        tree.set(k1, {
          chave: k1,
          nivel: 1,
          entradas: 0,
          saidas: 0,
          saldo_periodo: 0,
          filhos: new Map(),
        })
      }
      const node1 = tree.get(k1)
      node1.entradas += ent
      node1.saidas += sai
      node1.saldo_periodo += saldoDelta

      if (k2 !== null) {
        if (!node1.filhos.has(k2)) {
          node1.filhos.set(k2, {
            chave: k2,
            nivel: 2,
            entradas: 0,
            saidas: 0,
            saldo_periodo: 0,
            filhos: new Map(),
          })
        }
        const node2 = node1.filhos.get(k2)
        node2.entradas += ent
        node2.saidas += sai
        node2.saldo_periodo += saldoDelta

        if (k3 !== null) {
          if (!node2.filhos.has(k3)) {
            node2.filhos.set(k3, {
              chave: k3,
              nivel: 3,
              entradas: 0,
              saidas: 0,
              saldo_periodo: 0,
              filhos: new Map(),
            })
          }
          const node3 = node2.filhos.get(k3)
          node3.entradas += ent
          node3.saidas += sai
          node3.saldo_periodo += saldoDelta
        }
      }

      totalGeralAcum.entradas += ent
      totalGeralAcum.saidas += sai
      totalGeralAcum.saldo_periodo += saldoDelta
    }

    function calcularMetricasMovFin(node) {
      return {
        entradas: round2(node.entradas),
        saidas: round2(node.saidas),
        saldo_periodo: round2(node.saldo_periodo),
      }
    }

    const linhas = []
    for (const [k1, n1] of tree.entries()) {
      const metricasN1 = calcularMetricasMovFin(n1)
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
          const metricasN2 = calcularMetricasMovFin(n2)
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
              const metricasN3 = calcularMetricasMovFin(n3)
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
      entradas: round2(totalGeralAcum.entradas),
      saidas: round2(totalGeralAcum.saidas),
      saldo_periodo: round2(totalGeralAcum.saldo_periodo),
    }

    const ehTempo = ['dia', 'semana', 'mes', 'ano'].includes(agrupamentos[0])
    const podeGrafico = ehTempo || tree.size <= 20
    let dadosGrafico = null

    if (podeGrafico) {
      dadosGrafico = []
      for (const [k1, n1] of tree.entries()) {
        const m = calcularMetricasMovFin(n1)
        dadosGrafico.push({
          rotulo: k1,
          entradas: m.entradas,
          saidas: m.saidas,
          saldo_periodo: m.saldo_periodo,
        })
      }
      if (ehTempo) {
        dadosGrafico.sort((a, b) => a.rotulo.localeCompare(b.rotulo))
      } else {
        dadosGrafico.sort((a, b) => b.entradas - a.entradas)
      }
    }

    return c.json(200, {
      sucesso: true,
      base: 'movimentacoes_financeiras',
      agrupamentos,
      valores,
      linhas,
      totalGeral: totalGeralMetricas,
      totalLinhas: linhas.length,
      dadosGrafico,
      temPermissaoCustos: true,
    })
  }

  return c.json(400, { sucesso: false, message: 'Base não suportada.' })
})
