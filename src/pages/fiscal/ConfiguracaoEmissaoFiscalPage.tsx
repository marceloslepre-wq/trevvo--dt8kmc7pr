import React, { useState, useEffect } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { useToast } from '@/hooks/use-toast'
import {
  ConfigEmissaoFiscal,
  PresencaCompradorNfe,
  AmbienteFiscal,
  obterOuCriarConfigEmissaoFiscal,
  salvarConfigEmissaoFiscal,
  copiarConfigEmissaoDeOutraEmpresa,
  listarTodasConfigsEmissao,
} from '@/services/configEmissaoFiscal'
import {
  testarConexaoFocus,
  obterStatusSegredosFocus,
  registrarWebhookFocus,
  listarWebhooksFocus,
  obterCredenciaisFiscais,
  salvarCredenciaisFiscais,
  testarConexaoCredenciaisFocus,
  registrarWebhookAssinante,
  CredenciaisFiscaisResponse,
  FocusHookItem,
} from '@/services/fiscalIntegracao'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Save,
  Loader2,
  Copy,
  ExternalLink,
  ShieldAlert,
  Building2,
  FileCheck2,
  RefreshCw,
  KeyRound,
  Calendar,
  ShieldCheck,
  Webhook,
} from 'lucide-react'
import { Link } from 'react-router-dom'

