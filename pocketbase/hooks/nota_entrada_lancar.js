/**
 * Hook de lançamento transacional de nota de entrada
 * Endpoint: POST /notas-entrada/lancar
 */

routerAdd('POST', '/notas-entrada/lancar', (c) => {
  const authRecord = c.auth || c.get('authRecord')
  if (!authRecord) {
    return c.json(401, { sucesso: false, message: 'Usuário não autenticado.' })
  }

  let body = {}
  try {
    body = c.requestInfo().body || {}
  } catch (err) {
    return c.json(400, { sucesso: false, message: 'Corpo da requisição inválido.' })
  }

  const notaId = body.nota_id
  const atualizarCustoProdutos = body.atualizar_custo_produtos !== false // padrão true
  const justificativaDivergencia = body.justificativa_divergencia || ''
  const usuarioErpId = body.usuario_erp_id || ''

  if (!notaId) {
    return c.json(400, { sucesso: false, message: 'nota_id é obrigatório.' })
  }

  const userId = authRecord.id
  let produtosParaRevisao = []

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

      if (nota.getString('status') === 'Lançada') {
        throw new Error('Esta nota de entrada já foi lançada anteriormente.')
      }
      if (nota.getString('status') === 'Cancelada') {
        throw new Error('Esta nota de entrada está cancelada e não pode ser lançada.')
      }

      const empresaId = nota.getString('empresa_id')
      const fornecedorId = nota.getString('fornecedor_id')
      if (!fornecedorId) {
        throw new Error('Fornecedor não informado ou não cadastrado.')
      }

      let fornecedorNome = 'Fornecedor'
      try {
        const fornRec = txApp.findRecordById('fornecedores', fornecedorId)
        if (fornRec) {
          fornecedorNome =
            fornRec.getString('nome_fantasia') || fornRec.getString('razao_social') || 'Fornecedor'
        }
      } catch (_) {}

      const dataEmissao = nota.getString('data_emissao') || ''
      const dataEntrada = nota.getString('data_entrada') || ''
      if (dataEmissao && dataEntrada && dataEntrada < dataEmissao) {
        throw new Error('A data de entrada não pode ser anterior à data de emissão.')
      }

      const tipoEntrada = nota.getString('tipo_entrada') || 'Compra para revenda'
      const valorTotalNota = nota.getFloat('valor_total') || 0

      // 2. Carregar itens ativos
      const itens = txApp.findRecordsByFilter(
        'notas_entrada_itens',
        `nota_id = '${notaId}' && ativo = true`,
        'numero_item',
      )

      if (itens.length === 0) {
        throw new Error('A nota não possui itens.')
      }

      let somaItens = 0
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i]
        const numItem = item.getInt('numero_item')
        const prodId = item.getString('produto_id')
        if (!prodId) {
          throw new Error(`Item #${numItem} não possui produto vinculado no catálogo.`)
        }
        const fator = item.getFloat('fator_conversao')
        if (!fator || fator <= 0) {
          throw new Error(`Item #${numItem} possui fator de conversão inválido ou não informado.`)
        }
        const cfopEntrada = item.getString('cfop_entrada')
        if (!cfopEntrada) {
          throw new Error(`Item #${numItem} não possui CFOP de entrada definido.`)
        }

        const prod = txApp.findRecordById('produtos', prodId)
        if (!prod) {
          throw new Error(`Produto do item #${numItem} não encontrado.`)
        }

        // Validação de lote e validade se o produto controla lote
        if (prod.getBool('controla_lote_validade')) {
          const numLote = item.getString('lote_numero')
          const valLote = item.getString('lote_validade')
          if (!numLote || !valLote) {
            throw new Error(
              `Item #${numItem} ("${prod.getString('descricao')}") exige controle de lote e validade. Preencha lote e data de validade.`,
            )
          }
        }

        somaItens += item.getFloat('valor_produto') || 0
      }

      // Validação de divergência de soma dos itens vs total da nota
      // Se a diferença for > R$ 0,05, exige justificativa
      const difItens = Math.abs(somaItens - valorTotalNota)
      if (difItens > 0.05 && !justificativaDivergencia.trim()) {
        throw new Error(
          `Diferença de R$ ${difItens.toFixed(2)} entre soma dos itens (R$ ${somaItens.toFixed(2)}) e total da nota (R$ ${valorTotalNota.toFixed(2)}) requer justificativa.`,
        )
      }

      // Validação de parcelas
      if (tipoEntrada !== 'Bonificação') {
        const parcelas = txApp.findRecordsByFilter(
          'notas_entrada_parcelas',
          `nota_id = '${notaId}' && ativo = true`,
        )
        if (parcelas.length > 0) {
          let somaParcelas = 0
          for (let p = 0; p < parcelas.length; p++) {
            somaParcelas += parcelas[p].getFloat('valor') || 0
          }
          const difParcelas = Math.abs(somaParcelas - valorTotalNota)
          if (difParcelas > 0.05) {
            throw new Error(
              `Soma das parcelas (R$ ${somaParcelas.toFixed(2)}) difere do total da nota (R$ ${valorTotalNota.toFixed(2)}) em mais de R$ 0,05.`,
            )
          }
        }
      }

      // Determinar origem do movimento de estoque
      let origemEstoque = 'COMPRA'
      if (tipoEntrada === 'Bonificação') {
        origemEstoque = 'BONIFICACAO_ENTRADA'
      } else if (tipoEntrada === 'Devolução de venda') {
        origemEstoque = 'DEVOLUCAO_VENDA'
      }

      const docNumero = `${nota.getString('modelo')}/${nota.getString('serie')}/${nota.getInt('numero')}`
      const movsCol = txApp.findCollectionByNameOrId('estoque_movimentos')
      const saldosCol = txApp.findCollectionByNameOrId('estoque_saldos')
      const lotesCol = txApp.findCollectionByNameOrId('lotes')
      const prodFornCol = txApp.findCollectionByNameOrId('produtos_fornecedores')

      // 3. Processar itens: Estoque, Produtos, Produtos_Fornecedores
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i]
        const prodId = item.getString('produto_id')
        const prod = txApp.findRecordById('produtos', prodId)
        const cfopEntradaCodigo = item.getString('cfop_entrada')

        // Checar movimenta_estoque no CFOP de entrada
        let movimentaEstoqueCfop = false
        try {
          const cfopRecs = txApp.findRecordsByFilter(
            'cfop',
            `codigo = '${cfopEntradaCodigo}' && ativo = true`,
            '',
            1,
            0,
          )
          if (cfopRecs.length > 0) {
            movimentaEstoqueCfop = cfopRecs[0].getBool('movimenta_estoque')
          }
        } catch (_) {}

        const controlaEstoqueProd = prod.getBool('controla_estoque')
        const qtdEstoque = item.getFloat('quantidade_estoque') || 0
        const custoUnitarioEstoque = item.getFloat('custo_unitario_estoque') || 0

        // Se movimenta estoque
        if (controlaEstoqueProd && movimentaEstoqueCfop && qtdEstoque > 0) {
          let loteIdParaMov = ''

          // Gerenciar lote se controla lote
          if (prod.getBool('controla_lote_validade')) {
            const numLote = (item.getString('lote_numero') || '').trim()
            const fabLote = item.getString('lote_fabricacao') || ''
            const valLote = item.getString('lote_validade') || ''

            const lotesExistentes = txApp.findRecordsByFilter(
              'lotes',
              `empresa_id = '${empresaId}' && produto_id = '${prodId}' && numero_lote = '${numLote}'`,
              '',
              1,
              0,
            )

            let loteRec = null
            if (lotesExistentes.length > 0) {
              loteRec = lotesExistentes[0]
            } else {
              loteRec = new Record(lotesCol)
              loteRec.set('empresa_id', empresaId)
              loteRec.set('produto_id', prodId)
              loteRec.set('numero_lote', numLote)
              if (fabLote) loteRec.set('data_fabricacao', fabLote)
              loteRec.set('data_validade', valLote)
              loteRec.set('quantidade', 0)
              loteRec.set('observacao', `NF Entrada nº ${docNumero}`)
              loteRec.set('ativo', true)
              loteRec.set('created_by', userId)
              loteRec.set('updated_by', userId)
              txApp.save(loteRec)
            }

            const saldoLoteAnt = loteRec.getFloat('quantidade') || 0
            loteRec.set('quantidade', saldoLoteAnt + qtdEstoque)
            loteRec.set('updated_by', userId)
            txApp.save(loteRec)

            loteIdParaMov = loteRec.id
          }

          // Atualizar estoque_saldos
          const saldosExistentes = txApp.findRecordsByFilter(
            'estoque_saldos',
            `empresa_id = '${empresaId}' && produto_id = '${prodId}'`,
            '',
            1,
            0,
          )

          let saldoRec = null
          if (saldosExistentes.length > 0) {
            saldoRec = saldosExistentes[0]
          } else {
            saldoRec = new Record(saldosCol)
            saldoRec.set('empresa_id', empresaId)
            saldoRec.set('produto_id', prodId)
            saldoRec.set('quantidade', 0)
            saldoRec.set('custo_medio', prod.getFloat('preco_custo') || custoUnitarioEstoque)
            saldoRec.set('valor_total', 0)
            saldoRec.set('ativo', true)
            saldoRec.set('created_by', userId)
          }

          const saldoAnterior = saldoRec.getFloat('quantidade') || 0
          const custoMedioAnterior =
            saldoRec.getFloat('custo_medio') || prod.getFloat('preco_custo') || custoUnitarioEstoque
          const saldoPosterior = saldoAnterior + qtdEstoque

          let novoCustoMedio = custoMedioAnterior
          if (saldoAnterior <= 0) {
            novoCustoMedio = custoUnitarioEstoque
          } else {
            const valAnt = saldoAnterior * custoMedioAnterior
            const valEnt = qtdEstoque * custoUnitarioEstoque
            novoCustoMedio = (valAnt + valEnt) / saldoPosterior
          }

          saldoRec.set('quantidade', saldoPosterior)
          saldoRec.set('custo_medio', novoCustoMedio)
          saldoRec.set('valor_total', Math.max(0, saldoPosterior * novoCustoMedio))
          saldoRec.set('data_ultima_entrada', dataEntrada || new Date().toISOString().slice(0, 10))
          saldoRec.set('updated_by', userId)
          txApp.save(saldoRec)

          // Gravar movimento de estoque
          const movRec = new Record(movsCol)
          movRec.set('empresa_id', empresaId)
          movRec.set('produto_id', prodId)
          movRec.set('data_movimento', dataEntrada || new Date().toISOString())
          movRec.set('tipo', 'Entrada')
          movRec.set('origem', origemEstoque)
          movRec.set('quantidade', qtdEstoque)
          movRec.set('custo_unitario', custoUnitarioEstoque)
          movRec.set('valor_total', qtdEstoque * custoUnitarioEstoque)
          movRec.set('saldo_anterior', saldoAnterior)
          movRec.set('saldo_posterior', saldoPosterior)
          movRec.set('custo_medio_anterior', custoMedioAnterior)
          movRec.set('custo_medio_posterior', novoCustoMedio)
          movRec.set('lote_id', loteIdParaMov)
          movRec.set('documento_tipo', 'NF Entrada')
          movRec.set('documento_id', notaId)
          movRec.set('documento_numero', docNumero)
          movRec.set('motivo', justificativaDivergencia || `Lançamento NF Entrada ${docNumero}`)
          movRec.set('observacao', nota.getString('natureza_operacao') || '')
          movRec.set('usuario_id', userId)
          movRec.set('estornado', false)
          movRec.set('ativo', true)
          movRec.set('created_by', userId)
          movRec.set('updated_by', userId)
          txApp.save(movRec)
        }

        // 4. Atualizar produtos_fornecedores
        const codForn = item.getString('codigo_fornecedor') || ''
        const descForn = item.getString('descricao_fornecedor') || ''
        const unForn = item.getString('unidade_fornecedor') || 'UN'
        const fatorConv = item.getFloat('fator_conversao') || 1
        const vUnForn = item.getFloat('valor_unitario_fornecedor') || 0

        const pfExistentes = txApp.findRecordsByFilter(
          'produtos_fornecedores',
          `produto_id = '${prodId}' && fornecedor_id = '${fornecedorId}'`,
          '',
          1,
          0,
        )

        if (pfExistentes.length > 0) {
          const pf = pfExistentes[0]
          pf.set('ultimo_preco_compra', vUnForn)
          pf.set('data_ultima_compra', dataEntrada || dataEmissao)
          pf.set('fator_conversao', fatorConv)
          if (codForn) pf.set('codigo_no_fornecedor', codForn)
          if (descForn) pf.set('descricao_no_fornecedor', descForn)
          if (unForn) pf.set('unidade_fornecedor', unForn)
          pf.set('updated_by', userId)
          txApp.save(pf)
        } else {
          const pf = new Record(prodFornCol)
          pf.set('produto_id', prodId)
          pf.set('fornecedor_id', fornecedorId)
          pf.set('codigo_no_fornecedor', codForn)
          pf.set('descricao_no_fornecedor', descForn)
          pf.set('unidade_fornecedor', unForn)
          pf.set('fator_conversao', fatorConv)
          pf.set('ultimo_preco_compra', vUnForn)
          pf.set('data_ultima_compra', dataEntrada || dataEmissao)
          pf.set('ativo', true)
          pf.set('created_by', userId)
          pf.set('updated_by', userId)
          txApp.save(pf)
        }

        // 5. Atualizar custo do produto se checkbox marcada
        let precoCustoNovo = prod.getFloat('preco_custo') || 0
        let custoFinalNovo = prod.getFloat('custo_final') || 0
        let margemNova = prod.getFloat('margem_percentual') || 0
        const precoVendaAtual = prod.getFloat('preco_venda') || 0

        if (atualizarCustoProdutos && custoUnitarioEstoque > 0) {
          precoCustoNovo = custoUnitarioEstoque
          const despesasPct = prod.getFloat('outras_despesas_percentual') || 0
          custoFinalNovo = precoCustoNovo * (1 + despesasPct / 100)

          if (custoFinalNovo > 0 && precoVendaAtual > 0) {
            margemNova = ((precoVendaAtual - custoFinalNovo) / custoFinalNovo) * 100
          }

          prod.set('preco_custo', precoCustoNovo)
          prod.set('custo_final', custoFinalNovo)
          prod.set('margem_percentual', margemNova)
          prod.set('updated_by', userId)
          txApp.save(prod)
        }

        // Avaliar se o produto deve ir para a lista de revisão de preços
        let margemPadrao = 0
        const catId = prod.getString('categoria_id')
        const grpId = prod.getString('grupo_id')

        if (catId) {
          try {
            const cat = txApp.findRecordById('categorias', catId)
            if (cat) margemPadrao = cat.getFloat('margem_padrao_percentual') || 0
          } catch (_) {}
        }
        if (!margemPadrao && grpId) {
          try {
            const grp = txApp.findRecordById('grupos', grpId)
            if (grp) margemPadrao = grp.getFloat('margem_padrao_percentual') || 0
          } catch (_) {}
        }

        // Sugestão de preço de venda com base na margem padrão
        const precoSugerido =
          margemPadrao > 0 ? custoFinalNovo * (1 + margemPadrao / 100) : precoVendaAtual

        if (margemPadrao > 0 && margemNova < margemPadrao) {
          produtosParaRevisao.push({
            produto_id: prodId,
            codigo: prod.getInt('codigo'),
            descricao: prod.getString('descricao'),
            custo_novo: custoFinalNovo || precoCustoNovo,
            preco_atual: precoVendaAtual,
            margem_atual: margemNova,
            margem_padrao: margemPadrao,
            preco_sugerido: precoSugerido,
          })
        }
      }

      // 6. Atualizar Pedido de Compra se vinculado
      const pedidoCompraId = nota.getString('pedido_compra_id')
      if (pedidoCompraId) {
        try {
          const pedido = txApp.findRecordById('pedidos_compra', pedidoCompraId)
          if (pedido) {
            const itensPedido = txApp.findRecordsByFilter(
              'pedidos_compra_itens',
              `pedido_id = '${pedidoCompraId}' && ativo = true`,
            )

            let todosAtendidos = true
            let algumAtendido = false

            for (let ip = 0; ip < itensPedido.length; ip++) {
              const itPed = itensPedido[ip]
              const prodPedId = itPed.getString('produto_id')
              const qtdPedTotal = itPed.getFloat('quantidade') || 0
              let qtdRecAtual = itPed.getFloat('quantidade_recebida') || 0

              // Somar quantidade recebida casando pelo produto_id da nota
              for (let inota = 0; inota < itens.length; inota++) {
                if (itens[inota].getString('produto_id') === prodPedId) {
                  qtdRecAtual += itens[inota].getFloat('quantidade_estoque') || 0
                }
              }

              itPed.set('quantidade_recebida', qtdRecAtual)
              itPed.set('updated_by', userId)
              txApp.save(itPed)

              if (qtdRecAtual >= qtdPedTotal) {
                algumAtendido = true
              } else if (qtdRecAtual > 0) {
                algumAtendido = true
                todosAtendidos = false
              } else {
                todosAtendidos = false
              }
            }

            if (todosAtendidos) {
              pedido.set('status', 'Recebido')
            } else if (algumAtendido) {
              pedido.set('status', 'Parcialmente recebido')
            }
            pedido.set('updated_by', userId)
            txApp.save(pedido)
          }
        } catch (errPed) {
          console.warn('Erro ao atualizar pedido de compra vinculado:', errPed)
        }
      }

      // 7. INTEGRAÇÃO ETAPA 4: GERAR TÍTULOS CONTAS A PAGAR
      // Bonificação e devolução de venda NÃO geram títulos
      const ehBonificacaoOuDevolucao =
        tipoEntrada === 'Bonificação' || tipoEntrada === 'Devolução de venda'

      if (!ehBonificacaoOuDevolucao && txApp.hasTable('contas_pagar')) {
        // Carregar config_financeira_empresa para obter o plano de contas e centro de custo padrão
        let planoContaIdFinal = ''
        let centroCustoIdPadrao = ''

        try {
          const configsFin = txApp.findRecordsByFilter(
            'config_financeira_empresa',
            `empresa_id = '${empresaId}' && ativo = true`,
            '',
            1,
            0,
          )
          if (configsFin.length > 0) {
            const cfg = configsFin[0]
            centroCustoIdPadrao = cfg.getString('centro_custo_padrao_id') || ''

            switch (tipoEntrada) {
              case 'Revenda':
                planoContaIdFinal = cfg.getString('plano_compras_revenda_id') || ''
                break
              case 'Industrialização':
                planoContaIdFinal = cfg.getString('plano_industrializacao_id') || ''
                break
              case 'Uso e consumo':
                planoContaIdFinal = cfg.getString('plano_uso_consumo_id') || ''
                break
              case 'Ativo imobilizado':
                planoContaIdFinal = cfg.getString('plano_imobilizado_id') || ''
                break
              case 'Outras':
              default:
                planoContaIdFinal = cfg.getString('plano_outras_entradas_id') || ''
                break
            }
          }
        } catch (_) {}

        // Fallback: se não tiver plano na config_financeira_empresa, busca primeiro analítico de despesa
        if (!planoContaIdFinal) {
          try {
            const planosDespesa = txApp.findRecordsByFilter(
              'plano_contas',
              `natureza = 'Analítica' && tipo = 'Despesa' && ativo = true`,
              'codigo',
              1,
              0,
            )
            if (planosDespesa.length > 0) {
              planoContaIdFinal = planosDespesa[0].id
            }
          } catch (_) {}
        }

        // Buscar parcelas da nota em notas_entrada_parcelas
        const parcelasNota = txApp.findRecordsByFilter(
          'notas_entrada_parcelas',
          `nota_id = '${notaId}' && ativo = true`,
          'numero',
        )

        const pagarCol = txApp.findCollectionByNameOrId('contas_pagar')
        const titulosGerados = []

        if (parcelasNota.length > 0) {
          const totalParc = parcelasNota.length
          for (let pIdx = 0; pIdx < parcelasNota.length; pIdx++) {
            const parc = parcelasNota[pIdx]
            const valorParc = parc.getFloat('valor') || 0
            const vencParc = parc.getString('data_vencimento') || dataEntrada || dataEmissao
            const tPagParc = parc.getString('forma_pagamento') || ''

            // Resolver forma de pagamento prevista pelo tPag quando houver
            let formaPrevistaId = ''
            if (tPagParc) {
              try {
                const fPag = txApp.findRecordsByFilter(
                  'formas_pagamento',
                  `codigo_tpag = '${tPagParc}' && ativo = true`,
                  '',
                  1,
                  0,
                )
                if (fPag.length > 0) {
                  formaPrevistaId = fPag[0].id
                }
              } catch (_) {}
            }

            const tituloRec = new Record(pagarCol)
            tituloRec.set('empresa_id', empresaId)
            tituloRec.set('fornecedor_id', fornecedorId)
            tituloRec.set('numero_documento', String(docNumero))
            tituloRec.set('parcela', `${pIdx + 1}/${totalParc}`)
            tituloRec.set(
              'descricao',
              `NF Entrada #${docNumero} - Parc ${pIdx + 1}/${totalParc} - ${fornecedorNome}`,
            )
            tituloRec.set('data_emissao', dataEmissao)
            tituloRec.set('data_competencia', dataEntrada || dataEmissao)
            tituloRec.set('data_vencimento', vencParc)
            tituloRec.set('plano_conta_id', planoContaIdFinal)
            if (centroCustoIdPadrao) {
              tituloRec.set('centro_custo_id', centroCustoIdPadrao)
            }
            if (formaPrevistaId) {
              tituloRec.set('forma_pagamento_prevista_id', formaPrevistaId)
            }
            tituloRec.set('valor_original', valorParc)
            tituloRec.set('valor_pago', 0)
            tituloRec.set('saldo', valorParc)
            tituloRec.set('status', 'Em aberto')
            tituloRec.set('origem', 'NF Entrada')
            tituloRec.set('origem_id', notaId)
            tituloRec.set('nota_entrada_parcela_id', parc.id)
            tituloRec.set('ativo', true)
            tituloRec.set('created_by', userId)
            tituloRec.set('updated_by', userId)
            txApp.save(tituloRec)
            titulosGerados.push(tituloRec)
          }
        } else {
          // Nota sem parcelas (à vista / parcela única)
          const valorTotalNota = nota.getFloat('valor_total') || 0
          const tituloRec = new Record(pagarCol)
          tituloRec.set('empresa_id', empresaId)
          tituloRec.set('fornecedor_id', fornecedorId)
          tituloRec.set('numero_documento', String(docNumero))
          tituloRec.set('parcela', '1/1')
          tituloRec.set('descricao', `NF Entrada #${docNumero} - ${fornecedorNome}`)
          tituloRec.set('data_emissao', dataEmissao)
          tituloRec.set('data_competencia', dataEntrada || dataEmissao)
          tituloRec.set('data_vencimento', dataEntrada || dataEmissao)
          tituloRec.set('plano_conta_id', planoContaIdFinal)
          if (centroCustoIdPadrao) {
            tituloRec.set('centro_custo_id', centroCustoIdPadrao)
          }
          tituloRec.set('valor_original', valorTotalNota)
          tituloRec.set('valor_pago', 0)
          tituloRec.set('saldo', valorTotalNota)
          tituloRec.set('status', 'Em aberto')
          tituloRec.set('origem', 'NF Entrada')
          tituloRec.set('origem_id', notaId)
          tituloRec.set('ativo', true)
          tituloRec.set('created_by', userId)
          tituloRec.set('updated_by', userId)
          txApp.save(tituloRec)
          titulosGerados.push(tituloRec)

          // Se a opção "Já paga" veio no payload da nota sem parcelas
          const jaPaga = Boolean(body.ja_paga)
          const contaPagamentoId = body.conta_pagamento_id || ''
          const formaPagamentoId = body.forma_pagamento_id || ''

          if (jaPaga && contaPagamentoId && valorTotalNota > 0) {
            const contaRec = txApp.findRecordById('contas_financeiras', contaPagamentoId)
            if (!contaRec || !contaRec.getBool('ativo')) {
              throw new Error('Conta financeira para baixa imediata não encontrada ou inativa.')
            }

            const permiteNegativoConta = contaRec.getBool('permite_saldo_negativo')
            const saldoContaAnt = contaRec.getFloat('saldo_atual') || 0
            const saldoContaPos = saldoContaAnt - valorTotalNota

            if (saldoContaPos < -0.005 && !permiteNegativoConta) {
              throw new Error(
                `Saldo insuficiente na conta "${contaRec.getString('nome')}" para baixa imediata. Saldo atual: R$ ${saldoContaAnt.toFixed(2)}, total da nota: R$ ${valorTotalNota.toFixed(2)}.`,
              )
            }

            // Criar lote
            const lotesCol = txApp.findCollectionByNameOrId('pagamentos_lotes')
            const loteRec = new Record(lotesCol)
            loteRec.set('empresa_id', empresaId)
            loteRec.set('data_pagamento', dataEntrada || dataEmissao)
            loteRec.set('conta_financeira_id', contaPagamentoId)
            if (formaPagamentoId) loteRec.set('forma_pagamento_id', formaPagamentoId)
            loteRec.set('valor_total', valorTotalNota)
            loteRec.set('total_titulos', 1)
            loteRec.set('observacao', `Baixa automática no lançamento da NF Entrada #${docNumero}`)
            loteRec.set('ativo', true)
            loteRec.set('created_by', userId)
            loteRec.set('updated_by', userId)
            txApp.save(loteRec)

            // Criar baixa
            const baixasCol = txApp.findCollectionByNameOrId('pagamentos_baixas')
            const baixaRec = new Record(baixasCol)
            baixaRec.set('empresa_id', empresaId)
            baixaRec.set('conta_pagar_id', tituloRec.id)
            baixaRec.set('lote_baixa_id', loteRec.id)
            baixaRec.set('data_pagamento', dataEntrada || dataEmissao)
            baixaRec.set('conta_financeira_id', contaPagamentoId)
            if (formaPagamentoId) baixaRec.set('forma_pagamento_id', formaPagamentoId)
            baixaRec.set('valor_original', valorTotalNota)
            baixaRec.set('valor_pago', valorTotalNota)
            baixaRec.set('valor_multa', 0)
            baixaRec.set('valor_juros', 0)
            baixaRec.set('valor_desconto', 0)
            baixaRec.set('valor_total_pago', valorTotalNota)
            baixaRec.set('estornado', false)
            baixaRec.set('observacao', 'Pagamento à vista realizado na entrada da nota')
            baixaRec.set('ativo', true)
            baixaRec.set('created_by', userId)
            baixaRec.set('updated_by', userId)
            txApp.save(baixaRec)

            // Atualizar título para Pago
            tituloRec.set('valor_pago', valorTotalNota)
            tituloRec.set('saldo', 0)
            tituloRec.set('status', 'Pago')
            tituloRec.set('data_pagamento', dataEntrada || dataEmissao)
            tituloRec.set('updated_by', userId)
            txApp.save(tituloRec)

            // Movimentação financeira
            const movsFinCol = txApp.findCollectionByNameOrId('movimentacoes_financeiras')
            const movFinRec = new Record(movsFinCol)
            movFinRec.set('empresa_id', empresaId)
            movFinRec.set('conta_financeira_id', contaPagamentoId)
            movFinRec.set('data_movimento', dataEntrada || dataEmissao)
            movFinRec.set('tipo', 'Saída')
            movFinRec.set('origem', 'PAGAMENTO_TITULO')
            movFinRec.set('valor', valorTotalNota)
            movFinRec.set('saldo_anterior', saldoContaAnt)
            movFinRec.set('saldo_posterior', saldoContaPos)
            movFinRec.set('documento_tipo', 'contas_pagar')
            movFinRec.set('documento_id', tituloRec.id)
            movFinRec.set('documento_numero', String(docNumero))
            movFinRec.set('lote_baixa_id', loteRec.id)
            movFinRec.set(
              'historico',
              `Pagamento à vista NF Entrada #${docNumero} - ${fornecedorNome}`,
            )
            movFinRec.set('estornado', false)
            movFinRec.set('ativo', true)
            movFinRec.set('created_by', userId)
            movFinRec.set('updated_by', userId)
            txApp.save(movFinRec)

            // Atualizar saldo_atual da conta_financeira
            contaRec.set('saldo_atual', saldoContaPos)
            contaRec.set('updated_by', userId)
            txApp.save(contaRec)
          }
        }
      }

      // 8. Atualizar status da nota para Lançada
      nota.set('status', 'Lançada')
      nota.set('data_lancamento', new Date().toISOString())
      if (usuarioErpId) {
        nota.set('usuario_lancamento_id', usuarioErpId)
      }
      nota.set('updated_by', userId)
      txApp.save(nota)

      // 9. Gravar logs_auditoria
      const logsCol = txApp.findCollectionByNameOrId('logs_auditoria')
      const auditRec = new Record(logsCol)
      auditRec.set('usuario_id', userId)
      auditRec.set('usuario_nome', authRecord.getString('name') || 'Usuário')
      auditRec.set('empresa_id', empresaId)
      auditRec.set('tabela', 'notas_entrada')
      auditRec.set('registro_id', notaId)
      auditRec.set('acao', 'alteracao')
      auditRec.set('valores_antes', JSON.stringify({ status: 'Em conferência' }))
      auditRec.set(
        'valores_depois',
        JSON.stringify({
          status: 'Lançada',
          data_lancamento: nota.getString('data_lancamento'),
          atualizar_custo_produtos: atualizarCustoProdutos,
          justificativa_divergencia: justificativaDivergencia,
        }),
      )
      txApp.save(auditRec)
    })

    return c.json(200, {
      sucesso: true,
      message: 'Nota de entrada lançada com sucesso.',
      produtos_revisao: produtosParaRevisao,
    })
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    return c.json(400, {
      sucesso: false,
      message: msg,
    })
  }
})
