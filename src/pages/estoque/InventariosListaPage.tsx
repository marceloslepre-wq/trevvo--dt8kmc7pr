import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  Eye,
  Calendar,
  Layers,
  FileCheck,
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
import {
  Inventario,
  StatusInventario,
  TipoInventario,
  listarInventarios,
} from '@/services/inventarios'
import { toast } from '@/hooks/use-toast'

export const InventariosListaPage: React.FC = () => {
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, administrador } = usePermissoes()

  const podeCriar = administrador || pode('estoque', 'criar')

  const [inventarios, setInventarios] = useState<Inventario[]>([])
  const [carregando, setCarregando] = useState(false)
  const [totalInventarios, setTotalInventarios] = useState(0)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusInventario | 'todos'>('todos')
  const [filtroTipo, setFiltroTipo] = useState<TipoInventario | 'todos'>('todos')
  const [pagina, setPagina] = useState(1)
  const [porPagina] = useState(20)

  const carregar = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)

    try {
      const res = await listarInventarios({
        empresa_id: empresaAtiva.id,
        status: filtroStatus,
        tipo: filtroTipo,
        busca: busca.trim() || undefined,
        page: pagina,
        perPage: porPagina,
      })

      setInventarios(res.items)
      setTotalInventarios(res.totalItems)
    } catch (err) {
      console.error('Erro ao carregar inventários:', err)
      toast({
        title: 'Erro ao listar inventários',
        description: 'Não foi possível carregar a listagem de inventários.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva, filtroStatus, filtroTipo, busca, pagina, porPagina])

  useEffect(() => {
    carregar()
  }, [carregar])

  const renderBadgeStatus = (status: StatusInventario) => {
    switch (status) {
      case 'Aberto':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 gap-1 text-[11px]"
          >
            <Clock className="w-3 h-3" />
            Aberto
          </Badge>
        )
      case 'Em contagem':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-[11px]"
          >
            <Clock className="w-3 h-3 animate-spin" />
            Em contagem
          </Badge>
        )
      case 'Finalizado':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[11px]"
          >
            <CheckCircle2 className="w-3 h-3" />
            Finalizado
          </Badge>
        )
      case 'Cancelado':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-500 border-slate-200 gap-1 text-[11px]"
          >
            <Ban className="w-3 h-3" />
            Cancelado
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatarData = (dt?: string) => {
    if (!dt) return '—'
    try {
      const d = new Date(dt)
      return d.toLocaleDateString('pt-BR')
    } catch {
      return dt
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Inventários de Estoque</h1>
            {empresaAtiva && (
              <Badge
                variant="outline"
                className="text-xs font-normal border-slate-300 text-slate-700"
              >
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Contagem física periódica, reconciliação de estoque e apuração anual do Bloco H do SPED
            Fiscal
          </p>
        </div>

        {podeCriar && (
          <Button
            onClick={() => navigate('/estoque/inventarios/novo')}
            className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Inventário
          </Button>
        )}
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total de Inventários</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{totalInventarios}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Em Aberto / Contagem</p>
              <p className="text-xl font-bold text-amber-600 mt-0.5">
                {
                  inventarios.filter((i) => i.status === 'Aberto' || i.status === 'Em contagem')
                    .length
                }
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Finalizados</p>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">
                {inventarios.filter((i) => i.status === 'Finalizado').length}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Anual (Bloco H)</p>
              <p className="text-xl font-bold text-purple-600 mt-0.5">
                {inventarios.filter((i) => i.tipo === 'Anual (Bloco H)').length}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
              <FileCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Busca textual */}
            <div className="sm:col-span-2 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscar por descrição ou observação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Filtro Status */}
            <div>
              <Select
                value={filtroStatus}
                onValueChange={(val) => setFiltroStatus(val as StatusInventario | 'todos')}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="Aberto">Aberto</SelectItem>
                  <SelectItem value="Em contagem">Em contagem</SelectItem>
                  <SelectItem value="Finalizado">Finalizado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Tipo */}
            <div>
              <Select
                value={filtroTipo}
                onValueChange={(val) => setFiltroTipo(val as TipoInventario | 'todos')}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Tipo de inventário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Geral">Geral</SelectItem>
                  <SelectItem value="Parcial">Parcial</SelectItem>
                  <SelectItem value="Anual (Bloco H)">Anual (Bloco H)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grade de Inventários */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-900">
            Inventários Cadastrados
          </CardTitle>
          <span className="text-xs text-slate-500">
            {totalInventarios} inventário(s) encontrado(s)
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3 w-16 text-center">Nº</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Data Posição</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Motivo SPED</th>
                  <th className="p-3">Aberto por</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Carregando inventários...</span>
                      </div>
                    </td>
                  </tr>
                ) : inventarios.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Nenhum inventário encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  inventarios.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/estoque/inventarios/${inv.id}`)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                    >
                      <td className="p-3 text-center font-mono font-bold text-blue-700">
                        #{inv.numero}
                      </td>
                      <td className="p-3 font-medium text-slate-900">
                        {inv.descricao}
                        {inv.observacao && (
                          <span className="block text-[10px] text-slate-400 truncate max-w-xs">
                            {inv.observacao}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px] border-slate-300">
                          {inv.tipo}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatarData(inv.data_referencia)}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">{renderBadgeStatus(inv.status)}</td>
                      <td className="p-3 text-slate-500 text-[11px] truncate max-w-xs">
                        {inv.motivo_bloco_h || '—'}
                      </td>
                      <td className="p-3 text-slate-600">
                        {inv.expand?.usuario_abertura_id?.nome || '—'}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/estoque/inventarios/${inv.id}`)
                          }}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalInventarios > porPagina && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Página {pagina} de {Math.ceil(totalInventarios / porPagina)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                  className="h-8 text-xs"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina * porPagina >= totalInventarios}
                  onClick={() => setPagina((p) => p + 1)}
                  className="h-8 text-xs"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default InventariosListaPage
