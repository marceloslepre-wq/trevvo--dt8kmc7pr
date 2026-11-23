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
  StatusShopee,
  desconectarShopee,
  iniciarConexaoShopee,
  mensagemErroShopee,
  obterStatusShopee,
  testarConexaoShopee,
} from '@/services/shopee'

function formatarDataHora(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const ShopeePage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<StatusShopee | null>(null)
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
      setStatus(await obterStatusShopee(empresaId))
    } catch (err) {
      setStatus(null)
      setErroCarga(mensagemErroShopee(err, 'Não foi possível consultar a conexão.'))
    } finally {
      setCarregando(false)
    }
  }, [empresaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Retorno da Shopee: ?resultado=ok ou ?resultado=erro&motivo=...
  useEffect(() => {
    const resultado = searchParams.get('resultado')
    if (!resultado) return
    if (resultado === 'ok') {
      toast({ title: 'Loja da Shopee conectada com sucesso.' })
    } else {
      toast({
        title: 'Não foi possível conectar à Shopee',
        description: searchParams.get('motivo') || 'Tente novamente.',
        variant: 'destructive',
      })
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const conectar = async () => {
    setAcao('conectar')
    try {
      const retorno = `${window.location.origin}/configuracoes/shopee`
      const res = await iniciarConexaoShopee(empresaId, retorno)
      window.location.href = res.url_autorizacao
    } catch (err) {
      toast({
        title: 'Erro ao iniciar a conexão',
        description: mensagemErroShopee(err, 'Tente novamente.'),
        variant: 'destructive',
      })
      setAcao('')
    }
  }

  const testar = async () => {
    setAcao('testar')
    try {
      const res = await testarConexaoShopee(empresaId)
      toast({
        title: 'Conexão funcionando',
        description: res.shop_nome ? `Loja: ${res.shop_nome}` : undefined,
      })
    } catch (err) {
      toast({
        title: 'Falha no teste de conexão',
        description: mensagemErroShopee(err, 'Tente novamente.'),
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
      await desconectarShopee(empresaId)
      toast({ title: 'Loja da Shopee desconectada.' })
    } catch (err) {
      toast({
        title: 'Erro ao desconectar',
        description: mensagemErroShopee(err, 'Tente novamente.'),
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
          Shopee
        </h1>
        <p className="text-sm text-muted-foreground">
          Conexão da loja da Shopee com a empresa ativa.
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
                Cadastre os Segredos SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no Skip Cloud com os dados da
                aplicação criada na Shopee Open Platform. Depois recarregue esta tela.
              </AlertDescription>
            </Alert>
          )}

          {situacao === 'Reconectar' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>É preciso conectar de novo</AlertTitle>
              <AlertDescription>
                A Shopee deixou de aceitar a autorização desta loja (a autorização vale 365 dias ou foi revogada).
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
                    <dt className="text-muted-foreground">Loja na Shopee</dt>
                    <dd className="font-medium">{status.shop_nome || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Código da loja (shop_id)</dt>
                    <dd className="font-medium">{status.shop_id || '—'}</dd>
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
                    {situacao === 'Reconectar' ? 'Conectar de novo' : 'Conectar à Shopee'}
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
                Shopee Open Platform (Redirect URL Domain aceita só o domínio).
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
            <AlertDialogTitle>Desconectar a loja da Shopee?</AlertDialogTitle>
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

export default ShopeePage
