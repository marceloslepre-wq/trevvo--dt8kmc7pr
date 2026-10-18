/// <reference path="../types.d.ts" />

/**
 * Utilitários de formatação para SPED Fiscal (EFD ICMS/IPI)
 * Compatível com o runtime Goja do PocketBase.
 */

var SpedFormato = (function () {
  function removerAcentosECaracteresEspeciais(valor) {
    if (valor === null || valor === undefined) return ''
    var str = String(valor)

    var mapaAcentos = {
      á: 'a',
      à: 'a',
      ã: 'a',
      â: 'a',
      ä: 'a',
      Á: 'A',
      À: 'A',
      Ã: 'A',
      Â: 'A',
      Ä: 'A',
      é: 'e',
      è: 'e',
      ê: 'e',
      ë: 'e',
      É: 'E',
      È: 'E',
      Ê: 'E',
      Ë: 'E',
      í: 'i',
      ì: 'i',
      î: 'i',
      ï: 'i',
      Í: 'I',
      Ì: 'I',
      Î: 'I',
      Ï: 'I',
      ó: 'o',
      ò: 'o',
      õ: 'o',
      ô: 'o',
      ö: 'o',
      Ó: 'O',
      Ò: 'O',
      Õ: 'O',
      Ô: 'O',
      Ö: 'O',
      ú: 'u',
      ù: 'u',
      û: 'u',
      ü: 'u',
      Ú: 'U',
      Ù: 'U',
      Û: 'U',
      Ü: 'U',
      ç: 'c',
      Ç: 'C',
      ñ: 'n',
      Ñ: 'N',
    }

    str = str.replace(/[áàãâäÁÀÃÂÄéèêëÉÈÊËíìîïÍÌÎÏóòõôöÓÒÕÔÖúùûüÚÙÛÜçÇñÑ]/g, function (m) {
      return mapaAcentos[m] || m
    })

    // Substituir barras verticais e quebras de linha por espaço
    str = str.replace(/[|\r\n\t]+/g, ' ')

    // Remover qualquer caractere fora do ASCII imprimível (32 a 126)
    str = str.replace(/[^\x20-\x7E]/g, '')

    return str.trim()
  }

  function formatarTexto(valor, maxLen) {
    var limpo = removerAcentosECaracteresEspeciais(valor)
    if (typeof maxLen === 'number' && maxLen > 0) {
      return limpo.substring(0, maxLen)
    }
    return limpo
  }

  function formatarDigitos(valor) {
    if (valor === null || valor === undefined) return ''
    return String(valor).replace(/\D/g, '')
  }

  function formatarValor(valor) {
    if (valor === null || valor === undefined || valor === '') return ''
    var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
    if (isNaN(num)) return ''
    return num.toFixed(2).replace('.', ',')
  }

  function formatarQuantidade(valor, maxCasas) {
    if (valor === null || valor === undefined || valor === '') return ''
    var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
    if (isNaN(num)) return ''
    var casas = typeof maxCasas === 'number' ? maxCasas : 3
    var str = num.toFixed(casas).replace('.', ',')
    str = str.replace(/0+$/, '').replace(/,$/, '')
    return str
  }

  function formatarPrecoUnitario(valor, maxCasas) {
    if (valor === null || valor === undefined || valor === '') return ''
    var num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
    if (isNaN(num)) return ''
    var casas = typeof maxCasas === 'number' ? maxCasas : 6
    var str = num.toFixed(casas).replace('.', ',')
    var partes = str.split(',')
    if (partes.length === 2 && partes[1].length > 2) {
      var decimais = partes[1].replace(/0+$/, '')
      if (decimais.length < 2) decimais = decimais.padEnd(2, '0')
      str = partes[0] + ',' + decimais
    }
    return str
  }

  function formatarData(dataIsoOuDate) {
    if (!dataIsoOuDate) return ''
    var d = null
    if (typeof dataIsoOuDate === 'string') {
      var raw = dataIsoOuDate.trim()
      if (!raw) return ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        var p = raw.split('-')
        return p[2] + p[1] + p[0]
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        var p2 = raw.split('/')
        return p2[0] + p2[1] + p2[2]
      }
      if (/^\d{8}$/.test(raw)) {
        return raw
      }
      d = new Date(raw)
    } else if (dataIsoOuDate instanceof Date) {
      d = dataIsoOuDate
    }

    if (!d || isNaN(d.getTime())) return ''

    // Fuso horário de Brasília UTC-3
    var utcMillis = d.getTime() + d.getTimezoneOffset() * 60000
    var spOffsetMillis = -3 * 60 * 60000
    var spDate = new Date(utcMillis + spOffsetMillis)

    var dia = String(spDate.getDate())
    if (dia.length < 2) dia = '0' + dia
    var mes = String(spDate.getMonth() + 1)
    if (mes.length < 2) mes = '0' + mes
    var ano = String(spDate.getFullYear())

    return dia + mes + ano
  }

  function montarLinha(campos) {
    var valores = (campos || []).map(function (c) {
      return c === null || c === undefined ? '' : String(c)
    })
    return '|' + valores.join('|') + '|\r\n'
  }

  return {
    removerAcentosECaracteresEspeciais: removerAcentosECaracteresEspeciais,
    formatarTexto: formatarTexto,
    formatarDigitos: formatarDigitos,
    formatarValor: formatarValor,
    formatarQuantidade: formatarQuantidade,
    formatarPrecoUnitario: formatarPrecoUnitario,
    formatarData: formatarData,
    montarLinha: montarLinha,
  }
})()
