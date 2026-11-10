// reenvio 9.8r4 — correção NFC-e: sem require (Invalid module), sem loopback para montar-rascunho,
// documento fiscal gravado ANTES da chamada à Focus, try/catch com mensagem real em pt-BR.
// Envio ÚNICO por venda: (1) guarda de idempotência — documento 65 em Processando ou Autorizada
// nunca reenvia à Focus; (2) o retry de contingência só ocorre em falha real de comunicação
// (HTTP 5xx / indisponível / fora do ar / timeout) — texto contendo "sefaz" na resposta não
// dispara 2º POST (era a causa do envio duplicado com a mesma referência); (3) resposta
// "nota já foi emitida/autorizada" da Focus: consulta GET pela referência (mesmo fluxo do
// botão Consultar do monitor) e grava o status real (Autorizada) com nº, série, chave,
// protocolo e links XML/DANFE — nunca "Rejeitada".
// IBS/CBS (Reforma Tributária): com "Destacar IBS e CBS" ligado na config de emissão, cada item
// leva o grupo gIBSCBS (CST 000 / cClassTrib 000001, base = valor do item, CBS 0,9% / IBS UF 0,1% /
// IBS mun 0% de teste 2026) e a nota leva valor_total_ibs / valor_total_cbs (nomes oficiais Focus).
// @ts-check
/// <reference path="../types.d.ts" />

