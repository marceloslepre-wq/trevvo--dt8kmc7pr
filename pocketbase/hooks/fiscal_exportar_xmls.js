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
 */

routerAdd(
  'POST',
  '/backend/v1/fiscal/exportar-xmls',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, { sucesso: false, message: 'Autenticação obrigatória.' })
    }

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

    // Intervalo de datas do mês
    const mesStr = mes < 10 ? '0' + mes : String(mes)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const ultimoDiaStr = ultimoDia < 10 ? '0' + ultimoDia : String(ultimoDia)

    const dataInicioStr = `${ano}-${mesStr}-01 00:00:00`
    const dataFimStr = `${ano}-${mesStr}-${ultimoDiaStr} 23:59:59`
    const dataInicioIso = `${ano}-${mesStr}-01T00:00:00.000Z`
    const dataFimIso = `${ano}-${mesStr}-${ultimoDiaStr}T23:59:59.999Z`

    const tokenAuth = c.requestInfo().headers['authorization'] || ''

    // Helper interno para carregar arquivo do PocketBase
    const carregarArquivoLocal = (colName, recId, fileName) => {
      if (!fileName) return null
      try {
        const url = `http://127.0.0.1:8090/api/files/${colName}/${recId}/${fileName}`
        const res = $http.send({
          method: 'GET',
          url: url,
          headers: tokenAuth ? { Authorization: tokenAuth } : {},
          timeout: 20,
        })
        if ((res.statusCode || 200) < 300 && res.raw) {
          return res.raw
        }
      } catch (err) {
        console.warn(`Erro ao ler arquivo ${fileName}:`, err)
      }
      return null
    }

    const arquivosParaZip = []
    const linhasCsv = []
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

      // a) XML Autorizado
      if (status === 'Autorizada' || status === 'Cancelada') {
        let conteudoXml = null
        if (xmlArquivo) {
          conteudoXml = carregarArquivoLocal('documentos_fiscais', doc.id, xmlArquivo)
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
        const conteudoCanc = carregarArquivoLocal('documentos_fiscais', doc.id, xmlCancelamento)
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
            conteudoXmlCarta = carregarArquivoLocal('documentos_fiscais_cartas', carta.id, xmlCarta)
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
          conteudoXmlInut = carregarArquivoLocal('inutilizacoes', inut.id, xmlInut)
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
            fornNome = fRec.getString('nome_fantasia') || fRec.getString('razao_social') || fornNome
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
          conteudoXmlNe = carregarArquivoLocal('notas_entrada', ne.id, xmlArquivo)
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
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
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
            out.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63))
          } else {
            out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63))
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

    return c.json(200, {
      sucesso: true,
      nome_arquivo: nomeArquivo,
      zip_base64: zipBase64,
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
  },
  $apis.requireAuth(),
)
