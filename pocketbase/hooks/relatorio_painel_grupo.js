// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório: Painel do Grupo (Etapa 8 - Prompt 8.5)
 * Rota: POST /backend/v1/relatorios/painel-grupo
 *
 * Parâmetros no corpo:
 * {
 *   mes_referencia?: string // Formato 'YYYY-MM' (padrão mês corrente no fuso de Brasília)
 * }
 *
 * Retorna indicadores consolidados para CADA empresa que o usuário tem acesso e para o TOTAL do grupo:
 * - faturamento do mês até hoje (mês corrente, parcial), o mesmo período do mês anterior (dia 1 a dia N)
 *   e do mesmo mês do ano anterior (dia 1 a dia N)
 * - margem bruta (valor e %), ticket médio e quantidade de vendas (vendas status Finalizada, sem Cancelada,
 *   descontando devoluções, conforme regras da etapa)
 * - vendas para outros estados (% do faturamento) e as 5 UFs que mais compraram (UF do cliente ou destinatario_uf da nota;
 *   balcão sem cliente = UF da empresa emitente)
 * - estoque valorizado hoje e o valor parado há mais de 90 dias (reutilizando a lógica do 8.3 / estoque-gerencial)
 * - a receber e a pagar nos próximos 30 dias, vencidos a receber e vencidos a pagar (reutilizando lógica do 8.4)
 * - saldo das contas financeiras
 * - documentos fiscais rejeitados ou em processamento, e situação do SPED do mês anterior (não gerado, gerado com erros, gerado, entregue)
 * - série diária de faturamento do mês por empresa (dia 1 até hoje/dia final do mês)
 * - série mensal dos últimos 12 meses por empresa
 */

