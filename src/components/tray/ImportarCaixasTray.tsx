import React, { useRef, useState } from 'react'
import { FileUp, Loader2, Save } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { useAssinanteId } from '@/hooks/useAssinanteId'

/**
 * Importa, por código do produto do Trevvo, quantas unidades o anúncio da Tray vende
 * (caixa/kit) e o preço fixo do anúncio. CSV com cabeçalho: codigo;unidades;preco_anuncio
 * (descricao e outras colunas são ignoradas). Atualiza o vínculo Tray já existente do produto;
 * por isso rode "Sincronizar vínculos" antes. Produto com mais de um anúncio na Tray não é
 * alterado (ajuste na lista, anúncio por anúncio). Grava só no Trevvo.
 */

interface Props {
  empresaId: string
  onAplicado?: () => void
}

interface Linha {
  codigo: number
  descricao: string
  unidades: number
  preco: number
  produtoId?: string
  vinculoId?: string
  atual?: string
  status: 'pronto' | 'sem_produto' | 'sem_vinculo' | 'varios' | 'invalido' | 'ok' | 'erro'
  detalhe?: string
}

const numero = (txt: string) => {
  const t = (txt || '').trim()
  if (!t) return NaN
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

const ROTULO: Record<Linha['status'], string> = {
  pronto: 'Pronto',
  sem_produto: 'Produto não existe',
  sem_vinculo: 'Sem vínculo Tray',
  varios: 'Mais de um anúncio',
  invalido: 'Valor inválido',
  ok: 'Gravado',
  erro: 'Erro',
}

export const ImportarCaixasTray: React.FC<Props> = ({ empresaId, onAplicado }) => {
  const assinanteId = useAssinanteId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [lendo, setLendo] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const ler = async (arquivo: File) => {
    setLendo(true)
    try {
      const texto = (await arquivo.text()).replace(/^﻿/, '')
      const regs = texto.split(/\r?\n/).filter((l) => l.trim())
      if (regs.length < 2) throw new Error('Arquivo vazio')
      const sep = regs[0].includes(';') ? ';' : ','
      const cab = regs[0].split(sep).map((c) => c.trim().toLowerCase())
      const iCod = cab.indexOf('codigo')
      const iUni = cab.indexOf('unidades')
      const iPre = cab.indexOf('preco_anuncio')
      const iDes = cab.indexOf('descricao')
      if (iCod < 0 || iUni < 0 || iPre < 0) {
        throw new Error('Cabeçalho precisa ter codigo;unidades;preco_anuncio')
      }

      const produtos = await pb
        .collection('produtos')
        .getFullList<{ id: string; codigo: number; descricao: string }>({
          fields: 'id,codigo,descricao',
          filter: assinanteId ? `assinante_id = '${assinanteId}'` : '',
          batch: 1000,
          requestKey: null,
        })
      const porCodigo = new Map(produtos.map((p) => [Number(p.codigo), p]))
      const vinculos = await pb.collection('produtos_vinculos_anuncios').getFullList<{
        id: string
        produto_id: string
        anuncio_id: string
        variacao_id: string
        unidades: number
        preco_anuncio?: number
      }>({
        filter: `empresa_id = '${empresaId}' && marketplace = 'tray'`,
        fields: 'id,produto_id,anuncio_id,variacao_id,unidades,preco_anuncio',
        batch: 1000,
        requestKey: null,
      })
      const porProduto = new Map<string, typeof vinculos>()
      for (const v of vinculos) {
        const lista = porProduto.get(v.produto_id) || []
        lista.push(v)
        porProduto.set(v.produto_id, lista)
      }

      const saida: Linha[] = []
      for (const reg of regs.slice(1)) {
        const c = reg.split(sep)
        const codigo = Number((c[iCod] || '').trim())
        const unidades = numero(c[iUni])
        const preco = numero(c[iPre])
        const l: Linha = {
          codigo,
          descricao: iDes >= 0 ? (c[iDes] || '').trim() : '',
          unidades,
          preco,
          status: 'pronto',
        }
        const prod = porCodigo.get(codigo)
        if (
          !Number.isInteger(codigo) ||
          !Number.isInteger(unidades) ||
          unidades < 1 ||
          !Number.isFinite(preco) ||
          preco < 0
        ) {
          l.status = 'invalido'
        } else if (!prod) {
          l.status = 'sem_produto'
        } else {
          l.produtoId = prod.id
          if (!l.descricao) l.descricao = prod.descricao
          const vs = porProduto.get(prod.id) || []
          if (vs.length === 0) l.status = 'sem_vinculo'
          else if (vs.length > 1) {
            l.status = 'varios'
            l.detalhe = vs
              .map((v) => `#${v.anuncio_id}${v.variacao_id ? '/' + v.variacao_id : ''}`)
              .join(', ')
          } else {
            l.vinculoId = vs[0].id
            l.atual = `${vs[0].unidades || 1} un · ${
              vs[0].preco_anuncio ? vs[0].preco_anuncio.toFixed(2).replace('.', ',') : 'sem preço'
            }`
            l.detalhe = `anúncio #${vs[0].anuncio_id}`
          }
        }
        saida.push(l)
      }
      setLinhas(saida)
    } catch (err) {
      toast({
        title: 'Não foi possível ler o arquivo',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setLendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const aplicar = async () => {
    setAplicando(true)
    const novas = [...linhas]
    let ok = 0
    for (let i = 0; i < novas.length; i++) {
      const l = novas[i]
      if (l.status !== 'pronto' || !l.vinculoId) continue
      try {
        await pb
          .collection('produtos_vinculos_anuncios')
          .update(
            l.vinculoId,
            { unidades: l.unidades, preco_anuncio: Math.round(l.preco * 100) / 100 },
            { requestKey: null },
          )
        novas[i] = { ...l, status: 'ok' }
        ok++
      } catch (err) {
        novas[i] = { ...l, status: 'erro', detalhe: err instanceof Error ? err.message : '' }
      }
      setLinhas([...novas])
    }
    setAplicando(false)
    toast({ title: `${ok} vínculos atualizados` })
    onAplicado?.()
  }

  const prontos = linhas.filter((l) => l.status === 'pronto').length
  const fmt = (v: number) =>
    Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void ler(f)
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={lendo || aplicando || !assinanteId}
          onClick={() => inputRef.current?.click()}
        >
          {lendo ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="mr-1 h-4 w-4" />
          )}
          Importar unidades e preço das caixas (CSV)
        </Button>
        {linhas.length > 0 && (
          <>
            <Button size="sm" disabled={aplicando || prontos === 0} onClick={() => void aplicar()}>
              {aplicando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Aplicar {prontos} prontos
            </Button>
            <span className="text-slate-600">
              {linhas.length} linhas ·{' '}
              {Object.entries(
                linhas.reduce<Record<string, number>>((acc, l) => {
                  acc[ROTULO[l.status]] = (acc[ROTULO[l.status]] || 0) + 1
                  return acc
                }, {}),
              )
                .map(([k, v]) => `${v} ${k.toLowerCase()}`)
                .join(' · ')}
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Cabeçalho: codigo;unidades;preco_anuncio. Atualiza o vínculo Tray existente do produto (rode
        Sincronizar vínculos antes). Produto com mais de um anúncio fica de fora.
      </p>
      {linhas.length > 0 && (
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Unid.</TableHead>
                <TableHead className="text-right">Preço anúncio</TableHead>
                <TableHead>Hoje</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{l.codigo || '-'}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{l.descricao}</TableCell>
                  <TableCell className="text-right">{l.unidades || '-'}</TableCell>
                  <TableCell className="text-right">{fmt(l.preco)}</TableCell>
                  <TableCell className="text-slate-500">{l.atual || ''}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        l.status === 'ok'
                          ? 'border-green-300 text-green-700'
                          : l.status === 'pronto'
                            ? 'border-blue-300 text-blue-700'
                            : 'border-amber-300 text-amber-700'
                      }
                    >
                      {ROTULO[l.status]}
                    </Badge>
                    {l.detalhe && <span className="ml-1 text-slate-500">{l.detalhe}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default ImportarCaixasTray
