import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { enviarEmailNFe } from '@/services/fiscalIntegracao'
import { Mail, Plus, X, Send, CheckCircle2 } from 'lucide-react'

interface ModalEnviarEmailNFeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentoId?: string
  vendaId?: string
  emailDestinatarioPadrao?: string
  numeroNFe?: number | string
}

export function ModalEnviarEmailNFe({
  open,
  onOpenChange,
  documentoId,
  vendaId,
  emailDestinatarioPadrao,
  numeroNFe,
}: ModalEnviarEmailNFeProps) {
  const { toast } = useToast()
  const [emails, setEmails] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (open) {
      if (emailDestinatarioPadrao && emailDestinatarioPadrao.includes('@')) {
        setEmails([emailDestinatarioPadrao.trim().toLowerCase()])
      } else {
        setEmails([])
      }
      setNovoEmail('')
    }
  }, [open, emailDestinatarioPadrao])

  const adicionarEmail = () => {
    const limpo = novoEmail.trim().toLowerCase()
    if (!limpo || !limpo.includes('@') || !limpo.includes('.')) {
      toast({
        title: 'E-mail inválido',
        description: 'Digite um endereço de e-mail válido.',
        variant: 'destructive',
      })
      return
    }
    if (emails.includes(limpo)) {
      toast({
        title: 'E-mail duplicado',
        description: 'Este e-mail já está na lista de destinatários.',
      })
      return
    }
    if (emails.length >= 10) {
      toast({
        title: 'Limite atingido',
        description: 'É permitido informar no máximo 10 e-mails destinatários.',
        variant: 'destructive',
      })
      return
    }
    setEmails([...emails, limpo])
    setNovoEmail('')
  }

  const removerEmail = (emailRemover: string) => {
    setEmails(emails.filter((e) => e !== emailRemover))
  }

  const handleEnviar = async () => {
    if (emails.length === 0) {
      toast({
        title: 'Nenhum e-mail informado',
        description: 'Adicione ao menos um destinatário para o envio da NF-e.',
        variant: 'destructive',
      })
      return
    }

    try {
      setEnviando(true)
      const res = await enviarEmailNFe({
        documento_id: documentoId,
        venda_id: vendaId,
        emails,
      })

      if (res.sucesso) {
        toast({
          title: 'Envio agendado',
          description: `DANFE e XML da NF-e enviados com sucesso para ${emails.join(', ')}.`,
        })
        onOpenChange(false)
      } else {
        toast({
          title: 'Falha no envio',
          description: res.message || 'Não foi possível agendar o envio dos e-mails.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar e-mail',
        description: err?.data?.message || err?.message || 'Falha de comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar NF-e por E-mail
            {numeroNFe ? ` (Nº ${numeroNFe})` : ''}
          </DialogTitle>
          <DialogDescription>
            Envie o Documento Auxiliar da NF-e (DANFE em PDF) e o arquivo XML autorizado diretamente
            para o cliente e cópias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="input-email-nfe">Adicionar Destinatário / Cópia</Label>
            <div className="flex gap-2">
              <Input
                id="input-email-nfe"
                type="email"
                placeholder="cliente@email.com"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    adicionarEmail()
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={adicionarEmail} className="gap-1">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pressione Enter ou clique em Adicionar (máximo 10 e-mails).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Destinatários Confirmados ({emails.length}):
            </Label>
            {emails.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-center text-xs text-muted-foreground">
                Nenhum e-mail adicionado. Informe o e-mail do cliente acima.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[60px] bg-muted/20">
                {emails.map((em) => (
                  <Badge key={em} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1 text-xs">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>{em}</span>
                    <button
                      type="button"
                      onClick={() => removerEmail(em)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                      title="Remover"
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
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
            disabled={enviando || emails.length === 0}
            className="gap-2"
          >
            {enviando ? (
              'Agendando Envio...'
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar NF-e Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
