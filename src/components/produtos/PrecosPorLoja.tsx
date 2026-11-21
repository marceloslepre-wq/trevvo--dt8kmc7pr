import React, { useState } from 'react'
import { Building2, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { salvarPrecoEmpresa } from '@/services/precosEmpresa'

interface PrecosPorLojaProps {
  produtoId?: string
  assinanteId?: string | null
  precoGeral: number
  /** empresa_id -> preço próprio (ausente = usa o preço geral) */
  precos: Record<string, number>
  onChange: (precos: Record<string, number>) => void
  podeEditar: boolean
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

/**
 * Preço de venda por loja. Cada loja marcada como "usa o preço geral" vende pelo preço
 * de venda acima; desmarcando, a loja passa a ter preço próprio (ex.: loja 02 com COMPETE).
 * Grava na hora (produtos_precos_empresa). PDV, pedido e Trevvo Móvel usam o preço da loja.
 */
export const PrecosPorLoja: React.FC<PrecosPorLojaProps> = ({
  produtoId,
  assinanteId,
  precoGeral,
  precos,
  onChange,
  podeEditar,
}) => {
  const { empresas } = useEmpresaAtiva()
  const { toast } = useToast()
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string>('')
  const [salvo, setSalvo] = useState<string>('')

  const gravar = async (empresaId: string, valor: number | null) => {
    if (!produtoId) return
    setSalvando(empresaId)
    try {
      await salvarPrecoEmpresa(produtoId, empresaId, valor, assinanteId)
      const novo = Object.assign({}, precos)
      if (valor === null) delete novo[empresaId]
      else novo[empresaId] = Number(valor.toFixed(2))
      onChange(novo)
      setSalvo(empresaId)
      window.setTimeout(() => setSalvo(''), 1500)
    } catch (err) {
      toast({
        title: 'Erro ao salvar o preço da loja',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSalvando('')
    }
  }

  const alternarProprio = (empresaId: string, usaGeral: boolean) => {
    if (usaGeral) {
      setRascunho((r) => Object.assign({}, r, { [empresaId]: '' }))
      void gravar(empresaId, null)
    } else {
      // Começa com o preço geral, para a pessoa ajustar
      setRascunho((r) => Object.assign({}, r, { [empresaId]: String(precoGeral || '') }))
      if (precoGeral > 0) void gravar(empresaId, precoGeral)
    }
  }

  const aoSair = (empresaId: string) => {
    const txt = rascunho[empresaId]
    if (txt === undefined) return
    const v = Number(String(txt).replace(',', '.'))
    if (!txt || Number.isNaN(v) || v <= 0) return
    if (precos[empresaId] === Number(v.toFixed(2))) return
    void gravar(empresaId, v)
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
      <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
        <Building2 className="h-4 w-4 text-blue-600" />
        <span>Preço de venda por loja</span>
      </div>
      {!produtoId ? (
        <p className="text-[11px] text-slate-500">
          Salve o produto primeiro para definir preços diferentes por loja.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">
            Lojas com &quot;usa o preço geral&quot; vendem por {brl(precoGeral)}. Desmarque para dar
            um preço próprio à loja. PDV, pedido e Trevvo Móvel usam o preço da loja que vende.
          </p>
          {empresas.map((emp) => {
            const proprio = precos[emp.id]
            const usaGeral = proprio === undefined
            const valorCampo = rascunho[emp.id] ?? (usaGeral ? '' : String(proprio))
            return (
              <div
                key={emp.id}
                className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-100 last:border-0"
              >
                <span className="text-xs font-medium text-slate-800 min-w-[200px] flex-1">
                  {emp.nome_fantasia || emp.razao_social}
                </span>
                <label className="flex items-center gap-2 text-[11px] text-slate-600">
                  <Switch
                    checked={usaGeral}
                    disabled={!podeEditar || salvando === emp.id}
                    onCheckedChange={(v) => alternarProprio(emp.id, v)}
                  />
                  usa o preço geral
                </label>
                <div className="w-32">
                  <Input
                    type="number"
                    step="0.01"
                    value={usaGeral ? '' : valorCampo}
                    placeholder={usaGeral ? brl(precoGeral) : '0,00'}
                    disabled={!podeEditar || usaGeral}
                    onChange={(e) =>
                      setRascunho((r) => Object.assign({}, r, { [emp.id]: e.target.value }))
                    }
                    onBlur={() => aoSair(emp.id)}
                    className="h-8 text-xs font-semibold text-emerald-700"
                  />
                </div>
                <span className="w-5">
                  {salvando === emp.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  ) : salvo === emp.id ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PrecosPorLoja
