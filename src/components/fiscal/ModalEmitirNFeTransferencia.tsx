import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  DollarSign,
  Package,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  obterOuCriarConfigEmissaoFiscal,
  ConfigEmissaoFiscal,
} from '@/services/configEmissaoFiscal'
import {
  emitirNFeTransferencia,
  consultarSituacaoNFe,
  montarRascunhoDocumentoFiscal,
  RascunhoFiscalResponse,
} from '@/services/fiscalIntegracao'
import { TransferenciaCompleta } from '@/services/transferencias'
import { Empresa } from '@/services/empresas'

interface ModalEmitirNFeTransferenciaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transferencia: TransferenciaCompleta
  empresaOrigem?: Empresa | null
  empresaDestino?: Empresa | null
  onSucesso?: () => void
  iniciarEmitindoDireto?: boolean
}

export const ModalEmitirNFeTransferencia: React.FC<ModalEmitirNFeTransferenciaProps> = ({
  open,
  onOpenChange,
  transferencia,
  empresaOrigem,
  empresaDestino,
  onSucesso,
  iniciarEmitindoDireto = false,
}) => {
  const { toast } = useToast()

  const [carregandoDados, setCarregandoDados] = useState(false)
  const [calculandoRascunho, setCalculandoRascunho] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [progressoEnvio, setProgressoEnvio] = useState<string | null>(null)
  const [segundosRestantes, setSegundosRestantes] = useState(30)
  const [timeoutProcessando, setTimeoutProcessando] = useState(false)
  const [ultimoDocId, setUltimoDocId] = useState<string | null>(null)
  const [ultimoNumero, setUltimoNumero] = useState<string | null>(null)
  const [ultimaChave, setUltimaChave] = useState<string | null>(null)

  // Configuração Fiscal da empresa de ORIGEM (quem emite a nota)
  const [configFiscal, setConfigFiscal] = useState<ConfigEmissaoFiscal | null>(null)

  // Parâmetros editáveis na conferência
  const [naturezaOperacao, setNaturezaOperacao] = useState('Transferência de mercadoria')
  const [modalidadeFrete, setModalidadeFrete] = useState<number>(0)
  const [transportadoraId, setTransportadoraId] = useState<string>('')
  const [volumesQuantidade, setVolumesQuantidade] = useState<string>('')
  const [volumesEspecie, setVolumesEspecie] = useState<string>('VOLUMES')
  const [pesoBruto, setPesoBruto] = useState<string>('')
  const [pesoLiquido, setPesoLiquido] = useState<string>('')
  const [informacoesComplementares, setInformacoesComplementares] = useState<string>('')

  // Rascunho fiscal pré-calculado
  const [rascunho, setRascunho] = useState<RascunhoFiscalResponse | null>(null)
  const [erroCalculo, setErroCalculo] = useState<string | null>(null)

  // Transportadoras
  const [transportadoras, setTransportadoras] = useState<
    Array<{ id: string; razao_social?: string; nome_fantasia?: string; cpf_cnpj?: string }>
  >([])

  // Carregar dados de emissão da empresa de ORIGEM
  useEffect(() => {
    if (!open || !transferencia?.empresa_origem_id) return

    let ativo = true
    const carregar = async () => {
      setCarregandoDados(true)
      setErroCalculo(null)
      setTimeoutProcessando(false)
      setUltimoDocId(null)
      setUltimoNumero(null)
      setUltimaChave(null)

      try {
        // Configuração fiscal da ORIGEM
        const cfg = await obterOuCriarConfigEmissaoFiscal(transferencia.empresa_origem_id)
        if (!ativo) return
        setConfigFiscal(cfg)

        const nat =
          cfg.natureza_operacao_transferencia ||
          cfg.natureza_operacao_venda ||
          'Transferência de mercadoria'
        setNaturezaOperacao(nat)

        const info = cfg.informacoes_complementares_padrao || ''
        setInformacoesComplementares(info)

        // Carregar fornecedores do tipo transportadora
        try {
          const res = await pb.collection('fornecedores').getList(1, 100, {
            filter: `tipo_fornecedor ~ 'Transportadora' || transportadora = true`,
            sort: 'razao_social',
          })
          if (ativo) {
            setTransportadoras(
              res.items.map((i) => ({
                id: i.id,
                razao_social: i.razao_social,
                nome_fantasia: i.nome_fantasia,
                cpf_cnpj: i.cpf_cnpj,
              })),
            )
          }
        } catch {
          /* intentionally ignored */
        }

        // Pré-visualização de impostos
        await recalcularRascunho({
          natureza: nat,
          modalidade: 0,
          transpId: '',
          info,
        })
      } catch (err: any) {
        if (ativo) {
          setErroCalculo(err?.message || 'Erro ao carregar dados fiscais da empresa de origem.')
        }
      } finally {
        if (ativo) setCarregandoDados(false)
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [open, transferencia?.id, transferencia?.empresa_origem_id])

  // Recalcular rascunho com o backend
  const recalcularRascunho = async (paramsSobrescritos?: {
    natureza?: string
    modalidade?: number
    transpId?: string
    info?: string
  }) => {
    if (!transferencia?.id) return

    try {
      setCalculandoRascunho(true)
      setErroCalculo(null)

      const nat =
        paramsSobrescritos?.natureza !== undefined ? paramsSobrescritos.natureza : naturezaOperacao
      const modFrete =
        paramsSobrescritos?.modalidade !== undefined
          ? paramsSobrescritos.modalidade
          : modalidadeFrete
      const idTransp =
        paramsSobrescritos?.transpId !== undefined ? paramsSobrescritos.transpId : transportadoraId
      const info =
        paramsSobrescritos?.info !== undefined ? paramsSobrescritos.info : informacoesComplementares

      const json = await montarRascunhoDocumentoFiscal({
        origem: 'Transferência',
        origem_id: transferencia.id,
        modelo: '55',
        parametros: {
          natureza_operacao: nat,
          presenca_comprador: '9', // Outros (SEFAZ padrão para transferência)
          modalidade_frete: modFrete,
          transportadora_id: idTransp || undefined,
          volumes_quantidade: volumesQuantidade ? Number(volumesQuantidade) : undefined,
          volumes_especie: volumesEspecie || undefined,
          peso_bruto: pesoBruto ? Number(pesoBruto) : undefined,
          peso_liquido: pesoLiquido ? Number(pesoLiquido) : undefined,
          informacoes_complementares: info,
        },
      })

      if (json && json.sucesso) {
        setRascunho(json)
      } else {
        setErroCalculo(json?.message || 'Erro ao calcular impostos da transferência.')
      }
    } catch (err: any) {
      setErroCalculo(err?.message || 'Erro ao calcular tributação da transferência.')
    } finally {
      setCalculandoRascunho(false)
    }
  }

  // Polling de acompanhamento de autorização na SEFAZ por até 30s a cada 3s
  const iniciarPollingAutorizacao = useCallback(
    (docId?: string) => {
      setEmitindo(true)
      setProgressoEnvio('NF-e transmitida. Consultando autorização na SEFAZ...')
      setSegundosRestantes(30)
      setTimeoutProcessando(false)

      let tentativas = 0
      const maxTentativas = 10 // 10 * 3s = 30s
      let finalizado = false

      const interval = setInterval(async () => {
        tentativas++
        setSegundosRestantes(Math.max(0, 30 - tentativas * 3))

        try {
          const sit = await consultarSituacaoNFe({
            documento_id: docId || ultimoDocId || undefined,
            transferencia_id: transferencia.id,
          })

          if (sit.status === 'Autorizada') {
            clearInterval(interval)
            finalizado = true
            setEmitindo(false)
            setProgressoEnvio(null)
            setUltimoNumero(sit.numero || null)
            setUltimaChave(sit.chave || null)
            toast({
              title: 'NF-e de Transferência Autorizada!',
              description: `Nota nº ${sit.numero || ''} autorizada pela SEFAZ. Protocolo: ${sit.protocolo || ''}`,
            })
            if (onSucesso) onSucesso()
            return
          }

          if (sit.status === 'Rejeitada') {
            clearInterval(interval)
            finalizado = true
            setEmitindo(false)
            setProgressoEnvio(null)
            toast({
              title: 'NF-e Rejeitada pela SEFAZ',
              description: sit.message || 'Verifique os dados fiscais da nota de transferência.',
              variant: 'destructive',
            })
            if (onSucesso) onSucesso()
            return
          }

          if (sit.status === 'Denegada') {
            clearInterval(interval)
            finalizado = true
            setEmitindo(false)
            setProgressoEnvio(null)
            toast({
              title: 'NF-e DENEGADA pela SEFAZ',
              description: sit.aviso || sit.message || 'Nota denegada não pode ser reutilizada.',
              variant: 'destructive',
            })
            if (onSucesso) onSucesso()
            return
          }
        } catch (_) {
          // Segue tentando até esgotar o prazo
        }

        if (tentativas >= maxTentativas && !finalizado) {
          clearInterval(interval)
          setEmitindo(false)
          setProgressoEnvio(null)
          setTimeoutProcessando(true)
          toast({
            title: 'NF-e em Processamento',
            description:
              'A SEFAZ ainda está processando o lote da nota. Clique em "Consultar situação" para verificar novamente.',
          })
          if (onSucesso) onSucesso()
        }
      }, 3000)
    },
    [transferencia.id, ultimoDocId, onSucesso, toast],
  )

  // Disparar emissão
  const handleTransmitirNFe = async () => {
    if (!transferencia?.id) return

    try {
      setEmitindo(true)
      setProgressoEnvio('Transmitindo NF-e para a SEFAZ...')
      setTimeoutProcessando(false)

      const respEnvio = await emitirNFeTransferencia({
        transferencia_id: transferencia.id,
        natureza_operacao: naturezaOperacao,
        modalidade_frete: modalidadeFrete,
        transportadora_id: transportadoraId || undefined,
        volumes_quantidade: volumesQuantidade ? Number(volumesQuantidade) : undefined,
        volumes_especie: volumesEspecie || undefined,
        peso_bruto: pesoBruto ? Number(pesoBruto) : undefined,
        peso_liquido: pesoLiquido ? Number(pesoLiquido) : undefined,
        informacoes_complementares: informacoesComplementares,
      })

      if (!respEnvio.sucesso && respEnvio.status === 'Rejeitada') {
        toast({
          title: 'NF-e Rejeitada pela SEFAZ',
          description: respEnvio.message || 'Verifique os dados cadastrais e fiscais da nota.',
          variant: 'destructive',
        })
        setProgressoEnvio(null)
        setEmitindo(false)
        if (onSucesso) onSucesso()
        return
      }

      const docId = respEnvio.documento_id
      if (docId) setUltimoDocId(docId)

      iniciarPollingAutorizacao(docId)
    } catch (err: any) {
      toast({
        title: 'Erro na transmissão da NF-e',
        description: err?.data?.message || err?.message || 'Falha ao comunicar com o servidor.',
        variant: 'destructive',
      })
      setEmitindo(false)
      setProgressoEnvio(null)
    }
  }

  // Disparo automático quando abrir com iniciarEmitindoDireto
  useEffect(() => {
    if (open && iniciarEmitindoDireto && !emitindo && !ultimoNumero && !timeoutProcessando) {
      handleTransmitirNFe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, iniciarEmitindoDireto])

  // Botão manual de consultar situação após 30s
  const handleConsultarSituacaoManual = async () => {
    setEmitindo(true)
    try {
      const sit = await consultarSituacaoNFe({
        documento_id: ultimoDocId || undefined,
        transferencia_id: transferencia.id,
      })

      if (sit.status === 'Autorizada') {
        setTimeoutProcessando(false)
        setUltimoNumero(sit.numero || null)
        setUltimaChave(sit.chave || null)
        toast({
          title: 'NF-e Autorizada com sucesso!',
          description: `Nota nº ${sit.numero || ''} autorizada pela SEFAZ.`,
        })
        if (onSucesso) onSucesso()
      } else if (sit.status === 'Rejeitada') {
        setTimeoutProcessando(false)
        toast({
          title: 'NF-e Rejeitada',
          description: sit.message || 'A SEFAZ rejeitou o lote.',
          variant: 'destructive',
        })
        if (onSucesso) onSucesso()
      } else {
        toast({
          title: 'Situação da NF-e',
          description: `Status atual na SEFAZ: ${sit.status}. Motivo: ${sit.motivo_status || 'Ainda em processamento'}`,
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao consultar',
        description: err?.message || 'Não foi possível consultar a situação da NF-e.',
        variant: 'destructive',
      })
    } finally {
      setEmitindo(false)
    }
  }

  const doc = rascunho?.documento
  const itensTrf = transferencia?.itens || []
  const razaoOrigem =
    empresaOrigem?.razao_social ||
    transferencia.expand?.empresa_origem_id?.razao_social ||
    'Empresa de Origem'
  const cnpjOrigem =
    empresaOrigem?.cnpj || transferencia.expand?.empresa_origem_id?.cnpj || 'Não informado'
  const ufOrigem = empresaOrigem?.uf || transferencia.expand?.empresa_origem_id?.uf || 'SP'

  const razaoDestino =
    empresaDestino?.razao_social ||
    transferencia.expand?.empresa_destino_id?.razao_social ||
    'Empresa de Destino'
  const cnpjDestino =
    empresaDestino?.cnpj || transferencia.expand?.empresa_destino_id?.cnpj || 'Não informado'
  const ieDestino =
    empresaDestino?.inscricao_estadual ||
    transferencia.expand?.empresa_destino_id?.inscricao_estadual ||
    'ISENTO'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Conferência e Emissão de NF-e de Transferência (Modelo 55)
            {transferencia?.numero ? ` - TR-${String(transferencia.numero).padStart(4, '0')}` : ''}
          </DialogTitle>
          <DialogDescription>
            Confira as empresas remetente e destinatária, valores de custo, transporte e tributos
            antes de transmitir a NF-e à SEFAZ.
          </DialogDescription>
        </DialogHeader>

        {progressoEnvio && (
          <Alert className="border-primary/50 bg-primary/10 animate-pulse">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <AlertTitle className="font-semibold">Acompanhando transmissão com a SEFAZ</AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between mt-1">
              <span>{progressoEnvio}</span>
              <Badge variant="outline" className="gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {segundosRestantes}s
              </Badge>
            </AlertDescription>
          </Alert>
        )}

        {timeoutProcessando && (
          <Alert className="border-amber-500/50 bg-amber-50 text-amber-900">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertTitle className="font-semibold">Processamento em andamento na SEFAZ</AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between mt-1">
              <span>
                O lote foi enviado e a SEFAZ ainda está processando. Você pode consultar o retorno a
                qualquer momento.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleConsultarSituacaoManual}
                disabled={emitindo}
                className="gap-1 bg-white text-xs h-7 ml-3"
              >
                <RefreshCw className={`h-3 w-3 ${emitindo ? 'animate-spin' : ''}`} />
                Consultar situação
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {ultimoNumero && (
          <Alert className="border-emerald-500/50 bg-emerald-50 text-emerald-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="font-semibold">NF-e Autorizada com sucesso!</AlertTitle>
            <AlertDescription className="text-xs mt-1 space-y-1">
              <div>
                <strong>Número:</strong> {ultimoNumero} | <strong>Série:</strong>{' '}
                {configFiscal?.serie_nfe || '1'}
              </div>
              {ultimaChave && (
                <div className="font-mono break-all text-[11px]">
                  <strong>Chave:</strong> {ultimaChave}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {erroCalculo && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção nos dados fiscais</AlertTitle>
            <AlertDescription className="text-xs">{erroCalculo}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="dados" className="text-xs sm:text-sm">
              Empresas & Operação
            </TabsTrigger>
            <TabsTrigger value="itens" className="text-xs sm:text-sm">
              Itens da Transferência ({itensTrf.length})
            </TabsTrigger>
            <TabsTrigger value="transporte" className="text-xs sm:text-sm">
              Transporte & Impostos
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: EMPRESAS & OPERAÇÃO */}
          <TabsContent value="dados" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="natureza-op-trf">Natureza da Operação *</Label>
                <Input
                  id="natureza-op-trf"
                  value={naturezaOperacao}
                  onChange={(e) => setNaturezaOperacao(e.target.value)}
                  onBlur={() => recalcularRascunho({ natureza: naturezaOperacao })}
                  placeholder="Ex.: Transferência de mercadoria"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Ambiente SEFAZ</Label>
                <div className="p-2 border rounded-md bg-muted/40 text-xs flex items-center justify-between">
                  <span className="font-medium text-slate-700">
                    {configFiscal?.ambiente || 'Homologação'}
                  </span>
                  <Badge variant="outline">Série {configFiscal?.serie_nfe || '1'}</Badge>
                </div>
              </div>
            </div>

            {/* Remetente (Origem) e Destinatário (Destino) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-muted/20 border-slate-200">
                <CardHeader className="py-2.5 px-4 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    Emitente / Remetente (Origem)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3 px-4 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Razão Social:</span>
                    <span className="font-semibold text-right truncate max-w-[200px]">
                      {razaoOrigem}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CNPJ:</span>
                    <span className="font-mono">{cnpjOrigem}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UF:</span>
                    <Badge variant="outline">{ufOrigem}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/20 border-slate-200">
                <CardHeader className="py-2.5 px-4 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                    Destinatário (Destino)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3 px-4 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Razão Social:</span>
                    <span className="font-semibold text-right truncate max-w-[200px]">
                      {razaoDestino}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CNPJ:</span>
                    <span className="font-mono">{cnpjDestino}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Inscrição Estadual:</span>
                    <span className="font-mono font-medium">{ieDestino}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="info-compl-trf">Informações Complementares da NF-e</Label>
              <Textarea
                id="info-compl-trf"
                rows={3}
                value={informacoesComplementares}
                onChange={(e) => setInformacoesComplementares(e.target.value)}
                placeholder="Observações complementares que constarão no DANFE..."
              />
            </div>
          </TabsContent>

          {/* ABA 2: ITENS DA TRANSFERÊNCIA */}
          <TabsContent value="itens" className="space-y-4 pt-3">
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">#</th>
                    <th className="py-2 px-3">Produto</th>
                    <th className="py-2 px-3 w-28 text-right">Qtd</th>
                    <th className="py-2 px-3 w-28 text-right">Custo Unit.</th>
                    <th className="py-2 px-3 w-28 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {itensTrf.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Nenhum item na transferência.
                      </td>
                    </tr>
                  ) : (
                    itensTrf.map((it, idx) => {
                      const prodDesc = it.expand?.produto_id?.descricao || 'Produto'
                      const prodCod = it.expand?.produto_id?.codigo || '-'
                      const custo = it.custo_unitario || 0
                      const qtd = it.quantidade || 0
                      const subtotal = custo * qtd

                      return (
                        <tr key={it.id || idx} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">{prodDesc}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              Cód: {prodCod}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium">
                            {qtd.toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(custo)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format(subtotal)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-muted/20 border rounded-lg text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Valor Total de Custo da Transferência:</span>
              <span className="font-bold text-base text-slate-900 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  itensTrf.reduce(
                    (acc, i) => acc + (i.quantidade || 0) * (i.custo_unitario || 0),
                    0,
                  ),
                )}
              </span>
            </div>
          </TabsContent>

          {/* ABA 3: TRANSPORTE & TOTAIS/IMPOSTOS */}
          <TabsContent value="transporte" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="modalidade-frete-trf">Modalidade do Frete *</Label>
                <Select
                  value={String(modalidadeFrete)}
                  onValueChange={(val) => {
                    const n = Number(val)
                    setModalidadeFrete(n)
                    recalcularRascunho({ modalidade: n })
                  }}
                >
                  <SelectTrigger id="modalidade-frete-trf">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Por conta do Remetente (CIF)</SelectItem>
                    <SelectItem value="1">1 - Por conta do Destinatário (FOB)</SelectItem>
                    <SelectItem value="2">2 - Por conta de Terceiros</SelectItem>
                    <SelectItem value="3">3 - Transporte Próprio por conta do Remetente</SelectItem>
                    <SelectItem value="4">
                      4 - Transporte Próprio por conta do Destinatário
                    </SelectItem>
                    <SelectItem value="9">9 - Sem Ocorrência de Transporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transportadora-trf">Transportadora</Label>
                <Select
                  value={transportadoraId || 'nenhuma'}
                  onValueChange={(val) => {
                    const finalId = val === 'nenhuma' ? '' : val
                    setTransportadoraId(finalId)
                    recalcularRascunho({ transpId: finalId })
                  }}
                >
                  <SelectTrigger id="transportadora-trf">
                    <SelectValue placeholder="Selecione uma transportadora..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Nenhuma / Próprio</SelectItem>
                    {transportadoras.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.razao_social || t.nome_fantasia} ({t.cpf_cnpj || 'S/N'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card className="bg-muted/20">
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Volumes Transportados
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 px-4">
                <div className="space-y-1">
                  <Label htmlFor="vol-qtd-trf" className="text-xs">
                    Quantidade
                  </Label>
                  <Input
                    id="vol-qtd-trf"
                    type="number"
                    placeholder="1"
                    value={volumesQuantidade}
                    onChange={(e) => setVolumesQuantidade(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vol-esp-trf" className="text-xs">
                    Espécie
                  </Label>
                  <Input
                    id="vol-esp-trf"
                    placeholder="VOLUMES / CAIXAS"
                    value={volumesEspecie}
                    onChange={(e) => setVolumesEspecie(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="peso-bruto-trf" className="text-xs">
                    Peso Bruto (kg)
                  </Label>
                  <Input
                    id="peso-bruto-trf"
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={pesoBruto}
                    onChange={(e) => setPesoBruto(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="peso-liq-trf" className="text-xs">
                    Peso Líquido (kg)
                  </Label>
                  <Input
                    id="peso-liq-trf"
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={pesoLiquido}
                    onChange={(e) => setPesoLiquido(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quadro de Valores Totais e Impostos Apurados */}
            {calculandoRascunho && (
              <div className="text-center py-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                Atualizando apuração tributária...
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 border rounded-lg bg-card">
                <span className="text-muted-foreground">Total dos Produtos:</span>
                <p className="text-base font-bold mt-1">
                  R$ {(doc?.valor_produtos || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <span className="text-muted-foreground">Frete / Despesas:</span>
                <p className="text-base font-bold mt-1">
                  R$ {((doc?.valor_frete || 0) + (doc?.valor_outras_despesas || 0)).toFixed(2)}
                </p>
              </div>
              <div className="p-3 border rounded-lg bg-primary/10 border-primary/30">
                <span className="text-primary font-semibold">Total da NF-e:</span>
                <p className="text-base font-bold mt-1 text-primary">
                  R$ {(doc?.valor_total || 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="p-3 border rounded-lg bg-muted/20 space-y-2 text-xs">
              <div className="font-semibold text-muted-foreground uppercase text-[11px] tracking-wider">
                Resumo dos Tributos Destacados
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                <div>ICMS Próprio: R$ {(doc?.valor_icms || 0).toFixed(2)}</div>
                <div>ICMS ST: R$ {(doc?.valor_icms_st || 0).toFixed(2)}</div>
                <div>IPI: R$ {(doc?.valor_ipi || 0).toFixed(2)}</div>
                <div>PIS: R$ {(doc?.valor_pis || 0).toFixed(2)}</div>
                <div>COFINS: R$ {(doc?.valor_cofins || 0).toFixed(2)}</div>
                <div>FCP: R$ {(doc?.valor_fcp || 0).toFixed(2)}</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={emitindo}
          >
            {ultimoNumero ? 'Fechar' : 'Cancelar'}
          </Button>

          <Button
            type="button"
            onClick={handleTransmitirNFe}
            disabled={emitindo || carregandoDados || Boolean(ultimoNumero)}
            className="gap-2"
          >
            {emitindo ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processando na SEFAZ...
              </>
            ) : ultimoNumero ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                NF-e Já Autorizada
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Emitir NF-e de Transferência
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ModalEmitirNFeTransferencia
