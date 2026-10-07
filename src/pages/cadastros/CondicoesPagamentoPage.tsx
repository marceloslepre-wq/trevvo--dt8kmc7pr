import React, { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import {
  CreditCard,
  Plus,
  Search,
  Download,
  Edit2,
  Power,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Percent,
  Calculator,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  CondicaoPagamento,
  TipoCondicaoPagamento,
  UsoCondicaoPagamento,
  listarCondicoesPagamento,
  salvarCondicaoPagamento,
  inativarCondicaoPagamento,
  ativarCondicaoPagamento,
  gerarParcelas,
  ParcelaCalculada,
} from '@/services/condicoesPagamento'

export const CondicoesPagamentoPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('condicoes_pagamento', 'criar')
  const podeEditar = pode('condicoes_pagamento', 'editar')
  const podeInativar = pode('condicoes_pagamento', 'excluir')

  const { toast } = useToast()
  const [, startTransition] = useTransition()

  // Estados de listagem
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | TipoCondicaoPagamento>('todos')
  const [usoFiltro, setUsoFiltro] = useState<'todos' | UsoCondicaoPagamento>('todos')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [ordenacao, setOrdenacao] = useState<string>('codigo')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Estados do Modal de Formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [codigoExibicao, setCodigoExibicao] = useState<number | null>(null)

  // Campos do formulário
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoCondicaoPagamento>('A prazo')
  const [uso, setUso] = useState<UsoCondicaoPagamento>('Ambos')
  const [quantidadeParcelas, setQuantidadeParcelas] = useState<string>('1')
  const [diasParcelasStr, setDiasParcelasStr] = useState<string>('30')
  const [percentualEntrada, setPercentualEntrada] = useState<string>('')
  const [acrescimoPercentual, setAcrescimoPercentual] = useState<string>('')
  const [descontoPercentual, setDescontoPercentual] = useState<string>('')
  const [diaFixoVencimento, setDiaFixoVencimento] = useState<string>('')
  const [observacao, setObservacao] = useState('')
  const [errosForm, setErrosForm] = useState<Record<string, string>>({})

  // Prévia de parcelas no formulário
  const [valorSimulacao, setValorSimulacao] = useState<string>('1000.00')

  // Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<CondicaoPagamento | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<CondicaoPagamento | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarCondicoesPagamento({
        busca,
        tipo: tipoFiltro,
        uso: usoFiltro,
        situacao,
        ordenarPor: ordenacao.replace(/^-/, ''),
        ordem: ordenacao.startsWith('-') ? 'desc' : 'asc',
        pagina,
        porPagina: 20,
      })
      setCondicoes(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar condições de pagamento'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, tipoFiltro, usoFiltro, situacao, ordenacao, pagina, toast])

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
    setCodigoExibicao(null)
    setNome('')
    setTipo('A prazo')
    setUso('Ambos')
    setQuantidadeParcelas('1')
    setDiasParcelasStr('30')
    setPercentualEntrada('')
    setAcrescimoPercentual('')
    setDescontoPercentual('')
    setDiaFixoVencimento('')
    setObservacao('')
    setErrosForm({})
    setValorSimulacao('1000.00')
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: CondicaoPagamento) => {
    setEditandoId(item.id)
    setCodigoExibicao(item.codigo)
    setNome(item.nome)
    setTipo(item.tipo)
    setUso(item.uso)
    setQuantidadeParcelas(String(item.quantidade_parcelas))
    setDiasParcelasStr(Array.isArray(item.dias_parcelas) ? item.dias_parcelas.join(', ') : '')
    setPercentualEntrada(
      item.percentual_entrada !== undefined &&
        item.percentual_entrada !== null &&
        item.percentual_entrada > 0
        ? String(item.percentual_entrada)
        : '',
    )
    setAcrescimoPercentual(
      item.acrescimo_percentual !== undefined &&
        item.acrescimo_percentual !== null &&
        item.acrescimo_percentual > 0
        ? String(item.acrescimo_percentual)
        : '',
    )
    setDescontoPercentual(
      item.desconto_percentual !== undefined &&
        item.desconto_percentual !== null &&
        item.desconto_percentual > 0
        ? String(item.desconto_percentual)
        : '',
    )
    setDiaFixoVencimento(item.dia_fixo_vencimento ? String(item.dia_fixo_vencimento) : '')
    setObservacao(item.observacao || '')
    setErrosForm({})
    setValorSimulacao('1000.00')
    setModalAberto(true)
  }

  // Mudança do tipo "À vista" ajusta automaticamente parcelas e dias
  const handleTrocaTipo = (novoTipo: TipoCondicaoPagamento) => {
    setTipo(novoTipo)
    if (novoTipo === 'À vista') {
      setQuantidadeParcelas('1')
      setDiasParcelasStr('0')
      setPercentualEntrada('')
      setDiaFixoVencimento('')
    } else {
      if (diasParcelasStr === '0') {
        setDiasParcelasStr('30')
      }
    }
  }

  // Cálculo da prévia de parcelas em tempo real
  const parcelasPrevia = useMemo<ParcelaCalculada[]>(() => {
    const valExemplo = parseFloat(valorSimulacao.replace(',', '.')) || 0
    if (valExemplo <= 0) return []

    let dias: number[] = []
    if (tipo === 'À vista') {
      dias = [0]
    } else {
      dias = diasParcelasStr
        .split(/[,/ ]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    }

    const qtd = parseInt(quantidadeParcelas, 10) || 1
    const pEntrada = percentualEntrada ? parseFloat(percentualEntrada.replace(',', '.')) : 0
    const pAcresc = acrescimoPercentual ? parseFloat(acrescimoPercentual.replace(',', '.')) : 0
    const pDesc = descontoPercentual ? parseFloat(descontoPercentual.replace(',', '.')) : 0
    const diaFixo = diaFixoVencimento ? parseInt(diaFixoVencimento, 10) : undefined

    return gerarParcelas(
      {
        tipo,
        quantidade_parcelas: qtd,
        dias_parcelas: dias,
        percentual_entrada: pEntrada,
        acrescimo_percentual: pAcresc,
        desconto_percentual: pDesc,
        dia_fixo_vencimento: diaFixo,
      },
      valExemplo,
    )
  }, [
    tipo,
    quantidadeParcelas,
    diasParcelasStr,
    percentualEntrada,
    acrescimoPercentual,
    descontoPercentual,
    diaFixoVencimento,
    valorSimulacao,
  ])

  const totalPreviaCalculado = useMemo(() => {
    return parcelasPrevia.reduce((acc, p) => acc + p.valor, 0)
  }, [parcelasPrevia])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novosErros: Record<string, string> = {}

    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      novosErros.nome = 'O nome da condição é obrigatório.'
    } else if (nomeLimpo.length > 100) {
      novosErros.nome = 'O nome deve conter no máximo 100 caracteres.'
    }

    const qtd = parseInt(quantidadeParcelas, 10)
    if (!qtd || qtd < 1 || Number.isNaN(qtd)) {
      novosErros.quantidade_parcelas = 'A quantidade de parcelas deve ser no mínimo 1.'
    }

    let dias: number[] = []
    if (tipo === 'À vista') {
      dias = [0]
      if (qtd !== 1) {
        novosErros.quantidade_parcelas = 'Para "À vista", a quantidade de parcelas deve ser 1.'
      }
    } else {
      const partes = diasParcelasStr
        .split(/[,/ ]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(Number)

      if (partes.length === 0 || partes.some((n) => Number.isNaN(n) || n < 0)) {
        novosErros.dias_parcelas =
          'Informe os dias de cada parcela separados por vírgula (ex: 30, 60, 90).'
      } else {
        if (partes.length !== qtd) {
          novosErros.dias_parcelas = `A quantidade de parcelas (${qtd}) deve ser igual ao total de prazos informados (${partes.length}).`
        }

        for (let i = 1; i < partes.length; i++) {
          if (partes[i] <= partes[i - 1]) {
            novosErros.dias_parcelas =
              'Os prazos devem estar em ordem estritamente crescente (ex: 30, 60, 90).'
            break
          }
        }
      }
      dias = partes
    }

    if (diaFixoVencimento) {
      const df = parseInt(diaFixoVencimento, 10)
      if (Number.isNaN(df) || df < 1 || df > 31) {
        novosErros.dia_fixo_vencimento = 'O dia fixo deve ser entre 1 e 31.'
      }
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      await salvarCondicaoPagamento({
        id: editandoId || undefined,
        nome: nomeLimpo,
        tipo,
        uso,
        quantidade_parcelas: qtd,
        dias_parcelas: dias,
        percentual_entrada: percentualEntrada ? parseFloat(percentualEntrada.replace(',', '.')) : 0,
        acrescimo_percentual: acrescimoPercentual
          ? parseFloat(acrescimoPercentual.replace(',', '.'))
          : 0,
        desconto_percentual: descontoPercentual
          ? parseFloat(descontoPercentual.replace(',', '.'))
          : 0,
        dia_fixo_vencimento: diaFixoVencimento ? parseInt(diaFixoVencimento, 10) : undefined,
        observacao: observacao.trim() || undefined,
      })

      toast({
        title: editandoId ? 'Condição atualizada' : 'Condição cadastrada',
        description: `A condição "${nomeLimpo}" foi salva com sucesso.`,
      })

      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar condição de pagamento'
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
      await inativarCondicaoPagamento(itemParaInativar.id)
      toast({
        title: 'Condição inativada',
        description: `A condição "${itemParaInativar.nome}" foi inativada com sucesso.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar condição'
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
      await ativarCondicaoPagamento(itemParaAtivar.id)
      toast({
        title: 'Condição reativada',
        description: `A condição "${itemParaAtivar.nome}" está ativa novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar condição'
      toast({
        title: 'Falha na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const exportarCSV = () => {
    if (condicoes.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Nome',
      'Tipo',
      'Uso',
      'Parcelas',
      'Prazos (dias)',
      'Entrada (%)',
      'Acréscimo (%)',
      'Desconto (%)',
      'Dia Fixo',
      'Situação',
    ]
    const linhas = condicoes.map((c) => [
      c.codigo,
      `"${c.nome.replace(/"/g, '""')}"`,
      `"${c.tipo}"`,
      `"${c.uso}"`,
      c.quantidade_parcelas,
      `"${(c.dias_parcelas || []).join(', ')}"`,
      c.percentual_entrada || 0,
      c.acrescimo_percentual || 0,
      c.desconto_percentual || 0,
      c.dia_fixo_vencimento || '',
      c.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `condicoes_pagamento_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download do arquivo foi iniciado com sucesso.',
    })
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const formatarDataBr = (iso: string) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Condições de Pagamento
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de prazos, parcelamentos, descontos e juros utilizados em clientes, fornecedores,
            compras, vendas, PDV e financeiro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportarCSV}
            className="text-slate-700 border-slate-300 hover:bg-slate-50 text-xs h-9"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              onClick={handleAbrirNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova Condição
            </Button>
          )}
        </div>
      </div>

      {/* Card com Filtros e Tabela */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            {/* Campo Busca */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, código ou observação..."
                value={busca}
                onChange={(e) => {
                  const val = e.target.value
                  startTransition(() => {
                    setBusca(val)
                    setPagina(1)
                  })
                }}
                className="pl-9 bg-slate-50/50 border-slate-200 text-xs h-9"
              />
            </div>

            {/* Filtros rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 whitespace-nowrap">Tipo:</span>
                <Select
                  value={tipoFiltro}
                  onValueChange={(val: 'todos' | TipoCondicaoPagamento) => {
                    setTipoFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-28 h-9 text-xs">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="À vista">À vista</SelectItem>
                    <SelectItem value="A prazo">A prazo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 whitespace-nowrap">Uso:</span>
                <Select
                  value={usoFiltro}
                  onValueChange={(val: 'todos' | UsoCondicaoPagamento) => {
                    setUsoFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-28 h-9 text-xs">
                    <SelectValue placeholder="Uso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Ambos">Ambos</SelectItem>
                    <SelectItem value="Vendas">Vendas</SelectItem>
                    <SelectItem value="Compras">Compras</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 whitespace-nowrap">Situação:</span>
                <Select
                  value={situacao}
                  onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                    setSituacao(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-28 h-9 text-xs">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 w-20">
                    <button
                      onClick={() => alternarOrdenacao('codigo')}
                      className="flex items-center gap-1 hover:text-slate-900 font-semibold"
                    >
                      Cód.
                      {renderIconeOrdenacao('codigo')}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      onClick={() => alternarOrdenacao('nome')}
                      className="flex items-center gap-1 hover:text-slate-900 font-semibold"
                    >
                      Nome da Condição
                      {renderIconeOrdenacao('nome')}
                    </button>
                  </th>
                  <th className="py-3 px-4 w-24">
                    <button
                      onClick={() => alternarOrdenacao('tipo')}
                      className="flex items-center gap-1 hover:text-slate-900 font-semibold"
                    >
                      Tipo
                      {renderIconeOrdenacao('tipo')}
                    </button>
                  </th>
                  <th className="py-3 px-4 w-24">
                    <button
                      onClick={() => alternarOrdenacao('uso')}
                      className="flex items-center gap-1 hover:text-slate-900 font-semibold"
                    >
                      Uso
                      {renderIconeOrdenacao('uso')}
                    </button>
                  </th>
                  <th className="py-3 px-4 w-24 text-center">Parcelas</th>
                  <th className="py-3 px-4">Prazos de Vencimento</th>
                  <th className="py-3 px-4 w-32">Parâmetros</th>
                  <th className="py-3 px-4 w-24 text-center">Situação</th>
                  <th className="py-3 px-4 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        <span>Carregando condições de pagamento...</span>
                      </div>
                    </td>
                  </tr>
                ) : condicoes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CreditCard className="h-8 w-8 text-slate-300" />
                        <span className="font-medium text-slate-700">
                          Nenhuma condição de pagamento encontrada
                        </span>
                        <span className="text-slate-400">
                          {busca
                            ? 'Tente ajustar os termos da sua pesquisa ou filtros.'
                            : 'Cadastre sua primeira condição clicando no botão "Nova Condição".'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  condicoes.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors text-slate-700"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-500">
                        #{item.codigo}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div>{item.nome}</div>
                        {item.observacao && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs font-normal">
                            {item.observacao}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={
                            item.tipo === 'À vista'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }
                        >
                          {item.tipo}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 border-slate-200 font-normal"
                        >
                          {item.uso}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {item.quantidade_parcelas}x
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.dias_parcelas && item.dias_parcelas.length > 0 ? (
                            item.dias_parcelas.map((d, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-700 font-mono text-[11px]"
                              >
                                {d}d
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[11px] space-y-0.5">
                        {Boolean(item.percentual_entrada && item.percentual_entrada > 0) && (
                          <div className="text-slate-600">
                            Entrada:{' '}
                            <span className="font-semibold text-slate-900">
                              {item.percentual_entrada}%
                            </span>
                          </div>
                        )}
                        {Boolean(item.acrescimo_percentual && item.acrescimo_percentual > 0) && (
                          <div className="text-amber-700">
                            Juros/Acrésc:{' '}
                            <span className="font-semibold">+{item.acrescimo_percentual}%</span>
                          </div>
                        )}
                        {Boolean(item.desconto_percentual && item.desconto_percentual > 0) && (
                          <div className="text-emerald-700">
                            Desconto:{' '}
                            <span className="font-semibold">-{item.desconto_percentual}%</span>
                          </div>
                        )}
                        {Boolean(item.dia_fixo_vencimento) && (
                          <div className="text-blue-700">
                            Dia fixo:{' '}
                            <span className="font-semibold">Dia {item.dia_fixo_vencimento}</span>
                          </div>
                        )}
                        {!item.percentual_entrada &&
                          !item.acrescimo_percentual &&
                          !item.desconto_percentual &&
                          !item.dia_fixo_vencimento && (
                            <span className="text-slate-400">Padrão</span>
                          )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.ativo ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[10px]"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-rose-50 text-rose-700 border-rose-200 gap-1 text-[10px]"
                          >
                            <XCircle className="h-3 w-3" />
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
                              title="Editar"
                              className="h-8 w-8 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
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
                                title="Inativar condição"
                                className="h-8 w-8 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setItemParaAtivar(item)}
                                title="Reativar condição"
                                className="h-8 w-8 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50"
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
          {totalPaginas > 1 && (
            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Mostrando <span className="font-medium text-slate-900">{condicoes.length}</span> de{' '}
                <span className="font-medium text-slate-900">{totalItens}</span> condições de
                pagamento
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1 || carregando}
                  className="h-8 px-2.5 text-xs"
                >
                  Anterior
                </Button>
                <div className="px-2 font-medium text-slate-700">
                  {pagina} de {totalPaginas}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas || carregando}
                  className="h-8 px-2.5 text-xs"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Formulário Completo com Prévia Interativa de Parcelas */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSalvar} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                <DialogTitle className="text-base font-bold text-slate-900">
                  {editandoId ? `Editar Condição #${codigoExibicao}` : 'Nova Condição de Pagamento'}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500">
                Configure os parâmetros de faturamento, prazos e simule o cronograma de parcelas em
                tempo real.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Linha 1: Nome, Tipo e Uso */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <Label htmlFor="cond-nome" className="text-xs font-semibold text-slate-700">
                    Nome da Condição *
                  </Label>
                  <Input
                    id="cond-nome"
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value)
                      if (errosForm.nome) setErrosForm((prev) => ({ ...prev, nome: '' }))
                    }}
                    placeholder="Ex: 30/60/90, Entrada + 2x"
                    className={`h-9 text-xs ${errosForm.nome ? 'border-red-500' : ''}`}
                    autoFocus
                  />
                  {errosForm.nome && <p className="text-[11px] text-red-600">{errosForm.nome}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Tipo *</Label>
                  <Select
                    value={tipo}
                    onValueChange={(val) => handleTrocaTipo(val as TipoCondicaoPagamento)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="À vista">À vista</SelectItem>
                      <SelectItem value="A prazo">A prazo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Aplicabilidade *</Label>
                  <Select value={uso} onValueChange={(val) => setUso(val as UsoCondicaoPagamento)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ambos">Ambos (Vendas e Compras)</SelectItem>
                      <SelectItem value="Vendas">Apenas Vendas</SelectItem>
                      <SelectItem value="Compras">Apenas Compras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Linha 2: Quantidade de Parcelas e Prazos em Dias */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cond-qtd" className="text-xs font-semibold text-slate-700">
                    Quantidade de Parcelas *
                  </Label>
                  <Input
                    id="cond-qtd"
                    type="number"
                    min="1"
                    disabled={tipo === 'À vista'}
                    value={quantidadeParcelas}
                    onChange={(e) => {
                      const val = e.target.value
                      setQuantidadeParcelas(val)
                      if (errosForm.quantidade_parcelas) {
                        setErrosForm((prev) => ({ ...prev, quantidade_parcelas: '' }))
                      }
                    }}
                    className={`h-9 text-xs font-mono ${
                      errosForm.quantidade_parcelas ? 'border-red-500' : ''
                    }`}
                  />
                  {errosForm.quantidade_parcelas && (
                    <p className="text-[11px] text-red-600">{errosForm.quantidade_parcelas}</p>
                  )}
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="cond-dias" className="text-xs font-semibold text-slate-700">
                    Dias das Parcelas (a partir da data da operação) *
                  </Label>
                  <Input
                    id="cond-dias"
                    disabled={tipo === 'À vista'}
                    value={diasParcelasStr}
                    onChange={(e) => {
                      setDiasParcelasStr(e.target.value)
                      if (errosForm.dias_parcelas) {
                        setErrosForm((prev) => ({ ...prev, dias_parcelas: '' }))
                      }
                    }}
                    placeholder={tipo === 'À vista' ? '0' : 'Ex: 30, 60, 90'}
                    className={`h-9 text-xs font-mono ${
                      errosForm.dias_parcelas ? 'border-red-500' : ''
                    }`}
                  />
                  {errosForm.dias_parcelas ? (
                    <p className="text-[11px] text-red-600">{errosForm.dias_parcelas}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      Ordem crescente, separados por vírgula. A quantidade deve coincidir com o
                      total de parcelas.
                    </p>
                  )}
                </div>
              </div>

              {/* Linha 3: Entrada, Acréscimo, Desconto e Dia Fixo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
                <div className="space-y-1">
                  <Label htmlFor="cond-entrada" className="text-xs font-medium text-slate-700">
                    Entrada (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="cond-entrada"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      disabled={tipo === 'À vista'}
                      value={percentualEntrada}
                      onChange={(e) => setPercentualEntrada(e.target.value)}
                      placeholder="0.00"
                      className="h-9 text-xs font-mono pr-7"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cond-acrescimo" className="text-xs font-medium text-slate-700">
                    Acréscimo/Juros (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="cond-acrescimo"
                      type="number"
                      step="0.01"
                      min="0"
                      value={acrescimoPercentual}
                      onChange={(e) => setAcrescimoPercentual(e.target.value)}
                      placeholder="0.00"
                      className="h-9 text-xs font-mono pr-7"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cond-desconto" className="text-xs font-medium text-slate-700">
                    Desconto (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="cond-desconto"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={descontoPercentual}
                      onChange={(e) => setDescontoPercentual(e.target.value)}
                      placeholder="0.00"
                      className="h-9 text-xs font-mono pr-7"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cond-dia-fixo" className="text-xs font-medium text-slate-700">
                    Dia Fixo Venc. (1 a 31)
                  </Label>
                  <div className="relative">
                    <Input
                      id="cond-dia-fixo"
                      type="number"
                      min="1"
                      max="31"
                      disabled={tipo === 'À vista'}
                      value={diaFixoVencimento}
                      onChange={(e) => setDiaFixoVencimento(e.target.value)}
                      placeholder="Ex: 10"
                      className="h-9 text-xs font-mono pr-7"
                    />
                    <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Observação interna */}
              <div className="space-y-1 pt-1">
                <Label htmlFor="cond-obs" className="text-xs font-medium text-slate-700">
                  Observações
                </Label>
                <Textarea
                  id="cond-obs"
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Informações adicionais para a equipe comercial ou financeiro..."
                  className="text-xs resize-none"
                />
              </div>

              {/* SEÇÃO DE PRÉVIA INTERATIVA DE PARCELAS */}
              <div className="mt-4 pt-3 border-t border-slate-200 bg-slate-50/80 rounded-lg p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Simulação / Prévia de Parcelas
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="val-simulacao"
                      className="text-xs text-slate-600 whitespace-nowrap"
                    >
                      Valor de exemplo (R$):
                    </Label>
                    <Input
                      id="val-simulacao"
                      value={valorSimulacao}
                      onChange={(e) => setValorSimulacao(e.target.value)}
                      placeholder="1000.00"
                      className="h-7 w-28 text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                {parcelasPrevia.length === 0 ? (
                  <div className="text-center py-3 text-xs text-slate-400">
                    Preencha o valor de exemplo e os prazos para calcular a prévia.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                      {parcelasPrevia.map((p) => (
                        <div
                          key={p.numero}
                          className="bg-white border border-slate-200 rounded-md p-2 text-xs shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-slate-400 text-[10px]">
                            <span>Parcela {p.numero}</span>
                            <span>{formatarDataBr(p.data_vencimento)}</span>
                          </div>
                          <div className="text-xs font-bold text-slate-900 mt-1 font-mono">
                            {formatarMoeda(p.valor)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <span className="text-slate-500">
                        Total calculado ({parcelasPrevia.length}{' '}
                        {parcelasPrevia.length === 1 ? 'parcela' : 'parcelas'}):
                      </span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatarMoeda(totalPreviaCalculado)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : editandoId ? (
                  'Salvar Alterações'
                ) : (
                  'Criar Condição'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alerta de Confirmação de Inativação */}
      <AlertDialog
        open={Boolean(itemParaInativar)}
        onOpenChange={(open) => !open && setItemParaInativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="text-base font-semibold">
                Inativar Condição de Pagamento?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-500">
              A condição <strong>"{itemParaInativar?.nome}"</strong> será inativada. Ela não estará
              disponível para novas vendas ou pedidos, mas continuará registrada nas operações
              passadas para fins de auditoria e histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
            >
              {processandoAcao ? 'Inativando...' : 'Confirmar Inativação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alerta de Confirmação de Reativação */}
      <AlertDialog
        open={Boolean(itemParaAtivar)}
        onOpenChange={(open) => !open && setItemParaAtivar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-emerald-600">
              <RotateCcw className="h-5 w-5" />
              <AlertDialogTitle className="text-base font-semibold">
                Reativar Condição de Pagamento?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-500">
              Deseja reativar a condição <strong>"{itemParaAtivar?.nome}"</strong>? Ela voltará a
              ficar disponível para faturamento e lançamentos comerciais.
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
              {processandoAcao ? 'Reativando...' : 'Confirmar Reativação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CondicoesPagamentoPage
