import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fecharSessaoCaixa,
  apurarDadosFechamento,
  type CaixaSessao,
  type ResumoApuracaoFechamento,
} from '@/services/caixa'
import { formatarMoedaBrl } from './formatadoresMovel'

type Props = {
  sessao: CaixaSessao
  aoFechar: () => void
  /** Chamado após o fechamento bem-sucedido, com a diferença apurada. */
  aoSucesso: (diferencaDinheiro: number) => void
}

function parseValor(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
}

/**
 * Fechamento de caixa em tela cheia do Trevvo Móvel.
 * Usa as MESMAS funções do PDV (apurarDadosFechamento + fecharSessaoCaixa),
 * apenas adaptando a apresentação à estrutura do MovelLayout.
 */
export default function TelaFecharCaixaMovel({ sessao, aoFechar, aoSucesso }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [resumo, setResumo] = useState<ResumoApuracaoFechamento | null>(null)

  const [dinheiroContadoStr, setDinheiroContadoStr] = useState('0,00')
  const [valoresFormas, setValoresFormas] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState('')

  // Formas não-dinheiro da sessão (mesma regra do ModalFecharCaixa)
  const formasNaoDinheiro = useMemo(() => {
    if (!resumo) return []
    return resumo.formas.filter(
      (f) =>
        f.tipo !== 'Dinheiro' &&
        f.codigo_tpag !== '01' &&
        !f.forma_descricao.toLowerCase().includes('dinheiro'),
    )
  }, [resumo])

  const dinheiroContado = parseValor(dinheiroContadoStr)

  // Derivados — useMemo, sem efeito que leia e grave o mesmo estado
  const diferencaDinheiro = useMemo(
    () => (resumo ? Number((dinheiroContado - resumo.esperado_dinheiro).toFixed(2)) : 0),
    [dinheiroContado, resumo],
  )

  const totalInformadoFormas = useMemo(() => {
    if (!resumo) return 0
    let total = 0
    for (const f of formasNaoDinheiro) {
      total += parseValor(valoresFormas[f.forma_id] || '0')
    }
    return Number(total.toFixed(2))
  }, [resumo, formasNaoDinheiro, valoresFormas])

  const diferencaFormas = useMemo(() => {
    if (!resumo) return 0
    let esperado = 0
    for (const f of formasNaoDinheiro) esperado += f.valor_esperado
    return Number((totalInformadoFormas - esperado).toFixed(2))
  }, [resumo, formasNaoDinheiro, totalInformadoFormas])

  // Carrega a apuração UMA vez ao montar (mesmos serviços do PDV)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const dados = await apurarDadosFechamento(sessao.id, Number(sessao.valor_abertura || 0))
        if (!vivo) return
        setResumo(dados)
        const inicial: Record<string, string> = {}
        for (const f of dados.formas) {
          if (
            f.tipo !== 'Dinheiro' &&
            f.codigo_tpag !== '01' &&
            !f.forma_descricao.toLowerCase().includes('dinheiro')
          ) {
            inicial[f.forma_id] = (f.valor_esperado || 0).toFixed(2).replace('.', ',')
          }
        }
        setValoresFormas(inicial)
        setDinheiroContadoStr((dados.esperado_dinheiro || 0).toFixed(2).replace('.', ','))
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao apurar os dados do caixa.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [sessao.id, sessao.valor_abertura])

  async function handleConfirmar() {
    if (!resumo || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const arrayInformados = formasNaoDinheiro.map((f) => ({
        forma_id: f.forma_id,
        valor_informado: parseValor(valoresFormas[f.forma_id] || '0'),
      }))
      const fechada = await fecharSessaoCaixa({
        caixa_sessao_id: sessao.id,
        valor_contado_dinheiro: dinheiroContado,
        totais_informados_formas: arrayInformados,
        observacao_fechamento: observacao.trim() || undefined,
      })
      aoSucesso(Number(fechada.diferenca_dinheiro || 0))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao fechar o caixa.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* Cabeçalho fino */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">Fechar caixa</p>
          <p className="truncate text-[11px] text-slate-500">Sessão #{sessao.id.slice(-6)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 shrink-0 px-3 text-sm"
          onClick={aoFechar}
          disabled={salvando}
        >
          Cancelar
        </Button>
      </div>

      {/* Conteúdo rolável */}
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {carregando ? (
          <p className="py-10 text-center text-sm text-slate-500">Apurando totais da sessão...</p>
        ) : erro && !resumo ? (
          <p className="py-10 text-center text-sm text-red-600">{erro}</p>
        ) : resumo ? (
          <div className="space-y-4">
            {erro && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {erro}
              </p>
            )}

            {/* Dinheiro */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Dinheiro contado</p>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="movel-dinheiro-contado" className="text-xs text-slate-600">
                    Valor contado (R$)
                  </Label>
                  <Input
                    id="movel-dinheiro-contado"
                    inputMode="decimal"
                    value={dinheiroContadoStr}
                    onChange={(e) => setDinheiroContadoStr(e.target.value)}
                    className="mt-1 h-12 text-base font-mono font-semibold"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-600">Esperado no sistema</span>
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {formatarMoedaBrl(resumo.esperado_dinheiro)}
                  </span>
                </div>
                <div
                  className={
                    'flex items-center justify-between rounded-lg px-3 py-2 ' +
                    (Math.abs(diferencaDinheiro) < 0.01
                      ? 'bg-emerald-50 text-emerald-800'
                      : diferencaDinheiro < 0
                        ? 'bg-red-50 text-red-800'
                        : 'bg-blue-50 text-blue-800')
                  }
                >
                  <span className="text-xs font-medium">
                    {Math.abs(diferencaDinheiro) < 0.01
                      ? 'Diferença: exato'
                      : diferencaDinheiro < 0
                        ? 'Falta / quebra'
                        : 'Sobra de caixa'}
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {formatarMoedaBrl(Math.abs(diferencaDinheiro))}
                    {diferencaDinheiro < 0 ? ' (-)' : diferencaDinheiro > 0 ? ' (+)' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Demais formas */}
            {formasNaoDinheiro.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">
                  Outras formas de pagamento
                </p>
                <div className="space-y-2">
                  {formasNaoDinheiro.map((f) => {
                    const infStr = valoresFormas[f.forma_id] || '0,00'
                    const infNum = parseValor(infStr)
                    const dif = Number((infNum - f.valor_esperado).toFixed(2))
                    return (
                      <div
                        key={f.forma_id}
                        className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                            {f.forma_descricao}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            Esperado {formatarMoedaBrl(f.valor_esperado)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Input
                            inputMode="decimal"
                            value={infStr}
                            onChange={(e) =>
                              setValoresFormas((prev) => ({
                                ...prev,
                                [f.forma_id]: e.target.value,
                              }))
                            }
                            className="h-10 flex-1 font-mono text-sm"
                            aria-label={`Valor informado de ${f.forma_descricao}`}
                          />
                          <span
                            className={
                              'w-24 shrink-0 text-right font-mono text-xs font-semibold ' +
                              (Math.abs(dif) < 0.01
                                ? 'text-emerald-700'
                                : dif < 0
                                  ? 'text-red-700'
                                  : 'text-blue-700')
                            }
                          >
                            {formatarMoedaBrl(dif)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-600">Diferença das formas</span>
                    <span
                      className={
                        'font-mono text-sm font-semibold ' +
                        (Math.abs(diferencaFormas) < 0.01 ? 'text-emerald-700' : 'text-amber-700')
                      }
                    >
                      {formatarMoedaBrl(diferencaFormas)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Observação */}
            <div>
              <Label htmlFor="movel-obs-fechamento" className="text-xs text-slate-600">
                Observações
              </Label>
              <Input
                id="movel-obs-fechamento"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: turno encerrado normalmente"
                className="mt-1 h-10 text-sm"
              />
            </div>

            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-900">
              Atenção: uma vez fechada, esta sessão não poderá ser reaberta. Quebras e sobras são
              lançadas automaticamente no financeiro.
            </p>
          </div>
        ) : null}
      </div>

      {/* Rodapé fixo */}
      <div className="shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          className="h-12 w-full text-base font-semibold"
          onClick={() => void handleConfirmar()}
          disabled={carregando || salvando || !resumo}
        >
          {salvando ? 'Fechando caixa...' : 'Confirmar fechamento'}
        </Button>
      </div>
    </div>
  )
}
