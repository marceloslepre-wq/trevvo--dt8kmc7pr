import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  FolderTree,
  Plus,
  Search,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  CornerDownRight,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  PlanoConta,
  PlanoContaNoArvore,
  TipoContaPlano,
  NaturezaContaPlano,
  GrupoDrePlano,
  listarTodasContasPlano,
  montarArvorePlanoContas,
  salvarContaPlano,
  excluirOuInativarContaPlano,
  ativarContaPlano,
  exportarPlanoContasCsv,
  importarPlanoContasCsv,
  ResultadoImportacaoPlanoContas,
} from '@/services/planoContas'

const GRUPOS_DRE: GrupoDrePlano[] = [
  'Receita bruta',
  'Deduções da receita',
  'Custo das mercadorias',
  'Despesas operacionais',
  'Resultado financeiro',
  'Outras receitas e despesas',
  'Fora da DRE',
]

export const PlanoContasPage: React.FC = () => {
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const podeCriar = pode('financeiro_bancos', 'criar')
  const podeEditar = pode('financeiro_bancos', 'editar')
  const podeExcluir = pode('financeiro_bancos', 'excluir')

  const [contas, setContas] = useState<PlanoConta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoContaPlano | 'todos'>('todos')
  const [filtroNatureza, setFiltroNatureza] = useState<NaturezaContaPlano | 'todos'>('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Nós expandidos na árvore (Set de IDs)
  const [nosExpandidos, setNosExpandidos] = useState<Set<string>>(new Set())

  // Modal de Formulário
  const [modalFormAberto, setModalFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [contaEditando, setContaEditando] = useState<Partial<PlanoConta> | null>(null)

  // Modal de Importação CSV
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [arquivoCsv, setArquivoCsv] = useState<File | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] =
    useState<ResultadoImportacaoPlanoContas | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const carregarContas = async () => {
    try {
      setCarregando(true)
      const lista = await listarTodasContasPlano({
        situacao: filtroSituacao,
        tipo: filtroTipo,
        natureza: filtroNatureza,
      })
      setContas(lista)

      // Por padrão, expande nós de 1º e 2º nível na primeira carga
      if (nosExpandidos.size === 0) {
        const iniciais = new Set<string>()
        lista.forEach((c) => {
          if (c.natureza === 'Sintética' && c.codigo.split('.').length <= 2) {
            iniciais.add(c.id)
          }
        })
        setNosExpandidos(iniciais)
      }
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar o plano de contas.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarContas()
  }, [filtroSituacao, filtroTipo, filtroNatureza])

  // Alterna expansão de nó
  const toggleExpansao = (id: string) => {
    setNosExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandirTudo = () => {
    const todos = new Set<string>()
    contas.forEach((c) => {
      if (c.natureza === 'Sintética') todos.add(c.id)
    })
    setNosExpandidos(todos)
  }

  const recolherTudo = () => {
    setNosExpandidos(new Set())
  }

  // Monta árvore filtrada pela busca
  const arvoreContas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let filtradas = contas

    if (termo) {
      // Quando há busca, encontramos as contas que batem com o termo e também todos os seus ancestrais
      const idsRelevantes = new Set<string>()
      const mapa = new Map<string, PlanoConta>()
      contas.forEach((c) => mapa.set(c.id, c))

      contas.forEach((c) => {
        if (c.codigo.toLowerCase().includes(termo) || c.descricao.toLowerCase().includes(termo)) {
          idsRelevantes.add(c.id)
          // sobe na hierarquia
          let atual = c
          while (atual.conta_pai_id && mapa.has(atual.conta_pai_id)) {
            idsRelevantes.add(atual.conta_pai_id)
            atual = mapa.get(atual.conta_pai_id)!
          }
        }
      })

      filtradas = contas.filter((c) => idsRelevantes.has(c.id))
    }

    return montarArvorePlanoContas(filtradas)
  }, [contas, busca])

  // Contas sintéticas para seleção de conta pai
  const contasSinteticas = useMemo(() => {
    return contas
      .filter((c) => c.natureza === 'Sintética' && c.ativo)
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  }, [contas])

  const abrirNovaConta = (contaPai?: PlanoConta) => {
    let codigoSugerido = ''
    let tipoSugerido: TipoContaPlano = 'Despesa'
    let grupoDreSugerido: GrupoDrePlano = 'Despesas operacionais'

    if (contaPai) {
      tipoSugerido = contaPai.tipo
      grupoDreSugerido = contaPai.grupo_dre

      // Sugere próximo número de filho
      const filhos = contas.filter((c) => c.conta_pai_id === contaPai.id)
      if (filhos.length > 0) {
        const ult = filhos[filhos.length - 1]
        const pedacos = ult.codigo.split('.')
        const ultNum = parseInt(pedacos[pedacos.length - 1], 10)
        if (!isNaN(ultNum)) {
          const proximo = String(ultNum + 1).padStart(pedacos[pedacos.length - 1].length, '0')
          pedacos[pedacos.length - 1] = proximo
          codigoSugerido = pedacos.join('.')
        }
      } else {
        codigoSugerido = `${contaPai.codigo}.01`
      }
    }

    setContaEditando({
      codigo: codigoSugerido,
      descricao: '',
      tipo: tipoSugerido,
      natureza: 'Analítica',
      conta_pai_id: contaPai ? contaPai.id : undefined,
      grupo_dre: grupoDreSugerido,
      ativo: true,
    })
    setModalFormAberto(true)
  }

  const abrirEditarConta = (c: PlanoConta) => {
    setContaEditando({ ...c })
    setModalFormAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contaEditando) return

    try {
      setSalvando(true)
      await salvarContaPlano(contaEditando)
      toast({
        title: contaEditando.id ? 'Conta atualizada' : 'Conta cadastrada',
        description: `A conta "${contaEditando.codigo} - ${contaEditando.descricao}" foi salva com sucesso.`,
      })
      setModalFormAberto(false)
      setContaEditando(null)
      await carregarContas()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar a conta.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleExcluirOuInativar = async (c: PlanoConta) => {
    const acaoLabel = c.natureza === 'Analítica' ? 'excluir ou inativar' : 'excluir'
    if (!confirm(`Deseja realmente ${acaoLabel} a conta "${c.codigo} - ${c.descricao}"?`)) {
      return
    }

    try {
      const res = await excluirOuInativarContaPlano(c.id)
      toast({
        title: res.acao === 'excluido' ? 'Conta excluída' : 'Conta inativada',
        description: res.mensagem,
      })
      await carregarContas()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao remover conta.'
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: msg,
      })
    }
  }

  const handleAtivar = async (c: PlanoConta) => {
    try {
      await ativarContaPlano(c.id)
      toast({
        title: 'Conta reativada',
        description: `A conta "${c.codigo} - ${c.descricao}" foi reativada.`,
      })
      await carregarContas()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível reativar a conta.',
      })
    }
  }

  const handleExportarCsv = () => {
    try {
      const csv = exportarPlanoContasCsv(contas)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `plano_contas_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast({
        title: 'Exportação concluída',
        description: `${contas.length} contas exportadas com sucesso.`,
      })
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar',
        description: 'Falha ao gerar o arquivo CSV.',
      })
    }
  }

  const handleImportarCsv = async () => {
    if (!arquivoCsv) {
      toast({
        variant: 'destructive',
        title: 'Selecione um arquivo',
        description: 'Envie um arquivo CSV com as contas para importar.',
      })
      return
    }

    try {
      setImportando(true)
      const texto = await arquivoCsv.text()
      const res = await importarPlanoContasCsv(texto)
      setResultadoImportacao(res)
      toast({
        title: 'Importação processada',
        description: `${res.criados} criadas, ${res.atualizados} atualizadas e ${res.erros.length} erros.`,
      })
      await carregarContas()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha na importação do arquivo.'
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description: msg,
      })
    } finally {
      setImportando(false)
    }
  }

  // Renderizador recursivo da árvore
  const renderItemArvore = (no: PlanoContaNoArvore) => {
    const temFilhos = no.filhos.length > 0
    const expandido = nosExpandidos.has(no.id)
    const ehSintetica = no.natureza === 'Sintética'

    // Cores por tipo
    const badgeTipoCor =
      no.tipo === 'Receita'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : no.tipo === 'Despesa'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-slate-100 text-slate-700 border-slate-200'

    return (
      <div key={no.id} className="select-none">
        <div
          className={`flex items-center justify-between py-2 px-3 hover:bg-slate-100/80 rounded-lg transition-colors group border-b border-slate-100/80 ${
            !no.ativo ? 'opacity-50 bg-slate-50' : ''
          }`}
          style={{ paddingLeft: `${Math.max(12, (no.nivel - 1) * 24 + 12)}px` }}
        >
          {/* Esquerda: expansor + código + descrição */}
          <div className="flex items-center gap-2 min-w-0 flex-1 pr-4">
            {ehSintetica ? (
              <button
                type="button"
                onClick={() => toggleExpansao(no.id)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900 transition-colors"
                title={expandido ? 'Recolher' : 'Expandir'}
              >
                {expandido ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <div className="w-5 flex justify-center text-slate-300">
                <CornerDownRight size={13} />
              </div>
            )}

            <span
              className={`font-mono text-xs ${
                ehSintetica ? 'font-bold text-slate-900' : 'text-slate-700'
              }`}
            >
              {no.codigo}
            </span>

            <span
              className={`text-xs truncate ${
                ehSintetica ? 'font-bold text-slate-900' : 'text-slate-700'
              }`}
            >
              {no.descricao}
            </span>

            {!no.ativo && (
              <Badge
                variant="outline"
                className="text-[10px] bg-red-50 text-red-600 border-red-200 py-0 h-4"
              >
                Inativa
              </Badge>
            )}
          </div>

          {/* Centro/Direita: tags + ações */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium hidden sm:inline-block ${badgeTipoCor}`}
            >
              {no.tipo}
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium hidden md:inline-block">
              {no.natureza}
            </span>

            <span
              className="text-[10px] text-slate-500 hidden lg:inline-block max-w-[140px] truncate"
              title={no.grupo_dre}
            >
              {no.grupo_dre}
            </span>

            {/* Ações */}
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
              {ehSintetica && podeCriar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => abrirNovaConta(no)}
                  className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                  title="Incluir conta filha"
                >
                  <Plus size={13} />
                  <span className="hidden xl:inline">Incluir Filha</span>
                </Button>
              )}

              {podeEditar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => abrirEditarConta(no)}
                  className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 hover:bg-slate-100"
                  title="Editar conta"
                >
                  <Edit2 size={13} />
                </Button>
              )}

              {podeExcluir && no.ativo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExcluirOuInativar(no)}
                  className="h-7 w-7 p-0 text-slate-500 hover:text-red-600 hover:bg-red-50"
                  title="Excluir ou inativar"
                >
                  <Trash2 size={13} />
                </Button>
              )}

              {podeEditar && !no.ativo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAtivar(no)}
                  className="h-7 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50"
                  title="Reativar conta"
                >
                  Reativar
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filhos recursivos */}
        {temFilhos && expandido && (
          <div className="ml-2 pl-1 border-l border-slate-200/60">
            {no.filhos.map((f) => renderItemArvore(f))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Plano de Contas
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Estrutura hierárquica contábil e gerencial compartilhada por todas as empresas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            className="text-xs border-slate-200 text-slate-700 gap-1.5"
          >
            <Download size={14} />
            <span>Exportar CSV</span>
          </Button>

          {podeCriar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setArquivoCsv(null)
                setResultadoImportacao(null)
                setModalImportarAberto(true)
              }}
              className="text-xs border-slate-200 text-slate-700 gap-1.5"
            >
              <Upload size={14} />
              <span>Importar CSV</span>
            </Button>
          )}

          {podeCriar && (
            <Button
              type="button"
              size="sm"
              onClick={() => abrirNovaConta()}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
            >
              <Plus size={15} />
              <span>Nova Conta Raiz</span>
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição da conta..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <div className="space-y-1">
            <Select
              value={filtroTipo}
              onValueChange={(val) => setFiltroTipo(val as TipoContaPlano | 'todos')}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Tipo de Conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="Receita">Receita</SelectItem>
                <SelectItem value="Despesa">Despesa</SelectItem>
                <SelectItem value="Sem resultado">Sem resultado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Select
              value={filtroNatureza}
              onValueChange={(val) => setFiltroNatureza(val as NaturezaContaPlano | 'todos')}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Natureza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas naturezas</SelectItem>
                <SelectItem value="Sintética">Sintética</SelectItem>
                <SelectItem value="Analítica">Analítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-slate-400" />
            <span className="text-slate-500">Situação:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                type="button"
                onClick={() => setFiltroSituacao('ativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'ativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ativas
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('inativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'inativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inativas
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('todos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'todos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={expandirTudo}
              className="h-7 text-[11px] text-slate-600 hover:text-slate-900"
            >
              Expandir Tudo
            </Button>
            <span className="text-slate-300">|</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={recolherTudo}
              className="h-7 text-[11px] text-slate-600 hover:text-slate-900"
            >
              Recolher Tudo
            </Button>
            <span className="text-slate-400 text-[11px] ml-2">
              Total: <strong>{contas.length}</strong> contas
            </span>
          </div>
        </div>
      </div>

      {/* Árvore do Plano de Contas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold text-slate-600">
          <span>Estrutura / Descrição</span>
          <div className="flex items-center gap-6 pr-4">
            <span className="hidden sm:inline">Tipo</span>
            <span className="hidden md:inline">Natureza</span>
            <span className="hidden lg:inline">DRE</span>
            <span>Ações</span>
          </div>
        </div>

        {carregando ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Carregando plano de contas...
          </div>
        ) : arvoreContas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Nenhuma conta encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="p-2 divide-y divide-slate-100">
            {arvoreContas.map((no) => renderItemArvore(no))}
          </div>
        )}
      </div>

      {/* Modal Formulário Conta */}
      <Dialog open={modalFormAberto} onOpenChange={setModalFormAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {contaEditando?.id ? 'Editar Conta' : 'Nova Conta no Plano'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preencha o código hierárquico, descrição, tipo e classificação na DRE.
            </DialogDescription>
          </DialogHeader>

          {contaEditando && (
            <form onSubmit={handleSalvar} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="codigo" className="text-xs font-medium text-slate-700">
                    Código <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="codigo"
                    value={contaEditando.codigo || ''}
                    onChange={(e) => setContaEditando({ ...contaEditando, codigo: e.target.value })}
                    placeholder="Ex: 2.4.01"
                    className="text-xs h-9 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="natureza" className="text-xs font-medium text-slate-700">
                    Natureza <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={contaEditando.natureza || 'Analítica'}
                    onValueChange={(val) =>
                      setContaEditando({
                        ...contaEditando,
                        natureza: val as NaturezaContaPlano,
                      })
                    }
                  >
                    <SelectTrigger id="natureza" className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sintética">Sintética (agrupadora)</SelectItem>
                      <SelectItem value="Analítica">Analítica (recebe lançamentos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="descricao" className="text-xs font-medium text-slate-700">
                  Descrição <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="descricao"
                  value={contaEditando.descricao || ''}
                  onChange={(e) =>
                    setContaEditando({ ...contaEditando, descricao: e.target.value })
                  }
                  placeholder="Ex: Energia elétrica, Vendas de mercadorias"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tipo" className="text-xs font-medium text-slate-700">
                    Tipo de Conta <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={contaEditando.tipo || 'Despesa'}
                    onValueChange={(val) =>
                      setContaEditando({ ...contaEditando, tipo: val as TipoContaPlano })
                    }
                  >
                    <SelectTrigger id="tipo" className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Receita">Receita</SelectItem>
                      <SelectItem value="Despesa">Despesa</SelectItem>
                      <SelectItem value="Sem resultado">Sem resultado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="grupo_dre" className="text-xs font-medium text-slate-700">
                    Grupo na DRE <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={contaEditando.grupo_dre || 'Fora da DRE'}
                    onValueChange={(val) =>
                      setContaEditando({ ...contaEditando, grupo_dre: val as GrupoDrePlano })
                    }
                  >
                    <SelectTrigger id="grupo_dre" className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRUPOS_DRE.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="conta_pai_id" className="text-xs font-medium text-slate-700">
                  Conta Pai (Sintética)
                </Label>
                <Select
                  value={contaEditando.conta_pai_id || 'nenhuma'}
                  onValueChange={(val) =>
                    setContaEditando({
                      ...contaEditando,
                      conta_pai_id: val === 'nenhuma' ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger id="conta_pai_id" className="text-xs h-9">
                    <SelectValue placeholder="Selecione uma conta pai (opcional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="nenhuma">-- Nenhuma (Conta Raiz) --</SelectItem>
                    {contasSinteticas
                      .filter((c) => c.id !== contaEditando.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.codigo} - {c.descricao}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ativo" className="text-xs text-slate-700 cursor-pointer">
                    Conta Ativa
                  </Label>
                  <Switch
                    id="ativo"
                    checked={contaEditando.ativo !== false}
                    onCheckedChange={(val) => setContaEditando({ ...contaEditando, ativo: val })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalFormAberto(false)}
                    disabled={salvando}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={salvando}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {salvando ? 'Salvando...' : 'Salvar Conta'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Importar CSV */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Importar Plano de Contas via CSV
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Envie um arquivo CSV com as colunas:{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700">
                codigo;descricao;tipo;natureza;codigo_pai;grupo_dre
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setArquivoCsv(e.target.files[0])
                    setResultadoImportacao(null)
                  }
                }}
                className="hidden"
                id="csv_input"
              />
              <label htmlFor="csv_input" className="cursor-pointer space-y-2 block">
                <FileSpreadsheet className="h-8 w-8 text-blue-600 mx-auto" />
                <div className="text-xs text-slate-700 font-medium">
                  {arquivoCsv ? arquivoCsv.name : 'Clique para selecionar o arquivo CSV'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Separador suportado: ponto e vírgula (;) ou vírgula (,)
                </div>
              </label>
            </div>

            {resultadoImportacao && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Resultado da Importação:</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Total Lidos</span>
                    <span className="font-bold text-slate-800">
                      {resultadoImportacao.totalLidos}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Criadas</span>
                    <span className="font-bold text-emerald-600">
                      {resultadoImportacao.criados}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Atualizadas</span>
                    <span className="font-bold text-blue-600">
                      {resultadoImportacao.atualizados}
                    </span>
                  </div>
                </div>

                {resultadoImportacao.erros.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                      <AlertCircle size={13} />
                      Erros encontrados ({resultadoImportacao.erros.length}):
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-0.5 bg-white p-2 rounded border border-red-200 text-[10px] text-red-700">
                      {resultadoImportacao.erros.map((e, i) => (
                        <div key={i}>
                          Linha {e.linha}: {e.erro}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalImportarAberto(false)}
              disabled={importando}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleImportarCsv}
              disabled={!arquivoCsv || importando}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {importando ? 'Processando...' : 'Processar Importação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PlanoContasPage
