import React, { useState } from 'react'
import { ClipboardCheck, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import {
  EvidenciaTray,
  ResultadoHomologacaoTray,
  executarHomologacaoTray,
  mensagemErroTray,
  obterEvidenciasTray,
} from '@/services/tray'

interface Props {
  empresaId: string
}

function montarTexto(
  evidencias: EvidenciaTray[],
  resultado: ResultadoHomologacaoTray | null,
): string {
  const linhas: string[] = []
  linhas.push('EVIDÊNCIAS DE HOMOLOGAÇÃO — Trevvo ERP')
  linhas.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`)
  if (resultado?.loja_host) linhas.push(`Loja: ${resultado.loja_host}`)
  if (resultado?.ip_publico_saida) linhas.push(`IP público de saída: ${resultado.ip_publico_saida}`)
  if (resultado?.url_callback) linhas.push(`URL de callback: ${resultado.url_callback}`)
  linhas.push('')
  linhas.push('ROTAS E MÉTODOS UTILIZADOS')
  const vistas = new Set<string>()
  evidencias.forEach((e) => {
    const k = `${e.metodo} ${e.rota}`
    if (!vistas.has(k)) {
      vistas.add(k)
      linhas.push(`- ${k} — ${e.etapa}`)
    }
  })
  evidencias.forEach((e) => {
    linhas.push('')
    linhas.push('='.repeat(80))
    linhas.push(`Rota: ${e.metodo} ${e.rota}  (${e.etapa})`)
    linhas.push(`URL: ${e.url_exemplo}`)
    linhas.push(`HTTP ${e.status_http} — ${e.duracao_ms} ms — ${e.criado_em}`)
    if (e.observacao) linhas.push(`Obs.: ${e.observacao}`)
    linhas.push('')
    linhas.push('Payload enviado (Request):')
    linhas.push(e.request_json || '(sem corpo — parâmetros na URL)')
    linhas.push('')
    linhas.push('Response da requisição:')
    linhas.push(e.response_json || '(vazio)')
  })
  return linhas.join('\n')
}

/**
 * Roteiro de homologação do aplicativo na Tray: executa as chamadas usadas pelo Trevvo na loja
 * conectada e baixa o par requisição/resposta de cada uma em texto (sem tokens).
 */
export const HomologacaoTray: React.FC<Props> = ({ empresaId }) => {
  const [produtoId, setProdutoId] = useState('')
  const [variacaoId, setVariacaoId] = useState('')
  const [gravarEstoque, setGravarEstoque] = useState(false)
  const [executando, setExecutando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoHomologacaoTray | null>(null)

  const executar = async () => {
    setExecutando(true)
    try {
      const r = await executarHomologacaoTray(empresaId, {
        produtoId: produtoId.trim(),
        variacaoId: variacaoId.trim(),
        gravarEstoque,
      })
      setResultado(r)
      toast({
        title: 'Roteiro executado',
        description: `${r.passos.length} passos registrados.`,
      })
    } catch (err) {
      toast({
        title: 'Falha no roteiro',
        description: mensagemErroTray(err, 'Não foi possível executar o roteiro.'),
        variant: 'destructive',
      })
    } finally {
      setExecutando(false)
    }
  }

  const baixar = async () => {
    setBaixando(true)
    try {
      const r = await obterEvidenciasTray(empresaId)
      if (!r.evidencias.length) {
        toast({
          title: 'Nenhuma evidência',
          description: 'Execute o roteiro primeiro.',
        })
        return
      }
      const texto = montarTexto(r.evidencias, resultado)
      const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evidencias-tray-${r.execucao_id || 'conexao'}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast({
        title: 'Falha ao baixar',
        description: mensagemErroTray(err, 'Não foi possível ler as evidências.'),
        variant: 'destructive',
      })
    } finally {
      setBaixando(false)
    }
  }

  return (
    <Card className="notranslate" translate="no">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Homologação do aplicativo
        </CardTitle>
        <CardDescription>
          Executa na loja conectada as chamadas que o Trevvo usa (token, produtos, variações, Multi
          CD e pedidos) e guarda o par requisição/resposta de cada uma, sem tokens. Use só com a
          loja de testes da Tray.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Código do produto sem variação (opcional)</label>
            <Input
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value.replace(/\D/g, ''))}
              placeholder="Em branco: usa o primeiro da loja"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Código da variação (opcional)</label>
            <Input
              value={variacaoId}
              onChange={(e) => setVariacaoId(e.target.value.replace(/\D/g, ''))}
              placeholder="Em branco: usa a primeira encontrada"
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={gravarEstoque}
            onCheckedChange={(v) => setGravarEstoque(v === true)}
            className="mt-0.5"
          />
          <span>
            Incluir a atualização de estoque no Multi CD (PUT). O sistema lê o saldo atual do item
            no centro de distribuição e envia o mesmo número, sem mudar o estoque.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={executar} disabled={executando || !empresaId}>
            {executando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="mr-2 h-4 w-4" />
            )}
            Executar roteiro
          </Button>
          <Button variant="outline" onClick={baixar} disabled={baixando || !empresaId}>
            {baixando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar evidências (.txt)
          </Button>
        </div>

        {resultado && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={resultado.multicd_ativo ? 'default' : 'destructive'}>
                Multi CD {resultado.multicd_ativo ? 'ativo' : 'não respondeu'}
              </Badge>
              <Badge variant="outline">CDs: {resultado.centros_distribuicao ?? 0}</Badge>
              {resultado.ip_publico_saida && (
                <Badge variant="outline">IP de saída: {resultado.ip_publico_saida}</Badge>
              )}
            </div>
            <ul className="space-y-1">
              {resultado.passos.map((p, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2">
                  <Badge
                    variant={
                      p.status_http >= 200 && p.status_http < 300
                        ? 'default'
                        : p.status_http === 0
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {p.status_http || '—'}
                  </Badge>
                  <span className="font-mono text-xs">
                    {p.metodo} {p.rota}
                  </span>
                  <span className="text-muted-foreground">{p.etapa}</span>
                  {p.observacao && <span className="text-xs text-amber-700">{p.observacao}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default HomologacaoTray
