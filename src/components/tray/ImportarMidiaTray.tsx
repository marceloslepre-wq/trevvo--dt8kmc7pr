import React, { useMemo, useRef, useState } from 'react'
import { Download, ImageDown, Loader2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { LinhaMidiaTray, importarMidiaTray, mensagemErroTray } from '@/services/tray'

interface Props {
  empresaId: string
}

const POR_PAGINA = 5

/**
 * Copia descrição, imagens, peso e medidas dos produtos da Tray para os produtos do Trevvo.
 * As imagens são baixadas e guardadas no próprio Trevvo. Nada é alterado na Tray.
 */
export const ImportarMidiaTray: React.FC<Props> = ({ empresaId }) => {
  const [linhas, setLinhas] = useState<LinhaMidiaTray[]>([])
  const [total, setTotal] = useState(0)
  const [lidos, setLidos] = useState(0)
  const [rodando, setRodando] = useState(false)
  const [sobrescrever, setSobrescrever] = useState(false)
  const [simulacao, setSimulacao] = useState(false)
  const parar = useRef(false)

  const executar = async (modo: 'teste' | 'tudo' | 'simular') => {
    parar.current = false
    setRodando(true)
    setLinhas([])
    setLidos(0)
    setSimulacao(modo === 'simular')
    let pagina: number | null = 1
    try {
      while (pagina !== null && !parar.current) {
        let resp = null
        // Até 3 tentativas por página (rede instável ou limite da Tray).
        for (let t = 0; t < 3 && !resp; t++) {
          try {
            resp = await importarMidiaTray(empresaId, pagina, {
              limite: POR_PAGINA,
              sobrescrever,
              simular: modo === 'simular',
            })
          } catch (e) {
            if (t === 2) throw e
            await new Promise((r) => setTimeout(r, 3000 * (t + 1)))
          }
        }
        if (!resp) break
        const novas = resp.linhas
        setLinhas((atual) => atual.concat(novas))
        setTotal(resp.total_produtos)
        setLidos((n) => n + resp.produtos_nesta_pagina)
        pagina = modo === 'teste' ? null : resp.proxima_pagina
      }
      toast({
        title: parar.current ? 'Importação interrompida' : 'Importação concluída',
        description: 'Baixe o resultado para conferir produto a produto.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao importar da Tray',
        description: mensagemErroTray(err, 'Tente novamente; o que já foi gravado fica salvo.'),
        variant: 'destructive',
      })
    } finally {
      setRodando(false)
    }
  }

  const resumo = useMemo(() => {
    const mapa: Record<string, number> = {}
    linhas.forEach((l) => {
      mapa[l.situacao] = (mapa[l.situacao] || 0) + 1
    })
    return mapa
  }, [linhas])

  const baixarResultado = () => {
    const cab = [
      'Código Tray',
      'Nome',
      'Variação',
      'Referência na Tray',
      'Produto(s) no Trevvo',
      'Descrição',
      'Imagens gravadas',
      'Situação',
      'Observação',
    ]
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const corpo = linhas.map((l) =>
      [
        l.produto_tray,
        l.nome,
        l.variacao,
        l.referencia,
        l.produtos_trevvo,
        l.descricao,
        l.imagens,
        l.situacao,
        l.observacao,
      ]
        .map(esc)
        .join(';'),
    )
    const conteudo = '﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'importacao-midia-tray.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const progresso = total > 0 ? Math.min(100, Math.round((lidos / total) * 100)) : 0

  return (
    <Card className="notranslate" translate="no">
      <CardHeader>
        <CardTitle className="text-base">Importar descrição e imagens da Tray</CardTitle>
        <CardDescription>
          Copia para o cadastro do Trevvo a descrição do produto, as imagens (foto principal + até 5
          adicionais, guardadas no Trevvo), o peso e as medidas. O produto é encontrado pelo código
          (= referência na Tray). Peso e medidas só são preenchidos quando estão vazios. Nada é
          alterado na Tray.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={sobrescrever}
            onCheckedChange={(v) => setSobrescrever(v === true)}
            disabled={rodando}
          />
          Substituir descrição e fotos que o produto já tem no Trevvo
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => executar('simular')} disabled={rodando}>
            Simular (não grava)
          </Button>
          <Button variant="outline" onClick={() => executar('teste')} disabled={rodando}>
            {rodando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-2 h-4 w-4" />
            )}
            Testar com {POR_PAGINA} produtos
          </Button>
          <Button onClick={() => executar('tudo')} disabled={rodando}>
            Importar todos
          </Button>
          {rodando && (
            <Button
              variant="destructive"
              onClick={() => {
                parar.current = true
              }}
            >
              <Square className="mr-2 h-4 w-4" />
              Parar
            </Button>
          )}
          {linhas.length > 0 && !rodando && (
            <Button variant="outline" onClick={baixarResultado}>
              <Download className="mr-2 h-4 w-4" />
              Baixar resultado
            </Button>
          )}
        </div>

        {(rodando || lidos > 0) && (
          <div className="space-y-2">
            <Progress value={progresso} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {lidos} de {total} produtos da Tray processados
                {simulacao ? ' (simulação, nada foi gravado)' : ''}
              </span>
              {Object.keys(resumo).map((s) => (
                <Badge
                  key={s}
                  variant={
                    s === 'Atualizado' || s === 'Seria atualizado'
                      ? 'secondary'
                      : s === 'Nada a mudar'
                        ? 'outline'
                        : 'destructive'
                  }
                >
                  {s}: {resumo[s]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="max-h-[420px] overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto na Tray</TableHead>
                  <TableHead>Trevvo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Imagens</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.slice(-200).map((l, i) => (
                  <TableRow key={`${l.produto_tray}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.produto_tray}
                        {l.variacao ? ` · ${l.variacao}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>{l.produtos_trevvo || '—'}</TableCell>
                    <TableCell>{l.descricao || '—'}</TableCell>
                    <TableCell className="text-right">{l.imagens}</TableCell>
                    <TableCell>
                      <div>{l.situacao}</div>
                      {l.observacao && (
                        <div className="text-xs text-muted-foreground">{l.observacao}</div>
                      )}
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

export default ImportarMidiaTray
