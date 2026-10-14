import pb from '@/lib/pocketbase/client'
import type { Produto } from '@/services/produtos'
import type { Cliente } from '@/services/clientes'
import type { ConfigVendasEmpresa } from '@/services/configVendas'
import { decodificarEtiquetaBalanca, ResultadoLeituraBalanca } from '@/services/balanca'

export interface ItemCarrinhoPDV {
  tempId: string
  item: number
  produto_id: string
  codigo?: number
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  preco_tabela: number
  desconto_percentual: number
  desconto_valor: number
  acrescimo_valor: number
  valor_total: number
  foto?: string
  peso_liquido_kg?: number
  saldo_estoque?: number
  eh_balanca?: boolean
  ncm?: string
  cest?: string
  cfop?: string
  cst_icms?: string
  csosn?: string
  aliquota_icms?: number
  cst_pis?: string
  cst_cofins?: string
}

export interface VendaRascunhoPDV {
  versao: number
  timestamp: number
  empresa_id: string
  terminal_id?: string
  caixa_sessao_id?: string
  cliente_id: string
  cliente_nome?: string
  cpf_cnpj_consumidor?: string
  vendedor_id?: string
  vendedor_nome?: string
  desconto_total_valor: number
  itens: ItemCarrinhoPDV[]
}

const STORAGE_KEY_RASCUNHO = 'pdv_venda_em_andamento'
const STORAGE_KEY_PRODUTOS = 'pdv_cache_produtos_v1'
const CACHE_EXPIRACAO_MS = 5 * 60 * 1000 // 5 minutos

/**
 * Salva rascunho da venda em andamento no localStorage
 */
export function salvarRascunhoPDV(rascunho: VendaRascunhoPDV): void {
  try {
    localStorage.setItem(STORAGE_KEY_RASCUNHO, JSON.stringify(rascunho))
  } catch (err) {
    console.warn('Erro ao salvar rascunho PDV:', err)
  }
}

/**
 * Obtém rascunho da venda em andamento do localStorage
 */
export function obterRascunhoPDV(empresaId?: string): VendaRascunhoPDV | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RASCUNHO)
    if (!raw) return null
    const obj: VendaRascunhoPDV = JSON.parse(raw)
    if (empresaId && obj.empresa_id !== empresaId) return null
    if (!Array.isArray(obj.itens) || obj.itens.length === 0) return null
    return obj
  } catch {
    return null
  }
}

/**
 * Limpa o rascunho da venda
 */
export function limparRascunhoPDV(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_RASCUNHO)
  } catch {
    /* intentionally ignored */
  }
}

/**
 * Cache de produtos do PDV em memória / localStorage para leitura ultra-rápida (5 minutos de TTL)
 */
export interface CacheProdutosPDV {
  produtos: Produto[]
  timestamp: number
}

let produtosMemoriaCache: Produto[] | null = null
let timestampMemoria = 0

export async function carregarCatalogoProdutosPDV(
  empresaId: string,
  forcarAtualizacao = false,
): Promise<Produto[]> {
  const agora = Date.now()

  if (
    !forcarAtualizacao &&
    produtosMemoriaCache &&
    produtosMemoriaCache.length > 0 &&
    agora - timestampMemoria < CACHE_EXPIRACAO_MS
  ) {
    return produtosMemoriaCache
  }

  // Tenta localStorage se não forçar
  if (!forcarAtualizacao) {
    try {
      const storageRaw = localStorage.getItem(`${STORAGE_KEY_PRODUTOS}_${empresaId}`)
      if (storageRaw) {
        const parsed: CacheProdutosPDV = JSON.parse(storageRaw)
        if (agora - parsed.timestamp < CACHE_EXPIRACAO_MS && parsed.produtos.length > 0) {
          produtosMemoriaCache = parsed.produtos
          timestampMemoria = parsed.timestamp
          return parsed.produtos
        }
      }
    } catch {
      /* intentionally ignored */
    }
  }

  // Busca lista de produtos ativos da base
  try {
    const itens = await pb.collection('produtos').getFullList<Produto>({
      filter: 'ativo = true',
      sort: 'descricao',
      expand: 'unidade_id,marca_id',
      requestKey: null,
    })

    produtosMemoriaCache = itens
    timestampMemoria = agora

    try {
      localStorage.setItem(
        `${STORAGE_KEY_PRODUTOS}_${empresaId}`,
        JSON.stringify({
          produtos: itens,
          timestamp: agora,
        }),
      )
    } catch {
      /* intentionally ignored */
    }

    return itens
  } catch (err) {
    console.error('Falha ao carregar catálogo de produtos do PDV:', err)
    if (produtosMemoriaCache) return produtosMemoriaCache
    return []
  }
}

