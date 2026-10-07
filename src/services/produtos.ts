import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export type TipoProduto = 'Produto' | 'Serviço' | 'Kit'

export interface Produto {
  id: string
  ativo: boolean
  codigo: number
  tipo: TipoProduto
  descricao: string
  descricao_reduzida?: string
  gtin?: string
  gtin_tributavel?: string
  referencia?: string
  marca_id?: string
  grupo_id?: string
  categoria_id?: string
  fornecedor_principal_id?: string
  foto?: string
  fotos_adicionais?: string[]
  observacoes?: string

  // Unidades
  unidade_id?: string
  unidade_tributavel_id?: string
  fator_conversao_tributavel?: number

  // Preços
  preco_custo?: number
  outras_despesas_percentual?: number
  custo_final?: number
  margem_percentual?: number
  preco_venda?: number
  preco_promocional?: number
  promocao_inicio?: string
  promocao_fim?: string
  permite_desconto?: boolean
  desconto_maximo_percentual?: number

  // Estoque
  controla_estoque?: boolean
  estoque_minimo?: number
  estoque_maximo?: number
  localizacao?: string
  controla_lote_validade?: boolean
  dias_validade?: number
  vende_fracionado?: boolean
  vende_no_pdv?: boolean
  peso_liquido_kg?: number
  peso_bruto_kg?: number
  altura_cm?: number
  largura_cm?: number
  comprimento_cm?: number

  // Fiscais
  perfil_tributario_id?: string
  ncm?: string
  ex_tipi?: string
  cest?: string
  origem?: string
  tipo_item_sped?: string
  codigo_genero?: string
  codigo_servico_lc116?: string
  indicador_escala_relevante?: string
  cnpj_fabricante?: string
  c_benef?: string
  codigo_anp?: string
  descricao_anp?: string

  // CFOPs
  cfop_venda_interna?: string
  cfop_venda_interestadual?: string
  cfop_compra_interna?: string
  cfop_compra_interestadual?: string

  // ICMS
  cst_icms?: string
  csosn?: string
  mod_bc_icms?: string
  aliquota_icms?: number
  reducao_bc_icms_percentual?: number
  aliquota_fcp?: number
  mod_bc_icms_st?: string
  mva_percentual?: number
  reducao_bc_icms_st_percentual?: number
  aliquota_icms_st?: number
  aliquota_fcp_st?: number
  percentual_diferimento?: number
  motivo_desoneracao?: string
  aliquota_icms_interestadual?: number

  // IPI
  cst_ipi_saida?: string
  cst_ipi_entrada?: string
  codigo_enquadramento_ipi?: string
  tipo_calculo_ipi?: 'Percentual' | 'Valor por unidade'
  aliquota_ipi?: number
  valor_ipi_unidade?: number

  // PIS / COFINS
  cst_pis_saida?: string
  cst_pis_entrada?: string
  aliquota_pis?: number
  cst_cofins_saida?: string
  cst_cofins_entrada?: string
  aliquota_cofins?: number
  tipo_calculo_pis_cofins?: 'Percentual' | 'Valor por unidade'
  valor_pis_unidade?: number
  valor_cofins_unidade?: number
  natureza_receita_pis_cofins?: string

  // IBS / CBS
  cst_ibs_cbs?: string
  c_class_trib?: string
  aliquota_ibs_uf?: number
  aliquota_ibs_municipio?: number
  aliquota_cbs?: number
  reducao_ibs_cbs_percentual?: number

  // infAdProd e revisão
  informacoes_adicionais_item?: string
  fiscal_revisado?: boolean
  fiscal_revisado_por?: string
  fiscal_revisado_em?: string

  created_by?: string
  updated_by?: string
  created?: string
  updated?: string

  // Expansões comuns
  expand?: {
    marca_id?: { id: string; nome: string }
    grupo_id?: { id: string; codigo: string; nome: string; margem_padrao_percentual?: number }
    categoria_id?: { id: string; codigo?: string; nome: string; margem_padrao_percentual?: number }
    fornecedor_principal_id?: { id: string; razao_social: string; nome_fantasia?: string }
    unidade_id?: { id: string; sigla: string; descricao: string; aceita_fracionado: boolean }
    unidade_tributavel_id?: { id: string; sigla: string; descricao: string }
    perfil_tributario_id?: { id: string; nome: string; regime: string }
  }
}

export interface ProdutoKitItem {
  id: string
  ativo: boolean
  produto_kit_id: string
  produto_item_id: string
  quantidade: number
  created?: string
  updated?: string
  expand?: {
    produto_item_id?: Produto
  }
}

export interface ProdutoFornecedor {
  id: string
  ativo: boolean
  produto_id: string
  fornecedor_id: string
  codigo_no_fornecedor?: string
  descricao_no_fornecedor?: string
  unidade_fornecedor?: string
  fator_conversao?: number
  ultimo_preco_compra?: number
  data_ultima_compra?: string
  created?: string
  updated?: string
  expand?: {
    fornecedor_id?: { id: string; razao_social: string; nome_fantasia?: string; cnpj?: string }
  }
}

export interface ProdutoConversaoUnidade {
  id: string
  ativo: boolean
  produto_id: string
  unidade_id: string
  fator_conversao: number
  gtin_unidade?: string
  created?: string
  updated?: string
  expand?: {
    unidade_id?: { id: string; sigla: string; descricao: string }
  }
}

export interface ProdutoHistorico {
  id: string
  ativo: boolean
  produto_id: string
  data_alteracao: string
  descricao_anterior: string
  codigo_anterior?: number
  usuario_id?: string
  created?: string
  updated?: string
  expand?: {
    usuario_id?: { id: string; name: string; email: string }
  }
}

export interface ListarProdutosParams {
  busca?: string
  grupo_id?: string
  categoria_id?: string
  marca_id?: string
  fornecedor_id?: string
  tipo?: TipoProduto | 'todos'
  situacao?: 'todos' | 'ativos' | 'inativos'
  sem_ncm?: boolean
  fiscal_nao_revisado?: boolean
  criados_por_entrada_nota?: boolean
  pagina?: number
  itensPorPagina?: number
  ordenacao?: string
}

export interface ResultadoPaginado<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

// -------------------------------------------------------------
// VALIDAÇÃO GTIN (8, 12, 13 ou 14 dígitos com dígito verificador GS1)
// -------------------------------------------------------------
export function validarGTIN(codigoRaw: string): boolean {
  if (!codigoRaw) return true
  const codigo = codigoRaw.trim().toUpperCase()
  if (codigo === 'SEM GTIN' || codigo === 'SEMGTIN') return true

  // Deve ter somente dígitos e comprimentos válidos 8, 12, 13 ou 14
  if (!/^\d+$/.test(codigo)) return false
  if (![8, 12, 13, 14].includes(codigo.length)) return false

  const chars = codigo.split('').map(Number)
  const dvInformado = chars[chars.length - 1]
  const digitosBase = chars.slice(0, -1).reverse()

  let soma = 0
  for (let i = 0; i < digitosBase.length; i++) {
    const peso = i % 2 === 0 ? 3 : 1
    soma += digitosBase[i] * peso
  }

  const resto = soma % 10
  const dvEsperado = resto === 0 ? 0 : 10 - resto

  return dvEsperado === dvInformado
}

// -------------------------------------------------------------
// AUXILIARES DE CÁLCULO DE PREÇO
// -------------------------------------------------------------
export function calcularCustoFinal(precoCusto: number, outrasDespesasPercentual: number): number {
  const custo = precoCusto || 0
  const desp = outrasDespesasPercentual || 0
  return Number((custo * (1 + desp / 100)).toFixed(4))
}

export function sugerirPrecoVenda(custoFinal: number, margemPercentual: number): number {
  const custo = custoFinal || 0
  const margem = margemPercentual || 0
  return Number((custo * (1 + margem / 100)).toFixed(2))
}

export function recalcularMargem(precoVenda: number, custoFinal: number): number {
  if (!custoFinal || custoFinal <= 0) return 0
  return Number(((precoVenda / custoFinal - 1) * 100).toFixed(4))
}

export function calcularMargemSobreVenda(precoVenda: number, custoFinal: number): number {
  if (!precoVenda || precoVenda <= 0) return 0
  return Number((((precoVenda - custoFinal) / precoVenda) * 100).toFixed(4))
}

export function calcularMarkup(precoVenda: number, custoFinal: number): number {
  if (!custoFinal || custoFinal <= 0) return 0
  return Number(((precoVenda / custoFinal - 1) * 100).toFixed(4))
}

