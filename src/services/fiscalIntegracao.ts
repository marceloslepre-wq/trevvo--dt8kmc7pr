import pb from '@/lib/pocketbase/client'

/**
 * SERVIÇO DE INTEGRAÇÃO FISCAL (CLIENTE)
 *
 * Faz ponte com os endpoints em /backend/v1/fiscal/* (Skip Cloud / PocketBase).
 * O token da Focus NFe NUNCA trafega no cliente ou navegador.
 */

export interface TestarConexaoResponse {
  sucesso: boolean
  message: string
  ambiente?: 'Homologação' | 'Produção'
  segredo_nome?: string
  status_code?: number | null
  dados?: any
}

export interface StatusSegredosResponse {
  sucesso: boolean
  status: Record<
    string,
    {
      segredo_nome: string
      segredo_configurado: boolean
      ambiente: 'Homologação' | 'Produção'
    }
  >
}

export interface EmissaoFiscalResponse {
  sucesso: boolean
  ambiente?: 'Homologação' | 'Produção'
  dados?: any
  message?: string
  detalhes?: any
}

export interface BaixarArquivoFiscalResponse {
  sucesso: boolean
  ambiente?: 'Homologação' | 'Produção'
  conteudo?: string
  message?: string
}

export interface EmissaoNFCeVendaResponse {
  sucesso: boolean
  status?: 'Autorizada' | 'Rejeitada'
  contingencia?: boolean
  documento_id?: string
  numero?: number
  serie?: string
  chave?: string
  protocolo?: string
  danfe_url?: string
  qrcode_url?: string
  url_consulta?: string
  ja_autorizada?: boolean
  message: string
  ref?: string
  detalhes?: any
}

export interface CancelarNFCeVendaResponse {
  sucesso: boolean
  message: string
  venda_cancelada?: boolean
  venda_cancelada_mensagem?: string
  documento_id?: string
  prazo_expirado?: boolean
  detalhes?: any
}

/**
 * Emite a NFC-e (modelo 65) pelo backend central de fiscal da venda
 */
export async function emitirNFCeVenda(params: {
  vendaId: string
  contingencia?: boolean
}): Promise<EmissaoNFCeVendaResponse> {
  return await pb.send<EmissaoNFCeVendaResponse>('/backend/v1/fiscal/emitir-nfce-venda', {
    method: 'POST',
    body: {
      venda_id: params.vendaId,
      contingencia: Boolean(params.contingencia),
    },
  })
}

/**
 * Cancela a NFC-e (modelo 65) autorizada na SEFAZ e opcionalmente cancela a venda no ERP
 */
export async function cancelarNFCeVenda(params: {
  vendaId: string
  justificativa: string
  cancelarVenda?: boolean
}): Promise<CancelarNFCeVendaResponse> {
  return await pb.send<CancelarNFCeVendaResponse>('/backend/v1/fiscal/cancelar-nfce-venda', {
    method: 'POST',
    body: {
      venda_id: params.vendaId,
      justificativa: params.justificativa,
      cancelar_venda: Boolean(params.cancelarVenda),
    },
  })
}

/**
 * Abre o DANFCe (PDF ou URL Focus) ou imprime em bobina 80mm
 */
export function imprimirDanfeUrl(danfeUrl: string) {
  if (!danfeUrl) return
  const win = window.open(danfeUrl, '_blank')
  if (win) {
    win.focus()
  }
}

/**
 * Testa a conexão com a API da Focus NFe no ambiente configurado para a empresa
 */
export async function testarConexaoFocus(empresaId: string): Promise<TestarConexaoResponse> {
  if (!empresaId) {
    throw new Error('ID da empresa é obrigatório para testar a conexão fiscal.')
  }

  try {
    const res = await pb.send<TestarConexaoResponse>('/backend/v1/fiscal/testar-conexao', {
      method: 'POST',
      body: { empresa_id: empresaId },
    })
    return res
  } catch (err: any) {
    const msg =
      err?.response?.message ||
      err?.data?.message ||
      err?.message ||
      'Falha na comunicação com o servidor de emissão fiscal.'
    return {
      sucesso: false,
      message: msg,
    }
  }
}

/**
 * Consulta a existência de segredos de ambiente no Skip Cloud para as empresas
 */
export async function obterStatusSegredosFocus(): Promise<StatusSegredosResponse> {
  try {
    const res = await pb.send<StatusSegredosResponse>('/backend/v1/fiscal/status-segredos', {
      method: 'GET',
    })
    return res
  } catch (err: any) {
    return {
      sucesso: false,
      status: {},
    }
  }
}

