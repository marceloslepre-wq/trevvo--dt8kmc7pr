import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Grava o código do produto na Tray no campo Referência dos produtos (decisão de 21/11/2026:
 * enquanto a Tray existir, a Referência guarda o código da Tray, que é o SKU dos anúncios do
 * Mercado Livre). Arquivo ";" com colunas: codigo (código do produto no Trevvo); codigo_tray.
 */

interface LinhaArquivo {
  codigo: number
  codigoTray: string
}

interface Previa {
  alterar: { id: string; codigo: number; de: string; para: string }[]
  iguais: number
  naoEncontrados: number[]
  invalidas: number
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function comRepeticao<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 429 && tentativa < 10) {
        await esperar(2000 * tentativa)
        continue
      }
      throw err
    }
  }
}

function lerArquivo(texto: string): { linhas: LinhaArquivo[]; invalidas: number } {
  const linhas: LinhaArquivo[] = []
  let invalidas = 0
  const brutas = texto.replace(/^﻿/, '').split(/\r?\n/)
  for (let i = 0; i < brutas.length; i++) {
    const b = brutas[i].trim()
    if (!b) continue
    const partes = b.split(';').map((p) => p.trim().replace(/^"|"$/g, ''))
    if (i === 0 && /codigo/i.test(partes[0])) continue
    const codigo = Number(partes[0])
    const codigoTray = String(partes[1] || '').trim()
    if (!Number.isInteger(codigo) || codigo <= 0 || !/^[A-Za-z0-9._\-/]{1,60}$/.test(codigoTray)) {
      invalidas++
      continue
    }
    linhas.push({ codigo, codigoTray })
  }
  return { linhas, invalidas }
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarCodigosTrayDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [lendo, setLendo] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [feitos, setFeitos] = useState(0)
  const [falhas, setFalhas] = useState<string[]>([])
  const [concluido, setConcluido] = useState(false)
  const [erro, setErro] = useState('')

  const limpar = () => {
    setPrevia(null)
    setFeitos(0)
    setFalhas([])
    setConcluido(false)
    setErro('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const fechar = () => {
    if (gravando) return
    if (concluido) onConcluido()
    limpar()
    onFechar()
  }

  const aoEscolher = async (arquivo?: File) => {
    if (!arquivo) return
    limpar()
    setLendo(true)
    try {
      const { linhas, invalidas } = lerArquivo(await arquivo.text())
      const produtos = await pb
        .collection('produtos')
        .getFullList<{ id: string; codigo: number; referencia?: string }>({
          fields: 'id,codigo,referencia',
          batch: 1000,
          requestKey: null,
        })
      const porCodigo = new Map<number, { id: string; referencia: string }>()
      for (const p of produtos) {
        porCodigo.set(Number(p.codigo), { id: p.id, referencia: (p.referencia || '').trim() })
      }
      const alterar: Previa['alterar'] = []
      const naoEncontrados: number[] = []
      let iguais = 0
      for (const l of linhas) {
        const p = porCodigo.get(l.codigo)
        if (!p) naoEncontrados.push(l.codigo)
        else if (p.referencia === l.codigoTray) iguais++
        else alterar.push({ id: p.id, codigo: l.codigo, de: p.referencia, para: l.codigoTray })
      }
      setPrevia({ alterar, iguais, naoEncontrados, invalidas })
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  const gravar = async () => {
    if (!previa) return
    setGravando(true)
    const erros: string[] = []
    let n = 0
    for (const a of previa.alterar) {
      try {
        await comRepeticao(() =>
          pb.collection('produtos').update(a.id, { referencia: a.para }, { requestKey: null }),
        )
      } catch (err) {
        erros.push(`${a.codigo}: ${err instanceof Error ? err.message : 'erro'}`)
      }
      n++
      setFeitos(n)
      await esperar(60)
    }
    setFalhas(erros)
    setGravando(false)
    setConcluido(true)
  }

  const total = previa?.alterar.length || 0

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar códigos da Tray para a Referência</DialogTitle>
          <DialogDescription className="text-xs">
            Arquivo com as colunas <b>codigo;codigo_tray</b>. O código da Tray (SKU dos anúncios do
            Mercado Livre) é gravado no campo Referência de cada produto. Nada mais é alterado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void aoEscolher(e.target.files?.[0])}
          />
          {!gravando && !concluido && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={lendo}
            >
              {lendo ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4 mr-1" />
              )}
              Escolher arquivo
            </Button>
          )}
          {erro && <div className="text-rose-600">{erro}</div>}

          {previa && (
            <div className="rounded border border-slate-200 p-3 space-y-1">
              <div>
                <b>{previa.alterar.length}</b> produtos terão a Referência trocada pelo código da
                Tray.
              </div>
              <div>{previa.iguais} já estão com o código da Tray.</div>
              {previa.naoEncontrados.length > 0 && (
                <div className="text-amber-700">
                  {previa.naoEncontrados.length} códigos não existem no Trevvo:{' '}
                  {previa.naoEncontrados.slice(0, 15).join(', ')}
                  {previa.naoEncontrados.length > 15 ? '...' : ''}
                </div>
              )}
              {previa.invalidas > 0 && (
                <div className="text-amber-700">{previa.invalidas} linhas inválidas ignoradas.</div>
              )}
              {previa.alterar.slice(0, 5).map((a) => (
                <div key={a.id} className="text-slate-500">
                  Produto {a.codigo}: Referência &quot;{a.de || '(vazia)'}&quot; → &quot;{a.para}
                  &quot;
                </div>
              ))}
            </div>
          )}

          {(gravando || concluido) && total > 0 && (
            <div className="space-y-1">
              <Progress value={(feitos / total) * 100} />
              <div>
                {feitos} de {total}
              </div>
            </div>
          )}
          {concluido && (
            <div className={falhas.length ? 'text-amber-700' : 'text-emerald-700'}>
              Concluído: {total - falhas.length} produtos atualizados
              {falhas.length
                ? `, ${falhas.length} com erro (${falhas.slice(0, 5).join('; ')})`
                : '.'}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={fechar} disabled={gravando}>
            {concluido ? 'Fechar' : 'Cancelar'}
          </Button>
          {previa && !concluido && total > 0 && (
            <Button type="button" size="sm" onClick={() => void gravar()} disabled={gravando}>
              {gravando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Gravar {total} referências
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
