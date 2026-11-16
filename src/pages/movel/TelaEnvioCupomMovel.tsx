import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import EnviarDocumentoFiscal, {
  type DadosEnviarDocumentoFiscal,
} from '@/components/fiscal/EnviarDocumentoFiscal'

type Props = DadosEnviarDocumentoFiscal & {
  /** Fecha a tela do cupom (Esc / botão X / "Nova venda" do rodapé). */
  aoFechar: () => void
  /** Classes extras do container raiz (o MovelVendaPage posiciona em tela cheia). */
  className?: string
}

/**
 * Trevvo Móvel — cupom da NFC-e em TELA CHEIA, dentro da estrutura do MovelLayout
 * (cabeçalho fino, conteúdo rolável, rodapé fixo). Reaproveita o EnviarDocumentoFiscal
 * do PDV em modo empilhado (botões largura total, ≥48px, sem rolagem horizontal).
 */
export default function TelaEnvioCupomMovel({ aoFechar, className, ...dados }: Props) {
  return (
    <div className={cn('flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white', className)}>
      {/* Cabeçalho fino (≤56px) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">Cupom da venda</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            NFC-e nº {dados.numero} · {dados.nomeLoja}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0 text-slate-500 hover:text-slate-800"
          onClick={aoFechar}
          aria-label="Fechar cupom"
        >
          <X className="h-6 w-6" />
        </Button>
      </header>

      {/* Conteúdo rolável */}
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <EnviarDocumentoFiscal {...dados} empilhado />
      </div>

      {/* Rodapé fixo com o botão principal */}
      <div className="shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="h-12 w-full text-base font-semibold" onClick={aoFechar}>
          Nova venda
        </Button>
      </div>
    </div>
  )
}
