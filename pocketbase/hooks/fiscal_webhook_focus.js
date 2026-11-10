// reenvio 9.8r2
/**
 * fiscal_webhook_focus.js
 *
 * Gerenciamento de Webhook da Focus NFe e reenvio de documentos fiscais
 * ATENÇÃO JSVM: todas as funções utilitárias e constantes devem residir DENTRO de cada routerAdd callback body.
 */

/**
 * 1.b) POST /backend/v1/fiscal/webhook-focus/{empresa_id} (Endpoint por empresa - Prompt 9.6)
 * Valida o cabeçalho Authorization contra o webhook_secret da credenciais_fiscais daquela empresa.
 */
routerAdd('POST', '/backend/v1/fiscal/webhook-focus/{empresa_id}', (c) => {
  let empresaIdParam = ''
  try {
    if (typeof c.request?.pathValue === 'function') {
      empresaIdParam = (c.request.pathValue('empresa_id') || '').trim()
    } else if (typeof c.pathValue === 'function') {
      empresaIdParam = (c.pathValue('empresa_id') || '').trim()
    }
  } catch (_) {}

  if (!empresaIdParam) {
    return c.json(400, { sucesso: false, message: 'empresa_id é obrigatório na rota.' })
  }

  let cred = null
  try {
    const creds = $app.findRecordsByFilter(
      'credenciais_fiscais',
      "empresa_id = '" + empresaIdParam + "'",
      '-created',
      1,
      0,
    )
    if (creds && creds.length > 0) cred = creds[0]
  } catch (_) {}

  const secretEsperado = cred ? (cred.getString('webhook_secret') || '').trim() : ''
  if (!secretEsperado) {
    console.error(
      '[Webhook Focus Empresa] webhook_secret não cadastrado para a empresa:',
      empresaIdParam,
    )
    return c.json(401, {
      sucesso: false,
      message: 'Webhook secret não configurado para esta empresa.',
    })
  }

  let authHeader = ''
  try {
    const rawHeaders = c.requestInfo().headers || {}
    authHeader = (rawHeaders['authorization'] || rawHeaders['Authorization'] || '').trim()
  } catch (_) {
    authHeader = ''
  }

  if (!authHeader || authHeader !== secretEsperado) {
    console.warn('[Webhook Focus Empresa] Authorization inválido para empresa:', empresaIdParam)
    return c.json(401, { sucesso: false, message: 'Cabeçalho Authorization inválido.' })
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

  try {
    const body = c.requestInfo().body || {}
    const ref = (body.ref || body.referencia || body.reference || '').trim()
    console.log(
      '[Webhook Focus Empresa]',
      empresaIdParam,
      'ref:',
      ref,
      'payload:',
      JSON.stringify(body),
    )

    if (!ref) {
      return c.json(200, { sucesso: true, message: 'Aviso recebido sem referência.' })
    }

    let docRec = null
    const docs = $app.findRecordsByFilter(
      'documentos_fiscais',
      "referencia = '" + ref + "'",
      '-created',
      1,
      0,
    )
    if (docs && docs.length > 0) docRec = docs[0]

    if (!docRec) {
      const partes = ref.split('-')
      if (partes.length >= 3) {
        try {
          docRec = $app.findRecordById('documentos_fiscais', partes[2])
        } catch (_) {}
      }
    }

    if (!docRec) {
      return c.json(200, { sucesso: true, message: 'Documento fiscal não encontrado.' })
    }

    const docEmpresaId = docRec.getString('empresa_id')
    if (docEmpresaId && docEmpresaId !== empresaIdParam) {
      console.warn(
        '[Webhook Focus Empresa] Documento pertence a outra empresa:',
        docEmpresaId,
        'esperado:',
        empresaIdParam,
      )
      return c.json(200, { sucesso: true, message: 'Documento pertence a outra empresa.' })
    }

    const modelo = docRec.getString('modelo') || '55'
    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      "empresa_id = '" + empresaIdParam + "' && ativo = true",
      '-created',
      1,
      0,
    )
    if (!configs || configs.length === 0) {
      return c.json(200, { sucesso: true, message: 'Configuração da empresa ausente.' })
    }

    const config = configs[0]
    // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const cfgs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (cfgs && cfgs.length > 0) {
          const cfg = cfgs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    const tokenInfo = obterTokenFocus(empresaIdParam, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(200, { sucesso: true, message: 'Token fiscal ausente.' })
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
      return c.json(200, { sucesso: true, message: 'Falha de comunicação com a Focus.' })
    }

    const statusCode = res?.statusCode || 200
    let respJson = null
    try {
      respJson = JSON.parse(res?.raw || '')
    } catch (_) {}

    if (statusCode === 404) {
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

      const transfIdDoc = docRec.getString('transferencia_id')
      if (transfIdDoc) {
        try {
          const transfRec = $app.findRecordById('transferencias', transfIdDoc)
          if (transfRec) {
            if (numeroNota) transfRec.set('nota_fiscal_numero', String(numeroNota))
            if (chaveNota) transfRec.set('nota_fiscal_chave', chaveNota)
            $app.save(transfRec)
          }
        } catch (_) {}
      }

      const devVendaIdDoc = docRec.getString('devolucao_venda_id')
      if (devVendaIdDoc) {
        try {
          const devVendaRec = $app.findRecordById('vendas', devVendaIdDoc)
          if (devVendaRec) {
            devVendaRec.set('documento_fiscal_status', 'Autorizada')
            devVendaRec.set('documento_fiscal_id', docRec.id)
            $app.save(devVendaRec)
          }
        } catch (_) {}
      }

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
        } catch (_) {}
      }

      $app.save(docRec)
      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Autorizada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }
      return c.json(200, { sucesso: true, message: 'Documento autorizado processado com sucesso.' })
    }

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
      return c.json(200, { sucesso: true, message: 'Documento rejeitado processado.' })
    }

    if (
      statusFocus === 'denegado' ||
      statusSefaz === '110' ||
      statusSefaz === '301' ||
      statusSefaz === '302' ||
      statusSefaz === '303'
    ) {
      docRec.set('status', 'Denegada')
      docRec.set('status_sefaz', statusSefaz || 'Denegada')
      docRec.set('mensagem_sefaz', motivoSefaz || 'Uso denegado pela SEFAZ.')
      docRec.set('json_retorno', respJson)
      $app.save(docRec)
      if (vendaRec) {
        vendaRec.set('documento_fiscal_status', 'Denegada')
        vendaRec.set('documento_fiscal_id', docRec.id)
        $app.save(vendaRec)
      }
      return c.json(200, { sucesso: true, message: 'Documento denegado processado.' })
    }

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

    docRec.set('status', 'Processando')
    docRec.set('status_sefaz', statusSefaz || statusFocus || 'processando')
    docRec.set('mensagem_sefaz', motivoSefaz || 'Processando autorização na SEFAZ')
    docRec.set('json_retorno', respJson)
    $app.save(docRec)
    return c.json(200, { sucesso: true, message: 'Status atualizado para processando.' })
  } catch (errGeral) {
    console.error('[Webhook Focus Empresa] Erro:', errGeral)
    return c.json(200, { sucesso: false, message: 'Erro interno registrado nos logs.' })
  }
})

