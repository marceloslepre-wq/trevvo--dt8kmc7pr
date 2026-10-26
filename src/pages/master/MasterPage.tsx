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
  Info,
  Eye,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  obterMasterResumo,
  listarMasterPlanos,
  criarMasterPlano,
  atualizarMasterPlano,
  excluirMasterPlano,
  atualizarConfigMaster,
  listarMasterLicencas,
  obterHistoricoLicenca,
  renovarLicenca30Dias,
  editarLimitesLicenca,
  editarExpiracaoLicenca,
  alterarPlanoLicenca,
  alterarStatusLicenca,
  editarDadosGeraisLicenca,
  excluirLicencaCascata,
  entrarPainelClienteMaster,
  MasterResumo,
  MasterPlano,
  MasterPlanoFormData,
  MasterLicencaItem,
  MasterLicencaEvento,
} from '@/services/master'
import {
  Search,
  SlidersHorizontal,
  Calendar,
  Zap,
  MoreVertical,
  History,
  Play,
  Pause,
  Sliders,
  CalendarClock,
  ArrowRightLeft,
  UserCheck,
  UserX,
  Phone,
  AlertTriangle,
} from 'lucide-react'

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
  const [licencas, setLicencas] = useState<MasterLicencaItem[]>([])

  // Filtros da aba Licenças
  const [buscaLicenca, setBuscaLicenca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<
    'todos' | 'ativas' | 'renovadas' | 'expiradas' | 'pausadas' | 'trial'
  >('todos')

  // Modais de Poderes da Licença
  const [licencaSelecionada, setLicencaSelecionada] = useState<MasterLicencaItem | null>(null)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [historicoEventos, setHistoricoEventos] = useState<MasterLicencaEvento[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  // Modal Editar Limites
  const [modalLimitesAberto, setModalLimitesAberto] = useState(false)
  const [limitesForm, setLimitesForm] = useState({
    limites_personalizados: true,
    limite_empresas: 1,
    limite_usuarios: 3,
  })
  const [salvandoLimites, setSalvandoLimites] = useState(false)

  // Modal Editar Expiração
  const [modalExpiracaoAberto, setModalExpiracaoAberto] = useState(false)
  const [novaExpiracaoInput, setNovaExpiracaoInput] = useState('')
  const [salvandoExpiracao, setSalvandoExpiracao] = useState(false)

  // Modal Alterar Plano
  const [modalAlterarPlanoAberto, setModalAlterarPlanoAberto] = useState(false)
  const [novoPlanoSelecionado, setNovoPlanoSelecionado] = useState('')
  const [salvandoPlanoLicenca, setSalvandoPlanoLicenca] = useState(false)

  // Modal Pausar / Reativar
  const [modalStatusAberto, setModalStatusAberto] = useState(false)
  const [motivoStatus, setMotivoStatus] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  // Modal Editar Dados Gerais
  const [modalDadosGeraisAberto, setModalDadosGeraisAberto] = useState(false)
  const [dadosGeraisForm, setDadosGeraisForm] = useState({
    nome: '',
    documento: '',
    email_contato: '',
    telefone: '',
    whatsapp_contato: '',
    observacoes: '',
  })
  const [salvandoDadosGerais, setSalvandoDadosGerais] = useState(false)

  // Modal Excluir Licença (com digitação do nome)
  const [modalExcluirLicencaAberto, setModalExcluirLicencaAberto] = useState(false)
  const [digitacaoConfirmacaoExclusao, setDigitacaoConfirmacaoExclusao] = useState('')
  const [excluindoLicenca, setExcluindoLicenca] = useState(false)

  // Estado de renovação rápida (+30d)
  const [renovandoId, setRenovandoId] = useState<string | null>(null)

  // Estado de suporte / Acessar painel (Prompt 9.7b2 - Requisito 1)
  const [acessandoPainelId, setAcessandoPainelId] = useState<string | null>(null)

  const handleAcessarPainelCliente = async (lic: MasterLicencaItem) => {
    try {
      setAcessandoPainelId(lic.id)
      const res = await entrarPainelClienteMaster(lic.id)
      if (res && res.sucesso) {
        toast({
          title: 'Modo master ativado',
          description: `Você entrou no painel de ${lic.nome}.`,
        })
        window.location.href = '/'
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao acessar painel',
          description: res?.message || 'Não foi possível acessar o painel do cliente.',
        })
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao acessar painel',
        description: err?.message || 'Falha ao conectar com o backend.',
      })
    } finally {
      setAcessandoPainelId(null)
    }
  }

  // Quadro 1: Gerador de Link de Primeiro Cadastro
  const [diasTrialInput, setDiasTrialInput] = useState<number>(15)
  const [salvandoDiasTrial, setSalvandoDiasTrial] = useState(false)
  const [planoSelecionadoLink, setPlanoSelecionadoLink] = useState<string>('nenhum')
  const [copiadoLink, setCopiadoLink] = useState(false)

  // Diálogo de Detalhes de Plano (Prompt 9.7c)
  const [modalDetalhesPlanoAberto, setModalDetalhesPlanoAberto] = useState(false)
  const [planoDetalhes, setPlanoDetalhes] = useState<MasterPlano | null>(null)

  const abrirDetalhesPlano = (planoOuId: MasterPlano | string) => {
    if (typeof planoOuId === 'string') {
      const encontrado = planos.find((p) => p.id === planoOuId)
      if (encontrado) {
        setPlanoDetalhes(encontrado)
        setModalDetalhesPlanoAberto(true)
      } else {
        toast({
          title: 'Plano não encontrado',
          description: 'Não foi possível localizar os dados deste plano comercial.',
          variant: 'destructive',
        })
      }
    } else {
      setPlanoDetalhes(planoOuId)
      setModalDetalhesPlanoAberto(true)
    }
  }

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
      const [resumoData, planosData, licencasData] = await Promise.all([
        obterMasterResumo(),
        listarMasterPlanos(),
        listarMasterLicencas(),
      ])
      setResumo(resumoData)
      setPlanos(planosData)
      setLicencas(licencasData)
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

  // Contagens dos filtros de licenças
  const contagensFiltros = useMemo(() => {
    const total = licencas.length
    const ativas = licencas.filter((l) => l.status === 'Ativa').length
    const renovadas = licencas.filter((l) => l.total_renovacoes > 0).length
    const expiradas = licencas.filter((l) => l.status === 'Expirada' || l.vencida).length
    const pausadas = licencas.filter((l) => l.status === 'Pausada').length
    const trial = licencas.filter((l) => l.status === 'Trial').length
    return { total, ativas, renovadas, expiradas, pausadas, trial }
  }, [licencas])

  // Licenças filtradas por busca e situação
  const licencasFiltradas = useMemo(() => {
    return licencas.filter((lic) => {
      // Filtro de situação
      if (filtroSituacao === 'ativas' && lic.status !== 'Ativa') return false
      if (filtroSituacao === 'renovadas' && lic.total_renovacoes <= 0) return false
      if (filtroSituacao === 'expiradas' && lic.status !== 'Expirada' && !lic.vencida) return false
      if (filtroSituacao === 'pausadas' && lic.status !== 'Pausada') return false
      if (filtroSituacao === 'trial' && lic.status !== 'Trial') return false

      // Busca por cliente, CNPJ, plano ou número da licença
      if (buscaLicenca.trim()) {
        const termo = buscaLicenca.toLowerCase()
        const matchNome = (lic.nome || '').toLowerCase().includes(termo)
        const matchDoc = (lic.documento || '').toLowerCase().includes(termo)
        const matchCnpjMatriz = (lic.cnpj_matriz || '').toLowerCase().includes(termo)
        const matchPlano = (lic.plano_nome || '').toLowerCase().includes(termo)
        const matchLic = (lic.numero_licenca || '').toLowerCase().includes(termo)
        return matchNome || matchDoc || matchCnpjMatriz || matchPlano || matchLic
      }

      return true
    })
  }, [licencas, filtroSituacao, buscaLicenca])

  // ==========================================
  // AÇÕES DAS LICENÇAS
  // ==========================================

  // Botão +30d
  const handleRenovar30d = async (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Operação não permitida',
        description: 'A conta de origem (HOSPITAL HOME) é isenta e permanente.',
        variant: 'destructive',
      })
      return
    }

    try {
      setRenovandoId(lic.id)
      const res = await renovarLicenca30Dias(lic.id)
      toast({
        title: 'Licença renovada (+30 dias)',
        description: res.message || `Nova expiração: ${res.data_expiracao_nova}.`,
      })
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao renovar',
        description: err?.message || 'Não foi possível renovar a licença.',
        variant: 'destructive',
      })
    } finally {
      setRenovandoId(null)
    }
  }

  // Abrir Histórico
  const handleAbrirHistorico = async (lic: MasterLicencaItem) => {
    setLicencaSelecionada(lic)
    setModalHistoricoAberto(true)
    setCarregandoHistorico(true)
    try {
      const res = await obterHistoricoLicenca(lic.id)
      setHistoricoEventos(res.historico || [])
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: err?.message || 'Falha ao buscar linha do tempo de eventos.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoHistorico(false)
    }
  }

  // Abrir Editar Limites
  const handleAbrirLimites = (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Ação não permitida',
        description:
          'Os limites do assinante de origem HOSPITAL HOME são permanentes e ilimitados.',
        variant: 'destructive',
      })
      return
    }
    setLicencaSelecionada(lic)
    setLimitesForm({
      limites_personalizados: lic.limites_personalizados,
      limite_empresas: lic.limite_empresas || 1,
      limite_usuarios: lic.limite_usuarios || 3,
    })
    setModalLimitesAberto(true)
  }

  const handleSalvarLimites = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licencaSelecionada) return
    try {
      setSalvandoLimites(true)
      await editarLimitesLicenca(licencaSelecionada.id, limitesForm)
      toast({
        title: 'Limites atualizados',
        description: 'Os limites da licença foram alterados com sucesso.',
      })
      setModalLimitesAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar limites',
        description: err?.message || 'Falha ao atualizar limites da licença.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoLimites(false)
    }
  }

  // Abrir Editar Expiração
  const handleAbrirExpiracao = (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Ação não permitida',
        description: 'O assinante HOSPITAL HOME é permanente e não possui expiração.',
        variant: 'destructive',
      })
      return
    }
    setLicencaSelecionada(lic)
    setNovaExpiracaoInput(lic.data_expiracao || '')
    setModalExpiracaoAberto(true)
  }

  const handleSalvarExpiracao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licencaSelecionada) return
    try {
      setSalvandoExpiracao(true)
      await editarExpiracaoLicenca(licencaSelecionada.id, novaExpiracaoInput)
      toast({
        title: 'Expiração alterada',
        description: `Nova data de validade gravada com sucesso: ${novaExpiracaoInput || 'Sem expiração'}.`,
      })
      setModalExpiracaoAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar expiração',
        description: err?.message || 'Falha ao gravar data de expiração.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoExpiracao(false)
    }
  }

  // Abrir Alterar Plano
  const handleAbrirAlterarPlano = (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Ação não permitida',
        description: 'A conta HOSPITAL HOME permanece no Plano Master.',
        variant: 'destructive',
      })
      return
    }
    setLicencaSelecionada(lic)
    setNovoPlanoSelecionado(lic.plano_id || '')
    setModalAlterarPlanoAberto(true)
  }

  const handleSalvarPlanoLicenca = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licencaSelecionada || !novoPlanoSelecionado) return
    try {
      setSalvandoPlanoLicenca(true)
      await alterarPlanoLicenca(licencaSelecionada.id, novoPlanoSelecionado)
      toast({
        title: 'Plano comercial alterado',
        description: 'O plano do assinante foi atualizado com sucesso.',
      })
      setModalAlterarPlanoAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao mudar plano',
        description: err?.message || 'Falha ao alterar o plano da licença.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoPlanoLicenca(false)
    }
  }

  // Abrir Pausar / Reativar
  const handleAbrirStatus = (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Ação não permitida',
        description: 'A conta de origem (HOSPITAL HOME) não pode ser pausada.',
        variant: 'destructive',
      })
      return
    }
    setLicencaSelecionada(lic)
    setMotivoStatus('')
    setModalStatusAberto(true)
  }

  const handleSalvarStatus = async () => {
    if (!licencaSelecionada) return
    const novoSt = licencaSelecionada.status === 'Pausada' ? 'Ativa' : 'Pausada'
    try {
      setSalvandoStatus(true)
      await alterarStatusLicenca(licencaSelecionada.id, novoSt, motivoStatus)
      toast({
        title: novoSt === 'Pausada' ? 'Licença Pausada' : 'Licença Reativada',
        description: `Situação do cliente alterada para ${novoSt}.`,
      })
      setModalStatusAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar situação',
        description: err?.message || 'Falha na alteração da situação.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoStatus(false)
    }
  }

  // Abrir Editar Dados Gerais
  const handleAbrirDadosGerais = (lic: MasterLicencaItem) => {
    setLicencaSelecionada(lic)
    setDadosGeraisForm({
      nome: lic.nome || '',
      documento: lic.documento || '',
      email_contato: lic.email_contato || '',
      telefone: lic.telefone || '',
      whatsapp_contato: lic.whatsapp_contato || '',
      observacoes: lic.observacoes || '',
    })
    setModalDadosGeraisAberto(true)
  }

  const handleSalvarDadosGerais = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licencaSelecionada) return
    if (!dadosGeraisForm.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'O nome do cliente não pode ser deixado em branco.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvandoDadosGerais(true)
      await editarDadosGeraisLicenca(licencaSelecionada.id, dadosGeraisForm)
      toast({
        title: 'Dados cadastrais salvos',
        description: 'Informações do assinante atualizadas com sucesso.',
      })
      setModalDadosGeraisAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar dados',
        description: err?.message || 'Falha na atualização cadastral.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoDadosGerais(false)
    }
  }

  // Abrir Excluir Licença
  const handleAbrirExcluirLicenca = (lic: MasterLicencaItem) => {
    if (lic.origem) {
      toast({
        title: 'Operação proibida',
        description: 'O assinante de origem HOSPITAL HOME NUNCA pode ser excluído.',
        variant: 'destructive',
      })
      return
    }
    setLicencaSelecionada(lic)
    setDigitacaoConfirmacaoExclusao('')
    setModalExcluirLicencaAberto(true)
  }

  const handleConfirmarExclusaoLicenca = async () => {
    if (!licencaSelecionada) return
    const esperado = licencaSelecionada.nome.trim().toUpperCase()
    const digitado = digitacaoConfirmacaoExclusao.trim().toUpperCase()

    if (digitado !== esperado) {
      toast({
        title: 'Confirmação incorreta',
        description: `Digite exatamente "${licencaSelecionada.nome}" para autorizar a exclusão.`,
        variant: 'destructive',
      })
      return
    }

    try {
      setExcluindoLicenca(true)
      await excluirLicencaCascata(licencaSelecionada.id, digitacaoConfirmacaoExclusao.trim())
      toast({
        title: 'Licença excluída',
        description: `O assinante ${licencaSelecionada.nome} e todos os dados foram apagados.`,
      })
      setModalExcluirLicencaAberto(false)
      await carregarDadosMaster()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir licença',
        description: err?.message || 'Falha ao processar exclusão em cascata.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoLicenca(false)
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
              {/* Licenças de clientes (9.7b) */}
              <TabsTrigger
                value="licencas"
                className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs px-4 py-2"
              >
                <KeyRound size={15} className="text-purple-600" />
                Licenças de clientes ({licencas.length})
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

          {/* ABA 1: Licenças de Clientes (ITEM 1 DO PROMPT 9.7b) */}
          <TabsContent value="licencas" className="mt-0 space-y-4">
            {/* Barra de Filtros e Busca de Licenças */}
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Campo de Busca */}
                  <div className="relative flex-1">
                    <Search
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      placeholder="Buscar por cliente, CNPJ, plano ou número da licença..."
                      value={buscaLicenca}
                      onChange={(e) => setBuscaLicenca(e.target.value)}
                      className="pl-9 h-9 text-xs bg-slate-50/70 border-slate-200"
                    />
                    {buscaLicenca && (
                      <button
                        type="button"
                        onClick={() => setBuscaLicenca('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Filtros de Situação com Contagem */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={filtroSituacao === 'todos' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('todos')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'todos'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Todos ({contagensFiltros.total})
                    </Button>

                    <Button
                      size="sm"
                      variant={filtroSituacao === 'ativas' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('ativas')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'ativas'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Ativas ({contagensFiltros.ativas})
                    </Button>

                    <Button
                      size="sm"
                      variant={filtroSituacao === 'renovadas' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('renovadas')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'renovadas'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                      title="Renovadas ao menos uma vez"
                    >
                      Renovadas ({contagensFiltros.renovadas})
                    </Button>

                    <Button
                      size="sm"
                      variant={filtroSituacao === 'expiradas' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('expiradas')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'expiradas'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Expiradas ({contagensFiltros.expiradas})
                    </Button>

                    <Button
                      size="sm"
                      variant={filtroSituacao === 'pausadas' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('pausadas')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'pausadas'
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Pausadas ({contagensFiltros.pausadas})
                    </Button>

                    <Button
                      size="sm"
                      variant={filtroSituacao === 'trial' ? 'default' : 'outline'}
                      onClick={() => setFiltroSituacao('trial')}
                      className={`h-8 text-xs px-2.5 font-medium ${
                        filtroSituacao === 'trial'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Trial ({contagensFiltros.trial})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Licenças (um assinante por linha) */}
            <Card className="border-slate-200 shadow-xs bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <th className="py-3 px-3.5">Licença</th>
                      <th className="py-3 px-3.5">Cliente</th>
                      <th className="py-3 px-3.5">Plano Contratado</th>
                      <th className="py-3 px-3.5 text-center">Limites Efetivos</th>
                      <th className="py-3 px-3.5 text-right">Mensalidade</th>
                      <th className="py-3 px-3.5">Expiração</th>
                      <th className="py-3 px-3.5 text-center">Situação</th>
                      <th className="py-3 px-3.5">Contato / WhatsApp</th>
                      <th className="py-3 px-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {carregandoDados ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw size={15} className="animate-spin text-indigo-600" />
                            Carregando licenças de clientes...
                          </div>
                        </td>
                      </tr>
                    ) : licencasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-500">
                          <KeyRound size={28} className="mx-auto text-slate-300 mb-2" />
                          <p className="font-semibold text-slate-700">Nenhuma licença encontrada</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {buscaLicenca || filtroSituacao !== 'todos'
                              ? 'Tente ajustar os filtros ou o termo de busca.'
                              : 'Não há clientes assinantes cadastrados no sistema.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      licencasFiltradas.map((lic) => {
                        const ehHospitalHome = lic.origem
                        const ehRenovando = renovandoId === lic.id

                        return (
                          <tr
                            key={lic.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              ehHospitalHome ? 'bg-amber-50/20' : ''
                            }`}
                          >
                            {/* Coluna 1: Número da Licença */}
                            <td className="py-3 px-3.5 align-middle font-mono font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <KeyRound size={13} className="text-purple-600 shrink-0" />
                                <span>{lic.numero_licenca}</span>
                              </div>
                            </td>

                            {/* Coluna 2: Cliente (Nome, CNPJ da Matriz e Selo ORIGEM na HOSPITAL HOME) */}
                            <td className="py-3 px-3.5 align-middle">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs">
                                    {lic.nome}
                                  </span>
                                  {ehHospitalHome && (
                                    <Badge className="bg-amber-500 text-slate-950 font-extrabold text-[9px] px-1.5 py-0 border-none">
                                      ORIGEM
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {lic.cnpj_matriz || lic.documento || 'Sem documento'}
                                </span>
                              </div>
                            </td>

                            {/* Coluna 3: Plano Contratado (Selo Master no plano exclusivo_master e Link para Diálogo de Detalhes) */}
                            <td className="py-3 px-3.5 align-middle">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => abrirDetalhesPlano(lic.plano_id)}
                                  className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline text-left cursor-pointer transition-colors flex items-center gap-1 group"
                                  title="Clique para ver os detalhes completos deste plano"
                                >
                                  <span>{lic.plano_nome}</span>
                                  <Info
                                    size={12}
                                    className="text-indigo-400 group-hover:text-indigo-600"
                                  />
                                </button>
                                {lic.plano_exclusivo_master && (
                                  <Badge className="bg-indigo-600 text-white font-bold text-[9px] px-1.5 py-0">
                                    Master
                                  </Badge>
                                )}
                                {lic.plano_etiqueta && !lic.plano_exclusivo_master && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] text-indigo-700 bg-indigo-50 border-indigo-200 px-1 py-0"
                                  >
                                    {lic.plano_etiqueta}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Coluna 4: Limites Efetivos (Empresas e Usuários com selo Custom) */}
                            <td className="py-3 px-3.5 align-middle text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span title="Limite de empresas">
                                    🏢{' '}
                                    <strong className="text-slate-800">
                                      {lic.limite_empresas <= 0 ? '∞' : lic.limite_empresas}
                                    </strong>
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span title="Limite de usuários">
                                    👤{' '}
                                    <strong className="text-slate-800">
                                      {lic.limite_usuarios <= 0 ? '∞' : lic.limite_usuarios}
                                    </strong>
                                  </span>
                                </div>
                                {lic.limites_personalizados && (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-50 text-amber-800 border-amber-300 text-[9px] font-semibold px-1 py-0 mt-0.5"
                                  >
                                    Custom
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Coluna 5: Valor Mensal ou "Isento" */}
                            <td className="py-3 px-3.5 align-middle text-right font-medium">
                              {lic.isento ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-slate-100 text-slate-700 font-bold text-[10px]"
                                >
                                  Isento
                                </Badge>
                              ) : (
                                <span className="text-slate-900 font-bold">
                                  {formatarMoeda(lic.valor_mensal)}
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    /mês
                                  </span>
                                </span>
                              )}
                            </td>

                            {/* Coluna 6: Expiração em vermelho com "Vencida" quando já passou */}
                            <td className="py-3 px-3.5 align-middle">
                              {lic.origem ? (
                                <span className="text-slate-500 font-medium text-[11px]">
                                  Vitalícia
                                </span>
                              ) : lic.data_expiracao ? (
                                <div className="flex flex-col">
                                  <span
                                    className={`font-semibold ${
                                      lic.vencida ? 'text-rose-600 font-bold' : 'text-slate-700'
                                    }`}
                                  >
                                    {lic.data_expiracao}
                                  </span>
                                  {lic.vencida && (
                                    <Badge className="bg-rose-100 text-rose-800 border border-rose-300 text-[9px] px-1 py-0 w-fit font-bold">
                                      Vencida
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">Sem expiração</span>
                              )}
                            </td>

                            {/* Coluna 7: Situação + Selo "Nª licença" (renovações) */}
                            <td className="py-3 px-3.5 align-middle text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-bold px-2 py-0.5 ${
                                    lic.status === 'Ativa'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : lic.status === 'Trial'
                                        ? 'bg-purple-50 text-purple-800 border-purple-300'
                                        : lic.status === 'Pausada'
                                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                                          : 'bg-rose-50 text-rose-800 border-rose-300'
                                  }`}
                                >
                                  {lic.status}
                                </Badge>

                                {lic.total_renovacoes > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-semibold px-1 py-0"
                                    title={`Renovada ${lic.total_renovacoes} vez(es)`}
                                  >
                                    {lic.total_renovacoes}ª licença
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Coluna 8: WhatsApp com link para wa.me */}
                            <td className="py-3 px-3.5 align-middle">
                              {lic.whatsapp_contato ? (
                                <a
                                  href={`https://wa.me/55${lic.whatsapp_contato.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-[11px] hover:underline"
                                  title="Abrir conversa no WhatsApp"
                                >
                                  <MessageCircle size={13} className="text-emerald-600" />
                                  <span>{lic.whatsapp_contato}</span>
                                </a>
                              ) : lic.telefone ? (
                                <span className="text-slate-600 text-[11px] flex items-center gap-1">
                                  <Phone size={11} className="text-slate-400" />
                                  {lic.telefone}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>

                            {/* Coluna 9: Ações (+30d e Menu Poderes da Licença) */}
                            <td className="py-3 px-3.5 align-middle text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botão +30d */}
                                {!ehHospitalHome && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRenovar30d(lic)}
                                    disabled={ehRenovando}
                                    className="h-7 text-[11px] px-2 font-bold bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-900 gap-1"
                                    title="Renovar +30 dias de validade"
                                  >
                                    {ehRenovando ? (
                                      <RefreshCw size={11} className="animate-spin" />
                                    ) : (
                                      <>
                                        <Zap size={11} className="text-emerald-600" />
                                        +30d
                                      </>
                                    )}
                                  </Button>
                                )}

                                {/* Menu Poderes da Licença */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                      title="Poderes da licença"
                                    >
                                      <MoreVertical size={14} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56 text-xs">
                                    <DropdownMenuLabel className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                                      Poderes da Licença
                                    </DropdownMenuLabel>

                                    {/* Item 1: Histórico de renovações (sempre disponível) */}
                                    <DropdownMenuItem
                                      onClick={() => handleAbrirHistorico(lic)}
                                      className="gap-2 cursor-pointer"
                                    >
                                      <History size={14} className="text-indigo-600" />
                                      <span>Histórico de renovações</span>
                                    </DropdownMenuItem>

                                    {/* Item 2: Editar dados gerais (sempre disponível) */}
                                    <DropdownMenuItem
                                      onClick={() => handleAbrirDadosGerais(lic)}
                                      className="gap-2 cursor-pointer"
                                    >
                                      <Pencil size={14} className="text-blue-600" />
                                      <span>Editar dados gerais</span>
                                    </DropdownMenuItem>

                                    {/* Demais itens: Desativados/Ocultos para HOSPITAL HOME */}
                                    {!ehHospitalHome && (
                                      <>
                                        <DropdownMenuSeparator />

                                        {/* Editar limites desta licença */}
                                        <DropdownMenuItem
                                          onClick={() => handleAbrirLimites(lic)}
                                          className="gap-2 cursor-pointer"
                                        >
                                          <Sliders size={14} className="text-amber-600" />
                                          <span>Editar limites desta licença</span>
                                        </DropdownMenuItem>

                                        {/* Editar data de expiração */}
                                        <DropdownMenuItem
                                          onClick={() => handleAbrirExpiracao(lic)}
                                          className="gap-2 cursor-pointer"
                                        >
                                          <CalendarClock size={14} className="text-purple-600" />
                                          <span>Editar data de expiração</span>
                                        </DropdownMenuItem>

                                        {/* Alterar plano do cliente */}
                                        <DropdownMenuItem
                                          onClick={() => handleAbrirAlterarPlano(lic)}
                                          className="gap-2 cursor-pointer"
                                        >
                                          <ArrowRightLeft size={14} className="text-teal-600" />
                                          <span>Alterar plano do cliente</span>
                                        </DropdownMenuItem>

                                        {/* Pausar licença / Reativar */}
                                        <DropdownMenuItem
                                          onClick={() => handleAbrirStatus(lic)}
                                          className="gap-2 cursor-pointer"
                                        >
                                          {lic.status === 'Pausada' ? (
                                            <>
                                              <Play size={14} className="text-emerald-600" />
                                              <span>Reativar licença</span>
                                            </>
                                          ) : (
                                            <>
                                              <Pause size={14} className="text-amber-600" />
                                              <span>Pausar licença</span>
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                      </>
                                    )}

                                    <DropdownMenuSeparator />

                                    {/* Acessar painel do assinante (Prompt 9.7b2 - Requisito 1) */}
                                    <DropdownMenuItem
                                      onClick={() => handleAcessarPainelCliente(lic)}
                                      disabled={acessandoPainelId === lic.id || ehHospitalHome}
                                      className="gap-2 cursor-pointer font-medium text-slate-800 hover:text-blue-600 focus:text-blue-600 focus:bg-blue-50"
                                      title={
                                        ehHospitalHome
                                          ? 'Você já é o assinante de origem'
                                          : 'Entrar no ERP deste assinante em modo suporte master'
                                      }
                                    >
                                      <LayoutDashboard size={14} className="text-blue-600" />
                                      <span className="flex-1">
                                        {acessandoPainelId === lic.id
                                          ? 'Acessando painel...'
                                          : ehHospitalHome
                                            ? 'Painel de Origem'
                                            : 'Acessar painel'}
                                      </span>
                                      <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1 py-0.5 rounded">
                                        Suporte
                                      </span>
                                    </DropdownMenuItem>

                                    {/* Excluir licença (proibido na HOSPITAL HOME) */}
                                    {!ehHospitalHome && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => handleAbrirExcluirLicenca(lic)}
                                          className="gap-2 text-rose-600 focus:text-rose-700 focus:bg-rose-50 cursor-pointer font-semibold"
                                        >
                                          <Trash2 size={14} />
                                          <span>Excluir licença...</span>
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
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

                      {/* Rodapé do Cartão com Botões Detalhes, Editar e Excluir */}
                      <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => abrirDetalhesPlano(plano)}
                          className="h-8 text-xs font-semibold gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                          title="Ver detalhes completos e assinantes deste plano"
                        >
                          <Eye size={13} />
                          Detalhes
                        </Button>

                        <div className="flex items-center gap-1.5">
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
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* DIÁLOGO DE DETALHES COMPLETOS DO PLANO DE LICENÇA (Prompt 9.7c) */}
      <Dialog open={modalDetalhesPlanoAberto} onOpenChange={setModalDetalhesPlanoAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Layers size={18} />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      {planoDetalhes?.nome}
                      {planoDetalhes?.exclusivo_master && (
                        <Badge className="bg-amber-400 text-slate-950 font-extrabold text-[10px] px-2 py-0 border-none">
                          MASTER
                        </Badge>
                      )}
                    </DialogTitle>
                    {planoDetalhes?.etiqueta && (
                      <span className="text-xs font-semibold text-indigo-600">
                        {planoDetalhes.etiqueta}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Badge
                variant={planoDetalhes?.ativo ? 'default' : 'secondary'}
                className={`text-[11px] font-bold px-2.5 py-0.5 ${
                  planoDetalhes?.ativo ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {planoDetalhes?.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-600 pt-1">
              {planoDetalhes?.descricao || 'Sem descrição cadastrada para este plano comercial.'}
            </DialogDescription>
          </DialogHeader>

          {planoDetalhes && (
            <div className="space-y-4 py-2">
              {/* Aviso se Exclusivo Master */}
              {planoDetalhes.exclusivo_master && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                  <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Plano Exclusivo do Usuário Master:</span>
                    <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
                      Este plano é reservado à conta master (HOSPITAL HOME) e não fica disponível
                      para novos clientes no catálogo público de auto-cadastro. Possui isenção
                      permanente de mensalidade e não pode ser excluído.
                    </p>
                  </div>
                </div>
              )}

              {/* Grade de Parâmetros Principais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Valor Mensal
                  </span>
                  <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                    {planoDetalhes.valor_mensal === 0 ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-800 font-bold text-xs"
                      >
                        Isento
                      </Badge>
                    ) : (
                      formatarMoeda(planoDetalhes.valor_mensal)
                    )}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Limite Empresas
                  </span>
                  <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                    {!planoDetalhes.limite_empresas || planoDetalhes.limite_empresas <= 0
                      ? 'Ilimitado'
                      : `${planoDetalhes.limite_empresas} empresa(s)`}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Limite Usuários
                  </span>
                  <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                    {!planoDetalhes.limite_usuarios || planoDetalhes.limite_usuarios <= 0
                      ? 'Ilimitado'
                      : `${planoDetalhes.limite_usuarios} usuário(s)`}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                    Total Assinantes
                  </span>
                  <span className="text-base font-extrabold text-indigo-700 mt-0.5 block">
                    {planoDetalhes.total_assinantes ?? (planoDetalhes.assinantes?.length || 0)}
                  </span>
                </div>
              </div>

              {/* Recursos Fiscais Habilitados */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">
                  Módulos e Recursos Fiscais Liberados:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div
                    className={`flex items-center gap-2 p-2 rounded border text-xs font-semibold ${
                      planoDetalhes.permite_nfe
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                    }`}
                  >
                    <FileText size={15} />
                    <span>
                      NF-e (modelo 55): {planoDetalhes.permite_nfe ? 'Habilitado' : 'Bloqueado'}
                    </span>
                  </div>

                  <div
                    className={`flex items-center gap-2 p-2 rounded border text-xs font-semibold ${
                      planoDetalhes.permite_nfce
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                    }`}
                  >
                    <FileCheck2 size={15} />
                    <span>
                      NFC-e (modelo 65): {planoDetalhes.permite_nfce ? 'Habilitado' : 'Bloqueado'}
                    </span>
                  </div>

                  <div
                    className={`flex items-center gap-2 p-2 rounded border text-xs font-semibold ${
                      planoDetalhes.permite_sped
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                    }`}
                  >
                    <Boxes size={15} />
                    <span>
                      SPED Fiscal: {planoDetalhes.permite_sped ? 'Habilitado' : 'Bloqueado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadados: Datas de Criação e Atualização */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-400" />
                  <span>
                    Criado em:{' '}
                    <strong className="text-slate-700">
                      {planoDetalhes.created
                        ? new Date(planoDetalhes.created).toLocaleString('pt-BR')
                        : 'Não informado'}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-slate-400" />
                  <span>
                    Última atualização:{' '}
                    <strong className="text-slate-700">
                      {planoDetalhes.updated
                        ? new Date(planoDetalhes.updated).toLocaleString('pt-BR')
                        : 'Não informado'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* SEÇÃO: Assinantes neste Plano */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={15} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">Assinantes neste plano</span>
                    <Badge
                      variant="outline"
                      className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold"
                    >
                      {planoDetalhes.assinantes?.length || 0}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-500">Base ativa vinculada</span>
                </div>

                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {!planoDetalhes.assinantes || planoDetalhes.assinantes.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Nenhum assinante neste plano
                    </div>
                  ) : (
                    planoDetalhes.assinantes.map((ass) => (
                      <div
                        key={ass.id}
                        className="p-3 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{ass.nome}</span>
                            {ass.origem && (
                              <Badge className="bg-amber-500 text-slate-950 font-extrabold text-[9px] px-1.5 py-0 border-none">
                                ORIGEM
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <KeyRound size={11} className="text-purple-600" />
                              {ass.numero_licenca}
                            </span>
                            <span>•</span>
                            <span>
                              {ass.origem
                                ? 'Vitalícia'
                                : ass.data_expiracao
                                  ? `Validade: ${ass.data_expiracao}`
                                  : 'Sem expiração'}
                            </span>
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold px-2 py-0.5 ${
                            ass.status === 'Ativa'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : ass.status === 'Trial'
                                ? 'bg-purple-50 text-purple-800 border-purple-300'
                                : ass.status === 'Pausada'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          {ass.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
            {planoDetalhes && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setModalDetalhesPlanoAberto(false)
                  abrirEditarPlano(planoDetalhes)
                }}
                className="gap-1.5 text-xs font-semibold mr-auto"
              >
                <Pencil size={13} />
                Editar Plano
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setModalDetalhesPlanoAberto(false)}
              className="text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* =================================================================== */}
      {/* MODAIS DOS PODERES DA LICENÇA (ITEM 2 DO PROMPT 9.7b)               */}
      {/* =================================================================== */}

      {/* MODAL L1: Histórico de Renovações e Linha do Tempo */}
      <Dialog open={modalHistoricoAberto} onOpenChange={setModalHistoricoAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <History size={18} />
              Histórico da Licença — {licencaSelecionada?.nome}
            </DialogTitle>
            <DialogDescription>
              Linha do tempo completa de eventos, vigências e alterações registradas em{' '}
              <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">
                {licencaSelecionada?.numero_licenca}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {carregandoHistorico ? (
              <div className="py-12 text-center text-slate-500">
                <RefreshCw size={18} className="animate-spin mx-auto text-indigo-600 mb-2" />
                <p className="text-xs">Carregando linha do tempo de eventos...</p>
              </div>
            ) : historicoEventos.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Nenhum evento registrado até o momento para esta licença.
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                {historicoEventos.map((ev) => {
                  const dataFormatada = ev.created
                    ? new Date(ev.created).toLocaleString('pt-BR')
                    : ''

                  return (
                    <div key={ev.id} className="relative flex items-start gap-3 pl-8 text-xs">
                      <div
                        className={`absolute left-2 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white -translate-x-1/2 ${
                          ev.tipo === 'Criação'
                            ? 'border-indigo-600 bg-indigo-600'
                            : ev.tipo === 'Renovação +30d' || ev.tipo === 'Reativação'
                              ? 'border-emerald-600 bg-emerald-600'
                              : ev.tipo === 'Pausa'
                                ? 'border-amber-600 bg-amber-600'
                                : 'border-blue-600 bg-blue-600'
                        }`}
                      />
                      <div className="flex-1 p-3 rounded-lg border border-slate-200 bg-slate-50/70 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold ${
                                ev.tipo === 'Criação'
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                  : ev.tipo === 'Renovação +30d' || ev.tipo === 'Reativação'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : ev.tipo === 'Pausa'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-blue-50 text-blue-800 border-blue-300'
                              }`}
                            >
                              {ev.tipo}
                            </Badge>
                            {ev.plano_nome && (
                              <span className="text-[11px] font-semibold text-slate-700">
                                Plano: {ev.plano_nome}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {dataFormatada}
                          </span>
                        </div>

                        <p className="text-slate-700 text-xs mt-1 leading-relaxed">
                          {ev.descricao}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60">
                          <span>
                            Responsável: <strong>{ev.criado_por_nome || 'Master'}</strong>
                          </span>
                          {ev.validade_ate && (
                            <span>
                              Vigência até: <strong>{ev.validade_ate}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalHistoricoAberto(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL L2: Editar Limites desta Licença */}
      <Dialog open={modalLimitesAberto} onOpenChange={setModalLimitesAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Sliders size={18} />
              Editar Limites da Licença
            </DialogTitle>
            <DialogDescription>
              Personalize os limites de empresas e usuários para {licencaSelecionada?.nome}. Ao
              salvar, os limites individuais sobrepõem os valores do plano contratado.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarLimites} className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50">
              <div>
                <Label className="text-xs font-bold text-amber-950">
                  Ativar limites personalizados
                </Label>
                <p className="text-[11px] text-amber-800">
                  Desmarque se desejar voltar a usar os limites do plano comercial.
                </p>
              </div>
              <Switch
                checked={limitesForm.limites_personalizados}
                onCheckedChange={(checked) =>
                  setLimitesForm((prev) => ({ ...prev, limites_personalizados: checked }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Limite de Empresas</Label>
                <Input
                  type="number"
                  min={0}
                  value={limitesForm.limite_empresas}
                  onChange={(e) =>
                    setLimitesForm((prev) => ({
                      ...prev,
                      limite_empresas: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  disabled={!limitesForm.limites_personalizados}
                  className="text-xs h-9 font-semibold"
                />
                <p className="text-[10px] text-slate-400">0 = Ilimitado</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Limite de Usuários</Label>
                <Input
                  type="number"
                  min={0}
                  value={limitesForm.limite_usuarios}
                  onChange={(e) =>
                    setLimitesForm((prev) => ({
                      ...prev,
                      limite_usuarios: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  disabled={!limitesForm.limites_personalizados}
                  className="text-xs h-9 font-semibold"
                />
                <p className="text-[10px] text-slate-400">0 = Ilimitado</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalLimitesAberto(false)}
                disabled={salvandoLimites}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoLimites}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 font-semibold"
              >
                {salvandoLimites ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Salvar Limites
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL L3: Editar Data de Expiração */}
      <Dialog open={modalExpiracaoAberto} onOpenChange={setModalExpiracaoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <CalendarClock size={18} />
              Editar Data de Expiração
            </DialogTitle>
            <DialogDescription>
              Ajuste manualmente a validade da licença para {licencaSelecionada?.nome}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarExpiracao} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Data de Validade (AAAA-MM-DD)</Label>
              <Input
                type="date"
                value={novaExpiracaoInput}
                onChange={(e) => setNovaExpiracaoInput(e.target.value)}
                className="text-xs h-9 font-semibold"
              />
              <p className="text-[10px] text-slate-500">
                Deixe em branco caso a licença seja indeterminada/sem expiração.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalExpiracaoAberto(false)}
                disabled={salvandoExpiracao}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoExpiracao}
                className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 font-semibold"
              >
                {salvandoExpiracao ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Gravando...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Salvar Expiração
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL L4: Alterar Plano do Cliente */}
      <Dialog open={modalAlterarPlanoAberto} onOpenChange={setModalAlterarPlanoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-teal-700">
              <ArrowRightLeft size={18} />
              Alterar Plano Comercial
            </DialogTitle>
            <DialogDescription>
              Selecione o novo plano comercial do catálogo para vincular a{' '}
              {licencaSelecionada?.nome}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarPlanoLicenca} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Escolha o Plano do Catálogo</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {planos.map((pl) => {
                  const selecionado = novoPlanoSelecionado === pl.id
                  return (
                    <div
                      key={pl.id}
                      onClick={() => setNovoPlanoSelecionado(pl.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                        selecionado
                          ? 'border-teal-500 bg-teal-50/70 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{pl.nome}</span>
                          {pl.exclusivo_master && (
                            <Badge className="bg-indigo-600 text-white text-[9px] px-1 py-0">
                              Master
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Limites: {pl.limite_empresas || '∞'} emp / {pl.limite_usuarios || '∞'}{' '}
                          usuarios
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">
                          {formatarMoeda(pl.valor_mensal)}
                        </span>
                        <span className="block text-[10px] text-slate-400">/mês</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAlterarPlanoAberto(false)}
                disabled={salvandoPlanoLicenca}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoPlanoLicenca || !novoPlanoSelecionado}
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 font-semibold"
              >
                {salvandoPlanoLicenca ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Alterando...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Confirmar Mudança
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL L5: Pausar / Reativar Licença */}
      <Dialog open={modalStatusAberto} onOpenChange={setModalStatusAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              {licencaSelecionada?.status === 'Pausada' ? (
                <>
                  <Play size={18} className="text-emerald-600" />
                  Reativar Licença de Cliente
                </>
              ) : (
                <>
                  <Pause size={18} className="text-amber-600" />
                  Pausar Licença de Cliente
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {licencaSelecionada?.status === 'Pausada'
                ? `Deseja restabelecer o acesso total do assinante ${licencaSelecionada?.nome}?`
                : `Ao pausar a licença de ${licencaSelecionada?.nome}, os acessos ao ERP ficarão suspensos até a reativação.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Motivo da Ação (Opcional)</Label>
              <Input
                placeholder="Ex.: Solicitação do cliente, atraso comercial, etc."
                value={motivoStatus}
                onChange={(e) => setMotivoStatus(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalStatusAberto(false)}
              disabled={salvandoStatus}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarStatus}
              disabled={salvandoStatus}
              className={
                licencaSelecionada?.status === 'Pausada'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5'
                  : 'bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5'
              }
            >
              {salvandoStatus ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Processando...
                </>
              ) : licencaSelecionada?.status === 'Pausada' ? (
                <>
                  <Play size={14} />
                  Confirmar Reativação
                </>
              ) : (
                <>
                  <Pause size={14} />
                  Confirmar Pausa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL L6: Editar Dados Gerais */}
      <Dialog open={modalDadosGeraisAberto} onOpenChange={setModalDadosGeraisAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Pencil size={18} />
              Editar Dados Gerais do Cliente
            </DialogTitle>
            <DialogDescription>
              Atualize as informações cadastrais e canais de contato de {licencaSelecionada?.nome}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarDadosGerais} className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Razão Social / Nome do Cliente *</Label>
              <Input
                value={dadosGeraisForm.nome}
                onChange={(e) => setDadosGeraisForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
                className="text-xs h-9 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Documento / CNPJ / CPF</Label>
                <Input
                  value={dadosGeraisForm.documento}
                  onChange={(e) =>
                    setDadosGeraisForm((prev) => ({ ...prev, documento: e.target.value }))
                  }
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">E-mail de Contato</Label>
                <Input
                  type="email"
                  value={dadosGeraisForm.email_contato}
                  onChange={(e) =>
                    setDadosGeraisForm((prev) => ({ ...prev, email_contato: e.target.value }))
                  }
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Telefone</Label>
                <Input
                  value={dadosGeraisForm.telefone}
                  onChange={(e) =>
                    setDadosGeraisForm((prev) => ({ ...prev, telefone: e.target.value }))
                  }
                  placeholder="(00) 0000-0000"
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <MessageCircle size={13} className="text-emerald-600" />
                  WhatsApp
                </Label>
                <Input
                  value={dadosGeraisForm.whatsapp_contato}
                  onChange={(e) =>
                    setDadosGeraisForm((prev) => ({ ...prev, whatsapp_contato: e.target.value }))
                  }
                  placeholder="Ex: 85999998888"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observações Internas</Label>
              <Textarea
                value={dadosGeraisForm.observacoes}
                onChange={(e) =>
                  setDadosGeraisForm((prev) => ({ ...prev, observacoes: e.target.value }))
                }
                rows={2}
                className="text-xs resize-none"
                placeholder="Anotações comerciais ou operacionais..."
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalDadosGeraisAberto(false)}
                disabled={salvandoDadosGerais}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoDadosGerais}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 font-semibold"
              >
                {salvandoDadosGerais ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Salvar Dados
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL L7: Excluir Licença em Cascata (com Confirmação Digitada) */}
      <Dialog open={modalExcluirLicencaAberto} onOpenChange={setModalExcluirLicencaAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 size={18} />
              Excluir Licença e Assinante (Cascata Total)
            </DialogTitle>
            <DialogDescription>
              Esta ação apagará permanentemente o cliente{' '}
              <strong className="text-slate-900">{licencaSelecionada?.nome}</strong> (Licença:{' '}
              <code>{licencaSelecionada?.numero_licenca}</code>) e <u>TODOS</u> os dados vinculados
              a ele.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs text-slate-600">
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle size={14} className="text-rose-600" />
                ATENÇÃO: AÇÃO DESTRUTIVA IRREVERSÍVEL!
              </p>
              <p className="text-[11px] leading-relaxed">
                Serão excluídas em cascata todas as empresas, usuários, notas fiscais, vendas,
                contas financeiras e movimentos cadastrados por este assinante.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-800">
                Para confirmar, digite exatamente o nome{' '}
                <span className="font-mono font-bold text-rose-700">
                  {licencaSelecionada?.nome}
                </span>
                :
              </Label>
              <Input
                value={digitacaoConfirmacaoExclusao}
                onChange={(e) => setDigitacaoConfirmacaoExclusao(e.target.value)}
                placeholder={licencaSelecionada?.nome}
                className="text-xs h-9 border-rose-300 focus-visible:ring-rose-500 font-medium"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalExcluirLicencaAberto(false)}
              disabled={excluindoLicenca}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmarExclusaoLicenca}
              disabled={
                excluindoLicenca ||
                digitacaoConfirmacaoExclusao.trim().toUpperCase() !==
                  (licencaSelecionada?.nome || '').trim().toUpperCase()
              }
              className="gap-1.5 font-bold"
            >
              {excluindoLicenca ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Excluindo em cascata...
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  Excluir Tudo Definitivamente
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MasterPage
