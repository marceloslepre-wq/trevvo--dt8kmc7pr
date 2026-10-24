import React, { useState, useMemo } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ItemOpcaoFiltro {
  id: string
  label: string
  sublabel?: string
  grupo?: string
}

export interface MultiSelectFiltroProps {
  label: string
  placeholder?: string
  opcoes: ItemOpcaoFiltro[]
  valoresSelecionados: string[]
  onChange: (valores: string[]) => void
  disabled?: boolean
  className?: string
  icone?: React.ComponentType<{ className?: string; size?: number }>
  buscaPlaceholder?: string
}

export const MultiSelectFiltro: React.FC<MultiSelectFiltroProps> = ({
  label,
  placeholder = 'Todos',
  opcoes,
  valoresSelecionados,
  onChange,
  disabled = false,
  className,
  icone: Icone,
  buscaPlaceholder = 'Pesquisar...',
}) => {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const opcoesFiltradas = useMemo(() => {
    if (!busca.trim()) return opcoes
    const b = busca.toLowerCase().trim()
    return opcoes.filter(
      (op) =>
        op.label.toLowerCase().includes(b) ||
        (op.sublabel && op.sublabel.toLowerCase().includes(b)) ||
        (op.grupo && op.grupo.toLowerCase().includes(b)),
    )
  }, [opcoes, busca])

  const handleToggle = (id: string) => {
    if (valoresSelecionados.includes(id)) {
      onChange(valoresSelecionados.filter((v) => v !== id))
    } else {
      onChange([...valoresSelecionados, id])
    }
  }

  const handleMarcarTodos = () => {
    if (busca.trim()) {
      const novos = Array.from(
        new Set([...valoresSelecionados, ...opcoesFiltradas.map((op) => op.id)]),
      )
      onChange(novos)
    } else {
      onChange(opcoes.map((op) => op.id))
    }
  }

  const handleDesmarcarTodos = () => {
    if (busca.trim()) {
      const filtradosIds = new Set(opcoesFiltradas.map((op) => op.id))
      onChange(valoresSelecionados.filter((id) => !filtradosIds.has(id)))
    } else {
      onChange([])
    }
  }

  const textoResumo = useMemo(() => {
    if (valoresSelecionados.length === 0) return placeholder
    if (valoresSelecionados.length === 1) {
      const achado = opcoes.find((op) => op.id === valoresSelecionados[0])
      return achado ? achado.label : '1 selecionado'
    }
    if (valoresSelecionados.length === opcoes.length && opcoes.length > 1) {
      return `Todos (${opcoes.length})`
    }
    return `${valoresSelecionados.length} selecionados`
  }, [valoresSelecionados, opcoes, placeholder])

  return (
    <div className={cn('space-y-1', className)}>
      <label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
        <span className="flex items-center gap-1">
          {Icone && <Icone className="h-3 w-3 text-slate-500" />}
          <span>{label}</span>
        </span>
        {valoresSelecionados.length > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] h-4 px-1 font-mono bg-blue-50 text-blue-700 border border-blue-200"
          >
            {valoresSelecionados.length}
          </Badge>
        )}
      </label>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={disabled}
            className={cn(
              'w-full justify-between h-8 text-xs font-normal bg-white border-slate-200 hover:bg-slate-50',
              valoresSelecionados.length > 0 && 'border-blue-400 font-medium text-slate-900',
            )}
          >
            <span className="truncate text-left flex-1">{textoResumo}</span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[280px] p-2 bg-white shadow-lg border border-slate-200 rounded-md"
          align="start"
        >
          {/* Campo de Busca Rápida */}
          <div className="flex items-center border border-slate-200 rounded-md px-2 py-1 mb-2 bg-slate-50/50">
            <Search className="h-3.5 w-3.5 text-slate-400 mr-1.5 shrink-0" />
            <Input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={buscaPlaceholder}
              className="h-6 text-xs p-0 border-0 bg-transparent focus-visible:ring-0 shadow-none"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Botões Marcar todos e Desmarcar todos */}
          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-100 text-[11px]">
            <button
              type="button"
              onClick={handleMarcarTodos}
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Marcar todos
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleDesmarcarTodos}
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              Desmarcar todos
            </button>
          </div>

          {/* Lista de Opções */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs">
            {opcoesFiltradas.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">Nenhum item encontrado</div>
            ) : (
              opcoesFiltradas.map((op) => {
                const selecionado = valoresSelecionados.includes(op.id)
                return (
                  <div
                    key={op.id}
                    onClick={() => handleToggle(op.id)}
                    className={cn(
                      'flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors',
                      selecionado
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : 'hover:bg-slate-100 text-slate-700',
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate">{op.label}</div>
                      {op.sublabel && (
                        <div className="text-[10px] text-slate-400 truncate font-mono">
                          {op.sublabel}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        selecionado
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {selecionado && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
