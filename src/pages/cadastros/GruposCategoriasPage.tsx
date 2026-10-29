import React, { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import {
  Layers,
  FolderTree,
  Plus,
  Search,
  Edit2,
  Power,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  FolderPlus,
  Percent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import {
  Grupo,
  Categoria,
  Subcategoria,
  CategoriaComContagem,
  GrupoComCategorias,
  carregarArvoreMercadologica,
  salvarGrupo,
  salvarCategoria,
  salvarSubcategoria,
  inativarGrupo,
  ativarGrupo,
  inativarCategoria,
  ativarCategoria,
  inativarSubcategoria,
  ativarSubcategoria,
  listarTodosGruposAtivos,
} from '@/services/gruposCategorias'
import { SelectPerfilTributario } from '@/components/SelectPerfilTributario'

export const GruposCategoriasPage: React.FC = () => {
  const { pode } = usePermissoes()
  const podeCriar = pode('grupos_categorias', 'criar')
  const podeEditar = pode('grupos_categorias', 'editar')
  const podeInativar = pode('grupos_categorias', 'excluir')

  const { toast } = useToast()
  const [, startTransition] = useTransition()

  // Estados principais
  const [arvore, setArvore] = useState<GrupoComCategorias[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [gruposExpandidos, setGruposExpandidos] = useState<Record<string, boolean>>({})
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Record<string, boolean>>({})

  // Lista de grupos para seleção em modais
  const [gruposAtivos, setGruposAtivos] = useState<Grupo[]>([])

  // Modal Grupo
  const [modalGrupoAberto, setModalGrupoAberto] = useState(false)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [editandoGrupoId, setEditandoGrupoId] = useState<string | null>(null)
  const [codigoGrupo, setCodigoGrupo] = useState('')
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [margemGrupo, setMargemGrupo] = useState<string>('')
  const [perfilTributarioGrupo, setPerfilTributarioGrupo] = useState<string>('')
  const [errosGrupo, setErrosGrupo] = useState<{ codigo?: string; nome?: string }>({})

  // Modal Categoria
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false)
  const [salvandoCategoria, setSalvandoCategoria] = useState(false)
  const [editandoCategoriaId, setEditandoCategoriaId] = useState<string | null>(null)
  const [grupoIdCategoria, setGrupoIdCategoria] = useState('')
  const [codigoCategoria, setCodigoCategoria] = useState('')
  const [nomeCategoria, setNomeCategoria] = useState('')
  const [margemCategoria, setMargemCategoria] = useState<string>('')
  const [errosCategoria, setErrosCategoria] = useState<{ grupo_id?: string; nome?: string }>({})

  // Modal Subcategoria (Nível 3)
  const [modalSubcategoriaAberto, setModalSubcategoriaAberto] = useState(false)
  const [salvandoSubcategoria, setSalvandoSubcategoria] = useState(false)
  const [editandoSubcategoriaId, setEditandoSubcategoriaId] = useState<string | null>(null)
  const [categoriaIdSubcategoria, setCategoriaIdSubcategoria] = useState('')
  const [nomeCategoriaPaiSubcat, setNomeCategoriaPaiSubcat] = useState('')
  const [codigoSubcategoria, setCodigoSubcategoria] = useState('')
  const [nomeSubcategoria, setNomeSubcategoria] = useState('')
  const [margemSubcategoria, setMargemSubcategoria] = useState<string>('')
  const [errosSubcategoria, setErrosSubcategoria] = useState<{
    categoria_id?: string
    nome?: string
  }>({})

  // Ações de Inativação / Reativação
  const [itemParaInativar, setItemParaInativar] = useState<{
    tipo: 'grupo' | 'categoria' | 'subcategoria'
    id: string
    nome: string
    filhosAtivos?: number
  } | null>(null)
  const [itemParaAtivar, setItemParaAtivar] = useState<{
    tipo: 'grupo' | 'categoria' | 'subcategoria'
    id: string
    nome: string
  } | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Carregar dados da árvore
  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const dadosArvore = await carregarArvoreMercadologica({
        busca,
        situacao,
      })
      setArvore(dadosArvore)

      // Atualiza também grupos ativos disponíveis para cadastro de categoria
      const ativos = await listarTodosGruposAtivos()
      setGruposAtivos(ativos)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar grupos e categorias'
      toast({
        title: 'Erro ao carregar dados',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, situacao, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Se houver busca, expande automaticamente todos os grupos e categorias com resultado
  useEffect(() => {
    if (busca.trim()) {
      const expandirTodosGrupos: Record<string, boolean> = {}
      const expandirTodasCats: Record<string, boolean> = {}
      arvore.forEach((g) => {
        expandirTodosGrupos[g.id] = true
        g.categorias.forEach((c) => {
          expandirTodasCats[c.id] = true
        })
      })
      setGruposExpandidos(expandirTodosGrupos)
      setCategoriasExpandidas(expandirTodasCats)
    }
  }, [busca, arvore])

  const alternarExpansaoGrupo = (grupoId: string) => {
    setGruposExpandidos((prev) => ({
      ...prev,
      [grupoId]: !prev[grupoId],
    }))
  }

  const alternarExpansaoCategoria = (categoriaId: string) => {
    setCategoriasExpandidas((prev) => ({
      ...prev,
      [categoriaId]: !prev[categoriaId],
    }))
  }

  const expandirTudo = () => {
    const todosG: Record<string, boolean> = {}
    const todasC: Record<string, boolean> = {}
    arvore.forEach((g) => {
      todosG[g.id] = true
      g.categorias.forEach((c) => {
        todasC[c.id] = true
      })
    })
    setGruposExpandidos(todosG)
    setCategoriasExpandidas(todasC)
  }

  const recolherTudo = () => {
    setGruposExpandidos({})
    setCategoriasExpandidas({})
  }

  // -----------------------------------------------------------
  // HANDLERS GRUPO
  // -----------------------------------------------------------
  const handleNovoGrupo = () => {
    setEditandoGrupoId(null)
    setCodigoGrupo('')
    setNomeGrupo('')
    setMargemGrupo('')
    setPerfilTributarioGrupo('')
    setErrosGrupo({})
    setModalGrupoAberto(true)
  }

  const handleEditarGrupo = (g: Grupo) => {
    setEditandoGrupoId(g.id)
    setCodigoGrupo(g.codigo)
    setNomeGrupo(g.nome)
    setMargemGrupo(
      g.margem_padrao_percentual !== undefined && g.margem_padrao_percentual !== null
        ? String(g.margem_padrao_percentual)
        : '',
    )
    setPerfilTributarioGrupo(g.perfil_tributario_id || '')
    setErrosGrupo({})
    setModalGrupoAberto(true)
  }

  const handleSalvarGrupo = async (e: React.FormEvent) => {
    e.preventDefault()
    const codLimpo = codigoGrupo.trim().toUpperCase()
    const nomeLimpo = nomeGrupo.trim()
    const erros: { codigo?: string; nome?: string } = {}

    if (!codLimpo) erros.codigo = 'O código do grupo é obrigatório.'
    if (!nomeLimpo) erros.nome = 'O nome do grupo é obrigatório.'

    if (Object.keys(erros).length > 0) {
      setErrosGrupo(erros)
      return
    }

    setSalvandoGrupo(true)
    try {
      const margemNum = margemGrupo !== '' ? parseFloat(margemGrupo.replace(',', '.')) : null

      await salvarGrupo({
        id: editandoGrupoId || undefined,
        codigo: codLimpo,
        nome: nomeLimpo,
        margem_padrao_percentual: isNaN(margemNum as number) ? null : margemNum,
        perfil_tributario_id: perfilTributarioGrupo.trim() || undefined,
      })

      toast({
        title: editandoGrupoId ? 'Grupo atualizado' : 'Grupo cadastrado',
        description: `O grupo "${codLimpo} - ${nomeLimpo}" foi gravado com sucesso.`,
      })
      setModalGrupoAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar grupo'
      toast({
        title: 'Erro ao salvar grupo',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoGrupo(false)
    }
  }

  // -----------------------------------------------------------
  // HANDLERS CATEGORIA
  // -----------------------------------------------------------
  const handleNovaCategoria = (grupoIdPredefinido?: string) => {
    setEditandoCategoriaId(null)
    setGrupoIdCategoria(grupoIdPredefinido || (gruposAtivos[0]?.id ?? ''))
    setCodigoCategoria('')
    setNomeCategoria('')
    setMargemCategoria('')
    setErrosCategoria({})
    setModalCategoriaAberto(true)
  }

  const handleEditarCategoria = (c: Categoria) => {
    setEditandoCategoriaId(c.id)
    setGrupoIdCategoria(c.grupo_id)
    setCodigoCategoria(c.codigo || '')
    setNomeCategoria(c.nome)
    setMargemCategoria(
      c.margem_padrao_percentual !== undefined && c.margem_padrao_percentual !== null
        ? String(c.margem_padrao_percentual)
        : '',
    )
    setErrosCategoria({})
    setModalCategoriaAberto(true)
  }

  const handleSalvarCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = nomeCategoria.trim()
    const grupoIdLimpo = grupoIdCategoria.trim()
    const erros: { grupo_id?: string; nome?: string } = {}

    if (!grupoIdLimpo) erros.grupo_id = 'Selecione o grupo principal.'
    if (!nomeLimpo) erros.nome = 'O nome da categoria é obrigatório.'

    if (Object.keys(erros).length > 0) {
      setErrosCategoria(erros)
      return
    }

    setSalvandoCategoria(true)
    try {
      const margemNum =
        margemCategoria !== '' ? parseFloat(margemCategoria.replace(',', '.')) : null

      await salvarCategoria({
        id: editandoCategoriaId || undefined,
        grupo_id: grupoIdLimpo,
        codigo: codigoCategoria.trim().toUpperCase() || undefined,
        nome: nomeLimpo,
        margem_padrao_percentual: isNaN(margemNum as number) ? null : margemNum,
      })

      toast({
        title: editandoCategoriaId ? 'Categoria atualizada' : 'Categoria cadastrada',
        description: `A categoria "${nomeLimpo}" foi gravada com sucesso.`,
      })
      setModalCategoriaAberto(false)
      // Mantém o grupo aberto na árvore para visualização imediata
      setGruposExpandidos((prev) => ({ ...prev, [grupoIdLimpo]: true }))
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar categoria'
      toast({
        title: 'Erro ao salvar categoria',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoCategoria(false)
    }
  }

  // -----------------------------------------------------------
  // HANDLERS SUBCATEGORIA (Nível 3)
  // -----------------------------------------------------------
  const handleNovaSubcategoria = (categoria: CategoriaComContagem) => {
    setEditandoSubcategoriaId(null)
    setCategoriaIdSubcategoria(categoria.id)
    setNomeCategoriaPaiSubcat(categoria.nome)
    setCodigoSubcategoria('')
    setNomeSubcategoria('')
    setMargemSubcategoria('')
    setErrosSubcategoria({})
    setModalSubcategoriaAberto(true)
  }

  const handleEditarSubcategoria = (sub: Subcategoria, categoriaPai?: CategoriaComContagem) => {
    setEditandoSubcategoriaId(sub.id)
    setCategoriaIdSubcategoria(sub.categoria_id)
    setNomeCategoriaPaiSubcat(categoriaPai?.nome || '')
    setCodigoSubcategoria(sub.codigo || '')
    setNomeSubcategoria(sub.nome)
    setMargemSubcategoria(
      sub.margem_padrao_percentual !== undefined && sub.margem_padrao_percentual !== null
        ? String(sub.margem_padrao_percentual)
        : '',
    )
    setErrosSubcategoria({})
    setModalSubcategoriaAberto(true)
  }

  const handleSalvarSubcategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = nomeSubcategoria.trim()
    const categoriaIdLimpa = categoriaIdSubcategoria.trim()
    const erros: { categoria_id?: string; nome?: string } = {}

    if (!categoriaIdLimpa) erros.categoria_id = 'Selecione a categoria pai.'
    if (!nomeLimpo) erros.nome = 'O nome da subcategoria é obrigatório.'

    if (Object.keys(erros).length > 0) {
      setErrosSubcategoria(erros)
      return
    }

    setSalvandoSubcategoria(true)
    try {
      const margemNum =
        margemSubcategoria !== '' ? parseFloat(margemSubcategoria.replace(',', '.')) : null

      await salvarSubcategoria({
        id: editandoSubcategoriaId || undefined,
        categoria_id: categoriaIdLimpa,
        codigo: codigoSubcategoria.trim().toUpperCase() || undefined,
        nome: nomeLimpo,
        margem_padrao_percentual: isNaN(margemNum as number) ? null : margemNum,
      })

      toast({
        title: editandoSubcategoriaId ? 'Subcategoria atualizada' : 'Subcategoria cadastrada',
        description: `A subcategoria "${nomeLimpo}" foi gravada com sucesso.`,
      })
      setModalSubcategoriaAberto(false)
      // Mantém a categoria e o grupo abertos na árvore para visualização imediata
      setCategoriasExpandidas((prev) => ({ ...prev, [categoriaIdLimpa]: true }))
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar subcategoria'
      toast({
        title: 'Erro ao salvar subcategoria',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoSubcategoria(false)
    }
  }

  // -----------------------------------------------------------
  // HANDLERS INATIVAÇÃO / REATIVAÇÃO
  // -----------------------------------------------------------
  const handlePrepararInativacaoGrupo = (g: GrupoComCategorias) => {
    // Contar quantas categorias ativas ele tem
    const categoriasAtivas = g.categorias.filter((c) => c.ativo).length
    setItemParaInativar({
      tipo: 'grupo',
      id: g.id,
      nome: `${g.codigo} - ${g.nome}`,
      filhosAtivos: categoriasAtivas,
    })
  }

  const handlePrepararInativacaoCategoria = (c: CategoriaComContagem) => {
    // Contar quantas subcategorias ativas ela tem (Regra de negócio: bloquear inativação de categoria com subcategorias ativas)
    const subcategoriasAtivas = (c.subcategorias || []).filter((s) => s.ativo).length
    setItemParaInativar({
      tipo: 'categoria',
      id: c.id,
      nome: c.nome,
      filhosAtivos: subcategoriasAtivas,
    })
  }

  const handlePrepararInativacaoSubcategoria = (s: Subcategoria) => {
    setItemParaInativar({
      tipo: 'subcategoria',
      id: s.id,
      nome: s.nome,
    })
  }

  const handleConfirmarInativacao = async () => {
    if (!itemParaInativar) return
    setProcessandoAcao(true)
    try {
      if (itemParaInativar.tipo === 'grupo') {
        await inativarGrupo(itemParaInativar.id)
        toast({
          title: 'Grupo inativado',
          description: `O grupo "${itemParaInativar.nome}" foi inativado.`,
        })
      } else if (itemParaInativar.tipo === 'categoria') {
        await inativarCategoria(itemParaInativar.id)
        toast({
          title: 'Categoria inativada',
          description: `A categoria "${itemParaInativar.nome}" foi inativada.`,
        })
      } else {
        await inativarSubcategoria(itemParaInativar.id)
        toast({
          title: 'Subcategoria inativada',
          description: `A subcategoria "${itemParaInativar.nome}" foi inativada.`,
        })
      }
      setItemParaInativar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na inativação'
      toast({
        title: 'Operação não permitida',
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
      if (itemParaAtivar.tipo === 'grupo') {
        await ativarGrupo(itemParaAtivar.id)
        toast({
          title: 'Grupo reativado',
          description: `O grupo "${itemParaAtivar.nome}" está ativo novamente.`,
        })
      } else if (itemParaAtivar.tipo === 'categoria') {
        await ativarCategoria(itemParaAtivar.id)
        toast({
          title: 'Categoria reativada',
          description: `A categoria "${itemParaAtivar.nome}" está ativa novamente.`,
        })
      } else {
        await ativarSubcategoria(itemParaAtivar.id)
        toast({
          title: 'Subcategoria reativada',
          description: `A subcategoria "${itemParaAtivar.nome}" está ativa novamente.`,
        })
      }
      setItemParaAtivar(null)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na reativação'
      toast({
        title: 'Erro ao reativar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const totalCategorias = useMemo(() => {
    return arvore.reduce((acc, g) => acc + g.categorias.length, 0)
  }, [arvore])

  const totalSubcategorias = useMemo(() => {
    return arvore.reduce(
      (acc, g) =>
        acc + g.categorias.reduce((accCat, c) => accCat + (c.subcategorias?.length || 0), 0),
      0,
    )
  }, [arvore])

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Grupos e Categorias
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Estrutura mercadológica em árvore de 3 níveis (Grupo &gt; Categoria &gt; Subcategoria)
            para classificação e precificação de produtos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {podeCriar && (
            <>
              <Button
                variant="outline"
                onClick={() => handleNovaCategoria()}
                disabled={gruposAtivos.length === 0}
                className="text-slate-700 border-slate-300 hover:bg-slate-50"
              >
                <FolderPlus className="mr-2 h-4 w-4 text-blue-600" />
                Nova Categoria
              </Button>
              <Button
                onClick={handleNovoGrupo}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Grupo
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Card Principal */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Campo Busca */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou código do grupo ou categoria..."
                value={busca}
                onChange={(e) => {
                  const val = e.target.value
                  startTransition(() => {
                    setBusca(val)
                  })
                }}
                className="pl-9 bg-slate-50/50 border-slate-200 text-sm"
              />
            </div>

            {/* Controles: Filtro Situação e Expandir/Recolher */}
            <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  Situação:
                </span>
                <Select
                  value={situacao}
                  onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
                    setSituacao(val)
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

              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandirTudo}
                  className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Expandir tudo
                </Button>
                <span className="text-slate-300">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={recolherTudo}
                  className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Recolher tudo
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Cabeçalho da Lista / Tabela da Árvore */}
          <div className="border-y border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wider grid grid-cols-12 items-center">
            <div className="col-span-6 sm:col-span-5">Estrutura Mercadológica (3 Níveis)</div>
            <div className="col-span-3 sm:col-span-3 text-center sm:text-left">Margem de Venda</div>
            <div className="hidden sm:block sm:col-span-2 text-center">Produtos</div>
            <div className="col-span-3 sm:col-span-2 text-right">Ações</div>
          </div>

          {/* Conteúdo em Árvore */}
          <div className="divide-y divide-slate-100">
            {carregando ? (
              <div className="py-16 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="text-xs">Carregando grupos e categorias...</span>
                </div>
              </div>
            ) : arvore.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <Layers className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="font-medium text-slate-700">Nenhum registro encontrado</p>
                <p className="text-xs text-slate-400 mt-1">
                  {busca
                    ? 'Nenhum grupo ou categoria coincide com o termo pesquisado.'
                    : 'Cadastre o primeiro grupo para iniciar a árvore de produtos.'}
                </p>
                {podeCriar && !busca && (
                  <Button
                    onClick={handleNovoGrupo}
                    size="sm"
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Criar Primeiro Grupo
                  </Button>
                )}
              </div>
            ) : (
              arvore.map((grupo) => {
                const estaExpandido = Boolean(gruposExpandidos[grupo.id])
                const qtdCategorias = grupo.categorias.length

                return (
                  <div key={grupo.id} className="group/grupo">
                    {/* Linha do Grupo (Nível 1) */}
                    <div
                      className={`grid grid-cols-12 items-center px-4 py-3 transition-colors ${
                        !grupo.ativo
                          ? 'bg-slate-50/60 opacity-75'
                          : estaExpandido
                            ? 'bg-blue-50/30'
                            : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Nome e Toggle */}
                      <div className="col-span-6 sm:col-span-5 flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => alternarExpansaoGrupo(grupo.id)}
                          className="p-1 rounded-sm text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 shrink-0 transition-colors"
                          title={estaExpandido ? 'Recolher grupo' : 'Expandir grupo'}
                        >
                          {estaExpandido ? (
                            <ChevronDown className="h-4 w-4 text-blue-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>

                        <div className="shrink-0 font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-100/70 text-blue-800 border border-blue-200">
                          {grupo.codigo}
                        </div>

                        <span className="font-semibold text-slate-900 text-sm truncate">
                          {grupo.nome}
                        </span>

                        <Badge
                          variant="secondary"
                          className="hidden lg:inline-flex text-[10px] py-0 px-1.5 font-normal text-slate-500 bg-slate-100"
                        >
                          {qtdCategorias} {qtdCategorias === 1 ? 'categoria' : 'categorias'}
                        </Badge>

                        {!grupo.ativo && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5 bg-slate-200 text-slate-600"
                          >
                            Inativo
                          </Badge>
                        )}
                      </div>

                      {/* Margem Padrão */}
                      <div className="col-span-3 sm:col-span-3 text-center sm:text-left text-xs text-slate-700">
                        {grupo.margem_padrao_percentual !== undefined &&
                        grupo.margem_padrao_percentual !== null ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            <Percent className="h-3 w-3" />
                            {Number(grupo.margem_padrao_percentual).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Não definida</span>
                        )}
                      </div>

                      {/* Quantidade de Produtos */}
                      <div className="hidden sm:flex sm:col-span-2 items-center justify-center text-xs">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium"
                          title="Quantidade de produtos vinculados neste grupo"
                        >
                          <Package className="h-3 w-3 text-slate-400" />
                          {grupo.quantidade_produtos}
                        </span>
                      </div>

                      {/* Ações do Grupo */}
                      <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                        {podeCriar && grupo.ativo && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleNovaCategoria(grupo.id)}
                            className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Adicionar categoria dentro deste grupo"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            <span className="hidden md:inline">Categoria</span>
                          </Button>
                        )}

                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditarGrupo(grupo)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar grupo"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {podeInativar &&
                          (grupo.ativo ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrepararInativacaoGrupo(grupo)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                              title="Inativar grupo"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setItemParaAtivar({
                                  tipo: 'grupo',
                                  id: grupo.id,
                                  nome: grupo.nome,
                                })
                              }
                              className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                              title="Reativar grupo"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ))}
                      </div>
                    </div>

                    {/* Categorias (Nível 2 — expandido) */}
                    {estaExpandido && (
                      <div className="bg-slate-50/40 divide-y divide-slate-100/80 border-t border-slate-100">
                        {grupo.categorias.length === 0 ? (
                          <div className="py-4 pl-12 pr-4 text-xs text-slate-400 italic flex items-center justify-between">
                            <span>Nenhuma categoria cadastrada neste grupo.</span>
                            {podeCriar && grupo.ativo && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleNovaCategoria(grupo.id)}
                                className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Cadastrar Categoria
                              </Button>
                            )}
                          </div>
                        ) : (
                          grupo.categorias.map((cat) => {
                            const estaCatExpandida = Boolean(categoriasExpandidas[cat.id])
                            const subcategoriasDaCat = cat.subcategorias || []
                            const qtdSubcategorias = subcategoriasDaCat.length

                            return (
                              <div key={cat.id} className="group/categoria">
                                {/* Linha da Categoria (Nível 2) */}
                                <div
                                  className={`grid grid-cols-12 items-center pl-6 sm:pl-8 pr-4 py-2.5 transition-colors ${
                                    !cat.ativo
                                      ? 'opacity-65 bg-slate-100/40'
                                      : estaCatExpandida
                                        ? 'bg-indigo-50/30'
                                        : 'hover:bg-slate-100/70'
                                  }`}
                                >
                                  {/* Nome da categoria com toggle de expandir subcategorias */}
                                  <div className="col-span-6 sm:col-span-5 flex items-center gap-1.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => alternarExpansaoCategoria(cat.id)}
                                      className="p-1 rounded-sm text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 shrink-0 transition-colors"
                                      title={
                                        estaCatExpandida
                                          ? 'Recolher subcategorias'
                                          : 'Expandir subcategorias'
                                      }
                                    >
                                      {estaCatExpandida ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>

                                    {cat.codigo ? (
                                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0 font-medium">
                                        {cat.codigo}
                                      </span>
                                    ) : (
                                      <span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                                    )}

                                    <span className="text-xs font-semibold text-slate-800 truncate">
                                      {cat.nome}
                                    </span>

                                    <Badge
                                      variant="secondary"
                                      className="hidden md:inline-flex text-[9px] py-0 px-1 font-normal text-slate-500 bg-slate-200/60"
                                      title="Total de subcategorias nesta categoria"
                                    >
                                      {qtdSubcategorias}{' '}
                                      {qtdSubcategorias === 1 ? 'subcat' : 'subcats'}
                                    </Badge>

                                    {!cat.ativo && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] py-0 px-1 text-slate-500 border-slate-300"
                                      >
                                        Inativa
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Margem da Categoria (ou herança do grupo) */}
                                  <div className="col-span-3 sm:col-span-3 text-center sm:text-left text-xs">
                                    {cat.margem_padrao_percentual !== undefined &&
                                    cat.margem_padrao_percentual !== null ? (
                                      <span className="inline-flex items-center gap-0.5 font-medium text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                                        <Percent className="h-2.5 w-2.5 text-slate-400" />
                                        {Number(cat.margem_padrao_percentual).toFixed(2)}%
                                      </span>
                                    ) : grupo.margem_padrao_percentual !== undefined &&
                                      grupo.margem_padrao_percentual !== null ? (
                                      <span
                                        className="text-[11px] text-slate-500 italic inline-flex items-center gap-1"
                                        title="Herda margem padrão do grupo"
                                      >
                                        <span>herda grupo:</span>
                                        <span className="font-semibold text-slate-700">
                                          {Number(grupo.margem_padrao_percentual).toFixed(2)}%
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic">—</span>
                                    )}
                                  </div>

                                  {/* Quantidade de produtos */}
                                  <div className="hidden sm:flex sm:col-span-2 items-center justify-center text-xs text-slate-500">
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium"
                                      title="Quantidade de produtos vinculados a esta categoria"
                                    >
                                      <Package className="h-2.5 w-2.5 text-slate-400" />
                                      {cat.quantidade_produtos ?? 0}
                                    </span>
                                  </div>

                                  {/* Ações da Categoria */}
                                  <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                                    {podeCriar && cat.ativo && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleNovaSubcategoria(cat)}
                                        className="h-7 px-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                        title="Adicionar subcategoria nesta categoria"
                                      >
                                        <Plus className="h-3 w-3 mr-0.5" />
                                        <span className="hidden lg:inline text-[11px]">
                                          Subcategoria
                                        </span>
                                      </Button>
                                    )}

                                    {podeEditar && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditarCategoria(cat)}
                                        className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600 hover:bg-white"
                                        title="Editar categoria"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                    )}

                                    {podeInativar &&
                                      (cat.ativo ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handlePrepararInativacaoCategoria(cat)}
                                          className="h-7 w-7 p-0 text-slate-400 hover:text-amber-600 hover:bg-white"
                                          title="Inativar categoria"
                                        >
                                          <Power className="h-3 w-3" />
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setItemParaAtivar({
                                              tipo: 'categoria',
                                              id: cat.id,
                                              nome: cat.nome,
                                            })
                                          }
                                          className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-600 hover:bg-white"
                                          title="Reativar categoria"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </Button>
                                      ))}
                                  </div>
                                </div>

                                {/* Subcategorias (Nível 3 — expandido) */}
                                {estaCatExpandida && (
                                  <div className="bg-slate-100/50 divide-y divide-slate-200/50 border-t border-slate-200/60">
                                    {subcategoriasDaCat.length === 0 ? (
                                      <div className="py-2.5 pl-14 sm:pl-16 pr-4 text-xs text-slate-400 italic flex items-center justify-between">
                                        <span>
                                          Nenhuma subcategoria cadastrada nesta categoria.
                                        </span>
                                        {podeCriar && cat.ativo && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleNovaSubcategoria(cat)}
                                            className="h-6 text-[11px] text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                          >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Nova Subcategoria
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      subcategoriasDaCat.map((sub) => (
                                        <div
                                          key={sub.id}
                                          className={`grid grid-cols-12 items-center pl-12 sm:pl-16 pr-4 py-2 hover:bg-slate-200/40 transition-colors ${
                                            !sub.ativo ? 'opacity-60 bg-slate-200/30' : ''
                                          }`}
                                        >
                                          {/* Nome da subcategoria com ícone de nível 3 */}
                                          <div className="col-span-6 sm:col-span-5 flex items-center gap-1.5 min-w-0">
                                            <span className="text-slate-300 font-mono text-xs shrink-0">
                                              └─
                                            </span>
                                            {sub.codigo ? (
                                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0 font-medium">
                                                {sub.codigo}
                                              </span>
                                            ) : (
                                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                                            )}
                                            <span className="text-xs text-slate-700 truncate font-normal">
                                              {sub.nome}
                                            </span>
                                            {!sub.ativo && (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] py-0 px-1 text-slate-500 border-slate-300"
                                              >
                                                Inativa
                                              </Badge>
                                            )}
                                          </div>

                                          {/* Margem da Subcategoria (ou herança categoria/grupo) */}
                                          <div className="col-span-3 sm:col-span-3 text-center sm:text-left text-xs">
                                            {sub.margem_padrao_percentual !== undefined &&
                                            sub.margem_padrao_percentual !== null ? (
                                              <span className="inline-flex items-center gap-0.5 font-medium text-indigo-700 bg-indigo-50/80 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px]">
                                                <Percent className="h-2.5 w-2.5 text-indigo-500" />
                                                {Number(sub.margem_padrao_percentual).toFixed(2)}%
                                              </span>
                                            ) : cat.margem_padrao_percentual !== undefined &&
                                              cat.margem_padrao_percentual !== null ? (
                                              <span
                                                className="text-[10px] text-slate-500 italic inline-flex items-center gap-1"
                                                title="Herda margem padrão da categoria"
                                              >
                                                <span>herda cat:</span>
                                                <span className="font-medium text-slate-700">
                                                  {Number(cat.margem_padrao_percentual).toFixed(2)}%
                                                </span>
                                              </span>
                                            ) : grupo.margem_padrao_percentual !== undefined &&
                                              grupo.margem_padrao_percentual !== null ? (
                                              <span
                                                className="text-[10px] text-slate-400 italic inline-flex items-center gap-1"
                                                title="Herda margem padrão do grupo"
                                              >
                                                <span>herda grupo:</span>
                                                <span className="font-medium text-slate-600">
                                                  {Number(grupo.margem_padrao_percentual).toFixed(
                                                    2,
                                                  )}
                                                  %
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-[10px] text-slate-400 italic">
                                                —
                                              </span>
                                            )}
                                          </div>

                                          {/* Quantidade de produtos na Subcategoria */}
                                          <div className="hidden sm:flex sm:col-span-2 items-center justify-center text-xs text-slate-500">
                                            <span
                                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.2 rounded bg-white/80 border border-slate-200 text-slate-600"
                                              title="Quantidade de produtos vinculados a esta subcategoria"
                                            >
                                              <Package className="h-2.5 w-2.5 text-slate-400" />
                                              {sub.quantidade_produtos ?? 0}
                                            </span>
                                          </div>

                                          {/* Ações da Subcategoria */}
                                          <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                                            {podeEditar && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditarSubcategoria(sub, cat)}
                                                className="h-6 w-6 p-0 text-slate-500 hover:text-indigo-600 hover:bg-white"
                                                title="Editar subcategoria"
                                              >
                                                <Edit2 className="h-3 w-3" />
                                              </Button>
                                            )}

                                            {podeInativar &&
                                              (sub.ativo ? (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() =>
                                                    handlePrepararInativacaoSubcategoria(sub)
                                                  }
                                                  className="h-6 w-6 p-0 text-slate-400 hover:text-amber-600 hover:bg-white"
                                                  title="Inativar subcategoria"
                                                >
                                                  <Power className="h-3 w-3" />
                                                </Button>
                                              ) : (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() =>
                                                    setItemParaAtivar({
                                                      tipo: 'subcategoria',
                                                      id: sub.id,
                                                      nome: sub.nome,
                                                    })
                                                  }
                                                  className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-600 hover:bg-white"
                                                  title="Reativar subcategoria"
                                                >
                                                  <RotateCcw className="h-3 w-3" />
                                                </Button>
                                              ))}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Rodapé Informativo */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-200 text-xs text-slate-500 gap-2 bg-slate-50/50">
            <div>
              Total: <strong>{arvore.length}</strong> grupo(s), <strong>{totalCategorias}</strong>{' '}
              categoria(s) e <strong>{totalSubcategorias}</strong> subcategoria(s) cadastrada(s).
            </div>
            <div className="text-[11px] text-slate-400">
              * A contagem reflete os produtos ativos cadastrados em cada grupo, categoria e
              subcategoria.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* MODAL GRUPO (Nível 1) */}
      {/* ======================================================== */}
      <Dialog open={modalGrupoAberto} onOpenChange={setModalGrupoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarGrupo}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editandoGrupoId ? 'Editar Grupo' : 'Novo Grupo'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Grupos representam o nível 1 da estrutura de classificação de produtos (ex: Bebidas,
                Mercearia, Limpeza).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <Label htmlFor="grupo-codigo" className="text-xs font-semibold text-slate-700">
                    Código <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="grupo-codigo"
                    value={codigoGrupo}
                    onChange={(e) => {
                      setCodigoGrupo(e.target.value.toUpperCase())
                      if (errosGrupo.codigo)
                        setErrosGrupo((prev) => ({ ...prev, codigo: undefined }))
                    }}
                    placeholder="Ex: 01"
                    maxLength={10}
                    className="font-mono uppercase font-bold"
                    autoFocus
                  />
                  {errosGrupo.codigo && (
                    <p className="text-xs text-rose-600 font-medium">{errosGrupo.codigo}</p>
                  )}
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="grupo-nome" className="text-xs font-semibold text-slate-700">
                    Nome do Grupo <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="grupo-nome"
                    value={nomeGrupo}
                    onChange={(e) => {
                      setNomeGrupo(e.target.value)
                      if (errosGrupo.nome) setErrosGrupo((prev) => ({ ...prev, nome: undefined }))
                    }}
                    placeholder="Ex: Bebidas"
                  />
                  {errosGrupo.nome && (
                    <p className="text-xs text-rose-600 font-medium">{errosGrupo.nome}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grupo-margem" className="text-xs font-semibold text-slate-700">
                  Margem Padrão de Venda (%)
                </Label>
                <div className="relative">
                  <Input
                    id="grupo-margem"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    value={margemGrupo}
                    onChange={(e) => setMargemGrupo(e.target.value)}
                    placeholder="Ex: 35.00"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Percentual utilizado futuramente para sugerir o preço de venda das mercadorias.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grupo-perfil" className="text-xs font-semibold text-slate-700">
                  Perfil Tributário Padrão
                </Label>
                <SelectPerfilTributario
                  id="grupo-perfil"
                  value={perfilTributarioGrupo}
                  onChange={(id) => setPerfilTributarioGrupo(id)}
                  placeholder="Selecione o perfil tributário para os produtos deste grupo..."
                />
                <p className="text-[11px] text-slate-400">
                  Produtos cadastrados neste grupo herdarão automaticamente este modelo tributário.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalGrupoAberto(false)}
                disabled={salvandoGrupo}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={salvandoGrupo}
              >
                {salvandoGrupo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Grupo'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL CATEGORIA (Nível 2) */}
      {/* ======================================================== */}
      <Dialog open={modalCategoriaAberto} onOpenChange={setModalCategoriaAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarCategoria}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editandoCategoriaId ? 'Editar Categoria' : 'Nova Categoria'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Categorias pertencem a um grupo e representam o nível 2 da classificação (ex:
                Refrigerantes dentro de Bebidas).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-grupo" className="text-xs font-semibold text-slate-700">
                  Grupo Principal <span className="text-rose-600">*</span>
                </Label>
                <Select
                  value={grupoIdCategoria}
                  onValueChange={(val) => {
                    setGrupoIdCategoria(val)
                    if (errosCategoria.grupo_id)
                      setErrosCategoria((prev) => ({ ...prev, grupo_id: undefined }))
                  }}
                  disabled={Boolean(editandoCategoriaId)} // Evita troca de grupo em edição se não desejado
                >
                  <SelectTrigger id="cat-grupo" className="text-xs">
                    <SelectValue placeholder="Selecione o grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gruposAtivos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="font-mono font-bold text-blue-700 mr-2">{g.codigo}</span>
                        <span>{g.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errosCategoria.grupo_id && (
                  <p className="text-xs text-rose-600 font-medium">{errosCategoria.grupo_id}</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <Label htmlFor="cat-codigo" className="text-xs font-semibold text-slate-700">
                    Código
                  </Label>
                  <Input
                    id="cat-codigo"
                    value={codigoCategoria}
                    onChange={(e) => setCodigoCategoria(e.target.value.toUpperCase())}
                    placeholder="Ex: 01.01"
                    maxLength={10}
                    className="font-mono uppercase"
                  />
                  <p className="text-[10px] text-slate-400">Opcional</p>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="cat-nome" className="text-xs font-semibold text-slate-700">
                    Nome da Categoria <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="cat-nome"
                    value={nomeCategoria}
                    onChange={(e) => {
                      setNomeCategoria(e.target.value)
                      if (errosCategoria.nome)
                        setErrosCategoria((prev) => ({ ...prev, nome: undefined }))
                    }}
                    placeholder="Ex: Refrigerantes, Sucos..."
                    autoFocus
                  />
                  {errosCategoria.nome && (
                    <p className="text-xs text-rose-600 font-medium">{errosCategoria.nome}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cat-margem" className="text-xs font-semibold text-slate-700">
                  Margem Padrão de Venda (%)
                </Label>
                <div className="relative">
                  <Input
                    id="cat-margem"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    value={margemCategoria}
                    onChange={(e) => setMargemCategoria(e.target.value)}
                    placeholder="Deixe em branco para herdar do grupo"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Opcional. Se não informada, a categoria herdará automaticamente a margem do grupo.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalCategoriaAberto(false)}
                disabled={salvandoCategoria}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={salvandoCategoria}
              >
                {salvandoCategoria ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Categoria'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL SUBCATEGORIA (Nível 3) */}
      {/* ======================================================== */}
      <Dialog open={modalSubcategoriaAberto} onOpenChange={setModalSubcategoriaAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarSubcategoria}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editandoSubcategoriaId ? 'Editar Subcategoria' : 'Nova Subcategoria'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Subcategorias pertencem a uma categoria e representam o nível 3 da classificação
                (ex: Refrigerante Lata 350ml dentro de Refrigerantes).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Categoria Pai <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={nomeCategoriaPaiSubcat || 'Categoria Selecionada'}
                  disabled
                  className="bg-slate-100 text-slate-700 font-medium text-xs cursor-not-allowed"
                />
                {errosSubcategoria.categoria_id && (
                  <p className="text-xs text-rose-600 font-medium">
                    {errosSubcategoria.categoria_id}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <Label htmlFor="subcat-codigo" className="text-xs font-semibold text-slate-700">
                    Código
                  </Label>
                  <Input
                    id="subcat-codigo"
                    value={codigoSubcategoria}
                    onChange={(e) => setCodigoSubcategoria(e.target.value.toUpperCase())}
                    placeholder="Automático"
                    maxLength={10}
                    className="font-mono uppercase"
                  />
                  <p className="text-[10px] text-slate-400">Código automático se vazio</p>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="subcat-nome" className="text-xs font-semibold text-slate-700">
                    Nome da Subcategoria <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="subcat-nome"
                    value={nomeSubcategoria}
                    onChange={(e) => {
                      setNomeSubcategoria(e.target.value)
                      if (errosSubcategoria.nome)
                        setErrosSubcategoria((prev) => ({ ...prev, nome: undefined }))
                    }}
                    placeholder="Ex: Lata 350ml, Garrafa 2L..."
                    autoFocus
                  />
                  {errosSubcategoria.nome && (
                    <p className="text-xs text-rose-600 font-medium">{errosSubcategoria.nome}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subcat-margem" className="text-xs font-semibold text-slate-700">
                  Margem Padrão de Venda (%)
                </Label>
                <div className="relative">
                  <Input
                    id="subcat-margem"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    value={margemSubcategoria}
                    onChange={(e) => setMargemSubcategoria(e.target.value)}
                    placeholder="Deixe em branco para herdar da categoria"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    %
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Opcional. Se não informada, a subcategoria herdará a margem da categoria pai (ou
                  do grupo).
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalSubcategoriaAberto(false)}
                disabled={salvandoSubcategoria}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={salvandoSubcategoria}
              >
                {salvandoSubcategoria ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Subcategoria'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* CONFIRMAÇÃO DE INATIVAÇÃO (COM REGRA DE BLOQUEIO) */}
      {/* ======================================================== */}
      <AlertDialog
        open={Boolean(itemParaInativar)}
        onOpenChange={(aberto) => !aberto && setItemParaInativar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>
                Inativar{' '}
                {itemParaInativar?.tipo === 'grupo'
                  ? 'Grupo'
                  : itemParaInativar?.tipo === 'categoria'
                    ? 'Categoria'
                    : 'Subcategoria'}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              {itemParaInativar?.tipo === 'grupo' && (itemParaInativar.filhosAtivos || 0) > 0 ? (
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1.5">
                  <p className="font-semibold text-sm">
                    Bloqueio de inativação: categorias ativas encontradas!
                  </p>
                  <p>
                    O grupo <strong>{itemParaInativar.nome}</strong> possui{' '}
                    <strong>{itemParaInativar.filhosAtivos}</strong> categoria(s) ativa(s).
                  </p>
                  <p>
                    Por regra do sistema, não é permitido inativar um grupo com categorias ativas.
                    Inative ou transfira todas as categorias deste grupo antes de prosseguir.
                  </p>
                </div>
              ) : itemParaInativar?.tipo === 'categoria' &&
                (itemParaInativar.filhosAtivos || 0) > 0 ? (
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1.5">
                  <p className="font-semibold text-sm">
                    Bloqueio de inativação: subcategorias ativas encontradas!
                  </p>
                  <p>
                    A categoria <strong>{itemParaInativar.nome}</strong> possui{' '}
                    <strong>{itemParaInativar.filhosAtivos}</strong> subcategoria(s) ativa(s).
                  </p>
                  <p>
                    Por regra do sistema, não é permitido inativar uma categoria com subcategorias
                    ativas. Inative as subcategorias antes de inativar a categoria.
                  </p>
                </div>
              ) : (
                <>
                  Deseja realmente inativar{' '}
                  {itemParaInativar?.tipo === 'grupo'
                    ? 'o grupo'
                    : itemParaInativar?.tipo === 'categoria'
                      ? 'a categoria'
                      : 'a subcategoria'}{' '}
                  <strong className="text-slate-900">{itemParaInativar?.nome}</strong>?
                  {itemParaInativar?.tipo === 'grupo'
                    ? ' O grupo não poderá receber novas categorias ou produtos.'
                    : itemParaInativar?.tipo === 'categoria'
                      ? ' A categoria não poderá receber novas subcategorias ou produtos.'
                      : ' A subcategoria não poderá ser associada a novos produtos.'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoAcao}>
              {(itemParaInativar?.filhosAtivos || 0) > 0 ? 'Fechar' : 'Cancelar'}
            </AlertDialogCancel>
            {/* O botão de confirmar só fica ativo se NÃO tiver filhos ativos bloqueando */}
            {!((itemParaInativar?.filhosAtivos || 0) > 0) && (
              <AlertDialogAction
                onClick={handleConfirmarInativacao}
                disabled={processandoAcao}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {processandoAcao ? 'Inativando...' : 'Sim, inativar'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ======================================================== */}
      {/* CONFIRMAÇÃO DE REATIVAÇÃO */}
      {/* ======================================================== */}
      <AlertDialog
        open={Boolean(itemParaAtivar)}
        onOpenChange={(aberto) => !aberto && setItemParaAtivar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle2 className="h-5 w-5" />
              <AlertDialogTitle>
                Reativar{' '}
                {itemParaAtivar?.tipo === 'grupo'
                  ? 'Grupo'
                  : itemParaAtivar?.tipo === 'categoria'
                    ? 'Categoria'
                    : 'Subcategoria'}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-slate-600">
              Deseja reativar{' '}
              {itemParaAtivar?.tipo === 'grupo'
                ? 'o grupo'
                : itemParaAtivar?.tipo === 'categoria'
                  ? 'a categoria'
                  : 'a subcategoria'}{' '}
              <strong className="text-slate-900">{itemParaAtivar?.nome}</strong>? Ele(a) voltará a
              ficar disponível para novas vinculações de produtos e categorias/subcategorias.
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

export default GruposCategoriasPage
