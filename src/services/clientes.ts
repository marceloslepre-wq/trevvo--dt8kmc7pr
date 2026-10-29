import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from './auditoria'
import { validarCPF, validarCNPJ, validarInscricaoEstadual } from '@/lib/validacoes'
import { obterUsuarioCacheLocal } from './usuarios'

export type TipoPessoaCliente = 'Física' | 'Jurídica' | 'Estrangeiro'
export type IndicadorIeCliente = '1' | '2' | '9'
export type RegimeTributarioCliente = '1' | '2' | '3' | '4'

export interface Cliente {
  id: string
  ativo: boolean
  codigo: number
  tipo_pessoa: TipoPessoaCliente
  cpf_cnpj?: string
  id_estrangeiro?: string
  nome_razao_social: string
  nome?: string
  razao_social?: string
  nome_fantasia?: string
  rg?: string
  data_nascimento?: string
  indicador_ie: IndicadorIeCliente
  inscricao_estadual?: string
  inscricao_municipal?: string
  inscricao_suframa?: string
  consumidor_final: boolean
  regime_tributario_cliente?: RegimeTributarioCliente

  // Endereço principal
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

  // Endereço de entrega
  entrega_mesmo_endereco?: boolean
  entrega_cep?: string
  entrega_logradouro?: string
  entrega_numero?: string
  entrega_complemento?: string
  entrega_bairro?: string
  entrega_municipio?: string
  entrega_codigo_municipio_ibge?: string
  entrega_uf?: string

  // Contato
  telefone?: string
  celular?: string
  whatsapp?: boolean
  email?: string
  email_nfe?: string
  contato_nome?: string

  // Comercial
  vendedor_id?: string
  condicao_pagamento_id?: string
  limite_credito?: number
  dia_vencimento_preferencial?: number
  condicao_pagamento_padrao?: string
  desconto_padrao_percentual?: number
  bloqueado?: boolean
  motivo_bloqueio?: string
  observacoes?: string
  observacao_nota?: string

  // Metadados
  assinante_id?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string

  // Expand
  expand?: {
    vendedor_id?: {
      id: string
      nome: string
      email: string
    }
  }
}

export interface ListarClientesParams {
  pagina?: number
  porPagina?: number
  busca?: string
  tipo_pessoa?: string
  uf?: string
  municipio?: string
  vendedor_id?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  ativo?: boolean
  bloqueado?: 'todos' | 'sim' | 'nao'
  ordenarPor?: string
  ordem?: 'asc' | 'desc'
  sort?: string
  assinante_id?: string
}

export interface ResultadoPaginado<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

/**
 * Normaliza CPF/CNPJ para busca e validação (apenas caracteres alfanuméricos em caixa alta)
 */
