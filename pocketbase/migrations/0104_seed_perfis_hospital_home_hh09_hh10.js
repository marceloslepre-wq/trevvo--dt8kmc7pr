// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0104: Perfis tributários HH09 e HH10 para HOSPITAL HOME
 *
 * Assinante: HOSPITAL HOME (id: wqxiw7olvkup3sm)
 * Modelo de gravação: Perfil "Teste Normal 00" (id u1moll54ljt17sv) após migration 0096
 * e perfis HH01/HH02 (0100), HH03/HH04 (0101), HH05/HH08 (0102) e HH06/HH07 (0103).
 *
 * O campo `cfop` da tabela `perfis_tributarios_regras` é definido no schema do PocketBase como
 * `relation->cfop`, mas a tela e o SelectCfop utilizam o CÓDIGO (ex: "5102", "6102").
 * Gravamos inicialmente com o relation ID correspondente para passar pelo app.save() e depois
 * fixamos com o código via raw SQL (`UPDATE perfis_tributarios_regras SET cfop = ...`),
 * garantindo compatibilidade perfeita com a tela de edição e o SelectCfop.
 *
 * Idempotente:
 *   - Se já existir perfil com o mesmo nome no assinante, atualiza o cabeçalho e seus 8 cenários.
 *   - Se não existir, cria o perfil e seus 8 cenários.
 *
 * Validação defensiva:
 *   - Verifica existência do assinante HOSPITAL HOME.
 *   - Verifica existência dos CFOPs na tabela global cfop. Se faltar algum, interrompe e informa.
 *   - Verifica existência dos CSTs em tabelas_fiscais_codigos (CST_ICMS, CST_PIS_COFINS, CST_IPI). Se faltar algum, interrompe e informa.
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
        console.log('[0104] Assinante HOSPITAL HOME não localizado. Migration ignorada.')
        return
      }
    }

    const realAssinanteId = assinanteHH ? assinanteHH.id : assinanteHHId

    // 2. Validar existência dos CFOPs nas tabelas globais
    // CFOPs necessários para HH09 e HH10: 5102, 6102, 6108, 5202, 5152, 1102, 2102
    const cfopsNecessarios = ['5102', '6102', '6108', '5202', '5152', '1102', '2102']
    const mapaCfopId = {}
    for (let i = 0; i < cfopsNecessarios.length; i++) {
      const codigo = cfopsNecessarios[i]
      try {
        const cfopRec = app.findFirstRecordByData('cfop', 'codigo', codigo)
        mapaCfopId[codigo] = cfopRec.id
      } catch (e) {
        throw new Error('[0104] CFOP obrigatório não encontrado na tabela global cfop: ' + codigo)
      }
    }

    // 3. Validar existência dos CSTs nas tabelas globais (tabelas_fiscais_codigos)
    // ICMS: 00, 41
    const cstsIcmsNecessarios = ['00', '41']
    for (let i = 0; i < cstsIcmsNecessarios.length; i++) {
      const cst = cstsIcmsNecessarios[i]
      try {
        app.findFirstRecordByFilter(
          'tabelas_fiscais_codigos',
          "tipo = 'CST_ICMS' && codigo = '" + cst + "'",
        )
      } catch (e) {
        throw new Error(
          '[0104] CST ICMS obrigatório não encontrado em tabelas_fiscais_codigos: ' + cst,
        )
      }
    }

    // PIS/COFINS: 04, 49, 70
    const cstsPisCofinsNecessarios = ['04', '49', '70']
    for (let i = 0; i < cstsPisCofinsNecessarios.length; i++) {
      const cst = cstsPisCofinsNecessarios[i]
      try {
        app.findFirstRecordByFilter(
          'tabelas_fiscais_codigos',
          "tipo = 'CST_PIS_COFINS' && codigo = '" + cst + "'",
        )
      } catch (e) {
        throw new Error(
          '[0104] CST PIS/COFINS obrigatório não encontrado em tabelas_fiscais_codigos: ' + cst,
        )
      }
    }

    // IPI: 99, 49
    const cstsIpiNecessarios = ['99', '49']
    for (let i = 0; i < cstsIpiNecessarios.length; i++) {
      const cst = cstsIpiNecessarios[i]
      try {
        app.findFirstRecordByFilter(
          'tabelas_fiscais_codigos',
          "tipo = 'CST_IPI' && codigo = '" + cst + "'",
        )
      } catch (e) {
        throw new Error(
          '[0104] CST IPI obrigatório não encontrado em tabelas_fiscais_codigos: ' + cst,
        )
      }
    }

    const perfisCol = app.findCollectionByNameOrId('perfis_tributarios')
    const regrasCol = app.findCollectionByNameOrId('perfis_tributarios_regras')

    // 4. Definição completa dos perfis HH09 e HH10
    const perfisParaCriar = [
      {
        nome: 'HH09 Tributado 17% - PIS/COFINS monofásico',
        descricao:
          'ICMS 00 17%, PIS/COFINS 04. Uniplus: 56 produtos. Gerado do cadastro do Uniplus (30/10/2026), a conferir pelo contador.',
        cenarios: [
          {
            cenario: 'VENDA_INTERNA_CONTRIBUINTE',
            cfop: '5102',
            cstIcms: '00',
            aliquotaIcms: 17,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERNA_CONSUMIDOR',
            cfop: '5102',
            cstIcms: '00',
            aliquotaIcms: 17,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERESTADUAL_CONTRIBUINTE',
            cfop: '6102',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERESTADUAL_CONSUMIDOR',
            cfop: '6108',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'DEVOLUCAO_COMPRA',
            cfop: '5202',
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
            cfop: '5152',
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
            cfop: '1102',
            cstIcms: '00',
            aliquotaIcms: 17,
            cstPis: '70',
            aliquotaPis: 0,
            cstCofins: '70',
            aliquotaCofins: 0,
            cstIpi: '49',
          },
          {
            cenario: 'COMPRA_INTERESTADUAL',
            cfop: '2102',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '70',
            aliquotaPis: 0,
            cstCofins: '70',
            aliquotaCofins: 0,
            cstIpi: '49',
          },
        ],
      },
      {
        nome: 'HH10 Tributado 25% - PIS/COFINS monofásico',
        descricao:
          'ICMS 00 25%, PIS/COFINS 04. Uniplus: 30 produtos (cosméticos e perfumaria). Gerado do cadastro do Uniplus (30/10/2026), a conferir pelo contador.',
        cenarios: [
          {
            cenario: 'VENDA_INTERNA_CONTRIBUINTE',
            cfop: '5102',
            cstIcms: '00',
            aliquotaIcms: 25,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERNA_CONSUMIDOR',
            cfop: '5102',
            cstIcms: '00',
            aliquotaIcms: 25,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERESTADUAL_CONTRIBUINTE',
            cfop: '6102',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'VENDA_INTERESTADUAL_CONSUMIDOR',
            cfop: '6108',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '04',
            aliquotaPis: 0,
            cstCofins: '04',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'DEVOLUCAO_COMPRA',
            cfop: '5202',
            cstIcms: '00',
            aliquotaIcms: 25,
            cstPis: '49',
            aliquotaPis: 0,
            cstCofins: '49',
            aliquotaCofins: 0,
            cstIpi: '99',
          },
          {
            cenario: 'TRANSFERENCIA',
            cfop: '5152',
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
            cfop: '1102',
            cstIcms: '00',
            aliquotaIcms: 25,
            cstPis: '70',
            aliquotaPis: 0,
            cstCofins: '70',
            aliquotaCofins: 0,
            cstIpi: '49',
          },
          {
            cenario: 'COMPRA_INTERESTADUAL',
            cfop: '2102',
            cstIcms: '00',
            aliquotaIcms: 12,
            cstPis: '70',
            aliquotaPis: 0,
            cstCofins: '70',
            aliquotaCofins: 0,
            cstIpi: '49',
          },
        ],
      },
    ]

    for (let p = 0; p < perfisParaCriar.length; p++) {
      const pDef = perfisParaCriar[p]

      // Localizar ou criar perfil tributário
      let perfilRec = null
      try {
        const perfisExistentes = app.findRecordsByFilter(
          'perfis_tributarios',
          "assinante_id = '" +
            realAssinanteId +
            "' && nome = '" +
            pDef.nome.replace(/'/g, "\\'") +
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

      perfilRec.set('nome', pDef.nome)
      perfilRec.set('descricao', pDef.descricao)
      perfilRec.set('regime', 'Regime Normal')
      perfilRec.set('origem_padrao', '0')
      perfilRec.set('tipo_item_sped_padrao', '00')
      perfilRec.set('c_benef', '')
      perfilRec.set('ativo', true)

      app.save(perfilRec)
      console.log(
        '[0104] Perfil ' +
          (ehNovoPerfil ? 'criado' : 'atualizado') +
          ': ' +
          pDef.nome +
          ' (id: ' +
          perfilRec.id +
          ')',
      )

      // Gravar / atualizar os 8 cenários
      for (let c = 0; c < pDef.cenarios.length; c++) {
        const cDef = pDef.cenarios[c]
        let regraRec = null

        try {
          const regrasExistentes = app.findRecordsByFilter(
            'perfis_tributarios_regras',
            "perfil_id = '" + perfilRec.id + "' && cenario = '" + cDef.cenario + "'",
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
          regraRec.set('cenario', cDef.cenario)
        }

        regraRec.set('ativo', true)
        // Salva temporariamente com o ID válido da tabela CFOP para passar pela validação de relation do app.save
        regraRec.set('cfop', mapaCfopId[cDef.cfop])

        // ICMS
        regraRec.set('cst_icms', cDef.cstIcms)
        regraRec.set('csosn', '')
        regraRec.set('mod_bc_icms', '3')
        regraRec.set('aliquota_icms', cDef.aliquotaIcms)
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
        regraRec.set('cst_ipi', cDef.cstIpi)
        regraRec.set('codigo_enquadramento_ipi', '999')
        regraRec.set('aliquota_ipi', null)

        // PIS e COFINS
        regraRec.set('cst_pis', cDef.cstPis)
        regraRec.set('aliquota_pis', cDef.aliquotaPis)
        regraRec.set('cst_cofins', cDef.cstCofins)
        regraRec.set('aliquota_cofins', cDef.aliquotaCofins)
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

        // Atualiza via SQL direto no SQLite para armazenar o CÓDIGO (ex: "5102"),
        // exatamente como a tela grava e como foi feito nas migrations 0096, 0100, 0101, 0102 e 0103
        app
          .db()
          .newQuery('UPDATE perfis_tributarios_regras SET cfop = {:codigo} WHERE id = {:id}')
          .bind({
            codigo: cDef.cfop,
            id: regraRec.id,
          })
          .execute()

        console.log(
          '[0104] Cenário ' +
            (ehNovaRegra ? 'criado' : 'atualizado') +
            ': ' +
            cDef.cenario +
            ' (cfop: ' +
            cDef.cfop +
            ') para ' +
            pDef.nome,
        )
      }
    }

    console.log('[0104] Perfis HH09 e HH10 configurados com sucesso para HOSPITAL HOME.')
  },
  (app) => {
    // Reversão não-destrutiva
    try {
      const perfisNomes = [
        'HH09 Tributado 17% - PIS/COFINS monofásico',
        'HH10 Tributado 25% - PIS/COFINS monofásico',
      ]
      for (let i = 0; i < perfisNomes.length; i++) {
        const perfis = app.findRecordsByFilter(
          'perfis_tributarios',
          "nome = '" +
            perfisNomes[i].replace(/'/g, "\\'") +
            "' && assinante_id = 'wqxiw7olvkup3sm'",
          '',
          1,
          0,
        )
        if (perfis && perfis.length > 0) {
          const pId = perfis[0].id
          const regras = app.findRecordsByFilter(
            'perfis_tributarios_regras',
            "perfil_id = '" + pId + "'",
            '',
            100,
            0,
          )
          for (let r = 0; r < regras.length; r++) {
            app.delete(regras[r])
          }
          app.delete(perfis[0])
        }
      }
    } catch (_) {}
  },
)
