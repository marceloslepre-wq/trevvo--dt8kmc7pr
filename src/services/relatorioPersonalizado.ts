/**
 * Serviço de Relatórios Personalizados (Montador) - Prompt 8.6 & 8.7
 * Suporta 7 bases:
 * - itens_vendidos (Prompt 8.6)
 * - itens_comprados (Prompt 8.6)
 * - estoque_data (Prompt 8.7)
 * - estoque_movimentos (Prompt 8.7)
 * - contas_pagar (Prompt 8.7)
 * - contas_receber (Prompt 8.7)
 * - movimentacoes_financeiras (Prompt 8.7)
 */

import pb from '@/lib/pocketbase/client'
import { ObjetoFiltrosRelatorio } from '@/services/relatorios'

export type BaseRelatorioPersonalizado =
  | 'itens_vendidos'
  | 'itens_comprados'
  | 'estoque_data'
  | 'estoque_movimentos'
  | 'contas_pagar'
  | 'contas_receber'
  | 'movimentacoes_financeiras'

export type AgrupamentoVendas =
  | 'empresa'
  | 'dia'
  | 'semana'
  | 'mes'
  | 'ano'
  | 'grupo'
  | 'categoria'
  | 'marca'
  | 'produto'
  | 'fornecedor_produto'
  | 'cliente'
  | 'uf_cliente'
  | 'cidade_cliente'
  | 'vendedor'
  | 'forma_pagamento'
  | 'canal'
  | 'terminal'
  | 'cfop'
  | 'ncm'

export type AgrupamentoCompras =
  | 'empresa'
  | 'dia'
  | 'semana'
  | 'mes'
  | 'ano'
  | 'grupo'
  | 'categoria'
  | 'marca'
  | 'produto'
  | 'fornecedor_produto'
  | 'fornecedor_nota'
  | 'cfop_entrada'
  | 'tipo_entrada'
  | 'ncm'

export type AgrupamentoEstoqueData =
  | 'empresa'
  | 'grupo'
  | 'categoria'
  | 'marca'
  | 'produto'
  | 'fornecedor_produto'

export type AgrupamentoEstoqueMovimentos =
  | 'empresa'
  | 'dia'
  | 'semana'
  | 'mes'
  | 'ano'
  | 'grupo'
  | 'categoria'
  | 'marca'
  | 'produto'
  | 'fornecedor_produto'
  | 'origem'
  | 'tipo'

export type AgrupamentoContasPagar =
  | 'empresa'
  | 'fornecedor'
  | 'plano_contas'
  | 'centro_custo'
  | 'situacao'
  | 'origem'
  | 'mes_vencimento'
  | 'faixa_atraso'

export type AgrupamentoContasReceber =
  | 'empresa'
  | 'cliente'
  | 'plano_contas'
  | 'centro_custo'
  | 'situacao'
  | 'origem'
  | 'mes_vencimento'
  | 'faixa_atraso'

export type AgrupamentoMovimentacoesFinanceiras =
  | 'empresa'
  | 'dia'
  | 'semana'
  | 'mes'
  | 'ano'
  | 'conta_financeira'
  | 'plano_contas'
  | 'centro_custo'
  | 'origem'
  | 'tipo'

export type AgrupamentoPersonalizado =
  | AgrupamentoVendas
  | AgrupamentoCompras
  | AgrupamentoEstoqueData
  | AgrupamentoEstoqueMovimentos
  | AgrupamentoContasPagar
  | AgrupamentoContasReceber
  | AgrupamentoMovimentacoesFinanceiras

export type ValorMetricaVendas =
  | 'quantidade'
  | 'valor_bruto'
  | 'desconto'
  | 'valor_liquido'
  | 'custo'
  | 'margem_valor'
  | 'margem_percentual'
  | 'quantidade_vendas'
  | 'ticket_medio'
  | 'preco_medio'
  | 'percentual_total'

export type ValorMetricaCompras =
  | 'quantidade'
  | 'valor_produtos'
  | 'frete'
  | 'ipi'
  | 'icms_st'
  | 'credito_icms'
  | 'custo_total'
  | 'quantidade_notas'
  | 'preco_medio'
  | 'percentual_total'

export type ValorMetricaEstoqueData =
  | 'quantidade'
  | 'custo_medio'
  | 'valor_estoque'
  | 'percentual_total'

