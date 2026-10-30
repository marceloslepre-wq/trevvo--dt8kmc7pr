import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'
import { TipoEntradaNota, converterCfopEntrada } from '@/services/cfopConversao'
import { Fornecedor, salvarFornecedor, normalizarCpfCnpj } from '@/services/fornecedores'
import { TipoProduto } from '@/services/produtos'
import { obterAssinanteIdAtivo, sanitizarPayloadUpdate } from '@/services/tenancyHelper'

export type OrigemLancamentoNota = 'XML' | 'Digitação'
export type ModeloNota = '55' | '65' | '01' | '1B' | '04'
export type SituacaoDocumentoNota = '00' | '02' | '08'
export type StatusNotaEntrada = 'Em conferência' | 'Lançada' | 'Cancelada'

export interface NotaEntrada {
  id: string
  empresa_id: string
  fornecedor_id?: string
  pedido_compra_id?: string
  origem_lancamento: OrigemLancamentoNota
  modelo: ModeloNota
  serie: string
  numero: number
  chave_acesso?: string
  data_emissao: string
  data_entrada: string
  natureza_operacao?: string
  tipo_entrada: TipoEntradaNota
  finalidade?: number
  situacao_documento?: SituacaoDocumentoNota
  indicador_pagamento?: number
  condicao_pagamento_id?: string
  modalidade_frete?: number
  transportadora_id?: string

  // Totais
  valor_produtos: number
  valor_frete: number
  valor_seguro: number
  valor_desconto: number
  valor_outras_despesas: number
  valor_ipi: number
  base_icms: number
  valor_icms: number
  base_icms_st: number
  valor_icms_st: number
  valor_fcp_st: number
  valor_pis: number
  valor_cofins: number
  valor_ibs: number
  valor_cbs: number
  valor_total: number

  // Créditos aproveitados
  credito_icms?: number
  credito_ipi?: number
  credito_pis?: number
  credito_cofins?: number

  informacoes_complementares?: string
  observacao?: string

  xml_arquivo?: string
  protocolo_autorizacao?: string
  status_sefaz_xml?: string

  status: StatusNotaEntrada
  data_lancamento?: string
  usuario_lancamento_id?: string
  motivo_cancelamento?: string

  ativo: boolean
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string

  // Expansões
  expand?: {
    empresa_id?: { id: string; razao_social: string; nome_fantasia: string; cnpj: string }
    fornecedor_id?: Fornecedor
    transportadora_id?: Fornecedor
    pedido_compra_id?: { id: string; numero: number }
    condicao_pagamento_id?: { id: string; descricao: string }
    usuario_lancamento_id?: { id: string; nome: string }
  }
}

export interface NotaEntradaItemExpandProduto {
  id: string
  codigo: number
  descricao: string
  tipo?: TipoProduto
  ativo?: boolean
  unidade_id?: string
  ncm?: string
  cest?: string
  cst_icms?: string
  csosn?: string
  cfop_venda_interna?: string
  controla_lote_validade?: boolean
  dias_validade?: number
  cst_pis_entrada?: string
  cst_cofins_entrada?: string
  expand?: {
    unidade_id?: { id: string; sigla: string; descricao: string; aceita_fracionado?: boolean }
  }
}

export interface NotaEntradaItem {
  id: string
  nota_id: string
  numero_item: number

  // Fornecedor
  codigo_fornecedor?: string
  descricao_fornecedor: string
  gtin_fornecedor?: string
  codigo_barras_xml?: string
  ncm_fornecedor?: string
  ncm_xml?: string
  cest_fornecedor?: string
  cest_xml?: string
  cfop_fornecedor?: string
  cfop_xml?: string
  unidade_fornecedor?: string
  unidade_xml?: string
  quantidade_fornecedor: number
  quantidade_xml?: number
  valor_unitario_fornecedor: number
  valor_unitario_xml?: number
  dados_adicionais_xml?: any
  origem_mercadoria_xml?: string
  cst_icms_xml?: string

  // Vínculo ERP
  produto_id?: string
  fator_conversao?: number
  quantidade_estoque?: number
  quantidade_devolvida?: number
  lote_numero?: string
  lote_fabricacao?: string
  lote_validade?: string

  // Valores
  valor_produto?: number
  valor_desconto?: number
  valor_frete?: number
  valor_seguro?: number
  valor_outras?: number

  // ICMS Fornecedor
  origem?: string
  cst_icms_fornecedor?: string
  base_icms?: number
  aliquota_icms?: number
  valor_icms?: number
  base_icms_st?: number
  aliquota_icms_st?: number
  valor_icms_st?: number
  valor_fcp_st?: number

  // IPI
  cst_ipi?: string
  base_ipi?: number
  aliquota_ipi?: number
  valor_ipi?: number

  // PIS/COFINS Fornecedor
  cst_pis_fornecedor?: string
  valor_pis?: number
  cst_cofins_fornecedor?: string
  valor_cofins?: number

  // IBS/CBS
  cst_ibs_cbs?: string
  c_class_trib?: string
  valor_ibs?: number
  valor_cbs?: number

  // Escrituração Entrada
  cfop_entrada?: string
  cst_icms_entrada?: string
  aproveita_credito_icms?: boolean
  valor_credito_icms?: number
  cst_pis_entrada?: string
  cst_cofins_entrada?: string
  valor_credito_pis?: number
  valor_credito_cofins?: number
  aproveita_credito_ipi?: boolean
  valor_credito_ipi?: number

  // Custo
  custo_total_item?: number
  custo_unitario_estoque?: number

  ativo: boolean
  created?: string
  updated?: string

  expand?: {
    produto_id?: NotaEntradaItemExpandProduto
  }
}

export interface NotaEntradaParcela {
  id: string
  nota_id: string
  numero: string
  data_vencimento: string
  valor: number
  forma_pagamento?: string
  ativo: boolean
  created?: string
  updated?: string
}

export interface ListarNotasEntradaParams {
  empresa_id?: string
  fornecedor_id?: string
  tipo_entrada?: string
  status?: string
  data_inicio?: string
  data_fim?: string
  busca?: string
  page?: number
  perPage?: number
}

