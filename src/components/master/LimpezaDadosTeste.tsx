import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  baixarBackupLimpeza,
  executarLimpeza,
  obterPreviaLimpeza,
  type LimpezaPrevia,
  type LimpezaResultado,
} from '@/services/limpezaTestes'

type Etapa = 'inicio' | 'previa' | 'backup' | 'concluido'

export default function LimpezaDadosTeste() {
  const { toast } = useToast()
  const [previa, setPrevia] = useState<LimpezaPrevia | null>(null)
  const [etapa, setEtapa] = useState<Etapa>('inicio')
  const [carregando, setCarregando] = useState<'' | 'previa' | 'backup' | 'executar'>('')
  const [confirmacao, setConfirmacao] = useState('')
  const [resultado, setResultado] = useState<LimpezaResultado | null>(null)

  const totalApagar = useMemo(
    () =>
      (previa?.itens || [])
        .filter((i) => i.acao === 'apagar')
        .reduce((soma, i) => soma + (i.registros || 0), 0),
    [previa],
  )

  const grupos = useMemo(() => {
    const mapa: Record<
      string,
      { tabela: string; registros: number; acao: string; detalhe?: string }[]
    > = {}
    for (const item of previa?.itens || []) {
      if (!mapa[item.grupo]) mapa[item.grupo] = []
      mapa[item.grupo].push(item)
    }
    return Object.entries(mapa)
  }, [previa])

  const podeExecutar =
    etapa === 'backup' && confirmacao.trim().toUpperCase() === 'LIMPAR' && carregando === ''

  const carregarPrevia = useCallback(async () => {
    setCarregando('previa')
    try {
      const res = await obterPreviaLimpeza()
      setPrevia(res)
      setEtapa('previa')
      setResultado(null)
    } catch (e) {
      toast({ title: 'Erro na prévia', description: getErrorMessage(e), variant: 'destructive' })
    } finally {
      setCarregando('')
    }
  }, [toast])

  const baixarBackup = useCallback(async () => {
    setCarregando('backup')
    try {
      const dados = await baixarBackupLimpeza()
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const data = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      a.href = url
      a.download = `backup-dados-teste-${data}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setEtapa('backup')
      toast({
        title: 'Backup baixado',
        description: 'Guarde o arquivo antes de executar a limpeza.',
      })
    } catch (e) {
      toast({ title: 'Erro no backup', description: getErrorMessage(e), variant: 'destructive' })
    } finally {
      setCarregando('')
    }
  }, [toast])

  const executar = useCallback(async () => {
    if (!podeExecutar) return
    setCarregando('executar')
    try {
      const res = await executarLimpeza(confirmacao.trim())
      setResultado(res)
      setEtapa('concluido')
      setConfirmacao('')
      toast({ title: 'Limpeza concluída', description: res.message })
    } catch (e) {
      toast({ title: 'Erro na limpeza', description: getErrorMessage(e), variant: 'destructive' })
    } finally {
      setCarregando('')
    }
  }, [podeExecutar, confirmacao, toast])

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 size={18} className="text-red-600" />
          Limpeza dos dados de teste
        </CardTitle>
        <CardDescription>
          Apaga vendas, notas, estoque, financeiro, caixas, documentos fiscais de homologação, SPED,
          produtos, fornecedores, clientes (menos o Consumidor Final), o perfil "Teste Normal 00" e
          os usuários de teste do seu assinante. Mantém empresas, configurações fiscais e da Focus,
          tabelas fiscais, perfis HH, classificação, formas e condições de pagamento, plano de
          contas, contas financeiras, terminais, perfis de acesso e integrações. Não tem desfazer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={carregarPrevia} disabled={carregando !== ''}>
            {carregando === 'previa' ? (
              <Loader2 size={15} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={15} className="mr-1.5" />
            )}
            <span>1. Ver prévia</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={baixarBackup}
            disabled={carregando !== '' || etapa === 'inicio' || etapa === 'concluido'}
          >
            {carregando === 'backup' ? (
              <Loader2 size={15} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={15} className="mr-1.5" />
            )}
            <span>2. Baixar backup</span>
          </Button>
        </div>

        {previa && (
          <div className="space-y-3 text-sm">
            <p>
              <span>Assinante: </span>
              <strong>{previa.assinante.nome}</strong>
              <span> · Empresas: {previa.empresas.map((e) => e.nome).join(', ')}</span>
              <span className="text-muted-foreground">
                {' '}
                · Versão do servidor: {previa.versao_hook || 'antiga'}
              </span>
            </p>
            <p>
              <span>Cliente que fica: </span>
              <strong>
                {previa.cliente_mantido
                  ? previa.cliente_mantido.nome
                  : 'nenhum "Consumidor Final" encontrado'}
              </strong>
            </p>
            <p>
              <span>Usuários que serão apagados: </span>
              <strong>
                {previa.usuarios_removidos.length > 0
                  ? previa.usuarios_removidos.map((u) => `${u.nome} (${u.email})`).join(', ')
                  : 'nenhum'}
              </strong>
            </p>
            {previa.erros.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700">
                <p className="font-semibold">
                  Tabelas com erro na prévia (não execute antes de resolver):
                </p>
                {previa.erros.map((e) => (
                  <p key={e.tabela}>
                    <span>
                      {e.tabela}: {e.erro}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map(([grupo, itens]) => (
                <div key={grupo} className="rounded-md border border-slate-200 p-3">
                  <p className="mb-1 font-semibold">{grupo}</p>
                  {itens.map((i) => (
                    <div key={i.tabela} className="flex justify-between gap-2 text-xs">
                      <span className="truncate">{i.tabela}</span>
                      <span className={i.acao === 'apagar' ? 'text-red-700' : 'text-blue-700'}>
                        {i.acao === 'apagar' ? `apagar ${i.registros}` : `ajustar ${i.registros}`}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="font-semibold">
              <span>Total de registros a apagar: {totalApagar}</span>
            </p>
          </div>
        )}

        {etapa === 'backup' && (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <AlertTriangle size={16} />
              <span>3. Para apagar, digite LIMPAR e clique em Executar limpeza.</span>
            </p>
            <Label htmlFor="confirmacao-limpeza" className="sr-only">
              Confirmação
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="confirmacao-limpeza"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder="LIMPAR"
                className="w-40"
                autoComplete="off"
              />
              <Button variant="destructive" size="sm" onClick={executar} disabled={!podeExecutar}>
                {carregando === 'executar' ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin" />
                ) : (
                  <Trash2 size={15} className="mr-1.5" />
                )}
                <span>Executar limpeza</span>
              </Button>
            </div>
          </div>
        )}

        {resultado && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-semibold">{resultado.message}</p>
            <p>
              <span>
                {resultado.resultado
                  .filter((r) => (r.apagados || 0) > 0)
                  .map((r) => `${r.tabela}: ${r.apagados}`)
                  .join(' · ')}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
