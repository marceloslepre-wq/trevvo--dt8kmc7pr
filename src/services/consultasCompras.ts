/**
 * Serviços de Consulta de Compras e Entradas (Etapa 3)
 *
 * 1. listarItensComprados: lista paginada de itens de notas lançadas com filtros por data entrada, fornecedor, produto, grupo, cfop
 * 2. listarEntradasDoProduto: últimas 20 entradas de um produto em notas lançadas
 * 3. listarNotasDoFornecedorComTotais: notas de entrada lançadas do fornecedor com agrupamento anual
 */

import pb from '@/lib/pocketbase/client'
import { NotaEntrada, NotaEntradaItem } from './notasEntrada'

export interface ItemCompradoLinha {
  id: string
  item_id: string
  nota_id: string
  empresa_id: string
  data_entrada: string
  data_emissao: string
  modelo: string
  serie: string
  numero_nota: number
  chave_acesso?: string
  fornecedor_id?: string
  fornecedor_nome: string
  fornecedor_cnpj?: string
  fornecedor_uf?: string
  produto_id?: string
  produto_codigo?: number
  produto_descricao: string
  unidade_sigla?: string
  grupo_id?: string
  grupo_nome?: string
  cfop_entrada: string
  quantidade_fornecedor: number
  fator_conversao: number
  quantidade_estoque: number
  custo_unitario: number
  valor_total_item: number
  custo_total_item: number
}

export interface ListarItensCompradosParams {
  empresaIds: string[]
  dataInicio?: string // YYYY-MM-DD
  dataFim?: string // YYYY-MM-DD
  fornecedorId?: string
  produtoId?: string
  grupoId?: string
  cfopEntrada?: string
  busca?: string
  page?: number
  perPage?: number
}

