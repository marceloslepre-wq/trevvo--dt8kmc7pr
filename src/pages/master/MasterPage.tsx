import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown,
  LayoutDashboard,
  HelpCircle,
  RefreshCw,
  LogOut,
  KeyRound,
  Layers,
  Construction,
  ShieldCheck,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  MessageCircle,
  Mail,
  Users,
  CheckCircle2,
  XCircle,
  DollarSign,
  Clock,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Check,
  Building2,
  FileText,
  FileCheck2,
  Boxes,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  obterMasterResumo,
  listarMasterPlanos,
  criarMasterPlano,
  atualizarMasterPlano,
  excluirMasterPlano,
  atualizarConfigMaster,
  MasterResumo,
  MasterPlano,
  MasterPlanoFormData,
} from '@/services/master'

const FORM_PLANO_PADRAO: MasterPlanoFormData = {
  nome: '',
  etiqueta: '',
  descricao: '',
  valor_mensal: 0,
  limite_empresas: 1,
  limite_usuarios: 3,
  permite_nfe: true,
  permite_nfce: true,
  permite_sped: false,
  exclusivo_master: false,
  ativo: true,
}

export const MasterPage: React.FC = () => {
  const { user, logout } = useAuth()
  const { config, logoUrl } = useConfiguracoes()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [abaAtiva, setAbaAtiva] = useState<'licencas' | 'planos'>('licencas')
  const [atualizando, setAtualizando] = useState(false)
  const [carregandoDados, setCarregandoDados] = useState(true)

  // Dados principais
  const [resumo, setResumo] = useState<MasterResumo | null>(null)
  const [planos, setPlanos] = useState<MasterPlano[]>([])

  // Quadro 1: Gerador de Link de Primeiro Cadastro
  const [diasTrialInput, setDiasTrialInput] = useState<number>(15)
  const [salvandoDiasTrial, setSalvandoDiasTrial] = useState(false)
  const [planoSelecionadoLink, setPlanoSelecionadoLink] = useState<string>('nenhum')
  const [copiadoLink, setCopiadoLink] = useState(false)

  // Quadro 3: Modal de Plano (Criar / Editar)
  const [modalPlanoAberto, setModalPlanoAberto] = useState(false)
  const [planoEmEdicao, setPlanoEmEdicao] = useState<MasterPlano | null>(null)
  const [formPlano, setFormPlano] = useState<MasterPlanoFormData>(FORM_PLANO_PADRAO)
  const [salvandoPlano, setSalvandoPlano] = useState(false)

  // Modal de Exclusão de Plano
  const [planoParaExcluir, setPlanoParaExcluir] = useState<MasterPlano | null>(null)
  const [excluindoPlano, setExcluindoPlano] = useState(false)

  // Carregar dados
  const carregarDadosMaster = useCallback(async () => {
    try {
      const [resumoData, planosData] = await Promise.all([
        obterMasterResumo(),
        listarMasterPlanos(),
      ])
      setResumo(resumoData)
      setPlanos(planosData)
      setDiasTrialInput(resumoData.dias_trial_padrao || 15)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados do Master',
        description: err?.message || 'Não foi possível carregar as informações do Painel Master.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoDados(false)
    }
  }, [toast])

  useEffect(() => {
    carregarDadosMaster()
  }, [carregarDadosMaster])

  const handleAtualizar = async () => {
    try {
      setAtualizando(true)
      await carregarDadosMaster()
      toast({
        title: 'Painel Atualizado',
        description: 'Informações e indicadores operacionais sincronizados com sucesso.',
      })
    } finally {
      setTimeout(() => setAtualizando(false), 300)
    }
  }

  const handleGuiaUso = () => {
    toast({
      title: 'Guia de Uso do Painel Master',
      description:
        'Gerencie links de convite, catálogo de planos comerciais, métricas globais e parametrizações do SaaS.',
    })
  }

  // Ações do Gerador de Link
  const linkGerado = useMemo(() => {
    const baseUrl = window.location.origin
    if (!planoSelecionadoLink || planoSelecionadoLink === 'nenhum') {
      return `${baseUrl}/cadastro`
    }
    return `${baseUrl}/cadastro?plano=${encodeURIComponent(planoSelecionadoLink)}`
  }, [planoSelecionadoLink])

  const handleSalvarDiasTrial = async () => {
    const val = parseInt(String(diasTrialInput), 10)
    if (isNaN(val) || val < 1 || val > 365) {
      toast({
        title: 'Valor inválido',
        description: 'Os dias de teste grátis devem ser entre 1 e 365 dias.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvandoDiasTrial(true)
      const cfg = await atualizarConfigMaster(val)
      setDiasTrialInput(cfg.dias_trial)
      if (resumo) {
        setResumo({ ...resumo, dias_trial_padrao: cfg.dias_trial })
      }
      toast({
        title: 'Configuração salva',
        description: `Período padrão de teste atualizado para ${cfg.dias_trial} dias.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível atualizar os dias de teste.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoDiasTrial(false)
    }
  }

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkGerado)
      setCopiadoLink(true)
      toast({
        title: 'Link copiado!',
        description: 'O link de cadastro foi copiado para a área de transferência.',
      })
      setTimeout(() => setCopiadoLink(false), 2500)
    } catch (_) {
      toast({
        title: 'Erro ao copiar link',
        description: 'Copie manualmente o link exibido no campo.',
        variant: 'destructive',
      })
    }
  }

  const handleAbrirPagina = () => {
    toast({
      title: 'Página pública de cadastro em breve',
      description:
        'A tela pública de auto-cadastro (/cadastro) será disponibilizada na próxima etapa (Prompt 9.8).',
    })
  }

  const handleCompartilharWhatsApp = () => {
    const nomePlano =
      planoSelecionadoLink !== 'nenhum'
        ? planos.find((p) => p.id === planoSelecionadoLink)?.nome
        : null
    const textoMensagem = nomePlano
      ? `Olá! Convido você a conhecer o sistema ${config?.nome_sistema || 'ERP Gestão Comercial'}. Criamos uma condição especial com o plano ${nomePlano} e ${diasTrialInput} dias de teste grátis. Acesse pelo link: ${linkGerado}`
      : `Olá! Convido você a conhecer o sistema ${config?.nome_sistema || 'ERP Gestão Comercial'} com ${diasTrialInput} dias de teste grátis para sua empresa. Crie seu acesso pelo link: ${linkGerado}`

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textoMensagem)}`
    window.open(url, '_blank')
  }

  const handleCompartilharEmail = () => {
    const assunto = `Convite de acesso ao ${config?.nome_sistema || 'ERP Gestão Comercial'} - ${diasTrialInput} dias grátis`
    const corpo = `Olá,\n\nVocê foi convidado para experimentar o ${config?.nome_sistema || 'ERP Gestão Comercial'}.\n\nAproveite ${diasTrialInput} dias de teste grátis com todas as funcionalidades da plataforma.\n\nClique no link abaixo para criar sua conta:\n${linkGerado}\n\nAtenciosamente,\nEquipe ${config?.nome_sistema || 'ERP Gestão Comercial'}`
    const mailto = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
    window.location.href = mailto
  }

  // Ações de CRUD de Planos
  const abrirCriarPlano = () => {
    setPlanoEmEdicao(null)
    setFormPlano(FORM_PLANO_PADRAO)
    setModalPlanoAberto(true)
  }

  const abrirEditarPlano = (plano: MasterPlano) => {
    setPlanoEmEdicao(plano)
    setFormPlano({
      nome: plano.nome,
      etiqueta: plano.etiqueta || '',
      descricao: plano.descricao || '',
      valor_mensal: plano.valor_mensal || 0,
      limite_empresas: plano.limite_empresas || 0,
      limite_usuarios: plano.limite_usuarios || 0,
      permite_nfe: plano.permite_nfe,
      permite_nfce: plano.permite_nfce,
      permite_sped: plano.permite_sped,
      exclusivo_master: plano.exclusivo_master,
      ativo: plano.ativo,
    })
    setModalPlanoAberto(true)
  }

  const handleSalvarPlano = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formPlano.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do plano comercial.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvandoPlano(true)
      if (planoEmEdicao) {
        await atualizarMasterPlano(planoEmEdicao.id, formPlano)
        toast({
          title: 'Plano atualizado',
          description: `O plano "${formPlano.nome}" foi atualizado com sucesso.`,
        })
      } else {
        await criarMasterPlano(formPlano)
        toast({
          title: 'Plano criado',
          description: `O plano "${formPlano.nome}" foi cadastrado no catálogo.`,
        })
      }
      setModalPlanoAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar plano',
        description: err?.message || 'Falha na operação de gravação do plano.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoPlano(false)
    }
  }

  const handleConfirmarExclusaoPlano = async () => {
    if (!planoParaExcluir) return

    try {
      setExcluindoPlano(true)
      await excluirMasterPlano(planoParaExcluir.id)
      toast({
        title: 'Plano excluído',
        description: `O plano "${planoParaExcluir.nome}" foi removido do catálogo.`,
      })
      setPlanoParaExcluir(null)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Exclusão recusada',
        description:
          err?.message ||
          'Este plano não pode ser excluído. Se estiver em uso, sugerimos inativá-lo.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoPlano(false)
    }
  }

  // Formatação de Moeda
  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Topo do /master */}
      <header className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Lado esquerdo: Nome do sistema, selo MASTER e subtítulo */}
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-8 w-8 object-contain rounded bg-white/10 p-1"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-purple-700 to-indigo-500 flex items-center justify-center text-white shadow-inner">
                <Crown size={20} className="text-amber-300" />
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                  {config?.nome_sistema || 'ERP Gestão Comercial'}
                </span>
                <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 hover:bg-amber-400 font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 border-none shadow-xs">
                  MASTER MULTI-TENANT
                </Badge>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                Painel de Administração Global
              </span>
            </div>
          </div>

          {/* Lado direito: Botão Ir ao Painel Gerencial + Admin Master + Ações */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/painel')}
              className="gap-1.5 h-8 text-xs font-semibold bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
              title="Voltar ao ERP"
            >
              <LayoutDashboard size={14} className="text-blue-400" />
              <span className="hidden md:inline">Ir ao Painel Gerencial</span>
              <span className="md:hidden">ERP</span>
            </Button>

            <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

            {/* Identificação Admin Master */}
            <div className="hidden lg:flex flex-col text-right leading-tight">
              <span className="text-xs font-bold text-amber-300 flex items-center justify-end gap-1">
                <ShieldCheck size={13} className="text-amber-400 inline" />
                Admin Master
              </span>
              <span className="text-[11px] text-slate-400 max-w-[190px] truncate">
                {user?.email || 'master@erp.local'}
              </span>
            </div>

            {/* Botões do topo: Guia de Uso, Atualizar e Sair */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGuiaUso}
                className="h-8 px-2 sm:px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                title="Guia de Uso"
              >
                <HelpCircle size={15} />
                <span className="hidden sm:inline ml-1.5">Guia de Uso</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleAtualizar}
                disabled={atualizando}
                className="h-8 px-2 sm:px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                title="Atualizar"
              >
                <RefreshCw size={14} className={atualizando ? 'animate-spin' : ''} />
                <span className="hidden sm:inline ml-1.5">Atualizar</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-8 px-2 sm:px-2.5 text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                title="Sair"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline ml-1.5">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal do /master */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* QUADRO 1: Gerador de Link de Primeiro Cadastro */}
        <Card className="border-indigo-100 shadow-sm bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/30 overflow-hidden">
          <CardHeader className="pb-3 border-b border-indigo-50/80">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <LinkIcon size={18} />
                </div>
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    Gerador de Link de Primeiro Cadastro
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Crie e compartilhe links de convite para adesão de novos clientes com período de
                    degustação.
                  </CardDescription>
                </div>
              </div>

              {/* Selos do Quadro 1 */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-purple-50 text-purple-700 border-purple-200 font-semibold text-xs px-2.5 py-1"
                >
                  <ExternalLink size={12} className="mr-1 inline text-purple-600" />
                  Página pública /cadastro
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs px-2.5 py-1"
                >
                  <Clock size={12} className="mr-1 inline text-emerald-600" />
                  {resumo?.dias_trial_padrao || diasTrialInput} dias de teste grátis
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Edição dos Dias de Trial */}
              <div className="md:col-span-3 space-y-1.5">
                <Label htmlFor="dias-trial" className="text-xs font-semibold text-slate-700">
                  Dias de teste grátis (Trial)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="dias-trial"
                    type="number"
                    min={1}
                    max={365}
                    value={diasTrialInput}
                    onChange={(e) => setDiasTrialInput(Number(e.target.value))}
                    className="h-9 text-xs font-medium"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSalvarDiasTrial}
                    disabled={salvandoDiasTrial}
                    className="h-9 text-xs px-3 font-semibold"
                    title="Salvar dias de trial padrão"
                  >
                    {salvandoDiasTrial ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </div>

              {/* Seletor de Plano Pré-selecionado Opcional */}
              <div className="md:col-span-4 space-y-1.5">
                <Label
                  htmlFor="seletor-plano-link"
                  className="text-xs font-semibold text-slate-700"
                >
                  Plano pré-selecionado (opcional)
                </Label>
                <Select
                  value={planoSelecionadoLink}
                  onValueChange={(val) => setPlanoSelecionadoLink(val)}
                >
                  <SelectTrigger
                    id="seletor-plano-link"
                    className="h-9 text-xs font-medium bg-white"
                  >
                    <SelectValue placeholder="Selecione um plano ou livre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum" className="text-xs">
                      Nenhum plano específico (cliente escolhe na tela)
                    </SelectItem>
                    {planos
                      .filter((p) => p.ativo && !p.exclusivo_master)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.nome} {p.etiqueta ? `(${p.etiqueta})` : ''} -{' '}
                          {formatarMoeda(p.valor_mensal)}/mês
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Link Gerado e Ações */}
              <div className="md:col-span-5 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Link de convite gerado
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={linkGerado}
                    className="h-9 text-xs font-mono bg-slate-50 border-slate-300 text-slate-700 select-all"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopiarLink}
                    className="h-9 text-xs px-2.5 font-semibold gap-1 bg-white hover:bg-slate-100"
                    title="Copiar link gerado"
                  >
                    {copiadoLink ? (
                      <>
                        <Check size={14} className="text-emerald-600" />
                        <span className="hidden sm:inline text-emerald-700">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span className="hidden sm:inline">Copiar</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAbrirPagina}
                    className="h-9 text-xs px-2.5 font-semibold gap-1 bg-white hover:bg-slate-100"
                    title="Abrir página de cadastro"
                  >
                    <ExternalLink size={14} />
                    <span className="hidden sm:inline">Abrir página</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Compartilhamento direto */}
            <div className="pt-2 border-t border-indigo-50/80 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-600" />
                Compartilhamento direto:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCompartilharWhatsApp}
                  className="h-8 text-xs font-medium bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1.5"
                >
                  <MessageCircle size={14} className="text-emerald-600" />
                  WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCompartilharEmail}
                  className="h-8 text-xs font-medium bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 gap-1.5"
                >
                  <Mail size={14} className="text-blue-600" />
                  E-mail
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopiarLink}
                  className="h-8 text-xs font-medium bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100 gap-1.5"
                >
                  <Copy size={14} className="text-slate-600" />
                  Copiar link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QUADRO 2: Painel Master de Operações */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <LayoutDashboard size={18} className="text-indigo-600" />
                  Painel Master de Operações
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Visão consolidada da base de assinantes, licenças, métricas financeiras e
                  catálogo.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-[11px] font-semibold text-slate-600">
                Live Backend
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {/* 4 Cartões Principais: Assinantes, Licenças Ativas, Expiradas e Planos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {/* Assinantes (total) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Users size={20} />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block">
                    Assinantes
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900">
                    {carregandoDados ? '-' : (resumo?.total_assinantes ?? 0)}
                  </span>
                </div>
              </div>

              {/* Licenças ativas */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-700 block">
                    Licenças Ativas
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-emerald-900">
                    {carregandoDados ? '-' : (resumo?.licencas_ativas ?? 0)}
                  </span>
                </div>
              </div>

              {/* Licenças expiradas */}
              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <XCircle size={20} />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-rose-700 block">
                    Licenças Expiradas
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-rose-900">
                    {carregandoDados ? '-' : (resumo?.licencas_expiradas ?? 0)}
                  </span>
                </div>
              </div>

              {/* Planos no catálogo */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Layers size={20} />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-blue-700 block">
                    Planos
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-blue-900">
                    {carregandoDados ? '-' : (resumo?.total_planos ?? planos.length)}
                  </span>
                </div>
              </div>
            </div>

            {/* Linha com MRR total ativo e Clientes em trial */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pt-1">
              {/* MRR Total Ativo */}
              <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <span className="text-xs text-slate-300 font-semibold block uppercase tracking-wide">
                      MRR Total Ativo
                    </span>
                    <span className="text-xl sm:text-2xl font-extrabold text-amber-300">
                      {carregandoDados ? '...' : formatarMoeda(resumo?.mrr_total_ativo || 0)}
                    </span>
                  </div>
                </div>
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] hidden sm:inline">
                  Sem isentas (R$ 0)
                </Badge>
              </div>

              {/* Clientes em trial */}
              <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-xl p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-400 text-slate-950 flex items-center justify-center shrink-0">
                    <Clock size={20} />
                  </div>
                  <div>
                    <span className="text-xs text-purple-200 font-semibold block uppercase tracking-wide">
                      Clientes em Trial
                    </span>
                    <span className="text-xl sm:text-2xl font-extrabold text-white">
                      {carregandoDados ? '...' : (resumo?.clientes_trial ?? 0)}
                    </span>
                  </div>
                </div>
                <Badge className="bg-purple-800/80 text-purple-200 border border-purple-700 text-[10px] hidden sm:inline">
                  Degustação
                </Badge>
              </div>
            </div>

            {/* Nota Informativa */}
            <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <ShieldCheck size={14} className="text-indigo-600" />
                {resumo?.nota_cobranca || 'Cobrança comercial gerenciada pelo Master'}
              </span>
              <span className="text-[11px] text-slate-400">
                Sincronizado via /backend/v1/master/resumo
              </span>
            </div>
          </CardContent>
        </Card>

        {/* TABS INFERIORES: Licenças de Clientes (9.7b) e Catálogo de Planos (N) (9.7a2) */}
        <Tabs
          value={abaAtiva}
          onValueChange={(val) => setAbaAtiva(val as 'licencas' | 'planos')}
          className="w-full space-y-4"
        >
          {/* Cabeçalho das Abas */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <TabsList className="bg-slate-200/80 p-1 border border-slate-300">
              {/* Licenças de clientes (9.7b em construção) */}
              <TabsTrigger
                value="licencas"
                className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs px-4 py-2"
              >
                <KeyRound size={15} className="text-purple-600" />
                Licenças de clientes
              </TabsTrigger>

              {/* Catálogo de planos (N) com contador */}
              <TabsTrigger
                value="planos"
                className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs px-4 py-2"
              >
                <Layers size={15} className="text-blue-600" />
                Catálogo de planos ({planos.length})
              </TabsTrigger>
            </TabsList>

            {abaAtiva === 'planos' && (
              <Button
                size="sm"
                onClick={abrirCriarPlano}
                className="gap-1.5 h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                <Plus size={15} />
                Novo plano
              </Button>
            )}
          </div>

          {/* ABA 1: Licenças de Clientes (CONTINUA EM CONSTRUÇÃO - 9.7b) */}
          <TabsContent value="licencas" className="mt-0">
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="h-16 w-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 ring-8 ring-purple-50/50">
                  <Construction size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  Licenças de Clientes em Construção
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                  A listagem completa de clientes assinantes, detalhes da licença, vigência, status,
                  renovações e auditoria na linha do tempo de eventos será entregue no Prompt 9.7b.
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-purple-700 bg-purple-50 border-purple-200 font-semibold"
                  >
                    Etapa 9.7b
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Tabelas assinantes e licencas_eventos prontas
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 2: Catálogo de Planos (N) (ENTREGA 9.7a2) */}
          <TabsContent value="planos" className="mt-0 space-y-4">
            {carregandoDados ? (
              <div className="py-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin text-indigo-600" />
                Carregando catálogo de planos...
              </div>
            ) : planos.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white">
                <CardContent className="py-12 text-center">
                  <Layers size={32} className="mx-auto text-slate-400 mb-3" />
                  <h4 className="text-sm font-semibold text-slate-700">Nenhum plano cadastrado</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Cadastre os planos comerciais que serão ofertados aos novos assinantes.
                  </p>
                  <Button size="sm" onClick={abrirCriarPlano} className="text-xs">
                    <Plus size={14} className="mr-1.5" />
                    Criar primeiro plano
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {planos.map((plano) => {
                  const ehMaster = plano.exclusivo_master
                  const ehGratis = plano.valor_mensal === 0

                  return (
                    <Card
                      key={plano.id}
                      className={`border shadow-xs transition-shadow hover:shadow-md flex flex-col justify-between ${
                        ehMaster
                          ? 'border-amber-300 bg-gradient-to-b from-amber-50/40 to-white'
                          : plano.ativo
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-200 bg-slate-50/70 opacity-80'
                      }`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base font-bold text-slate-900">
                                {plano.nome}
                              </CardTitle>
                              {ehMaster && (
                                <Badge className="bg-amber-400 text-slate-950 hover:bg-amber-400 font-extrabold text-[10px] px-1.5 py-0">
                                  MASTER
                                </Badge>
                              )}
                            </div>
                            {plano.etiqueta && (
                              <span className="text-xs font-semibold text-indigo-600 mt-0.5 block">
                                {plano.etiqueta}
                              </span>
                            )}
                          </div>

                          <Badge
                            variant={plano.ativo ? 'default' : 'secondary'}
                            className={`text-[10px] font-semibold ${
                              plano.ativo
                                ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {plano.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>

                        {plano.descricao && (
                          <CardDescription className="text-xs text-slate-600 line-clamp-2 mt-1">
                            {plano.descricao}
                          </CardDescription>
                        )}
                      </CardHeader>

                      <CardContent className="space-y-4 flex-1">
                        {/* Valor Mensal */}
                        <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                          <span className="text-xs font-medium text-slate-500">Valor mensal:</span>
                          <span
                            className={`font-extrabold ${
                              ehGratis
                                ? 'text-sm text-amber-700'
                                : 'text-xl text-slate-900 tracking-tight'
                            }`}
                          >
                            {ehGratis
                              ? 'Grátis / Master'
                              : `${formatarMoeda(plano.valor_mensal)}/mês`}
                          </span>
                        </div>

                        {/* Limites estruturais */}
                        <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Building2 size={13} className="text-slate-400" />
                              Limite de empresas:
                            </span>
                            <span className="font-semibold text-slate-800">
                              {!plano.limite_empresas || plano.limite_empresas <= 0
                                ? 'Ilimitado'
                                : `${plano.limite_empresas} empresa(s)`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <Users size={13} className="text-slate-400" />
                              Limite de usuários:
                            </span>
                            <span className="font-semibold text-slate-800">
                              {!plano.limite_usuarios || plano.limite_usuarios <= 0
                                ? 'Ilimitado'
                                : `${plano.limite_usuarios} usuário(s)`}
                            </span>
                          </div>
                        </div>

                        {/* Recursos Fiscais Liberados */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Recursos inclusos:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-medium gap-1 ${
                                plano.permite_nfe
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                              }`}
                            >
                              <FileText size={11} />
                              NF-e mod 55
                            </Badge>

                            <Badge
                              variant="outline"
                              className={`text-[11px] font-medium gap-1 ${
                                plano.permite_nfce
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                              }`}
                            >
                              <FileCheck2 size={11} />
                              NFC-e mod 65
                            </Badge>

                            <Badge
                              variant="outline"
                              className={`text-[11px] font-medium gap-1 ${
                                plano.permite_sped
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                              }`}
                            >
                              <Boxes size={11} />
                              SPED Fiscal
                            </Badge>
                          </div>
                        </div>

                        {/* Uso em Assinantes */}
                        {typeof plano.total_assinantes === 'number' && (
                          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span>Assinantes vinculados:</span>
                            <span className="font-semibold text-slate-800">
                              {plano.total_assinantes}
                            </span>
                          </div>
                        )}
                      </CardContent>

                      {/* Rodapé do Cartão com Botões Editar e Excluir */}
                      <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => abrirEditarPlano(plano)}
                          className="h-8 text-xs font-semibold gap-1 bg-white hover:bg-slate-100 text-slate-700"
                        >
                          <Pencil size={13} />
                          Editar
                        </Button>

                        {/* O Plano Master (exclusivo_master) NÃO tem botão de excluir */}
                        {!ehMaster && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPlanoParaExcluir(plano)}
                            className="h-8 text-xs font-semibold gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Excluir plano"
                          >
                            <Trash2 size={13} />
                            Excluir
                          </Button>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL DE CRIAR / EDITAR PLANO (com todos os campos da tabela planos_catalogo) */}
      <Dialog open={modalPlanoAberto} onOpenChange={setModalPlanoAberto}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSalvarPlano}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                {planoEmEdicao ? `Editar Plano: ${planoEmEdicao.nome}` : 'Novo Plano Comercial'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Preencha todos os parâmetros e limitações de recursos deste plano de assinatura.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Nome e Etiqueta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plano-nome" className="text-xs font-semibold text-slate-700">
                    Nome do Plano <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="plano-nome"
                    required
                    placeholder="Ex: Essencial, Pro, Corporativo"
                    value={formPlano.nome}
                    onChange={(e) => setFormPlano({ ...formPlano, nome: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plano-etiqueta" className="text-xs font-semibold text-slate-700">
                    Etiqueta comercial (badge)
                  </Label>
                  <Input
                    id="plano-etiqueta"
                    placeholder="Ex: Mais vendido, Recomendado"
                    value={formPlano.etiqueta || ''}
                    onChange={(e) => setFormPlano({ ...formPlano, etiqueta: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <Label htmlFor="plano-desc" className="text-xs font-semibold text-slate-700">
                  Descrição detalhada
                </Label>
                <Textarea
                  id="plano-desc"
                  rows={2}
                  placeholder="Descreva as vantagens e o público-alvo deste plano"
                  value={formPlano.descricao || ''}
                  onChange={(e) => setFormPlano({ ...formPlano, descricao: e.target.value })}
                  className="text-xs"
                />
              </div>

              {/* Valor Mensal, Limite Empresas e Limite Usuários */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plano-valor" className="text-xs font-semibold text-slate-700">
                    Valor Mensal (R$)
                  </Label>
                  <Input
                    id="plano-valor"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formPlano.valor_mensal}
                    onChange={(e) =>
                      setFormPlano({ ...formPlano, valor_mensal: parseFloat(e.target.value) || 0 })
                    }
                    className="text-xs h-9 font-medium"
                  />
                  <span className="text-[10px] text-slate-400">0 = Grátis / Isento</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plano-empresas" className="text-xs font-semibold text-slate-700">
                    Limite de Empresas
                  </Label>
                  <Input
                    id="plano-empresas"
                    type="number"
                    min="0"
                    placeholder="0 = ilimitado"
                    value={formPlano.limite_empresas}
                    onChange={(e) =>
                      setFormPlano({
                        ...formPlano,
                        limite_empresas: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="text-xs h-9"
                  />
                  <span className="text-[10px] text-slate-400">0 = Ilimitado</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plano-usuarios" className="text-xs font-semibold text-slate-700">
                    Limite de Usuários
                  </Label>
                  <Input
                    id="plano-usuarios"
                    type="number"
                    min="0"
                    placeholder="0 = ilimitado"
                    value={formPlano.limite_usuarios}
                    onChange={(e) =>
                      setFormPlano({
                        ...formPlano,
                        limite_usuarios: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="text-xs h-9"
                  />
                  <span className="text-[10px] text-slate-400">0 = Ilimitado</span>
                </div>
              </div>

              {/* Recursos Fiscais Autorizados */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">
                  Módulos e Recursos Fiscais Liberados:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <Switch
                      checked={formPlano.permite_nfe}
                      onCheckedChange={(checked) =>
                        setFormPlano({ ...formPlano, permite_nfe: checked })
                      }
                    />
                    <span>NF-e (mod 55)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <Switch
                      checked={formPlano.permite_nfce}
                      onCheckedChange={(checked) =>
                        setFormPlano({ ...formPlano, permite_nfce: checked })
                      }
                    />
                    <span>NFC-e (mod 65)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <Switch
                      checked={formPlano.permite_sped}
                      onCheckedChange={(checked) =>
                        setFormPlano({ ...formPlano, permite_sped: checked })
                      }
                    />
                    <span>SPED Fiscal</span>
                  </label>
                </div>
              </div>

              {/* Parâmetros Especiais: Exclusivo Master e Ativo */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center justify-between cursor-pointer text-xs font-medium text-slate-700">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Plano Ativo</span>
                    <span className="text-[11px] text-slate-500">
                      Disponível para seleção e novos clientes
                    </span>
                  </div>
                  <Switch
                    checked={formPlano.ativo}
                    onCheckedChange={(checked) => setFormPlano({ ...formPlano, ativo: checked })}
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer text-xs font-medium text-slate-700">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Exclusivo Master</span>
                    <span className="text-[11px] text-slate-500">Oculto do catálogo público</span>
                  </div>
                  <Switch
                    checked={formPlano.exclusivo_master}
                    onCheckedChange={(checked) =>
                      setFormPlano({ ...formPlano, exclusivo_master: checked })
                    }
                  />
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalPlanoAberto(false)}
                disabled={salvandoPlano}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoPlano}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {salvandoPlano ? (
                  <>
                    <RefreshCw size={14} className="animate-spin mr-1.5" />
                    Salvando...
                  </>
                ) : planoEmEdicao ? (
                  'Salvar Alterações'
                ) : (
                  'Criar Plano'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PLANO */}
      <AlertDialog
        open={!!planoParaExcluir}
        onOpenChange={(open) => !open && setPlanoParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle size={18} className="text-rose-600" />
              Excluir Plano Comercial?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
              <span>
                Tem certeza de que deseja remover o plano{' '}
                <strong>"{planoParaExcluir?.nome}"</strong> do catálogo?
              </span>
              <span className="block text-slate-500 text-[11px]">
                Nota: Se este plano estiver associado a qualquer cliente assinante, a exclusão será
                bloqueada e será sugerida a inativação do plano.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={excluindoPlano} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusaoPlano}
              disabled={excluindoPlano}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {excluindoPlano ? (
                <>
                  <RefreshCw size={14} className="animate-spin mr-1.5" />
                  Excluindo...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default MasterPage
