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
import { Search, Loader2 } from 'lucide-react'
import type { Produto } from '@/services/produtos'

interface ModalBuscaProdutoPDVProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  produtos: Produto[]
  onSelecionar: (produto: Produto, quantidade: number) => void
}

export const ModalBuscaProdutoPDV: React.FC<ModalBuscaProdutoPDVProps> = ({
  aberto,
  onOpenChange,
  produtos,
  onSelecionar,
}) => {
  const [busca, setBusca] = useState('')
  const [qtd, setQtd] = useState(1)
  const [indexSelecionado, setIndexSelecionado] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (aberto) {
      setBusca('')
      setQtd(1)
      setIndexSelecionado(0)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 80)
    }
  }, [aberto])

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return produtos.slice(0, 50)

    return produtos
      .filter((p) => {
        const desc = (p.descricao || '').toLowerCase()
        const gtin = (p.gtin || '').toLowerCase()
        const ref = (p.referencia || '').toLowerCase()
        const cod = String(p.codigo || '')
        return (
          desc.includes(termo) || gtin.includes(termo) || ref.includes(termo) || cod.includes(termo)
        )
      })
      .slice(0, 60)
  }, [busca, produtos])

  useEffect(() => {
    setIndexSelecionado(0)
  }, [busca])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndexSelecionado((prev) => (prev < filtrados.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndexSelecionado((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selecionado = filtrados[indexSelecionado]
      if (selecionado) {
        onSelecionar(selecionado, qtd > 0 ? qtd : 1)
        onOpenChange(false)
      }
    }
  }

  // Rola o item ativo para visibilidade
  useEffect(() => {
    if (listaRef.current) {
      const items = listaRef.current.querySelectorAll('.produto-item')
      const target = items[indexSelecionado] as HTMLElement | undefined
      if (target) {
        target.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [indexSelecionado])

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-900 text-white border-slate-700 p-6">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <DialogTitle className="text-lg font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-400" />
              Localizar Produto (F2)
            </span>
            <span className="text-xs font-normal text-slate-400">
              Navegue com ↑ ↓ e pressione Enter
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                ref={inputRef}
                placeholder="Digite a descrição, código interno, GTIN ou referência..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-10 pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
              />
            </div>
            <div className="w-28">
              <Input
                type="number"
                min="0.001"
                step="1"
                value={qtd}
                onChange={(e) => setQtd(parseFloat(e.target.value) || 1)}
                onKeyDown={handleKeyDown}
                placeholder="Qtd"
                className="h-10 text-center font-bold bg-slate-800 border-slate-700 text-white text-sm"
                title="Quantidade"
              />
            </div>
          </div>

          <div
            ref={listaRef}
            className="max-h-80 overflow-y-auto space-y-1 pr-1 border border-slate-800 rounded-lg p-1 bg-slate-950/60"
          >
            {filtrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhum produto localizado com o termo informado.
              </div>
            ) : (
              filtrados.map((p, idx) => {
                const ativo = idx === indexSelecionado
                const preco =
                  p.preco_promocional && p.preco_promocional > 0
                    ? p.preco_promocional
                    : p.preco_venda || 0
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setIndexSelecionado(idx)
                      onSelecionar(p, qtd > 0 ? qtd : 1)
                      onOpenChange(false)
                    }}
                    className={`produto-item flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors text-xs ${
                      ativo
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-14 font-mono text-[11px] shrink-0 ${ativo ? 'text-blue-100' : 'text-slate-400'}`}
                      >
                        #{p.codigo}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm">{p.descricao}</div>
                        <div
                          className={`text-[10px] ${ativo ? 'text-blue-200' : 'text-slate-400'}`}
                        >
                          {p.gtin ? `GTIN: ${p.gtin}` : ''}{' '}
                          {p.referencia ? `| Ref: ${p.referencia}` : ''} | UN:{' '}
                          {p.expand?.unidade_id?.sigla || 'UN'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <div
                        className={`font-mono text-sm font-bold ${ativo ? 'text-white' : 'text-emerald-400'}`}
                      >
                        R$ {preco.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800 pt-3 flex justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
          >
            Fechar (Esc)
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              const selecionado = filtrados[indexSelecionado]
              if (selecionado) {
                onSelecionar(selecionado, qtd > 0 ? qtd : 1)
                onOpenChange(false)
              }
            }}
            disabled={filtrados.length === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4"
          >
            Adicionar Item (Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
