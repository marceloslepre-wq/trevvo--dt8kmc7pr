import pb from '@/lib/pocketbase/client'

/**
 * Integração com o Mercado Livre — Etapa 10 / Parte 10.1 (conexão da conta).
 * Rotas do backend em pocketbase/hooks/mercadolivre_conexao.js.
 * Os tokens nunca chegam ao navegador: o backend só devolve o estado da conexão.
 */

export type StatusConexaoMercadoLivre = 'Conectada' | 'Reconectar' | 'Desconectada'

export interface StatusMercadoLivre {
  sucesso: boolean
  segredos_configurados: boolean
  url_callback: string
  pode_gerenciar: boolean
  status: StatusConexaoMercadoLivre
  ml_nickname: string
  ml_user_id: string
  token_expira_em: string
  ultima_renovacao_em: string
  conectada_em: string
  ultimo_erro: string
}

export interface RespostaSimplesMercadoLivre {
  sucesso: boolean
  mensagem?: string
  ml_nickname?: string
  ml_user_id?: string
}

export async function obterStatusMercadoLivre(empresaId: string): Promise<StatusMercadoLivre> {
  return await pb.send<StatusMercadoLivre>(
    `/backend/v1/mercadolivre/conexao/status?empresa_id=${encodeURIComponent(empresaId)}`,
    { method: 'GET' },
  )
}

export async function iniciarConexaoMercadoLivre(
  empresaId: string,
  retornoUrl: string,
): Promise<{ sucesso: boolean; url_autorizacao: string; url_callback: string }> {
  return await pb.send('/backend/v1/mercadolivre/conexao/iniciar', {
    method: 'POST',
    body: { empresa_id: empresaId, retorno_url: retornoUrl },
  })
}

export async function testarConexaoMercadoLivre(
  empresaId: string,
): Promise<RespostaSimplesMercadoLivre> {
  return await pb.send<RespostaSimplesMercadoLivre>('/backend/v1/mercadolivre/conexao/testar', {
    method: 'POST',
    body: { empresa_id: empresaId },
  })
}

export async function desconectarMercadoLivre(
  empresaId: string,
): Promise<RespostaSimplesMercadoLivre> {
  return await pb.send<RespostaSimplesMercadoLivre>(
    '/backend/v1/mercadolivre/conexao/desconectar',
    {
      method: 'POST',
      body: { empresa_id: empresaId },
    },
  )
}

/** Extrai a mensagem em português devolvida pelo backend em caso de erro. */
export function mensagemErroMercadoLivre(err: unknown, padrao: string): string {
  const e = err as { response?: { mensagem?: string; message?: string }; message?: string }
  return e?.response?.mensagem || e?.response?.message || e?.message || padrao
}

// ---- Parte 10.5a: auditoria somente leitura dos anúncios ----

export interface LinhaAuditoriaAnuncio {
  anuncio_id: string
  titulo: string
  status_anuncio: string
  link: string
  user_product_id: string
  familia: string
  tem_variacoes: boolean
  variacao_id: string
  variacao: string
  sku: string
  estoque_ml: number
  preco_ml: number
  situacao: string
  produto_codigo: string
  produto_descricao: string
}

export interface PaginaAuditoriaAnuncios {
  sucesso: boolean
  total_anuncios: number
  offset: number
  anuncios_nesta_pagina: number
  proximo_offset: number | null
  linhas: LinhaAuditoriaAnuncio[]
  falhas: { anuncio_id: string; erro: string }[]
}

export async function auditarAnunciosMercadoLivre(
  empresaId: string,
  offset: number,
  limite = 10,
): Promise<PaginaAuditoriaAnuncios> {
  return await pb.send<PaginaAuditoriaAnuncios>(
    `/backend/v1/mercadolivre/anuncios/auditoria?empresa_id=${encodeURIComponent(empresaId)}&offset=${offset}&limite=${limite}`,
    { method: 'GET' },
  )
}
