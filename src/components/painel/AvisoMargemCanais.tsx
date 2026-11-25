import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useAssinanteId } from '@/hooks/useAssinanteId'
import { carregarBaseMargens, resumirPorCanal, ResumoCanal } from '@/services/margemCanaisRelatorio'

/**
 * Aviso do Painel: canais com produtos de margem negativa (vermelho) ou entre 0 e 20%
 * (amarelo), contando só produtos com preço/valor recebido gravado no canal.
 * Cada canal leva ao relatório Margem por canal já filtrado.
 */
export const AvisoMargemCanais: React.FC = () => {
  const assinanteId = useAssinanteId()
  const [resumo, setResumo] = useState<ResumoCanal[]>([])

  useEffect(() => {
    let ativo = true
    carregarBaseMargens({ assinanteId })
      .then((base) => {
        if (ativo) setResumo(resumirPorCanal(base).filter((r) => r.vermelha > 0 || r.amarela > 0))
      })
      .catch(() => {
        /* sem acesso ou sem canais: não mostra o aviso */
      })
    return () => {
      ativo = false
    }
  }, [assinanteId])

  if (resumo.length === 0) return null
  const totalVermelha = resumo.reduce((s, r) => s + r.vermelha, 0)

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        totalVermelha > 0 ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 text-sm font-semibold ${
            totalVermelha > 0 ? 'text-rose-800' : 'text-amber-800'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Margem nos canais de venda
        </div>
        <Link
          to="/relatorios/margem-canais"
          className="text-[11px] text-blue-600 hover:underline flex items-center"
        >
          Ver relatório <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {resumo.map((r) => (
          <div
            key={r.canal.id}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold text-slate-700">{r.canal.nome}:</span>
            {r.vermelha > 0 && (
              <Link
                to={`/relatorios/margem-canais?canal=${r.canal.id}&faixa=vermelha`}
                className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold hover:underline"
                title="Margem negativa: intervenção urgente"
              >
                {r.vermelha} negativa{r.vermelha === 1 ? '' : 's'}
              </Link>
            )}
            {r.amarela > 0 && (
              <Link
                to={`/relatorios/margem-canais?canal=${r.canal.id}&faixa=amarela`}
                className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold hover:underline"
                title="Margem de 0 a 20%: requer atenção"
              >
                {r.amarela} de 0 a 20%
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AvisoMargemCanais
