import React, { useEffect, useState } from 'react'
import { Store, Plus, Save, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  CanalMargem,
  excluirCanalMargem,
  listarCanaisMargem,
  salvarCanalMargem,
} from '@/services/canaisMargem'

type Linha = CanalMargem & { _tmp?: string; _alterado?: boolean }

/**
 * Configurações > Canais de venda (margem)
 * Canais usados na tabela "Margem líquida por canal" da aba Preços do produto.
 */
export default function CanaisMargemPage() {
  const { pode } = usePermissoes()
  const { empresas } = useEmpresaAtiva()
  const assinanteId = useAssinanteId()
  const { toast } = useToast()
  const podeEditar = pode('configuracoes', 'editar') || pode('configuracoes', 'criar')

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      const lista = await listarCanaisMargem(assinanteId)
      setLinhas(lista)
    } catch (err) {
      toast({
        title: 'Erro ao carregar canais',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinanteId])

  const alterar = (idx: number, campo: keyof CanalMargem, valor: unknown) => {
    setLinhas((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [campo]: valor, _alterado: true } : l)),
    )
  }

  const adicionar = () => {
    setLinhas((prev) => [
      ...prev,
      {
        _tmp: String(Date.now()),
        _alterado: true,
        nome: '',
        modo_icms: 'fixo',
        aliquota_icms_fixa: 0,
        comissao_percentual: 0,
        taxa_fixa: 0,
        despesas_percentual: 0,
        ordem: prev.length + 1,
        ativo: true,
      },
    ])
  }

  const remover = async (idx: number) => {
    const l = linhas[idx]
    if (l.id) {
      try {
        await excluirCanalMargem(l.id)
      } catch (err) {
        toast({
          title: 'Erro ao excluir',
          description: getErrorMessage(err),
          variant: 'destructive',
        })
        return
      }
    }
    setLinhas((prev) => prev.filter((_, i) => i !== idx))
  }

  const salvarTudo = async () => {
    const alteradas = linhas.filter((l) => l._alterado)
    if (alteradas.some((l) => !l.nome.trim())) {
      toast({ title: 'Informe o nome de todos os canais', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      for (const l of alteradas) {
        await salvarCanalMargem(l, assinanteId)
      }
      toast({ title: 'Canais salvos', description: `${alteradas.length} canal(is) atualizado(s).` })
      await carregar()
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const num = (v: unknown) => (v === null || v === undefined ? '' : String(v))

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-5 w-5 text-indigo-600" />
            Canais de venda (margem)
          </CardTitle>
          <CardDescription className="text-xs">
            Cada canal define como calcular a margem líquida do produto (aba Preços). ICMS
            &quot;pelo perfil&quot; usa a alíquota de venda interna do perfil tributário do produto
            (zero para ST/isentos); &quot;fixo&quot; usa o percentual informado (ex.: 1,1% de carga
            efetiva com COMPETE-ES). PIS/COFINS sempre vêm do perfil do produto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {carregando ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Loader2 className="h-5 w-5 animate-spin inline mr-1" /> Carregando...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 border-b border-slate-200 text-left">
                  <tr>
                    <th className="py-2 pr-2 w-12">Ordem</th>
                    <th className="py-2 px-2">Nome</th>
                    <th className="py-2 px-2">Empresa</th>
                    <th className="py-2 px-2">ICMS</th>
                    <th className="py-2 px-2 w-20">ICMS fixo %</th>
                    <th className="py-2 px-2 w-20">Comissão %</th>
                    <th className="py-2 px-2 w-24">Taxa fixa R$</th>
                    <th className="py-2 px-2 w-20">Despesas %</th>
                    <th className="py-2 px-2 w-14">Ativo</th>
                    <th className="py-2 pl-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linhas.map((l, idx) => (
                    <tr key={l.id || l._tmp}>
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          value={num(l.ordem)}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'ordem', e.target.value)}
                          className="h-8 text-xs w-12"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={l.nome}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'nome', e.target.value)}
                          className="h-8 text-xs min-w-[140px]"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={l.empresa_id || ''}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'empresa_id', e.target.value)}
                          className="h-8 text-xs border border-slate-300 rounded-md px-2 bg-white max-w-[180px]"
                        >
                          <option value="">(todas)</option>
                          {empresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nome_fantasia || emp.razao_social}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={l.modo_icms || 'fixo'}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'modo_icms', e.target.value)}
                          className="h-8 text-xs border border-slate-300 rounded-md px-2 bg-white"
                        >
                          <option value="perfil">Pelo perfil</option>
                          <option value="fixo">Fixo</option>
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={num(l.aliquota_icms_fixa)}
                          disabled={!podeEditar || l.modo_icms === 'perfil'}
                          onChange={(e) => alterar(idx, 'aliquota_icms_fixa', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={num(l.comissao_percentual)}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'comissao_percentual', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={num(l.taxa_fixa)}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'taxa_fixa', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={num(l.despesas_percentual)}
                          disabled={!podeEditar}
                          onChange={(e) => alterar(idx, 'despesas_percentual', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Switch
                          checked={l.ativo !== false}
                          disabled={!podeEditar}
                          onCheckedChange={(v) => alterar(idx, 'ativo', v)}
                        />
                      </td>
                      <td className="py-2 pl-2">
                        {podeEditar && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-rose-600"
                            onClick={() => remover(idx)}
                            title="Excluir canal"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {podeEditar && (
            <div className="flex justify-between">
              <Button type="button" variant="outline" size="sm" onClick={adicionar}>
                <Plus className="h-4 w-4 mr-1" /> Novo canal
              </Button>
              <Button type="button" size="sm" onClick={salvarTudo} disabled={salvando}>
                {salvando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar alterações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
