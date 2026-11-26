import React, { useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Save, Square } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { LinhaProdutoTray, conferirProdutosTray, mensagemErroTray } from '@/services/tray'

/**
 * Vínculo Trevvo x Tray (tabela produtos_vinculos_anuncios, marketplace 'tray').
 * Cada anúncio da Tray (produto sem variação, ou cada variação) aponta para UM produto do
 * Trevvo e diz quantas unidades desse produto o anúncio vende (kit/caixa). É a base do envio
 * de estoque/preço e da entrada de pedidos. Só grava no Trevvo; nada é enviado para a Tray.
 *
 * Sincronizar: lê todos os anúncios (mesma rota da conferência), cria os vínculos que o
 * servidor achou pela referência ou pelo EAN e lista o que precisa de ação:
 *  - "Sem vínculo": informe o código do produto do Trevvo;
 *  - "Conferir unidades": o preço na Tray é mais de 3x o preço do produto (provável caixa/kit).
 * Vínculo já existente nunca é trocado pela sincronização (o que foi ajustado à mão vale).
 */

const MARKETPLACE = 'tray'

interface Props {
  empresaId: string
}

interface ProdutoMin {
  id: string
  codigo: number
  descricao: string
  preco_venda: number
}

interface Vinculo {
  id: string
  produto_id: string
  anuncio_id: string
  variacao_id: string
  unidades: number
  preco_anuncio?: number
}

interface Pendente {
  chave: string
  linha: LinhaProdutoTray
  motivo: 'sem_vinculo' | 'unidades'
  vinculoId?: string
  produtoCodigo: string
  unidades: string
  /** Preço fixo do anúncio (caixa/kit); vazio = preço da loja x unidades */
  precoAnuncio: string
  precoTrevvo?: number
  salvando?: boolean
  salvo?: boolean
}

const chaveDe = (anuncio: string, variacao: string) => `${anuncio}|${variacao || ''}`

