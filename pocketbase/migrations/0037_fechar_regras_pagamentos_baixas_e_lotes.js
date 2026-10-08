/**
 * Migration 0037: Fechar regras de acesso (create/update/delete) direto pelo cliente
 * nas coleções de pagamentos_lotes e pagamentos_baixas.
 *
 * Motivo contábil/auditoria:
 * - Baixas e lotes de pagamento/recebimento geram lançamentos financeiros críticos e alteram saldos
 *   de contas bancárias e de títulos (contas_pagar e contas_receber).
 * - A criação, alteração ou exclusão direta por clientes via REST API desbalanceia a contabilidade
 *   e quebra a integridade financeira.
 * - Toda liquidação ou estorno deve ocorrer através dos hooks transacionais do servidor PocketBase
 *   (pb_hooks: /api/financeiro/pagar/baixar, /estornar, /receber/baixar, /estornar).
 * - Leitura (list/view) permanece liberada para usuários autenticados da empresa ativa (@request.auth.id != '').
 */

migrate(
  (app) => {
    // 1. pagamentos_lotes
    try {
      const colLotes = app.findCollectionByNameOrId('pagamentos_lotes')
      colLotes.listRule = '@request.auth.id != ""'
      colLotes.viewRule = '@request.auth.id != ""'
      colLotes.createRule = null
      colLotes.updateRule = null
      colLotes.deleteRule = null
      app.save(colLotes)
    } catch (e) {
      console.warn('Aviso ao atualizar regras de pagamentos_lotes:', e)
    }

    // 2. pagamentos_baixas
    try {
      const colBaixas = app.findCollectionByNameOrId('pagamentos_baixas')
      colBaixas.listRule = '@request.auth.id != ""'
      colBaixas.viewRule = '@request.auth.id != ""'
      colBaixas.createRule = null
      colBaixas.updateRule = null
      colBaixas.deleteRule = null
      app.save(colBaixas)
    } catch (e) {
      console.warn('Aviso ao atualizar regras de pagamentos_baixas:', e)
    }
  },
  (app) => {
    // Reverter para @request.auth.id != "" se necessário
    try {
      const colLotes = app.findCollectionByNameOrId('pagamentos_lotes')
      colLotes.createRule = '@request.auth.id != ""'
      colLotes.updateRule = '@request.auth.id != ""'
      colLotes.deleteRule = '@request.auth.id != ""'
      app.save(colLotes)
    } catch (e) {}

    try {
      const colBaixas = app.findCollectionByNameOrId('pagamentos_baixas')
      colBaixas.createRule = '@request.auth.id != ""'
      colBaixas.updateRule = '@request.auth.id != ""'
      colBaixas.deleteRule = '@request.auth.id != ""'
      app.save(colBaixas)
    } catch (e) {}
  },
)
