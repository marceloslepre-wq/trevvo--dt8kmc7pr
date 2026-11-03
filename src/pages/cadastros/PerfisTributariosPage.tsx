import React, { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import {
  FileCode,
  Plus,
  Search,
  Edit2,
  Power,
  RotateCcw,
  Copy,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Layers,
  ArrowLeft,
  Save,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { SelectCodigoFiscal } from '@/components/SelectCodigoFiscal'
import { CenarioCard } from '@/components/CenarioCard'
import {
  PerfilTributario,
  PerfilTributarioRegra,
  RegimePerfilTributario,
  CenarioPerfil,
  CENARIOS_PERFIL,
  CENARIOS_INFO,
  listarPerfisTributarios,
  obterPerfilTributarioCompleto,
  salvarPerfilTributarioCompleto,
  inativarPerfilTributario,
  ativarPerfilTributario,
  duplicarPerfilTributario,
  validarCfopCenario,
  criarRegraPadrao,
} from '@/services/perfisTributarios'
import { getErrorMessage } from '@/lib/pocketbase/errors'
export const PerfisTributariosPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const { toast } = useToast()
  const [, startTransition] = useTransition()

  // Modo: 'lista' ou 'formulario'
  const [modo, setModo] = useState<'lista' | 'formulario'>('lista')

  // Listagem
  const [perfis, setPerfis] = useState<PerfilTributario[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [regimeFiltro, setRegimeFiltro] = useState<RegimePerfilTributario | 'todos'>('todos')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Formulário
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [regime, setRegime] = useState<RegimePerfilTributario>('Regime Normal')
  const [origemPadrao, setOrigemPadrao] = useState('')
  const [tipoItemSpedPadrao, setTipoItemSpedPadrao] = useState('')
  const [cBenef, setCBenef] = useState('')
  const [regras, setRegras] = useState<PerfilTributarioRegra[]>([])
  const [errosForm, setErrosForm] = useState<{ nome?: string }>({})
  const [cenariosAbertos, setCenariosAbertos] = useState<Record<string, boolean>>({
    VENDA_INTERNA_CONTRIBUINTE: true,
  })

  // Modal de Duplicação
  const [modalDuplicarAberto, setModalDuplicarAberto] = useState(false)
  const [perfilParaDuplicar, setPerfilParaDuplicar] = useState<PerfilTributario | null>(null)
  const [novoNomeDuplicacao, setNovoNomeDuplicacao] = useState('')
  const [duplicando, setDuplicando] = useState(false)

  // Modal de Cópia de Cenário
  const [modalCopiarCenarioAberto, setModalCopiarCenarioAberto] = useState(false)
  const [cenarioOrigemCopia, setCenarioOrigemCopia] = useState<CenarioPerfil | null>(null)
  const [cenariosDestinoCopia, setCenariosDestinoCopia] = useState<CenarioPerfil[]>([])

  // Modal Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<PerfilTributario | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<PerfilTributario | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Carregar Lista
  const carregarLista = useCallback(async () => {
    setCarregandoLista(true)
    try {
      const res = await listarPerfisTributarios({
        busca,
        situacao,
        regime: regimeFiltro,
        page: pagina,
        perPage: 20,
        ordenacao: 'nome',
      })
      setPerfis(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao listar perfis tributários'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregandoLista(false)
    }
  }, [busca, situacao, regimeFiltro, pagina, toast])

  useEffect(() => {
    if (modo === 'lista') {
      carregarLista()
    }
  }, [carregarLista, modo])

  // Iniciar Novo Perfil
  const handleNovoPerfil = () => {
    setPerfilId(null)
    setNome('')
    setDescricao('')
    setRegime('Regime Normal')
    setOrigemPadrao('0')
    setTipoItemSpedPadrao('00')
    setCBenef('')
    setErrosForm({})
    // Inicializa todos os 8 cenários
    const regrasIniciais = CENARIOS_PERFIL.map((c) => criarRegraPadrao(c))
    setRegras(regrasIniciais)
    setCenariosAbertos({ VENDA_INTERNA_CONTRIBUINTE: true })
    setModo('formulario')
  }

  // Editar Perfil Existente
  const handleEditarPerfil = async (p: PerfilTributario) => {
    setCarregandoLista(true)
    try {
      const completo = await obterPerfilTributarioCompleto(p.id)
      if (!completo) {
        throw new Error('Perfil não encontrado.')
      }

      setPerfilId(completo.id)
      setNome(completo.nome)
      setDescricao(completo.descricao || '')
      setRegime(completo.regime)
      setOrigemPadrao(completo.origem_padrao || '')
      setTipoItemSpedPadrao(completo.tipo_item_sped_padrao || '')
      setCBenef(completo.c_benef || '')
      setRegras(completo.regras)
      setErrosForm({})
      setCenariosAbertos({ VENDA_INTERNA_CONTRIBUINTE: true })
      setModo('formulario')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar perfil completo'
      toast({
        title: 'Erro ao abrir formulário',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregandoLista(false)
    }
  }

  // Atualizar Regra de um Cenário específico no Form
  const handleUpdateRegra = (cenario: CenarioPerfil, patch: Partial<PerfilTributarioRegra>) => {
    setRegras((prev) =>
      prev.map((r) => {
        if (r.cenario === cenario) {
          return { ...r, ...patch }
        }
        return r
      }),
    )
  }

  // Toggle de expansão de cenário
  const handleToggleCenario = (cenario: CenarioPerfil) => {
    setCenariosAbertos((prev) => ({
      ...prev,
      [cenario]: !prev[cenario],
    }))
  }

  const expandirTodosCenarios = () => {
    const todos: Record<string, boolean> = {}
    CENARIOS_PERFIL.forEach((c) => {
      todos[c] = true
    })
    setCenariosAbertos(todos)
  }

  const recolherTodosCenarios = () => {
    setCenariosAbertos({})
  }

  // Salvar Perfil
  const handleSalvarPerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = nome.trim()
    const erros: { nome?: string } = {}

    if (!nomeLimpo) erros.nome = 'O nome do perfil é obrigatório.'

    if (Object.keys(erros).length > 0) {
      setErrosForm(erros)
      toast({
        title: 'Atenção',
        description: 'Verifique os campos obrigatórios no cabeçalho.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await salvarPerfilTributarioCompleto({
        id: perfilId || undefined,
        nome: nomeLimpo,
        descricao: descricao.trim() || undefined,
        regime,
        origem_padrao: origemPadrao.trim() || undefined,
        tipo_item_sped_padrao: tipoItemSpedPadrao.trim() || undefined,
        c_benef: cBenef.trim() || undefined,
        regras,
      })

      toast({
        title: perfilId ? 'Perfil atualizado' : 'Perfil cadastrado',
        description: `O perfil tributário "${nomeLimpo}" foi gravado com sucesso.`,
      })
      setModo('lista')
      carregarLista()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        title: 'Erro ao salvar perfil',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Modal Duplicação
  const handleAbrirDuplicar = (p: PerfilTributario) => {
    setPerfilParaDuplicar(p)
    setNovoNomeDuplicacao(`${p.nome} (Cópia)`)
    setModalDuplicarAberto(true)
  }

  const handleConfirmarDuplicar = async () => {
    if (!perfilParaDuplicar) return
    const nomeFinal = novoNomeDuplicacao.trim()
    if (!nomeFinal) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o novo nome para o perfil duplicado.',
        variant: 'destructive',
      })
      return
    }

    setDuplicando(true)
    try {
      const duplicado = await duplicarPerfilTributario(perfilParaDuplicar.id, nomeFinal)
      toast({
        title: 'Perfil duplicado com sucesso',
        description: `O perfil "${duplicado.nome}" foi criado com todas as regras herdadas.`,
      })
      setModalDuplicarAberto(false)
      setPerfilParaDuplicar(null)
      carregarLista()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao duplicar perfil'
      toast({
        title: 'Erro na duplicação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setDuplicando(false)
    }
  }

  // Cópia de Parâmetros de um Cenário para outros
  const handleAbrirCopiarCenario = (cenarioOrigem: CenarioPerfil) => {
    setCenarioOrigemCopia(cenarioOrigem)
    // Predefine os demais cenários como destino desmarcados
    setCenariosDestinoCopia([])
    setModalCopiarCenarioAberto(true)
  }

  const handleToggleDestinoCopia = (cenario: CenarioPerfil) => {
    setCenariosDestinoCopia((prev) =>
      prev.includes(cenario) ? prev.filter((c) => c !== cenario) : [...prev, cenario],
    )
  }

  const handleConfirmarCopiarCenario = () => {
    if (!cenarioOrigemCopia || cenariosDestinoCopia.length === 0) return

    const regraOrigem = regras.find((r) => r.cenario === cenarioOrigemCopia)
    if (!regraOrigem) return

    setRegras((prev) =>
      prev.map((r) => {
        if (cenariosDestinoCopia.includes(r.cenario)) {
          // Copia todos os parâmetros tributários mantendo apenas o identificador e CFOP específico
          return {
            ...r,
            cst_icms: regraOrigem.cst_icms,
            csosn: regraOrigem.csosn,
            mod_bc_icms: regraOrigem.mod_bc_icms,
            aliquota_icms: regraOrigem.aliquota_icms,
            reducao_bc_icms_percentual: regraOrigem.reducao_bc_icms_percentual,
            aliquota_fcp: regraOrigem.aliquota_fcp,
            mod_bc_icms_st: regraOrigem.mod_bc_icms_st,
            mva_percentual: regraOrigem.mva_percentual,
            reducao_bc_icms_st_percentual: regraOrigem.reducao_bc_icms_st_percentual,
            aliquota_icms_st: regraOrigem.aliquota_icms_st,
            aliquota_fcp_st: regraOrigem.aliquota_fcp_st,
            percentual_diferimento: regraOrigem.percentual_diferimento,
            motivo_desoneracao: regraOrigem.motivo_desoneracao,
            cst_ipi: regraOrigem.cst_ipi,
            codigo_enquadramento_ipi: regraOrigem.codigo_enquadramento_ipi,
            aliquota_ipi: regraOrigem.aliquota_ipi,
            cst_pis: regraOrigem.cst_pis,
            aliquota_pis: regraOrigem.aliquota_pis,
            cst_cofins: regraOrigem.cst_cofins,
            aliquota_cofins: regraOrigem.aliquota_cofins,
            natureza_receita_pis_cofins: regraOrigem.natureza_receita_pis_cofins,
            cst_ibs_cbs: regraOrigem.cst_ibs_cbs,
            c_class_trib: regraOrigem.c_class_trib,
            aliquota_ibs_uf: regraOrigem.aliquota_ibs_uf,
            aliquota_ibs_municipio: regraOrigem.aliquota_ibs_municipio,
            aliquota_cbs: regraOrigem.aliquota_cbs,
            reducao_ibs_cbs_percentual: regraOrigem.reducao_ibs_cbs_percentual,
            observacao_fiscal: regraOrigem.observacao_fiscal,
          }
        }
        return r
      }),
    )

    toast({
      title: 'Cenários copiados',
      description: `Parâmetros de "${CENARIOS_INFO[cenarioOrigemCopia].titulo}" replicados para ${cenariosDestinoCopia.length} cenário(s).`,
    })
    setModalCopiarCenarioAberto(false)
  }

  // Inativar / Reativar
  const handleConfirmarInativacao = async () => {
    if (!itemParaInativar) return
    setProcessandoAcao(true)
    try {
      await inativarPerfilTributario(itemParaInativar.id)
      toast({
        title: 'Perfil inativado',
        description: `O perfil "${itemParaInativar.nome}" foi inativado.`,
      })
      setItemParaInativar(null)
      carregarLista()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na inativação'
      toast({
        title: 'Erro na inativação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleConfirmarAtivacao = async () => {
    if (!itemParaAtivar) return
    setProcessandoAcao(true)
    try {
      await ativarPerfilTributario(itemParaAtivar.id)
      toast({
        title: 'Perfil reativado',
        description: `O perfil "${itemParaAtivar.nome}" está ativo novamente.`,
      })
      setItemParaAtivar(null)
      carregarLista()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na reativação'
      toast({
        title: 'Erro na reativação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Exportar CSV
  const handleExportarCSV = () => {
    if (perfis.length === 0) {
      toast({
        title: 'Nenhum dado',
        description: 'Não há perfis na lista para exportar.',
      })
      return
    }

    const colunas = [
      'Nome',
      'Regime',
      'Origem Padrão',
      'Tipo Item SPED',
      'C. Benefício',
      'Situação',
    ]
    const linhas = perfis.map((p) => [
      `"${p.nome.replace(/"/g, '""')}"`,
      `"${p.regime}"`,
      `"${p.origem_padrao || ''}"`,
      `"${p.tipo_item_sped_padrao || ''}"`,
      `"${p.c_benef || ''}"`,
      p.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent = '\uFEFF' + [colunas.join(';'), ...linhas.map((l) => l.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `perfis_tributarios_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // =================================================================
  // RENDER: FORMULÁRIO (CABEÇALHO + 8 CENÁRIOS)
  // =================================================================
  if (modo === 'formulario') {
    return (
      <div className="space-y-6">
        {/* Barra Superior do Formulário */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModo('lista')}
              className="h-9 px-3 text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Voltar para a lista
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {perfilId ? `Editar Perfil: ${nome || 'Sem nome'}` : 'Novo Perfil Tributário'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure os parâmetros fiscais padrão e as regras detalhadas para cada operação
                comercial.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModo('lista')}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-perfil"
              disabled={salvando}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
            >
              {salvando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gravando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Perfil
                </>
              )}
            </Button>
          </div>
        </div>

        <form id="form-perfil" onSubmit={handleSalvarPerfil} className="space-y-6">
          {/* ======================================================= */}
          {/* CABEÇALHO DO PERFIL */}
          {/* ======================================================= */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Dados do Perfil Tributário</h3>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="perfil-nome" className="text-xs font-semibold text-slate-700">
                    Nome do Perfil <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="perfil-nome"
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value)
                      if (errosForm.nome) setErrosForm((prev) => ({ ...prev, nome: undefined }))
                    }}
                    placeholder="Ex: Revenda tributada 17%, Revenda com ST, Isento..."
                    autoFocus
                  />
                  {errosForm.nome && (
                    <p className="text-xs text-rose-600 font-medium">{errosForm.nome}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="perfil-regime" className="text-xs font-semibold text-slate-700">
                    Regime Tributário do Perfil <span className="text-rose-600">*</span>
                  </Label>
                  <Select
                    value={regime}
                    onValueChange={(val: RegimePerfilTributario) => setRegime(val)}
                  >
                    <SelectTrigger id="perfil-regime" className="text-xs">
                      <SelectValue placeholder="Selecione o regime..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Regime Normal">Regime Normal (usa CST)</SelectItem>
                      <SelectItem value="Simples Nacional">Simples Nacional (usa CSOSN)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-400">
                    Determina se os 8 cenários solicitarão CST ou CSOSN para o ICMS.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="perfil-descricao" className="text-xs font-semibold text-slate-700">
                  Descrição / Finalidade Fiscal
                </Label>
                <Input
                  id="perfil-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Utilizado para mercadorias sujeitas à tributação integral de ICMS adquiridas para revenda"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-1.5">
                  <Label htmlFor="origem-padrao" className="text-xs font-semibold text-slate-700">
                    Origem da Mercadoria Padrão
                  </Label>
                  <SelectCodigoFiscal
                    id="origem-padrao"
                    tipo="ORIGEM"
                    value={origemPadrao}
                    onChange={(cod) => setOrigemPadrao(cod)}
                    placeholder="Selecione a origem..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="tipo-item-sped-padrao"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Tipo de Item SPED Padrão
                  </Label>
                  <SelectCodigoFiscal
                    id="tipo-item-sped-padrao"
                    tipo="TIPO_ITEM_SPED"
                    value={tipoItemSpedPadrao}
                    onChange={(cod) => setTipoItemSpedPadrao(cod)}
                    placeholder="Selecione o tipo SPED..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="c-benef" className="text-xs font-semibold text-slate-700">
                    Cód. Benefício Fiscal (cBenef)
                  </Label>
                  <Input
                    id="c-benef"
                    maxLength={10}
                    value={cBenef}
                    onChange={(e) => setCBenef(e.target.value.toUpperCase())}
                    placeholder="Até 10 caracteres (opcional)"
                    className="font-mono uppercase text-xs"
                  />
                  <p className="text-[10px] text-slate-400">
                    Utilizado em notas fiscais quando houver desoneração ou redução estadual.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ======================================================= */}
          {/* LISTA DOS 8 CENÁRIOS TRIBUTÁRIOS */}
          {/* ======================================================= */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cenários Tributários (8 Operações)
                </h3>
                <p className="text-xs text-slate-500">
                  Defina a tributação para cada tipo de transação (vendas internas, interestaduais,
                  devoluções e compras).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={expandirTodosCenarios}
                  className="h-8 text-xs text-slate-600"
                >
                  Expandir todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={recolherTodosCenarios}
                  className="h-8 text-xs text-slate-600"
                >
                  Recolher todos
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {CENARIOS_PERFIL.map((cenario) => {
                const regraAtual =
                  regras.find((r) => r.cenario === cenario) || criarRegraPadrao(cenario)

                return (
                  <CenarioCard
                    key={cenario}
                    cenario={cenario}
                    regime={regime}
                    regra={regraAtual}
                    aberto={Boolean(cenariosAbertos[cenario])}
                    onToggleAberto={() => handleToggleCenario(cenario)}
                    onUpdateRegra={(patch) => handleUpdateRegra(cenario, patch)}
                    onCopiarParaOutro={handleAbrirCopiarCenario}
                  />
                )
              })}
            </div>
          </div>

          {/* Barra Flutuante / Inferior de Salvar */}
          <div className="sticky bottom-4 p-4 rounded-xl bg-white/95 backdrop-blur-xs border border-slate-200 shadow-lg flex items-center justify-between gap-4 z-20">
            <div className="text-xs text-slate-500">
              Certifique-se de preencher ao menos o CFOP e CST/CSOSN nos cenários de venda mais
              usados.
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModo('lista')}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvando}
                className="bg-blue-600 hover:bg-blue-700 text-white min-w-[130px]"
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gravando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Perfil
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Modal Copiar Cenário */}
        <Dialog open={modalCopiarCenarioAberto} onOpenChange={setModalCopiarCenarioAberto}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Copiar Cenário Tributário
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Copie todos os parâmetros (ICMS, ST, IPI, PIS, COFINS, IBS/CBS e Observações) de{' '}
                <strong className="text-slate-800">
                  {cenarioOrigemCopia && CENARIOS_INFO[cenarioOrigemCopia].titulo}
                </strong>{' '}
                para os cenários selecionados abaixo:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-3 max-h-72 overflow-y-auto">
              {CENARIOS_PERFIL.filter((c) => c !== cenarioOrigemCopia).map((cenario) => {
                const info = CENARIOS_INFO[cenario]
                const marcado = cenariosDestinoCopia.includes(cenario)

                return (
                  <div
                    key={cenario}
                    onClick={() => handleToggleDestinoCopia(cenario)}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      marcado
                        ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{info.titulo}</p>
                      <p className="text-[11px] text-slate-500">{info.descricao}</p>
                    </div>

                    <div
                      className={`h-4 w-4 rounded-xs border flex items-center justify-center shrink-0 ml-2 ${
                        marcado ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {marcado && <Check className="h-3 w-3" />}
                    </div>
                  </div>
                )
              })}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalCopiarCenarioAberto(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmarCopiarCenario}
                disabled={cenariosDestinoCopia.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Copiar para ({cenariosDestinoCopia.length}) selecionado(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // =================================================================
  // RENDER: LISTAGEM DE PERFIS
  // =================================================================
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Perfis Tributários</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Modelos de tributação aplicáveis a múltiplos produtos com regras por cenário de
            operação.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleExportarCSV}
            className="text-slate-700 border-slate-300 hover:bg-slate-50 text-xs h-9"
          >
            <Download className="mr-2 h-4 w-4 text-slate-500" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              onClick={handleNovoPerfil}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Perfil
            </Button>
          )}
        </div>
      </div>

      {/* Card Principal da Listagem */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Campo Busca */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou descrição do perfil..."
                value={busca}
                onChange={(e) => {
                  const val = e.target.value
                  startTransition(() => {
                    setBusca(val)
                    setPagina(1)
                  })
                }}
                className="pl-9 bg-slate-50/50 border-slate-200 text-sm"
              />
            </div>

            {/* Controles: Regime e Situação */}
            <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  Regime:
                </span>
                <Select
                  value={regimeFiltro}
                  onValueChange={(val: RegimePerfilTributario | 'todos') => {
                    setRegimeFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-36 h-9 text-xs">
                    <SelectValue placeholder="Regime" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Regime Normal">Regime Normal</SelectItem>
                    <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  Situação:
                </span>
                <Select
                  value={situacao}
                  onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                    setSituacao(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-32 h-9 text-xs">
                    <SelectValue placeholder="Situação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativos">Ativos</SelectItem>
                    <SelectItem value="inativos">Inativos</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Tabela de Perfis */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-y border-slate-200">
              <thead className="bg-slate-50/80 text-slate-600 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nome do Perfil</th>
                  <th className="px-4 py-3">Regime</th>
                  <th className="px-4 py-3">Origem Padrão</th>
                  <th className="px-4 py-3">Tipo SPED</th>
                  <th className="px-4 py-3">Benefício</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregandoLista ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        <span>Carregando perfis tributários...</span>
                      </div>
                    </td>
                  </tr>
                ) : perfis.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      <Calculator className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-700">Nenhum perfil encontrado</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {busca
                          ? 'Nenhum perfil coincide com a pesquisa informada.'
                          : 'Cadastre o primeiro modelo de tributação para aplicar aos produtos.'}
                      </p>
                      {podeCriar && !busca && (
                        <Button
                          onClick={handleNovoPerfil}
                          size="sm"
                          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Criar Primeiro Perfil
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  perfis.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !p.ativo ? 'bg-slate-50/50 opacity-70' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="font-semibold text-slate-800">{p.nome}</div>
                        {p.descricao && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">
                            {p.descricao}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={
                            p.regime === 'Simples Nacional'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }
                        >
                          {p.regime}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-700">
                        {p.origem_padrao || '—'}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-700">
                        {p.tipo_item_sped_padrao || '—'}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-700">{p.c_benef || '—'}</td>

                      <td className="px-4 py-3">
                        {p.ativo ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-400 border-slate-300">
                            Inativo
                          </Badge>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeCriar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAbrirDuplicar(p)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Duplicar perfil"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditarPerfil(p)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Editar perfil"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {podeInativar &&
                            (p.ativo ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemParaInativar(p)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                title="Inativar perfil"
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemParaAtivar(p)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                title="Reativar perfil"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-200 text-xs text-slate-500 gap-3 bg-slate-50/50">
            <div>
              Mostrando <strong>{perfis.length}</strong> de <strong>{totalItens}</strong> perfil(is)
              cadastrado(s).
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1 || carregandoLista}
                className="h-8 px-2 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Anterior
              </Button>
              <span className="text-xs px-2">
                Página {pagina} de {Math.max(1, totalPaginas)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas || carregandoLista}
                className="h-8 px-2 text-xs"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* MODAL DUPLICAR PERFIL */}
      {/* ======================================================== */}
      <Dialog open={modalDuplicarAberto} onOpenChange={setModalDuplicarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Duplicar Perfil Tributário
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Crie uma cópia exata de <strong>{perfilParaDuplicar?.nome}</strong> com todas as 8
              regras fiscais de cenários prontas para ajuste.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="novo-nome-duplicar" className="text-xs font-semibold text-slate-700">
                Nome do Novo Perfil <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="novo-nome-duplicar"
                value={novoNomeDuplicacao}
                onChange={(e) => setNovoNomeDuplicacao(e.target.value)}
                placeholder="Ex: Revenda tributada 12%"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalDuplicarAberto(false)}
              disabled={duplicando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmarDuplicar}
              disabled={duplicando}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {duplicando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duplicando...
                </>
              ) : (
                'Confirmar Duplicação'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* CONFIRMAÇÃO DE INATIVAÇÃO */}
      {/* ======================================================== */}
      <AlertDialog
        open={Boolean(itemParaInativar)}
        onOpenChange={(aberto) => !aberto && setItemParaInativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>Inativar Perfil Tributário</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja realmente inativar o perfil{' '}
              <strong className="text-slate-900">{itemParaInativar?.nome}</strong>? Ele não poderá
              ser selecionado em novos produtos ou cadastros de grupos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {processandoAcao ? 'Inativando...' : 'Sim, inativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ======================================================== */}
      {/* CONFIRMAÇÃO DE REATIVAÇÃO */}
      {/* ======================================================== */}
      <AlertDialog
        open={Boolean(itemParaAtivar)}
        onOpenChange={(aberto) => !aberto && setItemParaAtivar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle2 className="h-5 w-5" />
              <AlertDialogTitle>Reativar Perfil Tributário</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja reativar o perfil{' '}
              <strong className="text-slate-900">{itemParaAtivar?.nome}</strong>? Ele voltará a
              ficar disponível para utilização nos produtos e notas fiscais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarAtivacao}
              disabled={processandoAcao}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processandoAcao ? 'Reativando...' : 'Sim, reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default PerfisTributariosPage
