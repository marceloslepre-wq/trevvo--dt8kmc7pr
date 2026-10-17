import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { cancelarNFe } from '@/services/fiscalIntegracao'
import { AlertTriangle, XCircle, Info } from 'lucide-react'

interface ModalCancelarNFeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentoId?: string
  vendaId?: string
  numeroNFe?: number | string
  onSucesso?: () => void
}

export function ModalCancelarNFe({
  open,
  onOpenChange,
  documentoId,
  vendaId,
  numeroNFe,
  onSucesso,
}: ModalCancelarNFeProps) {
  const { toast } = useToast()
  const [justificativa, setJustificativa] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [avisoPrazo, setAvisoPrazo] = useState<string | null>(null)

  const tamanhoValido = justificativa.trim().length >= 15 && justificativa.trim().length <= 255

  const handleCancelar = async () => {
    if (!tamanhoValido) {
      toast({
        title: 'Justificativa inválida',
        description: 'A justificativa de cancelamento deve ter entre 15 e 255 caracteres.',
        variant: 'destructive',
      })
      return
    }

    try {
      setCancelando(true)
      setAvisoPrazo(null)

      const res = await cancelarNFe({
        documento_id: documentoId,
        venda_id: vendaId,
        justificativa: justificativa.trim(),
      })

      if (res.sucesso) {
        toast({
          title: 'NF-e Cancelada',
          description: 'O cancelamento foi homologado pela SEFAZ com sucesso.',
        })
        setJustificativa('')
        onOpenChange(false)
        if (onSucesso) onSucesso()
      } else {
        if (res.prazo_expirado) {
          setAvisoPrazo(res.message)
        }
        toast({
          title: 'Erro ao cancelar NF-e',
          description: res.message || 'Falha ao registrar cancelamento na SEFAZ.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Falha ao comunicar com o servidor.'
      if (msg.toLowerCase().includes('prazo')) {
        setAvisoPrazo(msg)
      }
      toast({
        title: 'Erro no cancelamento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Cancelar NF-e
            {numeroNFe ? ` nº ${numeroNFe}` : ''}
          </DialogTitle>
          <DialogDescription>
            O cancelamento da NF-e é definitivo e transmitido diretamente à SEFAZ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {avisoPrazo ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Prazo legal de 24h expirado</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-1">
                <p>{avisoPrazo}</p>
                <p className="font-semibold">
                  Orientação: para anular esta operação, emita uma Nota Fiscal de Entrada por
                  Devolução.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-xs font-semibold">Prazo legal de cancelamento</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                A SEFAZ normalmente permite o cancelamento em até <strong>24 horas</strong> após a
                autorização da NF-e, desde que a mercadoria não tenha circulado.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="just-canc">Justificativa do Cancelamento *</Label>
              <span
                className={`text-xs ${tamanhoValido ? 'text-muted-foreground' : 'text-amber-600 font-medium'}`}
              >
                {justificativa.trim().length} / 255 (mínimo 15)
              </span>
            </div>
            <Textarea
              id="just-canc"
              rows={4}
              placeholder="Ex.: Desistência da compra pelo cliente antes da saída da mercadoria do estabelecimento..."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              disabled={cancelando}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelando}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancelar}
            disabled={cancelando || !tamanhoValido}
            className="gap-2"
          >
            {cancelando ? 'Cancelando na SEFAZ...' : 'Confirmar Cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
