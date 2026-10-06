import React, { useState, useEffect, useMemo } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { CodigoFiscal, listarCodigosPorTipo, TipoTabelaFiscal } from '@/services/tabelasFiscais'

export interface SelectCodigoFiscalProps {
  tipo: TipoTabelaFiscal
  value?: string
  onChange?: (codigo: string, item?: CodigoFiscal) => void
  disabled?: boolean
  placeholder?: string
  somenteAtivos?: boolean
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectCodigoFiscal: React.FC<SelectCodigoFiscalProps> = ({
  tipo,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione um código...',
  somenteAtivos = true,
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<CodigoFiscal[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true)
      try {
        const dados = await listarCodigosPorTipo(tipo, somenteAtivos)
        if (ativo) {
          setItens(dados)
        }
      } catch (err) {
        console.error('Erro ao carregar códigos fiscais:', err)
      } finally {
        if (ativo) {
          setCarregando(false)
        }
      }
    }

    if (tipo) {
      carregar()
    }

    return () => {
      ativo = false
    }
  }, [tipo, somenteAtivos])

  const selecionado = useMemo(() => {
    if (!value) return null
    return itens.find((i) => i.codigo === value) || null
  }, [itens, value])

  const itensFiltrados = useMemo(() => {
    if (!busca.trim()) return itens
    const termo = busca.toLowerCase().trim()
    return itens.filter(
      (item) =>
        item.codigo.toLowerCase().includes(termo) ||
        item.descricao.toLowerCase().includes(termo) ||
        (item.observacao && item.observacao.toLowerCase().includes(termo)),
    )
  }, [itens, busca])

  const handleSelect = (codigo: string) => {
    const itemEncontrado = itens.find((i) => i.codigo === codigo)
    if (onChange) {
      onChange(codigo, itemEncontrado)
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
                Carregando...
              </span>
            ) : selecionado ? (
              <span className="text-slate-900 font-medium">
                <span className="font-semibold text-blue-700">{selecionado.codigo}</span>
                <span className="text-slate-400 mx-1.5">-</span>
                <span>{selecionado.descricao}</span>
              </span>
            ) : value ? (
              <span className="text-slate-900">{value}</span>
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

      <PopoverContent className="w-[340px] sm:w-[420px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou descrição..."
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
              {busca ? 'Nenhum código fiscal encontrado' : 'Nenhum código cadastrado neste tipo'}
            </div>
          ) : (
            itensFiltrados.map((item) => {
              const isSelected = value === item.codigo
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.codigo)}
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
                        {item.codigo}
                      </span>
                      <span className="font-medium text-slate-800 break-words">
                        {item.descricao}
                      </span>
                    </div>
                    {item.observacao && (
                      <p className="text-[11px] text-slate-400 mt-0.5 break-words">
                        {item.observacao}
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

export default SelectCodigoFiscal
