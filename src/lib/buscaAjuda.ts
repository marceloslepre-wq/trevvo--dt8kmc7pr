import { ARTIGOS_AJUDA, type ArtigoAjuda } from '@/config/ajudaArtigos'
import { ROTAS, type ItemRota } from '@/config/tabelaRotas'

/** Minúsculas, sem acentos e sem pontuação: "Cancelar NF-e" -> "cancelar nf e" */
export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Palavras que não ajudam a achar o assunto
const VAZIAS = new Set(
  'como faco fazer para o a os as um uma de da do das dos no na nos nas em e eu que qual onde trevvo meu minha posso consigo quero preciso ver por favor'.split(
    ' ',
  ),
)

function palavras(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= 2 && !VAZIAS.has(p))
}

/** Uma palavra "bate" se for igual ou se uma começar pela outra (cancelar ~ cancelamento) */
function bate(a: string, b: string): boolean {
  if (a === b) return true
  const min = Math.min(a.length, b.length)
  if (min < 4) return false
  const raiz = Math.max(4, min - 2)
  return a.slice(0, raiz) === b.slice(0, raiz)
}

function pontuar(consulta: string[], frases: { texto: string; peso: number }[]): number {
  if (consulta.length === 0) return 0
  let total = 0
  let achadas = 0
  for (const q of consulta) {
    let melhor = 0
    for (const f of frases) {
      if (palavras(f.texto).some((p) => bate(p, q))) melhor = Math.max(melhor, f.peso)
    }
    if (melhor > 0) achadas++
    total += melhor
  }
  // Todas as palavras achadas vale mais que muitas achadas em parte
  return achadas === 0 ? 0 : total * (achadas / consulta.length)
}

export interface ResultadoArtigo {
  artigo: ArtigoAjuda
  pontos: number
}

export function buscarArtigos(
  consulta: string,
  podeAbrir: (rota: string) => boolean,
  limite = 6,
): ResultadoArtigo[] {
  const q = palavras(consulta)
  return ARTIGOS_AJUDA.filter((a) => podeAbrir(a.rota))
    .map((artigo) => {
      const frases = [
        { texto: artigo.titulo, peso: 3 },
        ...artigo.termos.map((t) => ({ texto: t, peso: 3 })),
        { texto: artigo.caminho, peso: 2 },
        ...artigo.passos.map((t) => ({ texto: t, peso: 1 })),
      ]
      // Frase inteira digitada igual a um termo: sobe para o topo
      const nq = normalizar(consulta)
      const extra = artigo.termos.some((t) => normalizar(t) === nq) ? 5 : 0
      return { artigo, pontos: pontuar(q, frases) + extra }
    })
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
}

export interface ResultadoTela {
  tela: ItemRota
  pontos: number
}

/** Telas do menu (sem rotas de detalhe) que combinam com a busca */
export function buscarTelas(
  consulta: string,
  temAcesso: (item: ItemRota) => boolean,
  limite = 6,
): ResultadoTela[] {
  const q = palavras(consulta)
  const vistos = new Set<string>()
  return ROTAS.filter((r) => !r.ocultoNoMenu && temAcesso(r))
    .filter((r) => {
      if (vistos.has(r.rota)) return false
      vistos.add(r.rota)
      return true
    })
    .map((tela) => ({
      tela,
      pontos: pontuar(q, [
        { texto: tela.rotulo, peso: 3 },
        { texto: tela.grupo, peso: 1 },
      ]),
    }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
}
