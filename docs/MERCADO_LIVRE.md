# Integração com o Mercado Livre (Etapa 10)

Este documento descreve o que já existe da integração. O código é escrito pelo Claude
via pull request no GitHub; ao alterar estes arquivos pelo chat do Skip, mantenha as
rotas, coleções e nomes de Segredos descritos aqui.

## Parte 10.1 — Conexão da conta (OAuth) e renovação do token

### Arquivos

- `pocketbase/migrations/0131_create_mercadolivre_conexao.js`
- `pocketbase/hooks/mercadolivre_conexao.js`

### Coleções (todas as regras = null; só o backend lê e grava)

- `mercadolivre_contas`: uma conta por empresa (`empresa_id` único). Guarda `ml_user_id`,
  `ml_nickname`, `site_id`, `access_token`, `refresh_token`, `token_expira_em`,
  `status` (Conectada, Reconectar, Desconectada), `ultimo_erro`, `ultima_renovacao_em`,
  `conectada_em`, `conectada_por`.
- `mercadolivre_oauth_estados`: valores `state` de uso único, válidos por 10 minutos.

### Segredos (Skip Cloud, lidos com `$os.getenv`)

- `ML_APP_ID` e `ML_CLIENT_SECRET`: credenciais da aplicação do Trevvo no Mercado Livre.
- `ML_REDIRECT_URI` (opcional): força a URL de callback. Se vazio, o backend usa
  `https://{host do backend}/backend/v1/mercadolivre/oauth/callback`.

### Rotas

| Método | Rota                                                  | Acesso        | O que faz                                                                                                              |
| ------ | ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/backend/v1/mercadolivre/diagnostico`                | pública       | Confirma rotas, coleções e Segredos; mostra a URL de callback                                                          |
| POST   | `/backend/v1/mercadolivre/conexao/iniciar`            | administrador | Body `empresa_id`, `retorno_url` (opcional). Devolve `url_autorizacao`                                                 |
| GET    | `/backend/v1/mercadolivre/oauth/callback`             | pública       | Recebe `code` e `state`, grava os tokens e redireciona para `retorno_url?resultado=ok` ou `?resultado=erro&motivo=...` |
| GET    | `/backend/v1/mercadolivre/conexao/status?empresa_id=` | autenticada   | Estado da conexão. Nunca devolve tokens                                                                                |
| POST   | `/backend/v1/mercadolivre/conexao/testar`             | autenticada   | Renova o token se preciso e chama `/users/me`                                                                          |
| POST   | `/backend/v1/mercadolivre/conexao/desconectar`        | administrador | Apaga os tokens e marca Desconectada                                                                                   |

### Agendamento

- `mercadolivre_renovar_tokens`, a cada 30 minutos: renova tokens que vencem em até
  90 minutos. O `refresh_token` é de uso único e o novo é sempre gravado. Em erro de
  autorização a conta vira `Reconectar`; em falha temporária tenta de novo na próxima execução.

### Regras de segurança

- Tokens, `code` e `client_secret` nunca vão para log nem para resposta de rota.
- A mesma conta do Mercado Livre não pode ser ligada a duas empresas.

## Parte 10.2a — Fila de notificações

- `pocketbase/migrations/0132_create_mercadolivre_notificacoes.js`: coleção `mercadolivre_notificacoes` (regras = null).
- `pocketbase/hooks/mercadolivre_notificacoes.js`:
  - `POST /backend/v1/mercadolivre/notificacoes` (pública): valida o aviso, descobre a empresa pela conta
    conectada, grava com status `Pendente` e responde 200. Não chama a API do Mercado Livre
    (exigência de resposta em até 500 ms). Avisos repetidos não são gravados de novo.
  - `GET /backend/v1/mercadolivre/notificacoes/diagnostico` (pública): só contagens por tópico.
- O processamento da fila ainda não existe: os avisos ficam guardados, sem efeito no sistema.

## Parte 10.5a — Auditoria de anúncios (somente leitura)

- `pocketbase/hooks/mercadolivre_auditoria.js`: `GET /backend/v1/mercadolivre/anuncios/auditoria?empresa_id=&offset=&limite=`
  (autenticada). Lê os anúncios da conta conectada, abre cada variação e compara o SKU gravado
  (atributo `SELLER_SKU` ou `seller_custom_field`) com `produtos.referencia` do assinante.
  Situações: OK, SKU vazio, SKU repetido no anúncio, Sem produto no Trevvo,
  Referência duplicada no Trevvo, Produto inativo no Trevvo. Não grava nada no Mercado Livre.
- `src/components/mercadolivre/AuditoriaAnuncios.tsx`: quadro na tela Configurações > Mercado Livre,
  com leitura paginada, filtro de problemas e exportação em planilha.

## Próximas partes (ainda não implementadas)

- 10.1b Tela Configurações > Mercado Livre
- 10.2b Processamento da fila e conferência de avisos perdidos
- 10.3 Importação de pedidos como venda
- 10.4 NF-e do pedido, envio do XML e etiqueta
- 10.5 Vínculo produto-anúncio e sincronização de estoque e preço
- 10.6 Publicação de anúncios, perguntas e mensagens
