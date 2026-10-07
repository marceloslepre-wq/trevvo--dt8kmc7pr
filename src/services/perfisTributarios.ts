import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import { Cfop } from '@/services/cfop'
export { extrairCamposFiscaisDoPerfil } from '@/services/produtos'

export type RegimePerfilTributario = 'Simples Nacional' | 'Regime Normal'

export const CENARIOS_PERFIL = [
  'VENDA_INTERNA_CONTRIBUINTE',
  'VENDA_INTERNA_CONSUMIDOR',
  'VENDA_INTERESTADUAL_CONTRIBUINTE',
  'VENDA_INTERESTADUAL_CONSUMIDOR',
  'DEVOLUCAO_COMPRA',
  'TRANSFERENCIA',
  'COMPRA_INTERNA',
  'COMPRA_INTERESTADUAL',
] as const

export type CenarioPerfil = (typeof CENARIOS_PERFIL)[number]

export interface InfoCenario {
  codigo: CenarioPerfil
  titulo: string
  descricao: string
  tipoMovimentoEsperado: 'Entrada' | 'Saída'
}

export const CENARIOS_INFO: Record<CenarioPerfil, InfoCenario> = {
  VENDA_INTERNA_CONTRIBUINTE: {
    codigo: 'VENDA_INTERNA_CONTRIBUINTE',
    titulo: 'Venda Interna - Contribuinte',
    descricao: 'Dentro da UF, cliente contribuinte do ICMS (com Inscrição Estadual ativa)',
    tipoMovimentoEsperado: 'Saída',
  },
  VENDA_INTERNA_CONSUMIDOR: {
    codigo: 'VENDA_INTERNA_CONSUMIDOR',
    titulo: 'Venda Interna - Consumidor Final',
    descricao: 'Dentro da UF, consumidor final / não contribuinte, inclusive NFC-e',
    tipoMovimentoEsperado: 'Saída',
  },
  VENDA_INTERESTADUAL_CONTRIBUINTE: {
    codigo: 'VENDA_INTERESTADUAL_CONTRIBUINTE',
    titulo: 'Venda Interestadual - Contribuinte',
    descricao: 'Outra UF, cliente inscrito e contribuinte do ICMS',
    tipoMovimentoEsperado: 'Saída',
  },
  VENDA_INTERESTADUAL_CONSUMIDOR: {
    codigo: 'VENDA_INTERESTADUAL_CONSUMIDOR',
    titulo: 'Venda Interestadual - Consumidor Final',
    descricao: 'Outra UF, consumidor final / não contribuinte (DIFAL destino)',
    tipoMovimentoEsperado: 'Saída',
  },
  DEVOLUCAO_COMPRA: {
    codigo: 'DEVOLUCAO_COMPRA',
    titulo: 'Devolução de Compra',
    descricao: 'Devolução de mercadoria adquirida de fornecedor (Saída)',
    tipoMovimentoEsperado: 'Saída',
  },
  TRANSFERENCIA: {
    codigo: 'TRANSFERENCIA',
    titulo: 'Transferência de Mercadorias',
    descricao: 'Transferência entre estabelecimentos da mesma empresa (matriz e filiais)',
    tipoMovimentoEsperado: 'Saída',
  },
  COMPRA_INTERNA: {
    codigo: 'COMPRA_INTERNA',
    titulo: 'Compra Interna (Entrada)',
    descricao: 'Entrada de mercadorias adquiridas de fornecedor dentro do mesmo estado',
    tipoMovimentoEsperado: 'Entrada',
  },
  COMPRA_INTERESTADUAL: {
    codigo: 'COMPRA_INTERESTADUAL',
    titulo: 'Compra Interestadual (Entrada)',
    descricao: 'Entrada de mercadorias adquiridas de fornecedor de outra UF',
    tipoMovimentoEsperado: 'Entrada',
  },
}

