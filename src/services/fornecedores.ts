import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from './auditoria'
import { validarCPF, validarCNPJ, validarInscricaoEstadual } from '@/lib/validacoes'

export type TipoPessoaFornecedor = 'Física' | 'Jurídica' | 'Estrangeiro'
export type IndicadorIeFornecedor = '1' | '2' | '9'
export type CrtFornecedor = '1' | '2' | '3' | '4'
export type TipoFornecedor =
  | 'Mercadorias'
  | 'Serviços'
  | 'Transportadora'
  | 'Uso e consumo'
  | 'Outros'

export type TipoContaBancaria = 'Corrente' | 'Poupança'
export type TipoChavePix = 'CPF/CNPJ' | 'E-mail' | 'Telefone' | 'Chave aleatória'

export interface Fornecedor {
  id: string
  ativo: boolean
  codigo: number
  tipo_pessoa: TipoPessoaFornecedor
  cpf_cnpj?: string
  id_estrangeiro?: string
  razao_social: string
  nome_fantasia?: string
  indicador_ie: IndicadorIeFornecedor
  inscricao_estadual?: string
  inscricao_municipal?: string
  inscricao_suframa?: string
  crt_fornecedor?: CrtFornecedor
  tipo_fornecedor?: TipoFornecedor[]
  produtor_rural?: boolean

  // Endereço
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  codigo_municipio_ibge?: string
  uf?: string
  codigo_pais?: string
  pais?: string

  // Contato
  telefone?: string
  celular?: string
  email?: string
  email_financeiro?: string
  site?: string
  contato_nome?: string
  contato_cargo?: string
  contato_telefone?: string

  // Comercial
  prazo_entrega_dias?: number
  condicao_pagamento_padrao?: string
  pedido_minimo?: number
  representante_nome?: string
  representante_telefone?: string
  representante_email?: string

  // Dados bancários
  banco_codigo?: string
  banco_nome?: string
  agencia?: string
  conta?: string
  tipo_conta?: TipoContaBancaria
  titular?: string
  cpf_cnpj_titular?: string
  pix_tipo?: TipoChavePix
  pix_chave?: string

  // Outros
  observacoes?: string

  // Metadados padrão
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
}

