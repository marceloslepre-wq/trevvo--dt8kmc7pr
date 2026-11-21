import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Cliente, listarClientes, obterClientePorId } from '@/services/clientes'
import { formatarCNPJ, formatarCPF } from '@/lib/validacoes'
import { useAssinanteId } from '@/hooks/useAssinanteId'

export interface SelectClienteProps {
  value?: string
  onChange?: (clienteId: string, item?: Cliente) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  'aria-label'?: string
}

export const SelectCliente: React.FC<SelectClienteProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione um cliente...',
  className,
  id,
  required: _required,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)
  const assinanteId = useAssinanteId()

  // Cliente selecionado guardado à parte: com milhares de clientes ele pode não
  // estar na lista da busca atual.
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [buscando, setBuscando] = useState(false)

  // Busca no servidor (antes carregava só 100 clientes e filtrava na tela, então a
  // maioria dos 7 mil clientes importados nunca aparecia).
  const carregarClientes = useCallback(
    async (termo: string) => {
      setBuscando(true)
      try {
        const resp = await listarClientes({
          situacao: 'ativos',
          porPagina: 50,
          busca: termo,
          ordenarPor: 'nome_razao_social',
          ordem: 'asc',
          assinante_id: assinanteId || undefined,
        })
        let itens = resp.items
        // Sem termo: Consumidor Final sempre no topo
        if (!termo.trim()) {
          try {
            const cf = await listarClientes({
              situacao: 'ativos',
              porPagina: 1,
              busca: 'Consumidor Final',
              assinante_id: assinanteId || undefined,
            })
            const consumidor = cf.items[0]
            if (consumidor) itens = [consumidor, ...itens.filter((c) => c.id !== consumidor.id)]
          } catch (_) {
            /* sem consumidor final: segue a lista */
          }
        }
        setClientes(itens)
      } catch (err) {
        console.error('Erro ao carregar clientes:', err)
      } finally {
        setBuscando(false)
        setCarregando(false)
      }
    },
    [assinanteId],
  )

  // Busca com espera de 300 ms após a digitação
  useEffect(() => {
    const t = setTimeout(() => carregarClientes(busca), busca.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [busca, carregarClientes])

  // Garante os dados do cliente selecionado mesmo fora da lista
  useEffect(() => {
    if (!value) {
      setClienteSelecionado(null)
      return
    }
    const naLista = clientes.find((c) => c.id === value)
    if (naLista) {
      setClienteSelecionado(naLista)
      return
    }
    if (clienteSelecionado?.id === value) return
    let cancelado = false
    obterClientePorId(value)
      .then((c) => {
        if (!cancelado && c) setClienteSelecionado(c as Cliente)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, clientes])

  const selecionado = clienteSelecionado

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes
    const termo = busca.toLowerCase().trim()
    const termoLimpo = termo.replace(/[^a-zA-Z0-9]/g, '')
    const numero = parseInt(termo, 10)

    return clientes.filter((c) => {
      const nomeOuRazao = (
        c.nome_razao_social ||
        c.razao_social ||
        c.nome ||
        c.nome_fantasia ||
        ''
      ).toLowerCase()
      if (nomeOuRazao.includes(termo)) return true
      if (c.nome_fantasia && c.nome_fantasia.toLowerCase().includes(termo)) return true
      if (c.municipio && c.municipio.toLowerCase().includes(termo)) return true
      if (!Number.isNaN(numero) && c.codigo === numero) return true
      if (termoLimpo && c.cpf_cnpj && c.cpf_cnpj.toLowerCase().includes(termoLimpo)) return true
      return false
    })
  }, [clientes, busca])

  const handleSelect = (clienteId: string) => {
    const item = clientes.find((c) => c.id === clienteId)
    if (item) setClienteSelecionado(item)
    if (onChange) {
      onChange(clienteId, item)
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

  const formatarDoc = (c: Cliente) => {
    if (c.tipo_pessoa === 'Estrangeiro') return c.id_estrangeiro || ''
    if (!c.cpf_cnpj) return ''
    return c.tipo_pessoa === 'Física' ? formatarCPF(c.cpf_cnpj) : formatarCNPJ(c.cpf_cnpj)
  }

  return (
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
            'w-full justify-between font-normal text-left h-9 px-3 bg-white hover:bg-slate-50',
            !value && 'text-slate-400',
            className,
          )}
        >
          <span className="truncate mr-2 flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {carregando ? (
              <span className="flex items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando clientes...
              </span>
            ) : selecionado ? (
              <span className="text-slate-900 font-medium">
                <span className="font-mono text-slate-500 mr-1.5">#{selecionado.codigo}</span>
                {selecionado.nome_razao_social ||
                  selecionado.razao_social ||
                  selecionado.nome ||
                  selecionado.nome_fantasia}
                {selecionado.municipio && (
                  <span className="text-slate-400 text-xs ml-1.5 font-normal">
                    ({selecionado.municipio}/{selecionado.uf || ''})
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

      <PopoverContent className="w-[320px] sm:w-[420px] p-0" align="start">
        <div className="p-2 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, nome/razão, CPF/CNPJ..."
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

        <div className="max-h-64 overflow-y-auto p-1 text-xs">
          {buscando && clientesFiltrados.length === 0 ? (
            <div className="py-6 text-center text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="py-6 text-center text-slate-500">
              <p>Nenhum cliente encontrado</p>
              {busca && <p className="text-[11px] text-slate-400 mt-1">Tente outros termos.</p>}
            </div>
          ) : (
            clientesFiltrados.map((item) => {
              const isSelected = value === item.id
              const doc = formatarDoc(item)
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
                      <span className="font-medium text-slate-900 truncate">
                        {item.nome_razao_social ||
                          item.razao_social ||
                          item.nome ||
                          item.nome_fantasia}
                      </span>
                    </div>
                    {item.nome_fantasia &&
                      item.razao_social &&
                      item.nome_fantasia !== item.razao_social && (
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.nome_fantasia}
                        </div>
                      )}
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {doc && <span className="font-mono">{doc}</span>}
                      {item.municipio && (
                        <span>
                          {item.municipio}/{item.uf}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default SelectCliente
