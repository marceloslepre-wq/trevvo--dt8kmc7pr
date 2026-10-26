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
