import pb from '@/lib/pocketbase/client'

export interface ConfigSpedEmpresa {
  id: string
  empresa_id: string
  versao_leiaute?: string
  codigo_receita_icms?: string
  dia_vencimento_icms?: number
  periodo_saldo_inicial?: string
  saldo_credor_inicial?: number
  mes_bloco_h?: number
  conta_contabil_estoque?: string
  gerar_bloco_k?: boolean
  incluir_homologacao_em_teste?: boolean
  created?: string
  updated?: string
}

export type SpedFinalidade = '0' | '1'
export type SpedModo = 'Oficial' | 'Teste'
export type SpedStatus =
  | 'Gerando'
  | 'Gerado'
  | 'Gerado com erros'
  | 'Erro'
  | 'Substituído'
  | 'Entregue'

export interface SpedValidacaoItem {
  nivel: 'erro' | 'aviso'
  registro?: string
  mensagem: string
  referencia?: string
}

export interface SpedResumoApuracao {
  debitos?: number
  creditos?: number
  ajustes_debitos?: number
  estornos_creditos?: number
  ajustes_creditos?: number
  estornos_debitos?: number
  deducoes?: number
  debitos_especiais?: number
  saldo_credor_anterior?: number
  saldo_apurado?: number
  icms_a_recolher?: number
  saldo_credor_a_transportar?: number
  difal_por_uf?: Record<
    string,
    {
      debitos_difal: number
      creditos_difal: number
      recolher_difal: number
      debitos_fcp: number
      creditos_fcp: number
      recolher_fcp: number
    }
  >
}

export interface SpedAjusteApuracaoRegistro {
  id: string
  empresa_id: string
  periodo: string
  codigo_ajuste: string
  descricao: string
  valor: number
  criado_por?: string
  created?: string
  updated?: string
}

export interface SpedResumoSaida {
  total_nfe?: number
  total_nfce?: number
  total_canceladas?: number
  total_denegadas?: number
  total_inutilizadas?: number
  total_vl_doc?: number
  total_vl_icms?: number
}

export interface SpedResumoEntrada {
  total_compras?: number
  total_transferencias?: number
  total_vl_doc?: number
  total_credito_icms?: number
}

export interface SpedArquivoRegistro {
  id: string
  empresa_id: string
  periodo: string
  finalidade: SpedFinalidade
  modo: SpedModo
  status: SpedStatus
  arquivo?: string
  nome_arquivo?: string
  quantidade_linhas?: number
  contagem_registros?: Record<string, number>
  resumo_apuracao?: SpedResumoApuracao
  resumo_saida?: SpedResumoSaida
  resumo_entrada?: SpedResumoEntrada
  validacoes?: SpedValidacaoItem[]
  gerado_por?: string
  entregue_em?: string
  recibo_entrega?: string
  observacoes?: string
  created?: string
  updated?: string
}

export const CONFIG_SPED_PADRAO: Omit<ConfigSpedEmpresa, 'id' | 'empresa_id'> = {
  versao_leiaute: '020',
  codigo_receita_icms: '101-5', // Código de receita comum do ICMS normal
  dia_vencimento_icms: 10,
  periodo_saldo_inicial: '',
  saldo_credor_inicial: 0,
  mes_bloco_h: 2,
  conta_contabil_estoque: '',
  gerar_bloco_k: false,
  incluir_homologacao_em_teste: true,
}

/**
 * Obtém a configuração de SPED Fiscal de uma empresa, ou cria a padrão caso ainda não exista.
 */
export async function obterOuCriarConfigSpedEmpresa(empresaId: string): Promise<ConfigSpedEmpresa> {
  if (!empresaId) {
    throw new Error('empresaId é obrigatório')
  }

  try {
    const registro = await pb
      .collection('config_sped_empresa')
      .getFirstListItem<ConfigSpedEmpresa>(`empresa_id = '${empresaId}'`)
    return registro
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 404) {
      const payload: Partial<ConfigSpedEmpresa> = {
        empresa_id: empresaId,
        versao_leiaute: CONFIG_SPED_PADRAO.versao_leiaute,
        codigo_receita_icms: CONFIG_SPED_PADRAO.codigo_receita_icms,
        dia_vencimento_icms: CONFIG_SPED_PADRAO.dia_vencimento_icms,
        periodo_saldo_inicial: '',
        saldo_credor_inicial: 0,
        mes_bloco_h: CONFIG_SPED_PADRAO.mes_bloco_h,
        conta_contabil_estoque: '',
        gerar_bloco_k: false,
        incluir_homologacao_em_teste: true,
      }
      return await pb.collection('config_sped_empresa').create<ConfigSpedEmpresa>(payload)
    }
    throw err
  }
}

/**
 * Salva (cria ou atualiza) a parametrização do SPED Fiscal de uma empresa.
 */
