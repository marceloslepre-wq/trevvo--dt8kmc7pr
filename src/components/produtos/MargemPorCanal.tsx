import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Loader2, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import {
  CanalMargem,
  ImpostosVendaPerfil,
  IMPOSTOS_PADRAO,
  calcularMargemCanal,
  listarCanaisMargem,
  obterImpostosVendaDoPerfil,
  precoParaMargemCanal,
} from '@/services/canaisMargem'

interface MargemPorCanalProps {
  custo: number
  preco: number
  perfilTributarioId?: string | null
  /** Usa o preço sugerido como preço de venda do produto. Ausente = só leitura. */
  onAplicarPreco?: (preco: number) => void
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const pct = (v: number) => `${(v || 0).toFixed(2).replace('.', ',')}%`

function corMargem(m: number) {
  if (m < 0) return 'text-rose-700 bg-rose-50'
  if (m < 10) return 'text-amber-700 bg-amber-50'
  return 'text-emerald-700 bg-emerald-50'
}

/**
 * Tabela "Margem por canal": para o preço atual do produto, mostra em cada canal de venda
 * o ICMS, PIS/COFINS, comissão/taxas, lucro e margem líquida (mesmo critério da
 * composição de preço do Uniplus). Canais em Configurações > Canais de venda (margem).
 */
export const MargemPorCanal: React.FC<MargemPorCanalProps> = ({
  custo,
  preco,
  perfilTributarioId,
  onAplicarPreco,
}) => {
  const assinanteId = useAssinanteId()
  const [canais, setCanais] = useState<CanalMargem[]>([])
  const [impostos, setImpostos] = useState<ImpostosVendaPerfil>(IMPOSTOS_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [margensDesejadas, setMargensDesejadas] = useState<Record<string, string>>({})

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
    obterImpostosVendaDoPerfil(perfilTributarioId).then((imp) => {
      if (ativo) setImpostos(imp)
    })
    return () => {
      ativo = false
    }
  }, [perfilTributarioId])

  const linhas = useMemo(
    () =>
      canais.map((c) => ({
        canal: c,
        r: calcularMargemCanal(preco, custo, c, impostos),
      })),
    [canais, preco, custo, impostos],
  )

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
          Lucro = preço − custo − ICMS − PIS/COFINS (sobre o preço sem ICMS) − comissão/taxas −
          despesas.{' '}
          {impostos.origem === 'perfil'
            ? `Perfil do produto: ICMS venda interna ${pct(impostos.aliquotaIcms)}, PIS/COFINS ${pct(impostos.aliquotaPisCofins)}.`
            : 'Produto sem perfil tributário: usando ICMS 17% e PIS/COFINS 9,25%.'}
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
                <th className="py-2 px-2 text-right">ICMS</th>
                <th className="py-2 px-2 text-right">PIS/COFINS</th>
                <th className="py-2 px-2 text-right">Comissão/taxas</th>
                <th className="py-2 px-2 text-right">Lucro</th>
                <th className="py-2 px-2 text-right">Margem líquida</th>
                <th className="py-2 pl-2 text-right">Margem desejada → preço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(({ canal, r }) => {
                const chave = canal.id || canal.nome
                const desejada = margensDesejadas[chave] ?? ''
                const sugerido =
                  desejada !== '' && !Number.isNaN(Number(desejada))
                    ? precoParaMargemCanal(Number(desejada), custo, canal, impostos)
                    : null
                return (
                  <tr key={chave}>
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-slate-800">{canal.nome}</div>
                      <div className="text-[10px] text-slate-400">
                        ICMS {pct(r.aliquotaIcmsUsada)}
                        {canal.modo_icms === 'perfil' ? ' (perfil)' : ''}
                        {Number(canal.comissao_percentual) > 0
                          ? ` · comissão ${pct(Number(canal.comissao_percentual))}`
                          : ''}
                        {Number(canal.taxa_fixa) > 0
                          ? ` · taxa ${brl(Number(canal.taxa_fixa))}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">{brl(r.icms)}</td>
                    <td className="py-2 px-2 text-right">{brl(r.pisCofins)}</td>
                    <td className="py-2 px-2 text-right">{brl(r.comissao + r.despesas)}</td>
                    <td className="py-2 px-2 text-right font-semibold">{brl(r.lucro)}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${corMargem(r.margem)}`}>
                        {pct(r.margem)}
                      </span>
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={desejada}
                          onChange={(e) =>
                            setMargensDesejadas((prev) => ({ ...prev, [chave]: e.target.value }))
                          }
                          placeholder="%"
                          className="h-7 w-16 text-[11px] text-right"
                        />
                        <span className="w-20 text-right font-semibold text-slate-700">
                          {desejada === '' ? '' : sugerido === null ? 'inviável' : brl(sugerido)}
                        </span>
                        {onAplicarPreco && sugerido !== null && desejada !== '' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => onAplicarPreco(sugerido)}
                            title="Usar como preço de venda do produto"
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
