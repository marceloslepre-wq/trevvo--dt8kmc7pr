import pb from '@/lib/pocketbase/client'

export interface PlanoPublico {
  id: string
  nome: string
  etiqueta?: string
  descricao?: string
  valor_mensal: number
  limite_empresas: number
  limite_usuarios: number
  permite_nfe: boolean
  permite_nfce: boolean
  permite_sped: boolean
  exclusivo_master: boolean
  ativo: boolean
}

export interface CadastroAssinantePayload {
  plano_id: string
  responsavel: {
    nome: string
    email: string
    telefone?: string
    whatsapp?: string
    senha: string
  }
  empresa: {
    razao_social: string
    nome_fantasia?: string
    cnpj: string
    inscricao_estadual?: string
    crt: number
    cep?: string
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipio?: string
    codigo_municipio_ibge?: string
    uf?: string
  }
  termos_aceitos: boolean
}

export interface CadastroAssinanteResponse {
  sucesso: boolean
  mensagem: string
  assinante_id: string
  empresa_id: string
  usuario_id: string
  numero_licenca: string
  error?: string
}

/**
 * Lista os planos comerciais disponíveis para cadastro público
 * Consome GET /backend/v1/assinatura/planos (ativo = true, exclusivo_master = false)
 */
export async function listarPlanosPublicos(): Promise<PlanoPublico[]> {
  try {
    const res = await pb.send<{ sucesso: boolean; planos: PlanoPublico[] }>(
      '/backend/v1/assinatura/planos',
      { method: 'GET' },
    )
    if (res?.planos && Array.isArray(res.planos)) {
      return res.planos
    }
  } catch (err) {
    console.warn('Falha na rota /backend/v1/assinatura/planos, tentando fallback:', err)
  }

  // Fallback seguro usando SDK caso a rota customizada falhe
  try {
    const items = await pb.collection('planos_catalogo').getFullList<PlanoPublico>({
      filter: 'ativo = true && exclusivo_master = false',
      sort: 'valor_mensal',
      requestKey: null,
    })
    return items
  } catch (errFallback) {
    console.error('Falha ao listar planos públicos:', errFallback)
    return []
  }
}

/**
 * Envia o cadastro público de um novo assinante do SaaS
 * Consome POST /backend/v1/assinatura/cadastrar
 */
export async function cadastrarNovoAssinante(
  payload: CadastroAssinantePayload,
): Promise<CadastroAssinanteResponse> {
  const res = await pb.send<CadastroAssinanteResponse>('/backend/v1/assinatura/cadastrar', {
    method: 'POST',
    body: payload,
  })
  return res
}
