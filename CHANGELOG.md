# Changelog — Trevvo

Registro das rodadas de manutenção do projeto. Para regras do projeto, ver memória do projeto e `src/config/tabelaRotas.ts`.

## 2026-11-21 — Deploy-only: recarga dos hooks do backend

- Rodada **deploy-only**: nenhum arquivo de código foi alterado.
- Objetivo: recarregar os hooks do backend, em especial `pocketbase/hooks/vendas_operacoes.js` e `pocketbase/hooks/fiscal_nfce_emitir.js`.
- Execução: `deploy_backend` executado com sucesso.
- Verificação:
  - `list_backend_functions`: `vendas_operacoes` (POST /backend/v1/vendas/finalizar|cancelar|converter-orcamento|salvar-pedido) e `fiscal_nfce_emitir` (POST /backend/v1/fiscal/emitir-nfce-venda|cancelar-nfce-venda) registrados, sem erro de boot.
  - `list_logs` (hooks): sem erro de inicialização; `emitir-nfce-venda` gravando itens normalmente. Único `error` é regra de negócio de `vendas/cancelar` (título recebido bloqueia cancelamento).
- Pendências conhecidas (fora do escopo desta rodada):
  - Frontend chama `GET /api/collections/credenciais_fiscais/records` e recebe 403; o caminho correto é `GET /backend/v1/fiscal/credenciais` (responde 200).
