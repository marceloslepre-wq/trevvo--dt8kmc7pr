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