export interface ResultadoPaginadoNotas {
  items: NotaEntrada[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

// ==========================================
// SERVIÇOS DE CRUD DE NOTAS
// ==========================================

export async function listarNotasEntrada(
  params: ListarNotasEntradaParams,
): Promise<ResultadoPaginadoNotas> {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = ['ativo = true']

  if (params.empresa_id) {
    condicoes.push(`empresa_id = '${params.empresa_id}'`)
  }
  if (params.fornecedor_id) {
    condicoes.push(`fornecedor_id = '${params.fornecedor_id}'`)
  }
  if (params.tipo_entrada && params.tipo_entrada !== 'todos') {
    condicoes.push(`tipo_entrada = '${params.tipo_entrada}'`)
  }
  if (params.status && params.status !== 'todos') {
    condicoes.push(`status = '${params.status}'`)
  }
  if (params.data_inicio) {
    condicoes.push(`data_emissao >= '${params.data_inicio}'`)
  }
  if (params.data_fim) {
    condicoes.push(`data_emissao <= '${params.data_fim}'`)
  }
  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    const num = Number(b)
    if (!isNaN(num) && num > 0) {
      condicoes.push(`(numero = ${num} || chave_acesso ~ '${b}')`)
    } else {
      condicoes.push(`(chave_acesso ~ '${b}' || natureza_operacao ~ '${b}')`)
    }
  }

  const filter = condicoes.join(' && ')
  const sort = '-data_emissao,-created'

  const res = await pb.collection('notas_entrada').getList<NotaEntrada>(page, perPage, {
    filter,
    sort,
    expand: 'fornecedor_id,pedido_compra_id,empresa_id',
  })

  return {
    items: res.items,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
    page: res.page,
    perPage: res.perPage,
  }
}

export async function obterNotaEntradaPorId(id: string): Promise<{
  nota: NotaEntrada
  itens: NotaEntradaItem[]
  parcelas: NotaEntradaParcela[]
}> {
  const nota = await pb.collection('notas_entrada').getOne<NotaEntrada>(id, {
    expand:
      'fornecedor_id,transportadora_id,pedido_compra_id,condicao_pagamento_id,empresa_id,usuario_lancamento_id',
  })

  const itens = await pb.collection('notas_entrada_itens').getFullList<NotaEntradaItem>({
    filter: `nota_id = '${id}' && ativo = true`,
    sort: 'numero_item',
    expand: 'produto_id.unidade_id',
  })

  const parcelas = await pb.collection('notas_entrada_parcelas').getFullList<NotaEntradaParcela>({
    filter: `nota_id = '${id}' && ativo = true`,
    sort: 'data_vencimento,numero',
  })

  return { nota, itens, parcelas }
}

export async function buscarNotaPorChave(
  empresaId: string,
  chave: string,
): Promise<NotaEntrada | null> {
  const chaveLimpa = chave.replace(/\D/g, '')
  if (!chaveLimpa || chaveLimpa.length !== 44) return null
  try {
    // Regra: XML pode ser importado de novo se notas anteriores com mesma chave estiverem 'Cancelada'
    return await pb
      .collection('notas_entrada')
      .getFirstListItem<NotaEntrada>(
        `empresa_id = '${empresaId}' && chave_acesso = '${chaveLimpa}' && status != 'Cancelada' && ativo = true`,
      )
  } catch {
    return null
  }
}

/**
 * Vincula ou desvincula um pedido de compra à nota de entrada
 */
export async function vincularPedidoNotaEntrada(
  notaId: string,
  pedidoCompraId: string | null,
): Promise<NotaEntrada> {
  const payloadLimpo = sanitizarPayloadUpdate({
    pedido_compra_id: pedidoCompraId,
    updated_by: pb.authStore.record?.id || null,
  })
  const nota = await pb.collection('notas_entrada').update<NotaEntrada>(notaId, payloadLimpo)
  return nota
}

/**
 * Atualiza campos de uma nota fiscal de entrada existente com payload sanitizado
 * (garante que assinante_id e metadados de sistema nunca sejam enviados no PATCH/UPDATE).
 */
export async function atualizarNotaEntrada(
  notaId: string,
  dados: Partial<NotaEntrada> | Record<string, unknown>,
): Promise<NotaEntrada> {
  const payloadComUpdatedBy = {
    ...dados,
    updated_by: pb.authStore.record?.id || null,
  }
  const payloadLimpo = sanitizarPayloadUpdate(payloadComUpdatedBy)
  return await pb.collection('notas_entrada').update<NotaEntrada>(notaId, payloadLimpo)
}

// ==========================================
// SERVIÇOS DE CÁLCULO FISCAL, CRÉDITOS E CUSTO
// ==========================================

export interface DadosEmpresaCalculo {
  crt?: number
  regime_apuracao?: string
  regime_pis_cofins?: string
  contribuinte_ipi?: boolean
}

/**
 * Calcula créditos de ICMS, IPI, PIS e COFINS para um item da nota com base na empresa ativa
 */
export function calcularCreditosItem(params: {
  empresa: DadosEmpresaCalculo
  tipoEntrada: TipoEntradaNota
  cstFornecedor?: string
  valorIcmsItem: number
  pCredSN?: number
  vCredICMSSN?: number
  valorIpiItem: number
  cstIpiFornecedor?: string
  valorProduto: number
  desconto: number
  frete: number
  seguro: number
  outras: number
  cstPisEntrada?: string
  cstCofinsEntrada?: string
  aliquotaPis?: number
  aliquotaCofins?: number
  aproveitaCreditoIcms?: boolean
  aproveitaCreditoIpi?: boolean
}): {
  aproveitaCreditoIcms: boolean
  valorCreditoIcms: number
  aproveitaCreditoIpi: boolean
  valorCreditoIpi: number
  valorCreditoPis: number
  valorCreditoCofins: number
} {
  const {
    empresa,
    tipoEntrada,
    cstFornecedor = '',
    valorIcmsItem,
    pCredSN = 0,
    vCredICMSSN = 0,
    valorIpiItem,
    valorProduto,
    desconto,
    frete,
    seguro,
    outras,
    cstPisEntrada = '50',
    cstCofinsEntrada = '50',
    aliquotaPis = 1.65,
    aliquotaCofins = 7.6,
    aproveitaCreditoIcms: usuarioPermitiuIcms = true,
    aproveitaCreditoIpi: usuarioPermitiuIpi = true,
  } = params

  const ehRegimeNormal = empresa.crt === 3
  const ehRevendaOuInd =
    tipoEntrada === 'Compra para revenda' || tipoEntrada === 'Compra para industrialização'
  const ehIndustrializacao = tipoEntrada === 'Compra para industrialização'

  // 1. Crédito ICMS
  let aproveitaIcms = false
  let valorCreditoIcms = 0

  if (ehRegimeNormal && ehRevendaOuInd && usuarioPermitiuIcms) {
    const cst2 = cstFornecedor.slice(-2)
    // Fornecedor Simples (CSOSN 101, 201, 900)
    if (['101', '201', '900'].includes(cstFornecedor)) {
      aproveitaIcms = true
      valorCreditoIcms = vCredICMSSN > 0 ? vCredICMSSN : (valorProduto * pCredSN) / 100
    } else if (!['60', '40', '41'].includes(cst2)) {
      aproveitaIcms = true
      valorCreditoIcms = valorIcmsItem
    }
  }

  // 2. Crédito IPI
  let aproveitaIpi = false
  let valorCreditoIpi = 0
  if (empresa.contribuinte_ipi && ehIndustrializacao && usuarioPermitiuIpi) {
    aproveitaIpi = true
    valorCreditoIpi = valorIpiItem
  }

  // 3. Crédito PIS e COFINS
  let valorCreditoPis = 0
  let valorCreditoCofins = 0
  const pisEntre50e56 = ['50', '51', '52', '53', '54', '55', '56'].includes(cstPisEntrada)
  const cofinsEntre50e56 = ['50', '51', '52', '53', '54', '55', '56'].includes(cstCofinsEntrada)

  if (ehRegimeNormal && empresa.regime_pis_cofins === 'Não cumulativo') {
    const baseCalculo = Math.max(0, valorProduto - desconto + frete + seguro + outras)
    if (pisEntre50e56) {
      valorCreditoPis = Number(((baseCalculo * (aliquotaPis || 1.65)) / 100).toFixed(2))
    }
    if (cofinsEntre50e56) {
      valorCreditoCofins = Number(((baseCalculo * (aliquotaCofins || 7.6)) / 100).toFixed(2))
    }
  }

  return {
    aproveitaCreditoIcms: aproveitaIcms,
    valorCreditoIcms: Number(valorCreditoIcms.toFixed(2)),
    aproveitaCreditoIpi: aproveitaIpi,
    valorCreditoIpi: Number(valorCreditoIpi.toFixed(2)),
    valorCreditoPis,
    valorCreditoCofins,
  }
}

/**
 * Calcula custo total e unitário de um item
 */
export function calcularCustoAquisicaoItem(params: {
  valorProduto: number
  valorDesconto: number
  valorFrete: number
  valorSeguro: number
  valorOutras: number
  valorIpi: number
  valorIcmsSt: number
  valorFcpSt: number
  valorCreditoIcms: number
  valorCreditoIpi: number
  valorCreditoPis: number
  valorCreditoCofins: number
  quantidadeEstoque: number
}): { custoTotalItem: number; custoUnitarioEstoque: number } {
  const {
    valorProduto,
    valorDesconto,
    valorFrete,
    valorSeguro,
    valorOutras,
    valorIpi,
    valorIcmsSt,
    valorFcpSt,
    valorCreditoIcms,
    valorCreditoIpi,
    valorCreditoPis,
    valorCreditoCofins,
    quantidadeEstoque,
  } = params

  const custoTotal =
    valorProduto -
    valorDesconto +
    valorFrete +
    valorSeguro +
    valorOutras +
    valorIpi +
    valorIcmsSt +
    valorFcpSt -
    valorCreditoIcms -
    valorCreditoIpi -
    valorCreditoPis -
    valorCreditoCofins

  const custoTotalArred = Number(custoTotal.toFixed(2))
  const custoUnit =
    quantidadeEstoque > 0 ? Number((custoTotal / quantidadeEstoque).toFixed(4)) : custoTotalArred

  return {
    custoTotalItem: custoTotalArred,
    custoUnitarioEstoque: custoUnit,
  }
}

/**
 * Sugere CST PIS e COFINS padrão
 */
export function sugerirCstPisCofinsEntrada(params: {
  empresa: DadosEmpresaCalculo
  tipoEntrada: TipoEntradaNota
  produtoCstPis?: string
  produtoCstCofins?: string
}): { cstPis: string; cstCofins: string } {
  const { empresa, tipoEntrada, produtoCstPis, produtoCstCofins } = params

  if (produtoCstPis && produtoCstCofins) {
    return { cstPis: produtoCstPis, cstCofins: produtoCstCofins }
  }

  const ehRegimeNormal = empresa.crt === 3
  const naoCumulativo = empresa.regime_pis_cofins === 'Não cumulativo'
  const ehRevendaOuInd =
    tipoEntrada === 'Compra para revenda' || tipoEntrada === 'Compra para industrialização'

  if (ehRegimeNormal && naoCumulativo && ehRevendaOuInd) {
    return {
      cstPis: produtoCstPis || '50',
      cstCofins: produtoCstCofins || '50',
    }
  }

  return {
    cstPis: produtoCstPis || '98',
    cstCofins: produtoCstCofins || '98',
  }
}

/**
 * Executa o vínculo automático para um item individual
 */
export async function tentarVincularItemAutomatico(
  item: NotaEntradaItem,
  fornecedorId?: string,
): Promise<{
  produtoId: string | null
  fatorConversao: number
  marcarRevisao: boolean
  metodo: 'fornecedor' | 'gtin' | 'nenhum'
}> {
  // 1. produtos_fornecedores com fornecedor_id e codigo_no_fornecedor
  if (fornecedorId && item.codigo_fornecedor) {
    const codLimpo = item.codigo_fornecedor.trim().replace(/['"]/g, '')
    try {
      const pf = await pb
        .collection('produtos_fornecedores')
        .getFirstListItem<any>(
          `fornecedor_id = '${fornecedorId}' && codigo_no_fornecedor = '${codLimpo}' && ativo = true`,
        )
      if (pf && pf.produto_id) {
        return {
          produtoId: pf.produto_id,
          fatorConversao: pf.fator_conversao && pf.fator_conversao > 0 ? pf.fator_conversao : 1,
          marcarRevisao: false,
          metodo: 'fornecedor',
        }
      }
    } catch {
      // continua para o gtin
    }
  }

  // 2. produtos com gtin = gtin_fornecedor (ignorar vazio, "SEM GTIN", "SEMGTIN")
  const gtin = (item.gtin_fornecedor || '').trim().toUpperCase()
  if (gtin && gtin !== 'SEM GTIN' && gtin !== 'SEMGTIN') {
    try {
      const prod = await pb
        .collection('produtos')
        .getFirstListItem<any>(`gtin = '${gtin}' && ativo = true`, {
          expand: 'unidade_id',
        })
      if (prod) {
        let fator = 1
        let marcarRevisao = false
        const unForn = (item.unidade_fornecedor || '').trim().toUpperCase()
        const unProdSigla = (prod.expand?.unidade_id?.sigla || '').trim().toUpperCase()

        if (unForn && unProdSigla && unForn !== unProdSigla) {
          // Procurar em produtos_conversoes_unidade
          try {
            const convs = await pb.collection('produtos_conversoes_unidade').getFullList<any>({
              filter: `produto_id = '${prod.id}' && ativo = true`,
              expand: 'unidade_id',
            })
            const encontrada = convs.find(
              (c) =>
                (c.expand?.unidade_id?.sigla || '').trim().toUpperCase() === unForn ||
                (c.gtin_unidade && c.gtin_unidade.trim().toUpperCase() === gtin),
            )
            if (encontrada && encontrada.fator_conversao > 0) {
              fator = encontrada.fator_conversao
            } else {
              fator = 1
              marcarRevisao = true
            }
          } catch {
            fator = 1
            marcarRevisao = true
          }
        }

        return {
          produtoId: prod.id,
          fatorConversao: fator,
          marcarRevisao,
          metodo: 'gtin',
        }
      }
    } catch {
      // sem vinculo
    }
  }

  return {
    produtoId: null,
    fatorConversao: 1,
    marcarRevisao: false,
    metodo: 'nenhum',
  }
}

/**
 * Executa o vínculo automático para todos os itens da nota que estiverem sem produto_id
 */
export async function executarVinculoAutomaticoNota(
  notaId: string,
  fornecedorId?: string,
  empresaDados?: DadosEmpresaCalculo,
  tipoEntradaNota?: TipoEntradaNota,
): Promise<{ vinculados: number; total: number }> {
  const itens = await pb.collection('notas_entrada_itens').getFullList<NotaEntradaItem>({
    filter: `nota_id = '${notaId}' && ativo = true`,
  })

  let vinculados = 0
  for (const it of itens) {
    if (it.produto_id) continue

    const res = await tentarVincularItemAutomatico(it, fornecedorId)
    if (res.produtoId) {
      await vincularProdutoAoItemNota(
        it.id,
        res.produtoId,
        res.fatorConversao,
        empresaDados,
        tipoEntradaNota,
      )
      vinculados++
    }
  }

  return { vinculados, total: itens.length }
}

/**
 * Vincula um produto do ERP a um item da nota de entrada e recalcula custos e créditos
 */
export async function vincularProdutoAoItemNota(
  itemId: string,
  produtoId: string,
  fatorConversao = 1,
  empresaDados?: DadosEmpresaCalculo,
  tipoEntradaNota?: TipoEntradaNota,
): Promise<NotaEntradaItem> {
  const item = await pb.collection('notas_entrada_itens').getOne<NotaEntradaItem>(itemId)
  const prod = await pb.collection('produtos').getOne<any>(produtoId)

  const fator = fatorConversao > 0 ? fatorConversao : 1
  const qtdEstoque = Number((item.quantidade_fornecedor * fator).toFixed(4))

  // Sugerir CST PIS e COFINS se ainda em branco ou 50/98
  const { cstPis, cstCofins } = sugerirCstPisCofinsEntrada({
    empresa: empresaDados || {},
    tipoEntrada: tipoEntradaNota || 'Compra para revenda',
    produtoCstPis: prod.cst_pis_entrada,
    produtoCstCofins: prod.cst_cofins_entrada,
  })

  // Recalcula créditos
  const creditos = calcularCreditosItem({
    empresa: empresaDados || {},
    tipoEntrada: tipoEntradaNota || 'Compra para revenda',
    cstFornecedor: item.cst_icms_fornecedor,
    valorIcmsItem: item.valor_icms || 0,
    valorIpiItem: item.valor_ipi || 0,
    valorProduto: item.valor_produto || 0,
    desconto: item.valor_desconto || 0,
    frete: item.valor_frete || 0,
    seguro: item.valor_seguro || 0,
    outras: item.valor_outras || 0,
    cstPisEntrada: cstPis,
    cstCofinsEntrada: cstCofins,
    aproveitaCreditoIcms: item.aproveita_credito_icms,
    aproveitaCreditoIpi: item.aproveita_credito_ipi,
  })

  // Recalcula custo
  const { custoTotalItem, custoUnitarioEstoque } = calcularCustoAquisicaoItem({
    valorProduto: item.valor_produto || 0,
    valorDesconto: item.valor_desconto || 0,
    valorFrete: item.valor_frete || 0,
    valorSeguro: item.valor_seguro || 0,
    valorOutras: item.valor_outras || 0,
    valorIpi: item.valor_ipi || 0,
    valorIcmsSt: item.valor_icms_st || 0,
    valorFcpSt: item.valor_fcp_st || 0,
    valorCreditoIcms: creditos.valorCreditoIcms,
    valorCreditoIpi: creditos.valorCreditoIpi,
    valorCreditoPis: creditos.valorCreditoPis,
    valorCreditoCofins: creditos.valorCreditoCofins,
    quantidadeEstoque: qtdEstoque,
  })

  return await pb.collection('notas_entrada_itens').update<NotaEntradaItem>(itemId, {
    produto_id: produtoId,
    fator_conversao: fator,
    quantidade_estoque: qtdEstoque,
    cst_pis_entrada: cstPis,
    cst_cofins_entrada: cstCofins,
    aproveita_credito_icms: creditos.aproveitaCreditoIcms,
    valor_credito_icms: creditos.valorCreditoIcms,
    aproveita_credito_ipi: creditos.aproveitaCreditoIpi,
    valor_credito_ipi: creditos.valorCreditoIpi,
    valor_credito_pis: creditos.valorCreditoPis,
    valor_credito_cofins: creditos.valorCreditoCofins,
    custo_total_item: custoTotalItem,
    custo_unitario_estoque: custoUnitarioEstoque,
    updated_by: pb.authStore.record?.id || null,
  })
}

export interface ItemRevisaoPreco {
  produto_id: string
  codigo: number
  descricao: string
  custo_novo: number
  preco_atual: number
  margem_atual: number
  margem_padrao: number
  preco_sugerido: number
}

export interface ResultadoLancamentoNota {
  sucesso: boolean
  message: string
  produtos_revisao: ItemRevisaoPreco[]
}

/**
 * Lança nota de entrada via hook transacional no backend
 */
export async function lancarNotaEntrada(params: {
  notaId: string
  atualizarCustoProdutos?: boolean
  justificativaDivergencia?: string
  usuarioErpId?: string
  jaPaga?: boolean
  contaPagamentoId?: string
  formaPagamentoId?: string
}): Promise<ResultadoLancamentoNota> {
  const res = await pb.send<ResultadoLancamentoNota>('/notas-entrada/lancar', {
    method: 'POST',
    body: {
      nota_id: params.notaId,
      atualizar_custo_produtos: params.atualizarCustoProdutos !== false,
      justificativa_divergencia: params.justificativaDivergencia || '',
      usuario_erp_id: params.usuarioErpId || '',
      ja_paga: Boolean(params.jaPaga),
      conta_pagamento_id: params.contaPagamentoId || '',
      forma_pagamento_id: params.formaPagamentoId || '',
    },
  })
  return res
}

/**
 * Cancela lançamento da nota de entrada via hook transacional no backend
 */
export async function cancelarNotaEntrada(
  id: string,
  motivo: string,
): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>('/notas-entrada/cancelar', {
    method: 'POST',
    body: {
      nota_id: id,
      motivo,
    },
  })
  return res
}

export interface ItemDevolucaoCompra {
  item_id: string
  quantidade: number
}

export interface EmitirNfeDevolucaoCompraParams {
  nota_entrada_id: string
  motivo: string
  destino_financeiro: 'abater_titulos' | 'gerar_receber'
  itens: ItemDevolucaoCompra[]
}

export interface RespostaDevolucaoCompra {
  sucesso: boolean
  status: string
  documento_id?: string
  referencia?: string
  total_devolvido?: number
  message: string
}

/**
 * Emite NF-e de devolução ao fornecedor (nota de saída)
 */
export async function emitirNfeDevolucaoCompra(
  params: EmitirNfeDevolucaoCompraParams,
): Promise<RespostaDevolucaoCompra> {
  const res = await pb.send<RespostaDevolucaoCompra>(
    '/backend/v1/fiscal/emitir-nfe-devolucao-compra',
    {
      method: 'POST',
      body: params,
    },
  )
  return res
}

/**
 * Confirma estoque e financeiro após autorização da devolução de compra
 */
export async function confirmarAutorizacaoDevolucaoCompra(params: {
  documento_id: string
  nota_entrada_id: string
  destino_financeiro: 'abater_titulos' | 'gerar_receber'
}): Promise<{ sucesso: boolean; message: string }> {
  const res = await pb.send<{ sucesso: boolean; message: string }>(
    '/backend/v1/fiscal/confirmar-autorizacao-devolucao-compra',
    {
      method: 'POST',
      body: params,
    },
  )
  return res
}

export interface NotaSemTituloRetroativo {
  nota_id: string
  numero: number
  serie: string
  data_emissao: string
  data_entrada: string
  fornecedor_nome: string
  valor_total: number
  tipo_entrada: string
}

export interface RespostaRetroativos {
  sucesso: boolean
  message: string
  total_notas: number
  total_titulos_gerados: number
  notas: NotaSemTituloRetroativo[]
}

/**
 * Consulta notas já lançadas sem títulos a pagar (exclusivo Administrador)
 */
export async function listarNotasLancadasSemTitulos(
  empresaId: string,
): Promise<RespostaRetroativos> {
  const res = await pb.send<RespostaRetroativos>('/financeiro/pagar/gerar-titulos-retroativos', {
    method: 'POST',
    body: {
      empresa_id: empresaId,
      apenas_listar: true,
    },
  })
  return res
}

/**
 * Gera os títulos a pagar retroativos para as notas lançadas (exclusivo Administrador)
 */
export async function gerarTitulosRetroativosNotas(
  empresaId: string,
): Promise<RespostaRetroativos> {
  const res = await pb.send<RespostaRetroativos>('/financeiro/pagar/gerar-titulos-retroativos', {
    method: 'POST',
    body: {
      empresa_id: empresaId,
      apenas_listar: false,
    },
  })
  return res
}

// ==========================================
// PARSER DO XML DA NF-e (DOMParser no Browser)
// ==========================================

export interface DadosFornecedorXml {
  cnpjCpf: string
  razaoSocial: string
  nomeFantasia: string
  inscricaoEstadual: string
  crt: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  codigoIbge: string
  cidade: string
  uf: string
  cep: string
  telefone: string
}

export interface ItemXmlParsed {
  numeroItem: number
  codigo: string
  descricao: string
  gtin: string
  ncm: string
  cest: string
  cfop: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  desconto: number
  frete: number
  seguro: number
  outrasDespesas: number

  // Rastro / Lote
  loteNumero?: string
  loteFabricacao?: string
  loteValidade?: string

  // ICMS
  origem: string
  cstIcms: string
  baseIcms: number
  aliquotaIcms: number
  valorIcms: number
  baseIcmsSt: number
  aliquotaIcmsSt: number
  valorIcmsSt: number
  valorFcpSt: number

  // IPI
  cstIpi: string
  baseIpi: number
  aliquotaIpi: number
  valorIpi: number

  // PIS
  cstPis: string
  valorPis: number

  // COFINS
  cstCofins: string
  valorCofins: number

  // IBS/CBS
  cstIbsCbs?: string
  cClassTrib?: string
  valorIbs?: number
  valorCbs?: number

  // Simples Nacional Crédito ICMS
  pCredSN?: number
  vCredICMSSN?: number
}

export interface ParcelaXmlParsed {
  numero: string
  vencimento: string
  valor: number
  formaPagamento?: string
}

export interface NfeXmlParsed {
  chaveAcesso: string
  modelo: ModeloNota
  serie: string
  numero: number
  dataEmissao: string
  dataEntrada: string
  naturezaOperacao: string
  tipoOperacao: number // 0 entrada, 1 saída
  finalidade: number // 1 normal, 2 complementar, 3 ajuste, 4 devolução
  indicadorPagamento: number

  // Destinatário
  destCnpjCpf: string
  destRazaoSocial: string

  // Emitente
  emitente: DadosFornecedorXml

  // Totais
  valorProdutos: number
  valorFrete: number
  valorSeguro: number
  valorDesconto: number
  valorOutras: number
  valorIpi: number
  baseIcms: number
  valorIcms: number
  baseIcmsSt: number
  valorIcmsSt: number
  valorFcpSt: number
  valorPis: number
  valorCofins: number
  valorIbs: number
  valorCbs: number
  valorTotal: number

  // Modalidade de frete e transportadora
  modalidadeFrete: number
  transpCnpjCpf?: string
  transpRazaoSocial?: string

  // Protocolo
  protocoloAutorizacao?: string
  statusSefaz?: string
  temProtocolo: boolean

  // Textos adicionais
  infAdic?: string

  // Itens e Parcelas
  itens: ItemXmlParsed[]
  parcelas: ParcelaXmlParsed[]

  // XML cru em texto para salvar e visualização
  rawXml: string
}

function getNodeText(parent: Element | null, tag: string): string {
  if (!parent) return ''
  const el = parent.getElementsByTagName(tag)[0]
  return el?.textContent?.trim() || ''
}

function getNodeNumber(parent: Element | null, tag: string): number {
  const txt = getNodeText(parent, tag)
  if (!txt) return 0
  const n = parseFloat(txt)
  return isNaN(n) ? 0 : n
}

export function parseNfeXml(xmlString: string): NfeXmlParsed {
  const xmlLimpo = (xmlString || '').replace(/^\uFEFF+/, '').trimStart()
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlLimpo, 'text/xml')

  const parserError = xmlDoc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error('Arquivo XML inválido ou corrompido.')
  }

