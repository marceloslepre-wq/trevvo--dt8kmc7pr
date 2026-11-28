import React, { useRef, useState } from 'react'
import { Download, Loader2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import {
  PedidoIgnoradoTray,
  PedidoImportadoTray,
  importarPedidosTray,
  mensagemErroTray,
} from '@/services/tray'

/**
 * Importa os pedidos da Tray com status "A ENVIAR" (ainda sem nota) como "Pedido em aberto"
 * desta empresa. Cada pedido entra uma vez só; os que têm problema (item sem vínculo, produto
 * inativo, sem CPF/CNPJ) não entram e aparecem na lista com o motivo. Não grava nada na Tray e
 * não baixa estoque: o pedido em aberto reserva a quantidade (o envio de estoque desconta).
 */

interface Props {
  empresaId: string
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const ImportarPedidosTray: React.FC<Props> = ({ empresaId }) => {
  const [confirmar, setConfirmar] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [importados, setImportados] = useState<PedidoImportadoTray[]>([])
  const [ignorados, setIgnorados] = useState<PedidoIgnoradoTray[]>([])
  const [jaImportados, setJaImportados] = useState(0)
  const [terminou, setTerminou] = useState(false)
  const pararRef = useRef(false)

  const executar = async (pedidoIds?: string[]) => {
    setConfirmar(false)
    setRodando(true)
    setTerminou(false)
    pararRef.current = false
    const ignoradosRodada: string[] = []
    if (!pedidoIds) {
      setImportados([])
      setIgnorados([])
      setJaImportados(0)
    }
    let pagina: number | null = 1
    let jaTotal = 0
    let voltas = 0
    try {
      while (pagina !== null && !pararRef.current && voltas < 200) {
        voltas++
        const r = await importarPedidosTray({
          empresa_id: empresaId,
          pagina,
          pedido_ids: pedidoIds,
          ignorar_ids: ignoradosRodada,
        })
        // Os que entraram nesta rodada também vão em ignorar_ids, para não contarem como "já
        // estavam no Trevvo" na próxima chamada.
        for (const x of r.importados) ignoradosRodada.push(x.pedido_id)
        if (r.importados.length) setImportados((a) => [...a, ...r.importados])
        if (r.ignorados.length) {
          for (const g of r.ignorados) ignoradosRodada.push(g.pedido_id)
          setIgnorados((a) => [
            ...a.filter((x) => !r.ignorados.some((g) => g.pedido_id === x.pedido_id)),
            ...r.ignorados,
          ])
        }
        if (pedidoIds) {
          const ok = new Set(r.importados.map((x) => x.pedido_id))
          setIgnorados((a) => a.filter((x) => !ok.has(x.pedido_id)))
        }
        if (r.pagina_concluida) jaTotal += r.ja_importados
        setJaImportados(jaTotal)
        pagina = pedidoIds ? null : r.proxima_pagina
      }
      setTerminou(true)
    } catch (err) {
      toast({
        title: 'A importação parou',
        description: mensagemErroTray(err, 'Tente novamente: o que já entrou não é repetido.'),
        variant: 'destructive',
      })
    } finally {
      setRodando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4 text-blue-600" />
          Importar pedidos "A enviar"
        </CardTitle>
        <CardDescription className="text-xs">
          Traz os pedidos da Tray que ainda não têm nota (status A ENVIAR) como pedido em aberto
          desta empresa, com cliente (cadastrado se for novo), itens pelo vínculo, frete, canal e
          número do pedido no marketplace. Cada pedido entra uma vez só. Não grava nada na Tray e
          não baixa estoque: o pedido em aberto reserva a quantidade, e o envio de estoque para a
          Tray já desconta essa reserva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setConfirmar(true)} disabled={rodando}>
            {rodando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Importar pedidos A enviar
          </Button>
          {rodando && (
            <Button size="sm" variant="outline" onClick={() => (pararRef.current = true)}>
              <Square className="mr-1 h-3.5 w-3.5" />
              Parar
            </Button>
          )}
          {(rodando || terminou) && (
            <span className="text-slate-600">
              {importados.length} importados · {ignorados.length} com problema
              {jaImportados ? ` · ${jaImportados} já estavam no Trevvo` : ''}
              {terminou ? ' · concluído' : ''}
            </span>
          )}
        </div>

        {ignorados.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-800">
                Não entraram ({ignorados.length}): corrija e importe de novo
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={rodando}
                onClick={() => void executar(ignorados.map((g) => g.pedido_id).slice(0, 20))}
              >
                Tentar estes de novo
              </Button>
            </div>
            {ignorados.map((g) => (
              <div key={g.pedido_id} className="border-b border-amber-200 pb-1 last:border-0">
                <span className="font-mono">#{g.pedido_id}</span>
                {g.canal ? <span className="text-slate-500"> · {g.canal}</span> : null}: {g.motivo}
              </div>
            ))}
          </div>
        )}

        {importados.length > 0 && (
          <div className="max-h-[360px] space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
            {importados.map((p) => (
              <div
                key={p.pedido_id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-mono">Tray #{p.pedido_id}</span> → pedido{' '}
                  <span className="font-mono font-bold">nº {p.venda_numero}</span> · {p.cliente}
                  {p.canal ? <span className="text-slate-500"> · {p.canal}</span> : null}
                  {p.pedido_marketplace ? (
                    <span className="text-slate-500"> {p.pedido_marketplace}</span>
                  ) : null}
                  {p.avisos.length > 0 && (
                    <div className="text-amber-700">{p.avisos.join(' · ')}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {p.cliente_novo && (
                    <Badge variant="outline" className="border-blue-300 text-blue-700">
                      Cliente novo
                    </Badge>
                  )}
                  <span className="font-semibold">{fmt(p.total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar os pedidos A enviar?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pedidos da Tray sem nota entram como pedido em aberto desta empresa e passam a
              reservar estoque. Clientes novos são cadastrados. Nada é alterado na Tray. Pode rodar
              de novo quando quiser: o que já entrou não é repetido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executar()}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default ImportarPedidosTray
