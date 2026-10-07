import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface IcmsAliquotaUf {
  id: string
  uf: string
  aliquota_interna: number
  aliquota_fcp?: number
  vigencia_inicio?: string
  observacao?: string
  ativo?: boolean
  created?: string
  updated?: string
}

export interface IcmsInterestadual {
  id: string
  uf_origem: string
  uf_destino: string
  aliquota: number
  ativo?: boolean
  created?: string
  updated?: string
}

export const TODAS_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const

// Cache em memória simples para operações síncronas/rápidas
let cacheInterestadual: Record<string, number> | null = null
let cacheInternaUf: Record<string, { interna: number; fcp: number }> | null = null

export async function carregarTabelasIcmsCache(): Promise<void> {
  try {
    const listInter = await pb.collection('icms_interestadual').getFullList<IcmsInterestadual>({
      filter: 'ativo = true',
    })
    const mapInter: Record<string, number> = {}
    listInter.forEach((r) => {
      mapInter[`${r.uf_origem}_${r.uf_destino}`] = r.aliquota
    })
    cacheInterestadual = mapInter

    const listUfs = await pb.collection('icms_aliquotas_uf').getFullList<IcmsAliquotaUf>({
      filter: 'ativo = true',
    })
    const mapUf: Record<string, { interna: number; fcp: number }> = {}
    listUfs.forEach((u) => {
      mapUf[u.uf.toUpperCase()] = {
        interna: u.aliquota_interna,
        fcp: u.aliquota_fcp || 0,
      }
    })
    cacheInternaUf = mapUf
  } catch (err) {
    console.warn('Erro ao carregar cache de ICMS:', err)
  }
}

/**
 * Função reutilizável aliquotaInterestadual
 * - Se as UFs forem iguais: retorna a alíquota interna da UF (da tabela icms_aliquotas_uf)
 * - Se a origem da mercadoria for 1, 2, 3 ou 8: retorna 4% (Resolução do Senado 13/2012)
 * - Senão: o valor da tabela icms_interestadual (ou 12% como fallback da Resolução 22/1989)
 */
export async function aliquotaInterestadual(
  ufOrigem: string,
  ufDestino: string,
  origemMercadoria?: string | number,
): Promise<number> {
  const orig = (ufOrigem || '').toUpperCase().trim()
  const dest = (ufDestino || '').toUpperCase().trim()
  const origMercStr = String(origemMercadoria ?? '').trim()

  // Se mesma UF, é operação interna
  if (orig && dest && orig === dest) {
    try {
      const rec = await pb
        .collection('icms_aliquotas_uf')
        .getFirstListItem<IcmsAliquotaUf>(`uf = '${orig}' && ativo = true`)
      if (rec && rec.aliquota_interna) {
        return rec.aliquota_interna
      }
    } catch {
      // continua
    }
    return 17 // padrão estadual se não cadastrado
  }

  // Resolução do Senado 13/2012: alíquota de 4% para mercadorias importadas (origens 1, 2, 3 e 8)
  if (['1', '2', '3', '8'].includes(origMercStr)) {
    return 4
  }

  // Busca na tabela icms_interestadual
  if (orig && dest) {
    try {
      const rec = await pb
        .collection('icms_interestadual')
        .getFirstListItem<IcmsInterestadual>(
          `uf_origem = '${orig}' && uf_destino = '${dest}' && ativo = true`,
        )
      if (rec && rec.aliquota !== undefined && rec.aliquota !== null) {
        return rec.aliquota
      }
    } catch {
      // fallback
    }

    // Regra padrão do Senado 22/1989:
    const sulSudeste = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
    const outros = [
      'AC',
      'AL',
      'AM',
      'AP',
      'BA',
      'CE',
      'DF',
      'ES',
      'GO',
      'MA',
      'MT',
      'MS',
      'PA',
      'PB',
      'PE',
      'PI',
      'RN',
      'RO',
      'RR',
      'SE',
      'TO',
    ]
    if (sulSudeste.includes(orig) && outros.includes(dest)) {
      return 7
    }
    return 12
  }

  return 12
}

