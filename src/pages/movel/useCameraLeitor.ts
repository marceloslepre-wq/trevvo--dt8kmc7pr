import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * LEITOR DE CÓDIGO DE BARRAS POR CÂMERA (Trevvo Móvel)
 *
 * Correção v0.0.368+: no Android a câmera abria mas "nunca lia" — o loop de
 * detecção terminava no primeiro quadro (videoWidth === 0 antes do vídeo
 * tocar) e nunca voltava. Agora:
 *
 * 1) Loop contínuo: um quadro a cada ~150 ms, mas SÓ depois de o vídeo estar
 *    tocando de fato (readyState >= 2 e videoWidth > 0).
 * 2) Motor: BarcodeDetector só se BarcodeDetector.getSupportedFormats()
 *    incluir "ean_13"; criado com formats ["ean_13","ean_8","upc_a","upc_e",
 *    "code_128"]. Sem suporte OU 3 s sem detectar nada → troca automática
 *    para a ZXing (@zxing/browser 0.1.5 via CDN, import dinâmico de script
 *    fixo — o package.json é protegido e não é tocado). No iPhone (sem
 *    BarcodeDetector) vai direto para a ZXing.
 * 3) Câmera: facingMode "environment", ideal 1280×720; se o track suportar,
 *    aplica focusMode "continuous". <video> com playsInline, muted, autoPlay.
 * 4) Debounce: mesmo código em menos de 2 s é ignorado; dígito verificador de
 *    EAN-13/EAN-8 é validado antes de entregar o código (leitura inválida é
 *    descartada e a leitura continua).
 * 5) Ao ler: navigator.vibrate(100) se existir, para tracks e loop, e entrega
 *    o código. Tracks e loop SEMPRE encerrados ao fechar, sair da tela ou
 *    desmontar.
 * 6) Mensagens em pt-BR; o usuário sempre pode digitar o código manualmente.
 */

const CDN_ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'
const INTERVALO_LOOP_MS = 150
const TEMPO_TROCA_ZXING_MS = 3000
const DEBOUNCE_LEITURA_MS = 2000

export type TipoLeitor = 'nativo' | 'zxing' | null

interface zxingBrowserNS {
  BrowserMultiFormatReader: new (hints?: Record<string, unknown>) => {
    decodeFromVideoDevice: (
      deviceId: string | undefined,
      video: HTMLVideoElement,
      cb: (result: { getText: () => string } | undefined, err: unknown) => void,
    ) => Promise<{ stop: () => void }>
    decodeFromVideoElement?: (
      video: HTMLVideoElement,
      cb: (result: { getText: () => string } | undefined, err: unknown) => void,
    ) => Promise<{ stop: () => void }>
  }
}

declare global {
  interface Window {
    ZXingBrowser?: zxingBrowserNS
  }
}

// (window as any).BarcodeDetector no Android; window.ZXingBrowser no iOS.
let carregandoZxing: Promise<zxingBrowserNS> | null = null

function carregarZxing(): Promise<zxingBrowserNS> {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser)
  if (carregandoZxing) return carregandoZxing
  carregandoZxing = new Promise((resolver, rejeitar) => {
    const script = document.createElement('script')
    script.src = CDN_ZXING
    script.onload = () => {
      if (window.ZXingBrowser) resolver(window.ZXingBrowser)
      else rejeitar(new Error('ZXing não disponível após carregar o script'))
    }
    script.onerror = () => rejeitar(new Error('Falha ao baixar o leitor ZXing (sem internet?)'))
    document.head.appendChild(script)
  })
  return carregandoZxing
}

/** Detecta se a câmera vai usar o detector nativo ou o fallback ZXing. */
export function tipoDeLeitor(): TipoLeitor {
  if (typeof window === 'undefined') return null
  if ('BarcodeDetector' in window) return 'nativo'
  return 'zxing'
}

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const

/** Dígito verificador de EAN-13 (13 dígitos) e EAN-8 (8 dígitos). */
export function eanValido(codigo: string): boolean {
  if (/^\d{13}$/.test(codigo)) {
    const d = codigo.split('').map(Number)
    const soma =
      d[0] + d[2] + d[4] + d[6] + d[8] + d[10] + 3 * (d[1] + d[3] + d[5] + d[7] + d[9] + d[11])
    return (10 - (soma % 10)) % 10 === d[12]
  }
  if (/^\d{8}$/.test(codigo)) {
    const d = codigo.split('').map(Number)
    const soma = d[0] + d[2] + d[4] + d[6] + 3 * (d[1] + d[3] + d[5])
    return (10 - (soma % 10)) % 10 === d[7]
  }
  return false // EAN-13/EAN-8 apenas; outros formatos não passam por esta validação
}

