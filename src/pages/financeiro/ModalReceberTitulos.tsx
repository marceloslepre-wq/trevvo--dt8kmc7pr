import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Building, CheckCircle2, FileDown, Loader2 } from 'lucide-react'
import { ContaReceber, receberTitulos } from '@/services/contasReceber'
import { calcularEncargos } from '@/services/financeiro'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { FormaPagamento, listarFormasPagamento } from '@/services/formasPagamento'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'
import { obterOuCriarConfigVendasEmpresa } from '@/services/configVendas'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'

interface ModalReceberTitulosProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulos: ContaReceber[]
  onSucesso: () => void
}

interface LinhaRecebimento {
  titulo: ContaReceber
  saldo: number
  valorRecebidoPrincipal: number
  multa: number
  juros: number
  desconto: number
  plano_desconto_id?: string
  taxa_cartao_sugerida?: number
  valorTotalReceber: number
  diasAtraso: number
}

interface ReciboRecebimentoItem {
  conta_receber_id: string
  numero_documento: string
  descricao: string
  cliente_nome: string
  valor_original: number
  valor_pago: number
  valor_multa: number
  valor_juros: number
  valor_desconto: number
  valor_total_pago: number
  status_novo: string
}

export const ModalReceberTitulos: React.FC<ModalReceberTitulosProps> = ({
  open,
  onOpenChange,
  titulos,
  onSucesso,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [salvando, setSalvando] = useState(false)
  const [dataRecebimento, setDataRecebimento] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [contaFinanceiraId, setContaFinanceiraId] = useState<string>('')
  const [formaPagamentoId, setFormaPagamentoId] = useState<string>('')
  const [observacaoLote, setObservacaoLote] = useState<string>('')

  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])

  // Estado das linhas editáveis de cada título
  const [linhas, setLinhas] = useState<LinhaRecebimento[]>([])

  // Estado pós-recebimento para exibir recibo na tela e permitir PDF
  const [reciboResultado, setReciboResultado] = useState<{
    lote_id?: string
    total_titulos: number
    valor_total: number
    itens: ReciboRecebimentoItem[]
  } | null>(null)

  // Carregar dados de contas, formas e configs ao abrir
  useEffect(() => {
    if (!open || !empresaAtiva?.id) return

    setReciboResultado(null)
    setDataRecebimento(new Date().toISOString().slice(0, 10))
    setObservacaoLote('')

    async function carregarDados() {
      try {
        const [contas, formas, config, configVendas] = await Promise.all([
          listarContasFinanceiras(empresaAtiva!.id),
          listarFormasPagamento(empresaAtiva!.id),
          obterOuCriarConfigFinanceiraEmpresa(empresaAtiva!.id),
          obterOuCriarConfigVendasEmpresa(empresaAtiva!.id).catch(() => null),
        ])

        const ativas = contas.filter((c) => c.ativo)
        setContasFinanceiras(ativas)
        setFormasPagamento(formas.filter((f) => f.ativo))

        // Conta padrão de recebimentos (se houver conta com conta_padrao_recebimentos = true)
        const contaPadraoReceb = ativas.find((c: any) => c.conta_padrao_recebimentos)
        if (contaPadraoReceb) {
          setContaFinanceiraId(contaPadraoReceb.id)
        } else if (ativas.length > 0) {
          setContaFinanceiraId(ativas[0].id)
        }

        // Buscar taxas de cartão para títulos de origem Venda ou PDV
        const planoTaxasCartaoId = configVendas?.plano_taxas_cartao_id || ''

        const novasLinhas: LinhaRecebimento[] = await Promise.all(
          titulos.map(async (t) => {
            const saldo = Number((t.saldo ?? t.valor_original ?? 0).toFixed(2))
            const encargos = calcularEncargos({
              saldo,
              dataVencimento: t.data_vencimento,
              dataPagamento: dataRecebimento,
              multaPercentual: config?.multa_atraso_percentual,
              jurosMensalPercentual: config?.juros_mora_mensal_percentual,
              diasCarencia: config?.dias_carencia,
            })

            let taxaCartaoSugerida = 0
            let planoDescontoId = ''

            // Se origem for Venda ou PDV, buscar venda_pagamento correspondente para sugerir valor_taxa
            const ehVendaOuPdv = t.origem === 'Venda' || t.origem === 'PDV'
            if (ehVendaOuPdv && t.origem_id) {
              try {
                const vPags = await pb.collection('vendas_pagamentos').getList(1, 10, {
                  filter: `venda_id = '${t.origem_id}' && valor_taxa > 0 && ativo = true`,
                  requestKey: null,
                })
                // Se encontrar pagamento com valor_taxa e o título estiver ligado a ele
                for (const vp of vPags.items) {
                  let idsLigados: string[] = []
                  try {
                    const cIds = vp.conta_receber_ids
                    if (Array.isArray(cIds)) idsLigados = cIds
                    else if (typeof cIds === 'string') idsLigados = JSON.parse(cIds)
                  } catch {
                    /* intentionally ignored */
                  }

                  if (idsLigados.includes(t.id) || vPags.items.length === 1) {
                    const taxaVal = Number(vp.valor_taxa) || 0
                    if (taxaVal > 0) {
                      taxaCartaoSugerida = taxaVal
                      if (planoTaxasCartaoId) {
                        planoDescontoId = planoTaxasCartaoId
                      }
                      break
                    }
                  }
                }
              } catch {
                /* intentionally ignored */
              }
            }

            const descontoInicial = taxaCartaoSugerida > 0 ? taxaCartaoSugerida : 0
            const totalLinha = Math.max(
              0,
              Number(
                (saldo + encargos.valorMulta + encargos.valorJuros - descontoInicial).toFixed(2),
              ),
            )

            return {
              titulo: t,
              saldo,
              valorRecebidoPrincipal: saldo,
              multa: encargos.valorMulta,
              juros: encargos.valorJuros,
              desconto: descontoInicial,
              plano_desconto_id: planoDescontoId || undefined,
              taxa_cartao_sugerida: taxaCartaoSugerida > 0 ? taxaCartaoSugerida : undefined,
              valorTotalReceber: totalLinha,
              diasAtraso: encargos.diasAtraso,
            }
          }),
        )

        setLinhas(novasLinhas)
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Falha ao inicializar modal de recebimento.'
        toast({
          title: 'Erro ao carregar dados financeiros',
          description: msg,
          variant: 'destructive',
        })
      }
    }

    carregarDados()
  }, [open, empresaAtiva?.id, titulos])

  // Recalcular encargos se o usuário mudar a data de recebimento
  const handleDataRecebimentoChange = async (novaData: string) => {
    setDataRecebimento(novaData)
    if (!empresaAtiva?.id) return

    try {
      const config = await obterOuCriarConfigFinanceiraEmpresa(empresaAtiva.id)
      setLinhas((prev) =>
        prev.map((linha) => {
          const encargos = calcularEncargos({
            saldo: linha.valorRecebidoPrincipal,
            dataVencimento: linha.titulo.data_vencimento,
            dataPagamento: novaData,
            multaPercentual: config?.multa_atraso_percentual,
            jurosMensalPercentual: config?.juros_mora_mensal_percentual,
            diasCarencia: config?.dias_carencia,
          })
          const total = Math.max(
            0,
            Number(
              (
                linha.valorRecebidoPrincipal +
                encargos.valorMulta +
                encargos.valorJuros -
                linha.desconto
              ).toFixed(2),
            ),
          )
          return {
            ...linha,
            multa: encargos.valorMulta,
            juros: encargos.valorJuros,
            valorTotalReceber: total,
            diasAtraso: encargos.diasAtraso,
          }
        }),
      )
    } catch {
      //
    }
  }

  // Alteração manual de campos da linha
  const handleAlterarLinha = (
    index: number,
    campo: 'valorRecebidoPrincipal' | 'multa' | 'juros' | 'desconto',
    valor: number,
  ) => {
    setLinhas((prev) => {
      const clone = [...prev]
      const linha = { ...clone[index] }

      const v = isNaN(valor) || valor < 0 ? 0 : valor
      if (campo === 'valorRecebidoPrincipal') {
        linha.valorRecebidoPrincipal = Math.min(v, linha.saldo)
      } else {
        linha[campo] = v
      }

      linha.valorTotalReceber = Math.max(
        0,
        Number(
          (linha.valorRecebidoPrincipal + linha.multa + linha.juros - linha.desconto).toFixed(2),
        ),
      )

      clone[index] = linha
      return clone
    })
  }

  // Totais consolidados do lote
  const totalPrincipal = useMemo(
    () => Number(linhas.reduce((acc, l) => acc + l.valorRecebidoPrincipal, 0).toFixed(2)),
    [linhas],
  )
  const totalLote = useMemo(
    () => Number(linhas.reduce((acc, l) => acc + l.valorTotalReceber, 0).toFixed(2)),
    [linhas],
  )

  const contaSelecionada = useMemo(
    () => contasFinanceiras.find((c) => c.id === contaFinanceiraId),
    [contasFinanceiras, contaFinanceiraId],
  )

  const formaSelecionada = useMemo(
    () => formasPagamento.find((f) => f.id === formaPagamentoId),
    [formasPagamento, formaPagamentoId],
  )

  // Submissão do recebimento
  const handleConfirmarRecebimento = async () => {
    if (!empresaAtiva?.id) return

    if (!contaFinanceiraId) {
      toast({
        title: 'Selecione a conta financeira',
        description: 'Informe qual conta bancária ou caixa receberá os valores.',
        variant: 'destructive',
      })
      return
    }

    if (totalLote <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'O valor total a receber deve ser maior que zero.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const res = await receberTitulos({
        empresa_id: empresaAtiva.id,
        conta_financeira_id: contaFinanceiraId,
        forma_pagamento_id: formaPagamentoId || undefined,
        data_pagamento: dataRecebimento,
        titulos: linhas.map((l) => ({
          conta_receber_id: l.titulo.id,
          valor_pago: l.valorRecebidoPrincipal,
          acrescimo: Number((l.multa + l.juros).toFixed(2)),
          desconto: l.desconto,
          plano_desconto_id: l.plano_desconto_id || undefined,
        })),
        observacao: observacaoLote || undefined,
      })

      toast({
        title: 'Recebimento confirmado!',
        description: `${linhas.length} título(s) baixado(s) com sucesso.`,
      })

      // Monta recibo
      const itensRecibo: ReciboRecebimentoItem[] = linhas.map((l) => {
        const novoSaldo = Math.max(0, l.saldo - l.valorRecebidoPrincipal)
        const novoStatus = novoSaldo <= 0.009 ? 'Recebido' : 'Parcial'
        const clienteNome =
          l.titulo.expand?.cliente_id?.razao_social ||
          l.titulo.expand?.cliente_id?.nome_fantasia ||
          l.titulo.expand?.cliente_id?.nome ||
          'Cliente'

        return {
          conta_receber_id: l.titulo.id,
          numero_documento: l.titulo.numero_documento || 'S/N',
          descricao: l.titulo.descricao || 'Recebimento',
          cliente_nome: clienteNome,
          valor_original: l.titulo.valor_original,
          valor_pago: l.valorRecebidoPrincipal,
          valor_multa: l.multa,
          valor_juros: l.juros,
          valor_desconto: l.desconto,
          valor_total_pago: l.valorTotalReceber,
          status_novo: novoStatus,
        }
      })

      setReciboResultado({
        lote_id: res.lote?.id,
        total_titulos: linhas.length,
        valor_total: totalLote,
        itens: itensRecibo,
      })

      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao comunicar com o servidor.'
      toast({
        title: 'Erro ao processar recebimento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Geração de Recibo em PDF / Janela de Impressão formatada
  const handleImprimirReciboPdf = () => {
    if (!reciboResultado) return

    const nomeConta = contaSelecionada?.nome || 'Conta Financeira'
    const nomeForma = formaSelecionada?.descricao || 'Não informada'
    const dataFormatada = new Date(dataRecebimento + 'T00:00:00').toLocaleDateString('pt-BR')

    const janela = window.open('', '_blank')
    if (!janela) {
      toast({
        title: 'Bloqueador de pop-ups ativo',
        description: 'Permita pop-ups no seu navegador para imprimir o recibo.',
        variant: 'destructive',
      })
      return
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Recibo de Recebimento - ${empresaAtiva?.razao_social || 'ERP'}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            margin: 30px;
            color: #1e293b;
          }
          .header {
            border-bottom: 2px solid #059669;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 20px;
            font-weight: bold;
            color: #065f46;
            margin: 0;
          }
          .subtitle {
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 20px;
            font-size: 13px;
            background: #f8fafc;
            padding: 14px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
          }
          .info-item {
            margin-bottom: 4px;
          }
          .info-label {
            font-weight: 600;
            color: #475569;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 12px;
          }
          th {
            background: #f1f5f9;
            text-align: left;
            padding: 8px 10px;
            border-bottom: 2px solid #cbd5e1;
            color: #334155;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .text-right {
            text-align: right;
          }
          .total-box {
            margin-top: 25px;
            padding: 15px;
            background: #ecfdf5;
            border-radius: 6px;
            border: 1px solid #a7f3d0;
            font-size: 15px;
            font-weight: bold;
            text-align: right;
            color: #065f46;
          }
          .assinatura-container {
            margin-top: 60px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            text-align: center;
            font-size: 12px;
            color: #475569;
          }
          .linha-assinatura {
            border-top: 1px solid #94a3b8;
            padding-top: 6px;
          }
          .footer {
            margin-top: 40px;
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
          }
          @media print {
            body { margin: 15mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">RECIBO DE PAGAMENTO / RECEBIMENTO</h1>
          <div class="subtitle">ERP Comercial • ${reciboResultado.lote_id ? `Lote #${reciboResultado.lote_id}` : 'Recebimento de Títulos'}</div>
        </div>

        <div class="info-grid">
          <div>
            <div class="info-item"><span class="info-label">Empresa Recebedora:</span> ${empresaAtiva?.razao_social || ''}</div>
            <div class="info-item"><span class="info-label">CNPJ:</span> ${empresaAtiva?.cnpj || '-'}</div>
            <div class="info-item"><span class="info-label">Conta Creditada:</span> ${nomeConta}</div>
          </div>
          <div>
            <div class="info-item"><span class="info-label">Data do Recebimento:</span> ${dataFormatada}</div>
            <div class="info-item"><span class="info-label">Forma de Pagamento:</span> ${nomeForma}</div>
            <div class="info-item"><span class="info-label">Qtd. Títulos:</span> ${reciboResultado.total_titulos}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Cliente</th>
              <th>Descrição</th>
              <th class="text-right">Original (R$)</th>
              <th class="text-right">Principal (R$)</th>
              <th class="text-right">Encargos (R$)</th>
              <th class="text-right">Desconto (R$)</th>
              <th class="text-right">Total Recebido (R$)</th>
              <th>Novo Status</th>
            </tr>
          </thead>
          <tbody>
            ${reciboResultado.itens
              .map(
                (item) => `
              <tr>
                <td><strong>${item.numero_documento}</strong></td>
                <td>${item.cliente_nome}</td>
                <td>${item.descricao}</td>
                <td class="text-right">${item.valor_original.toFixed(2)}</td>
                <td class="text-right">${item.valor_pago.toFixed(2)}</td>
                <td class="text-right">${((item.valor_multa || 0) + (item.valor_juros || 0)).toFixed(2)}</td>
                <td class="text-right">${(item.valor_desconto || 0).toFixed(2)}</td>
                <td class="text-right"><strong>${item.valor_total_pago.toFixed(2)}</strong></td>
                <td>${item.status_novo}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>

        <div class="total-box">
          VALOR TOTAL RECEBIDO: R$ ${reciboResultado.valor_total.toFixed(2)}
        </div>

        <div class="assinatura-container">
          <div>
            <div class="linha-assinatura">Assinatura da Empresa (Recebedor)</div>
          </div>
          <div>
            <div class="linha-assinatura">Assinatura do Cliente (Pagador)</div>
          </div>
        </div>

        <div class="footer">
          Recibo emitido em ${new Date().toLocaleString('pt-BR')} via Sistema ERP Comercial.
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

  // TELA 2: Pós-recebimento com Recibo e Botão PDF
  if (reciboResultado) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Recebimento Confirmado com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              O crédito foi registrado na conta financeira e o saldo dos títulos foi atualizado no
              kardex.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 text-xs">
            {/* Destaque do Lote */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                  {reciboResultado.lote_id
                    ? `Lote de Recebimento #${reciboResultado.lote_id}`
                    : 'Recebimento Registrado'}
                </span>
                <p className="text-sm font-medium text-slate-800 mt-0.5">
                  {reciboResultado.total_titulos} título(s) recebido(s) em{' '}
                  {new Date(dataRecebimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500">
                  Conta: <strong>{contaSelecionada?.nome}</strong> | Forma:{' '}
                  <strong>{formaSelecionada?.descricao || 'Padrão'}</strong>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-emerald-700 uppercase font-semibold">
                  Total Recebido
                </span>
                <div className="text-2xl font-mono font-bold text-emerald-800">
                  R$ {reciboResultado.valor_total.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Tabela de títulos baixados */}
            <div className="border rounded-md overflow-hidden bg-white max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 text-left">Documento</th>
                    <th className="py-2 px-3 text-left">Cliente</th>
                    <th className="py-2 px-3 text-right">Total Recebido</th>
                    <th className="py-2 px-3 text-center">Novo Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reciboResultado.itens.map((it) => (
                    <tr key={it.conta_receber_id}>
                      <td className="py-1.5 px-3 font-mono font-medium">{it.numero_documento}</td>
                      <td className="py-1.5 px-3 truncate max-w-[180px]">{it.cliente_nome}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold">
                        R$ {it.valor_total_pago.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            it.status_novo === 'Recebido'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                          }
                        >
                          {it.status_novo}
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
              onClick={handleImprimirReciboPdf}
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Imprimir Recibo (PDF)
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

  // TELA 1: Formulário de Recebimento
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            {titulos.length > 1
              ? `Receber ${titulos.length} Títulos em Lote`
              : 'Efetuar Recebimento de Título'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Informe a data, a conta financeira que receberá o crédito e revise encargos e descontos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-xs">
          {/* Cabeçalho do Recebimento: Data, Conta, Forma e Observação */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="data_recebimento" className="text-xs font-semibold text-slate-700">
                Data do Recebimento *
              </Label>
              <Input
                id="data_recebimento"
                type="date"
                value={dataRecebimento}
                onChange={(e) => handleDataRecebimentoChange(e.target.value)}
                className="h-8 text-xs bg-white"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="conta_financeira" className="text-xs font-semibold text-slate-700">
                Conta Financeira (Crédito) *
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
                    {c.nome} (Saldo atual: R$ {(c.saldo_atual || 0).toFixed(2)})
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
              <Label htmlFor="obs_recebimento" className="text-xs font-semibold text-slate-700">
                Observação do Recebimento
              </Label>
              <Input
                id="obs_recebimento"
                value={observacaoLote}
                onChange={(e) => setObservacaoLote(e.target.value)}
                placeholder="Ex: Recebimento ref. títulos clientes da quinzena..."
                className="h-8 text-xs bg-white"
              />
            </div>
          </div>

          {/* Destaque do Lote / Total */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg gap-2">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <span className="text-xs text-emerald-950 font-semibold">
                  Conta Creditada: {contaSelecionada?.nome || 'Nenhuma selecionada'}
                </span>
                <span className="text-[11px] text-emerald-700 block">
                  Saldo antes do recebimento: R$ {(contaSelecionada?.saldo_atual || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-slate-500 uppercase font-semibold">
                Total a Creditar no Caixa
              </span>
              <div className="text-xl font-mono font-bold text-emerald-800">
                R$ {totalLote.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Grade de Títulos a Receber */}
          <div className="border rounded-lg bg-white overflow-hidden shadow-xs">
            <div className="px-3 py-2 bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Títulos Selecionados ({linhas.length})</span>
              <span className="text-[11px] font-normal text-slate-500">
                Valores menores que o saldo geram recebimento parcial.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-left">Documento</th>
                    <th className="py-2 px-3 text-left">Cliente / Descrição</th>
                    <th className="py-2 px-3 text-center">Vencimento</th>
                    <th className="py-2 px-3 text-right">Saldo em Aberto</th>
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
                    const clienteNome =
                      linha.titulo.expand?.cliente_id?.razao_social ||
                      linha.titulo.expand?.cliente_id?.nome_fantasia ||
                      linha.titulo.expand?.cliente_id?.nome ||
                      'Cliente'

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
                            {clienteNome}
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
                            value={linha.valorRecebidoPrincipal}
                            onChange={(e) =>
                              handleAlterarLinha(
                                idx,
                                'valorRecebidoPrincipal',
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
                          {Boolean(linha.taxa_cartao_sugerida) && (
                            <span
                              className="text-[10px] text-emerald-600 block truncate cursor-help"
                              title={`Taxa de cartão sugerida pela venda: R$ ${linha.taxa_cartao_sugerida?.toFixed(2)}`}
                            >
                              Tx cartão: R$ {linha.taxa_cartao_sugerida?.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          R$ {linha.valorTotalReceber.toFixed(2)}
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
                      Total a Receber:
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
            onClick={handleConfirmarRecebimento}
            disabled={salvando || totalLote <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Processando recebimento...
              </>
            ) : (
              `Confirmar Recebimento (R$ ${totalLote.toFixed(2)})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
