import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  Store,
  Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  StatusMercadoLivre,
  desconectarMercadoLivre,
  iniciarConexaoMercadoLivre,
  mensagemErroMercadoLivre,
  obterStatusMercadoLivre,
  testarConexaoMercadoLivre,
} from '@/services/mercadoLivre'

function formatarDataHora(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const MercadoLivrePage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<StatusMercadoLivre | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
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
      setStatus(await obterStatusMercadoLivre(empresaId))
    } catch (err) {
      setStatus(null)
      setErroCarga(mensagemErroMercadoLivre(err, 'Não foi possível consultar a conexão.'))
    } finally {
      setCarregando(false)
    }
  }, [empresaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Retorno do Mercado Livre: ?resultado=ok ou ?resultado=erro&motivo=...
  useEffect(() => {
    const resultado = searchParams.get('resultado')
    if (!resultado) return
    if (resultado === 'ok') {
      toast({ title: 'Conta do Mercado Livre conectada com sucesso.' })
    } else {
      toast({
        title: 'Não foi possível conectar ao Mercado Livre',
        description: searchParams.get('motivo') || 'Tente novamente.',
        variant: 'destructive',
      })
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const conectar = async () => {
    setAcao('conectar')
    try {
      const retorno = `${window.location.origin}/configuracoes/mercado-livre`
      const res = await iniciarConexaoMercadoLivre(empresaId, retorno)
      window.location.href = res.url_autorizacao
    } catch (err) {
      toast({
        title: 'Erro ao iniciar a conexão',
        description: mensagemErroMercadoLivre(err, 'Tente novamente.'),
        variant: 'destructive',
      })
      setAcao('')
    }
  }

  const testar = async () => {
    setAcao('testar')
    try {
      const res = await testarConexaoMercadoLivre(empresaId)
      toast({
        title: 'Conexão funcionando',
        description: res.ml_nickname ? `Conta: ${res.ml_nickname}` : undefined,
      })
    } catch (err) {
      toast({
        title: 'Falha no teste de conexão',
        description: mensagemErroMercadoLivre(err, 'Tente novamente.'),
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
      await desconectarMercadoLivre(empresaId)
      toast({ title: 'Conta do Mercado Livre desconectada.' })
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: mensagemErroMercadoLivre(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setAcao('')
      carregar()
    }
  }

  const copiarCallback = async () => {
    if (!status?.url_callback) return
    try {
      await navigator.clipboard.writeText(status.url_callback)
      toast({ title: 'URL copiada.' })
    } catch (_) {
      toast({
        title: 'Não foi possível copiar. Selecione e copie manualmente.',
        variant: 'destructive',
      })
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
          Mercado Livre
        </h1>
        <p className="text-sm text-muted-foreground">
          Conexão da conta vendedora do Mercado Livre com a empresa ativa.
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
                Cadastre os Segredos ML_APP_ID e ML_CLIENT_SECRET no Skip Cloud com os dados da
                aplicação criada no Mercado Livre. Depois recarregue esta tela.
              </AlertDescription>
            </Alert>
          )}

          {situacao === 'Reconectar' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>É preciso conectar de novo</AlertTitle>
              <AlertDescription>
                O Mercado Livre deixou de aceitar a autorização desta conta.
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
                    <dt className="text-muted-foreground">Conta no Mercado Livre</dt>
                    <dd className="font-medium">{status.ml_nickname || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Código da conta</dt>
                    <dd className="font-medium">{status.ml_user_id || '—'}</dd>
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
                    <dt className="text-muted-foreground">Acesso atual válido até</dt>
                    <dd className="font-medium">{formatarDataHora(status.token_expira_em)}</dd>
                  </div>
                </dl>
              )}

              {!podeGerenciar && (
                <p className="text-sm text-muted-foreground">
                  Apenas administradores podem conectar ou desconectar a conta.
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
                    {situacao === 'Reconectar' ? 'Conectar de novo' : 'Conectar ao Mercado Livre'}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">URL de retorno (callback)</CardTitle>
              <CardDescription>
                Cadastre exatamente este endereço no campo de redirecionamento da aplicação no
                Mercado Livre.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-muted px-2 py-1 text-sm">
                  {status.url_callback}
                </code>
                <Button variant="outline" size="sm" onClick={copiarCallback}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={confirmarDesconexao} onOpenChange={setConfirmarDesconexao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta do Mercado Livre?</AlertDialogTitle>
            <AlertDialogDescription>
              O Trevvo deixa de receber pedidos e de atualizar anúncios desta empresa até que a
              conta seja conectada de novo.
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

export default MercadoLivrePage