// -------------------------------------------------------------
// OBTENÇÃO DO PRÓXIMO CÓDIGO SEQUENCIAL
// -------------------------------------------------------------
export async function obterProximoCodigoProduto(): Promise<number> {
  try {
    const registros = await pb.collection('produtos').getList<Produto>(1, 1, {
      sort: '-codigo',
      fields: 'codigo',
    })

    if (registros.items.length === 0 || !registros.items[0].codigo) {
      return 1
    }

    return Number(registros.items[0].codigo) + 1
  } catch (err) {
    console.error('Erro ao buscar próximo código de produto:', err)
    return 1
  }
}

// -------------------------------------------------------------
// CRUD PRODUTOS
// -------------------------------------------------------------
export async function listarProdutos(
  params: ListarProdutosParams = {},
): Promise<ResultadoPaginado<Produto>> {
  const pagina = params.pagina || 1
  const itensPorPagina = params.itensPorPagina || 20
  const ordenacao = params.ordenacao || '-created'

  const condicoes: string[] = []

  // Filtro de situação
  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  // Filtro de tipo
  if (params.tipo && params.tipo !== 'todos') {
    condicoes.push(`tipo = '${params.tipo}'`)
  }

  // Filtro de grupo
  if (params.grupo_id && params.grupo_id !== 'todos') {
    condicoes.push(`grupo_id = '${params.grupo_id}'`)
  }

  // Filtro de categoria
  if (params.categoria_id && params.categoria_id !== 'todos') {
    condicoes.push(`categoria_id = '${params.categoria_id}'`)
  }

  // Filtro de marca
  if (params.marca_id && params.marca_id !== 'todos') {
    condicoes.push(`marca_id = '${params.marca_id}'`)
  }

  // Filtro de fornecedor
  if (params.fornecedor_id && params.fornecedor_id !== 'todos') {
    condicoes.push(`fornecedor_principal_id = '${params.fornecedor_id}'`)
  }

  // Sem NCM
  if (params.sem_ncm) {
    condicoes.push("(ncm = '' || ncm = null)")
  }

  // Fiscal não revisado
  if (params.fiscal_nao_revisado) {
    condicoes.push('(fiscal_revisado = false || fiscal_revisado = null)')
  }

  // Criados pela entrada de notas
  if (params.criados_por_entrada_nota) {
    condicoes.push("observacoes ~ 'Criado automaticamente pela NF'")
  }

  // Busca textual
  if (params.busca && params.busca.trim()) {
    const termo = params.busca.trim().replace(/['"]/g, '')
    const buscaNumerica = !isNaN(Number(termo)) ? `codigo = ${Number(termo)} || ` : ''
    condicoes.push(
      `(${buscaNumerica}descricao ~ '${termo}' || gtin ~ '${termo}' || referencia ~ '${termo}')`,
    )
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('produtos').getList<Produto>(pagina, itensPorPagina, {
    filter,
    sort: ordenacao,
    expand:
      'marca_id,grupo_id,categoria_id,fornecedor_principal_id,unidade_id,unidade_tributavel_id,perfil_tributario_id',
  })

  return {
    items: res.items,
    page: res.page,
    perPage: res.perPage,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
  }
}

export async function obterProdutoPorId(id: string): Promise<Produto> {
  return await pb.collection('produtos').getOne<Produto>(id, {
    expand:
      'marca_id,grupo_id,categoria_id,fornecedor_principal_id,unidade_id,unidade_tributavel_id,perfil_tributario_id',
  })
}

export async function buscarProdutoPorCodigoOuGtin(termo: string): Promise<Produto | null> {
  const t = termo.trim().replace(/['"]/g, '')
  if (!t) return null

  const isNum = !isNaN(Number(t))
  const filter = isNum
    ? `codigo = ${Number(t)} || gtin = '${t}' || referencia = '${t}'`
    : `gtin = '${t}' || referencia = '${t}' || descricao ~ '${t}'`

  try {
    const res = await pb.collection('produtos').getList<Produto>(1, 1, {
      filter: `ativo = true && (${filter})`,
      expand: 'marca_id,grupo_id,categoria_id,unidade_id',
    })
    return res.items[0] || null
  } catch {
    return null
  }
}

export interface ValidarProdutoOptions {
  ignorarValidacoesFiscais?: boolean
  regimeEmpresa?: 'Simples Nacional' | 'Regime Normal'
}

export interface PendenciaFiscalInfo {
  temPendencia: boolean
  motivos: string[]
  semNcm: boolean
  semCestSugerido: boolean
  semTributacaoIcms: boolean
  semPisCofins: boolean
  naoRevisado: boolean
}

export function verificarPendenciasFiscaisProduto(
  p: Produto,
  regimeEmpresa?: 'Simples Nacional' | 'Regime Normal',
  temCestSugeridoPendente = false,
): PendenciaFiscalInfo {
  const motivos: string[] = []
  let semNcm = false
  let semTributacaoIcms = false
  let semPisCofins = false
  const naoRevisado = !p.fiscal_revisado

  if (p.tipo === 'Produto') {
    if (!p.ncm || !p.ncm.trim()) {
      semNcm = true
      motivos.push('Sem NCM preenchido')
    }

    if (regimeEmpresa === 'Simples Nacional') {
      if (!p.csosn || !p.csosn.trim()) {
        semTributacaoIcms = true
        motivos.push('Sem CSOSN')
      }
    } else if (regimeEmpresa === 'Regime Normal') {
      if (!p.cst_icms || !p.cst_icms.trim()) {
        semTributacaoIcms = true
        motivos.push('Sem CST ICMS')
      }
    } else {
      if (!p.cst_icms && !p.csosn) {
        semTributacaoIcms = true
        motivos.push('Sem CST ou CSOSN')
      }
    }

    if (!p.cst_pis_saida || !p.cst_cofins_saida) {
      semPisCofins = true
      motivos.push('Sem CST de PIS/COFINS')
    }

    if (!p.cfop_venda_interna || !p.cfop_venda_interna.trim()) {
      motivos.push('Sem CFOP de venda interna')
    }

    if (temCestSugeridoPendente) {
      motivos.push('Sem CEST sugerido para a NCM')
    }
  }

  if (naoRevisado) {
    motivos.push('Fiscal não revisado pelo contador')
  }

  return {
    temPendencia: motivos.length > 0,
    motivos,
    semNcm,
    semCestSugerido: temCestSugeridoPendente,
    semTributacaoIcms,
    semPisCofins,
    naoRevisado,
  }
}

/**
 * Extrai os campos fiscais de um Perfil Tributário Completo para serem aplicados a um produto.
 * Reaproveita rigorosamente a mesma regra implementada na aba Fiscal do cadastro de produtos.
 */
export function extrairCamposFiscaisDoPerfil(perfil: any): Partial<Produto> {
  const novosCampos: Partial<Produto> = {
    perfil_tributario_id: perfil.id,
  }

  // Origem, tipo item sped e c_benef vêm do cabeçalho do perfil
  if (perfil.origem_padrao) novosCampos.origem = perfil.origem_padrao
  if (perfil.tipo_item_sped_padrao) novosCampos.tipo_item_sped = perfil.tipo_item_sped_padrao
  if (perfil.c_benef) novosCampos.c_benef = perfil.c_benef

  // Regras dos cenários
  const regras = Array.isArray(perfil.regras) ? perfil.regras : []
  const regraVendaInternaConsumidor = regras.find(
    (r: any) => r.cenario === 'VENDA_INTERNA_CONSUMIDOR',
  )
  const regraVendaInternaContribuinte = regras.find(
    (r: any) => r.cenario === 'VENDA_INTERNA_CONTRIBUINTE',
  )
  const regraVendaInterestadualContribuinte = regras.find(
    (r: any) => r.cenario === 'VENDA_INTERESTADUAL_CONTRIBUINTE',
  )
  const regraCompraInterna = regras.find((r: any) => r.cenario === 'COMPRA_INTERNA')
  const regraCompraInterestadual = regras.find((r: any) => r.cenario === 'COMPRA_INTERESTADUAL')

  // CFOPs especificados
  const cfopVendaInterna =
    regraVendaInternaConsumidor?.expand?.cfop?.codigo ||
    regraVendaInternaConsumidor?.cfop ||
    regraVendaInternaContribuinte?.expand?.cfop?.codigo ||
    regraVendaInternaContribuinte?.cfop
  if (cfopVendaInterna) novosCampos.cfop_venda_interna = cfopVendaInterna

  const cfopVendaInterestadual =
    regraVendaInterestadualContribuinte?.expand?.cfop?.codigo ||
    regraVendaInterestadualContribuinte?.cfop
  if (cfopVendaInterestadual) novosCampos.cfop_venda_interestadual = cfopVendaInterestadual

  const cfopCompraInterna = regraCompraInterna?.expand?.cfop?.codigo || regraCompraInterna?.cfop
  if (cfopCompraInterna) novosCampos.cfop_compra_interna = cfopCompraInterna

  const cfopCompraInterestadual =
    regraCompraInterestadual?.expand?.cfop?.codigo || regraCompraInterestadual?.cfop
  if (cfopCompraInterestadual) novosCampos.cfop_compra_interestadual = cfopCompraInterestadual

  // Regra prioritária para impostos: VENDA_INTERNA_CONSUMIDOR (ou primeiro cenário de venda)
  const regraImpostos =
    regraVendaInternaConsumidor ||
    regraVendaInternaContribuinte ||
    regraVendaInterestadualContribuinte ||
    regras[0]

  if (regraImpostos) {
    // ICMS
    if (regraImpostos.cst_icms !== undefined) novosCampos.cst_icms = regraImpostos.cst_icms
    if (regraImpostos.csosn !== undefined) novosCampos.csosn = regraImpostos.csosn
    if (regraImpostos.mod_bc_icms !== undefined) novosCampos.mod_bc_icms = regraImpostos.mod_bc_icms
    if (regraImpostos.aliquota_icms !== undefined)
      novosCampos.aliquota_icms = regraImpostos.aliquota_icms
    if (regraImpostos.reducao_bc_icms_percentual !== undefined)
      novosCampos.reducao_bc_icms_percentual = regraImpostos.reducao_bc_icms_percentual
    if (regraImpostos.aliquota_fcp !== undefined)
      novosCampos.aliquota_fcp = regraImpostos.aliquota_fcp

    // ICMS ST
    if (regraImpostos.mod_bc_icms_st !== undefined)
      novosCampos.mod_bc_icms_st = regraImpostos.mod_bc_icms_st
    if (regraImpostos.mva_percentual !== undefined)
      novosCampos.mva_percentual = regraImpostos.mva_percentual
    if (regraImpostos.reducao_bc_icms_st_percentual !== undefined)
      novosCampos.reducao_bc_icms_st_percentual = regraImpostos.reducao_bc_icms_st_percentual
    if (regraImpostos.aliquota_icms_st !== undefined)
      novosCampos.aliquota_icms_st = regraImpostos.aliquota_icms_st
    if (regraImpostos.aliquota_fcp_st !== undefined)
      novosCampos.aliquota_fcp_st = regraImpostos.aliquota_fcp_st

    // Diferimento / desoneração
    if (regraImpostos.percentual_diferimento !== undefined)
      novosCampos.percentual_diferimento = regraImpostos.percentual_diferimento
    if (regraImpostos.motivo_desoneracao !== undefined)
      novosCampos.motivo_desoneracao = regraImpostos.motivo_desoneracao

    // IPI
    if (regraImpostos.cst_ipi !== undefined) novosCampos.cst_ipi_saida = regraImpostos.cst_ipi
    if (regraImpostos.codigo_enquadramento_ipi !== undefined)
      novosCampos.codigo_enquadramento_ipi = regraImpostos.codigo_enquadramento_ipi
    if (regraImpostos.aliquota_ipi !== undefined)
      novosCampos.aliquota_ipi = regraImpostos.aliquota_ipi

    // PIS / COFINS
    if (regraImpostos.cst_pis !== undefined) novosCampos.cst_pis_saida = regraImpostos.cst_pis
    if (regraImpostos.aliquota_pis !== undefined)
      novosCampos.aliquota_pis = regraImpostos.aliquota_pis
    if (regraImpostos.cst_cofins !== undefined)
      novosCampos.cst_cofins_saida = regraImpostos.cst_cofins
    if (regraImpostos.aliquota_cofins !== undefined)
      novosCampos.aliquota_cofins = regraImpostos.aliquota_cofins
    if (regraImpostos.natureza_receita_pis_cofins !== undefined)
      novosCampos.natureza_receita_pis_cofins = regraImpostos.natureza_receita_pis_cofins

    // IBS / CBS
    if (regraImpostos.cst_ibs_cbs !== undefined) novosCampos.cst_ibs_cbs = regraImpostos.cst_ibs_cbs
    if (regraImpostos.c_class_trib !== undefined)
      novosCampos.c_class_trib = regraImpostos.c_class_trib
    if (regraImpostos.aliquota_ibs_uf !== undefined)
      novosCampos.aliquota_ibs_uf = regraImpostos.aliquota_ibs_uf
    if (regraImpostos.aliquota_ibs_municipio !== undefined)
      novosCampos.aliquota_ibs_municipio = regraImpostos.aliquota_ibs_municipio
    if (regraImpostos.aliquota_cbs !== undefined)
      novosCampos.aliquota_cbs = regraImpostos.aliquota_cbs
    if (regraImpostos.reducao_ibs_cbs_percentual !== undefined)
      novosCampos.reducao_ibs_cbs_percentual = regraImpostos.reducao_ibs_cbs_percentual
  }

  // Toda alteração fiscal zera a revisão
  novosCampos.fiscal_revisado = false

  return novosCampos
}

export function produtoTemFiscalIncompleto(
  p: Produto,
  regimeEmpresa?: 'Simples Nacional' | 'Regime Normal',
): boolean {
  if (p.tipo !== 'Produto') return false
  if (!p.ncm || !p.ncm.trim()) return true
  if (p.origem === undefined || p.origem === null || p.origem === '') return true
  if (!p.cfop_venda_interna || !p.cfop_venda_interna.trim()) return true
  if (regimeEmpresa === 'Simples Nacional') {
    if (!p.csosn) return true
  } else if (regimeEmpresa === 'Regime Normal') {
    if (!p.cst_icms) return true
  } else {
    if (!p.cst_icms && !p.csosn) return true
  }
  if (!p.cst_pis_saida || !p.cst_cofins_saida) return true
  return false
}

export async function validarDadosProduto(
  dados: Partial<Produto>,
  idAtual?: string,
  options?: ValidarProdutoOptions,
): Promise<{ valido: boolean; erros: Record<string, string>; temErroFiscal: boolean }> {
  const erros: Record<string, string> = {}
  let temErroFiscal = false

  if (!dados.tipo) {
    erros.tipo = 'O tipo de produto é obrigatório (Produto, Serviço ou Kit).'
  }

  if (!dados.descricao || !dados.descricao.trim()) {
    erros.descricao = 'A descrição do produto é obrigatória.'
  } else if (dados.descricao.trim().length > 120) {
    erros.descricao = 'A descrição deve ter no máximo 120 caracteres.'
  }

  if (dados.descricao_reduzida && dados.descricao_reduzida.length > 40) {
    erros.descricao_reduzida = 'A descrição reduzida deve ter no máximo 40 caracteres.'
  }

  // GTIN
  if (dados.gtin && dados.gtin.trim()) {
    const gtinNormalizado = dados.gtin.trim().toUpperCase()
    if (!validarGTIN(gtinNormalizado)) {
      erros.gtin = 'GTIN inválido. Informe 8, 12, 13 ou 14 dígitos com DV válido ou "SEM GTIN".'
    } else if (gtinNormalizado !== 'SEM GTIN' && gtinNormalizado !== 'SEMGTIN') {
      // Verificar unicidade
      try {
        const filterDup = idAtual
          ? `gtin = '${gtinNormalizado}' && id != '${idAtual}'`
          : `gtin = '${gtinNormalizado}'`
        const dup = await pb.collection('produtos').getList<Produto>(1, 1, { filter: filterDup })
        if (dup.totalItems > 0) {
          erros.gtin = `O GTIN "${gtinNormalizado}" já está cadastrado para o produto "${dup.items[0].descricao}".`
        }
      } catch (err) {
        console.error('Erro ao verificar unicidade de GTIN:', err)
      }
    }
  }

  // GTIN Tributável
  if (dados.gtin_tributavel && dados.gtin_tributavel.trim()) {
    if (!validarGTIN(dados.gtin_tributavel.trim().toUpperCase())) {
      erros.gtin_tributavel =
        'GTIN Tributável inválido. Informe 8, 12, 13 ou 14 dígitos ou "SEM GTIN".'
    }
  }

  // Unidade
  if (!dados.unidade_id) {
    erros.unidade_id = 'A unidade comercial é obrigatória.'
  }

  // Preço de venda
  if (dados.tipo === 'Produto' || dados.tipo === 'Serviço') {
    if (dados.preco_venda === undefined || dados.preco_venda === null || dados.preco_venda < 0) {
      erros.preco_venda = 'O preço de venda é obrigatório.'
    }
  }

  // VALIDAÇÕES FISCAIS (quando não for rascunho e for tipo Produto)
  if (!options?.ignorarValidacoesFiscais && dados.tipo === 'Produto') {
    // 1. NCM obrigatório
    const ncmLimpo = (dados.ncm || '').replace(/\D/g, '')
    if (!ncmLimpo) {
      erros.ncm = 'O NCM é obrigatório para produtos.'
      temErroFiscal = true
    } else {
      // NCM precisa existir na tabela de NCM (operação assíncrona tolerante)
      try {
        const ncmExiste = await pb.collection('ncm').getList(1, 1, {
          filter: `codigo = '${ncmLimpo}'`,
        })
        if (ncmExiste.totalItems === 0) {
          erros.ncm = `O código NCM ${ncmLimpo} não foi localizado na tabela de NCMs cadastrados.`
          temErroFiscal = true
        }
      } catch (err) {
        console.warn('Verificação de existência de NCM falhou:', err)
      }
    }

    // 2. CEST existente se preenchido
    const cestLimpo = (dados.cest || '').replace(/\D/g, '')
    if (cestLimpo) {
      try {
        const cestExiste = await pb.collection('cest').getList(1, 1, {
          filter: `codigo = '${cestLimpo}'`,
        })
        if (cestExiste.totalItems === 0) {
          erros.cest = `O código CEST ${cestLimpo} não foi localizado na tabela de CESTs cadastrados.`
          temErroFiscal = true
        }
      } catch (err) {
        console.warn('Verificação de existência de CEST falhou:', err)
      }

      // Se houver CEST e indicador_escala_relevante for "N", cnpj_fabricante é obrigatório
      if (dados.indicador_escala_relevante === 'N') {
        const cnpjFab = (dados.cnpj_fabricante || '').replace(/\D/g, '')
        if (!cnpjFab || cnpjFab.length !== 14) {
          erros.cnpj_fabricante =
            'CNPJ do fabricante é obrigatório quando a escala não é relevante.'
          temErroFiscal = true
        }
      }
    }

    // 3. Origem obrigatória
    if (dados.origem === undefined || dados.origem === null || dados.origem === '') {
      erros.origem = 'A Origem da mercadoria é obrigatória.'
      temErroFiscal = true
    }

    // 4. Tipo do item SPED obrigatório
    if (!dados.tipo_item_sped) {
      erros.tipo_item_sped = 'O Tipo do item no SPED é obrigatório.'
      temErroFiscal = true
    }

    // 5. CFOP de venda interna obrigatório (começando com 5)
    const cfopVenda = (dados.cfop_venda_interna || '').replace(/\D/g, '')
    if (!cfopVenda) {
      erros.cfop_venda_interna = 'O CFOP de venda interna é obrigatório.'
      temErroFiscal = true
    } else if (!cfopVenda.startsWith('5')) {
      erros.cfop_venda_interna =
        'O CFOP de venda interna deve iniciar com 5 (operação estadual de saída).'
      temErroFiscal = true
    }

    // CFOP de venda interestadual deve começar com 6 se preenchido
    const cfopInterestadual = (dados.cfop_venda_interestadual || '').replace(/\D/g, '')
    if (cfopInterestadual && !cfopInterestadual.startsWith('6')) {
      erros.cfop_venda_interestadual =
        'O CFOP de venda interestadual deve iniciar com 6 (saída para outro estado).'
      temErroFiscal = true
    }

    // CFOP de compra interna deve começar com 1 se preenchido
    const cfopCompraInt = (dados.cfop_compra_interna || '').replace(/\D/g, '')
    if (cfopCompraInt && !cfopCompraInt.startsWith('1')) {
      erros.cfop_compra_interna = 'O CFOP de compra interna deve iniciar com 1 (entrada estadual).'
      temErroFiscal = true
    }

    // CFOP de compra interestadual deve começar com 2 se preenchido
    const cfopCompraExt = (dados.cfop_compra_interestadual || '').replace(/\D/g, '')
    if (cfopCompraExt && !cfopCompraExt.startsWith('2')) {
      erros.cfop_compra_interestadual =
        'O CFOP de compra interestadual deve iniciar com 2 (entrada de outro estado).'
      temErroFiscal = true
    }

    // 6. CST ICMS ou CSOSN conforme regime da empresa
    const ehSimples = options?.regimeEmpresa === 'Simples Nacional'
    if (ehSimples) {
      if (!dados.csosn) {
        erros.csosn = 'O CSOSN é obrigatório para empresas do Simples Nacional.'
        temErroFiscal = true
      }
    } else {
      if (!dados.cst_icms) {
        erros.cst_icms = 'O CST ICMS é obrigatório para empresas do Regime Normal.'
        temErroFiscal = true
      }
    }

    // 7. Se CST/CSOSN indicar ST: mod_bc_icms_st e aliquota_icms_st são obrigatórios
    const cstST = ['10', '30', '70', '90'].includes(dados.cst_icms || '')
    const csosnST = ['201', '202', '203', '900'].includes(dados.csosn || '')
    if (cstST || csosnST) {
      if (!dados.mod_bc_icms_st) {
        erros.mod_bc_icms_st = 'A Modalidade de BC do ICMS ST é obrigatória para operações com ST.'
        temErroFiscal = true
      }
      if (
        dados.aliquota_icms_st === undefined ||
        dados.aliquota_icms_st === null ||
        Number(dados.aliquota_icms_st) <= 0
      ) {
        erros.aliquota_icms_st = 'A Alíquota do ICMS ST é obrigatória para operações com ST.'
        temErroFiscal = true
      }
    }

    // 8. CST PIS e COFINS de saída obrigatórios
    if (!dados.cst_pis_saida) {
      erros.cst_pis_saida = 'O CST de PIS de saída é obrigatório.'
      temErroFiscal = true
    }
    if (!dados.cst_cofins_saida) {
      erros.cst_cofins_saida = 'O CST de COFINS de saída é obrigatório.'
      temErroFiscal = true
    }

    // Natureza da receita PIS/COFINS obrigatória para CSTs 04 a 09
    const precisaNaturezaReceita =
      ['04', '05', '06', '07', '08', '09'].includes(dados.cst_pis_saida || '') ||
      ['04', '05', '06', '07', '08', '09'].includes(dados.cst_cofins_saida || '')
    if (precisaNaturezaReceita && !dados.natureza_receita_pis_cofins?.trim()) {
      erros.natureza_receita_pis_cofins =
        'A Natureza da Receita é obrigatória para este CST de PIS/COFINS.'
      temErroFiscal = true
    }
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    temErroFiscal,
  }
}

export async function salvarProduto(
  dados: Partial<Produto> & {
    fotoArquivo?: File | null
    fotosAdicionaisArquivos?: File[]
  },
): Promise<Produto> {
  const ehEdicao = Boolean(dados.id)
  let produtoAntes: Produto | null = null

  if (ehEdicao && dados.id) {
    produtoAntes = await obterProdutoPorId(dados.id)
  }

  let codigoFinal = dados.codigo
  if (!ehEdicao && (!codigoFinal || codigoFinal <= 0)) {
    codigoFinal = await obterProximoCodigoProduto()
  }

  // Preenchimento automático do código gênero a partir dos 2 primeiros dígitos do NCM
  let codigoGeneroFinal = dados.codigo_genero
  if (dados.ncm && dados.ncm.trim().length >= 2) {
    codigoGeneroFinal = dados.ncm.trim().substring(0, 2)
  }

  // Custo final e fator de conversão tributável padrão
  const precoCustoNum =
    dados.preco_custo !== undefined && dados.preco_custo !== null ? Number(dados.preco_custo) : 0
  const outrasDespesasNum =
    dados.outras_despesas_percentual !== undefined && dados.outras_despesas_percentual !== null
      ? Number(dados.outras_despesas_percentual)
      : 0
  const custoFinalCalculado = calcularCustoFinal(precoCustoNum, outrasDespesasNum)

  const fatorConversaoFinal =
    dados.fator_conversao_tributavel !== undefined &&
    dados.fator_conversao_tributavel !== null &&
    Number(dados.fator_conversao_tributavel) > 0
      ? Number(dados.fator_conversao_tributavel)
      : 1

  const unidadeTributavelFinal = dados.unidade_tributavel_id || dados.unidade_id

  // FormData se houver arquivos, senão JSON
  const temArquivos = Boolean(
    dados.fotoArquivo ||
    (dados.fotosAdicionaisArquivos && dados.fotosAdicionaisArquivos.length > 0),
  )

  const payload: Record<string, unknown> = {
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    codigo: codigoFinal,
    tipo: dados.tipo || 'Produto',
    descricao: dados.descricao?.trim(),
    descricao_reduzida: dados.descricao_reduzida?.trim() || '',
    gtin: dados.gtin?.trim().toUpperCase() || '',
    gtin_tributavel: dados.gtin_tributavel?.trim().toUpperCase() || '',
    referencia: dados.referencia?.trim() || '',
    marca_id: dados.marca_id || null,
    grupo_id: dados.grupo_id || null,
    categoria_id: dados.categoria_id || null,
    fornecedor_principal_id: dados.fornecedor_principal_id || null,
    observacoes: dados.observacoes || '',

    // Unidades
    unidade_id: dados.unidade_id || null,
    unidade_tributavel_id: unidadeTributavelFinal || null,
    fator_conversao_tributavel: fatorConversaoFinal,

    // Preços
    preco_custo: precoCustoNum,
    outras_despesas_percentual: outrasDespesasNum,
    custo_final: custoFinalCalculado,
    margem_percentual:
      dados.margem_percentual !== undefined && dados.margem_percentual !== null
        ? Number(dados.margem_percentual)
        : 0,
    preco_venda:
      dados.preco_venda !== undefined && dados.preco_venda !== null ? Number(dados.preco_venda) : 0,
    preco_promocional:
      dados.preco_promocional !== undefined && dados.preco_promocional !== null
        ? Number(dados.preco_promocional)
        : null,
    promocao_inicio: dados.promocao_inicio || '',
    promocao_fim: dados.promocao_fim || '',
    permite_desconto: dados.permite_desconto ?? true,
    desconto_maximo_percentual:
      dados.desconto_maximo_percentual !== undefined && dados.desconto_maximo_percentual !== null
        ? Number(dados.desconto_maximo_percentual)
        : 0,

    // Estoque
    controla_estoque:
      dados.controla_estoque !== undefined ? dados.controla_estoque : dados.tipo !== 'Serviço',
    estoque_minimo:
      dados.estoque_minimo !== undefined && dados.estoque_minimo !== null
        ? Number(dados.estoque_minimo)
        : 0,
    estoque_maximo:
      dados.estoque_maximo !== undefined && dados.estoque_maximo !== null
        ? Number(dados.estoque_maximo)
        : 0,
    localizacao: dados.localizacao || '',
    controla_lote_validade: dados.controla_lote_validade ?? false,
    dias_validade:
      dados.dias_validade !== undefined && dados.dias_validade !== null
        ? Number(dados.dias_validade)
        : null,
    vende_fracionado: dados.vende_fracionado ?? false,
    vende_no_pdv: dados.vende_no_pdv ?? true,
    peso_liquido_kg:
      dados.peso_liquido_kg !== undefined && dados.peso_liquido_kg !== null
        ? Number(dados.peso_liquido_kg)
        : null,
    peso_bruto_kg:
      dados.peso_bruto_kg !== undefined && dados.peso_bruto_kg !== null
        ? Number(dados.peso_bruto_kg)
        : null,
    altura_cm:
      dados.altura_cm !== undefined && dados.altura_cm !== null ? Number(dados.altura_cm) : null,
    largura_cm:
      dados.largura_cm !== undefined && dados.largura_cm !== null ? Number(dados.largura_cm) : null,
    comprimento_cm:
      dados.comprimento_cm !== undefined && dados.comprimento_cm !== null
        ? Number(dados.comprimento_cm)
        : null,

    // Campos fiscais
    perfil_tributario_id: dados.perfil_tributario_id || null,
    ncm: dados.ncm?.replace(/\D/g, '') || '',
    ex_tipi: dados.ex_tipi || '',
    cest: dados.cest?.replace(/\D/g, '') || '',
    origem: dados.origem || '0',
    tipo_item_sped: dados.tipo_item_sped || '00',
    codigo_genero: codigoGeneroFinal || '',
    codigo_servico_lc116: dados.codigo_servico_lc116 || '',
    indicador_escala_relevante: dados.indicador_escala_relevante || 'N',
    cnpj_fabricante: dados.cnpj_fabricante?.replace(/\D/g, '') || '',
    c_benef: dados.c_benef || '',
    codigo_anp: dados.codigo_anp || '',
    descricao_anp: dados.descricao_anp || '',

    // CFOPs
    cfop_venda_interna: dados.cfop_venda_interna || '',
    cfop_venda_interestadual: dados.cfop_venda_interestadual || '',
    cfop_compra_interna: dados.cfop_compra_interna || '',
    cfop_compra_interestadual: dados.cfop_compra_interestadual || '',

    // ICMS
    cst_icms: dados.cst_icms || '',
    csosn: dados.csosn || '',
    mod_bc_icms: dados.mod_bc_icms || '',
    aliquota_icms:
      dados.aliquota_icms !== undefined && dados.aliquota_icms !== null
        ? Number(dados.aliquota_icms)
        : null,
    reducao_bc_icms_percentual:
      dados.reducao_bc_icms_percentual !== undefined && dados.reducao_bc_icms_percentual !== null
        ? Number(dados.reducao_bc_icms_percentual)
        : null,
    aliquota_fcp:
      dados.aliquota_fcp !== undefined && dados.aliquota_fcp !== null
        ? Number(dados.aliquota_fcp)
        : null,
    mod_bc_icms_st: dados.mod_bc_icms_st || '',
    mva_percentual:
      dados.mva_percentual !== undefined && dados.mva_percentual !== null
        ? Number(dados.mva_percentual)
        : null,
    reducao_bc_icms_st_percentual:
      dados.reducao_bc_icms_st_percentual !== undefined &&
      dados.reducao_bc_icms_st_percentual !== null
        ? Number(dados.reducao_bc_icms_st_percentual)
        : null,
    aliquota_icms_st:
      dados.aliquota_icms_st !== undefined && dados.aliquota_icms_st !== null
        ? Number(dados.aliquota_icms_st)
        : null,
    aliquota_fcp_st:
      dados.aliquota_fcp_st !== undefined && dados.aliquota_fcp_st !== null
        ? Number(dados.aliquota_fcp_st)
        : null,
    percentual_diferimento:
      dados.percentual_diferimento !== undefined && dados.percentual_diferimento !== null
        ? Number(dados.percentual_diferimento)
        : null,
    motivo_desoneracao: dados.motivo_desoneracao || '',
    aliquota_icms_interestadual:
      dados.aliquota_icms_interestadual !== undefined && dados.aliquota_icms_interestadual !== null
        ? Number(dados.aliquota_icms_interestadual)
        : null,

    // IPI
    cst_ipi_saida: dados.cst_ipi_saida || '',
    cst_ipi_entrada: dados.cst_ipi_entrada || '',
    codigo_enquadramento_ipi: dados.codigo_enquadramento_ipi || '999',
    tipo_calculo_ipi: dados.tipo_calculo_ipi || 'Percentual',
    aliquota_ipi:
      dados.aliquota_ipi !== undefined && dados.aliquota_ipi !== null
        ? Number(dados.aliquota_ipi)
        : null,
    valor_ipi_unidade:
      dados.valor_ipi_unidade !== undefined && dados.valor_ipi_unidade !== null
        ? Number(dados.valor_ipi_unidade)
        : null,

    // PIS / COFINS
    cst_pis_saida: dados.cst_pis_saida || '',
    cst_pis_entrada: dados.cst_pis_entrada || '',
    aliquota_pis:
      dados.aliquota_pis !== undefined && dados.aliquota_pis !== null
        ? Number(dados.aliquota_pis)
        : null,
    cst_cofins_saida: dados.cst_cofins_saida || '',
    cst_cofins_entrada: dados.cst_cofins_entrada || '',
    aliquota_cofins:
      dados.aliquota_cofins !== undefined && dados.aliquota_cofins !== null
        ? Number(dados.aliquota_cofins)
        : null,
    tipo_calculo_pis_cofins: dados.tipo_calculo_pis_cofins || 'Percentual',
    valor_pis_unidade:
      dados.valor_pis_unidade !== undefined && dados.valor_pis_unidade !== null
        ? Number(dados.valor_pis_unidade)
        : null,
    valor_cofins_unidade:
      dados.valor_cofins_unidade !== undefined && dados.valor_cofins_unidade !== null
        ? Number(dados.valor_cofins_unidade)
        : null,
    natureza_receita_pis_cofins: dados.natureza_receita_pis_cofins || '',

    // IBS / CBS
    cst_ibs_cbs: dados.cst_ibs_cbs || '',
    c_class_trib: dados.c_class_trib || '',
    aliquota_ibs_uf:
      dados.aliquota_ibs_uf !== undefined && dados.aliquota_ibs_uf !== null
        ? Number(dados.aliquota_ibs_uf)
        : null,
    aliquota_ibs_municipio:
      dados.aliquota_ibs_municipio !== undefined && dados.aliquota_ibs_municipio !== null
        ? Number(dados.aliquota_ibs_municipio)
        : null,
    aliquota_cbs:
      dados.aliquota_cbs !== undefined && dados.aliquota_cbs !== null
        ? Number(dados.aliquota_cbs)
        : null,
    reducao_ibs_cbs_percentual:
      dados.reducao_ibs_cbs_percentual !== undefined && dados.reducao_ibs_cbs_percentual !== null
        ? Number(dados.reducao_ibs_cbs_percentual)
        : null,

    informacoes_adicionais_item: dados.informacoes_adicionais_item || '',
    fiscal_revisado: dados.fiscal_revisado ?? false,
    fiscal_revisado_por: dados.fiscal_revisado ? pb.authStore.record?.id || null : null,
    fiscal_revisado_em: dados.fiscal_revisado
      ? dados.fiscal_revisado_em || new Date().toISOString()
      : '',

    updated_by: pb.authStore.record?.id || null,
  }

  let recordFinal: Produto

  if (temArquivos) {
    const formData = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
      }
    })
    if (dados.fotoArquivo) {
      formData.append('foto', dados.fotoArquivo)
    }
    if (dados.fotosAdicionaisArquivos && dados.fotosAdicionaisArquivos.length > 0) {
      dados.fotosAdicionaisArquivos.forEach((file) => {
        formData.append('fotos_adicionais', file)
      })
    }

    if (ehEdicao && dados.id) {
      recordFinal = await pb.collection('produtos').update<Produto>(dados.id, formData)
    } else {
      formData.append('created_by', pb.authStore.record?.id || '')
      recordFinal = await pb.collection('produtos').create<Produto>(formData)
    }
  } else {
    if (ehEdicao && dados.id) {
      recordFinal = await pb.collection('produtos').update<Produto>(dados.id, payload)
    } else {
      payload.created_by = pb.authStore.record?.id || null
      recordFinal = await pb.collection('produtos').create<Produto>(payload)
    }
  }

  // REGISTRO AUTOMÁTICO DE HISTÓRICO SPED 0205 caso a descrição tenha mudado
  if (ehEdicao && produtoAntes && produtoAntes.descricao !== recordFinal.descricao) {
    try {
      await pb.collection('produtos_historico').create({
        ativo: true,
        produto_id: recordFinal.id,
        data_alteracao: new Date().toISOString(),
        descricao_anterior: produtoAntes.descricao,
        codigo_anterior: produtoAntes.codigo,
        usuario_id: pb.authStore.record?.id || null,
        created_by: pb.authStore.record?.id || null,
        updated_by: pb.authStore.record?.id || null,
      })
    } catch (errHist) {
      console.error('Falha ao registrar histórico do produto SPED 0205:', errHist)
    }
  }

  // AUDITORIA COMPLETA
  await registrarAuditoria({
    tabela: 'produtos',
    registro_id: recordFinal.id,
    acao: ehEdicao ? 'alteracao' : 'inclusao',
    valores_antes: produtoAntes as unknown as Record<string, unknown>,
    valores_depois: recordFinal as unknown as Record<string, unknown>,
  })

  return recordFinal
}

export async function inativarProduto(id: string): Promise<void> {
  const antes = await obterProdutoPorId(id)
  const atualizado = await pb.collection('produtos').update<Produto>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'produtos',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

export async function ativarProduto(id: string): Promise<void> {
  const antes = await obterProdutoPorId(id)
  const atualizado = await pb.collection('produtos').update<Produto>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'produtos',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })
}

// -------------------------------------------------------------
// DUPLICAR PRODUTO (Copia tudo exceto código, GTIN e histórico)
// -------------------------------------------------------------
export async function duplicarProduto(produtoIdOrigem: string): Promise<Produto> {
  const origem = await obterProdutoPorId(produtoIdOrigem)
  const novoCodigo = await obterProximoCodigoProduto()

  const clonePayload: Partial<Produto> = {
    ...origem,
    id: undefined,
    codigo: novoCodigo,
    descricao: `${origem.descricao} (Cópia)`.slice(0, 120),
    descricao_reduzida: origem.descricao_reduzida
      ? `${origem.descricao_reduzida} (Cópia)`.slice(0, 40)
      : '',
    gtin: '',
    gtin_tributavel: '',
    created: undefined,
    updated: undefined,
    created_by: undefined,
    updated_by: undefined,
    expand: undefined,
  }

  const novoProduto = await salvarProduto(clonePayload)

  // Duplicar fornecedores vinculados se houver
  try {
    const fornecedoresOrigem = await listarFornecedoresDoProduto(produtoIdOrigem)
    for (const f of fornecedoresOrigem) {
      await pb.collection('produtos_fornecedores').create({
        ativo: true,
        produto_id: novoProduto.id,
        fornecedor_id: f.fornecedor_id,
        codigo_no_fornecedor: f.codigo_no_fornecedor || '',
        descricao_no_fornecedor: f.descricao_no_fornecedor || '',
        unidade_fornecedor: f.unidade_fornecedor || '',
        fator_conversao: f.fator_conversao || 1,
        ultimo_preco_compra: f.ultimo_preco_compra || null,
        data_ultima_compra: f.data_ultima_compra || '',
        created_by: pb.authStore.record?.id || null,
        updated_by: pb.authStore.record?.id || null,
      })
    }
  } catch (errForn) {
    console.error('Falha ao duplicar fornecedores vinculados:', errForn)
  }

  // Duplicar conversões de unidade se houver
  try {
    const conversoesOrigem = await listarConversoesDoProduto(produtoIdOrigem)
    for (const c of conversoesOrigem) {
      await pb.collection('produtos_conversoes_unidade').create({
        ativo: true,
        produto_id: novoProduto.id,
        unidade_id: c.unidade_id,
        fator_conversao: c.fator_conversao,
        gtin_unidade: '',
        created_by: pb.authStore.record?.id || null,
        updated_by: pb.authStore.record?.id || null,
      })
    }
  } catch (errConv) {
    console.error('Falha ao duplicar conversões vinculadas:', errConv)
  }

  // Se for Kit, duplicar itens da composição
  if (origem.tipo === 'Kit') {
    try {
      const itensKit = await listarItensDoKit(produtoIdOrigem)
      for (const item of itensKit) {
        await pb.collection('produtos_kit_itens').create({
          ativo: true,
          produto_kit_id: novoProduto.id,
          produto_item_id: item.produto_item_id,
          quantidade: item.quantidade,
          created_by: pb.authStore.record?.id || null,
          updated_by: pb.authStore.record?.id || null,
        })
      }
    } catch (errKit) {
      console.error('Falha ao duplicar itens do kit:', errKit)
    }
  }

  return novoProduto
}

// -------------------------------------------------------------
// TABELAS AUXILIARES CRUD
// -------------------------------------------------------------

// 1. Fornecedores do Produto
export async function listarFornecedoresDoProduto(produtoId: string): Promise<ProdutoFornecedor[]> {
  return await pb.collection('produtos_fornecedores').getFullList<ProdutoFornecedor>({
    filter: `produto_id = '${produtoId}' && ativo = true`,
    sort: '-created',
    expand: 'fornecedor_id',
  })
}

export async function salvarProdutoFornecedor(dados: {
  id?: string
  produto_id: string
  fornecedor_id: string
  codigo_no_fornecedor?: string
  descricao_no_fornecedor?: string
  unidade_fornecedor?: string
  fator_conversao?: number
  ultimo_preco_compra?: number
  data_ultima_compra?: string
}): Promise<ProdutoFornecedor> {
  const payload = {
    ativo: true,
    produto_id: dados.produto_id,
    fornecedor_id: dados.fornecedor_id,
    codigo_no_fornecedor: dados.codigo_no_fornecedor?.trim() || '',
    descricao_no_fornecedor: dados.descricao_no_fornecedor?.trim() || '',
    unidade_fornecedor: dados.unidade_fornecedor?.trim().toUpperCase() || '',
    fator_conversao:
      dados.fator_conversao && dados.fator_conversao > 0 ? Number(dados.fator_conversao) : 1,
    ultimo_preco_compra:
      dados.ultimo_preco_compra !== undefined && dados.ultimo_preco_compra !== null
        ? Number(dados.ultimo_preco_compra)
        : null,
    data_ultima_compra: dados.data_ultima_compra || '',
    updated_by: pb.authStore.record?.id || null,
  }

  if (dados.id) {
    return await pb.collection('produtos_fornecedores').update<ProdutoFornecedor>(dados.id, payload)
  }
  return await pb.collection('produtos_fornecedores').create<ProdutoFornecedor>({
    ...payload,
    created_by: pb.authStore.record?.id || null,
  })
}

export async function inativarProdutoFornecedor(id: string): Promise<void> {
  await pb.collection('produtos_fornecedores').update(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })
}