/**
 * Emite NFC-e síncrona
 */
export async function emitirNFCe(params: {
  empresaId: string
  ref: string
  dados: Record<string, unknown>
  formaEmissao?: string
}): Promise<EmissaoFiscalResponse> {
  return await pb.send<EmissaoFiscalResponse>('/backend/v1/fiscal/emitir-nfce', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      ref: params.ref,
      dados: params.dados,
      forma_emissao: params.formaEmissao,
    },
  })
}

/**
 * Emite NF-e assíncrona
 */
export async function emitirNFe(params: {
  empresaId: string
  ref: string
  dados: Record<string, unknown>
}): Promise<EmissaoFiscalResponse> {
  return await pb.send<EmissaoFiscalResponse>('/backend/v1/fiscal/emitir-nfe', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      ref: params.ref,
      dados: params.dados,
    },
  })
}

/**
 * Consulta documento fiscal por referência
 */
export async function consultarDocumentoFiscal(params: {
  empresaId: string
  modelo: '55' | '65'
  ref: string
}): Promise<EmissaoFiscalResponse> {
  return await pb.send<EmissaoFiscalResponse>('/backend/v1/fiscal/consultar', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      modelo: params.modelo,
      ref: params.ref,
    },
  })
}

/**
 * Cancela documento fiscal (NF-e ou NFC-e)
 */
export async function cancelarDocumentoFiscal(params: {
  empresaId: string
  modelo: '55' | '65'
  ref: string
  justificativa: string
}): Promise<EmissaoFiscalResponse> {
  return await pb.send<EmissaoFiscalResponse>('/backend/v1/fiscal/cancelar', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      modelo: params.modelo,
      ref: params.ref,
      justificativa: params.justificativa,
    },
  })
}

/**
 * Emite Carta de Correção Eletrônica (CCe) para NF-e
 */
export async function emitirCartaCorrecao(params: {
  empresaId: string
  ref: string
  correcao: string
}): Promise<EmissaoFiscalResponse> {
  return await pb.send<EmissaoFiscalResponse>('/backend/v1/fiscal/carta-correcao', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      ref: params.ref,
      correcao: params.correcao,
    },
  })
}

/**
 * Baixa arquivo fiscal retornado pela Focus NFe (XML ou DANFE)
 */
export async function baixarArquivoFiscal(params: {
  empresaId: string
  caminho: string
}): Promise<BaixarArquivoFiscalResponse> {
  return await pb.send<BaixarArquivoFiscalResponse>('/backend/v1/fiscal/baixar-arquivo', {
    method: 'POST',
    body: {
      empresa_id: params.empresaId,
      caminho: params.caminho,
    },
  })
}

export interface EmitirNFeVendaParams {
  venda_id: string
  natureza_operacao?: string
  presenca_comprador?: string
  modalidade_frete?: number
  transportadora_id?: string
  volumes_quantidade?: number
  volumes_especie?: string
  peso_bruto?: number
  peso_liquido?: number
  informacoes_complementares?: string
  tipo_intermediador?: 'proprio' | 'terceiro'
  intermediador_id?: string
  identificador_intermediador?: string
}

export interface EmitirNFeVendaResponse {
  sucesso: boolean
  status?: 'Processando' | 'Autorizada' | 'Rejeitada' | 'Denegada'
  documento_id?: string
  referencia?: string
  chave?: string
  danfe_url?: string
  message?: string
  pendencias?: string[]
  detalhes?: any
  ja_autorizada?: boolean
}

/**
 * Dispara a transmissão da NF-e (modelo 55) para a venda
 */
export async function emitirNFeVenda(
  params: EmitirNFeVendaParams,
): Promise<EmitirNFeVendaResponse> {
  return await pb.send<EmitirNFeVendaResponse>('/backend/v1/fiscal/emitir-nfe-venda', {
    method: 'POST',
    body: params,
  })
}

/**
 * Consulta a situação da NF-e na Focus NFe e atualiza no ERP
 */
export async function consultarSituacaoNFe(params: {
  documento_id?: string
  venda_id?: string
  transferencia_id?: string
}): Promise<{
  sucesso: boolean
  status: 'Autorizada' | 'Rejeitada' | 'Denegada' | 'Cancelada' | 'Processando' | 'NaoEncontrada'
  documento_id?: string
  numero?: number
  serie?: string
  chave?: string
  protocolo?: string
  danfe_url?: string
  message?: string
  status_sefaz?: string
  mensagem_sefaz?: string
  aviso?: string
  detalhes?: any
}> {
  return await pb.send('/backend/v1/fiscal/consultar-situacao-nfe', {
    method: 'POST',
    body: params,
  })
}

