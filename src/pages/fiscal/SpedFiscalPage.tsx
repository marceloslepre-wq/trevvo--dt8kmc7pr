import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet,
  Download,
  Printer,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  HelpCircle,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldAlert,
  TrendingUp,
  FileCheck2,
  Plus,
  Trash2,
  Sliders,
  DollarSign,
  Scale,
  MapPin,
} from 'lucide-react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  listarArquivosSped,
  gerarArquivoSped,
  marcarSpedEntregue,
  obterUrlDownloadSped,
  listarAjustesApuracao,
  salvarAjusteApuracao,
  excluirAjusteApuracao,
  SpedArquivoRegistro,
  SpedAjusteApuracao,
  SpedModo,
  SpedStatus,
} from '@/services/configSped'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'

// Helper para calcular o mês anterior no formato "AAAA-MM"
function obterMesAnteriorPadrao(): string {
  const d = new Date()
  d.setDate(1) // Garante que não pule mês em dias como dia 31
  d.setMonth(d.getMonth() - 1)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}`
}

function formatarDataHora(iso?: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (_) {
    return iso
  }
}

function renderStatusBadge(status: SpedStatus) {
  switch (status) {
    case 'Gerado':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-medium">
          <CheckCircle2 size={13} className="mr-1" /> Gerado
        </Badge>
      )
    case 'Gerado com erros':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 font-medium">
          <AlertTriangle size={13} className="mr-1" /> Gerado com erros
        </Badge>
      )
    case 'Gerando':
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 font-medium animate-pulse">
          <Clock size={13} className="mr-1 animate-spin" /> Gerando...
        </Badge>
      )
    case 'Erro':
      return (
        <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 font-medium">
          <XCircle size={13} className="mr-1" /> Erro
        </Badge>
      )
    case 'Substituído':
      return (
        <Badge variant="outline" className="text-slate-500 border-slate-300 font-normal">
          Substituído
        </Badge>
      )
    case 'Entregue':
      return (
        <Badge className="bg-blue-600 text-white font-medium">
          <CheckCircle2 size={13} className="mr-1" /> Entregue
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export const SpedFiscalPage: React.FC = () => {
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, administrador } = usePermissoes()

  // Permissão de acesso ao módulo Fiscal / SPED
  const temPermissaoVer = administrador || pode('sped', 'ver') || pode('notas_saida', 'ver')

  const [periodo, setPeriodo] = useState<string>(obterMesAnteriorPadrao())
  const [modo, setModo] = useState<SpedModo>('Teste')
  const [gerando, setGerando] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [arquivos, setArquivos] = useState<SpedArquivoRegistro[]>([])
  const [arquivoSelecionado, setArquivoSelecionado] = useState<SpedArquivoRegistro | null>(null)
  const [modalValidacoesAberto, setModalValidacoesAberto] = useState(false)

  // Aba principal: "arquivos" ou "ajustes"
  const [abaAtiva, setAbaAtiva] = useState<'arquivos' | 'ajustes'>('arquivos')

  // Ajustes da apuração
  const [ajustes, setAjustes] = useState<SpedAjusteApuracao[]>([])
  const [carregandoAjustes, setCarregandoAjustes] = useState(false)
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)
  const [excluindoAjusteId, setExcluindoAjusteId] = useState<string | null>(null)
  const [modalNovoAjusteAberto, setModalNovoAjusteAberto] = useState(false)
  const [ajusteEdicao, setAjusteEdicao] = useState<Partial<SpedAjusteApuracao> | null>(null)

  // Modal de Confirmação de Retificadora (Prompt 7.6a - Item C1)
  const [modalConfirmarRetificadoraAberto, setModalConfirmarRetificadoraAberto] = useState(false)

  // Modal de Marcar como Entregue (Prompt 7.6a - Item C2)
  const [modalEntregueAberto, setModalEntregueAberto] = useState(false)
  const [arquivoParaEntregar, setArquivoParaEntregar] = useState<SpedArquivoRegistro | null>(null)
  const [formReciboEntrega, setFormReciboEntrega] = useState('')
  const [formDataEntrega, setFormDataEntrega] = useState(
    () => new Date().toISOString().split('T')[0],
  )
  const [formObservacoesEntrega, setFormObservacoesEntrega] = useState('')
  const [marcandoEntregue, setMarcandoEntregue] = useState(false)

  // Campos do formulário de ajuste
  const [formCodigoAjuste, setFormCodigoAjuste] = useState('')
  const [formDescricaoCompl, setFormDescricaoCompl] = useState('')
  const [formValor, setFormValor] = useState('')

  const carregarArquivos = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregandoLista(true)
    try {
      const lista = await listarArquivosSped(empresaAtiva.id)
      setArquivos(lista)

      // Atualiza o arquivo selecionado se ele estiver na lista
      if (arquivoSelecionado) {
        const atualizado = lista.find((a) => a.id === arquivoSelecionado.id)
        if (atualizado) setArquivoSelecionado(atualizado)
      } else if (lista.length > 0) {
        setArquivoSelecionado(lista[0])
      }
    } catch (err: any) {
      console.error('Erro ao listar arquivos SPED:', err)
      toast({
        title: 'Erro ao carregar histórico',
        description: err.message || 'Não foi possível buscar os arquivos SPED gerados.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoLista(false)
    }
  }, [empresaAtiva?.id, arquivoSelecionado])

  const carregarAjustes = useCallback(async () => {
    if (!empresaAtiva?.id || !periodo) return
    setCarregandoAjustes(true)
    try {
      const lista = await listarAjustesApuracao(empresaAtiva.id, periodo)
      setAjustes(lista)
    } catch (err: any) {
      console.error('Erro ao listar ajustes:', err)
      toast({
        title: 'Erro ao carregar ajustes',
        description: err.message || 'Não foi possível carregar os ajustes da apuração.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoAjustes(false)
    }
  }, [empresaAtiva?.id, periodo])

  useEffect(() => {
    carregarArquivos()
  }, [empresaAtiva?.id])

  useEffect(() => {
    if (abaAtiva === 'ajustes') {
      carregarAjustes()
    }
  }, [abaAtiva, empresaAtiva?.id, periodo, carregarAjustes])

  // Verifica se o período atual possui arquivo Oficial com status "Entregue"
  const periodoBloqueadoEntregue = useMemo(() => {
    return arquivos.some(
      (a) => a.periodo === periodo && a.modo === 'Oficial' && a.status === 'Entregue',
    )
  }, [arquivos, periodo])

  const abrirModalNovoAjuste = () => {
    setAjusteEdicao(null)
    setFormCodigoAjuste('')
    setFormDescricaoCompl('')
    setFormValor('')
    setModalNovoAjusteAberto(true)
  }

  const abrirModalEditarAjuste = (aj: SpedAjusteApuracao) => {
    setAjusteEdicao(aj)
    setFormCodigoAjuste(aj.codigo_ajuste)
    setFormDescricaoCompl(aj.descricao_complementar || '')
    setFormValor(String(aj.valor))
    setModalNovoAjusteAberto(true)
  }

  const handleSalvarAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresaAtiva?.id) return
    if (!administrador) {
      toast({
        title: 'Ação restrita',
        description: 'Apenas administradores podem cadastrar ou editar ajustes da apuração.',
        variant: 'destructive',
      })
      return
    }

    if (periodoBloqueadoEntregue) {
      toast({
        title: 'Período bloqueado',
        description:
          'Não é possível alterar ajustes: o período possui arquivo SPED Oficial já Entregue.',
        variant: 'destructive',
      })
      return
    }

    const codLimpo = formCodigoAjuste.trim().toUpperCase()
    if (!codLimpo || codLimpo.length !== 8) {
      toast({
        title: 'Código de ajuste inválido',
        description:
          'O código do ajuste deve ter exatamente 8 caracteres (ex: ES000001, COMPETE-ES).',
        variant: 'destructive',
      })
      return
    }

    const valNum = parseFloat(formValor.replace(',', '.'))
    if (isNaN(valNum) || valNum <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor numérico positivo para o ajuste.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoAjuste(true)
    try {
      await salvarAjusteApuracao({
        id: ajusteEdicao?.id,
        empresa_id: empresaAtiva.id,
        periodo,
        codigo_ajuste: codLimpo,
        descricao_complementar: formDescricaoCompl.trim(),
        valor: valNum,
      })

      toast({
        title: 'Ajuste gravado com sucesso',
        description: `Código ${codLimpo} atualizado para o período ${periodo}.`,
        className: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      })

      setModalNovoAjusteAberto(false)
      carregarAjustes()
    } catch (err: any) {
      console.error('Falha ao salvar ajuste:', err)
      toast({
        title: 'Erro ao salvar ajuste',
        description: err.message || 'Falha ao registrar ajuste da apuração.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoAjuste(false)
    }
  }

  const handleExcluirAjuste = async (id: string) => {
    if (!administrador) {
      toast({
        title: 'Ação restrita',
        description: 'Apenas administradores podem excluir ajustes da apuração.',
        variant: 'destructive',
      })
      return
    }

    if (periodoBloqueadoEntregue) {
      toast({
        title: 'Período bloqueado',
        description:
          'Não é possível excluir ajustes: o período possui arquivo SPED Oficial já Entregue.',
        variant: 'destructive',
      })
      return
    }

    if (!confirm('Deseja realmente excluir este ajuste da apuração?')) return

    setExcluindoAjusteId(id)
    try {
      await excluirAjusteApuracao(id)
      toast({
        title: 'Ajuste excluído',
        description: 'O ajuste foi removido da apuração do período.',
      })
      carregarAjustes()
    } catch (err: any) {
      console.error('Falha ao excluir ajuste:', err)
      toast({
        title: 'Erro ao excluir ajuste',
        description: err.message || 'Falha ao remover o ajuste.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoAjusteId(null)
    }
  }

  const dispararGeracaoSped = async () => {
    if (!empresaAtiva?.id) return
    setGerando(true)
    try {
      const resp = await gerarArquivoSped({
        empresa_id: empresaAtiva.id,
        periodo,
        modo,
      })

      if (resp.status === 'Erro') {
        toast({
          title: 'Não foi possível gerar no modo Oficial',
          description: resp.message || 'Verifique as pendências da empresa.',
          variant: 'destructive',
        })
      } else if (resp.status === 'Gerado com erros') {
        toast({
          title: 'Arquivo gerado com validações',
          description: `O arquivo foi gerado com ${resp.total_validacoes || 0} aviso(s)/erro(s). O arquivo continua disponível para conferência.`,
          className: 'bg-amber-50 border-amber-300 text-amber-900',
        })
      } else {
        toast({
          title: 'Arquivo SPED gerado com sucesso!',
          description: `${resp.nome_arquivo || 'SPED Fiscal'} (${resp.quantidade_linhas || 0} linhas).`,
          className: 'bg-emerald-50 border-emerald-300 text-emerald-900',
        })
      }

      await carregarArquivos()
    } catch (err: any) {
      console.error('Falha ao gerar SPED Fiscal:', err)
      toast({
        title: 'Erro na geração do SPED',
        description: err.message || 'Ocorreu um erro ao processar o arquivo.',
        variant: 'destructive',
      })
    } finally {
      setGerando(false)
      setModalConfirmarRetificadoraAberto(false)
    }
  }

  const handleGerarSped = async () => {
    if (!empresaAtiva?.id) {
      toast({
        title: 'Nenhuma empresa selecionada',
        description: 'Selecione uma empresa ativa para gerar o SPED Fiscal.',
        variant: 'destructive',
      })
      return
    }

    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      toast({
        title: 'Período inválido',
        description: 'Informe o mês no formato AAAA-MM (exemplo: 2025-01).',
        variant: 'destructive',
      })
      return
    }

    // Regra C1 (Prompt 7.6a): Se modo Oficial de período que já tem arquivo Oficial Entregue,
    // verifica antes e pede confirmação com a mensagem do usuário
    if (modo === 'Oficial' && periodoBloqueadoEntregue) {
      setModalConfirmarRetificadoraAberto(true)
      return
    }

    await dispararGeracaoSped()
  }

  const abrirModalMarcarEntregue = (arq: SpedArquivoRegistro) => {
    if (!administrador) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas administradores podem marcar arquivos SPED como entregues.',
        variant: 'destructive',
      })
      return
    }

    setArquivoParaEntregar(arq)
    setFormReciboEntrega('')
    setFormDataEntrega(new Date().toISOString().split('T')[0])
    setFormObservacoesEntrega('')
    setModalEntregueAberto(true)
  }

  const handleSalvarMarcarEntregue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!arquivoParaEntregar?.id) return

    if (!administrador) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas administradores podem marcar arquivos SPED como entregues.',
        variant: 'destructive',
      })
      return
    }

    const recibo = formReciboEntrega.trim()
    if (!recibo) {
      toast({
        title: 'Recibo obrigatório',
        description: 'Informe o número do recibo de entrega gerado pelo PVA.',
        variant: 'destructive',
      })
      return
    }

    setMarcandoEntregue(true)
    try {
      await marcarSpedEntregue({
        arquivo_id: arquivoParaEntregar.id,
        recibo_entrega: recibo,
        entregue_em: formDataEntrega ? `${formDataEntrega} 12:00:00` : undefined,
        observacoes: formObservacoesEntrega.trim() || undefined,
      })

      toast({
        title: 'Arquivo marcado como Entregue',
        description: `O arquivo ${arquivoParaEntregar.nome_arquivo || ''} foi registrado como Entregue com o recibo ${recibo}.`,
        className: 'bg-emerald-50 border-emerald-300 text-emerald-900',
      })

      setModalEntregueAberto(false)
      setArquivoParaEntregar(null)
      await carregarArquivos()
    } catch (err: any) {
      console.error('Falha ao marcar como entregue:', err)
      toast({
        title: 'Erro ao marcar entrega',
        description: err.message || 'Não foi possível registrar a entrega do arquivo.',
        variant: 'destructive',
      })
    } finally {
      setMarcandoEntregue(false)
    }
  }

  const handleBaixarArquivo = (arq: SpedArquivoRegistro) => {
    const url = obterUrlDownloadSped(arq)
    if (!url) {
      toast({
        title: 'Arquivo não disponível',
        description: 'Este registro não possui arquivo .txt anexado.',
        variant: 'destructive',
      })
      return
    }

    const a = document.createElement('a')
    a.href = url
    a.download = arq.nome_arquivo || `SPED_${arq.periodo}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const abrirModalValidacoes = (arq: SpedArquivoRegistro) => {
    setArquivoSelecionado(arq)
    setModalValidacoesAberto(true)
  }

  // Estatísticas do arquivo selecionado
  const contagemItens = useMemo(() => {
    if (!arquivoSelecionado?.contagem_registros) return []
    return Object.entries(arquivoSelecionado.contagem_registros).sort(([a], [b]) =>
      a.localeCompare(b),
    )
  }, [arquivoSelecionado])

  if (!temPermissaoVer) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Acesso Restrito</AlertTitle>
          <AlertDescription>
            Você não possui permissão para acessar o módulo do SPED Fiscal. Solicite acesso ao
            administrador do ERP.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                SPED Fiscal (EFD ICMS/IPI)
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Geração da escrituração digital em formato oficial PVA para a empresa ativa.
              </p>
            </div>
          </div>
        </div>

        {empresaAtiva && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <Building2 size={15} className="text-slate-600 flex-shrink-0" />
            <div className="truncate max-w-[220px]">
              <span className="font-semibold text-slate-800">
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </span>
              <span className="text-slate-500 ml-1">({empresaAtiva.cnpj || 'Sem CNPJ'})</span>
            </div>
          </div>
        )}
      </div>

      {/* Abas Superiores: Arquivos e Ajustes da Apuração */}
      <Tabs
        value={abaAtiva}
        onValueChange={(v) => setAbaAtiva(v as 'arquivos' | 'ajustes')}
        className="space-y-4"
      >
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger value="arquivos" className="text-xs sm:text-sm font-medium gap-2">
            <FileSpreadsheet size={15} />
            Arquivos SPED Fiscal
          </TabsTrigger>
          <TabsTrigger value="ajustes" className="text-xs sm:text-sm font-medium gap-2">
            <Sliders size={15} />
            Ajustes da apuração ({periodo})
            {ajustes.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {ajustes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arquivos" className="space-y-6 m-0">
          {/* Bloco de Ação: Parâmetros e Geração */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar size={18} className="text-blue-600" />
                Gerar Novo Arquivo SPED
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione o mês de referência e o modo de validação. O arquivo será montado com os
                Blocos 0, C, E (Apuração ICMS e DIFAL) e 9 e as aberturas/fechamentos regulamentares
                da EFD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                <div className="sm:col-span-4 space-y-1.5">
                  <Label htmlFor="periodo-sped" className="text-xs font-semibold text-slate-700">
                    Mês de Apuração (AAAA-MM)
                  </Label>
                  <Input
                    id="periodo-sped"
                    type="month"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="sm:col-span-4 space-y-1.5">
                  <Label htmlFor="modo-sped" className="text-xs font-semibold text-slate-700">
                    Modo de Geração
                  </Label>
                  <Select value={modo} onValueChange={(val) => setModo(val as SpedModo)}>
                    <SelectTrigger id="modo-sped" className="h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Teste">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Modo Teste</span>
                          <span className="text-xs text-slate-400">(Auditoria prévia)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Oficial">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-blue-700">Modo Oficial</span>
                          <span className="text-xs text-slate-400">(Exige IE numérica)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-4">
                  <Button
                    onClick={handleGerarSped}
                    disabled={gerando || !empresaAtiva}
                    className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                  >
                    {gerando ? (
                      <>
                        <RotateCw size={16} className="mr-2 animate-spin" />
                        Gerando arquivo...
                      </>
                    ) : (
                      <>
                        <Play size={16} className="mr-2" />
                        Gerar arquivo SPED
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                <HelpCircle size={15} className="text-blue-500 flex-shrink-0" />
                <span>
                  <strong>Modo Oficial:</strong> valida IE e grava o arquivo oficial para o PVA da
                  Receita Federal. <strong>Substituição:</strong> arquivos anteriores do mesmo
                  período e modo passam para o status <em>Substituído</em> automaticamente (exceto
                  se já marcados como Entregue).
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Histórico e Arquivo Selecionado */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Lista de Arquivos */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-slate-200 shadow-xs">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <FileText size={18} className="text-slate-700" />
                      Arquivos Gerados
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Histórico de arquivos gerados para {empresaAtiva?.razao_social || 'a empresa'}
                      .
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={carregarArquivos}
                    disabled={carregandoLista}
                    title="Atualizar lista"
                    className="h-8 px-2.5 text-xs text-slate-600"
                  >
                    <RotateCw size={14} className={carregandoLista ? 'animate-spin' : ''} />
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {carregandoLista && arquivos.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                      <RotateCw size={24} className="animate-spin text-blue-600" />
                      Carregando arquivos SPED...
                    </div>
                  ) : arquivos.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      <FileSpreadsheet size={36} className="mx-auto text-slate-300 mb-2" />
                      Nenhum arquivo SPED gerado para esta filial ainda.
                      <p className="text-xs text-slate-400 mt-1">
                        Selecione o período acima e clique em &quot;Gerar arquivo SPED&quot;.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                      {arquivos.map((arq) => {
                        const isSelected = arquivoSelecionado?.id === arq.id
                        const temArquivo = Boolean(arq.arquivo)
                        const qtdErros = (arq.validacoes || []).filter(
                          (v) => v.nivel === 'erro',
                        ).length
                        const qtdAvisos = (arq.validacoes || []).filter(
                          (v) => v.nivel === 'aviso',
                        ).length

                        return (
                          <div
                            key={arq.id}
                            onClick={() => setArquivoSelecionado(arq)}
                            className={`p-3.5 sm:p-4 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                                : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900">
                                  {arq.periodo}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 font-semibold ${
                                    arq.modo === 'Oficial'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {arq.modo}
                                </Badge>
                                {renderStatusBadge(arq.status)}
                              </div>

                              <div className="text-xs text-slate-500 truncate font-mono">
                                {arq.nome_arquivo || 'Sem nome de arquivo'}
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                <span>Linhas: {arq.quantidade_linhas || 0}</span>
                                <span>•</span>
                                <span>Gerado em: {formatarDataHora(arq.created)}</span>
                                {(qtdErros > 0 || qtdAvisos > 0) && (
                                  <>
                                    <span>•</span>
                                    <span
                                      className={
                                        qtdErros > 0
                                          ? 'text-rose-600 font-semibold'
                                          : 'text-amber-600'
                                      }
                                    >
                                      {qtdErros > 0 && `${qtdErros} erro(s)`}
                                      {qtdErros > 0 && qtdAvisos > 0 && ', '}
                                      {qtdAvisos > 0 && `${qtdAvisos} aviso(s)`}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:self-center">
                              {/* Botão Marcar como entregue na linha (Item C2) */}
                              {administrador &&
                                arq.modo === 'Oficial' &&
                                (arq.status === 'Gerado' || arq.status === 'Gerado com erros') && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      abrirModalMarcarEntregue(arq)
                                    }}
                                    className="h-8 px-2.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300"
                                    title="Marcar este arquivo oficial como entregue no PVA"
                                  >
                                    <CheckCircle2 size={13} className="mr-1 text-emerald-600" />
                                    Entregue
                                  </Button>
                                )}

                              {temArquivo && arq.status !== 'Erro' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleBaixarArquivo(arq)
                                  }}
                                  className="h-8 px-2.5 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
                                >
                                  <Download size={14} className="mr-1" />
                                  Baixar
                                </Button>
                              )}
                              <ChevronRight size={16} className="text-slate-400 hidden sm:block" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detalhe do Arquivo Selecionado */}
            <div className="lg:col-span-5 space-y-4">
              {arquivoSelecionado ? (
                <Card className="border-slate-200 shadow-xs">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Detalhes do Arquivo
                        </CardTitle>
                        <CardDescription className="text-xs font-mono truncate max-w-[260px]">
                          {arquivoSelecionado.nome_arquivo}
                        </CardDescription>
                      </div>
                      {renderStatusBadge(arquivoSelecionado.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Ações principais */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => handleBaixarArquivo(arquivoSelecionado)}
                        disabled={
                          !arquivoSelecionado.arquivo || arquivoSelecionado.status === 'Erro'
                        }
                        className="flex-1 min-w-[140px] h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                      >
                        <Download size={15} className="mr-1.5" />
                        Baixar Arquivo .txt
                      </Button>

                      {/* Botão Relatório de conferência */}
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/fiscal/sped/${arquivoSelecionado.id}/relatorio`)}
                        className="h-9 text-xs border-blue-300 text-blue-800 bg-blue-50/70 hover:bg-blue-100"
                      >
                        <Printer size={14} className="mr-1.5 text-blue-700" />
                        Relatório de conferência
                      </Button>

                      {/* Botão Marcar como entregue (Prompt 7.6a - Item C2):
                          visível somente para arquivo Oficial com status Gerado (ou Gerado com erros)
                          e somente para Administrador; modo Teste nunca mostra */}
                      {administrador &&
                        arquivoSelecionado.modo === 'Oficial' &&
                        (arquivoSelecionado.status === 'Gerado' ||
                          arquivoSelecionado.status === 'Gerado com erros') && (
                          <Button
                            variant="outline"
                            onClick={() => abrirModalMarcarEntregue(arquivoSelecionado)}
                            className="h-9 text-xs border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                          >
                            <CheckCircle2 size={14} className="mr-1.5 text-emerald-600" />
                            Marcar como entregue
                          </Button>
                        )}

                      {(arquivoSelecionado.validacoes?.length || 0) > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => abrirModalValidacoes(arquivoSelecionado)}
                          className="h-9 text-xs border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                        >
                          <AlertTriangle size={14} className="mr-1 text-amber-600" />
                          Ver Inconsistências ({arquivoSelecionado.validacoes?.length})
                        </Button>
                      )}
                    </div>

                    {/* Tabela de Propriedades */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Período:</span>
                        <span className="font-semibold text-slate-800">
                          {arquivoSelecionado.periodo}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Modo:</span>
                        <span className="font-medium text-slate-800">
                          {arquivoSelecionado.modo}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Total de Linhas:</span>
                        <span className="font-semibold text-slate-800">
                          {arquivoSelecionado.quantidade_linhas || 0}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-500">Data de Geração:</span>
                        <span className="text-slate-800">
                          {formatarDataHora(arquivoSelecionado.created)}
                        </span>
                      </div>
                      {arquivoSelecionado.recibo_entrega && (
                        <div className="flex justify-between py-1 border-b border-slate-200/60 bg-blue-50/60 -mx-1 px-1 rounded">
                          <span className="text-blue-700 font-semibold">Recibo de Entrega:</span>
                          <span className="font-mono text-blue-900 font-semibold">
                            {arquivoSelecionado.recibo_entrega}
                          </span>
                        </div>
                      )}
                      {arquivoSelecionado.entregue_em && (
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500">Entregue em:</span>
                          <span className="text-slate-800">
                            {formatarDataHora(arquivoSelecionado.entregue_em)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quadro "Saídas do período" */}
                    {arquivoSelecionado.resumo_saida ? (
                      <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                            <TrendingUp size={14} className="text-blue-700" />
                            Saídas do período
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-white border-blue-200 text-blue-800"
                          >
                            Bloco C (Emissão Própria)
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                          <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                            <span className="text-[10px] text-slate-500 block uppercase font-medium">
                              NF-e (55)
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                              {arquivoSelecionado.resumo_saida.total_nfe || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                            <span className="text-[10px] text-slate-500 block uppercase font-medium">
                              NFC-e (65)
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                              {arquivoSelecionado.resumo_saida.total_nfce || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                            <span className="text-[10px] text-amber-700 block uppercase font-medium">
                              Canceladas
                            </span>
                            <span className="text-sm font-bold text-amber-900">
                              {arquivoSelecionado.resumo_saida.total_canceladas || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                            <span className="text-[10px] text-rose-700 block uppercase font-medium">
                              Denegadas
                            </span>
                            <span className="text-sm font-bold text-rose-900">
                              {arquivoSelecionado.resumo_saida.total_denegadas || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs col-span-2 sm:col-span-1">
                            <span className="text-[10px] text-slate-600 block uppercase font-medium">
                              Inutilizadas
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                              {arquivoSelecionado.resumo_saida.total_inutilizadas || 0}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs flex flex-col justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">
                              Total do VL_DOC
                            </span>
                            <span className="text-base font-bold text-slate-900">
                              {(arquivoSelecionado.resumo_saida.total_vl_doc || 0).toLocaleString(
                                'pt-BR',
                                {
                                  style: 'currency',
                                  currency: 'BRL',
                                },
                              )}
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs flex flex-col justify-between">
                            <span className="text-[11px] text-blue-700 font-medium">
                              Total do ICMS
                            </span>
                            <span className="text-base font-bold text-blue-900">
                              {(arquivoSelecionado.resumo_saida.total_vl_icms || 0).toLocaleString(
                                'pt-BR',
                                {
                                  style: 'currency',
                                  currency: 'BRL',
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Entradas do período (Bloco C - Prompt 7.3) */}
                    {arquivoSelecionado.resumo_entrada ? (
                      <div className="space-y-2 p-3 bg-emerald-50/70 rounded-lg border border-emerald-200">
                        <div className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <FileCheck2 size={14} className="text-emerald-700" />
                            Entradas do período
                          </span>
                          <span className="text-[11px] text-emerald-700 font-normal">
                            Bloco C (Compras e Transferências)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                            <span className="text-[10px] text-slate-500 block uppercase font-medium">
                              Notas de Compra
                            </span>
                            <span className="text-base font-bold text-slate-800">
                              {arquivoSelecionado.resumo_entrada.total_compras || 0}
                            </span>
                          </div>
                          <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                            <span className="text-[10px] text-slate-500 block uppercase font-medium">
                              Transferências Recebidas
                            </span>
                            <span className="text-base font-bold text-slate-800">
                              {arquivoSelecionado.resumo_entrada.total_transferencias || 0}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-2xs flex flex-col justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">
                              Total do VL_DOC
                            </span>
                            <span className="text-base font-bold text-slate-900">
                              {(arquivoSelecionado.resumo_entrada.total_vl_doc || 0).toLocaleString(
                                'pt-BR',
                                {
                                  style: 'currency',
                                  currency: 'BRL',
                                },
                              )}
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-2xs flex flex-col justify-between">
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Crédito de ICMS
                            </span>
                            <span className="text-base font-bold text-emerald-900">
                              {(
                                arquivoSelecionado.resumo_entrada.total_credito_icms || 0
                              ).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Apuração do ICMS e DIFAL (Bloco E - Prompt 7.4) */}
                    {arquivoSelecionado.resumo_apuracao?.icms_proprio ? (
                      <div className="space-y-3 p-3.5 bg-slate-900 text-white rounded-lg border border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                            <Scale size={15} className="text-amber-400" />
                            Apuração do ICMS Próprio (Bloco E)
                          </div>
                          <Badge className="text-[10px] bg-slate-800 text-slate-300 border-slate-700">
                            E110
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-slate-400 block uppercase font-medium">
                              Débitos (Saídas)
                            </span>
                            <span className="text-sm font-bold text-slate-100">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio.total_debitos || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-emerald-400 block uppercase font-medium">
                              Créditos (Entradas)
                            </span>
                            <span className="text-sm font-bold text-emerald-300">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio.total_creditos || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-slate-400 block uppercase font-medium">
                              Saldo Credor Anterior
                            </span>
                            <span className="text-sm font-bold text-slate-200">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio
                                  .saldo_credor_anterior || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>

                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-amber-300 block uppercase font-medium">
                              Ajustes de Débito
                            </span>
                            <span className="text-sm font-semibold text-slate-100">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio
                                  .total_ajuste_debitos || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-emerald-400 block uppercase font-medium">
                              Ajustes de Crédito
                            </span>
                            <span className="text-sm font-semibold text-slate-100">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio
                                  .total_ajuste_creditos || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                            <span className="text-[10px] text-purple-300 block uppercase font-medium">
                              Deduções do ICMS
                            </span>
                            <span className="text-sm font-semibold text-slate-100">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio.total_deducoes || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                          <div className="bg-rose-950/40 p-2.5 rounded border border-rose-900/60 flex flex-col justify-between">
                            <span className="text-[11px] text-rose-300 font-medium">
                              ICMS a Recolher
                            </span>
                            <span className="text-base font-bold text-rose-200">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio.icms_recolher || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="bg-emerald-950/40 p-2.5 rounded border border-emerald-900/60 flex flex-col justify-between">
                            <span className="text-[11px] text-emerald-300 font-medium">
                              Saldo a Transportar
                            </span>
                            <span className="text-base font-bold text-emerald-200">
                              {(
                                arquivoSelecionado.resumo_apuracao.icms_proprio
                                  .saldo_credor_transportar || 0
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        </div>

                        {/* DIFAL por UF (E300/E310/E316) */}
                        {arquivoSelecionado.resumo_apuracao.difal_por_uf &&
                          Object.keys(arquivoSelecionado.resumo_apuracao.difal_por_uf).length >
                            0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-800">
                              <div className="text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <MapPin size={13} />
                                  DIFAL / FCP por UF de Destino (E300 / E310)
                                </span>
                                <span className="text-[10px] text-slate-400">EC 87/2015</span>
                              </div>

                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {Object.entries(
                                  arquivoSelecionado.resumo_apuracao.difal_por_uf,
                                ).map(([uf, d]) => (
                                  <div
                                    key={uf}
                                    className="bg-slate-800/90 p-2 rounded border border-slate-700/80 text-xs flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-[10px] font-mono">
                                        {uf}
                                      </Badge>
                                      <span className="text-slate-300 text-[11px]">
                                        DIFAL: R$ {(d.debDifal || 0).toFixed(2)} | FCP: R${' '}
                                        {(d.debFcp || 0).toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[10px] text-slate-400 block">
                                        Recolher
                                      </span>
                                      <span className="font-bold text-rose-300 text-xs">
                                        {(
                                          (d.vlRecolDifal || 0) + (d.vlRecolFcp || 0)
                                        ).toLocaleString('pt-BR', {
                                          style: 'currency',
                                          currency: 'BRL',
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    ) : null}

                    {/* Resumo de Registros do Bloco 9 */}
                    {contagemItens.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Layers size={14} className="text-blue-600" />
                          Contagem de Registros (Bloco 9900)
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-50 rounded border border-slate-200">
                          {contagemItens.map(([reg, qtd]) => (
                            <div
                              key={reg}
                              className="bg-white p-1.5 rounded border border-slate-200 flex items-center justify-between text-[11px]"
                            >
                              <span className="font-mono font-semibold text-slate-700">{reg}</span>
                              <span className="text-slate-500">{qtd}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Painel de Avisos/Erros Resumido */}
                    {arquivoSelecionado.validacoes && arquivoSelecionado.validacoes.length > 0 ? (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-amber-600" />
                            Erros e Avisos Identificados
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {arquivoSelecionado.validacoes.length} item(ns)
                          </span>
                        </div>

                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {arquivoSelecionado.validacoes.slice(0, 5).map((val, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded border text-xs ${
                                val.nivel === 'erro'
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                                {val.nivel === 'erro' ? (
                                  <Badge className="bg-rose-600 text-white text-[9px] px-1 py-0 uppercase">
                                    Erro
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500 text-white text-[9px] px-1 py-0 uppercase">
                                    Aviso
                                  </Badge>
                                )}
                                {val.registro && <span>Registro {val.registro}</span>}
                              </div>
                              <p className="mt-1 text-[11px] leading-relaxed">{val.mensagem}</p>
                            </div>
                          ))}

                          {arquivoSelecionado.validacoes.length > 5 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirModalValidacoes(arquivoSelecionado)}
                              className="w-full text-xs text-blue-600 hover:text-blue-700 h-7"
                            >
                              Ver todos os {arquivoSelecionado.validacoes.length} itens...
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                        <span>Nenhuma inconsistência ou aviso detectado na validação interna.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-slate-200 shadow-xs">
                  <CardContent className="p-8 text-center text-sm text-slate-500">
                    <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                    Selecione um arquivo da lista ao lado para inspecionar os detalhes, validações e
                    baixar o .txt.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Aba: Ajustes da Apuração (Prompt 7.4) */}
        <TabsContent value="ajustes" className="space-y-4 m-0">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sliders size={18} className="text-blue-600" />
                  Ajustes da Apuração do ICMS — {periodo}
                </CardTitle>
                <CardDescription className="text-xs">
                  Ajustes manuais do Registro E111 da EFD ICMS/IPI (créditos presumidos como
                  COMPETE-ES, estornos, deduções e incentivos fiscais). Os códigos oficiais devem
                  ser fornecidos pelo contador da empresa conforme a tabela 5.1.1 da SEFAZ.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={carregarAjustes}
                  disabled={carregandoAjustes}
                  title="Recarregar ajustes"
                  className="h-9 px-3 text-xs text-slate-600"
                >
                  <RotateCw
                    size={14}
                    className={carregandoAjustes ? 'animate-spin mr-1' : 'mr-1'}
                  />
                  Atualizar
                </Button>

                <Button
                  size="sm"
                  onClick={abrirModalNovoAjuste}
                  disabled={!administrador || periodoBloqueadoEntregue}
                  className="h-9 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus size={15} className="mr-1.5" />
                  Novo Ajuste
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Alerta de bloqueio caso haja arquivo Entregue */}
              {periodoBloqueadoEntregue && (
                <Alert className="bg-amber-50 border-amber-300 text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-xs font-semibold">Período Bloqueado</AlertTitle>
                  <AlertDescription className="text-xs">
                    Existe um arquivo SPED Fiscal Oficial com status <strong>Entregue</strong> para
                    o mês {periodo}. Novos ajustes, edições ou exclusões estão bloqueados para
                    garantir a fidelidade da escrituração transmitida ao Fisco.
                  </AlertDescription>
                </Alert>
              )}

              {!administrador && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-slate-500 flex-shrink-0" />
                  <span>
                    O cadastro, alteração e exclusão de ajustes de apuração são restritos a
                    administradores do ERP.
                  </span>
                </div>
              )}

              {/* Tabela de Ajustes */}
              {carregandoAjustes ? (
                <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                  <RotateCw size={24} className="animate-spin text-blue-600" />
                  Carregando ajustes da apuração...
                </div>
              ) : ajustes.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                  <Sliders size={36} className="mx-auto text-slate-300 mb-2" />
                  Nenhum ajuste cadastrado para o mês {periodo}.
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Caso a empresa usufrua de benefícios fiscais (como o COMPETE-ES) ou tenha
                    estornos a declarar, clique em &quot;Novo Ajuste&quot; acima informando os
                    códigos repassados pela contabilidade.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Código Ajuste</th>
                        <th className="py-2.5 px-3">Tipo no E110</th>
                        <th className="py-2.5 px-3">Descrição Complementar</th>
                        <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                        <th className="py-2.5 px-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ajustes.map((aj) => {
                        const quartoChar =
                          aj.codigo_ajuste && aj.codigo_ajuste.length >= 4
                            ? aj.codigo_ajuste.charAt(3)
                            : ''
                        let tipoDesc = 'Outro'
                        if (quartoChar === '0') tipoDesc = 'Outros débitos'
                        else if (quartoChar === '1') tipoDesc = 'Estorno de créditos'
                        else if (quartoChar === '2') tipoDesc = 'Outros créditos'
                        else if (quartoChar === '3') tipoDesc = 'Estorno de débitos'
                        else if (quartoChar === '4') tipoDesc = 'Deduções do imposto'
                        else if (quartoChar === '5') tipoDesc = 'Débito especial'

                        return (
                          <tr key={aj.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                              {aj.codigo_ajuste}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {tipoDesc} (char: {quartoChar})
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                              {aj.descricao_complementar || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                              {aj.valor.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => abrirModalEditarAjuste(aj)}
                                  disabled={!administrador || periodoBloqueadoEntregue}
                                  className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                >
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleExcluirAjuste(aj.id)}
                                  disabled={
                                    !administrador ||
                                    periodoBloqueadoEntregue ||
                                    excluindoAjusteId === aj.id
                                  }
                                  className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                >
                                  {excluindoAjusteId === aj.id ? (
                                    <RotateCw size={12} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Novo / Editar Ajuste */}
      <Dialog open={modalNovoAjusteAberto} onOpenChange={setModalNovoAjusteAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Sliders className="text-blue-600" size={18} />
              {ajusteEdicao?.id ? 'Editar Ajuste da Apuração' : 'Novo Ajuste da Apuração'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mês de apuração: <strong>{periodo}</strong>. O código do ajuste deve conter 8 dígitos
              e ser fornecido pelo contador.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarAjuste} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="form-cod-ajuste" className="text-xs font-semibold text-slate-700">
                Código do Ajuste (8 caracteres) *
              </Label>
              <Input
                id="form-cod-ajuste"
                value={formCodigoAjuste}
                onChange={(e) => setFormCodigoAjuste(e.target.value.toUpperCase())}
                placeholder="Ex: ES020001"
                maxLength={8}
                required
                className="h-9 font-mono uppercase text-sm"
              />
              <p className="text-[11px] text-slate-500">
                O 4º caractere define o reflexo no E110: 0=Outros débitos, 1=Estorno créditos,
                2=Outros créditos, 3=Estorno débitos, 4=Deduções, 5=Débito especial.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-val-ajuste" className="text-xs font-semibold text-slate-700">
                Valor do Ajuste (R$) *
              </Label>
              <Input
                id="form-val-ajuste"
                type="number"
                step="0.01"
                min="0.01"
                value={formValor}
                onChange={(e) => setFormValor(e.target.value)}
                placeholder="0,00"
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-desc-ajuste" className="text-xs font-semibold text-slate-700">
                Descrição Complementar
              </Label>
              <Input
                id="form-desc-ajuste"
                value={formDescricaoCompl}
                onChange={(e) => setFormDescricaoCompl(e.target.value)}
                placeholder="Ex: COMPETE-ES Lei 10.568/2016"
                maxLength={100}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalNovoAjusteAberto(false)}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvandoAjuste}
                className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {salvandoAjuste ? (
                  <>
                    <RotateCw size={14} className="animate-spin mr-1.5" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Ajuste'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Retificadora (Prompt 7.6a - Item C1) */}
      <Dialog
        open={modalConfirmarRetificadoraAberto}
        onOpenChange={setModalConfirmarRetificadoraAberto}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-amber-900">
              <AlertTriangle className="text-amber-600" size={20} />
              Confirmação de Geração — Retificadora
            </DialogTitle>
            <DialogDescription className="text-xs pt-1 text-slate-700 font-medium">
              já existe arquivo entregue deste mês; o novo será uma retificadora
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs text-slate-600 space-y-2">
            <p>
              O período <strong>{periodo}</strong> já possui um arquivo SPED Fiscal Oficial com
              status <strong>Entregue</strong>.
            </p>
            <p>
              Ao prosseguir, o novo arquivo será gerado com finalidade retificadora (
              <strong>COD_FIN = 1</strong>) e substituirá a versão anterior em aberto.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={gerando}
              onClick={() => setModalConfirmarRetificadoraAberto(false)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={gerando}
              onClick={dispararGeracaoSped}
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {gerando ? (
                <>
                  <RotateCw size={14} className="animate-spin mr-1.5" />
                  Gerando retificadora...
                </>
              ) : (
                'Confirmar e Gerar Retificadora'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Marcar como Entregue (Prompt 7.6a - Item C2) */}
      <Dialog open={modalEntregueAberto} onOpenChange={setModalEntregueAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-emerald-950">
              <CheckCircle2 className="text-emerald-600" size={20} />
              Marcar Arquivo SPED como Entregue
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe os dados do recibo emitido pelo PVA da Receita Federal para homologar este
              arquivo oficial.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarMarcarEntregue} className="space-y-4 pt-2">
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Arquivo:</span>{' '}
                <span className="font-mono font-medium text-slate-800">
                  {arquivoParaEntregar?.nome_arquivo}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Período:</span>{' '}
                <span className="font-semibold text-slate-800">{arquivoParaEntregar?.periodo}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-recibo-pva" className="text-xs font-semibold text-slate-700">
                Número do Recibo do PVA *
              </Label>
              <Input
                id="form-recibo-pva"
                value={formReciboEntrega}
                onChange={(e) => setFormReciboEntrega(e.target.value)}
                placeholder="Ex: 27.64.49.52.4E.B3.84.53..."
                required
                className="h-9 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-500">
                Código alfanumérico constante no comprovante de transmissão do PVA.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-data-entrega" className="text-xs font-semibold text-slate-700">
                Data da Entrega
              </Label>
              <Input
                id="form-data-entrega"
                type="date"
                value={formDataEntrega}
                onChange={(e) => setFormDataEntrega(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-obs-entrega" className="text-xs font-semibold text-slate-700">
                Observações (opcional)
              </Label>
              <Input
                id="form-obs-entrega"
                value={formObservacoesEntrega}
                onChange={(e) => setFormObservacoesEntrega(e.target.value)}
                placeholder="Ex: Transmitido pelo contador responsável"
                maxLength={255}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                disabled={marcandoEntregue}
                onClick={() => {
                  setModalEntregueAberto(false)
                  setArquivoParaEntregar(null)
                }}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={marcandoEntregue}
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {marcandoEntregue ? (
                  <>
                    <RotateCw size={14} className="animate-spin mr-1.5" />
                    Gravando entrega...
                  </>
                ) : (
                  'Confirmar Entrega'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Completo de Validações e Inconsistências */}
      <Dialog open={modalValidacoesAberto} onOpenChange={setModalValidacoesAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="text-amber-600" size={20} />
              Inconsistências e Avisos — {arquivoSelecionado?.nome_arquivo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Lista de regras fiscais que geraram alerta ou erro durante a montagem do arquivo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2">
            {arquivoSelecionado?.validacoes?.map((item, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border text-xs space-y-1 ${
                  item.nivel === 'erro'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 uppercase font-bold ${
                        item.nivel === 'erro' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.nivel}
                    </Badge>
                    {item.registro && (
                      <span className="font-mono font-semibold text-slate-800">
                        Registro {item.registro}
                      </span>
                    )}
                  </div>
                  {item.referencia && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Ref: {item.referencia}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed">{item.mensagem}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SpedFiscalPage
