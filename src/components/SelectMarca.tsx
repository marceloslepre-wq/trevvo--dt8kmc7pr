import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Loader2, Plus, Search, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { Marca, listarTodasMarcasAtivas, salvarMarca } from '@/services/marcas'

export interface SelectMarcaProps {
  value?: string
  onChange?: (marcaId: string, item?: Marca) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectMarca: React.FC<SelectMarcaProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione uma marca...',
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const podeCriarMarca = pode('marcas', 'criar')

  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [carregando, setCarregando] = useState(false)

  // Estado do modal "+ Nova marca"
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [salvandoNova, setSalvandoNova] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoFabricante, setNovoFabricante] = useState('')
  const [novaObservacao, setNovaObservacao] = useState('')
  const [erroNome, setErroNome] = useState<string | null>(null)

  const carregarMarcas = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await listarTodasMarcasAtivas()
      setMarcas(lista)
    } catch (err) {
      console.error('Erro ao carregar marcas:', err)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregarMarcas()
  }, [carregarMarcas])

  const selecionada = useMemo(() => {
    if (!value) return null
    return marcas.find((m) => m.id === value) || null
  }, [marcas, value])

  const marcasFiltradas = useMemo(() => {
    if (!busca.trim()) return marcas
    const termo = busca.toLowerCase().trim()
    return marcas.filter(
      (m) =>
        m.nome.toLowerCase().includes(termo) ||
        (m.fabricante && m.fabricante.toLowerCase().includes(termo)),
    )
  }, [marcas, busca])

  const handleSelect = (marcaId: string) => {
    const item = marcas.find((m) => m.id === marcaId)
    if (onChange) {
      onChange(marcaId, item)
    }
    setOpen(false)
    setBusca('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onChange) {
      onChange('', undefined)
    }
    setBusca('')
  }

  const handleAbrirModalNovo = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(false)
    setNovoNome(busca.trim()) // Se o usuário já tinha digitado algo na busca, sugere como nome da nova marca
    setNovoFabricante('')
    setNovaObservacao('')
    setErroNome(null)
    setModalNovoAberto(true)
  }

  const handleSalvarNovaMarca = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = novoNome.trim()
    if (!nomeLimpo) {
      setErroNome('O nome da marca é obrigatório.')
      return
    }

    setSalvandoNova(true)
    try {
      const nova = await salvarMarca({
        nome: nomeLimpo,
        fabricante: novoFabricante.trim() || undefined,
        observacao: novaObservacao.trim() || undefined,
      })

      toast({
        title: 'Marca criada',
        description: `A marca "${nova.nome}" foi cadastrada com sucesso.`,
      })

      // Atualiza lista local de marcas
      setMarcas((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))

      // Já seleciona a marca recém-criada
      if (onChange) {
        onChange(nova.id, nova)
      }

      setModalNovoAberto(false)
      setBusca('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar nova marca'
      toast({
        title: 'Erro ao cadastrar marca',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoNova(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel || placeholder}
            disabled={disabled || carregando}
            className={cn(
              'w-full justify-between font-normal text-left h-10 px-3 bg-white hover:bg-slate-50',
              !value && 'text-slate-400',
              className,
            )}
          >
            <span className="truncate mr-2 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {carregando ? (
                <span className="flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando marcas...
                </span>
              ) : selecionada ? (
                <span className="text-slate-900 font-medium">
                  {selecionada.nome}
                  {selecionada.fabricante && (
                    <span className="text-slate-400 text-xs ml-1.5 font-normal">
                      ({selecionada.fabricante})
                    </span>
                  )}
                </span>
              ) : (
                placeholder
              )}
            </span>

            <div className="flex items-center gap-1 shrink-0 text-slate-400">
              {value && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-0.5 rounded-xs hover:text-slate-700 hover:bg-slate-100"
                  title="Limpar seleção"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[300px] sm:w-[360px] p-0" align="start">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar marca ou fabricante..."
              className="h-8 border-0 shadow-none focus-visible:ring-0 px-1 text-xs"
              autoFocus
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto p-1 text-xs">
            {marcasFiltradas.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                <p>Nenhuma marca encontrada</p>
                {podeCriarMarca && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleAbrirModalNovo}
                    className="mt-1 text-xs text-blue-600"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Cadastrar "{busca || 'nova'}" agora
                  </Button>
                )}
              </div>
            ) : (
              marcasFiltradas.map((item) => {
                const isSelected = value === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2.5 transition-colors',
                      isSelected
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : 'hover:bg-slate-100 text-slate-700',
                    )}
                  >
                    <div className="shrink-0">
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <div className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{item.nome}</div>
                      {item.fabricante && (
                        <div className="text-[11px] text-slate-400 truncate">{item.fabricante}</div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Botão de rodapé: + Nova marca sem sair do formulário */}
          {podeCriarMarca && (
            <div className="p-1.5 border-t border-slate-100 bg-slate-50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAbrirModalNovo}
                className="w-full justify-start text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />+ Nova marca
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Modal rápido de cadastro "+ Nova Marca" */}
      <Dialog open={modalNovoAberto} onOpenChange={setModalNovoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarNovaMarca}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Nova Marca de Produto
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastre a nova marca sem sair do formulário em que está trabalhando.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="nova-marca-nome" className="text-xs font-semibold text-slate-700">
                  Nome da Marca <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="nova-marca-nome"
                  value={novoNome}
                  onChange={(e) => {
                    setNovoNome(e.target.value)
                    if (erroNome) setErroNome(null)
                  }}
                  placeholder="Ex: Coca-Cola, Tramontina..."
                  autoFocus
                />
                {erroNome && <p className="text-xs text-rose-600 font-medium">{erroNome}</p>}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="nova-marca-fabricante"
                  className="text-xs font-semibold text-slate-700"
                >
                  Fabricante (opcional)
                </Label>
                <Input
                  id="nova-marca-fabricante"
                  value={novoFabricante}
                  onChange={(e) => setNovoFabricante(e.target.value)}
                  placeholder="Ex: Indústria Brasileira Ltda"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nova-marca-obs" className="text-xs font-semibold text-slate-700">
                  Observação (opcional)
                </Label>
                <Textarea
                  id="nova-marca-obs"
                  value={novaObservacao}
                  onChange={(e) => setNovaObservacao(e.target.value)}
                  placeholder="Notas adicionais sobre a marca..."
                  rows={2}
                  className="resize-none text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalNovoAberto(false)}
                disabled={salvandoNova}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={salvandoNova}
              >
                {salvandoNova ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar e Selecionar'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default SelectMarca
