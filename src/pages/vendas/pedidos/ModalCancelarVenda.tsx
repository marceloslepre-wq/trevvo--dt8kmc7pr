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
import { cancelarNFCeVenda } from '@/services/fiscalIntegracao'
import { Checkbox } from '@/components/ui/checkbox'

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
  const [cancelarNfceJunto, setCancelarNfceJunto] = useState(true)

  const temNfceAutorizada = venda.documento_fiscal_status === 'Autorizada'

  const handleCancelar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    const motivoLimpo = motivo.trim()
    const minChar = temNfceAutorizada ? 15 : 5
    if (!motivoLimpo || motivoLimpo.length < minChar) {
      setErro(
        temNfceAutorizada
          ? 'Para cancelamento fiscal na SEFAZ, a justificativa deve ter entre 15 e 255 caracteres.'
          : 'Informe a justificativa do cancelamento (mínimo de 5 caracteres).',
      )
      return
    }

    if (temNfceAutorizada && motivoLimpo.length > 255) {
      setErro('A justificativa da SEFAZ pode ter no máximo 255 caracteres.')
      return
    }

    setSalvando(true)
    try {
      if (temNfceAutorizada) {
        // Cancele a NFC-e primeiro (ou NFC-e e a venda juntos)
        const respCancNfce = await cancelarNFCeVenda({
          vendaId: venda.id,
          justificativa: motivoLimpo,
          cancelarVenda: cancelarNfceJunto,
        })

        if (!respCancNfce.sucesso) {
          throw new Error(respCancNfce.message || 'Falha ao cancelar a NFC-e na SEFAZ.')
        }

        toast({
          title: 'NFC-e cancelada!',
          description: cancelarNfceJunto
            ? 'Nota fiscal e venda canceladas com sucesso.'
            : 'Nota fiscal cancelada na SEFAZ com sucesso.',
        })

        onSucesso({
          sucesso: true,
          venda_id: venda.id,
          numero: venda.numero,
          status: 'Cancelada',
          motivo_cancelamento: motivoLimpo,
          titulos_cancelados: 0,
          movimentos_estornados: 0,
          message: 'Venda e NFC-e canceladas com sucesso.',
        })
        onOpenChange(false)
        setMotivo('')
      } else {
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
      }
    } catch (err: unknown) {
      const msg =
        (err as any)?.data?.message ||
        (err instanceof Error ? err.message : 'Falha ao cancelar venda.')
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

          {temNfceAutorizada ? (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-900 space-y-2">
              <p className="font-semibold text-blue-950">Venda com NFC-e Autorizada na SEFAZ:</p>
              <p>
                A nota fiscal será cancelada na SEFAZ utilizando o certificado e token da loja.
                Respeite o prazo limite estipulado pelo seu estado.
              </p>
              <div className="flex items-center space-x-2 pt-1 border-t border-blue-200">
                <Checkbox
                  id="cancelar_venda_junto"
                  checked={cancelarNfceJunto}
                  onCheckedChange={(c) => setCancelarNfceJunto(Boolean(c))}
                />
                <label
                  htmlFor="cancelar_venda_junto"
                  className="text-xs font-medium cursor-pointer text-blue-950 leading-none"
                >
                  Cancelar NFC-e e a venda (estornar estoque e financeiro)
                </label>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Atenção:</p>
              <p>
                O cancelamento de uma venda finalizada é irreversível. O status será marcado como{' '}
                <strong>Cancelada</strong> e uma auditoria será registrada no sistema.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="motivo_cancelamento" className="text-xs font-semibold text-slate-700">
              {temNfceAutorizada
                ? 'Justificativa do Cancelamento Fiscal na SEFAZ'
                : 'Motivo do Cancelamento'}{' '}
              <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="motivo_cancelamento"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                temNfceAutorizada
                  ? 'Informe a justificativa exigida pela SEFAZ (mínimo de 15 caracteres)...'
                  : 'Descreva detalhadamente a razão do cancelamento desta venda...'
              }
              className="text-xs"
              required
              autoFocus
            />
            <p className="text-[10px] text-slate-400">
              {temNfceAutorizada
                ? 'Mínimo de 15 caracteres e máximo de 255 (exigência da SEFAZ).'
                : 'Mínimo de 5 caracteres.'}
            </p>
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
              disabled={salvando || motivo.trim().length < (temNfceAutorizada ? 15 : 5)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {salvando ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Processando na SEFAZ...</span>
                </>
              ) : (
                <>
                  <Ban size={14} />
                  <span>
                    {temNfceAutorizada
                      ? cancelarNfceJunto
                        ? 'Cancelar NFC-e e a Venda'
                        : 'Cancelar NFC-e'
                      : 'Confirmar Cancelamento'}
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