export function normalizarCpfCnpj(valor?: string): string {
  if (!valor) return ''
  return valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/**
 * Valida os dados tributários e de identificação de um cliente
 */
export function validarDadosCliente(
  dados: Partial<Cliente>,
  opcoes?: { permitirMesmoId?: string },
): { valido: boolean; erros: Record<string, string> } {
  const erros: Record<string, string> = {}

  if (!dados.tipo_pessoa) {
    erros.tipo_pessoa = 'O tipo de pessoa é obrigatório.'
  }

  const nomeRazao = (dados.nome_razao_social || '').trim()
  if (!nomeRazao) {
    erros.nome_razao_social = 'O nome ou razão social é obrigatório.'
  } else if (nomeRazao.length > 60) {
    erros.nome_razao_social = 'O nome ou razão social pode ter no máximo 60 caracteres.'
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

  // Se bloqueado, exigir motivo
  if (dados.bloqueado && (!dados.motivo_bloqueio || !dados.motivo_bloqueio.trim())) {
    erros.motivo_bloqueio = 'Informe o motivo do bloqueio de vendas.'
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
  }
}

/**
 * Verifica se já existe cliente com o mesmo CPF/CNPJ (ativo ou inativo)
 */
export async function buscarClientePorCpfCnpj(
  cpfCnpj: string,
  ignorarId?: string,
  assinanteId?: string,
): Promise<{ ativo?: Cliente | null; inativo?: Cliente | null }> {
  const limpo = normalizarCpfCnpj(cpfCnpj)
  if (!limpo) return { ativo: null, inativo: null }

  try {
    const conds = [`cpf_cnpj = "${limpo}"`]
    if (assinanteId) {
      conds.push(`assinante_id = '${assinanteId}'`)
    }
    const records = await pb.collection('clientes').getFullList<Cliente>({
      filter: conds.join(' && '),
    })

    const filtrados = ignorarId ? records.filter((r) => r.id !== ignorarId) : records
    const clienteAtivo = filtrados.find((r) => r.ativo) || null
    const clienteInativo = filtrados.find((r) => !r.ativo) || null

    return {
      ativo: clienteAtivo,
      inativo: clienteInativo,
    }
  } catch (err) {
    console.error('Erro ao buscar cliente por CPF/CNPJ:', err)
    return { ativo: null, inativo: null }
  }
}

/**
 * Lista clientes com suporte a filtros, busca textual, ordenação e paginação (padrão ERP)
 */
export async function listarClientes(
  params: ListarClientesParams = {},
): Promise<ResultadoPaginado<Cliente>> {
  const {
    pagina = 1,
    porPagina = 20,
    busca = '',
    tipo_pessoa = 'todos',
    uf = 'todos',
    municipio = '',
    vendedor_id = 'todos',
    situacao = 'ativos',
    bloqueado = 'todos',
    ordenarPor = 'codigo',
    ordem = 'desc',
  } = params

  const filters: string[] = []

  if (params.assinante_id) {
    filters.push(`assinante_id = '${params.assinante_id}'`)
  }

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

  if (municipio && municipio.trim()) {
    filters.push(`municipio ~ "${municipio.trim().replace(/['"]/g, '')}"`)
  }

  if (vendedor_id && vendedor_id !== 'todos') {
    filters.push(`vendedor_id = "${vendedor_id}"`)
  }

  if (bloqueado === 'sim') {
    filters.push('bloqueado = true')
  } else if (bloqueado === 'nao') {
    filters.push('bloqueado = false')
  }

  if (busca && busca.trim()) {
    const termo = busca.trim().replace(/['"]/g, '')
    const termoLimpo = normalizarCpfCnpj(termo)
    const subConds: string[] = [
      `nome_razao_social ~ "${termo}"`,
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

  const res = await pb.collection('clientes').getList<Cliente>(pagina, porPagina, {
    filter: filters.length > 0 ? filters.join(' && ') : '',
    sort,
    expand: 'vendedor_id',
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
 * Busca cliente por ID
 */
export async function obterClientePorId(id: string): Promise<Cliente> {
  return await pb.collection('clientes').getOne<Cliente>(id, {
    expand: 'vendedor_id',
  })
}

/**
 * Lista usuários que são vendedores ativos para seleção no comercial
 */
export async function listarVendedoresAtivos(
  assinanteId?: string,
): Promise<Array<{ id: string; nome: string }>> {
  try {
    const conds = ['e_vendedor = true && ativo = true']
    if (assinanteId) {
      conds.push(`assinante_id = '${assinanteId}'`)
    }
    const res = await pb.collection('usuarios').getFullList<{ id: string; nome: string }>({
      filter: conds.join(' && '),
      sort: 'nome',
    })
    return res
  } catch (err) {
    console.warn('Erro ao listar vendedores:', err)
    return []
  }
}

/**
 * Salva cliente (cria ou atualiza) com validações e registro de auditoria
 */
export async function salvarCliente(dados: Partial<Cliente>): Promise<Cliente> {
  const user = pb.authStore.record
  const ehNovo = !dados.id

  const docLimpo = normalizarCpfCnpj(dados.cpf_cnpj)

  // Validação de negócio
  const checagem = validarDadosCliente(dados)
  if (!checagem.valido) {
    const primeiroErro = Object.values(checagem.erros)[0]
    throw new Error(primeiroErro)
  }

  // Validação de duplicidade de CPF/CNPJ entre clientes ATIVOS
  if (docLimpo && dados.tipo_pessoa !== 'Estrangeiro') {
    const existencia = await buscarClientePorCpfCnpj(docLimpo, dados.id)
    if (existencia.ativo) {
      throw new Error(
        `Já existe um cliente ativo cadastrado com este documento: ${existencia.ativo.nome_razao_social} (Código ${existencia.ativo.codigo}).`,
      )
    }
  }

  // Código sequencial gerado pelo backend se não informado
  const payload: Record<string, unknown> = {
    ...dados,
    codigo: dados.codigo || null,
    cpf_cnpj: docLimpo || dados.cpf_cnpj || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_by: user?.id || null,
  }

  // Sanitização de campos numéricos / selects opcionais
  if (!payload.condicao_pagamento_id) {
    payload.condicao_pagamento_id = null
  }
  if (payload.limite_credito === '' || payload.limite_credito === undefined) {
    payload.limite_credito = null
  }
  if (
    payload.dia_vencimento_preferencial === '' ||
    payload.dia_vencimento_preferencial === undefined
  ) {
    payload.dia_vencimento_preferencial = null
  }
  if (
    payload.desconto_padrao_percentual === '' ||
    payload.desconto_padrao_percentual === undefined
  ) {
    payload.desconto_padrao_percentual = null
  }
  if (!payload.regime_tributario_cliente) {
    payload.regime_tributario_cliente = null
  }
  if (!payload.vendedor_id) {
    payload.vendedor_id = null
  }

  let clienteGravado: Cliente
  let registroAntes: Cliente | null = null

  const authRecord = user as { assinante_id?: string; id?: string; email?: string } | null
  const assinanteIdAtivo =
    dados.assinante_id ||
    authRecord?.assinante_id ||
    obterUsuarioCacheLocal(user?.id || authRecord?.email)?.assinante_id ||
    null

  if (ehNovo) {
    // No create, a regra exige assinante_id = @request.auth.assinante_id
    payload.assinante_id = assinanteIdAtivo
    payload.created_by = user?.id || null

    delete payload.id
    delete (payload as Record<string, unknown>).collectionId
    delete (payload as Record<string, unknown>).collectionName
    delete (payload as Record<string, unknown>).created
    delete (payload as Record<string, unknown>).updated
    delete (payload as Record<string, unknown>).expand

    clienteGravado = await pb.collection('clientes').create<Cliente>(payload)

    await registrarAuditoria({
      tabela: 'clientes',
      registro_id: clienteGravado.id,
      acao: 'inclusao',
      valores_antes: null,
      valores_depois: clienteGravado as unknown as Record<string, unknown>,
    })
  } else {
    registroAntes = await obterClientePorId(dados.id!)

    // Sanitizar payload no update: remover assinante_id (a regra exige @request.body.assinante_id:isset = false)
    // e campos de sistema imutáveis (id, collectionId, collectionName, created, updated, created_by, expand)
    const {
      assinante_id: _a,
      id: _i,
      collectionId: _c1,
      collectionName: _c2,
      created: _c,
      updated: _u,
      created_by: _cb,
      expand: _exp,
      ...payloadUpdate
    } = payload

    clienteGravado = await pb.collection('clientes').update<Cliente>(dados.id!, payloadUpdate)

    await registrarAuditoria({
      tabela: 'clientes',
      registro_id: clienteGravado.id,
      acao: 'alteracao',
      valores_antes: registroAntes as unknown as Record<string, unknown>,
      valores_depois: clienteGravado as unknown as Record<string, unknown>,
    })
  }

  return clienteGravado
}

/**
 * Inativa cliente com auditoria
 */
export async function inativarCliente(id: string): Promise<Cliente> {
  const registroAntes = await obterClientePorId(id)
  const user = pb.authStore.record

  const atualizado = await pb.collection('clientes').update<Cliente>(id, {
    ativo: false,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'clientes',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

/**
 * Reativa cliente com auditoria e verificação de duplicidade com ativo
 */
export async function ativarCliente(id: string): Promise<Cliente> {
  const registroAntes = await obterClientePorId(id)

  const docLimpo = normalizarCpfCnpj(registroAntes.cpf_cnpj)
  if (docLimpo && registroAntes.tipo_pessoa !== 'Estrangeiro') {
    const existencia = await buscarClientePorCpfCnpj(docLimpo, id)
    if (existencia.ativo) {
      throw new Error(
        `Não é possível reativar: já existe outro cliente ativo com este mesmo documento (${existencia.ativo.nome_razao_social}, Código ${existencia.ativo.codigo}).`,
      )
    }
  }

  const user = pb.authStore.record
  const atualizado = await pb.collection('clientes').update<Cliente>(id, {
    ativo: true,
    updated_by: user?.id || null,
  })

  await registrarAuditoria({
    tabela: 'clientes',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: registroAntes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

/**
 * Resposta da rota de consulta de CPF (apicpf.dev via backend Skip Cloud)
 */
export interface DadosConsultaCpf {
  sucesso: boolean
  nome?: string
  data_nascimento?: string
  mae?: string
  genero?: string
  erro?: string
  mensagem?: string
}

/**
 * Consulta CPF na rota do backend (/backend/v1/cadastros/consulta-cpf)
 */
export async function consultarCpfCliente(cpf: string): Promise<DadosConsultaCpf> {
  const limpo = normalizarCpfCnpj(cpf)
  if (!limpo || limpo.length !== 11) {
    return {
      sucesso: false,
      erro: 'cpf_invalido',
      mensagem: 'CPF deve conter 11 dígitos numéricos.',
    }
  }

  try {
    const res = await pb.send<DadosConsultaCpf>(
      `/backend/v1/cadastros/consulta-cpf?cpf=${encodeURIComponent(limpo)}`,
      {
        method: 'GET',
      },
    )
    return res
  } catch (err: unknown) {
    const errorObj = err as { status?: number; data?: DadosConsultaCpf; message?: string }
    if (errorObj?.data && typeof errorObj.data === 'object') {
      return {
        sucesso: false,
        erro: errorObj.data.erro || 'erro_consulta',
        mensagem: errorObj.data.mensagem || errorObj.message || 'Erro ao consultar CPF.',
      }
    }
    return {
      sucesso: false,
      erro: 'falha_requisicao',
      mensagem: errorObj?.message || 'Erro na comunicação com o servidor para consulta de CPF.',
    }
  }
}
