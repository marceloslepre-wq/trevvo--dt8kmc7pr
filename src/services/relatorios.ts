import pb from '@/lib/pocketbase/client'

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

/**
 * Catálogo completo de campos de filtros declaráveis por cada relatório (Prompt 8.0b)
 */
export type ChaveFiltroDeclaravel =
  // PRODUTO
  | 'produto_grupos_categorias'
  | 'produtos_grupos'
  | 'produto_marcas'
  | 'produto_produtos'
  | 'produtos_especificos'
  | 'produto_fornecedores'
  | 'produto_ncms'
  | 'produto_situacao'
  | 'produto_so_fiscal_nao_revisado'
  // PESSOAS
  | 'pessoas_clientes'
  | 'pessoas_fornecedores'
  | 'pessoas_vendedores'
  | 'pessoas_operadores_caixa'
  | 'pessoas_cliente_ufs'
  | 'pessoas_cliente_cidades'
  // VENDAS
  | 'vendas_tipos'
  | 'vendas_status'
  | 'vendas_formas_pagamento'
  | 'vendas_terminais_pdv'
  | 'vendas_intermediadores'
  | 'vendas_com_sem_nota'
  // FISCAL
  | 'fiscal_modelos'
  | 'fiscal_cfops'
  | 'fiscal_csts_csosns'
  | 'fiscal_situacoes_nota'
  | 'fiscal_ufs_destino'
  // FINANCEIRO
  | 'financeiro_plano_contas'
  | 'financeiro_centros_custo'
  | 'financeiro_contas_financeiras'
  | 'financeiro_situacoes_titulo'
  | 'financeiro_origens_titulo'
  // DATAS
  | 'datas_tipo_data'

/**
 * Opção de tipo de data quando o relatório tiver mais de uma
 */
export type OpcaoTipoData = 'emissao' | 'vencimento' | 'pagamento' | 'competencia' | 'entrada'

/**
 * Formato único do objeto `filtros` enviado ao backend e manipulado no frontend (Prompt 8.0b)
 */
export interface ObjetoFiltrosRelatorio {
  // Básico / Multiempresa e Período (8.0)
  empresas_ids?: string[]
  ver_so_total?: boolean
  periodo?: PeriodoRelatorio
  atalho_periodo?: TipoAtalhoPeriodo
  incluir_notas_teste?: boolean

  // 1. Produto
  grupos_ids?: string[]
  categorias_ids?: string[]
  marcas_ids?: string[]
  produtos_ids?: string[]
  fornecedores_produto_ids?: string[]
  ncms?: string[]
  situacao_produto?: ('ativo' | 'inativo')[]
  so_fiscal_nao_revisado?: boolean

  // 2. Pessoas
  clientes_ids?: string[]
  fornecedores_ids?: string[]
  vendedores_ids?: string[]
  operadores_caixa_ids?: string[]
  cliente_ufs?: string[]
  cliente_cidades?: string[]

  // 3. Vendas
  vendas_tipos?: ('PDV' | 'Pedido' | 'Orçamento')[]
  vendas_status?: string[]
  formas_pagamento_ids?: string[]
  terminais_pdv_ids?: string[]
  intermediadores_ids?: string[]
  vendas_nota_fiscal?: 'todas' | 'com_nota' | 'sem_nota'

  // 4. Fiscal
  fiscal_modelos?: ('55' | '65')[]
  fiscal_cfops?: string[]
  fiscal_csts_csosns?: string[]
  fiscal_situacoes_nota?: string[]
  fiscal_ufs_destino?: string[]

  // 5. Financeiro
  plano_contas_ids?: string[]
  centros_custo_ids?: string[]
  contas_financeiras_ids?: string[]
  situacoes_titulo?: string[]
  origens_titulo?: string[]

