import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Plus,
  Search,
  Edit2,
  Power,
  RotateCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Building2,
  ShieldCheck,
  UserCheck,
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
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import {
  Usuario,
  listarUsuarios,
  inativarUsuario,
  ativarUsuario,
  redefinirSenhaUsuario,
} from '@/services/usuarios'
import { listarTodosPerfisAtivos, PerfilAcesso } from '@/services/perfis'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { formatarCPF } from '@/lib/validacoes'

export const UsuariosLista: React.FC = () => {
  const navigate = useNavigate()
  const { pode, usuarioERP, administrador } = usePermissoes()

  const podeCriar = pode('usuarios', 'criar')
  const podeEditar = pode('usuarios', 'editar')
  const podeExcluir = pode('usuarios', 'excluir')

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([])
  const [totalItens, setTotalItens] = useState(0)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina] = useState(20)
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [perfilFiltro, setPerfilFiltro] = useState<string>('todos')
  const [situacao, setSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Diálogo de confirmação de inativação
  const [usuarioParaInativar, setUsuarioParaInativar] = useState<Usuario | null>(null)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Diálogo de redefinição de senha
  const [usuarioParaSenha, setUsuarioParaSenha] = useState<Usuario | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [redefinindoSenha, setRedefinindoSenha] = useState(false)

  useEffect(() => {
    const carregarPerfisFiltro = async () => {
      try {
        const list = await listarTodosPerfisAtivos()
        setPerfis(list)
      } catch (err) {
        console.error('Erro ao carregar perfis para filtro:', err)
      }
    }
    carregarPerfisFiltro()
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true)
      const resultado = await listarUsuarios({
        busca,
        perfil_id: perfilFiltro,
        situacao,
        page: paginaAtual,
        perPage: itensPorPagina,
      })
      setUsuarios(resultado.items)
      setTotalItens(resultado.totalItems)
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar usuários',
        description: 'Não foi possível listar os usuários do sistema.',
      })
    } finally {
      setCarregando(false)
    }
  }, [busca, perfilFiltro, situacao, paginaAtual, itensPorPagina])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1

  const handleConfirmarInativacao = async () => {
    if (!usuarioParaInativar) return
    try {
      setProcessandoAcao(true)
      await inativarUsuario(usuarioParaInativar.id)
      toast({
        title: 'Usuário inativado',
        description: `O usuário ${usuarioParaInativar.nome} foi inativado e seu login bloqueado.`,
      })
      setUsuarioParaInativar(null)
      carregarDados()
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar usuário',
        description: 'Não foi possível inativar o usuário.',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  const handleReativar = async (u: Usuario) => {
    try {
      setCarregando(true)
      await ativarUsuario(u.id)
      toast({
        title: 'Usuário reativado',
        description: `O usuário ${u.nome} foi reativado com sucesso. Caso necessário, redefina a senha para novo acesso.`,
      })
      carregarDados()
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao reativar usuário',
        description: 'Não foi possível reativar o usuário.',
      })
    } finally {
      setCarregando(false)
    }
  }

  const handleSalvarNovaSenha = async () => {
    if (!usuarioParaSenha) return
    if (!novaSenha || novaSenha.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Senha inválida',
        description: 'A nova senha provisória deve possuir no mínimo 8 caracteres.',
      })
      return
    }

    try {
      setRedefinindoSenha(true)
      await redefinirSenhaUsuario(usuarioParaSenha.id, novaSenha)
      toast({
        title: 'Senha redefinida',
        description: `A nova senha de acesso para ${usuarioParaSenha.nome} foi definida com sucesso.`,
      })
      setUsuarioParaSenha(null)
      setNovaSenha('')
    } catch (err: unknown) {
      console.error(err)
      const msg = (err as { message?: string })?.message || 'Falha ao redefinir a senha do usuário.'
      toast({
        variant: 'destructive',
        title: 'Erro ao redefinir senha',
        description: msg,
      })
    } finally {
      setRedefinindoSenha(false)
    }
  }

  const formatarData = (iso?: string) => {
    if (!iso) return 'Nunca acessou'
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const exportarCSV = () => {
    if (usuarios.length === 0) {
      toast({ description: 'Não há registros para exportar.' })
      return
    }

    const cabecalho = ['ID', 'Nome', 'E-mail', 'CPF', 'Perfil', 'Situação', 'Último Acesso']
    const linhas = usuarios.map((u) => [
      u.id,
      `"${u.nome.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.cpf || ''}"`,
      `"${u.expand?.perfil_id?.nome || ''}"`,
      u.ativo ? 'Ativo' : 'Inativo',
      `"${formatarData(u.ultimo_acesso)}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [cabecalho.join(','), ...linhas.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `usuarios_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Usuários
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Gestão de operadores, credenciais de acesso, perfis e filiais autorizadas
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
              onClick={() => navigate('/cadastros/usuarios/novo')}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
            >
              <Plus size={16} />
              <span>Novo Usuário</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPaginaAtual(1)
            }}
            placeholder="Buscar por nome, e-mail ou CPF..."
            className="pl-9 text-xs h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro Perfil */}
          <Select
            value={perfilFiltro}
            onValueChange={(val) => {
              setPerfilFiltro(val)
              setPaginaAtual(1)
            }}
          >
            <SelectTrigger className="w-[160px] text-xs h-9">
              <SelectValue placeholder="Perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos" className="text-xs">
                Todos os Perfis
              </SelectItem>
              {perfis.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Situação */}
          <Select
            value={situacao}
            onValueChange={(val: 'todos' | 'ativos' | 'inativos') => {
              setSituacao(val)
              setPaginaAtual(1)
            }}
          >
            <SelectTrigger className="w-[130px] text-xs h-9">
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
                <th className="py-3.5 px-4">Nome</th>
                <th className="py-3.5 px-4">E-mail</th>
                <th className="py-3.5 px-4">Perfil</th>
                <th className="py-3.5 px-4 hidden lg:table-cell">Empresa Padrão</th>
                <th className="py-3.5 px-4 text-center">Situação</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Último Acesso</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando usuários...</span>
                    </div>
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users size={32} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-700">
                        Nenhum usuário encontrado
                      </p>
                      <p className="text-xs text-slate-400">
                        Ajuste os filtros de busca ou cadastre um novo usuário
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const perfilNome = u.expand?.perfil_id?.nome || 'Sem perfil'
                  const isAdmin = Boolean(u.expand?.perfil_id?.administrador)
                  const empPadrao = u.expand?.empresa_padrao_id
                  const isCurrentUser = usuarioERP?.id === u.id

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      onClick={() => {
                        if (podeEditar) {
                          navigate(`/cadastros/usuarios/${u.id}/editar`)
                        }
                      }}
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {u.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5">
                              {u.nome}
                              {isCurrentUser && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1 py-0 bg-blue-100 text-blue-800 border-blue-200"
                                >
                                  Você
                                </Badge>
                              )}
                            </span>
                            {u.cpf && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                CPF: {formatarCPF(u.cpf)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {u.email}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5">
                          {isAdmin ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium gap-1"
                            >
                              <ShieldCheck size={11} className="text-amber-600" />
                              {perfilNome}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] font-medium"
                            >
                              {perfilNome}
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 hidden lg:table-cell text-slate-600">
                        {empPadrao ? (
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            <Building2 size={12} className="text-slate-400" />
                            {empPadrao.codigo} - {empPadrao.nome_fantasia || empPadrao.razao_social}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Não definida</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {u.ativo ? (
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

                      <td className="py-3.5 px-4 hidden md:table-cell text-slate-500 text-[11px]">
                        {formatarData(u.ultimo_acesso)}
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUsuarioParaSenha(u)
                                setNovaSenha('')
                              }}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                              title="Redefinir senha do usuário"
                            >
                              <KeyRound size={14} />
                            </Button>
                          )}

                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/cadastros/usuarios/${u.id}/editar`)}
                              className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                              title="Editar Usuário"
                            >
                              <Edit2 size={14} />
                            </Button>
                          )}

                          {u.ativo
                            ? podeExcluir && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setUsuarioParaInativar(u)}
                                  disabled={isCurrentUser}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                  title={
                                    isCurrentUser
                                      ? 'Você não pode inativar seu próprio usuário'
                                      : 'Inativar usuário (bloqueia o login)'
                                  }
                                >
                                  <Power size={14} />
                                </Button>
                              )
                            : podeEditar && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReativar(u)}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                  title="Reativar usuário"
                                >
                                  <RotateCw size={14} />
                                </Button>
                              )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela com paginação */}
        <div className="py-3 px-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Mostrando <span className="font-semibold text-slate-700">{usuarios.length}</span> de{' '}
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
        open={Boolean(usuarioParaInativar)}
        onOpenChange={(open) => !open && setUsuarioParaInativar(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={20} />
              <DialogTitle className="text-base text-slate-900">Inativar Usuário</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-2">
              Deseja inativar o usuário{' '}
              <strong className="text-slate-800">"{usuarioParaInativar?.nome}"</strong>?
              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-red-800 text-xs leading-relaxed">
                Ao inativar este usuário, o <strong>acesso ao login será bloqueado</strong>{' '}
                imediatamente no Skip Cloud. Os dados históricos e vínculos de auditoria são
                preservados intactos.
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUsuarioParaInativar(null)}
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

      {/* Diálogo de redefinição de senha */}
      <Dialog
        open={Boolean(usuarioParaSenha)}
        onOpenChange={(open) => !open && setUsuarioParaSenha(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-600">
              <KeyRound size={20} />
              <DialogTitle className="text-base text-slate-900">
                Redefinir Senha de Acesso
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Informe a nova senha de acesso provisória para o usuário{' '}
              <strong className="text-slate-800">{usuarioParaSenha?.nome}</strong> (
              {usuarioParaSenha?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nova_senha" className="text-xs font-medium text-slate-700">
                Nova Senha Provisória <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nova_senha"
                type="password"
                placeholder="Mínimo de 8 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="text-xs h-9"
              />
              <p className="text-[11px] text-slate-400">
                O usuário poderá utilizar esta nova senha imediatamente na tela de login.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setUsuarioParaSenha(null)
                setNovaSenha('')
              }}
              disabled={redefinindoSenha}
              className="text-xs border-slate-200"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarNovaSenha}
              disabled={redefinindoSenha || !novaSenha || novaSenha.length < 8}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {redefinindoSenha ? 'Redefinindo...' : 'Salvar Nova Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default UsuariosLista
