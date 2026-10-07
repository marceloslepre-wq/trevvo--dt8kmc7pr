import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  CheckSquare,
  Square,
  FileCheck2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  obterSugestaoCompra,
  ResumoSugestaoCompra,
  GrupoFornecedorSugestao,
  ItemSugestaoCompra,
} from '@/services/sugestaoCompra'
import { salvarPedidoCompra, sugerirCustoUnitarioProduto } from '@/services/pedidosCompra'

interface ItemEdicaoSugestao {
  produto_id: string
  quantidade_sugerida: number
  custo_medio: number
  custo_total_estimado: number
  selecionado: boolean
}

export const SugestaoCompraPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [carregando, setCarregando] = useState(true)
  const [resumo, setResumo] = useState<ResumoSugestaoCompra | null>(null)
  const [busca, setBusca] = useState('')
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos')

  // Mapa de seleção e quantidade editável: produto_id -> ItemEdicaoSugestao
  const [mapaEdicao, setMapaEdicao] = useState<Map<string, ItemEdicaoSugestao>>(new Map())

  // Modal de confirmação de geração de pedidos
  const [modalGerarAberto, setModalGerarAberto] = useState(false)
  const [gerandoPedidos, setGerandoPedidos] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const data = await obterSugestaoCompra(empresaAtiva.id)
      setResumo(data)

      // Inicializa mapa de edição com todos os itens marcados por padrão
      const novoMapa = new Map<string, ItemEdicaoSugestao>()
      data.itensGerais.forEach((item) => {
        novoMapa.set(item.produto_id, {
          produto_id: item.produto_id,
          quantidade_sugerida: item.quantidade_sugerida,
          custo_medio: item.custo_medio,
          custo_total_estimado: item.custo_total_estimado,
          selecionado: true,
        })
      })
      setMapaEdicao(novoMapa)
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

  // Alterna seleção de um item individual
  const toggleSelecaoItem = (produtoId: string) => {
    setMapaEdicao((prev) => {
      const copia = new Map(prev)
      const atual = copia.get(produtoId)
      if (atual) {
        copia.set(produtoId, { ...atual, selecionado: !atual.selecionado })
      }
      return copia
    })
  }

  // Altera quantidade de compra do item
  const alterarQuantidadeItem = (produtoId: string, novaQtd: number) => {
    setMapaEdicao((prev) => {
      const copia = new Map(prev)
      const atual = copia.get(produtoId)
      if (atual) {
        const qtd = Math.max(0, novaQtd)
        copia.set(produtoId, {
          ...atual,
          quantidade_sugerida: qtd,
          custo_total_estimado: Math.round(qtd * atual.custo_medio * 100) / 100,
        })
      }
      return copia
    })
  }

  // Alternar todos os itens de um grupo/fornecedor
  const toggleSelecaoGrupo = (itensDoGrupo: ItemSugestaoCompra[], marcar: boolean) => {
    setMapaEdicao((prev) => {
      const copia = new Map(prev)
      itensDoGrupo.forEach((it) => {
        const atual = copia.get(it.produto_id)
        if (atual) {
          copia.set(it.produto_id, { ...atual, selecionado: marcar })
        }
      })
      return copia
    })
  }

  // Alternar todos os itens da tela
  const toggleSelecionarTodos = (marcar: boolean) => {
    setMapaEdicao((prev) => {
      const copia = new Map(prev)
      copia.forEach((val, key) => {
        copia.set(key, { ...val, selecionado: marcar })
      })
      return copia
    })
  }

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

  // Contagem de itens selecionados
  const totalItensSelecionados = useMemo(() => {
    let cont = 0
    mapaEdicao.forEach((val) => {
      if (val.selecionado && val.quantidade_sugerida > 0) {
        cont++
      }
    })
    return cont
  }, [mapaEdicao])

  // Resumo para o modal de geração de pedidos agrupado por fornecedor
  const gruposParaGeracao = useMemo(() => {
    if (!resumo) return []

    const resultado: {
      fornecedor_id: string
      fornecedor_nome: string
      sem_fornecedor: boolean
      itens: {
        produto_id: string
        produto_codigo: string | number
        produto_descricao: string
        unidade_sigla: string
        quantidade: number
        custo_unitario: number
        total: number
      }[]
      total_valor: number
    }[] = []

    resumo.gruposPorFornecedor.forEach((grupo) => {
      const itensEscolhidos = grupo.itens
        .map((it) => {
          const edicao = mapaEdicao.get(it.produto_id)
          if (!edicao || !edicao.selecionado || edicao.quantidade_sugerida <= 0) {
            return null
          }
          return {
            produto_id: it.produto_id,
            produto_codigo: it.produto_codigo,
            produto_descricao: it.produto_descricao,
            unidade_sigla: it.unidade_sigla,
            quantidade: edicao.quantidade_sugerida,
            custo_unitario: edicao.custo_medio,
            total: edicao.custo_total_estimado,
          }
        })
        .filter(Boolean) as {
        produto_id: string
        produto_codigo: string | number
        produto_descricao: string
        unidade_sigla: string
        quantidade: number
        custo_unitario: number
        total: number
      }[]

      if (itensEscolhidos.length > 0) {
        resultado.push({
          fornecedor_id: grupo.fornecedor_id,
          fornecedor_nome: grupo.fornecedor_nome,
          sem_fornecedor: grupo.fornecedor_id === 'sem_fornecedor',
          itens: itensEscolhidos,
          total_valor: Math.round(itensEscolhidos.reduce((acc, i) => acc + i.total, 0) * 100) / 100,
        })
      }
    })

    return resultado
  }, [resumo, mapaEdicao])

  // Executa a geração dos Pedidos de Compra em Rascunho
  const handleConfirmarGeracaoPedidos = async () => {
    if (!empresaAtiva?.id) return

    // Valida se há itens sem fornecedor principal
    const temSemFornecedor = gruposParaGeracao.some((g) => g.sem_fornecedor)
    if (temSemFornecedor) {
      toast({
        title: 'Fornecedor não configurado',
        description:
          'Há itens selecionados sem fornecedor principal vinculado. Vincule o fornecedor nos produtos antes de gerar.',
        variant: 'destructive',
      })
      return
    }

    setGerandoPedidos(true)
    const criadosIds: string[] = []

    try {
      for (const grupo of gruposParaGeracao) {
        const novo = await salvarPedidoCompra({
          empresa_id: empresaAtiva.id,
          fornecedor_id: grupo.fornecedor_id,
          data_emissao: new Date().toISOString().slice(0, 10),
          observacao: `Gerado automaticamente a partir da Sugestão de Reposição de Estoque em ${new Date().toLocaleDateString('pt-BR')}.`,
          itens: grupo.itens.map((it) => ({
            produto_id: it.produto_id,
            quantidade: it.quantidade,
            custo_unitario: it.custo_unitario,
            desconto_percentual: 0,
            aliquota_ipi: 0,
            valor_icms_st_estimado: 0,
            valor_total: it.total,
          })),
        })
        criadosIds.push(novo.id)
      }

      toast({
        title: 'Pedidos de compra gerados!',
        description: `${criadosIds.length} pedido(s) em Rascunho criado(s) com sucesso.`,
      })

      setModalGerarAberto(false)
      // Se gerou apenas 1, vai direto para ele; se gerou vários, vai para a listagem
      if (criadosIds.length === 1) {
        navigate(`/compras/pedidos/${criadosIds[0]}`)
      } else {
        navigate('/compras/pedidos')
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao gerar pedidos',
        description: err instanceof Error ? err.message : 'Falha na geração dos pedidos',
        variant: 'destructive',
      })
    } finally {
      setGerandoPedidos(false)
    }
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
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
        const ed = mapaEdicao.get(item.produto_id)
        const qtdFinal = ed ? ed.quantidade_sugerida : item.quantidade_sugerida
        const totalFinal = ed ? ed.custo_total_estimado : item.custo_total_estimado

        linhas.push([
          `"${grupo.fornecedor_nome.replace(/"/g, '""')}"`,
          `"${item.produto_codigo}"`,
          `"${item.produto_descricao.replace(/"/g, '""')}"`,
          item.unidade_sigla,
          item.saldo_atual.toString().replace('.', ','),
          item.estoque_minimo.toString().replace('.', ','),
          item.estoque_maximo ? item.estoque_maximo.toString().replace('.', ',') : 'Não definido',
          qtdFinal.toString().replace('.', ','),
          item.custo_medio.toFixed(2).replace('.', ','),
          totalFinal.toFixed(2).replace('.', ','),
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
            Produtos abaixo do estoque mínimo agrupados por fornecedor principal. Selecione os itens
            desejados e gere pedidos de compra diretamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Gerar Pedidos de Compra */}
          {pode('compras', 'criar') && (
            <Button
              type="button"
              onClick={() => setModalGerarAberto(true)}
              disabled={carregando || totalItensSelecionados === 0}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileCheck2 className="h-4 w-4 mr-1.5" />
              Gerar pedidos de compra ({totalItensSelecionados})
            </Button>
          )}

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

      {/* Filtros e Seleção Rápida */}
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

            <div className="flex flex-wrap items-center gap-3">
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

              {/* Botões selecionar / desselecionar todos */}
              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSelecionarTodos(true)}
                  className="h-8 text-xs text-slate-600 hover:text-blue-700"
                >
                  Marcar Todos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSelecionarTodos(false)}
                  className="h-8 text-xs text-slate-600 hover:text-slate-900"
                >
                  Desmarcar
                </Button>
              </div>
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
          gruposFiltrados.map((grupo) => {
            const todosDoGrupoMarcados = grupo.itens.every(
              (i) => mapaEdicao.get(i.produto_id)?.selecionado,
            )

            return (
              <Card
                key={grupo.fornecedor_id}
                className="border-slate-200 shadow-xs overflow-hidden"
              >
                <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {/* Checkbox para selecionar/desmarcar o grupo inteiro */}
                      <input
                        type="checkbox"
                        checked={todosDoGrupoMarcados}
                        onChange={(e) => toggleSelecaoGrupo(grupo.itens, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        title={todosDoGrupoMarcados ? 'Desmarcar fornecedor' : 'Marcar fornecedor'}
                      />
                      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <Truck size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-bold text-slate-900">
                            {grupo.fornecedor_nome}
                          </CardTitle>
                          {grupo.fornecedor_id === 'sem_fornecedor' ? (
                            <Badge
                              variant="outline"
                              className="bg-rose-50 text-rose-700 border-rose-300 text-[10px]"
                            >
                              Sem fornecedor vinculado
                            </Badge>
                          ) : (
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
                          <th className="py-2.5 px-3 w-10 text-center">Sel.</th>
                          <th className="py-2.5 px-3 w-16">Cód.</th>
                          <th className="py-2.5 px-3">Produto</th>
                          <th className="py-2.5 px-3 text-center w-14">UN</th>
                          <th className="py-2.5 px-3 text-right w-20">Saldo Atual</th>
                          <th className="py-2.5 px-3 text-right w-20">Estoque Mín.</th>
                          <th className="py-2.5 px-3 text-right w-20">Estoque Máx.</th>
                          <th className="py-2.5 px-3 text-right w-28 font-bold text-blue-700">
                            Qtd Compra
                          </th>
                          <th className="py-2.5 px-3 text-right w-24">Custo Médio</th>
                          <th className="py-2.5 px-3 text-right w-28">Total Estimado</th>
                          <th className="py-2.5 px-3 text-center w-12">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grupo.itens.map((item) => {
                          const edicao = mapaEdicao.get(item.produto_id)
                          const selecionado = edicao?.selecionado ?? true
                          const qtdEditavel =
                            edicao?.quantidade_sugerida ?? item.quantidade_sugerida
                          const totalCalculado =
                            edicao?.custo_total_estimado ?? item.custo_total_estimado

                          return (
                            <tr
                              key={item.produto_id}
                              className={`transition-colors ${
                                selecionado
                                  ? 'bg-white hover:bg-blue-50/30'
                                  : 'bg-slate-50/60 opacity-60'
                              }`}
                            >
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selecionado}
                                  onChange={() => toggleSelecaoItem(item.produto_id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                                #{item.produto_codigo}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {item.produto_descricao}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-500 text-[11px]">
                                {item.unidade_sigla}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-700">
                                {formatarQtd(item.saldo_atual)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {formatarQtd(item.estoque_minimo)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                {item.estoque_maximo ? formatarQtd(item.estoque_maximo) : '-'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={qtdEditavel}
                                  onChange={(e) =>
                                    alterarQuantidadeItem(
                                      item.produto_id,
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="h-8 text-right font-mono font-bold text-xs w-24 ml-auto text-blue-700 bg-white"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {formatarMoeda(item.custo_medio)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {formatarMoeda(totalCalculado)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
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
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal de Confirmação para Geração de Pedidos */}
      <Dialog open={modalGerarAberto} onOpenChange={setModalGerarAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar Pedidos de Compra</DialogTitle>
            <DialogDescription>
              Será criado um Pedido de Compra em status <strong>Rascunho</strong> para cada
              fornecedor com itens selecionados. Os valores e quantidades podem ser revisados antes
              de enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {gruposParaGeracao.map((g) => (
              <div
                key={g.fornecedor_id}
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  g.sem_fornecedor
                    ? 'border-rose-200 bg-rose-50/60'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-blue-600" />
                    <span className="font-bold text-slate-900">{g.fornecedor_nome}</span>
                    {g.sem_fornecedor && (
                      <Badge variant="destructive" className="text-[10px]">
                        Sem fornecedor no cadastro
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatarMoeda(g.total_valor)}
                  </span>
                </div>

                <div className="divide-y divide-slate-200/60 bg-white rounded border border-slate-200/70 p-2 max-h-36 overflow-y-auto">
                  {g.itens.map((it) => (
                    <div
                      key={it.produto_id}
                      className="py-1 flex items-center justify-between text-[11px]"
                    >
                      <span className="truncate max-w-xs text-slate-700">
                        #{it.produto_codigo} - {it.produto_descricao}
                      </span>
                      <span className="font-mono text-slate-900">
                        {formatarQtd(it.quantidade)} {it.unidade_sigla} ×{' '}
                        {formatarMoeda(it.custo_unitario)} = {formatarMoeda(it.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-xs text-slate-500">
              Total: {gruposParaGeracao.length} pedido(s) a gerar
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalGerarAberto(false)}
                disabled={gerandoPedidos}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmarGeracaoPedidos}
                disabled={gerandoPedidos || gruposParaGeracao.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {gerandoPedidos ? 'Gerando pedidos...' : 'Confirmar e Gerar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SugestaoCompraPage