/**
 * POST /backend/v1/fiscal/emitir-nfce-venda (reescrito; substitui o antigo fiscal_nfce_operacoes.js)
 * Body: { venda_id: string, contingencia?: boolean }
 *
 * Regras (alinhadas a emitir-nfe-venda e fiscal_documentos_operacoes.js):
 * - Dados fiscais montados LOCALMENTE (nada de HTTP interno).
 * - Registro em documentos_fiscais (modelo 65) gravado antes de chamar a Focus;
 *   em erro interno ou rejeição, o registro fica com status "Rejeitada" e a mensagem real.
 * - Nunca grava "Processando" em vendas.documento_fiscal_status.
 * - Resposta: { sucesso, erro_interno: boolean, status, message } — erro_interno=true quando
 *   a falha é nossa (antes da SEFAZ); "Rejeitada" só quando Focus/SEFAZ devolve rejeição.
 * - Token Focus da empresa da venda (credenciais_fiscais → segredo por codigo_token/codigo).
 * - Nota: helpers locais (sem require) porque o JSVM do pb_hooks não carrega módulos próprios
 *   dentro de callbacks ("Invalid module").
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfce-venda',
  (c) => {
    // ===== Helpers locais no início do corpo do callback =====
    // Regra do JSVM do pb_hooks: o callback roda em um pool de VM separado, então
    // funções/constantes de nível superior do arquivo NÃO são visíveis dentro dele.
    // (mesmo padrão de eMaster/empresasDoUsuario/exigirEmpresaDoUsuario/obterTokenFocus abaixo)
    function encodeBase64Nfce(str) {
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
      const len = str.length
      let i = 0
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

    function truncar60(texto) {
      if (!texto) return ''
      return String(texto).trim().slice(0, 60).trim()
    }

    function round2(v) {
      return Math.round((Number(v) || 0) * 100) / 100
    }

    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, {
        sucesso: false,
        erro_interno: true,
        message: 'Autenticação obrigatória.',
      })
    }

    // ===== Helpers locais (cópia de tenancy.js / fiscal_token_lib.js — sem require) =====
    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(auth) {
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
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
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
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
        } catch (_) {}
      }
      if (!usuarioRec) return []
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) return []
      if (eMaster(auth)) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imps = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + auth.id + "'",
              '-created',
              1,
              0,
            )
            if (imps && imps.length > 0) assinanteId = imps[0].getString('assinante_id')
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
      if (isAdmin || eMaster(auth)) {
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

    function exigirEmpresaDoUsuario(authRec, empresaId) {
      if (!empresaId) throw new BadRequestError('ID da empresa é obrigatório.')
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

    function obterTokenFocus(empresaId) {
      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const configs = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          ambiente = configs[0].getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (configs[0].getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}
      const sufixoAmbiente = ambiente === 'Produção' ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
      try {
        const creds = $app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const cred = creds[0]
          const tokenBanco = (
            ambiente === 'Produção'
              ? cred.getString('token_producao')
              : cred.getString('token_homologacao')
          ).trim()
          if (tokenBanco) {
            return { token: tokenBanco, ambiente, nomeSegredo, codigoToken }
          }
        }
      } catch (_) {}
      let tokenSegredo = ''
      try {
        if (codigoToken) tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
      } catch (_) {}
      if (!tokenSegredo) {
        try {
          const codEmp = $app.findRecordById('empresas', empresaId).getInt('codigo')
          if (codEmp === 2) {
            const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || '').trim()
            if (s) {
              tokenSegredo = s
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || '').trim()
            if (s) {
              tokenSegredo = s
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }
      if (!tokenSegredo) {
        try {
          const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (s) {
            tokenSegredo = s
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }
      return { token: tokenSegredo, ambiente, nomeSegredo, codigoToken }
    }

    // ===== Fluxo principal =====
    const userId = authRecord.id
    let data = {}
    try {
      data = c.requestInfo().body || {}
    } catch (_) {
      data = {}
    }
    const vendaId = data.venda_id
    const forcarContingencia = Boolean(data.contingencia)

    if (!vendaId) {
      return c.json(400, {
        sucesso: false,
        erro_interno: true,
        message: 'Campo venda_id é obrigatório.',
      })
    }

    // 1. Carregar venda
    let venda = null
    try {
      venda = $app.findRecordById('vendas', vendaId)
    } catch (_) {
      venda = null
    }
    if (!venda || !venda.getBool('ativo')) {
      return c.json(400, {
        sucesso: false,
        erro_interno: true,
        message: 'Venda não encontrada ou inativa.',
      })
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
        erro_interno: true,
        message: 'Empresa da venda não encontrada ou inativa.',
      })
    }
    const nomeEmpresa =
      empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Loja'

    let config = null
    let ambiente = 'Homologação'
    let token = ''
    let nomeSegredo = 'FOCUS_NFE_TOKEN_HOMOLOGACAO'

    // Registra o erro interno no documentos_fiscais (se já conseguimos carregar a venda)
    const registrarErroInterno = (msg) => {
      try {
        const colDoc = $app.findCollectionByNameOrId('documentos_fiscais')
        let doc = null
        try {
          const docs = $app.findRecordsByFilter(
            'documentos_fiscais',
            `venda_id = '${vendaId}' && modelo = '65'`,
            '-created',
            1,
            0,
          )
          if (docs && docs.length > 0) doc = docs[0]
        } catch (_) {}
        if (!doc) {
          doc = new Record(colDoc)
          doc.set('empresa_id', empresaId)
          doc.set('modelo', '65')
          doc.set('tipo_documento', 1)
          doc.set('finalidade', 1)
          doc.set('ambiente', ambiente)
          doc.set('origem', 'Venda')
          doc.set('venda_id', vendaId)
          doc.set(
            'referencia',
            `NFC_${String(empresaId).slice(0, 5)}_${String(vendaId).slice(0, 8)}_${Date.now()}`,
          )
          doc.set('serie', (config ? config.getString('serie_nfce') : '') || '1')
        }
        // valores válidos do select status: usa "Rejeitada" com status_sefaz marcando erro interno
        doc.set('status', 'Rejeitada')
        doc.set('status_sefaz', 'ERRO_INTERNO')
        doc.set('mensagem_sefaz', msg)
        doc.set('json_retorno', { erro_interno: true, message: msg })
        if (config && config.getBool('csc_configurado')) doc.set('contingencia', false)
        $app.save(doc)
        venda.set('documento_fiscal_status', 'Rejeitada')
        venda.set('documento_fiscal_id', doc.id)
        $app.save(venda)
      } catch (errDoc) {
        console.warn(
          '[emitir-nfce-venda] Falha ao registrar erro interno no documentos_fiscais:',
          errDoc,
        )
      }
    }

    try {
      // Permissão multi-tenant
      try {
        exigirEmpresaDoUsuario(authRecord, empresaId)
      } catch (errEmp) {
        return c.json(403, {
          sucesso: false,
          erro_interno: true,
          message: errEmp.message || 'Acesso negado à empresa especificada.',
        })
      }

      // 2. Configuração fiscal + validações NFC-e
      let configs = []
      try {
        configs = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
      } catch (_) {
        configs = []
      }
      if (!configs || configs.length === 0) {
        return c.json(400, {
          sucesso: false,
          erro_interno: true,
          message: `Esta loja (${nomeEmpresa}) não possui configuração fiscal ativa.`,
        })
      }
      config = configs[0]
      if (!config.getBool('emite_nfce')) {
        return c.json(400, {
          sucesso: false,
          erro_interno: true,
          message: `A loja (${nomeEmpresa}) não está configurada para emitir NFC-e (campo emite_nfce desativado).`,
        })
      }
      if (!config.getBool('csc_configurado')) {
        return c.json(400, {
          sucesso: false,
          erro_interno: true,
          message: `CSC da NFC-e não configurado para a loja (${nomeEmpresa}).`,
        })
      }

      // 3. Token Focus da empresa da venda
      const tokenInfo = obterTokenFocus(empresaId)
      ambiente = tokenInfo.ambiente
      nomeSegredo = tokenInfo.nomeSegredo
      token = tokenInfo.token
      if (!token) {
        return c.json(400, {
          sucesso: false,
          erro_interno: true,
          message: `Token da Focus NFe não encontrado para ${nomeEmpresa}: cadastre na tela de credenciais fiscais ou crie o segredo ${nomeSegredo} no Skip Cloud.`,
        })
      }

      // 4. Documento existente? GUARDA DE IDEMPOTÊNCIA (envio único por venda):
      // documento 65 já Autorizada OU em Processando NUNCA é reenviado à Focus —
      // devolve o status atual do documento.
      let docRec = null
      try {
        const docsExistentes = $app.findRecordsByFilter(
          'documentos_fiscais',
          `venda_id = '${vendaId}' && modelo = '65'`,
          '-created',
          1,
          0,
        )
        if (docsExistentes && docsExistentes.length > 0) docRec = docsExistentes[0]
      } catch (_) {}
      if (docRec) {
        const statusDocAtual = docRec.getString('status')
        const statusSefazDocAtual = docRec.getString('status_sefaz')
        const jaAutorizadaDoc =
          statusDocAtual === 'Autorizada' && statusSefazDocAtual !== 'ERRO_INTERNO'
        if (jaAutorizadaDoc || statusDocAtual === 'Processando') {
          let numeroDocAtual
          try {
            numeroDocAtual = docRec.getInt('numero') || undefined
          } catch (_) {
            numeroDocAtual = undefined
          }
          console.log(
            '[emitir-nfce-venda] Envio bloqueado pela guarda de idempotência — documento 65 da venda já está ' +
              statusDocAtual +
              '.',
          )
          return c.json(200, {
            sucesso: true,
            ja_autorizada: jaAutorizadaDoc,
            status: statusDocAtual,
            message:
              statusDocAtual === 'Processando'
                ? 'A NFC-e desta venda já está em transmissão (Processando) — não reenviada à Focus. Use "Consultar" no monitor fiscal para buscar o status real.'
                : 'A NFC-e desta venda já está Autorizada — não reenviada à Focus.',
            documento_id: docRec.id,
            numero: numeroDocAtual,
            serie: docRec.getString('serie'),
            chave: docRec.getString('chave_acesso'),
            protocolo: docRec.getString('protocolo'),
            danfe_url: docRec.getString('danfe_url'),
          })
        }
      }

      // 5. Montar JSON Focus LOCALMENTE (sem loopback)
      const itensOrigem = $app.findRecordsByFilter(
        'vendas_itens',
        `venda_id = '${vendaId}' && ativo = true`,
        'item,created',
      )
      if (!itensOrigem || itensOrigem.length === 0) {
        throw new Error('A venda não possui itens lançados — não é possível emitir NFC-e.')
      }
      let pagamentosOrigem = []
      try {
        pagamentosOrigem = $app.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${vendaId}' && ativo = true`,
          'parcela,created',
        )
      } catch (_) {
        pagamentosOrigem = []
      }

      const cnpjEmitenteLimpo = (empresa.getString('cnpj') || '').replace(/\D/g, '')
      const ufEmitente = (empresa.getString('uf') || '').trim().toUpperCase()
      const ibgeEmitente = (empresa.getString('codigo_municipio_ibge') || '').trim()
      const regimeApuracaoEmitente = (empresa.getString('regime_apuracao') || '').trim()
      const crtEmitenteRaw = empresa.get('crt')
      const crtEmitente =
        crtEmitenteRaw !== null && crtEmitenteRaw !== undefined && crtEmitenteRaw !== ''
          ? Number(crtEmitenteRaw)
          : null
      const ehSimples = regimeApuracaoEmitente
        ? regimeApuracaoEmitente === 'Simples Nacional'
        : crtEmitente === 1 || crtEmitente === 2 || crtEmitente === 4
      const aliqCreditoSimples = empresa.getFloat('aliquota_credito_simples') || 0

      if (!cnpjEmitenteLimpo || cnpjEmitenteLimpo.length !== 14) {
        throw new Error(`Empresa emitente (${nomeEmpresa}) com CNPJ inválido ou incompleto.`)
      }

      const seriePadrao = config.getString('serie_nfce') || '1'
      const naturezaPadrao = config.getString('natureza_operacao_venda') || 'Venda de mercadoria'
      const infoComplPadrao = config.getString('informacoes_complementares_padrao') || ''
      // "Destacar IBS e CBS (Reforma Tributária)" — opção da config de emissão da loja
      const informarIbsCbs = config.getBool('informar_ibs_cbs')

      // Destinatário: apenas quando IDENTIFICADO — CPF/CNPJ informado avulso no PDV
      // (cpf_cnpj_consumidor) ou cliente da venda que NÃO seja o genérico "Consumidor
      // Final" (consumidor_final = true). Venda de consumidor não identificado sai SEM
      // grupo de destinatário (não herda o cliente padrão da config de vendas, que pode
      // ser qualquer cadastro — ex. TESTE PF SP — nem o CPF dele).
      const cpfCnpjConsumidor = (venda.getString('cpf_cnpj_consumidor') || '').replace(/\D/g, '')
      let clienteRec = null
      const clienteId = venda.getString('cliente_id')
      let clienteEhConsumidorFinal = false
      if (clienteId) {
        try {
          clienteRec = $app.findRecordById('clientes', clienteId)
          if (clienteRec) {
            clienteEhConsumidorFinal =
              clienteRec.getBool('consumidor_final') ||
              (clienteRec.getString('nome_razao_social') || '').trim().toLowerCase() ===
                'consumidor final'
          }
        } catch (_) {}
      }
      let temDestinatario = false
      let destinatarioNome = 'Consumidor'
      let destinatarioCpfCnpj = ''
      const destinatarioUf = ufEmitente
      if (cpfCnpjConsumidor) {
        // CPF/CNPJ informado avulso no cupom: usa SOMENTE os dados informados
        temDestinatario = true
        destinatarioCpfCnpj = cpfCnpjConsumidor
        destinatarioNome = 'Consumidor'
      } else if (clienteRec && !clienteEhConsumidorFinal) {
        const cpfCnpjCliente = (clienteRec.getString('cpf_cnpj') || '').replace(/\D/g, '')
        temDestinatario = true
        destinatarioCpfCnpj = cpfCnpjCliente
        destinatarioNome =
          clienteRec.getString('nome_razao_social') || clienteRec.getString('nome') || 'Consumidor'
      }

      const ehOperacaoInterna = true // NFC-e de PDV: sempre operação interna
      const cenarioRegra = 'VENDA_INTERNA_CONSUMIDOR'

      let somaLiquidaItens = 0
      for (let i = 0; i < itensOrigem.length; i++) {
        const it = itensOrigem[i]
        const bruto = round2(
          (it.getFloat('quantidade') || 0) * (it.getFloat('preco_unitario') || 0),
        )
        somaLiquidaItens = round2(
          somaLiquidaItens +
            bruto -
            (it.getFloat('desconto_valor') || 0) +
            (it.getFloat('acrescimo_valor') || 0),
        )
      }

      const itensFocus = []
      let totValorProdutos = 0
      let totValorDesconto = 0
      let totBaseIcms = 0
      let totValorIcms = 0
      let totValorPis = 0
      let totValorCofins = 0
      let totValorIbs = 0
      let totValorCbs = 0
      let totValorTotal = 0
      let cfopPrimeiroItem = ''

      for (let idx = 0; idx < itensOrigem.length; idx++) {
        const itRec = itensOrigem[idx]
        const numItem = idx + 1
        const prodId = itRec.getString('produto_id')
        let prodRec = null
        if (prodId) {
          try {
            prodRec = $app.findRecordById('produtos', prodId)
          } catch (_) {}
        }
        const descricao =
          itRec.getString('descricao') ||
          (prodRec ? prodRec.getString('descricao') : `Item ${numItem}`)
        const codigo = prodRec
          ? prodRec.getString('codigo') || prodRec.getString('codigo_interno') || prodId
          : prodId
        const unidade = (
          itRec.getString('unidade') ||
          (prodRec ? prodRec.getString('unidade_medida') : '') ||
          'UN'
        )
          .trim()
          .toUpperCase()
        const quantidade = itRec.getFloat('quantidade') || 0
        const valorUnitario = itRec.getFloat('preco_unitario') || 0
        const valorBruto = round2(quantidade * valorUnitario)
        const descontoItem = round2(
          (itRec.getFloat('desconto_valor') || 0) - (itRec.getFloat('acrescimo_valor') || 0),
        )
        const valorTotalItem = round2(valorBruto - descontoItem)
        const valorBaseInicial = valorTotalItem

        const ncm = (
          itRec.getString('ncm') ||
          (prodRec ? prodRec.getString('ncm') : '') ||
          ''
        ).replace(/\D/g, '')
        if (!ncm || ncm.length !== 8) {
          throw new Error(
            `Item ${numItem} (${descricao}): NCM "${ncm}" inválido (deve ter 8 dígitos numéricos).`,
          )
        }
        const cest = (
          itRec.getString('cest') ||
          (prodRec ? prodRec.getString('cest') : '') ||
          ''
        ).replace(/\D/g, '')
        const gtin = prodRec
          ? prodRec.getString('gtin') || prodRec.getString('codigo_barras') || ''
          : ''

        // Regra tributária (cfop em perfis_tributarios_regras é RELAÇÃO → resolver código)
        const perfilId =
          itRec.getString('perfil_tributario_id') ||
          (prodRec ? prodRec.getString('perfil_tributario_id') : '')
        let regraRec = null
        if (perfilId) {
          try {
            const regras = $app.findRecordsByFilter(
              'perfis_tributarios_regras',
              `perfil_id = '${perfilId}' && cenario = '${cenarioRegra}' && ativo = true`,
              '',
              1,
              0,
            )
            if (regras && regras.length > 0) regraRec = regras[0]
          } catch (_) {}
        }
        let cfop = itRec.getString('cfop') || (regraRec ? regraRec.getString('cfop') : '')
        if (cfop) {
          try {
            const cfopRec = $app.findRecordById('cfop', cfop)
            cfop = cfopRec.getString('codigo') || cfop
          } catch (_) {}
        }
        if (!cfop) cfop = '5102'
        if (!cfopPrimeiroItem) cfopPrimeiroItem = cfop

        let cstIcms =
          itRec.getString('cst_icms') || (regraRec ? regraRec.getString('cst_icms') : '') || ''
        let csosn = itRec.getString('csosn') || (regraRec ? regraRec.getString('csosn') : '') || ''
        if (ehSimples) {
          if (!csosn) csosn = '102'
        } else {
          if (!cstIcms) cstIcms = '00'
        }
        const situacaoIcms = ehSimples ? csosn : cstIcms

        const origemMercadoria =
          itRec.getString('origem') || (regraRec ? regraRec.getString('origem') : '0') || '0'
        const modBcIcms = regraRec ? regraRec.getString('mod_bc_icms') || '3' : '3'
        let aliqIcms =
          itRec.getFloat('aliquota_icms') ||
          (regraRec ? regraRec.getFloat('aliquota_icms') || 0 : 0)

        let baseIcms = 0
        let valorIcms = 0
        const tributaIcmsIntegral =
          (!ehSimples &&
            (cstIcms === '00' || cstIcms === '10' || cstIcms === '20' || cstIcms === '70')) ||
          (ehSimples && csosn === '900')
        if (tributaIcmsIntegral && aliqIcms > 0) {
          baseIcms = round2(valorBaseInicial)
          valorIcms = round2(baseIcms * (aliqIcms / 100))
        }

        let aliquotaCreditoSimplesItem = 0
        let valorCreditoSimplesItem = 0
        if (ehSimples && csosn === '101' && aliqCreditoSimples > 0) {
          aliquotaCreditoSimplesItem = aliqCreditoSimples
          valorCreditoSimplesItem = round2(valorBaseInicial * (aliqCreditoSimples / 100))
        }

        const cstPis =
          itRec.getString('cst_pis') || (regraRec ? regraRec.getString('cst_pis') : '07') || '07'
        const aliqPis = regraRec ? regraRec.getFloat('aliquota_pis') || 0 : 0
        const cstCofins =
          itRec.getString('cst_cofins') ||
          (regraRec ? regraRec.getString('cst_cofins') : '07') ||
          '07'
        const aliqCofins = regraRec ? regraRec.getFloat('aliquota_cofins') || 0 : 0
        let basePis = 0
        let valorPis = 0
        let baseCofins = 0
        let valorCofins = 0
        if (!ehSimples && ['01', '02'].includes(cstPis) && aliqPis > 0) {
          basePis = valorBaseInicial
          valorPis = round2(basePis * (aliqPis / 100))
        }
        if (!ehSimples && ['01', '02'].includes(cstCofins) && aliqCofins > 0) {
          baseCofins = valorBaseInicial
          valorCofins = round2(baseCofins * (aliqCofins / 100))
        }

        // IBS/CBS (Reforma Tributária) — grupo gIBSCBS do item (nomes oficiais da Focus):
        // CST/cClassTrib do perfil tributário (default CST 000 / cClassTrib 000001);
        // base = valor do item; alíquotas de teste 2026: CBS 0,9%, IBS UF 0,1%, IBS municipal 0%
        // (usa a alíquota da regra do perfil quando ela vier preenchida).
        let cstIbsCbs = ''
        let cClassTribIbsCbs = ''
        let baseIbsCbs = 0
        let ibsUfAliquota = 0
        let ibsUfValor = 0
        let ibsMunAliquota = 0
        let ibsMunValor = 0
        let ibsValorTotal = 0
        let cbsAliquota = 0
        let cbsValor = 0
        if (informarIbsCbs) {
          cstIbsCbs = (regraRec ? regraRec.getString('cst_ibs_cbs') : '') || '000'
          cClassTribIbsCbs = (regraRec ? regraRec.getString('c_class_trib') : '') || '000001'
          baseIbsCbs = valorBaseInicial
          const aliqUfRegra = regraRec ? regraRec.getFloat('aliquota_ibs_uf') || 0 : 0
          const aliqMunRegra = regraRec ? regraRec.getFloat('aliquota_ibs_municipio') || 0 : 0
          const aliqCbsRegra = regraRec ? regraRec.getFloat('aliquota_cbs') || 0 : 0
          ibsUfAliquota = aliqUfRegra > 0 ? aliqUfRegra : 0.1
          ibsMunAliquota = aliqMunRegra
          cbsAliquota = aliqCbsRegra > 0 ? aliqCbsRegra : 0.9
          ibsUfValor = round2(baseIbsCbs * (ibsUfAliquota / 100))
          ibsMunValor = round2(baseIbsCbs * (ibsMunAliquota / 100))
          ibsValorTotal = round2(ibsUfValor + ibsMunValor)
          cbsValor = round2(baseIbsCbs * (cbsAliquota / 100))
          totValorIbs = round2(totValorIbs + ibsValorTotal)
          totValorCbs = round2(totValorCbs + cbsValor)
        }

        totValorProdutos += valorBruto
        totValorDesconto += descontoItem
        totBaseIcms += baseIcms
        totValorIcms += valorIcms
        totValorPis += valorPis
        totValorCofins += valorCofins
        totValorTotal += valorTotalItem

        const itemFocus = {
          numero_item: numItem,
          codigo_produto: codigo || String(numItem),
          descricao,
          cfop,
          codigo_ncm: ncm,
          unidade_comercial: unidade,
          quantidade_comercial: quantidade,
          valor_unitario_comercial: valorUnitario,
          unidade_tributavel: unidade,
          quantidade_tributavel: quantidade,
          valor_unitario_tributavel: valorUnitario,
          valor_bruto: valorBruto,
          valor_desconto: descontoItem,
          icms_origem: origemMercadoria,
          icms_situacao_tributaria: situacaoIcms,
        }
        if (cest) itemFocus.codigo_cest = cest
        if (gtin) {
          itemFocus.codigo_barra_comercial = gtin
          itemFocus.codigo_barra_tributavel = gtin
        }
        if (baseIcms > 0) {
          itemFocus.icms_modalidade_base_calculo = modBcIcms
          itemFocus.icms_base_calculo = baseIcms
          itemFocus.icms_aliquota = aliqIcms
          itemFocus.icms_valor = valorIcms
        }
        if (aliquotaCreditoSimplesItem > 0) {
          itemFocus.icms_aliquota_credito = aliquotaCreditoSimplesItem
          itemFocus.icms_valor_credito = valorCreditoSimplesItem
        }
        if (cstPis) itemFocus.pis_situacao_tributaria = cstPis
        if (valorPis > 0) {
          itemFocus.pis_base_calculo = basePis
          itemFocus.pis_aliquota_porcentual = aliqPis
          itemFocus.pis_valor = valorPis
        }
        if (cstCofins) itemFocus.cofins_situacao_tributaria = cstCofins
        if (valorCofins > 0) {
          itemFocus.cofins_base_calculo = baseCofins
          itemFocus.cofins_aliquota_porcentual = aliqCofins
          itemFocus.cofins_valor = valorCofins
        }
        if (informarIbsCbs) {
          itemFocus.ibs_cbs_situacao_tributaria = cstIbsCbs
          itemFocus.ibs_cbs_classificacao_tributaria = cClassTribIbsCbs
          itemFocus.ibs_cbs_base_calculo = baseIbsCbs
          itemFocus.ibs_uf_aliquota = ibsUfAliquota
          itemFocus.ibs_uf_valor = ibsUfValor
          itemFocus.ibs_mun_aliquota = ibsMunAliquota
          itemFocus.ibs_mun_valor = ibsMunValor
          itemFocus.ibs_valor_total = ibsValorTotal
          itemFocus.cbs_aliquota = cbsAliquota
          itemFocus.cbs_valor = cbsValor
        }
        itensFocus.push(itemFocus)
      }

      // Formas de pagamento
      const formasPagamentoFocus = []
      if (pagamentosOrigem && pagamentosOrigem.length > 0) {
        for (let p = 0; p < pagamentosOrigem.length; p++) {
          const pg = pagamentosOrigem[p]
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
            valor_pagamento: round2(pg.getFloat('valor') || 0),
          }
          const bandeira = (pg.getString('bandeira') || '').trim()
          const codAut = (pg.getString('codigo_autorizacao') || pg.getString('nsu') || '').trim()
          if (bandeira) itemPg.bandeira_operadora = bandeira
          if (codAut) itemPg.numero_autorizacao = codAut
          formasPagamentoFocus.push(itemPg)
        }
      } else {
        formasPagamentoFocus.push({ forma_pagamento: '01', valor_pagamento: round2(totValorTotal) })
      }

      const dataHojeIso = new Date().toISOString()
      const jsonFocus = {
        natureza_operacao: naturezaPadrao,
        data_emissao: dataHojeIso,
        tipo_documento: 1,
        finalidade_emissao: 1,
        consumidor_final: 1,
        presenca_comprador: '1',
        modalidade_frete: 9,
        local_destino: 1,
        cnpj_emitente: cnpjEmitenteLimpo,
        nome_emitente: truncar60(
          empresa.getString('nome_documentos_fiscais') || empresa.getString('razao_social') || '',
        ),
        nome_fantasia_emitente: truncar60(empresa.getString('nome_fantasia') || '') || undefined,
        nome_destinatario: temDestinatario
          ? truncar60(
              ambiente === 'Produção'
                ? destinatarioNome
                : 'NF-C-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
            )
          : undefined,
        uf_destinatario: temDestinatario ? destinatarioUf : undefined,
        codigo_municipio_destinatario: temDestinatario ? ibgeEmitente : undefined,
        logradouro_destinatario: temDestinatario
          ? empresa.getString('logradouro') || 'S/N'
          : undefined,
        numero_destinatario: temDestinatario ? empresa.getString('numero') || 'S/N' : undefined,
        bairro_destinatario: temDestinatario ? empresa.getString('bairro') || 'Centro' : undefined,
        municipio_destinatario: temDestinatario ? empresa.getString('municipio') || '' : undefined,
        cep_destinatario: temDestinatario
          ? (empresa.getString('cep') || '').replace(/\D/g, '')
          : undefined,
        items: itensFocus,
        formas_pagamento: formasPagamentoFocus,
        informacoes_adicionais_contribuinte: infoComplPadrao || undefined,
      }
      if (temDestinatario && destinatarioCpfCnpj.length === 11) {
        jsonFocus.cpf_destinatario = destinatarioCpfCnpj
      } else if (temDestinatario && destinatarioCpfCnpj.length === 14) {
        jsonFocus.cnpj_destinatario = destinatarioCpfCnpj
      }
      if (temDestinatario) jsonFocus.indicador_inscricao_estadual_destinatario = '9'
      const valorTrocoVenda = venda.getFloat('valor_troco') || 0
      if (valorTrocoVenda > 0) jsonFocus.valor_troco = round2(valorTrocoVenda)
      // Totais IBS/CBS da nota (soma dos itens) quando "Destacar IBS e CBS" ligado
      if (informarIbsCbs) {
        jsonFocus.valor_total_ibs = round2(totValorIbs)
        jsonFocus.valor_total_cbs = round2(totValorCbs)
      }

      // 6. Gravar documento fiscal ANTES de chamar a Focus
      const colDoc = $app.findCollectionByNameOrId('documentos_fiscais')
      let refFocus = ''
      if (docRec && docRec.getString('referencia')) {
        refFocus = docRec.getString('referencia')
      } else {
        refFocus = `NFC_${String(empresaId).slice(0, 5)}_${String(vendaId).slice(0, 8)}_${Date.now()}`
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
      docRec.set('status', 'Rascunho')
      docRec.set('serie', seriePadrao)
      docRec.set('data_emissao', dataHojeIso)
      docRec.set('natureza_operacao', naturezaPadrao)
      docRec.set('cfop_principal', cfopPrimeiroItem || '5102')
      docRec.set('destinatario_nome', temDestinatario ? truncar60(destinatarioNome) : '')
      docRec.set('destinatario_cpf_cnpj', temDestinatario ? destinatarioCpfCnpj : '')
      docRec.set('destinatario_uf', temDestinatario ? destinatarioUf : '')
      docRec.set('presenca_comprador', '1')
      docRec.set('valor_produtos', round2(totValorProdutos))
      docRec.set('valor_desconto', round2(totValorDesconto))
      docRec.set('valor_seguro', 0)
      docRec.set('valor_frete', 0)
      docRec.set('valor_outras_despesas', 0)
      docRec.set('base_icms', round2(totBaseIcms))
      docRec.set('valor_icms', round2(totValorIcms))
      docRec.set('valor_ipi', 0)
      docRec.set('valor_pis', round2(totValorPis))
      docRec.set('valor_cofins', round2(totValorCofins))
      docRec.set('valor_ibs', round2(totValorIbs))
      docRec.set('valor_cbs', round2(totValorCbs))
      docRec.set('valor_total', round2(totValorTotal))
      docRec.set('json_enviado', jsonFocus)
      docRec.set('usuario_emissao_id', userId)
      $app.save(docRec)

      // 7. Chamar Focus NFe
      const executarChamadaFocus = (formaEmissao) => {
        let url = `${ambiente === 'Produção' ? 'https://api.focusnfe.com.br/v2' : 'https://homologacao.focusnfe.com.br/v2'}/nfce?ref=${encodeURIComponent(refFocus)}`
        if (formaEmissao) url += `&forma_emissao=${encodeURIComponent(formaEmissao)}`
        const res = $http.send({
          method: 'POST',
          url,
          headers: {
            Authorization: 'Basic ' + encodeBase64Nfce(token + ':'),
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(jsonFocus),
          timeout: 60,
        })
        const rawText = res.raw ? res.raw : ''
        let json = null
        try {
          json = JSON.parse(rawText)
        } catch (_) {
          json = null
        }
        return { statusCode: res.statusCode || 200, json, rawText }
      }

      const ehRespostaAutorizada = (resp) => {
        if (!resp) return false
        const st = (resp.json && resp.json.status) || ''
        return (
          st === 'autorizado' ||
          st === 'emitido' ||
          st === 'contingencia' ||
          ((resp.statusCode || 200) === 200 &&
            resp.json &&
            (resp.json.chave_nfe || resp.json.caminho_xml_nota_fiscal))
        )
      }

      const textoIndicaRefJaUsada = (texto) => {
        const t = (texto || '').toLowerCase()
        if (!t) return false
        return (
          t.includes('já foi emitida') ||
          t.includes('ja foi emitida') ||
          t.includes('já foi autorizada') ||
          t.includes('ja foi autorizada') ||
          t.includes('nota já emitida') ||
          t.includes('nota ja emitida') ||
          t.includes('nota já autorizada') ||
          t.includes('nota ja autorizada') ||
          t.includes('referencia ja utilizada') ||
          t.includes('referência já utilizada') ||
          t.includes('referencia já utilizada') ||
          t.includes('duplicated reference')
        )
      }

      let resultadoEnvio = null
      try {
        resultadoEnvio = executarChamadaFocus(forcarContingencia ? 'offline' : undefined)
      } catch (errHttp) {
        throw new Error(
          'Sem comunicação com a Focus NFe: ' +
            (errHttp && errHttp.message ? errHttp.message : String(errHttp)),
        )
      }

      // ENVIO ÚNICO: o retry de contingência só ocorre quando a 1ª chamada FALHOU de
      // verdade (HTTP 5xx ou indisponibilidade explícita da SEFAZ). Qualquer outro caso —
      // inclusive resposta cujo texto mencione "sefaz" (ex.: "A nota fiscal já foi
      // emitida pela SEFAZ") — NÃO dispara 2º POST com a mesma referência: era a causa
      // do envio duplicado que gravava a 2ª resposta ("já foi emitida") como Rejeitada.
      const rawLower = (resultadoEnvio.rawText || '').toLowerCase()
      const sefazFora =
        !forcarContingencia &&
        !ehRespostaAutorizada(resultadoEnvio) &&
        !textoIndicaRefJaUsada(resultadoEnvio.rawText) &&
        (resultadoEnvio.statusCode === 500 ||
          resultadoEnvio.statusCode === 503 ||
          resultadoEnvio.statusCode === 504 ||
          rawLower.includes('indisponivel') ||
          rawLower.includes('indisponível') ||
          rawLower.includes('fora do ar') ||
          rawLower.includes('timeout'))
      if (sefazFora) {
        try {
          const resultadoContingencia = executarChamadaFocus('offline')
          // Nunca sobrescreve uma resposta boa com a resposta do retry
          if (
            ehRespostaAutorizada(resultadoContingencia) ||
            !ehRespostaAutorizada(resultadoEnvio)
          ) {
            resultadoEnvio = resultadoContingencia
          }
        } catch (errCont) {
          console.warn('[emitir-nfce-venda] Falha na contingência:', errCont)
        }
      }

      // Referência já usada na Focus ("A nota fiscal já foi emitida/autorizada") —
      // típico de um 2º envio da mesma NFC-e (ex.: timeout da 1ª chamada que chegou à
      // SEFAZ). NÃO grava "Rejeitada": consulta a nota pela referência (mesmo fluxo do
      // botão Consultar do monitor fiscal) e adota o status real (Autorizada) com
      // número, série, chave, protocolo e links. Se a consulta não confirmar a
      // autorização, o documento fica em "Processando" (status_sefaz
      // AGUARDANDO_CONSULTA) para o botão Consultar buscar o status real — nunca
      // Rejeitada.
      const rawPrimeiraResp = resultadoEnvio.rawText || ''
      const refJaUsada = textoIndicaRefJaUsada(rawPrimeiraResp)
      if (refJaUsada && refFocus) {
        let consultaConfirmouAutorizacao = false
        try {
          const urlConsultaRef = `${ambiente === 'Produção' ? 'https://api.focusnfe.com.br/v2' : 'https://homologacao.focusnfe.com.br/v2'}/nfce/${encodeURIComponent(refFocus)}`
          const resConsultaRef = $http.send({
            method: 'GET',
            url: urlConsultaRef,
            headers: {
              Authorization: 'Basic ' + encodeBase64Nfce(token + ':'),
              Accept: 'application/json',
            },
            timeout: 60,
          })
          let jsonConsultaRef = null
          try {
            jsonConsultaRef = JSON.parse(resConsultaRef.raw || '')
          } catch (_) {
            jsonConsultaRef = null
          }
          const statusConsultaRef = (jsonConsultaRef && jsonConsultaRef.status) || ''
          const autorizadaNaConsulta =
            statusConsultaRef === 'autorizado' ||
            statusConsultaRef === 'emitido' ||
            ((resConsultaRef.statusCode || 200) === 200 &&
              jsonConsultaRef &&
              jsonConsultaRef.chave_nfe)
          if (autorizadaNaConsulta) {
            consultaConfirmouAutorizacao = true
            console.log(
              '[emitir-nfce-venda] Referência já enviada antes — status real (Autorizada) obtido na consulta à Focus.',
            )
            resultadoEnvio = {
              statusCode: resConsultaRef.statusCode || 200,
              json: jsonConsultaRef,
              rawText: resConsultaRef.raw || '',
            }
          }
        } catch (errConsultaRef) {
          console.warn(
            '[emitir-nfce-venda] Falha ao consultar a nota já enviada na Focus:',
            errConsultaRef,
          )
        }
        if (!consultaConfirmouAutorizacao) {
          // Consulta não confirmou (ainda processando / falha na consulta):
          // documento em "Processando" para o botão Consultar buscar o status real.
          try {
            docRec.set('json_retorno', {
              aviso: 'A Focus informou que a nota já foi enviada para esta referência.',
              resposta: resultadoEnvio.json || rawPrimeiraResp,
            })
            docRec.set('status', 'Processando')
            docRec.set('status_sefaz', 'AGUARDANDO_CONSULTA')
            docRec.set(
              'mensagem_sefaz',
              'A Focus informou que a nota já foi enviada para esta referência. Use "Consultar" no monitor fiscal para buscar o status real na SEFAZ.',
            )
            $app.save(docRec)
          } catch (errDocProc) {
            console.warn(
              '[emitir-nfce-venda] Falha ao gravar Processando após referência já usada:',
              errDocProc,
            )
          }
          // Venda mantém o status anterior (nunca "Processando" em vendas.documento_fiscal_status)
          return c.json(200, {
            sucesso: false,
            erro_interno: false,
            status: 'Processando',
            documento_id: docRec.id,
            ref: refFocus,
            message:
              'A Focus informou que a nota já foi enviada para esta referência. Use "Consultar" no monitor fiscal para buscar o status real na SEFAZ.',
            detalhes: resultadoEnvio.json || rawPrimeiraResp,
          })
        }
      }

      const { statusCode, json: respJson, rawText } = resultadoEnvio
      const statusFocus = (respJson && respJson.status) || ''
      const ehAutorizada =
        statusFocus === 'autorizado' ||
        statusFocus === 'emitido' ||
        statusFocus === 'contingencia' ||
        (statusCode === 200 &&
          ((respJson && respJson.chave_nfe) || (respJson && respJson.caminho_xml_nota_fiscal)))
      const ehContingencia = forcarContingencia || statusFocus === 'contingencia'

      docRec.set('json_retorno', respJson || { raw: rawText })
      docRec.set('usuario_emissao_id', userId)

      if (ehAutorizada) {
        const numeroNota = Number(respJson && respJson.numero) || undefined
        const serieNota = respJson && respJson.serie ? String(respJson.serie) : seriePadrao
        const chaveNota = (respJson && (respJson.chave_nfe || respJson.chave)) || ''
        const protocoloNota = (respJson && respJson.protocolo) || ''
        const qrcodeUrl = (respJson && respJson.qrcode_url) || ''
        const urlConsulta = (respJson && respJson.url_consulta) || ''
        const baseUrlOrigin =
          ambiente === 'Produção'
            ? 'https://api.focusnfe.com.br'
            : 'https://homologacao.focusnfe.com.br'
        const danfeUrl =
          (respJson && respJson.danfe_url) ||
          (respJson && respJson.caminho_danfe ? `${baseUrlOrigin}${respJson.caminho_danfe}` : '')

        docRec.set('status', 'Autorizada')
        docRec.set('contingencia', ehContingencia)
        if (numeroNota) docRec.set('numero', numeroNota)
        if (serieNota) docRec.set('serie', serieNota)
        if (chaveNota) docRec.set('chave_acesso', chaveNota)
        if (protocoloNota) docRec.set('protocolo', protocoloNota)
        if (qrcodeUrl) docRec.set('qrcode_url', qrcodeUrl)
        if (urlConsulta) docRec.set('url_consulta', urlConsulta)
        if (danfeUrl) docRec.set('danfe_url', danfeUrl)
        docRec.set('data_autorizacao', dataHojeIso)
        docRec.set('status_sefaz', (respJson && respJson.status_sefaz) || statusFocus || '100')
        docRec.set(
          'mensagem_sefaz',
          (respJson && respJson.mensagem_sefaz) || 'Autorizado o uso da NF-e',
        )

        const caminhoXml =
          (respJson && (respJson.caminho_xml_nota_fiscal || respJson.xml_url)) || ''
        if (caminhoXml) {
          try {
            let urlFinalXml = caminhoXml
            if (caminhoXml.startsWith('/')) urlFinalXml = `${baseUrlOrigin}${caminhoXml}`
            const resXml = $http.send({
              method: 'GET',
              url: urlFinalXml,
              headers: { Authorization: 'Basic ' + encodeBase64Nfce(token + ':') },
              timeout: 60,
            })
            if ((resXml.statusCode || 200) < 300 && resXml.raw) {
              const fileUpload = $filesystem.fileFromBytes(
                Buffer.from(resXml.raw, 'utf-8'),
                `nfce_${refFocus}.xml`,
              )
              docRec.set('xml_arquivo', fileUpload)
            }
          } catch (errXml) {
            console.warn('[emitir-nfce-venda] Erro ao baixar/gravar XML da NFC-e:', errXml)
          }
        }

        $app.save(docRec)
        venda.set('documento_fiscal_status', 'Autorizada')
        venda.set('documento_fiscal_id', docRec.id)
        $app.save(venda)

        return c.json(200, {
          sucesso: true,
          status: 'Autorizada',
          erro_interno: false,
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
      }

      // Rejeitada pela SEFAZ/Focus (com código e motivo) — só chega aqui quando a
      // resposta NÃO é "já foi emitida/autorizada" (esse caso foi tratado acima).
      let motivoRejeicao =
        (respJson && (respJson.mensagem_sefaz || respJson.mensagem || respJson.message)) ||
        `Focus NFe HTTP ${statusCode}`
      if (respJson && Array.isArray(respJson.erros) && respJson.erros.length > 0) {
        motivoRejeicao = respJson.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }

      docRec.set('status', 'Rejeitada')
      docRec.set('status_sefaz', (respJson && respJson.status_sefaz) || statusFocus || 'Rejeição')
      docRec.set('mensagem_sefaz', motivoRejeicao)
      docRec.set('erros', (respJson && respJson.erros) || [{ mensagem: motivoRejeicao }])
      $app.save(docRec)

      venda.set('documento_fiscal_status', 'Rejeitada')
      venda.set('documento_fiscal_id', docRec.id)
      $app.save(venda)

      return c.json(200, {
        sucesso: false,
        erro_interno: false,
        status: 'Rejeitada',
        documento_id: docRec.id,
        ref: refFocus,
        message: motivoRejeicao,
        detalhes: respJson || rawText,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[emitir-nfce-venda] Erro interno: ' + msg)
      registrarErroInterno('Erro interno ao montar NFC-e: ' + msg)
      return c.json(500, {
        sucesso: false,
        erro_interno: true,
        status: 'Erro interno',
        message: 'Erro interno ao montar NFC-e: ' + msg,
      })
    }
  },
  $apis.requireAuth(),
)

// ========================================================================
// POST /backend/v1/fiscal/cancelar-nfce-venda — cancelamento de NFC-e
// (migrado do antigo fiscal_nfce_operacoes.js, helpers locais, sem require)
// ========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/cancelar-nfce-venda',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    // tenancy local (cópia — sem require; Invalid module no JSVM)
    function empresasDoUsuarioCanc(auth) {
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
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}
      if (!usuarioRec) return []
      let assinanteId = usuarioRec.getString('assinante_id')
      if (!assinanteId) return []
      if (auth.getString && auth.getString('tipo') === 'master') {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const imps = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + auth.id + "'",
              '-created',
              1,
              0,
            )
            if (imps && imps.length > 0) assinanteId = imps[0].getString('assinante_id')
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
      if (isAdmin || (auth.getString && auth.getString('tipo') === 'master')) {
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

    function exigirEmpresaDoUsuarioCanc(authRec, empId) {
      if (!empId) throw new BadRequestError('ID da empresa é obrigatório.')
      const encontrada = empresasDoUsuarioCanc(authRec).find((e) => e.id === empId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

    // token Focus local (cópia de fiscal_token_lib.js — sem require)
    function obterTokenFocusCanc(empresaId) {
      let ambiente = 'Homologação'
      let codigoToken = ''
      try {
        const configs = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          ambiente = configs[0].getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
          codigoToken = (configs[0].getString('codigo_token') || '').trim().toUpperCase()
        }
      } catch (_) {}
      const sufixoAmbiente = ambiente === 'Produção' ? 'PRODUCAO' : 'HOMOLOGACAO'
      let nomeSegredo = codigoToken
        ? `FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`
        : `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
      try {
        const creds = $app.findRecordsByFilter(
          'credenciais_fiscais',
          `empresa_id = '${empresaId}'`,
          '-created',
          1,
          0,
        )
        if (creds && creds.length > 0) {
          const cred = creds[0]
          const tokenBanco = (
            ambiente === 'Produção'
              ? cred.getString('token_producao')
              : cred.getString('token_homologacao')
          ).trim()
          if (tokenBanco) return { token: tokenBanco, ambiente, nomeSegredo }
        }
      } catch (_) {}
      let tokenSegredo = ''
      try {
        if (codigoToken) tokenSegredo = ($os.getenv(nomeSegredo) || '').trim()
      } catch (_) {}
      if (!tokenSegredo) {
        try {
          const codEmp = $app.findRecordById('empresas', empresaId).getInt('codigo')
          if (codEmp === 2) {
            const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`) || '').trim()
            if (s) {
              tokenSegredo = s
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_ECOMMERCE`
            }
          } else if (codEmp === 3) {
            const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`) || '').trim()
            if (s) {
              tokenSegredo = s
              nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}_FILIAL05`
            }
          }
        } catch (_) {}
      }
      if (!tokenSegredo) {
        try {
          const s = ($os.getenv(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`) || '').trim()
          if (s) {
            tokenSegredo = s
            nomeSegredo = `FOCUS_NFE_TOKEN_${sufixoAmbiente}`
          }
        } catch (_) {}
      }
      return { token: tokenSegredo, ambiente, nomeSegredo }
    }

    const encodeBase64Canc = (str) => {
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
      return ''
    }

    const userId = authRecord.id
    let dataCanc = {}
    try {
      dataCanc = c.requestInfo().body || {}
    } catch (_) {
      dataCanc = {}
    }
    const vendaId = dataCanc.venda_id
    const justificativa = (dataCanc.justificativa || '').trim()
    const deveCancelarVendaTambem = Boolean(dataCanc.cancelar_venda)

    if (!vendaId) {
      return c.json(400, { sucesso: false, message: 'Campo venda_id é obrigatório.' })
    }
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

    // Documento fiscal autorizado
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
    try {
      exigirEmpresaDoUsuarioCanc(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
    const refFocus = docRec.getString('referencia')

    const configCanc = (() => {
      try {
        const configs = $app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        return configs && configs.length > 0 ? configs[0] : null
      } catch (_) {
        return null
      }
    })()
    if (!configCanc) {
      return c.json(400, { sucesso: false, message: 'Configuração fiscal da loja não encontrada.' })
    }

    const tokenInfoCanc = obterTokenFocusCanc(empresaId)
    const ambienteCanc = tokenInfoCanc.ambiente
    const tokenCanc = tokenInfoCanc.token
    if (!tokenCanc) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou configure o segredo ${tokenInfoCanc.nomeSegredo}.`,
      })
    }

    const baseUrlCanc =
      ambienteCanc === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'
    const baseUrlOriginCanc =
      ambienteCanc === 'Produção'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br'

    // Chamar Focus DELETE /nfce/{ref}
    const urlCanc = `${baseUrlCanc}/nfce/${encodeURIComponent(refFocus)}`
    let resFocus = null
    try {
      resFocus = $http.send({
        method: 'DELETE',
        url: urlCanc,
        headers: {
          Authorization: 'Basic ' + encodeBase64Canc(tokenCanc + ':'),
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

    const statusCodeCanc = resFocus.statusCode || 200
    const rawTextCanc = resFocus.raw ? resFocus.raw : ''
    let jsonResp = null
    try {
      jsonResp = JSON.parse(rawTextCanc)
    } catch (_) {}

    const statusRetorno = (jsonResp && jsonResp.status) || ''
    const canceladoComSucesso =
      statusCodeCanc >= 200 &&
      statusCodeCanc < 300 &&
      (statusRetorno === 'cancelado' ||
        statusRetorno === 'sucesso' ||
        (jsonResp && jsonResp.caminho_xml_cancelamento) ||
        (jsonResp && jsonResp.status_sefaz === '101') ||
        (jsonResp && jsonResp.status_sefaz === '135') ||
        (jsonResp && jsonResp.status_sefaz === '155'))

    if (!canceladoComSucesso) {
      let msgErro =
        (jsonResp && (jsonResp.mensagem_sefaz || jsonResp.mensagem || jsonResp.message)) ||
        `Focus NFe retornou status HTTP ${statusCodeCanc}`
      if (jsonResp && Array.isArray(jsonResp.erros) && jsonResp.erros.length > 0) {
        msgErro = jsonResp.erros
          .map((e) => (e.campo ? `${e.campo}: ${e.mensagem}` : e.mensagem))
          .join('; ')
      }
      const lower = msgErro.toLowerCase()
      const prazoExpirado =
        lower.includes('prazo') ||
        (jsonResp && (jsonResp.status_sefaz === '151' || jsonResp.status_sefaz === '501')) ||
        false
      if (prazoExpirado) {
        msgErro +=
          '. O prazo legal de cancelamento da SEFAZ expirou. Para anular a operação, emita uma Devolução de Venda.'
      }
      return c.json(400, {
        sucesso: false,
        message: msgErro,
        prazo_expirado: prazoExpirado,
        detalhes: jsonResp || rawTextCanc,
      })
    }

    // Atualizar documento fiscal e gravar XML de cancelamento
    const dataCancelamento = new Date().toISOString()
    docRec.set('status', 'Cancelada')
    docRec.set('motivo_cancelamento', justificativa)
    docRec.set('data_cancelamento', dataCancelamento)
    docRec.set('usuario_cancelamento_id', userId)

    const caminhoXmlCanc = (jsonResp && jsonResp.caminho_xml_cancelamento) || ''
    if (caminhoXmlCanc) {
      try {
        let urlFinalXmlCanc = caminhoXmlCanc
        if (caminhoXmlCanc.startsWith('/'))
          urlFinalXmlCanc = `${baseUrlOriginCanc}${caminhoXmlCanc}`
        const resCancXml = $http.send({
          method: 'GET',
          url: urlFinalXmlCanc,
          headers: { Authorization: 'Basic ' + encodeBase64Canc(tokenCanc + ':') },
          timeout: 60,
        })
        if ((resCancXml.statusCode || 200) < 300 && resCancXml.raw) {
          const fileUpload = $filesystem.fileFromBytes(
            Buffer.from(resCancXml.raw, 'utf-8'),
            `cancelamento_nfce_${refFocus}.xml`,
          )
          docRec.set('xml_cancelamento', fileUpload)
        }
      } catch (errXml) {
        console.warn('[cancelar-nfce-venda] Erro ao salvar XML de cancelamento:', errXml)
      }
    }

    $app.save(docRec)

    const vendaCanc = $app.findRecordById('vendas', vendaId)
    vendaCanc.set('documento_fiscal_status', 'Cancelada')
    $app.save(vendaCanc)

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
          operacao: 'CANCELAR_NFCE',
          venda_id: vendaId,
          justificativa,
          data_cancelamento: dataCancelamento,
        }),
      )
      $app.save(aRec)
    } catch (_) {}

    // Cancelar também a venda, se pedido
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
          vendaCanceladaMensagem =
            (jsonVenda && jsonVenda.message) || 'Falha ao estornar a venda no ERP.'
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