/** BarcodeDetector só conta se realmente detectar EAN-13. */
async function nativoSuportaEan13(): Promise<boolean> {
  const Detector = (window as any).BarcodeDetector
  if (!Detector?.getSupportedFormats) return false
  try {
    const formatos: string[] = await Detector.getSupportedFormats()
    return Array.isArray(formatos) && formatos.includes('ean_13')
  } catch {
    return false
  }
}

/** Cria o detector nativo já com os formatos pedidos (ou null se falhar). */
async function criarDetectorNativo(): Promise<any | null> {
  if (!(await nativoSuportaEan13())) return null
  try {
    const Detector = (window as any).BarcodeDetector
    return new Detector({ formats: [...FORMATOS_NATIVOS] })
  } catch {
    return null
  }
}

/** Tenta focusMode "continuous" no track (nem todo aparelho suporta). */
function aplicarFocoContinuo(stream: MediaStream) {
  stream.getVideoTracks().forEach((track) => {
    const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>
    const modos = (caps.focusMode as string[] | undefined) ?? []
    if (modos.includes('continuous')) {
      void track
        .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        .catch(() => undefined)
    }
  })
}

export function useCameraLeitor({ aoLer }: { aoLer: (codigo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canceladoRef = useRef(false)
  const controlsZxingRef = useRef<{ stop: () => void } | null>(null)
  const loopIdRef = useRef<number | null>(null)
  const timerTrocaRef = useRef<number | null>(null)
  const ultimaLeituraRef = useRef<{ codigo: string; quando: number }>({ codigo: '', quando: 0 })
  const entregouRef = useRef(false)
  const aoLerRef = useRef(aoLer)
  aoLerRef.current = aoLer

  const [ativa, setAtiva] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)

  // Desliga a câmera: para o loop, encerra o stream, para o decoder ZXing e limpa o <video>.
  const parar = useCallback(() => {
    canceladoRef.current = true
    if (loopIdRef.current !== null) {
      window.clearTimeout(loopIdRef.current)
      loopIdRef.current = null
    }
    if (timerTrocaRef.current !== null) {
      window.clearTimeout(timerTrocaRef.current)
      timerTrocaRef.current = null
    }
    try {
      controlsZxingRef.current?.stop()
    } catch {
      /* já parado */
    }
    controlsZxingRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setAtiva(false)
    setIniciando(false)
  }, [])

  /** Entrega o código (com debounce e vibração) e encerra a câmera. */
  const entregarCodigo = useCallback(
    (codigo: string) => {
      const agora = Date.now()
      const { codigo: anterior, quando } = ultimaLeituraRef.current
      if (anterior === codigo && agora - quando < DEBOUNCE_LEITURA_MS) return // debounce
      ultimaLeituraRef.current = { codigo, quando: agora }
      if (entregouRef.current) return
      entregouRef.current = true
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100)
        } catch {
          /* sem vibração */
        }
      }
      parar()
      aoLerRef.current(codigo)
    },
    [parar],
  )

  // Encerra a câmera ao desmontar o componente (troca de tela).
  useEffect(() => {
    return () => {
      canceladoRef.current = true
      if (loopIdRef.current !== null) window.clearTimeout(loopIdRef.current)
      if (timerTrocaRef.current !== null) window.clearTimeout(timerTrocaRef.current)
      try {
        controlsZxingRef.current?.stop()
      } catch {
        /* já parado */
      }
      controlsZxingRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // ---- ZXing (fallback e iOS/Safari) ---------------------------------------
  const usarZxing = useCallback(
    async (video: HTMLVideoElement, motivo: 'sem-nativo' | 'tempo-esgotado') => {
      if (canceladoRef.current) return
      try {
        const ZXingBrowser = await carregarZxing()
        if (canceladoRef.current) return
        const hints: Record<string, unknown> = {
          possibleFormats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128'],
          TRY_HARDER: true,
        }
        const reader = new ZXingBrowser.BrowserMultiFormatReader(hints)
        const aoReceber = (result: { getText: () => string } | undefined) => {
          if (!result) return
          const codigo = String(result.getText() || '').trim()
          if (!codigo) return
          // EAN com dígito inválido: descarta e segue tentando.
          if (/^\d{8}(\d{5})?$/.test(codigo) && !eanValido(codigo)) return
          entregarCodigo(codigo)
        }
        // decodeFromVideoElement reusa o stream já aberto; se não existir na
        // versão, cai para decodeFromVideoDevice (que abre outro stream).
        const controls = await (typeof reader.decodeFromVideoElement === 'function'
          ? reader.decodeFromVideoElement(video, aoReceber)
          : reader.decodeFromVideoDevice(undefined, video, aoReceber))
        if (canceladoRef.current) {
          try {
            controls.stop()
          } catch {
            /* já parado */
          }
          return
        }
        controlsZxingRef.current = controls
        if (motivo === 'tempo-esgotado') {
          setAviso('Leitura nativa lenta; usando leitor alternativo.')
          window.setTimeout(() => {
            if (!canceladoRef.current) setAviso(null)
          }, 4000)
        }
      } catch (e) {
        console.error('Falha no leitor ZXing:', e)
        parar()
        setAviso(
          e instanceof Error && /internet/i.test(e.message)
            ? 'Não foi possível baixar o leitor de código. Verifique a internet ou digite o código.'
            : 'Não foi possível iniciar a leitura por câmera; digite o código do produto.',
        )
      }
    },
    [entregarCodigo, parar],
  )

  const iniciar = useCallback(async () => {
    setAviso(null)
    setIniciando(true)
    entregouRef.current = false
    ultimaLeituraRef.current = { codigo: '', quando: 0 }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAviso('Este navegador não suporta acesso à câmera; digite o código do produto.')
        setIniciando(false)
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      aplicarFocoContinuo(stream)
      canceladoRef.current = false
      entregouRef.current = false
      setAtiva(true)
      setIniciando(false)

      // O <video> monta no próximo render depois de setAtiva(true); aguarda ele.
      const video = await new Promise<HTMLVideoElement | null>((resolve) => {
        const tentar = (tentativas: number) => {
          if (canceladoRef.current) return resolve(null)
          if (videoRef.current) return resolve(videoRef.current)
          if (tentativas <= 0) return resolve(null)
          window.setTimeout(() => tentar(tentativas - 1), 50)
        }
        tentar(20)
      })
      if (!video || canceladoRef.current) {
        parar()
        return
      }

      // Exigências do iOS para reproduzir vídeo de câmera.
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      video.setAttribute('muted', 'true')
      video.muted = true
      video.autoplay = true
      await video.play().catch(() => undefined)

      // Aguarda o vídeo ESTAR TOCANDO (readyState >= 2 e videoWidth > 0) antes
      // de qualquer detecção — era aqui que o loop antigo morria.
      const pronto = await new Promise<boolean>((resolve) => {
        const conferir = (tentativas: number) => {
          if (canceladoRef.current) return resolve(false)
          if (video.readyState >= 2 && video.videoWidth > 0) return resolve(true)
          if (tentativas <= 0) return resolve(false)
          window.setTimeout(() => conferir(tentativas - 1), 50)
        }
        conferir(100) // até ~5 s
      })
      if (!pronto || canceladoRef.current) {
        parar()
        if (!canceladoRef.current) {
          setAviso('A imagem da câmera não carregou; digite o código do produto.')
        }
        return
      }

      // ---- Motor nativo (Android/Chrome), com troca automática p/ ZXing ----
      const detector = await criarDetectorNativo()
      if (canceladoRef.current) return

      if (detector) {
        const loop = () => {
          if (canceladoRef.current) return
          // Se o vídeo parou (ex.: aba em segundo plano), espera tocar de novo.
          if (video.readyState < 2 || video.videoWidth === 0) {
            loopIdRef.current = window.setTimeout(loop, INTERVALO_LOOP_MS)
            return
          }
          void detector
            .detect(video)
            .then((codigos: Array<{ rawValue?: string }>) => {
              if (canceladoRef.current) return
              const bruto = String(codigos?.[0]?.rawValue || '').trim()
              if (bruto && /^\d{8}(\d{5})?$/.test(bruto) && !eanValido(bruto)) {
                // Dígito verificador inválido: descarta e CONTINUA tentando.
                loopIdRef.current = window.setTimeout(loop, INTERVALO_LOOP_MS)
                return
              }
              if (bruto) {
                entregarCodigo(bruto)
                return
              }
              loopIdRef.current = window.setTimeout(loop, INTERVALO_LOOP_MS)
            })
            .catch(() => {
              if (canceladoRef.current) return
              loopIdRef.current = window.setTimeout(loop, INTERVALO_LOOP_MS)
            })
        }
        loop()
        // 3 s sem nada → troca para a ZXing e para o loop nativo.
        timerTrocaRef.current = window.setTimeout(() => {
          if (canceladoRef.current) return
          if (loopIdRef.current !== null) {
            window.clearTimeout(loopIdRef.current)
            loopIdRef.current = null
          }
          void usarZxing(video, 'tempo-esgotado')
        }, TEMPO_TROCA_ZXING_MS)
        return
      }

      // Sem detector nativo (iOS/Safari) → ZXing direto.
      await usarZxing(video, 'sem-nativo')
    } catch (e) {
      console.error('Erro ao abrir a câmera:', e)
      parar()
      const nome = e instanceof DOMException ? e.name : ''
      if (nome === 'NotAllowedError' || nome === 'SecurityError') {
        setAviso(
          'Permissão de câmera negada. Libere o acesso nas configurações do navegador ou digite o código.',
        )
      } else if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
        setAviso('Câmera indisponível neste aparelho; digite o código do produto.')
      } else {
        setAviso('Não foi possível acessar a câmera; digite o código do produto.')
      }
    }
  }, [parar, usarZxing])

  return { videoRef, ativa, iniciando, aviso, iniciar, parar, tipo: tipoDeLeitor() }
}
