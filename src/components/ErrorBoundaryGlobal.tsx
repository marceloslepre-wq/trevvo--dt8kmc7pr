import React from 'react'
import { Button } from '@/components/ui/button'

interface EstadoErro {
  temErro: boolean
  mensagem: string
}

/**
 * ERROR BOUNDARY GLOBAL
 *
 * Envolve todas as rotas em App.tsx: se QUALQUER tela quebrar em runtime
 * (ex.: tradutor automático do Chrome alterando o DOM e derrubando o React
 * com "Failed to execute 'removeChild'/'insertBefore' on 'Node'"), mostra uma
 * mensagem amigável em pt-BR com "Recarregar" e "Ir para o início" — nunca a
 * tela branca. O erro completo vai para o console (console.error).
 */
export default class ErrorBoundaryGlobal extends React.Component<
  { children: React.ReactNode },
  EstadoErro
> {
  state: EstadoErro = { temErro: false, mensagem: '' }

  static getDerivedStateFromError(erro: unknown): EstadoErro {
    const mensagem =
      erro instanceof Error && erro.message ? erro.message : String(erro ?? 'Erro desconhecido')
    return { temErro: true, mensagem }
  }

  componentDidCatch(erro: unknown, info: React.ErrorInfo) {
    console.error('Erro capturado pelo ErrorBoundary global:', erro, info?.componentStack)
  }

  private recarregar = () => {
    window.location.reload()
  }

  private irParaInicio = () => {
    this.setState({ temErro: false, mensagem: '' })
    window.location.href = '/'
  }

  render() {
    if (!this.state.temErro) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-full max-w-md space-y-4">
          <p className="text-lg font-semibold text-slate-900">
            Algo deu errado ao carregar esta tela
          </p>
          <p className="break-words rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-500">
            {this.state.mensagem.slice(0, 300)}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button className="h-11 px-6" onClick={this.recarregar}>
              Recarregar
            </Button>
            <Button variant="outline" className="h-11 px-6" onClick={this.irParaInicio}>
              Ir para o início
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
