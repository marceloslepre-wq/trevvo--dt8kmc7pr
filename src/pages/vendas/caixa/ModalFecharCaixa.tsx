import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Coins, FileDown, Info, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import {
  fecharSessaoCaixa,
  apurarDadosFechamento,
  listarMovimentosSessao,
  type CaixaSessao,
  type ResumoApuracaoFechamento,
  type CaixaSessaoMovimento,
} from '@/services/caixa'
import { obterOuCriarConfigVendasEmpresa } from '@/services/configVendas'
import { imprimirRelatorioFechamentoPdf } from '@/services/caixaImpressao'
import { useToast } from '@/hooks/use-toast'

interface ModalFecharCaixaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessao: CaixaSessao
  empresaId: string
  empresaNome: string
  onSucesso: () => void
}

const CEDULAS_MOEDAS = [
  { label: 'R$ 200,00', valor: 200 },
  { label: 'R$ 100,00', valor: 100 },
  { label: 'R$ 50,00', valor: 50 },
  { label: 'R$ 20,00', valor: 20 },
  { label: 'R$ 10,00', valor: 10 },
  { label: 'R$ 5,00', valor: 5 },
  { label: 'R$ 2,00', valor: 2 },
  { label: 'R$ 1,00 (Moeda)', valor: 1 },
  { label: 'R$ 0,50 (Moeda)', valor: 0.5 },
  { label: 'R$ 0,25 (Moeda)', valor: 0.25 },
  { label: 'R$ 0,10 (Moeda)', valor: 0.1 },
  { label: 'R$ 0,05 (Moeda)', valor: 0.05 },
]

