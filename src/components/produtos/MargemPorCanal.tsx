import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Loader2, Info, Check, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  CanalMargem,
  ImpostosVendaPerfil,
  CLASSE_FAIXA,
  ROTULO_FAIXA,
  classeMargem,
  faixaMargem,
  IMPOSTOS_PADRAO,
  calcularMargemCanal,
  listarCanaisMargem,
  obterImpostosVendaDoPerfil,
  precoParaMargemCanal,
} from '@/services/canaisMargem'
import { listarPrecosCanalDoProduto, salvarPrecoCanal } from '@/services/precosEmpresa'
import {
  AnuncioPrecoML,
  desvincularAnuncioMercadoLivre,
  consultarPrecosProdutoMercadoLivre,
  mensagemErroMercadoLivre,
} from '@/services/mercadoLivre'

interface MargemPorCanalProps {
  produtoId?: string
  custo: number
  /** Preço geral do produto (preco_venda). */
  preco: number
  /** Preços próprios por loja (empresa_id -> preço). */
  precosLoja?: Record<string, number>
  perfilTributarioId?: string | null
  podeEditar?: boolean
}

type ValoresCanal = { preco: number | null; recebido: number | null }

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const pct = (v: number) => `${(v || 0).toFixed(2).replace('.', ',')}%`
const paraNumero = (txt: string): number | null => {
  const t = String(txt || '').trim()
  if (!t) return null
  const v = Number(t.replace(',', '.'))
  return Number.isNaN(v) || v <= 0 ? null : Number(v.toFixed(2))
}

const TIPO_ANUNCIO_ML: Record<string, string> = {
  gold_special: 'Clássico',
  gold_pro: 'Premium',
  free: 'Grátis',
}
const STATUS_ANUNCIO_ML: Record<string, string> = {
  active: 'ativo',
  paused: 'pausado',
  closed: 'finalizado',
  under_review: 'em revisão',
  inactive: 'inativo',
}

const ehCanalML = (c: CanalMargem) => /mercado\s*livre/i.test(c.nome || '') && !!c.empresa_id

/**
 * Tabela "Margem por canal". Para cada canal:
 *  - preço base = preço da loja do canal (ou o preço geral);
 *  - preço pela regra = preço base + acréscimo % do canal (como a Tray);
 *  - o produto pode ter preço próprio no canal (ex.: Shopee) e o valor recebido líquido
 *    (ex.: "Você recebe" do Mercado Livre). Com valor recebido, a comissão/taxas real é
 *    preço − recebido. Impostos sempre sobre o preço (valor da nota).
 */
