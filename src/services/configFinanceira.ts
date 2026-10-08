import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { PlanoConta } from '@/services/planoContas'
import type { CentroCusto } from '@/services/centrosCusto'

export interface ConfigFinanceiraEmpresa {
  id: string
  empresa_id: string
  multa_atraso_percentual?: number
  juros_mora_mensal_percentual?: number
  dias_carencia?: number
  plano_compras_revenda_id?: string
  plano_industrializacao_id?: string
  plano_uso_consumo_id?: string
  plano_imobilizado_id?: string
  plano_outras_entradas_id?: string
  plano_vendas_id?: string
  plano_juros_recebidos_id?: string
  plano_juros_pagos_id?: string
  plano_descontos_obtidos_id?: string
  plano_descontos_concedidos_id?: string
  plano_transferencias_id?: string
  centro_custo_padrao_id?: string
  dias_tolerancia_bloqueio?: number
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    plano_compras_revenda_id?: PlanoConta
    plano_industrializacao_id?: PlanoConta
    plano_uso_consumo_id?: PlanoConta
    plano_imobilizado_id?: PlanoConta
    plano_outras_entradas_id?: PlanoConta
    plano_vendas_id?: PlanoConta
    plano_juros_recebidos_id?: PlanoConta
    plano_juros_pagos_id?: PlanoConta
    plano_descontos_obtidos_id?: PlanoConta
    plano_descontos_concedidos_id?: PlanoConta
    plano_transferencias_id?: PlanoConta
    centro_custo_padrao_id?: CentroCusto
  }
}

/**
 * Mapeamento dos códigos padrão da carga inicial para cada campo de configuração
 * 2.1.01 -> Compras revenda
 * 2.1.03 -> Matéria-prima / Industrialização
 * 2.4.07 -> Material de uso e consumo
 * 2.7.01 -> Imobilizado
 * 2.8.01 -> Outras despesas / outras entradas
 * 1.1.01 -> Vendas de mercadorias
 * 1.2.01 -> Juros e multas recebidos
 * 2.6.01 -> Juros e multas pagos
 * 1.2.02 -> Descontos obtidos
 * 2.6.03 -> Descontos concedidos
 * 3.1.01 -> Transferências entre contas
 */
const CODIGOS_DEFAULTS_PLANO = {
  plano_compras_revenda_id: '2.1.01',
  plano_industrializacao_id: '2.1.03',
  plano_uso_consumo_id: '2.4.07',
  plano_imobilizado_id: '2.7.01',
  plano_outras_entradas_id: '2.8.01',
  plano_vendas_id: '1.1.01',
  plano_juros_recebidos_id: '1.2.01',
  plano_juros_pagos_id: '2.6.01',
  plano_descontos_obtidos_id: '1.2.02',
  plano_descontos_concedidos_id: '2.6.03',
  plano_transferencias_id: '3.1.01',
}

/**
 * Obtém ou cria as configurações financeiras da empresa com os defaults solicitados:
 * - Carga inicial do plano de contas vinculada aos campos
 * - Centro de custo "Geral" vinculado como padrão
 */