export interface ListarFornecedoresParams {
  pagina?: number
  porPagina?: number
  busca?: string
  tipo_pessoa?: string
  uf?: string
  crt_fornecedor?: string
  tipo_fornecedor?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
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
 * Normaliza CPF/CNPJ para persistência, busca e validação (apenas caracteres alfanuméricos em caixa alta)
 */
export function normalizarCpfCnpj(valor?: string): string {
  if (!valor) return ''
  return valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/**
 * Retorna o próximo código sequencial para fornecedor
 */
export async function obterProximoCodigoFornecedor(): Promise<number> {
  try {
    const res = await pb.collection('fornecedores').getList(1, 1, {
      sort: '-codigo',
    })
    if (res.items.length > 0) {
      const maior = (res.items[0] as unknown as { codigo?: number }).codigo || 0
      return Number(maior) + 1
    }
    return 1
  } catch (_) {
    return 1
  }
}

/**
 * Valida dados obrigatórios e regras tributárias de um fornecedor
 */
export function validarDadosFornecedor(dados: Partial<Fornecedor>): {
  valido: boolean
  erros: Record<string, string>
} {
  const erros: Record<string, string> = {}

  if (!dados.tipo_pessoa) {
    erros.tipo_pessoa = 'O tipo de pessoa é obrigatório.'
  }

  const razao = (dados.razao_social || '').trim()
  if (!razao) {
    erros.razao_social = 'A razão social é obrigatória.'
  } else if (razao.length > 60) {
    erros.razao_social = 'A razão social pode ter no máximo 60 caracteres.'
  }

  if (dados.nome_fantasia && dados.nome_fantasia.length > 60) {
    erros.nome_fantasia = 'O nome fantasia pode ter no máximo 60 caracteres.'
  }

  const docLimpo = normalizarCpfCnpj(dados.cpf_cnpj)

  if (dados.tipo_pessoa === 'Física') {
    if (!docLimpo) {
      erros.cpf_cnpj = 'O CPF é obrigatório para Pessoa Física.'
    } else if (!validarCPF(docLimpo)) {
      erros.cpf_cnpj = 'CPF inválido. Verifique os dígitos.'
    }
  } else if (dados.tipo_pessoa === 'Jurídica') {
    if (!docLimpo) {
      erros.cpf_cnpj = 'O CNPJ é obrigatório para Pessoa Jurídica.'
    } else if (!validarCNPJ(docLimpo)) {
      erros.cpf_cnpj = 'CNPJ inválido. Verifique os números ou caracteres.'
    }
  } else if (dados.tipo_pessoa === 'Estrangeiro') {
    if (!dados.id_estrangeiro || !dados.id_estrangeiro.trim()) {
      erros.id_estrangeiro = 'O documento do estrangeiro é obrigatório.'
    }
  }

  // Indicador de IE
  if (!dados.indicador_ie) {
    erros.indicador_ie = 'O indicador de Inscrição Estadual é obrigatório.'
  } else if (dados.indicador_ie === '1') {
    const ie = (dados.inscricao_estadual || '').trim()
    if (!ie) {
      erros.inscricao_estadual = 'Inscrição Estadual é obrigatória para Contribuinte ICMS.'
    } else {
      const uf = (dados.uf || '').toUpperCase()
      const checagemIe = validarInscricaoEstadual(ie, uf)
      if (!checagemIe.valido) {
        erros.inscricao_estadual = checagemIe.mensagem || 'Inscrição Estadual inválida.'
      }
    }
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
  }
}

/**
 * Busca fornecedor por CPF/CNPJ (ativo ou inativo)
 */
export async function buscarFornecedorPorCpfCnpj(
  cpfCnpj: string,
  ignorarId?: string,
): Promise<{ ativo?: Fornecedor | null; inativo?: Fornecedor | null }> {
  const limpo = normalizarCpfCnpj(cpfCnpj)
  if (!limpo) return { ativo: null, inativo: null }

  try {
    const records = await pb.collection('fornecedores').getFullList<Fornecedor>({
      filter: `cpf_cnpj = "${limpo}"`,
    })

    const filtrados = ignorarId ? records.filter((r) => r.id !== ignorarId) : records
    const fornecedorAtivo = filtrados.find((r) => r.ativo) || null
    const fornecedorInativo = filtrados.find((r) => !r.ativo) || null

    return {
      ativo: fornecedorAtivo,
      inativo: fornecedorInativo,
    }
  } catch (err) {
    console.error('Erro ao buscar fornecedor por CPF/CNPJ:', err)
    return { ativo: null, inativo: null }
  }
}

/**
 * Lista fornecedores com busca, filtros, paginação (20 padrão) e ordenação
 */
export async function listarFornecedores(
  params: ListarFornecedoresParams = {},
): Promise<ResultadoPaginado<Fornecedor>> {
  const {
    pagina = 1,
    porPagina = 20,
    busca = '',
    tipo_pessoa = 'todos',
    uf = 'todos',
    crt_fornecedor = 'todos',
    tipo_fornecedor = 'todos',
    situacao = 'ativos',
    ordenarPor = 'codigo',
    ordem = 'desc',
  } = params

  const filters: string[] = []

  if (situacao === 'ativos') {
    filters.push('ativo = true')
  } else if (situacao === 'inativos') {
    filters.push('ativo = false')
  }

  if (tipo_pessoa && tipo_pessoa !== 'todos') {
    filters.push(`tipo_pessoa = "${tipo_pessoa}"`)
  }

  if (uf && uf !== 'todos') {
    filters.push(`uf = "${uf.toUpperCase()}"`)
  }

  if (crt_fornecedor && crt_fornecedor !== 'todos') {
    filters.push(`crt_fornecedor = "${crt_fornecedor}"`)
  }

  if (tipo_fornecedor && tipo_fornecedor !== 'todos') {
    // campo tipo_fornecedor pode ser multiseleção (select múltiplo)
    filters.push(`tipo_fornecedor ?~ "${tipo_fornecedor}"`)
  }

  if (busca && busca.trim()) {
    const termo = busca.trim().replace(/['"]/g, '')
    const termoLimpo = normalizarCpfCnpj(termo)
    const subConds: string[] = [
      `razao_social ~ "${termo}"`,
      `nome_fantasia ~ "${termo}"`,
      `municipio ~ "${termo}"`,
      `telefone ~ "${termo}"`,
      `celular ~ "${termo}"`,
      `email ~ "${termo}"`,
    ]
    if (termoLimpo) {
      subConds.push(`cpf_cnpj ~ "${termoLimpo}"`)
    }
    const numeroBusca = parseInt(termo, 10)
    if (!Number.isNaN(numeroBusca)) {
      subConds.push(`codigo = ${numeroBusca}`)
    }
    filters.push(`(${subConds.join(' || ')})`)
  }

  const sortPrefix = ordem === 'desc' ? '-' : ''
  const sort = `${sortPrefix}${ordenarPor}`

  const res = await pb.collection('fornecedores').getList<Fornecedor>(pagina, porPagina, {
    filter: filters.length > 0 ? filters.join(' && ') : '',
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
 * Busca fornecedor por ID
 */
export async function obterFornecedorPorId(id: string): Promise<Fornecedor> {
  return await pb.collection('fornecedores').getOne<Fornecedor>(id)
}

/**
 * Retorna todos os fornecedores ativos para componentes de seleção (<SelectFornecedor />)
 */
export async function listarTodosFornecedoresAtivos(
  filtroTipo?: TipoFornecedor,
): Promise<Fornecedor[]> {
  try {
    const condicoes = ['ativo = true']
    if (filtroTipo) {
      condicoes.push(`tipo_fornecedor ?~ "${filtroTipo}"`)
    }

    return await pb.collection('fornecedores').getFullList<Fornecedor>({
      filter: condicoes.join(' && '),
      sort: 'razao_social',
    })
  } catch (err) {
    console.error('Erro ao listar fornecedores ativos:', err)
    return []
  }
}

/**
 * Salva fornecedor (criação ou atualização) com auditoria em logs_auditoria
 */
export async function salvarFornecedor(dados: Partial<Fornecedor>): Promise<Fornecedor> {
  const user = pb.authStore.record
  const ehNovo = !dados.id

  const docLimpo = normalizarCpfCnpj(dados.cpf_cnpj)

  // Validação dos dados
  const checagem = validarDadosFornecedor(dados)
  if (!checagem.valido) {
    const primeiroErro = Object.values(checagem.erros)[0]
    throw new Error(primeiroErro)
  }

  // Validação de unicidade entre fornecedores ATIVOS
  if (docLimpo && dados.tipo_pessoa !== 'Estrangeiro') {
    const existencia = await buscarFornecedorPorCpfCnpj(docLimpo, dados.id)
    if (existencia.ativo) {
      throw new Error(
        `Já existe um fornecedor ativo cadastrado com este documento: ${existencia.ativo.razao_social} (Código ${existencia.ativo.codigo}).`,
      )
    }
  }

  let codigo = dados.codigo
  if (ehNovo && !codigo) {
    codigo = await obterProximoCodigoFornecedor()
  }

  const payload: Record<string, unknown> = {
    ...dados,
    codigo,
    cpf_cnpj: docLimpo || dados.cpf_cnpj || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  // Sanitização de valores numéricos / opcionais
  if (payload.prazo_entrega_dias === '' || payload.prazo_entrega_dias === undefined) {
    payload.prazo_entrega_dias = null
  }
  if (payload.pedido_minimo === '' || payload.pedido_minimo === undefined) {
    payload.pedido_minimo = null
  }
  if (!payload.crt_fornecedor) {
    payload.crt_fornecedor = null
  }
  if (!payload.tipo_conta) {
    payload.tipo_conta = null
  }
  if (!payload.pix_tipo) {
    payload.pix_tipo = null
  }

  let fornecedorGravado: Fornecedor
  let registroAntes: Fornecedor | null = null

  if (ehNovo) {
    payload.created_by = user?.id || null
    fornecedorGravado = await pb.collection('fornecedores').create<Fornecedor>(payload)

    await registrarAuditoria({
      tabela: 'fornecedores',
      registro_id: fornecedorGravado.id,
      acao: 'inclusao',
      valores_antes: null,
      valores_depois: fornecedorGravado as unknown as Record<string, unknown>,
    })
  } else {
    registroAntes = await obterFornecedorPorId(dados.id!)
    fornecedorGravado = await pb.collection('fornecedores').update<Fornecedor>(dados.id!, payload)

    await registrarAuditoria({
      tabela: 'fornecedores',
      registro_id: fornecedorGravado.id,
      acao: 'alteracao',
      valores_antes: registroAntes as unknown as Record<string, unknown>,
      valores_depois: fornecedorGravado as unknown as Record<string, unknown>,
    })
  }

  return fornecedorGravado
}

/**
 * Inativa fornecedor com auditoria em logs_auditoria
 */
export async function inativarFornecedor(id: string): Promise<Fornecedor> {
  const registroAntes = await obterFornecedorPorId(id)
  const user = pb.authStore.record

  const atualizado = await pb.collection('fornecedores').update<Fornecedor>(id, {
    ativo: false,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'fornecedores',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

/**
 * Reativa fornecedor com auditoria em logs_auditoria e checagem de documento
 */
export async function ativarFornecedor(id: string): Promise<Fornecedor> {
  const registroAntes = await obterFornecedorPorId(id)

  const docLimpo = normalizarCpfCnpj(registroAntes.cpf_cnpj)
  if (docLimpo && registroAntes.tipo_pessoa !== 'Estrangeiro') {
    const existencia = await buscarFornecedorPorCpfCnpj(docLimpo, id)
    if (existencia.ativo) {
      throw new Error(
        `Não é possível reativar: já existe outro fornecedor ativo com este mesmo documento (${existencia.ativo.razao_social}, Código ${existencia.ativo.codigo}).`,
      )
    }
  }

  const user = pb.authStore.record
  const atualizado = await pb.collection('fornecedores').update<Fornecedor>(id, {
    ativo: true,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'fornecedores',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}
