# Changelog — Trevvo

Registro das rodadas de manutenção do projeto. Para regras do projeto, ver memória do projeto e `src/config/tabelaRotas.ts`.

## 2026-11-25 — Correção do 400 genérico em emitir-nfe-devolucao-venda (hook fiscal_devolucao_venda)

- Causa raiz (logs de requests, status 0 + "Invalid module"): a versão implantada do hook `fiscal_devolucao_venda.js` ainda usava `require` de módulos locais (`tenancy.js`, `fiscal_token_lib.js`), que falha no JSVM do PocketBase — a exceção era engolida pelo handler genérico e virava HTTP 400 "Something went wrong while processing your request.", sem mensagem de negócio.
- O repositório já continha a versão corrigida (funções de tenancy e `obterTokenFocus` copiadas localmente no callback); faltava o deploy. `deploy_backend` executado nesta rodada.
- Dados da devolução real validados por `db_query` (o0e459n9fsh2osg, MARCELO DA SILVEIRA LEPRE 02286256705): itens presentes, venda origem #14 com NFC-e Autorizada (chave 44 dígitos), token Focus em `credenciais_fiscais` e config fiscal ativa com natureza "Devolução de venda" — nenhum bloqueio de negócio.
- Restrição respeitada: `fiscal_documentos_operacoes.js` e `fiscal_nfe_operacoes.js` não foram tocados.

## 2026-11-24 — Deploy-only: recarga do hook anuncios_saude (reinício do backend)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, frontend e migrations não foram tocados.
- Objetivo: reimplantar o backend para recarregar `pocketbase/hooks/anuncios_saude.js`, atualizado pelo repositório.
- Verificação (pós-deploy):
  - `list_backend_functions`: `anuncios_saude` (POST /backend/v1/anuncios-saude/verificar) registrado junto dos demais hooks (`ajuda_trevvo`, família `mercadolivre_*`, `shopee_conexao`, `vendas_operacoes`, `fiscal_*`, `master_rotas`).
  - `list_migrations`: nenhuma falha; migrations 0142 a 0146 `applied`; próxima livre 0147.
  - `list_logs` (hooks, min_level=error): sem erro de inicialização/boot.

## 2026-11-23 — Deploy-only: reconstrução completa (frontend + backend, reinício da prévia)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks e migrations não foram tocados.
- Objetivo: reconstruir o projeto por completo — build do frontend (setup, lint, typecheck, build) e deploy do backend com os hooks e migrations atuais do repositório, reiniciando a prévia e o backend.
- Verificação (pós-deploy):
  - `list_backend_functions`: família `mercadolivre` (conexão, notificações, preços, auditoria), `anuncios_saude`, `shopee_conexao`, `ajuda_trevvo` (POST /backend/v1/ajuda/perguntar), `vendas_operacoes`, `fiscal_nfce_emitir` e `master_limpeza_testes` registrados.
  - `list_migrations`: até 0143 aplicadas, nenhuma migration falha; próxima livre 0144.
  - `list_logs` (hooks, min_level=error): sem erro de inicialização/boot.

## 2026-11-23 — Deploy-only: reimplante do backend (PRs 48/49 — Saúde dos anúncios e Shopee)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks e migrations não foram tocados.
- Objetivo: reimplantar o backend para carregar o estado atual do repositório, ativando o que ficou pendente dos PRs 48 e 49 — Saúde dos anúncios (`anuncios_saude.js`) e Shopee (`shopee_conexao.js`).
- Verificação (pós-commit):
  - `list_migrations`: 0142 (`anuncios_saude`) e 0143 (`shopee_conexao`) `applied`, nenhuma migration falha.
  - `list_backend_functions`: `anuncios_saude` (POST /backend/v1/anuncios-saude/verificar) e `shopee_conexao` (diagnóstico/conexão/callback/status/testar/desconectar) registrados; família `mercadolivre` intacta.
  - `list_logs` (hooks, min_level=error): sem erro de inicialização de hook após o deploy.