export function ModalFecharCaixa({
  open,
  onOpenChange,
  sessao,
  empresaId,
  empresaNome,
  onSucesso,
}: ModalFecharCaixaProps) {
  const { toast } = useToast()

  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [resumo, setResumo] = useState<ResumoApuracaoFechamento | null>(null)
  const [fechamentoCegoConfig, setFechamentoCegoConfig] = useState(true)

  // Flag se o operador já clicou em "Revelar Esperado" / submeteu contagem
  const [revelarValores, setRevelarValores] = useState(false)

  // Calculadora de cédulas/moedas
  const [mostrarCalculadoraCedulas, setMostrarCalculadoraCedulas] = useState(false)
  const [quantidadesCedulas, setQuantidadesCedulas] = useState<Record<number, number>>({})

  // Valores informados pelo operador
  const [dinheiroContadoStr, setDinheiroContadoStr] = useState('0,00')
  const [valoresInformadosFormas, setValoresInformadosFormas] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState('')

  // Sessão fechada com sucesso para exibir resumo e emitir PDF
  const [sessaoFechadaResultado, setSessaoFechadaResultado] = useState<CaixaSessao | null>(null)
  const [movimentosFechamento, setMovimentosFechamento] = useState<CaixaSessaoMovimento[]>([])

  // Carregar dados da apuração em tempo real e config_vendas_empresa
  useEffect(() => {
    if (!open || !sessao) return

    async function carregar() {
      setCarregando(true)
      try {
        const [dadosApurados, cfg] = await Promise.all([
          apurarDadosFechamento(sessao.id, Number(sessao.valor_abertura || 0)),
          obterOuCriarConfigVendasEmpresa(empresaId),
        ])

        setResumo(dadosApurados)
        const cego = cfg.fechamento_cego !== false
        setFechamentoCegoConfig(cego)
        setRevelarValores(!cego) // Se fechamento cego desligado, já mostra

        // Inicializar mapa de valores informados
        const inicial: Record<string, string> = {}
        for (const f of dadosApurados.formas) {
          if (
            f.tipo !== 'Dinheiro' &&
            f.codigo_tpag !== '01' &&
            !f.forma_descricao.toLowerCase().includes('dinheiro')
          ) {
            // Se cego desligado, pode pré-preencher ou começar vazio
            inicial[f.forma_id] = !cego
              ? (f.valor_esperado || 0).toFixed(2).replace('.', ',')
              : '0,00'
          }
        }
        setValoresInformadosFormas(inicial)
        if (!cego) {
          setDinheiroContadoStr((dadosApurados.esperado_dinheiro || 0).toFixed(2).replace('.', ','))
        } else {
          setDinheiroContadoStr('0,00')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao apurar dados do caixa.'
        toast({ title: 'Erro', description: msg, variant: 'destructive' })
      } finally {
        setCarregando(false)
      }
    }

    carregar()
    setSessaoFechadaResultado(null)
    setQuantidadesCedulas({})
    setMostrarCalculadoraCedulas(false)
    setObservacao('')
  }, [open, sessao, empresaId, toast])

  // Totalizador da calculadora de cédulas
  const totalCedulasCalculadas = useMemo(() => {
    let tot = 0
    for (const item of CEDULAS_MOEDAS) {
      const qtd = quantidadesCedulas[item.valor] || 0
      tot += qtd * item.valor
    }
    return Number(tot.toFixed(2))
  }, [quantidadesCedulas])

  function aplicarCalculadoraAoDinheiro() {
    setDinheiroContadoStr(
      totalCedulasCalculadas.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    )
    setMostrarCalculadoraCedulas(false)
  }

  const dinheiroContadoNum =
    parseFloat(dinheiroContadoStr.replace(/\./g, '').replace(',', '.')) || 0

  const diferencaDinheiroCalculada = resumo
    ? Number((dinheiroContadoNum - resumo.esperado_dinheiro).toFixed(2))
    : 0

  async function handleConfirmarFechamento(e: React.FormEvent) {
    e.preventDefault()
    if (!resumo) return

    // Se estiver em modo cego e o operador ainda não tiver clicado para conferir antes de salvar,
    // permitimos que ele visualize os números antes de confirmar definitivamente ou feche direto
    setSalvando(true)
    try {
      const arrayInformados: Array<{ forma_id: string; valor_informado: number }> = []

      // Formas não-dinheiro
      for (const f of resumo.formas) {
        if (
          f.tipo !== 'Dinheiro' &&
          f.codigo_tpag !== '01' &&
          !f.forma_descricao.toLowerCase().includes('dinheiro')
        ) {
          const strVal = valoresInformadosFormas[f.forma_id] || '0'
          const numVal = parseFloat(strVal.replace(/\./g, '').replace(',', '.')) || 0
          arrayInformados.push({
            forma_id: f.forma_id,
            valor_informado: numVal,
          })
        }
      }

      const fechada = await fecharSessaoCaixa({
        caixa_sessao_id: sessao.id,
        valor_contado_dinheiro: dinheiroContadoNum,
        totais_informados_formas: arrayInformados,
        observacao_fechamento: observacao.trim() || undefined,
      })

      // Buscar movimentos para o relatório PDF
      const movs = await listarMovimentosSessao(sessao.id)
      setMovimentosFechamento(movs)

      setSessaoFechadaResultado(fechada)
      toast({
        title: 'Caixa fechado com sucesso!',
        description: `Sessão #${sessao.id.slice(-6)} finalizada. Diferença no dinheiro: R$ ${fechada.diferenca_dinheiro?.toFixed(2) || '0,00'}.`,
      })
      onSucesso()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao fechar caixa.'
      toast({ title: 'Falha no fechamento', description: msg, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  function handleImprimirRelatorioFechamento() {
    if (!sessaoFechadaResultado) return
    imprimirRelatorioFechamentoPdf({
      sessao: sessaoFechadaResultado,
      movimentos: movimentosFechamento,
      empresaNome: empresaNome,
      terminalNome: sessao.expand?.pdv_terminal_id?.nome || 'Terminal',
      operadorNome: sessao.expand?.operador_id?.nome || 'Operador',
    })
  }

  // TELA PÓS-FECHAMENTO
  if (sessaoFechadaResultado) {
    const difDinheiro = Number(sessaoFechadaResultado.diferenca_dinheiro || 0)
    const semDif = Math.abs(difDinheiro) < 0.01

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Sessão de Caixa Fechada com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O caixa foi encerrado e os lançamentos de ajuste foram consolidados no financeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border rounded-lg text-center">
                <span className="text-[11px] text-slate-500 uppercase font-semibold block">
                  Esperado em Dinheiro
                </span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  R$ {(sessaoFechadaResultado.valor_esperado_dinheiro || 0).toFixed(2)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border rounded-lg text-center">
                <span className="text-[11px] text-slate-500 uppercase font-semibold block">
                  Contado pelo Operador
                </span>
                <span className="text-lg font-bold font-mono text-slate-900">
                  R$ {(sessaoFechadaResultado.valor_contado_dinheiro || 0).toFixed(2)}
                </span>
              </div>
              <div
                className={`p-3 border rounded-lg text-center ${
                  semDif
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : difDinheiro < 0
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <span className="text-[11px] uppercase font-semibold block">
                  {semDif
                    ? 'Diferença: Exato'
                    : difDinheiro < 0
                      ? 'Quebra (Falta)'
                      : 'Sobra de Caixa'}
                </span>
                <span className="text-lg font-bold font-mono">
                  R$ {Math.abs(difDinheiro).toFixed(2)}{' '}
                  {difDinheiro < 0 ? '(-)' : difDinheiro > 0 ? '(+)' : ''}
                </span>
              </div>
            </div>

            {/* Alerta de lançamento avulso automático */}
            {!semDif && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  Um lançamento avulso de{' '}
                  {difDinheiro < 0 ? 'saída (quebra de caixa)' : 'entrada (sobra de caixa)'} no
                  valor de <strong>R$ {Math.abs(difDinheiro).toFixed(2)}</strong> foi gerado na
                  conta do terminal para ajustar o saldo contábil.
                </span>
              </div>
            )}

            <div className="p-3 bg-slate-50 border rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Total de Vendas Finalizadas:</span>
                <span className="font-semibold">
                  {sessaoFechadaResultado.quantidade_vendas || 0} venda(s) — R${' '}
                  {(sessaoFechadaResultado.valor_vendas || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Sangrias / Suprimentos:</span>
                <span>
                  - R$ {(sessaoFechadaResultado.valor_sangrias || 0).toFixed(2)} / + R${' '}
                  {(sessaoFechadaResultado.valor_suprimentos || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImprimirRelatorioFechamento}
              className="text-sky-700 border-sky-200 hover:bg-sky-50"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Imprimir Relatório de Fechamento (PDF)
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // TELA DE CONTAGEM E FECHAMENTO
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            Fechamento de Caixa — Sessão #{sessao.id.slice(-6)}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Terminal: <strong>{sessao.expand?.pdv_terminal_id?.nome || 'Terminal'}</strong> |
            Operador: <strong>{sessao.expand?.operador_id?.nome || 'Operador'}</strong>
          </DialogDescription>
        </DialogHeader>

        {carregando || !resumo ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Apurando totais da sessão e vendas...
          </div>
        ) : (
          <form onSubmit={handleConfirmarFechamento} className="space-y-4 py-2 text-xs">
            {/* Aviso do Fechamento às Cegas */}
            {fechamentoCegoConfig && !revelarValores && (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-amber-900">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold block">Fechamento "Às Cegas" Ativo</span>
                    <span className="text-[11px] text-amber-800 block">
                      Conte o dinheiro físico e digite os valores dos comprovantes primeiro.
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevelarValores(true)}
                  className="text-xs h-7 border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Revelar Esperado
                </Button>
              </div>
            )}

            {/* SEÇÃO 1: CONTAGEM DE DINHEIRO */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 text-sm">1. Numerário em Dinheiro</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarCalculadoraCedulas(!mostrarCalculadoraCedulas)}
                  className="text-xs h-7 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  <Coins className="h-3.5 w-3.5 mr-1" />
                  {mostrarCalculadoraCedulas ? 'Ocultar Cédulas' : 'Contagem por Cédulas/Moedas'}
                </Button>
              </div>

              {/* Calculadora por cédulas */}
              {mostrarCalculadoraCedulas && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <div className="text-[11px] text-slate-600 font-semibold uppercase">
                    Informe a quantidade de cada cédula e moeda:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CEDULAS_MOEDAS.map((item) => (
                      <div key={item.valor} className="space-y-1">
                        <Label className="text-[11px] text-slate-600">{item.label}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={quantidadesCedulas[item.valor] || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0
                            setQuantidadesCedulas((prev) => ({
                              ...prev,
                              [item.valor]: val,
                            }))
                          }}
                          placeholder="0"
                          className="h-7 text-xs font-mono text-center"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-700 font-medium">
                      Subtotal Calculado: <strong>R$ {totalCedulasCalculadas.toFixed(2)}</strong>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={aplicarCalculadoraAoDinheiro}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                    >
                      Aplicar ao Dinheiro Contado
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label
                    htmlFor="dinheiro_contado"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Dinheiro Contado pelo Operador *
                  </Label>
                  <Input
                    id="dinheiro_contado"
                    value={dinheiroContadoStr}
                    onChange={(e) => setDinheiroContadoStr(e.target.value)}
                    onBlur={() => {
                      setDinheiroContadoStr(
                        dinheiroContadoNum.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      )
                    }}
                    placeholder="0,00"
                    className="text-base font-mono font-bold text-slate-900 h-10"
                    required
                  />
                </div>

                {revelarValores && (
                  <>
                    <div className="p-2.5 bg-slate-50 border rounded-lg text-center">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                        Saldo Esperado (Sistema)
                      </span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        R$ {resumo.esperado_dinheiro.toFixed(2)}
                      </span>
                    </div>

                    <div
                      className={`p-2.5 border rounded-lg text-center ${
                        Math.abs(diferencaDinheiroCalculada) < 0.01
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : diferencaDinheiroCalculada < 0
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-semibold block">
                        {Math.abs(diferencaDinheiroCalculada) < 0.01
                          ? 'Diferença: Exato'
                          : diferencaDinheiroCalculada < 0
                            ? 'Falta / Quebra'
                            : 'Sobra de Caixa'}
                      </span>
                      <span className="text-sm font-bold font-mono">
                        R$ {Math.abs(diferencaDinheiroCalculada).toFixed(2)}{' '}
                        {diferencaDinheiroCalculada < 0
                          ? '(-)'
                          : diferencaDinheiroCalculada > 0
                            ? '(+)'
                            : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SEÇÃO 2: DEMAIS FORMAS DE PAGAMENTO */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <span className="font-bold text-slate-900 text-sm block border-b border-slate-100 pb-2">
                2. Conferência de Outras Formas (Cartões, PIX, Comprovantes)
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b">
                    <tr>
                      <th className="py-2 px-3 text-left">Forma de Pagamento</th>
                      <th className="py-2 px-3 text-center">Vendas</th>
                      {revelarValores && <th className="py-2 px-3 text-right">Valor Esperado</th>}
                      <th className="py-2 px-3 text-right w-36">Valor Informado (R$)</th>
                      {revelarValores && <th className="py-2 px-3 text-right">Diferença</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumo.formas
                      .filter(
                        (f) =>
                          f.tipo !== 'Dinheiro' &&
                          f.codigo_tpag !== '01' &&
                          !f.forma_descricao.toLowerCase().includes('dinheiro'),
                      )
                      .map((forma) => {
                        const infStr = valoresInformadosFormas[forma.forma_id] || '0,00'
                        const infNum = parseFloat(infStr.replace(/\./g, '').replace(',', '.')) || 0
                        const dif = Number((infNum - forma.valor_esperado).toFixed(2))

                        return (
                          <tr key={forma.forma_id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {forma.forma_descricao}
                              <span className="text-[10px] text-slate-400 block font-normal">
                                {forma.tipo || 'Outros'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              {forma.quantidade_vendas}
                            </td>
                            {revelarValores && (
                              <td className="py-2 px-3 text-right font-mono font-medium text-slate-700">
                                R$ {forma.valor_esperado.toFixed(2)}
                              </td>
                            )}
                            <td className="py-2 px-3 text-right">
                              <Input
                                value={infStr}
                                onChange={(e) =>
                                  setValoresInformadosFormas((prev) => ({
                                    ...prev,
                                    [forma.forma_id]: e.target.value,
                                  }))
                                }
                                onBlur={() => {
                                  setValoresInformadosFormas((prev) => ({
                                    ...prev,
                                    [forma.forma_id]: infNum.toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }),
                                  }))
                                }}
                                className="h-7 text-xs font-mono text-right w-32 ml-auto"
                                placeholder="0,00"
                              />
                            </td>
                            {revelarValores && (
                              <td
                                className={`py-2 px-3 text-right font-mono font-semibold ${
                                  Math.abs(dif) < 0.01
                                    ? 'text-emerald-700'
                                    : dif < 0
                                      ? 'text-rose-700'
                                      : 'text-blue-700'
                                }`}
                              >
                                R$ {dif.toFixed(2)}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SEÇÃO 3: OBSERVAÇÕES */}
            <div className="space-y-1.5">
              <Label htmlFor="obs_fechamento" className="text-xs font-semibold text-slate-700">
                Observações do Fechamento
              </Label>
              <Input
                id="obs_fechamento"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Turno encerrado normalmente / justificar diferenças..."
                className="text-xs h-9"
              />
            </div>

            {/* Alerta de encerramento definitivo */}
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>Atenção:</strong> Uma vez fechada, esta sessão não poderá ser reaberta.
                Faltas de caixa serão debitadas como quebra de caixa e sobras serão creditadas
                automaticamente.
              </span>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {salvando ? 'Fechando Caixa...' : 'Confirmar Fechamento'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
