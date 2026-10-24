/**
 * Utilitários padronizados para relatórios (Etapa 8):
 * - Exportação CSV com delimitador ponto e vírgula (;), vírgula decimal e UTF-8 com BOM (\uFEFF)
 * - Cabeçalho e disparo de impressão
 * - Cálculo de atalhos e validação do limite máximo de 366 dias
 */

export interface PeriodoRelatorio {
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
}

export type TipoAtalhoPeriodo =
  | 'hoje'
  | 'esta_semana'
  | 'este_mes'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_90'
  | 'ultimos_365'
  | 'personalizado'

/**
 * Formata um objeto Date como YYYY-MM-DD no fuso local
 */
export function formatarDataIso(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/**
 * Formata YYYY-MM-DD para DD/MM/AAAA
 */
export function formatarDataBr(dataIso: string): string {
  if (!dataIso) return ''
  const partes = dataIso.split('-')
  if (partes.length !== 3) return dataIso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

/**
 * Formata data e hora atual para o padrão brasileiro DD/MM/AAAA HH:mm:ss
 */
export function formatarDataHoraEmissao(data = new Date()): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  const hora = String(data.getHours()).padStart(2, '0')
  const min = String(data.getMinutes()).padStart(2, '0')
  const seg = String(data.getSeconds()).padStart(2, '0')
  return `${dia}/${mes}/${ano} às ${hora}:${min}:${seg}`
}

/**
 * Calcula o intervalo de datas a partir do atalho de período selecionado
 */
export function calcularPeriodoPorAtalho(tipo: TipoAtalhoPeriodo): PeriodoRelatorio {
  const hoje = new Date()
  const hojeStr = formatarDataIso(hoje)

  switch (tipo) {
    case 'hoje':
      return { dataInicio: hojeStr, dataFim: hojeStr }

    case 'esta_semana': {
      // Começa no domingo (ou segunda) até hoje
      const diaSemana = hoje.getDay()
      const inicioSemana = new Date(hoje)
      inicioSemana.setDate(hoje.getDate() - diaSemana)
      return {
        dataInicio: formatarDataIso(inicioSemana),
        dataFim: hojeStr,
      }
    }

    case 'este_mes': {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      return {
        dataInicio: formatarDataIso(inicioMes),
        dataFim: formatarDataIso(fimMes),
      }
    }

    case 'mes_anterior': {
      const inicioMesAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const fimMesAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      return {
        dataInicio: formatarDataIso(inicioMesAnt),
        dataFim: formatarDataIso(fimMesAnt),
      }
    }

    case 'ultimos_30': {
      const d = new Date(hoje)
      d.setDate(hoje.getDate() - 30)
      return {
        dataInicio: formatarDataIso(d),
        dataFim: hojeStr,
      }
    }

    case 'ultimos_90': {
      const d = new Date(hoje)
      d.setDate(hoje.getDate() - 90)
      return {
        dataInicio: formatarDataIso(d),
        dataFim: hojeStr,
      }
    }

    case 'ultimos_365': {
      const d = new Date(hoje)
      d.setDate(hoje.getDate() - 365)
      return {
        dataInicio: formatarDataIso(d),
        dataFim: hojeStr,
      }
    }

    case 'personalizado':
    default: {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      return {
        dataInicio: formatarDataIso(inicioMes),
        dataFim: hojeStr,
      }
    }
  }
}

/**
 * Valida se o período não excede o limite legal do ERP de 366 dias (1 ano bissexto)
 */
export function validarPeriodoMaximo366Dias(
  dataInicio: string,
  dataFim: string,
): {
  valido: boolean
  dias: number
  mensagem?: string
} {
  if (!dataInicio || !dataFim) {
    return { valido: false, dias: 0, mensagem: 'Informe a data inicial e a data final.' }
  }

  const dIni = new Date(`${dataInicio}T00:00:00`)
  const dFim = new Date(`${dataFim}T23:59:59`)

  if (isNaN(dIni.getTime()) || isNaN(dFim.getTime())) {
    return { valido: false, dias: 0, mensagem: 'Data inválida.' }
  }

  if (dIni > dFim) {
    return {
      valido: false,
      dias: 0,
      mensagem: 'A data inicial não pode ser maior que a data final.',
    }
  }

  const diffMs = dFim.getTime() - dIni.getTime()
  const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (dias > 366) {
    return {
      valido: false,
      dias,
      mensagem: `O período selecionado (${dias} dias) excede o limite máximo permitido de 366 dias por consulta.`,
    }
  }

  return { valido: true, dias }
}

/**
 * Formata um valor numérico para a representação decimal brasileira (ex: 1234.56 -> 1234,56 ou 1.234,56)
 */
export function formatarNumeroCsv(valor: number, casas = 2): string {
  if (valor === null || valor === undefined || isNaN(valor)) {
    return '0,00'
  }
  return valor.toFixed(casas).replace('.', ',')
}

/**
 * Escapa uma célula para CSV com separador ponto e vírgula
 */
export function escaparCelulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return ''

  if (typeof valor === 'number') {
    return formatarNumeroCsv(valor)
  }

  let str = String(valor)
  // Se contiver ponto e vírgula, aspas, quebra de linha ou vírgula, envolve em aspas duplas
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Gera o conteúdo CSV completo com cabeçalho, linhas e codificação UTF-8 com BOM
 */
export function gerarCsvRelatorio(params: {
  titulo: string
  empresaNome?: string
  periodo?: PeriodoRelatorio
  colunas: string[]
  linhas: (string | number | boolean | null | undefined)[][]
  totais?: (string | number | boolean | null | undefined)[]
  metadadosExtras?: Record<string, string>
}): string {
  const linhasCsv: string[] = []

  // Metadados iniciais opcionais
  if (params.titulo) {
    linhasCsv.push(`RELATÓRIO:;${params.titulo}`)
  }
  if (params.empresaNome) {
    linhasCsv.push(`EMPRESA:;${params.empresaNome}`)
  }
  if (params.periodo) {
    linhasCsv.push(
      `PERÍODO:;${formatarDataBr(params.periodo.dataInicio)} até ${formatarDataBr(params.periodo.dataFim)}`,
    )
  }
  linhasCsv.push(`EMISSÃO:;${formatarDataHoraEmissao()}`)

  if (params.metadadosExtras) {
    Object.entries(params.metadadosExtras).forEach(([chave, valor]) => {
      linhasCsv.push(`${chave}:;${valor}`)
    })
  }

  // Linha em branco de separação
  linhasCsv.push('')

  // Cabeçalho das colunas
  linhasCsv.push(params.colunas.map(escaparCelulaCsv).join(';'))

  // Linhas de dados
  params.linhas.forEach((linha) => {
    linhasCsv.push(linha.map(escaparCelulaCsv).join(';'))
  })

  // Linha de totalizadores se houver
  if (params.totais && params.totais.length > 0) {
    linhasCsv.push('')
    linhasCsv.push(params.totais.map(escaparCelulaCsv).join(';'))
  }

  // Retorna com BOM UTF-8 (\uFEFF) para abrir com acentuação correta no Excel brasileiro
  return '\uFEFF' + linhasCsv.join('\r\n')
}

/**
 * Dispara o download de um arquivo CSV no navegador
 */
export function fazerDownloadCsv(conteudoCsv: string, nomeArquivo: string): void {
  const nomeLimpo = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  const blob = new Blob([conteudoCsv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', nomeLimpo)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Dispara a impressão do navegador (window.print)
 */
export function dispararImpressaoRelatorio(): void {
  window.print()
}
