import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Search,
  Filter,
  Download,
  Building,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  ArrowUpDown,
  RefreshCw,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import { EstoqueSaldo } from '@/services/estoque'
import { Produto } from '@/services/produtos'
import { SaldoTodasFiliaisModal } from '@/components/SaldoTodasFiliaisModal'
import pb from '@/lib/pocketbase/client'

export type SituacaoEstoque = 'Abaixo do mínimo' | 'Acima do máximo' | 'Zerado' | 'Normal'

export interface ItemPosicaoEstoque {
  produto: Produto
  saldo: EstoqueSaldo | null
  quantidade: number
  custoMedio: number
  valorTotal: number
  situacao: SituacaoEstoque
}

export const PosicaoEstoquePage: React.FC = () => {
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()

  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState<ItemPosicaoEstoque[]>([])

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    grupos_ids: [],
    categorias_ids: [],
    marcas_ids: [],
    fornecedores_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(
    () => ['produto_grupos_categorias', 'produto_marcas', 'pessoas_fornecedores'],
    [],
  )

  const [busca, setBusca] = useState('')
  const [situacaoFiltro, setSituacaoFiltro] = useState<string>('todos')
  const [somenteComSaldo, setSomenteComSaldo] = useState<boolean>(false)

  // Modal saldo em todas as filiais
  const [modalFiliaisAberto, setModalFiliaisAberto] = useState(false)
  const [produtoModalFiliais, setProdutoModalFiliais] = useState<{
    id: string
    codigo: number
    descricao: string
    unidadeSigla?: string
  } | null>(null)

  // Paginação e Ordenação
  const [pagina, setPagina] = useState(1)
  const ITENS_POR_PAGINA = 20
  const [ordenacaoCampo, setOrdenacaoCampo] = useState<
    'descricao' | 'codigo' | 'quantidade' | 'valorTotal'
  >('descricao')
  const [ordenacaoDirecao, setOrdenacaoDirecao] = useState<'asc' | 'desc'>('asc')

  // Carrega listas para os filtros
  useEffect(() => {
    // Listas carregadas sob demanda se necessário
  }, [])

  // Carregar produtos e saldos da empresa ativa
  const carregarDados = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)

    try {
      // 1. Buscar produtos com controla_estoque = true (e ativos)
      const produtosResult = await pb.collection('produtos').getFullList<Produto>({
        filter: `controla_estoque = true && ativo = true`,
        expand: 'unidade_id,marca_id,grupo_id,categoria_id,fornecedor_principal_id',
        sort: 'descricao',
      })

      // 2. Buscar saldos existentes na empresa ativa
      const saldosResult = await pb.collection('estoque_saldos').getFullList<EstoqueSaldo>({
        filter: `empresa_id = '${empresaAtiva.id}'`,
      })

      const mapaSaldos = new Map<string, EstoqueSaldo>()
      saldosResult.forEach((s) => mapaSaldos.set(s.produto_id, s))

      // 3. Montar itens e calcular situação de cada produto
      const lista: ItemPosicaoEstoque[] = produtosResult.map((prod) => {
        const saldo = mapaSaldos.get(prod.id) || null
        const qtd = saldo ? saldo.quantidade : 0
        const custo = saldo ? saldo.custo_medio : prod.preco_custo || 0
        const valor = saldo ? saldo.valor_total : Math.round(qtd * custo * 100) / 100

        const min =
          prod.estoque_minimo !== undefined && prod.estoque_minimo !== null
            ? Number(prod.estoque_minimo)
            : null
        const max =
          prod.estoque_maximo !== undefined && prod.estoque_maximo !== null
            ? Number(prod.estoque_maximo)
            : null

        let situacao: SituacaoEstoque = 'Normal'
        if (qtd <= 0) {
          situacao = 'Zerado'
        } else if (min !== null && min > 0 && qtd < min) {
          situacao = 'Abaixo do mínimo'
        } else if (max !== null && max > 0 && qtd > max) {
          situacao = 'Acima do máximo'
        }

        return {
          produto: prod,
          saldo,
          quantidade: qtd,
          custoMedio: custo,
          valorTotal: valor,
          situacao,
        }
      })

      setItens(lista)
    } catch (err) {
      console.error('Erro ao carregar posição de estoque:', err)
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Filtragem dos dados
  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      const p = item.produto

      if (somenteComSaldo && item.quantidade <= 0) {
        return false
      }

      if (situacaoFiltro !== 'todos' && item.situacao !== situacaoFiltro) {
        return false
      }

      if (
        filtros.grupos_ids &&
        filtros.grupos_ids.length > 0 &&
        (!p.grupo_id || !filtros.grupos_ids.includes(p.grupo_id))
      ) {
        return false
      }

      if (
        filtros.categorias_ids &&
        filtros.categorias_ids.length > 0 &&
        (!p.categoria_id || !filtros.categorias_ids.includes(p.categoria_id))
      ) {
        return false
      }

      if (
        filtros.marcas_ids &&
        filtros.marcas_ids.length > 0 &&
        (!p.marca_id || !filtros.marcas_ids.includes(p.marca_id))
      ) {
        return false
      }

      if (
        filtros.fornecedores_ids &&
        filtros.fornecedores_ids.length > 0 &&
        (!p.fornecedor_principal_id ||
          !filtros.fornecedores_ids.includes(p.fornecedor_principal_id))
      ) {
        return false
      }

      if (busca) {
        const termo = busca.toLowerCase().trim()
        const desc = (p.descricao || '').toLowerCase()
        const cod = String(p.codigo || '')
        const gtin = (p.gtin || '').toLowerCase()
        const ref = (p.referencia || '').toLowerCase()
        const loc = (p.localizacao || '').toLowerCase()
        if (
          !desc.includes(termo) &&
          !cod.includes(termo) &&
          !gtin.includes(termo) &&
          !ref.includes(termo) &&
          !loc.includes(termo)
        ) {
          return false
        }
      }

      return true
    })
  }, [itens, busca, filtros, situacaoFiltro])

  // Ordenação
  const itensOrdenados = useMemo(() => {
    const list = [...itensFiltrados]
    list.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''

      if (ordenacaoCampo === 'descricao') {
        valA = a.produto.descricao.toLowerCase()
        valB = b.produto.descricao.toLowerCase()
      } else if (ordenacaoCampo === 'codigo') {
        valA = a.produto.codigo
        valB = b.produto.codigo
      } else if (ordenacaoCampo === 'quantidade') {
        valA = a.quantidade
        valB = b.quantidade
      } else if (ordenacaoCampo === 'valorTotal') {
        valA = a.valorTotal
        valB = b.valorTotal
      }

      if (valA < valB) return ordenacaoDirecao === 'asc' ? -1 : 1
      if (valA > valB) return ordenacaoDirecao === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [itensFiltrados, ordenacaoCampo, ordenacaoDirecao])

  // Totais do rodapé
  const totalItensCatalogo = itensFiltrados.length
  const totalQuantidadeGeral = useMemo(
    () => itensFiltrados.reduce((acc, i) => acc + i.quantidade, 0),
    [itensFiltrados],
  )
  const totalValorGeral = useMemo(
    () => itensFiltrados.reduce((acc, i) => acc + i.valorTotal, 0),
    [itensFiltrados],
  )

  // Paginação
  const totalPaginas = Math.ceil(itensOrdenados.length / ITENS_POR_PAGINA) || 1
  const itensPaginados = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA
    return itensOrdenados.slice(inicio, inicio + ITENS_POR_PAGINA)
  }, [itensOrdenados, pagina])

  const alternarOrdenacao = (campo: typeof ordenacaoCampo) => {
    if (ordenacaoCampo === campo) {
      setOrdenacaoDirecao((ant) => (ant === 'asc' ? 'desc' : 'asc'))
    } else {
      setOrdenacaoCampo(campo)
      setOrdenacaoDirecao('asc')
    }
  }

  // Exportar CSV
  const exportarCSV = () => {
    if (itensFiltrados.length === 0) return

    const colunas = [
      'Código',
      'Descrição',
      'GTIN',
      'Referência',
      'Unidade',
      'Grupo',
      'Categoria',
      'Marca',
      'Localização',
      'Quantidade',
      'Custo Médio (R$)',
      'Valor Total (R$)',
      'Estoque Mínimo',
      'Estoque Máximo',
      'Situação',
    ]

    const linhas = itensFiltrados.map((i) => [
      i.produto.codigo,
      `"${(i.produto.descricao || '').replace(/"/g, '""')}"`,
      `"${i.produto.gtin || ''}"`,
      `"${i.produto.referencia || ''}"`,
      `"${i.produto.expand?.unidade_id?.sigla || ''}"`,
      `"${i.produto.expand?.grupo_id?.nome || ''}"`,
      `"${i.produto.expand?.categoria_id?.nome || ''}"`,
      `"${i.produto.expand?.marca_id?.nome || ''}"`,
      `"${i.produto.localizacao || ''}"`,
      i.quantidade.toFixed(4).replace('.', ','),
      i.custoMedio.toFixed(4).replace('.', ','),
      i.valorTotal.toFixed(2).replace('.', ','),
      i.produto.estoque_minimo !== undefined && i.produto.estoque_minimo !== null
        ? String(i.produto.estoque_minimo).replace('.', ',')
        : '',
      i.produto.estoque_maximo !== undefined && i.produto.estoque_maximo !== null
        ? String(i.produto.estoque_maximo).replace('.', ',')
        : '',
      `"${i.situacao}"`,
    ])

    const csvContent =
      '\uFEFF' + [colunas.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `posicao_estoque_${empresaAtiva?.nome_fantasia || 'empresa'}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderBadgeSituacao = (situacao: SituacaoEstoque) => {
    switch (situacao) {
      case 'Abaixo do mínimo':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100 text-[11px] font-semibold flex items-center gap-1 w-fit">
            <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
            Abaixo do mínimo
          </Badge>
        )
      case 'Acima do máximo':
        return (
          <Badge className="bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100 text-[11px] font-semibold flex items-center gap-1 w-fit">
            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
            Acima do máximo
          </Badge>
        )
      case 'Zerado':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-500 border-slate-300 text-[11px] font-medium flex items-center gap-1 w-fit"
          >
            <MinusCircle className="h-3 w-3 text-slate-400 shrink-0" />
            Zerado
          </Badge>
        )
      case 'Normal':
      default:
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[11px] font-medium flex items-center gap-1 w-fit">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
            Normal
          </Badge>
        )
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="estoque_posicao"
        tituloRelatorio="Posição de Estoque"
        subtituloRelatorio="Visão consolidada do saldo físico e financeiro com indicadores de ponto de reposição."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarDados}
        onExportarCsv={exportarCSV}
        carregando={carregando}
        filtrosExtras={
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1 min-w-[200px]">
              <label className="text-[11px] font-semibold text-slate-600 block">
                Buscar Produto
              </label>
              <input
                type="text"
                placeholder="Código, descrição, GTIN..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPagina(1)
                }}
                className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
              />
            </div>
            <div className="space-y-1 min-w-[160px]">
              <label className="text-[11px] font-semibold text-slate-600 block">
                Situação do Estoque
              </label>
              <select
                value={situacaoFiltro}
                onChange={(e) => {
                  setSituacaoFiltro(e.target.value)
                  setPagina(1)
                }}
                className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
              >
                <option value="todos">Todas as situações</option>
                <option value="Normal">Normal</option>
                <option value="Abaixo do mínimo">Abaixo do mínimo</option>
                <option value="Acima do máximo">Acima do máximo</option>
                <option value="Zerado">Zerado</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={somenteComSaldo}
                  onChange={(e) => {
                    setSomenteComSaldo(e.target.checked)
                    setPagina(1)
                  }}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Somente com saldo &gt; 0</span>
              </label>
            </div>
            <div className="pt-4 ml-auto">
              <Button
                type="button"
                size="sm"
                onClick={() => navigate('/estoque/lancamentos')}
                className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Layers className="h-3.5 w-3.5 mr-1.5" />
                Novo Lançamento
              </Button>
            </div>
          </div>
        }
      />

      {/* Cards de Resumo Rápido no topo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total de Produtos
            </div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {totalItensCatalogo.toLocaleString('pt-BR')} itens
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">com controle de estoque ativo</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Volume em Estoque
            </div>
            <div className="text-lg font-bold text-blue-700 mt-1">
              {totalQuantidadeGeral.toLocaleString('pt-BR', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">somatório das quantidades</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Valor Total do Estoque
            </div>
            <div className="text-lg font-bold text-emerald-700 mt-1">
              {totalValorGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              calculado por custo médio ponderado
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Alertas de Reposição
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm font-bold text-rose-700">
                {itensFiltrados.filter((i) => i.situacao === 'Abaixo do mínimo').length} abaixo min.
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-sm font-bold text-slate-600">
                {itensFiltrados.filter((i) => i.situacao === 'Zerado').length} zerados
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">necessitam atenção de compras</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Posição de Estoque */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200 select-none">
              <tr>
                <th
                  className="p-3 cursor-pointer hover:bg-slate-100"
                  onClick={() => alternarOrdenacao('codigo')}
                >
                  <div className="flex items-center gap-1">
                    <span>Cód.</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  className="p-3 cursor-pointer hover:bg-slate-100"
                  onClick={() => alternarOrdenacao('descricao')}
                >
                  <div className="flex items-center gap-1">
                    <span>Descrição / Identificação</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="p-3 text-center">Unid.</th>
                <th className="p-3">Grupo / Categoria</th>
                <th className="p-3">Marca</th>
                <th className="p-3">Localização</th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => alternarOrdenacao('quantidade')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Quantidade</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="p-3 text-right">Custo Médio</th>
                <th
                  className="p-3 text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => alternarOrdenacao('valorTotal')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Valor Total</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="p-3 text-center">Mín. / Máx.</th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Carregando posição do estoque...</span>
                  </td>
                </tr>
              ) : itensPaginados.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Nenhum produto encontrado</p>
                    <p className="text-[11px] mt-0.5">
                      Tente ajustar os filtros ou cadastre novos produtos com controle de estoque.
                    </p>
                  </td>
                </tr>
              ) : (
                itensPaginados.map((item) => {
                  const p = item.produto
                  const unidSigla = p.expand?.unidade_id?.sigla || 'UN'
                  const grupoNome = p.expand?.grupo_id?.nome || '—'
                  const catNome = p.expand?.categoria_id?.nome || '—'
                  const marcaNome = p.expand?.marca_id?.nome || '—'

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      onClick={() => navigate(`/estoque/kardex?produto=${p.id}`)}
                    >
                      <td className="p-3 font-mono font-bold text-slate-700">#{p.codigo}</td>
                      <td className="p-3 max-w-[260px]">
                        <div
                          className="font-semibold text-slate-900 truncate group-hover:text-blue-700"
                          title={p.descricao}
                        >
                          {p.descricao}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          {p.gtin && <span className="font-mono">GTIN: {p.gtin}</span>}
                          {p.referencia && <span>Ref: {p.referencia}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-600 uppercase">
                        {unidSigla}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="truncate max-w-[150px]">{grupoNome}</div>
                        {catNome !== '—' && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {catNome}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 truncate max-w-[110px]">{marcaNome}</td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {p.localizacao || '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {item.quantidade.toLocaleString('pt-BR', {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {item.custoMedio.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">
                        {item.valorTotal.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="p-3 text-center font-mono text-[11px] text-slate-500">
                        {p.estoque_minimo !== undefined && p.estoque_minimo !== null
                          ? Number(p.estoque_minimo).toLocaleString('pt-BR')
                          : '—'}
                        {' / '}
                        {p.estoque_maximo !== undefined && p.estoque_maximo !== null
                          ? Number(p.estoque_maximo).toLocaleString('pt-BR')
                          : '—'}
                      </td>
                      <td className="p-3">{renderBadgeSituacao(item.situacao)}</td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setProdutoModalFiliais({
                              id: p.id,
                              codigo: p.codigo,
                              descricao: p.descricao,
                              unidadeSigla: unidSigla,
                            })
                            setModalFiliaisAberto(true)
                          }}
                          className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-50 border-blue-200"
                          title="Ver saldo em todas as filiais"
                        >
                          <Building className="h-3 w-3 mr-1" />
                          Filiais
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {/* Rodapé com totais gerais */}
            <tfoot className="bg-slate-100 font-bold border-t border-slate-300 text-xs text-slate-800">
              <tr>
                <td colSpan={6} className="p-3">
                  Totais ({itensFiltrados.length} produtos filtrados):
                </td>
                <td className="p-3 text-right font-mono text-slate-900 text-sm">
                  {totalQuantidadeGeral.toLocaleString('pt-BR', {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td className="p-3 text-right text-slate-400 font-normal text-[11px]">—</td>
                <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                  {totalValorGeral.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </td>
                <td colSpan={3} className="p-3 text-right text-[11px] text-slate-500 font-normal">
                  * Clique em qualquer produto para abrir seu Kardex
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Mostrando{' '}
            <span className="font-semibold text-slate-800">
              {itensFiltrados.length === 0 ? 0 : (pagina - 1) * ITENS_POR_PAGINA + 1}
            </span>{' '}
            até{' '}
            <span className="font-semibold text-slate-800">
              {Math.min(pagina * ITENS_POR_PAGINA, itensFiltrados.length)}
            </span>{' '}
            de <span className="font-semibold text-slate-800">{itensFiltrados.length}</span>{' '}
            produtos
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="px-2 text-xs font-medium text-slate-700">
              Página {pagina} de {totalPaginas}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Saldo em Todas as Filiais */}
      <SaldoTodasFiliaisModal
        aberto={modalFiliaisAberto}
        onOpenChange={setModalFiliaisAberto}
        produto={produtoModalFiliais}
      />
    </div>
  )
}
export default PosicaoEstoquePage
