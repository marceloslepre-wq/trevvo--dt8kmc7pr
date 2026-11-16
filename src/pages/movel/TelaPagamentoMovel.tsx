import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Check, CreditCard, Banknote, QrCode, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FormaPagamento } from '@/services/formasPagamento'
import type { ContaFinanceira } from '@/services/contasFinanceiras'
import type { PagamentoVendaInput } from '@/services/vendas'

type Props = {
  aberto: boolean
  total: number
  formas: FormaPagamento[]
  contas: ContaFinanceira[]
  emitirNfce: boolean
  carregandoFormas: boolean
  /** Classes extras do container raiz (o MovelVendaPage posiciona em tela cheia). */
  className?: string
  aoVoltar: () => void
  aoConcluir: (params: {
    pagamentos: PagamentoVendaInput[]
    troco: number
    cpfCnpjConsumidor: string
  }) => void
}

const TIPO_ICONE: Record<string, React.ReactNode> = {
  Dinheiro: <Banknote className="h-5 w-5" />,
  Cartão: <CreditCard className="h-5 w-5" />,
  'Cartão de Crédito': <CreditCard className="h-5 w-5" />,
  'Cartão de Débito': <CreditCard className="h-5 w-5" />,
  PIX: <QrCode className="h-5 w-5" />,
  Outros: <Check className="h-5 w-5" />,
}

