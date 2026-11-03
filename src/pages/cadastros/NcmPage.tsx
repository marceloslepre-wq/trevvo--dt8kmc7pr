import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileCheck,
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
  Percent,
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
  Ncm,
  listarNcm,
  salvarNcm,
  inativarNcm,
  ativarNcm,
  formatarCodigoNcm,
  normalizarCodigoNcm,
} from '@/services/ncm'
import {
  analisarArquivoNcm,
  executarImportacaoNcmEmLotes,
  ResumoImportacaoNcm,
  ResultadoImportacaoNcm,
} from '@/services/ncmImportacao'

export const NcmPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('tabelas_fiscais', 'criar')
  const podeEditar = pode('tabelas_fiscais', 'editar')
  const podeInativar = pode('tabelas_fiscais', 'excluir')

  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados de listagem
  const [ncms, setNcms] = useState<Ncm[]>([])
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
  const [codigoForm, setCodigoForm] = useState('')
  const [descricaoForm, setDescricaoForm] = useState('')
  const [exTipiForm, setExTipiForm] = useState('')
  const [aliqIpiForm, setAliqIpiForm] = useState('')
  const [unidTribForm, setUnidTribForm] = useState('')
  const [dataInicioForm, setDataInicioForm] = useState('')
  const [dataFimForm, setDataFimForm] = useState('')
  const [errosForm, setErrosForm] = useState<{ codigo?: string; descricao?: string }>({})

  // Estados de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<Ncm | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<Ncm | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Estados de Importação
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [analisandoArquivo, setAnalisandoArquivo] = useState(false)
  const [importandoLotes, setImportandoLotes] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacaoNcm | null>(null)
  const [progresso, setProgresso] = useState<{
    processados: number
    total: number
    stats: { criados: number; atualizados: number; semMudanca: number }
    aguardandoLimite: boolean
    tentativasLimite: number
  } | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoImportacaoNcm | null>(null)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await listarNcm({
        busca,
        situacao,
        ordenacao,
        page: pagina,
        perPage: 20,
      })
      setNcms(res.items)
      setTotalPaginas(res.totalPages)
      setTotalItens(res.totalItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar NCMs'
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
    setCodigoForm('')
    setDescricaoForm('')
    setExTipiForm('')
    setAliqIpiForm('')
    setUnidTribForm('')
    setDataInicioForm('')
    setDataFimForm('')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleAbrirEditar = (item: Ncm) => {
    setEditandoId(item.id)
    setCodigoForm(formatarCodigoNcm(item.codigo))
    setDescricaoForm(item.descricao)
    setExTipiForm(item.ex_tipi || '')
    setAliqIpiForm(
      item.aliquota_ipi !== null && item.aliquota_ipi !== undefined
        ? String(item.aliquota_ipi)
        : '',
    )
    setUnidTribForm(item.unidade_tributavel || '')
    setDataInicioForm(item.data_inicio || '')
    setDataFimForm(item.data_fim || '')
    setErrosForm({})
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const novosErros: { codigo?: string; descricao?: string } = {}

    const codLimpo = normalizarCodigoNcm(codigoForm)
    const descLimpa = descricaoForm.trim()

    if (!codLimpo) {
      novosErros.codigo = 'O código NCM é obrigatório.'
    } else if (codLimpo.length !== 8) {
      novosErros.codigo = 'A NCM deve ter 8 dígitos numéricos.'
    }

    if (!descLimpa) {
      novosErros.descricao = 'A descrição da NCM é obrigatória.'
    }

    if (Object.keys(novosErros).length > 0) {
      setErrosForm(novosErros)
      return
    }

    setSalvando(true)
    try {
      const aliqNum = aliqIpiForm.trim() ? parseFloat(aliqIpiForm.replace(',', '.')) : null

      await salvarNcm({
        id: editandoId || undefined,
        codigo: codLimpo,
        descricao: descLimpa,
        ex_tipi: exTipiForm.trim(),
        aliquota_ipi: aliqNum,
        unidade_tributavel: unidTribForm.trim(),
        data_inicio: dataInicioForm.trim(),
        data_fim: dataFimForm.trim(),
      })

      toast({
        title: editandoId ? 'NCM atualizada' : 'NCM cadastrada',
        description: `A NCM "${formatarCodigoNcm(codLimpo)}" foi gravada com sucesso.`,
      })
      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar NCM'
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
      await inativarNcm(itemParaInativar.id)
      toast({
        title: 'NCM inativada',
        description: `A NCM "${formatarCodigoNcm(itemParaInativar.codigo)}" foi inativada.`,
      })
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inativar NCM'
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
      await ativarNcm(itemParaAtivar.id)
      toast({
        title: 'NCM reativada',
        description: `A NCM "${formatarCodigoNcm(itemParaAtivar.codigo)}" está ativa novamente.`,
      })
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reativar NCM'
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
    if (ncms.length === 0) {
      toast({
        title: 'Sem dados para exportar',
        description: 'Não há registros na visualização atual.',
      })
      return
    }

    const cabecalho = [
      'Código',
      'Código Formatado',
      'Descrição',
      'Alíquota IPI (%)',
      'EX TIPI',
      'Unidade Tributável',
      'Data Início',
      'Data Fim',
      'Situação',
    ]
    const linhas = ncms.map((n) => [
      `"${n.codigo}"`,
      `"${formatarCodigoNcm(n.codigo)}"`,
      `"${n.descricao.replace(/"/g, '""')}"`,
      n.aliquota_ipi !== null && n.aliquota_ipi !== undefined ? `"${n.aliquota_ipi}"` : '""',
      `"${n.ex_tipi || ''}"`,
      `"${n.unidade_tributavel || ''}"`,
      `"${n.data_inicio || ''}"`,
      `"${n.data_fim || ''}"`,
      n.ativo ? '"Ativo"' : '"Inativo"',
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `ncm_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O download foi iniciado com sucesso.',
    })
  }

  // Importação: arquivo JSON (Siscomex) ou CSV
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalisandoArquivo(true)
    setResumoImportacao(null)
    setProgresso(null)
    setResultadoFinal(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const conteudo = event.target?.result as string
        const resultado = await analisarArquivoNcm(conteudo)
        setResumoImportacao(resultado)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo'
        toast({
          title: 'Erro na leitura do arquivo',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        setAnalisandoArquivo(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      toast({
        title: 'Erro ao ler arquivo',
        description: 'Não foi possível ler o arquivo selecionado.',
        variant: 'destructive',
      })
      setAnalisandoArquivo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    reader.readAsText(file, 'utf-8')
  }

  const handleConfirmarImportacao = async () => {
    if (!resumoImportacao || resumoImportacao.itensValidos.length === 0) return

    setImportandoLotes(true)
    try {
      const res = await executarImportacaoNcmEmLotes(
        resumoImportacao.itensValidos,
        (processados, total, stats, status) => {
          setProgresso({
            processados,
            total,
            stats,
            aguardandoLimite: status?.aguardandoLimite || false,
            tentativasLimite: status?.tentativas || 0,
          })
        },
      )

      setResultadoFinal(res)
      toast({
        title: 'Importação concluída',
        description: `${res.criados} criada(s), ${res.atualizados} atualizada(s), ${res.semMudanca} sem mudança e ${res.erros} erro(s).`,
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
            <FileCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">NCM</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Nomenclatura Comum do Mercosul. Importação oficial Siscomex ou planilha CSV.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={carregando || ncms.length === 0}
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
              Importar NCM
            </Button>
          )}

          {podeCriar && (
            <Button
              size="sm"
              onClick={handleAbrirNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nova NCM
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por código (ex: 2202.10.00 ou 2202) ou descrição..."
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

      {/* Tabela de NCMs */}
      <Card className="border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors w-36"
                  onClick={() => alternarOrdenacao('codigo')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Código NCM</span>
                    {renderIconeOrdenacao('codigo')}
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => alternarOrdenacao('descricao')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Descrição Oficial</span>
                    {renderIconeOrdenacao('descricao')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center w-24">Alíq. IPI</th>
                <th className="py-3 px-3 text-center w-20">EX TIPI</th>
                <th className="py-3 px-3 text-center w-28">Vigência</th>
                <th className="py-3 px-3 text-center w-24">Situação</th>
                <th className="py-3 px-4 text-right w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Carregando tabela NCM...
                  </td>
                </tr>
              ) : ncms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="max-w-xs mx-auto">
                      <FileCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-700">Nenhuma NCM encontrada</p>
                      <p className="text-slate-400 text-[11px] mt-1">
                        {busca
                          ? 'Tente ajustar os termos da busca.'
                          : 'Use o botão "Importar NCM" para carregar a tabela oficial Siscomex.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                ncms.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !item.ativo ? 'bg-slate-50/40 text-slate-400' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                      {formatarCodigoNcm(item.codigo)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{item.descricao}</span>
                      {item.unidade_tributavel && (
                        <span className="ml-2 text-[10px] text-slate-400 font-normal">
                          (Unid: {item.unidade_tributavel})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.aliquota_ipi !== null && item.aliquota_ipi !== undefined ? (
                        <span className="inline-flex items-center gap-0.5 font-medium text-slate-700">
                          {item.aliquota_ipi}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.ex_tipi ? (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {item.ex_tipi}
                        </Badge>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-[10px] text-slate-500">
                      {item.data_inicio ? (
                        <div>
                          <span>De: {item.data_inicio}</span>
                          {item.data_fim && <span className="block">Até: {item.data_fim}</span>}
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
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
                            title="Editar NCM"
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
                              title="Inativar NCM"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setItemParaAtivar(item)}
                              className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                              title="Reativar NCM"
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
            Mostrando <strong>{ncms.length}</strong> de <strong>{totalItens}</strong> NCMs
            cadastradas
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

      {/* Modal Novo / Editar NCM */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSalvar}>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {editandoId ? 'Editar NCM' : 'Nova NCM'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Informe o código de 8 dígitos e a descrição oficial do Mercosul.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-xs">
              <div>
                <Label htmlFor="codigo" className="text-xs font-medium">
                  Código NCM (8 dígitos) *
                </Label>
                <Input
                  id="codigo"
                  value={codigoForm}
                  onChange={(e) => setCodigoForm(e.target.value)}
                  placeholder="Ex: 2202.10.00 ou 22021000"
                  maxLength={10}
                  className="mt-1 font-mono text-xs"
                  autoFocus
                />
                {errosForm.codigo && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.codigo}</p>
                )}
              </div>

              <div>
                <Label htmlFor="descricao" className="text-xs font-medium">
                  Descrição Oficial *
                </Label>
                <Textarea
                  id="descricao"
                  value={descricaoForm}
                  onChange={(e) => setDescricaoForm(e.target.value)}
                  placeholder="Descrição da mercadoria conforme a tabela NCM"
                  className="mt-1 text-xs"
                  rows={3}
                />
                {errosForm.descricao && (
                  <p className="text-rose-500 text-[11px] mt-1">{errosForm.descricao}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="aliq_ipi" className="text-xs font-medium">
                    Alíquota IPI (%)
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="aliq_ipi"
                      value={aliqIpiForm}
                      onChange={(e) => setAliqIpiForm(e.target.value)}
                      placeholder="0.00"
                      className="text-xs pr-7"
                    />
                    <Percent className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="ex_tipi" className="text-xs font-medium">
                    Exceção da TIPI (EX)
                  </Label>
                  <Input
                    id="ex_tipi"
                    value={exTipiForm}
                    onChange={(e) => setExTipiForm(e.target.value)}
                    placeholder="Ex: 01"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="unid" className="text-xs font-medium">
                    Unid. Trib.
                  </Label>
                  <Input
                    id="unid"
                    value={unidTribForm}
                    onChange={(e) => setUnidTribForm(e.target.value.toUpperCase())}
                    placeholder="UN"
                    maxLength={6}
                    className="mt-1 text-xs uppercase"
                  />
                </div>
                <div>
                  <Label htmlFor="dt_ini" className="text-xs font-medium">
                    Data Início
                  </Label>
                  <Input
                    id="dt_ini"
                    value={dataInicioForm}
                    onChange={(e) => setDataInicioForm(e.target.value)}
                    placeholder="AAAA-MM-DD"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="dt_fim" className="text-xs font-medium">
                    Data Fim
                  </Label>
                  <Input
                    id="dt_fim"
                    value={dataFimForm}
                    onChange={(e) => setDataFimForm(e.target.value)}
                    placeholder="AAAA-MM-DD"
                    className="mt-1 text-xs"
                  />
                </div>
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
                  'Salvar NCM'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação de NCM */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Tabela NCM
            </DialogTitle>
            <DialogDescription className="text-xs">
              Envie o <strong>CSV oficial da Receita/Siscomex</strong> (ncm_vigente_AAAA-MM-DD.csv,
              separado por ponto e vírgula) com as colunas{' '}
              <strong>
                codigo; codigo_formatado; descricao; descricao_completa; data_inicio; data_fim;
                ato_legal
              </strong>
              . Importação em lotes com upsert pelo código: atualiza o que existe, cria o que falta,
              sem duplicar e sem alterar a alíquota de IPI dos registros existentes.
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
                id="ncm-file-input"
              />
              <label
                htmlFor="ncm-file-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
              >
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-full">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <span className="font-semibold text-slate-800 text-xs">
                  Clique para selecionar o CSV oficial da Receita/Siscomex
                </span>
                <span className="text-[11px] text-slate-400">
                  Arquivo .csv separado por ponto e vírgula (codigo; codigo_formatado; descricao;
                  descricao_completa; data_inicio; data_fim; ato_legal)
                </span>
              </label>
            </div>

            {analisandoArquivo && (
              <div className="py-4 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Analisando estrutura do arquivo...
              </div>
            )}

            {/* Resumo da Análise */}
            {resumoImportacao && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Arquivo analisado com sucesso
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {resumoImportacao.validos} NCMs de 8 dígitos
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Lidos no arquivo</span>
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
                    <span className="text-amber-700 block text-[10px]">Capítulos/Ignorados</span>
                    <strong className="text-amber-800 text-sm">{resumoImportacao.ignorados}</strong>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  * Registros já existentes serão atualizados automaticamente mantendo a
                  consistência.
                </p>
              </div>
            )}

            {/* Barra de Progresso em Lotes */}
            {importandoLotes && progresso && (
              <div className="space-y-2 p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    Processando em lotes...
                  </span>
                  <span className="font-mono font-bold text-blue-700">
                    {progresso.processados} / {progresso.total} ({porcentagemProgresso}%)
                  </span>
                </div>
                <Progress value={porcentagemProgresso} className="h-2 bg-blue-100" />
                <div className="flex justify-between text-[10px] text-blue-700 pt-1">
                  <span>Criados: {progresso.stats.criados}</span>
                  <span>Atualizados: {progresso.stats.atualizados}</span>
                  <span>Sem mudança: {progresso.stats.semMudanca}</span>
                </div>
                {progresso.aguardandoLimite && (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    aguardando limite do servidor... (tentativa de reenvio nº{' '}
                    {progresso.tentativasLimite})
                  </div>
                )}
              </div>
            )}

            {/* Resultado Final */}
            {resultadoFinal && (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-1">
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Importação concluída!
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="p-1.5 bg-white rounded border border-emerald-200">
                      <span className="text-emerald-600 block text-[10px]">Criados</span>
                      <strong className="text-emerald-800 text-sm">{resultadoFinal.criados}</strong>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-emerald-200">
                      <span className="text-emerald-600 block text-[10px]">Atualizados</span>
                      <strong className="text-emerald-800 text-sm">
                        {resultadoFinal.atualizados}
                      </strong>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-emerald-200">
                      <span className="text-emerald-600 block text-[10px]">Sem mudança</span>
                      <strong className="text-emerald-800 text-sm">
                        {resultadoFinal.semMudanca}
                      </strong>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-rose-200">
                      <span className="text-rose-600 block text-[10px]">Erros</span>
                      <strong className="text-rose-800 text-sm">{resultadoFinal.erros}</strong>
                    </div>
                  </div>
                </div>

                {resultadoFinal.erros > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
                    <div className="font-semibold text-amber-900 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Primeiras {resultadoFinal.primeirosErros.length} linhas com erro
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {resultadoFinal.primeirosErros.map((e, idx) => (
                        <div
                          key={`${e.linha}-${idx}`}
                          className="text-[11px] bg-white rounded border border-amber-200 p-2"
                        >
                          <span className="font-mono font-semibold text-amber-900">
                            Linha {e.linha} (NCM {formatarCodigoNcm(e.codigo) || e.codigo})
                          </span>
                          <span className="text-amber-800 block mt-0.5">{e.motivo}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  `Confirmar Importação de ${resumoImportacao.validos} NCMs`
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
              Inativar NCM?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja inativar a NCM{' '}
              <strong>
                {itemParaInativar ? formatarCodigoNcm(itemParaInativar.codigo) : ''} -{' '}
                {itemParaInativar?.descricao}
              </strong>
              ? Ela deixará de aparecer nas opções ativas do sistema.
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
              Reativar NCM?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Deseja reativar a NCM{' '}
              <strong>{itemParaAtivar ? formatarCodigoNcm(itemParaAtivar.codigo) : ''}</strong>? Ela
              voltará a ficar disponível para seleção.
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

export default NcmPage
