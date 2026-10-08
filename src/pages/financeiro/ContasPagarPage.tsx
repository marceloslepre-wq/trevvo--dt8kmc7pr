import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  DollarSign,
  Plus,
  Filter,
  Search,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Sparkles,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectFornecedor } from '@/components/SelectFornecedor'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  ContaPagar,
  listarContasPagar,
  ResultadoPaginadoContasPagar,
  OrigemContaPagar,
} from '@/services/financeiro'
import { PlanoConta } from '@/services/planoContas'
import { CentroCusto } from '@/services/centrosCusto'
import {
  listarNotasLancadasSemTitulos,
  gerarTitulosRetroativosNotas,
  NotaSemTituloRetroativo,
} from '@/services/notasEntrada'
import { ModalNovoTitulo } from './ModalNovoTitulo'
import { ModalPagarTitulos } from './ModalPagarTitulos'
import { ModalDetalheTitulo } from './ModalDetalheTitulo'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const ContasPagarPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeCriar = pode('financeiro_pagar', 'criar')
  const podeEditar = pode('financeiro_pagar', 'editar')

  // Checagem de Administrador exclusivo via perfis_acesso.administrador = true (NUNCA por email fixo)
  const [ehAdmin, setEhAdmin] = useState(false)

  // Filtros
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
  const [fornecedorId, setFornecedorId] = useState('')
  const [planoContaId, setPlanoContaId] = useState('')
  const [centroCustoId, setCentroCustoId] = useState('')
  const [origem, setOrigem] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)

  // Dados
  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<ResultadoPaginadoContasPagar>({
    items: [],
    totalItems: 0,
    totalPages: 1,
    page: 1,
    perPage: 30,
    totais: { valorOriginal: 0, valorPago: 0, saldo: 0 },
  })

  // Seleção múltipla para pagamento
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({})

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalPagarAberto, setModalPagarAberto] = useState(false)
  const [titulosParaPagar, setTitulosParaPagar] = useState<ContaPagar[]>([])
  const [tituloDetalheId, setTituloDetalheId] = useState<string | null>(null)
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false)

  // Modal Admin: Gerar Títulos Retroativos das notas lançadas
  const [modalRetroativoAberto, setModalRetroativoAberto] = useState(false)
  const [carregandoRetroativos, setCarregandoRetroativos] = useState(false)
  const [executandoRetroativos, setExecutandoRetroativos] = useState(false)
  const [notasSemTitulos, setNotasSemTitulos] = useState<NotaSemTituloRetroativo[]>([])

  // Auxiliares
  const [planosContas, setPlanosContas] = useState<PlanoConta[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])

  // 1. Carregar perfil para checar se é administrador
  useEffect(() => {
    const verificarAdmin = async () => {
      try {
        const userId = pb.authStore.record?.id
        if (!userId) return
        const usuarios = await pb.collection('usuarios').getFullList({
          filter: `auth_user_id = '${userId}' && ativo = true`,
          expand: 'perfil_id',
        })
        if (usuarios.length > 0) {
          const usr = usuarios[0]
          const perfil = usr.expand?.perfil_id as { administrador?: boolean } | undefined
          if (perfil?.administrador) {
            setEhAdmin(true)
          }
        }
      } catch (err) {
        console.error('Erro ao checar admin:', err)
      }
    }
    verificarAdmin()
  }, [])

  // 2. Carregar auxiliares da empresa
  useEffect(() => {
    if (!empresaAtiva?.id) return
    const carregarAuxiliares = async () => {
      try {
        const [planos, ccs] = await Promise.all([
          pb.collection('plano_contas').getFullList<PlanoConta>({
            filter: `natureza = 'Analítica' && ativo = true`,
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
        console.error('Erro ao carregar dados auxiliares:', err)
      }
    }
    carregarAuxiliares()
  }, [empresaAtiva?.id])

  // 3. Buscar títulos com paginação e filtros
  const carregarTitulos = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await listarContasPagar({
        empresaId: empresaAtiva.id,
        periodoInicio: periodoInicio || undefined,
        periodoFim: periodoFim || undefined,
        situacao: situacao !== 'todos' ? situacao : undefined,
        fornecedorId: fornecedorId || undefined,
        planoContaId: planoContaId || undefined,
        centroCustoId: centroCustoId || undefined,
        origem: origem || undefined,
        busca: busca.trim() || undefined,
        page: pagina,
        perPage: 30,
      })
      setDados(res)
    } catch (err) {
      console.error('Erro ao carregar contas a pagar:', err)
      toast({
        title: 'Erro ao carregar contas a pagar',
        description: 'Verifique os filtros ou tente novamente.',
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
    fornecedorId,
    planoContaId,
    centroCustoId,
    origem,
    busca,
    pagina,
    toast,
  ])

  useEffect(() => {
    carregarTitulos()
  }, [carregarTitulos])

  // Controle de Seleção de Itens
  const titulosPaginados = dados.items
  const todosSelecionados =
    titulosPaginados.length > 0 &&
    titulosPaginados
      .filter((t) => t.status === 'Em aberto' || t.status === 'Pago parcial')
      .every((t) => selecionados[t.id])

  const handleToggleSelecionarTodos = () => {
    if (todosSelecionados) {
      setSelecionados({})
    } else {
      const novo: Record<string, boolean> = {}
      titulosPaginados.forEach((t) => {
        if (t.status === 'Em aberto' || t.status === 'Pago parcial') {
          novo[t.id] = true
        }
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

  // Ação de pagar selecionados
  const handlePagarSelecionados = () => {
    if (titulosSelecionadosObjs.length === 0) {
      toast({
        title: 'Nenhum título selecionado',
        description: 'Selecione ao menos um título em aberto para pagar.',
      })
      return
    }
    setTitulosParaPagar(titulosSelecionadosObjs)
    setModalPagarAberto(true)
  }

  // Ação de pagar título individual
  const handlePagarIndividual = (t: ContaPagar) => {
    setTitulosParaPagar([t])
    setModalPagarAberto(true)
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
      'Fornecedor',
      'CPF/CNPJ',
      'Documento',
      'Parcela',
      'Descrição',
      'Plano de Contas',
      'Centro de Custo',
      'Valor Original (R$)',
      'Valor Pago (R$)',
      'Saldo (R$)',
      'Situação',
      'Origem',
    ]

    const linhas = dados.items.map((t) => {
      const dtVenc = new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
      const forn =
        t.expand?.fornecedor_id?.razao_social ||
        t.expand?.fornecedor_id?.nome_fantasia ||
        'Fornecedor'
      const docForn = t.expand?.fornecedor_id?.cpf_cnpj || ''
      const plano = t.expand?.plano_conta_id?.descricao || ''
      const cc = t.expand?.centro_custo_id?.descricao || ''
      return [
        `"${dtVenc}"`,
        `"${forn.replace(/"/g, '""')}"`,
        `"${docForn}"`,
        `"${t.numero_documento}"`,
        `"${t.parcela}"`,
        `"${t.descricao.replace(/"/g, '""')}"`,
        `"${plano.replace(/"/g, '""')}"`,
        `"${cc.replace(/"/g, '""')}"`,
        t.valor_original.toFixed(2),
        t.valor_pago.toFixed(2),
        t.saldo.toFixed(2),
        `"${t.status}"`,
        `"${t.origem}"`,
      ].join(';')
    })

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `contas_pagar_${hojeStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Abertura da rotina retroativa do Administrador
  const handleAbrirModalRetroativo = async () => {
    if (!empresaAtiva?.id) return
    setModalRetroativoAberto(true)
    setCarregandoRetroativos(true)
    try {
      const res = await listarNotasLancadasSemTitulos(empresaAtiva.id)
      setNotasSemTitulos(res.notas || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Erro ao verificar notas lançadas',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregandoRetroativos(false)
    }
  }

  const handleExecutarGeracaoRetroativa = async () => {
    if (!empresaAtiva?.id) return
    setExecutandoRetroativos(true)
    try {
      const res = await gerarTitulosRetroativosNotas(empresaAtiva.id)
      toast({
        title: 'Títulos gerados com sucesso!',
        description: res.message,
      })
      setModalRetroativoAberto(false)
      carregarTitulos()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha na geração retroativa',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setExecutandoRetroativos(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Topo / Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-blue-600" />
            Contas a Pagar
          </h1>
          <p className="text-xs text-slate-500">
            Gerencie obrigações financeiras, pagamentos individuais ou em lote e baixas com
            histórico auditado.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ehAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAbrirModalRetroativo}
              className="text-xs border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-100/70"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              Gerar títulos das notas já lançadas
            </Button>
          )}

          {idsSelecionados.length > 0 && podeEditar && (
            <Button
              type="button"
              size="sm"
              onClick={handlePagarSelecionados}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Pagar selecionados ({idsSelecionados.length})
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
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
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
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="todos">Todos</option>
              <option value="abertos">Em aberto</option>
              <option value="vencidos">Vencidos</option>
              <option value="pagos">Pagos</option>
              <option value="cancelados">Cancelados</option>
            </select>
          </div>

          {/* Fornecedor */}
          <div className="sm:col-span-2 space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Fornecedor:</span>
            <SelectFornecedor
              value={fornecedorId}
              onChange={(id) => {
                setFornecedorId(id)
                setPagina(1)
              }}
              placeholder="Todos os fornecedores..."
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
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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

        {/* Linha 2 de Filtros: Origem e Busca textual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1 text-xs">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Origem:</span>
            <select
              value={origem}
              onChange={(e) => {
                setOrigem(e.target.value)
                setPagina(1)
              }}
              className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todas as origens</option>
              <option value="Manual">Manual</option>
              <option value="NF Entrada">NF Entrada</option>
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
                placeholder="Nº doc, fatura, boleto ou texto da descrição..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setPeriodoInicio(primeiroDiaMes)
                setPeriodoFim(ultimoDiaMes)
                setSituacao('todos')
                setFornecedorId('')
                setPlanoContaId('')
                setCentroCustoId('')
                setOrigem('')
                setBusca('')
                setPagina(1)
              }}
              className="h-8 text-xs w-full sm:w-auto"
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Títulos a Pagar */}
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
                <th className="py-2.5 px-3 text-left">Fornecedor</th>
                <th className="py-2.5 px-3 text-left w-32">Doc / Parc</th>
                <th className="py-2.5 px-3 text-left">Descrição</th>
                <th className="py-2.5 px-3 text-left">Plano de Contas</th>
                <th className="py-2.5 px-3 text-right w-28">Valor Original</th>
                <th className="py-2.5 px-3 text-right w-28">Saldo</th>
                <th className="py-2.5 px-3 text-center w-28">Situação</th>
                <th className="py-2.5 px-3 text-center w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                      <span>Carregando títulos a pagar...</span>
                    </div>
                  </td>
                </tr>
              ) : dados.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Nenhum título encontrado</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Ajuste os filtros de período e situação ou cadastre um novo título.
                    </p>
                  </td>
                </tr>
              ) : (
                dados.items.map((t) => {
                  const saldoDevedor = t.saldo ?? t.valor_original
                  const vencido =
                    t.data_vencimento < hojeStr &&
                    (t.status === 'Em aberto' || t.status === 'Pago parcial')
                  const venceHoje =
                    t.data_vencimento === hojeStr &&
                    (t.status === 'Em aberto' || t.status === 'Pago parcial')
                  const podePagarLinha = t.status === 'Em aberto' || t.status === 'Pago parcial'

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        selecionados[t.id] ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-center">
                        {podePagarLinha ? (
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
                          {t.expand?.fornecedor_id?.razao_social ||
                            t.expand?.fornecedor_id?.nome_fantasia ||
                            'Fornecedor'}
                        </span>
                        {t.expand?.fornecedor_id?.cpf_cnpj && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {t.expand.fornecedor_id.cpf_cnpj}
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
                            {t.origem}
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

                      <td className="py-2 px-3 text-right font-mono font-medium text-slate-700">
                        R$ {t.valor_original.toFixed(2)}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        R$ {saldoDevedor.toFixed(2)}
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
                        ) : t.status === 'Pago' ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0.5 px-2"
                          >
                            Pago
                          </Badge>
                        ) : t.status === 'Pago parcial' ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0.5 px-2"
                          >
                            Pago parcial
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
                            Em aberto
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
                            className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600"
                            title="Ver detalhes do título"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {podePagarLinha && podeEditar && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handlePagarIndividual(t)}
                              className="h-7 text-[11px] px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                              title="Pagar título"
                            >
                              Pagar
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
              <span className="text-slate-500 block text-[11px]">Total Pago:</span>
              <span className="font-mono font-semibold text-emerald-700 text-sm">
                R$ {dados.totais.valorPago.toFixed(2)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[11px]">Saldo Devedor:</span>
              <span className="font-mono font-bold text-blue-900 text-sm">
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

      {/* MODAL 1: NOVO TÍTULO */}
      <ModalNovoTitulo
        open={modalNovoAberto}
        onOpenChange={setModalNovoAberto}
        onSucesso={() => carregarTitulos()}
      />

      {/* MODAL 2: PAGAR TÍTULOS (INDIVIDUAL OU LOTE) */}
      <ModalPagarTitulos
        open={modalPagarAberto}
        onOpenChange={setModalPagarAberto}
        titulos={titulosParaPagar}
        onSucesso={() => {
          setSelecionados({})
          carregarTitulos()
        }}
      />

      {/* MODAL 3: DETALHE DO TÍTULO / HISTÓRICO / ESTORNO / CANCELAMENTO */}
      <ModalDetalheTitulo
        tituloId={tituloDetalheId}
        open={modalDetalheAberto}
        onOpenChange={setModalDetalheAberto}
        onAtualizado={() => carregarTitulos()}
      />

      {/* MODAL 4: ADMIN - GERAR TÍTULOS RETROATIVOS DE NOTAS DE ENTRADA JÁ LANÇADAS */}
      <Dialog open={modalRetroativoAberto} onOpenChange={setModalRetroativoAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Gerar Títulos das Notas já Lançadas
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Rotina administrativa para gerar contas a pagar correspondentes às notas lançadas
              antes desta etapa. Os vencimentos no passado são mantidos.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            {carregandoRetroativos ? (
              <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-amber-600" />
                <span>Localizando notas fiscais lançadas sem títulos...</span>
              </div>
            ) : notasSemTitulos.length === 0 ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-center">
                Todas as notas de entrada lançadas já possuem títulos gerados no Contas a Pagar!
              </div>
            ) : (
              <>
                <p className="text-slate-700">
                  Foram encontradas <strong>{notasSemTitulos.length} notas lançadas</strong> sem
                  títulos financeiros:
                </p>

                <div className="border rounded-md max-h-56 overflow-y-auto bg-slate-50">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600 border-b">
                      <tr>
                        <th className="py-1.5 px-3 text-left">Número</th>
                        <th className="py-1.5 px-3 text-left">Fornecedor</th>
                        <th className="py-1.5 px-3 text-left">Entrada</th>
                        <th className="py-1.5 px-3 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {notasSemTitulos.map((n) => (
                        <tr key={n.nota_id}>
                          <td className="py-1.5 px-3 font-mono font-semibold">NF #{n.numero}</td>
                          <td className="py-1.5 px-3 truncate max-w-[200px]">
                            {n.fornecedor_nome}
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {new Date(n.data_entrada + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold">
                            R$ {n.valor_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalRetroativoAberto(false)}
            >
              Fechar
            </Button>
            {notasSemTitulos.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={handleExecutarGeracaoRetroativa}
                disabled={executandoRetroativos}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {executandoRetroativos ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Gerando títulos...
                  </>
                ) : (
                  `Gerar títulos para ${notasSemTitulos.length} notas`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
