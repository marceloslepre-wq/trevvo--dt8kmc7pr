import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  ContaPagar,
  calcularEncargos,
  baixar,
  ItemBaixaInput,
  RespostaBaixarPagamento,
} from '@/services/financeiro'
import { ContaFinanceira } from '@/services/contasFinanceiras'
import { FormaPagamento } from '@/services/formasPagamento'
import {
  ConfigFinanceiraEmpresa,
  obterOuCriarConfigFinanceiraEmpresa,
} from '@/services/configFinanceira'
import {
  Loader2,
  DollarSign,
  AlertCircle,
  FileDown,
  CheckCircle2,
  Receipt,
  Calendar,
  Building,
} from 'lucide-react'

interface ModalPagarTitulosProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulos: ContaPagar[]
  onSucesso: () => void
}

interface LinhaPagamentoCalculada {
  titulo: ContaPagar
  saldo: number
  diasAtraso: number
  multa: number
  juros: number
  desconto: number
  valorPagoPrincipal: number
  valorTotalPagar: number
}

export const ModalPagarTitulos: React.FC<ModalPagarTitulosProps> = ({
  open,
  onOpenChange,
  titulos,
  onSucesso,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const [salvando, setSalvando] = useState(false)
  const hojeStr = new Date().toISOString().slice(0, 10)

  // Cabeçalho do pagamento
  const [dataPagamento, setDataPagamento] = useState(hojeStr)
  const [contaFinanceiraId, setContaFinanceiraId] = useState('')
  const [formaPagamentoId, setFormaPagamentoId] = useState('')
  const [observacaoLote, setObservacaoLote] = useState('')

  // Auxiliares
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])
  const [configFinanceira, setConfigFinanceira] = useState<ConfigFinanceiraEmpresa | null>(null)

  // Linhas editáveis por título
  const [linhas, setLinhas] = useState<LinhaPagamentoCalculada[]>([])

  // Recibo do lote gerado após o pagamento com sucesso
  const [reciboResultado, setReciboResultado] = useState<RespostaBaixarPagamento | null>(null)

  useEffect(() => {
    if (open && empresaAtiva?.id) {
      setReciboResultado(null)
      setDataPagamento(hojeStr)
      setObservacaoLote('')
      carregarParametros(empresaAtiva.id)
    }
  }, [open, empresaAtiva?.id, hojeStr])

  const carregarParametros = async (empId: string) => {
    try {
      // 1. Contas financeiras da empresa
      const contas = await pb.collection('contas_financeiras').getFullList<ContaFinanceira>({
        filter: `empresa_id = '${empId}' && ativo = true`,
        sort: 'nome',
      })
      setContasFinanceiras(contas)

      // 2. Formas de pagamento
      const formas = await pb.collection('formas_pagamento').getFullList<FormaPagamento>({
        filter: `ativo = true`,
        sort: 'descricao',
      })
      setFormasPagamento(formas)

      // 3. Configurações da empresa (conta padrão pagamentos, multa, juros)
      const cfg = await obterOuCriarConfigFinanceiraEmpresa(empId)
      setConfigFinanceira(cfg)

      // Define conta financeira padrão
      if (cfg.conta_padrao_pagamentos_id) {
        setContaFinanceiraId(cfg.conta_padrao_pagamentos_id)
      } else {
        const contaPadrao = contas.find((c) => c.conta_padrao_pagamentos)
        if (contaPadrao) setContaFinanceiraId(contaPadrao.id)
        else if (contas[0]) setContaFinanceiraId(contas[0].id)
      }

      if (formas[0]) {
        setFormaPagamentoId(formas[0].id)
      }
    } catch (err) {
      console.error('Erro ao carregar parâmetros de pagamento:', err)
    }
  }

  // Recalcula linhas quando os títulos, dataPagamento ou configFinanceira mudam
  useEffect(() => {
    if (!open || titulos.length === 0) return

    const novasLinhas: LinhaPagamentoCalculada[] = titulos.map((t) => {
      const saldo = t.saldo ?? t.valor_original
      const encargos = calcularEncargos({
        saldo,
        dataVencimento: t.data_vencimento,
        dataPagamento,
        multaPercentual: configFinanceira?.multa_atraso_percentual || 0,
        jurosMensalPercentual: configFinanceira?.juros_mora_mensal_percentual || 0,
        diasCarencia: configFinanceira?.dias_carencia_atraso || 0,
      })

      return {
        titulo: t,
        saldo,
        diasAtraso: encargos.diasAtraso,
        multa: encargos.valorMulta,
        juros: encargos.valorJuros,
        desconto: 0,
        valorPagoPrincipal: saldo,
        valorTotalPagar: Number((saldo + encargos.valorMulta + encargos.valorJuros).toFixed(2)),
      }
    })

    setLinhas(novasLinhas)
  }, [open, titulos, dataPagamento, configFinanceira])

  // Atualizar campo de uma linha
  const handleAlterarLinha = (
    index: number,
    campo: 'valorPagoPrincipal' | 'multa' | 'juros' | 'desconto',
    valorNovo: number,
  ) => {
    const novas = [...linhas]
    const atual = { ...novas[index], [campo]: Math.max(0, valorNovo) }

    // Limitar valorPagoPrincipal ao saldo do título
    if (campo === 'valorPagoPrincipal' && atual.valorPagoPrincipal > atual.saldo) {
      atual.valorPagoPrincipal = atual.saldo
    }

    // Recalcular valor total a pagar da linha
    const total = atual.valorPagoPrincipal + atual.multa + atual.juros - atual.desconto
    atual.valorTotalPagar = Math.max(0, Number(total.toFixed(2)))

    novas[index] = atual
    setLinhas(novas)
  }

  // Conta financeira selecionada para checar saldo
  const contaSelecionada = useMemo(() => {
    return contasFinanceiras.find((c) => c.id === contaFinanceiraId) || null
  }, [contasFinanceiras, contaFinanceiraId])

  // Total do lote de pagamento
  const totalLote = useMemo(() => {
    return Number(linhas.reduce((acc, l) => acc + l.valorTotalPagar, 0).toFixed(2))
  }, [linhas])

  const totalPrincipal = useMemo(() => {
    return Number(linhas.reduce((acc, l) => acc + l.valorPagoPrincipal, 0).toFixed(2))
  }, [linhas])

  const saldoInsuficiente = useMemo(() => {
    if (!contaSelecionada) return false
    if (contaSelecionada.permite_saldo_negativo) return false
    return (contaSelecionada.saldo_atual || 0) - totalLote < -0.005
  }, [contaSelecionada, totalLote])

  // Submeter Pagamento
  const handleConfirmarPagamento = async () => {
    if (!empresaAtiva?.id) {
      toast({ title: 'Empresa não selecionada', variant: 'destructive' })
      return
    }
    if (!contaFinanceiraId) {
      toast({
        title: 'Conta financeira obrigatória',
        description: 'Selecione a conta bancária para o débito.',
        variant: 'destructive',
      })
      return
    }
    if (totalLote <= 0) {
      toast({
        title: 'Valor total zerado',
        description: 'O valor do pagamento deve ser maior que zero.',
        variant: 'destructive',
      })
      return
    }
    if (saldoInsuficiente) {
      toast({
        title: 'Saldo insuficiente',
        description: `A conta "${contaSelecionada?.nome}" possui saldo de R$ ${(contaSelecionada?.saldo_atual || 0).toFixed(2)} e não permite saldo negativo.`,
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)

    try {
      const itensBaixa: ItemBaixaInput[] = linhas.map((l) => ({
        conta_pagar_id: l.titulo.id,
        valor_pago: l.valorPagoPrincipal,
        valor_multa: l.multa,
        valor_juros: l.juros,
        valor_desconto: l.desconto,
        observacao: observacaoLote || undefined,
      }))

      const resultado = await baixar({
        empresa_id: empresaAtiva.id,
        conta_financeira_id: contaFinanceiraId,
        forma_pagamento_id: formaPagamentoId || undefined,
        data_pagamento: dataPagamento,
        observacao: observacaoLote || undefined,
        itens: itensBaixa,
      })

      toast({
        title: 'Pagamento realizado com sucesso!',
        description: `Lote com ${resultado.total_titulos} título(s) baixado no valor de R$ ${resultado.valor_total.toFixed(2)}.`,
      })

      setReciboResultado(resultado)
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Erro ao efetuar pagamento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Impressão do Comprovante do Lote em PDF / Janela de Impressão formatada
  const handleImprimirComprovante = () => {
    if (!reciboResultado) return

    const nomeConta = contaSelecionada?.nome || 'Conta Bancária'
    const dataFormatada = new Date(dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')

    const janela = window.open('', '_blank')
    if (!janela) {
      toast({
        title: 'Bloqueador de pop-ups ativo',
        description: 'Permita pop-ups para gerar o comprovante.',
        variant: 'destructive',
      })
      return
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Comprovante de Pagamento - Lote #${reciboResultado.lote_baixa_id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 30px; color: #1e293b; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: bold; color: #0f172a; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 5px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; background: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .info-item { margin-bottom: 4px; }
          .info-label { font-weight: 600; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .total-box { margin-top: 25px; padding: 15px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; font-size: 15px; font-weight: bold; text-align: right; color: #1e40af; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          @media print {
            body { margin: 15mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">COMPROVANTE DE PAGAMENTO DE TÍTULOS</h1>
          <div class="subtitle">ERP Comercial • Lote #${reciboResultado.lote_baixa_id}</div>
        </div>

        <div class="info-grid">
          <div>
            <div class="info-item"><span class="info-label">Empresa:</span> ${empresaAtiva?.razao_social || ''}</div>
            <div class="info-item"><span class="info-label">Conta Debitada:</span> ${nomeConta}</div>
          </div>
          <div>
            <div class="info-item"><span class="info-label">Data do Pagamento:</span> ${dataFormatada}</div>
            <div class="info-item"><span class="info-label">Qtd. Títulos Quitados:</span> ${reciboResultado.total_titulos}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Descrição</th>
              <th class="text-right">Original (R$)</th>
              <th class="text-right">Principal Pago (R$)</th>
              <th class="text-right">Multa/Juros (R$)</th>
              <th class="text-right">Desconto (R$)</th>
              <th class="text-right">Total Pago (R$)</th>
              <th>Status Novo</th>
            </tr>
          </thead>
          <tbody>
            ${reciboResultado.baixas
              .map(
                (b) => `
              <tr>
                <td><strong>${b.numero_documento}</strong></td>
                <td>${b.descricao}</td>
                <td class="text-right">${b.valor_original.toFixed(2)}</td>
                <td class="text-right">${b.valor_pago.toFixed(2)}</td>
                <td class="text-right">${((b.valor_multa || 0) + (b.valor_juros || 0)).toFixed(2)}</td>
                <td class="text-right">${(b.valor_desconto || 0).toFixed(2)}</td>
                <td class="text-right"><strong>${b.valor_total_pago.toFixed(2)}</strong></td>
                <td>${b.status_novo}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>

        <div class="total-box">
          VALOR TOTAL DO LOTE DEBITADO: R$ ${reciboResultado.valor_total.toFixed(2)}
        </div>

        <div class="footer">
          Comprovante gerado em ${new Date().toLocaleString('pt-BR')} pelo Sistema ERP.
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `

    janela.document.open()
    janela.document.write(html)
    janela.document.close()
  }

  // TELA 2: Pós-pagamento com Recibo/Comprovante
  if (reciboResultado) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Pagamento Efetivado com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              O débito foi lançado na conta financeira selecionada e o saldo dos títulos foi
              atualizado.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 text-xs">
            {/* Destaque do Lote */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                  Lote de Baixa #{reciboResultado.lote_baixa_id}
                </span>
                <p className="text-sm font-medium text-slate-800 mt-0.5">
                  {reciboResultado.total_titulos} título(s) quitado(s) em{' '}
                  {new Date(dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500">
                  Conta: <strong>{contaSelecionada?.nome}</strong>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-700 uppercase font-semibold">
                  Total Debitado
                </span>
                <div className="text-2xl font-mono font-bold text-emerald-800">
                  R$ {reciboResultado.valor_total.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Lista dos títulos baixados */}
            <div className="border rounded-md overflow-hidden bg-white max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 text-left">Documento</th>
                    <th className="py-2 px-3 text-left">Descrição</th>
                    <th className="py-2 px-3 text-right">Total Pago</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reciboResultado.baixas.map((b) => (
                    <tr key={b.baixa_id}>
                      <td className="py-1.5 px-3 font-mono font-medium">{b.numero_documento}</td>
                      <td className="py-1.5 px-3 truncate max-w-[200px]">{b.descricao}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold">
                        R$ {b.valor_total_pago.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            b.status_novo === 'Pago'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                          }
                        >
                          {b.status_novo}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImprimirComprovante}
              className="text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Imprimir Comprovante (PDF)
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // TELA 1: Formulário de Pagamento
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            {titulos.length > 1
              ? `Pagar ${titulos.length} Títulos em Lote`
              : 'Efetuar Pagamento de Título'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Informe a data, a conta financeira debitada e revise encargos ou descontos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-xs">
          {/* Cabeçalho do Pagamento: Data, Conta, Forma e Observação */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="data_pagamento" className="text-xs font-semibold text-slate-700">
                Data do Pagamento *
              </Label>
              <Input
                id="data_pagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="h-8 text-xs bg-white"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="conta_financeira" className="text-xs font-semibold text-slate-700">
                Conta Financeira (Débito) *
              </Label>
              <select
                id="conta_financeira"
                value={contaFinanceiraId}
                onChange={(e) => setContaFinanceiraId(e.target.value)}
                className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                required
              >
                <option value="">Selecione a conta...</option>
                {contasFinanceiras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} (Saldo: R$ {(c.saldo_atual || 0).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="forma_pagamento" className="text-xs font-semibold text-slate-700">
                Forma de Pagamento
              </Label>
              <select
                id="forma_pagamento"
                value={formaPagamentoId}
                onChange={(e) => setFormaPagamentoId(e.target.value)}
                className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Selecione a forma...</option>
                {formasPagamento.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.descricao}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="obs_lote" className="text-xs font-semibold text-slate-700">
                Observação do Pagamento
              </Label>
              <Input
                id="obs_lote"
                value={observacaoLote}
                onChange={(e) => setObservacaoLote(e.target.value)}
                placeholder="Ex: Pagamento referente ao lote semanal de compras..."
                className="h-8 text-xs bg-white"
              />
            </div>
          </div>

          {/* Destaque do Lote / Saldo da Conta */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-blue-50/70 border border-blue-200 rounded-lg gap-2">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <span className="text-xs text-blue-900 font-semibold">
                  Conta Debitada: {contaSelecionada?.nome || 'Nenhuma selecionada'}
                </span>
                <span className="text-[11px] text-blue-700 block">
                  Saldo disponível: R$ {(contaSelecionada?.saldo_atual || 0).toFixed(2)}
                  {contaSelecionada?.permite_saldo_negativo && ' (Permite limite)'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-500 uppercase font-semibold">
                Total a Debitar no Extrato
              </span>
              <div className="text-xl font-mono font-bold text-slate-900">
                R$ {totalLote.toFixed(2)}
              </div>
            </div>
          </div>

          {saldoInsuficiente && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>
                <strong>Saldo insuficiente:</strong> o valor total do pagamento (R${' '}
                {totalLote.toFixed(2)}) excede o saldo da conta e ela não permite saldo negativo.
              </span>
            </div>
          )}

          {/* Grade de Títulos a Pagar */}
          <div className="border rounded-lg bg-white overflow-hidden shadow-xs">
            <div className="px-3 py-2 bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Títulos Selecionados ({linhas.length})</span>
              <span className="text-[11px] font-normal text-slate-500">
                Valores menores que o saldo geram pagamento parcial.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-left">Documento</th>
                    <th className="py-2 px-3 text-left">Fornecedor / Descrição</th>
                    <th className="py-2 px-3 text-center">Vencimento</th>
                    <th className="py-2 px-3 text-right">Saldo Devedor</th>
                    <th className="py-2 px-3 text-right w-28">Valor Principal</th>
                    <th className="py-2 px-3 text-right w-24">Multa (R$)</th>
                    <th className="py-2 px-3 text-right w-24">Juros (R$)</th>
                    <th className="py-2 px-3 text-right w-24">Desconto</th>
                    <th className="py-2 px-3 text-right w-28">Total Linha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linhas.map((linha, idx) => {
                    const vencido = linha.diasAtraso > 0
                    return (
                      <tr key={linha.titulo.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-medium text-slate-800">
                          {linha.titulo.numero_documento}
                          <span className="text-[10px] text-slate-400 block">
                            Parc {linha.titulo.parcela}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-[180px]">
                          <span className="font-semibold text-slate-800 block truncate">
                            {linha.titulo.expand?.fornecedor_id?.razao_social ||
                              linha.titulo.expand?.fornecedor_id?.nome_fantasia ||
                              'Fornecedor'}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate block">
                            {linha.titulo.descricao}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="font-mono">
                            {new Date(
                              linha.titulo.data_vencimento + 'T00:00:00',
                            ).toLocaleDateString('pt-BR')}
                          </span>
                          {vencido && (
                            <Badge
                              variant="outline"
                              className="block mx-auto text-[9px] py-0 px-1 bg-red-50 text-red-700 border-red-200 mt-0.5"
                            >
                              {linha.diasAtraso}d atraso
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                          R$ {linha.saldo.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={linha.saldo}
                            value={linha.valorPagoPrincipal}
                            onChange={(e) =>
                              handleAlterarLinha(
                                idx,
                                'valorPagoPrincipal',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="h-7 text-xs font-mono text-right w-24 ml-auto"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linha.multa}
                            onChange={(e) =>
                              handleAlterarLinha(idx, 'multa', parseFloat(e.target.value) || 0)
                            }
                            className="h-7 text-xs font-mono text-right w-20 ml-auto text-amber-700"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linha.juros}
                            onChange={(e) =>
                              handleAlterarLinha(idx, 'juros', parseFloat(e.target.value) || 0)
                            }
                            className="h-7 text-xs font-mono text-right w-20 ml-auto text-amber-700"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linha.desconto}
                            onChange={(e) =>
                              handleAlterarLinha(idx, 'desconto', parseFloat(e.target.value) || 0)
                            }
                            className="h-7 text-xs font-mono text-right w-20 ml-auto text-emerald-700"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          R$ {linha.valorTotalPagar.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-100 border-t border-slate-200 font-semibold text-xs">
                  <tr>
                    <td colSpan={4} className="py-2 px-3 text-slate-700 text-right">
                      Totais do Lote:
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800">
                      R$ {totalPrincipal.toFixed(2)}
                    </td>
                    <td colSpan={3} className="py-2 px-3 text-right text-slate-600">
                      Total Débito:
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                      R$ {totalLote.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirmarPagamento}
            disabled={salvando || totalLote <= 0 || saldoInsuficiente}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Processando baixa...
              </>
            ) : (
              `Confirmar Pagamento (R$ ${totalLote.toFixed(2)})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