## 2026-11-22 — Deploy-only: recarga do hook mercadolivre_precos (migration 0140 já aplicada)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; migrations não foram tocadas.
- Objetivo: reimplantar o backend para recarregar `pocketbase/hooks/mercadolivre_precos.js` com a versão atual do repositório.
- Migration `0140_create_produtos_vinculos_anuncios.js`: confirmada `applied` em `list_migrations` (não reaplicada). Próxima livre: 0141.
- Verificação:
  - `list_backend_functions`: `mercadolivre_precos` registrado em GET /backend/v1/mercadolivre/precos-produto.
  - `list_logs` (hooks): sem erro de inicialização; único erro esperado é a regra de negócio de `vendas/cancelar` (título recebido bloqueia cancelamento).

## 2026-11-22 — Deploy-only: recarga do hook mercadolivre_precos (precificação por canal)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado.
- Objetivo: reimplantar o backend para recarregar `pocketbase/hooks/mercadolivre_precos.js` (usuário testando a precificação por canal em /cadastros/produtos/:id/editar).
- Verificação:
  - `list_backend_functions`: `mercadolivre_precos` (GET /backend/v1/mercadolivre/precos-produto) registrado junto dos demais hooks.
  - `list_logs` (hooks): sem erro de inicialização de hooks após o deploy.
- Pendência conhecida (fora do escopo): frontend chama `GET /api/collections/credenciais_fiscais/records` (403); o correto é `GET /backend/v1/fiscal/credenciais` (200).

## 2026-11-22 — Deploy-only: recarga dos hooks mercadolivre_precos e tray_produtos

- Rodada **deploy-only**: nenhum arquivo de código foi alterado.
- Objetivo: reimplantar o backend para recarregar os hooks `pocketbase/hooks/mercadolivre_precos.js` e `pocketbase/hooks/tray_produtos.js`.
- Execução: `deploy_backend` executado com sucesso, sem necessidade de commit para disparar o build.
- Verificação:
  - `list_backend_functions`: `mercadolivre_precos` (GET /backend/v1/mercadolivre/precos-produto) e `tray_produtos` (GET /backend/v1/tray/produtos/conferencia) registrados, sem erro de registro.
  - `list_logs` (hooks e requests): sem erro de inicialização/boot; rotas da família Mercado Livre (ex.: POST /backend/v1/mercadolivre/notificacoes) respondendo 200.

## 2026-11-22 — Deploy-only: aplicação da migration 0138 (canais_margem)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado.
- Objetivo: reimplantar o backend para aplicar a migration `pocketbase/migrations/0138_create_canais_margem.js` (cria a coleção `canais_margem` e faz seeds dos 5 canais por assinante).
- Verificação:
  - `list_migrations`: `0138_create_canais_margem.js` aplicada.
  - `db_query`: 5 canais seeded para o assinante Hospital Home (wqxiw7olvkup3sm).
  - `list_logs` (hooks, min_level=error): sem erro de inicialização.

## 2026-11-21 — Deploy-only: recarga dos hooks do backend

- Rodada **deploy-only**: nenhum arquivo de código foi alterado.
- Objetivo: recarregar os hooks do backend, em especial `pocketbase/hooks/vendas_operacoes.js` e `pocketbase/hooks/fiscal_nfce_emitir.js`.
- Execução: `deploy_backend` executado com sucesso.
- Verificação:
  - `list_backend_functions`: `vendas_operacoes` (POST /backend/v1/vendas/finalizar|cancelar|converter-orcamento|salvar-pedido) e `fiscal_nfce_emitir` (POST /backend/v1/fiscal/emitir-nfce-venda|cancelar-nfce-venda) registrados, sem erro de boot.
  - `list_logs` (hooks): sem erro de inicialização; `emitir-nfce-venda` gravando itens normalmente. Único `error` é regra de negócio de `vendas/cancelar` (título recebido bloqueia cancelamento).
- Pendências conhecidas (fora do escopo desta rodada):
  - Frontend chama `GET /api/collections/credenciais_fiscais/records` e recebe 403; o caminho correto é `GET /backend/v1/fiscal/credenciais` (responde 200).
