import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Search,
  ArrowRight,
  FolderTree,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Building,
  ChevronRight,
  SlidersHorizontal,
  Bookmark,
  Share2,
  Trash2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  CATALOGO_RELATORIOS,
  CATEGORIAS_RELATORIOS,
  CategoriaRelatorio,
  ItemRelatorioCatalogo,
} from '@/config/relatoriosCatalogo'
import {
  RelatorioSalvoRegistro,
  listarRelatoriosSalvos,
  excluirRelatorioSalvo,
} from '@/services/relatorioPersonalizado'
import { useToast } from '@/hooks/use-toast'

export const CentralRelatoriosPage: React.FC = () => {
  const { toast } = useToast()
  const { pode, administrador } = usePermissoes()
  const { empresas } = useEmpresaAtiva()
  const temMultiplasEmpresas = empresas.length > 1
  const podeVerRelatorios = pode('relatorios', 'ver') || administrador

  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoriaRelatorio | 'todos'>('todos')

  // Relatórios Salvos (Prompt 8.6 Item 4)
  const [meusRelatorios, setMeusRelatorios] = useState<RelatorioSalvoRegistro[]>([])
  const [relatoriosEmpresa, setRelatoriosEmpresa] = useState<RelatorioSalvoRegistro[]>([])
  const [carregandoSalvos, setCarregandoSalvos] = useState(false)

  const carregarSalvos = async () => {
    setCarregandoSalvos(true)
    try {
      const res = await listarRelatoriosSalvos()
      setMeusRelatorios(res.meusRelatorios)
      setRelatoriosEmpresa(res.relatoriosEmpresa)
    } catch {
      /* intentionally ignored */
    } finally {
      setCarregandoSalvos(false)
    }
  }

  useEffect(() => {
    carregarSalvos()
  }, [])

  const handleExcluirSalvo = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Deseja realmente remover este relatório salvo?')) return
    try {
      await excluirRelatorioSalvo(id)
      toast({ title: 'Relatório removido' })
      carregarSalvos()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao remover',
        description: err instanceof Error ? err.message : 'Falha ao remover.',
        variant: 'destructive',
      })
    }
  }

  // Filtra relatórios aos quais o usuário tem permissão de visualização
  const relatoriosAutorizados = useMemo(() => {
    return CATALOGO_RELATORIOS.filter((item) => {
      // Regra 8.5: Painel do grupo exige acesso a mais de 1 empresa e permissão relatorios
      if (item.id === 'painel_grupo') {
        if (!temMultiplasEmpresas) return false
        if (!podeVerRelatorios) return false
        return true
      }
      if (administrador) return true
      return pode(item.modulo, 'ver')
    })
  }, [pode, administrador, temMultiplasEmpresas, podeVerRelatorios])

  // Aplica filtro de busca por texto e categoria
  const relatoriosFiltrados = useMemo(() => {
    return relatoriosAutorizados.filter((item) => {
      // Filtro de categoria
      if (categoriaAtiva !== 'todos' && item.categoria !== categoriaAtiva) {
        return false
      }

      // Filtro de busca textual (nome, descrição ou categoria)
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const matchNome = item.nome.toLowerCase().includes(termo)
        const matchDescricao = item.descricao.toLowerCase().includes(termo)
        const matchCategoria = item.categoria.toLowerCase().includes(termo)
        return matchNome || matchDescricao || matchCategoria
      }

      return true
    })
  }, [relatoriosAutorizados, categoriaAtiva, busca])

  // Agrupa os relatórios filtrados por categoria
  const gruposCategorias = useMemo(() => {
    return CATEGORIAS_RELATORIOS.map((cat) => {
      const itens = relatoriosFiltrados.filter((r) => r.categoria === cat.id)
      return {
        ...cat,
        itens,
      }
    }).filter((g) => g.itens.length > 0)
  }, [relatoriosFiltrados])

  // Contagem de relatórios disponíveis
  const totalDisponiveis = relatoriosAutorizados.length

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Central de Relatórios
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Acesse e consulte todos os relatórios analíticos, sintéticos e gerenciais do ERP.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/relatorios/personalizado">
            <Button className="h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Novo Relatório Personalizado</span>
            </Button>
          </Link>
          <Badge
            variant="outline"
            className="bg-white border-slate-200 text-slate-700 px-3 py-1 text-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            {totalDisponiveis}{' '}
            {totalDisponiveis === 1 ? 'relatório disponível' : 'relatórios disponíveis'}
          </Badge>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SEÇÃO 1: MEUS RELATÓRIOS SALVOS (Prompt 8.6 Item 4)             */}
      {/* ============================================================== */}
      {meusRelatorios.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-indigo-600" />
              <span>Meus Relatórios Salvos</span>
              <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700">
                {meusRelatorios.length}
              </Badge>
            </h2>
            <Link
              to="/relatorios/personalizado"
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              Criar outro relatório
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meusRelatorios.map((rel) => (
              <Card
                key={rel.id}
                className="border-indigo-100 bg-white hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2 rounded bg-indigo-50 text-indigo-700">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-1">
                      {rel.compartilhado && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] bg-blue-50 text-blue-700 flex items-center gap-0.5"
                        >
                          <Share2 className="h-2.5 w-2.5" /> Compartilhado
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleExcluirSalvo(rel.id, e)}
                        title="Remover relatório salvo"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <CardTitle className="text-sm font-semibold text-slate-900 mt-2">
                    {rel.nome}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 line-clamp-2">
                    {rel.descricao ||
                      `Base: ${rel.base === 'itens_vendidos' ? 'Vendas' : 'Compras'} · Agrupado por: ${rel.agrupamentos.join(' > ')}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-medium">
                    <Link
                      to="/relatorios/personalizado"
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>Abrir relatório</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <span className="text-[10px] text-slate-400">
                      {rel.created ? new Date(rel.created).toLocaleDateString('pt-BR') : ''}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SEÇÃO 2: RELATÓRIOS DA EMPRESA (COMPARTILHADOS) (Prompt 8.6)    */}
      {/* ============================================================== */}
      {relatoriosEmpresa.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-600" />
              <span>Relatórios da Empresa (Compartilhados)</span>
              <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700">
                {relatoriosEmpresa.length}
              </Badge>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatoriosEmpresa.map((rel) => (
              <Card
                key={rel.id}
                className="border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2 rounded bg-blue-50 text-blue-700">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <Badge variant="outline" className="text-[9px] text-slate-600 border-slate-200">
                      {rel.base === 'itens_vendidos' ? 'Vendas' : 'Compras'}
                    </Badge>
                  </div>
                  <CardTitle className="text-sm font-semibold text-slate-900 mt-2">
                    {rel.nome}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 line-clamp-2">
                    {rel.descricao || `Agrupado por: ${rel.agrupamentos.join(' > ')}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-medium">
                    <Link
                      to="/relatorios/personalizado"
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>Abrir relatório</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <span className="text-[10px] text-slate-400">
                      Por: {rel.expand?.usuario_id?.name || 'Equipe'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Card de Destaque no Topo: Painel do Grupo (Prompt 8.5) */}
      {temMultiplasEmpresas && podeVerRelatorios && (
        <Card className="border-indigo-200 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 flex items-center justify-center pointer-events-none">
            <Building className="w-64 h-64 text-white" />
          </div>
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 z-10">
                <div className="flex items-center gap-2">
                  <Badge className="bg-indigo-500 text-white text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                    Visão Consolidada Multiempresa
                  </Badge>
                  <span className="text-xs text-indigo-200">{empresas.length} filiais ativas</span>
                </div>
                <CardTitle className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Building className="h-5 w-5 text-indigo-300" />
                  <span>Painel do Grupo</span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-indigo-100 max-w-2xl leading-relaxed">
                  Acompanhe em tempo real o faturamento consolidado e comparativo loja a loja (mês
                  atual, mês anterior e mesmo mês do ano anterior), margem bruta, vendas
                  interestaduais, estoque e financeiro dos próximos 30 dias.
                </CardDescription>
              </div>

              <div className="z-10 shrink-0">
                <Link to="/painel-grupo">
                  <Button className="bg-white text-indigo-900 hover:bg-indigo-50 shadow-sm font-semibold text-xs gap-1.5 h-9">
                    <span>Acessar Painel do Grupo</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Barra de Filtros e Busca Rápida */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar relatório por nome ou assunto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-9 text-xs bg-white border-slate-200 shadow-2xs"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Filtro por Categoria de Relatórios */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoriaAtiva('todos')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              categoriaAtiva === 'todos'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todos ({relatoriosAutorizados.length})
          </button>
          {CATEGORIAS_RELATORIOS.map((cat) => {
            const count = relatoriosAutorizados.filter((r) => r.categoria === cat.id).length
            if (count === 0 && !administrador) return null
            const ativa = categoriaAtiva === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaAtiva(cat.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  ativa
                    ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.id} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista de Grupos de Relatórios */}
      {gruposCategorias.length === 0 ? (
        <Card className="border-slate-200 p-8 text-center bg-white">
          <div className="max-w-md mx-auto space-y-3">
            <div className="p-3 bg-slate-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-slate-500">
              <FolderTree className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">Nenhum relatório encontrado</h3>
            <p className="text-xs text-slate-500">
              {busca
                ? `Nenhum relatório corresponde ao termo "${busca}". Tente outra pesquisa.`
                : 'Você não possui permissão de acesso aos relatórios desta categoria ou não há relatórios cadastrados.'}
            </p>
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="text-xs text-blue-600 hover:underline font-medium inline-block"
              >
                Limpar busca
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {gruposCategorias.map((grupo) => (
            <div key={grupo.id} className="space-y-3">
              {/* Cabeçalho da Categoria */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{grupo.label}</span>
                    <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600">
                      {grupo.itens.length}
                    </Badge>
                  </h2>
                  <p className="text-xs text-slate-500">{grupo.descricao}</p>
                </div>
              </div>

              {/* Grade de Cartões dos Relatórios da Categoria */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupo.itens.map((relatorio: ItemRelatorioCatalogo) => {
                  const Icone = relatorio.icone
                  return (
                    <Link
                      key={relatorio.id}
                      to={relatorio.rota}
                      className="group block focus:outline-hidden"
                    >
                      <Card className="h-full border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all duration-150 flex flex-col justify-between">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="p-2.5 rounded-lg bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-600 transition-colors shrink-0">
                              <Icone className="h-5 w-5" />
                            </div>

                            <div className="flex items-center gap-1.5">
                              {relatorio.novo && (
                                <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold px-1.5 py-0">
                                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                  Novo
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="text-[10px] text-slate-500 border-slate-200 bg-slate-50"
                              >
                                {relatorio.modulo}
                              </Badge>
                            </div>
                          </div>

                          <CardTitle className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors mt-3">
                            {relatorio.nome}
                          </CardTitle>

                          <CardDescription className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                            {relatorio.descricao}
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="p-4 pt-2">
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform">
                            <span>Acessar relatório</span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Caixa de Informações e Regras Gerais da Etapa 8 */}
      <Card className="border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
            <ExternalLink className="h-4 w-4" />
          </div>
          <div className="text-xs text-slate-600 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-800">Padrão e Regras dos Relatórios do ERP</p>
            <p>
              • <strong>Processamento no Servidor:</strong> As somas e agrupamentos são realizados
              diretamente no backend em rotas dedicadas para máxima performance.
            </p>
            <p>
              • <strong>Multiempresa e Totalização:</strong> Usuários com acesso a múltiplas filiais
              podem selecionar as empresas desejadas e alternar a visualização analítica ou apenas o
              total consolidado.
            </p>
            <p>
              • <strong>Exportação Excel & Impressão:</strong> Todos os relatórios contam com
              exportação em CSV formatado em UTF-8 com BOM (abrindo diretamente no Excel sem erros
              de acentuação) e cabeçalho formal para impressão.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default CentralRelatoriosPage
