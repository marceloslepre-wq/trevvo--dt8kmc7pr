/** Formatadores compartilhados das telas do Trevvo Móvel (pt-BR). */

/** Moeda pt-BR (R$); aceita qualquer valor — não numérico vira 0. */
export function formatarMoedaBrl(v: unknown): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(Number(v)) ? Number(v) : 0,
  )
}
