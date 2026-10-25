import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package,
  Layers,
  Clock,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Info,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Download,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import {
  ChaveFiltroDeclaravel,
  ObjetoFiltrosRelatorio,
  gerarCsvRelatorio,
  fazerDownloadCsv,
  dispararImpressaoRelatorio,
  formatarDataBr,
} from '@/services/relatorios'
import {
  obterRelatorioEstoqueGerencial,
  RelatorioEstoqueGerencialResultado,
  ProdutoEstoqueGerencialItem,
} from '@/services/relatorioEstoqueGerencial'

export const EstoqueGerencialPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  // Permissão de custo médio e valores: só para quem pode ver produtos
  const podeVerCusto = pode('produtos', 'ver') || pode('produtos', 'editar')

  // Filtros declarados do catálogo 8.0b (incluindo fornecedor do produto)
  const filtrosDeclarados: ChaveFiltroDeclaravel[] = [
    'produto_grupos_categorias',
    'produto_marcas',
    'produto_produtos',
    'produto_fornecedores',
    'produto_ncms',
    'produto_situacao',
    'produto_so_fiscal_nao_revisado',
  ]

  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    ver_so_total: false,
  })

  // Parâmetros específicos do Estoque Gerencial:
  const hojeStr = new Date().toISOString().slice(0, 10)
  const [dataBase, setDataBase] = useState<string>(hojeStr)
  const [diasAnalise, setDiasAnalise] = useState<number>(90)
  const [diasCoberturaAlvo, setDiasCoberturaAlvo] = useState<number>(30)
  const [diasParado, setDiasParado] = useState<number>(90)

  // Filtro de texto local para tabela rápida
  const [buscaTexto, setBuscaTexto] = useState('')

  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<RelatorioEstoqueGerencialResultado | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<'valorizado' | 'giro' | 'parados' | 'sugestao'>(
    'valorizado',
  )

  // Carregar dados do relatório
  const carregarRelatorio = useCallback(async () => {
    if (!filtros.empresas_ids || filtros.empresas_ids.length === 0) return

    setCarregando(true)
    try {
      const res = await obterRelatorioEstoqueGerencial({
        filtros,
        data_base: dataBase,
        dias_analise: diasAnalise,
        dias_cobertura_alvo: diasCoberturaAlvo,
        dias_parado: diasParado,
      })
      setDados(res)
    } catch (err: any) {
      console.error('Erro ao consultar relatório de estoque gerencial:', err)
      toast({
        title: 'Erro ao gerar relatório',
        description: err?.data?.message || err?.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [filtros, dataBase, diasAnalise, diasCoberturaAlvo, diasParado, toast])

  // Dispara primeira carga quando as empresas estiverem prontas
  useEffect(() => {
    if (filtros.empresas_ids && filtros.empresas_ids.length > 0) {
      carregarRelatorio()
    }
  }, [filtros.empresas_ids, carregarRelatorio])

  // Formatadores
  const formatMoeda = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatNumero = (val: number, decimais = 2) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: decimais,
      maximumFractionDigits: decimais,
    })
  }

  // Filtragem de produtos por busca em texto
  const filtrarProdutosPorBusca = (lista: ProdutoEstoqueGerencialItem[]) => {
    if (!buscaTexto.trim()) return lista
    const t = buscaTexto.toLowerCase().trim()
    return lista.filter(
      (p) =>
        p.descricao.toLowerCase().includes(t) ||
        String(p.codigo).includes(t) ||
        p.marca_nome.toLowerCase().includes(t) ||
        p.grupo_nome.toLowerCase().includes(t) ||
        p.ultimo_fornecedor_nome.toLowerCase().includes(t),
    )
  }

  // Produtos ordenados por cobertura (para aba de giro)
  const produtosOrdenadosGiro = useMemo(() => {
    if (!dados) return []
    const filtrados = filtrarProdutosPorBusca(dados.produtos)
    // Ordenar por cobertura em dias crescente (menor cobertura primeiro); sem giro ao final
    return [...filtrados].sort((a, b) => {
      if (a.cobertura_dias === null && b.cobertura_dias === null) return 0
      if (a.cobertura_dias === null) return 1
      if (b.cobertura_dias === null) return -1
      return a.cobertura_dias - b.cobertura_dias
    })
  }, [dados, buscaTexto])

  // Produtos parados
  const produtosParadosFiltrados = useMemo(() => {
    if (!dados) return []
    return filtrarProdutosPorBusca(dados.produtos_parados)
  }, [dados, buscaTexto])

  // Produtos de sugestão de compra
  const produtosSugestaoFiltrados = useMemo(() => {
    if (!dados) return []
    return filtrarProdutosPorBusca(dados.produtos_sugestao)
  }, [dados, buscaTexto])

  // Produtos para aba valorizado
  const produtosValorizadoFiltrados = useMemo(() => {
    if (!dados) return []
    return filtrarProdutosPorBusca(dados.produtos)
  }, [dados, buscaTexto])

  // Exportação CSV geral do relatório
  const handleExportarCsvGeral = () => {
    if (!dados) return

    const colunas = [
      'Código',
      'Descrição',
      'Grupo',
      'Categoria',
      'Marca',
      'Unidade',
      'Saldo em Data Base',
      podeVerCusto ? 'Custo Médio' : 'Custo',
      podeVerCusto ? 'Valor Total' : 'Valor',
      'Qtd Vendida no Período',
      'Média Diária',
      'Cobertura (dias)',
      'Giro no Período',
      'Última Saída',
      'Dias sem Saída',
      'Em Pedido',
      'Estoque Mínimo',
      'Sugestão de Compra',
      'Último Fornecedor',
      podeVerCusto ? 'Último Custo' : 'Custo Forn.',
    ]

    const linhas = dados.produtos.map((p) => [
      p.codigo,
      p.descricao,
      p.grupo_nome,
      p.categoria_nome,
      p.marca_nome,
      p.unidade_sigla,
      p.saldo,
      podeVerCusto ? p.custo_medio : '-',
      podeVerCusto ? p.valor_total : '-',
      p.qtd_vendida_periodo,
      p.media_diaria,
      p.cobertura_descricao,
      p.giro_periodo,
      p.data_ultima_saida ? formatarDataBr(p.data_ultima_saida) : 'Sem registro',
      p.dias_ultima_saida !== null ? `${p.dias_ultima_saida} dias` : 'Sem saída',
      p.em_pedido,
      p.estoque_minimo,
      p.sugestao_compra,
      p.ultimo_fornecedor_nome,
      podeVerCusto ? p.ultimo_custo : '-',
    ])

    const csvContent = gerarCsvRelatorio({
      titulo: 'Relatório de Estoque Gerencial (Valorizado, Giro, Parados e Sugestão)',
      empresaNome: empresaAtiva?.nome_fantasia || 'ERP Comercial',
      colunas,
      linhas,
      linhaFiltros: `Data Base: ${formatarDataBr(dataBase)} · Análise: ${diasAnalise} dias · Cobertura Alvo: ${diasCoberturaAlvo} dias · Parado: ${diasParado} dias`,
    })

    fazerDownloadCsv(csvContent, `estoque_gerencial_${dataBase}.csv`)
  }

  // Exportação CSV específica da Sugestão de Compra para enviar ao fornecedor
  const handleExportarCsvSugestao = () => {
    if (!dados || dados.produtos_sugestao.length === 0) {
      toast({
        title: 'Sem itens de sugestão',
        description: 'Não há itens com sugestão de compra a exportar.',
      })
      return
    }

    const colunas = [
      'Código',
      'Descrição',
      'Unidade',
      'Saldo Atual',
      'Média Venda Diária',
      'Já em Pedido',
      'Quantidade Sugerida',
      'Fornecedor',
      podeVerCusto ? 'Último Custo Unitário' : 'Custo Unit.',
      podeVerCusto ? 'Valor Estimado' : 'Valor Est.',
    ]

    const linhas = dados.produtos_sugestao.map((p) => [
      p.codigo,
      p.descricao,
      p.unidade_sigla,
      p.saldo,
      p.media_diaria,
      p.em_pedido,
      p.sugestao_compra,
      p.ultimo_fornecedor_nome,
      podeVerCusto ? p.ultimo_custo : '-',
      podeVerCusto ? p.valor_sugestao : '-',
    ])

    const csvContent = gerarCsvRelatorio({
      titulo: 'Sugestão de Compra para Reposição de Estoque',
      empresaNome: empresaAtiva?.nome_fantasia || 'ERP Comercial',
      colunas,
      linhas,
      linhaFiltros: `Gerado em: ${formatarDataBr(hojeStr)} · Alvo de Cobertura: ${diasCoberturaAlvo} dias`,
    })

    fazerDownloadCsv(csvContent, `sugestao_compra_fornecedores_${hojeStr}.csv`)
  }

  const handleImprimir = () => {
    dispararImpressaoRelatorio()
  }

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros da Etapa 8 com parâmetros de estoque gerencial */}
      <FiltrosRelatorio
        relatorioId="estoque_gerencial"
        tituloRelatorio="Estoque Gerencial"
        subtituloRelatorio="Posição valorizada por grupos e marcas, giro, cobertura de dias, produtos parados e sugestão inteligente de compra."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarRelatorio}
        onExportarCsv={handleExportarCsvGeral}
        onImprimir={handleImprimir}
        carregando={carregando}
        ocultarPeriodo
        filtrosExtras={
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div>
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Data Base do Estoque
              </Label>
              <Input
                type="date"
                value={dataBase}
                onChange={(e) => setDataBase(e.target.value)}
                className="h-8 text-xs bg-background"
              />
              <span className="text-[10px] text-muted-foreground">
                Hoje = saldos atuais; data passada = saldo até a data
              </span>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Dias de Análise de Venda
              </Label>
              <Input
                type="number"
                min={1}
                max={366}
                value={diasAnalise}
                onChange={(e) => setDiasAnalise(Number(e.target.value) || 90)}
                className="h-8 text-xs bg-background"
              />
              <span className="text-[10px] text-muted-foreground">
                Padrão 90 dias (máx. 366 dias)
              </span>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Dias Cobertura Alvo
              </Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={diasCoberturaAlvo}
                onChange={(e) => setDiasCoberturaAlvo(Number(e.target.value) || 30)}
                className="h-8 text-xs bg-background"
              />
              <span className="text-[10px] text-muted-foreground">
                Meta de dias para sugestão de compra (padrão 30)
              </span>
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Critério de Dias Parado
              </Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={diasParado}
                onChange={(e) => setDiasParado(Number(e.target.value) || 90)}
                className="h-8 text-xs bg-background"
              />
              <span className="text-[10px] text-muted-foreground">
                Saldo sem saídas há mais de X dias (padrão 90)
              </span>
            </div>
          </div>
        }
      />

      {/* Aviso quando houver filtro de produto ativo (Catálogo 8.0b) */}
      {dados?.metadados.tem_filtro_produto && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-3.5 rounded-lg flex items-center gap-2.5 text-xs font-medium">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {dados.metadados.aviso_filtro_produto ||
              'Atenção: Filtro de produto aplicado. Apenas os produtos que atendem aos filtros são exibidos.'}
          </span>
        </div>
      )}

      {/* Cartões de Indicadores Gerais */}
      {dados && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border bg-card shadow-2xs">
            <CardContent className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-between">
                <span>Estoque Valorizado</span>
                <Package className="w-4 h-4 text-primary" />
              </p>
              <p className="text-2xl font-bold text-primary">
                {podeVerCusto ? formatMoeda(dados.totais.valor_total) : '••••••'}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumero(dados.totais.saldo_total)} unidades em{' '}
                {dados.metadados.total_produtos_avaliados} produtos
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-2xs">
            <CardContent className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-between">
                <span>Produtos Parados</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {dados.totais.itens_parados}
              </p>
              <p className="text-xs text-muted-foreground">
                {podeVerCusto
                  ? `${formatMoeda(dados.totais.valor_parados)} parados (+${diasParado} dias)`
                  : 'Valor restrito'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-2xs">
            <CardContent className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-between">
                <span>Sugestão de Compra</span>
                <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {dados.totais.itens_sugestao} itens
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumero(dados.totais.sugestao_total_qtd)} un.{' '}
                {podeVerCusto ? `(${formatMoeda(dados.totais.sugestao_total_valor)})` : ''}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-2xs">
            <CardContent className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase flex items-center justify-between">
                <span>Parâmetros Ativos</span>
                <Sparkles className="w-4 h-4 text-blue-500" />
              </p>
              <p className="text-sm font-semibold text-foreground pt-1">
                Data Base: {formatarDataBr(dataBase)}
              </p>
              <p className="text-xs text-muted-foreground">
                {diasAnalise}d análise · {diasCoberturaAlvo}d alvo
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barra de Pesquisa Rápida na Tabela */}
      {dados && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Input
              placeholder="Filtrar por código, descrição, marca ou grupo..."
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              className="h-8 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            {abaAtiva === 'sugestao' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCsvSugestao}
                className="h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV p/ Fornecedor
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Quatro Abas Gerenciais do Relatório */}
      {dados && (
        <Tabs
          value={abaAtiva}
          onValueChange={(v) => setAbaAtiva(v as typeof abaAtiva)}
          className="space-y-4"
        >
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="valorizado" className="text-xs gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Valorizado
            </TabsTrigger>
            <TabsTrigger value="giro" className="text-xs gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Giro e Cobertura
            </TabsTrigger>
            <TabsTrigger value="parados" className="text-xs gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Parados ({dados.produtos_parados.length})
            </TabsTrigger>
            <TabsTrigger value="sugestao" className="text-xs gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5" />
              Sugestão de Compra ({dados.produtos_sugestao.length})
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: VALORIZADO */}
          <TabsContent value="valorizado" className="space-y-6">
            {/* Totais por Grupo / Categoria e por Marca */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Quadro Por Grupo e Categoria */}
              <Card className="border-border shadow-2xs">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Valorização por Grupo e Categoria</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {dados.por_grupo_categoria.length} grupos
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40 sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">Grupo / Categoria</th>
                          <th className="py-2 px-2.5 text-right">Saldo</th>
                          <th className="py-2 px-2.5 text-right">Valor</th>
                          <th className="py-2 px-2.5 text-right">% Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {dados.por_grupo_categoria.map((g) => (
                          <React.Fragment key={g.grupo_id || 'sem_grupo'}>
                            <tr className="bg-muted/20 font-medium">
                              <td className="py-2 px-2.5 flex items-center gap-1.5">
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                {g.grupo_nome}
                              </td>
                              <td className="py-2 px-2.5 text-right">
                                {formatNumero(g.saldo_total)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-semibold text-primary">
                                {podeVerCusto ? formatMoeda(g.valor_total) : '••••'}
                              </td>
                              <td className="py-2 px-2.5 text-right text-muted-foreground">
                                {g.percentual_valor.toFixed(1)}%
                              </td>
                            </tr>
                            {g.categorias.map((c) => (
                              <tr key={c.categoria_id || 'sem_cat'} className="hover:bg-muted/10">
                                <td className="py-1 px-2.5 pl-6 text-muted-foreground text-[11px]">
                                  {c.categoria_nome}
                                </td>
                                <td className="py-1 px-2.5 text-right text-muted-foreground text-[11px]">
                                  {formatNumero(c.saldo_total)}
                                </td>
                                <td className="py-1 px-2.5 text-right text-[11px]">
                                  {podeVerCusto ? formatMoeda(c.valor_total) : '••••'}
                                </td>
                                <td className="py-1 px-2.5 text-right text-muted-foreground text-[11px]">
                                  {c.percentual_grupo.toFixed(1)}% (do grp)
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Quadro Por Marca */}
              <Card className="border-border shadow-2xs">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>Valorização por Marca</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {dados.por_marca.length} marcas
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40 sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">Marca</th>
                          <th className="py-2 px-2.5 text-right">Itens</th>
                          <th className="py-2 px-2.5 text-right">Saldo</th>
                          <th className="py-2 px-2.5 text-right">Valor</th>
                          <th className="py-2 px-2.5 text-right">% Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {dados.por_marca.map((m) => (
                          <tr key={m.marca_id || 'sem_marca'} className="hover:bg-muted/20">
                            <td className="py-2 px-2.5 font-medium">{m.marca_nome}</td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground">
                              {m.itens_count}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {formatNumero(m.saldo_total)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-semibold text-primary">
                              {podeVerCusto ? formatMoeda(m.valor_total) : '••••'}
                            </td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground">
                              {m.percentual_valor.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabela Detalhada de Produtos com Saldo, Custo Médio e Valor */}
            <Card className="border-border shadow-2xs">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Lista de Produtos com Estoque e Valorização</span>
                  <Badge variant="outline" className="text-xs">
                    {produtosValorizadoFiltrados.length} produtos
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Saldos apurados em {formatarDataBr(dataBase)} com seus custos médios ponderados.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40">
                      <tr>
                        <th className="py-2 px-2.5">Cód.</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5">Grupo</th>
                        <th className="py-2 px-2.5">Marca</th>
                        <th className="py-2 px-2.5 text-center">Un.</th>
                        <th className="py-2 px-2.5 text-right">Saldo</th>
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Custo Médio</th>}
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Valor Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {produtosValorizadoFiltrados.length === 0 ? (
                        <tr>
                          <td
                            colSpan={podeVerCusto ? 8 : 6}
                            className="text-center py-6 text-muted-foreground"
                          >
                            Nenhum produto localizado.
                          </td>
                        </tr>
                      ) : (
                        produtosValorizadoFiltrados.map((p) => (
                          <tr key={p.produto_id} className="hover:bg-muted/20">
                            <td className="py-2 px-2.5 font-mono text-[11px] text-muted-foreground">
                              {p.codigo}
                            </td>
                            <td className="py-2 px-2.5 font-medium">{p.descricao}</td>
                            <td className="py-2 px-2.5 text-muted-foreground">{p.grupo_nome}</td>
                            <td className="py-2 px-2.5 text-muted-foreground">{p.marca_nome}</td>
                            <td className="py-2 px-2.5 text-center font-mono text-[11px]">
                              {p.unidade_sigla}
                            </td>
                            <td className="py-2 px-2.5 text-right font-medium">
                              {formatNumero(p.saldo)}
                            </td>
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right text-muted-foreground">
                                {formatMoeda(p.custo_medio)}
                              </td>
                            )}
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right font-semibold text-primary">
                                {formatMoeda(p.valor_total)}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 2: GIRO E COBERTURA */}
          <TabsContent value="giro" className="space-y-4">
            <Card className="border-border shadow-2xs">
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span>Análise de Giro e Cobertura de Estoque</span>
                      <Badge variant="outline" className="text-xs">
                        {produtosOrdenadosGiro.length} produtos
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ordenado pela cobertura em dias (menor cobertura = maior risco de ruptura).
                      Destacado em vermelho/âmbar itens com cobertura acima de 180 dias.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40">
                      <tr>
                        <th className="py-2 px-2.5">Cód.</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5 text-right">Saldo Atual</th>
                        <th className="py-2 px-2.5 text-right">Vendas ({diasAnalise}d)</th>
                        <th className="py-2 px-2.5 text-right">Média Diária</th>
                        <th className="py-2 px-2.5 text-center">Cobertura</th>
                        <th className="py-2 px-2.5 text-right">Giro (Período)</th>
                        <th className="py-2 px-2.5 text-center">Última Saída</th>
                        <th className="py-2 px-2.5 text-right">Dias s/ Saída</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {produtosOrdenadosGiro.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center py-6 text-muted-foreground">
                            Nenhum produto localizado.
                          </td>
                        </tr>
                      ) : (
                        produtosOrdenadosGiro.map((p) => {
                          const ehAcima180 = p.cobertura_acima_180
                          const semGiro = p.cobertura_dias === null

                          return (
                            <tr
                              key={p.produto_id}
                              className={`hover:bg-muted/20 ${ehAcima180 ? 'bg-amber-500/5' : ''}`}
                            >
                              <td className="py-2 px-2.5 font-mono text-[11px] text-muted-foreground">
                                {p.codigo}
                              </td>
                              <td className="py-2 px-2.5 font-medium">{p.descricao}</td>
                              <td className="py-2 px-2.5 text-right font-medium">
                                {formatNumero(p.saldo)} {p.unidade_sigla}
                              </td>
                              <td className="py-2 px-2.5 text-right">
                                {formatNumero(p.qtd_vendida_periodo)}
                              </td>
                              <td className="py-2 px-2.5 text-right text-muted-foreground font-mono">
                                {p.media_diaria.toFixed(2)}/dia
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                {semGiro ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-muted text-muted-foreground text-[10px]"
                                  >
                                    sem giro
                                  </Badge>
                                ) : ehAcima180 ? (
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold">
                                    {p.cobertura_descricao} (+180d)
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] font-medium">
                                    {p.cobertura_descricao}
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right font-semibold">
                                {p.giro_periodo > 0 ? `${p.giro_periodo.toFixed(2)}x` : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-center text-muted-foreground text-[11px]">
                                {p.data_ultima_saida ? formatarDataBr(p.data_ultima_saida) : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-right text-muted-foreground">
                                {p.dias_ultima_saida !== null
                                  ? `${p.dias_ultima_saida}d`
                                  : 'Sem saída'}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 3: PARADOS */}
          <TabsContent value="parados" className="space-y-4">
            <Card className="border-border shadow-2xs">
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span>Produtos Parados no Estoque</span>
                      <Badge variant="secondary" className="text-xs">
                        {produtosParadosFiltrados.length} itens parados
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Produtos que possuem saldo físico em estoque e estão sem nenhuma saída há mais
                      de <strong>{diasParado} dias</strong> (ou sem histórico de venda no período).
                    </CardDescription>
                  </div>

                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground uppercase font-medium">
                      Capital Parado
                    </p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {podeVerCusto ? formatMoeda(dados.totais.valor_parados) : '••••••'}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40">
                      <tr>
                        <th className="py-2 px-2.5">Cód.</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5">Marca</th>
                        <th className="py-2 px-2.5 text-right">Saldo Parado</th>
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Custo Médio</th>}
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Valor Parado</th>}
                        <th className="py-2 px-2.5 text-center">Última Saída</th>
                        <th className="py-2 px-2.5 text-right">Dias Parado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {produtosParadosFiltrados.length === 0 ? (
                        <tr>
                          <td
                            colSpan={podeVerCusto ? 8 : 6}
                            className="text-center py-6 text-muted-foreground"
                          >
                            Excelente! Nenhum produto com estoque parado há mais de {diasParado}{' '}
                            dias.
                          </td>
                        </tr>
                      ) : (
                        produtosParadosFiltrados.map((p) => (
                          <tr key={p.produto_id} className="hover:bg-muted/20">
                            <td className="py-2 px-2.5 font-mono text-[11px] text-muted-foreground">
                              {p.codigo}
                            </td>
                            <td className="py-2 px-2.5 font-medium">{p.descricao}</td>
                            <td className="py-2 px-2.5 text-muted-foreground">{p.marca_nome}</td>
                            <td className="py-2 px-2.5 text-right font-medium">
                              {formatNumero(p.saldo)} {p.unidade_sigla}
                            </td>
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right text-muted-foreground">
                                {formatMoeda(p.custo_medio)}
                              </td>
                            )}
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                                {formatMoeda(p.valor_parado)}
                              </td>
                            )}
                            <td className="py-2 px-2.5 text-center text-muted-foreground text-[11px]">
                              {p.data_ultima_saida
                                ? formatarDataBr(p.data_ultima_saida)
                                : 'Sem registro'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                              {p.dias_ultima_saida !== null
                                ? `${p.dias_ultima_saida} dias`
                                : `> ${diasParado}d`}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 4: SUGESTÃO DE COMPRA */}
          <TabsContent value="sugestao" className="space-y-4">
            <Card className="border-border shadow-2xs">
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Sugestão de Compra para Reposição</span>
                      <Badge variant="secondary" className="text-xs">
                        {produtosSugestaoFiltrados.length} itens sugeridos
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Cálculo: (Média diária × {diasCoberturaAlvo} dias de cobertura alvo) − Saldo
                      atual − Pedidos de compra abertos, ou reposição por estoque mínimo.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground uppercase font-medium">
                        Investimento Estimado
                      </p>
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {podeVerCusto ? formatMoeda(dados.totais.sugestao_total_valor) : '••••••'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] font-semibold text-muted-foreground uppercase border-b bg-muted/40">
                      <tr>
                        <th className="py-2 px-2.5">Cód.</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5 text-right">Saldo</th>
                        <th className="py-2 px-2.5 text-right">Média Diária</th>
                        <th className="py-2 px-2.5 text-right">Em Pedido</th>
                        <th className="py-2 px-2.5 text-right">Estoque Mín.</th>
                        <th className="py-2 px-2.5 text-right">Sugestão</th>
                        <th className="py-2 px-2.5">Último Fornecedor</th>
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Último Custo</th>}
                        {podeVerCusto && <th className="py-2 px-2.5 text-right">Total Est.</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {produtosSugestaoFiltrados.length === 0 ? (
                        <tr>
                          <td
                            colSpan={podeVerCusto ? 10 : 8}
                            className="text-center py-6 text-muted-foreground"
                          >
                            Nenhum item com necessidade de reposição para a meta de{' '}
                            {diasCoberturaAlvo} dias.
                          </td>
                        </tr>
                      ) : (
                        produtosSugestaoFiltrados.map((p) => (
                          <tr key={p.produto_id} className="hover:bg-muted/20">
                            <td className="py-2 px-2.5 font-mono text-[11px] text-muted-foreground">
                              {p.codigo}
                            </td>
                            <td className="py-2 px-2.5 font-medium">{p.descricao}</td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground">
                              {formatNumero(p.saldo)} {p.unidade_sigla}
                            </td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground font-mono">
                              {p.media_diaria.toFixed(2)}
                            </td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground">
                              {p.em_pedido > 0 ? (
                                <span className="text-blue-600 font-medium">
                                  {formatNumero(p.em_pedido)}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-right text-muted-foreground">
                              {p.estoque_minimo > 0 ? formatNumero(p.estoque_minimo) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              +{p.sugestao_compra} {p.unidade_sigla}
                            </td>
                            <td className="py-2 px-2.5 text-muted-foreground max-w-[180px] truncate">
                              {p.ultimo_fornecedor_nome}
                            </td>
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right text-muted-foreground">
                                {formatMoeda(p.ultimo_custo)}
                              </td>
                            )}
                            {podeVerCusto && (
                              <td className="py-2 px-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatMoeda(p.valor_sugestao)}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

export default EstoqueGerencialPage
