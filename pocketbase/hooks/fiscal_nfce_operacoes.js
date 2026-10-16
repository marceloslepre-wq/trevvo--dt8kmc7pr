// @ts-check
/// <reference path="../types.d.ts" />

/**
 * SERVIÇO DE EMISSÃO E PROCESSAMENTO DE NFC-E / DOCUMENTOS FISCAIS DE VENDA
 *
 * Endpoints:
 * - POST /backend/v1/fiscal/emitir-nfce-venda
 * - POST /backend/v1/fiscal/cancelar-nfce-venda
 *
 * Regras:
 * - A NFC-e sai pela empresa da venda (a loja onde está o terminal), com o token, a série e o CSC dessa empresa.
 * - Antes de emitir, confere csc_configurado = true e emite_nfce = true.
 * - Em caso de SEFAZ fora do ar / indisponibilidade, reenvia em contingência offline (forma_emissao=offline) e marca contingencia = true.
 * - Se autorizada: baixa o XML e grava em xml_arquivo, preenche número, série, chave, protocolo, qrcode_url, url_consulta, danfe_url,
 *   atualiza venda com documento_fiscal_status "Autorizada" e documento_fiscal_id.
 * - Se rejeitada: documento_fiscal_status "Rejeitada", status "Rejeitada" com mensagem. A venda NÃO é desfeita.
 * - Cancelamento: permissão excluir no módulo notas_saida; justificativa 15-255 chars; se autorizada pela SEFAZ,
 *   armazena xml_cancelamento, status "Cancelada" e venda com documento_fiscal_status "Cancelada".
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfce-venda',
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
    const forcarContingencia = Boolean(data.contingencia)

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

    const empresaId = venda.getString('empresa_id')
    let empresa = null
    try {
      empresa = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      empresa = null
    }

    if (!empresa || !empresa.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa da venda não encontrada ou inativa.' })
    }

    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Loja'

    // 2. Carregar configuração fiscal da empresa
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
        message: `Esta loja (${nomeEmpresa}) não possui configuração fiscal ativa.`,
      })
    }

    const config = configs[0]

    // Validação: empresa emite NFC-e?
    if (!config.getBool('emite_nfce')) {
      return c.json(400, {
        sucesso: false,
        message: `A loja (${nomeEmpresa}) não está configurada para emitir NFC-e (campo emite_nfce desativado).`,
      })
    }

    // Validação: CSC configurado?
    if (!config.getBool('csc_configurado')) {
      return c.json(400, {
        sucesso: false,
        message: 'CSC da NFC-e não configurado para esta loja.',
      })
    }

    // Token
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

    // 3. Obter ou gerar Rascunho fiscal (documentos_fiscais)
    let docRec = null
    const docsExistentes = $app.findRecordsByFilter(
      'documentos_fiscais',
      `venda_id = '${vendaId}' && modelo = '65'`,
      '-created',
      1,
      0,
    )

    if (docsExistentes && docsExistentes.length > 0) {
      docRec = docsExistentes[0]
      const statusAtualDoc = docRec.getString('status')
      if (statusAtualDoc === 'Autorizada') {
        return c.json(200, {
          sucesso: true,
          ja_autorizada: true,
          message: 'A NFC-e desta venda já está Autorizada.',
          documento_id: docRec.id,
          chave: docRec.getString('chave_acesso'),
          danfe_url: docRec.getString('danfe_url'),
        })
      }
    }

    let refFocus = ''
    let payloadFocus = null

    if (docRec && docRec.get('json_enviado')) {
      refFocus = docRec.getString('referencia')
      try {
        const je = docRec.get('json_enviado')
        payloadFocus = typeof je === 'string' ? JSON.parse(je) : je
      } catch (_) {
        payloadFocus = null
      }
    }

    if (!payloadFocus || !refFocus) {
      refFocus = `NFC_${empresaId.slice(0, 5)}_${vendaId.slice(0, 8)}_${Date.now()}`
      try {
        const resRasc = $http.send({
          method: 'POST',
          url: 'http://127.0.0.1:8090/backend/v1/fiscal/montar-rascunho',
          headers: {
            Authorization: c.requestInfo().headers['authorization'] || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            modelo: '65',
            origem: 'Venda',
            origem_id: vendaId,
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
        }
      } catch (eMontar) {
        console.warn('Erro ao chamar montar-rascunho internamente:', eMontar)
      }
    }

    if (!payloadFocus) {
      return c.json(400, {
        sucesso: false,
        message: 'Não foi possível estruturar os dados fiscais da venda para a Focus NFe.',
      })
    }

    // Ajustar dados fixos de NFC-e
    payloadFocus.presenca_comprador = '1'
    payloadFocus.modalidade_frete = 9
    payloadFocus.local_destino = 1
    payloadFocus.consumidor_final = 1

    const executarChamadaFocus = (formaEmissao) => {
      let url = `${baseUrl}/nfce?ref=${encodeURIComponent(refFocus)}`
      if (formaEmissao) {
        url += `&forma_emissao=${encodeURIComponent(formaEmissao)}`
      }
      const authHeader = 'Basic ' + encodeBase64(token + ':')
      const res = $http.send({
        method: 'POST',
        url: url,
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadFocus),
        timeout: 60,
      })
      const statusCode = res.statusCode || 200
      const rawText = res.raw ? res.raw : ''
      let json = null
      try {
        json = JSON.parse(rawText)
      } catch (_) {
        json = null
      }
      return { statusCode, json, rawText }
    }

    // 4. Executar chamada Focus NFe
    let tentativaContingencia = forcarContingencia
    let resultadoEnvio = null

    try {
      resultadoEnvio = executarChamadaFocus(tentativaContingencia ? 'offline' : undefined)
    } catch (errHttp) {
      resultadoEnvio = { statusCode: 500, json: null, rawText: String(errHttp) }
    }

    // Se falhou por indisponibilidade da SEFAZ, tenta reenviar em contingência offline
    const rawLower = (resultadoEnvio.rawText || '').toLowerCase()
    const msgLower = (
      resultadoEnvio.json?.mensagem ||
      resultadoEnvio.json?.message ||
      ''
    ).toLowerCase()
    const sefazFora =
      !tentativaContingencia &&
      (resultadoEnvio.statusCode === 500 ||
        resultadoEnvio.statusCode === 503 ||
        resultadoEnvio.statusCode === 504 ||
        rawLower.includes('sefaz') ||
        rawLower.includes('indisponivel') ||
        rawLower.includes('fora do ar') ||
        rawLower.includes('tempo limite') ||
        msgLower.includes('sefaz') ||
        msgLower.includes('indisponível') ||
        msgLower.includes('tempo limite') ||
        msgLower.includes('timeout'))

    if (sefazFora) {
      tentativaContingencia = true
      try {
        resultadoEnvio = executarChamadaFocus('offline')
      } catch (errCont) {
        console.warn('Falha na tentativa de contingência:', errCont)
      }
    }

    const { statusCode, json: respJson, rawText } = resultadoEnvio
    const statusFocus = respJson?.status || ''

    // 5. Tratar resposta da Focus
    const ehAutorizada =
      statusFocus === 'autorizado' ||
      statusFocus === 'emitido' ||
      statusFocus === 'contingencia' ||
      (statusCode === 200 && (respJson?.chave_nfe || respJson?.caminho_xml_nota_fiscal))

    const ehContingencia = tentativaContingencia || statusFocus === 'contingencia'

    // Garantir registro em documentos_fiscais
    if (!docRec) {
      const colDoc = $app.findCollectionByNameOrId('documentos_fiscais')
      docRec = new Record(colDoc)
      docRec.set('empresa_id', empresaId)
      docRec.set('modelo', '65')
      docRec.set('tipo_documento', 1)
      docRec.set('finalidade', 1)
      docRec.set('ambiente', ambiente)
      docRec.set('origem', 'Venda')
      docRec.set('venda_id', vendaId)
      docRec.set('referencia', refFocus)
    }

    docRec.set('json_enviado', payloadFocus)
    docRec.set('json_retorno', respJson || { raw: rawText })
    docRec.set('usuario_emissao_id', userId)

    if (ehAutorizada) {
      const numeroNota = Number(respJson?.numero) || undefined
      const serieNota = respJson?.serie
        ? String(respJson.serie)
        : config.getString('serie_nfce') || '1'
      const chaveNota = respJson?.chave_nfe || respJson?.chave || ''
      const protocoloNota = respJson?.protocolo || ''
      const qrcodeUrl = respJson?.qrcode_url || ''
      const urlConsulta = respJson?.url_consulta || ''
      const danfeUrl =
        respJson?.danfe_url ||
        (respJson?.caminho_danfe ? `${baseUrlOrigin}${respJson.caminho_danfe}` : '')

      docRec.set('status', 'Autorizada')
      docRec.set('contingencia', ehContingencia)
      if (numeroNota) docRec.set('numero', numeroNota)
      if (serieNota) docRec.set('serie', serieNota)
      if (chaveNota) docRec.set('chave_acesso', chaveNota)
      if (protocoloNota) docRec.set('protocolo', protocoloNota)
      if (qrcodeUrl) docRec.set('qrcode_url', qrcodeUrl)
      if (urlConsulta) docRec.set('url_consulta', urlConsulta)
      if (danfeUrl) docRec.set('danfe_url', danfeUrl)
      docRec.set('data_autorizacao', new Date().toISOString())
      docRec.set('status_sefaz', respJson?.status_sefaz || statusFocus || '100')
      docRec.set('mensagem_sefaz', respJson?.mensagem_sefaz || 'Autorizado o uso da NF-e')

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
            const fileName = `nfce_${refFocus}.xml`
            const fileUpload = $filesystem.fileFromBytes(Buffer.from(resXml.raw, 'utf-8'), fileName)
            docRec.set('xml_arquivo', fileUpload)
          }
        } catch (errXml) {
          console.warn('Erro ao baixar/gravar XML da NFC-e:', errXml)
        }
      }

      $app.save(docRec)

      // Atualizar venda pelo backend
      venda.set('documento_fiscal_status', 'Autorizada')
      venda.set('documento_fiscal_id', docRec.id)
      $app.save(venda)

      // Registrar auditoria
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
            operacao: 'EMISSAO_NFCE_AUTORIZADA',
            venda_id: vendaId,
            numero: numeroNota,
            serie: serieNota,
            chave: chaveNota,
            contingencia: ehContingencia,
          }),
        )
        $app.save(aRec)
      } catch (_) {}

      return c.json(200, {
        sucesso: true,
        status: 'Autorizada',
        contingencia: ehContingencia,
        documento_id: docRec.id,
        numero: numeroNota,
        serie: serieNota,
        chave: chaveNota,
        protocolo: protocoloNota,
        danfe_url: danfeUrl,
        qrcode_url: qrcodeUrl,
        url_consulta: urlConsulta,
        message: ehContingencia
          ? 'NFC-e emitida em contingência offline (SEFAZ indisponível).'
          : 'NFC-e autorizada com sucesso pela SEFAZ.',
      })
    } else {
      // Rejeitada ou Erro
      let motivoRejeicao =
        respJson?.mensagem_sefaz ||
        respJson?.mensagem ||
        respJson?.message ||
        `Focus NFe HTTP ${statusCode}`
      if (Array.isArray(respJson?.erros) && respJson.erros.length > 0) {
        motivoRejeicao = respJson.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }

      docRec.set('status', 'Rejeitada')
      docRec.set('status_sefaz', respJson?.status_sefaz || statusFocus || 'Rejeição')
      docRec.set('mensagem_sefaz', motivoRejeicao)
      docRec.set('erros', respJson?.erros || [{ mensagem: motivoRejeicao }])
      $app.save(docRec)

      // Atualiza venda com documento_fiscal_status "Rejeitada"
      venda.set('documento_fiscal_status', 'Rejeitada')
      venda.set('documento_fiscal_id', docRec.id)
      $app.save(venda)

      // Auditoria
      try {
        const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
        const aRec = new Record(auditCol)
        aRec.set('empresa_id', empresaId)
        aRec.set('usuario_id', userId)
        aRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
        aRec.set('tabela', 'documentos_fiscais')
        aRec.set('registro_id', docRec.id)
        aRec.set('acao', 'alteracao')
        aRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'EMISSAO_NFCE_REJEITADA',
            venda_id: vendaId,
            motivo: motivoRejeicao,
          }),
        )
        $app.save(aRec)
      } catch (_) {}

      return c.json(200, {
        sucesso: false,
        status: 'Rejeitada',
        documento_id: docRec.id,
        ref: refFocus,
        message: motivoRejeicao,
        detalhes: respJson || rawText,
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/fiscal/cancelar-nfce-venda
 * Body: { venda_id: string, justificativa: string, cancelar_venda?: boolean }
 */
