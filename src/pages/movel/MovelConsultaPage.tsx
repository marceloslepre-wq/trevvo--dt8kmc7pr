import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Barcode, Camera, Loader2, PackageSearch, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AcessoNegado } from '@/components/AcessoNegado'
import ErrorBoundaryGlobal from '@/components/ErrorBoundaryGlobal'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva, useEmpresasAcessiveis } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { listarProdutos, type Produto } from '@/services/produtos'
import { obterSaldoAtual, type EstoqueSaldo } from '@/services/estoque'
import pb from '@/lib/pocketbase/client'

/** Saldo de um produto: o registro, null (sem estoque), 'carregando' ou 'erro'. */
type EstadoSaldo = EstoqueSaldo | null | 'carregando' | 'erro'

// ---- Formatação SEMPRE segura: nenhum valor cru chega ao JSX ---------------
// (null vira "—", número inválido vira 0,00) — era aqui que nascia a tela branca.
const textoSeguro = (v: unknown, substituto = '—') => {
  if (v === null || v === undefined) return substituto
  const s = String(v).trim()
  return s || substituto
}

const formatarMoeda = (v: unknown) => {
  const n = Number(v)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(n) ? n : 0,
  )
}

const numeroSeguro = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const corSaldo = (qtd: number) =>
  qtd < 0 ? 'text-red-600' : qtd === 0 ? 'text-slate-500' : 'text-emerald-700'

const rotuloSaldo = (qtd: number) =>
  qtd === 0
    ? 'Sem estoque'
    : `${qtd.toLocaleString('pt-BR')} ${qtd < 0 ? '(negativo)' : 'disponível'}`

const urlFoto = (p: Produto): string | null => {
  if (!p.foto) return null
  try {
    return pb.files.getURL(p, p.foto, { thumb: '200x200' })
  } catch {
    return null
  }
}