/**
 * Cancela a NF-e autorizada
 */
export async function cancelarNFe(params: {
  documento_id?: string
  venda_id?: string
  transferencia_id?: string
  justificativa: string
}): Promise<{
  sucesso: boolean
  message: string
  documento_id?: string
  prazo_expirado?: boolean
  detalhes?: any
}> {
  return await pb.send('/backend/v1/fiscal/cancelar-nfe', {
    method: 'POST',
    body: params,
  })
}

/**
 * Emite Carta de Correção (CC-e) para NF-e autorizada
 */
export async function emitirCartaCorrecaoNFe(params: {
  documento_id?: string
  venda_id?: string
  texto: string
}): Promise<{
  sucesso: boolean
  message: string
  carta_id?: string
  sequencia?: number
  protocolo?: string
  pdf_url?: string
  detalhes?: any
}> {
  return await pb.send('/backend/v1/fiscal/carta-correcao-nfe', {
    method: 'POST',
    body: params,
  })
}

/**
 * Envia DANFE e XML da NF-e por e-mail via Focus NFe
 */
export async function enviarEmailNFe(params: {
  documento_id?: string
  venda_id?: string
  emails: string[]
}): Promise<{
  sucesso: boolean
  message: string
  emails?: string[]
}> {
  return await pb.send('/backend/v1/fiscal/enviar-email-nfe', {
    method: 'POST',
    body: params,
  })
}

export interface RascunhoFiscalResponse {
  sucesso: boolean
  documento_id?: string
  documento?: any
  itens?: any[]
  json_focus?: any
  pendencias?: string[]
  avisos?: string[]
  message?: string
}

export interface EmitirNFeTransferenciaParams {
  transferencia_id: string
  natureza_operacao?: string
  modalidade_frete?: number
  transportadora_id?: string
  volumes_quantidade?: number
  volumes_especie?: string
  peso_bruto?: number
  peso_liquido?: number
  informacoes_complementares?: string
}

export interface EmitirNFeTransferenciaResponse {
  sucesso: boolean
  status?: 'Processando' | 'Autorizada' | 'Rejeitada' | 'Denegada'
  documento_id?: string
  referencia?: string
  numero?: string | number
  chave?: string
  message: string
  ja_autorizada?: boolean
  detalhes?: any
}

/**
 * Monta e pré-calcula os impostos do rascunho de um documento fiscal
 * Usado pelo modal de emissão de NF-e de transferência e vendas
 */
export async function montarRascunhoDocumentoFiscal(params: {
  origem: string
  origem_id?: string
  id?: string
  modelo?: string
  parametros?: Record<string, any>
}): Promise<RascunhoFiscalResponse> {
  const body: Record<string, any> = {
    origem: params.origem,
    id: params.origem_id || params.id,
    modelo: params.modelo || '55',
  }

  if (params.parametros) {
    Object.assign(body, params.parametros)
  }

  return await pb.send<RascunhoFiscalResponse>('/backend/v1/fiscal/montar-rascunho', {
    method: 'POST',
    body,
  })
}

/**
 * Dispara a transmissão da NF-e de transferência entre empresas
 */
export async function emitirNFeTransferencia(
  params: EmitirNFeTransferenciaParams,
): Promise<EmitirNFeTransferenciaResponse> {
  return await pb.send<EmitirNFeTransferenciaResponse>(
    '/backend/v1/fiscal/emitir-nfe-transferencia',
    {
      method: 'POST',
      body: params,
    },
  )
}

// Alias retrocompatível com minúscula
export const emitirNfeTransferencia = emitirNFeTransferencia

/**
 * Solicita a inutilização de numeração de NF-e ou NFC-e na SEFAZ
 */
export async function inutilizarNumeracaoFiscal(params: {
  empresa_id: string
  modelo: '55' | '65'
  serie: string
  numero_inicial: number
  numero_final: number
  justificativa: string
}): Promise<{
  sucesso: boolean
  ambiente?: string
  message?: string
  dados?: any
}> {
  return await pb.send('/backend/v1/fiscal/inutilizar', {
    method: 'POST',
    body: params,
  })
}
