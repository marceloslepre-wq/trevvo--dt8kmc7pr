import pb from '@/lib/pocketbase/client'

/**
 * Integração com a Shopee (Open Platform v2) — conexão da loja.
 * Rotas do backend em pocketbase/hooks/shopee_conexao.js.
 * Os tokens nunca chegam ao navegador: o backend só devolve o estado da conexão.
 */

export type StatusConexaoShopee = 'Conectada' | 'Reconectar' | 'Desconectada'

export interface StatusShopee {
  sucesso: boolean
  segredos_configurados: boolean
  url_callback: string
  pode_gerenciar: boolean
  status: StatusConexaoShopee
  shop_nome: string
  shop_id: string
  regiao: string
  ambiente: string
  refresh_expira_em: string
  token_expira_em: string
  ultima_renovacao_em: string
  conectada_em: string
  ultimo_erro: string
}

export interface RespostaSimplesShopee {
  sucesso: boolean
  mensagem?: string
  shop_nome?: string
  status_loja?: string
}

export async function obterStatusShopee(empresaId: string): Promise<StatusShopee> {
  return await pb.send<StatusShopee>(
    `/backend/v1/shopee/conexao/status?empresa_id=${encodeURIComponent(empresaId)}`,
    { method: 'GET' },
  )
}

export async function iniciarConexaoShopee(
  empresaId: string,
  retornoUrl: string,
): Promise<{
  sucesso: boolean
  url_autorizacao: string
  url_callback: string
}> {
  return await pb.send('/backend/v1/shopee/conexao/iniciar', {
    method: 'POST',
    body: { empresa_id: empresaId, retorno_url: retornoUrl },
  })
}

export async function testarConexaoShopee(
  empresaId: string,
): Promise<RespostaSimplesShopee> {
  return await pb.send<RespostaSimplesShopee>('/backend/v1/shopee/conexao/testar', {
    method: 'POST',
    body: { empresa_id: empresaId },
  })
}

export async function desconectarShopee(
  empresaId: string,
): Promise<RespostaSimplesShopee> {
  return await pb.send<RespostaSimplesShopee>(
    '/backend/v1/shopee/conexao/desconectar',
    {
      method: 'POST',
      body: { empresa_id: empresaId },
    },
  )
}

/** Extrai a mensagem em português devolvida pelo backend em caso de erro. */
export function mensagemErroShopee(err: unknown, padrao: string): string {
  const e = err as {
    response?: { mensagem?: string; message?: string }
    message?: string
  }
  return e?.response?.mensagem || e?.response?.message || e?.message || padrao
}