/**
 * 1) POST /backend/v1/fiscal/webhook-focus (Endpoint público para callbacks da Focus - Legado HH)
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

    // Validar CNPJ do emissor da empresa vinculada ao documento
    let cnpjEmpresa = ''
    try {
      const empRec = $app.findRecordById('empresas', empresaId)
      if (empRec) {
        cnpjEmpresa = (empRec.getString('cnpj') || '').replace(/\D/g, '')
      }
    } catch (_) {}

    // Carregar config fiscal
    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaId}' && ativo = true`,
      '-created',
      1,
      0,
    )

    if (!cnpjEmpresa && configs && configs.length > 0) {
      // Tentar obter CNPJ via config_emissao_fiscal se houver campo correspondente
      cnpjEmpresa = (configs[0].getString('cnpj') || '').replace(/\D/g, '')
    }

    // Conferir CNPJ do emissor no payload (se informado no webhook) ou na referência
    const cnpjRecebido = (body.cnpj || body.cnpj_emitente || body.emitente_cnpj || '').replace(
      /\D/g,
      '',
    )
    if (cnpjRecebido && cnpjEmpresa && cnpjRecebido !== cnpjEmpresa) {
      console.warn(
        '[Webhook Focus] Tentativa com CNPJ divergente da empresa vinculada ao documento. Aviso ignorado.',
      )
      return c.json(200, { sucesso: true, message: 'Aviso ignorado por divergência de emissor.' })
    }

    if (!configs || configs.length === 0) {
      console.error('[Webhook Focus] Config fiscal não encontrada para empresa:', empresaId)
      return c.json(200, { sucesso: true, message: 'Configuração da empresa ausente.' })
    }

    const config = configs[0]
    // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const cfgs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (cfgs && cfgs.length > 0) {
          const cfg = cfgs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      console.error(
        '[Webhook Focus] Token fiscal não encontrado (nem banco nem segredo) para empresa:',
        empresaId,
      )
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

    // Validação estrita do CNPJ do emissor retornado pela Focus
    const cnpjEmitenteFocus = (
      respJson?.cnpj_emitente ||
      respJson?.emitente?.cnpj ||
      respJson?.emitente?.CNPJ ||
      ''
    ).replace(/\D/g, '')
    if (cnpjEmitenteFocus && cnpjEmpresa && cnpjEmitenteFocus !== cnpjEmpresa) {
      console.warn(
        '[Webhook Focus] Consulta na Focus retornou CNPJ emissor divergente do cadastro da empresa. Processamento ignorado.',
      )
      return c.json(200, {
        sucesso: true,
        message: 'Aviso ignorado por divergência de CNPJ do emissor.',
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

    // Verificar se é administrador: mesmo critério do resto do ERP (fiscal_credenciais_rotas.js)
    // — registro em usuarios do ERP (relação auth_user_id), perfil de acesso com administrador=true,
    // ou login tipo master. O id do login (users) NÃO tem perfil_acesso_id.
    let isAdmin = false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', authRecord.id)
      if (userRec && userRec.getString('tipo') === 'master') {
        isAdmin = true
      }
    } catch (_) {}

    if (!isAdmin) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRecord.id + "' || id = '" + authRecord.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          const assinanteId = uRecs[0].getString('assinante_id')
          const pId = uRecs[0].getString('perfil_id')
          if (pId) {
            const perfil = $app.findRecordById('perfis_acesso', pId)
            if (
              perfil &&
              perfil.getBool('ativo') &&
              perfil.getBool('administrador') &&
              (!assinanteId || perfil.getString('assinante_id') === assinanteId)
            ) {
              isAdmin = true
            }
          }
        }
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

      // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
      function obterTokenFocus(empresaId, appInstance) {
        const app = appInstance || $app
        if (!empresaId) {
          return {
            token: '',
            origem: 'nenhuma',
            ambiente: 'Homologação',
            nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
            codigoToken: '',
          }
        }

        let ambiente = 'Homologação'
        let codigoToken = ''
        try {
          const cfgs = app.findRecordsByFilter(
            'config_emissao_fiscal',
            `empresa_id = '${empresaId}' && ativo = true`,
            '-created',
            1,
            0,
          )
          if (cfgs && cfgs.length > 0) {
            const cfg = cfgs[0]
            ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
            codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
          }
        } catch (_) {}

        const ehProducao = ambiente === 'Produção'
        const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
        let nomeSegredo = codigoToken
          ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
          : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

        try {
          const creds = app.findRecordsByFilter(
            'credenciais_fiscais',
            `empresa_id = '${empresaId}'`,
            '-created',
            1,
            0,
          )
          if (creds && creds.length > 0) {
            const credRec = creds[0]
            const tokenBanco = (
              ehProducao
                ? credRec.getString('token_producao')
                : credRec.getString('token_homologacao')
            ).trim()

            if (tokenBanco && tokenBanco.length > 0) {
              return {
                token: tokenBanco,
                origem: 'banco',
                ambiente: ambiente,
                nomeSegredo: nomeSegredo,
                codigoToken: codigoToken,
              }
            }
          }
        } catch (_) {}

        let tokenSegredo = ''
        try {
          if (codigoToken) {
            tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
          }
        } catch (_) {
          tokenSegredo = ''
        }

        if (!tokenSegredo) {
          try {
            const empRec = app.findRecordById('empresas', empresaId)
            const codEmp = empRec.getInt('codigo')
            if (codEmp === 2) {
              const segEcommerce = (
                $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
              ).trim()
              if (segEcommerce) {
                tokenSegredo = segEcommerce
                nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
              }
            } else if (codEmp === 3) {
              const segFilial05 = (
                $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
              ).trim()
              if (segFilial05) {
                tokenSegredo = segFilial05
                nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
              }
            }
          } catch (_) {}
        }

        if (!tokenSegredo) {
          try {
            const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
            if (segPadrao) {
              tokenSegredo = segPadrao
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
            }
          } catch (_) {}
        }

        if (tokenSegredo && tokenSegredo.length > 0) {
          return {
            token: tokenSegredo,
            origem: 'segredo',
            ambiente: ambiente,
            nomeSegredo: nomeSegredo,
            codigoToken: codigoToken,
          }
        }

        return {
          token: '',
          origem: 'nenhuma',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      const tokenInfo = obterTokenFocus(empId, $app)
      const token = tokenInfo.token

      if (!token) {
        resultados.push({
          empresa_id: empId,
          empresa_nome: nomeEmp,
          sucesso: false,
          mensagem: `Token não configurado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
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
    // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const cfgs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (cfgs && cfgs.length > 0) {
          const cfg = cfgs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

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
    if (statusAtual !== 'Rejeitada' && statusAtual !== 'Processando') {
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
    // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
    function obterTokenFocus(empresaId, appInstance) {
      const app = appInstance || $app
      if (!empresaId) {
        return {
          token: '',
          origem: 'nenhuma',
          ambiente: 'Homologação',
          nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
          codigoToken: '',
        }
      }

      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const cfgs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (cfgs && cfgs.length > 0) {
          const cfg = cfgs[0]
          ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}

      const ehProducao = ambiente === 'Produção'
      const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

      try {
        const creds = app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const credRec = creds[0]
          const tokenBanco = (
            ehProducao
              ? credRec.getString('token_producao')
              : credRec.getString('token_homologacao')
          ).trim()

          if (tokenBanco && tokenBanco.length > 0) {
            return {
              token: tokenBanco,
              origem: 'banco',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }
        }
      } catch (_) {}

      let tokenSegredo = ''
      try {
        if (codigoToken) {
          tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
        }
      } catch (_) {
        tokenSegredo = ''
      }

      if (!tokenSegredo) {
        try {
          const empRec = app.findRecordById('empresas', empresaId)
          const codEmp = empRec.getInt('codigo')
          if (codEmp === 2) {
            const segEcommerce = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
            ).trim()
            if (segEcommerce) {
              tokenSegredo = segEcommerce
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const segFilial05 = (
              $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
            ).trim()
            if (segFilial05) {
              tokenSegredo = segFilial05
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }

      if (!tokenSegredo) {
        try {
          const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (segPadrao) {
            tokenSegredo = segPadrao
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }

      if (tokenSegredo && tokenSegredo.length > 0) {
        return {
          token: tokenSegredo,
          origem: 'segredo',
          ambiente: ambiente,
          nomeSegredo: nomeSegredo,
          codigoToken: codigoToken,
        }
      }

      return {
        token: '',
        origem: 'nenhuma',
        ambiente: ambiente,
        nomeSegredo: nomeSegredo,
        codigoToken: codigoToken,
      }
    }

    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

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

    const endpoint = modelo === '65' ? 'nfce' : 'nfe'

    // NFC-e: REMONTA o JSON com a configuração e o perfil tributário ATUAIS
    // (não reaproveita o json_enviado antigo — a rejeição por IBS/CBS saía desatualizada).
    // IBS/CBS (Reforma Tributária): CST 000 / cClassTrib 000001, base = valor do item,
    // alíquotas de teste 2026: CBS 0,9%, IBS UF 0,1%, IBS municipal 0% (nomes oficiais da Focus).
    let jsonEnviado = null
    if (modelo === '65') {
      const round2Re = (v) => Math.round((Number(v) || 0) * 100) / 100
      let vendaIdDoc = docRec.getString('venda_id')
      if (!vendaIdDoc) {
        return c.json(400, {
          sucesso: false,
          message:
            'Documento fiscal sem venda vinculada — não é possível remontar o JSON da NFC-e.',
        })
      }
      let vendaDoc = null
      try {
        vendaDoc = $app.findRecordById('vendas', vendaIdDoc)
      } catch (_) {
        vendaDoc = null
      }
      if (!vendaDoc || !vendaDoc.getBool('ativo')) {
        return c.json(400, {
          sucesso: false,
          message: 'Venda vinculada ao documento não encontrada ou inativa.',
        })
      }
      let configDoc = null
      try {
        const cfgsDoc = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (cfgsDoc && cfgsDoc.length > 0) configDoc = cfgsDoc[0]
      } catch (_) {}
      if (!configDoc) {
        return c.json(400, {
          sucesso: false,
          message: 'Configuração fiscal da empresa não encontrada para remontar a NFC-e.',
        })
      }
      const informarIbsCbsDoc = configDoc.getBool('informar_ibs_cbs')

      // Empresa emitente (dados fiscais para a remontagem completa do JSON)
      let empresaDoc = null
      try {
        empresaDoc = $app.findRecordById('empresas', empresaId)
      } catch (_) {
        empresaDoc = null
      }
      if (!empresaDoc || !empresaDoc.getBool('ativo')) {
        return c.json(400, {
          sucesso: false,
          message:
            'Empresa emitente da venda não encontrada ou inativa — não é possível remontar a NFC-e.',
        })
      }
      const cnpjEmitenteDoc = (empresaDoc.getString('cnpj') || '').replace(/\D/g, '')
      if (!cnpjEmitenteDoc || cnpjEmitenteDoc.length !== 14) {
        return c.json(400, {
          sucesso: false,
          message:
            'Empresa emitente com CNPJ inválido ou incompleto — corrija o cadastro da loja antes de reenviar.',
        })
      }
      const ufEmitenteDoc = (empresaDoc.getString('uf') || '').trim().toUpperCase()
      const ibgeEmitenteDoc = (empresaDoc.getString('codigo_municipio_ibge') || '').trim()
      const regimeApuracaoDoc = (empresaDoc.getString('regime_apuracao') || '').trim()
      const crtRawDoc = empresaDoc.get('crt')
      const crtDoc =
        crtRawDoc !== null && crtRawDoc !== undefined && crtRawDoc !== '' ? Number(crtRawDoc) : null
      const ehSimplesDoc = regimeApuracaoDoc
        ? regimeApuracaoDoc === 'Simples Nacional'
        : crtDoc === 1 || crtDoc === 2 || crtDoc === 4
      const aliqCreditoSimplesDoc = empresaDoc.getFloat('aliquota_credito_simples') || 0
      const nomeEmitenteDoc =
        empresaDoc.getString('nome_documentos_fiscais') ||
        empresaDoc.getString('razao_social') ||
        ''

      let itensVenda = []
      try {
        itensVenda = $app.findRecordsByFilter(
          'vendas_itens',
          `venda_id = '${vendaIdDoc}' && ativo = true`,
          'item,created',
        )
      } catch (_) {
        itensVenda = []
      }
      if (!itensVenda || itensVenda.length === 0) {
        return c.json(400, {
          sucesso: false,
          message: 'A venda não possui itens lançados — não é possível remontar a NFC-e.',
        })
      }

      let totIbsDoc = 0
      let totCbsDoc = 0
      let totProdutosDoc = 0
      let totDescontoDoc = 0
      let totValorTotalDoc = 0
      let cfopPrimeiroDoc = ''
      const itensRemontados = []
      for (let i = 0; i < itensVenda.length; i++) {
        const it = itensVenda[i]
        const prodIdIt = it.getString('produto_id')
        let prodIt = null
        if (prodIdIt) {
          try {
            prodIt = $app.findRecordById('produtos', prodIdIt)
          } catch (_) {}
        }
        const perfilIdIt =
          it.getString('perfil_tributario_id') ||
          (prodIt ? prodIt.getString('perfil_tributario_id') : '')
        let regraIt = null
        if (perfilIdIt) {
          try {
            const regrasIt = $app.findRecordsByFilter(
              'perfis_tributarios_regras',
              `perfil_id = '${perfilIdIt}' && cenario = 'VENDA_INTERNA_CONSUMIDOR' && ativo = true`,
              '',
              1,
              0,
            )
            if (regrasIt && regrasIt.length > 0) regraIt = regrasIt[0]
          } catch (_) {}
        }
        const valorUnitIt = it.getFloat('preco_unitario') || 0
        const qtdIt = it.getFloat('quantidade') || 0
        const brutoIt = round2Re(qtdIt * valorUnitIt)
        const descontoIt = round2Re(
          (it.getFloat('desconto_valor') || 0) - (it.getFloat('acrescimo_valor') || 0),
        )
        const liquidoIt = round2Re(brutoIt - descontoIt)
        const valorBaseIt = liquidoIt

        const ncmIt = (
          it.getString('ncm') ||
          (prodIt ? prodIt.getString('ncm') : '') ||
          ''
        ).replace(/\D/g, '')
        if (!ncmIt || ncmIt.length !== 8) {
          return c.json(400, {
            sucesso: false,
            message: `Item ${i + 1} da venda com NCM inválido (${ncmIt || 'vazio'}) — corrija o cadastro do produto antes de reenviar.`,
          })
        }
        const cestIt = (
          it.getString('cest') ||
          (prodIt ? prodIt.getString('cest') : '') ||
          ''
        ).replace(/\D/g, '')
        const gtinIt = prodIt
          ? prodIt.getString('gtin') || prodIt.getString('codigo_barras') || ''
          : ''

        let cfopIt = it.getString('cfop') || (regraIt ? regraIt.getString('cfop') : '')
        if (cfopIt) {
          try {
            const cfopRecIt = $app.findRecordById('cfop', cfopIt)
            cfopIt = cfopRecIt.getString('codigo') || cfopIt
          } catch (_) {}
        }
        if (!cfopIt) cfopIt = '5102'
        if (!cfopPrimeiroDoc) cfopPrimeiroDoc = cfopIt

        let cstIcmsIt =
          it.getString('cst_icms') || (regraIt ? regraIt.getString('cst_icms') : '') || ''
        let csosnIt = it.getString('csosn') || (regraIt ? regraIt.getString('csosn') : '') || ''
        if (ehSimplesDoc) {
          if (!csosnIt) csosnIt = '102'
        } else {
          if (!cstIcmsIt) cstIcmsIt = '00'
        }
        const situacaoIcmsIt = ehSimplesDoc ? csosnIt : cstIcmsIt

        const modBcIt = regraIt ? regraIt.getString('mod_bc_icms') || '3' : '3'
        const aliqIcmsIt =
          it.getFloat('aliquota_icms') || (regraIt ? regraIt.getFloat('aliquota_icms') || 0 : 0)

        let baseIcmsIt = 0
        let valorIcmsIt = 0
        const tributaIcmsIntegralIt =
          (!ehSimplesDoc &&
            (cstIcmsIt === '00' ||
              cstIcmsIt === '10' ||
              cstIcmsIt === '20' ||
              cstIcmsIt === '70')) ||
          (ehSimplesDoc && csosnIt === '900')
        if (tributaIcmsIntegralIt && aliqIcmsIt > 0) {
          baseIcmsIt = valorBaseIt
          valorIcmsIt = round2Re(baseIcmsIt * (aliqIcmsIt / 100))
        }

        let aliqCredSimplesIt = 0
        let vlrCredSimplesIt = 0
        if (ehSimplesDoc && csosnIt === '101' && aliqCreditoSimplesDoc > 0) {
          aliqCredSimplesIt = aliqCreditoSimplesDoc
          vlrCredSimplesIt = round2Re(valorBaseIt * (aliqCredSimplesIt / 100))
        }

        const cstPisIt =
          it.getString('cst_pis') || (regraIt ? regraIt.getString('cst_pis') : '07') || '07'
        const aliqPisIt = regraIt ? regraIt.getFloat('aliquota_pis') || 0 : 0
        const cstCofinsIt =
          it.getString('cst_cofins') || (regraIt ? regraIt.getString('cst_cofins') : '07') || '07'
        const aliqCofinsIt = regraIt ? regraIt.getFloat('aliquota_cofins') || 0 : 0
        let basePisIt = 0
        let valorPisIt = 0
        let baseCofinsIt = 0
        let valorCofinsIt = 0
        if (!ehSimplesDoc && ['01', '02'].includes(cstPisIt) && aliqPisIt > 0) {
          basePisIt = valorBaseIt
          valorPisIt = round2Re(basePisIt * (aliqPisIt / 100))
        }
        if (!ehSimplesDoc && ['01', '02'].includes(cstCofinsIt) && aliqCofinsIt > 0) {
          baseCofinsIt = valorBaseIt
          valorCofinsIt = round2Re(baseCofinsIt * (aliqCofinsIt / 100))
        }

        const itemNovo = {
          numero_item: i + 1,
          codigo_produto:
            (prodIt ? prodIt.getString('codigo') || prodIt.getString('codigo_interno') : '') ||
            prodIdIt ||
            String(i + 1),
          descricao: it.getString('descricao') || (prodIt ? prodIt.getString('descricao') : ''),
          cfop: cfopIt,
          codigo_ncm: ncmIt,
          unidade_comercial: (
            it.getString('unidade') ||
            (prodIt ? prodIt.getString('unidade_medida') : '') ||
            'UN'
          )
            .trim()
            .toUpperCase(),
          quantidade_comercial: qtdIt,
          valor_unitario_comercial: valorUnitIt,
          unidade_tributavel: (
            it.getString('unidade') ||
            (prodIt ? prodIt.getString('unidade_medida') : '') ||
            'UN'
          )
            .trim()
            .toUpperCase(),
          quantidade_tributavel: qtdIt,
          valor_unitario_tributavel: valorUnitIt,
          valor_bruto: brutoIt,
          valor_desconto: descontoIt,
          icms_origem:
            it.getString('origem') || (regraIt ? regraIt.getString('origem') : '0') || '0',
          icms_situacao_tributaria: situacaoIcmsIt,
        }
        if (cestIt) itemNovo.codigo_cest = cestIt
        if (gtinIt) {
          itemNovo.codigo_barra_comercial = gtinIt
          itemNovo.codigo_barra_tributavel = gtinIt
        }
        if (baseIcmsIt > 0) {
          itemNovo.icms_modalidade_base_calculo = modBcIt
          itemNovo.icms_base_calculo = baseIcmsIt
          itemNovo.icms_aliquota = aliqIcmsIt
          itemNovo.icms_valor = valorIcmsIt
        }
        if (aliqCredSimplesIt > 0) {
          itemNovo.icms_aliquota_credito = aliqCredSimplesIt
          itemNovo.icms_valor_credito = vlrCredSimplesIt
        }
        if (cstPisIt) itemNovo.pis_situacao_tributaria = cstPisIt
        if (valorPisIt > 0) {
          itemNovo.pis_base_calculo = basePisIt
          itemNovo.pis_aliquota_porcentual = aliqPisIt
          itemNovo.pis_valor = valorPisIt
        }
        if (cstCofinsIt) itemNovo.cofins_situacao_tributaria = cstCofinsIt
        if (valorCofinsIt > 0) {
          itemNovo.cofins_base_calculo = baseCofinsIt
          itemNovo.cofins_aliquota_porcentual = aliqCofinsIt
          itemNovo.cofins_valor = valorCofinsIt
        }

        if (informarIbsCbsDoc) {
          const cstIbsIt = (regraIt ? regraIt.getString('cst_ibs_cbs') : '') || '000'
          const cClassTribIt = (regraIt ? regraIt.getString('c_class_trib') : '') || '000001'
          const aliqUfIt = regraIt ? regraIt.getFloat('aliquota_ibs_uf') || 0 : 0
          const aliqMunIt = regraIt ? regraIt.getFloat('aliquota_ibs_municipio') || 0 : 0
          const aliqCbsIt = regraIt ? regraIt.getFloat('aliquota_cbs') || 0 : 0
          const ufAlq = aliqUfIt > 0 ? aliqUfIt : 0.1
          const cbsAlq = aliqCbsIt > 0 ? aliqCbsIt : 0.9
          const ufVlr = round2Re(valorBaseIt * (ufAlq / 100))
          const munVlr = round2Re(valorBaseIt * (aliqMunIt / 100))
          const ibsTotIt = round2Re(ufVlr + munVlr)
          const cbsVlrIt = round2Re(valorBaseIt * (cbsAlq / 100))
          itemNovo.ibs_cbs_situacao_tributaria = cstIbsIt
          itemNovo.ibs_cbs_classificacao_tributaria = cClassTribIt
          itemNovo.ibs_cbs_base_calculo = valorBaseIt
          itemNovo.ibs_uf_aliquota = ufAlq
          itemNovo.ibs_uf_valor = ufVlr
          itemNovo.ibs_mun_aliquota = aliqMunIt
          itemNovo.ibs_mun_valor = munVlr
          itemNovo.ibs_valor_total = ibsTotIt
          itemNovo.cbs_aliquota = cbsAlq
          itemNovo.cbs_valor = cbsVlrIt
          totIbsDoc = round2Re(totIbsDoc + ibsTotIt)
          totCbsDoc = round2Re(totCbsDoc + cbsVlrIt)
        }
        totProdutosDoc = round2Re(totProdutosDoc + brutoIt)
        totDescontoDoc = round2Re(totDescontoDoc + descontoIt)
        totValorTotalDoc = round2Re(totValorTotalDoc + liquidoIt)
        itensRemontados.push(itemNovo)
      }

      // ===== Pagamentos da venda (formas_pagamento) =====
      let pagamentosVenda = []
      try {
        pagamentosVenda = $app.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${vendaIdDoc}' && ativo = true`,
          'parcela,created',
        )
      } catch (_) {
        pagamentosVenda = []
      }
      const formasPagamentoDoc = []
      if (pagamentosVenda && pagamentosVenda.length > 0) {
        for (let p = 0; p < pagamentosVenda.length; p++) {
          const pg = pagamentosVenda[p]
          const formaId = pg.getString('forma_pagamento_id')
          let tpag = '01'
          if (formaId) {
            try {
              tpag =
                $app.findRecordById('formas_pagamento', formaId).getString('codigo_tpag') || '01'
            } catch (_) {}
          }
          const itemPg = {
            forma_pagamento: tpag,
            valor_pagamento: round2Re(pg.getFloat('valor') || 0),
          }
          const bandeiraPg = (pg.getString('bandeira') || '').trim()
          const codAutPg = (pg.getString('codigo_autorizacao') || pg.getString('nsu') || '').trim()
          if (bandeiraPg) itemPg.bandeira_operadora = bandeiraPg
          if (codAutPg) itemPg.numero_autorizacao = codAutPg
          formasPagamentoDoc.push(itemPg)
        }
      } else {
        formasPagamentoDoc.push({
          forma_pagamento: '01',
          valor_pagamento: round2Re(totValorTotalDoc),
        })
      }

      // ===== Destinatário: mesma regra da emissão (fiscal_nfce_emitir.js) —
      // sem cliente identificado (ou genérico "Consumidor Final") sai SEM destinatário;
      // CPF/CNPJ avulso do cupom usa só os dados informados. =====
      const cpfCnpjConsumidorDoc = (vendaDoc.getString('cpf_cnpj_consumidor') || '').replace(
        /\D/g,
        '',
      )
      let clienteDoc = null
      const clienteIdDoc = vendaDoc.getString('cliente_id')
      let clienteEhConsumidorFinalDoc = false
      if (clienteIdDoc) {
        try {
          clienteDoc = $app.findRecordById('clientes', clienteIdDoc)
          if (clienteDoc) {
            clienteEhConsumidorFinalDoc =
              clienteDoc.getBool('consumidor_final') ||
              (clienteDoc.getString('nome_razao_social') || '').trim().toLowerCase() ===
                'consumidor final'
          }
        } catch (_) {}
      }
      let temDestinatarioDoc = false
      let destinatarioNomeDoc = 'Consumidor'
      let destinatarioCpfCnpjDoc = ''
      if (cpfCnpjConsumidorDoc) {
        temDestinatarioDoc = true
        destinatarioCpfCnpjDoc = cpfCnpjConsumidorDoc
        destinatarioNomeDoc = 'Consumidor'
      } else if (clienteDoc && !clienteEhConsumidorFinalDoc) {
        temDestinatarioDoc = true
        destinatarioCpfCnpjDoc = (clienteDoc.getString('cpf_cnpj') || '').replace(/\D/g, '')
        destinatarioNomeDoc =
          clienteDoc.getString('nome_razao_social') || clienteDoc.getString('nome') || 'Consumidor'
      }

      const truncar60Doc = (t) => (t ? String(t).trim().slice(0, 60).trim() : '')

      // ===== Remonta o JSON completo a partir da venda (igual à emissão) —
      // não depende de json_enviado prévio; usa o antigo apenas como base parcial. =====
      const jsonBaseRaw = docRec.get('json_enviado')
      let jsonBase = null
      try {
        if (typeof jsonBaseRaw === 'object' && jsonBaseRaw !== null) jsonBase = jsonBaseRaw
        else if (typeof jsonBaseRaw === 'string' && jsonBaseRaw.trim()) {
          jsonBase = JSON.parse(jsonBaseRaw)
        }
      } catch (_) {
        jsonBase = null
      }
      if (!jsonBase || typeof jsonBase !== 'object') jsonBase = {}

      jsonBase.cnpj_emitente = cnpjEmitenteDoc
      jsonBase.nome_emitente = truncar60Doc(
        empresaDoc.getString('nome_documentos_fiscais') ||
          empresaDoc.getString('razao_social') ||
          '',
      )
      if (empresaDoc.getString('nome_fantasia')) {
        jsonBase.nome_fantasia_emitente = truncar60Doc(empresaDoc.getString('nome_fantasia'))
      }
      if (typeof jsonBase.natureza_operacao !== 'string' || !jsonBase.natureza_operacao) {
        jsonBase.natureza_operacao =
          configDoc.getString('natureza_operacao_venda') || 'Venda de mercadoria'
      }
      if (
        jsonBase.data_emissao === undefined ||
        jsonBase.data_emissao === null ||
        jsonBase.data_emissao === ''
      ) {
        jsonBase.data_emissao = new Date().toISOString()
      }
      if (jsonBase.tipo_documento === undefined) jsonBase.tipo_documento = 1
      if (jsonBase.finalidade_emissao === undefined) jsonBase.finalidade_emissao = 1
      jsonBase.consumidor_final = 1
      jsonBase.presenca_comprador = '1'
      jsonBase.modalidade_frete = 9
      jsonBase.local_destino = 1
      if (temDestinatarioDoc) {
        jsonBase.indicador_inscricao_estadual_destinatario = '9'
        jsonBase.nome_destinatario = truncar60Doc(
          ambiente === 'Produção'
            ? destinatarioNomeDoc
            : 'NF-C-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
        )
        jsonBase.uf_destinatario = ufEmitenteDoc
        jsonBase.codigo_municipio_destinatario = ibgeEmitenteDoc
        jsonBase.logradouro_destinatario = empresaDoc.getString('logradouro') || 'S/N'
        jsonBase.numero_destinatario = empresaDoc.getString('numero') || 'S/N'
        jsonBase.bairro_destinatario = empresaDoc.getString('bairro') || 'Centro'
        jsonBase.municipio_destinatario = empresaDoc.getString('municipio') || ''
        jsonBase.cep_destinatario = (empresaDoc.getString('cep') || '').replace(/\D/g, '')
        if (destinatarioCpfCnpjDoc.length === 11) {
          jsonBase.cpf_destinatario = destinatarioCpfCnpjDoc
          delete jsonBase.cnpj_destinatario
        } else if (destinatarioCpfCnpjDoc.length === 14) {
          jsonBase.cnpj_destinatario = destinatarioCpfCnpjDoc
          delete jsonBase.cpf_destinatario
        } else {
          delete jsonBase.cpf_destinatario
          delete jsonBase.cnpj_destinatario
        }
      } else {
        // Consumidor não identificado: remove TODO o grupo de destinatário
        delete jsonBase.nome_destinatario
        delete jsonBase.uf_destinatario
        delete jsonBase.codigo_municipio_destinatario
        delete jsonBase.logradouro_destinatario
        delete jsonBase.numero_destinatario
        delete jsonBase.bairro_destinatario
        delete jsonBase.municipio_destinatario
        delete jsonBase.cep_destinatario
        delete jsonBase.cpf_destinatario
        delete jsonBase.cnpj_destinatario
        delete jsonBase.ie_destinatario
      }
      jsonBase.items = itensRemontados
      jsonBase.formas_pagamento = formasPagamentoDoc
      const valorTrocoDoc = vendaDoc.getFloat('valor_troco') || 0
      if (valorTrocoDoc > 0) jsonBase.valor_troco = round2Re(valorTrocoDoc)
      else delete jsonBase.valor_troco
      if (informarIbsCbsDoc) {
        jsonBase.valor_total_ibs = totIbsDoc
        jsonBase.valor_total_cbs = totCbsDoc
      } else {
        delete jsonBase.valor_total_ibs
        delete jsonBase.valor_total_cbs
      }
      jsonEnviado = jsonBase

      // Reflete a remontagem no registro (destinatário e payload)
      docRec.set('destinatario_nome', temDestinatarioDoc ? truncar60Doc(destinatarioNomeDoc) : '')
      docRec.set('destinatario_cpf_cnpj', temDestinatarioDoc ? destinatarioCpfCnpjDoc : '')
      docRec.set('destinatario_uf', temDestinatarioDoc ? ufEmitenteDoc : '')
      docRec.set('cfop_principal', cfopPrimeiroDoc || '5102')
      docRec.set('valor_produtos', round2Re(totProdutosDoc))
      docRec.set('valor_desconto', round2Re(totDescontoDoc))
      docRec.set('valor_total', round2Re(totValorTotalDoc))
      docRec.set('valor_ibs', round2Re(totIbsDoc))
      docRec.set('valor_cbs', round2Re(totCbsDoc))
      docRec.set('json_enviado', jsonEnviado)
    } else {
      jsonEnviado = docRec.get('json_enviado')
      if (!jsonEnviado) {
        return c.json(400, {
          sucesso: false,
          message: 'Payload fiscal (json_enviado) não encontrado no registro para reenvio.',
        })
      }
    }
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
      if (modelo === '65' && jsonEnviado) docRec.set('json_enviado', jsonEnviado)
      $app.save(docRec)

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
        // Funções de fiscal_token_lib copiadas localmente dentro do callback (evita require(`${__hooks}/fiscal_token_lib.js`) que causa Invalid module no JSVM)
        function obterTokenFocus(empresaId, appInstance) {
          const app = appInstance || $app
          if (!empresaId) {
            return {
              token: '',
              origem: 'nenhuma',
              ambiente: 'Homologação',
              nomeSegredo: 'FOCUS_NFE_TOKEN_HOMOLOGACAO',
              codigoToken: '',
            }
          }

          let ambiente = 'Homologação'
          let codigoToken = ''
          try {
            const cfgs = app.findRecordsByFilter(
              'config_emissao_fiscal',
              `empresa_id = '${empresaId}' && ativo = true`,
              '-created',
              1,
              0,
            )
            if (cfgs && cfgs.length > 0) {
              const cfg = cfgs[0]
              ambiente = cfg.getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
              codigoToken = (cfg.getString('codigo_token') || '').trim().toUpperCase()
            }
          } catch (_) {}

          const ehProducao = ambiente === 'Produção'
          const sufixoAmbiente = ehProducao ? 'PRODUCAO' : 'HOMOLOGACAO'
          let nomeSegredo = codigoToken
            ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
            : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`

          try {
            const creds = app.findRecordsByFilter(
              'credenciais_fiscais',
              `empresa_id = '${empresaId}'`,
              '-created',
              1,
              0,
            )
            if (creds && creds.length > 0) {
              const credRec = creds[0]
              const tokenBanco = (
                ehProducao
                  ? credRec.getString('token_producao')
                  : credRec.getString('token_homologacao')
              ).trim()

              if (tokenBanco && tokenBanco.length > 0) {
                return {
                  token: tokenBanco,
                  origem: 'banco',
                  ambiente: ambiente,
                  nomeSegredo: nomeSegredo,
                  codigoToken: codigoToken,
                }
              }
            }
          } catch (_) {}

          let tokenSegredo = ''
          try {
            if (codigoToken) {
              tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
            }
          } catch (_) {
            tokenSegredo = ''
          }

          if (!tokenSegredo) {
            try {
              const empRec = app.findRecordById('empresas', empresaId)
              const codEmp = empRec.getInt('codigo')
              if (codEmp === 2) {
                const segEcommerce = (
                  $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || ''
                ).trim()
                if (segEcommerce) {
                  tokenSegredo = segEcommerce
                  nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
                }
              } else if (codEmp === 3) {
                const segFilial05 = (
                  $os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || ''
                ).trim()
                if (segFilial05) {
                  tokenSegredo = segFilial05
                  nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
                }
              }
            } catch (_) {}
          }

          if (!tokenSegredo) {
            try {
              const segPadrao = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
              if (segPadrao) {
                tokenSegredo = segPadrao
                nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
              }
            } catch (_) {}
          }

          if (tokenSegredo && tokenSegredo.length > 0) {
            return {
              token: tokenSegredo,
              origem: 'segredo',
              ambiente: ambiente,
              nomeSegredo: nomeSegredo,
              codigoToken: codigoToken,
            }
          }

          return {
            token: '',
            origem: 'nenhuma',
            ambiente: ambiente,
            nomeSegredo: nomeSegredo,
            codigoToken: codigoToken,
          }
        }

        const tokenInfo = obterTokenFocus(empresaId, $app)
        const ambiente = tokenInfo.ambiente
        const token = tokenInfo.token

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
