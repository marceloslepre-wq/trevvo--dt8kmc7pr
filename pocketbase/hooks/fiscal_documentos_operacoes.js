// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Hook backend: Montagem e Rascunho de Documento Fiscal (NF-e modelo 55 / NFC-e modelo 65)
 * POST /backend/v1/fiscal/montar-rascunho
 *
 * Não chama a Focus NFe.
 * Monta o documento completo com cálculos por item (ICMS, FCP, ST por MVA, IPI, PIS, COFINS, DIFAL, IBS/CBS),
 * rateio de frete/seguro/outras despesas/desconto com acerto de centavos no último item,
 * validações completas pré-emissão (pendências e avisos),
 * formatação do JSON oficial Focus NFe (campos planos),
 * e grava/atualiza em documentos_fiscais no status "Rascunho".
 */

routerAdd('POST', '/backend/v1/fiscal/montar-rascunho', (c) => {
  try {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, {
        sucesso: false,
        message: 'Acesso negado: autenticação obrigatória.',
      })
    }

    // -------------------------------------------------------------
    // Funções locais de tenancy e governança multi-tenant (evita require)
    // -------------------------------------------------------------
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
        throw new Error('ID da empresa é obrigatório.')
      }
      const permitidas = empresasDoUsuario(auth)
      const encontrada = permitidas.find((e) => e.id === empresaId)
      if (!encontrada) {
        throw new Error('Acesso negado à empresa especificada para este usuário/assinante.')
      }
      return encontrada
    }

    // -------------------------------------------------------------
    // Recálculo fiscal do retrato em vendas_itens (função local, sem require):
    // enquanto a venda NÃO tem documento fiscal 'Autorizada', a tributação de
    // cada item é recalculada a partir do perfil tributário do produto e do
    // destinatário ATUAL da venda (UF cliente x UF emitente, contribuinte ou
    // não de ICMS). CFOP/CST/PIS/COFINS vêm da regra do cenário do perfil e a
    // alíquota interestadual da matriz icms_interestadual. Se a venda já tem
    // nota autorizada, NÃO mexe em nada (mantém o retrato gravado).
    // -------------------------------------------------------------
    function recalcularTributacaoVendaInterno(txApp, vendaRec, auth) {
      if (vendaRec.getString('documento_fiscal_status') === 'Autorizada') {
        return false
      }

      const empresaIdRecalc = vendaRec.getString('empresa_id')
      if (!empresaIdRecalc) return false
      exigirEmpresaDoUsuario(auth, empresaIdRecalc)

      const empresaRecalc = txApp.findRecordById('empresas', empresaIdRecalc)
      if (!empresaRecalc || !empresaRecalc.getBool('ativo')) return false

      const ufEmitenteRecalc = (empresaRecalc.getString('uf') || '').trim().toUpperCase()
      const regimeApuracaoRecalc = (empresaRecalc.getString('regime_apuracao') || '').trim()
      const crtRawRecalc = empresaRecalc.get('crt')
      const crtRecalc =
        crtRawRecalc !== null && crtRawRecalc !== undefined && crtRawRecalc !== ''
          ? Number(crtRawRecalc)
          : null
      const ehSimplesRecalc = regimeApuracaoRecalc
        ? regimeApuracaoRecalc === 'Simples Nacional'
        : crtRecalc === 1 || crtRecalc === 2 || crtRecalc === 4

      // Destinatário ATUAL da venda (endereço/UF podem ter mudado após salvar o pedido)
      const clienteIdRecalc = vendaRec.getString('cliente_id')
      let clienteRecalc = null
      if (clienteIdRecalc) {
        try {
          clienteRecalc = txApp.findRecordById('clientes', clienteIdRecalc)
        } catch (_) {}
      }

      let destinatarioUfRecalc = ufEmitenteRecalc
      let indicadorIeRecalc = '9'
      if (clienteRecalc) {
        destinatarioUfRecalc =
          (clienteRecalc.getString('uf') || '').trim().toUpperCase() || ufEmitenteRecalc
        indicadorIeRecalc = String(clienteRecalc.getInt('indicador_ie') || 9)
      }

      const ehOperacaoInternaRecalc = destinatarioUfRecalc === ufEmitenteRecalc
      let cenarioRecalc = 'VENDA_INTERNA_CONSUMIDOR'
      if (ehOperacaoInternaRecalc) {
        cenarioRecalc =
          indicadorIeRecalc === '1' ? 'VENDA_INTERNA_CONTRIBUINTE' : 'VENDA_INTERNA_CONSUMIDOR'
      } else {
        cenarioRecalc =
          indicadorIeRecalc === '1'
            ? 'VENDA_INTERESTADUAL_CONTRIBUINTE'
            : 'VENDA_INTERESTADUAL_CONSUMIDOR'
      }

      let itensVenda = []
      try {
        itensVenda = txApp.findRecordsByFilter(
          'vendas_itens',
          `venda_id = '${vendaRec.id}' && ativo = true`,
          'item,created',
        )
      } catch (_) {
        itensVenda = []
      }
      if (!itensVenda || itensVenda.length === 0) return false

      for (let i = 0; i < itensVenda.length; i++) {
        const itRecalc = itensVenda[i]
        const numItemRecalc = i + 1

        const prodIdRecalc = itRecalc.getString('produto_id')
        let prodRecalc = null
        if (prodIdRecalc) {
          try {
            prodRecalc = txApp.findRecordById('produtos', prodIdRecalc)
          } catch (_) {}
        }

        const descricaoRecalc =
          itRecalc.getString('descricao') ||
          (prodRecalc ? prodRecalc.getString('descricao') : `Item ${numItemRecalc}`)

        const perfilIdRecalc =
          itRecalc.getString('perfil_tributario_id') ||
          (prodRecalc ? prodRecalc.getString('perfil_tributario_id') : '')
        if (!perfilIdRecalc) {
          throw new Error(
            `Item ${numItemRecalc} (${descricaoRecalc}): Produto sem Perfil Tributário vinculado.`,
          )
        }

        let regraRecalc = null
        try {
          const regrasRecalc = txApp.findRecordsByFilter(
            'perfis_tributarios_regras',
            `perfil_id = '${perfilIdRecalc}' && cenario = '${cenarioRecalc}' && ativo = true`,
            '',
            1,
            0,
          )
          if (regrasRecalc.length > 0) regraRecalc = regrasRecalc[0]
        } catch (_) {}
        if (!regraRecalc) {
          throw new Error(
            `Item ${numItemRecalc} (${descricaoRecalc}): Perfil Tributário não possui regra para o cenário "${cenarioRecalc}".`,
          )
        }

        // Cenário recalculado: CFOP/CST/PIS/COFINS vêm da regra do perfil,
        // IGNORANDO o retrato gravado em vendas_itens.
        // O campo cfop da regra é RELAÇÃO para a coleção cfop: resolve o código.
        let cfopRecalc = regraRecalc.getString('cfop') || ''
        if (cfopRecalc && cfopRecalc.length > 10) {
          try {
            const cfopRelRec = txApp.findRecordById('cfop', cfopRecalc)
            if (cfopRelRec) {
              cfopRecalc = cfopRelRec.getString('codigo') || cfopRecalc
            }
          } catch (_) {}
        }
        let cstIcmsRecalc = regraRecalc.getString('cst_icms') || ''
        let csosnRecalc = regraRecalc.getString('csosn') || ''
        let cstPisRecalc = regraRecalc.getString('cst_pis') || ''
        let cstCofinsRecalc = regraRecalc.getString('cst_cofins') || ''

        if (!cfopRecalc) {
          cfopRecalc = ehOperacaoInternaRecalc
            ? '5102'
            : indicadorIeRecalc === '9'
              ? '6108'
              : '6102'
        }
        if (ehSimplesRecalc) {
          if (!csosnRecalc && cstIcmsRecalc) {
            csosnRecalc = converterCstParaCsosn(cstIcmsRecalc)
          }
          if (!csosnRecalc) csosnRecalc = '102'
        } else {
          if (!cstIcmsRecalc && csosnRecalc) {
            cstIcmsRecalc = converterCsosnParaCst(csosnRecalc)
          }
          if (!cstIcmsRecalc) cstIcmsRecalc = '00'
        }

        // Alíquota interestadual na matriz (origem emitente x destino atual),
        // mesma lógica do N1 em fiscal_nfe_operacoes.js
        let aliqIcmsRecalc = regraRecalc.getFloat('aliquota_icms') || 0
        const origemMercRecalc =
          itRecalc.getString('origem') ||
          (regraRecalc ? regraRecalc.getString('origem') : '0') ||
          '0'
        if (!ehOperacaoInternaRecalc && ['00', '10', '20', '70', '90'].includes(cstIcmsRecalc)) {
          let aliqMatrizRecalc = null
          const origMercStrRecalc = String(origemMercRecalc || '0').trim()
          if (['1', '2', '3', '8'].includes(origMercStrRecalc)) {
            aliqMatrizRecalc = 4
          } else if (ufEmitenteRecalc && destinatarioUfRecalc) {
            try {
              const matsRecalc = txApp.findRecordsByFilter(
                'icms_interestadual',
                `uf_origem = '${ufEmitenteRecalc}' && uf_destino = '${destinatarioUfRecalc}' && ativo = true`,
                '',
                1,
                0,
              )
              if (
                matsRecalc.length > 0 &&
                matsRecalc[0].get('aliquota') !== null &&
                matsRecalc[0].get('aliquota') !== undefined &&
                matsRecalc[0].get('aliquota') !== ''
              ) {
                aliqMatrizRecalc = matsRecalc[0].getFloat('aliquota')
              }
            } catch (_) {}
          }
          if (aliqMatrizRecalc !== null && aliqMatrizRecalc !== undefined) {
            aliqIcmsRecalc = aliqMatrizRecalc
          }
        }

        // Grava o retrato recalculado em vendas_itens pelo BACKEND
        itRecalc.set('cfop', cfopRecalc)
        itRecalc.set('cst_icms', cstIcmsRecalc)
        itRecalc.set('csosn', csosnRecalc)
        itRecalc.set('aliquota_icms', aliqIcmsRecalc)
        itRecalc.set('cst_pis', cstPisRecalc)
        itRecalc.set('cst_cofins', cstCofinsRecalc)
        txApp.save(itRecalc)
      }

      return true
    }

    const userId = authRecord.id
    const data = c.requestInfo().body || {}
    const origem = data.origem || 'Venda' // 'Venda' | 'Devolução de venda' | 'Devolução de compra'
    const idOrigem = data.id || data.venda_id
    const modelo = String(data.modelo || '55') // '55' ou '65'

    if (!idOrigem) {
      return c.json(400, {
        sucesso: false,
        message: 'O parâmetro id (ou venda_id) é obrigatório.',
      })
    }

    // Funções auxiliares inline para garantir escopo dentro do callback JSVM
    const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100

    function truncar60(texto) {
      if (!texto) return ''
      return String(texto).trim().slice(0, 60).trim()
    }

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

    let resultado = null

    $app.runInTransaction((txApp) => {
      const pendencias = []
      const avisos = []

      // 1. Carregar registro de origem (nesta etapa: Venda)
      let venda = null
      let transferencia = null
      let empresaId = ''
      let clienteId = ''
      let itensOrigem = []
      let pagamentosOrigem = []

      // 1.a Recalculo fiscal do retrato em vendas_itens quando o destinatário mudou
      // depois da venda ser salva (enquanto NÃO existe documento com status
      // 'Autorizada' vinculado à venda). Se já há nota autorizada, NÃO mexe em nada.
      if (origem === 'Venda' || origem === 'Devolução de venda') {
        try {
          const vendaPreCheck = txApp.findRecordById('vendas', idOrigem)
          if (
            vendaPreCheck &&
            vendaPreCheck.getBool('ativo') &&
            vendaPreCheck.getString('documento_fiscal_status') !== 'Autorizada'
          ) {
            recalcularTributacaoVendaInterno(txApp, vendaPreCheck, authRecord)
          }
        } catch (errRecalc) {
          // Recálculo não bloqueia o montar-rascunho; o montar-rascunho segue
          // com o retrato que estiver gravado em vendas_itens
          console.log(
            '[fiscal/montar-rascunho] Recálculo fiscal do retrato falhou (segue com retrato gravado): ' +
              (errRecalc && errRecalc.message ? errRecalc.message : String(errRecalc)),
          )
        }
      }

      if (origem === 'Transferência' || origem === 'Transferencia') {
        try {
          transferencia = txApp.findRecordById('transferencias', idOrigem)
        } catch (_) {
          throw new Error(`Transferência com id '${idOrigem}' não encontrada.`)
        }

        if (!transferencia || !transferencia.getBool('ativo')) {
          throw new Error('Transferência não encontrada ou inativa.')
        }

        empresaId = transferencia.getString('empresa_origem_id')
        const empresaDestinoId = transferencia.getString('empresa_destino_id')

        const itensTrf = txApp.findRecordsByFilter(
          'transferencias_itens',
          `transferencia_id = '${idOrigem}' && ativo = true`,
          'created',
        )
        if (!itensTrf || itensTrf.length === 0) {
          throw new Error('A transferência não possui itens cadastrados.')
        }

        itensOrigem = itensTrf.map((it) => {
          const qtd = it.getFloat('quantidade') || 0
          const custoUnit = it.getFloat('custo_unitario') || 0
          return {
            getString: (f) => {
              if (f === 'produto_id') return it.getString('produto_id')
              if (f === 'lote_id') return it.getString('lote_id')
              return ''
            },
            getFloat: (f) => {
              if (f === 'quantidade') return qtd
              if (f === 'preco_unitario') return custoUnit
              if (f === 'desconto_valor') return 0
              return 0
            },
          }
        })
      } else if (origem === 'Venda' || origem === 'Devolução de venda') {
        try {
          venda = txApp.findRecordById('vendas', idOrigem)
        } catch (_) {
          throw new Error(`Venda/Devolução com id '${idOrigem}' não encontrada.`)
        }

        if (!venda || !venda.getBool('ativo')) {
          throw new Error('Venda/Devolução não encontrada ou inativa.')
        }

        empresaId = venda.getString('empresa_id')
        clienteId = venda.getString('cliente_id')

        itensOrigem = txApp.findRecordsByFilter(
          'vendas_itens',
          `venda_id = '${idOrigem}' && ativo = true`,
          'item,created',
        )
        if (!itensOrigem || itensOrigem.length === 0) {
          throw new Error('O registro não possui itens cadastrados.')
        }

        try {
          pagamentosOrigem = txApp.findRecordsByFilter(
            'vendas_pagamentos',
            `venda_id = '${idOrigem}' && ativo = true`,
            'parcela,created',
          )
        } catch (_) {
          pagamentosOrigem = []
        }
      } else {
        throw new Error(`Origem '${origem}' ainda não habilitada para faturamento nesta etapa.`)
      }

      // 2. Carregar Empresa Emitente (SEMPRE empresa_id do documento)
      if (!empresaId) {
        throw new Error('O documento não possui empresa_id vinculado.')
      }
      exigirEmpresaDoUsuario(authRecord, empresaId)
      const empresaRec = txApp.findRecordById('empresas', empresaId)
      if (!empresaRec || !empresaRec.getBool('ativo')) {
        throw new Error('Empresa emitente não encontrada ou inativa.')
      }

      const cnpjEmitenteLimpo = (empresaRec.getString('cnpj') || '').replace(/\D/g, '')
      const ieEmitente = (empresaRec.getString('inscricao_estadual') || '').trim()
      const ufEmitente = (empresaRec.getString('uf') || '').trim().toUpperCase()
      const crtEmitenteRaw = empresaRec.get('crt')
      const nomeDocEmitente = (empresaRec.getString('nome_documentos_fiscais') || '').trim()
      const razaoSocialEmitente = (empresaRec.getString('razao_social') || '').trim()
      const fantasiaEmitente = (empresaRec.getString('nome_fantasia') || '').trim()
      const nomeEmitenteFinal = truncar60(nomeDocEmitente || razaoSocialEmitente)
      const nomeFantasiaEmitenteFinal = truncar60(fantasiaEmitente)
      const crtEmitente =
        crtEmitenteRaw !== null && crtEmitenteRaw !== undefined && crtEmitenteRaw !== ''
          ? Number(crtEmitenteRaw)
          : null // 1 Simples, 2 Sublimite, 3 Normal, 4 MEI (sem presumir Simples)
      const aliqCreditoSimples = empresaRec.getFloat('aliquota_credito_simples') || 0

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
      const ibgeEmitente = (empresaRec.getString('codigo_municipio_ibge') || '').trim()
      if (!ibgeEmitente || ibgeEmitente.length !== 7) {
        pendencias.push('Empresa emitente sem Código de Município IBGE (7 dígitos).')
      }

      // 3. Carregar Configuração de Emissão Fiscal da Empresa
      let cfgFiscal = null
      try {
        const cfgs = txApp.findRecordsByFilter(
          'config_emissao_fiscal',
          `empresa_id = '${empresaId}' && ativo = true`,
          '',
          1,
          0,
        )
        if (cfgs.length > 0) cfgFiscal = cfgs[0]
      } catch (_) {}

      const ambiente = cfgFiscal ? cfgFiscal.getString('ambiente') || 'Homologação' : 'Homologação'
      const seriePadrao =
        modelo === '65'
          ? cfgFiscal
            ? cfgFiscal.getString('serie_nfce') || '1'
            : '1'
          : cfgFiscal
            ? cfgFiscal.getString('serie_nfe') || '1'
            : '1'
      const presencaPadrao = cfgFiscal
        ? cfgFiscal.getString('presenca_comprador_padrao_nfe') || '1 Presencial'
        : '1 Presencial'
      const naturezaPadrao =
        origem === 'Transferência' || origem === 'Transferencia'
          ? cfgFiscal
            ? cfgFiscal.getString('natureza_operacao_transferencia') ||
              'Transferência de mercadoria'
            : 'Transferência de mercadoria'
          : cfgFiscal
            ? cfgFiscal.getString('natureza_operacao_venda') || 'Venda de mercadoria'
            : 'Venda de mercadoria'
      const infoComplPadrao = cfgFiscal
        ? cfgFiscal.getString('informacoes_complementares_padrao') || ''
        : ''
      const informarIbsCbs = cfgFiscal ? cfgFiscal.getBool('informar_ibs_cbs') : false
      const calcularDifalConfig = cfgFiscal
        ? cfgFiscal.getBool('calcular_difal_consumidor_final')
        : false

      // 4. Carregar Destinatário (Cliente)
      let clienteRec = null
      if (clienteId) {
        try {
          clienteRec = txApp.findRecordById('clientes', clienteId)
        } catch (_) {}
      }

      const cpfCnpjConsumidor = venda ? venda.getString('cpf_cnpj_consumidor') || '' : ''
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
      let indicadorIe = '9' // 1 Contribuinte, 2 Isento, 9 Não Contribuinte
      let destinatarioConsumidorFinal = true
      let destinatarioIdEstrangeiro = ''

      if (transferencia) {
        const empDestId = transferencia.getString('empresa_destino_id')
        let empDest = null
        try {
          empDest = txApp.findRecordById('empresas', empDestId)
        } catch (_) {}

        if (empDest) {
          destinatarioNome =
            empDest.getString('razao_social') || empDest.getString('nome_fantasia') || ''
          destinatarioCpfCnpj = (empDest.getString('cnpj') || '').replace(/\D/g, '')
          destinatarioUf = (empDest.getString('uf') || '').trim().toUpperCase() || ufEmitente
          destinatarioIbge = (empDest.getString('codigo_municipio_ibge') || '').trim()
          destinatarioLogradouro = empDest.getString('logradouro') || ''
          destinatarioNumero = empDest.getString('numero') || 'S/N'
          destinatarioBairro = empDest.getString('bairro') || ''
          destinatarioCep = (empDest.getString('cep') || '').replace(/\D/g, '')
          destinatarioComplemento = empDest.getString('complemento') || ''
          destinatarioMunicipio = empDest.getString('municipio') || ''
          destinatarioIe = (empDest.getString('inscricao_estadual') || '').trim()
          const temIe = Boolean(destinatarioIe && destinatarioIe.toUpperCase() !== 'ISENTO')
          indicadorIe = temIe ? '1' : '9'
          destinatarioConsumidorFinal = !temIe
        }
      } else if (clienteRec) {
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

      // Validações do destinatário
      if (modelo === '55') {
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
        if (indicadorIe === '1' && (!destinatarioIe || destinatarioIe.toUpperCase() === 'ISENTO')) {
          pendencias.push(
            'Cliente cadastrado como Contribuinte de ICMS (indicador 1), mas está sem Inscrição Estadual.',
          )
        }
      }

      // Identificação do cenário de tributação
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

      // DIFAL aplicabilidade
      const ehVendaInterestadualConsumidorNaoContribuinte =
        !ehOperacaoInterna && indicadorIe === '9' && localDestino === 2

      if (ehVendaInterestadualConsumidorNaoContribuinte && !calcularDifalConfig) {
        avisos.push(
          'Venda interestadual a consumidor: DIFAL não calculado (opção desligada na configuração fiscal).',
        )
      }

      // 5. Rateio de frete, seguro, outras despesas e desconto geral nos itens
      const totalFrete = venda ? venda.getFloat('valor_frete') || 0 : 0
      const totalAcrescimo = venda ? venda.getFloat('valor_acrescimo') || 0 : 0
      const totalDescontoGlobal = venda ? venda.getFloat('valor_desconto_total') || 0 : 0
      const totalSeguro = 0

      // Soma BRUTA: usada apenas para o rateio proporcional de frete/seguro/outras/desconto global
      let somaBrutoItens = 0
      // Soma LÍQUIDA: bruto - desconto de item + acréscimo de item, comparada com o valor_total da venda
      let somaLiquidaItens = 0
      for (let i = 0; i < itensOrigem.length; i++) {
        const it = itensOrigem[i]
        const qtd = it.getFloat('quantidade') || 0
        const preco = it.getFloat('preco_unitario') || 0
        const valorBrutoItem = round2(qtd * preco)
        somaBrutoItens += valorBrutoItem
        somaLiquidaItens += round2(
          valorBrutoItem -
            (it.getFloat('desconto_valor') || 0) +
            (it.getFloat('acrescimo_valor') || 0),
        )
      }
      somaLiquidaItens = round2(somaLiquidaItens)

      // Validação: soma LÍQUIDA dos itens (desconto/acréscimo de item já considerados) +
      // frete + acréscimo global - desconto global, comparada com o valor_total da venda
      if (venda) {
        const totalVendaEsperado = venda.getFloat('valor_total') || 0
        const diferencaTotal = Math.abs(
          somaLiquidaItens - totalDescontoGlobal + totalFrete + totalAcrescimo - totalVendaEsperado,
        )
        if (diferencaTotal > 0.01) {
          avisos.push(
            `Diferença de R$ ${diferencaTotal.toFixed(2)} entre a soma dos itens e o valor total registrado na venda.`,
          )
        }
      }

      // 6. Processar itens fiscais com cálculo de cada tributo
      const itensCalculados = []
      const itensFocus = []

      let acumFreteRateado = 0
      let acumOutrasRateado = 0
      let acumDescontoRateado = 0

      let totValorProdutos = 0
      let totValorDesconto = 0
      let totValorFrete = 0
      let totValorSeguro = 0
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
          (prodRec ? prodRec.getString('descricao') : `Item ${numItem}`)
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

        // Rateio proporcional com acerto no último item
        const proporcao = somaBrutoItens > 0 ? valorBruto / somaBrutoItens : 1 / itensOrigem.length
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

        // Dados fiscais do perfil/produto
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
            `Item ${numItem} (${descricao}): NCM "${ncm}" inválido (deve ter exatamente 8 dígitos numéricos).`,
          )
        }

        const ehTransferenciaOrigem = origem === 'Transferência' || origem === 'Transferencia'
        const cenarioParaRegra = ehTransferenciaOrigem ? 'TRANSFERENCIA' : cenarioRegra

        const perfilId =
          itRec.getString('perfil_tributario_id') ||
          (prodRec ? prodRec.getString('perfil_tributario_id') : '')
        let regraRec = null

        if (perfilId) {
          try {
            const regras = txApp.findRecordsByFilter(
              'perfis_tributarios_regras',
              `perfil_id = '${perfilId}' && cenario = '${cenarioParaRegra}' && ativo = true`,
              '',
              1,
              0,
            )
            if (regras.length > 0) {
              regraRec = regras[0]
            }
          } catch (_) {}
        }

        if (!perfilId) {
          if (!ehTransferenciaOrigem) {
            pendencias.push(
              `Item ${numItem} (${descricao}): Produto sem Perfil Tributário vinculado.`,
            )
          }
        } else if (!regraRec && !ehTransferenciaOrigem) {
          pendencias.push(
            `Item ${numItem} (${descricao}): Perfil Tributário não possui regra para o cenário "${cenarioRegra}".`,
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
                  `uf_origem = '${ufEmitente}' && uf_destino = '${destinatarioUf}' && ativo = true`,
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
                `Item ${numItem} (${descricao}): alíquota interestadual não encontrada na matriz`,
              )
            }
          }
        }

        let aliqFcp = regraRec ? regraRec.getFloat('aliquota_fcp') || 0 : 0

        // ST
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

        // IPI
        const cstIpi = regraRec ? regraRec.getString('cst_ipi') : ''
        const codEnqIpi = regraRec ? regraRec.getString('codigo_enquadramento_ipi') || '999' : '999'
        const aliqIpi = regraRec ? regraRec.getFloat('aliquota_ipi') || 0 : 0

        // PIS/COFINS
        const cstPis =
          itRec.getString('cst_pis') || (regraRec ? regraRec.getString('cst_pis') : '07') || '07'
        const aliqPis = regraRec ? regraRec.getFloat('aliquota_pis') || 0 : 0
        const cstCofins =
          itRec.getString('cst_cofins') ||
          (regraRec ? regraRec.getString('cst_cofins') : '07') ||
          '07'
        const aliqCofins = regraRec ? regraRec.getFloat('aliquota_cofins') || 0 : 0

        // Reforma
        const cstIbsCbs = regraRec ? regraRec.getString('cst_ibs_cbs') || '01' : '01'
        const cClassTrib = regraRec ? regraRec.getString('c_class_trib') || '' : ''
        const aliqIbsUf = regraRec ? regraRec.getFloat('aliquota_ibs_uf') || 0 : 0
        const aliqIbsMun = regraRec ? regraRec.getFloat('aliquota_ibs_municipio') || 0 : 0
        const aliqCbs = regraRec ? regraRec.getFloat('aliquota_cbs') || 0 : 0
        const cBenef = regraRec ? regraRec.getString('c_benef') || '' : ''

        // CFOP padrão
        if (!cfop) {
          if (ehTransferenciaOrigem) {
            const temStTrf = Boolean(cest)
            if (temStTrf) {
              cfop = ehOperacaoInterna ? '5409' : '6409'
            } else {
              cfop = ehOperacaoInterna ? '5152' : '6152'
            }
          } else {
            if (ehOperacaoInterna) {
              cfop = '5102'
            } else {
              cfop = indicadorIe === '9' ? '6108' : '6102'
            }
          }
        }

        const primeiroDigitoCfop = cfop.charAt(0)
        if (ehOperacaoInterna && primeiroDigitoCfop !== '5' && primeiroDigitoCfop !== '1') {
          pendencias.push(
            `Item ${numItem}: CFOP ${cfop} incoerente com operação interna (mesma UF ${ufEmitente}). Deveria iniciar com 5.`,
          )
        }
        if (!ehOperacaoInterna && primeiroDigitoCfop !== '6' && primeiroDigitoCfop !== '2') {
          pendencias.push(
            `Item ${numItem}: CFOP ${cfop} incoerente com operação interestadual (${ufEmitente} -> ${destinatarioUf}). Deveria iniciar com 6.`,
          )
        }
        if (
          !ehTransferenciaOrigem &&
          !ehOperacaoInterna &&
          indicadorIe === '9' &&
          cfop !== '6107' &&
          cfop !== '6108'
        ) {
          avisos.push(
            `Item ${numItem}: CFOP ${cfop} em venda interestadual a não contribuinte (recomenda-se 6107 ou 6108).`,
          )
        }

        if (!cfopPrimeiroItem) cfopPrimeiroItem = cfop

        // CRT
        const regimeApuracaoEmitente = (empresaRec.getString('regime_apuracao') || '').trim()
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

        // Base e ICMS próprio
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

        // Crédito Simples CSOSN 101
        let aliquotaCreditoSimplesItem = 0
        let valorCreditoSimplesItem = 0
        if (ehSimples && csosn === '101' && aliqCreditoSimples > 0) {
          aliquotaCreditoSimplesItem = aliqCreditoSimples
          valorCreditoSimplesItem = round2(valorBaseInicial * (aliqCreditoSimples / 100))
        }

        // IPI
        let baseIpi = 0
        let valorIpi = 0
        if (aliqIpi > 0 && !ehSimples) {
          baseIpi = valorBruto
          valorIpi = round2(baseIpi * (aliqIpi / 100))
        }

        // ST por MVA
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

        // PIS/COFINS
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

        // DIFAL (EC 87/15): venda interestadual a consumidor final NÃO contribuinte.
        // Fórmula: DIFAL = base x (alíquota interna do destino - alíquota interestadual),
        // com FCP à parte. SEM a alíquota interna do destino em icms_aliquotas_uf,
        // o DIFAL NÃO é calculado (fica 0) — apenas a pendência é registrada.
        let baseIcmsUfDest = 0
        let aliqInternaUfDest = 0
        let aliqInterestadual = 0
        let percentualPartilha = 100
        let aliqFcpUfDest = 0
        let valorFcpUfDest = 0
        let valorIcmsUfDest = 0
        let valorIcmsUfRemet = 0

        if (ehVendaInterestadualConsumidorNaoContribuinte && calcularDifalConfig) {
          let matIcmsDestino = null
          try {
            const mats = txApp.findRecordsByFilter(
              'icms_aliquotas_uf',
              `uf = '${destinatarioUf}' && ativo = true`,
              '',
              1,
              0,
            )
            if (mats.length > 0) matIcmsDestino = mats[0]
          } catch (_) {}

          if (!matIcmsDestino) {
            pendencias.push(
              `Não foi encontrada a alíquota de ICMS interna na tabela icms_aliquotas_uf para o destino ${destinatarioUf}.`,
            )
            // Sem alíquota interna do destino: NÃO calcula DIFAL nenhum (fica 0)
            // nem FCP. Só a pendência permanece — sem valor inventado por fallback.
          } else {
            aliqInternaUfDest = matIcmsDestino.getFloat('aliquota_interna') || 0
            aliqFcpUfDest = matIcmsDestino.getFloat('aliquota_fcp') || 0

            // Regra DIFAL: usa a mesma alíquota interestadual do item calculada/vigente
            if (aliqIcms > 0 && ['00', '10', '20', '70', '90'].includes(cstIcms)) {
              aliqInterestadual = aliqIcms
            } else {
              aliqInterestadual = calcularAliquotaInterestadualBackend(
                ufEmitente,
                destinatarioUf,
                origemMercadoria,
              )
              try {
                const matsInter = txApp.findRecordsByFilter(
                  'icms_interestadual',
                  `uf_origem = '${ufEmitente}' && uf_destino = '${destinatarioUf}' && ativo = true`,
                  '',
                  1,
                  0,
                )
                if (matsInter.length > 0) {
                  aliqInterestadual = matsInter[0].getFloat('aliquota') || aliqInterestadual
                }
              } catch (_) {}
            }

            baseIcmsUfDest = valorBaseInicial
            const difAliquota = Math.max(0, aliqInternaUfDest - aliqInterestadual)
            const valorTotalDifal = round2(baseIcmsUfDest * (difAliquota / 100))
            valorIcmsUfDest = round2(valorTotalDifal * (percentualPartilha / 100))
            valorIcmsUfRemet = 0

            if (aliqFcpUfDest > 0) {
              valorFcpUfDest = round2(baseIcmsUfDest * (aliqFcpUfDest / 100))
            }
          }
        }

        // Reforma Tributária: IBS e CBS
        let baseIbsCbs = 0
        let valorIbs = 0
        let valorCbs = 0
        if (informarIbsCbs) {
          baseIbsCbs = valorBaseInicial
          const aliqIbsTotal = (aliqIbsUf + aliqIbsMun) / 100
          valorIbs = round2(baseIbsCbs * aliqIbsTotal)
          valorCbs = round2(baseIbsCbs * (aliqCbs / 100))
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

        const itemCalculadoObj = {
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
          valor_fcp_st: 0,
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
        }
        itensCalculados.push(itemCalculadoObj)

        // Objeto formato FOCUS NFE plano
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
          if (reducaoBcIcms > 0) itemFocus.icms_percentual_reducao_base_calculo = reducaoBcIcms
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

        itensFocus.push(itemFocus)
      }

      // 7. Formas de pagamento para Focus
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

          // Cartão com bandeira_operadora e numero_autorizacao se preenchidos
          const bandeira = (pg.getString('bandeira') || '').trim()
          const nsu = (pg.getString('nsu') || '').trim()
          const codAut = (pg.getString('codigo_autorizacao') || '').trim()
          if (bandeira) {
            itemPgFocus.bandeira_operadora = bandeira
          }
          if (codAut || nsu) {
            itemPgFocus.numero_autorizacao = codAut || nsu
          }

          formasPagamentoFocus.push(itemPgFocus)
        }
      } else {
        formasPagamentoFocus.push({
          forma_pagamento: '01',
          valor_pagamento: round2(totValorTotal),
        })
      }

      // 8. Montar JSON Focus NFe Completo
      const dataHojeIso = new Date().toISOString()
      const nomeDestinatarioFinal = truncar60(
        ambiente === 'Homologação'
          ? modelo === '65'
            ? 'NF-C-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
            : 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : destinatarioNome,
      )

      // Parâmetros recebidos no body para customização na janela de conferência da NF-e
      const presencaInput =
        data.presenca_comprador !== undefined
          ? String(data.presenca_comprador).charAt(0)
          : undefined
      const naturezaOperacaoInput = (data.natureza_operacao || '').trim() || naturezaPadrao
      const modalidadeFreteInput =
        data.modalidade_frete !== undefined
          ? Number(data.modalidade_frete)
          : modelo === '65'
            ? 9
            : 9
      const infoComplInput =
        data.informacoes_complementares !== undefined
          ? String(data.informacoes_complementares)
          : infoComplPadrao || ''

      const presencaCompradorFinal =
        modelo === '65' ? '1' : presencaInput || presencaPadrao.charAt(0)
      const modalidadeFreteFinal = modelo === '65' ? 9 : modalidadeFreteInput
      const localDestinoFinal = modelo === '65' ? 1 : localDestino
      const consumidorFinalFlag =
        modelo === '65' ? 1 : indicadorIe === '9' || destinatarioConsumidorFinal ? 1 : 0

      const ehDevolucaoVenda =
        origem === 'Devolução de venda' || (venda && venda.getString('tipo') === 'Devolução')
      const tipoDocumentoCalculado = ehDevolucaoVenda ? 0 : 1 // 0 Entrada para devolução de venda, 1 Saída
      const finalidadeEmissaoCalculada = ehDevolucaoVenda ? 4 : 1 // 4 Devolução

      const jsonFocus = {
        natureza_operacao: ehDevolucaoVenda
          ? cfgFiscal
            ? cfgFiscal.getString('natureza_operacao_devolucao_venda') || 'Devolução de venda'
            : 'Devolução de venda'
          : naturezaOperacaoInput,
        data_emissao: dataHojeIso,
        tipo_documento: tipoDocumentoCalculado,
        finalidade_emissao: finalidadeEmissaoCalculada,
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

      // Intermediador (indIntermed e infIntermed) quando presenca_comprador for 2, 3 ou 9
      const presencaExigeIntermediador = ['2', '3', '9'].includes(presencaCompradorFinal)
      let intermediadorIdGravado = ''
      let identificadorIntermediadorGravado = ''

      if (presencaExigeIntermediador) {
        const tipoIntermediadorInput = data.tipo_intermediador || 'proprio' // 'proprio' ou 'terceiro'
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
                    `CNPJ do intermediador "${interRec.getString('nome')}" é inválido.`,
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
          // Sem intermediador (site próprio / app próprio / telefone direto)
          jsonFocus.indicador_intermediador = 0
        }
      }

      // Transporte: transportadora e volumes (se fornecidos)
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

      // Volumes
      if (
        data.volumes_quantidade !== undefined &&
        data.volumes_quantidade !== null &&
        Number(data.volumes_quantidade) > 0
      ) {
        jsonFocus.quantidade_volumes = Number(data.volumes_quantidade)
        if (data.volumes_especie) jsonFocus.especie_volumes = String(data.volumes_especie).trim()
        if (data.peso_bruto !== undefined && Number(data.peso_bruto) > 0)
          jsonFocus.peso_bruto = Number(data.peso_bruto)
        if (data.peso_liquido !== undefined && Number(data.peso_liquido) > 0)
          jsonFocus.peso_liquido = Number(data.peso_liquido)
      }

      // Fatura e duplicatas a partir de contas_receber vinculados à venda
      if (venda) {
        try {
          const titulosVenda = txApp.findRecordsByFilter(
            'contas_receber',
            `origem_id = '${idOrigem}' && ativo = true`,
            'parcela_numero,data_vencimento',
          )
          if (titulosVenda && titulosVenda.length > 0) {
            const duplicatasFocus = []
            for (let d = 0; d < titulosVenda.length; d++) {
              const tit = titulosVenda[d]
              const numDoc =
                tit.getString('numero_documento') ||
                `${venda.getString('numero') || idOrigem.slice(0, 6)}-${d + 1}`
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
              jsonFocus.numero_fatura = venda.getString('numero') || idOrigem.slice(0, 8)
              jsonFocus.valor_original_fatura = round2(totValorTotal)
              jsonFocus.valor_liquido_fatura = round2(totValorTotal)
            }
          }
        } catch (_) {}
      }

      // Troco informado conforme Focus NFe se houver
      const valorTrocoVenda = venda ? venda.getFloat('valor_troco') || 0 : 0
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

      // 9. Gravar ou atualizar documentos_fiscais no banco em status "Rascunho"
      const docFiscaisCol = txApp.findCollectionByNameOrId('documentos_fiscais')
      const docItensCol = txApp.findCollectionByNameOrId('documentos_fiscais_itens')

      let docExistente = null
      try {
        const campoIdFiltro =
          origem === 'Transferência' || origem === 'Transferencia' ? 'transferencia_id' : 'venda_id'
        const docs = txApp.findRecordsByFilter(
          'documentos_fiscais',
          `${campoIdFiltro} = '${idOrigem}' && status = 'Rascunho' && modelo = '${modelo}'`,
          '-created',
          1,
          0,
        )
        if (docs.length > 0) docExistente = docs[0]
      } catch (_) {}

      const referenciaUnica = docExistente
        ? docExistente.getString('referencia')
        : `DOC_${empresaId.slice(0, 5)}_${modelo}_${idOrigem.slice(0, 8)}_${Date.now()}`

      let docRec = docExistente || new Record(docFiscaisCol)
      docRec.set('empresa_id', empresaId)
      docRec.set('modelo', modelo)
      docRec.set('tipo_documento', 1)
      docRec.set('finalidade', 1)
      docRec.set('ambiente', ambiente)
      docRec.set('origem', origem)
      if (origem === 'Transferência' || origem === 'Transferencia') {
        docRec.set('transferencia_id', idOrigem)
      } else {
        docRec.set('venda_id', idOrigem)
      }
      docRec.set('referencia', referenciaUnica)
      docRec.set('status', 'Rascunho')
      docRec.set('serie', seriePadrao)
      docRec.set('data_emissao', dataHojeIso)
      docRec.set('natureza_operacao', naturezaOperacaoInput)
      docRec.set('cfop_principal', cfopPrimeiroItem || '5102')
      docRec.set('destinatario_nome', truncar60(destinatarioNome))
      docRec.set('destinatario_cpf_cnpj', destinatarioCpfCnpj)
      docRec.set('destinatario_uf', destinatarioUf)
      docRec.set('presenca_comprador', presencaCompradorFinal)
      if (intermediadorIdGravado) {
        docRec.set('intermediador_id', intermediadorIdGravado)
      }
      if (identificadorIntermediadorGravado) {
        docRec.set('identificador_intermediador', identificadorIntermediadorGravado)
      }

      // Totais
      docRec.set('valor_produtos', round2(totValorProdutos))
      docRec.set('valor_desconto', round2(totValorDesconto))
      docRec.set('valor_frete', round2(totValorFrete))
      docRec.set('valor_seguro', round2(totValorSeguro))
      docRec.set('valor_outras_despesas', round2(totValorOutras))
      docRec.set('base_icms', round2(totBaseIcms))
      docRec.set('valor_icms', round2(totValorIcms))
      docRec.set('base_icms_st', round2(totBaseIcmsSt))
      docRec.set('valor_icms_st', round2(totValorIcmsSt))
      docRec.set('valor_fcp', round2(totValorFcp))
      docRec.set('valor_icms_uf_destino', round2(totValorIcmsUfDest))
      docRec.set('valor_fcp_uf_destino', round2(totValorFcpUfDest))
      docRec.set('valor_icms_uf_remetente', round2(totValorIcmsUfRemet))
      docRec.set('valor_ipi', round2(totValorIpi))
      docRec.set('valor_pis', round2(totValorPis))
      docRec.set('valor_cofins', round2(totValorCofins))
      docRec.set('valor_ibs', round2(totValorIbs))
      docRec.set('valor_cbs', round2(totValorCbs))
      docRec.set('valor_total', round2(totValorTotal))

      docRec.set('json_enviado', jsonFocus)
      docRec.set('usuario_emissao_id', userId)

      txApp.save(docRec)
      const documentoId = docRec.id

      // 10. Limpar e recriar itens em documentos_fiscais_itens
      try {
        const itensAnteriores = txApp.findRecordsByFilter(
          'documentos_fiscais_itens',
          `documento_id = '${documentoId}'`,
          '',
        )
        for (let a = 0; a < itensAnteriores.length; a++) {
          txApp.delete(itensAnteriores[a])
        }
      } catch (_) {}

      for (let itIdx = 0; itIdx < itensCalculados.length; itIdx++) {
        const itemDados = itensCalculados[itIdx]
        const itemRec = new Record(docItensCol)
        itemRec.set('documento_id', documentoId)
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
        itemRec.set('valor_fcp_st', itemDados.valor_fcp_st)

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

      resultado = {
        documento_id: documentoId,
        documento: {
          id: documentoId,
          referencia: referenciaUnica,
          empresa_id: empresaId,
          empresa_nome:
            empresaRec.getString('nome_fantasia') || empresaRec.getString('razao_social'),
          empresa_cnpj: empresaRec.getString('cnpj'),
          empresa_ie: ieEmitente,
          empresa_crt: crtEmitente,
          empresa_uf: ufEmitente,
          modelo,
          status: 'Rascunho',
          ambiente,
          serie: seriePadrao,
          natureza_operacao: naturezaPadrao,
          cfop_principal: cfopPrimeiroItem,
          destinatario_nome: destinatarioNome,
          destinatario_cpf_cnpj: destinatarioCpfCnpj,
          destinatario_uf: destinatarioUf,
          destinatario_ibge: destinatarioIbge,
          valor_produtos: round2(totValorProdutos),
          valor_desconto: round2(totValorDesconto),
          valor_frete: round2(totValorFrete),
          valor_outras_despesas: round2(totValorOutras),
          base_icms: round2(totBaseIcms),
          valor_icms: round2(totValorIcms),
          base_icms_st: round2(totBaseIcmsSt),
          valor_icms_st: round2(totValorIcmsSt),
          valor_fcp: round2(totValorFcp),
          valor_icms_uf_destino: round2(totValorIcmsUfDest),
          valor_fcp_uf_destino: round2(totValorFcpUfDest),
          valor_ipi: round2(totValorIpi),
          valor_pis: round2(totValorPis),
          valor_cofins: round2(totValorCofins),
          valor_ibs: round2(totValorIbs),
          valor_cbs: round2(totValorCbs),
          valor_total: round2(totValorTotal),
        },
        itens: itensCalculados,
        json_focus: jsonFocus,
        pendencias,
        avisos,
      }
    })

    return c.json(200, {
      sucesso: true,
      documento_id: resultado.documento_id,
      documento: resultado.documento,
      itens: resultado.itens,
      json_focus: resultado.json_focus,
      pendencias: resultado.pendencias,
      avisos: resultado.avisos,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    console.log('[fiscal/montar-rascunho] Erro: ' + msg)
    return c.json(400, {
      sucesso: false,
      message: msg || 'Falha ao montar documento fiscal.',
    })
  }
})
