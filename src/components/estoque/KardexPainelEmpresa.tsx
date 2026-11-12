import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Building2 } from 'lucide-react'

export interface KardexEmpresaLinha {
  empresaId: string
  qtdMovimentos: number
  entradasQtd: number
  saidasQtd: number
  entradasValor: number
  saidasValor: number
  saldoFinalQtd: number
  saldoFinalValor: number
  movimentos: {
    id: string
    tipo: string
    quantidade: number
    valor_total: number
    estornado?: boolean
  }[]
}

interface Props {
  porEmpresa: KardexEmpresaLinha[]
  nomesEmpresas: Record<string, string>
  saldoInicialPorEmpresa: Record<
    string,
    { quantidade: number; custo_medio: number; valor_total: number }
  >
}

/**
 * Painel "Totais por Empresa" do Kardex (padrão Consultas de Vendas / Comissões /
 * Fluxo de Caixa / Inadimplência): quebra por empresa + Total Geral.
 * Não renderiza quando "Ver só o total consolidado" está marcado (controle na página).
 */
export const KardexTotaisPorEmpresa: React.FC<Props> = ({
  porEmpresa,
  nomesEmpresas,
  saldoInicialPorEmpresa,
}) => {
  const fmtQtd = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  const fmtMoeda = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const totalGeral = porEmpresa.reduce(
    (acc, e) => {
      acc.qtdMovimentos += e.qtdMovimentos
      acc.entradasQtd += e.entradasQtd
      acc.saidasQtd += e.saidasQtd
      acc.entradasValor += e.entradasValor
      acc.saidasValor += e.saidasValor
      acc.saldoFinalQtd += e.saldoFinalQtd
      acc.saldoFinalValor += e.saldoFinalValor
      return acc
    },
    {
      qtdMovimentos: 0,
      entradasQtd: 0,
      saidasQtd: 0,
      entradasValor: 0,
      saidasValor: 0,
      saldoFinalQtd: 0,
      saldoFinalValor: 0,
    },
  )

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
            <th className="py-2 px-3">Empresa</th>
            <th className="py-2 px-3 text-right">Movimentos</th>
            <th className="py-2 px-3 text-right">Entradas (qtd)</th>
            <th className="py-2 px-3 text-right">Saídas (qtd)</th>
            <th className="py-2 px-3 text-right">Entradas (R$)</th>
            <th className="py-2 px-3 text-right">Saídas (R$)</th>
            <th className="py-2 px-3 text-right">Saldo Inicial (qtd)</th>
            <th className="py-2 px-3 text-right">Saldo Final (qtd)</th>
            <th className="py-2 px-3 text-right">Saldo Final (R$)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {porEmpresa.map((e) => {
            const si = saldoInicialPorEmpresa[e.empresaId] || {
              quantidade: 0,
              custo_medio: 0,
              valor_total: 0,
            }
            return (
              <tr key={e.empresaId} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-2 px-3 font-medium text-slate-800">
                  {nomesEmpresas[e.empresaId] || e.empresaId}
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-700">{e.qtdMovimentos}</td>
                <td className="py-2 px-3 text-right font-mono text-emerald-700">
                  {fmtQtd(e.entradasQtd)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-rose-700">
                  {fmtQtd(e.saidasQtd)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-emerald-800">
                  {fmtMoeda(e.entradasValor)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-rose-800">
                  {fmtMoeda(e.saidasValor)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-600">
                  {fmtQtd(si.quantidade)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                  {fmtQtd(e.saldoFinalQtd)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-blue-900">
                  {fmtMoeda(e.saldoFinalValor)}
                </td>
              </tr>
            )
          })}
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="py-2 px-3 text-slate-900">Total Geral</td>
            <td className="py-2 px-3 text-right font-mono text-slate-900">
              {totalGeral.qtdMovimentos}
            </td>
            <td className="py-2 px-3 text-right font-mono text-emerald-900">
              {fmtQtd(totalGeral.entradasQtd)}
            </td>
            <td className="py-2 px-3 text-right font-mono text-rose-900">
              {fmtQtd(totalGeral.saidasQtd)}
            </td>
            <td className="py-2 px-3 text-right font-mono text-emerald-900">
              {fmtMoeda(totalGeral.entradasValor)}
            </td>
            <td className="py-2 px-3 text-right font-mono text-rose-900">
              {fmtMoeda(totalGeral.saidasValor)}
            </td>
            <td className="py-2 px-3 text-right font-mono text-slate-700">
              {fmtQtd(
                porEmpresa.reduce(
                  (a, e) => a + (saldoInicialPorEmpresa[e.empresaId]?.quantidade ?? 0),
                  0,
                ),
              )}
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
              {fmtQtd(totalGeral.saldoFinalQtd)}
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold text-blue-900">
              {fmtMoeda(totalGeral.saldoFinalValor)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/**
 * Cabeçalho de uma seção de empresa no Kardex (quebra por empresa).
 */
export const KardexSecaoEmpresa: React.FC<{
  empresaId: string
  nomeEmpresa: string
  saldoInicial: { quantidade: number; custo_medio: number; valor_total: number }
  saldoFinal: { quantidade: number; custo_medio: number; valor_total: number }
}> = ({ nomeEmpresa, saldoInicial, saldoFinal }) => {
  const fmtQtd = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  const fmtMoeda = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-bold text-slate-900">{nomeEmpresa}</span>
      </div>
      <Badge variant="outline" className="text-[10px] text-slate-500">
        Saldo inicial: {fmtQtd(saldoInicial.quantidade)} • {fmtMoeda(saldoInicial.valor_total)}
      </Badge>
      <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-200 bg-blue-50">
        Saldo final: {fmtQtd(saldoFinal.quantidade)} • {fmtMoeda(saldoFinal.valor_total)}
      </Badge>
    </div>
  )
}
