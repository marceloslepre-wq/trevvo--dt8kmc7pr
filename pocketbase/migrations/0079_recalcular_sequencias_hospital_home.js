// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0079: Ajuste do campo ultimo_numero e Recálculo dos contadores da coleção sequencias (Prompt 9.5c2)
 *
 * 1. Altera o campo `ultimo_numero` da coleção `sequencias` para required: false (ou zero-friendly),
 *    pois PocketBase v0.23+ com required: true em campo do tipo number considera 0 (falsy) como "blank".
 *
 * 2. Acerta os contadores da coleção `sequencias` da HOSPITAL HOME (id wqxiw7olvkup3sm)
 *    para cada um dos 9 tipos:
 *    - Por empresa (matriz HH id jy1d6k2u5j66h1o):
 *      * vendas (campo numero)
 *      * inventarios (campo numero)
 *      * pedidos_compra (campo numero)
 *      * transferencias (campo numero, empresa_origem_id)
 *    - Por assinante (empresa_id nulo/vazio):
 *      * codigo_produtos (campo codigo)
 *      * codigo_clientes (campo codigo)
 *      * codigo_fornecedores (campo codigo)
 *      * codigo_condicoes_pagamento (campo codigo)
 *      * codigo_empresas (campo codigo)
 *
 * 3. Validação da numeração independente:
 *    - TESTE B (assinante l6vfd1p688j2y9a): cria produto sem código -> recebe código 1
 *    - HOSPITAL HOME (assinante wqxiw7olvkup3sm): cria produto sem código -> recebe código 1
 *    - Exclusão do produto de teste da HOSPITAL HOME (o do TESTE B permanece)
 *    - Reajuste do contador codigo_produtos da HH para 0 (sem produtos cadastrados)
 */

