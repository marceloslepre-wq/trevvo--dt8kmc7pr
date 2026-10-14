import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Copy,
  ArrowRightCircle,
  Ban,
  CheckCircle2,
  Calendar,
  User,
  AlertCircle,
  DollarSign,
  Send,
  Loader2,
  X,
  Clock,
  Eye,
  Edit,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  listarVendas,
  atualizarOrcamentosExpirados,
  duplicarVenda,
  converterOrcamentoEmPedido,
  obterVendaCompleta,
  Venda,
  StatusVenda,
  TipoVenda,
} from '@/services/vendas'
import {
  imprimirOrcamentoOuPedido,
  imprimirComprovanteNaoFiscal,
  abrirEnvioWhatsApp,
} from '@/services/vendasImpressao'
import { listarVendedoresAtivos } from '@/services/clientes'
import SelectCliente from '@/components/SelectCliente'
import { ModalFinalizarVenda } from './ModalFinalizarVenda'
import { ModalCancelarVenda } from './ModalCancelarVenda'

export const VendasListaPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, usuarioERP } = usePermissoes()

  const podeGravarVendas = pode('vendas', 'criar') || pode('vendas', 'editar')
  const podeExcluirVendas = pode('vendas', 'excluir')

  const [vendas, setVendas] = useState<Venda[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [porPagina] = useState(20)
  const [carregando, setCarregando] = useState(false)

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroClienteId, setFiltroClienteId] = useState<string>('')
  const [filtroVendedorId, setFiltroVendedorId] = useState<string>('todos')
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('')
  const [filtroDataFim, setFiltroDataFim] = useState<string>('')
  const [termoBusca, setTermoBusca] = useState<string>('')

  // Lista de vendedores para o select
  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string }>>([])

  // Modais de Ação
  const [vendaParaFinalizar, setVendaParaFinalizar] = useState<Venda | null>(null)
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false)
  const [vendaParaCancelar, setVendaParaCancelar] = useState<Venda | null>(null)
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)

  // Carregar vendedores ativos
  useEffect(() => {
    listarVendedoresAtivos()
      .then(setVendedores)
      .catch(() => {})
  }, [])

  // Atualizar orçamentos expirados na abertura da lista
  useEffect(() => {
    if (empresaAtiva?.id) {
      atualizarOrcamentosExpirados(empresaAtiva.id).catch(() => {})
    }
  }, [empresaAtiva?.id])

  // Busca e paginação de vendas
  const carregarLista = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await listarVendas({
        empresa_id: empresaAtiva.id,
        tipo: filtroTipo,
        status: filtroStatus,
        cliente_id: filtroClienteId || undefined,
        vendedor_id: filtroVendedorId !== 'todos' ? filtroVendedorId : undefined,
        data_inicio: filtroDataInicio || undefined,
        data_fim: filtroDataFim || undefined,
        termo_busca: termoBusca || undefined,
        pagina,
        por_pagina: porPagina,
      })

      setVendas(res.items)
      setTotalItems(res.totalItems)
    } catch (err: unknown) {
      console.error('Erro ao listar vendas:', err)
      toast({
        title: 'Erro ao carregar vendas',
        description: err instanceof Error ? err.message : 'Falha ao buscar registros.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva?.id,
    filtroTipo,
    filtroStatus,
    filtroClienteId,
    filtroVendedorId,
    filtroDataInicio,
    filtroDataFim,
    termoBusca,
    pagina,
    porPagina,
    toast,
  ])

  useEffect(() => {
    carregarLista()
  }, [carregarLista])

  // Helper para cor do status
  const getBadgeStatus = (status: StatusVenda) => {
    switch (status) {
      case 'Orçamento':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Orçamento</Badge>
      case 'Orçamento expirado':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300">Orçamento expirado</Badge>
      case 'Pedido em aberto':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Pedido em aberto</Badge>
      case 'Finalizada':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Finalizada</Badge>
      case 'Cancelada':
        return <Badge className="bg-red-100 text-red-800 border-red-300">Cancelada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Exportar CSV
  const handleExportarCsv = () => {
    if (vendas.length === 0) {
      toast({
        title: 'Nenhum dado',
        description: 'Não há vendas na listagem para exportação.',
      })
      return
    }

    const cabecalho = [
      'Número',
      'Tipo',
      'Status',
      'Data Emissão',
      'Cliente',
      'CPF/CNPJ',
      'Vendedor',
      'Valor Produtos',
      'Descontos',
      'Acréscimo',
      'Frete',
      'Valor Total',
      'Situação Fiscal',
    ]

    const linhasCsv = vendas.map((v) => {
      const cli = v.expand?.cliente_id
      const cliNome =
        cli?.nome_razao_social || cli?.nome || v.cpf_cnpj_consumidor || 'Consumidor Final'
      const cliDoc = cli?.cpf_cnpj || v.cpf_cnpj_consumidor || ''
      const vendNome = v.expand?.vendedor_id?.nome || ''

      return [
        v.numero,
        v.tipo,
        v.status,
        v.data_emissao || '',
        `"${cliNome.replace(/"/g, '""')}"`,
        `"${cliDoc}"`,
        `"${vendNome.replace(/"/g, '""')}"`,
        Number(v.valor_produtos || 0).toFixed(2),
        (Number(v.valor_desconto_itens || 0) + Number(v.valor_desconto_total || 0)).toFixed(2),
        Number(v.valor_acrescimo || 0).toFixed(2),
        Number(v.valor_frete || 0).toFixed(2),
        Number(v.valor_total || 0).toFixed(2),
        v.documento_fiscal_status || 'Não emitido',
      ].join(';')
    })

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhasCsv].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `vendas_${empresaAtiva?.nome_fantasia || 'erp'}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Ações de cada Venda
  const handleImprimir = async (venda: Venda) => {
    try {
      const { venda: vCompleta, itens, pagamentos } = await obterVendaCompleta(venda.id)
      if (venda.status === 'Finalizada') {
        imprimirComprovanteNaoFiscal({
          venda: vCompleta,
          itens,
          pagamentos,
          empresa: empresaAtiva || {},
          cliente: vCompleta.expand?.cliente_id,
          vendedorNome: vCompleta.expand?.vendedor_id?.nome,
        })
      } else {
        imprimirOrcamentoOuPedido({
          venda: vCompleta,
          itens,
          empresa: empresaAtiva || {},
          cliente: vCompleta.expand?.cliente_id,
          vendedorNome: vCompleta.expand?.vendedor_id?.nome,
          condicaoNome: vCompleta.expand?.condicao_pagamento_id?.nome,
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao imprimir',
        description: err instanceof Error ? err.message : 'Falha ao buscar dados da venda.',
        variant: 'destructive',
      })
    }
  }

  const handleWhatsApp = (venda: Venda) => {
    const cli = venda.expand?.cliente_id
    const telefone = cli?.celular || cli?.telefone
    abrirEnvioWhatsApp({
      telefone,
      numeroVenda: venda.numero,
      tipo: venda.tipo,
      clienteNome: cli?.nome_razao_social || cli?.nome,
      valorTotal: Number(venda.valor_total || 0),
      empresaNome: empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social,
      dataValidade: venda.data_validade,
    })
  }

  const handleDuplicar = async (venda: Venda) => {
    if (!podeGravarVendas) return
    try {
      setCarregando(true)
      const nova = await duplicarVenda(venda.id, venda.tipo === 'Orçamento' ? 'Orçamento' : 'Pedido')
      toast({
        title: 'Venda duplicada',
        description: `Novo registro #${nova.numero} gerado a partir da venda #${venda.numero}.`,
      })
      navigate(`/vendas/pedidos/${nova.id}`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar',
        description: err instanceof Error ? err.message : 'Falha na duplicação da venda.',
        variant: 'destructive',
      })
      setCarregando(false)
    }
  }

  const handleConverterPedido = async (venda: Venda) => {
    try {
      await converterOrcamentoEmPedido(venda.id)
      toast({
        title: 'Orçamento convertido em Pedido',
        description: `Orçamento #${venda.numero} transformado em Pedido em aberto com sucesso.`,
      })
      carregarLista()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao converter',
        description: err instanceof Error ? err.message : 'Falha na conversão.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Orçamentos e Pedidos de Venda
            </h1>
            <Badge variant="outline" className="text-xs bg-slate-50 font-normal">
              {totalItems} {totalItems === 1 ? 'registro' : 'registros'}
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Gerenciamento comercial: orçamentos, pedidos de venda, finalização financeira e comprovantes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={vendas.length === 0}
            className="text-xs gap-1.5"
          >
            <Download size={14} />
            <span>Exportar CSV</span>
          </Button>

          {podeGravarVendas && (
            <Button
              type="button"
              size="sm"
              onClick={() => navigate('/vendas/pedidos/novo')}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Plus size={15} />
              <span>Novo Orçamento / Pedido</span>
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Busca por texto ou número */}
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">
              Buscar por Número / Obs
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              <Input
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Ex.: 1045, garantia..."
                className="h-8 pl-8 text-xs"
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => setTermoBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Filtro Tipo */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Tipo</label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="Orçamento">Orçamento</SelectItem>
                <SelectItem value="Pedido">Pedido</SelectItem>
                <SelectItem value="PDV">PDV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Status</label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="Orçamento">Orçamento</SelectItem>
                <SelectItem value="Orçamento expirado">Orçamento expirado</SelectItem>
                <SelectItem value="Pedido em aberto">Pedido em aberto</SelectItem>
                <SelectItem value="Finalizada">Finalizada</SelectItem>
                <SelectItem value="Cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Vendedor */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Vendedor</label>
            <Select value={filtroVendedorId} onValueChange={setFiltroVendedorId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Vendedor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Período Data Inicial */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Data Início</label>
            <Input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Linha 2 de Filtros: Cliente e Data Fim */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Cliente</label>
            <SelectCliente
              value={filtroClienteId}
              onChange={(id) => setFiltroClienteId(id)}
              placeholder="Filtrar por cliente..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase">Data Fim</label>
            <Input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFiltroTipo('todos')
                setFiltroStatus('todos')
                setFiltroClienteId('')
                setFiltroVendedorId('todos')
                setFiltroDataInicio('')
                setFiltroDataFim('')
                setTermoBusca('')
                setPagina(1)
              }}
              className="h-8 text-xs text-slate-600 hover:text-slate-900"
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Vendas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {carregando ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-xs">Carregando listagem de vendas...</span>
          </div>
        ) : vendas.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <FileText className="h-10 w-10 mx-auto text-slate-300 stroke-1" />
            <p className="text-sm font-semibold">Nenhuma venda encontrada</p>
            <p className="text-xs text-slate-400">
              Ajuste os filtros de busca ou cadastre um novo orçamento/pedido.
            </p>
            {podeGravarVendas && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/vendas/pedidos/novo')}
                className="mt-2 text-xs"
              >
                Cadastrar Orçamento / Pedido
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Número</th>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Vendedor</th>
                  <th className="py-3 px-3 text-right">Total (R$)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Situação Fiscal</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendas.map((v) => {
                  const cli = v.expand?.cliente_id
                  const cliNome =
                    cli?.nome_razao_social ||
                    cli?.nome ||
                    cli?.nome_fantasia ||
                    v.cpf_cnpj_consumidor ||
                    'Consumidor Final'
                  const vendNome = v.expand?.vendedor_id?.nome || '-'
                  const dtEmissao = v.data_emissao
                    ? new Date(v.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
                    : '-'

                  const ehOrcamento = v.tipo === 'Orçamento'
                  const ehFinalizada = v.status === 'Finalizada'
                  const ehCancelada = v.status === 'Cancelada'

                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => navigate(`/vendas/pedidos/${v.id}`)}
                    >
                      {/* Número + Tipo */}
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm">#{v.numero}</span>
                          <span className="text-[10px] text-slate-400 font-normal">({v.tipo})</span>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="py-3 px-3 text-slate-600">
                        <div>{dtEmissao}</div>
                        {v.data_validade && ehOrcamento && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock size={10} />
                            Val: {new Date(v.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-3 max-w-[240px]">
                        <div className="font-medium text-slate-900 truncate">{cliNome}</div>
                        {(cli?.cpf_cnpj || v.cpf_cnpj_consumidor) && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {cli?.cpf_cnpj || v.cpf_cnpj_consumidor}
                          </div>
                        )}
                      </td>

                      {/* Vendedor */}
                      <td className="py-3 px-3 text-slate-600">{vendNome}</td>

                      {/* Total */}
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        R$ {Number(v.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">{getBadgeStatus(v.status)}</td>

                      {/* Situação Fiscal */}
                      <td className="py-3 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-normal ${
                            v.documento_fiscal_status === 'Autorizada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {v.documento_fiscal_status || 'Não emitido'}
                        </Badge>
                      </td>

                      {/* Ações */}
                      <td
                        className="py-3 px-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                              Opções
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem onClick={() => navigate(`/vendas/pedidos/${v.id}`)}>
                              <Eye className="mr-2 h-3.5 w-3.5" />
                              Visualizar / Editar
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => handleImprimir(v)}>
                              <Printer className="mr-2 h-3.5 w-3.5" />
                              Imprimir / PDF
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => handleWhatsApp(v)}>
                              <Send className="mr-2 h-3.5 w-3.5" />
                              Enviar por WhatsApp
                            </DropdownMenuItem>

                            {podeGravarVendas && (
                              <DropdownMenuItem onClick={() => handleDuplicar(v)}>
                                <Copy className="mr-2 h-3.5 w-3.5" />
                                Duplicar Venda
                              </DropdownMenuItem>
                            )}

                            {ehOrcamento && !ehCancelada && !ehFinalizada && podeGravarVendas && (
                              <DropdownMenuItem onClick={() => handleConverterPedido(v)}>
                                <ArrowRightCircle className="mr-2 h-3.5 w-3.5 text-blue-600" />
                                Converter em Pedido
                              </DropdownMenuItem>
                            )}

                            {v.status === 'Pedido em aberto' && podeGravarVendas && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-emerald-700 font-semibold"
                                  onClick={() => {
                                    setVendaParaFinalizar(v)
                                    setModalFinalizarAberto(true)
                                  }}
                                >
                                  <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                                  Finalizar Venda
                                </DropdownMenuItem>
                              </>
                            )}

                            {ehFinalizada && podeExcluirVendas && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 font-semibold"
                                  onClick={() => {
                                    setVendaParaCancelar(v)
                                    setModalCancelarAberto(true)
                                  }}
                                >
                                  <Ban className="mr-2 h-3.5 w-3.5 text-red-600" />
                                  Cancelar Venda
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalItems > porPagina && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Mostrando {vendas.length} de {totalItems} vendas
            </span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pagina * porPagina >= totalItems}
                onClick={() => setPagina((p) => p + 1))}
                className="h-7 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Finalizar Venda */}
      {vendaParaFinalizar && (
        <ModalFinalizarVenda
          aberto={modalFinalizarAberto}
          onOpenChange={(aberto) => {
            setModalFinalizarAberto(aberto)
            if (!aberto) setVendaParaFinalizar(null)
          }}
          venda={vendaParaFinalizar}
          condicaoVendaId={vendaParaFinalizar.condicao_pagamento_id}
          onSucesso={async (res) => {
            carregarLista()
            // Pergunta para imprimir o comprovante não fiscal
            try {
              const { venda: vFinal, itens, pagamentos } = await obterVendaCompleta(res.venda_id)
              imprimirComprovanteNaoFiscal({
                venda: vFinal,
                itens,
                pagamentos,
                empresa: empresaAtiva || {},
                cliente: vFinal.expand?.cliente_id,
                vendedorNome: vFinal.expand?.vendedor_id?.nome,
              })
            } catch {
              /* continua */
            }
          }}
        />
      )}

      {/* Modal de Cancelar Venda */}
      {vendaParaCancelar && (
        <ModalCancelarVenda
          aberto={modalCancelarAberto}
          onOpenChange={(aberto) => {
            setModalCancelarAberto(aberto)
            if (!aberto) setVendaParaCancelar(null)
          }}
          venda={vendaParaCancelar}
          onSucesso={() => {
            carregarLista()
          }}
        />
      )}
    </div>
  )
}
export default VendasListaPage
