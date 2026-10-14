import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Search, Plus, Check } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Cliente } from '@/services/clientes'
import { ClienteCadastroRapido } from '@/components/ClienteCadastroRapido'

interface ModalClientePDVProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  clienteAtual: Cliente | null
  cpfCnpjAtual?: string
  onConfirmar: (cliente: Cliente | null, cpfCnpjConsumidor: string) => void
}

export const ModalClientePDV: React.FC<ModalClientePDVProps> = ({
  aberto,
  onOpenChange,
  clienteAtual,
  cpfCnpjAtual = '',
  onConfirmar,
}) => {
  const [busca, setBusca] = useState('')
  const [cpfCnpjCupom, setCpfCnpjCupom] = useState(cpfCnpjAtual)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selecionado, setSelecionado] = useState<Cliente | null>(clienteAtual)
  const [carregando, setCarregando] = useState(false)
  const [modalNovoClienteAberto, setModalNovoClienteAberto] = useState(false)
  const inputBuscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setBusca('')
      setCpfCnpjCupom(cpfCnpjAtual || '')
      setSelecionado(clienteAtual)
      carregarClientes('')
      setTimeout(() => {
        inputBuscaRef.current?.focus()
      }, 100)
    }
  }, [aberto, clienteAtual, cpfCnpjAtual])

  const carregarClientes = async (termo: string) => {
    setCarregando(true)
    try {
      const t = termo.trim().replace(/['"]/g, '')
      let filter = 'ativo = true'
      if (t) {
        filter += ` && (nome_razao_social ~ '${t}' || nome_fantasia ~ '${t}' || cpf_cnpj ~ '${t}')`
      }
      const res = await pb.collection('clientes').getList<Cliente>(1, 30, {
        filter,
        sort: 'nome_razao_social',
      })
      setClientes(res.items)
    } catch (err) {
      console.warn('Erro ao carregar clientes:', err)
    } finally {
      setCarregando(false)
    }
  }

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault()
    carregarClientes(busca)
  }

  const handleSalvar = () => {
    onConfirmar(selecionado, cpfCnpjCupom.trim())
    onOpenChange(false)
  }

  const handleNovoClienteCriado = (novo: Cliente) => {
    setSelecionado(novo)
    if (novo.cpf_cnpj) {
      setCpfCnpjCupom(novo.cpf_cnpj)
    }
    setModalNovoClienteAberto(false)
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-slate-900 text-white border-slate-700 p-6">
          <DialogHeader className="border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Identificar Cliente / Consumidor (F3)
              </DialogTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setModalNovoClienteAberto(true)}
                className="h-7 text-xs bg-slate-800 border-slate-700 text-blue-300 hover:bg-slate-700 gap-1"
              >
                <Plus size={14} />
                Cadastro Rápido
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* CPF/CNPJ direto no cupom (não cadastrado) */}
            <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300">
                CPF ou CNPJ para Impressão no Cupom (Consumidor Não Cadastrado)
              </Label>
              <Input
                placeholder="Digite apenas números (opcional)..."
                value={cpfCnpjCupom}
                onChange={(e) => setCpfCnpjCupom(e.target.value)}
                className="h-9 bg-slate-900 border-slate-700 text-white font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Útil para cupom fiscal/comprovante rápido sem necessidade de cadastro completo.
              </p>
            </div>

            {/* Busca de Cliente Cadastrado */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-300">
                Ou vincular Cliente Cadastrado (Obrigatório para Crediário)
              </Label>
              <form onSubmit={handleBuscar} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    ref={inputBuscaRef}
                    placeholder="Buscar por nome, razão social ou CPF/CNPJ..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-9 pl-9 bg-slate-800 border-slate-700 text-white text-xs"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4"
                >
                  Buscar
                </Button>
              </form>

              <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-1 bg-slate-950/60">
                {/* Opção Consumidor Final Padrão */}
                <div
                  onClick={() => setSelecionado(null)}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs ${
                    selecionado === null
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div>
                    <span className="font-bold">Consumidor Final (Padrão Balcão)</span>
                    <span className="text-[10px] block opacity-75">
                      Venda sem identificação nominal prévia
                    </span>
                  </div>
                  {selecionado === null && <Check size={16} className="text-white" />}
                </div>

                {clientes.map((c) => {
                  const ativo = selecionado?.id === c.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelecionado(c)
                        if (c.cpf_cnpj && !cpfCnpjCupom) {
                          setCpfCnpjCupom(c.cpf_cnpj)
                        }
                      }}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs ${
                        ativo
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.nome_razao_social}</div>
                        <div className="text-[10px] opacity-75">
                          {c.cpf_cnpj ? `Doc: ${c.cpf_cnpj}` : ''}{' '}
                          {c.telefone ? `| Fone: ${c.telefone}` : ''}
                        </div>
                      </div>
                      {ativo && <Check size={16} className="text-white shrink-0 ml-2" />}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-800 pt-3 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
            >
              Cancelar (Esc)
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvar}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5"
            >
              Confirmar Cliente (Enter)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalNovoClienteAberto && (
        <ClienteCadastroRapido
          aberto={modalNovoClienteAberto}
          aoFechar={() => setModalNovoClienteAberto(false)}
          aoSalvarSucesso={handleNovoClienteCriado}
        />
      )}
    </>
  )
}
