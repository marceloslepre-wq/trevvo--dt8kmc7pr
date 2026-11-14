import React, { useEffect, useState, useMemo } from 'react'
import {
  Monitor,
  Plus,
  Search,
  Edit2,
  Power,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  Wallet,
  Shield,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  PdvTerminal,
  listarTerminais,
  salvarTerminal,
  ativarTerminal,
  inativarTerminal,
} from '@/services/terminais'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'

export const TerminaisPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  // Módulo pela tabela única de rotas: /vendas/terminais -> configuracoes
  const podeCriar = pode('configuracoes', 'criar')
  const podeEditar = pode('configuracoes', 'editar')

  const [terminais, setTerminais] = useState<PdvTerminal[]>([])
  const [contasCaixaFisico, setContasCaixaFisico] = useState<ContaFinanceira[]>([])
  const [todasContasEmpresa, setTodasContasEmpresa] = useState<ContaFinanceira[]>([])
  const [contaPadraoRecebimentoId, setContaPadraoRecebimentoId] = useState<string | null>(null)

  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<PdvTerminal | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formContaFinanceiraId, setFormContaFinanceiraId] = useState('')
  const [formContaCofreId, setFormContaCofreId] = useState('')
  const [formAtivo, setFormAtivo] = useState(true)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const carregarDados = async () => {
    if (!empresaAtiva) return
    try {
      setCarregando(true)
      const [listaTerminais, contas] = await Promise.all([
        listarTerminais({
          empresa_id: empresaAtiva.id,
          busca,
          situacao: filtroSituacao,
        }),
        listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }),
      ])

      setTerminais(listaTerminais)
      setTodasContasEmpresa(contas)
      setContasCaixaFisico(contas.filter((c) => c.tipo === 'Caixa físico'))

      // Procura conta com conta_padrao_recebimentos = true na mesma empresa
      const contaPadrao = contas.find((c) => c.conta_padrao_recebimentos)
      if (contaPadrao) {
        setContaPadraoRecebimentoId(contaPadrao.id)
      }
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar terminais',
        description: 'Não foi possível listar os terminais da empresa.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [empresaAtiva?.id, filtroSituacao])

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault()
    carregarDados()
  }

  const abrirNovo = () => {
    setEditando(null)
    setFormNome('')
    // Pré-seleciona primeiro caixa físico se houver
    setFormContaFinanceiraId(contasCaixaFisico[0]?.id || '')
    // Sugere conta padrão de recebimentos da empresa como conta cofre para sangrias
    setFormContaCofreId(contaPadraoRecebimentoId || '')
    setFormAtivo(true)
    setErroForm(null)
    setModalAberto(true)
  }

  const abrirEditar = (t: PdvTerminal) => {
    setEditando(t)
    setFormNome(t.nome)
    setFormContaFinanceiraId(t.conta_financeira_id)
    setFormContaCofreId(t.conta_cofre_id || '')
    setFormAtivo(t.ativo)
    setErroForm(null)
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresaAtiva) return
    setErroForm(null)

    if (!formNome.trim()) {
      setErroForm('Informe o nome do terminal (ex: "Caixa 01").')
      return
    }
    if (!formContaFinanceiraId) {
      setErroForm('Selecione uma conta financeira do tipo Caixa Físico.')
      return
    }

    try {
      setSalvando(true)
      await salvarTerminal({
        id: editando ? editando.id : undefined,
        empresa_id: empresaAtiva.id,
        nome: formNome.trim(),
        conta_financeira_id: formContaFinanceiraId,
        conta_cofre_id: formContaCofreId || undefined,
        ativo: formAtivo,
      })

      toast({
        title: editando ? 'Terminal atualizado' : 'Terminal cadastrado',
        description: `Terminal "${formNome.trim()}" salvo com sucesso.`,
      })

      setModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar terminal.'
      setErroForm(msg)
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivo = async (t: PdvTerminal) => {
    try {
      if (t.ativo) {
        await inativarTerminal(t.id)
        toast({ title: 'Terminal inativado' })
      } else {
        await ativarTerminal(t.id)
        toast({ title: 'Terminal ativado' })
      }
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar situação.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    }
  }

  if (!empresaAtiva) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Selecione uma empresa ativa para gerenciar os terminais de caixa.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Terminais de Caixa (PDV)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre os pontos de atendimento, gavetas e caixas físicos vinculados às contas
            financeiras da filial{' '}
            <strong className="text-slate-700">
              {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
            </strong>
          </p>
        </div>

        {podeCriar && (
          <Button
            onClick={abrirNovo}
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Plus size={15} />
            <span>Novo Terminal</span>
          </Button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar terminal por nome (ex: Caixa 01, Balcão 02)..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={filtroSituacao}
              onValueChange={(val: 'todos' | 'ativos' | 'inativos') => setFiltroSituacao(val)}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Somente Ativos</SelectItem>
                <SelectItem value="inativos">Somente Inativos</SelectItem>
                <SelectItem value="todos">Todos os Registros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" variant="secondary" size="sm" className="text-xs h-9 px-4">
            Filtrar
          </Button>
        </form>
      </div>

      {/* Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {carregando ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Carregando terminais...
          </div>
        ) : terminais.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs space-y-2">
            <Monitor className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-700">Nenhum terminal cadastrado</p>
            <p className="text-slate-400">
              Cadastre o primeiro terminal físico (ex: "Caixa 01") para habilitar as operações de
              PDV.
            </p>
            {podeCriar && (
              <Button onClick={abrirNovo} size="sm" variant="outline" className="text-xs mt-2">
                Cadastrar agora
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/75">
              <TableRow>
                <TableHead className="text-xs font-semibold text-slate-700">Terminal</TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">
                  Conta Caixa Físico
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700">
                  Conta Cofre / Sangria
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-center">
                  Situação
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-700 text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terminais.map((t) => (
                <TableRow key={t.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-xs text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                        <Monitor size={15} />
                      </div>
                      <span className="font-semibold">{t.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Wallet size={14} className="text-emerald-600 flex-shrink-0" />
                      <span>
                        {t.expand?.conta_financeira_id?.nome || 'Conta Caixa não vinculada'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {t.expand?.conta_cofre_id ? (
                      <div className="flex items-center gap-1.5">
                        <Shield size={14} className="text-purple-600 flex-shrink-0" />
                        <span>{t.expand.conta_cofre_id.nome}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Não definida</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {t.ativo ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                        Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {podeEditar && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600"
                            onClick={() => abrirEditar(t)}
                            title="Editar terminal"
                          >
                            <Edit2 size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 ${
                              t.ativo
                                ? 'text-slate-400 hover:text-red-600'
                                : 'text-slate-400 hover:text-emerald-600'
                            }`}
                            onClick={() => toggleAtivo(t)}
                            title={t.ativo ? 'Inativar terminal' : 'Ativar terminal'}
                          >
                            <Power size={13} />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modal Cadastro/Edição */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editando ? 'Editar Terminal de Caixa' : 'Novo Terminal de Caixa'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Vincule um ponto de venda à conta de movimentação de caixa físico
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvar} className="space-y-4 pt-2">
            {erroForm && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{erroForm}</span>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="nome_terminal" className="text-xs font-medium text-slate-700">
                Nome do Terminal <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome_terminal"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Caixa 01, PDV Balcão, Caixa Rápido..."
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="conta_caixa" className="text-xs font-medium text-slate-700">
                Conta Financeira do Caixa Físico <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formContaFinanceiraId || 'nenhum'}
                onValueChange={(val) => setFormContaFinanceiraId(val === 'nenhum' ? '' : val)}
              >
                <SelectTrigger id="conta_caixa" className="text-xs h-9">
                  <SelectValue placeholder="Selecione a conta de caixa físico" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {contasCaixaFisico.length === 0 ? (
                    <SelectItem value="nenhum" disabled>
                      Nenhuma conta do tipo "Caixa físico" cadastrada
                    </SelectItem>
                  ) : (
                    contasCaixaFisico.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.tipo})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {contasCaixaFisico.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Atenção: Cadastre previamente uma conta financeira do tipo "Caixa físico" em
                  Financeiro &gt; Cadastros financeiros &gt; Contas financeiras.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="conta_cofre" className="text-xs font-medium text-slate-700">
                Conta Cofre / Sangria (Destino das Retiradas)
              </Label>
              <Select
                value={formContaCofreId || 'nenhum'}
                onValueChange={(val) => setFormContaCofreId(val === 'nenhum' ? '' : val)}
              >
                <SelectTrigger id="conta_cofre" className="text-xs h-9">
                  <SelectValue placeholder="Selecione a conta de cofre/sangria (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                  {todasContasEmpresa.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                Conta padrão para onde os valores retirados por sangria de caixa serão transferidos
                (ex: Cofre Central, Conta Bancária).
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="space-y-0.5">
                <Label
                  htmlFor="terminal_ativo"
                  className="text-xs font-medium text-slate-800 cursor-pointer"
                >
                  Terminal Ativo
                </Label>
                <p className="text-[11px] text-slate-500">
                  Terminais inativos não aparecem na listagem de abertura de caixa do PDV.
                </p>
              </div>
              <Switch id="terminal_ativo" checked={formAtivo} onCheckedChange={setFormAtivo} />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {salvando ? 'Salvando...' : 'Salvar Terminal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TerminaisPage
