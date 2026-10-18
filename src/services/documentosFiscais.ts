import pb from '@/lib/pocketbase/client'

export type ModeloDocumentoFiscal = '55' | '65'
export type OrigemDocumentoFiscal = 'Venda' | 'Devolução de venda' | 'Devolução de compra'
export type StatusDocumentoFiscal =
  | 'Rascunho'
  | 'Processando'
  | 'Autorizada'
  | 'Rejeitada'
  | 'Cancelada'
  | 'Denegada'

export interface DocumentoFiscalItemCalculado {
  id?: string
  documento_id?: string
  item: number
  produto_id?: string | null
  codigo?: string
  descricao: string
  ncm?: string
  cest?: string
  cfop?: string
  unidade?: string
  quantidade: number
  valor_unitario: number
  valor_bruto: number
  valor_desconto: number
  valor_frete: number
  valor_outras: number
  valor_total: number
  // ICMS próprio
  origem?: string
  cst_icms?: string
  csosn?: string
  mod_bc_icms?: string
  reducao_bc_icms?: number
  base_icms?: number
  aliquota_icms?: number
  valor_icms?: number
  aliquota_fcp?: number
  valor_fcp?: number
  // DIFAL
  base_icms_uf_destino?: number
  aliquota_interna_uf_destino?: number
  aliquota_interestadual?: number
  percentual_partilha?: number
  aliquota_fcp_uf_destino?: number
  valor_fcp_uf_destino?: number
  valor_icms_uf_destino?: number
  valor_icms_uf_remetente?: number
  // ST
  mod_bc_icms_st?: string
  mva?: number
  base_icms_st?: number
  aliquota_icms_st?: number
  valor_icms_st?: number
  valor_fcp_st?: number
  // IPI
  cst_ipi?: string
  codigo_enquadramento_ipi?: string
  base_ipi?: number
  aliquota_ipi?: number
  valor_ipi?: number
  // PIS/COFINS
  cst_pis?: string
  base_pis?: number
  aliquota_pis?: number
  valor_pis?: number
  cst_cofins?: string
  base_cofins?: number
  aliquota_cofins?: number
  valor_cofins?: number
  // Reforma
  cst_ibs_cbs?: string
  c_class_trib?: string
  base_ibs_cbs?: number
  aliquota_ibs_uf?: number
  aliquota_ibs_municipio?: number
  aliquota_cbs?: number
  valor_ibs?: number
  valor_cbs?: number
  // Outros
  c_benef?: string
  gtin?: string
  lote?: string
  validade?: string
  aliquota_credito_simples?: number
  valor_credito_simples?: number
}

export interface DocumentoFiscalResumo {
  id: string
  referencia: string
  empresa_id: string
  empresa_nome: string
  empresa_cnpj: string
  empresa_ie: string
  empresa_crt: number
  empresa_uf: string
  modelo: ModeloDocumentoFiscal
  status: StatusDocumentoFiscal
  ambiente: 'Homologação' | 'Produção'
  serie: string
  natureza_operacao: string
  cfop_principal: string
  destinatario_nome: string
  destinatario_cpf_cnpj: string
  destinatario_uf: string
  destinatario_ibge?: string
  valor_produtos: number
  valor_desconto: number
  valor_frete: number
  valor_outras_despesas: number
  base_icms: number
  valor_icms: number
  base_icms_st: number
  valor_icms_st: number
  valor_fcp: number
  valor_icms_uf_destino: number
  valor_fcp_uf_destino: number
  valor_ipi: number
  valor_pis: number
  valor_cofins: number
  valor_ibs: number
  valor_cbs: number
  valor_total: number
}

export interface ResultadoPrevisualizacaoNota {
  sucesso: boolean
  documento_id: string
  documento: DocumentoFiscalResumo
  itens: DocumentoFiscalItemCalculado[]
  json_focus: Record<string, unknown>
  pendencias: string[]
  avisos: string[]
  message?: string
}

