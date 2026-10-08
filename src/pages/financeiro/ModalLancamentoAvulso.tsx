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
import { PlanoConta, listarTodasContasPlano } from '@/services/planoContas'
import { CentroCusto, listarTodosCentrosCustoAtivos } from '@/services/centrosCusto'
import { TipoMovimentoBancario, lancarAvulso } from '@/services/movimentacoesExtratos'
import { toast } from '@/hooks/use-toast'
import { PlusCircle } from 'lucide-react'

interface ModalLancamentoAvulsoProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  contaPreDefinidaId?: string
  dadosIniciais?: {
    contaId?: string
    data?: string
    tipo?: TipoMovimentoBancario
    valor?: number
    historico?: string
    linhaExtratoId?: string
  }
  onSucesso?: (novoMovimentoId?: string) => void
}

export const ModalLancamentoAvulso: React.FC<ModalLancamentoAvulsoProps> = ({
  aberto,
  onOpenChange,
  contaPreDefinidaId,
  dadosIniciais,
  onSucesso,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [planosContas, setPlanosContas] = useState<PlanoConta[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])

  const [contaId, setContaId] = useState<string>('')
  const [tipo, setTipo] = useState<TipoMovimentoBancario>('Saída')
  const [data, setData] = useState<string>(new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState<string>('')
  const [planoContaId, setPlanoContaId] = useState<string>('')
  const [centroCustoId, setCentroCustoId] = useState<string>('')
  const [historico, setHistorico] = useState<string>('')
  const [salvando, setSalvando] = useState<boolean>(false)

  useEffect(() => {
    if (aberto && empresaAtiva?.id) {
      Promise.all([
        listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }),
        listarTodasContasPlano({ empresa_id: empresaAtiva.id, apenasAnaliticas: true }),
        listarTodosCentrosCustoAtivos(empresaAtiva.id),
      ]).then(([resContas, resPlanos, resCentros]) => {
        setContas(resContas)
        setPlanosContas(resPlanos)
        setCentrosCusto(resCentros)

        // Preenchimento inicial
        const cId = dadosIniciais?.contaId || contaPreDefinidaId || (resContas[0]?.id ?? '')
        setContaId(cId)

        if (dadosIniciais?.tipo) {
          setTipo(dadosIniciais.tipo)
        } else {
          setTipo('Saída')
        }

        if (dadosIniciais?.data) {
          setData(dadosIniciais.data)
        } else {
          setData(new Date().toISOString().slice(0, 10))
        }

        if (dadosIniciais?.valor !== undefined) {
          setValor(Math.abs(dadosIniciais.valor).toString())
        } else {
          setValor('')
        }

        if (dadosIniciais?.historico) {
          setHistorico(dadosIniciais.historico)
        } else {
          setHistorico('')
        }

        if (resPlanos.length > 0) {
          setPlanoContaId(resPlanos[0].id)
        }
      })
    }
  }, [aberto, empresaAtiva?.id, contaPreDefinidaId, dadosIniciais])

  const contaAtual = contas.find((c) => c.id === contaId)

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

    if (!contaId) {
      toast({
        title: 'Conta obrigatória',
        description: 'Selecione a conta bancária ou caixa.',
        variant: 'destructive',
      })
      return
    }

    if (!planoContaId) {
      toast({
        title: 'Plano de contas obrigatório',
        description: 'Selecione uma conta analítica do plano de contas.',
        variant: 'destructive',
      })
      return
    }

    if (!historico.trim()) {
      toast({
        title: 'Histórico obrigatório',
        description: 'Informe o histórico / descrição do lançamento.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      const res = await lancarAvulso({
        empresa_id: empresaAtiva.id,
        conta_financeira_id: contaId,
        data,
        tipo,
        valor: valorNum,
        plano_conta_id: planoContaId,
        centro_custo_id: centroCustoId || undefined,
        historico: historico.trim(),
      })

      toast({
        title: 'Lançamento registrado',
        description: `${tipo} de R$ ${valorNum.toFixed(2)} lançada com sucesso.`,
      })

      onOpenChange(false)
      onSucesso?.(res.movimento.id)
    } catch (err: any) {
      toast({
        title: 'Erro no lançamento',
        description: err?.message || 'Falha ao registrar lançamento avulso.',
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
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            Lançamento Avulso (Bancos / Caixas)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Registre tarifas bancárias, rendimentos, retiradas/aportes de sócios ou despesas
            diretas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Conta Financeira *</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione a conta..." />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} (R$ {Number(c.saldo_atual || 0).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contaAtual && (
                <p className="text-[11px] text-slate-500">
                  Saldo atual: R$ {Number(contaAtual.saldo_atual || 0).toFixed(2)}
                  {!contaAtual.permite_saldo_negativo && ' • Bloqueia negativo'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Tipo de Lançamento *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimentoBancario)}>
                <SelectTrigger className="text-xs h-9 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entrada" className="text-emerald-700 font-semibold">
                    Entrada (Crédito)
                  </SelectItem>
                  <SelectItem value="Saída" className="text-rose-700 font-semibold">
                    Saída (Débito)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="data_avu" className="text-xs font-semibold text-slate-700">
                Data do Lançamento *
              </Label>
              <Input
                id="data_avu"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="valor_avu" className="text-xs font-semibold text-slate-700">
                Valor (R$) *
              </Label>
              <Input
                id="valor_avu"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-xs h-9 font-mono font-medium"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Plano de Contas (Analítica) *
              </Label>
              <Select value={planoContaId} onValueChange={setPlanoContaId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione a conta analítica..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {planosContas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} - {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Centro de Custo (Opcional)
              </Label>
              <Select
                value={centroCustoId || 'nenhum'}
                onValueChange={(v) => setCentroCustoId(v === 'nenhum' ? '' : v)}
              >
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Nenhum centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {centrosCusto.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.codigo} - {cc.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="hist_avu" className="text-xs font-semibold text-slate-700">
              Histórico / Descrição *
            </Label>
            <Textarea
              id="hist_avu"
              placeholder="Ex: Tarifa de manutenção de conta, rendimento de CDB, saque de caixa..."
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              className="text-xs min-h-[70px]"
              required
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
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {salvando ? 'Salvando...' : 'Gravar Lançamento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
