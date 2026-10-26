import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from './auditoria'

export type EmpresaTipo = 'Matriz' | 'Filial'
export type RegimeApuracao = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'MEI'
export type RegimePisCofins = 'Cumulativo' | 'Não cumulativo'
export type PerfilSped = 'A' | 'B' | 'C'

export interface Empresa {
  id: string
  ativo: boolean
  created_by?: string
  updated_by?: string
  assinante_id?: string
  tipo: EmpresaTipo
  matriz_id?: string
  codigo: number
  razao_social: string
  nome_fantasia?: string
  cnpj: string
  inscricao_estadual?: string
  inscricao_estadual_st?: string
  inscricao_municipal?: string
  cnae_principal?: string
  cnaes_secundarios?: string[]
  data_abertura?: string
  logo?: string
  crt: number
  regime_apuracao?: RegimeApuracao
  regime_pis_cofins?: RegimePisCofins
  aliquota_credito_simples?: number
  contribuinte_ipi?: boolean
  indicador_atividade_sped?: number
  perfil_sped?: PerfilSped
  obrigado_efd_icms_ipi?: boolean
  permite_estoque_negativo?: boolean
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  codigo_municipio_ibge: string
  uf?: string
  codigo_pais?: string
  pais?: string
  telefone?: string
  celular?: string
  email?: string
  email_fiscal?: string
  site?: string
  responsavel_nome?: string
  responsavel_cpf?: string
  responsavel_cargo?: string
  contador_nome?: string
  contador_cpf?: string
  contador_crc?: string
  contador_cnpj_escritorio?: string
  contador_cep?: string
  contador_logradouro?: string
  contador_numero?: string
  contador_complemento?: string
  contador_bairro?: string
  contador_codigo_municipio_ibge?: string
  contador_telefone?: string
  contador_email?: string
  created?: string
  updated?: string
}

/**
 * Consulta as empresas acessíveis pelo usuário autenticado via endpoint backend
 * de governança multi-tenant (/backend/v1/empresas/acessiveis).
 */
export async function listarEmpresasAcessiveis(): Promise<Empresa[]> {
  try {
    const res = await pb.send<{ sucesso: boolean; empresas: Empresa[] }>(
      '/backend/v1/empresas/acessiveis',
      {
        method: 'GET',
      },
    )
    if (res && res.sucesso && Array.isArray(res.empresas)) {
      return res.empresas
    }
  } catch (err) {
    console.warn(
      'Falha ao consultar /backend/v1/empresas/acessiveis, aplicando fallback local:',
      err,
    )
  }
  return listarEmpresasAtivas()
}

export interface ListarEmpresasParams {
  pagina?: number
  porPagina?: number
  busca?: string
  filtroSituacao?: 'todos' | 'ativos' | 'inativos'
  filtroTipo?: 'todos' | 'Matriz' | 'Filial'
  ordenarPor?: string
  ordem?: 'asc' | 'desc'
}

export interface ResultadoPaginado<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

/**
 * Busca a matriz cadastrada (se houver).
 */
export async function obterMatriz(): Promise<Empresa | null> {
  try {
    const record = await pb.collection('empresas').getFirstListItem<Empresa>('tipo = "Matriz"')
    return record
  } catch (_) {
    return null
  }
}

/**
 * Busca a matriz ativa cadastrada (se houver).
 */
export async function obterMatrizAtiva(): Promise<Empresa | null> {
  try {
    const record = await pb
      .collection('empresas')
      .getFirstListItem<Empresa>('tipo = "Matriz" && ativo = true')
    return record
  } catch (_) {
    return null
  }
}

/**
 * Verifica quantas filiais ativas existem vinculadas a uma matriz.
 */
export async function contarFiliaisAtivas(matrizId?: string): Promise<number> {
  try {
    let filter = 'tipo = "Filial" && ativo = true'
    if (matrizId) {
      filter += ` && matriz_id = "${matrizId}"`
    }
    const res = await pb.collection('empresas').getList(1, 1, { filter })
    return res.totalItems
  } catch (_) {
    return 0
  }
}

/**
 * Lista todas as empresas ativas para o seletor global do cabeçalho.
 */
export async function listarEmpresasAtivas(): Promise<Empresa[]> {
  try {
    const records = await pb.collection('empresas').getFullList<Empresa>({
      filter: 'ativo = true',
      sort: 'codigo',
    })
    return records
  } catch (err) {
    console.error('Erro ao listar empresas ativas:', err)
    return []
  }
}

/**
 * Lista empresas para tela de listagem com filtros, busca, ordenação e paginação.
 */
export async function listarEmpresas(
  params: ListarEmpresasParams,
): Promise<ResultadoPaginado<Empresa>> {
  const {
    pagina = 1,
    porPagina = 20,
    busca = '',
    filtroSituacao = 'todos',
    filtroTipo = 'todos',
    ordenarPor = 'codigo',
    ordem = 'asc',
  } = params

  const filters: string[] = []

  if (filtroSituacao === 'ativos') {
    filters.push('ativo = true')
  } else if (filtroSituacao === 'inativos') {
    filters.push('ativo = false')
  }

  if (filtroTipo && filtroTipo !== 'todos') {
    filters.push(`tipo = "${filtroTipo}"`)
  }

  if (busca && busca.trim()) {
    const termo = busca.trim()
    filters.push(
      `(razao_social ~ "${termo}" || nome_fantasia ~ "${termo}" || cnpj ~ "${termo}" || municipio ~ "${termo}")`,
    )
  }

  const sortPrefix = ordem === 'desc' ? '-' : ''
  const sort = `${sortPrefix}${ordenarPor}`

  const res = await pb.collection('empresas').getList<Empresa>(pagina, porPagina, {
    filter: filters.join(' && '),
    sort,
  })

  return {
    items: res.items,
    page: res.page,
    perPage: res.perPage,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
  }
}

