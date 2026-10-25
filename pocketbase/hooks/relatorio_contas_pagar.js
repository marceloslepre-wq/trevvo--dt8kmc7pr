// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório: Contas a Pagar por Vencimento (Etapa 8 - Prompt 8.4)
 * Rota: POST /backend/v1/relatorios/contas-pagar
 *
 * Parâmetros no corpo:
 * {
 *   filtros: ObjetoFiltrosRelatorio
 * }
 *
 * Filtros suportados:
 * - empresas_ids: string[] (obrigatório, validação multiempresa)
 * - periodo: { dataInicio: string, dataFim: string } (máximo 366 dias)
 * - tipo_data: 'vencimento' | 'emissao' | 'competencia' (padrão 'vencimento')
 * - fornecedores_ids: string[]
 * - plano_contas_ids: string[]
 * - centros_custo_ids: string[]
 * - origens_titulo: string[]
 *
 * Regras:
 * - Somente títulos com status "Em aberto" ou "Pago parcial" (saldo > 0) e ativo = true
 * - Faixas de vencimento apuradas em relação à data de hoje (horário de Brasília):
 *   1. Vencidas há mais de 30 dias (< hoje - 30 dias)
 *   2. Vencidas até 30 dias (hoje - 30 dias até ontem)
 *   3. Vence hoje (hoje)
 *   4. Próximos 7 dias (amanhã até hoje + 7 dias)
 *   5. 8 a 30 dias (hoje + 8 até hoje + 30 dias)
 *   6. 31 a 60 dias (hoje + 31 até hoje + 60 dias)
 *   7. Acima de 60 dias (> hoje + 60 dias)
 * - Agregações:
 *   - Totais por faixa de vencimento (quantidade e saldo)
 *   - Totais por fornecedor (quantidade e saldo, ordenado por saldo decrescente)
 *   - Totais por conta do plano de contas (código, descrição, quantidade e saldo)
 *   - Lista analítica de títulos com fornecedor, documento, parcela, vencimento, emissão,
 *     competência, valor original, valor pago, saldo, origem, origem_id, link_nf_entrada, plano_conta, centro_custo.
 */

