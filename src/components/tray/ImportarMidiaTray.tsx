import React, { useEffect, useMemo, useState } from 'react'
import { Download, ImageDown, Loader2, Play, Square } from 'lucide-react'
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

type Modo = 'teste' | 'tudo' | 'simular'

interface EstadoImportacao {
  rodando: boolean
  modo: Modo | null
  linhas: LinhaMidiaTray[]
  total: number
  lidos: number
  /** Próxima página a processar; null quando terminou. */
  proxima: number | null
  sobrescrever: boolean
  terminadoEm: string
}

const vazio = (): EstadoImportacao => ({
  rodando: false,
  modo: null,
  linhas: [],
  total: 0,
  lidos: 0,
  proxima: null,
  sobrescrever: false,
  terminadoEm: '',
})

/*
 * O estado fica fora do componente (por empresa) e é guardado no navegador a cada página.
 * Assim a importação continua e o resultado não se perde se a tela for recarregada pelo
 * sistema (troca de empresa, renovação de login) ou se a página for aberta de novo.
 */
const estados: Record<string, EstadoImportacao> = {}
const ouvintes = new Set<() => void>()
const pararPedido: Record<string, boolean> = {}

const chaveLocal = (empresaId: string) => `trevvo_tray_midia_${empresaId}`

function lerEstado(empresaId: string): EstadoImportacao {
  if (!estados[empresaId]) {
    let salvo: EstadoImportacao | null = null
    try {
      const bruto = localStorage.getItem(chaveLocal(empresaId))
      if (bruto) salvo = JSON.parse(bruto)
    } catch {
      salvo = null
    }
    // Um estado salvo "rodando" é de uma aba que foi fechada: fica parado, pronto para continuar.
    estados[empresaId] = salvo ? { ...vazio(), ...salvo, rodando: false } : vazio()
  }
  return estados[empresaId]
}

function gravarEstado(empresaId: string, novo: EstadoImportacao) {
  estados[empresaId] = novo
  try {
    localStorage.setItem(chaveLocal(empresaId), JSON.stringify(novo))
  } catch {
    // navegador sem espaço ou bloqueado: segue só na memória
  }
  ouvintes.forEach((f) => f())
}

async function rodarImportacao(empresaId: string, modo: Modo, continuar: boolean) {
  const atual = lerEstado(empresaId)
  if (atual.rodando) return
  pararPedido[empresaId] = false
  const base: EstadoImportacao = continuar
    ? { ...atual, rodando: true, modo }
    : { ...vazio(), rodando: true, modo, sobrescrever: atual.sobrescrever, proxima: 1 }
  gravarEstado(empresaId, base)

  let pagina: number | null = base.proxima ?? 1
  let falhasSeguidas = 0
  try {
    while (pagina !== null && !pararPedido[empresaId]) {
      let resp = null
      let erro: unknown = null
      // Até 5 tentativas por página (rede instável, servidor ocupado ou limite da Tray).
      for (let t = 0; t < 5 && !resp && !pararPedido[empresaId]; t++) {
        try {
          resp = await importarMidiaTray(empresaId, pagina, {
            limite: POR_PAGINA,
            sobrescrever: lerEstado(empresaId).sobrescrever,
            simular: modo === 'simular',
          })
        } catch (e) {
          erro = e
          await new Promise((r) => setTimeout(r, 3000 * (t + 1)))
        }
      }
      const e0 = lerEstado(empresaId)
      if (!resp) {
        if (pararPedido[empresaId]) break
        // Página com erro: registra e segue para a próxima, sem parar a importação inteira.
        falhasSeguidas++
        const linhaErro: LinhaMidiaTray = {
          produto_tray: `página ${pagina}`,
          nome: '',
          variacao: '',
          referencia: '',
          produtos_trevvo: '',
          descricao: '',
          imagens: 0,
          situacao: 'Erro',
          observacao: mensagemErroTray(erro, 'Falha ao processar esta página.'),
        }
        const seguinte = e0.total > 0 && pagina * POR_PAGINA >= e0.total ? null : pagina + 1
        gravarEstado(empresaId, { ...e0, linhas: e0.linhas.concat([linhaErro]), proxima: seguinte })
        if (falhasSeguidas >= 3) {
          throw erro || new Error('Três páginas seguidas falharam.')
        }
        pagina = modo === 'teste' ? null : seguinte
        continue
      }
      falhasSeguidas = 0
      const seguinte = modo === 'teste' ? null : resp.proxima_pagina
      gravarEstado(empresaId, {
        ...e0,
        linhas: e0.linhas.concat(resp.linhas),
        total: resp.total_produtos,
        lidos: e0.lidos + resp.produtos_nesta_pagina,
        proxima: seguinte,
      })
      pagina = seguinte
    }
    const fim = lerEstado(empresaId)
    gravarEstado(empresaId, {
      ...fim,
      rodando: false,
      terminadoEm: fim.proxima === null ? new Date().toISOString() : '',
    })
    toast({
      title: pararPedido[empresaId] ? 'Importação interrompida' : 'Importação concluída',
      description: 'O resultado fica salvo nesta tela; use "Baixar resultado".',
    })
  } catch (err) {
    gravarEstado(empresaId, { ...lerEstado(empresaId), rodando: false })
    toast({
      title: 'Importação parou',
      description: `${mensagemErroTray(err, 'Falha de comunicação.')} Clique em "Continuar de onde parou".`,
      variant: 'destructive',
    })
  }
}

