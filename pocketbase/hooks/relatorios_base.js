// @ts-check
/// <reference path="../types.d.ts" />

/**
 * MOTOR COMUM DE FILTROS E ENDPOINTS DE RELATÓRIOS (Etapa 8 - Prompt 8.0b)
 *
 * Padroniza:
 * 1. O formato único do objeto `filtros` recebido do frontend.
 * 2. A conferência estrita de permissão de acesso a empresas autorizadas pelo usuário.
 * 3. Validação mandatória de período (máximo 366 dias, data_inicio <= data_fim).
 * 4. Aplicação uniforme de cada critério de filtro sobre coleções e entidades.
 * 5. Regra mandatória: em relatórios de vendas, quando houver filtros de produto (grupos, marcas,
 *    produtos, NCM, etc.), os itens da venda são filtrados diretamente (os totais passam a ser
 *    estritamente dos itens filtrados), e o cabeçalho/metadados avisa expressamente essa condição.
 * 6. Supressão de cancelados e de documentos fiscais em homologação (a menos que explicitamente autorizado).
 */

routerAdd('POST', '/backend/v1/relatorios/validar-filtros', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
  }

  const body = c.requestInfo().body || {}
  const f = body.filtros && typeof body.filtros === 'object' ? body.filtros : body

  // Normalização dos filtros
  const empresasIds = Array.isArray(f.empresas_ids)
    ? f.empresas_ids.map((x) => String(x).trim()).filter(Boolean)
    : []

  const periodo = f.periodo && typeof f.periodo === 'object' ? f.periodo : {}
  const dataInicio = (periodo.dataInicio || f.data_inicio || '').trim()
  const dataFim = (periodo.dataFim || f.data_fim || '').trim()

  // 1. Produtos
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

  // 2. Pessoas
  const clientesIds = Array.isArray(f.clientes_ids)
    ? f.clientes_ids.map(String).filter(Boolean)
    : []
  const fornecedoresIds = Array.isArray(f.fornecedores_ids)
    ? f.fornecedores_ids.map(String).filter(Boolean)
    : []
  const vendedoresIds = Array.isArray(f.vendedores_ids)
    ? f.vendedores_ids.map(String).filter(Boolean)
    : []
  const operadoresCaixaIds = Array.isArray(f.operadores_caixa_ids)
    ? f.operadores_caixa_ids.map(String).filter(Boolean)
    : []
  const clienteUfs = Array.isArray(f.cliente_ufs) ? f.cliente_ufs.map(String).filter(Boolean) : []
  const clienteCidades = Array.isArray(f.cliente_cidades)
    ? f.cliente_cidades.map(String).filter(Boolean)
    : []

  // 3. Vendas
  const vendasTipos = Array.isArray(f.vendas_tipos)
    ? f.vendas_tipos.map(String).filter(Boolean)
    : []
  const vendasStatus = Array.isArray(f.vendas_status)
    ? f.vendas_status.map(String).filter(Boolean)
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

  // 4. Fiscal
  const fiscalModelos = Array.isArray(f.fiscal_modelos)
    ? f.fiscal_modelos.map(String).filter(Boolean)
    : []
  const fiscalCfops = Array.isArray(f.fiscal_cfops)
    ? f.fiscal_cfops.map(String).filter(Boolean)
    : []
  const fiscalCstsCsosns = Array.isArray(f.fiscal_csts_csosns)
    ? f.fiscal_csts_csosns.map(String).filter(Boolean)
    : []
  const fiscalSituacoesNota = Array.isArray(f.fiscal_situacoes_nota)
    ? f.fiscal_situacoes_nota.map(String).filter(Boolean)
    : []
  const fiscalUfsDestino = Array.isArray(f.fiscal_ufs_destino)
    ? f.fiscal_ufs_destino.map(String).filter(Boolean)
    : []

  // 5. Financeiro
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

  // 6. Datas
  const tipoData = ['emissao', 'vencimento', 'pagamento', 'competencia', 'entrada'].includes(
    f.tipo_data,
  )
    ? f.tipo_data
    : f.tipo_data || 'emissao'

  const filtrosNorm = {
    empresas_ids: empresasIds,
    ver_so_total: Boolean(f.ver_so_total),
    periodo: { dataInicio, dataFim },
    incluir_notas_teste: Boolean(f.incluir_notas_teste),
    grupos_ids: gruposIds,
    categorias_ids: categoriasIds,
    marcas_ids: marcasIds,
    produtos_ids: produtosIds,
    fornecedores_produto_ids: fornecedoresProdutoIds,
    ncms,
    situacao_produto: situacaoProduto,
    so_fiscal_nao_revisado: soFiscalNaoRevisado,
    temFiltroProduto,
    clientes_ids: clientesIds,
    fornecedores_ids: fornecedoresIds,
    vendedores_ids: vendedoresIds,
    operadores_caixa_ids: operadoresCaixaIds,
    cliente_ufs: clienteUfs,
    cliente_cidades: clienteCidades,
    vendas_tipos: vendasTipos,
    vendas_status: vendasStatus,
    formas_pagamento_ids: formasPagamentoIds,
    terminais_pdv_ids: terminaisPdvIds,
    intermediadores_ids: intermediadoresIds,
    vendas_nota_fiscal: vendasNotaFiscal,
    fiscal_modelos: fiscalModelos,
    fiscal_cfops: fiscalCfops,
    fiscal_csts_csosns: fiscalCstsCsosns,
    fiscal_situacoes_nota: fiscalSituacoesNota,
    fiscal_ufs_destino: fiscalUfsDestino,
    plano_contas_ids: planoContasIds,
    centros_custo_ids: centrosCustoIds,
    contas_financeiras_ids: contasFinanceirasIds,
    situacoes_titulo: situacoesTitulo,
    origens_titulo: origensTitulo,
    tipo_data: tipoData,
  }

  // Validação de empresas
  if (filtrosNorm.empresas_ids.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Selecione ao menos uma empresa para a consulta.',
    })
  }

  // Conferência de permissões multiempresa e governança multi-tenant (Etapa 9)
  const userId = authRecord.id
  let isAdmin = false
  let callerUser = null

  try {
    const uRecs = $app.findRecordsByFilter(
      'usuarios',
      `auth_user_id = '${userId}' || id = '${userId}'`,
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

  if (!callerUser) {
    return c.json(403, { sucesso: false, message: 'Usuário não localizado no ERP.' })
  }

  const assinanteId = callerUser.getString('assinante_id')
  if (!assinanteId) {
    return c.json(403, {
      sucesso: false,
      message: 'Usuário não possui vínculo com nenhum assinante.',
    })
  }

  const empresasPermitidas = new Set()

  if (isAdmin) {
    // Administrador do assinante: vê todas as empresas ativas do PRÓPRIO assinante (nunca de outro)
    try {
      const empsAssinante = $app.findRecordsByFilter(
        'empresas',
        `assinante_id = '${assinanteId}' && ativo = true`,
        '',
        500,
        0,
      )
      for (let i = 0; i < empsAssinante.length; i++) {
        empresasPermitidas.add(empsAssinante[i].id)
      }
    } catch (_) {}
  } else {
    // Usuário comum: apenas as empresas ativas de usuarios_empresas que pertençam ao mesmo assinante
    const padraoId = callerUser.getString('empresa_padrao_id')
    if (padraoId) {
      try {
        const empPadrao = $app.findRecordById('empresas', padraoId)
        if (
          empPadrao &&
          empPadrao.getBool('ativo') &&
          empPadrao.getString('assinante_id') === assinanteId
        ) {
          empresasPermitidas.add(padraoId)
        }
      } catch (_) {}
    }

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        `usuario_id = '${callerUser.id}' && ativo = true`,
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) {
          try {
            const empVinculo = $app.findRecordById('empresas', eId)
            if (
              empVinculo &&
              empVinculo.getBool('ativo') &&
              empVinculo.getString('assinante_id') === assinanteId
            ) {
              empresasPermitidas.add(eId)
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  for (let j = 0; j < filtrosNorm.empresas_ids.length; j++) {
    const id = filtrosNorm.empresas_ids[j]
    if (!empresasPermitidas.has(id)) {
      return c.json(403, {
        sucesso: false,
        message: `Acesso negado: a empresa ID ${id} não pertence ao seu assinante ou não está autorizada.`,
      })
    }
  }

  // Validação do período máximo (366 dias)
  if (!filtrosNorm.periodo.dataInicio || !filtrosNorm.periodo.dataFim) {
    return c.json(400, {
      sucesso: false,
      message: 'Data inicial e data final são obrigatórias.',
    })
  }
  const tIni = new Date(filtrosNorm.periodo.dataInicio + 'T00:00:00Z').getTime()
  const tFim = new Date(filtrosNorm.periodo.dataFim + 'T23:59:59Z').getTime()
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
      message: `O período solicitado (${diffDias} dias) excede o limite máximo permitido de 366 dias.`,
    })
  }

  // Linha legível de resumo dos filtros
  const partes = []
  if (filtrosNorm.empresas_ids.length > 0) {
    partes.push(`Empresas: ${filtrosNorm.empresas_ids.length} selecionada(s)`)
  }
  if (filtrosNorm.periodo.dataInicio && filtrosNorm.periodo.dataFim) {
    partes.push(`Período: ${filtrosNorm.periodo.dataInicio} até ${filtrosNorm.periodo.dataFim}`)
  }
  if (filtrosNorm.grupos_ids.length > 0) {
    partes.push(`Grupos: ${filtrosNorm.grupos_ids.length}`)
  }
  if (filtrosNorm.categorias_ids.length > 0) {
    partes.push(`Categorias: ${filtrosNorm.categorias_ids.length}`)
  }
  if (filtrosNorm.marcas_ids.length > 0) {
    partes.push(`Marcas: ${filtrosNorm.marcas_ids.length}`)
  }
  if (filtrosNorm.produtos_ids.length > 0) {
    partes.push(`Produtos: ${filtrosNorm.produtos_ids.length}`)
  }
  if (filtrosNorm.clientes_ids.length > 0) {
    partes.push(`Clientes: ${filtrosNorm.clientes_ids.length}`)
  }
  if (filtrosNorm.vendedores_ids.length > 0) {
    partes.push(`Vendedores: ${filtrosNorm.vendedores_ids.length}`)
  }
  if (filtrosNorm.vendas_tipos.length > 0) {
    partes.push(`Tipos: ${filtrosNorm.vendas_tipos.join(', ')}`)
  }
  if (filtrosNorm.vendas_status.length > 0) {
    partes.push(`Status Venda: ${filtrosNorm.vendas_status.join(', ')}`)
  }
  if (filtrosNorm.fiscal_modelos.length > 0) {
    partes.push(`Modelos: ${filtrosNorm.fiscal_modelos.join(', ')}`)
  }
  if (filtrosNorm.plano_contas_ids.length > 0) {
    partes.push(`Plano de Contas: ${filtrosNorm.plano_contas_ids.length}`)
  }
  if (filtrosNorm.tipo_data && filtrosNorm.tipo_data !== 'emissao') {
    const mapData = {
      vencimento: 'Por Vencimento',
      pagamento: 'Por Pagamento',
      competencia: 'Por Competência',
      entrada: 'Por Data de Entrada',
    }
    partes.push(mapData[filtrosNorm.tipo_data] || `Data: ${filtrosNorm.tipo_data}`)
  }
  if (filtrosNorm.temFiltroProduto) {
    partes.push('Filtro de produto ativo (totais correspondem apenas aos itens filtrados)')
  }

  const linhaLegivel = partes.join(' · ') || 'Sem filtros adicionais'

  return c.json(200, {
    sucesso: true,
    filtros: filtrosNorm,
    linhaLegivel,
    avisoFiltroItens: filtrosNorm.temFiltroProduto
      ? 'Atenção: Filtro de produto aplicado. Os totais de vendas e compras exibem apenas os valores dos itens filtrados.'
      : null,
  })
})