export type ValorMetricaEstoqueMovimentos = 'quantidade' | 'valor'

export type ValorMetricaContasPagar =
  | 'valor_original'
  | 'valor_pago'
  | 'saldo'
  | 'quantidade_titulos'
  | 'atraso_medio'

export type ValorMetricaContasReceber =
  | 'valor_original'
  | 'valor_recebido'
  | 'saldo'
  | 'quantidade_titulos'
  | 'atraso_medio'

export type ValorMetricaMovimentacoesFinanceiras = 'entradas' | 'saidas' | 'saldo_periodo'

export type ValorMetricaPersonalizado =
  | ValorMetricaVendas
  | ValorMetricaCompras
  | ValorMetricaEstoqueData
  | ValorMetricaEstoqueMovimentos
  | ValorMetricaContasPagar
  | ValorMetricaContasReceber
  | ValorMetricaMovimentacoesFinanceiras

export interface MetricasLinhaPersonalizado {
  // Vendas
  quantidade?: number
  valor_bruto?: number
  desconto?: number
  valor_liquido?: number
  custo?: number | null
  margem_valor?: number | null
  margem_percentual?: number | null
  quantidade_vendas?: number
  ticket_medio?: number
  preco_medio?: number
  percentual_total?: number | null

  // Compras
  valor_produtos?: number
  frete?: number
  ipi?: number
  icms_st?: number
  credito_icms?: number
  custo_total?: number
  quantidade_notas?: number

  // Estoque em uma data
  custo_medio?: number | null
  valor_estoque?: number | null

  // Estoque movimentos
  valor?: number | null

  // Financeiro títulos
  valor_original?: number
  valor_pago?: number
  valor_recebido?: number
  saldo?: number
  quantidade_titulos?: number
  atraso_medio?: number

  // Financeiro movimentações
  entradas?: number
  saidas?: number
  saldo_periodo?: number
}

export interface LinhaRelatorioPersonalizado {
  nivel: number // 1, 2 ou 3
  eh_subtotal: boolean
  grupo_1: string
  grupo_2: string | null
  grupo_3: string | null
  rotulo: string
  metricas: MetricasLinhaPersonalizado
}

export interface DadoGraficoPersonalizado {
  rotulo: string
  valor_liquido?: number
  quantidade?: number
  margem_valor?: number | null
  ticket_medio?: number
  custo_total?: number
  valor_produtos?: number
  valor_estoque?: number | null
  valor?: number | null
  saldo?: number
  valor_original?: number
  quantidade_titulos?: number
  entradas?: number
  saidas?: number
  saldo_periodo?: number
}

export interface RespostaRelatorioPersonalizado {
  sucesso: boolean
  message?: string
  base: BaseRelatorioPersonalizado
  agrupamentos: AgrupamentoPersonalizado[]
  valores: ValorMetricaPersonalizado[]
  linhas: LinhaRelatorioPersonalizado[]
  totalGeral: MetricasLinhaPersonalizado
  totalLinhas: number
  dadosGrafico: DadoGraficoPersonalizado[] | null
  temPermissaoCustos: boolean
}

export interface RequisicaoRelatorioPersonalizado {
  base: BaseRelatorioPersonalizado
  agrupamentos: AgrupamentoPersonalizado[]
  valores: ValorMetricaPersonalizado[]
  filtros: ObjetoFiltrosRelatorio
}

export interface RelatorioSalvoRegistro {
  id: string
  usuario_id: string
  nome: string
  descricao?: string
  tipo: string
  base: BaseRelatorioPersonalizado
  agrupamentos: AgrupamentoPersonalizado[]
  valores: ValorMetricaPersonalizado[]
  filtros: ObjetoFiltrosRelatorio
  tipo_grafico?: 'nenhum' | 'barras' | 'linhas'
  compartilhado?: boolean
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
 * Consulta o backend para montar o relatório personalizado sintetizado
 */
export async function consultarRelatorioPersonalizado(
  params: RequisicaoRelatorioPersonalizado,
): Promise<RespostaRelatorioPersonalizado> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const url = `${baseUrl}/backend/v1/relatorios/personalizado`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(params),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Falha ao gerar relatório personalizado.')
  }

  return json as RespostaRelatorioPersonalizado
}

/**
 * Lista relatórios salvos acessíveis: Meus relatórios (do usuário) + Relatórios da empresa (compartilhados)
 */
