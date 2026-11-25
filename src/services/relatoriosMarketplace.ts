import pb from '@/lib/pocketbase/client'
import { lerXlsx } from '@/lib/lerXlsx'

/**
 * Importação dos relatórios exportados da Amazon e da Shopee (enquanto não há integração):
 * lê o preço dos anúncios e o valor recebido por unidade nas vendas, acha o produto do
 * Trevvo (SKU = código da Tray, ou vínculo gravado) e grava em produtos_precos_canal.
 */

export type Marketplace = 'amazon' | 'shopee'

export interface AnuncioRelatorio {
  /** SKU do vendedor (Amazon: seller-sku; Shopee: SKU da variação ou de referência). */
  sku: string
  titulo: string
  preco: number
  /** Mediana do valor recebido por unidade; null sem vendas no período. */
  recebido: number | null
  unidades: number
  pedidos: number
}

export interface ProdutoTrevvo {
  id: string
  codigo: number
  descricao: string
  referencia: string
}

export interface LinhaImportacao {
  sku: string
  titulo: string
  preco: number
  recebido: number | null
  unidades: number
  produto: ProdutoTrevvo | null
  /** Como o produto foi achado: 'referencia' | 'codigo' | 'vinculo' | '' */
  origem: string
  situacao: string
  observacao: string
  /** Código do Trevvo sugerido (Amazon), para conferir antes de vincular. */
  sugestao?: string
}

// ---------------- utilidades ----------------

export function numeroBR(v: string | undefined | null): number {
  const s = String(v ?? '').trim()
  if (!s || s === '-') return 0
  // "1.234,56" ou "1234,56" (Amazon BR) ou "1234.56" (planilhas)
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  return Number(s) || 0
}

function mediana(vs: number[]): number | null {
  if (vs.length === 0) return null
  const a = vs.slice().sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  const r = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  return Math.round(r * 100) / 100
}

/** Parser de CSV com aspas (separador configurável). */
export function lerCsv(texto: string, sep = ','): string[][] {
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else aspas = false
      } else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) {
      linha.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += ch
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas
}

async function textoArquivo(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer()
  let t = new TextDecoder('utf-8').decode(buf)
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf)
  return t.replace(/^﻿/, '')
}

function indiceCabecalho(linhas: string[][], teste: (l: string[]) => boolean): number {
  for (let i = 0; i < Math.min(linhas.length, 60); i++) if (teste(linhas[i])) return i
  return -1
}

