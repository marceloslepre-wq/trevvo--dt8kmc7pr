import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ShieldCheck,
  ArrowLeft,
  Save,
  Shield,
  CheckSquare,
  Square,
  Info,
  Check,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'
import {
  MODULOS_SISTEMA,
  ModuloSistema,
  obterPerfil,
  obterPermissoesPorPerfil,
  salvarPerfilComPermissoes,
} from '@/services/perfis'
import { usePermissoes } from '@/contexts/PermissoesContext'

type AcaoTipo = 'pode_ver' | 'pode_criar' | 'pode_editar' | 'pode_excluir'

export const PerfilAcessoForm: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const ehEdicao = Boolean(id)
  const { recarregarPermissoes } = usePermissoes()

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [administrador, setAdministrador] = useState(false)
  const [ativo, setAtivo] = useState(true)

  // Matriz de permissões: [modulo]: { pode_ver, pode_criar, pode_editar, pode_excluir }
  const [permissoes, setPermissoes] = useState<
    Record<
      string,
      { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_excluir: boolean }
    >
  >({})

  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [houveAlteracao, setHouveAlteracao] = useState(false)

  // Inicializa matriz vazia
  const inicializarMatrizVazia = () => {
    const estadoInicial: Record<
      string,
      { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_excluir: boolean }
    > = {}
    MODULOS_SISTEMA.forEach((m) => {
      estadoInicial[m.id] = {
        pode_ver: false,
        pode_criar: false,
        pode_editar: false,
        pode_excluir: false,
      }
    })
    return estadoInicial
  }

  useEffect(() => {
    const carregarPerfil = async () => {
      if (!id) {
        setPermissoes(inicializarMatrizVazia())
        return
      }

      try {
        setCarregando(true)
        const p = await obterPerfil(id)
        setNome(p.nome)
        setDescricao(p.descricao || '')
        setAdministrador(Boolean(p.administrador))
        setAtivo(p.ativo !== undefined ? p.ativo : true)

        const perms = await obterPermissoesPorPerfil(id)
        const mapa: Record<
          string,
          { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_excluir: boolean }
        > = {}

        MODULOS_SISTEMA.forEach((m) => {
          const item = perms[m.id]
          mapa[m.id] = {
            pode_ver: Boolean(item?.pode_ver),
            pode_criar: Boolean(item?.pode_criar),
            pode_editar: Boolean(item?.pode_editar),
            pode_excluir: Boolean(item?.pode_excluir),
          }
        })

        setPermissoes(mapa)
      } catch (err) {
        console.error(err)
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar perfil',
          description: 'Não foi possível carregar as informações do perfil de acesso.',
        })
        navigate('/cadastros/perfis-acesso')
      } finally {
        setCarregando(false)
      }
    }

    carregarPerfil()
  }, [id, navigate])

  const marcarAlteracao = () => {
    if (!houveAlteracao) setHouveAlteracao(true)
  }

  const handleTogglePermissao = (modulo: ModuloSistema, acao: AcaoTipo) => {
    marcarAlteracao()
    setPermissoes((prev) => {
      const atual = prev[modulo] || {
        pode_ver: false,
        pode_criar: false,
        pode_editar: false,
        pode_excluir: false,
      }
      const novoValor = !atual[acao]

      const atualizado = {
        ...atual,
        [acao]: novoValor,
      }

      // Regra de consistência ergonômica: se marcou criar, editar ou excluir, automaticamente precisa de "ver"
      if (novoValor && acao !== 'pode_ver') {
        atualizado.pode_ver = true
      }
      // Se desmarcou "ver", desmarca criar, editar e excluir
      if (!novoValor && acao === 'pode_ver') {
        atualizado.pode_criar = false
        atualizado.pode_editar = false
        atualizado.pode_excluir = false
      }

      return {
        ...prev,
        [modulo]: atualizado,
      }
    })
  }

  // Atalho da linha (módulo): marcar ou desmarcar todas as 4 ações da linha
  const handleAlternarLinha = (modulo: ModuloSistema) => {
    marcarAlteracao()
    setPermissoes((prev) => {
      const atual = prev[modulo]
      const todasMarcadas =
        atual?.pode_ver && atual?.pode_criar && atual?.pode_editar && atual?.pode_excluir

      const novoEstado = !todasMarcadas
      return {
        ...prev,
        [modulo]: {
          pode_ver: novoEstado,
          pode_criar: novoEstado,
          pode_editar: novoEstado,
          pode_excluir: novoEstado,
        },
      }
    })
  }

  // Atalho da coluna (ação: Ver, Criar, Editar, Excluir): marcar ou desmarcar toda a coluna
  const handleAlternarColuna = (acao: AcaoTipo) => {
    marcarAlteracao()
    setPermissoes((prev) => {
      const todasMarcadas = MODULOS_SISTEMA.every((m) => prev[m.id]?.[acao])
      const novoEstado = !todasMarcadas

      const copia = { ...prev }
      MODULOS_SISTEMA.forEach((m) => {
        const item = { ...copia[m.id] }
        item[acao] = novoEstado

        if (novoEstado && acao !== 'pode_ver') {
          item.pode_ver = true
        }
        if (!novoEstado && acao === 'pode_ver') {
          item.pode_criar = false
          item.pode_editar = false
          item.pode_excluir = false
        }

        copia[m.id] = item
      })

      return copia
    })
  }

  // Marcar tudo na matriz inteira
  const handleMarcarTudoGeral = (marcar: boolean) => {
    marcarAlteracao()
    const novo: Record<
      string,
      { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_excluir: boolean }
    > = {}
    MODULOS_SISTEMA.forEach((m) => {
      novo[m.id] = {
        pode_ver: marcar,
        pode_criar: marcar,
        pode_editar: marcar,
        pode_excluir: marcar,
      }
    })
    setPermissoes(novo)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Por favor, informe o nome do perfil de acesso.',
      })
      return
    }

    try {
      setSalvando(true)
      await salvarPerfilComPermissoes(
        {
          id,
          nome: nome.trim(),
          descricao: descricao.trim(),
          administrador,
          ativo,
        },
        permissoes,
      )

      await recarregarPermissoes()

      toast({
        title: ehEdicao ? 'Perfil atualizado' : 'Perfil cadastrado',
        description: `O perfil "${nome}" foi salvo com sucesso.`,
      })
      setHouveAlteracao(false)
      navigate('/cadastros/perfis-acesso')
    } catch (err: unknown) {
      console.error(err)
      const msg = (err as { message?: string })?.message || 'Falha ao salvar o perfil de acesso.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <div className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Carregando dados do perfil...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <button
            type="button"
            onClick={() => {
              if (
                houveAlteracao &&
                !confirm('Existem alterações não salvas. Deseja realmente sair?')
              ) {
                return
              }
              navigate('/cadastros/perfis-acesso')
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Voltar para a listagem</span>
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              {ehEdicao ? `Editar Perfil: ${nome}` : 'Novo Perfil de Acesso'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Defina o nome, tipo de privilégio e a matriz de permissões por módulo
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/cadastros/perfis-acesso')}
            disabled={salvando}
            className="text-xs border-slate-200 text-slate-700"
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            size="sm"
            disabled={salvando}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Save size={15} />
            <span>{salvando ? 'Salvando...' : 'Salvar Perfil'}</span>
          </Button>
        </div>
      </div>

      {houveAlteracao && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3.5 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs">
          <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
          <span>Você possui alterações não salvas neste perfil.</span>
        </div>
      )}

      {/* Seção 1: Dados do Perfil */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
          Identificação do Perfil
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome" className="text-xs font-medium text-slate-700">
              Nome do Perfil <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                marcarAlteracao()
              }}
              placeholder="Ex: Gerente Financeiro, Estoquista, Vendedor"
              className="text-xs h-9"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao" className="text-xs font-medium text-slate-700">
              Descrição do Perfil
            </Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => {
                setDescricao(e.target.value)
                marcarAlteracao()
              }}
              placeholder="Descreva as responsabilidades ou propósito deste perfil..."
              className="text-xs min-h-[38px] h-9 resize-none"
              rows={1}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Opção Administrador */}
          <div className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-lg border border-amber-200/70 max-w-xl">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="administrador"
                  className="text-xs font-semibold text-slate-900 cursor-pointer"
                >
                  Perfil Administrador (Acesso Total)
                </Label>
                <Switch
                  id="administrador"
                  checked={administrador}
                  onCheckedChange={(val) => {
                    setAdministrador(val)
                    marcarAlteracao()
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-600 leading-normal">
                Quando ativado, os usuários com este perfil têm acesso irrestrito a todos os
                módulos, relatórios, cadastros e a <strong>todas as empresas</strong>, ignorando
                restrições individuais da matriz abaixo.
              </p>
            </div>
          </div>

          {/* Opção Ativo */}
          <div className="flex items-center gap-2.5">
            <Label htmlFor="ativo" className="text-xs font-medium text-slate-700 cursor-pointer">
              Perfil Ativo
            </Label>
            <Switch
              id="ativo"
              checked={ativo}
              onCheckedChange={(val) => {
                setAtivo(val)
                marcarAlteracao()
              }}
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Matriz de Permissões */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Matriz de Permissões por Módulo
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure detalhadamente o que este perfil pode Ver, Criar, Editar ou Excluir
            </p>
          </div>

          {!administrador && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleMarcarTudoGeral(true)}
                className="text-[11px] h-8 px-2.5 gap-1 border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <CheckSquare size={13} className="text-blue-600" />
                <span>Marcar Tudo</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleMarcarTudoGeral(false)}
                className="text-[11px] h-8 px-2.5 gap-1 border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <Square size={13} className="text-slate-400" />
                <span>Desmarcar Tudo</span>
              </Button>
            </div>
          )}
        </div>

        {administrador ? (
          <div className="p-8 text-center bg-amber-50/30">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700 mb-3">
              <Shield size={24} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Modo Administrador Geral Ativo</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
              Este perfil possui privilégio total de superusuário. Todas as permissões são
              concedidas automaticamente para todos os módulos existentes e futuros.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-600 font-semibold select-none">
                <tr>
                  <th className="py-3 px-4 min-w-[200px]">Módulo do Sistema</th>
                  <th className="py-3 px-3 text-center w-28">
                    <button
                      type="button"
                      onClick={() => handleAlternarColuna('pode_ver')}
                      className="hover:text-blue-600 transition-colors inline-flex items-center gap-1 font-semibold"
                      title="Clique para alternar toda a coluna 'Ver'"
                    >
                      <span>Ver</span>
                    </button>
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <button
                      type="button"
                      onClick={() => handleAlternarColuna('pode_criar')}
                      className="hover:text-blue-600 transition-colors inline-flex items-center gap-1 font-semibold"
                      title="Clique para alternar toda a coluna 'Criar'"
                    >
                      <span>Criar</span>
                    </button>
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <button
                      type="button"
                      onClick={() => handleAlternarColuna('pode_editar')}
                      className="hover:text-blue-600 transition-colors inline-flex items-center gap-1 font-semibold"
                      title="Clique para alternar toda a coluna 'Editar'"
                    >
                      <span>Editar</span>
                    </button>
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <button
                      type="button"
                      onClick={() => handleAlternarColuna('pode_excluir')}
                      className="hover:text-blue-600 transition-colors inline-flex items-center gap-1 font-semibold"
                      title="Clique para alternar toda a coluna 'Excluir'"
                    >
                      <span>Excluir</span>
                    </button>
                  </th>
                  <th className="py-3 px-3 text-center w-24">Atalho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MODULOS_SISTEMA.map((modulo, idx) => {
                  const mId = modulo.id
                  const perm = permissoes[mId] || {
                    pode_ver: false,
                    pode_criar: false,
                    pode_editar: false,
                    pode_excluir: false,
                  }
                  const todasMarcadas =
                    perm.pode_ver && perm.pode_criar && perm.pode_editar && perm.pode_excluir

                  return (
                    <tr
                      key={mId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        <div className="flex flex-col">
                          <span>{modulo.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{mId}</span>
                        </div>
                      </td>

                      {/* Ver */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={perm.pode_ver}
                            onCheckedChange={() => handleTogglePermissao(mId, 'pode_ver')}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            aria-label={`Ver ${modulo.label}`}
                          />
                        </div>
                      </td>

                      {/* Criar */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={perm.pode_criar}
                            onCheckedChange={() => handleTogglePermissao(mId, 'pode_criar')}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            aria-label={`Criar ${modulo.label}`}
                          />
                        </div>
                      </td>

                      {/* Editar */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={perm.pode_editar}
                            onCheckedChange={() => handleTogglePermissao(mId, 'pode_editar')}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            aria-label={`Editar ${modulo.label}`}
                          />
                        </div>
                      </td>

                      {/* Excluir */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={perm.pode_excluir}
                            onCheckedChange={() => handleTogglePermissao(mId, 'pode_excluir')}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            aria-label={`Excluir ${modulo.label}`}
                          />
                        </div>
                      </td>

                      {/* Atalho Linha */}
                      <td className="py-2.5 px-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAlternarLinha(mId)}
                          className="h-7 text-[11px] px-2 text-slate-500 hover:text-blue-600"
                          title="Alternar todas as opções desta linha"
                        >
                          {todasMarcadas ? (
                            <span className="text-blue-600 font-medium">Limpar</span>
                          ) : (
                            <span>Todos</span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Dica de usabilidade */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
          <Info size={14} className="text-blue-500 flex-shrink-0" />
          <span>
            Dica: você pode clicar no título de qualquer coluna (Ver, Criar, Editar, Excluir) ou no
            botão "Todos" na linha para marcar/desmarcar rapidamente.
          </span>
        </div>
      </div>
    </form>
  )
}

export default PerfilAcessoForm
