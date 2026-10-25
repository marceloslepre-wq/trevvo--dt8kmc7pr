import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText,
  Calendar,
  Download,
  ChevronRight,
  ChevronDown,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldAlert,
  Building2,
  CalendarDays,
  Columns,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  RegimeDre,
  RelatorioDreCompleto,
  LinhaDreEstruturada,
  ContaAnaliticaDre,
  LancamentoDreItem,
  obterDreGerencial,
  exportarDreCsv,
} from '@/services/dre'

export type ModoVisualizacaoDre = 'normal' | 'comparar_empresas' | 'comparar_meses'

interface MesComparativo {
  chave: string // "YYYY-MM"
  rotulo: string // "MM/AAAA" (ex: "05/2024")
  dataInicio: string
  dataFim: string
  dados: RelatorioDreCompleto | null
}

interface EmpresaComparativa {
  id: string
  nome: string
  dados: RelatorioDreCompleto | null
}

export const DrePage: React.FC = () => {
  const { empresas, empresaAtiva } = useEmpresaAtiva()
  const { administrador, perfil } = usePermissoes()
  const { toast } = useToast()
  const perfilNome = perfil?.nome || ''

  // Restrição de acesso do requisito: Apenas Administrador e Gerente
  const podeAcessarDre = useMemo(() => {
    if (administrador) return true
    if (!perfilNome) return false
    const norm = perfilNome.toLowerCase().trim()
    return norm.includes('gerente') || norm.includes('administrador') || norm.includes('admin')
  }, [administrador, perfilNome])

  // Usuário tem acesso a mais de uma empresa?
  const temMaisDeUmaEmpresa = useMemo(() => {
    return empresas && empresas.length > 1
  }, [empresas])

  // Seletor de modo da DRE
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacaoDre>('normal')

  // Se o usuário mudar de modo para comparar_empresas mas não puder mais, volta para normal
  useEffect(() => {
    if (modoVisualizacao === 'comparar_empresas' && !temMaisDeUmaEmpresa) {
      setModoVisualizacao('normal')
    }
  }, [modoVisualizacao, temMaisDeUmaEmpresa])

  // Período padrão: primeiro e último dia do mês corrente
  const hoje = useMemo(() => new Date(), [])
  const primeiroDiaMes = useMemo(
    () => new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10),
    [hoje],
  )
  const ultimoDiaMes = useMemo(
    () => new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10),
    [hoje],
  )

  const [dataInicio, setDataInicio] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(ultimoDiaMes)
  const [regime, setRegime] = useState<RegimeDre>('Competencia')
  const [custoPeloEstoque, setCustoPeloEstoque] = useState<boolean>(false)
  const [carregando, setCarregando] = useState(false)
  const [dadosDre, setDadosDre] = useState<RelatorioDreCompleto | null>(null)

  // Seleção de empresas para o modo "Comparar empresas"
  const [empresasSelecionadasIds, setEmpresasSelecionadasIds] = useState<string[]>(() => {
    if (empresaAtiva?.id) return [empresaAtiva.id]
    return []
  })

  // Sincroniza empresas selecionadas quando a lista de empresas carregar
  useEffect(() => {
    if (empresas.length > 0 && empresasSelecionadasIds.length === 0) {
      if (empresaAtiva?.id) {
        setEmpresasSelecionadasIds([empresaAtiva.id])
      } else {
        setEmpresasSelecionadasIds(empresas.map((e) => e.id))
      }
    }
  }, [empresas, empresaAtiva?.id, empresasSelecionadasIds.length])

  // Empresa selecionada para o modo "Comparar meses" (padrão: empresa ativa)
  const [empresaCompararMesesId, setEmpresaCompararMesesId] = useState<string>(
    empresaAtiva?.id || '',
  )

  useEffect(() => {
    if (empresaAtiva?.id && !empresaCompararMesesId) {
      setEmpresaCompararMesesId(empresaAtiva.id)
    }
  }, [empresaAtiva?.id, empresaCompararMesesId])

  // Estado dos dados comparativos por empresa
  const [dadosComparativoEmpresas, setDadosComparativoEmpresas] = useState<EmpresaComparativa[]>([])

  // Estado dos dados comparativos dos últimos 12 meses
  const [dadosComparativoMeses, setDadosComparativoMeses] = useState<MesComparativo[]>([])

  // Controle de drill-down: quais grupos estão expandidos
  const [gruposExpandidos, setGruposExpandidos] = useState<Record<string, boolean>>({
    receita_bruta: true,
    custo_mercadorias: true,
    despesas_operacionais: true,
  })

  // Modal de detalhamento dos lançamentos de uma conta analítica específica
  const [modalContaAberta, setModalContaAberta] = useState<ContaAnaliticaDre | null>(null)
  const [filtroBuscaLancamento, setFiltroBuscaLancamento] = useState('')

  // 1. Carregamento do Modo Normal
  const carregarRelatorioNormal = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const rel = await obterDreGerencial({
        empresaId: empresaAtiva.id,
        dataInicio,
        dataFim,
        regime,
        custoPeloEstoque,
      })
      setDadosDre(rel)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar relatório da DRE'
      toast({
        title: 'Erro ao gerar DRE',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, dataInicio, dataFim, regime, custoPeloEstoque, toast])

  // 2. Carregamento do Modo Comparar Empresas
  const carregarRelatorioCompararEmpresas = useCallback(async () => {
    if (empresasSelecionadasIds.length === 0) {
      setDadosComparativoEmpresas([])
      return
    }
    setCarregando(true)
    try {
      const promessas = empresasSelecionadasIds.map(async (empId) => {
        const emp = empresas.find((e) => e.id === empId)
        const nome = emp ? emp.nome_fantasia || emp.razao_social : `Empresa ${empId}`
        try {
          const rel = await obterDreGerencial({
            empresaId: empId,
            dataInicio,
            dataFim,
            regime,
            custoPeloEstoque,
          })
          return { id: empId, nome, dados: rel }
        } catch {
          return { id: empId, nome, dados: null }
        }
      })

      const resultados = await Promise.all(promessas)
      setDadosComparativoEmpresas(resultados)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao comparar DRE das empresas'
      toast({
        title: 'Erro ao gerar DRE comparativa',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresasSelecionadasIds, empresas, dataInicio, dataFim, regime, custoPeloEstoque, toast])

  // 3. Carregamento do Modo Comparar Meses (últimos 12 meses da empresa selecionada)
  const carregarRelatorioCompararMeses = useCallback(async () => {
    const targetEmpId = empresaCompararMesesId || empresaAtiva?.id
    if (!targetEmpId) return

    setCarregando(true)
    try {
      // Montar os últimos 12 meses cronológicos (do mais antigo para o mais recente)
      const listaMeses: MesComparativo[] = []
      const dataRef = new Date()

      for (let i = 11; i >= 0; i--) {
        const d = new Date(dataRef.getFullYear(), dataRef.getMonth() - i, 1)
        const ano = d.getFullYear()
        const mes = d.getMonth() + 1
        const mesStr = mes < 10 ? `0${mes}` : `${mes}`
        const chave = `${ano}-${mesStr}`
        const rotulo = `${mesStr}/${ano}`

        const dIni = new Date(ano, mes - 1, 1).toISOString().slice(0, 10)
        const dFim = new Date(ano, mes, 0).toISOString().slice(0, 10)

        listaMeses.push({
          chave,
          rotulo,
          dataInicio: dIni,
          dataFim: dFim,
          dados: null,
        })
      }

      // Buscar DRE para cada mês em paralelo
      const promessas = listaMeses.map(async (m) => {
        try {
          const rel = await obterDreGerencial({
            empresaId: targetEmpId,
            dataInicio: m.dataInicio,
            dataFim: m.dataFim,
            regime,
            custoPeloEstoque,
          })
          return { ...m, dados: rel }
        } catch {
          return { ...m, dados: null }
        }
      })

      const resolvidos = await Promise.all(promessas)
      setDadosComparativoMeses(resolvidos)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao comparar os meses da DRE'
      toast({
        title: 'Erro ao comparar meses',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaCompararMesesId, empresaAtiva?.id, regime, custoPeloEstoque, toast])

  // Carrega o relatório apropriado conforme o modo selecionado
  const recarregarModoAtual = useCallback(() => {
    if (modoVisualizacao === 'normal') {
      carregarRelatorioNormal()
    } else if (modoVisualizacao === 'comparar_empresas') {
      carregarRelatorioCompararEmpresas()
    } else if (modoVisualizacao === 'comparar_meses') {
      carregarRelatorioCompararMeses()
    }
  }, [
    modoVisualizacao,
    carregarRelatorioNormal,
    carregarRelatorioCompararEmpresas,
    carregarRelatorioCompararMeses,
  ])

  useEffect(() => {
    if (podeAcessarDre) {
      recarregarModoAtual()
    }
  }, [recarregarModoAtual, podeAcessarDre])

  const alternarExpansaoGrupo = (id: string) => {
    setGruposExpandidos((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Atalhos de período rápido
  const setMesAtual = () => {
    const dIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
    const dFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)
    setDataInicio(dIni)
    setDataFim(dFim)
  }

  const setMesAnterior = () => {
    const dIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().slice(0, 10)
    const dFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().slice(0, 10)
    setDataInicio(dIni)
    setDataFim(dFim)
  }

  const setAnoAtual = () => {
    const dIni = new Date(hoje.getFullYear(), 0, 1).toISOString().slice(0, 10)
    const dFim = new Date(hoje.getFullYear(), 11, 31).toISOString().slice(0, 10)
    setDataInicio(dIni)
    setDataFim(dFim)
  }

  // Formatação em moeda pt-BR
  const formatMoeda = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-'
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatPercentual = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-'
    const sinal = val > 0 ? '+' : ''
    return `${sinal}${val.toFixed(1)}%`
  }

  // Exportação CSV do modo Normal ou Comparativo
  const handleExportarCsv = () => {
    if (modoVisualizacao === 'normal') {
      if (!dadosDre) return
      try {
        const csvContent = exportarDreCsv(dadosDre)
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute(
          'download',
          `dre_gerencial_${regime.toLowerCase()}_${dataInicio}_a_${dataFim}.csv`,
        )
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: 'DRE exportada',
          description: 'O arquivo CSV (pt-BR) foi gerado e baixado com sucesso.',
        })
      } catch {
        toast({
          title: 'Erro na exportação',
          description: 'Não foi possível gerar o arquivo CSV.',
          variant: 'destructive',
        })
      }
    } else if (modoVisualizacao === 'comparar_empresas') {
      if (dadosComparativoEmpresas.length === 0) return
      try {
        const cabecalho = [
          'Estrutura',
          ...dadosComparativoEmpresas.flatMap((e) => [`${e.nome} (R$)`, `${e.nome} (% V)`]),
          'TOTAL GERAL (R$)',
          '% VERTICAL TOTAL',
        ].join(';')

        const linhasCsv: string[] = [
          `DRE COMPARATIVA ENTRE EMPRESAS - REGIME ${regime.toUpperCase()}`,
          `Periodo: ${dataInicio} ate ${dataFim}`,
          '',
          cabecalho,
        ]

        // Linhas modelo tiradas do primeiro resultado válido
        const modeloLinhas = dadosComparativoEmpresas.find((e) => e.dados)?.dados?.linhas || []
        for (let idx = 0; idx < modeloLinhas.length; idx++) {
          const lRef = modeloLinhas[idx]
          const partes: (string | number)[] = [`"${lRef.titulo}"`]
          let somaValor = 0

          // Valores por empresa
          for (const ec of dadosComparativoEmpresas) {
            const linhaEmp = ec.dados?.linhas[idx]
            const val = linhaEmp?.valorPeriodoAtual || 0
            const pct = linhaEmp?.percentualReceitaLiquidaAtual ?? null
            somaValor += val
            partes.push(val.toFixed(2).replace('.', ','))
            partes.push(pct !== null ? `${pct.toFixed(1)}%` : '-')
          }

          // Total consolidado
          // Calcula receita líquida consolidada para o % vertical do total
          const totalRecLiq = dadosComparativoEmpresas.reduce(
            (acc, curr) => acc + (curr.dados?.totais.receitaLiquida || 0),
            0,
          )
          const pctTotal =
            totalRecLiq > 0 ? `${((somaValor / totalRecLiq) * 100).toFixed(1)}%` : '-'

          partes.push(somaValor.toFixed(2).replace('.', ','))
          partes.push(pctTotal)
          linhasCsv.push(partes.join(';'))
        }

        const blob = new Blob(['\ufeff' + linhasCsv.join('\r\n')], {
          type: 'text/csv;charset=utf-8;',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `dre_comparativa_empresas_${dataInicio}_a_${dataFim}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: 'DRE comparativa exportada',
          description: 'Arquivo CSV com a comparação entre empresas gerado com sucesso.',
        })
      } catch {
        toast({
          title: 'Erro na exportação',
          description: 'Não foi possível gerar o arquivo CSV comparativo.',
          variant: 'destructive',
        })
      }
    } else {
      // Modo Comparar Meses
      if (dadosComparativoMeses.length === 0) return
      try {
        const empNome =
          empresas.find((e) => e.id === (empresaCompararMesesId || empresaAtiva?.id))
            ?.nome_fantasia || 'Empresa'
        const cabecalho = ['Estrutura', ...dadosComparativoMeses.map((m) => m.rotulo)].join(';')

        const linhasCsv: string[] = [
          `DRE COMPARATIVA ULTIMOS 12 MESES - ${empNome.toUpperCase()} - REGIME ${regime.toUpperCase()}`,
          '',
          cabecalho,
        ]

        const modeloLinhas = dadosComparativoMeses.find((m) => m.dados)?.dados?.linhas || []
        for (let idx = 0; idx < modeloLinhas.length; idx++) {
          const lRef = modeloLinhas[idx]
          const partes: (string | number)[] = [`"${lRef.titulo}"`]
          for (const m of dadosComparativoMeses) {
            const linhaMes = m.dados?.linhas[idx]
            const val = linhaMes?.valorPeriodoAtual || 0
            partes.push(val.toFixed(2).replace('.', ','))
          }
          linhasCsv.push(partes.join(';'))
        }

        const blob = new Blob(['\ufeff' + linhasCsv.join('\r\n')], {
          type: 'text/csv;charset=utf-8;',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `dre_comparativa_12_meses_${regime.toLowerCase()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: 'DRE comparativa exportada',
          description: 'Arquivo CSV com a comparação dos últimos 12 meses gerado com sucesso.',
        })
      } catch {
        toast({
          title: 'Erro na exportação',
          description: 'Não foi possível exportar a comparação de meses.',
          variant: 'destructive',
        })
      }
    }
  }

  // Linhas de modelo para renderizar as tabelas comparativas
  const linhasEstruturaModelo: LinhaDreEstruturada[] = useMemo(() => {
    if (modoVisualizacao === 'comparar_empresas') {
      const primeiro = dadosComparativoEmpresas.find((e) => e.dados)
      return primeiro?.dados?.linhas || []
    }
    if (modoVisualizacao === 'comparar_meses') {
      const primeiro = dadosComparativoMeses.find((m) => m.dados)
      return primeiro?.dados?.linhas || []
    }
    return dadosDre?.linhas || []
  }, [modoVisualizacao, dadosComparativoEmpresas, dadosComparativoMeses, dadosDre])

  // Receita líquida total consolidada para calcular % vertical no total do modo comparar empresas
  const receitaLiquidaTotalConsolidada = useMemo(() => {
    if (modoVisualizacao !== 'comparar_empresas') return 0
    return dadosComparativoEmpresas.reduce(
      (acc, curr) => acc + (curr.dados?.totais.receitaLiquida || 0),
      0,
    )
  }, [modoVisualizacao, dadosComparativoEmpresas])

  // Tela de Acesso Negado se não for Administrador ou perfil Gerente
  if (!podeAcessarDre) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-amber-600" />
              <div>
                <CardTitle className="text-lg text-amber-900">Acesso Restrito à DRE</CardTitle>
                <CardDescription className="text-amber-700">
                  A Demonstração do Resultado do Exercício Gerencial contém informações financeiras
                  e estratégicas confidenciais.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-800">
            <p>
              O acesso a esta tela é restrito aos perfis <strong>Administrador</strong> e{' '}
              <strong>Gerente</strong>.
            </p>
            <p className="text-xs text-amber-600">
              Seu perfil atual: <span className="font-semibold">{perfilNome || 'Usuário'}</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileText className="h-7 w-7 text-emerald-600" />
            Demonstração do Resultado (DRE Gerencial)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Análise estruturada de receitas, custos, despesas operacionais e resultado líquido.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={recarregarModoAtual}
            disabled={carregando}
            className="text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportarCsv}
            disabled={carregando}
            className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Seletor de Modo da DRE (Prompt 8.4) */}
      <Card className="border-slate-200 shadow-xs bg-slate-50/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Columns className="h-4 w-4 text-slate-500" />
                Modo de visualização:
              </span>
              <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200">
                <Button
                  type="button"
                  variant={modoVisualizacao === 'normal' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setModoVisualizacao('normal')}
                  className={`text-xs h-7 px-3 ${
                    modoVisualizacao === 'normal'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  DRE Normal
                </Button>

                {temMaisDeUmaEmpresa && (
                  <Button
                    type="button"
                    variant={modoVisualizacao === 'comparar_empresas' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setModoVisualizacao('comparar_empresas')}
                    className={`text-xs h-7 px-3 gap-1.5 ${
                      modoVisualizacao === 'comparar_empresas'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    <Building2 className="h-3 w-3" />
                    Comparar empresas
                  </Button>
                )}

                <Button
                  type="button"
                  variant={modoVisualizacao === 'comparar_meses' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setModoVisualizacao('comparar_meses')}
                  className={`text-xs h-7 px-3 gap-1.5 ${
                    modoVisualizacao === 'comparar_meses'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <CalendarDays className="h-3 w-3" />
                  Comparar meses (12m)
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {modoVisualizacao === 'normal' && (
                <span>
                  Exibindo visão detalhada com período atual vs. anterior da empresa ativa.
                </span>
              )}
              {modoVisualizacao === 'comparar_empresas' && (
                <span>Comparação lado a lado com % vertical das filiais e total consolidado.</span>
              )}
              {modoVisualizacao === 'comparar_meses' && (
                <span>Evolução dos últimos 12 meses lado a lado para apuração de tendência.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Observação Fixa / Dinâmica Conforme Requisito */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Aviso Gerencial:</strong>{' '}
          {custoPeloEstoque
            ? dadosDre?.observacaoCustoEstoque ||
              'Custo das mercadorias calculado pela soma do custo das saídas por VENDA menos entradas por DEVOLUCAO_VENDA no período (custo médio). As compras de mercadorias foram excluídas da DRE (direcionadas ao estoque).'
            : 'O custo das mercadorias nesta visão baseia-se nas compras pagas ou lançadas no período financeiro. Marque "Custo das mercadorias pelo estoque" abaixo para apurar o CMV real do estoque.'}
        </p>
      </div>

      {/* Barra de Filtros: Período, Regime e Atalhos */}
      <Card className="shadow-xs border-slate-200">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
            {/* Regime */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Regime Contábil *</Label>
              <Select value={regime} onValueChange={(val) => setRegime(val as RegimeDre)}>
                <SelectTrigger className="text-xs h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Competencia">Competência (Data de emissão/fato)</SelectItem>
                  <SelectItem value="Caixa">Caixa (Data do efetivo pagamento)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* No modo "Comparar meses", a DRE apura automaticamente os últimos 12 meses fechados */}
            {modoVisualizacao === 'comparar_meses' ? (
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Empresa para Análise *
                </Label>
                <Select
                  value={empresaCompararMesesId || empresaAtiva?.id || ''}
                  onValueChange={(val) => setEmpresaCompararMesesId(val)}
                >
                  <SelectTrigger className="text-xs h-9 bg-white">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                {/* Data Início */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Data Inicial *</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                {/* Data Fim */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Data Final *</Label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>
              </>
            )}

            {/* Atalhos Rápidos de Período (apenas nos modos normal e comparar empresas) */}
            {modoVisualizacao !== 'comparar_meses' && (
              <div className="lg:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-slate-500">
                  Períodos Pré-definidos
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setMesAtual}
                    className="text-xs h-9 flex-1"
                  >
                    Mês Atual
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setMesAnterior}
                    className="text-xs h-9 flex-1"
                  >
                    Mês Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={setAnoAtual}
                    className="text-xs h-9 flex-1"
                  >
                    Ano {hoje.getFullYear()}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Seleção de Múltiplas Empresas quando no modo Comparar Empresas */}
          {modoVisualizacao === 'comparar_empresas' && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <Label className="text-xs font-semibold text-slate-700 block mb-2">
                Empresas a comparar (selecione as colunas desejadas):
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                {empresas.map((e) => {
                  const checked = empresasSelecionadasIds.includes(e.id)
                  return (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          if (c) {
                            setEmpresasSelecionadasIds((prev) => [...prev, e.id])
                          } else {
                            if (empresasSelecionadasIds.length === 1) {
                              toast({
                                title: 'Seleção obrigatória',
                                description: 'Mantenha ao menos uma empresa selecionada.',
                              })
                              return
                            }
                            setEmpresasSelecionadasIds((prev) => prev.filter((id) => id !== e.id))
                          }
                        }}
                      />
                      <span className="font-medium text-slate-800">
                        {e.nome_fantasia || e.razao_social}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Opção "Custo das mercadorias pelo estoque" */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800 select-none">
              <input
                type="checkbox"
                checked={custoPeloEstoque}
                onChange={(e) => setCustoPeloEstoque(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <span>
                <strong>Custo das mercadorias pelo estoque:</strong> apurar CMV pelas movimentações
                de vendas e devoluções (estoque) em vez das compras financeiras.
              </span>
            </label>
          </div>

          {/* Comparativo de Datas Informadas (Modo Normal) */}
          {modoVisualizacao === 'normal' && dadosDre && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  <strong>Período Analisado:</strong>{' '}
                  {new Date(dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} até{' '}
                  {new Date(dataFim + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">vs.</span>
                <span>
                  <strong>Período Anterior Equivalente:</strong>{' '}
                  {new Date(dadosDre.periodoAnterior.dataInicio + 'T00:00:00').toLocaleDateString(
                    'pt-BR',
                  )}{' '}
                  até{' '}
                  {new Date(dadosDre.periodoAnterior.dataFim + 'T00:00:00').toLocaleDateString(
                    'pt-BR',
                  )}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cartões de Destaque Rápido (Exibidos no modo Normal) */}
      {modoVisualizacao === 'normal' && dadosDre && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Receita Líquida
              </span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {formatMoeda(dadosDre.totais.receitaLiquida)}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                <span>Bruta: {formatMoeda(dadosDre.totais.receitaBruta)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Custos de Mercadorias
              </span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {formatMoeda(dadosDre.totais.custoMercadorias)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Compras do período ({regime})</div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Lucro Bruto
              </span>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  dadosDre.totais.lucroBruto >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {formatMoeda(dadosDre.totais.lucroBruto)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Margem:{' '}
                {dadosDre.totais.receitaLiquida > 0
                  ? ((dadosDre.totais.lucroBruto / dadosDre.totais.receitaLiquida) * 100).toFixed(
                      1,
                    ) + '%'
                  : '-'}
              </div>
            </CardContent>
          </Card>

          <Card
            className={`border ${
              dadosDre.totais.resultadoPeriodo >= 0
                ? 'border-emerald-200 bg-emerald-50/30'
                : 'border-rose-200 bg-rose-50/30'
            }`}
          >
            <CardContent className="p-4">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Resultado do Período
              </span>
              <div
                className={`text-2xl font-bold font-mono mt-1 ${
                  dadosDre.totais.resultadoPeriodo >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatMoeda(dadosDre.totais.resultadoPeriodo)}
              </div>
              <div className="text-[11px] font-semibold mt-1">
                {dadosDre.totais.resultadoPeriodo >= 0 ? (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Lucro Líquido
                  </span>
                ) : (
                  <span className="text-rose-700 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> Prejuízo Líquido
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. MODO NORMAL: DRE TRADICIONAL COM DRILL-DOWN           */}
      {/* ======================================================== */}
      {modoVisualizacao === 'normal' && (
        <Card className="border-slate-200">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Demonstração do Resultado - Estrutura Padrão
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-slate-600 hover:text-slate-900"
                onClick={() => {
                  const todosAbertos = Object.values(gruposExpandidos).every(Boolean)
                  setGruposExpandidos({
                    receita_bruta: !todosAbertos,
                    custo_mercadorias: !todosAbertos,
                    despesas_operacionais: !todosAbertos,
                    deducoes_receita: !todosAbertos,
                    resultado_financeiro: !todosAbertos,
                    outras_receitas_despesas: !todosAbertos,
                  })
                }}
              >
                Expandir/Recolher todos
              </Button>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="w-[38%] font-bold text-slate-800">
                    Estrutura de Resultados
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-800 w-[16%]">
                    Período Atual (R$)
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-600 w-[10%]">
                    % Margem
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-800 w-[16%]">
                    Período Anterior (R$)
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-600 w-[10%]">
                    % Margem Ant.
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-800 w-[10%]">
                    Variação
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!dadosDre || dadosDre.linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                      {carregando
                        ? 'Calculando demonstração gerencial...'
                        : 'Nenhum dado encontrado para o período.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  dadosDre.linhas.map((linha: LinhaDreEstruturada) => {
                    const expandido = Boolean(gruposExpandidos[linha.id])
                    const temContas = linha.contas && linha.contas.length > 0

                    return (
                      <React.Fragment key={linha.id}>
                        {/* Linha de Grupo ou Subtotal */}
                        <TableRow
                          onClick={() => temContas && alternarExpansaoGrupo(linha.id)}
                          className={`transition-colors ${
                            linha.ehSubtotal
                              ? 'bg-slate-100/90 font-bold border-y-2 border-slate-300 hover:bg-slate-200/60'
                              : temContas
                                ? 'hover:bg-slate-50/90 cursor-pointer font-semibold'
                                : 'hover:bg-slate-50/50 font-semibold'
                          }`}
                        >
                          <TableCell className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              {temContas ? (
                                <button
                                  type="button"
                                  className="p-0.5 rounded-sm hover:bg-slate-200 text-slate-500"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    alternarExpansaoGrupo(linha.id)
                                  }}
                                >
                                  {expandido ? (
                                    <ChevronDown className="h-4 w-4 text-slate-700" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-700" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-4 h-4 ml-1 flex items-center justify-center">
                                  <span className="font-mono text-slate-400 font-bold">
                                    {linha.sinal}
                                  </span>
                                </div>
                              )}

                              <span
                                className={`${
                                  linha.id === 'resultado_periodo'
                                    ? 'text-sm font-black text-slate-900'
                                    : linha.ehSubtotal
                                      ? 'text-xs font-bold text-slate-900'
                                      : 'text-xs text-slate-800'
                                }`}
                              >
                                {linha.titulo}
                              </span>

                              {temContas && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal py-0 px-1 text-slate-500 bg-white"
                                >
                                  {linha.contas.length}{' '}
                                  {linha.contas.length === 1 ? 'conta' : 'contas'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Valor Atual */}
                          <TableCell
                            className={`text-right font-mono py-2.5 px-3 ${
                              linha.id === 'resultado_periodo'
                                ? linha.valorPeriodoAtual >= 0
                                  ? 'text-emerald-700 text-sm font-bold'
                                  : 'text-rose-700 text-sm font-bold'
                                : linha.ehSubtotal
                                  ? 'font-bold text-slate-900'
                                  : 'text-slate-800'
                            }`}
                          >
                            {formatMoeda(linha.valorPeriodoAtual)}
                          </TableCell>

                          {/* Margem Atual */}
                          <TableCell className="text-right font-mono py-2.5 px-3 text-slate-600">
                            {linha.percentualReceitaLiquidaAtual !== null
                              ? `${linha.percentualReceitaLiquidaAtual.toFixed(1)}%`
                              : '-'}
                          </TableCell>

                          {/* Valor Anterior */}
                          <TableCell
                            className={`text-right font-mono py-2.5 px-3 text-slate-600 ${
                              linha.ehSubtotal ? 'font-semibold' : ''
                            }`}
                          >
                            {formatMoeda(linha.valorPeriodoAnterior)}
                          </TableCell>

                          {/* Margem Anterior */}
                          <TableCell className="text-right font-mono py-2.5 px-3 text-slate-500">
                            {linha.percentualReceitaLiquidaAnterior !== null
                              ? `${linha.percentualReceitaLiquidaAnterior.toFixed(1)}%`
                              : '-'}
                          </TableCell>

                          {/* Variação Percentual */}
                          <TableCell className="text-right font-mono py-2.5 px-3">
                            {linha.variacaoPercentual === null ? (
                              <span className="text-slate-400">-</span>
                            ) : linha.variacaoPercentual > 0 ? (
                              <span className="text-emerald-600 font-semibold flex items-center justify-end gap-0.5">
                                <TrendingUp className="h-3 w-3" />
                                {formatPercentual(linha.variacaoPercentual)}
                              </span>
                            ) : linha.variacaoPercentual < 0 ? (
                              <span className="text-rose-600 font-semibold flex items-center justify-end gap-0.5">
                                <TrendingDown className="h-3 w-3" />
                                {formatPercentual(linha.variacaoPercentual)}
                              </span>
                            ) : (
                              <span className="text-slate-500 flex items-center justify-end gap-0.5">
                                <Minus className="h-3 w-3" /> 0.0%
                              </span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Contas Analíticas filhas (Drill-Down 1º nível) */}
                        {expandido &&
                          temContas &&
                          linha.contas.map((conta: ContaAnaliticaDre) => (
                            <TableRow
                              key={conta.id}
                              className="bg-slate-50/40 hover:bg-blue-50/40 transition-colors cursor-pointer"
                              onClick={() => {
                                setModalContaAberta(conta)
                                setFiltroBuscaLancamento('')
                              }}
                            >
                              <TableCell className="py-1.5 pl-9 pr-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[11px] text-slate-500">
                                      {conta.codigo}
                                    </span>
                                    <span className="text-slate-700 hover:text-blue-700 font-medium">
                                      {conta.descricao}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-blue-600 underline flex items-center gap-1 opacity-80 hover:opacity-100">
                                    {conta.lancamentos.length} lanc.
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="text-right font-mono py-1.5 px-3 text-slate-700">
                                {formatMoeda(conta.valorPeriodoAtual)}
                              </TableCell>

                              <TableCell className="text-right font-mono py-1.5 px-3 text-slate-400">
                                -
                              </TableCell>

                              <TableCell className="text-right font-mono py-1.5 px-3 text-slate-500">
                                {formatMoeda(conta.valorPeriodoAnterior)}
                              </TableCell>

                              <TableCell className="text-right font-mono py-1.5 px-3 text-slate-400">
                                -
                              </TableCell>

                              <TableCell className="text-right font-mono py-1.5 px-3 text-[11px]">
                                {conta.variacaoPercentual === null ? (
                                  <span className="text-slate-400">-</span>
                                ) : conta.variacaoPercentual > 0 ? (
                                  <span className="text-emerald-600">
                                    {formatPercentual(conta.variacaoPercentual)}
                                  </span>
                                ) : conta.variacaoPercentual < 0 ? (
                                  <span className="text-rose-600">
                                    {formatPercentual(conta.variacaoPercentual)}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">0.0%</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ======================================================== */}
      {/* 2. MODO COMPARAR EMPRESAS (Prompt 8.4)                   */}
      {/* ======================================================== */}
      {modoVisualizacao === 'comparar_empresas' && (
        <Card className="border-slate-200">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                DRE Comparativa por Empresa (Colunas com % Vertical e Total Consolidado)
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Mesmo cálculo da DRE padrão ({regime}
                {custoPeloEstoque ? ', custo pelo estoque' : ''}), detalhado por filial.
              </CardDescription>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="min-w-[260px] font-bold text-slate-800 sticky left-0 bg-slate-100 z-10 shadow-xs">
                    Estrutura de Resultados
                  </TableHead>

                  {/* Colunas por empresa marcada */}
                  {dadosComparativoEmpresas.map((ec) => (
                    <React.Fragment key={ec.id}>
                      <TableHead className="text-right font-bold text-slate-800 min-w-[130px]">
                        {ec.nome} (R$)
                      </TableHead>
                      <TableHead className="text-right font-bold text-slate-500 min-w-[70px]">
                        % Vert.
                      </TableHead>
                    </React.Fragment>
                  ))}

                  {/* Colunas do Total Consolidado */}
                  <TableHead className="text-right font-bold text-slate-900 bg-slate-200/80 min-w-[140px]">
                    Total Geral (R$)
                  </TableHead>
                  <TableHead className="text-right font-bold text-slate-700 bg-slate-200/80 min-w-[80px]">
                    % Vert. Total
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={2 + dadosComparativoEmpresas.length * 2}
                      className="text-center py-10 text-slate-500"
                    >
                      Processando DRE comparativa das empresas...
                    </TableCell>
                  </TableRow>
                ) : linhasEstruturaModelo.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={2 + dadosComparativoEmpresas.length * 2}
                      className="text-center py-10 text-slate-500"
                    >
                      Nenhum dado encontrado para as empresas no período informado.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhasEstruturaModelo.map((linhaRef, idx) => {
                    let somaLinha = 0

                    return (
                      <TableRow
                        key={linhaRef.id}
                        className={`transition-colors ${
                          linhaRef.ehSubtotal
                            ? 'bg-slate-100/90 font-bold border-y border-slate-300'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {/* Título da Linha */}
                        <TableCell
                          className={`py-2 px-3 sticky left-0 z-10 shadow-xs ${
                            linhaRef.ehSubtotal ? 'bg-slate-100 font-bold' : 'bg-white font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-400 font-bold text-[11px] w-3">
                              {linhaRef.sinal}
                            </span>
                            <span
                              className={
                                linhaRef.id === 'resultado_periodo'
                                  ? 'text-xs font-black text-slate-900'
                                  : linhaRef.ehSubtotal
                                    ? 'text-xs font-bold text-slate-900'
                                    : 'text-xs text-slate-800'
                              }
                            >
                              {linhaRef.titulo}
                            </span>
                          </div>
                        </TableCell>

                        {/* Colunas de cada Empresa */}
                        {dadosComparativoEmpresas.map((ec) => {
                          const l = ec.dados?.linhas[idx]
                          const valor = l?.valorPeriodoAtual || 0
                          somaLinha += valor
                          const pct = l?.percentualReceitaLiquidaAtual

                          return (
                            <React.Fragment key={ec.id}>
                              <TableCell
                                className={`text-right font-mono py-2 px-3 ${
                                  linhaRef.id === 'resultado_periodo'
                                    ? valor >= 0
                                      ? 'text-emerald-700 font-bold'
                                      : 'text-rose-700 font-bold'
                                    : linhaRef.ehSubtotal
                                      ? 'font-bold text-slate-900'
                                      : 'text-slate-800'
                                }`}
                              >
                                {formatMoeda(valor)}
                              </TableCell>
                              <TableCell className="text-right font-mono py-2 px-2 text-[11px] text-slate-500">
                                {pct !== null && pct !== undefined ? `${pct.toFixed(1)}%` : '-'}
                              </TableCell>
                            </React.Fragment>
                          )
                        })}

                        {/* Coluna Total Consolidado */}
                        <TableCell
                          className={`text-right font-mono py-2 px-3 bg-slate-100/50 ${
                            linhaRef.id === 'resultado_periodo'
                              ? somaLinha >= 0
                                ? 'text-emerald-700 font-black'
                                : 'text-rose-700 font-black'
                              : 'font-bold text-slate-900'
                          }`}
                        >
                          {formatMoeda(somaLinha)}
                        </TableCell>

                        {/* % Vertical Total */}
                        <TableCell className="text-right font-mono py-2 px-2 bg-slate-100/50 text-[11px] font-semibold text-slate-700">
                          {receitaLiquidaTotalConsolidada > 0
                            ? `${((somaLinha / receitaLiquidaTotalConsolidada) * 100).toFixed(1)}%`
                            : '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ======================================================== */}
      {/* 3. MODO COMPARAR MESES: ÚLTIMOS 12 MESES (Prompt 8.4)     */}
      {/* ======================================================== */}
      {modoVisualizacao === 'comparar_meses' && (
        <Card className="border-slate-200">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                DRE Comparativa Mensal (Últimos 12 Meses Lado a Lado)
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Acompanhe a série histórica da empresa escolhida no regime {regime.toLowerCase()}.
              </CardDescription>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="min-w-[260px] font-bold text-slate-800 sticky left-0 bg-slate-100 z-10 shadow-xs">
                    Estrutura de Resultados
                  </TableHead>

                  {/* 12 colunas de meses */}
                  {dadosComparativoMeses.map((m) => (
                    <TableHead
                      key={m.chave}
                      className="text-right font-bold text-slate-800 min-w-[110px]"
                    >
                      {m.rotulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={1 + dadosComparativoMeses.length}
                      className="text-center py-10 text-slate-500"
                    >
                      Calculando últimos 12 meses da DRE...
                    </TableCell>
                  </TableRow>
                ) : linhasEstruturaModelo.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={1 + dadosComparativoMeses.length}
                      className="text-center py-10 text-slate-500"
                    >
                      Nenhum dado apurado para o período de 12 meses.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhasEstruturaModelo.map((linhaRef, idx) => (
                    <TableRow
                      key={linhaRef.id}
                      className={`transition-colors ${
                        linhaRef.ehSubtotal
                          ? 'bg-slate-100/90 font-bold border-y border-slate-300'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      {/* Título da Linha */}
                      <TableCell
                        className={`py-2 px-3 sticky left-0 z-10 shadow-xs ${
                          linhaRef.ehSubtotal ? 'bg-slate-100 font-bold' : 'bg-white font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-400 font-bold text-[11px] w-3">
                            {linhaRef.sinal}
                          </span>
                          <span
                            className={
                              linhaRef.id === 'resultado_periodo'
                                ? 'text-xs font-black text-slate-900'
                                : linhaRef.ehSubtotal
                                  ? 'text-xs font-bold text-slate-900'
                                  : 'text-xs text-slate-800'
                            }
                          >
                            {linhaRef.titulo}
                          </span>
                        </div>
                      </TableCell>

                      {/* 12 colunas */}
                      {dadosComparativoMeses.map((m) => {
                        const l = m.dados?.linhas[idx]
                        const valor = l?.valorPeriodoAtual || 0

                        return (
                          <TableCell
                            key={m.chave}
                            className={`text-right font-mono py-2 px-3 ${
                              linhaRef.id === 'resultado_periodo'
                                ? valor >= 0
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-rose-700 font-bold'
                                : linhaRef.ehSubtotal
                                  ? 'font-bold text-slate-900'
                                  : 'text-slate-800'
                            }`}
                          >
                            {formatMoeda(valor)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Modal de Drill-Down do 2º Nível: Lançamentos da Conta Analítica (Modo Normal) */}
      <Dialog
        open={Boolean(modalContaAberta)}
        onOpenChange={(aberto) => !aberto && setModalContaAberta(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              Lançamentos Analíticos da Conta
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              {modalContaAberta ? (
                <>
                  <strong className="text-slate-800">
                    {modalContaAberta.codigo} - {modalContaAberta.descricao}
                  </strong>{' '}
                  • Total no período ({regime}):{' '}
                  <strong className="text-emerald-700">
                    {formatMoeda(modalContaAberta.valorPeriodoAtual)}
                  </strong>
                </>
              ) : (
                'Detalhe dos registros'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Busca interna nos lançamentos */}
          <div className="py-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Filtrar por descrição, documento ou contraparte..."
              value={filtroBuscaLancamento}
              onChange={(e) => setFiltroBuscaLancamento(e.target.value)}
              className="h-8 text-xs bg-slate-50"
            />
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md">
            <Table className="text-xs">
              <TableHeader className="bg-slate-100 sticky top-0">
                <TableRow>
                  <TableHead className="w-24">Data</TableHead>
                  <TableHead className="w-24">Origem</TableHead>
                  <TableHead>Descrição / Histórico</TableHead>
                  <TableHead className="w-32">Documento</TableHead>
                  <TableHead className="text-right w-28">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modalContaAberta?.lancamentos
                  .filter((item: LancamentoDreItem) => {
                    if (!filtroBuscaLancamento.trim()) return true
                    const termo = filtroBuscaLancamento.toLowerCase()
                    return (
                      item.descricao.toLowerCase().includes(termo) ||
                      (item.documento && item.documento.toLowerCase().includes(termo)) ||
                      item.contraparte.toLowerCase().includes(termo)
                    )
                  })
                  .map((l: LancamentoDreItem) => (
                    <TableRow key={l.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-slate-600">
                        {new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1 font-normal bg-slate-50 text-slate-600"
                        >
                          {l.origem === 'pagar_baixa'
                            ? 'Baixa Pagar'
                            : l.origem === 'receber_baixa'
                              ? 'Baixa Receber'
                              : l.origem === 'titulo_pagar'
                                ? 'Título Pagar'
                                : l.origem === 'titulo_receber'
                                  ? 'Título Receber'
                                  : 'Avulso Banco'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-800">
                        <div className="font-medium">{l.descricao}</div>
                        {l.contraparte && (
                          <div className="text-[11px] text-slate-400">{l.contraparte}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-slate-600">
                        {l.documento || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        {formatMoeda(l.valor)}
                      </TableCell>
                    </TableRow>
                  ))}

                {modalContaAberta?.lancamentos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-slate-400">
                      Nenhum lançamento no período para esta conta.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default DrePage
