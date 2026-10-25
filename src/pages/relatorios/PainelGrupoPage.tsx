import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  Package,
  AlertTriangle,
  Building,
  RefreshCw,
  ShoppingBag,
  Clock,
  Layers,
  ChevronRight,
  BarChart2,
  Calendar,
  Globe2,
  CheckCircle2,
  XCircle,
  FileText,
  Percent,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  obterDadosPainelGrupo,
  RespostaPainelGrupo,
  IndicadoresPainelEmpresa,
  StatusSped,
} from '@/services/relatorioPainelGrupo'
import { toast } from '@/hooks/use-toast'

// Paleta de cores estável para as empresas nos gráficos
const PALETA_EMPRESAS = [
  '#2563eb', // Azul
  '#059669', // Verde Esmeralda
  '#d97706', // Âmbar
  '#7c3aed', // Roxo
  '#db2777', // Rosa
  '#0891b2', // Ciano
  '#ea580c', // Laranja
  '#4f46e5', // Índigo
]

export const PainelGrupoPage: React.FC = () => {
  const { pode, administrador } = usePermissoes()
  const { empresas, carregando: carregandoEmpresas } = useEmpresaAtiva()

  const podeVerProdutos = pode('produtos', 'ver') || administrador
  const temMultiplasEmpresas = empresas.length > 1

  // Mês de referência (AAAA-MM), padrão mês atual
  const [mesReferencia, setMesReferencia] = useState(() => {
    const hoje = new Date()
    const a = hoje.getFullYear()
    const m = String(hoje.getMonth() + 1).padStart(2, '0')
    return `${a}-${m}`
  })

  const [carregando, setCarregando] = useState(true)
  const [dados, setDados] = useState<RespostaPainelGrupo | null>(null)

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const res = await obterDadosPainelGrupo(mesReferencia)
      setDados(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados do painel do grupo'
      console.error('Erro ao buscar dados do painel do grupo:', err)
      toast({
        title: 'Erro ao carregar painel',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [mesReferencia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Formatação de valores monetários
  const formatarMoeda = (valor: number | undefined | null) => {
    const num = Number(valor) || 0
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarQtd = (valor: number | undefined | null) => {
    const num = Number(valor) || 0
    return num.toLocaleString('pt-BR')
  }

  const formatarPct = (valor: number | undefined | null) => {
    const num = Number(valor) || 0
    return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`
  }

  // Componente de variação percentual com seta colorida
  const IndicadorVariacao: React.FC<{
    pct: number
    label: string
  }> = ({ pct, label }) => {
    if (Math.abs(pct) < 0.01) {
      return (
        <span className="inline-flex items-center text-xs text-slate-500 font-medium">
          <Minus className="h-3 w-3 mr-0.5 text-slate-400" />
          0.0% vs. {label}
        </span>
      )
    }

    const positivo = pct > 0
    return (
      <span
        className={`inline-flex items-center text-xs font-semibold ${
          positivo ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
        } px-1.5 py-0.5 rounded`}
      >
        {positivo ? (
          <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
        )}
        {formatarPct(pct)} vs. {label}
      </span>
    )
  }

  // Badge do status do SPED
  const BadgeSped: React.FC<{ status: StatusSped }> = ({ status }) => {
    switch (status) {
      case 'entregue':
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-semibold gap-1">
            <CheckCircle2 className="h-3 w-3" /> Entregue
          </Badge>
        )
      case 'gerado':
        return (
          <Badge className="bg-blue-600 text-white hover:bg-blue-700 text-[10px] font-semibold gap-1">
            <FileText className="h-3 w-3" /> Gerado
          </Badge>
        )
      case 'gerado com erros':
        return (
          <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-[10px] font-semibold gap-1">
            <AlertTriangle className="h-3 w-3" /> Gerado c/ erros
          </Badge>
        )
      case 'não gerado':
        return (
          <Badge className="bg-rose-600 text-white hover:bg-rose-700 text-[10px] font-semibold gap-1">
            <XCircle className="h-3 w-3" /> Não gerado
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-slate-500 text-[10px]">
            Não se aplica
          </Badge>
        )
    }
  }

  // Mapa de cores para as empresas nos gráficos
  const mapaCoresEmpresas = useMemo(() => {
    const mapa: Record<string, string> = {}
    if (dados?.por_empresa) {
      dados.por_empresa.forEach((emp, idx) => {
        mapa[emp.empresa_id] = PALETA_EMPRESAS[idx % PALETA_EMPRESAS.length]
      })
    }
    return mapa
  }, [dados?.por_empresa])

  // Se o usuário tem apenas uma empresa acessível, exibe aviso e bloqueio amigável
  if (!carregandoEmpresas && !temMultiplasEmpresas) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Card className="border-amber-200 bg-amber-50/50 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-800 rounded-lg shrink-0">
              <Building className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">
                Painel do Grupo Multiempresa Indisponível
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                O <strong>Painel do Grupo</strong> é exclusivo para usuários com acesso a mais de
                uma empresa ou filial cadastrada no ERP.
              </p>
              <p className="text-xs text-slate-500">
                Atualmente seu perfil possui acesso a apenas 1 empresa. Acesse o{' '}
                <strong>Painel</strong> principal ou a Central de Relatórios para análises
                individuais.
              </p>
              <div className="pt-2">
                <Link to="/painel">
                  <Button variant="outline" size="sm">
                    Voltar ao Painel
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const totalGrupo = dados?.total_grupo

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-2xs">
              <Building className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Painel do Grupo
                </h1>
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs">
                  Multiempresa ({dados?.por_empresa?.length || empresas.length} filiais)
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Visão executiva consolidada de todas as empresas e comparativo loja a loja.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Mês de Referência e Recarregar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-600">Mês de referência:</span>
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent border-none outline-none focus:ring-0 p-0 cursor-pointer"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="h-8 gap-1 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Informativo de período apurado */}
      {dados?.metadados && (
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Período apurado:{' '}
              <strong className="text-slate-700">
                {dados.metadados.periodo_atual.inicio} até {dados.metadados.periodo_atual.fim}
              </strong>{' '}
              (parcial de {dados.metadados.periodo_atual.dia_corte} dias)
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              Mês anterior comp.: {dados.metadados.periodo_mes_anterior.inicio} até{' '}
              {dados.metadados.periodo_mes_anterior.fim}
            </span>
            <span>
              Ano anterior comp.: {dados.metadados.periodo_ano_anterior.inicio} até{' '}
              {dados.metadados.periodo_ano_anterior.fim}
            </span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. CARTÕES GRANDES CONSOLIDADOS DO GRUPO NO TOPO               */}
      {/* ============================================================== */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-indigo-600" />
          <span>Consolidado do Grupo (Todas as Lojas)</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cartão 1: Faturamento do Mês com Comparativos */}
          <Link to="/relatorios/vendas-canais" className="group">
            <Card className="h-full border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-600 uppercase">
                  Faturamento do Mês
                </CardTitle>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                  <DollarSign className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  {formatarMoeda(totalGrupo?.faturamento_mes_atual)}
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Mês anterior:</span>
                    <IndicadorVariacao
                      pct={totalGrupo?.var_percentual_mes_anterior || 0}
                      label="mês ant."
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Ano anterior:</span>
                    <IndicadorVariacao
                      pct={totalGrupo?.var_percentual_ano_anterior || 0}
                      label="ano ant."
                    />
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-indigo-600 font-medium flex items-center justify-between">
                  <span>Ver relatório vendas por loja</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Cartão 2: Margem Bruta & Ticket Médio */}
          <Link to="/relatorios/vendas-canais" className="group">
            <Card className="h-full border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-600 uppercase">
                  Margem & Vendas
                </CardTitle>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {podeVerProdutos ? (
                  <div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight flex items-baseline gap-2">
                      <span>{formatarMoeda(totalGrupo?.margem_bruta_valor)}</span>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {totalGrupo?.margem_bruta_percentual?.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Margem bruta sobre faturamento
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight">
                      {formatarQtd(totalGrupo?.quantidade_vendas)} vendas
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Custos restritos ao seu perfil
                    </p>
                  </div>
                )}

                <div className="space-y-1 pt-1 border-t border-slate-100 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[11px]">Ticket Médio:</span>
                    <strong className="text-slate-800">
                      {formatarMoeda(totalGrupo?.ticket_medio)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[11px]">Qtd. Vendas:</span>
                    <strong className="text-slate-800">
                      {formatarQtd(totalGrupo?.quantidade_vendas)} transações
                    </strong>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-indigo-600 font-medium flex items-center justify-between">
                  <span>Ver detalhe por canal</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Cartão 3: A Receber / A Pagar / Saldo */}
          <Link to="/relatorios/contas-pagar" className="group">
            <Card className="h-full border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-600 uppercase">
                  Financeiro (30 Dias)
                </CardTitle>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
                  <Clock className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div>
                  <div className="text-xs text-slate-500">Saldo das Contas:</div>
                  <div className="text-xl font-bold text-slate-900 tracking-tight">
                    {formatarMoeda(totalGrupo?.saldo_contas_financeiras)}
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">A receber 30d:</span>
                    <span className="font-semibold text-emerald-700">
                      {formatarMoeda(totalGrupo?.a_receber_proximos_30d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">A pagar 30d:</span>
                    <span className="font-semibold text-rose-700">
                      {formatarMoeda(totalGrupo?.a_pagar_proximos_30d)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-slate-100">
                    <span className="text-slate-400">Vencidos (Rec / Pag):</span>
                    <span className="font-medium text-slate-700">
                      {formatarMoeda(totalGrupo?.a_receber_vencidos)} /{' '}
                      {formatarMoeda(totalGrupo?.a_pagar_vencidos)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-indigo-600 font-medium flex items-center justify-between">
                  <span>Ver contas a pagar</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Cartão 4: Estoque Valorizado & Alertas Fiscais */}
          <Link to="/relatorios/estoque-gerencial" className="group">
            <Card className="h-full border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-slate-600 uppercase">
                  Estoque & Fiscal
                </CardTitle>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                  <Package className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div>
                  <div className="text-xs text-slate-500">Estoque Valorizado:</div>
                  <div className="text-xl font-bold text-slate-900 tracking-tight">
                    {podeVerProdutos ? formatarMoeda(totalGrupo?.estoque_valorizado) : 'Disponível'}
                  </div>
                  {podeVerProdutos && (
                    <p className="text-[11px] text-amber-700 font-medium">
                      Parado &gt;90d: {formatarMoeda(totalGrupo?.estoque_parado_mais_90d_valor)} (
                      {totalGrupo?.estoque_parado_mais_90d_qtd_itens} itens)
                    </p>
                  )}
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Notas rejeitadas:</span>
                    <span
                      className={`font-semibold ${
                        (totalGrupo?.documentos_fiscais_rejeitados || 0) > 0
                          ? 'text-rose-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {totalGrupo?.documentos_fiscais_rejeitados || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">SPED mês anterior:</span>
                    <BadgeSped status={totalGrupo?.sped_mes_anterior_status || 'não se aplica'} />
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-indigo-600 font-medium flex items-center justify-between">
                  <span>Ver estoque gerencial</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. GRÁFICOS DO GRUPO (DIÁRIO DO MÊS E 12 MESES)                 */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Barras do faturamento diário do mês por empresa */}
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-indigo-600" />
                  <span>Faturamento Diário do Mês (por Empresa)</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evolução do dia 1 até hoje/corte para cada filial
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-72 w-full">
              {dados?.graficos?.diario_mes && dados.graficos.diario_mes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados.graficos.diario_mes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="rotulo"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      formatter={(val: unknown) => [formatarMoeda(Number(val) || 0), '']}
                      labelFormatter={(label) => `Dia: ${label}`}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        fontSize: 12,
                        borderRadius: 6,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    {dados.por_empresa.map((emp) => (
                      <Bar
                        key={emp.empresa_id}
                        dataKey={emp.empresa_id}
                        name={emp.empresa_nome}
                        fill={mapaCoresEmpresas[emp.empresa_id] || '#2563eb'}
                        stackId="a"
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhuma movimentação registrada no período
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Linhas dos últimos 12 meses por empresa */}
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span>Evolução dos Últimos 12 Meses (por Empresa)</span>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tendência histórica mês a mês de faturamento por loja
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-72 w-full">
              {dados?.graficos?.ultimos_12_meses && dados.graficos.ultimos_12_meses.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dados.graficos.ultimos_12_meses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      formatter={(val: unknown) => [formatarMoeda(Number(val) || 0), '']}
                      labelFormatter={(label) => `Mês: ${label}`}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        fontSize: 12,
                        borderRadius: 6,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    {dados.por_empresa.map((emp) => (
                      <Line
                        key={emp.empresa_id}
                        type="monotone"
                        dataKey={emp.empresa_id}
                        name={emp.empresa_nome}
                        stroke={mapaCoresEmpresas[emp.empresa_id] || '#2563eb'}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhuma movimentação histórica registrada
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============================================================== */}
      {/* 3. UFs DE DESTINO DO GRUPO (TOP 5 E VENDAS INTERESTADUAIS)       */}
      {/* ============================================================== */}
      <Card className="border-slate-200">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-blue-600" />
                <span>Destino das Vendas do Grupo (Interestadual vs. Interno)</span>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Regra oficial: UF do cliente ou destinatario_uf da nota. Vendas balcão sem cliente
                contam como a própria UF da empresa.
              </p>
            </div>
            <div className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md font-semibold self-start sm:self-auto">
              Vendas para outros estados: {formatarMoeda(totalGrupo?.vendas_outros_estados_valor)} (
              {totalGrupo?.vendas_outros_estados_percentual?.toFixed(1)}% do faturamento)
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {totalGrupo?.top_5_ufs && totalGrupo.top_5_ufs.length > 0 ? (
              totalGrupo.top_5_ufs.map((ufItem, idx) => (
                <div
                  key={ufItem.uf}
                  className="p-3 rounded-lg border border-slate-200 bg-white flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      #{idx + 1} {ufItem.uf}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {ufItem.percentual.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900">
                    {formatarMoeda(ufItem.valor)}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-4 text-xs text-slate-400">
                Nenhuma venda interestadual registrada no período
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============================================================== */}
      {/* 4. LINHA DE CARTÕES POR EMPRESA (LOJA A LOJA)                  */}
      {/* ============================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Building className="h-3.5 w-3.5 text-indigo-600" />
            <span>Indicadores Detalhados por Empresa</span>
          </h2>
          <span className="text-xs text-slate-400">
            {dados?.por_empresa?.length || 0} filiais listadas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {dados?.por_empresa?.map((emp: IndicadoresPainelEmpresa) => {
            const corEmpresa = mapaCoresEmpresas[emp.empresa_id] || '#2563eb'

            return (
              <Card
                key={emp.empresa_id}
                className="border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                {/* Cabeçalho da Empresa */}
                <CardHeader className="p-4 pb-2 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: corEmpresa }}
                      />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{emp.empresa_nome}</h3>
                        <p className="text-[10px] text-slate-400">
                          Cód. {emp.empresa_codigo} · UF: {emp.empresa_uf} · {emp.empresa_cnpj}
                        </p>
                      </div>
                    </div>
                    <BadgeSped status={emp.sped_mes_anterior_status} />
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3 text-xs">
                  {/* Faturamento e comparativos */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-500 text-[11px]">Faturamento Mês:</span>
                      <strong className="text-base text-slate-900 font-bold">
                        {formatarMoeda(emp.faturamento_mes_atual)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1 pt-1 border-t border-slate-100">
                      <span className="text-slate-400">vs. Mês anterior:</span>
                      <IndicadorVariacao pct={emp.var_percentual_mes_anterior} label="mês ant." />
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-0.5">
                      <span className="text-slate-400">vs. Ano anterior:</span>
                      <IndicadorVariacao pct={emp.var_percentual_ano_anterior} label="ano ant." />
                    </div>
                  </div>

                  {/* Vendas, Ticket Médio e Margem */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Vendas / Ticket:</span>
                      <strong className="text-slate-800">
                        {formatarQtd(emp.quantidade_vendas)} / {formatarMoeda(emp.ticket_medio)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Margem Bruta:</span>
                      {podeVerProdutos ? (
                        <strong className="text-emerald-700">
                          {formatarMoeda(emp.margem_bruta_valor)} (
                          {emp.margem_bruta_percentual.toFixed(1)}%)
                        </strong>
                      ) : (
                        <span className="text-slate-400 italic">Restrito</span>
                      )}
                    </div>
                  </div>

                  {/* Vendas Interestaduais */}
                  <div className="pt-2 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Vendas Outros Estados:</span>
                      <strong className="text-slate-800">
                        {formatarMoeda(emp.vendas_outros_estados_valor)} (
                        {emp.vendas_outros_estados_percentual.toFixed(1)}%)
                      </strong>
                    </div>
                    {emp.top_5_ufs && emp.top_5_ufs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {emp.top_5_ufs.slice(0, 3).map((u) => (
                          <span
                            key={u.uf}
                            className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]"
                          >
                            {u.uf}: {formatarMoeda(u.valor)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Estoque e Financeiro */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Estoque Valorizado:</span>
                      <strong className="text-slate-800">
                        {podeVerProdutos ? formatarMoeda(emp.estoque_valorizado) : 'Disponível'}
                      </strong>
                      {podeVerProdutos && emp.estoque_parado_mais_90d_valor > 0 && (
                        <span className="text-amber-700 text-[10px] block">
                          Parado: {formatarMoeda(emp.estoque_parado_mais_90d_valor)}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Saldo em Contas:</span>
                      <strong className="text-slate-800">
                        {formatarMoeda(emp.saldo_contas_financeiras)}
                      </strong>
                    </div>
                  </div>

                  {/* A Receber / A Pagar */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="text-slate-400">A receber 30d: </span>
                      <strong className="text-emerald-700">
                        {formatarMoeda(emp.a_receber_proximos_30d)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">A pagar 30d: </span>
                      <strong className="text-rose-700">
                        {formatarMoeda(emp.a_pagar_proximos_30d)}
                      </strong>
                    </div>
                  </div>

                  {/* Alertas Fiscais */}
                  {(emp.documentos_fiscais_rejeitados > 0 ||
                    emp.documentos_fiscais_processando > 0) && (
                    <div className="p-2 bg-rose-50 border border-rose-100 rounded text-[11px] text-rose-700 flex items-center justify-between">
                      <span>Notas fiscais com pendência:</span>
                      <strong>
                        {emp.documentos_fiscais_rejeitados} rejeitada(s),{' '}
                        {emp.documentos_fiscais_processando} processando
                      </strong>
                    </div>
                  )}

                  {/* Links de navegação para os relatórios analíticos */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-indigo-600 font-medium">
                    <Link
                      to="/relatorios/vendas-canais"
                      className="hover:underline flex items-center gap-0.5"
                    >
                      <span>Vendas</span>
                      <ChevronRight className="h-2.5 w-2.5" />
                    </Link>
                    <Link
                      to="/relatorios/estoque-gerencial"
                      className="hover:underline flex items-center gap-0.5"
                    >
                      <span>Estoque</span>
                      <ChevronRight className="h-2.5 w-2.5" />
                    </Link>
                    <Link
                      to="/relatorios/contas-pagar"
                      className="hover:underline flex items-center gap-0.5"
                    >
                      <span>Pagar</span>
                      <ChevronRight className="h-2.5 w-2.5" />
                    </Link>
                    <Link
                      to="/financeiro/dre"
                      className="hover:underline flex items-center gap-0.5"
                    >
                      <span>DRE</span>
                      <ChevronRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default PainelGrupoPage
