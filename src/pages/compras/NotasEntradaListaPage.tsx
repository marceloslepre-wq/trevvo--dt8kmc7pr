import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  UploadCloud,
  Search,
  Filter,
  Eye,
  Calendar,
  Building2,
  Receipt,
  RefreshCw,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { NotaEntrada, listarNotasEntrada, ListarNotasEntradaParams } from '@/services/notasEntrada'
import { TIPOS_ENTRADA } from '@/services/cfopConversao'
import { SelectFornecedor } from '@/components/SelectFornecedor'
import { ImportarXmlModal } from '@/pages/compras/ImportarXmlModal'

export const NotasEntradaListaPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()

  const podeCriar = pode('notas_entrada', 'criar')

  const [notas, setNotas] = useState<NotaEntrada[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [tipoEntrada, setTipoEntrada] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Modal importação de XML
  const [modalImportarAberto, setModalImportarAberto] = useState(false)

  const carregarNotas = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)
    try {
      const params: ListarNotasEntradaParams = {
        empresa_id: empresaAtiva.id,
        busca,
        fornecedor_id: fornecedorId || undefined,
        tipo_entrada: tipoEntrada,
        status: statusFiltro,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        page,
        perPage: 20,
      }
      const res = await listarNotasEntrada(params)
      setNotas(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao listar notas de entrada',
        description: err instanceof Error ? err.message : 'Falha na busca',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva,
    busca,
    fornecedorId,
    tipoEntrada,
    statusFiltro,
    dataInicio,
    dataFim,
    page,
    toast,
  ])

  useEffect(() => {
    carregarNotas()
  }, [carregarNotas])

  const handleNotaImportada = (notaCriada: NotaEntrada) => {
    setModalImportarAberto(false)
    navigate(`/compras/notas-entrada/${notaCriada.id}`)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Notas Fiscais de Entrada
            </h1>
            <Badge variant="outline" className="text-xs font-normal border-slate-300">
              Módulo Compras
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Recepção, importação do XML da NF-e e conferência das entradas de mercadorias da empresa
            ativa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {podeCriar && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate('/compras/notas-entrada/digitar')}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
              >
                <Plus size={16} />
                Digitar nota
              </Button>
              <Button
                onClick={() => setModalImportarAberto(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <UploadCloud size={16} />
                Importar XML NF-e
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por número, chave ou natureza..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setPage(1)
                }}
                className="pl-9 text-xs"
              />
            </div>

            <Select
              value={statusFiltro}
              onValueChange={(val) => {
                setStatusFiltro(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Status da nota" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="Em conferência">Em conferência</SelectItem>
                <SelectItem value="Lançada">Lançada</SelectItem>
                <SelectItem value="Cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={tipoEntrada}
              onValueChange={(val) => {
                setTipoEntrada(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Tipo de entrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos de entrada</SelectItem>
                {TIPOS_ENTRADA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
                title="Data inicial de emissão"
              />
              <span className="text-slate-400 text-xs">até</span>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value)
                  setPage(1)
                }}
                className="text-xs"
                title="Data final de emissão"
              />
            </div>
          </div>

          <div className="w-full sm:w-80">
            <SelectFornecedor
              value={fornecedorId}
              onChange={(val) => {
                setFornecedorId(val)
                setPage(1)
              }}
              placeholder="Filtrar por fornecedor..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Grade de Listagem */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-600">
                  <th className="py-3 px-4 w-28">Número / Mod</th>
                  <th className="py-3 px-4 w-20">Série</th>
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4 w-24">Emissão</th>
                  <th className="py-3 px-4 w-24">Entrada</th>
                  <th className="py-3 px-4">Tipo de Entrada</th>
                  <th className="py-3 px-4 w-32 text-right">Valor Total</th>
                  <th className="py-3 px-4 text-center w-28">Status</th>
                  <th className="py-3 px-4 text-right w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Carregando notas fiscais de entrada...
                    </td>
                  </tr>
                ) : notas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Nenhuma nota de entrada encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  notas.map((n) => {
                    const statusClass =
                      n.status === 'Lançada'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : n.status === 'Cancelada'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'

                    return (
                      <tr
                        key={n.id}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => navigate(`/compras/notas-entrada/${n.id}`)}
                      >
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                          #{n.numero}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({n.modelo})
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{n.serie || '1'}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 truncate max-w-xs">
                            {n.expand?.fornecedor_id?.razao_social ||
                              n.expand?.fornecedor_id?.nome_fantasia ||
                              'Fornecedor não cadastrado'}
                          </div>
                          {n.chave_acesso && (
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                              {n.chave_acesso}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{n.data_emissao}</td>
                        <td className="py-2.5 px-4 text-slate-600">{n.data_entrada}</td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant="outline"
                            className="text-[11px] font-normal border-slate-200 bg-slate-50"
                          >
                            {n.tipo_entrada}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          R$ {n.valor_total?.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Badge variant="outline" className={`text-[10px] ${statusClass}`}>
                            {n.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/compras/notas-entrada/${n.id}`)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600"
                            title="Abrir conferência"
                          >
                            <Eye size={14} />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between p-4 border-t border-slate-200 text-xs text-slate-500 bg-slate-50/50">
            <span>
              Total: <strong>{totalItems}</strong> nota(s) encontrada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 text-xs"
              >
                Anterior
              </Button>
              <span>
                Página <strong>{page}</strong> de <strong>{totalPages || 1}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Importar XML */}
      <ImportarXmlModal
        aberto={modalImportarAberto}
        onClose={() => setModalImportarAberto(false)}
        onImportadoSucesso={handleNotaImportada}
      />
    </div>
  )
}

export default NotasEntradaListaPage
