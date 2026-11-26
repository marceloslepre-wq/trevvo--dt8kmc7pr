import React, { useMemo, useRef, useState } from 'react'
import { Download, FlaskConical, Loader2, Square } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useEmpresasAcessiveis } from '@/contexts/EmpresaContext'
import { conferirProdutosTray, mensagemErroTray } from '@/services/tray'

/**
 * SIMULAÇÃO (somente leitura) do envio de estoque e preço para a Tray.
 * Para cada anúncio vinculado calcula o que o Trevvo enviaria e compara com o que a Tray
 * mostra hoje. Nada é gravado, nem na Tray nem no Trevvo.
 *
 * Regras (as mesmas que o envio real vai usar):
 *  - estoque = saldo da loja conectada + saldos NEGATIVOS das lojas marcadas (ex.: loja física
 *    que vende sem estoque e é reposta no fim do dia), dividido pelas unidades do anúncio
 *    (kit/caixa), arredondado para baixo, nunca menor que zero;
 *  - preço = preço próprio da loja conectada (ou o preço geral) x unidades do anúncio;
 *  - produto inativo no Trevvo = estoque 0.
 */

interface Props {
  empresaId: string
}

interface Linha {
  chave: string
  nome: string
  anuncio: string
  variacao: string
  produtoCodigo: number | null
  produtoDescricao: string
  unidades: number
  estoqueTray: number
  estoqueTrevvo: number | null
  precoTray: number
  precoTrevvo: number | null
  situacao: 'igual' | 'estoque' | 'preco' | 'ambos' | 'sem_vinculo'
}

const ROTULO: Record<Linha['situacao'], string> = {
  igual: 'Igual',
  estoque: 'Estoque diferente',
  preco: 'Preço diferente',
  ambos: 'Estoque e preço',
  sem_vinculo: 'Sem vínculo',
}

