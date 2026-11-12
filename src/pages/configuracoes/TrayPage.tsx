import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Store, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  StatusTray,
  desconectarTray,
  iniciarConexaoTray,
  mensagemErroTray,
  obterStatusTray,
  testarConexaoTray,
} from '@/services/tray'

function formatarDataHora(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const TrayPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<StatusTray | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [lojaUrl, setLojaUrl] = useState('')
  const [acao, setAcao] = useState<'' | 'conectar' | 'testar' | 'desconectar'>('')
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false)

  const empresaId = empresaAtiva?.id || ''
  const nomeEmpresa = empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || ''

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setStatus(null)
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErroCarga('')
    try {
      const s = await obterStatusTray(empresaId)
      setStatus(s)
      if (s.loja_host) setLojaUrl(s.loja_host)
    } catch (err) {
      setStatus(null)
      setErroCarga(mensagemErroTray(err, 'Não foi possível consultar a conexão.'))
    } finally {
      setCarregando(false)
    }
  }, [empresaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    const resultado = searchParams.get('resultado')
    if (!resultado) return
    if (resultado === 'ok') {
      toast({ title: 'Loja Tray conectada com sucesso.' })
    } else {
      toast({
        title: 'Não foi possível conectar à Tray',
        description: searchParams.get('motivo') || 'Tente novamente.',
        variant: 'destructive',
      })
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const conectar = async () => {
    if (!lojaUrl.trim()) {
      toast({ title: 'Informe o endereço da loja Tray.', variant: 'destructive' })
      return
    }
    setAcao('conectar')
    try {
      const retorno = `${window.location.origin}/configuracoes/tray`
      const res = await iniciarConexaoTray(empresaId, lojaUrl.trim(), retorno)
      window.location.href = res.url_autorizacao
    } catch (err) {
      toast({
        title: 'Erro ao iniciar a conexão',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
      setAcao('')
    }
  }

  const testar = async () => {
    setAcao('testar')
    try {
      const res = await testarConexaoTray(empresaId)
      toast({
        title: 'Conexão funcionando',
        description: res.loja_nome ? `Loja: ${res.loja_nome}` : res.loja_host,
      })
    } catch (err) {
      toast({
        title: 'Falha no teste de conexão',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setAcao('')
      carregar()
    }
  }

  const desconectar = async () => {
    setConfirmarDesconexao(false)
    setAcao('desconectar')
    try {
      await desconectarTray(empresaId)
      toast({ title: 'Loja Tray desconectada.' })
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setAcao('')
      carregar()
    }
  }

  const situacao = status?.status || 'Desconectada'
  const podeGerenciar = !!status?.pode_gerenciar
  const ocupado = acao !== ''

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Store className="h-6 w-6" />
          Tray
        </h1>
        <p className="text-sm text-muted-foreground">
          Conexão da loja virtual Tray com a empresa ativa.
        </p>
      </div>

      {!empresaId && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nenhuma empresa ativa</AlertTitle>
          <AlertDescription>Selecione uma empresa no topo da tela.</AlertDescription>
        </Alert>
      )}

      {empresaId && carregando && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando a conexão...
        </div>
      )}

      {empresaId && !carregando && erroCarga && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível consultar a conexão</AlertTitle>
          <AlertDescription>{erroCarga}</AlertDescription>
        </Alert>
      )}

      {empresaId && !carregando && status && (
        <>
          {!status.segredos_configurados && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Integração ainda não configurada</AlertTitle>
              <AlertDescription>
                Cadastre os Segredos TRAY_CONSUMER_KEY e TRAY_CONSUMER_SECRET no Skip Cloud com as
                chaves enviadas pela Tray. Depois recarregue esta tela.
              </AlertDescription>
            </Alert>
          )}

          {situacao === 'Reconectar' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>É preciso conectar de novo</AlertTitle>
              <AlertDescription>
                A Tray deixou de aceitar a autorização desta loja.
                {status.ultimo_erro ? ` Motivo: ${status.ultimo_erro}` : ''}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {nomeEmpresa}
                {situacao === 'Conectada' && (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Conectada
                  </Badge>
                )}
                {situacao === 'Reconectar' && <Badge variant="destructive">Reconectar</Badge>}
                {situacao === 'Desconectada' && <Badge variant="secondary">Desconectada</Badge>}
              </CardTitle>
              <CardDescription>
                A conexão vale apenas para esta empresa. As demais empresas não são afetadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {situacao !== 'Desconectada' && (
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Loja</dt>
                    <dd className="font-medium">
                      {status.loja_nome ? `${status.loja_nome} · ` : ''}
                      {status.loja_host || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Código da loja na Tray</dt>
                    <dd className="font-medium">{status.store_id || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Conectada em</dt>
                    <dd className="font-medium">{formatarDataHora(status.conectada_em)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Última renovação do acesso</dt>
                    <dd className="font-medium">{formatarDataHora(status.ultima_renovacao_em)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Autorização válida até</dt>
                    <dd className="font-medium">{formatarDataHora(status.refresh_expira_em)}</dd>
                  </div>
                </dl>
              )}

              {podeGerenciar && situacao !== 'Conectada' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="tray-loja-url">
                    Endereço da loja Tray
                  </label>
                  <Input
                    id="tray-loja-url"
                    placeholder="minhaloja.com.br"
                    value={lojaUrl}
                    onChange={(e) => setLojaUrl(e.target.value)}
                    disabled={ocupado}
                  />
                  <p className="text-xs text-muted-foreground">
                    Você será levado à Tray para autorizar o acesso e depois voltará para esta tela.
                  </p>
                </div>
              )}

              {!podeGerenciar && (
                <p className="text-sm text-muted-foreground">
                  Apenas administradores podem conectar ou desconectar a loja.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {podeGerenciar && situacao !== 'Conectada' && (
                  <Button onClick={conectar} disabled={ocupado || !status.segredos_configurados}>
                    {acao === 'conectar' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    {situacao === 'Reconectar' ? 'Conectar de novo' : 'Conectar à Tray'}
                  </Button>
                )}
                {situacao !== 'Desconectada' && (
                  <Button variant="outline" onClick={testar} disabled={ocupado}>
                    {acao === 'testar' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Testar conexão
                  </Button>
                )}
                {podeGerenciar && situacao !== 'Desconectada' && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmarDesconexao(true)}
                    disabled={ocupado}
                  >
                    {acao === 'desconectar' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="mr-2 h-4 w-4" />
                    )}
                    Desconectar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={confirmarDesconexao} onOpenChange={setConfirmarDesconexao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a loja Tray?</AlertDialogTitle>
            <AlertDialogDescription>
              O sistema deixa de acessar esta loja até que ela seja conectada de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={desconectar}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default TrayPage
