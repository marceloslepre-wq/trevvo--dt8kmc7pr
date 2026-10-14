import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import type { Cliente } from '@/services/clientes'
import type { PlanoConta } from '@/services/planoContas'
import { obterOuCriarConfigFinanceiraEmpresa } from '@/services/configFinanceira'

export interface ConfigVendasEmpresa {
  id: string
  empresa_id: string
  cliente_padrao_id?: string
  permite_vender_sem_estoque?: boolean | null
  exige_cliente_identificado_acima_de?: number | null
  bloquear_venda_prazo_cliente_bloqueado?: boolean
  validade_orcamento_dias?: number
  dias_para_troca?: number
  mensagem_rodape_comprovante?: string
  plano_vendas_id?: string
  plano_taxas_cartao_id?: string
  plano_quebra_caixa_id?: string
  plano_sobra_caixa_id?: string
  fechamento_cego?: boolean
  balanca_ativa?: boolean
  balanca_prefixo?: string
  balanca_tipo?: 'Preço' | 'Peso'
  balanca_posicao_codigo?: number
  balanca_tamanho_codigo?: number
  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  expand?: {
    cliente_padrao_id?: Cliente
    plano_vendas_id?: PlanoConta
    plano_taxas_cartao_id?: PlanoConta
    plano_quebra_caixa_id?: PlanoConta
    plano_sobra_caixa_id?: PlanoConta
  }
}

/**
 * Garante ou cria o "Consumidor Final" no cadastro de clientes.
 * Regra: pessoa Física, sem CPF, indicador_ie '9', consumidor_final true.
 */
export async function obterOuCriarConsumidorFinal(): Promise<Cliente> {
  // 1. Tenta achar cliente com consumidor_final = true ou nome "Consumidor Final"
  try {
    const achado = await pb
      .collection('clientes')
      .getFirstListItem<Cliente>(
        '(consumidor_final = true || nome_razao_social = "Consumidor Final") && ativo = true',
      )
    if (achado) return achado
  } catch {
    // cria novo
  }

  // Busca próximo código numérico
  let proximoCodigo = 1
  try {
    const ultimos = await pb.collection('clientes').getList<Cliente>(1, 1, {
      sort: '-codigo',
    })
    if (ultimos.items.length > 0 && ultimos.items[0].codigo) {
      proximoCodigo = Number(ultimos.items[0].codigo) + 1
    }
  } catch {
    // ignora
  }

  const payload: Record<string, unknown> = {
    codigo: proximoCodigo,
    tipo_pessoa: 'Física',
    nome_razao_social: 'Consumidor Final',
    nome_fantasia: 'Consumidor Final',
    indicador_ie: '9',
    consumidor_final: true,
    ativo: true,
    created_by: pb.authStore.record?.id || null,
  }

  const novo = await pb.collection('clientes').create<Cliente>(payload)

  await registrarAuditoria({
    tabela: 'clientes',
    registro_id: novo.id,
    acao: 'inclusao',
    valores_depois: novo as unknown as Record<string, unknown>,
  })

  return novo
}

/**
 * Busca por código do plano de contas para resolver IDs padrão:
 * plano_taxas_cartao_id: 2.5.03
 * plano_quebra_caixa_id: 2.8.01
 * plano_sobra_caixa_id: 1.3.01
 */
async function buscarIdPlanoContaPorCodigo(codigo: string): Promise<string | null> {
  try {
    const conta = await pb
      .collection('plano_contas')
      .getFirstListItem<{ id: string }>(`codigo = '${codigo}'`)
    return conta.id
  } catch {
    return null
  }
}

export const CAMPOS_EXPAND_CONFIG_VENDAS =
  'cliente_padrao_id,plano_vendas_id,plano_taxas_cartao_id,plano_quebra_caixa_id,plano_sobra_caixa_id'

