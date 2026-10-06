import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  Filter,
  RotateCw,
  Eye,
  Calendar,
  User,
  Table as TableIcon,
  Activity,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { listarLogsAuditoria, LogAuditoriaItem, AcaoAuditoria } from '@/services/auditoria'
import { listarUsuarios, Usuario } from '@/services/usuarios'
import { usePermissoes } from '@/contexts/PermissoesContext'
import AcessoNegado from '@/components/AcessoNegado'

export const LogAuditoriaPage: React.FC = () => {
  const { administrador } = usePermissoes()

  const [logs, setLogs] = useState<LogAuditoriaItem[]>([])
  const [totalItens, setTotalItens] = useState(0)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina] = useState(20)
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [usuarioId, setUsuarioId] = useState('todos')
  const [tabela, setTabela] = useState('todas')
  const [acao, setAcao] = useState('todas')

  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Modal de Detalhes
  const [logSelecionado, setLogSelecionado] = useState<LogAuditoriaItem | null>(null)

  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        const uRes = await listarUsuarios({ perPage: 100 })
        setUsuarios(uRes.items)
      } catch (err) {
        console.error('Erro ao carregar lista de usuários para filtro:', err)
      }
    }
    carregarUsuarios()
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const res = await listarLogsAuditoria({
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        usuario_id: usuarioId,
        tabela: tabela,
        acao: acao,
        page: paginaAtual,
        perPage: itensPorPagina,
      })
      setLogs(res.items)
      setTotalItens(res.totalItems)
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar logs',
        description: 'Não foi possível buscar os registros de auditoria.',
      })
    } finally {
      setCarregando(false)
    }
  }, [dataInicio, dataFim, usuarioId, tabela, acao, paginaAtual, itensPorPagina])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Se não for administrador, bloqueia a tela inteira (requisito explícito)
  if (!administrador) {
    return (
      <AcessoNegado mensagem="A tela de Log de Auditoria é restrita exclusivamente a administradores do ERP." />
    )
  }

  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1

  const formatarData = (iso?: string) => {
    if (!iso) return '-'
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const renderBadgeAcao = (acao: AcaoAuditoria | string) => {
    switch (acao) {
      case 'inclusao':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
            Inclusão
          </Badge>
        )
      case 'alteracao':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold">
            Alteração
          </Badge>
        )
      case 'inativacao':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
            Inativação
          </Badge>
        )
      case 'ativacao':
        return (
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-semibold">
            Ativação
          </Badge>
        )
      case 'exclusao':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-semibold">
            Exclusão
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {acao}
          </Badge>
        )
    }
  }

  // Compara campos alterados
  const renderComparacao = () => {
    if (!logSelecionado) return null
    const antes = (logSelecionado.valores_antes || {}) as Record<string, unknown>
    const depois = (logSelecionado.valores_depois || {}) as Record<string, unknown>

    const todasChaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).filter(
      (k) => k !== 'updated' && k !== 'created' && k !== 'id',
    )

    if (todasChaves.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
          Nenhum detalhe de campo gravado neste registro.
        </div>
      )
    }

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2 px-3 w-1/4">Campo</th>
              <th className="py-2 px-3 w-3/8 text-red-700 bg-red-50/50">Valor Antes</th>
              <th className="py-2 px-3 w-3/8 text-emerald-700 bg-emerald-50/50">Valor Depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
            {todasChaves.map((chave) => {
              const valAntes = antes[chave]
              const valDepois = depois[chave]

              const strAntes =
                valAntes === undefined || valAntes === null
                  ? '<vazio>'
                  : typeof valAntes === 'object'
                    ? JSON.stringify(valAntes)
                    : String(valAntes)

              const strDepois =
                valDepois === undefined || valDepois === null
                  ? '<vazio>'
                  : typeof valDepois === 'object'
                    ? JSON.stringify(valDepois)
                    : String(valDepois)

              const mudou = strAntes !== strDepois

              return (
                <tr
                  key={chave}
                  className={`hover:bg-slate-50 transition-colors ${mudou ? 'bg-amber-50/30' : ''}`}
                >
                  <td className="py-2 px-3 font-semibold text-slate-800 break-all font-sans">
                    {chave}
                  </td>
                  <td
                    className={`py-2 px-3 break-all text-slate-600 ${
                      mudou ? 'bg-red-50/40 text-red-900 font-medium' : ''
                    }`}
                  >
                    {strAntes}
                  </td>
                  <td
                    className={`py-2 px-3 break-all text-slate-600 ${
                      mudou ? 'bg-emerald-50/40 text-emerald-900 font-medium' : ''
                    }`}
                  >
                    {strDepois}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Log de Auditoria
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Rastreabilidade e histórico de operações realizadas nas tabelas do sistema (exclusivo
            para administradores)
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={carregarDados}
          className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 self-start sm:self-auto"
        >
          <RotateCw size={14} />
          <span>Atualizar Logs</span>
        </Button>
      </div>

      {/* Painel de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Data Início */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <Calendar size={12} />
              <span>Data Inicial</span>
            </label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value)
                setPaginaAtual(1)
              }}
              className="text-xs h-8"
            />
          </div>

          {/* Data Fim */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <Calendar size={12} />
              <span>Data Final</span>
            </label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value)
                setPaginaAtual(1)
              }}
              className="text-xs h-8"
            />
          </div>

          {/* Usuário */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <User size={12} />
              <span>Operador</span>
            </label>
            <Select
              value={usuarioId}
              onValueChange={(val) => {
                setUsuarioId(val)
                setPaginaAtual(1)
              }}
            >
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos" className="text-xs">
                  Todos os Operadores
                </SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.auth_user_id || u.id} className="text-xs">
                    {u.nome} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <TableIcon size={12} />
              <span>Tabela</span>
            </label>
            <Select
              value={tabela}
              onValueChange={(val) => {
                setTabela(val)
                setPaginaAtual(1)
              }}
            >
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas" className="text-xs">
                  Todas as Tabelas
                </SelectItem>
                <SelectItem value="empresas" className="text-xs">
                  empresas
                </SelectItem>
                <SelectItem value="usuarios" className="text-xs">
                  usuarios
                </SelectItem>
                <SelectItem value="perfis_acesso" className="text-xs">
                  perfis_acesso
                </SelectItem>
                <SelectItem value="permissoes" className="text-xs">
                  permissoes
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ação */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <Activity size={12} />
              <span>Ação</span>
            </label>
            <Select
              value={acao}
              onValueChange={(val) => {
                setAcao(val)
                setPaginaAtual(1)
              }}
            >
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas" className="text-xs">
                  Todas as Ações
                </SelectItem>
                <SelectItem value="inclusao" className="text-xs">
                  Inclusão
                </SelectItem>
                <SelectItem value="alteracao" className="text-xs">
                  Alteração
                </SelectItem>
                <SelectItem value="inativacao" className="text-xs">
                  Inativação
                </SelectItem>
                <SelectItem value="ativacao" className="text-xs">
                  Ativação
                </SelectItem>
                <SelectItem value="exclusao" className="text-xs">
                  Exclusão
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(dataInicio ||
          dataFim ||
          usuarioId !== 'todos' ||
          tabela !== 'todas' ||
          acao !== 'todas') && (
          <div className="pt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDataInicio('')
                setDataFim('')
                setUsuarioId('todos')
                setTabela('todas')
                setAcao('todas')
                setPaginaAtual(1)
              }}
              className="text-xs text-blue-600 hover:text-blue-800 h-7 px-2"
            >
              Limpar Filtros
            </Button>
          </div>
        )}
      </div>

      {/* Tabela de Logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Tabela</th>
                <th className="py-3 px-4">Registro ID</th>
                <th className="py-3 px-4 text-center">Ação</th>
                <th className="py-3 px-4 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando logs de auditoria...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText size={32} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-700">Nenhum evento registrado</p>
                      <p className="text-xs text-slate-400">
                        Não há registros de auditoria correspondentes aos filtros selecionados
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => setLogSelecionado(log)}
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      {formatarData(log.created)}
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-900">
                      {log.usuario_nome || 'Sistema'}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-blue-600">{log.tabela}</td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-[120px] truncate">
                      {log.registro_id}
                    </td>

                    <td className="py-3 px-4 text-center">{renderBadgeAcao(log.acao)}</td>

                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLogSelecionado(log)}
                        className="h-7 text-xs px-2 gap-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Eye size={13} />
                        <span>Ver Diferenças</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela com paginação */}
        <div className="py-3 px-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Mostrando <span className="font-semibold text-slate-700">{logs.length}</span> de{' '}
            <span className="font-semibold text-slate-700">{totalItens}</span> eventos gravados
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual <= 1}
              onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              className="h-7 text-xs px-2.5 border-slate-200"
            >
              Anterior
            </Button>
            <span className="text-xs px-2 font-medium text-slate-700">
              {paginaAtual} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
              className="h-7 text-xs px-2.5 border-slate-200"
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de visualização de diferenças (valores antes e depois) */}
      <Dialog
        open={Boolean(logSelecionado)}
        onOpenChange={(open) => !open && setLogSelecionado(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-600">
              <FileText size={20} />
              <DialogTitle className="text-base text-slate-900">Detalhes da Auditoria</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Registro de alteração gravado no log do sistema
            </DialogDescription>
          </DialogHeader>

          {logSelecionado && (
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Data / Hora</span>
                  <span className="font-medium text-slate-800">
                    {formatarData(logSelecionado.created)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Usuário</span>
                  <span className="font-medium text-slate-800">
                    {logSelecionado.usuario_nome || 'Sistema'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Tabela</span>
                  <span className="font-mono text-blue-600 font-semibold">
                    {logSelecionado.tabela}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Ação</span>
                  <div className="mt-0.5">{renderBadgeAcao(logSelecionado.acao)}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-800 mb-2">
                  Comparativo de Campos (Antes vs. Depois)
                </h4>
                {renderComparacao()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LogAuditoriaPage
