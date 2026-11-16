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

/** Item do carrinho: mínimos para a parte 1 (sem pagamento). */
type ItemCarrinho = {
  produtoId: string
  descricao: string
  unidade: string
  quantidade: number
  precoUnitario: number
}

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

/** Venda pelo celular (Trevvo Móvel, parte 1): carrinho SEM pagamento. */
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
        if (seq !== seqBuscaRef.current || !montadoRef.current) return
        setResultados(res.items)
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

  if (!permitido) return <AcessoNegado />

  // ---------- Sem caixa aberto ----------
  if (faseCaixa === 'semCaixa') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={() => navigate('/movel')}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Nova venda</p>
              <p className="truncate text-xs text-slate-500">{nomeEmpresa}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  const nomeTerminal = sessaoCaixa.expand?.pdv_terminal_id?.nome || 'Terminal'
  const nomeOperador = sessaoCaixa.expand?.operador_id?.nome || user?.name || 'Operador'

  // ---------- Venda ----------
  const avisoCameraFinal = avisoCamera || avisoCameraHook

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={() => navigate('/movel')}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Nova venda</p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <Store className="h-3 w-3" /> {nomeTerminal} · <User className="h-3 w-3" />{' '}
              {nomeOperador}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 pb-36 pt-3">
        <ErrorBoundaryGlobal titulo="Não foi possível exibir a venda">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
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

      {/* Rodapé fixo: total + FINALIZAR (desabilitado na parte 1) */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-xl px-3 py-3">
          <p className="mb-1 text-center text-[11px] text-slate-500">Pagamento na próxima versão</p>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total ({totalItens} un)
              </p>
              <p className="truncate text-2xl font-black text-emerald-700">
                {formatarMoeda(subtotal)}
              </p>
            </div>
            <Button className="h-14 w-40 shrink-0 text-base font-extrabold" disabled>
              FINALIZAR
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