  // Localiza infNFe
  const infNFe = xmlDoc.getElementsByTagName('infNFe')[0]
  if (!infNFe) {
    throw new Error('A tag <infNFe> não foi encontrada no XML.')
  }

  // Chave de acesso pelo Id da infNFe (ex: NFe35...)
  let chaveAcesso = (infNFe.getAttribute('Id') || '').replace(/^NFe/, '').replace(/\D/g, '')

  // ide
  const ide = infNFe.getElementsByTagName('ide')[0]
  const modRaw = getNodeText(ide, 'mod')
  let modelo: ModeloNota = '55'
  if (['55', '65', '01', '1B', '04'].includes(modRaw)) {
    modelo = modRaw as ModeloNota
  }
  const serie = getNodeText(ide, 'serie') || '1'
  const numero = parseInt(getNodeText(ide, 'nNF') || '0', 10)
  const dhEmi = getNodeText(ide, 'dhEmi') || getNodeText(ide, 'dEmi')
  const dataEmissao = dhEmi ? dhEmi.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const dhSaiEnt = getNodeText(ide, 'dhSaiEnt') || getNodeText(ide, 'dSaiEnt')
  const dataEntrada = dhSaiEnt ? dhSaiEnt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const naturezaOperacao = getNodeText(ide, 'natOp')
  const tipoOperacao = parseInt(getNodeText(ide, 'tpNF') || '1', 10)
  const finalidade = parseInt(getNodeText(ide, 'finNFe') || '1', 10)
  const indicadorPagamento = parseInt(getNodeText(ide, 'indPag') || '0', 10)