// 2. Conversões de Unidade (SPED 0220)
export async function listarConversoesDoProduto(
  produtoId: string,
): Promise<ProdutoConversaoUnidade[]> {
  return await pb.collection('produtos_conversoes_unidade').getFullList<ProdutoConversaoUnidade>({
    filter: `produto_id = '${produtoId}' && ativo = true`,
    sort: 'created',
    expand: 'unidade_id',
  })
}

export async function salvarProdutoConversao(dados: {
  id?: string
  produto_id: string
  unidade_id: string
  fator_conversao: number
  gtin_unidade?: string
}): Promise<ProdutoConversaoUnidade> {
  const payload = {
    ativo: true,
    produto_id: dados.produto_id,
    unidade_id: dados.unidade_id,
    fator_conversao: Number(dados.fator_conversao),
    gtin_unidade: dados.gtin_unidade?.trim().toUpperCase() || '',
    updated_by: pb.authStore.record?.id || null,
  }

  if (dados.id) {
    return await pb
      .collection('produtos_conversoes_unidade')
      .update<ProdutoConversaoUnidade>(dados.id, payload)
  }
  return await pb.collection('produtos_conversoes_unidade').create<ProdutoConversaoUnidade>({
    ...payload,
    created_by: pb.authStore.record?.id || null,
  })
}

