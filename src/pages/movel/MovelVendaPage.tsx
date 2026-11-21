import { aplicarPrecosDaEmpresa } from '@/services/precosEmpresa'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Loader2,
  Minus,
  Package,
  Plus,
  ScanLine,
  Store,
  Trash2,
  User,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AcessoNegado } from '@/components/AcessoNegado'
import ErrorBoundaryGlobal from '@/components/ErrorBoundaryGlobal'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import pb from '@/lib/pocketbase/client'
import { useCameraLeitor } from '@/pages/movel/useCameraLeitor'
import { listarProdutos, type Produto } from '@/services/produtos'
import { obterSessaoAbertaOperador, type CaixaSessao } from '@/services/caixa'
import { resolverOperadorErpId } from '@/services/operadorErp'
import { listarFormasPagamento } from '@/services/formasPagamento'
import { listarContasFinanceiras } from '@/services/contasFinanceiras'
import { obterConfigFiscalEmpresa } from '@/services/configEmissaoFiscal'
import type { FormaPagamento } from '@/services/formasPagamento'
import type { ContaFinanceira } from '@/services/contasFinanceiras'
import type { ConfigEmissaoFiscal } from '@/services/configEmissaoFiscal'
import type { PagamentoVendaInput } from '@/services/vendas'
import {
  concluirVendaMovel,
  type ItemCarrinhoMovel,
  type ResultadoConclusao,
} from './concluirVendaMovel'
import TelaPagamentoMovel from './TelaPagamentoMovel'
import TelaResultadoVendaMovel from './TelaResultadoVendaMovel'
import TelaEnvioCupomMovel from './TelaEnvioCupomMovel'
import TelaFecharCaixaMovel from './TelaFecharCaixaMovel'
import { imprimirDanfeUrl } from '@/services/fiscalIntegracao'

/** Item do carrinho do Móvel (mesma forma da parte 1). */
type ItemCarrinho = ItemCarrinhoMovel

const formatarMoeda = (v: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(Number(v)) ? Number(v) : 0,
  )

const urlFoto = (p: Produto): string | null => {
  if (!p.foto) return null
  try {
    return pb.files.getURL(p, p.foto, { thumb: '200x200' })
  } catch {
    return null
  }
}

const precoVendaProduto = (p: Produto) =>
  p.preco_promocional && p.preco_promocional > 0 ? p.preco_promocional : p.preco_venda || 0

