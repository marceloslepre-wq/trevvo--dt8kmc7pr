import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  ArrowLeft,
  Barcode,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Download,
  Printer,
  Ban,
  FileSpreadsheet,
  Clock,
  Layers,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Info,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  Inventario,
  InventarioItem,
  obterInventario,
  listarItensInventario,
  registrarContagemItem,
  biparProdutoInventario,
  finalizarInventario,
  cancelarInventario,
  obterDadosSpedBlocoH,
  gerarCsvInventario,
  gerarCsvSpedBlocoH,
} from '@/services/inventarios'
import { toast } from '@/hooks/use-toast'

export const InventarioDetalhePage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, usuarioERP, administrador } = usePermissoes()

  const podeContar = administrador || pode('estoque', 'criar')
  const podeFinalizar = administrador || pode('estoque', 'editar')
  const podeCancelar = administrador || pode('estoque', 'excluir')

  const [inventario, setInventario] = useState<Inventario | null>(null)
  const [itens, setItens] = useState<InventarioItem[]>([])
  const [carregando, setCarregando] = useState(true)

  // Opção Contagem Cega (esconde saldo e diferenças)
  const [contagemCega, setContagemCega] = useState(false)

  // Leitor de código de barras
  const [codigoBarras, setCodigoBarras] = useState('')
  const [modoBipeSoma1, setModoBipeSoma1] = useState(true)
  const inputBipeRef = useRef<HTMLInputElement>(null)

  // Busca e Filtros na grade
  const [termoBusca, setTermoBusca] = useState('')
  const [filtroContagem, setFiltroContagem] = useState<
    'todos' | 'contados' | 'pendentes' | 'divergentes'
  >('todos')

  // Modais de Finalização e Cancelamento
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false)
  const [acaoNaoContados, setAcaoNaoContados] = useState<'zerar' | 'manter_saldo'>('zerar')
  const [somenteRegistrarPosicao, setSomenteRegistrarPosicao] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  // Modal de SPED Bloco H
  const [modalSpedAberto, setModalSpedAberto] = useState(false)
  const [dadosSped, setDadosSped] = useState<Awaited<
    ReturnType<typeof obterDadosSpedBlocoH>
  > | null>(null)
  const [carregandoSped, setCarregandoSped] = useState(false)

  // Carregar dados
  const recarregar = useCallback(async () => {
    if (!id) return
    try {
      const [inv, listaItens] = await Promise.all([obterInventario(id), listarItensInventario(id)])
      setInventario(inv)
      setItens(listaItens)
      if (inv.tipo === 'Anual (Bloco H)') {
        setSomenteRegistrarPosicao(true)
      }
    } catch (err) {
      console.error('Erro ao carregar inventário:', err)
      toast({
        title: 'Inventário não encontrado',
        description: 'Não foi possível carregar os dados deste inventário.',
        variant: 'destructive',
      })
      navigate('/estoque/inventarios')
    } finally {
      setCarregando(false)
    }
  }, [id, navigate])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  // Métricas de progresso
  const totalItens = itens.length
  const itensContados = useMemo(
    () =>
      itens.filter((i) => i.quantidade_contada !== null && i.quantidade_contada !== undefined)
        .length,
    [itens],
  )
  const percentualConcluido = totalItens > 0 ? Math.round((itensContados / totalItens) * 100) : 0

  // Resumo de sobras e faltas
  const resumoDiferencas = useMemo(() => {
    let sobraQtd = 0
    let sobraVl = 0
    let faltaQtd = 0
    let faltaVl = 0
    let divergentesCount = 0

    itens.forEach((it) => {
      if (it.quantidade_contada !== null && it.quantidade_contada !== undefined) {
        const diff = it.quantidade_contada - it.saldo_sistema
        const custo = it.custo_unitario || 0
        if (diff > 0) {
          sobraQtd += diff
          sobraVl += diff * custo
          divergentesCount++
        } else if (diff < 0) {
          faltaQtd += Math.abs(diff)
          faltaVl += Math.abs(diff) * custo
          divergentesCount++
        }
      }
    })

    return {
      sobraQtd,
      sobraVl: Math.round(sobraVl * 100) / 100,
      faltaQtd,
      faltaVl: Math.round(faltaVl * 100) / 100,
      divergentesCount,
    }
  }, [itens])

  // Filtragem da grade
  const itensFiltrados = useMemo(() => {
    return itens.filter((it) => {
      const prod = it.expand?.produto_id
      const matchBusca =
        !termoBusca ||
        prod?.descricao?.toLowerCase().includes(termoBusca.toLowerCase()) ||
        String(prod?.codigo || '')
          .toLowerCase()
          .includes(termoBusca.toLowerCase()) ||
        prod?.gtin?.toLowerCase().includes(termoBusca.toLowerCase()) ||
        prod?.ncm?.includes(termoBusca)

      if (!matchBusca) return false

      const foiContado = it.quantidade_contada !== null && it.quantidade_contada !== undefined
      if (filtroContagem === 'contados' && !foiContado) return false
      if (filtroContagem === 'pendentes' && foiContado) return false
      if (filtroContagem === 'divergentes') {
        if (!foiContado) return false
        if (it.quantidade_contada === it.saldo_sistema) return false
      }

      return true
    })
  }, [itens, termoBusca, filtroContagem])

  // Manipulação de Contagem Manual
  const handleAlterarQuantidade = async (item: InventarioItem, novaQtdStr: string) => {
    if (!inventario || inventario.status === 'Finalizado' || inventario.status === 'Cancelado')
      return
    if (!podeContar) {
      toast({
        title: 'Sem permissão',
        description: 'Você não tem permissão para registrar contagem.',
        variant: 'destructive',
      })
      return
    }

    const valorNum = novaQtdStr === '' ? null : Number(novaQtdStr)
    if (valorNum !== null && isNaN(valorNum)) return

    try {
      if (valorNum === null) {
        // Limpar contagem
        await registrarContagemItem({
          itemId: item.id,
          quantidade_contada: 0,
          saldo_sistema: item.saldo_sistema,
          custo_unitario: item.custo_unitario || 0,
          usuario_id: usuarioERP?.id,
          inventario_id: inventario.id,
        })
      } else {
        await registrarContagemItem({
          itemId: item.id,
          quantidade_contada: valorNum,
          saldo_sistema: item.saldo_sistema,
          custo_unitario: item.custo_unitario || 0,
          usuario_id: usuarioERP?.id,
          inventario_id: inventario.id,
        })
      }

      recarregar()
    } catch (err) {
      console.error('Erro ao atualizar contagem:', err)
      toast({
        title: 'Erro ao gravar contagem',
        description: 'Não foi possível salvar a quantidade informada.',
        variant: 'destructive',
      })
    }
  }

  // Manipulação do Bipe de Código de Barras
  const handleBipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoBarras.trim() || !inventario) return
    if (inventario.status === 'Finalizado' || inventario.status === 'Cancelado') return

    const codigoLimpo = codigoBarras.trim()
    setCodigoBarras('')

    // Encontrar produto correspondente por gtin ou codigo
    const itemEncontrado = itens.find(
      (it) =>
        it.expand?.produto_id?.gtin === codigoLimpo ||
        String(it.expand?.produto_id?.codigo) === codigoLimpo,
    )
    if (!itemEncontrado) {
      toast({
        title: 'Produto não encontrado',
        description: `Nenhum item com código/código de barras "${codigoLimpo}" na grade deste inventário.`,
        variant: 'destructive',
      })
      inputBipeRef.current?.focus()
      return
    }

    try {
      const prod = itemEncontrado.expand?.produto_id
      const atual =
        itemEncontrado.quantidade_contada !== null &&
        itemEncontrado.quantidade_contada !== undefined
          ? itemEncontrado.quantidade_contada
          : 0
      const nova = atual + 1

      await registrarContagemItem({
        itemId: itemEncontrado.id,
        quantidade_contada: nova,
        saldo_sistema: itemEncontrado.saldo_sistema,
        custo_unitario: itemEncontrado.custo_unitario || 0,
        usuario_id: usuarioERP?.id,
        inventario_id: inventario.id,
      })

      toast({
        title: 'Bipe registrado!',
        description: `${prod?.descricao || 'Produto'} (+1) → Total contada: ${nova}`,
      })

      recarregar()
    } catch (err) {
      console.error('Erro ao bipar:', err)
      toast({
        title: 'Erro no bipe',
        description: 'Não foi possível processar a leitura.',
        variant: 'destructive',
      })
    } finally {
      inputBipeRef.current?.focus()
    }
  }

  // Finalizar Inventário
  const handleFinalizar = async () => {
    if (!inventario || !podeFinalizar) return
    setFinalizando(true)

    try {
      const res = await finalizarInventario({
        inventario_id: inventario.id,
        acao_itens_nao_contados: acaoNaoContados,
        somente_registrar_posicao: somenteRegistrarPosicao,
        usuario_id: usuarioERP?.id,
      })

      toast({
        title: 'Inventário Finalizado com Sucesso!',
        description: somenteRegistrarPosicao
          ? 'Posição registrada sem gerar movimentações no estoque.'
          : `${res.ajustesGerados} movimentação(ões) de acerto gerada(s) no estoque.`,
      })

      setModalFinalizarAberto(false)
      recarregar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha na finalização',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setFinalizando(false)
    }
  }

  // Cancelar Inventário
  const handleCancelar = async () => {
    if (!inventario || !podeCancelar) return
    setCancelando(true)

    try {
      await cancelarInventario(inventario.id)
      toast({
        title: 'Inventário cancelado',
        description: 'O inventário foi cancelado sem alterar estoques.',
      })
      setModalCancelarAberto(false)
      recarregar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao cancelar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  // Exportar CSV Padrão
  const handleExportarCsv = () => {
    if (!inventario) return
    const csv = gerarCsvInventario(inventario, itens, contagemCega)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventario_${inventario.numero}_${inventario.data_referencia}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Visualizar / Exportar SPED Bloco H
  const handleAbrirSped = async () => {
    if (!inventario) return
    setCarregandoSped(true)
    setModalSpedAberto(true)
    try {
      const dados = await obterDadosSpedBlocoH(inventario.id)
      setDadosSped(dados)
    } catch (err) {
      console.error('Erro ao gerar Bloco H:', err)
      toast({
        title: 'Erro ao gerar SPED Bloco H',
        description: 'Não foi possível compilar os registros H005 e H010.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoSped(false)
    }
  }

  const handleExportarSpedCsv = () => {
    if (!dadosSped) return
    const csv = gerarCsvSpedBlocoH(dadosSped)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SPED_Bloco_H_${inventario?.numero || 'inv'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (carregando || !inventario) {
    return (
      <div className="p-8 text-center text-slate-500">
        <div className="flex items-center justify-center gap-2">
          <Clock className="w-5 h-5 animate-spin text-blue-600" />
          <span>Carregando inventário...</span>
        </div>
      </div>
    )
  }

  const estaFechado = inventario.status === 'Finalizado' || inventario.status === 'Cancelado'

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/estoque/inventarios')}
            className="h-9 px-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                Inventário #{inventario.numero}: {inventario.descricao}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs ${
                  inventario.status === 'Finalizado'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : inventario.status === 'Em contagem'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : inventario.status === 'Cancelado'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {inventario.status}
              </Badge>
              <Badge variant="outline" className="text-xs border-slate-300">
                {inventario.tipo}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Posição de estoque em:{' '}
              <strong>{new Date(inventario.data_referencia).toLocaleDateString('pt-BR')}</strong>
              {inventario.expand?.usuario_abertura_id && (
                <span> • Aberto por: {inventario.expand.usuario_abertura_id.nome}</span>
              )}
            </p>
          </div>
        </div>

        {/* Ações do Topo */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Exportar CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            className="h-9 text-xs gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>

          {/* SPED Fiscal Bloco H */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAbrirSped}
            className="h-9 text-xs gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
          >
            <FileCheck className="w-3.5 h-3.5" />
            SPED Bloco H
          </Button>

          {/* Cancelar (se aberto ou em contagem) */}
          {!estaFechado && podeCancelar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalCancelarAberto(true)}
              className="h-9 text-xs gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancelar
            </Button>
          )}

          {/* Finalizar */}
          {!estaFechado && podeFinalizar && (
            <Button
              size="sm"
              onClick={() => setModalFinalizarAberto(true)}
              className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizar Inventário
            </Button>
          )}
        </div>
      </div>

      {/* Cards de Métricas e Progresso */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Progresso Geral */}
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Progresso da Contagem</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {itensContados} / {totalItens}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({percentualConcluido}%)
                  </span>
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                <ClipboardCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${percentualConcluido}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sobras de Estoque */}
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Sobras Físicas (Entrada)</p>
              {contagemCega ? (
                <p className="text-xs text-slate-400 italic mt-1.5">Oculto (Contagem Cega)</p>
              ) : (
                <>
                  <p className="text-xl font-bold text-emerald-600 mt-0.5">
                    +{resumoDiferencas.sobraQtd.toLocaleString('pt-BR')} un
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    R${' '}
                    {resumoDiferencas.sobraVl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Faltas de Estoque */}
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Faltas Físicas (Saída)</p>
              {contagemCega ? (
                <p className="text-xs text-slate-400 italic mt-1.5">Oculto (Contagem Cega)</p>
              ) : (
                <>
                  <p className="text-xl font-bold text-rose-600 mt-0.5">
                    -{resumoDiferencas.faltaQtd.toLocaleString('pt-BR')} un
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    R${' '}
                    {resumoDiferencas.faltaVl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Itens com Divergência */}
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Itens com Divergência</p>
              {contagemCega ? (
                <p className="text-xs text-slate-400 italic mt-1.5">Oculto (Contagem Cega)</p>
              ) : (
                <>
                  <p className="text-xl font-bold text-amber-600 mt-0.5">
                    {resumoDiferencas.divergentesCount}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">de {itensContados} contados</p>
                </>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Ações Rápidas: Leitor de Código de Barras e Modo Cego */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Input Leitor de Código de Barras */}
            <form onSubmit={handleBipeSubmit} className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  ref={inputBipeRef}
                  type="text"
                  placeholder="Bipar código de barras ou digitar código e teclar Enter..."
                  value={codigoBarras}
                  onChange={(e) => setCodigoBarras(e.target.value)}
                  disabled={estaFechado || !podeContar}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Button
                type="submit"
                disabled={estaFechado || !podeContar || !codigoBarras.trim()}
                className="h-9 text-xs bg-slate-800 hover:bg-slate-900 text-white"
              >
                Bipar (+1)
              </Button>
            </form>

            {/* Alternância Contagem Cega */}
            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md">
                <Switch
                  id="contagem-cega"
                  checked={contagemCega}
                  onCheckedChange={setContagemCega}
                />
                <Label
                  htmlFor="contagem-cega"
                  className="text-xs font-medium text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  {contagemCega ? (
                    <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  Modo Contagem Cega (esconder saldo esperado)
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grade de Contagem */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Filtros da grade */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Filtrar por nome, código, barras..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <Select value={filtroContagem} onValueChange={(v) => setFiltroContagem(v as any)}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os itens ({itens.length})</SelectItem>
                <SelectItem value="contados">Já contados ({itensContados})</SelectItem>
                <SelectItem value="pendentes">
                  Não contados ({totalItens - itensContados})
                </SelectItem>
                {!contagemCega && (
                  <SelectItem value="divergentes">
                    Com divergência ({resumoDiferencas.divergentesCount})
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <span className="text-xs text-slate-500">
            Mostrando {itensFiltrados.length} de {itens.length} item(ns)
          </span>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3 w-20">Código</th>
                  <th className="p-3">Descrição do Produto</th>
                  <th className="p-3 w-16 text-center">UN</th>
                  {!contagemCega && <th className="p-3 w-28 text-right">Saldo Sistema</th>}
                  <th className="p-3 w-36 text-center bg-blue-50/50">Qtd Contada</th>
                  {!contagemCega && (
                    <>
                      <th className="p-3 w-28 text-right">Diferença</th>
                      <th className="p-3 w-28 text-right">Custo Unit.</th>
                      <th className="p-3 w-28 text-right">Vl. Diferença</th>
                    </>
                  )}
                  <th className="p-3 w-32">Contado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itensFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={contagemCega ? 5 : 8} className="p-8 text-center text-slate-400">
                      Nenhum item encontrado para esta busca ou filtro.
                    </td>
                  </tr>
                ) : (
                  itensFiltrados.map((it) => {
                    const prod = it.expand?.produto_id
                    const foiContado =
                      it.quantidade_contada !== null && it.quantidade_contada !== undefined
                    const diff = foiContado ? (it.quantidade_contada || 0) - it.saldo_sistema : 0
                    const custo = it.custo_unitario || 0
                    const vlDiff = Math.round(diff * custo * 100) / 100

                    return (
                      <tr
                        key={it.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !contagemCega && foiContado && diff !== 0
                            ? diff > 0
                              ? 'bg-emerald-50/20'
                              : 'bg-rose-50/20'
                            : ''
                        }`}
                      >
                        {/* Código */}
                        <td className="p-3 font-mono font-semibold text-slate-700">
                          {prod?.codigo || '—'}
                        </td>

                        {/* Descrição */}
                        <td className="p-3">
                          <p className="font-medium text-slate-900">
                            {prod?.descricao || 'Produto sem descrição'}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            {prod?.gtin && <span>GTIN: {prod.gtin}</span>}
                            {prod?.ncm && <span>NCM: {prod.ncm}</span>}
                            {prod?.localizacao && <span>Loc: {prod.localizacao}</span>}
                          </div>
                        </td>

                        {/* UN */}
                        <td className="p-3 text-center text-slate-600">
                          {prod?.expand?.unidade_id?.sigla || 'UN'}
                        </td>

                        {/* Saldo Sistema (se não cego) */}
                        {!contagemCega && (
                          <td className="p-3 text-right font-medium text-slate-700">
                            {it.saldo_sistema.toFixed(4).replace('.', ',')}
                          </td>
                        )}

                        {/* Qtd Contada (editável diretamente na grade) */}
                        <td className="p-2 text-center bg-blue-50/30">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0,00"
                            disabled={estaFechado || !podeContar}
                            defaultValue={foiContado ? it.quantidade_contada?.toString() : ''}
                            onBlur={(e) => handleAlterarQuantidade(it, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleAlterarQuantidade(it, e.currentTarget.value)
                                e.currentTarget.blur()
                              }
                            }}
                            className={`h-8 text-center text-xs font-bold ${
                              foiContado
                                ? 'border-blue-400 bg-white text-blue-900'
                                : 'border-dashed border-slate-300 bg-slate-50 text-slate-400'
                            }`}
                          />
                        </td>

                        {/* Diferença (se não cego) */}
                        {!contagemCega && (
                          <>
                            <td className="p-3 text-right font-semibold">
                              {foiContado ? (
                                <span
                                  className={
                                    diff > 0
                                      ? 'text-emerald-600'
                                      : diff < 0
                                        ? 'text-rose-600'
                                        : 'text-slate-500'
                                  }
                                >
                                  {diff > 0
                                    ? `+${diff.toFixed(4).replace('.', ',')}`
                                    : diff.toFixed(4).replace('.', ',')}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            <td className="p-3 text-right text-slate-600">
                              R$ {custo.toFixed(2).replace('.', ',')}
                            </td>

                            <td className="p-3 text-right font-semibold">
                              {foiContado ? (
                                <span
                                  className={
                                    vlDiff > 0
                                      ? 'text-emerald-600'
                                      : vlDiff < 0
                                        ? 'text-rose-600'
                                        : 'text-slate-500'
                                  }
                                >
                                  {vlDiff > 0
                                    ? `+R$ ${vlDiff.toFixed(2).replace('.', ',')}`
                                    : `R$ ${vlDiff.toFixed(2).replace('.', ',')}`}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Contado por */}
                        <td className="p-3 text-slate-500 text-[11px]">
                          {it.expand?.contado_por?.nome ? (
                            <div className="flex items-center gap-1 text-slate-700">
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              <span className="truncate">{it.expand.contado_por.nome}</span>
                            </div>
                          ) : foiContado ? (
                            'Contado'
                          ) : (
                            <span className="text-slate-300 italic">Pendente</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Finalização do Inventário */}
      <Dialog open={modalFinalizarAberto} onOpenChange={setModalFinalizarAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Finalizar Inventário #{inventario.numero}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Revise as divergências antes de consolidar o inventário e gerar as movimentações
              fiscais.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Resumo de Sobras e Faltas */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Sobras (INVENTARIO_ENTRADA)
                </p>
                <p className="text-sm font-bold text-emerald-600">
                  +{resumoDiferencas.sobraQtd.toFixed(4).replace('.', ',')} un
                </p>
                <p className="text-[10px] text-slate-400">
                  R$ {resumoDiferencas.sobraVl.toFixed(2).replace('.', ',')}
                </p>
              </div>

              <div>
                <p className="text-[11px] text-slate-500 font-medium">Faltas (INVENTARIO_SAIDA)</p>
                <p className="text-sm font-bold text-rose-600">
                  -{resumoDiferencas.faltaQtd.toFixed(4).replace('.', ',')} un
                </p>
                <p className="text-[10px] text-slate-400">
                  R$ {resumoDiferencas.faltaVl.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>

            {/* Itens Não Contados */}
            {totalItens - itensContados > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-800 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Atenção: {totalItens - itensContados} produto(s) não foram contados</span>
                </div>
                <p className="text-[11px] text-amber-700 leading-normal">
                  Como deseja tratar os produtos que ficaram sem contagem informada?
                </p>
                <RadioGroup
                  value={acaoNaoContados}
                  onValueChange={(v) => setAcaoNaoContados(v as any)}
                  className="space-y-1.5 pt-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="zerar" id="r-zerar" />
                    <Label htmlFor="r-zerar" className="text-xs font-medium cursor-pointer">
                      Considerar quantidade contada como ZERO (gera saída para zerar estoque)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manter_saldo" id="r-manter" />
                    <Label htmlFor="r-manter" className="text-xs font-medium cursor-pointer">
                      Manter o saldo atual do sistema (não gera ajustes para estes itens)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Opção Somente Registrar Posição (obrigatória/opcional para Bloco H) */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center space-x-2">
                <Switch
                  id="somente-posicao"
                  checked={somenteRegistrarPosicao}
                  onCheckedChange={setSomenteRegistrarPosicao}
                />
                <Label
                  htmlFor="somente-posicao"
                  className="text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Somente registrar posição (Não gerar movimentações de acerto no estoque)
                </Label>
              </div>
              <p className="text-[11px] text-slate-500 pl-8">
                Utilize esta opção caso o inventário seja destinado apenas para fins de declaração
                fiscal anual (SPED Fiscal Bloco H em 31/12) sem necessidade de alterar o kardex
                atual da filial.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalFinalizarAberto(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={finalizando}
              onClick={handleFinalizar}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {finalizando ? 'Processando ajustes...' : 'Confirmar e Finalizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cancelamento */}
      <Dialog open={modalCancelarAberto} onOpenChange={setModalCancelarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Ban className="h-5 w-5 text-rose-600" />
              Cancelar Inventário #{inventario.numero}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tem certeza que deseja cancelar este inventário? Nenhuma movimentação de ajuste será
              criada.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalCancelarAberto(false)}
              className="text-xs"
            >
              Voltar
            </Button>
            <Button
              size="sm"
              disabled={cancelando}
              onClick={handleCancelar}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              {cancelando ? 'Cancelando...' : 'Sim, Cancelar Inventário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Exportação SPED Fiscal Bloco H */}
      <Dialog open={modalSpedAberto} onOpenChange={setModalSpedAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-purple-600" />
              Inventário para o SPED Fiscal (Bloco H)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registros H005 (Totais do Inventário) e H010 (Inventário por Item) conforme Guia
              Prático da EFD ICMS/IPI
            </DialogDescription>
          </DialogHeader>

          {carregandoSped || !dadosSped ? (
            <div className="p-8 text-center text-slate-500">
              <Clock className="w-5 h-5 animate-spin mx-auto text-purple-600 mb-2" />
              <p className="text-xs">Compilando registros do Bloco H...</p>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              {/* Registro H005 */}
              <div className="bg-purple-50/50 border border-purple-200 p-3 rounded-lg">
                <p className="font-bold text-purple-900 mb-1 flex items-center justify-between">
                  <span>Registro H005 — Totais do Inventário</span>
                  <Badge
                    variant="outline"
                    className="border-purple-300 text-purple-800 text-[10px]"
                  >
                    {dadosSped.itens.length} itens
                  </Badge>
                </p>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-purple-950">
                  <div>
                    <span className="text-purple-600 block">DT_INV (Data):</span>
                    <strong>{dadosSped.dt_inv}</strong>
                  </div>
                  <div>
                    <span className="text-purple-600 block">VL_INV (Valor Total):</span>
                    <strong>
                      R$ {dadosSped.vl_inv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-purple-600 block">MOT_INV (Motivo):</span>
                    <strong>{dadosSped.mot_inv}</strong>
                  </div>
                </div>
              </div>

              {/* Registro H010 - Prévia */}
              <div>
                <p className="font-bold text-slate-700 mb-1">Prévia do Registro H010 (Itens)</p>
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-md">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2">COD_ITEM</th>
                        <th className="p-2">DESCRICAO</th>
                        <th className="p-2 text-center">UNID</th>
                        <th className="p-2 text-right">QTD</th>
                        <th className="p-2 text-right">VL_UNIT</th>
                        <th className="p-2 text-right">VL_ITEM</th>
                        <th className="p-2 text-center">IND_PROP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dadosSped.itens.slice(0, 50).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-mono">{it.cod_item}</td>
                          <td className="p-2 truncate max-w-xs">{it.descricao}</td>
                          <td className="p-2 text-center">{it.unid}</td>
                          <td className="p-2 text-right">{it.qtd.toFixed(4).replace('.', ',')}</td>
                          <td className="p-2 text-right">
                            R$ {it.vl_unit.toFixed(4).replace('.', ',')}
                          </td>
                          <td className="p-2 text-right font-medium">
                            R$ {it.vl_item.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="p-2 text-center">0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dadosSped.itens.length > 50 && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Mostrando os primeiros 50 itens. Exporte o CSV para visualizar a totalidade.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalSpedAberto(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              size="sm"
              onClick={handleExportarSpedCsv}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV Bloco H
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default InventarioDetalhePage