/**
 * Chama o backend para montar os impostos e calcular a pré-visualização da nota fiscal
 * Salva rascunho em documentos_fiscais e documentos_fiscais_itens
 */
export async function montarDocumentoFiscal(params: {
  origem: OrigemDocumentoFiscal
  id: string
  modelo?: ModeloDocumentoFiscal
}): Promise<ResultadoPrevisualizacaoNota> {
  const token = pb.authStore.token
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  const res = await fetch(`${pb.baseUrl}/backend/v1/fiscal/montar-rascunho`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      origem: params.origem,
      id: params.id,
      modelo: params.modelo || '55',
    }),
  })

  const json = await res.json()
  if (!res.ok || !json.sucesso) {
    throw new Error(json.message || 'Erro ao calcular e montar documento fiscal.')
  }

  return json as ResultadoPrevisualizacaoNota
}

export interface DocumentoFiscalRegistro {
  id: string
  created?: string
  updated?: string
  empresa_id: string
  ambiente?: 'Homologação' | 'Produção'
  modelo: ModeloDocumentoFiscal
  status: StatusDocumentoFiscal
  origem?: OrigemDocumentoFiscal
  origem_id?: string
  venda_id?: string
  transferencia_id?: string
  devolucao_venda_id?: string
  contingencia?: boolean
  numero?: number
  serie?: string
  chave_acesso?: string
  protocolo?: string
  danfe_url?: string
  qrcode_url?: string
  url_consulta?: string
  referencia?: string
  data_emissao?: string
  data_autorizacao?: string
  valor_total?: number
  valor_produtos?: number
  valor_desconto?: number
  valor_frete?: number
  status_sefaz?: string
  mensagem_sefaz?: string
  erros?: any
  xml_arquivo?: string
  xml_cancelamento?: string
  motivo_cancelamento?: string
  data_cancelamento?: string
  destinatario_nome?: string
  destinatario_cpf_cnpj?: string
  destinatario_uf?: string
  cliente_id?: string
  cliente_nome?: string
  cliente_cpf_cnpj?: string
  json_enviado?: any
  json_retorno?: any
}

export interface DocumentoFiscalCarta {
  id: string
  documento_id: string
  sequencia: number
  texto: string
  data: string
  status: string
  protocolo?: string
  mensagem_sefaz?: string
  xml_arquivo?: string
  pdf_arquivo?: string
  pdf_url?: string
  usuario_id?: string
  created?: string
}

/**
 * Busca documento fiscal por ID
 */
export async function obterDocumentoFiscalPorId(
  id: string,
): Promise<DocumentoFiscalRegistro | null> {
  try {
    return await pb.collection('documentos_fiscais').getOne<DocumentoFiscalRegistro>(id)
  } catch (_) {
    return null
  }
}

/**
 * Busca documento fiscal de uma venda
 */
export async function obterDocumentoFiscalDaVenda(
  vendaId: string,
  modelo: ModeloDocumentoFiscal = '55',
): Promise<DocumentoFiscalRegistro | null> {
  try {
    const list = await pb.collection('documentos_fiscais').getList<DocumentoFiscalRegistro>(1, 1, {
      filter: `venda_id = '${vendaId}' && modelo = '${modelo}'`,
      sort: '-created',
    })
    return list.items[0] || null
  } catch (_) {
    return null
  }
}

/**
 * Busca documento fiscal de uma transferência
 */
export async function obterDocumentoFiscalDaTransferencia(
  transferenciaId: string,
  modelo: ModeloDocumentoFiscal = '55',
): Promise<DocumentoFiscalRegistro | null> {
  try {
    const list = await pb.collection('documentos_fiscais').getList<DocumentoFiscalRegistro>(1, 1, {
      filter: `transferencia_id = '${transferenciaId}' && modelo = '${modelo}'`,
      sort: '-created',
    })
    return list.items[0] || null
  } catch (_) {
    return null
  }
}

/**
 * Lista as Cartas de Correção de um documento fiscal
 */
