# Changelog — Trevvo

Registro das rodadas de manutenção do projeto. Para regras do projeto, ver memória do projeto e `src/config/tabelaRotas.ts`.

## 2026-11-27 — Deploy-only: deploy do backend com a migration 0154 (tray_envios_log)

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, telas, migrations e serviços não foram tocados (`fiscal_documentos_operacoes.js`, `fiscal_nfe_operacoes.js` e `fiscal_nfce_emitir.js` permanecem intocados, conforme PROJETO_ERP.md).
- Objetivo: implantar o backend com os hooks atuais do repositório (inclusive `tray_produtos.js` e `tray_envio.js`) e aplicar a migration `0154_create_tray_envios_log.js`, já existente no repositório.
- A 0154 cria a coleção `tray_envios_log` (log de cada envio de estoque/preço Trevvo → Tray, sem tokens; create/update/delete fechados, leitura pelo assinante), idempotente.
- Verificação (pós-deploy):
  - `list_migrations`: `0154_create_tray_envios_log.js` consta como `applied`; nenhuma pendente, nenhuma falha; próxima livre: 0155.
  - `list_backend_functions`: família Tray completa — `tray_conexao`, `tray_produtos` (GET /backend/v1/tray/produtos/conferencia), `tray_midia`, `tray_homologacao`, `tray_envio` (POST /backend/v1/tray/envio/executar) — registrada sem erro, junto dos demais hooks (`fiscal_*`, `vendas_operacoes`, `caixa_*`, `financeiro_*`, `master_rotas`, `mercadolivre_*`, `shopee_conexao`, `anuncios_saude`, `ajuda_trevvo`).
  - `list_logs` (hooks): sem erro de inicialização/boot; únicos erros são regras de negócio (`vendas/finalizar` — conta financeira padrão de recebimentos não configurada).
  - `db_show_schema`: coleção `tray_envios_log` presente no schema live com índices `idx_tray_envios_log_empresa` e `idx_tray_envios_log_anuncio` e regras de API `list, view` (regra do assinante).

## 2026-11-26 — Deploy-only: recarga do backend (tray_produtos) e confirmação da migration 0153

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, telas, migrations e serviços não foram tocados.
- Objetivo: reimplantar o backend para recarregar os hooks atuais do repositório (em especial `pocketbase/hooks/tray_produtos.js`).
- Estado verificado antes do deploy: migrations até `0153_vinculos_anuncios_preco_anuncio.js` constam como `applied` — nenhuma pendente, nenhuma falha; próxima livre é 0154, que não existe no repositório (nada a criar).
- Verificação (pós-deploy):
  - `list_backend_functions`: família Tray completa (`tray_conexao`, `tray_produtos` (GET /backend/v1/tray/produtos/conferencia), `tray_midia`, `tray_homologacao`), família `mercadolivre_*`, `anuncios_saude`, `shopee_conexao`, `ajuda_trevvo`, família `fiscal_*`, `vendas_operacoes`, `caixa_*`, `financeiro_*` e `master_rotas` registrados sem erro.
  - `list_logs` (hooks): sem erro de inicialização/boot.
  - `db_show_schema`: coleção `produtos_vinculos_anuncios` com o campo `preco_anuncio: number` (criado pela 0153), além de `unidades` e índices únicos por produto/empresa/marketplace/anuncio/variacao.

## 2026-11-25 — Deploy-only: reimplante do backend com os hooks atuais do repositório

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, telas, migrations e serviços não foram tocados (`fiscal_documentos_operacoes.js`, `fiscal_nfe_operacoes.js` e `fiscal_nfce_emitir.js` permanecem intocados, conforme PROJETO_ERP.md).
- Objetivo: reimplantar o backend para recarregar os hooks atuais do repositório no PocketBase.
- Estado verificado antes do deploy: todas as migrations até `0152_documentos_fiscais_tipo_documento_zero.js` constam como `applied` — nenhuma pendente, nenhuma falha; próxima livre: 0153.
- Verificação (pós-deploy): `list_backend_functions` com todos os hooks esperados registrados (família `fiscal_*`, `vendas_operacoes`, `caixa_*`, `financeiro_*`, `master_rotas`, `ajuda_trevvo`, `anuncios_saude`, `shopee_conexao`, família `mercadolivre_*`, família `tray_*`) e `list_logs` (hooks, min_level=warn) sem erro de inicialização/boot.

## 2026-11-25 — Deploy-only: recarga do backend com os hooks atuais do repositório

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, telas, migrations e serviços não foram tocados (`fiscal_documentos_operacoes.js`, `fiscal_nfe_operacoes.js` e `fiscal_nfce_emitir.js` permanecem intocados, conforme PROJETO_ERP.md).
- Objetivo: reimplantar o backend com os hooks atuais do repositório, garantindo o estado já corrigido em produção (incluindo `fiscal_devolucao_venda.js` sem `require` de módulos locais no JSVM).
- Estado verificado antes do deploy: todas as migrations até `0152_documentos_fiscais_tipo_documento_zero.js` constam como `applied` — nenhuma pendente, nenhuma falha; próxima livre: 0153.
- Verificação (pós-deploy): `list_backend_functions` com todos os hooks esperados registrados e `list_logs` (hooks, min_level=warn) sem erro de inicialização/boot.

## 2026-11-25 — Deploy-only: recarga do backend com o fiscal_devolucao_venda corrigido

- Rodada **deploy-only**: nenhum arquivo de código foi alterado; hooks, telas e migrations não foram tocados (`fiscal_documentos_operacoes.js`, `fiscal_nfe_operacoes.js` e `fiscal_nfce_emitir.js` permanecem intocados, conforme PROJETO_ERP.md).
- Objetivo: reimplantar o backend para recarregar os hooks atuais do repositório, incluindo `pocketbase/hooks/fiscal_devolucao_venda.js` na versão corrigida (sem `require` de módulos locais no JSVM).
- Estado verificado antes do deploy: todas as migrations até `0152_documentos_fiscais_tipo_documento_zero.js` constam como `applied` — nenhuma pendente, nenhuma falha; próxima livre: 0153.
- Verificação (pós-deploy):
  - `list_migrations`: 0152 é a última aplicada, nenhuma pendente/falha.
  - `list_backend_functions`: `fiscal_devolucao_venda` (POST /backend/v1/fiscal/emitir-nfe-devolucao-venda e confirmar-autorizacao-devolucao-venda), `vendas_operacoes`, `fiscal_nfce_emitir`, `fiscal_documentos_operacoes`, `fiscal_nfe_operacoes`, `mercadolivre_precos`, `anuncios_saude`, `shopee_conexao` e `ajuda_trevvo` registrados.
  - `list_logs` (hooks, min_level=warn): sem erro de inicialização/boot; único erro é regra de negócio de `vendas/finalizar` (conta financeira padrão de recebimentos não configurada — configuração da empresa).

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
