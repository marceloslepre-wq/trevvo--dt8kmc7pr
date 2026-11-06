import pb from '@/lib/pocketbase/client'
import {
  listarTodasUnidadesMedidaAtivas,
  salvarUnidadeMedida,
  UnidadeMedida,
} from '@/services/unidadesMedida'
import {
  validarGTIN,
  salvarProdutoFornecedor,
  salvarProduto,
  sugerirPrecoVenda,
  Produto,
} from '@/services/produtos'
import { obterAssinanteIdAtivo } from '@/services/tenancyHelper'
import { registrarAuditoria } from '@/services/auditoria'
import { sugerirTributacao, SugestaoFiscalResultado } from '@/services/motorFiscal'
import { obterConfigFiscalEmpresa } from '@/services/configFiscal'
import { NotaEntradaItem, vincularProdutoAoItemNota } from '@/services/notasEntrada'
import { Empresa } from '@/services/empresas'

export interface ItemNaoCadastradoInput {
  itemNota: NotaEntradaItem
  criar: boolean
  vincularProdutoId?: string
  descricao: string
  unidadeCompra: string
  unidadeVendaId: string
  fatorConversao: number
  precoCusto: number
  margemPercentual: number
  precoVenda: number
  ncm: string
  cest?: string
  gtin?: string
}

export interface ResultadoCadastroAutomatico {
  produtosCriados: {
    produtoId: string
    codigo: number
    descricao: string
    confiancaFiscal: string
  }[]
  produtosVinculados: {
    produtoId: string
    descricao: string
  }[]
  erros: {
    itemNumero: number
    descricao: string
    erro: string
  }[]
}

// Equivalências comuns de unidades
const MAPA_EQUIVALENCIAS_UNIDADES: Record<string, string> = {
  UND: 'UN',
  UNID: 'UN',
  UNIDADE: 'UN',
  PC: 'PC',
  PEC: 'PC',
  PECA: 'PC',
  CXA: 'CX',
  CAIXA: 'CX',
  PCT: 'PCT',
  PAC: 'PCT',
  PACOTE: 'PCT',
  KGS: 'KG',
  QUILO: 'KG',
  LT: 'L',
  LTS: 'L',
  LITRO: 'L',
}

/**
 * Normaliza e busca unidade correspondente nas unidades_medida do ERP
 */
export async function resolverUnidadeMedida(
  siglaXml: string,
  todasUnidades?: UnidadeMedida[],
): Promise<UnidadeMedida | null> {
  const unidades = todasUnidades || (await listarTodasUnidadesMedidaAtivas())
  const siglaLimpa = (siglaXml || '').trim().toUpperCase()

  // 1. Busca direta por sigla
  let encontrada = unidades.find((u) => u.sigla.toUpperCase() === siglaLimpa)
  if (encontrada) return encontrada

  // 2. Busca pelo mapa de equivalência
  const equivalente = MAPA_EQUIVALENCIAS_UNIDADES[siglaLimpa]
  if (equivalente) {
    encontrada = unidades.find((u) => u.sigla.toUpperCase() === equivalente)
    if (encontrada) return encontrada
  }

  return null
}

/**
 * Cria ou retorna unidade de medida se não existir
 */
export async function obterOuCriarUnidadeMedida(
  siglaXml: string,
  descricaoPadrao?: string,
): Promise<UnidadeMedida> {
  const siglaLimpa = (siglaXml || 'UN').trim().toUpperCase().slice(0, 6)
  const resolvida = await resolverUnidadeMedida(siglaLimpa)
  if (resolvida) return resolvida

  // Cria nova unidade
  return await salvarUnidadeMedida({
    sigla: siglaLimpa,
    descricao: descricaoPadrao || `Unidade ${siglaLimpa}`,
    aceita_fracionado: ['KG', 'L', 'M', 'M2', 'M3'].includes(siglaLimpa),
  })
}

/**
 * Processa a criação e vínculo automático de produtos a partir dos itens da nota de entrada
 */