export async function inativarProdutoConversao(id: string): Promise<void> {
  await pb.collection('produtos_conversoes_unidade').update(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })
}

// 3. Composição de Kit (produtos_kit_itens)
export async function listarItensDoKit(produtoKitId: string): Promise<ProdutoKitItem[]> {
  return await pb.collection('produtos_kit_itens').getFullList<ProdutoKitItem>({
    filter: `produto_kit_id = '${produtoKitId}' && ativo = true`,
    sort: 'created',
    expand: 'produto_item_id',
  })
}

export async function salvarItemKit(dados: {
  id?: string
  produto_kit_id: string
  produto_item_id: string
  quantidade: number
}): Promise<ProdutoKitItem> {
  const payload = {
    ativo: true,
    produto_kit_id: dados.produto_kit_id,
    produto_item_id: dados.produto_item_id,
    quantidade: Number(dados.quantidade),
    updated_by: pb.authStore.record?.id || null,
  }

  if (dados.id) {
    return await pb.collection('produtos_kit_itens').update<ProdutoKitItem>(dados.id, payload)
  }
  return await pb.collection('produtos_kit_itens').create<ProdutoKitItem>({
    ...payload,
    created_by: pb.authStore.record?.id || null,
  })
}

export async function inativarItemKit(id: string): Promise<void> {
  await pb.collection('produtos_kit_itens').update(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })
}