export const MargemPorCanal: React.FC<MargemPorCanalProps> = ({
  produtoId,
  custo,
  preco,
  precosLoja = {},
  perfilTributarioId,
  podeEditar = false,
}) => {
  const assinanteId = useAssinanteId()
  const { empresas } = useEmpresaAtiva()
  const { toast } = useToast()
  const [canais, setCanais] = useState<CanalMargem[]>([])
  const [impostos, setImpostos] = useState<ImpostosVendaPerfil>(IMPOSTOS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [margensDesejadas, setMargensDesejadas] = useState<Record<string, string>>({})
  const [salvos, setSalvos] = useState<Record<string, ValoresCanal>>({})
  const [rascunho, setRascunho] = useState<Record<string, { preco?: string; recebido?: string }>>(
    {},
  )
  const [salvando, setSalvando] = useState('')
  const [salvoOk, setSalvoOk] = useState('')
  const [mlBuscando, setMlBuscando] = useState('')
  const [mlOpcoes, setMlOpcoes] = useState<Record<string, AnuncioPrecoML[]>>({})
  /** Canal em que a busca pelo SKU falhou: mostra o campo para digitar anúncio ou SKU. */
  const [mlManual, setMlManual] = useState<Record<string, string>>({})
  /** Última consulta ao Mercado Livre por canal, para conferir os números. */
  const [mlUltimo, setMlUltimo] = useState<Record<string, AnuncioPrecoML>>({})

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro('')
    listarCanaisMargem(assinanteId, true)
      .then((lista) => {
        if (ativo) setCanais(lista)
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar os canais de venda.')
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [assinanteId])

  useEffect(() => {
    let ativo = true
    if (!produtoId) {
      setSalvos({})
      return
    }
    listarPrecosCanalDoProduto(produtoId)
      .then((linhas) => {
        if (!ativo) return
        const mapa: Record<string, ValoresCanal> = {}
        for (const l of linhas) {
          mapa[l.canal_id] = {
            preco: Number(l.preco) > 0 ? Number(l.preco) : null,
            recebido: Number(l.valor_recebido) > 0 ? Number(l.valor_recebido) : null,
          }
        }
        setSalvos(mapa)
      })
      .catch(() => {
        /* tabela ainda não existe ou sem acesso: segue só com a regra */
      })
    return () => {
      ativo = false
    }
  }, [produtoId])

  useEffect(() => {
    let ativo = true
    obterImpostosVendaDoPerfil(perfilTributarioId).then((imp) => {
      if (ativo) setImpostos(imp)
    })
    return () => {
      ativo = false
    }
  }, [perfilTributarioId])

  const nomeEmpresa = (empresaId?: string) => {
    if (!empresaId) return ''
    const e = empresas.find((x) => x.id === empresaId)
    return e ? e.nome_fantasia || e.razao_social || '' : ''
  }

  const linhas = useMemo(
    () =>
      canais.map((c) => {
        const chave = c.id || c.nome
        const proprioLoja = c.empresa_id ? precosLoja[c.empresa_id] : undefined
        const base = proprioLoja !== undefined ? proprioLoja : Number(preco) || 0
        const acrescimo = Number(c.acrescimo_percentual) || 0
        const precoRegra = Number((base * (1 + acrescimo / 100)).toFixed(2))
        const salvo = salvos[chave] || { preco: null, recebido: null }
        const precoCanal = salvo.preco !== null ? salvo.preco : precoRegra
        const r = calcularMargemCanal(precoCanal, custo, c, impostos, salvo.recebido)
        return {
          canal: c,
          chave,
          base,
          baseDaLoja: proprioLoja !== undefined,
          acrescimo,
          precoRegra,
          salvo,
          r,
        }
      }),
    [canais, preco, precosLoja, custo, impostos, salvos],
  )

  const gravar = async (canalId: string, valores: ValoresCanal) => {
    if (!produtoId) return
    setSalvando(canalId)
    try {
      await salvarPrecoCanal(produtoId, canalId, valores.preco, valores.recebido, assinanteId)
      setSalvos((prev) => Object.assign({}, prev, { [canalId]: valores }))
      setRascunho((prev) => {
        const novo = Object.assign({}, prev)
        delete novo[canalId]
        return novo
      })
      setSalvoOk(canalId)
      window.setTimeout(() => setSalvoOk(''), 1500)
    } catch (err) {
      toast({
        title: 'Erro ao salvar o preço do canal',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSalvando('')
    }
  }

  const aoSair = (canalId: string, salvo: ValoresCanal) => {
    const r = rascunho[canalId]
    if (!r) return
    const novoPreco = r.preco !== undefined ? paraNumero(r.preco) : salvo.preco
    const novoRecebido = r.recebido !== undefined ? paraNumero(r.recebido) : salvo.recebido
    if (novoPreco === salvo.preco && novoRecebido === salvo.recebido) return
    void gravar(canalId, { preco: novoPreco, recebido: novoRecebido })
  }

  const editar = (canalId: string, campo: 'preco' | 'recebido', valor: string) => {
    setRascunho((prev) =>
      Object.assign({}, prev, {
        [canalId]: Object.assign({}, prev[canalId], { [campo]: valor }),
      }),
    )
  }

  const editavel = podeEditar && Boolean(produtoId)

  const detalheML = (a: AnuncioPrecoML) => {
    const partes = [`preço ${brl(a.preco)}`]
    if (a.tarifa_venda !== null) partes.push(`tarifa ${brl(a.tarifa_venda)}`)
    if (a.custo_envio !== null) partes.push(`envio ${brl(a.custo_envio)}`)
    return partes.join(' − ') + (a.valor_recebido !== null ? ` = ${brl(a.valor_recebido)}` : '')
  }

  const usarAnuncioML = async (chave: string, a: AnuncioPrecoML) => {
    setMlOpcoes((prev) => {
      const novo = Object.assign({}, prev)
      delete novo[chave]
      return novo
    })
    setMlUltimo((prev) => Object.assign({}, prev, { [chave]: a }))
    await gravar(chave, {
      preco: a.preco > 0 ? Number(a.preco.toFixed(2)) : null,
      recebido: a.valor_recebido !== null && a.valor_recebido > 0 ? a.valor_recebido : null,
    })
    toast({
      title: `Mercado Livre ${a.anuncio_id}`,
      description:
        detalheML(a) +
        (a.custo_envio === null ? ' (custo de envio não informado pelo Mercado Livre)' : ''),
    })
  }

  const puxarDoML = async (canal: CanalMargem, chave: string, manual?: string) => {
    if (!produtoId || !canal.empresa_id) return
    const termo = (manual || '').trim()
    const ehAnuncio = /^(MLB)?\d{6,}$/i.test(termo.replace(/[^A-Za-z0-9]/g, ''))
    const opcoes = !termo
      ? {}
      : ehAnuncio
        ? { anuncio: termo.replace(/[^A-Za-z0-9]/g, '') }
        : { sku: termo }
    setMlBuscando(chave)
    try {
      const r = await consultarPrecosProdutoMercadoLivre(canal.empresa_id, produtoId, opcoes)
      // Ativos primeiro
      const lista = (r.anuncios || [])
        .slice()
        .sort(
          (x, y) => Number(y.status_anuncio === 'active') - Number(x.status_anuncio === 'active'),
        )
      if (lista.length === 0) {
        setMlManual((prev) => Object.assign({}, prev, { [chave]: prev[chave] || '' }))
        toast({
          title: 'Nenhum anúncio encontrado no Mercado Livre',
          description: termo
            ? `Nada encontrado para "${termo}" na conta da loja do canal.`
            : r.mensagem ||
              `Nenhum anúncio com SKU "${r.sku}" (a Referência do produto). Digite o número do anúncio (MLB...) ou o SKU usado no Mercado Livre.`,
          variant: 'destructive',
        })
      } else {
        setMlManual((prev) => {
          const novo = Object.assign({}, prev)
          delete novo[chave]
          return novo
        })
      }
      if (r.vinculo_gravado && ehAnuncio) {
        toast({
          title: 'Anúncio vinculado ao produto',
          description:
            'Das próximas vezes o "Puxar do Mercado Livre" já traz este anúncio, sem digitar o número.',
        })
      } else if (r.vinculo_aviso) {
        toast({
          title: 'Vínculo não gravado',
          description: r.vinculo_aviso,
          variant: 'destructive',
        })
      }
      if (lista.length === 0) {
        /* nada */
      } else if (lista.length === 1) {
        await usarAnuncioML(chave, lista[0])
      } else {
        setMlOpcoes((prev) => Object.assign({}, prev, { [chave]: lista }))
      }
    } catch (err) {
      toast({
        title: 'Erro ao consultar o Mercado Livre',
        description: mensagemErroMercadoLivre(err, 'Falha ao consultar o Mercado Livre.'),
        variant: 'destructive',
      })
    } finally {
      setMlBuscando('')
    }
  }

  const desvincularML = async (canal: CanalMargem, chave: string, a: AnuncioPrecoML) => {
    if (!produtoId || !canal.empresa_id) return
    try {
      await desvincularAnuncioMercadoLivre(canal.empresa_id, produtoId, a.anuncio_id)
      const tirar = (x: AnuncioPrecoML) =>
        x.anuncio_id === a.anuncio_id ? Object.assign({}, x, { vinculado: false }) : x
      setMlOpcoes((prev) =>
        prev[chave] ? Object.assign({}, prev, { [chave]: prev[chave].map(tirar) }) : prev,
      )
      setMlUltimo((prev) =>
        prev[chave] ? Object.assign({}, prev, { [chave]: tirar(prev[chave]) }) : prev,
      )
      toast({
        title: `Vínculo removido (${a.anuncio_id})`,
        description: 'O anúncio no Mercado Livre não foi alterado.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao remover o vínculo',
        description: err instanceof Error ? err.message : 'Falha ao remover o vínculo.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
          <Store className="h-4 w-4 text-indigo-600" />
          <span>Margem líquida por canal de venda</span>
        </div>
        <Link
          to="/configuracoes/canais-margem"
          className="text-[11px] text-blue-600 hover:underline"
        >
          Configurar canais
        </Link>
      </div>

      <p className="text-[11px] text-slate-500 flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Preço no canal = preço da loja do canal + acréscimo do canal (ou o preço próprio
          digitado). Informando o valor recebido (ex.: &quot;Você recebe&quot; do Mercado Livre), a
          comissão/taxas passa a ser preço − recebido. Impostos sempre sobre o preço da nota.{' '}
          {impostos.origem === 'perfil'
            ? impostos.tributaIcms
              ? `Perfil do produto: ICMS venda interna ${pct(impostos.aliquotaIcms)}, PIS/COFINS ${pct(impostos.aliquotaPisCofins)}.`
              : `Perfil do produto: sem ICMS na venda (ST, isento ou não tributado), ICMS 0 em todos os canais; PIS/COFINS ${pct(impostos.aliquotaPisCofins)}.`
            : 'Produto sem perfil tributário: usando ICMS 17% e PIS/COFINS 9,25%.'}
          {!produtoId && ' Salve o produto para gravar preço e valor recebido por canal.'}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {(['verde', 'amarela', 'vermelha'] as const).map((f) => (
          <span key={f} className={`px-1.5 py-0.5 rounded font-semibold ${CLASSE_FAIXA[f]}`}>
            {ROTULO_FAIXA[f]}
          </span>
        ))}
      </div>

      {carregando ? (
        <div className="py-4 text-center text-slate-400 text-xs">
          <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Carregando canais...
        </div>
      ) : erro ? (
        <div className="text-[11px] text-rose-600">{erro}</div>
      ) : canais.length === 0 ? (
        <div className="text-[11px] text-slate-500">
          Nenhum canal ativo. Cadastre em Configurações &gt; Canais de venda (margem).
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 pr-2">Canal</th>
                <th className="py-2 px-2 text-right">Preço no canal</th>
                <th className="py-2 px-2 text-right">Valor recebido</th>
                <th className="py-2 px-2 text-right">ICMS</th>
                <th className="py-2 px-2 text-right">PIS/COFINS</th>
                <th className="py-2 px-2 text-right">Comissão/taxas</th>
                <th className="py-2 px-2 text-right">Lucro</th>
                <th className="py-2 px-2 text-right">Margem</th>
                <th className="py-2 pl-2 text-right">Margem desejada → preço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(({ canal, chave, base, baseDaLoja, acrescimo, precoRegra, salvo, r }) => {
                const desejada = margensDesejadas[chave] ?? ''
                const sugerido =
                  desejada !== '' && !Number.isNaN(Number(desejada))
                    ? precoParaMargemCanal(Number(desejada), custo, canal, impostos)
                    : null
                const rc = rascunho[chave] || {}
                const loja = nomeEmpresa(canal.empresa_id)
                return (
                  <tr key={chave} className="align-top">
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-slate-800 flex items-center gap-1">
                        {canal.nome}
                        {salvando === chave && (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                        )}
                        {salvoOk === chave && <Check className="h-3 w-3 text-emerald-600" />}
                      </div>
                      {editavel && ehCanalML(canal) && (
                        <button
                          type="button"
                          onClick={() => void puxarDoML(canal, chave)}
                          disabled={mlBuscando === chave}
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline disabled:opacity-50"
                          title="Lê o preço e o valor recebido do anúncio cujo SKU é a Referência do produto"
                        >
                          {mlBuscando === chave ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Puxar do Mercado Livre
                        </button>
                      )}
                      {editavel && ehCanalML(canal) && mlManual[chave] === undefined && (
                        <button
                          type="button"
                          onClick={() =>
                            setMlManual((prev) => Object.assign({}, prev, { [chave]: '' }))
                          }
                          className="ml-2 text-[10px] text-slate-500 hover:underline"
                          title="Para anúncio sem SKU: digite o número do anúncio (MLB...)"
                        >
                          outro anúncio
                        </button>
                      )}
                      {mlManual[chave] !== undefined && (
                        <div className="mt-1 flex items-center gap-1">
                          <Input
                            value={mlManual[chave]}
                            onChange={(e) =>
                              setMlManual((prev) =>
                                Object.assign({}, prev, {
                                  [chave]: e.target.value,
                                }),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void puxarDoML(canal, chave, mlManual[chave])
                              }
                            }}
                            placeholder="Anúncio MLB... ou SKU"
                            className="h-6 w-40 text-[10px]"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={!mlManual[chave]?.trim() || mlBuscando === chave}
                            onClick={() => void puxarDoML(canal, chave, mlManual[chave])}
                          >
                            Buscar
                          </Button>
                        </div>
                      )}
                      {mlUltimo[chave] && (
                        <details className="mt-1 max-w-[260px] text-[10px] text-slate-500">
                          <summary className="cursor-pointer text-blue-600">
                            Detalhes da consulta ({mlUltimo[chave].anuncio_id})
                          </summary>
                          <div className="mt-1 space-y-0.5 break-all">
                            <div>{detalheML(mlUltimo[chave])}</div>
                            {mlUltimo[chave].vinculado && (
                              <div>
                                Anúncio vinculado a este produto.{' '}
                                <button
                                  type="button"
                                  className="text-slate-500 hover:text-rose-600 hover:underline"
                                  onClick={() => void desvincularML(canal, chave, mlUltimo[chave])}
                                >
                                  desvincular
                                </button>
                              </div>
                            )}
                            {Object.entries(mlUltimo[chave].diagnostico || {}).map(([k, v]) => (
                              <div key={k}>
                                <b>{k}:</b> {String(v)}
                              </div>
                            ))}
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() =>
                                void navigator.clipboard?.writeText(
                                  JSON.stringify(mlUltimo[chave], null, 1),
                                )
                              }
                            >
                              Copiar detalhes
                            </button>
                          </div>
                        </details>
                      )}
                      {(mlOpcoes[chave] || []).length > 0 && (
                        <div className="mt-1 space-y-1 rounded border border-blue-100 bg-blue-50 p-1.5">
                          <div className="text-[10px] text-slate-600">
                            {(mlOpcoes[chave] || []).length} anúncios deste produto. Escolha o que
                            vale para a margem:
                          </div>
                          {(mlOpcoes[chave] || []).map((a) => (
                            <div
                              key={a.anuncio_id + a.variacao_id}
                              className="flex items-start gap-1"
                            >
                              <button
                                type="button"
                                onClick={() => void usarAnuncioML(chave, a)}
                                className="flex-1 text-left text-[10px] text-blue-700 hover:underline"
                              >
                                {a.anuncio_id}
                                {a.sku_anuncio ? ` SKU ${a.sku_anuncio}` : ''}
                                {a.vinculado ? ' (vinculado)' : ''}
                                {a.variacao ? ` (${a.variacao})` : ''} ·{' '}
                                {TIPO_ANUNCIO_ML[a.tipo_anuncio] || a.tipo_anuncio} ·{' '}
                                {STATUS_ANUNCIO_ML[a.status_anuncio] || a.status_anuncio}:{' '}
                                {detalheML(a)}
                              </button>
                              {a.vinculado && (
                                <button
                                  type="button"
                                  onClick={() => void desvincularML(canal, chave, a)}
                                  className="text-[10px] text-slate-500 hover:text-rose-600 hover:underline"
                                  title="Remove só o vínculo no Trevvo; o anúncio não muda"
                                >
                                  desvincular
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {loja ? `${loja}: ` : ''}
                        {brl(base)}
                        {baseDaLoja ? ' (preço da loja)' : ' (preço geral)'}
                        {acrescimo ? ` + ${pct(acrescimo)} = ${brl(precoRegra)}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ICMS {pct(r.aliquotaIcmsUsada)}
                        {canal.modo_icms === 'perfil' ? ' (perfil)' : ''}
                        {!r.recebidoInformado && Number(canal.comissao_percentual) > 0
                          ? ` · comissão ${pct(Number(canal.comissao_percentual))}`
                          : ''}
                        {!r.recebidoInformado && Number(canal.taxa_fixa) > 0
                          ? ` · taxa ${brl(Number(canal.taxa_fixa))}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={rc.preco ?? (salvo.preco !== null ? String(salvo.preco) : '')}
                        placeholder={brl(precoRegra)}
                        disabled={!editavel}
                        onChange={(e) => editar(chave, 'preco', e.target.value)}
                        onBlur={() => aoSair(chave, salvo)}
                        title="Vazio = preço pela regra do canal"
                        className="h-7 w-24 text-[11px] text-right ml-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={
                          rc.recebido ?? (salvo.recebido !== null ? String(salvo.recebido) : '')
                        }
                        placeholder={brl(r.recebido)}
                        disabled={!editavel}
                        onChange={(e) => editar(chave, 'recebido', e.target.value)}
                        onBlur={() => aoSair(chave, salvo)}
                        title="Vazio = estimado pela comissão e despesas do canal"
                        className="h-7 w-24 text-[11px] text-right ml-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">{brl(r.icms)}</td>
                    <td className="py-2 px-2 text-right">{brl(r.pisCofins)}</td>
                    <td className="py-2 px-2 text-right">{brl(r.comissao + r.despesas)}</td>
                    <td className="py-2 px-2 text-right font-semibold">{brl(r.lucro)}</td>
                    <td className="py-2 px-2 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${classeMargem(r.margemSobreRecebido)}`}
                        title={`Margem líquida: lucro dividido pelo valor recebido do canal. ${ROTULO_FAIXA[faixaMargem(r.margemSobreRecebido)]}`}
                      >
                        {pct(r.margemSobreRecebido)}
                      </span>
                      <div
                        className="text-[10px] text-slate-400 mt-1"
                        title="Lucro dividido pelo preço de venda no canal"
                      >
                        {pct(r.margem)} s/ preço
                      </div>
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={desejada}
                          onChange={(e) =>
                            setMargensDesejadas((prev) =>
                              Object.assign({}, prev, {
                                [chave]: e.target.value,
                              }),
                            )
                          }
                          placeholder="%"
                          className="h-7 w-16 text-[11px] text-right"
                        />
                        <span className="w-20 text-right font-semibold text-slate-700">
                          {desejada === '' ? '' : sugerido === null ? 'inviável' : brl(sugerido)}
                        </span>
                        {editavel && sugerido !== null && desejada !== '' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() =>
                              void gravar(chave, {
                                preco: sugerido,
                                recebido: salvo.recebido,
                              })
                            }
                            title="Gravar como preço próprio do produto neste canal"
                          >
                            Usar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MargemPorCanal
