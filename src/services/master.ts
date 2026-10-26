import pb from '@/lib/pocketbase/client'

export interface MasterResumo {
  total_assinantes: number
  licencas_ativas: number
  licencas_expiradas: number
  total_planos: number
  mrr_total_ativo: number
  clientes_trial: number
  nota_cobranca: string
  dias_trial_padrao: number
}

export interface MasterPlano {
  id: string
  nome: string
  etiqueta: string
  descricao: string
  valor_mensal: number
  limite_empresas: number
  limite_usuarios: number
  permite_nfe: boolean
  permite_nfce: boolean
  permite_sped: boolean
  exclusivo_master: boolean
  ativo: boolean
  total_assinantes?: number
  created?: string
  updated?: string
}

export interface MasterConfig {
  id?: string
  dias_trial: number
}

export interface MasterPlanoFormData {
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

export interface MasterLicencaItem {
  id: string
  numero_licenca: string
  nome: string
  documento: string
  cnpj_matriz: string
  email_contato: string
  telefone: string
  whatsapp_contato: string
  status: 'Trial' | 'Ativa' | 'Pausada' | 'Expirada' | 'Cancelada'
  origem: boolean
  data_inicio: string
  data_expiracao: string
  vencida: boolean
  limites_personalizados: boolean
  limite_empresas: number
  limite_usuarios: number
  empresas_cadastradas: number
  usuarios_cadastrados: number
  observacoes: string
  plano_id: string
  plano_nome: string
  plano_etiqueta: string
  plano_exclusivo_master: boolean
  valor_mensal: number
  isento: boolean
  total_renovacoes: number
  created?: string
  updated?: string
}

export interface MasterLicencaEvento {
  id: string
  tipo:
    | 'Criação'
    | 'Trial'
    | 'Renovação +30d'
    | 'Reativação'
    | 'Mudança de plano'
    | 'Pausa'
    | 'Expiração'
    | 'Edição'
  numero_licenca: string
  plano_id?: string
  plano_nome?: string
  validade_ate?: string
  descricao: string
  criado_por?: string
  criado_por_nome?: string
  created: string
}

export interface MasterHistoricoResponse {
  sucesso: boolean
  assinante: {
    id: string
    nome: string
    numero_licenca: string
    origem: boolean
  }
  historico: MasterLicencaEvento[]
}

/**
 * Obtém resumo operacional do Painel Master
 */
export async function obterMasterResumo(): Promise<MasterResumo> {
  const res = await pb.send<{ sucesso: boolean; resumo: MasterResumo }>(
    '/backend/v1/master/resumo',
    {
      method: 'GET',
    },
  )
  return res.resumo
}

/**
 * Lista todos os planos do catálogo (visão administrativa master)
 */
export async function listarMasterPlanos(): Promise<MasterPlano[]> {
  const res = await pb.send<{ sucesso: boolean; planos: MasterPlano[] }>(
    '/backend/v1/master/planos',
    {
      method: 'GET',
    },
  )
  return res.planos || []
}

/**
 * Cria um novo plano no catálogo
 */
export async function criarMasterPlano(dados: MasterPlanoFormData): Promise<MasterPlano> {
  const res = await pb.send<{
    sucesso: boolean
    message: string
    plano: MasterPlano
  }>('/backend/v1/master/planos', {
    method: 'POST',
    body: dados,
  })
  return res.plano
}

/**
 * Atualiza um plano no catálogo
 */
export async function atualizarMasterPlano(
  id: string,
  dados: Partial<MasterPlanoFormData>,
): Promise<MasterPlano> {
  const res = await pb.send<{
    sucesso: boolean
    message: string
    plano: MasterPlano
  }>(`/backend/v1/master/planos/${id}`, {
    method: 'PUT',
    body: dados,
  })
  return res.plano
}

/**
 * Exclui um plano do catálogo (valida regras de negócio no backend)
 */
export async function excluirMasterPlano(id: string): Promise<void> {
  await pb.send<{ sucesso: boolean; message: string }>(`/backend/v1/master/planos/${id}`, {
    method: 'DELETE',
  })
}

/**
 * Atualiza parâmetros de configuração master (ex: dias_trial)
 */
export async function atualizarConfigMaster(
  dias_trial: number,
): Promise<{ id: string; dias_trial: number }> {
  const res = await pb.send<{
    sucesso: boolean
    message: string
    config: { id: string; dias_trial: number }
  }>('/backend/v1/master/config', {
    method: 'PUT',
    body: { dias_trial },
  })
  return res.config
}

/**
 * Executa bateria de testes automatizados do Prompt 9.7a2
 */
export async function executarTesteCompleto97a2(): Promise<any> {
  const res = await pb.send<any>('/backend/v1/master/executar-teste-completo-97a2', {
    method: 'POST',
  })
  return res
}

/**
 * Lista as licenças dos clientes com dados agregados (Item 1 do Prompt 9.7b)
 */
export async function listarMasterLicencas(): Promise<MasterLicencaItem[]> {
  const res = await pb.send<{ sucesso: boolean; licencas: MasterLicencaItem[] }>(
    '/backend/v1/master/licencas',
    {
      method: 'GET',
    },
  )
  return res.licencas || []
}

/**
 * Obtém histórico de eventos de uma licença (Item 2)
 */
export async function obterHistoricoLicenca(assinanteId: string): Promise<MasterHistoricoResponse> {
  const res = await pb.send<MasterHistoricoResponse>(
    `/backend/v1/master/licencas/${assinanteId}/historico`,
    {
      method: 'GET',
    },
  )
  return res
}

/**
 * Renova a licença por +30 dias (Item 3)
 */
export async function renovarLicenca30Dias(
  assinanteId: string,
): Promise<{ sucesso: boolean; message: string; data_expiracao_nova: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string; data_expiracao_nova: string }>(
    `/backend/v1/master/licencas/${assinanteId}/renovar`,
    {
      method: 'POST',
    },
  )
  return res
}

