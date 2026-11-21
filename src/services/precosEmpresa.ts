import pb from '@/lib/pocketbase/client'
import type { Produto } from '@/services/produtos'

/**
 * Preço de venda por loja (empresa) — coleção produtos_precos_empresa (migration 0139).
 * Sem registro para a empresa = vale o preço geral produtos.preco_venda.
 */
export interface PrecoEmpresa {
  id?: string
  assinante_id?: string
  produto_id: string
  empresa_id: string
  preco_venda?: number | null
}

export async function listarPrecosDoProduto(produtoId: string): Promise<PrecoEmpresa[]> {
  return pb.collection('produtos_precos_empresa').getFullList<PrecoEmpresa>({
    filter: `produto_id = '${produtoId}'`,
    requestKey: null,
  })
}

/** Grava (ou remove, quando preco é null) o preço próprio do produto na empresa. */
export async function salvarPrecoEmpresa(
  produtoId: string,
  empresaId: string,
  preco: number | null,
  assinanteId?: string | null,
): Promise<void> {
  let existente: PrecoEmpresa | null = null
  try {
    existente = await pb
      .collection('produtos_precos_empresa')
      .getFirstListItem<PrecoEmpresa>(`produto_id = '${produtoId}' && empresa_id = '${empresaId}'`, {
        requestKey: null,
      })
  } catch {
    existente = null
  }
  if (preco === null || Number.isNaN(preco)) {
    if (existente?.id) await pb.collection('produtos_precos_empresa').delete(existente.id)
    return
  }
  const valor = Number(preco.toFixed(2))
  if (existente?.id) {
    await pb.collection('produtos_precos_empresa').update(existente.id, { preco_venda: valor })
  } else {
    await pb.collection('produtos_precos_empresa').create({
      assinante_id: assinanteId || undefined,
      produto_id: produtoId,
      empresa_id: empresaId,
      preco_venda: valor,
    })
  }
}

/** Mapa produto_id -> preço próprio da empresa (todas as linhas da empresa). */
export async function mapaPrecosDaEmpresa(empresaId: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (!empresaId) return mapa
  try {
    const linhas = await pb.collection('produtos_precos_empresa').getFullList<PrecoEmpresa>({
      filter: `empresa_id = '${empresaId}'`,
      fields: 'produto_id,preco_venda',
      requestKey: null,
    })
    for (const l of linhas) {
      const v = Number(l.preco_venda)
      if (v > 0) mapa.set(l.produto_id, v)
    }
  } catch (err) {
    console.warn('Falha ao carregar preços por loja:', err)
  }
  return mapa
}

/**
 * Devolve cópias dos produtos com preco_venda = preço da empresa (quando houver).
 * O preço geral fica em preco_venda_geral, para referência.
 */
export function aplicarMapaPrecos<T extends Produto>(produtos: T[], mapa: Map<string, number>): T[] {
  if (!mapa.size) return produtos
  return produtos.map((p) => {
    const proprio = mapa.get(p.id)
    if (proprio === undefined) return p
    return Object.assign({}, p, { preco_venda: proprio, preco_venda_geral: p.preco_venda })
  })
}

/** Busca e aplica os preços da empresa só para os produtos informados (listas pequenas). */
export async function aplicarPrecosDaEmpresa<T extends Produto>(
  produtos: T[],
  empresaId?: string | null,
): Promise<T[]> {
  if (!empresaId || produtos.length === 0) return produtos
  try {
    const ids = produtos.map((p) => `produto_id = '${p.id}'`)
    const mapa = new Map<string, number>()
    // Lotes de 40 para não estourar o tamanho do filtro
    for (let i = 0; i < ids.length; i += 40) {
      const lote = ids.slice(i, i + 40).join(' || ')
      const linhas = await pb.collection('produtos_precos_empresa').getFullList<PrecoEmpresa>({
        filter: `empresa_id = '${empresaId}' && (${lote})`,
        fields: 'produto_id,preco_venda',
        requestKey: null,
      })
      for (const l of linhas) {
        const v = Number(l.preco_venda)
        if (v > 0) mapa.set(l.produto_id, v)
      }
    }
    return aplicarMapaPrecos(produtos, mapa)
  } catch (err) {
    console.warn('Falha ao aplicar preços por loja:', err)
    return produtos
  }
}

/** Preço/valor recebido por produto e canal — coleção produtos_precos_canal. */
export interface PrecoCanal {
  id?: string
  assinante_id?: string
  produto_id: string
  canal_id: string
  preco?: number | null
  valor_recebido?: number | null
}

export async function listarPrecosCanalDoProduto(produtoId: string): Promise<PrecoCanal[]> {
  return pb.collection('produtos_precos_canal').getFullList<PrecoCanal>({
    filter: `produto_id = '${produtoId}'`,
    requestKey: null,
  })
}

/** Grava preço próprio e valor recebido do produto no canal (remove a linha se ambos vazios). */
export async function salvarPrecoCanal(
  produtoId: string,
  canalId: string,
  preco: number | null,
  valorRecebido: number | null,
  assinanteId?: string | null,
): Promise<void> {
  let existente: PrecoCanal | null = null
  try {
    existente = await pb
      .collection('produtos_precos_canal')
      .getFirstListItem<PrecoCanal>(`produto_id = '${produtoId}' && canal_id = '${canalId}'`, {
        requestKey: null,
      })
  } catch {
    existente = null
  }
  const vazio = (v: number | null) => v === null || Number.isNaN(v) || v <= 0
  if (vazio(preco) && vazio(valorRecebido)) {
    if (existente?.id) await pb.collection('produtos_precos_canal').delete(existente.id)
    return
  }
  const dados = {
    preco: vazio(preco) ? 0 : Number((preco as number).toFixed(2)),
    valor_recebido: vazio(valorRecebido) ? 0 : Number((valorRecebido as number).toFixed(2)),
  }
  if (existente?.id) {
    await pb.collection('produtos_precos_canal').update(existente.id, dados)
  } else {
    await pb.collection('produtos_precos_canal').create(
      Object.assign({ assinante_id: assinanteId || undefined, produto_id: produtoId, canal_id: canalId }, dados),
    )
  }
}
