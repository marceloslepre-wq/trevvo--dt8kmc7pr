import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import {
  Cfop,
  listarCfop,
  formatarCodigoCfop,
  normalizarCodigoCfop,
  TipoMovimentoCfop,
} from '@/services/cfop'

export interface SelectCfopProps {
  value?: string
  onChange?: (codigo: string, item?: Cfop) => void
  tipoMovimento?: TipoMovimentoCfop | 'todos'
  disabled?: boolean
  placeholder?: string
  somenteAtivos?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

export const SelectCfop: React.FC<SelectCfopProps> = ({
  value,
  onChange,
  tipoMovimento = 'todos',
  disabled = false,
  placeholder = 'Selecione ou busque o CFOP...',
  somenteAtivos = true,
  className,
  id,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<Cfop[]>([])
  const [itemSelecionado, setItemSelecionado] = useState<Cfop | null>(null)
  const [carregando, setCarregando] = useState(false)
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let ativo = true
    async function carregarInicial() {
      setCarregando(true)
      try {
        const res = await listarCfop({
          page: 1,
          perPage: 50,
          tipo_movimento: tipoMovimento,
          situacao: somenteAtivos ? 'ativos' : 'todos',
          ordenacao: 'codigo',
        })

        if (ativo) {
          setItens(res.items)
        }

        if (value) {
          const norm = normalizarCodigoCfop(value)
          const enc = res.items.find((i) => i.codigo === norm)
          if (enc) {
            if (ativo) setItemSelecionado(enc)
          } else {
            const buscaEsp = await listarCfop({
              busca: norm,
              page: 1,
              perPage: 1,
              situacao: 'todos',
            })
            if (ativo && buscaEsp.items.length > 0) {
              setItemSelecionado(buscaEsp.items[0])
            }
          }
        } else {
          if (ativo) setItemSelecionado(null)
        }
      } catch (err) {
        console.error('Erro ao carregar CFOPs:', err)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregarInicial()

    return () => {
      ativo = false
    }
  }, [value, tipoMovimento, somenteAtivos])

  // Busca debounced
  useEffect(() => {
    if (!open) return

    if (timerBusca.current) {
      clearTimeout(timerBusca.current)
    }

    timerBusca.current = setTimeout(async () => {
      setCarregando(true)
      try {
        const res = await listarCfop({
          busca,
          tipo_movimento: tipoMovimento,
          page: 1,
          perPage: 50,
          situacao: somenteAtivos ? 'ativos' : 'todos',
          ordenacao: 'codigo',
        })
        setItens(res.items)
      } catch (err) {
        console.error('Erro ao buscar CFOPs:', err)
      } finally {
        setCarregando(false)
      }
    }, 250)

    return () => {
      if (timerBusca.current) clearTimeout(timerBusca.current)
    }
  }, [busca, open, tipoMovimento, somenteAtivos])

  const selecionadoDisplay = useMemo(() => {
    if (itemSelecionado) return itemSelecionado
    if (!value) return null
    const norm = normalizarCodigoCfop(value)
    return itens.find((i) => i.codigo === norm) || null
  }, [itemSelecionado, itens, value])

  const handleSelect = (item: Cfop) => {
    setItemSelecionado(item)
    if (onChange) {
      onChange(item.codigo, item)
    }
    setOpen(false)
    setBusca('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemSelecionado(null)
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
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-left h-10 px-3 bg-white hover:bg-slate-50',
            !value && 'text-slate-400',
            className,
          )}
        >
          <span className="truncate mr-2">
            {selecionadoDisplay ? (
              <span className="text-slate-900 font-medium">
                <span className="font-semibold text-blue-700 font-mono">
                  {formatarCodigoCfop(selecionadoDisplay.codigo)}
                </span>
                <span className="text-slate-400 mx-1.5">-</span>
                <span>{selecionadoDisplay.descricao}</span>
              </span>
            ) : value ? (
              <span className="text-slate-900 font-mono">{formatarCodigoCfop(value)}</span>
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

      <PopoverContent className="w-[340px] sm:w-[480px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código CFOP ou descrição..."
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

        {tipoMovimento && tipoMovimento !== 'todos' && (
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-600 flex justify-between">
            <span>
              Filtrando operações de: <strong className="text-blue-700">{tipoMovimento}</strong>
            </span>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto p-1 text-xs">
          {carregando ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Buscando CFOPs...
            </div>
          ) : itens.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              {busca ? 'Nenhum CFOP encontrado' : 'Nenhum CFOP disponível'}
            </div>
          ) : (
            itens.map((item) => {
              const isSelected = normalizarCodigoCfop(value || '') === item.codigo
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
                      <span className="font-semibold text-blue-700 font-mono text-[11px] px-1 bg-blue-100/60 rounded">
                        {formatarCodigoCfop(item.codigo)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-600">
                        {item.tipo_movimento} • {item.abrangencia}
                      </span>
                      <span className="font-medium text-slate-800 break-words">
                        {item.descricao}
                      </span>
                    </div>
                    {item.aplicacao && (
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {item.aplicacao}
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

export default SelectCfop
