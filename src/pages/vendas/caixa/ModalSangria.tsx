import { useState } from 'react'
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
import { ArrowDownLeft, Printer } from 'lucide-react'
import { realizarSangriaCaixa, type CaixaSessao } from '@/services/caixa'
import { imprimirComprovanteSangria } from '@/services/caixaImpressao'
import { useToast } from '@/hooks/use-toast'

interface ModalSangriaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessao: CaixaSessao
  empresaNome: string
  onSucesso: () => void
}

export function ModalSangria({
  open,
  onOpenChange,
  sessao,
  empresaNome,
  onSucesso,
}: ModalSangriaProps) {
  const { toast } = useToast()
  const [valorStr, setValorStr] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Estado após confirmação com opção de impressão
  const [comprovante, setComprovante] = useState<{
    movimentoId: string
    transferenciaId?: string
    valor: number
    motivo: string
    dataHora: string
    operadorNome: string
    terminalNome: string
    empresaNome: string
    novoSaldoCaixa?: number
  } | null>(null)

  const valorNum = parseFloat(valorStr.replace(/\./g, '').replace(',', '.')) || 0

  function resetForm() {
    setValorStr('')
    setMotivo('')
    setComprovante(null)
  }

  async function handleConfirmarSangria(e: React.FormEvent) {
    e.preventDefault()
    if (valorNum <= 0) {
      toast({
        title: 'Atenção',
        description: 'Informe um valor maior que zero para a sangria.',
        variant: 'destructive',
      })
      return
    }
    if (!motivo.trim()) {
      toast({
        title: 'Atenção',
        description: 'Informe o motivo / destino da sangria.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const res = await realizarSangriaCaixa({
        caixa_sessao_id: sessao.id,
        valor: valorNum,
        motivo: motivo.trim(),
      })

      const dadosComp = {
        movimentoId: res.movimento_id,
        transferenciaId: res.transferencia_id,
        valor: res.valor,
        motivo: res.motivo,
        dataHora: res.data_hora,
        operadorNome: res.operador_nome || sessao.expand?.operador_id?.nome || 'Operador',
        terminalNome: res.terminal_nome || sessao.expand?.pdv_terminal_id?.nome || 'Terminal',
        empresaNome: empresaNome,
        novoSaldoCaixa: res.novo_saldo_caixa,
      }

      setComprovante(dadosComp)
      toast({
        title: 'Sangria realizada com sucesso!',
        description: `R$ ${valorNum.toFixed(2)} transferidos para o cofre com sucesso.`,
      })
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao realizar sangria.'
      toast({ title: 'Falha na sangria', description: msg, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  function handleImprimir() {
    if (!comprovante) return
    imprimirComprovanteSangria(comprovante)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-rose-600" />
            Sangria de Caixa (Retirada)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Retirada de numerário da gaveta de caixa para transferência segura ao cofre da empresa.
          </DialogDescription>
        </DialogHeader>

        {comprovante ? (
          <div className="space-y-4 py-3 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-950 space-y-2">
              <span className="font-semibold text-emerald-800 text-sm block">
                Sangria Registrada com Sucesso!
              </span>
              <div className="flex justify-between items-center pt-1 border-t border-emerald-200">
                <span>Valor Retirado:</span>
                <span className="font-mono font-bold text-base text-emerald-900">
                  R$ {comprovante.valor.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Terminal:</span>
                <span className="font-medium">{comprovante.terminalNome}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Saldo restante na gaveta:</span>
                <span className="font-mono font-bold">
                  R$ {(comprovante.novoSaldoCaixa || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImprimir}
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir Comprovante
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  resetForm()
                  onOpenChange(false)
                }}
                className="bg-slate-800 hover:bg-slate-900 text-white"
              >
                Concluir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleConfirmarSangria} className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 border rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Terminal:</span>
                <span className="font-semibold text-slate-800">
                  {sessao.expand?.pdv_terminal_id?.nome || 'Terminal'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Operador:</span>
                <span className="font-semibold text-slate-800">
                  {sessao.expand?.operador_id?.nome || 'Operador'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="valor_sangria" className="text-xs font-semibold text-slate-700">
                Valor da Sangria (R$) *
              </Label>
              <Input
                id="valor_sangria"
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                onBlur={() => {
                  if (valorNum > 0) {
                    setValorStr(
                      valorNum.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                    )
                  }
                }}
                placeholder="0,00"
                className="text-base font-mono font-bold text-rose-600 h-10"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo_sangria" className="text-xs font-semibold text-slate-700">
                Motivo / Destino da Sangria *
              </Label>
              <Input
                id="motivo_sangria"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Recolhimento de excesso para cofre / pagamento transporte..."
                className="text-xs h-9"
                required
              />
            </div>

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
                disabled={salvando}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {salvando ? 'Processando...' : 'Confirmar Sangria'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
