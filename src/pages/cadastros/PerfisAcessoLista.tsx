import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Plus,
  Search,
  Edit2,
  Power,
  RotateCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Layers,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import {
  PerfilAcesso,
  listarPerfis,
  inativarPerfil,
  ativarPerfil,
  verificarUsoPerfil,
} from '@/services/perfis'
import { usePermissoes } from '@/contexts/PermissoesContext'

export const PerfisAcessoLista: React.FC = () => {
  const navigate = useNavigate()
  const { pode } = usePermissoes()

  const podeCriar = pode('perfis_acesso', 'criar')
  const podeEditar = pode('perfis_acesso', 'editar')
  const podeExcluir = pode('perfis_acesso', 'excluir')

  const [perfis, setPerfis] = useState<PerfilAcesso[]>([])
  const [totalItens, setTotalItens] = useState(0)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina] = useState(20)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Diálogo de confirmação para inativação
  const [perfilParaInativar, setPerfilParaInativar] = useState<PerfilAcesso | null>(null)
  const [usuariosVinculados, setUsuariosVinculados] = useState<number>(0)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const resultado = await listarPerfis({
        busca,
        situacao,
        page: paginaAtual,
        perPage: itensPorPagina,
      })
      setPerfis(resultado.items)
      setTotalItens(resultado.totalItems)
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar perfis',
        description: 'Não foi possível carregar a listagem de perfis de acesso.',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, situacao, paginaAtual, itensPorPagina])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1

  const handleInativarClick = async (perfil: PerfilAcesso) => {
    setPerfilParaInativar(perfil)
    const uso = await verificarUsoPerfil(perfil.id)
    setUsuariosVinculados(uso)
  }

  const handleConfirmarInativacao = async () => {
    if (!perfilParaInativar) return
    try {
      setProcessandoAcao(true)
      await inativarPerfil(perfilParaInativar.id)
      toast({
        title: 'Perfil inativado com sucesso',
        description: `O perfil "${perfilParaInativar.nome}" foi inativado.`,
      })
      setPerfilParaInativar(null)
      carregarDados()
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar perfil',
        description: 'Ocorreu uma falha ao tentar inativar o perfil de acesso.',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleReativar = async (perfil: PerfilAcesso) => {
    try {
      setCarregando(true)
      await ativarPerfil(perfil.id)
      toast({
        title: 'Perfil reativado',
        description: `O perfil "${perfil.nome}" foi reativado com sucesso.`,
      })
      carregarDados()
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao reativar perfil',
        description: 'Não foi possível reativar o perfil de acesso.',
      })
    } finally {
      setCarregando(false)
    }
  }

  const exportarCSV = () => {
    if (perfis.length === 0) {
      toast({
        description: 'Não há registros para exportar.',
      })
      return
    }

    const cabecalho = ['ID', 'Nome', 'Descrição', 'Administrador', 'Situação']
    const linhas = perfis.map((p) => [
      p.id,
      `"${p.nome.replace(/"/g, '""')}"`,
      `"${(p.descricao || '').replace(/"/g, '""')}"`,
      p.administrador ? 'Sim' : 'Não',
      p.ativo ? 'Ativo' : 'Inativo',
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [cabecalho.join(','), ...linhas.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `perfis_acesso_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Perfis de Acesso
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gerencie os níveis de acesso e a matriz de permissões por módulo do sistema
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
            title="Exportar para CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exportar</span>
          </Button>

          {podeCriar && (
            <Button
              size="sm"
              onClick={() => navigate('/cadastros/perfis-acesso/novo')}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
            >
              <Plus size={16} />
              <span>Novo Perfil</span>
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPaginaAtual(1)
            }}
            placeholder="Buscar por nome ou descrição do perfil..."
            className="pl-9 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={situacao}
            onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
              setSituacao(val)
              setPaginaAtual(1)
            }}
          >
            <SelectTrigger className="w-[140px] text-xs h-9">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos" className="text-xs">
                Apenas Ativos
              </SelectItem>
              <SelectItem value="inativos" className="text-xs">
                Apenas Inativos
              </SelectItem>
              <SelectItem value="todos" className="text-xs">
                Todos
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={carregarDados}
            className="h-9 px-2 text-slate-500 hover:text-slate-800"
            title="Recarregar"
          >
            <RotateCw size={15} />
          </Button>
        </div>
      </div>

      {/* Tabela de Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nome do Perfil</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Descrição</th>
                <th className="py-3.5 px-4 text-center">Tipo de Acesso</th>
                <th className="py-3.5 px-4 text-center">Situação</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando perfis de acesso...</span>
                    </div>
                  </td>
                </tr>
              ) : perfis.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers size={32} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-700">Nenhum perfil encontrado</p>
                      <p className="text-xs text-slate-400">
                        Ajuste os filtros de busca ou cadastre um novo perfil
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                perfis.map((perfil) => (
                  <tr
                    key={perfil.id}
                    className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (podeEditar) {
                        navigate(`/cadastros/perfis-acesso/${perfil.id}/editar`)
                      }
                    }}
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        {perfil.administrador ? (
                          <Shield size={15} className="text-amber-500 flex-shrink-0" />
                        ) : (
                          <ShieldCheck size={15} className="text-blue-500 flex-shrink-0" />
                        )}
                        <span>{perfil.nome}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 hidden md:table-cell text-slate-600 max-w-md truncate">
                      {perfil.descricao || '-'}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {perfil.administrador ? (
                        <Badge
                          variant="secondary"
                          className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium"
                        >
                          Acesso Total (Admin)
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] font-medium"
                        >
                          Personalizado
                        </Badge>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {perfil.ativo ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={12} />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          <XCircle size={12} />
                          Inativo
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/cadastros/perfis-acesso/${perfil.id}/editar`)}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar Perfil e Permissões"
                          >
                            <Edit2 size={14} />
                          </Button>
                        )}

                        {perfil.ativo
                          ? podeExcluir && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleInativarClick(perfil)}
                                disabled={perfil.administrador && perfil.nome === 'Administrador'}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                title={
                                  perfil.administrador && perfil.nome === 'Administrador'
                                    ? 'O perfil Administrador raiz não pode ser inativado'
                                    : 'Inativar perfil'
                                }
                              >
                                <Power size={14} />
                              </Button>
                            )
                          : podeEditar && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReativar(perfil)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                title="Reativar perfil"
                              >
                                <RotateCw size={14} />
                              </Button>
                            )}
                      </div>
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
            Mostrando <span className="font-semibold text-slate-700">{perfis.length}</span> de{' '}
            <span className="font-semibold text-slate-700">{totalItens}</span> registros
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

      {/* Diálogo de confirmação de inativação */}
      <Dialog
        open={Boolean(perfilParaInativar)}
        onOpenChange={(open) => !open && setPerfilParaInativar(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={20} />
              <DialogTitle className="text-base text-slate-900">
                Inativar Perfil de Acesso
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-2">
              Você tem certeza de que deseja inativar o perfil{' '}
              <strong className="text-slate-800">"{perfilParaInativar?.nome}"</strong>?
              {usuariosVinculados > 0 && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs leading-relaxed">
                  Atenção: Existem <strong>{usuariosVinculados}</strong> usuário(s) associado(s) a
                  este perfil. Conforme as regras do sistema, o registro não é excluído fisicamente
                  mas sim inativado (ativo = false).
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPerfilParaInativar(null)}
              disabled={processandoAcao}
              className="text-xs border-slate-200"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmarInativacao}
              disabled={processandoAcao}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              {processandoAcao ? 'Inativando...' : 'Confirmar Inativação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PerfisAcessoLista
