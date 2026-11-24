import React, { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Play, Square, Tags } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
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
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { listarCanaisMargem } from '@/services/canaisMargem'
import { salvarPrecoCanal } from '@/services/precosEmpresa'
import {
  AnuncioPrecoML,
  consultarPrecosProdutoMercadoLivre,
  mensagemErroMercadoLivre,
} from '@/services/mercadoLivre'

interface Props {
  empresaId: string
}

type Modo = 'simular' | 'teste' | 'tudo'

interface ItemFila {
  id: string
  codigo: string
  nome: string
}

interface LinhaResultado {
  codigo: string
  nome: string
  anuncio: string
  status: string
  tipo: string
  preco: number | null
  recebido: number | null
  outros: number
  situacao: string
  observacao: string
}

interface Estado {
  rodando: boolean
  modo: Modo | null
  canalId: string
  fila: ItemFila[]
  proximo: number
  linhas: LinhaResultado[]
  substituir: boolean
  terminadoEm: string
}

const TESTE = 10
const SIMULTANEOS = 3

const vazio = (): Estado => ({
  rodando: false,
  modo: null,
  canalId: '',
  fila: [],
  proximo: 0,
  linhas: [],
  substituir: false,
  terminadoEm: '',
})

// Estado fora do componente (por empresa) e guardado no navegador: continua se a tela recarregar.
const estados: Record<string, Estado> = {}
const ouvintes = new Set<() => void>()
const pararPedido: Record<string, boolean> = {}
const chaveLocal = (empresaId: string) => `trevvo_ml_precos_canal_${empresaId}`

function lerEstado(empresaId: string): Estado {
  if (!estados[empresaId]) {
    let salvo: Estado | null = null
    try {
      const bruto = localStorage.getItem(chaveLocal(empresaId))
      if (bruto) salvo = JSON.parse(bruto)
    } catch {
      salvo = null
    }
    estados[empresaId] = salvo ? { ...vazio(), ...salvo, rodando: false } : vazio()
  }
  return estados[empresaId]
}

function gravarEstado(empresaId: string, novo: Estado) {
  estados[empresaId] = novo
  try {
    localStorage.setItem(chaveLocal(empresaId), JSON.stringify(novo))
  } catch {
    // sem espaço no navegador: segue só na memória
  }
  ouvintes.forEach((f) => f())
}

function useEstado(empresaId: string): Estado {
  const [, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick((n) => n + 1)
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [])
  return lerEstado(empresaId)
}

/**
 * Escolhe o anúncio que vale para o produto: ativo antes de pausado e, entre os do mesmo
 * status, o de menor valor recebido (margem mais conservadora).
 */
function escolherAnuncio(lista: AnuncioPrecoML[]): AnuncioPrecoML | null {
  const validos = lista.filter(
    (a) =>
      (a.status_anuncio === 'active' || a.status_anuncio === 'paused') &&
      a.valor_recebido !== null &&
      a.valor_recebido > 0 &&
      a.preco > 0,
  )
  if (validos.length === 0) return null
  validos.sort((x, y) => {
    const ax = x.status_anuncio === 'active' ? 0 : 1
    const ay = y.status_anuncio === 'active' ? 0 : 1
    if (ax !== ay) return ax - ay
    return (x.valor_recebido as number) - (y.valor_recebido as number)
  })
  return validos[0]
}