export interface PerfilTributario {
  id: string
  ativo: boolean
  nome: string
  descricao?: string
  regime: RegimePerfilTributario
  origem_padrao?: string
  tipo_item_sped_padrao?: string
  c_benef?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface PerfilTributarioRegra {
  id?: string
  ativo?: boolean
  perfil_id?: string
  cenario: CenarioPerfil
  cfop?: string // ID ou código do CFOP (relação)
  expand?: {
    cfop?: Cfop
  }

  // ICMS
  cst_icms?: string
  csosn?: string
  mod_bc_icms?: string
  aliquota_icms?: number | null
  reducao_bc_icms_percentual?: number | null
  aliquota_fcp?: number | null

  // ICMS ST
  mod_bc_icms_st?: string
  mva_percentual?: number | null
  reducao_bc_icms_st_percentual?: number | null
  aliquota_icms_st?: number | null
  aliquota_fcp_st?: number | null

  // Diferimento e desoneração
  percentual_diferimento?: number | null
  motivo_desoneracao?: string

  // IPI
  cst_ipi?: string
  codigo_enquadramento_ipi?: string
  aliquota_ipi?: number | null

  // PIS
  cst_pis?: string
  aliquota_pis?: number | null

  // COFINS
  cst_cofins?: string
  aliquota_cofins?: number | null

  // Natureza receita
  natureza_receita_pis_cofins?: string

  // IBS / CBS
  cst_ibs_cbs?: string
  c_class_trib?: string
  aliquota_ibs_uf?: number | null
  aliquota_ibs_municipio?: number | null
  aliquota_cbs?: number | null
  reducao_ibs_cbs_percentual?: number | null

  // Observação fiscal
  observacao_fiscal?: string

  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface PerfilTributarioCompleto extends PerfilTributario {
  regras: PerfilTributarioRegra[]
}

export interface ListarPerfisParams {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  regime?: RegimePerfilTributario | 'todos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export interface ResultadoPaginado<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

// Helpers de validação de visibilidade dinâmica
export function cstOuCsosnIndicaST(regime: RegimePerfilTributario, cstOuCsosn?: string): boolean {
  if (!cstOuCsosn) return false
  const valor = cstOuCsosn.trim()
  if (regime === 'Regime Normal') {
    return ['10', '30', '70', '90'].includes(valor)
  }
  return ['201', '202', '203', '900'].includes(valor)
}

export function cstPermiteReducaoBC(regime: RegimePerfilTributario, cstOuCsosn?: string): boolean {
  if (!cstOuCsosn) return false
  const valor = cstOuCsosn.trim()
  if (regime === 'Regime Normal') {
    return ['20', '70', '90'].includes(valor)
  }
  return ['900'].includes(valor)
}

export function cstPisCofinsExigeNaturezaReceita(cstPis?: string, cstCofins?: string): boolean {
  const csts = ['04', '05', '06', '07', '08', '09']
  return Boolean(
    (cstPis && csts.includes(cstPis.trim())) || (cstCofins && csts.includes(cstCofins.trim())),
  )
}

export function validarCfopCenario(cenario: CenarioPerfil, cfopCodigo?: string): string | null {
  if (!cfopCodigo) return null
  const primeiroDigito = cfopCodigo.trim().charAt(0)
  const cenariosSaida: CenarioPerfil[] = [
    'VENDA_INTERNA_CONTRIBUINTE',
    'VENDA_INTERNA_CONSUMIDOR',
    'VENDA_INTERESTADUAL_CONTRIBUINTE',
    'VENDA_INTERESTADUAL_CONSUMIDOR',
    'DEVOLUCAO_COMPRA',
    'TRANSFERENCIA',
  ]
  const cenariosEntrada: CenarioPerfil[] = ['COMPRA_INTERNA', 'COMPRA_INTERESTADUAL']

  if (cenariosSaida.includes(cenario)) {
    if (primeiroDigito !== '5' && primeiroDigito !== '6') {
      return `Cenários de saída aceitam apenas CFOPs iniciados por 5 ou 6. O CFOP ${cfopCodigo} é inválido para este cenário.`
    }
  } else if (cenariosEntrada.includes(cenario)) {
    if (primeiroDigito !== '1' && primeiroDigito !== '2') {
      return `Cenários de compra aceitam apenas CFOPs de entrada iniciados por 1 ou 2. O CFOP ${cfopCodigo} é inválido para este cenário.`
    }
  }

  return null
}

// Inicializador de regra vazia para um cenário
export function criarRegraPadrao(cenario: CenarioPerfil): PerfilTributarioRegra {
  return {
    cenario,
    ativo: true,
    cfop: '',
    cst_icms: '',
    csosn: '',
    mod_bc_icms: '3', // Valor da operação
    aliquota_icms: null,
    reducao_bc_icms_percentual: null,
    aliquota_fcp: null,
    mod_bc_icms_st: '4', // MVA
    mva_percentual: null,
    reducao_bc_icms_st_percentual: null,
    aliquota_icms_st: null,
    aliquota_fcp_st: null,
    percentual_diferimento: null,
    motivo_desoneracao: '',
    cst_ipi: '99',
    codigo_enquadramento_ipi: '999',
    aliquota_ipi: null,
    cst_pis: '49',
    aliquota_pis: null,
    cst_cofins: '49',
    aliquota_cofins: null,
    natureza_receita_pis_cofins: '',
    cst_ibs_cbs: '000',
    c_class_trib: '000001',
    aliquota_ibs_uf: null,
    aliquota_ibs_municipio: null,
    aliquota_cbs: null,
    reducao_ibs_cbs_percentual: null,
    observacao_fiscal: '',
  }
}

// ----------------------------------------------------------------
// CRUD DE PERFIS TRIBUTÁRIOS
// ----------------------------------------------------------------

export async function listarPerfisTributarios(
  params: ListarPerfisParams = {},
): Promise<ResultadoPaginado<PerfilTributario>> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const termo = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(nome ~ '${termo}' || descricao ~ '${termo}')`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  if (params.regime && params.regime !== 'todos') {
    condicoes.push(`regime = '${params.regime}'`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'nome'

  const res = await pb.collection('perfis_tributarios').getList<PerfilTributario>(page, perPage, {
    filter,
    sort,
  })

  return {
    page: res.page,
    perPage: res.perPage,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
    items: res.items,
  }
}

export async function listarTodosPerfisAtivos(): Promise<PerfilTributario[]> {
  return await pb.collection('perfis_tributarios').getFullList<PerfilTributario>({
    filter: 'ativo = true',
    sort: 'nome',
  })
}

export async function obterPerfilTributarioCompleto(
  id: string,
): Promise<PerfilTributarioCompleto | null> {
  try {
    const perfil = await pb.collection('perfis_tributarios').getOne<PerfilTributario>(id)
    const regras = await pb
      .collection('perfis_tributarios_regras')
      .getFullList<PerfilTributarioRegra>({
        filter: `perfil_id = '${id}'`,
        expand: 'cfop',
      })

    // Garante que todos os 8 cenários existam na lista retornada
    const regrasCompletas: PerfilTributarioRegra[] = CENARIOS_PERFIL.map((cenario) => {
      const encontrada = regras.find((r) => r.cenario === cenario)
      if (encontrada) return encontrada
      return {
        ...criarRegraPadrao(cenario),
        perfil_id: id,
      }
    })

    return {
      ...perfil,
      regras: regrasCompletas,
    }
  } catch (err) {
    console.error('Erro ao obter perfil tributário completo:', err)
    return null
  }
}

export async function salvarPerfilTributarioCompleto(dados: {
  id?: string
  nome: string
  descricao?: string
  regime: RegimePerfilTributario
  origem_padrao?: string
  tipo_item_sped_padrao?: string
  c_benef?: string
  ativo?: boolean
  regras: PerfilTributarioRegra[]
}): Promise<PerfilTributario> {
  const nomeLimpo = dados.nome.trim()
  if (!nomeLimpo) {
    throw new Error('O nome do perfil tributário é obrigatório.')
  }

  // Validação de unicidade de nome
  const dupNome = await pb.collection('perfis_tributarios').getList<PerfilTributario>(1, 1, {
    filter: dados.id
      ? `nome = '${nomeLimpo.replace(/'/g, "\\'")}' && id != '${dados.id}'`
      : `nome = '${nomeLimpo.replace(/'/g, "\\'")}'`,
  })
  if (dupNome.totalItems > 0) {
    throw new Error(`Já existe um perfil tributário com o nome "${nomeLimpo}".`)
  }

  // Prepara payload do cabeçalho
  const payloadCabecalho = {
    nome: nomeLimpo,
    descricao: dados.descricao?.trim() || '',
    regime: dados.regime,
    origem_padrao: dados.origem_padrao?.trim() || '',
    tipo_item_sped_padrao: dados.tipo_item_sped_padrao?.trim() || '',
    c_benef: dados.c_benef?.trim() || '',
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let perfilSalvo: PerfilTributario
  const ehNovo = !dados.id
  let antes: PerfilTributarioCompleto | null = null

  if (!ehNovo && dados.id) {
    antes = await obterPerfilTributarioCompleto(dados.id)
    perfilSalvo = await pb
      .collection('perfis_tributarios')
      .update<PerfilTributario>(dados.id, payloadCabecalho)
  } else {
    perfilSalvo = await pb.collection('perfis_tributarios').create<PerfilTributario>({
      ...payloadCabecalho,
      created_by: pb.authStore.record?.id || null,
    })
  }

  // Salvar / sincronizar as regras dos 8 cenários
  const regrasExistentes =
    !ehNovo && dados.id
      ? await pb.collection('perfis_tributarios_regras').getFullList<PerfilTributarioRegra>({
          filter: `perfil_id = '${dados.id}'`,
        })
      : []

  for (const cenario of CENARIOS_PERFIL) {
    const dadosRegra = dados.regras.find((r) => r.cenario === cenario) || criarRegraPadrao(cenario)
    const existente = regrasExistentes.find((r) => r.cenario === cenario)

    const payloadRegra = {
      perfil_id: perfilSalvo.id,
      cenario,
      ativo: dadosRegra.ativo !== undefined ? dadosRegra.ativo : true,
      cfop: dadosRegra.cfop?.trim() || null,

      // ICMS
      cst_icms: dados.regime === 'Regime Normal' ? dadosRegra.cst_icms?.trim() || '' : '',
      csosn: dados.regime === 'Simples Nacional' ? dadosRegra.csosn?.trim() || '' : '',
      mod_bc_icms: dadosRegra.mod_bc_icms?.trim() || '',
      aliquota_icms:
        dadosRegra.aliquota_icms !== null && dadosRegra.aliquota_icms !== undefined
          ? Number(dadosRegra.aliquota_icms)
          : null,
      reducao_bc_icms_percentual:
        dadosRegra.reducao_bc_icms_percentual !== null &&
        dadosRegra.reducao_bc_icms_percentual !== undefined
          ? Number(dadosRegra.reducao_bc_icms_percentual)
          : null,
      aliquota_fcp:
        dadosRegra.aliquota_fcp !== null && dadosRegra.aliquota_fcp !== undefined
          ? Number(dadosRegra.aliquota_fcp)
          : null,

      // ICMS ST
      mod_bc_icms_st: dadosRegra.mod_bc_icms_st?.trim() || '',
      mva_percentual:
        dadosRegra.mva_percentual !== null && dadosRegra.mva_percentual !== undefined
          ? Number(dadosRegra.mva_percentual)
          : null,
      reducao_bc_icms_st_percentual:
        dadosRegra.reducao_bc_icms_st_percentual !== null &&
        dadosRegra.reducao_bc_icms_st_percentual !== undefined
          ? Number(dadosRegra.reducao_bc_icms_st_percentual)
          : null,
      aliquota_icms_st:
        dadosRegra.aliquota_icms_st !== null && dadosRegra.aliquota_icms_st !== undefined
          ? Number(dadosRegra.aliquota_icms_st)
          : null,
      aliquota_fcp_st:
        dadosRegra.aliquota_fcp_st !== null && dadosRegra.aliquota_fcp_st !== undefined
          ? Number(dadosRegra.aliquota_fcp_st)
          : null,

      // Diferimento e desoneração
      percentual_diferimento:
        dadosRegra.percentual_diferimento !== null &&
        dadosRegra.percentual_diferimento !== undefined
          ? Number(dadosRegra.percentual_diferimento)
          : null,
      motivo_desoneracao: dadosRegra.motivo_desoneracao?.trim() || '',

      // IPI
      cst_ipi: dadosRegra.cst_ipi?.trim() || '',
      codigo_enquadramento_ipi: dadosRegra.codigo_enquadramento_ipi?.trim() || '999',
      aliquota_ipi:
        dadosRegra.aliquota_ipi !== null && dadosRegra.aliquota_ipi !== undefined
          ? Number(dadosRegra.aliquota_ipi)
          : null,

      // PIS
      cst_pis: dadosRegra.cst_pis?.trim() || '',
      aliquota_pis:
        dadosRegra.aliquota_pis !== null && dadosRegra.aliquota_pis !== undefined
          ? Number(dadosRegra.aliquota_pis)
          : null,

      // COFINS
      cst_cofins: dadosRegra.cst_cofins?.trim() || '',
      aliquota_cofins:
        dadosRegra.aliquota_cofins !== null && dadosRegra.aliquota_cofins !== undefined
          ? Number(dadosRegra.aliquota_cofins)
          : null,

      // Natureza receita
      natureza_receita_pis_cofins: dadosRegra.natureza_receita_pis_cofins?.trim() || '',

      // IBS / CBS
      cst_ibs_cbs: dadosRegra.cst_ibs_cbs?.trim() || '',
      c_class_trib: dadosRegra.c_class_trib?.trim() || '',
      aliquota_ibs_uf:
        dadosRegra.aliquota_ibs_uf !== null && dadosRegra.aliquota_ibs_uf !== undefined
          ? Number(dadosRegra.aliquota_ibs_uf)
          : null,
      aliquota_ibs_municipio:
        dadosRegra.aliquota_ibs_municipio !== null &&
        dadosRegra.aliquota_ibs_municipio !== undefined
          ? Number(dadosRegra.aliquota_ibs_municipio)
          : null,
      aliquota_cbs:
        dadosRegra.aliquota_cbs !== null && dadosRegra.aliquota_cbs !== undefined
          ? Number(dadosRegra.aliquota_cbs)
          : null,
      reducao_ibs_cbs_percentual:
        dadosRegra.reducao_ibs_cbs_percentual !== null &&
        dadosRegra.reducao_ibs_cbs_percentual !== undefined
          ? Number(dadosRegra.reducao_ibs_cbs_percentual)
          : null,

      observacao_fiscal: dadosRegra.observacao_fiscal?.trim() || '',
      updated_by: pb.authStore.record?.id || null,
    }

    if (existente) {
      await pb.collection('perfis_tributarios_regras').update(existente.id as string, payloadRegra)
    } else {
      await pb.collection('perfis_tributarios_regras').create({
        ...payloadRegra,
        created_by: pb.authStore.record?.id || null,
      })
    }
  }

  // Registrar auditoria
  const depois = await obterPerfilTributarioCompleto(perfilSalvo.id)
  await registrarAuditoria({
    tabela: 'perfis_tributarios',
    registro_id: perfilSalvo.id,
    acao: ehNovo ? 'inclusao' : 'alteracao',
    valores_antes: antes ? (antes as unknown as Record<string, unknown>) : undefined,
    valores_depois: depois ? (depois as unknown as Record<string, unknown>) : undefined,
  })

  return perfilSalvo
}

