import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingCart,
  Download,
  Building,
  Truck,
  TrendingDown,
  DollarSign,
  Package,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  obterSugestaoCompra,
  ResumoSugestaoCompra,
  GrupoFornecedorSugestao,
  ItemSugestaoCompra,
} from '@/services/sugestaoCompra'

export const SugestaoCompraPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const [carregando, setCarregando] = useState(true)
  const [resumo, setResumo] = useState<ResumoSugestaoCompra | null>(null)
  const [busca, setBusca] = useState('')
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos')

  const carregarDados = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const data = await obterSugestaoCompra(empresaAtiva.id)
      setResumo(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar sugestões de compra'
      toast({
        title: 'Erro ao gerar relatório',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Filtragem local por texto de busca e fornecedor
  const gruposFiltrados = useMemo(() => {
    if (!resumo) return []

    const termo = busca.trim().toLowerCase()

    return resumo.gruposPorFornecedor
      .filter((grupo) => {
        if (fornecedorFiltro !== 'todos' && grupo.fornecedor_id !== fornecedorFiltro) {
          return false
        }
        return true
      })
      .map((grupo) => {
        if (!termo) return grupo

        const itensFiltrados = grupo.itens.filter(
          (item) =>
            item.produto_descricao.toLowerCase().includes(termo) ||
            String(item.produto_codigo).toLowerCase().includes(termo) ||
            grupo.fornecedor_nome.toLowerCase().includes(termo),
        )

        return {
          ...grupo,
          itens: itensFiltrados,
          total_itens: itensFiltrados.length,
          quantidade_total: itensFiltrados.reduce((acc, i) => acc + i.quantidade_sugerida, 0),
          valor_total_estimado:
            Math.round(itensFiltrados.reduce((acc, i) => acc + i.custo_total_estimado, 0) * 100) /
            100,
        }
      })
      .filter((grupo) => grupo.itens.length > 0)
  }, [resumo, busca, fornecedorFiltro])

  const totalItensExibidos = useMemo(() => {
    return gruposFiltrados.reduce((acc, g) => acc + g.total_itens, 0)
  }, [gruposFiltrados])

  const totalValorExibido = useMemo(() => {
    return gruposFiltrados.reduce((acc, g) => acc + g.valor_total_estimado, 0)
  }, [gruposFiltrados])

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const formatarQtd = (val: number) => {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  }

  const exportarCSV = () => {
    if (!resumo || resumo.itensGerais.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não existem sugestões de compra para a filial ativa.',
      })
      return
    }

    const cabecalho = [
      'Fornecedor Principal',
      'Código Produto',
      'Descrição do Produto',
      'Unidade',
      'Saldo Atual',
      'Estoque Mínimo',
      'Estoque Máximo',
      'Quantidade Sugerida',
      'Custo Unitário Estimado (R$)',
      'Total Estimado (R$)',
    ]

    const linhas: string[][] = []

    gruposFiltrados.forEach((grupo) => {
      grupo.itens.forEach((item) => {
        linhas.push([
          `"${grupo.fornecedor_nome.replace(/"/g, '""')}"`,
          `"${item.produto_codigo}"`,
          `"${item.produto_descricao.replace(/"/g, '""')}"`,
          item.unidade_sigla,
          item.saldo_atual.toString().replace('.', ','),
          item.estoque_minimo.toString().replace('.', ','),
          item.estoque_maximo ? item.estoque_maximo.toString().replace('.', ',') : 'Não definido',
          item.quantidade_sugerida.toString().replace('.', ','),
          item.custo_medio.toFixed(2).replace('.', ','),
          item.custo_total_estimado.toFixed(2).replace('.', ','),
        ])
      })
    })

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `sugestao_compra_${empresaAtiva?.codigo || 'empresa'}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado com sucesso',
      description: 'O arquivo com o relatório de reposição foi baixado.',
    })
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sugestão de Compra</h1>
            <Badge variant="outline" className="text-xs font-normal border-slate-300">
              Reposição de Estoque
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Produtos abaixo do estoque mínimo agrupados por fornecedor principal. Cálculo: saldo
            necessário para repor até o estoque máximo (ou 2x o mínimo). Na Etapa 3 dará origem ao
            Pedido de Compra.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>

          <Button
            onClick={exportarCSV}
            variant="outline"
            size="sm"
            disabled={carregando || !resumo || resumo.itensGerais.length === 0}
            className="text-xs h-9 text-slate-700 border-slate-300"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Cartões de Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Itens Abaixo do Mínimo</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-rose-700">
                {carregando ? '—' : resumo?.total_itens_sugeridos || 0}
              </div>
              <span className="text-[11px] text-slate-400">
                de {resumo?.total_produtos_analisados || 0} produtos analisados
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Quantidade Total a Repor</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Package size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {carregando ? '—' : formatarQtd(resumo?.quantidade_total_sugerida || 0)}
              </div>
              <span className="text-[11px] text-slate-400">unidades totais sugeridas</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Custo Total Estimado</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-emerald-700 font-mono">
                {carregando ? '—' : formatarMoeda(resumo?.valor_total_estimado || 0)}
              </div>
              <span className="text-[11px] text-slate-400">baseado no custo médio ponderado</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Fornecedores Envolvidos</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Truck size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {carregando ? '—' : resumo?.gruposPorFornecedor.length || 0}
              </div>
              <span className="text-[11px] text-slate-400">parceiros principais mapeados</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por código, produto ou fornecedor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-50/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Fornecedor:</span>
              <Select value={fornecedorFiltro} onValueChange={setFornecedorFiltro}>
                <SelectTrigger className="w-56 h-9 text-xs">
                  <SelectValue placeholder="Todos os fornecedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os fornecedores</SelectItem>
                  {resumo?.gruposPorFornecedor.map((g) => (
                    <SelectItem key={g.fornecedor_id} value={g.fornecedor_id}>
                      {g.fornecedor_nome} ({g.total_itens})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Relatório Agrupado por Fornecedor */}
      <div className="space-y-6">
        {carregando ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span>Analisando estoque e calculando necessidades de compra...</span>
            </CardContent>
          </Card>
        ) : gruposFiltrados.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <Package className="h-8 w-8 text-slate-300" />
              <span className="font-semibold text-sm text-slate-700">
                Nenhum produto necessita de reposição no momento!
              </span>
              <span className="text-slate-400 max-w-sm">
                Todos os produtos ativos com estoque mínimo configurado estão com saldo suficiente
                para a empresa ativa ({empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}).
              </span>
            </CardContent>
          </Card>
        ) : (
          gruposFiltrados.map((grupo) => (
            <Card key={grupo.fornecedor_id} className="border-slate-200 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                      <Truck size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-bold text-slate-900">
                          {grupo.fornecedor_nome}
                        </CardTitle>
                        {grupo.fornecedor_id !== 'sem_fornecedor' && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 hover:text-blue-600"
                            title="Ver cadastro do fornecedor"
                          >
                            <Link to={`/cadastros/fornecedores/${grupo.fornecedor_id}/editar`}>
                              <ExternalLink size={12} />
                            </Link>
                          </Button>
                        )}
                      </div>
                      <CardDescription className="text-[11px] text-slate-500 mt-0.5">
                        {grupo.fornecedor_cnpj
                          ? `CNPJ: ${grupo.fornecedor_cnpj}`
                          : 'CNPJ não informado'}
                        {grupo.fornecedor_telefone && ` • Tel: ${grupo.fornecedor_telefone}`}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">Itens</div>
                      <div className="font-bold text-slate-900">{grupo.total_itens}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">
                        Qtd Total
                      </div>
                      <div className="font-bold text-slate-900">
                        {formatarQtd(grupo.quantidade_total)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">
                        Estimativa
                      </div>
                      <div className="font-bold text-emerald-700">
                        {formatarMoeda(grupo.valor_total_estimado)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                        <th className="py-2.5 px-4 w-20">Cód.</th>
                        <th className="py-2.5 px-4">Produto</th>
                        <th className="py-2.5 px-4 text-center w-16">UN</th>
                        <th className="py-2.5 px-4 text-right">Saldo Atual</th>
                        <th className="py-2.5 px-4 text-right">Estoque Mín.</th>
                        <th className="py-2.5 px-4 text-right">Estoque Máx.</th>
                        <th className="py-2.5 px-4 text-right font-bold text-blue-700">
                          Qtd Sugerida
                        </th>
                        <th className="py-2.5 px-4 text-right">Custo Médio</th>
                        <th className="py-2.5 px-4 text-right">Total Estimado</th>
                        <th className="py-2.5 px-4 text-center w-16">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grupo.itens.map((item) => (
                        <tr
                          key={item.produto_id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-500">
                            #{item.produto_codigo}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            {item.produto_descricao}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono text-slate-500 text-[11px]">
                            {item.unidade_sigla}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-700">
                            {formatarQtd(item.saldo_atual)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                            {formatarQtd(item.estoque_minimo)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                            {item.estoque_maximo ? formatarQtd(item.estoque_maximo) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-700 bg-blue-50/40">
                            {formatarQtd(item.quantidade_sugerida)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                            {formatarMoeda(item.custo_medio)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatarMoeda(item.custo_total_estimado)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-blue-600"
                              title="Ver ficha do produto"
                            >
                              <Link to={`/cadastros/produtos/${item.produto_id}/editar`}>
                                <ExternalLink size={13} />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

export default SugestaoCompraPage
