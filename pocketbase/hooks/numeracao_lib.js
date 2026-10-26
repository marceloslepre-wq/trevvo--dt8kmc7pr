// reenvio 9.8r2
// @ts-check
/// <reference path="../types.d.ts" />

/**
 * pocketbase/hooks/numeracao_lib.js
 *
 * Módulo de utilidade de numeração atômica sequencial (Etapa 9 Multi-tenant - 9.5b).
 * NÃO registra hooks nem rotas — apenas exporta funções auxiliares via module.exports.
 *
 * Cada hook ou callback que necessitar de numeração deve carregar este módulo com:
 *   const { proximoNumero } = require(`${__hooks}/numeracao_lib.js`)
 */

/**
 * Obtém o próximo número sequencial para uma entidade.
 * @param {string} assinanteId - ID do assinante (obrigatório)
 * @param {string} empresaId - ID da empresa (obrigatório para numeração por empresa, ex: vendas, compras, inventários, transferências)
 * @param {string} tipo - 'vendas' | 'inventarios' | 'pedidos_compra' | 'transferencias' | 'produtos' | 'clientes' | 'fornecedores' | 'condicoes_pagamento' | 'empresas'
 * @param {any} [txApp] - Transação ativa opcional
 * @returns {number} Próximo número incrementado
 */
function proximoNumero(assinanteId, empresaId, tipo, txApp) {
  if (!assinanteId) {
    throw new BadRequestError('assinanteId é obrigatório para gerar numeração.')
  }
  const empId = empresaId || ''

  const executar = (tx) => {
    const seqCol = tx.findCollectionByNameOrId('sequencias')

    // Tentar localizar sequência existente
    let filtro = "assinante_id = '" + assinanteId + "' && tipo = '" + tipo + "'"
    if (empId) {
      filtro += " && empresa_id = '" + empId + "'"
    } else {
      filtro += " && (empresa_id = '' || empresa_id = null)"
    }

    const existentes = tx.findRecordsByFilter('sequencias', filtro, '', 1, 0)

    if (existentes && existentes.length > 0) {
      const seqRec = existentes[0]
      const atual = seqRec.getInt('ultimo_numero') || 0
      const proximo = atual + 1
      seqRec.set('ultimo_numero', proximo)
      tx.save(seqRec)
      return proximo
    }

    // Se não existe, busca a semente (seed) na coleção de origem
    let seed = 0
    try {
      if (tipo === 'vendas') {
        const ult = tx.findRecordsByFilter(
          'vendas',
          "empresa_id = '" + empId + "'",
          '-numero',
          1,
          0,
        )
        if (ult && ult.length > 0) seed = ult[0].getInt('numero') || 0
      } else if (tipo === 'inventarios') {
        const ult = tx.findRecordsByFilter(
          'inventarios',
          "empresa_id = '" + empId + "'",
          '-numero',
          1,
          0,
        )
        if (ult && ult.length > 0) seed = ult[0].getInt('numero') || 0
      } else if (tipo === 'pedidos_compra') {
        const ult = tx.findRecordsByFilter(
          'pedidos_compra',
          "empresa_id = '" + empId + "'",
          '-numero',
          1,
          0,
        )
        if (ult && ult.length > 0) seed = ult[0].getInt('numero') || 0
      } else if (tipo === 'transferencias') {
        const ult = tx.findRecordsByFilter(
          'transferencias',
          "empresa_origem_id = '" + empId + "'",
          '-numero',
          1,
          0,
        )
        if (ult && ult.length > 0) seed = ult[0].getInt('numero') || 0
      } else {
        // Cadastros por assinante (tipo "codigo_produtos", "codigo_clientes", etc. ou nome direto da coleção)
        let colecaoDestino = tipo
        if (tipo.startsWith('codigo_')) {
          colecaoDestino = tipo.replace('codigo_', '')
        }
        if (
          colecaoDestino === 'produtos' ||
          colecaoDestino === 'clientes' ||
          colecaoDestino === 'fornecedores' ||
          colecaoDestino === 'condicoes_pagamento' ||
          colecaoDestino === 'empresas'
        ) {
          const ult = tx.findRecordsByFilter(
            colecaoDestino,
            "assinante_id = '" + assinanteId + "'",
            '-codigo',
            1,
            0,
          )
          if (ult && ult.length > 0) seed = ult[0].getInt('codigo') || 0
        }
      }
    } catch (errSeed) {
      console.log('[numeracao_lib] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message)
      seed = 0
    }

    const proximo = seed + 1
    const novoRec = new Record(seqCol)
    novoRec.set('assinante_id', assinanteId)
    novoRec.set('empresa_id', empId)
    novoRec.set('tipo', tipo)
    novoRec.set('ultimo_numero', proximo)
    tx.save(novoRec)
    return proximo
  }

  if (txApp) {
    return executar(txApp)
  }

  let resultado = 0
  $app.runInTransaction((tx) => {
    resultado = executar(tx)
  })
  return resultado
}

module.exports = {
  proximoNumero,
}
