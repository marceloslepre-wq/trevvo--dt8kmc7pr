/**
 * fiscal_webhook_focus.js
 *
 * Gerenciamento de Webhook da Focus NFe e reenvio de documentos fiscais
 * ATENÇÃO JSVM: todas as funções utilitárias e constantes devem residir DENTRO de cada routerAdd callback body.
 */

/**
 * 1) POST /backend/v1/fiscal/webhook-focus (Endpoint público para callbacks da Focus)
 */
routerAdd('POST', '/backend/v1/fiscal/webhook-focus', (c) => {
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

  let webhookSecret = ''
  try {
    webhookSecret = ($os.getenv('FOCUS_NFE_WEBHOOK_SECRET') || '').trim()
  } catch (_) {
    webhookSecret = ''
  }

  if (!webhookSecret) {
    console.error('[Webhook Focus] Segredo FOCUS_NFE_WEBHOOK_SECRET não configurado no Skip Cloud.')
    return c.json(401, {
      sucesso: false,
      message:
        'Configure o segredo FOCUS_NFE_WEBHOOK_SECRET no Skip Cloud para habilitar este endpoint.',
    })
  }

  let authHeader = ''
  try {
    const rawHeaders = c.requestInfo().headers || {}
    authHeader = (rawHeaders['authorization'] || rawHeaders['Authorization'] || '').trim()
  } catch (_) {
    authHeader = ''
  }

  if (!authHeader || authHeader !== webhookSecret) {
    console.warn('[Webhook Focus] Tentativa de acesso sem autorização válida.')
    return c.json(401, { sucesso: false, message: 'Cabeçalho Authorization inválido.' })
  }

  // Responder 200 sempre para a Focus (nunca 5xx)
  try {
    const body = c.requestInfo().body || {}
    const ref = (body.ref || body.referencia || body.reference || '').trim()
    console.log(
      '[Webhook Focus] Recebido callback para ref:',
      ref,
      'payload:',
      JSON.stringify(body),
    )

    if (!ref) {
      console.warn('[Webhook Focus] Payload recebido sem referência.')
      return c.json(200, {
        sucesso: true,
        message: 'Aviso recebido, mas nenhuma referência foi informada.',
      })
    }

    // Localizar documento fiscal
    let docRec = null
    const docs = $app.findRecordsByFilter(
      'documentos_fiscais',
      `referencia = '${ref}'`,
      '-created',
      1,
      0,
    )
    if (docs && docs.length > 0) {
      docRec = docs[0]
    }

    if (!docRec) {
      // Tentar encontrar pelo CNPJ da referência no padrão {cnpj}-{modelo}-{id}
      const partes = ref.split('-')
      if (partes.length >= 3) {
        const idDoc = partes[2]
        try {
          docRec = $app.findRecordById('documentos_fiscais', idDoc)
        } catch (_) {}
      }
    }

    if (!docRec) {
      console.warn('[Webhook Focus] Documento fiscal não encontrado para referência:', ref)
      return c.json(200, { sucesso: true, message: 'Documento fiscal não encontrado no ERP.' })
    }

    const empresaId = docRec.getString('empresa_id')
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
      console.error('[Webhook Focus] Config fiscal não encontrada para empresa:', empresaId)
      return c.json(200, { sucesso: true, message: 'Configuração da empresa ausente.' })
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
    } catch (_) {
      token = ''
    }

    if (!token) {
      console.error('[Webhook Focus] Token fiscal não encontrado no segredo:', nomeSegredo)
      return c.json(200, { sucesso: true, message: 'Token fiscal da empresa ausente.' })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOrigin =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    // Consultar na Focus NFe sem confiar no payload
    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const queryParam = modelo === '65' ? '' : '?completa=1'
    const url = `${baseUrl}/${endpoint}/${encodeURIComponent(ref)}${queryParam}`
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
        timeout: 45,
      })
    } catch (errHttp) {
      console.error('[Webhook Focus] Erro na consulta da Focus NFe:', errHttp)
      return c.json(200, { sucesso: true, message: 'Falha momentânea na comunicação com a Focus.' })
    }

    const statusCode = res?.statusCode || 200
    const rawText = res?.raw || ''
    let respJson = null
    try {
      respJson = JSON.parse(rawText)
    } catch (_) {}

    if (statusCode === 404) {
      console.warn('[Webhook Focus] Nota não encontrada na Focus NFe:', ref)
      return c.json(200, { sucesso: true, message: 'Nota não encontrada na Focus.' })
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

    // A) AUTORIZADA
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

      // Atualizar transferência se houver
      const transfIdDoc = docRec.getString('transferencia_id')
      if (transfIdDoc) {
        try {
          const transfRec = $app.findRecordById('transferencias', transfIdDoc)
          if (transfRec) {
            if (numeroNota) transfRec.set('nota_fiscal_numero', String(numeroNota))
            if (chaveNota) transfRec.set('nota_fiscal_chave', chaveNota)
            $app.save(transfRec)
          }
        } catch (errTrf) {
          console.warn('[Webhook Focus] Erro ao atualizar transferência:', errTrf)
        }
      }

      // Atualizar devolução de venda se houver
      const devVendaIdDoc = docRec.getString('devolucao_venda_id')
      if (devVendaIdDoc) {
        try {
          const devVendaRec = $app.findRecordById('vendas', devVendaIdDoc)
          if (devVendaRec) {
            devVendaRec.set('documento_fiscal_status', 'Autorizada')
            devVendaRec.set('documento_fiscal_id', docRec.id)
            $app.save(devVendaRec)
          }
        } catch (errDevV) {
          console.warn('[Webhook Focus] Erro ao atualizar devolução de venda:', errDevV)
        }
      }

      // Baixar XML autorizado
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
            timeout: 45,
          })
          if ((resXml.statusCode || 200) < 300 && resXml.raw) {
            const fileName = `nfe_${ref}.xml`
            const fileUpload = $filesystem.fileFromBytes(Buffer.from(resXml.raw, 'utf-8'), fileName)
            docRec.set('xml_arquivo', fileUpload)
          }
        } catch (errXml) {
          console.warn('[Webhook Focus] Erro ao baixar/gravar XML:', errXml)
        }
      }

      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Autorizada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }

      console.log('[Webhook Focus] Documento fiscal autorizado com sucesso:', ref)
      return c.json(200, { sucesso: true, message: 'Documento autorizado processado com sucesso.' })
    }

    // B) REJEITADA
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

      console.log('[Webhook Focus] Documento fiscal marcado como Rejeitado:', ref, motivoRejeicao)
      return c.json(200, { sucesso: true, message: 'Documento rejeitado processado.' })
    }

    // C) DENEGADA
    if (
      statusFocus === 'denegado' ||
      statusSefaz === '110' ||
      statusSefaz === '301' ||
      statusSefaz === '302' ||
      statusSefaz === '303'
    ) {
      const motivoDenegacao =
        motivoSefaz ||
        'Uso denegado pela SEFAZ (irregularidade fiscal do emitente ou destinatário).'

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

      console.log('[Webhook Focus] Documento fiscal marcado como Denegado:', ref)
      return c.json(200, { sucesso: true, message: 'Documento denegado processado.' })
    }

    // D) CANCELADA
    if (statusFocus === 'cancelado') {
      docRec.set('status', 'Cancelada')
      docRec.set('mensagem_sefaz', motivoSefaz || 'Nota cancelada')
      docRec.set('json_retorno', respJson)
      $app.save(docRec)

      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Cancelada')
        $app.save(vendaRec)
      }

      return c.json(200, { sucesso: true, message: 'Documento cancelado processado.' })
    }

    // E) PROCESSANDO
    docRec.set('status', 'Processando')
    docRec.set('status_sefaz', statusSefaz || statusFocus || 'processando')
    docRec.set('mensagem_sefaz', motivoSefaz || 'Processando autorização na SEFAZ')
    docRec.set('json_retorno', respJson)
    $app.save(docRec)

    return c.json(200, { sucesso: true, message: 'Status atualizado para processando.' })
  } catch (errGeral) {
    console.error('[Webhook Focus] Erro interno no processamento do webhook:', errGeral)
    return c.json(200, { sucesso: false, message: 'Erro interno registrado nos logs.' })
  }
})

