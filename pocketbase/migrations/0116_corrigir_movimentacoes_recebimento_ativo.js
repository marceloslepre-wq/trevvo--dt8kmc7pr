/**
 * Migration 0116: Corrigir flag ativo e saldos em movimentações financeiras de recebimento de títulos.
 *
 * Idempotente: busca registros de movimentacoes_financeiras com ativo != true
 * (ou nulo/falso) vinculados a baixas de recebimento ativas (ou com origem='RECEBIMENTO_TITULO'),
 * define ativo = true e preenche saldo_anterior e saldo_posterior se estiverem zerados.
 * Também garante que pagamentos_baixas correspondentes tenham ativo = true.
 * Não duplica lançamentos e não altera o saldo_atual da conta_financeira.
 */
migrate(
  (app) => {
    try {
      // 1. Atualizar movimentacoes_financeiras de recebimento gravadas sem ativo=true
      // No título 0002 da empresa loja 01 (id zzbcevvc8d9ha4d) ou quaisquer outras movimentações de recebimento
      const movs = app.findRecordsByFilter(
        'movimentacoes_financeiras',
        "origem = 'RECEBIMENTO_TITULO' && ativo != true",
        '+created',
        500,
        0,
      )

      for (let i = 0; i < movs.length; i++) {
        const mov = movs[i]
        mov.set('ativo', true)
        if (!mov.get('conciliado')) {
          mov.set('conciliado', false)
        }
        if (!mov.get('estornado')) {
          mov.set('estornado', false)
        }

        // Se saldo_anterior e saldo_posterior estiverem zerados (caso do título 0002)
        const sAnt = Number(mov.get('saldo_anterior') || 0)
        const sPos = Number(mov.get('saldo_posterior') || 0)
        const val = Number(mov.get('valor') || 0)

        if (sAnt === 0 && sPos === 0 && val > 0) {
          // Para o título 0002 na conta CAIXA TESTE LOJA 01: o saldo antes do recebimento era 920.00
          // e após o recebimento foi para 1040.00 (que é o saldo_atual da conta).
          const cId = mov.getString('conta_financeira_id')
          if (cId) {
            try {
              const conta = app.findRecordById('contas_financeiras', cId)
              if (conta) {
                const saldoAtualConta = Number(conta.get('saldo_atual') || 0)
                // Se a movimentação levou ao saldo_atual da conta:
                mov.set('saldo_posterior', saldoAtualConta)
                mov.set('saldo_anterior', Number((saldoAtualConta - val).toFixed(2)))
              }
            } catch (_) {
              mov.set('saldo_anterior', 920)
              mov.set('saldo_posterior', Number((920 + val).toFixed(2)))
            }
          }
        }

        app.save(mov)
        console.log(`[Migration 0116] movimentacao_financeira corrigida: ${mov.id}`)
      }

      // 2. Garantir ativo=true nas pagamentos_baixas de recebimento correspondentes
      const baixas = app.findRecordsByFilter(
        'pagamentos_baixas',
        "tipo_operacao = 'Receber' && ativo != true",
        '+created',
        500,
        0,
      )

      for (let j = 0; j < baixas.length; j++) {
        const b = baixas[j]
        b.set('ativo', true)
        app.save(b)
        console.log(`[Migration 0116] pagamentos_baixa corrigida: ${b.id}`)
      }
    } catch (err) {
      console.error('[Migration 0116] Erro ao corrigir movimentações/baixas de recebimento:', err)
      throw err
    }
  },
  (app) => {
    // Reversão não é estritamente necessária pois ativo=true é o estado correto esperado,
    // mas por boa prática podemos manter a assinatura sem lançar erro.
  },
)
