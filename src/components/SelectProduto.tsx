import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, Package, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Produto, TipoProduto, listarProdutos } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'
import { useAssinanteId } from '@/hooks/useAssinanteId'

export interface SelectProdutoProps {
  value?: string
  onChange?: (produtoId: string, item?: Produto) => void
  filtroTipo?: TipoProduto
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectProduto: React.FC<SelectProdutoProps> = ({
  value,
  onChange,
  filtroTipo,
  disabled = false,
  placeholder = 'Selecione ou busque um produto...',
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null)
  const assinanteId = useAssinanteId()

  const carregarProdutos = useCallback(
    async (termo: string) => {
      setCarregando(true)
      try {
        const res = await listarProdutos({
          busca: termo,
          tipo: filtroTipo || 'todos',
          situacao: 'ativos',
          itensPorPagina: 30,
          ordenacao: 'descricao',
          assinante_id: assinanteId || undefined,
        })
        setProdutos(res.items)
      } catch (err) {
        console.error('Erro ao carregar produtos no SelectProduto:', err)
      } finally {
        setCarregando(false)
      }
    },
    [filtroTipo, assinanteId],
  )

  // Carrega produtos iniciais ao abrir o combobox ou quando o termo de busca mudar
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        carregarProdutos(busca)
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [open, busca, carregarProdutos])

  // Busca dados do item selecionado se informado via `value`
  useEffect(() => {
    if (!value) {
      setProdutoSelecionado(null)
      return
    }
    const encontradoLocal = produtos.find((p) => p.id === value)
    if (encontradoLocal) {
      setProdutoSelecionado(encontradoLocal)
      return
    }
    // Se não estiver na lista local, busca no PocketBase
    pb.collection('produtos')
      .getOne<Produto>(value, { expand: 'unidade_id,marca_id' })
      .then((p) => setProdutoSelecionado(p))
      .catch(() => setProdutoSelecionado(null))
  }, [value, produtos])

  const handleSelect = (p: Produto) => {
    setProdutoSelecionado(p)
    if (onChange) {
      onChange(p.id, p)
    }
    setOpen(false)
    setBusca('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setProdutoSelecionado(null)
    if (onChange) {
      onChange('', undefined)
    }
    setBusca('')
  }

  const formatarPreco = (valor?: number) => {
    if (valor === undefined || valor === null) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  const getUrlFoto = (p: Produto) => {
    if (!p.foto) return null
    return pb.files.getURL(p, p.foto, { thumb: '100x100' })
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
          <span className="truncate mr-2 flex items-center gap-2">
            {produtoSelecionado ? (
              <span className="flex items-center gap-2 min-w-0">
                {getUrlFoto(produtoSelecionado) ? (
                  <img
                    src={getUrlFoto(produtoSelecionado)!}
                    alt={produtoSelecionado.descricao}
                    className="h-6 w-6 rounded object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <Package className="h-4 w-4 text-slate-400 shrink-0" />
                )}
                <span className="text-slate-900 font-medium truncate">
                  <span className="font-mono text-slate-500 mr-1.5">
                    #{produtoSelecionado.codigo}
                  </span>
                  {produtoSelecionado.descricao}
                </span>
                <span className="font-semibold text-emerald-700 text-xs shrink-0 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {formatarPreco(produtoSelecionado.preco_venda)}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-slate-400">
                <Package className="h-4 w-4 shrink-0" />
                <span>{placeholder}</span>
              </span>
            )}
          </span>

          <div className="flex items-center gap-1 shrink-0 text-slate-400">
            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 rounded hover:text-slate-700 hover:bg-slate-100"
                title="Limpar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] sm:w-[460px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, descrição, GTIN ou referência..."
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
          <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Filtro de tipo:</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {filtroTipo}
            </Badge>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto p-1 text-xs divide-y divide-slate-50">
          {carregando ? (
            <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Buscando produtos...</span>
            </div>
          ) : produtos.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              <p>Nenhum produto encontrado</p>
              {busca && (
                <p className="text-[11px] text-slate-400 mt-1">Tente pesquisar por outro termo.</p>
              )}
            </div>
          ) : (
            produtos.map((item) => {
              const isSelected = value === item.id
              const fotoUrl = getUrlFoto(item)

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2.5 transition-colors',
                    isSelected
                      ? 'bg-blue-50 text-blue-900 font-medium'
                      : 'hover:bg-slate-100 text-slate-700',
                  )}
                >
                  <div className="shrink-0">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Foto miniatura */}
                  <div className="h-9 w-9 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {fotoUrl ? (
                      <img
                        src={fotoUrl}
                        alt={item.descricao}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-4 w-4 text-slate-300" />
                    )}
                  </div>

                  {/* Identificação */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-500 text-[11px] font-bold">
                        #{item.codigo}
                      </span>
                      <span className="font-medium text-slate-900 truncate">{item.descricao}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {item.gtin && <span className="font-mono">GTIN: {item.gtin}</span>}
                      {item.referencia && <span>Ref: {item.referencia}</span>}
                      {item.expand?.unidade_id && (
                        <span className="uppercase font-semibold text-slate-600">
                          {item.expand.unidade_id.sigla}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preço de venda */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-emerald-700 text-xs">
                      {formatarPreco(item.preco_venda)}
                    </div>
                    {item.tipo && item.tipo !== 'Produto' && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 text-slate-500">
                        {item.tipo}
                      </Badge>
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

export default SelectProduto
