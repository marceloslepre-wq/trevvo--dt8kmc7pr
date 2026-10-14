import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RotateCcw,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Printer,
  FileText,
  DollarSign,
  Ticket,
  CreditCard,
  Building2,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { obterOuCriarConfigVendasEmpresa } from '@/services/configVendas'
import { obterVendaCompleta, listarVendas, Venda, VendaItem } from '@/services/vendas'
import {
  processarDevolucao,
  ItemDevolucaoInput,
  DestinoDevolucaoTipo,
  ResultadoDevolucao,
  listarValesTroca,
  ValeTroca,
} from '@/services/devolucoes'
import { ModalAutorizacaoSupervisor } from '@/components/ModalAutorizacaoSupervisor'
import pb from '@/lib/pocketbase/client'

export const TrocasDevolucoesPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeCriarVendas = pode('vendas', 'criar')

  // Aba ativa: "Nova Troca/Devolução" ou "Histórico de Vales-Troca"
  const [abaAtiva, setAbaAtiva] = useState<'nova' | 'vales'>('nova')

  // Configuração da empresa (dias_para_troca)
  const [diasParaTroca, setDiasParaTroca] = useState<number>(30)

  // 1. Busca da venda original
  const [termoBusca, setTermoBusca] = useState('')
  const [dataBusca, setDataBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [vendasEncontradas, setVendasEncontradas] = useState<Venda[]>([])

  // Venda original selecionada para devolução
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null)
  const [itensVendaOriginal, setItensVendaOriginal] = useState<VendaItem[]>([])
  const [carregandoItens, setCarregandoItens] = useState(false)

  // Itens selecionados para devolver: Map<venda_item_id, quantidade_devolver>
  const [itensParaDevolver, setItensParaDevolver] = useState<Record<string, number>>({})

  // Destino do valor
  const [destino, setDestino] = useState<DestinoDevolucaoTipo>('vale_troca')
  const [diasValidadeVale, setDiasValidadeVale] = useState<number>(30)
  const [contaFinanceiraId, setContaFinanceiraId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [contasFinanceiras, setContasFinanceiras] = useState<Array<{ id: string; nome: string }>>(
    [],
  )

  // Controle de autorização do supervisor se prazo excedido
  const [prazoExcedido, setPrazoExcedido] = useState(false)
  const [diasCorridos, setDiasCorridos] = useState(0)
  const [supervisorAutorizado, setSupervisorAutorizado] = useState(false)
  const [modalSupervisorAberto, setModalSupervisorAberto] = useState(false)

  // Estado de processamento e modal de comprovante/impressão
  const [processando, setProcessando] = useState(false)
  const [resultadoSucesso, setResultadoSucesso] = useState<ResultadoDevolucao | null>(null)
  const [modalComprovanteAberto, setModalComprovanteAberto] = useState(false)

  // Listagem de vales-troca
  const [valesLista, setValesLista] = useState<ValeTroca[]>([])
  const [carregandoVales, setCarregandoVales] = useState(false)
  const [filtroValeStatus, setFiltroValeStatus] = useState('todos')
  const [filtroValeCodigo, setFiltroValeCodigo] = useState('')

  // Carrega configurações da empresa e contas financeiras
  useEffect(() => {
    if (!empresaAtiva?.id) return
    obterOuCriarConfigVendasEmpresa(empresaAtiva.id)
      .then((cfg) => {
        setDiasParaTroca(cfg.dias_para_troca ?? 30)
      })
      .catch(() => setDiasParaTroca(30))

    pb.collection('contas_financeiras')
      .getFullList({
        filter: `empresa_id = '${empresaAtiva.id}' && ativo = true`,
        sort: 'nome',
      })
      .then((res) => {
        setContasFinanceiras(res.map((c) => ({ id: c.id, nome: (c as any).nome })))
        if (res.length > 0) setContaFinanceiraId(res[0].id)
      })
      .catch(() => setContasFinanceiras([]))
  }, [empresaAtiva?.id])

  // Busca vendas originais
  const handleBuscarVendas = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!empresaAtiva?.id) return

    setBuscando(true)
    try {
      const res = await listarVendas({
        empresa_id: empresaAtiva.id,
        status: 'Finalizada',
        termo_busca: termoBusca.trim() || undefined,
        data_inicio: dataBusca || undefined,
        data_fim: dataBusca || undefined,
        por_pagina: 15,
      })
      // Filtra para remover vendas do tipo Devolução da lista de origem
      setVendasEncontradas(res.items.filter((v) => v.tipo !== 'Devolução'))
    } catch {
      toast({
        title: 'Erro na busca',
        description: 'Não foi possível localizar as vendas.',
        variant: 'destructive',
      })
    } finally {
      setBuscando(false)
    }
  }

  // Ao selecionar uma venda original
  const handleSelecionarVenda = async (venda: Venda) => {
    setVendaSelecionada(venda)
    setCarregandoItens(true)
    setItensParaDevolver({})
    setSupervisorAutorizado(false)

    // Calcula diferença em dias da emissão
    const dtEmissao = new Date((venda.data_emissao || venda.created || '').slice(0, 10))
    const dtHoje = new Date(new Date().toISOString().slice(0, 10))
    const diffTime = dtHoje.getTime() - dtEmissao.getTime()
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    setDiasCorridos(diffDays)

    const excedeu = diffDays > diasParaTroca
    setPrazoExcedido(excedeu)

    try {
      const comp = await obterVendaCompleta(venda.id)
      setItensVendaOriginal(comp.itens)
    } catch {
      toast({
        title: 'Erro ao carregar itens',
        description: 'Falha ao buscar os itens da venda selecionada.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoItens(false)
    }
  }

  // Manipular quantidade a devolver de um item
  const handleAlterarQtdItem = (itemId: string, maximo: number, valorStr: string) => {
    const num = parseFloat(valorStr.replace(',', '.'))
    if (isNaN(num) || num <= 0) {
      const copy = { ...itensParaDevolver }
      delete copy[itemId]
      setItensParaDevolver(copy)
      return
    }
    const valFinal = Math.min(maximo, Math.max(0, num))
    setItensParaDevolver((prev) => ({
      ...prev,
      [itemId]: valFinal,
    }))
  }

  // Resumo de valores dos itens selecionados para devolução
  const resumoDevolucao = useMemo(() => {
    let valorTotal = 0
    let totalItens = 0
    const listaItensInput: ItemDevolucaoInput[] = []

    itensVendaOriginal.forEach((it) => {
      const qtdDev = itensParaDevolver[it.id] || 0
      if (qtdDev > 0) {
        totalItens += qtdDev
        const precoUnit = Number(it.preco_unitario) || 0
        const qtdVendida = Number(it.quantidade) || 1
        const descTot = Number(it.desconto_valor) || 0
        const descUnit = qtdVendida > 0 ? descTot / qtdVendida : 0
        const unitLiq = Math.max(0, precoUnit - descUnit)
        const subtotal = Number((qtdDev * unitLiq).toFixed(2))
        valorTotal += subtotal

        listaItensInput.push({
          venda_item_id: it.id,
          produto_id: it.produto_id,
          descricao: it.descricao,
          unidade: it.unidade || 'UN',
          quantidade: qtdDev,
          preco_unitario: unitLiq,
          custo_unitario: Number(it.custo_unitario) || 0,
          lote_id: it.lote_id || undefined,
        })
      }
    })

    return {
      valorTotal: Number(valorTotal.toFixed(2)),
      totalItens,
      itensInput: listaItensInput,
    }
  }, [itensVendaOriginal, itensParaDevolver])

  // Submissão do processamento da devolução
  const handleConfirmarDevolucao = async () => {
    if (!empresaAtiva?.id || !vendaSelecionada) return
    if (resumoDevolucao.itensInput.length === 0) {
      toast({
        title: 'Nenhum item selecionado',
        description: 'Informe ao menos uma quantidade para devolução.',
        variant: 'destructive',
      })
      return
    }

    // Prazo excedido sem autorização
    if (prazoExcedido && !supervisorAutorizado) {
      setModalSupervisorAberto(true)
      return
    }

    setProcessando(true)
    try {
      const res = await processarDevolucao({
        empresa_id: empresaAtiva.id,
        venda_origem_id: vendaSelecionada.id,
        itens: resumoDevolucao.itensInput,
        destino,
        observacao,
        conta_financeira_id: destino === 'dinheiro_volta' ? contaFinanceiraId : undefined,
        dias_validade_vale: destino === 'vale_troca' ? diasValidadeVale : undefined,
      })

      setResultadoSucesso(res)
      setModalComprovanteAberto(true)

      toast({
        title: 'Devolução concluída com sucesso!',
        description: `Devolução #${res.numero_devolucao} registrada.`,
      })

      // Limpar formulário de devolução
      setVendaSelecionada(null)
      setItensVendaOriginal([])
      setItensParaDevolver({})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar devolução.'
      toast({
        title: 'Erro na devolução',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
    }
  }

  // Carregar vales-troca
  const carregarVales = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregandoVales(true)
    try {
      const res = await listarValesTroca({
        empresaId: empresaAtiva.id,
        status: filtroValeStatus,
        termoBusca: filtroValeCodigo || undefined,
      })
      setValesLista(res.items)
    } catch {
      //
    } finally {
      setCarregandoVales(false)
    }
  }, [empresaAtiva?.id, filtroValeStatus, filtroValeCodigo])

  useEffect(() => {
    if (abaAtiva === 'vales') {
      carregarVales()
    }
  }, [abaAtiva, carregarVales])

  // Impressão do comprovante do Vale-Troca
  const handleImprimirVale = (vale: ValeTroca) => {
    const janela = window.open('', '_blank', 'width=450,height=600')
    if (!janela) return
    const clienteNome = (vale.expand as any)?.cliente_id?.nome || 'Portador'

    janela.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vale-Troca ${vale.codigo}</title>
        <style>
          body { font-family: monospace; font-size: 13px; margin: 20px; line-height: 1.4; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .border { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; margin: 12px 0; }
          .code { font-size: 20px; letter-spacing: 2px; text-align: center; font-weight: bold; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="center bold">${empresaAtiva?.nome_fantasia || 'ERP COMERCIAL'}</div>
        <div class="center">COMPROVANTE DE VALE-TROCA</div>
        <div class="border">
          <div><strong>Código:</strong></div>
          <div class="code">${vale.codigo}</div>
          <div><strong>Valor Original:</strong> R$ ${Number(vale.valor).toFixed(2)}</div>
          <div><strong>Saldo Atual:</strong> R$ ${Number(vale.saldo).toFixed(2)}</div>
          <div><strong>Cliente:</strong> ${clienteNome}</div>
          <div><strong>Validade:</strong> ${vale.validade ? new Date(vale.validade + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem expiração'}</div>
          <div><strong>Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="center" style="font-size: 11px;">
          Apresente este vale no caixa para abater em novas compras no PDV ou Balcão.
        </div>
        <script>
          window.print();
        </script>
      </body>
      </html>
    `)
    janela.document.close()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <RotateCcw className="h-7 w-7 text-blue-600" />
            Trocas e Devoluções de Vendas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Reintegração ao estoque, emissão de vale-troca, estorno financeiro e abatimento de
            crediário.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={abaAtiva === 'nova' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAbaAtiva('nova')}
            className="text-xs h-9"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Nova Devolução
          </Button>

          <Button
            variant={abaAtiva === 'vales' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAbaAtiva('vales')}
            className="text-xs h-9"
          >
            <Ticket className="h-3.5 w-3.5 mr-1.5" />
            Vales-Troca Emitidos
          </Button>
        </div>
      </div>

      {abaAtiva === 'nova' ? (
        <div className="space-y-6">
          {/* PASSO 1: Buscar a venda original */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-600" />
                1. Localizar Venda Original
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Busque pelo número da venda, cliente ou data de emissão. Prazo padrão de troca da
                empresa: <strong>{diasParaTroca} dias</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleBuscarVendas} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Número da Venda ou Cliente
                  </Label>
                  <Input
                    placeholder="Ex: 1042 ou nome do cliente..."
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <div className="w-[180px] space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Data da Venda</Label>
                  <Input
                    type="date"
                    value={dataBusca}
                    onChange={(e) => setDataBusca(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={buscando}
                  className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  {buscando ? 'Buscando...' : 'Buscar'}
                </Button>
              </form>

              {/* Lista de Vendas Encontradas */}
              {vendasEncontradas.length > 0 && !vendaSelecionada && (
                <div className="border border-slate-200 rounded-md overflow-hidden mt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">Venda #</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Cliente</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Total (R$)</TableHead>
                        <TableHead className="text-xs text-center w-24">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendasEncontradas.map((v) => {
                        const clienteNome =
                          (v.expand as any)?.cliente_id?.nome_razao_social ||
                          (v.expand as any)?.cliente_id?.nome ||
                          v.cpf_cnpj_consumidor ||
                          'Consumidor'
                        return (
                          <TableRow key={v.id} className="hover:bg-blue-50/40">
                            <TableCell className="text-xs font-semibold font-mono">
                              #{v.numero}
                            </TableCell>
                            <TableCell className="text-xs">
                              {v.data_emissao
                                ? new Date(v.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
                                : '-'}
                            </TableCell>
                            <TableCell className="text-xs">{clienteNome}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">
                                {v.tipo}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono font-medium">
                              R$ {Number(v.valor_total).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSelecionarVenda(v)}
                                className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8"
                              >
                                Selecionar
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PASSO 2: Itens da venda selecionada e seleção das quantidades devolvidas */}
          {vendaSelecionada && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      2. Venda #{vendaSelecionada.numero} Selecionada
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Escolha os itens e as quantidades devolvidas. A quantidade máxima é o saldo
                      não devolvido.
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVendaSelecionada(null)}
                    className="text-xs h-8"
                  >
                    Trocar Venda
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Alerta de Prazo Excedido */}
                {prazoExcedido && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Prazo de troca excedido ({diasCorridos} dias corridos desde a emissão /
                        limite: {diasParaTroca} dias).
                      </p>
                      <p className="text-[11px] text-amber-700">
                        {supervisorAutorizado ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Autorização de supervisor concedida com sucesso.
                          </span>
                        ) : (
                          'A conclusão desta troca/devolução exigirá autorização de um supervisor com senha.'
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tabela de Itens da Venda */}
                {carregandoItens ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Carregando itens...</p>
                ) : (
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Qtd Vendida</TableHead>
                          <TableHead className="text-xs text-right">Já Devolvida</TableHead>
                          <TableHead className="text-xs text-right">Saldo Disp.</TableHead>
                          <TableHead className="text-xs text-right">Preço Líq. (R$)</TableHead>
                          <TableHead className="text-xs text-center w-36">Qtd a Devolver</TableHead>
                          <TableHead className="text-xs text-right">Subtotal (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensVendaOriginal.map((it) => {
                          const qtdVendida = Number(it.quantidade) || 0
                          const qtdJaDevolvida = Number(it.quantidade_devolvida) || 0
                          const saldoDevolvivel = Math.max(0, qtdVendida - qtdJaDevolvida)
                          const qtdDevolver = itensParaDevolver[it.id] || 0

                          const precoUnit = Number(it.preco_unitario) || 0
                          const descTot = Number(it.desconto_valor) || 0
                          const descUnit = qtdVendida > 0 ? descTot / qtdVendida : 0
                          const unitLiq = Math.max(0, precoUnit - descUnit)
                          const subtotal = Number((qtdDevolver * unitLiq).toFixed(2))

                          return (
                            <TableRow key={it.id}>
                              <TableCell className="text-xs font-medium">
                                <div>{it.descricao}</div>
                                {it.expand?.lote_id && (
                                  <span className="text-[10px] text-slate-400">
                                    Lote: {it.expand.lote_id.numero_lote}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {qtdVendida} {it.unidade}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono text-slate-500">
                                {qtdJaDevolvida}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono font-semibold text-blue-600">
                                {saldoDevolvivel}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                R$ {unitLiq.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Input
                                  type="number"
                                  min={0}
                                  max={saldoDevolvivel}
                                  step={it.unidade === 'UN' ? 1 : 0.001}
                                  disabled={saldoDevolvivel <= 0}
                                  value={itensParaDevolver[it.id] ?? ''}
                                  onChange={(e) =>
                                    handleAlterarQtdItem(it.id, saldoDevolvivel, e.target.value)
                                  }
                                  placeholder="0"
                                  className="text-xs h-8 w-24 mx-auto text-center font-mono"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono font-bold">
                                R$ {subtotal.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* PASSO 3: Destino do valor e confirmação */}
          {vendaSelecionada && resumoDevolucao.itensInput.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  3. Destino do Valor (R$ {resumoDevolucao.valorTotal.toFixed(2)})
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Defina como o cliente receberá a compensação da devolução.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Opção 1: Vale-troca */}
                  <div
                    onClick={() => setDestino('vale_troca')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'vale_troca'
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <Ticket className="h-4 w-4 text-blue-600" />
                      Vale-Troca (Crédito Loja)
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Gera um código único de cupom com validade configurável para abatimento em
                      compras no PDV ou Balcão.
                    </p>
                  </div>

                  {/* Opção 2: Dinheiro de volta */}
                  <div
                    onClick={() => setDestino('dinheiro_volta')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'dinheiro_volta'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      Dinheiro de Volta (Caixa/Banco)
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Registra saída avulsa no caixa físico ou conta bancária na conta analítica
                      2.2.05 (Devoluções de vendas).
                    </p>
                  </div>

                  {/* Opção 3: Abater do crediário */}
                  <div
                    onClick={() => setDestino('abater_crediario')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'abater_crediario'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <CreditCard className="h-4 w-4 text-indigo-600" />
                      Abater do Crediário
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Concede desconto/baixa direta nos títulos em aberto no Contas a Receber da
                      própria venda original.
                    </p>
                  </div>
                </div>

                {/* Campos adicionais por tipo de destino */}
                {destino === 'vale_troca' && (
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 max-w-sm space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Validade do Vale (dias)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={diasValidadeVale}
                      onChange={(e) => setDiasValidadeVale(Number(e.target.value) || 30)}
                      className="text-xs h-8 bg-white w-32"
                    />
                  </div>
                )}

                {destino === 'dinheiro_volta' && (
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 max-w-sm space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Conta Financeira de Saída
                    </Label>
                    <select
                      value={contaFinanceiraId}
                      onChange={(e) => setContaFinanceiraId(e.target.value)}
                      className="text-xs h-8 w-full bg-white border border-slate-200 rounded px-2"
                    >
                      {contasFinanceiras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Motivo / Observação da Devolução
                  </Label>
                  <Input
                    placeholder="Ex: Produto com defeito de fabricação ou tamanho incorreto..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs text-slate-600">
                    Total a Devolver:
                    <span className="text-base font-bold text-slate-900 ml-2 font-mono">
                      R$ {resumoDevolucao.valorTotal.toFixed(2)}
                    </span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    disabled={processando || !podeCriarVendas}
                    onClick={handleConfirmarDevolucao}
                    className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{processando ? 'Processando...' : 'Finalizar Devolução'}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* ABA 2: Vales-Troca Emitidos */
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-blue-600" />
                  Vales-Troca Registrados
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Consulte os cupons de crédito loja emitidos para clientes e seus saldos.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filtrar por código..."
                  value={filtroValeCodigo}
                  onChange={(e) => setFiltroValeCodigo(e.target.value)}
                  className="text-xs h-8 w-40 bg-white"
                />
                <select
                  value={filtroValeStatus}
                  onChange={(e) => setFiltroValeStatus(e.target.value)}
                  className="text-xs h-8 bg-white border border-slate-200 rounded px-2"
                >
                  <option value="todos">Todos status</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Usado">Usado</option>
                  <option value="Expirado">Expirado</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {carregandoVales ? (
              <p className="text-xs text-slate-400 py-6 text-center">Carregando vales...</p>
            ) : valesLista.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum vale-troca encontrado.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs text-right">Valor Original (R$)</TableHead>
                      <TableHead className="text-xs text-right">Saldo Restante (R$)</TableHead>
                      <TableHead className="text-xs">Validade</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-center w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valesLista.map((vale) => {
                      const clienteNome = (vale.expand as any)?.cliente_id?.nome || 'Portador'
                      return (
                        <TableRow key={vale.id}>
                          <TableCell className="text-xs font-mono font-bold text-blue-700">
                            {vale.codigo}
                          </TableCell>
                          <TableCell className="text-xs">{clienteNome}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            R$ {Number(vale.valor).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-emerald-600">
                            R$ {Number(vale.saldo).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {vale.validade
                              ? new Date(vale.validade + 'T00:00:00').toLocaleDateString('pt-BR')
                              : 'Sem expiração'}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                vale.status === 'Ativo'
                                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                  : vale.status === 'Usado'
                                    ? 'border-slate-300 text-slate-600 bg-slate-50'
                                    : 'border-red-300 text-red-700 bg-red-50'
                              }`}
                            >
                              {vale.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleImprimirVale(vale)}
                              title="Imprimir Vale"
                              className="text-xs h-7 w-7 p-0"
                            >
                              <Printer className="h-3.5 w-3.5 text-slate-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de Autorização do Supervisor para Troca Fora do Prazo */}
      <ModalAutorizacaoSupervisor
        aberto={modalSupervisorAberto}
        onOpenChange={setModalSupervisorAberto}
        descontoPercentual={0}
        empresaId={empresaAtiva?.id}
        origem="troca_devolucao_prazo"
        produtoNome={`Devolução Venda #${vendaSelecionada?.numero} fora do prazo (${diasCorridos} dias / limite ${diasParaTroca})`}
        onAutorizado={() => {
          setSupervisorAutorizado(true)
          setModalSupervisorAberto(false)
          toast({
            title: 'Supervisor Autorizou',
            description: 'A troca fora do prazo foi autorizada. Prossiga com a finalização.',
          })
        }}
      />

      {/* Modal de Comprovante de Devolução Concluída */}
      <Dialog open={modalComprovanteAberto} onOpenChange={setModalComprovanteAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Devolução #{resultadoSucesso?.numero_devolucao} Registrada!
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Estoque atualizado e valor compensado.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-700">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span>Valor Total Devolvido:</span>
                <span className="font-bold text-slate-900">
                  R$ {resultadoSucesso?.valor_total.toFixed(2)}
                </span>
              </div>
              {resultadoSucesso?.vale_troca && (
                <div className="flex justify-between text-blue-700 font-bold">
                  <span>Código do Vale-Troca:</span>
                  <span>{resultadoSucesso.vale_troca.codigo}</span>
                </div>
              )}
            </div>

            {resultadoSucesso?.vale_troca && (
              <p className="text-[11px] text-slate-500">
                O cliente pode utilizar este código diretamente na forma de pagamento
                &quot;Vale-troca&quot; no PDV ou no balcão.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {resultadoSucesso?.vale_troca && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (resultadoSucesso?.vale_troca) {
                    handleImprimirVale(resultadoSucesso.vale_troca)
                  }
                }}
                className="text-xs gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir Vale-Troca
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setModalComprovanteAberto(false)}
              className="text-xs bg-slate-900 text-white"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
