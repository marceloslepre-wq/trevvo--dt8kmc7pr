import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building, History, ExternalLink, Loader2, AlertCircle, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { EstoqueSaldo, EstoqueMovimento } from '@/services/estoque'
import pb from '@/lib/pocketbase/client'

export interface ProdutoAbaEstoqueProps {
  produtoId?: string
  unidadeSigla?: string
  controlaEstoque?: boolean
}

export const ProdutoAbaEstoque: React.FC<ProdutoAbaEstoqueProps> = ({
  produtoId,
  unidadeSigla = 'UN',
  controlaEstoque = true,
}) => {
  const { empresaAtiva, empresas } = useEmpresaAtiva()
  const [carregando, setCarregando] = useState(false)
  const [saldosFiliais, setSaldosFiliais] = useState<
    Array<{
      empresaId: string
      empresaNome: string
      empresaCnpj: string
      isAtiva: boolean
      saldo: EstoqueSaldo | null
    }>
  >([])
  const [ultimosMovimentos, setUltimosMovimentos] = useState<EstoqueMovimento[]>([])

  useEffect(() => {
    if (!produtoId) {
      setSaldosFiliais([])
      setUltimosMovimentos([])
      return
    }

    const carregarDadosEstoque = async () => {
      setCarregando(true)
      try {
        // 1. Saldo em cada empresa que o usuário tem acesso
        const resSaldos = await pb.collection('estoque_saldos').getFullList<EstoqueSaldo>({
          filter: `produto_id = '${produtoId}'`,
        })

        const mapaSaldos = new Map<string, EstoqueSaldo>()
        resSaldos.forEach((s) => mapaSaldos.set(s.empresa_id, s))

        const listaFiliais = empresas.map((emp) => ({
          empresaId: emp.id,
          empresaNome: emp.nome_fantasia || emp.razao_social,
          empresaCnpj: emp.cnpj,
          isAtiva: emp.id === empresaAtiva?.id,
          saldo: mapaSaldos.get(emp.id) || null,
        }))

        setSaldosFiliais(listaFiliais)

        // 2. Últimos 10 movimentos da empresa ativa
        if (empresaAtiva) {
          const resMovimentos = await pb
            .collection('estoque_movimentos')
            .getList<EstoqueMovimento>(1, 10, {
              filter: `empresa_id = '${empresaAtiva.id}' && produto_id = '${produtoId}'`,
              sort: '-data_movimento,-created',
              expand: 'usuario_id',
            })
          setUltimosMovimentos(resMovimentos.items)
        }
      } catch (err) {
        console.error('Erro ao carregar dados de estoque do produto:', err)
      } finally {
        setCarregando(false)
      }
    }

    carregarDadosEstoque()
  }, [produtoId, empresaAtiva, empresas])

  const formatarQtd = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  }

  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  if (!produtoId) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
        Salve o produto primeiro para visualizar o saldo nas filiais e o histórico de movimentações.
      </div>
    )
  }

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Saldo e custo médio em cada empresa permitida */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="pt-4 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-600" />
              <h4 className="font-semibold text-slate-900 text-sm">
                Posição do Produto em Todas as Filiais Acessíveis
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">
              {empresas.length} filial(is) permitida(s)
            </span>
          </div>

          {carregando ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Consultando saldos nas filiais...</span>
            </div>
          ) : saldosFiliais.length === 0 ? (
            <div className="py-4 text-center text-slate-400">
              Nenhuma empresa vinculada ao usuário.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Filial / Empresa</th>
                    <th className="p-2.5">CNPJ</th>
                    <th className="p-2.5 text-right">Saldo Físico</th>
                    <th className="p-2.5 text-right">Custo Médio</th>
                    <th className="p-2.5 text-right">Valor em Estoque</th>
                    <th className="p-2.5 text-center">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {saldosFiliais.map((f) => {
                    const qtd = f.saldo?.quantidade || 0
                    const custo = f.saldo?.custo_medio || 0
                    const total = f.saldo?.valor_total || 0

                    return (
                      <tr
                        key={f.empresaId}
                        className={`hover:bg-slate-50 transition-colors ${
                          f.isAtiva ? 'bg-blue-50/40 font-medium' : ''
                        }`}
                      >
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-900">{f.empresaNome}</span>
                            {f.isAtiva && (
                              <Badge className="bg-blue-100 text-blue-800 text-[9px] px-1 py-0">
                                Filial Atual
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 font-mono text-slate-500 text-[11px]">
                          {f.empresaCnpj || '—'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {formatarQtd(qtd)} {unidadeSigla}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-600">
                          {formatarMoeda(custo)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatarMoeda(total)}
                        </td>
                        <td className="p-2.5 text-center">
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
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Últimos 10 movimentos da empresa ativa com link para o Kardex */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="pt-4 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              <h4 className="font-semibold text-slate-900 text-sm">
                Últimos 10 Movimentos na Filial Atual (
                {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social})
              </h4>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Link to={`/estoque/kardex?produto=${produtoId}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Ver Kardex Completo
              </Link>
            </Button>
          </div>

          {carregando ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Carregando histórico...</span>
            </div>
          ) : ultimosMovimentos.length === 0 ? (
            <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
              <Package className="h-6 w-6 mx-auto mb-1 text-slate-300" />
              <p>Nenhuma movimentação registrada nesta filial para este produto.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Data/Hora</th>
                    <th className="p-2.5">Origem</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5 text-right">Quantidade</th>
                    <th className="p-2.5 text-right">Saldo Posterior</th>
                    <th className="p-2.5 text-right">Custo Médio</th>
                    <th className="p-2.5">Documento / Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ultimosMovimentos.map((m) => {
                    const isEntrada = m.tipo === 'Entrada'
                    return (
                      <tr
                        key={m.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          m.estornado ? 'line-through opacity-50 bg-slate-50' : ''
                        }`}
                      >
                        <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {new Date(m.data_movimento).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-2.5">
                          <Badge
                            className={`text-[10px] ${
                              isEntrada
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {m.origem}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-medium">
                          <span className={isEntrada ? 'text-emerald-700' : 'text-rose-700'}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {isEntrada ? '+' : '-'} {formatarQtd(m.quantidade)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-blue-700">
                          {formatarQtd(m.saldo_posterior)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-700">
                          {formatarMoeda(m.custo_medio_posterior)}
                        </td>
                        <td className="p-2.5 text-slate-600 truncate max-w-[200px]">
                          {m.documento_tipo && <span>{m.documento_tipo} </span>}
                          {m.documento_numero && <span>#{m.documento_numero} </span>}
                          {m.motivo && <span className="text-slate-400">({m.motivo})</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
export default ProdutoAbaEstoque
