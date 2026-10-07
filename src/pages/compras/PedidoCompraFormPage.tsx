import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ShoppingCart,
  ArrowLeft,
  Save,
  Send,
  RotateCcw,
  XCircle,
  Copy,
  Printer,
  Trash2,
  Plus,
  Building,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
import { SelectFornecedor } from '@/components/SelectFornecedor'
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
import { BuscaProdutoGtin } from '@/components/BuscaProdutoGtin'
import { Fornecedor, obterFornecedorPorId } from '@/services/fornecedores'
import { listarUsuarios, Usuario } from '@/services/usuarios'
import { Produto } from '@/services/produtos'
import { obterSaldoAtual } from '@/services/estoque'
import {
  PedidoCompraCompleto,
  NovoItemPedidoCompraInput,
  obterPedidoCompraPorId,
  salvarPedidoCompra,
  enviarPedidoCompra,
  reabrirPedidoCompra,
  cancelarPedidoCompra,
  duplicarPedidoCompra,
  sugerirCustoUnitarioProduto,
  calcularTotaisPedido,
  StatusPedidoCompra,
} from '@/services/pedidosCompra'

interface ItemLinhaGrade extends NovoItemPedidoCompraInput {
  chave_temp: string
  produto_codigo?: string | number
  produto_descricao?: string
  unidade_sigla?: string
  saldo_empresa?: number
  estoque_minimo?: number
  estoque_maximo?: number | null
}

