import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Ncm, listarNcm, formatarCodigoNcm, normalizarCodigoNcm } from '@/services/ncm'

export interface SelectNcmProps {
  value?: string
  onChange?: (codigo: string, item?: Ncm) => void
  disabled?: boolean
  placeholder?: string
  somenteAtivos?: boolean
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectNcm: React.FC<SelectNcmProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione ou busque a NCM...',
  somenteAtivos = true,
  className,
  id,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<Ncm[]>([])
  const [itemSelecionado, setItemSelecionado] = useState<Ncm | null>(null)
  const [carregando, setCarregando] = useState(false)
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega itens iniciais e o item selecionado pelo código
  useEffect(() => {
    let ativo = true
    async function carregarInicial() {
      setCarregando(true)
      try {
        const res = await listarNcm({
          page: 1,
          perPage: 30,
          situacao: somenteAtivos ? 'ativos' : 'todos',
          ordenacao: 'codigo',
        })
        if (ativo) {
          setItens(res.items)
        }

        if (value) {
          const norm = normalizarCodigoNcm(value)
          const encontrado = res.items.find((i) => i.codigo === norm)
          if (encontrado) {
            if (ativo) setItemSelecionado(encontrado)
          } else {
            const buscaEsp = await listarNcm({
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
        console.error('Erro ao carregar NCM:', err)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregarInicial()

    return () => {
      ativo = false
    }
  }, [value, somenteAtivos])

  // Busca debounced ao digitar
  useEffect(() => {
    if (!open) return

    if (timerBusca.current) {
      clearTimeout(timerBusca.current)
    }

    timerBusca.current = setTimeout(async () => {
      setCarregando(true)
      try {
        const res = await listarNcm({
          busca,
          page: 1,
          perPage: 30,
          situacao: somenteAtivos ? 'ativos' : 'todos',
          ordenacao: 'codigo',
        })
        setItens(res.items)
      } catch (err) {
        console.error('Erro ao buscar NCMs:', err)
      } finally {
        setCarregando(false)
      }
    }, 250)

    return () => {
      if (timerBusca.current) clearTimeout(timerBusca.current)
    }
  }, [busca, open, somenteAtivos])

  const selecionadoDisplay = useMemo(() => {
    if (itemSelecionado) return itemSelecionado
    if (!value) return null
    const norm = normalizarCodigoNcm(value)
    return itens.find((i) => i.codigo === norm) || null
  }, [itemSelecionado, itens, value])

  const handleSelect = (item: Ncm) => {
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
                  {formatarCodigoNcm(selecionadoDisplay.codigo)}
                </span>
                <span className="text-slate-400 mx-1.5">-</span>
                <span>{selecionadoDisplay.descricao}</span>
              </span>
            ) : value ? (
              <span className="text-slate-900 font-mono">{formatarCodigoNcm(value)}</span>
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

      <PopoverContent className="w-[340px] sm:w-[460px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código NCM (com ou sem pontos) ou descrição..."
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

        <div className="max-h-64 overflow-y-auto p-1 text-xs">
          {carregando ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Buscando NCMs...
            </div>
          ) : itens.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              {busca ? 'Nenhuma NCM encontrada para a busca' : 'Nenhuma NCM cadastrada'}
            </div>
          ) : (
            itens.map((item) => {
              const isSelected = normalizarCodigoNcm(value || '') === item.codigo
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
                        {formatarCodigoNcm(item.codigo)}
                      </span>
                      <span className="font-medium text-slate-800 break-words">
                        {item.descricao}
                      </span>
                    </div>
                    {item.aliquota_ipi !== null && item.aliquota_ipi !== undefined && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        IPI: {item.aliquota_ipi}% {item.ex_tipi ? `| EX: ${item.ex_tipi}` : ''}
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

export default SelectNcm
