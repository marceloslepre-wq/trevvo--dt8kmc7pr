import React, { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import {
  FileCode,
  Plus,
  Search,
  Download,
  Upload,
  Edit2,
  Power,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Info,
  Check,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  CodigoFiscal,
  TIPOS_TABELAS_FISCAIS,
  TipoTabelaFiscal,
  listarCodigosFiscais,
  salvarCodigoFiscal,
  inativarCodigoFiscal,
  ativarCodigoFiscal,
  analisarCSV,
  executarImportacaoCSV,
  ResumoImportacaoCSV,
} from '@/services/tabelasFiscais'

export const CodigosFiscaisPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const { toast } = useToast()
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tipo ativo na navegação lateral / tabs
  const [tipoAtivo, setTipoAtivo] = useState<string>('ORIGEM')

  // Estados de listagem
  const [codigos, setCodigos] = useState<CodigoFiscal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [ordenacao, setOrdenacao] = useState<string>('codigo')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Estados do Modal de Cadastro / Edição
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [tipoForm, setTipoForm] = useState<string>('ORIGEM')
  const [codigoForm, setCodigoForm] = useState('')
  const [descricaoForm, setDescricaoForm] = useState('')
  const [observacaoForm, setObservacaoForm] = useState('')
  const [errosForm, setErrosForm] = useState<{
    tipo?: string
    codigo?: string
    descricao?: string
  }>({})

  // Estados de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<CodigoFiscal | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<CodigoFiscal | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Estados de Importação CSV
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [analisandoCSV, setAnalisandoCSV] = useState(false)
  const [importandoCSV, setImportandoCSV] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacaoCSV | null>(null)
  const [progressoImportacao, setProgressoImportacao] = useState<{
    processados: number
    total: number
  } | null>(null)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarCodigosFiscais({
        tipo: tipoAtivo,
        busca,
        situacao,
        ordenacao,
        page: pagina,
        perPage: 20,
      })
      setCodigos(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar códigos fiscais'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [tipoAtivo, busca, situacao, ordenacao, pagina, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const tipoInfo = TIPOS_TABELAS_FISCAIS.find((t) => t.tipo === tipoAtivo)

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
    setTipoForm(tipoAtivo === 'TODOS' ? 'ORIGEM' : tipoAtivo)
    setCodigoForm('')
    setDescricaoForm('')
    setObservacaoForm('')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: CodigoFiscal) => {
    setEditandoId(item.id)
    setTipoForm(item.tipo)
    setCodigoForm(item.codigo)
    setDescricaoForm(item.descricao)
    setObservacaoForm(item.observacao || '')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novosErros: { tipo?: string; codigo?: string; descricao?: string } = {}

    const codLimpo = codigoForm.trim()
    const descLimpa = descricaoForm.trim()

    if (!tipoForm) novosErros.tipo = 'Selecione o tipo da tabela.'
    if (!codLimpo) novosErros.codigo = 'O código é obrigatório.'
    if (!descLimpa) novosErros.descricao = 'A descrição é obrigatória.'

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      await salvarCodigoFiscal({
        id: editandoId || undefined,
        tipo: tipoForm,
        codigo: codLimpo,
        descricao: descLimpa,
        observacao: observacaoForm.trim(),
      })

      toast({
        title: editandoId ? 'Código atualizado' : 'Código cadastrado',
        description: `O código "${codLimpo}" foi gravado com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar código fiscal'
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
      await inativarCodigoFiscal(itemParaInativar.id)
      toast({
        title: 'Código fiscal inativado',
        description: `O código "${itemParaInativar.codigo}" foi inativado.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar código'
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
      await ativarCodigoFiscal(itemParaAtivar.id)
      toast({
        title: 'Código reativado',
        description: `O código "${itemParaAtivar.codigo}" está ativo novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar código'
      toast({
        title: 'Falha na operação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Exportação CSV
  const exportarCSV = () => {
    if (codigos.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = ['Tipo', 'Código', 'Descrição', 'Observação', 'Situação']
    const linhas = codigos.map((c) => [
      `"${c.tipo}"`,
      `"${c.codigo}"`,
      `"${c.descricao.replace(/"/g, '""')}"`,
      `"${(c.observacao || '').replace(/"/g, '""')}"`,
      c.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `codigos_fiscais_${tipoAtivo.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download do arquivo foi iniciado com sucesso.',
    })
  }

  // Importação CSV: leitura de arquivo
  const handleSelecionarArquivoCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalisandoCSV(true)
    setResumoImportacao(null)
    setProgressoImportacao(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const conteudo = event.target?.result as string
        const resultado = await analisarCSV(conteudo)
        setResumoImportacao(resultado)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo'
        toast({
          title: 'Erro na leitura do arquivo',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        setAnalisandoCSV(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      toast({
        title: 'Erro ao ler arquivo',
        description: 'Não foi possível ler o arquivo selecionado.',
        variant: 'destructive',
      })
      setAnalisandoCSV(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    reader.readAsText(file, 'utf-8')
  }

  const handleConfirmarImportacao = async () => {
    if (!resumoImportacao || resumoImportacao.itensValidos.length === 0) return

    setImportandoCSV(true)
    try {
      const res = await executarImportacaoCSV(
        resumoImportacao.itensValidos,
        (processados, total) => {
          setProgressoImportacao({ processados, total })
        },
      )

      toast({
        title: 'Importação concluída com sucesso',
        description: `${res.inseridos} novo(s) código(s) incluído(s) e ${res.atualizados} atualizado(s).`,
      })
      setModalImportarAberto(false)
      setResumoImportacao(null)
      setProgressoImportacao(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao importar códigos'
      toast({
        title: 'Falha na importação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setImportandoCSV(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCode className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Códigos Fiscais</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Tabelas auxiliares tributárias (CST, CSOSN, CFOP, Origem, PIS/COFINS, SPED, IBS/CBS).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={exportarCSV}
            className="text-slate-700 border-slate-300 hover:bg-slate-50"
          >
            <Download className="mr-2 h-4 w-4 text-slate-500" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              variant="outline"
              onClick={() => {
                setResumoImportacao(null)
                setProgressoImportacao(null)
                setModalImportarAberto(true)
              }}
              className="text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              <Upload className="mr-2 h-4 w-4 text-slate-500" />
              Importar CSV
            </Button>
          )}

          {podeCriar && (
            <Button onClick={handleAbrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Novo Código
            </Button>
          )}
        </div>
      </div>

      {/* Grid com Seleção Lateral por Tipo + Conteúdo */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Painel lateral de Tipos */}
        <Card className="lg:col-span-1 border-slate-200 shadow-xs">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tabelas Fiscais
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-400">
              Selecione uma tabela para filtrar os códigos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            <button
              onClick={() => {
                setTipoAtivo('TODOS')
                setPagina(1)
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-between ${
                tipoAtivo === 'TODOS'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>Todos os Tipos</span>
            </button>

            {TIPOS_TABELAS_FISCAIS.map((t) => {
              const selecionado = tipoAtivo === t.tipo
              return (
                <button
                  key={t.tipo}
                  onClick={() => {
                    setTipoAtivo(t.tipo)
                    setPagina(1)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    selecionado
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{t.titulo}</span>
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        selecionado ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t.tipo}
                    </span>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* Tabela de Códigos */}
        <Card className="lg:col-span-3 border-slate-200 shadow-xs">
          <CardHeader className="p-4 sm:p-6 pb-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Informação do Tipo Selecionado */}
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {tipoInfo ? tipoInfo.titulo : 'Todos os Códigos Fiscais'}
                </h2>
                {tipoInfo?.descricao && (
                  <p className="text-xs text-slate-500">{tipoInfo.descricao}</p>
                )}
              </div>

              {/* Controles de Busca e Situação */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar código ou descrição..."
                    value={busca}
                    onChange={(e) => {
                      const val = e.target.value
                      startTransition(() => {
                        setBusca(val)
                        setPagina(1)
                      })
                    }}
                    className="pl-9 h-9 bg-slate-50/50 border-slate-200 text-xs w-full sm:w-64"
                  />
                </div>

                <Select
                  value={situacao}
                  onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                    setSituacao(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="w-32 h-9 text-xs">
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
                    {tipoAtivo === 'TODOS' && (
                      <th className="py-3 px-4 w-32">
                        <button
                          onClick={() => alternarOrdenacao('tipo')}
                          className="flex items-center gap-1.5 hover:text-slate-900 font-semibold"
                        >
                          Tipo
                          {renderIconeOrdenacao('tipo')}
                        </button>
                      </th>
                    )}
                    <th className="py-3 px-4 w-28">
                      <button
                        onClick={() => alternarOrdenacao('codigo')}
                        className="flex items-center gap-1.5 hover:text-slate-900 font-semibold"
                      >
                        Código
                        {renderIconeOrdenacao('codigo')}
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => alternarOrdenacao('descricao')}
                        className="flex items-center gap-1.5 hover:text-slate-900 font-semibold"
                      >
                        Descrição
                        {renderIconeOrdenacao('descricao')}
                      </button>
                    </th>
                    <th className="py-3 px-4 w-52">Observação</th>
                    <th className="py-3 px-4 w-24 text-center">
                      <button
                        onClick={() => alternarOrdenacao('ativo')}
                        className="flex items-center justify-center gap-1.5 w-full hover:text-slate-900 font-semibold"
                      >
                        Situação
                        {renderIconeOrdenacao('ativo')}
                      </button>
                    </th>
                    <th className="py-3 px-4 w-24 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carregando ? (
                    <tr>
                      <td
                        colSpan={tipoAtivo === 'TODOS' ? 6 : 5}
                        className="py-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                          <span className="text-xs">Carregando códigos fiscais...</span>
                        </div>
                      </td>
                    </tr>
                  ) : codigos.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tipoAtivo === 'TODOS' ? 6 : 5}
                        className="py-12 text-center text-slate-500"
                      >
                        Nenhum código fiscal encontrado nesta tabela para os filtros informados.
                      </td>
                    </tr>
                  ) : (
                    codigos.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 transition-colors group text-slate-700"
                      >
                        {tipoAtivo === 'TODOS' && (
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-600">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {item.tipo}
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-4 font-mono font-bold text-blue-700 text-sm">
                          <span className="bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded text-xs">
                            {item.codigo}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 leading-snug">
                          {item.descricao}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 leading-relaxed">
                          {item.observacao ? (
                            <span className="text-amber-700 bg-amber-50/70 px-2 py-0.5 rounded border border-amber-200/50 inline-block">
                              {item.observacao}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
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
                                title="Editar código"
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
                                  title="Inativar código"
                                >
                                  <Power className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setItemParaAtivar(item)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                  title="Reativar código"
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
                Mostrando {codigos.length} de {totalItens} códigos cadastrados
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
      </div>

      {/* Modal Formulário Inclusão / Edição */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editandoId ? 'Editar Código Fiscal' : 'Novo Código Fiscal'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastre ou atualize a descrição e observações do código fiscal conforme tabela
                SEFAZ / SPED.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="tipo" className="text-xs font-semibold text-slate-700">
                  Tipo da Tabela <span className="text-rose-600">*</span>
                </Label>
                <Select
                  value={tipoForm}
                  onValueChange={(val) => {
                    setTipoForm(val)
                    if (errosForm.tipo) setErrosForm((prev) => ({ ...prev, tipo: undefined }))
                  }}
                  disabled={Boolean(editandoId)}
                >
                  <SelectTrigger id="tipo" className="text-xs">
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_TABELAS_FISCAIS.map((t) => (
                      <SelectItem key={t.tipo} value={t.tipo}>
                        {t.titulo} ({t.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errosForm.tipo && (
                  <p className="text-xs text-rose-600 font-medium">{errosForm.tipo}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="codigo" className="text-xs font-semibold text-slate-700">
                  Código <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="codigo"
                  value={codigoForm}
                  onChange={(e) => {
                    setCodigoForm(e.target.value.trim())
                    if (errosForm.codigo) setErrosForm((prev) => ({ ...prev, codigo: undefined }))
                  }}
                  placeholder="Ex: 00, 101, 1..."
                  className="font-mono font-medium uppercase"
                  disabled={Boolean(editandoId)}
                  autoFocus={!editandoId}
                />
                {editandoId && (
                  <p className="text-[11px] text-slate-400">
                    O código faz parte da chave única (tipo + código) e não pode ser alterado após o
                    cadastro.
                  </p>
                )}
                {errosForm.codigo && (
                  <p className="text-xs text-rose-600 font-medium">{errosForm.codigo}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="descricao" className="text-xs font-semibold text-slate-700">
                  Descrição Oficial <span className="text-rose-600">*</span>
                </Label>
                <Textarea
                  id="descricao"
                  value={descricaoForm}
                  onChange={(e) => {
                    setDescricaoForm(e.target.value)
                    if (errosForm.descricao)
                      setErrosForm((prev) => ({ ...prev, descricao: undefined }))
                  }}
                  placeholder="Descrição completa do código tributário..."
                  rows={3}
                  className="text-xs resize-none"
                />
                {errosForm.descricao && (
                  <p className="text-xs text-rose-600 font-medium">{errosForm.descricao}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="observacao" className="text-xs font-semibold text-slate-700">
                  Observação Interna / Orientação
                </Label>
                <Input
                  id="observacao"
                  value={observacaoForm}
                  onChange={(e) => setObservacaoForm(e.target.value)}
                  placeholder="Ex: Conferir na tabela oficial..."
                  className="text-xs"
                />
                <p className="text-[11px] text-slate-400">
                  Campo opcional para orientar os operadores fiscais do ERP.
                </p>
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
                  'Salvar Código'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação CSV com Resumo */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                Importar Códigos Fiscais via CSV
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Faça upload de uma planilha CSV no padrão{' '}
              <strong className="text-slate-700 font-mono">tipo;codigo;descricao;observacao</strong>
              . O sistema incluirá novos códigos ou atualizará a descrição dos códigos já
              cadastrados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Input de Arquivo */}
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleSelecionarArquivoCSV}
                className="hidden"
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer space-y-2 block">
                <Upload className="mx-auto h-8 w-8 text-blue-600" />
                <div className="text-sm font-semibold text-slate-700">
                  Clique para selecionar o arquivo CSV
                </div>
                <div className="text-xs text-slate-400">
                  Colunas separadas por ponto e vírgula (;) ou vírgula (,)
                </div>
              </label>
            </div>

            {analisandoCSV && (
              <div className="py-6 flex items-center justify-center gap-2 text-blue-600 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analisando linhas do CSV e comparando com a base existente...</span>
              </div>
            )}

            {/* Resumo da Análise Prévia */}
            {resumoImportacao && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                    <span className="text-xs text-slate-500 font-medium">Lidos no arquivo</span>
                    <div className="text-xl font-bold text-slate-800">
                      {resumoImportacao.totalLidos}
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                    <span className="text-xs text-emerald-700 font-medium">Novos a incluir</span>
                    <div className="text-xl font-bold text-emerald-800">
                      {resumoImportacao.novos}
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                    <span className="text-xs text-blue-700 font-medium">
                      Existentes a atualizar
                    </span>
                    <div className="text-xl font-bold text-blue-800">
                      {resumoImportacao.atualizados}
                    </div>
                  </div>
                </div>

                {/* Avisos de erros se houver */}
                {resumoImportacao.erros.length > 0 && (
                  <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1 max-h-36 overflow-y-auto">
                    <div className="font-semibold flex items-center gap-1.5 text-rose-900">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{resumoImportacao.erros.length} erro(s) encontrado(s) no arquivo:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {resumoImportacao.erros.map((e, idx) => (
                        <li key={idx}>
                          Linha {e.linha}: {e.mensagem}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Exemplo dos primeiros itens válidos */}
                {resumoImportacao.itensValidos.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700">
                      Prévia dos registros ({Math.min(5, resumoImportacao.itensValidos.length)} de{' '}
                      {resumoImportacao.itensValidos.length}):
                    </span>
                    <div className="border border-slate-200 rounded-md overflow-hidden text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                          <tr>
                            <th className="py-1.5 px-3">Tipo</th>
                            <th className="py-1.5 px-3">Código</th>
                            <th className="py-1.5 px-3">Descrição</th>
                            <th className="py-1.5 px-3">Observação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {resumoImportacao.itensValidos.slice(0, 5).map((it, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-1 px-3 font-mono text-slate-600">{it.tipo}</td>
                              <td className="py-1 px-3 font-mono font-bold text-blue-700">
                                {it.codigo}
                              </td>
                              <td className="py-1 px-3 truncate max-w-[200px]">{it.descricao}</td>
                              <td className="py-1 px-3 text-slate-400 truncate max-w-[150px]">
                                {it.observacao || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Barra de Progresso da Importação */}
            {importandoCSV && progressoImportacao && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Importando registros...</span>
                  <span className="font-semibold">
                    {progressoImportacao.processados} / {progressoImportacao.total}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-150"
                    style={{
                      width: `${(progressoImportacao.processados / progressoImportacao.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalImportarAberto(false)}
              disabled={importandoCSV}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmarImportacao}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={
                importandoCSV || !resumoImportacao || resumoImportacao.itensValidos.length === 0
              }
            >
              {importandoCSV ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                `Confirmar Importação (${resumoImportacao?.itensValidos.length || 0})`
              )}
            </Button>
          </DialogFooter>
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
              <AlertDialogTitle>Inativar Código Fiscal</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja realmente inativar o código{' '}
              <strong className="text-slate-900">
                [{itemParaInativar?.tipo}] {itemParaInativar?.codigo} -{' '}
                {itemParaInativar?.descricao}
              </strong>
              ? Ele não aparecerá mais nos seletores de novos produtos e notas fiscais.
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
              <AlertDialogTitle>Reativar Código Fiscal</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja reativar o código{' '}
              <strong className="text-slate-900">
                [{itemParaAtivar?.tipo}] {itemParaAtivar?.codigo} - {itemParaAtivar?.descricao}
              </strong>
              ? Ele voltará a ficar disponível para emissão fiscal e regras de tributação.
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

export default CodigosFiscaisPage
