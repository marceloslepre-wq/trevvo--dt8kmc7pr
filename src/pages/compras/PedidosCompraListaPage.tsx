import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  Eye,
  FileText,
  Copy,
  XCircle,
  Send,
  RotateCcw,
  CheckCircle2,
  Clock,
  Building,
  User,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  PedidoCompra,
  StatusPedidoCompra,
  listarPedidosCompra,
  enviarPedidoCompra,
  reabrirPedidoCompra,
  cancelarPedidoCompra,
  duplicarPedidoCompra,
} from '@/services/pedidosCompra'
import { listarTodosFornecedoresAtivos, Fornecedor } from '@/services/fornecedores'
import { listarUsuarios, Usuario } from '@/services/usuarios'

export const PedidosCompraListaPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Filtros
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos')
  const [compradorFiltro, setCompradorFiltro] = useState<string>('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Listas auxiliares para filtros
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [compradores, setCompradores] = useState<Usuario[]>([])

  // Diálogo de cancelamento
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState<PedidoCompra | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  // Carregar listas auxiliares
  useEffect(() => {
    listarTodosFornecedoresAtivos()
      .then(setFornecedores)
      .catch(() => {})
    listarUsuarios({ situacao: 'ativos', perPage: 100 })
      .then((res) => setCompradores(res.items))
      .catch(() => {})
  }, [])

  const carregarPedidos = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await listarPedidosCompra({
        empresaId: empresaAtiva.id,
        status: statusFiltro !== 'todos' ? statusFiltro : undefined,
        fornecedorId: fornecedorFiltro !== 'todos' ? fornecedorFiltro : undefined,
        compradorId: compradorFiltro !== 'todos' ? compradorFiltro : undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        busca: busca.trim() || undefined,
        pagina,
        itensPorPagina: 15,
      })
      setPedidos(res.items)
      setTotalPaginas(res.totalPages || 1)
      setTotalItens(res.totalItems || 0)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar pedidos'
      toast({
        title: 'Erro ao listar pedidos',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva?.id,
    statusFiltro,
    fornecedorFiltro,
    compradorFiltro,
    dataInicio,
    dataFim,
    busca,
    pagina,
    toast,
  ])

  useEffect(() => {
    carregarPedidos()
  }, [carregarPedidos])

  // Ações de fluxo
  const handleEnviar = async (pedido: PedidoCompra) => {
    if (!pode('compras', 'editar')) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para alterar pedidos.',
        variant: 'destructive',
      })
      return
    }
    if (!confirm(`Deseja enviar o Pedido #${pedido.numero}?`)) return
    try {
      await enviarPedidoCompra(pedido.id, empresaAtiva!.id)
      toast({
        title: 'Pedido enviado com sucesso',
        description: `O Pedido #${pedido.numero} agora está com status "Enviado".`,
      })
      carregarPedidos()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao enviar pedido',
        description: err instanceof Error ? err.message : 'Falha na operação',
        variant: 'destructive',
      })
    }
  }

  const handleReabrir = async (pedido: PedidoCompra) => {
    if (!pode('compras', 'editar')) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para reabrir pedidos.',
        variant: 'destructive',
      })
      return
    }
    if (!confirm(`Deseja reabrir o Pedido #${pedido.numero} para Rascunho?`)) return
    try {
      await reabrirPedidoCompra(pedido.id, empresaAtiva!.id)
      toast({
        title: 'Pedido reaberto',
        description: `O Pedido #${pedido.numero} voltou para status "Rascunho".`,
      })
      carregarPedidos()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao reabrir pedido',
        description: err instanceof Error ? err.message : 'Falha na operação',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmarCancelamento = async () => {
    if (!pedidoParaCancelar) return
    if (!motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Por favor informe o motivo do cancelamento.',
        variant: 'destructive',
      })
      return
    }
    setCancelando(true)
    try {
      await cancelarPedidoCompra(pedidoParaCancelar.id, empresaAtiva!.id, motivoCancelamento.trim())
      toast({
        title: 'Pedido cancelado',
        description: `O Pedido #${pedidoParaCancelar.numero} foi cancelado com sucesso.`,
      })
      setPedidoParaCancelar(null)
      setMotivoCancelamento('')
      carregarPedidos()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao cancelar',
        description: err instanceof Error ? err.message : 'Falha na operação',
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  const handleDuplicar = async (pedido: PedidoCompra) => {
    if (!pode('compras', 'criar')) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para criar pedidos.',
        variant: 'destructive',
      })
      return
    }
    try {
      const duplicado = await duplicarPedidoCompra(pedido.id, empresaAtiva!.id)
      toast({
        title: 'Pedido duplicado com sucesso',
        description: `Novo Pedido #${duplicado.numero} criado como Rascunho.`,
      })
      navigate(`/compras/pedidos/${duplicado.id}/editar`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar',
        description: err instanceof Error ? err.message : 'Falha na duplicação',
        variant: 'destructive',
      })
    }
  }

  const exportarCSV = () => {
    if (pedidos.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Nenhum pedido encontrado com os filtros atuais.',
      })
      return
    }

    const cabecalho = [
      'Número',
      'Data Emissão',
      'Fornecedor',
      'Comprador',
      'Previsão de Entrega',
      'Status',
      'Valor Produtos (R$)',
      'Desconto (R$)',
      'Frete (R$)',
      'Total (R$)',
    ]

    const linhas = pedidos.map((p) => {
      const fornecedorNome =
        p.expand?.fornecedor_id?.razao_social ||
        p.expand?.fornecedor_id?.nome_fantasia ||
        'Fornecedor não identificado'
      const compradorNome = p.expand?.comprador_id?.nome || 'Não definido'
      return [
        `"${p.numero}"`,
        `"${p.data_emissao || ''}"`,
        `"${fornecedorNome.replace(/"/g, '""')}"`,
        `"${compradorNome.replace(/"/g, '""')}"`,
        `"${p.data_previsao_entrega || ''}"`,
        `"${p.status}"`,
        (p.valor_produtos || 0).toFixed(2).replace('.', ','),
        (p.valor_desconto || 0).toFixed(2).replace('.', ','),
        (p.valor_frete || 0).toFixed(2).replace('.', ','),
        (p.valor_total || 0).toFixed(2).replace('.', ','),
      ]
    })

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `pedidos_compra_${empresaAtiva?.codigo || 'empresa'}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'A lista de pedidos foi baixada com sucesso.',
    })
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
  }

  const formatarData = (dataStr?: string) => {
    if (!dataStr) return '-'
    const partes = dataStr.slice(0, 10).split('-')
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`
    }
    return dataStr
  }

  const renderBadgeStatus = (status: StatusPedidoCompra) => {
    switch (status) {
      case 'Rascunho':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-700 border-slate-300 font-medium"
          >
            Rascunho
          </Badge>
        )
      case 'Enviado':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-medium">
            Enviado
          </Badge>
        )
      case 'Parcialmente recebido':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-300 font-medium"
          >
            Parcialmente recebido
          </Badge>
        )
      case 'Recebido':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-300 font-medium"
          >
            Recebido
          </Badge>
        )
      case 'Cancelado':
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300 font-medium">
            Cancelado
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pedidos de Compra</h1>
            <Badge variant="outline" className="text-xs font-normal border-slate-300">
              Etapa 3 — Compras
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gerenciamento e emissão de pedidos de compra para reposição de suprimentos e
            mercadorias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={exportarCSV}
            variant="outline"
            size="sm"
            disabled={carregando || pedidos.length === 0}
            className="text-xs h-9"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Exportar CSV
          </Button>

          {pode('compras', 'criar') && (
            <Button
              asChild
              size="sm"
              className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Link to="/compras/pedidos/novo">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo Pedido
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Busca textual */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por número ou fornecedor..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPagina(1)
                }}
                className="pl-9 h-9 text-xs bg-slate-50/50"
              />
            </div>

            {/* Filtro Status */}
            <Select
              value={statusFiltro}
              onValueChange={(val) => {
                setStatusFiltro(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Status: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Status: Todos</SelectItem>
                <SelectItem value="Rascunho">Rascunho</SelectItem>
                <SelectItem value="Enviado">Enviado</SelectItem>
                <SelectItem value="Parcialmente recebido">Parcialmente recebido</SelectItem>
                <SelectItem value="Recebido">Recebido</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro Fornecedor */}
            <Select
              value={fornecedorFiltro}
              onValueChange={(val) => {
                setFornecedorFiltro(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Fornecedor: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Fornecedor: Todos</SelectItem>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.razao_social || f.nome_fantasia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro Comprador */}
            <Select
              value={compradorFiltro}
              onValueChange={(val) => {
                setCompradorFiltro(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Comprador: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Comprador: Todos</SelectItem>
                {compradores.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>Período:</span>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  setPagina(1)
                }}
                className="h-8 w-36 text-xs"
              />
              <span>até</span>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value)
                  setPagina(1)
                }}
                className="h-8 w-36 text-xs"
              />
              {(dataInicio ||
                dataFim ||
                busca ||
                statusFiltro !== 'todos' ||
                fornecedorFiltro !== 'todos' ||
                compradorFiltro !== 'todos') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBusca('')
                    setStatusFiltro('todos')
                    setFornecedorFiltro('todos')
                    setCompradorFiltro('todos')
                    setDataInicio('')
                    setDataFim('')
                    setPagina(1)
                  }}
                  className="h-8 text-xs text-slate-500 hover:text-slate-800"
                >
                  Limpar filtros
                </Button>
              )}
            </div>

            <span className="font-mono">{totalItens} pedido(s) encontrado(s)</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Pedidos */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4 w-20">Número</th>
                <th className="py-3 px-4">Data Emissão</th>
                <th className="py-3 px-4">Fornecedor</th>
                <th className="py-3 px-4">Comprador</th>
                <th className="py-3 px-4">Previsão</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">% Recebido</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Carregando pedidos de compra...
                  </td>
                </tr>
              ) : pedidos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nenhum pedido de compra encontrado.
                  </td>
                </tr>
              ) : (
                pedidos.map((pedido) => {
                  const fornecedorNome =
                    pedido.expand?.fornecedor_id?.razao_social ||
                    pedido.expand?.fornecedor_id?.nome_fantasia ||
                    'Fornecedor não identificado'
                  const compradorNome = pedido.expand?.comprador_id?.nome || '-'

                  // Cálculo de % recebido a partir da soma dos itens (ou fallback por status)
                  const percRecebido =
                    pedido.percentual_recebido !== undefined && pedido.percentual_recebido !== null
                      ? `${pedido.percentual_recebido}%`
                      : pedido.status === 'Recebido'
                        ? '100%'
                        : pedido.status === 'Rascunho' || pedido.status === 'Enviado'
                          ? '0%'
                          : '-'

                  return (
                    <tr key={pedido.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        #{pedido.numero}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatarData(pedido.data_emissao)}
                      </td>
                      <td
                        className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate"
                        title={fornecedorNome}
                      >
                        {fornecedorNome}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{compradorNome}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatarData(pedido.data_previsao_entrega)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatarMoeda(pedido.valor_total)}
                      </td>
                      <td className="py-3 px-4 text-center">{renderBadgeStatus(pedido.status)}</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {percRecebido}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-blue-600"
                            title="Ver / Editar"
                          >
                            <Link to={`/compras/pedidos/${pedido.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>

                          {/* Enviar */}
                          {pedido.status === 'Rascunho' && pode('compras', 'editar') && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEnviar(pedido)}
                              className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              title="Enviar Pedido"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Reabrir */}
                          {pedido.status === 'Enviado' && pode('compras', 'editar') && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleReabrir(pedido)}
                              className="h-7 w-7 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                              title="Reabrir para Rascunho"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Duplicar */}
                          {pode('compras', 'criar') && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicar(pedido)}
                              className="h-7 w-7 text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                              title="Duplicar Pedido"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Cancelar (só Rascunho ou Enviado) */}
                          {(pedido.status === 'Rascunho' || pedido.status === 'Enviado') &&
                            pode('compras', 'excluir') && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setPedidoParaCancelar(pedido)
                                  setMotivoCancelamento('')
                                }}
                                className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                title="Cancelar Pedido"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1 || carregando}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas || carregando}
                className="h-8 px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Diálogo de Cancelamento */}
      <Dialog
        open={Boolean(pedidoParaCancelar)}
        onOpenChange={(open) => !open && setPedidoParaCancelar(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Pedido de Compra #{pedidoParaCancelar?.numero}</DialogTitle>
            <DialogDescription>
              Esta ação cancelará o pedido. Cancelamentos só são permitidos antes de qualquer
              recebimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-slate-700">
              Motivo do cancelamento <span className="text-rose-500">*</span>
            </label>
            <Textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Ex: Fornecedor sem disponibilidade de estoque no prazo exigido..."
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPedidoParaCancelar(null)}
              disabled={cancelando}
            >
              Fechar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmarCancelamento}
              disabled={cancelando || !motivoCancelamento.trim()}
            >
              {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PedidosCompraListaPage
