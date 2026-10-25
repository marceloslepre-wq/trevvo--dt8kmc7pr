import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, CreditCard, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useAssinanteId } from '@/hooks/useAssinanteId'
import {
  CondicaoPagamento,
  TipoCondicaoPagamento,
  UsoCondicaoPagamento,
  listarTodasCondicoesAtivas,
  salvarCondicaoPagamento,
} from '@/services/condicoesPagamento'

export interface SelectCondicaoPagamentoProps {
  value?: string
  onChange?: (condicaoId: string, item?: CondicaoPagamento) => void
  uso?: 'Vendas' | 'Compras'
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectCondicaoPagamento: React.FC<SelectCondicaoPagamentoProps> = ({
  value,
  onChange,
  uso,
  disabled = false,
  placeholder = 'Selecione uma condição de pagamento...',
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const podeCriarCondicao = pode('condicoes_pagamento', 'criar')
  const assinanteId = useAssinanteId()

  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [carregando, setCarregando] = useState(false)

  // Estado do modal de cadastro rápido "+ Nova condição"
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [salvandoNova, setSalvandoNova] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoCondicaoPagamento>('A prazo')
  const [novoUso, setNovoUso] = useState<UsoCondicaoPagamento>(uso || 'Ambos')
  const [novoDiasStr, setNovoDiasStr] = useState('30')
  const [erroForm, setErroForm] = useState<string | null>(null)

  const carregarCondicoes = useCallback(async () => {
    setCarregando(true)
    try {
      const lista = await listarTodasCondicoesAtivas(uso, assinanteId || undefined)
      setCondicoes(lista)
    } catch (err) {
      console.error('Erro ao carregar condições de pagamento:', err)
    } finally {
      setCarregando(false)
    }
  }, [uso, assinanteId])

  useEffect(() => {
    carregarCondicoes()
  }, [carregarCondicoes])

  const selecionada = useMemo(() => {
    if (!value) return null
    return condicoes.find((c) => c.id === value) || null
  }, [condicoes, value])

  const condicoesFiltradas = useMemo(() => {
    if (!busca.trim()) return condicoes
    const termo = busca.toLowerCase().trim()
    const numero = parseInt(termo, 10)

    return condicoes.filter((c) => {
      if (c.nome.toLowerCase().includes(termo)) return true
      if (!Number.isNaN(numero) && c.codigo === numero) return true
      if (c.tipo.toLowerCase().includes(termo)) return true
      if (c.observacao && c.observacao.toLowerCase().includes(termo)) return true
      return false
    })
  }, [condicoes, busca])

  const handleSelect = (condicaoId: string) => {
    const item = condicoes.find((c) => c.id === condicaoId)
    if (onChange) {
      onChange(condicaoId, item)
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
    setNovoNome(busca.trim())
    setNovoTipo('A prazo')
    setNovoUso(uso || 'Ambos')
    setNovoDiasStr('30')
    setErroForm(null)
    setModalNovoAberto(true)
  }

  const handleSalvarNovaCondicao = async (e: React.FormEvent) => {
    e.preventDefault()
    const nomeLimpo = novoNome.trim()
    if (!nomeLimpo) {
      setErroForm('O nome da condição é obrigatório.')
      return
    }

    let dias: number[] = []
    let qtd = 1

    if (novoTipo === 'À vista') {
      dias = [0]
      qtd = 1
    } else {
      const partes = novoDiasStr
        .split(/[,/ ]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(Number)

      if (partes.length === 0 || partes.some((n) => Number.isNaN(n) || n < 0)) {
        setErroForm('Informe os dias das parcelas separados por vírgula ou barra (ex: 30, 60, 90).')
        return
      }

      // Validar ordem crescente
      for (let i = 1; i < partes.length; i++) {
        if (partes[i] <= partes[i - 1]) {
          setErroForm('Os dias devem estar em ordem crescente (ex: 30, 60, 90).')
          return
        }
      }

      dias = partes
      qtd = partes.length
    }

    setSalvandoNova(true)
    try {
      const nova = await salvarCondicaoPagamento({
        nome: nomeLimpo,
        tipo: novoTipo,
        uso: novoUso,
        quantidade_parcelas: qtd,
        dias_parcelas: dias,
        percentual_entrada: 0,
        acrescimo_percentual: 0,
        desconto_percentual: 0,
      })

      toast({
        title: 'Condição de pagamento criada',
        description: `A condição "${nova.nome}" foi cadastrada com sucesso.`,
      })

      setCondicoes((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))

      if (onChange) {
        onChange(nova.id, nova)
      }

      setModalNovoAberto(false)
      setBusca('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar condição'
      setErroForm(msg)
      toast({
        title: 'Erro ao cadastrar',
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
              <CreditCard className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {carregando ? (
                <span className="flex items-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando condições...
                </span>
              ) : selecionada ? (
                <span className="text-slate-900 font-medium flex items-center gap-1.5">
                  <span className="font-mono text-slate-500 text-xs">#{selecionada.codigo}</span>
                  <span>{selecionada.nome}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1 font-normal text-slate-500 bg-slate-50"
                  >
                    {selecionada.tipo}
                  </Badge>
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

        <PopoverContent className="w-[320px] sm:w-[400px] p-0" align="start">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, código ou prazo..."
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

          {uso && (
            <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Filtro de aplicabilidade:</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                {uso}
              </Badge>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1 text-xs">
            {condicoesFiltradas.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                <p>Nenhuma condição encontrada</p>
                {podeCriarCondicao && (
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
              condicoesFiltradas.map((item) => {
                const isSelected = value === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2.5 transition-colors',
                      isSelected
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : 'hover:bg-slate-100 text-slate-700',
                    )}
                  >
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <div className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-500 text-[11px]">#{item.codigo}</span>
                        <span className="font-medium text-slate-900 truncate">{item.nome}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] py-0 px-1 uppercase tracking-wider',
                            item.tipo === 'À vista'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200',
                          )}
                        >
                          {item.tipo}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>
                          {item.quantidade_parcelas}{' '}
                          {item.quantidade_parcelas === 1 ? 'parcela' : 'parcelas'}
                        </span>
                        {item.dias_parcelas && (
                          <span className="font-mono">[{item.dias_parcelas.join(', ')} dias]</span>
                        )}
                        {item.uso !== 'Ambos' && (
                          <span className="text-slate-500">• {item.uso}</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {podeCriarCondicao && (
            <div className="p-1.5 border-t border-slate-100 bg-slate-50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAbrirModalNovo}
                className="w-full justify-start text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />+ Nova condição de pagamento
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Modal rápido de cadastro "+ Nova Condição" */}
      <Dialog open={modalNovoAberto} onOpenChange={setModalNovoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarNovaCondicao}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Nova Condição de Pagamento
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastro rápido para vincular imediatamente ao registro atual.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              <div className="space-y-1">
                <Label htmlFor="novo-cond-nome" className="text-xs font-semibold text-slate-700">
                  Nome <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="novo-cond-nome"
                  value={novoNome}
                  onChange={(e) => {
                    setNovoNome(e.target.value)
                    if (erroForm) setErroForm(null)
                  }}
                  placeholder="Ex: 15/30/45 dias, Entrada + 30 dias"
                  className="h-9 text-xs"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Tipo *</Label>
                  <Select
                    value={novoTipo}
                    onValueChange={(val) => {
                      setNovoTipo(val as TipoCondicaoPagamento)
                      if (val === 'À vista') setNovoDiasStr('0')
                      else if (novoDiasStr === '0') setNovoDiasStr('30')
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="À vista">À vista</SelectItem>
                      <SelectItem value="A prazo">A prazo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Uso *</Label>
                  <Select
                    value={novoUso}
                    onValueChange={(val) => setNovoUso(val as UsoCondicaoPagamento)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ambos">Ambos</SelectItem>
                      <SelectItem value="Vendas">Vendas</SelectItem>
                      <SelectItem value="Compras">Compras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {novoTipo === 'A prazo' && (
                <div className="space-y-1">
                  <Label htmlFor="novo-cond-dias" className="text-xs font-semibold text-slate-700">
                    Dias das parcelas (separados por vírgula) *
                  </Label>
                  <Input
                    id="novo-cond-dias"
                    value={novoDiasStr}
                    onChange={(e) => {
                      setNovoDiasStr(e.target.value)
                      if (erroForm) setErroForm(null)
                    }}
                    placeholder="Ex: 30, 60, 90"
                    className="h-9 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400">
                    A quantidade de parcelas será igual ao número de prazos digitados.
                  </p>
                </div>
              )}

              {erroForm && <p className="text-xs text-rose-600 font-medium">{erroForm}</p>}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalNovoAberto(false)}
                disabled={salvandoNova}
                className="text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
                disabled={salvandoNova}
              >
                {salvandoNova ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
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

export default SelectCondicaoPagamento
