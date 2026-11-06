import pb from '@/lib/pocketbase/client'
import { Empresa } from '@/services/empresas'
import { Produto } from '@/services/produtos'
import { buscarMelhorRegraNcm } from '@/services/regrasNcm'
import { obterConfigFiscalEmpresa } from '@/services/configFiscal'
import { sugerirCestPorNcm } from '@/services/cest'
import { obterNcmPorCodigo } from '@/services/ncm'
import { ItemXmlParsed } from '@/services/notasEntrada'
import { PerfilTributarioCompleto } from '@/services/perfisTributarios'
import { extrairCamposFiscaisDoPerfil } from '@/services/produtos'

export type NivelConfiancaSugestao = 'Alta' | 'Média' | 'Baixa'

export interface SugestaoFiscalResultado {
  confianca: NivelConfiancaSugestao
  motivoGeral: string
  avisos: string[]

  // Campos fiscais sugeridos (nomes exatos das colunas da tabela produtos)
  campos: {
    perfil_tributario_id?: string | null
    ncm?: string
    cest?: string
    origem?: string
    tipo_item_sped?: string
    codigo_genero?: string
    c_benef?: string
    codigo_anp?: string
    descricao_anp?: string
    cfop_venda_interna?: string
    cfop_venda_interestadual?: string
    cfop_compra_interna?: string
    cfop_compra_interestadual?: string
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
    cst_ipi_saida?: string
    cst_ipi_entrada?: string
    codigo_enquadramento_ipi?: string
    tipo_calculo_ipi?: 'Percentual' | 'Valor por unidade'
    aliquota_ipi?: number
    valor_ipi_unidade?: number
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
    cst_ibs_cbs?: string
    c_class_trib?: string
    aliquota_ibs_uf?: number
    aliquota_ibs_municipio?: number
    aliquota_cbs?: number
    reducao_ibs_cbs_percentual?: number
  }

  // Motivos individuais por campo para transparência na conferência
  motivosPorCampo: Record<string, string>
}

/**
 * Converte origem de mercadoria do fornecedor para nosso cadastro:
 * 1 -> 2 (importação direta pelo fornecedor vira adquirida no mercado interno)
 * 6 -> 7 (importação direta sem similar vira adquirida no mercado interno sem similar)
 */
export function converterOrigemMercadoria(origemXml: string | undefined): string {
  const orig = String(origemXml ?? '0').trim()
  if (orig === '1') return '2'
  if (orig === '6') return '7'
  return orig || '0'
}

/**
 * Motor Central de Sugestão Fiscal:
 * Assinatura: sugerirTributacao(itemXml?, empresa, produtoExistente?, tipoEntrada?, ufFornecedor?)
 *
 * Ordem de decisão:
 * A) Regra por NCM (confiança Alta)
 * B) Produto semelhante já revisado (confiança Alta)
 * C) Dedução pelo XML (confiança Média/Baixa)
 * D) Sem dados suficientes: "Classificar manualmente"
 */
