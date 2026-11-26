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
  /** true quando a loja conectada é uma loja de testes da Tray (libera o roteiro de homologação). */
  loja_de_teste?: boolean
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

/** Parte 11.2 — conferência somente leitura dos produtos da loja (pocketbase/hooks/tray_produtos.js). */
export interface LinhaProdutoTray {
  produto_id: string
  nome: string
  ativo_na_tray: boolean
  referencia_produto: string
  variacao_id: string
  variacao: string
  codigo_tray: string
  referencia: string
  ean?: string
  /** Como o produto do Trevvo foi achado: 'referencia', 'ean' ou '' (não achou) */
  metodo?: string
  estoque: number
  preco: number
  situacao: string
  produto_codigo: string
  produto_descricao: string
}

export interface PaginaProdutosTray {
  sucesso: boolean
  pagina: number
  limite: number
  total_produtos: number
  produtos_nesta_pagina: number
  proxima_pagina: number | null
  linhas: LinhaProdutoTray[]
  falhas: { produto_id: string; motivo: string }[]
  campos_produto: string[]
  campos_variacao: string[]
}

export async function conferirProdutosTray(
  empresaId: string,
  pagina: number,
  limite = 10,
): Promise<PaginaProdutosTray> {
  return await pb.send<PaginaProdutosTray>(
    `/backend/v1/tray/produtos/conferencia?empresa_id=${encodeURIComponent(empresaId)}&pagina=${pagina}&limite=${limite}`,
    { method: 'GET' },
  )
}

/** Homologação do aplicativo na Tray (pocketbase/hooks/tray_homologacao.js). */
export interface PassoHomologacaoTray {
  ordem: number
  etapa: string
  metodo: string
  rota: string
  status_http: number
  observacao: string
}

export interface ResultadoHomologacaoTray {
  sucesso: boolean
  mensagem?: string
  execucao_id: string
  loja_host?: string
  ip_publico_saida?: string
  url_callback?: string
  multicd_ativo?: boolean
  centros_distribuicao?: number
  passos: PassoHomologacaoTray[]
}

export interface EvidenciaTray {
  ordem: number
  etapa: string
  metodo: string
  rota: string
  url_exemplo: string
  request_json: string
  status_http: number
  response_json: string
  duracao_ms: number
  observacao: string
  criado_em: string
}

export async function executarHomologacaoTray(
  empresaId: string,
  opcoes: {
    produtoId?: string
    produtoVariacaoId?: string
    variacaoId?: string
    gravarEstoque: boolean
  },
): Promise<ResultadoHomologacaoTray> {
  return await pb.send<ResultadoHomologacaoTray>('/backend/v1/tray/homologacao/executar', {
    method: 'POST',
    body: {
      empresa_id: empresaId,
      produto_id: opcoes.produtoId || '',
      produto_variacao_id: opcoes.produtoVariacaoId || '',
      variacao_id: opcoes.variacaoId || '',
      gravar_estoque: opcoes.gravarEstoque,
    },
  })
}

export async function obterEvidenciasTray(empresaId: string): Promise<{
  sucesso: boolean
  execucao_id: string
  evidencias: EvidenciaTray[]
}> {
  return await pb.send(
    `/backend/v1/tray/homologacao/evidencias?empresa_id=${encodeURIComponent(empresaId)}`,
    { method: 'GET' },
  )
}

/** Importação de descrição e imagens da Tray para os produtos do Trevvo (pocketbase/hooks/tray_midia.js). */
export interface LinhaMidiaTray {
  produto_tray: string
  nome: string
  variacao: string
  referencia: string
  produtos_trevvo: string
  descricao: string
  imagens: number
  situacao: string
  observacao: string
}

export interface PaginaMidiaTray {
  sucesso: boolean
  simulacao: boolean
  pagina: number
  limite: number
  total_produtos: number
  produtos_nesta_pagina: number
  proxima_pagina: number | null
  linhas: LinhaMidiaTray[]
}

export async function importarMidiaTray(
  empresaId: string,
  pagina: number,
  opcoes: { limite?: number; sobrescrever?: boolean; simular?: boolean } = {},
): Promise<PaginaMidiaTray> {
  return await pb.send<PaginaMidiaTray>('/backend/v1/tray/produtos/importar-midia', {
    method: 'POST',
    body: {
      empresa_id: empresaId,
      pagina,
      limite: opcoes.limite ?? 5,
      sobrescrever: !!opcoes.sobrescrever,
      simular: !!opcoes.simular,
    },
  })
}
