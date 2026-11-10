// @ts-check
/// <reference path="../types.d.ts" />

/**
 * EXPORTAR XMLs FISCAIS (ZIP COM PASTAS SEPARADAS E RESUMO CSV)
 *
 * Endpoint:
 * - POST /backend/v1/fiscal/exportar-xmls
 *
 * Gera e retorna em base64 um arquivo ZIP contendo:
 * a) XMLs autorizados e XMLs de cancelamento das notas de saída do mês (NF-e e NFC-e), em pastas separadas:
 *    - saida/nfe_autorizadas/
 *    - saida/nfce_autorizadas/
 *    - saida/nfe_canceladas/
 *    - saida/nfce_canceladas/
 * b) XMLs das cartas de correção do mês:
 *    - cartas_correcao/
 * c) XMLs das inutilizações do mês:
 *    - inutilizacoes/
 * d) XMLs das notas de entrada do mês com XML armazenado:
 *    - entradas/
 * e) Resumo CSV:
 *    - resumo_documentos_mes.csv (Modelo, Série, Número, Chave, Data, Destinatário/Emitente, Valor, Status)
 *
 * Permissões:
 * - Autenticação obrigatória
 * - Usuário com permissão no módulo 'notas_saida' ou 'notas_entrada' (ou Administrador)
 * - Usuário comum só pode exportar da sua própria empresa
 *
 * IMPORTANTE (JSVM do PocketBase): constantes/funções declaradas no TOPO do
 * arquivo NÃO são visíveis dentro dos callbacks — todo helper usado por uma
 * rota deve ser declarado dentro do corpo do próprio callback (padrão
 * "Hook scoping error" já observado neste projeto).
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/exportar-xmls',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
      }

      // Nota: NÃO usar require(`${__hooks}/tenancy.js`) aqui — dentro de callbacks
      // o JSVM responde 'Invalid module'. A checagem de escopo da empresa é
      // reimplementada localmente, fiel à semântica de exigirEmpresaDoUsuario.

      const data = c.requestInfo().body || {}
      const empresaId = (data.empresa_id || '').trim()
      const mes = parseInt(data.mes, 10)
      const ano = parseInt(data.ano, 10)

      if (!empresaId) {
        return c.json(400, { sucesso: false, message: 'O campo empresa_id é obrigatório.' })
      }

      if (isNaN(mes) || mes < 1 || mes > 12 || isNaN(ano) || ano < 2000 || ano > 2100) {
        return c.json(400, {
          sucesso: false,
          message: 'Mês (1 a 12) e ano válidos são obrigatórios.',
        })
      }

      // --- Helpers locais de tenancy (equivalentes aos de tenancy.js, sem require) ---
      function eMasterLocal(auth) {
        if (!auth) return false
        try {
          const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
          return !!(userRec && userRec.getString('tipo') === 'master')
        } catch (_) {
          return false
        }
      }

      function obterAssinanteImpersonadoLocal(userId, appInstance) {
        const app = appInstance || $app
        if (!userId) return null
        try {
          if (!app.hasTable('master_impersonacoes')) return null
          const recs = app.findRecordsByFilter(
            'master_impersonacoes',
            `user_id = '${userId}'`,
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

      function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
        if (!assinanteRec) return
        // Assinante de origem NUNCA é bloqueado
        if (
          assinanteRec.getBool('origem') ||
          assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
        ) {
          return
        }
        // O master NUNCA é bloqueado
        if (authRecord && eMasterLocal(authRecord)) {
          return
        }
        const status = assinanteRec.getString('status')
        if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
          throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
        }
      }

      function empresasDoUsuarioLocal(auth) {
        if (!auth) return []
        let usuarioRec = null
        try {
          const uRecs = $app.findRecordsByFilter(
            'usuarios',
            `auth_user_id = '${auth.id}' || id = '${auth.id}'`,
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
              `email = '${auth.getString('email')}'`,
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

        const ehMasterUser = eMasterLocal(auth)
        if (ehMasterUser) {
          try {
            const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
            if (impersonadoId) {
              assinanteId = impersonadoId
            }
          } catch (_) {}
        }

        let isAdminLocal = false
        const perfilId = usuarioRec.getString('perfil_id')
        if (perfilId) {
          try {
            const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
            if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
              isAdminLocal = true
            }
          } catch (_) {}
        }

        // Admin do assinante (ou Master) vê todas as empresas ativas do assinante
        if (isAdminLocal || ehMasterUser) {
          try {
            return $app.findRecordsByFilter(
              'empresas',
              `assinante_id = '${assinanteId}' && ativo = true`,
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
            `usuario_id = '${usuarioRec.id}' && ativo = true`,
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

      function exigirEmpresaDoUsuarioLocal(auth, alvoEmpresaId) {
        if (!alvoEmpresaId) {
          throw new BadRequestError('ID da empresa é obrigatório.')
        }
        const permitidas = empresasDoUsuarioLocal(auth)
        const encontrada = permitidas.find((e) => e.id === alvoEmpresaId)
        if (!encontrada) {
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      try {
        exigirEmpresaDoUsuarioLocal(authRecord, empresaId)
      } catch (errEmp) {
        return c.json(403, {
          sucesso: false,
          message: errEmp.message || 'Acesso negado à empresa especificada.',
        })
      }

      const userId = authRecord.id

      // Checagem de permissão e vínculo com empresa
      let isAdmin = false
      let podeVerSaidaOuEntrada = false
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
              isAdmin = true
              podeVerSaidaOuEntrada = true
            } else {
              const perms = $app.findRecordsByFilter(
                'permissoes',
                `perfil_id = '${perfilRec.id}' && (modulo = 'notas_saida' || modulo = 'notas_entrada') && pode_ver = true && ativo = true`,
                '',
                1,
                0,
              )
              if (perms && perms.length > 0) {
                podeVerSaidaOuEntrada = true
              }

              // Verifica se o usuário tem vínculo com a empresa
              let vinculoOk = callerUser.getString('empresa_padrao_id') === empresaId
              if (!vinculoOk) {
                const vinculos = $app.findRecordsByFilter(
                  'usuarios_empresas',
                  `usuario_id = '${callerUser.id}' && empresa_id = '${empresaId}' && ativo = true`,
                  '',
                  1,
                  0,
                )
                if (vinculos && vinculos.length > 0) vinculoOk = true
              }

              if (!vinculoOk) {
                return c.json(403, {
                  sucesso: false,
                  message: 'Você não tem acesso à empresa solicitada.',
                })
              }
            }
          }
        }
      } catch (_) {}

      if (!podeVerSaidaOuEntrada) {
        return c.json(403, {
          sucesso: false,
          message: 'Acesso negado: permissão de visualização em notas fiscais é necessária.',
        })
      }

      // Carregar registro da empresa
      let empresa = null
      try {
        empresa = $app.findRecordById('empresas', empresaId)
      } catch (_) {
        return c.json(404, { sucesso: false, message: 'Empresa não encontrada.' })
      }

      const nomeEmpresa =
        empresa.getString('nome_fantasia') || empresa.getString('razao_social') || 'Empresa'
      const cnpjEmpresa = (empresa.getString('cnpj') || '').replace(/\D/g, '')
      void nomeEmpresa

      // Intervalo de datas do mês
      const mesStr = mes < 10 ? '0' + mes : String(mes)
      const ultimoDia = new Date(ano, mes, 0).getDate()
      const ultimoDiaStr = ultimoDia < 10 ? '0' + ultimoDia : String(ultimoDia)

      const dataInicioStr = `${ano}-${mesStr}-01 00:00:00`
      const dataFimStr = `${ano}-${mesStr}-${ultimoDiaStr} 23:59:59`
      const dataInicioIso = `${ano}-${mesStr}-01T00:00:00.000Z`
      const dataFimIso = `${ano}-${mesStr}-${ultimoDiaStr}T23:59:59.999Z`

      // PERFORMANCE: leitura de arquivo DIRETO pela abstração de filesystem do
      // PocketBase (funciona com storage local e S3). A versão anterior fazia
      // um $http.send de loopback para http://127.0.0.1:8090 por arquivo, em
      // série: no JSVM a chamada interna não é atendida (lock de runtime) e
      // cada arquivo pendurava até o timeout de 20s, estourando o gateway (504).
      const inicioProcessamento = Date.now()
      const TEMPO_LIMITE_GLOBAL_FOCUSA_MS = 75000
      const TIMEOUT_HTTP_FOCUSA_SEG = 10

      let fsysCache = null
      const lerArquivoLocal = (rec, fileName) => {
        if (!fileName) return null
        try {
          if (!fsysCache) fsysCache = $app.newFilesystem()
          const chaveArquivo = `${rec.baseFilesPath()}/${fileName}`
          let reader = null
          try {
            reader = fsysCache.getReader(chaveArquivo)
            const conteudo = toString(reader)
            return conteudo && conteudo.length > 0 ? conteudo : null
          } finally {
            try {
              if (reader) reader.close()
            } catch (_) {}
          }
        } catch (err) {
          console.warn(
            `[exportar-xmls] Erro ao ler arquivo ${fileName} do registro ${rec.id}:`,
            err,
          )
        }
        return null
      }

      const fecharFilesystem = () => {
        try {
          if (fsysCache) fsysCache.close()
        } catch (_) {}
        fsysCache = null
      }

      // ATENÇÃO JSVM: o objeto Buffer existe mas NEM TODOS os membros existem
      // (Buffer.isBuffer lança "Object has no member 'isBuffer'"). Todo acesso
      // precisa ser guardado por typeof antes de usar.
      const encodeBase64Local = (str) => {
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
          return Buffer.from(str, 'utf8').toString('base64')
        }
        return btoa(str)
      }

      // ---- Fallback Focus NFe (só para documentos SEM XML armazenado localmente) ----
      // Helpers copiados para dentro do callback: o JSVM não enxerga helpers de
      // escopo de arquivo nem resolve require() de libs próprias ('Invalid module').
      let cfgFocusCache = null
      const carregarConfigFocus = (empresaIdLocal) => {
        if (cfgFocusCache) return cfgFocusCache
        let ambiente = 'Homologação'
        let codigoToken = ''
        try {
          const cfgs = $app.findRecordsByFilter(
            'config_emissao_fiscal',
            `empresa_id = '${empresaIdLocal}' && ativo = true`,
            '-created',
            1,
            0,
          )
          if (cfgs && cfgs.length > 0) {
            ambiente = cfgs[0].getString('ambiente') === 'Produção' ? 'Produção' : 'Homologação'
            codigoToken = (cfgs[0].getString('codigo_token') || '').trim().toUpperCase()
          }
        } catch (_) {}

        const sufixoAmbiente = ambiente === 'Produção' ? 'PRODUCAO' : 'HOMOLOGACAO'
        let token = ''
        let origem = 'nenhuma'
        try {
          const creds = $app.findRecordsByFilter(
            'credenciais_fiscais',
            `empresa_id = '${empresaIdLocal}'`,
            '-created',
            1,
            0,
          )
          if (creds && creds.length > 0) {
            const tokenBanco = (
              ambiente === 'Produção'
                ? creds[0].getString('token_producao')
                : creds[0].getString('token_homologacao')
            )
              .toString()
              .trim()
            if (tokenBanco) {
              token = tokenBanco
              origem = 'banco'
            }
          }
        } catch (_) {}

        if (!token) {
          const nomesSegredo = []
          if (codigoToken) nomesSegredo.push(`FOCUS_NFE_TOKEN_${sufixoAmbiente}_${codigoToken}`)
          nomesSegredo.push(`FOCUS_NFE_TOKEN_${sufixoAmbiente}`)
          for (let s = 0; s < nomesSegredo.length; s++) {
            const t = ($os.getenv(nomesSegredo[s]) || '').trim()
            if (t) {
              token = t
              origem = 'segredo'
              break
            }
          }
        }

        cfgFocusCache = {
          token: token,
          origem: origem,
          ambiente: ambiente,
          baseUrl:
            ambiente === 'Produção'
              ? 'https://api.focusnfe.com.br/v2'
              : 'https://homologacao.focusnfe.com.br/v2',
          baseUrlOrigin:
            ambiente === 'Produção'
              ? 'https://api.focusnfe.com.br'
              : 'https://homologacao.focusnfe.com.br',
        }
        return cfgFocusCache
      }

      // Consulta o XML de um documento na Focus NFe. Retorna { ok, xml?, erro? }.
      // Timeout de 10s por chamada + orçamento global de 75s: o endpoint sempre
      // responde dentro do limite do gateway, pulando o documento com aviso.
      const consultarXmlFocusLocal = (docRec, modeloLocal, refLocal) => {
        try {
          if (Date.now() - inicioProcessamento > TEMPO_LIMITE_GLOBAL_FOCUSA_MS) {
            return {
              ok: false,
              erro: 'tempo limite global da exportação atingido; consulta à Focus NFe abortada para este documento',
            }
          }
          const cfg = carregarConfigFocus(docRec.getString('empresa_id'))
          if (!cfg.token) {
            return {
              ok: false,
              erro: 'token da Focus NFe não configurado para a empresa (cadastre nas credenciais fiscais)',
            }
          }
          const endpointFocus = modeloLocal === '65' ? 'nfce' : 'nfe'
          const authHeader = 'Basic ' + encodeBase64Local(cfg.token + ':')
          const res = $http.send({
            method: 'GET',
            url: `${cfg.baseUrl}/${endpointFocus}/${encodeURIComponent(refLocal)}?completa=1`,
            headers: { Authorization: authHeader, Accept: 'application/json' },
            timeout: TIMEOUT_HTTP_FOCUSA_SEG,
          })
          if ((res.statusCode || 200) >= 300) {
            return {
              ok: false,
              erro: `Focus NFe respondeu HTTP ${res.statusCode} na consulta da referência`,
            }
          }
          let respJson = null
          try {
            respJson = JSON.parse(res.raw || '')
          } catch (_) {}
          const caminhoXml = respJson?.caminho_xml_nota_fiscal || respJson?.xml_url || ''
          if (!caminhoXml) {
            return {
              ok: false,
              erro: 'Focus NFe não retornou XML para esta referência (nota pode não estar autorizada)',
            }
          }
          let urlFinalXml = caminhoXml
          if (caminhoXml.startsWith('/')) urlFinalXml = `${cfg.baseUrlOrigin}${caminhoXml}`
          const resXml = $http.send({
            method: 'GET',
            url: urlFinalXml,
            headers: { Authorization: authHeader },
            timeout: TIMEOUT_HTTP_FOCUSA_SEG,
          })
          if ((resXml.statusCode || 200) >= 300 || !resXml.raw) {
            return {
              ok: false,
              erro: `Focus NFe respondeu HTTP ${resXml.statusCode} ao baixar o XML`,
            }
          }
          // Persiste o XML obtido no registro para as próximas exportações serem 100% locais
          try {
            const nomeSeguro = `xml_${(refLocal || docRec.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`
            docRec.set(
              'xml_arquivo',
              $filesystem.fileFromBytes(Buffer.from(resXml.raw, 'utf-8'), nomeSeguro),
            )
            $app.save(docRec)
          } catch (errPersist) {
            console.warn(
              '[exportar-xmls] XML obtido da Focus não pôde ser persistido no registro:',
              errPersist,
            )
          }
          return { ok: true, xml: resXml.raw }
        } catch (errFocus) {
          return {
            ok: false,
            erro: `falha na consulta à Focus NFe: ${(errFocus && (errFocus.message || String(errFocus))) || 'erro desconhecido'}`,
          }
        }
      }

      const arquivosParaZip = []
      const linhasCsv = []
      // Documentos que ficaram de fora do ZIP, com motivo (pt-BR)
      const avisosExport = []
      let totalPulados = 0
      // Cabeçalho CSV com UTF-8 BOM
      linhasCsv.push(
        'Tipo;Modelo;Série;Número;Chave de Acesso;Data Emissão;Destinatário/Emitente;Valor Total;Status',
      )

      // 1. NOTAS DE SAÍDA (documentos_fiscais)
      let docsSaida = []
      try {
        docsSaida = $app.findRecordsByFilter(
          'documentos_fiscais',
          `empresa_id = '${empresaId}' && ((created >= '${dataInicioStr}' && created <= '${dataFimStr}') || (created >= '${dataInicioIso}' && created <= '${dataFimIso}'))`,
          'numero',
          5000,
          0,
        )
      } catch (e) {
        console.warn('Erro ao buscar documentos_fiscais:', e)
        docsSaida = []
      }

      let totalNfeAutorizadas = 0
      let totalNfceAutorizadas = 0
      let totalNfeCanceladas = 0
      let totalNfceCanceladas = 0

      for (let i = 0; i < docsSaida.length; i++) {
        const doc = docsSaida[i]
        const modelo = doc.getString('modelo') || '55'
        const serie = doc.getString('serie') || '1'
        const numero = doc.getInt('numero') || 0
        const chave = doc.getString('chave_acesso') || ''
        const status = doc.getString('status') || 'Rascunho'
        const dataEmissao = doc.getString('data_emissao') || doc.getString('created') || ''
        const destinatario = doc.getString('cliente_nome') || 'Consumidor Final'
        const valorTotal = doc.getFloat('valor_total') || 0
        const xmlArquivo = doc.getString('xml_arquivo')
        const xmlCancelamento = doc.getString('xml_cancelamento')

        // Adiciona linha no CSV
        linhasCsv.push(
          [
            'Saída',
            modelo,
            serie,
            numero,
            chave || '-',
            dataEmissao.substring(0, 19).replace('T', ' '),
            `"${destinatario.replace(/"/g, '""')}"`,
            valorTotal.toFixed(2).replace('.', ','),
            status,
          ].join(';'),
        )

        // a) XML Autorizado — usa o XML armazenado no registro; só consulta a
        // Focus NFe quando não há arquivo local, com timeout/budget e aviso em
        // caso de falha (não trava a exportação).
        if (status === 'Autorizada' || status === 'Cancelada') {
          let conteudoXml = null
          if (xmlArquivo) {
            conteudoXml = lerArquivoLocal(doc, xmlArquivo)
          }
          if (!conteudoXml) {
            const refFocus = doc.getString('referencia') || ''
            if (refFocus) {
              const resFocus = consultarXmlFocusLocal(doc, modelo, refFocus)
              if (resFocus.ok && resFocus.xml) {
                conteudoXml = resFocus.xml
              } else {
                totalPulados++
                avisosExport.push(
                  `Documento ${modelo === '65' ? 'NFC-e' : 'NF-e'} nº ${numero} (série ${serie}): ${resFocus.erro}.`,
                )
              }
            } else {
              totalPulados++
              avisosExport.push(
                `Documento ${modelo === '65' ? 'NFC-e' : 'NF-e'} nº ${numero} (série ${serie}): sem XML armazenado e sem referência para consultar na Focus NFe.`,
              )
            }
          }

          if (conteudoXml) {
            const nomeArqXml = chave
              ? `${chave}.xml`
              : `doc_${modelo}_serie${serie}_num${numero}_${doc.id}.xml`
            if (modelo === '65') {
              arquivosParaZip.push({
                name: `saida/nfce_autorizadas/${nomeArqXml}`,
                data: conteudoXml,
              })
              totalNfceAutorizadas++
            } else {
              arquivosParaZip.push({
                name: `saida/nfe_autorizadas/${nomeArqXml}`,
                data: conteudoXml,
              })
              totalNfeAutorizadas++
            }
          }
        }

        // b) XML de Cancelamento
        if (status === 'Cancelada' && xmlCancelamento) {
          const conteudoCanc = lerArquivoLocal(doc, xmlCancelamento)
          if (conteudoCanc) {
            const nomeArqCanc = chave
              ? `canc_${chave}.xml`
              : `canc_${modelo}_serie${serie}_num${numero}_${doc.id}.xml`
            if (modelo === '65') {
              arquivosParaZip.push({
                name: `saida/nfce_canceladas/${nomeArqCanc}`,
                data: conteudoCanc,
              })
              totalNfceCanceladas++
            } else {
              arquivosParaZip.push({
                name: `saida/nfe_canceladas/${nomeArqCanc}`,
                data: conteudoCanc,
              })
              totalNfeCanceladas++
            }
          }
        }
      }

      // 2. CARTAS DE CORREÇÃO (documentos_fiscais_cartas)
      let totalCartas = 0
      try {
        // Busca cartas do mês
        const cartas = $app.findRecordsByFilter(
          'documentos_fiscais_cartas',
          `(created >= '${dataInicioStr}' && created <= '${dataFimStr}') || (created >= '${dataInicioIso}' && created <= '${dataFimIso}') || (data >= '${dataInicioStr}' && data <= '${dataFimStr}')`,
          '-created',
          2000,
          0,
        )

        for (let j = 0; j < cartas.length; j++) {
          const carta = cartas[j]
          const docId = carta.getString('documento_id')
          let docRel = null
          try {
            docRel = $app.findRecordById('documentos_fiscais', docId)
          } catch (_) {}

          if (docRel && docRel.getString('empresa_id') === empresaId) {
            const seq = carta.getInt('sequencia') || 1
            const chaveDoc = docRel.getString('chave_acesso') || docRel.id
            const xmlCarta = carta.getString('xml_arquivo')
            let conteudoXmlCarta = null
            if (xmlCarta) {
              conteudoXmlCarta = lerArquivoLocal(carta, xmlCarta)
            }

            if (conteudoXmlCarta) {
              arquivosParaZip.push({
                name: `cartas_correcao/cce_${chaveDoc}_seq${seq}.xml`,
                data: conteudoXmlCarta,
              })
              totalCartas++
            }
          }
        }
      } catch (errCartas) {
        console.warn('Erro ao buscar cartas de correção para export:', errCartas)
      }

      // 3. INUTILIZAÇÕES (inutilizacoes)
      let totalInutilizacoes = 0
      try {
        const inuts = $app.findRecordsByFilter(
          'inutilizacoes',
          `empresa_id = '${empresaId}' && ((created >= '${dataInicioStr}' && created <= '${dataFimStr}') || (created >= '${dataInicioIso}' && created <= '${dataFimIso}'))`,
          '-created',
          1000,
          0,
        )

        for (let k = 0; k < inuts.length; k++) {
          const inut = inuts[k]
          const mod = inut.getString('modelo') || '55'
          const ser = inut.getString('serie') || '1'
          const nIni = inut.getInt('numero_inicial') || 0
          const nFim = inut.getInt('numero_final') || 0
          const xmlInut = inut.getString('xml_arquivo')
          const statusInut = inut.getString('status') || 'Autorizada'

          linhasCsv.push(
            [
              'Inutilização',
              mod,
              ser,
              `${nIni} a ${nFim}`,
              inut.getString('protocolo') || '-',
              (inut.getString('data_inutilizacao') || inut.getString('created') || '')
                .substring(0, 19)
                .replace('T', ' '),
              `"${(inut.getString('justificativa') || '').replace(/"/g, '""')}"`,
              '0,00',
              statusInut,
            ].join(';'),
          )

          let conteudoXmlInut = null
          if (xmlInut) {
            conteudoXmlInut = lerArquivoLocal(inut, xmlInut)
          }

          if (conteudoXmlInut) {
            arquivosParaZip.push({
              name: `inutilizacoes/inut_${mod}_serie${ser}_${nIni}_a_${nFim}.xml`,
              data: conteudoXmlInut,
            })
            totalInutilizacoes++
          }
        }
      } catch (errInut) {
        console.warn('Erro ao buscar inutilizações para export:', errInut)
      }

      // 4. NOTAS DE ENTRADA (notas_entrada)
      let totalEntradas = 0
      try {
        const notasEntrada = $app.findRecordsByFilter(
          'notas_entrada',
          `empresa_id = '${empresaId}' && ((created >= '${dataInicioStr}' && created <= '${dataFimStr}') || (created >= '${dataInicioIso}' && created <= '${dataFimIso}'))`,
          'numero',
          3000,
          0,
        )

        for (let m = 0; m < notasEntrada.length; m++) {
          const ne = notasEntrada[m]
          const modelo = ne.getString('modelo') || '55'
          const serie = ne.getString('serie') || '1'
          const numero = ne.getInt('numero') || 0
          const chave = ne.getString('chave_acesso') || ''
          const status = ne.getString('status') || 'Importada'
          const dataEmissao = ne.getString('data_emissao') || ne.getString('created') || ''
          const valorTotal = ne.getFloat('valor_total_nota') || ne.getFloat('valor_total') || 0
          const xmlArquivo = ne.getString('xml_arquivo')

          let fornNome = 'Fornecedor'
          const fornId = ne.getString('fornecedor_id')
          if (fornId) {
            try {
              const fRec = $app.findRecordById('fornecedores', fornId)
              fornNome =
                fRec.getString('nome_fantasia') || fRec.getString('razao_social') || fornNome
            } catch (_) {}
          }

          linhasCsv.push(
            [
              'Entrada',
              modelo,
              serie,
              numero,
              chave || '-',
              dataEmissao.substring(0, 19).replace('T', ' '),
              `"${fornNome.replace(/"/g, '""')}"`,
              valorTotal.toFixed(2).replace('.', ','),
              status,
            ].join(';'),
          )

          let conteudoXmlNe = null
          if (xmlArquivo) {
            conteudoXmlNe = lerArquivoLocal(ne, xmlArquivo)
          }

          if (conteudoXmlNe) {
            const nomeArqNe = chave
              ? `${chave}.xml`
              : `entrada_${modelo}_serie${serie}_num${numero}_${ne.id}.xml`
            arquivosParaZip.push({
              name: `entradas/${nomeArqNe}`,
              data: conteudoXmlNe,
            })
            totalEntradas++
          }
        }
      } catch (errNe) {
        console.warn('Erro ao buscar notas_entrada para export:', errNe)
      }

      // 5. RESUMO CSV
      // Adiciona UTF-8 BOM (\uFEFF) para compatibilidade perfeita com o Excel brasileiro
      const conteudoCsv = '\uFEFF' + linhasCsv.join('\r\n')
      arquivosParaZip.push({
        name: `resumo_documentos_${ano}_${mesStr}.csv`,
        data: conteudoCsv,
      })

      // 6. MONTAGEM DO ZIP EM MEMÓRIA (JS PURO)
      const makeCrcTable = () => {
        let c
        const table = []
        for (let n = 0; n < 256; n++) {
          c = n
          for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
          }
          table[n] = c >>> 0
        }
        return table
      }

      const crcTable = makeCrcTable()

      const calculateCrc32 = (bytes) => {
        let crc = 0 ^ -1
        for (let i = 0; i < bytes.length; i++) {
          crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff]
        }
        return (crc ^ -1) >>> 0
      }

      const dosDateTime = (date) => {
        const d = date || new Date()
        const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff
        const dt =
          (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
        return { time, date: dt }
      }

      const pushU16 = (arr, val) => {
        arr.push(val & 0xff, (val >> 8) & 0xff)
      }

      const pushU32 = (arr, val) => {
        arr.push(val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >>> 24) & 0xff)
      }

      const toBytes = (input) => {
        // ATENÇÃO JSVM: Buffer.isBuffer lança "Object has no member 'isBuffer'".
        // NUNCA acesse Buffer.isBuffer; os XMLs chegam sempre como string.
        if (
          typeof input !== 'string' &&
          input &&
          input.length !== undefined &&
          !Array.isArray(input)
        ) {
          const res = []
          for (let i = 0; i < input.length; i++) res.push(input[i])
          return res
        }
        if (typeof input === 'string') {
          if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            const buf = Buffer.from(input, 'utf-8')
            const r = []
            for (let j = 0; j < buf.length; j++) r.push(buf[j])
            return r
          }
          const out = []
          for (let k = 0; k < input.length; k++) {
            let c = input.charCodeAt(k)
            if (c < 128) {
              out.push(c)
            } else if (c < 2048) {
              out.push(192 | (c >> 6), 128 | (c & 63))
            } else if (
              (c & 0xfc00) === 0xd800 &&
              k + 1 < input.length &&
              (input.charCodeAt(k + 1) & 0xfc00) === 0xdc00
            ) {
              c = 0x10000 + ((c & 0x03ff) << 10) + (input.charCodeAt(++k) & 0x03ff)
              out.push(
                240 | (c >> 18),
                128 | ((c >> 12) & 63),
                128 | ((c >> 6) & 63),
                128 | (c & 63),
              )
            } else {
              out.push(
                224 | (c >> 12),
                128 | ((c >> 6) & 63),
                128 | ((c >> 6) & 63),
                128 | (c & 63),
              )
            }
          }
          return out
        }
        if (Array.isArray(input)) return input
        return []
      }

      const nowDos = dosDateTime(new Date(ano, mes - 1, 15, 12, 0, 0))
      const localHeadersAndData = []
      const centralDirectory = []
      let offset = 0

      for (let f = 0; f < arquivosParaZip.length; f++) {
        const entry = arquivosParaZip[f]
        const nameBytes = toBytes(entry.name)
        const dataBytes = toBytes(entry.data)
        const crc = calculateCrc32(dataBytes)
        const size = dataBytes.length

        const localHeader = []
        pushU32(localHeader, 0x04034b50)
        pushU16(localHeader, 20)
        pushU16(localHeader, 0x0800) // UTF-8
        pushU16(localHeader, 0) // Store
        pushU16(localHeader, nowDos.time)
        pushU16(localHeader, nowDos.date)
        pushU32(localHeader, crc)
        pushU32(localHeader, size)
        pushU32(localHeader, size)
        pushU16(localHeader, nameBytes.length)
        pushU16(localHeader, 0)

        for (let nh = 0; nh < localHeader.length; nh++) localHeadersAndData.push(localHeader[nh])
        for (let nb = 0; nb < nameBytes.length; nb++) localHeadersAndData.push(nameBytes[nb])
        for (let db = 0; db < dataBytes.length; db++) localHeadersAndData.push(dataBytes[db])

        const cd = []
        pushU32(cd, 0x02014b50)
        pushU16(cd, 20)
        pushU16(cd, 20)
        pushU16(cd, 0x0800)
        pushU16(cd, 0)
        pushU16(cd, nowDos.time)
        pushU16(cd, nowDos.date)
        pushU32(cd, crc)
        pushU32(cd, size)
        pushU32(cd, size)
        pushU16(cd, nameBytes.length)
        pushU16(cd, 0)
        pushU16(cd, 0)
        pushU16(cd, 0)
        pushU16(cd, 0)
        pushU32(cd, 0)
        pushU32(cd, offset)

        for (let cdi = 0; cdi < cd.length; cdi++) centralDirectory.push(cd[cdi])
        for (let cdn = 0; cdn < nameBytes.length; cdn++) centralDirectory.push(nameBytes[cdn])

        offset += localHeader.length + nameBytes.length + dataBytes.length
      }

      const cdStartOffset = offset
      const cdSize = centralDirectory.length
      const totalEntries = arquivosParaZip.length

      const eocd = []
      pushU32(eocd, 0x06054b50)
      pushU16(eocd, 0)
      pushU16(eocd, 0)
      pushU16(eocd, totalEntries)
      pushU16(eocd, totalEntries)
      pushU32(eocd, cdSize)
      pushU32(eocd, cdStartOffset)
      pushU16(eocd, 0)

      const fullZipBytes = []
      for (let f1 = 0; f1 < localHeadersAndData.length; f1++)
        fullZipBytes.push(localHeadersAndData[f1])
      for (let f2 = 0; f2 < centralDirectory.length; f2++) fullZipBytes.push(centralDirectory[f2])
      for (let f3 = 0; f3 < eocd.length; f3++) fullZipBytes.push(eocd[f3])

      const encodeBase64Bytes = (bytes) => {
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
          return Buffer.from(bytes).toString('base64')
        }
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        let out = ''
        let i = 0
        const len = bytes.length
        while (i < len) {
          const c1 = bytes[i++] & 0xff
          if (i === len) {
            out += chars.charAt(c1 >> 2)
            out += chars.charAt((c1 & 0x3) << 4)
            out += '=='
            break
          }
          const c2 = bytes[i++] & 0xff
          if (i === len) {
            out += chars.charAt(c1 >> 2)
            out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
            out += chars.charAt((c2 & 0x0f) << 2)
            out += '='
            break
          }
          const c3 = bytes[i++] & 0xff
          out += chars.charAt(c1 >> 2)
          out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4))
          out += chars.charAt(((c2 & 0x0f) << 2) | ((c3 & 0xc0) >> 6))
          out += chars.charAt(c3 & 0x3f)
        }
        return out
      }

      const zipBase64 = encodeBase64Bytes(fullZipBytes)
      const nomeArquivo = `XMLs_${cnpjEmpresa || 'empresa'}_${ano}_${mesStr}.zip`

      fecharFilesystem()

      return c.json(200, {
        sucesso: true,
        nome_arquivo: nomeArquivo,
        zip_base64: zipBase64,
        documentos_pulados: totalPulados,
        avisos: avisosExport,
        totais: {
          nfe_autorizadas: totalNfeAutorizadas,
          nfce_autorizadas: totalNfceAutorizadas,
          nfe_canceladas: totalNfeCanceladas,
          nfce_canceladas: totalNfceCanceladas,
          cartas_correcao: totalCartas,
          inutilizacoes: totalInutilizacoes,
          entradas: totalEntradas,
          total_arquivos: arquivosParaZip.length,
        },
      })
    } catch (errGeral) {
      // Qualquer falha inesperada devolve o motivo real em pt-BR, em vez do
      // genérico "Something went wrong".
      const detalhe = (errGeral && (errGeral.message || String(errGeral))) || 'erro desconhecido'
      console.error('[exportar-xmls] Erro ao exportar XMLs:', detalhe)
      return c.json(500, {
        sucesso: false,
        message: `Erro ao exportar XMLs: ${detalhe}`,
      })
    }
  },
  $apis.requireAuth(),
)
