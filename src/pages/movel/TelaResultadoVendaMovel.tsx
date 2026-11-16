import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Clock, FileX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ResultadoConclusao } from './concluirVendaMovel'

type Props = {
  resultado: ResultadoConclusao
  aoNovaVenda: () => void
  /** Classes extras do container raiz (o MovelVendaPage posiciona em tela cheia). */
  className?: string
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function BadgeStatus({ status }: { status: ResultadoConclusao['statusNfce'] }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium'
  switch (status) {
    case 'Autorizada':
      return (
        <span className={cn(base, 'bg-emerald-50 text-emerald-700')}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Autorizada
        </span>
      )
    case 'Rejeitada':
      return (
        <span className={cn(base, 'bg-red-50 text-red-700')}>
          <XCircle className="h-3.5 w-3.5" /> Rejeitada
        </span>
      )
    case 'Processando':
      return (
        <span className={cn(base, 'bg-amber-50 text-amber-700')}>
          <Clock className="h-3.5 w-3.5" /> Processando
        </span>
      )
    default:
      return (
        <span className={cn(base, 'bg-muted text-muted-foreground')}>
          <FileX className="h-3.5 w-3.5" /> Não emitida
        </span>
      )
  }
}

export default function TelaResultadoVendaMovel({ resultado, aoNovaVenda, className }: Props) {
  return (
    <div className={cn('flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white', className)}>
      {/* Conteúdo com rolagem própria (nada fora da tela em 360px) */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto overscroll-contain p-6 text-center">
        {resultado.statusNfce === 'Autorizada' ? (
          <CheckCircle2 className="h-16 w-16 text-emerald-600" />
        ) : resultado.statusNfce === 'Rejeitada' ? (
          <XCircle className="h-16 w-16 text-red-600" />
        ) : resultado.statusNfce === 'Processando' ? (
          <Clock className="h-16 w-16 text-amber-500" />
        ) : (
          <FileX className="h-16 w-16 text-muted-foreground" />
        )}

        <div>
          <h2 className="text-xl font-semibold">Venda nº {resultado.numeroVenda} concluída</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Total {formatarMoeda(resultado.valorTotal)}
            {resultado.troco > 0 ? ` · Troco ${formatarMoeda(resultado.troco)}` : ''}
          </p>
        </div>

        <div className="space-y-1">
          <BadgeStatus status={resultado.statusNfce} />
          {resultado.mensagemNfce && (
            <p
              className={cn(
                'mx-auto max-w-[280px] text-xs',
                resultado.statusNfce === 'Rejeitada' ? 'text-red-600' : 'text-muted-foreground',
              )}
            >
              {resultado.mensagemNfce}
            </p>
          )}
        </div>
      </div>

      {/* Rodapé fixo com o botão principal */}
      <div className="shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="h-12 w-full text-base font-semibold" onClick={aoNovaVenda}>
          Nova venda
        </Button>
      </div>
    </div>
  )
}