routerAdd('POST', '/backend/v1/relatorios/contas-pagar', (c) => {
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
      if (perfilRec && perfilRec.getBool('ativo')) {
        if (perfilRec.getBool('administrador')) {
          isAdmin = true
        } else {
          // Checar permissão financeiro_pagar
          const perms = $app.findRecordsByFilter(
            'permissoes',
            "perfil_id = '" + perfilRec.id + "' && modulo = 'financeiro_pagar'",
            '',
            1,
            0,
          )
          if (perms.length > 0 && perms[0].getBool('pode_ver')) {
            // tem permissão financeiro_pagar
          } else {
            return c.json(403, {
              sucesso: false,
              message:
                'Acesso negado: módulo Contas a Pagar (Financeiro) é obrigatório para este relatório.',
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

  // Helper para extrair data ISO (YYYY-MM-DD) no fuso de Brasília (UTC-3)
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

  function somarDias(dataIsoStr, numDias) {
    const dt = new Date(dataIsoStr + 'T12:00:00Z')
    dt.setUTCDate(dt.getUTCDate() + numDias)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }

  function calcularDiferencaDias(dataRefIso, dataVencIso) {
    // diferença = dataVenc - dataRef
    const d1 = new Date(dataRefIso + 'T00:00:00Z').getTime()
    const d2 = new Date(dataVencIso + 'T00:00:00Z').getTime()
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
  }

  const hojeIso =
    extrairDataBrasilia(new Date().toISOString()) || new Date().toISOString().slice(0, 10)

  // Período
  const periodo = f.periodo && typeof f.periodo === 'object' ? f.periodo : {}
  const dataInicio = String(periodo.dataInicio || f.data_inicio || '').trim()
  const dataFim = String(periodo.dataFim || f.data_fim || '').trim()

  if (dataInicio && dataFim) {
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

  // Tipo de data usada para corte/filtro do período (padrão: vencimento)
  const tipoData = String(f.tipo_data || 'vencimento')
    .toLowerCase()
    .trim()
  const campoDataFiltro =
    tipoData === 'emissao'
      ? 'data_emissao'
      : tipoData === 'competencia'
        ? 'data_competencia'
        : 'data_vencimento'

  // Filtros complementares do 8.0b
  const fornecedoresIds = Array.isArray(f.fornecedores_ids)
    ? f.fornecedores_ids.map(String).filter(Boolean)
    : []
  const planoContasIds = Array.isArray(f.plano_contas_ids)
    ? f.plano_contas_ids.map(String).filter(Boolean)
    : []
  const centrosCustoIds = Array.isArray(f.centros_custo_ids)
    ? f.centros_custo_ids.map(String).filter(Boolean)
    : []
  const origensTitulo = Array.isArray(f.origens_titulo)
    ? f.origens_titulo.map(String).filter(Boolean)
    : []

  // Carregar dados de Fornecedores, Plano de Contas, Centros de Custo e Empresas para exibição
  const mapaFornecedores = new Map()
  try {
    const fnRecs = $app.findRecordsByFilter('fornecedores', '', 'razao_social', 10000, 0)
    for (let i = 0; i < fnRecs.length; i++) {
      const fn = fnRecs[i]
      mapaFornecedores.set(fn.id, {
        id: fn.id,
        razao_social: fn.getString('razao_social') || 'Fornecedor',
        nome_fantasia:
          fn.getString('nome_fantasia') || fn.getString('razao_social') || 'Fornecedor',
        cnpj_cpf: fn.getString('cpf_cnpj') || fn.getString('cnpj') || '',
      })
    }
  } catch (_) {}

  const mapaPlanoContas = new Map()
  try {
    const pcRecs = $app.findRecordsByFilter('plano_contas', '', 'codigo', 5000, 0)
    for (let i = 0; i < pcRecs.length; i++) {
      const pc = pcRecs[i]
      mapaPlanoContas.set(pc.id, {
        id: pc.id,
        codigo: pc.getString('codigo'),
        descricao: pc.getString('descricao'),
        tipo: pc.getString('tipo'),
      })
    }
  } catch (_) {}

  const mapaCentrosCusto = new Map()
  try {
    const ccRecs = $app.findRecordsByFilter('centros_custo', '', 'nome', 1000, 0)
    for (let i = 0; i < ccRecs.length; i++) {
      const cc = ccRecs[i]
      mapaCentrosCusto.set(cc.id, {
        id: cc.id,
        codigo: cc.getString('codigo'),
        nome: cc.getString('nome'),
      })
    }
  } catch (_) {}

  const mapaEmpresas = new Map()
  for (let e = 0; e < empresasIds.length; e++) {
    try {
      const empRec = $app.findRecordById('empresas', empresasIds[e])
      mapaEmpresas.set(empRec.id, {
        id: empRec.id,
        razao_social: empRec.getString('razao_social'),
        nome_fantasia: empRec.getString('nome_fantasia') || empRec.getString('razao_social'),
        cnpj: empRec.getString('cnpj'),
        codigo: empRec.getInt('codigo') || 0,
      })
    } catch (_) {}
  }

  // Buscar títulos a pagar em aberto / parcialmente pagos
  // status in ("Em aberto", "Pago parcial") && saldo > 0 && ativo = true
  const titulosFiltrados = []

  for (let eIdx = 0; eIdx < empresasIds.length; eIdx++) {
    const empId = empresasIds[eIdx]
    let baseFilter =
      "empresa_id = '" +
      empId +
      "' && ativo = true && saldo > 0 && (status = 'Em aberto' || status = 'Pago parcial')"

    if (dataInicio && dataFim) {
      baseFilter +=
        ' && ' +
        campoDataFiltro +
        " >= '" +
        dataInicio +
        "' && " +
        campoDataFiltro +
        " <= '" +
        dataFim +
        "'"
    }

    try {
      const titulosRecs = $app.findRecordsByFilter(
        'contas_pagar',
        baseFilter,
        'data_vencimento',
        20000,
        0,
      )

      for (let tIdx = 0; tIdx < titulosRecs.length; tIdx++) {
        const t = titulosRecs[tIdx]

        const fornecedorId = t.getString('fornecedor_id')
        if (fornecedoresIds.length > 0 && !fornecedoresIds.includes(fornecedorId)) {
          continue
        }

        const planoContaId = t.getString('plano_conta_id')
        if (planoContasIds.length > 0 && !planoContasIds.includes(planoContaId)) {
          continue
        }

        const centroCustoId = t.getString('centro_custo_id')
        if (
          centrosCustoIds.length > 0 &&
          (!centroCustoId || !centrosCustoIds.includes(centroCustoId))
        ) {
          continue
        }

        const origem = t.getString('origem') || 'Manual'
        if (origensTitulo.length > 0 && !origensTitulo.includes(origem)) {
          continue
        }

        const saldo = round2(t.getFloat('saldo'))
        if (saldo <= 0) continue

        const valorOriginal = round2(t.getFloat('valor_original'))
        const valorPago = round2(t.getFloat('valor_pago'))

        const dtVenc = t.getString('data_vencimento') || ''
        const dtEmissao = t.getString('data_emissao') || ''
        const dtCompetencia = t.getString('data_competencia') || ''

        const fnInfo = mapaFornecedores.get(fornecedorId) || {
          id: fornecedorId,
          razao_social: 'Fornecedor não identificado',
          nome_fantasia: 'Fornecedor não identificado',
          cnpj_cpf: '',
        }

        const pcInfo = mapaPlanoContas.get(planoContaId) || {
          id: planoContaId,
          codigo: '0',
          descricao: 'Não informado',
          tipo: 'Despesa',
        }

        const ccInfo = centroCustoId ? mapaCentrosCusto.get(centroCustoId) : null
        const empInfo = mapaEmpresas.get(empId) || { id: empId, nome_fantasia: 'Empresa ' + empId }

        const origemId = t.getString('origem_id') || ''
        const notaEntradaParcelaId = t.getString('nota_entrada_parcela_id') || ''

        // Link para a nota de entrada quando a origem for NF Entrada (ou NF_ENTRADA)
        // Nota fiscal pode ser referenciada por origem_id
        let linkNotaEntrada = null
        if ((origem === 'NF Entrada' || origem === 'NF_ENTRADA') && origemId) {
          linkNotaEntrada = '/compras/notas-entrada/' + origemId + '/conferencia'
        }

        // Determinar faixa de vencimento em relação a hoje
        // Faixas:
        // 1. vencidas_mais_30: diff < -30
        // 2. vencidas_ate_30: diff >= -30 && diff < 0
        // 3. vence_hoje: diff === 0
        // 4. proximos_7: diff >= 1 && diff <= 7
        // 5. de_8_a_30: diff >= 8 && diff <= 30
        // 6. de_31_a_60: diff >= 31 && diff <= 60
        // 7. acima_60: diff > 60
        const diffDias = calcularDiferencaDias(hojeIso, dtVenc)
        let faixaId = 'acima_60'
        let faixaNome = 'Acima de 60 dias'
        let faixaOrdem = 7
        let situacaoVencimento = 'A vencer' // 'Vencido', 'Vence hoje', 'A vencer'

        if (diffDias < -30) {
          faixaId = 'vencidas_mais_30'
          faixaNome = 'Vencidas há mais de 30 dias'
          faixaOrdem = 1
          situacaoVencimento = 'Vencido'
        } else if (diffDias < 0) {
          faixaId = 'vencidas_ate_30'
          faixaNome = 'Vencidas até 30 dias'
          faixaOrdem = 2
          situacaoVencimento = 'Vencido'
        } else if (diffDias === 0) {
          faixaId = 'vence_hoje'
          faixaNome = 'Vence hoje'
          faixaOrdem = 3
          situacaoVencimento = 'Vence hoje'
        } else if (diffDias <= 7) {
          faixaId = 'proximos_7'
          faixaNome = 'Próximos 7 dias'
          faixaOrdem = 4
          situacaoVencimento = 'A vencer'
        } else if (diffDias <= 30) {
          faixaId = 'de_8_a_30'
          faixaNome = '8 a 30 dias'
          faixaOrdem = 5
          situacaoVencimento = 'A vencer'
        } else if (diffDias <= 60) {
          faixaId = 'de_31_a_60'
          faixaNome = '31 a 60 dias'
          faixaOrdem = 6
          situacaoVencimento = 'A vencer'
        } else {
          faixaId = 'acima_60'
          faixaNome = 'Acima de 60 dias'
          faixaOrdem = 7
          situacaoVencimento = 'A vencer'
        }

        titulosFiltrados.push({
          id: t.id,
          empresa_id: empId,
          empresa_nome: empInfo.nome_fantasia || empInfo.razao_social,
          fornecedor_id: fornecedorId,
          fornecedor_nome: fnInfo.nome_fantasia || fnInfo.razao_social,
          fornecedor_razao_social: fnInfo.razao_social,
          fornecedor_cnpj_cpf: fnInfo.cnpj_cpf,
          numero_documento: t.getString('numero_documento') || '',
          parcela: t.getString('parcela') || '1/1',
          descricao: t.getString('descricao') || '',
          data_emissao: dtEmissao,
          data_competencia: dtCompetencia,
          data_vencimento: dtVenc,
          dias_vencimento: diffDias,
          faixa_id: faixaId,
          faixa_nome: faixaNome,
          faixa_ordem: faixaOrdem,
          situacao_vencimento: situacaoVencimento,
          plano_conta_id: planoContaId,
          plano_conta_codigo: pcInfo.codigo,
          plano_conta_descricao: pcInfo.descricao,
          centro_custo_id: centroCustoId || '',
          centro_custo_nome: ccInfo ? ccInfo.nome : '',
          valor_original: valorOriginal,
          valor_pago: valorPago,
          saldo: saldo,
          status: t.getString('status') || 'Em aberto',
          origem: origem,
          origem_id: origemId,
          nota_entrada_parcela_id: notaEntradaParcelaId,
          link_nota_entrada: linkNotaEntrada,
        })
      }
    } catch (errTit) {
      return c.json(500, {
        sucesso: false,
        message: 'Erro ao consultar contas_pagar: ' + errTit.message,
      })
    }
  }

  // Estruturar Faixas de Vencimento
  const FAIXAS_DEFINICAO = [
    { id: 'vencidas_mais_30', nome: 'Vencidas há mais de 30 dias', ordem: 1, cor: 'rose' },
    { id: 'vencidas_ate_30', nome: 'Vencidas até 30 dias', ordem: 2, cor: 'amber' },
    { id: 'vence_hoje', nome: 'Vence hoje', ordem: 3, cor: 'blue' },
    { id: 'proximos_7', nome: 'Próximos 7 dias', ordem: 4, cor: 'emerald' },
    { id: 'de_8_a_30', nome: '8 a 30 dias', ordem: 5, cor: 'slate' },
    { id: 'de_31_a_60', nome: '31 a 60 dias', ordem: 6, cor: 'slate' },
    { id: 'acima_60', nome: 'Acima de 60 dias', ordem: 7, cor: 'slate' },
  ]

  const mapaFaixas = new Map()
  for (let fx = 0; fx < FAIXAS_DEFINICAO.length; fx++) {
    const def = FAIXAS_DEFINICAO[fx]
    mapaFaixas.set(def.id, {
      id: def.id,
      nome: def.nome,
      ordem: def.ordem,
      cor: def.cor,
      quantidade_titulos: 0,
      saldo_total: 0,
      percentual_saldo: 0,
    })
  }

  let totalGeralSaldo = 0
  let totalGeralTitulos = titulosFiltrados.length
  let totalVencidoSaldo = 0
  let totalVencidoTitulos = 0
  let totalVenceHojeSaldo = 0
  let totalVenceHojeTitulos = 0
  let totalAVencerSaldo = 0
  let totalAVencerTitulos = 0

  // Agregações por Fornecedor e por Plano de Contas
  const mapaPorFornecedor = new Map()
  const mapaPorPlanoContas = new Map()

  for (let idx = 0; idx < titulosFiltrados.length; idx++) {
    const item = titulosFiltrados[idx]
    totalGeralSaldo = round2(totalGeralSaldo + item.saldo)

    // Faixas
    const fxObj = mapaFaixas.get(item.faixa_id)
    if (fxObj) {
      fxObj.quantidade_titulos += 1
      fxObj.saldo_total = round2(fxObj.saldo_total + item.saldo)
    }

    if (item.situacao_vencimento === 'Vencido') {
      totalVencidoSaldo = round2(totalVencidoSaldo + item.saldo)
      totalVencidoTitulos += 1
    } else if (item.situacao_vencimento === 'Vence hoje') {
      totalVenceHojeSaldo = round2(totalVenceHojeSaldo + item.saldo)
      totalVenceHojeTitulos += 1
    } else {
      totalAVencerSaldo = round2(totalAVencerSaldo + item.saldo)
      totalAVencerTitulos += 1
    }

    // Por Fornecedor
    if (!mapaPorFornecedor.has(item.fornecedor_id)) {
      mapaPorFornecedor.set(item.fornecedor_id, {
        fornecedor_id: item.fornecedor_id,
        fornecedor_nome: item.fornecedor_nome,
        fornecedor_razao_social: item.fornecedor_razao_social,
        fornecedor_cnpj_cpf: item.fornecedor_cnpj_cpf,
        quantidade_titulos: 0,
        saldo_total: 0,
        saldo_vencido: 0,
        saldo_vence_hoje: 0,
        saldo_a_vencer: 0,
        percentual: 0,
      })
    }
    const fnAgg = mapaPorFornecedor.get(item.fornecedor_id)
    fnAgg.quantidade_titulos += 1
    fnAgg.saldo_total = round2(fnAgg.saldo_total + item.saldo)
    if (item.situacao_vencimento === 'Vencido') {
      fnAgg.saldo_vencido = round2(fnAgg.saldo_vencido + item.saldo)
    } else if (item.situacao_vencimento === 'Vence hoje') {
      fnAgg.saldo_vence_hoje = round2(fnAgg.saldo_vence_hoje + item.saldo)
    } else {
      fnAgg.saldo_a_vencer = round2(fnAgg.saldo_a_vencer + item.saldo)
    }

    // Por Plano de Contas
    if (!mapaPorPlanoContas.has(item.plano_conta_id)) {
      mapaPorPlanoContas.set(item.plano_conta_id, {
        plano_conta_id: item.plano_conta_id,
        codigo: item.plano_conta_codigo,
        descricao: item.plano_conta_descricao,
        quantidade_titulos: 0,
        saldo_total: 0,
        percentual: 0,
      })
    }
    const pcAgg = mapaPorPlanoContas.get(item.plano_conta_id)
    pcAgg.quantidade_titulos += 1
    pcAgg.saldo_total = round2(pcAgg.saldo_total + item.saldo)
  }

  // Calcular percentuais
  const listaFaixas = Array.from(mapaFaixas.values())
  for (let fIdx = 0; fIdx < listaFaixas.length; fIdx++) {
    const fx = listaFaixas[fIdx]
    fx.percentual_saldo = totalGeralSaldo > 0 ? round2((fx.saldo_total / totalGeralSaldo) * 100) : 0
  }

  const listaFornecedores = Array.from(mapaPorFornecedor.values())
  for (let fnIdx = 0; fnIdx < listaFornecedores.length; fnIdx++) {
    const fn = listaFornecedores[fnIdx]
    fn.percentual = totalGeralSaldo > 0 ? round2((fn.saldo_total / totalGeralSaldo) * 100) : 0
  }
  // Ordenar fornecedores pelo saldo decrescente
  listaFornecedores.sort((a, b) => b.saldo_total - a.saldo_total)

  const listaPlanoContas = Array.from(mapaPorPlanoContas.values())
  for (let pcIdx = 0; pcIdx < listaPlanoContas.length; pcIdx++) {
    const pc = listaPlanoContas[pcIdx]
    pc.percentual = totalGeralSaldo > 0 ? round2((pc.saldo_total / totalGeralSaldo) * 100) : 0
  }
  // Ordenar plano de contas pelo código contábil
  listaPlanoContas.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))

  // Ordenar títulos por vencimento crescente
  titulosFiltrados.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))

  return c.json(200, {
    sucesso: true,
    metadados: {
      data_base: hojeIso,
      tipo_data: tipoData,
      campo_data_filtro: campoDataFiltro,
      periodo: {
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
      },
      empresas_ids: empresasIds,
    },
    totais: {
      saldo_total: totalGeralSaldo,
      quantidade_total: totalGeralTitulos,
      vencido_saldo: totalVencidoSaldo,
      vencido_quantidade: totalVencidoTitulos,
      vence_hoje_saldo: totalVenceHojeSaldo,
      vence_hoje_quantidade: totalVenceHojeTitulos,
      a_vencer_saldo: totalAVencerSaldo,
      a_vencer_quantidade: totalAVencerTitulos,
    },
    faixas_vencimento: listaFaixas,
    totais_por_fornecedor: listaFornecedores,
    totais_por_plano_contas: listaPlanoContas,
    titulos: titulosFiltrados,
  })
})