async function montarFila(empresaId: string, assinanteId: string | null): Promise<ItemFila[]> {
  const filtroAss = assinanteId ? ` && assinante_id = '${assinanteId}'` : ''
  const comRef = await pb.collection('produtos').getFullList<{
    id: string
    codigo: string
    nome: string
    ativo: boolean
  }>({
    filter: `referencia != ''${filtroAss}`,
    fields: 'id,codigo,nome,ativo',
    sort: '-ativo,codigo',
    requestKey: null,
  })
  const vistos = new Set(comRef.map((p) => p.id))
  const fila: ItemFila[] = comRef.map((p) => ({ id: p.id, codigo: p.codigo, nome: p.nome }))
  // Produtos sem referência, mas com anúncio vinculado à mão.
  const vinc = await pb.collection('produtos_vinculos_anuncios').getFullList<{
    produto_id: string
  }>({
    filter: pb.filter("empresa_id = {:e} && marketplace = 'mercadolivre'", { e: empresaId }),
    fields: 'produto_id',
    requestKey: null,
  })
  const faltam = Array.from(new Set(vinc.map((v) => v.produto_id))).filter((id) => !vistos.has(id))
  for (const id of faltam) {
    try {
      const p = await pb
        .collection('produtos')
        .getOne<{ id: string; codigo: string; nome: string }>(id, {
          fields: 'id,codigo,nome',
          requestKey: null,
        })
      fila.push({ id: p.id, codigo: p.codigo, nome: p.nome })
    } catch {
      // produto apagado: ignora
    }
  }
  return fila
}

async function processarProduto(
  empresaId: string,
  item: ItemFila,
  canalId: string,
  assinanteId: string | null,
  modo: Modo,
  jaPreenchidos: Set<string>,
  substituir: boolean,
): Promise<LinhaResultado> {
  const base: LinhaResultado = {
    codigo: item.codigo,
    nome: item.nome,
    anuncio: '',
    status: '',
    tipo: '',
    preco: null,
    recebido: null,
    outros: 0,
    situacao: '',
    observacao: '',
  }
  let resp = null
  let erro: unknown = null
  for (let t = 0; t < 3 && !resp; t++) {
    try {
      resp = await consultarPrecosProdutoMercadoLivre(empresaId, item.id)
    } catch (e) {
      erro = e
      await new Promise((r) => setTimeout(r, 2000 * (t + 1)))
    }
  }
  if (!resp) {
    return {
      ...base,
      situacao: 'Erro',
      observacao: mensagemErroMercadoLivre(erro, 'Falha ao consultar o Mercado Livre.'),
    }
  }
  const escolhido = escolherAnuncio(resp.anuncios || [])
  if (!escolhido) {
    const n = (resp.anuncios || []).length
    return {
      ...base,
      situacao: 'Sem anúncio',
      observacao:
        n > 0
          ? `${n} anúncio(s) encontrados, nenhum ativo/pausado com valor recebido calculado.`
          : `Nenhum anúncio com SKU ${resp.sku || '(sem referência)'}.`,
    }
  }
  const linha: LinhaResultado = {
    ...base,
    anuncio: escolhido.anuncio_id + (escolhido.variacao ? ` (${escolhido.variacao})` : ''),
    status: escolhido.status_anuncio === 'active' ? 'Ativo' : 'Pausado',
    tipo: escolhido.tipo_anuncio,
    preco: escolhido.preco,
    recebido: escolhido.valor_recebido,
    outros: Math.max(0, (resp.anuncios || []).length - 1),
  }
  if (jaPreenchidos.has(item.id) && !substituir) {
    return { ...linha, situacao: 'Mantido', observacao: 'Já tinha preço no canal.' }
  }
  if (modo === 'simular') return { ...linha, situacao: 'Seria gravado' }
  try {
    await salvarPrecoCanal(item.id, canalId, escolhido.preco, escolhido.valor_recebido, assinanteId)
    return { ...linha, situacao: 'Gravado' }
  } catch (e) {
    return {
      ...linha,
      situacao: 'Erro',
      observacao: mensagemErroMercadoLivre(e, 'Falha ao gravar no Trevvo.'),
    }
  }
}

