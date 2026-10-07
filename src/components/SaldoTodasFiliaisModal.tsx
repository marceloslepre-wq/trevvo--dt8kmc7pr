import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Building, AlertCircle } from 'lucide-react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { Empresa } from '@/services/empresas'
import { EstoqueSaldo } from '@/services/estoque'
import pb from '@/lib/pocketbase/client'

export interface SaldoTodasFiliaisModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  produto: {
    id: string
    codigo: number
    descricao: string
    unidadeSigla?: string
  } | null
}

interface LinhaSaldoFilial {
  empresa: Empresa
  saldo: EstoqueSaldo | null
  carregando: boolean
}

export const SaldoTodasFiliaisModal: React.FC<SaldoTodasFiliaisModalProps> = ({
  aberto,
  onOpenChange,
  produto,
}) => {
  const { empresas, empresaAtiva } = useEmpresaAtiva()
  const [linhas, setLinhas] = useState<LinhaSaldoFilial[]>([])
  const [carregandoGeral, setCarregandoGeral] = useState(false)

  useEffect(() => {
    if (!aberto || !produto) return

    const carregarSaldos = async () => {
      setCarregandoGeral(true)
      try {
        // Carrega saldos do produto em todas as empresas permitidas ao usuário
        const saldosPorEmpresa = await pb.collection('estoque_saldos').getFullList<EstoqueSaldo>({
          filter: `produto_id = '${produto.id}'`,
        })

        const mapaSaldos = new Map<string, EstoqueSaldo>()
        saldosPorEmpresa.forEach((s) => {
          mapaSaldos.set(s.empresa_id, s)
        })

        const lista: LinhaSaldoFilial[] = empresas.map((emp) => ({
          empresa: emp,
          saldo: mapaSaldos.get(emp.id) || null,
          carregando: false,
        }))

        setLinhas(lista)
      } catch (err) {
        console.error('Erro ao carregar saldo por filiais:', err)
      } finally {
        setCarregandoGeral(false)
      }
    }

    carregarSaldos()
  }, [aberto, produto, empresas])

  const totalQuantidade = linhas.reduce((acc, l) => acc + (l.saldo?.quantidade || 0), 0)
  const totalValor = linhas.reduce((acc, l) => acc + (l.saldo?.valor_total || 0), 0)

  const formatarQtd = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  }

  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" />
            <DialogTitle className="text-base font-bold text-slate-900">
              Saldo em Todas as Filiais
            </DialogTitle>
          </div>
          {produto && (
            <DialogDescription className="text-xs text-slate-600">
              Produto: <span className="font-mono font-semibold">#{produto.codigo}</span> —{' '}
              <span className="font-medium text-slate-900">{produto.descricao}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {carregandoGeral ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-xs">Consultando estoque nas filiais...</span>
          </div>
        ) : linhas.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Nenhuma empresa com permissão encontrada.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Filial / Empresa</th>
                    <th className="p-3">CNPJ</th>
                    <th className="p-3 text-right">Quantidade</th>
                    <th className="p-3 text-right">Custo Médio</th>
                    <th className="p-3 text-right">Valor Total</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linhas.map(({ empresa, saldo }) => {
                    const isAtiva = empresaAtiva?.id === empresa.id
                    const qtd = saldo?.quantidade || 0
                    const custoMedio = saldo?.custo_medio || 0
                    const valorTotal = saldo?.valor_total || 0

                    return (
                      <tr
                        key={empresa.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isAtiva ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{empresa.nome_fantasia || empresa.razao_social}</span>
                            {isAtiva && (
                              <Badge className="bg-blue-100 text-blue-800 text-[10px] px-1 py-0">
                                Filial Ativa
                              </Badge>
                            )}
                            {empresa.tipo === 'Matriz' && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0 border-purple-200 text-purple-700"
                              >
                                Matriz
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            Cód: {empresa.codigo} • {empresa.razao_social}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-600 text-[11px]">
                          {empresa.cnpj || '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          {formatarQtd(qtd)} {produto?.unidadeSigla || ''}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-600">
                          {formatarMoeda(custoMedio)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700">
                          {formatarMoeda(valorTotal)}
                        </td>
                        <td className="p-3 text-center">
                          {qtd > 0 ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                              Com Saldo
                            </Badge>
                          ) : qtd === 0 ? (
                            <Badge variant="outline" className="text-slate-400 text-[10px]">
                              Zerado
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
                              Negativo
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t border-slate-200 text-xs">
                  <tr>
                    <td colSpan={2} className="p-3 text-slate-700">
                      Consolidado ({linhas.length} filiais)
                    </td>
                    <td className="p-3 text-right font-mono text-slate-900">
                      {formatarQtd(totalQuantidade)} {produto?.unidadeSigla || ''}
                    </td>
                    <td className="p-3 text-right text-slate-500 font-normal text-[11px]">—</td>
                    <td className="p-3 text-right font-mono text-emerald-800">
                      {formatarMoeda(totalValor)}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
export default SaldoTodasFiliaisModal
