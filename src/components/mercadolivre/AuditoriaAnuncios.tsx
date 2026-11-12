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
import {
  LinhaAuditoriaAnuncio,
  auditarAnunciosMercadoLivre,
  mensagemErroMercadoLivre,
} from '@/services/mercadoLivre'

interface Props {
  empresaId: string
}

/**
 * Auditoria somente leitura: lista os anúncios da conta conectada, variação por variação,
 * e compara o SKU gravado no Mercado Livre com a referência dos produtos do Trevvo.
 * Não altera nada no Mercado Livre nem no Trevvo.
 */
export const AuditoriaAnuncios: React.FC<Props> = ({ empresaId }) => {
  const [linhas, setLinhas] = useState<LinhaAuditoriaAnuncio[]>([])
  const [total, setTotal] = useState(0)
  const [anunciosLidos, setAnunciosLidos] = useState(0)
  const [proximoOffset, setProximoOffset] = useState<number | null>(0)
  const [falhas, setFalhas] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [soProblemas, setSoProblemas] = useState(false)
  const [iniciada, setIniciada] = useState(false)

  const carregarPaginas = async (quantasPaginas: number) => {
    if (proximoOffset === null) return
    setCarregando(true)
    setIniciada(true)
    let offset: number | null = proximoOffset
    try {
      for (let i = 0; i < quantasPaginas && offset !== null; i++) {
        const pagina = await auditarAnunciosMercadoLivre(empresaId, offset, 10)
        setLinhas((atual) => [...atual, ...pagina.linhas])
        setTotal(pagina.total_anuncios)
        setAnunciosLidos((n) => n + pagina.anuncios_nesta_pagina)
        setFalhas((n) => n + (pagina.falhas ? pagina.falhas.length : 0))
        offset = pagina.proximo_offset
        setProximoOffset(offset)
      }
    } catch (err) {
      toast({
        title: 'Erro ao ler os anúncios',
        description: mensagemErroMercadoLivre(err, 'Tente novamente.'),
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
      'Anúncio',
      'Título',
      'Status',
      'ID da variação',
      'Variação',
      'SKU no Mercado Livre',
      'Estoque no Mercado Livre',
      'Situação',
      'Código do produto no Trevvo',
      'Produto no Trevvo',
    ]
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const corpo = linhas.map((l) =>
      [
        l.anuncio_id,
        l.titulo,
        l.status_anuncio,
        l.variacao_id,
        l.variacao,
        l.sku,
        l.estoque_ml,
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
    a.download = 'auditoria-anuncios-mercado-livre.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auditoria de anúncios (somente leitura)</CardTitle>
        <CardDescription>
          Lê os anúncios da conta, variação por variação, e compara o SKU gravado no Mercado Livre
          com a referência dos produtos do Trevvo. Nada é alterado no Mercado Livre nem no Trevvo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => carregarPaginas(1)} disabled={carregando || proximoOffset === null}>
            {carregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {iniciada ? 'Ler mais 10 anúncios' : 'Ler os 10 primeiros anúncios'}
          </Button>
          {iniciada && (
            <Button
              variant="outline"
              onClick={() => carregarPaginas(10)}
              disabled={carregando || proximoOffset === null}
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
              {anunciosLidos} de {total} anúncios lidos · {linhas.length} linhas
              {falhas > 0 ? ` · ${falhas} anúncios com falha de leitura` : ''}
            </span>
            {Object.keys(resumo).map((s) => (
              <Badge key={s} variant={s === 'OK' ? 'secondary' : 'destructive'}>
                {s}: {resumo[s]}
              </Badge>
            ))}
          </div>
        )}

        {visiveis.length > 0 && (
          <div className="overflow-x-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>SKU no Mercado Livre</TableHead>
                  <TableHead className="text-right">Estoque ML</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Produto no Trevvo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l, i) => (
                  <TableRow key={`${l.anuncio_id}-${l.variacao_id}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{l.titulo}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.anuncio_id} · {l.status_anuncio}
                      </div>
                    </TableCell>
                    <TableCell>
                      {l.variacao || '—'}
                      {l.variacao_id && (
                        <div className="text-xs text-muted-foreground">id {l.variacao_id}</div>
                      )}
                    </TableCell>
                    <TableCell>{l.sku || '—'}</TableCell>
                    <TableCell className="text-right">{l.estoque_ml}</TableCell>
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

export default AuditoriaAnuncios
