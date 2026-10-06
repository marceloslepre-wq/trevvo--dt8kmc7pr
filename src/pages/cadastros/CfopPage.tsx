import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileSpreadsheet,
  Plus,
  Search,
  Download,
  Upload,
  Edit2,
  Power,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Check,
  Ban,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  Cfop,
  listarCfop,
  salvarCfop,
  inativarCfop,
  ativarCfop,
  formatarCodigoCfop,
  normalizarCodigoCfop,
  derivarTipoMovimentoCfop,
  derivarAbrangenciaCfop,
  analisarCSVCfop,
  executarImportacaoCfopEmLotes,
  ResumoImportacaoCfop,
  TipoMovimentoCfop,
  AbrangenciaCfop,
} from '@/services/cfop'

export const CfopPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados de listagem
  const [cfops, setCfops] = useState<Cfop[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [tipoMovimento, setTipoMovimento] = useState<'todos' | TipoMovimentoCfop>('todos')
  const [abrangencia, setAbrangencia] = useState<'todas' | AbrangenciaCfop>('todas')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [ordenacao, setOrdenacao] = useState<string>('codigo')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Estados do Modal de Cadastro / Edição
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [codigoForm, setCodigoForm] = useState('')
  const [descricaoForm, setDescricaoForm] = useState('')
  const [aplicacaoForm, setAplicacaoForm] = useState('')
  const [geraFinanceiroForm, setGeraFinanceiroForm] = useState(true)
  const [movimentaEstoqueForm, setMovimentaEstoqueForm] = useState(true)
  const [devolucaoForm, setDevolucaoForm] = useState(false)
  const [errosForm, setErrosForm] = useState<{ codigo?: string; descricao?: string }>({})

  // Estados de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<Cfop | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<Cfop | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Estados de Importação CSV
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [analisandoCSV, setAnalisandoCSV] = useState(false)
  const [importandoLotes, setImportandoLotes] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacaoCfop | null>(null)
  const [progresso, setProgresso] = useState<{
    processados: number
    total: number
    stats: { inseridos: number; atualizados: number }
  } | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState<{
    inseridos: number
    atualizados: number
    erros: number
  } | null>(null)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarCfop({
        busca,
        tipo_movimento: tipoMovimento,
        abrangencia,
        situacao,
        ordenacao,
        page: pagina,
        perPage: 20,
      })
      setCfops(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar CFOPs'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, tipoMovimento, abrangencia, situacao, ordenacao, pagina, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const alternarOrdenacao = (campo: string) => {
    if (ordenacao === campo) {
      setOrdenacao(`-${campo}`)
    } else if (ordenacao === `-${campo}`) {
      setOrdenacao(campo)
    } else {
      setOrdenacao(campo)
    }
    setPagina(1)
  }

  const renderIconeOrdenacao = (campo: string) => {
    if (ordenacao === campo) {
      return <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
    }
    if (ordenacao === `-${campo}`) {
      return <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
    }
    return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
  }

  const handleAbrirNovo = () => {
    setEditandoId(null)
    setCodigoForm('')
    setDescricaoForm('')
    setAplicacaoForm('')
    setGeraFinanceiroForm(true)
    setMovimentaEstoqueForm(true)
    setDevolucaoForm(false)
    setErrosForm({})
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: Cfop) => {
    setEditandoId(item.id)
    setCodigoForm(formatarCodigoCfop(item.codigo))
    setDescricaoForm(item.descricao)
    setAplicacaoForm(item.aplicacao || '')
    setGeraFinanceiroForm(Boolean(item.gera_financeiro))
    setMovimentaEstoqueForm(Boolean(item.movimenta_estoque))
    setDevolucaoForm(Boolean(item.devolucao))
    setErrosForm({})
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novosErros: { codigo?: string; descricao?: string } = {}

    const codLimpo = normalizarCodigoCfop(codigoForm)
    const descLimpa = descricaoForm.trim()

    if (!codLimpo) {
      novosErros.codigo = 'O código CFOP é obrigatório.'
    } else if (codLimpo.length !== 4) {
      novosErros.codigo = 'O CFOP deve ter exatamente 4 dígitos numéricos.'
    } else if (!['1', '2', '3', '5', '6', '7'].includes(codLimpo.charAt(0))) {
      novosErros.codigo = 'O primeiro dígito deve ser 1, 2, 3, 5, 6 ou 7.'
    }

    if (!descLimpa) {
      novosErros.descricao = 'A descrição do CFOP é obrigatória.'
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      await salvarCfop({
        id: editandoId || undefined,
        codigo: codLimpo,
        descricao: descLimpa,
        aplicacao: aplicacaoForm.trim(),
        gera_financeiro: geraFinanceiroForm,
        movimenta_estoque: movimentaEstoqueForm,
        devolucao: devolucaoForm,
      })

      toast({
        title: editandoId ? 'CFOP atualizado' : 'CFOP cadastrado',
        description: `O CFOP "${formatarCodigoCfop(codLimpo)}" foi gravado com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar CFOP'
      toast({
        title: 'Erro ao salvar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleConfirmarInativacao = async () => {
    if (!itemParaInativar) return
    setProcessandoAcao(true)
    try {
      await inativarCfop(itemParaInativar.id)
      toast({
        title: 'CFOP inativado',
        description: `O CFOP "${formatarCodigoCfop(itemParaInativar.codigo)}" foi inativado.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar CFOP'
      toast({
        title: 'Falha na operação',
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
      await ativarCfop(itemParaAtivar.id)
      toast({
        title: 'CFOP reativado',
        description: `O CFOP "${formatarCodigoCfop(itemParaAtivar.codigo)}" está ativo novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar CFOP'
      toast({
        title: 'Falha na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Exportação CSV
  const exportarCSV = () => {
    if (cfops.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Código Formatado',
      'Descrição',
      'Aplicação',
      'Tipo Movimento',
      'Abrangência',
      'Gera Financeiro',
      'Movimenta Estoque',
      'Devolução',
      'Situação',
    ]
    const linhas = cfops.map((c) => [
      `"${c.codigo}"`,
      `"${formatarCodigoCfop(c.codigo)}"`,
      `"${c.descricao.replace(/"/g, '""')}"`,
      `"${(c.aplicacao || '').replace(/"/g, '""')}"`,
      `"${c.tipo_movimento}"`,
      `"${c.abrangencia}"`,
      c.gera_financeiro ? '"Sim"' : '"Não"',
      c.movimenta_estoque ? '"Sim"' : '"Não"',
      c.devolucao ? '"Sim"' : '"Não"',
      c.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cfop_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download foi iniciado com sucesso.',
    })
  }

  // Importação CSV: leitura de arquivo
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalisandoCSV(true)
    setResumoImportacao(null)
    setProgresso(null)
    setResultadoFinal(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const conteudo = event.target?.result as string
        const resultado = await analisarCSVCfop(conteudo)
        setResumoImportacao(resultado)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo'
        toast({
          title: 'Erro na leitura do arquivo',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        setAnalisandoCSV(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      toast({
        title: 'Erro ao ler arquivo',
        description: 'Não foi possível ler o arquivo selecionado.',
        variant: 'destructive',
      })
      setAnalisandoCSV(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    reader.readAsText(file, 'utf-8')
  }

  const handleConfirmarImportacao = async () => {
    if (!resumoImportacao || resumoImportacao.itensValidos.length === 0) return

    setImportandoLotes(true)
    try {
      const res = await executarImportacaoCfopEmLotes(
        resumoImportacao.itensValidos,
        (processados, total, stats) => {
          setProgresso({ processados, total, stats })
        },
      )

      setResultadoFinal(res)
      toast({
        title: 'Importação concluída',
        description: `${res.inseridos} CFOP(s) inserido(s) e ${res.atualizados} atualizado(s).`,
      })
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro durante o processamento em lote'
      toast({
        title: 'Falha na importação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setImportandoLotes(false)
    }
  }

  const codNormForm = normalizarCodigoCfop(codigoForm)
  const tipoPrevisto = codNormForm.length > 0 ? derivarTipoMovimentoCfop(codNormForm) : '-'
  const abrangenciaPrevista = codNormForm.length > 0 ? derivarAbrangenciaCfop(codNormForm) : '-'

  const porcentagemProgresso =
    progresso && progresso.total > 0
      ? Math.round((progresso.processados / progresso.total) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">CFOP</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Código Fiscal de Operações e Prestações com regras de financeiro, estoque e devolução.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={carregando || cfops.length === 0}
            className="text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResumoImportacao(null)
                setProgresso(null)
                setResultadoFinal(null)
                setModalImportarAberto(true)
              }}
              className="text-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Importar CFOP
            </Button>
          )}

          {podeCriar && (
            <Button
              size="sm"
              onClick={handleAbrirNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Novo CFOP
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por código ou descrição..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPagina(1)
                }}
                className="pl-9 text-xs"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => {
                    setBusca('')
                    setPagina(1)
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select
              value={tipoMovimento}
              onValueChange={(val: 'todos' | TipoMovimentoCfop) => {
                setTipoMovimento(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Tipo de Movimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Movimentos</SelectItem>
                <SelectItem value="Entrada">Entrada (1xxx, 2xxx, 3xxx)</SelectItem>
                <SelectItem value="Saída">Saída (5xxx, 6xxx, 7xxx)</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={abrangencia}
              onValueChange={(val: 'todas' | AbrangenciaCfop) => {
                setAbrangencia(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Abrangência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas Abrangências</SelectItem>
                <SelectItem value="Estadual">Estadual (1xxx / 5xxx)</SelectItem>
                <SelectItem value="Interestadual">Interestadual (2xxx / 6xxx)</SelectItem>
                <SelectItem value="Exterior">Exterior (3xxx / 7xxx)</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={situacao}
              onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                setSituacao(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Apenas Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de CFOPs */}
      <Card className="border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-28"
                  onClick={() => alternarOrdenacao('codigo')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Código</span>
                    {renderIconeOrdenacao('codigo')}
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => alternarOrdenacao('descricao')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Descrição / Aplicação</span>
                    {renderIconeOrdenacao('descricao')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center w-28">Movimento</th>
                <th className="py-3 px-3 text-center w-28">Abrangência</th>
                <th className="py-3 px-3 text-center w-24">Financeiro</th>
                <th className="py-3 px-3 text-center w-24">Estoque</th>
                <th className="py-3 px-3 text-center w-24">Devolução</th>
                <th className="py-3 px-3 text-center w-20">Situação</th>
                <th className="py-3 px-4 text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Carregando códigos CFOP...
                  </td>
                </tr>
              ) : cfops.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="max-w-xs mx-auto">
                      <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-700">Nenhum CFOP encontrado</p>
                      <p className="text-slate-400 text-[11px] mt-1">
                        Ajuste os filtros de movimento/abrangência ou use o botão &quot;Importar
                        CFOP&quot;.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                cfops.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !item.ativo ? 'bg-slate-50/40 text-slate-400' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {formatarCodigoCfop(item.codigo)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-800">{item.descricao}</p>
                      {item.aplicacao && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {item.aplicacao}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge
                        variant="outline"
                        className={
                          item.tipo_movimento === 'Entrada'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]'
                        }
                      >
                        {item.tipo_movimento === 'Entrada' ? (
                          <TrendingDown className="h-3 w-3 mr-1 inline" />
                        ) : (
                          <TrendingUp className="h-3 w-3 mr-1 inline" />
                        )}
                        {item.tipo_movimento}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-center text-[11px] text-slate-600">
                      {item.abrangencia}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.gera_financeiro ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="h-3.5 w-3.5" /> Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <Ban className="h-3 w-3" /> Não
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.movimenta_estoque ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <Check className="h-3.5 w-3.5" /> Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <Ban className="h-3 w-3" /> Não
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.devolucao ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] hover:bg-amber-100">
                          Devolução
                        </Badge>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.ativo ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] hover:bg-emerald-50">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-slate-400 border-slate-200 text-[10px]"
                        >
                          Inativo
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAbrirEditar(item)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600"
                            title="Editar CFOP"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {podeInativar &&
                          (item.ativo ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItemParaInativar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-rose-600"
                              title="Inativar CFOP"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItemParaAtivar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                              title="Reativar CFOP"
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 text-xs text-slate-500">
          <div>
            Mostrando <strong>{cfops.length}</strong> de <strong>{totalItens}</strong> CFOPs
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1 || carregando}
              className="text-xs h-8"
            >
              Anterior
            </Button>
            <span className="text-xs font-medium px-2">
              Página {pagina} de {Math.max(1, totalPaginas)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas || carregando}
              className="text-xs h-8"
            >
              Próxima
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal Novo / Editar CFOP */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editandoId ? 'Editar CFOP' : 'Novo CFOP'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informe o código de 4 dígitos. Tipo de movimento e abrangência são derivados
                automaticamente do primeiro dígito.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4 text-xs">
              <div>
                <Label htmlFor="codigo" className="text-xs font-medium">
                  Código CFOP (4 dígitos) *
                </Label>
                <Input
                  id="codigo"
                  value={codigoForm}
                  onChange={(e) => setCodigoForm(e.target.value)}
                  placeholder="Ex: 5102 ou 5.102"
                  maxLength={5}
                  className="mt-1 font-mono text-xs"
                  autoFocus
                />
                {errosForm.codigo && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.codigo}</p>
                )}

                {/* Previsão automática */}
                {codNormForm.length > 0 && (
                  <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between text-[11px]">
                    <span>
                      Movimento automático:{' '}
                      <strong className="text-blue-700">{tipoPrevisto}</strong>
                    </span>
                    <span>
                      Abrangência: <strong className="text-blue-700">{abrangenciaPrevista}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="descricao" className="text-xs font-medium">
                  Descrição da Operação *
                </Label>
                <Input
                  id="descricao"
                  value={descricaoForm}
                  onChange={(e) => setDescricaoForm(e.target.value)}
                  placeholder="Ex: Venda de mercadoria adquirida ou recebida de terceiros"
                  className="mt-1 text-xs"
                />
                {errosForm.descricao && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.descricao}</p>
                )}
              </div>

              <div>
                <Label htmlFor="aplicacao" className="text-xs font-medium">
                  Aplicação / Detalhamento Tributário (Opcional)
                </Label>
                <Textarea
                  id="aplicacao"
                  value={aplicacaoForm}
                  onChange={(e) => setAplicacaoForm(e.target.value)}
                  placeholder="Classificam-se neste código as vendas de mercadorias..."
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              {/* Parâmetros Booleanos */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <span className="font-semibold text-slate-800 text-[11px] block">
                  Comportamento fiscal e operacional
                </span>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="gera_fin" className="text-xs font-medium cursor-pointer">
                      Gera Financeiro?
                    </Label>
                    <p className="text-[10px] text-slate-400">
                      Gera títulos no Contas a Receber (saídas) ou Contas a Pagar (entradas).
                    </p>
                  </div>
                  <Switch
                    id="gera_fin"
                    checked={geraFinanceiroForm}
                    onCheckedChange={setGeraFinanceiroForm}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                  <div>
                    <Label htmlFor="mov_est" className="text-xs font-medium cursor-pointer">
                      Movimenta Estoque?
                    </Label>
                    <p className="text-[10px] text-slate-400">
                      Entrada ou baixa de quantidade física dos produtos no estoque.
                    </p>
                  </div>
                  <Switch
                    id="mov_est"
                    checked={movimentaEstoqueForm}
                    onCheckedChange={setMovimentaEstoqueForm}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                  <div>
                    <Label htmlFor="dev" className="text-xs font-medium cursor-pointer">
                      Operação de Devolução?
                    </Label>
                    <p className="text-[10px] text-slate-400">
                      Identifica devoluções de venda ou compras para tratamento tributário
                      específico.
                    </p>
                  </div>
                  <Switch id="dev" checked={devolucaoForm} onCheckedChange={setDevolucaoForm} />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Salvando...
                  </>
                ) : (
                  'Salvar CFOP'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação CSV */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Planilha de CFOPs
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione um arquivo CSV com as colunas:{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-mono">
                codigo;descricao;aplicacao
              </code>
              . O tipo de movimento e abrangência serão gerados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            {/* Input de arquivo */}
            <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg text-center hover:border-blue-400 transition-colors bg-slate-50/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleSelecionarArquivo}
                className="hidden"
                id="cfop-file-input"
              />
              <label
                htmlFor="cfop-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
              >
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <span className="font-semibold text-slate-800 text-xs">
                  Clique para selecionar o arquivo CSV
                </span>
                <span className="text-[11px] text-slate-400">
                  Separado por ponto e vírgula (;) ou vírgula (,)
                </span>
              </label>
            </div>

            {analisandoCSV && (
              <div className="py-4 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Analisando CSV...
              </div>
            )}

            {resumoImportacao && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Arquivo analisado com sucesso
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {resumoImportacao.validos} CFOPs válidos
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Linhas lidas</span>
                    <strong className="text-slate-800 text-sm">
                      {resumoImportacao.totalLidos}
                    </strong>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                    <span className="text-emerald-700 block text-[10px]">
                      Válidos para importar
                    </span>
                    <strong className="text-emerald-800 text-sm">{resumoImportacao.validos}</strong>
                  </div>
                  <div className="p-2 bg-amber-50 rounded border border-amber-200">
                    <span className="text-amber-700 block text-[10px]">Linhas ignoradas</span>
                    <strong className="text-amber-800 text-sm">{resumoImportacao.ignorados}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Progresso em lote */}
            {importandoLotes && progresso && (
              <div className="space-y-2 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    Gravando em lotes...
                  </span>
                  <span className="font-mono font-bold text-blue-700">
                    {progresso.processados} / {progresso.total} ({porcentagemProgresso}%)
                  </span>
                </div>
                <Progress value={porcentagemProgresso} className="h-2 bg-blue-100" />
                <div className="flex justify-between text-[10px] text-blue-700 pt-1">
                  <span>Novos inseridos: {progresso.stats.inseridos}</span>
                  <span>Atualizados: {progresso.stats.atualizados}</span>
                </div>
              </div>
            )}

            {resultadoFinal && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-1">
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Importação concluída com sucesso!
                </div>
                <p className="text-[11px]">
                  {resultadoFinal.inseridos} novo(s) CFOP(s) inserido(s),{' '}
                  {resultadoFinal.atualizados} atualizado(s)
                  {resultadoFinal.erros > 0 && ` e ${resultadoFinal.erros} erro(s)`}.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalImportarAberto(false)}
              disabled={importandoLotes}
              className="text-xs"
            >
              {resultadoFinal ? 'Fechar' : 'Cancelar'}
            </Button>
            {resumoImportacao && !resultadoFinal && (
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarImportacao}
                disabled={importandoLotes || resumoImportacao.validos === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {importandoLotes ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Importando...
                  </>
                ) : (
                  `Confirmar Importação de ${resumoImportacao.validos} CFOPs`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Inativação */}
      <AlertDialog open={!!itemParaInativar} onOpenChange={() => setItemParaInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Inativar CFOP?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja inativar o CFOP{' '}
              <strong>
                {itemParaInativar ? formatarCodigoCfop(itemParaInativar.codigo) : ''} -{' '}
                {itemParaInativar?.descricao}
              </strong>
              ? Ele deixará de aparecer nas opções ativas do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              {processandoAcao ? 'Inativando...' : 'Inativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Reativação */}
      <AlertDialog open={!!itemParaAtivar} onOpenChange={() => setItemParaAtivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              Reativar CFOP?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Deseja reativar o CFOP{' '}
              <strong>{itemParaAtivar ? formatarCodigoCfop(itemParaAtivar.codigo) : ''}</strong>?
              Ele voltará a ficar disponível para seleção nas operações fiscais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarAtivacao}
              disabled={processandoAcao}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {processandoAcao ? 'Reativando...' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CfopPage
