import React, { useState, useEffect, useMemo } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import {
  PerfilTributario,
  listarTodosPerfisAtivos,
  RegimePerfilTributario,
} from '@/services/perfisTributarios'

export interface SelectPerfilTributarioProps {
  value?: string
  onChange?: (id: string, perfil?: PerfilTributario) => void
  regimeFiltro?: RegimePerfilTributario
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
}

export const SelectPerfilTributario: React.FC<SelectPerfilTributarioProps> = ({
  value,
  onChange,
  regimeFiltro,
  disabled = false,
  placeholder = 'Selecione o perfil tributário padrão...',
  className,
  id,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<PerfilTributario[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true)
      try {
        const perfis = await listarTodosPerfisAtivos()
        if (ativo) {
          if (regimeFiltro) {
            setItens(perfis.filter((p) => p.regime === regimeFiltro))
          } else {
            setItens(perfis)
          }
        }
      } catch (err) {
        console.error('Erro ao carregar perfis tributários:', err)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [regimeFiltro])

  const selecionado = useMemo(() => {
    if (!value) return null
    return itens.find((p) => p.id === value) || null
  }, [itens, value])

  const itensFiltrados = useMemo(() => {
    if (!busca.trim()) return itens
    const termo = busca.toLowerCase().trim()
    return itens.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.descricao && p.descricao.toLowerCase().includes(termo)) ||
        p.regime.toLowerCase().includes(termo),
    )
  }, [itens, busca])

  const handleSelect = (perfil: PerfilTributario) => {
    if (onChange) {
      onChange(perfil.id, perfil)
    }
    setOpen(false)
    setBusca('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onChange) {
      onChange('', undefined)
    }
    setBusca('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel || placeholder}
          disabled={disabled || carregando}
          className={cn(
            'w-full justify-between font-normal text-left h-10 px-3 bg-white hover:bg-slate-50',
            !value && 'text-slate-400',
            className,
          )}
        >
          <span className="truncate mr-2">
            {carregando ? (
              <span className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando perfis...
              </span>
            ) : selecionado ? (
              <span className="text-slate-900 font-medium">
                <span className="font-semibold text-blue-700">{selecionado.nome}</span>
                <span className="text-slate-400 mx-1.5">({selecionado.regime})</span>
                {selecionado.descricao && (
                  <span className="text-slate-500 font-normal truncate">
                    - {selecionado.descricao}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>

          <div className="flex items-center gap-1 shrink-0 text-slate-400">
            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 rounded-xs hover:text-slate-700 hover:bg-slate-100"
                title="Limpar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[340px] sm:w-[440px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou regime..."
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-1 text-xs"
            autoFocus
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-60 overflow-y-auto p-1 text-xs">
          {itensFiltrados.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              {busca ? 'Nenhum perfil encontrado' : 'Nenhum perfil cadastrado'}
            </div>
          ) : (
            itensFiltrados.map((item) => {
              const isSelected = value === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2.5 transition-colors',
                    isSelected
                      ? 'bg-blue-50 text-blue-900 font-medium'
                      : 'hover:bg-slate-100 text-slate-700',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-900">{item.nome}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {item.regime}
                      </span>
                    </div>
                    {item.descricao && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {item.descricao}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default SelectPerfilTributario
