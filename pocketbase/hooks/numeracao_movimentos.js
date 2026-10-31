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
 * Lógica de numeração embutida como função local dentro de cada callback (sem require).
 */

// VENDAS (Orçamentos / Pedidos / Rascunhos de venda criados via API)
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  /**
   * Função local para gerar o próximo número sequencial de forma atômica
   */
  function proximoNumero(assinanteId, empresaId, tipo, txApp) {
    if (!assinanteId) {
      throw new BadRequestError('assinanteId é obrigatório para gerar numeração.')
    }
    const empId = empresaId || ''

    const executar = (tx) => {
      const seqCol = tx.findCollectionByNameOrId('sequencias')

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
        }
      } catch (errSeed) {
        console.log(
          '[numeracao_movimentos] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
        )
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

  function proximoNumero(assinanteId, empresaId, tipo, txApp) {
    if (!assinanteId) {
      throw new BadRequestError('assinanteId é obrigatório para gerar numeração.')
    }
    const empId = empresaId || ''

    const executar = (tx) => {
      const seqCol = tx.findCollectionByNameOrId('sequencias')

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
        }
      } catch (errSeed) {
        console.log(
          '[numeracao_movimentos] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
        )
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

  function proximoNumero(assinanteId, empresaId, tipo, txApp) {
    if (!assinanteId) {
      throw new BadRequestError('assinanteId é obrigatório para gerar numeração.')
    }
    const empId = empresaId || ''

    const executar = (tx) => {
      const seqCol = tx.findCollectionByNameOrId('sequencias')

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
        }
      } catch (errSeed) {
        console.log(
          '[numeracao_movimentos] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
        )
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

  function proximoNumero(assinanteId, empresaId, tipo, txApp) {
    if (!assinanteId) {
      throw new BadRequestError('assinanteId é obrigatório para gerar numeração.')
    }
    const empId = empresaId || ''

    const executar = (tx) => {
      const seqCol = tx.findCollectionByNameOrId('sequencias')

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
        }
      } catch (errSeed) {
        console.log(
          '[numeracao_movimentos] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
        )
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
        const prox = proximoNumero(assId, empOrigemId, 'transferencias')
        record.set('numero', prox)
      }
    }
  }

  return e.next()
}, 'transferencias')
