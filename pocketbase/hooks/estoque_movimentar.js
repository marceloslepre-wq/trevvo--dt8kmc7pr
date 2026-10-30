/**
 * Hook do serviço central de movimentação de estoque
 * Endpoint: POST /estoque/movimentar
 *
 * Executa todas as movimentações de um ou múltiplos itens dentro de uma
 * transação atômica do SQLite (runInTransaction).
 *
 * Regras implementadas:
 * - Controle de lote/validade para produtos com controla_lote_validade = true:
 *   - Entrada: exige lote_id OU numero_lote + data_validade (cria lote ou aproveita se já existir)
 *   - Saída: exige lote_id OU busca automaticamente por FEFO (vence primeiro, sai primeiro)
 *   - Lote vencido: permitido apenas para origens PERDA e AJUSTE_SAIDA; outras origens recusam com erro formatado
 *   - Invariante: a quantidade do lote é atualizada rigorosamente dentro da transação
 * - Não permite estoque negativo se empresa.permite_estoque_negativo === false
 * - Custo médio ponderado atualizado nas entradas com novo custo
 * - Gravação imutável no kardex (estoque_movimentos) com lote_id
 * - Atualização do saldo consolidado em estoque_saldos
 * - Expansão automática de produtos do tipo "kit"
 */

