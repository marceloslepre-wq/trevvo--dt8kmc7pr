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

  /**
   * Converte data ISO ou string para objeto Date considerando o fuso horário de Brasília (UTC-3).
   */
  function extrairDataBrasilia(dataStr) {
    if (!dataStr) return null
    var d = null
    var raw = String(dataStr).trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var p = raw.split('-')
      return {
        ano: parseInt(p[0], 10),
        mes: parseInt(p[1], 10),
        dia: parseInt(p[2], 10),
        isoDia: raw,
      }
    }
    d = new Date(raw)
    if (!d || isNaN(d.getTime())) return null
    // Converte para Brasília UTC-3
    var utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
    var spOffsetMillis = -3 * 60 * 60000
    var spDate = new Date(utcMillis + spOffsetMillis)

    var ano = spDate.getFullYear()
    var m = spDate.getMonth() + 1
    var dia = spDate.getDate()
    var mesStr = m < 10 ? '0' + m : String(m)
    var diaStr = dia < 10 ? '0' + dia : String(dia)

    return {
      ano: ano,
      mes: m,
      dia: dia,
      isoDia: ano + '-' + mesStr + '-' + diaStr,
    }
  }

  /**
   * Arredonda número para 2 casas decimais.
   */
  function round2(valor) {
    var num = typeof valor === 'number' ? valor : parseFloat(String(valor || 0))
    if (isNaN(num)) return 0
    return Math.round(num * 100) / 100
  }

  // --- BLOCO C ---
  function gerarBlocoC(ctx) {
    var linhas = []
    var empresaId = ctx.empresa.id

    // Contadores para o resumo de saídas
    var totalNfe = 0
    var totalNfce = 0
    var totalCanceladas = 0
    var totalDenegadas = 0
    var totalInutilizadas = 0
    var totalVlDoc = 0
    var totalVlIcms = 0

    // Verifica se a empresa é do Simples Nacional (CRT 1 ou 4)
    var crt = ctx.empresa.getInt('crt') || 1
    var ehSimples = crt === 1 || crt === 4

    // Configuração do SPED da empresa
    var incluirHomologacaoEmTeste = true
    if (ctx.configSped) {
      if (ctx.configSped.getBool('incluir_homologacao_em_teste') === false) {
        incluirHomologacaoEmTeste = false
      }
    }

    // Busca arquivos já "Entregues" do mesmo período para validação de cancelamento posterior
    var arquivosEntreguesPeriodo = []
    try {
      arquivosEntreguesPeriodo = $app.findRecordsByFilter(
        'sped_arquivos',
        "empresa_id = '" +
          empresaId +
          "' && periodo = '" +
          ctx.periodo +
          "' && status = 'Entregue'",
        '-entregue_em',
        50,
        0,
      )
    } catch (_) {}

    // Busca documentos fiscais da empresa, modelos 55 e 65
    var docsBrutos = []
    try {
      docsBrutos = $app.findRecordsByFilter(
        'documentos_fiscais',
        "empresa_id = '" + empresaId + "' && (modelo = '55' || modelo = '65') && ativo = true",
        'data_emissao,numero',
        10000,
        0,
      )
    } catch (errDocs) {
      ctx.adicionarValidacao(
        'erro',
        'Falha ao carregar documentos fiscais: ' + (errDocs.message || errDocs),
        'C100',
      )
    }

    // Filtra documentos pela data_emissao no horário de Brasília dentro do período
    var docsPeriodo = []
    for (var d = 0; d < docsBrutos.length; d++) {
      var doc = docsBrutos[d]
      var dtEmissaoStr = doc.getString('data_emissao') || doc.getString('created')
      var dtBsb = extrairDataBrasilia(dtEmissaoStr)
      if (!dtBsb) continue

      // Verifica se está dentro do mês e ano do período
      if (dtBsb.ano !== ctx.ano || dtBsb.mes !== ctx.mes) {
        continue
      }

      var statusDoc = doc.getString('status') || 'Rascunho'
      var numDoc = doc.getInt('numero') || 0
      var modeloDoc = doc.getString('modelo') || '55'
      var ambienteDoc = doc.getString('ambiente') || 'Homologação'

      // Filtro de ambiente:
      // Modo Oficial: só ambiente Produção
      // Modo Teste: também Homologação se incluir_homologacao_em_teste estiver ligado
      if (ctx.modo === 'Oficial') {
        if (ambienteDoc !== 'Produção') {
          continue
        }
      } else {
        // Modo Teste
        if (ambienteDoc !== 'Produção' && !incluirHomologacaoEmTeste) {
          continue
        }
      }

      // Regra 1: Status Rascunho e Rejeitada NÃO entram
      if (statusDoc === 'Rascunho' || statusDoc === 'Rejeitada') {
        continue
      }

      // Regra 1: Status Processando no fim do período: aviso com o número
      if (statusDoc === 'Processando') {
        ctx.adicionarValidacao(
          'aviso',
          'Documento fiscal ' +
            modeloDoc +
            ' nº ' +
            numDoc +
            ' permaneceu com status "Processando" ao fim do período ' +
            ctx.periodo +
            '.',
          'C100',
          String(numDoc),
        )
        continue
      }

      // Consideramos Autorizada, Cancelada e Denegada
      if (statusDoc === 'Autorizada' || statusDoc === 'Cancelada' || statusDoc === 'Denegada') {
        docsPeriodo.push({
          rec: doc,
          dtBsb: dtBsb,
        })
      }
    }

    // Inutilizações de numeração da empresa no período
    var inutsPeriodo = []
    try {
      var inutsBrutas = $app.findRecordsByFilter(
        'inutilizacoes',
        "empresa_id = '" + empresaId + "' && ativo = true",
        'created',
        1000,
        0,
      )
      for (var u = 0; u < inutsBrutas.length; u++) {
        var inut = inutsBrutas[u]
        var dtInutStr = inut.getString('data_inutilizacao') || inut.getString('created')
        var dtInutBsb = extrairDataBrasilia(dtInutStr)
        if (!dtInutBsb) continue
        if (dtInutBsb.ano !== ctx.ano || dtInutBsb.mes !== ctx.mes) continue

        // Verifica status homologado/autorizado
        var stInut = (inut.getString('status') || '').toLowerCase()
        if (stInut !== 'autorizada' && stInut !== 'homologada' && stInut !== 'sucesso') {
          continue
        }

        // Se a tabela tiver campo ambiente e modo for Oficial, só as de produção
        var colInut = inut.collection()
        var temCampoAmb = colInut && colInut.fields.getByName('ambiente')
        if (temCampoAmb && ctx.modo === 'Oficial') {
          var ambInut = inut.getString('ambiente')
          if (ambInut && ambInut !== 'Produção') {
            continue
          }
        }

        inutsPeriodo.push(inut)
      }
    } catch (errInut) {
      console.warn('Erro ao carregar inutilizacoes:', errInut)
    }

    // Linhas do Bloco C
    var c100Linhas = []

    // Processa os documentos fiscais emitidos
    for (var idx = 0; idx < docsPeriodo.length; idx++) {
      var itemDoc = docsPeriodo[idx]
      var rec = itemDoc.rec
      var status = rec.getString('status')
      var modelo = rec.getString('modelo') || '55'
      var serie = rec.getString('serie') || '1'
      var numero = rec.getInt('numero') || 0
      var chaveAcesso = SpedFormato.formatarDigitos(rec.getString('chave_acesso'))
      var tipoDocumento = rec.getInt('tipo_documento') // 1 saída, 0 entrada própria
      var indOper = tipoDocumento === 0 ? '0' : '1'
      var indEmit = '0' // Emissão própria

      // Atualiza totais para resumo
      if (modelo === '65') {
        totalNfce++
      } else {
        totalNfe++
      }

      var codSit = '00'
      if (status === 'Cancelada') {
        codSit = '02'
        totalCanceladas++
      } else if (status === 'Denegada') {
        codSit = '04'
        totalDenegadas++
      }

      // Validação: nota cancelada depois de um arquivo Entregue do mesmo período
      if (status === 'Cancelada' && arquivosEntreguesPeriodo.length > 0) {
        var dtCancStr = rec.getString('cancelada_em') || rec.getString('updated')
        var dtCanc = dtCancStr ? new Date(dtCancStr) : null
        for (var ae = 0; ae < arquivosEntreguesPeriodo.length; ae++) {
          var arqEnt = arquivosEntreguesPeriodo[ae]
          var dtEntStr = arqEnt.getString('entregue_em') || arqEnt.getString('created')
          var dtEnt = dtEntStr ? new Date(dtEntStr) : null
          if (dtCanc && dtEnt && dtCanc.getTime() > dtEnt.getTime()) {
            ctx.adicionarValidacao(
              'aviso',
              'Nota ' +
                modelo +
                ' nº ' +
                numero +
                ' cancelada após a entrega do SPED anterior, é preciso retificar.',
              'C100',
              String(numero),
            )
            break
          }
        }
      }

      // Se Cancelada ou Denegada: preencher só REG, IND_OPER, IND_EMIT, COD_MOD, COD_SIT, SER, NUM_DOC e CHV_NFE
      // (demais 21 campos vazios e sem C101 e C190)
      if (status === 'Cancelada' || status === 'Denegada') {
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C100',
            indOper, // IND_OPER
            indEmit, // IND_EMIT
            '', // COD_PART
            modelo, // COD_MOD
            codSit, // COD_SIT
            serie, // SER
            String(numero), // NUM_DOC
            chaveAcesso, // CHV_NFE
            '', // DT_DOC
            '', // DT_E_S
            '', // VL_DOC
            '', // IND_PGTO
            '', // VL_DESC
            '', // VL_ABAT_NT
            '', // VL_MERC
            '', // IND_FRT
            '', // VL_FRT
            '', // VL_SEG
            '', // VL_OUT_DA
            '', // VL_BC_ICMS
            '', // VL_ICMS
            '', // VL_BC_ICMS_ST
            '', // VL_ICMS_ST
            '', // VL_IPI
            '', // VL_PIS
            '', // VL_COFINS
            '', // VL_PIS_ST
            '', // VL_COFINS_ST
          ]),
        )
        continue
      }

      // Documento AUTORIZADO
      var dtEmissaoSped = SpedFormato.formatarData(
        rec.getString('data_emissao') || rec.getString('created'),
      )

      // Participante:
      // Venda: o cliente da venda (C + id)
      // devolução de venda: o cliente da venda original (C + id)
      // devolução de compra: o fornecedor da nota de entrada (F + id)
      // transferência: a empresa de destino (E + id)
      // NFC-e (65) sem participante: vazio
      var codPart = ''
      var origemDoc = rec.getString('origem') || ''
      var clienteId = rec.getString('cliente_id')
      var fornecedorId = rec.getString('fornecedor_id')

      if (modelo === '65') {
        // NFC-e: não preencher COD_PART (conforme regra 2)
        codPart = ''
      } else {
        // Modelo 55 (NF-e)
        if (origemDoc === 'Transferência' || origemDoc === 'Transferencia') {
          // Transferência: destino pode estar em venda ou transferência
          var empDestId = ''
          if (rec.getString('origem_id')) {
            try {
              var trfRec = $app.findRecordById('transferencias', rec.getString('origem_id'))
              empDestId = trfRec.getString('empresa_destino_id')
            } catch (_) {}
          }
          if (empDestId) {
            codPart = 'E' + empDestId
            ctx.registrarParticipante('E', empDestId)
          } else if (clienteId) {
            codPart = 'C' + clienteId
            ctx.registrarParticipante('C', clienteId)
          }
        } else if (origemDoc === 'Devolução de compra' || origemDoc === 'Devolucao de compra') {
          if (fornecedorId) {
            codPart = 'F' + fornecedorId
            ctx.registrarParticipante('F', fornecedorId)
          } else if (rec.getString('origem_id')) {
            try {
              var neRec = $app.findRecordById('notas_entrada', rec.getString('origem_id'))
              var fId = neRec.getString('fornecedor_id')
              if (fId) {
                codPart = 'F' + fId
                ctx.registrarParticipante('F', fId)
              }
            } catch (_) {}
          }
        } else {
          // Venda normal ou devolução de venda
          if (clienteId) {
            codPart = 'C' + clienteId
            ctx.registrarParticipante('C', clienteId)
          } else if (rec.getString('venda_id')) {
            try {
              var vRec = $app.findRecordById('vendas', rec.getString('venda_id'))
              var cId = vRec.getString('cliente_id')
              if (cId) {
                codPart = 'C' + cId
                ctx.registrarParticipante('C', cId)
              }
            } catch (_) {}
          }
        }
      }

      // IND_PGTO:
      // venda com tudo pago no dia 0
      // venda com parcelas a prazo 1
      // demais 2
      var indPgto = '2'
      if (rec.getString('venda_id')) {
        try {
          var parcelasRecs = $app.findRecordsByFilter(
            'contas_receber',
            "origem_id = '" + rec.getString('venda_id') + "' && ativo = true",
            'data_vencimento',
            100,
            0,
          )
          if (parcelasRecs && parcelasRecs.length > 0) {
            var temPrazo = false
            var dtVendaIso = itemDoc.dtBsb.isoDia
            for (var p = 0; p < parcelasRecs.length; p++) {
              var dv = (parcelasRecs[p].getString('data_vencimento') || '').substring(0, 10)
              if (dv && dv > dtVendaIso) {
                temPrazo = true
                break
              }
            }
            indPgto = temPrazo ? '1' : '0'
          } else {
            indPgto = '0'
          }
        } catch (_) {
          indPgto = '2'
        }
      } else {
        indPgto = '2'
      }

      // IND_FRT: ler do xml_arquivo autorizado ou do payload enviado; se sem frete/xml: 9
      var indFrt = '9'
      var jsonEnv = rec.get('json_enviado')
      if (jsonEnv) {
        try {
          var payloadParsed = typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv
          if (
            payloadParsed &&
            payloadParsed.modalidade_frete !== undefined &&
            payloadParsed.modalidade_frete !== null
          ) {
            indFrt = String(payloadParsed.modalidade_frete)
          }
        } catch (_) {}
      }

      // Valores contábeis e fiscais do C100
      var vlDoc = round2(rec.getFloat('valor_total') || 0)
      var vlDesc = round2(rec.getFloat('valor_desconto') || 0)
      var vlAbatNt = '0,00'
      var vlMerc = round2(rec.getFloat('valor_produtos') || 0)
      var vlFrt = round2(rec.getFloat('valor_frete') || 0)
      var vlSeg = round2(rec.getFloat('valor_seguro') || 0)
      var vlOutDa = round2(rec.getFloat('valor_outras_despesas') || 0)
      var vlBcIcms = round2(rec.getFloat('base_icms') || 0)
      var vlIcms = round2(rec.getFloat('valor_icms') || 0)
      var vlBcIcmsSt = round2(rec.getFloat('base_icms_st') || 0)
      var vlIcmsSt = round2(rec.getFloat('valor_icms_st') || 0)
      var vlIpi = round2(rec.getFloat('valor_ipi') || 0)
      var vlPis = round2(rec.getFloat('valor_pis') || 0)
      var vlCofins = round2(rec.getFloat('valor_cofins') || 0)

      // Atualiza acumuladores de saída
      totalVlDoc = round2(totalVlDoc + vlDoc)
      totalVlIcms = round2(totalVlIcms + vlIcms)

      // Se NFC-e (65): não preencher COD_PART, VL_BC_ICMS_ST, VL_ICMS_ST, VL_IPI, VL_PIS, VL_COFINS, VL_PIS_ST e VL_COFINS_ST
      var sBcIcmsSt = modelo === '65' ? '' : SpedFormato.formatarValor(vlBcIcmsSt)
      var sIcmsSt = modelo === '65' ? '' : SpedFormato.formatarValor(vlIcmsSt)
      var sIpi = modelo === '65' ? '' : SpedFormato.formatarValor(vlIpi)
      var sPis = modelo === '65' ? '' : SpedFormato.formatarValor(vlPis)
      var sCofins = modelo === '65' ? '' : SpedFormato.formatarValor(vlCofins)

      c100Linhas.push(
        SpedFormato.montarLinha([
          'C100',
          indOper,
          indEmit,
          codPart,
          modelo,
          codSit,
          serie,
          String(numero),
          chaveAcesso,
          dtEmissaoSped,
          dtEmissaoSped,
          SpedFormato.formatarValor(vlDoc),
          indPgto,
          SpedFormato.formatarValor(vlDesc),
          vlAbatNt,
          SpedFormato.formatarValor(vlMerc),
          indFrt,
          SpedFormato.formatarValor(vlFrt),
          SpedFormato.formatarValor(vlSeg),
          SpedFormato.formatarValor(vlOutDa),
          SpedFormato.formatarValor(vlBcIcms),
          SpedFormato.formatarValor(vlIcms),
          sBcIcmsSt,
          sIcmsSt,
          sIpi,
          sPis,
          sCofins,
          '', // VL_PIS_ST
          '', // VL_COFINS_ST
        ]),
      )

      // C101: só na NF-e com DIFAL/FCP destino
      var vlFcpUfDest = round2(rec.getFloat('valor_fcp_uf_destino') || 0)
      var vlIcmsUfDest = round2(rec.getFloat('valor_icms_uf_destino') || 0)
      var vlIcmsUfRem = round2(rec.getFloat('valor_icms_uf_remetente') || 0)

      if (modelo === '55' && (vlFcpUfDest > 0 || vlIcmsUfDest > 0 || vlIcmsUfRem > 0)) {
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C101',
            SpedFormato.formatarValor(vlFcpUfDest),
            SpedFormato.formatarValor(vlIcmsUfDest),
            SpedFormato.formatarValor(vlIcmsUfRem),
          ]),
        )
      }

      // C190: Registro analítico do documento autorizado
      // Agrupa documentos_fiscais_itens por CST_ICMS, CFOP e alíquota de ICMS
      var itensDoc = []
      try {
        itensDoc = $app.findRecordsByFilter(
          'documentos_fiscais_itens',
          "documento_id = '" + rec.id + "'",
          'item',
          500,
          0,
        )
      } catch (errItens) {
        ctx.adicionarValidacao(
          'erro',
          'Falha ao carregar itens da nota ' + numero + ': ' + (errItens.message || errItens),
          'C190',
          String(numero),
        )
      }

      // Agrupamento
      var gruposC190 = {}
      var somaVlOprDoc = 0

      for (var it = 0; it < itensDoc.length; it++) {
        var item = itensDoc[it]
        var origItem = SpedFormato.formatarDigitos(item.getString('origem')) || '0'
        var cstItem = SpedFormato.formatarDigitos(item.getString('cst_icms'))
        var csosnItem = SpedFormato.formatarDigitos(item.getString('csosn'))

        // Registra item e unidade para o Bloco 0 (0200 e 0190)
        var prodIdItem = item.getString('produto_id')
        if (prodIdItem) {
          ctx.registrarItem(prodIdItem)
        }
        var unItem = item.getString('unidade')
        if (unItem) {
          ctx.registrarUnidade(unItem)
        }

        // CST_ICMS do registro analítico (3 dígitos)
        // se a empresa for do Simples (CRT 1 ou 4), origem + csosn; senão, origem + cst_icms (com padding)
        var cstFinal = ''
        if (ehSimples) {
          if (!csosnItem && cstItem) {
            // Converte CST para CSOSN
            csosnItem = cstItem.length === 2 ? '1' + cstItem : '102'
          }
          if (!csosnItem) csosnItem = '102'
          cstFinal = origItem.substring(0, 1) + csosnItem
        } else {
          if (!cstItem && csosnItem) {
            cstItem = csosnItem.length >= 2 ? csosnItem.slice(-2) : '00'
          }
          if (!cstItem) cstItem = '00'
          if (cstItem.length === 1) cstItem = '0' + cstItem
          cstFinal = origItem.substring(0, 1) + cstItem
        }

        var cfopItem = SpedFormato.formatarDigitos(item.getString('cfop')) || '5102'
        var aliqIcmsItem = round2(item.getFloat('aliquota_icms') || 0)

        // VL_OPR do item: valor_total do item + ICMS ST + FCP ST + IPI (se não já inclusos)
        // No motor fiscal (Prompt 6.1), valor_total do item é (valorBruto - desconto + frete + outras).
        // ST e IPI são destacados por fora na NF-e e somam no total da nota.
        var vTotItem = round2(item.getFloat('valor_total') || 0)
        var vIcmsStItem = round2(item.getFloat('valor_icms_st') || 0)
        var vFcpStItem = round2(item.getFloat('valor_fcp_st') || 0)
        var vIpiItem = round2(item.getFloat('valor_ipi') || 0)

        var vlOprItem = round2(vTotItem + vIcmsStItem + vFcpStItem + vIpiItem)

        var bcIcmsItem = round2(item.getFloat('base_icms') || 0)
        var vIcmsItem = round2(item.getFloat('valor_icms') || 0)
        var bcStItem = round2(item.getFloat('base_icms_st') || 0)
        var redBcItem = round2(item.getFloat('reducao_bc_icms') || 0)

        // VL_RED_BC: a parte da base que ficou fora (valor sem redução menos a base)
        var vlRedBcItem = 0
        if (redBcItem > 0 && redBcItem < 100 && bcIcmsItem > 0) {
          var baseIntegral = round2(bcIcmsItem / (1 - redBcItem / 100))
          vlRedBcItem = Math.max(0, round2(baseIntegral - bcIcmsItem))
        }

        var chaveGrupo = cstFinal + '|' + cfopItem + '|' + aliqIcmsItem.toFixed(2)
        if (!gruposC190[chaveGrupo]) {
          gruposC190[chaveGrupo] = {
            cst: cstFinal,
            cfop: cfopItem,
            aliqIcms: aliqIcmsItem,
            vlOpr: 0,
            vlBcIcms: 0,
            vlIcms: 0,
            vlBcIcmsSt: 0,
            vlIcmsSt: 0,
            vlRedBc: 0,
            vlIpi: 0,
          }
        }

        var g = gruposC190[chaveGrupo]
        g.vlOpr = round2(g.vlOpr + vlOprItem)
        g.vlBcIcms = round2(g.vlBcIcms + bcIcmsItem)
        g.vlIcms = round2(g.vlIcms + vIcmsItem)
        g.vlBcIcmsSt = round2(g.vlBcIcmsSt + bcStItem)
        g.vlIcmsSt = round2(g.vlIcmsSt + vIcmsStItem)
        g.vlRedBc = round2(g.vlRedBc + vlRedBcItem)
        g.vlIpi = round2(g.vlIpi + vIpiItem)
      }

      // Monta as linhas C190 para cada grupo
      var chavesGrupo = Object.keys(gruposC190).sort()
      for (var cg = 0; cg < chavesGrupo.length; cg++) {
        var grp = gruposC190[chavesGrupo[cg]]
        somaVlOprDoc = round2(somaVlOprDoc + grp.vlOpr)

        c100Linhas.push(
          SpedFormato.montarLinha([
            'C190',
            grp.cst,
            grp.cfop,
            grp.aliqIcms > 0 ? SpedFormato.formatarValor(grp.aliqIcms) : '',
            SpedFormato.formatarValor(grp.vlOpr),
            SpedFormato.formatarValor(grp.vlBcIcms),
            SpedFormato.formatarValor(grp.vlIcms),
            SpedFormato.formatarValor(grp.vlBcIcmsSt),
            SpedFormato.formatarValor(grp.vlIcmsSt),
            SpedFormato.formatarValor(grp.vlRedBc),
            SpedFormato.formatarValor(grp.vlIpi),
            '', // COD_OBS vazio
          ]),
        )
      }

      // Validação: A soma dos VL_OPR do documento deve bater com o VL_DOC do C100; diferença > 0,01: erro
      var difVlOpr = Math.abs(round2(somaVlOprDoc - vlDoc))
      if (itensDoc.length > 0 && difVlOpr > 0.01) {
        ctx.adicionarValidacao(
          'erro',
          'Soma do valor das operações dos registros analíticos C190 (R$ ' +
            somaVlOprDoc.toFixed(2) +
            ') diverge do VL_DOC da nota ' +
            modelo +
            ' nº ' +
            numero +
            ' (R$ ' +
            vlDoc.toFixed(2) +
            ').',
          'C190',
          String(numero),
        )
      }
    }

    // Regra 3: Inutilizações homologadas da empresa no período
    // Para cada número de cada faixa, gera um C100 com COD_SIT 05
    for (var inIdx = 0; inIdx < inutsPeriodo.length; inIdx++) {
      var inutRec = inutsPeriodo[inIdx]
      var modInut = inutRec.getString('modelo') || '55'
      var serInut = inutRec.getString('serie') || '1'
      var numIni = inutRec.getInt('numero_inicial') || 0
      var numFim = inutRec.getInt('numero_final') || numIni

      for (var n = numIni; n <= numFim; n++) {
        totalInutilizadas++
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C100',
            '1', // IND_OPER 1 (saída)
            '0', // IND_EMIT 0 (própria)
            '', // COD_PART
            modInut, // COD_MOD
            '05', // COD_SIT 05 (Numeração Inutilizada)
            serInut, // SER
            String(n), // NUM_DOC
            '', // CHV_NFE
            '', // DT_DOC
            '', // DT_E_S
            '', // VL_DOC
            '', // IND_PGTO
            '', // VL_DESC
            '', // VL_ABAT_NT
            '', // VL_MERC
            '', // IND_FRT
            '', // VL_FRT
            '', // VL_SEG
            '', // VL_OUT_DA
            '', // VL_BC_ICMS
            '', // VL_ICMS
            '', // VL_BC_ICMS_ST
            '', // VL_ICMS_ST
            '', // VL_IPI
            '', // VL_PIS
            '', // VL_COFINS
            '', // VL_PIS_ST
            '', // VL_COFINS_ST
          ]),
        )
      }
    }

    // Regra 7: Atualize C001 (IND_MOV 0 quando houver qualquer C100) e C990
    var temMovimento = c100Linhas.length > 0
    linhas.push(SpedFormato.montarLinha(['C001', temMovimento ? '0' : '1']))

    if (temMovimento) {
      linhas = linhas.concat(c100Linhas)
    }

    var totalLinhasC = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['C990', String(totalLinhasC)]))

    // Guarda o resumo de saídas no contexto para ser salvo em sped_arquivos
    ctx.resumoSaida = {
      total_nfe: totalNfe,
      total_nfce: totalNfce,
      total_canceladas: totalCanceladas,
      total_denegadas: totalDenegadas,
      total_inutilizadas: totalInutilizadas,
      total_vl_doc: totalVlDoc,
      total_vl_icms: totalVlIcms,
    }

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
      resumoSaida: ctx.resumoSaida || null,
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