function iconeForma(tipo?: string): React.ReactNode {
  if (!tipo) return <Check className="h-5 w-5" />
  if (TIPO_ICONE[tipo]) return TIPO_ICONE[tipo]
  const chave = Object.keys(TIPO_ICONE).find((k) => k.toLowerCase() === tipo.toLowerCase())
  return chave ? TIPO_ICONE[chave] : <Check className="h-5 w-5" />
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function sanitizarDoc(doc: string): string {
  return doc.replace(/\D/g, '')
}

/** Validação de CPF/CNPJ — MESMA regra de src/lib/validacoes.ts (validarCPF/validarCNPJ). */
function validarDocumento(doc: string): boolean {
  const numeros = sanitizarDoc(doc)
  if (numeros.length === 11) {
    if (/^(\d)\1+$/.test(numeros)) return false
    let soma = 0
    for (let i = 0; i < 9; i++) soma += Number(numeros[i]) * (10 - i)
    let dig1 = (soma * 10) % 11
    if (dig1 === 10) dig1 = 0
    if (dig1 !== Number(numeros[9])) return false
    soma = 0
    for (let i = 0; i < 10; i++) soma += Number(numeros[i]) * (11 - i)
    let dig2 = (soma * 10) % 11
    if (dig2 === 10) dig2 = 0
    return dig2 === Number(numeros[10])
  }
  if (numeros.length === 14) {
    if (/^(\d)\1+$/.test(numeros)) return false
    const calc = (base: string, pesos: number[]): number => {
      let soma = 0
      for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i]
      const resto = (soma * 10) % 11
      return resto === 10 ? 0 : resto
    }
    const dig1 = calc(numeros.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    if (dig1 !== Number(numeros[12])) return false
    const dig2 = calc(numeros.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return dig2 === Number(numeros[13])
  }
  return false
}

export default function TelaPagamentoMovel({
  aberto,
  total,
  formas,
  contas,
  emitirNfce,
  carregandoFormas,
  className,
  aoVoltar,
  aoConcluir,
}: Props) {
  const [formaSelecionada, setFormaSelecionada] = useState<FormaPagamento | null>(null)
  const [valorRecebido, setValorRecebido] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [erroDoc, setErroDoc] = useState('')
  const [erroPagamento, setErroPagamento] = useState('')
  const [enviando, setEnviando] = useState(false)

  const troco = useMemo(() => {
    const receb = Number(valorRecebido.replace(',', '.')) || 0
    return Math.max(0, receb - total)
  }, [valorRecebido, total])

  const podeConcluir = useMemo(() => {
    if (!formaSelecionada) return false
    if (formaSelecionada.tipo === 'Dinheiro') {
      const receb = Number(valorRecebido.replace(',', '.')) || 0
      return receb >= total
    }
    return true
  }, [formaSelecionada, valorRecebido, total])

  if (!aberto) return null

  const limparTudo = () => {
    setFormaSelecionada(null)
    setValorRecebido('')
    setParcelas('1')
    setCpfCnpj('')
    setErroDoc('')
    setErroPagamento('')
  }

  const concluir = () => {
    if (!formaSelecionada) return
    if (enviando) return // sem duplo toque: só uma chamada até a resposta chegar
    const receb = Number(valorRecebido.replace(',', '.')) || 0

    // Mesmas validações do ModalPagamentoPDV
    if (formaSelecionada.tipo === 'Dinheiro' && receb < total) {
      setErroPagamento('O valor recebido deve ser maior ou igual ao total.')
      return
    }
    if (cpfCnpj.trim()) {
      const doc = sanitizarDoc(cpfCnpj)
      if (doc.length !== 11 && doc.length !== 14) {
        setErroDoc('CPF deve ter 11 dígitos; CNPJ, 14 dígitos.')
        return
      }
      if (!validarDocumento(doc)) {
        setErroDoc('CPF/CNPJ inválido.')
        return
      }
    }

    const pagamento: PagamentoVendaInput = {
      forma_pagamento_id: formaSelecionada.id,
      valor: total,
      parcelas: formaSelecionada.tipo === 'Dinheiro' ? 1 : Math.max(1, Number(parcelas) || 1),
      conta_financeira_id:
        formaSelecionada.expand?.conta_financeira_padrao_id?.id ||
        formaSelecionada.conta_financeira_padrao_id ||
        undefined,
    }

    setEnviando(true) // trava o botão de Concluir imediatamente (sem duplo toque)
    aoConcluir({
      pagamentos: [pagamento],
      troco: formaSelecionada.tipo === 'Dinheiro' ? Math.max(0, receb - total) : 0,
      cpfCnpjConsumidor: cpfCnpj.trim() ? sanitizarDoc(cpfCnpj) : '',
    })
  }

  return (
    <div className={cn('flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white', className)}>
      {/* Cabeçalho fino de uma linha (máx. 56px) */}
      <div className="flex h-14 max-h-14 min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 px-2"
          onClick={() => {
            limparTudo()
            aoVoltar()
          }}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">Pagamento</h2>
          <p className="truncate text-xs text-muted-foreground">Total {formatarMoeda(total)}</p>
        </div>
        {emitirNfce && (
          <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
            NFC-e
          </span>
        )}
      </div>

      {/* Conteúdo com rolagem própria (o teclado aberto não esconde o rodapé) */}
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-4">
        {carregandoFormas ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando formas de pagamento…
          </div>
        ) : formas.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma forma de pagamento cadastrada para esta loja.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Formas de pagamento */}
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {formas.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFormaSelecionada(f)
                      setErroPagamento('')
                      if (f.tipo !== 'Dinheiro') setValorRecebido('')
                    }}
                    className={cn(
                      'flex min-h-[64px] flex-col items-start justify-between gap-1 rounded-lg border-2 p-3 text-left transition-colors',
                      'active:scale-[0.98]',
                      formaSelecionada?.id === f.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-white hover:bg-muted/40',
                    )}
                  >
                    <span className="text-foreground">{iconeForma(f.tipo)}</span>
                    <span className="w-full">
                      <span className="block text-sm font-medium leading-tight">{f.descricao}</span>
                      <span className="block text-[11px] text-muted-foreground">{f.tipo}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dinheiro: valor recebido + troco */}
            {formaSelecionada?.tipo === 'Dinheiro' && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <Label htmlFor="movel-valor-recebido" className="text-xs text-muted-foreground">
                  Valor recebido
                </Label>
                <Input
                  id="movel-valor-recebido"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorRecebido}
                  onChange={(e) => {
                    setValorRecebido(e.target.value)
                    setErroPagamento('')
                  }}
                  className="mt-1 h-12 text-lg font-semibold"
                />
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Troco</span>
                  <span className="text-base font-bold text-emerald-700">
                    {formatarMoeda(troco)}
                  </span>
                </div>
              </div>
            )}

            {/* Cartão: parcelas */}
            {formaSelecionada &&
              (formaSelecionada.tipo === 'Cartão de crédito' ||
                formaSelecionada.tipo === 'Cartão de débito') && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <Label htmlFor="movel-parcelas" className="text-xs text-muted-foreground">
                    Parcelas
                  </Label>
                  <select
                    id="movel-parcelas"
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value)}
                    className="mt-1 h-12 w-full rounded-md border border-input bg-white px-3 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x de {formatarMoeda(total / n)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {/* CPF/CNPJ do consumidor (opcional) */}
            <div className="rounded-lg border bg-muted/20 p-3">
              <Label htmlFor="movel-cpf-cnpj" className="text-xs text-muted-foreground">
                CPF/CNPJ do consumidor (opcional)
              </Label>
              <Input
                id="movel-cpf-cnpj"
                inputMode="numeric"
                placeholder="Somente números"
                value={cpfCnpj}
                onChange={(e) => {
                  setCpfCnpj(e.target.value)
                  setErroDoc('')
                }}
                className="mt-1 h-12"
              />
              {erroDoc && <p className="mt-1 text-xs text-destructive">{erroDoc}</p>}
            </div>

            {erroPagamento && <p className="text-xs text-destructive">{erroPagamento}</p>}
          </div>
        )}
      </div>

      {/* Rodapé fixo com o botão principal */}
      <div className="shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {erroPagamento && (
          <p className="mb-1 text-center text-xs text-destructive">{erroPagamento}</p>
        )}
        <Button
          className="h-12 w-full text-base font-semibold"
          disabled={!podeConcluir || enviando || carregandoFormas || formas.length === 0}
          onClick={concluir}
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Concluir venda'}
        </Button>
      </div>
    </div>
  )
}