function col(cab: string[], ...nomes: string[]): number {
  const n = cab.map((c) => c.trim().toLowerCase())
  for (const nome of nomes) {
    const i = n.indexOf(nome.toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

// ---------------- Amazon ----------------

/**
 * Amazon: "Relatório de ofertas ativas" (.txt, tabulado) + "Relatório de transações por
 * intervalo de datas" (.csv). Valor recebido por pedido = soma do "total" de todas as linhas
 * do pedido (venda, tarifas, frete DBA). Só pedidos com um único SKU, com tarifa de envio/
 * tarifa já lançada e sem reembolso.
 */
export async function lerRelatoriosAmazon(
  ofertas: File,
  transacoes: File | null,
): Promise<AnuncioRelatorio[]> {
  const lo = lerCsv(await textoArquivo(ofertas), '\t')
  const io = indiceCabecalho(lo, (l) => l.includes('seller-sku'))
  if (io < 0) throw new Error('O arquivo de ofertas não tem a coluna "seller-sku".')
  const cabO = lo[io]
  const cSku = col(cabO, 'seller-sku')
  const cPreco = col(cabO, 'price')
  const cNome = col(cabO, 'item-name')
  const anuncios = new Map<string, AnuncioRelatorio>()
  for (const l of lo.slice(io + 1)) {
    const sku = (l[cSku] || '').trim()
    if (!sku) continue
    anuncios.set(sku, {
      sku,
      titulo: (l[cNome] || '').trim(),
      preco: Number(String(l[cPreco] || '').replace(',', '.')) || 0,
      recebido: null,
      unidades: 0,
      pedidos: 0,
    })
  }
  if (!transacoes) return Array.from(anuncios.values())

  const lt = lerCsv(await textoArquivo(transacoes), ',')
  const it = indiceCabecalho(lt, (l) => (l[0] || '').trim().toLowerCase() === 'data/hora')
  if (it < 0) throw new Error('O arquivo de transações não tem o cabeçalho "data/hora".')
  const cab = lt[it]
  const cTipo = col(cab, 'tipo')
  const cPedido = col(cab, 'id do pedido')
  const cSkuT = col(cab, 'sku')
  const cQtd = col(cab, 'quantidade')
  const cTotal = col(cab, 'total')
  const cDesc = col(cab, 'descrição', 'descricao')
  const pedidos = new Map<
    string,
    {
      skus: Set<string>
      qtd: number
      total: number
      temTarifa: boolean
      reembolso: boolean
      titulo: string
    }
  >()
  /** Unidades vendidas por SKU em todos os pedidos (também os com vários SKUs). */
  const vendidasSku = new Map<string, number>()
  for (const l of lt.slice(it + 1)) {
    const id = (l[cPedido] || '').trim()
    if (!id) continue
    const tipo = (l[cTipo] || '').trim().toLowerCase()
    let p = pedidos.get(id)
    if (!p) {
      p = { skus: new Set(), qtd: 0, total: 0, temTarifa: false, reembolso: false, titulo: '' }
      pedidos.set(id, p)
    }
    p.total += numeroBR(l[cTotal])
    if (tipo === 'pedido') {
      const sku = (l[cSkuT] || '').trim()
      if (sku) p.skus.add(sku)
      p.qtd += Number(l[cQtd]) || 0
      if (sku) vendidasSku.set(sku, (vendidasSku.get(sku) || 0) + (Number(l[cQtd]) || 0))
      p.titulo = (l[cDesc] || '').trim()
    } else if (tipo.startsWith('reembolso')) p.reembolso = true
    else if (tipo.includes('envio') || tipo.includes('tarifa')) p.temTarifa = true
  }
  const porSku = new Map<string, number[]>()
  const tituloSku = new Map<string, string>()
  for (const p of Array.from(pedidos.values())) {
    if (p.skus.size !== 1 || p.qtd <= 0 || p.reembolso || !p.temTarifa) continue
    const sku = Array.from(p.skus)[0]
    const lista = porSku.get(sku) || []
    lista.push(p.total / p.qtd)
    porSku.set(sku, lista)
    tituloSku.set(sku, p.titulo)
  }
  for (const [sku, vs] of Array.from(porSku.entries())) {
    const a = anuncios.get(sku)
    if (a) {
      a.recebido = mediana(vs)
      a.pedidos = vs.length
    }
  }
  for (const [sku, qtd] of Array.from(vendidasSku.entries())) {
    const a = anuncios.get(sku)
    if (a) a.unidades = qtd
  }
  return Array.from(anuncios.values())
}

// ---------------- Shopee ----------------

/**
 * Shopee: "Editar em Massa > Informações de vendas" (.xlsx) + "Minha Renda" (.xlsx, aba Renda).
 * Na Minha Renda a coluna SKU traz o ID do anúncio; o SKU do vendedor vem do Editar em Massa.
 * Valor recebido por pedido = "Quantia total lançada"; unidades = preço do produto ÷ preço do
 * anúncio. Só pedidos com um único anúncio e sem reembolso; anúncios com variações de
 * produtos diferentes ficam só com o preço.
 */
export async function lerRelatoriosShopee(
  massa: File,
  renda: File | null,
): Promise<AnuncioRelatorio[]> {
  const lm = await lerXlsx(massa)
  const im = indiceCabecalho(lm, (l) => (l[0] || '').trim() === 'ID do Produto')
  if (im < 0) throw new Error('O arquivo do Editar em Massa não tem a coluna "ID do Produto".')
  const anuncios = new Map<string, AnuncioRelatorio>()
  const skusDoProduto = new Map<string, string[]>()
  for (const l of lm.slice(im + 1)) {
    const pid = (l[0] || '').trim()
    if (!/^\d+$/.test(pid)) continue
    const sku = ((l[5] || '').trim() || (l[4] || '').trim()).trim()
    if (!sku) continue
    const preco = Number(String(l[6] || '').replace(',', '.')) || 0
    const titulo = [(l[1] || '').trim(), (l[3] || '').trim()].filter(Boolean).join(' - ')
    if (!anuncios.has(sku)) {
      anuncios.set(sku, { sku, titulo, preco, recebido: null, unidades: 0, pedidos: 0 })
    }
    const lista = skusDoProduto.get(pid) || []
    if (!lista.includes(sku)) lista.push(sku)
    skusDoProduto.set(pid, lista)
  }
  if (!renda) return Array.from(anuncios.values())

  const lr = await lerXlsx(renda, 'Renda')
  const ir = indiceCabecalho(lr, (l) => l.includes('ID do pedido') && l.includes('SKU'))
  if (ir < 0) throw new Error('A aba "Renda" não tem as colunas "ID do pedido" e "SKU".')
  const cab = lr[ir]
  const cVer = col(cab, 'Ver')
  const cPed = col(cab, 'ID do pedido')
  const cReemb = col(cab, 'ID do reembolso')
  const cSku = col(cab, 'SKU')
  const cQuantia = col(cab, 'Quantia total lançada (R$)')
  const cPrecoProd = col(cab, 'Preço do produto')
  const cValReemb = col(cab, 'Valor do Reembolso')
  const pedidos = new Map<
    string,
    { ids: string[]; quantia: number; preco: number; reemb: boolean }
  >()
  for (const l of lr.slice(ir + 1)) {
    const id = (l[cPed] || '').trim()
    if (!id) continue
    const tipo = (l[cVer] || '').trim().toLowerCase()
    let p = pedidos.get(id)
    if (!p) {
      p = { ids: [], quantia: 0, preco: 0, reemb: false }
      pedidos.set(id, p)
    }
    const reembId = (l[cReemb] || '').trim()
    if ((reembId && reembId !== '-') || Math.abs(numeroBR(l[cValReemb])) > 0) p.reemb = true
    if (tipo === 'order') {
      p.quantia = numeroBR(l[cQuantia])
    } else if (tipo === 'sku') {
      p.ids.push((l[cSku] || '').trim())
      p.preco += numeroBR(l[cPrecoProd])
    }
  }
  const porSku = new Map<string, number[]>()
  const qtdSku = new Map<string, number>()
  for (const p of Array.from(pedidos.values())) {
    if (p.reemb || p.ids.length !== 1 || p.quantia <= 0) continue
    const skus = skusDoProduto.get(p.ids[0]) || []
    if (skus.length !== 1) continue // anúncio com variações: não dá para saber qual saiu
    const a = anuncios.get(skus[0])
    if (!a || a.preco <= 0) continue
    const qtd = Math.max(1, Math.round(p.preco / a.preco))
    const lista = porSku.get(a.sku) || []
    lista.push(p.quantia / qtd)
    porSku.set(a.sku, lista)
    qtdSku.set(a.sku, (qtdSku.get(a.sku) || 0) + qtd)
  }
  for (const [sku, vs] of Array.from(porSku.entries())) {
    const a = anuncios.get(sku)
    if (a) {
      a.recebido = mediana(vs)
      a.unidades = qtdSku.get(sku) || 0
      a.pedidos = vs.length
    }
  }
  return Array.from(anuncios.values())
}

// ---------------- Trevvo ----------------

export async function carregarProdutosTrevvo(assinanteId: string | null): Promise<ProdutoTrevvo[]> {
  return pb.collection('produtos').getFullList<ProdutoTrevvo>({
    filter: assinanteId ? pb.filter('assinante_id = {:a}', { a: assinanteId }) : '',
    fields: 'id,codigo,descricao,referencia',
    batch: 1000,
    requestKey: null,
  })
}

export async function carregarVinculos(
  empresaId: string,
  marketplace: Marketplace,
): Promise<Map<string, string>> {
  const recs = await pb.collection('produtos_vinculos_anuncios').getFullList<{
    produto_id: string
    anuncio_id: string
  }>({
    filter: pb.filter('empresa_id = {:e} && marketplace = {:m}', { e: empresaId, m: marketplace }),
    fields: 'produto_id,anuncio_id',
    requestKey: null,
  })
  return new Map(recs.map((r) => [r.anuncio_id, r.produto_id]))
}

/**
 * Acha o produto de cada anúncio.
 *  - Shopee: o SKU é a matrícula do Uniplus = Código do produto no Trevvo (vínculo tem prioridade).
 *  - Amazon: os SKUs são códigos da Amazon (ou misturam código da Tray, matrícula e EAN), então
 *    só vale o vínculo gravado; o código encontrado pelo SKU entra como sugestão para conferir.
 */
export function casarAnuncios(
  anuncios: AnuncioRelatorio[],
  produtos: ProdutoTrevvo[],
  vinculos: Map<string, string>,
  marketplace: Marketplace,
): LinhaImportacao[] {
  const porId = new Map(produtos.map((p) => [p.id, p]))
  const porRef = new Map<string, ProdutoTrevvo[]>()
  const porCodigo = new Map<string, ProdutoTrevvo>()
  for (const p of produtos) {
    const r = (p.referencia || '').trim()
    if (r) porRef.set(r, (porRef.get(r) || []).concat([p]))
    porCodigo.set(String(p.codigo), p)
  }
  return anuncios.map((a) => {
    const base = {
      sku: a.sku,
      titulo: a.titulo,
      preco: a.preco,
      recebido: a.recebido,
      unidades: a.unidades,
      sugestao: '',
    }
    const vinc = vinculos.get(a.sku)
    if (vinc && porId.get(vinc)) {
      return {
        ...base,
        produto: porId.get(vinc) || null,
        origem: 'vinculo',
        situacao: '',
        observacao: '',
      }
    }
    const pCodigo = /^\d+$/.test(a.sku) ? porCodigo.get(a.sku) : undefined
    if (marketplace === 'shopee') {
      if (pCodigo)
        return { ...base, produto: pCodigo, origem: 'codigo', situacao: '', observacao: '' }
      return {
        ...base,
        produto: null,
        origem: '',
        situacao: 'Sem produto no Trevvo',
        observacao: '',
      }
    }
    const refs = porRef.get(a.sku) || []
    const sugestao =
      refs.length === 1 ? String(refs[0].codigo) : pCodigo ? String(pCodigo.codigo) : ''
    const desc = refs.length === 1 ? refs[0].descricao : pCodigo ? pCodigo.descricao : ''
    return {
      ...base,
      sugestao,
      produto: null,
      origem: '',
      situacao: 'Sem vínculo',
      observacao: sugestao ? `sugestão: ${sugestao} ${desc}` : '',
    }
  })
}

/** Grava (ou atualiza) o vínculo anúncio -> produto. */
export async function gravarVinculo(
  assinanteId: string | null,
  empresaId: string,
  marketplace: Marketplace,
  sku: string,
  produtoId: string,
  titulo: string,
): Promise<void> {
  const antigos = await pb.collection('produtos_vinculos_anuncios').getFullList<{ id: string }>({
    filter: pb.filter('empresa_id = {:e} && marketplace = {:m} && anuncio_id = {:a}', {
      e: empresaId,
      m: marketplace,
      a: sku,
    }),
    fields: 'id',
    requestKey: null,
  })
  for (const r of antigos) await pb.collection('produtos_vinculos_anuncios').delete(r.id)
  await pb.collection('produtos_vinculos_anuncios').create({
    assinante_id: assinanteId || undefined,
    produto_id: produtoId,
    empresa_id: empresaId,
    marketplace,
    anuncio_id: sku.slice(0, 40),
    variacao_id: '',
    titulo: titulo.slice(0, 300),
  })
}

/**
 * Um valor por produto: entre os anúncios do mesmo produto, o de menor valor recebido
 * (margem conservadora); sem vendas, o de menor preço.
 */
export function valoresPorProduto(
  linhas: LinhaImportacao[],
): Map<
  string,
  {
    produto: ProdutoTrevvo
    preco: number
    recebido: number | null
    sku: string
    outros: number
    /** Soma das unidades vendidas de todos os anúncios do produto. */
    unidades: number
  }
> {
  const mapa = new Map<
    string,
    {
      produto: ProdutoTrevvo
      preco: number
      recebido: number | null
      sku: string
      outros: number
      unidades: number
    }
  >()
  for (const l of linhas) {
    if (!l.produto || l.preco <= 0) continue
    const atual = mapa.get(l.produto.id)
    if (!atual) {
      mapa.set(l.produto.id, {
        produto: l.produto,
        preco: l.preco,
        recebido: l.recebido,
        sku: l.sku,
        outros: 0,
        unidades: Number(l.unidades) || 0,
      })
      continue
    }
    atual.outros++
    atual.unidades += Number(l.unidades) || 0
    const melhor =
      l.recebido !== null && (atual.recebido === null || l.recebido < atual.recebido)
        ? true
        : l.recebido === null && atual.recebido === null && l.preco < atual.preco
    if (melhor) {
      atual.preco = l.preco
      atual.recebido = l.recebido
      atual.sku = l.sku
    }
  }
  return mapa
}
