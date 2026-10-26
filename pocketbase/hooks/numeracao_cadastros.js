// @ts-check
/// <reference path="../types.d.ts" />

/**
 * HOOKS DE NUMERAÇÃO DE CADASTROS POR ASSINANTE (Etapa 9 - Prompt 9.5c)
 *
 * Gera sequencial automático por assinante para:
 * - produtos (campo 'codigo', tipo 'codigo_produtos')
 * - clientes (campo 'codigo', tipo 'codigo_clientes')
 * - fornecedores (campo 'codigo', tipo 'codigo_fornecedores')
 * - condicoes_pagamento (campo 'codigo', tipo 'codigo_condicoes_pagamento')
 * - empresas (campo 'codigo', tipo 'codigo_empresas')
 *
 * Regras:
 * - Se o usuário digitou um código manualmente (> 0), mantém o digitado.
 * - Só gera quando o campo vier vazio/zero/nulo.
 * - Requer numeracao_lib.js com require(`${__hooks}/numeracao_lib.js`) DENTRO de cada callback.
 * - Empresa_id é nulo/vazio pois a numeração é por assinante.
 */

// 1. PRODUTOS
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const numLib = require(`${__hooks}/numeracao_lib.js`)
    const proximo = numLib.proximoNumero(assinanteId, null, 'codigo_produtos')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'produtos')

// 2. CLIENTES
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const numLib = require(`${__hooks}/numeracao_lib.js`)
    const proximo = numLib.proximoNumero(assinanteId, null, 'codigo_clientes')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'clientes')

// 3. FORNECEDORES
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const numLib = require(`${__hooks}/numeracao_lib.js`)
    const proximo = numLib.proximoNumero(assinanteId, null, 'codigo_fornecedores')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'fornecedores')

// 4. CONDICOES_PAGAMENTO
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const numLib = require(`${__hooks}/numeracao_lib.js`)
    const proximo = numLib.proximoNumero(assinanteId, null, 'codigo_condicoes_pagamento')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'condicoes_pagamento')

// 5. EMPRESAS
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const numLib = require(`${__hooks}/numeracao_lib.js`)
    const proximo = numLib.proximoNumero(assinanteId, null, 'codigo_empresas')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'empresas')
