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
import { useEmpresasAcessiveis } from '@/contexts/EmpresaContext'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { recalcularMargem } from '@/services/produtos'

/**
 * Importa preços de venda a partir de um arquivo ";" com cabeçalho:
 *   codigo;descricao;preco_geral;preco_loja
 * - preco_geral (opcional): troca produtos.preco_venda (e recalcula a margem).
 * - preco_loja (opcional): preço próprio do produto na empresa escolhida
 *   (produtos_precos_empresa). Igual ao preço geral = remove o preço próprio.
 * Colunas vazias são ignoradas. Aceita vírgula ou ponto como decimal.
 */

interface LinhaArquivo {
  codigo: number
  precoGeral: number | null
  precoLoja: number | null
}

interface ProdutoBase {
  id: string
  codigo: number
  preco_venda: number
  custo_final: number
}

interface AcaoGeral {
  id: string
  codigo: number
  de: number
  para: number
  margem: number | null
}

interface AcaoLoja {
  produtoId: string
  codigo: number
  registroId?: string
  de: number | null
  para: number | null // null = remover preço próprio
}

interface Previa {
  gerais: AcaoGeral[]
  lojas: AcaoLoja[]
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

function numero(txt: string | undefined): number | null {
  const t = String(txt ?? '')
    .trim()
    .replace(/^"|"$/g, '')
  if (!t) return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function lerArquivo(texto: string): { linhas: LinhaArquivo[]; invalidas: number; erro?: string } {
  const brutas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((b) => b.trim())
  if (brutas.length === 0) return { linhas: [], invalidas: 0, erro: 'Arquivo vazio.' }
  const cab = brutas[0].split(';').map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase())
  const iCod = cab.indexOf('codigo')
  const iGeral = cab.indexOf('preco_geral')
  const iLoja = cab.indexOf('preco_loja')
  if (iCod < 0 || (iGeral < 0 && iLoja < 0)) {
    return {
      linhas: [],
      invalidas: 0,
      erro: 'Cabeçalho precisa ter "codigo" e "preco_geral" e/ou "preco_loja".',
    }
  }
  const linhas: LinhaArquivo[] = []
  let invalidas = 0
  for (let i = 1; i < brutas.length; i++) {
    const p = brutas[i].split(';')
    const codigo = Number(
      String(p[iCod] || '')
        .trim()
        .replace(/^"|"$/g, ''),
    )
    const precoGeral = iGeral >= 0 ? numero(p[iGeral]) : null
    const precoLoja = iLoja >= 0 ? numero(p[iLoja]) : null
    if (!Number.isInteger(codigo) || codigo <= 0 || (precoGeral === null && precoLoja === null)) {
      invalidas++
      continue
    }
    linhas.push({ codigo, precoGeral, precoLoja })
  }
  return { linhas, invalidas }
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarPrecosDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { empresasAcessiveis } = useEmpresasAcessiveis()
  const assinanteId = useAssinanteId()
  const [empresaId, setEmpresaId] = useState('')
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
      const { linhas, invalidas, erro: erroLeitura } = lerArquivo(await arquivo.text())
      if (erroLeitura) {
        setErro(erroLeitura)
        return
      }
      if (linhas.some((l) => l.precoLoja !== null) && !empresaId) {
        setErro('O arquivo tem preço da loja: escolha a loja antes de escolher o arquivo.')
        return
      }
      const produtos = await pb.collection('produtos').getFullList<ProdutoBase>({
        fields: 'id,codigo,preco_venda,custo_final',
        filter: assinanteId ? `assinante_id = '${assinanteId}'` : '',
        batch: 1000,
        requestKey: null,
      })
      const porCodigo = new Map<number, ProdutoBase>()
      for (const p of produtos) porCodigo.set(Number(p.codigo), p)

      const precosLoja = new Map<string, { id: string; preco: number }>()
      if (empresaId) {
        const regs = await pb
          .collection('produtos_precos_empresa')
          .getFullList<{ id: string; produto_id: string; preco_venda: number }>({
            filter: `empresa_id = '${empresaId}'`,
            fields: 'id,produto_id,preco_venda',
            batch: 1000,
            requestKey: null,
          })
        for (const r of regs) precosLoja.set(r.produto_id, { id: r.id, preco: r.preco_venda })
      }

      const gerais: AcaoGeral[] = []
      const lojas: AcaoLoja[] = []
      const naoEncontrados: number[] = []
      let iguais = 0
      for (const l of linhas) {
        const p = porCodigo.get(l.codigo)
        if (!p) {
          naoEncontrados.push(l.codigo)
          continue
        }
        let geralFinal = Number(p.preco_venda) || 0
        let mudou = false
        if (l.precoGeral !== null && Math.abs(l.precoGeral - geralFinal) >= 0.005) {
          const cf = Number(p.custo_final) || 0
          gerais.push({
            id: p.id,
            codigo: l.codigo,
            de: geralFinal,
            para: l.precoGeral,
            margem: cf > 0 ? recalcularMargem(l.precoGeral, cf) : null,
          })
          geralFinal = l.precoGeral
          mudou = true
        }
        if (l.precoLoja !== null && empresaId) {
          const atual = precosLoja.get(p.id)
          const igualGeral = Math.abs(l.precoLoja - geralFinal) < 0.005
          if (igualGeral) {
            if (atual) {
              lojas.push({
                produtoId: p.id,
                codigo: l.codigo,
                registroId: atual.id,
                de: atual.preco,
                para: null,
              })
              mudou = true
            }
          } else if (!atual || Math.abs(atual.preco - l.precoLoja) >= 0.005) {
            lojas.push({
              produtoId: p.id,
              codigo: l.codigo,
              registroId: atual?.id,
              de: atual?.preco ?? null,
              para: l.precoLoja,
            })
            mudou = true
          }
        }
        if (!mudou) iguais++
      }
      setPrevia({ gerais, lojas, iguais, naoEncontrados, invalidas })
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
    const userId = pb.authStore.record?.id || null
    for (const g of previa.gerais) {
      try {
        const dados: Record<string, unknown> = { preco_venda: g.para, updated_by: userId }
        if (g.margem !== null) dados.margem_percentual = g.margem
        await comRepeticao(() =>
          pb.collection('produtos').update(g.id, dados, { requestKey: null }),
        )
      } catch (err) {
        erros.push(`${g.codigo} (geral): ${err instanceof Error ? err.message : 'erro'}`)
      }
      n++
      setFeitos(n)
      await esperar(60)
    }
    for (const a of previa.lojas) {
      try {
        if (a.para === null) {
          if (a.registroId) {
            await comRepeticao(() =>
              pb.collection('produtos_precos_empresa').delete(a.registroId!, { requestKey: null }),
            )
          }
        } else if (a.registroId) {
          await comRepeticao(() =>
            pb
              .collection('produtos_precos_empresa')
              .update(a.registroId!, { preco_venda: a.para }, { requestKey: null }),
          )
        } else {
          await comRepeticao(() =>
            pb.collection('produtos_precos_empresa').create(
              {
                assinante_id: assinanteId || undefined,
                produto_id: a.produtoId,
                empresa_id: empresaId,
                preco_venda: a.para,
              },
              { requestKey: null },
            ),
          )
        }
      } catch (err) {
        erros.push(`${a.codigo} (loja): ${err instanceof Error ? err.message : 'erro'}`)
      }
      n++
      setFeitos(n)
      await esperar(60)
    }
    setFalhas(erros)
    setGravando(false)
    setConcluido(true)
  }

