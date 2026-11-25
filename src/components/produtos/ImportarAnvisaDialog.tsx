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
 * Grava o registro na ANVISA dos produtos (campos anvisa_tipo e anvisa_numero, migration 0141).
 * Arquivo ";" com colunas: codigo (código do produto no Trevvo); anvisa_tipo (Registro,
 * Notificação ou Isento); anvisa_numero. Colunas depois dessas são ignoradas. Linha com tipo e
 * número vazios não mexe no produto.
 */

interface LinhaArquivo {
  codigo: number
  tipo: string
  numero: string
}

const TIPOS: Record<string, string> = {
  registro: 'Registro',
  notificacao: 'Notificação',
  notificação: 'Notificação',
  cadastro: 'Notificação',
  isento: 'Isento',
}

interface Previa {
  alterar: { id: string; codigo: number; de: string; tipo: string; numero: string }[]
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
    const tipoBruto = String(partes[1] || '')
      .trim()
      .toLowerCase()
    const numero = String(partes[2] || '').replace(/[^0-9]/g, '')
    if (!tipoBruto && !numero) continue
    const tipo = TIPOS[tipoBruto] || (numero ? 'Registro' : '')
    if (
      !Number.isInteger(codigo) ||
      codigo <= 0 ||
      (tipoBruto && !TIPOS[tipoBruto]) ||
      (tipo !== 'Isento' && !/^[0-9]{7,15}$/.test(numero))
    ) {
      invalidas++
      continue
    }
    linhas.push({ codigo, tipo, numero: tipo === 'Isento' ? '' : numero })
  }
  return { linhas, invalidas }
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarAnvisaDialog({ aberto, onFechar, onConcluido }: Props) {
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
      const produtos = await pb.collection('produtos').getFullList<{
        id: string
        codigo: number
        anvisa_tipo?: string
        anvisa_numero?: string
      }>({
        fields: 'id,codigo,anvisa_tipo,anvisa_numero',
        batch: 1000,
        requestKey: null,
      })
      const porCodigo = new Map<number, { id: string; tipo: string; numero: string }>()
      for (const p of produtos) {
        porCodigo.set(Number(p.codigo), {
          id: p.id,
          tipo: (p.anvisa_tipo || '').trim(),
          numero: (p.anvisa_numero || '').trim(),
        })
      }
      const alterar: Previa['alterar'] = []
      const naoEncontrados: number[] = []
      let iguais = 0
      for (const l of linhas) {
        const p = porCodigo.get(l.codigo)
        if (!p) naoEncontrados.push(l.codigo)
        else if (p.tipo === l.tipo && p.numero === l.numero) iguais++
        else
          alterar.push({
            id: p.id,
            codigo: l.codigo,
            de: [p.tipo, p.numero].filter(Boolean).join(' '),
            tipo: l.tipo,
            numero: l.numero,
          })
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
          pb
            .collection('produtos')
            .update(a.id, { anvisa_tipo: a.tipo, anvisa_numero: a.numero }, { requestKey: null }),
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
          <DialogTitle>Importar registros da ANVISA</DialogTitle>
          <DialogDescription className="text-xs">
            Arquivo com as colunas <b>codigo;anvisa_tipo;anvisa_numero</b> (tipo: Registro,
            Notificação ou Isento). Grava só o tipo e o número da ANVISA de cada produto; linhas sem
            tipo e sem número são ignoradas. Nada mais é alterado.
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
                <b>{previa.alterar.length}</b> produtos terão o registro da ANVISA gravado.
              </div>
              <div>{previa.iguais} já estão com esse registro.</div>
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
                  Produto {a.codigo}: {a.de || '(vazio)'} → {a.tipo} {a.numero}
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
              Gravar {total} registros
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
