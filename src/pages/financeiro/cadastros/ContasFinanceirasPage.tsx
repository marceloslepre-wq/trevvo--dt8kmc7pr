import React, { useEffect, useState } from 'react'
import {
  Building,
  Plus,
  Search,
  Edit2,
  Trash2,
  Wallet,
  Landmark,
  CreditCard,
  DollarSign,
  Smartphone,
  CheckCircle2,
  Star,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  ContaFinanceira,
  TipoContaFinanceira,
  listarContasFinanceiras,
  salvarContaFinanceira,
  inativarContaFinanceira,
  ativarContaFinanceira,
} from '@/services/contasFinanceiras'

const TIPOS_CONTA: TipoContaFinanceira[] = [
  'Conta corrente',
  'Poupança',
  'Aplicação',
  'Caixa físico',
  'Carteira digital',
]

export const ContasFinanceirasPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeCriar = pode('financeiro_bancos', 'criar')
  const podeEditar = pode('financeiro_bancos', 'editar')
  const podeExcluir = pode('financeiro_bancos', 'excluir')

  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoContaFinanceira | 'todos'>('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<Partial<ContaFinanceira> | null>(null)

  const carregarDados = async () => {
    if (!empresaAtiva) return
    try {
      setCarregando(true)
      const list = await listarContasFinanceiras({
        empresa_id: empresaAtiva.id,
        busca,
        tipo: filtroTipo,
        situacao: filtroSituacao,
      })
      setContas(list)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as contas financeiras da empresa.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [empresaAtiva?.id, busca, filtroTipo, filtroSituacao])

  // Cálculo do total geral da empresa ativa (somente contas ativas)
  const totalGeralEmpresa = contas
    .filter((c) => c.ativo)
    .reduce((acc, c) => acc + (Number(c.saldo_atual) || 0), 0)

  const abrirNovaConta = () => {
    if (!empresaAtiva) {
      toast({
        variant: 'destructive',
        title: 'Selecione uma empresa',
        description: 'É necessário ter uma empresa ativa selecionada no cabeçalho.',
      })
      return
    }

    const hojeStr = new Date().toISOString().slice(0, 10)
    setEditando({
      empresa_id: empresaAtiva.id,
      nome: '',
      tipo: 'Conta corrente',
      banco_codigo: '',
      banco_nome: '',
      agencia: '',
      agencia_digito: '',
      conta: '',
      conta_digito: '',
      chave_pix: '',
      saldo_inicial: 0,
      data_saldo_inicial: hojeStr,
      saldo_atual: 0,
      permite_saldo_negativo: true,
      conta_padrao_pagamentos: contas.length === 0,
      conta_padrao_recebimentos: contas.length === 0,
      ativo: true,
    })
    setModalAberto(true)
  }

  const abrirEditarConta = (c: ContaFinanceira) => {
    setEditando({ ...c })
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando || !empresaAtiva) return

    try {
      setSalvando(true)
      await salvarContaFinanceira({
        ...editando,
        empresa_id: empresaAtiva.id,
      })
      toast({
        title: editando.id ? 'Conta atualizada' : 'Conta cadastrada',
        description: `A conta "${editando.nome}" foi salva com sucesso.`,
      })
      setModalAberto(false)
      setEditando(null)
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar conta financeira.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleInativar = async (c: ContaFinanceira) => {
    if (!confirm(`Deseja realmente inativar a conta "${c.nome}"?`)) {
      return
    }

    try {
      await inativarContaFinanceira(c.id)
      toast({
        title: 'Conta inativada',
        description: 'A conta financeira foi inativada.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível inativar a conta.',
      })
    }
  }

  const handleAtivar = async (c: ContaFinanceira) => {
    try {
      await ativarContaFinanceira(c.id)
      toast({
        title: 'Conta reativada',
        description: 'A conta financeira foi reativada com sucesso.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível reativar a conta.',
      })
    }
  }

  const formatarMoeda = (val: number | undefined | null) => {
    return (Number(val) || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  const obterIconeTipo = (tipo: TipoContaFinanceira) => {
    switch (tipo) {
      case 'Caixa físico':
        return <Wallet className="h-4 w-4 text-amber-600" />
      case 'Carteira digital':
        return <Smartphone className="h-4 w-4 text-purple-600" />
      case 'Aplicação':
        return <DollarSign className="h-4 w-4 text-indigo-600" />
      case 'Poupança':
        return <CreditCard className="h-4 w-4 text-sky-600" />
      default:
        return <Landmark className="h-4 w-4 text-blue-600" />
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Contas Bancárias e Caixas
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerenciamento das contas correntes, aplicações, caixas físicos e carteiras da empresa{' '}
            <strong className="text-slate-800">
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}
            </strong>
          </p>
        </div>

        {podeCriar && (
          <Button
            type="button"
            size="sm"
            onClick={abrirNovaConta}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Plus size={15} />
            <span>Nova Conta / Caixa</span>
          </Button>
        )}
      </div>

      {/* Cartão de Saldo Consolidado da Empresa Ativa */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-200 font-medium uppercase tracking-wider">
                Saldo Total Consolidado
              </span>
              <Landmark className="h-5 w-5 text-blue-200" />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold mt-2 tracking-tight">
              {formatarMoeda(totalGeralEmpresa)}
            </div>
          </div>
          <p className="text-[11px] text-blue-200/80 mt-3">
            Soma dos saldos atuais de todas as contas e caixas ativos da empresa selecionada.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Contas Cadastradas
            </span>
            <div className="text-2xl font-bold text-slate-800 mt-2">
              {contas.filter((c) => c.ativo).length}{' '}
              <span className="text-xs font-normal text-slate-400">ativas</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
            <Info size={13} className="text-blue-500 flex-shrink-0" />
            <span>Saldo atual é calculado e mantido pelo serviço central financeiro.</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Contas Padrão
            </span>
            <div className="space-y-1.5 mt-2">
              <div className="text-xs flex items-center justify-between">
                <span className="text-slate-600">Padrão Pagamentos:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {contas.find((c) => c.conta_padrao_pagamentos)?.nome || 'Não definida'}
                </span>
              </div>
              <div className="text-xs flex items-center justify-between">
                <span className="text-slate-600">Padrão Recebimentos:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                  {contas.find((c) => c.conta_padrao_recebimentos)?.nome || 'Não definida'}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Usadas automaticamente nas baixas quando não informada outra conta.
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, banco, agência ou conta..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <div>
            <Select
              value={filtroTipo}
              onValueChange={(val) => setFiltroTipo(val as TipoContaFinanceira | 'todos')}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Tipo de Conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS_CONTA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-slate-500">Situação:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                type="button"
                onClick={() => setFiltroSituacao('ativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'ativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ativas
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('inativos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'inativos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inativas
              </button>
              <button
                type="button"
                onClick={() => setFiltroSituacao('todos')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  filtroSituacao === 'todos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Contas */}
      {carregando ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Carregando contas financeiras...
        </div>
      ) : contas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          Nenhuma conta financeira cadastrada para esta empresa.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map((c) => {
            const saldoNegativo = (Number(c.saldo_atual) || 0) < 0

            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors ${
                  !c.ativo ? 'opacity-60 bg-slate-50/50' : ''
                }`}
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-slate-100">{obterIconeTipo(c.tipo)}</div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">{c.nome}</h3>
                        <span className="text-[11px] text-slate-500">{c.tipo}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/financeiro/bancos?contaId=${c.id}`)}
                        className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Ver Extrato"
                      >
                        Extrato
                      </Button>
                      {podeEditar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEditarConta(c)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                          title="Editar"
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}
                      {podeExcluir && c.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInativar(c)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                          title="Inativar"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                      {podeEditar && !c.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAtivar(c)}
                          className="h-7 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50"
                        >
                          Reativar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Informações Bancárias */}
                  <div className="py-2.5 space-y-1 text-xs text-slate-600">
                    {c.banco_nome && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Banco:</span>
                        <span className="font-medium text-slate-800">
                          {c.banco_codigo ? `${c.banco_codigo} - ` : ''}
                          {c.banco_nome}
                        </span>
                      </div>
                    )}
                    {(c.agencia || c.conta) && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Ag / Conta:</span>
                        <span className="font-mono text-slate-800">
                          {c.agencia
                            ? `Ag ${c.agencia}${c.agencia_digito ? `-${c.agencia_digito}` : ''}`
                            : ''}
                          {c.agencia && c.conta ? ' | ' : ''}
                          {c.conta
                            ? `CC ${c.conta}${c.conta_digito ? `-${c.conta_digito}` : ''}`
                            : ''}
                        </span>
                      </div>
                    )}
                    {c.chave_pix && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Chave PIX:</span>
                        <span
                          className="font-mono text-[11px] text-slate-800 truncate max-w-[170px]"
                          title={c.chave_pix}
                        >
                          {c.chave_pix}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <span>Saldo Inicial:</span>
                      <span>
                        {formatarMoeda(c.saldo_inicial)}{' '}
                        <span className="text-[10px] text-slate-400">({c.data_saldo_inicial})</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rodapé: Saldo Atual + Badges */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Saldo Atual:
                    </span>
                    <span
                      className={`text-base font-extrabold tracking-tight ${
                        saldoNegativo ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatarMoeda(c.saldo_atual)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {c.conta_padrao_pagamentos && (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] gap-1 py-0 h-4"
                      >
                        <Star size={10} className="fill-blue-600 text-blue-600" />
                        Padrão Pagar
                      </Badge>
                    )}
                    {c.conta_padrao_recebimentos && (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1 py-0 h-4"
                      >
                        <CheckCircle2 size={10} className="text-emerald-600" />
                        Padrão Receber
                      </Badge>
                    )}
                    {!c.permite_saldo_negativo && (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] py-0 h-4"
                      >
                        Não permite saldo negativo
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Formulário Conta Financeira */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editando?.id ? 'Editar Conta Financeira' : 'Nova Conta Bancária ou Caixa'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Cadastre os dados da conta corrente, poupança, aplicação ou caixa físico.
            </DialogDescription>
          </DialogHeader>

          {editando && (
            <form onSubmit={handleSalvar} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="nome" className="text-xs font-medium text-slate-700">
                    Nome de Identificação <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="nome"
                    value={editando.nome || ''}
                    onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                    placeholder="Ex: Banestes CC 1234-5, Caixa Loja 1"
                    className="text-xs h-9"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="tipo" className="text-xs font-medium text-slate-700">
                    Tipo de Conta <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={editando.tipo || 'Conta corrente'}
                    onValueChange={(val) => {
                      const tipo = val as TipoContaFinanceira
                      setEditando({
                        ...editando,
                        tipo,
                        permite_saldo_negativo: tipo !== 'Caixa físico',
                      })
                    }}
                  >
                    <SelectTrigger id="tipo" className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_CONTA.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dados bancários opcionais */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3">
                <span className="text-xs font-semibold text-slate-800 block border-b border-slate-200 pb-1">
                  Dados Bancários (Opcional)
                </span>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="banco_codigo" className="text-xs font-medium text-slate-700">
                      Cód. Banco (3 dígitos)
                    </Label>
                    <Input
                      id="banco_codigo"
                      value={editando.banco_codigo || ''}
                      onChange={(e) =>
                        setEditando({
                          ...editando,
                          banco_codigo: e.target.value.replace(/\D/g, '').slice(0, 3),
                        })
                      }
                      placeholder="021"
                      className="text-xs h-9 font-mono"
                      maxLength={3}
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="banco_nome" className="text-xs font-medium text-slate-700">
                      Nome do Banco
                    </Label>
                    <Input
                      id="banco_nome"
                      value={editando.banco_nome || ''}
                      onChange={(e) => setEditando({ ...editando, banco_nome: e.target.value })}
                      placeholder="Ex: Banestes, Banco do Brasil, Bradesco"
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="agencia" className="text-xs font-medium text-slate-700">
                      Agência e Dígito
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        id="agencia"
                        value={editando.agencia || ''}
                        onChange={(e) => setEditando({ ...editando, agencia: e.target.value })}
                        placeholder="1234"
                        className="text-xs h-9 font-mono flex-1"
                      />
                      <Input
                        id="agencia_digito"
                        value={editando.agencia_digito || ''}
                        onChange={(e) =>
                          setEditando({ ...editando, agencia_digito: e.target.value })
                        }
                        placeholder="X"
                        className="text-xs h-9 font-mono w-12 text-center"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="conta" className="text-xs font-medium text-slate-700">
                      Número da Conta e Dígito
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        id="conta"
                        value={editando.conta || ''}
                        onChange={(e) => setEditando({ ...editando, conta: e.target.value })}
                        placeholder="1234567"
                        className="text-xs h-9 font-mono flex-1"
                      />
                      <Input
                        id="conta_digito"
                        value={editando.conta_digito || ''}
                        onChange={(e) => setEditando({ ...editando, conta_digito: e.target.value })}
                        placeholder="8"
                        className="text-xs h-9 font-mono w-12 text-center"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="chave_pix" className="text-xs font-medium text-slate-700">
                    Chave PIX
                  </Label>
                  <Input
                    id="chave_pix"
                    value={editando.chave_pix || ''}
                    onChange={(e) => setEditando({ ...editando, chave_pix: e.target.value })}
                    placeholder="CNPJ, E-mail, Celular ou Chave Aleatória"
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {/* Saldo Inicial e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="saldo_inicial" className="text-xs font-medium text-slate-700">
                    Saldo Inicial (R$) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="saldo_inicial"
                    type="number"
                    step="0.01"
                    value={editando.saldo_inicial !== undefined ? editando.saldo_inicial : ''}
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        saldo_inicial: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0,00"
                    className="text-xs h-9 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="data_saldo_inicial"
                    className="text-xs font-medium text-slate-700"
                  >
                    Data do Saldo Inicial <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="data_saldo_inicial"
                    type="date"
                    value={editando.data_saldo_inicial || ''}
                    onChange={(e) =>
                      setEditando({ ...editando, data_saldo_inicial: e.target.value })
                    }
                    className="text-xs h-9"
                    required
                  />
                </div>
              </div>

              {/* Saldo Atual (Apenas leitura) */}
              <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-blue-900 block">
                    Saldo Atual (Somente Leitura)
                  </span>
                  <span className="text-[11px] text-blue-700">
                    Mantido e auditado pelo serviço central financeiro.
                  </span>
                </div>
                <span className="text-base font-extrabold text-blue-900 font-mono">
                  {formatarMoeda(editando.id ? editando.saldo_atual : editando.saldo_inicial)}
                </span>
              </div>

              {/* Configurações da Conta */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="permite_negativo"
                      className="text-xs text-slate-800 cursor-pointer font-medium"
                    >
                      Permite Saldo Negativo
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      Padrão ativo para contas bancárias e desligado para caixas físicos.
                    </p>
                  </div>
                  <Switch
                    id="permite_negativo"
                    checked={editando.permite_saldo_negativo !== false}
                    onCheckedChange={(val) =>
                      setEditando({ ...editando, permite_saldo_negativo: val })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="padrao_pagar"
                      className="text-xs text-slate-800 cursor-pointer font-medium"
                    >
                      Conta Padrão para Pagamentos
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      Ao marcar, substitui automaticamente a conta padrão anterior desta empresa.
                    </p>
                  </div>
                  <Switch
                    id="padrao_pagar"
                    checked={Boolean(editando.conta_padrao_pagamentos)}
                    onCheckedChange={(val) =>
                      setEditando({ ...editando, conta_padrao_pagamentos: val })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="padrao_receber"
                      className="text-xs text-slate-800 cursor-pointer font-medium"
                    >
                      Conta Padrão para Recebimentos
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      Ao marcar, substitui automaticamente a conta padrão anterior desta empresa.
                    </p>
                  </div>
                  <Switch
                    id="padrao_receber"
                    checked={Boolean(editando.conta_padrao_recebimentos)}
                    onCheckedChange={(val) =>
                      setEditando({ ...editando, conta_padrao_recebimentos: val })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="ativo"
                      className="text-xs text-slate-800 cursor-pointer font-medium"
                    >
                      Conta Ativa
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      Contas inativas não aparecem em opções de lançamentos ou baixas.
                    </p>
                  </div>
                  <Switch
                    id="ativo"
                    checked={editando.ativo !== false}
                    onCheckedChange={(val) => setEditando({ ...editando, ativo: val })}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
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
                  {salvando ? 'Salvando...' : 'Salvar Conta'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ContasFinanceirasPage