// 4. Histórico SPED 0205
export async function listarHistoricoDoProduto(produtoId: string): Promise<ProdutoHistorico[]> {
  return await pb.collection('produtos_historico').getFullList<ProdutoHistorico>({
    filter: `produto_id = '${produtoId}'`,
    sort: '-data_alteracao',
    expand: 'usuario_id',
  })
}

// -------------------------------------------------------------
// AÇÕES EM MASSA
// -------------------------------------------------------------
export async function alterarGrupoCategoriaEmMassa(
  produtoIds: string[],
  grupoId: string,
  categoriaId?: string,
): Promise<number> {
  let alterados = 0
  for (const id of produtoIds) {
    try {
      const antes = await obterProdutoPorId(id)
      const atualizado = await pb.collection('produtos').update<Produto>(id, {
        grupo_id: grupoId || null,
        categoria_id: categoriaId || null,
        updated_by: pb.authStore.record?.id || null,
      })
      await registrarAuditoria({
        tabela: 'produtos',
        registro_id: id,
        acao: 'alteracao',
        valores_antes: antes as unknown as Record<string, unknown>,
        valores_depois: atualizado as unknown as Record<string, unknown>,
      })
      alterados++
    } catch (err) {
      console.error(`Erro ao atualizar grupo/categoria do produto ${id}:`, err)
    }
  }
  return alterados
}

