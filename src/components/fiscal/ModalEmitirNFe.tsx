import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { emitirNFeVenda, consultarSituacaoNFe } from '@/services/fiscalIntegracao'
import { listarIntermediadores, Intermediador } from '@/services/intermediadores'
import { listarTodosFornecedoresAtivos, Fornecedor } from '@/services/fornecedores'
import { obterConfigFiscalEmpresa } from '@/services/configEmissaoFiscal'
import { obterEmpresaPorId } from '@/services/empresas'
import { formatarCPF, formatarCNPJ } from '@/lib/validacoes'
import pb from '@/lib/pocketbase/client'
import {
  FileText,
  Truck,
  Building2,
  DollarSign,
  AlertTriangle,
  Info,
  CheckCircle2,
  Globe,
  Store,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react'

interface ModalEmitirNFeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  venda: any // Venda completa
  onSucesso?: () => void
}

export function ModalEmitirNFe({ open, onOpenChange, venda, onSucesso }: ModalEmitirNFeProps) {
  const { toast } = useToast()

  // Dados da conferência
  const [naturezaOperacao, setNaturezaOperacao] = useState('Venda de mercadorias')
  const [presencaComprador, setPresencaComprador] = useState('1')
  const [modalidadeFrete, setModalidadeFrete] = useState<number>(9)
  const [transportadoraId, setTransportadoraId] = useState<string>('')
  const [volumesQuantidade, setVolumesQuantidade] = useState<string>('')
  const [volumesEspecie, setVolumesEspecie] = useState<string>('VOLUMES')
  const [pesoBruto, setPesoBruto] = useState<string>('')
  const [pesoLiquido, setPesoLiquido] = useState<string>('')
  const [informacoesComplementares, setInformacoesComplementares] = useState<string>('')

  // Intermediador
  const [tipoIntermediador, setTipoIntermediador] = useState<'proprio' | 'terceiro'>('proprio')
  const [intermediadorId, setIntermediadorId] = useState<string>('')
  const [identificadorIntermediador, setIdentificadorIntermediador] = useState<string>('')
  const [intermediadores, setIntermediadores] = useState<Intermediador[]>([])

  // Lista de transportadoras
  const [transportadoras, setTransportadoras] = useState<Fornecedor[]>([])

  // Estado de cálculo / rascunho
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [configFiscal, setConfigFiscal] = useState<any>(null)
  const [rascunho, setRascunho] = useState<any>(null)
  const [calculandoRascunho, setCalculandoRascunho] = useState(false)
  const [erroCalculo, setErroCalculo] = useState<string | null>(null)

  // Estado de envio e acompanhamento
  const [emitindo, setEmitindo] = useState(false)
  const [progressoEnvio, setProgressoEnvio] = useState<string | null>(null)
  const [segundosRestantes, setSegundosRestantes] = useState<number>(30)

  // Local destino e consumidor final
  const [localDestinoTexto, setLocalDestinoTexto] = useState('')
  const [consumidorFinalTexto, setConsumidorFinalTexto] = useState('')

  // Ao abrir o modal, carregar dados e configurações
  useEffect(() => {
    if (!open || !venda) return

    let ativo = true

    async function carregarInicial() {
      try {
        setCarregandoDados(true)
        setErroCalculo(null)
        setProgressoEnvio(null)

        // 1. Carregar configuração fiscal da empresa da venda
        const empresaVendaId = venda.empresa_id
        const cfg = await obterConfigFiscalEmpresa(empresaVendaId)
        if (!ativo) return
        setConfigFiscal(cfg)

        // Presença do comprador padrão da config
        const presencaPadrao =
          cfg?.presenca_comprador_padrao_nfe ||
          (venda.origem === 'Online' || venda.origem === 'E-commerce' ? '2' : '1')
        setPresencaComprador(presencaPadrao)

        // Natureza padrão da config ou fallback
        const natPadrao = cfg?.natureza_operacao_venda || 'Venda de mercadoria'
        setNaturezaOperacao(natPadrao)

        // Informações complementares padrão + obs da venda
        const infoBase = cfg?.informacoes_complementares_padrao || ''
        const obsVenda = venda.observacao_interna || venda.observacoes || ''
        const infoFinal = [infoBase, obsVenda].filter(Boolean).join('\n')
        setInformacoesComplementares(infoFinal)

        // Carregar última escolha de intermediador do LocalStorage para agilizar e-commerce
        try {
          const chaveCache = `erp_nfe_intermed_${empresaVendaId}`
          const cache = localStorage.getItem(chaveCache)
          if (cache) {
            const parsed = JSON.parse(cache)
            if (parsed.tipo) setTipoIntermediador(parsed.tipo)
            if (parsed.intermediadorId) setIntermediadorId(parsed.intermediadorId)
          }
        } catch {
          /* intentionally ignored */
        }

        // 2. Carregar intermediadores ativos
        const listInter = await listarIntermediadores(true)
        if (!ativo) return
        setIntermediadores(listInter)

        // 3. Carregar fornecedores do tipo Transportadora
        const transps = await listarTodosFornecedoresAtivos('Transportadora')
        if (!ativo) return
        setTransportadoras(transps)

        // Obter UF da empresa emissora
        let ufEmitente = 'SP'
        try {
          const emp = await obterEmpresaPorId(empresaVendaId)
          if (emp?.uf) ufEmitente = emp.uf
        } catch {
          /* fallback para SP */
        }

        // Calcular destino e consumidor
        const clienteUf =
          venda?.cliente_uf || venda?.endereco_entrega_uf || venda?.expand?.cliente_id?.uf || ''
        if (!clienteUf || clienteUf.toUpperCase() === ufEmitente.toUpperCase()) {
          setLocalDestinoTexto('1 - Operação Interna (mesma UF)')
        } else if (clienteUf.toUpperCase() === 'EX') {
          setLocalDestinoTexto('3 - Exportação')
        } else {
          setLocalDestinoTexto(`2 - Operação Interestadual (${ufEmitente} -> ${clienteUf})`)
        }

        const cpfCnpjCliente = (
          venda?.cliente_cpf_cnpj ||
          venda?.cpf_cnpj_consumidor ||
          venda?.expand?.cliente_id?.cpf_cnpj ||
          ''
        ).replace(/\D/g, '')
        const ieCliente = (
          venda?.cliente_ie ||
          venda?.cliente_inscricao_estadual ||
          venda?.expand?.cliente_id?.inscricao_estadual ||
          ''
        )
          .trim()
          .toUpperCase()
        const isConsumidor = cpfCnpjCliente.length === 11 || !ieCliente || ieCliente === 'ISENTO'
        setConsumidorFinalTexto(isConsumidor ? '1 - Consumidor Final' : '0 - Não')

        // 4. Montar rascunho com cálculo de impostos
        await recalcularRascunho({
          natureza: natPadrao,
          presenca: presencaPadrao,
          modalidade: 9,
          infoCompl: infoFinal,
        })
      } catch (err: any) {
        if (!ativo) return
        setErroCalculo(err?.message || 'Falha ao inicializar conferência fiscal da NF-e.')
      } finally {
        if (ativo) setCarregandoDados(false)
      }
    }

    carregarInicial()

    return () => {
      ativo = false
    }
  }, [open, venda?.id])

  // Função para chamar o endpoint de rascunho com impostos
  const recalcularRascunho = async (paramsSobrescritos?: {
    natureza?: string
    presenca?: string
    modalidade?: number
    transpId?: string
    infoCompl?: string
    tipoInter?: 'proprio' | 'terceiro'
    interId?: string
    idPedidoMarketplace?: string
  }) => {
    if (!venda) return
    try {
      setCalculandoRascunho(true)
      setErroCalculo(null)

      const nat =
        paramsSobrescritos?.natureza !== undefined ? paramsSobrescritos.natureza : naturezaOperacao
      const pres =
        paramsSobrescritos?.presenca !== undefined ? paramsSobrescritos.presenca : presencaComprador
      const modFrete =
        paramsSobrescritos?.modalidade !== undefined
          ? paramsSobrescritos.modalidade
          : modalidadeFrete
      const transp =
        paramsSobrescritos?.transpId !== undefined ? paramsSobrescritos.transpId : transportadoraId
      const info =
        paramsSobrescritos?.infoCompl !== undefined
          ? paramsSobrescritos.infoCompl
          : informacoesComplementares
      const tInter =
        paramsSobrescritos?.tipoInter !== undefined
          ? paramsSobrescritos.tipoInter
          : tipoIntermediador
      const idInter =
        paramsSobrescritos?.interId !== undefined ? paramsSobrescritos.interId : intermediadorId
      const idPedMarket =
        paramsSobrescritos?.idPedidoMarketplace !== undefined
          ? paramsSobrescritos.idPedidoMarketplace
          : identificadorIntermediador

      const json = await pb.send<any>('/backend/v1/fiscal/montar-rascunho', {
        method: 'POST',
        body: {
          modelo: '55',
          origem: 'Venda',
          id: venda.id,
          natureza_operacao: nat,
          presenca_comprador: pres,
          modalidade_frete: modFrete,
          transportadora_id: transp || undefined,
          volumes_quantidade: volumesQuantidade ? Number(volumesQuantidade) : undefined,
          volumes_especie: volumesEspecie || undefined,
          peso_bruto: pesoBruto ? Number(pesoBruto) : undefined,
          peso_liquido: pesoLiquido ? Number(pesoLiquido) : undefined,
          informacoes_complementares: info,
          tipo_intermediador: tInter,
          intermediador_id: idInter || undefined,
          identificador_intermediador: idPedMarket || undefined,
        },
      })

      if (json && json.sucesso) {
        setRascunho(json)
      } else {
        setErroCalculo(json?.message || 'Erro ao calcular impostos da NF-e.')
      }
    } catch (err: any) {
      setErroCalculo(err?.message || 'Erro ao calcular tributação da NF-e.')
    } finally {
      setCalculandoRascunho(false)
    }
  }

  const exigeIntermediador = ['2', '3', '9'].includes(presencaComprador)

  // Envio e acompanhamento por até 30 segundos a cada 3s
  const handleTransmitirNFe = async () => {
    if (!venda) return

    if (exigeIntermediador && tipoIntermediador === 'terceiro' && !intermediadorId) {
      toast({
        title: 'Intermediador obrigatório',
        description:
          'Selecione a plataforma / marketplace responsável pela intermediação da venda.',
        variant: 'destructive',
      })
      return
    }

    // Salvar preferência de intermediador da empresa no LocalStorage
    try {
      localStorage.setItem(
        `erp_nfe_intermed_${venda.empresa_id}`,
        JSON.stringify({
          tipo: tipoIntermediador,
          intermediadorId: intermediadorId,
        }),
      )
    } catch {
      /* intentionally ignored */
    }

    try {
      setEmitindo(true)
      setProgressoEnvio('Transmitindo NF-e para o servidor da SEFAZ...')

      const respEnvio = await emitirNFeVenda({
        venda_id: venda.id,
        natureza_operacao: naturezaOperacao,
        presenca_comprador: presencaComprador,
        modalidade_frete: modalidadeFrete,
        transportadora_id: transportadoraId || undefined,
        volumes_quantidade: volumesQuantidade ? Number(volumesQuantidade) : undefined,
        volumes_especie: volumesEspecie || undefined,
        peso_bruto: pesoBruto ? Number(pesoBruto) : undefined,
        peso_liquido: pesoLiquido ? Number(pesoLiquido) : undefined,
        informacoes_complementares: informacoesComplementares,
        tipo_intermediador: tipoIntermediador,
        intermediador_id: intermediadorId || undefined,
        identificador_intermediador: identificadorIntermediador || undefined,
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

      // Acompanhamento por até 30 segundos consultando a cada 3 segundos
      setProgressoEnvio('NF-e transmitida. Consultando autorização na SEFAZ...')
      let tentativas = 0
      const maxTentativas = 10 // 10 * 3s = 30s
      let finalizado = false

      const interval = setInterval(async () => {
        tentativas++
        setSegundosRestantes(Math.max(0, 30 - tentativas * 3))

        try {
          const sit = await consultarSituacaoNFe({ documento_id: docId, venda_id: venda.id })

          if (sit.status === 'Autorizada') {
            clearInterval(interval)
            finalizado = true
            setEmitindo(false)
            setProgressoEnvio(null)
            toast({
              title: 'NF-e Autorizada com sucesso!',
              description: `Nota nº ${sit.numero || ''} autorizada pela SEFAZ. Protocolo: ${sit.protocolo || ''}`,
            })
            onOpenChange(false)
            if (onSucesso) onSucesso()
            return
          }

          if (sit.status === 'Rejeitada') {
            clearInterval(interval)
            finalizado = true
            setEmitindo(false)
            setProgressoEnvio(null)
            toast({
              title: 'NF-e Rejeitada',
              description: sit.message || 'Rejeição informada pela SEFAZ.',
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
          toast({
            title: 'NF-e em Processamento',
            description:
              'A SEFAZ ainda está processando o lote da nota. O status fica "Processando" e pode ser consultado a qualquer momento no botão "Consultar situação".',
          })
          onOpenChange(false)
          if (onSucesso) onSucesso()
        }
      }, 3000)
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

  // Valores totais calculados
  const doc = rascunho?.documento
  const temDifal = (doc?.valor_icms_uf_destino || 0) > 0 || (doc?.valor_fcp_uf_destino || 0) > 0
  const difalHabilitado = configFiscal?.calcular_difal_consumidor_final !== false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Conferência e Emissão de NF-e (Modelo 55)
            {venda?.numero ? ` - Venda nº ${venda.numero}` : ''}
          </DialogTitle>
          <DialogDescription>
            Confira as informações comerciais, tributárias, transporte e intermediador antes de
            transmitir para a SEFAZ.
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

        {erroCalculo && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção nos dados fiscais</AlertTitle>
            <AlertDescription className="text-xs">{erroCalculo}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="dados" className="text-xs sm:text-sm">
              Operação & Destino
            </TabsTrigger>
            <TabsTrigger value="transporte" className="text-xs sm:text-sm">
              Transporte
            </TabsTrigger>
            <TabsTrigger value="intermediador" className="text-xs sm:text-sm">
              Intermediador
              {exigeIntermediador && <span className="ml-1 text-primary font-bold">*</span>}
            </TabsTrigger>
            <TabsTrigger value="impostos" className="text-xs sm:text-sm">
              Totais & Impostos
              {temDifal && <span className="ml-1 text-xs text-emerald-600 font-bold">DIFAL</span>}
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: DADOS GERAIS */}
          <TabsContent value="dados" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="natureza-op">Natureza da Operação *</Label>
                <Input
                  id="natureza-op"
                  value={naturezaOperacao}
                  onChange={(e) => setNaturezaOperacao(e.target.value)}
                  onBlur={() => recalcularRascunho({ natureza: naturezaOperacao })}
                  placeholder="Ex.: Venda de mercadorias"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="presenca-comp">Presença do Comprador *</Label>
                <Select
                  value={presencaComprador}
                  onValueChange={(val) => {
                    setPresencaComprador(val)
                    recalcularRascunho({ presenca: val })
                  }}
                >
                  <SelectTrigger id="presenca-comp">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Operação presencial</SelectItem>
                    <SelectItem value="2">2 - Operação não presencial, pela Internet</SelectItem>
                    <SelectItem value="3">3 - Operação não presencial, Teleatendimento</SelectItem>
                    <SelectItem value="4">
                      4 - NFC-e em operação com entrega em domicílio
                    </SelectItem>
                    <SelectItem value="9">9 - Operação não presencial, outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cartão de Resumo do Destinatário */}
            {(() => {
              const destNome =
                doc?.destinatario_nome ||
                venda?.expand?.cliente_id?.nome_razao_social ||
                venda?.expand?.cliente_id?.nome ||
                venda?.cliente_nome ||
                'Consumidor não identificado'

              const rawCpfCnpj = (
                doc?.destinatario_cpf_cnpj ||
                venda?.cpf_cnpj_consumidor ||
                venda?.expand?.cliente_id?.cpf_cnpj ||
                venda?.cliente_cpf_cnpj ||
                ''
              ).replace(/\D/g, '')

              let cpfCnpjFormatado = 'Não informado'
              if (rawCpfCnpj.length === 11) {
                cpfCnpjFormatado = formatarCPF(rawCpfCnpj)
              } else if (rawCpfCnpj.length === 14) {
                cpfCnpjFormatado = formatarCNPJ(rawCpfCnpj)
              } else if (rawCpfCnpj.length > 0) {
                cpfCnpjFormatado = rawCpfCnpj
              }

              const destIe =
                doc?.destinatario_ie ||
                venda?.expand?.cliente_id?.inscricao_estadual ||
                venda?.cliente_ie ||
                venda?.cliente_inscricao_estadual ||
                'ISENTO / Não Contribuinte'

              return (
                <Card className="bg-muted/30">
                  <CardHeader className="py-2 px-4 border-b">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Destinatário da Venda
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3 px-4 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome / Razão Social:</span>
                      <span className="font-semibold">{destNome}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPF / CNPJ:</span>
                      <span className="font-mono">{cpfCnpjFormatado}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Inscrição Estadual:</span>
                      <span>{destIe}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Local de Destino (SEFAZ):</span>
                      <Badge variant="outline" className="text-xs">
                        {localDestinoTexto}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Consumidor Final:</span>
                      <Badge variant="outline" className="text-xs">
                        {consumidorFinalTexto}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            <div className="space-y-1.5">
              <Label htmlFor="info-compl">
                Informações Complementares de Interesse do Contribuinte
              </Label>
              <Textarea
                id="info-compl"
                rows={3}
                value={informacoesComplementares}
                onChange={(e) => setInformacoesComplementares(e.target.value)}
                placeholder="Observações complementares que constarão no DANFE..."
              />
            </div>
          </TabsContent>

          {/* ABA 2: TRANSPORTE */}
          <TabsContent value="transporte" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="modalidade-frete">Modalidade do Frete *</Label>
                <Select
                  value={String(modalidadeFrete)}
                  onValueChange={(val) => {
                    const n = Number(val)
                    setModalidadeFrete(n)
                    recalcularRascunho({ modalidade: n })
                  }}
                >
                  <SelectTrigger id="modalidade-frete">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">
                      0 - Contratação do Frete por conta do Remetente (CIF)
                    </SelectItem>
                    <SelectItem value="1">
                      1 - Contratação do Frete por conta do Destinatário (FOB)
                    </SelectItem>
                    <SelectItem value="2">
                      2 - Contratação do Frete por conta de Terceiros
                    </SelectItem>
                    <SelectItem value="3">3 - Transporte Próprio por conta do Remetente</SelectItem>
                    <SelectItem value="4">
                      4 - Transporte Próprio por conta do Destinatário
                    </SelectItem>
                    <SelectItem value="9">9 - Sem Ocorrência de Transporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transportadora-select">Transportadora (Fornecedor)</Label>
                <Select
                  value={transportadoraId || 'nenhuma'}
                  onValueChange={(val) => {
                    const finalId = val === 'nenhuma' ? '' : val
                    setTransportadoraId(finalId)
                    recalcularRascunho({ transpId: finalId })
                  }}
                >
                  <SelectTrigger id="transportadora-select">
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
                  Dados dos Volumes Transportados
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 px-4">
                <div className="space-y-1">
                  <Label htmlFor="vol-qtd" className="text-xs">
                    Quantidade
                  </Label>
                  <Input
                    id="vol-qtd"
                    type="number"
                    placeholder="1"
                    value={volumesQuantidade}
                    onChange={(e) => setVolumesQuantidade(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vol-esp" className="text-xs">
                    Espécie
                  </Label>
                  <Input
                    id="vol-esp"
                    placeholder="VOLUMES, CAIXAS"
                    value={volumesEspecie}
                    onChange={(e) => setVolumesEspecie(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="peso-b" className="text-xs">
                    Peso Bruto (kg)
                  </Label>
                  <Input
                    id="peso-b"
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={pesoBruto}
                    onChange={(e) => setPesoBruto(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="peso-l" className="text-xs">
                    Peso Líquido (kg)
                  </Label>
                  <Input
                    id="peso-l"
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={pesoLiquido}
                    onChange={(e) => setPesoLiquido(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 3: INTERMEDIADOR */}
          <TabsContent value="intermediador" className="space-y-4 pt-3">
            {!exigeIntermediador ? (
              <Alert className="bg-muted/40 border-muted">
                <Info className="h-4 w-4 text-muted-foreground" />
                <AlertTitle className="text-xs font-semibold">Intermediador Não Exigido</AlertTitle>
                <AlertDescription className="text-xs">
                  A presença do comprador selecionada é presencial. O grupo de intermediador
                  (indIntermed/infIntermed) só é exigido pela SEFAZ em operações não presenciais
                  (Internet, Televendas ou Outros).
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-xs font-semibold">
                  Exigência SEFAZ para Vendas Online / Telefone
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Para vendas pela internet ou telefone, a SEFAZ exige identificar se a operação
                  ocorreu em plataforma própria ou em marketplace terceiro (ex.: Mercado Livre,
                  Shopee).
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Canal da Operação:</Label>
              <RadioGroup
                value={tipoIntermediador}
                onValueChange={(val: 'proprio' | 'terceiro') => {
                  setTipoIntermediador(val)
                  recalcularRascunho({ tipoInter: val })
                }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <div
                  className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer ${tipoIntermediador === 'proprio' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="proprio" id="int-proprio" className="mt-0.5" />
                  <label htmlFor="int-proprio" className="cursor-pointer space-y-1">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      <Globe className="h-4 w-4 text-primary" />
                      Site ou Aplicativo Próprio
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Operação realizada sem intermediador terceiro (indIntermed = 0).
                    </div>
                  </label>
                </div>

                <div
                  className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer ${tipoIntermediador === 'terceiro' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="terceiro" id="int-terceiro" className="mt-0.5" />
                  <label htmlFor="int-terceiro" className="cursor-pointer space-y-1">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      <Store className="h-4 w-4 text-primary" />
                      Marketplace / Plataforma Terceira
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Venda via Mercado Livre, Shopee, Amazon, Magalu, etc. (indIntermed = 1).
                    </div>
                  </label>
                </div>
              </RadioGroup>
            </div>

            {tipoIntermediador === 'terceiro' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                <div className="space-y-1.5">
                  <Label htmlFor="select-intermediador">Intermediador / Plataforma *</Label>
                  <Select
                    value={intermediadorId}
                    onValueChange={(val) => {
                      setIntermediadorId(val)
                      recalcularRascunho({ interId: val })
                    }}
                  >
                    <SelectTrigger id="select-intermediador">
                      <SelectValue placeholder="Selecione o marketplace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {intermediadores.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.nome} ({it.cnpj})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="id-cad-int">Identificador do Pedido na Plataforma</Label>
                  <Input
                    id="id-cad-int"
                    placeholder="Ex.: 2000008472917 (idCadIntTran)"
                    value={identificadorIntermediador}
                    onChange={(e) => setIdentificadorIntermediador(e.target.value)}
                    onBlur={() =>
                      recalcularRascunho({ idPedidoMarketplace: identificadorIntermediador })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Código do pedido no marketplace (grupo infIntermed).
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ABA 4: TOTAIS & IMPOSTOS */}
          <TabsContent value="impostos" className="space-y-4 pt-3">
            {calculandoRascunho && (
              <div className="text-center py-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                Atualizando apuração tributária...
              </div>
            )}

            {/* Aviso DIFAL */}
            {temDifal ? (
              <Alert className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-xs font-semibold">
                  DIFAL Interestadual a Consumidor Calculado
                </AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  Venda interestadual para consumidor final. O diferencial de alíquotas (EC 87/2015)
                  foi apurado nos itens da nota:
                  <div className="mt-1 font-mono font-semibold">
                    ICMS Destino: R$ {(doc?.valor_icms_uf_destino || 0).toFixed(2)} | FCP Destino:
                    R$ {(doc?.valor_fcp_uf_destino || 0).toFixed(2)}
                  </div>
                </AlertDescription>
              </Alert>
            ) : !difalHabilitado ? (
              <Alert className="bg-muted/40 border-muted">
                <Info className="h-4 w-4 text-muted-foreground" />
                <AlertTitle className="text-xs font-semibold">DIFAL Opcional Desligado</AlertTitle>
                <AlertDescription className="text-xs">
                  O cálculo de DIFAL está desmarcado na Configuração Fiscal desta empresa (Simples
                  Nacional sem DIFAL por liminar do STF).
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Quadro de Valores Totais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 border rounded-lg bg-card">
                <span className="text-muted-foreground">Produtos:</span>
                <p className="text-base font-bold mt-1">
                  R$ {(doc?.valor_produtos || venda.total_itens || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <span className="text-muted-foreground">Descontos:</span>
                <p className="text-base font-bold mt-1 text-destructive">
                  - R$ {(doc?.valor_desconto || venda.desconto || 0).toFixed(2)}
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
                  R$ {(doc?.valor_total || venda.total_liquido || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Impostos Apurados */}
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
            Fechar
          </Button>

          <Button
            type="button"
            onClick={handleTransmitirNFe}
            disabled={emitindo || carregandoDados}
            className="gap-2"
          >
            {emitindo ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processando na SEFAZ...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Emitir NF-e Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
