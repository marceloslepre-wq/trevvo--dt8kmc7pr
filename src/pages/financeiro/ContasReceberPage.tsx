import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TrendingUp,
  Plus,
  Search,
  Download,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  FileText,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectCliente } from '@/components/SelectCliente'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  ContaReceber,
  listarContasReceber,
  ResultadoPaginadoContasReceber,
} from '@/services/contasReceber'
import { PlanoConta } from '@/services/planoContas'
import { CentroCusto } from '@/services/centrosCusto'
import { ModalNovoTituloReceber } from './ModalNovoTituloReceber'
import { ModalReceberTitulos } from './ModalReceberTitulos'
import { ModalDetalheTituloReceber } from './ModalDetalheTituloReceber'

export const ContasReceberPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeCriar = pode('financeiro_receber', 'criar')
  const podeEditar = pode('financeiro_receber', 'editar')

  // Filtros padrão: mês atual
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)
  const hojeStr = hoje.toISOString().slice(0, 10)

  const [searchParams] = useSearchParams()
  const paramSituacao = searchParams.get('situacao') as
    | 'abertos'
    | 'vencidos'
    | 'pagos'
    | 'cancelados'
    | 'todos'
    | null
  const paramInicio = searchParams.get('dataInicio')
  const paramFim = searchParams.get('dataFim')

  const [periodoInicio, setPeriodoInicio] = useState(paramInicio || primeiroDiaMes)
  const [periodoFim, setPeriodoFim] = useState(paramFim || ultimoDiaMes)
  const [situacao, setSituacao] = useState<
    'abertos' | 'vencidos' | 'pagos' | 'cancelados' | 'todos'
  >(paramSituacao || 'todos')
  const [clienteId, setClienteId] = useState('')
  const [planoContaId, setPlanoContaId] = useState('')
  const [centroCustoId, setCentroCustoId] = useState('')
  const [origem, setOrigem] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [diasAtrasoMinimo, setDiasAtrasoMinimo] = useState<string>('')
  const [pagina, setPagina] = useState(1)

  // Dados carregados
  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<ResultadoPaginadoContasReceber>({
    items: [],
    totalItems: 0,
    totalPages: 1,
    page: 1,
    perPage: 30,
    totais: {
      totalOriginal: 0,
      totalRecebido: 0,
      totalSaldo: 0,
      totalVencido: 0,
      valorOriginal: 0,
      valorRecebido: 0,
      saldo: 0,
    },
  })

  // Seleção múltipla para recebimento
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({})

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalReceberAberto, setModalReceberAberto] = useState(false)
  const [titulosParaReceber, setTitulosParaReceber] = useState<ContaReceber[]>([])
  const [tituloDetalheId, setTituloDetalheId] = useState<string | null>(null)
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false)

  // Auxiliares
  const [planosContas, setPlanosContas] = useState<PlanoConta[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])

  // Carregar planos analíticos e centros de custo da empresa
  useEffect(() => {
    if (!empresaAtiva?.id) return
    const carregarAuxiliares = async () => {
      try {
        const [planos, ccs] = await Promise.all([
          pb.collection('plano_contas').getFullList<PlanoConta>({
            filter: `natureza = 'Analítica' && (tipo = 'Receita' || tipo = 'Sem resultado') && ativo = true`,
            sort: 'codigo',
          }),
          pb.collection('centros_custo').getFullList<CentroCusto>({
            filter: `ativo = true`,
            sort: 'codigo',
          }),
        ])
        setPlanosContas(planos)
        setCentrosCusto(ccs)
      } catch (err) {
        console.error('Erro ao carregar auxiliares do financeiro a receber:', err)
      }
    }
    carregarAuxiliares()
  }, [empresaAtiva?.id])

  // Buscar títulos com filtros e paginação
  const carregarTitulos = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const minAtraso = diasAtrasoMinimo ? parseInt(diasAtrasoMinimo, 10) : undefined

      const res = await listarContasReceber({
        empresaId: empresaAtiva.id,
        periodoInicio: periodoInicio || undefined,
        periodoFim: periodoFim || undefined,
        situacao: situacao !== 'todos' ? situacao : undefined,
        clienteId: clienteId || undefined,
        planoContaId: planoContaId || undefined,
        centroCustoId: centroCustoId || undefined,
        origem: origem || undefined,
        busca: busca.trim() || undefined,
        diasAtrasoMinimo:
          !isNaN(minAtraso as number) && (minAtraso as number) > 0 ? minAtraso : undefined,
        page: pagina,
        perPage: 30,
      })
      setDados(res)
    } catch (err) {
      console.error('Erro ao carregar contas a receber:', err)
      toast({
        title: 'Erro ao carregar contas a receber',
        description: 'Verifique sua conexão ou tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva?.id,
    periodoInicio,
    periodoFim,
    situacao,
    clienteId,
    planoContaId,
    centroCustoId,
    origem,
    busca,
    diasAtrasoMinimo,
    pagina,
    toast,
  ])

  useEffect(() => {
    carregarTitulos()
  }, [carregarTitulos])

  // Controle de Seleção múltipla
  const titulosPaginados = dados.items
  const titulosEmAbertoNaPagina = useMemo(
    () => titulosPaginados.filter((t) => t.status === 'Aberto' || t.status === 'Parcial'),
    [titulosPaginados],
  )

  const todosSelecionados =
    titulosEmAbertoNaPagina.length > 0 && titulosEmAbertoNaPagina.every((t) => selecionados[t.id])

  const handleToggleSelecionarTodos = () => {
    if (todosSelecionados) {
      setSelecionados({})
    } else {
      const novo: Record<string, boolean> = {}
      titulosEmAbertoNaPagina.forEach((t) => {
        novo[t.id] = true
      })
      setSelecionados(novo)
    }
  }

  const handleToggleItem = (id: string) => {
    setSelecionados((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const idsSelecionados = useMemo(() => {
    return Object.keys(selecionados).filter((id) => selecionados[id])
  }, [selecionados])

  const titulosSelecionadosObjs = useMemo(() => {
    return dados.items.filter((t) => idsSelecionados.includes(t.id))
  }, [dados.items, idsSelecionados])

  // Ação: Receber selecionados em lote
  const handleReceberSelecionados = () => {
    if (titulosSelecionadosObjs.length === 0) {
      toast({
        title: 'Nenhum título selecionado',
        description: 'Selecione ao menos um título em aberto para receber.',
      })
      return
    }
    setTitulosParaReceber(titulosSelecionadosObjs)
    setModalReceberAberto(true)
  }

  // Ação: Receber título individual
  const handleReceberIndividual = (t: ContaReceber) => {
    setTitulosParaReceber([t])
    setModalReceberAberto(true)
  }

  // Abrir detalhe do título
  const handleAbrirDetalhe = (id: string) => {
    setTituloDetalheId(id)
    setModalDetalheAberto(true)
  }

  // Exportar CSV
  const handleExportarCsv = () => {
    if (dados.items.length === 0) {
      toast({ title: 'Nenhum registro para exportar' })
      return
    }

    const cabecalho = [
      'Vencimento',
      'Cliente',
      'CPF/CNPJ',
      'Documento',
      'Parcela',
      'Descrição',
      'Plano de Contas',
      'Centro de Custo',
      'Valor Original (R$)',
      'Valor Recebido (R$)',
      'Saldo em Aberto (R$)',
      'Dias Atraso',
      'Situação',
      'Origem',
    ]

    const linhas = dados.items.map((t) => {
      const dtVenc = new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
      const clienteNome =
        t.expand?.cliente_id?.razao_social ||
        t.expand?.cliente_id?.nome_fantasia ||
        t.expand?.cliente_id?.nome ||
        'Cliente'
      const docCliente = t.expand?.cliente_id?.cpf_cnpj || ''
      const plano = t.expand?.plano_conta_id?.descricao || ''
      const cc = t.expand?.centro_custo_id?.descricao || ''

      const venc = new Date(t.data_vencimento + 'T00:00:00').getTime()
      const hojeMs = new Date(hojeStr + 'T00:00:00').getTime()
      const atraso =
        (t.status === 'Aberto' || t.status === 'Parcial') && venc < hojeMs
          ? Math.floor((hojeMs - venc) / (1000 * 60 * 60 * 24))
          : 0

      return [
        `"${dtVenc}"`,
        `"${clienteNome.replace(/"/g, '""')}"`,
        `"${docCliente}"`,
        `"${t.numero_documento}"`,
        `"${t.parcela}"`,
        `"${t.descricao.replace(/"/g, '""')}"`,
        `"${plano.replace(/"/g, '""')}"`,
        `"${cc.replace(/"/g, '""')}"`,
        t.valor_original.toFixed(2),
        (t.valor_recebido || 0).toFixed(2),
        (t.saldo ?? t.valor_original).toFixed(2),
        atraso,
        `"${t.status}"`,
        `"${t.origem}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `contas_receber_${hojeStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* Topo / Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-600" />
            Contas a Receber
          </h1>
          <p className="text-xs text-slate-500">
            Acompanhe créditos, recebimentos pontuais ou em lote, controle de inadimplência e
            recibos em PDF.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {idsSelecionados.length > 0 && podeEditar && (
            <Button
              type="button"
              size="sm"
              onClick={handleReceberSelecionados}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Receber selecionados ({idsSelecionados.length})
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={dados.items.length === 0}
            className="text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              type="button"
              size="sm"
              onClick={() => setModalNovoAberto(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo título
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
          {/* Período de Vencimento Início */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Vencimento de:</span>
            <Input
              type="date"
              value={periodoInicio}
              onChange={(e) => {
                setPeriodoInicio(e.target.value)
                setPagina(1)
              }}
              className="h-8 text-xs"
            />
          </div>

          {/* Período de Vencimento Fim */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Até:</span>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => {
                setPeriodoFim(e.target.value)
                setPagina(1)
              }}
              className="h-8 text-xs"
            />
          </div>

          {/* Situação */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Situação:</span>
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value as any)
                setPagina(1)
              }}
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            >
              <option value="todos">Todos</option>
              <option value="abertos">Aberto</option>
              <option value="vencidos">Vencidos</option>
              <option value="pagos">Pagos (Recebidos)</option>
              <option value="cancelados">Cancelados</option>
            </select>
          </div>

          {/* Cliente */}
          <div className="sm:col-span-2 space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Cliente:</span>
            <SelectCliente
              value={clienteId}
              onChange={(id) => {
                setClienteId(id)
                setPagina(1)
              }}
              placeholder="Todos os clientes..."
            />
          </div>

          {/* Plano de Contas */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Plano de Contas:</span>
            <select
              value={planoContaId}
              onChange={(e) => {
                setPlanoContaId(e.target.value)
                setPagina(1)
              }}
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Todos</option>
              {planosContas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} - {p.descricao}
                </option>
              ))}
            </select>
          </div>

          {/* Centro de Custo */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Centro de Custo:</span>
            <select
              value={centroCustoId}
              onChange={(e) => {
                setCentroCustoId(e.target.value)
                setPagina(1)
              }}
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Todos</option>
              {centrosCusto.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.codigo} - {cc.descricao}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha 2 de Filtros: Dias de Atraso, Origem e Busca textual */}
        <div className="grid grid-cols-1 sm:grid-cols-4 md:grid-cols-5 gap-2.5 pt-1 text-xs items-end">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Atraso mínimo (dias):</span>
            <Input
              type="number"
              min="1"
              value={diasAtrasoMinimo}
              onChange={(e) => {
                setDiasAtrasoMinimo(e.target.value)
                setPagina(1)
              }}
              placeholder="Ex: 5"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Origem:</span>
            <select
              value={origem}
              onChange={(e) => {
                setOrigem(e.target.value)
                setPagina(1)
              }}
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Todas as origens</option>
              <option value="Manual">Manual</option>
              <option value="Venda">Venda</option>
              <option value="PDV">PDV</option>
              <option value="Recorrência">Recorrência</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">
              Busca por documento ou descrição:
            </span>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPagina(1)
                }}
                placeholder="Nº título, doc, fatura ou texto..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setPeriodoInicio(primeiroDiaMes)
                setPeriodoFim(ultimoDiaMes)
                setSituacao('todos')
                setClienteId('')
                setPlanoContaId('')
                setCentroCustoId('')
                setOrigem('')
                setBusca('')
                setDiasAtrasoMinimo('')
                setPagina(1)
              }}
              className="h-8 text-xs w-full"
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Títulos a Receber */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b text-slate-600">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">
                  <Checkbox
                    checked={todosSelecionados}
                    onCheckedChange={handleToggleSelecionarTodos}
                    aria-label="Selecionar todos os títulos em aberto"
                  />
                </th>
                <th className="py-2.5 px-3 text-left w-28">Vencimento</th>
                <th className="py-2.5 px-3 text-left">Cliente</th>
                <th className="py-2.5 px-3 text-left w-32">Doc / Parc</th>
                <th className="py-2.5 px-3 text-left">Descrição</th>
                <th className="py-2.5 px-3 text-left">Plano de Contas</th>
                <th className="py-2.5 px-3 text-right w-24">Atraso</th>
                <th className="py-2.5 px-3 text-right w-28">Valor Original</th>
                <th className="py-2.5 px-3 text-right w-28">Saldo Aberto</th>
                <th className="py-2.5 px-3 text-center w-28">Situação</th>
                <th className="py-2.5 px-3 text-center w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
                      <span>Carregando títulos a receber...</span>
                    </div>
                  </td>
                </tr>
              ) : dados.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Nenhum título encontrado</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Ajuste os filtros de período e situação ou cadastre um novo título a receber.
                    </p>
                  </td>
                </tr>
              ) : (
                dados.items.map((t) => {
                  const saldoEmAberto = t.saldo ?? t.valor_original
                  const venc = new Date(t.data_vencimento + 'T00:00:00').getTime()
                  const hojeMs = new Date(hojeStr + 'T00:00:00').getTime()
                  const vencido = (t.status === 'Aberto' || t.status === 'Parcial') && venc < hojeMs
                  const venceHoje =
                    (t.status === 'Aberto' || t.status === 'Parcial') &&
                    t.data_vencimento === hojeStr
                  const diasAtraso =
                    vencido && venc < hojeMs
                      ? Math.floor((hojeMs - venc) / (1000 * 60 * 60 * 24))
                      : 0

                  const podeReceberLinha = t.status === 'Aberto' || t.status === 'Parcial'
                  const clienteNome =
                    t.expand?.cliente_id?.razao_social ||
                    t.expand?.cliente_id?.nome_fantasia ||
                    t.expand?.cliente_id?.nome ||
                    'Cliente'

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        selecionados[t.id] ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-center">
                        {podeReceberLinha ? (
                          <Checkbox
                            checked={Boolean(selecionados[t.id])}
                            onCheckedChange={() => handleToggleItem(t.id)}
                            aria-label={`Selecionar título ${t.numero_documento}`}
                          />
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-2 px-3">
                        <span className="font-mono font-semibold text-slate-800 block">
                          {new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Emissão:{' '}
                          {new Date(t.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </td>

                      <td className="py-2 px-3 max-w-[200px]">
                        <span className="font-semibold text-slate-800 block truncate">
                          {clienteNome}
                        </span>
                        {t.expand?.cliente_id?.cpf_cnpj && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {t.expand.cliente_id.cpf_cnpj}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono">
                        <span className="font-bold text-slate-800">{t.numero_documento}</span>
                        <span className="text-[11px] text-slate-500 block">Parc {t.parcela}</span>
                      </td>

                      <td className="py-2 px-3 max-w-[220px]">
                        <span className="text-slate-700 block truncate" title={t.descricao}>
                          {t.descricao}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="outline" className="text-[9px] py-0 px-1 text-slate-500">
                            {t.origem || 'Manual'}
                          </Badge>
                          {t.recorrencia_id && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 bg-purple-50 text-purple-700 border-purple-200"
                            >
                              Mensal {t.recorrencia_numero}/{t.recorrencia_total}
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-3 max-w-[180px]">
                        <span className="text-slate-700 block truncate">
                          {t.expand?.plano_conta_id?.codigo} - {t.expand?.plano_conta_id?.descricao}
                        </span>
                        {t.expand?.centro_custo_id && (
                          <span className="text-[10px] text-slate-400 block truncate">
                            {t.expand.centro_custo_id.descricao}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 text-right">
                        {diasAtraso > 0 ? (
                          <span className="text-red-600 font-semibold font-mono">
                            {diasAtraso}d
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-medium text-slate-700">
                        R$ {t.valor_original.toFixed(2)}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        R$ {saldoEmAberto.toFixed(2)}
                      </td>

                      <td className="py-2 px-3 text-center">
                        {vencido ? (
                          <Badge
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 text-white text-[10px] py-0.5 px-2"
                          >
                            Vencido
                          </Badge>
                        ) : venceHoje ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-[10px] py-0.5 px-2"
                          >
                            Vence hoje
                          </Badge>
                        ) : t.status === 'Recebido' ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0.5 px-2"
                          >
                            Recebido
                          </Badge>
                        ) : t.status === 'Parcial' ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0.5 px-2"
                          >
                            Parcial
                          </Badge>
                        ) : t.status === 'Cancelado' ? (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-500 line-through text-[10px] py-0.5 px-2"
                          >
                            Cancelado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] py-0.5 px-2"
                          >
                            Aberto
                          </Badge>
                        )}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAbrirDetalhe(t.id)}
                            className="h-7 w-7 p-0 text-slate-600 hover:text-emerald-600"
                            title="Ver detalhes do título"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {podeReceberLinha && podeEditar && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReceberIndividual(t)}
                              className="h-7 text-[11px] px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                              title="Receber título"
                            >
                              Receber
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé com Totais do Filtro e Paginação */}
        <div className="p-3 bg-slate-50 border-t flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-slate-500 block text-[11px]">Total Original do Filtro:</span>
              <span className="font-mono font-semibold text-slate-800 text-sm">
                R$ {dados.totais.valorOriginal.toFixed(2)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[11px]">Total Recebido:</span>
              <span className="font-mono font-semibold text-emerald-700 text-sm">
                R$ {dados.totais.valorRecebido.toFixed(2)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[11px]">Saldo a Receber:</span>
              <span className="font-mono font-bold text-emerald-900 text-sm">
                R$ {dados.totais.saldo.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="text-slate-500 text-[11px]">
              Página {dados.page} de {dados.totalPages} ({dados.totalItems} títulos)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={dados.page <= 1 || carregando}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.min(dados.totalPages, p + 1))}
              disabled={dados.page >= dados.totalPages || carregando}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL 1: NOVO TÍTULO A RECEBER */}
      <ModalNovoTituloReceber
        open={modalNovoAberto}
        onOpenChange={setModalNovoAberto}
        onSucesso={() => carregarTitulos()}
      />

      {/* MODAL 2: RECEBER TÍTULOS (INDIVIDUAL OU LOTE COM RECIBO PDF) */}
      <ModalReceberTitulos
        open={modalReceberAberto}
        onOpenChange={setModalReceberAberto}
        titulos={titulosParaReceber}
        onSucesso={() => {
          setSelecionados({})
          carregarTitulos()
        }}
      />

      {/* MODAL 3: DETALHE DO TÍTULO / HISTÓRICO / ESTORNO / CANCELAMENTO */}
      <ModalDetalheTituloReceber
        tituloId={tituloDetalheId}
        open={modalDetalheAberto}
        onOpenChange={setModalDetalheAberto}
        onAtualizado={() => carregarTitulos()}
      />
    </div>
  )
}

export default ContasReceberPage
