import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign,
  QrCode,
  CreditCard,
  Wallet,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Plus,
} from 'lucide-react'
import type { FormaPagamento } from '@/services/formasPagamento'
import type { ContaFinanceira } from '@/services/contasFinanceiras'
import type { CondicaoPagamento } from '@/services/condicoesPagamento'
import type { Cliente } from '@/services/clientes'
import { creditoCliente, type SituacaoCreditoCliente } from '@/services/contasReceber'
import { consultarValeTroca, abaterSaldoValeTroca } from '@/services/devolucoes'

export interface PagamentoPDVLinha {
  id: string
  forma_pagamento_id: string
  valor: number
  parcelas: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  conta_financeira_id?: string
  condicao_pagamento_id?: string
  taxa_percentual?: number
}

interface ModalPagamentoPDVProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  totalVenda: number
  cliente: Cliente | null
  formas: FormaPagamento[]
  contas: ContaFinanceira[]
  condicoes: CondicaoPagamento[]
  contaPadraoCaixaId?: string
  empresaId: string
  onConfirmar: (
    pagamentos: Array<{
      forma_pagamento_id: string
      valor: number
      parcelas?: number
      bandeira?: string
      nsu?: string
      codigo_autorizacao?: string
      conta_financeira_id?: string
      condicao_pagamento_id?: string
    }>,
    troco: number,
  ) => Promise<void>
}

