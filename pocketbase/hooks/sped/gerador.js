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

  function extrairUfDestinoDoc(doc) {
    if (!doc) return ''
    var uf = (doc.getString('destinatario_uf') || '').trim().toUpperCase()
    if (uf && uf.length === 2) return uf
    // Tenta pelo cliente_id ou json_enviado
    var clienteId = doc.getString('cliente_id')
    if (clienteId) {
      try {
        var cl = $app.findRecordById('clientes', clienteId)
        var ufCl = (cl.getString('uf') || '').trim().toUpperCase()
        if (ufCl && ufCl.length === 2) return ufCl
      } catch (_) {}
    }
    var jsonEnv = doc.get('json_enviado')
    if (jsonEnv) {
      try {
        var payload = typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv
        if (payload && payload.destinatario && payload.destinatario.uf) {
          var ufDest = String(payload.destinatario.uf).trim().toUpperCase()
          if (ufDest.length === 2) return ufDest
        }
      } catch (_) {}
    }
    return ''
  }

  // --- BLOCO C ---
  function gerarBlocoC(ctx) {
    var linhas = []
    var empresaId = ctx.empresa.id

    // Coletores de registros analíticos C190 e C101 para o Bloco E em memória
    var c190Registros = [] // { indOper: '0'|'1', cst, cfop, aliqIcms, vlOpr, vlBcIcms, vlIcms, vlBcIcmsSt, vlIcmsSt, vlRedBc, vlIpi }
    var c101Registros = [] // { uf: string, tipo: 'saida'|'devolucao_venda', dtEmissaoIso: string, vlFcpUfDest, vlIcmsUfDest, vlIcmsUfRem }

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

    // Set de chaves de acesso emitidas e processadas para evitar duplicidades
    var chavesProcessadasBlocoC = {}

    // Contadores para o resumo de entradas
    var totalCompras = 0
    var totalTransferenciasRecebidas = 0
    var totalVlDocEntrada = 0
    var totalVlCreditoIcms = 0

    // Verifica se a empresa é contribuinte do IPI
    var ehContribuinteIpi = ctx.empresa.getBool('contribuinte_ipi') === true

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
      if (chaveAcesso) {
        chavesProcessadasBlocoC[chaveAcesso] = true
      }
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

        var ufDestC101 = extrairUfDestinoDoc(rec)
        var tipoOperC101 = indOper === '0' ? 'devolucao_venda' : 'saida'
        var dtEmissaoDocIso = itemDoc.dtBsb ? itemDoc.dtBsb.isoDia : ''
        c101Registros.push({
          uf: ufDestC101,
          tipo: tipoOperC101,
          dtEmissaoIso: dtEmissaoDocIso,
          vlFcpUfDest: vlFcpUfDest,
          vlIcmsUfDest: vlIcmsUfDest,
          vlIcmsUfRem: vlIcmsUfRem,
        })
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

        c190Registros.push({
          indOper: indOper,
          cst: grp.cst,
          cfop: grp.cfop,
          aliqIcms: grp.aliqIcms,
          vlOpr: grp.vlOpr,
          vlBcIcms: grp.vlBcIcms,
          vlIcms: grp.vlIcms,
          vlBcIcmsSt: grp.vlBcIcmsSt,
          vlIcmsSt: grp.vlIcmsSt,
          vlRedBc: grp.vlRedBc,
          vlIpi: grp.vlIpi,
        })
      }

      // Validação: A soma dos VL_OPR do documento deve bater com o VL_DOC do C100 (aviso acima de 0,01 conforme Prompt 7.6a regra 7)
      var difVlOpr = Math.abs(round2(somaVlOprDoc - vlDoc))
      if (itensDoc.length > 0 && difVlOpr > 0.01) {
        ctx.adicionarValidacao(
          'aviso',
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

    // --- ENTRADAS 1: NOTAS DE ENTRADA (COMPRAS E OUTRAS ENTRADAS) ---
    var notasEntradaBrutas = []
    try {
      notasEntradaBrutas = $app.findRecordsByFilter(
        'notas_entrada',
        "empresa_id = '" + empresaId + "' && status = 'Lançada' && ativo = true",
        'data_entrada,numero',
        10000,
        0,
      )
    } catch (errNe) {
      ctx.adicionarValidacao(
        'erro',
        'Falha ao carregar notas de entrada: ' + (errNe.message || errNe),
        'C100',
      )
    }

    for (var neIdx = 0; neIdx < notasEntradaBrutas.length; neIdx++) {
      var ne = notasEntradaBrutas[neIdx]
      var dtEntradaStr = ne.getString('data_entrada') || ne.getString('created')
      var dtEntBsb = extrairDataBrasilia(dtEntradaStr)
      if (!dtEntBsb) continue
      if (dtEntBsb.ano !== ctx.ano || dtEntBsb.mes !== ctx.mes) continue

      var modeloNe = ne.getString('modelo') || '55'
      var sitDocNe = ne.getString('situacao_documento') || '00'
      var numNe = ne.getInt('numero') || 0
      var serNe = ne.getString('serie') || '1'
      var chvNe = SpedFormato.formatarDigitos(ne.getString('chave_acesso'))

      // Checa modelos aceitos: 55, 01, 1B e 04
      if (modeloNe !== '55' && modeloNe !== '01' && modeloNe !== '1B' && modeloNe !== '04') {
        ctx.adicionarValidacao(
          'aviso',
          'Nota de entrada nº ' +
            numNe +
            ' possui modelo "' +
            modeloNe +
            '" não suportado na escrituração do SPED Fiscal e não foi incluída.',
          'C100',
          String(numNe),
        )
        continue
      }

      // Regra 1: situacao_documento "02" (cancelada pelo fornecedor) NÃO entra
      if (sitDocNe === '02') {
        continue
      }

      var codSitNe = '00'
      if (sitDocNe === '08') {
        codSitNe = '08'
      }

      // Registra chave de acesso para evitar duplicação em transferências recebidas
      if (chvNe) {
        chavesProcessadasBlocoC[chvNe] = true
      }

      // COD_PART: fornecedor da nota (F + id)
      var fornIdNe = ne.getString('fornecedor_id')
      var codPartNe = ''
      if (fornIdNe) {
        codPartNe = 'F' + fornIdNe
        ctx.registrarParticipante('F', fornIdNe)
      } else {
        ctx.adicionarValidacao(
          'erro',
          'Nota de entrada nº ' + numNe + ' não possui fornecedor informado.',
          'C100',
          String(numNe),
        )
      }

      // CHV_NFE vazia nos modelos de papel 01, 1B, 04
      var chvNeFinal = modeloNe === '55' ? chvNe : ''

      var dtDocNeSped = SpedFormato.formatarData(
        ne.getString('data_emissao') || ne.getString('data_entrada'),
      )
      var dtEntNeSped = SpedFormato.formatarData(dtEntradaStr)

      var indPgtoNe = String(ne.getInt('indicador_pagamento') || 0)
      if (indPgtoNe !== '0' && indPgtoNe !== '1' && indPgtoNe !== '2') indPgtoNe = '0'

      var indFrtNe = String(ne.getInt('modalidade_frete') || 9)
      if (['0', '1', '2', '3', '4', '9'].indexOf(indFrtNe) === -1) indFrtNe = '9'

      var vlDocNe = round2(ne.getFloat('valor_total') || 0)
      var vlDescNe = round2(ne.getFloat('valor_desconto') || 0)
      var vlMercNe = round2(ne.getFloat('valor_produtos') || 0)
      var vlFrtNe = round2(ne.getFloat('valor_frete') || 0)
      var vlSegNe = round2(ne.getFloat('valor_seguro') || 0)
      var vlOutDaNe = round2(ne.getFloat('valor_outras_despesas') || 0)

      var vlBcIcmsStNe = round2(ne.getFloat('base_icms_st') || 0)
      var vlIcmsStNe = round2(ne.getFloat('valor_icms_st') || 0)

      // Itens de notas_entrada_itens
      var itensNe = []
      try {
        itensNe = $app.findRecordsByFilter(
          'notas_entrada_itens',
          "nota_id = '" + ne.id + "' && ativo = true",
          'numero_item',
          1000,
          0,
        )
      } catch (errItNe) {
        ctx.adicionarValidacao(
          'erro',
          'Falha ao carregar itens da nota de entrada nº ' +
            numNe +
            ': ' +
            (errItNe.message || errItNe),
          'C170',
          String(numNe),
        )
      }

      // Soma de créditos aproveitados nos itens
      var somaCreditoBcIcmsNe = 0
      var somaCreditoIcmsNe = 0
      var somaCreditoIpiNe = 0
      var somaCreditoPisNe = 0
      var somaCreditoCofinsNe = 0
      var somaValorProdutoItensNe = 0

      for (var itC = 0; itC < itensNe.length; itC++) {
        var itChecagem = itensNe[itC]
        somaValorProdutoItensNe = round2(
          somaValorProdutoItensNe + (itChecagem.getFloat('valor_produto') || 0),
        )
        if (itChecagem.getBool('aproveita_credito_icms')) {
          somaCreditoBcIcmsNe = round2(
            somaCreditoBcIcmsNe + (itChecagem.getFloat('base_icms') || 0),
          )
          somaCreditoIcmsNe = round2(
            somaCreditoIcmsNe + (itChecagem.getFloat('valor_credito_icms') || 0),
          )
        }
        if (ehContribuinteIpi && itChecagem.getBool('aproveita_credito_ipi')) {
          somaCreditoIpiNe = round2(
            somaCreditoIpiNe + (itChecagem.getFloat('valor_credito_ipi') || 0),
          )
        }
        var cPis = round2(itChecagem.getFloat('valor_credito_pis') || 0)
        var cCof = round2(itChecagem.getFloat('valor_credito_cofins') || 0)
        if (cPis > 0) somaCreditoPisNe = round2(somaCreditoPisNe + cPis)
        if (cCof > 0) somaCreditoCofinsNe = round2(somaCreditoCofinsNe + cCof)
      }

      // Contabiliza resumo de entradas
      totalCompras++
      totalVlDocEntrada = round2(totalVlDocEntrada + vlDocNe)
      totalVlCreditoIcms = round2(totalVlCreditoIcms + somaCreditoIcmsNe)

      // C100 da Nota de Entrada
      c100Linhas.push(
        SpedFormato.montarLinha([
          'C100',
          '0', // IND_OPER 0 (entrada)
          '1', // IND_EMIT 1 (terceiros)
          codPartNe,
          modeloNe,
          codSitNe,
          serNe,
          String(numNe),
          chvNeFinal,
          dtDocNeSped,
          dtEntNeSped,
          SpedFormato.formatarValor(vlDocNe),
          indPgtoNe,
          SpedFormato.formatarValor(vlDescNe),
          '0,00', // VL_ABAT_NT
          SpedFormato.formatarValor(vlMercNe),
          indFrtNe,
          SpedFormato.formatarValor(vlFrtNe),
          SpedFormato.formatarValor(vlSegNe),
          SpedFormato.formatarValor(vlOutDaNe),
          SpedFormato.formatarValor(somaCreditoBcIcmsNe),
          SpedFormato.formatarValor(somaCreditoIcmsNe),
          SpedFormato.formatarValor(vlBcIcmsStNe),
          SpedFormato.formatarValor(vlIcmsStNe),
          SpedFormato.formatarValor(somaCreditoIpiNe),
          somaCreditoPisNe > 0 ? SpedFormato.formatarValor(somaCreditoPisNe) : '',
          somaCreditoCofinsNe > 0 ? SpedFormato.formatarValor(somaCreditoCofinsNe) : '',
          '', // VL_PIS_ST
          '', // VL_COFINS_ST
        ]),
      )

      // Rateio proporcional dos totais da nota entre os itens para apuração do VL_OPR no C190
      var totFrtNe = round2(ne.getFloat('valor_frete') || 0)
      var totSegNe = round2(ne.getFloat('valor_seguro') || 0)
      var totOutNe = round2(ne.getFloat('valor_outras_despesas') || 0)
      var totStNe = round2(ne.getFloat('valor_icms_st') || 0)
      var totFcpStNe = round2(ne.getFloat('valor_fcp_st') || 0)
      var totIpiNe = round2(ne.getFloat('valor_ipi') || 0)
      var totDescNe = round2(ne.getFloat('valor_desconto') || 0)

      var itensCalculadosNe = []
      var acumFrtNe = 0
      var acumSegNe = 0
      var acumOutNe = 0
      var acumStNe = 0
      var acumFcpStNe = 0
      var acumIpiNe = 0
      var acumDescNe = 0

      for (var itIdx = 0; itIdx < itensNe.length; itIdx++) {
        var itRec = itensNe[itIdx]
        var numItem = itRec.getInt('numero_item') || itIdx + 1
        var prodIdVinculado = itRec.getString('produto_id')

        if (!prodIdVinculado) {
          ctx.adicionarValidacao(
            'erro',
            'Item ' +
              numItem +
              ' da nota de entrada nº ' +
              numNe +
              ' não possui produto vinculado no catálogo.',
            'C170',
            String(numNe),
          )
        } else {
          ctx.registrarItem(prodIdVinculado)
        }

        var codItemP = ''
        var unidItemP = 'UN'
        if (prodIdVinculado) {
          try {
            var pRec = $app.findRecordById('produtos', prodIdVinculado)
            codItemP = String(pRec.getInt('codigo') || pRec.id)
            var uId = pRec.getString('unidade_id')
            if (uId) {
              try {
                var unP2 = $app.findRecordById('unidades_medida', uId)
                unidItemP = unP2.getString('sigla')
              } catch (_) {
                unidItemP = uId
              }
            }
            ctx.registrarUnidade(unidItemP)
          } catch (_) {
            codItemP = prodIdVinculado
          }
        }

        var qtdEstoque =
          itRec.getFloat('quantidade_estoque') || itRec.getFloat('quantidade_fornecedor') || 0
        var vlProdItem = round2(itRec.getFloat('valor_produto') || 0)
        var vlDescItem = round2(itRec.getFloat('valor_desconto') || 0)

        // Rateio proporcional se os campos do item estiverem zerados mas a nota tiver o total
        var proporcao =
          somaValorProdutoItensNe > 0 ? vlProdItem / somaValorProdutoItensNe : 1 / itensNe.length
        var frtItem = round2(itRec.getFloat('valor_frete') || 0)
        var segItem = round2(itRec.getFloat('valor_seguro') || 0)
        var outItem = round2(itRec.getFloat('valor_outras') || 0)
        var stItem = round2(itRec.getFloat('valor_icms_st') || 0)
        var fcpStItem = round2(itRec.getFloat('valor_fcp_st') || 0)
        var ipiItem = round2(itRec.getFloat('valor_ipi') || 0)

        var ehUltimoItem = itIdx === itensNe.length - 1

        if (totFrtNe > 0 && frtItem === 0) {
          frtItem = ehUltimoItem ? round2(totFrtNe - acumFrtNe) : round2(totFrtNe * proporcao)
        }
        acumFrtNe = round2(acumFrtNe + frtItem)

        if (totSegNe > 0 && segItem === 0) {
          segItem = ehUltimoItem ? round2(totSegNe - acumSegNe) : round2(totSegNe * proporcao)
        }
        acumSegNe = round2(acumSegNe + segItem)

        if (totOutNe > 0 && outItem === 0) {
          outItem = ehUltimoItem ? round2(totOutNe - acumOutNe) : round2(totOutNe * proporcao)
        }
        acumOutNe = round2(acumOutNe + outItem)

        if (totStNe > 0 && stItem === 0) {
          stItem = ehUltimoItem ? round2(totStNe - acumStNe) : round2(totStNe * proporcao)
        }
        acumStNe = round2(acumStNe + stItem)

        if (totFcpStNe > 0 && fcpStItem === 0) {
          fcpStItem = ehUltimoItem
            ? round2(totFcpStNe - acumFcpStNe)
            : round2(totFcpStNe * proporcao)
        }
        acumFcpStNe = round2(acumFcpStNe + fcpStItem)

        if (totIpiNe > 0 && ipiItem === 0) {
          ipiItem = ehUltimoItem ? round2(totIpiNe - acumIpiNe) : round2(totIpiNe * proporcao)
        }
        acumIpiNe = round2(acumIpiNe + ipiItem)

        if (totDescNe > 0 && vlDescItem === 0) {
          vlDescItem = ehUltimoItem ? round2(totDescNe - acumDescNe) : round2(totDescNe * proporcao)
        }
        acumDescNe = round2(acumDescNe + vlDescItem)

        var vlOprItemNe = round2(
          vlProdItem + frtItem + segItem + outItem + stItem + fcpStItem + ipiItem - vlDescItem,
        )

        // CST_ICMS e CFOP de entrada
        var origItemNe = SpedFormato.formatarDigitos(itRec.getString('origem')) || '0'
        var cstEntradaRaw = SpedFormato.formatarDigitos(itRec.getString('cst_icms_entrada'))
        var cstIcmsNe = ''
        if (cstEntradaRaw.length === 3) {
          cstIcmsNe = cstEntradaRaw
        } else if (cstEntradaRaw.length === 2) {
          cstIcmsNe = origItemNe.substring(0, 1) + cstEntradaRaw
        } else {
          var cstFornRaw = SpedFormato.formatarDigitos(itRec.getString('cst_icms_fornecedor'))
          if (cstFornRaw.length >= 2) {
            cstIcmsNe = origItemNe.substring(0, 1) + cstFornRaw.slice(-2)
          } else {
            cstIcmsNe = origItemNe.substring(0, 1) + '00'
          }
        }

        var cfopEntradaNe = SpedFormato.formatarDigitos(itRec.getString('cfop_entrada')) || '1102'

        // Crédito ICMS do item
        var aproveitaCredIcms = itRec.getBool('aproveita_credito_icms')
        var bcIcmsCredItem = aproveitaCredIcms ? round2(itRec.getFloat('base_icms') || 0) : 0
        var aliqIcmsItem = round2(itRec.getFloat('aliquota_icms') || 0)
        var vlIcmsCredItem = aproveitaCredIcms
          ? round2(itRec.getFloat('valor_credito_icms') || 0)
          : 0

        // ST do item
        var bcStItemNe = round2(itRec.getFloat('base_icms_st') || 0)
        var aliqStItemNe = round2(itRec.getFloat('aliquota_icms_st') || 0)
        var vlStItemNe = round2(itRec.getFloat('valor_icms_st') || 0)

        // IPI do item: SÓ se a empresa for contribuinte_ipi
        var sCstIpiNe = ''
        var sCodEnqNe = ''
        var sBcIpiNe = ''
        var sAliqIpiNe = ''
        var sVlIpiNe = ''
        var vlIpiCredItem = 0

        if (ehContribuinteIpi) {
          sCstIpiNe = SpedFormato.formatarDigitos(itRec.getString('cst_ipi')) || '00'
          sCodEnqNe = SpedFormato.formatarTexto(itRec.getString('codigo_enquadramento') || '999', 3)
          var bcIpiNe = round2(itRec.getFloat('base_ipi') || 0)
          var aliqIpiNe = round2(itRec.getFloat('aliquota_ipi') || 0)
          var vIpiCred = itRec.getBool('aproveita_credito_ipi')
            ? round2(itRec.getFloat('valor_credito_ipi') || 0)
            : 0
          vlIpiCredItem = vIpiCred
          sBcIpiNe = bcIpiNe > 0 ? SpedFormato.formatarValor(bcIpiNe) : ''
          sAliqIpiNe = aliqIpiNe > 0 ? SpedFormato.formatarValor(aliqIpiNe) : ''
          sVlIpiNe = vIpiCred > 0 ? SpedFormato.formatarValor(vIpiCred) : ''
        }

        // PIS/COFINS de entrada
        var cstPisNe = SpedFormato.formatarDigitos(itRec.getString('cst_pis_entrada'))
        var cstCofinsNe = SpedFormato.formatarDigitos(itRec.getString('cst_cofins_entrada'))
        var vCredPis = round2(itRec.getFloat('valor_credito_pis') || 0)
        var vCredCofins = round2(itRec.getFloat('valor_credito_cofins') || 0)

        var sBcPisNe = ''
        var sAliqPisNe = ''
        var sVlPisNe = ''
        if (vCredPis > 0) {
          var bcPisNe = round2(itRec.getFloat('base_pis') || vlProdItem)
          var aliqPisNe = round2(itRec.getFloat('aliquota_pis') || 0)
          sBcPisNe = SpedFormato.formatarValor(bcPisNe)
          sAliqPisNe = aliqPisNe > 0 ? SpedFormato.formatarValor(aliqPisNe) : ''
          sVlPisNe = SpedFormato.formatarValor(vCredPis)
        }

        var sBcCofinsNe = ''
        var sAliqCofinsNe = ''
        var sVlCofinsNe = ''
        if (vCredCofins > 0) {
          var bcCofinsNe = round2(itRec.getFloat('base_cofins') || vlProdItem)
          var aliqCofinsNe = round2(itRec.getFloat('aliquota_cofins') || 0)
          sBcCofinsNe = SpedFormato.formatarValor(bcCofinsNe)
          sAliqCofinsNe = aliqCofinsNe > 0 ? SpedFormato.formatarValor(aliqCofinsNe) : ''
          sVlCofinsNe = SpedFormato.formatarValor(vCredCofins)
        }

        // C170 do item da nota de entrada
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C170',
            String(numItem),
            codItemP,
            '', // DESCR_COMPL
            SpedFormato.formatarQuantidade(qtdEstoque, 5),
            SpedFormato.formatarTexto(unidItemP, 6),
            SpedFormato.formatarValor(vlProdItem),
            vlDescItem > 0 ? SpedFormato.formatarValor(vlDescItem) : '',
            '0', // IND_MOV 0 (movimentação física do item)
            cstIcmsNe,
            cfopEntradaNe,
            '', // COD_NAT
            bcIcmsCredItem > 0 ? SpedFormato.formatarValor(bcIcmsCredItem) : '',
            aliqIcmsItem > 0 ? SpedFormato.formatarValor(aliqIcmsItem) : '',
            vlIcmsCredItem > 0 ? SpedFormato.formatarValor(vlIcmsCredItem) : '',
            bcStItemNe > 0 ? SpedFormato.formatarValor(bcStItemNe) : '',
            aliqStItemNe > 0 ? SpedFormato.formatarValor(aliqStItemNe) : '',
            vlStItemNe > 0 ? SpedFormato.formatarValor(vlStItemNe) : '',
            '0', // IND_APUR 0
            sCstIpiNe,
            sCodEnqNe,
            sBcIpiNe,
            sAliqIpiNe,
            sVlIpiNe,
            cstPisNe,
            sBcPisNe,
            sAliqPisNe,
            '', // QUANT_BC_PIS
            '', // ALIQ_PIS_QUANT
            sVlPisNe,
            cstCofinsNe,
            sBcCofinsNe,
            sAliqCofinsNe,
            '', // QUANT_BC_COFINS
            '', // ALIQ_COFINS_QUANT
            sVlCofinsNe,
            '', // COD_CTA
            '0,00', // VL_ABAT_NT
          ]),
        )

        itensCalculadosNe.push({
          cst: cstIcmsNe,
          cfop: cfopEntradaNe,
          aliqIcms: aliqIcmsItem,
          vlOpr: vlOprItemNe,
          vlBcIcms: bcIcmsCredItem,
          vlIcms: vlIcmsCredItem,
          vlBcSt: bcStItemNe,
          vlSt: vlStItemNe,
          vlIpi: vlIpiCredItem,
        })
      }

      // Agrupamento C190 para a Nota de Entrada
      var gruposC190Ne = {}
      var somaVlOprNe = 0

      for (var ig = 0; ig < itensCalculadosNe.length; ig++) {
        var itc = itensCalculadosNe[ig]
        var chvG = itc.cst + '|' + itc.cfop + '|' + itc.aliqIcms.toFixed(2)
        if (!gruposC190Ne[chvG]) {
          gruposC190Ne[chvG] = {
            cst: itc.cst,
            cfop: itc.cfop,
            aliqIcms: itc.aliqIcms,
            vlOpr: 0,
            vlBcIcms: 0,
            vlIcms: 0,
            vlBcSt: 0,
            vlSt: 0,
            vlRedBc: 0,
            vlIpi: 0,
          }
        }
        var gNe = gruposC190Ne[chvG]
        gNe.vlOpr = round2(gNe.vlOpr + itc.vlOpr)
        gNe.vlBcIcms = round2(gNe.vlBcIcms + itc.vlBcIcms)
        gNe.vlIcms = round2(gNe.vlIcms + itc.vlIcms)
        gNe.vlBcSt = round2(gNe.vlBcSt + itc.vlBcSt)
        gNe.vlSt = round2(gNe.vlSt + itc.vlSt)
        gNe.vlIpi = round2(gNe.vlIpi + itc.vlIpi)
      }

      // Ajuste de centavos no último grupo do documento para bater exatamente o crédito do C100
      var listaChavesGNe = Object.keys(gruposC190Ne).sort()
      var somaVlIcmsGruposNe = 0
      for (var kg = 0; kg < listaChavesGNe.length; kg++) {
        somaVlIcmsGruposNe = round2(somaVlIcmsGruposNe + gruposC190Ne[listaChavesGNe[kg]].vlIcms)
      }
      var difIcmsNe = round2(somaCreditoIcmsNe - somaVlIcmsGruposNe)
      if (listaChavesGNe.length > 0 && Math.abs(difIcmsNe) > 0 && Math.abs(difIcmsNe) <= 0.05) {
        var ultG = gruposC190Ne[listaChavesGNe[listaChavesGNe.length - 1]]
        ultG.vlIcms = round2(ultG.vlIcms + difIcmsNe)
      }

      // Emite linhas C190
      for (var cgNe = 0; cgNe < listaChavesGNe.length; cgNe++) {
        var grpNe = gruposC190Ne[listaChavesGNe[cgNe]]
        somaVlOprNe = round2(somaVlOprNe + grpNe.vlOpr)

        c100Linhas.push(
          SpedFormato.montarLinha([
            'C190',
            grpNe.cst,
            grpNe.cfop,
            grpNe.aliqIcms > 0 ? SpedFormato.formatarValor(grpNe.aliqIcms) : '',
            SpedFormato.formatarValor(grpNe.vlOpr),
            SpedFormato.formatarValor(grpNe.vlBcIcms),
            SpedFormato.formatarValor(grpNe.vlIcms),
            SpedFormato.formatarValor(grpNe.vlBcSt),
            SpedFormato.formatarValor(grpNe.vlSt),
            SpedFormato.formatarValor(grpNe.vlRedBc),
            SpedFormato.formatarValor(grpNe.vlIpi),
            '', // COD_OBS
          ]),
        )

        c190Registros.push({
          indOper: '0',
          cst: grpNe.cst,
          cfop: grpNe.cfop,
          aliqIcms: grpNe.aliqIcms,
          vlOpr: grpNe.vlOpr,
          vlBcIcms: grpNe.vlBcIcms,
          vlIcms: grpNe.vlIcms,
          vlBcIcmsSt: grpNe.vlBcSt,
          vlIcmsSt: grpNe.vlSt,
          vlRedBc: grpNe.vlRedBc,
          vlIpi: grpNe.vlIpi,
        })
      }

      // Batimento: soma VL_OPR vs VL_DOC (diferença > 0,01: aviso)
      var difVlOprNe = Math.abs(round2(somaVlOprNe - vlDocNe))
      if (itensNe.length > 0 && difVlOprNe > 0.01) {
        ctx.adicionarValidacao(
          'aviso',
          'Soma do valor das operações dos registros analíticos C190 (R$ ' +
            somaVlOprNe.toFixed(2) +
            ') diverge do VL_DOC da nota de entrada nº ' +
            numNe +
            ' (R$ ' +
            vlDocNe.toFixed(2) +
            ').',
          'C190',
          String(numNe),
        )
      }
    }

    // --- ENTRADAS 2: TRANSFERÊNCIAS RECEBIDAS ---
    // documentos_fiscais com origem "Transferência" (ou "Transferencia"), status "Autorizada" ou "Cancelada",
    // cuja transferência vinculada (transferencia_id) tenha como destino a empresa do arquivo
    var docsTrfBrutos = []
    try {
      docsTrfBrutos = $app.findRecordsByFilter(
        'documentos_fiscais',
        "(origem = 'Transferência' || origem = 'Transferencia') && transferencia_id != '' && (status = 'Autorizada' || status = 'Cancelada') && ativo = true",
        'data_emissao,numero',
        5000,
        0,
      )
    } catch (errTrfDocs) {
      ctx.adicionarValidacao(
        'aviso',
        'Falha ao carregar documentos fiscais de transferência: ' +
          (errTrfDocs.message || errTrfDocs),
        'C100',
      )
    }

    for (var trfIdx = 0; trfIdx < docsTrfBrutos.length; trfIdx++) {
      var docTrf = docsTrfBrutos[trfIdx]
      var trfId = docTrf.getString('transferencia_id')
      if (!trfId) continue

      var trfRec = null
      try {
        trfRec = $app.findRecordById('transferencias', trfId)
      } catch (_) {
        continue
      }
      if (!trfRec) continue

      // Destino deve ser a empresa do arquivo
      var empDestId = trfRec.getString('empresa_destino_id')
      if (empDestId !== empresaId) {
        continue
      }

      // Data de emissão no horário de Brasília dentro do período
      var dtEmissaoTrfStr = docTrf.getString('data_emissao') || docTrf.getString('created')
      var dtTrfBsb = extrairDataBrasilia(dtEmissaoTrfStr)
      if (!dtTrfBsb) continue
      if (dtTrfBsb.ano !== ctx.ano || dtTrfBsb.mes !== ctx.mes) continue

      // Ambiente: modo Oficial só Produção; modo Teste inclui Homologação se incluir_homologacao_em_teste
      var ambTrf = docTrf.getString('ambiente') || 'Homologação'
      if (ctx.modo === 'Oficial') {
        if (ambTrf !== 'Produção') continue
      } else {
        if (ambTrf !== 'Produção' && !incluirHomologacaoEmTeste) continue
      }

      // Se a MESMA chave de acesso já estiver processada (ex: em notas_entrada ou emissão anterior), NÃO repetir
      var chvTrf = SpedFormato.formatarDigitos(docTrf.getString('chave_acesso'))
      if (chvTrf && chavesProcessadasBlocoC[chvTrf]) {
        continue
      }
      if (chvTrf) {
        chavesProcessadasBlocoC[chvTrf] = true
      }

      var stTrf = docTrf.getString('status')
      var modTrf = docTrf.getString('modelo') || '55'
      var serTrf = docTrf.getString('serie') || '1'
      var numTrf = docTrf.getInt('numero') || 0

      // COD_PART = empresa de ORIGEM (E + id)
      var empOrigId = trfRec.getString('empresa_origem_id') || docTrf.getString('empresa_id')
      var codPartTrf = ''
      if (empOrigId) {
        codPartTrf = 'E' + empOrigId
        ctx.registrarParticipante('E', empOrigId)
      }

      // Se cancelada: COD_SIT 02 e só os campos de identificação
      if (stTrf === 'Cancelada') {
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C100',
            '0', // IND_OPER 0
            '1', // IND_EMIT 1
            codPartTrf,
            modTrf,
            '02', // COD_SIT 02
            serTrf,
            String(numTrf),
            chvTrf,
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

      // Transferência Autorizada
      var dtEmissaoTrfSped = SpedFormato.formatarData(dtEmissaoTrfStr)
      var dtEntradaTrfStr = trfRec.getString('data_recebimento') || dtEmissaoTrfStr
      var dtEntradaTrfSped = SpedFormato.formatarData(dtEntradaTrfStr)

      var vlDocTrf = round2(docTrf.getFloat('valor_total') || 0)
      var vlDescTrf = round2(docTrf.getFloat('valor_desconto') || 0)
      var vlMercTrf = round2(docTrf.getFloat('valor_produtos') || 0)
      var vlFrtTrf = round2(docTrf.getFloat('valor_frete') || 0)
      var vlSegTrf = round2(docTrf.getFloat('valor_seguro') || 0)
      var vlOutDaTrf = round2(docTrf.getFloat('valor_outras_despesas') || 0)

      var vlBcIcmsTrf = round2(docTrf.getFloat('base_icms') || 0)
      var vlIcmsTrf = round2(docTrf.getFloat('valor_icms') || 0)
      var vlBcIcmsStTrf = round2(docTrf.getFloat('base_icms_st') || 0)
      var vlIcmsStTrf = round2(docTrf.getFloat('valor_icms_st') || 0)
      var vlIpiTrf = round2(docTrf.getFloat('valor_ipi') || 0)
      var vlPisTrf = round2(docTrf.getFloat('valor_pis') || 0)
      var vlCofinsTrf = round2(docTrf.getFloat('valor_cofins') || 0)

      // Contabiliza resumo de entradas
      totalTransferenciasRecebidas++
      totalVlDocEntrada = round2(totalVlDocEntrada + vlDocTrf)
      totalVlCreditoIcms = round2(totalVlCreditoIcms + vlIcmsTrf)

      // C100 da Transferência Recebida
      c100Linhas.push(
        SpedFormato.montarLinha([
          'C100',
          '0', // IND_OPER 0
          '1', // IND_EMIT 1
          codPartTrf,
          modTrf,
          '00', // COD_SIT 00
          serTrf,
          String(numTrf),
          chvTrf,
          dtEmissaoTrfSped,
          dtEntradaTrfSped,
          SpedFormato.formatarValor(vlDocTrf),
          '2', // IND_PGTO 2 (outros/sem pagamento mercantil)
          SpedFormato.formatarValor(vlDescTrf),
          '0,00', // VL_ABAT_NT
          SpedFormato.formatarValor(vlMercTrf),
          '9', // IND_FRT
          SpedFormato.formatarValor(vlFrtTrf),
          SpedFormato.formatarValor(vlSegTrf),
          SpedFormato.formatarValor(vlOutDaTrf),
          SpedFormato.formatarValor(vlBcIcmsTrf),
          SpedFormato.formatarValor(vlIcmsTrf),
          SpedFormato.formatarValor(vlBcIcmsStTrf),
          SpedFormato.formatarValor(vlIcmsStTrf),
          SpedFormato.formatarValor(vlIpiTrf),
          vlPisTrf > 0 ? SpedFormato.formatarValor(vlPisTrf) : '',
          vlCofinsTrf > 0 ? SpedFormato.formatarValor(vlCofinsTrf) : '',
          '', // VL_PIS_ST
          '', // VL_COFINS_ST
        ]),
      )

      // Itens de documentos_fiscais_itens da transferência
      var itensDocTrf = []
      try {
        itensDocTrf = $app.findRecordsByFilter(
          'documentos_fiscais_itens',
          "documento_id = '" + docTrf.id + "'",
          'item',
          500,
          0,
        )
      } catch (errItTrf) {
        ctx.adicionarValidacao(
          'erro',
          'Falha ao carregar itens da transferência nº ' +
            numTrf +
            ': ' +
            (errItTrf.message || errItTrf),
          'C170',
          String(numTrf),
        )
      }

      var gruposC190Trf = {}
      var somaVlOprTrf = 0

      for (var itTrfIdx = 0; itTrfIdx < itensDocTrf.length; itTrfIdx++) {
        var itTrf = itensDocTrf[itTrfIdx]
        var numItemTrf = itTrf.getInt('item') || itTrfIdx + 1
        var prodIdTrf = itTrf.getString('produto_id')

        if (prodIdTrf) {
          ctx.registrarItem(prodIdTrf)
        }

        var codItemTrf = ''
        var unidItemTrf = 'UN'
        if (prodIdTrf) {
          try {
            var pTrf = $app.findRecordById('produtos', prodIdTrf)
            codItemTrf = String(pTrf.getInt('codigo') || pTrf.id)
            var uTrfId = pTrf.getString('unidade_id')
            if (uTrfId) {
              try {
                var unTrfRec = $app.findRecordById('unidades_medida', uTrfId)
                unidItemTrf = unTrfRec.getString('sigla')
              } catch (_) {
                unidItemTrf = uTrfId
              }
            }
            ctx.registrarUnidade(unidItemTrf)
          } catch (_) {
            codItemTrf = prodIdTrf
          }
        } else {
          codItemTrf = itTrf.getString('codigo') || String(numItemTrf)
        }

        var qtdTrf = itTrf.getFloat('quantidade') || 0
        var vlBrutoTrf = round2(itTrf.getFloat('valor_bruto') || itTrf.getFloat('valor_total') || 0)
        var vlDescItTrf = round2(itTrf.getFloat('valor_desconto') || 0)

        // CST_ICMS de entrada: mesmo CST do item (origem + cst_icms)
        var origTrf = SpedFormato.formatarDigitos(itTrf.getString('origem')) || '0'
        var cstSaidaTrf = SpedFormato.formatarDigitos(itTrf.getString('cst_icms'))
        if (!cstSaidaTrf) {
          var csosnTrf = SpedFormato.formatarDigitos(itTrf.getString('csosn'))
          cstSaidaTrf = csosnTrf.length >= 2 ? csosnTrf.slice(-2) : '00'
        }
        if (cstSaidaTrf.length === 1) cstSaidaTrf = '0' + cstSaidaTrf
        var cstEntradaTrf = origTrf.substring(0, 1) + cstSaidaTrf

        // CFOP de entrada: 5152->1152, 5409->1409, 6152->2152 (5->1 e 6->2, mantendo os três últimos)
        var cfopSaidaTrf = SpedFormato.formatarDigitos(itTrf.getString('cfop')) || '5152'
        var cfopEntradaTrf = cfopSaidaTrf
        if (cfopSaidaTrf.length === 4) {
          var primeiroDigito = cfopSaidaTrf.charAt(0)
          if (primeiroDigito === '5') {
            cfopEntradaTrf = '1' + cfopSaidaTrf.substring(1)
          } else if (primeiroDigito === '6') {
            cfopEntradaTrf = '2' + cfopSaidaTrf.substring(1)
          }
        }

        // Crédito de ICMS = ICMS destacado na nota de transferência
        var bcIcmsItTrf = round2(itTrf.getFloat('base_icms') || 0)
        var aliqIcmsItTrf = round2(itTrf.getFloat('aliquota_icms') || 0)
        var vlIcmsItTrf = round2(itTrf.getFloat('valor_icms') || 0)

        var bcStItTrf = round2(itTrf.getFloat('base_icms_st') || 0)
        var aliqStItTrf = round2(itTrf.getFloat('aliquota_icms_st') || 0)
        var vlStItTrf = round2(itTrf.getFloat('valor_icms_st') || 0)
        var fcpStItTrf = round2(itTrf.getFloat('valor_fcp_st') || 0)

        // IPI da transferência
        var vlIpiItTrf = round2(itTrf.getFloat('valor_ipi') || 0)
        var sCstIpiTrf = ''
        var sCodEnqTrf = ''
        var sBcIpiTrf = ''
        var sAliqIpiTrf = ''
        var sVlIpiTrf = ''
        if (ehContribuinteIpi && vlIpiItTrf > 0) {
          sCstIpiTrf = SpedFormato.formatarDigitos(itTrf.getString('cst_ipi')) || '00'
          sCodEnqTrf = SpedFormato.formatarTexto(
            itTrf.getString('codigo_enquadramento_ipi') || '999',
            3,
          )
          var bcIpiTrf = round2(itTrf.getFloat('base_ipi') || 0)
          var aliqIpiTrf = round2(itTrf.getFloat('aliquota_ipi') || 0)
          sBcIpiTrf = bcIpiTrf > 0 ? SpedFormato.formatarValor(bcIpiTrf) : ''
          sAliqIpiTrf = aliqIpiTrf > 0 ? SpedFormato.formatarValor(aliqIpiTrf) : ''
          sVlIpiTrf = SpedFormato.formatarValor(vlIpiItTrf)
        }

        // VL_OPR do item: valor do item + frete, seguro, outras despesas, ST, FCP ST e IPI menos desconto
        var frtItTrf = round2(itTrf.getFloat('valor_frete') || 0)
        var outItTrf = round2(itTrf.getFloat('valor_outras') || 0)
        var vlOprItTrf = round2(
          vlBrutoTrf + frtItTrf + outItTrf + vlStItTrf + fcpStItTrf + vlIpiItTrf - vlDescItTrf,
        )

        // C170 da transferência recebida
        c100Linhas.push(
          SpedFormato.montarLinha([
            'C170',
            String(numItemTrf),
            codItemTrf,
            '', // DESCR_COMPL
            SpedFormato.formatarQuantidade(qtdTrf, 5),
            SpedFormato.formatarTexto(unidItemTrf, 6),
            SpedFormato.formatarValor(vlBrutoTrf),
            vlDescItTrf > 0 ? SpedFormato.formatarValor(vlDescItTrf) : '',
            '0', // IND_MOV 0
            cstEntradaTrf,
            cfopEntradaTrf,
            '', // COD_NAT
            bcIcmsItTrf > 0 ? SpedFormato.formatarValor(bcIcmsItTrf) : '',
            aliqIcmsItTrf > 0 ? SpedFormato.formatarValor(aliqIcmsItTrf) : '',
            vlIcmsItTrf > 0 ? SpedFormato.formatarValor(vlIcmsItTrf) : '',
            bcStItTrf > 0 ? SpedFormato.formatarValor(bcStItTrf) : '',
            aliqStItTrf > 0 ? SpedFormato.formatarValor(aliqStItTrf) : '',
            vlStItTrf > 0 ? SpedFormato.formatarValor(vlStItTrf) : '',
            '0', // IND_APUR 0
            sCstIpiTrf,
            sCodEnqTrf,
            sBcIpiTrf,
            sAliqIpiTrf,
            sVlIpiTrf,
            '', // CST_PIS
            '', // VL_BC_PIS
            '', // ALIQ_PIS
            '', // QUANT_BC_PIS
            '', // ALIQ_PIS_QUANT
            '', // VL_PIS
            '', // CST_COFINS
            '', // VL_BC_COFINS
            '', // ALIQ_COFINS
            '', // QUANT_BC_COFINS
            '', // ALIQ_COFINS_QUANT
            '', // VL_COFINS
            '', // COD_CTA
            '0,00', // VL_ABAT_NT
          ]),
        )

        // Agrupamento C190 da transferência
        var chvGTrf = cstEntradaTrf + '|' + cfopEntradaTrf + '|' + aliqIcmsItTrf.toFixed(2)
        if (!gruposC190Trf[chvGTrf]) {
          gruposC190Trf[chvGTrf] = {
            cst: cstEntradaTrf,
            cfop: cfopEntradaTrf,
            aliqIcms: aliqIcmsItTrf,
            vlOpr: 0,
            vlBcIcms: 0,
            vlIcms: 0,
            vlBcSt: 0,
            vlSt: 0,
            vlRedBc: 0,
            vlIpi: 0,
          }
        }
        var gTrf = gruposC190Trf[chvGTrf]
        gTrf.vlOpr = round2(gTrf.vlOpr + vlOprItTrf)
        gTrf.vlBcIcms = round2(gTrf.vlBcIcms + bcIcmsItTrf)
        gTrf.vlIcms = round2(gTrf.vlIcms + vlIcmsItTrf)
        gTrf.vlBcSt = round2(gTrf.vlBcSt + bcStItTrf)
        gTrf.vlSt = round2(gTrf.vlSt + vlStItTrf)
        gTrf.vlIpi = round2(gTrf.vlIpi + vlIpiItTrf)
      }

      // Ajuste de centavos no último grupo do documento para bater o crédito do C100
      var listaChavesGTrf = Object.keys(gruposC190Trf).sort()
      var somaVlIcmsGruposTrf = 0
      for (var kgt = 0; kgt < listaChavesGTrf.length; kgt++) {
        somaVlIcmsGruposTrf = round2(
          somaVlIcmsGruposTrf + gruposC190Trf[listaChavesGTrf[kgt]].vlIcms,
        )
      }
      var difIcmsTrf = round2(vlIcmsTrf - somaVlIcmsGruposTrf)
      if (listaChavesGTrf.length > 0 && Math.abs(difIcmsTrf) > 0 && Math.abs(difIcmsTrf) <= 0.05) {
        var ultGTrf = gruposC190Trf[listaChavesGTrf[listaChavesGTrf.length - 1]]
        ultGTrf.vlIcms = round2(ultGTrf.vlIcms + difIcmsTrf)
      }

      // Monta as linhas C190 para a transferência recebida
      for (var cgTrf = 0; cgTrf < listaChavesGTrf.length; cgTrf++) {
        var grpTrf = gruposC190Trf[listaChavesGTrf[cgTrf]]
        somaVlOprTrf = round2(somaVlOprTrf + grpTrf.vlOpr)

        c100Linhas.push(
          SpedFormato.montarLinha([
            'C190',
            grpTrf.cst,
            grpTrf.cfop,
            grpTrf.aliqIcms > 0 ? SpedFormato.formatarValor(grpTrf.aliqIcms) : '',
            SpedFormato.formatarValor(grpTrf.vlOpr),
            SpedFormato.formatarValor(grpTrf.vlBcIcms),
            SpedFormato.formatarValor(grpTrf.vlIcms),
            SpedFormato.formatarValor(grpTrf.vlBcSt),
            SpedFormato.formatarValor(grpTrf.vlSt),
            SpedFormato.formatarValor(grpTrf.vlRedBc),
            SpedFormato.formatarValor(grpTrf.vlIpi),
            '', // COD_OBS
          ]),
        )

        c190Registros.push({
          indOper: '0',
          cst: grpTrf.cst,
          cfop: grpTrf.cfop,
          aliqIcms: grpTrf.aliqIcms,
          vlOpr: grpTrf.vlOpr,
          vlBcIcms: grpTrf.vlBcIcms,
          vlIcms: grpTrf.vlIcms,
          vlBcIcmsSt: grpTrf.vlBcSt,
          vlIcmsSt: grpTrf.vlSt,
          vlRedBc: grpTrf.vlRedBc,
          vlIpi: grpTrf.vlIpi,
        })
      }

      var difVlOprTrf = Math.abs(round2(somaVlOprTrf - vlDocTrf))
      if (itensDocTrf.length > 0 && difVlOprTrf > 0.01) {
        ctx.adicionarValidacao(
          'aviso',
          'Soma do valor das operações dos registros analíticos C190 (R$ ' +
            somaVlOprTrf.toFixed(2) +
            ') diverge do VL_DOC da transferência recebida nº ' +
            numTrf +
            ' (R$ ' +
            vlDocTrf.toFixed(2) +
            ').',
          'C190',
          String(numTrf),
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

    // Guarda o resumo de entradas no contexto para ser salvo em sped_arquivos
    ctx.resumoEntrada = {
      total_compras: totalCompras,
      total_transferencias: totalTransferenciasRecebidas,
      total_vl_doc: totalVlDocEntrada,
      total_credito_icms: totalVlCreditoIcms,
    }

    // Disponibiliza os registros analíticos e de DIFAL para o Bloco E em memória
    ctx.c190Registros = c190Registros
    ctx.c101Registros = c101Registros

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

  // --- BLOCO E (Apuração do ICMS e DIFAL) ---
  function gerarBlocoE(ctx) {
    var linhas = []
    var empresaId = ctx.empresa.id
    var periodoStr = ctx.periodo // 'AAAA-MM'
    var dtIni = ctx.dtIniSped
    var dtFin = ctx.dtFinSped
    var cfg = ctx.configSped

    // E001 sempre com IND_MOV "0"
    linhas.push(SpedFormato.montarLinha(['E001', '0']))

    // Registros analíticos C190 coletados em memória
    var c190Lista = ctx.c190Registros || []
    var c101Lista = ctx.c101Registros || []

    // 1. Checagem de ICMS ST nas saídas
    // Algum C190 de saída com VL_ICMS_ST maior que zero: erro
    for (var i = 0; i < c190Lista.length; i++) {
      var rC190 = c190Lista[i]
      var cfopPrim = (rC190.cfop || '').charAt(0)
      var ehSaida =
        rC190.indOper === '1' || cfopPrim === '5' || cfopPrim === '6' || cfopPrim === '7'
      if (ehSaida && round2(rC190.vlIcmsSt) > 0) {
        ctx.adicionarValidacao(
          'erro',
          'há ICMS ST retido nas saídas: a apuração E200/E210 precisa ser feita com o contador',
          'E200',
          rC190.cfop,
        )
        break
      }
    }

    // 2. Cálculo dos Débitos e Créditos a partir dos C190
    var vlTotDebitos = 0
    var vlTotCreditos = 0

    for (var j = 0; j < c190Lista.length; j++) {
      var itemC190 = c190Lista[j]
      var chCfop = (itemC190.cfop || '').charAt(0)
      var valIcms = round2(itemC190.vlIcms || 0)
      if (chCfop === '5' || chCfop === '6' || chCfop === '7') {
        vlTotDebitos = round2(vlTotDebitos + valIcms)
      } else if (chCfop === '1' || chCfop === '2' || chCfop === '3') {
        vlTotCreditos = round2(vlTotCreditos + valIcms)
      }
    }

    var vlAjDebitos = 0 // não usamos C197
    var vlAjCreditos = 0 // não usamos C197

    // 3. Consulta de Ajustes do Período (sped_ajustes_apuracao)
    var ajustesPeriodo = []
    try {
      ajustesPeriodo = $app.findRecordsByFilter(
        'sped_ajustes_apuracao',
        "empresa_id = '" + empresaId + "' && periodo = '" + periodoStr + "'",
        'created',
        500,
        0,
      )
    } catch (errAj) {
      ctx.adicionarValidacao(
        'erro',
        'Falha ao consultar ajustes de apuração: ' + (errAj.message || errAj),
        'E111',
      )
    }

    var vlTotAjDebitos = 0 // 4º caractere = '0'
    var vlEstornosCred = 0 // 4º caractere = '1'
    var vlTotAjCreditos = 0 // 4º caractere = '2'
    var vlEstornosDeb = 0 // 4º caractere = '3'
    var vlTotDed = 0 // 4º caractere = '4'
    var debEsp = 0 // 4º caractere = '5'

    for (var a = 0; a < ajustesPeriodo.length; a++) {
      var ajRec = ajustesPeriodo[a]
      var codAj = (ajRec.getString('codigo_ajuste') || '').trim()
      var valAj = round2(ajRec.getFloat('valor') || 0)
      var quartoChar = codAj.length >= 4 ? codAj.charAt(3) : ''

      if (quartoChar === '0') {
        vlTotAjDebitos = round2(vlTotAjDebitos + valAj)
      } else if (quartoChar === '1') {
        vlEstornosCred = round2(vlEstornosCred + valAj)
      } else if (quartoChar === '2') {
        vlTotAjCreditos = round2(vlTotAjCreditos + valAj)
      } else if (quartoChar === '3') {
        vlEstornosDeb = round2(vlEstornosDeb + valAj)
      } else if (quartoChar === '4') {
        vlTotDed = round2(vlTotDed + valAj)
      } else if (quartoChar === '5') {
        debEsp = round2(debEsp + valAj)
      } else {
        ctx.adicionarValidacao(
          'aviso',
          'Código de ajuste "' +
            codAj +
            '" possui 4º caractere ("' +
            quartoChar +
            '") não mapeado para o E110.',
          'E111',
          codAj,
        )
      }
    }

    // 4. Saldo Credor Anterior
    var vlSldCredorAnt = 0
    var periodoSaldoInicial = cfg ? (cfg.getString('periodo_saldo_inicial') || '').trim() : ''
    var saldoCredorInicialConfig = cfg ? round2(cfg.getFloat('saldo_credor_inicial') || 0) : 0

    var mesAnteriorAno = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano
    var mesAnteriorMes = ctx.mes === 1 ? 12 : ctx.mes - 1
    var periodoAnteriorStr =
      mesAnteriorAno + '-' + (mesAnteriorMes < 10 ? '0' + mesAnteriorMes : String(mesAnteriorMes))

    var achouSaldoAnterior = false

    // Se o período for o periodo_saldo_inicial da config_sped_empresa, usar saldo_credor_inicial
    if (periodoSaldoInicial && periodoSaldoInicial === periodoStr) {
      vlSldCredorAnt = saldoCredorInicialConfig
      achouSaldoAnterior = true
    } else {
      // Busca saldo credor a transportar do arquivo Oficial Entregue do mês anterior (ou último Gerado se nenhum entregue)
      try {
        var arqsAnt = $app.findRecordsByFilter(
          'sped_arquivos',
          "empresa_id = '" +
            empresaId +
            "' && periodo = '" +
            periodoAnteriorStr +
            "' && tipo_escrituracao = '0'",
          '-created',
          10,
          0,
        )

        var arqAlvo = null
        for (var f = 0; f < arqsAnt.length; f++) {
          if (arqsAnt[f].getString('status') === 'Entregue') {
            arqAlvo = arqsAnt[f]
            break
          }
        }
        if (!arqAlvo && arqsAnt.length > 0) {
          arqAlvo = arqsAnt[0]
        }

        if (arqAlvo) {
          var resApur = arqAlvo.get('resumo_apuracao')
          if (resApur) {
            var resParsed = typeof resApur === 'string' ? JSON.parse(resApur) : resApur
            if (
              resParsed &&
              resParsed.icms_proprio &&
              resParsed.icms_proprio.saldo_credor_transportar !== undefined
            ) {
              vlSldCredorAnt = round2(resParsed.icms_proprio.saldo_credor_transportar || 0)
              achouSaldoAnterior = true
            }
          }
        }
      } catch (errAnt) {
        // Ignora erro de busca e segue com checagem de saldo
      }

      if (!achouSaldoAnterior) {
        vlSldCredorAnt = 0
        ctx.adicionarValidacao(
          'aviso',
          'Nenhum arquivo anterior encontrado para obter o saldo credor transportado do mês ' +
            periodoAnteriorStr +
            '. Saldo credor anterior considerado como R$ 0,00.',
          'E110',
        )
      }
    }

    // 5. Cálculo do Resultado da Apuração
    // resultado = (VL_TOT_DEBITOS + VL_AJ_DEBITOS + VL_TOT_AJ_DEBITOS + VL_ESTORNOS_CRED) -
    //             (VL_TOT_CREDITOS + VL_AJ_CREDITOS + VL_TOT_AJ_CREDITOS + VL_ESTORNOS_DEB + VL_SLD_CREDOR_ANT)
    var totalDebitosApur = round2(vlTotDebitos + vlAjDebitos + vlTotAjDebitos + vlEstornosCred)
    var totalCreditosApur = round2(
      vlTotCreditos + vlAjCreditos + vlTotAjCreditos + vlEstornosDeb + vlSldCredorAnt,
    )
    var resultado = round2(totalDebitosApur - totalCreditosApur)

    var vlSldApurado = 0
    var vlIcmsRecolher = 0
    var vlSldCredorTransportar = 0

    if (resultado >= 0) {
      vlSldApurado = resultado
      if (vlTotDed > vlSldApurado) {
        ctx.adicionarValidacao(
          'erro',
          'Total de deduções do ICMS (R$ ' +
            vlTotDed.toFixed(2) +
            ') não pode ser superior ao saldo apurado (R$ ' +
            vlSldApurado.toFixed(2) +
            ').',
          'E110',
        )
        vlIcmsRecolher = 0
      } else {
        vlIcmsRecolher = round2(vlSldApurado - vlTotDed)
      }
      vlSldCredorTransportar = 0
    } else {
      vlSldApurado = 0
      vlIcmsRecolher = 0
      vlSldCredorTransportar = Math.abs(resultado)
    }

    // E100 do período
    linhas.push(SpedFormato.montarLinha(['E100', dtIni, dtFin]))

    // E110
    linhas.push(
      SpedFormato.montarLinha([
        'E110',
        SpedFormato.formatarValor(vlTotDebitos),
        SpedFormato.formatarValor(vlAjDebitos),
        SpedFormato.formatarValor(vlTotAjDebitos),
        SpedFormato.formatarValor(vlEstornosCred),
        SpedFormato.formatarValor(vlTotCreditos),
        SpedFormato.formatarValor(vlAjCreditos),
        SpedFormato.formatarValor(vlTotAjCreditos),
        SpedFormato.formatarValor(vlEstornosDeb),
        SpedFormato.formatarValor(vlSldCredorAnt),
        SpedFormato.formatarValor(vlSldApurado),
        SpedFormato.formatarValor(vlTotDed),
        SpedFormato.formatarValor(vlIcmsRecolher),
        SpedFormato.formatarValor(vlSldCredorTransportar),
        SpedFormato.formatarValor(debEsp),
      ]),
    )

    // E111 para cada ajuste do período (COD_AJ_APUR, DESCR_COMPL_AJ, VL_AJ_APUR) logo após o E110
    for (var k = 0; k < ajustesPeriodo.length; k++) {
      var itemAj = ajustesPeriodo[k]
      var codAjApur = (itemAj.getString('codigo_ajuste') || '').trim()
      var descrComplAj = SpedFormato.formatarTexto(itemAj.getString('descricao_complementar'), 100)
      var vlAjApur = round2(itemAj.getFloat('valor') || 0)

      linhas.push(
        SpedFormato.montarLinha([
          'E111',
          codAjApur,
          descrComplAj,
          SpedFormato.formatarValor(vlAjApur),
        ]),
      )
    }

    // E116 quando VL_ICMS_RECOLHER + DEB_ESP > 0
    var totalRecolherComEsp = round2(vlIcmsRecolher + debEsp)
    if (totalRecolherComEsp > 0) {
      var codRecIcms = cfg ? (cfg.getString('codigo_receita_icms') || '').trim() : ''
      if (!codRecIcms) {
        ctx.adicionarValidacao(
          'erro',
          'Há ICMS a recolher (R$ ' +
            totalRecolherComEsp.toFixed(2) +
            '), mas o código da receita do ICMS (codigo_receita_icms) não está configurado na empresa.',
          'E116',
        )
      }

      var diaVctoIcms = cfg ? cfg.getInt('dia_vencimento_icms') || 10 : 10
      if (diaVctoIcms < 1 || diaVctoIcms > 31) diaVctoIcms = 10

      // Mês seguinte ao período
      var mesSegAno = ctx.mes === 12 ? ctx.ano + 1 : ctx.ano
      var mesSegMes = ctx.mes === 12 ? 1 : ctx.mes + 1
      var ultimoDiaMesSeg = new Date(mesSegAno, mesSegMes, 0).getDate()
      var diaVctoFinal = Math.min(diaVctoIcms, ultimoDiaMesSeg)
      var dtVctoE116 =
        (diaVctoFinal < 10 ? '0' + diaVctoFinal : String(diaVctoFinal)) +
        (mesSegMes < 10 ? '0' + mesSegMes : String(mesSegMes)) +
        String(mesSegAno)

      var mesRefE116 = (ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)) + String(ctx.ano)

      linhas.push(
        SpedFormato.montarLinha([
          'E116',
          '000', // COD_OR "000"
          SpedFormato.formatarValor(totalRecolherComEsp), // VL_OR
          dtVctoE116, // DT_VCTO ddmmaaaa
          codRecIcms, // COD_REC
          '', // NUM_PROC
          '', // IND_PROC
          '', // PROC
          '', // TXT_COMPL
          mesRefE116, // MES_REF mmaaaa
        ]),
      )
    }

    // 6. DIFAL (EC 87) - E300, E310, E316
    // Só quando o Bloco C tiver algum C101 no período
    var difalPorUf = {} // uf -> { debDifal, credDifal, debFcp, credFcp, dtMaisAntigaIso, itens: [] }

    if (c101Lista.length > 0) {
      for (var c1 = 0; c1 < c101Lista.length; c1++) {
        var r101 = c101Lista[c1]
        var ufDest = (r101.uf || '').trim().toUpperCase()
        if (!ufDest || ufDest.length !== 2) {
          ctx.adicionarValidacao(
            'aviso',
            'C101 com DIFAL sem UF de destino identificada. O registro foi desconsiderado na apuração E300.',
            'E300',
          )
          continue
        }

        if (!difalPorUf[ufDest]) {
          difalPorUf[ufDest] = {
            uf: ufDest,
            debDifal: 0,
            credDifal: 0,
            debFcp: 0,
            credFcp: 0,
            dtMaisAntigaIso: r101.dtEmissaoIso || '',
          }
        }

        var objUf = difalPorUf[ufDest]
        if (r101.dtEmissaoIso) {
          if (!objUf.dtMaisAntigaIso || r101.dtEmissaoIso < objUf.dtMaisAntigaIso) {
            objUf.dtMaisAntigaIso = r101.dtEmissaoIso
          }
        }

        if (r101.tipo === 'devolucao_venda') {
          objUf.credDifal = round2(objUf.credDifal + (r101.vlIcmsUfDest || 0))
          objUf.credFcp = round2(objUf.credFcp + (r101.vlFcpUfDest || 0))
        } else {
          objUf.debDifal = round2(objUf.debDifal + (r101.vlIcmsUfDest || 0))
          objUf.debFcp = round2(objUf.debFcp + (r101.vlFcpUfDest || 0))
        }
      }

      var ufsDifal = Object.keys(difalPorUf).sort()
      if (ufsDifal.length > 0) {
        ctx.adicionarValidacao(
          'aviso',
          'DIFAL apurado pelo ERP: o contador confere os códigos de obrigação e de receita antes de transmitir.',
          'E300',
        )
      }

      for (var u = 0; u < ufsDifal.length; u++) {
        var sUf = ufsDifal[u]
        var dUf = difalPorUf[sUf]

        // E300 (UF, DT_INI, DT_FIN)
        linhas.push(SpedFormato.montarLinha(['E300', sUf, dtIni, dtFin]))

        // Cálculo apuração DIFAL
        var resDifal = round2(dUf.debDifal - dUf.credDifal)
        var sldDevAntDifal = 0
        var vlRecolDifal = resDifal > 0 ? resDifal : 0
        var vlSldCredTransportarDifal = resDifal < 0 ? Math.abs(resDifal) : 0

        // Cálculo apuração FCP
        var resFcp = round2(dUf.debFcp - dUf.credFcp)
        var sldDevAntFcp = 0
        var vlRecolFcp = resFcp > 0 ? resFcp : 0
        var vlSldCredTransportarFcp = resFcp < 0 ? Math.abs(resFcp) : 0

        dUf.vlRecolDifal = vlRecolDifal
        dUf.vlSldCredTransportarDifal = vlSldCredTransportarDifal
        dUf.vlRecolFcp = vlRecolFcp
        dUf.vlSldCredTransportarFcp = vlSldCredTransportarFcp

        // E310 com 21 campos na ordem do leiaute
        linhas.push(
          SpedFormato.montarLinha([
            'E310',
            '1', // IND_MOV_FCP_DIFAL (1 - Com operações)
            '0,00', // VL_SLD_CRED_ANT_DIFAL
            SpedFormato.formatarValor(dUf.debDifal), // VL_TOT_DEBITOS_DIFAL
            '0,00', // VL_OUT_DEB_DIFAL
            SpedFormato.formatarValor(dUf.credDifal), // VL_TOT_CREDITOS_DIFAL
            '0,00', // VL_OUT_CRED_DIFAL
            '0,00', // VL_SLD_DEV_ANT_DIFAL
            '0,00', // VL_DEDUCOES_DIFAL
            SpedFormato.formatarValor(vlRecolDifal), // VL_RECOL_DIFAL
            SpedFormato.formatarValor(vlSldCredTransportarDifal), // VL_SLD_CRED_TRANSPORTAR_DIFAL
            '0,00', // DEB_ESP_DIFAL
            // 10 campos FCP
            '0,00', // VL_SLD_CRED_ANT_FCP
            SpedFormato.formatarValor(dUf.debFcp), // VL_TOT_DEB_FCP
            '0,00', // VL_OUT_DEB_FCP
            SpedFormato.formatarValor(dUf.credFcp), // VL_TOT_CRED_FCP
            '0,00', // VL_OUT_CRED_FCP
            '0,00', // VL_SLD_DEV_ANT_FCP
            '0,00', // VL_DEDUCOES_FCP
            SpedFormato.formatarValor(vlRecolFcp), // VL_RECOL_FCP
            SpedFormato.formatarValor(vlSldCredTransportarFcp), // VL_SLD_CRED_TRANSPORTAR_FCP
            '0,00', // DEB_ESP_FCP
          ]),
        )

        // Data de vencimento E316 = data de emissão da nota mais antiga do mês para aquela UF
        var dtVctoE316 = ''
        if (dUf.dtMaisAntigaIso) {
          var partesIso = dUf.dtMaisAntigaIso.split('-')
          if (partesIso.length === 3) {
            dtVctoE316 = partesIso[2] + partesIso[1] + partesIso[0]
          }
        }
        if (!dtVctoE316) {
          dtVctoE316 = dtIni
        }
        var mesRefE316 = (ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)) + String(ctx.ano)

        // E316 por UF quando houver valor a recolher DIFAL ("000")
        if (vlRecolDifal > 0) {
          linhas.push(
            SpedFormato.montarLinha([
              'E316',
              '000', // COD_OR
              SpedFormato.formatarValor(vlRecolDifal),
              dtVctoE316,
              '', // COD_REC vazio
              '', // NUM_PROC
              '', // IND_PROC
              '', // PROC
              '', // TXT_COMPL
              mesRefE316,
            ]),
          )
        }

        // E316 por UF quando houver valor a recolher FCP ("006")
        if (vlRecolFcp > 0) {
          linhas.push(
            SpedFormato.montarLinha([
              'E316',
              '006', // COD_OR
              SpedFormato.formatarValor(vlRecolFcp),
              dtVctoE316,
              '', // COD_REC vazio
              '', // NUM_PROC
              '', // IND_PROC
              '', // PROC
              '', // TXT_COMPL
              mesRefE316,
            ]),
          )
        }
      }
    }

    // 7. Salva o resumo_apuracao no contexto para gravação no registro do arquivo SPED
    ctx.resumoApuracao = {
      icms_proprio: {
        total_debitos: vlTotDebitos,
        ajuste_debitos: vlAjDebitos,
        total_ajuste_debitos: vlTotAjDebitos,
        estorno_creditos: vlEstornosCred,
        total_creditos: vlTotCreditos,
        ajuste_creditos: vlAjCreditos,
        total_ajuste_creditos: vlTotAjCreditos,
        estorno_debitos: vlEstornosDeb,
        saldo_credor_anterior: vlSldCredorAnt,
        saldo_apurado: vlSldApurado,
        total_deducoes: vlTotDed,
        icms_recolher: vlIcmsRecolher,
        saldo_credor_transportar: vlSldCredorTransportar,
        debito_especial: debEsp,
      },
      difal_por_uf: difalPorUf,
    }

    // E990: Encerramento do Bloco E
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

  // --- BLOCO H (Inventário Físico) ---
  function gerarBlocoH(ctx) {
    var linhas = []
    var mesBlocoH = 2 // padrão fevereiro
    var contaContabilEstoque = ''
    if (ctx.configSped) {
      var mbh = ctx.configSped.getInt('mes_bloco_h')
      if (mbh && mbh >= 1 && mbh <= 12) {
        mesBlocoH = mbh
      }
      contaContabilEstoque = (ctx.configSped.getString('conta_contabil_estoque') || '').trim()
    }

    // Só no arquivo do mês mes_bloco_h (padrão 2). Nos outros meses, H001 IND_MOV 1 e H990
    if (ctx.mes !== mesBlocoH) {
      linhas.push(SpedFormato.montarLinha(['H001', '1']))
      var totalLinhasVazio = linhas.length + 1
      linhas.push(SpedFormato.montarLinha(['H990', String(totalLinhasVazio)]))
      return linhas
    }

    // No mês do Bloco H, procure o inventário da empresa com tipo "Anual (Bloco H)",
    // status Finalizado e data_referencia 31/12 do ano anterior
    var anoAnterior = ctx.ano - 1
    var dtRefEsperada = String(anoAnterior) + '-12-31'
    var inventarios = []
    try {
      inventarios = $app.findRecordsByFilter(
        'inventarios',
        "empresa_id = '" +
          ctx.empresa.id +
          "' && tipo = 'Anual (Bloco H)' && status = 'Finalizado' && ativo = true",
        '-created',
        20,
        0,
      )
    } catch (errInv) {
      console.warn('Erro ao buscar inventários:', errInv)
    }

    var invEncontrado = null
    for (var i = 0; i < inventarios.length; i++) {
      var inv = inventarios[i]
      var dtRef = (inv.getString('data_referencia') || '').substring(0, 10)
      if (dtRef === dtRefEsperada) {
        invEncontrado = inv
        break
      }
    }

    // Não existindo: erro "falta o inventário de 31/12"
    if (!invEncontrado) {
      ctx.adicionarValidacao('erro', 'falta o inventário de 31/12', 'H001', dtRefEsperada)
      linhas.push(SpedFormato.montarLinha(['H001', '1']))
      var totLinhasErro = linhas.length + 1
      linhas.push(SpedFormato.montarLinha(['H990', String(totLinhasErro)]))
      return linhas
    }

    // H001 IND_MOV 0
    linhas.push(SpedFormato.montarLinha(['H001', '0']))

    // Sem conta_contabil_estoque: aviso
    if (!contaContabilEstoque) {
      ctx.adicionarValidacao(
        'aviso',
        'o COD_CTA do H010 é exigido de quem tem escrituração contábil; confirme com o contador',
        'H010',
      )
    }

    // Carrega itens do inventário
    var itensInv = []
    try {
      itensInv = $app.findRecordsByFilter(
        'inventarios_itens',
        "inventario_id = '" + invEncontrado.id + "' && ativo = true",
        'created',
        10000,
        0,
      )
    } catch (errItensInv) {
      console.warn('Erro ao carregar itens do inventário:', errItensInv)
    }

    // Agrupa por produto somando lotes e calculando VL_ITEM
    var produtosAgrupados = {}
    for (var j = 0; j < itensInv.length; j++) {
      var itemRec = itensInv[j]
      var prodId = itemRec.getString('produto_id')
      if (!prodId) continue
      var qtdContada = itemRec.getFloat('quantidade_contada') || 0
      var custoUnit = itemRec.getFloat('custo_unitario') || 0

      if (!produtosAgrupados[prodId]) {
        produtosAgrupados[prodId] = {
          produtoId: prodId,
          quantidade: 0,
          custoUnitario: custoUnit,
        }
      }
      produtosAgrupados[prodId].quantidade += qtdContada
      if (custoUnit > 0) {
        produtosAgrupados[prodId].custoUnitario = custoUnit
      }
    }

    // Filtra produtos com quantidade maior que zero
    var chavesProdutos = Object.keys(produtosAgrupados).sort()
    var itensH010 = []
    var somaVlItem = 0

    for (var k = 0; k < chavesProdutos.length; k++) {
      var dadosProd = produtosAgrupados[chavesProdutos[k]]
      if (dadosProd.quantidade <= 0) continue

      var prodRec = null
      try {
        prodRec = $app.findRecordById('produtos', dadosProd.produtoId)
      } catch (_) {}

      var codItem = prodRec ? String(prodRec.getInt('codigo') || prodRec.id) : dadosProd.produtoId
      var unid = 'UN'
      if (prodRec) {
        var unId = prodRec.getString('unidade_id')
        if (unId) {
          try {
            var unRec = $app.findRecordById('unidades_medida', unId)
            unid = unRec.getString('sigla') || 'UN'
          } catch (_) {
            unid = unId
          }
        }
      }

      ctx.registrarItem(dadosProd.produtoId)
      ctx.registrarUnidade(unid)

      var vlUnit = round2(dadosProd.custoUnitario)
      var vlItem = round2(dadosProd.quantidade * dadosProd.custoUnitario)
      somaVlItem = round2(somaVlItem + vlItem)

      itensH010.push({
        codItem: codItem,
        unid: unid,
        qtd: dadosProd.quantidade,
        vlUnit: dadosProd.custoUnitario,
        vlItem: vlItem,
      })
    }

    // DT_INV = data_referencia formatada DDMMAAAA
    var dtInvSped = SpedFormato.formatarData(dtRefEsperada)
    var motInv = '01'
    var motInvCampo = invEncontrado.getString('motivo_bloco_h') || ''
    if (motInvCampo && motInvCampo.length >= 2) {
      motInv = motInvCampo.substring(0, 2)
    }

    // H005: DT_INV, VL_INV, MOT_INV
    linhas.push(
      SpedFormato.montarLinha(['H005', dtInvSped, SpedFormato.formatarValor(somaVlItem), motInv]),
    )

    // H010 por produto com quantidade maior que zero
    // Se estoque zerado em 31/12: H005 com VL_INV 0 e sem H010
    for (var h = 0; h < itensH010.length; h++) {
      var itemH = itensH010[h]
      linhas.push(
        SpedFormato.montarLinha([
          'H010',
          itemH.codItem, // COD_ITEM
          SpedFormato.formatarTexto(itemH.unid, 6), // UNID
          SpedFormato.formatarQuantidade(itemH.qtd, 3), // QTD
          SpedFormato.formatarPrecoUnitario(itemH.vlUnit, 6), // VL_UNIT
          SpedFormato.formatarValor(itemH.vlItem), // VL_ITEM
          '0', // IND_PROP: 0 - Item de propriedade do informante e em seu poder
          '', // COD_PART: vazio
          '', // TXT_COMPL: vazio
          contaContabilEstoque, // COD_CTA
          SpedFormato.formatarValor(itemH.vlItem), // VL_ITEM_IR = VL_ITEM
        ]),
      )
    }

    // H990
    var totalLinhasH = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['H990', String(totalLinhasH)]))
    return linhas
  }

  // --- BLOCO K (Controle da Produção e do Estoque) ---
  function gerarBlocoK(ctx) {
    var linhas = []
    var gerarBlocoKConfig = false
    if (ctx.configSped) {
      gerarBlocoKConfig = ctx.configSped.getBool('gerar_bloco_k') === true
    }

    // Desligado: K001 IND_MOV 1, como hoje
    if (!gerarBlocoKConfig) {
      linhas.push(SpedFormato.montarLinha(['K001', '1']))
      var totalLinhasVazioK = linhas.length + 1
      linhas.push(SpedFormato.montarLinha(['K990', String(totalLinhasVazioK)]))
      return linhas
    }

    // Ligado:
    // K001 IND_MOV 0
    linhas.push(SpedFormato.montarLinha(['K001', '0']))

    // K010 com IND_TP_LEIAUTE 2 (leiaute restrito aos saldos de estoque, usado pelo atacadista)
    linhas.push(SpedFormato.montarLinha(['K010', '2']))

    // Aviso fixo do Bloco K
    ctx.adicionarValidacao(
      'aviso',
      'Bloco K ligado: o contador confirma se a empresa é obrigada e se o leiaute restrito vale para ela',
      'K010',
    )

    // K100 (DT_INI, DT_FIN do período)
    linhas.push(SpedFormato.montarLinha(['K100', ctx.dtIniSped, ctx.dtFinSped]))

    // K200 por produto com saldo diferente de zero no último dia do período
    // Calculado a partir das movimentações de estoque da Etapa 2
    var saldosPorProduto = {}
    try {
      var dataLimiteIso = ctx.dtFinIso + ' 23:59:59'
      var movs = $app.findRecordsByFilter(
        'estoque_movimentos',
        "empresa_id = '" +
          ctx.empresa.id +
          "' && ativo = true && estornado = false && data_movimento <= '" +
          dataLimiteIso +
          "'",
        'data_movimento,id',
        50000,
        0,
      )

      for (var m = 0; m < movs.length; m++) {
        var mov = movs[m]
        var pId = mov.getString('produto_id')
        if (!pId) continue
        var tipoMov = mov.getString('tipo')
        var qtdMov = mov.getFloat('quantidade') || 0

        if (saldosPorProduto[pId] === undefined) {
          saldosPorProduto[pId] = 0
        }

        if (tipoMov === 'Entrada') {
          saldosPorProduto[pId] += qtdMov
        } else if (tipoMov === 'Saída') {
          saldosPorProduto[pId] -= qtdMov
        }
      }
    } catch (errMovs) {
      console.warn('Erro ao consultar movimentacoes de estoque para K200:', errMovs)
    }

    var prodsK = Object.keys(saldosPorProduto).sort()
    for (var pk = 0; pk < prodsK.length; pk++) {
      var prodIdK = prodsK[pk]
      var saldoQtd = round2(saldosPorProduto[prodIdK])
      if (Math.abs(saldoQtd) < 0.0001) continue

      var prodRecK = null
      try {
        prodRecK = $app.findRecordById('produtos', prodIdK)
      } catch (_) {}

      var codItemK = prodRecK ? String(prodRecK.getInt('codigo') || prodRecK.id) : prodIdK

      ctx.registrarItem(prodIdK)

      // K200: DT_EST, COD_ITEM, QTD, IND_EST, COD_PART
      linhas.push(
        SpedFormato.montarLinha([
          'K200',
          ctx.dtFinSped, // DT_EST
          codItemK, // COD_ITEM
          SpedFormato.formatarQuantidade(saldoQtd, 3), // QTD
          '0', // IND_EST: 0 - Estoque de propriedade do informante e em seu poder
          '', // COD_PART: vazio
        ]),
      )
    }

    // K990
    var totalLinhasK = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['K990', String(totalLinhasK)]))
    return linhas
  }

  // --- BLOCO 1 (Outras Informações) ---
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

    // Verifica se a empresa recebeu vendas por cartão, PIX ou marketplace no período
    var recebeuEletronico = false
    try {
      // 1) Busca vendas da empresa no período
      var dtIniFiltro = ctx.dtIniIso + ' 00:00:00'
      var dtFinFiltro = ctx.dtFinIso + ' 23:59:59'
      var vendasPeriodo = $app.findRecordsByFilter(
        'vendas',
        "empresa_id = '" +
          ctx.empresa.id +
          "' && ativo = true && data_venda >= '" +
          dtIniFiltro +
          "' && data_venda <= '" +
          dtFinFiltro +
          "'",
        'created',
        2000,
        0,
      )

      if (vendasPeriodo.length > 0) {
        var vendaIds = vendasPeriodo.map(function (v) {
          return v.id
        })

        // Checa pagamentos das vendas
        for (var vi = 0; vi < vendaIds.length; vi++) {
          var pagtos = $app.findRecordsByFilter(
            'vendas_pagamentos',
            "venda_id = '" + vendaIds[vi] + "' && ativo = true",
            'created',
            50,
            0,
          )
          for (var pi = 0; pi < pagtos.length; pi++) {
            var fpId = pagtos[pi].getString('forma_pagamento_id')
            if (fpId) {
              try {
                var fp = $app.findRecordById('formas_pagamento', fpId)
                var tipoFp = fp.getString('tipo') || ''
                var tPag = fp.getString('codigo_tpag') || ''
                if (
                  tipoFp === 'Cartão de crédito' ||
                  tipoFp === 'Cartão de débito' ||
                  tipoFp === 'PIX' ||
                  tPag === '03' ||
                  tPag === '04' ||
                  tPag === '17'
                ) {
                  recebeuEletronico = true
                  break
                }
              } catch (_) {}
            }
          }
          if (recebeuEletronico) break
        }
      }

      // 2) Checa também contas_receber no período com taxa de cartão ou forma eletrônica
      if (!recebeuEletronico) {
        var titulos = $app.findRecordsByFilter(
          'contas_receber',
          "empresa_id = '" +
            ctx.empresa.id +
            "' && ativo = true && data_emissao >= '" +
            ctx.dtIniIso +
            "' && data_emissao <= '" +
            ctx.dtFinIso +
            "'",
          'created',
          500,
          0,
        )
        for (var tr = 0; tr < titulos.length; tr++) {
          var fppId = titulos[tr].getString('forma_pagamento_prevista_id')
          if (fppId) {
            try {
              var fpp = $app.findRecordById('formas_pagamento', fppId)
              var tipoFpp = fpp.getString('tipo') || ''
              var tPagFpp = fpp.getString('codigo_tpag') || ''
              if (
                tipoFpp === 'Cartão de crédito' ||
                tipoFpp === 'Cartão de débito' ||
                tipoFpp === 'PIX' ||
                tPagFpp === '03' ||
                tPagFpp === '04' ||
                tPagFpp === '17'
              ) {
                recebeuEletronico = true
                break
              }
            } catch (_) {}
          }
        }
      }
    } catch (errEletr) {
      console.warn('Erro ao verificar recebimentos eletronicos:', errEletr)
    }

    if (recebeuEletronico) {
      ctx.adicionarValidacao(
        'aviso',
        'confira com o contador se o registro 1601 (pagamentos eletrônicos) é exigido; o ERP não gera o 1601 nesta versão',
        '1010',
      )
    }

    var totalLinhas1 = linhas.length + 1
    linhas.push(SpedFormato.montarLinha(['1990', String(totalLinhas1)]))
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
    var codFin = ctx.finalidade === '1' ? '1' : '0'
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
  /**
   * Valida dígito verificador de CPF (11 dígitos).
   */
  function validarDVCPF(cpfLimpo) {
    if (!cpfLimpo || cpfLimpo.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false

    var soma = 0
    for (var i = 0; i < 9; i++) {
      soma += parseInt(cpfLimpo.charAt(i), 10) * (10 - i)
    }
    var resto = 11 - (soma % 11)
    var dv1 = resto >= 10 ? 0 : resto
    if (dv1 !== parseInt(cpfLimpo.charAt(9), 10)) return false

    soma = 0
    for (var j = 0; j < 10; j++) {
      soma += parseInt(cpfLimpo.charAt(j), 10) * (11 - j)
    }
    resto = 11 - (soma % 11)
    var dv2 = resto >= 10 ? 0 : resto
    return dv2 === parseInt(cpfLimpo.charAt(10), 10)
  }

  /**
   * Valida dígito verificador de CNPJ numérico ou alfanumérico (14 caracteres).
   */
  function validarDVCNPJ(cnpjLimpo) {
    if (!cnpjLimpo) return false
    var str = String(cnpjLimpo)
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
    if (str.length !== 14) return false

    var raizFilial = str.substring(0, 12)
    if (!/^[0-9A-Z]{12}$/.test(raizFilial)) return false

    var dvEnviado1 = parseInt(str.charAt(12), 10)
    var dvEnviado2 = parseInt(str.charAt(13), 10)
    if (isNaN(dvEnviado1) || isNaN(dvEnviado2)) return false

    var pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    var pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    var soma1 = 0
    for (var i = 0; i < 12; i++) {
      var valAscii = str.charCodeAt(i) - 48
      soma1 += valAscii * pesos1[i]
    }
    var resto1 = soma1 % 11
    var dvCalc1 = resto1 < 2 ? 0 : 11 - resto1
    if (dvCalc1 !== dvEnviado1) return false

    var soma2 = 0
    for (var j = 0; j < 12; j++) {
      var valAscii2 = str.charCodeAt(j) - 48
      soma2 += valAscii2 * pesos2[j]
    }
    soma2 += dvCalc1 * pesos2[12]
    var resto2 = soma2 % 11
    var dvCalc2 = resto2 < 2 ? 0 : 11 - resto2

    return dvCalc2 === dvEnviado2
  }

  /**
   * Executa a validação interna do arquivo SPED (Prompt 7.6a - Item A)
   * antes do fechamento final dos blocos e status:
   *
   * 1. todo COD_PART usado no Bloco C existe em um 0150 (erro);
   *    todo COD_ITEM usado em C170, H010 e K200 existe em um 0200 (erro);
   *    toda unidade usada existe em um 0190 (erro);
   * 2. nenhum 0150, 0190 ou 0200 sobrando sem uso: aviso E RETIRAR do arquivo;
   * 3. CNPJ e CPF dos participantes do 0150 com dígito verificador válido (erro);
   * 5. a mesma chave de acesso não pode aparecer duas vezes (erro);
   * 6. todas as datas DT_DOC das saídas e DT_E_S das entradas dentro do período (erro);
   * 7. soma dos VL_OPR dos C190 de cada C100 contra o VL_DOC do C100 (aviso acima de 0,01);
   * 8. E110 recalculado a partir do arquivo pronto deve bater com o gravado (erro);
   * 9. arquivo acima de 4 MB: aviso.
   *
   * A regra 4 (contagem de cada X990, de cada 9900, do 9990 e do 9999) é conferida
   * contra as linhas reais do arquivo logo após a geração do Bloco 9.
   */
  function executarValidacaoInternaPreFechamento(ctx, linhasBlocosOperacionais) {
    // Conjuntos de referências usadas nos blocos operacionais
    var participantesUsados = {} // COD_PART -> boolean
    var itensUsados = {} // COD_ITEM -> boolean
    var unidadesUsadas = {} // UNID -> boolean
    var chavesAcessoVistas = {} // CHV_NFE -> count

    for (var b = 0; b < linhasBlocosOperacionais.length; b++) {
      var linha = linhasBlocosOperacionais[b]
      if (!linha || linha.charAt(0) !== '|') continue
      var colunas = linha.split('|')
      var reg = colunas[1]

      if (reg === 'C100') {
        var codPart = (colunas[4] || '').trim()
        var chvNfe = (colunas[9] || '').trim()
        var dtDoc = (colunas[10] || '').trim() // DDMMAAAA
        var dtES = (colunas[11] || '').trim() // DDMMAAAA
        var indOper = (colunas[2] || '').trim() // 0 Entrada, 1 Saída
        var numDoc = (colunas[8] || '').trim()

        if (codPart) {
          participantesUsados[codPart] = true
        }

        // Regra 5: mesma chave de acesso não pode aparecer duas vezes (erro)
        if (chvNfe && chvNfe.length === 44) {
          if (chavesAcessoVistas[chvNfe]) {
            ctx.adicionarValidacao(
              'erro',
              'A mesma chave de acesso não pode aparecer duas vezes no arquivo SPED: ' + chvNfe,
              'C100',
              chvNfe,
            )
          } else {
            chavesAcessoVistas[chvNfe] = true
          }
        }

        // Regra 6: todas as datas DT_DOC das saídas e DT_E_S das entradas dentro do período (erro)
        // Período de apuração: MM e AAAA
        var mesStrEsperado = ctx.mes < 10 ? '0' + ctx.mes : String(ctx.mes)
        var anoStrEsperado = String(ctx.ano)

        if (indOper === '1') {
          // Saída: valida DT_DOC
          if (dtDoc && dtDoc.length === 8) {
            var mesDoc = dtDoc.substring(2, 4)
            var anoDoc = dtDoc.substring(4, 8)
            if (mesDoc !== mesStrEsperado || anoDoc !== anoStrEsperado) {
              ctx.adicionarValidacao(
                'erro',
                'Data DT_DOC da nota de saída nº ' +
                  numDoc +
                  ' (' +
                  dtDoc +
                  ') está fora do período de apuração (' +
                  ctx.periodo +
                  ').',
                'C100',
                numDoc,
              )
            }
          }
        } else if (indOper === '0') {
          // Entrada: valida DT_E_S
          if (dtES && dtES.length === 8) {
            var mesES = dtES.substring(2, 4)
            var anoES = dtES.substring(4, 8)
            if (mesES !== mesStrEsperado || anoES !== anoStrEsperado) {
              ctx.adicionarValidacao(
                'erro',
                'Data DT_E_S da nota de entrada nº ' +
                  numDoc +
                  ' (' +
                  dtES +
                  ') está fora do período de apuração (' +
                  ctx.periodo +
                  ').',
                'C100',
                numDoc,
              )
            }
          }
        }
      } else if (reg === 'C170') {
        var codItemC170 = (colunas[3] || '').trim()
        var unidC170 = (colunas[6] || '').trim()
        if (codItemC170) itensUsados[codItemC170] = true
        if (unidC170) unidadesUsadas[unidC170] = true
      } else if (reg === 'H010') {
        var codItemH010 = (colunas[2] || '').trim()
        var unidH010 = (colunas[3] || '').trim()
        if (codItemH010) itensUsados[codItemH010] = true
        if (unidH010) unidadesUsadas[unidH010] = true
      } else if (reg === 'K200') {
        var codItemK200 = (colunas[3] || '').trim()
        if (codItemK200) itensUsados[codItemK200] = true
      }
    }

    // Regra 2: Filtrar no contexto participantes, itens e unidades não usados
    // "nenhum 0150, 0190 ou 0200 sobrando sem uso: aviso E RETIRAR do arquivo"
    // Atualizamos os mapas do ctx antes de chamar gerarBloco0
    var chavesPartOriginal = Object.keys(ctx.participantesMap)
    for (var p = 0; p < chavesPartOriginal.length; p++) {
      var itemPart = ctx.participantesMap[chavesPartOriginal[p]]
      var codPartCandidate = itemPart.tipo + itemPart.id
      if (!participantesUsados[codPartCandidate]) {
        ctx.adicionarValidacao(
          'aviso',
          'Participante ' +
            codPartCandidate +
            ' coletado não foi referenciado em nenhum documento e foi retirado do arquivo.',
          '0150',
          codPartCandidate,
        )
        delete ctx.participantesMap[chavesPartOriginal[p]]
      }
    }

    // Itens: mapeia o código cadastral esperado de cada produto_id
    var chavesItensOriginal = Object.keys(ctx.itensMap)
    for (var itk = 0; itk < chavesItensOriginal.length; itk++) {
      var prodIdCand = ctx.itensMap[chavesItensOriginal[itk]]
      var codItemEsperado = prodIdCand
      try {
        var prodRecTemp = $app.findRecordById('produtos', prodIdCand)
        codItemEsperado = String(prodRecTemp.getInt('codigo') || prodRecTemp.id)
      } catch (_) {}

      if (!itensUsados[codItemEsperado] && !itensUsados[prodIdCand]) {
        ctx.adicionarValidacao(
          'aviso',
          'Item ' +
            codItemEsperado +
            ' não foi referenciado em C170, H010 ou K200 e foi retirado do arquivo.',
          '0200',
          codItemEsperado,
        )
        delete ctx.itensMap[chavesItensOriginal[itk]]
      }
    }

    // Unidades:
    var chavesUnidOriginal = Object.keys(ctx.unidadesMap)
    for (var uk = 0; uk < chavesUnidOriginal.length; uk++) {
      var unidCand = ctx.unidadesMap[chavesUnidOriginal[uk]]
      var siglaCand = unidCand
      try {
        if (unidCand.length === 15) {
          var unR = $app.findRecordById('unidades_medida', unidCand)
          siglaCand = unR.getString('sigla') || unidCand
        }
      } catch (_) {}

      if (!unidadesUsadas[siglaCand] && !unidadesUsadas[unidCand]) {
        ctx.adicionarValidacao(
          'aviso',
          'Unidade de medida ' +
            siglaCand +
            ' não foi referenciada em nenhum item e foi retirada do arquivo.',
          '0190',
          siglaCand,
        )
        delete ctx.unidadesMap[chavesUnidOriginal[uk]]
      }
    }

    // Retorna os dados coletados de uso para a checagem pós-Bloco 0
    return {
      participantesUsados: participantesUsados,
      itensUsados: itensUsados,
      unidadesUsadas: unidadesUsadas,
    }
  }

  /**
   * Validação pós-construção do Bloco 0 (Regras 1, 3, 4, 8 e 9).
   */
  function executarValidacaoInternaPosMontagem(ctx, linhasArquivoPronto, dadosUso) {
    var linhas0150 = {} // COD_PART -> { cnpj, cpf }
    var linhas0200 = {} // COD_ITEM -> true
    var linhas0190 = {} // UNID -> true
    var contagemReal = {}

    // Linhas gravadas de cada X990
    var x990Gravado = {}
    var linhas9900 = {}
    var reg9990Gravado = null
    var reg9999Gravado = null

    // Registros E110
    var linhaE110Pronta = null

    for (var i = 0; i < linhasArquivoPronto.length; i++) {
      var l = linhasArquivoPronto[i]
      if (!l || l.charAt(0) !== '|') continue
      var cols = l.split('|')
      var r = cols[1]

      contagemReal[r] = (contagemReal[r] || 0) + 1

      if (r === '0150') {
        var codP = (cols[2] || '').trim()
        var cnpjP = (cols[5] || '').trim()
        var cpfP = (cols[6] || '').trim()
        linhas0150[codP] = { cnpj: cnpjP, cpf: cpfP }
      } else if (r === '0190') {
        var un = (cols[2] || '').trim()
        linhas0190[un] = true
      } else if (r === '0200') {
        var it = (cols[2] || '').trim()
        linhas0200[it] = true
      } else if (r === 'E110') {
        linhaE110Pronta = cols
      } else if (r === '9900') {
        var regApontado = (cols[2] || '').trim()
        var qtdApontada = parseInt((cols[3] || '0').trim(), 10)
        linhas9900[regApontado] = qtdApontada
      } else if (r === '9990') {
        reg9990Gravado = parseInt((cols[2] || '0').trim(), 10)
      } else if (r === '9999') {
        reg9999Gravado = parseInt((cols[2] || '0').trim(), 10)
      } else if (r.length === 4 && r.endsWith('990')) {
        x990Gravado[r] = parseInt((cols[2] || '0').trim(), 10)
      }
    }

    // Regra 1:
    // - todo COD_PART usado no Bloco C existe em um 0150 (erro)
    var partsUsadosLista = Object.keys(dadosUso.participantesUsados || {})
    for (var pu = 0; pu < partsUsadosLista.length; pu++) {
      var cp = partsUsadosLista[pu]
      if (!linhas0150[cp]) {
        ctx.adicionarValidacao(
          'erro',
          'Participante ' + cp + ' utilizado no Bloco C não possui registro 0150 correspondente.',
          '0150',
          cp,
        )
      }
    }

    // - todo COD_ITEM usado em C170, H010 e K200 existe em um 0200 (erro)
    var itensUsadosLista = Object.keys(dadosUso.itensUsados || {})
    for (var iu = 0; iu < itensUsadosLista.length; iu++) {
      var ci = itensUsadosLista[iu]
      if (!linhas0200[ci]) {
        ctx.adicionarValidacao(
          'erro',
          'Item ' + ci + ' utilizado na movimentação não possui registro 0200 correspondente.',
          '0200',
          ci,
        )
      }
    }

    // - toda unidade usada existe em um 0190 (erro)
    var unidUsadasLista = Object.keys(dadosUso.unidadesUsadas || {})
    for (var uu = 0; uu < unidUsadasLista.length; uu++) {
      var cu = unidUsadasLista[uu]
      if (!linhas0190[cu]) {
        ctx.adicionarValidacao(
          'erro',
          'Unidade de medida ' + cu + ' utilizada não possui registro 0190 correspondente.',
          '0190',
          cu,
        )
      }
    }

    // Regra 3: CNPJ e CPF dos participantes do 0150 com dígito verificador válido (erro)
    var codsPart0150 = Object.keys(linhas0150)
    for (var cpIdx = 0; cpIdx < codsPart0150.length; cpIdx++) {
      var codPart0150 = codsPart0150[cpIdx]
      var dadosDocPart = linhas0150[codPart0150]
      if (dadosDocPart.cnpj) {
        if (!validarDVCNPJ(dadosDocPart.cnpj)) {
          ctx.adicionarValidacao(
            'erro',
            'Participante ' +
              codPart0150 +
              ' possui CNPJ com dígito verificador inválido: ' +
              dadosDocPart.cnpj,
            '0150',
            codPart0150,
          )
        }
      } else if (dadosDocPart.cpf) {
        if (!validarDVCPF(dadosDocPart.cpf)) {
          ctx.adicionarValidacao(
            'erro',
            'Participante ' +
              codPart0150 +
              ' possui CPF com dígito verificador inválido: ' +
              dadosDocPart.cpf,
            '0150',
            codPart0150,
          )
        }
      } else {
        ctx.adicionarValidacao(
          'erro',
          'Participante ' + codPart0150 + ' não possui CNPJ nem CPF informado.',
          '0150',
          codPart0150,
        )
      }
    }

    // Regra 4: contagem de cada X990, de cada 9900, do 9990 e do 9999 conferida contra as linhas reais do arquivo (erro)
    // 4.1 Conferência de cada 9900
    var tiposEncontrados = Object.keys(contagemReal)
    for (var te = 0; te < tiposEncontrados.length; te++) {
      var tipoReg = tiposEncontrados[te]
      var qtdReal = contagemReal[tipoReg]
      var qtdInformada9900 = linhas9900[tipoReg]
      if (qtdInformada9900 !== qtdReal) {
        ctx.adicionarValidacao(
          'erro',
          'Contagem do registro 9900 para o tipo ' +
            tipoReg +
            ' (' +
            qtdInformada9900 +
            ') não confere com as linhas reais do arquivo (' +
            qtdReal +
            ').',
          '9900',
          tipoReg,
        )
      }
    }

    // 4.2 Conferência do 9990 (total de linhas do Bloco 9)
    // Bloco 9 é composto por: 9001 + registros 9900 + 9990
    var linhasReaisBloco9 = (contagemReal['9001'] || 0) + (contagemReal['9900'] || 0) + 1
    if (reg9990Gravado !== linhasReaisBloco9) {
      ctx.adicionarValidacao(
        'erro',
        'Registro 9990 (' +
          reg9990Gravado +
          ') não confere com a quantidade real de linhas do Bloco 9 (' +
          linhasReaisBloco9 +
          ').',
        '9990',
        String(reg9990Gravado),
      )
    }

    // 4.3 Conferência do 9999 (total geral de linhas do arquivo pronto)
    var totalRealLinhasArquivo = linhasArquivoPronto.length
    if (reg9999Gravado !== totalRealLinhasArquivo) {
      ctx.adicionarValidacao(
        'erro',
        'Registro 9999 (' +
          reg9999Gravado +
          ') não confere com a quantidade real total de linhas do arquivo (' +
          totalRealLinhasArquivo +
          ').',
        '9999',
        String(reg9999Gravado),
      )
    }

    // 4.4 Conferência de cada X990 contra a contagem real das linhas daquele bloco no arquivo
    // Blocos: 0 (0000 ao 0990), B (B001 ao B990), C (C001 ao C990), D (D001 ao D990),
    // E (E001 ao E990), G (G001 ao G990), H (H001 ao H990), K (K001 ao K990), 1 (1001 ao 1990)
    var blocosPrefixo = [
      { bloco: '0', regEncerramento: '0990' },
      { bloco: 'B', regEncerramento: 'B990' },
      { bloco: 'C', regEncerramento: 'C990' },
      { bloco: 'D', regEncerramento: 'D990' },
      { bloco: 'E', regEncerramento: 'E990' },
      { bloco: 'G', regEncerramento: 'G990' },
      { bloco: 'H', regEncerramento: 'H990' },
      { bloco: 'K', regEncerramento: 'K990' },
      { bloco: '1', regEncerramento: '1990' },
    ]

    for (var bp = 0; bp < blocosPrefixo.length; bp++) {
      var itemBp = blocosPrefixo[bp]
      var bId = itemBp.bloco
      var encReg = itemBp.regEncerramento
      var linhasReaisDoBloco = 0

      for (var lk = 0; lk < linhasArquivoPronto.length; lk++) {
        var lin = linhasArquivoPronto[lk]
        if (!lin || lin.charAt(0) !== '|') continue
        var cod = lin.split('|')[1] || ''
        if (cod.startsWith(bId)) {
          linhasReaisDoBloco++
        }
      }

      var gravadoX990 = x990Gravado[encReg]
      if (gravadoX990 !== undefined && gravadoX990 !== linhasReaisDoBloco) {
        ctx.adicionarValidacao(
          'erro',
          'Registro ' +
            encReg +
            ' (' +
            gravadoX990 +
            ') não confere com a quantidade real de linhas do Bloco ' +
            bId +
            ' (' +
            linhasReaisDoBloco +
            ').',
          encReg,
          String(gravadoX990),
        )
      }
    }

    // Regra 8: E110 recalculado a partir do arquivo pronto deve bater com o gravado (erro)
    // Recalcula somando os C190 presentes nas linhas reais do arquivo pronto e os E111
    if (linhaE110Pronta) {
      var vlTotDebRecalc = 0
      var vlTotCredRecalc = 0
      var vlTotAjDebRecalc = 0
      var vlEstornosCredRecalc = 0
      var vlTotAjCredRecalc = 0
      var vlEstornosDebRecalc = 0
      var vlTotDedRecalc = 0
      var debEspRecalc = 0

      for (var er = 0; er < linhasArquivoPronto.length; er++) {
        var linE = linhasArquivoPronto[er]
        if (!linE || linE.charAt(0) !== '|') continue
        var colsE = linE.split('|')
        var rE = colsE[1]

        if (rE === 'C190') {
          var cfopL = (colsE[3] || '').trim()
          var vlIcmsL = parseFloat(String(colsE[7] || '0').replace(',', '.')) || 0
          var primDig = cfopL.charAt(0)
          if (primDig === '5' || primDig === '6' || primDig === '7') {
            vlTotDebRecalc = round2(vlTotDebRecalc + vlIcmsL)
          } else if (primDig === '1' || primDig === '2' || primDig === '3') {
            vlTotCredRecalc = round2(vlTotCredRecalc + vlIcmsL)
          }
        } else if (rE === 'E111') {
          var codAjL = (colsE[2] || '').trim()
          var valAjL = parseFloat(String(colsE[4] || '0').replace(',', '.')) || 0
          var qChar = codAjL.length >= 4 ? codAjL.charAt(3) : ''
          if (qChar === '0') vlTotAjDebRecalc = round2(vlTotAjDebRecalc + valAjL)
          else if (qChar === '1') vlEstornosCredRecalc = round2(vlEstornosCredRecalc + valAjL)
          else if (qChar === '2') vlTotAjCredRecalc = round2(vlTotAjCredRecalc + valAjL)
          else if (qChar === '3') vlEstornosDebRecalc = round2(vlEstornosDebRecalc + valAjL)
          else if (qChar === '4') vlTotDedRecalc = round2(vlTotDedRecalc + valAjL)
          else if (qChar === '5') debEspRecalc = round2(debEspRecalc + valAjL)
        }
      }

      var gravadoDeb = parseFloat(String(linhaE110Pronta[2] || '0').replace(',', '.')) || 0
      var gravadoCred = parseFloat(String(linhaE110Pronta[6] || '0').replace(',', '.')) || 0
      var gravadoAjDeb = parseFloat(String(linhaE110Pronta[4] || '0').replace(',', '.')) || 0
      var gravadoEstCred = parseFloat(String(linhaE110Pronta[5] || '0').replace(',', '.')) || 0
      var gravadoAjCred = parseFloat(String(linhaE110Pronta[8] || '0').replace(',', '.')) || 0
      var gravadoEstDeb = parseFloat(String(linhaE110Pronta[9] || '0').replace(',', '.')) || 0
      var gravadoSldAnt = parseFloat(String(linhaE110Pronta[10] || '0').replace(',', '.')) || 0
      var gravadoSldApur = parseFloat(String(linhaE110Pronta[11] || '0').replace(',', '.')) || 0
      var gravadoTotDed = parseFloat(String(linhaE110Pronta[12] || '0').replace(',', '.')) || 0
      var gravadoRecolher = parseFloat(String(linhaE110Pronta[13] || '0').replace(',', '.')) || 0
      var gravadoTransportar = parseFloat(String(linhaE110Pronta[14] || '0').replace(',', '.')) || 0
      var gravadoDebEsp = parseFloat(String(linhaE110Pronta[15] || '0').replace(',', '.')) || 0

      // Re-executa fórmula do E110
      var resRecalc = round2(
        vlTotDebRecalc +
          vlTotAjDebRecalc +
          vlEstornosCredRecalc -
          (vlTotCredRecalc + vlTotAjCredRecalc + vlEstornosDebRecalc + gravadoSldAnt),
      )
      var sldApurRecalc = resRecalc >= 0 ? resRecalc : 0
      var sldTranspRecalc = resRecalc < 0 ? Math.abs(resRecalc) : 0
      var recolherRecalc = resRecalc >= 0 ? Math.max(0, round2(sldApurRecalc - vlTotDedRecalc)) : 0

      var difDeb = Math.abs(round2(gravadoDeb - vlTotDebRecalc))
      var difCred = Math.abs(round2(gravadoCred - vlTotCredRecalc))
      var difApur = Math.abs(round2(gravadoSldApur - sldApurRecalc))
      var difRecol = Math.abs(round2(gravadoRecolher - recolherRecalc))
      var difTransp = Math.abs(round2(gravadoTransportar - sldTranspRecalc))

      if (
        difDeb > 0.01 ||
        difCred > 0.01 ||
        difApur > 0.01 ||
        difRecol > 0.01 ||
        difTransp > 0.01
      ) {
        ctx.adicionarValidacao(
          'erro',
          'Recálculo da apuração E110 a partir dos registros do arquivo diverge dos valores gravados (Débitos gravados: ' +
            gravadoDeb.toFixed(2) +
            ' vs recalc: ' +
            vlTotDebRecalc.toFixed(2) +
            '; Créditos gravados: ' +
            gravadoCred.toFixed(2) +
            ' vs recalc: ' +
            vlTotCredRecalc.toFixed(2) +
            ').',
          'E110',
        )
      }
    }
  }

  /**
   * Função orquestradora:
   * 1) Cria contexto
   * 2) Monta Blocos operacionais (B, C, D, E, G, H, K, 1) registrando o que usam
   * 3) Executa validação interna pré-fechamento (retira 0150, 0190, 0200 não usados com aviso; confere datas e chaves)
   * 4) Monta Bloco 0 com os dados estritamente necessários
   * 5) Monta Bloco 9 e fecha totais e contagens
   * 6) Executa validação interna pós-montagem (DVs de CPF/CNPJ, contagens reais X990, 9900, 9990, 9999, batimento E110, tamanho do arquivo)
   * 7) Determina status ("Gerado com erros" se houver erros de validação; "Gerado" caso contrário)
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

    // 1) Blocos operacionais executam PRIMEIRO (registrando coletores para o Bloco 0)
    var linhasB = gerarBlocoB(ctx)
    var linhasC = gerarBlocoC(ctx)
    var linhasD = gerarBlocoD(ctx)
    var linhasE = gerarBlocoE(ctx)
    var linhasG = gerarBlocoG(ctx)
    var linhasH = gerarBlocoH(ctx)
    var linhasK = gerarBlocoK(ctx)
    var linhas1 = gerarBloco1(ctx)

    var linhasOperacionais = []
    linhasOperacionais = linhasOperacionais.concat(linhasB)
    linhasOperacionais = linhasOperacionais.concat(linhasC)
    linhasOperacionais = linhasOperacionais.concat(linhasD)
    linhasOperacionais = linhasOperacionais.concat(linhasE)
    linhasOperacionais = linhasOperacionais.concat(linhasG)
    linhasOperacionais = linhasOperacionais.concat(linhasH)
    linhasOperacionais = linhasOperacionais.concat(linhasK)
    linhasOperacionais = linhasOperacionais.concat(linhas1)

    // 2) Validação interna pré-fechamento:
    // Identifica uso real, remove itens/participantes/unidades não usados com aviso (Regra 2),
    // checa chave única (Regra 5) e período de datas (Regra 6)
    var dadosUso = executarValidacaoInternaPreFechamento(ctx, linhasOperacionais)

    // 3) Bloco 0 montado com dados da empresa e o que permaneceu após a limpeza
    var linhas0 = gerarBloco0(ctx)

    // 4) Concatena blocos antes do Bloco 9
    var linhasAntes9 = []
    linhasAntes9 = linhasAntes9.concat(linhas0)
    linhasAntes9 = linhasAntes9.concat(linhasOperacionais)

    // 5) Bloco 9 monta contagens e totais
    var res9 = gerarBloco9(linhasAntes9)
    var linhasFinais = linhasAntes9.concat(res9.linhas)

    // 6) Validação interna pós-montagem:
    // Regras 1, 3, 4, 8 e 9
    executarValidacaoInternaPosMontagem(ctx, linhasFinais, dadosUso)

    var conteudoTexto = linhasFinais.join('')

    // Regra 9: Arquivo acima de 4 MB: aviso
    // Em UTF-8, o tamanho em bytes do texto
    var tamanhoBytes = 0
    try {
      tamanhoBytes = Buffer.byteLength(conteudoTexto, 'utf-8')
    } catch (_) {
      tamanhoBytes = conteudoTexto.length
    }
    if (tamanhoBytes > 4 * 1024 * 1024) {
      var mbTamanho = (tamanhoBytes / (1024 * 1024)).toFixed(2)
      ctx.adicionarValidacao(
        'aviso',
        'Arquivo SPED ultrapassou 4 MB (' +
          mbTamanho +
          ' MB). O PVA pode demorar mais para validar.',
        '9999',
        mbTamanho + ' MB',
      )
    }

    // Nome oficial do arquivo:
    // SPED_EFD_<CNPJ só dígitos>_<AAAAMM>.txt
    // No modo Teste, prefixo "TESTE_"
    var cnpjDig = SpedFormato.formatarDigitos(ctx.empresa.getString('cnpj')) || '00000000000000'
    var periodoSemHifen = ctx.periodo.replace('-', '')
    var nomeArquivo = 'SPED_EFD_' + cnpjDig + '_' + periodoSemHifen + '.txt'
    if (ctx.modo === 'Teste') {
      nomeArquivo = 'TESTE_' + nomeArquivo
    }

    // Status final:
    // Se houver erro: status "Gerado com erros" (o arquivo continua disponível para conferência);
    // só erros impeditivos já existentes (como falta de IE na requisição) mudam para "Erro"
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
      quantidadeLinhas: linhasFinais.length,
      contagemRegistros: res9.contagem,
      validacoes: ctx.validacoes,
      status: status,
      temErros: temErros,
      resumoSaida: ctx.resumoSaida || null,
      resumoEntrada: ctx.resumoEntrada || null,
      resumoApuracao: ctx.resumoApuracao || null,
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
