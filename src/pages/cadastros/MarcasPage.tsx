import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Tag,
  Plus,
  Search,
  Download,
  Edit2,
  Power,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { Marca, listarMarcas, salvarMarca, inativarMarca, ativarMarca } from '@/services/marcas'

export const MarcasPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('marcas', 'criar')
  const podeEditar = pode('marcas', 'editar')
  const podeInativar = pode('marcas', 'excluir')

  const { toast } = useToast()
  const [, startTransition] = useTransition()

  // Estados de listagem
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [ordenacao, setOrdenacao] = useState<string>('nome')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Estados do Modal Formulário (janela)
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [fabricante, setFabricante] = useState('')
  const [observacao, setObservacao] = useState('')
  const [errosForm, setErrosForm] = useState<{ nome?: string }>({})

  // Estados de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<Marca | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<Marca | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarMarcas({
        busca,
        situacao,
        ordenacao,
        page: pagina,
        perPage: 20,
      })
      setMarcas(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar marcas'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, situacao, ordenacao, pagina, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const alternarOrdenacao = (campo: string) => {
    if (ordenacao === campo) {
      setOrdenacao(`-${campo}`)
    } else if (ordenacao === `-${campo}`) {
      setOrdenacao(campo)
    } else {
      setOrdenacao(campo)
    }
    setPagina(1)
  }

  const renderIconeOrdenacao = (campo: string) => {
    if (ordenacao === campo) {
      return <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
    }
    if (ordenacao === `-${campo}`) {
      return <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
    }
    return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
  }

  const handleAbrirNovo = () => {
    setEditandoId(null)
    setNome('')
    setFabricante('')
    setObservacao('')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: Marca) => {
    setEditandoId(item.id)
    setNome(item.nome)
    setFabricante(item.fabricante || '')
    setObservacao(item.observacao || '')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = nome.trim()
    const novosErros: { nome?: string } = {}

    if (!nomeLimpo) {
      novosErros.nome = 'O nome da marca é obrigatório.'
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      await salvarMarca({
        id: editandoId || undefined,
        nome: nomeLimpo,
        fabricante: fabricante.trim() || undefined,
        observacao: observacao.trim() || undefined,
      })

      toast({
        title: editandoId ? 'Marca atualizada' : 'Marca cadastrada',
        description: `A marca "${nomeLimpo}" foi gravada com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar marca'
      toast({
        title: 'Erro ao salvar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleConfirmarInativacao = async () => {
    if (!itemParaInativar) return
    setProcessandoAcao(true)
    try {
      await inativarMarca(itemParaInativar.id)
      toast({
        title: 'Marca inativada',
        description: `A marca "${itemParaInativar.nome}" foi inativada.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar marca'
      toast({
        title: 'Falha na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleConfirmarAtivacao = async () => {
    if (!itemParaAtivar) return
    setProcessandoAcao(true)
    try {
      await ativarMarca(itemParaAtivar.id)
      toast({
        title: 'Marca reativada',
        description: `A marca "${itemParaAtivar.nome}" está ativa novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar marca'
      toast({
        title: 'Falha na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const exportarCSV = () => {
    if (marcas.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = ['Nome', 'Fabricante', 'Observação', 'Situação']
    const linhas = marcas.map((m) => [
      `"${m.nome.replace(/"/g, '""')}"`,
      `"${(m.fabricante || '').replace(/"/g, '""')}"`,
      `"${(m.observacao || '').replace(/"/g, '""')}"`,
      m.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `marcas_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download do arquivo de marcas foi iniciado com sucesso.',
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Marcas</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Cadastro de marcas e fabricantes de produtos comercializados pela empresa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportarCSV}
            className="text-slate-700 border-slate-300 hover:bg-slate-50"
          >
            <Download className="mr-2 h-4 w-4 text-slate-500" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button onClick={handleAbrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Nova Marca
            </Button>
          )}
        </div>
      </div>

      {/* Card com Filtros e Tabela */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Campo Busca */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, fabricante ou observação..."
                value={busca}
                onChange={(e) => {
                  const val = e.target.value
                  startTransition(() => {
                    setBusca(val)
                    setPagina(1)
                  })
                }}
                className="pl-9 bg-slate-50/50 border-slate-200 text-sm"
              />
            </div>

            {/* Filtro Situação */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Situação:
              </span>
              <Select
                value={situacao}
                onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                  setSituacao(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="w-36 h-9 text-xs">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">
                    <button
                      onClick={() => alternarOrdenacao('nome')}
                      className="flex items-center gap-1.5 hover:text-slate-900 font-semibold"
                    >
                      Marca
                      {renderIconeOrdenacao('nome')}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      onClick={() => alternarOrdenacao('fabricante')}
                      className="flex items-center gap-1.5 hover:text-slate-900 font-semibold"
                    >
                      Fabricante
                      {renderIconeOrdenacao('fabricante')}
                    </button>
                  </th>
                  <th className="py-3 px-4">Observação</th>
                  <th className="py-3 px-4 w-28 text-center">
                    <button
                      onClick={() => alternarOrdenacao('ativo')}
                      className="flex items-center justify-center gap-1.5 w-full hover:text-slate-900 font-semibold"
                    >
                      Situação
                      {renderIconeOrdenacao('ativo')}
                    </button>
                  </th>
                  <th className="py-3 px-4 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        <span className="text-xs">Carregando marcas...</span>
                      </div>
                    </td>
                  </tr>
                ) : marcas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Nenhuma marca encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  marcas.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors group text-slate-700"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">{item.nome}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.fabricante || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs max-w-xs truncate">
                        {item.observacao || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.ativo ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs hover:bg-emerald-100 font-medium">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-600 border-slate-200 text-xs"
                          >
                            Inativo
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAbrirEditar(item)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Editar marca"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}

                          {podeInativar &&
                            (item.ativo ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemParaInativar(item)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                title="Inativar marca"
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemParaAtivar(item)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                title="Reativar marca"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-200 text-xs text-slate-500 gap-3">
            <div>
              Mostrando {marcas.length} de {totalItens} marcas cadastradas
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1 || carregando}
                className="h-8 px-3 text-xs"
              >
                Anterior
              </Button>
              <span className="text-slate-700 font-medium">
                Página {pagina} de {Math.max(1, totalPaginas)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas || carregando}
                className="h-8 px-3 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Formulário Inclusão / Edição (Janela) */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editandoId ? 'Editar Marca' : 'Nova Marca'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastre ou edite a marca/fabricante que será associada aos produtos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="marca-nome" className="text-xs font-semibold text-slate-700">
                  Nome da Marca <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="marca-nome"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value)
                    if (errosForm.nome) setErrosForm((prev) => ({ ...prev, nome: undefined }))
                  }}
                  placeholder="Ex: Coca-Cola, Nike, Nestlé..."
                  autoFocus
                />
                {errosForm.nome && (
                  <p className="text-xs text-rose-600 font-medium">{errosForm.nome}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="marca-fabricante" className="text-xs font-semibold text-slate-700">
                  Fabricante / Empresa Fabricante
                </Label>
                <Input
                  id="marca-fabricante"
                  value={fabricante}
                  onChange={(e) => setFabricante(e.target.value)}
                  placeholder="Ex: The Coca-Cola Company, Indústria Brasileira..."
                />
                <p className="text-[11px] text-slate-400">
                  Razão social ou nome do fabricante (opcional).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="marca-observacao" className="text-xs font-semibold text-slate-700">
                  Observações
                </Label>
                <Textarea
                  id="marca-observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Notas adicionais sobre distribuição, garantia ou contato..."
                  rows={3}
                  className="resize-none text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={salvando}
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Marca'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Inativação */}
      <AlertDialog
        open={Boolean(itemParaInativar)}
        onOpenChange={(aberto) => !aberto && setItemParaInativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>Inativar Marca</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja realmente inativar a marca{' '}
              <strong className="text-slate-900">{itemParaInativar?.nome}</strong>? A marca não
              poderá mais ser selecionada em novos produtos, mantendo o histórico nos já
              cadastrados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {processandoAcao ? 'Inativando...' : 'Sim, inativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Reativação */}
      <AlertDialog
        open={Boolean(itemParaAtivar)}
        onOpenChange={(aberto) => !aberto && setItemParaAtivar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle2 className="h-5 w-5" />
              <AlertDialogTitle>Reativar Marca</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja reativar a marca{' '}
              <strong className="text-slate-900">{itemParaAtivar?.nome}</strong>? Ela voltará a
              ficar disponível para seleção em novos produtos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarAtivacao}
              disabled={processandoAcao}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processandoAcao ? 'Reativando...' : 'Sim, reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default MarcasPage
