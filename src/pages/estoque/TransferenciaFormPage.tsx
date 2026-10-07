import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Printer,
  Trash2,
  Plus,
  Building2,
  Package,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle2,
  Info,
  Calendar,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { BuscaProdutoGtin } from '@/components/BuscaProdutoGtin'
import { RomaneioTransferenciaModal } from '@/components/RomaneioTransferenciaModal'
import { Produto } from '@/services/produtos'
import { Lote, listarLotesDisponiveisProduto } from '@/services/lotes'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import { obterSaldoAtual } from '@/services/estoque'
import {
  TransferenciaCompleta,
  obterTransferenciaPorId,
  salvarRascunhoTransferencia,
  enviarTransferencia,
  receberTransferencia,
  cancelarTransferencia,
  NovoItemTransferenciaInput,
  ItemConferenciaRecebimento,
} from '@/services/transferencias'

interface ItemLinhaGrade {
  tempId: string
  produto_id: string
  produto?: Produto
  lote_id?: string
  lote?: Lote
  lotesDisponiveis?: Lote[]
  saldoOrigemAtual: number
  quantidade: number
  custo_unitario: number
  quantidade_recebida: number
  divergencia: number
}

export const TransferenciaFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, usuarioERP } = usePermissoes()
  const { toast } = useToast()

  const isEdicao = Boolean(id && id !== 'novo')

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [transferencia, setTransferencia] = useState<TransferenciaCompleta | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  // Formulário cabeçalho
  const [empresaOrigemId, setEmpresaOrigemId] = useState<string>('')
  const [empresaDestinoId, setEmpresaDestinoId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [notaFiscalNumero, setNotaFiscalNumero] = useState<string>('')
  const [notaFiscalChave, setNotaFiscalChave] = useState<string>('')

  // Itens da grade
  const [itens, setItens] = useState<ItemLinhaGrade[]>([])

  // Modais de Ação
  const [modalEnviarAberto, setModalEnviarAberto] = useState(false)
  const [modalReceberAberto, setModalReceberAberto] = useState(false)
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [modalRomaneioAberto, setModalRomaneioAberto] = useState(false)

  // Grade de conferência no recebimento (item_id -> quantidade_recebida)
  const [quantidadesRecebimento, setQuantidadesRecebimento] = useState<Record<string, number>>({})

  // Carrega empresas do grupo
  useEffect(() => {
    listarEmpresasAtivas()
      .then((emps) => setEmpresas(emps))
      .catch((e) => console.error('Erro ao carregar empresas:', e))
  }, [])

  // Carrega os dados da transferência ou inicia nova
  const carregarTransferencia = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)

    if (!isEdicao) {
      setEmpresaOrigemId(empresaAtiva.id)
      setEmpresaDestinoId('')
      setObservacao('')
      setNotaFiscalNumero('')
      setNotaFiscalChave('')
      setItens([])
      setTransferencia(null)
      setCarregando(false)
      return
    }

    try {
      const transf = await obterTransferenciaPorId(id!)
      setTransferencia(transf)
      setEmpresaOrigemId(transf.empresa_origem_id)
      setEmpresaDestinoId(transf.empresa_destino_id)
      setObservacao(transf.observacao || '')
      setNotaFiscalNumero(transf.nota_fiscal_numero || '')
      setNotaFiscalChave(transf.nota_fiscal_chave || '')

      // Mapeia itens com saldos e lotes
      const linhas: ItemLinhaGrade[] = await Promise.all(
        transf.itens.map(async (item) => {
          let saldoAtual = 0
          try {
            const s = await obterSaldoAtual(transf.empresa_origem_id, item.produto_id)
            saldoAtual = s?.quantidade || 0
          } catch {
            /* ignore */
          }

          let lotesDisp: Lote[] = []
          if (item.expand?.produto_id?.controla_lote_validade) {
            try {
              lotesDisp = await listarLotesDisponiveisProduto(
                transf.empresa_origem_id,
                item.produto_id,
              )
            } catch {
              /* ignore */
            }
          }

          return {
            tempId: item.id,
            produto_id: item.produto_id,
            produto: item.expand?.produto_id,
            lote_id: item.lote_id,
            lote: item.expand?.lote_id,
            lotesDisponiveis: lotesDisp,
            saldoOrigemAtual: saldoAtual,
            quantidade: item.quantidade,
            custo_unitario: item.custo_unitario,
            quantidade_recebida: item.quantidade_recebida || 0,
            divergencia: item.divergencia || 0,
          }
        }),
      )

      setItens(linhas)

      // Inicializa conferência sugerindo a quantidade enviada
      const inicialConferencia: Record<string, number> = {}
      transf.itens.forEach((it) => {
        inicialConferencia[it.id] =
          it.quantidade_recebida > 0 ? it.quantidade_recebida : it.quantidade
      })
      setQuantidadesRecebimento(inicialConferencia)
    } catch (err: any) {
      console.error('Erro ao carregar transferência:', err)
      toast({
        title: 'Erro ao abrir transferência',
        description: err.message || 'Transferência não encontrada.',
        variant: 'destructive',
      })
      navigate('/estoque/transferencias')
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, id, isEdicao, navigate, toast])

  useEffect(() => {
    carregarTransferencia()
  }, [carregarTransferencia])

  // Contextos de permissão e papéis da empresa ativa
  const statusAtual = transferencia?.status || 'Rascunho'
  const isOrigem = (transferencia?.empresa_origem_id || empresaOrigemId) === empresaAtiva?.id
  const isDestino = (transferencia?.empresa_destino_id || empresaDestinoId) === empresaAtiva?.id

  const podeEditarRascunho = statusAtual === 'Rascunho' && isOrigem && pode('estoque', 'criar')
  const podeEnviar =
    statusAtual === 'Rascunho' && isOrigem && pode('estoque', 'criar') && itens.length > 0
  const podeReceber = statusAtual === 'Enviada' && isDestino && pode('estoque', 'editar')
  const podeCancelar =
    (statusAtual === 'Rascunho' && pode('estoque', 'excluir')) ||
    (statusAtual === 'Enviada' && isOrigem && pode('estoque', 'excluir'))

  // Adicionar produto bipado ou selecionado
  const handleAdicionarProduto = async (produto: Produto, quantidade = 1) => {
    if (!podeEditarRascunho) return

    // Busca saldo atual na empresa de origem
    let saldo = 0
    let custo = produto.preco_custo || 0
    try {
      const s = await obterSaldoAtual(empresaOrigemId, produto.id)
      saldo = s?.quantidade || 0
      if (s?.custo_medio) {
        custo = s.custo_medio
      }
    } catch {
      /* ignore */
    }

    let lotesDisp: Lote[] = []
    if (produto.controla_lote_validade) {
      try {
        lotesDisp = await listarLotesDisponiveisProduto(empresaOrigemId, produto.id)
      } catch {
        /* ignore */
      }
    }

    // Se já estiver na grade, apenas incrementa quantidade
    const existenteIdx = itens.findIndex(
      (i) => i.produto_id === produto.id && !produto.controla_lote_validade,
    )
    if (existenteIdx >= 0) {
      const novos = [...itens]
      novos[existenteIdx].quantidade += quantidade
      setItens(novos)
      toast({
        title: 'Quantidade atualizada',
        description: `${produto.descricao}: ${novos[existenteIdx].quantidade} adicionados.`,
      })
      return
    }

    const novoItem: ItemLinhaGrade = {
      tempId: 'temp_' + Date.now() + Math.random(),
      produto_id: produto.id,
      produto,
      lote_id: lotesDisp.length === 1 ? lotesDisp[0].id : undefined,
      lote: lotesDisp.length === 1 ? lotesDisp[0] : undefined,
      lotesDisponiveis: lotesDisp,
      saldoOrigemAtual: saldo,
      quantidade: quantidade,
      custo_unitario: custo,
      quantidade_recebida: 0,
      divergencia: quantidade,
    }

    setItens((prev) => [novoItem, ...prev])
    toast({
      title: 'Produto adicionado',
      description: `${produto.descricao} inserido na transferência.`,
    })
  }

  const handleRemoverItem = (tempId: string) => {
    if (!podeEditarRascunho) return
    setItens((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  const handleAlterarQuantidade = (tempId: string, valorStr: string) => {
    const val = parseFloat(valorStr) || 0
    setItens((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, quantidade: val, divergencia: val } : i)),
    )
  }

  const handleAlterarLote = (tempId: string, loteId: string) => {
    setItens((prev) =>
      prev.map((i) => {
        if (i.tempId === tempId) {
          const l = i.lotesDisponiveis?.find((lt) => lt.id === loteId)
          return { ...i, lote_id: loteId || undefined, lote: l }
        }
        return i
      }),
    )
  }

  // Totais
  const totalQuantidade = useMemo(
    () => itens.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0),
    [itens],
  )
  const totalValor = useMemo(
    () =>
      itens.reduce(
        (acc, i) => acc + (Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0),
        0,
      ),
    [itens],
  )

  // Salvar Rascunho
  const handleSalvarRascunho = async () => {
    if (!empresaOrigemId || !empresaDestinoId) {
      toast({
        title: 'Destino obrigatório',
        description: 'Selecione a empresa de destino.',
        variant: 'destructive',
      })
      return
    }

    if (empresaOrigemId === empresaDestinoId) {
      toast({
        title: 'Origem e destino iguais',
        description: 'A empresa de destino deve ser diferente da origem.',
        variant: 'destructive',
      })
      return
    }

    if (itens.length === 0) {
      toast({
        title: 'Nenhum item adicionado',
        description: 'Adicione pelo menos um produto na transferência.',
        variant: 'destructive',
      })
      return
    }

    // Valida lote obrigatório
    for (const item of itens) {
      if (item.produto?.controla_lote_validade && !item.lote_id) {
        toast({
          title: 'Lote obrigatório',
          description: `Selecione o lote para o produto "${item.produto.descricao}".`,
          variant: 'destructive',
        })
        return
      }
    }

    setSalvando(true)
    try {
      const payload: NovoItemTransferenciaInput[] = itens.map((i) => ({
        id: i.tempId.startsWith('temp_') ? undefined : i.tempId,
        produto_id: i.produto_id,
        lote_id: i.lote_id,
        quantidade: i.quantidade,
        custo_unitario: i.custo_unitario,
      }))

      const salva = await salvarRascunhoTransferencia(
        {
          id: isEdicao ? id : undefined,
          empresa_origem_id: empresaOrigemId,
          empresa_destino_id: empresaDestinoId,
          observacao,
          nota_fiscal_numero: notaFiscalNumero,
          nota_fiscal_chave: notaFiscalChave,
          itens: payload,
        },
        usuarioERP?.id,
      )

      toast({
        title: 'Transferência salva',
        description: `Rascunho TR-${salva.numero} salvo com sucesso.`,
      })

      if (!isEdicao) {
        navigate(`/estoque/transferencias/${salva.id}`)
      } else {
        carregarTransferencia()
      }
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err)
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao salvar a transferência.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Executar Envio
  const handleConfirmarEnvio = async () => {
    if (!transferencia?.id) return
    setSalvando(true)
    try {
      await enviarTransferencia(transferencia.id, empresaAtiva!.id, usuarioERP?.id)
      toast({
        title: 'Transferência enviada!',
        description: `TR-${transferencia.numero} enviada. Estoque baixado na origem.`,
      })
      setModalEnviarAberto(false)
      carregarTransferencia()
    } catch (err: any) {
      console.error('Erro ao enviar:', err)
      toast({
        title: 'Falha no envio',
        description: err.message || 'Não foi possível enviar a transferência.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Executar Recebimento
  const handleConfirmarRecebimento = async () => {
    if (!transferencia?.id) return

    // Monta conferência
    const conferenciaPayload: ItemConferenciaRecebimento[] = transferencia.itens.map((it) => {
      const q =
        quantidadesRecebimento[it.id] !== undefined ? quantidadesRecebimento[it.id] : it.quantidade
      return {
        item_id: it.id,
        quantidade_recebida: Number(q),
      }
    })

    // Validações locais
    for (const conf of conferenciaPayload) {
      const itemOrig = transferencia.itens.find((i) => i.id === conf.item_id)
      if (itemOrig && conf.quantidade_recebida > itemOrig.quantidade) {
        toast({
          title: 'Quantidade recebida inválida',
          description: `O item ${itemOrig.expand?.produto_id?.descricao} não pode ter quantidade recebida maior que a enviada (${itemOrig.quantidade}).`,
          variant: 'destructive',
        })
        return
      }
    }

    setSalvando(true)
    try {
      await receberTransferencia(
        transferencia.id,
        empresaAtiva!.id,
        conferenciaPayload,
        usuarioERP?.id,
      )

      toast({
        title: 'Transferência recebida!',
        description: `TR-${transferencia.numero} recebida com sucesso. Saldo lançado no destino.`,
      })
      setModalReceberAberto(false)
      carregarTransferencia()
    } catch (err: any) {
      console.error('Erro ao receber:', err)
      toast({
        title: 'Falha no recebimento',
        description: err.message || 'Não foi possível receber a transferência.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Executar Cancelamento
  const handleConfirmarCancelamento = async () => {
    if (!transferencia?.id) return
    if (!motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo do cancelamento da transferência.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await cancelarTransferencia(
        transferencia.id,
        empresaAtiva!.id,
        motivoCancelamento.trim(),
        usuarioERP?.id,
      )

      toast({
        title: 'Transferência cancelada',
        description: `TR-${transferencia.numero} foi cancelada com sucesso.`,
      })
      setModalCancelarAberto(false)
      carregarTransferencia()
    } catch (err: any) {
      console.error('Erro ao cancelar:', err)
      toast({
        title: 'Falha ao cancelar',
        description: err.message || 'Não foi possível cancelar a transferência.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="py-24 text-center">
        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Carregando dados da transferência...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Barra Superior / Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/estoque/transferencias')}
            className="h-9 px-2 text-slate-600"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {isEdicao
                  ? `Transferência TR-${String(transferencia?.numero).padStart(4, '0')}`
                  : 'Nova Transferência'}
              </h1>
              {transferencia && (
                <Badge
                  className={
                    transferencia.status === 'Recebida'
                      ? 'bg-emerald-600'
                      : transferencia.status === 'Enviada'
                        ? 'bg-blue-600'
                        : transferencia.status === 'Cancelada'
                          ? 'bg-red-600'
                          : 'bg-slate-500'
                  }
                >
                  {transferencia.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {statusAtual === 'Rascunho'
                ? 'Em elaboração. Salve as alterações e envie quando as mercadorias saírem.'
                : statusAtual === 'Enviada'
                  ? 'Mercadorias em trânsito. Aguardando recebimento e conferência na filial de destino.'
                  : statusAtual === 'Recebida'
                    ? 'Transferência finalizada e recebida no estoque do destino.'
                    : 'Transferência cancelada.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {transferencia && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalRomaneioAberto(true)}
              className="text-slate-700"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Romaneio
            </Button>
          )}

          {podeEditarRascunho && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSalvarRascunho}
              disabled={salvando}
            >
              Salvar Rascunho
            </Button>
          )}

          {podeEnviar && (
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              onClick={() => setModalEnviarAberto(true)}
              disabled={salvando}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Enviar Mercadorias
            </Button>
          )}

          {podeReceber && (
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              onClick={() => setModalReceberAberto(true)}
              disabled={salvando}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Receber e Conferir
            </Button>
          )}

          {podeCancelar && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setModalCancelarAberto(true)}
              disabled={salvando}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de Status */}
      {statusAtual === 'Enviada' && isDestino && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold text-sm">
              Transferência pronta para recebimento nesta filial
            </p>
            <p className="mt-0.5">
              Esta remessa foi despachada pela filial de origem. Clique no botão verde{' '}
              <strong>"Receber e Conferir"</strong> para registrar as quantidades físicas recebidas
              e dar entrada no estoque desta filial.
            </p>
          </div>
        </div>
      )}

      {/* Cabeçalho de Filiais e Documento */}
      <Card>
        <CardHeader className="py-3 px-6 border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
            <Building2 className="w-4 h-4 text-blue-600" />
            Dados da Transferência
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Origem */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Empresa de Origem (Remetente) *
              </label>
              <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800">
                {empresas.find((e) => e.id === empresaOrigemId)?.razao_social ||
                  empresaAtiva?.razao_social ||
                  'Filial Ativa'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                A baixa contábil do estoque ocorrerá nesta filial.
              </p>
            </div>

            {/* Destino */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Empresa de Destino (Destinatária) *
              </label>
              {podeEditarRascunho ? (
                <Select value={empresaDestinoId} onValueChange={(val) => setEmpresaDestinoId(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a filial de destino..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas
                      .filter((e) => e.id !== empresaOrigemId)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome_fantasia || e.razao_social} ({e.cnpj})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800">
                  {empresas.find((e) => e.id === empresaDestinoId)?.nome_fantasia ||
                    empresas.find((e) => e.id === empresaDestinoId)?.razao_social ||
                    'Destino selecionado'}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1">
                A entrada física e financeira ocorrerá nesta filial ao ser recebida.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nota Fiscal (Número)
              </label>
              <Input
                placeholder="Ex: 001234"
                value={notaFiscalNumero}
                onChange={(e) => setNotaFiscalNumero(e.target.value)}
                disabled={!podeEditarRascunho}
                className="h-9 text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Chave da NF-e (44 dígitos)
              </label>
              <Input
                placeholder="44 dígitos da NF-e de transferência..."
                value={notaFiscalChave}
                onChange={(e) => setNotaFiscalChave(e.target.value)}
                disabled={!podeEditarRascunho}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Observações</label>
            <Input
              placeholder="Informações adicionais para conferência ou transporte..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={!podeEditarRascunho}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Grade de Produtos */}
      <Card>
        <CardHeader className="py-3 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Package className="w-4 h-4 text-blue-600" />
              Itens da Transferência ({itens.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Produtos que serão transferidos da filial remetente para a destinatária.
            </CardDescription>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-500 mr-3">
              Total Qtd:{' '}
              <strong className="text-slate-800 font-mono">{totalQuantidade.toFixed(4)}</strong>
            </span>
            <span className="text-slate-500">
              Valor Total:{' '}
              <strong className="text-blue-700 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  totalValor,
                )}
              </strong>
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {podeEditarRascunho && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Bipar Código de Barras (GTIN) ou Buscar Produto:
              </label>
              <BuscaProdutoGtin
                onSelecionarProduto={handleAdicionarProduto}
                autoFoco={itens.length === 0}
                placeholder="Bipe com o leitor ou digite o nome do produto..."
              />
            </div>
          )}

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Código / Descrição</th>
                  <th className="py-2.5 px-3 w-40">Lote</th>
                  <th className="py-2.5 px-3 w-28 text-right">Saldo Origem</th>
                  <th className="py-2.5 px-3 w-28 text-right">Qtd Envio</th>
                  <th className="py-2.5 px-3 w-28 text-right">Custo Médio</th>
                  <th className="py-2.5 px-3 w-28 text-right">Subtotal</th>
                  {statusAtual === 'Recebida' && (
                    <>
                      <th className="py-2.5 px-3 w-28 text-right text-emerald-700">Qtd Recebida</th>
                      <th className="py-2.5 px-3 w-28 text-right text-amber-700">Divergência</th>
                    </>
                  )}
                  {podeEditarRascunho && <th className="py-2.5 px-3 w-12 text-center">Excluir</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {itens.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      Nenhum produto adicionado nesta transferência.
                    </td>
                  </tr>
                ) : (
                  itens.map((item, idx) => {
                    const prod = item.produto
                    const subtotal = item.quantidade * (item.custo_unitario || 0)
                    const controlaLote = Boolean(prod?.controla_lote_validade)

                    return (
                      <tr key={item.tempId} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">
                            {prod?.descricao || 'Produto'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Cód: {prod?.codigo || '-'} | GTIN: {prod?.gtin || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {controlaLote ? (
                            podeEditarRascunho ? (
                              <select
                                value={item.lote_id || ''}
                                onChange={(e) => handleAlterarLote(item.tempId, e.target.value)}
                                className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-[11px] text-slate-800"
                              >
                                <option value="">Selecione o lote...</option>
                                {item.lotesDisponiveis?.map((lt) => (
                                  <option key={lt.id} value={lt.id}>
                                    {lt.numero_lote} (Val: {lt.data_validade || 'S/D'})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-mono text-slate-700">
                                {item.lote?.numero_lote || 'Sem lote'}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Não controla</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {item.saldoOrigemAtual.toFixed(4)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {podeEditarRascunho ? (
                            <Input
                              type="number"
                              step="any"
                              min="0.0001"
                              value={item.quantidade}
                              onChange={(e) => handleAlterarQuantidade(item.tempId, e.target.value)}
                              className="h-7 w-24 text-right font-mono ml-auto text-xs"
                            />
                          ) : (
                            <span className="font-mono font-bold text-slate-900">
                              {item.quantidade.toFixed(4)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(item.custo_unitario)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(subtotal)}
                        </td>
                        {statusAtual === 'Recebida' && (
                          <>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {item.quantidade_recebida.toFixed(4)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                              {item.divergencia > 0 ? item.divergencia.toFixed(4) : '-'}
                            </td>
                          </>
                        )}
                        {podeEditarRascunho && (
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoverItem(item.tempId)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Confirmar Envio */}
      <Dialog open={modalEnviarAberto} onOpenChange={setModalEnviarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Envio da Transferência</DialogTitle>
            <DialogDescription>
              Ao enviar, o sistema dará baixa física imediata no estoque da filial de origem (
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}) e a mercadoria ficará em
              trânsito até o recebimento no destino.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 text-xs space-y-2 text-slate-600">
            <p>
              • <strong>Itens a despachar:</strong> {itens.length}
            </p>
            <p>
              • <strong>Quantidade total:</strong> {totalQuantidade.toFixed(4)}
            </p>
            <p>
              • <strong>Valor total:</strong>{' '}
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                totalValor,
              )}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalEnviarAberto(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleConfirmarEnvio}
              disabled={salvando}
            >
              {salvando ? 'Enviando...' : 'Confirmar e Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Recebimento com Conferência */}
      <Dialog open={modalReceberAberto} onOpenChange={setModalReceberAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conferência e Recebimento de Mercadorias</DialogTitle>
            <DialogDescription>
              Informe a quantidade física que realmente chegou nesta filial. Quantidades menores que
              o envio gerarão automaticamente perda por divergência no Kardex.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto py-2 space-y-3">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-2">Produto</th>
                  <th className="p-2 text-right w-24">Enviado</th>
                  <th className="p-2 text-right w-32">Recebido</th>
                  <th className="p-2 text-right w-24">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transferencia?.itens.map((it) => {
                  const digitado =
                    quantidadesRecebimento[it.id] !== undefined
                      ? quantidadesRecebimento[it.id]
                      : it.quantidade
                  const dif = it.quantidade - digitado
                  const prod = it.expand?.produto_id

                  return (
                    <tr key={it.id}>
                      <td className="p-2">
                        <div className="font-semibold text-slate-800">{prod?.descricao}</div>
                        <div className="text-[10px] text-slate-500">
                          {it.expand?.lote_id?.numero_lote
                            ? `Lote: ${it.expand.lote_id.numero_lote}`
                            : ''}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600">
                        {it.quantidade.toFixed(4)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          max={it.quantidade}
                          value={digitado}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0
                            setQuantidadesRecebimento((prev) => ({
                              ...prev,
                              [it.id]: v,
                            }))
                          }}
                          className="h-7 w-24 text-right font-mono ml-auto text-xs"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {dif > 0 ? (
                          <span className="text-amber-600">-{dif.toFixed(4)}</span>
                        ) : dif < 0 ? (
                          <span className="text-red-600 font-bold">
                            +{Math.abs(dif).toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-emerald-600">OK</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalReceberAberto(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmarRecebimento}
              disabled={salvando}
            >
              {salvando ? 'Recebendo...' : 'Confirmar Recebimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Cancelamento */}
      <Dialog open={modalCancelarAberto} onOpenChange={setModalCancelarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Transferência</DialogTitle>
            <DialogDescription>
              {statusAtual === 'Enviada'
                ? 'Atenção: Ao cancelar uma transferência já enviada, todas as saídas de estoque serão estornadas na empresa de origem!'
                : 'Deseja realmente cancelar este rascunho de transferência?'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-slate-700 block">
              Motivo do cancelamento *
            </label>
            <Textarea
              placeholder="Explique o motivo do cancelamento..."
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              className="text-xs"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalCancelarAberto(false)}
              disabled={salvando}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmarCancelamento}
              disabled={salvando || !motivoCancelamento.trim()}
            >
              {salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Romaneio de Conferência */}
      {modalRomaneioAberto && transferencia && (
        <RomaneioTransferenciaModal
          transferencia={transferencia}
          onClose={() => setModalRomaneioAberto(false)}
        />
      )}
    </div>
  )
}
export default TransferenciaFormPage
