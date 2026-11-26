import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Percent, Loader2, Download, RefreshCw, Info, AlertTriangle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { CLASSE_FAIXA, FaixaMargem, ROTULO_FAIXA } from '@/services/canaisMargem'
import {
  BaseMargens,
  CelulaMargem,
  LinhaMargem,
  carregarBaseMargens,
  resumirPorCanal,
} from '@/services/margemCanaisRelatorio'
import { fazerDownloadCsv, gerarCsvRelatorio, formatarNumeroCsv } from '@/services/relatorios'

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const pct = (v: number) => `${(v || 0).toFixed(1).replace('.', ',')}%`
const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

type FiltroFaixa = 'todas' | FaixaMargem | 'sem_custo'
type Ordem = 'vendidos' | 'menor_margem' | 'faturamento' | 'codigo'
type Opcao = { id: string; nome: string; grupo_id?: string }

const POR_PAGINA = 200

export const MargemCanaisPage: React.FC = () => {
  const assinanteId = useAssinanteId()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [base, setBase] = useState<BaseMargens | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [grupos, setGrupos] = useState<Opcao[]>([])
  const [categorias, setCategorias] = useState<Opcao[]>([])
  const [marcas, setMarcas] = useState<Opcao[]>([])

  const canalId = params.get('canal') || ''
  const faixa = (params.get('faixa') as FiltroFaixa) || 'todas'
  const [ordem, setOrdem] = useState<Ordem>('vendidos')
  const [grupoId, setGrupoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [busca, setBusca] = useState('')
  const [soComVenda, setSoComVenda] = useState(false)
  const [incluirAtivos, setIncluirAtivos] = useState(false)
  const [limite, setLimite] = useState(POR_PAGINA)

  const setParam = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params)
    if (valor && valor !== 'todas') novo.set(chave, valor)
    else novo.delete(chave)
    setParams(novo, { replace: true })
    setLimite(POR_PAGINA)
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setBase(
        await carregarBaseMargens({
          assinanteId,
          incluirAtivosSemDados: incluirAtivos,
          verificarEntradas: true,
        }),
      )
    } catch (e) {
      setErro(getErrorMessage(e))
    } finally {
      setCarregando(false)
    }
  }, [assinanteId, incluirAtivos])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    const ler = (nome: string, campos: string) =>
      pb
        .collection(nome)
        .getFullList<Opcao>({ fields: campos, sort: 'nome', requestKey: null })
        .catch(() => [] as Opcao[])
    void ler('grupos', 'id,nome').then(setGrupos)
    void ler('categorias', 'id,nome,grupo_id').then(setCategorias)
    void ler('marcas', 'id,nome').then(setMarcas)
  }, [])

  const resumo = useMemo(() => (base ? resumirPorCanal(base) : []), [base])
  const canaisVisiveis = useMemo(
    () => (base ? base.canais.filter((c) => !canalId || c.id === canalId) : []),
    [base, canalId],
  )

  /** Célula usada para filtrar e ordenar: a do canal escolhido, ou a de pior margem. */
  const celulaChave = useCallback(
    (l: LinhaMargem): CelulaMargem | null => {
      if (canalId) return l.celulas[canalId] || null
      let pior: CelulaMargem | null = null
      for (const c of Object.values(l.celulas)) {
        if (!c.temDados && !incluirAtivos) continue
        if (!c.faixa) continue
        if (!pior || c.r.margemSobreRecebido < pior.r.margemSobreRecebido) pior = c
      }
      return pior
    },
    [canalId, incluirAtivos],
  )

  const filtradas = useMemo(() => {
    if (!base) return []
    const termo = busca.trim().toLowerCase()
    const lista = base.linhas.filter((l) => {
      const p = l.produto
      if (grupoId && p.grupoId !== grupoId) return false
      if (categoriaId && p.categoriaId !== categoriaId) return false
      if (marcaId && p.marcaId !== marcaId) return false
      if (termo && !p.descricao.toLowerCase().includes(termo) && String(p.codigo) !== termo)
        return false
      const cel = canalId ? l.celulas[canalId] : null
      if (canalId && !incluirAtivos && !cel?.temDados) return false
      const unidades = canalId ? cel?.unidades || 0 : l.unidadesTotal
      if (soComVenda && unidades <= 0) return false
      if (faixa === 'sem_custo') return l.semCusto
      if (faixa !== 'todas') {
        if (canalId) return cel?.faixa === faixa
        return Object.values(l.celulas).some(
          (c) => (c.temDados || incluirAtivos) && c.faixa === faixa,
        )
      }
      return true
    })
    const margemDe = (l: LinhaMargem) => {
      const c = celulaChave(l)
      return c ? c.r.margemSobreRecebido : Number.POSITIVE_INFINITY
    }
    const unid = (l: LinhaMargem) => (canalId ? l.celulas[canalId]?.unidades || 0 : l.unidadesTotal)
    const fat = (l: LinhaMargem) =>
      canalId ? l.celulas[canalId]?.faturamento || 0 : l.faturamentoTotal
    lista.sort((a, b) => {
      if (ordem === 'vendidos') return unid(b) - unid(a) || margemDe(a) - margemDe(b)
      if (ordem === 'faturamento') return fat(b) - fat(a)
      if (ordem === 'menor_margem') return margemDe(a) - margemDe(b)
      return a.produto.codigo - b.produto.codigo
    })
    return lista
  }, [
    base,
    busca,
    grupoId,
    categoriaId,
    marcaId,
    canalId,
    incluirAtivos,
    soComVenda,
    faixa,
    ordem,
    celulaChave,
  ])

  const exportar = () => {
    if (!base) return
    const colunas = ['Código', 'Produto', 'Custo', 'Custo sem nota de entrada']
    for (const c of canaisVisiveis) {
      const n = c.nome
      colunas.push(
        `${n} preço`,
        `${n} recebido`,
        `${n} lucro`,
        `${n} margem s/ recebido %`,
        `${n} margem s/ preço %`,
        `${n} faixa`,
        `${n} vendidos`,
      )
    }
    const linhas = filtradas.map((l) => {
      const linha: (string | number)[] = [
        l.produto.codigo,
        l.produto.descricao,
        formatarNumeroCsv(l.produto.custo),
        l.custoSemEntrada ? 'Sim' : '',
      ]
      for (const c of canaisVisiveis) {
        const cel = l.celulas[c.id as string]
        if (!cel) {
          linha.push('', '', '', '', '', '', '')
          continue
        }
        linha.push(
          formatarNumeroCsv(cel.r.preco),
          cel.r.recebidoInformado ? formatarNumeroCsv(cel.r.recebido) : '',
          formatarNumeroCsv(cel.r.lucro),
          formatarNumeroCsv(cel.r.margemSobreRecebido),
          formatarNumeroCsv(cel.r.margem),
          cel.faixa ? ROTULO_FAIXA[cel.faixa] : 'Sem custo',
          cel.unidades || '',
        )
      }
      return linha
    })
    fazerDownloadCsv(
      gerarCsvRelatorio({
        titulo: 'Margem por canal',
        colunas,
        linhas,
        metadadosExtras: {
          Faixas: 'acima de 20% verde; 0 a 20% amarelo (requer atenção); negativa vermelho',
        },
      }),
      `margem-por-canal-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    toast({ title: `${linhas.length} produto(s) exportados` })
  }

  const abrirProduto = (id: string) => navigate(`/cadastros/produtos/${id}/editar?aba=precos`)

  const categoriasDoGrupo = grupoId ? categorias.filter((c) => c.grupo_id === grupoId) : categorias
  const sel = 'h-9 rounded-md border border-slate-200 bg-white px-2 text-xs'

  return (
    <div
      className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto notranslate overflow-x-hidden"
      translate="no"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-900">Margem por canal</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Margem líquida de cada produto em cada canal de venda, com o mesmo cálculo da aba Preços
            do produto. Clique no produto para abrir a aba Preços.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 mr-1 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={exportar} disabled={!base || filtradas.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Excel (CSV)
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {(['verde', 'amarela', 'vermelha'] as const).map((f) => (
          <span key={f} className={`px-2 py-0.5 rounded font-semibold ${CLASSE_FAIXA[f]}`}>
            {ROTULO_FAIXA[f]}
          </span>
        ))}
        <span className="px-2 py-0.5 rounded text-slate-500 bg-slate-100 flex items-center gap-1">
          <Info className="h-3 w-3" /> Margem = lucro ÷ valor recebido do canal
        </span>
      </div>

      {erro && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs">
          Não foi possível carregar o relatório: {erro}
        </div>
      )}

      {/* Cartões por canal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {resumo.map((r) => {
          const ativo = canalId === r.canal.id
          return (
            <Card
              key={r.canal.id}
              className={`cursor-pointer transition-all min-w-0 ${ativo ? 'ring-2 ring-indigo-400' : 'hover:shadow-sm'}`}
              onClick={() => setParam('canal', ativo ? '' : (r.canal.id as string))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{r.canal.nome}</span>
                  <span className="text-[11px] text-slate-500">
                    {r.produtos} com preço no canal
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {(
                    [
                      ['vermelha', r.vermelha],
                      ['amarela', r.amarela],
                      ['verde', r.verde],
                    ] as [FaixaMargem, number][]
                  ).map(([f, n]) => (
                    <button
                      key={f}
                      type="button"
                      className={`rounded p-1.5 ${CLASSE_FAIXA[f]}`}
                      title={ROTULO_FAIXA[f]}
                      onClick={(e) => {
                        e.stopPropagation()
                        const novo = new URLSearchParams(params)
                        novo.set('canal', r.canal.id as string)
                        novo.set('faixa', f)
                        setParams(novo, { replace: true })
                        setOrdem('vendidos')
                      }}
                    >
                      <div className="text-lg font-bold leading-none">{n}</div>
                      <div className="text-[10px] mt-0.5">
                        {f === 'vermelha' ? 'negativa' : f === 'amarela' ? '0 a 20%' : '> 20%'}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 flex justify-between">
                  <span>Média {pct(r.margemMedia)}</span>
                  {r.semCusto > 0 && <span className="text-amber-700">{r.semCusto} sem custo</span>}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={canalId} onChange={(e) => setParam('canal', e.target.value)}>
          <option value="">Todos os canais</option>
          {(base?.canais || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select className={sel} value={faixa} onChange={(e) => setParam('faixa', e.target.value)}>
          <option value="todas">Todas as faixas</option>
          <option value="vermelha">Negativa (intervenção urgente)</option>
          <option value="amarela">0 a 20% (requer atenção)</option>
          <option value="verde">Acima de 20%</option>
          <option value="sem_custo">Sem custo cadastrado</option>
        </select>
        <select
          className={sel}
          value={grupoId}
          onChange={(e) => {
            setGrupoId(e.target.value)
            setCategoriaId('')
          }}
        >
          <option value="">Todos os grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categoriasDoGrupo.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <select className={sel} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
          <option value="">Todas as marcas</option>
          {marcas.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <select className={sel} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="vendidos">Mais vendidos</option>
          <option value="menor_margem">Menor margem</option>
          <option value="faturamento">Maior faturamento</option>
          <option value="codigo">Código</option>
        </select>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto ou código"
          className="h-9 w-56 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={soComVenda}
            onChange={(e) => setSoComVenda(e.target.checked)}
          />
          Só com venda
        </label>
        <label
          className="flex items-center gap-1.5 text-xs text-slate-600"
          title="Inclui os produtos ativos sem preço gravado no canal, com a margem pela regra do canal"
        >
          <input
            type="checkbox"
            checked={incluirAtivos}
            onChange={(e) => setIncluirAtivos(e.target.checked)}
          />
          Incluir ativos sem preço no canal
        </label>
      </div>

      {carregando && !base ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Calculando margens...
        </div>
      ) : (
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
            {filtradas.length} produto(s)
          </div>
          <table className="w-full table-fixed text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2 w-14 overflow-hidden">Código</th>
                <th className="text-left p-2 w-[18%]">Produto</th>
                <th className="text-right p-2 w-24">Custo</th>
                {canaisVisiveis.map((c) => (
                  <th key={c.id} className="text-right p-2 overflow-hidden">
                    {c.nome}
                  </th>
                ))}
                {!canalId && <th className="text-right p-2 w-14">Vendidos</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, limite).map((l) => (
                <tr
                  key={l.produto.id}
                  className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer"
                  onClick={() => abrirProduto(l.produto.id)}
                >
                  <td className="p-2 font-mono text-slate-500 overflow-hidden">
                    {l.produto.codigo}
                  </td>
                  <td className="p-2 overflow-hidden">
                    <div className="font-medium text-slate-800 truncate">{l.produto.descricao}</div>
                    {!l.produto.ativo && (
                      <span className="text-[10px] text-slate-400">inativo</span>
                    )}
                  </td>
                  <td className="p-2 text-right overflow-hidden">
                    {l.semCusto ? (
                      <span className="text-amber-700 font-semibold">sem custo</span>
                    ) : (
                      brl(l.produto.custo)
                    )}
                    {l.custoSemEntrada && !l.semCusto && (
                      <div
                        className="text-[10px] text-amber-600 flex items-center justify-end gap-0.5"
                        title="Nenhuma nota de entrada lançada no Trevvo atualizou este custo (veio do cadastro ou da importação). Confira antes de mexer no preço."
                      >
                        <AlertTriangle className="h-3 w-3" /> sem nota de entrada
                      </div>
                    )}
                  </td>
                  {canaisVisiveis.map((c) => {
                    const cel = l.celulas[c.id as string]
                    if (!cel || cel.r.preco <= 0)
                      return (
                        <td key={c.id} className="p-2 text-right text-slate-300 overflow-hidden">
                          sem preço
                        </td>
                      )
                    return (
                      <td key={c.id} className="p-2 text-right overflow-hidden">
                        <div
                          className={`truncate ${cel.temDados ? 'text-slate-800' : 'text-slate-400'}`}
                        >
                          {brl(cel.r.preco)}
                          {cel.r.recebidoInformado && (
                            <span className="text-slate-400"> → {brl(cel.r.recebido)}</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          {cel.unidades > 0 && (
                            <span
                              className="text-[10px] text-slate-500"
                              title={`Vendidos no relatório importado em ${dataBr(cel.vendasEm)}`}
                            >
                              {cel.unidades} un.
                            </span>
                          )}
                          {cel.faixa ? (
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${CLASSE_FAIXA[cel.faixa]}`}
                              title={`${ROTULO_FAIXA[cel.faixa]}. Lucro ${brl(cel.r.lucro)}; ${pct(cel.r.margem)} sobre o preço${cel.temDados ? '' : '. Preço pela regra do canal (nada gravado no canal)'}`}
                            >
                              {pct(cel.r.margemSobreRecebido)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-700">sem custo</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  {!canalId && (
                    <td className="p-2 text-right overflow-hidden">
                      {l.unidadesTotal > 0 ? l.unidadesTotal : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length === 0 && !carregando && (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum produto neste filtro. Os preços e valores recebidos entram pela importação em{' '}
              <Link to="/configuracoes/canais-margem" className="text-blue-600 hover:underline">
                Canais de venda
              </Link>{' '}
              ou pela aba Preços do produto.
            </div>
          )}
          {filtradas.length > limite && (
            <div className="p-3 text-center border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setLimite((n) => n + POR_PAGINA)}>
                Mostrar mais ({filtradas.length - limite} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MargemCanaisPage