routerAdd(
  'POST',
  '/backend/v1/fiscal/cancelar-nfce-venda',
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
    const justificativa = (data.justificativa || '').trim()
    const deveCancelarVendaTambem = Boolean(data.cancelar_venda)

    if (!vendaId) {
      return c.json(400, { sucesso: false, message: 'Campo venda_id é obrigatório.' })
    }

    if (!justificativa || justificativa.length < 15 || justificativa.length > 255) {
      return c.json(400, {
        sucesso: false,
        message: 'A justificativa de cancelamento deve ter entre 15 e 255 caracteres.',
      })
    }

    // Checagem de permissão: excluir em notas_saida
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

    // 1. Carregar documento fiscal autorizado
    const docs = $app.findRecordsByFilter(
      'documentos_fiscais',
      `venda_id = '${vendaId}' && status = 'Autorizada' && modelo = '65'`,
      '-created',
      1,
      0,
    )

    if (!docs || docs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Nenhuma NFC-e autorizada encontrada para esta venda.',
      })
    }

    const docRec = docs[0]
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
      return c.json(400, { sucesso: false, message: 'Configuração fiscal da loja não encontrada.' })
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

    // 2. Chamar Focus DELETE /nfce/{ref}
    const url = `${baseUrl}/nfce/${encodeURIComponent(refFocus)}`
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

      // Se passou o prazo da SEFAZ, orientar devolução
      const prazoExpirado =
        msgErro.toLowerCase().includes('prazo') ||
        msgErro.toLowerCase().includes('fora do prazo') ||
        jsonResp?.status_sefaz === '151' ||
        jsonResp?.status_sefaz === '501'

      if (prazoExpirado) {
        msgErro +=
          '. O prazo legal de cancelamento da SEFAZ expirou. Para anular a operação, emita uma Devolução de Venda.'
      }

      return c.json(400, {
        sucesso: false,
        message: msgErro,
        prazo_expirado: prazoExpirado,
        detalhes: jsonResp || rawText,
      })
    }

    // 3. Atualizar documento fiscal com Cancelada e guardar xml_cancelamento
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
          const fileName = `cancelamento_nfce_${refFocus}.xml`
          const fileUpload = $filesystem.fileFromBytes(
            Buffer.from(resCancXml.raw, 'utf-8'),
            fileName,
          )
          docRec.set('xml_cancelamento', fileUpload)
        }
      } catch (errXml) {
        console.warn('Erro ao salvar XML de cancelamento:', errXml)
      }
    }

    $app.save(docRec)

    // 4. Atualizar venda (documento_fiscal_status "Cancelada")
    const venda = $app.findRecordById('vendas', vendaId)
    venda.set('documento_fiscal_status', 'Cancelada')
    $app.save(venda)

    // Auditoria fiscal
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
          operacao: 'CANCELAR_NFCE',
          venda_id: vendaId,
          justificativa,
          data_cancelamento: dataCancelamento,
        }),
      )
      $app.save(aRec)
    } catch (_) {}

    // 5. Se foi pedido "Cancelar NFC-e e a venda", executa o cancelamento da venda
    let vendaCanceladaSucesso = false
    let vendaCanceladaMensagem = ''
    if (deveCancelarVendaTambem) {
      try {
        const resCancVenda = $http.send({
          method: 'POST',
          url: 'http://127.0.0.1:8090/backend/v1/vendas/cancelar',
          headers: {
            Authorization: c.requestInfo().headers['authorization'] || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            venda_id: vendaId,
            motivo: `Cancelamento de NFC-e: ${justificativa}`,
          }),
          timeout: 30,
        })
        const jsonVenda = JSON.parse(resCancVenda.raw || '{}')
        if (jsonVenda && jsonVenda.sucesso) {
          vendaCanceladaSucesso = true
        } else {
          vendaCanceladaMensagem = jsonVenda?.message || 'Falha ao estornar a venda no ERP.'
        }
      } catch (errCancV) {
        vendaCanceladaMensagem = String(errCancV)
      }
    }

    return c.json(200, {
      sucesso: true,
      message: 'NFC-e cancelada com sucesso na SEFAZ.',
      venda_cancelada: vendaCanceladaSucesso,
      venda_cancelada_mensagem: vendaCanceladaMensagem || undefined,
      documento_id: docRec.id,
    })
  },
  $apis.requireAuth(),
)