export async function alterarPrecoMargemEmMassa(
  produtoIds: string[],
  percentual: number, // ex: +10 para +10% ou -5 para -5%
  aplicarSobre: 'preco_venda' | 'margem' | 'preco_custo',
): Promise<number> {
  let alterados = 0
  const fator = 1 + percentual / 100

  for (const id of produtoIds) {
    try {
      const antes = await obterProdutoPorId(id)
      const updates: Record<string, unknown> = {
        updated_by: pb.authStore.record?.id || null,
      }

      if (aplicarSobre === 'preco_venda') {
        const atual = antes.preco_venda || 0
        const novoVenda = Number((atual * fator).toFixed(2))
        updates.preco_venda = novoVenda
        if (antes.custo_final && antes.custo_final > 0) {
          updates.margem_percentual = recalcularMargem(novoVenda, antes.custo_final)
        }
      } else if (aplicarSobre === 'margem') {
        const atual = antes.margem_percentual || 0
        const novaMargem = Number((atual * fator).toFixed(2))
        updates.margem_percentual = novaMargem
        if (antes.custo_final && antes.custo_final > 0) {
          updates.preco_venda = sugerirPrecoVenda(antes.custo_final, novaMargem)
        }
      } else if (aplicarSobre === 'preco_custo') {
        const atual = antes.preco_custo || 0
        const novoCusto = Number((atual * fator).toFixed(4))
        updates.preco_custo = novoCusto
        const novoCustoFinal = calcularCustoFinal(novoCusto, antes.outras_despesas_percentual || 0)
        updates.custo_final = novoCustoFinal
        if (antes.margem_percentual) {
          updates.preco_venda = sugerirPrecoVenda(novoCustoFinal, antes.margem_percentual)
        }
      }

      const atualizado = await pb.collection('produtos').update<Produto>(id, updates)
      await registrarAuditoria({
        tabela: 'produtos',
        registro_id: id,
        acao: 'alteracao',
        valores_antes: antes as unknown as Record<string, unknown>,
        valores_depois: atualizado as unknown as Record<string, unknown>,
      })
      alterados++
    } catch (err) {
      console.error(`Erro ao atualizar preços em massa do produto ${id}:`, err)
    }
  }
  return alterados
}