/**
 * 2) POST /backend/v1/fiscal/registrar-webhook-focus
 * Cadastra o webhook na Focus NFe para uma ou todas as empresas (só Administrador)
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/registrar-webhook-focus',
  (c) => {
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

    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    // Verificar se é administrador via perfis_acesso
    const perfilId = authRecord.getString('perfil_acesso_id') || authRecord.getString('perfil_id')
    let isAdmin = false
    if (perfilId) {
      try {
        const perfil = $app.findRecordById('perfis_acesso', perfilId)
        isAdmin = perfil ? perfil.getBool('administrador') : false
      } catch (_) {}
    }
    if (!isAdmin) {
      return c.json(403, {
        sucesso: false,
        message: 'Apenas Administradores podem configurar webhooks da Focus.',
      })
    }

    let webhookSecret = ''
    try {
      webhookSecret = ($os.getenv('FOCUS_NFE_WEBHOOK_SECRET') || '').trim()
    } catch (_) {
      webhookSecret = ''
    }

    if (!webhookSecret) {
      return c.json(400, {
        sucesso: false,
        message:
          'Segredo FOCUS_NFE_WEBHOOK_SECRET não encontrado. Crie o segredo no painel do Skip Cloud antes de registrar.',
      })
    }

    const urlProducaoPadrao =
      'https://erp-de-gestao-comercial-24560.goskip.app/backend/v1/fiscal/webhook-focus'
    const body = c.requestInfo().body || {}
    const empresaId = body.empresa_id // se vazio, registra para todas as empresas ativas com emissão
    const urlWebhook = (body.url || urlProducaoPadrao).trim()

    let empresasParaRegistrar = []
    if (empresaId) {
      try {
        const emp = $app.findRecordById('empresas', empresaId)
        if (emp && emp.getBool('ativo')) empresasParaRegistrar.push(emp)
      } catch (_) {}
    } else {
      empresasParaRegistrar = $app.findRecordsByFilter('empresas', 'ativo = true', 'nome_fantasia')
    }

    if (empresasParaRegistrar.length === 0) {
      return c.json(400, { sucesso: false, message: 'Nenhuma empresa ativa encontrada.' })
    }

    const resultados = []

    for (let i = 0; i < empresasParaRegistrar.length; i++) {
      const emp = empresasParaRegistrar[i]
      const empId = emp.id
      const cnpjEmp = emp.getString('cnpj').replace(/\D/g, '')
      const nomeEmp = emp.getString('nome_fantasia') || emp.getString('razao_social')

      const configs = $app.findRecordsByFilter(
        'config_emissao_fiscal',
        `empresa_id = '${empId}' && ativo = true`,
        '-created',
        1,
        0,
      )
      if (!configs || configs.length === 0) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: 'Configuração fiscal não encontrada.',
        })
        continue
      }

      const config = configs[0]
      if (!config.getBool('emite_documentos_fiscais')) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: 'Empresa configurada para não emitir documentos fiscais.',
        })
        continue
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
      } catch (_) {
        token = ''
      }

      if (!token) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: `Token não configurado: crie o segredo ${nomeSegredo} no Skip Cloud.`,
        })
        continue
      }

      const baseUrl =
        ambiente === 'Produção'
          ? 'https://api.focusnfe.com.br/v2'
          : 'https://homologacao.focusnfe.com.br/v2'

      const basicAuth = 'Basic ' + encodeBase64(token + ':')
      const payloadHook = {
        cnpj: cnpjEmp,
        event: 'nfe',
        url: urlWebhook,
        authorization: webhookSecret,
      }

      try {
        const res = $http.send({
          method: 'POST',
          url: `${baseUrl}/hooks`,
          headers: {
            Authorization: basicAuth,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payloadHook),
          timeout: 45,
        })

        const status = res.statusCode || 200
        let respJson = null
        try {
          respJson = JSON.parse(res.raw || '{}')
        } catch (_) {}

        if (status >= 200 && status < 300) {
          resultados.push({
            empresa_id: empId,
            empresa_nome: nomeEmp,
            sucesso: true,
            mensagem: 'Webhook registrado com sucesso na Focus NFe.',
            detalhes: respJson,
          })
        } else {
          resultados.push({
            empresa_id: empId,
            empresa_nome: nomeEmp,
            sucesso: false,
            mensagem: respJson?.mensagem || respJson?.message || `HTTP ${status}`,
            detalhes: respJson,
          })
        }
      } catch (errHook) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: 'Falha na comunicação com a Focus NFe.',
        })
      }
    }

    const sucessoGeral = resultados.some((r) => r.sucesso)

    return c.json(200, {
      sucesso: sucessoGeral,
      message: sucessoGeral
        ? 'Processamento de registro de webhooks concluído.'
        : 'Não foi possível registrar o webhook para as empresas.',
      resultados: resultados,
      url_registrada: urlWebhook,
    })
  },
  $apis.requireAuth(),
)

/**
 * 3) GET /backend/v1/fiscal/listar-webhooks-focus
 * Lista os webhooks registrados na Focus NFe para a empresa ativa ou selecionada
 */