export const VinculosTray: React.FC<Props> = ({ empresaId }) => {
  const assinanteId = useAssinanteId()
  const [rodando, setRodando] = useState(false)
  const pararRef = useRef(false)
  const [lidos, setLidos] = useState(0)
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState({
    anuncios: 0,
    criados: 0,
    existentes: 0,
    falhas: 0,
    inativos: 0,
  })
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'sem_vinculo' | 'unidades'>('todos')
  const produtosRef = useRef<{
    porCodigo: Map<number, ProdutoMin>
    porId: Map<string, ProdutoMin>
  }>({ porCodigo: new Map(), porId: new Map() })

  const carregarBase = async () => {
    const produtos = await pb.collection('produtos').getFullList<ProdutoMin>({
      fields: 'id,codigo,descricao,preco_venda',
      filter: assinanteId ? `assinante_id = '${assinanteId}'` : '',
      batch: 1000,
      requestKey: null,
    })
    const porCodigo = new Map<number, ProdutoMin>()
    const porId = new Map<string, ProdutoMin>()
    for (const p of produtos) {
      porCodigo.set(Number(p.codigo), p)
      porId.set(p.id, p)
    }
    // Preço próprio da loja (Pauta Site) substitui o geral na comparação
    const precos = await pb
      .collection('produtos_precos_empresa')
      .getFullList<{ produto_id: string; preco_venda: number }>({
        filter: `empresa_id = '${empresaId}'`,
        fields: 'produto_id,preco_venda',
        batch: 1000,
        requestKey: null,
      })
    for (const r of precos) {
      const p = porId.get(r.produto_id)
      if (p && r.preco_venda > 0) p.preco_venda = r.preco_venda
    }
    produtosRef.current = { porCodigo, porId }

    const vinculos = await pb.collection('produtos_vinculos_anuncios').getFullList<Vinculo>({
      filter: `empresa_id = '${empresaId}' && marketplace = '${MARKETPLACE}'`,
      fields: 'id,produto_id,anuncio_id,variacao_id,unidades,preco_anuncio',
      batch: 1000,
      requestKey: null,
    })
    const mapa = new Map<string, Vinculo>()
    for (const v of vinculos) mapa.set(chaveDe(v.anuncio_id, v.variacao_id), v)
    return mapa
  }

  const sincronizar = async () => {
    if (!assinanteId) return
    setRodando(true)
    pararRef.current = false
    setLidos(0)
    setTotal(0)
    setPendentes([])
    const r = { anuncios: 0, criados: 0, existentes: 0, falhas: 0, inativos: 0 }
    setResumo({ ...r })
    try {
      const vinculos = await carregarBase()
      const { porCodigo, porId } = produtosRef.current
      let pagina: number | null = 1
      while (pagina !== null && !pararRef.current) {
        const resp = await conferirProdutosTray(empresaId, pagina, 20)
        setTotal(resp.total_produtos)
        setLidos((n) => n + resp.produtos_nesta_pagina)
        const novosPendentes: Pendente[] = []
        for (const l of resp.linhas) {
          // Anúncio inativo na Tray (a Tray não deixa excluir, só inativar): ignorado
          if (!l.ativo_na_tray) {
            r.inativos++
            continue
          }
          r.anuncios++
          const chave = chaveDe(l.produto_id, l.variacao_id)
          let vinc = vinculos.get(chave)
          if (!vinc && l.produto_codigo) {
            const prod = porCodigo.get(Number(l.produto_codigo))
            if (prod) {
              try {
                const criado = await pb.collection('produtos_vinculos_anuncios').create<Vinculo>(
                  {
                    assinante_id: assinanteId,
                    produto_id: prod.id,
                    empresa_id: empresaId,
                    marketplace: MARKETPLACE,
                    anuncio_id: l.produto_id,
                    variacao_id: l.variacao_id || '',
                    titulo: (l.nome + (l.variacao ? ` (${l.variacao})` : '')).slice(0, 300),
                    unidades: 1,
                  },
                  { requestKey: null },
                )
                vinc = criado
                vinculos.set(chave, criado)
                r.criados++
              } catch {
                r.falhas++
              }
            }
          } else if (vinc) {
            r.existentes++
          }

          if (!vinc) {
            novosPendentes.push({
              chave,
              linha: l,
              motivo: 'sem_vinculo',
              produtoCodigo: '',
              unidades: '1',
              precoAnuncio: '',
            })
            continue
          }
          const prod = porId.get(vinc.produto_id)
          const unid = vinc.unidades > 0 ? vinc.unidades : 1
          if (
            prod &&
            prod.preco_venda > 0 &&
            unid === 1 &&
            !(vinc.preco_anuncio && vinc.preco_anuncio > 0) &&
            l.preco > prod.preco_venda * 3
          ) {
            // Quantidade da caixa pelo nome (C/100, 100UN, X 50); senão fica para preencher
            const m =
              /C\/?\s*(\d{2,4})\b/i.exec(l.nome) ||
              /(\d{2,4})\s*UN/i.exec(l.nome) ||
              /X\s*(\d{2,4})\b/i.exec(l.nome)
            novosPendentes.push({
              chave,
              linha: l,
              motivo: 'unidades',
              vinculoId: vinc.id,
              produtoCodigo: String(prod.codigo),
              unidades: m ? m[1] : '',
              precoAnuncio: String(l.preco || ''),
              precoTrevvo: prod.preco_venda,
            })
          }
        }
        setPendentes((atual) => [...atual, ...novosPendentes])
        setResumo({ ...r })
        pagina = resp.proxima_pagina
      }
    } catch (err) {
      toast({
        title: 'Erro ao sincronizar vínculos',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setRodando(false)
    }
  }

  const alterarPendente = (
    chave: string,
    campo: 'produtoCodigo' | 'unidades' | 'precoAnuncio',
    valor: string,
  ) => {
    setPendentes((lista) =>
      lista.map((p) => (p.chave === chave ? { ...p, [campo]: valor, salvo: false } : p)),
    )
  }

  const salvarPendente = async (p: Pendente) => {
    const unidades = parseInt(p.unidades, 10)
    if (!Number.isInteger(unidades) || unidades < 1 || unidades > 10000) {
      toast({ title: 'Unidades inválidas', variant: 'destructive' })
      return
    }
    const txtPreco = p.precoAnuncio.trim()
    const precoAnuncio = txtPreco
      ? Number(txtPreco.includes(',') ? txtPreco.replace(/\./g, '').replace(',', '.') : txtPreco)
      : 0
    if (!Number.isFinite(precoAnuncio) || precoAnuncio < 0) {
      toast({ title: 'Preço do anúncio inválido', variant: 'destructive' })
      return
    }
    const preco_anuncio = Math.round(precoAnuncio * 100) / 100
    const prod = produtosRef.current.porCodigo.get(Number(p.produtoCodigo))
    if (!prod) {
      toast({
        title: `Produto ${p.produtoCodigo || '(vazio)'} não existe no Trevvo`,
        variant: 'destructive',
      })
      return
    }
    setPendentes((l) => l.map((x) => (x.chave === p.chave ? { ...x, salvando: true } : x)))
    try {
      if (p.vinculoId) {
        await pb
          .collection('produtos_vinculos_anuncios')
          .update(
            p.vinculoId,
            { produto_id: prod.id, unidades, preco_anuncio },
            { requestKey: null },
          )
      } else {
        const criado = await pb.collection('produtos_vinculos_anuncios').create<Vinculo>(
          {
            assinante_id: assinanteId,
            produto_id: prod.id,
            empresa_id: empresaId,
            marketplace: MARKETPLACE,
            anuncio_id: p.linha.produto_id,
            variacao_id: p.linha.variacao_id || '',
            titulo: (p.linha.nome + (p.linha.variacao ? ` (${p.linha.variacao})` : '')).slice(
              0,
              300,
            ),
            unidades,
            preco_anuncio,
          },
          { requestKey: null },
        )
        p.vinculoId = criado.id
      }
      setPendentes((l) =>
        l.map((x) =>
          x.chave === p.chave ? { ...x, vinculoId: p.vinculoId, salvando: false, salvo: true } : x,
        ),
      )
    } catch (err) {
      setPendentes((l) => l.map((x) => (x.chave === p.chave ? { ...x, salvando: false } : x)))
      toast({
        title: 'Não foi possível salvar o vínculo',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  const visiveis = useMemo(
    () => pendentes.filter((p) => filtro === 'todos' || p.motivo === filtro),
    [pendentes, filtro],
  )
  const qtdSem = pendentes.filter((p) => p.motivo === 'sem_vinculo' && !p.salvo).length
  const qtdUnid = pendentes.filter((p) => p.motivo === 'unidades' && !p.salvo).length
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-blue-600" />
          Vínculos com os anúncios da Tray
        </CardTitle>
        <CardDescription className="text-xs">
          Liga cada anúncio da Tray (e cada variação) a um produto do Trevvo, com quantas unidades o
          anúncio vende. É a base do envio de estoque e preço e da entrada de pedidos. Grava só no
          Trevvo; nada é enviado para a Tray. Vínculos já existentes não são trocados. Anúncios
          inativos na Tray são ignorados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {!rodando ? (
            <Button size="sm" onClick={() => void sincronizar()} disabled={!assinanteId}>
              <Link2 className="mr-1 h-4 w-4" />
              Sincronizar vínculos
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => (pararRef.current = true)}>
              <Square className="mr-1 h-4 w-4" />
              Parar
            </Button>
          )}
          {rodando && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
          {(rodando || resumo.anuncios > 0) && (
            <span className="text-slate-600">
              {lidos} de {total || '?'} produtos lidos · {resumo.anuncios} anúncios ·{' '}
              {resumo.criados} vínculos criados · {resumo.existentes} já existiam
              {resumo.falhas ? ` · ${resumo.falhas} falhas` : ''}
              {resumo.inativos ? ` · ${resumo.inativos} inativos na Tray ignorados` : ''}
            </span>
          )}
        </div>
        {rodando && total > 0 && <Progress value={(lidos / total) * 100} />}

        {pendentes.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700">Precisam de ação:</span>
              {(
                [
                  ['todos', `Todos (${qtdSem + qtdUnid})`],
                  ['sem_vinculo', `Sem vínculo (${qtdSem})`],
                  ['unidades', `Conferir unidades (${qtdUnid})`],
                ] as const
              ).map(([v, rotulo]) => (
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
                    <TableHead className="text-[11px]">Situação</TableHead>
                    <TableHead className="text-[11px] text-right">Preço Tray</TableHead>
                    <TableHead className="text-[11px] w-28">Cód. Trevvo</TableHead>
                    <TableHead className="text-[11px] w-20">Unidades</TableHead>
                    <TableHead className="text-[11px] w-24">Preço anúncio</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((p) => (
                    <TableRow key={p.chave}>
                      <TableCell className="text-[11px]">
                        <div className="font-medium text-slate-800">{p.linha.nome}</div>
                        <div className="text-slate-500">
                          #{p.linha.produto_id}
                          {p.linha.variacao_id ? ` · var. ${p.linha.variacao_id}` : ''}
                          {p.linha.variacao ? ` · ${p.linha.variacao}` : ''}
                          {p.linha.referencia ? ` · ref ${p.linha.referencia}` : ''}
                          {p.linha.ean ? ` · EAN ${p.linha.ean}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {p.motivo === 'sem_vinculo' ? (
                          <Badge variant="outline" className="border-rose-300 text-rose-700">
                            {p.linha.situacao}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-800">
                            Provável caixa/kit (Trevvo {fmt(p.precoTrevvo || 0)})
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[11px]">{fmt(p.linha.preco)}</TableCell>
                      <TableCell>
                        <Input
                          value={p.produtoCodigo}
                          onChange={(e) =>
                            alterarPendente(p.chave, 'produtoCodigo', e.target.value)
                          }
                          className="h-7 text-[11px]"
                          inputMode="numeric"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={p.unidades}
                          onChange={(e) => alterarPendente(p.chave, 'unidades', e.target.value)}
                          className="h-7 text-[11px]"
                          inputMode="numeric"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={p.precoAnuncio}
                          placeholder="loja x un."
                          title="Preço fixo do anúncio (caixa/kit). Vazio = preço da loja x unidades"
                          onChange={(e) => alterarPendente(p.chave, 'precoAnuncio', e.target.value)}
                          className="h-7 text-[11px]"
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell>
                        {p.salvo ? (
                          <span className="text-emerald-700">Salvo</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={p.salvando}
                            onClick={() => void salvarPendente(p)}
                          >
                            {p.salvando ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default VinculosTray