  // 6. Datas
  tipo_data?: OpcaoTipoData
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
 * Registro de Filtro Salvo persistido na tabela relatorios_filtros_salvos
 */
export interface FiltroSalvoRelatorio {
  id: string
  usuario_id: string
  relatorio: string
  nome: string
  filtros: ObjetoFiltrosRelatorio
  compartilhado: boolean
  created?: string
  updated?: string
  expand?: {
    usuario_id?: {
      id: string
      name?: string
      email?: string
    }
  }
}

/**
 * Lista todos os filtros salvos visíveis para o relatório especificado:
 * Retorna os filtros do próprio usuário logado + os filtros compartilhados por outros usuários.
 */
export async function listarFiltrosSalvos(relatorioId: string): Promise<FiltroSalvoRelatorio[]> {
  if (!relatorioId) return []
  try {
    const records = await pb.collection('relatorios_filtros_salvos').getFullList({
      filter: `relatorio = '${relatorioId.replace(/'/g, "\\'")}'`,
      sort: '-created',
      expand: 'usuario_id',
    })
    return records.map((rec) => {
      let filtrosParsed: ObjetoFiltrosRelatorio = {}
      try {
        filtrosParsed =
          typeof rec.filtros === 'string'
            ? JSON.parse(rec.filtros)
            : (rec.filtros as ObjetoFiltrosRelatorio) || {}
      } catch {
        filtrosParsed = {}
      }
      return {
        id: rec.id,
        usuario_id: rec.usuario_id,
        relatorio: rec.relatorio,
        nome: rec.nome,
        filtros: filtrosParsed,
        compartilhado: Boolean(rec.compartilhado),
        created: rec.created,
        updated: rec.updated,
        expand: rec.expand as FiltroSalvoRelatorio['expand'],
      }
    })
  } catch (err) {
    console.error('Erro ao listar filtros salvos do relatório:', err)
    return []
  }
}

/**
 * Salva (cria ou atualiza) um filtro de relatório na collection relatorios_filtros_salvos.
 * Usuário comum grava com seu próprio ID.
 */
export async function salvarFiltroRelatorio(params: {
  id?: string
  relatorio: string
  nome: string
  filtros: ObjetoFiltrosRelatorio
  compartilhado?: boolean
}): Promise<FiltroSalvoRelatorio> {
  const userId = pb.authStore.record?.id
  if (!userId) {
    throw new Error('Você precisa estar autenticado para salvar filtros.')
  }
  if (!params.nome || !params.nome.trim()) {
    throw new Error('Informe um nome para o filtro salvo.')
  }
  if (!params.relatorio || !params.relatorio.trim()) {
    throw new Error('Identificador do relatório não informado.')
  }

  const payload = {
    usuario_id: userId,
    relatorio: params.relatorio.trim(),
    nome: params.nome.trim(),
    filtros: params.filtros,
    compartilhado: Boolean(params.compartilhado),
  }

  let rec
  if (params.id) {
    rec = await pb.collection('relatorios_filtros_salvos').update(params.id, payload)
  } else {
    rec = await pb.collection('relatorios_filtros_salvos').create(payload)
  }

  let filtrosParsed: ObjetoFiltrosRelatorio = {}
  try {
    filtrosParsed =
      typeof rec.filtros === 'string'
        ? JSON.parse(rec.filtros)
        : (rec.filtros as ObjetoFiltrosRelatorio) || {}
  } catch {
    filtrosParsed = {}
  }

  return {
    id: rec.id,
    usuario_id: rec.usuario_id,
    relatorio: rec.relatorio,
    nome: rec.nome,
    filtros: filtrosParsed,
    compartilhado: Boolean(rec.compartilhado),
    created: rec.created,
    updated: rec.updated,
  }
}

/**
 * Exclui um filtro salvo (apenas o dono tem permissão pela API rule)
 */
export async function excluirFiltroSalvo(id: string): Promise<boolean> {
  try {
    await pb.collection('relatorios_filtros_salvos').delete(id)
    return true
  } catch (err) {
    console.error('Erro ao excluir filtro salvo:', err)
    throw err
  }
}

/**
 * Monta linha legível de filtros aplicados para exibição em cabeçalho, tela, impressão e CSV.
 * Exemplo: "Empresas: Loja 01, Loja 02 · Marcas: X, Y · Período: 01/10/2025 a 31/10/2025"
 */
export function formatarLinhaLegivelFiltros(params: {
  filtros: ObjetoFiltrosRelatorio
  nomesEmpresas?: string[]
  nomesMarcas?: string[]
  nomesGrupos?: string[]
  nomesCategorias?: string[]
  nomesClientes?: string[]
  nomesFornecedores?: string[]
  nomesVendedores?: string[]
  nomesPlanosContas?: string[]
}): string {
  const { filtros } = params
  const partes: string[] = []

  // 1. Empresas
  if (params.nomesEmpresas && params.nomesEmpresas.length > 0) {
    partes.push(`Empresas: ${params.nomesEmpresas.join(', ')}`)
  } else if (filtros.empresas_ids && filtros.empresas_ids.length > 0) {
    partes.push(`Empresas: ${filtros.empresas_ids.length} selecionada(s)`)
  }

  // 2. Período
  if (filtros.periodo?.dataInicio && filtros.periodo?.dataFim) {
    partes.push(
      `Período: ${formatarDataBr(filtros.periodo.dataInicio)} a ${formatarDataBr(filtros.periodo.dataFim)}`,
    )
  }

  // 3. Marcas
  if (params.nomesMarcas && params.nomesMarcas.length > 0) {
    partes.push(`Marcas: ${params.nomesMarcas.join(', ')}`)
  } else if (filtros.marcas_ids && filtros.marcas_ids.length > 0) {
    partes.push(`Marcas: ${filtros.marcas_ids.length}`)
  }

  // 4. Grupos e Categorias
  if (params.nomesGrupos && params.nomesGrupos.length > 0) {
    partes.push(`Grupos: ${params.nomesGrupos.join(', ')}`)
  } else if (filtros.grupos_ids && filtros.grupos_ids.length > 0) {
    partes.push(`Grupos: ${filtros.grupos_ids.length}`)
  }
  if (params.nomesCategorias && params.nomesCategorias.length > 0) {
    partes.push(`Categorias: ${params.nomesCategorias.join(', ')}`)
  } else if (filtros.categorias_ids && filtros.categorias_ids.length > 0) {
    partes.push(`Categorias: ${filtros.categorias_ids.length}`)
  }

  // 5. Pessoas
  if (params.nomesClientes && params.nomesClientes.length > 0) {
    partes.push(`Clientes: ${params.nomesClientes.join(', ')}`)
  } else if (filtros.clientes_ids && filtros.clientes_ids.length > 0) {
    partes.push(`Clientes: ${filtros.clientes_ids.length}`)
  }
  if (params.nomesFornecedores && params.nomesFornecedores.length > 0) {
    partes.push(`Fornecedores: ${params.nomesFornecedores.join(', ')}`)
  } else if (filtros.fornecedores_ids && filtros.fornecedores_ids.length > 0) {
    partes.push(`Fornecedores: ${filtros.fornecedores_ids.length}`)
  }
  if (params.nomesVendedores && params.nomesVendedores.length > 0) {
    partes.push(`Vendedores: ${params.nomesVendedores.join(', ')}`)
  } else if (filtros.vendedores_ids && filtros.vendedores_ids.length > 0) {
    partes.push(`Vendedores: ${filtros.vendedores_ids.length}`)
  }

  // 6. Vendas
  if (filtros.vendas_tipos && filtros.vendas_tipos.length > 0) {
    partes.push(`Tipos: ${filtros.vendas_tipos.join(', ')}`)
  }
  if (filtros.vendas_status && filtros.vendas_status.length > 0) {
    partes.push(`Status: ${filtros.vendas_status.join(', ')}`)
  }
  if (filtros.vendas_nota_fiscal && filtros.vendas_nota_fiscal !== 'todas') {
    partes.push(filtros.vendas_nota_fiscal === 'com_nota' ? 'Apenas com NF' : 'Apenas sem NF')
  }

  // 7. Fiscal
  if (filtros.fiscal_modelos && filtros.fiscal_modelos.length > 0) {
    partes.push(
      `Modelos: ${filtros.fiscal_modelos.map((m) => (m === '55' ? 'NF-e' : 'NFC-e')).join(', ')}`,
    )
  }
  if (filtros.fiscal_cfops && filtros.fiscal_cfops.length > 0) {
    partes.push(`CFOP: ${filtros.fiscal_cfops.join(', ')}`)
  }
  if (filtros.fiscal_csts_csosns && filtros.fiscal_csts_csosns.length > 0) {
    partes.push(`CST/CSOSN: ${filtros.fiscal_csts_csosns.join(', ')}`)
  }

  // 8. Financeiro
  if (params.nomesPlanosContas && params.nomesPlanosContas.length > 0) {
    partes.push(`Contas: ${params.nomesPlanosContas.join(', ')}`)
  } else if (filtros.plano_contas_ids && filtros.plano_contas_ids.length > 0) {
    partes.push(`Contas: ${filtros.plano_contas_ids.length}`)
  }
  if (filtros.situacoes_titulo && filtros.situacoes_titulo.length > 0) {
    partes.push(`Situação: ${filtros.situacoes_titulo.join(', ')}`)
  }
  if (filtros.origens_titulo && filtros.origens_titulo.length > 0) {
    partes.push(`Origem: ${filtros.origens_titulo.join(', ')}`)
  }

  // 9. Situação de produto ou fiscal não revisado
  if (filtros.so_fiscal_nao_revisado) {
    partes.push('Só fiscal não revisado')
  }
  if (filtros.situacao_produto && filtros.situacao_produto.length === 1) {
    partes.push(filtros.situacao_produto[0] === 'ativo' ? 'Produtos Ativos' : 'Produtos Inativos')
  }

  // 10. Tipo de data se for diferente do padrão emissão
  if (filtros.tipo_data && filtros.tipo_data !== 'emissao') {
    const labelData: Record<string, string> = {
      vencimento: 'Por Vencimento',
      pagamento: 'Por Pagamento',
      competencia: 'Por Competência',
      entrada: 'Por Data de Entrada',
    }
    partes.push(labelData[filtros.tipo_data] || `Data: ${filtros.tipo_data}`)
  }

  // 11. Aviso se houver filtro de produto em relatório
  const temFiltroProduto =
    (filtros.grupos_ids && filtros.grupos_ids.length > 0) ||
    (filtros.categorias_ids && filtros.categorias_ids.length > 0) ||
    (filtros.marcas_ids && filtros.marcas_ids.length > 0) ||
    (filtros.produtos_ids && filtros.produtos_ids.length > 0) ||
    (filtros.fornecedores_produto_ids && filtros.fornecedores_produto_ids.length > 0) ||
    (filtros.ncms && filtros.ncms.length > 0) ||
    filtros.so_fiscal_nao_revisado

  if (temFiltroProduto) {
    partes.push('Filtro de produto ativo (totais dos itens filtrados)')
  }

  return partes.join(' · ') || 'Sem filtros aplicados'
}

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
  linhaFiltros?: string
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
  if (params.linhaFiltros) {
    linhasCsv.push(`FILTROS APLICADOS:;${params.linhaFiltros}`)
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
