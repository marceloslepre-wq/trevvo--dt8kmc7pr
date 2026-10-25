// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Hook transacional central de Vendas:
 * POST /backend/v1/vendas/finalizar
 * POST /backend/v1/vendas/cancelar
 *
 * Garante atomicidade: estoque, financeiro, crediário, cartões e auditoria.
 * O navegador NÃO grava diretamente em vendas_pagamentos ou no estoque.
 */

routerAdd(
  'POST',
  '/backend/v1/vendas/finalizar',
  (c) => {
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, {
        sucesso: false,
        message: 'Acesso negado: autenticação obrigatória.',
      })
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

    try {
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
        const docNumero = venda.getInt('numero') || venda.id
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

        let permiteVenderSemEstoque = empresaPermiteNegativo
        if (
          cfgVendas &&
          cfgVendas.get('permite_vender_sem_estoque') !== null &&
          cfgVendas.get('permite_vender_sem_estoque') !== undefined &&
          cfgVendas.getString('permite_vender_sem_estoque') !== ''
        ) {
          permiteVenderSemEstoque = cfgVendas.getBool('permite_vender_sem_estoque')
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
          'sequencial,created',
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

          const ehCrediario =
            tipoForma === 'Crédito loja' ||
            tipoForma === 'Boleto' ||
            codTpag === '05' ||
            codTpag === '15' ||
            Boolean(pgInput.condicao_pagamento_id) ||
            Boolean(
              venda.getString('condicao_pagamento_id') &&
              (tipoForma.includes('Prazo') || descForma.toLowerCase().includes('crediário')),
            )

          const ehCartao =
            tipoForma === 'Cartão de crédito' ||
            tipoForma === 'Cartão de débito' ||
            codTpag === '03' ||
            codTpag === '04'

          const ehAVista =
            !ehCrediario &&
            (tipoForma === 'Dinheiro' ||
              tipoForma === 'PIX' ||
              tipoForma === 'Transferência bancária' ||
              codTpag === '01' ||
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

            if (condId) {
              const condRec = txApp.findRecordById('condicoes_pagamento', condId)
              if (condRec) {
                const qtdP = condRec.getInt('quantidade_parcelas') || 1
                let diasP = [30]
                try {
                  const dpJson = condRec.get('dias_parcelas')
                  if (Array.isArray(dpJson)) diasP = dpJson
                  else if (typeof dpJson === 'string') diasP = JSON.parse(dpJson)
                } catch (_) {}

                const valParcBase = Math.round((valorBrutoPg / qtdP) * 100) / 100
                let somaParc = 0
                for (let k = 0; k < qtdP; k++) {
                  const diasAdic = diasP[k] !== undefined ? diasP[k] : (k + 1) * 30
                  const dtBase = new Date(dataVenda)
                  dtBase.setDate(dtBase.getDate() + diasAdic)
                  const vctoIso = dtBase.toISOString().slice(0, 10)
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
                const dtBase = new Date(dataVenda)
                dtBase.setDate(dtBase.getDate() + (k + 1) * 30)
                const vctoIso = dtBase.toISOString().slice(0, 10)
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
            // Resolver conta financeira
            let contaFinId =
              pgInput.conta_financeira_id || formaRec.getString('conta_financeira_padrao_id')
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
              throw new Error('Conta financeira para recebimento à vista não encontrada.')
            }

            const contaRec = txApp.findRecordById('contas_financeiras', contaFinId)
            if (!contaRec || !contaRec.getBool('ativo')) {
              throw new Error('Conta financeira de destino inválida ou inativa.')
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
    const authRecord = c.auth || c.get('authRecord')
    if (!authRecord) {
      return c.json(401, {
        sucesso: false,
        message: 'Acesso negado: autenticação obrigatória.',
      })
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

    let resposta = null

    try {
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
        venda.set('usuario_cancelamento_id', userId)
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
      return c.json(400, {
        sucesso: false,
        message: msg,
      })
    }
  },
  $apis.requireAuth(),
)
