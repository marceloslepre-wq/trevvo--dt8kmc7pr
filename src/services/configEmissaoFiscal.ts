import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type PresencaCompradorNfe =
  | '1 Presencial'
  | '2 Internet'
  | '3 Teleatendimento'
  | '4 Entrega em domicílio'
  | '9 Outros'

export type AmbienteFiscal = 'Homologação' | 'Produção'

export interface ConfigEmissaoFiscal {
  id: string
  empresa_id: string
  provedor: string
  emite_documentos_fiscais: boolean
  codigo_token: string
  presenca_comprador_padrao_nfe: PresencaCompradorNfe
  ambiente: AmbienteFiscal
  serie_nfe: string
  serie_nfce: string
  emitir_nfce_automaticamente_no_pdv: boolean
  natureza_operacao_venda: string
  natureza_operacao_devolucao_compra: string
  natureza_operacao_devolucao_venda: string
  informacoes_complementares_padrao: string
  enviar_email_cliente: boolean
  certificado_validade?: string | null
  csc_configurado: boolean
  informar_ibs_cbs: boolean
  ultimo_teste_conexao_data?: string | null
  ultimo_teste_conexao_sucesso?: boolean | null
  ultimo_teste_conexao_mensagem?: string | null
  ativo: boolean
  created_by?: string | null
  updated_by?: string | null
  created?: string
  updated?: string
}

/**
 * Obtém ou cria a configuração fiscal de emissão da empresa com os padrões estabelecidos
 */
export async function obterOuCriarConfigEmissaoFiscal(
  empresaId: string,
): Promise<ConfigEmissaoFiscal> {
  if (!empresaId) {
    throw new Error('ID da empresa é obrigatório para carregar a configuração de emissão fiscal.')
  }

  try {
    const existente = await pb
      .collection('config_emissao_fiscal')
      .getFirstListItem<ConfigEmissaoFiscal>(`empresa_id = '${empresaId}' && ativo = true`)
    return existente
  } catch {
    // Cria novo registro com os padrões exigidos
  }

  // Verificar se a empresa tem IE vazia ou ISENTO
  let emitePadrao = true
  try {
    const emp = await pb.collection('empresas').getOne(empresaId)
    const ie = (emp.inscricao_estadual || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      emitePadrao = false
    }
  } catch {
    /* intentionally ignored */
  }

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    provedor: 'Focus NFe',
    emite_documentos_fiscais: emitePadrao,
    codigo_token: '',
    presenca_comprador_padrao_nfe: '1 Presencial',
    ambiente: 'Homologação',
    serie_nfe: '1',
    serie_nfce: '1',
    emitir_nfce_automaticamente_no_pdv: true,
    natureza_operacao_venda: 'Venda de mercadoria',
    natureza_operacao_devolucao_compra: 'Devolução de compra',
    natureza_operacao_devolucao_venda: 'Devolução de venda',
    informacoes_complementares_padrao: '',
    enviar_email_cliente: false,
    certificado_validade: null,
    csc_configurado: false,
    informar_ibs_cbs: false,
    ativo: true,
    created_by: pb.authStore.record?.id || null,
  }

  const nova = await pb.collection('config_emissao_fiscal').create<ConfigEmissaoFiscal>(payload)

  await registrarAuditoria({
    tabela: 'config_emissao_fiscal',
    registro_id: nova.id,
    empresa_id: empresaId,
    acao: 'inclusao',
    valores_depois: nova as unknown as Record<string, unknown>,
  })

  return nova
}

/**
 * Salva a configuração fiscal da empresa
 */
