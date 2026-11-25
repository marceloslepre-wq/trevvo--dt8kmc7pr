import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, HeartPulse, Loader2, RefreshCw } from 'lucide-react'
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
  AnuncioComProblema,
  ExecucaoSaude,
  listarAnunciosComProblema,
  pedirVerificacaoSaude,
  ultimaExecucaoSaude,
} from '@/services/saudeAnuncios'

interface Props {
  empresaId: string
}

const SITUACOES = ['Todas', 'Política', 'Pausado sem motivo', 'Estoque divergente'] as const

function formatarDataHora(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function corSituacao(s: string): 'destructive' | 'default' | 'secondary' {
  if (s === 'Política') return 'destructive'
  if (s === 'Pausado sem motivo') return 'default'
  return 'secondary'
}

/**
 * Saúde dos anúncios do Mercado Livre: o Trevvo verifica todo dia às 6h (e quando o
 * usuário pede) e mostra só os anúncios com problema, dos mais vendidos para os menos.
 * Somente leitura: nada é alterado no Mercado Livre.
 */
export const SaudeAnuncios: React.FC<Props> = ({ empresaId }) => {
  const [linhas, setLinhas] = useState<AnuncioComProblema[]>([])
  const [execucao, setExecucao] = useState<ExecucaoSaude | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pedindo, setPedindo] = useState(false)
  // Vindo do aviso do Painel: ?saude=Política (ou outra situação) já filtra e rola até aqui
  const [searchParams] = useSearchParams()
  const saudeUrl = searchParams.get('saude') || ''
  const [filtro, setFiltro] = useState<(typeof SITUACOES)[number]>(
    (SITUACOES as readonly string[]).includes(saudeUrl)
      ? (saudeUrl as (typeof SITUACOES)[number])
      : 'Todas',
  )
  const cartaoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (saudeUrl && cartaoRef.current) cartaoRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [saudeUrl])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [l, e] = await Promise.all([
        listarAnunciosComProblema(empresaId),
        ultimaExecucaoSaude(empresaId),
      ])
      setLinhas(l)
      setExecucao(e)
    } catch {
      toast({ title: 'Erro ao carregar a saúde dos anúncios', variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }, [empresaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Enquanto houver verificação na fila ou rodando, atualiza a cada 30 segundos.
  const emAndamento = execucao?.status === 'Pendente' || execucao?.status === 'Executando'
  useEffect(() => {
    if (!emAndamento) return
    const t = window.setInterval(carregar, 30000)
    return () => window.clearInterval(t)
  }, [emAndamento, carregar])

  const verificarAgora = async () => {
    setPedindo(true)
    try {
      const r = await pedirVerificacaoSaude(empresaId)
      toast({ title: r.mensagem })
      await carregar()
    } catch (err) {
      const msg =
        (err as { response?: { mensagem?: string } })?.response?.mensagem ||
        'Não foi possível pedir a verificação.'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setPedindo(false)
    }
  }

  const contagem = useMemo(() => {
    const c: Record<string, number> = { Todas: linhas.length }
    for (const l of linhas) c[l.situacao] = (c[l.situacao] || 0) + 1
    return c
  }, [linhas])

  const visiveis = useMemo(
    () => (filtro === 'Todas' ? linhas : linhas.filter((l) => l.situacao === filtro)),
    [linhas, filtro],
  )

  return (
    <Card ref={cartaoRef} id="saude-anuncios">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5" />
          Saúde dos anúncios
        </CardTitle>
        <CardDescription>
          Todo dia às 6h o Trevvo confere os anúncios e lista os que estão fora do ar por regra do
          Mercado Livre, os pausados com estoque sem motivo e os sem estoque no ML que têm saldo no
          Trevvo. Os mais vendidos aparecem primeiro. Nada é alterado no Mercado Livre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Última verificação:{' '}
            {execucao ? (
              <>
                <span className="font-medium text-foreground">{execucao.status}</span>
                {execucao.status === 'Concluída' &&
                  ` em ${formatarDataHora(execucao.concluida_em)} (${execucao.total_lidos} anúncios conferidos)`}
                {execucao.status === 'Erro' && ` — ${execucao.mensagem}`}
                {emAndamento && ' — o resultado aparece em até 5 minutos'}
              </>
            ) : (
              'ainda não houve'
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={verificarAgora}
            disabled={pedindo || emAndamento}
          >
            {pedindo || emAndamento ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Verificar agora
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SITUACOES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filtro === s ? 'default' : 'outline'}
              onClick={() => setFiltro(s)}
            >
              {s} ({contagem[s] || 0})
            </Button>
          ))}
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anúncio com problema.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Motivo e o que fazer</TableHead>
                  <TableHead className="text-right">Vendidos</TableHead>
                  <TableHead className="text-right">Estoque ML</TableHead>
                  <TableHead className="text-right">Estoque Trevvo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="min-w-[220px]">
                      <div className="font-medium">{l.titulo}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.anuncio_id}
                        {l.sku ? ` · SKU ${l.sku}` : ''}
                        {l.produto_codigo ? ` · Trevvo ${l.produto_codigo}` : ''}
                      </div>
                      {l.link && (
                        <a
                          href={l.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary underline"
                        >
                          Abrir no ML <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={corSituacao(l.situacao)}>{l.situacao}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        desde {formatarDataHora(l.primeira_vez_em)}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[280px] text-sm">
                      <div>{l.motivo}</div>
                      <div className="mt-1 text-muted-foreground">{l.acao_sugerida}</div>
                    </TableCell>
                    <TableCell className="text-right">{l.vendidos || 0}</TableCell>
                    <TableCell className="text-right">{l.estoque_canal || 0}</TableCell>
                    <TableCell className="text-right">{l.estoque_trevvo || 0}</TableCell>
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

export default SaudeAnuncios