  // emit
  const emit = infNFe.getElementsByTagName('emit')[0]
  const emitCnpj = getNodeText(emit, 'CNPJ')
  const emitCpf = getNodeText(emit, 'CPF')
  const emitCnpjCpf = emitCnpj || emitCpf
  const emitEnder = emit?.getElementsByTagName('enderEmit')[0]

  const emitente: DadosFornecedorXml = {
    cnpjCpf: emitCnpjCpf,
    razaoSocial: getNodeText(emit, 'xNome'),
    nomeFantasia: getNodeText(emit, 'xFant'),
    inscricaoEstadual: getNodeText(emit, 'IE'),
    crt: getNodeText(emit, 'CRT'),
    logradouro: getNodeText(emitEnder, 'xLgr'),
    numero: getNodeText(emitEnder, 'nro'),
    complemento: getNodeText(emitEnder, 'xCpl'),
    bairro: getNodeText(emitEnder, 'xBairro'),
    codigoIbge: getNodeText(emitEnder, 'cMun'),
    cidade: getNodeText(emitEnder, 'xMun'),
    uf: getNodeText(emitEnder, 'UF'),
    cep: getNodeText(emitEnder, 'CEP'),
    telefone: getNodeText(emitEnder, 'fone'),
  }

  // dest
  const dest = infNFe.getElementsByTagName('dest')[0]
  const destCnpj = getNodeText(dest, 'CNPJ')
  const destCpf = getNodeText(dest, 'CPF')
  const destCnpjCpf = destCnpj || destCpf
  const destRazaoSocial = getNodeText(dest, 'xNome')

  // total
  const total = infNFe.getElementsByTagName('total')[0]
  const icmsTot = total?.getElementsByTagName('ICMSTot')[0]

  const valorProdutos = getNodeNumber(icmsTot, 'vProd')
  const valorFrete = getNodeNumber(icmsTot, 'vFrete')
  const valorSeguro = getNodeNumber(icmsTot, 'vSeg')
  const valorDesconto = getNodeNumber(icmsTot, 'vDesc')
  const valorOutras = getNodeNumber(icmsTot, 'vOutro')
  const valorIpi = getNodeNumber(icmsTot, 'vIPI')
  const baseIcms = getNodeNumber(icmsTot, 'vBC')
  const valorIcms = getNodeNumber(icmsTot, 'vICMS')
  const baseIcmsSt = getNodeNumber(icmsTot, 'vBCST')
  const valorIcmsSt = getNodeNumber(icmsTot, 'vST')
  const valorFcpSt = getNodeNumber(icmsTot, 'vFCPST')
  const valorPis = getNodeNumber(icmsTot, 'vPIS')
  const valorCofins = getNodeNumber(icmsTot, 'vCOFINS')
  const valorTotal = getNodeNumber(icmsTot, 'vNF')

  // Reforma tributária IBS/CBS no total se existir (versões preliminares/futuras)
  const ibsTot = total?.getElementsByTagName('IBSTot')[0]
  const valorIbs = getNodeNumber(ibsTot, 'vIBS')
  const valorCbs = getNodeNumber(ibsTot, 'vCBS')