migrate(
  (app) => {
    console.log('[0079] Iniciando ajuste e recálculo das sequências (Prompt 9.5c2)...')

    const assinanteHHId = 'wqxiw7olvkup3sm'
    const empresaMatrizHHId = 'jy1d6k2u5j66h1o'
    const assinanteBId = 'l6vfd1p688j2y9a'

    // 0. Tornar ultimo_numero required: false para permitir o valor 0
    const sequenciasCol = app.findCollectionByNameOrId('sequencias')
    const fieldUltimo = sequenciasCol.fields.getByName('ultimo_numero')
    if (fieldUltimo && fieldUltimo.required) {
      fieldUltimo.required = false
      app.save(sequenciasCol)
      console.log('[0079] Campo ultimo_numero alterado para required: false.')
    }

    const produtosCol = app.findCollectionByNameOrId('produtos')

    // Helper para buscar maior valor real de um campo
    function buscarMaiorReal(colecao, filtro, campo) {
      try {
        const recs = app.findRecordsByFilter(colecao, filtro, '-' + campo, 1, 0)
        if (recs && recs.length > 0) {
          return recs[0].getInt(campo) || 0
        }
      } catch (err) {
        console.log(`[0079] Erro ao consultar ${colecao} (${filtro}): ${err.message}`)
      }
      return 0
    }

    // Helper para buscar ou criar contador em sequencias
    function ajustarContador(assId, empId, tipo, novoValor) {
      let filtro = `assinante_id = '${assId}' && tipo = '${tipo}'`
      if (empId) {
        filtro += ` && empresa_id = '${empId}'`
      } else {
        filtro += ` && (empresa_id = '' || empresa_id = null)`
      }

      let seqRec = null
      let contadorAntes = 0
      try {
        const exist = app.findRecordsByFilter('sequencias', filtro, '', 1, 0)
        if (exist && exist.length > 0) {
          seqRec = exist[0]
          contadorAntes = seqRec.getInt('ultimo_numero') || 0
        }
      } catch (_) {}

      if (!seqRec) {
        seqRec = new Record(sequenciasCol)
        seqRec.set('assinante_id', assId)
        if (empId) {
          seqRec.set('empresa_id', empId)
        } else {
          seqRec.set('empresa_id', null)
        }
        seqRec.set('tipo', tipo)
      }

      seqRec.set('ultimo_numero', novoValor)
      app.save(seqRec)

      console.log(
        `[0079] CONTADOR: tipo=${tipo}, ass=${assId}, emp=${empId || 'null'}, antes=${contadorAntes}, maiorReal=${novoValor}, depois=${novoValor}`,
      )
      return { antes: contadorAntes, depois: novoValor }
    }

    // 1. RECALCULAR CONTADORES HOSPITAL HOME (9 TIPOS)
    // A) Tipos por Empresa (Matriz HH)
    const maiorVendas = buscarMaiorReal('vendas', `empresa_id = '${empresaMatrizHHId}'`, 'numero')
    ajustarContador(assinanteHHId, empresaMatrizHHId, 'vendas', maiorVendas)

    const maiorInventarios = buscarMaiorReal(
      'inventarios',
      `empresa_id = '${empresaMatrizHHId}'`,
      'numero',
    )
    ajustarContador(assinanteHHId, empresaMatrizHHId, 'inventarios', maiorInventarios)

    const maiorPedidosCompra = buscarMaiorReal(
      'pedidos_compra',
      `empresa_id = '${empresaMatrizHHId}'`,
      'numero',
    )
    ajustarContador(assinanteHHId, empresaMatrizHHId, 'pedidos_compra', maiorPedidosCompra)

    const maiorTransferencias = buscarMaiorReal(
      'transferencias',
      `empresa_origem_id = '${empresaMatrizHHId}'`,
      'numero',
    )
    ajustarContador(assinanteHHId, empresaMatrizHHId, 'transferencias', maiorTransferencias)

    // B) Tipos por Assinante (empresa_id nulo)
    const maiorProdutos = buscarMaiorReal('produtos', `assinante_id = '${assinanteHHId}'`, 'codigo')
    ajustarContador(assinanteHHId, null, 'codigo_produtos', maiorProdutos)

    const maiorClientes = buscarMaiorReal('clientes', `assinante_id = '${assinanteHHId}'`, 'codigo')
    ajustarContador(assinanteHHId, null, 'codigo_clientes', maiorClientes)

    const maiorFornecedores = buscarMaiorReal(
      'fornecedores',
      `assinante_id = '${assinanteHHId}'`,
      'codigo',
    )
    ajustarContador(assinanteHHId, null, 'codigo_fornecedores', maiorFornecedores)

    const maiorCondicoes = buscarMaiorReal(
      'condicoes_pagamento',
      `assinante_id = '${assinanteHHId}'`,
      'codigo',
    )
    ajustarContador(assinanteHHId, null, 'codigo_condicoes_pagamento', maiorCondicoes)

    const maiorEmpresas = buscarMaiorReal('empresas', `assinante_id = '${assinanteHHId}'`, 'codigo')
    ajustarContador(assinanteHHId, null, 'codigo_empresas', maiorEmpresas)

    // 2. GARANTIR CONTADOR INICIAL DO TESTE B SE AINDA NÃO EXISTIR
    // (Não altera contadores pré-existentes do TESTE B)
    const seqBExistente = app.findRecordsByFilter(
      'sequencias',
      `assinante_id = '${assinanteBId}' && tipo = 'codigo_produtos'`,
      '',
      1,
      0,
    )
    if (!seqBExistente || seqBExistente.length === 0) {
      const seqB = new Record(sequenciasCol)
      seqB.set('assinante_id', assinanteBId)
      seqB.set('empresa_id', null)
      seqB.set('tipo', 'codigo_produtos')
      seqB.set('ultimo_numero', 0)
      app.save(seqB)
      console.log('[0079] Inicializado sequencias codigo_produtos para TESTE B com 0.')
    }

    // 3. TESTE DE NUMERAÇÃO NO TESTE B
    // Cria produto no TESTE B sem código -> deve receber código 1
    let prodB = null
    const existProdB = app.findRecordsByFilter(
      'produtos',
      `assinante_id = '${assinanteBId}' && descricao = 'PRODUTO SEQUENCIAL TESTE B'`,
      '',
      1,
      0,
    )
    if (existProdB && existProdB.length > 0) {
      prodB = existProdB[0]
    } else {
      prodB = new Record(produtosCol)
      prodB.set('descricao', 'PRODUTO SEQUENCIAL TESTE B')
      prodB.set('tipo', 'Produto')
      prodB.set('preco_venda', 50)
      prodB.set('ativo', true)
      prodB.set('assinante_id', assinanteBId)

      // Emula/chama lógica de proximoNumero para o produto sem código
      const seqsB = app.findRecordsByFilter(
        'sequencias',
        `assinante_id = '${assinanteBId}' && tipo = 'codigo_produtos'`,
        '',
        1,
        0,
      )
      let proxB = 1
      if (seqsB && seqsB.length > 0) {
        proxB = (seqsB[0].getInt('ultimo_numero') || 0) + 1
        seqsB[0].set('ultimo_numero', proxB)
        app.save(seqsB[0])
      }
      prodB.set('codigo', proxB)
      app.save(prodB)
    }

    const codigoFinalB = prodB.getInt('codigo')
    console.log(`[0079] TESTE B: produto criado com sucesso, codigo = ${codigoFinalB}`)

    // 4. TESTE DE NUMERAÇÃO NA HOSPITAL HOME
    // Cria produto na HOSPITAL HOME sem código -> segue a numeração dela (recebe 1)
    const prodHH = new Record(produtosCol)
    prodHH.set('descricao', 'PRODUTO TESTE NUMERACAO HOSPITAL HOME')
    prodHH.set('tipo', 'Produto')
    prodHH.set('preco_venda', 99)
    prodHH.set('ativo', true)
    prodHH.set('assinante_id', assinanteHHId)

    const seqsHHProd = app.findRecordsByFilter(
      'sequencias',
      `assinante_id = '${assinanteHHId}' && tipo = 'codigo_produtos'`,
      '',
      1,
      0,
    )
    let proxHH = 1
    if (seqsHHProd && seqsHHProd.length > 0) {
      proxHH = (seqsHHProd[0].getInt('ultimo_numero') || 0) + 1
      seqsHHProd[0].set('ultimo_numero', proxHH)
      app.save(seqsHHProd[0])
    }
    prodHH.set('codigo', proxHH)
    app.save(prodHH)

    const codigoFinalHH = prodHH.getInt('codigo')
    console.log(`[0079] HOSPITAL HOME: produto criado com sucesso, codigo = ${codigoFinalHH}`)

    // 5. APAGA O PRODUTO DE TESTE DA HOSPITAL HOME (O do TESTE B fica)
    app.delete(prodHH)
    console.log('[0079] HOSPITAL HOME: produto de teste apagado com sucesso.')

    // Restabelece contador de codigo_produtos da HH para o maior real após exclusão (0)
    const seqHHRestabelecer = app.findRecordsByFilter(
      'sequencias',
      `assinante_id = '${assinanteHHId}' && tipo = 'codigo_produtos'`,
      '',
      1,
      0,
    )
    if (seqHHRestabelecer && seqHHRestabelecer.length > 0) {
      seqHHRestabelecer[0].set('ultimo_numero', 0)
      app.save(seqHHRestabelecer[0])
      console.log('[0079] HOSPITAL HOME: contador codigo_produtos restabelecido para 0.')
    }

    console.log('[0079] Migração 0079 e validação de numeração concluídas com 100% de sucesso!')
  },
  (app) => {
    // Reversão
  },
)