/**
 * Resolve a entrada digitada no campo de leitura do PDV.
 * Suporta:
 * 1) Multiplicação: "3*7891000000014" ou "2.5*101"
 * 2) Etiqueta de balança (EAN-13 iniciando com balanca_prefixo)
 * 3) GTIN / Código de barras
 * 4) Código numérico interno
 * 5) Referência de fábrica
 */
export interface ResultadoInterpretacaoLeitura {
  sucesso: boolean
  quantidade: number
  produto: Produto | null
  balanca?: ResultadoLeituraBalanca
  precoUnitario?: number
  valorTotalItem?: number
  mensagemErro?: string
}

export function interpretarEntradaPDV(
  entradaRaw: string,
  produtos: Produto[],
  configVendas?: ConfigVendasEmpresa | null,
): ResultadoInterpretacaoLeitura {
  const entrada = (entradaRaw || '').trim()
  if (!entrada) {
    return {
      sucesso: false,
      quantidade: 1,
      produto: null,
      mensagemErro: 'Informe um código ou produto.',
    }
  }

  let quantidade = 1
  let termoCodigo = entrada

  // 1. Verifica padrão "quantidade*código" (ex.: "3*7891000" ou "2,5*1001")
  if (entrada.includes('*')) {
    const partes = entrada.split('*')
    if (partes.length === 2) {
      const qtdStr = partes[0].trim().replace(',', '.')
      const codStr = partes[1].trim()
      const qtdNum = parseFloat(qtdStr)
      if (!isNaN(qtdNum) && qtdNum > 0) {
        quantidade = qtdNum
        termoCodigo = codStr
      }
    }
  }

  // 2. Verifica se é etiqueta de balança
  if (configVendas?.balanca_ativa) {
    const balanca = decodificarEtiquetaBalanca(termoCodigo, configVendas, produtos)
    if (balanca.ehEtiquetaBalanca) {
      if (balanca.erro) {
        return {
          sucesso: false,
          quantidade: 1,
          produto: null,
          mensagemErro: balanca.erro,
        }
      }

      // Se encontrou o produto associado pela balança
      const prodBalanca =
        balanca.produtoEncontrado ||
        produtos.find(
          (p) =>
            String(p.codigo) === balanca.codigoProduto ||
            p.gtin === balanca.codigoProduto ||
            p.referencia === balanca.codigoProduto,
        ) ||
        null

      if (!prodBalanca) {
        return {
          sucesso: false,
          quantidade: 1,
          produto: null,
          mensagemErro: `Produto com código "${balanca.codigoProduto}" da etiqueta de balança não foi localizado.`,
        }
      }

      if (balanca.tipo === 'Preço') {
        const precoUnit = prodBalanca.preco_venda || 0
        const valorTotalEtiqueta = balanca.valorTotal || 0
        const qtdKg = precoUnit > 0 ? Number((valorTotalEtiqueta / precoUnit).toFixed(3)) : 1

        return {
          sucesso: true,
          quantidade: qtdKg * quantidade,
          produto: prodBalanca,
          balanca,
          precoUnitario: precoUnit,
          valorTotalItem: valorTotalEtiqueta * quantidade,
        }
      } else {
        // Peso (gramas => kg)
        const pesoKg = balanca.pesoKg || 1
        const precoUnit = prodBalanca.preco_venda || 0
        return {
          sucesso: true,
          quantidade: pesoKg * quantidade,
          produto: prodBalanca,
          balanca,
          precoUnitario: precoUnit,
          valorTotalItem: Number((precoUnit * pesoKg * quantidade).toFixed(2)),
        }
      }
    }
  }

  // 3. Procura no catálogo em memória: GTIN, Código Interno, Referência ou Descrição Exata
  const termoUpper = termoCodigo.toUpperCase()
  const isNum = !isNaN(Number(termoCodigo))
  const numCodigo = isNum ? Number(termoCodigo) : null

  // 3a. GTIN exato
  let achado = produtos.find((p) => p.gtin && p.gtin.trim().toUpperCase() === termoUpper)

  // 3b. Código interno
  if (!achado && numCodigo !== null) {
    achado = produtos.find((p) => p.codigo === numCodigo)
  }

  // 3c. Referência
  if (!achado) {
    achado = produtos.find((p) => p.referencia && p.referencia.trim().toUpperCase() === termoUpper)
  }

  if (achado) {
    const preco =
      achado.preco_promocional && achado.preco_promocional > 0
        ? achado.preco_promocional
        : achado.preco_venda || 0
    return {
      sucesso: true,
      quantidade,
      produto: achado,
      precoUnitario: preco,
      valorTotalItem: Number((preco * quantidade).toFixed(2)),
    }
  }

  return {
    sucesso: false,
    quantidade,
    produto: null,
    mensagemErro: `Produto não localizado pelo código "${termoCodigo}". Pressione F2 para buscar.`,
  }
}