/** Consulta rápida de produtos pelo celular (Trevvo Móvel, parte 1). */
export default function MovelConsultaPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { pode } = usePermissoes()
  const { empresaAtiva, assinanteId } = useEmpresaAtiva()
  const { empresasAcessiveis } = useEmpresasAcessiveis()

  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [semResultados, setSemResultados] = useState(false)
  const [resultados, setResultados] = useState<Produto[]>([])
  const [saldos, setSaldos] = useState<Record<string, EstadoSaldo>>({})
  const [detalhe, setDetalhe] = useState<Produto | null>(null)
  const [saldosDetalhe, setSaldosDetalhe] = useState<Record<string, EstadoSaldo>>({})
  const [avisoCamera, setAvisoCamera] = useState<string | null>(null)
  const [versaoLista, setVersaoLista] = useState(0)
  const [versaoDetalhe, setVersaoDetalhe] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const timerBuscaRef = useRef<number | null>(null)
  const seqBuscaRef = useRef(0)
  const seqDetalheRef = useRef(0)
  const montadoRef = useRef(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const lerCancRef = useRef(false)
  const resultadosRef = useRef<Produto[]>([])
  resultadosRef.current = resultados

  // Permissão: módulo produtos / ver (mesma regra do GuardaRota para /movel/*).
  const permitido = pode('produtos', 'ver')

  // Desmontagem: cancela o debounce, encerra a câmera e proíbe setState depois.
  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
      lerCancRef.current = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Saldos da lista atual (empresa ativa) — guarda o REGISTRO (ou null), nunca
  // um texto como 'ok': era isso que quebrava o cartão ao ler `.quantidade`.
  const carregarSaldosLista = async (produtos: Produto[], seq: number) => {
    if (!empresaAtiva) return
    setSaldos(Object.fromEntries(produtos.map((p) => [p.id, 'carregando' as EstadoSaldo])))
    const pares = await Promise.all(
      produtos.map(async (p) => {
        try {
          const s = await obterSaldoAtual(empresaAtiva.id, p.id)
          return [p.id, s ? (s as EstoqueSaldo) : null] as const
        } catch {
          return [p.id, 'erro' as EstadoSaldo] as const
        }
      }),
    )
    if (seq !== seqBuscaRef.current || !montadoRef.current) return // resposta obsoleta
    setSaldos(Object.fromEntries(pares))
  }

  const buscar = async (texto: string) => {
    const bus = texto.trim()
    if (!bus) {
      setResultados([])
      setSaldos({})
      setSemResultados(false)
      setErro(null)
      return
    }
    if (!assinanteId || !empresaAtiva) {
      setErro('Empresa não carregada; aguarde ou recarregue a página.')
      return
    }
    seqBuscaRef.current += 1 // cancela/cancela a resposta da busca anterior
    const seq = seqBuscaRef.current
    setCarregando(true)
    setErro(null)
    setSemResultados(false)
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
      setSemResultados(res.items.length === 0)
      void carregarSaldosLista(res.items, seq)
    } catch {
      if (seq === seqBuscaRef.current && montadoRef.current) {
        setResultados([])
        setSemResultados(true)
        setErro('Não foi possível buscar produtos; tente novamente.')
      }
    } finally {
      if (seq === seqBuscaRef.current && montadoRef.current) setCarregando(false)
    }
  }

  const aoDigitar = (texto: string) => {
    setTermo(texto)
    if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
    timerBuscaRef.current = window.setTimeout(() => buscar(texto), 300)
  }

  // ---- Câmera (BarcodeDetector nativo; degrada com aviso quando indisponível) ----
  const pararCamera = () => {
    lerCancRef.current = true
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraAtiva(false)
  }

  const abrirCamera = async () => {
    setAvisoCamera(null)
    const Detector = (window as any).BarcodeDetector
    if (!Detector) {
      setAvisoCamera('Navegador sem leitura por câmera; digite o código')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      lerCancRef.current = false
      setCameraAtiva(true)
      // Deixa o <video> montar antes de ligar o stream
      setTimeout(() => {
        if (lerCancRef.current || !montadoRef.current) return
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        void video.play().catch(() => undefined)
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'] })
        const loop = async () => {
          if (lerCancRef.current || !montadoRef.current || !video.videoWidth) return
          try {
            const codigos = await detector.detect(video)
            if (codigos.length > 0) {
              const ean = String(codigos[0]?.rawValue || '').trim()
              pararCamera()
              if (ean) {
                setTermo(ean)
                void buscar(ean)
                // Abre direto o detalhe se houver um só resultado
                setTimeout(() => {
                  if (montadoRef.current && resultadosRef.current.length === 1) {
                    setDetalhe(resultadosRef.current[0])
                  }
                }, 900)
              }
              return
            }
          } catch {
            /* frame inválido: segue o loop */
          }
          setTimeout(loop, 250)
        }
        void loop()
      }, 50)
    } catch {
      setCameraAtiva(false)
      setAvisoCamera('Acesso à câmera negado ou indisponível; digite o código do produto.')
    }
  }

  // ---- Detalhe: saldo por empresa acessível ----
  const abrirDetalhe = (p: Produto) => {
    setDetalhe(p)
    setSaldosDetalhe({})
    if (!empresaAtiva) return
    seqDetalheRef.current += 1
    const seq = seqDetalheRef.current
    void Promise.all(
      empresasAcessiveis.map(async (emp) => {
        try {
          return [emp.id, await obterSaldoAtual(emp.id, p.id)] as const
        } catch {
          return [emp.id, null] as const
        }
      }),
    ).then((pares) => {
      if (seq !== seqDetalheRef.current || !montadoRef.current) return
      setSaldosDetalhe(Object.fromEntries(pares))
    })
  }

  const nomeEmpresaAtiva = useMemo(
    () => textoSeguro(empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social, ''),
    [empresaAtiva],
  )

  // Linhas do detalhe (uma por empresa acessível), já resolvidas com useMemo.
  const linhasSaldoDetalhe = useMemo(
    () =>
      empresasAcessiveis.map((emp) => {
        const estado = saldosDetalhe[emp.id]
        let texto = ''
        let classe = 'text-slate-500'
        if (typeof estado === 'string') {
          texto = estado === 'erro' ? 'Saldo indisponível' : ''
        } else if (estado === null) {
          texto = 'Sem estoque'
        } else if (estado) {
          const qtd = numeroSeguro(estado.quantidade)
          texto = qtd === null ? 'Saldo indisponível' : rotuloSaldo(qtd)
          if (qtd !== null) classe = corSaldo(qtd)
        }
        return {
          id: emp.id,
          nome: textoSeguro(emp.nome_fantasia || emp.razao_social, 'Empresa'),
          carregando: estado === undefined,
          texto,
          classe,
        }
      }),
    [empresasAcessiveis, saldosDetalhe],
  )

  // Cartões da lista (view model): formatação segura feita UMA vez, com useMemo.
  const cartoes = useMemo(
    () =>
      resultados.map((p) => {
        const estado = saldos[p.id]
        let saldoTexto = 'Consultando saldo…'
        let saldoClasse = 'text-slate-500'
        if (typeof estado === 'string') {
          saldoTexto = estado === 'erro' ? 'Saldo indisponível' : 'Consultando saldo…'
        } else if (estado === null) {
          saldoTexto = 'Sem estoque'
        } else if (estado) {
          const qtd = numeroSeguro(estado.quantidade)
          if (qtd === null) {
            saldoTexto = 'Saldo indisponível'
          } else {
            saldoTexto = `${rotuloSaldo(qtd)} · ${nomeEmpresaAtiva || 'loja'}`
            saldoClasse = corSaldo(qtd)
          }
        }
        const unidade = textoSeguro(p.expand?.unidade_id?.sigla, '')
        return {
          id: p.id,
          fotoUrl: urlFoto(p),
          descricao: textoSeguro(p.descricao, 'Produto sem descrição'),
          referencia: textoSeguro(p.referencia),
          gtin: textoSeguro(p.gtin),
          preco: formatarMoeda(p.preco_venda),
          unidade,
          saldoTexto,
          saldoClasse,
        }
      }),
    [resultados, saldos, nomeEmpresaAtiva],
  )

  if (!permitido) {
    return <AcessoNegado />
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Cabeçalho fino */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => (detalhe ? setDetalhe(null) : navigate('/movel'))}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {detalhe ? 'Produto' : 'Consultar produto'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {nomeEmpresaAtiva || 'Empresa'} · {textoSeguro(user?.name, 'Usuário')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 py-3">
        {detalhe ? (
          /* ---------- Detalhe do produto (com boundary próprio) ---------- */
          <ErrorBoundaryGlobal
            key={`detalhe-${versaoDetalhe}`}
            titulo="Não foi possível exibir este produto"
            aoTentarNovo={() => {
              setVersaoDetalhe((n) => n + 1)
              if (detalhe) abrirDetalhe(detalhe)
            }}
          >
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4 space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">{detalhe.descricao}</h2>
                  <p className="text-sm text-slate-500">
                    Ref.: {textoSeguro(detalhe.referencia)} · EAN: {textoSeguro(detalhe.gtin)}
                  </p>
                  <p className="pt-1 text-2xl font-bold text-slate-900">
                    {formatarMoeda(detalhe.preco_venda)}
                  </p>
                  {detalhe.expand?.unidade_id && (
                    <p className="text-xs text-slate-500">
                      Unidade: {textoSeguro(detalhe.expand.unidade_id.sigla)}
                    </p>
                  )}
                  {(detalhe.localizacao || detalhe.observacoes) && (
                    <div className="rounded-md bg-slate-100 p-2 text-xs text-slate-600">
                      {detalhe.localizacao && (
                        <p>Localização: {textoSeguro(detalhe.localizacao)}</p>
                      )}
                      {detalhe.observacoes && <p>Obs.: {textoSeguro(detalhe.observacoes)}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Saldo por empresa
                </p>
                {linhasSaldoDetalhe.map((linha) => (
                  <Card key={linha.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <span className="truncate text-sm text-slate-700">{linha.nome}</span>
                      {linha.carregando ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : linha.texto ? (
                        <span className={`text-sm font-semibold ${linha.classe}`}>
                          {linha.texto}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">Sem estoque</span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </ErrorBoundaryGlobal>
        ) : (
          /* ---------- Busca + lista (com boundary próprio) ---------- */
          <ErrorBoundaryGlobal
            key={`lista-${versaoLista}`}
            titulo="Não foi possível exibir os resultados"
            aoTentarNovo={() => {
              setVersaoLista((n) => n + 1)
              setSaldos({})
              setErro(null)
              void buscar(termo)
            }}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    ref={inputRef}
                    autoFocus
                    value={termo}
                    onChange={(e) => aoDigitar(e.target.value)}
                    placeholder="Nome, referência ou EAN"
                    className="h-12 pl-9 text-base"
                    inputMode="search"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 shrink-0 p-0"
                  onClick={abrirCamera}
                  aria-label="Ler código de barras"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>

              {avisoCamera && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {avisoCamera}
                </p>
              )}

              {cameraAtiva && (
                <Card>
                  <CardContent className="p-2">
                    <video
                      ref={videoRef}
                      className="w-full rounded-md bg-black"
                      playsInline
                      muted
                    />
                    <Button variant="ghost" className="mt-1 h-9 w-full" onClick={pararCamera}>
                      Fechar câmera
                    </Button>
                  </CardContent>
                </Card>
              )}

              {erro && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {erro}
                </p>
              )}

              {carregando && (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </p>
              )}

              {!carregando && semResultados && !erro && (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <PackageSearch className="h-4 w-4" /> Nenhum produto encontrado
                </p>
              )}

              <div className="space-y-2">
                {cartoes.map((c) => (
                  <Card
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-slate-100/60"
                    onClick={() => {
                      const p = resultados.find((x) => x.id === c.id)
                      if (p) abrirDetalhe(p)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const p = resultados.find((x) => x.id === c.id)
                        if (p) abrirDetalhe(p)
                      }
                    }}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      {c.fotoUrl ? (
                        <img
                          src={c.fotoUrl}
                          alt={c.descricao}
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-400">
                          <Barcode className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {c.descricao}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          Ref.: {c.referencia} · EAN: {c.gtin}
                        </p>
                        <p className="pt-0.5 text-lg font-bold text-slate-900">
                          {c.preco}
                          {c.unidade && (
                            <span className="text-xs font-normal text-slate-500">
                              {' '}
                              / {c.unidade}
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${c.saldoClasse}`}>{c.saldoTexto}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </ErrorBoundaryGlobal>
        )}
      </main>
    </div>
  )
}