export async function listarRelatoriosSalvos(): Promise<{
  meusRelatorios: RelatorioSalvoRegistro[]
  relatoriosEmpresa: RelatorioSalvoRegistro[]
}> {
  const currentUserId = pb.authStore.record?.id
  try {
    const records = await pb.collection('relatorios_salvos').getFullList({
      sort: '-created',
      expand: 'usuario_id',
    })

    const todos: RelatorioSalvoRegistro[] = records.map((rec) => {
      let agrupamentosParsed: AgrupamentoPersonalizado[] = []
      let valoresParsed: ValorMetricaPersonalizado[] = []
      let filtrosParsed: ObjetoFiltrosRelatorio = {}

      try {
        agrupamentosParsed =
          typeof rec.agrupamentos === 'string'
            ? JSON.parse(rec.agrupamentos)
            : (rec.agrupamentos as AgrupamentoPersonalizado[]) || []
      } catch {
        agrupamentosParsed = []
      }

      try {
        valoresParsed =
          typeof rec.valores === 'string'
            ? JSON.parse(rec.valores)
            : (rec.valores as ValorMetricaPersonalizado[]) || []
      } catch {
        valoresParsed = []
      }

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
        nome: rec.nome,
        descricao: rec.descricao,
        tipo: rec.tipo || 'personalizado',
        base: rec.base as BaseRelatorioPersonalizado,
        agrupamentos: agrupamentosParsed,
        valores: valoresParsed,
        filtros: filtrosParsed,
        tipo_grafico: rec.tipo_grafico || 'nenhum',
        compartilhado: Boolean(rec.compartilhado),
        created: rec.created,
        updated: rec.updated,
        expand: rec.expand as RelatorioSalvoRegistro['expand'],
      }
    })

    const meusRelatorios = todos.filter((r) => r.usuario_id === currentUserId)
    const relatoriosEmpresa = todos.filter((r) => r.compartilhado && r.usuario_id !== currentUserId)

    return {
      meusRelatorios,
      relatoriosEmpresa,
    }
  } catch (err) {
    console.error('Erro ao listar relatórios salvos:', err)
    return { meusRelatorios: [], relatoriosEmpresa: [] }
  }
}

/**
 * Salva uma nova configuração de relatório personalizado
 */
export async function salvarRelatorioPersonalizado(params: {
  id?: string
  nome: string
  descricao?: string
  base: BaseRelatorioPersonalizado
  agrupamentos: AgrupamentoPersonalizado[]
  valores: ValorMetricaPersonalizado[]
  filtros: ObjetoFiltrosRelatorio
  tipo_grafico?: 'nenhum' | 'barras' | 'linhas'
  compartilhado?: boolean
}): Promise<RelatorioSalvoRegistro> {
  const userId = pb.authStore.record?.id
  if (!userId) {
    throw new Error('Você precisa estar autenticado para salvar um relatório.')
  }
  if (!params.nome || !params.nome.trim()) {
    throw new Error('Informe um nome para o relatório.')
  }

  const payload = {
    usuario_id: userId,
    nome: params.nome.trim(),
    descricao: params.descricao?.trim() || '',
    tipo: 'personalizado',
    base: params.base,
    agrupamentos: params.agrupamentos,
    valores: params.valores,
    filtros: params.filtros,
    tipo_grafico: params.tipo_grafico || 'nenhum',
    compartilhado: Boolean(params.compartilhado),
  }

  let rec
  if (params.id) {
    rec = await pb.collection('relatorios_salvos').update(params.id, payload)
  } else {
    rec = await pb.collection('relatorios_salvos').create(payload)
  }

  return {
    id: rec.id,
    usuario_id: rec.usuario_id,
    nome: rec.nome,
    descricao: rec.descricao,
    tipo: rec.tipo,
    base: rec.base,
    agrupamentos: params.agrupamentos,
    valores: params.valores,
    filtros: params.filtros,
    tipo_grafico: params.tipo_grafico,
    compartilhado: Boolean(rec.compartilhado),
    created: rec.created,
    updated: rec.updated,
  }
}

/**
 * Exclui um relatório salvo (apenas o dono)
 */
export async function excluirRelatorioSalvo(id: string): Promise<boolean> {
  try {
    await pb.collection('relatorios_salvos').delete(id)
    return true
  } catch (err) {
    console.error('Erro ao excluir relatório salvo:', err)
    throw err
  }
}