/**
 * Edita os limites personalizados desta licença
 */
export async function editarLimitesLicenca(
  assinanteId: string,
  dados: {
    limites_personalizados: boolean
    limite_empresas: number
    limite_usuarios: number
  },
): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>(
    `/backend/v1/master/licencas/${assinanteId}/limites`,
    {
      method: 'PUT',
      body: dados,
    },
  )
  return res
}

/**
 * Edita a data de expiração da licença
 */
export async function editarExpiracaoLicenca(
  assinanteId: string,
  data_expiracao: string,
): Promise<{ sucesso: boolean; message: string; data_expiracao: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string; data_expiracao: string }>(
    `/backend/v1/master/licencas/${assinanteId}/expiracao`,
    {
      method: 'PUT',
      body: { data_expiracao },
    },
  )
  return res
}

/**
 * Altera o plano do cliente
 */
export async function alterarPlanoLicenca(
  assinanteId: string,
  plano_id: string,
): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>(
    `/backend/v1/master/licencas/${assinanteId}/plano`,
    {
      method: 'PUT',
      body: { plano_id },
    },
  )
  return res
}

/**
 * Altera a situação da licença (Pausar / Reativar)
 */
export async function alterarStatusLicenca(
  assinanteId: string,
  status: 'Ativa' | 'Pausada' | 'Cancelada',
  motivo?: string,
): Promise<{ sucesso: boolean; message: string; status_novo: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string; status_novo: string }>(
    `/backend/v1/master/licencas/${assinanteId}/status`,
    {
      method: 'PUT',
      body: { status, motivo },
    },
  )
  return res
}

/**
 * Edita os dados gerais do cliente (nome, documento, email, telefone, whatsapp, observações)
 */
export async function editarDadosGeraisLicenca(
  assinanteId: string,
  dados: {
    nome: string
    documento?: string
    email_contato?: string
    telefone?: string
    whatsapp_contato?: string
    observacoes?: string
  },
): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>(
    `/backend/v1/master/licencas/${assinanteId}/dados-gerais`,
    {
      method: 'PUT',
      body: dados,
    },
  )
  return res
}

/**
 * Exclui a licença e todos os dados associados ao cliente (com confirmação por digitação)
 */
export async function excluirLicencaCascata(
  assinanteId: string,
  confirmacao_nome: string,
): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>(
    `/backend/v1/master/licencas/${assinanteId}`,
    {
      method: 'DELETE',
      body: { confirmacao_nome },
    },
  )
  return res
}

/**
 * Executa bateria completa de testes automatizados do Prompt 9.7b
 */
export async function executarTesteCompleto97b(): Promise<any> {
  const res = await pb.send<any>('/backend/v1/master/executar-teste-completo-97b', {
    method: 'POST',
  })
  return res
}
