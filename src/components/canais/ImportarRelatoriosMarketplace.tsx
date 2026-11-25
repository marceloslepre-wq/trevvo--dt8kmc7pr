import React, { useMemo, useState } from 'react'
import { Download, FileUp, Link2, Loader2, Save, Search } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import type { CanalMargem } from '@/services/canaisMargem'
import { salvarPrecoCanal } from '@/services/precosEmpresa'
import {
  LinhaImportacao,
  Marketplace,
  ProdutoTrevvo,
  carregarProdutosTrevvo,
  carregarVinculos,
  casarAnuncios,
  gravarVinculo,
  lerCsv,
  lerRelatoriosAmazon,
  lerRelatoriosShopee,
  valoresPorProduto,
} from '@/services/relatoriosMarketplace'

interface Props {
  canais: CanalMargem[]
}

const brl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CONFIG: Record<
  Marketplace,
  { nome: string; regex: RegExp; arq1: string; arq2: string; aceita1: string; aceita2: string }
> = {
  amazon: {
    nome: 'Amazon',
    regex: /amazon/i,
    arq1: 'Relatório de ofertas ativas (.txt)',
    arq2: 'Relatório de transações por intervalo de datas (.csv)',
    aceita1: '.txt,.tsv,.csv',
    aceita2: '.csv,.txt',
  },
  shopee: {
    nome: 'Shopee',
    regex: /shopee/i,
    arq1: 'Editar em Massa > Informações de vendas (.xlsx)',
    arq2: 'Minha Renda (.xlsx)',
    aceita1: '.xlsx',
    aceita2: '.xlsx',
  },
}