routerAdd('POST', '/backend/v1/relatorios/painel-grupo', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  const auth = authRecord
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
  }

  // 1. Identificar usuário e verificar se é admin
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
          // Checar permissão relatorios
          const perms = $app.findRecordsByFilter(
            'permissoes',
            "perfil_id = '" + perfilRec.id + "' && modulo = 'relatorios'",
            '',
            1,
            0,
          )
          if (perms.length > 0 && perms[0].getBool('pode_ver')) {
            // tem permissão relatorios
          } else {
            return c.json(403, {
              sucesso: false,
              message: 'Acesso negado: módulo Relatórios é obrigatório para o Painel do Grupo.',
            })
          }
        }
      }
    }
  } catch (_) {}

  // 2. Determinar as empresas que o usuário acessa (Etapa 9 Multi-tenant)
  if (!callerUser) {
    return c.json(403, { sucesso: false, message: 'Usuário não localizado no ERP.' })
  }
  const assinanteId = callerUser.getString('assinante_id')
  if (!assinanteId) {
    return c.json(403, { sucesso: false, message: 'Usuário não vinculado a um assinante.' })
  }

  const empsAcessiveis = empresasDoUsuario(auth)
  const empresasIdsPermitidas = empsAcessiveis.map((e) => e.id)

  if (empresasIdsPermitidas.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Nenhuma empresa ativa disponível para o usuário.',
    })
  }

  // 3. Helpers de data e arredondamento
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

  const hojeIso =
    extrairDataBrasilia(new Date().toISOString()) || new Date().toISOString().slice(0, 10)
  const [hojeAnoStr, hojeMesStr, hojeDiaStr] = hojeIso.split('-')
  const hojeAno = parseInt(hojeAnoStr, 10)
  const hojeMes = parseInt(hojeMesStr, 10)
  const hojeDia = parseInt(hojeDiaStr, 10)

  // Mes de referência do payload ou mês corrente
  const body = c.requestInfo().body || {}

  // Se o frontend/caller passar empresa_id (filtro por empresa específica), valida com exigirEmpresaDoUsuario
  const empresaIdParam = (body.empresa_id || c.requestInfo().query['empresa_id'] || '').trim()
  if (empresaIdParam) {
    try {
      exigirEmpresaDoUsuario(auth, empresaIdParam)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message:
          errEmp && errEmp.message ? errEmp.message : 'Acesso negado à empresa especificada.',
      })
    }
  }

  let mesRefStr = String(body.mes_referencia || '').trim()
  if (!/^\d{4}-\d{2}$/.test(mesRefStr)) {
    mesRefStr = hojeAnoStr + '-' + hojeMesStr
  }
  const [refAnoStr, refMesStr] = mesRefStr.split('-')
  const refAno = parseInt(refAnoStr, 10)
  const refMes = parseInt(refMesStr, 10)

  // Último dia do mês de referência
  const ultimoDiaMesRef = new Date(Date.UTC(refAno, refMes, 0)).getUTCDate()

  // Se o mês de referência for o mês corrente, o período vai do dia 1 até o dia de hoje (parcial N)
  // Se for mês passado, vai do dia 1 ao último dia do mês (ou até hojeDia se especificado)
  const ehMesAtual = refAno === hojeAno && refMes === hojeMes
  const diaCorte = ehMesAtual ? Math.min(hojeDia, ultimoDiaMesRef) : ultimoDiaMesRef

  const diaCorteStr = String(diaCorte).padStart(2, '0')

  // Intervalo do mês de referência: dia 1 a dia N
  const periodoAtualIni = mesRefStr + '-01'
  const periodoAtualFim = mesRefStr + '-' + diaCorteStr

  // Intervalo do mês anterior: mesmo dia 1 a dia N (ou último dia do mês anterior se menor)
  let mesAntAno = refAno
  let mesAntMes = refMes - 1
  if (mesAntMes < 1) {
    mesAntMes = 12
    mesAntAno -= 1
  }
  const mesAntStr = String(mesAntAno) + '-' + String(mesAntMes).padStart(2, '0')
  const ultimoDiaMesAnt = new Date(Date.UTC(mesAntAno, mesAntMes, 0)).getUTCDate()
  const diaCorteAnt = Math.min(diaCorte, ultimoDiaMesAnt)
  const periodoAntIni = mesAntStr + '-01'
  const periodoAntFim = mesAntStr + '-' + String(diaCorteAnt).padStart(2, '0')

  // Intervalo do mesmo mês do ano anterior: mesmo dia 1 a dia N
  const anoAntAno = refAno - 1
  const anoAntStr = String(anoAntAno) + '-' + refMesStr
  const ultimoDiaAnoAnt = new Date(Date.UTC(anoAntAno, refMes, 0)).getUTCDate()
  const diaCorteAnoAnt = Math.min(diaCorte, ultimoDiaAnoAnt)
  const periodoAnoAntIni = anoAntStr + '-01'
  const periodoAnoAntFim = anoAntStr + '-' + String(diaCorteAnoAnt).padStart(2, '0')

  // Data limite para próximos 30 dias (contas a receber / pagar)
  function somarDias(dataIsoStr, numDias) {
    const dt = new Date(dataIsoStr + 'T12:00:00Z')
    dt.setUTCDate(dt.getUTCDate() + numDias)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }
  const proximos30DiasIso = somarDias(hojeIso, 30)

  // 4. Mapear informações cadastrais das empresas
  const mapaEmpresas = new Map()
  for (let e = 0; e < empresasIdsPermitidas.length; e++) {
    const eId = empresasIdsPermitidas[e]
    try {
      const empRec = $app.findRecordById('empresas', eId)
      mapaEmpresas.set(eId, {
        id: empRec.id,
        codigo: empRec.getInt('codigo') || 0,
        razao_social: empRec.getString('razao_social'),
        nome_fantasia: empRec.getString('nome_fantasia') || empRec.getString('razao_social'),
        cnpj: empRec.getString('cnpj'),
        uf: (empRec.getString('uf') || 'ES').trim().toUpperCase(),
        obrigado_efd_icms_ipi: empRec.getBool('obrigado_efd_icms_ipi'),
      })
    } catch (_) {}
  }

  // 5. Carregar Clientes para mapa de UF (Prompt 8.2)
  const mapaClientes = new Map()
  try {
    const clRecs = $app.findRecordsByFilter('clientes', 'ativo = true', '', 10000, 0)
    for (let c = 0; c < clRecs.length; c++) {
      const cl = clRecs[c]
      mapaClientes.set(cl.id, {
        uf: (cl.getString('uf') || '').trim().toUpperCase(),
      })
    }
  } catch (_) {}

  // 6. Estrutura de dados por empresa e total grupo
  function criarEstruturaIndicadores(
    empresaId,
    empresaNome,
    empresaUf,
    empresaCodigo,
    empresaCnpj,
  ) {
    return {
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      empresa_uf: empresaUf,
      empresa_codigo: empresaCodigo,
      empresa_cnpj: empresaCnpj,
      // Faturamento e comparativos do mês
      faturamento_mes_atual: 0,
      faturamento_mes_anterior: 0,
      faturamento_ano_anterior: 0,
      var_percentual_mes_anterior: 0,
      var_percentual_ano_anterior: 0,
      // Margem, ticket médio e vendas
      margem_bruta_valor: 0,
      margem_bruta_percentual: 0,
      custo_total_vendas: 0,
      quantidade_vendas: 0,
      ticket_medio: 0,
      // Vendas interestaduais e top 5 UFs
      vendas_outros_estados_valor: 0,
      vendas_outros_estados_percentual: 0,
      top_5_ufs: [], // [{ uf: 'SP', valor: 1200, percentual: 25.4 }]
      // Estoque
      estoque_valorizado: 0,
      estoque_parado_mais_90d_valor: 0,
      estoque_parado_mais_90d_qtd_itens: 0,
      // Financeiro: a receber / a pagar
      a_receber_proximos_30d: 0,
      a_receber_vencidos: 0,
      a_pagar_proximos_30d: 0,
      a_pagar_vencidos: 0,
      saldo_contas_financeiras: 0,
      // Fiscal
      documentos_fiscais_rejeitados: 0,
      documentos_fiscais_processando: 0,
      sped_mes_anterior_status: 'não se aplica', // 'não gerado' | 'gerado com erros' | 'gerado' | 'entregue' | 'não se aplica'
      sped_mes_anterior_periodo: mesAntStr,
    }
  }

  const dadosPorEmpresa = new Map()
  empresasIdsPermitidas.forEach((id) => {
    const emp = mapaEmpresas.get(id) || {
      id,
      nome_fantasia: 'Empresa ' + id,
      uf: 'ES',
      codigo: 0,
      cnpj: '',
    }
    dadosPorEmpresa.set(
      id,
      criarEstruturaIndicadores(id, emp.nome_fantasia, emp.uf, emp.codigo, emp.cnpj),
    )
  })

  // 7. Processar VENDAS nos três períodos
  // Vendas elegíveis: ativo = true && status = 'Finalizada' && empresa_id in (...)
  // Vendas de balcão sem cliente contam como UF da própria empresa emitente (regra 8.2)
  const empFiltersVendas = empresasIdsPermitidas
    .map((id) => "empresa_id = '" + id + "'")
    .join(' || ')
  const filterVendasBase = '(' + empFiltersVendas + ") && ativo = true && status = 'Finalizada'"

  let todasVendas = []
  try {
    todasVendas = $app.findRecordsByFilter('vendas', filterVendasBase, 'data_emissao', 30000, 0)
  } catch (errV) {
    console.warn('Erro ao carregar vendas:', errV)
  }

  // Docs fiscais autorizados vinculados às vendas no período atual (para obter destinatario_uf)
  const vendasMesAtualIds = []
  for (let i = 0; i < todasVendas.length; i++) {
    const v = todasVendas[i]
    const dtEmissao = v.getString('data_emissao') || v.getString('created')
    const dtIso = extrairDataBrasilia(dtEmissao)
    if (dtIso && dtIso >= periodoAtualIni && dtIso <= periodoAtualFim) {
      vendasMesAtualIds.push(v.id)
    }
  }

  const mapaDocsFiscaisUf = new Map()
  const loteTam = 50
  for (let l = 0; l < vendasMesAtualIds.length; l += loteTam) {
    const pedaco = vendasMesAtualIds.slice(l, l + loteTam)
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
        const destUf = docRec.getString('destinatario_uf')
        if (vId && destUf) {
          mapaDocsFiscaisUf.set(vId, destUf.trim().toUpperCase())
        }
      }
    } catch (_) {}
  }

  // Mapas de UF por empresa para o período atual: empresa_id -> Map<uf, totalValor>
  const mapaUfsPorEmpresa = new Map()
  const mapaUfsGrupo = new Map()
  empresasIdsPermitidas.forEach((id) => mapaUfsPorEmpresa.set(id, new Map()))

  // Série diária do mês atual: diaIso -> { [empresa_id]: valor, total: valor }
  // Dia 1 até diaCorte
  const serieDiariaMapa = new Map()
  for (let d = 1; d <= diaCorte; d++) {
    const diaNumStr = String(d).padStart(2, '0')
    const diaIsoKey = mesRefStr + '-' + diaNumStr
    const objDia = { dia: diaIsoKey, rotulo: diaNumStr + '/' + refMesStr }
    empresasIdsPermitidas.forEach((id) => {
      objDia[id] = 0
    })
    objDia.total = 0
    serieDiariaMapa.set(diaIsoKey, objDia)
  }

  // Série mensal dos últimos 12 meses: ano-mes -> { [empresa_id]: valor, total: valor }
  // 12 meses anteriores a partir de mesRefStr
  const lista12Meses = []
  let cursorAno = refAno
  let cursorMes = refMes
  for (let m = 0; m < 12; m++) {
    const ymStr = String(cursorAno) + '-' + String(cursorMes).padStart(2, '0')
    lista12Meses.unshift(ymStr)
    cursorMes -= 1
    if (cursorMes < 1) {
      cursorMes = 12
      cursorAno -= 1
    }
  }

  const serie12MesesMapa = new Map()
  lista12Meses.forEach((ym) => {
    const [ano, mes] = ym.split('-')
    const rotuloMes = mes + '/' + ano.slice(2)
    const objMes = { mes: ym, rotulo: rotuloMes }
    empresasIdsPermitidas.forEach((id) => {
      objMes[id] = 0
    })
    objMes.total = 0
    serie12MesesMapa.set(ym, objMes)
  })

  // Iterar pelas vendas para acumular métricas
  for (let i = 0; i < todasVendas.length; i++) {
    const v = todasVendas[i]
    const empId = v.getString('empresa_id')
    const stEmp = dadosPorEmpresa.get(empId)
    if (!stEmp) continue

    const tipo = v.getString('tipo')
    if (tipo === 'Orçamento') continue

    const dtEmissao = v.getString('data_emissao') || v.getString('created')
    const dtIso = extrairDataBrasilia(dtEmissao)
    if (!dtIso) continue

    const valorTotal = v.getFloat('valor_total') || 0
    const custoTotalVenda = v.getFloat('custo_total') || 0
    const mesVendaStr = dtIso.slice(0, 7)

    // Acumular série dos últimos 12 meses (vendas líquidas = vendas normais - devoluções)
    if (serie12MesesMapa.has(mesVendaStr)) {
      const entryMes = serie12MesesMapa.get(mesVendaStr)
      const sinal = tipo === 'Devolução' ? -1 : 1
      entryMes[empId] = round2((entryMes[empId] || 0) + sinal * valorTotal)
      entryMes.total = round2(entryMes.total + sinal * valorTotal)
    }

    // 1. Período Atual (dia 1 a dia N do mês de referência)
    if (dtIso >= periodoAtualIni && dtIso <= periodoAtualFim) {
      if (tipo === 'Devolução') {
        stEmp.faturamento_mes_atual = round2(stEmp.faturamento_mes_atual - valorTotal)
        stEmp.custo_total_vendas = round2(stEmp.custo_total_vendas - custoTotalVenda)
        // Ajustar na série diária
        if (serieDiariaMapa.has(dtIso)) {
          const entryDia = serieDiariaMapa.get(dtIso)
          entryDia[empId] = round2((entryDia[empId] || 0) - valorTotal)
          entryDia.total = round2(entryDia.total - valorTotal)
        }
      } else {
        stEmp.faturamento_mes_atual = round2(stEmp.faturamento_mes_atual + valorTotal)
        stEmp.custo_total_vendas = round2(stEmp.custo_total_vendas + custoTotalVenda)
        stEmp.quantidade_vendas += 1

        // Adicionar na série diária
        if (serieDiariaMapa.has(dtIso)) {
          const entryDia = serieDiariaMapa.get(dtIso)
          entryDia[empId] = round2((entryDia[empId] || 0) + valorTotal)
          entryDia.total = round2(entryDia.total + valorTotal)
        }

        // Determinar UF da venda (Regra 8.2 e 8.5)
        let ufDestino = mapaDocsFiscaisUf.get(v.id) || ''
        if (!ufDestino) {
          const clId = v.getString('cliente_id')
          const clInfo = clId ? mapaClientes.get(clId) : null
          if (clInfo && clInfo.uf) ufDestino = clInfo.uf
        }
        if (!ufDestino) {
          const empInfo = mapaEmpresas.get(empId)
          ufDestino = empInfo && empInfo.uf ? empInfo.uf : 'ES'
        }

        // Acumular por UF para a empresa
        const ufsEmp = mapaUfsPorEmpresa.get(empId)
        ufsEmp.set(ufDestino, (ufsEmp.get(ufDestino) || 0) + valorTotal)

        // Acumular por UF para o grupo
        mapaUfsGrupo.set(ufDestino, (mapaUfsGrupo.get(ufDestino) || 0) + valorTotal)

        // Vendas interestaduais: UF de destino diferente da UF da empresa
        const empUfPropria = (stEmp.empresa_uf || 'ES').trim().toUpperCase()
        if (ufDestino !== empUfPropria) {
          stEmp.vendas_outros_estados_valor = round2(stEmp.vendas_outros_estados_valor + valorTotal)
        }
      }
    }

    // 2. Período do Mês Anterior (dia 1 a dia N)
    if (dtIso >= periodoAntIni && dtIso <= periodoAntFim) {
      if (tipo === 'Devolução') {
        stEmp.faturamento_mes_anterior = round2(stEmp.faturamento_mes_anterior - valorTotal)
      } else {
        stEmp.faturamento_mes_anterior = round2(stEmp.faturamento_mes_anterior + valorTotal)
      }
    }

    // 3. Período do Mesmo Mês do Ano Anterior (dia 1 a dia N)
    if (dtIso >= periodoAnoAntIni && dtIso <= periodoAnoAntFim) {
      if (tipo === 'Devolução') {
        stEmp.faturamento_ano_anterior = round2(stEmp.faturamento_ano_anterior - valorTotal)
      } else {
        stEmp.faturamento_ano_anterior = round2(stEmp.faturamento_ano_anterior + valorTotal)
      }
    }
  }

  // Ajustar se faturamentos líquidos ficarem negativos
  dadosPorEmpresa.forEach((st) => {
    if (st.faturamento_mes_atual < 0) st.faturamento_mes_atual = 0
    if (st.faturamento_mes_anterior < 0) st.faturamento_mes_anterior = 0
    if (st.faturamento_ano_anterior < 0) st.faturamento_ano_anterior = 0

    // Variações percentuais
    if (st.faturamento_mes_anterior > 0) {
      st.var_percentual_mes_anterior = round2(
        ((st.faturamento_mes_atual - st.faturamento_mes_anterior) / st.faturamento_mes_anterior) *
          100,
      )
    }
    if (st.faturamento_ano_anterior > 0) {
      st.var_percentual_ano_anterior = round2(
        ((st.faturamento_mes_atual - st.faturamento_ano_anterior) / st.faturamento_ano_anterior) *
          100,
      )
    }

    // Margem bruta e ticket médio
    st.margem_bruta_valor = round2(st.faturamento_mes_atual - st.custo_total_vendas)
    if (st.faturamento_mes_atual > 0) {
      st.margem_bruta_percentual = round2((st.margem_bruta_valor / st.faturamento_mes_atual) * 100)
      st.vendas_outros_estados_percentual = round2(
        (st.vendas_outros_estados_valor / st.faturamento_mes_atual) * 100,
      )
    }
    if (st.quantidade_vendas > 0) {
      st.ticket_medio = round2(st.faturamento_mes_atual / st.quantidade_vendas)
    }

    // Top 5 UFs da empresa
    const ufsEmpMap = mapaUfsPorEmpresa.get(st.empresa_id)
    if (ufsEmpMap) {
      const ufsArray = Array.from(ufsEmpMap.entries())
        .map(([uf, valor]) => ({
          uf,
          valor: round2(valor),
          percentual:
            st.faturamento_mes_atual > 0 ? round2((valor / st.faturamento_mes_atual) * 100) : 0,
        }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5)
      st.top_5_ufs = ufsArray
    }
  })

  // 8. ESTOQUE HOJE E PARADO HÁ MAIS DE 90 DIAS (Reutiliza lógica do 8.3 / estoque-gerencial)
  // Data base hoje: saldo direto de estoque_saldos
  // Critério de parado: quantidade > 0 e (sem data_ultima_saida ou data_ultima_saida <= hoje - 90 dias)
  const dt90DiasAtrasIso = somarDias(hojeIso, -90)

  for (let e = 0; e < empresasIdsPermitidas.length; e++) {
    const empId = empresasIdsPermitidas[e]
    const stEmp = dadosPorEmpresa.get(empId)
    if (!stEmp) continue

    try {
      const saldosRecs = $app.findRecordsByFilter(
        'estoque_saldos',
        "empresa_id = '" + empId + "' && ativo = true && quantidade > 0",
        '',
        20000,
        0,
      )

      let totalEstoqueValor = 0
      let totalParadoValor = 0
      let qtdItensParados = 0

      for (let s = 0; s < saldosRecs.length; s++) {
        const itemSaldo = saldosRecs[s]
        const qtd = itemSaldo.getFloat('quantidade') || 0
        const custoMedio = itemSaldo.getFloat('custo_medio') || 0
        const valTot = itemSaldo.getFloat('valor_total') || qtd * custoMedio
        totalEstoqueValor += valTot

        const dtSaida = itemSaldo.getString('data_ultima_saida') || ''
        const dtSaidaIso = extrairDataBrasilia(dtSaida)
        // Parado: sem saída registrada ou última saída há mais de 90 dias
        if (!dtSaidaIso || dtSaidaIso <= dt90DiasAtrasIso) {
          totalParadoValor += valTot
          qtdItensParados += 1
        }
      }

      stEmp.estoque_valorizado = round2(totalEstoqueValor)
      stEmp.estoque_parado_mais_90d_valor = round2(totalParadoValor)
      stEmp.estoque_parado_mais_90d_qtd_itens = qtdItensParados
    } catch (errEstoque) {
      console.warn('Erro ao calcular estoque no painel do grupo:', errEstoque)
    }
  }

  // 9. CONTAS A RECEBER E CONTAS A PAGAR (Reutiliza lógica do 8.4 e painel)
  // Contas a Receber: status in ('Aberto', 'Parcial') && ativo = true
  // - Próximos 30 dias: data_vencimento >= hojeIso && data_vencimento <= proximos30DiasIso
  // - Vencidos: data_vencimento < hojeIso
  for (let e = 0; e < empresasIdsPermitidas.length; e++) {
    const empId = empresasIdsPermitidas[e]
    const stEmp = dadosPorEmpresa.get(empId)
    if (!stEmp) continue

    // Contas a Receber
    try {
      const recTitulos = $app.findRecordsByFilter(
        'contas_receber',
        "empresa_id = '" + empId + "' && ativo = true && (status = 'Aberto' || status = 'Parcial')",
        'data_vencimento',
        15000,
        0,
      )

      for (let r = 0; r < recTitulos.length; r++) {
        const tit = recTitulos[r]
        const sld = tit.getFloat('saldo') || tit.getFloat('valor_original') || 0
        const dtVenc = tit.getString('data_vencimento') || ''
        const dtVencIso = extrairDataBrasilia(dtVenc)
        if (!dtVencIso) continue

        if (dtVencIso < hojeIso) {
          stEmp.a_receber_vencidos = round2(stEmp.a_receber_vencidos + sld)
        } else if (dtVencIso >= hojeIso && dtVencIso <= proximos30DiasIso) {
          stEmp.a_receber_proximos_30d = round2(stEmp.a_receber_proximos_30d + sld)
        }
      }
    } catch (errRec) {
      console.warn('Erro ao carregar contas a receber:', errRec)
    }

    // Contas a Pagar: status in ('Em aberto', 'Pago parcial') && ativo = true
    // - Próximos 30 dias: data_vencimento >= hojeIso && data_vencimento <= proximos30DiasIso
    // - Vencidos: data_vencimento < hojeIso
    try {
      const pagTitulos = $app.findRecordsByFilter(
        'contas_pagar',
        "empresa_id = '" +
          empId +
          "' && ativo = true && (status = 'Em aberto' || status = 'Pago parcial')",
        'data_vencimento',
        15000,
        0,
      )

      for (let p = 0; p < pagTitulos.length; p++) {
        const tit = pagTitulos[p]
        const sld = tit.getFloat('saldo') || tit.getFloat('valor_original') || 0
        const dtVenc = tit.getString('data_vencimento') || ''
        const dtVencIso = extrairDataBrasilia(dtVenc)
        if (!dtVencIso) continue

        if (dtVencIso < hojeIso) {
          stEmp.a_pagar_vencidos = round2(stEmp.a_pagar_vencidos + sld)
        } else if (dtVencIso >= hojeIso && dtVencIso <= proximos30DiasIso) {
          stEmp.a_pagar_proximos_30d = round2(stEmp.a_pagar_proximos_30d + sld)
        }
      }
    } catch (errPag) {
      console.warn('Erro ao carregar contas a pagar:', errPag)
    }

    // Saldo das contas financeiras da empresa
    try {
      const contasFin = $app.findRecordsByFilter(
        'contas_financeiras',
        "empresa_id = '" + empId + "' && ativo = true",
        '',
        1000,
        0,
      )
      let sldTotalContas = 0
      for (let c = 0; c < contasFin.length; c++) {
        sldTotalContas += contasFin[c].getFloat('saldo_atual') || 0
      }
      stEmp.saldo_contas_financeiras = round2(sldTotalContas)
    } catch (errContas) {
      console.warn('Erro ao carregar contas financeiras:', errContas)
    }

    // Documentos fiscais rejeitados ou em processamento
    try {
      const docsRej = $app.findRecordsByFilter(
        'documentos_fiscais',
        "empresa_id = '" + empId + "' && status = 'Rejeitada'",
        '',
        1000,
        0,
      )
      stEmp.documentos_fiscais_rejeitados = docsRej.length

      const docsProc = $app.findRecordsByFilter(
        'documentos_fiscais',
        "empresa_id = '" + empId + "' && status = 'Processando'",
        '',
        1000,
        0,
      )
      stEmp.documentos_fiscais_processando = docsProc.length
    } catch (errDocs) {
      console.warn('Erro ao carregar documentos fiscais:', errDocs)
    }

    // SPED do mês anterior (Prompt 7.6b e card fiscal do /painel)
    const empInfo = mapaEmpresas.get(empId)
    if (empInfo && empInfo.obrigado_efd_icms_ipi) {
      try {
        const spedRecs = $app.findRecordsByFilter(
          'sped_arquivos',
          "empresa_id = '" + empId + "' && modo = 'Oficial' && periodo = '" + mesAntStr + "'",
          '-created',
          1,
          0,
        )

        if (spedRecs.length === 0) {
          stEmp.sped_mes_anterior_status = 'não gerado'
        } else {
          const stReg = spedRecs[0].getString('status')
          if (stReg === 'Entregue') {
            stEmp.sped_mes_anterior_status = 'entregue'
          } else if (stReg === 'Gerado com erros') {
            stEmp.sped_mes_anterior_status = 'gerado com erros'
          } else if (stReg === 'Gerado') {
            stEmp.sped_mes_anterior_status = 'gerado'
          } else {
            stEmp.sped_mes_anterior_status = 'não gerado'
          }
        }
      } catch (errSped) {
        console.warn('Erro ao consultar status SPED:', errSped)
        stEmp.sped_mes_anterior_status = 'não gerado'
      }
    } else {
      stEmp.sped_mes_anterior_status = 'não se aplica'
    }
  }

  // 10. CONSOLIDAÇÃO DO GRUPO (TOTAL)
  const totalGrupo = criarEstruturaIndicadores('grupo_total', 'Total do Grupo', 'BR', 0, '')

  let somaFatAtual = 0
  let somaFatAnt = 0
  let somaFatAnoAnt = 0
  let somaMargemValor = 0
  let somaCustoVendas = 0
  let somaQtdVendas = 0
  let somaOutrosEstadosValor = 0
  let somaEstoqueValor = 0
  let somaEstoqueParadoValor = 0
  let somaEstoqueParadoQtd = 0
  let somaReceber30d = 0
  let somaReceberVenc = 0
  let somaPagar30d = 0
  let somaPagarVenc = 0
  let somaSaldoContas = 0
  let somaDocsRej = 0
  let somaDocsProc = 0

  const listaPorEmpresa = []
  dadosPorEmpresa.forEach((st) => {
    listaPorEmpresa.push(st)
    somaFatAtual += st.faturamento_mes_atual
    somaFatAnt += st.faturamento_mes_anterior
    somaFatAnoAnt += st.faturamento_ano_anterior
    somaMargemValor += st.margem_bruta_valor
    somaCustoVendas += st.custo_total_vendas
    somaQtdVendas += st.quantidade_vendas
    somaOutrosEstadosValor += st.vendas_outros_estados_valor
    somaEstoqueValor += st.estoque_valorizado
    somaEstoqueParadoValor += st.estoque_parado_mais_90d_valor
    somaEstoqueParadoQtd += st.estoque_parado_mais_90d_qtd_itens
    somaReceber30d += st.a_receber_proximos_30d
    somaReceberVenc += st.a_receber_vencidos
    somaPagar30d += st.a_pagar_proximos_30d
    somaPagarVenc += st.a_pagar_vencidos
    somaSaldoContas += st.saldo_contas_financeiras
    somaDocsRej += st.documentos_fiscais_rejeitados
    somaDocsProc += st.documentos_fiscais_processando
  })

  // Ordenar lista por código ou nome da empresa
  listaPorEmpresa.sort((a, b) => (a.empresa_codigo || 0) - (b.empresa_codigo || 0))

  totalGrupo.faturamento_mes_atual = round2(somaFatAtual)
  totalGrupo.faturamento_mes_anterior = round2(somaFatAnt)
  totalGrupo.faturamento_ano_anterior = round2(somaFatAnoAnt)

  if (somaFatAnt > 0) {
    totalGrupo.var_percentual_mes_anterior = round2(
      ((somaFatAtual - somaFatAnt) / somaFatAnt) * 100,
    )
  }
  if (somaFatAnoAnt > 0) {
    totalGrupo.var_percentual_ano_anterior = round2(
      ((somaFatAtual - somaFatAnoAnt) / somaFatAnoAnt) * 100,
    )
  }

  totalGrupo.margem_bruta_valor = round2(somaMargemValor)
  totalGrupo.custo_total_vendas = round2(somaCustoVendas)
  if (somaFatAtual > 0) {
    totalGrupo.margem_bruta_percentual = round2((somaMargemValor / somaFatAtual) * 100)
    totalGrupo.vendas_outros_estados_percentual = round2(
      (somaOutrosEstadosValor / somaFatAtual) * 100,
    )
  }

  totalGrupo.quantidade_vendas = somaQtdVendas
  if (somaQtdVendas > 0) {
    totalGrupo.ticket_medio = round2(somaFatAtual / somaQtdVendas)
  }

  totalGrupo.vendas_outros_estados_valor = round2(somaOutrosEstadosValor)
  totalGrupo.estoque_valorizado = round2(somaEstoqueValor)
  totalGrupo.estoque_parado_mais_90d_valor = round2(somaEstoqueParadoValor)
  totalGrupo.estoque_parado_mais_90d_qtd_itens = somaEstoqueParadoQtd
  totalGrupo.a_receber_proximos_30d = round2(somaReceber30d)
  totalGrupo.a_receber_vencidos = round2(somaReceberVenc)
  totalGrupo.a_pagar_proximos_30d = round2(somaPagar30d)
  totalGrupo.a_pagar_vencidos = round2(somaPagarVenc)
  totalGrupo.saldo_contas_financeiras = round2(somaSaldoContas)
  totalGrupo.documentos_fiscais_rejeitados = somaDocsRej
  totalGrupo.documentos_fiscais_processando = somaDocsProc

  // Top 5 UFs do grupo
  const topUfsGrupo = Array.from(mapaUfsGrupo.entries())
    .map(([uf, valor]) => ({
      uf,
      valor: round2(valor),
      percentual: somaFatAtual > 0 ? round2((valor / somaFatAtual) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
  totalGrupo.top_5_ufs = topUfsGrupo

  // Situação do SPED do mês anterior do grupo:
  // Se alguma empresa obrigada tiver "não gerado" -> "não gerado"
  // Se tiver "gerado com erros" -> "gerado com erros"
  // Se todas entregues -> "entregue"
  // Se todas geradas -> "gerado"
  const statusObrigadas = listaPorEmpresa
    .map((e) => e.sped_mes_anterior_status)
    .filter((st) => st !== 'não se aplica')

  if (statusObrigadas.length === 0) {
    totalGrupo.sped_mes_anterior_status = 'não se aplica'
  } else if (statusObrigadas.includes('não gerado')) {
    totalGrupo.sped_mes_anterior_status = 'não gerado'
  } else if (statusObrigadas.includes('gerado com erros')) {
    totalGrupo.sped_mes_anterior_status = 'gerado com erros'
  } else if (statusObrigadas.every((st) => st === 'entregue')) {
    totalGrupo.sped_mes_anterior_status = 'entregue'
  } else {
    totalGrupo.sped_mes_anterior_status = 'gerado'
  }

  // Converter séries para listas ordenadas
  const graficoFaturamentoDiario = Array.from(serieDiariaMapa.values())
  const graficoFaturamento12Meses = Array.from(serie12MesesMapa.values())

  return c.json(200, {
    sucesso: true,
    metadados: {
      mes_referencia: mesRefStr,
      periodo_atual: {
        inicio: periodoAtualIni,
        fim: periodoAtualFim,
        dia_corte: diaCorte,
      },
      periodo_mes_anterior: {
        inicio: periodoAntIni,
        fim: periodoAntFim,
        dia_corte: diaCorteAnt,
      },
      periodo_ano_anterior: {
        inicio: periodoAnoAntIni,
        fim: periodoAnoAntFim,
        dia_corte: diaCorteAnoAnt,
      },
      total_empresas_acesso: empresasIdsPermitidas.length,
      data_geracao: hojeIso,
    },
    total_grupo: totalGrupo,
    por_empresa: listaPorEmpresa,
    graficos: {
      diario_mes: graficoFaturamentoDiario,
      ultimos_12_meses: graficoFaturamento12Meses,
    },
  })
})
