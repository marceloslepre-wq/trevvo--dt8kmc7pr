import { useState, useEffect } from 'react'
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
import { AlertCircle, ArrowUpRight, CheckCircle2, Lock } from 'lucide-react'
import { listarTerminais, type Terminal } from '@/services/terminais'
import { abrirSessaoCaixa } from '@/services/caixa'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

interface ModalAbrirCaixaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  empresaId: string
  onSucesso: () => void
}

export function ModalAbrirCaixa({
  open,
  onOpenChange,
  empresaId,
  onSucesso,
}: ModalAbrirCaixaProps) {
  const { toast } = useToast()
  const [carregandoTerminais, setCarregandoTerminais] = useState(false)
  const [terminaisDisponiveis, setTerminaisDisponiveis] = useState<Terminal[]>([])
  const [terminalSelecionadoId, setTerminalSelecionadoId] = useState('')
  const [valorAberturaStr, setValorAberturaStr] = useState('0,00')
  const [realizarSuprimento, setRealizarSuprimento] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Saldo da conta física do terminal selecionado
  const [saldoContaCaixa, setSaldoContaCaixa] = useState<number | null>(null)
  const [nomeCofre, setNomeCofre] = useState<string>('')
  const [saldoCofre, setSaldoCofre] = useState<number | null>(null)

  // Buscar terminais ativos da empresa que NÃO possuem sessão aberta
  useEffect(() => {
    if (!open || !empresaId) return

    async function carregarTerminais() {
      setCarregandoTerminais(true)
      try {
        const todos = await listarTerminais(empresaId)
        const ativos = todos.filter((t) => t.ativo)

        // Buscar sessões abertas da empresa
        const sessoesAbertas = await pb.collection('caixa_sessoes').getFullList<{
          pdv_terminal_id: string
        }>({
          filter: `empresa_id = '${empresaId}' && status = 'Aberto' && ativo = true`,
        })

        const idsComSessaoAberta = new Set(sessoesAbertas.map((s) => s.pdv_terminal_id))
        const livres = ativos.filter((t) => !idsComSessaoAberta.has(t.id))

        setTerminaisDisponiveis(livres)
        if (livres.length > 0) {
          setTerminalSelecionadoId(livres[0].id)
        } else {
          setTerminalSelecionadoId('')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao listar terminais.'
        toast({ title: 'Erro', description: msg, variant: 'destructive' })
      } finally {
        setCarregandoTerminais(false)
      }
    }

    carregarTerminais()
    setValorAberturaStr('0,00')
    setRealizarSuprimento(false)
  }, [open, empresaId, toast])

  // Ao selecionar um terminal, carregar saldo atual da conta_financeira_id e conta_cofre_id
  useEffect(() => {
    if (!terminalSelecionadoId) {
      setSaldoContaCaixa(null)
      setSaldoCofre(null)
      setNomeCofre('')
      return
    }

    const t = terminaisDisponiveis.find((x) => x.id === terminalSelecionadoId)
    if (!t) return

    async function buscarSaldos() {
      try {
        if (t?.conta_financeira_id) {
          const cCaixa = await pb.collection('contas_financeiras').getOne<{
            saldo_atual: number
          }>(t.conta_financeira_id)
          setSaldoContaCaixa(Number(cCaixa.saldo_atual || 0))
        } else {
          setSaldoContaCaixa(0)
        }

        if (t?.conta_cofre_id) {
          const cCofre = await pb.collection('contas_financeiras').getOne<{
            nome: string
            saldo_atual: number
          }>(t.conta_cofre_id)
          setNomeCofre(cCofre.nome)
          setSaldoCofre(Number(cCofre.saldo_atual || 0))
        } else {
          setNomeCofre('')
          setSaldoCofre(null)
        }
      } catch {
        // silencioso
      }
    }

    buscarSaldos()
  }, [terminalSelecionadoId, terminaisDisponiveis])

  const fundoInformado = parseFloat(valorAberturaStr.replace(/\./g, '').replace(',', '.')) || 0
  const diferencaTroco =
    saldoContaCaixa !== null ? Number((fundoInformado - saldoContaCaixa).toFixed(2)) : 0
  const precisaSuprimento = diferencaTroco > 0.009

  async function handleConfirmarAbertura(e: React.FormEvent) {
    e.preventDefault()
    if (!terminalSelecionadoId) {
      toast({
        title: 'Atenção',
        description: 'Selecione um terminal para abrir o caixa.',
        variant: 'destructive',
      })
      return
    }
    if (fundoInformado < 0) {
      toast({
        title: 'Atenção',
        description: 'O valor do fundo de troco não pode ser negativo.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await abrirSessaoCaixa({
        empresa_id: empresaId,
        pdv_terminal_id: terminalSelecionadoId,
        valor_abertura: fundoInformado,
        realizar_suprimento: precisaSuprimento && realizarSuprimento,
      })

      toast({
        title: 'Caixa aberto com sucesso!',
        description: `Sessão de caixa iniciada com fundo de R$ ${fundoInformado.toFixed(2)}${
          precisaSuprimento && realizarSuprimento
            ? ` (Suprimento de R$ ${diferencaTroco.toFixed(2)} lançado do cofre)`
            : ''
        }.`,
      })
      onOpenChange(false)
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao abrir caixa.'
      toast({ title: 'Falha na abertura', description: msg, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-5 w-5 text-sky-600" />
            Abertura de Caixa
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Selecione o terminal de PDV e declare o valor do fundo de troco para iniciar as
            operações.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirmarAbertura} className="space-y-4 py-2">
          {carregandoTerminais ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Carregando terminais disponíveis...
            </div>
          ) : terminaisDisponiveis.length === 0 ? (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Nenhum terminal disponível para abertura
              </p>
              <p>
                Todos os terminais desta filial já estão com sessões abertas ou não há terminais
                cadastrados e ativos.
              </p>
            </div>
          ) : (
            <>
              {/* Terminal */}
              <div className="space-y-1.5">
                <Label htmlFor="terminal_select" className="text-xs font-semibold text-slate-700">
                  Terminal de Caixa *
                </Label>
                <select
                  id="terminal_select"
                  value={terminalSelecionadoId}
                  onChange={(e) => setTerminalSelecionadoId(e.target.value)}
                  className="w-full h-9 text-xs px-2.5 rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  required
                >
                  {terminaisDisponiveis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}{' '}
                      {t.expand?.conta_financeira_id
                        ? `(${t.expand.conta_financeira_id.nome})`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Saldo Atual da Conta Caixa */}
              {saldoContaCaixa !== null && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">
                    Saldo atual na gaveta (físico):
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    R$ {saldoContaCaixa.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Fundo de Troco Informado */}
              <div className="space-y-1.5">
                <Label htmlFor="valor_abertura" className="text-xs font-semibold text-slate-700">
                  Fundo de Troco em Dinheiro (R$) *
                </Label>
                <Input
                  id="valor_abertura"
                  value={valorAberturaStr}
                  onChange={(e) => setValorAberturaStr(e.target.value)}
                  onBlur={() => {
                    setValorAberturaStr(
                      fundoInformado.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                    )
                  }}
                  className="text-base font-mono font-bold text-slate-900 h-10"
                  placeholder="0,00"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  Valor físico de moedas e cédulas contado na gaveta no início do turno.
                </p>
              </div>

              {/* Diferença e oferta de Suprimento */}
              {precisaSuprimento && (
                <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <ArrowUpRight className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold block">Diferença de Troco Detectada</span>
                      <p className="text-[11px] text-sky-800">
                        O fundo informado (R$ {fundoInformado.toFixed(2)}) é maior que o saldo atual
                        da gaveta (R$ {(saldoContaCaixa || 0).toFixed(2)}). Diferença:{' '}
                        <strong>R$ {diferencaTroco.toFixed(2)}</strong>.
                      </p>
                    </div>
                  </div>

                  {nomeCofre ? (
                    <label className="flex items-center gap-2 pt-1.5 border-t border-sky-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={realizarSuprimento}
                        onChange={(e) => setRealizarSuprimento(e.target.checked)}
                        className="rounded border-sky-400 text-sky-600 focus:ring-sky-500 h-4 w-4"
                      />
                      <span className="text-xs font-medium text-sky-900">
                        Realizar suprimento automático de{' '}
                        <strong>R$ {diferencaTroco.toFixed(2)}</strong> transferindo do cofre (
                        <em>{nomeCofre}</em>)
                        {saldoCofre !== null ? ` [Saldo atual: R$ ${saldoCofre.toFixed(2)}]` : ''}
                      </span>
                    </label>
                  ) : (
                    <p className="text-[11px] text-amber-700 italic border-t border-sky-200 pt-1">
                      * Terminal não possui conta cofre configurada para transferência automática de
                      suprimento.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <DialogFooter className="gap-2 pt-2">
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
              type="submit"
              size="sm"
              disabled={salvando || terminaisDisponiveis.length === 0}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {salvando ? 'Abrindo Caixa...' : 'Confirmar Abertura'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
