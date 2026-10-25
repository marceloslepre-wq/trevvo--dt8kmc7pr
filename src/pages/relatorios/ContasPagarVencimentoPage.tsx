import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  FileText,
  ExternalLink,
  ChevronRight,
  Filter,
  DollarSign,
  Briefcase,
  Layers,
  ArrowUpDown,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import {
  ObjetoFiltrosRelatorio,
  ChaveFiltroDeclaravel,
  gerarCsvRelatorio,
  fazerDownloadCsv,
  formatarDataBr,
  formatarDataHoraEmissao,
} from '@/services/relatorios'
import {
  RelatorioContasPagarResponse,
  obterRelatorioContasPagarPorVencimento,
  TituloAnaliticoCP,
  ItemFaixaVencimento,
  TotalPorFornecedorCP,
  TotalPorPlanoContasCP,
} from '@/services/relatorioContasPagar'

export const ContasPagarPorVencimentoPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeVerFinanceiroPagar = pode('financeiro_pagar', 'ver')

  // Filtros ativos gerenciados pelo componente padrão 8.0b
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>(() => {
    return {
      empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
      ver_so_total: false,
      atalho_periodo: 'este_mes',
      tipo_data: 'vencimento',
    }
  })

  // Sincroniza empresa se os filtros não tiverem nenhuma empresa definida ainda
  useEffect(() => {
    if (empresaAtiva?.id && (!filtros.empresas_ids || filtros.empresas_ids.length === 0)) {
      setFiltros((prev) => ({
        ...prev,
        empresas_ids: [empresaAtiva.id],
      }))
    }
  }, [empresaAtiva?.id, filtros.empresas_ids])

  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<RelatorioContasPagarResponse | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<string>('titulos')

  // Filtro interno de texto na lista analítica
  const [filtroTexto, setFiltroTexto] = useState('')
  // Filtro por faixa de vencimento rápida na lista
  const [faixaFiltroSelecionada, setFaixaFiltroSelecionada] = useState<string>('todas')

  // Filtros declarados suportados nesta tela (Prompt 8.0b)
  const filtrosPermitidos: ChaveFiltroDeclaravel[] = useMemo(
    () => [
      'pessoas_fornecedores',
      'financeiro_plano_contas',
      'financeiro_centros_custo',
      'financeiro_origens_titulo',
      'datas_tipo_data',
    ],
    [],
  )

  const carregarRelatorio = useCallback(async () => {
    if (!filtros.empresas_ids || filtros.empresas_ids.length === 0) {
      toast({
        title: 'Selecione uma empresa',
        description: 'É necessário selecionar ao menos uma empresa para consultar.',
        variant: 'destructive',
      })
      return
    }

    setCarregando(true)
    try {
      const resp = await obterRelatorioContasPagarPorVencimento({ filtros })
      setDados(resp)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao consultar contas a pagar'
      toast({
        title: 'Erro ao carregar relatório',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [filtros, toast])

  useEffect(() => {
    if (podeVerFinanceiroPagar && filtros.empresas_ids && filtros.empresas_ids.length > 0) {
      carregarRelatorio()
    }
  }, [carregarRelatorio, podeVerFinanceiroPagar, filtros.empresas_ids])

  // Formatação em moeda
  const formatMoeda = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00'
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Títulos filtrados pelo input de texto interno e faixa selecionada
  const titulosExibidos = useMemo(() => {
    if (!dados || !dados.titulos) return []
    let list = dados.titulos

    if (faixaFiltroSelecionada !== 'todas') {
      list = list.filter((t) => t.faixa_id === faixaFiltroSelecionada)
    }

    if (filtroTexto.trim()) {
      const termo = filtroTexto.toLowerCase().trim()
      list = list.filter(
        (t) =>
          t.fornecedor_nome.toLowerCase().includes(termo) ||
          t.fornecedor_razao_social.toLowerCase().includes(termo) ||
          t.numero_documento.toLowerCase().includes(termo) ||
          t.descricao.toLowerCase().includes(termo) ||
          t.plano_conta_descricao.toLowerCase().includes(termo) ||
          t.origem.toLowerCase().includes(termo),
      )
    }

    return list
  }, [dados, faixaFiltroSelecionada, filtroTexto])

  // Exportação CSV nos padrões da Etapa 8
  const handleExportarCsv = () => {
    if (!dados) return

    const secoes: {
      titulo: string
      colunas: string[]
      linhas: (string | number)[][]
    }[] = []

    // Seção 1: Resumo das Faixas de Vencimento
    secoes.push({
      titulo: 'FAIXAS DE VENCIMENTO (Aging)',
      colunas: ['Faixa de Vencimento', 'Qtd. Títulos', 'Saldo Total (R$)', '% Participação'],
      linhas: dados.faixas_vencimento.map((f: ItemFaixaVencimento) => [
        f.nome,
        f.quantidade_titulos,
        f.saldo_total,
        `${f.percentual_saldo}%`,
      ]),
    })

    // Seção 2: Totais por Fornecedor
    secoes.push({
      titulo: 'TOTAIS POR FORNECEDOR',
      colunas: [
        'Fornecedor',
        'CNPJ/CPF',
        'Qtd. Títulos',
        'Saldo Vencido (R$)',
        'Vence Hoje (R$)',
        'A Vencer (R$)',
        'Saldo Total (R$)',
        '% Participação',
      ],
      linhas: dados.totais_por_fornecedor.map((fn: TotalPorFornecedorCP) => [
        fn.fornecedor_nome,
        fn.fornecedor_cnpj_cpf || '-',
        fn.quantidade_titulos,
        fn.saldo_vencido,
        fn.saldo_vence_hoje,
        fn.saldo_a_vencer,
        fn.saldo_total,
        `${fn.percentual}%`,
      ]),
    })

    // Seção 3: Totais por Plano de Contas
    secoes.push({
      titulo: 'TOTAIS POR CONTA DO PLANO DE CONTAS',
      colunas: [
        'Código',
        'Descrição da Conta',
        'Qtd. Títulos',
        'Saldo Total (R$)',
        '% Participação',
      ],
      linhas: dados.totais_por_plano_contas.map((pc: TotalPorPlanoContasCP) => [
        pc.codigo,
        pc.descricao,
        pc.quantidade_titulos,
        pc.saldo_total,
        `${pc.percentual}%`,
      ]),
    })

    // Seção 4: Lista Analítica de Títulos
    secoes.push({
      titulo: 'LISTA ANALÍTICA DE TÍTULOS A PAGAR POR VENCIMENTO',
      colunas: [
        'Empresa',
        'Fornecedor',
        'Documento',
        'Parcela',
        'Vencimento',
        'Dias Vcto',
        'Situação',
        'Faixa',
        'Plano de Contas',
        'Centro de Custo',
        'Origem',
        'Valor Original (R$)',
        'Valor Pago (R$)',
        'Saldo (R$)',
      ],
      linhas: dados.titulos.map((t: TituloAnaliticoCP) => [
        t.empresa_nome,
        t.fornecedor_nome,
        t.numero_documento,
        t.parcela,
        formatarDataBr(t.data_vencimento),
        t.dias_vencimento,
        t.situacao_vencimento,
        t.faixa_nome,
        `${t.plano_conta_codigo} - ${t.plano_conta_descricao}`,
        t.centro_custo_nome || '-',
        t.origem,
        t.valor_original,
        t.valor_pago,
        t.saldo,
      ]),
    })

    const colunas = [
      'Empresa',
      'Fornecedor',
      'CNPJ/CPF',
      'Documento',
      'Parcela',
      'Vencimento',
      'Dias Vencimento',
      'Situação',
      'Faixa Aging',
      'Plano de Contas',
      'Centro de Custo',
      'Origem',
      'Valor Original (R$)',
      'Valor Pago (R$)',
      'Saldo a Pagar (R$)',
    ]

    const linhas = dados.titulos.map((t: TituloAnaliticoCP) => [
      t.empresa_nome,
      t.fornecedor_nome,
      t.fornecedor_cnpj_cpf || '-',
      t.numero_documento,
      t.parcela,
      formatarDataBr(t.data_vencimento),
      t.dias_vencimento,
      t.situacao_vencimento,
      t.faixa_nome,
      `${t.plano_conta_codigo} - ${t.plano_conta_descricao}`,
      t.centro_custo_nome || '-',
      t.origem,
      t.valor_original,
      t.valor_pago,
      t.saldo,
    ])

    const totais = [
      'TOTAL GERAL',
      `${dados.titulos.length} título(s)`,
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      dados.titulos.reduce((acc, cur) => acc + cur.valor_original, 0),
      dados.titulos.reduce((acc, cur) => acc + cur.valor_pago, 0),
      dados.totais.saldo_total,
    ]

    const csvContent = gerarCsvRelatorio({
      titulo: 'Relatório de Contas a Pagar por Vencimento',
      empresaNome: empresaAtiva?.nome_fantasia || 'ERP Comercial',
      periodo:
        dados.metadados.periodo.dataInicio && dados.metadados.periodo.dataFim
          ? {
              dataInicio: dados.metadados.periodo.dataInicio,
              dataFim: dados.metadados.periodo.dataFim,
            }
          : undefined,
      colunas,
      linhas,
      totais,
      linhaFiltros: `Tipo de Data: ${dados.metadados.tipo_data} · Saldo Vencido: ${formatMoeda(
        dados.totais.vencido_saldo,
      )} · Vence Hoje: ${formatMoeda(dados.totais.vence_hoje_saldo)} · A Vencer: ${formatMoeda(
        dados.totais.a_vencer_saldo,
      )}`,
    })

    fazerDownloadCsv(
      csvContent,
      `contas_pagar_vencimento_${new Date().toISOString().slice(0, 10)}.csv`,
    )

    toast({
      title: 'CSV exportado com sucesso',
      description: 'O arquivo com o resumo de faixas, fornecedores, contas e títulos foi baixado.',
    })
  }

  // Estilo de badge conforme a situação de vencimento
  const renderBadgeSituacao = (situacao: string, dias: number) => {
    if (situacao === 'Vencido') {
      return (
        <Badge variant="destructive" className="text-[10px] font-semibold">
          Vencido ({Math.abs(dias)}d atrás)
        </Badge>
      )
    }
    if (situacao === 'Vence hoje') {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold">
          Vence Hoje
        </Badge>
      )
    }
    if (dias <= 7) {
      return (
        <Badge
          variant="outline"
          className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px]"
        >
          Em {dias}d
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50 text-[10px]">
        Em {dias}d
      </Badge>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <CalendarClock className="h-7 w-7 text-rose-600" />
            Contas a Pagar por Vencimento
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestão do aging de contas a pagar: faixas de vencimento, totais por fornecedor e plano
            de contas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/financeiro/contas-pagar">
            <Button variant="outline" size="sm" className="text-xs h-9">
              <Briefcase className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              Gestão de Títulos
            </Button>
          </Link>
        </div>
      </div>

      {/* Componente Reutilizável de Filtros do 8.0b */}
      <FiltrosRelatorio
        relatorioId="financeiro_contas_pagar"
        tituloRelatorio="Contas a Pagar por Vencimento"
        subtituloRelatorio="Aging financeiro com corte por data de vencimento, emissão ou competência, análise por fornecedor e plano de contas."
        filtrosDeclarados={filtrosPermitidos}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarRelatorio}
        onExportarCsv={dados ? handleExportarCsv : undefined}
        carregando={carregando}
      />

      {/* Quadro de Indicadores Consolidados */}
      {dados && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>SALDO TOTAL EM ABERTO</span>
                <DollarSign className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1.5">
                {formatMoeda(dados.totais.saldo_total)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {dados.totais.quantidade_total} título(s) pendente(s)
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-200 bg-rose-50/30 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-rose-700 text-xs font-bold">
                <span>TOTAL VENCIDO</span>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-rose-700 mt-1.5">
                {formatMoeda(dados.totais.vencido_saldo)}
              </div>
              <div className="text-[11px] font-medium text-rose-600 mt-1">
                {dados.totais.vencido_quantidade} título(s) em atraso
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/30 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-amber-700 text-xs font-bold">
                <span>VENCE HOJE</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-700 mt-1.5">
                {formatMoeda(dados.totais.vence_hoje_saldo)}
              </div>
              <div className="text-[11px] font-medium text-amber-600 mt-1">
                {dados.totais.vence_hoje_quantidade} título(s) vencendo hoje
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/30 shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
                <span>A VENCER (FUTURO)</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1.5">
                {formatMoeda(dados.totais.a_vencer_saldo)}
              </div>
              <div className="text-[11px] font-medium text-emerald-600 mt-1">
                {dados.totais.a_vencer_quantidade} título(s) no prazo
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Faixas de Vencimento (Aging Cards Rápidos) */}
      {dados && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50/60 border-b border-slate-200 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Distribuição por Faixas de Vencimento (Aging)
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Clique em uma faixa para filtrar instantaneamente a lista de títulos abaixo.
              </CardDescription>
            </div>
            {faixaFiltroSelecionada !== 'todas' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFaixaFiltroSelecionada('todas')}
                className="text-xs h-7 text-blue-600 hover:text-blue-800"
              >
                Limpar filtro de faixa (
                {dados.faixas_vencimento.find((f) => f.id === faixaFiltroSelecionada)?.nome})
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {dados.faixas_vencimento.map((fx: ItemFaixaVencimento) => {
                const ativa = faixaFiltroSelecionada === fx.id
                return (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => setFaixaFiltroSelecionada(ativa ? 'todas' : fx.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      ativa
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500'
                        : fx.ordem <= 2
                          ? 'border-rose-200 bg-rose-50/20 hover:bg-rose-50/40'
                          : fx.ordem === 3
                            ? 'border-amber-200 bg-amber-50/20 hover:bg-amber-50/40'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="text-[11px] font-semibold text-slate-700 truncate"
                      title={fx.nome}
                    >
                      {fx.nome}
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                      {formatMoeda(fx.saldo_total)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>{fx.quantidade_titulos} tit.</span>
                      <span className="font-semibold">{fx.percentual_saldo}%</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abas Principais: 1) Lista de Títulos; 2) Totais por Fornecedor; 3) Totais por Plano de Contas */}
      <Card className="border-slate-200 shadow-xs">
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
          <CardHeader className="p-4 border-b border-slate-200 pb-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <TabsList className="bg-slate-100 p-1">
                <TabsTrigger value="titulos" className="text-xs font-semibold gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Relação de Títulos ({titulosExibidos.length})
                </TabsTrigger>
                <TabsTrigger value="fornecedores" className="text-xs font-semibold gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Por Fornecedor ({dados?.totais_por_fornecedor.length || 0})
                </TabsTrigger>
                <TabsTrigger value="plano_contas" className="text-xs font-semibold gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Por Plano de Contas ({dados?.totais_por_plano_contas.length || 0})
                </TabsTrigger>
              </TabsList>

              {abaAtiva === 'titulos' && (
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <Input
                      placeholder="Buscar fornecedor, documento..."
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.target.value)}
                      className="h-8 pl-8 text-xs bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardHeader>

          {/* ABA 1: Relação de Títulos */}
          <TabsContent value="titulos" className="m-0 p-0">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-48 font-bold text-slate-700">Fornecedor</TableHead>
                    <TableHead className="w-28 font-bold text-slate-700">Documento</TableHead>
                    <TableHead className="w-16 font-bold text-slate-700">Parc.</TableHead>
                    <TableHead className="w-28 font-bold text-slate-700">Vencimento</TableHead>
                    <TableHead className="w-32 font-bold text-slate-700">Situação</TableHead>
                    <TableHead className="w-44 font-bold text-slate-700">Plano de Contas</TableHead>
                    <TableHead className="w-28 font-bold text-slate-700">Origem</TableHead>
                    <TableHead className="text-right w-24 font-bold text-slate-700">
                      Original
                    </TableHead>
                    <TableHead className="text-right w-28 font-bold text-slate-900">
                      Saldo a Pagar
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!dados || titulosExibidos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                        {carregando
                          ? 'Consultando contas a pagar por vencimento...'
                          : 'Nenhum título a pagar encontrado com os filtros selecionados.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    titulosExibidos.map((t: TituloAnaliticoCP) => (
                      <TableRow key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Fornecedor */}
                        <TableCell className="py-2 font-medium text-slate-800">
                          <div className="truncate max-w-[200px]" title={t.fornecedor_razao_social}>
                            {t.fornecedor_nome}
                          </div>
                          {t.fornecedor_cnpj_cpf && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {t.fornecedor_cnpj_cpf}
                            </div>
                          )}
                        </TableCell>

                        {/* Documento */}
                        <TableCell className="py-2 font-mono text-slate-700">
                          {t.numero_documento || '-'}
                        </TableCell>

                        {/* Parcela */}
                        <TableCell className="py-2 text-slate-600">{t.parcela}</TableCell>

                        {/* Vencimento */}
                        <TableCell className="py-2 font-mono font-medium text-slate-800">
                          {formatarDataBr(t.data_vencimento)}
                        </TableCell>

                        {/* Situação / Faixa */}
                        <TableCell className="py-2">
                          {renderBadgeSituacao(t.situacao_vencimento, t.dias_vencimento)}
                        </TableCell>

                        {/* Plano de Contas */}
                        <TableCell className="py-2 text-slate-600">
                          <div
                            className="truncate max-w-[180px]"
                            title={`${t.plano_conta_codigo} - ${t.plano_conta_descricao}`}
                          >
                            <span className="font-mono text-[11px] text-slate-500 mr-1">
                              {t.plano_conta_codigo}
                            </span>
                            {t.plano_conta_descricao}
                          </div>
                        </TableCell>

                        {/* Origem com link para nota de entrada se for NF_ENTRADA */}
                        <TableCell className="py-2 text-slate-600">
                          {t.link_nota_entrada ? (
                            <Link
                              to={t.link_nota_entrada}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              title="Abrir conferência da Nota de Entrada"
                            >
                              <span>{t.origem}</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span>{t.origem}</span>
                          )}
                        </TableCell>

                        {/* Valor Original */}
                        <TableCell className="py-2 text-right font-mono text-slate-500">
                          {formatMoeda(t.valor_original)}
                        </TableCell>

                        {/* Saldo a Pagar */}
                        <TableCell className="py-2 text-right font-mono font-bold text-rose-700">
                          {formatMoeda(t.saldo)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ABA 2: Totais por Fornecedor */}
          <TabsContent value="fornecedores" className="m-0 p-0">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-64 font-bold text-slate-700">Fornecedor</TableHead>
                    <TableHead className="w-32 font-bold text-slate-700">CNPJ / CPF</TableHead>
                    <TableHead className="text-center w-24 font-bold text-slate-700">
                      Qtd. Títulos
                    </TableHead>
                    <TableHead className="text-right w-32 font-bold text-rose-700">
                      Saldo Vencido
                    </TableHead>
                    <TableHead className="text-right w-32 font-bold text-amber-700">
                      Vence Hoje
                    </TableHead>
                    <TableHead className="text-right w-32 font-bold text-emerald-700">
                      A Vencer
                    </TableHead>
                    <TableHead className="text-right w-36 font-bold text-slate-900">
                      Saldo Total
                    </TableHead>
                    <TableHead className="text-right w-20 font-bold text-slate-600">
                      % Part.
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!dados || dados.totais_por_fornecedor.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                        Nenhum fornecedor com títulos em aberto no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dados.totais_por_fornecedor.map((fn: TotalPorFornecedorCP) => (
                      <TableRow
                        key={fn.fornecedor_id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="py-2.5 font-medium text-slate-900">
                          {fn.fornecedor_nome}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-slate-500">
                          {fn.fornecedor_cnpj_cpf || '-'}
                        </TableCell>
                        <TableCell className="py-2.5 text-center font-semibold text-slate-700">
                          {fn.quantidade_titulos}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-rose-600 font-medium">
                          {formatMoeda(fn.saldo_vencido)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-amber-600 font-medium">
                          {formatMoeda(fn.saldo_vence_hoje)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-emerald-600 font-medium">
                          {formatMoeda(fn.saldo_a_vencer)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono font-bold text-slate-900">
                          {formatMoeda(fn.saldo_total)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-slate-600">
                          {fn.percentual}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ABA 3: Totais por Plano de Contas */}
          <TabsContent value="plano_contas" className="m-0 p-0">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-32 font-bold text-slate-700">Código</TableHead>
                    <TableHead className="font-bold text-slate-700">Descrição da Conta</TableHead>
                    <TableHead className="text-center w-28 font-bold text-slate-700">
                      Qtd. Títulos
                    </TableHead>
                    <TableHead className="text-right w-40 font-bold text-slate-900">
                      Saldo a Pagar
                    </TableHead>
                    <TableHead className="text-right w-24 font-bold text-slate-600">
                      % Part.
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!dados || dados.totais_por_plano_contas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                        Nenhuma conta com títulos em aberto no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dados.totais_por_plano_contas.map((pc: TotalPorPlanoContasCP) => (
                      <TableRow
                        key={pc.plano_conta_id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="py-2.5 font-mono font-bold text-slate-800">
                          {pc.codigo}
                        </TableCell>
                        <TableCell className="py-2.5 font-medium text-slate-900">
                          {pc.descricao}
                        </TableCell>
                        <TableCell className="py-2.5 text-center font-semibold text-slate-700">
                          {pc.quantidade_titulos}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono font-bold text-rose-700">
                          {formatMoeda(pc.saldo_total)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-slate-600">
                          {pc.percentual}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}

export default ContasPagarPorVencimentoPage
