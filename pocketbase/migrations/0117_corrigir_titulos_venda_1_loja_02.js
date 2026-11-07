/**
 * Migration 0117: Corrigir títulos de Contas a Receber da Venda #1 da Loja 02.
 *
 * Idempotente:
 * - Venda #1 (id 0lt7vilixs0jvv8, empresa rt4ytoiybomjh1e) emitida em 07/11/2026 com condição 30/60.
 * - Parcela 1/2: valor 374,00, vencimento 07/12/2026 (+30 dias de 07/11/2026).
 *   Se já existir, ajusta data_vencimento para '2026-12-07'. Se não existir, cria.
 * - Parcela 2/2: valor 374,00, vencimento 06/01/2027 (+60 dias de 07/11/2026).
 *   Ajusta data_vencimento para '2027-01-06'.
 * - Não duplica títulos caso já existam.
 * - Atualiza vendas_pagamentos.conta_receber_ids da venda com os IDs das duas parcelas.
 */
migrate(
  (app) => {
    try {
      const vendaId = '0lt7vilixs0jvv8'
      const empresaId = 'rt4ytoiybomjh1e'
      const clienteId = '7mkiv1wf1m04jk3'
      const planoVendasId = '90eyhd37j2yqa12'
      const formaBoletoId = 'yrifbvvl2ephkrk'
      const userId = 'e3dli6ywqmypcd5'

      // Buscar os títulos vinculados a essa venda
      const titulos = app.findRecordsByFilter(
        'contas_receber',
        `origem_id = '${vendaId}' && ativo = true`,
        '+numero_documento',
        50,
        0,
      )

      let p1 = null
      let p2 = null

      for (let i = 0; i < titulos.length; i++) {
        const t = titulos[i]
        const parc = t.getString('parcela')
        const doc = t.getString('numero_documento')
        if (parc === '1/2' || doc === '1-1') {
          p1 = t
        } else if (parc === '2/2' || doc === '1-2') {
          p2 = t
        }
      }

      // Parcela 1/2: Vencimento 07/12/2026
      if (p1) {
        p1.set('data_vencimento', '2026-12-07')
        p1.set('valor_original', 374.0)
        p1.set('saldo', 374.0)
        p1.set('cliente_id', clienteId)
        p1.set('descricao', 'Venda #1 - Parcela 1/2')
        p1.set('parcela', '1/2')
        p1.set('parcela_numero', 1)
        p1.set('total_parcelas', 2)
        p1.set('status', 'Aberto')
        p1.set('ativo', true)
        app.save(p1)
        console.log(`[Migration 0117] Parcela 1/2 atualizada: ${p1.id} -> 2026-12-07`)
      } else {
        const col = app.findCollectionByNameOrId('contas_receber')
        const RecordClass =
          typeof Record !== 'undefined' ? Record : require('pocketbase/models/Record')
        p1 = new RecordClass(col)
        p1.set('empresa_id', empresaId)
        p1.set('cliente_id', clienteId)
        p1.set('numero_documento', '1-1')
        p1.set('parcela', '1/2')
        p1.set('parcela_numero', 1)
        p1.set('total_parcelas', 2)
        p1.set('descricao', 'Venda #1 - Parcela 1/2')
        p1.set('data_emissao', '2026-11-07')
        p1.set('data_competencia', '2026-11-07')
        p1.set('data_vencimento', '2026-12-07')
        p1.set('valor_original', 374.0)
        p1.set('valor_recebido', 0)
        p1.set('saldo', 374.0)
        p1.set('status', 'Aberto')
        p1.set('plano_conta_id', planoVendasId)
        p1.set('forma_pagamento_prevista_id', formaBoletoId)
        p1.set('origem', 'Venda')
        p1.set('origem_id', vendaId)
        p1.set('ativo', true)
        p1.set('created_by', userId)
        p1.set('updated_by', userId)
        app.save(p1)
        console.log(`[Migration 0117] Parcela 1/2 criada: ${p1.id} -> 2026-12-07`)
      }

      // Parcela 2/2: Vencimento 06/01/2027
      if (p2) {
        p2.set('data_vencimento', '2027-01-06')
        p2.set('valor_original', 374.0)
        p2.set('saldo', 374.0)
        p2.set('cliente_id', clienteId)
        p2.set('descricao', 'Venda #1 - Parcela 2/2')
        p2.set('parcela', '2/2')
        p2.set('parcela_numero', 2)
        p2.set('total_parcelas', 2)
        p2.set('status', 'Aberto')
        p2.set('ativo', true)
        app.save(p2)
        console.log(`[Migration 0117] Parcela 2/2 atualizada: ${p2.id} -> 2027-01-06`)
      } else {
        const col = app.findCollectionByNameOrId('contas_receber')
        const RecordClass =
          typeof Record !== 'undefined' ? Record : require('pocketbase/models/Record')
        p2 = new RecordClass(col)
        p2.set('empresa_id', empresaId)
        p2.set('cliente_id', clienteId)
        p2.set('numero_documento', '1-2')
        p2.set('parcela', '2/2')
        p2.set('parcela_numero', 2)
        p2.set('total_parcelas', 2)
        p2.set('descricao', 'Venda #1 - Parcela 2/2')
        p2.set('data_emissao', '2026-11-07')
        p2.set('data_competencia', '2026-11-07')
        p2.set('data_vencimento', '2027-01-06')
        p2.set('valor_original', 374.0)
        p2.set('valor_recebido', 0)
        p2.set('saldo', 374.0)
        p2.set('status', 'Aberto')
        p2.set('plano_conta_id', planoVendasId)
        p2.set('forma_pagamento_prevista_id', formaBoletoId)
        p2.set('origem', 'Venda')
        p2.set('origem_id', vendaId)
        p2.set('ativo', true)
        p2.set('created_by', userId)
        p2.set('updated_by', userId)
        app.save(p2)
        console.log(`[Migration 0117] Parcela 2/2 criada: ${p2.id} -> 2027-01-06`)
      }

      // Atualizar vendas_pagamentos da venda #1
      try {
        const vPags = app.findRecordsByFilter(
          'vendas_pagamentos',
          `venda_id = '${vendaId}'`,
          '+created',
          10,
          0,
        )
        for (let j = 0; j < vPags.length; j++) {
          const vp = vPags[j]
          vp.set('conta_receber_ids', JSON.stringify([p1.id, p2.id]))
          app.save(vp)
        }
      } catch (errVp) {
        console.warn('[Migration 0117] Aviso ao atualizar vendas_pagamentos:', errVp)
      }
    } catch (err) {
      console.error('[Migration 0117] Erro ao corrigir títulos da Venda #1:', err)
      throw err
    }
  },
  (app) => {
    // Reversão
  },
)
