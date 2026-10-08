import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { transferir } from '@/services/movimentacoesExtratos'
import { toast } from '@/hooks/use-toast'
import { ArrowLeftRight } from 'lucide-react'

interface ModalTransferenciaContasProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  contaOrigemPreDefinidaId?: string
  onSucesso?: () => void
}

export const ModalTransferenciaContas: React.FC<ModalTransferenciaContasProps> = ({
  aberto,
  onOpenChange,
  contaOrigemPreDefinidaId,
  onSucesso,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [contaOrigemId, setContaOrigemId] = useState<string>('')
  const [contaDestinoId, setContaDestinoId] = useState<string>('')
  const [data, setData] = useState<string>(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState<string>('')
  const [historico, setHistorico] = useState<string>('')
  const [salvando, setSalvando] = useState<boolean>(false)

  useEffect(() => {
    if (aberto && empresaAtiva?.id) {
      listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }).then((res) => {
        setContas(res)
        if (contaOrigemPreDefinidaId) {
          setContaOrigemId(contaOrigemPreDefinidaId)
        } else if (res.length > 0) {
          setContaOrigemId(res[0].id)
        }
        if (res.length > 1) {
          const dest = res.find((c) => c.id !== (contaOrigemPreDefinidaId || res[0].id))
          if (dest) setContaDestinoId(dest.id)
        }
      })
      setData(new Date().toISOString().slice(0, 10))
      setValor('')
      setHistorico('')
    }
  }, [aberto, empresaAtiva?.id, contaOrigemPreDefinidaId])

  const contaOrigem = contas.find((c) => c.id === contaOrigemId)
  const contaDestino = contas.find((c) => c.id === contaDestinoId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresaAtiva?.id) return

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (!contaOrigemId || !contaDestinoId) {
      toast({
        title: 'Contas obrigatórias',
        description: 'Selecione a conta de origem e a conta de destino.',
        variant: 'destructive',
      })
      return
    }

    if (contaOrigemId === contaDestinoId) {
      toast({
        title: 'Contas iguais',
        description: 'A conta de origem e a conta de destino devem ser diferentes.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      await transferir({
        empresa_id: empresaAtiva.id,
        conta_origem_id: contaOrigemId,
        conta_destino_id: contaDestinoId,
        data,
        valor: valorNum,
        historico: historico.trim() || undefined,
      })

      toast({
        title: 'Transferência concluída',
        description: `R$ ${valorNum.toFixed(2)} transferidos com sucesso.`,
      })

      onOpenChange(false)
      onSucesso?.()
    } catch (err: any) {
      toast({
        title: 'Erro na transferência',
        description: err?.message || 'Falha ao realizar transferência entre contas.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Transferência entre Contas
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Transfira valores entre caixas físicos e contas bancárias da empresa ativa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Conta Origem (Saída) *</Label>
              <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} (R$ {Number(c.saldo_atual || 0).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contaOrigem && (
                <p className="text-[11px] text-slate-500">
                  Saldo: R$ {Number(contaOrigem.saldo_atual || 0).toFixed(2)}
                  {!contaOrigem.permite_saldo_negativo && ' • Não permite negativo'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Conta Destino (Entrada) *
              </Label>
              <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.id !== contaOrigemId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} (R$ {Number(c.saldo_atual || 0).toFixed(2)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {contaDestino && (
                <p className="text-[11px] text-slate-500">
                  Saldo atual: R$ {Number(contaDestino.saldo_atual || 0).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="data_trf" className="text-xs font-semibold text-slate-700">
                Data da Transferência *
              </Label>
              <Input
                id="data_trf"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="valor_trf" className="text-xs font-semibold text-slate-700">
                Valor (R$) *
              </Label>
              <Input
                id="valor_trf"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-xs h-9 font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="hist_trf" className="text-xs font-semibold text-slate-700">
              Histórico / Descrição
            </Label>
            <Textarea
              id="hist_trf"
              placeholder="Ex: Depósito do fechamento do caixa no banco, sangria, transferência para poupança..."
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              className="text-xs min-h-[70px]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={salvando}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {salvando ? 'Processando...' : 'Confirmar Transferência'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
