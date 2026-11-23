import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Loader2,
  MessageCircleQuestion,
  Search,
  Sparkles,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { ARTIGOS_AJUDA, type ArtigoAjuda } from '@/config/ajudaArtigos'
import { ROTAS, buscarRota, type ItemRota } from '@/config/tabelaRotas'
import { buscarArtigos, buscarTelas } from '@/lib/buscaAjuda'
import { perguntarAoTrevvo, ChatAjudaIndisponivel } from '@/services/ajuda'

/** Artigos mostrados com a busca vazia */
const SUGESTOES = [
  'cancelar-nota',
  'abrir-caixa',
  'fechar-caixa',
  'troca-devolucao',
  'nota-entrada-xml',
  'transferencia',
]

type Visao =
  | { tipo: 'busca' }
  | { tipo: 'artigo'; artigo: ArtigoAjuda }
  | { tipo: 'chat'; pergunta: string }

interface BuscaTrevvoProps {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
}

/**
 * Barra "Buscar no Trevvo" (Ctrl+K): acha a tela certa e mostra o passo a passo.
 * Se a busca não resolver, "Perguntar ao Trevvo" manda a pergunta ao agente de ajuda.
 * Só mostra telas e artigos que o usuário tem permissão de abrir (mesma regra do menu).
 */
