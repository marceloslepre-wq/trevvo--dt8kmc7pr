import pb from '@/lib/pocketbase/client'

/**
 * Saúde dos anúncios: anúncios com problema encontrados pela verificação diária
 * (hook pocketbase/hooks/anuncios_saude.js). Somente leitura; o backend grava.
 */

export type SituacaoAnuncio = 'Política' | 'Pausado sem motivo' | 'Estoque divergente'

export interface AnuncioComProblema {
  id: string
  empresa_id: string
  marketplace: string
  anuncio_id: string
  titulo: string
  sku: string
  produto_id: string
  produto_codigo: string
  situacao: SituacaoAnuncio
  status_canal: string
  sub_status: string
  motivo: string
  acao_sugerida: string
  estoque_canal: number
  estoque_trevvo: number
  vendidos: number
  link: string
  primeira_vez_em: string
  verificado_em: string
}

export interface ExecucaoSaude {
  id: string
  status: 'Pendente' | 'Executando' | 'Concluída' | 'Erro'
  origem: string
  dia: string
  iniciada_em: string
  concluida_em: string
  total_lidos: number
  total_problemas: number
  resumo: Record<string, number> | null
  mensagem: string
  created: string
}

export async function listarAnunciosComProblema(
  empresaId: string,
  marketplace = 'mercadolivre',
): Promise<AnuncioComProblema[]> {
  return await pb.collection('anuncios_saude').getFullList<AnuncioComProblema>({
    filter: pb.filter('empresa_id = {:e} && marketplace = {:m}', { e: empresaId, m: marketplace }),
    sort: '-vendidos',
  })
}

export async function ultimaExecucaoSaude(
  empresaId: string,
  marketplace = 'mercadolivre',
): Promise<ExecucaoSaude | null> {
  const r = await pb.collection('anuncios_saude_execucoes').getList<ExecucaoSaude>(1, 1, {
    filter: pb.filter('empresa_id = {:e} && marketplace = {:m}', { e: empresaId, m: marketplace }),
    sort: '-created',
  })
  return r.items[0] || null
}

export async function pedirVerificacaoSaude(
  empresaId: string,
  marketplace = 'mercadolivre',
): Promise<{ sucesso: boolean; mensagem: string }> {
  return await pb.send(
    `/backend/v1/anuncios-saude/verificar?empresa_id=${encodeURIComponent(empresaId)}&marketplace=${encodeURIComponent(marketplace)}`,
    { method: 'POST' },
  )
}
