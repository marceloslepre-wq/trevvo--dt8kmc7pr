// reenvio 9.8r3 — IBS/CBS no payload da NF-e (modelo 55) quando "Destacar IBS e CBS"
// ligado (mesma checagem da NFC-e em fiscal_nfce_emitir.js v0.0.270): grupo gIBSCBS
// em cada item e valor_total_ibs/valor_total_cbs na nota, com CST/cClassTrib do
// perfil tributário (default 000/000001) e alíquotas de teste 2026 (CBS 0,9%,
// IBS UF 0,1%, IBS municipal 0% quando o perfil não trouxer alíquota).
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
 * - POST /backend/v1/fiscal/enviar-email-nfe
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
 *
 * JSVM PocketBase / Skip Cloud:
 * - Zero require de tenancy.js ou fiscal_token_lib.js nos callbacks (causa 'Invalid module').
 * - As rotinas de tenancy (exigirEmpresaDoUsuario e auxiliares) e fiscal_token_lib (obterTokenFocus)
 *   são funções locais declaradas dentro de cada callback.
 * - Todos os routerAdd continuam no nível superior do arquivo, intactos, com mesmos caminhos e métodos.
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe-venda',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
      }

      function eMaster(authRec) {
        if (!authRec) return false
        try {
          const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function empresasDoUsuario(authRec) {
        if (!authRec) return []

        let usuarioRec = null
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
            '-created',
            1,
            0,
          )
          if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
        } catch (_) {}

        if (!usuarioRec && authRec.getString && authRec.getString('email')) {
          try {
            const uRecs = $app.findRecordsByFilter(
              'usuarios',
              "email = '" + authRec.getString('email') + "'",
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

        function obterAssinanteImpersonadoLocal(userId, appInstance) {
          const app = appInstance || $app
          if (!userId) return null
          try {
            if (!app.hasTable('master_impersonacoes')) return null
            const recs = app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + userId + "'",
              '-created',
              1,
              0,
            )
            if (recs && recs.length > 0) {
              return recs[0].getString('assinante_id') || null
            }
          } catch (_) {}
          return null
        }

        const ehMasterUser = eMaster(authRec)
        if (ehMasterUser) {
          try {
            const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
            if (impersonadoId) {
              assinanteId = impersonadoId
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

        if (isAdmin || ehMasterUser) {
          try {
            const empresas = $app.findRecordsByFilter(
              'empresas',
              "assinante_id = '" + assinanteId + "' && ativo = true",
              'codigo',
              500,
              0,
            )
            return empresas
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
        if (!empresaId) {
          throw new BadRequestError('ID da empresa é obrigatório.')
        }
        const permitidas = empresasDoUsuario(authRec)
        const encontrada = permitidas.find((e) => e.id === empresaId)
        if (!encontrada) {
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

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
          const configs = app.findRecordsByFilter(
            'config_emissao_fiscal',
            `empresa_id = '${empresaId}' && ativo = true`,
            '-created',
            1,
            0,
          )
          if (configs && configs.length > 0) {
            const cfg = configs[0]
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
            const cred = creds[0]
            const tokenBanco = (
              ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
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

      function truncar60(texto) {
        if (!texto) return ''
        return String(texto).trim().slice(0, 60).trim()
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
          message:
            'Esta venda já possui uma NFC-e autorizada. Cancele a NFC-e antes de emitir NF-e.',
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
      try {
        exigirEmpresaDoUsuario(authRecord, empresaId)
      } catch (errEmp) {
        return c.json(403, {
          sucesso: false,
          message: errEmp.message || 'Acesso negado à empresa especificada.',
        })
      }

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

      const tokenInfo = obterTokenFocus(empresaId, $app)
      const ambiente = tokenInfo.ambiente
      const nomeSegredo = tokenInfo.nomeSegredo
      const token = tokenInfo.token

      if (!token) {
        return c.json(400, {
          sucesso: false,
          message: `Token da Focus NFe não encontrado para ${nomeEmpresa}: cadastre na tela de credenciais fiscais ou crie o segredo ${nomeSegredo} no Skip Cloud.`,
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
        // (1) Procurar registro mais recente em documentos_fiscais para esta venda
        const docsExistentes = $app.findRecordsByFilter(
          'documentos_fiscais',
          "venda_id = '" +
            vendaId +
            "' && modelo = '55' && (status = 'Rascunho' || status = 'Processando' || status = 'Rejeitada')",
          '-created',
          1,
          0,
        )

        if (docsExistentes && docsExistentes.length > 0) {
          const docEncontrado = docsExistentes[0]
          const jsonGravado = docEncontrado.get('json_enviado')
          if (jsonGravado) {
            let parsedJson = null
            if (typeof jsonGravado === 'object' && jsonGravado !== null) {
              parsedJson = jsonGravado
            } else if (typeof jsonGravado === 'string' && jsonGravado.trim()) {
              try {
                parsedJson = JSON.parse(jsonGravado)
              } catch (_) {
                parsedJson = null
              }
            }
            if (parsedJson && (parsedJson.items || parsedJson.cnpj_emitente)) {
              docRec = docEncontrado
              refFocus = docEncontrado.getString('referencia')

              // Atualizar/regenerar os campos de emitente e destinatário com truncar60 e nome_documentos_fiscais
              const nomeDocEmp = (empresa.getString('nome_documentos_fiscais') || '').trim()
              const razaoSocialEmp = (empresa.getString('razao_social') || '').trim()
              const fantasiaEmp = (empresa.getString('nome_fantasia') || '').trim()
              const emitenteNomeAtualizado = truncar60(nomeDocEmp || razaoSocialEmp)
              const emitenteFantasiaAtualizado = truncar60(fantasiaEmp)

              parsedJson.nome_emitente = emitenteNomeAtualizado
              if (emitenteFantasiaAtualizado) {
                parsedJson.nome_fantasia_emitente = emitenteFantasiaAtualizado
              } else {
                delete parsedJson.nome_fantasia_emitente
              }

              if (parsedJson.nome_destinatario) {
                parsedJson.nome_destinatario = truncar60(parsedJson.nome_destinatario)
              }

              payloadFocus = parsedJson
            }
          }
        }

        // (2) Se não houver registro ou se json_enviado estiver vazio, montar localmente
        if (!payloadFocus || !docRec) {
          const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100

          const calcularAliquotaInterestadualBackend = (ufOrigem, ufDestino, origemMercadoria) => {
            const origemStr = String(origemMercadoria || '0')
            if (['1', '2', '3', '8'].includes(origemStr)) {
              return 4
            }
            const sulSudeste = ['SP', 'RJ', 'MG', 'RS', 'SC', 'PR']
            const origemSulSudeste = sulSudeste.includes(ufOrigem)
            const destinoSulSudeste = sulSudeste.includes(ufDestino)
            if (origemSulSudeste && !destinoSulSudeste) {
              return 7
            }
            return 12
          }

          const converterCstParaCsosn = (cst) => {
            const mapa = {
              '00': '102',
              10: '201',
              20: '102',
              30: '203',
              40: '400',
              41: '400',
              50: '400',
              60: '500',
              70: '201',
              90: '900',
            }
            return mapa[cst] || '102'
          }

          const converterCsosnParaCst = (csosn) => {
            const mapa = {
              101: '00',
              102: '00',
              103: '40',
              201: '10',
              202: '30',
              203: '30',
              300: '40',
              400: '40',
              500: '60',
              900: '90',
            }
            return mapa[csosn] || '00'
          }

          $app.runInTransaction((txApp) => {
            const pendencias = []
            const avisos = []

            const clienteId = venda.getString('cliente_id')
            const itensOrigem = txApp.findRecordsByFilter(
              'vendas_itens',
              "venda_id = '" + vendaId + "' && ativo = true",
              'item,created',
            )
            if (!itensOrigem || itensOrigem.length === 0) {
              throw new Error('A venda não possui itens cadastrados.')
            }

            let pagamentosOrigem = []
            try {
              pagamentosOrigem = txApp.findRecordsByFilter(
                'vendas_pagamentos',
                "venda_id = '" + vendaId + "' && ativo = true",
                'parcela,created',
              )
            } catch (_) {
              pagamentosOrigem = []
            }

            const cnpjEmitenteLimpo = (empresa.getString('cnpj') || '').replace(/\D/g, '')
            const ieEmitente = (empresa.getString('inscricao_estadual') || '').trim()
            const ufEmitente = (empresa.getString('uf') || '').trim().toUpperCase()
            const crtEmitenteRaw = empresa.get('crt')
            const nomeDocEmp = (empresa.getString('nome_documentos_fiscais') || '').trim()
            const razaoSocialEmp = (empresa.getString('razao_social') || '').trim()
            const fantasiaEmp = (empresa.getString('nome_fantasia') || '').trim()
            const nomeEmitenteFinal = truncar60(nomeDocEmp || razaoSocialEmp)
            const nomeFantasiaEmitenteFinal = truncar60(fantasiaEmp)
            const crtEmitente =
              crtEmitenteRaw !== null && crtEmitenteRaw !== undefined && crtEmitenteRaw !== ''
                ? Number(crtEmitenteRaw)
                : null
            const aliqCreditoSimples = empresa.getFloat('aliquota_credito_simples') || 0

            if (!cnpjEmitenteLimpo || cnpjEmitenteLimpo.length !== 14) {
              pendencias.push('Empresa emitente com CNPJ inválido ou incompleto.')
            }
            if (!ieEmitente || ieEmitente.toUpperCase() === 'ISENTO') {
              pendencias.push(
                'Empresa emitente não possui Inscrição Estadual válida (ISENTO ou vazia). Não pode emitir nota fiscal.',
              )
            }
            if (!ufEmitente || ufEmitente.length !== 2) {
              pendencias.push('Empresa emitente sem UF cadastrada.')
            }
            const ibgeEmitente = (empresa.getString('codigo_municipio_ibge') || '').trim()
            if (!ibgeEmitente || ibgeEmitente.length !== 7) {
              pendencias.push('Empresa emitente sem Código de Município IBGE (7 dígitos).')
            }

            const seriePadrao = config.getString('serie_nfe') || '1'
            const presencaPadrao =
              config.getString('presenca_comprador_padrao_nfe') || '1 Presencial'
            const naturezaPadrao =
              config.getString('natureza_operacao_venda') || 'Venda de mercadoria'
            const infoComplPadrao = config.getString('informacoes_complementares_padrao') || ''
            const informarIbsCbs = config.getBool('informar_ibs_cbs')
            const calcularDifalConfig = config.getBool('calcular_difal_consumidor_final')

            let clienteRec = null
            if (clienteId) {
              try {
                clienteRec = txApp.findRecordById('clientes', clienteId)
              } catch (_) {}
            }

            const cpfCnpjConsumidor = venda.getString('cpf_cnpj_consumidor') || ''
            let destinatarioCpfCnpj = ''
            let destinatarioNome = ''
            let destinatarioUf = ufEmitente
            let destinatarioIbge = ibgeEmitente
            let destinatarioLogradouro = ''
            let destinatarioNumero = ''
            let destinatarioBairro = ''
            let destinatarioCep = ''
            let destinatarioComplemento = ''
            let destinatarioMunicipio = ''
            let destinatarioIe = ''
            let indicadorIe = '9'
            let destinatarioConsumidorFinal = true
            let destinatarioIdEstrangeiro = ''

            if (clienteRec) {
              destinatarioNome =
                clienteRec.getString('nome_razao_social') || clienteRec.getString('nome') || ''
              destinatarioCpfCnpj = (clienteRec.getString('cpf_cnpj') || '').replace(/\D/g, '')
              destinatarioUf = (clienteRec.getString('uf') || '').trim().toUpperCase() || ufEmitente
              destinatarioIbge = (clienteRec.getString('codigo_municipio_ibge') || '').trim()
              destinatarioLogradouro = clienteRec.getString('logradouro') || ''
              destinatarioNumero = clienteRec.getString('numero') || 'S/N'
              destinatarioBairro = clienteRec.getString('bairro') || ''
              destinatarioCep = (clienteRec.getString('cep') || '').replace(/\D/g, '')
              destinatarioComplemento = clienteRec.getString('complemento') || ''
              destinatarioMunicipio = clienteRec.getString('municipio') || ''
              destinatarioIe = (clienteRec.getString('inscricao_estadual') || '').trim()
              indicadorIe = String(clienteRec.getInt('indicador_ie') || 9)
              destinatarioConsumidorFinal = clienteRec.getBool('consumidor_final')
              destinatarioIdEstrangeiro = clienteRec.getString('id_estrangeiro') || ''
            }

            if (cpfCnpjConsumidor) {
              destinatarioCpfCnpj = cpfCnpjConsumidor.replace(/\D/g, '')
            }

            if (!destinatarioCpfCnpj && !destinatarioIdEstrangeiro) {
              pendencias.push('Cliente sem CPF/CNPJ informado para emissão de NF-e (modelo 55).')
            }
            if (!destinatarioNome) {
              pendencias.push('Cliente sem Razão Social / Nome completo preenchido.')
            }
            if (!destinatarioLogradouro || !destinatarioBairro || !destinatarioMunicipio) {
              pendencias.push(
                'Cliente com endereço incompleto (logradouro, bairro ou município ausente).',
              )
            }
            if (!destinatarioIbge || destinatarioIbge.length !== 7) {
              pendencias.push('Cliente sem Código IBGE do Município (7 dígitos).')
            }
            if (
              indicadorIe === '1' &&
              (!destinatarioIe || destinatarioIe.toUpperCase() === 'ISENTO')
            ) {
              pendencias.push(
                'Cliente cadastrado como Contribuinte de ICMS (indicador 1), mas está sem Inscrição Estadual.',
              )
            }

            const ehOperacaoInterna = destinatarioUf === ufEmitente
            const localDestino = ehOperacaoInterna ? 1 : destinatarioUf === 'EX' ? 3 : 2
            let cenarioRegra = 'VENDA_INTERNA_CONSUMIDOR'
            if (ehOperacaoInterna) {
              cenarioRegra =
                indicadorIe === '1' ? 'VENDA_INTERNA_CONTRIBUINTE' : 'VENDA_INTERNA_CONSUMIDOR'
            } else {
              cenarioRegra =
                indicadorIe === '1'
                  ? 'VENDA_INTERESTADUAL_CONTRIBUINTE'
                  : 'VENDA_INTERESTADUAL_CONSUMIDOR'
            }

            const ehVendaInterestadualConsumidorNaoContribuinte =
              !ehOperacaoInterna && indicadorIe === '9' && localDestino === 2

            if (ehVendaInterestadualConsumidorNaoContribuinte && !calcularDifalConfig) {
              avisos.push(
                'Venda interestadual a consumidor: DIFAL não calculado (opção desligada na configuração fiscal).',
              )
            }

            const totalFrete = venda.getFloat('valor_frete') || 0
            const totalAcrescimo = venda.getFloat('valor_acrescimo') || 0
            const totalDescontoGlobal = venda.getFloat('valor_desconto_total') || 0

            let somaBrutoItens = 0
            for (let i = 0; i < itensOrigem.length; i++) {
              const it = itensOrigem[i]
              const qtd = it.getFloat('quantidade') || 0
              const preco = it.getFloat('preco_unitario') || 0
              somaBrutoItens += round2(qtd * preco)
            }

            const itensCalculados = []
            const itensFocus = []

            let acumFreteRateado = 0
            let acumOutrasRateado = 0
            let acumDescontoRateado = 0

            let totValorProdutos = 0
            let totValorDesconto = 0
            let totValorFrete = 0
            let totValorSeguro = 0
            let totValorOutras = 0
            let totBaseIcms = 0
            let totValorIcms = 0
            let totBaseIcmsSt = 0
            let totValorIcmsSt = 0
            let totValorFcp = 0
            let totValorIcmsUfDest = 0
            let totValorFcpUfDest = 0
            let totValorIcmsUfRemet = 0
            let totValorIpi = 0
            let totValorPis = 0
            let totValorCofins = 0
            let totValorIbs = 0
            let totValorCbs = 0
            // Acumuladores IBS/CBS do payload (Reforma Tributária): somam os valores
            // efetivamente enviados no grupo gIBSCBS dos itens (com alíquotas de
            // teste 2026 quando o perfil não trouxer alíquota), igual à NFC-e
            let totValorIbsFocus = 0
            let totValorCbsFocus = 0
            let totValorTotal = 0

            let cfopPrimeiroItem = ''

            for (let idx = 0; idx < itensOrigem.length; idx++) {
              const itRec = itensOrigem[idx]
              const numItem = idx + 1
              const ehUltimoItem = idx === itensOrigem.length - 1

              const prodId = itRec.getString('produto_id')
              let prodRec = null
              if (prodId) {
                try {
                  prodRec = txApp.findRecordById('produtos', prodId)
                } catch (_) {}
              }

              const descricao =
                itRec.getString('descricao') ||
                (prodRec ? prodRec.getString('descricao') : 'Item ' + numItem)
              const codigo = prodRec
                ? prodRec.getString('codigo') || prodRec.getString('codigo_interno') || prodId
                : prodId
              const unidade = (
                itRec.getString('unidade') ||
                (prodRec ? prodRec.getString('unidade_medida') : 'UN') ||
                'UN'
              )
                .trim()
                .toUpperCase()
              const quantidade = itRec.getFloat('quantidade') || 0
              const valorUnitario = itRec.getFloat('preco_unitario') || 0
              const valorBruto = round2(quantidade * valorUnitario)
              const descontoItemLinha = itRec.getFloat('desconto_valor') || 0

              const proporcao =
                somaBrutoItens > 0 ? valorBruto / somaBrutoItens : 1 / itensOrigem.length
              let freteRateado = round2(totalFrete * proporcao)
              let outrasRateado = round2(totalAcrescimo * proporcao)
              let descGlobalRateado = round2(totalDescontoGlobal * proporcao)

              if (ehUltimoItem) {
                freteRateado = round2(totalFrete - acumFreteRateado)
                outrasRateado = round2(totalAcrescimo - acumOutrasRateado)
                descGlobalRateado = round2(totalDescontoGlobal - acumDescontoRateado)
              } else {
                acumFreteRateado += freteRateado
                acumOutrasRateado += outrasRateado
                acumDescontoRateado += descGlobalRateado
              }

              const valorDescontoTotalItem = round2(descontoItemLinha + descGlobalRateado)
              const valorTotalItem = round2(
                valorBruto - valorDescontoTotalItem + freteRateado + outrasRateado,
              )

              const ncm = (
                itRec.getString('ncm') ||
                (prodRec ? prodRec.getString('ncm') : '') ||
                ''
              ).replace(/\D/g, '')
              const cest = (
                itRec.getString('cest') ||
                (prodRec ? prodRec.getString('cest') : '') ||
                ''
              ).replace(/\D/g, '')
              const gtin = prodRec
                ? prodRec.getString('gtin') || prodRec.getString('codigo_barras') || 'SEM GTIN'
                : 'SEM GTIN'
              const lote = itRec.getString('lote_id') || ''
              const validade = ''

              if (!ncm || ncm.length !== 8) {
                pendencias.push(
                  'Item ' +
                    numItem +
                    ' (' +
                    descricao +
                    '): NCM "' +
                    ncm +
                    '" inválido (deve ter exatamente 8 dígitos numéricos).',
                )
              }

              const perfilId =
                itRec.getString('perfil_tributario_id') ||
                (prodRec ? prodRec.getString('perfil_tributario_id') : '')
              let regraRec = null

              if (perfilId) {
                try {
                  const regras = txApp.findRecordsByFilter(
                    'perfis_tributarios_regras',
                    "perfil_id = '" +
                      perfilId +
                      "' && cenario = '" +
                      cenarioRegra +
                      "' && ativo = true",
                    '',
                    1,
                    0,
                  )
                  if (regras.length > 0) regraRec = regras[0]
                } catch (_) {}
              }

              if (!perfilId) {
                pendencias.push(
                  'Item ' +
                    numItem +
                    ' (' +
                    descricao +
                    '): Produto sem Perfil Tributário vinculado.',
                )
              } else if (!regraRec) {
                pendencias.push(
                  'Item ' +
                    numItem +
                    ' (' +
                    descricao +
                    '): Perfil Tributário não possui regra para o cenário "' +
                    cenarioRegra +
                    '".',
                )
              }

              let cfop = itRec.getString('cfop') || (regraRec ? regraRec.getString('cfop') : '')
              const origemMercadoria =
                itRec.getString('origem') || (regraRec ? regraRec.getString('origem') : '0') || '0'
              let cstIcms =
                itRec.getString('cst_icms') || (regraRec ? regraRec.getString('cst_icms') : '')
              let csosn = itRec.getString('csosn') || (regraRec ? regraRec.getString('csosn') : '')
              const modBcIcms = regraRec ? regraRec.getString('mod_bc_icms') || '3' : '3'
              const reducaoBcIcms = regraRec
                ? regraRec.getFloat('reducao_bc_icms_percentual') ||
                  regraRec.getFloat('reducao_bc_icms') ||
                  0
                : 0
              let aliqIcms =
                itRec.getFloat('aliquota_icms') ||
                (regraRec ? regraRec.getFloat('aliquota_icms') || 0 : 0)

              // Se a alíquota de ICMS não foi informada manualmente no item da venda
              // e for operação interestadual com CST de ICMS tributado com destaque (00, 10, 20, 70, 90),
              // busca a alíquota na matriz icms_interestadual (UF emitente × UF destino × origem do item).
              const aliqIcmsInformadaManualmente = (itRec.getFloat('aliquota_icms') || 0) > 0
              if (!ehOperacaoInterna && !aliqIcmsInformadaManualmente) {
                const cstsTributadosDestaque = ['00', '10', '20', '70', '90']
                if (cstsTributadosDestaque.includes(cstIcms)) {
                  let aliqMatriz = null
                  const origMercStr = String(origemMercadoria || '0').trim()
                  if (['1', '2', '3', '8'].includes(origMercStr)) {
                    aliqMatriz = 4
                  } else if (ufEmitente && destinatarioUf) {
                    try {
                      const matsInter = txApp.findRecordsByFilter(
                        'icms_interestadual',
                        "uf_origem = '" +
                          ufEmitente +
                          "' && uf_destino = '" +
                          destinatarioUf +
                          "' && ativo = true",
                        '',
                        1,
                        0,
                      )
                      if (
                        matsInter.length > 0 &&
                        matsInter[0].get('aliquota') !== null &&
                        matsInter[0].get('aliquota') !== undefined &&
                        matsInter[0].get('aliquota') !== ''
                      ) {
                        aliqMatriz = matsInter[0].getFloat('aliquota')
                      }
                    } catch (_) {}
                  }

                  if (aliqMatriz !== null && aliqMatriz !== undefined) {
                    aliqIcms = aliqMatriz
                  } else {
                    avisos.push(
                      'Item ' +
                        numItem +
                        ' (' +
                        descricao +
                        '): alíquota interestadual não encontrada na matriz',
                    )
                  }
                }
              }

              let aliqFcp = regraRec ? regraRec.getFloat('aliquota_fcp') || 0 : 0

              const modBcIcmsSt = regraRec ? regraRec.getString('mod_bc_icms_st') || '4' : '4'
              const mva = regraRec
                ? regraRec.getFloat('mva_percentual') || regraRec.getFloat('mva') || 0
                : 0
              const aliqIcmsSt = regraRec ? regraRec.getFloat('aliquota_icms_st') || 0 : 0
              const reducaoBcIcmsSt = regraRec
                ? regraRec.getFloat('reducao_bc_icms_st_percentual') ||
                  regraRec.getFloat('reducao_bc_icms_st') ||
                  0
                : 0

              const cstIpi = regraRec ? regraRec.getString('cst_ipi') : ''
              const codEnqIpi = regraRec
                ? regraRec.getString('codigo_enquadramento_ipi') || '999'
                : '999'
              const aliqIpi = regraRec ? regraRec.getFloat('aliquota_ipi') || 0 : 0

              const cstPis =
                itRec.getString('cst_pis') ||
                (regraRec ? regraRec.getString('cst_pis') : '07') ||
                '07'
              const aliqPis = regraRec ? regraRec.getFloat('aliquota_pis') || 0 : 0
              const cstCofins =
                itRec.getString('cst_cofins') ||
                (regraRec ? regraRec.getString('cst_cofins') : '07') ||
                '07'
              const aliqCofins = regraRec ? regraRec.getFloat('aliquota_cofins') || 0 : 0

              const cstIbsCbs = regraRec ? regraRec.getString('cst_ibs_cbs') || '01' : '01'
              const cClassTrib = regraRec ? regraRec.getString('c_class_trib') || '' : ''
              const aliqIbsUf = regraRec ? regraRec.getFloat('aliquota_ibs_uf') || 0 : 0
              const aliqIbsMun = regraRec ? regraRec.getFloat('aliquota_ibs_municipio') || 0 : 0
              const aliqCbs = regraRec ? regraRec.getFloat('aliquota_cbs') || 0 : 0
              const cBenef = regraRec ? regraRec.getString('c_benef') || '' : ''

              if (!cfop) {
                if (ehOperacaoInterna) {
                  cfop = '5102'
                } else {
                  cfop = indicadorIe === '9' ? '6108' : '6102'
                }
              }

              const primeiroDigitoCfop = cfop.charAt(0)
              if (ehOperacaoInterna && primeiroDigitoCfop !== '5' && primeiroDigitoCfop !== '1') {
                pendencias.push(
                  'Item ' +
                    numItem +
                    ': CFOP ' +
                    cfop +
                    ' incoerente com operação interna (mesma UF ' +
                    ufEmitente +
                    '). Deveria iniciar com 5.',
                )
              }
              if (!ehOperacaoInterna && primeiroDigitoCfop !== '6' && primeiroDigitoCfop !== '2') {
                pendencias.push(
                  'Item ' +
                    numItem +
                    ': CFOP ' +
                    cfop +
                    ' incoerente com operação interestadual (' +
                    ufEmitente +
                    ' -> ' +
                    destinatarioUf +
                    '). Deveria iniciar com 6.',
                )
              }

              if (!cfopPrimeiroItem) cfopPrimeiroItem = cfop

              const regimeApuracaoEmitente = (empresa.getString('regime_apuracao') || '').trim()
              const ehSimples = regimeApuracaoEmitente
                ? regimeApuracaoEmitente === 'Simples Nacional'
                : crtEmitente === 1 || crtEmitente === 2 || crtEmitente === 4
              if (ehSimples) {
                if (!csosn && cstIcms) {
                  csosn = converterCstParaCsosn(cstIcms)
                }
                if (!csosn) csosn = '102'
              } else {
                if (!cstIcms && csosn) {
                  cstIcms = converterCsosnParaCst(csosn)
                }
                if (!cstIcms) cstIcms = '00'
              }

              const valorBaseInicial = Math.max(
                0,
                valorBruto + freteRateado + outrasRateado - valorDescontoTotalItem,
              )
              let baseIcms = 0
              let valorIcms = 0
              let valorFcp = 0

              const tributaIcmsIntegral =
                (!ehSimples &&
                  (cstIcms === '00' || cstIcms === '10' || cstIcms === '20' || cstIcms === '70')) ||
                (ehSimples && csosn === '900')

              if (tributaIcmsIntegral && aliqIcms > 0) {
                const fatorReducao = reducaoBcIcms > 0 ? 1 - reducaoBcIcms / 100 : 1
                baseIcms = round2(valorBaseInicial * fatorReducao)
                valorIcms = round2(baseIcms * (aliqIcms / 100))
                if (aliqFcp > 0) {
                  valorFcp = round2(baseIcms * (aliqFcp / 100))
                }
              }

              let aliquotaCreditoSimplesItem = 0
              let valorCreditoSimplesItem = 0
              if (ehSimples && csosn === '101' && aliqCreditoSimples > 0) {
                aliquotaCreditoSimplesItem = aliqCreditoSimples
                valorCreditoSimplesItem = round2(valorBaseInicial * (aliqCreditoSimples / 100))
              }

              let baseIpi = 0
              let valorIpi = 0
              if (aliqIpi > 0 && !ehSimples) {
                baseIpi = valorBruto
                valorIpi = round2(baseIpi * (aliqIpi / 100))
              }

              let baseIcmsSt = 0
              let valorIcmsSt = 0
              const situacaoSt = ehSimples ? csosn : cstIcms
              const temSt = ['10', '30', '70', '201', '202', '203'].includes(situacaoSt)

              if (temSt && (mva > 0 || aliqIcmsSt > 0)) {
                const fatorMva = 1 + mva / 100
                const baseStSemReducao = (valorBaseInicial + valorIpi) * fatorMva
                const fatorReducaoSt = reducaoBcIcmsSt > 0 ? 1 - reducaoBcIcmsSt / 100 : 1
                baseIcmsSt = round2(baseStSemReducao * fatorReducaoSt)
                const debitoSt = round2(baseIcmsSt * (aliqIcmsSt / 100))
                valorIcmsSt = Math.max(0, round2(debitoSt - valorIcms))
              }

              let basePis = 0
              let valorPis = 0
              let baseCofins = 0
              let valorCofins = 0

              if (!ehSimples) {
                if (['01', '02'].includes(cstPis) && aliqPis > 0) {
                  basePis = valorBaseInicial
                  valorPis = round2(basePis * (aliqPis / 100))
                }
                if (['01', '02'].includes(cstCofins) && aliqCofins > 0) {
                  baseCofins = valorBaseInicial
                  valorCofins = round2(baseCofins * (aliqCofins / 100))
                }
              }

              let baseIcmsUfDest = 0
              let aliqInternaUfDest = 0
              let aliqInterestadual = 0
              let percentualPartilha = 100
              let aliqFcpUfDest = 0
              let valorFcpUfDest = 0
              let valorIcmsUfDest = 0
              let valorIcmsUfRemet = 0

              if (ehVendaInterestadualConsumidorNaoContribuinte && calcularDifalConfig) {
                aliqInterestadual = calcularAliquotaInterestadualBackend(
                  ufEmitente,
                  destinatarioUf,
                  origemMercadoria,
                )

                let matIcmsDestino = null
                try {
                  const mats = txApp.findRecordsByFilter(
                    'icms_aliquotas_uf',
                    "uf = '" + destinatarioUf + "' && ativo = true",
                    '',
                    1,
                    0,
                  )
                  if (mats.length > 0) matIcmsDestino = mats[0]
                } catch (_) {}

                if (!matIcmsDestino) {
                  pendencias.push(
                    'Não foi encontrada a alíquota de ICMS interna na tabela icms_aliquotas_uf para o destino ' +
                      destinatarioUf +
                      '.',
                  )
                  aliqInternaUfDest = 18
                  aliqFcpUfDest = 0
                } else {
                  aliqInternaUfDest =
                    matIcmsDestino.getFloat('aliquota_interna') ||
                    matIcmsDestino.getFloat('aliquota_interna_destino') ||
                    matIcmsDestino.getFloat('aliquota') ||
                    18
                  aliqFcpUfDest = matIcmsDestino.getFloat('aliquota_fcp') || 0
                }

                // Regra DIFAL: usa a mesma alíquota interestadual do item calculada/vigente
                if (aliqIcms > 0 && ['00', '10', '20', '70', '90'].includes(cstIcms)) {
                  aliqInterestadual = aliqIcms
                } else if (!aliqInterestadual) {
                  try {
                    const matsInter = txApp.findRecordsByFilter(
                      'icms_interestadual',
                      "uf_origem = '" +
                        ufEmitente +
                        "' && uf_destino = '" +
                        destinatarioUf +
                        "' && ativo = true",
                      '',
                      1,
                      0,
                    )
                    if (matsInter.length > 0) {
                      aliqInterestadual = matsInter[0].getFloat('aliquota') || aliqInterestadual
                    }
                  } catch (_) {}
                }

                // DIFAL: base apenas dos itens efetivamente tributados em ICMS
                // (CSTs 00/10/20/70/90). Itens isentos/não tributados (ex. CST 40/41)
                // e CSOSN sem débito não compõem a base do ICMS da UF de destino.
                const cstsTributadosDifal = ['00', '10', '20', '70', '90']
                baseIcmsUfDest = cstsTributadosDifal.includes(cstIcms) ? valorBaseInicial : 0
                const difAliquota = Math.max(0, aliqInternaUfDest - aliqInterestadual)
                const valorTotalDifal = round2(baseIcmsUfDest * (difAliquota / 100))
                valorIcmsUfDest = round2(valorTotalDifal * (percentualPartilha / 100))
                valorIcmsUfRemet = 0

                if (aliqFcpUfDest > 0) {
                  valorFcpUfDest = round2(baseIcmsUfDest * (aliqFcpUfDest / 100))
                }
              }

              let baseIbsCbs = 0
              let valorIbs = 0
              let valorCbs = 0
              if (informarIbsCbs) {
                baseIbsCbs = valorBaseInicial
                const aliqIbsTotal = (aliqIbsUf + aliqIbsMun) / 100
                valorIbs = round2(baseIbsCbs * aliqIbsTotal)
                valorCbs = round2(baseIbsCbs * (aliqCbs / 100))
              }

              // IBS/CBS (Reforma Tributária) — grupo gIBSCBS do item para o payload da
              // Focus (mesmos nomes de campo da NFC-e; guia Focus "IBS e CBS"):
              // CST/cClassTrib do perfil tributário do produto, cenário da operação
              // (default CST 000 / cClassTrib 000001); base = valor do item;
              // alíquotas de teste 2026: CBS 0,9%, IBS UF 0,1%, IBS municipal 0%
              // (usa a alíquota da regra do perfil quando ela vier preenchida).
              let ibsCbsSituacaoTrib = ''
              let ibsCbsClassTrib = ''
              let ibsUfAliquotaFocus = 0
              let ibsUfValorFocus = 0
              let ibsMunAliquotaFocus = 0
              let ibsMunValorFocus = 0
              let ibsValorTotalFocus = 0
              let cbsAliquotaFocus = 0
              let cbsValorFocus = 0
              if (informarIbsCbs) {
                ibsCbsSituacaoTrib = (regraRec ? regraRec.getString('cst_ibs_cbs') : '') || '000'
                ibsCbsClassTrib = (regraRec ? regraRec.getString('c_class_trib') : '') || '000001'
                ibsUfAliquotaFocus = aliqIbsUf > 0 ? aliqIbsUf : 0.1
                ibsMunAliquotaFocus = aliqIbsMun
                cbsAliquotaFocus = aliqCbs > 0 ? aliqCbs : 0.9
                ibsUfValorFocus = round2(baseIbsCbs * (ibsUfAliquotaFocus / 100))
                ibsMunValorFocus = round2(baseIbsCbs * (ibsMunAliquotaFocus / 100))
                ibsValorTotalFocus = round2(ibsUfValorFocus + ibsMunValorFocus)
                cbsValorFocus = round2(baseIbsCbs * (cbsAliquotaFocus / 100))
                totValorIbsFocus = round2(totValorIbsFocus + ibsValorTotalFocus)
                totValorCbsFocus = round2(totValorCbsFocus + cbsValorFocus)
              }

              totValorProdutos += valorBruto
              totValorDesconto += valorDescontoTotalItem
              totValorFrete += freteRateado
              totValorOutras += outrasRateado
              totBaseIcms += baseIcms
              totValorIcms += valorIcms
              totBaseIcmsSt += baseIcmsSt
              totValorIcmsSt += valorIcmsSt
              totValorFcp += valorFcp
              totValorIcmsUfDest += valorIcmsUfDest
              totValorFcpUfDest += valorFcpUfDest
              totValorIcmsUfRemet += valorIcmsUfRemet
              totValorIpi += valorIpi
              totValorPis += valorPis
              totValorCofins += valorCofins
              totValorIbs += valorIbs
              totValorCbs += valorCbs
              totValorTotal += valorTotalItem

              itensCalculados.push({
                item: numItem,
                produto_id: prodId || null,
                codigo: codigo || '',
                descricao,
                ncm,
                cest,
                cfop,
                unidade,
                quantidade,
                valor_unitario: valorUnitario,
                valor_bruto: valorBruto,
                valor_desconto: valorDescontoTotalItem,
                valor_frete: freteRateado,
                valor_outras: outrasRateado,
                valor_total: valorTotalItem,
                origem: origemMercadoria,
                cst_icms: cstIcms,
                csosn,
                mod_bc_icms: modBcIcms,
                reducao_bc_icms: reducaoBcIcms,
                base_icms: baseIcms,
                aliquota_icms: aliqIcms,
                valor_icms: valorIcms,
                aliquota_fcp: aliqFcp,
                valor_fcp: valorFcp,
                base_icms_uf_destino: baseIcmsUfDest,
                aliquota_interna_uf_destino: aliqInternaUfDest,
                aliquota_interestadual: aliqInterestadual,
                percentual_partilha: percentualPartilha,
                aliquota_fcp_uf_destino: aliqFcpUfDest,
                valor_fcp_uf_destino: valorFcpUfDest,
                valor_icms_uf_destino: valorIcmsUfDest,
                valor_icms_uf_remetente: valorIcmsUfRemet,
                mod_bc_icms_st: modBcIcmsSt,
                mva,
                base_icms_st: baseIcmsSt,
                aliquota_icms_st: aliqIcmsSt,
                valor_icms_st: valorIcmsSt,
                cst_ipi: cstIpi,
                codigo_enquadramento_ipi: codEnqIpi,
                base_ipi: baseIpi,
                aliquota_ipi: aliqIpi,
                valor_ipi: valorIpi,
                cst_pis: cstPis,
                base_pis: basePis,
                aliquota_pis: aliqPis,
                valor_pis: valorPis,
                cst_cofins: cstCofins,
                base_cofins: baseCofins,
                aliquota_cofins: aliqCofins,
                valor_cofins: valorCofins,
                cst_ibs_cbs: cstIbsCbs,
                c_class_trib: cClassTrib,
                base_ibs_cbs: baseIbsCbs,
                aliquota_ibs_uf: aliqIbsUf,
                aliquota_ibs_municipio: aliqIbsMun,
                aliquota_cbs: aliqCbs,
                valor_ibs: valorIbs,
                valor_cbs: valorCbs,
                c_benef: cBenef,
                gtin,
                lote,
                validade,
                aliquota_credito_simples: aliquotaCreditoSimplesItem,
                valor_credito_simples: valorCreditoSimplesItem,
              })

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
                valor_desconto: valorDescontoTotalItem,
                valor_frete: freteRateado,
                valor_outras_despesas: outrasRateado,
                icms_origem: origemMercadoria,
                icms_situacao_tributaria: ehSimples ? csosn : cstIcms,
              }

              if (cest) itemFocus.codigo_cest = cest
              if (gtin && gtin !== 'SEM GTIN') {
                itemFocus.codigo_barra_comercial = gtin
                itemFocus.codigo_barra_tributavel = gtin
              }

              if (baseIcms > 0) {
                itemFocus.icms_modalidade_base_calculo = modBcIcms
                itemFocus.icms_base_calculo = baseIcms
                itemFocus.icms_aliquota = aliqIcms
                itemFocus.icms_valor = valorIcms
                if (reducaoBcIcms > 0)
                  itemFocus.icms_percentual_reducao_base_calculo = reducaoBcIcms
              }
              if (valorFcp > 0) {
                itemFocus.fcp_base_calculo = baseIcms
                itemFocus.fcp_percentual = aliqFcp
                itemFocus.fcp_valor = valorFcp
              }

              if (aliquotaCreditoSimplesItem > 0) {
                itemFocus.icms_aliquota_credito = aliquotaCreditoSimplesItem
                itemFocus.icms_valor_credito = valorCreditoSimplesItem
              }

              if (baseIcmsSt > 0) {
                itemFocus.icms_modalidade_base_calculo_st = modBcIcmsSt
                itemFocus.icms_base_calculo_st = baseIcmsSt
                itemFocus.icms_aliquota_st = aliqIcmsSt
                itemFocus.icms_valor_st = valorIcmsSt
                if (mva > 0) itemFocus.icms_margem_valor_adicionado_st = mva
                if (reducaoBcIcmsSt > 0)
                  itemFocus.icms_percentual_reducao_base_calculo_st = reducaoBcIcmsSt
              }

              if (cstIpi) {
                itemFocus.ipi_situacao_tributaria = cstIpi
                itemFocus.ipi_codigo_enquadramento_legal = codEnqIpi
                if (valorIpi > 0) {
                  itemFocus.ipi_base_calculo = baseIpi
                  itemFocus.ipi_aliquota = aliqIpi
                  itemFocus.ipi_valor = valorIpi
                }
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

              if (
                valorIcmsUfDest > 0 ||
                (ehVendaInterestadualConsumidorNaoContribuinte && calcularDifalConfig)
              ) {
                itemFocus.icms_base_calculo_uf_destino = baseIcmsUfDest
                itemFocus.fcp_aliquota_uf_destino = aliqFcpUfDest
                itemFocus.icms_aliquota_uf_destino = aliqInternaUfDest
                itemFocus.icms_aliquota_interestadual = aliqInterestadual
                itemFocus.icms_percentual_partilha = percentualPartilha
                itemFocus.fcp_valor_uf_destino = valorFcpUfDest
                itemFocus.icms_valor_uf_destino = valorIcmsUfDest
                itemFocus.icms_valor_uf_remetente = valorIcmsUfRemet
              }

              // IBS/CBS (Reforma Tributária): mesmos nomes de campo da NFC-e
              // (nomes oficiais da Focus, guia "IBS e CBS"), quando "Destacar IBS e CBS" ligado
              if (informarIbsCbs) {
                itemFocus.ibs_cbs_situacao_tributaria = ibsCbsSituacaoTrib
                itemFocus.ibs_cbs_classificacao_tributaria = ibsCbsClassTrib
                itemFocus.ibs_cbs_base_calculo = round2(baseIbsCbs)
                itemFocus.ibs_uf_aliquota = ibsUfAliquotaFocus
                itemFocus.ibs_uf_valor = ibsUfValorFocus
                itemFocus.ibs_mun_aliquota = ibsMunAliquotaFocus
                itemFocus.ibs_mun_valor = ibsMunValorFocus
                itemFocus.ibs_valor_total = ibsValorTotalFocus
                itemFocus.cbs_aliquota = cbsAliquotaFocus
                itemFocus.cbs_valor = cbsValorFocus
              }

              itensFocus.push(itemFocus)
            }

            const formasPagamentoFocus = []
            if (pagamentosOrigem && pagamentosOrigem.length > 0) {
              for (let p = 0; p < pagamentosOrigem.length; p++) {
                const pg = pagamentosOrigem[p]
                const formaId = pg.getString('forma_pagamento_id')
                let formaRec = null
                if (formaId) {
                  try {
                    formaRec = txApp.findRecordById('formas_pagamento', formaId)
                  } catch (_) {}
                }
                const tpag = formaRec ? formaRec.getString('codigo_tpag') || '01' : '01'
                const itemPgFocus = {
                  forma_pagamento: tpag,
                  valor_pagamento: pg.getFloat('valor') || 0,
                }
                const bandeira = (pg.getString('bandeira') || '').trim()
                const nsu = (pg.getString('nsu') || '').trim()
                const codAut = (pg.getString('codigo_autorizacao') || '').trim()
                if (bandeira) itemPgFocus.bandeira_operadora = bandeira
                if (codAut || nsu) itemPgFocus.numero_autorizacao = codAut || nsu
                formasPagamentoFocus.push(itemPgFocus)
              }
            } else {
              formasPagamentoFocus.push({
                forma_pagamento: '01',
                valor_pagamento: round2(totValorTotal),
              })
            }

            const dataHojeIso = new Date().toISOString()
            const nomeDestinatarioFinal = truncar60(
              ambiente === 'Homologação'
                ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
                : destinatarioNome,
            )

            const presencaInput =
              data.presenca_comprador !== undefined
                ? String(data.presenca_comprador).charAt(0)
                : undefined
            const naturezaOperacaoInput = (data.natureza_operacao || '').trim() || naturezaPadrao
            const modalidadeFreteInput =
              data.modalidade_frete !== undefined ? Number(data.modalidade_frete) : 9
            const infoComplInput =
              data.informacoes_complementares !== undefined
                ? String(data.informacoes_complementares)
                : infoComplPadrao || ''

            const presencaCompradorFinal = presencaInput || presencaPadrao.charAt(0)
            const modalidadeFreteFinal = modalidadeFreteInput
            const localDestinoFinal = localDestino
            const consumidorFinalFlag = indicadorIe === '9' || destinatarioConsumidorFinal ? 1 : 0

            const ehDevolucaoVenda = venda.getString('tipo') === 'Devolução'
            const tipoDocumentoCalculado = ehDevolucaoVenda ? 0 : 1
            const finalidadeEmissaoCalculada = ehDevolucaoVenda ? 4 : 1

            const jsonFocus = {
              natureza_operacao: ehDevolucaoVenda
                ? config.getString('natureza_operacao_devolucao_venda') || 'Devolução de venda'
                : naturezaOperacaoInput,
              data_emissao: dataHojeIso,
              tipo_documento: tipoDocumentoCalculado,
              finalidade_emissao: finalidadeEmissaoCalculada,
              local_destino: localDestinoFinal,
              consumidor_final: consumidorFinalFlag,
              presenca_comprador: presencaCompradorFinal,
              modalidade_frete: modalidadeFreteFinal,
              cnpj_emitente: cnpjEmitenteLimpo,
              nome_emitente: nomeEmitenteFinal,
              nome_fantasia_emitente: nomeFantasiaEmitenteFinal || undefined,

              nome_destinatario: nomeDestinatarioFinal,
              indicador_inscricao_estadual_destinatario: indicadorIe,
              logradouro_destinatario: destinatarioLogradouro,
              numero_destinatario: destinatarioNumero || 'S/N',
              bairro_destinatario: destinatarioBairro,
              municipio_destinatario: destinatarioMunicipio,
              uf_destinatario: destinatarioUf,
              cep_destinatario: destinatarioCep,
              codigo_municipio_destinatario: destinatarioIbge,
              complemento_destinatario: destinatarioComplemento || undefined,

              items: itensFocus,
              formas_pagamento: formasPagamentoFocus,
              informacoes_adicionais_contribuinte: infoComplInput || undefined,
            }

            // Totais IBS/CBS da nota (soma dos itens) quando "Destacar IBS e CBS" ligado
            // (mesmos nomes de campo da NFC-e; nomes oficiais da Focus)
            if (informarIbsCbs) {
              jsonFocus.valor_total_ibs = round2(totValorIbsFocus)
              jsonFocus.valor_total_cbs = round2(totValorCbsFocus)
            }

            const presencaExigeIntermediador = ['2', '3', '9'].includes(presencaCompradorFinal)
            let intermediadorIdGravado = ''
            let identificadorIntermediadorGravado = ''

            if (presencaExigeIntermediador) {
              const tipoIntermediadorInput = data.tipo_intermediador || 'proprio'
              if (tipoIntermediadorInput === 'terceiro') {
                jsonFocus.indicador_intermediador = 1
                const interId = data.intermediador_id || ''
                const idCadIntTran = (data.identificador_intermediador || '').trim()
                if (!interId) {
                  pendencias.push(
                    'Operação com marketplace de terceiros exige selecionar o intermediador.',
                  )
                } else {
                  try {
                    const interRec = txApp.findRecordById('intermediadores', interId)
                    if (interRec) {
                      const cnpjInter = (interRec.getString('cnpj') || '').replace(/\D/g, '')
                      if (!cnpjInter || cnpjInter.length !== 14) {
                        pendencias.push(
                          'CNPJ do intermediador "' + interRec.getString('nome') + '" é inválido.',
                        )
                      } else {
                        jsonFocus.cnpj_intermediador = cnpjInter
                      }
                      intermediadorIdGravado = interRec.id
                    }
                  } catch (_) {
                    pendencias.push('Intermediador selecionado não foi encontrado.')
                  }
                }
                if (idCadIntTran) {
                  jsonFocus.identificador_intermediador = idCadIntTran
                  identificadorIntermediadorGravado = idCadIntTran
                }
              } else {
                jsonFocus.indicador_intermediador = 0
              }
            }

            if (data.transportadora_id) {
              try {
                const transpRec = txApp.findRecordById('fornecedores', data.transportadora_id)
                if (transpRec) {
                  const transpCnpjCpf = (transpRec.getString('cpf_cnpj') || '').replace(/\D/g, '')
                  if (transpCnpjCpf.length === 14) {
                    jsonFocus.cnpj_transportador = transpCnpjCpf
                  } else if (transpCnpjCpf.length === 11) {
                    jsonFocus.cpf_transportador = transpCnpjCpf
                  }
                  jsonFocus.nome_transportador =
                    transpRec.getString('razao_social') ||
                    transpRec.getString('nome_fantasia') ||
                    transpRec.getString('nome')
                  const transpIe = (transpRec.getString('inscricao_estadual') || '').trim()
                  if (transpIe && transpIe.toUpperCase() !== 'ISENTO') {
                    jsonFocus.inscricao_estadual_transportador = transpIe.replace(/\D/g, '')
                  }
                  jsonFocus.endereco_transportador = transpRec.getString('logradouro') || undefined
                  jsonFocus.municipio_transportador = transpRec.getString('municipio') || undefined
                  jsonFocus.uf_transportador = transpRec.getString('uf') || undefined
                }
              } catch (_) {}
            }

            if (
              data.volumes_quantidade !== undefined &&
              data.volumes_quantidade !== null &&
              Number(data.volumes_quantidade) > 0
            ) {
              jsonFocus.quantidade_volumes = Number(data.volumes_quantidade)
              if (data.volumes_especie)
                jsonFocus.especie_volumes = String(data.volumes_especie).trim()
              if (data.peso_bruto !== undefined && Number(data.peso_bruto) > 0)
                jsonFocus.peso_bruto = Number(data.peso_bruto)
              if (data.peso_liquido !== undefined && Number(data.peso_liquido) > 0)
                jsonFocus.peso_liquido = Number(data.peso_liquido)
            }

            try {
              const titulosVenda = txApp.findRecordsByFilter(
                'contas_receber',
                "origem_id = '" + vendaId + "' && ativo = true",
                'parcela_numero,data_vencimento',
              )
              if (titulosVenda && titulosVenda.length > 0) {
                const duplicatasFocus = []
                for (let d = 0; d < titulosVenda.length; d++) {
                  const tit = titulosVenda[d]
                  const numDoc =
                    tit.getString('numero_documento') ||
                    (venda.getString('numero') || vendaId.slice(0, 6)) + '-' + (d + 1)
                  const vcto = (tit.getString('data_vencimento') || '').slice(0, 10)
                  const vlr = tit.getFloat('valor_original') || 0
                  if (vcto && vlr > 0) {
                    duplicatasFocus.push({
                      numero: numDoc,
                      data_vencimento: vcto,
                      valor: round2(vlr),
                    })
                  }
                }
                if (duplicatasFocus.length > 0) {
                  jsonFocus.duplicatas = duplicatasFocus
                  jsonFocus.numero_fatura = venda.getString('numero') || vendaId.slice(0, 8)
                  jsonFocus.valor_original_fatura = round2(totValorTotal)
                  jsonFocus.valor_liquido_fatura = round2(totValorTotal)
                }
              }
            } catch (_) {}

            const valorTrocoVenda = venda.getFloat('valor_troco') || 0
            if (valorTrocoVenda > 0) {
              jsonFocus.valor_troco = round2(valorTrocoVenda)
            }

            if (destinatarioCpfCnpj.length === 11) {
              jsonFocus.cpf_destinatario = destinatarioCpfCnpj
            } else if (destinatarioCpfCnpj.length === 14) {
              jsonFocus.cnpj_destinatario = destinatarioCpfCnpj
            } else if (destinatarioIdEstrangeiro) {
              jsonFocus.id_estrangeiro_destinatario = destinatarioIdEstrangeiro
            }

            if (destinatarioIe && indicadorIe === '1') {
              jsonFocus.inscricao_estadual_destinatario = destinatarioIe.replace(/\D/g, '')
            }

            if (pendencias.length > 0) {
              throw new Error('Pendências cadastrais na venda: ' + pendencias.join('; '))
            }

            const docFiscaisCol = txApp.findCollectionByNameOrId('documentos_fiscais')
            const docItensCol = txApp.findCollectionByNameOrId('documentos_fiscais_itens')

            let docExistenteLocal = null
            try {
              const docs = txApp.findRecordsByFilter(
                'documentos_fiscais',
                "venda_id = '" + vendaId + "' && status = 'Rascunho' && modelo = '55'",
                '-created',
                1,
                0,
              )
              if (docs.length > 0) docExistenteLocal = docs[0]
            } catch (_) {}

            const referenciaUnica = docExistenteLocal
              ? docExistenteLocal.getString('referencia')
              : 'DOC_' + empresaId.slice(0, 5) + '_55_' + vendaId.slice(0, 8) + '_' + Date.now()

            let novoDocRec = docExistenteLocal || new Record(docFiscaisCol)
            novoDocRec.set('empresa_id', empresaId)
            novoDocRec.set('modelo', '55')
            novoDocRec.set('tipo_documento', tipoDocumentoCalculado)
            novoDocRec.set('finalidade', finalidadeEmissaoCalculada)
            novoDocRec.set('ambiente', ambiente)
            novoDocRec.set('origem', 'Venda')
            novoDocRec.set('venda_id', vendaId)
            novoDocRec.set('referencia', referenciaUnica)
            novoDocRec.set('status', 'Rascunho')
            novoDocRec.set('serie', seriePadrao)
            novoDocRec.set('data_emissao', dataHojeIso)
            novoDocRec.set('natureza_operacao', naturezaOperacaoInput)
            novoDocRec.set('cfop_principal', cfopPrimeiroItem || '5102')
            novoDocRec.set('destinatario_nome', truncar60(destinatarioNome))
            novoDocRec.set('destinatario_cpf_cnpj', destinatarioCpfCnpj)
            novoDocRec.set('destinatario_uf', destinatarioUf)
            novoDocRec.set('presenca_comprador', presencaCompradorFinal)
            if (intermediadorIdGravado) {
              novoDocRec.set('intermediador_id', intermediadorIdGravado)
            }
            if (identificadorIntermediadorGravado) {
              novoDocRec.set('identificador_intermediador', identificadorIntermediadorGravado)
            }

            novoDocRec.set('valor_produtos', round2(totValorProdutos))
            novoDocRec.set('valor_desconto', round2(totValorDesconto))
            novoDocRec.set('valor_frete', round2(totValorFrete))
            novoDocRec.set('valor_seguro', round2(totValorSeguro))
            novoDocRec.set('valor_outras_despesas', round2(totValorOutras))
            novoDocRec.set('base_icms', round2(totBaseIcms))
            novoDocRec.set('valor_icms', round2(totValorIcms))
            novoDocRec.set('base_icms_st', round2(totBaseIcmsSt))
            novoDocRec.set('valor_icms_st', round2(totValorIcmsSt))
            novoDocRec.set('valor_fcp', round2(totValorFcp))
            novoDocRec.set('valor_icms_uf_destino', round2(totValorIcmsUfDest))
            novoDocRec.set('valor_fcp_uf_destino', round2(totValorFcpUfDest))
            novoDocRec.set('valor_icms_uf_remetente', round2(totValorIcmsUfRemet))
            novoDocRec.set('valor_ipi', round2(totValorIpi))
            novoDocRec.set('valor_pis', round2(totValorPis))
            novoDocRec.set('valor_cofins', round2(totValorCofins))
            // IBS/CBS gravados no documento refletem os valores efetivamente
            // enviados no payload (grupo gIBSCBS), igual à NFC-e
            novoDocRec.set('valor_ibs', round2(totValorIbsFocus))
            novoDocRec.set('valor_cbs', round2(totValorCbsFocus))
            novoDocRec.set('valor_total', round2(totValorTotal))

            novoDocRec.set('json_enviado', jsonFocus)
            novoDocRec.set('usuario_emissao_id', userId)

            txApp.save(novoDocRec)
            const documentoIdSalvo = novoDocRec.id

            try {
              const itensAnteriores = txApp.findRecordsByFilter(
                'documentos_fiscais_itens',
                "documento_id = '" + documentoIdSalvo + "'",
                '',
              )
              for (let a = 0; a < itensAnteriores.length; a++) {
                txApp.delete(itensAnteriores[a])
              }
            } catch (_) {}

            for (let itIdx = 0; itIdx < itensCalculados.length; itIdx++) {
              const itemDados = itensCalculados[itIdx]
              const itemRec = new Record(docItensCol)
              itemRec.set('documento_id', documentoIdSalvo)
              itemRec.set('item', itemDados.item)
              if (itemDados.produto_id) itemRec.set('produto_id', itemDados.produto_id)
              itemRec.set('codigo', itemDados.codigo)
              itemRec.set('descricao', itemDados.descricao)
              itemRec.set('ncm', itemDados.ncm)
              itemRec.set('cest', itemDados.cest)
              itemRec.set('cfop', itemDados.cfop)
              itemRec.set('unidade', itemDados.unidade)
              itemRec.set('quantidade', itemDados.quantidade)
              itemRec.set('valor_unitario', itemDados.valor_unitario)
              itemRec.set('valor_bruto', itemDados.valor_bruto)
              itemRec.set('valor_desconto', itemDados.valor_desconto)
              itemRec.set('valor_frete', itemDados.valor_frete)
              itemRec.set('valor_outras', itemDados.valor_outras)
              itemRec.set('valor_total', itemDados.valor_total)

              itemRec.set('origem', itemDados.origem)
              itemRec.set('cst_icms', itemDados.cst_icms)
              itemRec.set('csosn', itemDados.csosn)
              itemRec.set('mod_bc_icms', itemDados.mod_bc_icms)
              itemRec.set('reducao_bc_icms', itemDados.reducao_bc_icms)
              itemRec.set('base_icms', itemDados.base_icms)
              itemRec.set('aliquota_icms', itemDados.aliquota_icms)
              itemRec.set('valor_icms', itemDados.valor_icms)
              itemRec.set('aliquota_fcp', itemDados.aliquota_fcp)
              itemRec.set('valor_fcp', itemDados.valor_fcp)

              itemRec.set('base_icms_uf_destino', itemDados.base_icms_uf_destino)
              itemRec.set('aliquota_interna_uf_destino', itemDados.aliquota_interna_uf_destino)
              itemRec.set('aliquota_interestadual', itemDados.aliquota_interestadual)
              itemRec.set('percentual_partilha', itemDados.percentual_partilha)
              itemRec.set('aliquota_fcp_uf_destino', itemDados.aliquota_fcp_uf_destino)
              itemRec.set('valor_fcp_uf_destino', itemDados.valor_fcp_uf_destino)
              itemRec.set('valor_icms_uf_destino', itemDados.valor_icms_uf_destino)
              itemRec.set('valor_icms_uf_remetente', itemDados.valor_icms_uf_remetente)

              itemRec.set('mod_bc_icms_st', itemDados.mod_bc_icms_st)
              itemRec.set('mva', itemDados.mva)
              itemRec.set('base_icms_st', itemDados.base_icms_st)
              itemRec.set('aliquota_icms_st', itemDados.aliquota_icms_st)
              itemRec.set('valor_icms_st', itemDados.valor_icms_st)

              itemRec.set('cst_ipi', itemDados.cst_ipi)
              itemRec.set('codigo_enquadramento_ipi', itemDados.codigo_enquadramento_ipi)
              itemRec.set('base_ipi', itemDados.base_ipi)
              itemRec.set('aliquota_ipi', itemDados.aliquota_ipi)
              itemRec.set('valor_ipi', itemDados.valor_ipi)

              itemRec.set('cst_pis', itemDados.cst_pis)
              itemRec.set('base_pis', itemDados.base_pis)
              itemRec.set('aliquota_pis', itemDados.aliquota_pis)
              itemRec.set('valor_pis', itemDados.valor_pis)
              itemRec.set('cst_cofins', itemDados.cst_cofins)
              itemRec.set('base_cofins', itemDados.base_cofins)
              itemRec.set('aliquota_cofins', itemDados.aliquota_cofins)
              itemRec.set('valor_cofins', itemDados.valor_cofins)

              itemRec.set('cst_ibs_cbs', itemDados.cst_ibs_cbs)
              itemRec.set('c_class_trib', itemDados.c_class_trib)
              itemRec.set('base_ibs_cbs', itemDados.base_ibs_cbs)
              itemRec.set('aliquota_ibs_uf', itemDados.aliquota_ibs_uf)
              itemRec.set('aliquota_ibs_municipio', itemDados.aliquota_ibs_municipio)
              itemRec.set('aliquota_cbs', itemDados.aliquota_cbs)
              itemRec.set('valor_ibs', itemDados.valor_ibs)
              itemRec.set('valor_cbs', itemDados.valor_cbs)

              itemRec.set('c_benef', itemDados.c_benef)
              itemRec.set('gtin', itemDados.gtin)
              itemRec.set('lote', itemDados.lote)
              itemRec.set('validade', itemDados.validade)

              txApp.save(itemRec)
            }

            docRec = novoDocRec
            refFocus = referenciaUnica
            payloadFocus = jsonFocus
          })
        }
      } catch (eMontar) {
        const msgErroMontar = eMontar && eMontar.message ? eMontar.message : String(eMontar)
        console.log('[emitir-nfe-venda] Erro ao obter/estruturar rascunho: ' + msgErroMontar)
        return c.json(400, {
          sucesso: false,
          message: msgErroMontar || 'Não foi possível estruturar os dados fiscais da venda.',
        })
      }

      if (!payloadFocus || !docRec) {
        return c.json(400, {
          sucesso: false,
          message: 'Dados fiscais da NF-e não puderam ser carregados.',
        })
      }

      // IBS/CBS (Reforma Tributária): quando o rascunho foi reaproveitado de um
      // json_enviado gravado ANTES desta versão (ou pelo montar-rascunho, que não
      // monta o grupo gIBSCBS), complementa o payload com o mesmo tratamento do
      // caminho de montagem local — apenas com "Destacar IBS e CBS" ligado.
      try {
        if (config.getBool('informar_ibs_cbs')) {
          const round2Reuso = (val) => Math.round((Number(val) || 0) * 100) / 100
          const jaTemIbsCbs = (payloadFocus.items || []).some(
            (it) => it && it.ibs_cbs_situacao_tributaria,
          )
          if (!jaTemIbsCbs && Array.isArray(payloadFocus.items)) {
            for (let ir = 0; ir < payloadFocus.items.length; ir++) {
              const itemReuso = payloadFocus.items[ir]
              if (!itemReuso || itemReuso.ibs_cbs_situacao_tributaria) continue
              const valorItemReuso = round2Reuso(Number(itemReuso.valor_bruto) || 0)
              itemReuso.ibs_cbs_situacao_tributaria = '000'
              itemReuso.ibs_cbs_classificacao_tributaria = '000001'
              itemReuso.ibs_cbs_base_calculo = valorItemReuso
              itemReuso.ibs_uf_aliquota = 0.1
              itemReuso.ibs_uf_valor = round2Reuso(valorItemReuso * (0.1 / 100))
              itemReuso.ibs_mun_aliquota = 0
              itemReuso.ibs_mun_valor = 0
              itemReuso.ibs_valor_total = round2Reuso(
                itemReuso.ibs_uf_valor + itemReuso.ibs_mun_valor,
              )
              itemReuso.cbs_aliquota = 0.9
              itemReuso.cbs_valor = round2Reuso(valorItemReuso * (0.9 / 100))
            }
            payloadFocus.valor_total_ibs = round2Reuso(
              payloadFocus.items.reduce(
                (somaIbs, it) => somaIbs + (Number(it.ibs_valor_total) || 0),
                0,
              ),
            )
            payloadFocus.valor_total_cbs = round2Reuso(
              payloadFocus.items.reduce((somaCbs, it) => somaCbs + (Number(it.cbs_valor) || 0), 0),
            )
          }
        }
      } catch (eIbsReuso) {
        console.log(
          '[emitir-nfe-venda] Aviso: falha ao complementar IBS/CBS no rascunho reaproveitado: ' +
            (eIbsReuso && eIbsReuso.message ? eIbsReuso.message : String(eIbsReuso)),
        )
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
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[fiscal/emitir-nfe-venda]', msg)
      return c.json(400, {
        sucesso: false,
        message: msg || 'Falha ao emitir NF-e da venda.',
      })
    }
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

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
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

      function obterAssinanteImpersonadoLocal(userId, appInstance) {
        const app = appInstance || $app
        if (!userId) return null
        try {
          if (!app.hasTable('master_impersonacoes')) return null
          const recs = app.findRecordsByFilter(
            'master_impersonacoes',
            "user_id = '" + userId + "'",
            '-created',
            1,
            0,
          )
          if (recs && recs.length > 0) {
            return recs[0].getString('assinante_id') || null
          }
        } catch (_) {}
        return null
      }

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
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

      if (isAdmin || ehMasterUser) {
        try {
          const empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
          return empresas
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
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

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
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
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
          const cred = creds[0]
          const tokenBanco = (
            ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
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
    const transferenciaId = data.transferencia_id

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
    } else if (transferenciaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `transferencia_id = '${transferenciaId}' && modelo = '55'`,
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
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
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
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const nomeSegredo = tokenInfo.nomeSegredo
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou configure o segredo ${nomeSegredo}.`,
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
    const queryParam = modelo === '65' ? '' : '?completa=1'
    const url = `${baseUrl}/${endpoint}/${encodeURIComponent(refFocus)}${queryParam}`
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

      // Se for de transferência, vincular número e chave na transferência
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
          console.warn('Erro ao atualizar transferência vinculada à NF-e:', errTrf)
        }
      }

      // Se for de devolução de venda, vincular na devolução
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
          console.warn('Erro ao atualizar devolução de venda vinculada à NF-e:', errDevV)
        }
      }

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

      const devVendaIdDoc = docRec.getString('devolucao_venda_id')
      if (devVendaIdDoc) {
        try {
          const devVendaRec = $app.findRecordById('vendas', devVendaIdDoc)
          if (devVendaRec) {
            devVendaRec.set('status', 'Pendente de nota')
            devVendaRec.set('documento_fiscal_status', 'Rejeitada')
            devVendaRec.set('documento_fiscal_id', docRec.id)
            devVendaRec.set('motivo_cancelamento', motivoRejeicao)
            $app.save(devVendaRec)
          }
        } catch (errDevV) {
          console.warn('Erro ao atualizar devolução de venda rejeitada:', errDevV)
        }
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

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
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

      function obterAssinanteImpersonadoLocal(userId, appInstance) {
        const app = appInstance || $app
        if (!userId) return null
        try {
          if (!app.hasTable('master_impersonacoes')) return null
          const recs = app.findRecordsByFilter(
            'master_impersonacoes',
            "user_id = '" + userId + "'",
            '-created',
            1,
            0,
          )
          if (recs && recs.length > 0) {
            return recs[0].getString('assinante_id') || null
          }
        } catch (_) {}
        return null
      }

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
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

      if (isAdmin || ehMasterUser) {
        try {
          const empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
          return empresas
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
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

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
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
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
          const cred = creds[0]
          const tokenBanco = (
            ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
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
    const transferenciaId = data.transferencia_id
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
    } else if (transferenciaId) {
      const docs = $app.findRecordsByFilter(
        'documentos_fiscais',
        `transferencia_id = '${transferenciaId}' && status = 'Autorizada' && modelo = '55'`,
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
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
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
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const nomeSegredo = tokenInfo.nomeSegredo
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou configure o segredo ${nomeSegredo}.`,
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

    // Atualizar transferência se vinculada
    const tIdDoc = docRec.getString('transferencia_id')
    if (tIdDoc) {
      try {
        const tRec = $app.findRecordById('transferencias', tIdDoc)
        tRec.set('nota_fiscal_numero', '')
        tRec.set('nota_fiscal_chave', '')
        $app.save(tRec)
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

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
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

      function obterAssinanteImpersonadoLocal(userId, appInstance) {
        const app = appInstance || $app
        if (!userId) return null
        try {
          if (!app.hasTable('master_impersonacoes')) return null
          const recs = app.findRecordsByFilter(
            'master_impersonacoes',
            "user_id = '" + userId + "'",
            '-created',
            1,
            0,
          )
          if (recs && recs.length > 0) {
            return recs[0].getString('assinante_id') || null
          }
        } catch (_) {}
        return null
      }

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
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

      if (isAdmin || ehMasterUser) {
        try {
          const empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
          return empresas
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
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

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
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
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
          const cred = creds[0]
          const tokenBanco = (
            ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
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
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
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
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const nomeSegredo = tokenInfo.nomeSegredo
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou configure o segredo ${nomeSegredo}.`,
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

    function eMaster(authRec) {
      if (!authRec) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuario(authRec) {
      if (!authRec) return []

      let usuarioRec = null
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "auth_user_id = '" + authRec.id + "' || id = '" + authRec.id + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) usuarioRec = uRecs[0]
      } catch (_) {}

      if (!usuarioRec && authRec.getString && authRec.getString('email')) {
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            "email = '" + authRec.getString('email') + "'",
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

      function obterAssinanteImpersonadoLocal(userId, appInstance) {
        const app = appInstance || $app
        if (!userId) return null
        try {
          if (!app.hasTable('master_impersonacoes')) return null
          const recs = app.findRecordsByFilter(
            'master_impersonacoes',
            "user_id = '" + userId + "'",
            '-created',
            1,
            0,
          )
          if (recs && recs.length > 0) {
            return recs[0].getString('assinante_id') || null
          }
        } catch (_) {}
        return null
      }

      const ehMasterUser = eMaster(authRec)
      if (ehMasterUser) {
        try {
          const impersonadoId = obterAssinanteImpersonadoLocal(authRec.id, $app)
          if (impersonadoId) {
            assinanteId = impersonadoId
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

      if (isAdmin || ehMasterUser) {
        try {
          const empresas = $app.findRecordsByFilter(
            'empresas',
            "assinante_id = '" + assinanteId + "' && ativo = true",
            'codigo',
            500,
            0,
          )
          return empresas
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
      if (!empresaId) {
        throw new BadRequestError('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(authRec)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

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
        const configs = app.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '-created',
          1,
          0,
        )
        if (configs && configs.length > 0) {
          const cfg = configs[0]
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
          const cred = creds[0]
          const tokenBanco = (
            ehProducao ? cred.getString('token_producao') : cred.getString('token_homologacao')
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
    try {
      exigirEmpresaDoUsuario(authRecord, empresaId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
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
    const tokenInfo = obterTokenFocus(empresaId, $app)
    const ambiente = tokenInfo.ambiente
    const nomeSegredo = tokenInfo.nomeSegredo
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou configure o segredo ${nomeSegredo}.`,
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