export const ModalPagamentoPDV: React.FC<ModalPagamentoPDVProps> = ({
  aberto,
  onOpenChange,
  totalVenda,
  cliente,
  formas,
  contas,
  condicoes,
  contaPadraoCaixaId,
  empresaId,
  onConfirmar,
}) => {
  const [linhas, setLinhas] = useState<PagamentoPDVLinha[]>([])
  const [valorDigitado, setValorDigitado] = useState<string>('')
  const [formaSelecionadaId, setFormaSelecionadaId] = useState<string>('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [analiseCredito, setAnaliseCredito] = useState<SituacaoCreditoCliente | null>(null)
  const [checandoCredito, setChecandoCredito] = useState(false)

  // Campos adicionais da forma ativa (ex.: parcelas, cartão, PIX, vale-troca)
  const [parcelasCartao, setParcelasCartao] = useState<number>(1)
  const [nsuCartao, setNsuCartao] = useState<string>('')
  const [autCartao, setAutCartao] = useState<string>('')
  const [bandeiraCartao, setBandeiraCartao] = useState<string>('')
  const [condicaoCrediarioId, setCondicaoCrediarioId] = useState<string>('')
  const [codigoValeTroca, setCodigoValeTroca] = useState<string>('')
  const [valeCarregado, setValeCarregado] = useState<any>(null)
  const [buscandoVale, setBuscandoVale] = useState(false)
  const [pixConfirmadoManualmente, setPixConfirmadoManualmente] = useState(false)

  const inputValorRef = useRef<HTMLInputElement>(null)

  // Totais
  const totalInformado = useMemo(() => {
    return linhas.reduce((acc, l) => acc + (Number(l.valor) || 0), 0)
  }, [linhas])

  const restante = useMemo(() => {
    return Math.max(0, Number((totalVenda - totalInformado).toFixed(2)))
  }, [totalVenda, totalInformado])

  const totalDinheiro = useMemo(() => {
    return linhas.reduce((acc, l) => {
      const f = formas.find((forma) => forma.id === l.forma_pagamento_id)
      if (
        f?.tipo === 'Dinheiro' ||
        f?.codigo_tpag === '01' ||
        f?.descricao.toLowerCase().includes('dinheiro')
      ) {
        return acc + (Number(l.valor) || 0)
      }
      return acc
    }, 0)
  }, [linhas, formas])

  const troco = useMemo(() => {
    const diff = Number((totalInformado - totalVenda).toFixed(2))
    if (diff > 0 && totalDinheiro >= diff - 0.01) {
      return diff
    }
    return 0
  }, [totalInformado, totalVenda, totalDinheiro])

  // Formas ativas e numeradas para atalho (1 a 9)
  const formasAtivas = useMemo(() => {
    return formas.filter((f) => f.ativo)
  }, [formas])

  const formaAtivaAtual = useMemo(() => {
    return formas.find((f) => f.id === formaSelecionadaId) || formasAtivas[0] || null
  }, [formas, formaSelecionadaId, formasAtivas])

  // Inicializa quando abre
  useEffect(() => {
    if (aberto) {
      setLinhas([])
      setErro(null)
      setPixConfirmadoManualmente(false)
      const primeira = formasAtivas[0]
      if (primeira) {
        setFormaSelecionadaId(primeira.id)
      }
      setValorDigitado(totalVenda > 0 ? totalVenda.toFixed(2) : '')
      setParcelasCartao(1)
      setNsuCartao('')
      setAutCartao('')
      setBandeiraCartao('')
      setCondicaoCrediarioId(condicoes[0]?.id || '')

      setTimeout(() => {
        inputValorRef.current?.focus()
        inputValorRef.current?.select()
      }, 100)
    }
  }, [aberto, totalVenda, formasAtivas, condicoes])

  // Atualiza o valor sugerido conforme o restante
  useEffect(() => {
    if (aberto && restante > 0 && linhas.length > 0) {
      setValorDigitado(restante.toFixed(2))
    }
  }, [aberto, restante, linhas.length])

  // Consulta limite de crédito se cliente selecionou Crediário
  useEffect(() => {
    const ehCrediario =
      formaAtivaAtual?.tipo === 'Crédito loja' ||
      formaAtivaAtual?.tipo === 'Boleto' ||
      formaAtivaAtual?.codigo_tpag === '05' ||
      formaAtivaAtual?.descricao.toLowerCase().includes('crediário')

    if (ehCrediario && cliente?.id && cliente.consumidor_final !== true) {
      setChecandoCredito(true)
      creditoCliente(cliente.id, empresaId)
        .then((res) => {
          setAnaliseCredito(res)
        })
        .catch(() => {
          setAnaliseCredito(null)
        })
        .finally(() => {
          setChecandoCredito(false)
        })
    } else {
      setAnaliseCredito(null)
    }
  }, [formaAtivaAtual, cliente, empresaId])

  // Adicionar linha de pagamento
  const handleAdicionarPagamento = () => {
    setErro(null)
    if (!formaAtivaAtual) {
      setErro('Selecione uma forma de pagamento.')
      return
    }

    const valorNum = parseFloat(valorDigitado.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      setErro('Informe um valor válido maior que zero.')
      inputValorRef.current?.focus()
      return
    }

    const ehValeTroca =
      formaAtivaAtual.codigo_tpag === '99' ||
      formaAtivaAtual.descricao.toLowerCase().includes('vale-troca') ||
      formaAtivaAtual.descricao.toLowerCase().includes('vale troca')

    if (ehValeTroca) {
      if (!codigoValeTroca.trim()) {
        setErro('Digite o código do vale-troca para validar e aplicar o saldo.')
        return
      }
      if (!valeCarregado) {
        setErro('Valide o código do vale-troca antes de lançar.')
        return
      }
      if (valorNum > valeCarregado.saldo + 0.009) {
        setErro(`O valor supera o saldo disponível do vale (R$ ${valeCarregado.saldo.toFixed(2)}).`)
        return
      }
    }

    const ehCrediario =
      !ehValeTroca &&
      (formaAtivaAtual.tipo === 'Crédito loja' ||
        formaAtivaAtual.tipo === 'Boleto' ||
        formaAtivaAtual.codigo_tpag === '05' ||
        formaAtivaAtual.descricao.toLowerCase().includes('crediário'))

    if (ehCrediario) {
      if (
        !cliente ||
        cliente.consumidor_final ||
        cliente.nome_razao_social === 'Consumidor Final'
      ) {
        setErro('Crediário / Venda a prazo exige um cliente identificado cadastrado.')
        return
      }
      if (analiseCredito && analiseCredito.situacao === 'Bloqueado') {
        setErro(`Cliente bloqueado para crediário: ${analiseCredito.motivos.join(', ')}`)
        return
      }
    }

    const ehPix =
      formaAtivaAtual.tipo === 'PIX' ||
      formaAtivaAtual.codigo_tpag === '17' ||
      formaAtivaAtual.descricao.toLowerCase().includes('pix')

    if (ehPix && !pixConfirmadoManualmente) {
      setErro(
        'Por favor, confira o recebimento do PIX e marque a confirmação manual antes de lançar.',
      )
      return
    }

    const novaLinha: PagamentoPDVLinha = {
      id: Math.random().toString(36).substring(2, 9),
      forma_pagamento_id: formaAtivaAtual.id,
      valor: valorNum,
      parcelas: parcelasCartao || 1,
      bandeira: bandeiraCartao || undefined,
      nsu: nsuCartao || undefined,
      codigo_autorizacao: autCartao || undefined,
      conta_financeira_id: formaAtivaAtual.conta_financeira_padrao_id || contaPadraoCaixaId,
      condicao_pagamento_id: ehCrediario ? condicaoCrediarioId : undefined,
    }

    const novasLinhas = [...linhas, novaLinha]
    setLinhas(novasLinhas)

    // Reseta inputs secundários
    setPixConfirmadoManualmente(false)
    setNsuCartao('')
    setAutCartao('')
    setBandeiraCartao('')
    setCodigoValeTroca('')
    setValeCarregado(null)

    const novoTotal = novasLinhas.reduce((acc, l) => acc + l.valor, 0)
    const novoRestante = Math.max(0, Number((totalVenda - novoTotal).toFixed(2)))
    setValorDigitado(novoRestante > 0 ? novoRestante.toFixed(2) : '')

    setTimeout(() => {
      inputValorRef.current?.focus()
      inputValorRef.current?.select()
    }, 50)
  }

  const handleRemoverLinha = (id: string) => {
    setLinhas(linhas.filter((l) => l.id !== id))
  }

  const handleFinalizar = async () => {
    setErro(null)
    if (linhas.length === 0) {
      setErro('Informe pelo menos um pagamento para concluir a venda.')
      return
    }

    if (restante > 0.009) {
      setErro(`Ainda resta R$ ${restante.toFixed(2)} a ser pago.`)
      return
    }

    // Se houve excedente mas não tem dinheiro suficiente
    const excedente = totalInformado - totalVenda
    if (excedente > 0.01 && troco <= 0) {
      setErro('O valor informado ultrapassa o total da venda, mas não há dinheiro para troco.')
      return
    }

    setSalvando(true)
    try {
      // Se houver pagamentos em Vale-troca, abate do banco
      for (const linha of linhas) {
        const formaLinha = formas.find((f) => f.id === linha.forma_pagamento_id)
        const ehVale =
          formaLinha?.codigo_tpag === '99' ||
          formaLinha?.descricao.toLowerCase().includes('vale-troca') ||
          formaLinha?.descricao.toLowerCase().includes('vale troca')

        if (ehVale && linha.codigo_autorizacao) {
          try {
            await abaterSaldoValeTroca({
              valeId: linha.codigo_autorizacao,
              valorAbater: linha.valor,
            })
          } catch (errVale) {
            console.warn('Erro ao abater vale:', errVale)
          }
        }
      }

      const payload = linhas.map((l) => ({
        forma_pagamento_id: l.forma_pagamento_id,
        valor: l.valor,
        parcelas: l.parcelas > 1 ? l.parcelas : undefined,
        bandeira: l.bandeira,
        nsu: l.nsu,
        codigo_autorizacao: l.codigo_autorizacao,
        conta_financeira_id: l.conta_financeira_id,
        condicao_pagamento_id: l.condicao_pagamento_id,
      }))

      await onConfirmar(payload, troco)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar pagamento.'
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  // Atalhos dentro do modal (1..9 para formas, Enter para adicionar/finalizar)
  useEffect(() => {
    if (!aberto) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Se pressionar Ctrl+Enter ou F10 dentro do modal, finaliza se estiver tudo pago
      if (e.key === 'F10' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault()
        if (restante <= 0.009 && linhas.length > 0 && !salvando) {
          handleFinalizar()
        }
      }

      // Atalhos numéricos com Alt + 1..9 para mudar a forma rápida
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1
        if (formasAtivas[idx]) {
          e.preventDefault()
          setFormaSelecionadaId(formasAtivas[idx].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [aberto, restante, linhas.length, salvando, formasAtivas])

  // Conta de PIX para exibir chave
  const contaPix = useMemo(() => {
    return (
      contas.find((c) => c.chave_pix && c.ativo) ||
      contas.find((c) => c.tipo === 'Conta corrente' && c.chave_pix) ||
      null
    )
  }, [contas])

  const ehValeTrocaAtual =
    formaAtivaAtual?.codigo_tpag === '99' ||
    formaAtivaAtual?.descricao.toLowerCase().includes('vale-troca') ||
    formaAtivaAtual?.descricao.toLowerCase().includes('vale troca')

  const ehCartaoAtual =
    formaAtivaAtual?.tipo === 'Cartão de crédito' ||
    formaAtivaAtual?.tipo === 'Cartão de débito' ||
    formaAtivaAtual?.codigo_tpag === '03' ||
    formaAtivaAtual?.codigo_tpag === '04'

  const ehCrediarioAtual =
    !ehValeTrocaAtual &&
    (formaAtivaAtual?.tipo === 'Crédito loja' ||
      formaAtivaAtual?.tipo === 'Boleto' ||
      formaAtivaAtual?.codigo_tpag === '05' ||
      formaAtivaAtual?.descricao.toLowerCase().includes('crediário'))

  const ehPixAtual =
    formaAtivaAtual?.tipo === 'PIX' ||
    formaAtivaAtual?.codigo_tpag === '17' ||
    formaAtivaAtual?.descricao.toLowerCase().includes('pix')

  // Consulta e validação rápida do vale
  const handleValidarVale = async () => {
    if (!codigoValeTroca.trim() || !empresaId) return
    setBuscandoVale(true)
    setErro(null)
    try {
      const vale = await consultarValeTroca(empresaId, codigoValeTroca.trim())
      if (!vale) {
        setErro('Vale-troca não encontrado ou inativo.')
        setValeCarregado(null)
      } else if (vale.status !== 'Ativo') {
        setErro(`Vale-troca está com status "${vale.status}".`)
        setValeCarregado(null)
      } else if (vale.saldo <= 0.009) {
        setErro('Vale-troca sem saldo disponível.')
        setValeCarregado(null)
      } else {
        setValeCarregado(vale)
        const valorSugerido = Math.min(vale.saldo, restante > 0 ? restante : totalVenda)
        setValorDigitado(valorSugerido.toFixed(2))
        setAutCartao(vale.id) // guarda o ID do vale no campo autorização
      }
    } catch {
      setErro('Erro ao consultar o vale-troca.')
    } finally {
      setBuscandoVale(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6 bg-slate-900 text-white border-slate-700">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white tracking-wide">
                  Finalizar Pagamento (F10)
                </DialogTitle>
                <p className="text-xs text-slate-400">
                  Total da Venda:{' '}
                  <span className="font-semibold text-white">R$ {totalVenda.toFixed(2)}</span>
                  {cliente?.nome_razao_social && (
                    <span className="ml-2 border-l border-slate-700 pl-2">
                      Cliente: {cliente.nome_razao_social}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-slate-800 text-slate-300 border-slate-700 text-xs"
            >
              ESC para voltar
            </Badge>
          </div>
        </DialogHeader>

        {erro && (
          <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* Quadro Superior de Totais */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-800/90 rounded-xl border border-slate-700/80">
          <div className="text-center border-r border-slate-700/60 pr-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Total da Venda
            </span>
            <div className="text-2xl font-black text-white mt-0.5">
              R$ {totalVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center border-r border-slate-700/60 px-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Total Pago
            </span>
            <div className="text-2xl font-black text-blue-400 mt-0.5">
              R$ {totalInformado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-center pl-2">
            {troco > 0 ? (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold animate-pulse">
                  Troco em Dinheiro
                </span>
                <div className="text-3xl font-black text-emerald-400 mt-0.5">
                  R$ {troco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ) : (
              <div>
                <span className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold">
                  Restante
                </span>
                <div
                  className={`text-2xl font-black mt-0.5 ${
                    restante > 0 ? 'text-amber-400' : 'text-slate-500'
                  }`}
                >
                  R$ {restante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5 pt-2">
          {/* Lado Esquerdo: Formas de Pagamento em Botões Numerados */}
          <div className="col-span-5 space-y-3">
            <Label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              1. Selecione a Forma (Alt + Número)
            </Label>
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {formasAtivas.map((f, idx) => {
                const ativa = f.id === formaSelecionadaId
                const num = idx + 1
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFormaSelecionadaId(f.id)
                      inputValorRef.current?.focus()
                      inputValorRef.current?.select()
                    }}
                    className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      ativa
                        ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/30 font-bold scale-[1.01]'
                        : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-bold ${
                          ativa ? 'bg-white text-blue-700' : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {num}
                      </span>
                      <span className="truncate text-sm">{f.descricao}</span>
                    </div>
                    <span className="text-[11px] opacity-75 font-normal ml-2 shrink-0">
                      {f.tipo}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lado Direito: Digitação de Valor e Detalhes da Forma */}
          <div className="col-span-7 space-y-4 bg-slate-850/60 p-4 rounded-xl border border-slate-800">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                2. Valor para {formaAtivaAtual?.descricao || 'Pagamento'} (R$)
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={inputValorRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorDigitado}
                  onChange={(e) => setValorDigitado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAdicionarPagamento()
                    }
                  }}
                  placeholder="0,00"
                  className="h-12 text-2xl font-black bg-slate-900 border-slate-700 text-emerald-400 text-right font-mono"
                />
                <Button
                  type="button"
                  onClick={handleAdicionarPagamento}
                  className="h-12 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1 text-sm shrink-0"
                >
                  <Plus size={18} />
                  Lançar (Enter)
                </Button>
              </div>
            </div>

            {/* Campos Especiais: CARTÃO DE CRÉDITO / DÉBITO */}
            {ehCartaoAtual && (
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                  <CreditCard size={15} />
                  <span>Dados da Transação de Cartão</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-slate-400">Parcelas</Label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      value={parcelasCartao}
                      onChange={(e) => setParcelasCartao(parseInt(e.target.value, 10) || 1)}
                      className="h-8 text-xs bg-slate-900 border-slate-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Bandeira (opcional)</Label>
                    <Input
                      placeholder="Ex: Visa"
                      value={bandeiraCartao}
                      onChange={(e) => setBandeiraCartao(e.target.value)}
                      className="h-8 text-xs bg-slate-900 border-slate-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">NSU / Autorização</Label>
                    <Input
                      placeholder="000000"
                      value={nsuCartao}
                      onChange={(e) => setNsuCartao(e.target.value)}
                      className="h-8 text-xs bg-slate-900 border-slate-700 mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campos Especiais: VALE-TROCA */}
            {ehValeTrocaAtual && (
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="font-semibold text-blue-300 flex items-center justify-between">
                  <span>Código do Vale-Troca</span>
                  {valeCarregado && (
                    <Badge className="bg-emerald-600 text-white text-[10px]">
                      Saldo: R$ {Number(valeCarregado.saldo).toFixed(2)}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: VT-9482-K3X"
                    value={codigoValeTroca}
                    onChange={(e) => setCodigoValeTroca(e.target.value.toUpperCase())}
                    className="h-8 text-xs bg-slate-900 border-slate-700 uppercase font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={buscandoVale}
                    onClick={handleValidarVale}
                    className="h-8 text-xs bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    {buscandoVale ? 'Validando...' : 'Validar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Campos Especiais: PIX */}
            {ehPixAtual && (
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <QrCode size={16} />
                  <span>Pagamento por PIX Estático</span>
                </div>
                {contaPix?.chave_pix ? (
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-700/80 font-mono text-center select-all">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Chave PIX da Loja ({contaPix.nome}):
                    </span>
                    <span className="text-sm font-bold text-white tracking-wider">
                      {contaPix.chave_pix}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Chave PIX não cadastrada nas contas financeiras. Realize a cobrança pelo
                    terminal da empresa.
                  </p>
                )}
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pixConfirmadoManualmente}
                    onChange={(e) => setPixConfirmadoManualmente(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="text-slate-300 text-xs">
                    Confirmo o recebimento do valor na conta da empresa
                  </span>
                </label>
              </div>
            )}

            {/* Campos Especiais: CREDIÁRIO */}
            {ehCrediarioAtual && (
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2 text-xs">
                <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <FileText size={15} />
                  <span>Crediário / Venda a Prazo</span>
                </div>
                {cliente ? (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Cliente Selecionado:</span>
                      <span className="font-bold text-white">{cliente.nome_razao_social}</span>
                    </div>
                    {checandoCredito ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> Consultando limite de
                        crédito...
                      </span>
                    ) : analiseCredito ? (
                      <div className="p-2 bg-slate-900 rounded border border-slate-700 flex justify-between items-center text-[11px]">
                        <span>
                          Situação:{' '}
                          <strong
                            className={
                              analiseCredito.situacao === 'Liberado'
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }
                          >
                            {analiseCredito.situacao}
                          </strong>
                        </span>
                        <span>
                          Limite disp.:{' '}
                          <strong>
                            {analiseCredito.credito_disponivel !== null
                              ? `R$ ${analiseCredito.credito_disponivel.toFixed(2)}`
                              : 'Ilimitado'}
                          </strong>
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-amber-400 text-[11px]">
                    Nenhum cliente identificado na venda. Use F3 para selecionar o cliente antes do
                    crediário.
                  </p>
                )}

                <div>
                  <Label className="text-[10px] text-slate-400">Plano de Pagamento</Label>
                  <select
                    value={condicaoCrediarioId}
                    onChange={(e) => setCondicaoCrediarioId(e.target.value)}
                    className="w-full h-8 bg-slate-900 border border-slate-700 rounded text-xs text-white px-2 mt-1"
                  >
                    {condicoes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.quantidade_parcelas}x)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Lista dos Pagamentos já lançados */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                Pagamentos Lançados nesta Venda ({linhas.length})
              </Label>
              {linhas.length === 0 ? (
                <div className="p-3 bg-slate-900/60 rounded-lg border border-dashed border-slate-700 text-center text-xs text-slate-500">
                  Nenhum pagamento lançado. Digite o valor e pressione Enter.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {linhas.map((l, i) => {
                    const f = formas.find((forma) => forma.id === l.forma_pagamento_id)
                    return (
                      <div
                        key={l.id}
                        className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-750 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 font-bold">{i + 1}.</span>
                          <span className="font-semibold text-white">
                            {f?.descricao || 'Forma'}
                          </span>
                          {l.parcelas > 1 && (
                            <Badge
                              variant="outline"
                              className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]"
                            >
                              {l.parcelas}x
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-400 font-mono text-sm">
                            R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoverLinha(l.id)}
                            className="p-1 text-slate-400 hover:text-red-400 rounded transition-colors"
                            title="Remover pagamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800 pt-4 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
          >
            Voltar (Esc)
          </Button>

          <Button
            type="button"
            size="lg"
            onClick={handleFinalizar}
            disabled={salvando || restante > 0.009 || linhas.length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base px-8 gap-2 shadow-lg shadow-emerald-950/40"
          >
            {salvando ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Processando venda...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Confirmar e Finalizar (F10)</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
