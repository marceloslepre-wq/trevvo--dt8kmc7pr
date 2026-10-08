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
import pb from '@/lib/pocketbase/client'
import {
  ContaPagar,
  PagamentoBaixa,
  obterContaPagarPorId,
  listarBaixasDoTitulo,
  estornarBaixa,
  cancelarTituloPagar,
} from '@/services/financeiro'
import { listarLogsAuditoria, LogAuditoriaItem } from '@/services/auditoria'
import {
  Loader2,
  FileText,
  RotateCcw,
  Ban,
  Clock,
  ExternalLink,
  History,
  AlertTriangle,
  Receipt,
  Download,
} from 'lucide-react'
import { Link } from 'react-router-dom'

interface ModalDetalheTituloProps {
  tituloId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAtualizado: () => void
}

export const ModalDetalheTitulo: React.FC<ModalDetalheTituloProps> = ({
  tituloId,
  open,
  onOpenChange,
  onAtualizado,
}) => {
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeExcluir = pode('financeiro_pagar', 'excluir')

  const [carregando, setCarregando] = useState(false)
  const [titulo, setTitulo] = useState<ContaPagar | null>(null)
  const [baixas, setBaixas] = useState<PagamentoBaixa[]>([])
  const [logs, setLogs] = useState<LogAuditoriaItem[]>([])

  // Modal de confirmação de Estorno
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
          obterContaPagarPorId(id),
          listarBaixasDoTitulo(id),
          listarLogsAuditoria({ tabela: 'contas_pagar', registro_id: id }),
        ])
        setTitulo(t)
        setBaixas(b)
        setLogs(l)
      } catch (err) {
        console.error('Erro ao carregar detalhes do título:', err)
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

  // Ação de estornar baixa
  const handleConfirmarEstorno = async () => {
    if (!baixaParaEstornar) return
    if (!motivoEstorno.trim()) {
      toast({
        title: 'Justificativa obrigatória',
        description: 'Informe o motivo do estorno do pagamento.',
        variant: 'destructive',
      })
      return
    }

    setEstornando(true)
    try {
      await estornarBaixa(baixaParaEstornar.id, motivoEstorno.trim())

      toast({
        title: 'Pagamento estornado com sucesso!',
        description:
          'O saldo do título foi restabelecido e o valor foi devolvido à conta bancária.',
      })

      setBaixaParaEstornar(null)
      setMotivoEstorno('')
      if (tituloId) carregarDados(tituloId)
      onAtualizado()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao estornar pagamento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEstornando(false)
    }
  }

  // Ação de cancelar título
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
      await cancelarTituloPagar(titulo.id, motivoCancelamento.trim())

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
  const ehNfEntrada = titulo?.origem === 'NF Entrada'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {carregando || !titulo ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-xs">Carregando detalhes do título...</span>
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-6">
                  <div>
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Título Doc. {titulo.numero_documento}
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
                        titulo.status === 'Pago'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : titulo.status === 'Pago parcial'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : titulo.status === 'Cancelado'
                              ? 'bg-slate-100 text-slate-500 line-through'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    >
                      {titulo.status}
                    </Badge>

                    {/* Botão de Cancelar Título */}
                    {titulo.status !== 'Cancelado' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (ehNfEntrada) {
                            toast({
                              title: 'Título de Nota de Entrada',
                              description:
                                'Este título não pode ser cancelado diretamente aqui. Cancele o lançamento da respectiva Nota Fiscal de Entrada no módulo de Compras.',
                              variant: 'destructive',
                            })
                            return
                          }
                          if (temBaixasAtivas) {
                            toast({
                              title: 'Pagamentos ativos',
                              description:
                                'Este título possui baixas ativas. Estorne todos os pagamentos antes de cancelar.',
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
                  <span className="text-[11px] text-slate-500 font-medium block">Fornecedor</span>
                  <span className="font-semibold text-slate-800">
                    {titulo.expand?.fornecedor_id?.razao_social ||
                      titulo.expand?.fornecedor_id?.nome_fantasia ||
                      'Não identificado'}
                  </span>
                  {titulo.expand?.fornecedor_id?.cpf_cnpj && (
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {titulo.expand.fornecedor_id.cpf_cnpj}
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
                      {titulo.origem}
                    </Badge>

                    {ehNfEntrada && titulo.origem_id && (
                      <Link
                        to={`/compras/notas/${titulo.origem_id}/conferencia`}
                        className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 font-medium underline"
                        title="Ver conferência da nota fiscal de entrada"
                      >
                        Ver Nota <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Caixa de Valores */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-center">
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
                    Valor Pago
                  </span>
                  <div className="text-base font-mono font-bold text-emerald-700">
                    R$ {titulo.valor_pago.toFixed(2)}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    Saldo Restante
                  </span>
                  <div className="text-base font-mono font-bold text-blue-800">
                    R$ {titulo.saldo.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Se o título for de NF Entrada, exibe aviso explicativo */}
              {ehNfEntrada && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Título originado por <strong>Nota Fiscal de Entrada</strong>. Para cancelar este
                    título, é necessário realizar o cancelamento do lançamento da respectiva nota no
                    módulo de Compras.
                  </span>
                </div>
              )}

              {/* Tabs com Histórico de Baixas e Logs de Auditoria */}
              <Tabs defaultValue="baixas" className="w-full pt-2">
                <TabsList className="grid grid-cols-2 w-72">
                  <TabsTrigger value="baixas" className="text-xs flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    Pagamentos ({baixas.length})
                  </TabsTrigger>
                  <TabsTrigger value="auditoria" className="text-xs flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Auditoria ({logs.length})
                  </TabsTrigger>
                </TabsList>

                {/* ABA 1: BAIXAS */}
                <TabsContent value="baixas" className="mt-3 space-y-3">
                  {baixas.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs border rounded-md bg-slate-50">
                      Nenhum pagamento registrado para este título até o momento.
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-hidden bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b text-slate-600">
                          <tr>
                            <th className="py-2 px-3 text-left">Data Pagamento</th>
                            <th className="py-2 px-3 text-left">Conta Debitada</th>
                            <th className="py-2 px-3 text-right">Principal</th>
                            <th className="py-2 px-3 text-right">Multa/Juros</th>
                            <th className="py-2 px-3 text-right">Desconto</th>
                            <th className="py-2 px-3 text-right">Total Pago</th>
                            <th className="py-2 px-3 text-center">Status</th>
                            <th className="py-2 px-3 text-center">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {baixas.map((b) => {
                            const estornada = b.estornado
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
                                  {new Date(b.data_pagamento + 'T00:00:00').toLocaleDateString(
                                    'pt-BR',
                                  )}
                                </td>
                                <td className="py-2 px-3 font-medium">
                                  {b.expand?.conta_financeira_id?.nome || 'Conta bancária'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">
                                  R$ {b.valor_pago.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-amber-700">
                                  R$ {((b.valor_multa || 0) + (b.valor_juros || 0)).toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-emerald-700">
                                  R$ {(b.valor_desconto || 0).toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                  R$ {b.valor_total_pago.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-center no-underline">
                                  {estornada ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1 bg-red-50 text-red-700 border-red-200"
                                      title={b.motivo_estorno || 'Pagamento estornado'}
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
                                      Estornar
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
                              Usuário:{' '}
                              <strong>
                                {log.expand?.usuario_id?.name ||
                                  log.expand?.usuario_id?.email ||
                                  'Sistema'}
                              </strong>
                            </p>
                            {log.valores_depois && (
                              <pre className="mt-1 text-[10px] bg-slate-50 p-1.5 rounded-sm border border-slate-200 text-slate-700 font-mono overflow-x-auto max-h-24">
                                {JSON.stringify(log.valores_depois, null, 2)}
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
              Estornar Baixa de Pagamento
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Esta ação cancelará o pagamento de R$ {baixaParaEstornar?.valor_total_pago.toFixed(2)}
              , devolverá o saldo à conta financeira e restaurará o saldo devedor do título.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="motivo_estorno" className="text-xs font-semibold text-slate-700">
                Motivo / Justificativa do Estorno *
              </Label>
              <Input
                id="motivo_estorno"
                value={motivoEstorno}
                onChange={(e) => setMotivoEstorno(e.target.value)}
                placeholder="Ex: Pagamento duplicado, erro na conta financeira, devolução do banco..."
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
              Cancelar Título a Pagar
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O título será marcado como Cancelado e o saldo será zerado.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <div className="space-y-1">
              <Label htmlFor="motivo_cancelamento" className="text-xs font-semibold text-slate-700">
                Motivo do Cancelamento *
              </Label>
              <Input
                id="motivo_cancelamento"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Ex: Cobrança indevida, negociação cancelada..."
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
