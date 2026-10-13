import React, { useEffect, useState } from 'react'
import {
  CreditCard,
  Plus,
  Search,
  Edit2,
  Trash2,
  Filter,
  Info,
  UserPlus,
  Layers,
  Building2,
  Percent,
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
  DialogFooter,
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
  FormaPagamento,
  TipoFormaPagamento,
  FormaPagamentoTaxa,
  listarFormasPagamento,
  salvarFormaPagamento,
  inativarFormaPagamento,
  ativarFormaPagamento,
  listarTaxasPorFormaPagamento,
  salvarFormaPagamentoTaxa,
  excluirFormaPagamentoTaxa,
} from '@/services/formasPagamento'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import { Cliente, listarClientes, salvarCliente } from '@/services/clientes'

const TIPOS_FORMA: TipoFormaPagamento[] = [
  'Dinheiro',
  'Cheque',
  'Cartão de crédito',
  'Cartão de débito',
  'PIX',
  'Boleto',
  'Transferência',
  'Crédito loja',
  'Outros',
]

export const FormasPagamentoPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeCriar = pode('financeiro_bancos', 'criar')
  const podeEditar = pode('financeiro_bancos', 'editar')
  const podeExcluir = pode('financeiro_bancos', 'excluir')

  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoFormaPagamento | 'todos'>('todos')
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'inativos'>('ativos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<Partial<FormaPagamento> | null>(null)

  // Faixas de taxas da forma em edição
  const [faixasTaxas, setFaixasTaxas] = useState<FormaPagamentoTaxa[]>([])
  const [carregandoFaixas, setCarregandoFaixas] = useState(false)
  const [novaFaixaDe, setNovaFaixaDe] = useState('1')
  const [novaFaixaAte, setNovaFaixaAte] = useState('1')
  const [novaFaixaTaxa, setNovaFaixaTaxa] = useState('')
  const [novaFaixaDias, setNovaFaixaDias] = useState('')
  const [adicionandoFaixa, setAdicionandoFaixa] = useState(false)

  // Modal de cadastro rápido de cliente da operadora
  const [modalOperadoraAberto, setModalOperadoraAberto] = useState(false)
  const [operadoraNome, setOperadoraNome] = useState('')
  const [operadoraCnpj, setOperadoraCnpj] = useState('')
  const [salvandoOperadora, setSalvandoOperadora] = useState(false)

  const carregarDados = async () => {
    try {
      setCarregando(true)
      const [listaFormas, listaContas, resClientes] = await Promise.all([
        listarFormasPagamento({
          busca,
          tipo: filtroTipo,
          situacao: filtroSituacao,
        }),
        empresaAtiva
          ? listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' })
          : Promise.resolve([]),
        listarClientes({ situacao: 'ativos', porPagina: 500 }),
      ])
      setFormas(listaFormas)
      setContasFinanceiras(listaContas)
      setClientes(resClientes.items)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as formas de pagamento.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [busca, filtroTipo, filtroSituacao, empresaAtiva?.id])

  const carregarFaixas = async (formaId: string) => {
    try {
      setCarregandoFaixas(true)
      const faixas = await listarTaxasPorFormaPagamento(formaId)
      setFaixasTaxas(faixas)
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setCarregandoFaixas(false)
    }
  }

  const abrirNovaForma = () => {
    setEditando({
      codigo_tpag: '',
      descricao: '',
      tipo: 'Dinheiro',
      taxa_percentual: 0,
      dias_para_recebimento: 0,
      conta_financeira_padrao_id: undefined,
      operadora_cliente_id: undefined,
      parcelado_pela_operadora: false,
      ativo: true,
    })
    setFaixasTaxas([])
    setModalAberto(true)
  }

  const abrirEditarForma = (forma: FormaPagamento) => {
    setEditando({ ...forma })
    if (forma.id && (forma.tipo === 'Cartão de crédito' || forma.tipo === 'Cartão de débito')) {
      carregarFaixas(forma.id)
    } else {
      setFaixasTaxas([])
    }
    setModalAberto(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando) return

    try {
      setSalvando(true)
      const salva = await salvarFormaPagamento(editando)
      toast({
        title: editando.id ? 'Forma de pagamento atualizada' : 'Forma de pagamento cadastrada',
        description: `A forma de pagamento "${salva.codigo_tpag} - ${salva.descricao}" foi salva com sucesso.`,
      })
      setModalAberto(false)
      setEditando(null)
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar a forma de pagamento.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleInativar = async (forma: FormaPagamento) => {
    if (
      !confirm(
        `Deseja realmente inativar a forma de pagamento "${forma.codigo_tpag} - ${forma.descricao}"?`,
      )
    ) {
      return
    }

    try {
      await inativarFormaPagamento(forma.id)
      toast({
        title: 'Forma inativada',
        description: 'A forma de pagamento foi inativada.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível inativar a forma de pagamento.',
      })
    }
  }

  const handleAtivar = async (forma: FormaPagamento) => {
    try {
      await ativarFormaPagamento(forma.id)
      toast({
        title: 'Forma reativada',
        description: 'A forma de pagamento foi reativada com sucesso.',
      })
      await carregarDados()
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível reativar a forma de pagamento.',
      })
    }
  }

  // Manipulação de Faixas de Taxas
  const handleAdicionarFaixa = async () => {
    if (!editando?.id) {
      toast({
        variant: 'destructive',
        title: 'Salve a forma de pagamento antes',
        description: 'É necessário salvar a forma de pagamento antes de adicionar faixas de taxas.',
      })
      return
    }

    const pDe = parseInt(novaFaixaDe, 10)
    const pAte = parseInt(novaFaixaAte, 10)
    const taxa = parseFloat(novaFaixaTaxa)
    const dias = novaFaixaDias ? parseInt(novaFaixaDias, 10) : undefined

    if (isNaN(pDe) || isNaN(pAte) || pDe < 1 || pAte < pDe) {
      toast({
        variant: 'destructive',
        title: 'Faixa inválida',
        description: 'Verifique os valores de parcelas de/até.',
      })
      return
    }
    if (isNaN(taxa) || taxa < 0) {
      toast({
        variant: 'destructive',
        title: 'Taxa inválida',
        description: 'Informe um percentual de taxa válido.',
      })
      return
    }

    try {
      setAdicionandoFaixa(true)
      await salvarFormaPagamentoTaxa({
        forma_pagamento_id: editando.id,
        parcelas_de: pDe,
        parcelas_ate: pAte,
        taxa_percentual: taxa,
        dias_para_recebimento: dias,
        ativo: true,
      })
      toast({ title: 'Faixa de taxa adicionada' })
      setNovaFaixaDe(String(pAte + 1))
      setNovaFaixaAte(String(pAte + 1))
      setNovaFaixaTaxa('')
      setNovaFaixaDias('')
      await carregarFaixas(editando.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao incluir faixa.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setAdicionandoFaixa(false)
    }
  }

  const handleExcluirFaixa = async (faixaId: string) => {
    if (!editando?.id) return
    try {
      await excluirFormaPagamentoTaxa(faixaId)
      toast({ title: 'Faixa de taxa removida' })
      await carregarFaixas(editando.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao remover faixa.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    }
  }

  // Cadastro rápido da operadora como cliente Pessoa Jurídica
  const handleCriarClienteOperadora = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!operadoraNome.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome da operadora' })
      return
    }

    try {
      setSalvandoOperadora(true)
      const novoCliente = await salvarCliente({
        tipo_pessoa: 'Jurídica',
        nome_razao_social: operadoraNome.trim(),
        nome_fantasia: operadoraNome.trim(),
        cpf_cnpj: operadoraCnpj.trim() || undefined,
        indicador_ie: '9',
        ativo: true,
      })

      toast({
        title: 'Operadora cadastrada',
        description: `Cliente "${novoCliente.nome_razao_social}" criado com sucesso.`,
      })

      // Atualiza lista de clientes e seleciona na forma em edição
      const atualizados = await listarClientes({ situacao: 'ativos', porPagina: 500 })
      setClientes(atualizados.items)
      if (editando) {
        setEditando({ ...editando, operadora_cliente_id: novoCliente.id })
      }

      setModalOperadoraAberto(false)
      setOperadoraNome('')
      setOperadoraCnpj('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar operadora.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setSalvandoOperadora(false)
    }
  }

  const ehCartao = editando?.tipo === 'Cartão de crédito' || editando?.tipo === 'Cartão de débito'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Formas de Pagamento
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro compartilhado das formas de pagamento com código fiscal tPag (NF-e/NFC-e),
            taxas escalonadas e operadoras de cartão
          </p>
        </div>

        {podeCriar && (
          <Button
            type="button"
            size="sm"
            onClick={abrirNovaForma}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Plus size={15} />
            <span>Nova Forma de Pagamento</span>
          </Button>
        )}
      </div>

      {/* Alerta de Vínculo com PDV e Fiscal */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-900 space-y-1">
          <p className="font-semibold">Vínculo com PDV (Etapa 5) e Fiscal NF-e/NFC-e (Etapa 6):</p>
          <p className="text-blue-800 leading-relaxed">
            As formas de pagamento cadastradas aqui serão utilizadas diretamente nas vendas balcão
            do PDV e na emissão de cupons NFC-e e notas NF-e. O campo <strong>código tPag</strong>{' '}
            obedece à tabela oficial da SEFAZ (ex: 01 Dinheiro, 03 Cartão de Crédito, 17 PIX). Para
            cartões de crédito e débito, você pode definir as taxas por faixas de parcelamento e o
            cliente da operadora para repasse financeiro.
          </p>
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
              placeholder="Buscar por código tPag ou descrição..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <div>
            <Select
              value={filtroTipo}
              onValueChange={(val) => setFiltroTipo(val as TipoFormaPagamento | 'todos')}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPOS_FORMA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs">
            <Filter size={13} className="text-slate-400" />
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

      {/* Tabela de Listagem */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-600 font-semibold select-none">
            <tr>
              <th className="py-3 px-4 w-28">Cód. tPag</th>
              <th className="py-3 px-4">Descrição</th>
              <th className="py-3 px-4 w-36">Tipo</th>
              <th className="py-3 px-4 text-right w-24">Taxa (%)</th>
              <th className="py-3 px-4 text-center w-28">Prazo (Dias)</th>
              <th className="py-3 px-4 w-44">Operadora / Cliente</th>
              <th className="py-3 px-4 text-center w-24">Status</th>
              <th className="py-3 px-4 text-right w-24">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                  <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Carregando formas de pagamento...
                </td>
              </tr>
            ) : formas.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                  Nenhuma forma de pagamento encontrada.
                </td>
              </tr>
            ) : (
              formas.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    !item.ativo ? 'opacity-60 bg-slate-50/40' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {item.codigo_tpag}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">{item.descricao}</td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium">
                      {item.tipo}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-700">
                    {item.taxa_percentual !== null && item.taxa_percentual !== undefined
                      ? `${item.taxa_percentual.toFixed(2)}%`
                      : '-'}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-700">
                    {item.dias_para_recebimento !== null && item.dias_para_recebimento !== undefined
                      ? `${item.dias_para_recebimento} d`
                      : '-'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 truncate max-w-[160px]">
                    {item.expand?.operadora_cliente_id?.nome_razao_social || (
                      <span className="text-slate-400 italic">Não definida</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.ativo ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                      >
                        Ativa
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-600 border-red-200 text-[10px]"
                      >
                        Inativa
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {podeEditar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEditarForma(item)}
                          className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600"
                          title="Editar"
                        >
                          <Edit2 size={13} />
                        </Button>
                      )}

                      {podeExcluir && item.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInativar(item)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                          title="Inativar"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}

                      {podeEditar && !item.ativo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAtivar(item)}
                          className="h-7 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50"
                        >
                          Reativar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          Total de formas: <strong>{formas.length}</strong>
        </div>
      </div>

      {/* Modal Formulário Principal */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editando?.id ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe o código fiscal da SEFAZ (tPag), taxas, operadora de cartão e conta padrão.
            </DialogDescription>
          </DialogHeader>

          {editando && (
            <form onSubmit={handleSalvar} className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="codigo_tpag" className="text-xs font-medium text-slate-700">
                    Cód. tPag <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="codigo_tpag"
                    value={editando.codigo_tpag || ''}
                    onChange={(e) =>
                      setEditando({ ...editando, codigo_tpag: e.target.value.slice(0, 2) })
                    }
                    placeholder="01, 03, 17"
                    className="text-xs h-9 font-mono"
                    maxLength={2}
                    required
                  />
                </div>

                <div className="space-y-1 col-span-2">
                  <Label htmlFor="tipo" className="text-xs font-medium text-slate-700">
                    Tipo de Pagamento <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={editando.tipo || 'Dinheiro'}
                    onValueChange={(val) =>
                      setEditando({ ...editando, tipo: val as TipoFormaPagamento })
                    }
                  >
                    <SelectTrigger id="tipo" className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_FORMA.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="descricao" className="text-xs font-medium text-slate-700">
                  Descrição <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="descricao"
                  value={editando.descricao || ''}
                  onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
                  placeholder="Ex: Cartão de Crédito Visa/Master, PIX à vista"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="taxa_percentual" className="text-xs font-medium text-slate-700">
                    Taxa Padrão / À Vista (%)
                  </Label>
                  <Input
                    id="taxa_percentual"
                    type="number"
                    step="0.01"
                    value={editando.taxa_percentual !== undefined ? editando.taxa_percentual : ''}
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        taxa_percentual: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0,00"
                    className="text-xs h-9 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="dias_para_recebimento"
                    className="text-xs font-medium text-slate-700"
                  >
                    Prazo Recebimento Padrão (Dias)
                  </Label>
                  <Input
                    id="dias_para_recebimento"
                    type="number"
                    step="1"
                    value={
                      editando.dias_para_recebimento !== undefined
                        ? editando.dias_para_recebimento
                        : ''
                    }
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        dias_para_recebimento: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="Ex: 30 para cartão, 0 para PIX"
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="conta_padrao" className="text-xs font-medium text-slate-700">
                  Conta Financeira / Caixa Padrão
                </Label>
                <Select
                  value={editando.conta_financeira_padrao_id || 'nenhuma'}
                  onValueChange={(val) =>
                    setEditando({
                      ...editando,
                      conta_financeira_padrao_id: val === 'nenhuma' ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger id="conta_padrao" className="text-xs h-9">
                    <SelectValue placeholder="Selecione uma conta (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">-- Nenhuma vinculada --</SelectItem>
                    {contasFinanceiras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Ao escolher esta forma de pagamento, a movimentação será direcionada a esta conta.
                </p>
              </div>

              {/* CAMPOS EXCLUSIVOS DE CARTÃO: OPERADORA E FAIXAS DE TAXA */}
              {ehCartao && (
                <div className="pt-3 border-t border-slate-200 space-y-4 bg-slate-50/80 -mx-6 px-6 py-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Configurações da Operadora e Adquirente
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="operadora_cliente"
                          className="text-xs font-medium text-slate-700"
                        >
                          Cliente da Operadora (Recebedora)
                        </Label>
                        <button
                          type="button"
                          onClick={() => setModalOperadoraAberto(true)}
                          className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                        >
                          <UserPlus size={12} />
                          <span>Criar cliente da operadora</span>
                        </button>
                      </div>

                      <Select
                        value={editando.operadora_cliente_id || 'nenhum'}
                        onValueChange={(val) =>
                          setEditando({
                            ...editando,
                            operadora_cliente_id: val === 'nenhum' ? undefined : val,
                          })
                        }
                      >
                        <SelectTrigger id="operadora_cliente" className="text-xs h-9 bg-white">
                          <SelectValue placeholder="Selecione o cadastro da adquirente" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem value="nenhum">-- Não vinculada --</SelectItem>
                          {clientes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome_razao_social} {c.cpf_cnpj ? `(${c.cpf_cnpj})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-400">
                        O repasse líquido a receber das vendas com cartão será creditado contra esta
                        operadora.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200">
                      <div className="space-y-0.5 pr-2">
                        <Label
                          htmlFor="parcelado_operadora"
                          className="text-xs font-medium text-slate-800 cursor-pointer"
                        >
                          Parcelamento pela Operadora
                        </Label>
                        <p className="text-[11px] text-slate-500">
                          Se ativado, a operadora assume o risco e repassa as parcelas diretamente.
                        </p>
                      </div>
                      <Switch
                        id="parcelado_operadora"
                        checked={Boolean(editando.parcelado_pela_operadora)}
                        onCheckedChange={(val) =>
                          setEditando({ ...editando, parcelado_pela_operadora: val })
                        }
                      />
                    </div>
                  </div>

                  {/* FAIXAS DE TAXA */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Percent size={13} className="text-blue-600" />
                        Faixas de Taxas por Parcelas (Crédito / Débito)
                      </Label>
                      <span className="text-[11px] text-slate-400">
                        Se não houver faixa, usa a taxa padrão da forma
                      </span>
                    </div>

                    {!editando.id ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        Salve o cadastro da forma de pagamento para habilitar a inclusão das faixas
                        de parcelamento.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Mini listagem de faixas */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] uppercase font-semibold text-slate-600">
                              <tr>
                                <th className="p-2">Parcelas De/Até</th>
                                <th className="p-2 text-right">Taxa (%)</th>
                                <th className="p-2 text-center">Prazo (Dias)</th>
                                <th className="p-2 text-right w-16">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {carregandoFaixas ? (
                                <tr>
                                  <td colSpan={4} className="p-3 text-center text-slate-400">
                                    Carregando faixas...
                                  </td>
                                </tr>
                              ) : faixasTaxas.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="p-3 text-center text-slate-400 italic">
                                    Nenhuma faixa cadastrada. Aplica-se a taxa padrão de{' '}
                                    {editando.taxa_percentual || 0}%.
                                  </td>
                                </tr>
                              ) : (
                                faixasTaxas.map((f) => (
                                  <tr key={f.id} className="hover:bg-slate-50">
                                    <td className="p-2 font-mono font-medium text-slate-800">
                                      {f.parcelas_de === f.parcelas_ate
                                        ? `${f.parcelas_de}x`
                                        : `${f.parcelas_de}x a ${f.parcelas_ate}x`}
                                    </td>
                                    <td className="p-2 text-right font-mono font-bold text-slate-900">
                                      {f.taxa_percentual.toFixed(2)}%
                                    </td>
                                    <td className="p-2 text-center font-mono text-slate-600">
                                      {f.dias_para_recebimento !== undefined &&
                                      f.dias_para_recebimento !== null
                                        ? `${f.dias_para_recebimento} d`
                                        : `${editando.dias_para_recebimento || 0} d (padrão)`}
                                    </td>
                                    <td className="p-2 text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleExcluirFaixa(f.id)}
                                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                                        title="Excluir faixa"
                                      >
                                        <Trash2 size={12} />
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Formulário de inclusão de faixa */}
                        <div className="p-3 rounded-lg bg-white border border-slate-200 grid grid-cols-5 gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-600">De (x)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={novaFaixaDe}
                              onChange={(e) => setNovaFaixaDe(e.target.value)}
                              className="h-7 text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-600">Até (x)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={novaFaixaAte}
                              onChange={(e) => setNovaFaixaAte(e.target.value)}
                              className="h-7 text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-600">Taxa (%)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={novaFaixaTaxa}
                              onChange={(e) => setNovaFaixaTaxa(e.target.value)}
                              placeholder="3.90"
                              className="h-7 text-xs font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-600">Dias</Label>
                            <Input
                              type="number"
                              value={novaFaixaDias}
                              onChange={(e) => setNovaFaixaDias(e.target.value)}
                              placeholder="30"
                              className="h-7 text-xs font-mono"
                            />
                          </div>

                          <div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={adicionandoFaixa}
                              onClick={handleAdicionarFaixa}
                              className="h-7 w-full text-xs bg-slate-800 hover:bg-slate-900 text-white"
                            >
                              Incluir
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ativo" className="text-xs text-slate-700 cursor-pointer">
                    Forma Ativa
                  </Label>
                  <Switch
                    id="ativo"
                    checked={editando.ativo !== false}
                    onCheckedChange={(val) => setEditando({ ...editando, ativo: val })}
                  />
                </div>

                <div className="flex items-center gap-2">
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
                    {salvando ? 'Salvando...' : 'Salvar Forma'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Cadastro Rápido de Cliente da Operadora */}
      <Dialog open={modalOperadoraAberto} onOpenChange={setModalOperadoraAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <span>Criar Cliente da Operadora</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Cadastra a adquirente de cartão como cliente Pessoa Jurídica no ERP
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCriarClienteOperadora} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="operadora_nome" className="text-xs font-medium text-slate-700">
                Nome da Operadora / Adquirente <span className="text-red-500">*</span>
              </Label>
              <Input
                id="operadora_nome"
                value={operadoraNome}
                onChange={(e) => setOperadoraNome(e.target.value)}
                placeholder="Ex: Cielo, Rede, Stone, PagBank, Mercado Pago"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="operadora_cnpj" className="text-xs font-medium text-slate-700">
                CNPJ (Opcional)
              </Label>
              <Input
                id="operadora_cnpj"
                value={operadoraCnpj}
                onChange={(e) => setOperadoraCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="text-xs h-9 font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOperadoraAberto(false)}
                disabled={salvandoOperadora}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={salvandoOperadora}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                {salvandoOperadora ? 'Salvando...' : 'Cadastrar Operadora'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FormasPagamentoPage