/**
 * Dicionários legíveis de agrupamentos e métricas
 */
export const DICIONARIO_AGRUPAMENTOS_VENDAS: Record<AgrupamentoVendas, string> = {
  empresa: 'Empresa / Loja',
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  grupo: 'Grupo de Produto',
  categoria: 'Categoria de Produto',
  marca: 'Marca',
  produto: 'Produto',
  fornecedor_produto: 'Fornecedor do Produto',
  cliente: 'Cliente',
  uf_cliente: 'UF do Cliente',
  cidade_cliente: 'Cidade do Cliente',
  vendedor: 'Vendedor',
  forma_pagamento: 'Forma de Pagamento',
  canal: 'Canal de Venda',
  terminal: 'Terminal / PDV',
  cfop: 'CFOP',
  ncm: 'NCM',
}

export const DICIONARIO_AGRUPAMENTOS_COMPRAS: Record<AgrupamentoCompras, string> = {
  empresa: 'Empresa / Filial',
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  grupo: 'Grupo de Produto',
  categoria: 'Categoria de Produto',
  marca: 'Marca',
  produto: 'Produto',
  fornecedor_produto: 'Fornecedor Padrão do Produto',
  fornecedor_nota: 'Fornecedor da Nota',
  cfop_entrada: 'CFOP de Entrada',
  tipo_entrada: 'Tipo de Entrada',
  ncm: 'NCM',
}

export const DICIONARIO_AGRUPAMENTOS_ESTOQUE_DATA: Record<AgrupamentoEstoqueData, string> = {
  empresa: 'Empresa / Loja',
  grupo: 'Grupo de Produto',
  categoria: 'Categoria de Produto',
  marca: 'Marca',
  produto: 'Produto',
  fornecedor_produto: 'Fornecedor do Produto',
}

export const DICIONARIO_AGRUPAMENTOS_ESTOQUE_MOVIMENTOS: Record<
  AgrupamentoEstoqueMovimentos,
  string
> = {
  empresa: 'Empresa / Loja',
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  grupo: 'Grupo de Produto',
  categoria: 'Categoria de Produto',
  marca: 'Marca',
  produto: 'Produto',
  fornecedor_produto: 'Fornecedor do Produto',
  origem: 'Origem do Movimento',
  tipo: 'Tipo (Entrada ou Saída)',
}

export const DICIONARIO_AGRUPAMENTOS_CONTAS_PAGAR: Record<AgrupamentoContasPagar, string> = {
  empresa: 'Empresa / Filial',
  fornecedor: 'Fornecedor',
  plano_contas: 'Plano de Contas',
  centro_custo: 'Centro de Custo',
  situacao: 'Situação (Status)',
  origem: 'Origem do Título',
  mes_vencimento: 'Mês de Vencimento',
  faixa_atraso: 'Faixa de Atraso',
}

export const DICIONARIO_AGRUPAMENTOS_CONTAS_RECEBER: Record<AgrupamentoContasReceber, string> = {
  empresa: 'Empresa / Filial',
  cliente: 'Cliente',
  plano_contas: 'Plano de Contas',
  centro_custo: 'Centro de Custo',
  situacao: 'Situação (Status)',
  origem: 'Origem do Título',
  mes_vencimento: 'Mês de Vencimento',
  faixa_atraso: 'Faixa de Atraso',
}

export const DICIONARIO_AGRUPAMENTOS_MOVIMENTACOES_FINANCEIRAS: Record<
  AgrupamentoMovimentacoesFinanceiras,
  string
> = {
  empresa: 'Empresa / Filial',
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano',
  conta_financeira: 'Conta Financeira',
  plano_contas: 'Plano de Contas',
  centro_custo: 'Centro de Custo',
  origem: 'Origem do Movimento',
  tipo: 'Tipo (Entrada ou Saída)',
}

export const DICIONARIO_VALORES_VENDAS: Record<
  ValorMetricaVendas,
  { label: string; formato: 'moeda' | 'numero' | 'percentual'; sigilo?: boolean }
