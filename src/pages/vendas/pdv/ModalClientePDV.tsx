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
import {
  listarClientes,
  buscarClientePorCpfCnpj,
  normalizarCpfCnpj,
  type Cliente,
} from '@/services/clientes'
import { validarCPF, validarCNPJ, formatarCPF, formatarCNPJ } from '@/lib/validacoes'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { ClienteCadastroRapido } from '@/components/ClienteCadastroRapido'

/** Máscara conforme o tamanho: até 11 dígitos = CPF, acima = CNPJ (aceita CNPJ alfanumérico). */
function mascararDocumento(valor: string): string {
  const limpo = normalizarCpfCnpj(valor).slice(0, 14)
  if (!limpo) return ''
  if (limpo.length <= 11 && /^\d+$/.test(limpo)) return formatarCPF(limpo)
  return formatarCNPJ(limpo)
}

/** '' = vazio (ok), 'incompleto', 'invalido' ou 'cpf' / 'cnpj' quando válido. */
function situacaoDocumento(valor: string): '' | 'incompleto' | 'invalido' | 'cpf' | 'cnpj' {
  const limpo = normalizarCpfCnpj(valor)
  if (!limpo) return ''
  if (limpo.length === 11 && /^\d+$/.test(limpo)) return validarCPF(limpo) ? 'cpf' : 'invalido'
  if (limpo.length === 14) return validarCNPJ(limpo) ? 'cnpj' : 'invalido'
  if (limpo.length < 14) return 'incompleto'
  return 'invalido'
}

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
  const [cpfCnpjCupom, setCpfCnpjCupom] = useState(mascararDocumento(cpfCnpjAtual))
  const [clienteDoDocumento, setClienteDoDocumento] = useState<Cliente | null>(null)
  const [tentouConfirmar, setTentouConfirmar] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selecionado, setSelecionado] = useState<Cliente | null>(clienteAtual)
  const [carregando, setCarregando] = useState(false)
  const [erroBusca, setErroBusca] = useState('')
  const assinanteId = useAssinanteId()
  const [modalNovoClienteAberto, setModalNovoClienteAberto] = useState(false)
  const inputBuscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setBusca('')
      setCpfCnpjCupom(mascararDocumento(cpfCnpjAtual || ''))
      setSelecionado(clienteAtual)
      setClienteDoDocumento(null)
      setTentouConfirmar(false)
      setTimeout(() => {
        inputBuscaRef.current?.focus()
      }, 100)
    }
  }, [aberto, clienteAtual, cpfCnpjAtual])

  // Busca automática enquanto digita (sem precisar clicar em Buscar)
  useEffect(() => {
    if (!aberto) return
    const timer = setTimeout(() => {
      carregarClientes(busca)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, aberto, assinanteId])

  const situacaoDoc = situacaoDocumento(cpfCnpjCupom)
  const documentoOk = situacaoDoc === '' || situacaoDoc === 'cpf' || situacaoDoc === 'cnpj'

  // CPF/CNPJ válido digitado: procura se já existe cliente cadastrado com esse documento
  useEffect(() => {
    setClienteDoDocumento(null)
    if (!aberto || (situacaoDoc !== 'cpf' && situacaoDoc !== 'cnpj')) return
    let ativo = true
    const doc = normalizarCpfCnpj(cpfCnpjCupom)
    buscarClientePorCpfCnpj(doc, undefined, assinanteId || undefined).then((r) => {
      if (ativo && r.ativo && selecionado?.id !== r.ativo.id) setClienteDoDocumento(r.ativo)
    })
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfCnpjCupom, aberto, assinanteId])

  const carregarClientes = async (termo: string) => {
    setCarregando(true)
    setErroBusca('')
    try {
      // Busca no servidor por nome, fantasia, CPF/CNPJ (com ou sem pontuação), código,
      // telefone, celular, e-mail e município
      const res = await listarClientes({
        situacao: 'ativos',
        busca: termo.trim(),
        porPagina: 30,
        ordenarPor: 'nome_razao_social',
        ordem: 'asc',
        assinante_id: assinanteId || undefined,
      })
      // Esconde da lista o cadastro genérico "Consumidor Final" (sem documento):
      // ele já é representado pela opção "Consumidor Final (Padrão Balcão)" acima,
      // que resolve para esse mesmo cadastro ao finalizar.
      setClientes(
        res.items.filter(
          (c) =>
            !(
              c.consumidor_final ||
              (c.nome_razao_social?.trim().toLowerCase() === 'consumidor final' && !c.cpf_cnpj)
            ),
        ),
      )
    } catch (err: any) {
      console.warn('Erro ao carregar clientes:', err)
      setClientes([])
      setErroBusca(
        'Não foi possível buscar clientes' +
          (err?.status ? ` (erro ${err.status})` : '') +
          '. Tente de novo ou avise o administrador.',
      )
    } finally {
      setCarregando(false)
    }
  }

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault()
    carregarClientes(busca)
  }

  const handleSalvar = () => {
    if (!documentoOk) {
      setTentouConfirmar(true)
      return
    }
    onConfirmar(selecionado, normalizarCpfCnpj(cpfCnpjCupom))
    onOpenChange(false)
  }

  const escolherCliente = (c: Cliente) => {
    setSelecionado(c)
    setClienteDoDocumento(null)
    // O documento do cupom passa a ser o do cliente escolhido (evita cupom com CPF de outra pessoa)
    setCpfCnpjCupom(c.cpf_cnpj ? mascararDocumento(c.cpf_cnpj) : '')
  }

  const handleNovoClienteCriado = (novo: Cliente) => {
    escolherCliente(novo)
    setModalNovoClienteAberto(false)
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200 p-6">
          <DialogHeader className="border-b border-slate-200 pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Identificar Cliente / Consumidor (F3)
              </DialogTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setModalNovoClienteAberto(true)}
                className="h-7 text-xs text-blue-600 border-slate-300 hover:bg-slate-100 gap-1"
              >
                <Plus size={14} />
                Cadastro Rápido
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* CPF/CNPJ direto no cupom (não cadastrado) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                CPF ou CNPJ para Impressão no Cupom (Consumidor Não Cadastrado)
              </Label>
              <Input
                placeholder="Digite apenas números (opcional)..."
                value={cpfCnpjCupom}
                inputMode="numeric"
                maxLength={18}
                onChange={(e) => {
                  setCpfCnpjCupom(mascararDocumento(e.target.value))
                  setTentouConfirmar(false)
                }}
                className={`h-9 bg-white text-slate-900 font-mono text-sm ${
                  situacaoDoc === 'invalido' || (tentouConfirmar && !documentoOk)
                    ? 'border-red-500 focus-visible:ring-red-500'
                    : situacaoDoc === 'cpf' || situacaoDoc === 'cnpj'
                      ? 'border-emerald-500'
                      : 'border-slate-300'
                }`}
              />
              {situacaoDoc === 'invalido' && (
                <p className="text-[11px] font-semibold text-red-600">
                  CPF/CNPJ inválido: confira os números digitados.
                </p>
              )}
              {situacaoDoc === 'incompleto' && (
                <p
                  className={`text-[11px] ${
                    tentouConfirmar ? 'font-semibold text-red-600' : 'text-slate-500'
                  }`}
                >
                  Documento incompleto: CPF tem 11 números e CNPJ tem 14.
                </p>
              )}
              {(situacaoDoc === 'cpf' || situacaoDoc === 'cnpj') && !clienteDoDocumento && (
                <p className="text-[11px] text-emerald-700">
                  {situacaoDoc === 'cpf' ? 'CPF válido.' : 'CNPJ válido.'}
                </p>
              )}
              {clienteDoDocumento && (
                <div className="flex items-center justify-between gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
                  <span className="min-w-0 truncate">
                    Cliente cadastrado com este documento:{' '}
                    <strong>
                      {clienteDoDocumento.codigo ? `#${clienteDoDocumento.codigo} ` : ''}
                      {clienteDoDocumento.nome_razao_social}
                    </strong>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => escolherCliente(clienteDoDocumento)}
                    className="h-6 shrink-0 bg-blue-600 px-2 text-[11px] text-white hover:bg-blue-700"
                  >
                    Vincular
                  </Button>
                </div>
              )}
              {situacaoDoc === '' && (
                <p className="text-[11px] text-slate-500">
                  Útil para cupom fiscal/comprovante rápido sem necessidade de cadastro completo.
                </p>
              )}
            </div>

            {/* Busca de Cliente Cadastrado */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Ou vincular Cliente Cadastrado (Obrigatório para Crediário)
              </Label>
              <form onSubmit={handleBuscar} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    ref={inputBuscaRef}
                    placeholder="Buscar por nome, CPF/CNPJ, código ou telefone..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-9 pl-9 bg-white border-slate-300 text-slate-900 text-xs"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4"
                >
                  Buscar
                </Button>
              </form>

              <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-1 bg-slate-50">
                {/* Opção Consumidor Final Padrão */}
                <div
                  onClick={() => setSelecionado(null)}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs ${
                    selecionado === null
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-slate-100 text-slate-700'
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

                {carregando && <div className="p-2 text-[11px] text-slate-500">Buscando...</div>}
                {!carregando && erroBusca && (
                  <div className="p-2 text-[11px] text-red-600">{erroBusca}</div>
                )}
                {!carregando && !erroBusca && busca.trim() && clientes.length === 0 && (
                  <div className="p-2 text-[11px] text-slate-500">
                    Nenhum cliente encontrado para "{busca.trim()}".
                  </div>
                )}
                {clientes.map((c) => {
                  const ativo = selecionado?.id === c.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => escolherCliente(c)}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs ${
                        ativo
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {c.codigo ? `#${c.codigo} ` : ''}
                          {c.nome_razao_social}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {c.cpf_cnpj ? `Doc: ${mascararDocumento(c.cpf_cnpj)}` : ''}{' '}
                          {c.telefone || c.celular ? `| Fone: ${c.telefone || c.celular}` : ''}
                          {c.municipio ? ` | ${c.municipio}${c.uf ? '/' + c.uf : ''}` : ''}
                        </div>
                      </div>
                      {ativo && <Check size={16} className="text-white shrink-0 ml-2" />}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 pt-3 flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancelar (Esc)
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvar}
              disabled={situacaoDoc === 'invalido'}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5"
            >
              Confirmar Cliente (Enter)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalNovoClienteAberto && (
        <ClienteCadastroRapido
          aberto={modalNovoClienteAberto}
          onOpenChange={(ab) => setModalNovoClienteAberto(ab)}
          onSucesso={handleNovoClienteCriado}
        />
      )}
    </>
  )
}
