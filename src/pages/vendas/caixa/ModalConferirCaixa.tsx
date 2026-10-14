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
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { conferirSessaoCaixa, type CaixaSessao } from '@/services/caixa'
import { useToast } from '@/hooks/use-toast'

interface ModalConferirCaixaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessao: CaixaSessao
  onSucesso: () => void
}

export function ModalConferirCaixa({
  open,
  onOpenChange,
  sessao,
  onSucesso,
}: ModalConferirCaixaProps) {
  const { toast } = useToast()
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleConfirmarConferencia(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await conferirSessaoCaixa({
        caixa_sessao_id: sessao.id,
        observacao_conferencia: observacao.trim() || undefined,
      })

      toast({
        title: 'Sessão conferida!',
        description: `A sessão #${sessao.id.slice(-6)} foi homologada e marcada como Conferida pelo supervisor.`,
      })
      setObservacao('')
      onOpenChange(false)
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conferir sessão de caixa.'
      toast({ title: 'Falha na conferência', description: msg, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const difDinheiro = Number(sessao.diferenca_dinheiro || 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            Conferência de Caixa (Supervisor)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Homologação da auditoria dos valores e fechamento da sessão #{sessao.id.slice(-6)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirmarConferencia} className="space-y-4 py-2 text-xs">
          <div className="p-3 bg-slate-50 border rounded-lg space-y-1.5">
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
            <div className="flex justify-between">
              <span className="text-slate-500">Vendas Finalizadas:</span>
              <span className="font-mono font-medium">
                {sessao.quantidade_vendas || 0} (R$ {(sessao.valor_vendas || 0).toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="text-slate-500">Diferença em Dinheiro:</span>
              <span
                className={`font-mono font-bold ${
                  Math.abs(difDinheiro) < 0.01
                    ? 'text-emerald-700'
                    : difDinheiro < 0
                      ? 'text-rose-700'
                      : 'text-blue-700'
                }`}
              >
                R$ {Math.abs(difDinheiro).toFixed(2)}{' '}
                {difDinheiro < 0 ? '(- falta)' : difDinheiro > 0 ? '(+ sobra)' : '(exato)'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs_conferencia" className="text-xs font-semibold text-slate-700">
              Observação da Conferência (Opcional)
            </Label>
            <Input
              id="obs_conferencia"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Todos os comprovantes de cartão conferidos fisicamente..."
              className="text-xs h-9"
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {salvando ? 'Gravando...' : 'Marcar como Conferido'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
