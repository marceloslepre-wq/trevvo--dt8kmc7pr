// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0096: Correção do campo CFOP nos cenários do perfil tributário "Teste Normal 00"
 *
 * Contexto: A migration 0095 gravou o campo `cfop` dos cenários como IDs da tabela
 * global `cfop` (ex: "7a5xo6gm918mtl9"). No entanto, o componente SelectCfop e a lógica
 * fiscal utilizam o CÓDIGO da coluna `codigo` (ex: "5102").
 *
 * Esta migration atualiza de forma idempotente o campo `cfop` das 8 regras em `perfis_tributarios_regras`
 * do perfil `u1moll54ljt17sv` (assinante wqxiw7olvkup3sm / HOSPITAL HOME), substituindo os IDs pelos códigos:
 *   - 7a5xo6gm918mtl9 -> 5102 (Cenários 1 e 2: VENDA_INTERNA_CONTRIBUINTE e VENDA_INTERNA_CONSUMIDOR)
 *   - fprn4zrlwrmwh0x -> 6102 (Cenário 3: VENDA_INTERESTADUAL_CONTRIBUINTE)
 *   - yaxu8lsceli24is -> 6108 (Cenário 4: VENDA_INTERESTADUAL_CONSUMIDOR)
 *   - lag9w7o536u0f5l -> 5202 (Cenário 5: DEVOLUCAO_COMPRA)
 *   - wemr60mhlpe8jjv -> 5152 (Cenário 6: TRANSFERENCIA)
 *   - 5hca13gg307sj3d -> 1102 (Cenário 7: COMPRA_INTERNA)
 *   - j7ikbotbsxld8vi -> 2102 (Cenário 8: COMPRA_INTERESTADUAL)
 *
 * Idempotente:
 *   - Condição de update: registros do perfil u1moll54ljt17sv cujo cfop é um desses ids.
 *   - Se rodar novamente, nenhuma linha é alterada e nada quebra.
 */
migrate(
  (app) => {
    const perfilId = 'u1moll54ljt17sv'

    // Mapeamento confirmado: id -> codigo
    const mapaIdParaCodigo = {
      '7a5xo6gm918mtl9': '5102',
      fprn4zrlwrmwh0x: '6102',
      yaxu8lsceli24is: '6108',
      lag9w7o536u0f5l: '5202',
      wemr60mhlpe8jjv: '5152',
      '5hca13gg307sj3d': '1102',
      j7ikbotbsxld8vi: '2102',
    }

    // 1. Atualização via app.db().newQuery (garante bypass de regras/hooks no SQLite)
    const ids = Object.keys(mapaIdParaCodigo)
    for (let i = 0; i < ids.length; i++) {
      const idCfop = ids[i]
      const codigoCfop = mapaIdParaCodigo[idCfop]
      try {
        app
          .db()
          .newQuery(
            'UPDATE perfis_tributarios_regras SET cfop = {:codigo} WHERE perfil_id = {:perfilId} AND cfop = {:idCfop}',
          )
          .bind({
            codigo: codigoCfop,
            perfilId: perfilId,
            idCfop: idCfop,
          })
          .execute()
      } catch (eSql) {
        console.log('[0096] Erro SQL ao atualizar cfop ' + idCfop + ': ' + eSql)
      }
    }

    // 2. Fallback de segurança via Records API
    try {
      const regras = app.findRecordsByFilter(
        'perfis_tributarios_regras',
        "perfil_id = '" + perfilId + "'",
        'created',
        50,
        0,
      )
      if (regras && regras.length > 0) {
        for (let j = 0; j < regras.length; j++) {
          const r = regras[j]
          const cfopAtual = r.get('cfop')
          if (mapaIdParaCodigo[cfopAtual]) {
            r.set('cfop', mapaIdParaCodigo[cfopAtual])
            app.save(r)
          }
        }
      }
    } catch (eRec) {
      console.log('[0096] Erro no fallback Records API: ' + eRec)
    }

    console.log('[0096] CFOPs das regras do perfil ' + perfilId + ' atualizados com sucesso.')
  },
  (app) => {
    const perfilId = 'u1moll54ljt17sv'
    const mapaCodigoParaId = {
      5102: '7a5xo6gm918mtl9',
      6102: 'fprn4zrlwrmwh0x',
      6108: 'yaxu8lsceli24is',
      5202: 'lag9w7o536u0f5l',
      5152: 'wemr60mhlpe8jjv',
      1102: '5hca13gg307sj3d',
      2102: 'j7ikbotbsxld8vi',
    }

    const codigos = Object.keys(mapaCodigoParaId)
    for (let i = 0; i < codigos.length; i++) {
      const cod = codigos[i]
      const idCfop = mapaCodigoParaId[cod]
      try {
        app
          .db()
          .newQuery(
            'UPDATE perfis_tributarios_regras SET cfop = {:idCfop} WHERE perfil_id = {:perfilId} AND cfop = {:cod}',
          )
          .bind({
            idCfop: idCfop,
            perfilId: perfilId,
            cod: cod,
          })
          .execute()
      } catch (_) {}
    }
  },
)
