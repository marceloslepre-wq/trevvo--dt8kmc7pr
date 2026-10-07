import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Plus,
  Search,
  Filter,
  FileDown,
  Calendar,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  Printer,
  Building2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  Transferencia,
  listarTransferencias,
  obterTransferenciaPorId,
  TransferenciaCompleta,
} from '@/services/transferencias'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import { RomaneioTransferenciaModal } from '@/components/RomaneioTransferenciaModal'

export const TransferenciasListaPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, administrador } = usePermissoes()
  const { toast } = useToast()
  const navigate = useNavigate()
  const podeCriar = administrador || pode('estoque', 'criar')

  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroOrigem, setFiltroOrigem] = useState('todas')
  const [filtroDestino, setFiltroDestino] = useState('todas')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [totalRegistros, setTotalRegistros] = useState(0)

  // Romaneio modal state
  const [transfRomaneio, setTransfRomaneio] = useState<TransferenciaCompleta | null>(null)
  const [carregandoRomaneio, setCarregandoRomaneio] = useState(false)

  // Carrega empresas do grupo para filtros
  useEffect(() => {
    listarEmpresasAtivas()
      .then((res) => setEmpresas(res))
      .catch(() => {})
  }, [])

  const carregarDados = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await listarTransferencias({
        empresaId: empresaAtiva.id,
        status: filtroStatus,
        empresaOrigemId: filtroOrigem !== 'todas' ? filtroOrigem : undefined,
        empresaDestinoId: filtroDestino !== 'todas' ? filtroDestino : undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        busca: busca.trim() || undefined,
        pagina,
        itensPorPagina: 15,
      })
      setTransferencias(res.items)
      setTotalPaginas(res.totalPages)
      setTotalRegistros(res.totalItems)
    } catch (err: any) {
      console.error('Erro ao carregar transferências:', err)
      toast({
        title: 'Erro ao carregar',
        description: err.message || 'Não foi possível carregar a lista de transferências.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva?.id,
    filtroStatus,
    filtroOrigem,
    filtroDestino,
    dataInicio,
    dataFim,
    busca,
    pagina,
    toast,
  ])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const abrirRomaneio = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCarregandoRomaneio(true)
    try {
      const transf = await obterTransferenciaPorId(id)
      setTransfRomaneio(transf)
    } catch (err: any) {
      toast({
        title: 'Erro ao abrir romaneio',
        description: err.message || 'Falha ao buscar detalhes da transferência.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoRomaneio(false)
    }
  }

  const exportarCSV = () => {
    if (transferencias.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum registro para exportar.' })
      return
    }

    const cabecalho = [
      'Número',
      'Status',
      'Empresa Origem',
      'Empresa Destino',
      'Data Envio',
      'Data Recebimento',
      'Nota Fiscal',
      'Observação',
    ]
    const linhas = transferencias.map((t) => [
      t.numero,
      t.status,
      t.expand?.empresa_origem_id?.nome_fantasia || t.expand?.empresa_origem_id?.razao_social || '',
      t.expand?.empresa_destino_id?.nome_fantasia ||
        t.expand?.empresa_destino_id?.razao_social ||
        '',
      t.data_envio || '',
      t.data_recebimento || '',
      t.nota_fiscal_numero || '',
      `"${(t.observacao || '').replace(/"/g, '""')}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [cabecalho.join(';'), ...linhas.map((e) => e.join(';'))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `transferencias_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const badgeStatus = (status: string, isAguardandoRecebimento: boolean) => {
    if (isAguardandoRecebimento) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-sm animate-pulse">
          <Clock className="w-3 h-3" />
          Aguardando recebimento
        </Badge>
      )
    }

    switch (status) {
      case 'Rascunho':
        return (
          <Badge variant="outline" className="text-slate-600 border-slate-300">
            Rascunho
          </Badge>
        )
      case 'Enviada':
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            Enviada (Em trânsito)
          </Badge>
        )
      case 'Recebida':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Recebida
          </Badge>
        )
      case 'Cancelada':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <Ban className="w-3 h-3" />
            Cancelada
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6 text-blue-600" />
              Transferências entre Filiais
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Transferência de mercadorias entre matriz e filiais do grupo com baixa na origem e
            conferência no destino.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            disabled={transferencias.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => carregarDados()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {pode('estoque', 'criar') && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => navigate('/estoque/transferencias/novo')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Transferência
            </Button>
          )}
        </div>
      </div>

      {/* Painel de Filtros */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por número, nota fiscal ou observação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div>
              <Select value={filtroStatus} onValueChange={(val) => setFiltroStatus(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="Rascunho">Rascunho</SelectItem>
                  <SelectItem value="Enviada">Enviada</SelectItem>
                  <SelectItem value="Recebida">Recebida</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-9 text-xs"
                placeholder="Início"
              />
              <span className="text-slate-400 text-xs">até</span>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-9 text-xs"
                placeholder="Fim"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Origem:</span>
              <select
                value={filtroOrigem}
                onChange={(e) => setFiltroOrigem(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="todas">Todas as origens</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome_fantasia || emp.razao_social}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Destino:</span>
              <select
                value={filtroDestino}
                onChange={(e) => setFiltroDestino(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="todas">Todos os destinos</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome_fantasia || emp.razao_social}
                  </option>
                ))}
              </select>
            </div>

            {(filtroStatus !== 'todos' ||
              filtroOrigem !== 'todas' ||
              filtroDestino !== 'todas' ||
              busca ||
              dataInicio ||
              dataFim) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-slate-500 hover:text-slate-800 ml-auto"
                onClick={() => {
                  setBusca('')
                  setFiltroStatus('todos')
                  setFiltroOrigem('todas')
                  setFiltroDestino('todas')
                  setDataInicio('')
                  setDataFim('')
                  setPagina(1)
                }}
              >
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Transferências */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 font-medium">
                <tr>
                  <th className="py-3 px-4 w-20">Número</th>
                  <th className="py-3 px-4">Origem &rarr; Destino</th>
                  <th className="py-3 px-4 w-40">Status</th>
                  <th className="py-3 px-4 w-32">Data Envio</th>
                  <th className="py-3 px-4 w-32">Data Receb.</th>
                  <th className="py-3 px-4 w-28">Nota Fiscal</th>
                  <th className="py-3 px-4 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {carregando ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Carregando transferências...</span>
                      </div>
                    </td>
                  </tr>
                ) : transferencias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-medium text-slate-600">Nenhuma transferência encontrada</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Crie uma nova transferência para movimentar estoque entre filiais.
                      </p>
                    </td>
                  </tr>
                ) : (
                  transferencias.map((transf) => {
                    const isDestino = transf.empresa_destino_id === empresaAtiva?.id
                    const isOrigem = transf.empresa_origem_id === empresaAtiva?.id
                    const isAguardandoRecebimento = transf.status === 'Enviada' && isDestino

                    return (
                      <tr
                        key={transf.id}
                        onClick={() => navigate(`/estoque/transferencias/${transf.id}`)}
                        className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                          isAguardandoRecebimento ? 'bg-amber-50/40 font-medium' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          TR-{String(transf.numero).padStart(4, '0')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`truncate max-w-[140px] ${
                                isOrigem ? 'font-bold text-slate-900' : 'text-slate-600'
                              }`}
                              title={transf.expand?.empresa_origem_id?.razao_social}
                            >
                              {transf.expand?.empresa_origem_id?.nome_fantasia ||
                                transf.expand?.empresa_origem_id?.razao_social ||
                                'Origem'}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span
                              className={`truncate max-w-[140px] ${
                                isDestino ? 'font-bold text-blue-800' : 'text-slate-600'
                              }`}
                              title={transf.expand?.empresa_destino_id?.razao_social}
                            >
                              {transf.expand?.empresa_destino_id?.nome_fantasia ||
                                transf.expand?.empresa_destino_id?.razao_social ||
                                'Destino'}
                            </span>
                          </div>
                          {transf.observacao && (
                            <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                              {transf.observacao}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {badgeStatus(transf.status, isAguardandoRecebimento)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {transf.data_envio
                            ? new Date(transf.data_envio).toLocaleDateString('pt-BR')
                            : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {transf.data_recebimento
                            ? new Date(transf.data_recebimento).toLocaleDateString('pt-BR')
                            : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {transf.nota_fiscal_numero ? `NF ${transf.nota_fiscal_numero}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                              title="Imprimir Romaneio"
                              onClick={(e) => abrirRomaneio(transf.id, e)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                              title="Visualizar / Editar"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/estoque/transferencias/${transf.id}`)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs">
              <span className="text-slate-500">
                Total de {totalRegistros} transferências ({pagina} de {totalPaginas})
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  className="h-7 px-2"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  className="h-7 px-2"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Impressão de Romaneio */}
      {transfRomaneio && (
        <RomaneioTransferenciaModal
          transferencia={transfRomaneio}
          onClose={() => setTransfRomaneio(null)}
        />
      )}
    </div>
  )
}
export default TransferenciasListaPage
