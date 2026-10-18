import React, { useState, useEffect, useCallback, useTransition } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit,
  Power,
  RotateCcw,
  Copy,
  Layers,
  Percent,
  CheckSquare,
  Square,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import pb from '@/lib/pocketbase/client'
import {
  Produto,
  TipoProduto,
  listarProdutos,
  inativarProduto,
  ativarProduto,
  duplicarProduto,
  inativarProdutosEmMassa,
  alterarGrupoCategoriaEmMassa,
  alterarPrecoMargemEmMassa,
  validarArquivoCSVProdutos,
  processarImportacaoCSVProdutos,
  ResumoValidacaoImportacao,
} from '@/services/produtos'
import {
  listarTodosGruposAtivos,
  listarCategoriasPorGrupo,
  Grupo,
  Categoria,
} from '@/services/gruposCategorias'
import { listarTodasMarcasAtivas, Marca } from '@/services/marcas'
import { listarTodosFornecedoresAtivos, Fornecedor } from '@/services/fornecedores'

export const ProdutosLista: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()

  const podeCriar = pode('produtos', 'criar')
  const podeEditar = pode('produtos', 'editar')
  const podeInativar = pode('produtos', 'excluir')

  const [, startTransition] = useTransition()

  // Estados da listagem
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [searchParams] = useSearchParams()

  const [busca, setBusca] = useState('')
  const [buscaInput, setBuscaInput] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoProduto | 'todos'>('todos')
  const [filtroGrupo, setFiltroGrupo] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroMarca, setFiltroMarca] = useState('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [filtroSemNcm, setFiltroSemNcm] = useState(() => searchParams.get('sem_ncm') === 'true')
  const [filtroFiscalNaoRevisado, setFiltroFiscalNaoRevisado] = useState(
    () => searchParams.get('fiscal_nao_revisado') === 'true',
  )
  const [ordenarPor, setOrdenarPor] = useState('descricao')
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('asc')

  // Listas auxiliares para dropdowns de filtros
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categoriasDoGrupo, setCategoriasDoGrupo] = useState<Categoria[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])

  // Seleção de itens em massa
  const [selecionados, setSelecionados] = useState<string[]>([])

  // Modais de Ações em Massa
  const [modalMassaGrupoAberto, setModalMassaGrupoAberto] = useState(false)
  const [massaGrupoId, setMassaGrupoId] = useState('')
  const [massaCategoriaId, setMassaCategoriaId] = useState('')
  const [massaCategoriasOpcoes, setMassaCategoriasOpcoes] = useState<Categoria[]>([])

  const [modalMassaPrecoAberto, setModalMassaPrecoAberto] = useState(false)
  const [massaPercentual, setMassaPercentual] = useState('')
  const [massaAplicarSobre, setMassaAplicarSobre] = useState<
    'preco_venda' | 'margem' | 'preco_custo'
  >('preco_venda')

  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Inativação / Reativação individual
  const [produtoAlvo, setProdutoAlvo] = useState<Produto | null>(null)
  const [dialogInativarAberto, setDialogInativarAberto] = useState(false)

  // Modal Importação CSV
  const [modalImportacaoAberto, setModalImportacaoAberto] = useState(false)
  const [arquivoCSV, setArquivoCSV] = useState<File | null>(null)
  const [validandoCSV, setValidandoCSV] = useState(false)
  const [resumoImportacao, setResumoImportacao] = useState<ResumoValidacaoImportacao | null>(null)
  const [importandoCSV, setImportandoCSV] = useState(false)

  // Carregar filtros auxiliares
  useEffect(() => {
    Promise.all([
      listarTodosGruposAtivos(),
      listarTodasMarcasAtivas(),
      listarTodosFornecedoresAtivos(),
    ])
      .then(([g, m, f]) => {
        setGrupos(g)
        setMarcas(m)
        setFornecedores(f)
      })
      .catch(console.error)
  }, [])

  // Recarregar categorias do filtro quando grupo muda
  useEffect(() => {
    if (filtroGrupo && filtroGrupo !== 'todos') {
      listarCategoriasPorGrupo(filtroGrupo, true).then(setCategoriasDoGrupo).catch(console.error)
    } else {
      setCategoriasDoGrupo([])
      setFiltroCategoria('todos')
    }
  }, [filtroGrupo])

  // Recarregar categorias para modal de massa quando grupo muda
  useEffect(() => {
    if (massaGrupoId) {
      listarCategoriasPorGrupo(massaGrupoId, true)
        .then(setMassaCategoriasOpcoes)
        .catch(console.error)
    } else {
      setMassaCategoriasOpcoes([])
      setMassaCategoriaId('')
    }
  }, [massaGrupoId])

  // Carregar lista de produtos
  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const ordenacaoFormatada = ordem === 'desc' ? `-${ordenarPor}` : ordenarPor
      const res = await listarProdutos({
        busca,
        tipo: filtroTipo,
        grupo_id: filtroGrupo,
        categoria_id: filtroCategoria,
        marca_id: filtroMarca,
        fornecedor_id: filtroFornecedor,
        situacao: filtroSituacao,
        sem_ncm: filtroSemNcm,
        fiscal_nao_revisado: filtroFiscalNaoRevisado,
        pagina,
        itensPorPagina: 20,
        ordenacao: ordenacaoFormatada,
      })

      setProdutos(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages || 1)
      setSelecionados([]) // limpa seleção ao trocar filtros/página
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar produtos',
        description: err instanceof Error ? err.message : 'Falha ao buscar produtos',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    busca,
    filtroTipo,
    filtroGrupo,
    filtroCategoria,
    filtroMarca,
    filtroFornecedor,
    filtroSituacao,
    filtroSemNcm,
    filtroFiscalNaoRevisado,
    pagina,
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

  const handleAplicarBusca = (e: React.FormEvent) => {
    e.preventDefault()
    setBusca(buscaInput)
    setPagina(1)
  }

  const handleLimparFiltros = () => {
    setBusca('')
    setBuscaInput('')
    setFiltroTipo('todos')
    setFiltroGrupo('todos')
    setFiltroCategoria('todos')
    setFiltroMarca('todos')
    setFiltroFornecedor('todos')
    setFiltroSituacao('ativos')
    setFiltroSemNcm(false)
    setFiltroFiscalNaoRevisado(false)
    setPagina(1)
  }

  // Seleção de itens em massa
  const handleToggleSelecionarTudo = () => {
    if (selecionados.length === produtos.length) {
      setSelecionados([])
    } else {
      setSelecionados(produtos.map((p) => p.id))
    }
  }

  const handleToggleItem = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  // Formatação
  const formatarMoeda = (val?: number) => {
    if (val === undefined || val === null) return 'R$ 0,00'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const getUrlFoto = (p: Produto) => {
    if (!p.foto) return null
    return pb.files.getURL(p, p.foto, { thumb: '100x100' })
  }

  // Duplicação
  const handleDuplicar = async (p: Produto) => {
    try {
      setProcessandoAcao(true)
      const novo = await duplicarProduto(p.id)
      toast({
        title: 'Produto duplicado',
        description: `O produto "${novo.descricao}" foi gerado com o código ${novo.codigo}.`,
      })
      navigate(`/cadastros/produtos/${novo.id}/editar`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar produto',
        description: err instanceof Error ? err.message : 'Falha na duplicação',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Inativação / Reativação individual
  const handleConfirmarSituacao = async () => {
    if (!produtoAlvo) return
    setProcessandoAcao(true)
    try {
      if (produtoAlvo.ativo) {
        await inativarProduto(produtoAlvo.id)
        toast({
          title: 'Produto inativado',
          description: `O produto "${produtoAlvo.descricao}" foi inativado.`,
        })
      } else {
        await ativarProduto(produtoAlvo.id)
        toast({
          title: 'Produto ativado',
          description: `O produto "${produtoAlvo.descricao}" foi ativado com sucesso.`,
        })
      }
      setDialogInativarAberto(false)
      setProdutoAlvo(null)
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao alterar situação',
        description: err instanceof Error ? err.message : 'Falha na operação',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Ações em Massa
  const handleExecutarMassaGrupo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!massaGrupoId) {
      toast({ title: 'Selecione um grupo', variant: 'destructive' })
      return
    }
    setProcessandoAcao(true)
    try {
      const qtd = await alterarGrupoCategoriaEmMassa(
        selecionados,
        massaGrupoId,
        massaCategoriaId || undefined,
      )
      toast({
        title: 'Atualização concluída',
        description: `${qtd} produto(s) atualizado(s) para o grupo selecionado.`,
      })
      setModalMassaGrupoAberto(false)
      setSelecionados([])
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro na alteração em massa',
        description: err instanceof Error ? err.message : 'Falha ao processar',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleExecutarMassaPreco = async (e: React.FormEvent) => {
    e.preventDefault()
    const percNum = parseFloat(massaPercentual.replace(',', '.'))
    if (isNaN(percNum)) {
      toast({ title: 'Informe um percentual válido (ex: 10 ou -5)', variant: 'destructive' })
      return
    }
    setProcessandoAcao(true)
    try {
      const qtd = await alterarPrecoMargemEmMassa(selecionados, percNum, massaAplicarSobre)
      toast({
        title: 'Preços atualizados',
        description: `${qtd} produto(s) recalculado(s) com sucesso.`,
      })
      setModalMassaPrecoAberto(false)
      setSelecionados([])
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro na alteração em massa',
        description: err instanceof Error ? err.message : 'Falha ao processar',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleExecutarMassaInativar = async () => {
    setProcessandoAcao(true)
    try {
      const qtd = await inativarProdutosEmMassa(selecionados)
      toast({
        title: 'Produtos inativados',
        description: `${qtd} produto(s) inativado(s) com sucesso.`,
      })
      setSelecionados([])
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao inativar produtos',
        description: err instanceof Error ? err.message : 'Falha ao processar',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Exportar CSV
  const exportarCSV = () => {
    if (produtos.length === 0) {
      toast({ title: 'Nenhum registro para exportar' })
      return
    }

    const cabecalho = [
      'Código',
      'Tipo',
      'Descrição',
      'GTIN',
      'Referência',
      'Marca',
      'Grupo',
      'Categoria',
      'Unidade',
      'Preço Custo',
      'Preço Venda',
      'Margem %',
      'NCM',
      'CEST',
      'Fiscal Revisado',
      'Situação',
    ]

    const linhas = produtos.map((p) => [
      p.codigo,
      p.tipo,
      `"${(p.descricao || '').replace(/"/g, '""')}"`,
      p.gtin || '',
      p.referencia || '',
      `"${(p.expand?.marca_id?.nome || '').replace(/"/g, '""')}"`,
      `"${(p.expand?.grupo_id?.nome || '').replace(/"/g, '""')}"`,
      `"${(p.expand?.categoria_id?.nome || '').replace(/"/g, '""')}"`,
      p.expand?.unidade_id?.sigla || '',
      (p.preco_custo || 0).toFixed(4).replace('.', ','),
      (p.preco_venda || 0).toFixed(2).replace('.', ','),
      (p.margem_percentual || 0).toFixed(2).replace('.', ','),
      p.ncm || '',
      p.cest || '',
      p.fiscal_revisado ? 'Sim' : 'Não',
      p.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `produtos_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({ title: 'CSV baixado com sucesso' })
  }

  // Importação CSV: Upload e Validação
  const handleSelecionarArquivoCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivoCSV(file)
    setValidandoCSV(true)
    setResumoImportacao(null)

    try {
      const texto = await file.text()
      const resumo = await validarArquivoCSVProdutos(texto)
      setResumoImportacao(resumo)
    } catch (err: unknown) {
      toast({
        title: 'Arquivo inválido',
        description: err instanceof Error ? err.message : 'Falha ao processar arquivo CSV',
        variant: 'destructive',
      })
      setArquivoCSV(null)
    } finally {
      setValidandoCSV(false)
    }
  }

  const handleProcessarImportacao = async () => {
    if (!resumoImportacao || resumoImportacao.linhasValidas.length === 0) return
    setImportandoCSV(true)
    try {
      const { importados, falhas } = await processarImportacaoCSVProdutos(
        resumoImportacao.linhasValidas,
      )
      toast({
        title: 'Importação concluída',
        description: `${importados} produto(s) cadastrado(s) com sucesso.${
          falhas > 0 ? ` ${falhas} falha(s).` : ''
        }`,
      })
      setModalImportacaoAberto(false)
      setArquivoCSV(null)
      setResumoImportacao(null)
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao importar produtos',
        description: err instanceof Error ? err.message : 'Falha no processamento',
        variant: 'destructive',
      })
    } finally {
      setImportandoCSV(false)
    }
  }

  const temFiltroAtivo =
    Boolean(busca) ||
    filtroTipo !== 'todos' ||
    filtroGrupo !== 'todos' ||
    filtroCategoria !== 'todos' ||
    filtroMarca !== 'todos' ||
    filtroFornecedor !== 'todos' ||
    filtroSituacao !== 'ativos' ||
    filtroSemNcm ||
    filtroFiscalNaoRevisado

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Produtos</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Catálogo completo de produtos, preços de venda, estoque e tributação
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/cadastros/produtos/conferencia')}
            className="text-xs h-9 border-blue-200 text-blue-700 hover:bg-blue-50 bg-blue-50/40"
            title="Abrir tela de conferência fiscal em massa"
          >
            <CheckSquare size={14} className="mr-1.5 text-blue-600" />
            Conferência fiscal
          </Button>

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
                onClick={() => {
                  setArquivoCSV(null)
                  setResumoImportacao(null)
                  setModalImportacaoAberto(true)
                }}
                className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <Upload size={14} className="mr-1.5" />
                Importar CSV
              </Button>

              <Button
                size="sm"
                onClick={() => navigate('/cadastros/produtos/novo')}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <Plus size={15} className="mr-1.5" />
                Novo Produto
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <form onSubmit={handleAplicarBusca} className="space-y-3">
          {/* Linha 1: Busca e Tipos */}
          <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={15}
              />
              <Input
                type="text"
                placeholder="Buscar por código, GTIN, referência ou descrição..."
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="h-9 text-xs bg-slate-900 hover:bg-slate-800"
              >
                <Search size={14} className="mr-1.5" />
                Buscar
              </Button>
              {temFiltroAtivo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleLimparFiltros}
                  className="h-9 text-xs text-slate-600 hover:text-slate-900"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Linha 2: Filtros avançados */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 text-xs">
            {/* Tipo */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Tipo</Label>
              <Select
                value={filtroTipo}
                onValueChange={(val: any) => {
                  setFiltroTipo(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Produto">Produto</SelectItem>
                  <SelectItem value="Serviço">Serviço</SelectItem>
                  <SelectItem value="Kit">Kit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Grupo */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Grupo</Label>
              <Select
                value={filtroGrupo}
                onValueChange={(val) => {
                  setFiltroGrupo(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos os grupos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os grupos</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Categoria</Label>
              <Select
                value={filtroCategoria}
                onValueChange={(val) => {
                  setFiltroCategoria(val)
                  setPagina(1)
                }}
                disabled={filtroGrupo === 'todos'}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todas categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas categorias</SelectItem>
                  {categoriasDoGrupo.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marca */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Marca</Label>
              <Select
                value={filtroMarca}
                onValueChange={(val) => {
                  setFiltroMarca(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todas as marcas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as marcas</SelectItem>
                  {marcas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fornecedor */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Fornecedor</Label>
              <Select
                value={filtroFornecedor}
                onValueChange={(val) => {
                  setFiltroFornecedor(val)
                  setPagina(1)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos fornecedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos fornecedores</SelectItem>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Situação */}
            <div>
              <Label className="text-[11px] text-slate-500 mb-1 block">Situação</Label>
              <Select
                value={filtroSituacao}
                onValueChange={(val: any) => {
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
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Linha 3: Filtros rápidos fiscais */}
          <div className="flex items-center gap-4 pt-1 border-t border-slate-100 text-xs text-slate-600">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filtroSemNcm}
                onChange={(e) => {
                  setFiltroSemNcm(e.target.checked)
                  setPagina(1)
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Sem NCM</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filtroFiscalNaoRevisado}
                onChange={(e) => {
                  setFiltroFiscalNaoRevisado(e.target.checked)
                  setPagina(1)
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Fiscal não revisado</span>
            </label>
          </div>
        </form>
      </div>

      {/* Barra de Ações em Massa (visível quando há itens selecionados) */}
      {selecionados.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs text-blue-900 font-medium">
            <CheckSquare className="h-4 w-4 text-blue-600" />
            <span>
              <strong>{selecionados.length}</strong> produto(s) selecionado(s)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {podeEditar && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMassaGrupoId('')
                    setMassaCategoriaId('')
                    setModalMassaGrupoAberto(true)
                  }}
                  className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  <Layers className="h-3.5 w-3.5 mr-1" />
                  Alterar Grupo/Categoria
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMassaPercentual('')
                    setModalMassaPrecoAberto(true)
                  }}
                  className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  <Percent className="h-3.5 w-3.5 mr-1" />
                  Reajustar Preço/Margem (%)
                </Button>
              </>
            )}

            {podeInativar && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExecutarMassaInativar}
                className="h-8 text-xs bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                <Power className="h-3.5 w-3.5 mr-1" />
                Inativar Selecionados
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelecionados([])}
              className="h-8 text-xs text-slate-500 hover:text-slate-800"
            >
              Desmarcar
            </Button>
          </div>
        </div>
      )}

      {/* Grade de Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={produtos.length > 0 && selecionados.length === produtos.length}
                    onChange={handleToggleSelecionarTudo}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Selecionar todos os produtos da página"
                  />
                </th>
                <th className="py-3 px-2 w-12 text-center">Foto</th>
                <th
                  onClick={() => alternarOrdem('codigo')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors w-20"
                >
                  <div className="flex items-center gap-1">
                    <span>Código</span>
                    {renderIconeOrdenacao('codigo')}
                  </div>
                </th>
                <th
                  onClick={() => alternarOrdem('descricao')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Descrição / GTIN</span>
                    {renderIconeOrdenacao('descricao')}
                  </div>
                </th>
                <th className="py-3 px-3">Marca</th>
                <th className="py-3 px-3">Grupo / Categoria</th>
                <th className="py-3 px-2 text-center">Unid.</th>
                <th
                  onClick={() => alternarOrdem('preco_venda')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Preço Venda</span>
                    {renderIconeOrdenacao('preco_venda')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center">NCM</th>
                <th className="py-3 px-3 text-center">Situação</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <span>Carregando produtos...</span>
                    </div>
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-700">Nenhum produto encontrado</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {temFiltroAtivo
                        ? 'Tente ajustar os filtros informados.'
                        : 'Cadastre seu primeiro produto.'}
                    </p>
                  </td>
                </tr>
              ) : (
                produtos.map((p) => {
                  const fotoUrl = getUrlFoto(p)
                  const isChecked = selecionados.includes(p.id)

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !p.ativo ? 'opacity-60 bg-slate-50/40' : ''
                      } ${isChecked ? 'bg-blue-50/50' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(p.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Foto */}
                      <td className="py-2.5 px-2 text-center">
                        <div className="h-9 w-9 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden mx-auto">
                          {fotoUrl ? (
                            <img
                              src={fotoUrl}
                              alt={p.descricao}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package className="h-4 w-4 text-slate-300" />
                          )}
                        </div>
                      </td>

                      {/* Código */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                        #{p.codigo}
                      </td>

                      {/* Descrição e GTIN */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {p.descricao}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                          {p.gtin && <span>GTIN: {p.gtin}</span>}
                          {p.referencia && <span>Ref: {p.referencia}</span>}
                          {p.tipo !== 'Produto' && (
                            <Badge variant="secondary" className="text-[9px] py-0 px-1 font-normal">
                              {p.tipo}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Marca */}
                      <td className="py-2.5 px-3 text-slate-700">
                        {p.expand?.marca_id?.nome || <span className="text-slate-300">—</span>}
                      </td>

                      {/* Grupo / Categoria */}
                      <td className="py-2.5 px-3 text-slate-700">
                        {p.expand?.grupo_id ? (
                          <div className="truncate max-w-[160px]">
                            <span className="font-medium text-slate-800">
                              {p.expand.grupo_id.nome}
                            </span>
                            {p.expand?.categoria_id && (
                              <div className="text-[10px] text-slate-400">
                                › {p.expand.categoria_id.nome}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Unidade */}
                      <td className="py-2.5 px-2 text-center font-semibold text-slate-700 uppercase">
                        {p.expand?.unidade_id?.sigla || 'UN'}
                      </td>

                      {/* Preço de Venda */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-bold text-slate-900">
                          {formatarMoeda(p.preco_venda)}
                        </div>
                        {p.preco_custo ? (
                          <div className="text-[10px] text-slate-400">
                            custo: {formatarMoeda(p.preco_custo)}
                          </div>
                        ) : null}
                      </td>

                      {/* NCM */}
                      <td className="py-2.5 px-3 text-center font-mono">
                        {p.ncm ? (
                          <span className="text-slate-800 font-medium">{p.ncm}</span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-amber-700 border-amber-300 bg-amber-50 py-0"
                          >
                            Sem NCM
                          </Badge>
                        )}
                      </td>

                      {/* Situação */}
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={p.ativo ? 'default' : 'secondary'}
                          className={`text-[10px] font-normal py-0 px-2 ${
                            p.ativo
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/cadastros/produtos/${p.id}/editar`)}
                              className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Editar produto"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {podeCriar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicar(p)}
                              className="h-7 w-7 p-0 text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                              title="Duplicar produto"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {podeInativar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProdutoAlvo(p)
                                setDialogInativarAberto(true)
                              }}
                              className={`h-7 w-7 p-0 ${
                                p.ativo
                                  ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={p.ativo ? 'Inativar produto' : 'Reativar produto'}
                            >
                              {p.ativo ? (
                                <Power className="h-3.5 w-3.5" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé e Paginação */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-200 gap-3 text-xs text-slate-500">
          <div>
            Mostrando <strong>{produtos.length}</strong> de <strong>{totalItems}</strong> produtos
            cadastrados.
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1 || carregando}
                className="h-8 text-xs"
              >
                Anterior
              </Button>
              <span className="px-2 font-medium text-slate-700">
                Página {pagina} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPages, p + 1))}
                disabled={pagina === totalPages || carregando}
                className="h-8 text-xs"
              >
                Próxima
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL MASSA: ALTERAR GRUPO E CATEGORIA */}
      {/* ======================================================== */}
      <Dialog open={modalMassaGrupoAberto} onOpenChange={setModalMassaGrupoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleExecutarMassaGrupo}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Alterar Grupo e Categoria em Massa
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Esta ação alterará o grupo e a categoria para os {selecionados.length} produto(s)
                selecionado(s).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Novo Grupo <span className="text-rose-600">*</span>
                </Label>
                <Select value={massaGrupoId} onValueChange={setMassaGrupoId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione o grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Nova Categoria (opcional)
                </Label>
                <Select
                  value={massaCategoriaId}
                  onValueChange={setMassaCategoriaId}
                  disabled={!massaGrupoId}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione a categoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma categoria</SelectItem>
                    {massaCategoriasOpcoes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalMassaGrupoAberto(false)}
                disabled={processandoAcao}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={processandoAcao}
              >
                {processandoAcao ? 'Processando...' : 'Aplicar Alteração'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL MASSA: REAJUSTE DE PREÇO / MARGEM */}
      {/* ======================================================== */}
      <Dialog open={modalMassaPrecoAberto} onOpenChange={setModalMassaPrecoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleExecutarMassaPreco}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Reajustar Preços em Massa (%)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Aplica um percentual de reajuste positivo ou negativo nos {selecionados.length}{' '}
                produto(s) selecionado(s).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Aplicar reajuste sobre
                </Label>
                <Select
                  value={massaAplicarSobre}
                  onValueChange={(val: any) => setMassaAplicarSobre(val)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preco_venda">Preço de Venda (recalcula margem)</SelectItem>
                    <SelectItem value="margem">Margem de Lucro % (recalcula venda)</SelectItem>
                    <SelectItem value="preco_custo">
                      Preço de Custo (recalcula venda mantendo margem)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Percentual de Variação (%) <span className="text-rose-600">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 10 para aumento ou -5 para desconto"
                    value={massaPercentual}
                    onChange={(e) => setMassaPercentual(e.target.value)}
                    className="pr-8 text-xs"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Exemplo: Digite 10 para aumentar em 10% ou -5 para reduzir 5%.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalMassaPrecoAberto(false)}
                disabled={processandoAcao}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={processandoAcao}
              >
                {processandoAcao ? 'Atualizando...' : 'Confirmar Reajuste'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL IMPORTAÇÃO CSV */}
      {/* ======================================================== */}
      <Dialog open={modalImportacaoAberto} onOpenChange={setModalImportacaoAberto}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Importação de Produtos por CSV
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Colunas esperadas (separadas por ponto e vírgula):
              <br />
              <code className="text-[11px] font-mono bg-slate-100 p-1 rounded block mt-1 text-slate-800">
                descricao;gtin;referencia;unidade;ncm;cest;origem;preco_custo;preco_venda;marca;grupo;categoria
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleSelecionarArquivoCSV}
                className="hidden"
                id="input-arquivo-csv"
                disabled={validandoCSV || importandoCSV}
              />
              <label
                htmlFor="input-arquivo-csv"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">
                  {arquivoCSV ? arquivoCSV.name : 'Clique para selecionar o arquivo .CSV'}
                </span>
                <span className="text-[11px] text-slate-400">
                  O sistema validará NCM, GTIN, Unidade e vínculos antes de importar.
                </span>
              </label>
            </div>

            {validandoCSV && (
              <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Validando linhas do arquivo...</span>
              </div>
            )}

            {resumoImportacao && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] text-slate-500 block">Total de Linhas</span>
                    <strong className="text-base text-slate-900">
                      {resumoImportacao.totalLinhas}
                    </strong>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <span className="text-[11px] text-emerald-700 block">Linhas Válidas</span>
                    <strong className="text-base text-emerald-800">
                      {resumoImportacao.linhasValidas.length}
                    </strong>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                    <span className="text-[11px] text-rose-700 block">Linhas com Erros</span>
                    <strong className="text-base text-rose-800">
                      {resumoImportacao.linhasComErro.length}
                    </strong>
                  </div>
                </div>

                {resumoImportacao.linhasComErro.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
                      <XCircle className="h-4 w-4" />
                      <span>Relatório de Erros por Linha (estas linhas não serão importadas):</span>
                    </div>

                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md text-[11px]">
                      {resumoImportacao.linhasComErro.map((linha, idx) => (
                        <div key={idx} className="p-2 bg-rose-50/30">
                          <div className="font-semibold text-slate-800">
                            Linha {linha.linhaNumero}: "{linha.descricao || 'Sem descrição'}"
                          </div>
                          <ul className="list-disc list-inside text-rose-600 mt-0.5 space-y-0.5">
                            {linha.erros.map((erro, eIdx) => (
                              <li key={eIdx}>{erro}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalImportacaoAberto(false)}
              disabled={importandoCSV}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleProcessarImportacao}
              disabled={
                !resumoImportacao ||
                resumoImportacao.linhasValidas.length === 0 ||
                importandoCSV ||
                validandoCSV
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {importandoCSV ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                `Importar ${resumoImportacao?.linhasValidas.length || 0} Produto(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* CONFIRMAÇÃO DE INATIVAÇÃO / REATIVAÇÃO */}
      {/* ======================================================== */}
      <AlertDialog open={dialogInativarAberto} onOpenChange={setDialogInativarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-900">
              {produtoAlvo?.ativo ? 'Inativar Produto' : 'Reativar Produto'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              {produtoAlvo?.ativo ? (
                <>
                  Deseja realmente inativar o produto <strong>{produtoAlvo?.descricao}</strong>?
                  <br />
                  Ele não aparecerá para novas vendas no PDV ou emissão de notas fiscais, mas todo o
                  seu histórico será preservado.
                </>
              ) : (
                <>
                  Deseja reativar o produto <strong>{produtoAlvo?.descricao}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarSituacao}
              disabled={processandoAcao}
              className={
                produtoAlvo?.ativo
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }
            >
              {processandoAcao
                ? 'Processando...'
                : produtoAlvo?.ativo
                  ? 'Confirmar Inativação'
                  : 'Confirmar Reativação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ProdutosLista
