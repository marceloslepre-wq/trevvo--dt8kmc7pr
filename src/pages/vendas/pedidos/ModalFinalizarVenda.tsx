import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, DollarSign, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { listarFormasPagamento, FormaPagamento } from '@/services/formasPagamento'
import { listarContasFinanceiras, ContaFinanceira } from '@/services/contasFinanceiras'
import {
  listarCondicoesPagamento,
  gerarParcelas,
  CondicaoPagamento,
  ParcelaCalculada,
} from '@/services/condicoesPagamento'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'
import {
  finalizarVenda,
  FinalizarVendaResponse,
  PagamentoVendaInput,
  Venda,
} from '@/services/vendas'
import { abaterSaldoValeTroca } from '@/services/devolucoes'

export interface ItemPagamentoLinha {
  id: string
  forma_pagamento_id: string
  valor: number
  parcelas: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  conta_financeira_id?: string
  condicao_pagamento_id?: string
}

export interface ModalFinalizarVendaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  venda: Venda
  condicaoVendaId?: string
  onSucesso: (res: FinalizarVendaResponse) => void
}

export const ModalFinalizarVenda: React.FC<ModalFinalizarVendaProps> = ({
  aberto,
  onOpenChange,
  venda,
  condicaoVendaId,
  onSucesso,
}) => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()

  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [contaPadraoRecebimentosId, setContaPadraoRecebimentosId] = useState<string>('')
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [linhas, setLinhas] = useState<ItemPagamentoLinha[]>([])

  // Parcelas do Crediário calculadas
  const [parcelasCrediario, setParcelasCrediario] = useState<ParcelaCalculada[]>([])

  const totalVenda = Number(venda.valor_total || 0)

  // Carregar formas, contas e config financeira
  useEffect(() => {
    if (!aberto || !empresaAtiva?.id) return

    let ativo = true
    setCarregandoDados(true)
    setErro(null)

    Promise.all([
      listarFormasPagamento({ situacao: 'ativos' }),
      listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }),
      listarCondicoesPagamento({ uso: 'Vendas', situacao: 'ativos', porPagina: 50 }),
      obterOuCriarConfigFinanceiraEmpresa(empresaAtiva.id),
    ])
      .then(([formasRes, contasRes, condicoesRes, cfgFin]) => {
        if (!ativo) return
        setFormas(formasRes)
        setContas(contasRes)
        setCondicoes(condicoesRes.items)

        // Se houver conta_padrao_recebimentos ou fallback para primeira conta ativa
        const defaultContaId =
          (cfgFin as any)?.conta_padrao_recebimentos_id || contasRes.find((c) => c.ativo)?.id || ''
        setContaPadraoRecebimentosId(defaultContaId)

        // Linha inicial com a primeira forma de pagamento
        const primeiraForma = formasRes[0]
        if (primeiraForma) {
          setLinhas([
            {
              id: Math.random().toString(),
              forma_pagamento_id: primeiraForma.id,
              valor: totalVenda,
              parcelas: 1,
              conta_financeira_id:
                primeiraForma.conta_financeira_padrao_id || defaultContaId || undefined,
              condicao_pagamento_id: condicaoVendaId || undefined,
            },
          ])
        }
      })
      .catch((err) => {
        if (!ativo) return
        console.error('Erro ao carregar dados de pagamento:', err)
        setErro('Erro ao carregar configurações de pagamento.')
      })
      .finally(() => {
        if (ativo) setCarregandoDados(false)
      })

    return () => {
      ativo = false
    }
  }, [aberto, empresaAtiva?.id, totalVenda, condicaoVendaId])

  // Total pago somando todas as linhas
  const totalPago = useMemo(() => {
    return linhas.reduce((acc, l) => acc + (Number(l.valor) || 0), 0)
  }, [linhas])

  // Diferença / Troco
  const troco = Math.max(0, Math.round((totalPago - totalVenda) * 100) / 100)
  const restante = Math.max(0, Math.round((totalVenda - totalPago) * 100) / 100)

  // Verifica se alguma linha é crediário/a prazo para calcular as parcelas
  const recalcularParcelasCrediario = useCallback(() => {
    const linhaCrediario = linhas.find((l) => {
      const f = formas.find((forma) => forma.id === l.forma_pagamento_id)
      return (f?.tipo as string) === 'Crediário' || (f?.tipo as string) === 'Boleto bancário'
    })

    if (!linhaCrediario || !linhaCrediario.condicao_pagamento_id) {
      setParcelasCrediario([])
      return
    }

    const cond = condicoes.find((c) => c.id === linhaCrediario.condicao_pagamento_id)
    if (!cond) {
      setParcelasCrediario([])
      return
    }

    const calculadas = gerarParcelas(cond, Number(linhaCrediario.valor) || 0)
    setParcelasCrediario(calculadas)
  }, [linhas, formas, condicoes])

  useEffect(() => {
    recalcularParcelasCrediario()
  }, [recalcularParcelasCrediario])

  const handleAdicionarLinha = () => {
    const primeira = formas[0]
    setLinhas((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        forma_pagamento_id: primeira?.id || '',
        valor: restante > 0 ? restante : 0,
        parcelas: 1,
        conta_financeira_id:
          primeira?.conta_financeira_padrao_id || contaPadraoRecebimentosId || undefined,
        condicao_pagamento_id: condicaoVendaId || undefined,
      },
    ])
  }

  const handleRemoverLinha = (id: string) => {
    if (linhas.length <= 1) return
    setLinhas((prev) => prev.filter((l) => l.id !== id))
  }

  const handleAtualizarLinha = (id: string, campo: keyof ItemPagamentoLinha, valor: any) => {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [campo]: valor }

        if (campo === 'forma_pagamento_id') {
          const formaObj = formas.find((f) => f.id === valor)
          if (formaObj?.conta_financeira_padrao_id) {
            updated.conta_financeira_id = formaObj.conta_financeira_padrao_id
          } else if (!updated.conta_financeira_id) {
            updated.conta_financeira_id = contaPadraoRecebimentosId
          }
        }

        return updated
      }),
    )
  }

  const handleFinalizar = async () => {
    setErro(null)

    if (linhas.length === 0) {
      setErro('Informe pelo menos uma forma de pagamento.')
      return
    }

    if (totalPago < totalVenda - 0.009) {
      setErro(
        `O valor total pago (R$ ${totalPago.toFixed(2)}) é inferior ao valor da venda (R$ ${totalVenda.toFixed(2)}).`,
      )
      return
    }

    // Se houve troco mas nenhuma forma foi Dinheiro
    if (troco > 0) {
      const temDinheiro = linhas.some((l) => {
        const f = formas.find((forma) => forma.id === l.forma_pagamento_id)
        return f?.tipo === 'Dinheiro'
      })
      if (!temDinheiro) {
        setErro('Troco só é permitido quando houver pagamento em Dinheiro.')
        return
      }
    }

    // Montar payload
    const pagamentosPayload: PagamentoVendaInput[] = linhas.map((l) => {
      const formaObj = formas.find((f) => f.id === l.forma_pagamento_id)
      return {
        forma_pagamento_id: l.forma_pagamento_id,
        valor: Number(l.valor) || 0,
        parcelas: l.parcelas || 1,
        bandeira: l.bandeira || undefined,
        nsu: l.nsu || undefined,
        codigo_autorizacao: l.codigo_autorizacao || undefined,
        conta_financeira_id:
          l.conta_financeira_id ||
          formaObj?.conta_financeira_padrao_id ||
          contaPadraoRecebimentosId ||
          undefined,
        condicao_pagamento_id: l.condicao_pagamento_id || undefined,
      }
    })

    setSalvando(true)
    try {
      // Abater vales-troca se houver
      for (const linha of linhas) {
        const formaObj = formas.find((f) => f.id === linha.forma_pagamento_id)
        const ehVale =
          formaObj?.codigo_tpag === '99' ||
          formaObj?.descricao.toLowerCase().includes('vale-troca') ||
          formaObj?.descricao.toLowerCase().includes('vale troca')

        if (ehVale && linha.codigo_autorizacao) {
          try {
            await abaterSaldoValeTroca({
              valeId: linha.codigo_autorizacao,
              valorAbater: linha.valor,
            })
          } catch (errVale) {
            console.warn('Erro ao abater vale na venda:', errVale)
          }
        }
      }

      const res = await finalizarVenda({
        venda_id: venda.id,
        pagamentos: pagamentosPayload,
      })

      toast({
        title: 'Venda finalizada com sucesso!',
        description: `Venda #${res.numero} concluída. Estoque e financeiro atualizados.`,
      })

      onSucesso(res)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao finalizar venda.'
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Finalizar Venda #{venda.numero}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Informe as formas de pagamento, parcelamento e troco para concluir a venda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {erro && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {carregandoDados ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-xs">Carregando dados financeiros...</span>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Resumo do Total */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                  Total da Venda
                </span>
                <p className="text-lg font-bold text-slate-900">
                  R$ {totalVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                  Total Informado
                </span>
                <p className="text-lg font-bold text-blue-600">
                  R$ {totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                {troco > 0 ? (
                  <div>
                    <span className="text-[11px] font-semibold text-emerald-600 uppercase">
                      Troco no Dinheiro
                    </span>
                    <p className="text-lg font-bold text-emerald-600">
                      R$ {troco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      Falta Pagar
                    </span>
                    <p
                      className={`text-lg font-bold ${restante > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                    >
                      R$ {restante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Linhas de Pagamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 uppercase">
                  Formas de Pagamento (Pode misturar)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAdicionarLinha}
                  className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
                >
                  <Plus size={13} />
                  Adicionar outra forma
                </Button>
              </div>

              <div className="space-y-2.5">
                {linhas.map((linha, idx) => {
                  const formaSelecionada = formas.find((f) => f.id === linha.forma_pagamento_id)
                  const ehCartao =
                    formaSelecionada?.tipo === 'Cartão de crédito' ||
                    formaSelecionada?.tipo === 'Cartão de débito'
                  const ehCrediario =
                    (formaSelecionada?.tipo as string) === 'Crediário' ||
                    (formaSelecionada?.tipo as string) === 'Boleto bancário'
                  const ehDinheiro = formaSelecionada?.tipo === 'Dinheiro'

                  return (
                    <div
                      key={linha.id}
                      className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs space-y-3"
                    >
                      <div className="grid grid-cols-12 gap-2.5 items-end">
                        {/* Forma de Pagamento */}
                        <div className="col-span-5 space-y-1">
                          <Label className="text-[11px] font-medium text-slate-600">
                            Forma {idx + 1}
                          </Label>
                          <Select
                            value={linha.forma_pagamento_id}
                            onValueChange={(v) =>
                              handleAtualizarLinha(linha.id, 'forma_pagamento_id', v)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {formas.map((f) => (
                                <SelectItem key={f.id} value={f.id} className="text-xs">
                                  {f.descricao} ({f.tipo})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Valor */}
                        <div className="col-span-3 space-y-1">
                          <Label className="text-[11px] font-medium text-slate-600">
                            Valor (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={linha.valor === 0 ? '' : linha.valor}
                            onChange={(e) =>
                              handleAtualizarLinha(
                                linha.id,
                                'valor',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="h-8 text-xs font-semibold"
                          />
                        </div>

                        {/* Parcelas ou Conta */}
                        {ehCartao ? (
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[11px] font-medium text-slate-600">
                              Parcelas
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              max="24"
                              value={linha.parcelas}
                              onChange={(e) =>
                                handleAtualizarLinha(
                                  linha.id,
                                  'parcelas',
                                  parseInt(e.target.value, 10) || 1,
                                )
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : ehCrediario ? (
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[11px] font-medium text-slate-600">
                              Condição do Crediário
                            </Label>
                            <Select
                              value={linha.condicao_pagamento_id || ''}
                              onValueChange={(v) =>
                                handleAtualizarLinha(linha.id, 'condicao_pagamento_id', v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Condição..." />
                              </SelectTrigger>
                              <SelectContent>
                                {condicoes.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="col-span-3 space-y-1">
                            <Label className="text-[11px] font-medium text-slate-600">
                              Conta Financeira
                            </Label>
                            <Select
                              value={linha.conta_financeira_id || contaPadraoRecebimentosId || ''}
                              onValueChange={(v) =>
                                handleAtualizarLinha(linha.id, 'conta_financeira_id', v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Conta destino..." />
                              </SelectTrigger>
                              <SelectContent>
                                {contas.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Botão Remover Linha */}
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoverLinha(linha.id)}
                            disabled={linhas.length <= 1}
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </div>

                      {/* Dados adicionais para Cartão de Crédito / Débito */}
                      {ehCartao && (
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                          <div>
                            <Label className="text-[10px] text-slate-500">Bandeira</Label>
                            <Input
                              placeholder="Ex.: Visa, Master"
                              value={linha.bandeira || ''}
                              onChange={(e) =>
                                handleAtualizarLinha(linha.id, 'bandeira', e.target.value)
                              }
                              className="h-7 text-xs mt-0.5"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">NSU / DOC</Label>
                            <Input
                              placeholder="000000"
                              value={linha.nsu || ''}
                              onChange={(e) =>
                                handleAtualizarLinha(linha.id, 'nsu', e.target.value)
                              }
                              className="h-7 text-xs mt-0.5"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500">Cód. Autorização</Label>
                            <Input
                              placeholder="Ex.: AUT123"
                              value={linha.codigo_autorizacao || ''}
                              onChange={(e) =>
                                handleAtualizarLinha(linha.id, 'codigo_autorizacao', e.target.value)
                              }
                              className="h-7 text-xs mt-0.5"
                            />
                          </div>
                        </div>
                      )}

                      {ehDinheiro && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                          Pagamento fora do PDV: baixado imediatamente na conta financeira padrão de
                          recebimentos (não exige caixa aberto).
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quadro de Parcelas do Crediário */}
            {parcelasCrediario.length > 0 && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                  <span>Cronograma de Parcelas do Crediário</span>
                  <Badge variant="outline" className="bg-white text-blue-700 border-blue-300">
                    {parcelasCrediario.length} parcelas
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {parcelasCrediario.map((p) => (
                    <div
                      key={p.numero}
                      className="p-2 bg-white rounded border border-blue-100 flex flex-col items-center"
                    >
                      <span className="font-semibold text-blue-800">Parc. {p.numero}</span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      <span className="font-bold text-slate-900 mt-1">
                        R$ {p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
            className="text-xs"
          >
            Voltar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={salvando || carregandoDados || totalPago < totalVenda - 0.009}
            onClick={handleFinalizar}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            {salvando ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Finalizando Venda...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Confirmar e Finalizar Venda</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
