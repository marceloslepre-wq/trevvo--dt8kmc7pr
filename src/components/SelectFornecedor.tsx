import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, Truck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Fornecedor, TipoFornecedor, listarTodosFornecedoresAtivos } from '@/services/fornecedores'
import { formatarCNPJ, formatarCPF } from '@/lib/validacoes'
import { useAssinanteId } from '@/hooks/useAssinanteId'

export interface SelectFornecedorProps {
  value?: string
  onChange?: (fornecedorId: string, item?: Fornecedor) => void
  filtroTipo?: TipoFornecedor
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectFornecedor: React.FC<SelectFornecedorProps> = ({
  value,
  onChange,
  filtroTipo,
  disabled = false,
  placeholder = 'Selecione um fornecedor...',
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(false)
  const assinanteId = useAssinanteId()

  const carregarFornecedores = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await listarTodosFornecedoresAtivos(filtroTipo, assinanteId || undefined)
      setFornecedores(lista)
    } catch (err) {
      console.error('Erro ao carregar fornecedores:', err)
    } finally {
      setCarregando(false)
    }
  }, [filtroTipo, assinanteId])

  useEffect(() => {
    carregarFornecedores()
  }, [carregarFornecedores])

  const selecionado = useMemo(() => {
    if (!value) return null
    return fornecedores.find((f) => f.id === value) || null
  }, [fornecedores, value])

  const fornecedoresFiltrados = useMemo(() => {
    if (!busca.trim()) return fornecedores
    const termo = busca.toLowerCase().trim()
    const termoLimpo = termo.replace(/[^a-zA-Z0-9]/g, '')
    const numero = parseInt(termo, 10)

    return fornecedores.filter((f) => {
      if (f.razao_social.toLowerCase().includes(termo)) return true
      if (f.nome_fantasia && f.nome_fantasia.toLowerCase().includes(termo)) return true
      if (f.municipio && f.municipio.toLowerCase().includes(termo)) return true
      if (!Number.isNaN(numero) && f.codigo === numero) return true
      if (termoLimpo && f.cpf_cnpj && f.cpf_cnpj.toLowerCase().includes(termoLimpo)) return true
      return false
    })
  }, [fornecedores, busca])

  const handleSelect = (fornecedorId: string) => {
    const item = fornecedores.find((f) => f.id === fornecedorId)
    if (onChange) {
      onChange(fornecedorId, item)
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

  const formatarDoc = (f: Fornecedor) => {
    if (f.tipo_pessoa === 'Estrangeiro') return f.id_estrangeiro || ''
    if (!f.cpf_cnpj) return ''
    return f.tipo_pessoa === 'Física' ? formatarCPF(f.cpf_cnpj) : formatarCNPJ(f.cpf_cnpj)
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
          <span className="truncate mr-2 flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {carregando ? (
              <span className="flex items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando fornecedores...
              </span>
            ) : selecionado ? (
              <span className="text-slate-900 font-medium">
                <span className="font-mono text-slate-500 mr-1.5">#{selecionado.codigo}</span>
                {selecionado.razao_social}
                {selecionado.municipio && (
                  <span className="text-slate-400 text-xs ml-1.5 font-normal">
                    ({selecionado.municipio}/{selecionado.uf || ''})
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

      <PopoverContent className="w-[320px] sm:w-[420px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, razão social, CNPJ ou cidade..."
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

        {filtroTipo && (
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Filtro aplicado:</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {filtroTipo}
            </Badge>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto p-1 text-xs">
          {fornecedoresFiltrados.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              <p>Nenhum fornecedor encontrado</p>
              {busca && <p className="text-[11px] text-slate-400 mt-1">Tente outros termos.</p>}
            </div>
          ) : (
            fornecedoresFiltrados.map((item) => {
              const isSelected = value === item.id
              const doc = formatarDoc(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2.5 transition-colors',
                    isSelected
                      ? 'bg-blue-50 text-blue-900 font-medium'
                      : 'hover:bg-slate-100 text-slate-700',
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-500 text-[11px]">#{item.codigo}</span>
                      <span className="font-medium text-slate-900 truncate">
                        {item.razao_social}
                      </span>
                    </div>
                    {item.nome_fantasia && (
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.nome_fantasia}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {doc && <span className="font-mono">{doc}</span>}
                      {item.municipio && (
                        <span>
                          {item.municipio}/{item.uf}
                        </span>
                      )}
                      {item.tipo_fornecedor && item.tipo_fornecedor.length > 0 && (
                        <span className="text-slate-500 font-medium">
                          • {item.tipo_fornecedor.join(', ')}
                        </span>
                      )}
                    </div>
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

export default SelectFornecedor