// ==========================================
// CRUD icms_aliquotas_uf
// ==========================================

export async function listarAliquotasUf(): Promise<IcmsAliquotaUf[]> {
  return await pb.collection('icms_aliquotas_uf').getFullList<IcmsAliquotaUf>({
    filter: 'ativo = true',
    sort: 'uf',
  })
}

export async function obterAliquotaUf(uf: string): Promise<IcmsAliquotaUf | null> {
  try {
    return await pb
      .collection('icms_aliquotas_uf')
      .getFirstListItem<IcmsAliquotaUf>(`uf = '${uf.toUpperCase().trim()}' && ativo = true`)
  } catch {
    return null
  }
}

export async function salvarAliquotaUf(dados: {
  uf: string
  aliquota_interna: number
  aliquota_fcp?: number
  vigencia_inicio?: string
  observacao?: string
}): Promise<IcmsAliquotaUf> {
  const user = pb.authStore.record
  const ufUpper = dados.uf.toUpperCase().trim()
  const existente = await obterAliquotaUf(ufUpper)

  const payload: Record<string, unknown> = {
    uf: ufUpper,
    aliquota_interna: Number(dados.aliquota_interna),
    aliquota_fcp: dados.aliquota_fcp !== undefined ? Number(dados.aliquota_fcp) : 0,
    vigencia_inicio: dados.vigencia_inicio || '',
    observacao: dados.observacao || '',
    ativo: true,
    updated_by: user?.id || null,
  }

  let salvo: IcmsAliquotaUf
  if (existente) {
    salvo = await pb.collection('icms_aliquotas_uf').update<IcmsAliquotaUf>(existente.id, payload)
    await registrarAuditoria({
      tabela: 'icms_aliquotas_uf',
      registro_id: salvo.id,
      acao: 'alteracao',
      valores_antes: existente as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = user?.id || null
    salvo = await pb.collection('icms_aliquotas_uf').create<IcmsAliquotaUf>(payload)
    await registrarAuditoria({
      tabela: 'icms_aliquotas_uf',
      registro_id: salvo.id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  cacheInternaUf = null
  return salvo
}

// ==========================================
// CRUD icms_interestadual
// ==========================================

export async function listarMatrizInterestadual(): Promise<IcmsInterestadual[]> {
  return await pb.collection('icms_interestadual').getFullList<IcmsInterestadual>({
    filter: 'ativo = true',
    sort: 'uf_origem,uf_destino',
  })
}

export async function salvarParInterestadual(
  ufOrigem: string,
  ufDestino: string,
  aliquota: number,
): Promise<IcmsInterestadual> {
  const user = pb.authStore.record
  const orig = ufOrigem.toUpperCase().trim()
  const dest = ufDestino.toUpperCase().trim()

  let existente: IcmsInterestadual | null = null
  try {
    existente = await pb
      .collection('icms_interestadual')
      .getFirstListItem<IcmsInterestadual>(
        `uf_origem = '${orig}' && uf_destino = '${dest}' && ativo = true`,
      )
  } catch {
    existente = null
  }

  const payload: Record<string, unknown> = {
    uf_origem: orig,
    uf_destino: dest,
    aliquota: Number(aliquota),
    ativo: true,
    updated_by: user?.id || null,
  }

  let salvo: IcmsInterestadual
  if (existente) {
    salvo = await pb
      .collection('icms_interestadual')
      .update<IcmsInterestadual>(existente.id, payload)
    await registrarAuditoria({
      tabela: 'icms_interestadual',
      registro_id: salvo.id,
      acao: 'alteracao',
      valores_antes: existente as unknown as Record<string, unknown>,
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = user?.id || null
    salvo = await pb.collection('icms_interestadual').create<IcmsInterestadual>(payload)
    await registrarAuditoria({
      tabela: 'icms_interestadual',
      registro_id: salvo.id,
      acao: 'inclusao',
      valores_depois: salvo as unknown as Record<string, unknown>,
    })
  }

  cacheInterestadual = null
  return salvo
}
