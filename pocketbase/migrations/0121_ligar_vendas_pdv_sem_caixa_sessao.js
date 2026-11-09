// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0121 — Dados: liga à sessão de caixa as vendas PDV finalizadas
 * que ficaram sem caixa_sessao_id.
 *
 * Idempotente: para cada sessão de caixa (Aberto ou Fechado), liga as vendas
 * PDV da mesma empresa, do mesmo operador, finalizadas entre a abertura e
 * o fechamento (ou agora, se aberta), que estão sem caixa_sessao_id.
 * Nunca mexe em vendas já ligadas a outra sessão.
 *
 * Não requer: só roda quando existem vendas a corrigir.
 */

migrate(
  (app) => {
    const sessoes = app.findRecordsByFilter('caixa_sessoes', 'ativo = true', 'created', 0, 0)
    let ligadas = 0

    for (let s = 0; s < sessoes.length; s++) {
      const sessao = sessoes[s]
      const sessaoId = sessao.id
      const empresaId = sessao.getString('empresa_id')
      const operadorId = sessao.getString('operador_id')
      const status = sessao.getString('status')
      if (!empresaId || !operadorId) continue

      const abertura = sessao.getString('data_abertura')
      if (!abertura) continue
      const fechamento = sessao.getString('data_fechamento') || ''

      let filtro =
        `tipo = 'PDV' && empresa_id = '${empresaId}' && operador_id = '${operadorId}' && ` +
        `caixa_sessao_id = '' && status = 'Finalizada' && ativo = true && ` +
        `created >= '${abertura}'`

      // Sessão fechada: janela limitada pelo fechamento (+1s de folga)
      if (status === 'Fechado' && fechamento) {
        filtro += ` && created <= '${fechamento}'`
      } else if (status !== 'Aberto' && status !== 'Fechado') {
        continue
      }

      const candidatas = app.findRecordsByFilter('vendas', filtro, 'created', 0, 0)
      if (!candidatas || candidatas.length === 0) continue

      for (let v = 0; v < candidatas.length; v++) {
        const venda = candidatas[v]
        // Re-checar dentro do loop (defesa em profundidade; nunca sobrescrever
        // uma sessão já informada)
        if (venda.getString('caixa_sessao_id')) continue
        venda.set('caixa_sessao_id', sessaoId)
        app.save(venda)
        ligadas++
      }
    }

    if (ligadas > 0) {
      console.log('[0121] vendas PDV ligadas a sessões de caixa: ' + ligadas)
    }
  },
  (app) => {
    // Down: no-op — a correção é apenas de dados, não estrutural
  },
)