export async function salvarConfigSpedEmpresa(
  dados: Partial<ConfigSpedEmpresa> & { empresa_id: string },
): Promise<ConfigSpedEmpresa> {
  if (!dados.empresa_id) {
    throw new Error('empresa_id é obrigatório')
  }

  let existenteId = dados.id
  if (!existenteId) {
    try {
      const reg = await pb
        .collection('config_sped_empresa')
        .getFirstListItem<ConfigSpedEmpresa>(`empresa_id = '${dados.empresa_id}'`)
      existenteId = reg.id
    } catch (_) {
      existenteId = undefined
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    versao_leiaute: dados.versao_leiaute?.trim() || '020',
    codigo_receita_icms: dados.codigo_receita_icms?.trim() || '',
    dia_vencimento_icms:
      dados.dia_vencimento_icms !== undefined && dados.dia_vencimento_icms !== null
        ? Number(dados.dia_vencimento_icms)
        : null,
    periodo_saldo_inicial: dados.periodo_saldo_inicial?.trim() || '',
    saldo_credor_inicial:
      dados.saldo_credor_inicial !== undefined && dados.saldo_credor_inicial !== null
        ? Number(dados.saldo_credor_inicial)
        : 0,
    mes_bloco_h:
      dados.mes_bloco_h !== undefined && dados.mes_bloco_h !== null ? Number(dados.mes_bloco_h) : 2,
    conta_contabil_estoque: dados.conta_contabil_estoque?.trim() || '',
    gerar_bloco_k: Boolean(dados.gerar_bloco_k),
    incluir_homologacao_em_teste:
      dados.incluir_homologacao_em_teste !== undefined
        ? Boolean(dados.incluir_homologacao_em_teste)
        : true,
  }

  if (existenteId) {
    return await pb
      .collection('config_sped_empresa')
      .update<ConfigSpedEmpresa>(existenteId, payload)
  }

  return await pb.collection('config_sped_empresa').create<ConfigSpedEmpresa>(payload)
}

/**
 * Lista os arquivos SPED gerados da empresa ativa.
 */
export async function listarArquivosSped(empresaId: string): Promise<SpedArquivoRegistro[]> {
  if (!empresaId) return []
  return await pb.collection('sped_arquivos').getFullList<SpedArquivoRegistro>({
    filter: `empresa_id = '${empresaId}'`,
    sort: '-periodo,-created',
  })
}

/**
 * Marca um arquivo SPED como entregue à SEFAZ / Receita Federal via endpoint seguro do backend.
 */
export async function marcarSpedEntregue(params: {
  arquivo_id: string
  recibo_entrega: string
  entregue_em?: string
  observacoes?: string
}): Promise<{ sucesso: boolean; message: string }> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const res = await fetch(`${baseUrl}/backend/v1/sped/marcar-entregue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(params),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Falha ao marcar arquivo como entregue.')
  }
  return json
}

export interface GerarSpedParams {
  empresa_id: string
  periodo: string // "AAAA-MM"
  modo: SpedModo
}

export interface GerarSpedResponse {
  sucesso: boolean
  id?: string
  status: SpedStatus
  nome_arquivo?: string
  quantidade_linhas?: number
  total_validacoes?: number
  tem_erros?: boolean
  message?: string
}

/**
 * Solicita a geração do arquivo SPED Fiscal ao backend através de POST /backend/v1/sped/gerar.
 * O endpoint cria/atualiza o registro em sped_arquivos e retorna apenas o id e o status.
 */
export async function gerarArquivoSped(params: GerarSpedParams): Promise<GerarSpedResponse> {
  if (!params.empresa_id) throw new Error('empresa_id é obrigatório.')
  if (!params.periodo) throw new Error('periodo é obrigatório.')

  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const res = await fetch(`${baseUrl}/backend/v1/sped/gerar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(params),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.message || 'Falha ao processar solicitação de geração do SPED.')
  }
  return json
}

/**
 * Retorna a URL pública de download do arquivo .txt do SPED através do PocketBase SDK.
 */
export function obterUrlDownloadSped(
  record: { id: string; arquivo?: string } | SpedArquivoRegistro,
): string {
  if (!record.arquivo) return ''
  return pb.files.getURL(record as any, record.arquivo)
}

/**
 * Lista os ajustes manuais da apuração (tabela sped_ajustes_apuracao) para uma empresa e período.
 */
export async function listarAjustesApuracao(
  empresaId: string,
  periodo: string,
): Promise<SpedAjusteApuracaoRegistro[]> {
  if (!empresaId || !periodo) return []
  return await pb.collection('sped_ajustes_apuracao').getFullList<SpedAjusteApuracaoRegistro>({
    filter: `empresa_id = '${empresaId}' && periodo = '${periodo}'`,
    sort: 'codigo_ajuste,created',
  })
}

/**
 * Salva (cria ou atualiza) um ajuste manual da apuração através do endpoint seguro do backend.
 */
export async function salvarAjusteApuracao(dados: {
  id?: string
  empresa_id: string
  periodo: string
  codigo_ajuste: string
  descricao: string
  valor: number
}): Promise<{ sucesso: boolean; message: string; ajuste?: SpedAjusteApuracaoRegistro }> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const res = await fetch(`${baseUrl}/backend/v1/sped/ajustes/salvar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(dados),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Falha ao salvar ajuste da apuração.')
  }
  return json
}

/**
 * Exclui um ajuste manual da apuração através do endpoint seguro do backend.
 */
export async function excluirAjusteApuracao(
  ajusteId: string,
): Promise<{ sucesso: boolean; message: string }> {
  const token = pb.authStore.token
  const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
  const res = await fetch(`${baseUrl}/backend/v1/sped/ajustes/excluir`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({ id: ajusteId }),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Falha ao excluir ajuste da apuração.')
  }
  return json
}
