// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0095: Perfil tributário completo de teste "Teste Normal 00" para HOSPITAL HOME
 *
 * Assinante: HOSPITAL HOME (id: wqxiw7olvkup3sm)
 * Perfil:
 *   - Nome: Teste Normal 00
 *   - Descrição: Perfil de teste, Lucro Real, mercadoria importada adquirida no mercado interno, sem ST
 *   - Regime: Regime Normal (usa CST)
 *   - Origem padrão: 2 (estrangeira, adquirida no mercado interno)
 *   - Tipo de item SPED padrão: 00 (mercadoria para revenda)
 *   - cBenef: vazio ("")
 *   - Situação: ativo (true)
 *   - assinante_id: wqxiw7olvkup3sm
 *
 * 8 Cenários:
 *   Campos comuns nos 8:
 *     - Mod. BC ICMS: 3
 *     - Alíquota FCP: null
 *     - Diferimento ICMS: null
 *     - Enquadramento IPI: 999
 *     - Alíquota IPI: null
 *     - CST IBS/CBS: 000
 *     - cClassTrib: 000001
 *     - Redução IBS/CBS: null
 *     - Alíquota IBS estadual (aliquota_ibs_uf): 0.1
 *     - Alíquota IBS municipal (aliquota_ibs_municipio): 0
 *     - Alíquota CBS (aliquota_cbs): 0.9
 *     - Observação fiscal: ""
 *
 *   1. VENDA_INTERNA_CONTRIBUINTE:       CFOP 5102 | CST 00 | Aliq ICMS 17   | CST PIS/COFINS 01 | PIS 1.65 | COFINS 7.6 | CST IPI 99
 *   2. VENDA_INTERNA_CONSUMIDOR:         CFOP 5102 | CST 00 | Aliq ICMS 17   | CST PIS/COFINS 01 | PIS 1.65 | COFINS 7.6 | CST IPI 99
 *   3. VENDA_INTERESTADUAL_CONTRIBUINTE: CFOP 6102 | CST 00 | Aliq ICMS 4    | CST PIS/COFINS 01 | PIS 1.65 | COFINS 7.6 | CST IPI 99
 *   4. VENDA_INTERESTADUAL_CONSUMIDOR:   CFOP 6108 | CST 00 | Aliq ICMS 4    | CST PIS/COFINS 01 | PIS 1.65 | COFINS 7.6 | CST IPI 99
 *   5. DEVOLUCAO_COMPRA:                 CFOP 5202 | CST 00 | Aliq ICMS 17   | CST PIS/COFINS 49 | PIS 0    | COFINS 0   | CST IPI 99
 *   6. TRANSFERENCIA:                    CFOP 5152 | CST 41 | Aliq ICMS null | CST PIS/COFINS 49 | PIS 0    | COFINS 0   | CST IPI 99
 *   7. COMPRA_INTERNA:                   CFOP 1102 | CST 00 | Aliq ICMS 17   | CST PIS/COFINS 50 | PIS 1.65 | COFINS 7.6 | CST IPI 49
 *   8. COMPRA_INTERESTADUAL:             CFOP 2102 | CST 00 | Aliq ICMS 4    | CST PIS/COFINS 50 | PIS 1.65 | COFINS 7.6 | CST IPI 49
 *
 * Idempotente: se já existir perfil com esse nome no assinante, atualiza os campos e cenários.
 */
