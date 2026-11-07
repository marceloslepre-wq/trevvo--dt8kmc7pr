// reenvio 9.8r2
/// <reference path="../types.d.ts" />

/**
 * Operações fiscais especializadas:
 * 1) POST /backend/v1/fiscal/emitir-nfe-devolucao-compra
 * 2) POST /backend/v1/fiscal/confirmar-autorizacao-devolucao-compra
 * 3) POST /backend/v1/fiscal/emitir-nfe-transferencia
 *
 * Todas respeitam estritamente a regra: a empresa emitente é SEMPRE a empresa_id do documento.
 * Funções auxiliares declaradas inline em cada callback devido ao pool JSVM do PocketBase.
 */

// =========================================================================
// 1) DEVOLUÇÃO DE COMPRA (nota de saída para o fornecedor)
// =========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe-devolucao-compra',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    try {
      // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
      function assinanteDoUsuario(auth) {
        if (!auth) {
          throw new BadRequestError('Autenticação necessária para identificar o assinante.')
        }

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

        if (!usuarioRec) {
          throw new BadRequestError('Registro de usuário ERP não encontrado.')
        }

        let assinanteId = usuarioRec.getString('assinante_id')
        if (!assinanteId) {
          throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
        }

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

        function checarSeMasterLocal(authRec, appInstance) {
          const app = appInstance || $app
          if (!authRec || !authRec.id) return false
          try {
            const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
            return !!(userRec && userRec.getString('tipo') === 'master')
          } catch (_) {
            return false
          }
        }

        function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
          if (!assinanteRec) return

          if (
            assinanteRec.getBool('origem') ||
            assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
          ) {
            return
          }

          if (authRecord && checarSeMasterLocal(authRecord)) {
            return
          }

          const status = assinanteRec.getString('status')
          if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
            throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
          }
        }

        if (eMaster(auth)) {
          try {
            const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
            if (impersonadoId) {
              assinanteId = impersonadoId
            }
          } catch (_) {}
        }

        const assinante = $app.findRecordById('assinantes', assinanteId)
        if (!assinante) {
          throw new BadRequestError('Assinante não encontrado.')
        }

        try {
          validarLicencaAtivaOuBloquearLocal(assinante, auth)
        } catch (errBloq) {
          throw errBloq
        }

        return assinante
      }

      function eMaster(auth) {
        if (!auth) return false
        try {
          const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
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

        const ehMasterUser = eMaster(auth)
        if (ehMasterUser) {
          try {
            const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
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

      function exigirEmpresaDoUsuario(auth, empresaId) {
        if (!empresaId) {
          throw new BadRequestError('ID da empresa é obrigatório.')
        }
        const permitidas = empresasDoUsuario(auth)
        const encontrada = permitidas.find((e) => e.id === empresaId)
        if (!encontrada) {
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      // Funções de fiscal_token_lib copiadas localmente (evita require no JSVM)
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
      const notaEntradaId = data.nota_entrada_id
      const motivoDevolucao = (data.motivo || '').trim()
      const destinoFinanceiro = data.destino_financeiro || 'abater_titulos' // 'abater_titulos' ou 'gerar_receber'
      const itensDevolucao = Array.isArray(data.itens) ? data.itens : []

      if (!notaEntradaId) {
        return c.json(400, { sucesso: false, message: 'nota_entrada_id é obrigatório.' })
      }
      if (!itensDevolucao || itensDevolucao.length === 0) {
        return c.json(400, {
          sucesso: false,
          message: 'Selecione ao menos um item para devolução.',
        })
      }
      if (!motivoDevolucao) {
        return c.json(400, { sucesso: false, message: 'Informe o motivo da devolução.' })
      }

      // Carregar nota de entrada
      let notaEntrada = null
      try {
        notaEntrada = $app.findRecordById('notas_entrada', notaEntradaId)
      } catch (_) {}

      if (!notaEntrada || !notaEntrada.getBool('ativo')) {
        return c.json(400, {
          sucesso: false,
          message: 'Nota de entrada não encontrada ou inativa.',
        })
      }
      if (notaEntrada.getString('status') !== 'Lançada') {
        return c.json(400, {
          sucesso: false,
          message: 'Apenas notas de entrada com status Lançada podem ser devolvidas ao fornecedor.',
        })
      }

      const empresaId = notaEntrada.getString('empresa_id')
      try {
        exigirEmpresaDoUsuario(authRecord, empresaId)
      } catch (errEmp) {
        return c.json(403, {
          sucesso: false,
          message: errEmp.message || 'Acesso negado à empresa especificada.',
        })
      }
      const fornecedorId = notaEntrada.getString('fornecedor_id')
      const chaveNotaReferenciada = (notaEntrada.getString('chave_acesso') || '').replace(/\D/g, '')

      if (!chaveNotaReferenciada || chaveNotaReferenciada.length !== 44) {
        return c.json(400, {
          sucesso: false,
          message:
            'A nota de entrada não possui chave de acesso válida (44 dígitos) para ser referenciada.',
        })
      }

      let empresaEmitente = null
      try {
        empresaEmitente = $app.findRecordById('empresas', empresaId)
      } catch (_) {}

      if (!empresaEmitente || !empresaEmitente.getBool('ativo')) {
        return c.json(400, {
          sucesso: false,
          message: 'Empresa emitente não encontrada ou inativa.',
        })
      }

      let fornecedor = null
      try {
        fornecedor = $app.findRecordById('fornecedores', fornecedorId)
      } catch (_) {}

      if (!fornecedor || !fornecedor.getBool('ativo')) {
        return c.json(400, {
          sucesso: false,
          message: 'Fornecedor da nota não encontrado ou inativo.',
        })
      }

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
          message: 'Empresa emitente não possui configuração fiscal ativa.',
        })
      }
      const cfgFiscal = configs[0]
      if (!cfgFiscal.getBool('emite_documentos_fiscais')) {
        return c.json(400, {
          sucesso: false,
          message:
            'Esta empresa não emite NF-e (emite_documentos_fiscais desativado na configuração fiscal).',
        })
      }

      const tokenInfo = obterTokenFocus(empresaId, $app)
      const ambiente = tokenInfo.ambiente
      const token = tokenInfo.token

      if (!token) {
        return c.json(400, {
          sucesso: false,
          message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
        })
      }

      const baseUrl =
        ambiente === 'Produção'
          ? 'https://api.focusnfe.com.br/v2'
          : 'https://homologacao.focusnfe.com.br/v2'

      const serieNfe = cfgFiscal.getString('serie_nfe') || '1'
      const naturezaOperacao =
        cfgFiscal.getString('natureza_operacao_devolucao_compra') || 'Devolução de compra'

      const cnpjEmitente = (empresaEmitente.getString('cnpj') || '').replace(/\D/g, '')
      const ufEmitente = (empresaEmitente.getString('uf') || '').trim().toUpperCase()
      const nomeDocEmp = (empresaEmitente.getString('nome_documentos_fiscais') || '').trim()
      const razaoSocialEmp = (empresaEmitente.getString('razao_social') || '').trim()
      const nomeEmitenteFinal = truncar60(nomeDocEmp || razaoSocialEmp)

      const cnpjCpfForn = (fornecedor.getString('cpf_cnpj') || '').replace(/\D/g, '')
      const nomeForn =
        fornecedor.getString('razao_social') || fornecedor.getString('nome_fantasia') || ''
      const ufForn = (fornecedor.getString('uf') || '').trim().toUpperCase()
      const ieForn = (fornecedor.getString('inscricao_estadual') || '').trim()
      const ibgeForn = (fornecedor.getString('codigo_municipio_ibge') || '').trim()
      const logrForn = fornecedor.getString('logradouro') || ''
      const numForn = fornecedor.getString('numero') || 'S/N'
      const bairroForn = fornecedor.getString('bairro') || ''
      const munForn = fornecedor.getString('municipio') || ''
      const cepForn = (fornecedor.getString('cep') || '').replace(/\D/g, '')

      const ehOperacaoInterna = ufForn === ufEmitente
      const indicadorIeDest = ieForn && ieForn.toUpperCase() !== 'ISENTO' ? '1' : '9'

      // Carregar itens da nota de entrada e validar quantidades
      const itensNotaMap = new Map()
      const itensNotaEntrada = $app.findRecordsByFilter(
        'notas_entrada_itens',
        `nota_id = '${notaEntradaId}' && ativo = true`,
      )
      for (let it of itensNotaEntrada) {
        itensNotaMap.set(it.id, it)
      }

      let totValorProdutos = 0
      let totValorTotal = 0
      let totBaseIcms = 0
      let totValorIcms = 0
      let totBaseIcmsSt = 0
      let totValorIcmsSt = 0
      let totValorIpi = 0

      const itensFocus = []
      const itensDocFiscal = []

      for (let i = 0; i < itensDevolucao.length; i++) {
        const itDev = itensDevolucao[i]
        const itEntrada = itensNotaMap.get(itDev.item_id)
        if (!itEntrada) {
          return c.json(400, {
            sucesso: false,
            message: `Item #${itDev.item_id} não pertence a esta nota de entrada.`,
          })
        }

        const descricaoItem =
          itEntrada.getString('descricao_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('descricao')
            ? itEntrada.getString('descricao')
            : '') ||
          `Item ${i + 1}`

        const qtdEntrada =
          itEntrada.getFloat('quantidade_fornecedor') ||
          itEntrada.getFloat('quantidade_estoque') ||
          (itEntrada.hasField && itEntrada.hasField('quantidade')
            ? itEntrada.getFloat('quantidade')
            : 0) ||
          0
        const qtdJaDevolvida = itEntrada.getFloat('quantidade_devolvida') || 0
        const saldoDevolvivel = Math.max(0, qtdEntrada - qtdJaDevolvida)
        const qtdADevolver = Number(itDev.quantidade) || 0

        if (qtdADevolver <= 0) {
          return c.json(400, {
            sucesso: false,
            message: `Quantidade a devolver no item ${i + 1} deve ser maior que zero.`,
          })
        }
        if (qtdADevolver > saldoDevolvivel + 0.0001) {
          return c.json(400, {
            sucesso: false,
            message: `Quantidade a devolver (${qtdADevolver}) do item "${descricaoItem}" supera o saldo disponível (${saldoDevolvivel}).`,
          })
        }

        const fatorProporcao = qtdEntrada > 0 ? qtdADevolver / qtdEntrada : 1
        const valorUnitario =
          itEntrada.getFloat('valor_unitario_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('valor_unitario')
            ? itEntrada.getFloat('valor_unitario')
            : 0) ||
          (qtdEntrada > 0 ? itEntrada.getFloat('valor_produto') / qtdEntrada : 0) ||
          0
        const valorBrutoDev = Math.round(qtdADevolver * valorUnitario * 100) / 100

        // Impostos da entrada devolvidos proporcionalmente
        const baseIcmsItem =
          Math.round((itEntrada.getFloat('base_icms') || 0) * fatorProporcao * 100) / 100
        const aliqIcmsItem = itEntrada.getFloat('aliquota_icms') || 0
        const valorIcmsItem =
          Math.round((itEntrada.getFloat('valor_icms') || 0) * fatorProporcao * 100) / 100

        const baseStItem =
          Math.round((itEntrada.getFloat('base_icms_st') || 0) * fatorProporcao * 100) / 100
        const aliqStItem = itEntrada.getFloat('aliquota_icms_st') || 0
        const valorStItem =
          Math.round((itEntrada.getFloat('valor_icms_st') || 0) * fatorProporcao * 100) / 100

        const baseIpiItem =
          Math.round((itEntrada.getFloat('base_ipi') || 0) * fatorProporcao * 100) / 100
        const aliqIpiItem = itEntrada.getFloat('aliquota_ipi') || 0
        const valorIpiItem =
          Math.round((itEntrada.getFloat('valor_ipi') || 0) * fatorProporcao * 100) / 100

        const teveStNaCompra = valorStItem > 0 || baseStItem > 0

        // CFOP de devolução de compra: 5202/6202 para revenda, 5411/6411 com ST
        let cfopDevolucao = ''
        if (teveStNaCompra) {
          cfopDevolucao = ehOperacaoInterna ? '5411' : '6411'
        } else {
          cfopDevolucao = ehOperacaoInterna ? '5202' : '6202'
        }

        const numItem = i + 1
        const prodId = itEntrada.getString('produto_id')
        let prodRec = null
        if (prodId) {
          try {
            prodRec = $app.findRecordById('produtos', prodId)
          } catch (_) {}
        }

        const ncm = (
          itEntrada.getString('ncm_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('ncm') ? itEntrada.getString('ncm') : '') ||
          (prodRec ? prodRec.getString('ncm') : '') ||
          ''
        ).replace(/\D/g, '')

        const cest = (
          itEntrada.getString('cest_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('cest') ? itEntrada.getString('cest') : '') ||
          (prodRec ? prodRec.getString('cest') : '') ||
          ''
        ).replace(/\D/g, '')

        const cstIcms =
          itEntrada.getString('cst_icms_entrada') ||
          itEntrada.getString('cst_icms_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('cst_icms')
            ? itEntrada.getString('cst_icms')
            : '') ||
          (prodRec ? prodRec.getString('cst_icms') : '') ||
          '00'

        const origemItem =
          itEntrada.getString('origem') || (prodRec ? prodRec.getString('origem') : '') || '0'

        const unidadeItem =
          itEntrada.getString('unidade_fornecedor') ||
          (itEntrada.hasField && itEntrada.hasField('unidade')
            ? itEntrada.getString('unidade')
            : '') ||
          'UN'

        const gtinItem = (
          itEntrada.getString('gtin_fornecedor') ||
          (prodRec ? prodRec.getString('gtin') : '') ||
          ''
        ).trim()

        const codigoProdItem =
          itEntrada.getString('codigo_fornecedor') ||
          (prodRec
            ? String(prodRec.getInt('codigo') || prodRec.getString('referencia') || prodId)
            : String(numItem))

        const itemFocus = {
          numero_item: numItem,
          codigo_produto: codigoProdItem,
          descricao: descricaoItem,
          cfop: cfopDevolucao,
          codigo_ncm: ncm,
          unidade_comercial: unidadeItem,
          quantidade_comercial: qtdADevolver,
          valor_unitario_comercial: valorUnitario,
          unidade_tributavel: unidadeItem,
          quantidade_tributavel: qtdADevolver,
          valor_unitario_tributavel: valorUnitario,
          valor_bruto: valorBrutoDev,
          icms_origem: origemItem,
          icms_situacao_tributaria: cstIcms,
        }

        if (baseIcmsItem > 0 && valorIcmsItem > 0) {
          itemFocus.icms_modalidade_base_calculo = '3'
          itemFocus.icms_base_calculo = baseIcmsItem
          itemFocus.icms_aliquota = aliqIcmsItem
          itemFocus.icms_valor = valorIcmsItem
        }
        if (baseStItem > 0 && valorStItem > 0) {
          itemFocus.icms_modalidade_base_calculo_st = '4'
          itemFocus.icms_base_calculo_st = baseStItem
          itemFocus.icms_aliquota_st = aliqStItem
          itemFocus.icms_valor_st = valorStItem
        }

        if (gtinItem && gtinItem.toUpperCase() !== 'SEM GTIN') {
          itemFocus.codigo_gtin = gtinItem
          itemFocus.codigo_gtin_tributavel = gtinItem
        }

        if (cest) itemFocus.codigo_cest = cest
        if (valorIpiItem > 0) {
          itemFocus.ipi_situacao_tributaria = itEntrada.getString('cst_ipi') || '99'
          itemFocus.ipi_base_calculo = baseIpiItem
          itemFocus.ipi_aliquota = aliqIpiItem
          itemFocus.ipi_valor = valorIpiItem
        }

        itensFocus.push(itemFocus)

        itensDocFiscal.push({
          item: numItem,
          produto_id: prodId,
          codigo: itemFocus.codigo_produto,
          descricao: itemFocus.descricao,
          ncm: ncm,
          cest: cest,
          cfop: cfopDevolucao,
          unidade: itemFocus.unidade_comercial,
          quantidade: qtdADevolver,
          valor_unitario: valorUnitario,
          valor_bruto: valorBrutoDev,
          valor_total: valorBrutoDev + valorStItem + valorIpiItem,
          origem: origemItem,
          cst_icms: cstIcms,
          base_icms: baseIcmsItem,
          aliquota_icms: aliqIcmsItem,
          valor_icms: valorIcmsItem,
          base_icms_st: baseStItem,
          aliquota_icms_st: aliqStItem,
          valor_icms_st: valorStItem,
          valor_ipi: valorIpiItem,
          custo_unitario: itEntrada.getFloat('custo_unitario_estoque') || valorUnitario,
          lote: itEntrada.getString('lote_numero') || '',
          validade: itEntrada.getString('lote_validade') || '',
          gtin: gtinItem && gtinItem.toUpperCase() !== 'SEM GTIN' ? gtinItem : '',
        })

        totValorProdutos += valorBrutoDev
        totBaseIcms += baseIcmsItem
        totValorIcms += valorIcmsItem
        totBaseIcmsSt += baseStItem
        totValorIcmsSt += valorStItem
        totValorIpi += valorIpiItem
        totValorTotal += valorBrutoDev + valorStItem + valorIpiItem
      }

      totValorProdutos = Math.round(totValorProdutos * 100) / 100
      totValorTotal = Math.round(totValorTotal * 100) / 100

      const nomeDestFinal = truncar60(
        ambiente === 'Homologação'
          ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : fornecedor.getString('razao_social') || fornecedor.getString('nome_fantasia') || '',
      )

      const payloadFocus = {
        natureza_operacao: naturezaOperacao,
        data_emissao: new Date().toISOString(),
        tipo_documento: 1, // Saída
        finalidade_emissao: 4, // Devolução de mercadoria
        local_destino: ehOperacaoInterna ? 1 : 2,
        consumidor_final: 0,
        presenca_comprador: '9',
        modalidade_frete: 9,
        cnpj_emitente: cnpjEmitente,
        nome_emitente: nomeEmitenteFinal,
        notas_referenciadas: [{ chave_nfe: chaveNotaReferenciada }],
        nome_destinatario: nomeDestFinal,
        indicador_inscricao_estadual_destinatario: indicadorIeDest,
        logradouro_destinatario: logrForn,
        numero_destinatario: numForn,
        bairro_destinatario: bairroForn,
        municipio_destinatario: munForn,
        uf_destinatario: ufForn,
        cep_destinatario: cepForn,
        codigo_municipio_destinatario: ibgeForn,
        items: itensFocus,
        informacoes_adicionais_contribuinte: `Devolução ref. NF-e chave ${chaveNotaReferenciada}. Motivo: ${motivoDevolucao}`,
      }

      if (cnpjCpfForn.length === 14) {
        payloadFocus.cnpj_destinatario = cnpjCpfForn
      } else {
        payloadFocus.cpf_destinatario = cnpjCpfForn
      }
      if (ieForn && ieForn.toUpperCase() !== 'ISENTO') {
        payloadFocus.inscricao_estadual_destinatario = ieForn.replace(/\D/g, '')
      }

      // Criar documento fiscal no banco
      const refFocus = `DEVCOMP_${empresaId.slice(0, 5)}_${notaEntradaId.slice(0, 8)}_${Date.now()}`
      const docFiscaisCol = $app.findCollectionByNameOrId('documentos_fiscais')
      const docRec = new Record(docFiscaisCol)
      docRec.set('empresa_id', empresaId)
      docRec.set('modelo', '55')
      docRec.set('tipo_documento', 1)
      docRec.set('finalidade', 4)
      docRec.set('ambiente', ambiente)
      docRec.set('origem', 'Devolução de compra')
      docRec.set('nota_entrada_id', notaEntradaId)
      docRec.set('documento_referenciado_chave', chaveNotaReferenciada)
      docRec.set('referencia', refFocus)
      docRec.set('status', 'Processando')
      docRec.set('serie', serieNfe)
      docRec.set('natureza_operacao', naturezaOperacao)
      docRec.set('destinatario_nome', nomeDestFinal)
      docRec.set('destinatario_cpf_cnpj', cnpjCpfForn)
      docRec.set('destinatario_uf', ufForn)
      docRec.set('valor_produtos', totValorProdutos)
      docRec.set('base_icms', totBaseIcms)
      docRec.set('valor_icms', totValorIcms)
      docRec.set('base_icms_st', totBaseIcmsSt)
      docRec.set('valor_icms_st', totValorIcmsSt)
      docRec.set('valor_ipi', totValorIpi)
      docRec.set('valor_total', totValorTotal)
      docRec.set('json_enviado', payloadFocus)
      docRec.set('usuario_emissao_id', userId)
      $app.save(docRec)

      // Gravar itens
      const docItensCol = $app.findCollectionByNameOrId('documentos_fiscais_itens')
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
        itRec.set('base_icms', itD.base_icms)
        itRec.set('aliquota_icms', itD.aliquota_icms)
        itRec.set('valor_icms', itD.valor_icms)
        itRec.set('base_icms_st', itD.base_icms_st)
        itRec.set('aliquota_icms_st', itD.aliquota_icms_st)
        itRec.set('valor_icms_st', itD.valor_icms_st)
        itRec.set('valor_ipi', itD.valor_ipi)
        if (itD.gtin) itRec.set('gtin', itD.gtin)
        if (itD.lote) itRec.set('lote', itD.lote)
        if (itD.validade) itRec.set('validade', itD.validade)
        $app.save(itRec)
      }

      // Transmitir para Focus NFe
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
        console.error('[emitir-nfe-devolucao-compra] Erro HTTP ao conectar com Focus NFe:', errHttp)
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
        $app.save(docRec)

        return c.json(200, {
          sucesso: false,
          status: 'Rejeitada',
          documento_id: docRec.id,
          ref: refFocus,
          message: msgErro,
        })
      }

      // Status Processando - Nada mexe em estoque ou financeiro se a nota não for autorizada
      docRec.set('status', 'Processando')
      docRec.set('status_sefaz', jsonResp?.status || 'processando_autorizacao')
      docRec.set(
        'mensagem_sefaz',
        jsonResp?.mensagem_sefaz || 'Nota fiscal transmitida para a SEFAZ',
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
    } catch (errGeral) {
      console.error('[emitir-nfe-devolucao-compra] Exceção capturada no handler:', errGeral)
      return c.json(400, {
        sucesso: false,
        message: errGeral.message || 'Erro inesperado ao emitir NF-e de devolução de compra.',
      })
    }
  },
  $apis.requireAuth(),
)

// =========================================================================
// 2) CONFIRMAR AUTORIZAÇÃO DE DEVOLUÇÃO DE COMPRA (ESTOQUE E FINANCEIRO)
// =========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/confirmar-autorizacao-devolucao-compra',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    function eMasterLocal(auth) {
      if (!auth) return false
      try {
        const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function empresasDoUsuarioLocal(auth) {
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

      const ehMasterUser = eMasterLocal(auth)
      if (ehMasterUser) {
        try {
          if ($app.hasTable('master_impersonacoes')) {
            const recs = $app.findRecordsByFilter(
              'master_impersonacoes',
              "user_id = '" + auth.id + "'",
              '-created',
              1,
              0,
            )
            if (recs && recs.length > 0) {
              const impId = recs[0].getString('assinante_id')
              if (impId) assinanteId = impId
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

      if (isAdmin || ehMasterUser) {
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

    function exigirEmpresaDoUsuarioLocal(auth, empresaId) {
      if (!empresaId) throw new BadRequestError('ID da empresa é obrigatório.')
      const permitidas = empresasDoUsuarioLocal(auth)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new ForbiddenError(
          'Acesso negado à empresa especificada para este usuário/assinante.',
        )
      }
      return encontrada
    }

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    const documentoId = data.documento_id
    const destinoFinanceiro = data.destino_financeiro || 'abater_titulos' // 'abater_titulos' ou 'gerar_receber'
    const notaEntradaId = data.nota_entrada_id

    if (!documentoId) {
      return c.json(400, { sucesso: false, message: 'documento_id é obrigatório.' })
    }

    let docRec = null
    try {
      docRec = $app.findRecordById('documentos_fiscais', documentoId)
    } catch (_) {
      return c.json(400, { sucesso: false, message: 'Documento fiscal não encontrado.' })
    }
    if (!docRec) {
      return c.json(400, { sucesso: false, message: 'Documento fiscal não encontrado.' })
    }
    try {
      exigirEmpresaDoUsuarioLocal(authRecord, docRec.getString('empresa_id'))
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa especificada.',
      })
    }
    if (docRec.getString('status') !== 'Autorizada') {
      return c.json(400, {
        sucesso: false,
        message:
          'Apenas notas de devolução de compra com status Autorizada podem movimentar estoque e financeiro.',
      })
    }

    const notaEntradaIdFinal = notaEntradaId || docRec.getString('nota_entrada_id')

    const docItens = $app.findRecordsByFilter(
      'documentos_fiscais_itens',
      `documento_id = '${documentoId}'`,
      'item',
    )

    try {
      $app.runInTransaction((txApp) => {
        const empresaId = docRec.getString('empresa_id')
        const docNumero = docRec.getInt('numero') || docRec.getString('referencia')

        // 1. Saída do estoque com origem DEVOLUCAO_COMPRA pelo custo da entrada
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')

        for (let it of docItens) {
          const prodId = it.getString('produto_id')
          const qtd = it.getFloat('quantidade') || 0
          const custoUn = it.getFloat('custo_unitario') || it.getFloat('valor_unitario') || 0

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

          const saldoPos = Math.max(0, saldoAnt - qtd)
          saldoRec.set('quantidade', saldoPos)
          saldoRec.set('valor_total', saldoPos * custoMedioAnt)
          saldoRec.set('updated_by', userId)
          txApp.save(saldoRec)

          const movRec = new Record(movsCol)
          movRec.set('empresa_id', empresaId)
          movRec.set('produto_id', prodId)
          movRec.set('tipo', 'Saída')
          movRec.set('origem', 'DEVOLUCAO_COMPRA')
          movRec.set('quantidade', qtd)
          movRec.set('custo_unitario', custoUn)
          movRec.set('valor_total', Math.round(qtd * custoUn * 100) / 100)
          movRec.set('saldo_anterior', saldoAnt)
          movRec.set('saldo_posterior', saldoPos)
          movRec.set('custo_medio_anterior', custoMedioAnt)
          movRec.set('custo_medio_posterior', custoMedioAnt)
          movRec.set('documento_tipo', 'NF-e Devolução')
          movRec.set('documento_id', documentoId)
          movRec.set('documento_numero', String(docNumero))
          movRec.set('motivo', `Devolução de compra NF-e nº ${docNumero}`)
          movRec.set('usuario_id', userId)
          movRec.set('estornado', false)
          movRec.set('ativo', true)
          txApp.save(movRec)
        }

        // 2. Atualizar quantidade_devolvida nos itens da nota de entrada original (apenas na autorização)
        if (notaEntradaIdFinal) {
          const itensEntrada = txApp.findRecordsByFilter(
            'notas_entrada_itens',
            `nota_id = '${notaEntradaIdFinal}' && ativo = true`,
          )
          const mapaEntradaPorProd = new Map()
          for (let itE of itensEntrada) {
            const pId = itE.getString('produto_id')
            if (pId) {
              mapaEntradaPorProd.set(pId, itE)
            }
          }

          for (let itD of docItens) {
            const pId = itD.getString('produto_id')
            const qtdDev = itD.getFloat('quantidade') || 0
            if (!pId || qtdDev <= 0) continue

            const itE = mapaEntradaPorProd.get(pId)
            if (itE) {
              const qtdAtualDev = itE.getFloat('quantidade_devolvida') || 0
              itE.set('quantidade_devolvida', qtdAtualDev + qtdDev)
              txApp.save(itE)
            }
          }
        }

        // 3. Financeiro
        const valorDevolucao = docRec.getFloat('valor_total') || 0
        if (destinoFinanceiro === 'abater_titulos' && notaEntradaIdFinal) {
          // Abater dos títulos em aberto da nota de entrada (desconto)
          const titulosAbertos = txApp.findRecordsByFilter(
            'contas_pagar',
            `empresa_id = '${empresaId}' && origem_id = '${notaEntradaIdFinal}' && status = 'Em aberto' && ativo = true`,
            'data_vencimento',
          )

          let saldoAbater = valorDevolucao
          for (let tit of titulosAbertos) {
            if (saldoAbater <= 0) break
            const saldoTit = tit.getFloat('saldo') || 0
            const vDesc = Math.min(saldoAbater, saldoTit)
            saldoAbater -= vDesc

            tit.set('saldo', saldoTit - vDesc)
            if (saldoTit - vDesc <= 0.005) {
              tit.set('status', 'Pago')
            }
            tit.set(
              'observacao',
              `${tit.getString('observacao') || ''}\nAbatimento por devolução NF-e #${docNumero}: R$ ${vDesc.toFixed(2)}`,
            )
            txApp.save(tit)
          }
        } else if (destinoFinanceiro === 'gerar_receber' || !notaEntradaIdFinal) {
          // Gerar conta a receber do fornecedor
          let fornCnpjCpf = docRec.getString('destinatario_cpf_cnpj')
          let fornNome = docRec.getString('destinatario_nome')

          let clienteId = ''
          if (fornCnpjCpf) {
            const clientes = txApp.findRecordsByFilter(
              'clientes',
              `cpf_cnpj = '${fornCnpjCpf}' && ativo = true`,
              '',
              1,
              0,
            )
            if (clientes.length > 0) {
              clienteId = clientes[0].id
            } else {
              // Criar cliente a partir do fornecedor
              const clientesCol = txApp.findCollectionByNameOrId('clientes')
              const novoCli = new Record(clientesCol)
              novoCli.set('nome_razao_social', fornNome)
              novoCli.set('cpf_cnpj', fornCnpjCpf)
              novoCli.set('tipo_pessoa', fornCnpjCpf.length === 14 ? 'PJ' : 'PF')
              novoCli.set('ativo', true)
              novoCli.set(
                'observacao',
                'Cadastrado automaticamente a partir do fornecedor na devolução de compra',
              )
              txApp.save(novoCli)
              clienteId = novoCli.id
            }
          }

          // Criar conta a receber
          const recCol = txApp.findCollectionByNameOrId('contas_receber')
          const titRec = new Record(recCol)
          titRec.set('empresa_id', empresaId)
          if (clienteId) titRec.set('cliente_id', clienteId)
          titRec.set('numero_documento', `DEV-${docNumero}`)
          titRec.set('parcela', '1/1')
          titRec.set('descricao', `Crédito Fornecedor - Devolução NF-e #${docNumero} - ${fornNome}`)
          titRec.set('data_emissao', new Date().toISOString().slice(0, 10))
          titRec.set('data_vencimento', new Date().toISOString().slice(0, 10))
          titRec.set('valor_original', valorDevolucao)
          titRec.set('saldo', valorDevolucao)
          titRec.set('status', 'Aberto')
          titRec.set('origem', 'Devolução de Compra')
          titRec.set('origem_id', documentoId)
          titRec.set('ativo', true)
          txApp.save(titRec)
        }
      })

      return c.json(200, {
        sucesso: true,
        message: 'Estoque e financeiro da devolução de compra atualizados com sucesso.',
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

// =========================================================================
// 3) NF-e DE TRANSFERÊNCIA ENTRE EMPRESAS DO GRUPO
// =========================================================================
routerAdd(
  'POST',
  '/backend/v1/fiscal/emitir-nfe-transferencia',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

    const { exigirEmpresaDoUsuario } = require(`${__hooks}/tenancy.js`)

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
    const transferenciaId = data.transferencia_id
    const modalidadeFrete = data.modalidade_frete !== undefined ? Number(data.modalidade_frete) : 9

    if (!transferenciaId) {
      return c.json(400, { sucesso: false, message: 'transferencia_id é obrigatório.' })
    }

    let transf = null
    try {
      transf = $app.findRecordById('transferencias', transferenciaId)
    } catch (_) {}

    if (!transf || !transf.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Transferência não encontrada ou inativa.' })
    }

    if (transf.getString('status') !== 'Enviada' && transf.getString('status') !== 'Recebida') {
      return c.json(400, {
        sucesso: false,
        message:
          'A emissão de NF-e só é permitida para transferências com status "Enviada" ou "Recebida".',
      })
    }

    // Já possui nota autorizada?
    if (transf.getString('nota_fiscal_chave')) {
      return c.json(200, {
        sucesso: true,
        ja_autorizada: true,
        chave: transf.getString('nota_fiscal_chave'),
        numero: transf.getString('nota_fiscal_numero'),
        message: 'Esta transferência já possui NF-e vinculada.',
      })
    }

    const empresaOrigemId = transf.getString('empresa_origem_id')
    try {
      exigirEmpresaDoUsuario(authRecord, empresaOrigemId)
    } catch (errEmp) {
      return c.json(403, {
        sucesso: false,
        message: errEmp.message || 'Acesso negado à empresa de origem.',
      })
    }
    const empresaDestinoId = transf.getString('empresa_destino_id')

    // Carregar empresas
    const empOrigem = $app.findRecordById('empresas', empresaOrigemId)
    const empDestino = $app.findRecordById('empresas', empresaDestinoId)

    if (!empOrigem || !empOrigem.getBool('ativo') || !empDestino || !empDestino.getBool('ativo')) {
      return c.json(400, { sucesso: false, message: 'Empresa de origem ou de destino inválida.' })
    }

    const configs = $app.findRecordsByFilter(
      'config_emissao_fiscal',
      `empresa_id = '${empresaOrigemId}' && ativo = true`,
      '-created',
      1,
      0,
    )
    if (!configs || configs.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'Empresa emitente não possui configuração fiscal ativa.',
      })
    }
    const cfgFiscal = configs[0]
    if (!cfgFiscal.getBool('emite_documentos_fiscais')) {
      return c.json(400, {
        sucesso: false,
        message: 'Esta empresa não emite NF-e (emite_documentos_fiscais desativado).',
      })
    }

    const { obterTokenFocus } = require(`${__hooks}/fiscal_token_lib.js`)
    const tokenInfo = obterTokenFocus(empresaOrigemId, $app)
    const ambiente = tokenInfo.ambiente
    const token = tokenInfo.token

    if (!token) {
      return c.json(400, {
        sucesso: false,
        message: `Token da Focus NFe não encontrado: cadastre na tela de credenciais fiscais ou crie o segredo ${tokenInfo.nomeSegredo} no Skip Cloud.`,
      })
    }

    const baseUrl =
      ambiente === 'Produção'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2'

    const serieNfe = cfgFiscal.getString('serie_nfe') || '1'
    const naturezaOperacao =
      cfgFiscal.getString('natureza_operacao_transferencia') || 'Transferência de mercadoria'

    const cnpjEmitente = (empOrigem.getString('cnpj') || '').replace(/\D/g, '')
    const ufEmitente = (empOrigem.getString('uf') || '').trim().toUpperCase()

    const cnpjDestino = (empDestino.getString('cnpj') || '').replace(/\D/g, '')
    const nomeDestino =
      empDestino.getString('razao_social') || empDestino.getString('nome_fantasia') || ''
    const ufDestino = (empDestino.getString('uf') || '').trim().toUpperCase()
    const ieDestino = (empDestino.getString('inscricao_estadual') || '').trim()
    const ibgeDestino = (empDestino.getString('codigo_municipio_ibge') || '').trim()
    const logrDestino = empDestino.getString('logradouro') || ''
    const numDestino = empDestino.getString('numero') || 'S/N'
    const bairroDestino = empDestino.getString('bairro') || ''
    const munDestino = empDestino.getString('municipio') || ''
    const cepDestino = (empDestino.getString('cep') || '').replace(/\D/g, '')

    const ehOperacaoInterna = ufDestino === ufEmitente

    // Se a empresa de destino não tiver inscrição estadual (ISENTO), enviar destinatário como não contribuinte (indicador_ie 9)
    const temIeValida = ieDestino && ieDestino.toUpperCase() !== 'ISENTO'
    const indicadorIeDestino = temIeValida ? '1' : '9'

    // Carregar itens da transferência
    const itensTransf = $app.findRecordsByFilter(
      'transferencias_itens',
      `transferencia_id = '${transferenciaId}' && ativo = true`,
    )
    if (!itensTransf || itensTransf.length === 0) {
      return c.json(400, {
        sucesso: false,
        message: 'A transferência não possui itens cadastrados.',
      })
    }

    let totValorProdutos = 0
    let totValorTotal = 0
    const itensFocus = []
    const itensDocFiscal = []

    for (let i = 0; i < itensTransf.length; i++) {
      const it = itensTransf[i]
      const numItem = i + 1
      const prodId = it.getString('produto_id')
      let prodRec = null
      if (prodId) {
        try {
          prodRec = $app.findRecordById('produtos', prodId)
        } catch (_) {}
      }

      const qtd = it.getFloat('quantidade') || 0
      const custoUnitario =
        it.getFloat('custo_unitario') || (prodRec ? prodRec.getFloat('preco_custo') : 0) || 1
      const valorItem = Math.round(qtd * custoUnitario * 100) / 100

      const ncm = (prodRec ? prodRec.getString('ncm') : '').replace(/\D/g, '')
      const cest = (prodRec ? prodRec.getString('cest') : '').replace(/\D/g, '')
      const origemItem = prodRec ? prodRec.getString('origem') || '0' : '0'

      // Perfil tributário do produto para regra TRANSFERENCIA
      const perfilId = prodRec ? prodRec.getString('perfil_tributario_id') : ''
      let cfopTransferencia = ''
      let cstIcms = '41' // Não tributada padrão em transferência

      if (perfilId) {
        try {
          const regras = $app.findRecordsByFilter(
            'perfis_tributarios_regras',
            `perfil_id = '${perfilId}' && cenario = 'TRANSFERENCIA' && ativo = true`,
            '',
            1,
            0,
          )
          if (regras.length > 0) {
            cfopTransferencia = regras[0].getString('cfop') || ''
            cstIcms = regras[0].getString('cst_icms') || regras[0].getString('csosn') || '41'
          }
        } catch (_) {}
      }

      // CFOP fallback: 5152/6152 para revenda, ou 5409/6409 com ST
      if (!cfopTransferencia) {
        const temSt = Boolean(cest)
        if (temSt) {
          cfopTransferencia = ehOperacaoInterna ? '5409' : '6409'
        } else {
          cfopTransferencia = ehOperacaoInterna ? '5152' : '6152'
        }
      }

      const itemFocus = {
        numero_item: numItem,
        codigo_produto: prodRec ? prodRec.getString('codigo') || prodId : String(numItem),
        descricao: prodRec ? prodRec.getString('descricao') : `Item ${numItem}`,
        cfop: cfopTransferencia,
        codigo_ncm: ncm,
        unidade_comercial: (prodRec ? prodRec.getString('unidade_medida') : 'UN') || 'UN',
        quantidade_comercial: qtd,
        valor_unitario_comercial: custoUnitario,
        unidade_tributavel: (prodRec ? prodRec.getString('unidade_medida') : 'UN') || 'UN',
        quantidade_tributavel: qtd,
        valor_unitario_tributavel: custoUnitario,
        valor_bruto: valorItem,
        icms_origem: origemItem,
        icms_situacao_tributaria: cstIcms,
      }

      if (cest) itemFocus.codigo_cest = cest

      itensFocus.push(itemFocus)

      itensDocFiscal.push({
        item: numItem,
        produto_id: prodId,
        codigo: itemFocus.codigo_produto,
        descricao: itemFocus.descricao,
        ncm: ncm,
        cest: cest,
        cfop: cfopTransferencia,
        unidade: itemFocus.unidade_comercial,
        quantidade: qtd,
        valor_unitario: custoUnitario,
        valor_bruto: valorItem,
        valor_total: valorItem,
        origem: origemItem,
        cst_icms: cstIcms,
        custo_unitario: custoUnitario,
        lote_id: it.getString('lote_id') || '',
      })

      totValorProdutos += valorItem
      totValorTotal += valorItem
    }

    totValorProdutos = Math.round(totValorProdutos * 100) / 100
    totValorTotal = Math.round(totValorTotal * 100) / 100

    const nomeDestFinal =
      ambiente === 'Homologação'
        ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : nomeDestino

    const payloadFocus = {
      natureza_operacao: naturezaOperacao,
      data_emissao: new Date().toISOString(),
      tipo_documento: 1, // Saída
      finalidade_emissao: 1, // Normal
      local_destino: ehOperacaoInterna ? 1 : 2,
      consumidor_final: temIeValida ? 0 : 1,
      presenca_comprador: '9',
      modalidade_frete: modalidadeFrete,
      cnpj_emitente: cnpjEmitente,
      nome_destinatario: nomeDestFinal,
      indicador_inscricao_estadual_destinatario: indicadorIeDestino,
      logradouro_destinatario: logrDestino,
      numero_destinatario: numDestino,
      bairro_destinatario: bairroDestino,
      municipio_destinatario: munDestino,
      uf_destinatario: ufDestino,
      cep_destinatario: cepDestino,
      codigo_municipio_destinatario: ibgeDestino,
      items: itensFocus,
      informacoes_adicionais_contribuinte: `Transferência de mercadoria TR-${transf.getInt('numero')} de ${empOrigem.getString('nome_fantasia')} para ${empDestino.getString('nome_fantasia')}.`,
    }

    if (cnpjDestino.length === 14) {
      payloadFocus.cnpj_destinatario = cnpjDestino
    } else {
      payloadFocus.cpf_destinatario = cnpjDestino
    }
    if (temIeValida) {
      payloadFocus.inscricao_estadual_destinatario = ieDestino.replace(/\D/g, '')
    }

    // Criar documento fiscal no banco
    const refFocus = `TRF_${empresaOrigemId.slice(0, 5)}_${transferenciaId.slice(0, 8)}_${Date.now()}`
    const docFiscaisCol = $app.findCollectionByNameOrId('documentos_fiscais')
    const docRec = new Record(docFiscaisCol)
    docRec.set('empresa_id', empresaOrigemId)
    docRec.set('modelo', '55')
    docRec.set('tipo_documento', 1)
    docRec.set('finalidade', 1)
    docRec.set('ambiente', ambiente)
    docRec.set('origem', 'Transferência')
    docRec.set('transferencia_id', transferenciaId)
    docRec.set('referencia', refFocus)
    docRec.set('status', 'Processando')
    docRec.set('serie', serieNfe)
    docRec.set('natureza_operacao', naturezaOperacao)
    docRec.set('destinatario_nome', nomeDestino)
    docRec.set('destinatario_cpf_cnpj', cnpjDestino)
    docRec.set('destinatario_uf', ufDestino)
    docRec.set('valor_produtos', totValorProdutos)
    docRec.set('valor_total', totValorTotal)
    docRec.set('json_enviado', payloadFocus)
    docRec.set('usuario_emissao_id', userId)
    $app.save(docRec)

    // Gravar itens do documento fiscal
    const docItensCol = $app.findCollectionByNameOrId('documentos_fiscais_itens')
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
      $app.save(itRec)
    }

    // Transmitir para a Focus NFe
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
      $app.save(docRec)

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
      jsonResp?.mensagem_sefaz || 'Nota fiscal de transferência transmitida para a SEFAZ',
    )
    $app.save(docRec)

    return c.json(200, {
      sucesso: true,
      status: 'Processando',
      documento_id: docRec.id,
      referencia: refFocus,
      message: 'NF-e de transferência transmitida com sucesso para a SEFAZ.',
    })
  },
  $apis.requireAuth(),
)