export const BuscaTrevvo: React.FC<BuscaTrevvoProps> = ({ aberto, onAbertoChange }) => {
  const navigate = useNavigate()
  const { pode, administrador } = usePermissoes()
  const { empresas } = useEmpresaAtiva()
  const [texto, setTexto] = useState('')
  const [visao, setVisao] = useState<Visao>({ tipo: 'busca' })
  const [selecionado, setSelecionado] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Chat
  const [carregandoChat, setCarregandoChat] = useState(false)
  const [resposta, setResposta] = useState('')
  const [erroChat, setErroChat] = useState('')
  const [chatIndisponivel, setChatIndisponivel] = useState(false)
  const [conversaId, setConversaId] = useState<string | undefined>(undefined)

  const temAcesso = useCallback(
    (item: ItemRota): boolean => {
      if (item.rota === '/painel-grupo') {
        if (empresas.length <= 1) return false
        return administrador || pode('relatorios', 'ver')
      }
      if (administrador) return true
      return pode(item.modulo, item.acaoMinima)
    },
    [administrador, pode, empresas.length],
  )

  const podeAbrir = useCallback(
    (rota: string): boolean => {
      const item = buscarRota(rota)
      if (!item) return administrador
      return temAcesso(item)
    },
    [administrador, temAcesso],
  )

  // Ao abrir: limpa e foca a busca
  useEffect(() => {
    if (aberto) {
      setTexto('')
      setVisao({ tipo: 'busca' })
      setSelecionado(0)
      setResposta('')
      setErroChat('')
      setConversaId(undefined)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [aberto])

  const artigos = useMemo(() => {
    if (!texto.trim()) {
      return SUGESTOES.map((id) => ARTIGOS_AJUDA.find((a) => a.id === id))
        .filter((a): a is ArtigoAjuda => !!a && podeAbrir(a.rota))
        .map((artigo) => ({ artigo, pontos: 0 }))
    }
    return buscarArtigos(texto, podeAbrir, 6)
  }, [texto, podeAbrir])

  const telas = useMemo(
    () => (texto.trim() ? buscarTelas(texto, temAcesso, 5) : []),
    [texto, temAcesso],
  )

  // Lista única para navegar com as setas: artigos, telas e "Perguntar"
  const itens = useMemo(() => {
    const lista: Array<
      | { tipo: 'artigo'; artigo: ArtigoAjuda }
      | { tipo: 'tela'; tela: ItemRota }
      | { tipo: 'perguntar' }
    > = []
    artigos.forEach((r) => lista.push({ tipo: 'artigo', artigo: r.artigo }))
    telas.forEach((r) => lista.push({ tipo: 'tela', tela: r.tela }))
    if (texto.trim().length >= 3) lista.push({ tipo: 'perguntar' })
    return lista
  }, [artigos, telas, texto])

  useEffect(() => setSelecionado(0), [texto])

  const abrirTela = (rota: string) => {
    onAbertoChange(false)
    navigate(rota)
  }

  const perguntar = async (pergunta: string) => {
    const q = pergunta.trim()
    if (!q) return
    setVisao({ tipo: 'chat', pergunta: q })
    setResposta('')
    setErroChat('')
    setChatIndisponivel(false)
    setCarregandoChat(true)
    try {
      const contexto = buscarArtigos(q, podeAbrir, 4).map((r) => r.artigo)
      const telasPermitidas: { rota: string; rotulo: string; grupo: string }[] = []
      const vistas = new Set<string>()
      ROTAS.forEach((r) => {
        if (r.ocultoNoMenu || vistas.has(r.rota) || !temAcesso(r)) return
        vistas.add(r.rota)
        telasPermitidas.push({ rota: r.rota, rotulo: r.rotulo, grupo: r.grupo })
      })
      const res = await perguntarAoTrevvo(q, contexto, telasPermitidas, conversaId)
      setResposta(res.resposta || 'Não encontrei uma resposta. Tente perguntar de outro jeito.')
      if (res.conversation_id) setConversaId(res.conversation_id)
    } catch (err: any) {
      if (err instanceof ChatAjudaIndisponivel) setChatIndisponivel(true)
      else setErroChat(err?.message || 'Não foi possível falar com o Trevvo agora.')
    } finally {
      setCarregandoChat(false)
    }
  }

  const executar = (i: number) => {
    const item = itens[i]
    if (!item) return
    if (item.tipo === 'artigo') setVisao({ tipo: 'artigo', artigo: item.artigo })
    else if (item.tipo === 'tela') abrirTela(item.tela.rota)
    else perguntar(texto)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visao.tipo !== 'busca') {
      if (e.key === 'Enter' && texto.trim()) {
        e.preventDefault()
        perguntar(texto)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelecionado((s) => Math.min(s + 1, Math.max(itens.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelecionado((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executar(selecionado)
    }
  }

  const voltar = () => {
    setVisao({ tipo: 'busca' })
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  let indice = -1
  const classeItem = (i: number) =>
    `w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors ${
      i === selecionado ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
    }`

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="notranslate max-w-2xl p-0 gap-0 overflow-hidden" translate="no">
        <DialogTitle className="sr-only">Buscar no Trevvo</DialogTitle>
        <DialogDescription className="sr-only">
          Encontre telas e o passo a passo das tarefas do sistema
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              if (visao.tipo === 'artigo') setVisao({ tipo: 'busca' })
            }}
            onKeyDown={onKeyDown}
            placeholder={
              visao.tipo === 'chat'
                ? 'Pergunte outra coisa e aperte Enter...'
                : 'Ex.: como cancelar uma nota fiscal?'
            }
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-slate-400"
            aria-label="Buscar no Trevvo"
          />
          <kbd className="hidden sm:inline text-[10px] text-slate-400 border rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {visao.tipo === 'busca' && (
            <>
              {artigos.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {texto.trim() ? 'Como fazer' : 'Mais procurados'}
                  </p>
                  {artigos.map((r) => {
                    indice++
                    const i = indice
                    return (
                      <button
                        key={r.artigo.id}
                        className={classeItem(i)}
                        onMouseEnter={() => setSelecionado(i)}
                        onClick={() => executar(i)}
                      >
                        <BookOpen className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-medium">{r.artigo.titulo}</span>
                          <span className="text-xs text-slate-500">{r.artigo.caminho}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {telas.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Telas
                  </p>
                  {telas.map((r) => {
                    indice++
                    const i = indice
                    const Icone = r.tela.icone || ArrowRight
                    return (
                      <button
                        key={r.tela.rota}
                        className={classeItem(i)}
                        onMouseEnter={() => setSelecionado(i)}
                        onClick={() => executar(i)}
                      >
                        <Icone className="h-4 w-4 mt-0.5 text-slate-500 shrink-0" />
                        <span className="flex flex-col">
                          <span className="text-sm font-medium">{r.tela.rotulo}</span>
                          <span className="text-xs text-slate-500">{r.tela.grupo}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {texto.trim().length >= 3 &&
                (() => {
                  indice++
                  const i = indice
                  return (
                    <button
                      className={classeItem(i)}
                      onMouseEnter={() => setSelecionado(i)}
                      onClick={() => executar(i)}
                    >
                      <Sparkles className="h-4 w-4 mt-0.5 text-violet-600 shrink-0" />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">Perguntar ao Trevvo</span>
                        <span className="text-xs text-slate-500 truncate max-w-[480px]">
                          "{texto.trim()}"
                        </span>
                      </span>
                    </button>
                  )
                })()}

              {texto.trim() &&
                artigos.length === 0 &&
                telas.length === 0 &&
                texto.trim().length < 3 && (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">
                    Continue digitando...
                  </p>
                )}
            </>
          )}

          {visao.tipo === 'artigo' && (
            <DetalheArtigo
              artigo={visao.artigo}
              onVoltar={voltar}
              onAbrir={() => abrirTela(visao.artigo.rota)}
            />
          )}

          {visao.tipo === 'chat' && (
            <div className="p-3 space-y-3">
              <button
                onClick={voltar}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar à busca
              </button>
              <div className="flex items-start gap-2">
                <MessageCircleQuestion className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
                <p className="text-sm font-medium text-slate-800">{visao.pergunta}</p>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-violet-700">
                  <Sparkles className="h-3.5 w-3.5" /> Trevvo
                </div>
                {carregandoChat && (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Pensando...
                  </p>
                )}
                {!carregandoChat && chatIndisponivel && (
                  <p className="text-sm text-slate-600">
                    O chat com o Trevvo ainda não foi ligado neste sistema. Use a busca: digite
                    poucas palavras, por exemplo "cancelar nota" ou "fechar caixa".
                  </p>
                )}
                {!carregandoChat && erroChat && <p className="text-sm text-red-600">{erroChat}</p>}
                {!carregandoChat && resposta && (
                  <TextoResposta texto={resposta} podeAbrir={podeAbrir} onAbrir={abrirTela} />
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                As respostas usam a ajuda do Trevvo. Confira na tela antes de confirmar ações
                fiscais.
              </p>
            </div>
          )}
        </div>

        {visao.tipo === 'busca' && (
          <div className="hidden sm:flex items-center gap-4 border-t px-4 py-2 text-[11px] text-slate-400">
            <span>↑ ↓ para escolher</span>
            <span>Enter para abrir</span>
            <span>Ctrl+K abre de qualquer tela</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const DetalheArtigo: React.FC<{
  artigo: ArtigoAjuda
  onVoltar: () => void
  onAbrir: () => void
}> = ({ artigo, onVoltar, onAbrir }) => (
  <div className="p-3 space-y-4">
    <button
      onClick={onVoltar}
      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Voltar à busca
    </button>
    <div>
      <h3 className="text-base font-semibold text-slate-900">{artigo.titulo}</h3>
      <p className="text-xs text-blue-700 mt-0.5">{artigo.caminho}</p>
    </div>
    <ol className="space-y-2">
      {artigo.passos.map((p, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
            {i + 1}
          </span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
    {artigo.dicas && artigo.dicas.length > 0 && (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
        {artigo.dicas.map((d, i) => (
          <p key={i} className="text-xs text-amber-900">
            {d}
          </p>
        ))}
      </div>
    )}
    <Button onClick={onAbrir} className="gap-2">
      <ExternalLink className="h-4 w-4" /> Abrir tela
    </Button>
  </div>
)

/**
 * Mostra a resposta do agente. Links no formato [texto](/rota) viram botões "Abrir",
 * só para rotas internas que o usuário pode abrir; o resto vira texto simples.
 */
const TextoResposta: React.FC<{
  texto: string
  podeAbrir: (rota: string) => boolean
  onAbrir: (rota: string) => void
}> = ({ texto, podeAbrir, onAbrir }) => {
  const linhas = texto.split('\n')
  return (
    <div className="space-y-1.5 text-sm text-slate-700">
      {linhas.map((linha, i) => {
        if (!linha.trim()) return <div key={i} className="h-1" />
        const partes: React.ReactNode[] = []
        const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g
        let ultimo = 0
        let m: RegExpExecArray | null
        let k = 0
        while ((m = re.exec(linha)) !== null) {
          if (m.index > ultimo) partes.push(linha.slice(ultimo, m.index))
          if (m[3]) {
            partes.push(<strong key={k++}>{m[3]}</strong>)
          } else {
            const rotulo = m[1]
            const rota = m[2]
            if (rota.startsWith('/') && !rota.startsWith('//') && podeAbrir(rota)) {
              partes.push(
                <button
                  key={k++}
                  onClick={() => onAbrir(rota)}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 mx-0.5"
                >
                  {rotulo} <ExternalLink className="h-3 w-3" />
                </button>,
              )
            } else {
              partes.push(rotulo)
            }
          }
          ultimo = m.index + m[0].length
        }
        if (ultimo < linha.length) partes.push(linha.slice(ultimo))
        return <p key={i}>{partes}</p>
      })}
    </div>
  )
}

export default BuscaTrevvo