export interface ResultadoPaginadoItensComprados {
  items: ItemCompradoLinha[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
  totais: {
    quantidadeTotal: number
    valorTotal: number
  }
}

/**
 * Lista itens de notas de entrada LANÇADAS com filtros
 */
export async function listarItensComprados(
  params: ListarItensCompradosParams,
): Promise<ResultadoPaginadoItensComprados> {
  const {
    empresaIds,
    dataInicio,
    dataFim,
    fornecedorId,
    produtoId,
    grupoId,
    cfopEntrada,
    busca,
    page = 1,
    perPage = 25,
  } = params

  // 1. Filtrar notas de entrada Lançadas das empresas selecionadas (uma ou várias)
  const idsValidos = (empresaIds || []).filter(Boolean)
  if (idsValidos.length === 0) {
    return {
      items: [],
      totalItems: 0,
      totalPages: 0,
      page,
      perPage,
      totais: { quantidadeTotal: 0, valorTotal: 0 },
    }
  }

  const filtroEmpresas =
    idsValidos.length === 1
      ? `empresa_id = '${idsValidos[0]}'`
      : `(${idsValidos.map((id) => `empresa_id = '${id}'`).join(' || ')})`

  const condicoesNotas: string[] = [filtroEmpresas, `status = 'Lançada'`, `ativo = true`]

  if (fornecedorId && fornecedorId !== 'todos') {
    condicoesNotas.push(`fornecedor_id = '${fornecedorId}'`)
  }
  if (dataInicio) {
    condicoesNotas.push(`data_entrada >= '${dataInicio}'`)
  }
  if (dataFim) {
    condicoesNotas.push(`data_entrada <= '${dataFim}'`)
  }

  const notasLancadas = await pb.collection('notas_entrada').getFullList<NotaEntrada>({
    filter: condicoesNotas.join(' && '),
    sort: '-data_entrada,-numero',
    expand: 'fornecedor_id',
  })

  if (notasLancadas.length === 0) {
    return {
      items: [],
      totalItems: 0,
      totalPages: 0,
      page,
      perPage,
      totais: { quantidadeTotal: 0, valorTotal: 0 },
    }
  }

  // Mapa de notas por ID para lookup rápido
  const mapaNotas = new Map<string, NotaEntrada>()
  for (const n of notasLancadas) {
    mapaNotas.set(n.id, n)
  }

  const notaIds = Array.from(mapaNotas.keys())

  // 2. Buscar itens pertencentes a essas notas
  const condicoesItens: string[] = ['ativo = true']
  if (produtoId && produtoId !== 'todos') {
    condicoesItens.push(`produto_id = '${produtoId}'`)
  }
  if (cfopEntrada && cfopEntrada !== 'todos') {
    condicoesItens.push(`cfop_entrada = '${cfopEntrada}'`)
  }

  const filtroBaseItens = condicoesItens.join(' && ')

  // Buscar itens em lotes para suportar grandes volumes de notas
  let todosItens: NotaEntradaItem[] = []
  const tamanhoLote = 40

  for (let i = 0; i < notaIds.length; i += tamanhoLote) {
    const lote = notaIds.slice(i, i + tamanhoLote)
    const filtroLoteNotas = lote.map((id) => `nota_id = '${id}'`).join(' || ')
    const filtroFinal = `(${filtroLoteNotas}) && ${filtroBaseItens}`

    try {
      const resLote = await pb.collection('notas_entrada_itens').getFullList<NotaEntradaItem>({
        filter: filtroFinal,
        expand: 'produto_id.unidade_id,produto_id.grupo_id',
      })
      todosItens = todosItens.concat(resLote)
    } catch (err) {
      console.warn('Erro ao buscar lote de itens comprados:', err)
    }
  }

  // 3. Montar linhas e aplicar filtros em memória (grupo e busca textual)
  let linhas: ItemCompradoLinha[] = []
  const buscaTerm = busca?.trim().toLowerCase() || ''

  for (const it of todosItens) {
    const nota = mapaNotas.get(it.nota_id)
    if (!nota) continue

    const prod = (it.expand?.produto_id as any) || null
    const forn = nota.expand?.fornecedor_id || null

    // Filtro por grupo do produto
    if (grupoId && grupoId !== 'todos') {
      if (!prod || prod.grupo_id !== grupoId) continue
    }

    const fornecedorNome = forn?.razao_social || forn?.nome_fantasia || 'Não informado'
    const produtoDesc = prod?.descricao || it.descricao_fornecedor || 'Item'
    const produtoCodigo = prod?.codigo
    const cfop = it.cfop_entrada || it.cfop_fornecedor || ''

    // Filtro por texto de busca
    if (buscaTerm) {
      const matchTexto =
        produtoDesc.toLowerCase().includes(buscaTerm) ||
        fornecedorNome.toLowerCase().includes(buscaTerm) ||
        String(nota.numero).includes(buscaTerm) ||
        (produtoCodigo && String(produtoCodigo).includes(buscaTerm)) ||
        cfop.includes(buscaTerm)
      if (!matchTexto) continue
    }

    const qtdEstoque = Number(it.quantidade_estoque) || Number(it.quantidade_fornecedor) || 0
    const custoUnit =
      Number(it.custo_unitario_estoque) ||
      (qtdEstoque > 0
        ? (Number(it.custo_total_item) || Number(it.valor_produto) || 0) / qtdEstoque
        : 0)
    const valTotalItem = Number(it.valor_produto) || 0
    const custoTot = Number(it.custo_total_item) || valTotalItem

    linhas.push({
      id: it.id,
      item_id: it.id,
      nota_id: nota.id,
      empresa_id: nota.empresa_id,
      data_entrada: nota.data_entrada,
      data_emissao: nota.data_emissao,
      modelo: nota.modelo || '55',
      serie: nota.serie || '',
      numero_nota: nota.numero,
      chave_acesso: nota.chave_acesso,
      fornecedor_id: nota.fornecedor_id,
      fornecedor_nome: fornecedorNome,
      fornecedor_cnpj: forn?.cpf_cnpj,
      fornecedor_uf: forn?.uf,
      produto_id: it.produto_id,
      produto_codigo: produtoCodigo,
      produto_descricao: produtoDesc,
      unidade_sigla: prod?.expand?.unidade_id?.sigla || it.unidade_fornecedor,
      grupo_id: prod?.grupo_id,
      grupo_nome: prod?.expand?.grupo_id?.nome,
      cfop_entrada: cfop,
      quantidade_fornecedor: Number(it.quantidade_fornecedor) || 0,
      fator_conversao: Number(it.fator_conversao) || 1,
      quantidade_estoque: qtdEstoque,
      custo_unitario: custoUnit,
      valor_total_item: valTotalItem,
      custo_total_item: custoTot,
    })
  }

  // Ordenar por data de entrada decrescente e número da nota
  linhas.sort((a, b) => {
    if (a.data_entrada !== b.data_entrada) {
      return b.data_entrada.localeCompare(a.data_entrada)
    }
    return b.numero_nota - a.numero_nota
  })

  // Calcular totais
  const quantidadeTotal = linhas.reduce((acc, l) => acc + l.quantidade_estoque, 0)
  const valorTotal = linhas.reduce((acc, l) => acc + l.valor_total_item, 0)

  // Paginação
  const totalItems = linhas.length
  const totalPages = Math.ceil(totalItems / perPage)
  const startIndex = (page - 1) * perPage
  const paginatedItems = linhas.slice(startIndex, startIndex + perPage)

  return {
    items: paginatedItems,
    totalItems,
    totalPages,
    page,
    perPage,
    totais: {
      quantidadeTotal,
      valorTotal,
    },
  }
}

/**
 * Consulta as últimas 20 entradas de um produto em notas LANÇADAS
 * Utilizado na aba "Compras" do cadastro de produtos
 */
export interface EntradaHistoricoProduto {
  id: string
  nota_id: string
  data_entrada: string
  data_emissao: string
  fornecedor_nome: string
  fornecedor_id?: string
  numero_nota: number
  serie?: string
  modelo?: string
  quantidade_estoque: number
  unidade_sigla?: string
  custo_unitario: number
  valor_total: number
}

export async function listarEntradasDoProduto(
  produtoId: string,
  empresaId?: string,
): Promise<EntradaHistoricoProduto[]> {
  if (!produtoId) return []

  try {
    // Buscar até 50 itens mais recentes do produto
    const itens = await pb.collection('notas_entrada_itens').getFullList<
      NotaEntradaItem & {
        expand?: {
          nota_id?: {
            id: string
            numero: number
            serie?: string
            modelo?: string
            status: string
            ativo?: boolean
            empresa_id: string
            data_entrada: string
            data_emissao: string
            fornecedor_id: string
            expand?: {
              fornecedor_id?: {
                razao_social?: string
                nome_fantasia?: string
              }
            }
          }
          produto_id?: {
            expand?: {
              unidade_id?: {
                sigla: string
              }
            }
          }
        }
      }
    >({
      filter: `produto_id = '${produtoId}' && ativo = true`,
      sort: '-created',
      expand: 'nota_id,nota_id.fornecedor_id,produto_id.unidade_id',
    })

    const resultado: EntradaHistoricoProduto[] = []

    for (const it of itens) {
      const nota = it.expand?.nota_id || null
      if (!nota) continue

      // Apenas notas LANÇADAS
      if (nota.status !== 'Lançada' || nota.ativo === false) continue
      if (empresaId && nota.empresa_id !== empresaId) continue

      const forn = nota.expand?.fornecedor_id || null
      const prod = it.expand?.produto_id as any

      const qtdEstoque = Number(it.quantidade_estoque) || Number(it.quantidade_fornecedor) || 0
      const custoUnit =
        Number(it.custo_unitario_estoque) ||
        (qtdEstoque > 0
          ? (Number(it.custo_total_item) || Number(it.valor_produto) || 0) / qtdEstoque
          : 0)

      resultado.push({
        id: it.id,
        nota_id: nota.id,
        data_entrada: nota.data_entrada,
        data_emissao: nota.data_emissao,
        fornecedor_nome: forn?.razao_social || forn?.nome_fantasia || 'Não informado',
        fornecedor_id: nota.fornecedor_id,
        numero_nota: nota.numero,
        serie: nota.serie,
        modelo: nota.modelo,
        quantidade_estoque: qtdEstoque,
        unidade_sigla: prod?.expand?.unidade_id?.sigla || it.unidade_fornecedor,
        custo_unitario: custoUnit,
        valor_total: Number(it.valor_produto) || 0,
      })
    }

    // Ordenar por data de entrada desc e pegar 20
    resultado.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))
    return resultado.slice(0, 20)
  } catch (err) {
    console.warn('Erro ao buscar histórico de entradas do produto:', err)
    return []
  }
}

