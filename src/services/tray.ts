import pb from '@/lib/pocketbase/client'

/**
 * Integração com a Tray — Etapa 11 / Parte 11.1 (conexão da loja).
 * Rotas do backend em pocketbase/hooks/tray_conexao.js. Os tokens nunca chegam ao navegador.
 */

export interface StatusTray {
  sucesso: boolean
  segredos_configurados: boolean
  pode_gerenciar: boolean
  status: 'Conectada' | 'Reconectar' | 'Desconectada'
  loja_host: string
  loja_nome: string
  store_id: string
  token_expira_em: string
  refresh_expira_em: string
  ultima_renovacao_em: string
  conectada_em: string
  ultimo_erro: string
}

export interface RespostaSimplesTray {
  sucesso: boolean
  mensagem?: string
  loja_nome?: string
  loja_host?: string
}

export async function obterStatusTray(empresaId: string): Promise<StatusTray> {
  return await pb.send<StatusTray>(
    `/backend/v1/tray/conexao/status?empresa_id=${encodeURIComponent(empresaId)}`,
    { method: 'GET' },
  )
}

export async function iniciarConexaoTray(
  empresaId: string,
  lojaUrl: string,
  retornoUrl: string,
): Promise<{ sucesso: boolean; url_autorizacao: string; loja_host: string }> {
  return await pb.send('/backend/v1/tray/conexao/iniciar', {
    method: 'POST',
    body: { empresa_id: empresaId, loja_url: lojaUrl, retorno_url: retornoUrl },
  })
}

export async function testarConexaoTray(empresaId: string): Promise<RespostaSimplesTray> {
  return await pb.send<RespostaSimplesTray>('/backend/v1/tray/conexao/testar', {
    method: 'POST',
    body: { empresa_id: empresaId },
  })
}

export async function desconectarTray(empresaId: string): Promise<RespostaSimplesTray> {
  return await pb.send<RespostaSimplesTray>('/backend/v1/tray/conexao/desconectar', {
    method: 'POST',
    body: { empresa_id: empresaId },
  })
}

export function mensagemErroTray(err: unknown, padrao: string): string {
  const e = err as { response?: { mensagem?: string; message?: string }; message?: string }
  return e?.response?.mensagem || e?.response?.message || e?.message || padrao
}