export async function obterOuCriarConfigFinanceiraEmpresa(
  empresaId: string,
): Promise<ConfigFinanceiraEmpresa> {
  if (!empresaId) {
    throw new Error('ID da empresa é obrigatório para carregar as configurações financeiras.')
  }

  try {
    const configExistente = await pb
      .collection('config_financeira_empresa')
      .getFirstListItem<ConfigFinanceiraEmpresa>(`empresa_id = '${empresaId}'`, {
        expand:
          'plano_compras_revenda_id,plano_industrializacao_id,plano_uso_consumo_id,plano_imobilizado_id,plano_outras_entradas_id,plano_vendas_id,plano_juros_recebidos_id,plano_juros_pagos_id,plano_descontos_obtidos_id,plano_descontos_concedidos_id,plano_transferencias_id,centro_custo_padrao_id',
      })
    return configExistente
  } catch {
    // Não existe: cria novo registro com os defaults
  }

  // Busca centro de custo "Geral"
  let centroCustoPadraoId: string | null = null
  try {
    const ccGeral = await pb
      .collection('centros_custo')
      .getFirstListItem<{ id: string }>('codigo = "1" || descricao = "Geral"')
    centroCustoPadraoId = ccGeral.id
  } catch {
    // ignora se não encontrar
  }

  // Busca contas do plano por código para os defaults
  const contasDefaults: Record<string, string | null> = {}
  for (const [campo, codigo] of Object.entries(CODIGOS_DEFAULTS_PLANO)) {
    try {
      const conta = await pb
        .collection('plano_contas')
        .getFirstListItem<{ id: string }>(`codigo = '${codigo}'`)
      contasDefaults[campo] = conta.id
    } catch {
      contasDefaults[campo] = null
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    multa_atraso_percentual: 2.0,
    juros_mora_mensal_percentual: 1.0,
    dias_carencia: 0,
    dias_tolerancia_bloqueio: 5,
    centro_custo_padrao_id: centroCustoPadraoId,
    ativo: true,
    created_by: pb.authStore.record?.id || null,
    ...contasDefaults,
  }

  const nova = await pb
    .collection('config_financeira_empresa')
    .create<ConfigFinanceiraEmpresa>(payload)

  await registrarAuditoria({
    tabela: 'config_financeira_empresa',
    registro_id: nova.id,
    acao: 'inclusao',
    valores_depois: nova as unknown as Record<string, unknown>,
  })

  return await pb.collection('config_financeira_empresa').getOne<ConfigFinanceiraEmpresa>(nova.id, {
    expand:
      'plano_compras_revenda_id,plano_industrializacao_id,plano_uso_consumo_id,plano_imobilizado_id,plano_outras_entradas_id,plano_vendas_id,plano_juros_recebidos_id,plano_juros_pagos_id,plano_descontos_obtidos_id,plano_descontos_concedidos_id,plano_transferencias_id,centro_custo_padrao_id',
  })
}

export async function salvarConfigFinanceiraEmpresa(
  dados: Partial<ConfigFinanceiraEmpresa> & { empresa_id: string },
): Promise<ConfigFinanceiraEmpresa> {
  let antes: ConfigFinanceiraEmpresa | null = null
  let existenteId: string | null = dados.id || null

  if (!existenteId) {
    try {
      const achado = await pb
        .collection('config_financeira_empresa')
        .getFirstListItem<ConfigFinanceiraEmpresa>(`empresa_id = '${dados.empresa_id}'`)
      existenteId = achado.id
    } catch {
      // cria
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    multa_atraso_percentual:
      dados.multa_atraso_percentual !== undefined &&
      dados.multa_atraso_percentual !== null &&
      !isNaN(Number(dados.multa_atraso_percentual))
        ? Number(dados.multa_atraso_percentual)
        : null,
    juros_mora_mensal_percentual:
      dados.juros_mora_mensal_percentual !== undefined &&
      dados.juros_mora_mensal_percentual !== null &&
      !isNaN(Number(dados.juros_mora_mensal_percentual))
        ? Number(dados.juros_mora_mensal_percentual)
        : null,
    dias_carencia:
      dados.dias_carencia !== undefined &&
      dados.dias_carencia !== null &&
      !isNaN(Number(dados.dias_carencia))
        ? Math.max(0, Math.floor(Number(dados.dias_carencia)))
        : 0,
    dias_tolerancia_bloqueio:
      dados.dias_tolerancia_bloqueio !== undefined &&
      dados.dias_tolerancia_bloqueio !== null &&
      !isNaN(Number(dados.dias_tolerancia_bloqueio))
        ? Math.max(0, Math.floor(Number(dados.dias_tolerancia_bloqueio)))
        : 0,
    plano_compras_revenda_id: dados.plano_compras_revenda_id || null,
    plano_industrializacao_id: dados.plano_industrializacao_id || null,
    plano_uso_consumo_id: dados.plano_uso_consumo_id || null,
    plano_imobilizado_id: dados.plano_imobilizado_id || null,
    plano_outras_entradas_id: dados.plano_outras_entradas_id || null,
    plano_vendas_id: dados.plano_vendas_id || null,
    plano_juros_recebidos_id: dados.plano_juros_recebidos_id || null,
    plano_juros_pagos_id: dados.plano_juros_pagos_id || null,
    plano_descontos_obtidos_id: dados.plano_descontos_obtidos_id || null,
    plano_descontos_concedidos_id: dados.plano_descontos_concedidos_id || null,
    plano_transferencias_id: dados.plano_transferencias_id || null,
    centro_custo_padrao_id: dados.centro_custo_padrao_id || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: ConfigFinanceiraEmpresa
  if (existenteId) {
    antes = await pb
      .collection('config_financeira_empresa')
      .getOne<ConfigFinanceiraEmpresa>(existenteId)

    salva = await pb
      .collection('config_financeira_empresa')
      .update<ConfigFinanceiraEmpresa>(existenteId, payload)

    await registrarAuditoria({
      tabela: 'config_financeira_empresa',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb
      .collection('config_financeira_empresa')
      .create<ConfigFinanceiraEmpresa>(payload)

    await registrarAuditoria({
      tabela: 'config_financeira_empresa',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return await pb
    .collection('config_financeira_empresa')
    .getOne<ConfigFinanceiraEmpresa>(salva.id, {
      expand:
        'plano_compras_revenda_id,plano_industrializacao_id,plano_uso_consumo_id,plano_imobilizado_id,plano_outras_entradas_id,plano_vendas_id,plano_juros_recebidos_id,plano_juros_pagos_id,plano_descontos_obtidos_id,plano_descontos_concedidos_id,plano_transferencias_id,centro_custo_padrao_id',
    })
}