> = {
  quantidade: { label: 'Quantidade', formato: 'numero' },
  valor_bruto: { label: 'Valor Bruto', formato: 'moeda' },
  desconto: { label: 'Desconto', formato: 'moeda' },
  valor_liquido: { label: 'Valor Líquido (Faturamento)', formato: 'moeda' },
  custo: { label: 'Custo Total (CMV)', formato: 'moeda', sigilo: true },
  margem_valor: { label: 'Margem Bruta (R$)', formato: 'moeda', sigilo: true },
  margem_percentual: { label: 'Margem Bruta (%)', formato: 'percentual', sigilo: true },
  quantidade_vendas: { label: 'Qtd. de Vendas', formato: 'numero' },
  ticket_medio: { label: 'Ticket Médio', formato: 'moeda' },
  preco_medio: { label: 'Preço Médio Unitário', formato: 'moeda' },
  percentual_total: { label: '% sobre o Total', formato: 'percentual' },
}

export const DICIONARIO_VALORES_COMPRAS: Record<
  ValorMetricaCompras,
  { label: string; formato: 'moeda' | 'numero' | 'percentual' }
> = {
  quantidade: { label: 'Quantidade Comprada', formato: 'numero' },
  valor_produtos: { label: 'Valor dos Produtos', formato: 'moeda' },
  frete: { label: 'Frete Rateado', formato: 'moeda' },
  ipi: { label: 'IPI', formato: 'moeda' },
  icms_st: { label: 'ICMS ST', formato: 'moeda' },
  credito_icms: { label: 'Crédito de ICMS', formato: 'moeda' },
  custo_total: { label: 'Custo Total de Entrada', formato: 'moeda' },
  quantidade_notas: { label: 'Qtd. de Notas', formato: 'numero' },
  preco_medio: { label: 'Preço Médio Unitário', formato: 'moeda' },
  percentual_total: { label: '% sobre o Total', formato: 'percentual' },
}

export const DICIONARIO_VALORES_ESTOQUE_DATA: Record<
  ValorMetricaEstoqueData,
  { label: string; formato: 'moeda' | 'numero' | 'percentual'; sigilo?: boolean }
> = {
  quantidade: { label: 'Saldo em Estoque', formato: 'numero' },
  custo_medio: { label: 'Custo Médio Unitário', formato: 'moeda', sigilo: true },
  valor_estoque: { label: 'Valor do Estoque', formato: 'moeda', sigilo: true },
  percentual_total: { label: '% sobre o Total', formato: 'percentual' },
}

export const DICIONARIO_VALORES_ESTOQUE_MOVIMENTOS: Record<
  ValorMetricaEstoqueMovimentos,
  { label: string; formato: 'moeda' | 'numero'; sigilo?: boolean }
> = {
  quantidade: { label: 'Quantidade Movimentada', formato: 'numero' },
  valor: { label: 'Valor do Movimento', formato: 'moeda', sigilo: true },
}

export const DICIONARIO_VALORES_CONTAS_PAGAR: Record<
  ValorMetricaContasPagar,
  { label: string; formato: 'moeda' | 'numero' }
> = {
  valor_original: { label: 'Valor Original', formato: 'moeda' },
  valor_pago: { label: 'Valor Pago', formato: 'moeda' },
  saldo: { label: 'Saldo a Pagar', formato: 'moeda' },
  quantidade_titulos: { label: 'Qtd. de Títulos', formato: 'numero' },
  atraso_medio: { label: 'Atraso Médio (dias)', formato: 'numero' },
}

export const DICIONARIO_VALORES_CONTAS_RECEBER: Record<
  ValorMetricaContasReceber,
  { label: string; formato: 'moeda' | 'numero' }
> = {
  valor_original: { label: 'Valor Original', formato: 'moeda' },
  valor_recebido: { label: 'Valor Recebido', formato: 'moeda' },
  saldo: { label: 'Saldo a Receber', formato: 'moeda' },
  quantidade_titulos: { label: 'Qtd. de Títulos', formato: 'numero' },
  atraso_medio: { label: 'Atraso Médio (dias)', formato: 'numero' },
}

export const DICIONARIO_VALORES_MOVIMENTACOES_FINANCEIRAS: Record<
  ValorMetricaMovimentacoesFinanceiras,
  { label: string; formato: 'moeda' }
> = {
  entradas: { label: 'Entradas (Créditos)', formato: 'moeda' },
  saidas: { label: 'Saídas (Débitos)', formato: 'moeda' },
  saldo_periodo: { label: 'Saldo do Período', formato: 'moeda' },
}
