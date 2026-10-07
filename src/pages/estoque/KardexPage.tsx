import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  Package,
  Layers,
  Building,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { saldoEmData, estornarMovimento, EstoqueMovimento } from '@/services/estoque'
import { Produto } from '@/services/produtos'
import { SelectProduto } from '@/components/SelectProduto'
import pb from '@/lib/pocketbase/client'

export const KardexPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeExcluir = pode('estoque', 'excluir')

  // Produto Selecionado
  const [produtoId, setProdutoId] = useState<string>(searchParams.get('produto') || '')
  const [produto, setProduto] = useState<Produto | null>(null)

  // Período: padrão mês atual
  const agora = new Date()
  const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const hoje = agora.toISOString().slice(0, 10)

  const [dataInicio, setDataInicio] = useState<string>(searchParams.get('inicio') || primeiroDiaMes)
  const [dataFim, setDataFim] = useState<string>(searchParams.get('fim') || hoje)

  // Estado de dados
  const [carregando, setCarregando] = useState(false)
  const [saldoInicial, setSaldoInicial] = useState<{
    quantidade: number
    custo_medio: number
    valor_total: number
  }>({ quantidade: 0, custo_medio: 0, valor_total: 0 })
  const [movimentos, setMovimentos] = useState<EstoqueMovimento[]>([])

  // Modal de Estorno
  const [modalEstornoAberto, setModalEstornoAberto] = useState(false)
  const [movimentoParaEstornar, setMovimentoParaEstornar] = useState<EstoqueMovimento | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [salvandoEstorno, setSalvandoEstorno] = useState(false)

  // Carrega informações do produto
  useEffect(() => {
    if (!produtoId) {
      setProduto(null)
      return
    }

    pb.collection('produtos')
      .getOne<Produto>(produtoId, { expand: 'unidade_id,marca_id,grupo_id' })
      .then((p) => setProduto(p))
      .catch((err) => {
        console.error('Erro ao buscar produto:', err)
        setProduto(null)
      })
  }, [produtoId])

  // Atualiza parâmetros da URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (produtoId) params.set('produto', produtoId)
    if (dataInicio) params.set('inicio', dataInicio)
    if (dataFim) params.set('fim', dataFim)
    setSearchParams(params, { replace: true })
  }, [produtoId, dataInicio, dataFim, setSearchParams])

  // Busca saldo anterior e histórico de movimentos
  const carregarKardex = useCallback(async () => {
    if (!empresaAtiva || !produtoId || !dataInicio) return

    setCarregando(true)
    try {
      // 1. Saldo inicial retroativo até o dia anterior a dataInicio
      // Para pegar o saldo no encerramento do dia anterior:
      const d = new Date(`${dataInicio}T00:00:00`)
      d.setDate(d.getDate() - 1)
      const dataAnteriorStr = d.toISOString().slice(0, 10)

      const sIni = await saldoEmData(empresaAtiva.id, produtoId, dataAnteriorStr)
      setSaldoInicial(sIni)

      // 2. Movimentos no período em ordem cronológica CRESCENTE (Kardex físico-financeiro)
      const dataInicioIso = `${dataInicio}T00:00:00.000Z`
      const dataFimIso = `${dataFim}T23:59:59.999Z`

      const res = await pb.collection('estoque_movimentos').getFullList<EstoqueMovimento>({
        filter: `empresa_id = '${empresaAtiva.id}' && produto_id = '${produtoId}' && data_movimento >= '${dataInicioIso}' && data_movimento <= '${dataFimIso}'`,
        sort: 'data_movimento,created',
        expand: 'usuario_id,lote_id',
      })

      setMovimentos(res)
    } catch (err) {
      console.error('Erro ao carregar dados do Kardex:', err)
      toast({
        title: 'Erro ao carregar Kardex',
        description: 'Não foi possível carregar as movimentações do período.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva, produtoId, dataInicio, dataFim])

  useEffect(() => {
    if (produtoId && empresaAtiva) {
      carregarKardex()
    } else {
      setMovimentos([])
      setSaldoInicial({ quantidade: 0, custo_medio: 0, valor_total: 0 })
    }
  }, [produtoId, empresaAtiva, carregarKardex])

  // Cálculo do Saldo Final do período
  const saldoFinal = useMemo(() => {
    if (movimentos.length === 0) {
      return saldoInicial
    }
    // Pega o último movimento não-estornado do período
    // ou o saldo_posterior do último registro
    const ultimo = movimentos[movimentos.length - 1]
    const qtd = ultimo.saldo_posterior ?? 0
    const custo = ultimo.custo_medio_posterior ?? ultimo.custo_unitario ?? 0
    const valor = Math.round(qtd * custo * 100) / 100
    return {
      quantidade: qtd,
      custo_medio: custo,
      valor_total: valor,
    }
  }, [movimentos, saldoInicial])

  // Totais de entradas e saídas no período
  const totaisPeriodo = useMemo(() => {
    let entradasQtd = 0
    let saidasQtd = 0
    let entradasValor = 0
    let saidasValor = 0

    movimentos.forEach((m) => {
      // Movimentos estornados não somam no fluxo
      if (m.estornado) return

      const q = m.quantidade || 0
      const v = m.valor_total || 0
      if (m.tipo === 'Entrada') {
        entradasQtd += q
        entradasValor += v
      } else {
        saidasQtd += q
        saidasValor += v
      }
    })

    return {
      entradasQtd,
      saidasQtd,
      entradasValor,
      saidasValor,
    }
  }, [movimentos])

  // Abertura do modal de estorno
  const abrirModalEstorno = (mov: EstoqueMovimento) => {
    setMovimentoParaEstornar(mov)
    setMotivoEstorno('')
    setModalEstornoAberto(true)
  }

  // Executar estorno
  const confirmarEstorno = async () => {
    if (!movimentoParaEstornar) return
    if (!motivoEstorno.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe uma justificativa detalhada para o estorno.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoEstorno(true)
    try {
      const res = await estornarMovimento(movimentoParaEstornar.id, motivoEstorno)
      if (res.sucesso) {
        toast({
          title: 'Movimento estornado com sucesso!',
          description: 'O saldo e o custo médio foram recalculados.',
        })
        setModalEstornoAberto(false)
        setMovimentoParaEstornar(null)
        carregarKardex()
      } else {
        toast({
          title: 'Não foi possível estornar',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha no estorno',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoEstorno(false)
    }
  }

  // Exportar CSV
  const exportarCSV = () => {
    if (!produto || movimentos.length === 0) return

    const colunas = [
      'Data/Hora',
      'Tipo',
      'Origem',
      'Lote',
      'Documento',
      'Número',
      'Entrada (Qtd)',
      'Saída (Qtd)',
      'Saldo Resultante',
      'Custo Unitário (R$)',
      'Custo Médio (R$)',
      'Valor Total (R$)',
      'Usuário',
      'Motivo / Obs',
      'Estornado',
    ]

    const linhas = movimentos.map((m) => {
      const dataFormatada = new Date(m.data_movimento).toLocaleString('pt-BR')
      const numLote = m.expand?.lote_id?.numero_lote || ''
      const entrada = m.tipo === 'Entrada' ? m.quantidade.toFixed(4).replace('.', ',') : ''
      const saida = m.tipo === 'Saída' ? m.quantidade.toFixed(4).replace('.', ',') : ''
      const saldo = (m.saldo_posterior || 0).toFixed(4).replace('.', ',')
      const custoUnit = (m.custo_unitario || 0).toFixed(4).replace('.', ',')
      const custoMed = (m.custo_medio_posterior || 0).toFixed(4).replace('.', ',')
      const valorTot = (m.valor_total || 0).toFixed(2).replace('.', ',')
      const usuario = m.usuario_id || 'Sistema'
      const obs = `${m.motivo ? m.motivo + ' ' : ''}${m.observacao || ''}`.trim()

      return [
        `"${dataFormatada}"`,
        `"${m.tipo}"`,
        `"${m.origem}"`,
        `"${numLote}"`,
        `"${m.documento_tipo || ''}"`,
        `"${m.documento_numero || ''}"`,
        entrada,
        saida,
        saldo,
        custoUnit,
        custoMed,
        valorTot,
        `"${usuario}"`,
        `"${obs.replace(/"/g, '""')}"`,
        m.estornado ? 'SIM' : 'NÃO',
      ]
    })

    // Linha de Saldo Inicial no topo
    const linhaInicial = [
      `"Saldo Inicial (${dataInicio})"`,
      '""',
      '"SALDO_ANTERIOR"',
      '""',
      '""',
      '""',
      '""',
      '""',
      saldoInicial.quantidade.toFixed(4).replace('.', ','),
      saldoInicial.custo_medio.toFixed(4).replace('.', ','),
      saldoInicial.custo_medio.toFixed(4).replace('.', ','),
      saldoInicial.valor_total.toFixed(2).replace('.', ','),
      '""',
      '""',
      'NÃO',
    ]

    const csvContent =
      '\uFEFF' +
      [colunas.join(';'), linhaInicial.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `kardex_produto_${produto.codigo}_${dataInicio}_a_${dataFim}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Imprimir Ficha do Produto
  const imprimirKardex = () => {
    window.print()
  }

  const formatarQtd = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  }

  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarDataHora = (dataStr: string) => {
    try {
      const d = new Date(dataStr)
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dataStr
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto print:p-0 print:space-y-3">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Kardex de Estoque</h1>
            <Badge variant="outline" className="text-xs border-slate-300">
              Ficha Físico-Financeira
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Rastreabilidade cronológica imutável de entradas, saídas, saldos e custo médio ponderado
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarKardex}
            disabled={carregando || !produtoId}
            className="h-9 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={!produto || movimentos.length === 0}
            className="h-9 text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Exportar CSV
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={imprimirKardex}
            disabled={!produto}
            className="h-9 text-xs"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Imprimir
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/estoque/lancamentos')}
            className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Cabeçalho exclusivo para impressão */}
      <div className="hidden print:block border-b border-slate-400 pb-3 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-900">FICHA DE KARDEX DO PRODUTO</h1>
            <p className="text-xs text-slate-600">
              Empresa: {empresaAtiva?.razao_social} ({empresaAtiva?.cnpj})
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            Período: {new Date(dataInicio).toLocaleDateString('pt-BR')} até{' '}
            {new Date(dataFim).toLocaleDateString('pt-BR')}
            <br />
            Emissão: {new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      {/* Barra de Seleção de Produto e Período */}
      <Card className="border-slate-200 bg-white print:border-none print:shadow-none">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Selecione o Produto *
              </Label>
              <SelectProduto
                value={produtoId}
                onChange={(id, p) => {
                  setProdutoId(id)
                  setProduto(p || null)
                }}
                placeholder="Busque por código, GTIN ou descrição do produto..."
              />
            </div>

            <div className="md:col-span-3">
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Data Inicial *
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="pl-8 h-10 text-xs"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Data Final *
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="pl-8 h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Dados do produto selecionado */}
          {produto && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-2.5 rounded-md">
              <div className="flex items-center gap-3">
                <div className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-xs">
                  #{produto.codigo}
                </div>
                <div className="font-semibold text-slate-900">{produto.descricao}</div>
                {produto.expand?.unidade_id && (
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    {produto.expand.unidade_id.sigla}
                  </Badge>
                )}
                {produto.gtin && (
                  <span className="font-mono text-slate-500 text-[11px]">GTIN: {produto.gtin}</span>
                )}
              </div>

              <div className="flex items-center gap-4 text-[11px] text-slate-600">
                <span>
                  Estoque Mínimo:{' '}
                  <strong>
                    {produto.estoque_minimo !== undefined && produto.estoque_minimo !== null
                      ? Number(produto.estoque_minimo).toLocaleString('pt-BR')
                      : '—'}
                  </strong>
                </span>
                <span>
                  Estoque Máximo:{' '}
                  <strong>
                    {produto.estoque_maximo !== undefined && produto.estoque_maximo !== null
                      ? Number(produto.estoque_maximo).toLocaleString('pt-BR')
                      : '—'}
                  </strong>
                </span>
                <span>
                  Preço de Venda:{' '}
                  <strong className="text-emerald-700">{formatarMoeda(produto.preco_venda)}</strong>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cards de Saldo Inicial, Fluxo e Saldo Final */}
      {produto && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* 1. Saldo Inicial */}
          <Card className="bg-slate-50/80 border-slate-200">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Saldo Inicial</span>
                <span className="text-[10px] font-normal text-slate-400">até {dataInicio}</span>
              </div>
              <div className="text-base font-bold text-slate-900 mt-1 font-mono">
                {formatarQtd(saldoInicial.quantidade)} {produto.expand?.unidade_id?.sigla || ''}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                <span>Custo: {formatarMoeda(saldoInicial.custo_medio)}</span>
                <span className="font-semibold text-slate-700">
                  {formatarMoeda(saldoInicial.valor_total)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 2. Total Entradas no Período */}
          <Card className="bg-emerald-50/50 border-emerald-200">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                Entradas no Período
              </div>
              <div className="text-base font-bold text-emerald-700 mt-1 font-mono">
                + {formatarQtd(totaisPeriodo.entradasQtd)} {produto.expand?.unidade_id?.sigla || ''}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">
                Valor Total: <strong>{formatarMoeda(totaisPeriodo.entradasValor)}</strong>
              </div>
            </CardContent>
          </Card>

          {/* 3. Total Saídas no Período */}
          <Card className="bg-rose-50/50 border-rose-200">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
                Saídas no Período
              </div>
              <div className="text-base font-bold text-rose-700 mt-1 font-mono">
                - {formatarQtd(totaisPeriodo.saidasQtd)} {produto.expand?.unidade_id?.sigla || ''}
              </div>
              <div className="text-[11px] text-rose-600 mt-0.5">
                Valor Total: <strong>{formatarMoeda(totaisPeriodo.saidasValor)}</strong>
              </div>
            </CardContent>
          </Card>

          {/* 4. Saldo Final */}
          <Card className="bg-blue-50/60 border-blue-200">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider flex items-center justify-between">
                <span>Saldo Final</span>
                <span className="text-[10px] font-normal text-blue-600">em {dataFim}</span>
              </div>
              <div className="text-base font-bold text-blue-900 mt-1 font-mono">
                {formatarQtd(saldoFinal.quantidade)} {produto.expand?.unidade_id?.sigla || ''}
              </div>
              <div className="text-[11px] text-blue-700 mt-0.5 flex justify-between">
                <span>Custo Médio: {formatarMoeda(saldoFinal.custo_medio)}</span>
                <span className="font-bold">{formatarMoeda(saldoFinal.valor_total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grade do Kardex */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200 select-none">
              <tr>
                <th className="p-2.5">Data / Hora</th>
                <th className="p-2.5">Origem / Operação</th>
                <th className="p-2.5">Lote</th>
                <th className="p-2.5">Documento</th>
                <th className="p-2.5 text-right text-emerald-700">Entrada</th>
                <th className="p-2.5 text-right text-rose-700">Saída</th>
                <th className="p-2.5 text-right font-bold text-slate-800">Saldo Físico</th>
                <th className="p-2.5 text-right">Custo Unitário</th>
                <th className="p-2.5 text-right">Custo Médio</th>
                <th className="p-2.5 text-right">Valor Total</th>
                <th className="p-2.5">Operador / Motivo</th>
                <th className="p-2.5 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!produtoId ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Selecione um produto</p>
                    <p className="text-[11px] mt-0.5">
                      Use a busca acima para carregar o histórico físico-financeiro.
                    </p>
                  </td>
                </tr>
              ) : carregando ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Calculando saldo retroativo e carregando movimentos...</span>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Linha de Saldo Inicial */}
                  <tr className="bg-slate-50/80 font-medium">
                    <td className="p-2.5 font-mono text-slate-500">
                      {new Date(`${dataInicio}T00:00:00`).toLocaleDateString('pt-BR')} 00:00
                    </td>
                    <td className="p-2.5">
                      <Badge variant="outline" className="bg-slate-200 text-slate-700 text-[10px]">
                        SALDO ANTERIOR
                      </Badge>
                    </td>
                    <td className="p-2.5 text-slate-400 font-mono text-[11px]">—</td>
                    <td className="p-2.5 text-slate-400">—</td>
                    <td className="p-2.5 text-right text-slate-400">—</td>
                    <td className="p-2.5 text-right text-slate-400">—</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                      {formatarQtd(saldoInicial.quantidade)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-500">
                      {formatarMoeda(saldoInicial.custo_medio)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold text-slate-700">
                      {formatarMoeda(saldoInicial.custo_medio)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                      {formatarMoeda(saldoInicial.valor_total)}
                    </td>
                    <td className="p-2.5 text-slate-500 text-[11px]">
                      Posição inicial no início do período
                    </td>
                    <td className="p-2.5 text-center text-slate-300 print:hidden">—</td>
                  </tr>

                  {/* Movimentações do Período */}
                  {movimentos.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400">
                        Nenhuma movimentação registrada no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    movimentos.map((mov) => {
                      const isEstornado = mov.estornado === true
                      const isEntrada = mov.tipo === 'Entrada'
                      const isAjuste =
                        mov.origem.startsWith('AJUSTE_') ||
                        mov.origem === 'SALDO_INICIAL' ||
                        mov.origem === 'PERDA' ||
                        mov.origem === 'CONSUMO_INTERNO' ||
                        mov.origem.startsWith('BONIFICACAO_')

                      return (
                        <tr
                          key={mov.id}
                          className={`hover:bg-blue-50/30 transition-colors ${
                            isEstornado
                              ? 'line-through opacity-50 bg-slate-50/50 text-slate-400'
                              : ''
                          }`}
                        >
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {formatarDataHora(mov.data_movimento)}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className={`text-[10px] ${
                                  mov.origem === 'ESTORNO'
                                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                                    : isEntrada
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}
                              >
                                {mov.origem}
                              </Badge>
                              {isEstornado && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] text-rose-600 border-rose-300"
                                >
                                  Estornado
                                </Badge>
                              )}
                            </div>
                          </td>
                          {/* Coluna Lote */}
                          <td className="p-2.5 font-mono text-[11px]">
                            {mov.expand?.lote_id?.numero_lote ? (
                              <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                {mov.expand.lote_id.numero_lote}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {mov.documento_tipo ? (
                              <span>
                                {mov.documento_tipo}
                                {mov.documento_numero ? ` nº ${mov.documento_numero}` : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          {/* Entrada */}
                          <td className="p-2.5 text-right font-mono font-semibold text-emerald-700">
                            {isEntrada ? formatarQtd(mov.quantidade) : '—'}
                          </td>
                          {/* Saída */}
                          <td className="p-2.5 text-right font-mono font-semibold text-rose-700">
                            {!isEntrada ? formatarQtd(mov.quantidade) : '—'}
                          </td>
                          {/* Saldo Posterior */}
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            {formatarQtd(mov.saldo_posterior)}
                          </td>
                          {/* Custo Unitário */}
                          <td className="p-2.5 text-right font-mono text-slate-600">
                            {formatarMoeda(mov.custo_unitario)}
                          </td>
                          {/* Custo Médio Posterior */}
                          <td className="p-2.5 text-right font-mono font-semibold text-slate-800">
                            {formatarMoeda(mov.custo_medio_posterior)}
                          </td>
                          {/* Valor Total do Movimento */}
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            {formatarMoeda(mov.valor_total)}
                          </td>
                          {/* Usuário / Motivo */}
                          <td className="p-2.5 max-w-[200px]">
                            {mov.motivo && (
                              <div
                                className="font-medium text-slate-800 truncate"
                                title={mov.motivo}
                              >
                                {mov.motivo}
                              </div>
                            )}
                            {mov.observacao && (
                              <div
                                className="text-[10px] text-slate-400 truncate"
                                title={mov.observacao}
                              >
                                {mov.observacao}
                              </div>
                            )}
                            {mov.movimento_estorno_id && (
                              <div className="text-[10px] text-purple-600 font-mono">
                                Estorno: #{mov.movimento_estorno_id.slice(-6)}
                              </div>
                            )}
                          </td>
                          {/* Ações: Estornar */}
                          <td className="p-2.5 text-center print:hidden">
                            {!isEstornado &&
                              mov.origem !== 'ESTORNO' &&
                              isAjuste &&
                              podeExcluir && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => abrirModalEstorno(mov)}
                                  className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                  title="Estornar lançamento de estoque"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Estornar
                                </Button>
                              )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </>
              )}
            </tbody>
            {/* Linha final consolidada */}
            {produto && (
              <tfoot className="bg-slate-100 font-bold border-t border-slate-300 text-xs">
                <tr>
                  <td colSpan={4} className="p-3 text-slate-800">
                    Posição Final Consolidada:
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-800">
                    + {formatarQtd(totaisPeriodo.entradasQtd)}
                  </td>
                  <td className="p-3 text-right font-mono text-rose-800">
                    - {formatarQtd(totaisPeriodo.saidasQtd)}
                  </td>
                  <td className="p-3 text-right font-mono text-blue-900 text-sm">
                    {formatarQtd(saldoFinal.quantidade)}
                  </td>
                  <td className="p-3 text-right text-slate-400 font-normal text-[11px]">—</td>
                  <td className="p-3 text-right font-mono text-slate-800">
                    {formatarMoeda(saldoFinal.custo_medio)}
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                    {formatarMoeda(saldoFinal.valor_total)}
                  </td>
                  <td colSpan={2} className="p-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal de Confirmação de Estorno */}
      <Dialog open={modalEstornoAberto} onOpenChange={setModalEstornoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <DialogTitle className="text-base font-bold text-slate-900">
                Confirmar Estorno de Movimento
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600">
              Esta ação criará uma contrapartida de estorno invertendo o movimento, recalculando o
              saldo e mantendo histórico fiscal no Kardex.
            </DialogDescription>
          </DialogHeader>

          {movimentoParaEstornar && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                <div>
                  <strong>Operação:</strong> {movimentoParaEstornar.origem} (
                  {movimentoParaEstornar.tipo})
                </div>
                <div>
                  <strong>Quantidade:</strong>{' '}
                  <span className="font-mono font-bold">
                    {formatarQtd(movimentoParaEstornar.quantidade)}
                  </span>
                </div>
                <div>
                  <strong>Data:</strong> {formatarDataHora(movimentoParaEstornar.data_movimento)}
                </div>
                {movimentoParaEstornar.motivo && (
                  <div>
                    <strong>Motivo original:</strong> {movimentoParaEstornar.motivo}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 mb-1 block">
                  Motivo do Estorno *
                </Label>
                <Textarea
                  value={motivoEstorno}
                  onChange={(e) => setMotivoEstorno(e.target.value)}
                  placeholder="Descreva a razão do estorno (ex: Digitação incorreta da quantidade)..."
                  className="text-xs min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalEstornoAberto(false)}
              disabled={salvandoEstorno}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmarEstorno}
              disabled={salvandoEstorno || !motivoEstorno.trim()}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {salvandoEstorno ? 'Estornando...' : 'Confirmar Estorno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default KardexPage