async function rodar(
  empresaId: string,
  assinanteId: string | null,
  modo: Modo,
  continuar: boolean,
) {
  const atual = lerEstado(empresaId)
  if (atual.rodando) return
  pararPedido[empresaId] = false
  try {
    let canalId = atual.canalId
    let fila = atual.fila
    let proximo = atual.proximo
    let linhas = atual.linhas
    if (!continuar) {
      const canais = await listarCanaisMargem(assinanteId, true)
      const canal = canais.find(
        (c) => c.empresa_id === empresaId && /mercado\s*livre/i.test(c.nome || ''),
      )
      if (!canal?.id) {
        toast({
          title: 'Canal não encontrado',
          description:
            'Cadastre em "Canais de venda (margem)" um canal Mercado Livre ligado a esta empresa.',
          variant: 'destructive',
        })
        return
      }
      canalId = canal.id
      gravarEstado(empresaId, { ...vazio(), rodando: true, modo, substituir: atual.substituir })
      fila = await montarFila(empresaId, assinanteId)
      if (modo === 'teste') fila = fila.slice(0, TESTE)
      proximo = 0
      linhas = []
    }
    gravarEstado(empresaId, {
      ...lerEstado(empresaId),
      rodando: true,
      modo,
      canalId,
      fila,
      proximo,
      linhas,
      terminadoEm: '',
    })

    // Quais produtos já têm preço neste canal (para não substituir sem pedir).
    const existentes = await pb.collection('produtos_precos_canal').getFullList<{
      produto_id: string
    }>({
      filter: pb.filter('canal_id = {:c}', { c: canalId }),
      fields: 'produto_id',
      requestKey: null,
    })
    const jaPreenchidos = new Set(existentes.map((e) => e.produto_id))

    let errosSeguidos = 0
    while (proximo < fila.length && !pararPedido[empresaId]) {
      const lote = fila.slice(proximo, proximo + SIMULTANEOS)
      const e0 = lerEstado(empresaId)
      const res = await Promise.all(
        lote.map((it) =>
          processarProduto(empresaId, it, canalId, assinanteId, modo, jaPreenchidos, e0.substituir),
        ),
      )
      proximo += lote.length
      errosSeguidos = res.every((r) => r.situacao === 'Erro') ? errosSeguidos + 1 : 0
      const e1 = lerEstado(empresaId)
      gravarEstado(empresaId, { ...e1, proximo, linhas: e1.linhas.concat(res) })
      if (errosSeguidos >= 3)
        throw new Error('Muitas falhas seguidas ao consultar o Mercado Livre.')
    }
    const fim = lerEstado(empresaId)
    gravarEstado(empresaId, {
      ...fim,
      rodando: false,
      terminadoEm: fim.proximo >= fim.fila.length ? new Date().toISOString() : '',
    })
    toast({
      title: pararPedido[empresaId] ? 'Interrompido' : 'Concluído',
      description: 'O resultado fica salvo nesta tela; use "Baixar resultado".',
    })
  } catch (err) {
    gravarEstado(empresaId, { ...lerEstado(empresaId), rodando: false })
    toast({
      title: 'Parou',
      description: `${mensagemErroMercadoLivre(err, 'Falha de comunicação.')} Clique em "Continuar de onde parou".`,
      variant: 'destructive',
    })
  }
}

const brl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Preenche, em lote, o "Preço no canal" e o "Valor recebido" do canal Mercado Livre
 * (aba Preços do produto) com os números dos anúncios ativos e pausados. Só lê o ML.
 */