export async function inativarPerfilTributario(id: string): Promise<void> {
  const antes = await obterPerfilTributarioCompleto(id)
  const atualizado = await pb.collection('perfis_tributarios').update<PerfilTributario>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'perfis_tributarios',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes ? (antes as unknown as Record<string, unknown>) : undefined,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarPerfilTributario(id: string): Promise<void> {
  const antes = await obterPerfilTributarioCompleto(id)
  const atualizado = await pb.collection('perfis_tributarios').update<PerfilTributario>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'perfis_tributarios',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes ? (antes as unknown as Record<string, unknown>) : undefined,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function duplicarPerfilTributario(
  idOrigem: string,
  novoNome: string,
): Promise<PerfilTributarioCompleto> {
  const origem = await obterPerfilTributarioCompleto(idOrigem)
  if (!origem) {
    throw new Error('Perfil de origem não encontrado.')
  }

  const regrasCopiadas = origem.regras.map((r) => ({
    ...r,
    id: undefined,
    perfil_id: undefined,
    created: undefined,
    updated: undefined,
    created_by: undefined,
    updated_by: undefined,
  }))

  const salvo = await salvarPerfilTributarioCompleto({
    nome: novoNome.trim(),
    descricao: origem.descricao ? `${origem.descricao} (Cópia)` : 'Cópia de perfil tributário',
    regime: origem.regime,
    origem_padrao: origem.origem_padrao,
    tipo_item_sped_padrao: origem.tipo_item_sped_padrao,
    c_benef: origem.c_benef,
    ativo: true,
    regras: regrasCopiadas,
  })

  const completo = await obterPerfilTributarioCompleto(salvo.id)
  if (!completo) {
    throw new Error('Falha ao carregar o perfil duplicado.')
  }
  return completo
}
