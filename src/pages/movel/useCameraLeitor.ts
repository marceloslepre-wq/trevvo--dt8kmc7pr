import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * LEITOR DE CÓDIGO DE BARRAS POR CÂMERA (Trevvo Móvel)
 *
 * - Android/Chrome: usa o BarcodeDetector nativo quando existir.
 * - iPhone/Safari (sem BarcodeDetector): carrega a ZXing (@zxing/browser 0.1.5)
 *   sob demanda, por import dinâmico de CDN (jsdelivr, versão fixa) — só ao
 *   tocar no botão da câmera. O package.json é protegido e não é tocado.
 * - <video> com playsInline, muted e autoPlay (exigência do iOS), câmera
 *   traseira (facingMode "environment") e stream SEMPRE encerrado ao fechar
 *   (pararCamera / desmontagem).
 * - Formatos: EAN-13, EAN-8, UPC-A e Code 128.
 * - Mensagens em pt-BR para permissão negada / câmera indisponível; o usuário
 *   sempre pode digitar o código manualmente.
 */

const CDN_ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'

export type TipoLeitor = 'nativo' | 'zxing' | null

interface zxingBrowserNS {
  BrowserMultiFormatReader: new (hints?: Record<string, unknown>) => {
    decodeFromVideoDevice: (
      deviceId: string | undefined,
      video: HTMLVideoElement,
      cb: (result: { getText: () => string } | undefined, err: unknown) => void,
    ) => Promise<{ stop: () => void }>
  }
  BarcodeFormats?: Record<string, string>
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

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'code_128'] as const

async function detectarUmaVezNativo(video: HTMLVideoElement): Promise<string | null> {
  const Detector = (window as any).BarcodeDetector
  if (!Detector) return null
  const detector = new Detector({ formats: [...FORMATOS_NATIVOS] })
  const codigos = await detector.detect(video)
  return codigos.length > 0 ? String(codigos[0].rawValue || '').trim() || null : null
}

export function useCameraLeitor({ aoLer }: { aoLer: (codigo: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canceladoRef = useRef(false)
  const controlsZxingRef = useRef<{ stop: () => void } | null>(null)
  const aoLerRef = useRef(aoLer)
  aoLerRef.current = aoLer

  const [ativa, setAtiva] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)

  // Desliga a câmera: encerra o stream, para o decoder ZXing e limpa o <video>.
  const parar = useCallback(() => {
    canceladoRef.current = true
    try {
      controlsZxingRef.current?.stop()
    } catch {
      /* já parado */
    }
    controlsZxingRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setAtiva(false)
    setIniciando(false)
  }, [])

  // Encerra a câmera ao desmontar o componente (troca de tela).
  useEffect(() => {
    return () => {
      canceladoRef.current = true
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

  const iniciar = useCallback(async () => {
    setAviso(null)
    setIniciando(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAviso('Este navegador não suporta acesso à câmera; digite o código do produto.')
        setIniciando(false)
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      canceladoRef.current = false
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
      await video.play().catch(() => undefined)

      const tipo = tipoDeLeitor()

      if (tipo === 'nativo') {
        // Loop de detecção com BarcodeDetector (Android/Chrome).
        const loop = async () => {
          if (canceladoRef.current) return
          try {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              const codigo = await detectarUmaVezNativo(video)
              if (codigo) {
                parar()
                aoLerRef.current(codigo)
                return
              }
            }
          } catch {
            /* frame inválido: segue o loop */
          }
          window.setTimeout(loop, 250)
        }
        loop()
        return
      }

      // Fallback iOS/Safari: ZXing via CDN (import dinâmico de script fixo).
      try {
        const ZXingBrowser = await carregarZxing()
        if (canceladoRef.current) return
        const reader = new ZXingBrowser.BrowserMultiFormatReader({
          possibleFormats: ['EAN_13', 'EAN_8', 'UPC_A', 'CODE_128'],
        })
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result) {
            const codigo = String(result.getText() || '').trim()
            if (codigo) {
              parar()
              aoLerRef.current(codigo)
            }
          }
        })
        if (canceladoRef.current) {
          try {
            controls.stop()
          } catch {
            /* já parado */
          }
          return
        }
        controlsZxingRef.current = controls
      } catch (e) {
        console.error('Falha no leitor ZXing:', e)
        parar()
        setAviso(
          e instanceof Error && /internet/i.test(e.message)
            ? 'Não foi possível baixar o leitor de código. Verifique a internet ou digite o código.'
            : 'Não foi possível iniciar a leitura por câmera; digite o código do produto.',
        )
      }
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
  }, [parar])

  return { videoRef, ativa, iniciando, aviso, iniciar, parar, tipo: tipoDeLeitor() }
}