export async function listarCartasCorrecao(documentoId: string): Promise<DocumentoFiscalCarta[]> {
  try {
    return await pb.collection('documentos_fiscais_cartas').getFullList<DocumentoFiscalCarta>({
      filter: `documento_id = '${documentoId}'`,
      sort: 'sequencia',
    })
  } catch (_) {
    return []
  }
}

export interface FiltrosDocumentosFiscais {
  empresaId?: string
  todasEmpresas?: boolean
  dataInicio?: string
  dataFim?: string
  modelo?: string
  status?: string
  origem?: string
  destinatario?: string
  numeroOuChave?: string
  page?: number
  perPage?: number
}

/**
 * Lista documentos fiscais com paginação e filtros refinados
 */
export async function listarDocumentosFiscaisComFiltros(filtros: FiltrosDocumentosFiscais) {
  const condicoes: string[] = []

  if (!filtros.todasEmpresas && filtros.empresaId) {
    condicoes.push(`empresa_id = '${filtros.empresaId}'`)
  }

  if (filtros.modelo && filtros.modelo !== 'todos') {
    condicoes.push(`modelo = '${filtros.modelo}'`)
  }

  if (filtros.status && filtros.status !== 'todos') {
    condicoes.push(`status = '${filtros.status}'`)
  }

  if (filtros.origem && filtros.origem !== 'todos') {
    condicoes.push(`origem = '${filtros.origem}'`)
  }

  if (filtros.dataInicio) {
    condicoes.push(`data_emissao >= '${filtros.dataInicio} 00:00:00'`)
  }

  if (filtros.dataFim) {
    condicoes.push(`data_emissao <= '${filtros.dataFim} 23:59:59'`)
  }

  if (filtros.destinatario && filtros.destinatario.trim()) {
    const termo = filtros.destinatario.trim().replace(/'/g, "\\'")
    condicoes.push(`(cliente_nome ~ '${termo}' || cliente_cpf_cnpj ~ '${termo}')`)
  }

  if (filtros.numeroOuChave && filtros.numeroOuChave.trim()) {
    const termoNum = filtros.numeroOuChave.trim().replace(/'/g, "\\'")
    const asNum = Number(termoNum)
    if (!Number.isNaN(asNum) && asNum > 0) {
      condicoes.push(
        `(numero = ${asNum} || chave_acesso ~ '${termoNum}' || referencia ~ '${termoNum}')`,
      )
    } else {
      condicoes.push(`(chave_acesso ~ '${termoNum}' || referencia ~ '${termoNum}')`)
    }
  }

  const page = filtros.page || 1
  const perPage = filtros.perPage || 30
  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  return await pb.collection('documentos_fiscais').getList<DocumentoFiscalRegistro>(page, perPage, {
    filter,
    sort: '-created',
  })
}

/**
 * Obtém a lista de documentos pendentes críticos:
 * - Rejeitados
 * - Processando há mais de 5 minutos
 */
export async function obterDocumentosCriticos(empresaId?: string, todasEmpresas?: boolean) {
  const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const condicoesEmpresa = !todasEmpresas && empresaId ? `empresa_id = '${empresaId}' && ` : ''

  const filtroRejeitados = `${condicoesEmpresa}status = 'Rejeitada'`
  const filtroProcessandoLongo = `${condicoesEmpresa}status = 'Processando' && created <= '${cincoMinutosAtras}'`

  try {
    const [rejeitados, processando] = await Promise.all([
      pb.collection('documentos_fiscais').getList<DocumentoFiscalRegistro>(1, 50, {
        filter: filtroRejeitados,
        sort: '-created',
      }),
      pb.collection('documentos_fiscais').getList<DocumentoFiscalRegistro>(1, 50, {
        filter: filtroProcessandoLongo,
        sort: '-created',
      }),
    ])

    return {
      rejeitados: rejeitados.items,
      processando: processando.items,
      total: rejeitados.totalItems + processando.totalItems,
    }
  } catch (err) {
    console.error('Erro ao buscar documentos críticos:', err)
    return {
      rejeitados: [],
      processando: [],
      total: 0,
    }
  }
}
