import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * FAIXA DE ERRO GLOBAL (diagnóstico no celular, sem console)
 *
 * Registra window.onerror e window.onunhandledrejection: se escapar um erro
 * NÃO tratado por nenhum ErrorBoundary (promises, callbacks fora do React),
 * mostra uma faixa fixa vermelha no rodapé com a mensagem curta do erro e o
 * botão "Recarregar". Sem dados sensíveis — só o texto do erro, truncado.
 */
export default function FaixaErroGlobal() {
  const [mensagem, setMensagem] = useState<string | null>(null)

  useEffect(() => {
    const resumir = (erro: unknown): string => {
      const texto =
        erro instanceof Error
          ? erro.message
          : typeof erro === 'string'
            ? erro
            : erro && typeof erro === 'object' && 'message' in (erro as any)
              ? String((erro as any).message)
              : String(erro ?? 'Erro desconhecido')
      const limpo = texto.replace(/\s+/g, ' ').trim()
      return limpo.length > 140 ? `${limpo.slice(0, 140)}…` : limpo || 'Erro desconhecido'
    }

    const aoErro = (evento: ErrorEvent) => {
      setMensagem(resumir(evento.error ?? evento.message))
    }
    const aoRejeicao = (evento: PromiseRejectionEvent) => {
      setMensagem(resumir(evento.reason))
    }

    window.addEventListener('error', aoErro)
    window.addEventListener('unhandledrejection', aoRejeicao)
    return () => {
      window.removeEventListener('error', aoErro)
      window.removeEventListener('unhandledrejection', aoRejeicao)
    }
  }, [])

  if (!mensagem) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-red-300 bg-red-600 px-3 py-2 text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 break-words text-xs">
          <span className="font-semibold">Erro: </span>
          {mensagem}
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0 bg-white text-red-700 hover:bg-red-50"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 px-2 text-white hover:bg-red-500"
          aria-label="Fechar aviso"
          onClick={() => setMensagem(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