/** Venda pelo celular (Trevvo Móvel, parte 2): pagamento + NFC-e como no PDV. */
export default function MovelVendaPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { usuarioERP, pode } = usePermissoes()
  const { empresaAtiva, assinanteId } = useEmpresaAtiva()

  // ---- Caixa aberto do usuário (função existente de caixa.ts) ----
  const [faseCaixa, setFaseCaixa] = useState<'carregando' | 'semCaixa' | 'pronto'>('carregando')
  const [sessaoCaixa, setSessaoCaixa] = useState<CaixaSessao | null>(null)

  // ---- Busca (igual à de /movel/consulta) ----
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Produto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [avisoCamera, setAvisoCamera] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerBuscaRef = useRef<number | null>(null)
  const seqBuscaRef = useRef(0)
  const montadoRef = useRef(true)
  const timerAddRef = useRef<number | null>(null)
  const resultadosRef = useRef<Produto[]>([])
  resultadosRef.current = resultados

  // ---- Carrinho: um único useState ----
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])

  // ---- Pagamento / conclusão (parte 2) ----
  const [telaPagamento, setTelaPagamento] = useState(false)
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [configFiscal, setConfigFiscal] = useState<ConfigEmissaoFiscal | null>(null)
  const [carregandoFormas, setCarregandoFormas] = useState(false)
  const [formasCarregadas, setFormasCarregadas] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const [resultadoVenda, setResultadoVenda] = useState<ResultadoConclusao | null>(null)
  const [erroConclusao, setErroConclusao] = useState<string | null>(null)
  const [telaFecharCaixa, setTelaFecharCaixa] = useState(false)

  const permitido = pode('pdv', 'criar')

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
      if (timerAddRef.current) window.clearTimeout(timerAddRef.current)
    }
  }, [])

  // Totais derivados — useMemo.
  const subtotal = useMemo(
    () =>
      Number(carrinho.reduce((acc, it) => acc + it.precoUnitario * it.quantidade, 0).toFixed(2)),
    [carrinho],
  )
  const totalItens = useMemo(() => carrinho.reduce((acc, it) => acc + it.quantidade, 0), [carrinho])
  const podeFinalizar = useMemo(
    () => !concluindo && !resultadoVenda && carrinho.length > 0 && subtotal > 0,
    [concluindo, resultadoVenda, carrinho.length, subtotal],
  )
  const cupomVisivel = useMemo(() => resultadoVenda?.statusNfce === 'Autorizada', [resultadoVenda])
  const emitirNfceLoja = useMemo(
    () =>
      Boolean(
        configFiscal &&
        configFiscal.emite_documentos_fiscais &&
        configFiscal.emite_nfce &&
        configFiscal.csc_configurado,
      ),
    [configFiscal],
  )

  // ---- Busca a sessão de caixa aberta do operador (mesma função do PDV) ----
  useEffect(() => {
    let cancelado = false
    const carregarSessao = async () => {
      if (!empresaAtiva?.id) return
      setFaseCaixa('carregando')
      try {
        const operadorErpId = usuarioERP?.id || (await resolverOperadorErpId()) || ''
        if (cancelado) return
        if (!operadorErpId) {
          setFaseCaixa('semCaixa')
          return
        }
        const sessao = await obterSessaoAbertaOperador(empresaAtiva.id, operadorErpId)
        if (cancelado) return
        setSessaoCaixa(sessao)
        setFaseCaixa(sessao ? 'pronto' : 'semCaixa')
      } catch (err) {
        console.error('Erro ao buscar caixa aberto:', err)
        if (!cancelado) setFaseCaixa('semCaixa')
      }
    }
    void carregarSessao()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id, usuarioERP?.id])

  // ---- Busca de produtos com debounce (mesma chamada da consulta) ----
  const buscar = useCallback(
    async (texto: string) => {
      const bus = texto.trim()
      if (!bus) {
        setResultados([])
        setErroBusca(null)
        return
      }
      if (!assinanteId || !empresaAtiva) {
        setErroBusca('Empresa não carregada; aguarde ou recarregue a página.')
        return
      }
      seqBuscaRef.current += 1
      const seq = seqBuscaRef.current
      setBuscando(true)
      setErroBusca(null)
      try {
        const res = await listarProdutos({
          busca: bus,
          situacao: 'ativos',
          itensPorPagina: 30,
          ordenacao: 'descricao',
          assinante_id: assinanteId,
        })
        const comPrecos = await aplicarPrecosDaEmpresa(res.items, empresaAtiva?.id)
        if (seq !== seqBuscaRef.current || !montadoRef.current) return
        setResultados(comPrecos)
      } catch {
        if (seq === seqBuscaRef.current && montadoRef.current) {
          setResultados([])
          setErroBusca('Não foi possível buscar produtos; tente novamente.')
        }
      } finally {
        if (seq === seqBuscaRef.current && montadoRef.current) setBuscando(false)
      }
    },
    [assinanteId, empresaAtiva?.id],
  )

  const aoDigitar = (texto: string) => {
    setTermo(texto)
    if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
    timerBuscaRef.current = window.setTimeout(() => void buscar(texto), 300)
  }

  // ---- Carrinho ----
  const adicionarProduto = useCallback((produto: Produto, quantidade = 1) => {
    setCarrinho((prev) => {
      const existente = prev.find((it) => it.produtoId === produto.id)
      if (existente) {
        return prev.map((it) =>
          it.produtoId === produto.id ? { ...it, quantidade: it.quantidade + quantidade } : it,
        )
      }
      return [
        ...prev,
        {
          produtoId: produto.id,
          descricao: produto.descricao || 'Produto sem descrição',
          unidade: produto.expand?.unidade_id?.sigla || 'UN',
          quantidade,
          precoUnitario: precoVendaProduto(produto),
        },
      ]
    })
  }, [])

  const alterarQuantidade = (produtoId: string, delta: number) => {
    setCarrinho((prev) =>
      prev
        .map((it) => {
          if (it.produtoId !== produtoId) return it
          const qtd = it.quantidade + delta
          if (qtd <= 0) return null
          return { ...it, quantidade: qtd }
        })
        .filter((it): it is ItemCarrinho => it !== null),
    )
  }

  const removerItem = (produtoId: string) => {
    setCarrinho((prev) => prev.filter((it) => it.produtoId !== produtoId))
  }

  // ---- Câmera: todo o motor vive no useCameraLeitor (igual à consulta) ----
  const camera = useCameraLeitor({
    aoLer: (codigo) => {
      setAvisoCamera(null)
      setTermo(codigo)
      void buscar(codigo)
      if (timerAddRef.current) window.clearTimeout(timerAddRef.current)
      timerAddRef.current = window.setTimeout(() => {
        if (montadoRef.current && resultadosRef.current.length === 1) {
          adicionarProduto(resultadosRef.current[0], 1)
          setTermo('')
          setResultados([])
        }
      }, 700)
    },
  })
  const { ativa: cameraAtiva, iniciar: abrirCamera, aviso: avisoCameraHook } = camera

  const nomeEmpresa = empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'

  // ---- Pagamento: carrega formas/contas/config fiscal na 1ª abertura (lazy, como o PDV) ----
  const aoAbrirPagamento = useCallback(async () => {
    if (!empresaAtiva?.id || !assinanteId) return
    setTelaPagamento(true)
    if (formasCarregadas) return
    setCarregandoFormas(true)
    try {
      const [formas, contas, cfgF] = await Promise.all([
        listarFormasPagamento({ assinante_id: assinanteId, situacao: 'ativos' }),
        listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }),
        obterConfigFiscalEmpresa(empresaAtiva.id).catch(() => null),
      ])
      if (!montadoRef.current) return
      setFormasPagamento(formas)
      setContasFinanceiras(contas)
      setConfigFiscal(cfgF)
      setFormasCarregadas(true)
    } catch (err) {
      console.error('Erro ao carregar formas de pagamento:', err)
      if (montadoRef.current) setErroConclusao('Erro ao carregar formas de pagamento.')
    } finally {
      if (montadoRef.current) setCarregandoFormas(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id, assinanteId, formasCarregadas])

  // ---- Concluir: MESMA sequência do PDV (salvarVenda → finalizarVenda → emitirNFCeVenda) ----
  const aoConcluirPagamento = useCallback(
    async (params: {
      pagamentos: PagamentoVendaInput[]
      troco: number
      cpfCnpjConsumidor: string
    }) => {
      if (!empresaAtiva?.id || !sessaoCaixa?.id || concluindo || resultadoVenda) return
      setConcluindo(true) // trava o botão até chegar a resposta (sem duplo toque)
      setErroConclusao(null)
      try {
        const res = await concluirVendaMovel({
          empresaId: empresaAtiva.id,
          sessaoCaixa,
          operadorId: usuarioERP?.id,
          assinanteId: assinanteId || undefined,
          carrinho,
          totalVenda: subtotal,
          pagamentos: params.pagamentos,
          troco: params.troco,
          cpfCnpjConsumidor: params.cpfCnpjConsumidor,
          configFiscal,
        })
        if (!montadoRef.current) return
        setResultadoVenda(res)
        setTelaPagamento(false)
      } catch (err: any) {
        console.error('Erro ao concluir venda no Móvel:', err)
        if (montadoRef.current)
          setErroConclusao(err?.message || 'Não foi possível concluir a venda.')
      } finally {
        if (montadoRef.current) setConcluindo(false)
      }
    },
    [
      empresaAtiva?.id,
      sessaoCaixa,
      concluindo,
      resultadoVenda,
      carrinho,
      subtotal,
      configFiscal,
      assinanteId,
      usuarioERP?.id,
    ],
  )

  // ---- Nova venda: limpa carrinho e volta para a venda (formas já carregadas) ----
  const aoNovaVenda = useCallback(() => {
    setCarrinho([])
    setTermo('')
    setResultados([])
    setErroBusca(null)
    setErroConclusao(null)
    setResultadoVenda(null)
    setTelaPagamento(false)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // ---- Fechar caixa: MESMOS serviços do PDV; após fechar, volta ao estado "carregando"
  // da sessão (recarrega) e sai da tela. ----
  const aoFecharCaixaSucesso = useCallback(async () => {
    setTelaFecharCaixa(false)
    setFaseCaixa('carregando')
    setSessaoCaixa(null)
    if (!empresaAtiva?.id) return
    try {
      const operadorErpId = usuarioERP?.id || (await resolverOperadorErpId()) || ''
      if (!operadorErpId) {
        setFaseCaixa('semCaixa')
        return
      }
      const sessao = await obterSessaoAbertaOperador(empresaAtiva.id, operadorErpId)
      if (!montadoRef.current) return
      setSessaoCaixa(sessao)
      setFaseCaixa(sessao ? 'pronto' : 'semCaixa')
    } catch (err) {
      console.error('Erro ao recarregar caixa aberto:', err)
      if (montadoRef.current) setFaseCaixa('semCaixa')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id, usuarioERP?.id])

  if (!permitido) return <AcessoNegado />

  // ---------- Sem caixa aberto ----------
  if (faseCaixa === 'semCaixa') {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-50">
        <header className="flex h-12 max-h-12 min-h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigate('/movel')}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Nova venda</p>
          </div>
        </header>
        <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-4 py-6">
          <ErrorBoundaryGlobal titulo="Não foi possível exibir esta tela">
            <Card>
              <CardContent className="space-y-4 p-4 text-center">
                <Store className="mx-auto h-10 w-10 text-slate-400" />
                <p className="text-base font-semibold text-slate-900">Nenhum caixa aberto.</p>
                <p className="text-sm text-slate-600">
                  Abra o caixa no PDV para vender pelo celular.
                </p>
                <Button className="h-12 w-full text-base" onClick={() => navigate('/movel')}>
                  Voltar
                </Button>
              </CardContent>
            </Card>
          </ErrorBoundaryGlobal>
        </main>
      </div>
    )
  }

  // ---------- Carregando ----------
  if (faseCaixa === 'carregando' || !sessaoCaixa) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  const nomeTerminal = sessaoCaixa.expand?.pdv_terminal_id?.nome || 'Terminal'
  const nomeOperador = sessaoCaixa.expand?.operador_id?.nome || user?.name || 'Operador'

  // ---------- Venda ----------
  const avisoCameraFinal = avisoCamera || avisoCameraHook

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-50">
      {/* Sub-cabeçalho da tela (o cabeçalho do sistema vem do MovelLayout) */}
      <div className="flex h-12 max-h-12 min-h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => navigate('/movel')}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">Nova venda</p>
          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
            <Store className="h-3 w-3 shrink-0" /> {nomeTerminal} ·{' '}
            <User className="h-3 w-3 shrink-0" /> {nomeOperador}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={() => setTelaFecharCaixa(true)}
          aria-label="Fechar caixa"
          title="Fechar caixa"
        >
          <Wallet className="h-5 w-5" />
        </Button>
      </div>

      {/* Conteúdo com rolagem própria */}
      <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3">
        <ErrorBoundaryGlobal titulo="Não foi possível exibir a venda">
          <div className="space-y-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={inputRef}
                  autoFocus
                  value={termo}
                  onChange={(e) => aoDigitar(e.target.value)}
                  placeholder="Buscar produto (nome, código, EAN)…"
                  className="h-12 pl-9 text-base"
                  inputMode="search"
                />
              </div>
              <Button
                type="button"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => (cameraAtiva ? undefined : abrirCamera())}
                aria-label="Ler código com a câmera"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {(buscando || erroBusca || avisoCameraFinal) && (
              <div className="space-y-1">
                {buscando && (
                  <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                  </p>
                )}
                {erroBusca && <p className="px-1 text-xs text-red-600">{erroBusca}</p>}
                {avisoCameraFinal && (
                  <p className="px-1 text-xs text-amber-700">{avisoCameraFinal}</p>
                )}
              </div>
            )}

            {cameraAtiva && (
              <Card>
                <CardContent className="relative p-2">
                  <div className="relative overflow-hidden rounded-md bg-black">
                    <video
                      ref={camera.videoRef}
                      className="aspect-video w-full bg-black object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-full px-6">
                        <div className="relative h-10 w-full rounded-md border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]">
                          <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
                        </div>
                        <p className="mt-2 text-center text-xs font-medium text-white drop-shadow">
                          Aponte para o código de barras
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {resultados.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Toque no produto para adicionar
                </p>
                {resultados.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          adicionarProduto(p, 1)
                          setTermo('')
                          setResultados([])
                          window.setTimeout(() => inputRef.current?.focus(), 50)
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        {urlFoto(p) ? (
                          <img
                            src={urlFoto(p) || ''}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100">
                            <Package className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {p.descricao}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            Ref.: {p.referencia || '—'} · EAN: {p.gtin || '—'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-emerald-700">
                          {formatarMoeda(precoVendaProduto(p))}
                        </span>
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Carrinho ({totalItens} {totalItens === 1 ? 'item' : 'itens'})
              </p>
              {carrinho.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-center text-xs text-slate-500">
                    Nenhum item ainda. Busque e toque no produto para adicionar.
                  </CardContent>
                </Card>
              ) : (
                carrinho.map((it) => (
                  <Card key={it.produtoId}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {it.descricao}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarMoeda(it.precoUnitario)} / {it.unidade} ·{' '}
                          <span className="font-semibold text-slate-700">
                            {formatarMoeda(it.precoUnitario * it.quantidade)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-10 w-10"
                          aria-label="Diminuir quantidade"
                          onClick={() => alterarQuantidade(it.produtoId, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-bold text-slate-900">
                          {it.quantidade}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-10 w-10"
                          aria-label="Aumentar quantidade"
                          onClick={() => alterarQuantidade(it.produtoId, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10 text-red-600"
                          aria-label="Remover item"
                          onClick={() => removerItem(it.produtoId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </ErrorBoundaryGlobal>
      </main>

      {/* Rodapé fixo: total à esquerda + FINALIZAR à direita (≥45% da largura) */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {erroConclusao && <p className="mb-1 text-center text-xs text-red-600">{erroConclusao}</p>}
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total ({totalItens} un)
            </p>
            <p className="truncate text-2xl font-black text-emerald-700">
              {formatarMoeda(subtotal)}
            </p>
          </div>
          <Button
            className="h-14 w-[45%] min-w-[160px] max-w-[220px] shrink-0 text-base font-extrabold"
            disabled={!podeFinalizar}
            onClick={() => void aoAbrirPagamento()}
          >
            {concluindo ? <Loader2 className="h-5 w-5 animate-spin" /> : 'FINALIZAR'}
          </Button>
        </div>
      </footer>

      {/* Tela de pagamento em tela cheia (lógica do ModalPagamentoPDV) */}
      <TelaPagamentoMovel
        className="absolute inset-0 z-40"
        aberto={telaPagamento && !resultadoVenda}
        total={subtotal}
        formas={formasPagamento}
        contas={contasFinanceiras}
        emitirNfce={emitirNfceLoja}
        carregandoFormas={carregandoFormas}
        aoVoltar={() => setTelaPagamento(false)}
        aoConcluir={aoConcluirPagamento}
      />

      {/* Tela de resultado: venda concluída + status da NFC-e (tela cheia) */}
      {resultadoVenda && (
        <TelaResultadoVendaMovel
          className="absolute inset-0 z-40"
          resultado={resultadoVenda}
          aoNovaVenda={aoNovaVenda}
        />
      )}

      {/* Cupom da NFC-e autorizada, em tela cheia sobre o resultado */}
      {resultadoVenda && cupomVisivel && (
        <TelaEnvioCupomMovel
          className="absolute inset-0 z-50"
          numero={resultadoVenda.numeroNfce ?? resultadoVenda.numeroVenda}
          serie={resultadoVenda.serie}
          chave={resultadoVenda.chave}
          valor={resultadoVenda.valorTotal}
          nomeLoja={empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Loja'}
          // danfe_url do backend já sai com a URL base da Focus composta
          caminhoDanfe={resultadoVenda.danfeUrl}
          urlConsulta={resultadoVenda.urlConsulta}
          onImprimir={() => {
            if (resultadoVenda.danfeUrl) imprimirDanfeUrl(resultadoVenda.danfeUrl)
          }}
          aoFechar={aoNovaVenda}
        />
      )}

      {/* Fechamento de caixa, em tela cheia (mesmos serviços do PDV) */}
      {telaFecharCaixa && sessaoCaixa && (
        <TelaFecharCaixaMovel
          className="absolute inset-0 z-50"
          sessao={sessaoCaixa}
          aoFechar={() => setTelaFecharCaixa(false)}
          aoSucesso={() => void aoFecharCaixaSucesso()}
        />
      )}
    </div>
  )
}
