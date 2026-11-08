// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Hook transacional central de Vendas:
 * POST /backend/v1/vendas/finalizar
 * POST /backend/v1/vendas/cancelar
 *
 * Garante atomicidade: estoque, financeiro, crediário, cartões e auditoria.
 * O navegador NÃO grava diretamente em vendas_pagamentos ou no estoque.
 *
 * Funções de tenancy e numeração copiadas como funções locais no início de cada
 * callback para evitar require(`${__hooks}/...`) no runtime JSVM (Goja).
 */

routerAdd(
  'POST',
  '/backend/v1/vendas/finalizar',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, {
          sucesso: false,
          message: 'Acesso negado: autenticação obrigatória.',
        })
      }

      // -------------------------------------------------------------
      // Funções locais de tenancy e governança multi-tenant
      // -------------------------------------------------------------
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
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      // -------------------------------------------------------------
      // Função local de numeração atômica sequencial por empresa
      // -------------------------------------------------------------
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
            }
          } catch (errSeed) {
            console.log(
              '[vendas_finalizar] Aviso ao buscar seed para ' + tipo + ': ' + errSeed.message,
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

      const userId = authRecord.id
      const data = c.requestInfo().body || {}
      const vendaId = data.venda_id
      const pagamentosInput = Array.isArray(data.pagamentos) ? data.pagamentos : []

      if (!vendaId) {
        return c.json(400, {
          sucesso: false,
          message: 'Campo venda_id é obrigatório.',
        })
      }

      if (!pagamentosInput || pagamentosInput.length === 0) {
        return c.json(400, {
          sucesso: false,
          message: 'A venda deve conter ao menos uma forma de pagamento.',
        })
      }

      let resposta = null

      $app.runInTransaction((txApp) => {
        // 1. Obter venda
        const venda = txApp.findRecordById('vendas', vendaId)
        if (!venda || !venda.getBool('ativo')) {
          throw new Error('Venda não encontrada ou inativa.')
        }

        const statusAtual = venda.getString('status')
        if (statusAtual === 'Finalizada') {
          throw new Error('Esta venda já foi finalizada.')
        }
        if (statusAtual === 'Cancelada') {
          throw new Error('Esta venda está cancelada e não pode ser finalizada.')
        }

        const empresaId = venda.getString('empresa_id')
        exigirEmpresaDoUsuario(authRecord, empresaId)
        const tipoVenda = venda.getString('tipo') || 'Venda'
        const caixaSessaoId = venda.getString('caixa_sessao_id') || ''
        let docNumero = venda.getInt('numero') || 0
        if (docNumero <= 0) {
          let assinanteEmpresaId = ''
          try {
            const empRec = txApp.findRecordById('empresas', empresaId)
            if (empRec) assinanteEmpresaId = empRec.getString('assinante_id')
          } catch (_) {}

          if (assinanteEmpresaId) {
            docNumero = proximoNumero(assinanteEmpresaId, empresaId, 'vendas', txApp)
          } else {
            try {
              const ultimas = txApp.findRecordsByFilter(
                'vendas',
                `empresa_id = '${empresaId}'`,
                '-numero',
                1,
                0,
              )
              const maior = ultimas.length > 0 ? ultimas[0].getInt('numero') || 0 : 0
              docNumero = maior + 1
            } catch (_) {
              docNumero = 1
            }
          }
          venda.set('numero', docNumero)
          txApp.save(venda)
        }
        const valorTotalVenda = venda.getFloat('valor_total') || 0
        const dataVenda = (
          venda.getString('data_emissao') ||
          venda.getString('data_venda') ||
          new Date().toISOString().slice(0, 10)
        ).slice(0, 10)

        // Carregar config_vendas_empresa e empresa
        let cfgVendas = null
        try {
          const cfgs = txApp.findRecordsByFilter(
            'config_vendas_empresa',
            `empresa_id = '${empresaId}' && ativo = true`,
            '',
            1,
            0,
          )
          if (cfgs.length > 0) cfgVendas = cfgs[0]
        } catch (_) {}

        const empresaRec = txApp.findRecordById('empresas', empresaId)
        const empresaPermiteNegativo = empresaRec
          ? empresaRec.getBool('permite_estoque_negativo')
          : false

        // config_vendas_empresa.permitir_estoque_negativo também autoriza vender
        // sem saldo (Reposição do dia / config de vendas da empresa)
        let cfgPermiteNegativo = false
        try {
          if (cfgVendas) cfgPermiteNegativo = cfgVendas.getBool('permitir_estoque_negativo')
        } catch (_) {}

        let permiteVenderSemEstoque = empresaPermiteNegativo || cfgPermiteNegativo
        if (
          cfgVendas &&
          cfgVendas.get('permite_vender_sem_estoque') !== null &&
          cfgVendas.get('permite_vender_sem_estoque') !== undefined &&
          cfgVendas.getString('permite_vender_sem_estoque') !== ''
        ) {
          permiteVenderSemEstoque =
            permiteVenderSemEstoque || cfgVendas.getBool('permite_vender_sem_estoque')
        }

        // Validação: caixa aberto quando for PDV (caixa_sessao_id)
        if (tipoVenda === 'PDV' || tipoVenda === 'pdv') {
          if (!caixaSessaoId) {
            throw new Error('Vendas do tipo PDV exigem sessão de caixa (caixa_sessao_id).')
          }
        }

        // Validação: cliente identificado se valor acima de exige_cliente_identificado_acima_de
        const clienteIdVenda = venda.getString('cliente_id')
        const clientePadraoId = cfgVendas ? cfgVendas.getString('cliente_padrao_id') : ''
        const limiteExigeCliente = cfgVendas
          ? cfgVendas.getFloat('exige_cliente_identificado_acima_de') || 0
          : 0

        if (limiteExigeCliente > 0 && valorTotalVenda > limiteExigeCliente) {
          if (!clienteIdVenda || (clientePadraoId && clienteIdVenda === clientePadraoId)) {
            throw new Error(
              `Vendas acima de R$ ${limiteExigeCliente.toFixed(2)} exigem a identificação de um cliente específico.`,
            )
          }
        }

        // Resolver operador da venda para limites de desconto
        let usuarioOperador = null
        try {
          const userVendaId = venda.getString('usuario_id') || userId
          const uRecs = txApp.findRecordsByFilter(
            'usuarios',
            `auth_user_id = '${userVendaId}' || id = '${userVendaId}'`,
            '',
            1,
            0,
          )
          if (uRecs.length > 0) usuarioOperador = uRecs[0]
        } catch (_) {}

        const limiteOperador = usuarioOperador
          ? usuarioOperador.getFloat('desconto_maximo_percentual') || 0
          : 0

        // 2. Buscar e validar itens da venda
        const itens = txApp.findRecordsByFilter(
          'vendas_itens',
          `venda_id = '${vendaId}' && ativo = true`,
          'item,created',
        )

        if (!itens || itens.length === 0) {
          throw new Error('A venda não possui itens cadastrados.')
        }

        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const lotesCol = txApp.findCollectionByNameOrId('lotes')

        let custoTotalAcumulado = 0

        for (let i = 0; i < itens.length; i++) {
          const item = itens[i]
          const qtd = item.getFloat('quantidade') || 0
          const precoUnitario = item.getFloat('preco_unitario') || 0
          const descontoPct = item.getFloat('desconto_percentual') || 0
          const prodId = item.getString('produto_id')

          if (qtd <= 0) {
            throw new Error(`Item ${i + 1}: quantidade deve ser maior que zero.`)
          }
          if (precoUnitario <= 0) {
            throw new Error(`Item ${i + 1}: preço unitário deve ser maior que zero.`)
          }

          // Carregar produto
          const prod = txApp.findRecordById('produtos', prodId)
          if (!prod) {
            throw new Error(`Item ${i + 1}: produto não encontrado.`)
          }
          const descProd = prod.getString('descricao') || `Produto ${prodId}`
          const permiteDescProd = prod.getBool('permite_desconto')
          const limiteProd = prod.getFloat('desconto_maximo_percentual') || 0
          const controlaEstoque = prod.getBool('controla_estoque')
          const controlaLote = prod.getBool('controla_lote_validade')

          // Validação de desconto do item
          if (descontoPct > 0) {
            if (!permiteDescProd) {
              // Verifica autorização de supervisor em logs_auditoria
              const autLogs = txApp.findRecordsByFilter(
                'logs_auditoria',
                `tabela = 'autorizacoes_desconto' && registro_id = '${prodId}' && empresa_id = '${empresaId}'`,
                '-created',
                1,
                0,
              )
              if (autLogs.length === 0) {
                throw new Error(
                  `Produto "${descProd}" não aceita desconto sem autorização expressa de supervisor.`,
                )
              }
            } else {
              // Menor dos dois limites
              let limitePermitido = Math.min(limiteOperador, limiteProd)
              if (limitePermitido <= 0)
                limitePermitido = limiteProd > 0 ? limiteProd : limiteOperador

              if (limitePermitido > 0 && descontoPct > limitePermitido) {
                // Checa se há autorização de supervisor em logs_auditoria
                const autLogs = txApp.findRecordsByFilter(
                  'logs_auditoria',
                  `tabela = 'autorizacoes_desconto' && registro_id = '${prodId}' && empresa_id = '${empresaId}'`,
                  '-created',
                  1,
                  0,
                )
                if (autLogs.length === 0) {
                  throw new Error(
                    `Desconto de ${descontoPct.toFixed(2)}% no item "${descProd}" excede o limite permitido (${limitePermitido.toFixed(2)}%) e exige autorização de supervisor.`,
                  )
                }
              }
            }
          }

          // Movimentação de estoque se controla_estoque
          let custoMedioAtual = prod.getFloat('preco_custo') || 0
          let saldoAnterior = 0
          let saldoRec = null

          const saldosExistentes = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
            '',
            1,
            0,
          )

          if (saldosExistentes.length > 0) {
            saldoRec = saldosExistentes[0]
            saldoAnterior = saldoRec.getFloat('quantidade') || 0
            custoMedioAtual = saldoRec.getFloat('custo_medio') || custoMedioAtual
          } else if (controlaEstoque) {
            saldoRec = new Record(saldosCol)
            saldoRec.set('empresa_id', empresaId)
            saldoRec.set('produto_id', prodId)
            saldoRec.set('quantidade', 0)
            saldoRec.set('custo_medio', custoMedioAtual)
            saldoRec.set('valor_total', 0)
            saldoRec.set('ativo', true)
            saldoRec.set('created_by', userId)
          }

          if (controlaEstoque) {
            const saldoPosterior = saldoAnterior - qtd
            if (saldoPosterior < 0 && !permiteVenderSemEstoque) {
              throw new Error(
                `Produto "${descProd}": saldo insuficiente (${saldoAnterior.toFixed(4)}) para atender a venda de ${qtd.toFixed(4)}. Empresa bloqueia venda sem estoque.`,
              )
            }

            // Alocação de lotes por FEFO se o produto controla lote
            const alocacoes = []
            if (controlaLote) {
              const itemLoteId = item.getString('lote_id')
              if (itemLoteId) {
                const lRec = txApp.findRecordById('lotes', itemLoteId)
                if (!lRec || !lRec.getBool('ativo')) {
                  throw new Error(
                    `Lote informado para o produto "${descProd}" não encontrado ou inativo.`,
                  )
                }
                const sLote = lRec.getFloat('quantidade') || 0
                if (sLote < qtd && !permiteVenderSemEstoque) {
                  throw new Error(
                    `Lote ${lRec.getString('numero_lote')} tem saldo insuficiente (${sLote.toFixed(4)}) para a quantidade de ${qtd.toFixed(4)}.`,
                  )
                }
                lRec.set('quantidade', sLote - qtd)
                lRec.set('updated_by', userId)
                txApp.save(lRec)
                alocacoes.push({ lote_id: lRec.id, qtd })
              } else {
                // FEFO automático
                const lotesDisponiveis = txApp.findRecordsByFilter(
                  'lotes',
                  `empresa_id = '${empresaId}' && produto_id = '${prodId}' && ativo = true && quantidade > 0`,
                  'data_validade,created',
                )
                if (lotesDisponiveis.length === 0 && !permiteVenderSemEstoque) {
                  throw new Error(
                    `Produto "${descProd}": nenhum lote com saldo disponível para atender a saída.`,
                  )
                }

                let qtdRestante = qtd
                for (let li = 0; li < lotesDisponiveis.length && qtdRestante > 0; li++) {
                  const lRec = lotesDisponiveis[li]
                  const sLote = lRec.getFloat('quantidade') || 0
                  const descLote = Math.min(sLote, qtdRestante)
                  lRec.set('quantidade', sLote - descLote)
                  lRec.set('updated_by', userId)
                  txApp.save(lRec)
                  alocacoes.push({ lote_id: lRec.id, qtd: descLote })
                  qtdRestante -= descLote
                }

                if (qtdRestante > 0.0001 && !permiteVenderSemEstoque) {
                  throw new Error(
                    `Produto "${descProd}": saldo insuficiente nos lotes (${qtd - qtdRestante} atendido de ${qtd}).`,
                  )
                }
              }
            } else {
              alocacoes.push({ lote_id: '', qtd })
            }

            // Atualiza saldo consolidado
            saldoRec.set('quantidade', saldoPosterior)
            saldoRec.set('valor_total', Math.max(0, saldoPosterior * custoMedioAtual))
            saldoRec.set('data_ultima_saida', new Date().toISOString())
            saldoRec.set('updated_by', userId)
            txApp.save(saldoRec)

            // Gravar movimentos Kardex
            let saldoLinha = saldoAnterior
            for (let a = 0; a < alocacoes.length; a++) {
              const aloc = alocacoes[a]
              const saldoPosLinha = saldoLinha - aloc.qtd
              const mov = new Record(movsCol)
              mov.set('empresa_id', empresaId)
              mov.set('produto_id', prodId)
              mov.set('data_movimento', new Date().toISOString())
              mov.set('tipo', 'Saída')
              mov.set('origem', 'VENDA')
              mov.set('quantidade', aloc.qtd)
              mov.set('custo_unitario', custoMedioAtual)
              mov.set('valor_total', aloc.qtd * custoMedioAtual)
              mov.set('saldo_anterior', saldoLinha)
              mov.set('saldo_posterior', saldoPosLinha)
              mov.set('custo_medio_anterior', custoMedioAtual)
              mov.set('custo_medio_posterior', custoMedioAtual)
              if (aloc.lote_id) mov.set('lote_id', aloc.lote_id)
              mov.set('documento_tipo', 'Venda')
              mov.set('documento_id', vendaId)
              mov.set('documento_numero', String(docNumero))
              mov.set('motivo', `Saída por Venda #${docNumero}`)
              mov.set('usuario_id', userId)
              mov.set('estornado', false)
              mov.set('ativo', true)
              mov.set('created_by', userId)
              mov.set('updated_by', userId)
              txApp.save(mov)
              saldoLinha = saldoPosLinha
            }
          }

          // Atualizar custo do item
          const custoTotalItem = qtd * custoMedioAtual
          custoTotalAcumulado += custoTotalItem
          item.set('custo_unitario', custoMedioAtual)
          item.set('custo_total', custoTotalItem)
          item.set('updated_by', userId)
          txApp.save(item)
        }

        // 3. Validar pagamentos e calcular totais
        let somaPagamentos = 0
        let somaDinheiro = 0
        const pagamentosProcessados = []

        for (let p = 0; p < pagamentosInput.length; p++) {
          const pg = pagamentosInput[p]
          const valorPg = Number(pg.valor) || 0
          if (valorPg <= 0) {
            throw new Error(`Pagamento ${p + 1}: valor deve ser maior que zero.`)
          }
          somaPagamentos += valorPg

          const formaId = pg.forma_pagamento_id
          const formaRec = txApp.findRecordById('formas_pagamento', formaId)
          if (!formaRec || !formaRec.getBool('ativo')) {
            throw new Error(`Pagamento ${p + 1}: forma de pagamento não encontrada ou inativa.`)
          }

          const descForma = formaRec.getString('descricao') || ''
          const tipoForma = formaRec.getString('tipo') || ''
          const codTpag = formaRec.getString('codigo_tpag') || ''
          if (
            tipoForma === 'Dinheiro' ||
            descForma.toLowerCase().includes('dinheiro') ||
            codTpag === '01'
          ) {
            somaDinheiro += valorPg
          }

          pagamentosProcessados.push({
            input: pg,
            forma: formaRec,
            valor: valorPg,
          })
        }

        // Conferência da soma de pagamentos vs valor_total da venda
        const diferencaPag = somaPagamentos - valorTotalVenda
        let valorTrocoFinal = 0
        if (diferencaPag < -0.01) {
          throw new Error(
            `Soma dos pagamentos (R$ ${somaPagamentos.toFixed(2)}) é inferior ao total da venda (R$ ${valorTotalVenda.toFixed(2)}).`,
          )
        } else if (diferencaPag > 0.01) {
          if (somaDinheiro < diferencaPag - 0.01) {
            throw new Error(
              `Valor pago excede o total da venda, mas o pagamento em dinheiro (R$ ${somaDinheiro.toFixed(2)}) é insuficiente para cobrir o troco de R$ ${diferencaPag.toFixed(2)}.`,
            )
          }
          valorTrocoFinal = diferencaPag
        }

        // 4. Carregar plano de vendas padrão da config_vendas_empresa ou config_financeira_empresa
        let planoVendasId = cfgVendas ? cfgVendas.getString('plano_vendas_id') : ''
        if (!planoVendasId) {
          try {
            const cfgsFin = txApp.findRecordsByFilter(
              'config_financeira_empresa',
              `empresa_id = '${empresaId}' && ativo = true`,
              '',
              1,
              0,
            )
            if (cfgsFin.length > 0) planoVendasId = cfgsFin[0].getString('plano_vendas_id') || ''
          } catch (_) {}
        }
        if (!planoVendasId) {
          try {
            const pReceita = txApp.findRecordsByFilter(
              'plano_contas',
              `natureza = 'Analítica' && tipo = 'Receita' && ativo = true`,
              'codigo',
              1,
              0,
            )
            if (pReceita.length > 0) planoVendasId = pReceita[0].id
          } catch (_) {}
        }
        if (!planoVendasId) {
          throw new Error('Plano de contas de receita de vendas não configurado.')
        }

        // 5. Processar cada forma de pagamento
        const vendasPagCol = txApp.findCollectionByNameOrId('vendas_pagamentos')
        const contasRecCol = txApp.findCollectionByNameOrId('contas_receber')
        const baixasCol = txApp.findCollectionByNameOrId('pagamentos_baixas')
        const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

        const pagamentosGravados = []
        const titulosGerados = []

        for (let p = 0; p < pagamentosProcessados.length; p++) {
          const itemPg = pagamentosProcessados[p]
          const formaRec = itemPg.forma
          const pgInput = itemPg.input
          const valorBrutoPg = itemPg.valor
          // Se for dinheiro e tiver troco, o valor líquido amortizado pode ser o valor nominal menos o troco
          const valorEfetivoPg =
            formaRec.getString('tipo') === 'Dinheiro' || formaRec.getString('codigo_tpag') === '01'
              ? Math.max(0, valorBrutoPg - valorTrocoFinal)
              : valorBrutoPg

          const tipoForma = formaRec.getString('tipo') || ''
          const codTpag = formaRec.getString('codigo_tpag') || ''
          const descForma = formaRec.getString('descricao') || ''
          const operadoraClienteId = formaRec.getString('operadora_cliente_id') || ''
          const parceladoOperadora = formaRec.getBool('parcelado_pela_operadora')

          const ehCartao =
            tipoForma === 'Cartão de crédito' ||
            tipoForma === 'Cartão de débito' ||
            codTpag === '03' ||
            codTpag === '04'

          // Formas à vista explícitas nunca são tratadas como a prazo, mesmo que
          // a venda tenha condição de pagamento informada.
          const ehDinheiroAvista = tipoForma === 'Dinheiro' || codTpag === '01'
          const descFormaLower = descForma.toLowerCase()

          // Qualquer forma que não seja à vista é tratada como a prazo: boleto,
          // duplicata, crediário, "Boleto bancário", etc. As contas a receber são
          // geradas pela condição de pagamento da venda (branch A abaixo).
          const ehCrediario =
            !ehDinheiroAvista &&
            !ehCartao &&
            (tipoForma === 'Crédito loja' ||
              tipoForma === 'Boleto' ||
              tipoForma === 'Boleto bancário' ||
              tipoForma.includes('Prazo') ||
              codTpag === '05' ||
              codTpag === '15' ||
              descFormaLower.includes('boleto') ||
              descFormaLower.includes('crediário') ||
              descFormaLower.includes('crediario') ||
              Boolean(pgInput.condicao_pagamento_id) ||
              Boolean(venda.getString('condicao_pagamento_id')))

          const ehAVista =
            !ehCrediario &&
            !ehCartao &&
            (ehDinheiroAvista ||
              tipoForma === 'PIX' ||
              tipoForma === 'Transferência bancária' ||
              codTpag === '17' ||
              codTpag === '18' ||
              (tipoForma === 'Cartão de débito' &&
                (formaRec.getInt('dias_para_recebimento') || 0) === 0))

          const vPagRec = new Record(vendasPagCol)
          vPagRec.set('venda_id', vendaId)
          vPagRec.set('forma_pagamento_id', formaRec.id)
          vPagRec.set('valor', valorBrutoPg)
          vPagRec.set('parcelas', pgInput.parcelas || 1)
          vPagRec.set('bandeira', pgInput.bandeira || '')
          vPagRec.set('nsu', pgInput.nsu || '')
          vPagRec.set('codigo_autorizacao', pgInput.codigo_autorizacao || '')
          if (pgInput.conta_financeira_id) {
            vPagRec.set('conta_financeira_id', pgInput.conta_financeira_id)
          }

          // A) CREDIÁRIO / A PRAZO
          if (ehCrediario) {
            // Exige cliente diferente do consumidor final padrão
            if (!clienteIdVenda || (clientePadraoId && clienteIdVenda === clientePadraoId)) {
              throw new Error(
                'Venda a prazo/crediário exige cliente identificado (diferente de Consumidor Final).',
              )
            }

            const clienteRec = txApp.findRecordById('clientes', clienteIdVenda)
            if (!clienteRec || !clienteRec.getBool('ativo')) {
              throw new Error('Cliente da venda a prazo não encontrado ou inativo.')
            }

            // Checagem de crédito do cliente
            const sitCliente = clienteRec.getString('situacao') || 'Ativo'
            const limiteCredito = clienteRec.getFloat('limite_credito') || 0
            const bloquearPrazo = cfgVendas
              ? cfgVendas.getBool('bloquear_venda_prazo_cliente_bloqueado')
              : true

            // Total em aberto e vencidos do cliente
            const titulosAbertos = txApp.findRecordsByFilter(
              'contas_receber',
              `empresa_id = '${empresaId}' && cliente_id = '${clienteIdVenda}' && (status = 'Aberto' || status = 'Parcial') && ativo = true`,
            )
            let totalAberto = 0
            let temVencido = false
            const hojeIso = new Date().toISOString().slice(0, 10)
            for (let t = 0; t < titulosAbertos.length; t++) {
              totalAberto += titulosAbertos[t].getFloat('saldo') || 0
              const vcto = (titulosAbertos[t].getString('data_vencimento') || '').slice(0, 10)
              if (vcto && vcto < hojeIso) temVencido = true
            }

            const credDisponivel =
              limiteCredito > 0 ? Math.max(0, limiteCredito - totalAberto) : 999999999
            const estaBloqueado =
              sitCliente === 'Bloqueado' ||
              temVencido ||
              (limiteCredito > 0 && valorBrutoPg > credDisponivel)

            if (estaBloqueado && bloquearPrazo) {
              throw new Error(
                `Venda a prazo bloqueada para o cliente "${clienteRec.getString('nome')}": ${
                  sitCliente === 'Bloqueado'
                    ? 'cliente cadastrado como Bloqueado'
                    : temVencido
                      ? 'possui títulos vencidos em aberto'
                      : 'limite de crédito insuficiente'
                }.`,
              )
            }

            // Gerar parcelas do crediário
            const condId = pgInput.condicao_pagamento_id || venda.getString('condicao_pagamento_id')
            let parcelasCronograma = []

            function somarDiasIsoVenda(dataIsoStr, numDias) {
              const dt = new Date(dataIsoStr + 'T12:00:00Z')
              dt.setUTCDate(dt.getUTCDate() + (Number(numDias) || 0))
              const y = dt.getUTCFullYear()
              const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
              const d = String(dt.getUTCDate()).padStart(2, '0')
              return y + '-' + m + '-' + d
            }

            if (condId) {
              const condRec = txApp.findRecordById('condicoes_pagamento', condId)
              if (condRec) {
                const qtdP = condRec.getInt('quantidade_parcelas') || 1
                let diasP = [30]
                try {
                  const dpJson = condRec.get('dias_parcelas')
                  if (Array.isArray(dpJson)) {
                    diasP = dpJson
                  } else if (typeof dpJson === 'string') {
                    diasP = JSON.parse(dpJson)
                  }
                } catch (_) {}

                // Garantir array numérico plano com fallback
                if (!Array.isArray(diasP) || diasP.length === 0) {
                  diasP = []
                  for (let i = 0; i < qtdP; i++) diasP.push((i + 1) * 30)
                }

                const valParcBase = Math.round((valorBrutoPg / qtdP) * 100) / 100
                let somaParc = 0
                for (let k = 0; k < qtdP; k++) {
                  const diasAdic =
                    diasP[k] !== undefined && diasP[k] !== null ? Number(diasP[k]) : (k + 1) * 30
                  const vctoIso = somarDiasIsoVenda(dataVenda, diasAdic)
                  const vParc =
                    k === qtdP - 1 ? Math.round((valorBrutoPg - somaParc) * 100) / 100 : valParcBase
                  somaParc += vParc
                  parcelasCronograma.push({
                    numero: k + 1,
                    total: qtdP,
                    data_vencimento: vctoIso,
                    valor: vParc,
                  })
                }
              }
            }

            if (parcelasCronograma.length === 0) {
              const numP = pgInput.parcelas || 1
              const valParcBase = Math.round((valorBrutoPg / numP) * 100) / 100
              let somaParc = 0
              for (let k = 0; k < numP; k++) {
                const diasAdic = (k + 1) * 30
                const vctoIso = somarDiasIsoVenda(dataVenda, diasAdic)
                const vParc =
                  k === numP - 1 ? Math.round((valorBrutoPg - somaParc) * 100) / 100 : valParcBase
                somaParc += vParc
                parcelasCronograma.push({
                  numero: k + 1,
                  total: numP,
                  data_vencimento: vctoIso,
                  valor: vParc,
                })
              }
            }

            const contasReceberIds = []
            for (let pc = 0; pc < parcelasCronograma.length; pc++) {
              const parc = parcelasCronograma[pc]
              const tRec = new Record(contasRecCol)
              tRec.set('empresa_id', empresaId)
              tRec.set('cliente_id', clienteIdVenda)
              tRec.set('numero_documento', `${docNumero}-${parc.numero}`)
              tRec.set('parcela', `${parc.numero}/${parc.total}`)
              tRec.set('parcela_numero', parc.numero)
              tRec.set('total_parcelas', parc.total)
              tRec.set('descricao', `Venda #${docNumero} - Parcela ${parc.numero}/${parc.total}`)
              tRec.set('data_emissao', dataVenda)
              tRec.set('data_competencia', dataVenda)
              tRec.set('data_vencimento', parc.data_vencimento)
              tRec.set('valor_original', parc.valor)
              tRec.set('valor_recebido', 0)
              tRec.set('saldo', parc.valor)
              tRec.set('status', 'Aberto')
              tRec.set('plano_conta_id', planoVendasId)
              tRec.set('forma_pagamento_prevista_id', formaRec.id)
              tRec.set('origem', tipoVenda === 'PDV' ? 'PDV' : 'Venda')
              tRec.set('origem_id', vendaId)
              tRec.set('ativo', true)
              tRec.set('created_by', userId)
              tRec.set('updated_by', userId)
              txApp.save(tRec)
              contasReceberIds.push(tRec.id)
              titulosGerados.push(tRec.id)
            }

            vPagRec.set('conta_receber_ids', JSON.stringify(contasReceberIds))
          }
          // B) À VISTA (Dinheiro, PIX, débito imediato, transferência)
          else if (ehAVista) {
            // Resolver conta financeira com validação clara em português
            let contaFinId =
              pgInput.conta_financeira_id || formaRec.getString('conta_financeira_padrao_id')

            // Se não informada na linha nem na forma, busca conta padrão de recebimentos da empresa
            if (!contaFinId) {
              try {
                const cfsPadrao = txApp.findRecordsByFilter(
                  'contas_financeiras',
                  `empresa_id = '${empresaId}' && conta_padrao_recebimentos = true && ativo = true`,
                  '-saldo_atual',
                  1,
                  0,
                )
                if (cfsPadrao.length > 0) contaFinId = cfsPadrao[0].id
              } catch (_) {}
            }

            // Fallback: qualquer conta financeira ativa da empresa
            if (!contaFinId) {
              try {
                const cfs = txApp.findRecordsByFilter(
                  'contas_financeiras',
                  `empresa_id = '${empresaId}' && ativo = true`,
                  '-saldo_atual',
                  1,
                  0,
                )
                if (cfs.length > 0) contaFinId = cfs[0].id
              } catch (_) {}
            }

            if (!contaFinId) {
              throw new Error(
                'Conta financeira padrão de recebimentos não configurada para esta empresa. Configure em Financeiro > Configuração financeira.',
              )
            }

            const contaRec = txApp.findRecordById('contas_financeiras', contaFinId)
            if (!contaRec || !contaRec.getBool('ativo')) {
              throw new Error(
                'Conta financeira padrão de recebimentos não configurada para esta empresa. Configure em Financeiro > Configuração financeira.',
              )
            }

            // Gerar título de contas a receber já baixado na hora
            const tRec = new Record(contasRecCol)
            tRec.set('empresa_id', empresaId)
            tRec.set('cliente_id', clienteIdVenda || clientePadraoId)
            tRec.set('numero_documento', `${docNumero}-AV`)
            tRec.set('parcela', '1/1')
            tRec.set('parcela_numero', 1)
            tRec.set('total_parcelas', 1)
            tRec.set('descricao', `Venda #${docNumero} - ${descForma} (À vista)`)
            tRec.set('data_emissao', dataVenda)
            tRec.set('data_competencia', dataVenda)
            tRec.set('data_vencimento', dataVenda)
            tRec.set('data_recebimento', dataVenda)
            tRec.set('valor_original', valorEfetivoPg)
            tRec.set('valor_recebido', valorEfetivoPg)
            tRec.set('saldo', 0)
            tRec.set('status', 'Recebido')
            tRec.set('plano_conta_id', planoVendasId)
            tRec.set('forma_pagamento_prevista_id', formaRec.id)
            tRec.set('origem', tipoVenda === 'PDV' ? 'PDV' : 'Venda')
            tRec.set('origem_id', vendaId)
            tRec.set('ativo', true)
            tRec.set('created_by', userId)
            tRec.set('updated_by', userId)
            txApp.save(tRec)
            titulosGerados.push(tRec.id)

            // Criar registro da baixa
            const bRec = new Record(baixasCol)
            bRec.set('empresa_id', empresaId)
            bRec.set('tipo_operacao', 'Receber')
            bRec.set('conta_receber_id', tRec.id)
            bRec.set('conta_financeira_id', contaFinId)
            bRec.set('forma_pagamento_id', formaRec.id)
            bRec.set('data_pagamento', dataVenda)
            bRec.set('valor_pago', valorEfetivoPg)
            bRec.set('valor_multa', 0)
            bRec.set('valor_juros', 0)
            bRec.set('valor_desconto', 0)
            bRec.set('valor_total_pago', valorEfetivoPg)
            bRec.set('observacoes', `Baixa automática na venda #${docNumero} - ${descForma}`)
            bRec.set('estornado', false)
            bRec.set('ativo', true)
            bRec.set('created_by', userId)
            bRec.set('updated_by', userId)
            txApp.save(bRec)

            // Criar movimentação financeira de Entrada
            const movRec = new Record(movsFinCol)
            movRec.set('empresa_id', empresaId)
            movRec.set('conta_financeira_id', contaFinId)
            movRec.set('tipo_movimento', 'Entrada')
            movRec.set('data_movimento', dataVenda)
            movRec.set('data_competencia', dataVenda)
            movRec.set('valor', valorEfetivoPg)
            movRec.set('plano_conta_id', planoVendasId)
            movRec.set('origem', 'RECEBIMENTO_CLIENTE')
            movRec.set('origem_id', bRec.id)
            movRec.set('historico', `Recebimento Venda #${docNumero} - ${descForma}`)
            movRec.set('documento_numero', String(docNumero))
            const sAntConta = contaRec.getFloat('saldo_atual') || 0
            movRec.set('saldo_anterior', sAntConta)
            movRec.set('saldo_posterior', sAntConta + valorEfetivoPg)
            movRec.set('conciliado', false)
            movRec.set('estornado', false)
            movRec.set('ativo', true)
            movRec.set('created_by', userId)
            movRec.set('updated_by', userId)
            txApp.save(movRec)

            // Atualiza saldo da conta financeira
            contaRec.set('saldo_atual', sAntConta + valorEfetivoPg)
            contaRec.set('updated_by', userId)
            txApp.save(contaRec)

            vPagRec.set('conta_receber_ids', JSON.stringify([tRec.id]))
            vPagRec.set('conta_financeira_id', contaFinId)
          }
          // C) CARTÃO COM REPASSE FUTURO
          else if (ehCartao) {
            const numParcelas = pgInput.parcelas || 1

            // Apurar taxa e prazo pela faixa de formas_pagamento_taxas ou pela própria forma
            let taxaPercentual = formaRec.getFloat('taxa_percentual') || 0
            let diasRecebimento =
              formaRec.getInt('dias_para_recebimento') ||
              (tipoForma === 'Cartão de débito' ? 1 : 30)

            try {
              const faixas = txApp.findRecordsByFilter(
                'formas_pagamento_taxas',
                `forma_pagamento_id = '${formaRec.id}' && parcelas_de <= ${numParcelas} && parcelas_ate >= ${numParcelas} && ativo = true`,
                '',
                1,
                0,
              )
              if (faixas.length > 0) {
                taxaPercentual = faixas[0].getFloat('taxa_percentual') || taxaPercentual
                diasRecebimento = faixas[0].getInt('dias_para_recebimento') || diasRecebimento
              }
            } catch (_) {}

            const valorTaxa = Math.round(valorBrutoPg * (taxaPercentual / 100) * 100) / 100
            vPagRec.set('taxa_percentual', taxaPercentual)
            vPagRec.set('valor_taxa', valorTaxa)

            // Sacado: operadora_cliente_id ou fallback para o cliente da venda
            const sacadoClienteId = operadoraClienteId || clienteIdVenda || clientePadraoId

            // Geração de títulos contra a operadora pelo valor bruto
            const contasReceberIds = []

            if (parceladoOperadora || numParcelas <= 1) {
              // Operadora repassa em parcelas mensais ou parcela única
              const valParcBase = Math.round((valorBrutoPg / numParcelas) * 100) / 100
              let somaP = 0
              for (let k = 0; k < numParcelas; k++) {
                const dtBase = new Date(dataVenda)
                const diasAdic = diasRecebimento + k * 30
                dtBase.setDate(dtBase.getDate() + diasAdic)
                const vctoIso = dtBase.toISOString().slice(0, 10)
                const vParc =
                  k === numParcelas - 1
                    ? Math.round((valorBrutoPg - somaP) * 100) / 100
                    : valParcBase
                somaP += vParc

                const tRec = new Record(contasRecCol)
                tRec.set('empresa_id', empresaId)
                tRec.set('cliente_id', sacadoClienteId)
                tRec.set('numero_documento', `${docNumero}-CART-${k + 1}`)
                tRec.set('parcela', `${k + 1}/${numParcelas}`)
                tRec.set('parcela_numero', k + 1)
                tRec.set('total_parcelas', numParcelas)
                tRec.set(
                  'descricao',
                  `Repasse Cartão Venda #${docNumero} - Parc ${k + 1}/${numParcelas} - ${descForma}`,
                )
                tRec.set('data_emissao', dataVenda)
                tRec.set('data_competencia', dataVenda)
                tRec.set('data_vencimento', vctoIso)
                tRec.set('valor_original', vParc)
                tRec.set('valor_recebido', 0)
                tRec.set('saldo', vParc)
                tRec.set('status', 'Aberto')
                tRec.set('plano_conta_id', planoVendasId)
                tRec.set('forma_pagamento_prevista_id', formaRec.id)
                tRec.set('origem', tipoVenda === 'PDV' ? 'PDV' : 'Venda')
                tRec.set('origem_id', vendaId)
                tRec.set('ativo', true)
                tRec.set('created_by', userId)
                tRec.set('updated_by', userId)
                txApp.save(tRec)
                contasReceberIds.push(tRec.id)
                titulosGerados.push(tRec.id)
              }
            } else {
              // Operadora repassa total bruto em parcela única no vencimento de dias_para_recebimento
              const dtBase = new Date(dataVenda)
              dtBase.setDate(dtBase.getDate() + diasRecebimento)
              const vctoIso = dtBase.toISOString().slice(0, 10)

              const tRec = new Record(contasRecCol)
              tRec.set('empresa_id', empresaId)
              tRec.set('cliente_id', sacadoClienteId)
              tRec.set('numero_documento', `${docNumero}-CART`)
              tRec.set('parcela', '1/1')
              tRec.set('parcela_numero', 1)
              tRec.set('total_parcelas', 1)
              tRec.set('descricao', `Repasse Cartão Venda #${docNumero} - ${descForma}`)
              tRec.set('data_emissao', dataVenda)
              tRec.set('data_competencia', dataVenda)
              tRec.set('data_vencimento', vctoIso)
              tRec.set('valor_original', valorBrutoPg)
              tRec.set('valor_recebido', 0)
              tRec.set('saldo', valorBrutoPg)
              tRec.set('status', 'Aberto')
              tRec.set('plano_conta_id', planoVendasId)
              tRec.set('forma_pagamento_prevista_id', formaRec.id)
              tRec.set('origem', tipoVenda === 'PDV' ? 'PDV' : 'Venda')
              tRec.set('origem_id', vendaId)
              tRec.set('ativo', true)
              tRec.set('created_by', userId)
              tRec.set('updated_by', userId)
              txApp.save(tRec)
              contasReceberIds.push(tRec.id)
              titulosGerados.push(tRec.id)
            }

            vPagRec.set('conta_receber_ids', JSON.stringify(contasReceberIds))
          }
          // D) OUTRAS FORMAS
          else {
            const dtBase = new Date(dataVenda)
            dtBase.setDate(dtBase.getDate() + (formaRec.getInt('dias_para_recebimento') || 0))
            const vctoIso = dtBase.toISOString().slice(0, 10)

            const tRec = new Record(contasRecCol)
            tRec.set('empresa_id', empresaId)
            tRec.set('cliente_id', clienteIdVenda || clientePadraoId)
            tRec.set('numero_documento', `${docNumero}-PG`)
            tRec.set('parcela', '1/1')
            tRec.set('parcela_numero', 1)
            tRec.set('total_parcelas', 1)
            tRec.set('descricao', `Venda #${docNumero} - ${descForma}`)
            tRec.set('data_emissao', dataVenda)
            tRec.set('data_competencia', dataVenda)
            tRec.set('data_vencimento', vctoIso)
            tRec.set('valor_original', valorEfetivoPg)
            tRec.set('valor_recebido', 0)
            tRec.set('saldo', valorEfetivoPg)
            tRec.set('status', 'Aberto')
            tRec.set('plano_conta_id', planoVendasId)
            tRec.set('forma_pagamento_prevista_id', formaRec.id)
            tRec.set('origem', tipoVenda === 'PDV' ? 'PDV' : 'Venda')
            tRec.set('origem_id', vendaId)
            tRec.set('ativo', true)
            tRec.set('created_by', userId)
            tRec.set('updated_by', userId)
            txApp.save(tRec)
            titulosGerados.push(tRec.id)

            vPagRec.set('conta_receber_ids', JSON.stringify([tRec.id]))
          }

          vPagRec.set('ativo', true)
          vPagRec.set('created_by', userId)
          vPagRec.set('updated_by', userId)
          txApp.save(vPagRec)
          pagamentosGravados.push(vPagRec.id)
        }

        // 6. Atualizar cabeçalho da venda para Finalizada
        const dataFinalizacao = new Date().toISOString()
        venda.set('status', 'Finalizada')
        venda.set('data_finalizacao', dataFinalizacao)
        venda.set('custo_total', custoTotalAcumulado)
        venda.set('valor_troco', valorTrocoFinal)
        venda.set('updated_by', userId)
        txApp.save(venda)

        // 7. Gravar log em logs_auditoria
        try {
          const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
          const auditRec = new Record(auditCol)
          auditRec.set('empresa_id', empresaId)
          auditRec.set('usuario_id', userId)
          auditRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
          auditRec.set('tabela', 'vendas')
          auditRec.set('registro_id', vendaId)
          auditRec.set('acao', 'alteracao')
          auditRec.set(
            'valores_depois',
            JSON.stringify({
              operacao: 'FINALIZAR_VENDA',
              numero: docNumero,
              tipo: tipoVenda,
              valor_total: valorTotalVenda,
              valor_troco: valorTrocoFinal,
              custo_total: custoTotalAcumulado,
              pagamentos_count: pagamentosGravados.length,
              titulos_gerados: titulosGerados.length,
              data_finalizacao: dataFinalizacao,
            }),
          )
          txApp.save(auditRec)
        } catch (_) {}

        resposta = {
          sucesso: true,
          venda_id: vendaId,
          numero: docNumero,
          status: 'Finalizada',
          valor_total: valorTotalVenda,
          valor_troco: valorTrocoFinal,
          custo_total: custoTotalAcumulado,
          pagamentos: pagamentosGravados,
          titulos_gerados: titulosGerados,
        }
      })

      return c.json(200, resposta)
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[vendas/finalizar] Erro:', msg)
      return c.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/vendas/cancelar',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, {
          sucesso: false,
          message: 'Acesso negado: autenticação obrigatória.',
        })
      }

      // -------------------------------------------------------------
      // Funções locais de tenancy e governança multi-tenant
      // -------------------------------------------------------------
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
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      const userId = authRecord.id
      const data = c.requestInfo().body || {}
      const vendaId = data.venda_id
      const motivo = (data.motivo || '').trim()

      if (!vendaId) {
        return c.json(400, {
          sucesso: false,
          message: 'Campo venda_id é obrigatório.',
        })
      }

      if (!motivo || motivo.length < 5) {
        return c.json(400, {
          sucesso: false,
          message: 'Motivo do cancelamento é obrigatório (mínimo de 5 caracteres).',
        })
      }

      // 1. Checar permissão de exclusão no módulo de vendas
      let isAllowed = false
      try {
        let callerUser = null
        const uRecs = $app.findRecordsByFilter(
          'usuarios',
          `auth_user_id = '${userId}' || id = '${userId}'`,
          '',
          1,
          0,
        )
        if (uRecs.length > 0) callerUser = uRecs[0]

        if (callerUser && callerUser.getBool('ativo')) {
          const perfilRec = $app.findRecordById('perfis_acesso', callerUser.getString('perfil_id'))
          if (perfilRec && perfilRec.getBool('ativo')) {
            if (perfilRec.getBool('administrador')) {
              isAllowed = true
            } else {
              const perms = $app.findRecordsByFilter(
                'permissoes',
                `perfil_id = '${perfilRec.id}' && modulo = 'vendas' && pode_excluir = true && ativo = true`,
                '',
                1,
                0,
              )
              if (perms && perms.length > 0) isAllowed = true
            }
          }
        }
      } catch (_) {}

      if (!isAllowed) {
        return c.json(403, {
          sucesso: false,
          message:
            'Acesso negado: perfil sem permissão para cancelar vendas (módulo vendas, ação excluir).',
        })
      }

      // A relação vendas.usuario_cancelamento_id aponta para a coleção `usuarios`
      // (não para `users`, onde vive o auth do token). Resolver o registro de
      // `usuarios` equivalente ao usuário autenticado; sem registro, grava vazio.
      let usuarioCancelamentoId = ''
      try {
        const uCancel = $app.findRecordsByFilter(
          'usuarios',
          `auth_user_id = '${userId}' || id = '${userId}'`,
          '',
          1,
          0,
        )
        if (uCancel.length > 0) usuarioCancelamentoId = uCancel[0].id
      } catch (_) {}

      let resposta = null

      $app.runInTransaction((txApp) => {
        const venda = txApp.findRecordById('vendas', vendaId)
        if (!venda || !venda.getBool('ativo')) {
          throw new Error('Venda não encontrada ou inativa.')
        }

        const statusAtual = venda.getString('status')
        if (statusAtual === 'Cancelada') {
          throw new Error('Esta venda já está cancelada.')
        }

        // Venda com documento fiscal autorizado não se cancela diretamente: primeiro cancele a nota na SEFAZ
        const docFiscalStatus = venda.getString('documento_fiscal_status') || ''
        if (docFiscalStatus === 'Autorizada') {
          throw new Error(
            'Venda com NFC-e/NF-e Autorizada pela SEFAZ não pode ser cancelada diretamente. Cancele primeiro a nota fiscal na SEFAZ (ou utilize "Cancelar NFC-e e a venda").',
          )
        }

        const empresaId = venda.getString('empresa_id')
        exigirEmpresaDoUsuario(authRecord, empresaId)
        const docNumero = venda.getInt('numero') || venda.id
        const tipoVenda = venda.getString('tipo') || 'Venda'

        // 2. Se a venda já estava Finalizada, verificar se títulos já têm amortização/recebimento posterior
        const titulosVenda = txApp.findRecordsByFilter(
          'contas_receber',
          `empresa_id = '${empresaId}' && origem_id = '${vendaId}' && ativo = true`,
        )

        const pagamentosComBaixaPosterior = []

        for (let t = 0; t < titulosVenda.length; t++) {
          const tit = titulosVenda[t]
          const numDoc = tit.getString('numero_documento') || tit.id
          const valorRec = tit.getFloat('valor_recebido') || 0

          if (valorRec > 0.009) {
            // Checar se as baixas não são a baixa automática à vista da finalização
            const baixas = txApp.findRecordsByFilter(
              'pagamentos_baixas',
              `conta_receber_id = '${tit.id}' && estornado = false && ativo = true`,
            )

            for (let b = 0; b < baixas.length; b++) {
              const bx = baixas[b]
              const obs = bx.getString('observacoes') || ''
              const ehBaixaAutoAVista = obs.includes('Baixa automática na venda')
              if (!ehBaixaAutoAVista) {
                pagamentosComBaixaPosterior.push({
                  titulo_id: tit.id,
                  documento: numDoc,
                  baixa_id: bx.id,
                  valor_pago: bx.getFloat('valor_pago') || 0,
                  data_pagamento: bx.getString('data_pagamento') || '',
                })
              }
            }
          }
        }

        if (pagamentosComBaixaPosterior.length > 0) {
          throw new Error(
            `A venda possui ${pagamentosComBaixaPosterior.length} título(s) com recebimentos posteriores no Contas a Receber. É necessário estornar esses recebimentos antes de cancelar a venda: ${JSON.stringify(
              pagamentosComBaixaPosterior,
            )}`,
          )
        }

        // 3. Estornar as baixas automáticas à vista geradas na finalização
        const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
        const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
        const lotesCol = txApp.findCollectionByNameOrId('lotes')
        const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')

        for (let t = 0; t < titulosVenda.length; t++) {
          const tit = titulosVenda[t]
          const baixas = txApp.findRecordsByFilter(
            'pagamentos_baixas',
            `conta_receber_id = '${tit.id}' && estornado = false && ativo = true`,
          )

          for (let b = 0; b < baixas.length; b++) {
            const bx = baixas[b]
            const contaFinId = bx.getString('conta_financeira_id')
            const valorPago = bx.getFloat('valor_pago') || 0

            // Estorna a baixa
            bx.set('estornado', true)
            bx.set('data_estorno', new Date().toISOString())
            bx.set('motivo_estorno', `Cancelamento da Venda #${docNumero}: ${motivo}`)
            bx.set('estornado_por', userId)
            bx.set('updated_by', userId)
            txApp.save(bx)

            // Reverte saldo da conta financeira através de movimentação de Saída (Estorno)
            if (contaFinId && valorPago > 0) {
              const cRec = txApp.findRecordById('contas_financeiras', contaFinId)
              if (cRec) {
                const sAnt = cRec.getFloat('saldo_atual') || 0
                const sPos = sAnt - valorPago
                cRec.set('saldo_atual', sPos)
                cRec.set('updated_by', userId)
                txApp.save(cRec)

                const movEst = new Record(movsFinCol)
                movEst.set('empresa_id', empresaId)
                movEst.set('conta_financeira_id', contaFinId)
                movEst.set('tipo_movimento', 'Saída')
                movEst.set('data_movimento', new Date().toISOString().slice(0, 10))
                movEst.set('data_competencia', new Date().toISOString().slice(0, 10))
                movEst.set('valor', valorPago)
                movEst.set('plano_conta_id', tit.getString('plano_conta_id') || '')
                movEst.set('origem', 'ESTORNO')
                movEst.set('origem_id', bx.id)
                movEst.set('historico', `Estorno recebimento Venda #${docNumero} (Cancelamento)`)
                movEst.set('documento_numero', String(docNumero))
                movEst.set('saldo_anterior', sAnt)
                movEst.set('saldo_posterior', sPos)
                movEst.set('conciliado', false)
                movEst.set('estornado', false)
                movEst.set('ativo', true)
                movEst.set('created_by', userId)
                movEst.set('updated_by', userId)
                txApp.save(movEst)
              }
            }
          }

          // Cancelar o título de contas a receber
          tit.set('status', 'Cancelado')
          tit.set('saldo', 0)
          tit.set('motivo_cancelamento', motivo)
          tit.set('cancelado_em', new Date().toISOString())
          tit.set('cancelado_por', userId)
          tit.set('updated_by', userId)
          txApp.save(tit)
        }

        // 4. Estornar movimentos de estoque da venda (origem VENDA)
        const movsVenda = txApp.findRecordsByFilter(
          'estoque_movimentos',
          `empresa_id = '${empresaId}' && documento_tipo = 'Venda' && documento_id = '${vendaId}' && estornado = false && ativo = true`,
        )

        for (let m = 0; m < movsVenda.length; m++) {
          const movOrig = movsVenda[m]
          const prodId = movOrig.getString('produto_id')
          const qtd = movOrig.getFloat('quantidade') || 0
          const loteId = movOrig.getString('lote_id') || ''
          const custoUnit = movOrig.getFloat('custo_unitario') || 0

          // Marcar original como estornado
          movOrig.set('estornado', true)
          movOrig.set('updated_by', userId)
          txApp.save(movOrig)

          // Atualizar estoque_saldos (devolver saldo)
          let saldoRec = null
          const saldos = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
            '',
            1,
            0,
          )

          if (saldos.length > 0) {
            saldoRec = saldos[0]
          } else {
            saldoRec = new Record(saldosCol)
            saldoRec.set('empresa_id', empresaId)
            saldoRec.set('produto_id', prodId)
            saldoRec.set('quantidade', 0)
            saldoRec.set('custo_medio', custoUnit)
            saldoRec.set('valor_total', 0)
            saldoRec.set('ativo', true)
            saldoRec.set('created_by', userId)
          }

          const sAnt = saldoRec.getFloat('quantidade') || 0
          const cMedioAnt = saldoRec.getFloat('custo_medio') || custoUnit
          const sPos = sAnt + qtd

          saldoRec.set('quantidade', sPos)
          saldoRec.set('valor_total', Math.max(0, sPos * cMedioAnt))
          saldoRec.set('data_ultima_entrada', new Date().toISOString())
          saldoRec.set('updated_by', userId)
          txApp.save(saldoRec)

          // Devolver saldo ao lote se houver
          if (loteId) {
            try {
              const lRec = txApp.findRecordById('lotes', loteId)
              if (lRec) {
                const sLote = lRec.getFloat('quantidade') || 0
                lRec.set('quantidade', sLote + qtd)
                lRec.set('updated_by', userId)
                txApp.save(lRec)
              }
            } catch (_) {}
          }

          // Gravar movimento de Entrada por Estorno no Kardex
          const movEst = new Record(movsCol)
          movEst.set('empresa_id', empresaId)
          movEst.set('produto_id', prodId)
          movEst.set('data_movimento', new Date().toISOString())
          movEst.set('tipo', 'Entrada')
          movEst.set('origem', 'ESTORNO')
          movEst.set('quantidade', qtd)
          movEst.set('custo_unitario', custoUnit)
          movEst.set('valor_total', qtd * custoUnit)
          movEst.set('saldo_anterior', sAnt)
          movEst.set('saldo_posterior', sPos)
          movEst.set('custo_medio_anterior', cMedioAnt)
          movEst.set('custo_medio_posterior', cMedioAnt)
          if (loteId) movEst.set('lote_id', loteId)
          movEst.set('documento_tipo', 'Venda')
          movEst.set('documento_id', vendaId)
          movEst.set('documento_numero', String(docNumero))
          movEst.set('motivo', `Estorno por cancelamento da venda #${docNumero}: ${motivo}`)
          movEst.set('movimento_estornado_id', movOrig.id)
          movEst.set('usuario_id', userId)
          movEst.set('estornado', false)
          movEst.set('ativo', true)
          movEst.set('created_by', userId)
          movEst.set('updated_by', userId)
          txApp.save(movEst)

          movOrig.set('movimento_estorno_id', movEst.id)
          txApp.save(movOrig)
        }

        // 5. Atualizar venda para Cancelada
        const dataCancelamento = new Date().toISOString()
        venda.set('status', 'Cancelada')
        venda.set('motivo_cancelamento', motivo)
        venda.set('data_cancelamento', dataCancelamento)
        venda.set('usuario_cancelamento_id', usuarioCancelamentoId)
        venda.set('updated_by', userId)
        txApp.save(venda)

        // 6. Gravar em logs_auditoria
        try {
          const auditCol = txApp.findCollectionByNameOrId('logs_auditoria')
          const auditRec = new Record(auditCol)
          auditRec.set('empresa_id', empresaId)
          auditRec.set('usuario_id', userId)
          auditRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
          auditRec.set('tabela', 'vendas')
          auditRec.set('registro_id', vendaId)
          auditRec.set('acao', 'inativacao')
          auditRec.set(
            'valores_depois',
            JSON.stringify({
              operacao: 'CANCELAR_VENDA',
              numero: docNumero,
              tipo: tipoVenda,
              motivo_cancelamento: motivo,
              titulos_cancelados: titulosVenda.length,
              movimentos_estornados: movsVenda.length,
              data_cancelamento: dataCancelamento,
            }),
          )
          txApp.save(auditRec)
        } catch (_) {}

        resposta = {
          sucesso: true,
          venda_id: vendaId,
          numero: docNumero,
          status: 'Cancelada',
          motivo_cancelamento: motivo,
          titulos_cancelados: titulosVenda.length,
          movimentos_estornados: movsVenda.length,
        }
      })

      return c.json(200, resposta)
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[vendas/cancelar] Erro:', msg)
      return c.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/vendas/converter-orcamento',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, {
          sucesso: false,
          message: 'Acesso negado: autenticação obrigatória.',
        })
      }

      // -------------------------------------------------------------
      // Funções locais de tenancy e governança multi-tenant
      // (definidas localmente sem require no callback)
      // -------------------------------------------------------------
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
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      const userId = authRecord.id
      const data = c.requestInfo().body || {}
      const vendaId = data.venda_id

      if (!vendaId) {
        return c.json(400, {
          sucesso: false,
          message: 'Campo venda_id é obrigatório.',
        })
      }

      let vendaRec = null
      try {
        vendaRec = $app.findRecordById('vendas', vendaId)
      } catch (_) {
        return c.json(404, {
          sucesso: false,
          message: 'Orçamento não encontrado.',
        })
      }

      if (!vendaRec || !vendaRec.getBool('ativo')) {
        return c.json(404, {
          sucesso: false,
          message: 'Orçamento não encontrado ou inativo.',
        })
      }

      const empresaId = vendaRec.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)

      const tipoAtual = vendaRec.getString('tipo')
      const statusAtual = vendaRec.getString('status')

      if (statusAtual === 'Cancelada') {
        return c.json(400, {
          sucesso: false,
          message: 'Orçamentos cancelados não podem ser convertidos em Pedido.',
        })
      }

      if (tipoAtual !== 'Orçamento') {
        return c.json(400, {
          sucesso: false,
          message: `Apenas vendas do tipo "Orçamento" podem ser convertidas (tipo atual: "${tipoAtual}", status: "${statusAtual}").`,
        })
      }

      if (statusAtual === 'Finalizada') {
        return c.json(400, {
          sucesso: false,
          message: 'Vendas finalizadas não podem ser convertidas em Pedido.',
        })
      }

      vendaRec.set('tipo', 'Pedido')
      vendaRec.set('status', 'Pedido em aberto')
      vendaRec.set('updated_by', userId)
      $app.save(vendaRec)

      // Gravar log de auditoria
      try {
        const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresaId)
        auditRec.set('usuario_id', userId)
        auditRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
        auditRec.set('tabela', 'vendas')
        auditRec.set('registro_id', vendaId)
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'CONVERTER_ORCAMENTO_EM_PEDIDO',
            numero: vendaRec.getInt('numero'),
            tipo_anterior: tipoAtual,
            status_anterior: statusAtual,
            tipo_novo: 'Pedido',
            status_novo: 'Pedido em aberto',
          }),
        )
        $app.save(auditRec)
      } catch (errAudit) {
        console.warn(
          '[vendas/converter-orcamento] Aviso ao gravar auditoria:',
          errAudit && errAudit.message,
        )
      }

      console.log(
        `[vendas/converter-orcamento] Orçamento #${vendaRec.getInt('numero')} (${vendaId}) convertido em Pedido com sucesso pelo usuário ${userId}.`,
      )

      return c.json(200, {
        sucesso: true,
        message: `Orçamento #${vendaRec.getInt('numero')} convertido em Pedido com sucesso.`,
        venda_id: vendaId,
        numero: vendaRec.getInt('numero'),
        tipo: 'Pedido',
        status: 'Pedido em aberto',
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[vendas/converter-orcamento] Erro:', msg)
      return c.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/vendas/salvar-pedido',
  (c) => {
    try {
      const authRecord = c.auth || c.get('authRecord')
      if (!authRecord) {
        return c.json(401, {
          sucesso: false,
          message: 'Acesso negado: autenticação obrigatória.',
        })
      }

      // -------------------------------------------------------------
      // Funções locais de tenancy e governança multi-tenant
      // (definidas localmente sem require no callback)
      // -------------------------------------------------------------
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
          throw new ForbiddenError(
            'Acesso negado à empresa especificada para este usuário/assinante.',
          )
        }
        return encontrada
      }

      const userId = authRecord.id
      const data = c.requestInfo().body || {}
      const vendaId = data.venda_id || data.id

      if (!vendaId) {
        return c.json(400, {
          sucesso: false,
          message: 'Campo venda_id é obrigatório.',
        })
      }

      let vendaRec = null
      try {
        vendaRec = $app.findRecordById('vendas', vendaId)
      } catch (_) {
        return c.json(404, {
          sucesso: false,
          message: 'Pedido não encontrado.',
        })
      }

      if (!vendaRec || !vendaRec.getBool('ativo')) {
        return c.json(404, {
          sucesso: false,
          message: 'Pedido não encontrado ou inativo.',
        })
      }

      const empresaId = vendaRec.getString('empresa_id')
      exigirEmpresaDoUsuario(authRecord, empresaId)

      const tipoAtual = vendaRec.getString('tipo')
      const statusAtual = vendaRec.getString('status')

      if (tipoAtual !== 'Pedido') {
        return c.json(400, {
          sucesso: false,
          message: `Apenas vendas do tipo "Pedido" podem ser salvas por esta rota (tipo atual: "${tipoAtual}").`,
        })
      }

      if (statusAtual === 'Finalizada') {
        return c.json(400, {
          sucesso: false,
          message: 'Pedidos finalizados não podem ser alterados.',
        })
      }

      if (statusAtual === 'Cancelada') {
        return c.json(400, {
          sucesso: false,
          message: 'Pedidos cancelados não podem ser alterados.',
        })
      }

      // Validar cliente obrigatório se enviado
      if (data.cliente_id !== undefined && !data.cliente_id) {
        return c.json(400, {
          sucesso: false,
          message: 'Cliente é obrigatório para salvar o pedido.',
        })
      }

      // Validação de assinante do cliente caso cliente_id seja atualizado
      if (data.cliente_id) {
        try {
          const emp = $app.findRecordById('empresas', empresaId)
          const assinanteEmpresaId = emp ? emp.getString('assinante_id') : ''
          if (assinanteEmpresaId) {
            const cli = $app.findRecordById('clientes', data.cliente_id)
            if (
              cli &&
              cli.getString('assinante_id') &&
              cli.getString('assinante_id') !== assinanteEmpresaId
            ) {
              return c.json(400, {
                sucesso: false,
                message: 'O cliente selecionado pertence a outro assinante.',
              })
            }
          }
        } catch (_) {}
      }

      // Validação de assinante da condição de pagamento caso enviada
      if (data.condicao_pagamento_id) {
        try {
          const emp = $app.findRecordById('empresas', empresaId)
          const assinanteEmpresaId = emp ? emp.getString('assinante_id') : ''
          if (assinanteEmpresaId) {
            const cp = $app.findRecordById('condicoes_pagamento', data.condicao_pagamento_id)
            if (
              cp &&
              cp.getString('assinante_id') &&
              cp.getString('assinante_id') !== assinanteEmpresaId
            ) {
              return c.json(400, {
                sucesso: false,
                message: 'A condição de pagamento selecionada pertence a outro assinante.',
              })
            }
          }
        } catch (_) {}
      }

      // Atualizar campos editáveis (NÃO permite alterar tipo, empresa nem status)
      if (data.cliente_id !== undefined) {
        vendaRec.set('cliente_id', data.cliente_id)
      }
      if (data.cpf_cnpj_consumidor !== undefined) {
        vendaRec.set('cpf_cnpj_consumidor', data.cpf_cnpj_consumidor || '')
      }
      if (data.vendedor_id !== undefined) {
        vendaRec.set('vendedor_id', data.vendedor_id || '')
      }
      if (data.operador_id !== undefined) {
        vendaRec.set('operador_id', data.operador_id || userId)
      }
      if (data.data_emissao !== undefined) {
        vendaRec.set('data_emissao', data.data_emissao || '')
      }
      if (data.data_validade !== undefined) {
        vendaRec.set('data_validade', data.data_validade || '')
      }
      if (data.valor_produtos !== undefined) {
        vendaRec.set('valor_produtos', Number(data.valor_produtos) || 0)
      }
      if (data.valor_desconto_itens !== undefined) {
        vendaRec.set('valor_desconto_itens', Number(data.valor_desconto_itens) || 0)
      }
      if (data.valor_desconto_total !== undefined) {
        vendaRec.set('valor_desconto_total', Number(data.valor_desconto_total) || 0)
      }
      if (data.valor_acrescimo !== undefined) {
        vendaRec.set('valor_acrescimo', Number(data.valor_acrescimo) || 0)
      }
      if (data.valor_frete !== undefined) {
        vendaRec.set('valor_frete', Number(data.valor_frete) || 0)
      }
      if (data.valor_total !== undefined) {
        vendaRec.set('valor_total', Number(data.valor_total) || 0)
      }
      if (data.condicao_pagamento_id !== undefined) {
        vendaRec.set('condicao_pagamento_id', data.condicao_pagamento_id || '')
      }
      if (data.observacao !== undefined) {
        vendaRec.set('observacao', data.observacao || '')
      }
      if (data.observacao_cliente !== undefined) {
        vendaRec.set('observacao_cliente', data.observacao_cliente || '')
      }
      if (data.venda_origem_id !== undefined) {
        vendaRec.set('venda_origem_id', data.venda_origem_id || '')
      }

      vendaRec.set('updated_by', userId)
      $app.save(vendaRec)

      // Gravar log de auditoria
      try {
        const auditCol = $app.findCollectionByNameOrId('logs_auditoria')
        const auditRec = new Record(auditCol)
        auditRec.set('empresa_id', empresaId)
        auditRec.set('usuario_id', userId)
        auditRec.set('usuario_nome', authRecord.getString('name') || 'Operador')
        auditRec.set('tabela', 'vendas')
        auditRec.set('registro_id', vendaId)
        auditRec.set('acao', 'alteracao')
        auditRec.set(
          'valores_depois',
          JSON.stringify({
            operacao: 'SALVAR_PEDIDO',
            numero: vendaRec.getInt('numero'),
            tipo: tipoAtual,
            status: statusAtual,
            cliente_id: vendaRec.getString('cliente_id'),
            valor_total: vendaRec.getFloat('valor_total'),
          }),
        )
        $app.save(auditRec)
      } catch (errAudit) {
        console.warn(
          '[vendas/salvar-pedido] Aviso ao gravar auditoria:',
          errAudit && errAudit.message,
        )
      }

      const numVenda = vendaRec.getInt('numero')
      console.log(
        `[vendas/salvar-pedido] Pedido #${numVenda} (${vendaId}) atualizado com sucesso pelo usuário ${userId}.`,
      )

      return c.json(200, {
        sucesso: true,
        id: vendaId,
        numero: numVenda,
        message: `Pedido #${numVenda} salvo com sucesso.`,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[vendas/salvar-pedido] Erro:', msg)
      return c.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)