  // transp
  const transp = infNFe.getElementsByTagName('transp')[0]
  const modalidadeFrete = parseInt(getNodeText(transp, 'modFrete') || '9', 10)
  const transpObj = transp?.getElementsByTagName('transporta')[0]
  const transpCnpjCpf = getNodeText(transpObj, 'CNPJ') || getNodeText(transpObj, 'CPF')
  const transpRazaoSocial = getNodeText(transpObj, 'xNome')

  // cobr / dup / pag
  const cobr = infNFe.getElementsByTagName('cobr')[0]
  const dupNodes = cobr ? Array.from(cobr.getElementsByTagName('dup')) : []
  const pag = infNFe.getElementsByTagName('pag')[0]
  const detPagNodes = pag ? Array.from(pag.getElementsByTagName('detPag')) : []

  // Mapear parcelas
  const parcelas: ParcelaXmlParsed[] = []
  if (dupNodes.length > 0) {
    dupNodes.forEach((dup, idx) => {
      const nDup = getNodeText(dup, 'nDup') || String(idx + 1).padStart(3, '0')
      const dVenc = getNodeText(dup, 'dVenc') || dataEmissao
      const vDup = getNodeNumber(dup, 'vDup')
      // tenta pegar forma de pagamento correspondente em detPag
      let formaPagamento = ''
      if (detPagNodes[idx]) {
        formaPagamento = getNodeText(detPagNodes[idx], 'tPag')
      } else if (detPagNodes[0]) {
        formaPagamento = getNodeText(detPagNodes[0], 'tPag')
      }
      parcelas.push({
        numero: nDup,
        vencimento: dVenc,
        valor: vDup,
        formaPagamento,
      })
    })
  } else if (detPagNodes.length > 0) {
    detPagNodes.forEach((det, idx) => {
      const vPag = getNodeNumber(det, 'vPag')
      const tPag = getNodeText(det, 'tPag')
      if (vPag > 0) {
        parcelas.push({
          numero: String(idx + 1).padStart(3, '0'),
          vencimento: dataEmissao,
          valor: vPag,
          formaPagamento: tPag,
        })
      }
    })
  }

  // Se mesmo assim não houver parcelas, criamos a parcela única com valorTotal
  if (parcelas.length === 0 && valorTotal > 0) {
    parcelas.push({
      numero: '001',
      vencimento: dataEmissao,
      valor: valorTotal,
      formaPagamento: '99', // Outros
    })
  }

  // infAdic
  const infAdic = infNFe.getElementsByTagName('infAdic')[0]
  const infCpl = getNodeText(infAdic, 'infCpl')
  const infAdFisco = getNodeText(infAdic, 'infAdFisco')
  const infAdicTexto = [infCpl, infAdFisco].filter(Boolean).join('\n')

  // protNFe
  const protNFe = xmlDoc.getElementsByTagName('protNFe')[0]
  const infProt = protNFe?.getElementsByTagName('infProt')[0]
  const protocoloAutorizacao = getNodeText(infProt, 'nProt')
  const statusSefaz = getNodeText(infProt, 'cStat')
  const chaveProt = getNodeText(infProt, 'chNFe')
  if (!chaveAcesso && chaveProt) {
    chaveAcesso = chaveProt.replace(/\D/g, '')
  }
  const temProtocolo = Boolean(protocoloAutorizacao && statusSefaz)

  // Itens (det)
  const detNodes = Array.from(infNFe.getElementsByTagName('det'))
  const itens: ItemXmlParsed[] = detNodes.map((det) => {
    const nItem = parseInt(det.getAttribute('nItem') || '1', 10)
    const prod = det.getElementsByTagName('prod')[0]
    const imposto = det.getElementsByTagName('imposto')[0]

    // prod
    const cProd = getNodeText(prod, 'cProd')
    const xProd = getNodeText(prod, 'xProd')
    const cEAN = getNodeText(prod, 'cEAN')
    const ncm = getNodeText(prod, 'NCM')
    const cest = getNodeText(prod, 'CEST')
    const cfop = getNodeText(prod, 'CFOP')
    const uCom = getNodeText(prod, 'uCom')
    const qCom = getNodeNumber(prod, 'qCom')
    const vUnCom = getNodeNumber(prod, 'vUnCom')
    const vProd = getNodeNumber(prod, 'vProd')
    const vDesc = getNodeNumber(prod, 'vDesc')
    const vFrete = getNodeNumber(prod, 'vFrete')
    const vSeg = getNodeNumber(prod, 'vSeg')
    const vOutro = getNodeNumber(prod, 'vOutro')

    // Rastro (Lote)
    const rastro = prod?.getElementsByTagName('rastro')[0]
    const loteNumero = rastro ? getNodeText(rastro, 'nLote') : undefined
    const loteFabricacao = rastro ? getNodeText(rastro, 'dFab') : undefined
    const loteValidade = rastro ? getNodeText(rastro, 'dVal') : undefined

    // ICMS: pode vir como ICMS00, ICMS10, ICMS20, ICMS30, ICMS40, ICMS51, ICMS60, ICMS70, ICMS90,
    // ou ICMSSN101, ICMSSN102, ICMSSN201, ICMSSN202, ICMSSN500, ICMSSN900, etc.
    let origem = '0'
    let cstIcms = ''
    let baseIcmsItem = 0
    let aliquotaIcmsItem = 0
    let valorIcmsItem = 0
    let baseIcmsStItem = 0
    let aliquotaIcmsStItem = 0
    let valorIcmsStItem = 0
    let valorFcpStItem = 0

    let pCredSNItem = 0
    let vCredICMSSNItem = 0

    const icmsNode = imposto?.getElementsByTagName('ICMS')[0]
    if (icmsNode && icmsNode.children.length > 0) {
      const sub = icmsNode.children[0] // ex: <ICMS00> ou <ICMSSN101>
      origem = getNodeText(sub, 'orig') || '0'
      cstIcms = getNodeText(sub, 'CST') || getNodeText(sub, 'CSOSN') || ''
      baseIcmsItem = getNodeNumber(sub, 'vBC')
      aliquotaIcmsItem = getNodeNumber(sub, 'pICMS')
      valorIcmsItem = getNodeNumber(sub, 'vICMS')
      baseIcmsStItem = getNodeNumber(sub, 'vBCST')
      aliquotaIcmsStItem = getNodeNumber(sub, 'pICMSST')
      valorIcmsStItem = getNodeNumber(sub, 'vST')
      valorFcpStItem = getNodeNumber(sub, 'vFCPST')
      pCredSNItem = getNodeNumber(sub, 'pCredSN')
      vCredICMSSNItem = getNodeNumber(sub, 'vCredICMSSN')
    }

    // IPI
    let cstIpi = ''
    let baseIpiItem = 0
    let aliquotaIpiItem = 0
    let valorIpiItem = 0
    const ipiNode = imposto?.getElementsByTagName('IPI')[0]
    if (ipiNode) {
      const ipiTrib = ipiNode.getElementsByTagName('IPITrib')[0]
      const ipiNT = ipiNode.getElementsByTagName('IPINT')[0]
      if (ipiTrib) {
        cstIpi = getNodeText(ipiTrib, 'CST')
        baseIpiItem = getNodeNumber(ipiTrib, 'vBC')
        aliquotaIpiItem = getNodeNumber(ipiTrib, 'pIPI')
        valorIpiItem = getNodeNumber(ipiTrib, 'vIPI')
      } else if (ipiNT) {
        cstIpi = getNodeText(ipiNT, 'CST')
      }
    }

    // PIS
    let cstPis = ''
    let valorPisItem = 0
    const pisNode = imposto?.getElementsByTagName('PIS')[0]
    if (pisNode && pisNode.children.length > 0) {
      const subPis = pisNode.children[0]
      cstPis = getNodeText(subPis, 'CST')
      valorPisItem = getNodeNumber(subPis, 'vPIS')
    }

    // COFINS
    let cstCofins = ''
    let valorCofinsItem = 0
    const cofinsNode = imposto?.getElementsByTagName('COFINS')[0]
    if (cofinsNode && cofinsNode.children.length > 0) {
      const subCof = cofinsNode.children[0]
      cstCofins = getNodeText(subCof, 'CST')
      valorCofinsItem = getNodeNumber(subCof, 'vCOFINS')
    }

    // IBS/CBS item se existir
    let cstIbsCbs: string | undefined
    let cClassTrib: string | undefined
    let valorIbsItem = 0
    let valorCbsItem = 0
    const ibsCbsNode =
      imposto?.getElementsByTagName('IBS_CBS')[0] || imposto?.getElementsByTagName('IBS')[0]
    if (ibsCbsNode) {
      cstIbsCbs = getNodeText(ibsCbsNode, 'CST')
      cClassTrib = getNodeText(ibsCbsNode, 'cClassTrib')
      valorIbsItem = getNodeNumber(ibsCbsNode, 'vIBS')
      valorCbsItem = getNodeNumber(ibsCbsNode, 'vCBS')
    }

    return {
      numeroItem: nItem,
      codigo: cProd,
      descricao: xProd,
      gtin: cEAN,
      ncm,
      cest,
      cfop,
      unidade: uCom,
      quantidade: qCom,
      valorUnitario: vUnCom,
      valorTotal: vProd,
      desconto: vDesc,
      frete: vFrete,
      seguro: vSeg,
      outrasDespesas: vOutro,

      loteNumero,
      loteFabricacao,
      loteValidade,

      origem,
      cstIcms,
      baseIcms: baseIcmsItem,
      aliquotaIcms: aliquotaIcmsItem,
      valorIcms: valorIcmsItem,
      baseIcmsSt: baseIcmsStItem,
      aliquotaIcmsSt: aliquotaIcmsStItem,
      valorIcmsSt: valorIcmsStItem,
      valorFcpSt: valorFcpStItem,

      cstIpi,
      baseIpi: baseIpiItem,
      aliquotaIpi: aliquotaIpiItem,
      valorIpi: valorIpiItem,

      cstPis,
      valorPis: valorPisItem,

      cstCofins,
      valorCofins: valorCofinsItem,

      cstIbsCbs,
      cClassTrib,
      valorIbs: valorIbsItem,
      valorCbs: valorCbsItem,

      pCredSN: pCredSNItem,
      vCredICMSSN: vCredICMSSNItem,
    }
  })

