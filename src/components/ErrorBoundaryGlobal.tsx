import React from 'react'
import { Button } from '@/components/ui/button'

interface EstadoErro {
  temErro: boolean
  mensagem: string
}

interface PropsErroGlobal {
  children: React.ReactNode
  /** Título opcional (pt-BR) para boundaries locais (ex.: lista/detalhe do Móvel). */
  titulo?: string
  /** Ação extra ao "Tentar de novo" (ex.: refazer a busca). O reset é local. */
  aoTentarNovo?: () => void
}

/**
 * ERROR BOUNDARY GLOBAL (e reutilizável como boundary local)
 *
 * Montado em App.tsx envolvendo TODAS as rotas (inclui Layout e as páginas
 * /movel/*); também usado dentro de MovelConsultaPage em volta da lista de
 * resultados e do detalhe. Se QUALQUER tela quebrar em runtime, mostra uma
 * mensagem amigável em pt-BR com o erro resumido e os botões "Tentar de
 * novo"/"Recarregar" — nunca a tela branca. O erro completo vai ao console.
 */
export default class ErrorBoundaryGlobal extends React.Component<PropsErroGlobal, EstadoErro> {
  state: EstadoErro = { temErro: false, mensagem: '' }

  static getDerivedStateFromError(erro: unknown): EstadoErro {
    const mensagem =
      erro instanceof Error && erro.message ? erro.message : String(erro ?? 'Erro desconhecido')
    return { temErro: true, mensagem }
  }

  componentDidCatch(erro: unknown, info: React.ErrorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', erro, info?.componentStack)
  }

  private tentarDeNovo = () => {
    this.setState({ temErro: false, mensagem: '' })
    try {
      this.props.aoTentarNovo?.()
    } catch {
      /* a própria ação de retry não pode derrubar a tela */
    }
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
      <div className="flex min-h-[50vh] w-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-full max-w-md space-y-4">
          <p className="text-lg font-semibold text-slate-900">
            {this.props.titulo || 'Algo deu errado ao carregar esta tela'}
          </p>
          <p className="break-words rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-500">
            {this.state.mensagem.slice(0, 300)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button className="h-11 px-6" onClick={this.tentarDeNovo}>
              Tentar de novo
            </Button>
            <Button variant="outline" className="h-11 px-6" onClick={this.recarregar}>
              Recarregar
            </Button>
            {!this.props.titulo && (
              <Button variant="ghost" className="h-11 px-6" onClick={this.irParaInicio}>
                Ir para o início
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
