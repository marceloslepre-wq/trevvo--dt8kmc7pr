import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  ContaReceber,
  obterContaReceberPorId,
  cancelarContaReceber,
  estornarRecebimento,
  listarBaixasContaReceber,
} from '@/services/contasReceber'
import { PagamentoBaixa } from '@/services/financeiro'
import { listarLogsAuditoria, LogAuditoriaItem } from '@/services/auditoria'
import { Loader2, FileText, RotateCcw, Ban, Clock, History, Receipt, User } from 'lucide-react'

interface ModalDetalheTituloReceberProps {
  tituloId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAtualizado: () => void
}

export const ModalDetalheTituloReceber: React.FC<ModalDetalheTituloReceberProps> = ({
  tituloId,
  open,
  onOpenChange,
  onAtualizado,
}) => {
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeExcluir = pode('financeiro_receber', 'excluir')

  const [carregando, setCarregando] = useState(false)
  const [titulo, setTitulo] = useState<ContaReceber | null>(null)
  const [baixas, setBaixas] = useState<PagamentoBaixa[]>([])
  const [logs, setLogs] = useState<LogAuditoriaItem[]>([])

  // Modal de confirmação de Estorno de recebimento
  const [baixaParaEstornar, setBaixaParaEstornar] = useState<PagamentoBaixa | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [estornando, setEstornando] = useState(false)

  // Modal de confirmação de Cancelamento do título
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const carregarDados = useCallback(
    async (id: string) => {
      setCarregando(true)
      try {
        const [t, b, l] = await Promise.all([
          obterContaReceberPorId(id),
          listarBaixasContaReceber(id),
          listarLogsAuditoria({ tabela: 'contas_receber', registro_id: id, perPage: 50 }),
        ])
        setTitulo(t)
        setBaixas(b)
        setLogs(l.items)
      } catch (err) {
        console.error('Erro ao carregar detalhes do título a receber:', err)
        toast({
          title: 'Erro ao carregar título',
          description: 'Não foi possível carregar os detalhes do título.',
          variant: 'destructive',
        })
      } finally {
        setCarregando(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (open && tituloId) {
      carregarDados(tituloId)
    }
  }, [open, tituloId, carregarDados])

  // Ação de estornar recebimento
  const handleConfirmarEstorno = async () => {
    if (!baixaParaEstornar) return
    if (!motivoEstorno.trim()) {
      toast({
        title: 'Justificativa obrigatória',
        description: 'Informe o motivo do estorno do recebimento.',
        variant: 'destructive',
      })
      return
    }

    setEstornando(true)
    try {
      await estornarRecebimento(baixaParaEstornar.id, motivoEstorno.trim(), titulo?.empresa_id)

      toast({
        title: 'Recebimento estornado com sucesso!',
        description: 'O saldo a receber foi restabelecido e a conta financeira revertida.',
      })

      setBaixaParaEstornar(null)
      setMotivoEstorno('')
      if (tituloId) carregarDados(tituloId)
      onAtualizado()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao estornar recebimento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEstornando(false)
    }
  }

  // Ação de cancelar título a receber (só sem baixas ativas)
  const handleConfirmarCancelamento = async () => {
    if (!titulo) return
    if (!motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo para cancelar o título.',
        variant: 'destructive',
      })
      return
    }

    setCancelando(true)
    try {
      await cancelarContaReceber(titulo.id, motivoCancelamento.trim())

      toast({
        title: 'Título cancelado com sucesso!',
      })

      setModalCancelarAberto(false)
      setMotivoCancelamento('')
      if (tituloId) carregarDados(tituloId)
      onAtualizado()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao cancelar título',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  const temBaixasAtivas = baixas.some((b) => !b.estornado)
  const clienteNome =
    titulo?.expand?.cliente_id?.razao_social ||
    titulo?.expand?.cliente_id?.nome_fantasia ||
    titulo?.expand?.cliente_id?.nome ||
    'Não identificado'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {carregando || !titulo ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="text-xs">Carregando detalhes do título...</span>
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-6">
                  <div>
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      Título a Receber Doc. {titulo.numero_documento}
                      <span className="text-xs font-normal text-slate-500">
                        (Parc. {titulo.parcela})
                      </span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      {titulo.descricao}
                    </DialogDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        titulo.status === 'Recebido'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : titulo.status === 'Parcial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : titulo.status === 'Cancelado'
                              ? 'bg-slate-100 text-slate-500 line-through'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    >
                      {titulo.status}
                    </Badge>

                    {/* Botão de Cancelar Título (somente sem baixas ativas e com permissão) */}
                    {titulo.status !== 'Cancelado' && podeExcluir && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (temBaixasAtivas) {
                            toast({
                              title: 'Recebimentos ativos existentes',
                              description:
                                'Este título possui recebimentos ativos. Estorne todos os recebimentos antes de cancelar.',
                              variant: 'destructive',
                            })
                            return
                          }
                          setModalCancelarAberto(true)
                        }}
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Ban className="h-3.5 w-3.5 mr-1" />
                        Cancelar título
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Informações Resumidas do Título */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block flex items-center gap-1">
                    <User className="h-3 w-3 text-slate-400" /> Cliente
                  </span>
                  <span className="font-semibold text-slate-800">{clienteNome}</span>
                  {titulo.expand?.cliente_id?.cpf_cnpj && (
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {titulo.expand.cliente_id.cpf_cnpj}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Vencimento</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {new Date(titulo.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Emissão:{' '}
                    {new Date(titulo.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">
                    Plano de Contas
                  </span>
                  <span className="font-semibold text-slate-800 truncate block">
                    {titulo.expand?.plano_conta_id?.codigo} -{' '}
                    {titulo.expand?.plano_conta_id?.descricao}
                  </span>
                  {titulo.expand?.centro_custo_id && (
                    <span className="text-[10px] text-slate-400 block">
                      CC: {titulo.expand.centro_custo_id.descricao}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Origem</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                      {titulo.origem || 'Manual'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Caixa de Valores */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-center">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Valor Original
                  </span>
                  <div className="text-base font-mono font-bold text-slate-800">
                    R$ {titulo.valor_original.toFixed(2)}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Valor Recebido
                  </span>
                  <div className="text-base font-mono font-bold text-emerald-700">
                    R$ {(titulo.valor_recebido || 0).toFixed(2)}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Saldo em Aberto
                  </span>
                  <div className="text-base font-mono font-bold text-blue-800">
                    R$ {(titulo.saldo ?? titulo.valor_original).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Tabs com Histórico de Recebimentos e Logs de Auditoria */}
              <Tabs defaultValue="baixas" className="w-full pt-2">
                <TabsList className="grid grid-cols-2 w-72">
                  <TabsTrigger value="baixas" className="text-xs flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    Recebimentos ({baixas.length})
                  </TabsTrigger>
                  <TabsTrigger value="auditoria" className="text-xs flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Auditoria ({logs.length})
                  </TabsTrigger>
                </TabsList>

                {/* ABA 1: BAIXAS DE RECEBIMENTO */}
                <TabsContent value="baixas" className="mt-3 space-y-3">
                  {baixas.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs border rounded-md bg-slate-50">
                      Nenhum recebimento registrado para este título até o momento.
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-hidden bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b text-slate-600">
                          <tr>
                            <th className="py-2 px-3 text-left">Data Recebimento</th>
                            <th className="py-2 px-3 text-left">Conta Creditada</th>
                            <th className="py-2 px-3 text-right">Principal</th>
                            <th className="py-2 px-3 text-right">Multa/Juros</th>
                            <th className="py-2 px-3 text-right">Desconto</th>
                            <th className="py-2 px-3 text-right">Total Recebido</th>
                            <th className="py-2 px-3 text-center">Status</th>
                            <th className="py-2 px-3 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {baixas.map((b) => {
                            const estornada = b.estornado
                            const valPrincipal = b.valor_principal ?? b.valor_pago ?? 0
                            const valTotal = b.valor_total ?? b.valor_total_pago ?? valPrincipal
                            const dtBaixa = b.data_baixa || b.data_pagamento || ''
                            const multa = b.acrescimo ?? (b.valor_multa || 0) + (b.valor_juros || 0)
                            const desconto = b.desconto ?? b.valor_desconto ?? 0

                            return (
                              <tr
                                key={b.id}
                                className={
                                  estornada
                                    ? 'bg-slate-50/70 text-slate-400 line-through'
                                    : 'hover:bg-slate-50'
                                }
                              >
                                <td className="py-2 px-3 font-mono">
                                  {dtBaixa
                                    ? new Date(dtBaixa + 'T00:00:00').toLocaleDateString('pt-BR')
                                    : '-'}
                                </td>
                                <td className="py-2 px-3 font-medium">
                                  {b.expand?.conta_financeira_id?.nome || 'Conta financeira'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">
                                  R$ {valPrincipal.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-amber-700">
                                  R$ {multa.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-emerald-700">
                                  R$ {desconto.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                  R$ {valTotal.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-center no-underline">
                                  {estornada ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1 bg-red-50 text-red-700 border-red-200"
                                      title={b.motivo_estorno || 'Recebimento estornado'}
                                    >
                                      Estornado
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                                    >
                                      Ativo
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center no-underline">
                                  {!estornada && podeExcluir && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setBaixaParaEstornar(b)
                                        setMotivoEstorno('')
                                      }}
                                      className="h-6 text-[11px] text-red-600 hover:text-red-800 hover:bg-red-50 px-2"
                                    >
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      Estornar recebimento
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* ABA 2: LOGS DE AUDITORIA */}
                <TabsContent value="auditoria" className="mt-3 space-y-2">
                  {logs.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs border rounded-md bg-slate-50">
                      Nenhum registro de auditoria encontrado para este título.
                    </div>
                  ) : (
                    <div className="border rounded-md divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                      {logs.map((log) => (
                        <div key={log.id} className="p-2.5 text-xs flex items-start gap-3">
                          <div className="p-1 rounded-full bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                            <Clock className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800 capitalize">
                                {log.acao}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {log.created ? new Date(log.created).toLocaleString('pt-BR') : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              Usuário: <strong>{log.usuario_nome || 'Sistema'}</strong>
                              {log.motivo && (
                                <span className="block text-slate-500 mt-0.5">
                                  Motivo: {log.motivo}
                                </span>
                              )}
                            </p>
                            {log.dados_depois && (
                              <pre className="mt-1 text-[10px] bg-slate-50 p-1.5 rounded-sm border border-slate-200 text-slate-700 font-mono overflow-x-auto max-h-24">
                                {typeof log.dados_depois === 'string'
                                  ? log.dados_depois
                                  : JSON.stringify(log.dados_depois, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Estorno */}
      <Dialog
        open={Boolean(baixaParaEstornar)}
        onOpenChange={(op) => !op && setBaixaParaEstornar(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-700 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-red-600" />
              Estornar Recebimento
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Esta ação cancelará o recebimento de R${' '}
              {(baixaParaEstornar?.valor_total || baixaParaEstornar?.valor_principal || 0).toFixed(
                2,
              )}
              , debitará o valor da conta financeira e restaurará o saldo a receber deste título.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="motivo_estorno_rec" className="text-xs font-semibold text-slate-700">
                Motivo / Justificativa do Estorno *
              </Label>
              <Input
                id="motivo_estorno_rec"
                value={motivoEstorno}
                onChange={(e) => setMotivoEstorno(e.target.value)}
                placeholder="Ex: Cheque devolvido, cliente solicitou cancelamento do pix, erro de lançamento..."
                className="h-9 text-xs"
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBaixaParaEstornar(null)}
              disabled={estornando}
            >
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarEstorno}
              disabled={estornando || !motivoEstorno.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {estornando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Estornando...
                </>
              ) : (
                'Confirmar Estorno'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Cancelamento do Título */}
      <Dialog open={modalCancelarAberto} onOpenChange={setModalCancelarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />
              Cancelar Título a Receber
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O título será marcado como Cancelado e o saldo devedor do cliente será zerado.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <div className="space-y-1">
              <Label
                htmlFor="motivo_cancelamento_rec"
                className="text-xs font-semibold text-slate-700"
              >
                Motivo do Cancelamento *
              </Label>
              <Input
                id="motivo_cancelamento_rec"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Ex: Acordo comercial, título emitido em duplicidade, renegociação..."
                className="h-9 text-xs"
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalCancelarAberto(false)}
              disabled={cancelando}
            >
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarCancelamento}
              disabled={cancelando || !motivoCancelamento.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Confirmar Cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