export async function processarCadastroAutomaticoProdutos(params: {
  notaId: string
  notaInfo: {
    modelo?: string
    serie?: string
    numero?: string
    fornecedorNome?: string
    dataEmissao?: string
  }
  fornecedorId: string
  empresa: Partial<Empresa>
  itensParaProcessar: ItemNaoCadastradoInput[]
  grupoId?: string
  categoriaId?: string
  margemPadrao?: number
  aplicarClassificacaoFiscal?: boolean
  tipoEntrada?: string
  ufFornecedor?: string
}): Promise<ResultadoCadastroAutomatico> {
  const {
    notaId,
    notaInfo,
    fornecedorId,
    empresa,
    itensParaProcessar,
    grupoId,
    categoriaId,
    margemPadrao,
    aplicarClassificacaoFiscal = true,
    tipoEntrada,
    ufFornecedor,
  } = params

  const resultado: ResultadoCadastroAutomatico = {
    produtosCriados: [],
    produtosVinculados: [],
    erros: [],
  }

  const todasUnidades = await listarTodasUnidadesMedidaAtivas()
  const user = pb.authStore.record
  const assinanteIdAtivo = obterAssinanteIdAtivo()

  for (const itemInput of itensParaProcessar) {
    const { itemNota, criar, vincularProdutoId, fatorConversao, unidadeVendaId } = itemInput

    // Caso o usuário escolheu vincular a um produto existente
    if (!criar && vincularProdutoId) {
      try {
        await vincularProdutoAoItemNota(itemNota.id, vincularProdutoId, fatorConversao || 1)
        resultado.produtosVinculados.push({
          produtoId: vincularProdutoId,
          descricao: itemInput.descricao,
        })
      } catch (err: any) {
        resultado.erros.push({
          itemNumero: itemNota.numero_item,
          descricao: itemInput.descricao,
          erro: `Erro ao vincular item: ${err.message}`,
        })
      }
      continue
    }

    if (!criar) {
      continue
    }

    // Criar novo produto
    try {
      // 1. Tratar GTIN e verificar se já existe produto com esse GTIN
      const rawEan = (
        itemInput.gtin ||
        itemNota.gtin_fornecedor ||
        itemNota.codigo_barras_xml ||
        ''
      ).trim()
      let gtinValido = ''
      if (rawEan && rawEan !== 'SEM GTIN') {
        gtinValido = rawEan
      }

      const rawEanTrib = (itemNota.dados_adicionais_xml?.cEANTrib || '').trim()
      let gtinTribValido = ''
      if (rawEanTrib && rawEanTrib !== 'SEM GTIN') {
        gtinTribValido = rawEanTrib
      }

      // Se o GTIN já existir em outro produto, NÃO criar: vincular a esse produto e avisar
      if (gtinValido && gtinValido !== 'SEM GTIN') {
        const produtosComGtin = await pb.collection('produtos').getList<Produto>(1, 1, {
          filter: `gtin = '${gtinValido}' && ativo = true`,
        })

        if (produtosComGtin.totalItems > 0) {
          const produtoExistenteGtin = produtosComGtin.items[0]
          await vincularProdutoAoItemNota(itemNota.id, produtoExistenteGtin.id, fatorConversao || 1)
          resultado.produtosVinculados.push({
            produtoId: produtoExistenteGtin.id,
            descricao: `${itemInput.descricao} (Vinculado pelo GTIN existente ${gtinValido})`,
          })
          continue
        }
      }

      // 2. Unidade de Medida
      let unidIdFinal = unidadeVendaId
      if (!unidIdFinal) {
        const u = await obterOuCriarUnidadeMedida(
          itemNota.unidade_fornecedor || itemNota.unidade_xml || 'UN',
        )
        unidIdFinal = u.id
      }

      // Unidade tributável
      let unidTribIdFinal = unidIdFinal
      const uTribXml = itemNota.dados_adicionais_xml?.uTrib
      if (uTribXml) {
        const uTrib = await obterOuCriarUnidadeMedida(uTribXml)
        unidTribIdFinal = uTrib.id
      }

      const qCom = itemNota.quantidade_fornecedor || itemNota.quantidade_xml || 1
      const qTrib = itemNota.dados_adicionais_xml?.qTrib || qCom
      const fatorConversaoTributavel = qCom > 0 ? Number((qTrib / qCom).toFixed(4)) : 1

      // 3. Preços e Custos
      const custoFinalItem =
        itemNota.custo_unitario_estoque ||
        itemNota.valor_unitario_fornecedor ||
        itemNota.valor_unitario_xml ||
        0
      const margemFinal =
        itemInput.margemPercentual !== undefined ? itemInput.margemPercentual : margemPadrao || 50
      const precoVendaCalculado = sugerirPrecoVenda(custoFinalItem, margemFinal)

      // 4. Descrições
      const descLimpa = (
        itemInput.descricao ||
        itemNota.descricao_fornecedor ||
        'Produto sem descrição'
      ).trim()
      const desc120 = descLimpa.slice(0, 120)
      const descReduzida = descLimpa.slice(0, 40)

      // 5. Tags adicionais do XML (rastro, combustíveis etc.)
      const temRastro = Boolean(itemNota.dados_adicionais_xml?.rastro)
      const cBenefXml = itemNota.dados_adicionais_xml?.cBenef || ''
      const exTipiXml = itemNota.dados_adicionais_xml?.extipi || ''
      const codAnpXml = itemNota.dados_adicionais_xml?.codigo_anp || ''
      const descAnpXml = itemNota.dados_adicionais_xml?.descricao_anp || ''

      const origemItem = itemNota.origem || itemNota.origem_mercadoria_xml || '0'
      const ncmFinal = itemInput.ncm || itemNota.ncm_fornecedor || itemNota.ncm_xml || ''
      const cestFinal = itemInput.cest || itemNota.cest_fornecedor || itemNota.cest_xml || ''

      const payloadProduto: Record<string, unknown> = {
        tipo: 'Produto',
        descricao: desc120,
        descricao_reduzida: descReduzida,
        gtin: gtinValido,
        gtin_tributavel: gtinTribValido,
        referencia: itemNota.codigo_fornecedor || '',
        fornecedor_principal_id: fornecedorId || null,
        unidade_id: unidIdFinal,
        unidade_tributavel_id: unidTribIdFinal,
        fator_conversao_tributavel: fatorConversaoTributavel,
        ncm: ncmFinal,
        ex_tipi: exTipiXml,
        cest: cestFinal,
        origem: origemItem,
        c_benef: cBenefXml,
        codigo_anp: codAnpXml,
        descricao_anp: descAnpXml,
        controla_estoque: true,
        controla_lote_validade: temRastro,
        preco_custo: custoFinalItem,
        custo_final: custoFinalItem,
        margem_percentual: margemFinal,
        preco_venda: precoVendaCalculado,
        grupo_id: grupoId || null,
        categoria_id: categoriaId || null,
        fiscal_revisado: false,
        observacoes: `Criado automaticamente pela NF ${notaInfo.modelo || '55'}/${notaInfo.serie || '1'}/${notaInfo.numero || ''} de ${notaInfo.fornecedorNome || ''} em ${notaInfo.dataEmissao || new Date().toLocaleDateString('pt-BR')}`,
        ativo: true,
        assinante_id: assinanteIdAtivo || undefined,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      }

      // 6. Sugestão Fiscal Automática
      let confiancaGeral = 'Média'
      if (aplicarClassificacaoFiscal) {
        const itemXmlSimulado = {
          ncm: ncmFinal,
          cest: cestFinal,
          origem: origemItem,
          cstIcms: itemNota.cst_icms_fornecedor || itemNota.cst_icms_xml,
          cfop: itemNota.cfop_fornecedor || itemNota.cfop_xml,
          cstPis: itemNota.cst_pis_fornecedor || itemNota.dados_adicionais_xml?.cstPis,
          cstCofins: itemNota.cst_cofins_fornecedor || itemNota.dados_adicionais_xml?.cstCofins,
          cstIbsCbs: itemNota.cst_ibs_cbs || itemNota.dados_adicionais_xml?.cstIbsCbs,
          cClassTrib: itemNota.c_class_trib || itemNota.dados_adicionais_xml?.cClassTrib,
        }

        const sugestao = await sugerirTributacao({
          itemXml: itemXmlSimulado,
          empresa,
          tipoEntrada,
          ufFornecedor,
        })

        confiancaGeral = sugestao.confianca
        Object.assign(payloadProduto, sugestao.campos)
      }

      // Criação do produto utilizando salvarProduto para centralizar numeração e assinante_id
      const produtoCriado = await salvarProduto(payloadProduto as Partial<Produto>)

      // Gravar produtos_fornecedores
      if (fornecedorId) {
        await salvarProdutoFornecedor({
          produto_id: produtoCriado.id,
          fornecedor_id: fornecedorId,
          codigo_no_fornecedor: itemNota.codigo_fornecedor || '',
          descricao_no_fornecedor: itemNota.descricao_fornecedor || '',
          unidade_fornecedor: itemNota.unidade_fornecedor || itemNota.unidade_xml || '',
          fator_conversao: fatorConversao || 1,
          ultimo_preco_compra:
            itemNota.valor_unitario_fornecedor || itemNota.valor_unitario_xml || 0,
          data_ultima_compra: notaInfo.dataEmissao || new Date().toISOString(),
        })
      }

      // Vínculo ao item da nota
      await vincularProdutoAoItemNota(itemNota.id, produtoCriado.id, fatorConversao || 1)

      // Log de Auditoria
      await registrarAuditoria({
        tabela: 'produtos',
        registro_id: produtoCriado.id,
        acao: 'inclusao',
        valores_depois: {
          motivo: 'Criado automaticamente na importação de NF-e',
          nota_id: notaId,
          produto_codigo: produtoCriado.codigo,
          descricao: produtoCriado.descricao,
          confianca_fiscal: confiancaGeral,
        },
      })

      resultado.produtosCriados.push({
        produtoId: produtoCriado.id,
        codigo: produtoCriado.codigo,
        descricao: produtoCriado.descricao,
        confiancaFiscal: confiancaGeral,
      })
    } catch (err: any) {
      resultado.erros.push({
        itemNumero: itemNota.numero_item,
        descricao: itemInput.descricao,
        erro: err.message,
      })
    }
  }

  return resultado
}
