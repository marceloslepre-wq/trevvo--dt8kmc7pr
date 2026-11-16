# Trevvo — Integrações (Mercado Livre, Tray, Shopee, Amazon): passagem de bastão

Situação em 16/11/2026. Este documento resume tudo o que foi feito no chat de integrações e o que falta, para que outro chat continue o trabalho sem perder contexto.

## 1. Contexto

- **Trevvo**: ERP próprio da Hospital Home, feito no Skip (Adapta). Backend PocketBase (hooks JS/Goja em `pocketbase/hooks/`, migrations em `pocketbase/migrations/`), frontend React + Vite + TypeScript + Tailwind/shadcn. Em fase final de testes, só com dados de teste.
- **Repositório**: `marceloslepre-wq/trevvo--dt8kmc7pr` (GitHub). Backend: `https://erp-de-gestao-comercial-24560.shrd03.internal.goskip.dev`. Preview: `erp-de-gestao-comercial-24560--preview.goskip.app`.
- **Só a loja 02** (filial e-commerce, CNPJ final 0003-40) tem integração com marketplaces. As demais empresas não são e-commerce.
- **Hoje**: Mercado Livre, Shopee e Amazon são operados pela Tray, que se integra ao ERP atual, o Uniplus. O objetivo é o Trevvo integrar direto com cada marketplace e substituir Tray + Uniplus nessa função.
- **Motivos**: pedidos de anúncios com variação descem com a matrícula errada (ex.: meia M vira G); o estoque de anúncios com variação falha (anúncio pausado ou venda sem estoque); a simulação manual de margem em cada marketplace é desgastante.
- O dono pretende **vender o Trevvo** a outras empresas depois. Por isso a integração com a Tray foi feita mesmo que ele próprio deixe de usá-la.

## 2. Como o trabalho é feito

1. O código é escrito em uma branch e enviado como **pull request pequeno** no GitHub.
2. O dono faz o merge, e no Skip clica em **"Sincronizar do GitHub"**. O backend entra no ar com a sincronização; o frontend precisa de **"Publicar"**.
3. Sincronizar e publicar **só com o Skip parado** (sem prompt em execução). Uma sincronização no meio de uma rodada do Skip já quebrou o build uma vez.

Armadilhas já conhecidas:

- O aviso "Failed to fetch (api.goskip.dev)" ou "Request timed out – push" ao sincronizar é enganoso: a sincronização costuma concluir. Conferir se o número da versão subiu.
- **O Skip às vezes recebe os arquivos mas não recarrega o backend.** Sintoma: o comportamento antigo continua. Solução que funcionou: prompt no Skip pedindo "Não altere nenhum arquivo. Reimplante/reinicie o backend para recarregar os hooks" e uma confirmação objetiva.
- Logo após sincronizar, o backend reinicia por um ou dois minutos. Telas mostram "Something went wrong" ou o seletor de empresas vazio. Basta recarregar.
- Consultar endpoints de diagnóstico por ferramenta de busca do assistente devolveu respostas antigas (cache). **O diagnóstico válido é o que o dono vê no navegador dele.**
- O Skip reformata os arquivos (prettier) a cada sincronização; isso é normal.
- Os arquivos `pocketbase/hooks/diag_auth_tray.js` e `diag_tray_rede.js` estão vazios de propósito (o Skip exige o arquivo presente para desinstalar a rota). Não apagar.

## 3. Regras técnicas do projeto (obrigatórias nos hooks)

- **Nenhuma função declarada no topo do arquivo de hook.** Os helpers ficam DENTRO de cada callback (`routerAdd`, `cronAdd`). Não há `require`.
- **Não usar parâmetro de caminho `{nome}` nas rotas.** Isso impediu a carga do hook inteiro (erro real ocorrido). Usar query string.
- Rotas: `routerAdd('GET', '/backend/v1/...', (c) => {...}, $apis.requireAuth())`; `c.requestInfo().body` e `.query`; `c.json`, `c.html`, `c.redirect`; `$http.send`; `$security.randomString`; `$os.getenv` para Segredos.
- Multiassinante (`assinante_id`) e multiempresa: toda rota valida que a empresa pertence ao assinante do usuário (helpers `contextoDoUsuario` e `exigirEmpresa`, copiados dentro de cada callback).
- Coleções sensíveis (tokens) com todas as regras de API = `null` (só o backend acessa).
- Nomes em português, snake_case. Datas como texto ISO. Campo `text` do PocketBase tem máximo padrão de 5000.
- **Não alterar `.skip.config.json` nem `package.json`.**
- Tokens, `code` e segredos nunca vão para log nem para resposta de rota.
- Chamadas à Tray enviam `User-Agent: Trevvo-ERP/1.0`.
- Próxima migration livre: conferir a numeração atual (as últimas vistas foram 0134 e 0135, criadas pelo outro trabalho).

