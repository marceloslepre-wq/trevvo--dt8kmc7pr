import React, { useState, useEffect, useCallback, useTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck,
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
  Building2,
  User,
  Globe2,
} from 'lucide-react'
import {
  Fornecedor,
  listarFornecedores,
  inativarFornecedor,
  ativarFornecedor,
  ListarFornecedoresParams,
  TipoFornecedor,
} from '@/services/fornecedores'
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

const TIPOS_FORNECEDOR: TipoFornecedor[] = [
  'Mercadorias',
  'Serviços',
  'Transportadora',
  'Uso e consumo',
  'Outros',
]

const CRTS_FORNECEDOR = [
  { valor: '1', label: '1 - Simples Nacional' },
  { valor: '2', label: '2 - Simples sublimite' },
  { valor: '3', label: '3 - Regime Normal' },
  { valor: '4', label: '4 - MEI' },
]

export const FornecedoresLista: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()

  const podeCriar = pode('fornecedores', 'criar')
  const podeEditar = pode('fornecedores', 'editar')
  const podeInativar = pode('fornecedores', 'excluir')

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [buscaInput, setBuscaInput] = useState('')
  const [filtroTipoPessoa, setFiltroTipoPessoa] = useState<string>('todos')
  const [filtroUf, setFiltroUf] = useState<string>('todos')
  const [filtroCrt, setFiltroCrt] = useState<string>('todos')
  const [filtroTipoFornecedor, setFiltroTipoFornecedor] = useState<string>('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Paginação e Ordenação
  const [pagina, setPagina] = useState(1)
  const [ordenarPor, setOrdenarPor] = useState('codigo')
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('desc')

  // Inativação / Reativação
  const [fornecedorAlvo, setFornecedorAlvo] = useState<Fornecedor | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  const [, startTransition] = useTransition()

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const params: ListarFornecedoresParams = {
        pagina,
        porPagina: 20,
        busca,
        tipo_pessoa: filtroTipoPessoa,
        uf: filtroUf,
        crt_fornecedor: filtroCrt,
        tipo_fornecedor: filtroTipoFornecedor,
        situacao: filtroSituacao,
        ordenarPor,
        ordem,
      }
      const res = await listarFornecedores(params)
      setFornecedores(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages || 1)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao listar fornecedores',
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
    filtroCrt,
    filtroTipoFornecedor,
    filtroSituacao,
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
    setPagina(1)
  }

  const limparFiltros = () => {
    setBusca('')
    setBuscaInput('')
    setFiltroTipoPessoa('todos')
    setFiltroUf('todos')
    setFiltroCrt('todos')
    setFiltroTipoFornecedor('todos')
    setFiltroSituacao('ativos')
    setPagina(1)
  }

  const abrirConfirmacaoSituacao = (fornecedor: Fornecedor) => {
    setFornecedorAlvo(fornecedor)
    setDialogAberto(true)
  }

  const confirmarAcaoSituacao = async () => {
    if (!fornecedorAlvo) return
    const novoStatus = !fornecedorAlvo.ativo

    try {
      setProcessandoAcao(true)
      if (novoStatus) {
        await ativarFornecedor(fornecedorAlvo.id)
      } else {
        await inativarFornecedor(fornecedorAlvo.id)
      }

      toast({
        title: novoStatus ? 'Fornecedor ativado' : 'Fornecedor inativado',
        description: `O fornecedor "${fornecedorAlvo.razao_social}" foi ${
          novoStatus ? 'ativado' : 'inativado'
        } com sucesso.`,
      })

      setDialogAberto(false)
      setFornecedorAlvo(null)
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

  const formatarDocumentoExibicao = (f: Fornecedor) => {
    if (f.tipo_pessoa === 'Estrangeiro') {
      return f.id_estrangeiro || '-'
    }
    if (!f.cpf_cnpj) return '-'
    if (f.tipo_pessoa === 'Física') {
      return formatarCPF(f.cpf_cnpj)
    }
    return formatarCNPJ(f.cpf_cnpj)
  }

  const exportarCSV = () => {
    if (fornecedores.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros exibidos com os filtros atuais.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Tipo de Pessoa',
      'Razão Social',
      'Nome Fantasia',
      'CPF / CNPJ / Doc',
      'Inscrição Estadual',
      'CRT',
      'Tipo(s) Fornecedor',
      'Produtor Rural',
      'Município',
      'UF',
      'Telefone',
      'E-mail',
      'Banco',
      'Agência/Conta',
      'Chave PIX',
      'Situação',
    ]

    const linhas = fornecedores.map((f) => [
      f.codigo,
      f.tipo_pessoa,
      `"${(f.razao_social || '').replace(/"/g, '""')}"`,
      `"${(f.nome_fantasia || '').replace(/"/g, '""')}"`,
      `"${formatarDocumentoExibicao(f)}"`,
      `"${(f.inscricao_estadual || '').replace(/"/g, '""')}"`,
      f.crt_fornecedor || '',
      `"${(f.tipo_fornecedor ? f.tipo_fornecedor.join(', ') : '').replace(/"/g, '""')}"`,
      f.produtor_rural ? 'Sim' : 'Não',
      `"${(f.municipio || '').replace(/"/g, '""')}"`,
      f.uf || '',
      `"${(f.telefone || f.celular || '').replace(/"/g, '""')}"`,
      `"${(f.email || '').replace(/"/g, '""')}"`,
      `"${(f.banco_nome || f.banco_codigo || '').replace(/"/g, '""')}"`,
      `"${`${f.agencia || ''} / ${f.conta || ''}`.replace(/"/g, '""')}"`,
      `"${(f.pix_chave || '').replace(/"/g, '""')}"`,
      f.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `fornecedores_export_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: 'O arquivo CSV de fornecedores foi baixado com sucesso.',
    })
  }

  const temFiltroAtivo =
    Boolean(busca) ||
    filtroTipoPessoa !== 'todos' ||
    filtroUf !== 'todos' ||
    filtroCrt !== 'todos' ||
    filtroTipoFornecedor !== 'todos' ||
    filtroSituacao !== 'ativos'

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Fornecedores</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cadastro de fornecedores para entrada de notas fiscais, contas a pagar e SPED (registro
            0150)
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
            <Button
              size="sm"
              onClick={() => navigate('/cadastros/fornecedores/novo')}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              <Plus size={15} className="mr-1.5" />
              Novo Fornecedor
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <form onSubmit={dispararFiltros} className="space-y-2.5">
          {/* Linha 1: Busca principal */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={15}
              />
              <Input
                type="text"
                placeholder="Buscar por razão social, nome fantasia, CNPJ/CPF, telefone ou código..."
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                className="pl-9 text-xs h-9"
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
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1 border-t border-slate-100">
            {/* Tipo de Fornecedor */}
            <div>
              <Select
                value={filtroTipoFornecedor}
                onValueChange={(val) => {
                  setFiltroTipoFornecedor(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tipo Fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos de fornecedor</SelectItem>
                  {TIPOS_FORNECEDOR.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
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

            {/* CRT */}
            <div>
              <Select
                value={filtroCrt}
                onValueChange={(val) => {
                  setFiltroCrt(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="CRT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os regimes (CRT)</SelectItem>
                  {CRTS_FORNECEDOR.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  <SelectItem value="todos">Todas as pessoas</SelectItem>
                  <SelectItem value="Física">Pessoa Física</SelectItem>
                  <SelectItem value="Jurídica">Pessoa Jurídica</SelectItem>
                  <SelectItem value="Estrangeiro">Estrangeiro</SelectItem>
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
                  onClick={() => alternarOrdem('razao_social')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Razão Social / Fantasia</span>
                    {renderIconeOrdenacao('razao_social')}
                  </div>
                </th>
                <th className="py-3 px-4 w-36">CNPJ / CPF</th>
                <th
                  onClick={() => alternarOrdem('municipio')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors w-36"
                >
                  <div className="flex items-center gap-1">
                    <span>Cidade / UF</span>
                    {renderIconeOrdenacao('municipio')}
                  </div>
                </th>
                <th className="py-3 px-3 w-32">Telefone</th>
                <th className="py-3 px-3 w-40">Tipo(s)</th>
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
                      <span>Carregando fornecedores...</span>
                    </div>
                  </td>
                </tr>
              ) : fornecedores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Truck className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-medium text-slate-700">Nenhum fornecedor encontrado</p>
                    <p className="text-slate-400 mt-1">
                      {temFiltroAtivo
                        ? 'Tente ajustar os filtros de busca para encontrar registros.'
                        : 'Comece adicionando seu primeiro fornecedor ao ERP.'}
                    </p>
                    {podeCriar && !temFiltroAtivo && (
                      <Button
                        size="sm"
                        onClick={() => navigate('/cadastros/fornecedores/novo')}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Cadastrar Fornecedor
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                fornecedores.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-slate-50/80 transition-colors group text-slate-700"
                  >
                    <td className="py-3 px-3 font-mono font-medium text-slate-600">{f.codigo}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {f.tipo_pessoa === 'Física' && (
                            <User size={13} className="text-slate-400 flex-shrink-0" />
                          )}
                          {f.tipo_pessoa === 'Jurídica' && (
                            <Building2 size={13} className="text-blue-500 flex-shrink-0" />
                          )}
                          {f.tipo_pessoa === 'Estrangeiro' && (
                            <Globe2 size={13} className="text-emerald-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                            {f.razao_social}
                          </span>
                          {f.produtor_rural && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200"
                            >
                              Rural
                            </Badge>
                          )}
                        </div>
                        {f.nome_fantasia && (
                          <span className="text-[11px] text-slate-400 ml-4">{f.nome_fantasia}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {formatarDocumentoExibicao(f)}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {f.municipio ? `${f.municipio}/${f.uf || ''}` : f.uf || '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {f.telefone || f.celular
                        ? formatarTelefone(f.telefone || f.celular || '')
                        : '-'}
                    </td>
                    <td className="py-3 px-3">
                      {f.tipo_fornecedor && f.tipo_fornecedor.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {f.tipo_fornecedor.map((tf) => (
                            <Badge
                              key={tf}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal bg-slate-100 text-slate-700 border-slate-200"
                            >
                              {tf}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge
                        variant={f.ativo ? 'default' : 'secondary'}
                        className={`text-[10px] font-medium px-2 py-0 ${
                          f.ativo
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-none'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-none'
                        }`}
                      >
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/cadastros/fornecedores/${f.id}/editar`)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar fornecedor"
                          >
                            <Edit size={14} />
                          </Button>
                        )}

                        {podeInativar && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirConfirmacaoSituacao(f)}
                            className={`h-7 w-7 ${
                              f.ativo
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={f.ativo ? 'Inativar fornecedor' : 'Reativar fornecedor'}
                          >
                            {f.ativo ? <Power size={14} /> : <RotateCcw size={14} />}
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
              {fornecedores.length > 0 ? (pagina - 1) * 20 + 1 : 0}
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
              {fornecedorAlvo?.ativo ? 'Inativar Fornecedor' : 'Reativar Fornecedor'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {fornecedorAlvo?.ativo
                ? `Tem certeza que deseja inativar o fornecedor "${fornecedorAlvo?.razao_social}"? O registro não será apagado e poderá ser reativado a qualquer momento.`
                : `Tem certeza que deseja reativar o fornecedor "${fornecedorAlvo?.razao_social}"?`}
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
                fornecedorAlvo?.ativo
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {processandoAcao ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : fornecedorAlvo?.ativo ? (
                'Inativar'
              ) : (
                'Reativar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FornecedoresLista
