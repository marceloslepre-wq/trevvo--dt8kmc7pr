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
3. A Tray redireciona para `GET /backend/v1/tray/oauth/callback` com `code` e `api_address`. O `api_address` é um host da própria Tray (ex.: `xxxx.commercesuite.com.br`), diferente do endereço da loja; só é aceito se for de domínio da Tray (`.commercesuite.com.br`, `.tray.com.br`, `.corpsuite.com.br`) ou igual ao endereço de uma solicitação pendente, porque as chaves do aplicativo são enviadas para ele. O callback usa a solicitação pendente (não usada, até 15 min); havendo mais de uma, identifica a loja consultando `/info`. `loja_host` (informado pelo administrador) e `api_address` (devolvido pela Tray) são gravados separados.
4. O backend troca o `code` em `POST https://{loja}/web_api/auth` e grava os tokens.

### Rotas

| Método | Rota                                          | Acesso        |
| ------ | --------------------------------------------- | ------------- |
| GET    | `/backend/v1/tray/diagnostico`                | pública       |
| POST   | `/backend/v1/tray/conexao/iniciar`            | administrador |
| GET    | `/backend/v1/tray/oauth/callback`             | pública       |
| GET    | `/backend/v1/tray/conexao/status?empresa_id=` | autenticada   |
| POST   | `/backend/v1/tray/conexao/testar`             | autenticada   |
| POST   | `/backend/v1/tray/conexao/desconectar`        | administrador |

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

## Cuidados ao editar `tray_conexao.js`

- Não usar parâmetro de caminho (`{nome}`) nas rotas: uma rota assim impediu a carga do hook
  inteiro no servidor em 12/11/2026.
- A URL de autorização é `https://{loja}/auth.php?response_type=code&consumer_key=...&callback=...`
  (documentação oficial da Tray). A Tray não devolve parâmetro `state`.
- O agendamento de renovação roda a cada 30 minutos, porque o token de acesso dura só 3 horas.

## Parte 11.2 — Conferência de produtos (somente leitura)

- Hook: `pocketbase/hooks/tray_produtos.js`. Rota `GET /backend/v1/tray/produtos/conferencia?empresa_id=&pagina=1&limite=10` (autenticada, limite máximo 25).
- Lê `GET {api}/products` e, para produtos com variação, `GET {api}/products/variants?product_id=`. Só faz chamadas GET; nada é gravado na Tray nem em produtos/estoque do Trevvo.
- Cada linha traz o código Tray (`produto` ou `produto_variação`, o mesmo usado como SKU nos anúncios do Mercado Livre), a referência, estoque, preço e a situação da comparação com `produtos.referencia`:
  `OK`, `Sem referência na Tray`, `Referência repetida entre variações`, `Sem produto no Trevvo`, `Referência duplicada no Trevvo`, `Produto inativo no Trevvo`.
- A resposta inclui `campos_produto` e `campos_variacao` (nomes dos campos devolvidos pela Tray, sem valores) para conferir o formato.
- Tela: `src/components/tray/ConferenciaProdutosTray.tsx`, exibida em Configurações > Tray quando a loja está conectada.
- Chamadas à Tray enviam `User-Agent: Trevvo-ERP/1.0`.