/**
 * Obtém ou inicializa a configuração de vendas da empresa ativa.
 * Padrões da especificação:
 * - cliente_padrao_id: "Consumidor Final" (criado automaticamente se não existir)
 * - permite_vender_sem_estoque: null / false
 * - exige_cliente_identificado_acima_de: null
 * - bloquear_venda_prazo_cliente_bloqueado: true
 * - validade_orcamento_dias: 7
 * - dias_para_troca: 30
 * - mensagem_rodape_comprovante: "Obrigado pela preferência! Volte sempre."
 * - plano_vendas_id: o mesmo de config_financeira_empresa (ou 1.1.01)
 * - plano_taxas_cartao_id: 2.5.03
 * - plano_quebra_caixa_id: 2.8.01
 * - plano_sobra_caixa_id: 1.3.01
 */
export async function obterOuCriarConfigVendasEmpresa(
  empresaId: string,
): Promise<ConfigVendasEmpresa> {
  if (!empresaId) {
    throw new Error('ID da empresa é obrigatório para carregar as configurações de vendas.')
  }

  try {
    const existente = await pb
      .collection('config_vendas_empresa')
      .getFirstListItem<ConfigVendasEmpresa>(`empresa_id = '${empresaId}'`, {
        expand: CAMPOS_EXPAND_CONFIG_VENDAS,
      })
    return existente
  } catch {
    // cria novo registro com padrões
  }

  // 1. Cliente padrão
  let clientePadraoId: string | null = null
  try {
    const consumidor = await obterOuCriarConsumidorFinal()
    clientePadraoId = consumidor.id
  } catch {
    // ignora
  }

  // 2. Plano de contas de vendas da config financeira
  let planoVendasId: string | null = null
  try {
    const cfgFin = await obterOuCriarConfigFinanceiraEmpresa(empresaId)
    planoVendasId = cfgFin.plano_vendas_id || null
  } catch {
    // fallback para buscar 1.1.01
    planoVendasId = await buscarIdPlanoContaPorCodigo('1.1.01')
  }

  // 3. Demais planos de contas
  const [planoTaxasCartaoId, planoQuebraCaixaId, planoSobraCaixaId] = await Promise.all([
    buscarIdPlanoContaPorCodigo('2.5.03'),
    buscarIdPlanoContaPorCodigo('2.8.01'),
    buscarIdPlanoContaPorCodigo('1.3.01'),
  ])

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    cliente_padrao_id: clientePadraoId,
    permite_vender_sem_estoque: null,
    exige_cliente_identificado_acima_de: null,
    bloquear_venda_prazo_cliente_bloqueado: true,
    validade_orcamento_dias: 7,
    dias_para_troca: 30,
    mensagem_rodape_comprovante: 'Obrigado pela preferência! Volte sempre.',
    plano_vendas_id: planoVendasId,
    plano_taxas_cartao_id: planoTaxasCartaoId,
    plano_quebra_caixa_id: planoQuebraCaixaId,
    plano_sobra_caixa_id: planoSobraCaixaId,
    fechamento_cego: true,
    balanca_ativa: false,
    balanca_prefixo: '2',
    balanca_tipo: 'Preço',
    balanca_posicao_codigo: 2,
    balanca_tamanho_codigo: 5,
    ativo: true,
    created_by: pb.authStore.record?.id || null,
  }

  const nova = await pb.collection('config_vendas_empresa').create<ConfigVendasEmpresa>(payload)

  await registrarAuditoria({
    tabela: 'config_vendas_empresa',
    registro_id: nova.id,
    empresa_id: empresaId,
    acao: 'inclusao',
    valores_depois: nova as unknown as Record<string, unknown>,
  })

  return await pb.collection('config_vendas_empresa').getOne<ConfigVendasEmpresa>(nova.id, {
    expand: CAMPOS_EXPAND_CONFIG_VENDAS,
  })
}

