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
import { ArrowUpRight } from 'lucide-react'
import { realizarSuprimentoCaixa, type CaixaSessao } from '@/services/caixa'
import { useToast } from '@/hooks/use-toast'

interface ModalSuprimentoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessao: CaixaSessao
  onSucesso: () => void
}

export function ModalSuprimento({ open, onOpenChange, sessao, onSucesso }: ModalSuprimentoProps) {
  const { toast } = useToast()
  const [valorStr, setValorStr] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const valorNum = parseFloat(valorStr.replace(/\./g, '').replace(',', '.')) || 0

  function resetForm() {
    setValorStr('')
    setMotivo('')
  }

  async function handleConfirmarSuprimento(e: React.FormEvent) {
    e.preventDefault()
    if (valorNum <= 0) {
      toast({
        title: 'Atenção',
        description: 'Informe um valor maior que zero para o suprimento.',
        variant: 'destructive',
      })
      return
    }
    if (!motivo.trim()) {
      toast({
        title: 'Atenção',
        description: 'Informe o motivo do suprimento de caixa.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const res = await realizarSuprimentoCaixa({
        caixa_sessao_id: sessao.id,
        valor: valorNum,
        motivo: motivo.trim(),
      })

      toast({
        title: 'Suprimento realizado com sucesso!',
        description: `R$ ${valorNum.toFixed(2)} transferidos do cofre para o caixa (Novo saldo: R$ ${(res.novo_saldo_caixa || 0).toFixed(2)}).`,
      })
      resetForm()
      onOpenChange(false)
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao realizar suprimento.'
      toast({ title: 'Falha no suprimento', description: msg, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
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
            <ArrowUpRight className="h-5 w-5 text-emerald-600" />
            Suprimento de Caixa (Entrada)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Adição de numerário na gaveta do caixa transferido a partir do cofre da empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirmarSuprimento} className="space-y-4 py-2">
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
            <Label htmlFor="valor_suprimento" className="text-xs font-semibold text-slate-700">
              Valor do Suprimento (R$) *
            </Label>
            <Input
              id="valor_suprimento"
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
              className="text-base font-mono font-bold text-emerald-600 h-10"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo_suprimento" className="text-xs font-semibold text-slate-700">
              Motivo do Suprimento *
            </Label>
            <Input
              id="motivo_suprimento"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Reforço de troco / cédulas menores / abertura do turno da tarde..."
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {salvando ? 'Processando...' : 'Confirmar Suprimento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
