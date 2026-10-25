import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface RegraFiscalNcm {
  id: string
  ncm_prefixo: string
  cest?: string
  uf?: string
  regime_empresa: 'Simples Nacional' | 'Regime Normal' | 'Todos'
  perfil_tributario_id: string
  sujeito_st?: boolean
  monofasico_pis_cofins?: boolean
  natureza_receita_pis_cofins?: string
  observacao?: string
  prioridade?: number
  ativo?: boolean
  created?: string
  updated?: string
  expand?: {
    perfil_tributario_id?: any
  }
}

export interface ListarRegrasNcmParams {
  busca?: string
  uf?: string
  regime?: string
  page?: number
  perPage?: number
  assinante_id?: string
}

export async function listarRegrasNcm(params: ListarRegrasNcmParams = {}) {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = ['ativo = true']

  if (params.assinante_id) {
    condicoes.push(`assinante_id = '${params.assinante_id}'`)
  }

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(ncm_prefixo ~ '${b}' || observacao ~ '${b}' || cest ~ '${b}')`)
  }

  if (params.uf && params.uf !== 'todas') {
    condicoes.push(`uf = '${params.uf}'`)
  }

  if (params.regime && params.regime !== 'todos') {
    condicoes.push(`(regime_empresa = '${params.regime}' || regime_empresa = 'Todos')`)
  }

  const filter = condicoes.join(' && ')
  return await pb.collection('regras_fiscais_ncm').getList<RegraFiscalNcm>(page, perPage, {
    filter,
    sort: '-prioridade,ncm_prefixo',
    expand: 'perfil_tributario_id',
  })
}

export async function obterRegraNcmPorId(id: string): Promise<RegraFiscalNcm> {
  return await pb.collection('regras_fiscais_ncm').getOne<RegraFiscalNcm>(id, {
    expand: 'perfil_tributario_id',
  })
}

export async function salvarRegraNcm(dados: Partial<RegraFiscalNcm>): Promise<RegraFiscalNcm> {
  const user = pb.authStore.record
  const prefixoLimpo = (dados.ncm_prefixo || '').replace(/\D/g, '')

  const payload: Record<string, unknown> = {
    ncm_prefixo: prefixoLimpo,
    cest: dados.cest ? dados.cest.replace(/\D/g, '') : '',
    uf: (dados.uf || 'ES').toUpperCase().trim(),
    regime_empresa: dados.regime_empresa || 'Todos',
    perfil_tributario_id: dados.perfil_tributario_id,
    sujeito_st: Boolean(dados.sujeito_st),
    monofasico_pis_cofins: Boolean(dados.monofasico_pis_cofins),
    natureza_receita_pis_cofins: dados.natureza_receita_pis_cofins?.trim() || '',
    observacao: dados.observacao?.trim() || '',
    prioridade: Number(dados.prioridade || 0),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  let salva: RegraFiscalNcm
  if (dados.id) {
    const antes = await obterRegraNcmPorId(dados.id)
    salva = await pb.collection('regras_fiscais_ncm').update<RegraFiscalNcm>(dados.id, payload)
    await registrarAuditoria({
      tabela: 'regras_fiscais_ncm',
      registro_id: salva.id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = user?.id || null
    salva = await pb.collection('regras_fiscais_ncm').create<RegraFiscalNcm>(payload)
    await registrarAuditoria({
      tabela: 'regras_fiscais_ncm',
      registro_id: salva.id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

export async function inativarRegraNcm(id: string): Promise<void> {
  const antes = await obterRegraNcmPorId(id)
  await pb.collection('regras_fiscais_ncm').update(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })
  await registrarAuditoria({
    tabela: 'regras_fiscais_ncm',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
  })
}

/**
 * Resolução da regra por NCM:
 * Prefixo mais longo vence; em empate, maior prioridade vence.
 */
export async function buscarMelhorRegraNcm(params: {
  ncm: string
  uf?: string
  regimeEmpresa?: 'Simples Nacional' | 'Regime Normal'
  assinante_id?: string
}): Promise<RegraFiscalNcm | null> {
  const ncmLimpo = (params.ncm || '').replace(/\D/g, '')
  if (!ncmLimpo) return null

  const ufAlvo = (params.uf || 'ES').toUpperCase().trim()
  const regimeAlvo = params.regimeEmpresa || 'Simples Nacional'

  // Busca regras ativas que combinem com a UF ou sem UF específica
  const condicoes = [`ativo = true`]
  if (params.assinante_id) {
    condicoes.push(`assinante_id = '${params.assinante_id}'`)
  }
  if (ufAlvo) {
    condicoes.push(`(uf = '${ufAlvo}' || uf = '' || uf = 'BR')`)
  }
  condicoes.push(`(regime_empresa = '${regimeAlvo}' || regime_empresa = 'Todos')`)

  const regras = await pb.collection('regras_fiscais_ncm').getFullList<RegraFiscalNcm>({
    filter: condicoes.join(' && '),
    expand: 'perfil_tributario_id',
    sort: '-prioridade',
  })

  // Filtra regras cujo ncm_prefixo casa com o início de ncmLimpo
  const compativeis = regras.filter((r) => {
    const pref = (r.ncm_prefixo || '').replace(/\D/g, '')
    return pref.length >= 2 && ncmLimpo.startsWith(pref)
  })

  if (compativeis.length === 0) return null

  // Ordena: 1º maior comprimento do prefixo (mais específico vence); 2º maior prioridade
  compativeis.sort((a, b) => {
    const prefA = (a.ncm_prefixo || '').replace(/\D/g, '').length
    const prefB = (b.ncm_prefixo || '').replace(/\D/g, '').length
    if (prefB !== prefA) return prefB - prefA
    const prioA = a.prioridade || 0
    const prioB = b.prioridade || 0
    return prioB - prioA
  })

  return compativeis[0]
}
