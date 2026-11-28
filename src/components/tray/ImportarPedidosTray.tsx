import React, { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Square, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
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
  previaDesfazerPedidosTray,
  desfazerPedidosTray,
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

const dataBr = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d || '-'
}

// Data local AAAA-MM-DD de N dias atrás
const diasAtras = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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
  const [dataInicio, setDataInicio] = useState(diasAtras(3))
  const [foraPeriodo, setForaPeriodo] = useState(0)
  const [previaApagar, setPreviaApagar] = useState<{
    quantidade: number
    valor_total: number
    data_mais_antiga: string
    data_mais_nova: string
  } | null>(null)
  const [apagando, setApagando] = useState(false)

  // Saiu da tela: a rodada em andamento para (não fica rodando escondida).
  useEffect(() => {
    return () => {
      pararRef.current = true
    }
  }, [])

  const abrirApagar = async () => {
    try {
      const r = await previaDesfazerPedidosTray(empresaId)
      if (!r.quantidade) {
        toast({ title: 'Nenhum pedido importado da Tray em aberto nesta empresa.' })
        return
      }
      setPreviaApagar(r)
    } catch (err) {
      toast({
        title: 'Não foi possível contar os pedidos importados',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    }
  }

  const apagar = async () => {
    setPreviaApagar(null)
    setApagando(true)
    let total = 0
    try {
      for (let volta = 0; volta < 60; volta++) {
        const r = await desfazerPedidosTray(empresaId)
        total += r.apagados
        if (r.falhas.length) {
          toast({
            title: `${r.falhas.length} pedidos não puderam ser apagados`,
            description: r.falhas
              .slice(0, 3)
              .map((f) => `nº ${f.numero}: ${f.motivo}`)
              .join(' · '),
            variant: 'destructive',
          })
        }
        if (!r.restantes || !r.apagados) break
      }
      toast({ title: `${total} pedidos importados da Tray apagados.` })
      setImportados([])
      setIgnorados([])
      setJaImportados(0)
      setTerminou(false)
    } catch (err) {
      toast({
        title: 'A exclusão parou',
        description: mensagemErroTray(err, `${total} já apagados. Tente de novo para continuar.`),
        variant: 'destructive',
      })
    } finally {
      setApagando(false)
    }
  }

  const executar = async (pedidoIds?: string[]) => {
    setConfirmar(false)
    setRodando(true)
    setTerminou(false)
    pararRef.current = false
    const ignoradosRodada: string[] = []
    const execucaoId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    let foraTotal = 0
    setForaPeriodo(0)
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
          data_inicio: dataInicio,
          execucao_id: execucaoId,
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
        if (r.pagina_concluida) {
          jaTotal += r.ja_importados
          foraTotal += r.fora_do_periodo || 0
          setForaPeriodo(foraTotal)
        }
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
          <label className="flex items-center gap-1 text-slate-600">
            Pedidos a partir de
            <Input
              type="date"
              className="h-8 w-[150px] text-xs"
              value={dataInicio}
              max={diasAtras(0)}
              onChange={(e) => setDataInicio(e.target.value)}
              disabled={rodando}
            />
          </label>
          <Button
            size="sm"
            onClick={() => setConfirmar(true)}
            disabled={rodando || apagando || !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)}
          >
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
              {foraPeriodo ? ` · ${foraPeriodo} anteriores à data (ignorados)` : ''}
              {terminou ? ' · concluído' : ''}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => void abrirApagar()}
            disabled={rodando || apagando}
          >
            {apagando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" />
            )}
            Apagar pedidos importados em aberto
          </Button>
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
              Os pedidos da Tray sem nota feitos a partir de {dataBr(dataInicio)} entram como pedido
              em aberto desta empresa e passam a reservar estoque. Clientes novos são cadastrados.
              Nada é alterado na Tray. Pode rodar de novo quando quiser: o que já entrou não é
              repetido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executar()}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!previaApagar} onOpenChange={(o) => !o && setPreviaApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar os pedidos importados da Tray?</AlertDialogTitle>
            <AlertDialogDescription>
              {previaApagar?.quantidade} pedidos em aberto vindos da Tray, total{' '}
              {fmt(previaApagar?.valor_total || 0)}, de{' '}
              {dataBr(previaApagar?.data_mais_antiga || '')} a{' '}
              {dataBr(previaApagar?.data_mais_nova || '')}. Só entram pedidos ainda em aberto e sem
              nota; os clientes cadastrados ficam. Nada muda na Tray. Não dá para desfazer, mas os
              pedidos podem ser importados de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void apagar()}
            >
              Apagar {previaApagar?.quantidade} pedidos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default ImportarPedidosTray
