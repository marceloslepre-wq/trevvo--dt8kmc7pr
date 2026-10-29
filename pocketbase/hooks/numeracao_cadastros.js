// reenvio 9.8r2
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
 * - Função local proximoNumeroLocal declarada DENTRO de cada callback (sem import de arquivos locais).
 * - Empresa_id é nulo/vazio pois a numeração é por assinante.
 */

// 1. PRODUTOS
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  function proximoNumeroLocal(assinanteId, empresaId, tipo, txApp) {
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
      } catch (errSeed) {
        console.log(
          '[numeracao_cadastros] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const proximo = proximoNumeroLocal(assinanteId, null, 'codigo_produtos')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'produtos')

// 2. CLIENTES
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  function proximoNumeroLocal(assinanteId, empresaId, tipo, txApp) {
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
      } catch (errSeed) {
        console.log(
          '[numeracao_cadastros] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const proximo = proximoNumeroLocal(assinanteId, null, 'codigo_clientes')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'clientes')

// 3. FORNECEDORES
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  function proximoNumeroLocal(assinanteId, empresaId, tipo, txApp) {
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
      } catch (errSeed) {
        console.log(
          '[numeracao_cadastros] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const proximo = proximoNumeroLocal(assinanteId, null, 'codigo_fornecedores')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'fornecedores')

// 4. CONDICOES_PAGAMENTO
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  function proximoNumeroLocal(assinanteId, empresaId, tipo, txApp) {
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
      } catch (errSeed) {
        console.log(
          '[numeracao_cadastros] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const proximo = proximoNumeroLocal(assinanteId, null, 'codigo_condicoes_pagamento')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'condicoes_pagamento')

// 5. EMPRESAS
onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  function proximoNumeroLocal(assinanteId, empresaId, tipo, txApp) {
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
      } catch (errSeed) {
        console.log(
          '[numeracao_cadastros] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

  const codAtual = record.getInt('codigo') || 0
  if (codAtual <= 0) {
    const assinanteId = record.getString('assinante_id') || 'wqxiw7olvkup3sm'
    const proximo = proximoNumeroLocal(assinanteId, null, 'codigo_empresas')
    record.set('codigo', proximo)
  }

  return e.next()
}, 'empresas')
