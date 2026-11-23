# Integração Shopee

Parte 1: conexão da loja por empresa (Open Platform v2), no mesmo padrão do Mercado Livre.

## Segredos (Skip Cloud)

| Segredo | Valor |
|---|---|
| `SHOPEE_PARTNER_ID` | Partner ID do app na Shopee Open Platform |
| `SHOPEE_PARTNER_KEY` | Partner Key do app (secreta; nunca gravar em arquivo) |
| `SHOPEE_AMBIENTE` | opcional: `teste` usa `partner.test-stable.shopeemobile.com` (sandbox) |
| `SHOPEE_REDIRECT_URI` | opcional: se vazio, usa `https://{host}/backend/v1/shopee/oauth/callback` |

No app da Open Platform, o domínio de retorno (Redirect URL Domain) deve ser o domínio do backend do Trevvo.

## Fluxo

1. Configurações > Integração Shopee > **Conectar à Shopee** (administrador, empresa ativa).
2. O backend gera a URL `/api/v2/shop/auth_partner` assinada (HMAC-SHA256 de partner_id + caminho + timestamp).
   A Shopee não tem `state`: o valor de uso único vai na própria URL de retorno (`?estado=`).
3. O vendedor autoriza; a Shopee chama `/backend/v1/shopee/oauth/callback?estado=&code=&shop_id=`.
4. O backend troca o code em `/api/v2/auth/token/get` e grava em `shopee_contas` (regras = null; tokens nunca vão ao navegador).
5. Cron `shopee_renovar_tokens` (30 em 30 min) renova o acesso (vale 4h) em `/api/v2/auth/access_token/get`.
   O refresh_token muda a cada renovação e vale 30 dias.

## Rotas

- `GET /backend/v1/shopee/diagnostico` (pública)
- `POST /backend/v1/shopee/conexao/iniciar`
- `GET /backend/v1/shopee/oauth/callback` (pública)
- `GET /backend/v1/shopee/conexao/status`
- `POST /backend/v1/shopee/conexao/testar` (lê `/api/v2/shop/get_shop_info`)
- `POST /backend/v1/shopee/conexao/desconectar`

## Próximas partes

- Saúde dos anúncios da Shopee (`product/get_item_list` com status BANNED/UNLIST/REVIEWING) no monitor diário `anuncios_saude`.
- Vínculos produto x anúncio (`produtos_vinculos_anuncios`, marketplace `shopee`).
