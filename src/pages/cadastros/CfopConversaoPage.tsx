import React, { useState, useEffect, useCallback } from 'react'
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  CfopConversaoEntrada,
  TipoEntradaNota,
  TIPOS_ENTRADA,
  listarCfopConversao,
  salvarCfopConversao,
  inativarCfopConversao,
  ativarCfopConversao,
} from '@/services/cfopConversao'
import { SelectCfop } from '@/components/SelectCfop'

export const CfopConversaoPage: React.FC = () => {
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const [itens, setItens] = useState<CfopConversaoEntrada[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos')
  const [situacaoFiltro, setSituacaoFiltro] = useState<'todos' | 'ativos' | 'inativos'>('todos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [edicaoId, setEdicaoId] = useState<string | null>(null)
  const [formCfopFornecedor, setFormCfopFornecedor] = useState('')
  const [formTipoEntrada, setFormTipoEntrada] = useState<TipoEntradaNota>('Compra para revenda')
  const [formCfopEntrada, setFormCfopEntrada] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formAtivo, setFormAtivo] = useState(true)

  // Dialog confirmação inativar/ativar
  const [confirmDialogAberto, setConfirmDialogAberto] = useState(false)
  const [itemParaAlterar, setItemParaAlterar] = useState<CfopConversaoEntrada | null>(null)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarCfopConversao({
        busca,
        tipo_entrada: tipoFiltro,
        situacao: situacaoFiltro,
        page,
        perPage: 20,
      })
      setItens(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao listar conversões',
        description: err instanceof Error ? err.message : 'Falha na comunicação com o banco',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, tipoFiltro, situacaoFiltro, page, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const abrirNovo = () => {
    setEdicaoId(null)
    setFormCfopFornecedor('')
    setFormTipoEntrada('Compra para revenda')
    setFormCfopEntrada('')
    setFormDescricao('')
    setFormAtivo(true)
    setModalAberto(true)
  }

  const abrirEditar = (item: CfopConversaoEntrada) => {
    setEdicaoId(item.id)
    setFormCfopFornecedor(item.cfop_fornecedor)
    setFormTipoEntrada(item.tipo_entrada)
    setFormCfopEntrada(item.cfop_entrada)
    setFormDescricao(item.descricao || '')
    setFormAtivo(item.ativo)
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCfopFornecedor.trim() || !formCfopEntrada.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe o CFOP do fornecedor e o CFOP de entrada.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await salvarCfopConversao({
        id: edicaoId || undefined,
        cfop_fornecedor: formCfopFornecedor,
        tipo_entrada: formTipoEntrada,
        cfop_entrada: formCfopEntrada,
        descricao: formDescricao,
        ativo: formAtivo,
      })

      toast({
        title: edicaoId ? 'Conversão atualizada' : 'Conversão cadastrada',
        description: `CFOP ${formCfopFornecedor} → ${formCfopEntrada} salvo com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha na gravação',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleToggleSituacao = async () => {
    if (!itemParaAlterar) return
    try {
      if (itemParaAlterar.ativo) {
        await inativarCfopConversao(itemParaAlterar.id)
        toast({ title: 'Conversão inativada com sucesso' })
      } else {
        await ativarCfopConversao(itemParaAlterar.id)
        toast({ title: 'Conversão reativada com sucesso' })
      }
      setConfirmDialogAberto(false)
      setItemParaAlterar(null)
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao alterar situação',
        description: err instanceof Error ? err.message : 'Falha na operação',
        variant: 'destructive',
      })
    }
  }

  const exportarCSV = () => {
    if (itens.length === 0) return
    const cabecalho = [
      'CFOP Fornecedor',
      'Tipo de Entrada',
      'CFOP Entrada',
      'Descrição',
      'Situação',
    ]
    const linhas = itens.map((i) => [
      i.cfop_fornecedor,
      `"${i.tipo_entrada}"`,
      i.cfop_entrada,
      `"${(i.descricao || '').replace(/"/g, '""')}"`,
      i.ativo ? 'Ativo' : 'Inativo',
    ])
    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `conversoes_cfop_entrada_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Conversão de CFOP de Entrada
            </h1>
            <Badge variant="outline" className="text-xs font-normal border-slate-300">
              De-Para Fiscal
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Mapeamento automático do CFOP do fornecedor para a escrituração fiscal da nossa entrada
            por finalidade da nota.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {podeCriar && (
            <Button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus size={16} />
              Nova Conversão
            </Button>
          )}
          <Button
            onClick={exportarCSV}
            variant="outline"
            disabled={itens.length === 0}
            className="border-slate-300 text-slate-700 gap-1.5"
          >
            <Download size={15} />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por CFOP ou descrição..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPage(1)
                }}
                className="pl-9 text-xs"
              />
            </div>

            <Select
              value={tipoFiltro}
              onValueChange={(val) => {
                setTipoFiltro(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Tipo de entrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos de entrada</SelectItem>
                {TIPOS_ENTRADA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={situacaoFiltro}
              onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                setSituacaoFiltro(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as situações</SelectItem>
                <SelectItem value="ativos">Somente Ativos</SelectItem>
                <SelectItem value="inativos">Somente Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Grade de Listagem */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-600">
                  <th className="py-3 px-4 w-28 font-mono">CFOP Fornec.</th>
                  <th className="py-3 px-4 w-10 text-center"></th>
                  <th className="py-3 px-4 w-28 font-mono text-blue-700">CFOP Entrada</th>
                  <th className="py-3 px-4">Tipo de Entrada</th>
                  <th className="py-3 px-4">Descrição / Regra</th>
                  <th className="py-3 px-4 text-center w-24">Situação</th>
                  <th className="py-3 px-4 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Carregando conversões cadastradas...
                    </td>
                  </tr>
                ) : itens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Nenhuma regra de conversão de CFOP encontrada.
                    </td>
                  </tr>
                ) : (
                  itens.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !item.ativo ? 'bg-slate-50/50 opacity-60' : 'bg-white'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {item.cfop_fornecedor}
                      </td>
                      <td className="py-2.5 px-1 text-center text-slate-400">
                        <ArrowRight size={14} />
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-blue-700">
                        {item.cfop_entrada}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        <Badge
                          variant="outline"
                          className="text-[11px] font-normal border-slate-200 bg-slate-50"
                        >
                          {item.tipo_entrada}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 truncate max-w-xs">
                        {item.descricao || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
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
                            className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]"
                          >
                            Inativo
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEditar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-blue-600"
                              title="Editar conversão"
                            >
                              <Edit2 size={13} />
                            </Button>
                          )}
                          {podeInativar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setItemParaAlterar(item)
                                setConfirmDialogAberto(true)
                              }}
                              className={`h-7 w-7 ${
                                item.ativo
                                  ? 'text-slate-500 hover:text-rose-600'
                                  : 'text-slate-500 hover:text-emerald-600'
                              }`}
                              title={item.ativo ? 'Inativar conversão' : 'Reativar conversão'}
                            >
                              {item.ativo ? <Trash2 size={13} /> : <CheckCircle size={13} />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between p-4 border-t border-slate-200 text-xs text-slate-500 bg-slate-50/50">
            <span>
              Total: <strong>{totalItems}</strong> conversão(ões) cadastrada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 text-xs"
              >
                Anterior
              </Button>
              <span>
                Página <strong>{page}</strong> de <strong>{totalPages || 1}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Formulário */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle>
                {edicaoId ? 'Editar Conversão de CFOP' : 'Nova Conversão de CFOP de Entrada'}
              </DialogTitle>
              <DialogDescription>
                Defina o CFOP praticado pelo fornecedor e o CFOP correspondente que será gravado nos
                itens da nossa nota de entrada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div>
                <Label htmlFor="cfop_fornecedor" className="text-xs font-semibold text-slate-700">
                  CFOP do Fornecedor *
                </Label>
                <Input
                  id="cfop_fornecedor"
                  placeholder="Ex: 5102, 6102, 5405..."
                  maxLength={4}
                  value={formCfopFornecedor}
                  onChange={(e) => setFormCfopFornecedor(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Exatamente 4 dígitos numéricos (conforme emitido na NF-e do parceiro).
                </p>
              </div>

              <div>
                <Label htmlFor="tipo_entrada" className="text-xs font-semibold text-slate-700">
                  Tipo de Entrada / Destinação *
                </Label>
                <Select
                  value={formTipoEntrada}
                  onValueChange={(val: TipoEntradaNota) => setFormTipoEntrada(val)}
                >
                  <SelectTrigger id="tipo_entrada" className="mt-1 text-xs">
                    <SelectValue placeholder="Selecione o tipo de entrada" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ENTRADA.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cfop_entrada" className="text-xs font-semibold text-slate-700">
                  Nosso CFOP de Entrada *
                </Label>
                <Input
                  id="cfop_entrada"
                  placeholder="Ex: 1102, 2102, 1403, 1556..."
                  maxLength={4}
                  value={formCfopEntrada}
                  onChange={(e) => setFormCfopEntrada(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 font-mono text-xs text-blue-700 font-bold"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  CFOP de escrituração interno para a entrada no estabelecimento (1xxx, 2xxx, 3xxx).
                </p>
              </div>

              <div>
                <Label htmlFor="descricao" className="text-xs font-semibold text-slate-700">
                  Descrição / Observações (opcional)
                </Label>
                <Input
                  id="descricao"
                  placeholder="Ex: Compra de mercadoria tributada para revenda"
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              {edicaoId && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="form_ativo"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <Label htmlFor="form_ativo" className="text-xs font-medium cursor-pointer">
                    Conversão ativa
                  </Label>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {salvando ? 'Salvando...' : 'Salvar Regra'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação Inativar/Ativar */}
      <AlertDialog open={confirmDialogAberto} onOpenChange={setConfirmDialogAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemParaAlterar?.ativo
                ? 'Inativar conversão de CFOP?'
                : 'Reativar conversão de CFOP?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemParaAlterar?.ativo
                ? `A conversão de ${itemParaAlterar.cfop_fornecedor} → ${itemParaAlterar.cfop_entrada} deixará de ser aplicada automaticamente nas próximas importações de notas fiscais.`
                : `A conversão de ${itemParaAlterar?.cfop_fornecedor} → ${itemParaAlterar?.cfop_entrada} voltará a ser utilizada nas importações de notas fiscais.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleSituacao}
              className={
                itemParaAlterar?.ativo
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }
            >
              {itemParaAlterar?.ativo ? 'Sim, inativar' : 'Sim, reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CfopConversaoPage
