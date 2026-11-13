import React, { useMemo, useState } from 'react'
import { Download, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { LinhaProdutoTray, conferirProdutosTray, mensagemErroTray } from '@/services/tray'

interface Props {
  empresaId: string
}

/**
 * Conferência somente leitura: lista os produtos da loja Tray conectada, variação por variação,
 * e compara a referência gravada na Tray com a referência dos produtos do Trevvo.
 * Não altera nada na Tray nem no Trevvo.
 */
export const ConferenciaProdutosTray: React.FC<Props> = ({ empresaId }) => {
  const [linhas, setLinhas] = useState<LinhaProdutoTray[]>([])
  const [total, setTotal] = useState(0)
  const [produtosLidos, setProdutosLidos] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(1)
  const [falhas, setFalhas] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [soProblemas, setSoProblemas] = useState(false)
  const [iniciada, setIniciada] = useState(false)

  const carregarPaginas = async (quantasPaginas: number) => {
    if (proximaPagina === null) return
    setCarregando(true)
    setIniciada(true)
    let pagina: number | null = proximaPagina
    try {
      for (let i = 0; i < quantasPaginas && pagina !== null; i++) {
        const resp = await conferirProdutosTray(empresaId, pagina, 10)
        setLinhas((atual) => [...atual, ...resp.linhas])
        setTotal(resp.total_produtos)
        setProdutosLidos((n) => n + resp.produtos_nesta_pagina)
        setFalhas((n) => n + (resp.falhas ? resp.falhas.length : 0))
        pagina = resp.proxima_pagina
        setProximaPagina(pagina)
      }
    } catch (err) {
      toast({
        title: 'Erro ao ler os produtos da Tray',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  const resumo = useMemo(() => {
    const mapa: Record<string, number> = {}
    linhas.forEach((l) => {
      mapa[l.situacao] = (mapa[l.situacao] || 0) + 1
    })
    return mapa
  }, [linhas])

  const visiveis = useMemo(
    () => (soProblemas ? linhas.filter((l) => l.situacao !== 'OK') : linhas),
    [linhas, soProblemas],
  )

  const exportarCsv = () => {
    const cab = [
      'Código do produto na Tray',
      'Nome',
      'Ativo na Tray',
      'Referência do produto',
      'ID da variação',
      'Variação',
      'Código Tray (produto_variação)',
      'Referência',
      'Estoque na Tray',
      'Preço na Tray',
      'Situação',
      'Código do produto no Trevvo',
      'Produto no Trevvo',
    ]
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const corpo = linhas.map((l) =>
      [
        l.produto_id,
        l.nome,
        l.ativo_na_tray ? 'Sim' : 'Não',
        l.referencia_produto,
        l.variacao_id,
        l.variacao,
        l.codigo_tray,
        l.referencia,
        l.estoque,
        String(l.preco).replace('.', ','),
        l.situacao,
        l.produto_codigo,
        l.produto_descricao,
      ]
        .map(esc)
        .join(';'),
    )
    const conteudo = '﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'conferencia-produtos-tray.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conferência de produtos (somente leitura)</CardTitle>
        <CardDescription>
          Lê os produtos da loja, variação por variação, e compara a referência gravada na Tray com
          a referência dos produtos do Trevvo. Nada é alterado na Tray nem no Trevvo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => carregarPaginas(1)}
            disabled={carregando || proximaPagina === null}
          >
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {iniciada ? 'Ler mais 10 produtos' : 'Ler os 10 primeiros produtos'}
          </Button>
          {iniciada && (
            <Button
              variant="outline"
              onClick={() => carregarPaginas(10)}
              disabled={carregando || proximaPagina === null}
            >
              Ler mais 100
            </Button>
          )}
          {linhas.length > 0 && (
            <>
              <Button variant="outline" onClick={() => setSoProblemas((v) => !v)}>
                {soProblemas ? 'Mostrar todas' : 'Mostrar só problemas'}
              </Button>
              <Button variant="outline" onClick={exportarCsv}>
                <Download className="mr-2 h-4 w-4" />
                Exportar planilha
              </Button>
            </>
          )}
        </div>

        {iniciada && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {produtosLidos} de {total} produtos lidos · {linhas.length} linhas
              {falhas > 0 ? ` · ${falhas} produtos com falha ao ler variações` : ''}
            </span>
            {Object.keys(resumo).map((s) => (
              <Badge key={s} variant={s === 'OK' ? 'secondary' : 'destructive'}>
                {s}: {resumo[s]}
              </Badge>
            ))}
          </div>
        )}

        {iniciada && !carregando && linhas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum produto encontrado nesta loja.</p>
        )}

        {visiveis.length > 0 && (
          <div className="overflow-x-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto na Tray</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>Código Tray</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Produto no Trevvo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l, i) => (
                  <TableRow key={`${l.codigo_tray}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.produto_id} · {l.ativo_na_tray ? 'ativo' : 'inativo'}
                      </div>
                    </TableCell>
                    <TableCell>{l.variacao || '—'}</TableCell>
                    <TableCell>{l.codigo_tray}</TableCell>
                    <TableCell>{l.referencia || '—'}</TableCell>
                    <TableCell className="text-right">{l.estoque}</TableCell>
                    <TableCell>
                      <Badge variant={l.situacao === 'OK' ? 'secondary' : 'destructive'}>
                        {l.situacao}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {l.produto_descricao ? `${l.produto_codigo} · ${l.produto_descricao}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ConferenciaProdutosTray
