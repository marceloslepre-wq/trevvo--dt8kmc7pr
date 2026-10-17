// @ts-check
/// <reference path="../types.d.ts" />

/**
 * SERVIÇO DE EMISSÃO, PROCESSAMENTO, CONSULTA, CANCELAMENTO E CC-E DE NF-E (MODELO 55)
 *
 * Endpoints:
 * - POST /backend/v1/fiscal/emitir-nfe-venda
 * - POST /backend/v1/fiscal/consultar-situacao-nfe
 * - POST /backend/v1/fiscal/cancelar-nfe
 * - POST /backend/v1/fiscal/carta-correcao-nfe
 *
 * Regras:
 * - A nota sai SEMPRE pela empresa da venda (empresa_id do documento), com o token, série e ambiente da filial emitente.
 * - Emissão de NF-e é assíncrona na Focus NFe: fica inicialmente "Processando" com status_sefaz "processando_autorizacao".
 * - O endpoint `emitir-nfe-venda` ou `consultar-situacao-nfe` atualizam status, número, chave, protocolo, danfe_url e baixam o XML.
 * - Ao autorizar: documento_fiscal_status "Autorizada", documento_fiscal_id na venda.
 * - Rejeitada: status "Rejeitada", status_sefaz com motivo.
 * - Denegada: status "Denegada", aviso específico para situação cadastral do cliente.
 * - Cancelamento: permissão excluir em notas_saida, justificativa de 15 a 255 chars, grava xml_cancelamento.
 * - Carta de Correção (CC-e): 15 a 1000 caracteres, salva sequencial na tabela documentos_fiscais_cartas com XML e PDF.
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe-venda',
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

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    const vendaId = data.venda_id

    if (!vendaId) {
      return c.json(400, { sucesso: false, message: 'Campo venda_id é obrigatório.' })
    }

    // 1. Carregar venda
    let venda = null
    try {
      venda = $app.findRecordById('vendas', vendaId)
    } catch (_) {
      venda = null
    }

    if (!venda || !venda.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Venda não encontrada ou inativa.' })
    }

    const statusVenda = venda.getString('status')
    if (statusVenda !== 'Finalizada') {
      return c.json(400, {
        sucesso: false,
        message: 'A emissão de NF-e só é permitida para vendas Finalizadas.',
      })
    }

    const docFiscalStatusAtual = venda.getString('documento_fiscal_status')

    // Checar se já existe NFC-e autorizada não cancelada
    const nfceExistentes = $app.findRecordsByFilter(
      'documentos_fiscais',
      `venda_id = '${vendaId}' && modelo = '65' && status = 'Autorizada'`,
      '-created',
      1,
      0,
    )
    if (nfceExistentes.length > 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Esta venda já possui uma NFC-e autorizada. Cancele a NFC-e antes de emitir NF-e.',
      })
    }

    // Checar se já tem NF-e autorizada
    const nfeExistentes = $app.findRecordsByFilter(
      'documentos_fiscais',
      `venda_id = '${vendaId}' && modelo = '55'`,
      '-created',
      1,
      0,
    )
    if (nfeExistentes.length > 0) {
      const docNfe = nfeExistentes[0]
      if (docNfe.getString('status') === 'Autorizada') {
        return c.json(200, {
          sucesso: true,
          ja_autorizada: true,
          status: 'Autorizada',
          message: 'A NF-e desta venda já está Autorizada.',
          documento_id: docNfe.id,
          chave: docNfe.getString('chave_acesso'),
          danfe_url: docNfe.getString('danfe_url'),
        })
      }
    }

    const empresaId = venda.getString('empresa_id')
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      empresa = null
    }

    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, {
        sucesso: false,
        message: 'Empresa emitente da venda não encontrada ou inativa.',
      })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'

    // 2. Carregar configuração fiscal
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
        message: `Esta empresa (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]
    if (!config.getBool('emite_documentos_fiscais')) {
      return c.json(400, {
        sucesso: false,
        message: `A empresa (${nomeEmpresa}) não está configurada para emitir documentos fiscais.`,
      })
    }

    const ie = (empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      return c.json(400, {
        sucesso: false,
        message: `A empresa (${nomeEmpresa}) possui Inscrição Estadual ${ie || 'vazia'} e não pode emitir NF-e.`,
      })
    }

    const ambiente = config.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (config.getString('codigo_token') || '').trim().toUpperCase()
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
        message: `Token da Focus NFe não encontrado para ${nomeEmpresa}: crie o segredo ${nomeSegredo} no Skip Cloud.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOrigin =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    // 3. Montar ou obter o rascunho com os parâmetros fornecidos pela janela de conferência
    let docRec = null
    let refFocus = ''
    let payloadFocus = null

    try {
      const resRasc = $http.send({
        method: 'POST',
        url: 'http://127.0.0.1:8090/backend/v1/fiscal/montar-rascunho',
        headers: {
          Authorization: c.requestInfo().headers['authorization'] || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelo: '55',
          origem: 'Venda',
          id: vendaId,
          natureza_operacao: data.natureza_operacao,
          presenca_comprador: data.presenca_comprador,
          modalidade_frete: data.modalidade_frete,
          transportadora_id: data.transportadora_id,
          volumes_quantidade: data.volumes_quantidade,
          volumes_especie: data.volumes_especie,
          peso_bruto: data.peso_bruto,
          peso_liquido: data.peso_liquido,
          informacoes_complementares: data.informacoes_complementares,
          tipo_intermediador: data.tipo_intermediador,
          intermediador_id: data.intermediador_id,
          identificador_intermediador: data.identificador_intermediador,
        }),
        timeout: 30,
      })
      const rJson = JSON.parse(resRasc.raw || '{}')
      if (rJson && rJson.sucesso && rJson.json_focus) {
        payloadFocus = rJson.json_focus
        if (rJson.documento && rJson.documento.referencia) {
          refFocus = rJson.documento.referencia
        }
        if (rJson.documento_id) {
          docRec = $app.findRecordById('documentos_fiscais', rJson.documento_id)
        }
      } else {
        return c.json(400, {
          sucesso: false,
          message: rJson.message || 'Falha ao validar e estruturar a NF-e.',
          pendencias: rJson.pendencias || [],
        })
      }
    } catch (eMontar) {
      console.warn('Erro ao chamar montar-rascunho internamente:', eMontar)
      return c.json(400, {
        sucesso: false,
        message: 'Não foi possível estruturar os dados fiscais da venda.',
      })
    }

    if (!payloadFocus || !docRec) {
      return c.json(400, {
        sucesso: false,
        message: 'Dados fiscais da NF-e não puderam ser carregados.',
      })
    }

    // 4. Enviar NF-e para Focus NFe: POST /nfe?ref={ref}
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
    } catch (errEnvio) {
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

    // A NF-e na Focus é assíncrona. Retorno esperado: 202 com status "processando_autorizacao"
    const statusFocus = jsonResp?.status || ''
    const statusSefaz = jsonResp?.status_sefaz || ''

    docRec.set('json_enviado', payloadFocus)
    docRec.set('json_retorno', jsonResp || { raw: rawText })
    docRec.set('usuario_emissao_id', userId)

    // Se houve erro imediato na requisição
    if (statusCode >= 400) {
      let msgErro =
        jsonResp?.mensagem || jsonResp?.message || `Focus NFe retornou status HTTP ${statusCode}`
      if (Array.isArray(jsonResp?.erros) && jsonResp.erros.length > 0) {
        msgErro = jsonResp.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }
      docRec.set('status', 'Rejeitada')
      docRec.set('status_sefaz', 'Rejeição')
      docRec.set('mensagem_sefaz', msgErro)
      docRec.set('erros', jsonResp?.erros || [{ mensagem: msgErro }])
      $app.save(docRec)

      venda.set('documento_fiscal_status', 'Rejeitada')
      venda.set('documento_fiscal_id', docRec.id)
      $app.save(venda)

      return c.json(200, {
        sucesso: false,
        status: 'Rejeitada',
        documento_id: docRec.id,
        ref: refFocus,
        message: msgErro,
        detalhes: jsonResp || rawText,
      })
    }

    // Transmissão aceita: status inicial "Processando"
    docRec.set('status', 'Processando')
    docRec.set('status_sefaz', statusSefaz || statusFocus || 'processando_autorizacao')
    docRec.set(
      'mensagem_sefaz',
      jsonResp?.mensagem_sefaz || 'Nota fiscal transmitida para processamento na SEFAZ',
    )
    $app.save(docRec)

    venda.set('documento_fiscal_status', 'Processando')
    venda.set('documento_fiscal_id', docRec.id)
    $app.save(venda)

    // Log de auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
      const aRec = new Record(auditCol)
      aRec.set('empresa_id', empresaId)
      aRec.set('usuario_id', userId)
      aRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
      aRec.set('tabela', 'documentos_fiscais')
      aRec.set('registro_id', docRec.id)
      aRec.set('acao', 'criacao')
      aRec.set(
        'valores_depois',
        JSON.stringify({
          operacao: 'EMISSAO_NFE_TRANSMITIDA',
          venda_id: vendaId,
          referencia: refFocus,
          status: 'Processando',
        }),
      )
      $app.save(aRec)
    } catch (_) {}

    return c.json(200, {
      sucesso: true,
      status: 'Processando',
      documento_id: docRec.id,
      referencia: refFocus,
      message: 'NF-e transmitida para a SEFAZ. Aguardando autorização.',
    })
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/consultar-situacao-nfe
 * Consulta a situação da NF-e na Focus NFe e atualiza o registro no ERP.
 * Body: { documento_id: string } ou { venda_id: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/consultar-situacao-nfe',
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

    const data = c.requestInfo().body || {}
    let documentoId = data.documento_id
    const vendaId = data.venda_id

    let docRec = null
    if (documentoId) {
      try {
        docRec = $app.findRecordById('documentos_fiscais', documentoId)
      } catch (_) {}
    } else if (vendaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `venda_id = '${vendaId}' && modelo = '55'`,
        '-created',
        1,
        0,
      )
      if (docs && docs.length > 0) docRec = docs[0]
    }

    if (!docRec) {
      return c.json(400, { sucesso: false, message: 'Documento fiscal não encontrado.' })
    }

    documentoId = docRec.id
    const empresaId = docRec.getString('empresa_id')
    const refFocus = docRec.getString('referencia')
    const modelo = docRec.getString('modelo') || '55'

    // Carregar config fiscal
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

    const config = configs[0]
    const ambiente = config.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (config.getString('codigo_token') || '').trim().toUpperCase()
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
        message: `Token da Focus NFe não encontrado: configure o segredo ${nomeSegredo}.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOrigin =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const url = `${baseUrl}/${endpoint}/${encodeURIComponent(refFocus)}?completa=1`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    let res = null
    try {
      res = $http.send({
        method: 'GET',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
        },
        timeout: 60,
      })
    } catch (err) {
      return c.json(500, { sucesso: false, message: 'Sem comunicação com a API da Focus NFe.' })
    }

    const statusCode = res.statusCode || 200
    const rawText = res.raw ? res.raw : ''
    let respJson = null
    try {
      respJson = JSON.parse(rawText)
    } catch (_) {}

    if (statusCode === 404) {
      return c.json(200, {
        sucesso: false,
        status: 'NaoEncontrada',
        message: 'Nota fiscal não encontrada na Focus NFe para esta referência.',
      })
    }

    const statusFocus = respJson?.status || ''
    const statusSefaz = respJson?.status_sefaz || ''
    const motivoSefaz = respJson?.mensagem_sefaz || respJson?.mensagem || ''

    let vendaRec = null
    const vId = docRec.getString('venda_id')
    if (vId) {
      try {
        vendaRec = $app.findRecordById('vendas', vId)
      } catch (_) {}
    }

    // 1) AUTORIZADO
    if (
      statusFocus === 'autorizado' ||
      (statusCode === 200 && respJson?.chave_nfe && !statusFocus.includes('erro'))
    ) {
      const numeroNota = Number(respJson?.numero) || undefined
      const serieNota = respJson?.serie
        ? String(respJson.serie)
        : config.getString('serie_nfe') || '1'
      const chaveNota = respJson?.chave_nfe || respJson?.chave || ''
      const protocoloNota = respJson?.protocolo || ''
      const danfeUrl =
        respJson?.danfe_url ||
        (respJson?.caminho_danfe ? `${baseUrlOrigin}${respJson.caminho_danfe}` : '')

      docRec.set('status', 'Autorizada')
      if (numeroNota) docRec.set('numero', numeroNota)
      if (serieNota) docRec.set('serie', serieNota)
      if (chaveNota) docRec.set('chave_acesso', chaveNota)
      if (protocoloNota) docRec.set('protocolo', protocoloNota)
      if (danfeUrl) docRec.set('danfe_url', danfeUrl)
      docRec.set('data_autorizacao', new Date().toISOString())
      docRec.set('status_sefaz', statusSefaz || '100')
      docRec.set('mensagem_sefaz', motivoSefaz || 'Autorizado o uso da NF-e')
      docRec.set('json_retorno', respJson)

      // Baixar XML autorizado e anexar
      const caminhoXml = respJson?.caminho_xml_nota_fiscal || respJson?.xml_url || ''
      if (caminhoXml) {
        try {
          let urlFinalXml = caminhoXml
          if (caminhoXml.startsWith('/')) urlFinalXml = `${baseUrlOrigin}${caminhoXml}`
          const authH = 'Basic ' + encodeBase64(token + ':')
          const resXml = $http.send({
            method: 'GET',
            url: urlFinalXml,
            headers: { Authorization: authH },
            timeout: 60,
          })
          if ((resXml.statusCode || 200) < 300 && resXml.raw) {
            const fileName = `nfe_${refFocus}.xml`
            const fileUpload = $filesystem.fileFromBytes(Buffer.from(resXml.raw, 'utf-8'), fileName)
            docRec.set('xml_arquivo', fileUpload)
          }
        } catch (errXml) {
          console.warn('Erro ao baixar/gravar XML da NF-e:', errXml)
        }
      }

      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Autorizada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }

      return c.json(200, {
        sucesso: true,
        status: 'Autorizada',
        documento_id: docRec.id,
        numero: numeroNota,
        serie: serieNota,
        chave: chaveNota,
        protocolo: protocoloNota,
        danfe_url: danfeUrl,
        message: 'NF-e autorizada com sucesso pela SEFAZ.',
      })
    }

    // 2) ERRO_AUTORIZACAO / REJEITADA
    if (statusFocus === 'erro_autorizacao' || statusFocus === 'rejeitado') {
      let motivoRejeicao = motivoSefaz || 'Nota fiscal rejeitada pela SEFAZ'
      if (Array.isArray(respJson?.erros) && respJson.erros.length > 0) {
        motivoRejeicao = respJson.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }

      docRec.set('status', 'Rejeitada')
      docRec.set('status_sefaz', statusSefaz || 'Rejeição')
      docRec.set('mensagem_sefaz', motivoRejeicao)
      docRec.set('erros', respJson?.erros || [{ mensagem: motivoRejeicao }])
      docRec.set('json_retorno', respJson)
      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Rejeitada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }

      return c.json(200, {
        sucesso: false,
        status: 'Rejeitada',
        documento_id: docRec.id,
        message: motivoRejeicao,
        detalhes: respJson,
      })
    }

    // 3) DENEGADA (código 110, 301, 302, 303 da SEFAZ ou status 'denegado')
    if (
      statusFocus === 'denegado' ||
      statusSefaz === '110' ||
      statusSefaz === '301' ||
      statusSefaz === '302' ||
      statusSefaz === '303'
    ) {
      const motivoDenegacao =
        motivoSefaz ||
        'Uso denegado pela SEFAZ (irregularidade fiscal do emitente ou destinatário). Nota não pode ser reutilizada.'

      docRec.set('status', 'Denegada')
      docRec.set('status_sefaz', statusSefaz || 'Denegada')
      docRec.set('mensagem_sefaz', motivoDenegacao)
      docRec.set('json_retorno', respJson)
      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Denegada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }

      return c.json(200, {
        sucesso: false,
        status: 'Denegada',
        documento_id: docRec.id,
        message: motivoDenegacao,
        aviso:
          'Nota denegada não pode ser reutilizada nem cancelada. Verifique a situação cadastral do cliente no Sintegra/CCC.',
      })
    }

    // 4) CANCELADA
    if (statusFocus === 'cancelado') {
      docRec.set('status', 'Cancelada')
      docRec.set('mensagem_sefaz', motivoSefaz || 'NF-e cancelada')
      docRec.set('json_retorno', respJson)
      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Cancelada')
        $app.save(vendaRec)
      }

      return c.json(200, {
        sucesso: true,
        status: 'Cancelada',
        documento_id: docRec.id,
        message: 'A NF-e está cancelada na SEFAZ.',
      })
    }

    // 5) AINDA PROCESSANDO
    docRec.set('status', 'Processando')
    docRec.set('status_sefaz', statusSefaz || statusFocus || 'processando_autorizacao')
    docRec.set('mensagem_sefaz', motivoSefaz || 'Processando autorização na SEFAZ')
    docRec.set('json_retorno', respJson)
    $app.save(docRec)

    return c.json(200, {
      sucesso: true,
      status: 'Processando',
      documento_id: docRec.id,
      message: 'NF-e ainda em processamento na SEFAZ.',
    })
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/cancelar-nfe
 * Body: { documento_id?: string, venda_id?: string, justificativa: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/cancelar-nfe',
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

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    let documentoId = data.documento_id
    const vendaId = data.venda_id
    const justificativa = (data.justificativa || '').trim()

    if (!justificativa || justificativa.length < 15 || justificativa.length > 255) {
      return c.json(400, {
        sucesso: false,
        message: 'A justificativa de cancelamento deve ter entre 15 e 255 caracteres.',
      })
    }

    // Permissão: excluir em notas_saida
    let podeExcluir = false
    try {
      let callerUser = null
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
        if (perfilRec && perfilRec.getBool('ativo')) {
          if (perfilRec.getBool('administrador')) {
            podeExcluir = true
          } else {
            const perms = $app.findRecordsByFilter(
              'permissoes',
              `perfil_id = '${perfilRec.id}' && modulo = 'notas_saida' && pode_excluir = true && ativo = true`,
              '',
              1,
              0,
            )
            if (perms && perms.length > 0) podeExcluir = true
          }
        }
      }
    } catch (_) {}

    if (!podeExcluir) {
      return c.json(403, {
        sucesso: false,
        message: 'Acesso negado: permissão excluir no módulo notas_saida é obrigatória.',
      })
    }

    let docRec = null
    if (documentoId) {
      try {
        docRec = $app.findRecordById('documentos_fiscais', documentoId)
      } catch (_) {}
    } else if (vendaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `venda_id = '${vendaId}' && status = 'Autorizada' && modelo = '55'`,
        '-created',
        1,
        0,
      )
      if (docs && docs.length > 0) docRec = docs[0]
    }

    if (!docRec || docRec.getString('status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message: 'Nenhuma NF-e autorizada encontrada para efetuar cancelamento.',
      })
    }

    const empresaId = docRec.getString('empresa_id')
    const refFocus = docRec.getString('referencia')

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

    const config = configs[0]
    const ambiente = config.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (config.getString('codigo_token') || '').trim().toUpperCase()
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
        message: `Token da Focus NFe não encontrado: configure o segredo ${nomeSegredo}.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOrigin =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    // Chamar Focus DELETE /nfe/{ref}
    const url = `${baseUrl}/nfe/${encodeURIComponent(refFocus)}`
    const authHeader = 'Basic ' + encodeBase64(token + ':')

    let resFocus = null
    try {
      resFocus = $http.send({
        method: 'DELETE',
        url: url,
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ justificativa }),
        timeout: 60,
      })
    } catch (errFocus) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a Focus NFe para efetuar o cancelamento.',
      })
    }

    const statusCode = resFocus.statusCode || 200
    const rawText = resFocus.raw ? resFocus.raw : ''
    let jsonResp = null
    try {
      jsonResp = JSON.parse(rawText)
    } catch (_) {}

    const statusRetorno = jsonResp?.status || ''
    const canceladoComSucesso =
      statusCode >= 200 &&
      statusCode < 300 &&
      (statusRetorno === 'cancelado' ||
        statusRetorno === 'sucesso' ||
        jsonResp?.caminho_xml_cancelamento ||
        jsonResp?.status_sefaz === '101' ||
        jsonResp?.status_sefaz === '135' ||
        jsonResp?.status_sefaz === '155')

    if (!canceladoComSucesso) {
      let msgErro =
        jsonResp?.mensagem_sefaz ||
        jsonResp?.mensagem ||
        jsonResp?.message ||
        `Focus NFe retornou status HTTP ${statusCode}`
      if (Array.isArray(jsonResp?.erros) && jsonResp.erros.length > 0) {
        msgErro = jsonResp.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }

      const prazoExpirado =
        msgErro.toLowerCase().includes('prazo') ||
        msgErro.toLowerCase().includes('fora do prazo') ||
        jsonResp?.status_sefaz === '151' ||
        jsonResp?.status_sefaz === '501'

      if (prazoExpirado) {
        msgErro +=
          '. O prazo legal de cancelamento da SEFAZ (24 horas) expirou. Para anular a operação, emita uma Nota Fiscal de Devolução.'
      }

      return c.json(400, {
        sucesso: false,
        message: msgErro,
        prazo_expirado: prazoExpirado,
        detalhes: jsonResp || rawText,
      })
    }

    // Gravar cancelamento no ERP
    const dataCancelamento = new Date().toISOString()
    docRec.set('status', 'Cancelada')
    docRec.set('motivo_cancelamento', justificativa)
    docRec.set('data_cancelamento', dataCancelamento)
    docRec.set('usuario_cancelamento_id', userId)

    const caminhoXmlCanc = jsonResp?.caminho_xml_cancelamento || ''
    if (caminhoXmlCanc) {
      try {
        let urlFinalXmlCanc = caminhoXmlCanc
        if (caminhoXmlCanc.startsWith('/')) urlFinalXmlCanc = `${baseUrlOrigin}${caminhoXmlCanc}`
        const authHCanc = 'Basic ' + encodeBase64(token + ':')
        const resCancXml = $http.send({
          method: 'GET',
          url: urlFinalXmlCanc,
          headers: { Authorization: authHCanc },
          timeout: 60,
        })
        if ((resCancXml.statusCode || 200) < 300 && resCancXml.raw) {
          const fileName = `cancelamento_nfe_${refFocus}.xml`
          const fileUpload = $filesystem.fileFromBytes(
            Buffer.from(resCancXml.raw, 'utf-8'),
            fileName,
          )
          docRec.set('xml_cancelamento', fileUpload)
        }
      } catch (errXml) {
        console.warn('Erro ao salvar XML de cancelamento da NF-e:', errXml)
      }
    }

    $app.save(docRec)

    // Atualizar venda
    const vIdDoc = docRec.getString('venda_id')
    if (vIdDoc) {
      try {
        const vRec = $app.findRecordById('vendas', vIdDoc)
        vRec.set('documento_fiscal_status', 'Cancelada')
        $app.save(vRec)
      } catch (_) {}
    }

    // Auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
      const aRec = new Record(auditCol)
      aRec.set('empresa_id', empresaId)
      aRec.set('usuario_id', userId)
      aRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
      aRec.set('tabela', 'documentos_fiscais')
      aRec.set('registro_id', docRec.id)
      aRec.set('acao', 'inativacao')
      aRec.set(
        'valores_depois',
        JSON.stringify({
          operacao: 'CANCELAMENTO_NFE_AUTORIZADO',
          justificativa: justificativa,
          data: dataCancelamento,
        }),
      )
      $app.save(aRec)
    } catch (_) {}

    return c.json(200, {
      sucesso: true,
      message: 'NF-e cancelada com sucesso na SEFAZ.',
      documento_id: docRec.id,
    })
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/carta-correcao-nfe
 * Emite CC-e para NF-e autorizada e registra na tabela documentos_fiscais_cartas.
 * Body: { documento_id?: string, venda_id?: string, texto: string }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/carta-correcao-nfe',
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

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    let documentoId = data.documento_id
    const vendaId = data.venda_id
    const textoCorrecao = (data.texto || '').trim()

    if (!textoCorrecao || textoCorrecao.length < 15 || textoCorrecao.length > 1000) {
      return c.json(400, {
        sucesso: false,
        message: 'O texto da Carta de Correção deve ter entre 15 e 1000 caracteres.',
      })
    }

    let docRec = null
    if (documentoId) {
      try {
        docRec = $app.findRecordById('documentos_fiscais', documentoId)
      } catch (_) {}
    } else if (vendaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `venda_id = '${vendaId}' && status = 'Autorizada' && modelo = '55'`,
        '-created',
        1,
        0,
      )
      if (docs && docs.length > 0) docRec = docs[0]
    }

    if (!docRec || docRec.getString('status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message: 'Apenas NF-e autorizada pode receber Carta de Correção.',
      })
    }

    documentoId = docRec.id
    const empresaId = docRec.getString('empresa_id')
    const refFocus = docRec.getString('referencia')

    // Carregar config fiscal
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

    const config = configs[0]
    const ambiente = config.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (config.getString('codigo_token') || '').trim().toUpperCase()
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
        message: `Token da Focus NFe não encontrado: configure o segredo ${nomeSegredo}.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOrigin =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    // Calcular sequência da carta para este documento
    const cartasExistentes = $app.findRecordsByFilter(
      'documentos_fiscais_cartas',
      `documento_id = '${documentoId}'`,
      '-sequencia',
      1,
      0,
    )
    let proximaSequencia = 1
    if (cartasExistentes && cartasExistentes.length > 0) {
      proximaSequencia = (cartasExistentes[0].getInt('sequencia') || 1) + 1
    }

    // Chamar Focus NFe: POST /nfe/{ref}/carta_correcao com { correcao }
    const url = `${baseUrl}/nfe/${encodeURIComponent(refFocus)}/carta_correcao`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    let resFocus = null
    try {
      resFocus = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correcao: textoCorrecao }),
        timeout: 60,
      })
    } catch (errHttp) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a Focus NFe para registrar a carta de correção.',
      })
    }

    const statusCode = resFocus.statusCode || 200
    const rawText = resFocus.raw ? resFocus.raw : ''
    let jsonResp = null
    try {
      jsonResp = JSON.parse(rawText)
    } catch (_) {}

    const statusRetorno = jsonResp?.status || ''
    const statusSefaz = jsonResp?.status_sefaz || ''
    const cceAutorizada =
      statusCode >= 200 &&
      statusCode < 300 &&
      (statusRetorno === 'autorizado' ||
        statusRetorno === 'sucesso' ||
        statusSefaz === '135' ||
        statusSefaz === '136' ||
        jsonResp?.caminho_xml_carta_correcao ||
        jsonResp?.protocolo)

    if (!cceAutorizada) {
      let msgErro =
        jsonResp?.mensagem_sefaz ||
        jsonResp?.mensagem ||
        jsonResp?.message ||
        `Focus NFe retornou status HTTP ${statusCode}`
      if (Array.isArray(jsonResp?.erros) && jsonResp.erros.length > 0) {
        msgErro = jsonResp.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }
      return c.json(400, {
        sucesso: false,
        message: msgErro,
        detalhes: jsonResp || rawText,
      })
    }

    // Gravar na tabela documentos_fiscais_cartas
    const cartasCol = $app.findCollectionByNameOrId('documentos_fiscais_cartas')
    const cartaRec = new Record(cartasCol)
    cartaRec.set('documento_id', documentoId)
    cartaRec.set('sequencia', proximaSequencia)
    cartaRec.set('texto', textoCorrecao)
    cartaRec.set('data', new Date().toISOString())
    cartaRec.set('status', 'Autorizada')
    cartaRec.set('protocolo', jsonResp?.protocolo || '')
    cartaRec.set('mensagem_sefaz', jsonResp?.mensagem_sefaz || 'Carta de correção registrada')
    cartaRec.set('usuario_id', userId)

    const pdfUrlCce = jsonResp?.caminho_pdf_carta_correcao
      ? `${baseUrlOrigin}${jsonResp.caminho_pdf_carta_correcao}`
      : ''
    if (pdfUrlCce) {
      cartaRec.set('pdf_url', pdfUrlCce)
    }

    // Baixar XML e PDF da CC-e se disponíveis
    const caminhoXmlCce = jsonResp?.caminho_xml_carta_correcao || ''
    if (caminhoXmlCce) {
      try {
        let urlFinalXml = caminhoXmlCce
        if (caminhoXmlCce.startsWith('/')) urlFinalXml = `${baseUrlOrigin}${caminhoXmlCce}`
        const resXml = $http.send({
          method: 'GET',
          url: urlFinalXml,
          headers: { Authorization: basicAuthHeader },
          timeout: 60,
        })
        if ((resXml.statusCode || 200) < 300 && resXml.raw) {
          const fileName = `cce_${refFocus}_seq${proximaSequencia}.xml`
          const fileUpload = $filesystem.fileFromBytes(Buffer.from(resXml.raw, 'utf-8'), fileName)
          cartaRec.set('xml_arquivo', fileUpload)
        }
      } catch (eXml) {
        console.warn('Erro ao baixar XML da CC-e:', eXml)
      }
    }

    if (jsonResp?.caminho_pdf_carta_correcao) {
      try {
        let urlFinalPdf = jsonResp.caminho_pdf_carta_correcao
        if (urlFinalPdf.startsWith('/')) urlFinalPdf = `${baseUrlOrigin}${urlFinalPdf}`
        const resPdf = $http.send({
          method: 'GET',
          url: urlFinalPdf,
          headers: { Authorization: basicAuthHeader },
          timeout: 60,
        })
        if ((resPdf.statusCode || 200) < 300 && resPdf.raw) {
          const fileName = `cce_${refFocus}_seq${proximaSequencia}.pdf`
          const fileUpload = $filesystem.fileFromBytes(Buffer.from(resPdf.raw, 'utf-8'), fileName)
          cartaRec.set('pdf_arquivo', fileUpload)
        }
      } catch (ePdf) {
        console.warn('Erro ao baixar PDF da CC-e:', ePdf)
      }
    }

    $app.save(cartaRec)

    // Auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
      const aRec = new Record(auditCol)
      aRec.set('empresa_id', empresaId)
      aRec.set('usuario_id', userId)
      aRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
      aRec.set('tabela', 'documentos_fiscais_cartas')
      aRec.set('registro_id', cartaRec.id)
      aRec.set('acao', 'criacao')
      aRec.set(
        'valores_depois',
        JSON.stringify({
          operacao: 'CARTA_CORRECAO_AUTORIZADA',
          documento_id: documentoId,
          sequencia: proximaSequencia,
          texto: textoCorrecao,
        }),
      )
      $app.save(aRec)
    } catch (_) {}

    return c.json(200, {
      sucesso: true,
      message: 'Carta de Correção autorizada com sucesso na SEFAZ.',
      carta_id: cartaRec.id,
      sequencia: proximaSequencia,
      protocolo: jsonResp?.protocolo || '',
      pdf_url: pdfUrlCce,
    })
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/enviar-email-nfe
 * Envia DANFE e XML da NF-e por e-mail para o cliente e cópias informadas via Focus NFe.
 * Body: { documento_id?: string, venda_id?: string, emails: string[] }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/enviar-email-nfe',
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

    const data = c.requestInfo().body || {}
    let documentoId = data.documento_id
    const vendaId = data.venda_id
    let listaEmails = Array.isArray(data.emails) ? data.emails : []

    // Limpar e filtrar lista de emails válidos
    listaEmails = listaEmails
      .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
      .filter((e) => e.length > 3 && e.includes('@') && e.includes('.'))

    if (listaEmails.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Informe ao menos um e-mail válido para envio.',
      })
    }

    if (listaEmails.length > 10) {
      listaEmails = listaEmails.slice(0, 10)
    }

    let docRec = null
    if (documentoId) {
      try {
        docRec = $app.findRecordById('documentos_fiscais', documentoId)
      } catch (_) {}
    } else if (vendaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `venda_id = '${vendaId}' && status = 'Autorizada' && modelo = '55'`,
        '-created',
        1,
        0,
      )
      if (docs && docs.length > 0) docRec = docs[0]
    }

    if (!docRec || docRec.getString('status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message: 'Apenas NF-e autorizada pode ser enviada por e-mail.',
      })
    }

    const empresaId = docRec.getString('empresa_id')
    const refFocus = docRec.getString('referencia')

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

    const config = configs[0]
    const ambiente = config.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
    const codigoToken = (config.getString('codigo_token') || '').trim().toUpperCase()
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
        message: `Token da Focus NFe não encontrado: configure o segredo ${nomeSegredo}.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    // POST /v2/nfe/{ref}/email com { emails: [...] }
    const url = `${baseUrl}/nfe/${encodeURIComponent(refFocus)}/email`
    const basicAuthHeader = 'Basic ' + encodeBase64(token + ':')

    let resFocus = null
    try {
      resFocus = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: listaEmails }),
        timeout: 60,
      })
    } catch (errHttp) {
      return c.json(500, {
        sucesso: false,
        message: 'Sem comunicação com a Focus NFe para agendar o envio de e-mails.',
      })
    }

    const statusCode = resFocus.statusCode || 200
    const rawText = resFocus.raw ? resFocus.raw : ''
    let jsonResp = null
    try {
      jsonResp = JSON.parse(rawText)
    } catch (_) {}

    if (statusCode >= 400) {
      const msgErro =
        jsonResp?.mensagem || jsonResp?.message || `Focus NFe retornou status HTTP ${statusCode}`
      return c.json(400, {
        sucesso: false,
        message: msgErro,
        detalhes: jsonResp || rawText,
      })
    }

    return c.json(200, {
      sucesso: true,
      message: `NF-e agendada para envio por e-mail com sucesso para ${listaEmails.join(', ')}.`,
      emails: listaEmails,
    })
  },
  $apis.requireAuth(),
)