export async function inativarProdutosEmMassa(produtoIds: string[]): Promise<number> {
  let inativados = 0
  for (const id of produtoIds) {
    try {
      await inativarProduto(id)
      inativados++
    } catch (err) {
      console.error(`Erro ao inativar produto ${id}:`, err)
    }
  }
  return inativados
}

// -------------------------------------------------------------
// CONTAGEM DE PRODUTOS PARA ÁRVORE DE GRUPOS/CATEGORIAS
// -------------------------------------------------------------
export async function obterMapaContagemProdutosPorGrupoECategoria(): Promise<{
  porGrupo: Record<string, number>
  porCategoria: Record<string, number>
}> {
  try {
    const todos = await pb.collection('produtos').getFullList<Produto>({
      fields: 'id,grupo_id,categoria_id,ativo',
      filter: 'ativo = true',
    })

    const porGrupo: Record<string, number> = {}
    const porCategoria: Record<string, number> = {}

    for (const p of todos) {
      if (p.grupo_id) {
        porGrupo[p.grupo_id] = (porGrupo[p.grupo_id] || 0) + 1
      }
      if (p.categoria_id) {
        porCategoria[p.categoria_id] = (porCategoria[p.categoria_id] || 0) + 1
      }
    }

    return { porGrupo, porCategoria }
  } catch (err) {
    console.error('Erro ao calcular contagem de produtos:', err)
    return { porGrupo: {}, porCategoria: {} }
  }
}