function useEstadoImportacao(empresaId: string): EstadoImportacao {
  const [, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick((n) => n + 1)
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [])
  return lerEstado(empresaId)
}

/**
 * Copia descrição, imagens, peso e medidas dos produtos da Tray para os produtos do Trevvo.
 * As imagens são baixadas e guardadas no próprio Trevvo. Nada é alterado na Tray.
 */
export const ImportarMidiaTray: React.FC<Props> = ({ empresaId }) => {
  const estado = useEstadoImportacao(empresaId)
  const { linhas, total, lidos, rodando, modo, proxima } = estado

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
    a.download = modo === 'simular' ? 'simulacao-midia-tray.csv' : 'importacao-midia-tray.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const progresso = total > 0 ? Math.min(100, Math.round((lidos / total) * 100)) : 0
  const podeContinuar = !rodando && modo === 'tudo' && proxima !== null && lidos > 0

  return (
    <Card className="notranslate" translate="no">
      <CardHeader>
        <CardTitle className="text-base">Importar descrição e imagens da Tray</CardTitle>
        <CardDescription>
          Copia para o cadastro do Trevvo a descrição do produto, as imagens (foto principal + até 5
          adicionais, guardadas no Trevvo), o peso e as medidas. O produto é encontrado pelo código
          (= referência na Tray). Peso e medidas só são preenchidos quando estão vazios. Nada é
          alterado na Tray. O resultado fica salvo nesta tela até a próxima importação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={estado.sobrescrever}
            onCheckedChange={(v) =>
              gravarEstado(empresaId, { ...estado, sobrescrever: v === true })
            }
            disabled={rodando}
          />
          Substituir descrição e fotos que o produto já tem no Trevvo
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => rodarImportacao(empresaId, 'simular', false)}
            disabled={rodando}
          >
            Simular (não grava)
          </Button>
          <Button
            variant="outline"
            onClick={() => rodarImportacao(empresaId, 'teste', false)}
            disabled={rodando}
          >
            {rodando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-2 h-4 w-4" />
            )}
            Testar com {POR_PAGINA} produtos
          </Button>
          <Button onClick={() => rodarImportacao(empresaId, 'tudo', false)} disabled={rodando}>
            Importar todos
          </Button>
          {podeContinuar && (
            <Button onClick={() => rodarImportacao(empresaId, 'tudo', true)}>
              <Play className="mr-2 h-4 w-4" />
              Continuar de onde parou
            </Button>
          )}
          {rodando && (
            <Button
              variant="destructive"
              onClick={() => {
                pararPedido[empresaId] = true
              }}
            >
              <Square className="mr-2 h-4 w-4" />
              Parar
            </Button>
          )}
          {linhas.length > 0 && (
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
                {modo === 'simular' ? ' (simulação, nada foi gravado)' : ''}
                {!rodando && proxima === null && estado.terminadoEm
                  ? ` · concluído em ${new Date(estado.terminadoEm).toLocaleString('pt-BR')}`
                  : ''}
                {podeContinuar ? ' · parou antes do fim' : ''}
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
                      <div className="font-medium">{l.nome || '—'}</div>
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
        {linhas.length > 200 && (
          <p className="text-xs text-muted-foreground">
            A tabela mostra as últimas 200 linhas; a planilha traz todas as {linhas.length}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default ImportarMidiaTray
