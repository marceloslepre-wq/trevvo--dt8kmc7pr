import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const LIMITE_MS = 15000

/**
 * ESTADO DE CARREGAMENTO DAS GUARDAS
 *
 * Enquanto sessão/perfil/permissões/empresas carregam, mostra indicador de
 * carregamento. Se falhar (falhou) ou passar de 15 s, mostra
 * "Não foi possível carregar seus dados. Verifique a internet." com botão
 * "Tentar de novo" — nunca "Acesso negado" durante a carga.
 */
export default function CarregandoGuarda({
  onTentarNovamente,
  falhou,
}: {
  /** Recarrega os dados (chamado pelo botão "Tentar de novo"). */
  onTentarNovamente: () => void
  /** true quando a carga falhou (mostra o estado de erro imediatamente). */
  falhou?: boolean
}) {
  const [expirado, setExpirado] = useState(false)
  const erro = falhou || expirado

  // Timeout de 15 s: após isso, troca o spinner pela mensagem de erro com retry.
  useEffect(() => {
    if (falhou) return
    const timer = window.setTimeout(() => setExpirado(true), LIMITE_MS)
    return () => window.clearTimeout(timer)
  }, [falhou])

  if (!erro) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-700">Carregando...</p>
        <p className="text-xs text-slate-400">Aguarde um instante.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <RefreshCw className="h-6 w-6 text-amber-600" />
      <p className="font-medium text-slate-800">
        Não foi possível carregar seus dados. Verifique a internet.
      </p>
      <Button className="mt-2 h-11 px-6" onClick={onTentarNovamente}>
        Tentar de novo
      </Button>
    </div>
  )
}
