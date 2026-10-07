import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface ConfigFiscalEmpresa {
  id: string
  empresa_id: string
  aliquota_icms_interna_padrao?: number
  aliquota_fcp_padrao?: number
  csosn_padrao_tributado?: '101' | '102'
  grupo_padrao_id?: string
  categoria_padrao_id?: string
  margem_padrao_percentual?: number
  criar_produtos_automaticamente: 'Perguntar' | 'Sempre' | 'Nunca'
  aplicar_sugestao_fiscal_em_produtos_existentes_vazios: boolean
  ativo?: boolean
  created?: string
  updated?: string
  expand?: {
    empresa_id?: any
    grupo_padrao_id?: any
    categoria_padrao_id?: any
  }
}

export const CONFIG_FISCAL_PADRAO: Omit<ConfigFiscalEmpresa, 'id' | 'empresa_id'> = {
  csosn_padrao_tributado: '102',
  criar_produtos_automaticamente: 'Perguntar',
  aplicar_sugestao_fiscal_em_produtos_existentes_vazios: true,
  ativo: true,
}

export async function obterConfigFiscalEmpresa(
  empresaId: string,
): Promise<ConfigFiscalEmpresa | null> {
  if (!empresaId) return null
  try {
    const config = await pb
      .collection('config_fiscal_empresa')
      .getFirstListItem<ConfigFiscalEmpresa>(`empresa_id = '${empresaId}' && ativo = true`, {
        expand: 'grupo_padrao_id,categoria_padrao_id,empresa_id',
      })
    return config
  } catch {
    return null
  }
}

export async function salvarConfigFiscalEmpresa(
  empresaId: string,
  dados: Partial<ConfigFiscalEmpresa>,
): Promise<ConfigFiscalEmpresa> {
  const user = pb.authStore.record
  const existente = await obterConfigFiscalEmpresa(empresaId)

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    aliquota_icms_interna_padrao:
      dados.aliquota_icms_interna_padrao !== undefined
        ? Number(dados.aliquota_icms_interna_padrao)
        : null,
    aliquota_fcp_padrao:
      dados.aliquota_fcp_padrao !== undefined && dados.aliquota_fcp_padrao !== null
        ? Number(dados.aliquota_fcp_padrao)
        : null,
    csosn_padrao_tributado: dados.csosn_padrao_tributado || '102',
    grupo_padrao_id: dados.grupo_padrao_id || null,
    categoria_padrao_id: dados.categoria_padrao_id || null,
    margem_padrao_percentual:
      dados.margem_padrao_percentual !== undefined && dados.margem_padrao_percentual !== null
        ? Number(dados.margem_padrao_percentual)
        : null,
    criar_produtos_automaticamente: dados.criar_produtos_automaticamente || 'Perguntar',
    aplicar_sugestao_fiscal_em_produtos_existentes_vazios:
      dados.aplicar_sugestao_fiscal_em_produtos_existentes_vazios !== undefined
        ? Boolean(dados.aplicar_sugestao_fiscal_em_produtos_existentes_vazios)
        : true,
    ativo: true,
    updated_by: user?.id || null,
  }

  let salvo: ConfigFiscalEmpresa
  if (existente) {
    salvo = await pb
      .collection('config_fiscal_empresa')
      .update<ConfigFiscalEmpresa>(existente.id, payload)

    await registrarAuditoria({
      tabela: 'config_fiscal_empresa',
      registro_id: salvo.id,
      acao: 'alteracao',
      empresa_id: empresaId,
      valores_antes: existente as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = user?.id || null
    salvo = await pb.collection('config_fiscal_empresa').create<ConfigFiscalEmpresa>(payload)

    await registrarAuditoria({
      tabela: 'config_fiscal_empresa',
      registro_id: salvo.id,
      acao: 'inclusao',
      empresa_id: empresaId,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  return salvo
}