export const SimulacaoEnvioTray: React.FC<Props> = ({ empresaId }) => {
  const assinanteId = useAssinanteId()
  const { empresasAcessiveis } = useEmpresasAcessiveis()
  const outras = empresasAcessiveis.filter((e) => e.id !== empresaId)
  const [descontarNegativo, setDescontarNegativo] = useState<string[]>([])
  const [rodando, setRodando] = useState(false)
  const pararRef = useRef(false)
  const [lidos, setLidos] = useState(0)
  const [total, setTotal] = useState(0)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Linha['situacao'] | 'todas' | 'diferentes'>('diferentes')

  const simular = async () => {
    if (!assinanteId) return
    setRodando(true)
    pararRef.current = false
    setLidos(0)
    setTotal(0)
    setLinhas([])
    try {
      const filtroAss = assinanteId ? `assinante_id = '${assinanteId}'` : ''
      const [produtos, precosLoja, vinculos, saldos] = await Promise.all([
        pb.collection('produtos').getFullList<{
          id: string
          codigo: number
          descricao: string
          preco_venda: number
          ativo: boolean
        }>({
          fields: 'id,codigo,descricao,preco_venda,ativo',
          filter: filtroAss,
          batch: 1000,
          requestKey: null,
        }),
        pb
          .collection('produtos_precos_empresa')
          .getFullList<{ produto_id: string; preco_venda: number }>({
            filter: `empresa_id = '${empresaId}'`,
            fields: 'produto_id,preco_venda',
            batch: 1000,
            requestKey: null,
          }),
        pb.collection('produtos_vinculos_anuncios').getFullList<{
          produto_id: string
          anuncio_id: string
          variacao_id: string
          unidades: number
        }>({
          filter: `empresa_id = '${empresaId}' && marketplace = 'tray'`,
          fields: 'produto_id,anuncio_id,variacao_id,unidades',
          batch: 1000,
          requestKey: null,
        }),
        pb
          .collection('estoque_saldos')
          .getFullList<{ empresa_id: string; produto_id: string; quantidade: number }>({
            filter: [empresaId, ...descontarNegativo]
              .map((id) => `empresa_id = '${id}'`)
              .join(' || '),
            fields: 'empresa_id,produto_id,quantidade',
            batch: 1000,
            requestKey: null,
          }),
      ])

      const prodPorId = new Map(produtos.map((p) => [p.id, p]))
      const precoLoja = new Map<string, number>()
      for (const r of precosLoja) if (r.preco_venda > 0) precoLoja.set(r.produto_id, r.preco_venda)
      const vincPorChave = new Map(
        vinculos.map((v) => [`${v.anuncio_id}|${v.variacao_id || ''}`, v]),
      )
      const saldoBase = new Map<string, number>()
      for (const s of saldos) {
        const q = Number(s.quantidade) || 0
        if (s.empresa_id === empresaId) {
          saldoBase.set(s.produto_id, (saldoBase.get(s.produto_id) || 0) + q)
        } else if (q < 0) {
          saldoBase.set(s.produto_id, (saldoBase.get(s.produto_id) || 0) + q)
        }
      }

      let pagina: number | null = 1
      while (pagina !== null && !pararRef.current) {
        const resp = await conferirProdutosTray(empresaId, pagina, 20)
        setTotal(resp.total_produtos)
        setLidos((n) => n + resp.produtos_nesta_pagina)
        const novas: Linha[] = []
        for (const l of resp.linhas) {
          const chave = `${l.produto_id}|${l.variacao_id || ''}`
          const v = vincPorChave.get(chave)
          const prod = v ? prodPorId.get(v.produto_id) : undefined
          if (!v || !prod) {
            novas.push({
              chave,
              nome: l.nome,
              anuncio: l.produto_id,
              variacao: [l.variacao_id, l.variacao].filter(Boolean).join(' · '),
              produtoCodigo: null,
              produtoDescricao: '',
              unidades: 1,
              estoqueTray: l.estoque,
              estoqueTrevvo: null,
              precoTray: l.preco,
              precoTrevvo: null,
              situacao: 'sem_vinculo',
            })
            continue
          }
          const unidades = v.unidades > 0 ? v.unidades : 1
          const saldo = prod.ativo ? saldoBase.get(prod.id) || 0 : 0
          const estoque = Math.max(0, Math.floor(saldo / unidades))
          const precoUnit = precoLoja.get(prod.id) ?? (Number(prod.preco_venda) || 0)
          const preco = Math.round(precoUnit * unidades * 100) / 100
          const difEstoque = estoque !== Math.floor(l.estoque || 0)
          const difPreco = Math.abs(preco - (l.preco || 0)) >= 0.005
          novas.push({
            chave,
            nome: l.nome,
            anuncio: l.produto_id,
            variacao: [l.variacao_id, l.variacao].filter(Boolean).join(' · '),
            produtoCodigo: Number(prod.codigo),
            produtoDescricao: prod.descricao,
            unidades,
            estoqueTray: l.estoque,
            estoqueTrevvo: estoque,
            precoTray: l.preco,
            precoTrevvo: preco,
            situacao:
              difEstoque && difPreco
                ? 'ambos'
                : difEstoque
                  ? 'estoque'
                  : difPreco
                    ? 'preco'
                    : 'igual',
          })
        }
        setLinhas((atual) => [...atual, ...novas])
        pagina = resp.proxima_pagina
      }
    } catch (err) {
      toast({
        title: 'Erro na simulação',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setRodando(false)
    }
  }

  const contagem = useMemo(() => {
    const c: Record<string, number> = { igual: 0, estoque: 0, preco: 0, ambos: 0, sem_vinculo: 0 }
    for (const l of linhas) c[l.situacao]++
    return c
  }, [linhas])

  const visiveis = useMemo(
    () =>
      linhas.filter((l) =>
        filtro === 'todas'
          ? true
          : filtro === 'diferentes'
            ? l.situacao !== 'igual'
            : l.situacao === filtro,
      ),
    [linhas, filtro],
  )

  const baixarCsv = () => {
    const cab = [
      'anuncio_tray',
      'variacao',
      'nome_tray',
      'codigo_trevvo',
      'produto_trevvo',
      'unidades',
      'estoque_tray',
      'estoque_trevvo',
      'preco_tray',
      'preco_trevvo',
      'situacao',
    ]
    const linhasCsv = linhas.map((l) =>
      [
        l.anuncio,
        l.variacao,
        l.nome,
        l.produtoCodigo ?? '',
        l.produtoDescricao,
        l.unidades,
        l.estoqueTray,
        l.estoqueTrevvo ?? '',
        String(l.precoTray).replace('.', ','),
        l.precoTrevvo === null ? '' : String(l.precoTrevvo).replace('.', ','),
        ROTULO[l.situacao],
      ]
        .map((v) => String(v).replace(/;/g, ','))
        .join(';'),
    )
    const conteudo = '﻿' + [cab.join(';'), ...linhasCsv].join('\r\n')
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `simulacao-envio-tray-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = (v: number | null) =>
    v === null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const filtros: [typeof filtro, string][] = [
    ['diferentes', `Diferentes (${linhas.length - contagem.igual})`],
    ['estoque', `Estoque (${contagem.estoque})`],
    ['preco', `Preço (${contagem.preco})`],
    ['ambos', `Os dois (${contagem.ambos})`],
    ['sem_vinculo', `Sem vínculo (${contagem.sem_vinculo})`],
    ['igual', `Iguais (${contagem.igual})`],
    ['todas', `Todos (${linhas.length})`],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-violet-600" />
          Simulação do envio de estoque e preço
        </CardTitle>
        <CardDescription className="text-xs">
          Calcula, para cada anúncio vinculado, o estoque e o preço que o Trevvo enviaria e compara
          com o que está na Tray agora. Não grava nada. Estoque = saldo desta loja (somado aos
          saldos negativos das lojas marcadas) ÷ unidades do anúncio. Preço = preço desta loja x
          unidades.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {outras.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-600">Descontar saldo negativo de:</span>
            {outras.map((e) => (
              <label key={e.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={descontarNegativo.includes(e.id)}
                  disabled={rodando}
                  onChange={(ev) =>
                    setDescontarNegativo((l) =>
                      ev.target.checked ? [...l, e.id] : l.filter((x) => x !== e.id),
                    )
                  }
                />
                {e.nome_fantasia || e.razao_social}
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!rodando ? (
            <Button size="sm" onClick={() => void simular()} disabled={!assinanteId}>
              <FlaskConical className="mr-1 h-4 w-4" />
              Simular agora
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => (pararRef.current = true)}>
              <Square className="mr-1 h-4 w-4" />
              Parar
            </Button>
          )}
          {linhas.length > 0 && !rodando && (
            <Button size="sm" variant="outline" onClick={baixarCsv}>
              <Download className="mr-1 h-4 w-4" />
              Baixar CSV
            </Button>
          )}
          {rodando && <Loader2 className="h-4 w-4 animate-spin text-violet-600" />}
          {(rodando || linhas.length > 0) && (
            <span className="text-slate-600">
              {lidos} de {total || '?'} produtos lidos · {linhas.length} anúncios
            </span>
          )}
        </div>
        {rodando && total > 0 && <Progress value={(lidos / total) * 100} />}

        {linhas.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {filtros.map(([v, rotulo]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={filtro === v ? 'default' : 'outline'}
                  className="h-7 text-[11px]"
                  onClick={() => setFiltro(v)}
                >
                  {rotulo}
                </Button>
              ))}
            </div>
            <div className="max-h-[480px] overflow-auto rounded border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Anúncio Tray</TableHead>
                    <TableHead className="text-[11px]">Produto Trevvo</TableHead>
                    <TableHead className="text-[11px] text-right">Estoque Tray → Trevvo</TableHead>
                    <TableHead className="text-[11px] text-right">Preço Tray → Trevvo</TableHead>
                    <TableHead className="text-[11px]">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.slice(0, 500).map((l) => (
                    <TableRow key={l.chave}>
                      <TableCell className="text-[11px]">
                        <div className="font-medium text-slate-800">{l.nome}</div>
                        <div className="text-slate-500">
                          #{l.anuncio}
                          {l.variacao ? ` · ${l.variacao}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {l.produtoCodigo !== null ? (
                          <>
                            <span className="font-mono">#{l.produtoCodigo}</span>{' '}
                            {l.produtoDescricao}
                            {l.unidades > 1 && (
                              <span className="text-amber-700"> · {l.unidades} un/anúncio</span>
                            )}
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[11px]">
                        {l.estoqueTray} → <b>{l.estoqueTrevvo ?? '-'}</b>
                      </TableCell>
                      <TableCell className="text-right text-[11px]">
                        {fmt(l.precoTray)} → <b>{fmt(l.precoTrevvo)}</b>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        <Badge
                          variant="outline"
                          className={
                            l.situacao === 'igual'
                              ? 'border-emerald-300 text-emerald-700'
                              : l.situacao === 'sem_vinculo'
                                ? 'border-rose-300 text-rose-700'
                                : 'border-amber-300 text-amber-800'
                          }
                        >
                          {ROTULO[l.situacao]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {visiveis.length > 500 && (
              <div className="text-slate-500">
                Mostrando 500 de {visiveis.length}. Baixe o CSV para ver todos.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default SimulacaoEnvioTray
