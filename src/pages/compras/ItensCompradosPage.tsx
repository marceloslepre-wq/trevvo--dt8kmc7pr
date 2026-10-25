import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { listarItensComprados, ItemCompradoLinha } from '@/services/consultasCompras'
import { listarCfop, Cfop } from '@/services/cfop'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Layers, ChevronLeft, ChevronRight, Package, FileText, DollarSign } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export const ItensCompradosPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const hoje = new Date()
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(hoje.getDate() - 30)
  const dataInicioPadrao = trintaDiasAtras.toISOString().split('T')[0]
  const dataFimPadrao = hoje.toISOString().split('T')[0]

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    atalho_periodo: 'ultimos_30',
    periodo: {
      dataInicio: dataInicioPadrao,
      dataFim: dataFimPadrao,
    },
    tipo_data: 'entrada',
    fornecedores_ids: [],
    produtos_ids: [],
    grupos_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(
    () => ['pessoas_fornecedores', 'produtos_especificos', 'produtos_grupos', 'datas_tipo_data'],
    [],
  )

  const [cfopEntrada, setCfopEntrada] = useState<string>('todos')
  const [busca, setBusca] = useState<string>('')

  const dataInicio = filtros.periodo?.dataInicio || dataInicioPadrao
  const dataFim = filtros.periodo?.dataFim || dataFimPadrao
  const empresaIdEfetiva = filtros.empresas_ids?.[0] || empresaAtiva?.id || ''
  const fornecedorId = filtros.fornecedores_ids?.[0] || 'todos'
  const produtoId = filtros.produtos_ids?.[0] || 'todos'
  const grupoId = filtros.grupos_ids?.[0] || 'todos'

  // Listas auxiliares para selects
  const [cfopsEntrada, setCfopsEntrada] = useState<Cfop[]>([])

  // Estado dos dados
  const [itens, setItens] = useState<ItemCompradoLinha[]>([])
  const [carregando, setCarregando] = useState<boolean>(true)
  const [pagina, setPagina] = useState<number>(1)
  const [totalPaginas, setTotalPaginas] = useState<number>(1)
  const [totalRegistros, setTotalRegistros] = useState<number>(0)
  const [totais, setTotais] = useState<{ quantidadeTotal: number; valorTotal: number }>({
    quantidadeTotal: 0,
    valorTotal: 0,
  })

  // Carregar CFOPs no mount
  useEffect(() => {
    listarCfop({ situacao: 'ativos', tipo_movimento: 'Entrada', perPage: 100 })
      .then((res) => setCfopsEntrada(res.items))
      .catch((e) => console.warn('Erro ao carregar CFOPs de entrada:', e))
  }, [])

  // Buscar itens comprados
  const carregarDados = useCallback(
    async (pageToLoad = 1) => {
      if (!empresaIdEfetiva) return
      setCarregando(true)
      try {
        const res = await listarItensComprados({
          empresaId: empresaIdEfetiva,
          dataInicio,
          dataFim,
          fornecedorId,
          produtoId,
          grupoId,
          cfopEntrada,
          busca,
          page: pageToLoad,
          perPage: 25,
        })

        setItens(res.items)
        setTotalRegistros(res.totalItems)
        setTotalPaginas(res.totalPages || 1)
        setPagina(res.page)
        setTotais(res.totais)
      } catch (err: unknown) {
        console.error('Erro ao consultar itens comprados:', err)
        toast({
          title: 'Erro na consulta',
          description: err instanceof Error ? err.message : 'Falha ao buscar itens comprados',
          variant: 'destructive',
        })
      } finally {
        setCarregando(false)
      }
    },
    [
      empresaIdEfetiva,
      dataInicio,
      dataFim,
      fornecedorId,
      produtoId,
      grupoId,
      cfopEntrada,
      busca,
      toast,
    ],
  )

  useEffect(() => {
    carregarDados(1)
  }, [carregarDados])

  const handleLimparFiltros = () => {
    setFiltros({
      empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
      atalho_periodo: 'ultimos_30',
      periodo: {
        dataInicio: dataInicioPadrao,
        dataFim: dataFimPadrao,
      },
      tipo_data: 'entrada',
      fornecedores_ids: [],
      produtos_ids: [],
      grupos_ids: [],
    })
    setCfopEntrada('todos')
    setBusca('')
  }

  // Exportar CSV
  const handleExportarCsv = () => {
    if (itens.length === 0) {
      toast({
        title: 'Nenhum dado para exportar',
        description: 'Faça uma busca que retorne itens antes de exportar.',
      })
      return
    }

    const colunas = [
      'Data Entrada',
      'Data Emissao',
      'Modelo',
      'Serie',
      'Numero Nota',
      'Fornecedor',
      'CNPJ Fornecedor',
      'UF',
      'Codigo Produto',
      'Produto',
      'Unidade',
      'CFOP Entrada',
      'Qtd Fornecedor',
      'Fator Conversao',
      'Qtd Estoque',
      'Custo Unitario (R$)',
      'Valor Total Item (R$)',
      'Custo Total Item (R$)',
      'Chave Acesso',
    ]

    const linhasCsv = itens.map((it) => [
      it.data_entrada,
      it.data_emissao,
      it.modelo,
      it.serie,
      it.numero_nota,
      `"${(it.fornecedor_nome || '').replace(/"/g, '""')}"`,
      it.fornecedor_cnpj || '',
      it.fornecedor_uf || '',
      it.produto_codigo || '',
      `"${(it.produto_descricao || '').replace(/"/g, '""')}"`,
      it.unidade_sigla || '',
      it.cfop_entrada,
      it.quantidade_fornecedor.toFixed(4).replace('.', ','),
      it.fator_conversao.toFixed(4).replace('.', ','),
      it.quantidade_estoque.toFixed(4).replace('.', ','),
      it.custo_unitario.toFixed(4).replace('.', ','),
      it.valor_total_item.toFixed(2).replace('.', ','),
      it.custo_total_item.toFixed(2).replace('.', ','),
      it.chave_acesso || '',
    ])

    const conteudoCsv = [colunas.join(';'), ...linhasCsv.map((r) => r.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + conteudoCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `itens_comprados_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: `${itens.length} itens exportados para CSV com sucesso.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="compras_itens_comprados"
        tituloRelatorio="Itens Comprados"
        subtituloRelatorio="Consulta consolidada de itens recebidos em notas fiscais de entrada lançadas no ERP."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={() => carregarDados(1)}
        onExportarCsv={handleExportarCsv}
        carregando={carregando}
        filtrosExtras={
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1 min-w-[200px]">
              <label className="text-[11px] font-semibold text-slate-600 block">
                CFOP de Entrada
              </label>
              <select
                value={cfopEntrada}
                onChange={(e) => setCfopEntrada(e.target.value)}
                className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2 font-mono"
              >
                <option value="todos">Todos os CFOPs</option>
                {cfopsEntrada.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} — {c.descricao.slice(0, 35)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 min-w-[200px]">
              <label className="text-[11px] font-semibold text-slate-600 block">Busca Rápida</label>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Descrição, número da nota..."
                className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
              />
            </div>
          </div>
        }
      />

      {/* Cartões de Indicadores do Resultado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500">Itens Listados</span>
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
                {carregando ? '—' : totalRegistros}
              </div>
              <span className="text-[11px] text-slate-400">em notas lançadas</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500">Quantidade Total (Estoque)</span>
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
                {carregando
                  ? '—'
                  : totais.quantidadeTotal.toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4,
                    })}
              </div>
              <span className="text-[11px] text-slate-400">unidades convertidas</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500">Valor Total Comprado</span>
              <div className="text-2xl font-bold tracking-tight text-emerald-700 font-mono mt-1">
                {carregando
                  ? '—'
                  : `R$ ${totais.valorTotal.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </div>
              <span className="text-[11px] text-slate-400">soma dos itens do período</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Itens Comprados */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-0">
          {carregando ? (
            <div className="p-12 text-center text-slate-500">
              <div className="inline-block animate-spin h-6 w-6 border-3 border-blue-600 border-t-transparent rounded-full mb-2" />
              <p className="text-xs">Consultando itens de notas lançadas...</p>
            </div>
          ) : itens.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">Nenhum item encontrado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Não foram encontrados itens de notas fiscais de entrada lançadas que atendam aos
                filtros informados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Data Entrada</th>
                    <th className="py-2.5 px-3">Nota</th>
                    <th className="py-2.5 px-3">Fornecedor</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3">CFOP</th>
                    <th className="py-2.5 px-3 text-right">Qtd Estoque</th>
                    <th className="py-2.5 px-3 text-right">Custo Unit.</th>
                    <th className="py-2.5 px-3 text-right">Total Item</th>
                    <th className="py-2.5 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Data Entrada */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {it.data_entrada
                          ? new Date(it.data_entrada).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>

                      {/* Nota */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 font-mono">
                          Nº {it.numero_nota}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Mod {it.modelo} • Sér {it.serie || '0'}
                        </div>
                      </td>

                      {/* Fornecedor */}
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <div
                          className="font-medium text-slate-900 truncate"
                          title={it.fornecedor_nome}
                        >
                          {it.fornecedor_nome}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {it.fornecedor_cnpj ? `CNPJ: ${it.fornecedor_cnpj}` : ''}
                          {it.fornecedor_uf ? ` • ${it.fornecedor_uf}` : ''}
                        </div>
                      </td>

                      {/* Produto */}
                      <td className="py-2.5 px-3 max-w-[240px]">
                        <div
                          className="font-medium text-slate-900 truncate"
                          title={it.produto_descricao}
                        >
                          {it.produto_descricao}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          {it.produto_codigo && (
                            <span className="font-mono font-semibold">#{it.produto_codigo}</span>
                          )}
                          {it.unidade_sigla && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                              {it.unidade_sigla}
                            </Badge>
                          )}
                          {it.grupo_nome && (
                            <span className="text-slate-400 truncate">• {it.grupo_nome}</span>
                          )}
                        </div>
                      </td>

                      {/* CFOP */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {it.cfop_entrada || '—'}
                        </Badge>
                      </td>

                      {/* Qtd Estoque */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {it.quantidade_estoque.toLocaleString('pt-BR', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 4,
                        })}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          {it.unidade_sigla || ''}
                        </span>
                      </td>

                      {/* Custo Unitário */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        R${' '}
                        {it.custo_unitario.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}
                      </td>

                      {/* Total Item */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        R${' '}
                        {it.valor_total_item.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Link to={`/compras/notas-entrada/${it.nota_id}/conferencia`}>
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Ver Nota
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-slate-100 text-xs text-slate-500">
              <div>
                Página <span className="font-semibold text-slate-800">{pagina}</span> de{' '}
                <span className="font-semibold text-slate-800">{totalPaginas}</span> (
                {totalRegistros} itens)
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => carregarDados(pagina - 1)}
                  disabled={pagina <= 1 || carregando}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-4 w-4 mr-0.5" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => carregarDados(pagina + 1)}
                  disabled={pagina >= totalPaginas || carregando}
                  className="h-8 text-xs"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ItensCompradosPage
