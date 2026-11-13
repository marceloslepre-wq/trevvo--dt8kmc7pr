import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Users, ArrowLeft, Save, KeyRound, Shield, AlertCircle, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  obterUsuario,
  criarUsuarioComLogin,
  atualizarUsuario,
  obterEmpresasDoUsuario,
  redefinirSenhaUsuario,
} from '@/services/usuarios'
import { listarTodosPerfisAtivos, PerfilAcesso } from '@/services/perfis'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import { validarCPF, formatarCPF, formatarTelefone } from '@/lib/validacoes'

export const UsuarioForm: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const ehEdicao = Boolean(id)

  const [abaAtiva, setAbaAtiva] = useState('dados')

  // Aba Dados
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senhaProvisoria, setSenhaProvisoria] = useState('')
  const [ativo, setAtivo] = useState(true)

  // Aba Acesso
  const [perfilId, setPerfilId] = useState('')
  const [empresaPadraoId, setEmpresaPadraoId] = useState<string>('nenhuma')
  const [empresasPermitidas, setEmpresasPermitidas] = useState<string[]>([])

  // Aba Vendas
  const [eVendedor, setEVendedor] = useState(false)
  const [eCaixa, setECaixa] = useState(false)
  const [descontoMaximo, setDescontoMaximo] = useState('0')
  const [comissaoPercentual, setComissaoPercentual] = useState('0')

  // Listas auxiliares
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([])
  const [todasEmpresas, setTodasEmpresas] = useState<Empresa[]>([])

  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [houveAlteracao, setHouveAlteracao] = useState(false)
  const [avisoEmpresaPadrao, setAvisoEmpresaPadrao] = useState(false)

  // Diálogo Redefinir Senha (na edição)
  const [dialogoSenhaAberto, setDialogoSenhaAberto] = useState(false)
  const [novaSenha, setNovaSenha] = useState('')
  const [redefinindoSenha, setRedefinindoSenha] = useState(false)

  const marcarAlteracao = () => {
    if (!houveAlteracao) setHouveAlteracao(true)
  }

  // Carrega listas de perfis e empresas
  useEffect(() => {
    const carregarAuxiliares = async () => {
      try {
        const [listaPerfis, listaEmpresas] = await Promise.all([
          listarTodosPerfisAtivos(),
          listarEmpresasAtivas(),
        ])
        setPerfis(listaPerfis)
        setTodasEmpresas(listaEmpresas)

        // Se for novo cadastro e ainda não tem empresas selecionadas, marca todas por padrão
        if (!ehEdicao && listaEmpresas.length > 0) {
          setEmpresasPermitidas(listaEmpresas.map((e) => e.id))
          const matriz = listaEmpresas.find((e) => e.tipo === 'Matriz') || listaEmpresas[0]
          setEmpresaPadraoId(matriz.id)
        }
      } catch (err) {
        console.error('Erro ao carregar dados auxiliares:', err)
      }
    }
    carregarAuxiliares()
  }, [ehEdicao])

  // Carrega usuário existente
  useEffect(() => {
    const carregarUsuario = async () => {
      if (!id) return

      try {
        setCarregando(true)
        const u = await obterUsuario(id)
        setNome(u.nome)
        setEmail(u.email)
        setCpf(u.cpf ? formatarCPF(u.cpf) : '')
        setTelefone(u.telefone ? formatarTelefone(u.telefone) : '')
        setAtivo(u.ativo !== undefined ? u.ativo : true)
        setPerfilId(u.perfil_id)
        setEmpresaPadraoId(u.empresa_padrao_id || 'nenhuma')
        setEVendedor(Boolean(u.e_vendedor))
        setECaixa(Boolean(u.e_caixa))
        setDescontoMaximo(String(u.desconto_maximo_percentual ?? 0))
        setComissaoPercentual(String(u.comissao_percentual ?? 0))

        const vinculos = await obterEmpresasDoUsuario(id)
        setEmpresasPermitidas(vinculos.map((v) => v.empresa_id))
      } catch (err) {
        console.error(err)
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar usuário',
          description: 'Não foi possível carregar os dados do usuário.',
        })
        navigate('/cadastros/usuarios')
      } finally {
        setCarregando(false)
      }
    }

    carregarUsuario()
  }, [id, navigate])

  // Toggle único, com updater PURO: nenhum setState dentro do updater
  // (setEmpresaPadraoId chamado dentro do updater de setEmpresasPermitidas
  // alimentava o loop "Maximum update depth exceeded" ao desmarcar empresa).
  const toggleEmpresaPermitida = (empresaId: string) => {
    marcarAlteracao()
    setAvisoEmpresaPadrao(empresaPadraoId === empresaId)
    setEmpresasPermitidas((prev) =>
      prev.includes(empresaId) ? prev.filter((item) => item !== empresaId) : [...prev, empresaId],
    )
    // Desmarcar a "Empresa Padrão ao Entrar" NÃO desmarca/redefine nada
    // automaticamente: apenas mostra o aviso e bloqueia o Salvar (no submit)
    // até o usuário escolher outra empresa padrão entre as marcadas.
  }

  const handleMarcarTodasEmpresas = (marcar: boolean) => {
    marcarAlteracao()
    setAvisoEmpresaPadrao(false)
    setEmpresasPermitidas(marcar ? todasEmpresas.map((e) => e.id) : [])
  }

  const handleTrocarEmpresaPadrao = (val: string) => {
    setEmpresaPadraoId(val)
    setAvisoEmpresaPadrao(false)
    marcarAlteracao()
  }

  const handleRedefinirSenhaSubmit = async () => {
    if (!id) return
    if (!novaSenha || novaSenha.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Senha inválida',
        description: 'A nova senha deve possuir no mínimo 8 caracteres.',
      })
      return
    }

    try {
      setRedefinindoSenha(true)
      await redefinirSenhaUsuario(id, novaSenha)
      toast({
        title: 'Senha redefinida com sucesso',
        description: `A nova senha provisória para ${nome} foi salva.`,
      })
      setDialogoSenhaAberto(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome completo do usuário.',
      })
      setAbaAtiva('dados')
      return
    }

    if (!email.trim() || !email.includes('@')) {
      toast({
        variant: 'destructive',
        title: 'E-mail inválido',
        description: 'Informe um endereço de e-mail corporativo válido.',
      })
      setAbaAtiva('dados')
      return
    }

    if (cpf && !validarCPF(cpf)) {
      toast({
        variant: 'destructive',
        title: 'CPF inválido',
        description: 'O CPF digitado não é válido conforme as regras da Receita Federal.',
      })
      setAbaAtiva('dados')
      return
    }

    if (!ehEdicao) {
      if (!senhaProvisoria || senhaProvisoria.length < 8) {
        toast({
          variant: 'destructive',
          title: 'Senha provisória obrigatória',
          description:
            'Defina uma senha provisória de no mínimo 8 caracteres para o login do usuário.',
        })
        setAbaAtiva('dados')
        return
      }
    }

    if (!perfilId) {
      toast({
        variant: 'destructive',
        title: 'Perfil obrigatório',
        description: 'Selecione o perfil de acesso do usuário na aba Acesso.',
      })
      setAbaAtiva('acesso')
      return
    }

    const descNum = parseFloat(descontoMaximo.replace(',', '.')) || 0
    const comissaoNum = parseFloat(comissaoPercentual.replace(',', '.')) || 0

    if (descNum < 0 || descNum > 100) {
      toast({
        variant: 'destructive',
        title: 'Desconto inválido',
        description: 'O desconto máximo deve estar entre 0% e 100%.',
      })
      setAbaAtiva('vendas')
      return
    }

    if (comissaoNum < 0 || comissaoNum > 100) {
      toast({
        variant: 'destructive',
        title: 'Comissão inválida',
        description: 'O percentual de comissão deve estar entre 0% e 100%.',
      })
      setAbaAtiva('vendas')
      return
    }

    // A "Empresa Padrão ao Entrar" precisa estar entre as empresas marcadas
    if (empresaPadraoId !== 'nenhuma' && !empresasPermitidas.includes(empresaPadraoId)) {
      toast({
        variant: 'destructive',
        title: 'Empresa padrão inválida',
        description:
          'A "Empresa Padrão ao Entrar" foi desmarcada das Empresas/Filiais Permitidas. Escolha outra empresa padrão entre as marcadas antes de salvar.',
      })
      setAbaAtiva('acesso')
      return
    }

    try {
      setSalvando(true)

      const payloadComum = {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf ? cpf.replace(/\D/g, '') : '',
        telefone: telefone ? telefone.replace(/\D/g, '') : '',
        perfil_id: perfilId,
        empresa_padrao_id: empresaPadraoId === 'nenhuma' ? null : empresaPadraoId,
        desconto_maximo_percentual: descNum,
        comissao_percentual: comissaoNum,
        e_vendedor: eVendedor,
        e_caixa: eCaixa,
        empresas_ids: empresasPermitidas,
      }

      if (ehEdicao && id) {
        await atualizarUsuario(id, {
          ...payloadComum,
          ativo,
        })
        toast({
          title: 'Usuário atualizado',
          description: `Os dados do usuário ${nome} foram atualizados com sucesso.`,
        })
      } else {
        await criarUsuarioComLogin({
          ...payloadComum,
          password: senhaProvisoria.trim(),
        })
        toast({
          title: 'Usuário criado com sucesso',
          description: `O usuário ${nome} e sua conta de acesso foram criados no Skip Cloud.`,
        })
      }

      setHouveAlteracao(false)
      navigate('/cadastros/usuarios')
    } catch (err: unknown) {
      console.error(err)
      const msg = (err as { message?: string })?.message || 'Falha ao salvar usuário.'
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
        <p className="text-xs text-slate-500 font-medium">Carregando dados do usuário...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-12">
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
              navigate('/cadastros/usuarios')
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Voltar para a listagem</span>
          </button>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              {ehEdicao ? `Editar Usuário: ${nome}` : 'Novo Usuário do Sistema'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre credenciais, vincule perfis e empresas autorizadas
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ehEdicao && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNovaSenha('')
                setDialogoSenhaAberto(true)
              }}
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
            >
              <KeyRound size={14} className="text-amber-600" />
              <span>Redefinir Senha</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/cadastros/usuarios')}
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
            <span>{salvando ? 'Salvando...' : 'Salvar Usuário'}</span>
          </Button>
        </div>
      </div>

      {houveAlteracao && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3.5 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs">
          <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
          <span>Você possui alterações não salvas neste formulário.</span>
        </div>
      )}

      {avisoEmpresaPadrao && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3.5 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs">
          <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
          <span>
            A "Empresa Padrão ao Entrar" foi desmarcada das Empresas/Filiais Permitidas. Escolha
            outra empresa padrão entre as marcadas antes de salvar.
          </span>
        </div>
      )}

      {/* Abas do Formulário */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
        <TabsList className="bg-slate-100 p-1 border border-slate-200 rounded-lg grid grid-cols-3 max-w-md">
          <TabsTrigger value="dados" className="text-xs font-medium">
            Dados Principais
          </TabsTrigger>
          <TabsTrigger value="acesso" className="text-xs font-medium">
            Acesso & Filiais
          </TabsTrigger>
          <TabsTrigger value="vendas" className="text-xs font-medium">
            Vendas & PDV
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: DADOS */}
        <TabsContent value="dados" className="mt-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
              Identificação do Colaborador
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-xs font-medium text-slate-700">
                  Nome Completo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value)
                    marcarAlteracao()
                  }}
                  placeholder="Ex: Carlos Eduardo da Silva"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  E-mail de Login <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    marcarAlteracao()
                  }}
                  disabled={ehEdicao}
                  placeholder="usuario@empresa.com.br"
                  className="text-xs h-9"
                  required
                />
                {ehEdicao && (
                  <p className="text-[10px] text-slate-400">
                    O e-mail de autenticação é a chave única da conta e não pode ser alterado
                    diretamente.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cpf" className="text-xs font-medium text-slate-700">
                  CPF
                </Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(e) => {
                    setCpf(formatarCPF(e.target.value))
                    marcarAlteracao()
                  }}
                  maxLength={14}
                  placeholder="000.000.000-00"
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telefone" className="text-xs font-medium text-slate-700">
                  Telefone / Celular
                </Label>
                <Input
                  id="telefone"
                  value={telefone}
                  onChange={(e) => {
                    setTelefone(formatarTelefone(e.target.value))
                    marcarAlteracao()
                  }}
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Senha Provisória apenas no cadastro novo */}
            {!ehEdicao && (
              <div className="p-4 bg-blue-50/60 rounded-lg border border-blue-200/70 space-y-2">
                <div className="flex items-center gap-2 text-blue-800 font-semibold text-xs">
                  <KeyRound size={16} />
                  <span>Criação da Conta de Acesso</span>
                </div>
                <p className="text-[11px] text-blue-700 leading-normal">
                  Ao criar este usuário, uma conta de login correspondente será criada
                  automaticamente no Skip Cloud com a senha informada abaixo:
                </p>
                <div className="max-w-md space-y-1 pt-1">
                  <Label htmlFor="senha_provisoria" className="text-xs font-medium text-slate-700">
                    Senha Provisória <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="senha_provisoria"
                    type="password"
                    value={senhaProvisoria}
                    onChange={(e) => {
                      setSenhaProvisoria(e.target.value)
                      marcarAlteracao()
                    }}
                    placeholder="Mínimo 8 caracteres (ex: Skip@Pass2026)"
                    className="text-xs h-9 bg-white"
                    required
                  />
                </div>
              </div>
            )}

            {/* Switch Ativo */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <Label
                  htmlFor="ativo"
                  className="text-xs font-medium text-slate-800 cursor-pointer"
                >
                  Usuário Ativo
                </Label>
                <p className="text-[11px] text-slate-500">
                  Inativar este usuário bloqueia imediatamente o login dele no sistema.
                </p>
              </div>
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
        </TabsContent>

        {/* ABA 2: ACESSO */}
        <TabsContent value="acesso" className="mt-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
            <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
              Perfil e Filiais Autorizadas
            </h2>

            {/* Perfil de Acesso */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="perfil" className="text-xs font-medium text-slate-700">
                  Perfil de Acesso <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={perfilId}
                  onValueChange={(val) => {
                    setPerfilId(val)
                    marcarAlteracao()
                  }}
                >
                  <SelectTrigger id="perfil" className="text-xs h-9">
                    <SelectValue placeholder="Selecione um perfil de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    {perfis.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <Shield
                            size={13}
                            className={p.administrador ? 'text-amber-500' : 'text-blue-500'}
                          />
                          <span>{p.nome}</span>
                          {p.administrador && (
                            <span className="text-[10px] text-amber-600 font-semibold">
                              (Admin Total)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400">
                  Determina a matriz de permissões (ver, criar, editar, excluir) por módulo.
                </p>
              </div>

              {/* Empresa Padrão */}
              <div className="space-y-1.5">
                <Label htmlFor="empresa_padrao" className="text-xs font-medium text-slate-700">
                  Empresa Padrão ao Entrar
                </Label>
                <Select value={empresaPadraoId} onValueChange={handleTrocarEmpresaPadrao}>
                  <SelectTrigger id="empresa_padrao" className="text-xs h-9">
                    <SelectValue placeholder="Selecione a empresa padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma" className="text-xs">
                      Nenhuma (usar primeira autorizada)
                    </SelectItem>
                    {todasEmpresas.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id} className="text-xs">
                        {emp.codigo} - {emp.nome_fantasia || emp.razao_social} ({emp.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400">
                  Empresa pré-selecionada no seletor de empresa ativa ao fazer login.
                </p>
              </div>
            </div>

            {/* Empresas autorizadas com checkboxes nativos */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800">
                    Empresas / Filiais Permitidas
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Marque em quais estabelecimentos este usuário terá autorização de trabalho
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarcarTodasEmpresas(true)}
                    className="text-[11px] h-7 px-2 border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Marcar Todas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarcarTodasEmpresas(false)}
                    className="text-[11px] h-7 px-2 border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Desmarcar Todas
                  </Button>
                </div>
              </div>

              {todasEmpresas.length === 0 ? (
                <div className="p-4 text-center bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
                  Nenhuma empresa cadastrada no sistema.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {todasEmpresas.map((emp) => {
                    const isChecked = empresasPermitidas.includes(emp.id)
                    return (
                      // label envolvendo o input: o clique no cartão OU no checkbox
                      // dispara UM único onChange — sem onClick extra no cartão,
                      // sem duplo toggle e sem o Presence do Radix.
                      <label
                        key={emp.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer select-none ${
                          isChecked
                            ? 'bg-blue-50/60 border-blue-200 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEmpresaPermitida(emp.id)}
                          className="h-4 w-4 flex-shrink-0 accent-blue-600 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs">
                              {emp.codigo} - {emp.nome_fantasia || emp.razao_social}
                            </span>
                            <span className="text-[10px] text-slate-400">({emp.tipo})</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            CNPJ: {emp.cnpj}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ABA 3: VENDAS */}
        <TabsContent value="vendas" className="mt-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
            <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">
              Configurações Comerciais, PDV e Comissão
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <Switch
                  id="e_vendedor"
                  checked={eVendedor}
                  onCheckedChange={(val) => {
                    setEVendedor(val)
                    marcarAlteracao()
                  }}
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="e_vendedor"
                    className="text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    Atua como Vendedor
                  </Label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Habilita o usuário a ser selecionado como vendedor responsável nos pedidos de
                    venda e orçamentos.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <Switch
                  id="e_caixa"
                  checked={eCaixa}
                  onCheckedChange={(val) => {
                    setECaixa(val)
                    marcarAlteracao()
                  }}
                  className="mt-0.5"
                />
                <div>
                  <Label
                    htmlFor="e_caixa"
                    className="text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    Operador de Caixa / PDV
                  </Label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Permite a abertura, fechamento e lançamentos no ponto de venda e frente de
                    caixa.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="desconto_maximo" className="text-xs font-medium text-slate-700">
                  Desconto Máximo Permitido no PDV (%)
                </Label>
                <div className="relative">
                  <Input
                    id="desconto_maximo"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={descontoMaximo}
                    onChange={(e) => {
                      setDescontoMaximo(e.target.value)
                      marcarAlteracao()
                    }}
                    placeholder="0"
                    className="text-xs h-9 pr-8"
                  />
                  <Percent
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Limite percentual de desconto que o operador pode conceder sem liberação de
                  gerente.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="comissao" className="text-xs font-medium text-slate-700">
                  Comissão Padrão do Vendedor (%)
                </Label>
                <div className="relative">
                  <Input
                    id="comissao"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={comissaoPercentual}
                    onChange={(e) => {
                      setComissaoPercentual(e.target.value)
                      marcarAlteracao()
                    }}
                    placeholder="0"
                    className="text-xs h-9 pr-8"
                  />
                  <Percent
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Percentual base de comissão aplicado nas vendas faturadas por este vendedor.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo Redefinir Senha (só existe na edição; montá-lo no cadastro novo
          mantém o Presence do Radix montado sem necessidade e alimentava o loop
          de re-render via refs internas no commit) */}
      {ehEdicao && (
        <Dialog open={dialogoSenhaAberto} onOpenChange={setDialogoSenhaAberto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-blue-600">
                <KeyRound size={20} />
                <DialogTitle className="text-base text-slate-900">
                  Redefinir Senha do Usuário
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                Informe a nova senha provisória para o usuário{' '}
                <strong className="text-slate-800">{nome}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="modal_nova_senha" className="text-xs font-medium text-slate-700">
                  Nova Senha <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="modal_nova_senha"
                  type="password"
                  placeholder="Mínimo de 8 caracteres"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogoSenhaAberto(false)}
                disabled={redefinindoSenha}
                className="text-xs border-slate-200"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleRedefinirSenhaSubmit}
                disabled={redefinindoSenha || !novaSenha || novaSenha.length < 8}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {redefinindoSenha ? 'Salvando...' : 'Salvar Senha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  )
}

export default UsuarioForm
