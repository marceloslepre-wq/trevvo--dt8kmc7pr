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
import { emitirCartaCorrecaoNFe } from '@/services/fiscalIntegracao'
import { AlertTriangle, FileText, CheckCircle2, ShieldAlert } from 'lucide-react'

interface ModalCartaCorrecaoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentoId?: string
  vendaId?: string
  numeroNFe?: number | string
  onSucesso?: () => void
}

export function ModalCartaCorrecao({
  open,
  onOpenChange,
  documentoId,
  vendaId,
  numeroNFe,
  onSucesso,
}: ModalCartaCorrecaoProps) {
  const { toast } = useToast()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const tamanhoValido = texto.trim().length >= 15 && texto.trim().length <= 1000

  const handleEnviar = async () => {
    if (!tamanhoValido) {
      toast({
        title: 'Texto inválido',
        description: 'A Carta de Correção deve ter entre 15 e 1000 caracteres.',
        variant: 'destructive',
      })
      return
    }

    try {
      setEnviando(true)
      const res = await emitirCartaCorrecaoNFe({
        documento_id: documentoId,
        venda_id: vendaId,
        texto: texto.trim(),
      })

      if (res.sucesso) {
        toast({
          title: 'Carta de Correção autorizada',
          description: `CC-e vinculada à NF-e com sucesso (Seq: ${res.sequencia || 1}).`,
        })
        setTexto('')
        onOpenChange(false)
        if (onSucesso) onSucesso()
      } else {
        toast({
          title: 'Erro na emissão da CC-e',
          description: res.message || 'Falha ao registrar Carta de Correção.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao emitir Carta de Correção',
        description: err?.data?.message || err?.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Carta de Correção Eletrônica (CC-e)
            {numeroNFe ? ` - NF-e nº ${numeroNFe}` : ''}
          </DialogTitle>
          <DialogDescription>
            Envio de retificação de dados da NF-e para a SEFAZ. O texto fica registrado como evento
            oficial do documento fiscal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="font-semibold">
              Aviso legal da SEFAZ (Art. 58-B do Convênio SINIEF s/n)
            </AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-1">
              <p>
                A Carta de Correção <strong>NÃO</strong> pode ser utilizada para corrigir:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Valores da operação, cálculo ou alíquotas de impostos;</li>
                <li>Dados cadastrais que impliquem mudança do remetente ou do destinatário;</li>
                <li>Data de emissão ou data de saída da mercadoria.</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="texto-cce">Texto da Correção *</Label>
              <span
                className={`text-xs ${texto.trim().length >= 15 && texto.trim().length <= 1000 ? 'text-muted-foreground' : 'text-amber-600 font-medium'}`}
              >
                {texto.trim().length} / 1000 caracteres (mínimo 15)
              </span>
            </div>
            <Textarea
              id="texto-cce"
              rows={5}
              placeholder="Descreva claramente a correção. Ex.: Correção do CFOP do item 1 de 5102 para 5405 em virtude de enquadramento em substituição tributária..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={enviando}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleEnviar}
            disabled={enviando || !tamanhoValido}
            className="gap-2"
          >
            {enviando ? (
              'Transmitindo CC-e...'
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Transmitir Carta de Correção
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
