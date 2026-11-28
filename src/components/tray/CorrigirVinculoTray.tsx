import React, { useState } from 'react'
import { Loader2, Save, Search } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { useAssinanteId } from '@/hooks/useAssinanteId'

/**
 * Corrige um vínculo Tray que já existe (a sincronização nunca troca vínculo existente).
 * Digita o nº do anúncio da Tray, aparecem os vínculos dele (um por variação) com o produto
 * atual; troca o código do produto do Trevvo, as unidades e o preço fixo do anúncio.
 * Grava só no Trevvo.
 */

interface Props {
  empresaId: string
}

interface Linha {
  id: string
  variacao_id: string
  titulo: string
  produtoAtual: string
  codigo: string
  unidades: string
  preco: string
  salvando?: boolean
  salvo?: boolean
}

const numero = (t: string) => {
  const s = (t || '').trim()
  if (!s) return 0
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

export const CorrigirVinculoTray: React.FC<Props> = ({ empresaId }) => {
  const assinanteId = useAssinanteId()
  const [anuncio, setAnuncio] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)

  const buscar = async () => {
    const a = anuncio.trim().replace(/^#/, '')
    if (!/^[0-9]{1,20}$/.test(a)) {
      toast({ title: 'Digite o número do anúncio da Tray', variant: 'destructive' })
      return
    }
    setBuscando(true)
    try {
      const vs = await pb.collection('produtos_vinculos_anuncios').getFullList<{
        id: string
        variacao_id: string
        titulo: string
        unidades: number
        preco_anuncio?: number
        expand?: { produto_id?: { codigo: number; descricao: string } }
      }>({
        filter: `empresa_id = '${empresaId}' && marketplace = 'tray' && anuncio_id = '${a}'`,
        expand: 'produto_id',
        sort: 'variacao_id',
        requestKey: null,
      })
      setLinhas(
        vs.map((v) => ({
          id: v.id,
          variacao_id: v.variacao_id,
          titulo: v.titulo,
          produtoAtual: v.expand?.produto_id
            ? `#${v.expand.produto_id.codigo} ${v.expand.produto_id.descricao}`
            : '(produto não encontrado)',
          codigo: v.expand?.produto_id ? String(v.expand.produto_id.codigo) : '',
          unidades: String(v.unidades || 1),
          preco: v.preco_anuncio ? String(v.preco_anuncio).replace('.', ',') : '',
        })),
      )
    } catch (err) {
      toast({
        title: 'Não foi possível buscar o anúncio',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setBuscando(false)
    }
  }

  const alterar = (id: string, campo: 'codigo' | 'unidades' | 'preco', valor: string) =>
    setLinhas((l) =>
      (l || []).map((x) => (x.id === id ? { ...x, [campo]: valor, salvo: false } : x)),
    )

  const salvar = async (l: Linha) => {
    const unidades = parseInt(l.unidades, 10)
    const preco = numero(l.preco)
    if (!Number.isInteger(unidades) || unidades < 1) {
      toast({ title: 'Unidades deve ser 1 ou mais', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(preco) || preco < 0) {
      toast({ title: 'Preço do anúncio inválido', variant: 'destructive' })
      return
    }
    const cod = parseInt(l.codigo, 10)
    if (!Number.isInteger(cod)) {
      toast({ title: 'Código do produto inválido', variant: 'destructive' })
      return
    }
    setLinhas((x) => (x || []).map((y) => (y.id === l.id ? { ...y, salvando: true } : y)))
    try {
      const prods = await pb
        .collection('produtos')
        .getList<{ id: string; codigo: number; descricao: string }>(1, 2, {
          filter: `${assinanteId ? `assinante_id = '${assinanteId}' && ` : ''}codigo = ${cod}`,
          fields: 'id,codigo,descricao',
          requestKey: null,
        })
      if (prods.items.length !== 1) throw new Error(`Produto ${cod} não existe no Trevvo`)
      const p = prods.items[0]
      await pb
        .collection('produtos_vinculos_anuncios')
        .update(
          l.id,
          { produto_id: p.id, unidades, preco_anuncio: Math.round(preco * 100) / 100 },
          { requestKey: null },
        )
      setLinhas((x) =>
        (x || []).map((y) =>
          y.id === l.id
            ? { ...y, salvando: false, salvo: true, produtoAtual: `#${p.codigo} ${p.descricao}` }
            : y,
        ),
      )
    } catch (err) {
      setLinhas((x) => (x || []).map((y) => (y.id === l.id ? { ...y, salvando: false } : y)))
      toast({
        title: 'Não foi possível salvar',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Corrigir vínculo de um anúncio:</span>
        <Input
          value={anuncio}
          onChange={(e) => setAnuncio(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void buscar()
          }}
          placeholder="Nº do anúncio na Tray (ex.: 6115)"
          className="h-8 w-56 text-xs"
        />
        <Button size="sm" variant="outline" onClick={() => void buscar()} disabled={buscando}>
          {buscando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-1 h-4 w-4" />
          )}
          Buscar
        </Button>
      </div>
      {linhas && linhas.length === 0 && (
        <p className="text-amber-700">Nenhum vínculo para esse anúncio nesta empresa.</p>
      )}
      {linhas && linhas.length > 0 && (
        <div className="space-y-1">
          {linhas.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1"
            >
              <div className="min-w-[220px] flex-1">
                <div className="truncate font-medium">{l.titulo || '(sem título)'}</div>
                <div className="text-slate-500">
                  {l.variacao_id ? `variação ${l.variacao_id} · ` : ''}hoje: {l.produtoAtual}
                </div>
              </div>
              <label className="text-slate-500">Cód. Trevvo</label>
              <Input
                value={l.codigo}
                onChange={(e) => alterar(l.id, 'codigo', e.target.value)}
                className="h-8 w-24 text-xs"
              />
              <label className="text-slate-500">Unid.</label>
              <Input
                value={l.unidades}
                onChange={(e) => alterar(l.id, 'unidades', e.target.value)}
                className="h-8 w-16 text-xs"
              />
              <label className="text-slate-500">Preço anúncio</label>
              <Input
                value={l.preco}
                onChange={(e) => alterar(l.id, 'preco', e.target.value)}
                placeholder="loja x unid."
                className="h-8 w-24 text-xs"
              />
              <Button size="sm" onClick={() => void salvar(l)} disabled={l.salvando}>
                {l.salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
              {l.salvo && <span className="text-green-700">Salvo</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CorrigirVinculoTray
