import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, ArrowLeftRight } from 'lucide-react'

interface Props {
  aberto: boolean
  onFechar: () => void
  onConfirmar: (data: string) => void
  gerando: boolean
  nomeEmpresaDestino: string
  nomeEmpresaOrigem: string
}

function hojeIso() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

/**
 * Modal "Reposição do dia": escolhe a data das vendas e gera uma
 * transferência em rascunho origem = empresa de reposição, destino = empresa ativa.
 */
export function ModalReposicaoDia({
  aberto,
  onFechar,
  onConfirmar,
  gerando,
  nomeEmpresaDestino,
  nomeEmpresaOrigem,
}: Props) {
  const [data, setData] = useState(hojeIso())

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4 text-blue-600" />
            Reposição do dia
          </DialogTitle>
          <DialogDescription>
            Gera uma transferência em rascunho com os produtos e quantidades vendidos pela{' '}
            <strong>{nomeEmpresaDestino || 'empresa'}</strong> na data escolhida. Origem:{' '}
            <strong>{nomeEmpresaOrigem || 'empresa de reposição'}</strong>. A NF-e de transferência
            é emitida normalmente ao enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="reposicao-data" className="text-xs font-medium text-slate-700">
            Data das vendas
          </Label>
          <Input
            id="reposicao-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            disabled={gerando}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={gerando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onConfirmar(data)}
            disabled={gerando || !data}
          >
            {gerando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              'Gerar reposição'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
