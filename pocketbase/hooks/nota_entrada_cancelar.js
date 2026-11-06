/**
 * Hook de cancelamento transacional de nota de entrada
 * Endpoint: POST /notas-entrada/cancelar
 */

routerAdd('POST', '/notas-entrada/cancelar', (c) => {
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

    // Se for Master e estiver com modo master (impersonação) ligado no servidor,
    // tenancy.js passa a usar o assinante do cliente que o master está atendendo
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

  const notaId = body.nota_id
  const motivoCancelamento = (body.motivo || '').trim()

  if (!notaId) {
    return c.json(400, { sucesso: false, message: 'nota_id é obrigatório.' })
  }
  if (!motivoCancelamento) {
    return c.json(400, { sucesso: false, message: 'O motivo do cancelamento é obrigatório.' })
  }

  const userId = authRecord.id

  try {
    // Validação multi-tenant com a empresa gravada na nota
    const notaCheck = $app.findRecordById('notas_entrada', notaId)
    if (!notaCheck) {
      return c.json(404, { sucesso: false, message: 'Nota de entrada não encontrada.' })
    }
    const empresaIdNota = notaCheck.getString('empresa_id')
    try {
      exigirEmpresaDoUsuario(authRecord, empresaIdNota)
    } catch (errTenancy) {
      return c.json(403, {
        sucesso: false,
        message: errTenancy && errTenancy.message ? errTenancy.message : 'Acesso negado à empresa.',
      })
    }

    $app.runInTransaction((txApp) => {
      // 1. Carregar nota
      const nota = txApp.findRecordById('notas_entrada', notaId)
      if (!nota) {
        throw new Error('Nota de entrada não encontrada.')
      }

      const statusNota = nota.getString('status')
      if (statusNota !== 'Lançada' && statusNota !== 'Em conferência') {
        throw new Error(
          'Apenas notas com status "Lançada" ou "Em conferência" podem ser canceladas.',
        )
      }

      const empresaId = nota.getString('empresa_id')

      // Se a nota já foi Lançada, realiza estornos de estoque e financeiro
      if (statusNota === 'Lançada') {
        // Verificar permissão de estoque negativo na empresa
        const empresa = txApp.findRecordById('empresas', empresaId)
        const permiteEstoqueNegativo = empresa ? empresa.getBool('permite_estoque_negativo') : false

        // 2. Buscar movimentos de estoque gerados pela nota
        const movimentos = txApp.findRecordsByFilter(
          'estoque_movimentos',
          `documento_id = '${notaId}' && documento_tipo = 'NF Entrada' && estornado = false && ativo = true`,
          'created',
        )

        // 3. Se a empresa não permite estoque negativo, verificar se o estorno deixaria saldo < 0
        if (!permiteEstoqueNegativo && movimentos.length > 0) {
          const produtosNegativos = []

          for (let i = 0; i < movimentos.length; i++) {
            const mov = movimentos[i]
            const prodId = mov.getString('produto_id')
            const qtdMov = mov.getFloat('quantidade') || 0

            const saldos = txApp.findRecordsByFilter(
              'estoque_saldos',
              `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
              '',
              1,
              0,
            )

            const saldoAtual = saldos.length > 0 ? saldos[0].getFloat('quantidade') || 0 : 0
            if (saldoAtual - qtdMov < -0.0001) {
              let nomeProd = prodId
              try {
                const p = txApp.findRecordById('produtos', prodId)
                if (p) nomeProd = `${p.getString('descricao')} (Cód ${p.getInt('codigo')})`
              } catch (_) {}
              produtosNegativos.push(
                `${nomeProd}: Saldo atual ${saldoAtual}, estorno de ${qtdMov} deixaria saldo ${(saldoAtual - qtdMov).toFixed(3)}`,
              )
            }
          }

          if (produtosNegativos.length > 0) {
            throw new Error(
              `Cancelamento recusado: a empresa não permite estoque negativo e os seguintes produtos ficariam com saldo negativo:\n- ${produtosNegativos.join('\n- ')}`,
            )
          }
        }

        // 4. Estornar movimentos de estoque
        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')

        for (let i = 0; i < movimentos.length; i++) {
          const movOriginal = movimentos[i]
          const prodId = movOriginal.getString('produto_id')
          const qtdEstorno = movOriginal.getFloat('quantidade') || 0
          const loteId = movOriginal.getString('lote_id')

          // Marcar movimento original como estornado
          movOriginal.set('estornado', true)
          movOriginal.set('updated_by', userId)
          txApp.save(movOriginal)

          // Atualizar saldo
          const saldos = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
            '',
            1,
            0,
          )

          let saldoRec = null
          if (saldos.length > 0) {
            saldoRec = saldos[0]
          } else {
            saldoRec = new Record(saldosCol)
            saldoRec.set('empresa_id', empresaId)
            saldoRec.set('produto_id', prodId)
            saldoRec.set('quantidade', 0)
            saldoRec.set('custo_medio', 0)
            saldoRec.set('valor_total', 0)
            saldoRec.set('ativo', true)
            saldoRec.set('created_by', userId)
          }

          const saldoAnterior = saldoRec.getFloat('quantidade') || 0
          const custoMedioAnterior = saldoRec.getFloat('custo_medio') || 0
          const saldoPosterior = saldoAnterior - qtdEstorno
          const valorTotalNovo = Math.max(0, saldoPosterior * custoMedioAnterior)

          saldoRec.set('quantidade', saldoPosterior)
          saldoRec.set('valor_total', valorTotalNovo)
          saldoRec.set('updated_by', userId)
          txApp.save(saldoRec)

          // Estornar lote se houver
          if (loteId) {
            try {
              const loteRec = txApp.findRecordById('lotes', loteId)
              if (loteRec) {
                const qtdLoteAnt = loteRec.getFloat('quantidade') || 0
                loteRec.set('quantidade', Math.max(0, qtdLoteAnt - qtdEstorno))
                loteRec.set('updated_by', userId)
                txApp.save(loteRec)
              }
            } catch (_) {}
          }

          // Criar registro de movimento de estorno (tipo Saída, origem AJUSTE ou ESTORNO)
          const estornoMovRec = new Record(movsCol)
          estornoMovRec.set('empresa_id', empresaId)
          estornoMovRec.set('produto_id', prodId)
          estornoMovRec.set('data_movimento', new Date().toISOString())
          estornoMovRec.set('tipo', 'Saída')
          estornoMovRec.set('origem', 'AJUSTE')
          estornoMovRec.set('quantidade', qtdEstorno)
          estornoMovRec.set('custo_unitario', movOriginal.getFloat('custo_unitario') || 0)
          estornoMovRec.set(
            'valor_total',
            qtdEstorno * (movOriginal.getFloat('custo_unitario') || 0),
          )
          estornoMovRec.set('saldo_anterior', saldoAnterior)
          estornoMovRec.set('saldo_posterior', saldoPosterior)
          estornoMovRec.set('custo_medio_anterior', custoMedioAnterior)
          estornoMovRec.set('custo_medio_posterior', custoMedioAnterior)
          estornoMovRec.set('lote_id', loteId)
          estornoMovRec.set('documento_tipo', 'NF Entrada')
          estornoMovRec.set('documento_id', notaId)
          estornoMovRec.set('documento_numero', movOriginal.getString('documento_numero'))
          estornoMovRec.set('motivo', `Estorno por cancelamento da NF: ${motivoCancelamento}`)
          estornoMovRec.set('observacao', `Cancelamento efetuado em ${new Date().toISOString()}`)
          estornoMovRec.set('usuario_id', userId)
          estornoMovRec.set('estornado', false)
          estornoMovRec.set('ativo', true)
          estornoMovRec.set('created_by', userId)
          estornoMovRec.set('updated_by', userId)
          txApp.save(estornoMovRec)
        }

        // 5. Desfazer quantidade_recebida nos itens do pedido de compra vinculado
        const pedidoCompraId = nota.getString('pedido_compra_id')
        if (pedidoCompraId) {
          try {
            const pedido = txApp.findRecordById('pedidos_compra', pedidoCompraId)
            if (pedido) {
              const itensNota = txApp.findRecordsByFilter(
                'notas_entrada_itens',
                `nota_id = '${notaId}' && ativo = true`,
              )
              const itensPedido = txApp.findRecordsByFilter(
                'pedidos_compra_itens',
                `pedido_id = '${pedidoCompraId}' && ativo = true`,
              )

              let algumRecebido = false
              let todosRecebidos = true

              for (let ip = 0; ip < itensPedido.length; ip++) {
                const itPed = itensPedido[ip]
                const prodPedId = itPed.getString('produto_id')
                const qtdPedTotal = itPed.getFloat('quantidade') || 0
                let qtdRec =
                  itPed.getFloat('qtd_recebida') || itPed.getFloat('quantidade_recebida') || 0

                for (let inota = 0; inota < itensNota.length; inota++) {
                  if (itensNota[inota].getString('produto_id') === prodPedId) {
                    qtdRec = Math.max(
                      0,
                      qtdRec - (itensNota[inota].getFloat('quantidade_estoque') || 0),
                    )
                  }
                }

                itPed.set('qtd_recebida', qtdRec)
                itPed.set('quantidade_recebida', qtdRec)
                itPed.set('updated_by', userId)
                txApp.save(itPed)

                if (qtdRec > 0) {
                  algumRecebido = true
                  if (qtdRec < qtdPedTotal) {
                    todosRecebidos = false
                  }
                } else {
                  todosRecebidos = false
                }
              }

              if (todosRecebidos && itensPedido.length > 0) {
                pedido.set('status', 'Recebido')
              } else if (algumRecebido) {
                pedido.set('status', 'Parcialmente recebido')
              } else {
                pedido.set('status', 'Enviado')
              }
              pedido.set('updated_by', userId)
              txApp.save(pedido)
            }
          } catch (errPed) {
            console.warn('Erro ao atualizar status do pedido vinculado no cancelamento:', errPed)
          }
        }

        // 6. INTEGRAÇÃO ETAPA 4: VERIFICAR E CANCELAR TÍTULOS CONTAS A PAGAR
        if (txApp.hasTable('contas_pagar')) {
          const titulosNota = txApp.findRecordsByFilter(
            'contas_pagar',
            `origem_id = '${notaId}' && origem = 'NF Entrada' && ativo = true`,
          )

          // Se algum título possuir baixa ativa (não estornada), RECUSA o cancelamento
          if (titulosNota.length > 0 && txApp.hasTable('pagamentos_baixas')) {
            const titulosComBaixaAtiva = []

            for (let tn = 0; tn < titulosNota.length; tn++) {
              const tit = titulosNota[tn]
              const baixasAtivas = txApp.findRecordsByFilter(
                'pagamentos_baixas',
                `conta_pagar_id = '${tit.id}' && estornado = false && ativo = true`,
              )
              if (baixasAtivas.length > 0) {
                titulosComBaixaAtiva.push(
                  `Doc ${tit.getString('numero_documento')} Parc ${tit.getString('parcela')} (${baixasAtivas.length} pagamento(s) ativo(s))`,
                )
              }
            }

            if (titulosComBaixaAtiva.length > 0) {
              throw new Error(
                `Cancelamento recusado: a nota possui títulos a pagar com pagamentos já realizados. É necessário estornar os seguintes pagamentos no Contas a Pagar antes de cancelar a nota:\n- ${titulosComBaixaAtiva.join('\n- ')}`,
              )
            }

            // Se não houver baixas ativas, cancela os títulos da nota com o mesmo motivo
            for (let tc = 0; tc < titulosNota.length; tc++) {
              const titParaCancelar = titulosNota[tc]
              titParaCancelar.set('status', 'Cancelado')
              titParaCancelar.set(
                'motivo_cancelamento',
                `Cancelamento da Nota Fiscal de Entrada: ${motivoCancelamento}`,
              )
              titParaCancelar.set('saldo', 0)
              titParaCancelar.set('updated_by', userId)
              txApp.save(titParaCancelar)
            }
          }
        }
      }

      // 7. Atualizar status da nota para "Cancelada"
      const statusAnterior = nota.getString('status')
      nota.set('status', 'Cancelada')
      nota.set('motivo_cancelamento', motivoCancelamento)
      nota.set('updated_by', userId)
      txApp.save(nota)

      // 8. Gravar logs_auditoria
      const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')
      const auditRec = new Record(logsCol)
      auditRec.set('usuario_id', userId)
      auditRec.set('usuario_nome', authRecord.getString('name') || 'Usuário')
      auditRec.set('empresa_id', empresaId)
      auditRec.set('tabela', 'notas_entrada')
      auditRec.set('registro_id', notaId)
      auditRec.set('acao', 'cancelamento')
      auditRec.set('valores_antes', JSON.stringify({ status: statusAnterior }))
      auditRec.set(
        'valores_depois',
        JSON.stringify({
          status: 'Cancelada',
          motivo_cancelamento: motivoCancelamento,
        }),
      )
      txApp.save(auditRec)
    })

    return c.json(200, {
      sucesso: true,
      message: 'Nota de entrada cancelada com sucesso.',
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