routerAdd('POST', '/estoque/movimentar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Usuário não autenticado.' })
  }

  // Funções de tenancy copiadas localmente dentro do callback (evita require(`${__hooks}/tenancy.js`) que causa Invalid module no JSVM)
  function assinanteDoUsuario(auth) {
    if (!auth) {
      throw new BadRequestError('Autenticação necessária para identificar o assinante.')
    }

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) {
      throw new BadRequestError('Registro de usuário ERP não encontrado.')
    }

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) {
      throw new BadRequestError('Usuário não possui vínculo com nenhum assinante cadastrado.')
    }

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    function checarSeMasterLocal(authRec, appInstance) {
      const app = appInstance || $app
      if (!authRec || !authRec.id) return false
      try {
        const userRec = app.findRecordById('_pb_users_auth_', authRec.id)
        return !!(userRec && userRec.getString('tipo') === 'master')
      } catch (_) {
        return false
      }
    }

    function validarLicencaAtivaOuBloquearLocal(assinanteRec, authRecord) {
      if (!assinanteRec) return

      // Assinante de origem NUNCA é bloqueado
      if (
        assinanteRec.getBool('origem') ||
        assinanteRec.getString('numero_licenca') === 'HH-RFR8HF'
      ) {
        return
      }

      // O master NUNCA é bloqueado
      if (authRecord && checarSeMasterLocal(authRecord)) {
        return
      }

      const status = assinanteRec.getString('status')
      if (status === 'Pausada' || status === 'Expirada' || status === 'Cancelada') {
        throw new ForbiddenError('Licença pausada ou vencida. Fale com o suporte.')
      }
    }

    if (eMaster(auth)) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    const assinante = $app.findRecordById('assinantes', assinanteId)
    if (!assinante) {
      throw new BadRequestError('Assinante não encontrado.')
    }

    try {
      validarLicencaAtivaOuBloquearLocal(assinante, auth)
    } catch (errBloq) {
      throw errBloq
    }

    return assinante
  }

  function eMaster(auth) {
    if (!auth) return false
    try {
      const userRec = $app.findRecordById('_pb_users_auth_', auth.id)
      return !!(userRec && userRec.getString('tipo') === 'master')
    } catch (_) {
      return false
    }
  }

  function empresasDoUsuario(auth) {
    if (!auth) return []

    let usuarioRec = null
    try {
      const uRecs = $app.findRecordsByFilter(
        'usuarios',
        "auth_user_id = '" + auth.id + "' || id = '" + auth.id + "'",
        '-created',
        1,
        0,
      )
      if (uRecs && uRecs.length > 0) {
        usuarioRec = uRecs[0]
      }
    } catch (_) {}

    if (!usuarioRec && auth.getString && auth.getString('email')) {
      try {
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          "email = '" + auth.getString('email') + "'",
          '-created',
          1,
          0,
        )
        if (uRecs && uRecs.length > 0) {
          usuarioRec = uRecs[0]
        }
      } catch (_) {}
    }

    if (!usuarioRec) return []

    let assinanteId = usuarioRec.getString('assinante_id')
    if (!assinanteId) return []

    function obterAssinanteImpersonadoLocal(userId, appInstance) {
      const app = appInstance || $app
      if (!userId) return null
      try {
        if (!app.hasTable('master_impersonacoes')) return null
        const recs = app.findRecordsByFilter(
          'master_impersonacoes',
          "user_id = '" + userId + "'",
          '-created',
          1,
          0,
        )
        if (recs && recs.length > 0) {
          return recs[0].getString('assinante_id') || null
        }
      } catch (_) {}
      return null
    }

    const ehMasterUser = eMaster(auth)
    if (ehMasterUser) {
      try {
        const impersonadoId = obterAssinanteImpersonadoLocal(auth.id, $app)
        if (impersonadoId) {
          assinanteId = impersonadoId
        }
      } catch (_) {}
    }

    let isAdmin = false
    const perfilId = usuarioRec.getString('perfil_id')
    if (perfilId) {
      try {
        const perfilRec = $app.findRecordById('perfis_acesso', perfilId)
        if (perfilRec && perfilRec.getBool('ativo') && perfilRec.getBool('administrador')) {
          isAdmin = true
        }
      } catch (_) {}
    }

    if (isAdmin || ehMasterUser) {
      try {
        const empresas = $app.findRecordsByFilter(
          'empresas',
          "assinante_id = '" + assinanteId + "' && ativo = true",
          'codigo',
          500,
          0,
        )
        return empresas
      } catch (_) {
        return []
      }
    }

    const permitidosIds = new Set()
    const padraoId = usuarioRec.getString('empresa_padrao_id')
    if (padraoId) permitidosIds.add(padraoId)

    try {
      const vinculos = $app.findRecordsByFilter(
        'usuarios_empresas',
        "usuario_id = '" + usuarioRec.id + "' && ativo = true",
        '',
        500,
        0,
      )
      for (let i = 0; i < vinculos.length; i++) {
        const eId = vinculos[i].getString('empresa_id')
        if (eId) permitidosIds.add(eId)
      }
    } catch (_) {}

    const empresas = []
    permitidosIds.forEach((eId) => {
      try {
        const emp = $app.findRecordById('empresas', eId)
        if (emp && emp.getBool('ativo') && emp.getString('assinante_id') === assinanteId) {
          empresas.push(emp)
        }
      } catch (_) {}
    })

    empresas.sort((a, b) => (a.getInt('codigo') || 0) - (b.getInt('codigo') || 0))
    return empresas
  }

  function exigirEmpresaDoUsuario(auth, empresaId) {
    if (!empresaId) {
      throw new BadRequestError('ID da empresa é obrigatório.')
    }
    const permitidas = empresasDoUsuario(auth)
    const encontrada = permitidas.find((e) => e.id === empresaId)
    if (!encontrada) {
      throw new ForbiddenError('Acesso negado à empresa especificada para este usuário/assinante.')
    }
    return encontrada
  }

  let body = {}
  try {
    body = c.requestInfo().body || {}
  } catch (err) {
    return c.json(400, { sucesso: false, message: 'Corpo da requisição inválido.' })
  }

  const rawItens = body.itens
  if (!Array.isArray(rawItens) || rawItens.length === 0) {
    return c.json(400, {
      sucesso: false,
      message: 'Lista de itens vazia. Envie ao menos um item em "itens".',
    })
  }

  // Validação de governança multi-tenant: o usuário deve ter vínculo com todas as empresas movimentadas
  try {
    for (let i = 0; i < rawItens.length; i++) {
      if (rawItens[i] && rawItens[i].empresa_id) {
        exigirEmpresaDoUsuario(authRecord, rawItens[i].empresa_id)
      }
    }
  } catch (errTenancy) {
    return c.json(403, {
      sucesso: false,
      message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
    })
  }

  const userId = authRecord.id
  const movimentosGravados = []
  const lotesCol = $app.findCollectionByNameOrId('lotes')
  const saldosCol = $app.findCollectionByNameOrId('estoque_saldos')
  const movsCol = $app.findCollectionByNameOrId('estoque_movimentos')

  // Formata data ISO para dd/mm/aaaa
  function formatarDataBR(isoStr) {
    if (!isoStr) return ''
    try {
      const parts = isoStr.split('T')[0].split('-')
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`
      }
    } catch (_) {}
    return isoStr
  }

  // Verifica se uma data de validade está vencida em relação ao dia de hoje (UTC)
  function isLoteVencido(dataValidadeStr) {
    if (!dataValidadeStr) return false
    const hojeStr = new Date().toISOString().slice(0, 10)
    const valStr = dataValidadeStr.slice(0, 10)
    return valStr < hojeStr
  }

  try {
    $app.runInTransaction((txApp) => {
      // 1. Expandir kits e preparar lista atômica de itens a movimentar
      const itensPlanos = []

      for (let i = 0; i < rawItens.length; i++) {
        const item = rawItens[i]

        if (!item.empresa_id) throw new Error(`Item ${i + 1}: empresa_id é obrigatório.`)
        if (!item.produto_id) throw new Error(`Item ${i + 1}: produto_id é obrigatório.`)
        if (!item.tipo || (item.tipo !== 'Entrada' && item.tipo !== 'Saída')) {
          throw new Error(`Item ${i + 1}: tipo deve ser 'Entrada' ou 'Saída'.`)
        }
        if (!item.origem) throw new Error(`Item ${i + 1}: origem é obrigatória.`)

        const qtd = Number(item.quantidade)
        if (isNaN(qtd) || qtd <= 0) {
          throw new Error(`Item ${i + 1}: quantidade deve ser maior que zero.`)
        }

        // Buscar produto para checar tipo (kit ou simples) e flag controla_lote_validade
        const prod = txApp.findRecordById('produtos', item.produto_id)
        if (!prod || !prod.getBool('ativo')) {
          throw new Error(`Item ${i + 1}: produto inexistente ou inativo.`)
        }

        const tipoProduto = prod.getString('tipo')
        const controlaEstoque = prod.getBool('controla_estoque')
        const controlaLote = prod.getBool('controla_lote_validade')

        if (tipoProduto === 'kit') {
          // Explode itens do kit
          const kitItens = txApp.findRecordsByFilter(
            'produtos_kit_itens',
            `produto_kit_id = '${prod.id}' && ativo = true`,
          )
          if (kitItens.length === 0) {
            throw new Error(
              `O produto kit "${prod.getString('descricao')}" não possui componentes cadastrados.`,
            )
          }

          for (let k = 0; k < kitItens.length; k++) {
            const ki = kitItens[k]
            const compId = ki.getString('produto_item_id')
            const compQtd = ki.getInt('quantidade') || 1
            const compProd = txApp.findRecordById('produtos', compId)

            if (compProd && compProd.getBool('controla_estoque')) {
              itensPlanos.push({
                empresa_id: item.empresa_id,
                produto_id: compId,
                tipo: item.tipo,
                origem: item.origem,
                quantidade: qtd * compQtd,
                custo_unitario: item.custo_unitario,
                data_movimento: item.data_movimento || new Date().toISOString(),
                documento_tipo: item.documento_tipo || 'Kit',
                documento_id: item.documento_id || '',
                documento_numero: item.documento_numero || '',
                motivo: item.motivo || `Componente do kit: ${prod.getString('descricao')}`,
                observacao: item.observacao || '',
                prodRecord: compProd,
                controlaLote: compProd.getBool('controla_lote_validade'),
                lote_id: item.lote_id,
                numero_lote: item.numero_lote,
                data_fabricacao: item.data_fabricacao,
                data_validade: item.data_validade,
              })
            }
          }
        } else {
          // Produto normal ou matéria-prima
          if (controlaEstoque) {
            itensPlanos.push({
              empresa_id: item.empresa_id,
              produto_id: item.produto_id,
              tipo: item.tipo,
              origem: item.origem,
              quantidade: qtd,
              custo_unitario: item.custo_unitario,
              data_movimento: item.data_movimento || new Date().toISOString(),
              documento_tipo: item.documento_tipo || '',
              documento_id: item.documento_id || '',
              documento_numero: item.documento_numero || '',
              motivo: item.motivo || '',
              observacao: item.observacao || '',
              prodRecord: prod,
              controlaLote: controlaLote,
              lote_id: item.lote_id,
              numero_lote: item.numero_lote,
              data_fabricacao: item.data_fabricacao,
              data_validade: item.data_validade,
            })
          }
        }
      }

      // 2. Processar cada item plano dentro da transação com suporte a Lotes e FEFO
      for (let j = 0; j < itensPlanos.length; j++) {
        const it = itensPlanos[j]
        const prod = it.prodRecord
        const emp = txApp.findRecordById('empresas', it.empresa_id)
        if (!emp) throw new Error(`Empresa ${it.empresa_id} não encontrada.`)

        const permiteNegativo = emp.getBool('permite_estoque_negativo')
        const dataMov = it.data_movimento || new Date().toISOString()
        const descProd = prod.getString('descricao')

        // Se o produto controla lote, definimos as alocações de lote
        // Uma movimentação de saída pode ser fracionada em múltiplos lotes pelo FEFO
        // Cada alocação terá { loteId, numeroLote, dataValidade, quantidade }
        const alocacoesLote = []

        if (it.controlaLote) {
          if (it.tipo === 'Entrada') {
            // Regra Entrada: exige lote_id existente OU numero_lote + data_validade
            let loteRec = null

            if (it.lote_id) {
              try {
                loteRec = txApp.findRecordById('lotes', it.lote_id)
              } catch (_) {
                loteRec = null
              }
              if (!loteRec) {
                throw new Error(`Produto "${descProd}": lote_id informado não existe.`)
              }
            } else if (it.numero_lote && it.data_validade) {
              const numLimpo = it.numero_lote.trim()
              // Procura se já existe para a mesma empresa + produto + numero_lote
              const lotesExistentes = txApp.findRecordsByFilter(
                'lotes',
                `empresa_id = '${it.empresa_id}' && produto_id = '${prod.id}' && numero_lote = '${numLimpo}'`,
                '',
                1,
                0,
              )

              if (lotesExistentes.length > 0) {
                loteRec = lotesExistentes[0]
              } else {
                // Cria novo lote
                loteRec = new Record(lotesCol)
                loteRec.set('empresa_id', it.empresa_id)
                loteRec.set('produto_id', prod.id)
                loteRec.set('numero_lote', numLimpo)
                if (it.data_fabricacao) {
                  loteRec.set('data_fabricacao', it.data_fabricacao)
                }
                loteRec.set('data_validade', it.data_validade)
                loteRec.set('quantidade', 0)
                loteRec.set('observacao', it.observacao || '')
                loteRec.set('ativo', true)
                loteRec.set('created_by', userId)
                loteRec.set('updated_by', userId)
                txApp.save(loteRec)
              }
            } else {
              throw new Error(
                `Produto "${descProd}" controla lote e validade: informe o número do lote e a data de validade na entrada.`,
              )
            }

            // Atualiza saldo do lote na entrada
            const saldoLoteAnt = loteRec.getFloat('quantidade') || 0
            const novoSaldoLote = saldoLoteAnt + it.quantidade
            loteRec.set('quantidade', novoSaldoLote)
            loteRec.set('updated_by', userId)
            txApp.save(loteRec)

            alocacoesLote.push({
              loteId: loteRec.id,
              numeroLote: loteRec.getString('numero_lote'),
              dataValidade: loteRec.getString('data_validade'),
              quantidade: it.quantidade,
            })
          } else {
            // Regra Saída: exige lote_id OU FEFO automático
            if (it.lote_id) {
              // Saída com lote específico informado
              let loteRec = null
              try {
                loteRec = txApp.findRecordById('lotes', it.lote_id)
              } catch (_) {
                loteRec = null
              }
              if (!loteRec) {
                throw new Error(`Produto "${descProd}": lote selecionado não encontrado.`)
              }

              const numLote = loteRec.getString('numero_lote')
              const dataVal = loteRec.getString('data_validade')
              const saldoLote = loteRec.getFloat('quantidade') || 0

              // Verificação de lote vencido:
              // Permitir saída de lote vencido apenas para PERDA ou AJUSTE_SAIDA
              if (isLoteVencido(dataVal) && it.origem !== 'PERDA' && it.origem !== 'AJUSTE_SAIDA') {
                const dataValFmt = formatarDataBR(dataVal)
                throw new Error(`Lote ${numLote} vencido em ${dataValFmt}`)
              }

              if (it.quantidade > saldoLote && !permiteNegativo) {
                throw new Error(
                  `Produto "${descProd}": quantidade solicitada (${it.quantidade}) excede o saldo do lote ${numLote} (${saldoLote}).`,
                )
              }

              const novoSaldoLote = saldoLote - it.quantidade
              loteRec.set('quantidade', novoSaldoLote)
              loteRec.set('updated_by', userId)
              txApp.save(loteRec)

              alocacoesLote.push({
                loteId: loteRec.id,
                numeroLote: numLote,
                dataValidade: dataVal,
                quantidade: it.quantidade,
              })
            } else {
              // FEFO: First Expire, First Out
              // Busca lotes com saldo > 0 da empresa + produto, ordenados por data_validade ASC
              const lotesDisponiveis = txApp.findRecordsByFilter(
                'lotes',
                `empresa_id = '${it.empresa_id}' && produto_id = '${prod.id}' && ativo = true && quantidade > 0`,
                'data_validade,created',
              )

              if (lotesDisponiveis.length === 0) {
                throw new Error(
                  `Produto "${descProd}": nenhum lote com saldo disponível para atender a saída.`,
                )
              }

              let qtdRestante = it.quantidade

              for (let li = 0; li < lotesDisponiveis.length && qtdRestante > 0; li++) {
                const loteRec = lotesDisponiveis[li]
                const numLote = loteRec.getString('numero_lote')
                const dataVal = loteRec.getString('data_validade')
                const saldoLote = loteRec.getFloat('quantidade') || 0

                // Se o lote está vencido e a operação não for PERDA / AJUSTE_SAIDA, recusa
                if (
                  isLoteVencido(dataVal) &&
                  it.origem !== 'PERDA' &&
                  it.origem !== 'AJUSTE_SAIDA'
                ) {
                  const dataValFmt = formatarDataBR(dataVal)
                  throw new Error(`Lote ${numLote} vencido em ${dataValFmt}`)
                }

                const qtdDescontar = Math.min(saldoLote, qtdRestante)
                const novoSaldo = saldoLote - qtdDescontar

                loteRec.set('quantidade', novoSaldo)
                loteRec.set('updated_by', userId)
                txApp.save(loteRec)

                alocacoesLote.push({
                  loteId: loteRec.id,
                  numeroLote: numLote,
                  dataValidade: dataVal,
                  quantidade: qtdDescontar,
                })

                qtdRestante -= qtdDescontar
              }

              if (qtdRestante > 0.00001) {
                if (!permiteNegativo) {
                  throw new Error(
                    `Produto "${descProd}": saldo insuficiente nos lotes para cobrir a saída solicitada (${it.quantidade}). Restante sem lote: ${qtdRestante.toFixed(4)}.`,
                  )
                }
              }
            }
          }
        } else {
          // Produto não controla lote: alocação única sem lote_id
          alocacoesLote.push({
            loteId: '',
            numeroLote: '',
            dataValidade: '',
            quantidade: it.quantidade,
          })
        }

        // 3. Atualizar estoque_saldos do produto na empresa
        let saldoRec = null
        const saldosExistentes = txApp.findRecordsByFilter(
          'estoque_saldos',
          `empresa_id = '${it.empresa_id}' && produto_id = '${prod.id}'`,
          '',
          1,
          0,
        )

        if (saldosExistentes.length > 0) {
          saldoRec = saldosExistentes[0]
        } else {
          saldoRec = new Record(saldosCol)
          saldoRec.set('empresa_id', it.empresa_id)
          saldoRec.set('produto_id', prod.id)
          saldoRec.set('quantidade', 0)
          saldoRec.set('custo_medio', prod.getFloat('preco_custo') || 0)
          saldoRec.set('valor_total', 0)
          saldoRec.set('ativo', true)
          saldoRec.set('created_by', userId)
        }

        const saldoAnterior = saldoRec.getFloat('quantidade') || 0
        const custoMedioAnterior =
          saldoRec.getFloat('custo_medio') || prod.getFloat('preco_custo') || 0
        const isEntrada = it.tipo === 'Entrada'
        const saldoPosterior = isEntrada
          ? saldoAnterior + it.quantidade
          : saldoAnterior - it.quantidade

        // Validar estoque negativo geral na filial
        if (saldoPosterior < 0 && !permiteNegativo) {
          throw new Error(
            `Produto "${descProd}": saldo insuficiente no estoque geral (${saldoAnterior.toFixed(4)}). A empresa não permite saldo negativo.`,
          )
        }

        // Recalcular custo médio ponderado
        let novoCustoMedio = custoMedioAnterior
        if (isEntrada) {
          const custoUnitarioEntrada =
            it.custo_unitario !== undefined && it.custo_unitario !== null
              ? Number(it.custo_unitario)
              : custoMedioAnterior

          if (saldoAnterior <= 0) {
            novoCustoMedio = custoUnitarioEntrada
          } else {
            const valorEstoqueAnterior = saldoAnterior * custoMedioAnterior
            const valorEntrada = it.quantidade * custoUnitarioEntrada
            novoCustoMedio = (valorEstoqueAnterior + valorEntrada) / saldoPosterior
          }
        }

        const novoValorTotal = Math.max(0, saldoPosterior * novoCustoMedio)

        saldoRec.set('quantidade', saldoPosterior)
        saldoRec.set('custo_medio', novoCustoMedio)
        saldoRec.set('valor_total', novoValorTotal)
        if (isEntrada) {
          saldoRec.set('data_ultima_entrada', dataMov)
        } else {
          saldoRec.set('data_ultima_saida', dataMov)
        }
        saldoRec.set('updated_by', userId)
        txApp.save(saldoRec)

        // 4. Invariante de integridade: se produto controla lote, a soma dos lotes
        // deve bater rigorosamente com o saldo total do produto na filial
        if (it.controlaLote) {
          const todosLotes = txApp.findRecordsByFilter(
            'lotes',
            `empresa_id = '${it.empresa_id}' && produto_id = '${prod.id}' && ativo = true`,
          )
          let somaLotes = 0
          for (let s = 0; s < todosLotes.length; s++) {
            somaLotes += todosLotes[s].getFloat('quantidade') || 0
          }

          const difLotes = Math.abs(somaLotes - saldoPosterior)
          if (difLotes > 0.001) {
            throw new Error(
              `Invariante de estoque violada para "${descProd}": soma dos lotes (${somaLotes.toFixed(4)}) difere do saldo geral (${saldoPosterior.toFixed(4)}).`,
            )
          }
        }

        // 5. Gravar movimentos no Kardex (estoque_movimentos)
        // Se a saída foi dividida pelo FEFO em múltiplos lotes, grava UM movimento por lote
        // Todos compartilham o mesmo documento_tipo/id/numero
        let saldoAcumuladoLinha = saldoAnterior

        for (let a = 0; a < alocacoesLote.length; a++) {
          const aloc = alocacoesLote[a]
          const qtdAloc = aloc.quantidade
          const saldoAntAloc = saldoAcumuladoLinha
          const saldoPosAloc = isEntrada ? saldoAntAloc + qtdAloc : saldoAntAloc - qtdAloc
          saldoAcumuladoLinha = saldoPosAloc

          const custoUnitarioEfetivo =
            it.custo_unitario !== undefined && it.custo_unitario !== null
              ? Number(it.custo_unitario)
              : custoMedioAnterior

          const movRec = new Record(movsCol)
          movRec.set('empresa_id', it.empresa_id)
          movRec.set('produto_id', prod.id)
          movRec.set('data_movimento', dataMov)
          movRec.set('tipo', it.tipo)
          movRec.set('origem', it.origem)
          movRec.set('quantidade', qtdAloc)
          movRec.set('custo_unitario', custoUnitarioEfetivo)
          movRec.set('valor_total', qtdAloc * custoUnitarioEfetivo)
          movRec.set('saldo_anterior', saldoAntAloc)
          movRec.set('saldo_posterior', saldoPosAloc)
          movRec.set('custo_medio_anterior', custoMedioAnterior)
          movRec.set('custo_medio_posterior', novoCustoMedio)
          movRec.set('lote_id', aloc.loteId || '')
          movRec.set('documento_tipo', it.documento_tipo || '')
          movRec.set('documento_id', it.documento_id || '')
          movRec.set('documento_numero', it.documento_numero || '')
          movRec.set('motivo', it.motivo || '')
          movRec.set('observacao', it.observacao || '')
          movRec.set('usuario_id', userId)
          movRec.set('estornado', false)
          movRec.set('ativo', true)
          movRec.set('created_by', userId)
          movRec.set('updated_by', userId)
          txApp.save(movRec)

          movimentosGravados.push({
            id: movRec.id,
            produto_id: prod.id,
            produto_descricao: descProd,
            quantidade: qtdAloc,
            tipo: it.tipo,
            origem: it.origem,
            lote_id: aloc.loteId || null,
            numero_lote: aloc.numeroLote || null,
            saldo_posterior: saldoPosAloc,
            custo_medio_posterior: novoCustoMedio,
          })
        }
      }
    })

    return c.json(200, {
      sucesso: true,
      message: 'Movimentação de estoque realizada com sucesso.',
      total: movimentosGravados.length,
      movimentos: movimentosGravados,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
