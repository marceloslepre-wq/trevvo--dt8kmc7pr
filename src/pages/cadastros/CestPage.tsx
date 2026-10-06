import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Layers,
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
  X,
  FileCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  Cest,
  listarCest,
  salvarCest,
  inativarCest,
  ativarCest,
  formatarCodigoCest,
  normalizarCodigoCest,
  normalizarListaNcm,
  analisarCSVCest,
  executarImportacaoCestEmLotes,
  ResumoImportacaoCest,
} from '@/services/cest'

export const CestPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados de listagem
  const [cests, setCests] = useState<Cest[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [ncmFiltro, setNcmFiltro] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [ordenacao, setOrdenacao] = useState<string>('codigo')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalItens, setTotalItens] = useState(0)

  // Estados do Modal de Cadastro / Edição
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [codigoForm, setCodigoForm] = useState('')
  const [ncmCodigosForm, setNcmCodigosForm] = useState('')
  const [segmentoForm, setSegmentoForm] = useState('')
  const [itemForm, setItemForm] = useState('')
  const [descricaoForm, setDescricaoForm] = useState('')
  const [errosForm, setErrosForm] = useState<{ codigo?: string; descricao?: string }>({})

  // Estados de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<Cest | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<Cest | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Estados de Importação CSV
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [analisandoCSV, setAnalisandoCSV] = useState(false)
  const [importandoLotes, setImportandoLotes] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacaoCest | null>(null)
  const [progresso, setProgresso] = useState<{
    processados: number
    total: number
    stats: { inseridos: number; atualizados: number }
  } | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState<{
    inseridos: number
    atualizados: number
    erros: number
  } | null>(null)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarCest({
        busca,
        ncmFiltro,
        situacao,
        ordenacao,
        page: pagina,
        perPage: 20,
      })
      setCests(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar CESTs'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, ncmFiltro, situacao, ordenacao, pagina, toast])

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
    setCodigoForm('')
    setNcmCodigosForm('')
    setSegmentoForm('')
    setItemForm('')
    setDescricaoForm('')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: Cest) => {
    setEditandoId(item.id)
    setCodigoForm(formatarCodigoCest(item.codigo))
    setNcmCodigosForm(item.ncm_codigos || '')
    setSegmentoForm(item.segmento || '')
    setItemForm(item.item || '')
    setDescricaoForm(item.descricao)
    setErrosForm({})
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novosErros: { codigo?: string; descricao?: string } = {}

    const codLimpo = normalizarCodigoCest(codigoForm)
    const descLimpa = descricaoForm.trim()

    if (!codLimpo) {
      novosErros.codigo = 'O código CEST é obrigatório.'
    } else if (codLimpo.length !== 7) {
      novosErros.codigo = 'O CEST deve ter 7 dígitos numéricos.'
    }

    if (!descLimpa) {
      novosErros.descricao = 'A descrição do CEST é obrigatória.'
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      await salvarCest({
        id: editandoId || undefined,
        codigo: codLimpo,
        ncm_codigos: normalizarListaNcm(ncmCodigosForm),
        segmento: segmentoForm.trim(),
        item: itemForm.trim(),
        descricao: descLimpa,
      })

      toast({
        title: editandoId ? 'CEST atualizado' : 'CEST cadastrado',
        description: `O CEST "${formatarCodigoCest(codLimpo)}" foi gravado com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar CEST'
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
      await inativarCest(itemParaInativar.id)
      toast({
        title: 'CEST inativado',
        description: `O CEST "${formatarCodigoCest(itemParaInativar.codigo)}" foi inativado.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar CEST'
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
      await ativarCest(itemParaAtivar.id)
      toast({
        title: 'CEST reativado',
        description: `O CEST "${formatarCodigoCest(itemParaAtivar.codigo)}" está ativo novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar CEST'
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
    if (cests.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Código Formatado',
      'NCMs Relacionados',
      'Segmento',
      'Item',
      'Descrição',
      'Situação',
    ]
    const linhas = cests.map((c) => [
      `"${c.codigo}"`,
      `"${formatarCodigoCest(c.codigo)}"`,
      `"${(c.ncm_codigos || '').replace(/"/g, '""')}"`,
      `"${(c.segmento || '').replace(/"/g, '""')}"`,
      `"${(c.item || '').replace(/"/g, '""')}"`,
      `"${c.descricao.replace(/"/g, '""')}"`,
      c.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cest_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download foi iniciado com sucesso.',
    })
  }

  // Importação CSV: leitura de arquivo
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalisandoCSV(true)
    setResumoImportacao(null)
    setProgresso(null)
    setResultadoFinal(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const conteudo = event.target?.result as string
        const resultado = await analisarCSVCest(conteudo)
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

    setImportandoLotes(true)
    try {
      const res = await executarImportacaoCestEmLotes(
        resumoImportacao.itensValidos,
        (processados, total, stats) => {
          setProgresso({ processados, total, stats })
        },
      )

      setResultadoFinal(res)
      toast({
        title: 'Importação concluída',
        description: `${res.inseridos} CEST(s) inserido(s) e ${res.atualizados} atualizado(s).`,
      })
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro durante o processamento em lote'
      toast({
        title: 'Falha na importação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setImportandoLotes(false)
    }
  }

  const porcentagemProgresso =
    progresso && progresso.total > 0
      ? Math.round((progresso.processados / progresso.total) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">CEST</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Código Especificador da Substituição Tributária vinculado a NCMs e segmentos oficiais.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={carregando || cests.length === 0}
            className="text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          {podeCriar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResumoImportacao(null)
                setProgresso(null)
                setResultadoFinal(null)
                setModalImportarAberto(true)
              }}
              className="text-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Importar CEST
            </Button>
          )}

          {podeCriar && (
            <Button
              size="sm"
              onClick={handleAbrirNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Novo CEST
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca com busca inteligente por NCM */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-1">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por código CEST ou descrição..."
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                    setPagina(1)
                  }}
                  className="pl-9 text-xs"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusca('')
                      setPagina(1)
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="relative w-full sm:w-60">
                <FileCode className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Filtrar por NCM (exato ou prefixo)..."
                  value={ncmFiltro}
                  onChange={(e) => {
                    setNcmFiltro(e.target.value)
                    setPagina(1)
                  }}
                  className="pl-9 text-xs font-mono"
                />
                {ncmFiltro && (
                  <button
                    type="button"
                    onClick={() => {
                      setNcmFiltro('')
                      setPagina(1)
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Select
                value={situacao}
                onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                  setSituacao(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="w-32 text-xs h-9">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativos">Apenas Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de CESTs */}
      <Card className="border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-32"
                  onClick={() => alternarOrdenacao('codigo')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Código CEST</span>
                    {renderIconeOrdenacao('codigo')}
                  </div>
                </th>
                <th className="py-3 px-3 w-48">NCMs / Prefixos</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => alternarOrdenacao('descricao')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Descrição / Segmento</span>
                    {renderIconeOrdenacao('descricao')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center w-20">Item</th>
                <th className="py-3 px-3 text-center w-24">Situação</th>
                <th className="py-3 px-4 text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Carregando tabela CEST...
                  </td>
                </tr>
              ) : cests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="max-w-xs mx-auto">
                      <Layers className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-700">Nenhum CEST encontrado</p>
                      <p className="text-slate-400 text-[11px] mt-1">
                        {busca || ncmFiltro
                          ? 'Nenhum CEST corresponde aos critérios informados.'
                          : 'Use o botão "Importar CEST" para carregar via CSV.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                cests.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !item.ativo ? 'bg-slate-50/40 text-slate-400' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                      {formatarCodigoCest(item.codigo)}
                    </td>
                    <td className="py-3 px-3">
                      {item.ncm_codigos ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.ncm_codigos
                            .split(',')
                            .slice(0, 3)
                            .map((n, idx) => (
                              <span
                                key={idx}
                                className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                              >
                                {n.trim()}
                              </span>
                            ))}
                          {item.ncm_codigos.split(',').length > 3 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{item.ncm_codigos.split(',').length - 3} mais
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-800">{item.descricao}</p>
                      {item.segmento && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Segmento: <span className="text-slate-600">{item.segmento}</span>
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                      {item.item || '-'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.ativo ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] hover:bg-emerald-50">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-slate-400 border-slate-200 text-[10px]"
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
                            size="icon"
                            onClick={() => handleAbrirEditar(item)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600"
                            title="Editar CEST"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {podeInativar &&
                          (item.ativo ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItemParaInativar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-rose-600"
                              title="Inativar CEST"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItemParaAtivar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                              title="Reativar CEST"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-200 text-xs text-slate-500">
          <div>
            Mostrando <strong>{cests.length}</strong> de <strong>{totalItens}</strong> CESTs
            cadastrados
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1 || carregando}
              className="text-xs h-8"
            >
              Anterior
            </Button>
            <span className="text-xs font-medium px-2">
              Página {pagina} de {Math.max(1, totalPaginas)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas || carregando}
              className="text-xs h-8"
            >
              Próxima
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal Novo / Editar CEST */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editandoId ? 'Editar CEST' : 'Novo CEST'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informe o código de 7 dígitos, NCMs relacionados e descrição do segmento.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-xs">
              <div>
                <Label htmlFor="codigo" className="text-xs font-medium">
                  Código CEST (7 dígitos) *
                </Label>
                <Input
                  id="codigo"
                  value={codigoForm}
                  onChange={(e) => setCodigoForm(e.target.value)}
                  placeholder="Ex: 01.001.00 ou 0100100"
                  maxLength={9}
                  className="mt-1 font-mono text-xs"
                  autoFocus
                />
                {errosForm.codigo && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.codigo}</p>
                )}
              </div>

              <div>
                <Label htmlFor="ncm_codigos" className="text-xs font-medium">
                  NCMs ou prefixos relacionados (separados por vírgula)
                </Label>
                <Input
                  id="ncm_codigos"
                  value={ncmCodigosForm}
                  onChange={(e) => setNcmCodigosForm(e.target.value)}
                  placeholder="Ex: 2202, 22030000, 22021000"
                  className="mt-1 font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Dica: aceita códigos NCM completos ou prefixos de 4 a 8 dígitos.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="segmento" className="text-xs font-medium">
                    Segmento
                  </Label>
                  <Input
                    id="segmento"
                    value={segmentoForm}
                    onChange={(e) => setSegmentoForm(e.target.value)}
                    placeholder="Ex: Bebidas alcoólicas"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="item" className="text-xs font-medium">
                    Item
                  </Label>
                  <Input
                    id="item"
                    value={itemForm}
                    onChange={(e) => setItemForm(e.target.value)}
                    placeholder="Ex: 1.0"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="descricao" className="text-xs font-medium">
                  Descrição do Produto / CEST *
                </Label>
                <Textarea
                  id="descricao"
                  value={descricaoForm}
                  onChange={(e) => setDescricaoForm(e.target.value)}
                  placeholder="Descrição da mercadoria sujeita à substituição tributária"
                  className="mt-1 text-xs"
                  rows={3}
                />
                {errosForm.descricao && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.descricao}</p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
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
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Salvando...
                  </>
                ) : (
                  'Salvar CEST'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação CSV */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Planilha CEST
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione um arquivo CSV com as colunas:{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-mono">
                codigo;ncm;segmento;item;descricao
              </code>
              . Códigos de 7 dígitos serão atualizados ou criados automaticamente em lotes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            {/* Input de arquivo */}
            <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg text-center hover:border-blue-400 transition-colors bg-slate-50/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleSelecionarArquivo}
                className="hidden"
                id="cest-file-input"
              />
              <label
                htmlFor="cest-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
              >
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <span className="font-semibold text-slate-800 text-xs">
                  Clique para selecionar o arquivo CSV
                </span>
                <span className="text-[11px] text-slate-400">
                  Separado por ponto e vírgula (;) ou vírgula (,)
                </span>
              </label>
            </div>

            {analisandoCSV && (
              <div className="py-4 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Analisando CSV...
              </div>
            )}

            {resumoImportacao && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Arquivo analisado com sucesso
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {resumoImportacao.validos} CESTs válidos
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Linhas lidas</span>
                    <strong className="text-slate-800 text-sm">
                      {resumoImportacao.totalLidos}
                    </strong>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                    <span className="text-emerald-700 block text-[10px]">
                      Válidos para importar
                    </span>
                    <strong className="text-emerald-800 text-sm">{resumoImportacao.validos}</strong>
                  </div>
                  <div className="p-2 bg-amber-50 rounded border border-amber-200">
                    <span className="text-amber-700 block text-[10px]">Linhas ignoradas</span>
                    <strong className="text-amber-800 text-sm">{resumoImportacao.ignorados}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Progresso em lote */}
            {importandoLotes && progresso && (
              <div className="space-y-2 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    Gravando em lotes...
                  </span>
                  <span className="font-mono font-bold text-blue-700">
                    {progresso.processados} / {progresso.total} ({porcentagemProgresso}%)
                  </span>
                </div>
                <Progress value={porcentagemProgresso} className="h-2 bg-blue-100" />
                <div className="flex justify-between text-[10px] text-blue-700 pt-1">
                  <span>Novos inseridos: {progresso.stats.inseridos}</span>
                  <span>Atualizados: {progresso.stats.atualizados}</span>
                </div>
              </div>
            )}

            {resultadoFinal && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-1">
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Importação concluída com sucesso!
                </div>
                <p className="text-[11px]">
                  {resultadoFinal.inseridos} novo(s) CEST(s) inserido(s),{' '}
                  {resultadoFinal.atualizados} atualizado(s)
                  {resultadoFinal.erros > 0 && ` e ${resultadoFinal.erros} erro(s)`}.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalImportarAberto(false)}
              disabled={importandoLotes}
              className="text-xs"
            >
              {resultadoFinal ? 'Fechar' : 'Cancelar'}
            </Button>
            {resumoImportacao && !resultadoFinal && (
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarImportacao}
                disabled={importandoLotes || resumoImportacao.validos === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                {importandoLotes ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Importando...
                  </>
                ) : (
                  `Confirmar Importação de ${resumoImportacao.validos} CESTs`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Inativação */}
      <AlertDialog open={!!itemParaInativar} onOpenChange={() => setItemParaInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Inativar CEST?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja inativar o CEST{' '}
              <strong>
                {itemParaInativar ? formatarCodigoCest(itemParaInativar.codigo) : ''} -{' '}
                {itemParaInativar?.descricao}
              </strong>
              ? Ele deixará de aparecer nas opções do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              {processandoAcao ? 'Inativando...' : 'Inativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Reativação */}
      <AlertDialog open={!!itemParaAtivar} onOpenChange={() => setItemParaAtivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              Reativar CEST?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Deseja reativar o CEST{' '}
              <strong>{itemParaAtivar ? formatarCodigoCest(itemParaAtivar.codigo) : ''}</strong>?
              Ele voltará a ficar disponível para seleção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarAtivacao}
              disabled={processandoAcao}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {processandoAcao ? 'Reativando...' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CestPage
