import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import {
  MovimentoExtratoItem,
  ResumoExtrato,
  obterExtratoConta,
  estornarMovimentoAvulsoOuTransferencia,
} from '@/services/movimentacoesExtratos'
import { ModalTransferenciaContas } from './ModalTransferenciaContas'
import { ModalLancamentoAvulso } from './ModalLancamentoAvulso'
import { toast } from '@/hooks/use-toast'
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  PlusCircle,
  RotateCcw,
  Download,
  Printer,
  Calendar,
  Building2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'

export const ExtratoBancarioPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { empresaAtiva } = useEmpresaAtiva()

  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string>('')

  // Datas padrão: primeiro e último dia do mês atual
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)

  const [dataInicio, setDataInicio] = useState<string>(
    searchParams.get('dataInicio') || primeiroDiaMes,
  )
  const [dataFim, setDataFim] = useState<string>(searchParams.get('dataFim') || ultimoDiaMes)

  const [resumo, setResumo] = useState<ResumoExtrato | null>(null)
  const [carregando, setCarregando] = useState<boolean>(false)

  // Modais de ação
  const [modalTransferenciaAberto, setModalTransferenciaAberto] = useState<boolean>(false)
  const [modalAvulsoAberto, setModalAvulsoAberto] = useState<boolean>(false)

  // Modal de confirmação de estorno
  const [movimentoParaEstorno, setMovimentoParaEstorno] = useState<MovimentoExtratoItem | null>(
    null,
  )
  const [motivoEstorno, setMotivoEstorno] = useState<string>('')
  const [estornando, setEstornando] = useState<boolean>(false)

  // Carregar contas
  useEffect(() => {
    if (empresaAtiva?.id) {
      listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }).then((res) => {
        setContas(res)
        const paramConta = searchParams.get('contaId')
        if (paramConta && res.some((c) => c.id === paramConta)) {
          setContaSelecionadaId(paramConta)
        } else if (res.length > 0) {
          const padrao = res.find((c) => c.conta_padrao_pagamentos) || res[0]
          setContaSelecionadaId(padrao.id)
        }
      })
    }
  }, [empresaAtiva?.id, searchParams])

  // Carregar extrato
  const carregarExtrato = useCallback(async () => {
    if (!empresaAtiva?.id || !contaSelecionadaId) return
    try {
      setCarregando(true)
      const res = await obterExtratoConta({
        empresaId: empresaAtiva.id,
        contaFinanceiraId: contaSelecionadaId,
        dataInicio,
        dataFim,
      })
      setResumo(res)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar extrato',
        description: err?.message || 'Falha ao buscar movimentações da conta.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, contaSelecionadaId, dataInicio, dataFim])

  useEffect(() => {
    if (contaSelecionadaId) {
      carregarExtrato()
    }
  }, [contaSelecionadaId, carregarExtrato])

  const contaAtual = useMemo(
    () => contas.find((c) => c.id === contaSelecionadaId),
    [contas, contaSelecionadaId],
  )

  const handleMudarConta = (id: string) => {
    setContaSelecionadaId(id)
    setSearchParams({ contaId: id, dataInicio, dataFim })
  }

  // Exportar CSV
  const exportarCSV = () => {
    if (!resumo || !resumo.movimentos.length) {
      toast({ title: 'Sem dados para exportar' })
      return
    }

    const cabecalho = 'Data;Historico;Tipo;Origem;Entrada;Saida;Saldo;Conciliado;Estornado\n'
    const linhas = resumo.movimentos
      .map((m) => {
        const ent = m.tipo === 'Entrada' ? m.valor.toFixed(2) : ''
        const sai = m.tipo === 'Saída' ? m.valor.toFixed(2) : ''
        const conc = m.conciliado ? 'Sim' : 'Não'
        const est = m.estornado ? 'Sim' : 'Não'
        const hist = `"${(m.historico || '').replace(/"/g, '""')}"`
        return `${m.data_movimento};${hist};${m.tipo};${m.origem};${ent};${sai};${m.saldo_posterior.toFixed(
          2,
        )};${conc};${est}`
      })
      .join('\n')

    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `extrato_${contaAtual?.nome || 'conta'}_${dataInicio}_a_${dataFim}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Imprimir
  const imprimir = () => {
    window.print()
  }

  // Confirmar estorno
  const handleConfirmarEstorno = async () => {
    if (!movimentoParaEstorno) return
    if (!motivoEstorno.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe a justificativa do estorno.',
        variant: 'destructive',
      })
      return
    }

    try {
      setEstornando(true)
      const res = await estornarMovimentoAvulsoOuTransferencia(
        movimentoParaEstorno.id,
        motivoEstorno,
      )
      toast({
        title: 'Estorno realizado',
        description: res.mensagem,
      })
      setMovimentoParaEstorno(null)
      setMotivoEstorno('')
      carregarExtrato()
    } catch (err: any) {
      toast({
        title: 'Erro ao estornar',
        description: err?.message || 'Falha ao processar estorno.',
        variant: 'destructive',
      })
    } finally {
      setEstornando(false)
    }
  }

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      {/* Topo / Filtros (oculto na impressão seletiva) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Extrato de Contas e Caixas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Acompanhe a movimentação cronológica, saldos detalhados e conciliação bancária.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalTransferenciaAberto(true)}
            className="text-xs h-9 border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <ArrowLeftRight className="w-4 h-4 mr-1 text-blue-600" />
            Transferência
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalAvulsoAberto(true)}
            className="text-xs h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <PlusCircle className="w-4 h-4 mr-1 text-emerald-600" />
            Lançamento Avulso
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCSV} className="text-xs h-9">
            <Download className="w-4 h-4 mr-1 text-slate-600" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={imprimir} className="text-xs h-9">
            <Printer className="w-4 h-4 mr-1 text-slate-600" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Cabeçalho limpo exclusivo de Impressão */}
      <div className="hidden print:block border-b pb-3 mb-4">
        <h2 className="text-xl font-bold">{empresaAtiva?.razao_social || 'ERP de Gestão'}</h2>
        <p className="text-xs text-slate-600">
          Extrato da Conta: {contaAtual?.nome} ({contaAtual?.tipo}) • Período: {dataInicio} a{' '}
          {dataFim}
        </p>
      </div>

      {/* Barra de Filtros: Conta e Período */}
      <Card className="print:hidden bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Conta Financeira</Label>
              <Select value={contaSelecionadaId} onValueChange={handleMudarConta}>
                <SelectTrigger className="text-xs h-9 bg-white">
                  <SelectValue placeholder="Selecione a conta..." />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} • {c.tipo} (Saldo: R$ {Number(c.saldo_atual || 0).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Data Inicial
              </Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  setSearchParams({
                    contaId: contaSelecionadaId,
                    dataInicio: e.target.value,
                    dataFim,
                  })
                }}
                className="text-xs h-9 bg-white"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Data Final
              </Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value)
                  setSearchParams({
                    contaId: contaSelecionadaId,
                    dataInicio,
                    dataFim: e.target.value,
                  })
                }}
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Saldo e Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase">
                Saldo Anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div
                className={`text-lg sm:text-xl font-bold font-mono ${
                  resumo.saldoAnterior >= 0 ? 'text-slate-900' : 'text-rose-600'
                }`}
              >
                R$ {resumo.saldoAnterior.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-400">Até {dataInicio}</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-100 bg-emerald-50/30 shadow-sm">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-emerald-700 uppercase flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                Entradas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700">
                + R$ {resumo.entradasPeriodo.toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-600/70">No período</p>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/30 shadow-sm">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-rose-700 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                Saídas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg sm:text-xl font-bold font-mono text-rose-700">
                - R$ {resumo.saidasPeriodo.toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-600/70">No período</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-blue-800 uppercase">
                Saldo Final Período
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div
                className={`text-lg sm:text-xl font-bold font-mono ${
                  resumo.saldoFinal >= 0 ? 'text-blue-900' : 'text-rose-600'
                }`}
              >
                R$ {resumo.saldoFinal.toFixed(2)}
              </div>
              <p className="text-[11px] text-blue-700/70">Em {dataFim}</p>
            </CardContent>
          </Card>

          <Card
            className={`border shadow-sm col-span-2 lg:col-span-1 ${
              Math.abs(resumo.diferencaConciliacao) > 0.009
                ? 'border-amber-300 bg-amber-50/50'
                : 'border-slate-200'
            }`}
          >
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-slate-700 uppercase flex items-center justify-between">
                <span>Conciliação</span>
                {Math.abs(resumo.diferencaConciliacao) > 0.009 ? (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Conciliado:</span>
                <span className="font-mono font-semibold text-slate-800">
                  R$ {resumo.saldoConciliado.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Diferença:</span>
                <span
                  className={`font-mono font-bold ${
                    Math.abs(resumo.diferencaConciliacao) > 0.009
                      ? 'text-amber-700 font-semibold'
                      : 'text-emerald-700'
                  }`}
                >
                  R$ {resumo.diferencaConciliacao.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela Cronológica de Movimentos */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/50">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              Movimentações no Período
            </CardTitle>
            <p className="text-xs text-slate-500">
              {resumo?.movimentos.length || 0} lançamentos encontrados
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={carregarExtrato}
            disabled={carregando}
            className="text-xs h-8 text-slate-600"
          >
            <RotateCcw className={`w-3.5 h-3.5 mr-1 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[100px] text-xs">Data</TableHead>
                <TableHead className="text-xs">Histórico / Descrição</TableHead>
                <TableHead className="w-[140px] text-xs">Origem / Vínculo</TableHead>
                <TableHead className="w-[110px] text-right text-xs text-emerald-700">
                  Entrada
                </TableHead>
                <TableHead className="w-[110px] text-right text-xs text-rose-700">Saída</TableHead>
                <TableHead className="w-[120px] text-right text-xs">Saldo</TableHead>
                <TableHead className="w-[90px] text-center text-xs">Status</TableHead>
                <TableHead className="w-[80px] text-center text-xs print:hidden">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                    Carregando movimentações do extrato...
                  </TableCell>
                </TableRow>
              ) : !resumo || resumo.movimentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                    Nenhuma movimentação registrada nesta conta para o período selecionado.
                  </TableCell>
                </TableRow>
              ) : (
                resumo.movimentos.map((mov) => {
                  const ehEntrada = mov.tipo === 'Entrada'
                  const podeEstornar =
                    !mov.estornado &&
                    (mov.lancamento_avulso ||
                      Boolean(mov.transferencia_id) ||
                      mov.origem === 'AJUSTE') &&
                    !mov.lote_baixa_id &&
                    mov.origem !== 'PAGAMENTO_TITULO' &&
                    mov.origem !== 'RECEBIMENTO_TITULO'

                  return (
                    <TableRow
                      key={mov.id}
                      className={`text-xs hover:bg-slate-50/80 transition-colors ${
                        mov.estornado ? 'opacity-60 bg-slate-50/40 line-through' : ''
                      }`}
                    >
                      <TableCell className="font-mono whitespace-nowrap">
                        {mov.data_movimento ? mov.data_movimento.slice(0, 10) : '-'}
                      </TableCell>

                      <TableCell>
                        <div className="font-medium text-slate-900">{mov.historico}</div>
                        {mov.estornado && (
                          <div className="text-[10px] text-rose-600 italic no-underline">
                            Estornado: {mov.motivo_estorno || 'Sem motivo'} em {mov.data_estorno}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {mov.origem === 'PAGAMENTO_TITULO' && mov.documento_id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-[11px] text-blue-700 hover:underline flex items-center gap-1"
                            onClick={() =>
                              navigate(
                                `/financeiro/pagar?busca=${encodeURIComponent(
                                  mov.documento_numero || '',
                                )}`,
                              )
                            }
                          >
                            <span>Pagar #{mov.documento_numero || mov.documento_id}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        ) : mov.origem === 'RECEBIMENTO_TITULO' && mov.documento_id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-[11px] text-emerald-700 hover:underline flex items-center gap-1"
                            onClick={() =>
                              navigate(
                                `/financeiro/receber?busca=${encodeURIComponent(
                                  mov.documento_numero || '',
                                )}`,
                              )
                            }
                          >
                            <span>Receber #{mov.documento_numero || mov.documento_id}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        ) : mov.transferencia_id ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-blue-200 text-blue-700"
                          >
                            Transferência
                          </Badge>
                        ) : mov.lancamento_avulso ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-slate-300 text-slate-700"
                          >
                            Avulso
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {mov.origem}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono font-medium text-emerald-700">
                        {ehEntrada ? `R$ ${mov.valor.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono font-medium text-rose-700">
                        {!ehEntrada ? `R$ ${mov.valor.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono font-semibold text-slate-900">
                        R$ {mov.saldo_posterior.toFixed(2)}
                      </TableCell>

                      <TableCell className="text-center">
                        {mov.conciliado ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px] border-none font-normal">
                            Conciliado
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-slate-400">Pendente</span>
                        )}
                      </TableCell>

                      <TableCell className="text-center print:hidden">
                        {podeEstornar ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMovimentoParaEstorno(mov)
                              setMotivoEstorno('')
                            }}
                            className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[11px]"
                          >
                            Estornar
                          </Button>
                        ) : mov.estornado ? (
                          <span className="text-[10px] text-rose-500">Estornado</span>
                        ) : (
                          <span className="text-[10px] text-slate-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal de Transferência */}
      <ModalTransferenciaContas
        aberto={modalTransferenciaAberto}
        onOpenChange={setModalTransferenciaAberto}
        contaOrigemPreDefinidaId={contaSelecionadaId}
        onSucesso={() => {
          carregarExtrato()
          listarContasFinanceiras({ empresa_id: empresaAtiva?.id, situacao: 'ativos' }).then(
            setContas,
          )
        }}
      />

      {/* Modal de Lançamento Avulso */}
      <ModalLancamentoAvulso
        aberto={modalAvulsoAberto}
        onOpenChange={setModalAvulsoAberto}
        contaPreDefinidaId={contaSelecionadaId}
        onSucesso={() => {
          carregarExtrato()
          listarContasFinanceiras({ empresa_id: empresaAtiva?.id, situacao: 'ativos' }).then(
            setContas,
          )
        }}
      />

      {/* Modal de Confirmação de Estorno */}
      <Dialog
        open={Boolean(movimentoParaEstorno)}
        onOpenChange={(aberto) => !aberto && setMovimentoParaEstorno(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-600" />
              Confirmar Estorno de Movimento
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O estorno irá reverter o valor de R$ {movimentoParaEstorno?.valor.toFixed(2)} no saldo
              da conta. Justifique a operação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="bg-slate-50 p-2.5 rounded text-xs space-y-1">
              <div>
                <span className="text-slate-500">Lançamento: </span>
                <span className="font-semibold text-slate-800">
                  {movimentoParaEstorno?.historico}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Tipo / Valor: </span>
                <span className="font-semibold font-mono">
                  {movimentoParaEstorno?.tipo} • R$ {movimentoParaEstorno?.valor.toFixed(2)}
                </span>
              </div>
              {movimentoParaEstorno?.transferencia_id && (
                <div className="text-blue-700 font-medium">
                  • Esta é uma transferência: o estorno reverterá ambas as contas (origem e
                  destino).
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="motivo_estorno_input"
                className="text-xs font-semibold text-slate-700"
              >
                Motivo do Estorno *
              </Label>
              <Textarea
                id="motivo_estorno_input"
                placeholder="Informe detalhadamente a justificativa para auditoria..."
                value={motivoEstorno}
                onChange={(e) => setMotivoEstorno(e.target.value)}
                className="text-xs min-h-[80px]"
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMovimentoParaEstorno(null)}
              disabled={estornando}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarEstorno}
              disabled={estornando || !motivoEstorno.trim()}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              {estornando ? 'Estornando...' : 'Confirmar Estorno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default ExtratoBancarioPage