## 4. Regras de segurança combinadas com o dono

- O assistente não digita senhas, chaves nem credenciais em nenhuma tela, não aceita termos e não resolve CAPTCHA. As chaves secretas **não são coladas em chat**: o dono cadastra direto nos Segredos do Skip Cloud.
- **Nada é gravado em marketplace** (estoque, preço, SKU, nota, mensagem) sem pedido explícito. Modo somente leitura até a virada; testes de escrita em usuários/lojas de teste.
- PRs pequenos, de preferência só arquivos novos; não tocar em vendas, estoque ou fiscal sem combinar.
- Pendências de segurança do dono, ainda abertas em 16/11/2026:
  - o repositório está **público** (Settings → Danger Zone → Change visibility → Private);
  - a chave `APICPF_DEV_KEY` está exposta no `.env` do repositório e precisa ser trocada no fornecedor.

## 5. Mercado Livre — o que está pronto

Segredos no Skip: `ML_APP_ID`, `ML_CLIENT_SECRET` (aplicação criada pelo dono no portal de desenvolvedores; o nome "Trevvo" não foi aceito lá e ele usou uma variação).

| Parte | PR | Arquivos | Situação |
|---|---|---|---|
| 10.1 Conexão (OAuth) e renovação de token | #3 | `migrations/0131_create_mercadolivre_conexao.js`, `hooks/mercadolivre_conexao.js`, `docs/MERCADO_LIVRE.md` | Funcionando. Loja 02 conectada à conta **LOJA HH** |
| 10.1b Tela de conexão | #4 | `src/services/mercadoLivre.ts`, `src/pages/configuracoes/MercadoLivrePage.tsx`, rota `/configuracoes/mercado-livre`, item no `Sidebar.tsx` | Funcionando |
| 10.2a Fila de notificações | #5 | `migrations/0132_create_mercadolivre_notificacoes.js`, `hooks/mercadolivre_notificacoes.js` | Recebendo cerca de 100 avisos/hora. **Só grava como "Pendente"; ninguém processa nem limpa** |
| 10.5a Auditoria de anúncios (somente leitura) | #6 | `hooks/mercadolivre_auditoria.js`, `src/components/mercadolivre/AuditoriaAnuncios.tsx` | Funcionando; leu os 1.150 anúncios |

Rotas (`/backend/v1/mercadolivre/...`): `diagnostico`, `conexao/iniciar`, `oauth/callback`, `conexao/status`, `conexao/testar`, `conexao/desconectar`, `notificacoes` (POST público, webhook), `notificacoes/diagnostico`, `anuncios/auditoria?empresa_id=&offset=&limite=`. Cron `mercadolivre_renovar_tokens` a cada 30 minutos.

Coleções: `mercadolivre_contas` (uma por empresa; tokens), `mercadolivre_oauth_estados`, `mercadolivre_notificacoes` (campos: `notificacao_id`, `topico`, `recurso`, `ml_user_id`, `status`, `conteudo`, `recebida_em`, `processada_em`, `erro` etc.).

Fatos técnicos do Mercado Livre:

- OAuth 2.0; o access token dura 6 horas; o refresh token é de **uso único** (a cada renovação vem um novo, que precisa ser gravado).
- O webhook exige resposta 200 em até 500 ms. Por isso a rota só grava na fila; o processamento tem de ser separado.
- A conta está no modelo **User Products**: um anúncio (MLB) por variação, agrupados por família.
- **O SKU gravado nos anúncios é o código do produto na Tray**, não a matrícula do Uniplus.
- A integração direta não tem custo cobrado pelo Mercado Livre.

## 6. Tray — o que está pronto

