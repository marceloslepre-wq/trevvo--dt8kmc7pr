import React, { useState, useEffect, useCallback, useTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserCheck,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Power,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Lock,
  UserPlus,
  Building2,
  User,
  Globe2,
} from 'lucide-react'
import {
  Cliente,
  listarClientes,
  inativarCliente,
  ativarCliente,
  ListarClientesParams,
  listarVendedoresAtivos,
} from '@/services/clientes'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { formatarCNPJ, formatarCPF, formatarTelefone } from '@/lib/validacoes'
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
import { ClienteCadastroRapido } from '@/components/ClienteCadastroRapido'

const UFS_BRASIL = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
  'EX',
]

export const ClientesLista: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()

  const podeCriar = pode('clientes', 'criar')
  const podeEditar = pode('clientes', 'editar')
  const podeInativar = pode('clientes', 'excluir')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [buscaInput, setBuscaInput] = useState('')
  const [filtroTipoPessoa, setFiltroTipoPessoa] = useState<string>('todos')
  const [filtroUf, setFiltroUf] = useState<string>('todos')
  const [filtroCidade, setFiltroCidade] = useState<string>('')
  const [filtroCidadeInput, setFiltroCidadeInput] = useState<string>('')
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [filtroBloqueado, setFiltroBloqueado] = useState<'todos' | 'sim' | 'nao'>('todos')

  // Lista de vendedores para o filtro
  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string }>>([])

  // Paginação e Ordenação
  const [pagina, setPagina] = useState(1)
  const [ordenarPor, setOrdenarPor] = useState('codigo')
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('desc')

  // Ações de Inativação / Reativação
  const [clienteAlvo, setClienteAlvo] = useState<Cliente | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Modal de Cadastro Rápido
  const [modalRapidoAberto, setModalRapidoAberto] = useState(false)

  const [, startTransition] = useTransition()

  // Carregar lista de vendedores
  useEffect(() => {
    listarVendedoresAtivos().then(setVendedores).catch(console.error)
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const params: ListarClientesParams = {
        pagina,
        porPagina: 20,
        busca,
        tipo_pessoa: filtroTipoPessoa,
        uf: filtroUf,
        municipio: filtroCidade,
        vendedor_id: filtroVendedor,
        situacao: filtroSituacao,
        bloqueado: filtroBloqueado,
        ordenarPor,
        ordem,
      }
      const res = await listarClientes(params)
      setClientes(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages || 1)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao listar clientes',
        description: err instanceof Error ? err.message : 'Falha ao carregar registros',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    pagina,
    busca,
    filtroTipoPessoa,
    filtroUf,
    filtroCidade,
    filtroVendedor,
    filtroSituacao,
    filtroBloqueado,
    ordenarPor,
    ordem,
    toast,
  ])

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

  const renderIconeOrdenacao = (campo: string) => {
    if (ordenarPor !== campo) {
      return <ArrowUpDown size={12} className="text-slate-400" />
    }
    return ordem === 'asc' ? (
      <ArrowUp size={12} className="text-blue-600" />
    ) : (
      <ArrowDown size={12} className="text-blue-600" />
    )
  }

  const dispararFiltros = (e: React.FormEvent) => {
    e.preventDefault()
    setBusca(buscaInput)
    setFiltroCidade(filtroCidadeInput)
    setPagina(1)
  }

  const limparFiltros = () => {
    setBusca('')
    setBuscaInput('')
    setFiltroTipoPessoa('todos')
    setFiltroUf('todos')
    setFiltroCidade('')
    setFiltroCidadeInput('')
    setFiltroVendedor('todos')
    setFiltroSituacao('ativos')
    setFiltroBloqueado('todos')
    setPagina(1)
  }

  const abrirConfirmacaoSituacao = (cliente: Cliente) => {
    setClienteAlvo(cliente)
    setDialogAberto(true)
  }

  const confirmarAcaoSituacao = async () => {
    if (!clienteAlvo) return
    const novoStatus = !clienteAlvo.ativo

    try {
      setProcessandoAcao(true)
      if (novoStatus) {
        await ativarCliente(clienteAlvo.id)
      } else {
        await inativarCliente(clienteAlvo.id)
      }

      toast({
        title: novoStatus ? 'Cliente ativado' : 'Cliente inativado',
        description: `O cliente "${clienteAlvo.nome_razao_social}" foi ${
          novoStatus ? 'ativado' : 'inativado'
        } com sucesso.`,
      })

      setDialogAberto(false)
      setClienteAlvo(null)
      startTransition(() => {
        carregarDados()
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

  const formatarDocumentoExibicao = (c: Cliente) => {
    if (c.tipo_pessoa === 'Estrangeiro') {
      return c.id_estrangeiro || '-'
    }
    if (!c.cpf_cnpj) return '-'
    if (c.tipo_pessoa === 'Física') {
      return formatarCPF(c.cpf_cnpj)
    }
    return formatarCNPJ(c.cpf_cnpj)
  }

  const exportarCSV = () => {
    if (clientes.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros exibidos com os filtros atuais.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Tipo de Pessoa',
      'Razão Social / Nome',
      'Nome Fantasia',
      'CPF / CNPJ / Doc',
      'Inscrição Estadual',
      'Município',
      'UF',
      'Telefone',
      'E-mail',
      'Vendedor',
      'Bloqueado',
      'Situação',
    ]

    const linhas = clientes.map((c) => [
      c.codigo,
      c.tipo_pessoa,
      `"${(c.nome_razao_social || '').replace(/"/g, '""')}"`,
      `"${(c.nome_fantasia || '').replace(/"/g, '""')}"`,
      `"${formatarDocumentoExibicao(c)}"`,
      `"${(c.inscricao_estadual || '').replace(/"/g, '""')}"`,
      `"${(c.municipio || '').replace(/"/g, '""')}"`,
      c.uf || '',
      `"${(c.telefone || c.celular || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.expand?.vendedor_id?.nome || '').replace(/"/g, '""')}"`,
      c.bloqueado ? 'Sim' : 'Não',
      c.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `clientes_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: 'O arquivo CSV de clientes foi baixado com sucesso.',
    })
  }

  const temFiltroAtivo =
    Boolean(busca) ||
    filtroTipoPessoa !== 'todos' ||
    filtroUf !== 'todos' ||
    Boolean(filtroCidade) ||
    filtroVendedor !== 'todos' ||
    filtroSituacao !== 'ativos' ||
    filtroBloqueado !== 'todos'

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clientes</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cadastro completo de clientes para faturamento, NF-e, NFC-e e SPED Fiscal
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <Download size={14} className="mr-1.5" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalRapidoAberto(true)}
                className="text-xs h-9 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <UserPlus size={14} className="mr-1.5" />
                Cadastro Rápido
              </Button>

              <Button
                size="sm"
                onClick={() => navigate('/cadastros/clientes/novo')}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <Plus size={15} className="mr-1.5" />
                Novo Cliente
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <form onSubmit={dispararFiltros} className="space-y-2.5">
          {/* Linha 1: Busca principal */}
          <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={15}
              />
              <Input
                type="text"
                placeholder="Buscar por nome/razão social, CPF/CNPJ, telefone ou código..."
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="w-full md:w-56">
              <Input
                type="text"
                placeholder="Filtrar por cidade..."
                value={filtroCidadeInput}
                onChange={(e) => setFiltroCidadeInput(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <Button type="submit" size="sm" variant="secondary" className="text-xs h-9 px-3">
              <Filter size={14} className="mr-1.5" />
              Filtrar
            </Button>

            {temFiltroAtivo && (
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

          {/* Linha 2: Filtros secundários */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1 border-t border-slate-100">
            {/* Tipo de Pessoa */}
            <div>
              <Select
                value={filtroTipoPessoa}
                onValueChange={(val) => {
                  setFiltroTipoPessoa(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tipo de Pessoa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Física">Pessoa Física</SelectItem>
                  <SelectItem value="Jurídica">Pessoa Jurídica</SelectItem>
                  <SelectItem value="Estrangeiro">Estrangeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* UF */}
            <div>
              <Select
                value={filtroUf}
                onValueChange={(val) => {
                  setFiltroUf(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as UFs</SelectItem>
                  {UFS_BRASIL.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendedor */}
            <div>
              <Select
                value={filtroVendedor}
                onValueChange={(val) => {
                  setFiltroVendedor(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os vendedores</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bloqueado */}
            <div>
              <Select
                value={filtroBloqueado}
                onValueChange={(val: 'todos' | 'sim' | 'nao') => {
                  setFiltroBloqueado(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Bloqueio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os bloqueios</SelectItem>
                  <SelectItem value="sim">Bloqueados</SelectItem>
                  <SelectItem value="nao">Desbloqueados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Situação */}
            <div>
              <Select
                value={filtroSituacao}
                onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                  setFiltroSituacao(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativos">Somente Ativos</SelectItem>
                  <SelectItem value="inativos">Somente Inativos</SelectItem>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
      </div>

      {/* Tabela de Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold select-none">
                <th
                  onClick={() => alternarOrdem('codigo')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors w-16"
                >
                  <div className="flex items-center gap-1">
                    <span>Cód.</span>
                    {renderIconeOrdenacao('codigo')}
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('nome_razao_social')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Nome / Razão Social</span>
                    {renderIconeOrdenacao('nome_razao_social')}
                  </div>
                </th>
                <th className="py-3 px-4 w-36">CPF / CNPJ</th>
                <th
                  onClick={() => alternarOrdem('municipio')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors w-40"
                >
                  <div className="flex items-center gap-1">
                    <span>Cidade / UF</span>
                    {renderIconeOrdenacao('municipio')}
                  </div>
                </th>
                <th className="py-3 px-3 w-32">Telefone</th>
                <th className="py-3 px-2 text-center w-24">Bloqueado</th>
                <th
                  onClick={() => alternarOrdem('ativo')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-center w-20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Situação</span>
                    {renderIconeOrdenacao('ativo')}
                  </div>
                </th>
                <th className="py-3 px-3 text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-blue-600" size={20} />
                      <span>Carregando clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <UserCheck className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-medium text-slate-700">Nenhum cliente encontrado</p>
                    <p className="text-slate-400 mt-1">
                      {temFiltroAtivo
                        ? 'Tente ajustar os filtros de busca para encontrar registros.'
                        : 'Comece adicionando seu primeiro cliente ao sistema.'}
                    </p>
                    {podeCriar && !temFiltroAtivo && (
                      <Button
                        size="sm"
                        onClick={() => navigate('/cadastros/clientes/novo')}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Cadastrar Cliente
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors group text-slate-700"
                  >
                    <td className="py-3 px-3 font-mono font-medium text-slate-600">{c.codigo}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {c.tipo_pessoa === 'Física' && (
                            <User size={13} className="text-slate-400 flex-shrink-0" />
                          )}
                          {c.tipo_pessoa === 'Jurídica' && (
                            <Building2 size={13} className="text-blue-500 flex-shrink-0" />
                          )}
                          {c.tipo_pessoa === 'Estrangeiro' && (
                            <Globe2 size={13} className="text-emerald-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                            {c.nome_razao_social}
                          </span>
                        </div>
                        {c.nome_fantasia && (
                          <span className="text-[11px] text-slate-400 ml-4">{c.nome_fantasia}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {formatarDocumentoExibicao(c)}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {c.municipio ? `${c.municipio}/${c.uf || ''}` : c.uf || '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {c.celular || c.telefone
                        ? formatarTelefone(c.celular || c.telefone || '')
                        : '-'}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {c.bloqueado ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] px-1.5 py-0 font-medium inline-flex items-center gap-0.5"
                          title={c.motivo_bloqueio || 'Vendas bloqueadas'}
                        >
                          <Lock size={10} />
                          Bloqueado
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge
                        variant={c.ativo ? 'default' : 'secondary'}
                        className={`text-[10px] font-medium px-2 py-0 ${
                          c.ativo
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-none'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-none'
                        }`}
                      >
                        {c.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/cadastros/clientes/${c.id}/editar`)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar cliente"
                          >
                            <Edit size={14} />
                          </Button>
                        )}

                        {podeInativar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirConfirmacaoSituacao(c)}
                            className={`h-7 w-7 ${
                              c.ativo
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={c.ativo ? 'Inativar cliente' : 'Reativar cliente'}
                          >
                            {c.ativo ? <Power size={14} /> : <RotateCcw size={14} />}
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

        {/* Rodapé e Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-500 gap-3">
          <div>
            Exibindo{' '}
            <span className="font-medium text-slate-700">
              {clientes.length > 0 ? (pagina - 1) * 20 + 1 : 0}
            </span>{' '}
            a{' '}
            <span className="font-medium text-slate-700">{Math.min(pagina * 20, totalItems)}</span>{' '}
            de <span className="font-medium text-slate-700">{totalItems}</span> registros
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1 || carregando}
              onClick={() => setPagina((p) => Math.max(p - 1, 1))}
              className="h-7 text-xs px-2.5"
            >
              Anterior
            </Button>
            <span className="px-2 font-medium text-slate-700">
              Página {pagina} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPages || carregando}
              onClick={() => setPagina((p) => Math.min(p + 1, totalPages))}
              className="h-7 text-xs px-2.5"
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Inativação / Reativação */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">
              {clienteAlvo?.ativo ? 'Inativar Cliente' : 'Reativar Cliente'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {clienteAlvo?.ativo
                ? `Tem certeza que deseja inativar o cliente "${clienteAlvo?.nome_razao_social}"? O registro não será apagado e poderá ser reativado a qualquer momento.`
                : `Tem certeza que deseja reativar o cliente "${clienteAlvo?.nome_razao_social}"?`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2 flex sm:justify-end gap-2">
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
              className={`text-xs font-medium text-white ${
                clienteAlvo?.ativo
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {processandoAcao ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : clienteAlvo?.ativo ? (
                'Inativar'
              ) : (
                'Reativar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro Rápido */}
      <ClienteCadastroRapido
        aberto={modalRapidoAberto}
        onOpenChange={setModalRapidoAberto}
        onSucesso={() => {
          carregarDados()
        }}
      />
    </div>
  )
}
export default ClientesLista
