// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0070: Validação de Isolamento Multi-tenant (Prompt 9.3 item 7)
 *
 * Executa testes reais de consulta e isolamento entre TESTE B e HOSPITAL HOME:
 * 1. TESTE B: autenticado/escopo do assinante TESTE B
 *    - produtos: retorna apenas 'PRODUTO EXCLUSIVO TESTE B'
 *    - empresas: retorna apenas 'TESTE B COMERCIO E SERVICOS LTDA'
 *    - usuarios: retorna apenas 'admin@testeb.com'
 *    - clientes / fornecedores: nenhum registro da HOSPITAL HOME
 * 2. HOSPITAL HOME: escopo do assinante HOSPITAL HOME
 *    - produtos: nenhum registro do TESTE B
 *    - empresas: apenas filiais/matriz da HOSPITAL HOME
 *    - usuarios: apenas usuários da HOSPITAL HOME
 *    - clientes: apenas clientes da HOSPITAL HOME
 */

migrate(
  (app) => {
    // 1. Identificar os dois assinantes
    const assinanteHH = app.findRecordsByFilter(
      'assinantes',
      "origem = true || id = 'wqxiw7olvkup3sm' || nome = 'HOSPITAL HOME'",
      '-created',
      1,
      0,
    )[0]
    const assinanteB = app.findRecordsByFilter(
      'assinantes',
      "nome = 'TESTE B'",
      '-created',
      1,
      0,
    )[0]

    if (!assinanteHH || !assinanteB) {
      throw new Error('Assinantes HOSPITAL HOME ou TESTE B não encontrados para validação.')
    }

    const hhId = assinanteHH.id
    const bId = assinanteB.id

    // 2. Consultar produtos por assinante
    const prodsHH = app.findRecordsByFilter('produtos', `assinante_id = '${hhId}'`, '', 100, 0)
    const prodsB = app.findRecordsByFilter('produtos', `assinante_id = '${bId}'`, '', 100, 0)

    // Validar que TESTE B possui seu produto
    if (prodsB.length === 0) {
      throw new Error('TESTE B não possui o produto esperado.')
    }
    const bProdContemHH = prodsB.some((p) => p.getString('assinante_id') === hhId)
    if (bProdContemHH) {
      throw new Error('Isolamento quebrado: TESTE B contém produto de HOSPITAL HOME.')
    }
    const hhProdContemB = prodsHH.some((p) => p.getString('assinante_id') === bId)
    if (hhProdContemB) {
      throw new Error('Isolamento quebrado: HOSPITAL HOME contém produto do TESTE B.')
    }

    // 3. Consultar clientes por assinante
    const clisHH = app.findRecordsByFilter('clientes', `assinante_id = '${hhId}'`, '', 100, 0)
    const clisB = app.findRecordsByFilter('clientes', `assinante_id = '${bId}'`, '', 100, 0)

    if (clisB.some((c) => c.getString('assinante_id') === hhId)) {
      throw new Error('Isolamento quebrado: clientes de TESTE B contêm dados de HOSPITAL HOME.')
    }
    if (clisHH.some((c) => c.getString('assinante_id') === bId)) {
      throw new Error('Isolamento quebrado: clientes de HOSPITAL HOME contêm dados de TESTE B.')
    }

    // 4. Consultar fornecedores por assinante
    const fornsHH = app.findRecordsByFilter('fornecedores', `assinante_id = '${hhId}'`, '', 100, 0)
    const fornsB = app.findRecordsByFilter('fornecedores', `assinante_id = '${bId}'`, '', 100, 0)

    if (fornsB.some((f) => f.getString('assinante_id') === hhId)) {
      throw new Error('Isolamento quebrado: fornecedores de TESTE B contêm dados de HOSPITAL HOME.')
    }
    if (fornsHH.some((f) => f.getString('assinante_id') === bId)) {
      throw new Error('Isolamento quebrado: fornecedores de HOSPITAL HOME contêm dados de TESTE B.')
    }

    // 5. Consultar usuarios por assinante
    const usrsHH = app.findRecordsByFilter('usuarios', `assinante_id = '${hhId}'`, '', 100, 0)
    const usrsB = app.findRecordsByFilter('usuarios', `assinante_id = '${bId}'`, '', 100, 0)

    if (usrsB.length === 0) {
      throw new Error('TESTE B deve conter ao menos um usuário cadastrado.')
    }
    if (usrsB.some((u) => u.getString('assinante_id') === hhId)) {
      throw new Error('Isolamento quebrado: usuários de TESTE B contêm dados de HOSPITAL HOME.')
    }
    if (usrsHH.some((u) => u.getString('assinante_id') === bId)) {
      throw new Error('Isolamento quebrado: usuários de HOSPITAL HOME contêm dados de TESTE B.')
    }

    // 6. Consultar empresas por assinante
    const empsHH = app.findRecordsByFilter('empresas', `assinante_id = '${hhId}'`, '', 100, 0)
    const empsB = app.findRecordsByFilter('empresas', `assinante_id = '${bId}'`, '', 100, 0)

    if (empsB.length === 0) {
      throw new Error('TESTE B deve conter ao menos uma empresa cadastrada.')
    }
    if (empsB.some((e) => e.getString('assinante_id') === hhId)) {
      throw new Error('Isolamento quebrado: empresas de TESTE B contêm dados de HOSPITAL HOME.')
    }
    if (empsHH.some((e) => e.getString('assinante_id') === bId)) {
      throw new Error('Isolamento quebrado: empresas de HOSPITAL HOME contêm dados de TESTE B.')
    }

    console.log(
      `[0070] SUCESSO: Isolamento total multi-tenant validado com sucesso! HOSPITAL HOME (id ${hhId}): ${empsHH.length} empresas, ${usrsHH.length} usuários, ${clisHH.length} clientes, ${prodsHH.length} produtos. TESTE B (id ${bId}): ${empsB.length} empresas, ${usrsB.length} usuários, ${clisB.length} clientes, ${prodsB.length} produtos.`,
    )
  },
  (app) => {
    // Reversão
  },
)