A Tray liberou o aplicativo para homologação (chamado **#2115452**; prazo de homologação de 120 dias, até por volta de 10/03/2027). Segredos no Skip: `TRAY_CONSUMER_KEY`, `TRAY_CONSUMER_SECRET`.

| Parte | PRs | Arquivos | Situação |
|---|---|---|---|
| 11.1 Conexão, renovação e tela | #7, #8, #9, #10 | `migrations/0133_create_tray_conexao.js`, `hooks/tray_conexao.js`, `src/services/tray.ts`, `src/pages/configuracoes/TrayPage.tsx` (rota `/configuracoes/tray`), `docs/TRAY.md` | Funcionando. Loja 02 conectada à **loja de testes** |
| 11.2 Conferência de produtos (somente leitura) | #11 | `hooks/tray_produtos.js`, `src/components/tray/ConferenciaProdutosTray.tsx` | Funcionando; leu produtos da loja de testes |

Rotas (`/backend/v1/tray/...`): `diagnostico`, `conexao/iniciar`, `oauth/callback`, `conexao/status`, `conexao/testar`, `conexao/desconectar`, `produtos/conferencia?empresa_id=&pagina=&limite=`. Cron `tray_renovar_tokens` a cada 30 minutos.

Coleções: `tray_contas` (uma por empresa: `loja_host`, `api_address`, `store_id`, `loja_nome`, tokens, validades, `status`) e `tray_oauth_estados`.

Fatos técnicos da Tray:

- Autorização: `https://{loja}/auth.php?response_type=code&consumer_key=...&callback=...`. A Tray chama o callback com `code`, `api_address` e `store`.
- **`api_address` é um host da própria Tray** (ex.: `mcadl04b.commercesuite.com.br/web_api`), diferente do endereço da loja. O callback só aceita domínios da Tray (`.commercesuite.com.br`, `.tray.com.br`, `.corpsuite.com.br`), porque as chaves do aplicativo são enviadas para esse endereço.
- Troca do `code`: `POST {api_address}/auth` (consumer_key, consumer_secret, code). Access token dura 3 horas; refresh token, 30 dias. Renovação: `GET {api_address}/auth?refresh_token=`.
- Produtos: `GET {api}/products?limit=&page=&access_token=`; variações: `GET {api}/products/variants?product_id=`. Limite de 180 requisições por minuto.
- A loja conectada hoje é a **loja de testes** `lojatesteintegracaotray01.corpsuite.com.br` (código 1501140), com 2.000 produtos de demonstração da Tray (aquarismo). Eles **não** são da Hospital Home e nada foi gravado no cadastro do Trevvo.
- Houve um erro HTTP 403 na troca do `code`. Foi resolvido depois de o Skip recarregar o backend com o PR #10 (que adicionou o `User-Agent`) e fazer diagnósticos de rede próprios. A causa exata não ficou registrada neste chat; se voltar, consultar o histórico do Skip de 13/11/2026.
- A leitura de **variações** ainda não foi validada com dados reais: os 110 produtos lidos na loja de testes não tinham variação.

Aguardando a Tray: no chamado #2115452 foi perguntado se o aplicativo pode ser instalado na loja de produção (`lojahospitalhome.com.br`) antes da homologação e o que falta para homologar. Para conectar a loja real: tela Tray → Desconectar → digitar `lojahospitalhome.com.br` → Conectar. A conexão é uma por empresa, então substitui a loja de testes.

## 7. A cadeia de códigos (ponto central do projeto)

```
Anúncio no Mercado Livre (MLB)
   └─ SKU do anúncio = código Tray: "produto" ou "produto_variação" (ex.: 10039_5757)
        └─ na Tray, campo "Referência" = matrícula do produto no Uniplus
             └─ no Trevvo: produtos.referencia = matrícula do Uniplus
```

- No Uniplus, **cada variação tem matrícula própria**.
- **Causa provável da troca de variação (M vira G)**: na Tray, a referência do produto pai é igual à da primeira variação, e os relatórios da Tray só trazem a matrícula do pai. A conferência 11.2 já aponta isso com a situação "Referência repetida entre variações".
- Números levantados nos relatórios da Tray: 1.150 anúncios no Mercado Livre; 167 anúncios "não relacionados" (166 pausados; o dono **não tem interesse** em relacioná-los, são antigos); **97 produtos pai com variação, somando 207 anúncios vivos de variação**, para os quais falta a matrícula por variação.
- Formas de obter a matrícula por variação: (a) ler a loja real pela API da Tray, se o aplicativo puder ser instalado nela; (b) técnico do Uniplus; (c) coleta manual no painel da Tray.

## 8. Decisões de desenho já tomadas

- **Tabela de vínculos** em vez de um campo "código Tray" no produto: produto do Trevvo ↔ canal (Mercado Livre, Tray, Shopee, Amazon) ↔ código externo ↔ variação ↔ unidades por venda (kits). Serve a todos os canais.
- **Chave "somente leitura" por empresa** e por canal, ligada até o dia da virada.
- Na virada, o dono ainda vai decidir: manter os SKUs atuais dos anúncios (código Tray) ou regravar com a matrícula do Uniplus.

## 9. Importação do Uniplus (em andamento no outro chat) — cuidados para as integrações

1. `produtos.referencia` deve receber a **matrícula do Uniplus**, exatamente como está lá (sem zeros a mais, sem espaços).
2. **Cada variação vira um produto próprio**, com sua matrícula. Se variações forem juntadas, a troca de matrícula volta.
3. A referência **não pode se repetir** dentro do assinante. Matrículas duplicadas devem gerar aviso, não gravação.
4. Importar o **custo** do produto: ele é a base da tela de margem por canal.

## 10. O que falta, na ordem sugerida

Não dependem de nada externo:

1. **Tabela de vínculos + chave "somente leitura"** (migration, hook e tela). O preenchimento automático roda depois da importação de produtos.
2. **10.2b Processamento e limpeza da fila de avisos do Mercado Livre** (cron que lê os "Pendente", trata por tópico e apaga os antigos). A fila cresce sem limpeza.

Dependem da importação de produtos:

3. Vínculo automático dos produtos sem variação (código Tray → referência → produto), usando os relatórios da Tray já fornecidos.
4. Nova rodada da auditoria dos 1.150 anúncios, usando os vínculos e filtrando só anúncios vivos.
5. **Tela "Margem por canal"**: preço − comissão − frete − imposto − custo, com alerta abaixo da margem mínima. É conta, não precisa de IA. O Mercado Livre informa tarifas pela API; Shopee e Amazon a confirmar.

Dependem dos vínculos:

6. 10.3 Pedidos do Mercado Livre → Trevvo.
7. 10.4 NF-e e etiqueta.
8. 10.5 Estoque e preço (o Trevvo passa a mandar no estoque dos anúncios).
9. 10.6 Publicação, perguntas e mensagens.

Dependem da Tray: conectar a loja real e ler as variações (item 7 acima, forma "a").

## 11. Shopee e Amazon (não iniciadas)

- O dono já vende nas duas pelo CNPJ da loja 02, hoje via Tray.
- **Amazon (SP-API)**: caminho de "aplicativo privado" (serve só à própria empresa). Exige conta de vendas no plano profissional, verificação de identidade do desenvolvedor e um perfil de desenvolvedor (contatos, dados solicitados, caso de uso e segurança), que a Amazon analisa. Para vender o Trevvo a terceiros será preciso migrar para aplicativo público. Fonte: developer.amazonservices.com (páginas em português).
- **Shopee**: cadastro na Shopee Open Platform (open.shopee.com), separado da Central do Vendedor. As regras atuais **não foram confirmadas**; ficou combinado o dono abrir o site com a conta da loja e mandar um print da tela de cadastro.
- Pendência do dono: conferir o plano na Amazon, iniciar o registro de desenvolvedor e mandar o print da Shopee.

## 12. Ideia futura: Claude dentro do Trevvo

Chamar o Claude pela API da Anthropic a partir do backend (chave nos Segredos do Skip; cobrança por uso, separada da assinatura do Claude). O Trevvo junta os dados (custo, preço, tarifas, estoque, vendas), o Claude devolve sugestões com justificativa (preço, pausa, respostas a compradores, textos de anúncio), o dono aprova na tela e o Trevvo executa. Ações automáticas só depois, dentro de limites fixos. Os números da margem continuam calculados pelo Trevvo. Documentação: https://docs.claude.com.

## 13. Materiais de apoio

- `docs/MERCADO_LIVRE.md` e `docs/TRAY.md` no repositório: detalhes de cada rota e fluxo.
- Planilha "Anúncios não relacionados – Mercado Livre (Hospital Home)" (167 linhas): https://claude.ai/artifact/YK9BtaguxX23uzkURG9WGh
- Relatórios da Tray (PDF de produtos com código e referência; CSV de anúncios do Mercado Livre): estão com o dono; reenviar ao novo chat quando for fazer o vínculo automático.
- Histórico dos PRs #1 a #11 no GitHub (todos mesclados), com a descrição de cada etapa.
