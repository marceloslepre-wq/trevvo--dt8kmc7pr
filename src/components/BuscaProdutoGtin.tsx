import React, { useState, useEffect, useRef } from 'react'
import { Search, Barcode, Loader2, X, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Produto, listarProdutos } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'
import { useAssinanteId } from '@/hooks/useAssinanteId'

export interface BuscaProdutoGtinProps {
  onSelecionarProduto: (produto: Produto, quantidade?: number) => void
  filtroControlaEstoque?: boolean
  autoFoco?: boolean
  placeholder?: string
  className?: string
}

/**
 * Componente com suporte especial para bipagem de código de barras (GTIN/EAN)
 * Se o usuário escanear ou pressionar Enter com GTIN ou código numérico exato,
 * busca imediatamente e aciona onSelecionarProduto(produto, 1).
 */
export const BuscaProdutoGtin: React.FC<BuscaProdutoGtinProps> = ({
  onSelecionarProduto,
  filtroControlaEstoque = true,
  autoFoco = false,
  placeholder = 'Bipe o código de barras (GTIN) ou digite código / descrição...',
  className = '',
}) => {
  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [sugestoes, setSugestoes] = useState<Produto[]>([])
  const [menuAberto, setMenuAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const assinanteId = useAssinanteId()

  useEffect(() => {
    if (autoFoco && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFoco])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Busca sugestões em digitação com debounce
  useEffect(() => {
    const q = termo.trim()
    if (q.length < 2) {
      setSugestoes([])
      setMenuAberto(false)
      return
    }

    const timer = setTimeout(async () => {
      setCarregando(true)
      try {
        const res = await listarProdutos({
          busca: q,
          situacao: 'ativos',
          itensPorPagina: 15,
          ordenacao: 'descricao',
          assinante_id: assinanteId || undefined,
        })
        const filtrados = filtroControlaEstoque
          ? res.items.filter((p) => p.controla_estoque !== false && p.tipo !== 'Serviço')
          : res.items
        setSugestoes(filtrados)
        setMenuAberto(true)
      } catch (err) {
        console.error('Erro na busca de produtos:', err)
      } finally {
        setCarregando(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [termo, filtroControlaEstoque, assinanteId])

  // Ao bipar código de barras (Enter)
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const codigoLimpo = termo.trim()
      if (!codigoLimpo) return

      setCarregando(true)
      try {
        // Tenta achar por GTIN exato
        let encontrado: Produto | null = null
        try {
          const gtinFilter = assinanteId
            ? `gtin = '${codigoLimpo}' && ativo = true && assinante_id = '${assinanteId}'`
            : `gtin = '${codigoLimpo}' && ativo = true`
          const porGtin = await pb.collection('produtos').getList<Produto>(1, 1, {
            filter: gtinFilter,
            expand: 'unidade_id,marca_id',
          })
          if (porGtin.items.length > 0) {
            encontrado = porGtin.items[0]
          }
        } catch {
          /* intentionally ignored */
        }

        // Se não achou por GTIN, tenta por código numérico exato
        if (!encontrado && /^\d+$/.test(codigoLimpo)) {
          try {
            const codFilter = assinanteId
              ? `codigo = ${parseInt(codigoLimpo, 10)} && ativo = true && assinante_id = '${assinanteId}'`
              : `codigo = ${parseInt(codigoLimpo, 10)} && ativo = true`
            const porCod = await pb.collection('produtos').getList<Produto>(1, 1, {
              filter: codFilter,
              expand: 'unidade_id,marca_id',
            })
            if (porCod.items.length > 0) {
              encontrado = porCod.items[0]
            }
          } catch {
            /* intentionally ignored */
          }
        }

        // Se não achou, pega o primeiro da lista de sugestões se houver
        if (!encontrado && sugestoes.length > 0) {
          encontrado = sugestoes[0]
        }

        if (encontrado) {
          if (filtroControlaEstoque && encontrado.controla_estoque === false) {
            alert(
              `O produto "${encontrado.descricao}" não está configurado para controlar estoque.`,
            )
          } else {
            onSelecionarProduto(encontrado, 1)
            setTermo('')
            setSugestoes([])
            setMenuAberto(false)
          }
        }
      } finally {
        setCarregando(false)
      }
    } else if (e.key === 'Escape') {
      setMenuAberto(false)
    }
  }

  const handleSelecionarItem = (p: Produto) => {
    onSelecionarProduto(p, 1)
    setTermo('')
    setSugestoes([])
    setMenuAberto(false)
    if (inputRef.current) inputRef.current.focus()
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Barcode className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (sugestoes.length > 0) setMenuAberto(true)
          }}
          placeholder={placeholder}
          className="pl-9 pr-9 h-10 text-xs bg-white border-slate-300 focus:border-blue-500"
        />
        <div className="absolute right-2.5 flex items-center gap-1">
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          ) : termo ? (
            <button
              type="button"
              onClick={() => {
                setTermo('')
                setSugestoes([])
                setMenuAberto(false)
                if (inputRef.current) inputRef.current.focus()
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Search className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {menuAberto && sugestoes.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-xl text-xs divide-y divide-slate-100">
          <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500 font-medium flex items-center justify-between">
            <span>Selecione o produto ou pressione Enter para o primeiro:</span>
            <span>{sugestoes.length} encontrado(s)</span>
          </div>
          {sugestoes.map((prod) => (
            <button
              key={prod.id}
              type="button"
              onClick={() => handleSelecionarItem(prod)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50/80 transition-colors flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-500 text-[11px]">
                    #{prod.codigo}
                  </span>
                  <span className="font-semibold text-slate-900 truncate group-hover:text-blue-700">
                    {prod.descricao}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-slate-500 mt-0.5">
                  {prod.gtin && <span className="font-mono text-slate-600">GTIN: {prod.gtin}</span>}
                  {prod.referencia && <span>Ref: {prod.referencia}</span>}
                  {prod.localizacao && <span>Local: {prod.localizacao}</span>}
                  {prod.expand?.unidade_id && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1 font-semibold uppercase"
                    >
                      {prod.expand.unidade_id.sigla}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Custo Médio / Padrão</span>
                  <span className="font-semibold text-slate-700">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      prod.preco_custo || 0,
                    )}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export default BuscaProdutoGtin