  const total = (previa?.gerais.length || 0) + (previa?.lojas.length || 0)
  const nomeLoja =
    empresasAcessiveis.find((e) => e.id === empresaId)?.nome_fantasia ||
    empresasAcessiveis.find((e) => e.id === empresaId)?.razao_social ||
    ''
  const fmt = (v: number | null) =>
    v === null ? '(preço geral)' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar preços</DialogTitle>
          <DialogDescription className="text-xs">
            Arquivo ";" com as colunas <b>codigo;preco_geral;preco_loja</b> (descrição opcional).
            Preço geral troca o preço de venda do produto. Preço da loja grava o preço próprio na
            loja escolhida; igual ao preço geral, o preço próprio é removido. Colunas vazias são
            ignoradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <label htmlFor="importar_precos_loja" className="font-medium text-slate-700">
              Loja do preço próprio:
            </label>
            <select
              id="importar_precos_loja"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value)
                limpar()
              }}
              disabled={gravando || lendo}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="">Escolha a loja...</option>
              {empresasAcessiveis.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_fantasia || e.razao_social}
                </option>
              ))}
            </select>
          </div>

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
                <b>{previa.gerais.length}</b> produtos terão o preço geral alterado.
              </div>
              <div>
                <b>{previa.lojas.length}</b> preços próprios da loja {nomeLoja} serão gravados ou
                ajustados.
              </div>
              <div>{previa.iguais} produtos já estão com esses preços.</div>
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
              {previa.gerais.slice(0, 4).map((g) => (
                <div key={`g-${g.id}`} className="text-slate-500">
                  Produto {g.codigo}: preço geral {fmt(g.de)} → {fmt(g.para)}
                </div>
              ))}
              {previa.lojas.slice(0, 4).map((a) => (
                <div key={`l-${a.produtoId}`} className="text-slate-500">
                  Produto {a.codigo}: loja {fmt(a.de)} → {fmt(a.para)}
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
              Concluído: {total - falhas.length} preços gravados
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
              Gravar {total} preços
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
