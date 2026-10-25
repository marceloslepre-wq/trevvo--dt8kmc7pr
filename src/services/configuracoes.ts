import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface ConfiguracaoGeral {
  id: string
  ativo: boolean
  nome_sistema: string
  logo?: string
  cor_principal?: string
  dias_alerta_validade?: number
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export const CONFIG_PADRAO: ConfiguracaoGeral = {
  id: '',
  ativo: true,
  nome_sistema: 'ERP Gestão Comercial',
  cor_principal: '#2563eb',
  dias_alerta_validade: 30,
}

/**
 * Obtém a configuração ativa geral do sistema (primeiro registro da tabela configuracoes).
 */
export async function obterConfiguracaoGeral(assinanteId?: string): Promise<ConfiguracaoGeral> {
  try {
    const filter = assinanteId ? `assinante_id = '${assinanteId}'` : undefined
    const list = await pb.collection('configuracoes').getList<ConfiguracaoGeral>(1, 1, {
      filter,
      sort: '-created',
    })
    if (list.items.length > 0) {
      return list.items[0]
    }
  } catch (err) {
    console.warn('Erro ao carregar configuracoes gerais do ERP:', err)
  }
  return CONFIG_PADRAO
}

/**
 * Salva (cria ou atualiza) a configuração geral do sistema com auditoria.
 */
export async function salvarConfiguracaoGeral(
  dados: {
    nome_sistema: string
    cor_principal?: string
    dias_alerta_validade?: number
    logoFile?: File | null
    removerLogo?: boolean
  },
  configIdAtual?: string,
): Promise<ConfiguracaoGeral> {
  let configExistente: ConfiguracaoGeral | null = null

  if (configIdAtual) {
    try {
      configExistente = await pb
        .collection('configuracoes')
        .getOne<ConfiguracaoGeral>(configIdAtual)
    } catch {
      configExistente = null
    }
  } else {
    try {
      const list = await pb.collection('configuracoes').getList<ConfiguracaoGeral>(1, 1, {
        sort: '-created',
      })
      if (list.items.length > 0) {
        configExistente = list.items[0]
      }
    } catch {
      configExistente = null
    }
  }

  const formData = new FormData()
  formData.append('nome_sistema', dados.nome_sistema.trim())
  formData.append('cor_principal', dados.cor_principal || '#2563eb')
  if (dados.dias_alerta_validade !== undefined && dados.dias_alerta_validade !== null) {
    formData.append('dias_alerta_validade', String(dados.dias_alerta_validade))
  }
  formData.append('ativo', 'true')
  formData.append('updated_by', pb.authStore.record?.id || '')

  if (dados.logoFile) {
    formData.append('logo', dados.logoFile)
  } else if (dados.removerLogo) {
    formData.append('logo', '')
  }

  let configSalva: ConfiguracaoGeral

  if (configExistente && configExistente.id) {
    configSalva = await pb
      .collection('configuracoes')
      .update<ConfiguracaoGeral>(configExistente.id, formData)

    await registrarAuditoria({
      tabela: 'configuracoes',
      registro_id: configSalva.id,
      acao: 'alteracao',
      valores_antes: configExistente as unknown as Record<string, unknown>,
      valores_depois: configSalva as unknown as Record<string, unknown>,
    })
  } else {
    formData.append('created_by', pb.authStore.record?.id || '')
    configSalva = await pb.collection('configuracoes').create<ConfiguracaoGeral>(formData)

    await registrarAuditoria({
      tabela: 'configuracoes',
      registro_id: configSalva.id,
      acao: 'inclusao',
      valores_depois: configSalva as unknown as Record<string, unknown>,
    })
  }

  return configSalva
}

/**
 * Retorna a URL completa da logo da configuração salva no Skip Cloud.
 */
export function obterUrlLogo(config: ConfiguracaoGeral | null): string | null {
  if (!config || !config.id || !config.logo) return null
  return pb.files.getURL(config, config.logo)
}
