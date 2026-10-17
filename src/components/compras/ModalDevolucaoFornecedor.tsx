import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import {
  NotaEntrada,
  NotaEntradaItem,
  emitirNfeDevolucaoCompra,
  confirmarAutorizacaoDevolucaoCompra,
} from '@/services/notasEntrada'
import { consultarSituacaoNFe } from '@/services/fiscalIntegracao'
import { Loader2, ArrowLeftRight, CheckCircle, AlertTriangle, Send } from 'lucide-react'

interface ModalDevolucaoFornecedorProps {
  aberto: boolean
  aoFechar: () => void
  nota: NotaEntrada
  itens: NotaEntradaItem[]
  aoSucesso: () => void
}

interface ItemDevolucaoState {
  itemId: string
  descricao: string
  quantidadeEntrada: number
  quantidadeJaDevolvida: number
  saldoDisponivel: number
  quantidadeDevolver: number
  valorUnitario: number
  selecionado: boolean
}

export function ModalDevolucaoFornecedor({
  aberto,
  aoFechar,
  nota,
  itens,
  aoSucesso,
}: ModalDevolucaoFornecedorProps) {
  const { toast } = useToast()

  const [itensDev, setItensDev] = useState<ItemDevolucaoState[]>(() => {
    return itens.map((it) => {
      const qtdEntrada = it.quantidade_fornecedor || it.quantidade_estoque || 0
      const qtdJaDev = it.quantidade_devolvida || 0
      const saldo = Math.max(0, qtdEntrada - qtdJaDev)
      return {
        itemId: it.id,
        descricao: it.descricao_fornecedor,
        quantidadeEntrada: qtdEntrada,
        quantidadeJaDevolvida: qtdJaDev,
        saldoDisponivel: saldo,
        quantidadeDevolver: saldo,
        valorUnitario: it.valor_unitario_fornecedor || 0,
        selecionado: saldo > 0,
      }
    })
  })

  const [motivo, setMotivo] = useState('')
  const [destinoFinanceiro, setDestinoFinanceiro] = useState<'abater_titulos' | 'gerar_receber'>(
    'abater_titulos',
  )
  const [carregando, setCarregando] = useState(false)
  const [etapa, setEtapa] = useState<'formulario' | 'aguardando_autorizacao' | 'concluido'>(
    'formulario',
  )
  const [docIdCriado, setDocIdCriado] = useState<string>('')
  const [statusSefaz, setStatusSefaz] = useState<string>('')

  const totalDevolucao = itensDev
    .filter((i) => i.selecionado && i.quantidadeDevolver > 0)
    .reduce((acc, i) => acc + i.quantidadeDevolver * i.valorUnitario, 0)

  const handleToggleItem = (itemId: string) => {
    setItensDev((prev) =>
      prev.map((it) => (it.itemId === itemId ? { ...it, selecionado: !it.selecionado } : it)),
    )
  }

  const handleQtdChange = (itemId: string, valor: number) => {
    setItensDev((prev) =>
      prev.map((it) => {
        if (it.itemId === itemId) {
          const v = Math.min(Math.max(0, valor), it.saldoDisponivel)
          return { ...it, quantidadeDevolver: v, selecionado: v > 0 }
        }
        return it
      }),
    )
  }

  const handleEmitirDevolucao = async () => {
    const selecionados = itensDev.filter((i) => i.selecionado && i.quantidadeDevolver > 0)
    if (selecionados.length === 0) {
      toast({
        title: 'Selecione os itens',
        description: 'Informe a quantidade a devolver para ao menos um item da nota.',
        variant: 'destructive',
      })
      return
    }

    if (!motivo.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo da devolução ao fornecedor.',
        variant: 'destructive',
      })
      return
    }

    if (!nota.chave_acesso || nota.chave_acesso.replace(/\D/g, '').length !== 44) {
      toast({
        title: 'Chave de acesso ausente',
        description:
          'A nota de entrada precisa de chave de acesso válida (44 dígitos) para ser referenciada.',
        variant: 'destructive',
      })
      return
    }

    setCarregando(true)
    try {
      const resp = await emitirNfeDevolucaoCompra({
        nota_entrada_id: nota.id,
        motivo: motivo.trim(),
        destino_financeiro: destinoFinanceiro,
        itens: selecionados.map((s) => ({
          item_id: s.itemId,
          quantidade: s.quantidadeDevolver,
        })),
      })

      if (!resp.sucesso) {
        toast({
          title: 'Erro na emissão da NF-e',
          description: resp.message,
          variant: 'destructive',
        })
        setCarregando(false)
        return
      }

      setDocIdCriado(resp.documento_id || '')
      setEtapa('aguardando_autorizacao')
      setStatusSefaz('Processando autorização na SEFAZ...')

      // Polling de verificação de status da NF-e
      let tentativas = 0
      const intervalo = setInterval(async () => {
        tentativas++
        if (tentativas > 12) {
          clearInterval(intervalo)
          setCarregando(false)
          setStatusSefaz('Tempo limite de consulta excedido. Consulte o status no menu Fiscal.')
          return
        }

        try {
          if (resp.documento_id) {
            const sit = await consultarSituacaoNFe(resp.documento_id)
            if (sit.status === 'Autorizada') {
              clearInterval(intervalo)
              setStatusSefaz('NF-e de devolução Autorizada! Atualizando estoque e financeiro...')

              // Confirmar estoque e financeiro
              await confirmarAutorizacaoDevolucaoCompra({
                documento_id: resp.documento_id,
                nota_entrada_id: nota.id,
                destino_financeiro: destinoFinanceiro,
              })

              setEtapa('concluido')
              setCarregando(false)
              toast({
                title: 'Devolução autorizada com sucesso!',
                description: `NF-e nº ${sit.numero || ''} autorizada. Estoque e financeiro movimentados.`,
              })
              aoSucesso()
            } else if (sit.status === 'Rejeitada') {
              clearInterval(intervalo)
              setCarregando(false)
              setStatusSefaz(`Rejeitada pela SEFAZ: ${sit.mensagem_sefaz || sit.status_sefaz}`)
              toast({
                title: 'NF-e Rejeitada',
                description: sit.mensagem_sefaz || 'Erro na autorização da nota fiscal.',
                variant: 'destructive',
              })
            }
          }
        } catch {
          /* intentionally ignored */
        }
      }, 3000)
    } catch (err: any) {
      toast({
        title: 'Falha na devolução',
        description: err.message || 'Erro ao processar devolução.',
        variant: 'destructive',
      })
      setCarregando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !carregando && !open && aoFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
            Devolver ao Fornecedor — Nota #{nota.numero} (Série {nota.serie})
          </DialogTitle>
          <DialogDescription>
            Emita uma NF-e de saída de devolução (Finalidade 4) com referência à nota de entrada
            original. Estoque e financeiro só serão alterados após autorização da nota pela SEFAZ.
          </DialogDescription>
        </DialogHeader>

        {etapa === 'formulario' && (
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Entrada</TableHead>
                    <TableHead className="text-right">Já Devolvido</TableHead>
                    <TableHead className="text-right">Saldo Disp.</TableHead>
                    <TableHead className="text-right w-[120px]">Qtd a Devolver</TableHead>
                    <TableHead className="text-right">Total (R$)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensDev.map((it) => (
                    <TableRow key={it.itemId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={it.selecionado}
                          onChange={() => handleToggleItem(it.itemId)}
                          disabled={it.saldoDisponivel <= 0}
                          className="rounded text-primary focus:ring-primary"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-xs">{it.descricao}</TableCell>
                      <TableCell className="text-right text-xs">
                        {it.quantidadeEntrada.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {it.quantidadeJaDevolvida.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-slate-700">
                        {it.saldoDisponivel.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          max={it.saldoDisponivel}
                          value={it.quantidadeDevolver}
                          onChange={(e) =>
                            handleQtdChange(it.itemId, parseFloat(e.target.value) || 0)
                          }
                          disabled={!it.selecionado || it.saldoDisponivel <= 0}
                          className="h-8 text-right text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono font-medium">
                        {(it.quantidadeDevolver * it.valorUnitario).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border">
              <span className="text-sm font-medium text-slate-700">Valor Total da Devolução:</span>
              <span className="text-base font-bold text-indigo-700 font-mono">
                {totalDevolucao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo" className="text-xs font-semibold">
                Motivo da Devolução <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motivo"
                placeholder="Ex.: Mercadoria com avaria, desacordo com o pedido de compra, item enviado a mais..."
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-semibold">Destino Financeiro da Devolução:</Label>
              <RadioGroup
                value={destinoFinanceiro}
                onValueChange={(v) => setDestinoFinanceiro(v as 'abater_titulos' | 'gerar_receber')}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <div className="flex items-start space-x-2 border p-3 rounded-lg bg-white">
                  <RadioGroupItem value="abater_titulos" id="r1" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <Label htmlFor="r1" className="text-xs font-medium cursor-pointer">
                      Abater dos títulos em aberto da nota
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Concede desconto proporcional no contas a pagar desta nota de entrada.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2 border p-3 rounded-lg bg-white">
                  <RadioGroupItem value="gerar_receber" id="r2" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <Label htmlFor="r2" className="text-xs font-medium cursor-pointer">
                      Gerar conta a receber do fornecedor
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Cria crédito/título a receber em nome do fornecedor (como cliente).
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}

        {etapa === 'aguardando_autorizacao' && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            {carregando ? (
              <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            )}
            <div className="space-y-1">
              <h3 className="font-semibold text-base">Processamento da Devolução</h3>
              <p className="text-xs text-muted-foreground max-w-md">{statusSefaz}</p>
            </div>
            {!carregando && (
              <Button variant="outline" size="sm" onClick={() => setEtapa('formulario')}>
                Voltar e revisar
              </Button>
            )}
          </div>
        )}

        {etapa === 'concluido' && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-600" />
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-emerald-800">Devolução Concluída!</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                A NF-e de devolução foi autorizada com sucesso pela SEFAZ. O estoque foi baixado
                pelo custo de entrada e o financeiro foi atualizado conforme selecionado.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t">
          {etapa === 'formulario' && (
            <>
              <Button variant="outline" onClick={aoFechar} disabled={carregando}>
                Cancelar
              </Button>
              <Button
                onClick={handleEmitirDevolucao}
                disabled={carregando || totalDevolucao <= 0}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {carregando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Emitir NF-e de Devolução
              </Button>
            </>
          )}

          {etapa === 'concluido' && (
            <Button onClick={aoFechar} className="bg-emerald-600 hover:bg-emerald-700">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
