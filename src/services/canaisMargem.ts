import pb from '@/lib/pocketbase/client'

/**
 * Canais de venda usados no simulador "Margem por canal" (aba Preços do produto).
 * Coleção canais_margem (migration 0138).
 */
export interface CanalMargem {
  id?: string
  assinante_id?: string
  nome: string
  empresa_id?: string
  modo_icms: 'perfil' | 'fixo'
  aliquota_icms_fixa?: number | null
  comissao_percentual?: number | null
  taxa_fixa?: number | null
  despesas_percentual?: number | null
  /** Regra de preço do canal: preço da empresa do canal + X% (como na Tray). */
  acrescimo_percentual?: number | null
  ordem?: number | null
  ativo?: boolean
  observacao?: string
}

export async function listarCanaisMargem(
  assinanteId?: string | null,
  somenteAtivos = false,
): Promise<CanalMargem[]> {
  const filtros: string[] = []
  if (assinanteId) filtros.push(`assinante_id = '${assinanteId}'`)
  if (somenteAtivos) filtros.push('ativo = true')
  return pb.collection('canais_margem').getFullList<CanalMargem>({
    filter: filtros.join(' && '),
    sort: 'ordem,nome',
  })
}

export async function salvarCanalMargem(
  canal: CanalMargem,
  assinanteId?: string | null,
): Promise<CanalMargem> {
  const dados: Record<string, unknown> = {
    nome: canal.nome.trim(),
    empresa_id: canal.empresa_id || '',
    modo_icms: canal.modo_icms || 'fixo',
    aliquota_icms_fixa: Number(canal.aliquota_icms_fixa) || 0,
    comissao_percentual: Number(canal.comissao_percentual) || 0,
    taxa_fixa: Number(canal.taxa_fixa) || 0,
    despesas_percentual: Number(canal.despesas_percentual) || 0,
    acrescimo_percentual: Number(canal.acrescimo_percentual) || 0,
    ordem: Number(canal.ordem) || 0,
    ativo: canal.ativo !== false,
    observacao: canal.observacao || '',
  }
  if (canal.id) {
    return pb.collection('canais_margem').update<CanalMargem>(canal.id, dados)
  }
  if (assinanteId) dados.assinante_id = assinanteId
  return pb.collection('canais_margem').create<CanalMargem>(dados)
}

export async function excluirCanalMargem(id: string): Promise<void> {
  await pb.collection('canais_margem').delete(id)
}

/** Alíquotas de venda tiradas do perfil tributário do produto. */
export interface ImpostosVendaPerfil {
  aliquotaIcms: number // % (já somando FCP)
  reducaoBcIcms: number // %
  aliquotaPisCofins: number // % (PIS + COFINS)
  /** false = produto sem ICMS próprio na venda (ST, isento, não tributado): ICMS 0 em todo canal. */
  tributaIcms: boolean
  origem: 'perfil' | 'padrao'
}

/** Usado quando o produto não tem perfil: ICMS 17% e PIS/COFINS 9,25% (Lucro Real). */
export const IMPOSTOS_PADRAO: ImpostosVendaPerfil = {
  aliquotaIcms: 17,
  reducaoBcIcms: 0,
  aliquotaPisCofins: 9.25,
  tributaIcms: true,
  origem: 'padrao',
}

/**
 * Lê o cenário VENDA_INTERNA_CONSUMIDOR do perfil (ou VENDA_INTERNA_CONTRIBUINTE).
 * Produtos com ST (CST 60), isentos ou não tributados ficam com ICMS 0.
 * Monofásicos (PIS/COFINS CST 04/06) ficam com PIS/COFINS 0.
 */
export async function obterImpostosVendaDoPerfil(
  perfilId?: string | null,
): Promise<ImpostosVendaPerfil> {
  if (!perfilId) return IMPOSTOS_PADRAO
  try {
    const regras = await pb.collection('perfis_tributarios_regras').getFullList<{
      cenario: string
      cst_icms?: string
      aliquota_icms?: number | null
      aliquota_fcp?: number | null
      reducao_bc_icms_percentual?: number | null
      aliquota_pis?: number | null
      aliquota_cofins?: number | null
      ativo?: boolean
    }>({
      filter: `perfil_id = '${perfilId}'`,
    })
    return impostosDasRegras(regras)
  } catch {
    return IMPOSTOS_PADRAO
  }
}

export interface RegraPerfilVenda {
  perfil_id?: string
  cenario: string
  cst_icms?: string
  aliquota_icms?: number | null
  aliquota_fcp?: number | null
  reducao_bc_icms_percentual?: number | null
  aliquota_pis?: number | null
  aliquota_cofins?: number | null
  ativo?: boolean
}

/** Alíquotas de venda a partir das regras de um perfil (sem acesso ao banco). */
export function impostosDasRegras(regras: RegraPerfilVenda[]): ImpostosVendaPerfil {
  const regra =
    regras.find((r) => r.cenario === 'VENDA_INTERNA_CONSUMIDOR' && r.ativo !== false) ||
    regras.find((r) => r.cenario === 'VENDA_INTERNA_CONTRIBUINTE' && r.ativo !== false)
  if (!regra) return IMPOSTOS_PADRAO
  const cst = String(regra.cst_icms || '').slice(-2)
  const tributaIcms = ['00', '10', '20', '51', '70', '90', ''].includes(cst)
  const aliquotaIcms = tributaIcms
    ? (Number(regra.aliquota_icms) || 0) + (Number(regra.aliquota_fcp) || 0)
    : 0
  return {
    aliquotaIcms,
    reducaoBcIcms: tributaIcms ? Number(regra.reducao_bc_icms_percentual) || 0 : 0,
    aliquotaPisCofins: (Number(regra.aliquota_pis) || 0) + (Number(regra.aliquota_cofins) || 0),
    tributaIcms,
    origem: 'perfil',
  }
}

