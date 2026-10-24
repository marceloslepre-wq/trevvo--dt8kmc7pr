import React, { useState, useEffect } from 'react'
import { Bookmark, BookmarkPlus, Share2, Trash2, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import {
  ObjetoFiltrosRelatorio,
  FiltroSalvoRelatorio,
  listarFiltrosSalvos,
  salvarFiltroRelatorio,
  excluirFiltroSalvo,
} from '@/services/relatorios'

export interface GerenciadorFiltrosSalvosProps {
  relatorioId: string
  filtrosAtuais: ObjetoFiltrosRelatorio
  onAplicarFiltros: (filtros: ObjetoFiltrosRelatorio) => void
  disabled?: boolean
}

export const GerenciadorFiltrosSalvos: React.FC<GerenciadorFiltrosSalvosProps> = ({
  relatorioId,
  filtrosAtuais,
  onAplicarFiltros,
  disabled = false,
}) => {
  const { toast } = useToast()
  const currentUserId = pb.authStore.record?.id

  const [listaSalvos, setListaSalvos] = useState<FiltroSalvoRelatorio[]>([])
  const [carregando, setCarregando] = useState(false)
  const [modalSalvarAberto, setModalSalvarAberto] = useState(false)
  const [popoverMeusFiltrosAberto, setPopoverMeusFiltrosAberto] = useState(false)

  // Formulário de salvar
  const [nomeFiltro, setNomeFiltro] = useState('')
  const [compartilhado, setCompartilhado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregarFiltros = async () => {
    if (!relatorioId) return
    setCarregando(true)
    try {
      const dados = await listarFiltrosSalvos(relatorioId)
      setListaSalvos(dados)
    } catch {
      // Ignora erro
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarFiltros()
  }, [relatorioId])

  const handleAbrirSalvar = () => {
    setNomeFiltro('')
    setCompartilhado(false)
    setModalSalvarAberto(true)
  }

  const handleConfirmarSalvar = async () => {
    if (!nomeFiltro.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para identificar este filtro salvo.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await salvarFiltroRelatorio({
        relatorio: relatorioId,
        nome: nomeFiltro.trim(),
        filtros: filtrosAtuais,
        compartilhado,
      })
      toast({
        title: 'Filtro salvo',
        description: `O filtro "${nomeFiltro.trim()}" foi salvo com sucesso.`,
      })
      setModalSalvarAberto(false)
      carregarFiltros()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha ao salvar o filtro.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleAplicar = (item: FiltroSalvoRelatorio) => {
    onAplicarFiltros(item.filtros)
    setPopoverMeusFiltrosAberto(false)
    toast({
      title: 'Filtro aplicado',
      description: `Filtro "${item.nome}" carregado nos parâmetros de consulta.`,
    })
  }

  const handleExcluir = async (e: React.MouseEvent, item: FiltroSalvoRelatorio) => {
    e.stopPropagation()
    if (!confirm(`Deseja realmente excluir o filtro salvo "${item.nome}"?`)) return
    try {
      await excluirFiltroSalvo(item.id)
      toast({
        title: 'Filtro excluído',
        description: `O filtro "${item.nome}" foi removido.`,
      })
      setListaSalvos((prev) => prev.filter((f) => f.id !== item.id))
    } catch (err: unknown) {
      toast({
        title: 'Erro ao excluir',
        description: err instanceof Error ? err.message : 'Falha ao excluir o filtro salvo.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Botão Salvar estes filtros */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={handleAbrirSalvar}
        className="h-7 text-xs border-slate-200 text-slate-700 hover:text-blue-700 bg-white"
        title="Salvar a combinação atual de filtros para consultar novamente com um clique"
      >
        <BookmarkPlus className="h-3.5 w-3.5 mr-1 text-blue-600" />
        Salvar estes filtros
      </Button>

      {/* Botão Meus filtros (Popover com lista) */}
      <Popover open={popoverMeusFiltrosAberto} onOpenChange={setPopoverMeusFiltrosAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 text-xs border-slate-200 text-slate-700 hover:text-slate-900 bg-white"
            title="Abrir filtros favoritados ou compartilhados"
          >
            <Bookmark className="h-3.5 w-3.5 mr-1 text-amber-600" />
            Meus filtros
            {listaSalvos.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 px-1 text-[10px] bg-slate-100 text-slate-700"
              >
                {listaSalvos.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-80 p-3 bg-white shadow-xl border border-slate-200 rounded-lg text-xs"
          align="end"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Bookmark className="h-4 w-4 text-amber-600" />
              Filtros Salvos
            </span>
            <span className="text-[11px] text-slate-400">{listaSalvos.length} salvo(s)</span>
          </div>

          {carregando ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Carregando filtros...
            </div>
          ) : listaSalvos.length === 0 ? (
            <div className="py-6 text-center text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">Nenhum filtro salvo ainda</p>
              <p className="text-[11px] text-slate-400">
                Configure os filtros desejados e clique em &quot;Salvar estes filtros&quot;.
              </p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {listaSalvos.map((item) => {
                const ehMeu = item.usuario_id === currentUserId
                return (
                  <div
                    key={item.id}
                    onClick={() => handleAplicar(item)}
                    className="p-2 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors flex items-start justify-between gap-2 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate flex items-center gap-1">
                        <span>{item.nome}</span>
                        {item.compartilhado && (
                          <span
                            title="Compartilhado com todos os usuários com acesso"
                            className="inline-flex text-blue-600"
                          >
                            <Share2 className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {ehMeu ? 'Criado por você' : 'Compartilhado'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                        title="Aplicar este filtro"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      {ehMeu && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleExcluir(e, item)}
                          className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600"
                          title="Excluir filtro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Modal para salvar novo filtro */}
      <Dialog open={modalSalvarAberto} onOpenChange={setModalSalvarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-slate-900">
              <BookmarkPlus className="h-4 w-4 text-blue-600" />
              Salvar Combinação de Filtros
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Salve os parâmetros atuais para abrir este relatório novamente com um único clique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">
                Nome do Filtro Salvo <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="text"
                value={nomeFiltro}
                onChange={(e) => setNomeFiltro(e.target.value)}
                placeholder="Ex.: Vendas Matriz - Linha Premium (Últimos 30 dias)"
                className="h-8 text-xs bg-white"
                autoFocus
              />
            </div>

            <div className="border border-slate-200 rounded-md p-3 bg-slate-50/50">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={compartilhado}
                  onCheckedChange={(c) => setCompartilhado(Boolean(c))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5 text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <Share2 className="h-3.5 w-3.5 text-blue-600" />
                    Compartilhar com outros usuários
                  </span>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Quando marcado, este filtro ficará visível para todos os usuários que tiverem
                    acesso a este relatório. Apenas você poderá editar ou excluir.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalSalvarAberto(false)}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarSalvar}
              disabled={salvando}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar filtro'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
