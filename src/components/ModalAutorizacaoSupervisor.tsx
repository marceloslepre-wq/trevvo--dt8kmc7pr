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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, AlertCircle, Lock } from 'lucide-react'
import { autorizarDescontoSupervisor, ResultadoAutorizacaoSupervisor } from '@/services/descontos'
import { useToast } from '@/hooks/use-toast'

export interface ModalAutorizacaoSupervisorProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  descontoPercentual: number
  produtoNome?: string
  produtoId?: string
  empresaId?: string
  origem?: string
  vendaContexto?: Record<string, unknown>
  onAutorizado: (resultado: ResultadoAutorizacaoSupervisor) => void
}

export const ModalAutorizacaoSupervisor: React.FC<ModalAutorizacaoSupervisorProps> = ({
  aberto,
  onOpenChange,
  descontoPercentual,
  produtoNome,
  produtoId,
  empresaId,
  origem = 'venda',
  vendaContexto,
  onAutorizado,
}) => {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [validando, setValidando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (!email.trim() || !senha) {
      setErro('Preencha o e-mail e a senha do supervisor.')
      return
    }

    try {
      setValidando(true)
      const res = await autorizarDescontoSupervisor({
        email: email.trim(),
        senha,
        descontoPercentual,
        produtoId,
        produtoNome,
        empresaId,
        origem,
        vendaContexto,
      })

      toast({
        title: 'Desconto autorizado',
        description: res.mensagem,
      })

      onAutorizado(res)
      onOpenChange(false)
      setEmail('')
      setSenha('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na autorização do supervisor.'
      setErro(msg)
    } finally {
      setValidando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Autorização de Supervisor
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Liberação de desconto acima do limite operacional
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Alerta de Desconto */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <span>Desconto solicitado:</span>
              <span className="font-mono text-sm font-bold text-amber-700">
                {descontoPercentual.toFixed(2)}%
              </span>
            </p>
            {produtoNome && (
              <p className="text-amber-800">
                Item: <strong className="font-medium">{produtoNome}</strong>
              </p>
            )}
            <p className="text-[11px] text-amber-700 mt-1">
              Um supervisor ou administrador com limite compatível deve digitar suas credenciais
              para autorizar.
            </p>
          </div>

          {erro && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="supervisor_email" className="text-xs font-medium text-slate-700">
                E-mail do Supervisor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="supervisor_email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supervisor@empresa.com.br"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="supervisor_senha" className="text-xs font-medium text-slate-700">
                Senha do Supervisor <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="supervisor_senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="text-xs h-9 pr-9"
                  required
                />
                <Lock
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={validando}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={validando}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <ShieldCheck size={14} />
              <span>{validando ? 'Validando...' : 'Autorizar Desconto'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
