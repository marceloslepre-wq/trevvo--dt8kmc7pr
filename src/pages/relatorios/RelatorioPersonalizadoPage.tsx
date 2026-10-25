import React, { useState, useEffect, useMemo } from 'react'
import {
  SlidersHorizontal,
  Layers,
  CheckSquare,
  BarChart2,
  LineChart as LineChartIcon,
  Download,
  Printer,
  BookmarkPlus,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Database,
  Eye,
  Plus,
  X,
  Lock,
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import { FiltrosRelatorio } from '@/components/relatorios/FiltrosRelatorio'
import {
  ObjetoFiltrosRelatorio,
  ChaveFiltroDeclaravel,
  gerarCsvRelatorio,
  fazerDownloadCsv,
  dispararImpressaoRelatorio,
  formatarLinhaLegivelFiltros,
  formatarDataIso,
} from '@/services/relatorios'
import {
  BaseRelatorioPersonalizado,
  AgrupamentoPersonalizado,
  ValorMetricaPersonalizado,
  RespostaRelatorioPersonalizado,
  LinhaRelatorioPersonalizado,
  consultarRelatorioPersonalizado,
  salvarRelatorioPersonalizado,
  DICIONARIO_AGRUPAMENTOS_VENDAS,
  DICIONARIO_AGRUPAMENTOS_COMPRAS,
  DICIONARIO_VALORES_VENDAS,
  DICIONARIO_VALORES_COMPRAS,
} from '@/services/relatorioPersonalizado'

export const RelatorioPersonalizadoPage: React.FC = () => {
  const { pode, administrador } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const podeVerProdutos = pode('produtos', 'ver') || administrador
  const podeVerCompras = pode('compras', 'ver') || administrador

  // Estado dos 4 passos do Montador
  // Passo 1: Base de dados
  const [base, setBase] = useState<BaseRelatorioPersonalizado>('itens_vendidos')

  // Passo 2: Agrupamentos (até 3 níveis na ordem escolhida)
  const [agrupamentos, setAgrupamentos] = useState<AgrupamentoPersonalizado[]>(['marca', 'mes'])

  // Passo 3: Valores / Métricas
  const [valores, setValores] = useState<ValorMetricaPersonalizado[]>([
    'quantidade',
    'valor_liquido',
    'margem_valor',
    'margem_percentual',
  ])

  // Passo 4: Filtros (Catálogo 8.0b)
  const hoje = useMemo(() => new Date(), [])
  const dataHojeStr = useMemo(() => formatarDataIso(hoje), [hoje])
  const primeiroDiaAnoStr = useMemo(
    () => formatarDataIso(new Date(hoje.getFullYear(), 0, 1)),
    [hoje],
  )

  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    periodo: {
      dataInicio: primeiroDiaAnoStr,
      dataFim: dataHojeStr,
    },
    atalho_periodo: 'personalizado',
  })

  // Sincroniza empresa ativa caso filtros não tenham empresas
  useEffect(() => {
    if (empresaAtiva?.id && (!filtros.empresas_ids || filtros.empresas_ids.length === 0)) {
      setFiltros((prev) => ({
        ...prev,
        empresas_ids: [empresaAtiva.id],
      }))
    }
  }, [empresaAtiva?.id])

  // Quando troca a base, ajusta agrupamentos e métricas padrão para evitar conflito
  const handleTrocarBase = (novaBase: BaseRelatorioPersonalizado) => {
    if (novaBase === 'itens_comprados' && !podeVerCompras) {
      toast({
        title: 'Módulo de Compras restrito',
        description: 'Você não possui permissão para consultar a base de compras.',
        variant: 'destructive',
      })
      return
    }

    setBase(novaBase)
    if (novaBase === 'itens_comprados') {
      setAgrupamentos(['fornecedor_nota', 'marca'])
      setValores(['quantidade', 'valor_produtos', 'custo_total', 'percentual_total'])
    } else {
      setAgrupamentos(['marca', 'mes'])
      setValores(['quantidade', 'valor_liquido', 'margem_valor', 'margem_percentual'])
    }
  }

  // Estado da Consulta e Resultado
  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<RespostaRelatorioPersonalizado | null>(null)
  const [erroConsulta, setErroConsulta] = useState<string | null>(null)

  // Gráfico e ordenação
  const [tipoGrafico, setTipoGrafico] = useState<'nenhum' | 'barras' | 'linhas'>('nenhum')
  const [metricaGrafico, setMetricaGrafico] = useState<string>('valor_liquido')
  const [colunaOrdenada, setColunaOrdenada] = useState<string>('rotulo')
  const [direcaoOrdenada, setDirecaoOrdenada] = useState<'asc' | 'desc'>('asc')

  // Modal de Salvar Relatório
  const [modalSalvarAberto, setModalSalvarAberto] = useState(false)
  const [nomeRelatorioSalvar, setNomeRelatorioSalvar] = useState('')
  const [descricaoRelatorioSalvar, setDescricaoRelatorioSalvar] = useState('')
  const [compartilhadoSalvar, setCompartilhadoSalvar] = useState(false)
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false)

  // Filtros permitidos no componente FiltrosRelatorio conforme a base
  const filtrosPermitidosBase = useMemo<ChaveFiltroDeclaravel[]>(() => {
    if (base === 'itens_vendidos') {
      return [
        'produto_grupos_categorias',
        'produto_marcas',
        'produto_produtos',
        'produto_fornecedores',
        'produto_ncms',
        'produto_situacao',
        'produto_so_fiscal_nao_revisado',
        'pessoas_clientes',
        'pessoas_vendedores',
        'pessoas_operadores_caixa',
        'pessoas_cliente_ufs',
        'pessoas_cliente_cidades',
        'vendas_tipos',
        'vendas_formas_pagamento',
        'vendas_terminais_pdv',
        'vendas_intermediadores',
        'vendas_com_sem_nota',
        'fiscal_cfops',
      ]
    } else {
      return [
        'produto_grupos_categorias',
        'produto_marcas',
        'produto_produtos',
        'produto_fornecedores',
        'produto_ncms',
        'produto_situacao',
        'pessoas_fornecedores',
        'fiscal_cfops',
        'datas_tipo_data',
      ]
    }
  }, [base])

  // Executa a montagem no backend
  const executarConsulta = async () => {
    if (!filtros.empresas_ids || filtros.empresas_ids.length === 0) {
      toast({
        title: 'Selecione uma empresa',
        description: 'Selecione ao menos uma empresa para consultar.',
        variant: 'destructive',
      })
      return
    }

    if (agrupamentos.length === 0) {
      toast({
        title: 'Agrupamento obrigatório',
        description: 'Selecione ao menos um nível de agrupamento.',
        variant: 'destructive',
      })
      return
    }

    if (valores.length === 0) {
      toast({
        title: 'Métrica obrigatória',
        description: 'Selecione ao menos um valor ou métrica para exibir.',
        variant: 'destructive',
      })
      return
    }

    setCarregando(true)
    setErroConsulta(null)

    try {
      const resp = await consultarRelatorioPersonalizado({
        base,
        agrupamentos,
        valores,
        filtros,
      })

      setResultado(resp)

      // Habilitar gráfico por padrão se elegível
      const primeiroAgrupamento = resp.agrupamentos[0]
      const ehTempo = ['dia', 'semana', 'mes', 'ano'].includes(primeiroAgrupamento)
      const podeGrafico = ehTempo || (resp.dadosGrafico && resp.dadosGrafico.length <= 20)

      if (podeGrafico && resp.dadosGrafico && resp.dadosGrafico.length > 0) {
        setTipoGrafico((prev) => (prev === 'nenhum' ? 'barras' : prev))
        setMetricaGrafico(base === 'itens_vendidos' ? 'valor_liquido' : 'custo_total')
      } else {
        setTipoGrafico('nenhum')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar relatório personalizado.'
      setErroConsulta(msg)
      toast({
        title: 'Erro na consulta',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // Executa automaticamente na primeira carga
  useEffect(() => {
    if (filtros.empresas_ids && filtros.empresas_ids.length > 0) {
      executarConsulta()
    }
  }, [])

  // Manipulação de agrupamentos (adicionar/remover/reordenar)
  const toggleAgrupamento = (itemChave: AgrupamentoPersonalizado) => {
    if (agrupamentos.includes(itemChave)) {
      if (agrupamentos.length === 1) {
        toast({
          title: 'Agrupamento obrigatório',
          description: 'Mantenha ao menos um nível de agrupamento selecionado.',
        })
        return
      }
      setAgrupamentos(agrupamentos.filter((a) => a !== itemChave))
    } else {
      if (agrupamentos.length >= 3) {
        toast({
          title: 'Limite de agrupamento',
          description: 'Você pode selecionar no máximo 3 níveis de agrupamento.',
          variant: 'destructive',
        })
        return
      }
      setAgrupamentos([...agrupamentos, itemChave])
    }
  }

  const moverAgrupamento = (index: number, direcao: 'cima' | 'baixo') => {
    const novoIndex = direcao === 'cima' ? index - 1 : index + 1
    if (novoIndex < 0 || novoIndex >= agrupamentos.length) return
    const novoArray = [...agrupamentos]
    const temp = novoArray[index]
    novoArray[index] = novoArray[novoIndex]
    novoArray[novoIndex] = temp
    setAgrupamentos(novoArray)
  }

  // Manipulação de valores
  const toggleValor = (valChave: ValorMetricaPersonalizado) => {
    if (valores.includes(valChave)) {
      if (valores.length === 1) {
        toast({
          title: 'Métrica obrigatória',
          description: 'Selecione ao menos um valor para o relatório.',
        })
        return
      }
      setValores(valores.filter((v) => v !== valChave))
    } else {
      setValores([...valores, valChave])
    }
  }

  // Ordenação da tabela de resultados
  const handleOrdenar = (campo: string) => {
    if (colunaOrdenada === campo) {
      setDirecaoOrdenada((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setColunaOrdenada(campo)
      setDirecaoOrdenada('desc')
    }
  }

  // Linhas ordenadas mantendo hierarquia ou planas
  const linhasExibicao = useMemo(() => {
    if (!resultado?.linhas) return []
    const linhas = [...resultado.linhas]

    if (colunaOrdenada === 'rotulo') {
      return linhas
    }

    // Se o usuário clicar em uma métrica para ordenar, ordena dentro do mesmo nível
    return linhas.sort((a, b) => {
      // Subtotais sempre ficam após seus filhos ou respeitam o nível
      const valA = (a.metricas as Record<string, number | null | undefined>)[colunaOrdenada] ?? 0
      const valB = (b.metricas as Record<string, number | null | undefined>)[colunaOrdenada] ?? 0

      if (typeof valA === 'number' && typeof valB === 'number') {
        return direcaoOrdenada === 'asc' ? valA - valB : valB - valA
      }
      return 0
    })
  }, [resultado?.linhas, colunaOrdenada, direcaoOrdenada])

  // Formatação de valores numéricos
  const formatarValor = (
    val: number | null | undefined,
    formato: 'moeda' | 'numero' | 'percentual',
  ) => {
    if (val === null || val === undefined) return '-'
    if (formato === 'moeda') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    }
    if (formato === 'percentual') {
      return `${val.toFixed(2)}%`
    }
    return new Intl.NumberFormat('pt-BR').format(val)
  }

  // Exportação CSV
  const handleExportarCsv = () => {
    if (!resultado) return

    const colunasCsv: string[] = ['Nível', 'Agrupamento / Descrição']
    resultado.valores.forEach((v) => {
      const def =
        base === 'itens_vendidos'
          ? DICIONARIO_VALORES_VENDAS[v as keyof typeof DICIONARIO_VALORES_VENDAS]
          : DICIONARIO_VALORES_COMPRAS[v as keyof typeof DICIONARIO_VALORES_COMPRAS]
      if (def) colunasCsv.push(def.label)
    })

    const linhasCsv: (string | number | boolean | null | undefined)[][] = resultado.linhas.map(
      (l) => {
        const linhaArr: (string | number | boolean | null | undefined)[] = [
          `Nível ${l.nivel}${l.eh_subtotal ? ' (Subtotal)' : ''}`,
          l.rotulo,
        ]
        resultado.valores.forEach((v) => {
          const val = (l.metricas as Record<string, unknown>)[v]
          linhaArr.push(val !== undefined && val !== null ? (val as number) : '')
        })
        return linhaArr
      },
    )

    const totalArr: (string | number | boolean | null | undefined)[] = ['TOTAL', 'TOTAL GERAL']
    resultado.valores.forEach((v) => {
      const val = (resultado.totalGeral as Record<string, unknown>)[v]
      totalArr.push(val !== undefined && val !== null ? (val as number) : '')
    })

    const linhaFiltros = formatarLinhaLegivelFiltros({ filtros })

    const csvConteudo = gerarCsvRelatorio({
      titulo: `Relatório Personalizado - ${base === 'itens_vendidos' ? 'Itens Vendidos' : 'Itens Comprados'}`,
      empresaNome: empresaAtiva?.nome_fantasia || 'Empresas Consolidadas',
      periodo: filtros.periodo,
      linhaFiltros,
      colunas: colunasCsv,
      linhas: linhasCsv,
      totais: totalArr,
      metadadosExtras: {
        'BASE DE DADOS': base === 'itens_vendidos' ? 'Vendas Finalizadas' : 'Compras Lançadas',
        AGRUPAMENTOS: agrupamentos.join(' > '),
      },
    })

    fazerDownloadCsv(csvConteudo, `relatorio_personalizado_${base}_${dataHojeStr}.csv`)
  }

  // Impressão
  const handleImprimir = () => {
    dispararImpressaoRelatorio()
  }

  // Modal Salvar Relatório
  const handleAbrirModalSalvar = () => {
    const nomePadrao = `${base === 'itens_vendidos' ? 'Vendas' : 'Compras'} por ${agrupamentos
      .map((a) =>
        base === 'itens_vendidos'
          ? DICIONARIO_AGRUPAMENTOS_VENDAS[a as keyof typeof DICIONARIO_AGRUPAMENTOS_VENDAS]
          : DICIONARIO_AGRUPAMENTOS_COMPRAS[a as keyof typeof DICIONARIO_AGRUPAMENTOS_COMPRAS],
      )
      .join(' e ')}`

    setNomeRelatorioSalvar(nomePadrao)
    setDescricaoRelatorioSalvar('')
    setCompartilhadoSalvar(false)
    setModalSalvarAberto(true)
  }

  const handleConfirmarSalvarRelatorio = async () => {
    if (!nomeRelatorioSalvar.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para o relatório personalizado.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoRelatorio(true)
    try {
      await salvarRelatorioPersonalizado({
        nome: nomeRelatorioSalvar.trim(),
        descricao: descricaoRelatorioSalvar.trim(),
        base,
        agrupamentos,
        valores,
        filtros,
        tipo_grafico: tipoGrafico,
        compartilhado: compartilhadoSalvar,
      })

      toast({
        title: 'Relatório salvo com sucesso!',
        description: `O relatório "${nomeRelatorioSalvar.trim()}" agora está disponível na Central de Relatórios.`,
      })
      setModalSalvarAberto(false)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha ao salvar relatório.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoRelatorio(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Relatório Personalizado (Montador)
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Monte seus próprios relatórios escolhendo a base de dados, agrupamentos, métricas e
                filtros.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAbrirModalSalvar}
            className="h-8 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5 mr-1" />
            Salvar este relatório
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={!resultado || carregando}
            className="h-8 text-xs border-slate-200 text-slate-700 bg-white"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Exportar CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            disabled={!resultado || carregando}
            className="h-8 text-xs border-slate-200 text-slate-700 bg-white"
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAINEL DO MONTADOR EM 4 PASSOS NA MESMA TELA                              */}
      {/* ========================================================================= */}
      <Card className="border-indigo-100 shadow-sm bg-gradient-to-b from-white to-slate-50/50">
        <CardHeader className="p-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span>Configuração do Relatório em 4 Passos</span>
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700">
              Parte 1: Vendas e Compras
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-6">
          {/* PASSO 1: BASE DE DADOS */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Base de Dados
              </Label>
            </div>

            <RadioGroup
              value={base}
              onValueChange={(val) => handleTrocarBase(val as BaseRelatorioPersonalizado)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1"
            >
              {/* Opção Vendas */}
              <label
                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                  base === 'itens_vendidos'
                    ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <RadioGroupItem value="itens_vendidos" id="base_vendas" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Itens Vendidos</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-white text-emerald-700 border-emerald-300"
                    >
                      Vendas
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Itens de vendas Finalizadas (`vendas_itens`), descontando automaticamente as
                    devoluções de mercadoria registradas no período.
                  </p>
                </div>
              </label>

              {/* Opção Compras */}
              <label
                className={`p-3 rounded-lg border transition-all flex items-start gap-3 ${
                  !podeVerCompras
                    ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                    : base === 'itens_comprados'
                      ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 cursor-pointer'
                      : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer'
                }`}
              >
                <RadioGroupItem
                  value="itens_comprados"
                  id="base_compras"
                  disabled={!podeVerCompras}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Itens Comprados</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-white text-blue-700 border-blue-300"
                    >
                      Compras
                    </Badge>
                    {!podeVerCompras && (
                      <span className="text-[10px] text-rose-600 flex items-center gap-0.5">
                        <Lock className="h-3 w-3" /> Exige compras
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Itens de notas fiscais de entrada Lançadas (`notas_entrada_itens`), incluindo
                    impostos creditados e custos totais de aquisição.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* PASSO 2: AGRUPAR POR (ATÉ 3 NÍVEIS NA ORDEM ESCOLHIDA) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Agrupar Por (até 3 níveis hierárquicos)
                </Label>
              </div>
              <span className="text-[11px] text-slate-500">
                Ordem ativa: {agrupamentos.length} nível(is) selecionado(s)
              </span>
            </div>

            {/* Fila dos agrupamentos selecionados com botões de reordenar */}
            <div className="p-2.5 bg-slate-100/80 rounded-lg border border-slate-200 flex flex-wrap items-center gap-2 min-h-11">
              {agrupamentos.map((agrup, idx) => {
                const label =
                  base === 'itens_vendidos'
                    ? DICIONARIO_AGRUPAMENTOS_VENDAS[
                        agrup as keyof typeof DICIONARIO_AGRUPAMENTOS_VENDAS
                      ]
                    : DICIONARIO_AGRUPAMENTOS_COMPRAS[
                        agrup as keyof typeof DICIONARIO_AGRUPAMENTOS_COMPRAS
                      ]

                return (
                  <div
                    key={agrup}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-900 rounded-md text-xs font-semibold shadow-2xs"
                  >
                    <span className="text-[10px] text-indigo-500 font-bold">{idx + 1}º</span>
                    <span>{label || agrup}</span>

                    <div className="flex items-center ml-1 border-l border-slate-200 pl-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => moverAgrupamento(idx, 'cima')}
                          title="Subir nível"
                          className="p-0.5 text-slate-400 hover:text-indigo-600"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                      )}
                      {idx < agrupamentos.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moverAgrupamento(idx, 'baixo')}
                          title="Descer nível"
                          className="p-0.5 text-slate-400 hover:text-indigo-600"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleAgrupamento(agrup)}
                        title="Remover agrupamento"
                        className="p-0.5 text-slate-400 hover:text-rose-600 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {agrupamentos.length === 0 && (
                <span className="text-xs text-slate-400 italic">
                  Selecione ao menos um agrupamento abaixo
                </span>
              )}
            </div>

            {/* Nuvem de opções de agrupamento disponíveis para clique */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(
                base === 'itens_vendidos'
                  ? DICIONARIO_AGRUPAMENTOS_VENDAS
                  : DICIONARIO_AGRUPAMENTOS_COMPRAS,
              ).map(([chave, rotulo]) => {
                const ativo = agrupamentos.includes(chave as AgrupamentoPersonalizado)
                const posicao = agrupamentos.indexOf(chave as AgrupamentoPersonalizado)

                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => toggleAgrupamento(chave as AgrupamentoPersonalizado)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                      ativo
                        ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {ativo ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-white text-indigo-700 text-[9px] font-bold flex items-center justify-center">
                        {posicao + 1}
                      </span>
                    ) : (
                      <Plus className="h-3 w-3 text-slate-400" />
                    )}
                    <span>{rotulo}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* PASSO 3: VALORES E MÉTRICAS */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                3
              </span>
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Valores e Métricas
              </Label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
              {Object.entries(
                base === 'itens_vendidos' ? DICIONARIO_VALORES_VENDAS : DICIONARIO_VALORES_COMPRAS,
              ).map(([chave, meta]) => {
                const checked = valores.includes(chave as ValorMetricaPersonalizado)
                const isSigilo = 'sigilo' in meta && meta.sigilo
                const bloqueado = isSigilo && !podeVerProdutos

                return (
                  <label
                    key={chave}
                    className={`p-2 rounded-md border text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                      bloqueado
                        ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200'
                        : checked
                          ? 'border-indigo-400 bg-indigo-50/50 text-indigo-950 font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={bloqueado}
                      onCheckedChange={() => toggleValor(chave as ValorMetricaPersonalizado)}
                      className="mt-0.5"
                    />
                    <div className="leading-tight">
                      <span>{meta.label}</span>
                      {bloqueado && (
                        <span className="block text-[10px] text-amber-700 font-normal">
                          (Sigilo produtos)
                        </span>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* PASSO 4: FILTROS DO CATÁLOGO 8.0b */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                  4
                </span>
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Filtros da Consulta
                </Label>
              </div>

              <Button
                type="button"
                onClick={executarConsulta}
                disabled={carregando}
                className="h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 shadow-sm"
              >
                {carregando ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Gerando relatório...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Aplicar e Gerar Relatório
                  </>
                )}
              </Button>
            </div>

            {/* Componente Universal de Filtros (FiltrosRelatorio) */}
            <div className="bg-white rounded-lg border border-slate-200">
              <FiltrosRelatorio
                filtros={filtros}
                onChange={setFiltros}
                relatorioId={`personalizado_${base}`}
                filtrosDeclarados={filtrosPermitidosBase}
                onExportarCsv={handleExportarCsv}
                onImprimir={handleImprimir}
                carregando={carregando}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* CABEÇALHO FORMAL DE IMPRESSÃO (ESTILO @media print)                        */}
      {/* ========================================================================= */}
      <div className="hidden print:block border-b border-slate-300 pb-3 mb-4 text-xs space-y-1">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              RELATÓRIO PERSONALIZADO ({base === 'itens_vendidos' ? 'VENDAS' : 'COMPRAS'})
            </h1>
            <p className="text-slate-600">
              Empresa(s): {empresaAtiva?.razao_social || 'Consolidado Multiempresa'} · CNPJ:{' '}
              {empresaAtiva?.cnpj || '-'}
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <p>
              Período: {filtros.periodo?.dataInicio} a {filtros.periodo?.dataFim}
            </p>
            <p>Emissão: {new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-700 font-medium">
          Filtros aplicados: {formatarLinhaLegivelFiltros({ filtros })}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* ÁREA DE GRÁFICO CONDICIONAL (QUANDO PERMITIDO)                            */}
      {/* ========================================================================= */}
      {resultado?.dadosGrafico && resultado.dadosGrafico.length > 0 && (
        <Card className="border-slate-200 print:hidden">
          <CardHeader className="p-4 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-indigo-600" />
                  <span>Gráfico Comparativo do 1º Agrupamento</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Exibição disponível porque o primeiro nível é temporal ou contém até 20 linhas.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                {/* Tipo de gráfico */}
                <div className="flex items-center border border-slate-200 rounded-md p-0.5 bg-slate-50 text-xs">
                  <button
                    type="button"
                    onClick={() => setTipoGrafico('barras')}
                    className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                      tipoGrafico === 'barras'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    <BarChart2 className="h-3 w-3" />
                    Barras
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoGrafico('linhas')}
                    className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                      tipoGrafico === 'linhas'
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    <LineChartIcon className="h-3 w-3" />
                    Linhas
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoGrafico('nenhum')}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      tipoGrafico === 'nenhum'
                        ? 'bg-white text-slate-700 shadow-2xs'
                        : 'text-slate-400'
                    }`}
                  >
                    Ocultar
                  </button>
                </div>

                {/* Métrica do gráfico */}
                {tipoGrafico !== 'nenhum' && (
                  <select
                    value={metricaGrafico}
                    onChange={(e) => setMetricaGrafico(e.target.value)}
                    className="h-7 text-xs border border-slate-200 rounded px-2 bg-white text-slate-700"
                  >
                    {base === 'itens_vendidos' ? (
                      <>
                        <option value="valor_liquido">Valor Líquido</option>
                        <option value="quantidade">Quantidade</option>
                        {podeVerProdutos && <option value="margem_valor">Margem Bruta (R$)</option>}
                        <option value="ticket_medio">Ticket Médio</option>
                      </>
                    ) : (
                      <>
                        <option value="custo_total">Custo Total</option>
                        <option value="valor_produtos">Valor dos Produtos</option>
                        <option value="quantidade">Quantidade</option>
                      </>
                    )}
                  </select>
                )}
              </div>
            </div>
          </CardHeader>

          {tipoGrafico !== 'nenhum' && (
            <CardContent className="p-4 pt-1">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {tipoGrafico === 'barras' ? (
                    <BarChart data={resultado.dadosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="rotulo"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) =>
                          metricaGrafico === 'quantidade'
                            ? String(v)
                            : `R$${(v / 1000).toFixed(0)}k`
                        }
                      />
                      <RechartsTooltip
                        formatter={(val: unknown) => [
                          metricaGrafico === 'quantidade'
                            ? String(val)
                            : new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(Number(val) || 0),
                          metricaGrafico === 'valor_liquido'
                            ? 'Faturamento'
                            : metricaGrafico === 'custo_total'
                              ? 'Custo Total'
                              : metricaGrafico,
                        ]}
                      />
                      <Bar
                        dataKey={metricaGrafico}
                        name={metricaGrafico === 'valor_liquido' ? 'Faturamento Líquido' : 'Total'}
                        fill="#4f46e5"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <LineChart data={resultado.dadosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="rotulo"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) =>
                          metricaGrafico === 'quantidade'
                            ? String(v)
                            : `R$${(v / 1000).toFixed(0)}k`
                        }
                      />
                      <RechartsTooltip
                        formatter={(val: unknown) => [
                          metricaGrafico === 'quantidade'
                            ? String(val)
                            : new Intl.NumberFormat('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              }).format(Number(val) || 0),
                          metricaGrafico,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey={metricaGrafico}
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* RESULTADO EM TABELA COM SUBTOTAIS E TOTAL GERAL                           */}
      {/* ========================================================================= */}
      <Card className="border-slate-200 overflow-hidden shadow-xs">
        <CardHeader className="p-4 pb-2 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Resultado Sintetizado do Relatório</span>
                {resultado && (
                  <Badge variant="outline" className="text-[10px] bg-white text-slate-700">
                    {resultado.totalLinhas} linhas
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Agrupado por:{' '}
                {agrupamentos
                  .map((a) =>
                    base === 'itens_vendidos'
                      ? DICIONARIO_AGRUPAMENTOS_VENDAS[
                          a as keyof typeof DICIONARIO_AGRUPAMENTOS_VENDAS
                        ]
                      : DICIONARIO_AGRUPAMENTOS_COMPRAS[
                          a as keyof typeof DICIONARIO_AGRUPAMENTOS_COMPRAS
                        ],
                  )
                  .join(' → ')}
              </p>
            </div>

            <div className="text-xs text-slate-500">
              Clique no cabeçalho das colunas para ordenar
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {erroConsulta ? (
            <div className="p-8 text-center text-rose-600 space-y-2">
              <AlertCircle className="h-8 w-8 mx-auto text-rose-500" />
              <p className="font-semibold text-sm">{erroConsulta}</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tente ajustar os filtros ou selecionar um intervalo de datas menor.
              </p>
            </div>
          ) : !resultado ? (
            <div className="p-12 text-center text-slate-400">
              Clique em &quot;Aplicar e Gerar Relatório&quot; para processar os dados.
            </div>
          ) : resultado.linhas.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              Nenhum registro localizado para os filtros informados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th
                      onClick={() => handleOrdenar('rotulo')}
                      className="p-3 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Agrupamento / Descrição</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>

                    {resultado.valores.map((vKey) => {
                      const def =
                        base === 'itens_vendidos'
                          ? DICIONARIO_VALORES_VENDAS[
                              vKey as keyof typeof DICIONARIO_VALORES_VENDAS
                            ]
                          : DICIONARIO_VALORES_COMPRAS[
                              vKey as keyof typeof DICIONARIO_VALORES_COMPRAS
                            ]
                      if (!def) return null

                      return (
                        <th
                          key={vKey}
                          onClick={() => handleOrdenar(vKey)}
                          className="p-3 text-right cursor-pointer hover:bg-slate-200 transition-colors select-none"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>{def.label}</span>
                            <ArrowUpDown className="h-3 w-3 text-slate-400" />
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {linhasExibicao.map((linha, lIdx) => {
                    const rec = linha.metricas as Record<string, number | null | undefined>
                    const ehSubtotal = linha.eh_subtotal
                    const recuo = (linha.nivel - 1) * 18

                    return (
                      <tr
                        key={lIdx}
                        className={`transition-colors ${
                          ehSubtotal
                            ? 'bg-slate-50/90 font-semibold text-slate-900 border-t border-slate-200'
                            : 'hover:bg-slate-50/50 text-slate-700'
                        }`}
                      >
                        <td className="p-2.5">
                          <div
                            className="flex items-center gap-1.5"
                            style={{ paddingLeft: `${recuo}px` }}
                          >
                            {linha.nivel > 1 && (
                              <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                            )}
                            <span className={ehSubtotal ? 'font-bold' : ''}>{linha.rotulo}</span>
                            {ehSubtotal && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1 py-0 bg-slate-200 text-slate-700 font-normal ml-1"
                              >
                                Subtotal
                              </Badge>
                            )}
                          </div>
                        </td>

                        {resultado.valores.map((vKey) => {
                          const def =
                            base === 'itens_vendidos'
                              ? DICIONARIO_VALORES_VENDAS[
                                  vKey as keyof typeof DICIONARIO_VALORES_VENDAS
                                ]
                              : DICIONARIO_VALORES_COMPRAS[
                                  vKey as keyof typeof DICIONARIO_VALORES_COMPRAS
                                ]
                          if (!def) return null

                          const val = rec[vKey]

                          return (
                            <td
                              key={vKey}
                              className={`p-2.5 text-right font-mono ${
                                ehSubtotal ? 'font-bold text-slate-900' : ''
                              }`}
                            >
                              {formatarValor(val, def.formato)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>

                {/* TOTAL GERAL */}
                {resultado.totalGeral && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-950">
                      <td className="p-3 uppercase tracking-wider">TOTAL GERAL CONSOLIDADO</td>

                      {resultado.valores.map((vKey) => {
                        const def =
                          base === 'itens_vendidos'
                            ? DICIONARIO_VALORES_VENDAS[
                                vKey as keyof typeof DICIONARIO_VALORES_VENDAS
                              ]
                            : DICIONARIO_VALORES_COMPRAS[
                                vKey as keyof typeof DICIONARIO_VALORES_COMPRAS
                              ]
                        if (!def) return null

                        const tot = (
                          resultado.totalGeral as Record<string, number | null | undefined>
                        )[vKey]

                        return (
                          <td key={vKey} className="p-3 text-right font-mono">
                            {formatarValor(tot, def.formato)}
                          </td>
                        )
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* DIÁLOGO / MODAL PARA SALVAR ESTE RELATÓRIO                                */}
      {/* ========================================================================= */}
      <Dialog open={modalSalvarAberto} onOpenChange={setModalSalvarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-slate-900">
              <BookmarkPlus className="h-4 w-4 text-indigo-600" />
              Salvar Relatório Personalizado
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Salve esta combinação de base, agrupamentos, métricas e filtros para acessá-la
              diretamente na Central de Relatórios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">
                Nome do Relatório <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="text"
                value={nomeRelatorioSalvar}
                onChange={(e) => setNomeRelatorioSalvar(e.target.value)}
                placeholder="Ex.: Vendas por Marca e Mês - SP"
                className="h-8 text-xs bg-white"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Descrição / Finalidade</Label>
              <Input
                type="text"
                value={descricaoRelatorioSalvar}
                onChange={(e) => setDescricaoRelatorioSalvar(e.target.value)}
                placeholder="Ex.: Acompanhamento mensal de marcas para a filial SP"
                className="h-8 text-xs bg-white"
              />
            </div>

            <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={compartilhadoSalvar}
                  onCheckedChange={(c) => setCompartilhadoSalvar(Boolean(c))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5 text-xs">
                  <span className="font-semibold text-slate-800">
                    Compartilhar com toda a empresa
                  </span>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Quando marcado, este relatório aparecerá na seção &quot;Relatórios da
                    empresa&quot; para todos os colaboradores com acesso ao módulo correspondente.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalSalvarAberto(false)}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarSalvarRelatorio}
              disabled={salvandoRelatorio}
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {salvandoRelatorio ? 'Salvando...' : 'Salvar Relatório'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RelatorioPersonalizadoPage