export const ConfiguracaoEmissaoFiscalPage: React.FC = () => {
  const { empresaAtiva, selecionarEmpresa } = useEmpresaAtiva()
  const { administrador } = usePermissoes()
  const { toast } = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testandoConexao, setTestandoConexao] = useState(false)

  // Credenciais da Focus (Prompt 9.6)
  const [credenciaisInfo, setCredenciaisInfo] = useState<CredenciaisFiscaisResponse | null>(null)
  const [tokenHomologacaoInput, setTokenHomologacaoInput] = useState<string>('')
  const [tokenProducaoInput, setTokenProducaoInput] = useState<string>('')
  const [salvandoCredenciais, setSalvandoCredenciais] = useState(false)
  const [testandoCredenciais, setTestandoCredenciais] = useState(false)
  const [registrandoWebhookAssinanteState, setRegistrandoWebhookAssinanteState] = useState(false)

  // Configuração atual
  const [config, setConfig] = useState<ConfigEmissaoFiscal | null>(null)

  // Campos do formulário
  const [emiteDocs, setEmiteDocs] = useState<boolean>(true)
  const [emiteNfce, setEmiteNfce] = useState<boolean>(false)
  const [codigoToken, setCodigoToken] = useState<string>('')
  const [presencaComprador, setPresencaComprador] = useState<PresencaCompradorNfe>('1 Presencial')
  const [ambiente, setAmbiente] = useState<AmbienteFiscal>('Homologação')
  const [serieNfe, setSerieNfe] = useState<string>('1')
  const [serieNfce, setSerieNfce] = useState<string>('1')
  const [emitirNfceAutoPdv, setEmitirNfceAutoPdv] = useState<boolean>(true)
  const [naturezaVenda, setNaturezaVenda] = useState<string>('Venda de mercadoria')
  const [naturezaDevCompra, setNaturezaDevCompra] = useState<string>('Devolução de compra')
  const [naturezaDevVenda, setNaturezaDevVenda] = useState<string>('Devolução de venda')
  const [naturezaTransferencia, setNaturezaTransferencia] = useState<string>(
    'Transferência de mercadoria',
  )
  const [emitirNfeAoEnviarTransferencia, setEmitirNfeAoEnviarTransferencia] =
    useState<boolean>(false)
  const [infoComplementares, setInfoComplementares] = useState<string>('')
  const [enviarEmailCliente, setEnviarEmailCliente] = useState<boolean>(false)
  const [certificadoValidade, setCertificadoValidade] = useState<string>('')
  const [cscConfigurado, setCscConfigurado] = useState<boolean>(false)
  const [informarIbsCbs, setInformarIbsCbs] = useState<boolean>(false)
  const [calcularDifalConsumidorFinal, setCalcularDifalConsumidorFinal] = useState<boolean>(false)

  // Lista de empresas para o quadro geral e cópia
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [configsTodas, setConfigsTodas] = useState<ConfigEmissaoFiscal[]>([])
  const [segredosStatus, setSegredosStatus] = useState<
    Record<string, { segredo_nome: string; segredo_configurado: boolean; ambiente: string }>
  >({})

  // Modal de confirmação para Produção
  const [modalProducaoAberto, setModalProducaoAberto] = useState(false)
  const [textoConfirmacaoProducao, setTextoConfirmacaoProducao] = useState('')

  // Modal de cópia de configuração
  const [modalCopiarAberto, setModalCopiarAberto] = useState(false)
  const [empresaOrigemId, setEmpresaOrigemId] = useState<string>('')
  const [copiando, setCopiando] = useState(false)

  // Teste de conexão local
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean
    message: string
    ambiente?: string
    segredo_nome?: string
    status_code?: number | null
  } | null>(null)

  // Webhooks da Focus (Avisos)
  const [webhooksFocus, setWebhooksFocus] = useState<FocusHookItem[]>([])
  const [carregandoWebhooks, setCarregandoWebhooks] = useState(false)
  const [registrandoWebhook, setRegistrandoWebhook] = useState(false)
  const [segredoWebhookConfigurado, setSegredoWebhookConfigurado] = useState<boolean>(true)

  useEffect(() => {
    carregarDadosEmpresaAtiva()
  }, [empresaAtiva?.id])

  useEffect(() => {
    if (empresaAtiva?.id && administrador) {
      carregarWebhooksFocus()
      carregarCredenciaisFiscaisEmpresa()
    }
  }, [empresaAtiva?.id, administrador])

  async function carregarCredenciaisFiscaisEmpresa() {
    if (!empresaAtiva?.id) return
    try {
      const res = await obterCredenciaisFiscais(empresaAtiva.id)
      setCredenciaisInfo(res)
      setTokenHomologacaoInput('')
      setTokenProducaoInput('')
    } catch (err: any) {
      console.warn('Erro ao carregar credenciais fiscais:', err)
    }
  }

  async function handleSalvarCredenciais() {
    if (!empresaAtiva?.id) return
    if (!administrador) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas Administradores podem salvar credenciais fiscais.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoCredenciais(true)
    try {
      const payload: { empresa_id: string; token_homologacao?: string; token_producao?: string } = {
        empresa_id: empresaAtiva.id,
      }
      if (tokenHomologacaoInput.trim()) {
        payload.token_homologacao = tokenHomologacaoInput.trim()
      }
      if (tokenProducaoInput.trim()) {
        payload.token_producao = tokenProducaoInput.trim()
      }

      const res = await salvarCredenciaisFiscais(payload)
      setCredenciaisInfo(res)
      setTokenHomologacaoInput('')
      setTokenProducaoInput('')
      toast({
        title: 'Credenciais salvas com sucesso',
        description: res.message || 'Tokens da Focus atualizados com segurança.',
      })
      await carregarQuadroGeralEmpresas()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar credenciais',
        description: err?.data?.message || err?.message || 'Falha ao salvar tokens.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoCredenciais(false)
    }
  }

  async function handleTestarCredenciais() {
    if (!empresaAtiva?.id) return
    setTestandoCredenciais(true)
    try {
      const res = await testarConexaoCredenciaisFocus(empresaAtiva.id)
      setResultadoTeste(res)
      if (res.sucesso) {
        toast({
          title: 'Conexão Focus estabelecida',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha no teste de conexão',
          description: res.message,
          variant: 'destructive',
        })
      }
      await carregarQuadroGeralEmpresas()
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Erro ao testar conexão.'
      setResultadoTeste({ sucesso: false, message: msg })
      toast({
        title: 'Erro de conexão',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setTestandoCredenciais(false)
    }
  }

  async function handleRegistrarWebhookAssinanteEmLote() {
    setRegistrandoWebhookAssinanteState(true)
    try {
      const res = await registrarWebhookAssinante()
      if (res.sucesso) {
        toast({
          title: 'Webhooks registrados',
          description: res.message,
        })
      } else {
        toast({
          title: 'Aviso nos webhooks',
          description: res.message,
          variant: 'destructive',
        })
      }
      await carregarWebhooksFocus()
      await carregarCredenciaisFiscaisEmpresa()
    } catch (err: any) {
      toast({
        title: 'Falha no registro de webhooks',
        description: err?.data?.message || err?.message || 'Erro de comunicação.',
        variant: 'destructive',
      })
    } finally {
      setRegistrandoWebhookAssinanteState(false)
    }
  }

  async function carregarWebhooksFocus() {
    if (!empresaAtiva?.id) return
    setCarregandoWebhooks(true)
    try {
      const res = await listarWebhooksFocus(empresaAtiva.id)
      setWebhooksFocus(res.hooks || [])
      setSegredoWebhookConfigurado(res.tem_segredo_webhook)
    } catch (err) {
      console.warn('Erro ao carregar webhooks da Focus:', err)
    } finally {
      setCarregandoWebhooks(false)
    }
  }

  async function handleRegistrarWebhookEmpresa() {
    if (!empresaAtiva?.id) return
    setRegistrandoWebhook(true)
    try {
      const res = await registrarWebhookFocus({ empresa_id: empresaAtiva.id })
      if (res.sucesso) {
        toast({
          title: 'Avisos da Focus registrados',
          description: res.message || 'Webhook configurado na Focus NFe com sucesso.',
        })
      } else {
        toast({
          title: 'Erro ao registrar avisos',
          description: res.message || 'Não foi possível registrar o webhook.',
          variant: 'destructive',
        })
      }
      await carregarWebhooksFocus()
    } catch (err: any) {
      toast({
        title: 'Falha no registro de avisos',
        description: err?.data?.message || err?.message || 'Erro na comunicação.',
        variant: 'destructive',
      })
    } finally {
      setRegistrandoWebhook(false)
    }
  }

  async function handleRegistrarWebhookTodas() {
    setRegistrandoWebhook(true)
    try {
      const res = await registrarWebhookFocus()
      if (res.sucesso) {
        toast({
          title: 'Registro global concluído',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha no registro global',
          description: res.message,
          variant: 'destructive',
        })
      }
      await carregarWebhooksFocus()
    } catch (err: any) {
      toast({
        title: 'Falha no registro de avisos',
        description: err?.data?.message || err?.message || 'Erro na comunicação.',
        variant: 'destructive',
      })
    } finally {
      setRegistrandoWebhook(false)
    }
  }

  useEffect(() => {
    carregarQuadroGeralEmpresas()
  }, [empresaAtiva?.id])

  async function carregarDadosEmpresaAtiva() {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    setResultadoTeste(null)
    try {
      const cfg = await obterOuCriarConfigEmissaoFiscal(empresaAtiva.id)
      setConfig(cfg)
      setEmiteDocs(cfg.emite_documentos_fiscais)
      setEmiteNfce(Boolean(cfg.emite_nfce))
      setCodigoToken(cfg.codigo_token || '')
      setPresencaComprador(cfg.presenca_comprador_padrao_nfe || '1 Presencial')
      setAmbiente(cfg.ambiente || 'Homologação')
      setSerieNfe(cfg.serie_nfe || '1')
      setSerieNfce(cfg.serie_nfce || '1')
      setEmitirNfceAutoPdv(cfg.emitir_nfce_automaticamente_no_pdv !== false)
      setNaturezaVenda(cfg.natureza_operacao_venda || 'Venda de mercadoria')
      setNaturezaDevCompra(cfg.natureza_operacao_devolucao_compra || 'Devolução de compra')
      setNaturezaDevVenda(cfg.natureza_operacao_devolucao_venda || 'Devolução de venda')
      setNaturezaTransferencia(cfg.natureza_operacao_transferencia || 'Transferência de mercadoria')
      setEmitirNfeAoEnviarTransferencia(Boolean(cfg.emitir_nfe_ao_enviar_transferencia))
      setInfoComplementares(cfg.informacoes_complementares_padrao || '')
      setEnviarEmailCliente(Boolean(cfg.enviar_email_cliente))
      setCertificadoValidade(cfg.certificado_validade ? cfg.certificado_validade.slice(0, 10) : '')
      setCscConfigurado(Boolean(cfg.csc_configurado))
      setInformarIbsCbs(Boolean(cfg.informar_ibs_cbs))
      setCalcularDifalConsumidorFinal(Boolean(cfg.calcular_difal_consumidor_final))

      if (cfg.ultimo_teste_conexao_data) {
        setResultadoTeste({
          sucesso: Boolean(cfg.ultimo_teste_conexao_sucesso),
          message: cfg.ultimo_teste_conexao_mensagem || '',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar configuração fiscal',
        description: err.message || 'Falha ao buscar parâmetros',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  async function carregarQuadroGeralEmpresas() {
    try {
      const [listaEmp, listaCfg, segredos] = await Promise.all([
        listarEmpresasAtivas(),
        listarTodasConfigsEmissao(),
        obterStatusSegredosFocus(),
      ])
      setEmpresas(listaEmp.filter((e) => e.ativo))
      setConfigsTodas(listaCfg)
      if (segredos.sucesso && segredos.status) {
        setSegredosStatus(segredos.status)
      }
    } catch (err) {
      console.warn('Erro ao carregar quadro geral de empresas:', err)
    }
  }

  // Validação: empresa tem IE vazia ou ISENTO
  const ieEmpresa = (empresaAtiva?.inscricao_estadual || '').trim().toUpperCase()
  const semIeValida = !ieEmpresa || ieEmpresa === 'ISENTO'

  // Checklist de prontidão da empresa ativa
  const checklist = {
    cnpj: Boolean(empresaAtiva?.cnpj && empresaAtiva.cnpj.replace(/\D/g, '').length === 14),
    inscricao_estadual: Boolean(
      empresaAtiva?.inscricao_estadual &&
      empresaAtiva.inscricao_estadual.trim().toUpperCase() !== 'ISENTO',
    ),
    crt: Boolean(empresaAtiva?.crt && [1, 2, 3, 4].includes(Number(empresaAtiva.crt))),
    endereco_completo: Boolean(
      empresaAtiva?.logradouro &&
      empresaAtiva?.numero &&
      empresaAtiva?.bairro &&
      empresaAtiva?.municipio &&
      empresaAtiva?.uf &&
      empresaAtiva?.cep,
    ),
    codigo_municipio_ibge: Boolean(
      empresaAtiva?.codigo_municipio_ibge && empresaAtiva.codigo_municipio_ibge.trim().length === 7,
    ),
    cnae: Boolean(empresaAtiva?.cnae_principal && empresaAtiva.cnae_principal.trim().length >= 4),
    email_fiscal: Boolean(
      empresaAtiva?.email_fiscal &&
      empresaAtiva.email_fiscal.includes('@') &&
      empresaAtiva.email_fiscal.includes('.'),
    ),
  }

  const prontoParaEmitir = Object.values(checklist).every(Boolean)

  // Avisos de certificado e CSC
  const diasAteVencimentoCertificado = (() => {
    if (!certificadoValidade) return null
    const [ano, mes, dia] = certificadoValidade.split('-').map(Number)
    if (!ano || !mes || !dia) return null
    const dataVal = new Date(ano, mes - 1, dia)
    const agora = new Date()
    agora.setHours(0, 0, 0, 0)
    const diffMs = dataVal.getTime() - agora.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  })()

  const certificadoVencido =
    diasAteVencimentoCertificado !== null && diasAteVencimentoCertificado < 0
  const certificadoVencendoEm30Dias =
    diasAteVencimentoCertificado !== null &&
    diasAteVencimentoCertificado >= 0 &&
    diasAteVencimentoCertificado <= 30

  function handleAmbienteChange(novo: AmbienteFiscal) {
    if (novo === 'Produção' && ambiente !== 'Produção') {
      setTextoConfirmacaoProducao('')
      setModalProducaoAberto(true)
      return
    }
    setAmbiente(novo)
  }

  function confirmarMudancaParaProducao() {
    if (textoConfirmacaoProducao.trim().toUpperCase() !== 'PRODUÇÃO') {
      toast({
        title: 'Confirmação incorreta',
        description: 'Digite exatamente PRODUÇÃO para confirmar a troca de ambiente.',
        variant: 'destructive',
      })
      return
    }
    setAmbiente('Produção')
    setModalProducaoAberto(false)
    toast({
      title: 'Ambiente alterado para Produção',
      description: 'Lembre-se de clicar em "Salvar Configuração" para gravar.',
    })
  }

  async function handleSalvar() {
    if (!empresaAtiva?.id) return

    if (!administrador) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas Administradores do sistema podem editar a configuração fiscal.',
        variant: 'destructive',
      })
      return
    }

    if (emiteDocs && semIeValida) {
      toast({
        title: 'Emissão não permitida',
        description:
          'Empresas sem Inscrição Estadual ou com inscrição ISENTO não podem ter a emissão de documentos fiscais ativada.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const salva = await salvarConfigEmissaoFiscal({
        id: config?.id,
        empresa_id: empresaAtiva.id,
        emite_documentos_fiscais: emiteDocs,
        emite_nfce: emiteNfce,
        codigo_token: codigoToken,
        presenca_comprador_padrao_nfe: presencaComprador,
        ambiente: ambiente,
        serie_nfe: serieNfe,
        serie_nfce: serieNfce,
        emitir_nfce_automaticamente_no_pdv: emitirNfceAutoPdv,
        natureza_operacao_venda: naturezaVenda,
        natureza_operacao_devolucao_compra: naturezaDevCompra,
        natureza_operacao_devolucao_venda: naturezaDevVenda,
        natureza_operacao_transferencia: naturezaTransferencia,
        emitir_nfe_ao_enviar_transferencia: emitirNfeAoEnviarTransferencia,
        informacoes_complementares_padrao: infoComplementares,
        enviar_email_cliente: enviarEmailCliente,
        certificado_validade: certificadoValidade || null,
        csc_configurado: cscConfigurado,
        informar_ibs_cbs: informarIbsCbs,
        calcular_difal_consumidor_final: calcularDifalConsumidorFinal,
      })

      setConfig(salva)
      await carregarQuadroGeralEmpresas()

      toast({
        title: 'Configuração fiscal salva com sucesso',
        description: `Parâmetros de emissão de ${empresaAtiva.nome_fantasia || empresaAtiva.razao_social} atualizados.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar configuração',
        description: err.message || 'Verifique os dados informados.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function handleTestarConexao() {
    if (!empresaAtiva?.id) return
    setTestandoConexao(true)
    setResultadoTeste(null)
    try {
      const res = await testarConexaoFocus(empresaAtiva.id)
      setResultadoTeste(res)
      if (res.sucesso) {
        toast({
          title: 'Conexão estabelecida com sucesso',
          description: res.message,
        })
      } else {
        toast({
          title: 'Resultado do teste de conexão',
          description: res.message,
          variant: 'destructive',
        })
      }
      await carregarQuadroGeralEmpresas()
    } catch (err: any) {
      const msgErro =
        err?.response?.message ||
        err?.data?.message ||
        err?.message ||
        'Sem comunicação com a API emissora.'
      setResultadoTeste({
        sucesso: false,
        message: msgErro,
      })
      toast({
        title: 'Aviso de conexão',
        description: msgErro,
        variant: 'destructive',
      })
    } finally {
      setTestandoConexao(false)
    }
  }

  async function handleCopiarConfiguracao() {
    if (!empresaOrigemId || !empresaAtiva?.id) return
    setCopiando(true)
    try {
      const atualizada = await copiarConfigEmissaoDeOutraEmpresa({
        empresaOrigemId: empresaOrigemId,
        empresaDestinoId: empresaAtiva.id,
      })
      setConfig(atualizada)
      setPresencaComprador(atualizada.presenca_comprador_padrao_nfe)
      setAmbiente(atualizada.ambiente)
      setEmiteNfce(Boolean(atualizada.emite_nfce))
      setSerieNfe(atualizada.serie_nfe)
      setSerieNfce(atualizada.serie_nfce)
      setEmitirNfceAutoPdv(atualizada.emitir_nfce_automaticamente_no_pdv)
      setNaturezaVenda(atualizada.natureza_operacao_venda)
      setNaturezaDevCompra(atualizada.natureza_operacao_devolucao_compra)
      setNaturezaDevVenda(atualizada.natureza_operacao_devolucao_venda)
      setNaturezaTransferencia(
        atualizada.natureza_operacao_transferencia || 'Transferência de mercadoria',
      )
      setEmitirNfeAoEnviarTransferencia(Boolean(atualizada.emitir_nfe_ao_enviar_transferencia))
      setInfoComplementares(atualizada.informacoes_complementares_padrao)
      setEnviarEmailCliente(atualizada.enviar_email_cliente)
      setCscConfigurado(atualizada.csc_configurado)
      setInformarIbsCbs(atualizada.informar_ibs_cbs)
      setCalcularDifalConsumidorFinal(Boolean(atualizada.calcular_difal_consumidor_final))

      setModalCopiarAberto(false)
      toast({
        title: 'Configurações copiadas com sucesso',
        description: 'As séries, naturezas e opções foram importadas da outra empresa.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao copiar configurações',
        description: err.message || 'Falha na importação.',
        variant: 'destructive',
      })
    } finally {
      setCopiando(false)
    }
  }

  return (
    <PermissaoGuard modulo="notas_saida" acao="ver">
      <div className="space-y-6 max-w-6xl mx-auto p-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Configuração de Emissão Fiscal (NF-e e NFC-e)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Parâmetros de emissão para{' '}
              <span className="font-semibold text-slate-900">
                {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa Ativa'}
              </span>{' '}
              (CNPJ: {empresaAtiva?.cnpj || 'Sem CNPJ'})
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {administrador && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalCopiarAberto(true)}
                className="gap-2"
                disabled={carregando || salvando}
              >
                <Copy className="h-4 w-4" />
                Copiar de outra empresa
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestarConexao}
              disabled={testandoConexao || carregando}
              className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              {testandoConexao ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
                <Activity className="h-4 w-4 text-blue-600" />
              )}
              Testar Conexão
            </Button>

            {administrador && (
              <Button
                onClick={handleSalvar}
                disabled={salvando || carregando}
                className="gap-2 shadow-xs"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar Configuração
              </Button>
            )}
          </div>
        </div>

        {/* Banner de alertas do ambiente e certificados */}
        <div className="space-y-3">
          {ambiente === 'Homologação' && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Ambiente de Homologação Ativo:</span> As notas
                emitidas não têm validade jurídica e servem exclusivamente para testes fiscais com a
                SEFAZ.
              </div>
              <Badge variant="outline" className="bg-amber-100 border-amber-300 text-amber-800">
                SEM VALOR FISCAL
              </Badge>
            </div>
          )}

          {semIeValida && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-300 bg-slate-100 text-slate-800 text-sm">
              <ShieldAlert className="h-5 w-5 text-slate-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Empresa Isenta ou sem Inscrição Estadual:</span>{' '}
                Esta filial possui IE {ieEmpresa || 'vazia'} e não está autorizada a emitir NF-e ou
                NFC-e. A opção de emissão foi desligada automaticamente.
              </div>
            </div>
          )}

          {!cscConfigurado && emiteDocs && emiteNfce && !semIeValida && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">
                  CSC (Código de Segurança do Contribuinte) não marcado como configurado:
                </span>{' '}
                Para emitir NFC-e é obrigatório cadastrar o CSC e seu ID no painel da Focus NFe.
              </div>
            </div>
          )}

          {certificadoVencido && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Certificado Digital Vencido:</span> O certificado
                digital da empresa venceu em {certificadoValidade}. A SEFAZ rejeitará qualquer nova
                emissão.
              </div>
            </div>
          )}

          {certificadoVencendoEm30Dias && !certificadoVencido && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Aviso de Vencimento de Certificado:</span> O
                certificado digital desta empresa vence em {diasAteVencimentoCertificado} dia(s) (
                {certificadoValidade}). Renove e atualize na Focus NFe.
              </div>
            </div>
          )}

          {resultadoTeste && (
            <div
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm ${
                resultadoTeste.sucesso
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {resultadoTeste.sucesso ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="font-semibold">
                  {resultadoTeste.sucesso
                    ? 'Teste de Conexão: Conexão com a Focus NFe funcionando'
                    : 'Teste de Conexão: Falha na Comunicação'}
                </div>
                <div className="text-xs opacity-90">{resultadoTeste.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Grid Principal: Formulário + Painel Pronto para Emitir */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1 e 2: Parâmetros */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bloco 1: Provedor e Parâmetros Gerais de Integração */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Parâmetros de Integração Focus NFe
                </CardTitle>
                <CardDescription>
                  Configurações de ambiente e ativação da emissora para esta empresa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-lg border bg-slate-50/70">
                  <div className="space-y-0.5">
                    <Label htmlFor="emite_docs" className="font-semibold text-slate-800">
                      Emitir Documentos Fiscais nesta Empresa
                    </Label>
                    <p className="text-xs text-slate-500">
                      Se desativado, o ERP recusa tentativas de emissão e oculta os botões fiscais
                      nas telas desta empresa.
                    </p>
                  </div>
                  <Switch
                    id="emite_docs"
                    checked={emiteDocs}
                    onCheckedChange={setEmiteDocs}
                    disabled={semIeValida || !administrador}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="provedor">Provedor de Emissão</Label>
                    <Input id="provedor" value="Focus NFe" disabled className="bg-slate-50" />
                    <p className="text-xs text-muted-foreground">Provedor homologado na Etapa 6.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ambiente">Ambiente de Operação</Label>
                    <Select
                      value={ambiente}
                      onValueChange={(val: AmbienteFiscal) => handleAmbienteChange(val)}
                      disabled={!administrador}
                    >
                      <SelectTrigger id="ambiente">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Homologação">Homologação (Testes SEFAZ)</SelectItem>
                        <SelectItem value="Produção">Produção (Notas Reais)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Mudar para Produção exige confirmação expressa.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t">
                  <Label htmlFor="codigo_token">
                    Código do Token da Empresa (Sufixo do Segredo de Fallback)
                  </Label>
                  <Input
                    id="codigo_token"
                    placeholder="Ex: MATRIZ, LOJA01, ECOMMERCE (ou deixe vazio para token padrão)"
                    value={codigoToken}
                    onChange={(e) =>
                      setCodigoToken(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
                    }
                    disabled={!administrador}
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilizado como fallback caso a empresa não cadastre token próprio no banco logo
                    abaixo.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 1.1: Credenciais da Focus por Empresa (Prompt 9.6 - Administrador) */}
            {administrador && (
              <Card className="border-blue-200 bg-gradient-to-b from-blue-50/30 to-white shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 text-blue-950">
                        <KeyRound className="h-4 w-4 text-blue-600" />
                        Credenciais da Focus NFe por Empresa
                      </CardTitle>
                      <CardDescription>
                        Gerenciamento seguro de tokens da API Focus para{' '}
                        <span className="font-semibold text-slate-800">
                          {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}
                        </span>
                      </CardDescription>
                    </div>

                    {/* Origem efetiva */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Origem em uso:</span>
                      {credenciaisInfo?.origem_efetiva === 'banco' ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Banco de Dados (Próprio)
                        </Badge>
                      ) : credenciaisInfo?.origem_efetiva === 'segredo' ? (
                        <Badge className="bg-blue-600 text-white hover:bg-blue-700 text-xs gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Segredo do Sistema
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300 bg-amber-50 text-xs gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Não cadastrado
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Texto explicativo obrigatório do item 1 */}
                  <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-blue-700 flex-shrink-0" />
                      Privacidade e Segurança das Credenciais
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      Cada empresa usa o token da própria conta na Focus NFe. Por motivos de
                      segurança, o token gravado <strong>nunca volta para a tela</strong> (apenas os
                      últimos 4 dígitos são exibidos para conferência). Para alterar, digite uma
                      nova chave e clique em Salvar.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Token de Homologação */}
                    <div className="space-y-2 p-3.5 rounded-lg border bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="token_homologacao"
                          className="text-xs font-semibold text-slate-800"
                        >
                          Token de Homologação
                        </Label>
                        {/* Estado: não cadastrado, cadastrado (final XXXX) ou usando segredo */}
                        {credenciaisInfo?.token_final_homologacao ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-[11px]"
                          >
                            cadastrado (final {credenciaisInfo.token_final_homologacao})
                          </Badge>
                        ) : credenciaisInfo?.origem_efetiva === 'segredo' &&
                          ambiente === 'Homologação' ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-800 border-blue-300 text-[11px]"
                          >
                            usando o segredo do sistema
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-600 border-slate-300 text-[11px]"
                          >
                            não cadastrado
                          </Badge>
                        )}
                      </div>
                      <Input
                        id="token_homologacao"
                        type="password"
                        placeholder="Novo token de homologação..."
                        value={tokenHomologacaoInput}
                        onChange={(e) => setTokenHomologacaoInput(e.target.value)}
                        className="bg-white font-mono text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Ambiente SEFAZ Homologação. Notas sem validade fiscal.
                      </p>
                    </div>

                    {/* Token de Produção */}
                    <div className="space-y-2 p-3.5 rounded-lg border bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="token_producao"
                          className="text-xs font-semibold text-slate-800"
                        >
                          Token de Produção
                        </Label>
                        {/* Estado: não cadastrado, cadastrado (final XXXX) ou usando segredo */}
                        {credenciaisInfo?.token_final_producao ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-[11px]"
                          >
                            cadastrado (final {credenciaisInfo.token_final_producao})
                          </Badge>
                        ) : credenciaisInfo?.origem_efetiva === 'segredo' &&
                          ambiente === 'Produção' ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-800 border-blue-300 text-[11px]"
                          >
                            usando o segredo do sistema
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-600 border-slate-300 text-[11px]"
                          >
                            não cadastrado
                          </Badge>
                        )}
                      </div>
                      <Input
                        id="token_producao"
                        type="password"
                        placeholder="Novo token de produção..."
                        value={tokenProducaoInput}
                        onChange={(e) => setTokenProducaoInput(e.target.value)}
                        className="bg-white font-mono text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Ambiente SEFAZ Produção. Emissão com validade jurídica.
                      </p>
                    </div>
                  </div>

                  {/* Informações de status do Webhook da empresa */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border bg-white text-xs">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <span className="text-slate-700">Webhook nesta empresa:</span>
                      {credenciaisInfo?.webhook_registrado ? (
                        <Badge className="bg-emerald-600 text-white text-[11px]">
                          Registrado na Focus
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-slate-600 border-slate-300 text-[11px]"
                        >
                          Pendente / Não registrado
                        </Badge>
                      )}
                      {credenciaisInfo?.atualizado_em && (
                        <span className="text-slate-400 text-[10px]">
                          (Atualizado em:{' '}
                          {new Date(credenciaisInfo.atualizado_em).toLocaleString('pt-BR')})
                        </span>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegistrarWebhookAssinanteEmLote}
                      disabled={registrandoWebhookAssinanteState}
                      className="text-purple-700 border-purple-200 hover:bg-purple-50 text-xs h-8"
                    >
                      {registrandoWebhookAssinanteState ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Registrar para todas as empresas
                    </Button>
                  </div>

                  {/* Botões de Ação do Bloco de Credenciais */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestarCredenciais}
                      disabled={testandoCredenciais || carregando}
                      className="text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5"
                    >
                      {testandoCredenciais ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : (
                        <Activity className="h-4 w-4 text-blue-600" />
                      )}
                      Testar conexão
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSalvarCredenciais}
                      disabled={
                        salvandoCredenciais ||
                        (!tokenHomologacaoInput.trim() && !tokenProducaoInput.trim())
                      }
                      className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {salvandoCredenciais ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bloco 2: Séries e Regras Operacionais */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  Séries e Naturezas de Operação Padrão
                </CardTitle>
                <CardDescription>
                  Sequências fiscais e identificadores para NF-e e NFC-e
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="serie_nfe">Série Padrão NF-e (Modelo 55)</Label>
                    <Input
                      id="serie_nfe"
                      value={serieNfe}
                      onChange={(e) => setSerieNfe(e.target.value)}
                      placeholder="1"
                      disabled={!administrador}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="serie_nfce">Série Padrão NFC-e (Modelo 65)</Label>
                    <Input
                      id="serie_nfce"
                      value={serieNfce}
                      onChange={(e) => setSerieNfce(e.target.value)}
                      placeholder="1"
                      disabled={!administrador}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border bg-slate-50/70">
                  <div className="space-y-0.5">
                    <Label htmlFor="emite_nfce" className="font-semibold text-slate-800">
                      Emitir NFC-e (Modelo 65 - Varejo / PDV)
                    </Label>
                    <p className="text-xs text-slate-500">
                      Habilita esta loja física para emitir NFC-e no terminal de PDV. Mantenha
                      desligado para matriz ou lojas exclusivamente virtuais/NF-e.
                    </p>
                  </div>
                  <Switch
                    id="emite_nfce"
                    checked={emiteNfce}
                    onCheckedChange={setEmiteNfce}
                    disabled={semIeValida || !administrador}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="presenca_comprador">Presença do Comprador Padrão (NF-e)</Label>
                    <Select
                      value={presencaComprador}
                      onValueChange={(val: PresencaCompradorNfe) => setPresencaComprador(val)}
                      disabled={!administrador}
                    >
                      <SelectTrigger id="presenca_comprador">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 Presencial">1 Presencial (Loja física)</SelectItem>
                        <SelectItem value="2 Internet">
                          2 Internet (E-commerce / Virtual)
                        </SelectItem>
                        <SelectItem value="3 Teleatendimento">3 Teleatendimento</SelectItem>
                        <SelectItem value="4 Entrega em domicílio">
                          4 Entrega em domicílio
                        </SelectItem>
                        <SelectItem value="9 Outros">9 Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nat_venda">Natureza de Operação (Venda)</Label>
                    <Input
                      id="nat_venda"
                      value={naturezaVenda}
                      onChange={(e) => setNaturezaVenda(e.target.value)}
                      placeholder="Venda de mercadoria"
                      disabled={!administrador}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nat_dev_compra">Natureza (Devolução de Compra)</Label>
                    <Input
                      id="nat_dev_compra"
                      value={naturezaDevCompra}
                      onChange={(e) => setNaturezaDevCompra(e.target.value)}
                      placeholder="Devolução de compra"
                      disabled={!administrador}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nat_dev_venda">Natureza (Devolução de Venda)</Label>
                    <Input
                      id="nat_dev_venda"
                      value={naturezaDevVenda}
                      onChange={(e) => setNaturezaDevVenda(e.target.value)}
                      placeholder="Devolução de venda"
                      disabled={!administrador}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nat_transferencia">
                      Natureza (Transferência de Mercadoria)
                    </Label>
                    <Input
                      id="nat_transferencia"
                      value={naturezaTransferencia}
                      onChange={(e) => setNaturezaTransferencia(e.target.value)}
                      placeholder="Transferência de mercadoria"
                      disabled={!administrador}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50 mt-1">
                    <div className="space-y-0.5 pr-2">
                      <Label htmlFor="emitir_transf_auto" className="text-xs font-semibold">
                        Emitir NF-e ao Enviar Transferência
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Dispara a emissão de NF-e automaticamente ao mudar status para Enviada.
                      </p>
                    </div>
                    <Switch
                      id="emitir_transf_auto"
                      checked={emitirNfeAoEnviarTransferencia}
                      onCheckedChange={setEmitirNfeAoEnviarTransferencia}
                      disabled={!administrador}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="info_complementares">Informações Complementares Padrão</Label>
                  <Textarea
                    id="info_complementares"
                    rows={3}
                    placeholder="Ex: Documento emitido por ME ou EPP optante pelo Simples Nacional; Permite o aproveitamento do crédito de ICMS no valor de..."
                    value={infoComplementares}
                    onChange={(e) => setInfoComplementares(e.target.value)}
                    disabled={!administrador}
                  />
                  <p className="text-xs text-muted-foreground">
                    Texto que será adicionado automaticamente às informações complementares de todas
                    as notas fiscais emitidas por esta empresa.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 3: Opções Adicionais e Reforma Tributária */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Opções Adicionais, Certificado e CSC
                </CardTitle>
                <CardDescription>
                  Controle de validade de certificado e parâmetros do PDV
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cert_validade">Validade do Certificado Digital</Label>
                    <Input
                      id="cert_validade"
                      type="date"
                      value={certificadoValidade}
                      onChange={(e) => setCertificadoValidade(e.target.value)}
                      disabled={!administrador}
                    />
                    <p className="text-xs text-muted-foreground">
                      Informe para receber avisos preventivos de expiração (30 dias).
                    </p>
                  </div>

                  {emiteNfce ? (
                    <div className="flex flex-col justify-center space-y-2 p-3 rounded-lg border bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="csc_cfg" className="text-xs font-semibold">
                          CSC Configurado na Focus NFe
                        </Label>
                        <Switch
                          id="csc_cfg"
                          checked={cscConfigurado}
                          onCheckedChange={setCscConfigurado}
                          disabled={!administrador}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Marque após cadastrar o CSC e IdToken no painel da Focus.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border bg-slate-50/30 text-xs text-muted-foreground flex items-center">
                      NFC-e desativada para esta empresa. O aviso de CSC e emissão em PDV ficam
                      ocultos.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                  {emiteNfce && (
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                      <div className="space-y-0.5 pr-2">
                        <Label htmlFor="emitir_pdv_auto" className="text-xs font-semibold">
                          Emitir NFC-e Automaticamente no PDV
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Emite e imprime cupom fiscal imediatamente na finalização do caixa.
                        </p>
                      </div>
                      <Switch
                        id="emitir_pdv_auto"
                        checked={emitirNfceAutoPdv}
                        onCheckedChange={setEmitirNfceAutoPdv}
                        disabled={!administrador}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                    <div className="space-y-0.5 pr-2">
                      <Label htmlFor="email_cliente" className="text-xs font-semibold">
                        Enviar E-mail ao Cliente
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Focus NFe envia XML e DANFE diretamente para o e-mail do destinatário.
                      </p>
                    </div>
                    <Switch
                      id="email_cliente"
                      checked={enviarEmailCliente}
                      onCheckedChange={setEnviarEmailCliente}
                      disabled={!administrador}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-purple-200 bg-purple-50/40">
                  <div className="space-y-0.5 pr-2">
                    <Label htmlFor="ibs_cbs" className="text-xs font-semibold text-purple-900">
                      Destacar IBS e CBS (Reforma Tributária)
                    </Label>
                    <p className="text-[11px] text-purple-700">
                      Ative quando seu contador orientar o preenchimento das novas tags de
                      tributação da reforma tributária nacional.
                    </p>
                  </div>
                  <Switch
                    id="ibs_cbs"
                    checked={informarIbsCbs}
                    onCheckedChange={setInformarIbsCbs}
                    disabled={!administrador}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-blue-200 bg-blue-50/40">
                  <div className="space-y-0.5 pr-2">
                    <Label
                      htmlFor="difal_cons_final"
                      className="text-xs font-semibold text-blue-900"
                    >
                      Calcular DIFAL na Venda Interestadual a Consumidor Final
                    </Label>
                    <p className="text-[11px] text-blue-700">
                      Confirme com o contador. Empresa do Simples Nacional normalmente não recolhe o
                      DIFAL na venda ao consumidor de outro estado.
                    </p>
                  </div>
                  <Switch
                    id="difal_cons_final"
                    checked={calcularDifalConsumidorFinal}
                    onCheckedChange={setCalcularDifalConsumidorFinal}
                    disabled={!administrador}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna 3: Pronto para Emitir? */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Pronto para emitir?</span>
                  {prontoParaEmitir ? (
                    <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pronto
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-700 bg-amber-50 border-amber-200 gap-1 text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Incompleto
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Verificação cadastral obrigatória da empresa ativa perante a SEFAZ
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.cnpj ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">CNPJ Válido</span>
                    </div>
                    {!checklist.cnpj && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.inscricao_estadual ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">Inscrição Estadual (não ISENTO)</span>
                    </div>
                    {!checklist.inscricao_estadual && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.crt ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">CRT (Regime Tributário)</span>
                    </div>
                    {!checklist.crt && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.codigo_municipio_ibge ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">Cód. Município IBGE (7 dígitos)</span>
                    </div>
                    {!checklist.codigo_municipio_ibge && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.endereco_completo ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">Endereço Completo com CEP</span>
                    </div>
                    {!checklist.endereco_completo && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.cnae ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">CNAE Principal</span>
                    </div>
                    {!checklist.cnae && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md bg-slate-50 border">
                    <div className="flex items-center gap-2">
                      {checklist.email_fiscal ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">E-mail Fiscal Configurado</span>
                    </div>
                    {!checklist.email_fiscal && (
                      <Link
                        to={`/cadastros/empresas/${empresaAtiva?.id}`}
                        className="text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        Corrigir <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                  Todos os campos acima são validados estritamente pela SEFAZ na autorização de NF-e
                  e NFC-e. Dados divergentes geram rejeição imediata do lote.
                </div>
              </CardContent>
            </Card>

            {/* Informações da Focus NFe */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Painel Focus NFe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-600">
                <p>
                  A Focus NFe gerencia automaticamente a numeração sequencial das notas fiscais por
                  série.
                </p>
                <p>
                  Cadastre o certificado digital A1 (.pfx) e os tokens no painel oficial da Focus
                  NFe e registre o token gerado como segredo no Skip Cloud.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Seção "Avisos da Focus (Webhooks)" (só Administrador) */}
        {administrador && (
          <Card className="border-slate-200 shadow-xs mt-6">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Avisos da Focus (Webhooks)
                </CardTitle>
                <CardDescription className="text-xs">
                  Recebimento assíncrono instantâneo de autorização, rejeição e cancelamento de
                  NF-e/NFC-e diretamente da Focus NFe.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={carregarWebhooksFocus}
                  disabled={carregandoWebhooks}
                  className="gap-1 text-xs"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${carregandoWebhooks ? 'animate-spin' : ''}`}
                  />
                  Atualizar Lista
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegistrarWebhookEmpresa}
                  disabled={registrandoWebhook}
                  className="gap-1 text-xs"
                >
                  {registrandoWebhook ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Registrar na Focus (Empresa Ativa)
                </Button>
                <Button
                  size="sm"
                  onClick={handleRegistrarWebhookTodas}
                  disabled={registrandoWebhook}
                  className="gap-1 text-xs bg-primary hover:bg-primary/90 text-white"
                >
                  {registrandoWebhook ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5" />
                  )}
                  Registrar para Todas as Empresas
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {!segredoWebhookConfigurado && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-xs font-semibold">
                    Segredo FOCUS_NFE_WEBHOOK_SECRET não configurado no Skip Cloud
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    Para que o ERP receba avisos em tempo real da Focus NFe de forma segura, crie o
                    segredo <strong className="font-mono">FOCUS_NFE_WEBHOOK_SECRET</strong> no
                    painel de Segredos/Ambiente do Skip Cloud com um valor seguro de sua escolha.
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-md border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>
                    Webhooks Cadastrados na Focus NFe (
                    {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social})
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Endpoint ERP:{' '}
                    <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[10px]">
                      https://erp-de-gestao-comercial-24560.goskip.app/backend/v1/fiscal/webhook-focus
                    </code>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px] border-b">
                      <tr>
                        <th className="py-2 px-4">Evento</th>
                        <th className="py-2 px-3">URL do Webhook</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Cadastrado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {carregandoWebhooks ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Consultando webhooks na Focus NFe...</span>
                            </div>
                          </td>
                        </tr>
                      ) : webhooksFocus.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400">
                            Nenhum webhook registrado na Focus NFe para esta empresa. Clique em
                            "Registrar na Focus" acima.
                          </td>
                        </tr>
                      ) : (
                        webhooksFocus.map((h, idx) => (
                          <tr key={h.id || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-800">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {h.event || 'nfe'}
                              </Badge>
                            </td>
                            <td
                              className="py-2.5 px-3 font-mono text-[11px] text-slate-700 max-w-md truncate"
                              title={h.url || ''}
                            >
                              {h.url || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge className="bg-emerald-600 text-white text-[10px] py-0">
                                {h.status || 'Ativo'}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">
                              {h.created_at
                                ? new Date(h.created_at).toLocaleDateString('pt-BR')
                                : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quadro "Empresas Emissoras" (só Administrador) */}
        {administrador && (
          <Card className="border-slate-200 shadow-xs mt-6">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Empresas Emissoras do Grupo
                </CardTitle>
                <CardDescription>
                  Visão consolidada de todas as empresas cadastradas, tokens e status de emissão.
                  Clique em qualquer linha para abrir e editar a configuração daquela empresa.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={carregarQuadroGeralEmpresas}
                className="gap-1 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-t text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Empresa</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">CNPJ</th>
                      <th className="py-2.5 px-3">Código Token</th>
                      <th className="py-2.5 px-3 text-center">Configurada</th>
                      <th className="py-2.5 px-3 text-center">Segredo Cloud</th>
                      <th className="py-2.5 px-3">Ambiente</th>
                      <th className="py-2.5 px-4">Último Teste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {empresas.map((emp) => {
                      const cfg = configsTodas.find((c) => c.empresa_id === emp.id)
                      const segInfo = segredosStatus[emp.id]
                      const ie = (emp.inscricao_estadual || '').trim().toUpperCase()
                      const naoEmite = !cfg?.emite_documentos_fiscais || !ie || ie === 'ISENTO'
                      const selecionada = emp.id === empresaAtiva?.id

                      return (
                        <tr
                          key={emp.id}
                          onClick={() => selecionarEmpresa(emp.id)}
                          className={`cursor-pointer transition-colors ${
                            selecionada
                              ? 'bg-blue-50/80 font-medium'
                              : naoEmite
                                ? 'bg-slate-50/50 text-slate-400 hover:bg-slate-100/70'
                                : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-semibold ${
                                  selecionada
                                    ? 'text-blue-900'
                                    : naoEmite
                                      ? 'text-slate-400'
                                      : 'text-slate-800'
                                }`}
                              >
                                {emp.nome_fantasia || emp.razao_social}
                              </span>
                              {selecionada && (
                                <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0 font-normal">
                                  Ativa
                                </Badge>
                              )}
                              {naoEmite && (
                                <Badge
                                  variant="outline"
                                  className="text-slate-400 border-slate-200 bg-slate-100 text-[9px] px-1.5 py-0 font-normal"
                                >
                                  Não emite
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="capitalize">{emp.tipo}</span>
                          </td>
                          <td className="py-3 px-3 font-mono">{emp.cnpj}</td>
                          <td className="py-3 px-3 font-mono">
                            {cfg?.codigo_token || (
                              <span className="text-slate-400 italic">(Padrão)</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {cfg ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                              >
                                Sim
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]"
                              >
                                Não
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {segInfo?.segredo_configurado ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                              >
                                Encontrado
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                                title={segInfo?.segredo_nome || 'Segredo ausente'}
                              >
                                Ausente
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                cfg?.ambiente === 'Produção'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {cfg?.ambiente || 'Homologação'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {cfg?.ultimo_teste_conexao_data ? (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                {cfg.ultimo_teste_conexao_sucesso ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                )}
                                <span
                                  className="truncate max-w-[200px]"
                                  title={cfg.ultimo_teste_conexao_mensagem || ''}
                                >
                                  {cfg.ultimo_teste_conexao_mensagem || 'OK'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Nunca testado</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modal de confirmação: Troca para PRODUÇÃO */}
        <Dialog open={modalProducaoAberto} onOpenChange={setModalProducaoAberto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-5 w-5" />
                Atenção: Ativar Ambiente de Produção
              </DialogTitle>
              <DialogDescription className="text-slate-600 leading-relaxed pt-2">
                Você está prestes a ativar o <strong>Ambiente de PRODUÇÃO</strong> para a empresa{' '}
                <strong>{empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}</strong>.
                <br />
                <br />
                A partir de agora, qualquer documento emitido (NF-e ou NFC-e) terá{' '}
                <strong>validade jurídica e fiscal definitiva perante a SEFAZ</strong>, gerando
                obrigações tributárias reais.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <Label htmlFor="confirma_prod" className="text-xs font-semibold text-slate-700">
                Para confirmar a alteração, digite <span className="text-red-600">PRODUÇÃO</span>{' '}
                abaixo:
              </Label>
              <Input
                id="confirma_prod"
                placeholder="PRODUÇÃO"
                value={textoConfirmacaoProducao}
                onChange={(e) => setTextoConfirmacaoProducao(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setModalProducaoAberto(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmarMudancaParaProducao}
                disabled={textoConfirmacaoProducao.trim().toUpperCase() !== 'PRODUÇÃO'}
              >
                Confirmar Produção
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Cópia de Configuração de Outra Empresa */}
        <Dialog open={modalCopiarAberto} onOpenChange={setModalCopiarAberto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-primary" />
                Copiar Configuração Fiscal
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-xs leading-relaxed pt-1">
                Importa séries, naturezas de operação, informações complementares e opções de outra
                empresa do grupo para{' '}
                <strong>{empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}</strong>.
                <br />
                <br />
                <strong>Atenção:</strong> O código de token e as datas do certificado{' '}
                <span className="text-red-600 font-semibold">NÃO são copiados</span> para evitar
                conflitos fiscais.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label htmlFor="empresa_origem">Selecione a empresa de origem</Label>
              <Select value={empresaOrigemId} onValueChange={setEmpresaOrigemId}>
                <SelectTrigger id="empresa_origem">
                  <SelectValue placeholder="Escolha a empresa modelo" />
                </SelectTrigger>
                <SelectContent>
                  {empresas
                    .filter((e) => e.id !== empresaAtiva?.id)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social} ({e.tipo})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setModalCopiarAberto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCopiarConfiguracao}
                disabled={!empresaOrigemId || copiando}
                className="gap-2"
              >
                {copiando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copiar Agora
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissaoGuard>
  )
}

export default ConfiguracaoEmissaoFiscalPage