export async function salvarConfigVendasEmpresa(
  dados: Partial<ConfigVendasEmpresa> & { empresa_id: string },
): Promise<ConfigVendasEmpresa> {
  let existenteId = dados.id || null
  let antes: ConfigVendasEmpresa | null = null

  if (!existenteId) {
    try {
      const achado = await pb
        .collection('config_vendas_empresa')
        .getFirstListItem<ConfigVendasEmpresa>(`empresa_id = '${dados.empresa_id}'`)
      existenteId = achado.id
    } catch {
      // cria
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    cliente_padrao_id: dados.cliente_padrao_id || null,
    permite_vender_sem_estoque:
      dados.permite_vender_sem_estoque !== undefined ? dados.permite_vender_sem_estoque : null,
    exige_cliente_identificado_acima_de:
      dados.exige_cliente_identificado_acima_de !== undefined &&
      dados.exige_cliente_identificado_acima_de !== null &&
      !isNaN(Number(dados.exige_cliente_identificado_acima_de))
        ? Number(dados.exige_cliente_identificado_acima_de)
        : null,
    bloquear_venda_prazo_cliente_bloqueado:
      dados.bloquear_venda_prazo_cliente_bloqueado !== undefined
        ? Boolean(dados.bloquear_venda_prazo_cliente_bloqueado)
        : true,
    validade_orcamento_dias:
      dados.validade_orcamento_dias !== undefined &&
      dados.validade_orcamento_dias !== null &&
      !isNaN(Number(dados.validade_orcamento_dias))
        ? Math.max(1, Math.floor(Number(dados.validade_orcamento_dias)))
        : 7,
    dias_para_troca:
      dados.dias_para_troca !== undefined &&
      dados.dias_para_troca !== null &&
      !isNaN(Number(dados.dias_para_troca))
        ? Math.max(0, Math.floor(Number(dados.dias_para_troca)))
        : 30,
    mensagem_rodape_comprovante: dados.mensagem_rodape_comprovante || '',
    plano_vendas_id: dados.plano_vendas_id || null,
    plano_taxas_cartao_id: dados.plano_taxas_cartao_id || null,
    plano_quebra_caixa_id: dados.plano_quebra_caixa_id || null,
    plano_sobra_caixa_id: dados.plano_sobra_caixa_id || null,
    fechamento_cego: dados.fechamento_cego !== undefined ? Boolean(dados.fechamento_cego) : true,
    balanca_ativa: dados.balanca_ativa !== undefined ? Boolean(dados.balanca_ativa) : false,
    balanca_prefixo: dados.balanca_prefixo || '2',
    balanca_tipo: dados.balanca_tipo || 'Preço',
    balanca_posicao_codigo:
      dados.balanca_posicao_codigo !== undefined && !isNaN(Number(dados.balanca_posicao_codigo))
        ? Number(dados.balanca_posicao_codigo)
        : 2,
    balanca_tamanho_codigo:
      dados.balanca_tamanho_codigo !== undefined && !isNaN(Number(dados.balanca_tamanho_codigo))
        ? Number(dados.balanca_tamanho_codigo)
        : 5,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: ConfigVendasEmpresa
  if (existenteId) {
    antes = await pb.collection('config_vendas_empresa').getOne<ConfigVendasEmpresa>(existenteId)
    salva = await pb
      .collection('config_vendas_empresa')
      .update<ConfigVendasEmpresa>(existenteId, payload)
    await registrarAuditoria({
      tabela: 'config_vendas_empresa',
      registro_id: salva.id,
      empresa_id: dados.empresa_id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('config_vendas_empresa').create<ConfigVendasEmpresa>(payload)
    await registrarAuditoria({
      tabela: 'config_vendas_empresa',
      registro_id: salva.id,
      empresa_id: dados.empresa_id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return await pb.collection('config_vendas_empresa').getOne<ConfigVendasEmpresa>(salva.id, {
    expand: CAMPOS_EXPAND_CONFIG_VENDAS,
  })
}
