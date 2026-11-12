import React, { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RotateCcw } from 'lucide-react'

export interface KardexLinha {
  id: string
  data_movimento: string
  tipo: string
  origem: string
  quantidade: number
  custo_unitario: number
  valor_total: number
  saldo_posterior: number
  custo_medio_posterior: number
  documento_tipo?: string
  documento_numero?: string
  numero_lote?: string
  usuario_nome?: string
  motivo?: string
  observacao?: string
  estornado?: boolean
  movimento_estorno_id?: string
}

interface Props {
  linhas: KardexLinha[]
  saldoInicial: { quantidade: number; custo_medio: number; valor_total: number }
  dataInicio: string
  podeExcluir: boolean
  onEstornar: (l: KardexLinha) => void
  /** Esconde a linha de saldo inicial (usada quando a página já mostra o card de saldo) */
  ocultarLinhaSaldoInicial?: boolean
}

export const KardexTabela: React.FC<Props> = ({
  linhas,
  saldoInicial,
  dataInicio,
  podeExcluir,
  onEstornar,
  ocultarLinhaSaldoInicial = false,
}) => {
  const totais = useMemo(() => {
    let entradasQtd = 0
    let saidasQtd = 0
    let entradasValor = 0
    let saidasValor = 0
    for (const m of linhas) {
      if (m.estornado) continue
      if (m.tipo === 'Entrada') {
        entradasQtd += m.quantidade
        entradasValor += m.valor_total
      } else {
        saidasQtd += m.quantidade
        saidasValor += m.valor_total
      }
    }
    return { entradasQtd, saidasQtd, entradasValor, saidasValor }
  }, [linhas])

  const ultimo = linhas.length > 0 ? linhas[linhas.length - 1] : null
  const saldoFinal = ultimo
    ? {
        quantidade: ultimo.saldo_posterior,
        custo_medio: ultimo.custo_medio_posterior || ultimo.custo_unitario,
        valor_total:
          Math.round(
            ultimo.saldo_posterior * (ultimo.custo_medio_posterior || ultimo.custo_unitario) * 100,
          ) / 100,
      }
    : {
        quantidade: saldoInicial.quantidade,
        custo_medio: saldoInicial.custo_medio,
        valor_total: saldoInicial.valor_total,
      }

  const formatarQtd = (v: number) =>
    (v || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  const formatarMoeda = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const formatarDataHora = (s: string) => {
    try {
      return new Date(s).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return s
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200 select-none">
          <tr>
            <th className="p-2.5">Data / Hora</th>
            <th className="p-2.5">Origem / Operação</th>
            <th className="p-2.5">Lote</th>
            <th className="p-2.5">Documento</th>
            <th className="p-2.5 text-right text-emerald-700">Entrada</th>
            <th className="p-2.5 text-right text-rose-700">Saída</th>
            <th className="p-2.5 text-right font-bold text-slate-800">Saldo Físico</th>
            <th className="p-2.5 text-right">Custo Unitário</th>
            <th className="p-2.5 text-right">Custo Médio</th>
            <th className="p-2.5 text-right">Valor Total</th>
            <th className="p-2.5">Operador / Motivo</th>
            {podeExcluir && <th className="p-2.5 text-center print:hidden">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!ocultarLinhaSaldoInicial && (
            <tr className="bg-slate-50/80 font-medium">
              <td className="p-2.5 font-mono text-slate-500">
                {new Date(`${dataInicio}T00:00:00`).toLocaleDateString('pt-BR')} 00:00
              </td>
              <td className="p-2.5">
                <Badge variant="outline" className="bg-slate-200 text-slate-700 text-[10px]">
                  SALDO ANTERIOR
                </Badge>
              </td>
              <td className="p-2.5 text-slate-400 font-mono text-[11px]">—</td>
              <td className="p-2.5 text-slate-400">—</td>
              <td className="p-2.5 text-right text-slate-400">—</td>
              <td className="p-2.5 text-right text-slate-400">—</td>
              <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                {formatarQtd(saldoInicial.quantidade)}
              </td>
              <td className="p-2.5 text-right font-mono text-slate-500">
                {formatarMoeda(saldoInicial.custo_medio)}
              </td>
              <td className="p-2.5 text-right font-mono font-semibold text-slate-700">
                {formatarMoeda(saldoInicial.custo_medio)}
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                {formatarMoeda(saldoInicial.valor_total)}
              </td>
              <td className="p-2.5 text-slate-500 text-[11px]">
                Posição inicial no início do período
              </td>
              {podeExcluir && <td className="p-2.5 text-center text-slate-300 print:hidden">—</td>}
            </tr>
          )}

          {linhas.length === 0 ? (
            <tr>
              <td colSpan={podeExcluir ? 12 : 11} className="py-8 text-center text-slate-400">
                Nenhuma movimentação registrada neste período.
              </td>
            </tr>
          ) : (
            linhas.map((mov) => {
              const isEstornado = mov.estornado === true
              const isEntrada = mov.tipo === 'Entrada'

              return (
                <tr
                  key={mov.id}
                  className={`hover:bg-blue-50/30 transition-colors ${
                    isEstornado ? 'line-through opacity-50 bg-slate-50/50 text-slate-400' : ''
                  }`}
                >
                  <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                    {formatarDataHora(mov.data_movimento)}
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        className={`text-[10px] ${
                          mov.origem === 'ESTORNO'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : isEntrada
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {mov.origem}
                      </Badge>
                      {isEstornado && (
                        <Badge
                          variant="outline"
                          className="text-[9px] text-rose-600 border-rose-300"
                        >
                          Estornado
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-2.5 font-mono text-[11px]">
                    {mov.numero_lote ? (
                      <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                        {mov.numero_lote}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-600">
                    {mov.documento_tipo
                      ? `${mov.documento_tipo}${mov.documento_numero ? ` nº ${mov.documento_numero}` : ''}`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-emerald-700">
                    {isEntrada ? formatarQtd(mov.quantidade) : '—'}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-rose-700">
                    {!isEntrada ? formatarQtd(mov.quantidade) : '—'}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                    {formatarQtd(mov.saldo_posterior)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-600">
                    {formatarMoeda(mov.custo_unitario)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-slate-800">
                    {formatarMoeda(mov.custo_medio_posterior)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                    {formatarMoeda(mov.valor_total)}
                  </td>
                  <td className="p-2.5 max-w-[200px]">
                    {(mov.usuario_nome || mov.motivo) && (
                      <div
                        className="font-medium text-slate-800 truncate"
                        title={mov.usuario_nome || mov.motivo}
                      >
                        {mov.usuario_nome || mov.motivo}
                      </div>
                    )}
                    {mov.observacao && (
                      <div className="text-[10px] text-slate-400 truncate" title={mov.observacao}>
                        {mov.observacao}
                      </div>
                    )}
                    {mov.movimento_estorno_id && (
                      <div className="text-[10px] text-purple-600 font-mono">
                        Estorno: #{mov.movimento_estorno_id.slice(-6)}
                      </div>
                    )}
                  </td>
                  {podeExcluir && (
                    <td className="p-2.5 text-center print:hidden">
                      {!isEstornado &&
                        mov.origem !== 'ESTORNO' &&
                        !mov.origem.startsWith('VENDA') &&
                        !mov.origem.startsWith('COMPRA') &&
                        !mov.origem.startsWith('TRANSFERENCIA') && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onEstornar(mov)}
                            className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            title="Estornar lançamento de estoque"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Estornar
                          </Button>
                        )}
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
        <tfoot className="bg-slate-100 font-bold border-t border-slate-300 text-xs">
          <tr>
            <td colSpan={4} className="p-3 text-slate-800">
              Posição Final Consolidada:
            </td>
            <td className="p-3 text-right font-mono text-emerald-800">
              + {formatarQtd(totais.entradasQtd)}
            </td>
            <td className="p-3 text-right font-mono text-rose-800">
              - {formatarQtd(totais.saidasQtd)}
            </td>
            <td className="p-3 text-right font-mono text-blue-900 text-sm">
              {formatarQtd(saldoFinal.quantidade)}
            </td>
            <td className="p-3 text-right text-slate-400 font-normal text-[11px]">—</td>
            <td className="p-3 text-right font-mono text-slate-800">
              {formatarMoeda(saldoFinal.custo_medio)}
            </td>
            <td className="p-3 text-right font-mono text-emerald-800 text-sm">
              {formatarMoeda(saldoFinal.valor_total)}
            </td>
            <td colSpan={podeExcluir ? 2 : 1} className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
