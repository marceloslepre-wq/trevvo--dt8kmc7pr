import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { PedidoTray, conferirPedidosTray, mensagemErroTray } from '@/services/tray'

/**
 * Prévia (somente leitura) dos últimos pedidos da Tray: como cada um entraria no Trevvo como
 * pedido de venda desta empresa. Cliente pelo CPF/CNPJ, itens pelo vínculo do anúncio (já em
 * unidades do produto), frete e total. Nada é gravado no Trevvo nem na Tray.
 */

interface Props {
  empresaId: string
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

const dataBr = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d
}

const docBr = (d: string) => {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return d || '-'
}

export const PedidosTray: React.FC<Props> = ({ empresaId }) => {
  const [carregando, setCarregando] = useState(false)
  const [pedidos, setPedidos] = useState<PedidoTray[]>([])
  const [proxima, setProxima] = useState<number | null>(1)
  const [total, setTotal] = useState(0)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [falhas, setFalhas] = useState(0)

  const ler = async (inicio: boolean) => {
    const pagina = inicio ? 1 : proxima
    if (!pagina) return
    setCarregando(true)
    try {
      const r = await conferirPedidosTray(empresaId, pagina, 10)
      setPedidos((atual) => (inicio ? r.pedidos : [...atual, ...r.pedidos]))
      setProxima(r.proxima_pagina)
      setTotal(r.total_pedidos)
      setFalhas((f) => (inicio ? r.falhas.length : f + r.falhas.length))
    } catch (err) {
      toast({
        title: 'Não foi possível ler os pedidos da Tray',
        description: mensagemErroTray(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  const prontos = pedidos.filter((p) => p.pronto).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 text-blue-600" />
          Pedidos da Tray (prévia)
        </CardTitle>
        <CardDescription className="text-xs">
          Mostra os últimos pedidos da loja e como cada um entraria no Trevvo como pedido de venda
          desta empresa: cliente pelo CPF/CNPJ, itens pelo vínculo do anúncio (já em unidades do
          produto), frete e total. Somente leitura: nada é gravado no Trevvo nem na Tray.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void ler(true)} disabled={carregando}>
            {carregando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingBag className="mr-1 h-4 w-4" />
            )}
            Ler os últimos 10 pedidos
          </Button>
          {pedidos.length > 0 && proxima && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ler(false)}
              disabled={carregando}
            >
              Ler mais 10
            </Button>
          )}
          {pedidos.length > 0 && (
            <span className="text-slate-600">
              {pedidos.length} de {total} pedidos lidos · {prontos} com todos os itens vinculados
              {falhas ? ` · ${falhas} não puderam ser lidos` : ''}
            </span>
          )}
        </div>

        {pedidos.length > 0 && (
          <div className="max-h-[520px] overflow-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status / canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p) => {
                  const aberto = !!abertos[p.pedido_id]
                  return (
                    <React.Fragment key={p.pedido_id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setAbertos((a) => ({ ...a, [p.pedido_id]: !aberto }))}
                      >
                        <TableCell>
                          {aberto ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          #{p.pedido_id}
                          {p.codigo_externo ? (
                            <div className="text-[10px] text-slate-500">{p.codigo_externo}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {dataBr(p.data)} {p.hora?.slice(0, 5)}
                        </TableCell>
                        <TableCell>
                          <div>{p.status || '-'}</div>
                          <div className="text-[10px] text-slate-500">{p.canal || 'Loja'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[220px] truncate">{p.cliente_nome || '-'}</div>
                          <div className="text-[10px] text-slate-500">
                            {docBr(p.cliente_documento)}
                            {p.cliente_cidade ? ` · ${p.cliente_cidade}/${p.cliente_uf}` : ''}
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              p.cliente_situacao === 'Cliente encontrado'
                                ? 'border-green-300 text-green-700'
                                : p.cliente_situacao === 'Cliente novo'
                                  ? 'border-blue-300 text-blue-700'
                                  : 'border-amber-300 text-amber-700'
                            }
                          >
                            {p.cliente_situacao}
                            {p.cliente_trevvo_codigo ? ` #${p.cliente_trevvo_codigo}` : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmt(p.frete)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(p.total)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              p.pronto
                                ? 'border-green-300 text-green-700'
                                : 'border-amber-300 text-amber-700'
                            }
                          >
                            {p.itens_ok}/{p.itens.length} vinculados
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableCell />
                          <TableCell colSpan={7}>
                            <div className="space-y-1 py-1">
                              {p.itens.map((it, i) => (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1 last:border-0"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate">
                                      {fmtNum(it.quantidade)} x {it.nome}{' '}
                                      <span className="text-slate-500">
                                        (anúncio #{it.anuncio_id}
                                        {it.variacao_id ? `/${it.variacao_id}` : ''}) ·{' '}
                                        {fmt(it.preco)}
                                      </span>
                                    </div>
                                    {it.produto_codigo ? (
                                      <div className="text-slate-600">
                                        Trevvo:{' '}
                                        <span className="font-mono font-bold">
                                          #{it.produto_codigo}
                                        </span>{' '}
                                        {it.produto_descricao} · {fmtNum(it.quantidade_trevvo)} un a{' '}
                                        {fmt(it.preco_unitario_trevvo)}
                                        {it.unidades > 1 ? ` (caixa de ${it.unidades})` : ''}
                                      </div>
                                    ) : null}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={
                                      it.situacao === 'OK'
                                        ? 'border-green-300 text-green-700'
                                        : 'border-amber-300 text-amber-700'
                                    }
                                  >
                                    {it.situacao}
                                  </Badge>
                                </div>
                              ))}
                              <div className="pt-1 text-slate-600">
                                Subtotal {fmt(p.subtotal)} · Frete {fmt(p.frete)}
                                {p.envio ? ` (${p.envio})` : ''} · Desconto {fmt(p.desconto)} ·
                                Total {fmt(p.total)}
                                {p.forma_pagamento ? ` · Pagamento: ${p.forma_pagamento}` : ''}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default PedidosTray