// -------------------------------------------------------------
// IMPORTAÇÃO DE PRODUTOS POR CSV
// colunas: descricao;gtin;referencia;unidade;ncm;cest;origem;preco_custo;preco_venda;marca;grupo;categoria
// -------------------------------------------------------------
export interface LinhaImportacaoCSV {
  linhaNumero: number
  descricao: string
  gtin?: string
  referencia?: string
  unidade: string
  ncm?: string
  cest?: string
  origem?: string
  preco_custo?: number
  preco_venda?: number
  marca?: string
  grupo?: string
  categoria?: string
  erros: string[]
  dadosResolvidos?: {
    unidade_id: string
    marca_id?: string
    grupo_id?: string
    categoria_id?: string
  }
}

export interface ResumoValidacaoImportacao {
  totalLinhas: number
  linhasValidas: LinhaImportacaoCSV[]
  linhasComErro: LinhaImportacaoCSV[]
}

export async function validarArquivoCSVProdutos(
  conteudoCSV: string,
): Promise<ResumoValidacaoImportacao> {
  const linhas = conteudoCSV
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (linhas.length <= 1) {
    throw new Error('O arquivo CSV está vazio ou contém apenas o cabeçalho.')
  }

  // Carregar mapas em cache para validação ágil
  const [unidadesList, marcasList, gruposList, categoriasList] = await Promise.all([
    pb
      .collection('unidades_medida')
      .getFullList<{ id: string; sigla: string }>({ filter: 'ativo = true' }),
    pb.collection('marcas').getFullList<{ id: string; nome: string }>({ filter: 'ativo = true' }),
    pb
      .collection('grupos')
      .getFullList<{ id: string; codigo: string; nome: string }>({ filter: 'ativo = true' }),
    pb
      .collection('categorias')
      .getFullList<{ id: string; grupo_id: string; nome: string }>({ filter: 'ativo = true' }),
  ])

  const mapaUnidades = new Map<string, string>()
  unidadesList.forEach((u) => mapaUnidades.set(u.sigla.toUpperCase(), u.id))

  const mapaMarcas = new Map<string, string>()
  marcasList.forEach((m) => mapaMarcas.set(m.nome.toLowerCase(), m.id))

  const mapaGrupos = new Map<string, string>()
  gruposList.forEach((g) => {
    mapaGrupos.set(g.codigo.toLowerCase(), g.id)
    mapaGrupos.set(g.nome.toLowerCase(), g.id)
  })

  const mapaCategoriasPorGrupo = new Map<string, Map<string, string>>()
  categoriasList.forEach((c) => {
    if (!mapaCategoriasPorGrupo.has(c.grupo_id)) {
      mapaCategoriasPorGrupo.set(c.grupo_id, new Map())
    }
    mapaCategoriasPorGrupo.get(c.grupo_id)!.set(c.nome.toLowerCase(), c.id)
  })

  // Detectar separador (; ou ,)
  const primeiraLinha = linhas[0]
  const separador = primeiraLinha.includes(';') ? ';' : ','

  const linhasValidas: LinhaImportacaoCSV[] = []
  const linhasComErro: LinhaImportacaoCSV[] = []

  for (let i = 1; i < linhas.length; i++) {
    const rawLine = linhas[i]
    const cols = rawLine.split(separador).map((c) => c.trim().replace(/^"|"$/g, ''))
    const linhaNumero = i + 1

    const [
      descricao,
      gtin,
      referencia,
      unidade,
      ncm,
      cest,
      origem,
      precoCustoStr,
      precoVendaStr,
      marca,
      grupo,
      categoria,
    ] = cols

    const erros: string[] = []

    if (!descricao) {
      erros.push('Descrição é obrigatória.')
    } else if (descricao.length > 120) {
      erros.push('Descrição excede 120 caracteres.')
    }

    if (!unidade) {
      erros.push('Unidade é obrigatória.')
    } else if (!mapaUnidades.has(unidade.toUpperCase())) {
      erros.push(`Unidade de medida "${unidade}" não existe no cadastro.`)
    }

    if (gtin && !validarGTIN(gtin)) {
      erros.push(
        `GTIN "${gtin}" é inválido (deve ter 8, 12, 13 ou 14 dígitos com DV válido ou "SEM GTIN").`,
      )
    }

    if (ncm) {
      const ncmLimpo = ncm.replace(/\D/g, '')
      if (ncmLimpo.length !== 8) {
        erros.push(`NCM "${ncm}" é inválido (deve conter exatamente 8 dígitos).`)
      }
    }

    if (cest) {
      const cestLimpo = cest.replace(/\D/g, '')
      if (cestLimpo.length !== 7) {
        erros.push(`CEST "${cest}" é inválido (deve conter exatamente 7 dígitos).`)
      }
    }

    const precoCusto = precoCustoStr ? parseFloat(precoCustoStr.replace(',', '.')) : 0
    const precoVenda = precoVendaStr ? parseFloat(precoVendaStr.replace(',', '.')) : 0

    if (isNaN(precoCusto) || precoCusto < 0) {
      erros.push('Preço de custo inválido.')
    }
    if (isNaN(precoVenda) || precoVenda <= 0) {
      erros.push('Preço de venda é obrigatório e deve ser maior que zero.')
    }

    // Resolver IDs
    let unidadeId = ''
    if (unidade && mapaUnidades.has(unidade.toUpperCase())) {
      unidadeId = mapaUnidades.get(unidade.toUpperCase())!
    }

    let marcaId: string | undefined
    if (marca) {
      marcaId = mapaMarcas.get(marca.toLowerCase())
      if (!marcaId) {
        erros.push(`Marca "${marca}" não encontrada no cadastro.`)
      }
    }

    let grupoId: string | undefined
    if (grupo) {
      grupoId = mapaGrupos.get(grupo.toLowerCase())
      if (!grupoId) {
        erros.push(`Grupo "${grupo}" não encontrado no cadastro.`)
      }
    }

    let categoriaId: string | undefined
    if (categoria) {
      if (!grupoId) {
        erros.push(`Categoria "${categoria}" informada mas o grupo não foi reconhecido.`)
      } else {
        const catsDoGrupo = mapaCategoriasPorGrupo.get(grupoId)
        categoriaId = catsDoGrupo?.get(categoria.toLowerCase())
        if (!categoriaId) {
          erros.push(`Categoria "${categoria}" não encontrada dentro do grupo "${grupo}".`)
        }
      }
    }

    const itemLinha: LinhaImportacaoCSV = {
      linhaNumero,
      descricao: descricao || '',
      gtin: gtin || '',
      referencia: referencia || '',
      unidade: unidade || '',
      ncm: ncm?.replace(/\D/g, '') || '',
      cest: cest?.replace(/\D/g, '') || '',
      origem: origem || '0',
      preco_custo: precoCusto,
      preco_venda: precoVenda,
      marca: marca || '',
      grupo: grupo || '',
      categoria: categoria || '',
      erros,
      dadosResolvidos:
        erros.length === 0
          ? {
              unidade_id: unidadeId,
              marca_id: marcaId,
              grupo_id: grupoId,
              categoria_id: categoriaId,
            }
          : undefined,
    }

    if (erros.length > 0) {
      linhasComErro.push(itemLinha)
    } else {
      linhasValidas.push(itemLinha)
    }
  }

  return {
    totalLinhas: linhas.length - 1,
    linhasValidas,
    linhasComErro,
  }
}

export async function processarImportacaoCSVProdutos(
  linhasValidas: LinhaImportacaoCSV[],
): Promise<{ importados: number; falhas: number }> {
  let importados = 0
  let falhas = 0

  let proximoCodigo = await obterProximoCodigoProduto()

  for (const l of linhasValidas) {
    if (!l.dadosResolvidos) {
      falhas++
      continue
    }

    try {
      const precoCusto = l.preco_custo || 0
      const precoVenda = l.preco_venda || 0
      const margem = precoCusto > 0 ? recalcularMargem(precoVenda, precoCusto) : 0

      await salvarProduto({
        tipo: 'Produto',
        codigo: proximoCodigo++,
        descricao: l.descricao,
        gtin: l.gtin,
        referencia: l.referencia,
        unidade_id: l.dadosResolvidos.unidade_id,
        marca_id: l.dadosResolvidos.marca_id,
        grupo_id: l.dadosResolvidos.grupo_id,
        categoria_id: l.dadosResolvidos.categoria_id,
        ncm: l.ncm,
        cest: l.cest,
        origem: l.origem || '0',
        preco_custo: precoCusto,
        custo_final: precoCusto,
        preco_venda: precoVenda,
        margem_percentual: margem,
        controla_estoque: true,
        vende_no_pdv: true,
        ativo: true,
      })
      importados++
    } catch (err) {
      console.error(`Erro ao importar produto linha ${l.linhaNumero}:`, err)
      falhas++
    }
  }

  return { importados, falhas }
}
