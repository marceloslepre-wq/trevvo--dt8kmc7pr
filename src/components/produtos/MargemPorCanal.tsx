import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Loader2, Info, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  CanalMargem,
  ImpostosVendaPerfil,
  IMPOSTOS_PADRAO,
  calcularMargemCanal,
  listarCanaisMargem,
  obterImpostosVendaDoPerfil,
  precoParaMargemCanal,
} from '@/services/canaisMargem'
import { listarPrecosCanalDoProduto, salvarPrecoCanal } from '@/services/precosEmpresa'

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

function corMargem(m: number) {
  if (m < 0) return 'text-rose-700 bg-rose-50'
  if (m < 10) return 'text-amber-700 bg-amber-50'
  return 'text-emerald-700 bg-emerald-50'
}

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
            ? `Perfil do produto: ICMS venda interna ${pct(impostos.aliquotaIcms)}, PIS/COFINS ${pct(impostos.aliquotaPisCofins)}.`
            : 'Produto sem perfil tributário: usando ICMS 17% e PIS/COFINS 9,25%.'}
          {!produtoId && ' Salve o produto para gravar preço e valor recebido por canal.'}
        </span>
      </p>

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
                      <span className={`px-1.5 py-0.5 rounded font-bold ${corMargem(r.margem)}`}>
                        {pct(r.margem)}
                      </span>
                      <div
                        className="text-[10px] text-slate-400 mt-1"
                        title="Lucro dividido pelo valor recebido"
                      >
                        {pct(r.margemSobreRecebido)} s/ recebido
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
                              Object.assign({}, prev, { [chave]: e.target.value }),
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
                              void gravar(chave, { preco: sugerido, recebido: salvo.recebido })
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
