/// <reference path="../types.d.ts" />

/**
 * Motor gerador da EFD ICMS/IPI (SPED Fiscal).
 * Compatível com o runtime Goja do PocketBase.
 */

var SpedGerador = (function () {
  /**
   * Cria o objeto de contexto de geração do SPED.
   */
  function criarContexto(params) {
    var empresa = params.empresa // Record de empresas
    var configSped = params.configSped // Record de config_sped_empresa ou null
    var periodo = params.periodo // "AAAA-MM"
    var modo = params.modo || 'Teste' // "Oficial" | "Teste"
    var finalidade = params.finalidade || '0' // "0" original

    var ano = parseInt(periodo.substring(0, 4), 10)
    var mes = parseInt(periodo.substring(5, 7), 10)
    var mesStr = mes < 10 ? '0' + mes : String(mes)
    var ultimoDia = new Date(ano, mes, 0).getDate()
    var ultimoDiaStr = ultimoDia < 10 ? '0' + ultimoDia : String(ultimoDia)

    var dtIniIso = ano + '-' + mesStr + '-01'
    var dtFinIso = ano + '-' + mesStr + '-' + ultimoDiaStr
    var dtIniSped = '01' + mesStr + String(ano)
    var dtFinSped = ultimoDiaStr + mesStr + String(ano)

    // Coletores com deduplicação
    var participantesMap = {} // chave: tipo + '_' + id -> { tipo, id }
    var itensMap = {} // chave: produto_id -> produto_id
    var unidadesMap = {} // chave: sigla_ou_id -> { id, sigla }

    var validacoes = [] // { nivel: 'erro' | 'aviso', registro, mensagem, referencia }

    return {
      empresa: empresa,
      configSped: configSped,
      periodo: periodo,
      ano: ano,
      mes: mes,
      modo: modo,
      finalidade: finalidade,
      dtIniIso: dtIniIso,
      dtFinIso: dtFinIso,
      dtIniSped: dtIniSped,
      dtFinSped: dtFinSped,
      participantesMap: participantesMap,
      itensMap: itensMap,
      unidadesMap: unidadesMap,
      validacoes: validacoes,

      registrarParticipante: function (tipo, id) {
        if (!tipo || !id) return
        var k = String(tipo).toUpperCase() + '_' + String(id)
        participantesMap[k] = { tipo: String(tipo).toUpperCase(), id: String(id) }
      },

      registrarItem: function (produtoId) {
        if (!produtoId) return
        itensMap[String(produtoId)] = String(produtoId)
      },

      registrarUnidade: function (unidadeIdOuSigla) {
        if (!unidadeIdOuSigla) return
        unidadesMap[String(unidadeIdOuSigla)] = String(unidadeIdOuSigla)
      },

      adicionarValidacao: function (nivel, mensagem, registro, referencia) {
        validacoes.push({
          nivel: nivel === 'erro' ? 'erro' : 'aviso',
          registro: registro || '',
          mensagem: mensagem || '',
          referencia: referencia || '',
        })
      },
    }
  }

  // --- BLOCO B ---
  function gerarBlocoB(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['B001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['B990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO C (vazio nesta rodada) ---
  function gerarBlocoC(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['C001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['C990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO D (vazio nesta rodada) ---
  function gerarBlocoD(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['D001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['D990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO E (apuração vazia com E110 zerado) ---
  function gerarBlocoE(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['E001', '0']))
    linhas.push(SpedFormato.montarLinha(['E100', ctx.dtIniSped, ctx.dtFinSped]))

    // Registro E110: Apuração do ICMS Próprio com todos os campos zerados
    // Layout E110 (15 campos de valores):
    // 01: REG ("E110")
    // 02: VL_TOT_DEBITOS ("0,00")
    // 03: VL_AJ_DEBITOS ("0,00")
    // 04: VL_TOT_AJ_DEBITOS ("0,00")
    // 05: VL_ESTORNOS_CRED ("0,00")
    // 06: VL_TOT_CREDITOS ("0,00")
    // 07: VL_AJ_CREDITOS ("0,00")
    // 08: VL_TOT_AJ_CREDITOS ("0,00")
    // 09: VL_ESTORNOS_DEB ("0,00")
    // 10: VL_SLD_CREDOR_ANT ("0,00")
    // 11: VL_SLD_APURADO ("0,00")
    // 12: VL_TOT_DED ("0,00")
    // 13: VL_ICMS_RECOLHER ("0,00")
    // 14: VL_SLD_CREDOR_TRANSPORTAR ("0,00")
    // 15: DEB_ESP ("0,00")
    linhas.push(
      SpedFormato.montarLinha([
        'E110',
        '0,00', // VL_TOT_DEBITOS
        '0,00', // VL_AJ_DEBITOS
        '0,00', // VL_TOT_AJ_DEBITOS
        '0,00', // VL_ESTORNOS_CRED
        '0,00', // VL_TOT_CREDITOS
        '0,00', // VL_AJ_CREDITOS
        '0,00', // VL_TOT_AJ_CREDITOS
        '0,00', // VL_ESTORNOS_DEB
        '0,00', // VL_SLD_CREDOR_ANT
        '0,00', // VL_SLD_APURADO
        '0,00', // VL_TOT_DED
        '0,00', // VL_ICMS_RECOLHER
        '0,00', // VL_SLD_CREDOR_TRANSPORTAR
        '0,00', // DEB_ESP
      ]),
    )

    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['E990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO G (vazio nesta rodada) ---
  function gerarBlocoG(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['G001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['G990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO H (vazio nesta rodada) ---
  function gerarBlocoH(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['H001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['H990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO K (vazio nesta rodada) ---
  function gerarBlocoK(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['K001', '1']))
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['K990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO 1 (outras informações) ---
  function gerarBloco1(ctx) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['1001', '0']))
    // Registro 1010 com os 13 indicadores todos "N"
    // REG, IND_EXP, IND_CCRF, IND_COMB, IND_USINA, IND_VA, IND_EE, IND_CART, IND_FORM, IND_AER, IND_GIAF1, IND_GIAF3, IND_GIAF4, IND_REST_RESSARC_COMPL_ICMS
    linhas.push(
      SpedFormato.montarLinha([
        '1010',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
        'N',
      ]),
    )
    var totalLinhas = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['1990', String(totalLinhas)]))
    return linhas
  }

  // --- BLOCO 0 ---
  function gerarBloco0(ctx) {
    var emp = ctx.empresa
    var cfg = ctx.configSped
    var linhas = []

    // 0000: Abertura do Arquivo Digital e Identificação da Entidade
    var codVer = '020'
    if (cfg) {
      var cv = cfg.getString('versao_leiaute')
      if (cv && cv.trim()) codVer = cv.trim()
    }
    var codFin = ctx.finalidade || '0'
    var dtIni = ctx.dtIniSped
    var dtFin = ctx.dtFinSped
    var nome = SpedFormato.formatarTexto(
      emp.getString('razao_social') || emp.getString('nome_fantasia'),
      100,
    )
    var cnpj = SpedFormato.formatarDigitos(emp.getString('cnpj'))
    var cpf = ''
    var uf = (emp.getString('uf') || 'ES').trim().toUpperCase()
    var ie = SpedFormato.formatarDigitos(emp.getString('inscricao_estadual'))
    var codMun = SpedFormato.formatarDigitos(emp.getString('codigo_municipio_ibge'))
    var im = SpedFormato.formatarTexto(emp.getString('inscricao_municipal'), 20)
    var suframa = ''
    var indPerfil = (emp.getString('perfil_sped') || 'B').trim().toUpperCase()
    if (indPerfil !== 'A' && indPerfil !== 'B' && indPerfil !== 'C') indPerfil = 'B'
    var indAtiv = String(emp.getInt('indicador_atividade_sped') || 0)

    if (!codMun || codMun.length !== 7) {
      ctx.adicionarValidacao(
        'erro',
        'Código de município IBGE da empresa não informado ou inválido (deve ter 7 dígitos).',
        '0000',
        codMun,
      )
    }

    linhas.push(
      SpedFormato.montarLinha([
        '0000',
        codVer,
        codFin,
        dtIni,
        dtFin,
        nome,
        cnpj,
        cpf,
        uf,
        ie,
        codMun,
        im,
        suframa,
        indPerfil,
        indAtiv,
      ]),
    )

    // 0001: Abertura do Bloco 0 (IND_MOV "0")
    linhas.push(SpedFormato.montarLinha(['0001', '0']))

    // 0005: Dados Complementares da Entidade
    var fantasia = SpedFormato.formatarTexto(
      emp.getString('nome_fantasia') || emp.getString('razao_social'),
      60,
    )
    var cep = SpedFormato.formatarDigitos(emp.getString('cep'))
    var logradouro = SpedFormato.formatarTexto(emp.getString('logradouro'), 60)
    var numero = SpedFormato.formatarTexto(emp.getString('numero'), 10)
    var complemento = SpedFormato.formatarTexto(emp.getString('complemento'), 60)
    var bairro = SpedFormato.formatarTexto(emp.getString('bairro'), 60)
    var fone = SpedFormato.formatarDigitos(emp.getString('telefone') || emp.getString('celular'))
    var fax = ''
    var email = SpedFormato.formatarTexto(
      emp.getString('email_fiscal') || emp.getString('email'),
      100,
    )

    linhas.push(
      SpedFormato.montarLinha([
        '0005',
        fantasia,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        fone,
        fax,
        email,
      ]),
    )

    // 0015: Dados do Contribuinte Substituto ou Responsável pelo ICMS ST
    // SÓ se a empresa tiver inscricao_estadual_st preenchida
    var ieSt = SpedFormato.formatarDigitos(emp.getString('inscricao_estadual_st'))
    if (ieSt) {
      linhas.push(SpedFormato.montarLinha(['0015', uf, ieSt]))
    }

    // 0100: Dados do Contabilista
    var contNome = SpedFormato.formatarTexto(emp.getString('contador_nome'), 100)
    var contCpf = SpedFormato.formatarDigitos(emp.getString('contador_cpf'))
    var contCrc = SpedFormato.formatarTexto(emp.getString('contador_crc'), 15)
    var contCnpjEscritorio = SpedFormato.formatarDigitos(emp.getString('contador_cnpj_escritorio'))
    var contCep = SpedFormato.formatarDigitos(emp.getString('contador_cep'))
    var contLogradouro = SpedFormato.formatarTexto(emp.getString('contador_logradouro'), 60)
    var contNumero = SpedFormato.formatarTexto(emp.getString('contador_numero'), 10)
    var contComplemento = SpedFormato.formatarTexto(emp.getString('contador_complemento'), 60)
    var contBairro = SpedFormato.formatarTexto(emp.getString('contador_bairro'), 60)
    var contFone = SpedFormato.formatarDigitos(emp.getString('contador_telefone'))
    var contFax = ''
    var contEmail = SpedFormato.formatarTexto(emp.getString('contador_email'), 100)
    var contCodMun = SpedFormato.formatarDigitos(emp.getString('contador_codigo_municipio_ibge'))

    if (!contNome) {
      ctx.adicionarValidacao(
        'aviso',
        'Nome do contador não preenchido no cadastro da empresa.',
        '0100',
      )
    }
    if (!contCpf || contCpf.length !== 11) {
      ctx.adicionarValidacao('aviso', 'CPF do contador ausente ou inválido.', '0100', contCpf)
    }
    if (!contCrc) {
      ctx.adicionarValidacao('aviso', 'CRC do contador não preenchido.', '0100')
    }

    linhas.push(
      SpedFormato.montarLinha([
        '0100',
        contNome,
        contCpf,
        contCrc,
        contCnpjEscritorio,
        contCep,
        contLogradouro,
        contNumero,
        contComplemento,
        contBairro,
        contFone,
        contFax,
        contEmail,
        contCodMun,
      ]),
    )

    // 0150: Participantes coletados (C cliente, F fornecedor, E empresa do grupo)
    var chavesPart = Object.keys(ctx.participantesMap).sort()
    for (var i = 0; i < chavesPart.length; i++) {
      var itemPart = ctx.participantesMap[chavesPart[i]]
      var codPart = itemPart.tipo + itemPart.id
      var nomePart = ''
      var codPais = '01058' // Brasil
      var cnpjPart = ''
      var cpfPart = ''
      var iePart = ''
      var codMunPart = ''
      var suframaPart = ''
      var endPart = ''
      var numPart = ''
      var complPart = ''
      var bairroPart = ''

      try {
        if (itemPart.tipo === 'C') {
          var cl = $app.findRecordById('clientes', itemPart.id)
          nomePart = SpedFormato.formatarTexto(
            cl.getString('nome_razao_social') || cl.getString('nome_fantasia'),
            100,
          )
          var doc = SpedFormato.formatarDigitos(cl.getString('cpf_cnpj'))
          if (doc.length > 11) cnpjPart = doc
          else cpfPart = doc
          var indIeCl = cl.getString('indicador_ie')
          if (indIeCl === '1') {
            iePart = SpedFormato.formatarDigitos(cl.getString('inscricao_estadual'))
          }
          codMunPart = SpedFormato.formatarDigitos(cl.getString('codigo_municipio_ibge'))
          suframaPart = SpedFormato.formatarDigitos(cl.getString('inscricao_suframa'))
          endPart = SpedFormato.formatarTexto(cl.getString('logradouro'), 60)
          numPart = SpedFormato.formatarTexto(cl.getString('numero'), 10)
          complPart = SpedFormato.formatarTexto(cl.getString('complemento'), 60)
          bairroPart = SpedFormato.formatarTexto(cl.getString('bairro'), 60)
        } else if (itemPart.tipo === 'F') {
          var fo = $app.findRecordById('fornecedores', itemPart.id)
          nomePart = SpedFormato.formatarTexto(
            fo.getString('razao_social') || fo.getString('nome_fantasia'),
            100,
          )
          var docF = SpedFormato.formatarDigitos(fo.getString('cpf_cnpj'))
          if (docF.length > 11) cnpjPart = docF
          else cpfPart = docF
          var indIeFo = fo.getString('indicador_ie')
          if (indIeFo === '1') {
            iePart = SpedFormato.formatarDigitos(fo.getString('inscricao_estadual'))
          }
          codMunPart = SpedFormato.formatarDigitos(fo.getString('codigo_municipio_ibge'))
          suframaPart = SpedFormato.formatarDigitos(fo.getString('inscricao_suframa'))
          endPart = SpedFormato.formatarTexto(fo.getString('logradouro'), 60)
          numPart = SpedFormato.formatarTexto(fo.getString('numero'), 10)
          complPart = SpedFormato.formatarTexto(fo.getString('complemento'), 60)
          bairroPart = SpedFormato.formatarTexto(fo.getString('bairro'), 60)
        } else if (itemPart.tipo === 'E') {
          var emRel = $app.findRecordById('empresas', itemPart.id)
          nomePart = SpedFormato.formatarTexto(
            emRel.getString('razao_social') || emRel.getString('nome_fantasia'),
            100,
          )
          cnpjPart = SpedFormato.formatarDigitos(emRel.getString('cnpj'))
          iePart = SpedFormato.formatarDigitos(emRel.getString('inscricao_estadual'))
          codMunPart = SpedFormato.formatarDigitos(emRel.getString('codigo_municipio_ibge'))
          endPart = SpedFormato.formatarTexto(emRel.getString('logradouro'), 60)
          numPart = SpedFormato.formatarTexto(emRel.getString('numero'), 10)
          complPart = SpedFormato.formatarTexto(emRel.getString('complemento'), 60)
          bairroPart = SpedFormato.formatarTexto(emRel.getString('bairro'), 60)
        }
      } catch (errPart) {
        ctx.adicionarValidacao(
          'erro',
          'Falha ao carregar participante: ' + (errPart.message || errPart),
          '0150',
          codPart,
        )
      }

      if (!codMunPart || codMunPart.length !== 7) {
        ctx.adicionarValidacao(
          'erro',
          'Código de município IBGE não informado para o participante "' +
            (nomePart || codPart) +
            '".',
          '0150',
          codPart,
        )
      }

      linhas.push(
        SpedFormato.montarLinha([
          '0150',
          codPart,
          nomePart,
          codPais,
          cnpjPart,
          cpfPart,
          iePart,
          codMunPart,
          suframaPart,
          endPart,
          numPart,
          complPart,
          bairroPart,
        ]),
      )
    }

    // 0190: Unidades de Medida coletadas
    // Tabela: unidades_medida (sigla, descricao)
    var chavesUnid = Object.keys(ctx.unidadesMap).sort()
    for (var u = 0; u < chavesUnid.length; u++) {
      var idOuSigla = ctx.unidadesMap[chavesUnid[u]]
      var sigla = idOuSigla
      var descr = idOuSigla
      try {
        var unRec = null
        if (idOuSigla.length === 15) {
          try {
            unRec = $app.findRecordById('unidades_medida', idOuSigla)
          } catch (_) {}
        }
        if (!unRec) {
          var unRecs = $app.findRecordsByFilter(
            'unidades_medida',
            "sigla = '" + idOuSigla + "'",
            '',
            1,
            0,
          )
          if (unRecs && unRecs.length > 0) unRec = unRecs[0]
        }
        if (unRec) {
          sigla = unRec.getString('sigla')
          descr = unRec.getString('descricao') || sigla
        }
      } catch (_) {}

      linhas.push(
        SpedFormato.montarLinha([
          '0190',
          SpedFormato.formatarTexto(sigla, 6),
          SpedFormato.formatarTexto(descr, 100),
        ]),
      )
    }

    // 0200: Itens coletados (produtos)
    var chavesItens = Object.keys(ctx.itensMap).sort()
    for (var it = 0; it < chavesItens.length; it++) {
      var prodId = ctx.itensMap[chavesItens[it]]
      try {
        var prod = $app.findRecordById('produtos', prodId)
        var codItem = String(prod.getInt('codigo') || prod.id)
        var descrItem = SpedFormato.formatarTexto(prod.getString('descricao'), 100)
        var codBarra = SpedFormato.formatarDigitos(prod.getString('gtin'))
        var codAntItem = ''
        var unidInv = ''
        var unidId = prod.getString('unidade_id')
        if (unidId) {
          try {
            var unP = $app.findRecordById('unidades_medida', unidId)
            unidInv = unP.getString('sigla')
          } catch (_) {
            unidInv = unidId
          }
        }
        if (!unidInv) unidInv = 'UN'

        var tipoItem = SpedFormato.formatarDigitos(prod.getString('tipo_item_sped'))
        if (!tipoItem) {
          tipoItem = '00' // Mercadoria para revenda (padrão)
          ctx.adicionarValidacao(
            'erro',
            'Produto sem tipo_item_sped: ' + codItem + ' - ' + descrItem,
            '0200',
            codItem,
          )
        }
        if (tipoItem.length === 1) tipoItem = '0' + tipoItem

        var codNcm = SpedFormato.formatarDigitos(prod.getString('ncm'))
        if (!codNcm || codNcm.length !== 8) {
          ctx.adicionarValidacao(
            'erro',
            'Produto sem NCM válido de 8 dígitos: ' + codItem + ' - ' + descrItem,
            '0200',
            codItem,
          )
        }

        var exIpi = SpedFormato.formatarTexto(prod.getString('ex_tipi'), 3)
        var codGen = SpedFormato.formatarDigitos(prod.getString('codigo_genero'))
        if (!codGen && codNcm.length >= 2) {
          codGen = codNcm.substring(0, 2)
        }
        var codLst = SpedFormato.formatarDigitos(prod.getString('codigo_servico_lc116'))
        var aliqIcms = ''
        var cest = SpedFormato.formatarDigitos(prod.getString('cest'))

        linhas.push(
          SpedFormato.montarLinha([
            '0200',
            codItem,
            descrItem,
            codBarra,
            codAntItem,
            SpedFormato.formatarTexto(unidInv, 6),
            tipoItem,
            codNcm,
            exIpi,
            codGen,
            codLst,
            aliqIcms,
            cest,
          ]),
        )
      } catch (errProd) {
        ctx.adicionarValidacao(
          'erro',
          'Falha ao carregar produto para o Bloco 0200: ' + (errProd.message || errProd),
          '0200',
          prodId,
        )
      }
    }

    // 0990: Encerramento do Bloco 0 (quantidade total de linhas do 0000 ao 0990, inclusive)
    var totalLinhas0 = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['0990', String(totalLinhas0)]))

    return linhas
  }

  // --- BLOCO 9 ---
  function gerarBloco9(linhasAnteriores) {
    var linhas = []
    linhas.push(SpedFormato.montarLinha(['9001', '0']))

    // Contagem de registros no arquivo
    var contagem = {}
    function incrementar(reg) {
      if (!reg) return
      contagem[reg] = (contagem[reg] || 0) + 1
    }

    // Conta registros já gerados (Bloco 0 ao 1)
    for (var i = 0; i < linhasAnteriores.length; i++) {
      var l = linhasAnteriores[i]
      if (l && l.length > 2 && l.charAt(0) === '|') {
        var partes = l.split('|')
        var reg = partes[1]
        incrementar(reg)
      }
    }

    // Conta 9001
    incrementar('9001')

    // Linhas do Bloco 9 até agora: 9001
    // Mais à frente teremos:
    // - Um 9900 para cada tipo distinto presente no arquivo (incluindo 9001, 9900, 9990, 9999)
    // - O registro 9990
    // - O registro 9999
    // Registros a contabilizar no 9900:
    var tiposFixos = ['9001', '9900', '9990', '9999']
    for (var tf = 0; tf < tiposFixos.length; tf++) {
      if (!contagem[tiposFixos[tf]]) {
        contagem[tiposFixos[tf]] = 0
      }
    }
    contagem['9001'] = 1
    contagem['9990'] = 1
    contagem['9999'] = 1

    var listaTipos = Object.keys(contagem).sort()
    // A quantidade de linhas 9900 será exatamente a quantidade de tipos distintos
    var qtdRegistros9900 = listaTipos.length
    contagem['9900'] = qtdRegistros9900

    // Gera um registro 9900 para cada tipo ordenado
    for (var t = 0; t < listaTipos.length; t++) {
      var codReg = listaTipos[t]
      var qtd = contagem[codReg]
      linhas.push(SpedFormato.montarLinha(['9900', codReg, String(qtd)]))
    }

    // 9990: Total de linhas do Bloco 9 (do 9001 ao 9990 inclusive)
    var totalLinhas9 = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['9990', String(totalLinhas9)]))

    // 9999: Total de linhas do arquivo inteiro (incluindo 9999)
    var totalArquivo = linhasAnteriores.length + linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['9999', String(totalArquivo)]))

    return {
      linhas: linhas,
      contagem: contagem,
      totalLinhas: totalArquivo,
    }
  }

  /**
   * Função orquestradora:
   * 1) Cria contexto
   * 2) Monta Blocos C, D, E, G, H, K, 1 e B (registrando o que usam)
   * 3) Monta Bloco 0 com o que foi coletado
   * 4) Monta Bloco 9 e fecha totais
   */
  function gerarArquivoCompleto(params) {
    var ctx = criarContexto(params)

    // Validação de Inscrição Estadual no Modo Oficial
    var ieEmpresa = SpedFormato.formatarDigitos(ctx.empresa.getString('inscricao_estadual'))
    var ieTexto = (ctx.empresa.getString('inscricao_estadual') || '').trim().toUpperCase()
    if (ctx.modo === 'Oficial') {
      if (!ieEmpresa || ieTexto === 'ISENTO' || !/^\d+$/.test(ieEmpresa)) {
        ctx.adicionarValidacao(
          'erro',
          'Empresa sem Inscrição Estadual numérica no modo Oficial (IE: "' + ieTexto + '").',
          '0000',
          ieTexto,
        )
      }
    }

    // Blocos operacionais executam PRIMEIRO (registrando coletores para o Bloco 0)
    var linhasB = gerarBlocoB(ctx)
    var linhasC = gerarBlocoC(ctx)
    var linhasD = gerarBlocoD(ctx)
    var linhasE = gerarBlocoE(ctx)
    var linhasG = gerarBlocoG(ctx)
    var linhasH = gerarBlocoH(ctx)
    var linhasK = gerarBlocoK(ctx)
    var linhas1 = gerarBloco1(ctx)

    // Bloco 0 montado DEPOIS com dados da empresa e o que foi coletado
    var linhas0 = gerarBloco0(ctx)

    // Concatena blocos antes do Bloco 9
    var linhasAntes9 = []
    linhasAntes9 = linhasAntes9.concat(linhas0)
    linhasAntes9 = linhasAntes9.concat(linhasB)
    linhasAntes9 = linhasAntes9.concat(linhasC)
    linhasAntes9 = linhasAntes9.concat(linhasD)
    linhasAntes9 = linhasAntes9.concat(linhasE)
    linhasAntes9 = linhasAntes9.concat(linhasG)
    linhasAntes9 = linhasAntes9.concat(linhasH)
    linhasAntes9 = linhasAntes9.concat(linhasK)
    linhasAntes9 = linhasAntes9.concat(linhas1)

    // Bloco 9 monta contagens e totais
    var res9 = gerarBloco9(linhasAntes9)
    var linhasFinais = linhasAntes9.concat(res9.linhas)

    var conteudoTexto = linhasFinais.join('')

    // Nome oficial do arquivo:
    // SPED_EFD_<CNPJ só dígitos>_<AAAAMM>.txt
    // No modo Teste, prefixo "TESTE_"
    var cnpjDig = SpedFormato.formatarDigitos(ctx.empresa.getString('cnpj')) || '00000000000000'
    var periodoSemHifen = ctx.periodo.replace('-', '')
    var nomeArquivo = 'SPED_EFD_' + cnpjDig + '_' + periodoSemHifen + '.txt'
    if (ctx.modo === 'Teste') {
      nomeArquivo = 'TESTE_' + nomeArquivo
    }

    // Status final
    var temErros = false
    for (var v = 0; v < ctx.validacoes.length; v++) {
      if (ctx.validacoes[v].nivel === 'erro') {
        temErros = true
        break
      }
    }

    var status = temErros ? 'Gerado com erros' : 'Gerado'

    return {
      conteudo: conteudoTexto,
      nomeArquivo: nomeArquivo,
      quantidadeLinhas: res9.totalLinhas,
      contagemRegistros: res9.contagem,
      validacoes: ctx.validacoes,
      status: status,
      temErros: temErros,
      ctx: ctx,
    }
  }

  return {
    criarContexto: criarContexto,
    gerarBloco0: gerarBloco0,
    gerarBlocoB: gerarBlocoB,
    gerarBlocoC: gerarBlocoC,
    gerarBlocoD: gerarBlocoD,
    gerarBlocoE: gerarBlocoE,
    gerarBlocoG: gerarBlocoG,
    gerarBlocoH: gerarBlocoH,
    gerarBlocoK: gerarBlocoK,
    gerarBloco1: gerarBloco1,
    gerarBloco9: gerarBloco9,
    gerarArquivoCompleto: gerarArquivoCompleto,
  }
})()