routerAdd(
  'GET',
  '/backend/v1/fiscal/listar-webhooks-focus',
  (c) => {
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

    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const empresaId = c.requestInfo().query['empresa_id'] || ''
    if (!empresaId) {
      return c.json(400, { sucesso: false, message: 'Parâmetro empresa_id é obrigatório.' })
    }

    let webhookSecret = ''
    try {
      webhookSecret = ($os.getenv('FOCUS_NFE_WEBHOOK_SECRET') || '').trim()
    } catch (_) {
      webhookSecret = ''
    }

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )
    if (!configs || configs.length === 0) {
      return c.json(200, {
        sucesso: false,
        tem_segredo_webhook: Boolean(webhookSecret),
        message: 'Configuração fiscal da empresa não encontrada.',
        hooks: [],
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
    } catch (_) {
      token = ''
    }

    if (!token) {
      return c.json(200, {
        sucesso: false,
        tem_segredo_webhook: Boolean(webhookSecret),
        message: 'Token fiscal da empresa não configurado.',
        hooks: [],
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const basicAuth = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'GET',
        url: `${baseUrl}/hooks`,
        headers: {
          Authorization: basicAuth,
          Accept: 'application/json',
        },
        timeout: 45,
      })

      const status = res.statusCode || 200
      let respJson = null
      try {
        respJson = JSON.parse(res.raw || '[]')
      } catch (_) {}

      const lista = Array.isArray(respJson) ? respJson : respJson?.hooks || []

      return c.json(200, {
        sucesso: status >= 200 && status < 300,
        tem_segredo_webhook: Boolean(webhookSecret),
        webhook_secret_configurado: Boolean(webhookSecret),
        ambiente: ambiente,
        hooks: lista,
      })
    } catch (err) {
      return c.json(200, {
        sucesso: false,
        tem_segredo_webhook: Boolean(webhookSecret),
        message: 'Falha ao consultar webhooks na Focus NFe.',
        hooks: [],
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * 4) POST /backend/v1/fiscal/reenviar-documento
 * Reenvia um documento que esteja no status 'Rejeitada' pela mesma referência
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/reenviar-documento',
  (c) => {
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

    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const body = c.requestInfo().body || {}
    const documentoId = body.documento_id
    if (!documentoId) {
      return c.json(400, { sucesso: false, message: 'documento_id é obrigatório.' })
    }

    let docRec = null
    try {
      docRec = $app.findRecordById('documentos_fiscais', documentoId)
    } catch (_) {}

    if (!docRec) {
      return c.json(404, { sucesso: false, message: 'Documento fiscal não encontrado.' })
    }

    const statusAtual = docRec.getString('status')
    if (statusAtual !== 'Rejeitada') {
      return c.json(400, {
        sucesso: false,
        message: `Apenas documentos com status "Rejeitada" podem ser reenviados (status atual: ${statusAtual}).`,
      })
    }

    const ref = docRec.getString('referencia')
    const modelo = docRec.getString('modelo') || '55'
    const empresaId = docRec.getString('empresa_id')

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
    } catch (_) {
      token = ''
    }

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: 'Token fiscal da empresa emitente não configurado.',
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const jsonEnviado = docRec.get('json_enviado')
    if (!jsonEnviado) {
      return c.json(400, {
        sucesso: false,
        message: 'Payload fiscal (json_enviado) não encontrado no registro para reenvio.',
      })
    }

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'
    const url = `${baseUrl}/${endpoint}?ref=${encodeURIComponent(ref)}`
    const basicAuth = 'Basic ' + encodeBase64(token + ':')

    try {
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(jsonEnviado),
        timeout: 60,
      })

      const statusHttp = res.statusCode || 200
      let respJson = null
      try {
        respJson = JSON.parse(res.raw || '{}')
      } catch (_) {}

      // Atualizar status para Processando
      docRec.set('status', 'Processando')
      docRec.set('status_sefaz', 'processando_autorizacao')
      docRec.set('mensagem_sefaz', 'Reenviado para autorização na SEFAZ.')
      docRec.set('json_retorno', respJson)
      $app.save(docRec)

      // Atualizar venda vinculada se houver
      const vendaId = docRec.getString('venda_id')
      if (vendaId) {
        try {
          const vRec = $app.findRecordById('vendas', vendaId)
          if (vRec) {
            vRec.set('documento_fiscal_status', 'Processando')
            $app.save(vRec)
          }
        } catch (_) {}
      }

      return c.json(200, {
        sucesso: true,
        status: 'Processando',
        message:
          'Documento fiscal reenviado com sucesso à SEFAZ. Acompanhe a autorização no monitor.',
        detalhes: respJson,
      })
    } catch (err) {
      return c.json(500, {
        sucesso: false,
        message: 'Falha na comunicação com a API emissora durante o reenvio.',
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * 5) POST /backend/v1/fiscal/consultar-lote
 * Consulta a situação de múltiplos documentos fiscais em lote
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/consultar-lote',
  (c) => {
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

    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const body = c.requestInfo().body || {}
    const documentoIds = body.documento_ids || []
    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return c.json(400, { sucesso: false, message: 'Lista documento_ids vazia ou inválida.' })
    }

    let atualizados = 0
    let pendentes = 0
    let falhas = 0
    const resultados = []

    for (let i = 0; i < documentoIds.length; i++) {
      const docId = documentoIds[i]
      try {
        const docRec = $app.findRecordById('documentos_fiscais', docId)
        if (!docRec) {
          falhas++
          resultados.push({ id: docId, status: 'NaoEncontrado' })
          continue
        }

        const empresaId = docRec.getString('empresa_id')
        const refFocus = docRec.getString('referencia')
        const modelo = docRec.getString('modelo') || '55'

        const configs = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (!configs || configs.length === 0) {
          falhas++
          resultados.push({ id: docId, status: 'SemConfig' })
          continue
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
        } catch (_) {
          token = ''
        }

        if (!token) {
          falhas++
          resultados.push({ id: docId, status: 'SemToken' })
          continue
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
        const queryParam = modelo === '65' ? '' : '?completa=1'
        const url = `${baseUrl}/${endpoint}/${encodeURIComponent(refFocus)}${queryParam}`
        const basicAuth = 'Basic ' + encodeBase64(token + ':')

        const res = $http.send({
          method: 'GET',
          url: url,
          headers: {
            Authorization: basicAuth,
            Accept: 'application/json',
          },
          timeout: 30,
        })

        const raw = res.raw || '{}'
        let respJson = null
        try {
          respJson = JSON.parse(raw)
        } catch (_) {}

        const statusFocus = respJson?.status || ''
        const statusSefaz = respJson?.status_sefaz || ''
        const motivoSefaz = respJson?.mensagem_sefaz || respJson?.mensagem || ''

        if (statusFocus === 'autorizado' || (res.statusCode === 200 && respJson?.chave_nfe)) {
          docRec.set('status', 'Autorizada')
          if (respJson?.numero) docRec.set('numero', Number(respJson.numero))
          if (respJson?.chave_nfe || respJson?.chave)
            docRec.set('chave_acesso', respJson.chave_nfe || respJson.chave)
          if (respJson?.protocolo) docRec.set('protocolo', respJson.protocolo)
          if (respJson?.danfe_url) {
            docRec.set('danfe_url', respJson.danfe_url)
          } else if (respJson?.caminho_danfe) {
            docRec.set('danfe_url', `${baseUrlOrigin}${respJson.caminho_danfe}`)
          }
          docRec.set('status_sefaz', statusSefaz || '100')
          docRec.set('mensagem_sefaz', motivoSefaz || 'Autorizado o uso da NF-e')
          docRec.set('json_retorno', respJson)
          $app.save(docRec)
          atualizados++
          resultados.push({ id: docId, status: 'Autorizada' })
        } else if (statusFocus === 'erro_autorizacao' || statusFocus === 'rejeitado') {
          docRec.set('status', 'Rejeitada')
          docRec.set('status_sefaz', statusSefaz || 'Rejeição')
          docRec.set('mensagem_sefaz', motivoSefaz)
          docRec.set('json_retorno', respJson)
          $app.save(docRec)
          atualizados++
          resultados.push({ id: docId, status: 'Rejeitada' })
        } else if (statusFocus === 'denegado') {
          docRec.set('status', 'Denegada')
          docRec.set('status_sefaz', statusSefaz || 'Denegada')
          docRec.set('mensagem_sefaz', motivoSefaz)
          docRec.set('json_retorno', respJson)
          $app.save(docRec)
          atualizados++
          resultados.push({ id: docId, status: 'Denegada' })
        } else {
          pendentes++
          resultados.push({ id: docId, status: 'Processando' })
        }
      } catch (errItem) {
        falhas++
        resultados.push({ id: docId, status: 'Erro' })
      }
    }

    return c.json(200, {
      sucesso: true,
      total: documentoIds.length,
      atualizados,
      pendentes,
      falhas,
      resultados,
      message: `Consulta em lote finalizada: ${atualizados} atualizados, ${pendentes} pendentes, ${falhas} falhas.`,
    })
  },
  $apis.requireAuth(),
)
