import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  apurarFluxoCaixa,
  FiltrosFluxoCaixa,
  ResumoFluxoCaixa,
  PeriodoFluxoCaixa,
  ItemComposicaoFluxo,
  AgrupamentoFluxo,
} from '@/services/fluxoCaixa'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartConfig,
} from '@/components/ui/chart'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Filter,
} from 'lucide-react'

const chartConfig: ChartConfig = {
  entradas: {
    label: 'Total Entradas',
    color: '#10b981', // emerald-500
  },
  saidas: {
    label: 'Total Saídas',
    color: '#f43f5e', // rose-500
  },
  saldoFinal: {
    label: 'Saldo Projetado',
    color: '#2563eb', // blue-600
  },
}

export const FluxoCaixaPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()

  // Datas padrão: Hoje até 90 dias à frente
  const hoje = new Date()
  const hojeIso = hoje.toISOString().slice(0, 10)
  const d90 = new Date(hoje)
  d90.setDate(d90.getDate() + 90)
  const d90Iso = d90.toISOString().slice(0, 10)

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    atalho_periodo: 'personalizado',
    periodo: {
      dataInicio: hojeIso,
      dataFim: d90Iso,
    },
    tipo_data: 'vencimento',
    contas_financeiras_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(
    () => ['financeiro_contas_financeiras', 'datas_tipo_data'],
    [],
  )

  const [agrupamento, setAgrupamento] = useState<AgrupamentoFluxo>('dia')
  const [incluirVencidos, setIncluirVencidos] = useState<boolean>(true)
  const [contasDisponiveis, setContasDisponiveis] = useState<ContaFinanceira[]>([])

  const dataInicio = filtros.periodo?.dataInicio || hojeIso
  const dataFim = filtros.periodo?.dataFim || d90Iso
  const empresaIdEfetiva = filtros.empresas_ids?.[0] || empresaAtiva?.id || ''
  const contasSelecionadasIds = filtros.contas_financeiras_ids || []

  const [resumo, setResumo] = useState<ResumoFluxoCaixa | null>(null)
  const [carregando, setCarregando] = useState<boolean>(false)

  // Modal de Detalhamento/Composição
  const [modalPeriodoAberto, setModalPeriodoAberto] = useState<boolean>(false)
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoFluxoCaixa | null>(null)
  const [filtroTipoModal, setFiltroTipoModal] = useState<string>('todos')

  // Carregar contas financeiras da empresa
  useEffect(() => {
    if (empresaIdEfetiva) {
      listarContasFinanceiras({ empresa_id: empresaIdEfetiva, situacao: 'ativos' }).then((res) => {
        setContasDisponiveis(res)
      })
    }
  }, [empresaIdEfetiva])

  // Buscar apuração do fluxo
  const carregarFluxo = useCallback(async () => {
    if (!empresaIdEfetiva) return
    try {
      setCarregando(true)
      const res = await apurarFluxoCaixa({
        empresaId: empresaIdEfetiva,
        dataInicio,
        dataFim,
        agrupamento,
        incluirVencidos,
        contasIds:
          contasSelecionadasIds.length === 0 ||
          contasSelecionadasIds.length === contasDisponiveis.length
            ? []
            : contasSelecionadasIds,
      })
      setResumo(res)
    } catch (err: any) {
      toast({
        title: 'Erro ao apurar fluxo de caixa',
        description: err?.message || 'Falha ao processar movimentações e previsões.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaIdEfetiva,
    dataInicio,
    dataFim,
    agrupamento,
    incluirVencidos,
    contasSelecionadasIds,
    contasDisponiveis.length,
  ])

  useEffect(() => {
    if (empresaAtiva?.id && contasDisponiveis.length > 0) {
      carregarFluxo()
    }
  }, [carregarFluxo, contasDisponiveis.length, empresaIdEfetiva])

  // Toggle conta no filtro
  const handleToggleConta = (contaId: string) => {
    setFiltros((prev) => {
      const atuais = prev.contas_financeiras_ids || []
      const novos = atuais.includes(contaId)
        ? atuais.filter((id) => id !== contaId)
        : [...atuais, contaId]
      return { ...prev, contas_financeiras_ids: novos }
    })
  }

  const handleSelectTodasContas = (todas: boolean) => {
    setFiltros((prev) => ({
      ...prev,
      contas_financeiras_ids: todas ? contasDisponiveis.map((c) => c.id) : [],
    }))
  }

  // Dados para o Gráfico Recharts
  const chartData = useMemo(() => {
    if (!resumo) return []
    return resumo.periodos.map((p) => ({
      rotulo: p.rotulo,
      entradas: p.totalEntradas,
      saidas: p.totalSaidas,
      saldoFinal: p.saldoFinalProjetado,
      ehNegativo: p.saldoFinalProjetado < 0,
    }))
  }, [resumo])

  // Exportar CSV
  const exportarCSV = () => {
    if (!resumo || resumo.periodos.length === 0) {
      toast({ title: 'Sem dados para exportar' })
      return
    }

    const cabecalho =
      'Periodo;Data_Inicio;Data_Fim;Saldo_Inicial;Entradas_Realizadas;Receber_Previsto;Total_Entradas;Saidas_Realizadas;Pagar_Previsto;Total_Saidas;Saldo_Liquido;Saldo_Final_Projetado\n'

    const linhas = resumo.periodos
      .map(
        (p) =>
          `"${p.rotulo}";${p.dataInicioPeriodo};${p.dataFimPeriodo};${p.saldoInicial.toFixed(
            2,
          )};${p.entradasRealizadas.toFixed(2)};${p.aReceberPrevisto.toFixed(
            2,
          )};${p.totalEntradas.toFixed(2)};${p.saidasRealizadas.toFixed(
            2,
          )};${p.aPagarPrevisto.toFixed(2)};${p.totalSaidas.toFixed(2)};${p.saldoLiquido.toFixed(
            2,
          )};${p.saldoFinalProjetado.toFixed(2)}`,
      )
      .join('\n')

    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `fluxo_de_caixa_${dataInicio}_a_${dataFim}_${agrupamento}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const itensModalFiltrados = useMemo(() => {
    if (!periodoSelecionado) return []
    if (filtroTipoModal === 'todos') return periodoSelecionado.itens
    return periodoSelecionado.itens.filter((item) => {
      if (filtroTipoModal === 'entradas') {
        return item.tipo === 'Entrada Realizada' || item.tipo === 'Receber Previsto'
      }
      if (filtroTipoModal === 'saidas') {
        return item.tipo === 'Saída Realizada' || item.tipo === 'Pagar Previsto'
      }
      if (filtroTipoModal === 'realizados') {
        return item.tipo === 'Entrada Realizada' || item.tipo === 'Saída Realizada'
      }
      if (filtroTipoModal === 'previstos') {
        return item.tipo === 'Receber Previsto' || item.tipo === 'Pagar Previsto'
      }
      return true
    })
  }, [periodoSelecionado, filtroTipoModal])

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="financeiro_fluxo_caixa"
        tituloRelatorio="Fluxo de Caixa"
        subtituloRelatorio="Acompanhe o saldo realizado e projete o saldo futuro com base nos títulos em aberto."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarFluxo}
        onExportarCsv={exportarCSV}
        carregando={carregando}
        filtrosExtras={
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1 min-w-[140px]">
              <label className="text-[11px] font-semibold text-slate-600 block">Agrupamento</label>
              <Select
                value={agrupamento}
                onValueChange={(val: AgrupamentoFluxo) => setAgrupamento(val)}
              >
                <SelectTrigger className="text-xs h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Por Dia</SelectItem>
                  <SelectItem value="semana">Por Semana</SelectItem>
                  <SelectItem value="mes">Por Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 select-none">
                <Checkbox
                  checked={incluirVencidos}
                  onCheckedChange={(c) => setIncluirVencidos(Boolean(c))}
                />
                <span className="font-medium">Incluir títulos vencidos em aberto</span>
              </label>
            </div>
          </div>
        }
      />

      {/* Cartões de Indicadores Gerais */}
      {resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="border-slate-200 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase">
                Saldo Inicial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div
                className={`text-lg sm:text-xl font-bold font-mono ${
                  resumo.saldoInicialGeral >= 0 ? 'text-slate-900' : 'text-rose-600'
                }`}
              >
                R$ {resumo.saldoInicialGeral.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-400">Em {dataInicio}</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 bg-emerald-50/20 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-emerald-700 uppercase flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                Entradas Previstas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700">
                + R$ {resumo.totalAReceberPrevisto.toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-600/70">
                Realizadas: R$ {resumo.totalEntradasRealizadas.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/20 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-rose-700 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                Saídas Previstas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl font-bold font-mono text-rose-700">
                - R$ {resumo.totalAPagarPrevisto.toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-600/70">
                Realizadas: R$ {resumo.totalSaidasRealizadas.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card
            className={`border shadow-2xs ${
              resumo.saldoFinalGeral >= 0
                ? 'border-blue-200 bg-blue-50/30'
                : 'border-rose-300 bg-rose-50/40'
            }`}
          >
            <CardHeader className="p-3 pb-1">
              <CardTitle
                className={`text-xs font-medium uppercase ${
                  resumo.saldoFinalGeral >= 0 ? 'text-blue-800' : 'text-rose-800'
                }`}
              >
                Saldo Final Projetado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div
                className={`text-lg sm:text-xl font-bold font-mono ${
                  resumo.saldoFinalGeral >= 0 ? 'text-blue-900' : 'text-rose-700'
                }`}
              >
                R$ {resumo.saldoFinalGeral.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-500">Ao final de {dataFim}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-2xs col-span-2 lg:col-span-1">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-600 uppercase">
                Períodos Críticos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {(() => {
                const negativos = resumo.periodos.filter((p) => p.saldoFinalProjetado < 0)
                if (negativos.length === 0) {
                  return (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium pt-1">
                      <span>Nenhum período com saldo negativo previsto.</span>
                    </div>
                  )
                }
                return (
                  <div className="flex items-center gap-1.5 text-xs text-rose-700 font-semibold pt-1">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{negativos.length} período(s) com saldo projetado no vermelho!</span>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico do Fluxo de Caixa (Barras de Entradas/Saídas + Linha de Saldo Projetado) */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-sm font-semibold text-slate-900 flex items-center justify-between">
            <span>Evolução do Fluxo de Caixa Projetado</span>
            <span className="text-xs font-normal text-slate-500">
              Barras: Entradas (Verde) / Saídas (Vermelho) • Linha: Saldo Projetado
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-6">
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">
              Nenhum período a exibir no gráfico.
            </div>
          ) : (
            <div className="h-80 w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="rotulo"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      className="text-[10px]"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                      className="text-[10px]"
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <div className="flex items-center justify-between gap-4 font-mono text-xs">
                              <span className="capitalize">{name}:</span>
                              <span className="font-bold">
                                R${' '}
                                {Number(value || 0).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="entradas"
                      name="Total Entradas"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      dataKey="saidas"
                      name="Total Saídas"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Line
                      type="monotone"
                      dataKey="saldoFinal"
                      name="Saldo Projetado"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#2563eb' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela Detalhada com os Períodos */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/50">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              Detalhamento dos Períodos
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Clique em qualquer período ou valor para visualizar os títulos e movimentações que o
              compõem.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-normal text-slate-600 bg-white">
            {resumo?.periodos.length || 0} períodos apurados
          </Badge>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="text-xs">
                <TableHead className="w-[120px]">Período</TableHead>
                <TableHead className="text-right w-[110px]">Saldo Inicial</TableHead>
                <TableHead className="text-right w-[120px] text-emerald-700">
                  Entr. Realizadas
                </TableHead>
                <TableHead className="text-right w-[120px] text-emerald-600">
                  A Receber Prev.
                </TableHead>
                <TableHead className="text-right w-[120px] font-semibold text-emerald-800">
                  Total Entradas
                </TableHead>
                <TableHead className="text-right w-[120px] text-rose-700">Saídas Realiz.</TableHead>
                <TableHead className="text-right w-[120px] text-rose-600">A Pagar Prev.</TableHead>
                <TableHead className="text-right w-[120px] font-semibold text-rose-800">
                  Total Saídas
                </TableHead>
                <TableHead className="text-right w-[110px]">Líquido</TableHead>
                <TableHead className="text-right w-[130px] font-bold">Saldo Projetado</TableHead>
                <TableHead className="w-[80px] text-center">Itens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-xs text-slate-500">
                    Apurando fluxo de caixa...
                  </TableCell>
                </TableRow>
              ) : !resumo || resumo.periodos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-xs text-slate-500">
                    Nenhum período encontrado para os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                resumo.periodos.map((p) => {
                  const noVermelho = p.saldoFinalProjetado < 0
                  return (
                    <TableRow
                      key={p.chave}
                      onClick={() => {
                        setPeriodoSelecionado(p)
                        setFiltroTipoModal('todos')
                        setModalPeriodoAberto(true)
                      }}
                      className={`text-xs cursor-pointer transition-colors ${
                        noVermelho
                          ? 'bg-rose-50/60 hover:bg-rose-100/60'
                          : p.ehAtual
                            ? 'bg-blue-50/50 hover:bg-blue-100/50 font-medium'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      <TableCell className="font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{p.rotulo}</span>
                          {p.ehAtual && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 h-4 bg-blue-100 text-blue-800 border-none"
                            >
                              Hoje
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono text-slate-600">
                        R$ {p.saldoInicial.toFixed(2)}
                      </TableCell>

                      <TableCell className="text-right font-mono text-emerald-700">
                        {p.entradasRealizadas > 0 ? `+ R$ ${p.entradasRealizadas.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-emerald-600">
                        {p.aReceberPrevisto > 0 ? `+ R$ ${p.aReceberPrevisto.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono font-semibold text-emerald-800">
                        {p.totalEntradas > 0 ? `+ R$ ${p.totalEntradas.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-rose-700">
                        {p.saidasRealizadas > 0 ? `- R$ ${p.saidasRealizadas.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-rose-600">
                        {p.aPagarPrevisto > 0 ? `- R$ ${p.aPagarPrevisto.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono font-semibold text-rose-800">
                        {p.totalSaidas > 0 ? `- R$ ${p.totalSaidas.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell
                        className={`text-right font-mono font-medium ${
                          p.saldoLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {p.saldoLiquido >= 0 ? '+' : ''} R$ {p.saldoLiquido.toFixed(2)}
                      </TableCell>

                      <TableCell
                        className={`text-right font-mono font-bold ${
                          noVermelho ? 'text-rose-700 font-black' : 'text-slate-900'
                        }`}
                      >
                        R$ {p.saldoFinalProjetado.toFixed(2)}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-800"
                        >
                          {p.itens.length} itens
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal de Drill-Down: Detalhamento do Período */}
      <Dialog open={modalPeriodoAberto} onOpenChange={setModalPeriodoAberto}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between text-slate-900">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                Composição do Período: {periodoSelecionado?.rotulo}
              </span>
              {periodoSelecionado && (
                <span
                  className={`font-mono text-sm px-2 py-0.5 rounded ${
                    periodoSelecionado.saldoFinalProjetado >= 0
                      ? 'bg-blue-50 text-blue-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  Saldo Projetado: R$ {periodoSelecionado.saldoFinalProjetado.toFixed(2)}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {periodoSelecionado?.dataInicioPeriodo} a {periodoSelecionado?.dataFimPeriodo} •{' '}
              {periodoSelecionado?.itens.length || 0} lançamentos e títulos encontrados
            </DialogDescription>
          </DialogHeader>

          {/* Filtro rápido por tipo no modal */}
          <div className="flex items-center gap-1.5 pt-2 border-b pb-2">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Filtrar:</span>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'entradas', label: 'Entradas / Receber' },
              { id: 'saidas', label: 'Saídas / Pagar' },
              { id: 'realizados', label: 'Só Realizados' },
              { id: 'previstos', label: 'Só Previstos' },
            ].map((f) => (
              <Button
                key={f.id}
                variant={filtroTipoModal === f.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFiltroTipoModal(f.id)}
                className={`text-[11px] h-7 px-2 ${
                  filtroTipoModal === f.id ? 'bg-blue-600 text-white' : ''
                }`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pt-2">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="text-xs">
                  <TableHead className="w-[90px]">Data</TableHead>
                  <TableHead className="w-[140px]">Tipo</TableHead>
                  <TableHead>Descrição / Histórico</TableHead>
                  <TableHead className="w-[160px]">Entidade</TableHead>
                  <TableHead className="text-right w-[110px]">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensModalFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500">
                      Nenhum item encontrado para o filtro selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  itensModalFiltrados.map((item, idx) => {
                    const ehPositivo =
                      item.tipo === 'Entrada Realizada' || item.tipo === 'Receber Previsto'
                    return (
                      <TableRow key={`${item.id}-${idx}`} className="text-xs hover:bg-slate-50">
                        <TableCell className="font-mono whitespace-nowrap text-slate-600">
                          {item.data}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              item.tipo === 'Entrada Realizada'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : item.tipo === 'Receber Previsto'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : item.tipo === 'Saída Realizada'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {item.tipo}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div className="font-medium text-slate-900">{item.descricao}</div>
                          {item.documentoNumero && (
                            <div className="text-[10px] text-slate-400">
                              Doc: {item.documentoNumero}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-slate-600 truncate max-w-[150px]">
                          {item.entidadeNome}
                        </TableCell>

                        <TableCell
                          className={`text-right font-mono font-bold whitespace-nowrap ${
                            ehPositivo ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {ehPositivo ? '+' : '-'} R$ {item.valor.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default FluxoCaixaPage