export async function sugerirTributacao(params: {
  itemXml?: Partial<ItemXmlParsed> | null
  empresa: Partial<Empresa>
  produtoExistente?: Partial<Produto> | null
  tipoEntrada?: string
  ufFornecedor?: string
}): Promise<SugestaoFiscalResultado> {
  const { itemXml, empresa, produtoExistente, tipoEntrada, ufFornecedor } = params

  const ncm = (itemXml?.ncm || produtoExistente?.ncm || '').replace(/\D/g, '')

  const cest = (itemXml?.cest || produtoExistente?.cest || '').replace(/\D/g, '')

  const ufEmpresa = (empresa.uf || 'ES').toUpperCase().trim()
  const crt = empresa.crt
  const ehSimples = empresa.regime_apuracao
    ? empresa.regime_apuracao === 'Simples Nacional'
    : crt === 1 || crt === '1' || crt === 2 || crt === '2'
  const regimeEmpresa: 'Simples Nacional' | 'Regime Normal' = ehSimples
    ? 'Simples Nacional'
    : 'Regime Normal'

  // Carrega configuração fiscal da empresa
  let configEmpresa = null
  if (empresa.id) {
    configEmpresa = await obterConfigFiscalEmpresa(empresa.id)
  }
  const aliqIcmsInternaPadrao = configEmpresa?.aliquota_icms_interna_padrao ?? 17
  const aliqFcpPadrao = configEmpresa?.aliquota_fcp_padrao ?? 0
  const csosnPadraoTributado = configEmpresa?.csosn_padrao_tributado || '102'

  const avisos: string[] = []
  const motivosPorCampo: Record<string, string> = {}
  const campos: SugestaoFiscalResultado['campos'] = {}

  // =========================================================================
  // ETAPA A: Regra por NCM em regras_fiscais_ncm
  // =========================================================================
  if (ncm && ncm.length >= 2) {
    try {
      const regraNcm = await buscarMelhorRegraNcm({
        ncm,
        uf: ufEmpresa,
        regimeEmpresa,
      })

      if (regraNcm && regraNcm.perfil_tributario_id) {
        // Carrega o perfil e suas regras
        const perfilRec = await pb
          .collection('perfis_tributarios')
          .getOne<any>(regraNcm.perfil_tributario_id)
        const regrasPerfil = await pb.collection('perfis_tributarios_regras').getFullList<any>({
          filter: `perfil_id = '${regraNcm.perfil_tributario_id}' && ativo = true`,
        })

        const perfilCompleto: PerfilTributarioCompleto = {
          ...perfilRec,
          regras: regrasPerfil,
        }

        const extraidos = extrairCamposFiscaisDoPerfil(perfilCompleto)
        Object.assign(campos, extraidos)

        campos.perfil_tributario_id = regraNcm.perfil_tributario_id
        campos.ncm = ncm
        if (regraNcm.cest) campos.cest = regraNcm.cest
        else if (cest) campos.cest = cest

        if (regraNcm.natureza_receita_pis_cofins) {
          campos.natureza_receita_pis_cofins = regraNcm.natureza_receita_pis_cofins
        }

        const motivoA = `Regra do NCM ${regraNcm.ncm_prefixo}`
        for (const k of Object.keys(campos)) {
          motivosPorCampo[k] = motivoA
        }

        return {
          confianca: 'Alta',
          motivoGeral: motivoA,
          avisos,
          campos,
          motivosPorCampo,
        }
      }
    } catch (err) {
      console.warn('Erro ao avaliar Etapa A (Regra NCM):', err)
    }
  }

  // =========================================================================
  // ETAPA B: Produto semelhante já revisado (fiscal_revisado = true)
  // =========================================================================
  if (ncm) {
    try {
      const condicoesSemelhante = [`ncm = '${ncm}'`, `fiscal_revisado = true`, `ativo = true`]
      if (cest) {
        condicoesSemelhante.push(`cest = '${cest}'`)
      }

      const semelhante = await pb
        .collection('produtos')
        .getFirstListItem<Produto>(condicoesSemelhante.join(' && '))

      if (semelhante) {
        campos.perfil_tributario_id = semelhante.perfil_tributario_id || null
        campos.ncm = semelhante.ncm
        campos.cest = semelhante.cest || cest
        campos.origem = semelhante.origem
        campos.tipo_item_sped = semelhante.tipo_item_sped
        campos.codigo_genero = semelhante.codigo_genero || ncm.slice(0, 2)
        campos.c_benef = semelhante.c_benef
        campos.codigo_anp = semelhante.codigo_anp
        campos.descricao_anp = semelhante.descricao_anp
        campos.cfop_venda_interna = semelhante.cfop_venda_interna
        campos.cfop_venda_interestadual = semelhante.cfop_venda_interestadual
        campos.cfop_compra_interna = semelhante.cfop_compra_interna
        campos.cfop_compra_interestadual = semelhante.cfop_compra_interestadual
        campos.cst_icms = semelhante.cst_icms
        campos.csosn = semelhante.csosn
        campos.mod_bc_icms = semelhante.mod_bc_icms
        campos.aliquota_icms = semelhante.aliquota_icms
        campos.reducao_bc_icms_percentual = semelhante.reducao_bc_icms_percentual
        campos.aliquota_fcp = semelhante.aliquota_fcp
        campos.mod_bc_icms_st = semelhante.mod_bc_icms_st
        campos.mva_percentual = semelhante.mva_percentual
        campos.reducao_bc_icms_st_percentual = semelhante.reducao_bc_icms_st_percentual
        campos.aliquota_icms_st = semelhante.aliquota_icms_st
        campos.aliquota_fcp_st = semelhante.aliquota_fcp_st
        campos.percentual_diferimento = semelhante.percentual_diferimento
        campos.motivo_desoneracao = semelhante.motivo_desoneracao
        campos.aliquota_icms_interestadual = semelhante.aliquota_icms_interestadual
        campos.cst_ipi_saida = semelhante.cst_ipi_saida
        campos.cst_ipi_entrada = semelhante.cst_ipi_entrada
        campos.codigo_enquadramento_ipi = semelhante.codigo_enquadramento_ipi
        campos.tipo_calculo_ipi = semelhante.tipo_calculo_ipi
        campos.aliquota_ipi = semelhante.aliquota_ipi
        campos.cst_pis_saida = semelhante.cst_pis_saida
        campos.cst_pis_entrada = semelhante.cst_pis_entrada
        campos.aliquota_pis = semelhante.aliquota_pis
        campos.cst_cofins_saida = semelhante.cst_cofins_saida
        campos.cst_cofins_entrada = semelhante.cst_cofins_entrada
        campos.aliquota_cofins = semelhante.aliquota_cofins
        campos.natureza_receita_pis_cofins = semelhante.natureza_receita_pis_cofins
        campos.cst_ibs_cbs = semelhante.cst_ibs_cbs
        campos.c_class_trib = semelhante.c_class_trib

        const motivoB = `Igual ao produto ${semelhante.codigo} já revisado`
        for (const k of Object.keys(campos)) {
          motivosPorCampo[k] = motivoB
        }

        return {
          confianca: 'Alta',
          motivoGeral: motivoB,
          avisos,
          campos,
          motivosPorCampo,
        }
      }
    } catch {
      // Nenhum semelhante revisado encontrado
    }
  }

  // =========================================================================
  // ETAPA C: Dedução pelo XML
  // =========================================================================
  if (itemXml) {
    let confiancaGeral: NivelConfiancaSugestao = 'Média'
    const motivoC = 'Dedução pela NF-e de entrada'

    campos.ncm = ncm || itemXml.ncm || ''
    if (campos.ncm.length >= 2) {
      campos.codigo_genero = campos.ncm.slice(0, 2)
    }

    // 1. Origem: converter 1->2 e 6->7
    campos.origem = converterOrigemMercadoria(itemXml.origem)
    motivosPorCampo['origem'] = 'Origem convertida para mercado interno (1→2, 6→7)'

    // 2. ST e ICMS:
    // Critério de ST no item XML:
    // CST: 10, 30, 60, 70
    // CSOSN: 201, 202, 203, 500
    // CFOP: 5401, 5403, 5405, 6401, 6403, 6404
    const cstForn = (itemXml.cstIcms || '').trim()
    const cfopForn = (itemXml.cfop || '').replace(/\D/g, '')

    const cstsSt = ['10', '30', '60', '70']
    const csosnsSt = ['201', '202', '203', '500']
    const cfopsSt = ['5401', '5403', '5405', '6401', '6403', '6404']

    const temSt =
      cstsSt.includes(cstForn) || csosnsSt.includes(cstForn) || cfopsSt.includes(cfopForn)

    const compraInterestadual =
      Boolean(ufFornecedor && ufFornecedor.toUpperCase().trim() !== ufEmpresa) ||
      cfopForn.startsWith('2') ||
      cfopForn.startsWith('6')

    const fornecedorEhSimples = cstForn.length === 3

    if (ehSimples) {
      if (temSt) {
        campos.csosn = '500'
        motivosPorCampo['csosn'] = 'Item com Substituição Tributária na entrada (Simples)'
      } else {
        const isentoNaoTrib =
          ['40', '41'].includes(cstForn) || ['103', '300', '400'].includes(cstForn)
        if (isentoNaoTrib) {
          campos.csosn = '400'
          motivosPorCampo['csosn'] = 'Fornecedor isento/não tributado'
          confiancaGeral = 'Baixa'
          avisos.push('Isenção do fornecedor nem sempre vale para a sua venda.')
        } else {
          campos.csosn = csosnPadraoTributado
          motivosPorCampo['csosn'] = `Configuração padrão para Simples (${csosnPadraoTributado})`
        }
      }
    } else {
      // Empresa Destinatária: Regime Normal (CRT 3 / Não-Simples) - NUNCA gera CSOSN
      if (fornecedorEhSimples) {
        // Conversão quando o fornecedor é Simples Nacional (CSOSN de 3 dígitos)
        if (['101', '201'].includes(cstForn)) {
          campos.cst_icms = '00'
          const pCred = itemXml.pCredSN ?? 0
          if (pCred > 0) {
            campos.aliquota_icms = pCred
            motivosPorCampo['cst_icms'] =
              `CSOSN ${cstForn} convertido para CST 00 com crédito de ${pCred}% (pCredSN)`
            motivosPorCampo['aliquota_icms'] =
              `Alíquota de crédito Simples Nacional informada no XML (${pCred}%)`
          } else {
            campos.aliquota_icms = aliqIcmsInternaPadrao
            campos.aliquota_fcp = aliqFcpPadrao
            motivosPorCampo['cst_icms'] =
              `CSOSN ${cstForn} convertido para CST 00 com crédito de ICMS`
            motivosPorCampo['aliquota_icms'] = `Alíquota interna padrão (${aliqIcmsInternaPadrao}%)`
          }
        } else if (['102', '103', '300', '400'].includes(cstForn)) {
          campos.cst_icms = '90'
          motivosPorCampo['cst_icms'] =
            `CSOSN ${cstForn} convertido para CST 90 (outras / sem crédito)`
        } else if (cstForn === '500' || ['202', '203'].includes(cstForn)) {
          campos.cst_icms = '60'
          motivosPorCampo['cst_icms'] =
            `CSOSN ${cstForn} convertido para CST 60 (ICMS cobrado anteriormente por ST)`
        } else {
          // Outros CSOSN (ex: 900)
          campos.cst_icms = '90'
          motivosPorCampo['cst_icms'] = `CSOSN ${cstForn} convertido para CST 90 (Regime Normal)`
        }
      } else {
        // Fornecedor Regime Normal (CST 2 dígitos ou sem fornecedor Simples)
        if (temSt) {
          campos.cst_icms = '60'
          motivosPorCampo['cst_icms'] =
            'Item com Substituição Tributária na entrada (Regime Normal)'
        } else if (cstForn === '20') {
          campos.cst_icms = '20'
          campos.reducao_bc_icms_percentual = 0
          motivosPorCampo['cst_icms'] = 'Fornecedor tributou com redução de base'
          confiancaGeral = 'Baixa'
        } else if (cstForn === '40' || cstForn === '41') {
          campos.cst_icms = cstForn === '41' ? '41' : '40'
          motivosPorCampo['cst_icms'] = 'Fornecedor isento/não tributado'
          confiancaGeral = 'Baixa'
          avisos.push('Isenção do fornecedor nem sempre vale para a sua venda.')
        } else {
          // 00 ou outros tributados integralmente
          campos.cst_icms = '00'
          campos.aliquota_icms = aliqIcmsInternaPadrao
          campos.aliquota_fcp = aliqFcpPadrao
          motivosPorCampo['cst_icms'] = 'Tributação integral na saída'
          motivosPorCampo['aliquota_icms'] =
            `Alíquota interna padrão do estado (${aliqIcmsInternaPadrao}%)`
        }
      }
    }

    // Definição de CFOPs conforme ST
    const ehStFinal = ehSimples ? campos.csosn === '500' : campos.cst_icms === '60'
    if (ehStFinal) {
      campos.cfop_venda_interna = '5405'
      campos.cfop_venda_interestadual = '6404'
      motivosPorCampo['cfop_venda_interna'] =
        'Venda de mercadoria com ICMS ST recolhido anteriormente'
      motivosPorCampo['cfop_venda_interestadual'] = 'Venda interestadual com ICMS ST'

      if (compraInterestadual) {
        confiancaGeral = 'Baixa'
        avisos.push(
          'Compra interestadual com ST: confirme com o contador se há ICMS ST ou antecipação a recolher na entrada.',
        )
      }
    } else {
      const ehIndustrializacao = tipoEntrada === 'Compra para industrialização'
      campos.cfop_venda_interna = ehIndustrializacao ? '5101' : '5102'
      campos.cfop_venda_interestadual = ehIndustrializacao ? '6101' : '6102'
      motivosPorCampo['cfop_venda_interna'] = ehIndustrializacao
        ? 'Venda de produção do estabelecimento'
        : 'Venda de mercadoria adquirida de terceiros'
      motivosPorCampo['cfop_venda_interestadual'] = ehIndustrializacao
        ? 'Venda de produção do estabelecimento interestadual'
        : 'Venda de mercadoria adquirida interestadual'
    }

    // 3. CEST:
    if (cest) {
      campos.cest = cest
      motivosPorCampo['cest'] = 'CEST informado na NF-e do fornecedor'
    } else if (temSt && ncm) {
      try {
        const cestsSugeridos = await sugerirCestPorNcm(ncm)
        if (cestsSugeridos.length > 0) {
          campos.cest = cestsSugeridos[0].codigo.replace(/\D/g, '')
          motivosPorCampo['cest'] =
            `Sugerido pelo NCM (${cestsSugeridos[0].descricao.slice(0, 50)})`
        }
      } catch {
        // ignora
      }
    }

    // 4. PIS / COFINS:
    const cstPisForn = (itemXml.cstPis || '').trim()
    if (cstPisForn === '04' || cstPisForn === '05') {
      // Monofásico
      campos.cst_pis_saida = '04'
      campos.cst_pis_entrada = '70'
      campos.cst_cofins_saida = '04'
      campos.cst_cofins_entrada = '70'
      motivosPorCampo['cst_pis_saida'] = 'Produto Monofásico (PIS/COFINS)'
      motivosPorCampo['cst_cofins_saida'] = 'Produto Monofásico (PIS/COFINS)'
      if (!ehSimples) {
        avisos.push('Item monofásico: informe a Natureza da Receita de PIS/COFINS.')
      }
    } else if (cstPisForn === '06') {
      // Alíquota zero
      campos.cst_pis_saida = '06'
      campos.cst_pis_entrada = '73'
      campos.cst_cofins_saida = '06'
      campos.cst_cofins_entrada = '73'
      motivosPorCampo['cst_pis_saida'] = 'Alíquota Zero de PIS/COFINS'
      motivosPorCampo['cst_cofins_saida'] = 'Alíquota Zero de PIS/COFINS'
    } else {
      if (ehSimples) {
        campos.cst_pis_saida = '49'
        campos.cst_pis_entrada = '98'
        campos.cst_cofins_saida = '49'
        campos.cst_cofins_entrada = '98'
        motivosPorCampo['cst_pis_saida'] = 'Simples Nacional (CST 49 Outras operações de saída)'
        motivosPorCampo['cst_cofins_saida'] = 'Simples Nacional (CST 49 Outras operações de saída)'
      } else {
        const ehNaoCumulativo = empresa.regime_pis_cofins === 'Não cumulativo'
        if (ehNaoCumulativo) {
          campos.cst_pis_saida = '01'
          campos.aliquota_pis = 1.65
          campos.cst_pis_entrada = '50'
          campos.cst_cofins_saida = '01'
          campos.aliquota_cofins = 7.6
          campos.cst_cofins_entrada = '50'
          motivosPorCampo['cst_pis_saida'] = 'Não Cumulativo: 1,65% (CST 01)'
          motivosPorCampo['cst_cofins_saida'] = 'Não Cumulativo: 7,60% (CST 01)'
        } else {
          campos.cst_pis_saida = '01'
          campos.aliquota_pis = 0.65
          campos.cst_pis_entrada = '70'
          campos.cst_cofins_saida = '01'
          campos.aliquota_cofins = 3.0
          campos.cst_cofins_entrada = '70'
          motivosPorCampo['cst_pis_saida'] = 'Cumulativo: 0,65% (CST 01)'
          motivosPorCampo['cst_cofins_saida'] = 'Cumulativo: 3,00% (CST 01)'
        }
      }
    }

    // 5. IPI:
    if (!empresa.contribuinte_ipi) {
      campos.cst_ipi_saida = '53'
      campos.cst_ipi_entrada = '49'
      campos.codigo_enquadramento_ipi = '999'
      motivosPorCampo['cst_ipi_saida'] = 'Empresa não contribuinte de IPI (CST 53 Não tributada)'
      motivosPorCampo['cst_ipi_entrada'] = 'Empresa não contribuinte de IPI (CST 49)'
    } else if (ncm) {
      try {
        const ncmRec = await obterNcmPorCodigo(ncm)
        if (ncmRec && ncmRec.aliquota_ipi !== undefined) {
          campos.cst_ipi_saida = '50'
          campos.aliquota_ipi = ncmRec.aliquota_ipi
          campos.codigo_enquadramento_ipi = '999'
          motivosPorCampo['cst_ipi_saida'] =
            `Contribuinte IPI: alíquota oficial ${ncmRec.aliquota_ipi}% da tabela NCM`
        }
      } catch {
        // ignora
      }
    }

    // 6. IBS/CBS (Reforma Tributária):
    if (itemXml.cstIbsCbs && itemXml.cClassTrib) {
      campos.cst_ibs_cbs = itemXml.cstIbsCbs
      campos.c_class_trib = itemXml.cClassTrib
      motivosPorCampo['cst_ibs_cbs'] = 'Extraído do XML do fornecedor'
    } else {
      campos.cst_ibs_cbs = '000'
      campos.c_class_trib = '000001'
      motivosPorCampo['cst_ibs_cbs'] = 'Padrão preliminar de IBS/CBS'
      avisos.push('IBS/CBS preenchido com código padrão (000/000001); confira com o contador.')
    }

    // 7. Tipo de item SPED conforme tipo de entrada:
    let tipoItemSped = '00' // Revenda
    if (tipoEntrada === 'Compra para industrialização') tipoItemSped = '01'
    else if (tipoEntrada === 'Uso e consumo') tipoItemSped = '07'
    else if (tipoEntrada === 'Ativo imobilizado') tipoItemSped = '08'

    campos.tipo_item_sped = tipoItemSped
    motivosPorCampo['tipo_item_sped'] =
      `Mapeado pelo tipo de entrada (${tipoEntrada || 'Compra para revenda'})`

    // 8. Tentar vincular automaticamente a um Perfil Tributário compatível
    try {
      const perfis = await pb.collection('perfis_tributarios').getFullList<any>({
        filter: `regime = '${regimeEmpresa}' && ativo = true`,
      })

      for (const p of perfis) {
        const regras = await pb.collection('perfis_tributarios_regras').getFullList<any>({
          filter: `perfil_id = '${p.id}' && cenario = 'VENDA_INTERNA_CONSUMIDOR' && ativo = true`,
          expand: 'cfop',
        })
        if (regras.length > 0) {
          const r = regras[0]
          const cstMatch = ehSimples ? r.csosn === campos.csosn : r.cst_icms === campos.cst_icms
          const cfopCodigo = r.expand?.cfop?.codigo || ''
          const cfopMatch = !campos.cfop_venda_interna || cfopCodigo === campos.cfop_venda_interna

          if (cstMatch && cfopMatch) {
            campos.perfil_tributario_id = p.id
            motivosPorCampo['perfil_tributario_id'] = `Vinculado ao perfil compatível "${p.nome}"`
            break
          }
        }
      }
    } catch {
      // ignora se falhar busca de perfis
    }

    // Garantia dura: se empresa não é Simples (Regime Normal / CRT 3), nunca retorna CSOSN
    // e garante que cst_icms tenha exatamente 2 dígitos
    if (!ehSimples) {
      delete campos.csosn
      delete motivosPorCampo['csosn']
      if (campos.cst_icms) {
        campos.cst_icms = campos.cst_icms.slice(-2).padStart(2, '0')
      }
    }

    return {
      confianca: confiancaGeral,
      motivoGeral: motivoC,
      avisos,
      campos,
      motivosPorCampo,
    }
  }

  // =========================================================================
  // ETAPA D: Sem dados suficientes
  // =========================================================================
  return {
    confianca: 'Baixa',
    motivoGeral: 'Classificar manualmente',
    avisos: ['Não foram encontradas regras nem produto semelhante para o NCM informado.'],
    campos,
    motivosPorCampo,
  }
}
