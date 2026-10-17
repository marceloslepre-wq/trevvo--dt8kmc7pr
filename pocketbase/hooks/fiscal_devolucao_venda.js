/// <reference path="../types.d.ts" />

/**
 * Operações fiscais de Devolução de Venda (NF-e modelo 55 de entrada própria):
 * 1) POST /backend/v1/fiscal/emitir-nfe-devolucao-venda
 * 2) POST /backend/v1/fiscal/confirmar-autorizacao-devolucao-venda
 *
 * Conforme regras do ERP:
 * - Apenas vendas com NF-e ou NFC-e Autorizada (documento_fiscal_status = 'Autorizada')
 *   emitem nota fiscal de devolução de venda.
 * - Nota emitida com modelo 55, tipo_documento 0 (Entrada), finalidade 4 (Devolução),
 *   referenciando a chave de acesso de 44 dígitos da nota original.
 * - Itens proporcionais aos impostos originais da venda.
 * - Referência: "{cnpj}-55-{id do documento}".
 * - Estoque e financeiro SÓ são movimentados após autorização da nota na SEFAZ.
 */

// =========================================================================
// 1) EMITIR NF-E DE DEVOLUÇÃO DE VENDA
// =========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe-devolucao-venda',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const encodeBase64 = (str) => {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        try {
          return Buffer.from(str, 'utf8').toString('base64')
        } catch (_) {}
      }
      if (typeof btoa === 'function') {
        try {
          return btoa(str)
        } catch (_) {}
      }
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      let i = 0
      const len = str.length
      while (i < len) {
        const c1 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt((c1 & 0x3) << 4)
          out += '=='
          break
        }
        const c2 = str.charCodeAt(i++) & 0xff
        if (i === len) {
          out += chars.charAt(c1 >> 2)
          out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
          out += chars.charAt((c2 & 0x0f) << 2)
          out += '='
          break
        }
        const c3 = str.charCodeAt(i++) & 0xff
        out += chars.charAt(c1 >> 2)
        out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
        out += chars.charAt(((c2 & 0x0f) << 2) | ((c3 & 0xc0) >> 6))
        out += chars.charAt(c3 & 0x3f)
      }
      return out
    }

    const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    const devolucaoId = data.devolucao_id || data.venda_devolucao_id

    // Dados complementares de cliente caso a nota original não possuísse cadastro completo
    const clienteNomeInput = (data.cliente_nome || '').trim()
    const clienteCpfInput = (data.cliente_cpf || data.cliente_cpf_cnpj || '').replace(/\D/g, '')

    if (!devolucaoId) {
      return c.json(400, { sucesso: false, message: 'devolucao_id é obrigatório.' })
    }

    // Carregar registro de devolução na coleção 'vendas'
    let devolucaoRec = null
    try {
      devolucaoRec = $app.findRecordById('vendas', devolucaoId)
    } catch (_) {}

    if (!devolucaoRec || !devolucaoRec.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Registro de devolução não encontrado.' })
    }

    if (devolucaoRec.getString('tipo') !== 'Devolução') {
      return c.json(400, {
        sucesso: false,
        message: 'O registro informado não é uma venda do tipo Devolução.',
      })
    }

    const vendaOrigemId = devolucaoRec.getString('venda_origem_id')
    if (!vendaOrigemId) {
      return c.json(400, {
        sucesso: false,
        message: 'A devolução não possui venda_origem_id vinculada.',
      })
    }

    // Carregar venda original
    let vendaOrig = null
    try {
      vendaOrig = $app.findRecordById('vendas', vendaOrigemId)
    } catch (_) {}

    if (!vendaOrig || !vendaOrig.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Venda original não encontrada.' })
    }

    if (vendaOrig.getString('documento_fiscal_status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message:
          'Apenas vendas originais com NF-e ou NFC-e Autorizada podem emitir NF-e de devolução.',
      })
    }

    // Carregar documento fiscal da venda original
    let docOrig = null
    const docOrigId = vendaOrig.getString('documento_fiscal_id')
    if (docOrigId) {
      try {
        docOrig = $app.findRecordById('documentos_fiscais', docOrigId)
      } catch (_) {}
    }

    if (!docOrig) {
      const docsOrig = $app.findRecordsByFilter(
        'documentos_fiscais',
        `venda_id = '${vendaOrig.id}' && status = 'Autorizada'`,
        '-created',
        1,
        0,
      )
      if (docsOrig && docsOrig.length > 0) {
        docOrig = docsOrig[0]
      }
    }

    if (!docOrig) {
      return c.json(400, {
        sucesso: false,
        message: 'Documento fiscal autorizado da venda original não encontrado.',
      })
    }

    const chaveNotaOriginal = (docOrig.getString('chave_acesso') || '').replace(/\D/g, '')
    if (!chaveNotaOriginal || chaveNotaOriginal.length !== 44) {
      return c.json(400, {
        sucesso: false,
        message: 'A nota original não possui chave de acesso válida (44 dígitos).',
      })
    }

    const empresaId = vendaOrig.getString('empresa_id')
    const empresaEmitente = $app.findRecordById('empresas', empresaId)
    if (!empresaEmitente || !empresaEmitente.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa emitente não encontrada.' })
    }

    // Configuração fiscal da empresa
    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )
    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Configuração fiscal da empresa não encontrada.',
      })
    }

    const cfgFiscal = configs[0]
    if (!cfgFiscal.getBool('emite_documentos_fiscais')) {
      return c.json(400, {
        sucesso: false,
        message: 'Esta empresa não está habilitada para emissão de documentos fiscais.',
      })
    }

    const ambiente = cfgFiscal.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (cfgFiscal.getString('codigo_token') || '').trim().toUpperCase()
    const sufixoAmbiente = ambiente === 'Produção' ? 'PRODUCAO' : 'HOMOLOGACAO'
    const nomeSegredo = codigoToken
      ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
      : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

    let token = ''
    try {
      token = ($os.getenv(nomeSegredo) || '').trim()
    } catch (_) {}

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: configure o segredo ${nomeSegredo} no Skip Cloud.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const serieNfe = cfgFiscal.getString('serie_nfe') || '1'
    const naturezaOperacao =
      cfgFiscal.getString('natureza_operacao_devolucao_venda') || 'Devolução de venda'

    const cnpjEmitente = (empresaEmitente.getString('cnpj') || '').replace(/\D/g, '')
    const ufEmitente = (empresaEmitente.getString('uf') || '').trim().toUpperCase()

    // Identificação do Destinatário (Cliente da Venda Original)
    let cliente = null
    const clienteId = vendaOrig.getString('cliente_id')
    if (clienteId) {
      try {
        cliente = $app.findRecordById('clientes', clienteId)
      } catch (_) {}
    }

    let nomeCliente =
      clienteNomeInput ||
      (cliente
        ? cliente.getString('nome_razao_social') || cliente.getString('nome_fantasia')
        : '') ||
      docOrig.getString('destinatario_nome') ||
      ''

    let cpfCnpjCliente =
      clienteCpfInput ||
      (cliente ? (cliente.getString('cpf_cnpj') || '').replace(/\D/g, '') : '') ||
      (vendaOrig.getString('cpf_cnpj_consumidor') || '').replace(/\D/g, '') ||
      (docOrig.getString('destinatario_cpf_cnpj') || '').replace(/\D/g, '') ||
      ''

    if (!cpfCnpjCliente || (cpfCnpjCliente.length !== 11 && cpfCnpjCliente.length !== 14)) {
      return c.json(400, {
        sucesso: false,
        message:
          'CPF ou CNPJ do cliente/consumidor é obrigatório para emissão da NF-e de devolução.',
      })
    }

    if (!nomeCliente) {
      return c.json(400, {
        sucesso: false,
        message: 'Nome/Razão Social do cliente é obrigatório para emissão da NF-e de devolução.',
      })
    }

    const ufCliente =
      (cliente ? cliente.getString('uf') : '') || docOrig.getString('destinatario_uf') || ufEmitente
    const ieCliente = (cliente ? cliente.getString('inscricao_estadual') : '').trim()
    const logrCliente =
      (cliente ? cliente.getString('logradouro') : '') ||
      empresaEmitente.getString('logradouro') ||
      'RUA'
    const numCliente = (cliente ? cliente.getString('numero') : '') || 'S/N'
    const bairroCliente =
      (cliente ? cliente.getString('bairro') : '') ||
      empresaEmitente.getString('bairro') ||
      'CENTRO'
    const munCliente =
      (cliente ? cliente.getString('municipio') : '') || empresaEmitente.getString('municipio')
    const cepCliente =
      (cliente ? (cliente.getString('cep') || '').replace(/\D/g, '') : '') ||
      (empresaEmitente.getString('cep') || '').replace(/\D/g, '')
    const ibgeCliente =
      (cliente ? cliente.getString('codigo_municipio_ibge') : '') ||
      empresaEmitente.getString('codigo_municipio_ibge')

    const ehOperacaoInterna = ufCliente.toUpperCase() === ufEmitente
    const indicadorIeDest = ieCliente && ieCliente.toUpperCase() !== 'ISENTO' ? '1' : '9'

    // Carregar itens da devolução e itens da nota original
    const itensDevolucao = $app.findRecordsByFilter(
      'vendas_itens',
      `venda_id = '${devolucaoId}' && ativo = true`,
      'item',
    )

    if (!itensDevolucao || itensDevolucao.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Nenhum item encontrado na devolução de venda.',
      })
    }

    // Carregar itens da nota original
    const itensDocOrig = $app.findRecordsByFilter(
      'documentos_fiscais_itens',
      `documento_id = '${docOrig.id}'`,
      'item',
    )
    const mapaItensDocOrig = new Map()
    for (let itDoc of itensDocOrig) {
      const pId = itDoc.getString('produto_id')
      if (pId) {
        mapaItensDocOrig.set(pId, itDoc)
      }
    }

    // Carregar itens da venda original
    const itensVendaOrig = $app.findRecordsByFilter(
      'vendas_itens',
      `venda_id = '${vendaOrig.id}' && ativo = true`,
    )
    const mapaItensVendaOrig = new Map()
    for (let itV of itensVendaOrig) {
      mapaItensVendaOrig.set(itV.getString('produto_id'), itV)
    }

    // 1. Criar pré-registro em documentos_fiscais para obter o ID antes do envio à Focus
    // Conforme especificação: referencia = "{cnpj da empresa}-55-{id do documento}"
    const docFiscaisCol = $app.findCollectionByNameOrId('documentos_fiscais')
    let docRec = null

    // Verificar se já existe documento fiscal criado para esta devolução
    const docsExistentes = $app.findRecordsByFilter(
      'documentos_fiscais',
      `devolucao_venda_id = '${devolucaoId}' && modelo = '55'`,
      '-created',
      1,
      0,
    )

    if (docsExistentes && docsExistentes.length > 0) {
      docRec = docsExistentes[0]
      if (docRec.getString('status') === 'Autorizada') {
        return c.json(200, {
          sucesso: true,
          status: 'Autorizada',
          documento_id: docRec.id,
          chave: docRec.getString('chave_acesso'),
          numero: docRec.getInt('numero'),
          message: 'NF-e de devolução já autorizada.',
          ja_autorizada: true,
        })
      }
    } else {
      docRec = new Record(docFiscaisCol)
      docRec.set('empresa_id', empresaId)
      docRec.set('modelo', '55')
      docRec.set('tipo_documento', 0) // 0 Entrada
      docRec.set('finalidade', 4) // 4 Devolução
      docRec.set('ambiente', ambiente)
      docRec.set('origem', 'Devolução de venda')
      docRec.set('venda_id', devolucaoId)
      docRec.set('devolucao_venda_id', devolucaoId)
      docRec.set('documento_referenciado_chave', chaveNotaOriginal)
      docRec.set('status', 'Processando')
      docRec.set('serie', serieNfe)
      docRec.set('natureza_operacao', naturezaOperacao)
      docRec.set('destinatario_nome', nomeCliente)
      docRec.set('destinatario_cpf_cnpj', cpfCnpjCliente)
      docRec.set('destinatario_uf', ufCliente)
      docRec.set('usuario_emissao_id', userId)
      $app.save(docRec)
    }

    const refFocus = `${cnpjEmitente}-55-${docRec.id}`
    docRec.set('referencia', refFocus)

    // Montagem dos itens com impostos proporcionais
    let totValorProdutos = 0
    let totValorTotal = 0
    let totBaseIcms = 0
    let totValorIcms = 0
    let totBaseIcmsSt = 0
    let totValorIcmsSt = 0
    let totValorIpi = 0
    let totValorPis = 0
    let totValorCofins = 0

    const itensFocus = []
    const itensDocFiscal = []

    for (let i = 0; i < itensDevolucao.length; i++) {
      const itDev = itensDevolucao[i]
      const prodId = itDev.getString('produto_id')
      const qtdDev = itDev.getFloat('quantidade') || 1
      const vUnitDev = itDev.getFloat('preco_unitario') || 0
      const vBrutoDev = round2(qtdDev * vUnitDev)

      const itDocOrig = mapaItensDocOrig.get(prodId) || (itensDocOrig[i] ? itensDocOrig[i] : null)
      const itVendaOrig =
        mapaItensVendaOrig.get(prodId) || (itensVendaOrig[i] ? itensVendaOrig[i] : null)

      const qtdVendida =
        (itDocOrig ? itDocOrig.getFloat('quantidade') : 0) ||
        (itVendaOrig ? itVendaOrig.getFloat('quantidade') : 0) ||
        qtdDev

      const fracao = qtdVendida > 0 ? qtdDev / qtdVendida : 1

      // Impostos originais proporcionais
      const baseIcmsOrig = itDocOrig ? itDocOrig.getFloat('base_icms') || 0 : 0
      const aliqIcmsOrig = itDocOrig ? itDocOrig.getFloat('aliquota_icms') || 0 : 0
      const valorIcmsOrig = itDocOrig ? itDocOrig.getFloat('valor_icms') || 0 : 0

      const baseStOrig = itDocOrig ? itDocOrig.getFloat('base_icms_st') || 0 : 0
      const aliqStOrig = itDocOrig ? itDocOrig.getFloat('aliquota_icms_st') || 0 : 0
      const valorStOrig = itDocOrig ? itDocOrig.getFloat('valor_icms_st') || 0 : 0

      const baseIpiOrig = itDocOrig ? itDocOrig.getFloat('base_ipi') || 0 : 0
      const aliqIpiOrig = itDocOrig ? itDocOrig.getFloat('aliquota_ipi') || 0 : 0
      const valorIpiOrig = itDocOrig ? itDocOrig.getFloat('valor_ipi') || 0 : 0

      const basePisOrig = itDocOrig ? itDocOrig.getFloat('base_pis') || 0 : 0
      const aliqPisOrig = itDocOrig ? itDocOrig.getFloat('aliquota_pis') || 0 : 0
      const valorPisOrig = itDocOrig ? itDocOrig.getFloat('valor_pis') || 0 : 0

      const baseCofinsOrig = itDocOrig ? itDocOrig.getFloat('base_cofins') || 0 : 0
      const aliqCofinsOrig = itDocOrig ? itDocOrig.getFloat('aliquota_cofins') || 0 : 0
      const valorCofinsOrig = itDocOrig ? itDocOrig.getFloat('valor_cofins') || 0 : 0

      const baseIcmsItem = round2(baseIcmsOrig * fracao)
      const valorIcmsItem = round2(valorIcmsOrig * fracao)
      const baseStItem = round2(baseStOrig * fracao)
      const valorStItem = round2(valorStOrig * fracao)
      const valorIpiItem = round2(valorIpiOrig * fracao)
      const baseIpiItem = round2(baseIpiOrig * fracao)
      const valorPisItem = round2(valorPisOrig * fracao)
      const valorCofinsItem = round2(valorCofinsOrig * fracao)

      const teveSt =
        valorStItem > 0 || baseStItem > 0 || (itDocOrig && itDocOrig.getFloat('valor_icms_st') > 0)

      // CFOP de devolução de venda (entrada): 1202/2202 ou 1411/2411 com ST
      let cfopDevolucao = ''
      if (teveSt) {
        cfopDevolucao = ehOperacaoInterna ? '1411' : '2411'
      } else {
        cfopDevolucao = ehOperacaoInterna ? '1202' : '2202'
      }

      let prodRec = null
      if (prodId) {
        try {
          prodRec = $app.findRecordById('produtos', prodId)
        } catch (_) {}
      }

      const ncm = (
        (itDocOrig ? itDocOrig.getString('ncm') : '') ||
        (prodRec ? prodRec.getString('ncm') : '') ||
        ''
      ).replace(/\D/g, '')

      const cest = (
        (itDocOrig ? itDocOrig.getString('cest') : '') ||
        (prodRec ? prodRec.getString('cest') : '') ||
        ''
      ).replace(/\D/g, '')

      const cstIcms = (itDocOrig ? itDocOrig.getString('cst_icms') : '') || '00'
      const csosn = itDocOrig ? itDocOrig.getString('csosn') : ''
      const origemItem = (itDocOrig ? itDocOrig.getString('origem') : '') || '0'

      const numItem = i + 1
      const itemFocus = {
        numero_item: numItem,
        codigo_produto: prodRec ? prodRec.getString('codigo') || prodId : String(numItem),
        descricao: itDev.getString('descricao'),
        cfop: cfopDevolucao,
        codigo_ncm: ncm,
        unidade_comercial: itDev.getString('unidade') || 'UN',
        quantidade_comercial: qtdDev,
        valor_unitario_comercial: vUnitDev,
        unidade_tributavel: itDev.getString('unidade') || 'UN',
        quantidade_tributavel: qtdDev,
        valor_unitario_tributavel: vUnitDev,
        valor_bruto: vBrutoDev,
        icms_origem: origemItem,
        icms_situacao_tributaria: cstIcms,
      }

      if (cest) itemFocus.codigo_cest = cest
      if (baseIcmsItem > 0 && valorIcmsItem > 0) {
        itemFocus.icms_base_calculo = baseIcmsItem
        itemFocus.icms_aliquota = aliqIcmsOrig
        itemFocus.icms_valor = valorIcmsItem
      }
      if (baseStItem > 0 && valorStItem > 0) {
        itemFocus.icms_base_calculo_st = baseStItem
        itemFocus.icms_aliquota_st = aliqStOrig
        itemFocus.icms_valor_st = valorStItem
      }
      if (valorIpiItem > 0) {
        itemFocus.ipi_situacao_tributaria =
          (itDocOrig ? itDocOrig.getString('cst_ipi') : '') || '99'
        itemFocus.ipi_base_calculo = baseIpiItem
        itemFocus.ipi_aliquota = aliqIpiOrig
        itemFocus.ipi_valor = valorIpiItem
      }
      if (valorPisItem > 0) {
        itemFocus.pis_situacao_tributaria =
          (itDocOrig ? itDocOrig.getString('cst_pis') : '') || '01'
        itemFocus.pis_base_calculo = round2(basePisOrig * fracao)
        itemFocus.pis_aliquota_porcentual = aliqPisOrig
        itemFocus.pis_valor = valorPisItem
      }
      if (valorCofinsItem > 0) {
        itemFocus.cofins_situacao_tributaria =
          (itDocOrig ? itDocOrig.getString('cst_cofins') : '') || '01'
        itemFocus.cofins_base_calculo = round2(baseCofinsOrig * fracao)
        itemFocus.cofins_aliquota_porcentual = aliqCofinsOrig
        itemFocus.cofins_valor = valorCofinsItem
      }

      itensFocus.push(itemFocus)

      const vTotItem = round2(vBrutoDev + valorStItem + valorIpiItem)
      itensDocFiscal.push({
        item: numItem,
        produto_id: prodId,
        codigo: itemFocus.codigo_produto,
        descricao: itemFocus.descricao,
        ncm: ncm,
        cest: cest,
        cfop: cfopDevolucao,
        unidade: itemFocus.unidade_comercial,
        quantidade: qtdDev,
        valor_unitario: vUnitDev,
        valor_bruto: vBrutoDev,
        valor_total: vTotItem,
        origem: origemItem,
        cst_icms: cstIcms,
        csosn: csosn,
        base_icms: baseIcmsItem,
        aliquota_icms: aliqIcmsOrig,
        valor_icms: valorIcmsItem,
        base_icms_st: baseStItem,
        aliquota_icms_st: aliqStOrig,
        valor_icms_st: valorStItem,
        valor_ipi: valorIpiItem,
        custo_unitario: itDev.getFloat('custo_unitario') || vUnitDev,
      })

      totValorProdutos += vBrutoDev
      totBaseIcms += baseIcmsItem
      totValorIcms += valorIcmsItem
      totBaseIcmsSt += baseStItem
      totValorIcmsSt += valorStItem
      totValorIpi += valorIpiItem
      totValorPis += valorPisItem
      totValorCofins += valorCofinsItem
      totValorTotal += vTotItem
    }

    totValorProdutos = round2(totValorProdutos)
    totValorTotal = round2(totValorTotal)

    const nomeDestFinal =
      ambiente === 'Homologação'
        ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : nomeCliente

    const payloadFocus = {
      natureza_operacao: naturezaOperacao,
      data_emissao: new Date().toISOString(),
      tipo_documento: 0, // 0 Entrada
      finalidade_emissao: 4, // 4 Devolução
      local_destino: ehOperacaoInterna ? 1 : 2,
      consumidor_final: 1,
      presenca_comprador: '1',
      modalidade_frete: 9,
      cnpj_emitente: cnpjEmitente,
      notas_referenciadas: [{ chave_nfe: chaveNotaOriginal }],
      nome_destinatario: nomeDestFinal,
      indicador_inscricao_estadual_destinatario: indicadorIeDest,
      logradouro_destinatario: logrCliente,
      numero_destinatario: numCliente,
      bairro_destinatario: bairroCliente,
      municipio_destinatario: munCliente,
      uf_destinatario: ufCliente,
      cep_destinatario: cepCliente,
      codigo_municipio_destinatario: ibgeCliente,
      items: itensFocus,
      informacoes_adicionais_contribuinte: `Devolução de venda ref. NF-e/NFC-e chave ${chaveNotaOriginal}.`,
    }

    if (cpfCnpjCliente.length === 14) {
      payloadFocus.cnpj_destinatario = cpfCnpjCliente
    } else {
      payloadFocus.cpf_destinatario = cpfCnpjCliente
    }
    if (ieCliente && ieCliente.toUpperCase() !== 'ISENTO') {
      payloadFocus.inscricao_estadual_destinatario = ieCliente.replace(/\D/g, '')
    }

    // Atualizar cabeçalho do documento fiscal
    docRec.set('valor_produtos', totValorProdutos)
    docRec.set('base_icms', round2(totBaseIcms))
    docRec.set('valor_icms', round2(totValorIcms))
    docRec.set('base_icms_st', round2(totBaseIcmsSt))
    docRec.set('valor_icms_st', round2(totValorIcmsSt))
    docRec.set('valor_ipi', round2(totValorIpi))
    docRec.set('valor_pis', round2(totValorPis))
    docRec.set('valor_cofins', round2(totValorCofins))
    docRec.set('valor_total', totValorTotal)
    docRec.set('json_enviado', payloadFocus)
    $app.save(docRec)

    // Atualizar itens em documentos_fiscais_itens
    const docItensCol = $app.findCollectionByNameOrId('documentos_fiscais_itens')
    try {
      const itensAnteriores = $app.findRecordsByFilter(
        'documentos_fiscais_itens',
        `documento_id = '${docRec.id}'`,
        '',
      )
      for (let a = 0; a < itensAnteriores.length; a++) {
        $app.delete(itensAnteriores[a])
      }
    } catch (_) {}

    for (let itD of itensDocFiscal) {
      const itRec = new Record(docItensCol)
      itRec.set('documento_id', docRec.id)
      itRec.set('item', itD.item)
      if (itD.produto_id) itRec.set('produto_id', itD.produto_id)
      itRec.set('codigo', itD.codigo)
      itRec.set('descricao', itD.descricao)
      itRec.set('ncm', itD.ncm)
      itRec.set('cest', itD.cest)
      itRec.set('cfop', itD.cfop)
      itRec.set('unidade', itD.unidade)
      itRec.set('quantidade', itD.quantidade)
      itRec.set('valor_unitario', itD.valor_unitario)
      itRec.set('valor_bruto', itD.valor_bruto)
      itRec.set('valor_total', itD.valor_total)
      itRec.set('origem', itD.origem)
      itRec.set('cst_icms', itD.cst_icms)
      itRec.set('csosn', itD.csosn)
      itRec.set('base_icms', itD.base_icms)
      itRec.set('aliquota_icms', itD.aliquota_icms)
      itRec.set('valor_icms', itD.valor_icms)
      itRec.set('base_icms_st', itD.base_icms_st)
      itRec.set('aliquota_icms_st', itD.aliquota_icms_st)
      itRec.set('valor_icms_st', itD.valor_icms_st)
      itRec.set('valor_ipi', itD.valor_ipi)
      itRec.set('custo_unitario', itD.custo_unitario)
      $app.save(itRec)
    }

    // Marcar a devolução com status 'Pendente de nota'
    devolucaoRec.set('status', 'Pendente de nota')
    devolucaoRec.set('documento_fiscal_status', 'Processando')
    devolucaoRec.set('documento_fiscal_id', docRec.id)
    $app.save(devolucaoRec)

    // Transmitir para Focus NFe: POST /nfe?ref={ref}
    const urlEnvio = `${baseUrl}/nfe?ref=${encodeURIComponent(refFocus)}`
    const authHeader = 'Basic ' + encodeBase64(token + ':')

    let resFocus = null
    try {
      resFocus = $http.send({
        method: 'POST',
        url: urlEnvio,
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadFocus),
        timeout: 60,
      })
    } catch (errHttp) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com o servidor da Focus NFe.',
      })
    }

    const statusCode = resFocus.statusCode || 200
    const rawText = resFocus.raw || ''
    let jsonResp = null
    try {
      jsonResp = JSON.parse(rawText)
    } catch (_) {}

    docRec.set('json_retorno', jsonResp || { raw: rawText })

    if (statusCode >= 400) {
      let msgErro =
        jsonResp?.mensagem || jsonResp?.message || `Focus NFe retornou status HTTP ${statusCode}`
      if (Array.isArray(jsonResp?.erros) && jsonResp.erros.length > 0) {
        msgErro = jsonResp.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }
      docRec.set('status', 'Rejeitada')
      docRec.set('mensagem_sefaz', msgErro)
      docRec.set('erros', jsonResp?.erros || [{ mensagem: msgErro }])
      $app.save(docRec)

      devolucaoRec.set('status', 'Pendente de nota')
      devolucaoRec.set('documento_fiscal_status', 'Rejeitada')
      devolucaoRec.set('motivo_cancelamento', msgErro)
      $app.save(devolucaoRec)

      return c.json(200, {
        sucesso: false,
        status: 'Rejeitada',
        documento_id: docRec.id,
        ref: refFocus,
        message: msgErro,
      })
    }

    docRec.set('status', 'Processando')
    docRec.set('status_sefaz', jsonResp?.status || 'processando_autorizacao')
    docRec.set(
      'mensagem_sefaz',
      jsonResp?.mensagem_sefaz || 'Nota fiscal transmitida para a SEFAZ. Aguardando autorização.',
    )
    $app.save(docRec)

    return c.json(200, {
      sucesso: true,
      status: 'Processando',
      documento_id: docRec.id,
      referencia: refFocus,
      total_devolvido: totValorTotal,
      message: 'NF-e de devolução transmitida com sucesso para a SEFAZ. Aguarde a autorização.',
    })
  },
  $apis.requireAuth(),
)

