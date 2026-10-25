import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Store,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  Percent,
  MapPin,
  Globe,
  CreditCard,
  Layers,
  Info,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  formatarDataBr,
} from '@/services/relatorios'
import {
  obterRelatorioVendasCanais,
  RelatorioVendasCanaisResultado,
  ComparativoMetrica,
} from '@/services/relatorioVendasCanais'

export const VendasCanaisPage: React.FC = () => {
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()

  // Permissão de produtos para exibir margem de lucro
  const podeVerMargem = pode('produtos', 'editar') || pode('produtos', 'ver')

  // Filtros permitidos declarados do Prompt 8.0b para este relatório
  const filtrosDeclarados: ChaveFiltroDeclaravel[] = [
    // Produtos
    'produto_grupos_categorias',
    'produto_marcas',
    'produto_produtos',
    'produto_fornecedores',
    'produto_ncms',
    'produto_situacao',
    'produto_so_fiscal_nao_revisado',
    // Pessoas
    'pessoas_clientes',
    'pessoas_vendedores',
    'pessoas_operadores_caixa',
    'pessoas_cliente_ufs',
    'pessoas_cliente_cidades',
    // Vendas
    'vendas_tipos',
    'vendas_formas_pagamento',
    'vendas_terminais_pdv',
    'vendas_intermediadores',
    'vendas_com_sem_nota',
  ]

  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    atalho_periodo: 'este_mes',
    ver_so_total: false,
    vendas_nota_fiscal: 'todas',
  })

  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<RelatorioVendasCanaisResultado | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'uf' | 'canais' | 'pagamentos' | 'grupos'>(
    'empresas',
  )

  // Carregar dados da consulta
  const carregarRelatorio = useCallback(async () => {
    if (!filtros.empresas_ids || filtros.empresas_ids.length === 0) return
    if (!filtros.periodo?.dataInicio || !filtros.periodo?.dataFim) return

    setCarregando(true)
    try {
      const res = await obterRelatorioVendasCanais(filtros)
      setDados(res)
    } catch (err: any) {
      console.error('Erro ao consultar relatório de vendas por loja e canal:', err)
      toast({
        title: 'Erro ao gerar relatório',
        description: err?.data?.message || err?.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [filtros, toast])

  // Dispara primeira carga quando a empresa ou período inicial estiver configurado
  useEffect(() => {
    if (filtros.empresas_ids && filtros.empresas_ids.length > 0 && filtros.periodo?.dataInicio) {
      carregarRelatorio()
    }
  }, [filtros.empresas_ids, filtros.periodo?.dataInicio, carregarRelatorio])

  // Formatador numérico monetário
  const formatMoeda = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Componente auxiliar para exibir setas de variação comparativa
  const IndicadorVariacao: React.FC<{
    comparativo?: ComparativoMetrica
    tipo: 'anterior' | 'ano_anterior'
    label: string
  }> = ({ comparativo, tipo, label }) => {
    if (!comparativo) return null
    const pct =
      tipo === 'anterior'
        ? comparativo.variacao_anterior_pct
        : comparativo.variacao_ano_anterior_pct
    const val =
      tipo === 'anterior'
        ? comparativo.variacao_anterior_valor
        : comparativo.variacao_ano_anterior_valor

    const ehPositivo = pct > 0.05
    const ehNegativo = pct < -0.05
    const ehNeutro = !ehPositivo && !ehNegativo

    return (
      <div className="flex items-center justify-between text-xs py-0.5 border-t border-border/50">
        <span className="text-muted-foreground">{label}:</span>
        <div className="flex items-center gap-1 font-medium">
          {ehPositivo && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5" />+{pct.toFixed(1)}% ({formatMoeda(val)})
            </span>
          )}
          {ehNegativo && (
            <span className="text-rose-600 dark:text-rose-400 flex items-center">
              <ArrowDownRight className="w-3.5 h-3.5" />
              {pct.toFixed(1)}% ({formatMoeda(val)})
            </span>
          )}
          {ehNeutro && (
            <span className="text-muted-foreground flex items-center">
              <Minus className="w-3 h-3 mr-0.5" />
              0.0%
            </span>
          )}
        </div>
      </div>
    )
  }

  // Exportação CSV do relatório com todas as seções
  const handleExportarCsv = () => {
    if (!dados) return

    const linhasCsv: (string | number)[][] = []

    // 1. Resumo por Empresa
    linhasCsv.push(['=== VENDAS POR LOJA / EMPRESA ==='])
    linhasCsv.push([
      'Empresa',
      'CNPJ',
      'Fat. Bruto',
      'Devoluções',
      'Fat. Líquido',
      'Qtd. Vendas',
      'Ticket Médio',
      'Custo Total',
      'Margem Bruta (R$)',
      'Margem Bruta (%)',
      'Desconto Concedido',
      'Var. Período Anterior (%)',
      'Var. Ano Anterior (%)',
    ])

    const listaEmpresas = filtros.ver_so_total ? [] : dados.empresas
    listaEmpresas.forEach((e) => {
      linhasCsv.push([
        e.empresa_nome,
        e.empresa_cnpj,
        e.faturamento_bruto,
        e.devolucoes,
        e.faturamento_liquido,
        e.quantidade_vendas,
        e.ticket_medio,
        podeVerMargem ? e.custo_total : '-',
        podeVerMargem ? e.margem_bruta_valor : '-',
        podeVerMargem ? `${e.margem_bruta_percentual}%` : '-',
        e.desconto_concedido,
        `${e.comparacao_faturamento?.variacao_anterior_pct || 0}%`,
        `${e.comparacao_faturamento?.variacao_ano_anterior_pct || 0}%`,
      ])
    })

    // Linha Consolidada
    linhasCsv.push([
      'TOTAL CONSOLIDADO',
      '-',
      dados.consolidado.faturamento_bruto,
      dados.consolidado.devolucoes,
      dados.consolidado.faturamento_liquido,
      dados.consolidado.quantidade_vendas,
      dados.consolidado.ticket_medio,
      podeVerMargem ? dados.consolidado.custo_total : '-',
      podeVerMargem ? dados.consolidado.margem_bruta_valor : '-',
      podeVerMargem ? `${dados.consolidado.margem_bruta_percentual}%` : '-',
      dados.consolidado.desconto_concedido,
      `${dados.consolidado.comparacao_faturamento?.variacao_anterior_pct || 0}%`,
      `${dados.consolidado.comparacao_faturamento?.variacao_ano_anterior_pct || 0}%`,
    ])

    linhasCsv.push([])

    // 2. Vendas por UF de Destino
    linhasCsv.push(['=== VENDAS POR UF DE DESTINO ==='])
    linhasCsv.push(['UF', 'Faturamento', 'Qtd. Vendas', 'Ticket Médio', '% do Total'])
    dados.tabela_uf.forEach((u) => {
      linhasCsv.push([u.uf, u.faturamento, u.quantidade, u.ticket_medio, `${u.percentual}%`])
    })

    linhasCsv.push([])

    // 3. Vendas por Canal
    linhasCsv.push(['=== VENDAS POR CANAL ==='])
    linhasCsv.push(['Canal', 'Tipo', 'Faturamento', 'Qtd. Vendas', 'Ticket Médio', '% do Total'])
    dados.tabela_canal.forEach((c) => {
      linhasCsv.push([
        c.nome,
        c.tipo,
        c.faturamento,
        c.quantidade,
        c.ticket_medio,
        `${c.percentual}%`,
      ])
    })

    linhasCsv.push([])

    // 4. Formas de Pagamento
    linhasCsv.push(['=== FORMAS DE PAGAMENTO ==='])
    linhasCsv.push([
      'Forma',
      'Tipo',
      'Valor',
      'Qtd. Transações',
      'Taxas (R$)',
      '% Taxa',
      '% do Faturamento',
    ])
    dados.tabela_pagamentos.forEach((p) => {
      linhasCsv.push([
        p.descricao,
        p.tipo,
        p.valor,
        p.quantidade,
        p.valor_taxa,
        `${p.taxa_percentual}%`,
        `${p.percentual_sobre_total}%`,
      ])
    })

    linhasCsv.push([])

    // 5. Grupos e Categorias
    linhasCsv.push(['=== VENDAS POR GRUPO E CATEGORIA ==='])
    linhasCsv.push(['Grupo', 'Categoria', 'Faturamento', 'Quantidade', '% do Total'])
    dados.quadro_grupos_categorias.forEach((g) => {
      linhasCsv.push([
        g.grupo_nome,
        '(Todo o Grupo)',
        g.faturamento,
        g.quantidade,
        `${g.percentual_total}%`,
      ])
      g.categorias.forEach((cat) => {
        linhasCsv.push([
          g.grupo_nome,
          cat.categoria_nome,
          cat.faturamento,
          cat.quantidade,
          `${cat.percentual_grupo}% (do grupo)`,
        ])
      })
    })

    const csvContent = gerarCsvRelatorio({
      titulo: 'Relatório de Vendas por Loja e por Canal',
      empresaNome: empresaAtiva?.nome_fantasia || 'ERP Comercial',
      periodo: filtros.periodo,
      colunas: ['Seção / Descrição'],
      linhas: linhasCsv,
      linhaFiltros: dados.metadados.aviso_filtro_produto || undefined,
    })

    fazerDownloadCsv(
      csvContent,
      `vendas_loja_canal_${filtros.periodo?.dataInicio || 'inicio'}_a_${filtros.periodo?.dataFim || 'fim'}.csv`,
    )
  }

  // Impressão formatada com cabeçalho limpo
  const handleImprimir = () => {
    dispararImpressaoRelatorio()
  }

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros com Catálogo 8.0b */}
      <FiltrosRelatorio
        relatorioId="vendas_canais"
        tituloRelatorio="Vendas por Loja e por Canal"
        subtituloRelatorio="Visão consolidada e segregada por filial, canais de venda, UF de destino, grupos e taxas de pagamento."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarRelatorio}
        onExportarCsv={handleExportarCsv}
        onImprimir={handleImprimir}
        carregando={carregando}
      />

      {/* Aviso de Recálculo quando houver filtro de produto ativo (Padrão 8.0b) */}
      {dados?.metadados.tem_filtro_produto && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-3.5 rounded-lg flex items-center gap-2.5 text-xs font-medium">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {dados.metadados.aviso_filtro_produto ||
              'Atenção: Filtro de produto aplicado. Os faturamentos, quantidades e custos exibem estritamente os itens que atendem aos filtros selecionados.'}
          </span>
        </div>
      )}

      {/* Cartão de Total Consolidado */}
      {dados && (
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  Total Consolidado{' '}
                  {filtros.ver_so_total ? '(Visão Geral)' : `(${dados.empresas.length} empresa(s))`}
                </CardTitle>
                <CardDescription className="text-xs">
                  Período: {formatarDataBr(dados.metadados.periodo_atual.data_inicio)} a{' '}
                  {formatarDataBr(dados.metadados.periodo_atual.data_fim)} (
                  {dados.metadados.periodo_atual.dias} dias)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-background text-xs">
                  {dados.consolidado.quantidade_vendas} vendas finalizadas
                </Badge>
                {dados.consolidado.devolucoes > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-xs"
                  >
                    Devoluções: {formatMoeda(dados.consolidado.devolucoes)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                <p className="text-[11px] text-muted-foreground font-medium uppercase">
                  Faturamento Líquido
                </p>
                <p className="text-xl font-bold text-primary">
                  {formatMoeda(dados.consolidado.faturamento_liquido)}
                </p>
                <IndicadorVariacao
                  comparativo={dados.consolidado.comparacao_faturamento}
                  tipo="anterior"
                  label="Vs. Per. Anterior"
                />
                <IndicadorVariacao
                  comparativo={dados.consolidado.comparacao_faturamento}
                  tipo="ano_anterior"
                  label="Vs. Ano Anterior"
                />
              </div>

              <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                <p className="text-[11px] text-muted-foreground font-medium uppercase">
                  Ticket Médio
                </p>
                <p className="text-xl font-bold">{formatMoeda(dados.consolidado.ticket_medio)}</p>
                <IndicadorVariacao
                  comparativo={dados.consolidado.comparacao_ticket_medio}
                  tipo="anterior"
                  label="Vs. Per. Anterior"
                />
                <IndicadorVariacao
                  comparativo={dados.consolidado.comparacao_ticket_medio}
                  tipo="ano_anterior"
                  label="Vs. Ano Anterior"
                />
              </div>

              <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                <p className="text-[11px] text-muted-foreground font-medium uppercase">
                  Quantidade Vendas
                </p>
                <p className="text-xl font-bold">{dados.consolidado.quantidade_vendas}</p>
                <div className="text-xs pt-1 text-muted-foreground border-t border-border/50">
                  Descontos: {formatMoeda(dados.consolidado.desconto_concedido)}
                </div>
              </div>

              {podeVerMargem && (
                <>
                  <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase">
                      Custo Total (CMV)
                    </p>
                    <p className="text-xl font-bold text-muted-foreground">
                      {formatMoeda(dados.consolidado.custo_total)}
                    </p>
                    <div className="text-xs pt-1 text-muted-foreground border-t border-border/50">
                      Custo de mercadorias
                    </div>
                  </div>

                  <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase">
                      Margem Bruta (R$)
                    </p>
                    <p
                      className={`text-xl font-bold ${dados.consolidado.margem_bruta_valor >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}
                    >
                      {formatMoeda(dados.consolidado.margem_bruta_valor)}
                    </p>
                    <div className="text-xs pt-1 text-muted-foreground border-t border-border/50">
                      Fat. Líq. - Custo
                    </div>
                  </div>

                  <div className="space-y-1 bg-background/80 p-3 rounded-lg border">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase">
                      Margem Bruta (%)
                    </p>
                    <p
                      className={`text-xl font-bold ${dados.consolidado.margem_bruta_percentual >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}
                    >
                      {dados.consolidado.margem_bruta_percentual.toFixed(1)}%
                    </p>
                    <div className="text-xs pt-1 text-muted-foreground border-t border-border/50">
                      Sobre o faturamento
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navegação por Abas das Visões */}
      <Tabs value={abaAtiva} onValueChange={(val: any) => setAbaAtiva(val)} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/60">
          <TabsTrigger value="empresas" className="flex items-center gap-1.5 py-2 text-xs">
            <Store className="w-3.5 h-3.5" />
            Por Empresa / Loja
          </TabsTrigger>
          <TabsTrigger value="canais" className="flex items-center gap-1.5 py-2 text-xs">
            <Globe className="w-3.5 h-3.5" />
            Por Canal de Venda
          </TabsTrigger>
          <TabsTrigger value="uf" className="flex items-center gap-1.5 py-2 text-xs">
            <MapPin className="w-3.5 h-3.5" />
            Por UF de Destino
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex items-center gap-1.5 py-2 text-xs">
            <CreditCard className="w-3.5 h-3.5" />
            Formas de Pagamento
          </TabsTrigger>
          <TabsTrigger value="grupos" className="flex items-center gap-1.5 py-2 text-xs">
            <Layers className="w-3.5 h-3.5" />
            Grupos e Categorias
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: CARTÕES POR EMPRESA / LOJA ================= */}
        <TabsContent value="empresas" className="space-y-4">
          {filtros.ver_so_total ? (
            <div className="text-center p-8 bg-muted/20 border border-dashed rounded-lg text-sm text-muted-foreground">
              A opção <strong>&quot;Ver só o total&quot;</strong> está ativa. Desmarque-a nos
              filtros para inspecionar cada loja individualmente.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dados?.empresas.map((emp) => (
                <Card key={emp.empresa_id} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3 border-b bg-muted/10">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Store className="w-4 h-4 text-primary" />
                          {emp.empresa_nome}
                        </CardTitle>
                        <CardDescription className="text-xs truncate max-w-[240px]">
                          {emp.empresa_razao_social || emp.empresa_cnpj}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        {emp.empresa_uf}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Faturamento Líquido:</span>
                      <span className="text-lg font-bold text-primary">
                        {formatMoeda(emp.faturamento_liquido)}
                      </span>
                    </div>

                    {emp.devolucoes > 0 && (
                      <div className="flex justify-between items-center text-xs text-rose-600 dark:text-rose-400">
                        <span>Devoluções abatidas:</span>
                        <span>-{formatMoeda(emp.devolucoes)}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-md">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Vendas:</span>
                        <span className="font-semibold">{emp.quantidade_vendas}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">
                          Ticket Médio:
                        </span>
                        <span className="font-semibold">{formatMoeda(emp.ticket_medio)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Descontos:</span>
                        <span className="font-semibold">{formatMoeda(emp.desconto_concedido)}</span>
                      </div>
                      {podeVerMargem && (
                        <div>
                          <span className="text-muted-foreground block text-[11px]">
                            Custo (CMV):
                          </span>
                          <span className="font-semibold">{formatMoeda(emp.custo_total)}</span>
                        </div>
                      )}
                    </div>

                    {/* Margem visível com permissão */}
                    {podeVerMargem && (
                      <div className="flex justify-between items-center text-xs p-2 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium">
                        <span>Margem Bruta:</span>
                        <span>
                          {formatMoeda(emp.margem_bruta_valor)} (
                          {emp.margem_bruta_percentual.toFixed(1)}%)
                        </span>
                      </div>
                    )}

                    {/* Comparações com período anterior e ano anterior */}
                    <div className="space-y-1.5 pt-1">
                      <IndicadorVariacao
                        comparativo={emp.comparacao_faturamento}
                        tipo="anterior"
                        label="Fat. vs. Período Anterior"
                      />
                      <IndicadorVariacao
                        comparativo={emp.comparacao_faturamento}
                        tipo="ano_anterior"
                        label="Fat. vs. Mesmo Período Ano Anterior"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ================= ABA 2: POR CANAL DE VENDA ================= */}
        <TabsContent value="canais" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Vendas por Canal
              </CardTitle>
              <CardDescription className="text-xs">
                Classificação por Balcão/PDV, Pedido e Intermediadores/Marketplaces (identificados
                na NF-e).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Canal</TableHead>
                      <TableHead>Tipo de Canal</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead className="text-right">% do Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados?.tabela_canal && dados.tabela_canal.length > 0 ? (
                      dados.tabela_canal.map((canal) => (
                        <TableRow key={canal.chave}>
                          <TableCell className="font-medium flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {canal.tipo}
                            </Badge>
                            {canal.nome}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {canal.tipo}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatMoeda(canal.faturamento)}
                          </TableCell>
                          <TableCell className="text-right">{canal.quantidade}</TableCell>
                          <TableCell className="text-right">
                            {formatMoeda(canal.ticket_medio)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 hidden sm:block overflow-hidden">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, canal.percentual)}%` }}
                                />
                              </div>
                              <span>{canal.percentual.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-6 text-muted-foreground text-xs"
                        >
                          Nenhuma venda identificada por canal no período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA 3: POR UF DE DESTINO ================= */}
        <TabsContent value="uf" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Vendas por UF de Destino
              </CardTitle>
              <CardDescription className="text-xs">
                Ordenado pelo faturamento. Origem: UF do cliente cadastrado ou destinatario_uf da
                nota. Vendas sem cliente contam como UF da própria empresa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>UF</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Quantidade de Vendas</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead className="text-right">Participação (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados?.tabela_uf && dados.tabela_uf.length > 0 ? (
                      dados.tabela_uf.map((u) => (
                        <TableRow key={u.uf}>
                          <TableCell className="font-bold">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {u.uf}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatMoeda(u.faturamento)}
                          </TableCell>
                          <TableCell className="text-right">{u.quantidade}</TableCell>
                          <TableCell className="text-right">
                            {formatMoeda(u.ticket_medio)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 hidden sm:block overflow-hidden">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, u.percentual)}%` }}
                                />
                              </div>
                              <span>{u.percentual.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-6 text-muted-foreground text-xs"
                        >
                          Nenhuma venda registrada por UF no período consultado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA 4: FORMAS DE PAGAMENTO ================= */}
        <TabsContent value="pagamentos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    Vendas por Forma de Pagamento
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Valores recebidos, quantidade de transações e custo das taxas operacionais
                    (valor_taxa).
                  </CardDescription>
                </div>
                {dados?.consolidado_pagamentos && (
                  <Badge variant="outline" className="text-xs">
                    Taxa média global:{' '}
                    {dados.consolidado_pagamentos.taxa_media_percentual.toFixed(2)}% (
                    {formatMoeda(dados.consolidado_pagamentos.valor_taxas_total)})
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Forma de Pagamento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Qtd. Transações</TableHead>
                      <TableHead className="text-right">Custo das Taxas (R$)</TableHead>
                      <TableHead className="text-right">% Taxa Efetiva</TableHead>
                      <TableHead className="text-right">% do Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados?.tabela_pagamentos && dados.tabela_pagamentos.length > 0 ? (
                      dados.tabela_pagamentos.map((pg) => (
                        <TableRow key={pg.forma_pagamento_id}>
                          <TableCell className="font-medium">{pg.descricao}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px]">
                              {pg.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatMoeda(pg.valor)}
                          </TableCell>
                          <TableCell className="text-right">{pg.quantidade}</TableCell>
                          <TableCell className="text-right text-rose-600 dark:text-rose-400 font-medium">
                            {pg.valor_taxa > 0 ? formatMoeda(pg.valor_taxa) : 'R$ 0,00'}
                          </TableCell>
                          <TableCell className="text-right">
                            {pg.taxa_percentual > 0 ? `${pg.taxa_percentual.toFixed(2)}%` : '0.00%'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {pg.percentual_sobre_total.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-6 text-muted-foreground text-xs"
                        >
                          Nenhum pagamento registrado nas vendas finalizadas do período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA 5: GRUPOS E CATEGORIAS ================= */}
        <TabsContent value="grupos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Vendas por Grupo e Categoria
              </CardTitle>
              <CardDescription className="text-xs">
                Demonstrativo dos produtos vendidos agrupados hierarquicamente por grupo de
                mercadoria e subcategorias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dados?.quadro_grupos_categorias && dados.quadro_grupos_categorias.length > 0 ? (
                  dados.quadro_grupos_categorias.map((grupo) => (
                    <div key={grupo.grupo_id} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">
                            {grupo.grupo_nome}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {grupo.quantidade.toLocaleString('pt-BR')} itens vendidos
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-primary">
                            {formatMoeda(grupo.faturamento)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {grupo.percentual_total.toFixed(1)}% do total
                          </Badge>
                        </div>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-right">% do Grupo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grupo.categorias.map((cat) => (
                            <TableRow key={cat.categoria_id} className="text-xs">
                              <TableCell className="font-medium pl-6">
                                {cat.categoria_nome}
                              </TableCell>
                              <TableCell className="text-right">
                                {cat.quantidade.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatMoeda(cat.faturamento)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-muted-foreground">
                                {cat.percentual_grupo.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    Nenhum item comercializado registrado no período para grupos e categorias.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default VendasCanaisPage
