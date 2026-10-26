// reenvio 9.8r2
// @ts-check
/// <reference path="../types.d.ts" />

/**
 * pocketbase/hooks/numeracao_movimentos.js
 *
 * Hooks de numeração sequencial atômica para movimentos por empresa:
 * 1. vendas (quando numero não informado ou <= 0)
 * 2. inventarios (quando numero não informado ou <= 0)
 * 3. pedidos_compra (quando numero não informado ou <= 0)
 * 4. transferencias (quando numero não informado ou <= 0, pela empresa_origem_id)
 *
 * Carrega a lógica centralizada de pocketbase/hooks/numeracao_lib.js dentro de cada callback.
 */

// VENDAS (Orçamentos / Pedidos / Rascunhos de venda criados via API)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const num = record.getInt('numero') || 0
  if (num <= 0) {
    const empId = record.getString('empresa_id')
    if (empId) {
      let assId = ''
      try {
        const emp = $app.findRecordById('empresas', empId)
        if (emp) assId = emp.getString('assinante_id')
      } catch (_) {}
      if (assId) {
        const { proximoNumero } = require(`${__hooks}/numeracao_lib.js`)
        const prox = proximoNumero(assId, empId, 'vendas')
        record.set('numero', prox)
      }
    }
  }

  return e.next()
}, 'vendas')

// INVENTÁRIOS
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const num = record.getInt('numero') || 0
  if (num <= 0) {
    const empId = record.getString('empresa_id')
    if (empId) {
      let assId = ''
      try {
        const emp = $app.findRecordById('empresas', empId)
        if (emp) assId = emp.getString('assinante_id')
      } catch (_) {}
      if (assId) {
        const { proximoNumero } = require(`${__hooks}/numeracao_lib.js`)
        const prox = proximoNumero(assId, empId, 'inventarios')
        record.set('numero', prox)
      }
    }
  }

  return e.next()
}, 'inventarios')

// PEDIDOS DE COMPRA
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const num = record.getInt('numero') || 0
  if (num <= 0) {
    const empId = record.getString('empresa_id')
    if (empId) {
      let assId = ''
      try {
        const emp = $app.findRecordById('empresas', empId)
        if (emp) assId = emp.getString('assinante_id')
      } catch (_) {}
      if (assId) {
        const { proximoNumero } = require(`${__hooks}/numeracao_lib.js`)
        const prox = proximoNumero(assId, empId, 'pedidos_compra')
        record.set('numero', prox)
      }
    }
  }

  return e.next()
}, 'pedidos_compra')

// TRANSFERÊNCIAS (usa empresa_origem_id)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const num = record.getInt('numero') || 0
  if (num <= 0) {
    const empOrigemId = record.getString('empresa_origem_id')
    if (empOrigemId) {
      let assId = ''
      try {
        const emp = $app.findRecordById('empresas', empOrigemId)
        if (emp) assId = emp.getString('assinante_id')
      } catch (_) {}
      if (assId) {
        const { proximoNumero } = require(`${__hooks}/numeracao_lib.js`)
        const prox = proximoNumero(assId, empOrigemId, 'transferencias')
        record.set('numero', prox)
      }
    }
  }

  return e.next()
}, 'transferencias')