export async function salvarConfigEmissaoFiscal(
  dados: Partial<ConfigEmissaoFiscal> & { empresa_id: string },
): Promise<ConfigEmissaoFiscal> {
  let existenteId = dados.id || null
  let antes: ConfigEmissaoFiscal | null = null

  if (!existenteId) {
    try {
      const achado = await pb
        .collection('config_emissao_fiscal')
        .getFirstListItem<ConfigEmissaoFiscal>(`empresa_id = '${dados.empresa_id}'`)
      existenteId = achado.id
    } catch {
      // Cria
    }
  }

  // Validação: não permitir ligar emite_documentos_fiscais se a empresa não tiver IE válida
  if (dados.emite_documentos_fiscais) {
    const emp = await pb.collection('empresas').getOne(dados.empresa_id)
    const ie = (emp.inscricao_estadual || '').trim().toUpperCase()
    if (!ie || ie === 'ISENTO') {
      throw new Error(
        'Não é permitido ativar a emissão de documentos fiscais para uma empresa sem Inscrição Estadual ou com inscrição ISENTO.',
      )
    }
  }

  // Sanitizar codigo_token: apenas letras maiúsculas, números e _
  let codToken = (dados.codigo_token || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')

  // Verificar se o codigo_token não está sendo usado por outra empresa
  if (codToken) {
    const duplicados = await pb
      .collection('config_emissao_fiscal')
      .getList<ConfigEmissaoFiscal>(1, 2, {
        filter: `codigo_token = '${codToken}' && empresa_id != '${dados.empresa_id}' && ativo = true`,
      })
    if (duplicados.totalItems > 0) {
      throw new Error(
        `O código de token "${codToken}" já está em uso por outra empresa emissora do grupo.`,
      )
    }
  }

  const payload: Record<string, unknown> = {
    empresa_id: dados.empresa_id,
    provedor: 'Focus NFe',
    emite_documentos_fiscais:
      dados.emite_documentos_fiscais !== undefined ? Boolean(dados.emite_documentos_fiscais) : true,
    codigo_token: codToken,
    presenca_comprador_padrao_nfe: dados.presenca_comprador_padrao_nfe || '1 Presencial',
    ambiente: dados.ambiente || 'Homologação',
    serie_nfe: (dados.serie_nfe || '1').trim(),
    serie_nfce: (dados.serie_nfce || '1').trim(),
    emitir_nfce_automaticamente_no_pdv:
      dados.emitir_nfce_automaticamente_no_pdv !== undefined
        ? Boolean(dados.emitir_nfce_automaticamente_no_pdv)
        : true,
    natureza_operacao_venda: (dados.natureza_operacao_venda || 'Venda de mercadoria').trim(),
    natureza_operacao_devolucao_compra: (
      dados.natureza_operacao_devolucao_compra || 'Devolução de compra'
    ).trim(),
    natureza_operacao_devolucao_venda: (
      dados.natureza_operacao_devolucao_venda || 'Devolução de venda'
    ).trim(),
    informacoes_complementares_padrao: dados.informacoes_complementares_padrao || '',
    enviar_email_cliente: Boolean(dados.enviar_email_cliente),
    certificado_validade: dados.certificado_validade || null,
    csc_configurado: Boolean(dados.csc_configurado),
    informar_ibs_cbs: Boolean(dados.informar_ibs_cbs),
    ativo: dados.ativo !== undefined ? Boolean(dados.ativo) : true,
    updated_by: pb.authStore.record?.id || null,
  }

  let salva: ConfigEmissaoFiscal
  if (existenteId) {
    antes = await pb.collection('config_emissao_fiscal').getOne<ConfigEmissaoFiscal>(existenteId)

    // Se houve mudança de ambiente para Produção, registrar auditoria específica com destaque
    salva = await pb
      .collection('config_emissao_fiscal')
      .update<ConfigEmissaoFiscal>(existenteId, payload)

    await registrarAuditoria({
      tabela: 'config_emissao_fiscal',
      registro_id: salva.id,
      empresa_id: dados.empresa_id,
      acao: 'alteracao',
      valores_antes: antes as unknown as Record<string, unknown>,
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  } else {
    payload.created_by = pb.authStore.record?.id || null
    salva = await pb.collection('config_emissao_fiscal').create<ConfigEmissaoFiscal>(payload)

    await registrarAuditoria({
      tabela: 'config_emissao_fiscal',
      registro_id: salva.id,
      empresa_id: dados.empresa_id,
      acao: 'inclusao',
      valores_depois: salva as unknown as Record<string, unknown>,
    })
  }

  return salva
}

/**
 * Copia configurações de emissão de outra empresa (exceto codigo_token e certificado_validade)
 */
export async function copiarConfigEmissaoDeOutraEmpresa(params: {
  empresaOrigemId: string
  empresaDestinoId: string
}): Promise<ConfigEmissaoFiscal> {
  const origem = await obterOuCriarConfigEmissaoFiscal(params.empresaOrigemId)
  const destinoAtual = await obterOuCriarConfigEmissaoFiscal(params.empresaDestinoId)

  const atualizacao: Partial<ConfigEmissaoFiscal> & { empresa_id: string } = {
    id: destinoAtual.id,
    empresa_id: params.empresaDestinoId,
    presenca_comprador_padrao_nfe: origem.presenca_comprador_padrao_nfe,
    ambiente: origem.ambiente,
    serie_nfe: origem.serie_nfe,
    serie_nfce: origem.serie_nfce,
    emitir_nfce_automaticamente_no_pdv: origem.emitir_nfce_automaticamente_no_pdv,
    natureza_operacao_venda: origem.natureza_operacao_venda,
    natureza_operacao_devolucao_compra: origem.natureza_operacao_devolucao_compra,
    natureza_operacao_devolucao_venda: origem.natureza_operacao_devolucao_venda,
    informacoes_complementares_padrao: origem.informacoes_complementares_padrao,
    enviar_email_cliente: origem.enviar_email_cliente,
    informar_ibs_cbs: origem.informar_ibs_cbs,
    csc_configurado: origem.csc_configurado,
    // Não copia codigo_token nem certificado_validade
    codigo_token: destinoAtual.codigo_token,
    certificado_validade: destinoAtual.certificado_validade,
  }

  return await salvarConfigEmissaoFiscal(atualizacao)
}

/**
 * Lista todas as configurações fiscais ativas de todas as empresas
 */
export async function listarTodasConfigsEmissao(): Promise<ConfigEmissaoFiscal[]> {
  const res = await pb.collection('config_emissao_fiscal').getFullList<ConfigEmissaoFiscal>({
    filter: 'ativo = true',
  })
  return res
}