  return {
    chaveAcesso,
    modelo,
    serie,
    numero,
    dataEmissao,
    dataEntrada,
    naturezaOperacao,
    tipoOperacao,
    finalidade,
    indicadorPagamento,

    destCnpjCpf,
    destRazaoSocial,

    emitente,

    valorProdutos,
    valorFrete,
    valorSeguro,
    valorDesconto,
    valorOutras,
    valorIpi,
    baseIcms,
    valorIcms,
    baseIcmsSt,
    valorIcmsSt,
    valorFcpSt,
    valorPis,
    valorCofins,
    valorIbs,
    valorCbs,
    valorTotal,

    modalidadeFrete,
    transpCnpjCpf,
    transpRazaoSocial,

    protocoloAutorizacao,
    statusSefaz,
    temProtocolo,

    infAdic: infAdicTexto,

    itens,
    parcelas,
    rawXml: xmlLimpo,
  }
}

// ==========================================
// IMPORTAÇÃO E GRAVAÇÃO NO BANCO
// ==========================================

export async function importarXmlNotaEntrada(params: {
  parsed: NfeXmlParsed
  empresaId: string
  tipoEntrada: TipoEntradaNota
  fornecedorId?: string
  arquivoXml?: File
}): Promise<{ nota: NotaEntrada; fornecedorCriado?: boolean }> {
  const { parsed, empresaId, tipoEntrada, arquivoXml } = params
  const user = pb.authStore.record

  // 1. Resolver fornecedor (se não foi passado, busca por CNPJ/CPF)
  let fId = params.fornecedorId
  let fornecedorCriado = false
  const docLimpo = normalizarCpfCnpj(parsed.emitente.cnpjCpf)

  if (!fId && docLimpo) {
    try {
      const existente = await pb
        .collection('fornecedores')
        .getFirstListItem<Fornecedor>(`cpf_cnpj = '${docLimpo}' && ativo = true`)
      if (existente) {
        fId = existente.id
      }
    } catch {
      // Não cadastrado ainda
    }
  }

  // Se mesmo assim não achou fornecedor, cadastra automaticamente com os dados do emitente da NF-e
  if (!fId && docLimpo) {
    try {
      const tipoPessoa: 'Física' | 'Jurídica' = docLimpo.length === 11 ? 'Física' : 'Jurídica'
      let crtVal: '1' | '2' | '3' | '4' = '1'
      if (parsed.emitente.crt === '2') crtVal = '2'
      else if (parsed.emitente.crt === '3') crtVal = '3'
      else if (parsed.emitente.crt === '4') crtVal = '4'

      const novoForn = await salvarFornecedor({
        tipo_pessoa: tipoPessoa,
        cpf_cnpj: docLimpo,
        razao_social: parsed.emitente.razaoSocial || 'Fornecedor Importado via XML',
        nome_fantasia: parsed.emitente.nomeFantasia || parsed.emitente.razaoSocial || '',
        inscricao_estadual: parsed.emitente.inscricaoEstadual || 'ISENTO',
        indicador_ie: parsed.emitente.inscricaoEstadual ? '1' : '9',
        crt_fornecedor: crtVal,
        tipo_fornecedor: ['Mercadorias'],
        cep: (parsed.emitente.cep || '').replace(/\D/g, ''),
        logradouro: parsed.emitente.logradouro || '',
        numero: parsed.emitente.numero || 'S/N',
        complemento: parsed.emitente.complemento || '',
        bairro: parsed.emitente.bairro || '',
        codigo_municipio_ibge: parsed.emitente.codigoIbge || '',
        municipio: parsed.emitente.cidade || '',
        uf: parsed.emitente.uf || '',
        telefone: parsed.emitente.telefone || '',
        observacoes: 'Cadastrado automaticamente na importação da NF-e',
      })
      fId = novoForn.id
      fornecedorCriado = true
    } catch (err) {
      console.warn('Não foi possível cadastrar fornecedor automaticamente:', err)
    }
  }

  // 2. Transportadora opcional
  let transpId: string | undefined
  if (parsed.transpCnpjCpf) {
    const docTransp = normalizarCpfCnpj(parsed.transpCnpjCpf)
    if (docTransp) {
      try {
        const transObj = await pb
          .collection('fornecedores')
          .getFirstListItem<Fornecedor>(`cpf_cnpj = '${docTransp}' && ativo = true`)
        if (transObj) transpId = transObj.id
      } catch {
        // ignora
      }
    }
  }

  // 3. Monta FormData para notas_entrada (suporte a upload do arquivo .xml)
  const assinanteIdAtivo = obterAssinanteIdAtivo()
  const formData = new FormData()
  if (assinanteIdAtivo) {
    formData.append('assinante_id', assinanteIdAtivo)
  }
  formData.append('empresa_id', empresaId)
  if (fId) formData.append('fornecedor_id', fId)
  formData.append('origem_lancamento', 'XML')
  formData.append('modelo', parsed.modelo)
  formData.append('serie', parsed.serie)
  formData.append('numero', String(parsed.numero))
  if (parsed.chaveAcesso) formData.append('chave_acesso', parsed.chaveAcesso)
  formData.append('data_emissao', parsed.dataEmissao)
  formData.append('data_entrada', parsed.dataEntrada || new Date().toISOString().slice(0, 10))
  if (parsed.naturezaOperacao) formData.append('natureza_operacao', parsed.naturezaOperacao)
  formData.append('tipo_entrada', tipoEntrada)
  formData.append('finalidade', String(parsed.finalidade || 1))
  formData.append('situacao_documento', '00')
  formData.append('indicador_pagamento', String(parsed.indicadorPagamento || 0))
  formData.append('modalidade_frete', String(parsed.modalidadeFrete ?? 9))
  if (transpId) formData.append('transportadora_id', transpId)

  // Totais
  formData.append('valor_produtos', String(parsed.valorProdutos || 0))
  formData.append('valor_frete', String(parsed.valorFrete || 0))
  formData.append('valor_seguro', String(parsed.valorSeguro || 0))
  formData.append('valor_desconto', String(parsed.valorDesconto || 0))
  formData.append('valor_outras_despesas', String(parsed.valorOutras || 0))
  formData.append('valor_ipi', String(parsed.valorIpi || 0))
  formData.append('base_icms', String(parsed.baseIcms || 0))
  formData.append('valor_icms', String(parsed.valorIcms || 0))
  formData.append('base_icms_st', String(parsed.baseIcmsSt || 0))
  formData.append('valor_icms_st', String(parsed.valorIcmsSt || 0))
  formData.append('valor_fcp_st', String(parsed.valorFcpSt || 0))
  formData.append('valor_pis', String(parsed.valorPis || 0))
  formData.append('valor_cofins', String(parsed.valorCofins || 0))
  formData.append('valor_ibs', String(parsed.valorIbs || 0))
  formData.append('valor_cbs', String(parsed.valorCbs || 0))
  formData.append('valor_total', String(parsed.valorTotal || 0))

  if (parsed.infAdic) formData.append('informacoes_complementares', parsed.infAdic)
  if (parsed.protocoloAutorizacao)
    formData.append('protocolo_autorizacao', parsed.protocoloAutorizacao)
  if (parsed.statusSefaz) formData.append('status_sefaz_xml', parsed.statusSefaz)

  formData.append('status', 'Em conferência')
  formData.append('ativo', 'true')
  if (user?.id) {
    formData.append('created_by', user.id)
    formData.append('updated_by', user.id)
  }

  // Sanitiza o conteúdo XML antes de criar o Blob para garantir detecção correta de mime type pelo PocketBase
  // O PocketBase valida o mime pelo CONTEÚDO (biblioteca gabriel-vasile/mimetype):
  // só classifica como text/xml/application/xml se os primeiros bytes forem a assinatura '<?xml'
  let xmlStringParaUpload: string | null = null
  if (arquivoXml) {
    try {
      const conteudoBruto = await arquivoXml.text()
      xmlStringParaUpload = conteudoBruto.replace(/^\uFEFF+/, '').trimStart()
    } catch {
      // Se falhar ao ler texto do arquivo, usa parsed.rawXml como fallback
      xmlStringParaUpload = parsed.rawXml ? parsed.rawXml.replace(/^\uFEFF+/, '').trimStart() : null
    }
  } else if (parsed.rawXml) {
    xmlStringParaUpload = parsed.rawXml.replace(/^\uFEFF+/, '').trimStart()
  }

  if (xmlStringParaUpload) {
    const idx = xmlStringParaUpload.indexOf('<?xml')
    if (idx > 0) {
      // Elimina qualquer caractere/lixo antes da declaração XML
      xmlStringParaUpload = xmlStringParaUpload.slice(idx)
    } else if (idx === -1) {
      // XML sem declaração (começa direto em <nfeProc, etc.): prepende a declaração XML
      xmlStringParaUpload = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlStringParaUpload}`
    }

    const xmlBlob = new Blob([xmlStringParaUpload], { type: 'application/xml' })
    const nomeArquivo = arquivoXml?.name || `nfe_${parsed.chaveAcesso || parsed.numero}.xml`
    formData.append('xml_arquivo', xmlBlob, nomeArquivo)
  }

  const notaCriada = await pb.collection('notas_entrada').create<NotaEntrada>(formData)

  // 4. Gravar Itens
  for (const it of parsed.itens) {
    // Conversão de CFOP
    const { cfopEntrada } = await converterCfopEntrada(it.cfop, tipoEntrada)

    // Formata CST de entrada: se fornecedor for do Simples Nacional (veio CSOSN 3 dígitos), sugere origem + "90"
    let cstEntrada = `${it.origem || '0'}${it.cstIcms.padStart(2, '0').slice(-2)}`
    if (it.cstIcms && it.cstIcms.length === 3) {
      cstEntrada = `${it.origem || '0'}90`
    }

    const payloadItem: Record<string, unknown> = {
      nota_id: notaCriada.id,
      numero_item: it.numeroItem,
      codigo_fornecedor: it.codigo,
      descricao_fornecedor: it.descricao,
      gtin_fornecedor: it.gtin,
      ncm_fornecedor: it.ncm,
      cest_fornecedor: it.cest,
      cfop_fornecedor: it.cfop,
      unidade_fornecedor: it.unidade,
      quantidade_fornecedor: it.quantidade,
      valor_unitario_fornecedor: it.valorUnitario,

      // Vínculo ERP (fica vazio até a conferência manual/vinculação)
      produto_id: null,
      fator_conversao: 1,
      quantidade_estoque: it.quantidade,
      lote_numero: it.loteNumero || null,
      lote_fabricacao: it.loteFabricacao || null,
      lote_validade: it.loteValidade || null,

      // Valores
      valor_produto: it.valorTotal,
      valor_desconto: it.desconto,
      valor_frete: it.frete,
      valor_seguro: it.seguro,
      valor_outras: it.outrasDespesas,

      // ICMS Fornecedor
      origem: it.origem,
      cst_icms_fornecedor: it.cstIcms,
      base_icms: it.baseIcms,
      aliquota_icms: it.aliquotaIcms,
      valor_icms: it.valorIcms,
      base_icms_st: it.baseIcmsSt,
      aliquota_icms_st: it.aliquotaIcmsSt,
      valor_icms_st: it.valorIcmsSt,
      valor_fcp_st: it.valorFcpSt,

      // IPI
      cst_ipi: it.cstIpi,
      base_ipi: it.baseIpi,
      aliquota_ipi: it.aliquotaIpi,
      valor_ipi: it.valorIpi,

      // PIS/COFINS
      cst_pis_fornecedor: it.cstPis,
      valor_pis: it.valorPis,
      cst_cofins_fornecedor: it.cstCofins,
      valor_cofins: it.valorCofins,

      // IBS/CBS
      cst_ibs_cbs: it.cstIbsCbs || null,
      c_class_trib: it.cClassTrib || null,
      valor_ibs: it.valorIbs || 0,
      valor_cbs: it.valorCbs || 0,

      // Escrituração
      cfop_entrada: cfopEntrada,
      cst_icms_entrada: cstEntrada,
      aproveita_credito_icms: false,
      valor_credito_icms: 0,
      cst_pis_entrada: it.cstPis || '50',
      cst_cofins_entrada: it.cstCofins || '50',
      valor_credito_pis: 0,
      valor_credito_cofins: 0,
      aproveita_credito_ipi: false,
      valor_credito_ipi: 0,

      // Custo preliminar do item
      custo_total_item:
        it.valorTotal + it.frete + it.seguro + it.outrasDespesas + it.valorIpi - it.desconto,
      custo_unitario_estoque:
        it.quantidade > 0
          ? (it.valorTotal + it.frete + it.seguro + it.outrasDespesas + it.valorIpi - it.desconto) /
            it.quantidade
          : it.valorUnitario,

      ativo: true,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    }

    await pb.collection('notas_entrada_itens').create(payloadItem)
  }

  // 5. Gravar Parcelas
  for (const parc of parsed.parcelas) {
    await pb.collection('notas_entrada_parcelas').create({
      nota_id: notaCriada.id,
      numero: parc.numero,
      data_vencimento: parc.vencimento,
      valor: parc.valor,
      forma_pagamento: parc.formaPagamento || null,
      ativo: true,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    })
  }

  // Executa o vínculo automático inicial ao concluir a importação
  try {
    const emp = await pb.collection('empresas').getOne<any>(empresaId)
    await executarVinculoAutomaticoNota(notaCriada.id, fId, emp, tipoEntrada)
  } catch (err) {
    console.warn('Falha no vínculo automático pós-importação:', err)
  }

  await registrarAuditoria({
    tabela: 'notas_entrada',
    registro_id: notaCriada.id,
    acao: 'inclusao',
    valores_depois: {
      numero: notaCriada.numero,
      serie: notaCriada.serie,
      chave_acesso: notaCriada.chave_acesso,
      origem: 'XML',
      tipo_entrada: tipoEntrada,
      valor_total: notaCriada.valor_total,
      itens_count: parsed.itens.length,
    },
  })

  return { nota: notaCriada, fornecedorCriado }
}

// ==========================================
// SERVIÇOS DE LANÇAMENTO DE NOTAS POR DIGITAÇÃO (SEM XML)
// ==========================================

export interface ItemNotaDigitadaInput {
  numero_item: number
  produto_id: string
  codigo_fornecedor?: string
  descricao_fornecedor: string
  gtin_fornecedor?: string
  ncm_fornecedor?: string
  cest_fornecedor?: string
  unidade_fornecedor?: string
  cfop_fornecedor?: string
  quantidade_fornecedor: number
  valor_unitario_fornecedor: number
  valor_produto: number
  valor_desconto?: number
  valor_frete?: number
  valor_seguro?: number
  valor_outras?: number
  // Impostos destacados
  origem?: string
  cst_icms_fornecedor?: string
  base_icms?: number
  aliquota_icms?: number
  valor_icms?: number
  base_icms_st?: number
  aliquota_icms_st?: number
  valor_icms_st?: number
  valor_fcp_st?: number
  cst_ipi?: string
  base_ipi?: number
  aliquota_ipi?: number
  valor_ipi?: number
  cst_pis_fornecedor?: string
  valor_pis?: number
  cst_cofins_fornecedor?: string
  valor_cofins?: number
  // Escrituração
  cfop_entrada?: string
  cst_icms_entrada?: string
}

export interface ParcelaNotaDigitadaInput {
  numero: string
  data_vencimento: string
  valor: number
  forma_pagamento?: string
}

export interface CriarNotaDigitadaInput {
  empresa_id: string
  fornecedor_id: string
  modelo: ModeloNota
  serie: string
  numero: number
  chave_acesso?: string
  data_emissao: string
  data_entrada: string
  tipo_entrada: TipoEntradaNota
  natureza_operacao?: string
  condicao_pagamento_id?: string
  modalidade_frete: number
  transportadora_id?: string
  pedido_compra_id?: string
  informacoes_complementares?: string

  // Totais
  valor_produtos: number
  valor_frete?: number
  valor_seguro?: number
  valor_desconto?: number
  valor_outras?: number
  valor_ipi?: number
  base_icms?: number
  valor_icms?: number
  base_icms_st?: number
  valor_icms_st?: number
  valor_fcp_st?: number
  valor_pis?: number
  valor_cofins?: number
  valor_total: number

  itens: ItemNotaDigitadaInput[]
  parcelas: ParcelaNotaDigitadaInput[]
}

/**
 * Cria uma nota fiscal de entrada por DIGITAÇÃO manual (sem XML).
 * Salva com status 'Em conferência' e origem_lancamento = 'Digitação',
 * utilizando as MESMAS tabelas e o MESMO formato das notas importadas por XML.
 */
export async function salvarNotaEntradaDigitada(
  dados: CriarNotaDigitadaInput,
): Promise<NotaEntrada> {
  const user = pb.authStore.record

  if (!dados.empresa_id) throw new Error('Empresa ativa é obrigatória.')
  if (!dados.fornecedor_id) throw new Error('Fornecedor é obrigatório.')
  if (!dados.numero || dados.numero <= 0) throw new Error('Número da nota fiscal é obrigatório.')
  if (!dados.data_emissao) throw new Error('Data de emissão é obrigatória.')
  if (!dados.data_entrada) throw new Error('Data de entrada é obrigatória.')
  if (!dados.itens || dados.itens.length === 0)
    throw new Error('A nota deve conter ao menos 1 item.')

  // Validação da chave para modelos 55 e 65
  const chaveLimpa = (dados.chave_acesso || '').replace(/\D/g, '')
  if (dados.modelo === '55' || dados.modelo === '65') {
    if (!chaveLimpa) {
      throw new Error(`A chave de acesso é obrigatória para notas de modelo ${dados.modelo}.`)
    }
    if (chaveLimpa.length !== 44) {
      throw new Error(
        `A chave de acesso deve ter exatamente 44 dígitos (informado: ${chaveLimpa.length}).`,
      )
    }
  }

  // Verifica se já existe nota com a mesma chave (se fornecida e ativa/não cancelada)
  if (chaveLimpa) {
    const jaExiste = await buscarNotaPorChave(dados.empresa_id, chaveLimpa)
    if (jaExiste) {
      throw new Error(
        `Já existe uma nota fiscal cadastrada com esta chave de acesso (Nota #${jaExiste.numero}, Status: ${jaExiste.status}).`,
      )
    }
  }

  // Carrega dados da empresa para apuração de créditos e custos
  let dadosEmpresa: DadosEmpresaCalculo = {}
  try {
    const emp = await pb.collection('empresas').getOne<any>(dados.empresa_id)
    dadosEmpresa = {
      crt: emp.crt,
      regime_apuracao: emp.regime_apuracao,
      regime_pis_cofins: emp.regime_pis_cofins,
      contribuinte_ipi: emp.contribuinte_ipi,
    }
  } catch {
    // ignora
  }

  // 1. Criar cabeçalho da nota
  const assinanteIdAtivo = obterAssinanteIdAtivo()
  const payloadCabecalho: Record<string, unknown> = {
    assinante_id: assinanteIdAtivo || '',
    empresa_id: dados.empresa_id,
    fornecedor_id: dados.fornecedor_id,
    transportadora_id: dados.transportadora_id || null,
    pedido_compra_id: dados.pedido_compra_id || null,
    condicao_pagamento_id: dados.condicao_pagamento_id || null,
    origem_lancamento: 'Digitação',
    modelo: dados.modelo || '55',
    serie: dados.serie || '1',
    numero: dados.numero,
    chave_acesso: chaveLimpa || null,
    data_emissao: dados.data_emissao,
    data_entrada: dados.data_entrada,
    tipo_entrada: dados.tipo_entrada,
    natureza_operacao: dados.natureza_operacao || 'COMPRA PARA ENTRADA',
    modalidade_frete: dados.modalidade_frete !== undefined ? dados.modalidade_frete : 9,
    valor_produtos: dados.valor_produtos || 0,
    valor_frete: dados.valor_frete || 0,
    valor_seguro: dados.valor_seguro || 0,
    valor_desconto: dados.valor_desconto || 0,
    valor_outras: dados.valor_outras || 0,
    valor_ipi: dados.valor_ipi || 0,
    base_icms: dados.base_icms || 0,
    valor_icms: dados.valor_icms || 0,
    base_icms_st: dados.base_icms_st || 0,
    valor_icms_st: dados.valor_icms_st || 0,
    valor_fcp_st: dados.valor_fcp_st || 0,
    valor_pis: dados.valor_pis || 0,
    valor_cofins: dados.valor_cofins || 0,
    valor_ibs: 0,
    valor_cbs: 0,
    valor_total: dados.valor_total || 0,
    informacoes_complementares: dados.informacoes_complementares || null,
    status: 'Em conferência',
    ativo: true,
    created_by: user?.id || null,
    updated_by: user?.id || null,
  }

  const notaCriada = await pb.collection('notas_entrada').create<NotaEntrada>(payloadCabecalho)

  // 2. Gravar Itens
  for (const it of dados.itens) {
    const qtd = Number(it.quantidade_fornecedor) || 1
    const vUnit = Number(it.valor_unitario_fornecedor) || 0
    const vProd = Number(it.valor_produto) || qtd * vUnit
    const vDesc = Number(it.valor_desconto) || 0
    const vFrete = Number(it.valor_frete) || 0
    const vSeg = Number(it.valor_seguro) || 0
    const vOutro = Number(it.valor_outras) || 0
    const vIpi = Number(it.valor_ipi) || 0
    const vIcmsSt = Number(it.valor_icms_st) || 0
    const vFcpSt = Number(it.valor_fcp_st) || 0

    // Busca detalhes do produto para créditos e fator de conversão
    let prod: any = null
    if (it.produto_id) {
      try {
        prod = await pb.collection('produtos').getOne<any>(it.produto_id)
      } catch {
        // ignora
      }
    }

    const fatorConversao = 1
    const qtdEstoque = qtd * fatorConversao

    // Sugere CST PIS e COFINS
    const { cstPis, cstCofins } = sugerirCstPisCofinsEntrada({
      empresa: dadosEmpresa,
      tipoEntrada: dados.tipo_entrada,
      produtoCstPis: prod?.cst_pis_entrada,
      produtoCstCofins: prod?.cst_cofins_entrada,
    })

    // Calcula créditos
    const creditos = calcularCreditosItem({
      empresa: dadosEmpresa,
      tipoEntrada: dados.tipo_entrada,
      cstFornecedor: it.cst_icms_fornecedor || '',
      valorIcmsItem: it.valor_icms || 0,
      valorIpiItem: vIpi,
      valorProduto: vProd,
      desconto: vDesc,
      frete: vFrete,
      seguro: vSeg,
      outras: vOutro,
      cstPisEntrada: cstPis,
      cstCofinsEntrada: cstCofins,
      aproveitaCreditoIcms: true,
      aproveitaCreditoIpi: true,
    })

    // Calcula custo de aquisição
    const { custoTotalItem, custoUnitarioEstoque } = calcularCustoAquisicaoItem({
      valorProduto: vProd,
      valorDesconto: vDesc,
      valorFrete: vFrete,
      valorSeguro: vSeg,
      valorOutras: vOutro,
      valorIpi: vIpi,
      valorIcmsSt: vIcmsSt,
      valorFcpSt: vFcpSt,
      valorCreditoIcms: creditos.valorCreditoIcms,
      valorCreditoIpi: creditos.valorCreditoIpi,
      valorCreditoPis: creditos.valorCreditoPis,
      valorCreditoCofins: creditos.valorCreditoCofins,
      quantidadeEstoque: qtdEstoque,
    })

    const codFornecedorFinal =
      it.codigo_fornecedor || (prod?.codigo ? String(prod.codigo) : String(it.numero_item))

    const payloadItem: Record<string, unknown> = {
      nota_id: notaCriada.id,
      numero_item: it.numero_item,
      codigo_fornecedor: codFornecedorFinal,
      descricao_fornecedor: it.descricao_fornecedor,
      gtin_fornecedor: it.gtin_fornecedor || prod?.gtin || null,
      ncm_fornecedor: it.ncm_fornecedor || prod?.ncm || null,
      cest_fornecedor: it.cest_fornecedor || prod?.cest || null,
      cfop_fornecedor: it.cfop_fornecedor || null,
      unidade_fornecedor: it.unidade_fornecedor || 'UN',
      quantidade_fornecedor: qtd,
      valor_unitario_fornecedor: vUnit,
      // Vínculo ERP
      produto_id: it.produto_id || null,
      fator_conversao: fatorConversao,
      quantidade_estoque: qtdEstoque,
      // Valores
      valor_produto: vProd,
      valor_desconto: vDesc,
      valor_frete: vFrete,
      valor_seguro: vSeg,
      valor_outras: vOutro,
      // ICMS
      origem: it.origem || prod?.origem || '0',
      cst_icms_fornecedor: it.cst_icms_fornecedor || null,
      base_icms: it.base_icms || 0,
      aliquota_icms: it.aliquota_icms || 0,
      valor_icms: it.valor_icms || 0,
      base_icms_st: it.base_icms_st || 0,
      aliquota_icms_st: it.aliquota_icms_st || 0,
      valor_icms_st: vIcmsSt,
      valor_fcp_st: vFcpSt,
      // IPI
      cst_ipi: it.cst_ipi || null,
      base_ipi: it.base_ipi || 0,
      aliquota_ipi: it.aliquota_ipi || 0,
      valor_ipi: vIpi,
      // PIS/COFINS
      cst_pis_fornecedor: it.cst_pis_fornecedor || null,
      valor_pis: it.valor_pis || 0,
      cst_cofins_fornecedor: it.cst_cofins_fornecedor || null,
      valor_cofins: it.valor_cofins || 0,
      // Escrituração
      cfop_entrada: it.cfop_entrada || '1102',
      cst_icms_entrada: it.cst_icms_entrada || '000',
      aproveita_credito_icms: creditos.aproveitaCreditoIcms,
      valor_credito_icms: creditos.valorCreditoIcms,
      cst_pis_entrada: cstPis,
      cst_cofins_entrada: cstCofins,
      valor_credito_pis: creditos.valorCreditoPis,
      valor_credito_cofins: creditos.valorCreditoCofins,
      aproveita_credito_ipi: creditos.aproveitaCreditoIpi,
      valor_credito_ipi: creditos.valorCreditoIpi,
      custo_total_item: custoTotalItem,
      custo_unitario_estoque: custoUnitarioEstoque,
      ativo: true,
      created_by: user?.id || null,
      updated_by: user?.id || null,
    }

    await pb.collection('notas_entrada_itens').create(payloadItem)
  }

  // 3. Gravar Parcelas
  if (dados.parcelas && dados.parcelas.length > 0) {
    for (const parc of dados.parcelas) {
      await pb.collection('notas_entrada_parcelas').create({
        nota_id: notaCriada.id,
        numero: parc.numero,
        data_vencimento: parc.data_vencimento,
        valor: parc.valor,
        forma_pagamento: parc.forma_pagamento || null,
        ativo: true,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      })
    }
  }

  await registrarAuditoria({
    tabela: 'notas_entrada',
    registro_id: notaCriada.id,
    acao: 'inclusao',
    valores_depois: {
      numero: notaCriada.numero,
      serie: notaCriada.serie,
      chave_acesso: notaCriada.chave_acesso,
      origem: 'Digitação',
      tipo_entrada: dados.tipo_entrada,
      valor_total: notaCriada.valor_total,
      itens_count: dados.itens.length,
    },
  })

  return notaCriada
}