/**
 * Faixas de lucro líquido usadas em todo o sistema:
 * acima de 20% verde (saudável), de 0 a 20% amarelo (requer atenção),
 * abaixo de zero vermelho (intervenção urgente).
 */
export type FaixaMargem = 'verde' | 'amarela' | 'vermelha'
export const LIMITE_MARGEM_SAUDAVEL = 20

export function faixaMargem(m: number): FaixaMargem {
  if (m < 0) return 'vermelha'
  if (m <= LIMITE_MARGEM_SAUDAVEL) return 'amarela'
  return 'verde'
}

export const ROTULO_FAIXA: Record<FaixaMargem, string> = {
  verde: 'Acima de 20%',
  amarela: '0 a 20%: requer atenção',
  vermelha: 'Negativa: intervenção urgente',
}

export const CLASSE_FAIXA: Record<FaixaMargem, string> = {
  verde: 'text-emerald-700 bg-emerald-50',
  amarela: 'text-amber-700 bg-amber-50',
  vermelha: 'text-rose-700 bg-rose-50',
}

export function classeMargem(m: number): string {
  return CLASSE_FAIXA[faixaMargem(m)]
}

export interface ResultadoMargemCanal {
  preco: number
  icms: number
  pisCofins: number
  comissao: number
  despesas: number
  lucro: number
  margem: number // % sobre o preço
  margemSobreRecebido: number // % sobre o valor recebido (líquido)
  recebido: number // valor líquido que entra (informado ou estimado)
  recebidoInformado: boolean
  aliquotaIcmsUsada: number
}

function fatoresCanal(canal: CanalMargem, impostos: ImpostosVendaPerfil) {
  // ICMS fixo do canal (ex.: 1,1% COMPETE) só vale para produto que paga ICMS na venda;
  // ST, isento ou não tributado ficam com ICMS 0 em qualquer canal.
  const aliqIcms = !impostos.tributaIcms
    ? 0
    : canal.modo_icms === 'perfil'
      ? impostos.aliquotaIcms
      : Number(canal.aliquota_icms_fixa) || 0
  const reducao = canal.modo_icms === 'perfil' ? impostos.reducaoBcIcms : 0
  const a = ((1 - reducao / 100) * aliqIcms) / 100 // ICMS como fração do preço
  const c = impostos.aliquotaPisCofins / 100 // PIS/COFINS sobre (preço − ICMS)
  const com = (Number(canal.comissao_percentual) || 0) / 100
  const desp = (Number(canal.despesas_percentual) || 0) / 100
  const taxa = Number(canal.taxa_fixa) || 0
  return { aliqIcms, a, c, com, desp, taxa }
}

/** Margem líquida do produto no canal, no mesmo critério do Uniplus (composição de preço). */
export function calcularMargemCanal(
  preco: number,
  custo: number,
  canal: CanalMargem,
  impostos: ImpostosVendaPerfil,
  valorRecebido?: number | null,
): ResultadoMargemCanal {
  const { aliqIcms, a, c, com, desp, taxa } = fatoresCanal(canal, impostos)
  const p = Number(preco) || 0
  // Impostos sempre sobre o preço (valor da nota), nunca sobre o valor recebido
  const icms = p * a
  const pisCofins = (p - icms) * c
  const informado = Number(valorRecebido) > 0
  let comissao: number
  let despesas: number
  if (informado) {
    // Valor recebido do marketplace já desconta comissão, frete e taxas
    comissao = Math.max(0, p - Number(valorRecebido))
    despesas = 0
  } else {
    comissao = p * com + (p > 0 ? taxa : 0)
    despesas = p * desp
  }
  const recebido = p - comissao - despesas
  const lucro = recebido - (Number(custo) || 0) - icms - pisCofins
  return {
    preco: p,
    icms,
    pisCofins,
    comissao,
    despesas,
    lucro,
    margem: p > 0 ? (lucro / p) * 100 : 0,
    margemSobreRecebido: recebido > 0 ? (lucro / recebido) * 100 : 0,
    recebido,
    recebidoInformado: informado,
    aliquotaIcmsUsada: aliqIcms,
  }
}

/** Preço que dá a margem líquida desejada (%) no canal. Retorna null se impossível. */
export function precoParaMargemCanal(
  margemDesejada: number,
  custo: number,
  canal: CanalMargem,
  impostos: ImpostosVendaPerfil,
): number | null {
  const { a, c, com, desp, taxa } = fatoresCanal(canal, impostos)
  const m = (Number(margemDesejada) || 0) / 100
  const divisor = 1 - a - c * (1 - a) - com - desp - m
  if (divisor <= 0) return null
  return Number((((Number(custo) || 0) + taxa) / divisor).toFixed(2))
}
