import React, { useState, useEffect, useCallback, useTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Power,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  Building,
  RefreshCw,
} from 'lucide-react'
import {
  Empresa,
  listarEmpresas,
  alternarSituacaoEmpresa,
  ListarEmpresasParams,
} from '@/services/empresas'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { formatarCNPJ } from '@/lib/validacoes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/hooks/use-toast'

export const EmpresasLista: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { recarregarEmpresas } = useEmpresaAtiva()

  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [buscaInput, setBuscaInput] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'Matriz' | 'Filial'>('todos')
  const [pagina, setPagina] = useState(1)
  const [ordenarPor, setOrdenarPor] = useState('codigo')
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('asc')

  const [empresaAlvo, setEmpresaAlvo] = useState<Empresa | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [processandoAcao, setProcessandoAcao] = useState(false)
  const [, startTransition] = useTransition()

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const params: ListarEmpresasParams = {
        pagina,
        porPagina: 20,
        busca,
        filtroSituacao,
        filtroTipo,
        ordenarPor,
        ordem,
      }
      const res = await listarEmpresas(params)
      setEmpresas(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages || 1)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao listar empresas',
        description: err instanceof Error ? err.message : 'Falha ao carregar registros',
      })
    } finally {
      setCarregando(false)
    }
  }, [pagina, busca, filtroSituacao, filtroTipo, ordenarPor, ordem, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const alternarOrdem = (campo: string) => {
    if (ordenarPor === campo) {
      setOrdem(ordem === 'asc' ? 'desc' : 'asc')
    } else {
      setOrdenarPor(campo)
      setOrdem('asc')
    }
    setPagina(1)
  }

  const dispararBusca = (e: React.FormEvent) => {
    e.preventDefault()
    setBusca(buscaInput)
    setPagina(1)
  }

  const limparFiltros = () => {
    setBusca('')
    setBuscaInput('')
    setFiltroSituacao('todos')
    setFiltroTipo('todos')
    setPagina(1)
  }

  const abrirConfirmacaoInativar = (empresa: Empresa) => {
    setEmpresaAlvo(empresa)
    setDialogAberto(true)
  }

  const confirmarAcaoSituacao = async () => {
    if (!empresaAlvo) return
    const novoStatus = !empresaAlvo.ativo

    try {
      setProcessandoAcao(true)
      await alternarSituacaoEmpresa(empresaAlvo.id, novoStatus)

      toast({
        title: novoStatus ? 'Empresa ativada' : 'Empresa inativada',
        description: `A empresa "${empresaAlvo.razao_social}" foi ${
          novoStatus ? 'ativada' : 'inativada'
        } com sucesso.`,
      })

      setDialogAberto(false)
      setEmpresaAlvo(null)
      startTransition(() => {
        carregarDados()
        recarregarEmpresas()
      })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: err instanceof Error ? err.message : 'Não foi possível alterar a situação.',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const exportarCSV = () => {
    if (empresas.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros exibidos com os filtros atuais.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Tipo',
      'Razão Social',
      'Nome Fantasia',
      'CNPJ',
      'Município',
      'UF',
      'Situação',
    ]
    const linhas = empresas.map((e) => [
      e.codigo,
      e.tipo,
      `"${(e.razao_social || '').replace(/"/g, '""')}"`,
      `"${(e.nome_fantasia || '').replace(/"/g, '""')}"`,
      formatarCNPJ(e.cnpj),
      `"${(e.municipio || '').replace(/"/g, '""')}"`,
      e.uf || '',
      e.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `empresas_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: 'O arquivo CSV foi baixado com sucesso.',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Empresa e Filiais</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerenciamento de matriz e filiais com CNPJ próprio e parâmetros fiscais
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <Download size={14} className="mr-1.5" />
            Exportar CSV
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/cadastros/empresas/novo')}
            className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            <Plus size={15} className="mr-1.5" />
            Nova Empresa
          </Button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <form
          onSubmit={dispararBusca}
          className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <Input
              type="text"
              placeholder="Buscar por razão social, nome fantasia, CNPJ ou cidade..."
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <Select
                value={filtroTipo}
                onValueChange={(val: 'todos' | 'Matriz' | 'Filial') => {
                  setFiltroTipo(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Matriz">Matriz</SelectItem>
                  <SelectItem value="Filial">Filial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36">
              <Select
                value={filtroSituacao}
                onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                  setFiltroSituacao(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  <SelectItem value="ativos">Somente Ativos</SelectItem>
                  <SelectItem value="inativos">Somente Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" size="sm" variant="secondary" className="text-xs h-9 px-3">
              <Filter size={14} className="mr-1.5" />
              Filtrar
            </Button>

            {(busca || filtroSituacao !== 'todos' || filtroTipo !== 'todos') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={limparFiltros}
                className="text-xs h-9 text-slate-500 hover:text-slate-800"
              >
                Limpar
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold select-none">
                <th
                  onClick={() => alternarOrdem('codigo')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-20"
                >
                  <div className="flex items-center gap-1">
                    <span>Código</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('tipo')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-24"
                >
                  <div className="flex items-center gap-1">
                    <span>Tipo</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('razao_social')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Razão Social</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('nome_fantasia')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Nome Fantasia</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('cnpj')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-40"
                >
                  <div className="flex items-center gap-1">
                    <span>CNPJ</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Município / UF</th>
                <th
                  onClick={() => alternarOrdem('ativo')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-24"
                >
                  <div className="flex items-center gap-1">
                    <span>Situação</span>
                    <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-blue-600" size={20} />
                      <span>Carregando empresas...</span>
                    </div>
                  </td>
                </tr>
              ) : empresas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Building className="text-slate-300" size={36} />
                      <span className="font-medium text-slate-700">Nenhuma empresa encontrada</span>
                      <span className="text-[11px] text-slate-400">
                        {busca || filtroSituacao !== 'todos' || filtroTipo !== 'todos'
                          ? 'Tente ajustar os filtros da busca'
                          : 'Clique em "Nova Empresa" para cadastrar a Matriz'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                empresas.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-700">{emp.codigo}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant="outline"
                        className={
                          emp.tipo === 'Matriz'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                            : 'bg-purple-50 text-purple-700 border-purple-200 font-semibold'
                        }
                      >
                        {emp.tipo}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{emp.razao_social}</td>
                    <td className="py-3 px-4 text-slate-600">{emp.nome_fantasia || '—'}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{formatarCNPJ(emp.cnpj)}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {emp.municipio ? `${emp.municipio} / ${emp.uf || ''}` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {emp.ativo ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <XCircle size={12} className="text-slate-400" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => navigate(`/cadastros/empresas/${emp.id}/editar`)}
                          title="Editar empresa"
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${
                            emp.ativo
                              ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                          onClick={() => abrirConfirmacaoInativar(emp)}
                          title={emp.ativo ? 'Inativar empresa' : 'Ativar empresa'}
                        >
                          <Power size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            Total de <span className="font-semibold text-slate-800">{totalItems}</span> registro(s)
            {totalPages > 1 && ` • Página ${pagina} de ${totalPages}`}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1 || carregando}
              onClick={() => setPagina((p) => Math.max(p - 1, 1))}
              className="h-8 text-xs px-2.5 border-slate-200"
            >
              Anterior
            </Button>
            <div className="px-2 font-medium text-slate-700">
              {pagina} / {totalPages || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPages || carregando}
              onClick={() => setPagina((p) => Math.min(p + 1, totalPages))}
              className="h-8 text-xs px-2.5 border-slate-200"
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-slate-900">
                {empresaAlvo?.ativo ? 'Confirmar inativação' : 'Confirmar ativação'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed">
              {empresaAlvo?.ativo ? (
                <>
                  Deseja realmente inativar a empresa{' '}
                  <strong className="text-slate-900">{empresaAlvo?.razao_social}</strong> (Código{' '}
                  {empresaAlvo?.codigo})?
                  <br />
                  <br />
                  Empresas inativadas deixam de aparecer no seletor de empresa ativa e não podem
                  movimentar novas notas ou vendas. Conforme a regra do ERP, o registro não é
                  excluído fisicamente para manter a integridade dos dados históricos.
                  {empresaAlvo?.tipo === 'Matriz' && (
                    <span className="block mt-2 font-medium text-amber-700">
                      Atenção: A Matriz só pode ser inativada se não houver filiais ativas.
                    </span>
                  )}
                </>
              ) : (
                <>
                  Deseja reativar a empresa{' '}
                  <strong className="text-slate-900">{empresaAlvo?.razao_social}</strong>? Ela
                  voltará a ficar disponível para seleção e operações.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogAberto(false)}
              disabled={processandoAcao}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmarAcaoSituacao}
              disabled={processandoAcao}
              className={`text-xs ${
                empresaAlvo?.ativo
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {processandoAcao
                ? 'Processando...'
                : empresaAlvo?.ativo
                  ? 'Sim, inativar'
                  : 'Sim, reativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EmpresasLista