const QuadroMarketplace: React.FC<{ marketplace: Marketplace; canal: CanalMargem | undefined }> = ({
  marketplace,
  canal,
}) => {
  const cfg = CONFIG[marketplace]
  const assinanteId = useAssinanteId()
  const [arq1, setArq1] = useState<File | null>(null)
  const [arq2, setArq2] = useState<File | null>(null)
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([])
  const [produtos, setProdutos] = useState<ProdutoTrevvo[]>([])
  const [digitados, setDigitados] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<'' | 'analisar' | 'vincular' | 'gravar'>('')
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<string[][]>([])
  const [filtro, setFiltro] = useState('')

  const empresaId = canal?.empresa_id || ''

  const analisar = async () => {
    if (!arq1 || !canal?.id || !empresaId) return
    setOcupado('analisar')
    try {
      const anuncios =
        marketplace === 'amazon'
          ? await lerRelatoriosAmazon(arq1, arq2)
          : await lerRelatoriosShopee(arq1, arq2)
      const prods = await carregarProdutosTrevvo(assinanteId)
      const vinc = await carregarVinculos(empresaId, marketplace)
      setProdutos(prods)
      setLinhas(casarAnuncios(anuncios, prods, vinc, marketplace))
      const sug: Record<string, string> = {}
      for (const l of casarAnuncios(anuncios, prods, vinc, marketplace))
        if (!l.produto && l.sugestao) sug[l.sku] = l.sugestao
      setDigitados(sug)
      setResultado([])
    } catch (e) {
      toast({
        title: 'Não foi possível ler os arquivos',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setOcupado('')
    }
  }

  const resumo = useMemo(() => {
    const achados = linhas.filter((l) => l.produto)
    return {
      anuncios: linhas.length,
      achados: achados.length,
      comRecebido: achados.filter((l) => l.recebido !== null).length,
      semProduto: linhas.filter((l) => !l.produto).length,
      produtos: valoresPorProduto(linhas).size,
    }
  }, [linhas])

  const pendentes = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return linhas
      .filter((l) => !l.produto)
      .filter((l) => !f || l.titulo.toLowerCase().includes(f) || l.sku.toLowerCase().includes(f))
      .sort((a, b) => b.unidades - a.unidades)
  }, [linhas, filtro])

  const vincularDigitados = async (pares?: { sku: string; codigo: string }[]) => {
    if (!empresaId) return
    const porCodigo = new Map(produtos.map((p) => [String(p.codigo), p]))
    const lista =
      pares ||
      Object.entries(digitados)
        .filter(([, c]) => c.trim())
        .map(([sku, codigo]) => ({ sku, codigo: codigo.trim() }))
    if (lista.length === 0) return
    setOcupado('vincular')
    let ok = 0
    const erros: string[] = []
    for (const { sku, codigo } of lista) {
      const p = porCodigo.get(codigo)
      const linha = linhas.find((l) => l.sku === sku)
      if (!p) {
        erros.push(`${sku}: código ${codigo} não existe no Trevvo`)
        continue
      }
      try {
        await gravarVinculo(assinanteId, empresaId, marketplace, sku, p.id, linha?.titulo || '')
        ok++
      } catch (e) {
        erros.push(`${sku}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // Atualiza a tela com os novos vínculos
    const vinc = await carregarVinculos(empresaId, marketplace)
    const novas = casarAnuncios(
      linhas.map((l) => ({
        sku: l.sku,
        titulo: l.titulo,
        preco: l.preco,
        recebido: l.recebido,
        unidades: l.unidades,
        pedidos: 0,
      })),
      produtos,
      vinc,
      marketplace,
    )
    setLinhas(novas)
    const sug: Record<string, string> = {}
    for (const l of novas) if (!l.produto && l.sugestao) sug[l.sku] = l.sugestao
    setDigitados(sug)
    setOcupado('')
    toast({
      title: `${ok} vínculo(s) gravado(s)`,
      description: erros.length ? erros.slice(0, 5).join(' · ') : undefined,
      variant: erros.length ? 'destructive' : undefined,
    })
  }

  const importarVinculosCsv = async (arquivo: File) => {
    const linhasCsv = lerCsv((await arquivo.text()).replace(/^﻿/, ''), ';')
    const pares = linhasCsv
      .filter((l, i) => !(i === 0 && /sku/i.test(l[0] || '')))
      .map((l) => ({ sku: (l[0] || '').trim(), codigo: (l[1] || '').trim() }))
      .filter((p) => p.sku && /^\d+$/.test(p.codigo))
    await vincularDigitados(pares)
  }

  const gravar = async () => {
    if (!canal?.id) return
    setOcupado('gravar')
    setProgresso(0)
    const valores = Array.from(valoresPorProduto(linhas).values())
    // Valor recebido atual de cada produto no canal (mantido quando não houve venda no período)
    const atuais = await pb.collection('produtos_precos_canal').getFullList<{
      produto_id: string
      valor_recebido: number
    }>({
      filter: pb.filter('canal_id = {:c}', { c: canal.id }),
      fields: 'produto_id,valor_recebido',
      requestKey: null,
    })
    const recebidoAtual = new Map(atuais.map((a) => [a.produto_id, Number(a.valor_recebido) || 0]))
    const linhasRes: string[][] = []
    for (let i = 0; i < valores.length; i += 4) {
      const lote = valores.slice(i, i + 4)
      await Promise.all(
        lote.map(async (v) => {
          const recebido = v.recebido ?? (recebidoAtual.get(v.produto.id) || null)
          try {
            await salvarPrecoCanal(
              v.produto.id,
              canal.id as string,
              v.preco,
              recebido,
              assinanteId,
              // Unidades só quando veio o arquivo de vendas (sem ele não se sabe quanto vendeu)
              arq2 ? v.unidades : undefined,
            )
            linhasRes.push([
              String(v.produto.codigo),
              v.produto.descricao,
              v.sku,
              String(v.preco),
              recebido === null ? '' : String(recebido),
              v.recebido === null ? 'Gravado (sem vendas no período)' : 'Gravado',
            ])
          } catch (e) {
            linhasRes.push([
              String(v.produto.codigo),
              v.produto.descricao,
              v.sku,
              String(v.preco),
              '',
              'Erro: ' + (e instanceof Error ? e.message : String(e)),
            ])
          }
        }),
      )
      setProgresso(Math.round(((i + lote.length) / valores.length) * 100))
    }
    setResultado(linhasRes)
    setOcupado('')
    toast({ title: `${linhasRes.length} produto(s) atualizados no canal ${canal.nome}` })
  }

  const baixar = () => {
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const num = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
    const cab = [
      'SKU',
      'Anúncio',
      'Preço',
      'Recebido (mediana)',
      'Unidades vendidas',
      'Código Trevvo',
      'Produto Trevvo',
      'Achado por',
      'Situação',
    ]
    const corpo = linhas.map((l) =>
      [
        l.sku,
        l.titulo,
        num(l.preco),
        num(l.recebido),
        l.unidades,
        l.produto ? l.produto.codigo : '',
        l.produto ? l.produto.descricao : '',
        l.origem,
        l.produto ? 'OK' : l.situacao + (l.observacao ? ` (${l.observacao})` : ''),
      ]
        .map(esc)
        .join(';'),
    )
    const conteudo = '﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${marketplace}-anuncios-trevvo.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!canal) {
    return (
      <p className="text-sm text-muted-foreground">
        Cadastre acima um canal com &quot;{cfg.nome}&quot; no nome e a empresa da loja virtual.
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded border p-3 notranslate" translate="no">
      <div className="font-medium">
        {cfg.nome} <span className="text-xs text-muted-foreground">→ canal {canal.nome}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">1. {cfg.arq1}</span>
          <Input
            type="file"
            accept={cfg.aceita1}
            onChange={(e) => setArq1(e.target.files?.[0] || null)}
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">2. {cfg.arq2} (opcional)</span>
          <Input
            type="file"
            accept={cfg.aceita2}
            onChange={(e) => setArq2(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={analisar} disabled={!arq1 || !!ocupado}>
          {ocupado === 'analisar' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1 h-4 w-4" />
          )}
          Analisar (não grava)
        </Button>
        <Button size="sm" onClick={gravar} disabled={resumo.produtos === 0 || !!ocupado}>
          {ocupado === 'gravar' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Gravar preços em {resumo.produtos} produto(s)
        </Button>
        {linhas.length > 0 && (
          <Button size="sm" variant="outline" onClick={baixar}>
            <Download className="mr-1 h-4 w-4" />
            Baixar resultado
          </Button>
        )}
      </div>
      {ocupado === 'gravar' && <Progress value={progresso} />}

      {linhas.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{resumo.anuncios} anúncios</Badge>
          <Badge variant="secondary">{resumo.achados} com produto</Badge>
          <Badge variant="secondary">{resumo.comRecebido} com valor recebido</Badge>
          <Badge variant={resumo.semProduto ? 'destructive' : 'outline'}>
            {resumo.semProduto} sem produto
          </Badge>
          <Badge variant="outline">{resumo.produtos} produtos do Trevvo</Badge>
          {resultado.length > 0 && (
            <Badge>{resultado.filter((r) => !r[5].startsWith('Erro')).length} gravados</Badge>
          )}
        </div>
      )}

      {pendentes.length > 0 || filtro ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">Anúncios sem produto no Trevvo</div>
          <p className="text-xs text-muted-foreground">
            Digite o código do produto no Trevvo e clique em &quot;Gravar vínculos&quot;. O vínculo
            fica salvo e as próximas importações já acham o produto. Também dá para enviar um
            arquivo .csv com as colunas <b>sku;codigo</b>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Filtrar por nome ou SKU"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-8 w-60"
            />
            <Button
              size="sm"
              onClick={() => vincularDigitados()}
              disabled={!!ocupado || !Object.values(digitados).some((v) => v.trim())}
            >
              {ocupado === 'vincular' ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1 h-4 w-4" />
              )}
              Gravar vínculos
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs">
              <FileUp className="h-3.5 w-3.5" /> Enviar sku;codigo (.csv)
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importarVinculosCsv(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <div className="max-h-[380px] overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-2 text-left">Anúncio</th>
                  <th className="p-2 text-right">Preço</th>
                  <th className="p-2 text-right">Recebido</th>
                  <th className="p-2 text-right">Vendidos</th>
                  <th className="p-2 text-left">Código Trevvo</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.slice(0, 300).map((l) => (
                  <tr key={l.sku} className="border-t">
                    <td className="p-2">
                      <div>{l.titulo || '—'}</div>
                      <div className="text-muted-foreground">
                        SKU {l.sku}
                        {l.situacao ? ` · ${l.situacao}` : ''}
                        {l.observacao ? ` (${l.observacao})` : ''}
                      </div>
                    </td>
                    <td className="p-2 text-right">{brl(l.preco)}</td>
                    <td className="p-2 text-right">{brl(l.recebido)}</td>
                    <td className="p-2 text-right">{l.unidades || ''}</td>
                    <td className="p-2">
                      <Input
                        className="h-7 w-24"
                        inputMode="numeric"
                        value={digitados[l.sku] || ''}
                        onChange={(e) =>
                          setDigitados((prev) =>
                            Object.assign({}, prev, {
                              [l.sku]: e.target.value.replace(/\D/g, ''),
                            }),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Importa os relatórios exportados da Amazon e da Shopee e grava, por produto, o preço e o
 * valor recebido nos canais. Uso semanal até haver integração direta. Nada é enviado aos
 * marketplaces.
 */
export const ImportarRelatoriosMarketplace: React.FC<Props> = ({ canais }) => {
  const achar = (m: Marketplace) =>
    canais.find((c) => c.id && c.empresa_id && CONFIG[m].regex.test(c.nome || ''))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importar relatórios da Amazon e da Shopee</CardTitle>
        <CardDescription>
          Toda semana, baixe os relatórios nos marketplaces e envie aqui. O Trevvo grava, em cada
          produto, o preço do anúncio e o valor recebido (mediana por unidade das vendas do período,
          já sem comissão, tarifas e frete; pedidos com reembolso ficam de fora). Produto sem venda
          no período fica com o valor recebido anterior. Nada é enviado aos marketplaces.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QuadroMarketplace marketplace="amazon" canal={achar('amazon')} />
        <QuadroMarketplace marketplace="shopee" canal={achar('shopee')} />
      </CardContent>
    </Card>
  )
}

export default ImportarRelatoriosMarketplace
