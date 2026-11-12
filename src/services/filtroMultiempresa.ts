import pb from '@/lib/pocketbase/client'

/**
 * Monta o filtro OR multiempresa usado nos relatórios:
 * (empresa_id = "id1" || empresa_id = "id2" || ...)
 * Com uma única empresa devolve filtro simples; com lista vazia devolve 1 != 1 (nada).
 */
export function montarFiltroEmpresas(empresaIds: string[], campo = 'empresa_id'): string {
  const ids = (empresaIds || []).filter(Boolean)
  if (ids.length === 0) return `1 != 1`
  if (ids.length === 1) return `${campo} = '${ids[0]}'`
  return `(${ids.map((id) => `${campo} = '${id}'`).join(' || ')})`
}

/**
 * Busca os nomes das empresas (código + nome fantasia/razão social) para as quebras
 * por empresa dos relatórios. Nunca lança: em caso de erro devolve fallback genérico.
 */
export async function buscarNomesEmpresas(empresaIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set((empresaIds || []).filter(Boolean)))
  const mapa: Record<string, string> = {}
  if (ids.length === 0) return mapa

  try {
    const lista = await pb.collection('empresas').getFullList<any>({
      filter: montarFiltroEmpresas(ids),
      fields: 'id,codigo,nome_fantasia,razao_social',
      requestKey: null,
    })
    lista.forEach((e: any) => {
      const nome = e.nome_fantasia || e.razao_social || 'Empresa'
      mapa[e.id] = e.codigo ? `${e.codigo} - ${nome}` : nome
    })
  } catch {
    // nomes ficam com fallback na UI
  }

  for (const id of ids) {
    if (!mapa[id]) mapa[id] = 'Empresa'
  }
  return mapa
}
