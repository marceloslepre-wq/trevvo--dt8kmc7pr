import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Barcode, Camera, Loader2, PackageSearch, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AcessoNegado } from '@/components/AcessoNegado'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva, useEmpresasAcessiveis } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { listarProdutos, type Produto } from '@/services/produtos'
import { obterSaldoAtual, type EstoqueSaldo } from '@/services/estoque'
import pb from '@/lib/pocketbase/client'

type EstadoSaldo = 'carregando' | 'sem' | 'ok' | 'erro'

const urlFoto = (p: Produto): string | null => {
  if (!p.foto) return null
  try {
    return pb.files.getURL(p, p.foto, { thumb: '200x200' })
  } catch {
    return null
  }
}

const formatarMoeda = (v: number | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const corSaldo = (qtd: number) =>
  qtd < 0 ? 'text-red-600' : qtd === 0 ? 'text-slate-500' : 'text-emerald-700'

const rotuloSaldo = (qtd: number) =>
  qtd === 0
    ? 'Sem estoque'
    : `${qtd.toLocaleString('pt-BR')} ${qtd < 0 ? '(negativo)' : 'disponível'}`

/** Consulta rápida de produtos pelo celular (Trevvo Móvel, parte 1). */
export default function MovelConsultaPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()
  const { assinanteId } = useEmpresaAtiva()
  const { empresasAcessiveis } = useEmpresasAcessiveis()

  const inputRef = useRef<HTMLInputElement>(null)
  const timerBuscaRef = useRef<number | null>(null)
  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [semResultados, setSemResultados] = useState(false)
  const [resultados, setResultados] = useState<Produto[]>([])
  const [saldos, setSaldos] = useState<Record<string, EstadoSaldo | EstoqueSaldo>>({})
  const [detalhe, setDetalhe] = useState<Produto | null>(null)
  const [saldosDetalhe, setSaldosDetalhe] = useState<Record<string, EstoqueSaldo | null>>({})
  const [avisoCamera, setAvisoCamera] = useState<string | null>(null)
  const seqBuscaRef = useRef(0)

  // Permissão: módulo produtos / ver (mesma regra do GuardaRota para /movel/*).
  // Renderizado DEPOIS de todos os hooks para respeitar a ordem deles.
  const permitido = pode('produtos', 'ver')

  // Encerra a câmera ao desmontar (troca de tela)
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
    }
  }, [])

  // Saldos da lista atual (empresa ativa) — consultas em paralelo, uma por produto
  const carregarSaldosLista = async (produtos: Produto[]) => {
    if (!empresaAtiva) {
      setSaldos({})
      return
    }
    setSaldos(Object.fromEntries(produtos.map((p) => [p.id, 'carregando' as EstadoSaldo])))
    const resp = await Promise.all(
      produtos.map(async (p) => {
        try {
          const s = await obterSaldoAtual(empresaAtiva.id, p.id)
          return [p.id, (s ? 'ok' : 'sem') as EstadoSaldo | EstoqueSaldo] as const
        } catch {
          return [p.id, 'erro' as EstadoSaldo] as const
        }
      }),
    )
    setSaldos(Object.fromEntries(resp))
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
    seqBuscaRef.current += 1
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
      if (seq !== seqBuscaRef.current) return // resposta obsoleta
      setResultados(res.items)
      setSemResultados(res.items.length === 0)
      await carregarSaldosLista(res.items)
    } catch (e) {
      if (seq === seqBuscaRef.current) {
        setResultados([])
        setSemResultados(true)
        setErro('Não foi possível buscar produtos; tente novamente.')
      }
    } finally {
      if (seq === seqBuscaRef.current) setCarregando(false)
    }
  }

  const aoDigitar = (texto: string) => {
    setTermo(texto)
    if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
    timerBuscaRef.current = window.setTimeout(() => buscar(texto), 300)
  }

  // ---- Câmera (BarcodeDetector nativo; degrada com aviso quando indisponível) ----
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraAtiva, setCameraAtiva] = useState(false)
  const lerCancRef = useRef(false)

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
      setTimeout(async () => {
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => undefined)
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'] })
        const loop = async () => {
          if (lerCancRef.current || !video.videoWidth) return
          try {
            const codigos = await detector.detect(video)
            if (codigos.length > 0) {
              const ean = String(codigos[0].rawValue || '').trim()
              pararCamera()
              if (ean) {
                setTermo(ean)
                buscar(ean)
                // Abre direto o detalhe se houver um só resultado
                setTimeout(() => {
                  setResultados((atuais) => {
                    if (atuais.length === 1) setDetalhe(atuais[0])
                    return atuais
                  })
                }, 900)
              }
              return
            }
          } catch {
            /* frame inválido: segue o loop */
          }
          setTimeout(loop, 250)
        }
        loop()
      }, 50)
    } catch (e) {
      setCameraAtiva(false)
      setAvisoCamera('Acesso à câmera negado ou indisponível; digite o código do produto.')
    }
  }

  // ---- Detalhe: saldo por empresa acessível ----
  const abrirDetalhe = (p: Produto) => {
    setDetalhe(p)
    setSaldosDetalhe({})
    if (!empresaAtiva) return
    Promise.all(
      empresasAcessiveis.map(async (emp) => {
        try {
          return [emp.id, await obterSaldoAtual(emp.id, p.id)] as const
        } catch {
          return [emp.id, null] as const
        }
      }),
    ).then((pares) => setSaldosDetalhe(Object.fromEntries(pares)))
  }

  const nomeEmpresa = (id: string) =>
    empresasAcessiveis.find((e) => e.id === id)?.nome_fantasia ||
    empresasAcessiveis.find((e) => e.id === id)?.razao_social ||
    ''

  const nomeEmpresaAtiva = useMemo(
    () => empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || '',
    [empresaAtiva],
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
              {nomeEmpresaAtiva || 'Empresa'} · {user?.name || 'Usuário'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 py-3">
        {detalhe ? (
          /* ---------- Detalhe do produto ---------- */
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4 space-y-1">
                <h2 className="text-base font-semibold text-slate-900">{detalhe.descricao}</h2>
                <p className="text-sm text-slate-500">
                  Ref.: {detalhe.referencia || '—'} · EAN: {detalhe.gtin || '—'}
                </p>
                <p className="pt-1 text-2xl font-bold text-slate-900">
                  {formatarMoeda(detalhe.preco_venda)}
                </p>
                {detalhe.expand?.unidade_id && (
                  <p className="text-xs text-slate-500">
                    Unidade: {detalhe.expand.unidade_id.sigla}
                  </p>
                )}
                {(detalhe.localizacao || detalhe.observacoes) && (
                  <div className="rounded-md bg-slate-100 p-2 text-xs text-slate-600">
                    {detalhe.localizacao && <p>Localização: {detalhe.localizacao}</p>}
                    {detalhe.observacoes && <p>Obs.: {detalhe.observacoes}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Saldo por empresa
              </p>
              {empresasAcessiveis.map((emp) => {
                const s = saldosDetalhe[emp.id]
                return (
                  <Card key={emp.id}>
                    <CardContent className="flex items-center justify-between p-3">
                      <span className="truncate text-sm text-slate-700">
                        {nomeEmpresa(emp.id) || 'Empresa'}
                      </span>
                      {s === undefined ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : s === null ? (
                        <span className="text-sm text-slate-500">Sem estoque</span>
                      ) : (
                        <span className={`text-sm font-semibold ${corSaldo(s.quantidade)}`}>
                          {rotuloSaldo(s.quantidade)}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ) : (
          /* ---------- Busca + lista ---------- */
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
                  <video ref={videoRef} className="w-full rounded-md bg-black" playsInline muted />
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
              {resultados.map((p) => {
                const fotoUrl = urlFoto(p)
                const estado = saldos[p.id]
                const qtd =
                  estado && estado !== 'carregando' && estado !== 'erro' && estado !== 'sem'
                    ? (estado as EstoqueSaldo).quantidade
                    : null
                return (
                  <Card
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-slate-100/60"
                    onClick={() => abrirDetalhe(p)}
                    onKeyDown={(e) => e.key === 'Enter' && abrirDetalhe(p)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      {fotoUrl ? (
                        <img
                          src={fotoUrl}
                          alt={p.descricao}
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-400">
                          <Barcode className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {p.descricao}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          Ref.: {p.referencia || '—'} · EAN: {p.gtin || '—'}
                        </p>
                        <p className="pt-0.5 text-lg font-bold text-slate-900">
                          {formatarMoeda(p.preco_venda)}
                          {p.expand?.unidade_id && (
                            <span className="text-xs font-normal text-slate-500">
                              {' '}
                              / {p.expand.unidade_id.sigla}
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${qtd === null ? 'text-slate-500' : corSaldo(qtd)}`}>
                          {qtd === null
                            ? 'Consultando saldo…'
                            : `${rotuloSaldo(qtd)} · ${nomeEmpresaAtiva || 'loja'}`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