/**
 * Busca empresa por ID
 */
export async function obterEmpresaPorId(id: string): Promise<Empresa> {
  return await pb.collection('empresas').getOne<Empresa>(id)
}

/**
 * Cria nova empresa com validações de negócio e gravação de auditoria.
 */
export async function criarEmpresa(
  dados: Partial<Empresa>,
  logoFile?: File | null,
): Promise<Empresa> {
  const user = pb.authStore.record

  // Se for Matriz, validar se já existe alguma matriz no banco
  if (dados.tipo === 'Matriz') {
    const matrizExistente = await obterMatriz()
    if (matrizExistente) {
      throw new Error(
        'Já existe uma empresa Matriz cadastrada. Só pode existir uma Matriz no sistema.',
      )
    }
  }

  // Se for Filial, matriz_id é obrigatório
  if (dados.tipo === 'Filial' && !dados.matriz_id) {
    const matrizExistente = await obterMatriz()
    if (!matrizExistente) {
      throw new Error('Não é possível cadastrar uma Filial sem antes cadastrar uma Matriz.')
    }
    dados.matriz_id = matrizExistente.id
  }

  // Código sequencial gerado pelo backend se não informado
  const payload: Record<string, unknown> = {
    ...dados,
    codigo: dados.codigo || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  }

  // Se houver arquivo de logo, usar FormData
  let nova: Empresa
  if (logoFile) {
    const formData = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (typeof v === 'object' && !(v instanceof File)) {
          formData.append(k, JSON.stringify(v))
        } else {
          formData.append(k, String(v))
        }
      }
    })
    formData.append('logo', logoFile)
    nova = await pb.collection('empresas').create<Empresa>(formData)
  } else {
    nova = await pb.collection('empresas').create<Empresa>(payload)
  }

  // Auditoria
  await registrarAuditoria({
    tabela: 'empresas',
    registro_id: nova.id,
    acao: 'inclusao',
    valores_antes: null,
    valores_depois: nova as unknown as Record<string, unknown>,
  })

  return nova
}

/**
 * Atualiza empresa existente com auditoria de valores antes/depois.
 */
export async function atualizarEmpresa(
  id: string,
  dados: Partial<Empresa>,
  logoFile?: File | null,
): Promise<Empresa> {
  const user = pb.authStore.record
  const registroAntes = await obterEmpresaPorId(id)

  // Se for Matriz, não pode mudar para Filial se tiver filiais vinculadas sem matriz
  if (dados.tipo === 'Matriz' && registroAntes.tipo !== 'Matriz') {
    const matrizExistente = await obterMatriz()
    if (matrizExistente && matrizExistente.id !== id) {
      throw new Error('Já existe outra Matriz cadastrada. Só pode existir uma Matriz.')
    }
  }

  const payload: Record<string, unknown> = {
    ...dados,
    updated_by: user?.id || null,
  }

  let atualizada: Empresa
  if (logoFile) {
    const formData = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (typeof v === 'object' && !(v instanceof File)) {
          formData.append(k, JSON.stringify(v))
        } else {
          formData.append(k, String(v))
        }
      }
    })
    formData.append('logo', logoFile)
    atualizada = await pb.collection('empresas').update<Empresa>(id, formData)
  } else {
    atualizada = await pb.collection('empresas').update<Empresa>(id, payload)
  }

  await registrarAuditoria({
    tabela: 'empresas',
    registro_id: id,
    acao: 'alteracao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })

  return atualizada
}

/**
 * Alterna a situação da empresa (ativar/inativar).
 * Bloqueia inativação da Matriz se houver filiais ativas.
 */
export async function alternarSituacaoEmpresa(id: string, novoAtivo: boolean): Promise<Empresa> {
  const registroAntes = await obterEmpresaPorId(id)

  if (!novoAtivo && registroAntes.tipo === 'Matriz') {
    const filiaisAtivas = await contarFiliaisAtivas(id)
    if (filiaisAtivas > 0) {
      throw new Error(
        `Não é permitido inativar a Matriz enquanto houver ${filiaisAtivas} filial(is) ativa(s). Inative as filiais primeiro.`,
      )
    }
  }

  const user = pb.authStore.record
  const atualizada = await pb.collection('empresas').update<Empresa>(id, {
    ativo: novoAtivo,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'empresas',
    registro_id: id,
    acao: novoAtivo ? 'ativacao' : 'inativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizada as unknown as Record<string, unknown>,
  })

  return atualizada
}

/**
 * Obtém URL do arquivo de logo no PocketBase
 */
export function obterUrlLogo(empresa: Empresa): string | null {
  if (!empresa.logo) return null
  return pb.files.getURL(empresa as unknown as Record<string, unknown>, empresa.logo)
}
