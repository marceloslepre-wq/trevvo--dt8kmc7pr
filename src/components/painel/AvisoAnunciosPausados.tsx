import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PauseCircle, ChevronRight } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'

/**
 * Aviso do Painel: anúncios fora do ar ou pausados nos canais de venda, lidos da Saúde dos
 * anúncios (tabela anuncios_saude, verificação diária às 6h). Cada número abre a tela do
 * canal já na empresa certa e com o filtro da situação.
 */

const NOME_MARKETPLACE: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  amazon: 'Amazon',
}
const ROTA_MARKETPLACE: Record<string, string> = {
  mercadolivre: '/configuracoes/mercado-livre',
  shopee: '/configuracoes/shopee',
}
const SITUACOES: { chave: string; rotulo: string; classe: string; dica: string }[] = [
  {
    chave: 'Política',
    rotulo: 'fora do ar por regra',
    classe: 'bg-rose-100 text-rose-800',
    dica: 'Anúncios inativos ou finalizados por política do canal',
  },
  {
    chave: 'Pausado sem motivo',
    rotulo: 'pausados com estoque',
    classe: 'bg-amber-100 text-amber-800',
    dica: 'Pausados, com estoque no canal e sem motivo informado',
  },
  {
    chave: 'Estoque divergente',
    rotulo: 'sem estoque no canal',
    classe: 'bg-slate-100 text-slate-700',
    dica: 'Sem estoque no canal, mas com saldo no Trevvo',
  },
]

interface Grupo {
  empresaId: string
  marketplace: string
  contagem: Record<string, number>
}

export const AvisoAnunciosPausados: React.FC = () => {
  const { empresas, empresaAtiva, selecionarEmpresa } = useEmpresaAtiva()
  const navigate = useNavigate()
  const [grupos, setGrupos] = useState<Grupo[]>([])

  useEffect(() => {
    let ativo = true
    pb.collection('anuncios_saude')
      .getFullList<{ empresa_id: string; marketplace: string; situacao: string }>({
        fields: 'empresa_id,marketplace,situacao',
        batch: 1000,
        requestKey: null,
      })
      .then((lista) => {
        if (!ativo) return
        const mapa = new Map<string, Grupo>()
        for (const l of lista) {
          const chave = l.empresa_id + '|' + l.marketplace
          let g = mapa.get(chave)
          if (!g) {
            g = { empresaId: l.empresa_id, marketplace: l.marketplace, contagem: {} }
            mapa.set(chave, g)
          }
          g.contagem[l.situacao] = (g.contagem[l.situacao] || 0) + 1
        }
        setGrupos(Array.from(mapa.values()))
      })
      .catch(() => {
        /* sem acesso ou tabela ausente: não mostra o aviso */
      })
    return () => {
      ativo = false
    }
  }, [])

  if (grupos.length === 0) return null

  const nomeEmpresa = (id: string) => {
    const e = empresas.find((x) => x.id === id)
    return e ? e.nome_fantasia || e.razao_social || '' : ''
  }

  const abrir = (g: Grupo, situacao: string) => {
    if (empresaAtiva?.id !== g.empresaId) selecionarEmpresa(g.empresaId)
    const rota = ROTA_MARKETPLACE[g.marketplace] || '/configuracoes/mercado-livre'
    navigate(`${rota}?saude=${encodeURIComponent(situacao)}`)
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <PauseCircle className="h-4 w-4" />
        Anúncios pausados ou fora do ar nos canais de venda
      </div>
      <div className="flex flex-wrap gap-2">
        {grupos.map((g) => (
          <div
            key={g.empresaId + g.marketplace}
            className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold text-slate-700">
              {NOME_MARKETPLACE[g.marketplace] || g.marketplace}
              {empresas.length > 1 && nomeEmpresa(g.empresaId)
                ? ` (${nomeEmpresa(g.empresaId)})`
                : ''}
              :
            </span>
            {SITUACOES.filter((s) => (g.contagem[s.chave] || 0) > 0).map((s) => (
              <button
                key={s.chave}
                type="button"
                onClick={() => abrir(g, s.chave)}
                className={`px-1.5 py-0.5 rounded font-semibold hover:underline ${s.classe}`}
                title={s.dica}
              >
                {g.contagem[s.chave]} {s.rotulo}
              </button>
            ))}
            <button
              type="button"
              onClick={() => abrir(g, 'Todas')}
              className="text-[11px] text-blue-600 hover:underline flex items-center"
            >
              ver <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AvisoAnunciosPausados
