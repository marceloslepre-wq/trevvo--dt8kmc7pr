import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit3, Percent, DollarSign } from 'lucide-react'

// Modal Quantidade do Último Item (F4)
export const ModalQuantidadeItemPDV: React.FC<{
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  itemDescricao: string
  quantidadeAtual: number
  onConfirmar: (novaQtd: number) => void
}> = ({ aberto, onOpenChange, itemDescricao, quantidadeAtual, onConfirmar }) => {
  const [qtd, setQtd] = useState<string>(String(quantidadeAtual))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setQtd(String(quantidadeAtual))
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 80)
    }
  }, [aberto, quantidadeAtual])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(qtd.replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      onConfirmar(val)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200 p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-blue-600" />
            Alterar Quantidade (F4)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="text-xs text-slate-500 truncate">
            Item: <strong className="text-slate-800">{itemDescricao}</strong>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Nova Quantidade</Label>
            <Input
              ref={inputRef}
              type="number"
              step="0.001"
              min="0.001"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="h-11 text-xl font-bold bg-white border-slate-300 text-slate-900 text-center font-mono mt-1"
            />
          </div>

          <DialogFooter className="pt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar (Esc)
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4"
            >
              Confirmar (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Modal Desconto no Item (F6)
export const ModalDescontoItemPDV: React.FC<{
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  itemDescricao: string
  valorTotalItem: number
  precoUnitario: number
  quantidade: number
  onConfirmar: (descontoValor: number, descontoPercentual: number) => void
}> = ({
  aberto,
  onOpenChange,
  itemDescricao,
  valorTotalItem,
  precoUnitario,
  quantidade,
  onConfirmar,
}) => {
  const [tipo, setTipo] = useState<'valor' | 'pct'>('valor')
  const [valor, setValor] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const subtotal = precoUnitario * quantidade

  useEffect(() => {
    if (aberto) {
      setValor('')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
    }
  }, [aberto])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseFloat(valor.replace(',', '.')) || 0
    if (num < 0) return

    let descVal = 0
    let descPct = 0

    if (tipo === 'pct') {
      descPct = num
      descVal = Number(((subtotal * num) / 100).toFixed(2))
    } else {
      descVal = num
      descPct = subtotal > 0 ? Number(((num / subtotal) * 100).toFixed(2)) : 0
    }

    if (descVal > subtotal) {
      alert('O desconto não pode ser superior ao valor do item.')
      return
    }

    onConfirmar(descVal, descPct)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200 p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Percent className="h-5 w-5 text-amber-600" />
            Desconto no Item (F6)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="text-xs text-slate-500 truncate">
            Item: <strong className="text-slate-800">{itemDescricao}</strong>
          </div>
          <div className="text-xs text-slate-500">
            Subtotal: <strong className="text-slate-900">R$ {subtotal.toFixed(2)}</strong>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={tipo === 'valor' ? 'default' : 'outline'}
              onClick={() => setTipo('valor')}
              className={`flex-1 text-xs ${tipo === 'valor' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
            >
              Em Reais (R$)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tipo === 'pct' ? 'default' : 'outline'}
              onClick={() => setTipo('pct')}
              className={`flex-1 text-xs ${tipo === 'pct' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
            >
              Em Porcentagem (%)
            </Button>
          </div>

          <div>
            <Label className="text-xs text-slate-600">
              {tipo === 'valor' ? 'Valor do Desconto (R$)' : 'Percentual de Desconto (%)'}
            </Label>
            <Input
              ref={inputRef}
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="h-11 text-xl font-bold bg-white border-slate-300 text-amber-600 text-center font-mono mt-1"
            />
          </div>

          <DialogFooter className="pt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar (Esc)
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-4"
            >
              Aplicar (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Modal Desconto no Total da Venda (F7)
export const ModalDescontoTotalPDV: React.FC<{
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  subtotalVenda: number
  descontoAtual: number
  onConfirmar: (descontoValor: number) => void
}> = ({ aberto, onOpenChange, subtotalVenda, descontoAtual, onConfirmar }) => {
  const [tipo, setTipo] = useState<'valor' | 'pct'>('valor')
  const [valor, setValor] = useState<string>(descontoAtual > 0 ? String(descontoAtual) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setValor(descontoAtual > 0 ? String(descontoAtual) : '')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
    }
  }, [aberto, descontoAtual])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = parseFloat(valor.replace(',', '.')) || 0
    if (num < 0) return

    let descVal = 0
    if (tipo === 'pct') {
      descVal = Number(((subtotalVenda * num) / 100).toFixed(2))
    } else {
      descVal = num
    }

    if (descVal > subtotalVenda) {
      alert('O desconto não pode ser superior ao total da venda.')
      return
    }

    onConfirmar(descVal)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200 p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Desconto no Total da Venda (F7)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="text-xs text-slate-500">
            Subtotal Produtos:{' '}
            <strong className="text-slate-900">R$ {subtotalVenda.toFixed(2)}</strong>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={tipo === 'valor' ? 'default' : 'outline'}
              onClick={() => setTipo('valor')}
              className={`flex-1 text-xs ${tipo === 'valor' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              Em Reais (R$)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tipo === 'pct' ? 'default' : 'outline'}
              onClick={() => setTipo('pct')}
              className={`flex-1 text-xs ${tipo === 'pct' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              Em Porcentagem (%)
            </Button>
          </div>

          <div>
            <Label className="text-xs text-slate-600">
              {tipo === 'valor' ? 'Valor do Desconto Geral (R$)' : 'Percentual Geral (%)'}
            </Label>
            <Input
              ref={inputRef}
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="h-11 text-xl font-bold bg-white border-slate-300 text-emerald-600 text-center font-mono mt-1"
            />
          </div>

          <DialogFooter className="pt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar (Esc)
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4"
            >
              Aplicar (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Modal Cancelar Item (F8)
export const ModalCancelarItemPDV: React.FC<{
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  totalItens: number
  onConfirmar: (numeroItem: number, motivo: string) => void
}> = ({ aberto, onOpenChange, totalItens, onConfirmar }) => {
  const [numItem, setNumItem] = useState<string>('')
  const [motivo, setMotivo] = useState<string>('Desistência do cliente')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setNumItem(String(totalItens))
      setMotivo('Desistência do cliente')
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 80)
    }
  }, [aberto, totalItens])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(numItem, 10)
    if (isNaN(n) || n < 1 || n > totalItens) {
      alert(`Informe um número de item válido entre 1 e ${totalItens}.`)
      return
    }
    onConfirmar(n, motivo)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200 p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
            Cancelar Item da Venda (F8)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label className="text-xs text-slate-600">Número do Item (1 a {totalItens})</Label>
            <Input
              ref={inputRef}
              type="number"
              min="1"
              max={totalItens}
              value={numItem}
              onChange={(e) => setNumItem(e.target.value)}
              className="h-11 text-xl font-bold bg-white border-slate-300 text-red-600 text-center font-mono mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-600">Motivo do Cancelamento</Label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full h-9 bg-white border border-slate-300 text-slate-900 rounded text-xs px-2 mt-1"
            >
              <option value="Desistência do cliente">Desistência do cliente</option>
              <option value="Item lançado por engano">Item lançado por engano</option>
              <option value="Produto danificado / avaria">Produto danificado / avaria</option>
              <option value="Código lido incorreto">Código lido incorreto</option>
              <option value="Outro motivo">Outro motivo</option>
            </select>
          </div>

          <DialogFooter className="pt-2 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Voltar (Esc)
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-4"
            >
              Cancelar Item (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
