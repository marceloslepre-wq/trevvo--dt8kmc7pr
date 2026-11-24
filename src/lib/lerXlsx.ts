/**
 * Leitor mínimo de planilhas .xlsx no navegador (sem biblioteca externa).
 * Lê o zip com DecompressionStream, as strings compartilhadas e as células de uma aba.
 * Devolve a aba como matriz de textos (linha x coluna). Serve para relatórios exportados
 * por marketplaces (Shopee), que às vezes vêm com detalhes de formatação fora do padrão.
 */

interface EntradaZip {
  nome: string
  metodo: number
  tamanhoComprimido: number
  inicioLocal: number
}

function lerEntradas(buf: ArrayBuffer): EntradaZip[] {
  const dv = new DataView(buf)
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás para frente.
  let fim = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new Error('Arquivo não é uma planilha .xlsx válida.')
  const total = dv.getUint16(fim + 10, true)
  let p = dv.getUint32(fim + 16, true)
  const dec = new TextDecoder()
  const entradas: EntradaZip[] = []
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const metodo = dv.getUint16(p + 10, true)
    const tamanhoComprimido = dv.getUint32(p + 20, true)
    const lenNome = dv.getUint16(p + 28, true)
    const lenExtra = dv.getUint16(p + 30, true)
    const lenComent = dv.getUint16(p + 32, true)
    const inicioLocal = dv.getUint32(p + 42, true)
    const nome = dec.decode(new Uint8Array(buf, p + 46, lenNome))
    entradas.push({ nome, metodo, tamanhoComprimido, inicioLocal })
    p += 46 + lenNome + lenExtra + lenComent
  }
  return entradas
}

async function extrair(buf: ArrayBuffer, e: EntradaZip): Promise<string> {
  const dv = new DataView(buf)
  const lenNome = dv.getUint16(e.inicioLocal + 26, true)
  const lenExtra = dv.getUint16(e.inicioLocal + 28, true)
  const ini = e.inicioLocal + 30 + lenNome + lenExtra
  const dados = new Uint8Array(buf, ini, e.tamanhoComprimido)
  if (e.metodo === 0) return new TextDecoder().decode(dados)
  if (e.metodo !== 8) throw new Error('Compressão da planilha não suportada.')
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([dados]).stream().pipeThrough(ds)
  return await new Response(stream).text()
}

function colunaParaIndice(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '')
  let n = 0
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64)
  return n - 1
}

function textoDe(el: Element | null): string {
  if (!el) return ''
  // <si> pode ter vários <t> (rich text)
  const ts = el.getElementsByTagName('t')
  let s = ''
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent || ''
  return s
}

/** Lista os nomes das abas da planilha. */
export async function abasXlsx(arquivo: File): Promise<string[]> {
  const buf = await arquivo.arrayBuffer()
  const entradas = lerEntradas(buf)
  const wb = entradas.find((e) => e.nome === 'xl/workbook.xml')
  if (!wb) return []
  const doc = new DOMParser().parseFromString(await extrair(buf, wb), 'application/xml')
  const sheets = doc.getElementsByTagName('sheet')
  const nomes: string[] = []
  for (let i = 0; i < sheets.length; i++) nomes.push(sheets[i].getAttribute('name') || '')
  return nomes
}

/**
 * Lê uma aba (pelo nome; sem nome = a primeira) e devolve as linhas como textos.
 * Números saem como texto no formato do arquivo (ponto decimal).
 */
export async function lerXlsx(arquivo: File, nomeAba?: string): Promise<string[][]> {
  const buf = await arquivo.arrayBuffer()
  const entradas = lerEntradas(buf)
  const porNome = new Map(entradas.map((e) => [e.nome, e]))
  const parser = new DOMParser()

  // Aba -> arquivo da aba, pelo workbook.xml + workbook.xml.rels
  let caminhoAba = 'xl/worksheets/sheet1.xml'
  const wb = porNome.get('xl/workbook.xml')
  const rels = porNome.get('xl/_rels/workbook.xml.rels')
  if (wb && rels) {
    const docWb = parser.parseFromString(await extrair(buf, wb), 'application/xml')
    const docRels = parser.parseFromString(await extrair(buf, rels), 'application/xml')
    const sheets = Array.from(docWb.getElementsByTagName('sheet'))
    const alvo = nomeAba
      ? sheets.find((s) => (s.getAttribute('name') || '').trim() === nomeAba)
      : sheets[0]
    if (nomeAba && !alvo) throw new Error(`A planilha não tem a aba "${nomeAba}".`)
    if (alvo) {
      const rid =
        alvo.getAttribute('r:id') ||
        alvo.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id',
        )
      const rel = Array.from(docRels.getElementsByTagName('Relationship')).find(
        (r) => r.getAttribute('Id') === rid,
      )
      const t = rel?.getAttribute('Target') || ''
      if (t) caminhoAba = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '')
    }
  }

  const compartilhadas: string[] = []
  const ss = porNome.get('xl/sharedStrings.xml')
  if (ss) {
    const docSs = parser.parseFromString(await extrair(buf, ss), 'application/xml')
    const sis = docSs.getElementsByTagName('si')
    for (let i = 0; i < sis.length; i++) compartilhadas.push(textoDe(sis[i]))
  }

  const entradaAba = porNome.get(caminhoAba)
  if (!entradaAba) throw new Error('Aba da planilha não encontrada no arquivo.')
  const doc = parser.parseFromString(await extrair(buf, entradaAba), 'application/xml')
  const linhas: string[][] = []
  const rows = doc.getElementsByTagName('row')
  for (let i = 0; i < rows.length; i++) {
    const linha: string[] = []
    const cs = rows[i].getElementsByTagName('c')
    for (let j = 0; j < cs.length; j++) {
      const c = cs[j]
      const idx = colunaParaIndice(c.getAttribute('r') || '')
      const tipo = c.getAttribute('t')
      let valor = ''
      if (tipo === 's') {
        const v = c.getElementsByTagName('v')[0]?.textContent || ''
        valor = compartilhadas[Number(v)] ?? ''
      } else if (tipo === 'inlineStr') {
        valor = textoDe(c.getElementsByTagName('is')[0] || null)
      } else {
        valor = c.getElementsByTagName('v')[0]?.textContent || ''
      }
      while (linha.length < idx) linha.push('')
      linha[idx >= 0 ? idx : linha.length] = valor
    }
    linhas.push(linha)
  }
  return linhas
}