// =========================================================================
// 2) CONFIRMAR AUTORIZAÇÃO DE DEVOLUÇÃO DE VENDA (ESTOQUE E FINANCEIRO)
// =========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/confirmar-autorizacao-devolucao-venda',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    const devolucaoId = data.devolucao_id || data.venda_devolucao_id
    const documentoId = data.documento_id
    const destino = data.destino || 'vale_troca' // 'vale_troca' | 'dinheiro_volta' | 'abater_crediario'
    const diasValidadeVale = Number(data.dias_validade_vale) || 30
    const contaFinanceiraId = data.conta_financeira_id || ''

    if (!devolucaoId || !documentoId) {
      return c.json(400, {
        sucesso: false,
        message: 'devolucao_id e documento_id são obrigatórios.',
      })
    }

    const docRec = $app.findRecordById('documentos_fiscais', documentoId)
    if (!docRec || docRec.getString('status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message:
          'Apenas notas de devolução de venda com status Autorizada podem movimentar estoque e financeiro.',
      })
    }

    const devolucaoRec = $app.findRecordById('vendas', devolucaoId)
    if (!devolucaoRec || !devolucaoRec.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Devolução não encontrada.' })
    }

    // Se já foi finalizada, retorno idempotente
    if (devolucaoRec.getString('status') === 'Finalizada') {
      return c.json(200, {
        sucesso: true,
        message: 'A devolução já estava finalizada.',
      })
    }

    const empresaId = devolucaoRec.getString('empresa_id')
    const vendaOrigemId = devolucaoRec.getString('venda_origem_id')
    const docNumero = docRec.getInt('numero') || docRec.getString('referencia')
    const dataHojeIso = new Date().toISOString().slice(0, 10)
    const valorTotalDevolucao = devolucaoRec.getFloat('valor_total') || 0

    let valeCodigoGerado = ''

    try {
      $app.runInTransaction((txApp) => {
        // 1. Carregar itens da devolução
        const itensDev = txApp.findRecordsByFilter(
          'vendas_itens',
          `venda_id = '${devolucaoId}' && ativo = true`,
          'item',
        )

        // 2. Movimentar estoque: entrada com origem DEVOLUCAO_VENDA
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')

        for (let it of itensDev) {
          const prodId = it.getString('produto_id')
          const qtd = it.getFloat('quantidade') || 0
          const custoUn = it.getFloat('custo_unitario') || it.getFloat('preco_unitario') || 0

          if (!prodId || qtd <= 0) continue

          const saldos = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
            '',
            1,
            0,
          )

          let saldoRec = null
          let saldoAnt = 0
          let custoMedioAnt = custoUn

          if (saldos.length > 0) {
            saldoRec = saldos[0]
            saldoAnt = saldoRec.getFloat('quantidade') || 0
            custoMedioAnt = saldoRec.getFloat('custo_medio') || custoUn
          } else {
            saldoRec = new Record(saldosCol)
            saldoRec.set('empresa_id', empresaId)
            saldoRec.set('produto_id', prodId)
            saldoRec.set('quantidade', 0)
            saldoRec.set('custo_medio', custoUn)
            saldoRec.set('valor_total', 0)
            saldoRec.set('ativo', true)
          }

          const saldoPos = saldoAnt + qtd
          saldoRec.set('quantidade', saldoPos)
          saldoRec.set('valor_total', saldoPos * custoMedioAnt)
          saldoRec.set('updated_by', userId)
          txApp.save(saldoRec)

          const movRec = new Record(movsCol)
          movRec.set('empresa_id', empresaId)
          movRec.set('produto_id', prodId)
          movRec.set('tipo', 'Entrada')
          movRec.set('origem', 'DEVOLUCAO_VENDA')
          movRec.set('quantidade', qtd)
          movRec.set('custo_unitario', custoUn)
          movRec.set('valor_total', Math.round(qtd * custoUn * 100) / 100)
          movRec.set('saldo_anterior', saldoAnt)
          movRec.set('saldo_posterior', saldoPos)
          movRec.set('custo_medio_anterior', custoMedioAnt)
          movRec.set('custo_medio_posterior', custoMedioAnt)
          movRec.set('documento_tipo', 'NF-e Devolução')
          movRec.set('documento_id', docRec.id)
          movRec.set('documento_numero', String(docNumero))
          movRec.set(
            'motivo',
            `Entrada por Devolução de Venda #${devolucaoRec.getInt('numero') || devolucaoId} (NF-e nº ${docNumero})`,
          )
          movRec.set('usuario_id', userId)
          movRec.set('estornado', false)
          movRec.set('ativo', true)
          txApp.save(movRec)
        }

        // 3. Atualizar quantidade_devolvida nos itens da venda original
        if (vendaOrigemId) {
          const itensOrig = txApp.findRecordsByFilter(
            'vendas_itens',
            `venda_id = '${vendaOrigemId}' && ativo = true`,
          )
          const mapaOrigPorProd = new Map()
          for (let itO of itensOrig) {
            mapaOrigPorProd.set(itO.getString('produto_id'), itO)
          }

          for (let itD of itensDev) {
            const pId = itD.getString('produto_id')
            const itO = mapaOrigPorProd.get(pId)
            if (itO) {
              const qtdAtualDev = itO.getFloat('quantidade_devolvida') || 0
              const qtdNova = qtdAtualDev + (itD.getFloat('quantidade') || 0)
              itO.set('quantidade_devolvida', qtdNova)
              txApp.save(itO)
            }
          }
        }

        // 4. Processar Destino Financeiro
        if (destino === 'vale_troca') {
          const dtVal = new Date()
          dtVal.setDate(dtVal.getDate() + diasValidadeVale)
          const valIso = dtVal.toISOString().slice(0, 10)

          const valesCol = txApp.findCollectionByNameOrId('vales_troca')
          const novoVale = new Record(valesCol)
          const randomSuffix = Math.floor(1000 + Math.random() * 9000)
          valeCodigoGerado = `VALE-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`

          novoVale.set('empresa_id', empresaId)
          novoVale.set('codigo', valeCodigoGerado)
          if (devolucaoRec.getString('cliente_id')) {
            novoVale.set('cliente_id', devolucaoRec.getString('cliente_id'))
          }
          novoVale.set('valor', valorTotalDevolucao)
          novoVale.set('saldo', valorTotalDevolucao)
          novoVale.set('validade', valIso)
          novoVale.set('venda_origem_id', vendaOrigemId || devolucaoId)
          novoVale.set('status', 'Ativo')
          novoVale.set(
            'observacao',
            `Gerado pela devolução #${devolucaoRec.getInt('numero')} com NF-e #${docNumero}`,
          )
          novoVale.set('ativo', true)
          txApp.save(novoVale)
        } else if (destino === 'dinheiro_volta') {
          let planoDevolucaoId = ''
          try {
            const contas = txApp.findRecordsByFilter(
              'plano_contas',
              "codigo = '2.2.05' && ativo = true",
              '',
              1,
              0,
            )
            if (contas.length > 0) planoDevolucaoId = contas[0].id
          } catch (_) {}

          let contaFinIdFinal = contaFinanceiraId
          if (!contaFinIdFinal) {
            const cfs = txApp.findRecordsByFilter(
              'contas_financeiras',
              `empresa_id = '${empresaId}' && ativo = true`,
              '-saldo_atual',
              1,
              0,
            )
            if (cfs.length > 0) contaFinIdFinal = cfs[0].id
          }

          if (contaFinIdFinal) {
            const movFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
            const movFin = new Record(movFinCol)
            movFin.set('empresa_id', empresaId)
            movFin.set('conta_financeira_id', contaFinIdFinal)
            movFin.set('tipo', 'Saída')
            movFin.set('data_movimento', dataHojeIso)
            movFin.set('valor', valorTotalDevolucao)
            if (planoDevolucaoId) movFin.set('plano_conta_id', planoDevolucaoId)
            movFin.set(
              'historico',
              `Devolução em dinheiro NF-e #${docNumero} (Devolução #${devolucaoRec.getInt('numero')})`,
            )
            movFin.set('origem', 'Devolucao')
            movFin.set('origem_id', devolucaoId)
            movFin.set('conciliado', false)
            movFin.set('ativo', true)
            txApp.save(movFin)

            // Atualizar saldo da conta financeira
            try {
              const cfRec = txApp.findRecordById('contas_financeiras', contaFinIdFinal)
              if (cfRec) {
                const sAtual = cfRec.getFloat('saldo_atual') || 0
                cfRec.set('saldo_atual', sAtual - valorTotalDevolucao)
                txApp.save(cfRec)
              }
            } catch (_) {}
          }
        } else if (destino === 'abater_crediario' && vendaOrigemId) {
          const titulosAbertos = txApp.findRecordsByFilter(
            'contas_receber',
            `empresa_id = '${empresaId}' && origem_id = '${vendaOrigemId}' && (status = 'Aberto' || status = 'Parcial') && ativo = true`,
            'data_vencimento',
          )

          let saldoParaAbater = valorTotalDevolucao
          for (let tit of titulosAbertos) {
            if (saldoParaAbater <= 0.009) break
            const saldoTit = tit.getFloat('saldo') || 0
            if (saldoTit <= 0) continue

            const valorAbateItem = Math.min(saldoParaAbater, saldoTit)
            saldoParaAbater = Math.round((saldoParaAbater - valorAbateItem) * 100) / 100

            const novoSaldo = Math.round((saldoTit - valorAbateItem) * 100) / 100
            tit.set('saldo', novoSaldo)
            if (novoSaldo <= 0.005) {
              tit.set('status', 'Recebido')
            } else {
              tit.set('status', 'Parcial')
            }
            tit.set(
              'observacao',
              `${tit.getString('observacao') || ''}\nAbatimento por devolução NF-e #${docNumero}: R$ ${valorAbateItem.toFixed(2)}`,
            )
            txApp.save(tit)
          }
        }

        // 5. Finalizar a venda de devolução
        devolucaoRec.set('status', 'Finalizada')
        devolucaoRec.set('documento_fiscal_status', 'Autorizada')
        devolucaoRec.set('documento_fiscal_id', docRec.id)
        devolucaoRec.set('data_finalizacao', new Date().toISOString())
        txApp.save(devolucaoRec)
      })

      return c.json(200, {
        sucesso: true,
        vale_troca_codigo: valeCodigoGerado || undefined,
        message: 'Devolução autorizada: estoque e financeiro movimentados com sucesso.',
      })
    } catch (errTx) {
      return c.json(400, {
        sucesso: false,
        message:
          'Erro ao processar movimentações de estoque/financeiro da devolução: ' + errTx.message,
      })
    }
  },
  $apis.requireAuth(),
)
