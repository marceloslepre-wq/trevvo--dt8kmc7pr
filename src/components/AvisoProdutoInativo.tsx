import React, { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { Produto, ativarProduto, buscarProdutosInativos } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'

export interface AvisoProdutoInativoProps {
  /** Termo digitado (código, GTIN, referência ou descrição) que não achou produto ativo */
  termo: string
  /** Chamado com o produto já reativado (recarregado do servidor) */
  onReativado?: (produto: Produto) => void
  className?: string
}

/**
 * Aviso exibido nas buscas que movimentam produtos (venda, PDV, compra, nota de entrada,
 * transferência, estoque) quando o termo não acha nenhum produto ATIVO mas existe um
 * cadastro INATIVO. Quem tem permissão em Produtos pode reativar ali mesmo.
 */
export const AvisoProdutoInativo: React.FC<AvisoProdutoInativoProps> = ({
  termo,
  onReativado,
  className = '',
}) => {
  const [inativos, setInativos] = useState<Produto[]>([])
  const [reativandoId, setReativandoId] = useState<string | null>(null)
  const assinanteId = useAssinanteId()
  const { pode } = usePermissoes()
  const { toast } = useToast()
  const podeReativar = pode('produtos', 'editar') || pode('produtos', 'excluir')

  useEffect(() => {
    let cancelado = false
    const t = (termo || '').trim()
    if (t.length < 2) {
      setInativos([])
      return
    }
    const timer = setTimeout(async () => {
      const lista = await buscarProdutosInativos(t, assinanteId || undefined)
      if (!cancelado) setInativos(lista)
    }, 200)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [termo, assinanteId])

  const reativar = async (p: Produto) => {
    setReativandoId(p.id)
    try {
      await ativarProduto(p.id)
      const atualizado = await pb
        .collection('produtos')
        .getOne<Produto>(p.id, { expand: 'unidade_id,marca_id' })
      setInativos((prev) => prev.filter((x) => x.id !== p.id))
      toast({ title: 'Produto reativado', description: `#${p.codigo} ${p.descricao}` })
      onReativado?.(atualizado)
    } catch (err) {
      console.error('Erro ao reativar produto:', err)
      toast({
        title: 'Não foi possível reativar',
        description: 'Verifique sua permissão em Cadastro de Produtos.',
        variant: 'destructive',
      })
    } finally {
      setReativandoId(null)
    }
  }

  if (inativos.length === 0) return null

  return (
    <div
      className={`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ${className}`}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          {inativos.length === 1 ? 'Produto inativado' : 'Produtos inativados'} encontrado
          {inativos.length === 1 ? '' : 's'}.{' '}
          {podeReativar ? 'Reative para poder usar.' : 'Peça para ativar em Cadastro de Produtos.'}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {inativos.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className="font-mono font-bold">#{p.codigo}</span> {p.descricao}
              {p.gtin ? <span className="text-amber-700"> · GTIN {p.gtin}</span> : null}
            </span>
            {podeReativar && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={reativandoId !== null}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void reativar(p)}
                className="h-6 shrink-0 border-amber-400 bg-white px-2 text-[10px] text-amber-800 hover:bg-amber-100"
              >
                {reativandoId === p.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                <span className="ml-1">Reativar</span>
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AvisoProdutoInativo
