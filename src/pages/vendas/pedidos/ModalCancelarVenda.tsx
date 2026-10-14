import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AlertCircle, Ban, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cancelarVenda, CancelarVendaResponse, Venda } from '@/services/vendas'

export interface ModalCancelarVendaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  venda: Venda
  onSucesso: (res: CancelarVendaResponse) => void
}

export const ModalCancelarVenda: React.FC<ModalCancelarVendaProps> = ({
  aberto,
  onOpenChange,
  venda,
  onSucesso,
}) => {
  const { toast } = useToast()
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleCancelar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    const motivoLimpo = motivo.trim()
    if (!motivoLimpo || motivoLimpo.length < 5) {
      setErro('Informe a justificativa do cancelamento (mínimo de 5 caracteres).')
      return
    }

    setSalvando(true)
    try {
      const res = await cancelarVenda({
        venda_id: venda.id,
        motivo: motivoLimpo,
      })

      toast({
        title: 'Venda cancelada',
        description: `Venda #${res.numero} cancelada com sucesso. Títulos e movimentações estornados.`,
      })

      onSucesso(res)
      onOpenChange(false)
      setMotivo('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cancelar venda.'
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-700 rounded-lg">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Cancelar Venda #{venda.numero}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Esta ação estorna os pagamentos, cancela os títulos a receber e devolve os itens ao
                estoque.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCancelar} className="space-y-4 pt-2">
          {erro && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">Atenção:</p>
            <p>
              O cancelamento de uma venda finalizada é irreversível. O status será marcado como{' '}
              <strong>Cancelada</strong> e uma auditoria será registrada no sistema.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo_cancelamento" className="text-xs font-semibold text-slate-700">
              Motivo do Cancelamento <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="motivo_cancelamento"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva detalhadamente a razão do cancelamento desta venda..."
              className="text-xs"
              required
              autoFocus
            />
            <p className="text-[10px] text-slate-400">Mínimo de 5 caracteres.</p>
          </div>

          <DialogFooter className="pt-2">
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
              type="submit"
              size="sm"
              disabled={salvando || motivo.trim().length < 5}
              className="text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {salvando ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Cancelando...</span>
                </>
              ) : (
                <>
                  <Ban size={14} />
                  <span>Confirmar Cancelamento</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