export const PedidoCompraFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const isEdicao = Boolean(id && id !== 'novo')
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [carregando, setCarregando] = useState(isEdicao)
  const [salvando, setSalvando] = useState(false)
  const [pedidoOriginal, setPedidoOriginal] = useState<PedidoCompraCompleto | null>(null)

  // Cabeçalho
  const [fornecedorId, setFornecedorId] = useState<string>('')
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)
  const [compradorId, setCompradorId] = useState<string>('')
  const [dataEmissao, setDataEmissao] = useState<string>(new Date().toISOString().slice(0, 10))
  const [dataPrevisaoEntrega, setDataPrevisaoEntrega] = useState<string>('')
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [observacaoFornecedor, setObservacaoFornecedor] = useState<string>('')

  // Totais rodapé
  const [valorDesconto, setValorDesconto] = useState<number>(0)
  const [valorFrete, setValorFrete] = useState<number>(0)
  const [valorOutrasDespesas, setValorOutrasDespesas] = useState<number>(0)

  // Itens
  const [itens, setItens] = useState<ItemLinhaGrade[]>([])

  // Lista de compradores
  const [compradores, setCompradores] = useState<Usuario[]>([])

  // Modal de cancelamento
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  // Status atual
  const statusAtual: StatusPedidoCompra = pedidoOriginal ? pedidoOriginal.status : 'Rascunho'
  const isRascunho = statusAtual === 'Rascunho'
  const isImutavel =
    statusAtual === 'Parcialmente recebido' ||
    statusAtual === 'Recebido' ||
    statusAtual === 'Cancelado'
  const somenteLeitura = !isRascunho || (!pode('compras', 'editar') && isEdicao)

  // Carregar lista de compradores
  useEffect(() => {
    listarUsuarios({ situacao: 'ativos', perPage: 100 })
      .then((res) => setCompradores(res.items))
      .catch(() => {})
  }, [])

  // Carregar pedido existente se edição
  useEffect(() => {
    if (!id || id === 'novo') return

    setCarregando(true)
    obterPedidoCompraPorId(id)
      .then(async (ped) => {
        setPedidoOriginal(ped)
        setFornecedorId(ped.fornecedor_id)
        setCompradorId(ped.comprador_id || '')
        setDataEmissao(ped.data_emissao || '')
        setDataPrevisaoEntrega(ped.data_previsao_entrega || '')
        setCondicaoPagamentoId(ped.condicao_pagamento_id || '')
        setObservacao(ped.observacao || '')
        setObservacaoFornecedor(ped.observacao_fornecedor || '')
        setValorDesconto(ped.valor_desconto || 0)
        setValorFrete(ped.valor_frete || 0)
        setValorOutrasDespesas(ped.valor_outras_despesas || 0)

        // Busca dados do fornecedor
        try {
          const forn = await obterFornecedorPorId(ped.fornecedor_id)
          setFornecedorSelecionado(forn)
        } catch {
          /* fallback */
        }

        // Mapeia itens e busca saldos para exibição
        const itensCarregados: ItemLinhaGrade[] = await Promise.all(
          ped.itens.map(async (it) => {
            let saldoAtual = 0
            try {
              if (empresaAtiva?.id) {
                const s = await obterSaldoAtual(empresaAtiva.id, it.produto_id)
                saldoAtual = s.quantidade
              }
            } catch {
              /* ignore */
            }

            const prod = it.expand?.produto_id
            return {
              id: it.id,
              chave_temp: it.id,
              produto_id: it.produto_id,
              produto_codigo: prod?.codigo,
              produto_descricao: prod?.descricao,
              unidade_sigla: prod?.expand?.unidade_id?.sigla || 'UN',
              saldo_empresa: saldoAtual,
              estoque_minimo: prod?.estoque_minimo ? Number(prod.estoque_minimo) : 0,
              estoque_maximo: prod?.estoque_maximo ? Number(prod.estoque_maximo) : null,
              quantidade: it.quantidade,
              custo_unitario: it.custo_unitario,
              desconto_percentual: it.desconto_percentual || 0,
              aliquota_ipi: it.aliquota_ipi || 0,
              valor_icms_st_estimado: it.valor_icms_st_estimado || 0,
              valor_total: it.valor_total || 0,
              observacao: it.observacao || '',
            }
          }),
        )

        setItens(itensCarregados)
      })
      .catch((err) => {
        toast({
          title: 'Erro ao carregar pedido',
          description: err instanceof Error ? err.message : 'Falha ao buscar registro',
          variant: 'destructive',
        })
        navigate('/compras/pedidos')
      })
      .finally(() => {
        setCarregando(false)
      })
  }, [id, empresaAtiva?.id, navigate, toast])

  // Ao selecionar fornecedor: sugere a condição de pagamento cadastrada nele
  const handleSelecionarFornecedor = async (novoFornecedorId: string) => {
    setFornecedorId(novoFornecedorId)
    if (!novoFornecedorId) {
      setFornecedorSelecionado(null)
      return
    }

    try {
      const forn = await obterFornecedorPorId(novoFornecedorId)
      setFornecedorSelecionado(forn)

      // Se o pedido não tem condição de pagamento e o fornecedor tem uma cadastrada, sugere!
      if (forn.condicao_pagamento_id && !condicaoPagamentoId) {
        setCondicaoPagamentoId(forn.condicao_pagamento_id)
      }
    } catch {
      /* ignore */
    }
  }

  // Adicionar produto bipado ou selecionado na busca
  const handleAdicionarProduto = async (prod: Produto) => {
    if (somenteLeitura) return

    // Verifica se já está na lista
    const jaExiste = itens.find((i) => i.produto_id === prod.id)
    if (jaExiste) {
      // Incrementa quantidade
      atualizarCampoItem(jaExiste.chave_temp, 'quantidade', jaExiste.quantidade + 1)
      toast({
        title: 'Quantidade incrementada',
        description: `+1 unidade adicionada ao produto ${prod.descricao}.`,
      })
      return
    }

    // Busca saldo atual na empresa ativa
    let saldoAtual = 0
    try {
      if (empresaAtiva?.id) {
        const s = await obterSaldoAtual(empresaAtiva.id, prod.id)
        saldoAtual = s.quantidade
      }
    } catch {
      /* ignore */
    }

    // Sugere custo unitário: ultimo_preco_compra em produtos_fornecedores ou preco_custo
    const custo = await sugerirCustoUnitarioProduto(prod.id, fornecedorId)

    const novaLinha: ItemLinhaGrade = {
      chave_temp: `temp_${Date.now()}_${Math.random()}`,
      produto_id: prod.id,
      produto_codigo: prod.codigo,
      produto_descricao: prod.descricao,
      unidade_sigla: prod.expand?.unidade_id?.sigla || 'UN',
      saldo_empresa: saldoAtual,
      estoque_minimo: prod.estoque_minimo ? Number(prod.estoque_minimo) : 0,
      estoque_maximo: prod.estoque_maximo ? Number(prod.estoque_maximo) : null,
      quantidade: 1,
      custo_unitario: custo,
      desconto_percentual: 0,
      aliquota_ipi: 0,
      valor_icms_st_estimado: 0,
      valor_total: custo,
      observacao: '',
    }

    setItens((prev) => [...prev, novaLinha])
  }

  // Atualiza um campo de um item na grade e recalcula seu total
  const atualizarCampoItem = (chaveTemp: string, campo: keyof ItemLinhaGrade, valor: any) => {
    setItens((prev) =>
      prev.map((item) => {
        if (item.chave_temp !== chaveTemp) return item

        const atualizado = { ...item, [campo]: valor }

        const qtd = Number(atualizado.quantidade || 0)
        const custo = Number(atualizado.custo_unitario || 0)
        const descPerc = Number(atualizado.desconto_percentual || 0)
        const aliqIpi = Number(atualizado.aliquota_ipi || 0)
        const icmsSt = Number(atualizado.valor_icms_st_estimado || 0)

        const subBruto = qtd * custo
        const valDesc = subBruto * (descPerc / 100)
        const subLiq = Math.max(0, subBruto - valDesc)
        const valIpi = subLiq * (aliqIpi / 100)
        const total = Number((subLiq + valIpi + icmsSt).toFixed(2))

        atualizado.valor_total = total
        return atualizado
      }),
    )
  }

  // Remover item
  const removerItem = (chaveTemp: string) => {
    if (somenteLeitura) return
    setItens((prev) => prev.filter((i) => i.chave_temp !== chaveTemp))
  }

  // Totais calculados em tempo real
  const totaisCalculados = useMemo(() => {
    return calcularTotaisPedido(itens, valorDesconto, valorFrete, valorOutrasDespesas)
  }, [itens, valorDesconto, valorFrete, valorOutrasDespesas])

  // Salvar pedido (Rascunho)
  const handleSalvar = async () => {
    if (!empresaAtiva?.id) return

    if (!fornecedorId) {
      toast({
        title: 'Fornecedor obrigatório',
        description: 'Selecione o fornecedor do pedido.',
        variant: 'destructive',
      })
      return
    }

    if (itens.length === 0) {
      toast({
        title: 'Nenhum item adicionado',
        description: 'Adicione ao menos um produto ao pedido de compra.',
        variant: 'destructive',
      })
      return
    }

    for (const it of itens) {
      if (Number(it.quantidade || 0) <= 0) {
        toast({
          title: 'Quantidade inválida',
          description: `O item "${it.produto_descricao}" deve ter quantidade maior que zero.`,
          variant: 'destructive',
        })
        return
      }
    }

    setSalvando(true)
    try {
      const salvo = await salvarPedidoCompra({
        id: isEdicao ? id : undefined,
        empresa_id: empresaAtiva.id,
        fornecedor_id: fornecedorId,
        comprador_id: compradorId || undefined,
        data_emissao: dataEmissao || undefined,
        data_previsao_entrega: dataPrevisaoEntrega || undefined,
        condicao_pagamento_id: condicaoPagamentoId || undefined,
        observacao,
        observacao_fornecedor: observacaoFornecedor,
        valor_desconto: valorDesconto,
        valor_frete: valorFrete,
        valor_outras_despesas: valorOutrasDespesas,
        itens: itens.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          custo_unitario: i.custo_unitario,
          desconto_percentual: i.desconto_percentual,
          aliquota_ipi: i.aliquota_ipi,
          valor_icms_st_estimado: i.valor_icms_st_estimado,
          valor_total: i.valor_total,
          observacao: i.observacao,
        })),
      })

      toast({
        title: 'Pedido salvo com sucesso',
        description: `Pedido #${salvo.numero} gravado como Rascunho.`,
      })

      if (!isEdicao) {
        navigate(`/compras/pedidos/${salvo.id}`)
      } else {
        setPedidoOriginal(salvo)
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar pedido',
        description: err instanceof Error ? err.message : 'Falha na gravação',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Ações de fluxo
  const handleEnviar = async () => {
    if (!pedidoOriginal || !empresaAtiva?.id) return
    if (!confirm(`Deseja enviar o Pedido #${pedidoOriginal.numero}?`)) return
    try {
      const ped = await enviarPedidoCompra(pedidoOriginal.id, empresaAtiva.id)
      setPedidoOriginal(ped)
      toast({
        title: 'Pedido enviado',
        description: `O Pedido #${ped.numero} está marcado como Enviado.`,
      })
    } catch (err: unknown) {
      toast({
        title: 'Erro ao enviar',
        description: err instanceof Error ? err.message : 'Falha no envio',
        variant: 'destructive',
      })
    }
  }

  const handleReabrir = async () => {
    if (!pedidoOriginal || !empresaAtiva?.id) return
    if (!confirm(`Deseja reabrir o Pedido #${pedidoOriginal.numero} para Rascunho?`)) return
    try {
      const ped = await reabrirPedidoCompra(pedidoOriginal.id, empresaAtiva.id)
      setPedidoOriginal(ped)
      toast({
        title: 'Pedido reaberto',
        description: `O Pedido #${ped.numero} voltou ao status Rascunho e pode ser editado.`,
      })
    } catch (err: unknown) {
      toast({
        title: 'Erro ao reabrir',
        description: err instanceof Error ? err.message : 'Falha na reabertura',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmarCancelamento = async () => {
    if (!pedidoOriginal || !empresaAtiva?.id) return
    if (!motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo do cancelamento.',
        variant: 'destructive',
      })
      return
    }
    setCancelando(true)
    try {
      const ped = await cancelarPedidoCompra(
        pedidoOriginal.id,
        empresaAtiva.id,
        motivoCancelamento.trim(),
      )
      setPedidoOriginal(ped)
      setModalCancelarAberto(false)
      toast({
        title: 'Pedido cancelado',
        description: `O Pedido #${ped.numero} foi cancelado.`,
      })
    } catch (err: unknown) {
      toast({
        title: 'Erro ao cancelar',
        description: err instanceof Error ? err.message : 'Falha no cancelamento',
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  const handleDuplicar = async () => {
    if (!pedidoOriginal || !empresaAtiva?.id) return
    try {
      const duplicado = await duplicarPedidoCompra(pedidoOriginal.id, empresaAtiva.id)
      toast({
        title: 'Pedido duplicado',
        description: `Novo Pedido #${duplicado.numero} criado como Rascunho.`,
      })
      navigate(`/compras/pedidos/${duplicado.id}`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar',
        description: err instanceof Error ? err.message : 'Falha na duplicação',
        variant: 'destructive',
      })
    }
  }

  const handleImprimir = () => {
    window.print()
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
  }

  const formatarQtd = (val: number) => {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Elemento de impressão invisível em tela e estilizado para print */}
      <div className="hidden print:block print:p-6 print:text-black print:bg-white">
        <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold uppercase">
              {empresaAtiva?.razao_social || 'EMPRESA'}
            </h1>
            <p className="text-xs">
              CNPJ: {empresaAtiva?.cnpj || '-'} | Inscrição Estadual:{' '}
              {empresaAtiva?.inscricao_estadual || '-'}
            </p>
            <p className="text-xs">
              {empresaAtiva?.logradouro}, {empresaAtiva?.numero} - {empresaAtiva?.municipio}/
              {empresaAtiva?.uf}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold">PEDIDO DE COMPRA</h2>
            <p className="text-sm font-mono font-bold">Nº {pedidoOriginal?.numero || 'NOVO'}</p>
            <p className="text-xs">
              Emissão: {dataEmissao} | Previsão: {dataPrevisaoEntrega || 'A combinar'}
            </p>
            <p className="text-xs">Status: {statusAtual}</p>
          </div>
        </div>

        {/* Dados Fornecedor */}
        <div className="border border-black p-3 mb-4 text-xs">
          <p className="font-bold text-sm mb-1">DADOS DO FORNECEDOR</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p>
                <strong>Razão Social:</strong> {fornecedorSelecionado?.razao_social || '-'}
              </p>
              <p>
                <strong>Nome Fantasia:</strong> {fornecedorSelecionado?.nome_fantasia || '-'}
              </p>
              <p>
                <strong>CNPJ/CPF:</strong> {fornecedorSelecionado?.cpf_cnpj || '-'}
              </p>
            </div>
            <div>
              <p>
                <strong>Telefone:</strong>{' '}
                {fornecedorSelecionado?.telefone || fornecedorSelecionado?.celular || '-'}
              </p>
              <p>
                <strong>E-mail:</strong> {fornecedorSelecionado?.email || '-'}
              </p>
              <p>
                <strong>Contato:</strong> {fornecedorSelecionado?.contato_nome || '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Itens */}
        <table className="w-full text-xs border-collapse border border-black mb-4">
          <thead>
            <tr className="bg-slate-100 border-b border-black text-left">
              <th className="p-1 border-r border-black w-10">Item</th>
              <th className="p-1 border-r border-black w-16">Cód.</th>
              <th className="p-1 border-r border-black">Descrição do Produto</th>
              <th className="p-1 border-r border-black text-center w-12">UN</th>
              <th className="p-1 border-r border-black text-right w-16">Qtd</th>
              <th className="p-1 border-r border-black text-right w-20">Vlr. Unit</th>
              <th className="p-1 border-r border-black text-right w-14">Desc%</th>
              <th className="p-1 border-r border-black text-right w-14">IPI%</th>
              <th className="p-1 text-right w-24">Vlr. Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => (
              <tr key={it.chave_temp} className="border-b border-black">
                <td className="p-1 border-r border-black text-center">{idx + 1}</td>
                <td className="p-1 border-r border-black font-mono">#{it.produto_codigo}</td>
                <td className="p-1 border-r border-black font-medium">{it.produto_descricao}</td>
                <td className="p-1 border-r border-black text-center">{it.unidade_sigla}</td>
                <td className="p-1 border-r border-black text-right font-mono">
                  {formatarQtd(it.quantidade)}
                </td>
                <td className="p-1 border-r border-black text-right font-mono">
                  {formatarMoeda(it.custo_unitario)}
                </td>
                <td className="p-1 border-r border-black text-right font-mono">
                  {it.desconto_percentual ? `${it.desconto_percentual}%` : '-'}
                </td>
                <td className="p-1 border-r border-black text-right font-mono">
                  {it.aliquota_ipi ? `${it.aliquota_ipi}%` : '-'}
                </td>
                <td className="p-1 text-right font-mono font-bold">
                  {formatarMoeda(it.valor_total || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totais e Observações da impressão */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="border border-black p-2">
            <p className="font-bold mb-1">CONDIÇÕES COMERCIAIS & OBSERVAÇÕES</p>
            <p>
              <strong>Condição de Pagamento:</strong>{' '}
              {pedidoOriginal?.expand?.condicao_pagamento_id?.nome ||
                'Conforme cadastro / A combinar'}
            </p>
            {observacaoFornecedor && (
              <div className="mt-2 pt-2 border-t border-slate-300">
                <strong>Observações ao Fornecedor:</strong>
                <p className="whitespace-pre-line mt-1">{observacaoFornecedor}</p>
              </div>
            )}
          </div>

          <div className="border border-black p-2 space-y-1">
            <div className="flex justify-between">
              <span>Subtotal Produtos:</span>
              <span className="font-mono">{formatarMoeda(totaisCalculados.valorProdutos)}</span>
            </div>
            {totaisCalculados.valorDesconto > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>Desconto Geral:</span>
                <span className="font-mono">-{formatarMoeda(totaisCalculados.valorDesconto)}</span>
              </div>
            )}
            {totaisCalculados.valorFrete > 0 && (
              <div className="flex justify-between">
                <span>Frete:</span>
                <span className="font-mono">{formatarMoeda(totaisCalculados.valorFrete)}</span>
              </div>
            )}
            {totaisCalculados.valorOutrasDespesas > 0 && (
              <div className="flex justify-between">
                <span>Outras Despesas:</span>
                <span className="font-mono">
                  {formatarMoeda(totaisCalculados.valorOutrasDespesas)}
                </span>
              </div>
            )}
            {totaisCalculados.valorIpi > 0 && (
              <div className="flex justify-between">
                <span>IPI:</span>
                <span className="font-mono">{formatarMoeda(totaisCalculados.valorIpi)}</span>
              </div>
            )}
            {totaisCalculados.valorIcmsSt > 0 && (
              <div className="flex justify-between">
                <span>ICMS ST:</span>
                <span className="font-mono">{formatarMoeda(totaisCalculados.valorIcmsSt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-black">
              <span>VALOR TOTAL DO PEDIDO:</span>
              <span className="font-mono">{formatarMoeda(totaisCalculados.valorTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header UI (escondido na impressão) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="h-9 w-9">
            <Link to="/compras/pedidos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {isEdicao
                  ? `Pedido de Compra #${pedidoOriginal?.numero || ''}`
                  : 'Novo Pedido de Compra'}
              </h1>
              {isEdicao && (
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold ${
                    statusAtual === 'Rascunho'
                      ? 'bg-slate-100 text-slate-700'
                      : statusAtual === 'Enviado'
                        ? 'bg-blue-50 text-blue-700'
                        : statusAtual === 'Recebido'
                          ? 'bg-emerald-50 text-emerald-700'
                          : statusAtual === 'Cancelado'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {statusAtual}
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Filial: <strong>{empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}</strong>
            </p>
          </div>
        </div>

        {/* Barra de ações conforme status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Impressão / PDF */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            className="text-xs h-9 text-slate-700"
          >
            <Printer className="h-4 w-4 mr-1.5 text-slate-500" />
            Imprimir / PDF
          </Button>

          {/* Duplicar */}
          {isEdicao && pode('compras', 'criar') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDuplicar}
              className="text-xs h-9 text-slate-700"
            >
              <Copy className="h-4 w-4 mr-1.5 text-slate-500" />
              Duplicar
            </Button>
          )}

          {/* Reabrir (Enviado -> Rascunho) */}
          {isEdicao && statusAtual === 'Enviado' && pode('compras', 'editar') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReabrir}
              className="text-xs h-9 text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reabrir Pedido
            </Button>
          )}

          {/* Cancelar (Rascunho ou Enviado) */}
          {isEdicao &&
            (statusAtual === 'Rascunho' || statusAtual === 'Enviado') &&
            pode('compras', 'excluir') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMotivoCancelamento('')
                  setModalCancelarAberto(true)
                }}
                className="text-xs h-9 text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancelar Pedido
              </Button>
            )}

          {/* Enviar (Rascunho -> Enviado) */}
          {isEdicao && statusAtual === 'Rascunho' && pode('compras', 'editar') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnviar}
              className="text-xs h-9 text-blue-700 border-blue-300 hover:bg-blue-50"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Enviar Pedido
            </Button>
          )}

          {/* Salvar Rascunho */}
          {isRascunho && (pode('compras', 'criar') || pode('compras', 'editar')) && (
            <Button
              type="button"
              size="sm"
              onClick={handleSalvar}
              disabled={salvando}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {salvando ? 'Salvando...' : 'Salvar Rascunho'}
            </Button>
          )}
        </div>
      </div>

      {/* Alertas de status imutáveis */}
      {isImutavel && (
        <div className="print:hidden p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Este pedido está com status <strong>{statusAtual}</strong>. Conforme regras do sistema,
            pedidos recebidos ou cancelados são imutáveis e não podem ser alterados.
          </span>
        </div>
      )}

      {statusAtual === 'Enviado' && (
        <div className="print:hidden p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              Pedido <strong>Enviado</strong> ao fornecedor. Para alterar itens ou condições, use o
              botão <strong>"Reabrir Pedido"</strong> acima.
            </span>
          </div>
        </div>
      )}

      {/* Formulário Principal UI */}
      <div className="print:hidden space-y-6">
        {/* Cabeçalho */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Dados do Cabeçalho
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Fornecedor */}
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">
                  Fornecedor <span className="text-rose-500">*</span>
                </Label>
                <SelectFornecedor
                  value={fornecedorId}
                  onChange={handleSelecionarFornecedor}
                  disabled={somenteLeitura}
                />
                {fornecedorSelecionado && (
                  <p className="text-[11px] text-slate-500">
                    CNPJ/CPF: {fornecedorSelecionado.cpf_cnpj || 'Não informado'}
                    {fornecedorSelecionado.telefone && ` • Tel: ${fornecedorSelecionado.telefone}`}
                  </p>
                )}
              </div>

              {/* Comprador Responsável */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Comprador</Label>
                <Select
                  value={compradorId}
                  onValueChange={setCompradorId}
                  disabled={somenteLeitura}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o comprador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum comprador</SelectItem>
                    {compradores.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Condição de Pagamento */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Condição de Pagamento
                </Label>
                <SelectCondicaoPagamento
                  value={condicaoPagamentoId}
                  onChange={setCondicaoPagamentoId}
                  uso="Compras"
                  disabled={somenteLeitura}
                />
              </div>

              {/* Data Emissão */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Data de Emissão</Label>
                <Input
                  type="date"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                  disabled={somenteLeitura}
                  className="h-9 text-xs"
                />
              </div>

              {/* Data Previsão de Entrega */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Previsão de Entrega</Label>
                <Input
                  type="date"
                  value={dataPrevisaoEntrega}
                  onChange={(e) => setDataPrevisaoEntrega(e.target.value)}
                  disabled={somenteLeitura}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grade de Itens */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">
                Itens do Pedido ({itens.length})
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Produtos cotados para reposição com custo, alíquotas e saldo na filial ativa.
              </p>
            </div>

            {/* Bipagem e busca rápida de produtos */}
            {!somenteLeitura && (
              <div className="w-full sm:w-96">
                <BuscaProdutoGtin
                  onSelecionarProduto={handleAdicionarProduto}
                  filtroControlaEstoque={false}
                  placeholder="Bipar GTIN ou buscar produto para adicionar..."
                />
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-3 w-16">Cód.</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3 text-center w-14">UN</th>
                    <th className="py-2.5 px-3 text-right w-20">Saldo Atual</th>
                    <th className="py-2.5 px-3 text-right w-20">Mín / Máx</th>
                    <th className="py-2.5 px-3 text-right w-24">Qtd Compra</th>
                    <th className="py-2.5 px-3 text-right w-28">Custo Unit (R$)</th>
                    <th className="py-2.5 px-3 text-right w-20">Desc %</th>
                    <th className="py-2.5 px-3 text-right w-20">IPI %</th>
                    <th className="py-2.5 px-3 text-right w-24">ICMS ST (R$)</th>
                    <th className="py-2.5 px-3 text-right w-28">Total (R$)</th>
                    {!somenteLeitura && <th className="py-2.5 px-3 text-center w-12">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={somenteLeitura ? 11 : 12}
                        className="py-12 text-center text-slate-400"
                      >
                        <Package className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                        Nenhum item adicionado ao pedido de compra.
                        {!somenteLeitura && (
                          <p className="text-xs text-slate-500 mt-1">
                            Utilize o campo acima para bipar código de barras ou pesquisar produtos.
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    itens.map((it) => (
                      <tr key={it.chave_temp} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500 font-medium">
                          #{it.produto_codigo}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs">
                          <div className="truncate" title={it.produto_descricao}>
                            {it.produto_descricao}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500 text-[11px]">
                          {it.unidade_sigla}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {formatarQtd(it.saldo_empresa || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                          {formatarQtd(it.estoque_minimo || 0)} /{' '}
                          {it.estoque_maximo ? formatarQtd(it.estoque_maximo) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {somenteLeitura ? (
                            <span className="font-mono font-bold text-slate-900">
                              {formatarQtd(it.quantidade)}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              step="any"
                              min="0.0001"
                              value={it.quantidade}
                              onChange={(e) =>
                                atualizarCampoItem(
                                  it.chave_temp,
                                  'quantidade',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-8 text-right font-mono text-xs w-20 ml-auto bg-white"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {somenteLeitura ? (
                            <span className="font-mono text-slate-800">
                              {formatarMoeda(it.custo_unitario)}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={it.custo_unitario}
                              onChange={(e) =>
                                atualizarCampoItem(
                                  it.chave_temp,
                                  'custo_unitario',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-8 text-right font-mono text-xs w-24 ml-auto bg-white"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {somenteLeitura ? (
                            <span className="font-mono text-slate-600">
                              {it.desconto_percentual ? `${it.desconto_percentual}%` : '-'}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={it.desconto_percentual || ''}
                              onChange={(e) =>
                                atualizarCampoItem(
                                  it.chave_temp,
                                  'desconto_percentual',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              placeholder="0"
                              className="h-8 text-right font-mono text-xs w-16 ml-auto bg-white"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {somenteLeitura ? (
                            <span className="font-mono text-slate-600">
                              {it.aliquota_ipi ? `${it.aliquota_ipi}%` : '-'}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.aliquota_ipi || ''}
                              onChange={(e) =>
                                atualizarCampoItem(
                                  it.chave_temp,
                                  'aliquota_ipi',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              placeholder="0"
                              className="h-8 text-right font-mono text-xs w-16 ml-auto bg-white"
                            />
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {somenteLeitura ? (
                            <span className="font-mono text-slate-600">
                              {it.valor_icms_st_estimado
                                ? formatarMoeda(it.valor_icms_st_estimado)
                                : '-'}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.valor_icms_st_estimado || ''}
                              onChange={(e) =>
                                atualizarCampoItem(
                                  it.chave_temp,
                                  'valor_icms_st_estimado',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              placeholder="0,00"
                              className="h-8 text-right font-mono text-xs w-20 ml-auto bg-white"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {formatarMoeda(it.valor_total || 0)}
                        </td>
                        {!somenteLeitura && (
                          <td className="py-2.5 px-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removerItem(it.chave_temp)}
                              className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Remover Item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

        {/* Rodapé: Observações e Totais Gerais */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Observações */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Observações e Instruções
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações ao Fornecedor (sai na impressão / PDF)
                  </Label>
                  <Textarea
                    value={observacaoFornecedor}
                    onChange={(e) => setObservacaoFornecedor(e.target.value)}
                    disabled={somenteLeitura}
                    rows={3}
                    placeholder="Ex: Entregar na portaria de recebimento até as 16h. Enviar boleto para compras@..."
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações Internas (apenas no sistema)
                  </Label>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    disabled={somenteLeitura}
                    rows={2}
                    placeholder="Anotações internas sobre aprovação ou cotação..."
                    className="text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Totais do Rodapé */}
          <div className="lg:col-span-5">
            <Card className="border-slate-200 shadow-xs bg-slate-50/50">
              <CardHeader className="py-3 px-4 border-b border-slate-200 bg-slate-100/60">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center justify-between">
                  <span>Totais do Pedido</span>
                  <DollarSign className="h-4 w-4 text-slate-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Valor dos Produtos:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatarMoeda(totaisCalculados.valorProdutos)}
                  </span>
                </div>

                {/* Desconto */}
                <div className="flex justify-between items-center text-slate-600">
                  <span>Desconto Global:</span>
                  {somenteLeitura ? (
                    <span className="font-mono text-rose-600">
                      -{formatarMoeda(totaisCalculados.valorDesconto)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorDesconto || ''}
                      onChange={(e) => setValorDesconto(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="h-8 text-right font-mono text-xs w-28 bg-white"
                    />
                  )}
                </div>

                {/* Frete */}
                <div className="flex justify-between items-center text-slate-600">
                  <span>Frete:</span>
                  {somenteLeitura ? (
                    <span className="font-mono text-slate-800">
                      {formatarMoeda(totaisCalculados.valorFrete)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorFrete || ''}
                      onChange={(e) => setValorFrete(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="h-8 text-right font-mono text-xs w-28 bg-white"
                    />
                  )}
                </div>

                {/* Outras Despesas */}
                <div className="flex justify-between items-center text-slate-600">
                  <span>Outras Despesas:</span>
                  {somenteLeitura ? (
                    <span className="font-mono text-slate-800">
                      {formatarMoeda(totaisCalculados.valorOutrasDespesas)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorOutrasDespesas || ''}
                      onChange={(e) => setValorOutrasDespesas(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className="h-8 text-right font-mono text-xs w-28 bg-white"
                    />
                  )}
                </div>

                {/* IPI e ICMS ST calculados */}
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200">
                  <span>Total IPI:</span>
                  <span className="font-mono text-slate-800">
                    {formatarMoeda(totaisCalculados.valorIpi)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Total ICMS ST Estimado:</span>
                  <span className="font-mono text-slate-800">
                    {formatarMoeda(totaisCalculados.valorIcmsSt)}
                  </span>
                </div>

                {/* Total Final */}
                <div className="flex justify-between items-center pt-3 border-t-2 border-slate-300">
                  <span className="font-bold text-sm text-slate-900">Total do Pedido:</span>
                  <span className="font-mono font-bold text-lg text-blue-700">
                    {formatarMoeda(totaisCalculados.valorTotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Cancelamento */}
      <Dialog open={modalCancelarAberto} onOpenChange={setModalCancelarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Pedido de Compra</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar o Pedido #{pedidoOriginal?.numero}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold text-slate-700">
              Motivo do cancelamento <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..."
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalCancelarAberto(false)}
              disabled={cancelando}
            >
              Voltar
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

export default PedidoCompraFormPage
