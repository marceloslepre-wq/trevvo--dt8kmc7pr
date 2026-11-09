import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileDown, Info, Loader2 } from 'lucide-react'
import {
  listarMovimentosSessao,
  apurarSessaoTempoReal,
  type CaixaSessao,
  type CaixaSessaoMovimento,
  type ResumoApuracaoFechamento,
  type TotalPorForma,
} from '@/services/caixa'
import { imprimirRelatorioFechamentoPdf } from '@/services/caixaImpressao'

interface ModalDetalhesSessaoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessao: CaixaSessao | null
  empresaNome: string
  onAbrirConferencia?: (sessao: CaixaSessao) => void
  podeConferir?: boolean
}

export function ModalDetalhesSessao({
  open,
  onOpenChange,
  sessao,
  empresaNome,
  onAbrirConferencia,
  podeConferir,
}: ModalDetalhesSessaoProps) {
  const [movimentos, setMovimentos] = useState<CaixaSessaoMovimento[]>([])
  const [carregando, setCarregando] = useState(false)
  const [apurado, setApurado] = useState<ResumoApuracaoFechamento | null>(null)

  const aberta = sessao?.status === 'Aberto'

  useEffect(() => {
    if (!open || !sessao) {
      setMovimentos([])
      setApurado(null)
      return
    }

    async function carregar() {
      if (!sessao) return
      setCarregando(true)
      try {
        const list = await listarMovimentosSessao(sessao.id)
        setMovimentos(list)
        if (sessao.status === 'Aberto') {
          const resumo = await apurarSessaoTempoReal(sessao.id, Number(sessao.valor_abertura || 0))
          setApurado(resumo)
        } else {
          setApurado(null)
        }
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [open, sessao])

  if (!sessao) return null

  let formasArr: TotalPorForma[] = []
  if (aberta && apurado) {
    // Sessão aberta: usa a apuração em tempo real (vendas + pagamentos)
    formasArr = apurado.formas.map((f) => ({
      forma_id: f.forma_id,
      forma_descricao: f.forma_descricao,
      codigo_tpag: f.codigo_tpag,
      tipo: f.tipo,
      quantidade_vendas: f.quantidade_vendas,
      valor_esperado: f.valor_esperado,
      valor_informado: 0,
      diferenca: 0,
    }))
  } else if (Array.isArray(sessao.totais_por_forma)) {
    formasArr = sessao.totais_por_forma
  } else if (typeof sessao.totais_por_forma === 'string') {
    try {
      formasArr = JSON.parse(sessao.totais_por_forma)
    } catch {
      formasArr = []
    }
  }

  // Diferença em dinheiro: na sessão aberta ainda não há conferência
  const difDinheiro = aberta ? 0 : Number(sessao.diferenca_dinheiro || 0)
  const temDiferenca = Math.abs(difDinheiro) >= 0.01

  // Números exibidos: na sessão aberta vêm da apuração em tempo real;
  // na fechada, dos campos gravados no fechamento
  const valorVendasExibido = aberta
    ? Number(apurado?.total_vendas ?? 0)
    : Number(sessao.valor_vendas || 0)
  const qtdVendasExibido = aberta
    ? Number(apurado?.quantidade_vendas ?? 0)
    : Number(sessao.quantidade_vendas || 0)
  const suprimentosExibido = aberta
    ? Number(apurado?.total_suprimentos ?? 0)
    : Number(sessao.valor_suprimentos || 0)
  const sangriasExibido = aberta
    ? Number(apurado?.total_sangrias ?? 0)
    : Number(sessao.valor_sangrias || 0)
  const esperadoDinheiroExibido = aberta ? Number(apurado?.esperado_dinheiro ?? 0) : null

  function handleImprimirPdf() {
    if (!sessao) return
    imprimirRelatorioFechamentoPdf({
      sessao,
      movimentos,
      empresaNome,
      terminalNome: sessao.expand?.pdv_terminal_id?.nome || 'Terminal',
      operadorNome: sessao.expand?.operador_id?.nome || 'Operador',
      supervisorNome: sessao.expand?.conferido_por_id?.nome,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Sessão de Caixa #{sessao.id.slice(-6).toUpperCase()}
            </DialogTitle>
            <Badge
              variant="outline"
              className={
                sessao.status === 'Aberto'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }
            >
              {sessao.status}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Terminal: <strong>{sessao.expand?.pdv_terminal_id?.nome || 'Terminal'}</strong> |
            Operador: <strong>{sessao.expand?.operador_id?.nome || 'Operador'}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Informações Gerais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg border">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                Abertura
              </span>
              <span className="font-medium">
                {sessao.data_abertura
                  ? new Date(sessao.data_abertura).toLocaleString('pt-BR')
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                Fechamento
              </span>
              <span className="font-medium">
                {sessao.data_fechamento
                  ? new Date(sessao.data_fechamento).toLocaleString('pt-BR')
                  : 'Em andamento'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                Conferência
              </span>
              <span className="font-medium">
                {sessao.data_conferencia
                  ? `${new Date(sessao.data_conferencia).toLocaleDateString('pt-BR')} (${sessao.expand?.conferido_por_id?.nome || 'Supervisor'})`
                  : 'Pendente'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                Fundo de Troco
              </span>
              <span className="font-mono font-bold text-slate-800">
                R$ {Number(sessao.valor_abertura || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Cards Financeiros */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 bg-white border rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Vendas Finalizadas</span>
              <span className="text-sm font-mono font-bold text-slate-900 block mt-0.5">
                {aberta && !apurado ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : (
                  `R$ ${valorVendasExibido.toFixed(2)}`
                )}
              </span>
              <span className="text-[10px] text-slate-400">{qtdVendasExibido} venda(s)</span>
            </div>

            <div className="p-2.5 bg-white border rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Suprimentos</span>
              <span className="text-sm font-mono font-bold text-emerald-700 block mt-0.5">
                + R$ {suprimentosExibido.toFixed(2)}
              </span>
            </div>

            <div className="p-2.5 bg-white border rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Sangrias</span>
              <span className="text-sm font-mono font-bold text-rose-700 block mt-0.5">
                - R$ {sangriasExibido.toFixed(2)}
              </span>
            </div>

            <div
              className={`p-2.5 border rounded-lg ${aberta ? 'bg-slate-50 border-slate-200 text-slate-700' : !temDiferenca ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : difDinheiro < 0 ? 'bg-rose-50/50 border-rose-200 text-rose-900' : 'bg-blue-50/50 border-blue-200 text-blue-900'}`}
            >
              {aberta ? (
                <>
                  <span className="text-[10px] uppercase font-semibold block">
                    Dinheiro Esperado na Gaveta
                  </span>
                  <span className="text-sm font-mono font-bold block mt-0.5">
                    {esperadoDinheiroExibido === null ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      `R$ ${esperadoDinheiroExibido.toFixed(2)}`
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    fundo + dinheiro vendido + suprimentos − sangrias
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] uppercase font-semibold block">
                    Diferença em Dinheiro
                  </span>
                  <span className="text-sm font-mono font-bold block mt-0.5">
                    R$ {Math.abs(difDinheiro).toFixed(2)}{' '}
                    {difDinheiro < 0 ? '(- falta)' : difDinheiro > 0 ? '(+ sobra)' : '(exato)'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Diferença em Dinheiro (sessão aberta): aguardando conferência */}
          {aberta && (
            <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 border-slate-200">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Diferença em Dinheiro
              </span>
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">
                Aguardando conferência
              </Badge>
            </div>
          )}

          {/* Totais por Forma de Pagamento */}
          {formasArr.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-slate-50 border-b font-semibold text-slate-700 text-xs">
                Totais por Forma de Pagamento
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b">
                  <tr>
                    <th className="py-1.5 px-3 text-left">Forma</th>
                    <th className="py-1.5 px-3 text-center">Vendas</th>
                    <th className="py-1.5 px-3 text-right">Valor</th>
                    {!aberta && (
                      <>
                        <th className="py-1.5 px-3 text-right">Valor Informado</th>
                        <th className="py-1.5 px-3 text-right">Diferença</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formasArr.map((f, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-3 font-medium text-slate-800">
                        {f.forma_descricao}
                      </td>
                      <td className="py-1.5 px-3 text-center font-mono">{f.quantidade_vendas}</td>
                      <td className="py-1.5 px-3 text-right font-mono">
                        R$ {(f.valor_esperado || 0).toFixed(2)}
                      </td>
                      {!aberta && (
                        <>
                          <td className="py-1.5 px-3 text-right font-mono">
                            R$ {(f.valor_informado || 0).toFixed(2)}
                          </td>
                          <td
                            className={`py-1.5 px-3 text-right font-mono font-semibold ${
                              Math.abs(f.diferenca || 0) < 0.01
                                ? 'text-emerald-700'
                                : (f.diferenca || 0) < 0
                                  ? 'text-rose-700'
                                  : 'text-blue-700'
                            }`}
                          >
                            R$ {(f.diferenca || 0).toFixed(2)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Movimentos de Sangria e Suprimento */}
          {movimentos.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="px-3 py-2 bg-slate-50 border-b font-semibold text-slate-700 text-xs">
                Movimentações da Sessão (Sangrias, Suprimentos e Ajustes)
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b">
                  <tr>
                    <th className="py-1.5 px-3 text-left">Data/Hora</th>
                    <th className="py-1.5 px-3 text-left">Tipo</th>
                    <th className="py-1.5 px-3 text-left">Motivo</th>
                    <th className="py-1.5 px-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimentos.map((m) => (
                    <tr key={m.id}>
                      <td className="py-1.5 px-3 text-slate-500">
                        {m.data_hora ? new Date(m.data_hora).toLocaleTimeString('pt-BR') : '-'}
                      </td>
                      <td className="py-1.5 px-3">
                        <Badge
                          variant="outline"
                          className={
                            m.tipo === 'Sangria'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                              : m.tipo === 'Suprimento'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                                : 'bg-slate-50 text-slate-700 text-[10px]'
                          }
                        >
                          {m.tipo}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-3 text-slate-700">{m.motivo || '-'}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold">
                        R$ {Number(m.valor || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sessao.observacao_fechamento && (
            <div className="p-3 bg-slate-50 rounded-lg border text-xs">
              <span className="font-semibold text-slate-700 block mb-1">Observações:</span>
              <p className="text-slate-600 italic">{sessao.observacao_fechamento}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between pt-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImprimirPdf}
              className="text-sky-700 border-sky-200 hover:bg-sky-50"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Imprimir Relatório (PDF)
            </Button>

            {sessao.status === 'Fechado' &&
              !sessao.data_conferencia &&
              podeConferir &&
              onAbrirConferencia && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onAbrirConferencia(sessao)
                  }}
                  className="text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  Conferir como Supervisor
                </Button>
              )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 hover:bg-slate-900 text-white"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