migrate(
  (app) => {
    const assinanteHHId = 'wqxiw7olvkup3sm'

    // 1. Validar existência do assinante HOSPITAL HOME
    let assinanteHH = null
    try {
      assinanteHH = app.findRecordById('assinantes', assinanteHHId)
    } catch (_) {
      try {
        assinanteHH = app.findFirstRecordByFilter(
          'assinantes',
          "origem = true || id = '" + assinanteHHId + "' || nome = 'HOSPITAL HOME'",
        )
      } catch (eAss) {
        console.log('[0095] Assinante HOSPITAL HOME não localizado. Migration ignorada.')
        return
      }
    }

    const realAssinanteId = assinanteHH ? assinanteHH.id : assinanteHHId

    // 2. Coleções necessárias
    const perfisCol = app.findCollectionByNameOrId('perfis_tributarios')
    const regrasCol = app.findCollectionByNameOrId('perfis_tributarios_regras')
    const cfopCol = app.findCollectionByNameOrId('cfop')

    // 3. Mapear CFOPs necessários para seus IDs reais
    const cfopsNecessarios = ['5102', '6102', '6108', '5202', '5152', '1102', '2102']
    const mapaCfopId = {}

    for (let i = 0; i < cfopsNecessarios.length; i++) {
      const codigo = cfopsNecessarios[i]
      try {
        const cfopRec = app.findFirstRecordByData('cfop', 'codigo', codigo)
        mapaCfopId[codigo] = cfopRec.id
      } catch (e) {
        throw new Error('[0095] CFOP obrigatório não encontrado no banco de dados: ' + codigo)
      }
    }

    // 4. Localizar ou criar o perfil tributário
    const nomePerfil = 'Teste Normal 00'
    let perfilRec = null

    try {
      const perfisExistentes = app.findRecordsByFilter(
        'perfis_tributarios',
        "assinante_id = '" +
          realAssinanteId +
          "' && nome = '" +
          nomePerfil.replace(/'/g, "\\'") +
          "'",
        '',
        1,
        0,
      )
      if (perfisExistentes && perfisExistentes.length > 0) {
        perfilRec = perfisExistentes[0]
      }
    } catch (_) {}

    const ehNovoPerfil = !perfilRec
    if (!perfilRec) {
      perfilRec = new Record(perfisCol)
      perfilRec.set('assinante_id', realAssinanteId)
    }

    perfilRec.set('nome', nomePerfil)
    perfilRec.set(
      'descricao',
      'Perfil de teste, Lucro Real, mercadoria importada adquirida no mercado interno, sem ST',
    )
    perfilRec.set('regime', 'Regime Normal')
    perfilRec.set('origem_padrao', '2')
    perfilRec.set('tipo_item_sped_padrao', '00')
    perfilRec.set('c_benef', '')
    perfilRec.set('ativo', true)

    app.save(perfilRec)
    console.log(
      '[0095] Perfil ' +
        (ehNovoPerfil ? 'criado' : 'atualizado') +
        ': ' +
        nomePerfil +
        ' (id: ' +
        perfilRec.id +
        ')',
    )

    // 5. Definição dos 8 cenários tributários
    const definicaoCenarios = [
      {
        cenario: 'VENDA_INTERNA_CONTRIBUINTE',
        cfopCodigo: '5102',
        cstIcms: '00',
        aliquotaIcms: 17,
        cstPis: '01',
        aliquotaPis: 1.65,
        cstCofins: '01',
        aliquotaCofins: 7.6,
        cstIpi: '99',
      },
      {
        cenario: 'VENDA_INTERNA_CONSUMIDOR',
        cfopCodigo: '5102',
        cstIcms: '00',
        aliquotaIcms: 17,
        cstPis: '01',
        aliquotaPis: 1.65,
        cstCofins: '01',
        aliquotaCofins: 7.6,
        cstIpi: '99',
      },
      {
        cenario: 'VENDA_INTERESTADUAL_CONTRIBUINTE',
        cfopCodigo: '6102',
        cstIcms: '00',
        aliquotaIcms: 4,
        cstPis: '01',
        aliquotaPis: 1.65,
        cstCofins: '01',
        aliquotaCofins: 7.6,
        cstIpi: '99',
      },
      {
        cenario: 'VENDA_INTERESTADUAL_CONSUMIDOR',
        cfopCodigo: '6108',
        cstIcms: '00',
        aliquotaIcms: 4,
        cstPis: '01',
        aliquotaPis: 1.65,
        cstCofins: '01',
        aliquotaCofins: 7.6,
        cstIpi: '99',
      },
      {
        cenario: 'DEVOLUCAO_COMPRA',
        cfopCodigo: '5202',
        cstIcms: '00',
        aliquotaIcms: 17,
        cstPis: '49',
        aliquotaPis: 0,
        cstCofins: '49',
        aliquotaCofins: 0,
        cstIpi: '99',
      },
      {
        cenario: 'TRANSFERENCIA',
        cfopCodigo: '5152',
        cstIcms: '41',
        aliquotaIcms: null,
        cstPis: '49',
        aliquotaPis: 0,
        cstCofins: '49',
        aliquotaCofins: 0,
        cstIpi: '99',
      },
      {
        cenario: 'COMPRA_INTERNA',
        cfopCodigo: '1102',
        cstIcms: '00',
        aliquotaIcms: 17,
        cstPis: '50',
        aliquotaPis: 1.65,
        cstCofins: '50',
        aliquotaCofins: 7.6,
        cstIpi: '49',
      },
      {
        cenario: 'COMPRA_INTERESTADUAL',
        cfopCodigo: '2102',
        cstIcms: '00',
        aliquotaIcms: 4,
        cstPis: '50',
        aliquotaPis: 1.65,
        cstCofins: '50',
        aliquotaCofins: 7.6,
        cstIpi: '49',
      },
    ]

    // 6. Gravar ou atualizar cada cenário
    for (let c = 0; c < definicaoCenarios.length; c++) {
      const def = definicaoCenarios[c]
      let regraRec = null

      try {
        const regrasExistentes = app.findRecordsByFilter(
          'perfis_tributarios_regras',
          "perfil_id = '" + perfilRec.id + "' && cenario = '" + def.cenario + "'",
          '',
          1,
          0,
        )
        if (regrasExistentes && regrasExistentes.length > 0) {
          regraRec = regrasExistentes[0]
        }
      } catch (_) {}

      const ehNovaRegra = !regraRec
      if (!regraRec) {
        regraRec = new Record(regrasCol)
        regraRec.set('perfil_id', perfilRec.id)
        regraRec.set('cenario', def.cenario)
      }

      regraRec.set('ativo', true)
      regraRec.set('cfop', mapaCfopId[def.cfopCodigo])

      // ICMS
      regraRec.set('cst_icms', def.cstIcms)
      regraRec.set('csosn', '')
      regraRec.set('mod_bc_icms', '3')
      regraRec.set('aliquota_icms', def.aliquotaIcms)
      regraRec.set('reducao_bc_icms_percentual', null)
      regraRec.set('aliquota_fcp', null)

      // ICMS ST
      regraRec.set('mod_bc_icms_st', '')
      regraRec.set('mva_percentual', null)
      regraRec.set('reducao_bc_icms_st_percentual', null)
      regraRec.set('aliquota_icms_st', null)
      regraRec.set('aliquota_fcp_st', null)

      // Diferimento e desoneração
      regraRec.set('percentual_diferimento', null)
      regraRec.set('motivo_desoneracao', '')

      // IPI
      regraRec.set('cst_ipi', def.cstIpi)
      regraRec.set('codigo_enquadramento_ipi', '999')
      regraRec.set('aliquota_ipi', null)

      // PIS e COFINS
      regraRec.set('cst_pis', def.cstPis)
      regraRec.set('aliquota_pis', def.aliquotaPis)
      regraRec.set('cst_cofins', def.cstCofins)
      regraRec.set('aliquota_cofins', def.aliquotaCofins)
      regraRec.set('natureza_receita_pis_cofins', '')

      // IBS / CBS
      regraRec.set('cst_ibs_cbs', '000')
      regraRec.set('c_class_trib', '000001')
      regraRec.set('aliquota_ibs_uf', 0.1)
      regraRec.set('aliquota_ibs_municipio', 0)
      regraRec.set('aliquota_cbs', 0.9)
      regraRec.set('reducao_ibs_cbs_percentual', null)

      // Observação fiscal
      regraRec.set('observacao_fiscal', '')

      app.save(regraRec)
      console.log(
        '[0095] Cenário ' +
          (ehNovaRegra ? 'criado' : 'atualizado') +
          ': ' +
          def.cenario +
          ' (cfop: ' +
          def.cfopCodigo +
          ')',
      )
    }

    console.log(
      '[0095] Perfil de teste "Teste Normal 00" e seus 8 cenários configurados com sucesso.',
    )
  },
  (app) => {
    // Reversão opcional (não destrutiva de outros dados)
    try {
      const perfis = app.findRecordsByFilter(
        'perfis_tributarios',
        "nome = 'Teste Normal 00' && assinante_id = 'wqxiw7olvkup3sm'",
        '',
        1,
        0,
      )
      if (perfis && perfis.length > 0) {
        const perfilId = perfis[0].id
        const regras = app.findRecordsByFilter(
          'perfis_tributarios_regras',
          "perfil_id = '" + perfilId + "'",
          '',
          100,
          0,
        )
        for (let i = 0; i < regras.length; i++) {
          app.delete(regras[i])
        }
        app.delete(perfis[0])
      }
    } catch (_) {}
  },
)
