import React, { useEffect, useState } from 'react'
import { Tag, Plus, Search, Edit2, Trash2, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  CentroCusto,
  listarCentrosCusto,
  salvarCentroCusto,
  inativarCentroCusto,
  ativarCentroCusto,
} from '@/services/centrosCusto'

export const CentrosCustoPage: React.FC = () => {
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const podeCriar = pode('financeiro_bancos', 'criar')
  const podeEditar = pode('financeiro_bancos', 'editar')
  const podeExcluir = pode('financeiro_bancos', 'excluir')

  const [itens, setItens] = useState<CentroCusto[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<Partial<CentroCusto> | null>(null)

  const carregarDados = async () => {
    try {
      setCarregando(true)
      const res = await listarCentrosCusto({
        busca,
        situacao: filtroSituacao,
        page: 1,
        perPage: 100,
      })
      setItens(res.items)
      setTotalItems(res.totalItems)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar os centros de custo.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [busca, filtroSituacao])

  const abrirNovo = () => {
    setEditando({
      codigo: '',
      descricao: '',
      ativo: true,
    })
    setModalAberto(true)
  }

  const abrirEditar = (item: CentroCusto) => {
    setEditando({ ...item })
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando) return

    try {
      setSalvando(true)
      await salvarCentroCusto(editando)
      toast({
        title: editando.id ? 'Centro de custo atualizado' : 'Centro de custo cadastrado',
        description: `O centro de custo "${editando.codigo} - ${editando.descricao}" foi salvo com sucesso.`,
      })
      setModalAberto(false)
      setEditando(null)
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar centro de custo.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleInativar = async (item: CentroCusto) => {
    if (
      !confirm(`Deseja realmente inativar o centro de custo "${item.codigo} - ${item.descricao}"?`)
    ) {
      return
    }

    try {
      await inativarCentroCusto(item.id)
      toast({
        title: 'Centro de custo inativado',
        description: 'O registro foi inativado com sucesso.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível inativar o centro de custo.',
      })
    }
  }

  const handleAtivar = async (item: CentroCusto) => {
    try {
      await ativarCentroCusto(item.id)
      toast({
        title: 'Centro de custo reativado',
        description: 'O registro foi reativado com sucesso.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível reativar o centro de custo.',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Centros de Custo
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro compartilhado de centros de custo para rateio e apuração financeira
          </p>
        </div>

        {podeCriar && (
          <Button
            type="button"
            size="sm"
            onClick={abrirNovo}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Plus size={15} />
            <span>Novo Centro de Custo</span>
          </Button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <div className="flex items-center justify-end gap-2 text-xs">
            <Filter size={13} className="text-slate-400" />
            <span className="text-slate-500">Situação:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                type="button"
                onClick={() => setFiltroSituacao('ativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'ativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ativos
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('inativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'inativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inativos
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('todos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'todos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-600 font-semibold select-none">
            <tr>
              <th className="py-3 px-4 w-32">Código</th>
              <th className="py-3 px-4">Descrição</th>
              <th className="py-3 px-4 text-center w-28">Status</th>
              <th className="py-3 px-4 text-right w-28">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500 text-xs">
                  <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Carregando centros de custo...
                </td>
              </tr>
            ) : itens.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500 text-xs">
                  Nenhum centro de custo cadastrado.
                </td>
              </tr>
            ) : (
              itens.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    !item.ativo ? 'opacity-60 bg-slate-50/40' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-medium text-slate-900">{item.codigo}</td>
                  <td className="py-3 px-4 text-slate-800 font-medium">{item.descricao}</td>
                  <td className="py-3 px-4 text-center">
                    {item.ativo ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                      >
                        Ativo
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-600 border-red-200 text-[10px]"
                      >
                        Inativo
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {podeEditar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEditar(item)}
                          className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 hover:bg-slate-100"
                          title="Editar"
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}

                      {podeExcluir && item.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInativar(item)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50"
                          title="Inativar"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}

                      {podeEditar && !item.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAtivar(item)}
                          className="h-7 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50"
                        >
                          Reativar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Total de registros: <strong>{totalItems}</strong>
          </span>
        </div>
      </div>

      {/* Modal Formulário */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editando?.id ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe o código e a descrição do centro de custo.
            </DialogDescription>
          </DialogHeader>

          {editando && (
            <form onSubmit={handleSalvar} className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="codigo" className="text-xs font-medium text-slate-700">
                  Código <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="codigo"
                  value={editando.codigo || ''}
                  onChange={(e) => setEditando({ ...editando, codigo: e.target.value })}
                  placeholder="Ex: 1, 10, ADM, COM"
                  className="text-xs h-9 font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="descricao" className="text-xs font-medium text-slate-700">
                  Descrição <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="descricao"
                  value={editando.descricao || ''}
                  onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
                  placeholder="Ex: Geral, Administrativo, Comercial, Loja Centro"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ativo" className="text-xs text-slate-700 cursor-pointer">
                    Ativo
                  </Label>
                  <Switch
                    id="ativo"
                    checked={editando.ativo !== false}
                    onCheckedChange={(val) => setEditando({ ...editando, ativo: val })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalAberto(false)}
                    disabled={salvando}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={salvando}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CentrosCustoPage
