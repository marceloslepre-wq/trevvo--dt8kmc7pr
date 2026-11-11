// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Endpoint de Relatório Fiscal: Livro de Registro de Saídas (Etapa 8 - Prompt 8.1)
 * Rota: POST /backend/v1/relatorios/livro-saidas
 *
 * Parâmetros recebidos:
 * {
 *   empresaId: string,
 *   dataInicio: string (YYYY-MM-DD),
 *   dataFim: string (YYYY-MM-DD),
 *   incluirTeste?: boolean,
 *   filtros?: {
 *     modelo?: '55' | '65' | 'todos',
 *     cfop?: string,
 *     cst?: string,
 *     situacao?: string,
 *     ufDestino?: string,
 *     clienteId?: string
 *   }
 * }
 */

routerAdd('POST', '/backend/v1/relatorios/livro-saidas', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Autenticação necessária.' })
  }

  // Tenancy local (sem require — o JSVM não suporta require dentro de callbacks).
  // Réplica da semântica de exigirEmpresaDoUsuario/empresasDoUsuario de tenancy.js.
  function tenancyEmpresasDoUsuarioLocal(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
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

    // Master lido no banco (nunca confiar em campo do login)
    let ehMaster = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      ehMaster = !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {}

    // Master em modo suporte (impersonação) usa o assinante do cliente atendido
    if (ehMaster) {
      try {
        if ($app.hasTable('master_impersonacoes')) {
          const recs = $app.findRecordsByFilter(
            'master_impersonacoes',
            "user_id = '" + auth.id + "'",
            '-created',
            1,
            0,
          )
          if (recs && recs.length > 0 && recs[0].getString('assinante_id')) {
            assinanteId = recs[0].getString('assinante_id')
          }
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

    const permitidas = []
    if (isAdmin || ehMaster) {
      // Administrador do assinante (ou Master): todas as empresas ativas do próprio assinante
      try {
        const emps = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        for (let i = 0; i < emps.length; i++) {
          permitidas.push(emps[i])
        }
      } catch (_) {}
    } else {
      const ids = new Set()
      const padraoId = usuarioRec.getString('empresa_padrao_id')
      if (padraoId) ids.add(padraoId)
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
          if (eId) ids.add(eId)
        }
      } catch (_) {}
      ids.forEach((eId) => {
        try {
          const emp = $app.findRecordById('empresas', eId)
          if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
            permitidas.push(emp)
          }
        } catch (_) {}
      })
    }
    return permitidas
  }

  function exigirEmpresaDoUsuarioLocal(auth, empresaIdAlvo) {
    if (!empresaIdAlvo) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = tenancyEmpresasDoUsuarioLocal(auth)
    for (let i = 0; i < permitidas.length; i++) {
      if (permitidas[i].id === empresaIdAlvo) return permitidas[i]
    }
    throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
  }

  try {
    const body = c.requestInfo().body || {}
    const empresaId = String(body.empresaId || body.empresa_id || '').trim()
    const dataInicio = String(body.dataInicio || body.data_inicio || '').trim()
    const dataFim = String(body.dataFim || body.data_fim || '').trim()
    const incluirTeste = Boolean(body.incluirTeste || body.incluir_teste)
    const filtrosAdicionais = body.filtros || {}

    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'Empresa não informada.' })
    }
    if (!dataInicio || !dataFim) {
      return c.json(400, { sucesso: false, message: 'Período (data inicial e final) obrigatório.' })
    }

    // Validação de limite máximo de 366 dias
    const tIni = new Date(dataInicio + 'T00:00:00Z').getTime()
    const tFim = new Date(dataFim + 'T23:59:59Z').getTime()
    if (isNaN(tIni) || isNaN(tFim)) {
      return c.json(400, { sucesso: false, message: 'Formato de data inválido. Use AAAA-MM-DD.' })
    }
    if (tIni > tFim) {
      return c.json(400, {
        sucesso: false,
        message: 'Data inicial não pode ser superior à data final.',
      })
    }
    const diffDias = Math.ceil((tFim - tIni) / (1000 * 60 * 60 * 24))
    if (diffDias > 366) {
      return c.json(400, {
        sucesso: false,
        message: 'O período solicitado excede o limite máximo permitido de 366 dias.',
      })
    }

    // Conferência de acesso à empresa
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
            // Checar permissão notas_saida
            const perms = $app.findRecordsByFilter(
              'permissoes',
              "perfil_id = '" + perfilRec.id + "' && modulo = 'notas_saida'",
              '',
              1,
              0,
            )
            if (perms.length > 0 && perms[0].getBool('pode_ver')) {
              // tem permissão notas_saida
            } else {
              return c.json(403, {
                sucesso: false,
                message:
                  'Acesso negado: módulo Notas de Saída / Fiscal é obrigatório para este relatório.',
              })
            }
          }
        }
      }
    } catch (_) {}

    try {
      exigirEmpresaDoUsuarioLocal(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message:
          errEmp && errEmp.message
            ? errEmp.message
            : 'Acesso negado: você não tem permissão para consultar esta empresa.',
      })
    }

    // Dados da empresa
    let dadosEmpresa = {
      id: empresaId,
      razao_social: '',
      nome_fantasia: '',
      cnpj: '',
      uf: '',
      inscricao_estadual: '',
    }
    try {
      const empRec = $app.findRecordById('empresas', empresaId)
      dadosEmpresa = {
        id: empRec.id,
        razao_social: empRec.getString('razao_social'),
        nome_fantasia: empRec.getString('nome_fantasia'),
        cnpj: empRec.getString('cnpj'),
        uf: empRec.getString('uf'),
        inscricao_estadual: empRec.getString('inscricao_estadual'),
      }
    } catch (errEmp) {
      return c.json(404, { sucesso: false, message: 'Empresa não encontrada.' })
    }

    // Utilitário de horário de Brasília (UTC-3)
    function extrairDataBrasilia(dataStr) {
      if (!dataStr) return null
      var raw = String(dataStr).trim()
      if (!raw) return null
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        var p = raw.split('-')
        return {
          ano: parseInt(p[0], 10),
          mes: parseInt(p[1], 10),
          dia: parseInt(p[2], 10),
          isoDia: raw,
        }
      }
      var d = new Date(raw)
      if (!d || isNaN(d.getTime())) return null
      var utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
      var spOffsetMillis = -3 * 60 * 60000
      var spDate = new Date(utcMillis + spOffsetMillis)

      var ano = spDate.getFullYear()
      var m = spDate.getMonth() + 1
      var dia = spDate.getDate()
      var mesStr = m < 10 ? '0' + m : String(m)
      var diaStr = dia < 10 ? '0' + dia : String(dia)

      return {
        ano: ano,
        mes: m,
        dia: dia,
        isoDia: ano + '-' + mesStr + '-' + diaStr,
      }
    }

    function round2(valor) {
      var num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
      if (isNaN(num)) return 0
      return Math.round(num * 100) / 100
    }

    // 1. Buscar documentos_fiscais com tipo_documento = 1 (saída) e status Autorizada, Cancelada ou Denegada
    // Respeita ambiente de Homologação conforme incluirTeste
    let docsBrutos = []
    try {
      docsBrutos = $app.findRecordsByFilter(
        'documentos_fiscais',
        "empresa_id = '" + empresaId + "' && tipo_documento = 1",
        'data_emissao,numero',
        10000,
        0,
      )
    } catch (errDocs) {
      console.warn('Erro ao carregar documentos_fiscais de saída:', errDocs)
    }

    // 2. Buscar inutilizações de numeração da empresa
    let inutsBrutas = []
    try {
      inutsBrutas = $app.findRecordsByFilter(
        'inutilizacoes',
        "empresa_id = '" + empresaId + "'",
        'created',
        2000,
        0,
      )
    } catch (errInut) {
      console.warn('Erro ao carregar inutilizacoes:', errInut)
    }

    // Filtragem dos documentos por período de data_emissao no horário de Brasília
    const docsFiltrados = []
    const docIdsParaItens = []

    for (let i = 0; i < docsBrutos.length; i++) {
      const doc = docsBrutos[i]
      const status = doc.getString('status')
      if (status !== 'Autorizada' && status !== 'Cancelada' && status !== 'Denegada') {
        continue
      }

      const ambiente = doc.getString('ambiente') || 'Homologação'
      if (ambiente === 'Homologação' && !incluirTeste) {
        continue
      }

      const dtEmissaoStr = doc.getString('data_emissao') || doc.getString('created')
      const dtBsb = extrairDataBrasilia(dtEmissaoStr)
      if (!dtBsb) continue

      if (dtBsb.isoDia < dataInicio || dtBsb.isoDia > dataFim) {
        continue
      }

      // Filtros opcionais adicionais
      const modeloDoc = doc.getString('modelo') || '55'
      if (
        filtrosAdicionais.modelo &&
        filtrosAdicionais.modelo !== 'todos' &&
        filtrosAdicionais.modelo !== modeloDoc
      ) {
        continue
      }

      if (filtrosAdicionais.situacao && filtrosAdicionais.situacao !== 'todos') {
        const sitAtual =
          status === 'Autorizada' ? 'normal' : status === 'Cancelada' ? 'cancelada' : 'denegada'
        if (filtrosAdicionais.situacao !== sitAtual && filtrosAdicionais.situacao !== status) {
          continue
        }
      }

      const ufDest = (doc.getString('destinatario_uf') || '').trim().toUpperCase()
      if (
        filtrosAdicionais.ufDestino &&
        filtrosAdicionais.ufDestino !== 'todos' &&
        filtrosAdicionais.ufDestino !== ufDest
      ) {
        continue
      }

      const clienteIdDoc = doc.getString('cliente_id')
      if (filtrosAdicionais.clienteId && filtrosAdicionais.clienteId !== clienteIdDoc) {
        continue
      }

      docsFiltrados.push({
        rec: doc,
        dtBsb: dtBsb,
      })

      if (status === 'Autorizada') {
        docIdsParaItens.push(doc.id)
      }
    }

    // Filtragem de inutilizações por data_inutilizacao no período
    const inutsFiltradas = []
    for (let u = 0; u < inutsBrutas.length; u++) {
      const inut = inutsBrutas[u]
      const dtInutStr = inut.getString('data_inutilizacao') || inut.getString('created')
      const dtInutBsb = extrairDataBrasilia(dtInutStr)
      if (!dtInutBsb) continue

      if (dtInutBsb.isoDia < dataInicio || dtInutBsb.isoDia > dataFim) {
        continue
      }

      const stInut = (inut.getString('status') || '').toLowerCase()
      if (stInut !== 'autorizada' && stInut !== 'homologada' && stInut !== 'sucesso') {
        continue
      }

      const modeloInut = inut.getString('modelo') || '55'
      if (
        filtrosAdicionais.modelo &&
        filtrosAdicionais.modelo !== 'todos' &&
        filtrosAdicionais.modelo !== modeloInut
      ) {
        continue
      }

      if (
        filtrosAdicionais.situacao &&
        filtrosAdicionais.situacao !== 'todos' &&
        filtrosAdicionais.situacao !== 'inutilizada'
      ) {
        continue
      }

      inutsFiltradas.push({
        rec: inut,
        dtBsb: dtInutBsb,
      })
    }

    // 3. Buscar documentos_fiscais_itens para os documentos Autorizados em lotes
    const itensPorDocumento = new Map() // documento_id -> array de itens
    const tamanhoLote = 40
    for (let l = 0; l < docIdsParaItens.length; l += tamanhoLote) {
      const loteIds = docIdsParaItens.slice(l, l + tamanhoLote)
      const filterLote = loteIds.map((id) => "documento_id = '" + id + "'").join(' || ')
      try {
        const itensLote = $app.findRecordsByFilter(
          'documentos_fiscais_itens',
          '(' + filterLote + ')',
          'item',
          2000,
          0,
        )
        for (let it = 0; it < itensLote.length; it++) {
          const itemRec = itensLote[it]
          const dId = itemRec.getString('documento_id')
          if (!itensPorDocumento.has(dId)) {
            itensPorDocumento.set(dId, [])
          }
          itensPorDocumento.get(dId).push(itemRec)
        }
      } catch (errItLote) {
        console.warn('Erro ao carregar lote de itens:', errItLote)
      }
    }

    // 4. Montagem das LINHAS POR DOCUMENTO
    // Linha: data, modelo, série, número, chave, destinatário, destinatário UF, CFOP principal,
    // valor contábil, base e valor do ICMS, base e valor do ICMS ST, IPI, situação (normal, cancelada, denegada, inutilizada; nas 3 últimas valores zerados)
    const linhasDocumentos = []

    for (let d = 0; d < docsFiltrados.length; d++) {
      const itemDoc = docsFiltrados[d]
      const doc = itemDoc.rec
      const status = doc.getString('status')
      const modelo = doc.getString('modelo') || '55'
      const serie = doc.getString('serie') || '1'
      const numero = doc.getInt('numero') || 0
      const chave = doc.getString('chave_acesso') || ''
      const destinatarioNome =
        doc.getString('destinatario_nome') || doc.getString('cliente_nome') || 'Consumidor'
      const destinatarioCnpjCpf = doc.getString('destinatario_cpf_cnpj') || ''
      const destinatarioUf = (
        doc.getString('destinatario_uf') ||
        dadosEmpresa.uf ||
        ''
      ).toUpperCase()
      const cfopPrincipal = doc.getString('cfop_principal') || ''

      let situacao = 'normal'
      if (status === 'Cancelada') situacao = 'cancelada'
      else if (status === 'Denegada') situacao = 'denegada'

      const ehZerada = situacao !== 'normal'

      const valorContabil = ehZerada ? 0 : round2(doc.getFloat('valor_total') || 0)
      const baseIcms = ehZerada ? 0 : round2(doc.getFloat('base_icms') || 0)
      const valorIcms = ehZerada ? 0 : round2(doc.getFloat('valor_icms') || 0)
      const baseIcmsSt = ehZerada ? 0 : round2(doc.getFloat('base_icms_st') || 0)
      const valorIcmsSt = ehZerada ? 0 : round2(doc.getFloat('valor_icms_st') || 0)
      const valorIpi = ehZerada ? 0 : round2(doc.getFloat('valor_ipi') || 0)
      const valorDifal = ehZerada ? 0 : round2(doc.getFloat('valor_icms_uf_destino') || 0)

      // Filtro por CFOP principal se solicitado
      if (
        filtrosAdicionais.cfop &&
        cfopPrincipal &&
        !cfopPrincipal.startsWith(filtrosAdicionais.cfop)
      ) {
        continue
      }

      linhasDocumentos.push({
        id: doc.id,
        tipo: 'documento',
        data: itemDoc.dtBsb.isoDia,
        modelo: modelo,
        serie: serie,
        numero: numero,
        chave: chave,
        destinatario_nome: destinatarioNome,
        destinatario_cnpj_cpf: destinatarioCnpjCpf,
        destinatario_uf: destinatarioUf,
        cfop_principal: cfopPrincipal,
        valor_contabil: valorContabil,
        base_icms: baseIcms,
        valor_icms: valorIcms,
        base_icms_st: baseIcmsSt,
        valor_icms_st: valorIcmsSt,
        valor_ipi: valorIpi,
        valor_difal: valorDifal,
        situacao: situacao,
        ambiente: doc.getString('ambiente') || 'Homologação',
      })
    }

    // Desdobra inutilizações em linhas por número inutilizado
    for (let inIdx = 0; inIdx < inutsFiltradas.length; inIdx++) {
      const itemInut = inutsFiltradas[inIdx]
      const inutRec = itemInut.rec
      const modInut = inutRec.getString('modelo') || '55'
      const serInut = inutRec.getString('serie') || '1'
      const nIni = inutRec.getInt('numero_inicial') || 0
      const nFim = inutRec.getInt('numero_final') || nIni

      for (let n = nIni; n <= nFim; n++) {
        linhasDocumentos.push({
          id: 'inut_' + inutRec.id + '_' + n,
          tipo: 'inutilizacao',
          data: itemInut.dtBsb.isoDia,
          modelo: modInut,
          serie: serInut,
          numero: n,
          chave: '',
          destinatario_nome: 'NUMERAÇÃO INUTILIZADA',
          destinatario_cnpj_cpf: '',
          destinatario_uf: dadosEmpresa.uf || '',
          cfop_principal: '',
          valor_contabil: 0,
          base_icms: 0,
          valor_icms: 0,
          base_icms_st: 0,
          valor_icms_st: 0,
          valor_ipi: 0,
          valor_difal: 0,
          situacao: 'inutilizada',
          ambiente: 'Produção',
        })
      }
    }

    // Ordena linhas por data e número
    linhasDocumentos.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data)
      return a.numero - b.numero
    })

    // 5. RESUMO POR CFOP, CST E ALÍQUOTA (somando documentos_fiscais_itens dos autorizados)
    // Colunas: valor contábil, base, ICMS, ICMS ST, isentas ou não tributadas, outras
    // Só documentos com status 'Autorizada' entram no resumo (Cancelados/Denegados/Inutilizados
    // não somam; Rejeitados/Pendentes/Processando ficam fora).
    // NFC-e (modelo 65) quando não possuem itens gravados em documentos_fiscais_itens
    // derivam UM item sintético do cabeçalho do documento autorizado (mesma base que o SPED),
    // garantindo total convergência entre a seção 1 e a seção 2.
    const mapaResumoCst = new Map()

    for (let d2 = 0; d2 < docsFiltrados.length; d2++) {
      const itemDoc = docsFiltrados[d2]
      const doc = itemDoc.rec
      if (doc.getString('status') !== 'Autorizada') continue

      const modeloResumo = doc.getString('modelo') || '55'
      const itensBrutosDoc = itensPorDocumento.get(doc.id) || []
      const itensDoc = []

      for (let b = 0; b < itensBrutosDoc.length; b++) {
        const itRec = itensBrutosDoc[b]
        itensDoc.push({
          cfop: (itRec.getString('cfop') || '').trim(),
          cst: (itRec.getString('cst_icms') || itRec.getString('csosn') || '').trim(),
          aliquota: round2(itRec.getFloat('aliquota_icms') || 0),
          valor_total: round2(itRec.getFloat('valor_total') || 0),
          valor_icms_st: round2(itRec.getFloat('valor_icms_st') || 0),
          valor_fcp_st: round2(itRec.getFloat('valor_fcp_st') || 0),
          valor_ipi: round2(itRec.getFloat('valor_ipi') || 0),
          base_icms: round2(itRec.getFloat('base_icms') || 0),
          valor_icms: round2(itRec.getFloat('valor_icms') || 0),
          base_icms_st: round2(itRec.getFloat('base_icms_st') || 0),
          reducao_bc_icms: round2(itRec.getFloat('reducao_bc_icms') || 0),
        })
      }

      if (itensDoc.length === 0 && modeloResumo === '65') {
        const totDoc = round2(doc.getFloat('valor_total') || 0)
        const bcDoc = round2(doc.getFloat('base_icms') || 0)
        const vIcmsDoc = round2(doc.getFloat('valor_icms') || 0)

        let cstFallback = '00'
        let aliqFallback = 0
        if (bcDoc <= 0 && vIcmsDoc <= 0) {
          cstFallback = '40' // Isenta / Não tributada
        } else if (bcDoc > 0) {
          aliqFallback = round2((vIcmsDoc / bcDoc) * 100)
        }

        itensDoc.push({
          cfop: (doc.getString('cfop_principal') || '5102').trim(),
          cst: cstFallback,
          aliquota: aliqFallback,
          valor_total: totDoc,
          valor_icms_st: 0,
          valor_fcp_st: 0,
          valor_ipi: 0,
          base_icms: bcDoc,
          valor_icms: vIcmsDoc,
          base_icms_st: 0,
          reducao_bc_icms: 0,
        })
      }

      for (let it = 0; it < itensDoc.length; it++) {
        const itRec = itensDoc[it]
        const cfop = (itRec.cfop || doc.getString('cfop_principal') || '5102').trim()
        let cst = (itRec.cst || '00').trim()
        if (
          cst.length === 4 &&
          (cst.startsWith('0') || cst.startsWith('1') || cst.startsWith('2'))
        ) {
          cst = cst.slice(1) // CSOSN 3 dígitos
        }
        const aliquota = round2(itRec.aliquota || 0)

        // Filtros adicionais de CFOP / CST no resumo
        if (filtrosAdicionais.cfop && !cfop.startsWith(filtrosAdicionais.cfop)) continue
        if (filtrosAdicionais.cst && cst !== filtrosAdicionais.cst) continue

        const chave = cfop + '_' + cst + '_' + aliquota.toFixed(2)

        const vTotItem = round2(itRec.valor_total || 0)
        const vStItem = round2(itRec.valor_icms_st || 0)
        const vIpiItem = round2(itRec.valor_ipi || 0)
        const vFcpSt = round2(itRec.valor_fcp_st || 0)

        // Valor contábil do item na saída: total do item + ST + FCP ST + IPI
        const valorContabilItem = round2(vTotItem + vStItem + vFcpSt + vIpiItem)
        const baseIcmsItem = round2(itRec.base_icms || 0)
        const valorIcmsItem = round2(itRec.valor_icms || 0)
        const baseIcmsStItem = round2(itRec.base_icms_st || 0)
        const valorIcmsStItem = round2(vStItem + vFcpSt)

        // Isentas ou Não Tributadas: CST 40, 41 ou parcela não tributada quando houver isenção expressa
        let isentas = 0
        let outras = 0

        if (cst === '40' || cst === '41' || cst === '300' || cst === '400') {
          isentas = valorContabilItem
        } else if (cst === '60' || cst === '500') {
          // Cobrado anteriormente por ST: parcela vai em outras
          outras = valorContabilItem
        } else {
          const sobra = Math.max(
            0,
            round2(valorContabilItem - baseIcmsItem - valorIcmsStItem - vIpiItem),
          )
          // Parcela reduzida / isenta
          const redBc = round2(itRec.reducao_bc_icms || 0)
          if (redBc > 0) {
            isentas = sobra
          } else {
            outras = sobra
          }
        }

        if (!mapaResumoCst.has(chave)) {
          mapaResumoCst.set(chave, {
            cfop: cfop,
            cst: cst,
            aliquota: aliquota,
            valor_contabil: valorContabilItem,
            base_icms: baseIcmsItem,
            valor_icms: valorIcmsItem,
            base_icms_st: baseIcmsStItem,
            valor_icms_st: valorIcmsStItem,
            valor_ipi: vIpiItem,
            isentas: isentas,
            outras: outras,
          })
        } else {
          const reg = mapaResumoCst.get(chave)
          reg.valor_contabil = round2(reg.valor_contabil + valorContabilItem)
          reg.base_icms = round2(reg.base_icms + baseIcmsItem)
          reg.valor_icms = round2(reg.valor_icms + valorIcmsItem)
          reg.base_icms_st = round2(reg.base_icms_st + baseIcmsStItem)
          reg.valor_icms_st = round2(reg.valor_icms_st + valorIcmsStItem)
          reg.valor_ipi = round2(reg.valor_ipi + vIpiItem)
          reg.isentas = round2(reg.isentas + isentas)
          reg.outras = round2(reg.outras + outras)
        }
      }
    }

    const resumoCfopCstAliquota = Array.from(mapaResumoCst.values()).sort((a, b) => {
      if (a.cfop !== b.cfop) return a.cfop.localeCompare(b.cfop)
      if (a.cst !== b.cst) return a.cst.localeCompare(b.cst)
      return a.aliquota - b.aliquota
    })

    // 6. RESUMO POR UF DE DESTINO (para as saídas e vendas a outros estados)
    // Colunas: UF, valor contábil, ICMS, DIFAL
    const mapaUfDestino = new Map()
    const ufOrigem = (dadosEmpresa.uf || '').toUpperCase()

    for (let l = 0; l < linhasDocumentos.length; l++) {
      const lin = linhasDocumentos[l]
      if (lin.situacao !== 'normal') continue

      const uf = (lin.destinatario_uf || '').toUpperCase()
      if (!uf) continue

      // O resumo foca nas vendas a outros estados, mas também consolida por UF
      if (!mapaUfDestino.has(uf)) {
        mapaUfDestino.set(uf, {
          uf: uf,
          ehInterestadual: uf !== ufOrigem,
          quantidade_documentos: 1,
          valor_contabil: lin.valor_contabil,
          valor_icms: lin.valor_icms,
          valor_difal: lin.valor_difal,
        })
      } else {
        const rUf = mapaUfDestino.get(uf)
        rUf.quantidade_documentos += 1
        rUf.valor_contabil = round2(rUf.valor_contabil + lin.valor_contabil)
        rUf.valor_icms = round2(rUf.valor_icms + lin.valor_icms)
        rUf.valor_difal = round2(rUf.valor_difal + lin.valor_difal)
      }
    }

    const resumoUfDestino = Array.from(mapaUfDestino.values()).sort((a, b) => {
      // Interestaduais primeiro, depois internas
      if (a.ehInterestadual && !b.ehInterestadual) return -1
      if (!a.ehInterestadual && b.ehInterestadual) return 1
      return a.uf.localeCompare(b.uf)
    })

    // 7. TOTAIS GERAIS
    const totaisGerais = {
      totalLinhas: linhasDocumentos.length,
      totalNormais: linhasDocumentos.filter((x) => x.situacao === 'normal').length,
      totalCanceladas: linhasDocumentos.filter((x) => x.situacao === 'cancelada').length,
      totalDenegadas: linhasDocumentos.filter((x) => x.situacao === 'denegada').length,
      totalInutilizadas: linhasDocumentos.filter((x) => x.situacao === 'inutilizada').length,
      valorContabilTotal: round2(linhasDocumentos.reduce((a, b) => a + b.valor_contabil, 0)),
      baseIcmsTotal: round2(linhasDocumentos.reduce((a, b) => a + b.base_icms, 0)),
      valorIcmsTotal: round2(linhasDocumentos.reduce((a, b) => a + b.valor_icms, 0)),
      baseIcmsStTotal: round2(linhasDocumentos.reduce((a, b) => a + b.base_icms_st, 0)),
      valorIcmsStTotal: round2(linhasDocumentos.reduce((a, b) => a + b.valor_icms_st, 0)),
      valorIpiTotal: round2(linhasDocumentos.reduce((a, b) => a + b.valor_ipi, 0)),
      valorDifalTotal: round2(linhasDocumentos.reduce((a, b) => a + b.valor_difal, 0)),
      isentasTotal: round2(resumoCfopCstAliquota.reduce((a, b) => a + b.isentas, 0)),
      outrasTotal: round2(resumoCfopCstAliquota.reduce((a, b) => a + b.outras, 0)),
    }

    return c.json(200, {
      sucesso: true,
      periodo: {
        dataInicio: dataInicio,
        dataFim: dataFim,
      },
      empresa: dadosEmpresa,
      incluiNotasTeste: incluirTeste,
      linhas: linhasDocumentos,
      resumoCfopCstAliquota: resumoCfopCstAliquota,
      resumoUfDestino: resumoUfDestino,
      totaisGerais: totaisGerais,
    })
  } catch (errLivro) {
    console.error('[livro-saidas] Erro:', errLivro)
    return c.json(500, {
      sucesso: false,
      message:
        'Erro ao gerar Livro de Saídas: ' + ((errLivro && errLivro.message) || String(errLivro)),
    })
  }
})