/**
 * Consulta notas de entrada do fornecedor com agrupamento anual
 * Utilizado na aba "Notas" do cadastro de fornecedores
 */
export interface NotaFornecedorComResumo {
  id: string
  numero: number
  serie?: string
  modelo: string
  chave_acesso?: string
  data_emissao: string
  data_entrada: string
  status: string
  valor_total: number
  itens_count?: number
  tipo_entrada: string
}

export interface HistoricoNotasFornecedorResultado {
  notas: NotaFornecedorComResumo[]
  totaisPorAno: Array<{
    ano: number
    quantidadeNotas: number
    valorTotal: number
  }>
  totalGeralNotas: number
  valorGeralTotal: number
}

export async function listarNotasDoFornecedorComTotais(
  fornecedorId: string,
  empresaId?: string,
): Promise<HistoricoNotasFornecedorResultado> {
  if (!fornecedorId) {
    return {
      notas: [],
      totaisPorAno: [],
      totalGeralNotas: 0,
      valorGeralTotal: 0,
    }
  }

  const condicoes: string[] = [`fornecedor_id = '${fornecedorId}'`, `ativo = true`]
  if (empresaId) {
    condicoes.push(`empresa_id = '${empresaId}'`)
  }

  try {
    const notasRec = await pb.collection('notas_entrada').getFullList<NotaEntrada>({
      filter: condicoes.join(' && '),
      sort: '-data_entrada,-data_emissao,-numero',
    })

    const notas: NotaFornecedorComResumo[] = notasRec.map((n) => ({
      id: n.id,
      numero: n.numero,
      serie: n.serie,
      modelo: n.modelo || '55',
      chave_acesso: n.chave_acesso,
      data_emissao: n.data_emissao,
      data_entrada: n.data_entrada,
      status: n.status,
      valor_total: Number(n.valor_total) || 0,
      tipo_entrada: n.tipo_entrada,
    }))

    // Agrupamento por ano com base na data_entrada (ou emissão se entrada faltar)
    const mapaAnos = new Map<number, { ano: number; quantidadeNotas: number; valorTotal: number }>()

    for (const n of notas) {
      const dataRef = n.data_entrada || n.data_emissao
      const ano = dataRef ? parseInt(dataRef.slice(0, 4), 10) : new Date().getFullYear()

      if (!mapaAnos.has(ano)) {
        mapaAnos.set(ano, { ano, quantidadeNotas: 1, valorTotal: n.valor_total })
      } else {
        const itemAno = mapaAnos.get(ano)!
        itemAno.quantidadeNotas += 1
        itemAno.valorTotal += n.valor_total
      }
    }

    const totaisPorAno = Array.from(mapaAnos.values()).sort((a, b) => b.ano - a.ano)
    const totalGeralNotas = notas.length
    const valorGeralTotal = notas.reduce((acc, n) => acc + n.valor_total, 0)

    return {
      notas,
      totaisPorAno,
      totalGeralNotas,
      valorGeralTotal,
    }
  } catch (err) {
    console.warn('Erro ao buscar notas do fornecedor:', err)
    return {
      notas: [],
      totaisPorAno: [],
      totalGeralNotas: 0,
      valorGeralTotal: 0,
    }
  }
}