export const PreencherPrecosML: React.FC<Props> = ({ empresaId }) => {
  const assinanteId = useAssinanteId()
  const estado = useEstado(empresaId)
  const { linhas, fila, proximo, rodando, modo } = estado

  const resumo = useMemo(() => {
    const mapa: Record<string, number> = {}
    linhas.forEach((l) => {
      mapa[l.situacao] = (mapa[l.situacao] || 0) + 1
    })
    return mapa
  }, [linhas])

  const baixar = () => {
    const cab = [
      'Código',
      'Produto',
      'Anúncio usado',
      'Status',
      'Tipo',
      'Preço no ML',
      'Valor recebido',
      'Outros anúncios',
      'Situação',
      'Observação',
    ]
    const num = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const corpo = linhas.map((l) =>
      [
        l.codigo,
        l.nome,
        l.anuncio,
        l.status,
        l.tipo,
        num(l.preco),
        num(l.recebido),
        l.outros,
        l.situacao,
        l.observacao,
      ]
        .map(esc)
        .join(';'),
    )
    const conteudo = '﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = modo === 'simular' ? 'simulacao-precos-ml.csv' : 'precos-ml-preenchidos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const progresso = fila.length > 0 ? Math.min(100, Math.round((proximo / fila.length) * 100)) : 0
  const podeContinuar = !rodando && modo === 'tudo' && fila.length > 0 && proximo < fila.length

  return (
    <Card className="notranslate" translate="no">
      <CardHeader>
        <CardTitle className="text-base">Preencher preço e valor recebido dos produtos</CardTitle>
        <CardDescription>
          Para cada produto com anúncio no Mercado Livre (pelo SKU = Referência, ou anúncio
          vinculado), grava na aba Preços do produto o &quot;Preço no canal&quot; e o &quot;Valor
          recebido&quot; do canal Mercado Livre. Vale o anúncio ativo (senão o pausado); se houver
          mais de um, o de menor valor recebido. Nada é alterado no Mercado Livre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={estado.substituir}
            onCheckedChange={(v) => gravarEstado(empresaId, { ...estado, substituir: v === true })}
            disabled={rodando}
          />
          Substituir os valores que o produto já tem no canal
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => rodar(empresaId, assinanteId, 'simular', false)}
            disabled={rodando}
          >
            Simular (não grava)
          </Button>
          <Button
            variant="outline"
            onClick={() => rodar(empresaId, assinanteId, 'teste', false)}
            disabled={rodando}
          >
            {rodando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Tags className="mr-2 h-4 w-4" />
            )}
            Testar com {TESTE} produtos
          </Button>
          <Button onClick={() => rodar(empresaId, assinanteId, 'tudo', false)} disabled={rodando}>
            Preencher todos
          </Button>
          {podeContinuar && (
            <Button onClick={() => rodar(empresaId, assinanteId, 'tudo', true)}>
              <Play className="mr-2 h-4 w-4" />
              Continuar de onde parou
            </Button>
          )}
          {rodando && (
            <Button
              variant="destructive"
              onClick={() => {
                pararPedido[empresaId] = true
              }}
            >
              <Square className="mr-2 h-4 w-4" />
              Parar
            </Button>
          )}
          {linhas.length > 0 && (
            <Button variant="outline" onClick={baixar}>
              <Download className="mr-2 h-4 w-4" />
              Baixar resultado
            </Button>
          )}
        </div>

        {(rodando || linhas.length > 0) && (
          <div className="space-y-2">
            <Progress value={progresso} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {proximo} de {fila.length} produtos
                {modo === 'simular' ? ' (simulação, nada foi gravado)' : ''}
                {!rodando && estado.terminadoEm
                  ? ` · concluído em ${new Date(estado.terminadoEm).toLocaleString('pt-BR')}`
                  : ''}
                {podeContinuar ? ' · parou antes do fim' : ''}
              </span>
              {Object.keys(resumo).map((s) => (
                <Badge
                  key={s}
                  variant={
                    s === 'Gravado' || s === 'Seria gravado'
                      ? 'secondary'
                      : s === 'Erro'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {s}: {resumo[s]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="max-h-[420px] overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Anúncio</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.slice(-200).map((l, i) => (
                  <TableRow key={`${l.codigo}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{l.nome || '—'}</div>
                      <div className="text-xs text-muted-foreground">{l.codigo}</div>
                    </TableCell>
                    <TableCell>
                      <div>{l.anuncio || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.status, l.tipo, l.outros ? `+${l.outros} outro(s)` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{brl(l.preco)}</TableCell>
                    <TableCell className="text-right">{brl(l.recebido)}</TableCell>
                    <TableCell>
                      <div>{l.situacao}</div>
                      {l.observacao && (
                        <div className="text-xs text-muted-foreground">{l.observacao}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {linhas.length > 200 && (
          <p className="text-xs text-muted-foreground">
            A tabela mostra as últimas 200 linhas; a planilha traz todas as {linhas.length}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default PreencherPrecosML
