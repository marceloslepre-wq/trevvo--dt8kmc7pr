# Integração com a Tray (Etapa 11)

O código é escrito pelo Claude via pull request no GitHub. Ao alterar estes arquivos pelo chat
do Skip, mantenha as rotas, coleções e nomes de Segredos descritos aqui.

## Parte 11.1 — Conexão da loja e renovação do token

### Arquivos
- `pocketbase/migrations/0133_create_tray_conexao.js`
- `pocketbase/hooks/tray_conexao.js`
- `src/services/tray.ts`
- `src/pages/configuracoes/TrayPage.tsx` (rota `/configuracoes/tray`, item no menu Configurações)

### Coleções (todas as regras = null; só o backend lê e grava)
- `tray_contas`: uma loja por empresa (`empresa_id` único). Guarda `loja_host`, `api_address`,
  `store_id`, `loja_nome`, tokens, validades, `status` (Conectada, Reconectar, Desconectada).
- `tray_oauth_estados`: solicitações de conexão de uso único, válidas por 15 minutos.

### Segredos (Skip Cloud)
- `TRAY_CONSUMER_KEY` e `TRAY_CONSUMER_SECRET`: chaves do aplicativo Trevvo ERP enviadas pela Tray.

### Fluxo
1. O administrador informa o endereço da loja e clica em Conectar.
2. O backend devolve `https://{loja}/auth.php?response_type=code&consumer_key=...&callback=...`.
3. A Tray redireciona para `GET /backend/v1/tray/oauth/callback/{estado}` com `code`.
4. O backend troca o `code` em `POST https://{loja}/web_api/auth` e grava os tokens.

### Rotas
| Método | Rota | Acesso |
|---|---|---|
| GET | `/backend/v1/tray/diagnostico` | pública |
| POST | `/backend/v1/tray/conexao/iniciar` | administrador |
| GET | `/backend/v1/tray/oauth/callback/{estado}` | pública |
| GET | `/backend/v1/tray/conexao/status?empresa_id=` | autenticada |
| POST | `/backend/v1/tray/conexao/testar` | autenticada |
| POST | `/backend/v1/tray/conexao/desconectar` | administrador |

### Regras
- O token de acesso dura 3 horas e o de renovação, 30 dias. O agendamento `tray_renovar_tokens`
  roda a cada 30 minutos e renova o que vence em até 75 minutos.
- A API chamada é sempre `https://{loja informada pelo administrador}/web_api`; um endereço
  diferente vindo no retorno é recusado.
- Tokens e chaves nunca vão para log nem para resposta de rota.
- Limite da Tray: 180 requisições por minuto.

## Próximas partes (ainda não implementadas)
- 11.2 Leitura de produtos e variações (código, referência, estoque), somente leitura
- 11.3 Pedidos
- 11.4 Sincronização de estoque e preço
