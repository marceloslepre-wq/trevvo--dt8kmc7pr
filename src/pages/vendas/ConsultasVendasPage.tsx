import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  ShoppingBag,
  CreditCard,
  User,
  Monitor,
  Lock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEmpresaAtiva, useEmpresasAcessiveis } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { Building2 } from 'lucide-react'
import { TotaisPorEmpresaVendas } from '@/services/consultasVendas'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import {
  consultarVendasPorPeriodo,
  consultarCurvaAbcProdutos,
  consultarMargemVendas,
  exportarConsultaCsv,
  ConsultaPeriodoResultado,
  CurvaAbcResultado,
  MargemVendaItem,
} from '@/services/consultasVendas'

export const ConsultasVendasPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { empresasAcessiveis } = useEmpresasAcessiveis()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  // Margem visível só para quem tem editar em produtos
  const podeVerMargem = pode('produtos', 'editar')

  // Aba ativa: 'periodo' | 'abc' | 'margem'
  const [abaAtiva, setAbaAtiva] = useState<'periodo' | 'abc' | 'margem'>('periodo')

  // Filtro de datas padrão: mês atual
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const hojeIso = hoje.toISOString().slice(0, 10)

  // Estado do FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    atalho_periodo: 'este_mes',
    periodo: {
      dataInicio: primeiroDiaMes,
      dataFim: hojeIso,
    },
    tipo_data: 'emissao',
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(() => ['datas_tipo_data'], [])

  const dataInicioEfetiva = filtros.periodo?.dataInicio || primeiroDiaMes
  const dataFimEfetiva = filtros.periodo?.dataFim || hojeIso
  // Multiempresa: usar TODAS as empresas marcadas, não só a primeira (padrão Itens Comprados)
  const empresasEfetivas: string[] = (filtros.empresas_ids || []).filter(Boolean).length
    ? (filtros.empresas_ids || []).filter(Boolean)
    : empresaAtiva?.id
      ? [empresaAtiva.id]
      : []
  // "Ver só o total consolidado": oculta o painel de quebra por empresa
  const verSoTotal = filtros.ver_so_total === true

  // Sub-aba dentro de período: 'resumo' | 'dia' | 'formas' | 'vendedores' | 'terminais'
  const [subAbaPeriodo, setSubAbaPeriodo] = useState<
    'resumo' | 'dia' | 'formas' | 'vendedores' | 'terminais'
  >('resumo')

  // Critério curva ABC: 'valor' | 'quantidade'
  const [criterioAbc, setCriterioAbc] = useState<'valor' | 'quantidade'>('valor')

  // Estados de dados
  const [dadosPeriodo, setDadosPeriodo] = useState<ConsultaPeriodoResultado | null>(null)
  const [dadosAbc, setDadosAbc] = useState<CurvaAbcResultado | null>(null)
  const [dadosMargem, setDadosMargem] = useState<MargemVendaItem[]>([])
  const [carregando, setCarregando] = useState(false)

  // Carregar dados de acordo com a aba ativa
  const carregarDados = useCallback(async () => {
    if (empresasEfetivas.length === 0) return
    setCarregando(true)

    try {
      if (abaAtiva === 'periodo') {
        const res = await consultarVendasPorPeriodo({
          empresa_ids: empresasEfetivas,
          data_inicio: dataInicioEfetiva,
          data_fim: dataFimEfetiva,
        })
        setDadosPeriodo(res)
      } else if (abaAtiva === 'abc') {
        const res = await consultarCurvaAbcProdutos({
          empresa_ids: empresasEfetivas,
          data_inicio: dataInicioEfetiva,
          data_fim: dataFimEfetiva,
          criterio: criterioAbc,
        })
        setDadosAbc(res)
      } else if (abaAtiva === 'margem') {
        if (!podeVerMargem) return
        const res = await consultarMargemVendas({
          empresa_ids: empresasEfetivas,
          data_inicio: dataInicioEfetiva,
          data_fim: dataFimEfetiva,
        })
        setDadosMargem(res)
      }
    } catch {
      toast({
        title: 'Erro na consulta',
        description: 'Falha ao buscar indicadores de vendas.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresasEfetivas,
    abaAtiva,
    dataInicioEfetiva,
    dataFimEfetiva,
    criterioAbc,
    podeVerMargem,
    toast,
  ])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Nomes das empresas acessíveis (padrão Itens Comprados)
  const nomesEmpresas = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const e of empresasAcessiveis || []) {
      mapa[e.id] = e.nome_fantasia || e.razao_social || e.id
    }
    return mapa
  }, [empresasAcessiveis])

  // Quebra por empresa com Total Geral (período e curva ABC)
  const quebraPorEmpresa = useMemo(() => {
    const mapa = new Map<string, TotaisPorEmpresaVendas>()
    const linhas: TotaisPorEmpresaVendas[] = [
      ...(dadosPeriodo?.totais_por_empresa || []),
      ...(dadosAbc?.totais_por_empresa || []),
    ]
    for (const t of linhas) {
      const chave = t.empresa_id || '(sem empresa)'
      const atual =
        mapa.get(chave) ||
        ({
          empresa_id: chave,
          valor_total: 0,
          quantidade_vendas: 0,
          valor_devolucoes: 0,
          valor_liquido: 0,
        } as TotaisPorEmpresaVendas)
      atual.valor_total += t.valor_total || 0
      atual.quantidade_vendas += t.quantidade_vendas || 0
      atual.valor_devolucoes += t.valor_devolucoes || 0
      atual.valor_liquido += t.valor_liquido || 0
      mapa.set(chave, atual)
    }
    return {
      linhas: Array.from(mapa.values()).sort((a, b) => b.valor_total - a.valor_total),
      totalGeral: {
        valor_total: dadosPeriodo?.totais.valor_total || 0,
        quantidade_vendas: dadosPeriodo?.totais.quantidade_vendas || 0,
        valor_devolucoes: dadosPeriodo?.totais.valor_devolucoes || 0,
        valor_liquido: dadosPeriodo?.totais.valor_liquido || 0,
      },
    }
  }, [dadosPeriodo, dadosAbc])

  // Exportadores CSV
  const handleExportarCsvPeriodo = () => {
    if (!dadosPeriodo) return
    let csv = ''
    if (subAbaPeriodo === 'dia') {
      csv = exportarConsultaCsv(
        ['Data', 'Valor Vendas (R$)', 'Quantidade', 'Ticket Médio (R$)'],
        dadosPeriodo.por_dia.map((d) => [d.data, d.valor, d.quantidade, d.ticket_medio]),
      )
    } else if (subAbaPeriodo === 'formas') {
      csv = exportarConsultaCsv(
        ['Forma de Pagamento', 'Código tPag', 'Valor Total (R$)', 'Participação (%)'],
        dadosPeriodo.por_forma_pagamento.map((f) => [
          f.descricao,
          f.codigo_tpag,
          f.valor,
          f.percentual,
        ]),
      )
    } else if (subAbaPeriodo === 'vendedores') {
      csv = exportarConsultaCsv(
        ['Vendedor', 'Valor Total (R$)', 'Quantidade', 'Ticket Médio (R$)', 'Participação (%)'],
        dadosPeriodo.por_vendedor.map((v) => [
          v.nome,
          v.valor,
          v.quantidade,
          v.ticket_medio,
          v.percentual,
        ]),
      )
    } else if (subAbaPeriodo === 'terminais') {
      csv = exportarConsultaCsv(
        ['Terminal / Canal', 'Valor Total (R$)', 'Quantidade', 'Participação (%)'],
        dadosPeriodo.por_terminal.map((t) => [t.nome, t.valor, t.quantidade, t.percentual]),
      )
    } else {
      // Resumo geral
      csv = exportarConsultaCsv(
        ['Métrica', 'Valor'],
        [
          ['Total Vendas Bruto (R$)', dadosPeriodo.totais.valor_total],
          ['Quantidade de Vendas', dadosPeriodo.totais.quantidade_vendas],
          ['Ticket Médio (R$)', dadosPeriodo.totais.ticket_medio],
          ['Total Devoluções (R$)', dadosPeriodo.totais.valor_devolucoes],
          ['Qtd Devoluções', dadosPeriodo.totais.quantidade_devolucoes],
          ['Total Líquido (R$)', dadosPeriodo.totais.valor_liquido],
        ],
      )
    }

    fazerDownloadCsv(
      csv,
      `vendas_periodo_${subAbaPeriodo}_${dataInicioEfetiva}_a_${dataFimEfetiva}.csv`,
    )
  }

  const handleExportarCsvAbc = () => {
    if (!dadosAbc) return
    const csv = exportarConsultaCsv(
      [
        'Código',
        'Produto',
        'Unidade',
        'Qtd Vendida',
        'Valor Total (R$)',
        'Preço Médio (R$)',
        'Custo Médio (R$)',
        'Margem Bruta (R$)',
        'Margem (%)',
        '% s/ Total',
        '% Acumulado',
        'Classe ABC',
      ],
      dadosAbc.itens.map((i) => [
        i.codigo,
        i.descricao,
        i.unidade,
        i.quantidade_vendida,
        i.valor_total,
        i.preco_medio_venda,
        i.custo_medio_venda,
        i.margem_bruta_valor,
        i.margem_bruta_percentual,
        i.percentual_sobre_total,
        i.percentual_acumulado,
        i.classe_abc,
      ]),
    )
    fazerDownloadCsv(
      csv,
      `curva_abc_produtos_${criterioAbc}_${dataInicioEfetiva}_a_${dataFimEfetiva}.csv`,
    )
  }

  const handleExportarCsvMargem = () => {
    const csv = exportarConsultaCsv(
      [
        'Venda #',
        'Data',
        'Tipo',
        'Cliente',
        'Vendedor',
        'Valor Venda (R$)',
        'Custo Total (R$)',
        'Margem Lucro (R$)',
        'Margem (%)',
      ],
      dadosMargem.map((m) => [
        m.numero,
        m.data_emissao,
        m.tipo,
        m.cliente_nome,
        m.vendedor_nome,
        m.valor_venda,
        m.custo_total,
        m.margem_lucro_valor,
        m.margem_lucro_percentual,
      ]),
    )
    fazerDownloadCsv(csv, `margem_vendas_${dataInicioEfetiva}_a_${dataFimEfetiva}.csv`)
  }

  const handleExportarCsvAtual = () => {
    if (abaAtiva === 'periodo') handleExportarCsvPeriodo()
    else if (abaAtiva === 'abc') handleExportarCsvAbc()
    else if (abaAtiva === 'margem') handleExportarCsvMargem()
  }

  const fazerDownloadCsv = (conteudo: string, nomeArquivo: string) => {
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', nomeArquivo)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="vendas_consultas"
        tituloRelatorio="Consultas e Relatórios de Vendas"
        subtituloRelatorio="Análise periódica de vendas, curva ABC de produtos e margem de contribuição."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarDados}
        onExportarCsv={handleExportarCsvAtual}
        carregando={carregando}
        filtrosExtras={
          abaAtiva === 'abc' ? (
            <div className="space-y-1 min-w-[220px]">
              <label className="text-[11px] font-semibold text-slate-600 block">
                Critério da Curva ABC
              </label>
              <select
                value={criterioAbc}
                onChange={(e) => setCriterioAbc(e.target.value as any)}
                className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
              >
                <option value="valor">Por Valor Financeiro (Faturamento)</option>
                <option value="quantidade">Por Quantidade de Itens Vendidos</option>
              </select>
            </div>
          ) : undefined
        }
      />

      {/* Navegação entre Abas Principais */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <Button
          variant={abaAtiva === 'periodo' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setAbaAtiva('periodo')}
          className="text-xs h-8"
        >
          <Calendar className="h-3.5 w-3.5 mr-1.5" />
          Vendas por Período
        </Button>

        <Button
          variant={abaAtiva === 'abc' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setAbaAtiva('abc')}
          className="text-xs h-8"
        >
          <Layers className="h-3.5 w-3.5 mr-1.5" />
          Produtos Mais Vendidos e Curva ABC
        </Button>

        <Button
          variant={abaAtiva === 'margem' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setAbaAtiva('margem')}
          disabled={!podeVerMargem}
          className={`text-xs h-8 ${!podeVerMargem ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {podeVerMargem ? (
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Lock className="h-3.5 w-3.5 mr-1.5" />
          )}
          Margem por Venda e Produto
        </Button>
      </div>

      {/* Totais por Empresa (oculto quando "Ver só o total consolidado" está marcado) */}
      {!verSoTotal && empresasEfetivas.length > 1 && quebraPorEmpresa.linhas.length > 0 && (
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">Totais por Empresa</h3>
              <Badge variant="outline" className="text-[10px]">
                {empresasEfetivas.length} empresas no filtro
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2 px-3">Empresa</th>
                    <th className="py-2 px-3 text-right">Qtd Vendas</th>
                    <th className="py-2 px-3 text-right">Valor Bruto</th>
                    <th className="py-2 px-3 text-right">Devoluções</th>
                    <th className="py-2 px-3 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quebraPorEmpresa.linhas.map((l) => (
                    <tr key={l.empresa_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {nomesEmpresas[l.empresa_id] ||
                          (l.empresa_id === '(sem empresa)' ? 'Sem empresa' : l.empresa_id)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {l.quantidade_vendas}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        R${' '}
                        {l.valor_total.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-red-600">
                        R${' '}
                        {l.valor_devolucoes.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                        R${' '}
                        {l.valor_liquido.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="py-2 px-3 text-slate-900">Total Geral</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      {quebraPorEmpresa.totalGeral.quantidade_vendas}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      R${' '}
                      {quebraPorEmpresa.totalGeral.valor_total.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-red-600">
                      R${' '}
                      {quebraPorEmpresa.totalGeral.valor_devolucoes.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">
                      R${' '}
                      {quebraPorEmpresa.totalGeral.valor_liquido.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CONTEÚDO DA ABA 1: Vendas por Período */}
      {abaAtiva === 'periodo' && dadosPeriodo && (
        <div className="space-y-6">
          {/* Cartões de Indicadores Gerais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Faturamento Bruto</p>
                  <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                    R$ {dadosPeriodo.totais.valor_total.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                  <DollarSign className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Quantidade de Vendas</p>
                  <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                    {dadosPeriodo.totais.quantidade_vendas}
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                  <ShoppingBag className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Ticket Médio</p>
                  <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                    R$ {dadosPeriodo.totais.ticket_medio.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Devoluções / Líquido</p>
                  <p className="text-sm font-bold text-red-600 mt-1 font-mono">
                    - R$ {dadosPeriodo.totais.valor_devolucoes.toFixed(2)}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600 font-mono">
                    Líq: R$ {dadosPeriodo.totais.valor_liquido.toFixed(2)}
                  </p>
                </div>
                <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">
                  <Percent className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sub-abas de agrupamento */}
          <div className="flex items-center gap-2">
            <Button
              variant={subAbaPeriodo === 'dia' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSubAbaPeriodo('dia')}
              className="text-xs h-7"
            >
              <Calendar className="h-3 w-3 mr-1" />
              Por Dia
            </Button>
            <Button
              variant={subAbaPeriodo === 'formas' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSubAbaPeriodo('formas')}
              className="text-xs h-7"
            >
              <CreditCard className="h-3 w-3 mr-1" />
              Por Forma de Pagamento
            </Button>
            <Button
              variant={subAbaPeriodo === 'vendedores' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSubAbaPeriodo('vendedores')}
              className="text-xs h-7"
            >
              <User className="h-3 w-3 mr-1" />
              Por Vendedor
            </Button>
            <Button
              variant={subAbaPeriodo === 'terminais' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSubAbaPeriodo('terminais')}
              className="text-xs h-7"
            >
              <Monitor className="h-3 w-3 mr-1" />
              Por Terminal
            </Button>
          </div>

          {/* Tabelas de Visão do Período */}
          <Card className="border-slate-200">
            <CardContent className="pt-4">
              {subAbaPeriodo === 'dia' && (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs text-right">Vendas (R$)</TableHead>
                      <TableHead className="text-xs text-right">Quantidade</TableHead>
                      <TableHead className="text-xs text-right">Ticket Médio (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPeriodo.por_dia.map((d) => (
                      <TableRow key={d.data}>
                        <TableCell className="text-xs font-medium">
                          {d.data.split('-').reverse().join('/')}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          R$ {d.valor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {d.quantidade}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-600">
                          R$ {d.ticket_medio.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {subAbaPeriodo === 'formas' && (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Forma de Pagamento</TableHead>
                      <TableHead className="text-xs text-center w-24">Código tPag</TableHead>
                      <TableHead className="text-xs text-right">Valor Total (R$)</TableHead>
                      <TableHead className="text-xs text-right">Participação (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPeriodo.por_forma_pagamento.map((f) => (
                      <TableRow key={f.forma_id}>
                        <TableCell className="text-xs font-medium">{f.descricao}</TableCell>
                        <TableCell className="text-xs text-center font-mono">
                          {f.codigo_tpag}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          R$ {f.valor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-blue-600">
                          {f.percentual.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {subAbaPeriodo === 'vendedores' && (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs text-right">Valor Total (R$)</TableHead>
                      <TableHead className="text-xs text-right">Qtd Vendas</TableHead>
                      <TableHead className="text-xs text-right">Ticket Médio (R$)</TableHead>
                      <TableHead className="text-xs text-right">Participação (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPeriodo.por_vendedor.map((v) => (
                      <TableRow key={v.vendedor_id}>
                        <TableCell className="text-xs font-medium">{v.nome}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          R$ {v.valor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {v.quantidade}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-600">
                          R$ {v.ticket_medio.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-indigo-600">
                          {v.percentual.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {subAbaPeriodo === 'terminais' && (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Terminal / Origem</TableHead>
                      <TableHead className="text-xs text-right">Valor Total (R$)</TableHead>
                      <TableHead className="text-xs text-right">Quantidade</TableHead>
                      <TableHead className="text-xs text-right">Participação (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPeriodo.por_terminal.map((t) => (
                      <TableRow key={t.terminal_id}>
                        <TableCell className="text-xs font-medium">{t.nome}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          R$ {t.valor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {t.quantidade}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-purple-600">
                          {t.percentual.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quebra por empresa (oculta quando "Ver só o total consolidado" está marcado) */}
      {abaAtiva === 'periodo' &&
        !verSoTotal &&
        dadosPeriodo &&
        dadosPeriodo.totais_por_empresa.length > 0 && (
          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-800">Totais por Empresa</h3>
                <Badge variant="outline" className="text-[10px]">
                  {empresasEfetivas.length > 1
                    ? `${empresasEfetivas.length} empresas no filtro`
                    : '1 empresa no filtro'}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                      <th className="py-2 px-3">Empresa</th>
                      <th className="py-2 px-3 text-right">Vendas</th>
                      <th className="py-2 px-3 text-right">Valor Bruto</th>
                      <th className="py-2 px-3 text-right">Devoluções</th>
                      <th className="py-2 px-3 text-right">Valor Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dadosPeriodo.totais_por_empresa.map((e) => (
                      <tr key={e.empresa_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {nomesEmpresas[e.empresa_id] ||
                            (e.empresa_id === '(sem empresa)' ? 'Sem empresa' : e.empresa_id)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          {e.quantidade_vendas}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          R$ {e.valor_total.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">
                          R$ {e.valor_devolucoes.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                          R$ {e.valor_liquido.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td className="py-2 px-3 text-slate-900">Total Geral</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900">
                        {dadosPeriodo.totais.quantidade_vendas}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900">
                        R$ {dadosPeriodo.totais.valor_total.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-red-700">
                        R$ {dadosPeriodo.totais.valor_devolucoes.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700">
                        R$ {dadosPeriodo.totais.valor_liquido.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Quebra por empresa na Curva ABC */}
      {abaAtiva === 'abc' && !verSoTotal && dadosAbc && dadosAbc.totais_por_empresa.length > 0 && (
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">
                Totais por Empresa (Curva ABC)
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {empresasEfetivas.length > 1
                  ? `${empresasEfetivas.length} empresas no filtro`
                  : '1 empresa no filtro'}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2 px-3">Empresa</th>
                    <th className="py-2 px-3 text-right">Qtd de Itens Vendidos</th>
                    <th className="py-2 px-3 text-right">Valor Total em Itens</th>
                    <th className="py-2 px-3 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dadosAbc.totais_por_empresa.map((e) => (
                    <tr key={e.empresa_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {nomesEmpresas[e.empresa_id] ||
                          (e.empresa_id === '(sem empresa)' ? 'Sem empresa' : e.empresa_id)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {e.quantidade_vendas}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        R$ {e.valor_total.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">
                        R$ {e.valor_liquido.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="py-2 px-3 text-slate-900">Total Geral</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      {dadosAbc.total_geral_quantidade}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      R$ {dadosAbc.total_geral_valor.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">
                      R$ {dadosAbc.total_geral_valor.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CONTEÚDO DA ABA 2: Curva ABC de Produtos */}
      {abaAtiva === 'abc' && dadosAbc && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Ranking de Produtos e Classificação ABC
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Total faturado em itens: R$ {dadosAbc.total_geral_valor.toFixed(2)} | Quantidade
                  total: {dadosAbc.total_geral_quantidade} itens.
                </CardDescription>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                  Classe A: até 80%
                </Badge>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  Classe B: 80% a 95%
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                  Classe C: 95% a 100%
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dadosAbc.itens.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum produto vendido no período.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs text-center w-16">Classe</TableHead>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Produto</TableHead>
                      <TableHead className="text-xs text-right">Qtd Vendida</TableHead>
                      <TableHead className="text-xs text-right">Valor Total (R$)</TableHead>
                      <TableHead className="text-xs text-right">Preço Médio (R$)</TableHead>
                      <TableHead className="text-xs text-right">% s/ Total</TableHead>
                      <TableHead className="text-xs text-right">% Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosAbc.itens.map((p) => {
                      const badgeBg =
                        p.classe_abc === 'A'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : p.classe_abc === 'B'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                      return (
                        <TableRow key={p.produto_id}>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-xs font-bold ${badgeBg}`}>
                              {p.classe_abc}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-500">
                            {p.codigo || '-'}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{p.descricao}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-medium">
                            {p.quantidade_vendida} {p.unidade}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-slate-900">
                            R$ {p.valor_total.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-slate-600">
                            R$ {p.preco_medio_venda.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-blue-600">
                            {p.percentual_sobre_total.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold text-slate-700">
                            {p.percentual_acumulado.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CONTEÚDO DA ABA 3: Margem por Venda */}
      {abaAtiva === 'margem' && podeVerMargem && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              Margem de Lucro Bruta por Venda (Preço − Custo Médio)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Visível exclusivamente para usuários com permissão de edição em produtos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dadosMargem.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Nenhuma venda encontrada.</p>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Venda #</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs text-right">Venda (R$)</TableHead>
                      <TableHead className="text-xs text-right">Custo Total (R$)</TableHead>
                      <TableHead className="text-xs text-right">Margem (R$)</TableHead>
                      <TableHead className="text-xs text-right font-bold">Margem (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosMargem.map((m) => (
                      <TableRow key={m.venda_id}>
                        <TableCell className="text-xs font-mono font-semibold">
                          #{m.numero}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.data_emissao ? m.data_emissao.split('-').reverse().join('/') : '-'}
                        </TableCell>
                        <TableCell className="text-xs">{m.cliente_nome}</TableCell>
                        <TableCell className="text-xs">{m.vendedor_nome}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium">
                          R$ {m.valor_venda.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-slate-500">
                          R$ {m.custo_total.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-mono font-semibold ${
                            m.margem_lucro_valor < 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          R$ {m.margem_lucro_valor.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-mono font-bold ${
                            m.margem_lucro_percentual < 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {m.margem_lucro_percentual.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
