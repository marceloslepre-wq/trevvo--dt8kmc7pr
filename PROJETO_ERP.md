# Regras do ERP

## Idioma e formatos

- Interface 100% em português do Brasil.
- Moeda: R$ 1.234,56. Datas: dd/mm/aaaa na tela, ISO no banco.
- Casas decimais: valores em dinheiro 2; quantidades 4; custo e preço unitário 4; percentuais e alíquotas 4.
- Máscaras: CPF 000.000.000-00; CNPJ 00.000.000/0000-00 (aceitar letras nas 12 primeiras posições, CNPJ alfanumérico); CEP 00000-000; telefone (00) 0000-0000 ou (00) 00000-0000; NCM 0000.00.00; CEST 00.000.00; CFOP 0.000.

## Nomes

- Tabelas e campos em português, snake_case, sem acento (ex.: razao_social).
- Nunca renomear tabelas ou campos já criados sem eu pedir.

## Campos padrão em toda tabela

- id, ativo (boolean, padrão true), created_at, updated_at, created_by, updated_by.
- Registros não são excluídos fisicamente quando já foram usados em outro lugar: o botão "Excluir" inativa (ativo = false). Exclusão física só para registros nunca usados.

## Multiempresa

- A tabela empresas guarda matriz e filiais (cada uma com o seu CNPJ).
- Cadastros (clientes, fornecedores, produtos, marcas, grupos, categorias) são compartilhados por todas as empresas.
- Tabelas de movimento (estoque, notas, financeiro, vendas) sempre terão empresa_id e só mostram dados da empresa ativa.
- O usuário escolhe a empresa ativa num seletor no topo da tela, entre as empresas que ele tem permissão.

## Padrão de telas

- Listagem: título, botão "Novo", busca por texto, filtros, coluna de situação (ativo/inativo), paginação de 20 itens, ordenação por coluna, exportar CSV, ações Editar e Inativar.
- Formulário: abas quando houver muitos campos, campos obrigatórios com asterisco, validação na tela com mensagem clara, botões Salvar e Cancelar, aviso de alterações não salvas.
- Confirmação antes de inativar ou excluir.
- Mensagens de sucesso e erro em toast.
- Layout responsivo, mas pensado primeiro para desktop.

## Validações brasileiras

- CPF: 11 dígitos com dígitos verificadores (módulo 11). Rejeitar sequências repetidas.
- CNPJ: 14 posições; as 12 primeiras podem ser letras maiúsculas ou números e as 2 últimas são dígitos verificadores. Cálculo do DV: converter cada caractere para (código ASCII - 48), aplicar os pesos do CNPJ (5,4,3,2,9,8,7,6,5,4,3,2 para o 1º DV e 6,5,4,3,2,9,8,7,6,5,4,3,2 para o 2º), soma módulo 11; resto menor que 2 vira 0, senão 11 - resto. Funciona para CNPJ numérico e alfanumérico.
- Inscrição Estadual: aceitar "ISENTO". Para UF ES, validar 9 dígitos com dígito verificador (módulo 11, pesos 9 a 2).
- E-mail com formato válido.
- CEP: ao digitar 8 dígitos, buscar endereço em https://viacep.com.br/ws/{cep}/json/ e preencher logradouro, bairro, cidade, UF e código IBGE do município.
- CNPJ: botão "Consultar CNPJ" que busca em https://brasilapi.com.br/api/cnpj/v1/{cnpj} e preencher razão social, nome fantasia, endereço e CNAE (quando o CNPJ for numérico).
- CPF: consulta de dados de pessoa física no cadastro de clientes (/cadastros/clientes) integrada ao serviço apicpf.dev via endpoint seguro no backend (`GET /backend/v1/cadastros/consulta-cpf?cpf={numeros}`). Ao sair do campo (onBlur) com 11 dígitos válidos, preenche automaticamente nome e data de nascimento (ambos editáveis). A chave da API é configurada na variável de ambiente `APICPF_DEV_KEY` ($os.getenv). Se não configurada, o backend retorna HTTP 400 com mensagem clara em português sem travar a tela ou o formulário manual.

## Permissões

- Toda tela e ação respeita a matriz de permissões do perfil do usuário (ver, criar, editar, excluir por módulo).
- Usuário sem permissão não vê o item no menu e recebe "Acesso negado" se abrir a URL.

### Como usar o hook de verificação de permissões (`usePermissoes`)

O hook `usePermissoes` (`@/contexts/PermissoesContext`) provê a checagem reativa de privilégios para componentes e telas do ERP:

```tsx
import { usePermissoes } from '@/contexts/PermissoesContext'

export const MinhaTela = () => {
  const { pode, administrador, usuarioERP, perfil } = usePermissoes()

  // pode(modulo, acao)
  // modulo: 'painel' | 'empresas' | 'usuarios' | 'perfis_acesso' | 'clientes' | 'fornecedores' | ...
  // acao: 'ver' | 'criar' | 'editar' | 'excluir'
  const podeCriar = pode('clientes', 'criar')
  const podeEditar = pode('clientes', 'editar')
  const podeExcluir = pode('clientes', 'excluir')

  return (
    <div>
      {podeCriar && <Button>Novo Cliente</Button>}
      {/* ... */}
    </div>
  )
}
```

Para proteger páginas inteiras no roteador ou blocos de interface:

```tsx
import PermissaoGuard from '@/components/PermissaoGuard'
;<PermissaoGuard modulo="clientes" acao="ver">
  <ClientesLista />
</PermissaoGuard>
```

Se o usuário não tiver permissão `pode_ver`, o guard renderiza automaticamente a tela amigável de `AcessoNegado`.
Se o perfil possuir `administrador = true` (ou for o usuário master administrador inicial), o método `pode` retorna `true` para todas as ações e módulos.

## Auditoria

- Inclusões, alterações e inativações de cadastros gravam em logs_auditoria: usuário, data/hora, tabela, registro, ação, valores antes e depois.

## Fiscal

- Nenhuma alíquota fica fixa no código: tudo vem de cadastro.
- Códigos fiscais (CST, CSOSN, CFOP, NCM, CEST, origem) sempre validados contra as tabelas fiscais do sistema.

### Como usar o componente SelectCodigoFiscal (`<SelectCodigoFiscal />`)

O componente `@/components/SelectCodigoFiscal` provê um combobox com busca e seleção amigável dos códigos fiscais cadastrados na tabela `tabelas_fiscais_codigos`, exibindo `"codigo - descricao"`:

```tsx
import { SelectCodigoFiscal } from '@/components/SelectCodigoFiscal'

// Exemplo em formulário de produtos ou regras fiscais:
<SelectCodigoFiscal
  tipo="CST_ICMS"
  value={cstIcms}
  onChange={(codigo, item) => {
    setCstIcms(codigo)
    console.log('Item selecionado:', item?.descricao)
  }}
  placeholder="Selecione o CST do ICMS..."
/>

<SelectCodigoFiscal
  tipo="CSOSN"
  value={csosn}
  onChange={(codigo) => setCsosn(codigo)}
/>

<SelectCodigoFiscal
  tipo="ORIGEM"
  value={origem}
  onChange={(codigo) => setOrigem(codigo)}
/>
```

Tipos disponíveis padrão: `ORIGEM`, `CST_ICMS`, `CSOSN`, `MOD_BC_ICMS`, `MOD_BC_ICMS_ST`, `CST_IPI`, `CST_PIS_COFINS`, `TIPO_ITEM_SPED`, `CRT`, `IND_IE_DEST`, `CST_IBS_CBS`, `CCLASSTRIB`.

### Como usar os componentes SelectNcm, SelectCest e SelectCfop

Para cadastros de produtos, notas fiscais e regras fiscais:

#### 1. SelectNcm (`<SelectNcm />`)

Combobox com busca por código (com ou sem pontos) e descrição, exibindo `"código - descrição"`:

```tsx
import { SelectNcm } from '@/components/SelectNcm'
;<SelectNcm
  value={ncmCodigo}
  onChange={(codigo, item) => {
    setNcmCodigo(codigo)
    console.log('NCM selecionada:', item?.descricao)
  }}
  placeholder="Selecione ou busque a NCM..."
/>
```

#### 2. SelectCest (`<SelectCest />`)

Combobox com busca por código CEST, NCMs vinculados e descrição. Permite vincular a uma NCM para sugestão automática:

```tsx
import { SelectCest } from '@/components/SelectCest'
;<SelectCest
  value={cestCodigo}
  ncmVinculado={ncmCodigo} // opcional: filtra/sugere CESTs compatíveis com a NCM informada
  onChange={(codigo, item) => setCestCodigo(codigo)}
  placeholder="Selecione o CEST..."
/>
```

#### 3. SelectCfop (`<SelectCfop />`)

Combobox com busca por código e descrição. Aceita filtro por `tipoMovimento` ("Entrada" ou "Saída"):

```tsx
import { SelectCfop } from '@/components/SelectCfop'
;<SelectCfop
  tipoMovimento="Saída" // "Entrada", "Saída" ou "todos"
  value={cfopCodigo}
  onChange={(codigo, item) => setCfopCodigo(codigo)}
  placeholder="Selecione o CFOP de saída..."
/>
```

#### 4. Função `sugerirCestPorNcm(ncm)`

Função reutilizável de `@/services/cest` que busca todos os CESTs ativos cujo `ncm_codigos` contém o NCM exato ou um prefixo compatível:

```tsx
import { sugerirCestPorNcm } from '@/services/cest'

const cestsSugeridos = await sugerirCestPorNcm('22021000')
```

### Motor Fiscal e Matriz Interestadual

Documentação do motor central de inteligência fiscal (`sugerirTributacao`) e cálculo de ICMS interestadual (`aliquotaInterestadual`).

#### 1. Motor Central de Sugestão Fiscal: `sugerirTributacao(params)` (`@/services/motorFiscal.ts`)

Centraliza toda a inteligência tributária para classificação fiscal automática de produtos no ERP a partir do XML da NF-e ou de produto existente.

**Assinatura:**

```ts
sugerirTributacao(params: {
  itemXml?: Partial<ItemXmlParsed> | null
  empresa: Partial<Empresa>
  produtoExistente?: Partial<Produto> | null
  tipoEntrada?: string
  ufFornecedor?: string
}): Promise<SugestaoFiscalResultado>
```

_(O parâmetro `itemXml` é opcional, permitindo invocar a sugestão a partir de um produto existente ou de NCM avulso)._

**Etapas de decisão:**

- **Etapa A (Regra por NCM — Confiança Alta):** Busca a melhor regra cadastrada na tabela `regras_fiscais_ncm` que case com a UF da empresa e regime tributário. O prefixo de NCM mais longo vence (`prefA.length - prefB.length`); em caso de empate no comprimento, vence a de maior prioridade (`b.prioridade - a.prioridade`). Carrega o `perfil_tributario_id` vinculado e suas regras dos 8 cenários (`extrairCamposFiscaisDoPerfil`).
- **Etapa B (Produto semelhante já revisado — Confiança Alta):** Se não houver regra em A, busca na tabela `produtos` outro item com mesmo NCM (e mesmo CEST, quando houver) que possua `fiscal_revisado = true` e `ativo = true`. Herda todos os campos tributários já homologados por auditor fiscal.
- **Etapa C (Dedução pelo XML — Confiança Média/Baixa):**
  - **Substituição Tributária (ST):** Detectada se o item da NF-e possuir CST `10`, `30`, `60` ou `70`; CSOSN `201`, `202`, `203` ou `500`; ou CFOP `5401`, `5403`, `5405`, `6401`, `6403` ou `6404`. Se ST: Simples usa CSOSN `500`; Regime Normal usa CST `60`; CFOP interno `5405` e interestadual `6404`. Se compra interestadual com ST, alerta para confirmação de recolhimento na entrada e define confiança como "Baixa".
  - **Tributação integral:** CST `00` ou `20` (com redução). Simples Nacional adota o `csosn_padrao_tributado` configurado em `config_fiscal_empresa` (`101` ou `102`). Regime normal adota CST `00` com `aliquota_icms_interna_padrao` e FCP da empresa (ou `20` quando o fornecedor tributou com redução). CFOP de venda sugerido: `5101`/`6101` para industrialização ou `5102`/`6102` para revenda.
  - **Isento / Não tributado:** CST `40`/`41` ou CSOSN `400` (alerta de atenção que isenção do fornecedor nem sempre vale para saída).
  - **Conversão de Origem da Mercadoria:** Aplica conversão para o mercado nacional: `1 → 2` (estrangeira importação direta vira adquirida no mercado interno) e `6 → 7` (importação direta sem similar nacional vira adquirida no mercado interno).
  - **CEST:** Aproveita o do XML ou infere via `sugerirCestPorNcm(ncm)`.
  - **PIS e COFINS:** Monofásico (fornecedor CST `04` ou `05`) → saída `04` e entrada `70`; Alíquota zero (CST `06`) → saída `06` e entrada `73`; Simples Nacional → saída `49` e entrada `98`; Regime Normal Cumulativo → saída `01` (0,65% / 3,00%) e entrada `70`; Regime Normal Não Cumulativo → saída `01` (1,65% / 7,60%) e entrada `50`.
  - **IPI:** Não contribuinte → saída `53` e entrada `49` (enquadramento `999`); Contribuinte → CST `50` com alíquota oficial herdada da tabela `ncm`.
  - **IBS/CBS (Reforma Tributária):** Copiado do XML do fornecedor (`cst_ibs_cbs` e `c_class_trib`) ou inicializado com o padrão provisório `000` / `000001`.
  - **Tipo de item no SPED:** Mapeado automaticamente pelo `tipo_entrada`: Compra para revenda → `00`; Compra para industrialização → `01`; Uso e consumo → `07`; Ativo imobilizado → `08`.
  - **Vínculo com Perfil Tributário:** Procura e vincula automaticamente um perfil cadastrado em `perfis_tributarios` que possua regra interna compatível com o CST e CFOP apurados.
- **Etapa D (Classificar manualmente — Confiança Baixa):** Caso não haja dados suficientes para automatizar, sugere preenchimento manual guiado.

**Retorno:** Objeto com `confianca` ("Alta" | "Média" | "Baixa"), `motivoGeral`, array de `avisos`, dicionário `campos` sugeridos e `motivosPorCampo` indicando a justificativa fiscal de cada campo.
**Nota de uso:** Utilizado na conferência de notas de entrada (Etapa 3) e na emissão de notas fiscais de saída (Etapa 6).

#### 2. Função `aliquotaInterestadual(ufOrigem, ufDestino, origemMercadoria)` (`@/services/icmsMatriz.ts`)

Calcula a alíquota aplicável de ICMS entre quaisquer duas Unidades Federativas do Brasil ou na operação interna.

**Regras aplicadas:**

1. **UFs iguais (`ufOrigem === ufDestino`):** Operação interna; retorna a alíquota interna da UF cadastrada em `icms_aliquotas_uf` (ou 17% como fallback padrão).
2. **Mercadoria importada (`origemMercadoria` em `1`, `2`, `3` ou `8`):** Retorna taxa fixa de 4% em cumprimento à Resolução do Senado Federal nº 13/2012.
3. **Demais operações interestaduais:** Consulta o par `(uf_origem, uf_destino)` na tabela `icms_interestadual`. Se não cadastrado, adota a regra geral da Resolução do Senado nº 22/1989 (7% para saídas de SP/RJ/MG/PR/SC/RS com destino às regiões Norte, Nordeste, Centro-Oeste e ES; 12% para os demais fluxos).

**Nota de uso:** Utilizada na conferência da nota de entrada (comparação de alíquota esperada vs. destacada) e mandatória na emissão de notas de saída interestaduais (Etapa 6).

### Como usar os componentes SelectMarca e SelectGrupoCategoria

Para formulários de produtos e regras mercadológicas:

#### 1. SelectMarca (`<SelectMarca />`)

Combobox com busca rápida por nome de marca ou fabricante, exibindo o botão **"+ Nova marca"** no rodapé para cadastrar uma nova marca via modal imediatamente sem sair do formulário:

```tsx
import { SelectMarca } from '@/components/SelectMarca'
;<SelectMarca
  value={marcaId}
  onChange={(id, marca) => {
    setMarcaId(id)
    console.log('Marca selecionada:', marca?.nome)
  }}
  placeholder="Selecione a marca do produto..."
/>
```

#### 2. SelectGrupoCategoria (`<SelectGrupoCategoria />`)

Seleção encadeada (Grupo Nível 1 → Categoria Nível 2). Ao selecionar ou trocar o grupo, a lista de categorias é automaticamente recarregada e filtrada apenas com as categorias ativas pertencentes àquele grupo:

```tsx
import { SelectGrupoCategoria } from '@/components/SelectGrupoCategoria'
;<SelectGrupoCategoria
  grupoId={grupoId}
  categoriaId={categoriaId}
  onGrupoChange={(novoGrupoId, grupo) => {
    setGrupoId(novoGrupoId)
    console.log('Grupo alterado:', grupo?.nome)
  }}
  onCategoriaChange={(novaCategoriaId, categoria) => {
    setCategoriaId(novaCategoriaId)
    console.log('Categoria alterada:', categoria?.nome)
  }}
  requiredGrupo
  layout="horizontal" // ou "vertical"
/>
```

## Tabelas

(acrescentar aqui cada tabela criada, com seus campos)

### master_impersonacoes

Tabela de sessão transitória de suporte/impersonação do usuário Master no ERP SaaS (Etapa 9 Multi-tenant - Prompt 9.7b2, Migration 0084). Registra quando o usuário master (`users.tipo = 'master'`) assume a visão operacional de um cliente assinante específico para prestação de suporte técnico pontual (Modo Master). Regras de segurança estritas: acesso totalmente bloqueado para o navegador (`listRule: null`, `viewRule: null`, `createRule: null`, `updateRule: null`, `deleteRule: null`), operada exclusivamente pelo backend através dos endpoints `/backend/v1/master/suporte/entrar` e `/backend/v1/master/suporte/sair` (`master_rotas.js` e `master_lib.js`). Possui índice único por `user_id`.

- id (text, PK)
- user_id (relation -> users, obrigatório, usuário master em sessão de suporte, índice único)
- assinante_id (relation -> assinantes, obrigatório, assinante cliente sob suporte)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `user_id` (único: `idx_master_impersonacoes_user`), `assinante_id` (`idx_master_impersonacoes_ass`).

### config_master

Tabela de parametrização e configuração do Painel Master Multi-tenant (Etapa 9 Multi-tenant - Prompt 9.7a, Migration 0081). Registro único gerenciado exclusivamente pelo usuário master do SaaS (`users.tipo = 'master'`). Define regras globais de governança, período padrão de trial e limites padrão de novos clientes. Acesso à coleção totalmente restrito ao usuário master tanto para leitura quanto para gravação (`listRule`, `viewRule`, `createRule`, `updateRule` com `@request.auth.id != '' && @request.auth.tipo = 'master'`; `deleteRule: null`).

- id (text, PK)
- dias_trial (number, quantidade de dias corridos concedidos por padrão a novos assinantes em período de teste, padrão 15)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### licencas_eventos

Tabela de auditoria e linha do tempo de eventos de ciclo de vida das licenças dos clientes do SaaS (Etapa 9 Multi-tenant - Prompt 9.7a, Migration 0081). Registra criação, ativação de trial, renovações de prazo (+30 dias), reativações, mudanças de plano comercial, pausas temporárias, expirações e edições manuais de vigência/limites. Regras de segurança estritas: leitura liberada para o usuário master ou para o próprio assinante titular da licença (`@request.auth.id != '' && (@request.auth.tipo = 'master' || assinante_id = @request.auth.assinante_id)`); criação, edição e exclusão 100% restritas ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`), gravadas exclusivamente pelos endpoints de gestão do Master (`/backend/v1/master/*`).

- id (text, PK)
- assinante_id (relation -> assinantes, obrigatório, cascadeDelete: false)
- numero_licenca (text, identificador legível da licença, ex.: "HH-RFR8HF", obrigatório)
- tipo (select: "Criação" | "Trial" | "Renovação +30d" | "Reativação" | "Mudança de plano" | "Pausa" | "Expiração" | "Edição", obrigatório)
- plano_id (relation -> planos_catalogo, opcional)
- validade_ate (text, data ISO de validade da licença após o evento)
- descricao (text, histórico detalhado, justificativa ou notas do evento)
- criado_por (relation -> users, usuário responsável pelo evento ou nulo para rotinas automáticas)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `assinante_id` (`idx_licencas_eventos_ass`), `numero_licenca` (`idx_licencas_eventos_lic`), `tipo` (`idx_licencas_eventos_tipo`).

### planos_catalogo

Tabela de catálogo comercial de planos de assinatura do ERP SaaS (Etapa 9 Multi-tenant - Prompt 9.7a, Migration 0081). Define as faixas de precificação, capacidades estruturais (limite de empresas filiais e limite de usuários), recursos fiscais autorizados (NF-e mod 55, NFC-e mod 65 e EFD SPED Fiscal) e planos especiais (ex: "Plano Master", isento e ilimitado para o proprietário do SaaS). Regras de segurança globais: leitura liberada para planos ativos e não exclusivos do master para todos os usuários autenticados, ou visualização irrestrita pelo master (`@request.auth.id != '' && ((exclusivo_master = false && ativo = true) || @request.auth.tipo = 'master')`); criação, alteração e exclusão exclusivas do usuário master (`@request.auth.id != '' && @request.auth.tipo = 'master'`).

- id (text, PK)
- nome (text, nome do plano comercial, ex.: "Básico", "Profissional", "Completo", "Plano Master", obrigatório)
- etiqueta (text, badge de destaque, ex.: "Essencial", "Recomendado", "Enterprise", "Exclusivo Master")
- descricao (text, apresentação comercial e escopo do plano)
- valor_mensal (number, mensalidade em R$; 0 = isento/gratuito)
- limite_empresas (number, quantidade máxima de empresas/filiais permitidas; 0 = ilimitado)
- limite_usuarios (number, quantidade máxima de usuários ativos permitidos; 0/vazio = ilimitado)
- permite_nfe (bool, habilita emissão de NF-e modelo 55)
- permite_nfce (bool, habilita emissão de NFC-e modelo 65 no PDV)
- permite_sped (bool, habilita geração do SPED Fiscal ICMS/IPI)
- exclusivo_master (bool, flag que restringe a visibilidade e uso exclusivamente ao dono do SaaS)
- ativo (bool, indicador de disponibilidade comercial do plano)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `ativo` (`idx_planos_catalogo_ativo`), `exclusivo_master` (`idx_planos_catalogo_exclusivo`).

### credenciais_fiscais

Tabela de armazenamento seguro de credenciais fiscais da Focus NFe por empresa emissora (Etapa 9 Multi-tenant - 9.6, Migration 0080). Permite que cada filial/matriz ou assinante configure tokens próprios da Focus NFe (`token_homologacao` e `token_producao`) e mantenha um segredo aleatório exclusivo de webhook (`webhook_secret`) para validação criptográfica HMAC/Bearer de callbacks recebidos por empresa. Acesso totalmente bloqueado para a API do navegador (`listRule: null`, `viewRule: null`, `createRule: null`, `updateRule: null`, `deleteRule: null`), operada exclusivamente pelo backend via pb_hooks (`fiscal_credenciais_rotas.js`, `fiscal_token_lib.js`, `fiscal_webhook_focus.js`). As rotas públicas e autenticadas nunca expõem os tokens completos (somente os 4 últimos dígitos ou status booleano). Possui fallback automático para segredos de ambiente do Skip Cloud ($os.getenv) caso nenhum token esteja gravado na coleção. Possui índice único por `empresa_id`.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete: true, índice único)
- token_homologacao (text, token de autenticação da Focus NFe no ambiente de Homologação)
- token_producao (text, token de autenticação da Focus NFe no ambiente de Produção)
- webhook_secret (text, segredo gerado de 32 caracteres para validação de cabeçalho Authorization nos webhooks)
- atualizado_por (relation -> users, usuário administrador responsável pela última alteração)
- atualizado_em (text, data/hora ISO da última gravação)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (único: `idx_credenciais_fiscais_empresa`).

### sequencias

Tabela central de controle de numeração atômica sequencial por assinante e empresa (Etapa 9 Multi-tenant - 9.5b, Migration 0074/0077). Mantém os contadores sequenciais de movimentos (`vendas`, `inventarios`, `pedidos_compra`, `transferencias`) e cadastros (`produtos`, `clientes`, `fornecedores`, `condicoes_pagamento`, `empresas`). Acesso totalmente bloqueado para o navegador (`listRule: null`, `viewRule: null`, `createRule: null`, `updateRule: null`, `deleteRule: null`), sendo gerida e incrementada exclusivamente no servidor pelo backend (`pb_hooks`) através do módulo `numeracao_lib.js`. Possui índice único composto por `(assinante_id, empresa_id, tipo)`.

- id (text, PK)
- assinante_id (relation -> assinantes, obrigatório, cascadeDelete: false)
- empresa_id (relation -> empresas, opcional — preenchido para numeração por empresa e nulo/vazio para cadastros globais do assinante)
- tipo (text, obrigatório: "vendas" | "inventarios" | "pedidos_compra" | "transferencias" | "codigo_produtos" | "codigo_clientes" | "codigo_fornecedores" | "codigo_condicoes_pagamento" | "codigo_empresas")
- ultimo_numero (number, último número gerado e consumido; required: false para permitir o valor 0 inicial)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `(assinante_id, empresa_id, tipo)` (único: `idx_sequencias_chave`).

### assinantes

Tabela de registro e controle de assinantes do ERP SaaS (Etapa 9 Multi-tenant, Migration 0061/0062). O assinante é o cliente do SaaS — representa a conta corporativa que agrupa as empresas (matriz e filiais) do cliente. Todas as coleções de cadastro possuem `assinante_id` e todas as coleções de movimento continuam com `empresa_id` (onde cada empresa pertence a um `assinante_id`). O campo chama-se `assinante_id`, nunca `cliente_id` (pois `cliente_id` é o cliente de venda do ERP). Acesso restrito ao backend e ao usuário com `users.tipo = 'master'`: leitura/visualização e atualização restritas a master (`@request.auth.tipo = 'master'`); criação e exclusão bloqueadas via SDK do navegador (`createRule: null`, `deleteRule: null`), operadas exclusivamente pelo backend.

- id (text, PK)
- numero_licenca (text, identificador legível exclusivo da licença do assinante, ex.: "HH-RFR8HF", obrigatório, índice único)
- nome (text, razão social ou denominação do assinante do SaaS, obrigatório)
- documento (text, CNPJ ou CPF do titular da conta SaaS)
- email_contato (text, e-mail administrativo/financeiro principal do assinante)
- telefone (text, telefone principal de contato)
- whatsapp_contato (text, celular/WhatsApp para comunicações operacionais)
- status (select: "Trial", "Ativa", "Pausada", "Expirada", "Cancelada", obrigatório, índice)
- origem (bool, identifica o assinante de origem do dono do SaaS, ex.: HOSPITAL HOME, índice)
- plano_id (relation -> planos_catalogo, identificador do plano de contratação comercial no catálogo)
- data_inicio (text, data ISO de início da vigência da assinatura)
- data_expiracao (text, data ISO de expiração da assinatura)
- limites_personalizados (bool, indica se o assinante possui limites customizados além do plano)
- limite_usuarios (number, quantidade máxima permitida de colaboradores ativos)
- limite_empresas (number, quantidade máxima permitida de filiais/empresas cadastradas)
- observacoes (text, anotações de implantação e governança da conta SaaS)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `numero_licenca` (único: `idx_assinantes_licenca`), `status` (`idx_assinantes_status`), `origem` (`idx_assinantes_origem`).

### relatorios_salvos

Tabela de registro e controle de relatórios personalizados completos montados pelo usuário (Prompt 8.6). Guarda a definição completa da consulta: base de dados selecionada (`itens_vendidos` ou `itens_comprados`), array ordenado de agrupamentos (até 3 níveis hierárquicos), array de valores e métricas selecionadas, objeto completo de filtros aplicados (`ObjetoFiltrosRelatorio`) e tipo de gráfico configurado. Suporta compartilhamento com a empresa (`compartilhado = true`), sendo exibidos na Central de Relatórios divididos entre "Meus relatórios salvos" e "Relatórios da empresa". Regras de acesso estritas na collection: leitura permitida para o próprio autor ou quando compartilhado (`usuario_id = @request.auth.id || compartilhado = true`); criação, atualização e exclusão restritas unicamente ao proprietário do relatório (`usuario_id = @request.auth.id`). Criada na Migration 0059.

- id (text, PK)
- usuario_id (relation -> users, obrigatório, cascadeDelete, criador do relatório)
- nome (text, título amigável do relatório personalizado, obrigatório)
- descricao (text, finalidade ou notas do relatório)
- tipo (text, identificador de montador, padrão "personalizado", obrigatório)
- base (text, "itens_vendidos" ou "itens_comprados", obrigatório)
- agrupamentos (json, array de strings com até 3 níveis de agrupamento, obrigatório)
- valores (json, array de strings com as chaves de métricas ativas, obrigatório)
- filtros (json, objeto completo no formato `ObjetoFiltrosRelatorio`, obrigatório)
- tipo_grafico (text, "nenhum", "barras" ou "linhas")
- compartilhado (bool, indica se fica visível na seção "Relatórios da empresa")
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `usuario_id` (`idx_rel_salvos_usuario`), `tipo` (`idx_rel_salvos_tipo`), `compartilhado` (`idx_rel_salvos_compartilhado`).

### relatorios_filtros_salvos

Tabela de registro e controle de filtros salvos e combinações de parâmetros personalizadas para relatórios do ERP (Prompt 8.0b). Permite ao operador salvar conjuntos de filtros aplicados (empresas, períodos, produtos, clientes, vendedores, formas de pagamento, plano de contas, etc.) e reutilizá-los com um clique no botão "Meus filtros". Suporta compartilhamento com toda a equipe (`compartilhado = true`), onde o filtro compartilhado fica visível para todos os usuários com acesso ao relatório correspondente. Regras de segurança estritas na API da collection: leitura restrita aos filtros do próprio usuário autenticado ou aos filtros marcados como compartilhados (`@request.auth.id != '' && (usuario_id = @request.auth.id || compartilhado = true)`); criação permitida apenas para o próprio usuário (`usuario_id = @request.auth.id`); edição e exclusão restritas exclusivamente ao proprietário do filtro (`usuario_id = @request.auth.id`). Criada na Migration 0058.

- id (text, PK)
- usuario_id (relation -> users, obrigatório, cascadeDelete, proprietário do filtro)
- relatorio (text, identificador único do relatório no catálogo, ex.: "vendas_consultas", "estoque_posicao", obrigatório)
- nome (text, título amigável de identificação do filtro salvo, obrigatório)
- filtros (json, objeto completo no formato único `ObjetoFiltrosRelatorio`, obrigatório)
- compartilhado (bool, indica se o filtro salvo está visível para outros usuários com acesso ao relatório)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `usuario_id` (`idx_rel_filtros_usuario`), `relatorio` (`idx_rel_filtros_relatorio`), `compartilhado` (`idx_rel_filtros_compartilhado`).

### sped_ajustes_apuracao

Tabela de registro e controle de ajustes manuais da apuração do ICMS Próprio para o Registro E111 da EFD ICMS/IPI (SPED Fiscal). Utilizada para lançar benefícios fiscais estaduais (ex: COMPETE-ES Lei 10.568/2016), estornos de débito/crédito, deduções do imposto apurado e débitos especiais com códigos tabelados pela SEFAZ de cada estado (Tabela 5.1.1). Os códigos devem conter exatamente 8 dígitos alfanuméricos, onde o 4º caractere mapeia diretamente para os campos do registro E110: "0" = Outros débitos (VL_TOT_AJ_DEBITOS), "1" = Estorno de créditos (VL_ESTORNOS_CRED), "2" = Outros créditos (VL_TOT_AJ_CREDITOS), "3" = Estorno de débitos (VL_ESTORNOS_DEB), "4" = Deduções do ICMS (VL_TOT_DED), "5" = Débito especial (DEB_ESP). Permissões estritas: somente leitura pelo navegador autenticado (`listRule` e `viewRule` com `@request.auth.id != ''`); inserções, edições e exclusões restritas ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`), operadas exclusivamente pelos endpoints `/backend/v1/sped/ajustes/salvar` e `/backend/v1/sped/ajustes/excluir`, que validam perfil de Administrador (`perfis_acesso.administrador = true`) e bloqueiam alterações em períodos com arquivo Oficial já Entregue. Criada na Migration 0057.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete)
- periodo (text, formato AAAA-MM, obrigatório)
- codigo_ajuste (text, exatamente 8 caracteres, tabela 5.1.1 da SEFAZ, obrigatório)
- descricao_complementar (text, até 100 caracteres, base legal ou justificativa)
- valor (number, 2 casas decimais, obrigatório > 0)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (`idx_sped_ajustes_empresa`), `periodo` (`idx_sped_ajustes_periodo`), `codigo_ajuste` (`idx_sped_ajustes_codigo`).

### sped_arquivos

Tabela de registro e controle de arquivos da EFD ICMS/IPI (SPED Fiscal) gerados para a empresa ativa. Armazena períodos de apuração, finalidade (original ou retificadora), modo (Oficial ou Teste), status do arquivo, arquivo .txt persistido no PocketBase, contagem de registros por tipo/bloco, resumo da apuração do ICMS (débitos, créditos, saldo apurado, a recolher ou a transportar), validações de consistência do Guia Prático e dados de homologação e recibo de entrega à SEFAZ/Receita Federal. Regras de acesso estritas: somente leitura pelo navegador autenticado (`listRule` e `viewRule` com `@request.auth.id != ''`); criação e alteração 100% bloqueadas no navegador (`createRule: null`, `updateRule: null`, `deleteRule: null`), gravadas exclusivamente pelo backend, exceto a marcação como Entregue realizada pelo Administrador através do endpoint `/backend/v1/sped/marcar-entregue`.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório)
- periodo (text, formato AAAA-MM, obrigatório)
- finalidade (select: "0" original, "1" retificadora, obrigatório)
- modo (select: "Oficial", "Teste", obrigatório)
- status (select: "Gerando", "Gerado", "Gerado com erros", "Erro", "Substituído", "Entregue", obrigatório)
- arquivo (file, arquivo .txt do SPED Fiscal gerado)
- nome_arquivo (text, nome padronizado do arquivo)
- quantidade_linhas (number, total de linhas do arquivo SPED)
- contagem_registros (json: quantidade por tipo de registro, ex: 0000, C100, C170, C190, E110, H010, 9999)
- resumo_apuracao (json: débitos, créditos, saldo credor anterior, saldo apurado, ICMS a recolher, saldo credor a transportar)
- resumo_saida (json: total_nfe, total_nfce, total_canceladas, total_denegadas, total_inutilizadas, total_vl_doc, total_vl_icms)
- resumo_entrada (json: total_compras, total_transferencias, total_vl_doc, total_credito_icms — Migration 0056)
- validacoes (json: lista de { nivel: "erro" | "aviso", registro, mensagem, referencia })
- gerado_por (relation -> usuarios, usuário responsável pela geração)
- entregue_em (date, data da transmissão à Receita Federal)
- recibo_entrega (text, número do recibo oficial da entrega)
- observacoes (text, observações adicionais)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (`idx_sped_arquivos_empresa`), `periodo` (`idx_sped_arquivos_periodo`), `status` (`idx_sped_arquivos_status`), `modo` (`idx_sped_arquivos_modo`).

### config_sped_empresa

Tabela de parametrização do SPED Fiscal (EFD ICMS/IPI) por estabelecimento comercial (empresa). Possui restrição de unicidade por `empresa_id` (uma configuração fiscal do SPED por empresa/filial). Define a versão do leiaute no Guia Prático da EFD (COD_VER no registro 0000), código de receita estadual no ES e dia de vencimento para geração das obrigações no registro E116, saldo credor inicial trazido de sistema anterior no primeiro mês gerado, mês de entrega do inventário Bloco H de 31/12, conta contábil analítica de estoque (COD_CTA no H010), ativação do Bloco K de produção e inclusão opcional de notas de homologação em arquivos de teste. Regras de acesso: leitura permitida a usuários com acesso ao módulo Fiscal (`@request.auth.id != ''`); criação e edição exclusivas para Administradores do ERP (`perfis_acesso.administrador = true`).

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete, índice único)
- versao_leiaute (text, padrão "020", COD_VER do registro 0000)
- codigo_receita_icms (text, código de receita do ICMS próprio no ES usado no E116, ex: "101-5")
- dia_vencimento_icms (number, 1 a 31, dia de vencimento no registro E116)
- periodo_saldo_inicial (text, formato AAAA-MM, mês em que o saldo inicial do sistema anterior é aproveitado)
- saldo_credor_inicial (number, saldo credor vindo do sistema anterior usado só no primeiro mês gerado)
- mes_bloco_h (number, 1 a 12, padrão 2, mês em que o inventário de 31/12 entra no arquivo SPED)
- conta_contabil_estoque (text, opcional, COD_CTA do registro H010)
- gerar_bloco_k (bool, padrão false, controle da produção e do estoque)
- incluir_homologacao_em_teste (bool, padrão true, inclui notas de homologação em arquivos com modo Teste)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (único: `idx_config_sped_empresa_uid`).

### inutilizacoes

Tabela de registro e controle de pedidos de Inutilização de Numeração Fiscal de NF-e (modelo 55) e NFC-e (modelo 65) homologados ou rejeitados pela SEFAZ. Utilizada para justificar quebras de sequência numérica perante o Fisco. Permissões estritas: somente leitura pelo navegador autenticado (`listRule` e `viewRule` com `@request.auth.id != ''`); criação e alteração restritas ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`), gravadas pelo endpoint central de inutilização com vínculo à empresa emissora e ao usuário autenticado.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, filial emissora da numeração)
- modelo (select: "55" NF-e ou "65" NFC-e, obrigatório)
- serie (text, série da nota fiscal, obrigatório)
- numero_inicial (number, número sequencial inicial da faixa, obrigatório)
- numero_final (number, número sequencial final da faixa, obrigatório)
- justificativa (text, justificativa formal mínima de 15 caracteres para a SEFAZ, obrigatório)
- status (text, "Autorizada" ou "Rejeitada", padrão "Autorizada")
- protocolo (text, número do protocolo de homologação retornado pela SEFAZ)
- mensagem_sefaz (text, mensagem ou motivo retornado pela SEFAZ)
- xml_arquivo (file, arquivo XML do evento de inutilização retornado pela SEFAZ/Focus NFe)
- usuario_id (relation -> users, usuário administrador responsável pelo envio)
- data_inutilizacao (text, ISO string da homologação)
- ativo (bool, padrão true)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (`idx_inutilizacoes_empresa`), `modelo + serie` (`idx_inutilizacoes_mod_serie`), `data_inutilizacao` (`idx_inutilizacoes_data`).

### intermediadores

Tabela de intermediadores de operação e marketplaces (Mercado Livre, Shopee, Amazon, Magalu, etc.), cadastrados para atender à exigência fiscal da SEFAZ nos grupos `indIntermed` e `infIntermed` da NF-e (modelo 55) em operações não presenciais (Internet, Televendas ou Outros). Controlada por permissão `notas_saida` no frontend e gravada com vínculo ao usuário logado.

- id (text, PK)
- nome (text, razão social ou nome fantasia do marketplace/intermediador, obrigatório)
- cnpj (text, CNPJ de 14 dígitos numéricos da plataforma intermediadora, obrigatório)
- ativo (bool, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `nome` (`idx_intermediadores_nome`), `cnpj` (`idx_intermediadores_cnpj`), `ativo` (`idx_intermediadores_ativo`).

### documentos_fiscais_cartas

Tabela de registro e controle de Cartas de Correção Eletrônicas (CC-e) vinculadas a NF-e (modelo 55) autorizadas. Permissões estritas: somente leitura pelo navegador (`listRule` e `viewRule` com `@request.auth.id != ''`); inserção e alteração 100% restritas ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`), gravadas exclusivamente pelos serviços do PocketBase após homologação do evento na SEFAZ.

- id (text, PK)
- documento_id (relation -> documentos_fiscais, obrigatório, cascadeDelete)
- sequencia (number, número sequencial do evento de CC-e da nota, 1 a N)
- texto (text, texto da retificação entre 15 e 1000 caracteres, obrigatório)
- data (text, ISO string da data do evento)
- status (text, padrão "Autorizada")
- protocolo (text, número de protocolo de registro do evento retornado pela SEFAZ)
- mensagem_sefaz (text, mensagem descritiva da SEFAZ)
- xml_arquivo (file, XML autorizado do evento de Carta de Correção)
- pdf_arquivo (file, PDF oficial de comprovante da Carta de Correção)
- pdf_url (text, URL pública do PDF da CC-e na Focus NFe)
- usuario_id (relation -> users, operador responsável pelo envio da CC-e)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `documento_id` (`idx_doc_cartas_documento`), `data` (`idx_doc_cartas_data`).

### config_emissao_fiscal

Configuração e parâmetros de emissão fiscal (NF-e modelo 55 e NFC-e modelo 65) integrada à Focus NFe por empresa emissora. Possui restrição de unicidade por `empresa_id` (cada filial ou matriz tem sua parametrização e seus próprios tokens). Leitura permitida a usuários com acesso ao módulo `notas_saida`; gravação restrita exclusivamente a Administradores do ERP (`perfis_acesso.administrador = true`).

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete, índice único)
- provedor (text, padrão "Focus NFe")
- emite_documentos_fiscais (bool, padrão true; bloqueado para ativação se a empresa tiver Inscrição Estadual vazia ou ISENTO)
- emite_nfce (bool, padrão false; habilita a filial para emitir NFC-e Modelo 65 no PDV; filiais/matriz que só emitem NF-e mantêm false, ocultando campos e avisos de CSC)
- emitir_nfe_ao_enviar_transferencia (bool, padrão false; emite NF-e de transferência automaticamente ao enviar transferência de mercadoria entre filiais)
- emitir_nfe_ao_devolver_venda (bool, padrão false; emite NF-e de devolução de venda de entrada própria automaticamente ao autorizar devolução)
- codigo_token (text, letras maiúsculas, números e sublinhado; sufixo dos segredos de token; único entre as empresas emissoras; vazio = segredo padrão)
- presenca_comprador_padrao_nfe (select: "1 Presencial", "2 Internet", "3 Teleatendimento", "4 Entrega em domicílio", "9 Outros", padrão "1 Presencial")
- ambiente (select: "Homologação" ou "Produção", padrão "Homologação"; mudar para Produção exige confirmação expressa digitando "PRODUÇÃO" e grava logs_auditoria)
- serie_nfe (text, série padrão para NF-e mod 55, padrão "1")
- serie_nfce (text, série padrão para NFC-e mod 65, padrão "1")
- emitir_nfce_automaticamente_no_pdv (bool, padrão true)
- natureza_operacao_venda (text, padrão "Venda de mercadoria")
- natureza_operacao_devolucao_compra (text, padrão "Devolução de compra")
- natureza_operacao_devolucao_venda (text, padrão "Devolução de venda")
- informacoes_complementares_padrao (text, texto padrão adicionado a todas as notas fiscais emitidas pela empresa)
- enviar_email_cliente (bool, determina se a Focus NFe deve enviar automaticamente o XML e DANFE ao cliente)
- certificado_validade (date, data de expiração informada para avisos de vencimento em 30 dias ou vencido)
- csc_configurado (bool, flag marcada pelo usuário quando o CSC/IdToken for configurado no painel da Focus NFe)
- informar_ibs_cbs (bool, padrão false; ativação para destaque das tags de tributação da Reforma Tributária)
- calcular_difal_consumidor_final (bool, padrão false; ativação do cálculo do DIFAL em vendas interestaduais a consumidor final não contribuinte, grupo ICMSUFDest)
- ultimo_teste_conexao_data (date, data e hora da última chamada de teste de conexão com o provedor)
- ultimo_teste_conexao_sucesso (bool, resultado do último teste de conexão)
- ultimo_teste_conexao_mensagem (text, mensagem de retorno do último teste de conexão)
- ativo (bool, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (único: `idx_config_emissao_fiscal_empresa`), `ativo` (`idx_config_emissao_fiscal_ativo`).

### documentos_fiscais

Tabela mestre de documentos fiscais emitidos/processados (NF-e modelo 55 e NFC-e modelo 65), espelho e controle das notas enviadas e recebidas da SEFAZ via Focus NFe. Permissões estritas: somente leitura pelo navegador (`listRule` e `viewRule` autenticados); inserção, alteração e exclusão bloqueadas via SDK do cliente (`createRule: null`, `updateRule: null`, `deleteRule: null`), gravadas exclusivamente pelos serviços de backend.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, emissora da nota)
- modelo (select: "55" NF-e, "65" NFC-e, obrigatório)
- tipo_documento (number, obrigatório: 0 entrada, 1 saída)
- finalidade (number, obrigatório: 1 normal, 4 devolução)
- ambiente (select: "Homologação" ou "Produção", obrigatório)
- origem (select: "Venda", "Devolução de venda", "Devolução de compra", "Transferência", obrigatório)
- venda_id (text, opcional)
- nota_entrada_id (text, opcional)
- transferencia_id (text, opcional; vínculo com o ID da transferência entre filiais quando origem for "Transferência")
- documento_referenciado_chave (text, opcional, chave da nota referenciada em devoluções)
- referencia (text, obrigatório, identificador único enviado à Focus NFe)
- status (select: "Rascunho", "Processando", "Autorizada", "Rejeitada", "Cancelada", "Denegada", obrigatório)
- contingencia (bool)
- numero (number, número da nota retornado pela SEFAZ)
- serie (text, série da nota)
- chave_acesso (text, chave de 44 dígitos)
- protocolo (text, número de protocolo de autorização)
- data_emissao (text, ISO string)
- data_autorizacao (text, ISO string)
- status_sefaz (text, código de status SEFAZ, ex.: 100)
- mensagem_sefaz (text, mensagem descritiva retornada pela SEFAZ)
- erros (json, lista de inconsistências ou rejeições retornadas)
- presenca_comprador (text)
- intermediador_id (text, opcional)
- identificador_intermediador (text, opcional)
- natureza_operacao (text)
- cfop_principal (text)
- destinatario_nome (text)
- destinatario_cpf_cnpj (text)
- destinatario_uf (text)
- valor_produtos (number, 2 casas)
- valor_desconto (number, 2 casas)
- valor_frete (number, 2 casas)
- valor_seguro (number, 2 casas)
- valor_outras_despesas (number, 2 casas)
- base_icms (number, 2 casas)
- valor_icms (number, 2 casas)
- base_icms_st (number, 2 casas)
- valor_icms_st (number, 2 casas)
- valor_fcp (number, 2 casas)
- valor_icms_uf_destino (number, 2 casas)
- valor_fcp_uf_destino (number, 2 casas)
- valor_icms_uf_remetente (number, 2 casas)
- valor_ipi (number, 2 casas)
- valor_pis (number, 2 casas)
- valor_cofins (number, 2 casas)
- valor_ibs (number, 2 casas)
- valor_cbs (number, 2 casas)
- valor_total (number, 2 casas)
- json_enviado (json, payload plano enviado para a Focus NFe para auditoria)
- json_retorno (json, payload retornado pela Focus NFe)
- xml_arquivo (file, XML autorizado)
- danfe_url (text, URL do PDF da DANFE)
- qrcode_url (text, URL do QR Code da NFC-e)
- url_consulta (text, URL pública da SEFAZ)
- motivo_cancelamento (text)
- data_cancelamento (text)
- xml_cancelamento (file, XML do evento de cancelamento)
- usuario_emissao_id (relation -> users)
- usuario_cancelamento_id (relation -> users)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `referencia` (único: `idx_documentos_fiscais_ref`), `empresa_id`, `modelo + status`, `venda_id`, `chave_acesso`.

### documentos_fiscais_itens

Itens dos documentos fiscais emitidos/processados. Base oficial de escrituração para os registros C170 e C190 do SPED Fiscal. Permissões estritas: somente leitura pelo navegador (`listRule` e `viewRule` autenticados); criação e modificação 100% restritas ao backend.

- id (text, PK)
- documento_id (relation -> documentos_fiscais, obrigatório, cascadeDelete)
- item (number, sequencial 1 a N, obrigatório)
- produto_id (relation -> produtos, opcional)
- codigo (text)
- descricao (text, obrigatório)
- ncm (text, 8 dígitos numéricos)
- cest (text, 7 dígitos numéricos)
- cfop (text, 4 dígitos numéricos)
- unidade (text)
- quantidade (number, obrigatório)
- valor_unitario (number, obrigatório)
- valor_bruto (number, quantidade × valor_unitario)
- valor_desconto (number, desconto do item + rateio proporcional)
- valor_frete (number, rateio proporcional com ajuste no último item)
- valor_outras (number, rateio proporcional com ajuste no último item)
- valor_total (number, obrigatório)
- origem (text, 0 a 8)
- cst_icms (text, regime normal)
- csosn (text, Simples Nacional)
- mod_bc_icms (text)
- reducao_bc_icms (number)
- base_icms (number)
- aliquota_icms (number)
- valor_icms (number)
- aliquota_fcp (number)
- valor_fcp (number)
- base_icms_uf_destino (number, DIFAL)
- aliquota_interna_uf_destino (number, DIFAL)
- aliquota_interestadual (number, DIFAL)
- percentual_partilha (number, 100% destino)
- aliquota_fcp_uf_destino (number, DIFAL FCP)
- valor_fcp_uf_destino (number, DIFAL FCP)
- valor_icms_uf_destino (number, DIFAL ICMS Destino)
- valor_icms_uf_remetente (number)
- mod_bc_icms_st (text)
- mva (number, margem de valor agregado ST)
- base_icms_st (number)
- aliquota_icms_st (number)
- valor_icms_st (number)
- valor_fcp_st (number)
- cst_ipi (text)
- codigo_enquadramento_ipi (text, ex.: 999)
- base_ipi (number)
- aliquota_ipi (number)
- valor_ipi (number)
- cst_pis (text)
- base_pis (number)
- aliquota_pis (number)
- valor_pis (number)
- cst_cofins (text)
- base_cofins (number)
- aliquota_cofins (number)
- valor_cofins (number)
- cst_ibs_cbs (text)
- c_class_trib (text)
- base_ibs_cbs (number)
- aliquota_ibs_uf (number)
- aliquota_ibs_municipio (number)
- aliquota_cbs (number)
- valor_ibs (number)
- valor_cbs (number)
- c_benef (text)
- gtin (text)
- lote (text)
- validade (text)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `documento_id` (`idx_doc_itens_documento`), `produto_id` (`idx_doc_itens_produto`).

### config_fiscal_empresa

Configuração de parâmetros tributários e regras automáticas de compras/produtos por empresa (estabelecimento). Possui restrição de unicidade por `empresa_id` (uma configuração fiscal por filial/matriz).

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete, índice único)
- aliquota_icms_interna_padrao (number, alíquota de ICMS padrão interno do estado, ex.: 17 ou 18)
- aliquota_fcp_padrao (number, percentual do Fundo de Combate à Pobreza, ex.: 0 ou 2)
- csosn_padrao_tributado (select: "101" ou "102", define o CSOSN sugerido para saídas tributadas quando a empresa for do Simples Nacional)
- grupo_padrao_id (relation -> grupos, opcional, grupo mercadológico sugerido para novos produtos)
- categoria_padrao_id (relation -> categorias, opcional, categoria sugerida para novos produtos)
- margem_padrao_percentual (number, margem de lucro sugerida na formação de preço de venda)
- criar_produtos_automaticamente (select: "Perguntar", "Sempre" ou "Nunca", define política de importação de XML)
- aplicar_sugestao_fiscal_em_produtos_existentes_vazios (bool, quando true preenche campos fiscais não revisados)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id` (único: `idx_config_fiscal_empresa_uid`), `ativo` (`idx_config_fiscal_empresa_ativo`).

### regras_fiscais_ncm

Regras tributárias parametrizadas por prefixo ou código completo de NCM, com priorização decrescente e amarração a Perfis Tributários para motor fiscal inteligente.

- id (text, PK)
- ncm_prefixo (text, obrigatório, 2 a 8 dígitos numéricos da NCM)
- cest (text, opcional, código CEST de 7 dígitos vinculado ao NCM)
- uf (text, opcional, 2 letras da UF para regras específicas por estado ou vazio para todas)
- regime_empresa (select: "Simples Nacional", "Regime Normal" ou "Todos", obrigatório)
- perfil_tributario_id (relation -> perfis_tributarios, obrigatório, perfil aplicado quando a regra casar)
- sujeito_st (bool, indica se a mercadoria é sujeita à Substituição Tributária de ICMS)
- monofasico_pis_cofins (bool, indica regime monofásico de PIS/COFINS com alíquota concentrada)
- natureza_receita_pis_cofins (text, código oficial da Natureza da Receita da tabela SPED)
- observacao (text, anotação ou base legal da regra fiscal)
- prioridade (number, inteiro; em caso de empate de prefixo, vence a regra com maior prioridade)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `ncm_prefixo`, `uf`, `regime_empresa`, `prioridade`, `ativo`.

### icms_aliquotas_uf

Tabela de alíquotas internas de ICMS e adicionais de FCP de cada uma das 27 Unidades Federativas do Brasil.

- id (text, PK)
- uf (text, obrigatório, sigla de 2 letras da UF, índice único)
- aliquota_interna (number, alíquota básica interna do ICMS na UF, ex.: 17, 18, 20.5)
- aliquota_fcp (number, adicional destinado ao Fundo de Combate à Pobreza na UF)
- vigencia_inicio (text, data inicial de vigência YYYY-MM-DD)
- observacao (text, fundamentação legal estadual)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `uf` (único: `idx_icms_aliq_uf_unique`), `ativo` (`idx_icms_aliq_uf_ativo`).

### icms_interestadual

Matriz interestadual de ICMS para operações entre diferentes UFs da federação. Carga inicial semeada com base na Resolução do Senado Federal 22/1989 (7% de SP/RJ/MG/PR/SC/RS para estados das regiões Norte, Nordeste, Centro-Oeste e ES; 12% para os demais pares interestaduais).

- id (text, PK)
- uf_origem (text, obrigatório, sigla de 2 letras da UF de origem)
- uf_destino (text, obrigatório, sigla de 2 letras da UF de destino)
- aliquota (number, alíquota interestadual aplicável, ex.: 7 ou 12)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: par `uf_origem + uf_destino` (único: `idx_icms_inter_par`), `uf_origem`, `uf_destino`, `ativo`.

### pedidos_compra

Tabela central de pedidos de compra da Etapa 3 — Compras para reposição de estoque e aquisição de suprimentos de fornecedores.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório)
- numero (number, sequencial automático por empresa)
- fornecedor_id (relation -> fornecedores, obrigatório)
- comprador_id (relation -> usuarios, opcional)
- data_emissao (texto/data, ex: "2025-05-15")
- data_previsao_entrega (texto/data opcional)
- condicao_pagamento_id (relation -> condicoes_pagamento, opcional)
- status (select: "Rascunho", "Enviado", "Parcialmente recebido", "Recebido", "Cancelado", obrigatório)
- valor_produtos (número com 2 casas decimais)
- valor_desconto (número com 2 casas decimais)
- valor_frete (número com 2 casas decimais)
- valor_outras_despesas (número com 2 casas decimais)
- valor_ipi (número com 2 casas decimais)
- valor_icms_st (número com 2 casas decimais)
- valor_total (número com 2 casas decimais)
- observacao (texto opcional interno)
- observacao_fornecedor (texto opcional impresso no pedido / PDF)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id`, `fornecedor_id`, `comprador_id`, `status`, par `empresa_id + numero`, `ativo`.

### pedidos_compra_itens

Itens de produtos que compõem o pedido de compra.

- id (text, PK)
- pedido_id (relation -> pedidos_compra, obrigatório, cascadeDelete)
- produto_id (relation -> produtos, obrigatório)
- quantidade (número com 4 casas decimais na unidade do nosso estoque, obrigatório)
- custo_unitario (número com 4 casas decimais, sugerido pelo ultimo_preco_compra em produtos_fornecedores ou preco_custo)
- desconto_percentual (número com 2 casas decimais)
- aliquota_ipi (número com 2 casas decimais)
- valor_icms_st_estimado (número com 2 casas decimais)
- valor_total (número com 2 casas decimais: (qtd × custo - desconto) + ipi + icms_st)
- quantidade_recebida (número com 4 casas decimais, padrão 0 — preenchida na entrada de nota em etapa futura)
- observacao (texto opcional)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `pedido_id`, `produto_id`, `ativo`.

### cfop_conversao_entrada

Tabela fiscal de de-para para conversão do CFOP informado na NF-e do fornecedor para o CFOP interno de escrituração da nossa entrada no estabelecimento com base no tipo de entrada.

- id (text, PK)
- cfop_fornecedor (text, 4 dígitos numéricos, obrigatório)
- tipo_entrada (select: "Compra para revenda", "Compra para industrialização", "Uso e consumo", "Ativo imobilizado", "Bonificação", "Devolução de venda", "Outras entradas", obrigatório)
- cfop_entrada (text, 4 dígitos numéricos, obrigatório)
- descricao (texto descritivo da regra fiscal)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índice único: par `cfop_fornecedor + tipo_entrada`.
Tela de gestão: Cadastros > Tabelas fiscais > Conversão CFOP Entrada (`/cadastros/tabelas-fiscais/conversao-cfop`).

### notas_entrada

Tabela mestre de notas fiscais de entrada (cabeçalho da nota, equivalente aos dados do registro C100 do SPED Fiscal).

- id (text, PK)
- empresa_id (relation -> empresas, estabelecimento destinatário, obrigatório)
- fornecedor_id (relation -> fornecedores, emitente da nota, opcional)
- pedido_compra_id (relation -> pedidos_compra, opcional)
- origem_lancamento (select: "XML" ou "Digitação", obrigatório)
- modelo (select: "55" NF-e, "65" NFC-e, "01" Nota fiscal modelo 1/1A, "1B" Nota fiscal avulsa, "04" Nota fiscal de produtor, obrigatório)
- serie (texto, série do documento fiscal)
- numero (number, número da NF, obrigatório)
- chave_acesso (texto de 44 dígitos, único por empresa quando informado)
- data_emissao (texto YYYY-MM-DD, obrigatório)
- data_entrada (texto YYYY-MM-DD, padrão data de hoje, obrigatório)
- natureza_operacao (texto natOp do XML)
- tipo_entrada (select: "Compra para revenda", "Compra para industrialização", "Uso e consumo", "Ativo imobilizado", "Bonificação", "Devolução de venda", "Outras entradas", obrigatório)
- finalidade (number: 1 Normal, 2 Complementar, 3 Ajuste, 4 Devolução)
- situacao_documento (select: "00" Documento regular, "02" Documento cancelado, "08" Documento fiscal emitido com base em regime especial ou norma específica, padrão "00")
- indicador_pagamento (number: 0 À vista, 1 A prazo, 2 Outros)
- condicao_pagamento_id (relation -> condicoes_pagamento, opcional)
- modalidade_frete (number: 0 Por conta do emitente, 1 Por conta do destinatário, 2 Por conta de terceiros, 3 Transporte próprio por conta do remetente, 4 Transporte próprio por conta do destinatário, 9 Sem frete)
- transportadora_id (relation -> fornecedores, opcional)
- valor_produtos (number com 2 casas)
- valor_frete (number com 2 casas)
- valor_seguro (number com 2 casas)
- valor_desconto (number com 2 casas)
- valor_outras_despesas (number com 2 casas)
- valor_ipi (number com 2 casas)
- base_icms (number com 2 casas)
- valor_icms (number com 2 casas)
- base_icms_st (number com 2 casas)
- valor_icms_st (number com 2 casas)
- valor_fcp_st (number com 2 casas)
- valor_pis (number com 2 casas)
- valor_cofins (number com 2 casas)
- valor_ibs (number com 2 casas)
- valor_cbs (number com 2 casas)
- valor_total (number com 2 casas)
- credito_icms (number com 2 casas, créditos aproveitados)
- credito_ipi (number com 2 casas)
- credito_pis (number com 2 casas)
- credito_cofins (number com 2 casas)
- informacoes_complementares (texto infAdic/infCpl do XML)
- observacao (texto livre interno)
- xml_arquivo (arquivo .xml anexado)
- protocolo_autorizacao (texto nProt SEFAZ)
- status_sefaz_xml (texto cStat SEFAZ)
- status (select: "Em conferência", "Lançada", "Cancelada", padrão "Em conferência")
- data_lancamento (texto YYYY-MM-DD da efetivação)
- usuario_lancamento_id (relation -> usuarios)
- motivo_cancelamento (texto com justificativa obrigatória do cancelamento)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id`, `fornecedor_id`, par `empresa_id + chave_acesso`, `status`, `data_emissao`, `ativo`.

### notas_entrada_itens

Itens de produtos da nota fiscal de entrada (registro C170 do SPED Fiscal) com espelho das informações do fornecedor e dados de escrituração e custo do nosso lado.

- id (text, PK)
- nota_id (relation -> notas_entrada, obrigatório, cascadeDelete)
- numero_item (number nItem do XML, obrigatório)
- codigo_fornecedor (texto cProd do fornecedor)
- descricao_fornecedor (texto xProd do fornecedor, obrigatório)
- gtin_fornecedor (texto cEAN)
- ncm_fornecedor (texto NCM)
- cest_fornecedor (texto CEST)
- cfop_fornecedor (texto CFOP do fornecedor)
- unidade_fornecedor (texto uCom)
- quantidade_fornecedor (number qCom, obrigatório)
- valor_unitario_fornecedor (number vUnCom, obrigatório)
- produto_id (relation -> produtos, vínculo ao catálogo ERP; opcional até a conferência)
- fator_conversao (number, padrão 1)
- quantidade_estoque (number = quantidade_fornecedor × fator_conversao)
- lote_numero (texto nLote da tag rastro)
- lote_fabricacao (texto dFab)
- lote_validade (texto dVal)
- valor_produto (number com 2 casas)
- valor_desconto (number com 2 casas)
- valor_frete (number com 2 casas)
- valor_seguro (number com 2 casas)
- valor_outras (number com 2 casas)
- origem (texto orig ICMS: 0 a 8)
- cst_icms_fornecedor (texto CST ou CSOSN emitido pelo fornecedor)
- base_icms (number com 2 casas)
- aliquota_icms (number com 2 casas)
- valor_icms (number com 2 casas)
- base_icms_st (number com 2 casas)
- aliquota_icms_st (number com 2 casas)
- valor_icms_st (number com 2 casas)
- valor_fcp_st (number com 2 casas)
- cst_ipi (texto CST IPI)
- base_ipi (number com 2 casas)
- aliquota_ipi (number com 2 casas)
- valor_ipi (number com 2 casas)
- cst_pis_fornecedor (texto CST PIS)
- valor_pis (number com 2 casas)
- cst_cofins_fornecedor (texto CST COFINS)
- valor_cofins (number com 2 casas)
- cst_ibs_cbs (texto CST IBS/CBS)
- c_class_trib (texto cClassTrib)
- valor_ibs (number com 2 casas)
- valor_cbs (number com 2 casas)
- cfop_entrada (texto de 4 dígitos resultante do de-para de conversão)
- cst_icms_entrada (texto de 3 dígitos: origem + CST do nosso lado)
- aproveita_credito_icms (boolean)
- valor_credito_icms (number com 2 casas)
- cst_pis_entrada (texto)
- cst_cofins_entrada (texto)
- valor_credito_pis (number com 2 casas)
- valor_credito_cofins (number com 2 casas)
- aproveita_credito_ipi (boolean)
- valor_credito_ipi (number com 2 casas)
- quantidade_devolvida (number com 4 casas decimais, padrão 0 — controle acumulado de devoluções efetuadas ao fornecedor)
- custo_total_item (number com 2 casas)
- custo_unitario_estoque (number com 4 casas decimais)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `nota_id`, `produto_id`, `ativo`.

### notas_entrada_parcelas

Parcelas e títulos de pagamento da nota fiscal de entrada (dados de duplicatas cobr/dup do XML). Na Etapa 4, o módulo de Contas a Pagar será gerado a partir destas parcelas.

- id (text, PK)
- nota_id (relation -> notas_entrada, obrigatório, cascadeDelete)
- numero (texto nDup da duplicata ou sequencial, obrigatório)
- data_vencimento (texto YYYY-MM-DD dVenc, obrigatório)
- valor (number com 2 casas decimais, obrigatório)
- forma_pagamento (texto tPag do XML, quando houver)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `nota_id`, `data_vencimento`, `ativo`.

#### Fluxo de Lançamento e Digitação de Notas de Entrada (Etapa 3)

O ERP provê duas modalidades integradas de entrada de documentos fiscais de fornecedores que alimentam o mesmo conjunto de tabelas (`notas_entrada`, `notas_entrada_itens` e `notas_entrada_parcelas`), compartilham a mesma inteligência fiscal e seguem o mesmo ciclo operacional:

1. **Entrada por Importação de XML (`origem_lancamento = "XML"`):**
   - Importação em lote ou individual via upload de arquivo `.xml` (modelo 55 NF-e) com leitura direta pelo `DOMParser`.
   - Vínculo automático de fornecedor (ou auto-cadastro no padrão ERP), de-para de produtos via `produtos_fornecedores` e GTIN, leitura de duplicatas e conversão imediata de CFOPs pela tabela `cfop_conversao_entrada`.
2. **Entrada por Digitação Manual Direta (`origem_lancamento = "Digitação"`):**
   - Rota `/compras/notas-entrada/digitar` (módulo de permissão `notas_entrada`, ação `criar`), acionada pelo botão **"Digitar nota"** na listagem de notas de entrada (`/compras/notas-entrada`).
   - Interface completa em `NotaEntradaDigitacaoPage.tsx` e serviço centralizado `salvarNotaEntradaDigitada` (`@/services/notasEntrada.ts`).
   - **Cabeçalho:** Permite selecionar o modelo do documento (`55` NF-e, `65` NFC-e, `01` Nota Fiscal 1/1A, `1B` Nota Fiscal Avulsa ou `04` Nota Fiscal de Produtor), série, número e chave de acesso com validação matemática dos 44 dígitos em módulo 11 (`validarChaveAcessoNfe`), checando correspondência do CNPJ do emitente, modelo, série e número da NF. Dados de fornecedor (`<SelectFornecedor />`), datas de emissão/entrada, tipo de entrada (com as 7 opções fiscais), condição de pagamento (`<SelectCondicaoPagamento uso="Compras" />`), frete e transportadora.
   - **Itens:** Bipagem e busca ágil de produtos cadastrados (`<BuscaProdutoGtin />`), derivação automática do CFOP de compra interna ou interestadual conforme a UF do fornecedor vs. UF da empresa destinatária ativa com consulta à tabela `cfop_conversao_entrada`, sugestão de CST/CSOSN e alíquotas do cadastro, com `codigo_fornecedor` herdando o código interno do produto e `fator_conversao = 1`.
   - **Totais e Rateio:** Despesas acessórias (frete, seguro e outras despesas) e desconto global informados no cabeçalho sofrem rateio proporcional automático ponderado pelo valor de produtos de cada item, compondo o custo de aquisição final (`custo_total_item` e `custo_unitario_estoque`).
   - **Financeiro e Parcelas:** Cronograma financeiro gerado automaticamente pela função `gerarParcelas` com base na condição de pagamento escolhida, com edição inline de prazos e valores antes da gravação.
   - **Ciclo de Vida Unificado:** A nota digitada é salva inicialmente com status `"Em conferência"`. Segue exatamente o mesmo fluxo operacional das notas de XML na tela de conferência (`/compras/notas-entrada/:id`), permitindo revisão de tributação, créditos de ICMS/IPI/PIS/COFINS, ajuste de margens e preços de venda, efetivação de lançamento com movimentação atômica do Kardex/estoque (`origem = "COMPRA"`) e cancelamento com estorno transacional.

### lotes

Tabela de controle de lotes e datas de validade por produto e empresa. Bloqueada para criação, edição ou exclusão direta pela aplicação — a alteração do saldo de quantidade é feita SOMENTE pelo serviço central de estoque (`movimentarEstoque` e `estornarMovimento`).

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório)
- produto_id (relation -> produtos, obrigatório)
- numero_lote (texto obrigatório, único por empresa + produto + numero_lote)
- data_fabricacao (texto/data opcional)
- data_validade (data/hora texto obrigatória)
- quantidade (número com 4 casas decimais, saldo do lote — alterado SOMENTE pelo serviço central de estoque; criação/edição/exclusão direta bloqueadas pelas regras do banco)
- observacao (texto opcional)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Restrição de unicidade: par triplo `empresa_id + produto_id + numero_lote`.
Índices adicionais: `data_validade`, par `produto_id + ativo`.

### estoque_saldos

Tabela de saldos consolidados de estoque por empresa (filial) e produto. Bloqueada para gravação, edição ou exclusão direta — apenas o serviço central transacional atualiza os registros.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- produto_id (relation -> produtos, obrigatório)
- quantidade (número com 4 casas decimais)
- custo_medio (número com 4 casas decimais, custo médio ponderado)
- valor_total (número com 2 casas decimais, = quantidade × custo_medio)
- data_ultima_entrada (data/hora texto)
- data_ultima_saida (data/hora texto)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Restrição de unicidade: par `empresa_id + produto_id`.

### estoque_movimentos

Tabela do histórico físico-financeiro (Kardex imutável) de movimentações de estoque. Bloqueada para gravação, edição ou exclusão direta — gravada exclusivamente pelo serviço central de movimentação e estorno.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- produto_id (relation -> produtos, obrigatório)
- data_movimento (data/hora da operação, obrigatório)
- tipo (select: "Entrada" ou "Saída", obrigatório)
- origem (select com 16 origens: SALDO_INICIAL, AJUSTE_ENTRADA, AJUSTE_SAIDA, PERDA, CONSUMO_INTERNO, BONIFICACAO_ENTRADA, BONIFICACAO_SAIDA, TRANSFERENCIA_ENTRADA, TRANSFERENCIA_SAIDA, INVENTARIO_ENTRADA, INVENTARIO_SAIDA, COMPRA, DEVOLUCAO_COMPRA, VENDA, DEVOLUCAO_VENDA, ESTORNO)
- quantidade (número positivo com 4 casas decimais, obrigatório)
- custo_unitario (número com 4 casas decimais)
- valor_total (número com 2 casas decimais, = quantidade × custo_unitario)
- saldo_anterior (número com 4 casas decimais)
- saldo_posterior (número com 4 casas decimais)
- custo_medio_anterior (número com 4 casas decimais)
- custo_medio_posterior (número com 4 casas decimais)
- lote_id (texto opcional preparado para futura gestão de lotes)
- documento_tipo (texto opcional, ex: "NF-e", "NFC-e", "Ajuste", "Inventário")
- documento_id (texto opcional com o identificador do documento de origem)
- documento_numero (texto opcional com o número do documento)
- motivo (texto obrigatório para AJUSTE\_\*, PERDA e CONSUMO_INTERNO)
- observacao (texto opcional)
- usuario_id (relation -> users, operador que executou a movimentação)
- estornado (boolean, padrão false)
- movimento_estornado_id (texto com id do movimento original caso seja estorno)
- movimento_estorno_id (texto com id do movimento de estorno caso tenha sido estornado)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### inventarios

Tabela mestre de inventários físicos de estoque para contagem periódica e apuração do Bloco H do SPED Fiscal.

- id (text, PK)
- empresa_id (relation -> empresas, obrigatório)
- numero (number, sequencial por empresa)
- descricao (texto obrigatório, ex: "Contagem Anual 2025")
- data_referencia (texto com data/hora da posição contada, ex: "2025-12-31")
- tipo (select obrigatório: "Geral", "Parcial" ou "Anual (Bloco H)")
- filtros_usados (json: grupo_id, categoria_id, marca_id, localizacao para inventário parcial)
- status (select obrigatório: "Aberto", "Em contagem", "Finalizado", "Cancelado")
- motivo_bloco_h (select obrigatório para SPED: 01 No final do período; 02 Na mudança de forma de tributação da mercadoria (ICMS); 03 Na solicitação da baixa cadastral, paralisação temporária e outras situações; 04 Na alteração de regime de pagamento – condição do contribuinte; 05 Por determinação dos fiscos; 06 Para controle das mercadorias sujeitas ao regime de substituição tributária – restituição/ressarcimento/complementação; padrão 01)
- usuario_abertura_id (relation -> usuarios, opcional)
- usuario_finalizacao_id (relation -> usuarios, opcional)
- data_finalizacao (texto data/hora, opcional)
- observacao (texto opcional)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `empresa_id`, `status`, par `empresa_id + numero`, `data_referencia`, `ativo`.

### inventarios_itens

Itens de produtos que integram o inventário de estoque com congelamento de saldo do sistema na abertura e registro da contagem física.

- id (text, PK)
- inventario_id (relation -> inventarios, obrigatório, cascadeDelete)
- produto_id (relation -> produtos, obrigatório)
- lote_id (relation -> lotes, opcional)
- saldo_sistema (number com 4 casas decimais, congelado na abertura via função saldoEmData)
- quantidade_contada (number com 4 casas decimais, nulo/vazio até a realização da contagem)
- diferenca (number com 4 casas decimais: quantidade_contada - saldo_sistema)
- custo_unitario (number com 4 casas decimais, custo médio ponderado na data de referência)
- valor_diferenca (number com 2 casas decimais: diferenca × custo_unitario)
- contado_por (relation -> usuarios, conferente que realizou a contagem)
- contado_em (texto data/hora em que foi contado)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `inventario_id`, `produto_id`, `lote_id`, `ativo`.

#### Fluxo do Inventário de Estoque

1. **Abrir:** O usuário define a descrição, tipo ("Geral", "Parcial" ou "Anual (Bloco H)"), data de referência e, se parcial, os filtros (grupo, categoria, marca, localização física). O sistema busca os produtos elegíveis e congela o saldo histórico (`saldoEmData`) e o custo médio na data informada. Produtos zerados entram apenas se marcada a opção "incluir produtos zerados". Status inicial: "Aberto".
2. **Contar:** Grade operacional com busca rápida e leitor de código de barras GTIN integrado (cada bipe incrementa 1 na quantidade contada). Suporte a múltiplos operadores gravando `contado_por` e `contado_em`. Barra de progresso com percentual e contadores de itens contados/pendentes. Opção "Contagem Cega" que oculta o saldo do sistema e as diferenças para auditoria independente. O primeiro bipe/contagem atualiza o status para "Em contagem".
3. **Finalizar:** Modal com resumo analítico de sobras (físico > sistema) e faltas (físico < sistema) em quantidade e valor. Para itens não contados, pergunta se considera quantidade zero (gera saída total) ou mantém o saldo do sistema (sem ajuste). Ao confirmar, chama atomicamente `movimentarEstoque` gerando `INVENTARIO_ENTRADA` (sobra) e `INVENTARIO_SAIDA` (falta) com data do movimento = data de referência e documento = o inventário. Status: "Finalizado".
   - **Opção Anual (Bloco H):** Permite ativar "Somente registrar posição" para consolidar a posição em 31/12 sem gerar movimentações ou distorções no estoque atual.
4. **Cancelar:** Permitido apenas antes da finalização (status Aberto ou Em contagem), sem qualquer impacto nas movimentações de estoque.

#### Formato do Inventário para o SPED Fiscal (Bloco H)

Para inventários com status "Finalizado", o sistema gera os dados e exportação CSV formatada rigorosamente conforme o Guia Prático da EFD ICMS/IPI:

- **Registro H005 (Totais do Inventário):**
  - Formato: `|H005|DT_INV|VL_INV|MOT_INV|`
  - `DT_INV`: Data do inventário no formato DDMMAAAA
  - `VL_INV`: Valor total do estoque inventariado (soma de VL_ITEM)
  - `MOT_INV`: Código do motivo (01 a 06, padrão 01 - No final do período)
- **Registro H010 (Inventário por Item):**
  - Formato: `|H010|COD_ITEM|UNID|QTD|VL_UNIT|VL_ITEM|IND_PROP|`
  - `COD_ITEM`: Código cadastral do produto
  - `UNID`: Sigla da unidade de medida do produto
  - `QTD`: Quantidade contada/apurada (4 casas decimais)
  - `VL_UNIT`: Valor unitário / custo médio do produto (4 casas decimais)
  - `VL_ITEM`: Valor total do item = QTD × VL_UNIT (2 casas decimais)
  - `IND_PROP`: Indicador de posse = `0` (Item de propriedade do informante e em seu poder)

Esses dados ficam armazenados e estruturados para integração direta com a Etapa 7 (Módulo SPED Fiscal).

### transferencias

Tabela de remessas e transferências de mercadorias entre empresas do grupo econômico (matriz e filiais).

- id (text, PK)
- numero (number, sequencial automático por empresa de origem)
- empresa_origem_id (relation -> empresas, obrigatório)
- empresa_destino_id (relation -> empresas, obrigatório; validado diferente da origem)
- data_envio (texto data/hora)
- data_recebimento (texto data/hora)
- status (select: "Rascunho", "Enviada", "Recebida", "Cancelada", obrigatório)
- nota_fiscal_numero (texto opcional)
- nota_fiscal_chave (texto opcional, 44 dígitos)
- observacao (texto)
- usuario_envio_id (relation -> usuarios, opcional)
- usuario_recebimento_id (relation -> usuarios, opcional)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Fluxo de status:

1. **Rascunho:** Inclusão de itens com bipagem GTIN e visualização de saldo atual e custo médio da origem.
2. **Enviada:** Disparado exclusivamente pela empresa de origem. Chama o serviço central gerando `TRANSFERENCIA_SAIDA` no estoque da origem com o custo médio ponderado atual. Documento: "Transferência", id e número TR-N.
3. **Recebida:** Disparado exclusivamente pela empresa de destino ativa. Confere quantidade recebida. Se recebido < enviado, gera entrada integral da quantidade enviada e lança perda imediata de divergência no destino (`Divergência na transferência N`). Se produto controla lote, vincula/cria lote equivalente no destino.
4. **Cancelada:** Rascunho é cancelado livremente. Transferência Enviada só pode ser cancelada pela empresa de origem antes do recebimento, estornando atomicamente todas as saídas geradas através do endpoint central `/estoque/estornar`. Transferências no status "Recebida" são definitivas e não podem ser canceladas.

### transferencias_itens

Itens de produtos que compõem cada transferência entre empresas.

- id (text, PK)
- transferencia_id (relation -> transferencias, obrigatório, cascadeDelete)
- produto_id (relation -> produtos, obrigatório)
- lote_id (relation -> lotes, opcional; obrigatório quando o produto controla lote)
- quantidade (número com 4 casas decimais, obrigatório)
- custo_unitario (número com 4 casas decimais — custo médio da origem no envio)
- quantidade_recebida (número com 4 casas decimais, padrão 0)
- divergencia (número com 4 casas decimais — quantidade - quantidade_recebida)
- ativo (boolean, padrão true)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### condicoes_pagamento

Tabela de condições e planos de pagamento para comercialização e faturamento. Utilizada de forma integrada por clientes, fornecedores, compras, pedidos de venda, PDV e financeiro (contas a pagar e receber).

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (número sequencial automático, ex.: 1, 2, 3...)
- nome (texto obrigatório, único, até 100 caracteres; ex.: "À vista", "30 dias", "30/60/90", "Entrada + 2x")
- tipo (select obrigatório: "À vista" ou "A prazo")
- uso (select obrigatório: "Vendas", "Compras" ou "Ambos", padrão "Ambos")
- quantidade_parcelas (número inteiro, mínimo 1; "À vista" = 1)
- dias_parcelas (lista JSON de números inteiros com os prazos de cada parcela contados da data da operação em ordem crescente; ex.: [30, 60, 90]; "À vista" = [0])
- percentual_entrada (número percentual opcional 0 a 100; ex.: 30 = 30% na data da operação e o restante dividido nas demais parcelas)
- acrescimo_percentual (número percentual opcional; juros/acréscimos embutidos no valor total)
- desconto_percentual (número percentual opcional; desconto para pagamento pontual ou à vista)
- dia_fixo_vencimento (número inteiro opcional 1 a 31; quando preenchido, os vencimentos são ajustados para esse dia do mês)
- observacao (texto opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras: A quantidade de parcelas deve ser rigorosamente igual ao número de itens em `dias_parcelas`. Os prazos em dias devem estar em ordem estritamente crescente. Toda alteração, inclusão ou inativação grava registro em `logs_auditoria`.

#### Função reutilizável: gerarParcelas

Calcula e retorna o cronograma completo de parcelas (número, vencimento e valor líquido arredondado para 2 casas decimais), alocando eventuais resíduos de centavos na última parcela. Considera entrada destacada, acréscimo percentual, desconto percentual e ajuste por dia fixo.

```tsx
import { gerarParcelas } from '@/services/condicoesPagamento'

const parcelas = gerarParcelas(
  {
    tipo: 'A prazo',
    quantidade_parcelas: 3,
    dias_parcelas: [30, 60, 90],
    percentual_entrada: 0,
    acrescimo_percentual: 0,
    desconto_percentual: 5,
    dia_fixo_vencimento: 10,
  },
  1000.0, // Valor bruto base
  '2025-05-01', // Data base opcional (padrão: hoje)
)
// Retorno: [{ numero: 1, data_vencimento: "2025-06-10", valor: 316.66 }, ...]
```

#### Componente reutilizável: `<SelectCondicaoPagamento />`

Combobox de seleção com busca em tempo real por nome, código ou prazos, filtro contextual por aplicabilidade (`uso="Vendas"` ou `uso="Compras"`), badges visuais e botão embutido "+ Nova condição de pagamento" que abre modal de cadastro rápido sem sair do formulário.

```tsx
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
;<SelectCondicaoPagamento
  value={condicaoPagamentoId}
  onChange={(id, condicao) => {
    setCondicaoPagamentoId(id)
    console.log('Condição selecionada:', condicao)
  }}
  uso="Vendas" // ou "Compras", ou omitido para listar todas
  placeholder="Selecione a condição de pagamento..."
/>
```

### empresas

Tabela que armazena os estabelecimentos (Matriz e Filiais), cada um com seu CNPJ próprio.

- id (text, PK)
- ativo (boolean, padrão true)

#### Identificação

- tipo: "Matriz" ou "Filial" (obrigatório, só pode existir uma Matriz)
- matriz_id: referência à empresa matriz (obrigatório quando tipo = Filial)
- codigo: número sequencial curto para exibir (1, 2, 3...)
- razao_social: texto obrigatório, até 60 caracteres
- nome_fantasia: texto, até 60 caracteres
- cnpj: texto obrigatório, único, validado com DV conforme especificação alfanumérica
- inscricao_estadual: texto, obrigatório para contribuinte de ICMS; aceita "ISENTO"; validação com pesos 9 a 2 para UF ES
- inscricao_estadual_st: texto opcional, IE de substituto tributário em outra UF
- inscricao_municipal: texto
- cnae_principal: 7 dígitos
- cnaes_secundarios: lista de textos (JSON)
- data_abertura: data
- logo: arquivo de imagem (até 2 MB)

#### Regime tributário

- crt: 1 Simples Nacional; 2 Simples Nacional - excesso de sublimite de receita bruta; 3 Regime Normal; 4 Simples Nacional - MEI (obrigatório)
- regime_apuracao: "Simples Nacional", "Lucro Presumido", "Lucro Real" ou "MEI"
- regime_pis_cofins: "Cumulativo" ou "Não cumulativo" (aparece só quando crt = 3)
- aliquota_credito_simples: percentual de crédito de ICMS permitido ao Simples (aparece só quando crt = 1 ou 2)
- contribuinte_ipi: sim/não (indústria ou equiparada)
- indicador_atividade_sped: 0 Industrial ou equiparado a industrial; 1 Outros
- perfil_sped: A, B ou C (perfil do arquivo da EFD ICMS/IPI definido pela SEFAZ)
- obrigado_efd_icms_ipi: sim/não (padrão: sim quando crt = 3, não quando crt = 1 ou 4)
- permite_estoque_negativo: boolean (padrão false; bloco "Estoque" na aba Regime Tributário)

#### Endereço

- cep: texto (00000-000)
- logradouro: texto
- numero: texto
- complemento: texto
- bairro: texto
- municipio: texto
- codigo_municipio_ibge: 7 dígitos, obrigatório
- uf: 2 letras
- codigo_pais: padrão 1058 (Brasil)
- pais: padrão Brasil

#### Contato

- telefone: texto
- celular: texto
- email: email
- email_fiscal: email (para recebimento/envio de XML)
- site: texto

#### Responsável legal

- responsavel_nome: texto
- responsavel_cpf: texto (validado com módulo 11)
- responsavel_cargo: texto

#### Contabilidade (SPED 0100)

- contador_nome: texto
- contador_cpf: texto (validado com módulo 11)
- contador_crc: texto
- contador_cnpj_escritorio: texto (validado com DV)
- contador_cep: texto
- contador_logradouro: texto
- contador_numero: texto
- contador_complemento: texto
- contador_bairro: texto
- contador_codigo_municipio_ibge: 7 dígitos
- contador_telefone: texto
- contador_email: email

- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índices: `cnpj` (único: `idx_empresas_cnpj`), `(assinante_id, codigo)` (único por assinante: `idx_empresas_assinante_codigo` substituindo o antigo global `idx_empresas_codigo` na Migration 0092), `tipo` (`idx_empresas_tipo`), `ativo` (`idx_empresas_ativo`), `assinante_id` (`idx_empresas_assinante`).

### unidades_medida

Tabela de unidades comerciais e tributárias utilizadas no cadastro de produtos e na emissão de documentos fiscais.

- id (text, PK)
- ativo (boolean, padrão true)
- sigla (texto obrigatório, único, até 6 caracteres, sempre maiúsculas, ex: "UN", "KG", "CX")
- descricao (texto obrigatório, ex: "Quilograma", "Unidade")
- aceita_fracionado (boolean: permite quantidade com decimais nas movimentações e notas)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### tabelas_fiscais_codigos

Tabela única para listas auxiliares de códigos fiscais oficiais (SEFAZ, SPED e Reforma Tributária).

- id (text, PK)
- ativo (boolean, padrão true)
- tipo (texto obrigatório, ex: "ORIGEM", "CST_ICMS", "CSOSN", "MOD_BC_ICMS", "MOD_BC_ICMS_ST", "CST_IPI", "CST_PIS_COFINS", "TIPO_ITEM_SPED", "CRT", "IND_IE_DEST", "CST_IBS_CBS", "CCLASSTRIB")
- codigo (texto obrigatório, ex: "00", "101", "0", "01")
- descricao (texto obrigatório com a descrição oficial)
- observacao (texto opcional com orientações tributárias)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Restrição de unicidade: par `tipo + codigo`.

### logs_auditoria

Tabela central de auditoria que registra inclusões, alterações e inativações de cadastros.

- id (text, PK)
- usuario_id (relation -> users, opcional)
- usuario_nome (texto)
- empresa_id (relation -> empresas, opcional)
- tabela (texto obrigatório, ex: "empresas")
- registro_id (texto obrigatório)
- acao (select: inclusao, alteracao, inativacao, ativacao, exclusao)
- valores_antes (json)
- valores_depois (json)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### perfis_acesso

Tabela de níveis de acesso e perfis de operadores do sistema.

- id (text, PK)
- ativo (boolean, padrão true)
- nome (texto obrigatório, único)
- descricao (texto)
- administrador (boolean: se true, tem acesso total irrestrito e ignora a matriz)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### permissoes

Matriz detalhada de permissões por módulo associada a cada perfil de acesso.

- id (text, PK)
- ativo (boolean, padrão true)
- perfil_id (relation -> perfis_acesso, obrigatório, cascadeDelete)
- modulo (select obrigatório com 23 módulos: painel, empresas, usuarios, perfis_acesso, clientes, fornecedores, produtos, marcas, grupos_categorias, unidades_medida, tabelas_fiscais, estoque, compras, notas_entrada, financeiro_pagar, financeiro_receber, vendas, pdv, caixa, notas_saida, sped, relatorios, configuracoes)
- pode_ver (boolean)
- pode_criar (boolean)
- pode_editar (boolean)
- pode_excluir (boolean)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### usuarios

Cadastro interno do colaborador/operador do ERP, vinculado à conta de login do Skip Cloud (`users`).

- id (text, PK)
- ativo (boolean, padrão true)
- auth_user_id (relation -> users, ligação com a conta de login do Skip Cloud)
- nome (texto obrigatório)
- email (email obrigatório, único)
- cpf (texto com validação de CPF)
- telefone (texto)
- foto (arquivo de imagem até 5MB)
- perfil_id (relation -> perfis_acesso, obrigatório)
- empresa_padrao_id (relation -> empresas, opcional)
- desconto_maximo_percentual (número percentual 0 a 100, padrão 0)
- comissao_percentual (número percentual 0 a 100, padrão 0)
- e_vendedor (boolean)
- e_caixa (boolean)
- ultimo_acesso (data/hora)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### usuarios_empresas

Vínculo de quais empresas e filiais cada colaborador tem autorização para visualizar e trabalhar.

- id (text, PK)
- ativo (boolean, padrão true)
- usuario_id (relation -> usuarios, obrigatório, cascadeDelete)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### ncm

Nomenclatura Comum do Mercosul utilizada na classificação fiscal de produtos e serviços do comércio exterior e nacional.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto obrigatório, único, exatamente 8 dígitos numéricos, ex: "22021000")
- descricao (texto obrigatório com a nomenclatura oficial)
- ex_tipi (texto opcional com o código da Exceção da TIPI)
- aliquota_ipi (número percentual opcional)
- unidade_tributavel (texto opcional com a unidade padrão tributária, ex: "UN", "KG")
- data_inicio (texto opcional com início da vigência AAAA-MM-DD)
- data_fim (texto opcional com término da vigência AAAA-MM-DD)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### cest

Código Especificador da Substituição Tributária que identifica mercadorias e bens passíveis de sujeição aos regimes de substituição tributária e de antecipação de recolhimento do ICMS.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto obrigatório, único, exatamente 7 dígitos numéricos, ex: "0300100")
- ncm_codigos (texto com NCMs ou prefixos de NCM relacionados separados por vírgula, ex: "2202, 22030000")
- segmento (texto com a descrição do segmento oficial, ex: "Bebidas alcoólicas")
- item (texto com o número do item do anexo, ex: "1.0")
- descricao (texto obrigatório com a especificação do produto)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### cfop

Código Fiscal de Operações e Prestações com regras de tributação, impacto financeiro, movimentação de estoque e devoluções.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto obrigatório, único, exatamente 4 dígitos numéricos, iniciado por 1, 2, 3, 5, 6 ou 7)
- descricao (texto obrigatório com a descrição legal da operação)
- aplicacao (texto longo opcional detalhando o enquadramento fiscal)
- tipo_movimento (select: "Entrada" [1xxx, 2xxx, 3xxx] ou "Saída" [5xxx, 6xxx, 7xxx], automático a partir do código)
- abrangencia (select: "Estadual" [1xxx/5xxx], "Interestadual" [2xxx/6xxx] ou "Exterior" [3xxx/7xxx], automático a partir do código)
- gera_financeiro (boolean: se a operação gera títulos a receber ou pagar)
- movimenta_estoque (boolean: se a operação movimenta fisicamente o estoque de produtos)
- devolucao (boolean: se a operação caracteriza devolução de compras ou vendas)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### marcas

Tabela de marcas e fabricantes de produtos comercializados. Cadastro compartilhado entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- nome (texto obrigatório, único)
- fabricante (texto opcional com o nome/razão social do fabricante)
- observacao (texto opcional com anotações e contatos)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### grupos

Tabela de grupos mercadológicos (nível 1 da classificação em árvore de produtos). Compartilhada entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto obrigatório, único, ex: "01", "ALIM")
- nome (texto obrigatório, único, ex: "Alimentos", "Bebidas")
- margem_padrao_percentual (número percentual opcional para sugestão futura de preço de venda)
- perfil_tributario_id (texto opcional preparado para vincular a perfis tributários futuros)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### categorias

Tabela de categorias mercadológicas (nível 2 da classificação, pertencente a um grupo). Compartilhada entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- grupo_id (relation -> grupos, obrigatório)
- codigo (texto opcional, ex: "01.01", "SUC")
- nome (texto obrigatório, único DENTRO do grupo pai)
- margem_padrao_percentual (número percentual opcional; se vazio, herda a margem do grupo)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### clientes

Cadastro de clientes para faturamento, documentos fiscais (NF-e, NFC-e) e SPED Fiscal (registro 0150). Compartilhado entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (número sequencial automático exibido na listagem)
- tipo_pessoa (select obrigatório: "Física", "Jurídica" ou "Estrangeiro")
- cpf_cnpj (texto obrigatório para Física e Jurídica, único entre clientes ATIVOS, validado com dígitos verificadores; CPF módulo 11 rejeitando sequências repetidas; CNPJ alfanumérico com os pesos oficiais)
- id_estrangeiro (texto obrigatório quando tipo_pessoa = Estrangeiro)
- nome_razao_social (texto obrigatório, até 60 caracteres)
- nome_fantasia (texto até 60 caracteres)
- rg (texto, só para Física)
- data_nascimento (texto, só para Física)
- indicador_ie (select obrigatório tipo IND_IE_DEST: 1 Contribuinte ICMS; 2 Contribuinte isento de inscrição; 9 Não contribuinte; padrão 9 para Física)
- inscricao_estadual (texto obrigatório quando indicador_ie = 1; aceita "ISENTO"; validação para UF ES: 9 dígitos, módulo 11, pesos 9 a 2)
- inscricao_municipal (texto opcional)
- inscricao_suframa (texto opcional)
- consumidor_final (boolean; padrão true para Física, false para Jurídica contribuinte)
- regime_tributario_cliente (select opcional com CRT do cliente: 1, 2, 3 ou 4)

#### Endereço principal (obrigatório para NF-e)

- cep, logradouro, numero, complemento, bairro, municipio, codigo_municipio_ibge, uf: endereço do destinatário
- codigo_pais (texto padrão "1058"), pais (texto padrão "Brasil")
- Para Estrangeiro: uf "EX", municipio "EXTERIOR", codigo_municipio_ibge "9999999" e país escolhido de lista

#### Endereço de entrega (opcional)

- entrega_mesmo_endereco (boolean; padrão true — quando marcado, usa o endereço principal)
- entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento, entrega_bairro, entrega_municipio, entrega_codigo_municipio_ibge, entrega_uf

#### Contato

- telefone, celular, email, contato_nome
- whatsapp (boolean)
- email_nfe (texto com um ou vários e-mails separados por ponto e vírgula, para envio do XML e DANFE)

#### Comercial

- vendedor_id (relation -> usuarios; somente usuários com e_vendedor = true)
- limite_credito (número em R$)
- dia_vencimento_preferencial (número 1 a 31)
- condicao_pagamento_id (relation -> condicoes_pagamento, opcional, padrão de faturamento do cliente)
- condicao_pagamento_padrao (texto legado mantido para compatibilidade)
- desconto_padrao_percentual (número percentual 0 a 100)
- bloqueado (boolean: bloqueia vendas a prazo) e motivo_bloqueio (texto obrigatório quando bloqueado = true)
- observacoes (texto longo interno)
- observacao_nota (texto que sai automaticamente nas notas desse cliente)

Regras: quando indicador_ie = 1 e a UF do cliente for diferente da UF da empresa ativa, o formulário exibe a observação "Operação interestadual com contribuinte". CPF/CNPJ único somente entre clientes ativos; se o mesmo documento existir em cliente inativo, a tela exibe aviso (não bloqueio) com botão "Reativar". Todas as ações (incluir, alterar, inativar, reativar) gravam em logs_auditoria com valores antes/depois.

- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

#### Componentes reutilizáveis

- `<ClienteCadastroRapido />` (`@/components/ClienteCadastroRapido`): modal de cadastro rápido com só nome/razão social, CPF/CNPJ, telefone e CEP (com busca ViaCEP), aviso de cliente inativo com mesmo documento e botão reativar. Usado na listagem de Clientes e pronto para ser reutilizado no PDV e em outros módulos de venda:

```tsx
import { ClienteCadastroRapido } from '@/components/ClienteCadastroRapido'
;<ClienteCadastroRapido
  aberto={modalAberto}
  onOpenChange={setModalAberto}
  onSucesso={(cliente) => console.log('Cliente criado:', cliente)}
  tipoPessoaInicial="Física" // opcional
/>
```

### fornecedores

Cadastro de fornecedores de mercadorias, serviços, transportadoras e insumos para entrada de notas fiscais, contas a pagar e SPED Fiscal (registro 0150). Compartilhado entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (número sequencial automático exibido na listagem)
- tipo_pessoa (select obrigatório: "Física", "Jurídica" ou "Estrangeiro")
- cpf_cnpj (texto obrigatório para Física e Jurídica, único entre fornecedores ATIVOS, validado com dígitos verificadores; CPF módulo 11 sem sequências repetidas; CNPJ alfanumérico com pesos oficiais)
- id_estrangeiro (texto obrigatório quando tipo_pessoa = Estrangeiro)
- razao_social (texto obrigatório, até 60 caracteres)
- nome_fantasia (texto até 60 caracteres)
- indicador_ie (select obrigatório: 1 Contribuinte ICMS, 2 Contribuinte isento, 9 Não contribuinte)
- inscricao_estadual (texto obrigatório quando indicador_ie = 1; validação ES módulo 11 pesos 9 a 2; aceita "ISENTO")
- inscricao_municipal (texto opcional)
- inscricao_suframa (texto opcional)
- crt_fornecedor (select opcional: 1 Simples Nacional, 2 Simples excesso sublimite, 3 Regime Normal, 4 MEI - essencial para conferência de crédito de ICMS na entrada)
- tipo_fornecedor (select múltiplo: "Mercadorias", "Serviços", "Transportadora", "Uso e consumo", "Outros" — permite selecionar mais de um)
- produtor_rural (boolean)

#### Endereço

- cep, logradouro, numero, complemento, bairro, municipio, codigo_municipio_ibge, uf: endereço fiscal do fornecedor
- codigo_pais (texto padrão "1058"), pais (texto padrão "Brasil")
- Para Estrangeiro: uf "EX", municipio "EXTERIOR", codigo_municipio_ibge "9999999" e país da tabela de países

#### Contato

- telefone, celular, email, email_financeiro, site, contato_nome, contato_cargo, contato_telefone

#### Comercial

- prazo_entrega_dias (número inteiro em dias)
- condicao_pagamento_id (relation -> condicoes_pagamento, opcional, condição padrão de compras do fornecedor)
- condicao_pagamento_padrao (texto legado mantido para compatibilidade)
- pedido_minimo (número em R$)
- representante_nome, representante_telefone, representante_email

#### Dados bancários

- banco_codigo (texto com 3 dígitos), banco_nome, agencia, conta
- tipo_conta (select opcional: "Corrente", "Poupança")
- titular, cpf_cnpj_titular
- pix_tipo (select opcional: "CPF/CNPJ", "E-mail", "Telefone", "Chave aleatória")
- pix_chave (texto)

#### Outros

- observacoes (texto longo interno)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras: Botão "Consultar CNPJ" (BrasilAPI) na aba Dados preenchendo razão social, fantasia, endereço e telefone quando o CNPJ for de 14 dígitos. Consulta de endereço automática por CEP via ViaCEP. CPF/CNPJ único somente entre fornecedores ativos; se o mesmo documento existir em fornecedor inativo, a tela exibe aviso e botão para reativação direta. Todas as ações (inclusão, alteração, inativação e reativação) gravam em logs_auditoria com valores antes e depois. Permissões via `pode('fornecedores', acao)`.

#### Componentes reutilizáveis

- `<SelectFornecedor />` (`@/components/SelectFornecedor`): combobox com busca de fornecedores ativos exibindo `"código - razão social"` e permitindo filtro opcional por `filtroTipo` ("Mercadorias", "Serviços", "Transportadora", "Uso e consumo", "Outros"). Registrado para uso nos próximos formulários (notas fiscais de entrada, compras e contas a pagar):

```tsx
import { SelectFornecedor } from '@/components/SelectFornecedor'
;<SelectFornecedor
  value={fornecedorId}
  onChange={(id, fornecedor) => setFornecedorId(id)}
  filtroTipo="Mercadorias" // opcional
  placeholder="Selecione o fornecedor..."
/>
```

### perfis_tributarios

Tabela de cabeçalho de perfis tributários. Um perfil é um modelo de tributação aplicável a vários produtos do catálogo.

- id (text, PK)
- ativo (boolean, padrão true)
- nome (texto obrigatório, único; ex: "Revenda tributada 17%", "Revenda com ST", "Isento")
- descricao (texto opcional)
- regime (select obrigatório: "Simples Nacional" ou "Regime Normal" — define se os campos de ICMS usam CSOSN ou CST)
- origem_padrao (texto, código de origem padrão tipo ORIGEM em tabelas_fiscais_codigos)
- tipo_item_sped_padrao (texto, tipo do item SPED padrão tipo TIPO_ITEM_SPED em tabelas_fiscais_codigos)
- c_benef (texto opcional, até 10 caracteres, código de benefício fiscal na SEFAZ)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### perfis_tributarios_regras

Linhas de regras tributárias associadas ao perfil, configuradas para 8 cenários comerciais oficiais.

- id (text, PK)
- ativo (boolean, padrão true)
- perfil_id (relation -> perfis_tributarios, obrigatório, cascadeDelete)
- cenario (select obrigatório com 8 opções: "VENDA_INTERNA_CONTRIBUINTE", "VENDA_INTERNA_CONSUMIDOR", "VENDA_INTERESTADUAL_CONTRIBUINTE", "VENDA_INTERESTADUAL_CONSUMIDOR", "DEVOLUCAO_COMPRA", "TRANSFERENCIA", "COMPRA_INTERNA", "COMPRA_INTERESTADUAL")
- cfop (relation -> cfop, opcional; cenários de saída aceitam grupos 5 e 6, cenários de entrada aceitam 1 e 2)
- cst_icms (texto, CST do ICMS quando regime Normal)
- csosn (texto, CSOSN do ICMS quando Simples Nacional)
- mod_bc_icms (texto, modalidade de determinação da BC do ICMS)
- aliquota_icms (número percentual)
- reducao_bc_icms_percentual (número percentual, visível para CST 20, 70 ou 90)
- aliquota_fcp (número percentual do Fundo de Combate à Pobreza)
- mod_bc_icms_st (texto, modalidade de determinação da BC do ICMS ST)
- mva_percentual (número percentual da margem de valor agregado ST)
- reducao_bc_icms_st_percentual (número percentual de redução na BC ST)
- aliquota_icms_st (número percentual do ICMS ST)
- aliquota_fcp_st (número percentual do FCP ST)
- percentual_diferimento (número percentual de diferimento do ICMS)
- motivo_desoneracao (texto, código do motivo de desoneração do ICMS)
- cst_ipi (texto, código da situação tributária do IPI)
- codigo_enquadramento_ipi (texto de 3 dígitos, padrão 999)
- aliquota_ipi (número percentual do IPI)
- cst_pis (texto, código da situação tributária do PIS)
- aliquota_pis (número percentual do PIS)
- cst_cofins (texto, código da situação tributária da COFINS)
- aliquota_cofins (número percentual da COFINS)
- natureza_receita_pis_cofins (texto de 3 dígitos, exigido quando CST de PIS/COFINS for 04, 05, 06, 07, 08 ou 09)
- cst_ibs_cbs (texto, CST da Reforma Tributária EC 132/23)
- c_class_trib (texto, classificação tributária cClassTrib)
- aliquota_ibs_uf (número percentual do IBS Estadual)
- aliquota_ibs_municipio (número percentual do IBS Municipal)
- aliquota_cbs (número percentual da CBS Federal)
- reducao_ibs_cbs_percentual (número percentual de redução do IBS/CBS)
- observacao_fiscal (texto livre para dados complementares do documento fiscal)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Restrição de unicidade: par `perfil_id + cenario`.
Auditoria: gravação em `logs_auditoria` para inclusão, alteração e inativação do perfil e de suas regras.

#### Componentes reutilizáveis

- `<SelectPerfilTributario />` (`@/components/SelectPerfilTributario`): combobox com busca de perfis tributários ativos exibindo nome, regime e descrição, permitindo filtro opcional por `regimeFiltro`. Integrado no cadastro de grupos mercadológicos (`Grupos e categorias`) no campo `perfil_tributario_id` e pronto para o cadastro de produtos:

```tsx
import { SelectPerfilTributario } from '@/components/SelectPerfilTributario'
;<SelectPerfilTributario
  value={perfilId}
  onChange={(id, perfil) => setPerfilId(id)}
  placeholder="Selecione o perfil tributário..."
/>
```

### produtos

Cadastro central de mercadorias, serviços e kits do ERP. Tabela completa incluindo identificação, unidades, precificação com cálculo bidirecional, parâmetros de controle de estoque e todos os campos fiscais para NF-e/NFC-e e SPED Fiscal. Compartilhado entre todas as empresas.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (número sequencial automático, único; COD_ITEM no SPED)
- tipo (select obrigatório: "Produto", "Serviço" ou "Kit")
- descricao (texto obrigatório, até 120 caracteres; descrição que sai na nota fiscal)
- descricao_reduzida (texto opcional, até 40 caracteres, para cupom e PDV)
- gtin (texto, até 14 caracteres, único quando informado; validação de dígito verificador GS1 para 8, 12, 13 ou 14 dígitos; aceita "SEM GTIN")
- gtin_tributavel (texto, até 14 caracteres; validação de dígito verificador ou "SEM GTIN")
- referencia (texto, até 60 caracteres, código do fabricante)
- marca_id (relation -> marcas, opcional)
- grupo_id (relation -> grupos, opcional)
- categoria_id (relation -> categorias, opcional; encadeado pelo grupo)
- fornecedor_principal_id (relation -> fornecedores, opcional)
- foto (arquivo de imagem até 2 MB)
- fotos_adicionais (até 5 arquivos de imagem até 2 MB cada)
- observacoes (texto longo interno)

#### Unidades

- unidade_id (relation -> unidades_medida, obrigatório; unidade comercial uCom)
- unidade_tributavel_id (relation -> unidades_medida, padrão = unidade comercial; uTrib)
- fator_conversao_tributavel (número, padrão 1; quantas uTrib em 1 uCom)

#### Preços

- preco_custo (número em R$, 4 casas decimais)
- outras_despesas_percentual (número percentual; frete/encargos)
- custo_final (calculado: custo + custo × despesas%/100)
- margem_percentual (número percentual; sugerida por grupo/categoria ou editável)
- preco_venda (número em R$, obrigatório para Produto e Serviço; cálculo bidirecional: custo_final × (1 + margem/100) e recalculo de margem se informado o preço de venda)
- preco_promocional (número em R$)
- promocao_inicio (data texto)
- promocao_fim (data texto)
- permite_desconto (boolean, padrão true)
- desconto_maximo_percentual (número percentual, padrão 0)

#### Estoque (parâmetros de controle)

- controla_estoque (boolean, padrão true para Produto/Kit, false para Serviço)
- estoque_minimo (número)
- estoque_maximo (número)
- localizacao (texto, até 60 caracteres)
- controla_lote_validade (boolean, padrão false)
- dias_validade (número inteiro)
- vende_fracionado (boolean; pré-marcado herdando de unidades_medida.aceita_fracionado)
- vende_no_pdv (boolean, padrão true)
- peso_liquido_kg (número, 3 casas decimais)
- peso_bruto_kg (número, 3 casas decimais)
- altura_cm (número)
- largura_cm (número)
- comprimento_cm (número)

#### Campos Fiscais

- perfil_tributario_id (relation -> perfis_tributarios, opcional)
- ncm (texto, 8 dígitos numéricos)
- ex_tipi (texto, até 3 caracteres)
- cest (texto, 7 dígitos numéricos)
- origem (texto, código ORIGEM tipo tabelas_fiscais_codigos)
- tipo_item_sped (texto, código TIPO_ITEM_SPED tipo tabelas_fiscais_codigos)
- codigo_genero (texto de 2 dígitos, preenchido automaticamente com os 2 primeiros dígitos do NCM)
- codigo_servico_lc116 (texto, até 10 caracteres)
- indicador_escala_relevante (texto, "S" ou "N", padrão "N")
- cnpj_fabricante (texto de 14 dígitos numéricos)
- c_benef (texto, até 10 caracteres)
- codigo_anp (texto, até 10 caracteres)
- descricao_anp (texto, até 100 caracteres)
- cfop_venda_interna (texto de 4 dígitos)
- cfop_venda_interestadual (texto de 4 dígitos)
- cfop_compra_interna (texto de 4 dígitos)
- cfop_compra_interestadual (texto de 4 dígitos)
- cst_icms (texto, até 4 caracteres)
- csosn (texto, até 4 caracteres)
- mod_bc_icms (texto, até 2 caracteres)
- aliquota_icms (número percentual)
- reducao_bc_icms_percentual (número percentual)
- aliquota_fcp (número percentual)
- mod_bc_icms_st (texto, até 2 caracteres)
- mva_percentual (número percentual)
- reducao_bc_icms_st_percentual (número percentual)
- aliquota_icms_st (número percentual)
- aliquota_fcp_st (número percentual)
- percentual_diferimento (número percentual)
- motivo_desoneracao (texto, até 2 caracteres)
- aliquota_icms_interestadual (número percentual)
- cst_ipi_saida (texto, 2 dígitos)
- cst_ipi_entrada (texto, 2 dígitos)
- codigo_enquadramento_ipi (texto, 3 dígitos, padrão "999")
- tipo_calculo_ipi (select: "Percentual" ou "Valor por unidade")
- aliquota_ipi (número percentual)
- valor_ipi_unidade (número em R$)
- cst_pis_saida (texto, 2 dígitos)
- cst_pis_entrada (texto, 2 dígitos)
- aliquota_pis (número percentual)
- cst_cofins_saida (texto, 2 dígitos)
- cst_cofins_entrada (texto, 2 dígitos)
- aliquota_cofins (número percentual)
- tipo_calculo_pis_cofins (select: "Percentual" ou "Valor por unidade")
- valor_pis_unidade (número em R$)
- valor_cofins_unidade (número em R$)
- natureza_receita_pis_cofins (texto, até 3 dígitos)
- cst_ibs_cbs (texto, até 4 caracteres)
- c_class_trib (texto, até 10 caracteres)
- aliquota_ibs_uf (número percentual)
- aliquota_ibs_municipio (número percentual)
- aliquota_cbs (número percentual)
- reducao_ibs_cbs_percentual (número percentual)
- informacoes_adicionais_item (texto livre para tag infAdProd da NF-e)
- fiscal_revisado (boolean, padrão false)
- fiscal_revisado_por (relation -> users, opcional)
- fiscal_revisado_em (data/hora texto)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### produtos_kit_itens

Tabela de composição de kits comerciais (quando `tipo = "Kit"`). O kit não possui saldo próprio de estoque: ao vender o kit, o sistema baixa o estoque dos itens componentes.

- id (text, PK)
- ativo (boolean, padrão true)
- produto_kit_id (relation -> produtos, obrigatório, cascadeDelete)
- produto_item_id (relation -> produtos, obrigatório, componente do kit)
- quantidade (número decimal obrigatório)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### produtos_fornecedores

Tabela de amarração de produtos com múltiplos fornecedores para de-para do XML de compra.

- id (text, PK)
- ativo (boolean, padrão true)
- produto_id (relation -> produtos, obrigatório, cascadeDelete)
- fornecedor_id (relation -> fornecedores, obrigatório)
- codigo_no_fornecedor (texto até 60 caracteres, tag cProd da NF-e)
- descricao_no_fornecedor (texto até 120 caracteres, tag xProd da NF-e)
- unidade_fornecedor (texto até 10 caracteres, tag uCom do fornecedor)
- fator_conversao (número: quantas unidades nossas em 1 do fornecedor)
- ultimo_preco_compra (número em R$)
- data_ultima_compra (data texto)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### produtos_conversoes_unidade

Tabela de unidades alternativas de comercialização do produto (Registro 0220 do SPED Fiscal).

- id (text, PK)
- ativo (boolean, padrão true)
- produto_id (relation -> produtos, obrigatório, cascadeDelete)
- unidade_id (relation -> unidades_medida, obrigatório)
- fator_conversao (número obrigatório: quantas unidades de estoque há em 1 desta unidade)
- gtin_unidade (texto opcional, código de barras da embalagem)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### produtos_historico

Tabela de histórico de alterações de código e descrição do produto (Registro 0205 do SPED Fiscal). Preenchido automaticamente sempre que a descrição do produto for alterada.

- id (text, PK)
- ativo (boolean, padrão true)
- produto_id (relation -> produtos, obrigatório, cascadeDelete)
- data_alteracao (data/hora texto obrigatória)
- descricao_anterior (texto obrigatório com a descrição antiga)
- codigo_anterior (número opcional com o código interno antigo)
- usuario_id (relation -> users, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### configuracoes

Tabela central de parâmetros visuais e operacionais gerais do ERP comercial.

- id (text, PK)
- ativo (boolean, padrão true)
- nome_sistema (texto obrigatório, até 60 caracteres, padrão "ERP Gestão Comercial")
- logo (arquivo de imagem até 5 MB, tipos PNG/JPEG/WEBP/SVG)
- cor_principal (texto opcional com código hexadecimal, ex: "#2563eb", refletido no tema da interface)
- dias_alerta_validade (inteiro, padrão 30, define a janela em dias para destaque amarelo de lote a vencer)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras: Armazena a identidade visual e nome que personalizam cabeçalho, tela de login e menu lateral. A cor principal alimenta as variáveis CSS globais (`--primary`, `--sidebar-primary`, `--ring`, `--brand-color`). O campo `dias_alerta_validade` parametriza o cálculo de advertência de produtos próximos ao vencimento na tela de Lotes e Validade (`/estoque/lotes`). Alterações gravam em `logs_auditoria`.

### plano_contas

Tabela hierárquica do Plano de Contas contábil e gerencial do ERP. É uma tabela **compartilhada por todas as empresas do grupo (sem `empresa_id`)**, garantindo padronização contábil unificada.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto hierárquico único, ex.: "1", "1.1", "1.1.01", "2.4.01")
- descricao (texto obrigatório, ex.: "Vendas de mercadorias", "Energia elétrica")
- tipo (select obrigatório: "Receita", "Despesa", "Sem resultado")
- natureza (select obrigatório: "Sintética", "Analítica")
- conta_pai_id (relation -> plano_contas, auto-referência opcional para hierarquia em árvore)
- grupo_dre (select obrigatório: "Receita bruta", "Deduções da receita", "Custo das mercadorias", "Despesas operacionais", "Resultado financeiro", "Outras receitas e despesas", "Fora da DRE")
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Somente contas com `natureza = 'Analítica'` podem ser vinculadas a títulos a pagar, títulos a receber, itens de notas e movimentações bancárias.
2. Contas que possuem contas filhas não podem ser excluídas nem inativadas enquanto houver filhos vinculados.
3. Contas com lançamentos financeiros vinculados não podem ser excluídas fisicamente; quando solicitado, o sistema realiza a inativação lógica para preservação do histórico contábil.
4. Carga inicial semeada via migration com a estrutura contábil completa (Grupos 1 - Receitas, 2 - Despesas e 3 - Movimentações sem resultado).
5. Toda alteração, inclusão e inativação gera registro detalhado em `logs_auditoria`.

### centros_custo

Tabela de Centros de Custo do ERP para rateio gerencial e apuração financeira, **compartilhada por todas as empresas (sem `empresa_id`)**.

- id (text, PK)
- ativo (boolean, padrão true)
- codigo (texto único obrigatório, ex.: "1", "ADM", "COM")
- descricao (texto obrigatório, ex.: "Geral", "Administrativo", "Comercial")
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Carga inicial semeada via migration com o registro código "1" - "Geral".
2. Centro de custo padrão é vinculado por filial através da tabela `config_financeira_empresa`.
3. Inclusão, alteração e inativação gravam em `logs_auditoria`.

### contas_financeiras

Tabela de Contas Bancárias, Aplicações Financeiras, Carteiras Digitais e Caixas Físicos, **específica por empresa (com `empresa_id` obrigatório)**.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório, cascadeDelete)
- nome (texto obrigatório, ex.: "Banestes CC 1234-5", "Caixa da loja", "Banco do Brasil")
- tipo (select obrigatório: "Conta corrente", "Poupança", "Aplicação", "Caixa físico", "Carteira digital")
- banco_codigo (texto opcional de 3 dígitos, ex.: "021", "001", "237")
- banco_nome (texto opcional)
- agencia (texto opcional)
- agencia_digito (texto opcional)
- conta (texto opcional)
- conta_digito (texto opcional)
- chave_pix (texto opcional)
- saldo_inicial (número obrigatório em R$)
- data_saldo_inicial (data texto no formato YYYY-MM-DD, obrigatória)
- saldo_atual (número em R$, **SOMENTE LEITURA nas interfaces** — mantido e recalculado pelo serviço central financeiro)
- permite_saldo_negativo (boolean, padrão true para contas bancárias e false para caixa físico)
- conta_padrao_pagamentos (boolean, garante no máximo uma conta padrão por empresa ao alternar)
- conta_padrao_recebimentos (boolean, garante no máximo uma conta padrão por empresa ao alternar)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. O campo `saldo_atual` é rigorosamente **somente leitura** nas telas; ele reflete o saldo inicial somado às movimentações e será mantido pelo serviço central financeiro em etapas futuras.
2. Trava de saldo inicial: `saldo_inicial` e `data_saldo_inicial` não podem ser alterados após a conta registrar movimentações no extrato financeiro.
3. Ao marcar `conta_padrao_pagamentos = true` ou `conta_padrao_recebimentos = true`, as demais contas da mesma empresa são automaticamente desmarcadas.
4. Toda inclusão, alteração e inativação grava em `logs_auditoria`.

### formas_pagamento

Tabela de Formas de Pagamento do ERP, **compartilhada por todas as empresas (sem `empresa_id`)**.
Será utilizada no Caixa/PDV (Etapa 5) e na emissão de cupons NFC-e e notas NF-e (Etapa 6).

- id (text, PK)
- ativo (boolean, padrão true)
- codigo_tpag (texto de 2 dígitos obrigatório, código oficial da SEFAZ na NF-e/NFC-e)
- descricao (texto obrigatório, ex.: "Dinheiro", "Cartão de crédito", "PIX")
- tipo (select obrigatório: "Dinheiro", "Cheque", "Cartão de crédito", "Cartão de débito", "PIX", "Boleto", "Transferência", "Crédito loja", "Outros")
- taxa_percentual (número opcional, taxa cobrada pela credenciadora/meio)
- dias_para_recebimento (número inteiro opcional de dias para liquidação do crédito)
- conta_financeira_padrao_id (relation -> contas_financeiras, conta destino padrão opcional)
- operadora_cliente_id (relation -> clientes, operadora/adquirente cadastrada como cliente jurídica para repasse financeiro)
- parcelado_pela_operadora (boolean, se ativado a operadora assume o parcelamento)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Carga inicial oficial da SEFAZ semeada via migration: 01 Dinheiro, 02 Cheque, 03 Cartão de crédito, 04 Cartão de débito, 05 Crédito loja, 15 Boleto, 16 Depósito bancário, 17 PIX, 18 Transferência bancária, 90 Sem pagamento, 99 Outros.
2. Documentada para consumo mandatório na frente de caixa (PDV) e motor de autorização NFC-e.
3. Inclusão, alteração e inativação gravam em `logs_auditoria`.

### formas_pagamento_taxas

Tabela de faixas de taxas e prazos de liquidação por número de parcelas para cartões de crédito e débito.

- id (text, PK)
- ativo (boolean, padrão true)
- forma_pagamento_id (relation -> formas_pagamento, obrigatório, cascadeDelete: true)
- parcelas_de (número inteiro, obrigatório, ex: 1)
- parcelas_ate (número inteiro, obrigatório, ex: 6)
- taxa_percentual (número percentual, obrigatório, ex: 3.90)
- dias_para_recebimento (número inteiro opcional de dias para repasse, ex: 30)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Permite definir taxas escalonadas (ex: 1x 3.2% em 30 dias; 2x a 6x 3.9% em 30 dias; 7x a 12x 4.8%).
2. O serviço `obterTaxaEPrazoFormaPagamento({ formaPagamentoId, numeroParcelas })` consulta esta tabela: caso encontre faixa compatível, aplica a taxa e dias específicos da faixa; se não houver faixa, recorre à `taxa_percentual` e `dias_para_recebimento` gerais da própria forma de pagamento.
3. Exclusões e alterações gravam em `logs_auditoria`.

### config_vendas_empresa

Tabela de parametrização comercial e frente de caixa (PDV) individualizada por empresa/filial, com índice único (`empresa_id` único).

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório, índice único)
- cliente_padrao_id (relation -> clientes, consumidor final padrão da frente de caixa)
- permite_vender_sem_estoque (boolean nulo/opcional; quando nulo/vazio, segue a regra `permite_estoque_negativo` da tabela `empresas`)
- exige_cliente_identificado_acima_de (número monetário opcional; vendas acima desse valor exigem identificação de CPF/CNPJ)
- bloquear_venda_prazo_cliente_bloqueado (boolean, padrão true; quando false, apenas avisa na venda a prazo)
- validade_orcamento_dias (número inteiro, padrão 7 — validade em dias para propostas e orçamentos)
- dias_para_troca (número inteiro, padrão 30 — prazo legal/comercial para trocas no balcão)
- mensagem_rodape_comprovante (texto opcional, impresso no rodapé do cupom/comprovante do PDV)
- plano_vendas_id (relation -> plano_contas, conta analítica padrão para receitas de vendas — padrão herdado da `config_financeira_empresa`)
- plano_taxas_cartao_id (relation -> plano_contas, conta analítica para despesas com taxas de cartão — padrão 2.5.03)
- plano_quebra_caixa_id (relation -> plano_contas, conta analítica para diferenças negativas/quebra de caixa — padrão 2.8.01)
- plano_sobra_caixa_id (relation -> plano_contas, conta analítica para diferenças positivas/sobra de caixa — padrão 1.3.01)
- fechamento_cego (boolean, padrão true — quando ativo, oculta os valores esperados no fechamento de caixa até que o operador informe a contagem física)
- balanca_ativa (boolean, padrão false — habilita leitura de etiquetas EAN-13 de balança de pesagem no checkout)
- balanca_prefixo (texto, padrão '2' — dígito inicial da etiqueta EAN-13 de balança)
- balanca_tipo (select: 'Preço' | 'Peso', padrão 'Preço' — se 'Preço', posições 8 a 12 contêm centavos do valor total; se 'Peso', posições 8 a 12 contêm gramas)
- balanca_posicao_codigo (número, padrão 2 — posição inicial 1-based do código do produto no código de barras)
- balanca_tamanho_codigo (número, padrão 5 — quantidade de dígitos do código do produto na etiqueta)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Criada automaticamente na primeira abertura da tela `/vendas/configuracoes` com os padrões estabelecidos e resolução automática de IDs do plano de contas.
2. O cliente padrão "Consumidor Final" é garantido e criado automaticamente caso não exista (Pessoa Física, sem CPF, `indicador_ie = '9'` e `consumidor_final = true`).
3. Toda alteração grava em `logs_auditoria`.

### pdv_terminais

Tabela de pontos de venda e terminais de caixa físicos das empresas/filiais.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- nome (texto obrigatório, ex: "Caixa 01", "Balcão PDV")
- conta_financeira_id (relation -> contas_financeiras, obrigatório; validação rígida: deve pertencer à mesma empresa e ser do tipo "Caixa físico")
- conta_cofre_id (relation -> contas_financeiras, opcional; conta para destino de sangrias de caixa; padrão sugerido = `conta_padrao_recebimentos` da empresa)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Toda alteração, inclusão ou inativação grava em `logs_auditoria`.
2. O terminal possui controle de sessão única aberta (um operador por vez com turno aberto).

### caixa_sessoes

Tabela mestre de turnos e sessões de caixa da empresa/filial, operada exclusivamente por usuários com `e_caixa = true`.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- pdv_terminal_id (relation -> pdv_terminais, obrigatório)
- operador_id (relation -> usuarios, obrigatório)
- status (select: "Aberto" | "Fechado", obrigatório)
- data_abertura (texto/ISO, obrigatório)
- valor_abertura (número monetário — fundo de troco informado)
- data_fechamento (texto/ISO, opcional)
- valor_esperado_dinheiro (número monetário — apurado na finalização do turno)
- valor_contado_dinheiro (número monetário — contado pelo operador)
- diferenca_dinheiro (número monetário — valor_contado - valor_esperado)
- totais_por_forma (json — array com forma_id, forma_descricao, codigo_tpag, quantidade_vendas, valor_esperado, valor_informado, diferenca)
- quantidade_vendas (número inteiro — total de vendas finalizadas na sessão)
- valor_vendas (número monetário — soma do valor das vendas finalizadas)
- valor_cancelado (número monetário — soma do valor de vendas canceladas)
- valor_sangrias (número monetário — acumulado de sangrias do turno)
- valor_suprimentos (número monetário — acumulado de suprimentos do turno)
- observacao_fechamento (texto opcional)
- conferido_por_id (relation -> usuarios, supervisor que auditou o fechamento)
- data_conferencia (texto/ISO, data em que foi homologado)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. `createRule: null`, `updateRule: null`, `deleteRule: null` — gravação e mutação restritas aos endpoints transacionais `/backend/v1/caixa/abrir`, `/backend/v1/caixa/fechar` e `/backend/v1/caixa/conferir`.
2. Sessão Fechada não reabre em hipótese alguma.
3. Diferenças no dinheiro geram lançamento avulso automático na conta de caixa do terminal: falta debita no `plano_quebra_caixa_id` e sobra credita no `plano_sobra_caixa_id`.
4. Auditoria obrigatória em `logs_auditoria` para todas as ações.

### caixa_sessoes_movimentos

Tabela analítica de movimentações financeiras de caixa da sessão (sangrias, suprimentos e ajustes).

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- caixa_sessao_id (relation -> caixa_sessoes, obrigatório)
- tipo (select: "Sangria" | "Suprimento" | "Fundo_Inicial" | "Ajuste_Falta" | "Ajuste_Sobra", obrigatório)
- valor (número monetário, obrigatório > 0)
- motivo (texto obrigatório)
- movimentacao_financeira_id (relation -> movimentacoes_financeiras, opcional — vínculo com o extrato bancário/caixa)
- transferencia_id (texto opcional — identificador da transferência cofre ↔ caixa)
- operador_id (relation -> usuarios, opcional)
- data_hora (texto/ISO, obrigatório)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. `createRule: null`, `updateRule: null`, `deleteRule: null` — gravação exclusiva via serviços de backend (`/backend/v1/caixa/sangria`, `/backend/v1/caixa/suprimento`, `/backend/v1/caixa/abrir` e `/backend/v1/caixa/fechar`).
2. Sangrias transferem automaticamente o numerário para a `conta_cofre_id` do terminal pelo serviço central `/financeiro/bancos/transferir`.
3. Suprimentos transferem da `conta_cofre_id` para a conta de caixa do terminal.
4. Gera comprovante de sangria para impressão imediata com assinatura do operador e supervisor.

### vendas

Tabela mestre de cabeçalhos de vendas comerciais, orçamentos, pedidos e vendas na frente de caixa (PDV) da empresa/filial.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- numero (número inteiro sequencial por empresa, obrigatório)
- tipo (select: 'Orçamento' | 'Pedido' | 'PDV', obrigatório)
- status (select: 'Orçamento' | 'Pedido em aberto' | 'Finalizada' | 'Cancelada' | 'Orçamento expirado', obrigatório)
- cliente_id (relation -> clientes, obrigatório)
- cpf_cnpj_consumidor (texto opcional — CPF/CNPJ informado no cupom/PDV)
- vendedor_id (relation -> usuarios, opcional — vendedor comissionado)
- operador_id (relation -> usuarios, opcional — usuário que registrou a venda)
- pdv_terminal_id (relation -> pdv_terminais, opcional — terminal físico de caixa)
- caixa_sessao_id (texto opcional — ID da sessão/turno de caixa)
- data_emissao (texto/data YYYY-MM-DD, obrigatório)
- data_validade (texto/data opcional — validade para orçamentos)
- data_finalizacao (texto/data opcional — data/hora em que a venda foi finalizada)
- valor_produtos (número monetário, 2 casas, obrigatório)
- valor_desconto_itens (número monetário, soma dos descontos dos itens)
- valor_desconto_total (número monetário, desconto global da venda)
- valor_acrescimo (número monetário, acréscimos globais)
- valor_frete (número monetário, frete cobrado do cliente)
- valor_total (número monetário, 2 casas, obrigatório)
- custo_total (número monetário, custo consolidado apurado via FEFO dos produtos)
- condicao_pagamento_id (relation -> condicoes_pagamento, opcional)
- observacao (texto opcional — observações internas)
- observacao_cliente (texto opcional — mensagem impressa no comprovante)
- venda_origem_id (texto opcional — ID do orçamento/pedido de origem)
- documento_fiscal_status (select: 'Não emitido' | 'Autorizada' | 'Cancelada' | 'Rejeitada', opcional)
- documento_fiscal_id (texto opcional — ID do documento fiscal na Etapa 6)
- motivo_cancelamento (texto opcional — preenchido quando status = 'Cancelada')
- data_cancelamento (texto/data opcional)
- usuario_cancelamento_id (relation -> usuarios, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras de Banco e Acesso (API Rules):

- `listRule: "@request.auth.id != ''"`, `viewRule: "@request.auth.id != ''"`
- `createRule: "@request.auth.id != ''"` (para rascunhos, orçamentos e pré-vendas)
- `updateRule: "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada'"`
- `deleteRule: "@request.auth.id != '' && status != 'Finalizada' && status != 'Cancelada'"`
- Vendas com status 'Finalizada' e 'Cancelada' são categoricamente imutáveis via client direto; só o serviço central de backend pode finalizá-las ou cancelá-las.

### vendas_itens

Tabela analítica de itens e mercadorias negociadas em cada venda/orçamento/pedido.

- id (text, PK)
- ativo (boolean, padrão true)
- venda_id (relation -> vendas, obrigatório, cascadeDelete: true)
- item (número inteiro sequencial, obrigatório 1..N)
- produto_id (relation -> produtos, obrigatório)
- descricao (texto obrigatório — descrição da mercadoria no momento da venda)
- unidade (texto obrigatório — UN, KG, CX, etc.)
- quantidade (número, obrigatório > 0)
- preco_unitario (número monetário, valor líquido unitário faturado)
- preco_tabela (número monetário opcional — preço original de catálogo)
- desconto_percentual (número percentual opcional)
- desconto_valor (número monetário opcional)
- acrescimo_valor (número monetário opcional)
- valor_total (número monetário, 2 casas, obrigatório)
- custo_unitario (número monetário, custo ponderado/FEFO apurado na saída de estoque)
- lote_id (relation -> lotes, opcional — lote específico atribuído na saída)
- ncm (texto fiscal opcional)
- cest (texto fiscal opcional)
- cfop (texto fiscal opcional)
- origem (texto fiscal opcional — origem da mercadoria 0..8)
- cst_icms (texto fiscal opcional)
- csosn (texto fiscal opcional)
- aliquota_icms (número percentual opcional)
- cst_pis (texto fiscal opcional)
- cst_cofins (texto fiscal opcional)
- perfil_tributario_id (relation -> perfis_tributarios, opcional)
- quantidade_devolvida (número opcional — controle de devoluções)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras de Banco e Acesso (API Rules):

- `createRule`, `updateRule`, `deleteRule` permitidos somente se a venda pai (`@collection.vendas.id = venda_id`) não estiver 'Finalizada' nem 'Cancelada'.

### vales_troca

Tabela de cupons de crédito loja gerados a partir de trocas e devoluções de mercadorias.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- codigo (text, obrigatório — código único do cupom, ex: "VT-1042-AB3X")
- cliente_id (relation -> clientes, opcional — cliente titular do vale)
- valor (número monetário, valor original emitido)
- saldo (número monetário, saldo disponível para abatimento em novas compras)
- validade (texto/data YYYY-MM-DD, data limite para utilização)
- venda_origem_id (relation -> vendas, opcional — venda original que originou a devolução)
- status (select: 'Ativo' | 'Usado' | 'Expirado' | 'Cancelado', obrigatório)
- observacao (texto opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras de Banco e Acesso (API Rules):

- `listRule: "@request.auth.id != ''"`, `viewRule: "@request.auth.id != ''"`, `createRule: "@request.auth.id != ''"`, `updateRule: "@request.auth.id != ''"`, `deleteRule: "@request.auth.id != ''"`
- Aceito no PDV e na venda convencional como forma de pagamento "Vale-troca" (`codigo_tpag = '99'`), abatendo o saldo do vale diretamente via serviço central `abaterSaldoValeTroca`.

### vendas_pagamentos

Tabela de registro e conciliação dos pagamentos efetuados na finalização da venda.

- id (text, PK)
- ativo (boolean, padrão true)
- venda_id (relation -> vendas, obrigatório, cascadeDelete: true)
- forma_pagamento_id (relation -> formas_pagamento, obrigatório)
- valor (número monetário, obrigatório > 0)
- troco (número monetário opcional — troco devolvido em dinheiro)
- parcelas (número inteiro opcional — quantidade de parcelas no cartão/crediário)
- bandeira (texto opcional — ex: Visa, Mastercard)
- nsu (texto opcional — número sequencial único do TEF/POS)
- codigo_autorizacao (texto opcional — autorização da adquirente)
- taxa_percentual (número percentual — taxa da operadora de cartão aplicada)
- valor_taxa (número monetário — valor descontado pela adquirente)
- conta_financeira_id (relation -> contas_financeiras, opcional — caixa físico ou conta de crédito)
- conta_receber_ids (json opcional — array com os IDs dos títulos a receber gerados no crediário/cartão)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras de Banco e Acesso (API Rules):

- `listRule: "@request.auth.id != ''"`, `viewRule: "@request.auth.id != ''"`
- `createRule: null`, `updateRule: null`, `deleteRule: null` (TOTALMENTE FECHADAS PARA O NAVEGADOR).
- Nenhuma tela cliente ou hook de frontend grava diretamente nesta tabela; gravação exclusiva pelo serviço central `/backend/v1/vendas/finalizar`.

### config_financeira_empresa

Tabela de parametrização financeira individualizada por empresa/filial, com índice único por empresa (`empresa_id` único).

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório, índice único)
- multa_atraso_percentual (número percentual, cobrado uma vez após o vencimento)
- juros_mora_mensal_percentual (número percentual mensal, calculado pro rata die: taxa ÷ 30 × dias corridos)
- dias_carencia (inteiro de dias após o vencimento antes de incidir juros ou multa)
- plano_compras_revenda_id (relation -> plano_contas, conta analítica padrão para compras revenda)
- plano_industrializacao_id (relation -> plano_contas, conta analítica padrão para matéria-prima/insumos)
- plano_uso_consumo_id (relation -> plano_contas, conta analítica padrão para material de uso/consumo)
- plano_imobilizado_id (relation -> plano_contas, conta analítica padrão para imobilizado)
- plano_outras_entradas_id (relation -> plano_contas, conta analítica padrão para outras entradas)
- plano_vendas_id (relation -> plano_contas, conta analítica padrão para receitas de vendas)
- plano_juros_recebidos_id (relation -> plano_contas, conta analítica padrão para juros recebidos)
- plano_juros_pagos_id (relation -> plano_contas, conta analítica padrão para juros pagos)
- plano_descontos_obtidos_id (relation -> plano_contas, conta analítica padrão para descontos obtidos)
- plano_descontos_concedidos_id (relation -> plano_contas, conta analítica padrão para descontos concedidos)
- plano_transferencias_id (relation -> plano_contas, conta analítica padrão para transferências financeiras)
- centro_custo_padrao_id (relation -> centros_custo, centro de custo padrão da empresa)
- dias_tolerancia_bloqueio (número inteiro, padrão 5 — tolerância de atraso para crédito e bloqueio do cliente)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Criada automaticamente na primeira visualização da empresa com os defaults do plano de contas semeado (2.1.01, 2.1.03, 2.4.07, 2.7.01, 2.8.01, 1.1.01, 1.2.01, 2.6.01, 1.2.02, 2.6.03, 3.1.01) e centro de custo "Geral".
2. Toda alteração grava em `logs_auditoria`.

### contas_pagar

Tabela central de títulos e obrigações a pagar do ERP, individualizada por empresa/filial (`empresa_id`).

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- fornecedor_id (relation -> fornecedores, obrigatório)
- numero_documento (text, obrigatório — número da NF ou documento de cobrança)
- parcela_numero (número inteiro, padrão 1)
- parcela_total (número inteiro, padrão 1)
- data_emissao (date, YYYY-MM-DD, obrigatório)
- data_vencimento (date, YYYY-MM-DD, obrigatório)
- data_competencia (date, YYYY-MM-DD, padrão data_emissao)
- data_liquidacao (date, YYYY-MM-DD, data em que o título foi totalmente quitado)
- valor_original (número monetário, 2 casas, obrigatório > 0)
- valor_pago (número monetário, 2 casas, padrão 0 — soma das baixas ativas)
- saldo (número monetário, 2 casas, padrão valor_original — valor_original - valor_pago)
- status (select: "Em aberto", "Parcialmente pago", "Pago", "Cancelado", padrão "Em aberto")
- plano_conta_id (relation -> plano_contas, obrigatório, conta analítica de despesa)
- centro_custo_id (relation -> centros_custo, opcional)
- origem (select: "MANUAL", "NF_ENTRADA", "PEDIDO_COMPRA", "OUTROS", padrão "MANUAL")
- origem_id (text, opcional — ID do registro de origem, ex: notas_entrada.id)
- historico (text, opcional — histórico complementar do lançamento)
- observacoes (text, opcional)
- motivo_cancelamento (text, opcional — preenchido quando status = "Cancelado")
- cancelado_em (date/text, opcional)
- cancelado_por (relation -> users, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Atualizações de `valor_pago`, `saldo` e `status` ocorrem estritamente via serviço central de pagamentos (`/financeiro/pagar/baixar`, `/financeiro/pagar/estornar-baixa`) ou cancelamento.
2. Título com baixas ativas não pode ser cancelado diretamente: exige estorno prévio de todos os pagamentos.
3. Título originado por Nota Fiscal de Entrada (`origem = "NF_ENTRADA"`) não pode ser cancelado diretamente na tela de Contas a Pagar: o cancelamento deve ser feito pelo cancelamento do lançamento da respectiva nota no módulo de Compras.
4. Índices para consultas rápidas: `empresa_id + status + data_vencimento`, `empresa_id + fornecedor_id`, `empresa_id + origem + origem_id`.

---

### pagamentos_lotes

Cabeçalho de agrupamento de pagamentos efetuados em lote ou individualmente.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- conta_financeira_id (relation -> contas_financeiras, obrigatório — conta bancária ou caixa debitado)
- forma_pagamento_id (relation -> formas_pagamento, obrigatório)
- data_pagamento (date, YYYY-MM-DD, obrigatório)
- valor_total_principal (número monetário, soma dos valores de amortização)
- valor_total_multa (número monetário, soma das multas)
- valor_total_juros (número monetário, soma dos juros)
- valor_total_desconto (número monetário, soma dos descontos obtidos)
- valor_total_pago (número monetário, principal + multa + juros - desconto)
- quantidade_titulos (número inteiro)
- documento_pagamento (text, opcional — autenticação, NSU, comprovante bancário)
- observacoes (text, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

---

### contas_receber

Tabela central de títulos e direitos creditórios a receber do ERP, individualizada por empresa/filial (`empresa_id`) e espelho transacional de contas_pagar.

- id (text, PK)
- ativo (boolean, padrão true)
- excluido (boolean, padrão false — exclusão lógica)
- empresa_id (relation -> empresas, obrigatório)
- cliente_id (relation -> clientes, obrigatório)
- numero_documento (text, obrigatório — número da fatura, pedido, NF ou recibo)
- parcela (text, padrão '1/1' — formato '1/3', '2/3', etc.)
- parcela_numero (número inteiro, padrão 1)
- total_parcelas (número inteiro, padrão 1)
- descricao (text, obrigatório — descrição do recebimento)
- data_emissao (date, YYYY-MM-DD, obrigatório)
- data_vencimento (date, YYYY-MM-DD, obrigatório)
- data_competencia (date, YYYY-MM-DD, padrão data_emissao)
- data_recebimento (date, YYYY-MM-DD, preenchido quando status = 'Recebido')
- valor_original (número monetário, 2 casas, obrigatório > 0)
- valor_recebido (número monetário, 2 casas, padrão 0 — amortizações ativas)
- saldo (número monetário, 2 casas, padrão valor_original)
- status (select: 'Aberto', 'Parcial', 'Recebido', 'Cancelado', padrão 'Aberto')
- plano_conta_id (relation -> plano_contas, analítica de Receita ou Sem resultado, obrigatório)
- centro_custo_id (relation -> centros_custo, opcional)
- forma_pagamento_prevista_id (relation -> formas_pagamento, opcional)
- origem (select: 'Manual', 'Venda', 'PDV', 'Recorrência', 'Outro', padrão 'Manual')
- origem_id (text, opcional — ID da venda, pedido ou contrato de origem)
- recorrencia_id (text, opcional — UUID que agrupa títulos da mesma recorrência mensal)
- recorrencia_numero (número inteiro, opcional — parcela recorrente 1..N)
- recorrencia_total (número inteiro, opcional — total de meses contratados)
- observacao (text, opcional)
- motivo_cancelamento (text, opcional)
- cancelado_em (date/text, opcional)
- cancelado_por (relation -> users, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Atualizações de `valor_recebido`, `saldo` e `status` ocorrem estritamente via serviço central de recebimentos (`/financeiro/receber/baixar`, `/financeiro/receber/estornar-recebimento`) ou cancelamento.
2. Título com recebimentos ativos não pode ser cancelado diretamente: exige estorno prévio das baixas.
3. Índices rápidos: `empresa_id + cliente_id + status`, `empresa_id + data_vencimento`, `empresa_id + status`.

---

### pagamentos_baixas

Registro analítico individual de cada baixa/amortização de um título a pagar ou a receber.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- tipo_operacao (select: 'Pagar' | 'Receber', padrão 'Pagar')
- conta_pagar_id (relation -> contas_pagar, opcional quando tipo_operacao='Receber')
- conta_receber_id (relation -> contas_receber, opcional quando tipo_operacao='Pagar')
- lote_pagamento_id / lote_id (relation -> pagamentos_lotes, opcional)
- conta_financeira_id (relation -> contas_financeiras, obrigatório)
- forma_pagamento_id (relation -> formas_pagamento, obrigatório)
- data_pagamento (date, YYYY-MM-DD, obrigatório)
- valor_pago (número monetário, amortização sobre o principal)
- valor_multa (número monetário, padrão 0)
- valor_juros (número monetário, padrão 0)
- valor_desconto (número monetário, padrão 0)
- valor_total_pago (número monetário, valor_pago + valor_multa + valor_juros - valor_desconto)
- estornado (boolean, padrão false)
- data_estorno (date/text, opcional)
- motivo_estorno (text, opcional)
- estornado_por (relation -> users, opcional)
- movimentacao_financeira_id (relation -> movimentacoes_financeiras, movimento de débito gerado)
- movimentacao_estorno_id (relation -> movimentacoes_financeiras, movimento de crédito do estorno)
- observacoes (text, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras:

1. Toda baixa gera uma movimentação financeira correspondente de saída (`tipo_movimento = "Saída"`) na `conta_financeira_id`.
2. O estorno da baixa marca `estornado = true`, preenche justificativa e usuário, e gera uma movimentação financeira de entrada com `origem = "ESTORNO"` para recompor o saldo bancário.
3. API Rules: `createRule: null`, `updateRule: null`, `deleteRule: null` — alterações somente via endpoints transacionais do backend.

---

### movimentacoes_financeiras

Extrato e trilha completa de auditoria financeira das contas bancárias e caixas do ERP.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- conta_financeira_id (relation -> contas_financeiras, obrigatório)
- tipo_movimento (select: "Entrada", "Saída", obrigatório)
- data_movimento (date, YYYY-MM-DD, obrigatório)
- data_competencia (date, YYYY-MM-DD, obrigatório)
- valor (número monetário, 2 casas, sempre positivo)
- plano_conta_id (relation -> plano_contas, obrigatório)
- centro_custo_id (relation -> centros_custo, opcional)
- origem (select: "PAGAMENTO_FORNECEDOR", "RECEBIMENTO_CLIENTE", "TRANSFERENCIA_ENTRE_CONTAS", "SALDO_INICIAL", "AJUSTE", "ESTORNO", "TARIFA_BANCARIA", "OUTROS", obrigatório)
- origem_id (text, opcional — ID do registro gerador, ex: pagamentos_baixas.id)
- historico (text, obrigatório)
- documento_numero (text, opcional)
- conciliado (boolean, padrão false)
- data_conciliacao (date/text, opcional)
- transferencia_id (text, opcional — identificador da transferência ligando saída e entrada)
- lancamento_avulso (boolean, opcional — indica lançamento bancário avulso direto)
- saldo_anterior (número monetário, saldo da conta imediatamente antes deste movimento)
- saldo_posterior (número monetário, saldo resultante após este movimento)
- estornado (boolean, padrão false)
- motivo_estorno (text, opcional)
- data_estorno (text, opcional)
- usuario_estorno_id (relation -> users, opcional)
- movimento_estorno_id (relation -> movimentacoes_financeiras, opcional)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

### extratos_linhas

Linhas importadas de extratos bancários (OFX) para conciliação bancária contra os movimentos do ERP.

- id (text, PK)
- ativo (boolean, padrão true)
- empresa_id (relation -> empresas, obrigatório)
- conta_financeira_id (relation -> contas_financeiras, obrigatório)
- fitid (text, obrigatório — identificador único da transação bancária)
- data (text, YYYY-MM-DD, obrigatório)
- valor (número monetário, positivo crédito, negativo débito, obrigatório)
- descricao (text, histórico/memo do banco, obrigatório)
- situacao (select: "Pendente", "Conciliada", "Ignorada", obrigatório)
- movimentos_ids (json, array de IDs das movimentacoes_financeiras casadas)
- arquivo_importacao (text, nome do arquivo .OFX importado)
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Índice único: `conta_financeira_id + fitid` (impede duplicação de transações importadas).

Regras:

1. **REGRA MANDATÓRIA:** O campo `saldo_atual` da tabela `contas_financeiras` só pode ser alterado pelo serviço central financeiro via inserção de `movimentacoes_financeiras`. Nenhuma tela grava diretamente em `saldo_atual`.
2. API Rules: `createRule: null`, `updateRule: null`, `deleteRule: null` — imutabilidade e proteção em nível de banco.

#### Componentes reutilizáveis

- `<SelectProduto />` (`@/components/SelectProduto`): combobox com busca de produtos ativos por código, GTIN ou descrição, exibindo foto miniatura e preço de venda. Permite filtro opcional por `filtroTipo` ("Produto", "Serviço", "Kit"). Pronto para uso em PDV, compras, orçamentos e emissão de notas:

```tsx
import { SelectProduto } from '@/components/SelectProduto'
;<SelectProduto
  value={produtoId}
  onChange={(id, produto) => setProdutoId(id)}
  filtroTipo="Produto" // opcional
  placeholder="Selecione ou busque o produto..."
/>
```

## Etapa 1 concluída

A Etapa 1 (Fundação, Cadastros Base, Motor Fiscal e Configurações Gerais) foi totalmente concluída com padrão visual coeso, máscaras oficiais, validações brasileiras (CPF, CNPJ alfanumérico, IE ES com módulo 11), auditoria detalhada em todas as tabelas e controle de permissões por módulo.

### Todas as Telas Existentes

1. `/painel` (`@/pages/Index.tsx`): Painel inicial com indicadores de clientes, fornecedores, produtos e usuários ativos, atalho para conferência de produtos com fiscal incompleto, lista dos 10 últimos cadastros intercalados e pendências de configuração automáticas.
2. `/cadastros/empresas` (`@/pages/cadastros/EmpresasLista.tsx`): Listagem completa de matriz e filiais com filtros, busca, situação, paginação, exportação CSV e ações.
3. `/cadastros/empresas/novo` e `/cadastros/empresas/:id/editar` (`@/pages/cadastros/EmpresaForm.tsx`): Formulário em abas (Identificação, Regime Tributário, Endereço ViaCEP, Contato, Responsável Legal, Contabilidade para SPED 0100).
4. `/cadastros/usuarios` (`@/pages/cadastros/UsuariosLista.tsx`): Gestão de usuários, perfis vinculados, comissão, desconto máximo e status.
5. `/cadastros/usuarios/novo` e `/cadastros/usuarios/:id/editar` (`@/pages/cadastros/UsuarioForm.tsx`): Criação com credenciais de login, foto, perfil de acesso e amarração multiempresa.
6. `/cadastros/perfis-acesso` (`@/pages/cadastros/PerfisAcessoLista.tsx`): Listagem de perfis de operadores e administradores.
7. `/cadastros/perfis-acesso/novo` e `/cadastros/perfis-acesso/:id/editar` (`@/pages/cadastros/PerfilAcessoForm.tsx`): Matriz completa de permissões por módulo (ver, criar, editar, excluir) e flag de administrador total.
8. `/cadastros/clientes` (`@/pages/cadastros/ClientesLista.tsx`): Listagem de clientes com busca, filtros de tipo e situação, exportação CSV e atalho para cadastro rápido.
9. `/cadastros/clientes/novo` e `/cadastros/clientes/:id/editar` (`@/pages/cadastros/ClienteForm.tsx`): Formulário em abas (Dados Fiscais, Endereço Principal e Entrega, Contatos e Dados Comerciais) com suporte a Física, Jurídica e Estrangeiro.
10. `/cadastros/fornecedores` (`@/pages/cadastros/FornecedoresLista.tsx`): Listagem de fornecedores e parceiros comerciais com busca, filtros por tipo de fornecedor e exportação CSV.
11. `/cadastros/fornecedores/novo` e `/cadastros/fornecedores/:id/editar` (`@/pages/cadastros/FornecedorForm.tsx`): Formulário em abas (Dados Gerais, Consulta BrasilAPI CNPJ, Endereço ViaCEP, Contatos, Comercial e Dados Bancários/PIX).
12. `/cadastros/produtos` (`@/pages/cadastros/ProdutosLista.tsx`): Catálogo de mercadorias, serviços e kits com filtros rápidos, busca por GTIN/código, exportação CSV e miniaturas.
13. `/cadastros/produtos/conferencia` (`@/pages/cadastros/ConferenciaFiscalPage.tsx`): Tela especializada para revisão e saneamento fiscal em lote de produtos com pendências.
14. `/cadastros/produtos/novo` e `/cadastros/produtos/:id/editar` (`@/pages/cadastros/ProdutoForm.tsx`): Formulário completo em abas (Dados Gerais, Unidades de Medida, Preços e Margens, Estoque e Parâmetros, Fiscal Completo NF-e/SPED, Kits e Conversões).
15. `/cadastros/marcas` (`@/pages/cadastros/MarcasPage.tsx`): Gestão de marcas e fabricantes com listagem, modal de cadastro e inativação segura.
16. `/cadastros/grupos-categorias` (`@/pages/cadastros/GruposCategoriasPage.tsx`): Classificação mercadológica em 2 níveis (Grupos e Categorias encadeadas) com margens padrão e perfis tributários.
17. `/cadastros/unidades-medida` (`@/pages/cadastros/UnidadesMedidaPage.tsx`): Tabela de unidades comerciais e tributárias (UN, KG, CX...) com controle de fracionamento.
18. `/cadastros/tabelas-fiscais` (`@/pages/cadastros/TabelasFiscaisHubPage.tsx`): Hub central com atalhos e contadores de NCM, CEST, CFOP, Códigos Oficiais e Perfis Tributários.
19. `/cadastros/tabelas-fiscais/codigos` (`@/pages/cadastros/CodigosFiscaisPage.tsx`): Tabela oficial de CSTs, CSOSN, Origens, Enquadramentos e Reforma Tributária (IBS/CBS).
20. `/cadastros/tabelas-fiscais/ncm` (`@/pages/cadastros/NcmPage.tsx`): Nomenclatura Comum do Mercosul com busca por código e descrição, importação CSV e vigências.
21. `/cadastros/tabelas-fiscais/cest` (`@/pages/cadastros/CestPage.tsx`): Códigos Especificadores da Substituição Tributária com NCMs vinculados e importação CSV.
22. `/cadastros/tabelas-fiscais/cfop` (`@/pages/cadastros/CfopPage.tsx`): Códigos Fiscais de Operações com classificação automática de Entrada/Saída, abrangência, estoque e financeiro.
23. `/cadastros/tabelas-fiscais/perfis` (`@/pages/cadastros/PerfisTributariosPage.tsx`): Perfis tributários com definição dos 8 cenários de operações comerciais.
24. `/configuracoes/geral` (`@/pages/configuracoes/ConfiguracoesGeralPage.tsx`): Nome do sistema, upload do logotipo e paleta de cores do tema dinâmico.
25. `/configuracoes/auditoria` (`@/pages/configuracoes/LogAuditoriaPage.tsx`): Consulta detalhada de logs de auditoria com diff de antes/depois e filtros por tabela, usuário e período.
26. `/cadastros/condicoes-pagamento` (`@/pages/cadastros/CondicoesPagamentoPage.tsx`): Gestão de condições de pagamento com listagem, busca, filtros de tipo/uso/situação, simulação interativa de parcelas com cálculo em tempo real e exportação CSV.
27. `/estoque/lotes` (`@/pages/estoque/LotesValidadePage.tsx`): Gestão e rastreabilidade de lotes e datas de validade com classificação automática (Vencido, Vence em até X dias, OK), contagem regressiva em dias, filtros por produto/situação/período e exportação CSV.

### Todas as Tabelas Criadas (47 tabelas)

1. `users`: Coleção de autenticação do Skip Cloud / PocketBase com e-mail, senha e verificação.
2. `logs_auditoria`: Trilha de auditoria com usuário, tabela, registro, ação (inclusao, alteracao, inativacao, ativacao) e diff JSON.
3. `empresas`: Cadastro multiempresa de matriz e filiais com regimes tributários, SPED e dados de contabilidade.
4. `perfis_acesso`: Níveis de permissão e flag de administrador irrestrito.
5. `permissoes`: Matriz por módulo (ver, criar, editar, excluir) vinculada ao perfil.
6. `usuarios`: Colaboradores do ERP vinculados ao auth, perfis, empresa padrão e comissões.
7. `usuarios_empresas`: Vínculos de autorização entre colaboradores e filiais autorizadas.
8. `unidades_medida`: Siglas e descrições de unidades com suporte a fracionamento.
9. `tabelas_fiscais_codigos`: Códigos fiscais oficiais (CST, CSOSN, Origem, etc.).
10. `ncm`: Classificação fiscal NCM de 8 dígitos.
11. `cest`: Código de Substituição Tributária de 7 dígitos.
12. `cfop`: Códigos de Operação e Prestação de 4 dígitos.
13. `marcas`: Fabricantes e marcas comerciais.
14. `grupos`: Nível 1 da árvore mercadológica com margem sugerida.
15. `categorias`: Nível 2 encadeado ao grupo pai.
16. `clientes`: Clientes físicos, jurídicos e estrangeiros com endereços e dados comerciais.
17. `fornecedores`: Fornecedores com contas bancárias, PIX e tipos de fornecimento.
18. `perfis_tributarios`: Cabeçalhos de regras fiscais parametrizadas.
19. `perfis_tributarios_regras`: Regras detalhadas dos 8 cenários fiscais por perfil.
20. `produtos`: Cadastro mestre com dados gerais, fiscais, preços, margens e estoque.
21. `produtos_kit_itens`: Componentes de produtos do tipo Kit.
22. `produtos_fornecedores`: Relacionamento de-para de produtos com fornecedores e cProd.
23. `produtos_conversoes_unidade`: Fatores de conversão e unidades alternativas (SPED 0220).
24. `produtos_historico`: Registro histórico de alterações de código e descrição (SPED 0205).
25. `configuracoes`: Nome do sistema, logotipo, cor temática primária e dias de alerta de validade de lotes.
26. `condicoes_pagamento`: Condições de pagamento com prazos, entrada, juros, desconto e dia fixo.
27. `lotes`: Controle de lotes, datas de fabricação/validade e saldos segregados por empresa e produto.
28. `transferencias`: Cabeçalho de remessas e transferências entre empresas (filiais).
29. `transferencias_itens`: Itens movimentados nas transferências com lotes e conferência de divergência.
30. `inventarios`: Cabeçalho de inventários físicos de estoque com data de referência e motivo SPED.
31. `inventarios_itens`: Grade de produtos inventariados com saldo congelado, contagem, diferenças e custos.
32. `config_fiscal_empresa`: Configuração de parâmetros fiscais padrão, alíquotas internas e margens por empresa.
33. `regras_fiscais_ncm`: Regras fiscais parametrizadas por prefixo/código de NCM com priorização para o motor tributário.
34. `icms_aliquotas_uf`: Alíquotas internas básicas de ICMS e percentual de FCP de cada uma das 27 UFs.
35. `icms_interestadual`: Matriz interestadual de ICMS entre UFs de origem e destino (Resolução SF 22/1989).
36. `plano_contas`: Estrutura hierárquica contábil e gerencial compartilhada por todas as empresas (sem `empresa_id`).
37. `centros_custo`: Centros de custo e rateio compartilhados entre empresas (sem `empresa_id`).
38. `contas_financeiras`: Contas bancárias correntes, poupanças, aplicações e caixas físicos por filial (`empresa_id`).
39. `formas_pagamento`: Catálogo de formas de pagamento com código fiscal oficial tPag da SEFAZ, taxas e prazos.
40. `config_financeira_empresa`: Parametrização financeira exclusiva de cada empresa (`empresa_id` único) com multas, juros de mora e contas contábeis padrão.
41. `contas_pagar`: Títulos de contas a pagar por empresa com controle de parcelamento, plano de contas e status analítico.
42. `pagamentos_lotes`: Lotes de pagamentos com conta financeira, forma de pagamento e totalizações.
43. `pagamentos_baixas`: Baixas analíticas de pagamento com amortização, juros, multa, desconto e rastro de estorno.
44. `movimentacoes_financeiras`: Movimentações e extrato de débito/crédito das contas financeiras com recomposição de saldo anterior e posterior.
45. `formas_pagamento_taxas`: Faixas de taxas e prazos de recebimento por número de parcelas para cartões de crédito e débito.
46. `config_vendas_empresa`: Parametrização comercial, frente de caixa, consumidor padrão, políticas de estoque e contas contábeis por filial (`empresa_id` único).
47. `pdv_terminais`: Terminais de caixa físico e pontos de atendimento do PDV com contas financeiras vinculadas.
48. `vendas`: Cabeçalho comercial e de PDV com numeração sequencial, tipo, status analítico, valores consolidados, cliente e auditoria.
49. `vendas_itens`: Itens e mercadorias negociadas por venda com quantidades, valores unitários, tributos e rastro de lote.
50. `vendas_pagamentos`: Conciliação de pagamentos da finalização da venda (dinheiro com troco, cartão com taxa e crediário com títulos).

### Todos os Componentes Reutilizáveis e Funções Utilitárias

- `<SelectCodigoFiscal />` (`@/components/SelectCodigoFiscal`): Combobox com busca de códigos fiscais oficiais (`tipo="CST_ICMS"`, `tipo="CSOSN"`, `tipo="ORIGEM"`...) exibindo "código - descrição".
- `<SelectNcm />` (`@/components/SelectNcm`): Combobox com busca em tempo real por 8 dígitos ou descrição de NCMs ativos.
- `<SelectCest />` (`@/components/SelectCest`): Combobox de CESTs com busca e filtragem/sugestão contextual pela NCM informada (`ncmVinculado={ncm}`).
- `<SelectCfop />` (`@/components/SelectCfop`): Combobox de CFOPs com filtro automático por tipo de operação (`tipoMovimento="Saída"` ou `"Entrada"`).
- `<SelectPerfilTributario />` (`@/components/SelectPerfilTributario`): Combobox de perfis fiscais parametrizados com regime e descrição.
- `<SelectMarca />` (`@/components/SelectMarca`): Combobox de marcas com botão inline "+ Nova marca" que abre modal para cadastro imediato.
- `<SelectGrupoCategoria />` (`@/components/SelectGrupoCategoria`): Seletor encadeado (Grupo Nível 1 → Categoria Nível 2) com suporte a layouts horizontal ou vertical.
- `<SelectFornecedor />` (`@/components/SelectFornecedor`): Combobox de fornecedores com busca e filtro opcional por segmento (`filtroTipo="Mercadorias"`).
- `<SelectProduto />` (`@/components/SelectProduto`): Combobox de produtos com miniatura, código, GTIN e preço de venda.
- `<ClienteCadastroRapido />` (`@/components/ClienteCadastroRapido`): Modal simplificado de cadastro rápido de cliente com validação e detecção de reativação para PDV e vendas.
- `usePermissoes()` / `pode(modulo, acao)` (`@/contexts/PermissoesContext`): Hook reativo para checagem de permissões com liberação imediata para administradores.
- `sugerirCestPorNcm(ncm)` (`@/services/cest`): Função assíncrona que cruza a NCM com a base do CEST e retorna os códigos compatíveis.
- `extrairCamposFiscaisDoPerfil(perfil)` (`@/services/produtos`): Converte as regras do perfil tributário nos campos fiscais padrão aplicados ao produto.
- `<SelectCondicaoPagamento />` (`@/components/SelectCondicaoPagamento`): Combobox com busca de condições de pagamento, filtro contextual de uso ("Vendas" ou "Compras") e atalho inline para cadastro rápido via modal.
- `gerarParcelas(condicao, valorTotal, dataBase)` (`@/services/condicoesPagamento`): Função para geração do cronograma de parcelas com arredondamento em 2 casas, ajuste de centavos na última parcela, entrada, juros, desconto e dia fixo.
- Serviço de Lotes e Validade (`@/services/lotes.ts`): Funções utilitárias `calcularDiasParaVencer(dataValidade)` (retorna dias inteiros até o vencimento, negativo para vencidos) e `classificarSituacaoLote(dataValidade, diasAlerta)` (classifica em `vencido`, `alerta` ou `ok` e fornece o rótulo formatado), além de `listarLotes`, `listarLotesDisponiveisProduto` e `listarTodosLotesProduto`.
- `sugerirTributacao(params)` (`@/services/motorFiscal.ts`): Motor tributário central inteligente em 4 etapas (A: Regras fiscais NCM, B: Produto semelhante revisado, C: Dedução por XML, D: Classificação manual) com nível de confiança e justificativas por campo fiscal.
- `aliquotaInterestadual(ufOrigem, ufDestino, origemMercadoria)` (`@/services/icmsMatriz.ts`): Função determinística para cálculo da alíquota de ICMS interna, interestadual ou importada (4% Res. Senado 13/2012).

### Serviço Central Único de Integração Fiscal (`@/services/fiscalIntegracao.ts` e `pocketbase/hooks/fiscal_focus_integracao.js`)

⚠ **REGRA DE ARQUITETURA MANDATÓRIA (EM DESTAQUE — MESMO RIGOR DE ESTOQUE, FINANCEIRO E VENDAS):**
O backend do ERP (`pocketbase/hooks/fiscal_focus_integracao.js`) é o **ÚNICO CÓDIGO DO SISTEMA QUE SE COMUNICA COM A API DA FOCUS NFE**. O token da Focus NFe **NUNCA VAI PARA O NAVEGADOR**. Qualquer tentativa de disparo de requisições externas à SEFAZ ou à Focus NFe diretamente do frontend é terminantemente proibida.

- **Empresa Emitente Sempre Dinâmica:** O grupo possui múltiplas empresas (matriz e filiais com CNPJ e Inscrição Estadual próprios). A empresa emitente de qualquer documento fiscal é SEMPRE a `empresa_id` do documento (a da venda, da nota de entrada ou da transferência), **NUNCA a empresa ativa da tela nem a matriz**. Nem toda empresa emite: filiais sem Inscrição Estadual ou com inscrição ISENTO são bloqueadas e não emitem NF-e/NFC-e.
- **Tokens por Empresa no Skip Cloud:** Os tokens de cada empresa são lidos exclusivamente das variáveis de ambiente / segredos do Skip Cloud via `$os.getenv(nomeSegredo)`. O nome do segredo segue o padrão `FOCUS_NFE_TOKEN_HOMOLOGACAO_{codigo_token}` ou `FOCUS_NFE_TOKEN_PRODUCAO_{codigo_token}`. Se `codigo_token` estiver vazio, usa `FOCUS_NFE_TOKEN_HOMOLOGACAO` e `FOCUS_NFE_TOKEN_PRODUCAO`.
- **Servidores Oficiais:**
  - Homologação: `https://homologacao.focusnfe.com.br/v2`
  - Produção: `https://api.focusnfe.com.br/v2`
- **Autenticação:** HTTP Basic Auth com o token da empresa emitente como usuário e senha vazia (`Basic base64(token + ':')`).
- **Endpoints de Backend Disponibilizados:**
  1. `POST /backend/v1/fiscal/testar-conexao`: executa `GET /hooks` no ambiente configurado para verificar autenticação e validade do token (200 = OK; 401 = Token inválido).
  2. `POST /backend/v1/fiscal/emitir-nfce`: `POST /nfce?ref={ref}` (síncrona; status `autorizado` ou `erro_autorizacao`, suporte a `forma_emissao=offline`).
  3. `POST /backend/v1/fiscal/emitir-nfe`: `POST /nfe?ref={ref}` (assíncrona; status inicial `processando_autorizacao`).
  4. `POST /backend/v1/fiscal/consultar`: `GET /nfe/{ref}?completa=1` ou `GET /nfce/{ref}?completa=1`.
  5. `POST /backend/v1/fiscal/cancelar`: `DELETE /nfe/{ref}` ou `/nfce/{ref}` com `{"justificativa": ...}` (15 a 255 caracteres).
  6. `POST /backend/v1/fiscal/carta-correcao`: `POST /nfe/{ref}/carta_correcao` com `{"correcao": ...}` (15 a 1000 caracteres).
  7. `POST /backend/v1/fiscal/inutilizar`: `POST /nfe/inutilizacao` ou `/nfce/inutilizacao` com `cnpj`, `serie`, `numero_inicial`, `numero_final` e `justificativa` (mínimo 15 caracteres).
  8. `POST /backend/v1/fiscal/baixar-arquivo`: baixa XML ou DANFE pelo caminho retornado pela Focus NFe.
  9. `GET /backend/v1/fiscal/status-segredos`: retorna para o painel se os segredos das empresas estão presentes no Skip Cloud (sim/não, sem revelar o valor).

---

### Serviços Centrais Financeiros (`@/services/financeiro.ts` e Endpoints de Backend)

⚠ **REGRA DE ARQUITETURA MANDATÓRIA (EM DESTAQUE):**
Nenhuma tela, hook ou componente do sistema tem permissão para alterar diretamente o campo `saldo_atual` da tabela `contas_financeiras` nem para inserir registros isolados em `movimentacoes_financeiras`, `pagamentos_lotes` ou `pagamentos_baixas`. Toda e qualquer operação de pagamento, baixa de título ou estorno deve transitar única e exclusivamente pelos endpoints centrais do backend:

- `/financeiro/pagar/baixar` (função client `baixarTitulosPagar`): efetua a baixa de um ou mais títulos a pagar, registra o lote de pagamento, calcula acréscimos/descontos, gera as movimentações financeiras de saída (débito) nas contas bancárias/caixas e atualiza de forma atômica o `saldo_atual` da conta financeira e os saldos/status dos títulos.
- `/financeiro/pagar/estornar-baixa` (função client `estornarBaixaPagamento`): cancela uma baixa de pagamento, marca `estornado = true`, registra o motivo e o usuário operador, estorna a movimentação gerando crédito de recomposição no saldo da conta financeira e devolve o saldo devedor ao título (`contas_pagar.saldo` e status).
- `/financeiro/pagar/gerar-titulos-retroativos` (função client `gerarTitulosRetroativosNotas`): varre notas de entrada já lançadas que não possuíam títulos gerados e cria os registros em `contas_pagar` com base nas duplicatas de `notas_entrada_parcelas`.

#### Serviços Reutilizáveis de Apoio Financeiro e Vendas:

1. **`creditoCliente(clienteId, empresaId?)` (`@/services/contasReceber.ts`):**
   - **Parâmetros:**
     - `clienteId` (obrigatório, string): identificador único do cliente em `clientes`.
     - `empresaId` (opcional, string): identificador da empresa/filial ativa em `empresas`. Quando informado, filtra os títulos de contas a receber da filial e busca a tolerância de atraso parametrizada em `config_financeira_empresa.dias_tolerancia_bloqueio` (padrão: 5 dias caso não informada ou não encontrada).
   - **Retorno (`SituacaoCreditoCliente`):**
     - `total_aberto`: soma dos saldos dos títulos ativos não cancelados do cliente com status `'Aberto'` ou `'Parcial'`.
     - `total_vencido`: soma dos saldos dos títulos ativos do cliente com vencimento anterior à data atual (`data_vencimento < hoje`).
     - `maior_atraso_dias`: maior diferença em dias corridos entre a data atual e a data de vencimento vencida (0 se não houver títulos vencidos).
     - `limite_credito`: valor numérico do limite cadastrado em `clientes.limite_credito` (retorna `null` quando não informado ou menor/igual a zero, indicando crédito ilimitado).
     - `credito_disponivel`: saldo de crédito remanescente calculado como `limite_credito - total_aberto` (retorna `null` quando o limite for ilimitado).
     - `dias_tolerancia`: tolerância máxima em dias de atraso considerada (lida de `config_financeira_empresa.dias_tolerancia_bloqueio` da filial ou padrão 5).
     - `situacao`: classificação da situação do cliente entre três estados:
       - `"Bloqueado"`: ocorre quando o cliente possui bloqueio cadastral manual (`cliente.bloqueado = true`), ou quando `maior_atraso_dias > dias_tolerancia`, ou quando `credito_disponivel < 0` (limite estourado);
       - `"Atenção"`: ocorre quando o cliente não está bloqueado, mas possui título(s) vencido(s) dentro do período de tolerância (`maior_atraso_dias > 0 && maior_atraso_dias <= dias_tolerancia`);
       - `"Liberado"`: cliente sem bloqueio cadastral, sem títulos vencidos e com crédito dentro do limite.
     - `motivos`: array de strings descritivas justificando o bloqueio ou o aviso de atenção (ex.: bloqueio cadastral com motivo, dias de atraso vs tolerância, valor excedido do limite).
   - **Regra de Integração:** A Etapa 5 (Vendas e PDV) utiliza obrigatoriamente esse serviço no checkout/fechamento de pedidos para alertar o operador ou bloquear vendas a prazo quando o cliente estiver em situação impeditiva.

2. **`gerarTitulosFromParcelas(input)` (`@/services/geradorTitulos.ts`):**
   - **Parâmetros (`GerarTitulosParcelasInput`):**
     - `tipo`: `'Pagar' | 'Receber'`.
     - `empresa_id` (obrigatório): filial proprietária dos títulos gerados.
     - `cliente_id` (obrigatório se tipo for `'Receber'`): vínculo do cliente devedor em `clientes`.
     - `fornecedor_id` (obrigatório se tipo for `'Pagar'`): vínculo do fornecedor credor em `fornecedores`.
     - `numero_documento_base`: identificador base do documento de origem (ex.: número do pedido, nota fiscal ou venda).
     - `descricao_base`: texto descritivo base para o lançamento.
     - `data_emissao`: data de emissão do documento.
     - `data_competencia` (opcional): data de competência contábil (assume `data_emissao` se omitida).
     - `plano_conta_id`: conta contábil analítica do plano de contas.
     - `centro_custo_id` (opcional): centro de custo gerencial associado.
     - `forma_pagamento_id` (opcional): forma de pagamento prevista para quitação.
     - `origem`: `'Manual' | 'NF Entrada' | 'Venda' | 'PDV' | 'Recorrência' | 'Outro'`.
     - `origem_id` (opcional): identificador do registro de origem (ex.: id da venda ou nota).
     - `venda_parcela_id` (opcional): vínculo específico com a parcela da venda (Etapa 5).
     - `nota_entrada_parcela_id` (opcional): vínculo com duplicata da nota de entrada (Etapa 3/4).
     - `parcelas`: array de `ParcelaTituloInput` contendo `numero_parcela`, `data_vencimento`, `valor`, `forma_pagamento_id`, `observacao`.
   - **O que grava no banco:**
     - Grava exatamente **um título por parcela** na tabela `contas_receber` (quando tipo for `'Receber'`) ou `contas_pagar` (quando tipo for `'Pagar'`).
     - Formata `numero_documento` como `"${numero_documento_base}-${numParcela}"`.
     - Formata o campo `parcela` no padrão `"n/total"` (ex.: `"1/3"`, `"2/3"`, `"3/3"`).
     - Inicializa `saldo = valor` da parcela, `valor_recebido = 0` (ou `valor_pago = 0`) e status inicial `'Aberto'` para tipo `'Receber'` (e `'Em aberto'` para tipo `'Pagar'`).
   - **Como as vendas (Etapa 5) devem chamá-lo:**
     - `tipo`: `"Receber"`.
     - `cliente_id`: cliente selecionado na venda.
     - `origem`: `"Venda"` (para vendas do módulo comercial) ou `"PDV"` (para vendas da frente de caixa).
     - `origem_id`: ID da venda correspondente.
     - `plano_conta_id`: conta analítica obtida de `config_financeira_empresa.plano_vendas_id` (padrão 1.1.01).

#### Regras de Integração com Lançamento e Cancelamento de Notas de Entrada:

1. **Geração por Parcela:** Ao lançar uma nota fiscal de entrada (via importação XML ou digitação manual), o sistema gera automaticamente um registro na tabela `contas_pagar` para cada parcela existente em `notas_entrada_parcelas` (`parcela_numero`, `parcela_total`, `data_vencimento`, `valor_original`). Se a nota não possuir duplicatas cadastradas, gera 1 título único com o valor total da nota e vencimento na data de entrada.
2. **Plano de Contas por Tipo de Entrada:** A conta contábil analítica atribuída a cada título gerado é selecionada automaticamente a partir da parametrização em `config_financeira_empresa` da filial ativa:
   - "Compra para revenda" → `plano_compras_revenda_id` (default 2.1.01)
   - "Compra para industrialização" → `plano_industrializacao_id` (default 2.1.03)
   - "Uso e consumo" → `plano_uso_consumo_id` (default 2.4.07)
   - "Ativo imobilizado" → `plano_imobilizado_id` (default 2.7.01)
   - "Outras entradas" → `plano_outras_entradas_id` (default 2.8.01)
3. **Exceções Legais de Geração:** Tipos de entrada "Bonificação" e "Devolução de venda" **não geram títulos a pagar**, pois não representam desembolso financeiro a fornecedor.
4. **Notas à Vista com Baixa Imediata ("Já paga"):** Quando a nota de entrada for selecionada com condição de pagamento à vista com quitação imediata, o título é gerado com status "Pago", gerando a baixa e a movimentação financeira de saída na conta bancária/caixa padrão.
5. **Cancelamento Recusado com Baixas Ativas:** O cancelamento de uma nota fiscal de entrada é **terminantemente bloqueado** caso existam títulos vinculados com baixas ativas de pagamento. O operador recebe mensagem clara instruindo a estornar previamente todas as baixas de pagamento no Contas a Pagar antes de proceder ao cancelamento da nota fiscal.

### Serviços Centrais de Vendas (`@/services/vendas.ts` e Endpoints de Backend)

⚠ **REGRA DE ARQUITETURA MANDATÓRIA (EM DESTAQUE):**
Nenhuma tela, PDV, componente ou hook do navegador tem permissão para alterar diretamente o status de uma venda para `'Finalizada'` ou `'Cancelada'`, nem para inserir, editar ou excluir registros na tabela `vendas_pagamentos` (`createRule`, `updateRule` e `deleteRule` fechadas para o navegador). Toda e qualquer operação de finalização comercial ou cancelamento de venda deve transitar única e exclusivamente pelos endpoints transacionais centrais do backend PocketBase:

- `POST /backend/v1/vendas/finalizar` (invocado pela função client `finalizarVenda(input)` via `pb.send(...)`).
- `POST /backend/v1/vendas/cancelar` (invocado pela função client `cancelarVenda(input)` via `pb.send(...)`).

O navegador opera apenas na criação e manutenção de orçamentos, pedidos em aberto e rascunhos de venda com itens (`vendas` e `vendas_itens`), enquanto a transição para venda efetivada exige o serviço central do servidor em uma única transação atômica.

#### 1. `finalizarVenda(input)` (`/backend/v1/vendas/finalizar`)

Endpoint transacional atômico no backend que consolida e efetiva a venda:

- **Parâmetros (`FinalizarVendaInput`):**
  - `venda_id` (obrigatório, string): ID da venda em `vendas` a ser finalizada.
  - `pagamentos` (obrigatório, array de `VendaPagamentoInput`): lista de pagamentos efetuados. Cada elemento possui:
    - `forma_pagamento_id` (obrigatório): forma cadastrada em `formas_pagamento`.
    - `valor` (obrigatório, número > 0): valor pago na forma.
    - `troco` (opcional, número >= 0): troco devolvido (específico para dinheiro).
    - `parcelas` (opcional, inteiro >= 1): quantidade de parcelas informada para cartão/crediário.
    - `bandeira`, `nsu`, `codigo_autorizacao` (opcionais, texto): dados do comprovante POS/TEF.
    - `taxa_percentual`, `valor_taxa` (opcionais, número): taxas apuradas da operadora de cartão.
    - `conta_financeira_id` (opcional): conta financeira de crédito imediato ou caixa físico.
    - `vencimentos` (opcional, array de strings YYYY-MM-DD): datas de vencimento das parcelas no crediário.
  - `pdv_terminal_id` (opcional, string): ID do terminal de caixa físico em `pdv_terminais`.
  - `caixa_sessao_id` (opcional, string): ID da sessão de turno aberta do operador de caixa.
  - `cliente_id` (opcional, string): cliente da venda se atualizado no momento da finalização.
  - `observacao`, `observacao_cliente` (opcionais, texto): observações impressas no comprovante.

- **Comportamentos e Validações Rígidas Executadas pelo Backend:**
  1. **Validação de Estado:** A venda deve existir, estar ativa e com status `'Orçamento'` ou `'Pedido em aberto'`. Se já estiver `'Finalizada'` ou `'Cancelada'`, a requisição é rejeitada.
  2. **Validação de Itens:** A venda deve conter pelo menos 1 item ativo em `vendas_itens`.
  3. **Conferência Matemática de Pagamentos:** A soma dos valores de pagamentos menos trocos (`soma(valor - troco)`) deve coincidir exatamente com o `valor_total` da venda (tolerância de R$ 0,02 para centavos de arredondamento). Não permite valor pago inferior ao total. Troco só é permitido para pagamentos do tipo dinheiro.
  4. **Validação de Crediário com `creditoCliente`:**
     - Quando houver pagamento via crediário/a prazo (`Credito loja`), o cliente não pode ser o Consumidor Final genérico.
     - O backend invoca o serviço central financeiro de análise de crédito: se `situacao === 'Bloqueado'` (bloqueio cadastral, títulos vencidos além da tolerância em dias de `config_financeira_empresa` ou limite de crédito excedido pelo saldo + total da venda), a finalização é categoricamente rejeitada informando os motivos do bloqueio.
  5. **Baixa Atômica de Estoque com FEFO:**
     - Para cada item da venda com `produto.controla_estoque = true`:
     - Se `produto.tipo === 'Kit'`, expande recursivamente seus componentes via `produtos_kit_itens`.
     - Verifica a política de estoque da empresa (`config_vendas_empresa.permite_vender_sem_estoque` e `empresas.permite_estoque_negativo`). Se não permitir saldo negativo e a quantidade for insuficiente, rejeita a finalização.
     - Para itens com controle de lote/validade, aplica o critério **FEFO automático** (_First Expire, First Out_ — lote com vencimento mais próximo sai primeiro, recusando lotes vencidos).
     - Registra os movimentos analíticos no Kardex (`estoque_movimentos`) com tipo `'Saída'`, origem `'VENDA'`, documento `'Venda'`, número sequencial e o lote específico baixado, deduzindo em `estoque_saldos`.
     - Apura o custo unitário de saída de cada item e calcula o `custo_total` consolidado da venda.
  6. **Tratamento Financeiro Conforme Forma de Pagamento:**
     - **Dinheiro / À Vista:** Se houver terminal ou conta de caixa físico informada, gera a movimentação financeira de crédito imediata em `movimentacoes_financeiras` com status conciliado na hora e atualiza o `saldo_atual` da conta física.
     - **Cartão de Crédito / Débito:** Busca a taxa da adquirente em `formas_pagamento_taxas` pelo número de parcelas (ou os padrões da forma de pagamento). Se houver `operadora_cliente_id` parametrizada, gera o título de repasse a receber contra a operadora líquida da taxa (`valor - valor_taxa`), gravando `taxa_percentual` e `valor_taxa` no pagamento e vinculando a conta do plano para despesas bancárias/taxas de cartão (2.5.03).
     - **Crediário / A Prazo:** Gera as parcelas em `contas_receber` via regra equivalente a `gerarTitulosFromParcelas` vinculando `cliente_id`, origem `'Venda'` (ou `'PDV'`), status inicial `'Aberto'`, plano de contas `plano_vendas_id` e vencimentos informados.
  7. **Gravação de `vendas_pagamentos`:** Grava com privilégio de servidor cada parcela/forma paga em `vendas_pagamentos` com auditoria.
  8. **Atualização da Venda e Auditoria:** Altera o status da venda para `'Finalizada'`, data de finalização com carimbo atual, `custo_total` consolidado, grava registro em `logs_auditoria` e retorna o cabeçalho completo atualizado. Se qualquer etapa falhar, toda a operação sofre rollback atômico.

#### 2. `cancelarVenda(input)` (`/backend/v1/vendas/cancelar`)

Endpoint transacional atômico no backend que reverte integralmente os efeitos da venda:

- **Parâmetros (`CancelarVendaInput`):**
  - `venda_id` (obrigatório, string): ID da venda em `vendas`.
  - `motivo` (obrigatório, texto com no mínimo 5 caracteres): justificativa formal do cancelamento.

- **Comportamentos e Validações Rígidas Executadas pelo Backend:**
  1. **Validação de Estado:** A venda deve estar com status `'Finalizada'`. Vendas já canceladas não podem ser canceladas novamente.
  2. **Bloqueio Rígido contra Recebimentos Posteriores:** Se houver títulos em `contas_receber` gerados por esta venda que já possuam baixas ativas registradas em `pagamentos_baixas` (parcela que o cliente já pagou), o cancelamento é **terminantemente recusado**. O operador recebe mensagem clara instruindo a estornar previamente os recebimentos no Contas a Receber.
  3. **Estorno Financeiro Completo:**
     - Cancela todos os títulos a receber em aberto (`contas_receber.status = 'Cancelado'`).
     - Estorna todas as movimentações financeiras imediatas geradas na finalização (caixa/banco), criando movimentações de contrapartida com origem `'ESTORNO'` e recompondo o `saldo_atual` das contas financeiras.
  4. **Estorno de Estoque com Devolução de Lotes:**
     - Localiza todos os movimentos de saída com origem `'VENDA'` vinculados a esta venda.
     - Executa o estorno do movimento gerando movimento contraposto de entrada `'ESTORNO'`, devolvendo com precisão a quantidade ao saldo do lote específico (`lotes.saldo`) de onde saiu e recompondo `estoque_saldos`.
  5. **Atualização da Venda e Auditoria:**
     - Altera o status da venda para `'Cancelada'`, registra `motivo_cancelamento`, `data_cancelamento` e `usuario_cancelamento_id`.
     - Inativa os registros de `vendas_pagamentos` vinculados e grava o evento em `logs_auditoria`.

---

### Serviços Centrais de Estoque (`@/services/estoque.ts`)

⚠ **REGRA DE ARQUITETURA MANDATÓRIA (EM DESTAQUE):**
Nenhuma tela ou componente do sistema tem permissão para gravar, editar ou excluir diretamente nas tabelas `estoque_saldos` ou `estoque_movimentos`. Toda e qualquer alteração de saldo ou histórico deve transitar única e exclusivamente pelo serviço central do backend (`/backend/v1/estoque/movimentar` e `/backend/v1/estoque/estornar`), acessível através das funções `movimentarEstoque()` e `estornarMovimento()`.

#### 1. `movimentarEstoque(itens)`

Movimenta o estoque de múltiplos itens em transação atômica. Valida permissões do usuário, consistência de unidades inteiras/fracionadas, estoque negativo (respeitando `permite_estoque_negativo`), expande automaticamente componentes de produtos do tipo "Kit" por meio de `produtos_kit_itens`, calcula o custo médio ponderado e atualiza `estoque_saldos` e `estoque_movimentos` com auditoria.

**Comportamento com Lotes e Validade:**

- **Entrada de produtos com lote:** exige identificação do lote (`lote_id` existente OU `numero_lote` + `data_validade`). Se o lote já existir para a empresa e produto, seu saldo é incrementado; caso contrário, um novo registro na tabela `lotes` é criado automaticamente.
- **Saída de produtos com lote:** exige `lote_id` específico ou opera com **FEFO automático** (_First Expire, First Out_ — o lote com vencimento mais próximo sai primeiro). Quando a quantidade demandada supera o saldo do lote mais antigo, o serviço divide a saída entre múltiplos lotes disponíveis, gerando um movimento no Kardex para cada lote com o mesmo identificador de documento.
- **Bloqueio de lote vencido:** lotes com data de validade anterior à data da movimentação são considerados vencidos. O serviço recusa qualquer saída com a mensagem `"Lote X vencido em dd/mm/aaaa"`, **exceto** quando a origem da saída for `PERDA` ou `AJUSTE_SAIDA` (operações legítimas de descarte/baixa de avarias).
- **Invariante de integridade:** ao final da movimentação de qualquer produto que controle lote, a soma dos saldos de todos os seus lotes ativos na filial deve bater rigorosamente com `estoque_saldos.quantidade`. Se houver divergência, a transação sofre rollback imediato.

```ts
import { movimentarEstoque } from '@/services/estoque'

const resultado = await movimentarEstoque([
  {
    empresa_id: 'empresa_id_aqui',
    produto_id: 'produto_id_aqui',
    tipo: 'Entrada', // ou "Saída"
    origem: 'COMPRA', // SALDO_INICIAL, AJUSTE_ENTRADA, VENDA, etc.
    quantidade: 10,
    custo_unitario: 25.5,
    documento_tipo: 'NF-e',
    documento_numero: '000123',
  },
])
```

#### 2. `estornarMovimento(movimentoId, motivo)`

Estorna um movimento de estoque com rastreabilidade total: gera um movimento contraposto de origem "ESTORNO", inverte a operação (Entrada ↔ Saída), recalcula o saldo e o custo médio, marca o movimento original como estornado (`estornado = true`) e faz a amarração biunívoca entre ambos. Movimentos originados de documentos fiscais/vendas só podem ser estornados pelo cancelamento do próprio documento.

**Comportamento do estorno com Lotes:**

- Se o movimento estornado possuía lote vinculado (`lote_id`), a quantidade é revertida diretamente no saldo daquele lote específico (estorno de entrada subtrai a quantidade do lote; estorno de saída devolve a quantidade ao lote).
- Valida a integridade para não deixar o saldo do lote negativo (salvo filial com `permite_estoque_negativo = true`).
- A invariante de que a soma dos saldos de todos os lotes ativos deve ser idêntica a `estoque_saldos.quantidade` é novamente validada na transação de estorno.

```ts
import { estornarMovimento } from '@/services/estoque'

const res = await estornarMovimento('movimento_id_aqui', 'Digitação incorreta do ajuste físico')
```

#### 3. `saldoEmData(empresa_id, produto_id, data)`

Recompõe com exatidão matemática a quantidade física e o custo médio ponderado de um produto em uma determinada filial no encerramento do dia informado (23:59:59.999), a partir dos movimentos registrados no Kardex (`estoque_movimentos`) até aquela data. Essencial para inventários retroativos e para a apuração do Bloco H do SPED Fiscal.

```ts
import { saldoEmData } from '@/services/estoque'

const saldoHistorico = await saldoEmData('empresa_id', 'produto_id', '2025-12-31')
// Retorno: { quantidade: 42.0000, custo_medio: 15.7500, valor_total: 661.50 }
```

## Etapa 2: Controle de Estoque e Telas Operacionais

A base e as telas completas do módulo Estoque estão operacionais:

### Telas do Módulo Estoque

1. `/estoque/posicao` (`@/pages/estoque/PosicaoEstoquePage.tsx`):
   - Exibe a lista de todos os produtos com `controla_estoque = true` na filial ativa.
   - Colunas: Código, Descrição, Unidade, Grupo/Categoria, Marca, Localização física, Quantidade física (4 casas), Custo médio (4 casas), Valor total (2 casas), Estoque mínimo e máximo, e Situação em badges coloridos ("Abaixo do mínimo" em vermelho, "Acima do máximo" em amarelo, "Zerado" em cinza, "Normal" em verde).
   - Filtros dinâmicos: Grupo, Categoria encadeada, Marca, Fornecedor principal, Situação do estoque e checkbox "Somente com saldo > 0".
   - Totais no rodapé: Total de produtos, soma do volume de quantidades físicas e valor total consolidado em estoque.
   - Botão "Filiais" na linha: abre modal interativo exibindo a quantidade física, custo médio e valor total do produto em cada filial que o usuário tem permissão de acesso.
   - Clique em qualquer linha do produto redireciona automaticamente para o Kardex dele.
   - Exportação completa para CSV.

2. `/estoque/kardex` (`@/pages/estoque/KardexPage.tsx`):
   - Ficha físico-financeira completa do produto com busca rápida (`<SelectProduto />`) e seletor de período (padrão: mês atual).
   - Recomposição exata do Saldo Inicial do período pela função `saldoEmData(empresa_id, produto_id, dataAnterior)`.
   - Cards de resumo: Saldo Inicial, Volume de Entradas, Volume de Saídas e Saldo Final resultante.
   - Grade cronológica imutável com: Data/Hora, Origem, Documento (tipo e número), Coluna Lote (exibe o número do lote ou "—"), Entrada, Saída, Saldo Resultante, Custo Unitário, Custo Médio Ponderado, Valor Total e Operador/Motivo.
   - Movimentos estornados aparecem riscados e com link para o identificador do estorno.
   - Botão "Estornar" em lançamentos manuais e ajustes, solicitando motivo detalhado, exclusivo para usuários com permissão de excluir em estoque (`pode('estoque', 'excluir')`).
   - Exportação para planilha CSV (incluindo coluna Lote) e botão de impressão formatada para ficha física.

3. `/estoque/lancamentos` (`@/pages/estoque/LancamentosEstoquePage.tsx`):
   - Aba "Novo Lançamento": formulário ágil com tipos mapeados para origens do Kardex:
     - _Saldo inicial_ → `SALDO_INICIAL` (permite data retroativa de implantação, custo obrigatório);
     - _Ajuste de entrada_ → `AJUSTE_ENTRADA` (motivo obrigatório, custo opcional herdando custo médio);
     - _Ajuste de saída_ → `AJUSTE_SAIDA` (motivo obrigatório, valida saldo negativo se filial não permitir);
     - _Perda/avaria_ → `PERDA` (motivo obrigatório, custo oculto);
     - _Consumo interno_ → `CONSUMO_INTERNO` (motivo obrigatório, custo oculto);
     - _Bonificação recebida_ → `BONIFICACAO_ENTRADA` (custo obrigatório);
     - _Bonificação enviada_ → `BONIFICACAO_SAIDA` (custo oculto).
   - Grade de itens com suporte a Lote/Validade para produtos com `controla_lote_validade = true`:
     - **Entradas:** exibe campos obrigatórios de Número do Lote e Data de Validade (além de Fabricação opcional);
     - **Saídas:** exibe seletor de lotes com opção padrão "Automático (FEFO)" ou escolha de um lote específico com saldo disponível;
   - Grade de itens com leitor de código de barras GTIN integrado: bipar com leitor ou pressionar Enter adiciona o item com quantidade 1 ou soma 1 caso já esteja na grade.
   - Exibe saldo atual (só leitura) e calcula o saldo após em tempo real.
   - Gravação em lote através da função `movimentarEstoque(itens)` com modal de resumo pós-gravação.
   - Aba "Lançamentos Realizados": histórico agrupado por documento de lote com filtros de período, tipo de operação e usuário operador.
   - Modal de Importação de Saldo Inicial por CSV (`<ImportarSaldoInicialModal />`) com colunas `codigo_ou_gtin;quantidade;custo_unitario`, validação linha a linha, prévia e acusação de erros antes de gravar.

4. `/estoque/lotes` (`@/pages/estoque/LotesValidadePage.tsx`):
   - Listagem completa de lotes da empresa ativa com cards de resumo: Total de Lotes (com saldo consolidado), Vencidos (vermelho), Vencem em até X dias (alerta amarelo parametrizado por `dias_alerta_validade`) e Regulares / Dentro da validade (verde).
   - Filtros dinâmicos: Busca textual por número do lote ou produto, seletor de produto (`<SelectProduto />`), filtro de situação (Vencido / Alerta / OK / Todos), checkbox "Apenas com saldo > 0" e período de data de validade (início e fim).
   - Colunas: Produto (código e descrição), Número do Lote, Data de Fabricação, Data de Validade, Dias para Vencer (com contagem regressiva), Saldo do Lote, Badge de Situação e Observações.
   - Exportação completa para planilha CSV.

5. Aba "Estoque" no Cadastro de Produtos (`@/components/ProdutoAbaEstoque.tsx`):
   - Exibe, em modo só leitura no formulário do produto, a tabela com saldo físico, custo médio e valor em estoque em cada filial autorizada ao usuário.
   - Seção dedicada de **Saldo por Lote e Validade na Filial Atual** quando `controla_lote_validade = true`: grade com Número do Lote, Fabricação, Validade, Dias p/ Vencer, Saldo do Lote e Situação (OK, Vence em breve, Vencido), com botão de atalho direto para a tela de Lotes (`/estoque/lotes`).
   - Exibe os últimos 10 movimentos na filial ativa com badge de tipo/origem, quantidades e link direto para o Kardex completo.

### Novos Componentes Reutilizáveis de Estoque

- `<BuscaProdutoGtin />` (`@/components/BuscaProdutoGtin`): Campo de busca com suporte prioritário para bipagem de código de barras (GTIN/EAN) ou digitação de código numérico, com dropdown de sugestões e gatilho imediato de seleção.
- `<SaldoTodasFiliaisModal />` (`@/components/SaldoTodasFiliaisModal`): Modal que recebe um produto e lista o saldo físico, custo médio e situação em todas as empresas acessíveis pelo usuário logado.
- `<ImportarSaldoInicialModal />` (`@/components/ImportarSaldoInicialModal`): Modal completo para importação de saldo inicial de implantação via planilha CSV, com modelo para download, verificação de consistência e gravação transacional.
- `<ProdutoAbaEstoque />` (`@/components/ProdutoAbaEstoque`): Componente para abas de formulários de produtos com saldo por filial, saldo detalhado por lote e histórico recente de movimentos.

### Permissões do Módulo Estoque

- `pode('estoque', 'ver')`: acesso às telas de Posição de Estoque, Kardex, Lotes e Validade (`/estoque/lotes`) e consulta de lançamentos.
- `pode('estoque', 'criar')`: permissão para efetuar lançamentos manuais e importar saldo inicial.
- `pode('estoque', 'excluir')`: permissão para realizar o estorno de lançamentos e ajustes no Kardex.

### Fechamento da Etapa 2 (Concluída)

A Etapa 2 (Controle de Estoque e Telas Operacionais) foi oficialmente finalizada e revisada:

1. **Painel Geral com Indicadores do Estoque (`@/pages/Index.tsx`):**
   - Respeita permissões do módulo estoque (`pode('estoque', 'ver')`).
   - Cartões analíticos integrados para a empresa ativa:
     - Valor total do estoque da empresa ativa (calculado a partir de `estoque_saldos` multiplicado pelo custo médio);
     - Produtos abaixo do mínimo (clicável, com redirecionamento para `/estoque/posicao?situacao=abaixo_minimo`);
     - Lotes vencidos e a vencer em até 30 dias (clicável, redirecionando para `/estoque/lotes`);
     - Transferências aguardando recebimento na empresa ativa (com alerta dinâmico e link para `/estoque/transferencias`);
     - Inventários abertos na empresa ativa (clicável, link para `/estoque/inventarios`).
   - Lista "Últimas movimentações": tabela com os 10 movimentos mais recentes da empresa ativa, com data/hora, tipo (badge verde/vermelho), origem, descrição do produto, quantidade, custo unitário e saldo posterior resultante.

2. **Relatório de Reposição — Sugestão de Compra (`@/pages/estoque/SugestaoCompraPage.tsx` e `@/services/sugestaoCompra.ts`):**
   - Rota `/estoque/sugestao-compra` acessível no menu Estoque.
   - Analisa todos os produtos do catálogo com estoque mínimo configurado onde o saldo atual na filial ativa é inferior ao mínimo.
   - Quantidade sugerida calculada pela fórmula do ERP: `estoque_maximo - saldo` (ou `estoque_minimo × 2 - saldo`, se o estoque máximo não estiver definido).
   - Agrupamento inteligente por Fornecedor Principal com custo total estimado baseado no custo médio ponderado atual.
   - Filtros por texto e por fornecedor com recálculo em tempo real e exportação dos dados para planilha CSV (preparado para conversão em Pedido de Compra na Etapa 3).

3. **Revisão de Arquitetura e Integridade do Estoque (`@/pages/configuracoes/IntegridadeEstoquePage.tsx` e `@/services/integridadeEstoque.ts`):**
   - Auditoria completa de código confirmando que **nenhuma tela ou serviço externo grava diretamente em `estoque_saldos` ou `estoque_movimentos`**, obedecendo o isolamento central via endpoints transacionais do backend.
   - Ferramenta administrativa "Verificar Integridade do Estoque" (`/configuracoes/integridade-estoque`), disponível para administradores no menu Configurações:
     - Realiza conferência cruzada: para cada empresa e produto, confere se a soma matemática de todos os movimentos do Kardex confere com `estoque_saldos`;
     - Para produtos com controle de lote (`controla_lote_validade = true`), confere se a soma das quantidades dos lotes ativos confere com o saldo;
     - Aponta e lista discrepâncias de forma visual e com exportação CSV, **sem alterar ou corrigir nada automaticamente**.
   - Confirmação das regras de acesso (RLS): tabelas de saldos e movimentos possuem `createRule: null`, `updateRule: null` e `deleteRule: null` para garantir proteção contra manipulações manuais no banco.

4. **Correção Estrutural de Permissões e Hidratação de Sessão (`PermissoesContext.tsx` e `PermissaoGuard.tsx`):**
   - Eliminação definitiva da falha de telas que renderizavam apenas o guard ou tela vazia:
     - Reconhecimento de administrador exclusivamente pelo vínculo: registro em `usuarios` ligado ao auth do login cujo perfil (`perfis_acesso`) tenha `administrador = true` (sem nenhum e-mail fixo no código);
     - Hidratação com cache síncrono do usuário ERP (`obterUsuarioCacheLocal`), mantendo carregamento instantâneo sem bloqueio ou travamento de telas;
     - Correção no serviço `obterUsuarioPorAuthId` com fallback automático por e-mail para resolver o vínculo `auth_user_id -> usuarios`;
     - Tratamento tolerante para ações (`ver` e `visualizar`) e normalização nas rotas do sistema.

## Etapa 3 concluída

A **Etapa 3 — Compras e Entrada de Notas** foi oficialmente concluída de ponta a ponta com rigor fiscal brasileiro, amarração transacional com estoque (Kardex e saldos) e governança em regras de banco (API Rules).

- **Tabelas criadas nesta etapa:**
  - `pedidos_compra`: cabeçalho de pedidos de compra com status, fornecedor, datas, totais, rateios e comprador.
  - `pedidos_compra_itens`: itens com quantidade, custo unitário sugerido, descontos, IPI, ICMS-ST e rastreamento de `quantidade_recebida`.
  - `cfop_conversao_entrada`: tabela fiscal de de-para para converter CFOP do fornecedor para CFOP de entrada de acordo com os 7 tipos de entrada.
  - `notas_entrada`: cabeçalho fiscal (C100), chave de acesso de 44 dígitos com validação em módulo 11, vínculo opcional a pedido de compra, status ("Em conferência", "Lançada", "Cancelada"), totais de tributos, créditos e dados de cancelamento.
  - `notas_entrada_itens`: itens da nota (C170) com espelho do fornecedor, GTIN, conversão de unidade com fator, vínculo a produtos do ERP, lote/validade, tributos e composição de custo de aquisição.
  - `notas_entrada_parcelas`: duplicatas financeiras com vencimento e valor, preparadas para geração automática do Contas a Pagar na Etapa 4.
  - _Observação:_ Na finalização da etapa (v0.0.38), **não foram criadas novas tabelas**, apenas novos serviços de consulta/apuração, telas operacionais de relatórios e reforço de regras de proteção (API rules).

- **Telas e Rotas Entregues:**
  1. `/compras/pedidos` (`@/pages/compras/PedidosCompraListaPage.tsx`): listagem, busca, filtros de status/fornecedor, exportação CSV e ações.
  2. `/compras/pedidos/novo` e `/compras/pedidos/:id/editar` (`@/pages/compras/PedidoCompraFormPage.tsx`): elaboração de pedidos com bipagem GTIN, importação direta da Sugestão de Compra, cálculo automático de totais e impostos, impressão de espelho e geração de PDF.
  3. `/compras/notas-entrada` (`@/pages/compras/NotasEntradaListaPage.tsx`): listagem de notas importadas e digitadas com filtro por status, fornecedor, período e modelo.
  4. `/compras/notas-entrada/digitar` (`@/pages/compras/NotaEntradaDigitacaoPage.tsx`): lançamento de notas por digitação manual sem XML, com validação matemática de chave de acesso (44 dígitos), rateio ponderado de despesas e geração de duplicatas.
  5. `/compras/notas-entrada/:id` e `/compras/notas-entrada/:id/conferencia` (`@/pages/compras/NotaEntradaConferenciaPage.tsx`): conferência fiscal completa com motor fiscal em 4 etapas, de-para automático de produtos via GTIN e `produtos_fornecedores`, aproveitamento de créditos fiscais (ICMS, IPI, PIS, COFINS), rateio de despesas acessórias e frete CT-e, lançamento atômico no estoque via `/notas-entrada/lancar` e cancelamento rastreado via `/notas-entrada/cancelar`.
  6. `/compras/itens-comprados` (`@/pages/compras/ItensCompradosPage.tsx`): consulta detalhada de itens de notas lançadas com filtros por período, fornecedor, produto, grupo mercadológico, CFOP de entrada, busca textual, paginação e exportação CSV.
  7. `/compras/livro-entradas` (`@/pages/compras/LivroEntradasPage.tsx`): relatório analítico e conferência fiscal do Livro de Registro de Entradas (preparado para o Bloco C / Registro C190 do SPED Fiscal) com consolidação por CFOP/CST/alíquota, exportação CSV e impressão formatada.
  8. **Aba "Compras" no formulário de produtos** (`@/pages/cadastros/ProdutoForm.tsx`): consulta em tempo real das últimas 20 entradas de notas lançadas com data, número da nota, fornecedor, quantidade na unidade de estoque, custo unitário e atalho direto para a conferência da nota.
  9. **Aba "Notas" no formulário de fornecedores** (`@/pages/cadastros/FornecedorForm.tsx`): histórico completo de notas de entrada do fornecedor com agrupamento e consolidação de valores e quantidades por ano.
  10. **Indicadores de Compras no Painel Geral** (`@/pages/Index.tsx`): cartões dinâmicos de notas em conferência, compras do mês, pedidos de compra em aberto e pedidos com previsão de entrega vencida, condicionados às permissões de `compras` e `notas_entrada`.

- **Serviços e Componentes Centrais:**
  - `src/services/consultasCompras.ts`: `listarItensComprados`, `listarEntradasDoProduto` e `listarNotasDoFornecedorComTotais`.
  - `src/services/livroEntradas.ts`: `calcularResumoFiscalC190` e `obterRelatorioLivroEntradas`.
  - `src/services/notasEntrada.ts`: parsing DOMParser de NF-e, conversão de CFOPs, rateio de despesas e cálculo de custo unitário de estoque.
  - `src/services/pedidosCompra.ts`: ciclo de vida de pedidos, numeração sequencial e conversão da sugestão de compras.
  - `pocketbase/migrations/0030_api_rules_bloqueio_notas_lancadas.js`: trava em nível de banco para `notas_entrada`, `notas_entrada_itens` e `notas_entrada_parcelas`, permitindo update/delete via client SDK apenas para notas com status "Em conferência". Notas lançadas ou canceladas são imutáveis via client direto.

- **Garantia de Não Criação Prematura:**
  - Não foram criadas contas a pagar, nem pedidos de venda, nem emissão de NF-e (mantidos estritamente para as Etapas 4 e 6).

## Etapa 4 concluída

A **Etapa 4 — Financeiro** foi oficialmente concluída de ponta a ponta com rigor contábil-financeiro brasileiro, amarração transacional com notas fiscais de entrada, extratos cronológicos, conciliação OFX, controle de inadimplência, DRE contábil/gerencial, fluxo de caixa diário projetado, painel com indicadores interativos e auditoria de integridade de saldos sem correção automática.

- **Tabelas criadas nesta etapa:**
  - `plano_contas`: estrutura contábil compartilhada entre filiais com hierarquia pai-filho, tipo (Receita, Despesa, Sem resultado), natureza (Sintética, Analítica) e grupo DRE.
  - `centros_custo`: centros de custo compartilhados para rateio gerencial de despesas e receitas.
  - `contas_financeiras`: contas bancárias e caixas por filial com saldo inicial, data e saldo atual (manutenção restrita ao backend).
  - `formas_pagamento`: catálogo compartilhado com códigos fiscais oficiais TPag da SEFAZ, taxas e prazos.
  - `config_financeira_empresa`: parametrização individualizada por filial de juros, multas, carência e contas contábeis padrão para compras, vendas, juros e descontos.
  - `contas_pagar`: títulos a pagar gerados a partir das duplicatas das notas de entrada ou de cadastros avulsos manuais.
  - `contas_receber`: títulos a receber com cliente, vencimento, valor original, valor recebido, juros, multas, descontos e saldo.
  - `pagamentos_lotes`: lotes transacionais de liquidação individual ou agrupada.
  - `pagamentos_baixas`: baixas analíticas não estornadas vinculadas a títulos a pagar ou a receber.
  - `movimentacoes_financeiras`: lançamentos bancários cronológicos de débito/crédito, transferências e lançamentos avulsos.
  - `extratos_linhas`: linhas importadas de extratos bancários padrão OFX com FITID único e status de conciliação.

- **Telas e Rotas Entregues:**
  1. `/financeiro/cadastros/plano-contas` (`PlanoContasPage.tsx`): visualização em árvore, busca dinâmica, exportação e importação CSV.
  2. `/financeiro/cadastros/centros-custo` (`CentrosCustoPage.tsx`): listagem e manutenção de centros de custo.
  3. `/financeiro/cadastros/contas-bancarias` (`ContasFinanceirasPage.tsx`): cadastro de contas e caixas com saldo consolidado por filial.
  4. `/financeiro/cadastros/formas-pagamento` (`FormasPagamentoPage.tsx`): catálogo de formas com códigos SEFAZ e taxas.
  5. `/financeiro/cadastros/configuracao` (`ConfiguracaoFinanceiraPage.tsx`): parametrização financeira da empresa ativa.
  6. `/financeiro/pagar` (`ContasPagarPage.tsx`): listagem, indicadores, filtros por situação e período, modal de novo título e pagamento em lote.
  7. `/financeiro/receber` (`ContasReceberPage.tsx`): listagem, indicadores de liquidação/atraso, filtros por situação e recebimento em lote.
  8. `/financeiro/bancos` (`ExtratoBancarioPage.tsx`): extrato bancário cronológico, transferência entre contas e lançamento avulso.
  9. `/financeiro/conciliacao` (`ConciliacaoBancariaPage.tsx`): importação de extratos OFX bancários e casamento automático/manual.
  10. `/financeiro/fluxo-caixa` (`FluxoCaixaPage.tsx`): projeção analítica e gráfica de fluxo de caixa diário, semanal e mensal com saldos acumulados.
  11. `/financeiro/inadimplencia` (`InadimplenciaPage.tsx`): relatório analítico de clientes inadimplentes, faixas de atraso (aging list) e exportação.
  12. `/financeiro/dre` (`DrePage.tsx`): Demonstrativo do Resultado do Exercício estruturado por regime de competência e caixa, com margens e percentuais verticais.
  13. `/configuracoes/integridade-financeiro` (`IntegridadeFinanceiroPage.tsx`): relatório auditor de integridade entre contas, movimentações e baixas de títulos, exclusivo para Administrador.
  14. **Painel Geral com Indicadores Financeiros** (`Index.tsx`): cartões clicáveis com atalhos filtrados ("A pagar hoje", "A pagar vencido", "A receber hoje", "A receber vencido" e "Saldo total das contas") e mini gráfico interativo de projeção do fluxo de caixa dos próximos 30 dias.

- **Serviços e Componentes Centrais:**
  - `src/services/financeiro.ts`: serviços de contas a pagar, baixas, estornos e geração retroativa de títulos.
  - `src/services/contasReceber.ts`: gestão de títulos a receber, amortizações, juros, multas e baixas atômicas.
  - `src/services/movimentacoesExtratos.ts`: extratos bancários, transferências entre contas e conciliação bancária OFX.
  - `src/services/fluxoCaixa.ts`: apuração temporal de projeções financeiras considerando contas bancárias e títulos em aberto.
  - `src/services/inadimplencia.ts`: apuração e ranking de inadimplência por cliente e faixas de atraso.
  - `src/services/dre.ts`: apuração contábil da DRE por estrutura analítica do plano de contas.
  - `src/services/integridadeFinanceiro.ts`: auditoria matemática de saldos de contas e baixas de títulos.
  - `pocketbase/migrations/0037_fechar_regras_pagamentos_baixas_e_lotes.js`: bloqueio de create/update/delete direto pelo client SDK em `pagamentos_lotes` e `pagamentos_baixas`.

- **Garantia de Não Criação Prematura:**
  - Não foram criadas rotas ou tabelas de frente de caixa/PDV, vendas ou emissão de NF-e/NFC-e (mantidos para as Etapas 5 e 6).

## Etapa 5 concluída (Vendas e PDV Completo)

- **Telas Entregues:**
  - `src/pages/vendas/TrocasDevolucoesPage.tsx`: busca de venda original, conferência de limite `dias_para_troca`, autorização por supervisor via senha para trocas fora do prazo (`ModalAutorizacaoSupervisor`), escolha de itens até o saldo devolvível, destinos do valor (Vale-troca com impressão e código único, Dinheiro de volta via lançamento avulso na conta 2.2.05, Abater do crediário com baixa de títulos).
  - `src/pages/vendas/ComissoesPage.tsx`: apuração de comissões por vendedor com percentual de `usuarios.comissao_percentual`, filtros por período e base ("Venda finalizada" ou "Venda recebida"), abatimento automático de devoluções, extrato detalhado por venda, exportação CSV e geração de conta a pagar no plano 2.5.01 com vendedor cadastrado como fornecedor.
  - `src/pages/vendas/ConsultasVendasPage.tsx`: vendas por período (total, quantidade, ticket médio, visões por dia, forma de pagamento, vendedor e terminal), ranking de produtos e curva ABC (por valor e por quantidade) com classes A (80%), B (15%) e C (5%), margem bruta de contribuição (preço − custo médio) protegida por permissão de produtos, com exportação CSV em todas as consultas.
  - `src/pages/vendas/pdv/PdvPage.tsx`: frente de caixa ágil, atalhos F2 a F12, leitura universal, balança EAN-13, cancelamentos auditados e finalização com impressão não fiscal.
  - `src/pages/vendas/pedidos/VendasListaPage.tsx` e `VendaFormPage.tsx`: gestão completa de orçamentos e pedidos comerciais.
  - `src/pages/vendas/CaixaPage.tsx` e `TerminaisPage.tsx`: controle de sessões e fechamento às cegas.

- **Tabelas e Estrutura de Banco:**
  - `vales_troca` (Migration 0044): cupons de crédito de loja vinculados à empresa e venda original.
  - `vendas`: select do campo `tipo` atualizado com o valor 'Devolução'.
  - `plano_contas`: conta analítica 2.2.05 "Devoluções de vendas" (Deduções da receita).
  - `formas_pagamento`: cadastrada forma "Vale-troca" (`codigo_tpag = '99'`, tipo 'Crédito loja').

- **Serviços Centrais:**
  - `src/services/devolucoes.ts`: processamento atômico de devolução (`processarDevolucao`), entrada em estoque com origem `DEVOLUCAO_VENDA` pelo custo da venda original, atualização de `quantidade_devolvida` em `vendas_itens`, gestão e abatimento de vales (`abaterSaldoValeTroca`).
  - `src/services/comissoes.ts`: apuração temporal por vendedor com base bruta, dedução de devoluções e geração de títulos em contas a pagar (`gerarContaPagarComissao`).
  - `src/services/consultasVendas.ts`: consolidação multidimensional de vendas por período, curva ABC e margens.
  - `src/services/dre.ts`: opção "Custo das mercadorias pelo estoque" (CMV pelas saídas `VENDA` menos entradas `DEVOLUCAO_VENDA`, com exclusão das compras do período da DRE).

- **Painel Geral (`src/pages/Index.tsx`):**
  - Cartões de vendas de hoje (valor e quantidade), ticket médio do dia, caixas abertos em operação, orçamentos a vencer em 2 dias e comparativo mês atual x mês anterior.
  - Gráfico diário de faturamento dos últimos 30 dias com linha de tendência.

## Etapa 6 concluída

- **Tabelas e Estrutura de Banco:**
  - `config_emissao_fiscal` (Migration 0046, 0048, 0050): parametrização por empresa/filial com `provedor`, `emite_documentos_fiscais`, `emite_nfce`, `codigo_token`, ambiente (Homologação/Produção), séries, naturezas de operação, validade de certificado, CSC configurado, `calcular_difal_consumidor_final`, `emitir_nfe_ao_enviar_transferencia`, `emitir_nfe_ao_devolver_venda`.
  - `documentos_fiscais` e `documentos_fiscais_itens` (Migration 0047): tabelas mestres e de itens das emissões NF-e (modelo 55) e NFC-e (modelo 65), com impostos detalhados (ICMS, FCP, ST, IPI, PIS, COFINS, IBS/CBS e DIFAL), status da SEFAZ, chave de acesso de 44 dígitos, protocolos, payloads JSON e arquivos XML autorizados.
  - `documentos_fiscais_cartas` (Migration 0049): histórico cronológico de Cartas de Correção Eletrônicas (CC-e) vinculadas à NF-e modelo 55.
  - `intermediadores` (Migration 0049): intermediadores e plataformas de marketplace para os grupos `indIntermed` e `infIntermed` da NF-e em vendas não presenciais.
  - `inutilizacoes` (Migration 0050, 0052): histórico e pedidos de inutilização de faixas de numeração fiscal homologados pela SEFAZ.
  - **Blindagem no Navegador (Migration 0052):** tabelas fiscais `documentos_fiscais`, `documentos_fiscais_itens`, `documentos_fiscais_cartas` e `inutilizacoes` blindadas em modo somente leitura no navegador (`createRule: null`, `updateRule: null`, `deleteRule: null`), operadas exclusivamente via backend.
- **Serviço Central e Integração com Focus NFe:**
  - Serviço único backend no PocketBase (`pocketbase/hooks/fiscal_focus_integracao.js`), onde o token da Focus NFe NUNCA vai ao navegador do usuário e é resolvido dinamicamente via segredos por empresa.
  - Endpoints seguros sob `/backend/v1/fiscal/*`: `/testar-conexao`, `/status-segredos`, `/montar-rascunho`, `/emitir-nfce-venda`, `/cancelar-nfce-venda`, `/emitir-nfe-venda`, `/consultar-situacao-nfe`, `/cancelar-nfe`, `/carta-correcao-nfe`, `/enviar-email-nfe`, `/emitir-nfe-transferencia`, `/emitir-nfe-devolucao-venda`, `/confirmar-autorizacao-devolucao-venda`, `/emitir-nfe-devolucao-compra`, `/confirmar-autorizacao-devolucao-compra`, `/inutilizar`, `/reenviar-documento`, `/consultar-lote`, `/baixar-arquivo`.
  - Webhook oficial assíncrono `/backend/v1/fiscal/webhook-focus` protegido pelo segredo `FOCUS_NFE_WEBHOOK_SECRET` com atualização atômica de status SEFAZ e download do XML.
  - Exportação de XMLs em arquivo compactado ZIP com resumo analítico em planilha CSV (`/fiscal/exportar-xmls`).

## Etapa 7 SPED Fiscal

- **Prompt 7.0 (Configuração e Estrutura):**
  - **Tabela `config_sped_empresa` (Migration 0053):** parametrização por empresa/filial do SPED Fiscal (EFD ICMS/IPI) com índice único por `empresa_id`. Campos: `versao_leiaute` (padrão "020", COD_VER do registro 0000), `codigo_receita_icms` (código de receita no ES para o E116, padrão "101-5"), `dia_vencimento_icms` (1 a 31, vencimento da guia no E116), `periodo_saldo_inicial` (AAAA-MM) e `saldo_credor_inicial` (saldo credor do sistema anterior), `mes_bloco_h` (padrão 2, mês do inventário de 31/12), `conta_contabil_estoque` (COD_CTA no H010), `gerar_bloco_k` (controle da produção) e `incluir_homologacao_em_teste` (inclusão de notas em homologação no modo Teste).
  - **Tabela `sped_arquivos` (Migration 0054):** histórico de arquivos SPED gerados com `empresa_id`, `periodo` (AAAA-MM), `finalidade` ("0" original, "1" retificadora), `modo` ("Oficial" ou "Teste"), `status` ("Gerando", "Gerado", "Gerado com erros", "Erro", "Substituído", "Entregue"), arquivo .txt (`arquivo`), `nome_arquivo`, `quantidade_linhas`, `contagem_registros` (JSON por registro), `resumo_apuracao` (JSON com débitos, créditos e saldos de ICMS), `validacoes` (JSON de inconsistências), `gerado_por`, `entregue_em`, `recibo_entrega` e `observacoes`.
  - **Regras de Acesso e Blindagem:** `sped_arquivos` com leitura liberada para usuários da empresa e gravação 100% restrita ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`), exceto marcação de entrega efetuada por Administrador via endpoint `/backend/v1/sped/marcar-entregue` (`pocketbase/hooks/fiscal_sped_operacoes.js`).
  - **Serviço Central `src/services/configSped.ts`:** `obterOuCriarConfigSpedEmpresa`, `salvarConfigSpedEmpresa`, `listarArquivosSped`, `marcarSpedEntregue`.
  - **Tela Fiscal > Configuração do SPED (`/fiscal/sped/configuracoes` - `src/pages/fiscal/ConfiguracaoSpedPage.tsx`):**
    - Formulário completo dos parâmetros da EFD ICMS/IPI da empresa ativa (edição exclusiva para Administrador do ERP).
    - Quadro dinâmico em tempo real **"Pronto para gerar o SPED?"** com semáforo (verde, amarelo e vermelho) avaliando:
      - Empresa marcada como `obrigado_efd_icms_ipi` (amarelo se falso);
      - CRT 1 ou 4 do Simples Nacional (amarelo com aviso do contador);
      - Inscrição estadual numérica (vermelho se vazia, "ISENTO" ou não numérica);
      - Endereço completo com logradouro, número, bairro, CEP de 8 dígitos e código IBGE do município de 7 dígitos (vermelho se faltar);
      - Perfil SPED (A, B ou C) e indicador de atividade preenchidos (vermelho se faltar);
      - Dados do contador completos: nome, CPF de 11 dígitos, CRC, CEP de 8 dígitos, código IBGE de 7 dígitos e e-mail com arroba (vermelho se faltar);
      - Versão do leiaute preenchida, e código de receita + dia de vencimento preenchidos para empresas de CRT 3 (vermelho se faltar);
      - Produtos ativos sem NCM, sem tipo de item SPED ou com revisão fiscal pendente (amarelo com link direto para a listagem filtrada);
      - A partir de janeiro: inventário do tipo "Anual (Bloco H)" com referência 31/12 do ano anterior finalizado (amarelo se não existir).
  - **Menu Lateral e Rotas:** item "Configuração do SPED" com ícone de planilha adicionado ao menu Fiscal em `Sidebar.tsx` e rota `/fiscal/sped/configuracoes` protegida por `PermissaoGuard` em `App.tsx`.

- **Prompt 7.1 (Gerador SPED Fiscal, Blocos 0 e 9, Blocos Vazios, Endpoint e Tela):**
  - **Módulo de Formatação Oficial (`pocketbase/hooks/sped/formato.js`):**
    - Linhas iniciadas e terminadas por `|`, campos separados por `|`, finalizadas em CRLF (`\r\n`).
    - Higienização estrita de texto: remoção de acentos/cedilha, eliminação de caracteres fora do ASCII imprimível (32 a 126), conversão de quebras de linha e `|` em espaço, trim de pontas.
    - Números com vírgula decimal sem separador de milhar: 2 casas para valores monetários, até 3 casas para quantidades, até 6 casas para valor unitário. Campos vazios geram barras vazias.
    - Datas no padrão `ddmmaaaa` com conversão de fuso horário de Brasília (America/Sao_Paulo, UTC-3) para integridade de competência.
    - CNPJ, CPF, CEP, IE e telefones apenas com dígitos.
  - **Motor Gerador Estruturado (`pocketbase/hooks/sped/gerador.js`):**
    - Contexto de geração com empresa, configuração da EFD, período (primeiro e último dia calculados), modo e coletores com deduplicação: `registrarParticipante(tipo, id)` ("C" cliente, "F" fornecedor, "E" empresa), `registrarItem(produto_id)` e `registrarUnidade(unidade_id)`.
    - Execução desacoplada: blocos operacionais (C, D, E, G, H, K, 1 e B) executam primeiro e alimentam os coletores; em seguida o Bloco 0 é gerado com os cadastros reais necessários; por fim o Bloco 9 consolida contagens e encerramentos.
    - Blocos vazios nesta rodada: B (B001 "1", B990), C (C001 "1", C990), D (D001 "1", D990), E (E001 "0", E100 período, E110 apuração com todos os 14 campos zerados "0,00", E990), G (G001 "1", G990), H (H001 "1", H990), K (K001 "1", K990), Bloco 1 (1001 "0", 1010 com os 13 indicadores todos "N", 1990).
    - Bloco 0 com dados reais: 0000 (versão de leiaute, finalidade, datas, razão social, CNPJ, UF, IE, código IBGE, perfil e indicador de atividade), 0001 ("0"), 0005 (endereço e contato), 0015 (IE substituta ST se houver), 0100 (dados do contador com validação de avisos), 0150 (participantes coletados), 0190 (unidades de medida coletadas), 0200 (itens coletados com NCM, tipo de item SPED e unidade), 0990 (total de linhas do bloco).
    - Bloco 9: 9001 ("0"), um registro 9900 para cada tipo de registro do arquivo com sua quantidade de linhas (incluindo 9001, 9900, 9990 e 9999), 9990 (linhas do Bloco 9) e 9999 (linhas totais do arquivo).
    - Nomenclatura oficial: `SPED_EFD_<CNPJ>_<AAAAMM>.txt` (prefixo `TESTE_` no modo Teste).
  - **Endpoint Backend `POST /backend/v1/sped/gerar` (`pocketbase/hooks/sped_gerar.js`):**
    - Autenticação obrigatória; permissão para usuários com acesso ao módulo Fiscal vinculados à empresa.
    - Criação de registro em `sped_arquivos` com status `"Gerando"`, montagem do arquivo via gerador, upload do .txt no campo `arquivo`, preenchimento de `quantidade_linhas`, `contagem_registros` e `validacoes`.
    - Em modo Oficial, validação impeditiva de Inscrição Estadual numérica (vazia ou "ISENTO" grava status "Erro" e validação descritiva).
    - Arquivos anteriores do mesmo período e modo passam para status `"Substituído"` (exceto se "Entregue").
    - Retorno econômico na resposta JSON contendo apenas o `id` e o `status` (sem expor o conteúdo bruto do arquivo).
  - **Tela Fiscal > SPED Fiscal (`/fiscal/sped` - `src/pages/fiscal/SpedFiscalPage.tsx`):**
    - Empresa ativa via `useEmpresaAtiva` e acesso governado pelo módulo fiscal.
    - Seletor de mês de apuração (padrão mês anterior) e modo (Oficial/Teste) com botão de geração reativo e spinners de carregamento.
    - Lista de arquivos gerados com status coloridos, período, modo, total de linhas, contadores de inconsistências e download direto.
    - Painel lateral de detalhes do arquivo selecionado com resumo analítico dos registros do Bloco 9 (9900), lista resumida de erros/avisos e modal completo com todas as inconsistências identificadas.
    - Adição ao menu lateral `Sidebar.tsx` e rotas do `App.tsx`.

- **Prompt 7.5 (Blocos H, K e 1 do SPED Fiscal e Destaque no Inventário):**
  - **Bloco H (Inventário Físico — `pocketbase/hooks/sped/gerador.js`):**
    - Gerado exclusivamente no mês parametrizado em `config_sped_empresa.mes_bloco_h` (padrão mês 2, fevereiro); nos demais meses, gera apenas `H001` com `IND_MOV = 1` e totalizador `H990`.
    - No mês de inventário, pesquisa na coleção `inventarios` o inventário da empresa com tipo `"Anual (Bloco H)"`, status `"Finalizado"`, ativo = true e `data_referencia` com data de 31/12 do ano anterior (`AAAA-12-31`). Não existindo ou faltando, gera erro impeditivo nas validações: `"falta o inventário de 31/12"`, emitindo `H001` com `IND_MOV = 1`.
    - Com o inventário localizado: emite `H001` com `IND_MOV = 0`.
    - Registro `H005`: `DT_INV` (31/12/AAAA em DDMMAAAA), `VL_INV` (soma exata dos valores dos itens `VL_ITEM`), `MOT_INV` (`motivo_bloco_h` do inventário, padrão "01" — no final do período).
    - Registro `H010`: agrupado por produto somando lotes com quantidade contada maior que zero:
      - `COD_ITEM`: código cadastral do produto com registro automático no coletor do Bloco 0 (0200).
      - `UNID`: unidade de medida do produto (registrada no 0190).
      - `QTD`: quantidade em estoque com até 3 casas decimais.
      - `VL_UNIT`: custo unitário com até 6 casas decimais.
      - `VL_ITEM`: apurado por `QTD x VL_UNIT` com 2 casas decimais.
      - `IND_PROP`: fixo "0" (item de propriedade do informante e em seu poder).
      - `COD_PART`: vazio; `TXT_COMPL`: vazio.
      - `COD_CTA`: preenchido com a `conta_contabil_estoque` da `config_sped_empresa`. Se não preenchida na configuração da empresa, gera aviso não impeditivo nas validações: `"o COD_CTA do H010 é exigido de quem tem escrituração contábil; confirme com o contador"`.
      - `VL_ITEM_IR`: idêntico a `VL_ITEM`.
    - Batimento contábil: a soma de todos os `VL_ITEM` fecha e bate perfeitamente com o `VL_INV` do registro `H005`.
    - Estoque zerado em 31/12: emite registro `H005` com `VL_INV = 0,00` e suprime os registros `H010`.
    - Totalizador `H990` com a contagem total de linhas do Bloco H.
  - **Bloco K (Controle da Produção e do Estoque — `pocketbase/hooks/sped/gerador.js`):**
    - Condicionado à configuração: ativado somente quando `config_sped_empresa.gerar_bloco_k` estiver ligado (`true`). Quando desligado (`false`), mantém geração de `K001` com `IND_MOV = 1` e `K990`.
    - Quando ativado:
      - `K001`: `IND_MOV = 0`.
      - `K010`: `IND_TP_LEIAUTE = 2` (leiaute restrito aos saldos de estoque, utilizado pelo comércio atacadista/distribuidores).
      - Aviso fixo nas validações do SPED: `"Bloco K ligado: o contador confirma se a empresa é obrigada e se o leiaute restrito vale para ela"`.
      - `K100`: período de apuração (`DT_INI` e `DT_FIN` em DDMMAAAA).
      - `K200`: gerado para cada produto com saldo de estoque diferente de zero na data final do período de apuração (`dataLimiteIso`), calculando os saldos a partir das movimentações de estoque registradas na Etapa 2 (`estoque_movimentos` com soma de Entradas menos Saídas, ativos e não estornados). Campos: `DT_EST` (último dia do período), `COD_ITEM` (código do produto com inclusão no coletor do 0200), `QTD` (saldo com até 3 casas decimais), `IND_EST = "0"` (propriedade do informante e em seu poder) e `COD_PART` vazio.
      - Totalizador `K990` com o somatório de linhas do Bloco K.
  - **Bloco 1 (Outras Informações — `pocketbase/hooks/sped/gerador.js`):**
    - Registro `1001` com `IND_MOV = 0`.
    - Registro `1010` com os 13 indicadores fiscais preenchidos com "N" (`IND_EXP`, `IND_CCRF`, `IND_COMB`, `IND_USINA`, `IND_VA`, `IND_EE`, `IND_CART`, `IND_FORM`, `IND_AER`, `IND_GIAF1`, `IND_GIAF3`, `IND_GIAF4`, `IND_REST_RESSARC_COMPL_ICMS`).
    - Verificação de pagamentos eletrônicos: varredura no período por vendas ou contas a receber liquidados através de cartão de crédito, cartão de débito, PIX ou intermediadores de pagamento/marketplaces (códigos tPag 03, 04, 17 e tipos correspondentes). Constatado recebimento eletrônico no período, adiciona aviso fixo nas validações: `"confira com o contador se o registro 1601 (pagamentos eletrônicos) é exigido; o ERP não gera o 1601 nesta versão"`.
    - Totalizador `1990` com as linhas do Bloco 1.
  - **Bloco 9 (Controle e Encerramento — `pocketbase/hooks/sped/gerador.js`):**
    - Contabilização automática e dinâmica de todos os registros gerados nos blocos H, K e 1 nos totalizadores `9900`: `H001`, `H005`, `H010`, `H990`, `K001`, `K010`, `K100`, `K200`, `K990`, `1001`, `1010` e `1990`.
    - Totalizadores `9990` (linhas do Bloco 9) e `9999` (total de linhas do arquivo SPED) recalculados com precisão.
  - **Tela de Detalhe do Inventário (`src/pages/estoque/InventarioDetalhePage.tsx`):**
    - No inventário do tipo `"Anual (Bloco H)"` com status `"Finalizado"`, exibição de badge de destaque: `"Entra no SPED de [mês] de AAAA"` (nome do mês em português por extenso conforme `mes_bloco_h` da configuração da empresa e ano seguinte ao de referência da contagem).
    - Exibição em destaque do valor total apurado para o registro `H005` (`Total Registro H005: R$ ...`), facilitando a conferência prévia e a conciliação física com o contador.

## Etapa 7 concluída

- **Tabelas do Módulo SPED Fiscal:**
  - `config_sped_empresa` (Migration 0053): parametrização da EFD ICMS/IPI por empresa/filial com unicidade por `empresa_id`. Campos: `versao_leiaute` (padrão "020", COD_VER do 0000), `codigo_receita_icms` (código estadual ES para o E116, padrão "101-5"), `dia_vencimento_icms` (1 a 31, vencimento da guia no E116), `periodo_saldo_inicial` (AAAA-MM) e `saldo_credor_inicial` (saldo trazido do sistema anterior no primeiro mês gerado), `mes_bloco_h` (padrão 2, fevereiro, mês de inclusão do inventário anual de 31/12), `conta_contabil_estoque` (opcional, COD_CTA no H010), `gerar_bloco_k` (habilita o controle de produção e estoque) e `incluir_homologacao_em_teste` (inclusão de notas em homologação no modo Teste).
  - `sped_arquivos` (Migrations 0054, 0055, 0056): histórico de arquivos SPED gerados com `empresa_id`, `periodo` (AAAA-MM), `finalidade` ("0" original, "1" retificadora), `modo` ("Oficial" ou "Teste"), `status` ("Gerando", "Gerado", "Gerado com erros", "Erro", "Substituído", "Entregue"), arquivo .txt (`arquivo`), `nome_arquivo` (`SPED_EFD_<CNPJ>_<AAAAMM>.txt`, prefixado por `TESTE_` em modo Teste), `quantidade_linhas`, `contagem_registros` (JSON com quantidade por registro), `resumo_apuracao` (JSON com apuração do ICMS próprio e DIFAL por UF), `resumo_saida` (JSON com totalizadores de saídas por modelo, cancelamentos, inutilizações, valores e ICMS), `resumo_entrada` (JSON com compras, transferências recebidas, valores e créditos), `validacoes` (JSON com erros impeditivos e avisos preventivos), `gerado_por`, `entregue_em`, `recibo_entrega` e `observacoes`.
  - `sped_ajustes_apuracao` (Migration 0057): ajustes manuais da apuração do ICMS Próprio para o Registro E111 da EFD ICMS/IPI (benefícios como COMPETE-ES, estornos, deduções e débitos especiais) vinculados a `empresa_id` e `periodo`, com código da SEFAZ de 8 dígitos da Tabela 5.1.1 cujo 4º caractere mapeia diretamente para os campos do registro E110 (0=outros débitos, 1=estorno créditos, 2=outros créditos, 3=estorno débitos, 4=deduções, 5=débito especial).
  - **Blindagem e Permissões:** O navegador autenticado possui permissão estrita de somente leitura em `sped_arquivos` e `sped_ajustes_apuracao` (`createRule: null`, `updateRule: null`, `deleteRule: null`). Gravação e mutações ocorrem exclusivamente pelo backend via pb_hooks. Inserção e edição em `sped_ajustes_apuracao` e marcação de entrega em `sped_arquivos` exigem perfil de Administrador (`perfis_acesso.administrador = true`) e são sumariamente bloqueadas quando o período já possui arquivo Oficial com status "Entregue".

- **Endpoints Backend Seguros sob `/backend/v1/sped/*`:**
  - `POST /backend/v1/sped/gerar` (`pocketbase/hooks/sped_gerar.js`): gera o arquivo SPED Fiscal executando os coletores, apurações em memória, validações cadastrais e cruzadas e gerador de leiaute oficial; salva o arquivo físico .txt na coleção `sped_arquivos`; grava `quantidade_linhas`, `contagem_registros`, `resumo_apuracao`, `resumo_saida`, `resumo_entrada` e `validacoes`. Em modo Oficial, substitui arquivos oficiais anteriores não entregues.
  - `POST /backend/v1/sped/marcar-entregue` (`pocketbase/hooks/fiscal_sped_operacoes.js`): valida perfil de Administrador (`perfis_acesso.administrador = true`), rejeita arquivos gerados em modo Teste, exige o número do recibo de entrega do PVA, marca `status = 'Entregue'` com `recibo_entrega` e `entregue_em` e registra auditoria em `logs_auditoria`.
  - `POST /backend/v1/sped/ajustes/salvar` (`pocketbase/hooks/fiscal_sped_operacoes.js`): salva ajustes manuais no registro E111; valida Administrador, UF no prefixo do código de ajuste, estrutura de 8 dígitos e bloqueia alterações se o período já tiver arquivo Oficial entregue.
  - `POST /backend/v1/sped/ajustes/excluir` (`pocketbase/hooks/fiscal_sped_operacoes.js`): exclui ajuste manual da apuração sob as mesmas travas de Administrador e período não entregue.

- **Telas e Recursos na Interface:**
  - **Fiscal > SPED Fiscal (`/fiscal/sped`):** geração de arquivos por período e modo (Oficial/Teste), seletor de finalidade (Original COD_FIN 0 ou Retificadora COD_FIN 1 com diálogo de confirmação obrigatório quando já houver arquivo Oficial Entregue no período), lista detalhada com badges de status, download do .txt, modal e painel de inconsistências e avisos, quadros de apuração (Bloco E, Saídas Bloco C, Entradas Bloco C, DIFAL), botão "Marcar como entregue" exclusivo para Administrador (com data e recibo do PVA, permanentemente desabilitado para arquivos em modo Teste), e caixa expansível **"Como entregar o SPED Fiscal à Receita Federal / SEFAZ"** (passo a passo oficial de download, validação no PVA, correção de pendências, assinatura com e-CNPJ/e-CPF e gravação do recibo no ERP).
  - **Aba "Ajustes da apuração" (`/fiscal/sped`):** controle completo dos registros E111 do período selecionado, com modal de lançamento validando códigos SEFAZ e descrição legal.
  - **Relatório de Conferência do SPED Fiscal (`/fiscal/sped/:id/relatorio`):** visão consolidada e imprimível em folha A4 (via `window.print()`) baseada nos dados estruturados já persistidos em `sped_arquivos` (resumo de saídas por modelo, resumo de entradas e compras, resumo analítico por CFOP e CST/CSOSN com base e ICMS, apuração do ICMS próprio do Bloco E, apuração de DIFAL e FCP por UF de destino e quadro de inconsistências/avisos), exibindo faixa de advertência destacada em vermelho `"ARQUIVO DE TESTE — NÃO ENTREGAR AO FISCO"` quando o arquivo estiver em modo Teste.
  - **Cartão no Painel Fiscal (`src/pages/Index.tsx`):** card inteligente **"SPED Fiscal do mês anterior"** no painel inicial do módulo fiscal, diagnosticando se o arquivo do mês anterior já foi gerado e entregue, exibindo selo de status ("Entregue com recibo", "Gerado — entrega pendente", "Não gerado" ou "Atenção: pendente"), botão de ação direta para geração/conferência e resumo rápido dos valores apurados.
  - **Destaque na Tela de Inventários (`/estoque/inventarios/:id`):** no inventário Anual (Bloco H) de 31/12 finalizado, exibição de badge `"Entra no SPED de [mês] de AAAA"` e valor total apurado para o registro `H005`.
  - **Fiscal > Configuração do SPED (`/fiscal/sped/configuracoes`):** formulário dos parâmetros da EFD e semáforo dinâmico "Pronto para gerar o SPED?".

- **Regras Principais da Etapa 7:**
  - **Desacoplamento e Não Intrusão:** Nada da Etapa 7 altera documentos fiscais, movimentações de estoque, lançamentos financeiros ou cadastros de clientes/produtos/fornecedores. O módulo é 100% de leitura de dados fiscais e escrituração.
  - **Modo Teste Protegido:** Arquivo em modo Teste é sempre nomeado com prefixo `TESTE_`, pode incluir notas em homologação caso configurado, exibe tarja ostensiva no relatório de conferência e tem bloqueio mandatório tanto no backend (`/backend/v1/sped/marcar-entregue`) quanto na interface para marcação como Entregue.
  - **Validação Interna Pré-PVA:** Motor realiza varreduras automáticas de integridade cruzada antes da gravação: referências cruzadas de cadastros (0150 COD_PART, 0200 COD_ITEM, 0190 UNID), cálculo de dígito verificador de CNPJ/CPF, contagens exatas de encerramentos (X990, 9900, 9990, 9999), chaves de acesso duplicadas, notas fora do período de apuração, batimento de `VL_OPR` com `VL_DOC` do C100 (tolerância de R$ 0,01), recálculo de batimento do E110 e alerta para arquivos superiores a 4 MB.

- **O que o ERP NÃO gera nesta versão:**
  - Registros `E200` e `E210` de Apuração do ICMS ST (o sistema gera aviso impeditivo caso haja ICMS ST destacado em notas de saída, orientando apuração direta com a contabilidade).
  - Apuração de IPI (Bloco E da EFD para estabelecimentos industriais ou equiparados a indústria).
  - Bloco D (documentos de transporte e comunicação; o ERP gera apenas totalizador de encerramento D001 com movimento 1 e D990).
  - Registro `1601` de pagamentos eletrônicos no Bloco 1 (o sistema emite alerta preventivo quando detecta recebimentos via cartão, PIX ou marketplace para que o contador verifique a exigência estadual).

---

## Etapa 8 Relatórios e painel

Regras gerais para todos os relatórios desta etapa:

1. **Cálculo e agregação estritamente no backend:**
   - O cálculo e a soma são realizados no backend em endpoints `/backend/v1/relatorios/*`, nunca carregando milhares de registros no navegador do cliente. A resposta do backend traz somente as linhas já agrupadas e sintetizadas (com paginação quando se tratar de lista).
2. **Período máximo por consulta:**
   - Limite máximo estrito de 366 dias (1 ano bissexto) por consulta para resguardar a performance e a estabilidade das requisições.
3. **Somente leitura:**
   - Nenhum relatório altera ou mutaciona dados no banco de dados. Todas as rotinas e endpoints operam como leitura pura (read-only).
4. **Multiempresa e consolidação:**
   - Por padrão, a consulta seleciona somente a empresa ativa no contexto (`useEmpresaAtiva`).
   - Usuários com acesso a mais de uma empresa (ou Administradores) contam com uma lista com caixas de seleção (checkboxes) para marcar qualquer combinação de empresas autorizadas, dispondo dos botões utilitários **"Marcar todas"** e **"Desmarcar todas"**.
   - Com mais de uma empresa marcada, o relatório exibe cada empresa separada (em colunas distintas ou quadros segregados por empresa) juntamente com o total consolidado das empresas marcadas, além de oferecer a opção de alternância **"Ver só o total"**.
   - O backend confere estritamente se o usuário autenticado possui acesso a cada empresa solicitada no parâmetro da requisição (Administrador tem acesso irrestrito; demais usuários são validados na tabela `usuarios_empresas`).
5. **Documentos fiscais em homologação:**
   - Documentos fiscais emitidos em ambiente de Homologação (testes) não entram nos relatórios fiscais, exceto se a opção **"Incluir notas de teste"** estiver explicitamente marcada na interface (e, nesse caso, o relatório exibe a faixa destacada em amarelo/âmbar: `"INCLUI NOTAS DE TESTE"`).
6. **Cancelamentos desconsiderados:**
   - Vendas canceladas e títulos financeiros cancelados nunca entram nos totais dos relatórios.
7. **Padrão de exportação e impressão:**
   - **Exportação CSV:** Arquivo formatado em UTF-8 com BOM (`\uFEFF`), separador ponto e vírgula (`;`), vírgula decimal para valores monetários e numéricos e tratamento adequado de acentuação para abertura imediata no Microsoft Excel.
   - **Impressão / PDF:** Cabeçalho formal exibindo o nome, código e CNPJ da empresa (ou indicação de empresas consolidadas), período consultado e data/hora exata da emissão do relatório, com formatação limpa para folha e estilos de impressão `@media print`.

### Componentes e Telas criados no Prompt 8.0

- **Utilitários de Relatórios (`src/services/relatorios.ts`):** Funções utilitárias para geração e download de arquivos CSV (`gerarCsvRelatorio` e `fazerDownloadCsv`) com UTF-8 + BOM, ponto e vírgula, vírgula decimal e escape de aspas, além de disparador de impressão formatada (`imprimirRelatorio`).
- **Configuração da Central de Relatórios (`src/config/relatoriosCatalogo.ts`):** Catálogo modular e extensível contendo todos os relatórios do sistema agrupados por assunto: Vendas, Estoque, Compras, Financeiro e Fiscal, mapeados para suas respectivas rotas e módulos de permissão (`vendas`, `estoque`, `compras`, `notas_entrada`, `financeiro_bancos`, `financeiro_receber`, `sped`, etc.).
- **Componente Comum de Filtros (`src/components/relatorios/FiltrosRelatorio.tsx`):** Componente reutilizável para relatórios contendo:
  - Seletor de empresas com checkboxes (código, razão social/nome fantasia e CNPJ), botões "Marcar todas" e "Desmarcar todas", e alternância "Ver só o total";
  - Seletor de período com atalhos inteligentes (Hoje, Esta semana, Este mês, Mês anterior, Últimos 30 dias, Últimos 90 dias, Últimos 365 dias e Personalizado com validação de limite de 366 dias);
  - Botões "Exportar CSV" e "Imprimir" integrados;
  - Área expansível de filtros extras (`children` / `filtrosExtras`) preparada para receber os filtros específicos de produtos, pessoas, vendas, fiscal e financeiro do próximo prompt (8.0b).
- **Tela Central de Relatórios (`src/pages/relatorios/CentralRelatoriosPage.tsx` - `/relatorios`):** Painel da Central de Relatórios no menu principal, protegido pelo módulo `relatorios` (`pode('relatorios', 'ver')`). Cartões agrupados por assunto, com nome, resumo do que mostram e link de acesso rápido, filtrados dinamicamente pelas permissões do usuário em cada módulo correspondente.

### Etapa 8 concluída

A Etapa 8 (Relatórios e Painel) foi integralmente concluída, consolidando a inteligência gerencial, relatórios fiscais, painel executivo do grupo e o montador de relatórios personalizados, operando com soma no backend, limite estrito de período e governança multiempresa:

1. **Endpoints Backend Seguros sob `/backend/v1/relatorios/*`:**
   - `POST /backend/v1/relatorios/validar-filtros` (`pocketbase/hooks/relatorios_base.js`): validação de autorização de acesso às empresas consultadas (`usuarios_empresas` ou admin) e período máximo de 366 dias.
   - `POST /backend/v1/relatorios/livro-saidas` (`pocketbase/hooks/fiscal_relatorio_livro_saidas.js`): agregação das notas de saída (modelos 55 e 65) autorizadas, denegadas, canceladas e inutilizações, com resumo analítico por CFOP/CST/alíquota e resumo por UF de destino.
   - `POST /backend/v1/relatorios/vendas-canais` (`pocketbase/hooks/relatorio_vendas_canais.js`): faturamento líquido, vendas, ticket médio, CMV e margem bruta por filial, canal de venda, UF de destino, forma de pagamento com taxas e categorias, com comparativo com período anterior e ano anterior.
   - `POST /backend/v1/relatorios/estoque-gerencial` (`pocketbase/hooks/relatorio_estoque_gerencial.js`): saldo e valorização por data base retroativa ou atual, giro, cobertura de estoque em dias, produtos sem giro/parados (> 90 dias) e sugestão automática de compra.
   - `POST /backend/v1/relatorios/contas-pagar` (`pocketbase/hooks/relatorio_contas_pagar.js`): aging list de contas a pagar por faixas de vencimento, totalizadores por fornecedor, plano de contas e relação analítica de títulos em aberto.
   - `POST /backend/v1/relatorios/painel-grupo` (`pocketbase/hooks/relatorio_painel_grupo.js`): consolidado executivo do grupo multiempresa com faturamento comparativo (vs mês e ano anterior), margem, ticket, vendas interestaduais, estoque valorizado e parado, contas a receber e pagar (30 dias) e status do SPED.
   - `POST /backend/v1/relatorios/personalizado` (`pocketbase/hooks/relatorio_personalizado.js`): montador de relatórios analíticos cobrindo 7 bases de dados (`itens_vendidos`, `itens_comprados`, `estoque_data`, `estoque_movimentos`, `contas_pagar`, `contas_receber`, `movimentacoes_financeiras`) com agrupamentos até 3 níveis, métricas agregadas, totais gerais e gráficos (limite de 5.000 linhas).
   - Endpoints de filtros salvos (`relatorios_filtros_salvos`) e relatórios personalizados salvos (`relatorios_salvos`).

2. **Telas e Recursos na Interface:**
   - `/relatorios`: Central de Relatórios com catálogo unificado por assunto (Vendas, Estoque, Compras, Financeiro, Fiscal, Grupo), atalho para relatórios salvos e novo relatório personalizado.
   - `/fiscal/livro-saidas`: Livro de Registro de Saídas fiscal oficial com detalhamento de documentos, analítico por CFOP/CST/alíquota e mapa por UF.
   - `/fiscal/resumo-icms`: Resumo mensal da apuração do ICMS agregando Débitos (Livro de Saídas) vs Créditos (Livro de Entradas e transferências) e confronto automatizado com o Registro E110 do SPED Fiscal.
   - `/relatorios/vendas-canais`: Relatório gerencial de vendas por filial e canal, comparativos com períodos anteriores e UFs de destino.
   - `/relatorios/estoque-gerencial`: Relatório gerencial de estoque em 4 abas (Valorizado, Giro e Cobertura, Parados e Sugestão de Compra com exportação CSV para fornecedor).
   - `/relatorios/contas-pagar`: Relatório gerencial de contas a pagar por vencimento com aging list em 7 faixas, agrupamento por fornecedor e plano de contas.
   - `/painel-grupo`: Dashboard executivo multiempresa acessível a usuários com acesso a mais de uma empresa, com comparativos históricos, gráficos de série temporal e raio-x por filial.
   - `/relatorios/personalizado`: Montador interativo de relatórios em 4 passos com agrupamentos hierárquicos, subtotais, gráficos interativos e exportação CSV/impressão.
   - **Filtros nas Telas Existentes:** Inclusão do componente comum `FiltrosRelatorio` (apenas os filtros pertinentes, preservando intactos os cálculos internos) em:
     - `/vendas/consultas`: Período e tipo de data com atalhos, exportação CSV e critério ABC.
     - `/vendas/comissoes`: Período, vendedor e base de cálculo (emissão vs liquidação).
     - `/estoque/posicao`: Grupos, categorias, marcas, fornecedores e flags de saldo/mínimo.
     - `/estoque/kardex`: Período e tipo de data de movimentação com seleção de produto.
     - `/compras/itens-comprados`: Período, fornecedor, produto, grupo de produto e CFOP.
     - `/financeiro/inadimplencia`: Seleção multiempresa, cliente e busca textual no aging list.
     - `/financeiro/fluxo-caixa`: Período, contas bancárias selecionadas, agrupamento e inclusão de vencidos.

3. **Regras Mandatórias da Etapa 8:**
   - **Soma e agregação no backend:** Nenhum cálculo pesado é executado no navegador; as somas são feitas no banco/servidor.
   - **Período máximo de 366 dias:** Validação mandatória no backend e frontend para resguardar performance.
   - **Somente leitura:** Nenhuma tela ou endpoint de relatório mutaciona registros operacionais.
   - **Multiempresa com validação no backend:** Permissão checada no servidor em `usuarios_empresas` (ou administrador).
   - **Homologação fora dos relatórios fiscais:** Documentos em homologação são excluídos, exceto com opção explícita com faixa de aviso.
   - **Cancelados nunca nos totais:** Vendas e títulos cancelados nunca compõem métricas de faturamento ou saldo.
   - **Sigilo de custos e margens:** Valores de CMV, custos médios e margens são omitidos para usuários sem permissão no módulo `produtos` (`pode('produtos', 'ver')`).
   - **Migration 0060 de Índices de Performance:** Índices combinados `empresa_id + data` nas tabelas `vendas`, `documentos_fiscais`, `estoque_movimentos`, `contas_pagar` e `contas_receber`.

---

## Roteiro concluído

O roteiro de desenvolvimento do ERP foi concluído com sucesso em todas as suas 8 etapas planejadas:

- **Etapa 1: Estrutura Base e Autenticação** — Versão de fechamento: **0.0.14** (Scaffolding, multiempresa, RBAC, auditoria, banco de dados e perfis).
- **Etapa 2: Produtos e Estoque** — Versão de fechamento: **0.0.23** (Catálogo de produtos, unidades, marcas, grupos/categorias, saldo de estoque, movimentações Kardex e integridade).
- **Etapa 3: Compras e Entrada de Notas** — Versão de fechamento: **0.0.39** (Pedidos de compra, importação de XML de NF-e, conferência tributária, conversão de CFOP e manifesto).
- **Etapa 4: Financeiro** — Versão de fechamento: **0.0.53** (Plano de contas, centros de custo, contas financeiras, contas a pagar, contas a receber, fluxo de caixa, DRE gerencial e conciliação).
- **Etapa 5: Vendas e PDV** — Versão de fechamento: **0.0.71** (Orçamentos, pedidos de venda, controle de sessões de caixa às cegas, frente de caixa PDV, trocas/devoluções e comissões).
- **Etapa 6: Emissão Fiscal** — Versão de fechamento: **0.0.91** (Motor fiscal de tributação, emissão de NF-e 55 e NFC-e 65, cancelamentos, cartas de correção CC-e, inutilizações e exportação de XMLs).
- **Etapa 7: SPED Fiscal (EFD ICMS/IPI)** — Versão de fechamento: **0.0.105** (Geração dos Blocos 0, C, E, H, K, 1 e 9, apuração de ICMS Próprio e DIFAL, validações pré-PVA e relatório de conferência).
- **Etapa 8: Relatórios e Painel** — Versão de fechamento: **0.0.117** (Central de relatórios, filtros comuns 8.0b, livro de saídas, resumo de ICMS, vendas por canal, estoque gerencial, contas a pagar, painel do grupo, relatório personalizado com 7 bases, filtros salvos, filtros nas telas existentes, migration 0060 de índices e alinhamento do filtro de data de entrada em compras).

---

### Catálogo de Filtros e Formato Único de Filtros no Prompt 8.0b

No Prompt 8.0b, foi implementado o catálogo completo de filtros declaráveis e o motor comum de aplicação no frontend e backend:

1. **Catálogo de Filtros Declaráveis (`ChaveFiltroDeclaravel`):**
   - **Produto:** `produto_grupos_categorias` (grupos e categorias do cadastro; marcar o grupo marca automaticamente as categorias dele), `produto_marcas`, `produto_produtos` (busca por código, descrição ou código de barras), `produto_fornecedores` (fornecedor do produto), `produto_ncms`, `produto_situacao` (ativo ou inativo) e `produto_so_fiscal_nao_revisado` (produtos com dados fiscais pendentes de revisão).
   - **Pessoas:** `pessoas_clientes`, `pessoas_fornecedores`, `pessoas_vendedores`, `pessoas_operadores_caixa`, `pessoas_cliente_ufs` e `pessoas_cliente_cidades`.
   - **Vendas:** `vendas_tipos` (PDV, Pedido, Orçamento), `vendas_status`, `vendas_formas_pagamento`, `vendas_terminais_pdv`, `vendas_intermediadores` (marketplaces) e `vendas_com_sem_nota` (todas, com nota fiscal, sem nota fiscal).
   - **Fiscal:** `fiscal_modelos` (NF-e modelo 55, NFC-e modelo 65), `fiscal_cfops`, `fiscal_csts_csosns`, `fiscal_situacoes_nota` e `fiscal_ufs_destino`.
   - **Financeiro:** `financeiro_plano_contas` (marcar a conta sintética marca automaticamente todas as contas analíticas filhas vinculadas), `financeiro_centros_custo`, `financeiro_contas_financeiras`, `financeiro_situacoes_titulo` e `financeiro_origens_titulo`.
   - **Datas:** `datas_tipo_data` (escolha da data de referência do período: emissão, vencimento, pagamento ou competência).
   - Cada relatório declara em `filtrosDeclarados` / `filtrosPermitidos` quais filtros utiliza, e estritamente esses são renderizados na tela.

2. **Formato Único do Objeto `filtros` (`ObjetoFiltrosRelatorio`):**
   - Estrutura única tipada utilizada pelo frontend e enviada ao backend:
     - `empresas_ids`: array de IDs de empresas selecionadas;
     - `ver_so_total`: booleano para consolidar totais sem segregar por empresa;
     - `periodo`: `{ dataInicio: string, dataFim: string }` (com limite de até 366 dias);
     - `atalho_periodo`: identificador do atalho ativo;
     - `incluir_notas_teste`: booleano para notas em homologação;
     - `grupos_ids`, `categorias_ids`, `marcas_ids`, `produtos_ids`, `fornecedores_produto_ids`, `ncms`, `situacao_produto`, `so_fiscal_nao_revisado`;
     - `clientes_ids`, `fornecedores_ids`, `vendedores_ids`, `operadores_caixa_ids`, `cliente_ufs`, `cliente_cidades`;
     - `vendas_tipos`, `vendas_status`, `formas_pagamento_ids`, `terminais_pdv_ids`, `intermediadores_ids`, `vendas_nota_fiscal`;
     - `fiscal_modelos`, `fiscal_cfops`, `fiscal_csts_csosns`, `fiscal_situacoes_nota`, `fiscal_ufs_destino`;
     - `plano_contas_ids`, `centros_custo_ids`, `contas_financeiras_ids`, `situacoes_titulo`, `origens_titulo`;
     - `tipo_data`: `'emissao' | 'vencimento' | 'pagamento' | 'competencia'`.

3. **Função Comum de Aplicação no Backend (`pocketbase/hooks/relatorios_base.js`):**
   - Endpoint `POST /backend/v1/relatorios/validar-filtros` e rotinas compartilhadas para todos os endpoints `/backend/v1/relatorios/*`.
   - Valida autorização de acesso do usuário às empresas consultadas (`usuarios_empresas` ou admin).
   - Valida período mandatório máximo de 366 dias.
   - Aplica os critérios sempre do mesmo jeito: suprime cancelados e notas em homologação (salvo se permitido).
   - **Regra Mandatória de Produto:** havendo filtro de produto aplicado em relatório de vendas ou compras, os itens são filtrados diretamente (os totais passam a ser estritamente dos itens filtrados), e o cabeçalho avisa expressamente essa condição.

4. **Cabeçalho Legível de Filtros (`formatarLinhaLegivelFiltros`):**
   - Apresenta os filtros aplicados em linha única legível na tela, no cabeçalho de impressão e no CSV (ex.: `"Empresas: Loja 01, Loja 02 · Marcas: X, Y · Período: 01/10/2025 a 31/10/2025"`).

5. **Filtros Salvos (`relatorios_filtros_salvos`):**
   - Tabela criada via Migration 0058 (`usuario_id`, `relatorio`, `nome`, `filtros`, `compartilhado`).
   - Botões integrados **"Salvar estes filtros"** e **"Meus filtros"** em `FiltrosRelatorio.tsx`.
   - Filtros compartilhados aparecem para todos os usuários com acesso ao relatório; edição e exclusão restritas unicamente ao criador/proprietário do filtro.

---

## Etapa 9 Multi-tenant

A Etapa 9 transforma o ERP em uma plataforma SaaS multi-tenant verdadeira, garantindo segregação total entre assinantes e mantendo a flexibilidade de grupo de empresas (matriz e filiais) por assinante.

### Regras de Ouro do Multi-tenant (Mandatórias para todos os prompts)

1. **Assinante é o cliente do SaaS:** O assinante representa a conta do cliente que contrata a plataforma SaaS — um grupo empresarial composto por matriz e filiais. O campo chama-se obrigatoriamente `assinante_id`, nunca `cliente_id` (o campo `cliente_id` continua existindo para representar o cliente de venda/faturamento do ERP).
2. **Separação Cadastros vs. Movimentos:** Toda coleção de cadastro tem `assinante_id`; toda coleção de movimento continua com `empresa_id` (onde cada empresa pertence a um `assinante_id`).
3. **Preenchimento sempre pelo backend:** O campo `assinante_id` é SEMPRE resolvido e gravado pelo backend a partir do usuário autenticado no token JWT. O backend NUNCA aceita nem confia em `assinante_id` vindo do corpo da requisição do navegador.
4. **Isolamento obrigatório no backend:** O isolamento de dados entre assinantes é executado e garantido no backend (regras de acesso das coleções no PocketBase e lógica dos endpoints nos `pb_hooks`), NUNCA apenas filtrando na tela.
5. **Tabelas globais compartilhadas (iguais para todos):** `ncm`, `cest`, `cfop`, `cfop_conversao_entrada`, `icms_aliquotas_uf`, `icms_interestadual`, `tabelas_fiscais_codigos`, `unidades_medida` e `intermediadores`. Todos os assinantes e usuários têm permissão de leitura; apenas o usuário master tem permissão de alteração.
6. **Um login só para o dono do SaaS:** O usuário `master` é o proprietário da plataforma SaaS, pertence ao assinante de origem (`HOSPITAL HOME`), utiliza o ERP normalmente em suas operações diárias e tem também acesso exclusivo ao item "Painel Master" no menu (etapa futura).
7. **Privilégio master definido exclusivamente pelo backend:** Apenas o backend define e valida quem é master (`users.tipo = 'master'`). Nenhuma tela, endpoint público ou cadastro de usuário pode criar, remover ou alterar o privilégio de master. O navegador é bloqueado de alterar o campo `tipo` de `users` e de alterar o e-mail do master.
8. **Situações da Licença:** Os status válidos da assinatura são: `Trial`, `Ativa`, `Pausada`, `Expirada`, `Cancelada`.
9. **Novas coleções:** Toda coleção nova criada a partir da Etapa 9 já deve nascer com `assinante_id` (se for tabela de cadastro/configuração) ou com `empresa_id` (se for tabela de movimento/operacional vinculada a estabelecimento).
10. **Testes de Backend sem Resíduos no Repositório (Regra Permanente):** Daqui para frente, testes de backend rodam via requisições ao backend vivo ou verificações pontuais, NUNCA deixando arquivos de teste soltos em `pocketbase/migrations/` ou `pocketbase/hooks/`. Testes também NÃO podem registrar trabalhos agendados (`cronAdd`) nem rotas de teste no servidor. A runtime goja do PocketBase exige apenas `migrate()` no topo de migrations e rejeita arquivos de teste com "Invalid module" ou escopo corrompido.

### Módulo Backend `tenancy.js` e Endpoints de Multi-tenant

O arquivo `pocketbase/hooks/tenancy.js` concentra as funções utilitárias e endpoints centrais de governança multi-tenant:

1. **`assinanteDoUsuario(c)`:** Identifica o registro de `usuarios` associado ao token de autenticação atual e retorna o seu `assinante_id`. Lança erro 403 se o usuário não pertencer a nenhum assinante ativo.
2. **`eMaster(c)`:** Retorna booleano indicando se o usuário autenticado possui `tipo === 'master'` na coleção `users`.
3. **`empresasDoUsuario(c)`:** Retorna a lista de IDs de empresas ativas que o usuário logado tem permissão de acessar:
   - Se for Administrador (`perfis_acesso.administrador = true`): retorna todas as empresas ativas pertencentes ao PRÓPRIO `assinante_id` do usuário.
   - Demais usuários: retorna apenas as empresas ativas vinculadas expressamente em `usuarios_empresas` que pertençam ao mesmo `assinante_id`.
4. **`exigirEmpresaDoUsuario(c, empresaId)`:** Valida se a empresa informada está autorizada para o usuário autenticado dentro do escopo do seu assinante, lançando 403 em caso negativo.
5. **`GET /backend/v1/empresas/acessiveis`:** Endpoint que retorna as empresas ativas acessíveis para o usuário logado, filtrando rigorosamente pelo assinante no backend e alimentando o `EmpresaContext` (`useEmpresaAtiva`) com fallback resiliente.
6. **`GET /backend/v1/tenancy/me`:** Endpoint de diagnóstico e sessão que retorna o status do assinante, licença, plano, se o usuário logado é master, total de empresas e de usuários do assinante.

---

## Versão Atual do Projeto

**Versão 0.0.162** — Correção de Criação e Atualização de Marcas (Tenancy no CREATE e Sanitização no UPDATE):

1. **Inclusão de `assinante_id` no Cadastro de Marcas (`src/services/marcas.ts`):**
   - Na função `salvarMarca` (fluxo de criação `POST /api/collections/marcas/records`), inclusão explícita de `assinante_id` obtido do usuário autenticado (`pb.authStore.record.assinante_id` ou via `obterUsuarioCacheLocal`).
   - Cumpre a regra de criação da coleção `marcas` (`assinante_id = @request.auth.assinante_id`), eliminando o erro HTTP 400 ("Failed to create record.") ao criar marcas no ERP (ex.: "CURATEC" em `/cadastros/produtos/novo` via `SelectMarca.tsx`).
   - Limpeza preventiva de campos de sistema (`id`, `collectionId`, `collectionName`, `created`, `updated`, `expand`) no payload do create.
   - Verificação de duplicidade de marca restrita ao escopo do assinante ativo (`assinante_id`).

2. **Sanitização de Payload no Update de Marcas (`src/services/marcas.ts`):**
   - No fluxo de atualização (`PATCH /api/collections/marcas/records/:id`), garantia de que `assinante_id` NÃO seja enviado no corpo da requisição (cumprindo a regra `@request.body.assinante_id:isset = false`).
   - Omissão de campos de sistema e metadados (`id`, `collectionId`, `collectionName`, `created`, `updated`, `created_by`, `expand`), evitando erros HTTP 404 ou 400 ao salvar edição de marcas.

3. **Limpeza e Governança do Repositório:**
   - Auditoria e remoção de arquivo residual de teste (`scripts/test_92b.js`).
   - Confirmada a ausência de migrations 0093, crons ou rotas de teste no repositório.

---

**Versão 0.0.161** — Correção de Criação e Atualização de Fornecedores (Tenancy no CREATE e Sanitização no UPDATE):

1. **Inclusão de `assinante_id` no Cadastro de Fornecedores (`src/services/fornecedores.ts`):**
   - Na função `salvarFornecedor` (fluxo de criação `POST /api/collections/fornecedores/records`), inclusão explícita de `assinante_id` obtido do usuário autenticado (`pb.authStore.record.assinante_id` ou via `obterUsuarioCacheLocal`).
   - Cumpre a regra de criação da coleção `fornecedores` (`assinante_id = @request.auth.assinante_id`), eliminando o erro HTTP 400 ("Failed to create record.") ocorrido em `/cadastros/fornecedores/novo`.
   - Limpeza preventiva de campos de sistema (`id`, `collectionId`, `collectionName`, `created`, `updated`, `expand`) no payload do create.

2. **Sanitização de Payload no Update de Fornecedores (`src/services/fornecedores.ts`):**
   - No fluxo de atualização (`PATCH /api/collections/fornecedores/records/:id`), garantia de que `assinante_id` NÃO seja enviado no corpo da requisição (cumprindo a regra `@request.body.assinante_id:isset = false`).
   - Omissão de campos de sistema e metadados (`id`, `collectionId`, `collectionName`, `created`, `updated`, `created_by`, `expand`), evitando erros HTTP 404 ao salvar edição de fornecedores.

---

**Versão 0.0.160** — Eliminação de require nos Hooks de Numeração e Consulta de CPF (Funções Locais em Escopo JSVM):

1. **Substituição de `require` por Funções Locais em `numeracao_cadastros.js` e `consulta_cpf_rotas.js`:**
   - No ambiente Skip Cloud / PocketBase JSVM, os hooks são carregados num único bundle (`pb.js`), fazendo com que `require("${__hooks}/...")` lance `GoError: Invalid module` em runtime.
   - Em `pocketbase/hooks/numeracao_cadastros.js`: removido o `require("${__hooks}/numeracao_lib.js")` de todos os 5 callbacks (`produtos`, `clientes`, `fornecedores`, `condicoes_pagamento`, `empresas`) e substituído por função local `proximoNumeroLocal` declarada no corpo de cada callback com a mesma lógica atômica em transação contra a coleção `sequencias`.
   - Em `pocketbase/hooks/consulta_cpf_rotas.js`: removido o `require("${__hooks}/tenancy.js")` e substituído pela função local `assinanteDoUsuarioLocal` no corpo do callback da rota `GET /backend/v1/cadastros/consulta-cpf`, mantendo o isolamento por assinante e o tratamento com logs estruturados `[consulta-cpf]`.
   - Zero ocorrências da instrução `require` nos dois arquivos.
   - Deploy do backend validado com sucesso e logs sem nenhum erro "Invalid module".

---

**Versão 0.0.159** — Ativação da Chave da API de Consulta de CPF (APICPF_DEV_KEY no Backend):

1. **Configuração de Variável de Ambiente no Skip Cloud:**
   - Registrada a variável de ambiente `APICPF_DEV_KEY` com o valor de produção fornecido via `set_env`.
   - Chave confirmada disponível nos segredos do backend (`list_secrets`).
   - Backend reimplantado com sucesso via `deploy_backend`, disponibilizando a chave para o hook `pocketbase/hooks/consulta_cpf_rotas.js` através de `$os.getenv("APICPF_DEV_KEY")`.
   - Consulta ao endpoint `/backend/v1/cadastros/consulta-cpf` ativa para o frontend em `ClienteForm.tsx` sem consumo prévio da cota de consultas no build.

---

**Versão 0.0.158** — Ajuste de Documentação e Hooks de Consulta de CPF:

---

**Versão 0.0.156** — Correção de Criação e Atualização de Clientes (Tenancy no CREATE e Sanitização no UPDATE):

1. **Inclusão de `assinante_id` no Cadastro de Clientes (`src/services/clientes.ts`):**
   - Na função `salvarCliente` (fluxo de criação `POST /api/collections/clientes/records`), inclusão explícita de `assinante_id` obtido do usuário autenticado (`pb.authStore.record.assinante_id` ou via `obterUsuarioCacheLocal`).
   - Cumpre a regra de criação da coleção `clientes` (`assinante_id = @request.auth.assinante_id`), eliminando o erro HTTP 400 ("Failed to create record.") ocorrido em `/cadastros/clientes/novo`.
   - Limpeza preventiva de campos de sistema (`id`, `collectionId`, `collectionName`, `created`, `updated`, `expand`) no payload do create.

2. **Sanitização de Payload no Update de Clientes (`src/services/clientes.ts`):**
   - No fluxo de atualização (`PATCH /api/collections/clientes/records/:id`), garantia de que `assinante_id` NÃO seja enviado no corpo da requisição (cumprindo a regra `@request.body.assinante_id:isset = false`).
   - Omissão de campos de sistema e metadados (`id`, `collectionId`, `collectionName`, `created`, `updated`, `created_by`, `expand`).

---

**Versão 0.0.156** — Integração de Consulta de CPF no Cadastro de Clientes (apicpf.dev):

1. **Backend — Rota Segura de Consulta de CPF (`pocketbase/hooks/consulta_cpf_rotas.js`):**
   - Rota `GET /backend/v1/cadastros/consulta-cpf?cpf={numeros}` com autenticação obrigatória via `$apis.requireAuth()`.
   - Isolamento pelo assinante do usuário com validação de tenancy via módulo `tenancy.js` (`assinanteDoUsuario`) requerido dentro do callback.
   - Validação de CPF (11 dígitos numéricos com cálculo dos dígitos verificadores no módulo 11 e rejeição de sequências repetidas).
   - Leitura segura da chave de API via variável de ambiente `APICPF_DEV_KEY` ($os.getenv). Se ausente ou vazia, responde HTTP 400 com mensagem amigável: _"Consulta de CPF não configurada. Cadastre a chave da API CPF no painel."_ sem travar a tela.
   - Quando configurada, consome via `$http.send` a API `https://apicpf.dev/consulta?cpf={apenas_numeros}` com cabeçalho `X-API-KEY`.
   - Em HTTP 200, retorna ao frontend `{ sucesso: true, nome, data_nascimento, mae, genero }`.
   - Em caso de 404 da base externa, retorna HTTP 404 com `{ sucesso: false, erro: "cpf_nao_encontrado", mensagem: "CPF não encontrado na base. Preencha os dados manualmente." }`.
   - Tratamento de exceções com logs seguros `[consulta-cpf]`, sem vazar a chave de API no log ou na resposta.

2. **Frontend — Integração no Formulário de Clientes (`ClienteForm.tsx` e `services/clientes.ts`):**
   - Serviço tipado `consultarCpfCliente(cpf)` em `src/services/clientes.ts` consumindo o endpoint do PocketBase.
   - No formulário de cliente (`ClienteForm.tsx`), ao sair do campo CPF (`onBlur`) com 11 dígitos válidos para Pessoa Física:
     - Dispara a consulta com feedback visual discreto (indicador com spinner `Consultando CPF...`).
     - Preenche automaticamente a razão social / nome completo e a data de nascimento (convertendo `DD/MM/AAAA` para `AAAA-MM-DD` para o input de data), mantendo ambos totalmente editáveis.
     - Notifica o operador com toast e hint amigável: _"Dados preenchidos pela consulta de CPF"_.
     - Cache local em sessão (`useRef<Set<string>>`) para não consultar novamente o mesmo CPF já retornado com sucesso.
     - Na edição, só efetua a consulta se o operador tiver alterado o CPF em relação ao valor inicial do cadastro.
     - Se o CPF não for localizado na base externa (`cpf_nao_encontrado`), exibe aviso amigável e permite prosseguir com preenchimento manual sem bloqueio.
     - Se a chave não estiver configurada (`chave_nao_configurada`), exibe toast informativo apenas uma vez e não interrompe nem trava o preenchimento.

---

**Versão 0.0.155** — Correção Pontual de Runtime no Update de Empresas (Sanitização do Payload PATCH):

1. **Sanitização de Payload na Edição de Empresas (`src/services/empresas.ts`):**
   - Na função `atualizarEmpresa`, sanitização do payload enviado no PATCH para `/api/collections/empresas/records/:id`, omitindo campos imutáveis e de sistema (`assinante_id`, `id`, `collectionId`, `collectionName`, `created`, `updated`, `created_by`).
   - Evita a violação da regra de update da coleção `empresas` (`@request.body.assinante_id:isset = false`), corrigindo o erro HTTP 404 retornado pelo PocketBase ao salvar edição de empresas em `/cadastros/empresas/:id/editar`.

---

**Versão 0.0.154** — Etapa 9 Multi-tenant (Ajuste de Unicidade de Empresas por Assinante - Migration 0092):

1. **Unicidade de Código de Empresas por Assinante (Migration 0092):**
   - Na coleção `empresas`, remoção do índice único global `idx_empresas_codigo` (que impunha `codigo` único em todo o banco, gerando erro "codigo: Value must be unique." ao auto-cadastrar novas matrizes com código 1 a partir do endpoint `/backend/v1/assinatura/cadastrar`).
   - Criação do índice único composto `idx_empresas_assinante_codigo` em `(assinante_id, codigo)`.
   - A numeração de código de empresas segue rigorosamente a regra das demais coleções cadastrais de tenancy (clientes, fornecedores, produtos, grupos, plano_contas, etc.), sendo gerada por assinante através da coleção `sequencias` (`tipo: 'codigo_empresas'`).
   - Migration estritamente idempotente, sem alteração de campos, esquemas ou dados existentes no banco vivo.
   - Demais índices únicos e globais mantidos intactos (`idx_empresas_cnpj`, `idx_assinantes_licenca`, `idx_sequencias_chave`, etc.).

---

**Versão 0.0.153** — Etapa 9 Multi-tenant (Prompt 9.8-2b: Correção "Invalid module" no require de numeracao_lib na Rota Cadastrar):

1. **Eliminação do `require` de `numeracao_lib.js` na rota `POST /backend/v1/assinatura/cadastrar` (`pocketbase/hooks/assinatura_rotas.js`):**
   - No ambiente de servidor Skip Cloud / PocketBase os hooks são empacotados num único bundle (`pb.js`), fazendo com que `require(`${\_\_hooks}/numeracao_lib.js`)` falhe com `GoError: Invalid module`.
   - Adicionada a função local `proximoNumeroLocal` diretamente no corpo do callback da rota `cadastrar`, com implementação idêntica e mantendo a escrita na coleção `sequencias`, numeração sequencial e seeds de fallback.
   - Eliminados os dois `require(`${__hooks}/numeracao_lib.js`)` (dentro de `executarCargaInicial` e na transação `$app.runInTransaction`).
   - Nenhuma chamada a `require` restante na rota `cadastrar`.
   - Nenhuma alteração nas validações, transação atômica, rate-limit ou rota `/assinatura/planos`.

---

**Versão 0.0.152** — Etapa 9 Multi-tenant (Prompt 9.8-2: Página Pública de Auto-Cadastro /cadastro e Correção de Lotes):

1. **Página Pública `/cadastro` (`src/pages/auth/CadastroPublicoPage.tsx` e `src/App.tsx`):**
   - Rota pública e acessível sem login (`PublicOnlyRoute` em `/cadastro`), permitindo que novos clientes criem suas contas de forma independente.
   - **Catálogo de Planos Comerciais:** listagem dos planos de assinatura ativos e comerciais (`GET /backend/v1/assinatura/planos` com fallback em `planos_catalogo`). Permite pré-selecionar o plano diretamente pela URL (`/cadastro?plano=id`, nome ou etiqueta) ou alterar interativamente na tela, apresentando valores, limites de empresas e usuários, e recursos fiscais inclusos (NF-e, NFC-e e SPED).
   - **Dados do Responsável (Usuário Administrador):** nome completo, e-mail corporativo com validação de formato, telefones de contato, WhatsApp e senha com confirmação (mínimo de 8 caracteres).
   - **Dados da Empresa Matriz:** CNPJ com validação de 14 posições e dígitos verificadores com pesos e módulo 11 (suporta alfanumérico e numérico), consulta automática e enriquecimento cadastral via BrasilAPI (`buscarBrasilApiCnpj`), razão social, nome fantasia, Inscrição Estadual, CRT (Regime Tributário) e endereço completo com busca via ViaCEP (`buscarViaCep`). Todos os campos editáveis pelo usuário.
   - **Termos de Uso e Política de Privacidade:** checkbox mandatório e modal informativo com as diretrizes de avaliação Trial e segurança SaaS multi-tenant.
   - **Integração com o Backend:** consome a rota pública `POST /backend/v1/assinatura/cadastrar` com tratamento de mensagens de erro amigáveis retornadas pelo servidor.
   - **Acesso Direto Pós-Cadastro:** após a criação atômica no backend, o usuário é automaticamente autenticado no ERP (`authWithPassword`) e redirecionado para `/painel`, com a empresa matriz criada selecionada como empresa ativa no `EmpresaContext`.
   - **Link Direto na Tela de Login:** atalho "Cadastre-se grátis" adicionado no rodapé de `LoginScreen.tsx`.

2. **Integração com o Painel Master (`MasterPage.tsx`):**
   - No quadro "Gerador de Link de Primeiro Cadastro", o botão "Abrir página" agora abre imediatamente a página `/cadastro` em nova aba com o link gerado contendo o plano pré-selecionado (`/cadastro?plano=id`).

3. **Correção no Card de Lotes do Painel Inicial (`Index.tsx`):**
   - Corrigido o filtro de consulta da coleção `lotes` no painel inicial para utilizar o campo real `quantidade > 0` em vez de `quantidade_saldo > 0` (campo inexistente no esquema).

---

**Versão 0.0.151** — Etapa 9 Multi-tenant (Prompt 9.8-1: Endpoint Público de Assinatura e Cadastro de Novos Assinantes):

- Endpoint `POST /backend/v1/assinatura/cadastrar` no ar em `pocketbase/hooks/assinatura_rotas.js`.
- Criação atômica de assinante Trial, empresa matriz, perfil Administrador, usuário e carga inicial.
- Validações de CNPJ, e-mail único, rate limit de 5 cadastros/hora/IP via cabeçalho `x-forwarded-for`.

---

**Versão 0.0.149** — Eliminação Total do require de master_lib.js nos Hooks Ativos (Funções Locais em Escopo JSVM):

1. **Eliminação dos requires de `master_lib.js` nos 4 arquivos de hooks restantes:**
   - Para contornar a falha de empacotamento no servidor onde `require(`${\_\_hooks}/master_lib.js`)` lança `"GoError: Invalid module"` no bundle unificado `pb.js`, todos os pontos de consumo restantes foram adaptados para declarar localmente (dentro de cada função/callback, respeitando o escopo da JSVM goja) cópias fiéis das funções auxiliares necessárias:
     - `pocketbase/hooks/cron_expiracao_licencas.js`: o cron diário de expiração de licenças (`expiracao_diaria_licencas`) agora define localmente `processarExpiracaoLicencasLocal` e `registrarEventoLicencaLocal`, sem require externo.
     - `pocketbase/hooks/tenancy.js`: os 7 pontos que antes dependiam do require de `master_lib.js` foram saneados com implementações locais (`obterAssinanteImpersonadoLocal`, `checarSeMasterLocal`, `validarLicencaAtivaOuBloquearLocal`) dentro de `assinanteDoUsuario`, `empresasDoUsuario`, `GET /backend/v1/empresas/acessiveis` e `GET /backend/v1/tenancy/me`. As três situações de tenancy continuam garantidas com fidelidade: (a) usuário master não bloqueado, (b) licença pausada/expirada/cancelada bloqueada com "Licença pausada ou vencida. Fale com o suporte.", e (c) impersonação pelo master na coleção `master_impersonacoes`.
     - `pocketbase/hooks/auditoria_modo_master.js`: em `onRecordCreate` de `logs_auditoria`, as funções `checarSeMasterLocal` e `obterAssinanteImpersonadoLocal` são declaradas localmente para marcar `modo_master = true` quando master estiver em atendimento de suporte.
     - `pocketbase/hooks/fiscal_credenciais_rotas.js`: no endpoint `GET /backend/v1/fiscal/credenciais`, a verificação de modo master para ocultar credenciais foi adaptada com funções locais.
     - Adicionalmente em `pocketbase/hooks/usuario_bloquear_licenca_auth.js`: eliminado o require restante de `master_lib.js` com funções locais no callback de login.
   - NENHUM arquivo ativo em `pocketbase/hooks/` faz mais require de `master_lib.js`. O arquivo `master_lib.js` permanece intacto no repositório.

---

**Versão 0.0.148** — Eliminação de require de master_lib nas Rotas Master (Funções Locais nos Callbacks):

1. **Eliminação do `require(`${\_\_hooks}/master_lib.js`)` em `pocketbase/hooks/master_rotas.js`:**
   - O bundler do deploy do PocketBase no servidor empacota os hooks em um único `pb.js`. Em runtime, todo `require(`${\_\_hooks}/master_lib.js`)` lançava `"GoError: Invalid module"` (stack: `pb.js:3:39` / `3:58`).
   - Para resolver em definitivo a causa raiz nas rotas do painel master sem violar a regra de escopo da JSVM goja (que impede funções top-level nos arquivos de hooks), as funções de `master_lib.js` foram embutidas verbatim como **funções locais** diretamente no início do corpo de cada callback `routerAdd`.
   - Callbacks corrigidos com funções locais:
     - `POST /backend/v1/master/test-acesso`: funções locais `exigirMaster`, `obterConfigMaster`.
     - `POST /backend/v1/master/suporte/entrar`: funções locais `exigirMaster`, `definirAssinanteImpersonado`.
     - `POST /backend/v1/master/suporte/sair`: funções locais `exigirMaster`, `obterAssinanteImpersonado`, `limparAssinanteImpersonado`.
     - `POST /backend/v1/master/executar-trabalho-expiracao`: funções locais `exigirMaster`, `registrarEventoLicenca`, `processarExpiracaoLicencas`.
     - `POST /backend/v1/master/executar-teste-completo-97a`: função local `exigirMaster`.
     - `POST /backend/v1/master/executar-teste-completo-97b2`: funções locais `exigirMaster`, `checarSeMaster`, `registrarEventoLicenca`, `obterAssinanteImpersonado`, `definirAssinanteImpersonado`, `limparAssinanteImpersonado`, `validarLicencaAtivaOuBloquear`, `processarExpiracaoLicencas`; `require(`${\_\_hooks}/tenancy.js`)` envolvido isoladamente em try/catch resiliente.
     - `POST /backend/v1/master/executar-teste-completo-97a2`: função local `exigirMaster`.
     - `GET /backend/v1/master/status`: funções locais `exigirMaster`, `obterConfigMaster`.
     - `GET /backend/v1/master/resumo`: funções locais `exigirMaster`, `obterConfigMaster`.
     - `GET /backend/v1/master/licencas`: função local `exigirMaster`.
     - `GET /backend/v1/master/licencas/{id}/historico`: função local `exigirMaster`.
     - `POST /backend/v1/master/licencas/{id}/renovar`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `PUT /backend/v1/master/licencas/{id}/limites`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `PUT /backend/v1/master/licencas/{id}/expiracao`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `PUT /backend/v1/master/licencas/{id}/plano`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `PUT /backend/v1/master/licencas/{id}/status`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `PUT /backend/v1/master/licencas/{id}/dados-gerais`: funções locais `exigirMaster`, `registrarEventoLicenca`.
     - `DELETE /backend/v1/master/licencas/{id}`: função local `exigirMaster`.
     - `PUT /backend/v1/master/config`: função local `exigirMaster`.
     - `GET /backend/v1/master/planos`: função local `exigirMaster`.
     - `POST /backend/v1/master/planos`: função local `exigirMaster`.
     - `PUT /backend/v1/master/planos/{id}`: função local `exigirMaster`.
     - `DELETE /backend/v1/master/planos/{id}`: função local `exigirMaster`.
   - **Tratamento de Exceções Mantido:** Nas rotas `resumo`, `licencas`, `config` e `planos`, preservado o try/catch que relança `ApiError` / `ForbiddenError` e, para os demais erros, registra `console.log("[master] <rota>", ...)` e retorna HTTP 500 `{ erro: "master_falhou", rota, detalhe }`.
   - **Nota sobre outros hooks:** Outros hooks do repositório que requerem `master_lib.js` (`tenancy.js`, `auditoria_modo_master.js`, `cron_expiracao_licencas.js`, `fiscal_credenciais_rotas.js`) ainda dependem do `require` e serão tratados no próximo prompt.

---

**Versão 0.0.147** — Correção Mínima e Urgente nas Rotas Master (Try/Catch e Require Escopo JSVM):

1. **Correção das 4 Rotas Master (`pocketbase/hooks/master_rotas.js`):**
   - Nas rotas `GET /backend/v1/master/resumo`, `GET /backend/v1/master/planos`, `GET /backend/v1/master/licencas` e `PUT /backend/v1/master/config`, o `require(`${\_\_hooks}/master_lib.js`)` foi movido para dentro do bloco `try` como primeira instrução, seguido imediatamente da validação `exigirMaster`.
   - Se o `require` ou a execução falhar, a exceção não escapa do handler em erro 400 genérico.
   - Preservado o rethrow de `ApiError` / `ForbiddenError` (401/403) mantendo o bloqueio de quem não é master.
   - Adicionado log detalhado `console.log("[master] <rota>", ...)` e resposta estruturada HTTP 500 `{ erro: "master_falhou", rota: "<rota>", detalhe: ... }`.

---

**Versão 0.0.146** — Etapa 9 Multi-tenant (Prompt 9.7c: Detalhes Completos de Planos de Licença e Assinantes Vinculados):

1. **Extensão do Endpoint `/backend/v1/master/planos` (`pocketbase/hooks/master_rotas.js`):**
   - Agrupamento em tempo real dos assinantes cadastrados no SaaS por `plano_id`.
   - Cada plano devolve agora, além do totalizador `total_assinantes`, o array `assinantes` estruturado contendo: `id`, `nome`, `numero_licenca`, `status`, `data_expiracao`, `origem` e `created`.
   - Mantida a exigência estrita de privilégio master via `exigirMaster` do módulo `master_lib.js` carregado dinamicamente via `require` dentro do callback (em conformidade permanente com as regras da JSVM do PocketBase).

2. **Tipagem e Serviços no Frontend (`src/services/master.ts`):**
   - Atualizada a interface `MasterPlano` para contemplar `assinantes?: MasterPlanoAssinante[]`.
   - Criada a interface `MasterPlanoAssinante` tipando rigorosamente os dados da licença de cada assinante vinculado.

3. **Diálogo de Detalhes de Plano no Painel Master (`MasterPage.tsx`):**
   - **Botão "Detalhes" em cada Cartão do Catálogo de Planos:** Posicionado no rodapé à esquerda de cada cartão da aba "Catálogo de planos", abrindo o diálogo modal com os dados consolidados do plano.
   - **Link Interativo na Tabela de Licenças de Clientes:** Na coluna "Plano contratado", o nome do plano comercial tornou-se um botão interativo com ícone discreto que abre o mesmo diálogo de detalhes diretamente a partir da linha do assinante.
   - **Campos e Parâmetros Exibidos no Diálogo:**
     - Nome do plano, etiqueta comercial e situação (Ativo / Inativo em badge).
     - Descrição textual cadastrada.
     - Nota em destaque para planos exclusivos do Master (ex: "Plano Master", isenção permanente, não elegível a novos cadastros de clientes e protegido de exclusão).
     - Valor mensal formatado em R$ ou badge "Isento" quando R$ 0,00.
     - Limite de empresas (ou "Ilimitado" se 0).
     - Limite de usuários (ou "Ilimitado" se 0).
     - Recursos fiscais autorizados: NF-e modelo 55, NFC-e modelo 65 e SPED Fiscal (com indicação visual clara de Habilitado ou Bloqueado).
     - Datas de criação e de última atualização formatadas em data e hora brasileira.
     - **Seção "Assinantes neste plano":** contador de assinantes vinculados e lista detalhada com nome do cliente, badge "ORIGEM" quando matriz, número da licença, situação da licença (Ativa, Trial, Pausada, Expirada) e validade/expiração (ou "Vitalícia" para a HOSPITAL HOME). Quando vazio, exibe o aviso amigável "Nenhum assinante neste plano".
     - Botão de atalho para edição direta do plano via `abrirEditarPlano`.

4. **Integridade das Regras e do Banco:**
   - Nenhum plano comercial foi alterado ou excluído.
   - Preservados intactos o modo master (impersonação de suporte), bloqueios de autenticação para licenças pausadas/expiradas, o trabalho cron diário oficial e as sequências de numeração.
   - Nenhuma collection ou migration nova foi criada. Testes efetuados diretamente contra a API e backend vivo sem arquivos residuais (Regra de Ouro nº 10).

---

**Versão 0.0.143** — Etapa 9 Multi-tenant (Prompt 9.7b3: Saneamento do Agendador de Tarefas, Neutralização de Migrations de Teste e Regra Permanente Anti-Cron/Rotas de Teste):

1. **Remoção do Cron Fantasma `teste97b_runner` (`cron_expiracao_licencas.js`):**
   - Removido do agendador vivo do PocketBase o trabalho fantasma `teste97b_runner` via chamada `cronRemove('teste97b_runner')` na inicialização do hook `pocketbase/hooks/cron_expiracao_licencas.js`.
   - O agendador agora mantém única e exclusivamente a tarefa oficial de produção `expiracao_diaria_licencas` (`0 0 * * *`), eliminando o disparo a cada minuto que registrava erros "Invalid module" nos logs do backend.
   - Preservação estrita dos hooks oficiais sem alteração indevida de regras de negócio.

2. **Neutralização da Migration de Teste 0085:**
   - Registrada a neutralização de testes em migrations aplicadas (ex: 0082 e 0085), assegurando que o histórico de migrations permaneça íntegro sem resíduos operacionais de testes no repositório.

3. **Reforço e Expansão da Regra de Ouro nº 10:**
   - Adicionada proibição expressa de testes registrarem trabalhos agendados (`cronAdd`) ou criarem rotas de teste na API do servidor. Testes rodam unicamente via chamadas REST externas ou verificações seguras no backend vivo.

---

**Versão 0.0.141** — Etapa 9 Multi-tenant (Prompt 9.7b2: Modo Master / Suporte, Faixa Fixa no Topo, Bloqueio de Licenças Pausadas/Vencidas, Cron Job de Expiração Diária e Testes no Backend Vivo):

1. **Modo Master / Impersonação de Suporte Técnico (`master_rotas.js`, `master_lib.js`, `tenancy.js`, `Header.tsx`, `EmpresaContext.tsx`):**
   - **Endpoints de Suporte do Master:**
     - `POST /backend/v1/master/suporte/entrar`: recebe `{ assinante_id }`, valida se o requisitante é master (`exigirMaster`), grava/atualiza a sessão na coleção `master_impersonacoes` e limpa os caches de tenancy. A HOSPITAL HOME (`origem = true`) é protegida de auto-impersonação.
     - `POST /backend/v1/master/suporte/sair`: remove a sessão de impersonação do master em `master_impersonacoes`, retornando imediatamente o contexto de tenancy e empresas ativas para o assinante de origem `HOSPITAL HOME`.
     - `GET /backend/v1/master/suporte/status`: retorna se há impersonação ativa, com dados do assinante cliente atendido (`ativo`, `assinante_id`, `assinante_nome`, `numero_licenca`).
   - **Adaptação dos Módulos `tenancy.js` e `master_lib.js`:**
     - Funções `assinanteDoUsuario` e `empresasDoUsuario` consultam `obterAssinanteImpersonado(userId)`. Quando ativo, o master passa a enxergar estritamente as filiais e os dados daquele cliente como se fosse um administrador da conta cliente.
     - Endpoints `/backend/v1/tenancy/me` e `/backend/v1/empresas/acessiveis` reportam o contexto do cliente suportado, injetando flags `modo_master: true` e `assinante_impersonado`.
   - **Auditoria de Ações em Modo Master (`auditoria_modo_master.js`):**
     - Hook do PocketBase intercepta alterações efetuadas em modo master e marca `modo_master = true` e sufixo `(modo master)` no `usuario_nome` em `logs_auditoria`, garantindo rastreabilidade total de intervenções de suporte.
   - **Faixa Fixa no Topo do ERP (`Header.tsx`):**
     - Quando em modo master, exibe banner fixo e proeminente no topo:
       _"Você está no painel de {NOME_DO_CLIENTE} (modo master)"_
     - Botão integrado **"Sair do painel do cliente"**: chama `sairModoSuporteMaster`, recarrega o contexto de empresas para a HOSPITAL HOME e redireciona para `/master`.
   - **Ativação da Ação "Acessar painel" no Painel Master (`MasterPage.tsx`):**
     - No menu "..." de cada licença da aba "Licenças de clientes", o botão **"Acessar painel"** está ativo e funcional para clientes terceiros (ex: TESTE B), invocando o endpoint de suporte e navegando para o ERP do cliente.
     - Para a `HOSPITAL HOME` (`origem = true`), a opção permanece desabilitada com tooltip `"Licença de origem do SaaS"`.

2. **Bloqueio de Login por Licença Pausada ou Vencida (`usuario_bloquear_licenca_auth.js`, `LoginScreen.tsx`):**
   - Hook intercepta autenticações em `users` (`onRecordAuthRequest`). Se a licença do assinante estiver com `status` em `'Pausada'`, `'Expirada'` ou `'Cancelada'`, ou se a data de expiração estiver ultrapassada, o login do usuário comum é recusado imediatamente pelo backend com erro claro:
     _"Licença pausada ou vencida. Fale com o suporte."_
   - Usuário master e assinante de origem (`HOSPITAL HOME`) são permanentemente isentos de bloqueio, garantindo acesso administrativo irrestrito à plataforma.
   - Tela de login (`LoginScreen.tsx`) exibe mensagem de alerta vermelha com o texto exato retornado quando a licença estiver pausada/vencida.

3. **Job Cron de Expiração Diária de Licenças (`cron_expiracao_licencas.js`):**
   - Agendamento diário (`cronAdd('expiracao_diaria_licencas', '0 0 * * *', ...)`) registrado na plataforma.
   - Executa varredura de assinantes que não sejam de origem (`origem = false`) com `status = 'Ativa'` e cuja `data_expiracao` seja anterior à data atual (`hoje`), atualizando o status para `'Expirada'` e registrando evento de `'Expiração'` em `licencas_eventos`.
   - Endpoint manual do Master para acionamento sob demanda: `POST /backend/v1/master/executar-trabalho-expiracao`.

4. **Bateria de Testes no Backend Vivo (Executados e Aprovados):**
   - **Teste 1 (Impersonação e Modo Master):** Master entrou no TESTE B (`l6vfd1p688j2y9a`); `tenancy/me` e `empresas/acessiveis` devolveram o escopo do TESTE B; log gravado com `modo_master = true`; saída de suporte retornou o contexto com sucesso para a HOSPITAL HOME.
   - **Teste 2 (Bloqueio por Pausa):** TESTE B pausado; autenticação de `admin@testeb.com` bloqueada com _"Licença pausada ou vencida. Fale com o suporte."_; após reativação, o login foi restabelecido normalmente.
   - **Teste 3 (Expiração e Renovação):** TESTE B colocado com data vencida; execução do trabalho de expiração mudou status para `Expirada` e registrou evento `Expiração` em `licencas_eventos`; renovação `+30d` restabeleceu a licença como `Ativa`. No fim do teste, o TESTE B permaneceu `Ativa`.
   - **Teste 4 (Proteção Inviolável):** Confirmado que o usuário Master e a HOSPITAL HOME (`origem = true`, licença `HH-RFR8HF`) nunca são bloqueados sob nenhuma circunstância.
   - Sem erros de deploy, hooks ou cron nos logs do Skip Cloud.

---

**Versão 0.0.139** — Etapa 9 Multi-tenant (Prompt 9.7b: Painel Master - Aba Licenças de Clientes, Poderes da Licença, Eventos e Exclusão em Cascata):

1. **Aba "Licenças de clientes (N)" no Painel Master (`MasterPage.tsx`):**
   - Contador dinâmico de clientes no título da aba (`Licenças de clientes (2)`).
   - Barra de pesquisa e filtros operacionais em tempo real:
     - **Busca rápida:** pesquisa textual sobre Nome do assinante, Número da Licença, Documento/CNPJ e E-mail.
     - **Filtro por Situação da Licença:** Todos, Ativa, Trial, Pausada, Expirada ou Cancelada.
     - **Filtro por Plano Comercial:** Todos ou filtrado por plano específico do catálogo.
     - **Filtro de Vencimento:** Todos, Vencidas (data de expiração anterior a hoje) ou A vencer em até 7 dias.
   - **Tabela Estruturada de Licenças:**
     - Colunas informativas: Assinante (com identificação de conta de origem/matriz), Número da licença (com botão de cópia rápida), Plano / Valor (com badge de plano e indicação de Isento/Grátis), Situação (badges estilizados por status), Vigência / Expiração (com contagem regressiva de dias ou indicação de expirada há X dias), Capacidade / Uso (empresas cadastradas vs limite, usuários cadastrados vs limite, indicando limites personalizados), e Renovações (+30d acumulados).
     - Menu de Ações por Licença ("..."):
       - **Histórico:** abre modal com linha do tempo de eventos auditados da licença.
       - **+30 dias:** renovação rápida somando 30 dias à maior data entre hoje e a expiração atual, ativando a licença e registrando evento em `licencas_eventos`.
       - **Editar limites:** permite customizar limites de filiais e usuários individualmente (`limites_personalizados = true`) ou resetar para o padrão do plano.
       - **Mudar plano:** altera o plano comercial do assinante com recálculo automático de capacidades.
       - **Pausar / Reativar:** alterna a situação da licença entre Ativa e Pausada.
       - **Excluir licença:** exclusão definitiva em cascata com exigência de confirmação digitada do nome exato do assinante.

2. **Os Poderes da Licença e Regras de Negócio no Backend (`master_rotas.js`):**
   - **Regra da Maior Data na Renovação (+30d):** Ao acionar `POST /backend/v1/master/licencas/{id}/renovar`, a nova data de expiração é calculada somando 30 dias à maior data entre o dia atual (`hoje`) e a expiração prévia (`data_expiracao`), evitando perda de dias já pagos pelo cliente ou garantindo 30 dias a partir de hoje caso a licença já esteja vencida. A situação é atualizada para `'Ativa'` e um evento com tipo `'Renovação +30d'` é persistido.
   - **Histórico e Auditoria (`licencas_eventos`):** Todas as intervenções do Master geram eventos rastreados na tabela `licencas_eventos` com tipo, número da licença, plano, validade, autor (`criado_por`) e descrição textual detalhada. Endpoint: `GET /backend/v1/master/licencas/{id}/historico`.
   - **Edição de Limites Personalizados (`PUT /backend/v1/master/licencas/{id}/limites`):** Permite desvincular limites do plano padrão, gravando `limites_personalizados = true` e limites próprios de filiais e usuários, com evento auditado `'Edição'`.
   - **Alteração de Plano Comercial (`PUT /backend/v1/master/licencas/{id}/plano`):** Atualiza `plano_id` do assinante e opcionalmente sincroniza os limites estruturais com os padrões do novo plano, gerando evento `'Mudança de plano'`.
   - **Pausa e Reativação (`PUT /backend/v1/master/licencas/{id}/status`):** Altera status para `'Pausada'` ou `'Ativa'`, gerando evento correspondente.
   - **Proteção Absoluta da HOSPITAL HOME (`origem = true` ou licença `HH-RFR8HF`):**
     - O backend bloqueia expressamente qualquer tentativa de pausar, alterar validade ou excluir o assinante de origem `HOSPITAL HOME`, retornando erro claro de segurança em conformidade com as regras do `PROJETO_ERP.md`.
   - **Exclusão em Cascata com Confirmação Digitada (`DELETE /backend/v1/master/licencas/{id}`):**
     - Exige envio no corpo da requisição do campo `confirmacao_nome` exatamente idêntico ao nome cadastrado do assinante.
     - Executa deleção em cascata atômica e segura removendo em ordem reversa: registros filhas e operacionais vinculados ao assinante (vendas, notas de entrada, financeiro, estoque, documentos fiscais, credenciais, empresas, usuários em `usuarios` e `_pb_users_auth_`, eventos e o assinante).
     - Tentativas contra a HOSPITAL HOME são terminantemente bloqueadas.

3. **Endpoints de Produção do Master Mantidos e Intactos:**
   - Todos os endpoints sob `/backend/v1/master/licencas/*` ativos e operantes:
     - `GET /backend/v1/master/licencas`: listagem consolidada de clientes, planos, uso e vigência.
     - `GET /backend/v1/master/licencas/{id}/historico`: linha do tempo de eventos de ciclo de vida.
     - `POST /backend/v1/master/licencas/{id}/renovar`: renovação +30d pela regra da maior data.
     - `PUT /backend/v1/master/licencas/{id}/limites`: alteração de limites e personalização.
     - `PUT /backend/v1/master/licencas/{id}/plano`: troca de plano comercial.
     - `PUT /backend/v1/master/licencas/{id}/status`: alternância entre Ativa e Pausada.
     - `DELETE /backend/v1/master/licencas/{id}`: exclusão em cascata protegida com confirmação digitada.
   - Demais endpoints master preservados: `/status`, `/resumo`, `/config` e CRUD `/planos`.

4. **Sanitização do Repositório e Regra de Ouro Permanente:**
   - Removida a rota de teste transitória `/backend/v1/master/executar-teste-completo-97b` de `pocketbase/hooks/master_rotas.js`.
   - Removido o arquivo de teste `pocketbase/migrations/0082_executar_teste_item4_97b.js`.
   - Diretórios `pocketbase/migrations/` e `pocketbase/hooks/` auditados e confirmados 100% limpos.
   - Reforçada a **Regra de Ouro nº 10**: arquivos de teste NUNCA devem ser commitados no repositório em `pocketbase/migrations/` ou `pocketbase/hooks/`; testes automatizados rodam exclusivamente por chamadas contra a API viva.

---

**Versão 0.0.138** — Etapa 9 Multi-tenant (Prompt 9.7a2: Painel Master - Links de Cadastro, Painel de Operações, Resumo e CRUD do Catálogo de Planos):

1. **Quadro "Gerador de Link de Primeiro Cadastro" (`MasterPage.tsx`):**
   - Selos visuais `"Página pública /cadastro"` e `"N dias de teste grátis"` integrados.
   - Parâmetro `dias_trial` carregado diretamente de `config_master.dias_trial` e editável diretamente neste quadro via botão "Salvar" (`PUT /backend/v1/master/config`).
   - Seletor de plano pré-selecionado opcional com opção `"Nenhum plano específico (cliente escolhe na tela)"` ou seleção de um plano ativo do catálogo (`/cadastro` ou `/cadastro?plano=id`).
   - Botões de ação para o link gerado: `"Copiar"` (com feedback de copiado para área de transferência) e `"Abrir página"` (exibindo aviso amigável de em breve até o Prompt 9.8).
   - Área de **Compartilhamento direto**:
     - **WhatsApp:** abre o WhatsApp Web/App com mensagem de convite personalizada e o link.
     - **E-mail:** abre o cliente de e-mail padrão com assunto e corpo de convite estruturados.
     - **Copiar link:** botão rápido de cópia direta do link.

2. **Quadro "Painel Master de Operações" (`MasterPage.tsx` e `master_rotas.js`):**
   - Endpoint dedicado `GET /backend/v1/master/resumo` com verificação estrita via `exigirMaster`.
   - 4 Cartões de indicadores operacionais:
     - **Assinantes (total):** contagem geral de clientes assinantes do banco (HOSPITAL HOME e TESTE B = 2).
     - **Licenças ativas:** contagem de assinantes com `status = 'Ativa'`.
     - **Licenças expiradas:** contagem de assinantes com `status = 'Expirada'`.
     - **Planos:** total de planos comerciais cadastrados no catálogo.
   - Linha de métricas financeiras:
     - **MRR total ativo:** cálculo consolidado da soma do `valor_mensal` das licenças ativas, desconsiderando as contas isentas (`valor_mensal = 0`, ex: Plano Master).
     - **Clientes em trial:** contagem de assinantes com `status = 'Trial'`.
     - Nota de governança: `"Cobrança comercial gerenciada pelo Master"`.

3. **Aba "Catálogo de planos (N)" com Gestão Completa (`MasterPage.tsx` e `master_rotas.js`):**
   - Título da aba com contador dinâmico de planos (`Catálogo de planos (4)`) e botão `"Novo plano"`.
   - Aba `"Licenças de clientes"` mantida estritamente com o aviso "em construção" para entrega no Prompt 9.7b.
   - **Cartões de Plano no Catálogo:**
     - Exibição de nome, situação Ativo/Inativo, etiqueta comercial (badge), descrição detalhada, valor mensal (com indicação `"Grátis / Master"` quando `valor_mensal = 0`), limites estruturais (empresas e usuários, com indicação `"Ilimitado"` quando 0 ou vazio), e recursos fiscais inclusos (NF-e mod 55, NFC-e mod 65 e EFD SPED Fiscal).
     - Botões de ação em cada cartão: `"Editar"` e `"Excluir"`.
     - **Proteções de Negócio na Exclusão:**
       - O **Plano Master** (`exclusivo_master = true`) não possui botão de exclusão e o backend bloqueia qualquer tentativa.
       - Endpoints impedem a exclusão de planos em uso por qualquer assinante (ex: Plano Básico em uso pelo TESTE B), recusando a exclusão com mensagem sugerindo a inativação do plano para não afetar clientes ativos.
   - **Modal de Formulário (Criar / Editar Plano):**
     - Cobertura de todos os campos da tabela `planos_catalogo`: `nome`, `etiqueta`, `descricao`, `valor_mensal`, `limite_empresas`, `limite_usuarios`, `permite_nfe`, `permite_nfce`, `permite_sped`, `exclusivo_master`, `ativo`.
   - **Endpoints REST CRUD Master:**
     - `GET /backend/v1/master/planos`: lista todos os planos com contagem de assinantes vinculados.
     - `POST /backend/v1/master/planos`: criação de novos planos com validações.
     - `PUT /backend/v1/master/planos/{id}`: edição completa de planos existentes.
     - `DELETE /backend/v1/master/planos/{id}`: exclusão segura com regras de bloqueio.
     - `PUT /backend/v1/master/config`: alteração dos parâmetros do registro de `config_master`.

4. **Bateria de Testes Automatizados no Backend:**
   - Teste automatizado executado com sucesso:
     1. Resumo confirma 2 assinantes existentes (HOSPITAL HOME e TESTE B).
     2. Criação, edição e exclusão de plano de teste funcionaram com sucesso total.
     3. Tentativa de exclusão do plano Básico (usado pelo TESTE B) foi corretamente recusada pelo backend.
     4. Plano de teste temporário foi removido no término da execução.
     5. Sem arquivos de teste residuais no repositório.

---

**Versão 0.0.137** — Etapa 9 Multi-tenant (Prompt 9.7a: Painel Master - Parte 1: Tabelas, Planos Iniciais, Acesso e Topo):

1. **Modelagem de Dados e Migrations (Migration 0081):**
   - **`planos_catalogo`:** Coleção de planos com `nome`, `etiqueta`, `descricao`, `valor_mensal`, `limite_empresas`, `limite_usuarios`, `permite_nfe`, `permite_nfce`, `permite_sped`, `exclusivo_master`, `ativo`. Regras: leitura para planos ativos e não exclusivos por todos os usuários autenticados, ou visão irrestrita para o usuário master; criação/edição/exclusão exclusivas do master (`@request.auth.tipo = 'master'`).
   - **`assinantes` (campo `plano_id`):** Campo transformado em relação formal (`RelationField`) com a coleção `planos_catalogo`.
   - **`licencas_eventos`:** Linha do tempo de ciclo de vida com `assinante_id`, `numero_licenca`, `tipo` (Criação, Trial, Renovação +30d, Reativação, Mudança de plano, Pausa, Expiração, Edição), `plano_id`, `validade_ate`, `descricao`, `criado_por`. Leitura restrita ao próprio assinante ou ao master; gravação 100% restrita ao backend (`createRule: null`, `updateRule: null`, `deleteRule: null`).
   - **`config_master`:** Tabela de configuração global do SaaS com registro único (`dias_trial: 15`), gerenciada exclusivamente pelo master.

2. **Carga Inicial de Planos e Eventos de Criação:**
   - Cadastrado o **"Plano Master"** (exclusivo master, valor mensal R$ 0, empresas e usuários ilimitados, NF-e, NFC-e e SPED ativos) vinculado à `HOSPITAL HOME`.
   - Cadastrados os 3 planos de exemplo editáveis:
     - **Básico:** Etiqueta "Essencial", R$ 149/mês, 1 empresa, 3 usuários, NF-e + NFC-e.
     - **Profissional:** Etiqueta "Recomendado", R$ 299/mês, 3 empresas, 10 usuários, NF-e + NFC-e + SPED.
     - **Completo:** Etiqueta "Enterprise", R$ 599/mês, 10 empresas, usuários ilimitados, NF-e + NFC-e + SPED.
   - Assinante `TESTE B` vinculado ao plano Básico.
   - Registrados na tabela `licencas_eventos` os eventos de "Criação" para a `HOSPITAL HOME` e para o `TESTE B`.

3. **Arquitetura de Segurança no Backend (`master_lib.js` e `master_rotas.js`):**
   - Módulo compartilhado `pocketbase/hooks/master_lib.js` com as funções `exigirMaster`, `checarSeMaster` e `obterConfigMaster`. Respeitada rigorosamente a regra de escopo da JSVM goja (require dinâmico dentro dos callbacks, sem funções top-level nos hooks).
   - Endpoints sob `/backend/v1/master/*` (`/status`, `/planos`, `/test-acesso`, `/executar-teste-completo-97a`) validam privilégio master via `exigirMaster` e retornam código HTTP 403 Forbidden imediato para qualquer outro usuário (incluindo o admin do TESTE B).

4. **Acesso e Interface do Usuário Master no Frontend:**
   - **Menu Lateral (`Sidebar.tsx`):** Adicionado o item "Painel Master" (rota `/master`, ícone `Crown`), condicionado a `group.masterOnly && !isMaster` (visível estritamente para o master; invisível para usuários normais e administradores de filiais).
   - **Guarda de Rotas (`MasterRoute` em `RouteGuards.tsx`):** Proteção no roteador da aplicação contra acesso direto à URL `/master`, redirecionando para `/login` se não autenticado ou exibindo componente amigável `AcessoNegado` para usuários não-master.
   - **Topo do `/master` (`MasterPage.tsx`):**
     - Nome do sistema com selo visual em gradiente `"MASTER MULTI-TENANT"` e subtítulo `"Painel de Administração Global"`.
     - Botão destacado `"Ir ao Painel Gerencial"` que navega de volta para `/painel` no ERP.
     - Identificação de perfil `"Admin Master"` com e-mail do usuário autenticado.
     - Botões de ação no topo: `"Guia de Uso"`, `"Atualizar"` e `"Sair"` (logout com limpeza de sessão).
     - Abas inferiores estruturadas: `"Licenças de clientes"` (com aviso de em construção para o Prompt 9.7a2) e `"Catálogo de planos"` (com aviso de em construção para o Prompt 9.7b).

5. **Testes de Acesso e Isolamento Multi-tenant (Validação Real no Backend):**
   - Logado como master (`marceloslepre@gmail.com`): item "Painel Master" visível, acesso liberado à rota `/master` e respostas HTTP 200 em `/backend/v1/master/*`.
   - Logado como TESTE B (`admin@testeb.com`): item "Painel Master" oculto no menu, rota `/master` bloqueada por `MasterRoute`, e chamadas a `/backend/v1/master/*` rejeitadas com **HTTP 403 Forbidden**.

---

**Versão 0.0.136** — Etapa 9 Multi-tenant (Prompt 9.6c: Tela de Credenciais da Focus por Empresa, Fechamento do 9.6 e Correção de Inutilizações):

1. **Seção "Credenciais da Focus NFe por Empresa" na Tela de Configuração de Emissão Fiscal (`ConfiguracaoEmissaoFiscalPage.tsx`):**
   - Implementada seção dedicada e segura na rota `/fiscal/configuracao` exclusiva para administradores (`administrador = true`).
   - Campos de token para **Homologação** e **Produção** com tipo senha (`type="password"`), permitindo informar novos tokens sem expor valores prévios.
   - Indicação em tempo real do estado de cada token:
     - `"não cadastrado"` (badge neutro)
     - `"cadastrado (final XXXX)"` (badge verde exibindo os últimos 4 dígitos mascarados vindos do backend)
     - `"usando o segredo do sistema"` (badge azul quando a empresa resolve o token via variáveis de ambiente/segredos do Skip Cloud)
   - Badge com a **Origem em uso** no topo da seção: `Banco de Dados (Próprio)`, `Segredo do Sistema` ou `Não cadastrado`.
   - Texto de esclarecimento obrigatório sobre segurança: cada empresa utiliza o token de sua conta própria na Focus NFe e a chave completa **nunca volta para o navegador**.
   - Botão **"Salvar"**: grava de forma segura no backend através de `POST /backend/v1/fiscal/credenciais`.
   - Botão **"Testar conexão"**: testa a comunicação com a API da Focus NFe utilizando o token em vigor sem trafegar a chave no corpo da requisição (`POST /backend/v1/fiscal/credenciais/testar-conexao`).
   - Botão **"Registrar para todas as empresas"**: registra os webhooks na Focus NFe em lote para todas as filiais ativas do assinante (`POST /backend/v1/fiscal/registrar-webhook-assinante`), com URL e secret individuais.

2. **Serviços Frontend Integrados (`src/services/fiscalIntegracao.ts`):**
   - Criadas funções tipadas: `obterCredenciaisFiscais`, `salvarCredenciaisFiscais`, `testarConexaoCredenciaisFocus` e `registrarWebhookAssinante`.
   - Contratos alinhados com as respostas mascaradas `{ sucesso, cadastrado, origem_efetiva, ambiente, token_final_homologacao, token_final_producao, webhook_registrado, atualizado_em }`.

3. **Correção de Consulta de Inutilizações nos Relatórios Fiscais (`fiscal_relatorio_livro_saidas.js` e `sped/gerador.js`):**
   - Corrigido o aviso que poluía os logs de runtime do PocketBase: a coleção `inutilizacoes` não possui o campo `ativo` em seu esquema.
   - Removido o filtro inválido `&& ativo = true` nas consultas `$app.findRecordsByFilter('inutilizacoes', ...)` no Livro de Saídas (`fiscal_relatorio_livro_saidas.js`) e no gerador do SPED Fiscal (`sped/gerador.js`).
   - Auditados todos os demais hooks e consultas: nenhuma outra consulta com filtro incorreto foi identificada.

4. **Fechamento Completo do Prompt 9.6 (Multi-tenant - Credenciais Fiscais por Empresa):**
   - **Coleção `credenciais_fiscais` (Migration 0080):** tabela segura com regras fechadas para o navegador (`listRule: null`, `viewRule: null`, `createRule: null`, `updateRule: null`, `deleteRule: null`), índice único por `empresa_id` e webhook_secret automático de 32 bytes hex.
   - **Biblioteca `fiscal_token_lib.js`:** ordem de busca com prioridade 1 no banco (`credenciais_fiscais`) e fallback na prioridade 2 para segredos do Skip Cloud (`FOCUS_NFE_TOKEN_*`).
   - **Webhooks por Empresa:** endpoint de callback `POST /backend/v1/fiscal/webhook-focus/{empresa_id}` com leitura de parâmetro via `e.request.pathValue("empresa_id")` no PocketBase v0.23+ e validação de HMAC/Bearer pelo secret exclusivo da empresa.
   - **Isolamento Tenancy:** checagem rigorosa de acesso à empresa pelo assinante via `exigirEmpresaDoUsuario`.

---

**Versão 0.0.135** — Etapa 9 Multi-tenant (Prompt 9.6b: Backend de Credenciais Fiscais da Focus NFe por Empresa):

1. **Correção de Leitura de Parâmetros de Rota no PocketBase v0.23+ (`fiscal_webhook_focus.js`):**
   - Substituída a chamada obsoleta `requestInfo().pathParameters` por `e.request.pathValue("empresa_id")` no endpoint `POST /backend/v1/fiscal/webhook-focus/{empresa_id}`.
   - Preservada a rota legada sem parâmetro (`POST /backend/v1/fiscal/webhook-focus`), que continua validando autenticação via segredo global `FOCUS_NFE_WEBHOOK_SECRET` para compatibilidade total com a HOSPITAL HOME.

2. **Conexão Unificada de Tokens da Focus NFe via `obterTokenFocus` (`fiscal_token_lib.js`):**
   - Adequação completa dos hooks de emissão e cancelamento de notas (`pocketbase/hooks/fiscal_nfce_operacoes.js` e `pocketbase/hooks/fiscal_nfe_operacoes.js`) para obter credenciais exclusivamente via biblioteca `obterTokenFocus`.
   - Remoção de qualquer leitura direta de variáveis de ambiente `FOCUS_NFE_TOKEN_*` fora do módulo de controle `fiscal_token_lib.js`.
   - Módulo carregado via `require` dinâmico dentro dos callbacks, cumprindo a regra permanente de escopo da JSVM goja do PocketBase.

3. **Status e Diagnóstico de Segredos (`fiscal_credenciais_rotas.js`):**
   - Endpoint `GET /backend/v1/fiscal/status-segredos` exibe o status de cada empresa acessível ao usuário autenticado informando a origem da credencial (`segredo` ou `banco`), o ambiente configurado e o nome do segredo esperado, sem nunca expor os tokens completos.

4. **Isolamento Multi-tenant e Proteção da Coleção `credenciais_fiscais`:**
   - Tabela `credenciais_fiscais` (Migration 0080) confirmada com regras fechadas para o navegador (`listRule: null`, `viewRule: null`, `createRule: null`, `updateRule: null`, `deleteRule: null`).
   - Requisições autenticadas para `GET /backend/v1/fiscal/credenciais` validam estritamente o vínculo da empresa solicitada com o assinante do usuário (`exigirEmpresaDoUsuario`), retornando HTTP 403 Forbidden para tentativas de acesso cruzado entre assinantes distintos.

5. **Deploy do Backend e Integridade de Testes:**
   - Deploy aceito com sucesso pela runtime do Skip Cloud (`deploy_backend`), sem erros de compilação ou rejeição de hooks.
   - Validações realizadas diretamente contra a API viva sem deixar nenhum arquivo de teste em `pocketbase/migrations/` ou `pocketbase/hooks/`.

---

**Versão 0.0.133** — Etapa 9 Multi-tenant (Prompt 9.5c2: Fechamento do 9.5c, Recálculo de Contadores e Testes de Numeração por Assinante):

1. **Recálculo e Alinhamento dos Contadores da Coleção `sequencias` (Migration 0079):**
   - Ajustado o campo `ultimo_numero` para `required: false` na coleção `sequencias`, permitindo o armazenamento de 0 (zero) sem rejeição de validação do PocketBase v0.23+.
   - Recalculados idempotentemente os contadores da `HOSPITAL HOME` (`wqxiw7olvkup3sm`) para os 9 tipos a partir dos dados que REALMENTE existem no banco:
     - **Tipos por Empresa (Matriz HH `jy1d6k2u5j66h1o`):**
       - `vendas`: antes = 0, maior real = 0, depois = 0
       - `inventarios`: antes = 0, maior real = 0, depois = 0
       - `pedidos_compra`: antes = 0, maior real = 0, depois = 0
       - `transferencias`: antes = 0, maior real = 0, depois = 0
     - **Tipos por Assinante (empresa_id nulo/vazio):**
       - `codigo_produtos`: antes = 0, maior real = 0, depois = 0
       - `codigo_clientes`: antes = 0, maior real = 0, depois = 0
       - `codigo_fornecedores`: antes = 0, maior real = 0, depois = 0
       - `codigo_condicoes_pagamento`: antes = 1, maior real = 5, depois = 5 (alinhado com as 5 condições pré-existentes para não colidir com unicidade do 9.2)
       - `codigo_empresas`: antes = 1, maior real = 1, depois = 1 (empresa matriz HH código 1)
   - Contadores do assinante `TESTE B` mantidos estritamente intocados.

2. **Validação e Teste de Numeração Independente por Assinante:**
   - **Assinante TESTE B (`l6vfd1p688j2y9a`):** Criação de produto sem código informado. O backend gerou automaticamente o código **1** via contador sequencial do TESTE B (independente da HOSPITAL HOME). Produto mantido no banco para continuidade dos testes da Etapa 9.
   - **HOSPITAL HOME (`wqxiw7olvkup3sm`):** Criação de produto sem código informado. O backend gerou automaticamente o código **1** (seguindo a sequência da HH com contador inicial 0). Em seguida, o produto de teste da HOSPITAL HOME foi excluído e o contador `codigo_produtos` da HH foi mantido em 0 (sem produtos cadastrados).
   - Testes executados no backend sem deixar arquivos de teste em `pocketbase/migrations/` ou `pocketbase/hooks/` (Regra de Ouro nº 10).

3. **Conclusão Integral do Prompt 9.5 (Numeração no Backend):**
   - Coleção `sequencias` documentada com todos os seus campos e índices na seção "Tabelas" do `PROJETO_ERP.md`.
   - Módulos `numeracao_lib.js` e `numeracao_cadastros.js` operando com `require` interno nos callbacks, cumprindo a regra permanente de escopo da JSVM goja do PocketBase.

---

**Versão 0.0.132** — Etapa 9 Multi-tenant (Prompt 9.5c: Numeração de Cadastros no Backend por Assinante):

1. **Numeração Atômica de Cadastros por Assinante (`numeracao_cadastros.js`):**
   - Implementado hook no servidor (`pocketbase/hooks/numeracao_cadastros.js`) acionado em `onRecordCreate` para os 5 cadastros com numeração no escopo do assinante: `produtos`, `clientes`, `fornecedores`, `condicoes_pagamento` e `empresas`.
   - Se o campo `codigo` não for informado (`codigo <= 0`), o backend aloca automaticamente o próximo número atômico via `proximoNumero(assinanteId, null, 'codigo_' + colecao, txApp)` da `numeracao_lib.js`.
   - Se o operador preencher manualmente o código na tela, o valor é respeitado e mantido (não sobrescreve).

2. **Regra Permanente de Escopo JSVM:**
   - Funções auxiliares nunca são declaradas no topo dos arquivos de hooks (evitando o erro `Hook scoping error` da goja). Todo módulo auxiliar é carregado via `require` dentro do corpo de cada callback.

3. **Frontend com Indicativo Visual:**
   - Formulários de cadastro (`ProdutoForm`, `ClienteForm`, `FornecedorForm`, `CondicoesPagamentoPage`, `EmpresaForm`) atualizados para exibir "Será gerado ao salvar" como placeholder ou campo desabilitado quando em modo de criação, delegando a geração ao backend.

---

**Versão 0.0.130** — Etapa 9 Multi-tenant (Prompt 9.5b2: Fechamento do 9.5b, Limpeza de Testes, Ajuste de Sequências e Regra de Testes):

1. **Remoção Definitiva de Arquivos de Teste Residuais:**
   - Excluídos do repositório:
     - `pocketbase/migrations/0078_testes_numeracao_95b.js`
     - `pocketbase/hooks/testes_numeracao.js`
   - Diretórios `pocketbase/migrations/` e `pocketbase/hooks/` auditados e confirmados 100% limpos, contendo unicamente migrations válidas e hooks oficiais.
   - Estabelecida a **Regra de Ouro nº 10** permanente: testes de backend rodam via requisições contra o backend vivo, sem deixar arquivos de teste no repositório.

2. **Ajuste Idempotente de Contadores da Coleção `sequencias` (Migration 0078):**
   - Corrigidos os contadores da `HOSPITAL HOME` (`wqxiw7olvkup3sm`), que haviam sido incrementados em testes anteriores (`vendas` = 2 e `pedidos_compra` = 101), realinhando-os para o maior número que REALMENTE existe no banco naquela empresa e tipo (0 na ausência de registros reais).
   - Contadores do assinante `TESTE B` mantidos estritamente intocados.
   - Auditoria ANTES e DEPOIS no banco vivo:
     - ANTES: `vendas` = 2, `pedidos_compra` = 101.
     - DEPOIS: `vendas` = 0, `pedidos_compra` = 0.

3. **Deploy do Backend e QA Verde:**
   - Deploy aceito com sucesso pela plataforma Skip Cloud (`deploy_backend`), sem nenhum erro de módulo inválido ou rejeição nos logs.
   - QA completo (lint, TypeScript e build) executado com 100% de sucesso.

---

**Versão 0.0.129** — Etapa 9 Multi-tenant (Prompt 9.5b: Numeração de Movimentos no Backend com Sequências Atômicas):

1. **Arquitetura de Numeração Atômica no Backend (`numeracao_lib.js`):**
   - Criação da biblioteca `pocketbase/hooks/numeracao_lib.js`, que exporta a função auxiliar `proximoNumero(assinanteId, empresaId, tipo, txApp)`.
   - **Regra de Escopo do PocketBase JSVM (goja):** NUNCA declarar funções auxiliares no topo dos arquivos de hooks, pois a JSVM não enxerga funções top-level dentro de callbacks ("Hook scoping error"). Em vez disso, funções auxiliares são mantidas em biblioteca dedicada e carregadas com `require(`${\_\_hooks}/numeracao_lib.js`)` no corpo interno de cada callback.
   - Execução atômica dentro de transação `$app.runInTransaction` com bloqueio e incremento em `sequencias`.
   - **Seed Automático:** Caso a sequência ainda não exista na coleção `sequencias`, busca o maior número já existente no banco para aquela empresa e tipo e inicia a partir de `maior + 1`.

2. **Hooks de Movimentação por Empresa (`numeracao_movimentos.js`):**
   - Implementação de listeners `onRecordCreate` para os 4 tipos de movimentos que recebem numeração sequencial por empresa:
     1. `vendas`: gera número sequencial automático por empresa emitente se `numero <= 0`.
     2. `inventarios`: gera número sequencial automático por empresa se `numero <= 0`.
     3. `pedidos_compra`: gera número sequencial automático por empresa se `numero <= 0`.
     4. `transferencias`: gera número sequencial automático pela `empresa_origem_id` se `numero <= 0`.

3. **Frontend Desacoplado da Numeração Prévia:**
   - Telas de cadastro/criação de vendas, inventários, pedidos de compra e transferências deixam de tentar adivinhar ou reservar números previamente no frontend (eliminando chamadas cliente-side `obterProximoNumero*`).
   - Telas exibem o indicativo amigável "Será gerado ao salvar", delegando a integridade numérica integralmente ao backend.

4. **Coleção `sequencias` (Migration 0074/0077):**
   - Tabela no banco de dados com índice único `CREATE UNIQUE INDEX idx_sequencias_chave ON sequencias (assinante_id, empresa_id, tipo)`.
   - Todas as regras de API desabilitadas para o navegador (`null`), acessível unicamente pelos hooks do PocketBase.

---

**Versão 0.0.126** — Etapa 9 Multi-tenant (Prompt 9.4 + 9.4b + 9.4c: Proteção Integral por Tenancy em Coleções com Empresa e Todos os Hooks):

1. **Prompt 9.4 (Regras de Acesso nas Coleções com `empresa_id` - Migration 0075):**
   - Criação do campo `auth_user_id` na coleção `usuarios_empresas` com backfill automático para joins diretos e rápidos nas API Rules.
   - Aplicação de regras de isolamento em todas as coleções de movimentação e operacionais vinculadas a `empresa_id`:
     - Regra base: `@request.auth.id != '' && empresa_id.assinante_id = @request.auth.assinante_id && (@request.auth.tipo = 'master' || @request.auth.is_admin = true || (@collection.usuarios_empresas.empresa_id ?= empresa_id && @collection.usuarios_empresas.auth_user_id ?= @request.auth.id && @collection.usuarios_empresas.ativo = true))`.
     - Coleções com empresa direta: `estoque_saldos`, `estoque_movimentos`, `lotes`, `contas_financeiras`, `contas_pagar`, `contas_receber`, `pagamentos_lotes`, `pagamentos_baixas`, `movimentacoes_financeiras`, `extratos_linhas`, `caixa_sessoes`, `caixa_sessoes_movimentos`, `documentos_fiscais`, `inutilizacoes`, `sped_arquivos`, `sped_ajustes_apuracao`, `vendas`, `pdv_terminais`, `vales_troca`, `inventarios`, `pedidos_compra`, `notas_entrada`, configurações por empresa (`config_fiscal_empresa`, `config_financeira_empresa`, `config_vendas_empresa`, `config_emissao_fiscal`, `config_sped_empresa`) e `logs_auditoria`.
     - Coleções filhas protegidas pelo pai (`pai.empresa_id.assinante_id = @request.auth.assinante_id`): `pedidos_compra_itens`, `notas_entrada_itens`, `notas_entrada_parcelas`, `vendas_itens`, `vendas_pagamentos`, `documentos_fiscais_itens`, `documentos_fiscais_cartas`, `inventarios_itens`.
     - Transferências entre empresas: protegidas avaliando `empresa_origem_id` OU `empresa_destino_id` (`transferencias` e `transferencias_itens`).

2. **Prompt 9.4b (Correção e Compatibilização dos Hooks com PocketBase v0.23+):**
   - Adequação completa dos 7 hooks de movimentação para uso de `c.requestInfo().body` e `c.auth || c.get('authRecord')`, integrando com `exigirEmpresaDoUsuario`: `estoque_movimentar.js`, `estoque_estornar.js`, `nota_entrada_lancar.js`, `nota_entrada_cancelar.js`, `financeiro_pagar_baixar.js`, `financeiro_pagar_estornar.js`, `financeiro_gerar_retroativos.js`.

3. **Prompt 9.4c (Deploy do Backend, Testes de Isolamento e Validação da Plataforma):**
   - Deploy do backend executado no Skip Cloud (`deploy_backend`) com sucesso total para todos os 16 hooks protegidos com `exigirEmpresaDoUsuario` e 34 funções ativas.
   - Logs de hooks do PocketBase verificados e limpos (`list_logs` stream `hooks`), sem erros de compilação ou rejeição.
   - **Bateria de Testes de Isolamento Multi-tenant (Migration 0076):**
     - Usuário do assinante TESTE B (`admin@testeb.com`, assinante `l6vfd1p688j2y9a`):
       - Leituras em `vendas`, `estoque_saldos`, `contas_pagar`, `documentos_fiscais` e `sped_arquivos` com filtro na empresa da HOSPITAL HOME retornam 0 registros (isolamento total garantido pelas API rules da Migration 0075).
       - Chamadas aos endpoints protegidos (`/backend/v1/relatorios/painel-grupo`, `/backend/v1/vendas/finalizar` e `/backend/v1/fiscal/exportar-xmls`) informando empresa da HOSPITAL HOME retornam **HTTP 403 Forbidden** imediato via `exigirEmpresaDoUsuario`.
     - Usuário Master (`marceloslepre@gmail.com`, HOSPITAL HOME `wqxiw7olvkup3sm`):
       - Acesso operacional mantido com sucesso nas 3 empresas ativas da HOSPITAL HOME (`/backend/v1/empresas/acessiveis`).
       - Consolidação do `/backend/v1/relatorios/painel-grupo` e `/backend/v1/tenancy/me` executando normalmente (`is_master: true`, assinante `HOSPITAL HOME`).
     - Nenhum dado de teste residual foi mantido no banco de dados.

---

**Versão 0.0.125** — Etapa 9 Multi-tenant (Prompt 9.4b: Correção e Compatibilização dos 7 Hooks de Movimentação com PocketBase v0.23+):

1. **Correção de API e Compatibilização com PocketBase v0.23+ nos 7 Hooks do Backend:**
   - Substituído qualquer uso da API legada/inexistente `$apis.requestInfo(c)` por `c.requestInfo().body` em todos os 7 hooks identificados no escopo estrito:
     1. `pocketbase/hooks/estoque_movimentar.js` (`POST /estoque/movimentar`): movimentação de estoque com entrada, saída, balanço e validação multi-tenant.
     2. `pocketbase/hooks/estoque_estornar.js` (`POST /estoque/estornar`): estorno de movimentação de estoque com validação multi-tenant.
     3. `pocketbase/hooks/nota_entrada_lancar.js` (`POST /notas-entrada/lancar`): lançamento e conferência de notas fiscais de entrada e integração com estoque/financeiro.
     4. `pocketbase/hooks/nota_entrada_cancelar.js` (`POST /notas-entrada/cancelar`): cancelamento de notas fiscais de entrada lançadas e estorno automático.
     5. `pocketbase/hooks/financeiro_pagar_baixar.js` (`POST /financeiro/pagar/baixar`): baixa simples e em lote de títulos a pagar, com movimentação bancária e baixa de parcelas.
     6. `pocketbase/hooks/financeiro_pagar_estornar.js` (`POST /financeiro/pagar/estornar-baixa`): estorno de baixa de contas a pagar e reversão financeira.
     7. `pocketbase/hooks/financeiro_gerar_retroativos.js` (`POST /financeiro/pagar/gerar-titulos-retroativos`): geração em lote de títulos a pagar retroativos para notas fiscais de entrada.
   - Resolução do usuário autenticado atualizada para `c.auth || c.get('authRecord')`, integrando perfeitamente com a checagem `exigirEmpresaDoUsuario(authRecord, empresaId)` do módulo `pocketbase/hooks/tenancy.js`.
   - Rotas, caminhos, nomes, respostas e regras de negócio rigorosamente preservadas sem alterações.

2. **Deploy dos Hooks e Validação da Plataforma:**
   - Deploy executado no backend Skip Cloud (PocketBase) com **sucesso total** (`deploy_backend`).
   - Todos os 7 hooks foram aceitos e compilados sem erros na plataforma (confirmado via logs do backend).

3. **Validação e Testes Práticos de Funcionamento e Isolamento Tenancy:**
   - **Usuário Master (`marceloslepre@gmail.com`):**
     - Estoque: executada com sucesso a movimentação de entrada (`/estoque/movimentar`) e o estorno imediato (`/estoque/estornar`), com atualização correta de saldos e kardex.
     - Financeiro: executada com sucesso a baixa de título de contas a pagar (`/financeiro/pagar/baixar`) e o estorno da baixa (`/financeiro/pagar/estornar-baixa`), com atualização correta de saldo do título e movimentações financeiras.
     - Limpeza: todos os registros de teste foram removidos da base no encerramento.
   - **Assinante TESTE B (`admin@testeb.com`, assinante id `l6vfd1p688j2y9a`):**
     - Tentativa de chamada de movimentação de estoque (`/estoque/movimentar`) informando empresa pertencente à `HOSPITAL HOME` (`jy1d6k2u5j66h1o`).
     - **Resultado:** Rejeição imediata com código **403 Forbidden** (`exigirEmpresaDoUsuario`: empresa não pertence ao assinante do usuário autenticado).

---

**Versão 0.0.123** — Etapa 9 Multi-tenant (Prompt 9.3: Regras de Acesso no Banco, Coleções com assinante_id, Coleções Filhas, users e Tabelas Globais):

1. **Regras de Acesso (API Rules) nas 18 Coleções com `assinante_id` (Migration 0068):**
   - **Empresas, Usuários e Perfis de Acesso (`empresas`, `usuarios`, `perfis_acesso`):**
     - Leitura (`listRule` / `viewRule`): restrita a usuários logados do mesmo assinante (`assinante_id = @request.auth.assinante_id`).
     - Criação (`createRule`) e Exclusão (`deleteRule`): restritas ao administrador do assinante (`@request.auth.tipo = 'master' || @request.auth.is_admin = true`) dentro do seu próprio assinante (`assinante_id = @request.auth.assinante_id`).
     - Edição (`updateRule`): restrita ao administrador do assinante, com bloqueio estrito para alteração do campo `assinante_id` (`@request.body.assinante_id:isset = false`).
   - **Vínculos de Usuários e Empresas (`usuarios_empresas`):**
     - Regras de list, view, create, update e delete validando que tanto o usuário quanto a empresa vinculados pertençam ao mesmo assinante do chamador (`usuario_id.assinante_id = @request.auth.assinante_id && empresa_id.assinante_id = @request.auth.assinante_id`), com permissão de escrita restrita aos administradores.
   - **15 Coleções Compartilhadas de Cadastros e Configurações:**
     - Coleções: `produtos`, `clientes`, `fornecedores`, `marcas`, `grupos`, `categorias`, `condicoes_pagamento`, `plano_contas`, `centros_custo`, `formas_pagamento`, `perfis_tributarios`, `regras_fiscais_ncm`, `configuracoes`, `relatorios_filtros_salvos` e `relatorios_salvos`.
     - Regras de acesso exigindo `@request.auth.id != '' && assinante_id = @request.auth.assinante_id`.
     - `updateRule` com `@request.body.assinante_id:isset = false`, garantindo a imutabilidade do assinante.
     - Em `relatorios_filtros_salvos` e `relatorios_salvos`, preservadas as regras de privacidade do usuário autor (`usuario_id = @request.auth.id || compartilhado = true`).

2. **Coleções Filhas Segregadas pelo Registro Pai (PocketBase Join Resolution):**
   - Regras configuradas para resolver o `assinante_id` a partir do registro pai:
     - `produtos_kit_itens`: `produto_kit_id.assinante_id = @request.auth.assinante_id`
     - `produtos_fornecedores`: `produto_id.assinante_id = @request.auth.assinante_id`
     - `produtos_conversoes_unidade`: `produto_id.assinante_id = @request.auth.assinante_id`
     - `produtos_historico`: `produto_id.assinante_id = @request.auth.assinante_id`
     - `formas_pagamento_taxas`: `forma_pagamento_id.assinante_id = @request.auth.assinante_id`
     - `perfis_tributarios_regras`: `perfil_id.assinante_id = @request.auth.assinante_id`
     - `permissoes`: `perfil_id.assinante_id = @request.auth.assinante_id` (com escrita restrita a admins)

3. **Tabelas Globais do ERP (Regras de Segurança):**
   - Coleções: `ncm`, `cest`, `cfop`, `cfop_conversao_entrada`, `icms_aliquotas_uf`, `icms_interestadual`, `tabelas_fiscais_codigos`, `unidades_medida`, `intermediadores`.
   - `listRule` e `viewRule`: `@request.auth.id != ''` (leitura permitida para qualquer usuário autenticado de qualquer assinante).
   - `createRule`, `updateRule` e `deleteRule`: `@request.auth.id != '' && @request.auth.tipo = 'master'` (criação, edição e exclusão restritas unicamente ao usuário master da plataforma SaaS).

4. **Autenticação e Coleção `users` (`_pb_users_auth_`):**
   - `listRule` e `viewRule`: `id = @request.auth.id` (cada usuário logado só enxerga o seu próprio registro auth).
   - `updateRule`: `@request.auth.id = id && @request.body.tipo:isset = false && @request.body.assinante_id:isset = false && @request.body.is_admin:isset = false && (@request.auth.tipo != 'master' || @request.body.email:isset = false || @request.body.email = email)`.
   - Proteção adicional no hook `pocketbase/hooks/cadastros_compartilhados_tenancy.js` impedindo alteração de `tipo`, `assinante_id` e `is_admin` via requisições HTTP do cliente.

5. **Proteção e Isolamento dos Endpoints de Usuários (`/backend/v1/usuarios-admin/*`):**
   - Endpoint `/backend/v1/usuarios-admin/criar` atualizado em `pocketbase/hooks/usuario_criar.js`:
     - Identifica o assinante do chamador e grava `assinante_id` no `usuarios` e no `_pb_users_auth_`.
     - Valida que `perfil_id`, `empresa_padrao_id` e `empresas_ids` pertençam estritamente ao mesmo assinante do chamador, rejeitando qualquer tentativa com 403 Forbidden.
   - Endpoint `/backend/v1/usuarios-admin/redefinir-senha` atualizado em `pocketbase/hooks/usuario_redefinir_senha.js`:
     - Bloqueia expressamente qualquer tentativa de redefinir senha de usuário pertencente a outro assinante com erro 403 claro.
   - Hook `pocketbase/hooks/usuario_bloquear_login.js`:
     - Bloqueio imediato do login do usuário em caso de inativação mantido e compatibilizado.

6. **Validação Prática com Assinante 'TESTE B' (Migrations 0069 e 0070):**
   - Criado e mantido no banco vivo o assinante `TESTE B` (licença única `TB-*`, status `Ativa`).
   - Criada empresa Matriz (`TESTE B COMERCIO E SERVICOS LTDA`, código 1001, CNPJ 11.222.333/0001-99).
   - Criado perfil de Administrador exclusivo do `TESTE B` com permissões em todos os módulos.
   - Criado usuário administrador (`admin@testeb.com`, `is_admin = true`, vinculado à matriz do TESTE B).
   - Criado produto de teste pertencente exclusivamente ao `TESTE B` (`PRODUTO EXCLUSIVO TESTE B`, código 9001).
   - **Resultado do Teste de Isolamento:**
     - Consultas como usuário/escopo do `TESTE B` retornam estritamente registros do `TESTE B` e zero registros da `HOSPITAL HOME`.
     - Consultas como usuário da `HOSPITAL HOME` retornam estritamente registros da `HOSPITAL HOME` e zero registros do `TESTE B`.
     - Assinante e dados de teste B mantidos íntegros no banco de dados para os próximos testes da etapa 9.

---

**Versão 0.0.122** — Etapa 9 Multi-tenant (Prompt 9.2b: Conferência no Banco Vivo, Testes de CRUD com Master e Documentação Oficial do 9.2):

1. **Conferência Completa no Banco Vivo (PocketBase):**
   - Executada a conferência sistemática de registros em todas as 18 coleções (as 15 coleções de cadastros compartilhados mais as 3 coleções de base: `empresas`, `usuarios` e `perfis_acesso`).
   - Todos os registros existentes estão 100% vinculados ao assinante `HOSPITAL HOME` (`id: wqxiw7olvkup3sm`, licença `HH-RFR8HF`), com zero registros órfãos ou sem `assinante_id` e zero registros com assinante divergente.
   - Aplicada a Migration 0071 de forma estritamente idempotente garantindo a integridade dos vínculos no banco.

2. **Testes de Gravação, Leitura e Exclusão com Usuário Master (`marceloslepre@gmail.com`):**
   - Criação, edição e exclusão de registros de teste em:
     - `marcas`: criada com `TESTE 9.2B MARCA`, editada com sucesso, nascendo com `assinante_id = wqxiw7olvkup3sm` mantido imutável na edição, e excluída.
     - `clientes`: criado com `TESTE 9.2B CLIENTE`, editado com sucesso, nascendo com `assinante_id = wqxiw7olvkup3sm` mantido imutável na edição, e excluído.
     - `formas_pagamento`: criada com `TESTE 9.2B FORMA`, editada com sucesso, nascendo com `assinante_id = wqxiw7olvkup3sm` mantido imutável na edição, e excluída.
     - `produtos`: criado com `TESTE 9.2B PRODUTO SABONETE` (vinculado à marca de teste), editado com sucesso, nascendo com `assinante_id = wqxiw7olvkup3sm` mantido imutável na edição, e excluído.
   - **Busca de produtos do PDV:** Confirmado que o serviço de busca e leitura do catálogo do PDV (`carregarCatalogoProdutosPDV` / `interpretarEntradaPDV`) localizou e retornou com sucesso o produto ativo cadastrado.
   - **Logs do backend:** Conferência dos logs do backend (`list_logs`), sem erros registrados nos testes de CRUD e busca.
   - Todos os registros de teste foram devidamente removidos da base de dados no término do teste.

---

**Versão 0.0.121** — Etapa 9 Multi-tenant (Prompt 9.2: Cadastros Compartilhados, Hooks de Tenancy e useAssinanteId):

1. **Adição do Campo `assinante_id` nas 15 Coleções de Cadastros Compartilhados:**
   - Adicionado o campo `assinante_id` (relação obrigatória com a coleção `assinantes`) nas 15 coleções compartilhadas: `produtos`, `clientes`, `fornecedores`, `marcas`, `grupos`, `categorias`, `condicoes_pagamento`, `plano_contas`, `centros_custo`, `formas_pagamento`, `perfis_tributarios`, `regras_fiscais_ncm`, `configuracoes`, `relatorios_filtros_salvos` e `relatorios_salvos`.
   - Backfill idempotente executado vinculando todos os registros existentes ao assinante de origem `HOSPITAL HOME` (`id: wqxiw7olvkup3sm`, licença `HH-RFR8HF`).
   - Somado às 3 coleções de base migradas no 9.1 (`empresas`, `usuarios`, `perfis_acesso`), totalizam 18 coleções com tenancy corporativo direto por `assinante_id`.

2. **Coleções Filhas Protegidas pelo Registro Pai:**
   - As seguintes coleções filhas não possuem campo `assinante_id` direto, sendo segregadas e protegidas automaticamente pela relação mandatória com seu registro pai (que possui `assinante_id`):
     - `produtos_kit_itens` (protegida por `produto_kit_id` e `produto_item_id` em `produtos`).
     - `produtos_fornecedores` (protegida por `produto_id` em `produtos` e `fornecedor_id` em `fornecedores`, com hook validando mesmo assinante).
     - `produtos_conversoes_unidade` (protegida por `produto_id` em `produtos`).
     - `produtos_historico` (protegida por `produto_id` em `produtos`).
     - `formas_pagamento_taxas` (protegida por `forma_pagamento_id` em `formas_pagamento`).
     - `perfis_tributarios_regras` (protegida por `perfil_id` em `perfis_tributarios`).
     - `permissoes` (protegida por `perfil_id` em `perfis_acesso`).

3. **Hook do Backend `pocketbase/hooks/cadastros_compartilhados_tenancy.js`:**
   - **Preenchimento automático pelo backend (`onRecordCreate`):** O backend identifica o usuário autenticado no token JWT, busca seu registro na coleção `usuarios` e preenche `record.set('assinante_id', assinanteId)`. Se a requisição não tiver auth (processo interno/migration), aplica fallback seguro para o assinante `HOSPITAL HOME`.
   - **Recusa de valor divergente:** Se a requisição enviar explicitamente um `assinante_id` diferente do assinante do usuário autenticado, a operação é sumariamente rejeitada com erro 400 (`BadRequestError`).
   - **Imutabilidade na edição (`onRecordUpdate`):** O hook recupera o valor original gravado via `record.original().getString('assinante_id')` e restaura no registro (`record.set('assinante_id', origAssinante)`), impedindo que qualquer usuário ou tela altere o assinante de um registro existente.

4. **Validações de Relações Cruzadas no Mesmo Assinante:**
   - Hooks de create/update impedem que um registro aponte para relacionamentos pertencentes a outro assinante:
     - `produtos`: valida se `marca_id`, `grupo_id`, `categoria_id`, `fornecedor_principal_id` e `perfil_tributario_id` pertencem ao mesmo `assinante_id`.
     - `clientes`: valida se `condicao_pagamento_id` pertence ao mesmo `assinante_id`.
     - `fornecedores`: valida se `condicao_pagamento_id` pertence ao mesmo `assinante_id`.
     - `formas_pagamento`: valida se a empresa da `conta_financeira_padrao_id` pertence ao mesmo `assinante_id`.
     - `vendas`: valida se o cliente e a condição de pagamento pertencem ao mesmo `assinante_id` da empresa emitente.
     - `produtos_fornecedores`: valida se o produto e o fornecedor vinculados pertencem estritamente ao mesmo `assinante_id`.
     - `config_financeira_empresa`: valida se as contas contábeis de `plano_contas` e o `centro_custo_padrao_id` pertencem ao mesmo assinante da empresa.

5. **Índices Únicos por Assinante (Escopo de Tenancy):**
   - Índices combinando o `assinante_id` criados no SQLite para permitir unicidade apenas dentro do mesmo assinante:
     - `marcas`: `CREATE UNIQUE INDEX idx_marcas_assinante_nome ON marcas (assinante_id, nome)`
     - `grupos`: `CREATE UNIQUE INDEX idx_grupos_assinante_codigo ON grupos (assinante_id, codigo)` e `idx_grupos_assinante_nome ON grupos (assinante_id, nome)`
     - `categorias`: `CREATE UNIQUE INDEX idx_categorias_assinante_grupo_nome ON categorias (assinante_id, grupo_id, nome)`
     - `clientes`: `CREATE UNIQUE INDEX idx_clientes_assinante_codigo ON clientes (assinante_id, codigo)` e `idx_clientes_assinante_cpf_cnpj ON clientes (assinante_id, cpf_cnpj)`
     - `fornecedores`: `CREATE UNIQUE INDEX idx_fornecedores_assinante_codigo ON fornecedores (assinante_id, codigo)` e `idx_fornecedores_assinante_cpf_cnpj ON fornecedores (assinante_id, cpf_cnpj)`
     - `perfis_tributarios`: `CREATE UNIQUE INDEX idx_perfis_tributarios_assinante_nome ON perfis_tributarios (assinante_id, nome)`
     - `produtos`: `CREATE UNIQUE INDEX idx_produtos_assinante_codigo ON produtos (assinante_id, codigo)` e `idx_produtos_assinante_gtin ON produtos (assinante_id, gtin)`
     - `condicoes_pagamento`: `CREATE UNIQUE INDEX idx_condicoes_pagamento_assinante_nome ON condicoes_pagamento (assinante_id, nome)`
     - `plano_contas`: `CREATE UNIQUE INDEX idx_plano_contas_assinante_codigo ON plano_contas (assinante_id, codigo)`
     - `centros_custo`: `CREATE UNIQUE INDEX idx_centros_custo_assinante_codigo ON centros_custo (assinante_id, codigo)`
     - `perfis_acesso`: `CREATE UNIQUE INDEX idx_perfis_acesso_assinante_nome ON perfis_acesso (assinante_id, nome)`

6. **Frontend: Hook `useAssinanteId` (`src/hooks/useAssinanteId.ts`):**
   - Hook utilitário no frontend que extrai o `assinante_id` a partir da `empresaAtiva` do `EmpresaContext`.
   - Permite que formulários e componentes leiam o assinante ativo caso necessitem para diagnósticos ou filtros complementares de interface.

---

**Versão 0.0.119** — Etapa 9 Multi-tenant (Prompt 9.1: Conclusão da Base Multi-tenant, EmpresaContext e Documentação):

1. **Conexão de EmpresaContext ao Endpoint Multi-tenant (`src/contexts/EmpresaContext.tsx`):**
   - O hook `useEmpresaAtiva` e a função `recarregarEmpresas` agora consomem prioritariamente `listarEmpresasAcessiveis()` (`GET /backend/v1/empresas/acessiveis`), garantindo que administradores visualizem unicamente as empresas do seu próprio assinante.
   - Mantido fallback resiliente para `listarEmpresasAtivas()` com filtro em memória caso o endpoint encontre indisponibilidade momentânea, assegurando que `/painel` e todo o ERP continuem funcionando ininterruptamente.
2. **Ajuste de Escopo Multi-tenant nos Hooks de Relatórios (`relatorios_base.js` e `relatorio_painel_grupo.js`):**
   - Confirmado e reforçado o escopo de multi-tenant em `relatorios_base.js` e `relatorio_painel_grupo.js`, restringindo a listagem de empresas do administrador estritamente ao `assinante_id` do usuário solicitante.
3. **Base de Dados e Migrations 0061 e 0062 Aplicadas no Skip Cloud:**
   - Criada a coleção `assinantes` (número da licença único, nome, status, documento, limites e datas de vigência).
   - Inserido e vinculado o assinante de origem `HOSPITAL HOME` (licença única gerada, `origem = true`, status `Ativa`).
   - Adicionado o campo `assinante_id` nas coleções `empresas`, `usuarios` e `perfis_acesso`, com todos os registros existentes vinculados ao assinante `HOSPITAL HOME`.
   - Adicionado o campo `tipo` (`master` | `usuario`) na coleção `users`, configurado o master `marceloslepre@gmail.com` com `tipo = 'master'` e perfil de administrador, e bloqueada a alteração de `tipo` pelo navegador nas regras de segurança.
4. **Registro das Regras de Ouro e Documentação:**
   - Seção "Etapa 9 Multi-tenant" criada no `PROJETO_ERP.md` com as 9 regras de ouro, documentação da tabela `assinantes`, endpoints `/backend/v1/empresas/acessiveis` e `/backend/v1/tenancy/me`, funções de `tenancy.js` e registro da versão 0.0.119.

---

**Versão 0.0.118** — Etapa 9 Multi-tenant (Início do Prompt 9.1):

- Criação das migrations base 0061 e 0062 de multi-tenant no PocketBase.
- Implementação inicial do módulo `pocketbase/hooks/tenancy.js` e serviço `src/services/empresas.ts` (`listarEmpresasAcessiveis`).

---

**Versão 0.0.117** — Fechamento Oficial da Etapa 8 (Relatórios e Painel) e Conclusão do Roteiro Geral do ERP:

1. **Correção e Expansão do Tipo de Data de Entrada no Catálogo 8.0b (`FiltrosRelatorio` e `relatorios.ts`):**
   - Inclusão de `'entrada'` (Data de Entrada da Nota) nas opções válidas de `OpcaoTipoData` e no seletor de tipos de data de `FiltrosRelatorio.tsx`.
   - Ajuste nos aliases de filtros de produtos (`produtos_especificos`, `produtos_grupos`) em `ChaveFiltroDeclaravel` e `FiltrosRelatorio.tsx` para suporte completo nas telas legadas.
   - Atualização do endpoint de backend `relatorios_base.js` (`POST /backend/v1/relatorios/validar-filtros`) para reconhecer `'entrada'` como tipo de data válido e formatá-lo na linha legível de filtros (`"Por Data de Entrada"`).
   - Validação de que `/compras/itens-comprados` filtra estritamente pelo campo `data_entrada` das notas lançadas no backend e exibe a data de entrada dos itens.
   - Roteiro concluído atualizado para apontar a Etapa 8 na versão 0.0.117.

---

**Versão 0.0.115** — Etapa 8 (Relatórios e Painel) — Consolidação de Telas e Migration 0060:

1. **Filtros nas Telas Existentes com o Componente Comum 8.0b (`FiltrosRelatorio`):**
   - Integrado o componente unificado de filtros do 8.0b nas 7 telas consolidadas de vendas, estoque, compras e financeiro, preservando 100% de seus cálculos internos e regras de negócio:
     - `/vendas/consultas`: Período com atalhos, exportação CSV e critério da curva ABC.
     - `/vendas/comissoes`: Período com atalhos, vendedor e seletor da base de cálculo (emissão vs liquidação).
     - `/estoque/posicao`: Multiempresa, grupos, categorias, marcas, fornecedores e flags de saldo e abaixo do mínimo.
     - `/estoque/kardex`: Período com atalhos, tipo de data e seleção de produto.
     - `/compras/itens-comprados`: Período com atalhos, fornecedores, produtos, grupos de produto e CFOP de entrada.
     - `/financeiro/inadimplencia`: Multiempresa, seleção de clientes e busca de texto integrada.
     - `/financeiro/fluxo-caixa`: Período, contas financeiras selecionadas, agrupamento temporal e inclusão de vencidos.
2. **Revisão de Backend e Performance (Migration 0060):**
   - Criação de índices combinados de alta performance `empresa_id + data` nas tabelas centrais: `vendas`, `documentos_fiscais`, `estoque_movimentos`, `contas_pagar` e `contas_receber`.
   - Revisão integral dos hooks de relatórios com conferência rigorosa de período máximo de 366 dias, permissões por módulo e validação multiempresa no servidor.
3. **Consolidação Documental:**
   - Registro da seção "Etapa 8 concluída" e da seção "Roteiro concluído" (com o fechamento das 8 etapas do ERP) no `PROJETO_ERP.md`.

---

**Versão 0.0.114** — Etapa 8 Relatórios e Painel (Prompt 8.7: Relatório Personalizado - Parte 2: Estoque e Financeiro):

1. **Expansão do Endpoint Backend (`POST /backend/v1/relatorios/personalizado`):**
   - Atualizado em `pocketbase/hooks/relatorio_personalizado.js` no Skip Cloud (PocketBase).
   - Agora suporta 7 bases de dados estritas:
     1. `itens_vendidos`: Vendas finalizadas deduzindo devoluções (Prompt 8.6).
     2. `itens_comprados`: Notas de entrada lançadas com tributos e custos (Prompt 8.6).
     3. `estoque_data`: Estoque em uma data escolhida (`data_base` ou período). Reutiliza a lógica do 8.3 / estoque-gerencial: se `data_base >= hoje`, consulta `estoque_saldos`; se `data_base < hoje`, recupera `saldo_posterior` e `custo_medio_posterior` do último `estoque_movimentos` não estornado até a data. Agrupamentos: `empresa`, `grupo`, `categoria`, `marca`, `produto`, `fornecedor_produto`. Métricas: `quantidade`, `custo_medio`, `valor_estoque`, `percentual_total`.
     4. `estoque_movimentos`: Movimentações de estoque não estornadas (`estoque_movimentos`). Agrupamentos: `empresa`, `dia`, `semana`, `mes`, `ano`, `grupo`, `categoria`, `marca`, `produto`, `fornecedor_produto`, `origem`, `tipo`. Métricas: `quantidade`, `valor`.
     5. `contas_pagar`: Títulos de contas a pagar não cancelados (`contas_pagar`). Agrupamentos: `empresa`, `fornecedor`, `plano_contas`, `centro_custo`, `situacao`, `origem`, `mes_vencimento`, `faixa_atraso`. Métricas: `valor_original`, `valor_pago`, `saldo`, `quantidade_titulos`, `atraso_medio`.
     6. `contas_receber`: Títulos de contas a receber não cancelados (`contas_receber`). Agrupamentos: `empresa`, `cliente`, `plano_contas`, `centro_custo`, `situacao`, `origem`, `mes_vencimento`, `faixa_atraso`. Métricas: `valor_original`, `valor_recebido`, `saldo`, `quantidade_titulos`, `atraso_medio`.
     7. `movimentacoes_financeiras`: Movimentações bancárias e de caixa não estornadas (`movimentacoes_financeiras`). Agrupamentos: `empresa`, `dia`, `semana`, `mes`, `ano`, `conta_financeira`, `plano_contas`, `centro_custo`, `origem`, `tipo`. Métricas: `entradas`, `saidas`, `saldo_periodo`.
   - **Regras de Permissão por Módulo e Sigilo de Custos:**
     - Base `itens_comprados`: exige módulo `compras`.
     - Bases `estoque_data` e `estoque_movimentos`: exigem módulo `estoque`.
     - Base `contas_pagar`: exige módulo `financeiro_pagar`.
     - Base `contas_receber`: exige módulo `financeiro_receber`.
     - Base `movimentacoes_financeiras`: exige módulo `financeiro_receber` ou `financeiro_bancos`.
     - Valores e métricas de custo (`custo_medio`, `valor_estoque`, `valor`, `custo`, margens) são blindados para quem tem permissão no módulo `produtos` (`pode('produtos', 'ver')` ou admin). Sem a permissão, os valores retornam nulos.
   - **Filtros e Limites:**
     - Integração com catálogo 8.0b (produtos, fornecedores, clientes, datas por vencimento/emissão/pagamento/competência, planos de contas, centros de custo, contas financeiras).
     - Limite máximo estrito de 5.000 linhas com retorno de erro orientativo caso exceda.

2. **Tipagem e Serviços no Frontend (`src/services/relatorioPersonalizado.ts`):**
   - Types completos para todas as 7 bases, seus agrupamentos específicos e métricas permitidas.
   - Dicionários legíveis de agrupamentos e de métricas com formatação (moeda, número, percentual) e flags de sigilo.
   - Funções tipadas `consultarRelatorioPersonalizado`, `listarRelatoriosSalvos` e `salvarRelatorioPersonalizado`.

3. **Tela do Montador Atualizada (`src/pages/relatorios/RelatorioPersonalizadoPage.tsx`):**
   - Seletor de Base de Dados no Passo 1 com cards ilustrados e badges com ícone de cadeado para módulos sem permissão.
   - Atualização dinâmica e sincronizada dos agrupamentos disponíveis (Passo 2) e métricas (Passo 3) conforme a base selecionada.
   - Filtros contextuais no Passo 4 através do componente unificado `FiltrosRelatorio.tsx` adaptados para cada base (ex.: tipo de data emissão/vencimento/pagamento/competência em financeiro; contas financeiras em movimentações).
   - Tabela analítica com recuo hierárquico, subtotais destacados e linha de total geral consolidado.
   - Gráfico interativo (Barras ou Linhas) disponível quando o primeiro agrupamento for temporal ou tiver até 20 linhas.
   - Exportação completa para CSV formatado com metadados e impressão padronizada com cabeçalho formal do ERP.

---

**Versão 0.0.107** — Etapa 8 Relatórios e Painel (Prompt 8.0b: Catálogo Completo de Filtros, Formato Único, Motor Comum no Backend e Filtros Salvos):

1. **Catálogo Completo de Filtros nos Relatórios (`FiltrosRelatorio.tsx` e `MultiSelectFiltro.tsx`):**
   - Implementação dos filtros de Produto (grupos e categorias encadeadas, marcas, produtos com busca por código/descrição/barras, fornecedores do produto, situação ativo/inativo, só fiscal não revisado).
   - Filtros de Pessoas (clientes, fornecedores, vendedores, operadores de caixa e UFs).
   - Filtros de Vendas (tipos de venda PDV/Pedido/Orçamento, status da venda, formas de pagamento, terminais do PDV, intermediadores e documento fiscal).
   - Filtros Fiscais (modelos 55/65, situações da nota e UFs de destino).
   - Filtros Financeiros (plano de contas com seleção hierárquica automática sintética->analíticas, centros de custo, contas financeiras/bancos, situações de título e origens).
   - Filtros de Datas (seleção de emissão, vencimento, pagamento ou competência).
   - Todos com botões utilitários "Marcar todos" e "Desmarcar todos" e suporte à seleção múltipla reativa.
2. **Formato Único de Filtros e Motor Comum no Backend (`pocketbase/hooks/relatorios_base.js`):**
   - Padronização do contrato `ObjetoFiltrosRelatorio`.
   - Validação uniforme de empresas permitidas e limite máximo de 366 dias.
   - Aplicação consistente onde filtros de produto filtram itens e exibem aviso de recalque de totais.
   - Rota base `POST /backend/v1/relatorios/validar-filtros`.
3. **Cabeçalho Legível de Filtros para Tela, Impressão e CSV:**
   - Implementação de `formatarLinhaLegivelFiltros` e inclusão do parâmetro `linhaFiltros` em `gerarCsvRelatorio`.
   - Exibição de tarja e aviso de filtros aplicados na impressão e na visualização da tela.
4. **Filtros Salvos e Compartilhamento (`relatorios_filtros_salvos` - Migration 0058):**
   - Migration 0058 criando a coleção no PocketBase com regras restritas de acesso.
   - Componente `GerenciadorFiltrosSalvos.tsx` acoplado aos botões "Salvar estes filtros" e "Meus filtros" com suporte a compartilhamento para a equipe e exclusão exclusiva pelo proprietário.

---

**Versão 0.0.113** — Etapa 8 Relatórios e Painel (Prompt 8.6: Relatório Personalizado - Montador de Vendas e Compras):

1. **Endpoint Backend do Relatório Personalizado (`POST /backend/v1/relatorios/personalizado`):**
   - Implementado em `pocketbase/hooks/relatorio_personalizado.js` no Skip Cloud (PocketBase).
   - Validações estritas e segurança:
     - Autenticação mandatória e identificação do usuário logado.
     - Validação estrita da base: somente `itens_vendidos` ou `itens_comprados`.
     - Validação rigorosa dos agrupamentos: máximo de 3 níveis da lista permitida (bloqueio total de texto livre ou injeção SQL/NoSQL).
       - Vendas: empresa, dia, semana, mes, ano, grupo, categoria, marca, produto, fornecedor_produto, cliente, uf_cliente, cidade_cliente, vendedor, forma_pagamento, canal, terminal, cfop, ncm.
       - Compras: empresa, dia, semana, mes, ano, grupo, categoria, marca, produto, fornecedor_produto, fornecedor_nota, cfop_entrada, tipo_entrada, ncm.
     - Validação rigorosa dos valores/métricas da lista permitida:
       - Vendas: quantidade, valor_bruto, desconto, valor_liquido, custo, margem_valor, margem_percentual, quantidade_vendas, ticket_medio, preco_medio, percentual_total.
       - Compras: quantidade, valor_produtos, frete, ipi, icms_st, credito_icms, custo_total, quantidade_notas, preco_medio, percentual_total.
     - Validação de período máximo de 366 dias e vínculo multiempresa com `usuarios_empresas` (ou administrador).
     - **Regras de permissões por módulo:**
       - Base de compras restrita a usuários com permissão no módulo `compras` (`pode_ver` ou admin); retorna 403 em caso contrário.
       - Custos e margens no relatório de vendas blindados para usuários com permissão de ver `produtos` (`pode('produtos', 'ver')` ou admin); se o usuário não possuir essa permissão, custos e margens retornam nulos.
     - **Limite de Segurança:** Processa e agrega no servidor, limitando o resultado a no máximo 5.000 linhas. Se exceder, retorna aviso solicitando filtros mais específicos.
     - **Agrupamentos hierárquicos e subtotais:** Gera árvore de nós até 3 níveis e planifica com níveis 1, 2 e 3, identificando subtotais e gerando o total geral consolidado.
     - **Séries para Gráfico:** Devolve série agregada para o 1º nível de agrupamento quando este for temporal (dia, semana, mês, ano) ou possuir até 20 linhas.

2. **Tela Relatório Personalizado (`/relatorios/personalizado` - `src/pages/relatorios/RelatorioPersonalizadoPage.tsx`):**
   - Rota protegida por `PermissaoGuard modulo="relatorios" acao="ver"`.
   - **Montador de 4 Passos na mesma tela:**
     - **Passo 1 (Base de dados):** Seletor em cards de rádio entre "Itens vendidos" (vendas finalizadas descontando devoluções) e "Itens comprados" (notas lançadas com impostos e custos), com bloqueio e selo de exigência do módulo compras.
     - **Passo 2 (Agrupamentos):** Permite escolher até 3 níveis da lista permitida da base, com botões para subir e descer níveis (reordenação) e exclusão rápida.
     - **Passo 3 (Valores e Métricas):** Checkboxes organizados em grid, com marcação de sigilo para custos/margens se não tiver permissão de produtos.
     - **Passo 4 (Filtros):** Integrado ao catálogo completo de filtros do Prompt 8.0b via `FiltrosRelatorio.tsx`.
   - **Resultado em Tabela:**
     - Hierarquia visual com recuo para os níveis 2 e 3 e badges de "Subtotal" nas quebras de grupo.
     - Linha de "Total Geral Consolidado" com fundo contrastante.
     - Ordenação interativa ao clicar no cabeçalho de qualquer coluna (rótulo ou métrica).
   - **Gráfico Integrado (Recharts):**
     - Botões de alternância entre Barras, Linhas ou Ocultar, com seletor de métrica quando o primeiro agrupamento for temporal ou tiver até 20 linhas.
   - **Exportação CSV e Impressão:**
     - Botões no cabeçalho com metadados do relatório, base selecionada, níveis de agrupamento e linha legível de todos os filtros aplicados.
   - **Modal "Salvar este relatório":**
     - Permite salvar a configuração completa com nome, descrição e opção "Compartilhar com toda a empresa".

3. **Collection `relatorios_salvos` (Migration 0059):**
   - Criação da tabela `relatorios_salvos` no Skip Cloud para persistência dos relatórios personalizados com base, agrupamentos, valores, filtros, tipo de gráfico e flag de compartilhamento.
   - Regras de listagem e leitura pública entre o autor e registros compartilhados; criação e exclusão restritas ao proprietário.

4. **Central de Relatórios (`/relatorios` - `CentralRelatoriosPage.tsx`) e Menu:**
   - Adicionadas seções no topo da Central de Relatórios:
     - **Meus Relatórios Salvos:** listagem dos relatórios salvos pelo usuário logado com botão de exclusão e atalho direto de execução.
     - **Relatórios da Empresa:** relatórios compartilhados por outros colaboradores da empresa.
   - Adicionado botão "Novo Relatório Personalizado" na Central de Relatórios.
   - Adicionado item "Relatório Personalizado (Montador)" na categoria "Grupo" do catálogo de relatórios (`relatoriosCatalogo.ts`).
   - Adicionado subitem "Relatório Personalizado" no menu lateral `Sidebar.tsx` sob o grupo de "Relatórios".

---

**Versão 0.0.112** — Etapa 8 Relatórios e Painel (Prompt 8.5: Painel do Grupo Multiempresa):

1. **Endpoint Backend do Painel do Grupo (`POST /backend/v1/relatorios/painel-grupo`):**
   - Implementado em `pocketbase/hooks/relatorio_painel_grupo.js` no Skip Cloud (PocketBase).
   - Validações e multiempresa: autenticação obrigatória, identificação do usuário e conferência rigorosa de vínculo com empresas ativas (`usuarios_empresas` ou `perfis_acesso.administrador = true`).
   - Parâmetro no corpo da requisição: `mes_referencia` no formato `YYYY-MM` (padrão: mês corrente no fuso de Brasília).
   - Processamento de métricas para CADA empresa que o usuário acessa e para o TOTAL do grupo:
     - **Faturamento e comparativos:** Faturamento do mês de referência do dia 1 até o dia atual (ou último dia se mês passado), comparado com o mesmo intervalo de dias do mês anterior (dia 1 a dia N) e do mesmo mês do ano anterior (dia 1 a dia N), com variações percentuais.
     - **Margem bruta, vendas e ticket médio:** Vendas com `status = 'Finalizada'`, `ativo = true`, descarte de canceladas e abatimento de devoluções (`tipo = 'Devolução'`). Valor e percentual da margem bruta (`faturamento - CMV`), ticket médio e quantidade de vendas líquidas.
     - **Vendas para outros estados:** Percentual sobre o faturamento e apuração das Top 5 UFs de destino (reutilizando a regra oficial da Etapa 8: UF do cliente ou destinatario_uf da nota quando houver; balcão sem cliente = UF da empresa emitente).
     - **Estoque valorizado e parado:** Reutilização da regra do 8.3 / estoque-gerencial: saldo total valorizado atual por custo médio e valor de estoque parado há mais de 90 dias (sem movimentação de saída registrada ou última saída > 90 dias) e quantidade de itens parados.
     - **Contas a receber e a pagar (30 dias):** Reutilização da regra do 8.4 e do /painel: a receber e a pagar nos próximos 30 dias (`data_vencimento` entre hoje e hoje + 30 dias) e vencidos (`data_vencimento < hoje`).
     - **Saldo de contas financeiras:** Totalização dos saldos atuais das contas financeiras da empresa (`contas_financeiras.saldo_atual`).
     - **Alertas fiscais e SPED:** Contagem de documentos fiscais com pendência (status Rejeitada e Processando) e diagnóstico da situação do SPED Fiscal do mês anterior para empresas obrigadas (não gerado, gerado com erros, gerado, entregue, não se aplica).
     - **Séries para gráficos no servidor:** Série de faturamento diário do mês por empresa (dia 1 ao dia de corte) e evolução mensal histórica dos últimos 12 meses por empresa.

2. **Tela Painel do Grupo (`/painel-grupo` - `src/pages/relatorios/PainelGrupoPage.tsx`):**
   - Rota protegida por `PermissaoGuard modulo="relatorios" acao="ver"`.
   - Regra de visibilidade multiempresa: disponível e visível no menu apenas para usuários com permissão no módulo `relatorios` E acesso a mais de 1 empresa (`empresas.length > 1`). Se possuir acesso a apenas 1 empresa, exibe card explicativo e redirecionamento.
   - **Layout e Seções:**
     - **Topo executivo:** 4 cartões consolidados do GRUPO no topo com comparativos com períodos anteriores, margem bruta, vendas, ticket médio, financeiro (30 dias, saldo e vencidos), estoque valorizado e alertas fiscais, com links diretos para os relatórios analíticos (`/relatorios/vendas-canais`, `/relatorios/estoque-gerencial`, `/relatorios/contas-pagar`).
     - **Gráficos por empresa:** Gráfico de barras do faturamento diário do mês por empresa (empilhado por filial) e gráfico de linhas da evolução dos últimos 12 meses por empresa com legenda interativa.
     - **Destino interestadual:** Quadro com Top 5 UFs que mais compraram do grupo e percentual de vendas para outros estados.
     - **Linha de cartões por empresa:** Quadro loja a loja para cada filial acessível com seus respectivos indicadores (faturamento, comparativos vs mês/ano anterior, ticket, margem, estoque parado, financeiro 30 dias e badge do status do SPED).
   - **Sigilo de Custos:** Valores e percentuais de margem bruta e estoques restritos aos usuários com permissão no módulo `produtos` (`pode('produtos', 'ver')` ou `administrador`).

3. **Menu Lateral e Central de Relatórios:**
   - Adicionado item "Painel do Grupo" no `Sidebar.tsx` posicionado logo abaixo do item "Painel", visível condicionalmente para quem possui `pode('relatorios', 'ver')` e acesso a mais de 1 empresa.
   - Adicionado banner estilizado em destaque no topo da Central de Relatórios (`/relatorios` - `CentralRelatoriosPage.tsx`) acima dos grupos de relatórios.
   - Adicionado item "Painel do Grupo" na categoria "Grupo" em `src/config/relatoriosCatalogo.ts`.
   - A tela `/painel` e os endpoints existentes foram preservados rigorosamente intactos.

---

**Versão 0.0.111** — Etapa 8 Relatórios e Painel (Prompt 8.4: Financeiro Gerencial — Contas a Pagar por Vencimento e DRE Comparativa por Empresa/Meses):

1. **Endpoint Backend de Contas a Pagar por Vencimento (`POST /backend/v1/relatorios/contas-pagar`):**
   - Implementado em `pocketbase/hooks/relatorio_contas_pagar.js` no Skip Cloud (PocketBase).
   - Validações e multiempresa: autenticação obrigatória, validação rigorosa de acesso às empresas marcadas (`usuarios_empresas` ou admin), limite de período de até 366 dias, modo estritamente somente leitura.
   - Filtros do catálogo 8.0b aceitos: `empresas_ids`, `periodo` (`dataInicio`, `dataFim`), `tipo_data` (`vencimento`, `emissao` ou `competencia`), `fornecedores_ids`, `plano_contas_ids`, `centros_custo_ids` e `origens_titulo`.
   - Regras de corte e negócio: títulos de `contas_pagar` com `ativo = true`, `saldo > 0` e status "Em aberto" ou "Pago parcial".
   - Faixas de vencimento estruturadas (Aging) com base na data atual (horário de Brasília):
     1. Vencidas há mais de 30 dias (`diff < -30 dias`)
     2. Vencidas até 30 dias (`-30 <= diff < 0`)
     3. Vence hoje (`diff == 0`)
     4. Próximos 7 dias (`1 <= diff <= 7`)
     5. 8 a 30 dias (`8 <= diff <= 30`)
     6. 31 a 60 dias (`31 <= diff <= 60`)
     7. Acima de 60 dias (`diff > 60`)
   - Respostas agregadas no servidor:
     - Totais por faixa de vencimento (quantidade, saldo e percentual de participação).
     - Totais por fornecedor (quantidade, saldo vencido, vence hoje, a vencer, saldo total ordenado de forma decrescente).
     - Totais por conta do plano de contas (código, descrição, quantidade e saldo total ordenado pelo código contábil).
     - Relação analítica de títulos com fornecedor, documento, parcela, descrição, vencimento, situação/faixa, plano de contas, centro de custo, valores (original, pago, saldo), origem e link para a nota de entrada (`/compras/notas-entrada/:id/conferencia`) quando a origem for `NF Entrada` ou `NF_ENTRADA`.

2. **Tela Relatórios > Contas a Pagar por Vencimento (`/relatorios/contas-pagar` - `src/pages/relatorios/ContasPagarVencimentoPage.tsx`):**
   - Integrada ao componente unificado de filtros `FiltrosRelatorio.tsx` (8.0b).
   - Quadro de indicadores consolidados (Saldo total, Total vencido, Vence hoje e A vencer).
   - Cards clicáveis das 7 faixas de vencimento para filtragem imediata da lista analítica.
   - Abas: 1) Relação de Títulos (com busca textual e badges coloridos de vencimento); 2) Totais por Fornecedor; 3) Totais por Plano de Contas.
   - Permissão de acesso: governada pelo módulo `financeiro_pagar` (`pode('financeiro_pagar', 'ver')`).
   - Exportação completa para CSV nos padrões da Etapa 8 (BOM UTF-8, ponto e vírgula, vírgula decimal) contendo as 4 seções analíticas.

3. **DRE Comparativa (`/financeiro/dre` - `src/pages/financeiro/DrePage.tsx`):**
   - Reutilização estrita do motor e cálculo existente de `obterDreGerencial` (`src/services/dre.ts`) sem qualquer alteração na lógica contábil/financeira (mantendo regimes Competência e Caixa, e a opção "Custo das mercadorias pelo estoque").
   - Seletor de visualização com 3 modos sem alterar o comportamento do modo normal:
     1. **DRE Normal:** visão padrão detalhada com período atual vs. anterior e drill-down em dois níveis.
     2. **Comparar Empresas:** condicionado a usuários com acesso a mais de uma empresa (`empresas.length > 1`); exibe checkboxes para marcar as empresas desejadas, renderiza uma coluna por empresa marcada com valor e % vertical, coluna de Total Geral consolidado e % vertical consolidado.
     3. **Comparar Meses:** analisa os últimos 12 meses cronológicos lado a lado para a empresa selecionada (empresa ativa ou selecionada via seletor).
   - Exportação de CSV ajustada dinamicamente conforme o modo de visualização selecionado (CSV da DRE normal ou matriz comparativa das empresas/meses).
   - As telas `/financeiro/fluxo-caixa` e `/financeiro/inadimplencia` foram rigorosamente mantidas sem alteração.

4. **Central de Relatórios e Rotas:**
   - Adicionada rota `/relatorios/contas-pagar` em `src/App.tsx` com `PermissaoGuard modulo="financeiro_pagar" acao="ver"`.
   - Adicionado item "Contas a Pagar por Vencimento" no catálogo `src/config/relatoriosCatalogo.ts` na categoria "Financeiro" com o módulo `financeiro_pagar`.
   - Atualizada a descrição do card da DRE no catálogo para citar os novos modos: "DRE Normal, Comparar Empresas (com % vertical e total) e Comparar Meses (últimos 12m)".

---

**Versão 0.0.110** — Etapa 8 Relatórios e Painel (Prompt 8.3: Estoque Gerencial — Valorizado, Giro, Parados e Sugestão de Compra):

1. **Endpoint Backend de Estoque Gerencial (`POST /backend/v1/relatorios/estoque-gerencial`):**
   - Implementado em `pocketbase/hooks/relatorio_estoque_gerencial.js` no Skip Cloud (PocketBase).
   - Validações e multiempresa: autenticação obrigatória, conferência de vínculo do usuário com as empresas selecionadas (`usuarios_empresas` ou admin), limite de dias de análise até 366 dias.
   - Parâmetros aceitos: `empresas_ids`, `data_base` (padrão hoje), `dias_analise` (padrão 90), `dias_cobertura_alvo` (padrão 30) e `dias_parado` (padrão 90).
   - Universo avaliado: produtos com `ativo = true` e `controla_estoque = true`, aplicando estritamente os filtros de produto do padrão 8.0b (produtos, grupos, categorias, marcas, fornecedor padrão do produto, NCMs, situação e revisão fiscal).
   - Cálculos e métricas apurados no servidor:
     - **Saldo e valor na data_base:** se a data base for hoje ou futura, obtém diretamente de `estoque_saldos`; se for data passada, apura pelo `saldo_posterior` e `custo_medio_posterior` do último `estoque_movimentos` não estornado até aquela data (23:59:59).
     - **Saídas por venda:** total de saídas no período de análise a partir de `estoque_movimentos` com origem `VENDA` menos `DEVOLUCAO_VENDA`, e a média diária de venda (`quantidade / dias_analise`).
     - **Cobertura em dias:** `saldo / media_diaria` (para itens sem venda no período: descrição "sem giro" e cobertura nula).
     - **Giro no período:** `quantidade_vendida / saldo_medio` (saldo médio = `(saldo_inicio + saldo_fim) / 2`, com `saldo_inicio` obtido pelo saldo posterior do movimento anterior ao período de análise).
     - **Dias desde a última saída:** calculado a partir de `data_ultima_saida` em relação à data base.
     - **Sugestão de compra:** `(media_diaria * dias_cobertura_alvo) - saldo - em_pedido`, quando for maior que zero, ou quando o saldo estiver abaixo do `estoque_minimo` cadastrado no produto deduzindo pedidos de compra em aberto (`pedidos_compra` com status pendente).
     - **Último fornecedor e custo:** busca o último custo unitário de estoque da última nota de entrada com status "Lançada" (`notas_entrada_itens`), ou fornecedor padrão/preço de custo do cadastro.
     - **Critério de produtos parados:** produtos com saldo físico > 0, sem histórico de venda no período e sem saída há mais de `dias_parado` dias.
   - Resumo estruturado com totalizadores, produtos detalhados, agregações hierárquicas por Grupo/Categoria e por Marca, além de listas segregadas de parados e de sugestão.

2. **Tela Relatórios > Estoque Gerencial (`/relatorios/estoque-gerencial` - `src/pages/relatorios/EstoqueGerencialPage.tsx`):**
   - Utilização do componente `FiltrosRelatorio.tsx` com catálogo completo de filtros de produtos do Prompt 8.0b (incluindo fornecedor do produto).
   - Barra de parâmetros específicos: Data Base, Dias de Análise de Venda, Dias de Cobertura Alvo e Critério de Dias Parado.
   - Quatro abas gerenciais de alto valor:
     1. **Valorizado:** quadros consolidadores por Grupo/Categoria e por Marca (com saldo, valor e percentuais) e relação completa de produtos com quantidade, custo médio e valor total.
     2. **Giro e Cobertura:** lista ordenada pela cobertura em dias (menor cobertura primeiro, destacando risco de ruptura), com destaque em âmbar para cobertura acima de 180 dias e badge "sem giro" para itens sem venda.
     3. **Parados:** lista de produtos com estoque e sem movimentação de saída há mais de `dias_parado` dias, com valor parado e totalizador de capital estagnado.
     4. **Sugestão de compra:** produtos com recomendação de reposição, exibindo saldo atual, média diária, pedidos em aberto, sugestão calculada, último fornecedor e custo estimado, com botão exclusivo **"Exportar CSV p/ Fornecedor"**.
   - **Blindagem de sigilo de custos:** visualização de custos médios, últimos custos e valores monetários condicionada à permissão no módulo `produtos` (`pode('produtos', 'ver')` ou `pode('produtos', 'editar')`).
   - Permissão de acesso da tela: governada pelo módulo `estoque` (`pode('estoque', 'ver')`).
   - Exportação completa para CSV (BOM UTF-8, ponto e vírgula, vírgula decimal) e impressão formatada (`window.print()`).

3. **Catálogo de Relatórios, Rotas e Navegação:**
   - Adicionada rota `/relatorios/estoque-gerencial` em `src/App.tsx` protegida por `PermissaoGuard modulo="estoque" acao="ver"`.
   - Inclusão do item "Estoque Gerencial" no catálogo `src/config/relatoriosCatalogo.ts` no grupo Estoque com selo de novo e filtros de produto declarados.
   - A tela existente `/estoque/posicao` foi rigorosamente preservada sem nenhuma alteração.

---

**Versão 0.0.109** — Etapa 8 Relatórios e Painel (Prompt 8.2: Vendas por Loja e por Canal):

1. **Endpoint Backend de Alta Precisão (`POST /backend/v1/relatorios/vendas-canais`):**
   - Implementado em `pocketbase/hooks/relatorio_vendas_canais.js` no Skip Cloud (PocketBase).
   - Validações: autenticação obrigatória, limite de 366 dias por período, checagem estrita de permissões multiempresa (`usuarios_empresas` ou admin).
   - Coleta de vendas com `status = 'Finalizada'`, `ativo = true` e descarte de vendas canceladas, descontando devoluções do período (`tipo = 'Devolução'`).
   - Suporte aos filtros de produto, pessoas e vendas do padrão 8.0b: havendo filtro de produto, faturamentos, quantidades e custos computam exclusivamente os itens (`vendas_itens`) que atendem aos filtros do catálogo (produtos, grupos, categorias, marcas, fornecedores, NCMs, situação e revisão fiscal).
   - Três períodos processados em paralelo para comparação:
     1. Período atual solicitado.
     2. Período anterior de mesmo tamanho (exatamente `dias` antes da data inicial).
     3. Mesmo período do ano anterior (exatamente 1 ano antes: mesmo mês e dia).
   - Retornos estruturados do endpoint:
     - **Por empresa / loja:** Faturamento líquido, quantidade de vendas, ticket médio, custo total (CMV), margem bruta em valor (R$) e em percentual (%), desconto concedido e comparativos analíticos com o período anterior e ano anterior (com valor e percentual de variação).
     - **Consolidado geral:** Totalizador de todas as empresas marcadas com comparativos de variação.
     - **Por UF de destino (ordenado pelo faturamento):** Regra oficial do PROJETO_ERP: UF do cliente ou destinatario_uf da nota fiscal quando houver; venda de balcão sem cliente conta como UF da própria empresa emitente.
     - **Por canal de venda (ordenado pelo faturamento):** Balcão/PDV (`tipo = 'PDV'`), Pedido de Venda (`tipo = 'Pedido'`), Site Próprio (E-commerce) e Marketplaces por intermediador cadastrado (`intermediador_id` da nota).
     - **Por forma de pagamento (`vendas_pagamentos`):** Valor recebido, quantidade de transações e custo das taxas operacionais (`valor_taxa` / taxa percentual da forma), com percentual sobre o faturamento.
     - **Quadro de vendas por grupo e categoria:** Agrupamento hierárquico com itens vendidos, faturamento e percentual de participação.

2. **Tela Relatórios > Vendas por Loja e Canal (`/relatorios/vendas-canais` - `src/pages/relatorios/VendasCanaisPage.tsx`):**
   - Utilização do componente unificado `FiltrosRelatorio.tsx` com catálogo completo de filtros do Prompt 8.0b (produtos, pessoas e vendas).
   - Tarja de aviso padrão no cabeçalho quando houver filtro de produto ativo informando que os números refletem apenas os itens filtrados.
   - Quadro de resumo consolidado com comparativos de variação (`ArrowUpRight` em verde, `ArrowDownRight` em vermelho e traço neutro).
   - Abas organizadas: 1) Por Empresa / Loja; 2) Por Canal de Venda; 3) Por UF de Destino; 4) Formas de Pagamento e Taxas; 5) Grupos e Categorias.
   - Blindagem de margem bruta e CMV: os valores e percentuais de margem bruta só são exibidos para quem possui permissão no módulo de produtos (`pode('produtos', 'ver')` ou `pode('produtos', 'editar')`), idêntico à regra de consultas de vendas.
   - Exportação completa para CSV (BOM UTF-8, ponto e vírgula, vírgula decimal) e impressão formatada (`window.print()`).
   - Permissão de acesso da tela: governada pelo módulo `vendas` (`pode('vendas', 'ver')`).

3. **Catálogo de Relatórios e Rotas:**
   - Adicionada rota `/relatorios/vendas-canais` em `src/App.tsx` protegida por `PermissaoGuard modulo="vendas" acao="ver"`.
   - Adicionado item "Vendas por Loja e por Canal" em `src/config/relatoriosCatalogo.ts` na categoria "Vendas" com selo de novo e filtros permitidos declarados.
   - As consultas legadas de `/vendas/consultas` foram rigorosamente preservadas sem qualquer alteração.

---

**Versão 0.0.108** — Etapa 8 Relatórios e Painel (Prompt 8.1: Livro de Registro de Saídas e Resumo da Apuração do ICMS do Mês):

1. **Endpoint Backend de Alta Precisão Fiscal (`POST /backend/v1/relatorios/livro-saidas`):**
   - Implementado em `pocketbase/hooks/fiscal_relatorio_livro_saidas.js` agregando no servidor as regras tributárias da escrituração das saídas (limite 366 dias, filtro por empresa e verificação de permissão).
   - Coleta de `documentos_fiscais` com `tipo_documento = 1` (saída) com `data_emissao` no período no fuso horário de Brasília (UTC-3), com status Autorizada, Cancelada e Denegada, respeitando ambiente Produção/Homologação (`incluirTeste`).
   - Coleta e desdobramento das faixas da tabela `inutilizacoes` homologadas no período com `situacao = "inutilizada"`.
   - Regra fiscal estrita: documentos autorizados apresentam valores normais; documentos cancelados, denegados e inutilizados possuem valores contábeis e impostos rigorosamente zerados.
   - Três estruturas de dados retornadas pelo endpoint:
     1. Linhas por documento/inutilização: data, modelo, série, número, chave, destinatário (nome, CNPJ/CPF, UF), CFOP principal, valor contábil, base e valor do ICMS, base e valor do ICMS ST, IPI, DIFAL destino e situação.
     2. Resumo analítico por CFOP, CST/CSOSN e alíquota somando `documentos_fiscais_itens`: valor contábil, base ICMS, valor ICMS, base ICMS ST, valor ICMS ST, IPI, isentas ou não tributadas e outras.
     3. Resumo por UF de destino (focado nas operações interestaduais e internas) com quantidade de documentos, valor contábil, ICMS próprio e DIFAL destino (EC 87/2015).
     4. Totalizadores gerais consolidados para batimento contábil.

2. **Tela Fiscal > Livro de Saídas (`/fiscal/livro-saidas` - `src/pages/fiscal/LivroSaidasPage.tsx`):**
   - Padrão visual idêntico ao `/compras/livro-entradas`, com cartões de indicadores (Documentos/linhas, Valor Contábil, ICMS Débito, ST+IPI+DIFAL).
   - Filtro comum de período e gaveta com filtros fiscais do 8.0b: Modelo (55 / 65), CFOP, CST/CSOSN, Situação (normal, cancelada, denegada, inutilizada), UF de destino, Cliente (via componente `SelectCliente`) e switch para notas em homologação.
   - Três quadros completos na tela e na impressão: 1) Relação de Documentos e Inutilizações; 2) Resumo por CFOP, CST e Alíquota; 3) Resumo por UF de Destino.
   - Exportação para CSV completa nos padrões da Etapa 8 (BOM UTF-8, separador `;`, vírgula decimal, seções bem identificadas) e impressão formatada via CSS `@media print`.
   - Permissão de acesso governada pelo módulo `notas_saida` (`pode('notas_saida', 'ver')`).

3. **Tela Fiscal > Resumo do ICMS do Mês (`/fiscal/resumo-icms` - `src/pages/fiscal/ResumoIcmsPage.tsx`):**
   - Conferência gerencial mês a mês de Débitos (ICMS destacado no Livro de Saídas) versus Créditos (ICMS aproveitado no Livro de Entradas e transferências recebidas entre filiais).
   - Apuração do saldo do mês em destaque: a recolher ou saldo credor para o mês seguinte.
   - Aviso regulamentar mandatório: _"conferência gerencial; a apuração oficial é a do SPED"_.
   - Confronto automatizado com o arquivo do SPED Fiscal do mês (`sped_arquivos`): se existir, lê o Registro E110 oficial, confronta Débitos, Créditos e Valor a Recolher, indicando divergências ou batimentos conferidos com link direto para o Relatório do SPED.
   - Permissão de acesso governada pelo módulo `notas_saida` (`pode('notas_saida', 'ver')`).

4. **Navegação e Central de Relatórios:**
   - Rotas `/fiscal/livro-saidas` e `/fiscal/resumo-icms` registradas no `App.tsx` e no menu lateral Fiscal do `Sidebar.tsx`.
   - Inclusão dos relatórios no catálogo central `src/config/relatoriosCatalogo.ts` dentro do grupo Fiscal com selo de novo e filtros permitidos.

---

**Versão 0.0.106** — Etapa 8 Relatórios e Painel (Prompt 8.0: Central de Relatórios e Padrão Comum dos Relatórios):

1. **Regras da Etapa 8 Documentadas:**
   - Adicionada seção completa "Etapa 8 Relatórios e painel" no `PROJETO_ERP.md` com as regras de cálculo e soma no backend, limite de 366 dias, modo somente leitura, consolidação multiempresa com conferência de acesso, descarte de cancelados, supressão de documentos fiscais em homologação (exceto com faixa `"INCLUI NOTAS DE TESTE"`), CSV padrão Excel (BOM UTF-8, `;`, vírgula decimal) e cabeçalho de impressão.
2. **Utilitário Comum de Exportação CSV e Impressão (`src/services/relatorios.ts`):**
   - Criação de helpers universais para download de CSV formatado com BOM UTF-8 e impressão padronizada com cabeçalho contendo identificação da(s) empresa(s), período apurado e data/hora de emissão.
3. **Componente Reutilizável de Filtros de Relatórios (`src/components/relatorios/FiltrosRelatorio.tsx`):**
   - Implementado componente comum com seleção de empresas via checkboxes (código, nome e CNPJ), botões "Marcar todas" e "Desmarcar todas", opção "Ver só o total", atalhos de período (Hoje, Esta semana, Este mês, Mês anterior, Últimos 30, 90 e 365 dias, Personalizado até 366 dias) e botões de ação (Exportar CSV e Imprimir).
   - Slot preparado para os filtros complementares que serão adicionados na etapa 8.0b.
4. **Catálogo de Relatórios Configurável (`src/config/relatoriosCatalogo.ts`):**
   - Arquivo de configuração centralizando os relatórios existentes e futuros organizados por categoria (Vendas, Estoque, Compras, Financeiro, Fiscal) com metadados de rota, ícone, resumo e módulo de permissão.
5. **Tela Central de Relatórios (`src/pages/relatorios/CentralRelatoriosPage.tsx`) e Navegação:**
   - Rota `/relatorios` registrada no `App.tsx` e protegida pelo `PermissaoGuard modulo="relatorios" acao="ver"`.
   - Item "Relatórios" no menu lateral (`Sidebar.tsx`) ativado com rota direta `/relatorios` e ícone `BarChart3`.
   - Exibição condicional de cada cartão conforme as permissões do usuário no módulo do respectivo relatório.

---

**Versão 0.0.105** — Fechamento Oficial da Etapa 7 (SPED Fiscal / EFD ICMS/IPI) — Parte 3 de 3 do Prompt 7.6b:

1. **Revisão de Regras e Blindagem:**
   - Conferido e consolidado que `sped_arquivos` permanece com criação e alteração 100% bloqueadas para o navegador (`createRule: null`, `updateRule: null`, `deleteRule: null`), sendo gerada exclusivamente pelos endpoints de backend.
   - Conferido que `sped_ajustes_apuracao` é mutável exclusivamente por Administradores (`perfis_acesso.administrador = true`) e bloqueada se o período já tiver arquivo Oficial entregue.
   - Confirmado que nenhuma rotina da Etapa 7 modifica estoque, financeiro ou documentos fiscais emitidos.
   - Confirmado que o modo Teste impõe o prefixo `TESTE_` no arquivo .txt e possui bloqueio impeditivo no endpoint `/backend/v1/sped/marcar-entregue` e na interface.
2. **Atualização Completa da Documentação no `PROJETO_ERP.md`:**
   - Documentação de todas as entregas da Etapa 7 (Prompts 7.0 a 7.6d, versões 0.0.92 a 0.0.105).
   - Inclusão da seção consolidada "Etapa 7 concluída" com tabelas, endpoints, telas, regras e exceções legais.
   - Versão do projeto atualizada para v0.0.105.

---

**Versão 0.0.104** — Etapa 7 SPED Fiscal (Prompt 7.6b - Parte 2: Orientações de Entrega do SPED e Cartão no Painel Fiscal):

1. **Guia e Orientações "Como entregar o SPED Fiscal":**
   - Inclusão de caixa de orientação sanfonada/expansível na tela Fiscal > SPED Fiscal (`/fiscal/sped`).
   - Roteiro passo a passo oficial detalhando: download do .txt, importação e validação no PVA (Programa Validador e Assinador da EFD ICMS/IPI), saneamento de advertências e erros, assinatura digital com certificado e-CNPJ ou e-CPF do procurador, transmissão à Receita Federal e arquivamento do recibo no ERP com alteração de status para "Entregue".
2. **Card "SPED Fiscal do mês anterior" no Painel Fiscal (`src/pages/Index.tsx`):**
   - Diagnóstico proativo no dashboard inicial do módulo fiscal.
   - Identifica se a escrituração da competência anterior foi transmitida com sucesso, se está gerada aguardando entrega ou se ainda não foi processada, com link direto de navegação.

---

**Versão 0.0.103** — Etapa 7 SPED Fiscal (Prompt 7.6b - Parte 1: Relatório de Conferência do SPED Fiscal):

1. **Tela do Relatório de Conferência (`/fiscal/sped/:id/relatorio` - `src/pages/fiscal/SpedRelatorioConferenciaPage.tsx`):**
   - Relatório completo de auditoria e pré-conferência tributária formatado para tela e impressão/PDF em folha A4 (`window.print()`).
   - Alimentado integralmente pelo registro estruturado em `sped_arquivos` (sem onerar o banco com novas leituras de documentos).
   - Seções analíticas: cabeçalho com dados cadastrais da empresa e período; quadro analítico por CFOP e CST/CSOSN (saídas e entradas); resumo da apuração do ICMS Próprio (Bloco E) com demonstrativo de cálculo do resultado; apuração de DIFAL e FCP por UF de destino; e relação completa de avisos e inconsistências pré-validadas.
   - Tarja em destaque em vermelho `"ARQUIVO DE TESTE — NÃO ENTREGAR AO FISCO"` exibida quando o arquivo for do modo Teste.

---

**Versão 0.0.102** — Etapa 7 SPED Fiscal (Prompt 7.6d: Resumo Analítico por CFOP e CST em `sped_arquivos`):

1. **Persistência de Dados Analíticos nos Arquivos SPED:**
   - Atualização do gerador backend e do serviço `configSped.ts` com agregação detalhada de valores contábeis, base de cálculo e ICMS segregados por CFOP e CST/CSOSN, persistidos diretamente nos campos estruturados `resumo_saida` e `resumo_entrada` de `sped_arquivos`.

---

**Versão 0.0.101** — Etapa 7 SPED Fiscal (Prompt 7.6a: Retificadora com COD_FIN 1, Validação Interna Pré-PVA e Entrega Segura):

1. **Geração de Arquivo Retificador (COD_FIN 1):**
   - Suporte à seleção de finalidade Original (0) ou Retificadora (1) no cabeçalho do registro 0000.
   - Diálogo de advertência e confirmação mandatória na tela `/fiscal/sped` ao gerar arquivo retificador para período que já possua arquivo Oficial marcado como "Entregue".
2. **Motor de Validação Interna Pré-PVA no Backend (`pocketbase/hooks/sped/gerador.js`):**
   - Varreduras automatizadas preventivas executadas ao final da montagem do arquivo:
     - Referências cruzadas de cadastros coletados: consistência de `0150` (participantes COD_PART), `0200` (itens COD_ITEM) e `0190` (unidades UNID) em relação aos registros do Bloco C e H.
     - Validação de dígito verificador de CNPJ e CPF de clientes, fornecedores e filiais.
     - Conferência exata dos totalizadores e encerramentos de blocos (`X990`, `9900`, `9990`, `9999`).
     - Detecção de chaves de acesso duplicadas no mesmo período.
     - Verificação de datas de emissão/entrada pertencentes estritamente à competência apurada.
     - Batimento de `VL_OPR` do analítico C190 com `VL_DOC` do cabeçalho C100 (alerta para divergência > R$ 0,01).
     - Recálculo de batimento contábil da apuração do E110.
     - Aviso preventivo de volumetria para arquivos gerados com tamanho superior a 4 MB.
3. **Controle de Entrega e Blindagem do Modo Teste:**
   - Botão "Marcar como entregue" liberado somente para Administrador, solicitando número do recibo oficial gerado pelo PVA e data da entrega.
   - Bloqueio estrito no endpoint `/backend/v1/sped/marcar-entregue` impedindo que arquivos com `modo = "Teste"` sejam marcados como entregues.

---

**Versão 0.0.98** — Etapa 7 SPED Fiscal (Prompt 7.5: Blocos H, K e 1 do SPED Fiscal e Destaque no Inventário Anual):

1. **Bloco H da EFD ICMS/IPI (Inventário Físico Anual):**
   - Gerado automaticamente no arquivo SPED do mês definido em `config_sped_empresa.mes_bloco_h` (padrão 2, fevereiro); nos outros meses gera `H001` com `IND_MOV = 1` e `H990`.
   - Busca na empresa ativa o inventário do tipo "Anual (Bloco H)", status "Finalizado" e data de referência 31/12 do ano anterior. Caso inexistente, emite o erro impeditivo `"falta o inventário de 31/12"`.
   - Gera registro `H005` com a data do inventário, valor total (`VL_INV` = somatório de `VL_ITEM`) e motivo do inventário (`MOT_INV` lido de `motivo_bloco_h`, padrão "01").
   - Gera registros `H010` agrupados por produto somando lotes com quantidade > 0 (`COD_ITEM` registrado no 0200, `UNID` no 0190, `QTD`, `VL_UNIT` com até 6 casas decimais, `VL_ITEM`, `IND_PROP = 0`, `COD_PART` e `TXT_COMPL` vazios, `COD_CTA` com a `conta_contabil_estoque` e `VL_ITEM_IR` igual a `VL_ITEM`).
   - Batimento obrigatório do somatório dos `VL_ITEM` com `VL_INV`. Emite aviso de validação caso `conta_contabil_estoque` não esteja preenchida. Em caso de estoque zerado em 31/12, emite `H005` com `VL_INV = 0,00` e suprime registros `H010`.
2. **Bloco K da EFD ICMS/IPI (Controle da Produção e Estoque):**
   - Ativado sob demanda através do parâmetro `config_sped_empresa.gerar_bloco_k`. Desligado, gera `K001` com `IND_MOV = 1` e `K990`.
   - Ligado, gera `K001` com `IND_MOV = 0`, `K010` com `IND_TP_LEIAUTE = 2` (leiaute restrito aos saldos de estoque do comércio atacadista), `K100` com período e `K200` para cada produto com saldo diferente de zero no último dia do período apurado a partir das movimentações de estoque (`estoque_movimentos`).
   - Aviso fixo nas inconsistências: `"Bloco K ligado: o contador confirma se a empresa é obrigada e se o leiaute restrito vale para ela"`.
3. **Bloco 1 da EFD ICMS/IPI (Outras Informações):**
   - Registros `1001` (`IND_MOV = 0`) e `1010` com os 13 indicadores todos como "N".
   - Alerta preventivo emitido nas validações quando houver vendas ou contas a receber do período quitados via cartão, PIX ou marketplace: `"confira com o contador se o registro 1601 (pagamentos eletrônicos) é exigido; o ERP não gera o 1601 nesta versão"`.
4. **Bloco 9 (Controle e Totalizadores):**
   - Contabilização dinâmica e automática de todos os registros gerados nos blocos H, K e 1 (`H001`, `H005`, `H010`, `H990`, `K001`, `K010`, `K100`, `K200`, `K990`, `1001`, `1010`, `1990`) no registro `9900` e nos totalizadores `9990` e `9999`.
5. **Destaque na Tela de Inventário (`InventarioDetalhePage.tsx`):**
   - No inventário Anual finalizado, apresentação em destaque de badge estilizado `"Entra no SPED de [mês] de AAAA"` com o nome do mês em português conforme `mes_bloco_h` e ano de competência do arquivo, junto à indicação do total apurado para o registro `H005`.

---

**Versão 0.0.96** — Etapa 7 SPED Fiscal (Prompt 7.4: Bloco E da EFD com Apuração do ICMS Próprio E100/E110/E111/E116, DIFAL E300/E310/E316, Ajustes de Apuração e Painel Tributário):

1. **Geração Real do Bloco E no Motor SPED (`pocketbase/hooks/sped/gerador.js`):**
   - **Registro E100 e E110 (ICMS Próprio):** Calculado exclusivamente a partir dos registros analíticos `C190` e `C101` já montados em memória no Bloco C (sem requery no banco):
     - `VL_TOT_DEBITOS`: soma do `VL_ICMS` dos C190 com CFOP iniciando em 5, 6 ou 7 (operações de saída).
     - `VL_TOT_CREDITOS`: soma do `VL_ICMS` dos C190 com CFOP iniciando em 1, 2 ou 3 (entradas e devoluções de venda).
     - `VL_AJ_DEBITOS` e `VL_AJ_CREDITOS`: 0,00 (não utilizamos C197 nesta versão).
     - Ajustes de Apuração lidos de `sped_ajustes_apuracao`: distribuídos nos campos do E110 pelo 4º caractere do código do ajuste:
       - 4º = "0": `VL_TOT_AJ_DEBITOS` (outros débitos)
       - 4º = "1": `VL_ESTORNOS_CRED` (estorno de créditos)
       - 4º = "2": `VL_TOT_AJ_CREDITOS` (outros créditos / benefícios fiscais como COMPETE-ES)
       - 4º = "3": `VL_ESTORNOS_DEB` (estorno de débitos)
       - 4º = "4": `VL_TOT_DED` (deduções do imposto apurado)
       - 4º = "5": `DEB_ESP` (débito especial)
     - `VL_SLD_CREDOR_ANT`: busca automática do `saldo_credor_transportar` do arquivo Oficial Entregue do mês anterior (ou último Gerado se nenhum entregue) a partir do campo `resumo_apuracao`; se for o `periodo_saldo_inicial` da `config_sped_empresa`, utiliza o `saldo_credor_inicial`; sem nenhum dos dois, adota 0,00 com aviso explicativo nas validações.
     - **Equação de Apuração:**
       `resultado = (VL_TOT_DEBITOS + VL_AJ_DEBITOS + VL_TOT_AJ_DEBITOS + VL_ESTORNOS_CRED) - (VL_TOT_CREDITOS + VL_AJ_CREDITOS + VL_TOT_AJ_CREDITOS + VL_ESTORNOS_DEB + VL_SLD_CREDOR_ANT)`.
       - Se `resultado >= 0`: `VL_SLD_APURADO = resultado`, `VL_ICMS_RECOLHER = VL_SLD_APURADO - VL_TOT_DED` (se deduções superarem o saldo apurado, gera erro e zera o imposto a recolher), `VL_SLD_CREDOR_TRANSPORTAR = 0`.
       - Se `resultado < 0`: `VL_SLD_APURADO = 0`, `VL_ICMS_RECOLHER = 0`, `VL_SLD_CREDOR_TRANSPORTAR = |resultado|`.
     - Empresas sem débitos nem créditos no mês geram E100 e E110 zerados (Bloco E é sempre informado com E001 "0" e E990).
   - **Registro E111:** Um registro para cada ajuste do período (`COD_AJ_APUR`, `DESCR_COMPL_AJ`, `VL_AJ_APUR`), emitido logo após o E110.
   - **Registro E116 (Obrigações a Recolher):** Emitido quando `VL_ICMS_RECOLHER + DEB_ESP > 0`. `COD_OR` = "000", `VL_OR` = valor a recolher com débito especial, `DT_VCTO` = dia de vencimento (`dia_vencimento_icms`) no mês seguinte ao período, `COD_REC` = `codigo_receita_icms` cadastrado na configuração da empresa (se ausente, acusa erro impeditivo nas validações), `MES_REF` = `mmaaaa`.
   - **Regra de Bloqueio de ICMS ST nas Saídas:** Havendo qualquer registro C190 de saída com `VL_ICMS_ST > 0`, gera erro impeditivo: _"há ICMS ST retido nas saídas: a apuração E200/E210 precisa ser feita com o contador"_ (o ERP não gera o E200 nesta versão).
   - **DIFAL e FCP (EC 87/2015) — Registros E300, E310 e E316:**
     - Ativado exclusivamente quando houver registros C101 coletados no período.
     - Registro `E300` por UF de destino com período (`UF`, `DT_INI`, `DT_FIN`).
     - Registro `E310` com os 21 campos no leiaute da EFD: `IND_MOV_FCP_DIFAL` = 1, `VL_TOT_DEBITOS_DIFAL` (soma do `VL_ICMS_UF_DEST` das saídas), `VL_TOT_CREDITOS_DIFAL` (soma das devoluções de venda), apuração de `VL_RECOL_DIFAL` e `VL_SLD_CRED_TRANSPORTAR_DIFAL`, acompanhados dos 10 campos análogos de FCP a partir do `VL_FCP_UF_DEST`.
     - Registro `E316` por UF quando houver valor a recolher: `COD_OR` = "000" para DIFAL e "006" para FCP, `DT_VCTO` = data da emissão da nota mais antiga do mês para a UF (pagamento por GNRE a cada nota), `MES_REF` = `mmaaaa`, e aviso fixo: _"DIFAL apurado pelo ERP: o contador confere os códigos de obrigação e de receita antes de transmitir"_.
   - **Persistência de `resumo_apuracao`:** Objeto estruturado com `icms_proprio` e `difal_por_uf` persistido no campo JSON `resumo_apuracao` em `sped_arquivos`.
   - **Contagem do Bloco E no Bloco 9:** Todos os registros (E001, E100, E110, E111, E116, E300, E310, E316 e E990) são dinamicamente contabilizados no 9900.

2. **Ajustes de Apuração e Endpoints Seguros (`pocketbase/hooks/fiscal_sped_operacoes.js` e Migration 0057):**
   - Tabela `sped_ajustes_apuracao` com índice em `empresa_id`, `periodo` e `codigo_ajuste`.
   - Endpoints `/backend/v1/sped/ajustes/salvar` e `/backend/v1/sped/ajustes/excluir` com checagem estrita de administrador (`perfis_acesso.administrador = true`) e bloqueio caso o período possua arquivo Oficial já Entregue.

3. **Interface do Usuário na Tela Fiscal > SPED Fiscal (`src/pages/fiscal/SpedFiscalPage.tsx`):**
   - **Aba "Ajustes da apuração":**
     - Seletor reativo de período com tabela dos ajustes cadastrados para o mês (código, tipo no E110, descrição complementar e valor).
     - Formulário modal com validação de 8 dígitos para o código da SEFAZ (explicando o impacto do 4º caractere) e orientações sobre benefícios fiscais (COMPETE-ES).
     - Botões de Novo Ajuste, Edição e Exclusão liberados somente para Administrador e bloqueados com aviso detalhado quando o período possui arquivo Oficial com status "Entregue".
   - **Quadro "Apuração do ICMS Próprio (Bloco E)" no Arquivo Selecionado:**
     - Painel escuro estilizado exibindo débitos de saídas, créditos de entradas, saldo credor anterior, ajustes de débito e crédito, deduções, valor do ICMS a recolher e saldo credor a transportar.
     - Quadro de apuração de DIFAL e FCP por UF de destino com recolhimentos discriminados.

---

**Versão 0.0.95** — Etapa 7 SPED Fiscal (Prompt 7.3: Bloco C da EFD com Notas de Terceiros Recebidas — Compras e Transferências Recebidas, Registros C100, C170, C190 e Painel de Entradas do Período):

1. **Notas de Entrada de Terceiros no Bloco C (`pocketbase/hooks/sped/gerador.js`):**
   - Filtragem e escrituração da coleção `notas_entrada` da empresa ativa com status "Lançada", ativo = true e `data_entrada` no horário de Brasília pertencente ao período de apuração.
   - Tratamento de situação do documento: `situacao_documento` "02" (cancelada pelo fornecedor) é desconsiderada; "08" entra com `COD_SIT` 08; "00" entra com `COD_SIT` 00.
   - Modelos aceitos: 55 (NF-e), 01, 1B e 04 (modelos em papel de produtor/avulsos). Qualquer outro modelo gera aviso informativo nas validações e não entra.
   - Deduplicação e prevenção de concorrência com transferências recebidas e devoluções através do mapa de controle de chaves de acesso.
2. **Registro C100 de cada Nota de Entrada:**
   - `IND_OPER` 0 (entrada); `IND_EMIT` 1 (terceiros); `COD_PART` = fornecedor da nota (`F` + id), registrado dinamicamente no coletor de participantes do Bloco 0 (0150).
   - `COD_MOD` = modelo; `COD_SIT` (00 ou 08); `SER`; `NUM_DOC`; `CHV_NFE` = 44 dígitos da chave de acesso (suprimido nos modelos em papel 01, 1B e 04).
   - Datas `DT_DOC` (`data_emissao`) e `DT_E_S` (`data_entrada`) em formato `ddmmaaaa` (horário de Brasília).
   - `IND_PGTO` conforme indicador da nota; `IND_FRT` conforme modalidade do frete (0, 1, 2, 3, 4 ou 9).
   - Valores contábeis e fiscais: `VL_DOC` = valor total, `VL_DESC` = valor desconto, `VL_ABAT_NT` = 0,00, `VL_MERC` = valor produtos, `VL_FRT` = frete, `VL_SEG` = seguro, `VL_OUT_DA` = outras despesas.
   - `VL_BC_ICMS` e `VL_ICMS`: soma do crédito aproveitado nos itens da nota (base e valor do crédito dos itens com `aproveita_credito_icms` verdadeiro), e não o destaque do fornecedor.
   - `VL_BC_ICMS_ST` e `VL_ICMS_ST` como na nota; `VL_IPI` com a soma de `valor_credito_ipi` quando `aproveita_credito_ipi` e a empresa for contribuinte do IPI, senão 0; `VL_PIS` e `VL_COFINS` com os créditos aproveitados dos itens (`valor_credito_pis` e `valor_credito_cofins`); `VL_PIS_ST` e `VL_COFINS_ST` vazios.
3. **Registro C170 Obrigatório dos Itens de Entrada (`notas_entrada_itens`):**
   - Ordenado por `numero_item`.
   - `NUM_ITEM` = número do item; `COD_ITEM` = código cadastral do produto vinculado (`produtos.codigo`), com registro no coletor de itens do Bloco 0 (0200). Caso o item não possua produto vinculado no catálogo do ERP, gera erro impeditivo nas validações com o número da nota e do item.
   - `DESCR_COMPL` vazio; `QTD` = quantidade no estoque (`quantidade_estoque`); `UNID` = sigla da unidade de medida do produto vinculado cadastrado no 0200 (dispensando 0220).
   - `VL_ITEM` = valor do produto; `VL_DESC` = desconto do item; `IND_MOV` 0 (movimentação física do item).
   - `CST_ICMS` = origem + CST ICMS de entrada (3 dígitos); `CFOP` = CFOP de entrada; `COD_NAT` vazio.
   - Crédito de ICMS do item: `VL_BC_ICMS`, `ALIQ_ICMS` e `VL_ICMS` preenchidos exclusivamente quando `aproveita_credito_icms` for verdadeiro; caso falso, campos zerados/vazios.
   - Substituição tributária do item: `VL_BC_ICMS_ST`, `ALIQ_ST` e `VL_ICMS_ST`; `IND_APUR` 0.
   - IPI: `CST_IPI`, `COD_ENQ`, `VL_BC_IPI`, `ALIQ_IPI` e `VL_IPI` preenchidos SOMENTE se a empresa for contribuinte do IPI (`empresa.contribuinte_ipi = true`); caso contrário, todos vazios.
   - PIS e COFINS: `CST_PIS` e `CST_COFINS` com base, alíquota e valor do crédito aproveitado (`valor_credito_pis` e `valor_credito_cofins`) quando houver crédito; sem crédito, valores vazios.
   - `COD_CTA` vazio e `VL_ABAT_NT` = 0,00.
4. **Registro Analítico C190 para Notas de Entrada com Rateio e Batimentos:**
   - Agrupamento dos itens por `CST_ICMS`, `CFOP` e `aliquota_icms`.
   - Rateio proporcional dos adicionais da nota (frete, seguro, outras despesas, ST, FCP ST e IPI menos desconto) sobre o valor dos produtos para apuração precisa do `VL_OPR` por item e por grupo, com compensação exata de centavos no último item/grupo.
   - `VL_BC_ICMS` e `VL_ICMS` refletindo o crédito aproveitado; `VL_BC_ICMS_ST` e `VL_ICMS_ST`; `VL_RED_BC` de redução de base; `VL_IPI` do crédito aproveitado.
   - Ajuste fino no último grupo analítico C190 para que a soma dos `VL_ICMS` bata exatamente com o `VL_ICMS` (crédito) do C100.
   - Batimento contábil: soma de `VL_OPR` comparada com o `VL_DOC` do C100; divergência superior a R$ 0,01 emite aviso não impeditivo com o número da nota.
5. **Transferências Recebidas entre Filiais no Bloco C:**
   - Mapeamento de `documentos_fiscais` com origem "Transferência" (ou "Transferencia"), status "Autorizada" ou "Cancelada", cuja transferência vinculada (`transferencia_id`) tenha como destino a empresa do arquivo.
   - Respeito aos ambientes de homologação e produção conforme o modo (Oficial vs Teste).
   - Deduplicação inteligente: se a chave de acesso já tiver sido lançada em `notas_entrada`, não repete a nota no arquivo.
   - C100 com `IND_OPER` 0, `IND_EMIT` 1, `COD_PART` = empresa de origem (`E` + id), `COD_SIT` 00 (ou 02 para canceladas com campos reduzidos).
   - Registro C170 para cada item de `documentos_fiscais_itens`, convertendo automaticamente o primeiro dígito do CFOP de saída para entrada (5xxx -> 1xxx e 6xxx -> 2xxx, ex: 5152 -> 1152, 5409 -> 1409, 6152 -> 2152), e adotando como crédito de ICMS o imposto destacado na transferência.
   - Agrupamento analítico C190 com o mesmo rateio e batimento.
6. **Integridade de Devoluções de Venda:**
   - Conferido e verificado que devoluções de venda continuam emitidas exclusivamente pelo fluxo de emissão própria do prompt 7.2 com `IND_OPER` 0 e `IND_EMIT` 0, não sofrendo duplicidade com notas de terceiros ou transferências recebidas.
7. **Ordenação dos Registros e Bloco 9 (9900):**
   - Cada C100 é seguido imediatamente de seus C101 (quando houver), C170 e C190.
   - Bloco 9 computa dinamicamente a presença e a contagem de registros C170 no 9900 e recalcula linhas do arquivo.
8. **Persistência de Dados (Migration 0056) e Interface do Usuário (`SpedFiscalPage.tsx`):**
   - Migration `0056_add_resumo_entrada_sped_arquivos.js` adicionando campo JSON `resumo_entrada` em `sped_arquivos`.
   - Adição do quadro **"Entradas do período"** (estilo visual verde esmeralda com selo Bloco C) na tela Fiscal > SPED Fiscal para o arquivo selecionado, exibindo:
     - Quantidade de notas de compra (entradas de terceiros)
     - Quantidade de transferências recebidas
     - Total do `VL_DOC` das entradas
     - Total do crédito de ICMS aproveitado

---

**Versão 0.0.94** — Etapa 7 SPED Fiscal (Prompt 7.2: Bloco C da EFD com Documentos Emitidos pela Empresa, Registros C100, C101, C190, Inutilizações e Painel de Saídas do Período):

1. **Documentos de Saída e Entrada Própria no Bloco C (`pocketbase/hooks/sped/gerador.js`):**
   - Mapeamento e filtragem de `documentos_fiscais` (modelos 55 e 65) com `data_emissao` no horário de Brasília (UTC-3) pertencente ao período de apuração.
   - Respeito estrito aos ambientes de emissão: Modo Oficial processa exclusivamente notas do ambiente "Produção"; Modo Teste inclui também "Homologação" quando parametrizado em `config_sped_empresa.incluir_homologacao_em_teste`.
   - Documentos com status "Rascunho" e "Rejeitada" são ignorados; notas que permaneceram com status "Processando" ao fim do período geram aviso preventivo com o número do documento.
2. **Registro C100 (Nota Fiscal / Consumidor) nos 29 Campos do Leiaute:**
   - Preenchimento estrito de `IND_OPER` (1 para saídas e 0 para entradas de emissão própria, como devoluções de venda), `IND_EMIT` 0 (emissão própria) e `COD_PART` qualificado e registrado dinamicamente no coletor do Bloco 0150 (`C` + id do cliente para vendas e devoluções de venda; `F` + id do fornecedor para devoluções de compra; `E` + id da filial para transferências; e vazio para NFC-e modelo 65 sem participante).
   - `COD_MOD`, `SER`, `NUM_DOC`, `CHV_NFE`, `COD_SIT` (00 Autorizada, 02 Cancelada, 04 Denegada, 05 Inutilizada), datas de emissão `DT_DOC` e `DT_E_S`.
   - `IND_PGTO`: 0 quando todas as parcelas foram liquidadas à vista no mesmo dia, 1 quando houver parcelas a prazo no contas a receber, e 2 para as demais operações.
   - `IND_FRT`: extração do modalidade de frete do XML autorizado ou do payload enviado (`json_enviado`); ausente ou sem frete, padrão 9.
   - Valores contábeis e fiscais: `VL_DOC`, `VL_DESC`, `VL_ABAT_NT` (0,00), `VL_MERC`, `VL_FRT`, `VL_SEG`, `VL_OUT_DA`, `VL_BC_ICMS`, `VL_ICMS`, `VL_BC_ICMS_ST`, `VL_ICMS_ST`, `VL_IPI`, `VL_PIS`, `VL_COFINS`, `VL_PIS_ST` e `VL_COFINS_ST`.
   - Notas Canceladas (02) e Denegadas (04): preenchimento restrito a `REG`, `IND_OPER`, `IND_EMIT`, `COD_MOD`, `COD_SIT`, `SER`, `NUM_DOC` e `CHV_NFE`, com os demais campos vazios e sem gerar registros C101 e C190.
   - Validação cruzada de cancelamento: alerta automático quando uma nota fiscal tiver sido cancelada após a data de entrega de um arquivo SPED do mesmo período já entregue ao Fisco.
   - NFC-e (modelo 65): desconsideração de participante e supressão de ST, IPI, PIS e COFINS no cabeçalho do C100 conforme regulamento.
3. **Inutilizações de Numeração no Bloco C100:**
   - Varredura das faixas de inutilizações homologadas da empresa na tabela `inutilizacoes` com data no período.
   - Geração de registro C100 para cada número da faixa inutilizada com `IND_OPER` 1, `IND_EMIT` 0, `COD_SIT` 05 (Numeração Inutilizada), série e número, com os demais campos em branco.
4. **Registro C101 (DIFAL e FCP Destino na NF-e):**
   - Gerado imediatamente após o C100 nas NF-e modelo 55 que apresentarem `valor_fcp_uf_destino`, `valor_icms_uf_destino` ou `valor_icms_uf_remetente` maiores que zero.
5. **Supressão do C170 em Emissão Própria e Registro Analítico C190:**
   - Registro C170 suprimido nas notas eletrônicas de emissão própria (55 e 65).
   - Agrupamento inteligente dos itens de cada nota autorizada por `CST_ICMS` (ou origem + CSOSN para empresas optantes pelo Simples Nacional com CRT 1 ou 4), `CFOP` e `aliquota_icms`.
   - `VL_OPR` apurado pela soma dos itens com acréscimo de ICMS ST e IPI quando destacados por fora. Validação mandatória: divergência superior a R$ 0,01 entre a soma dos `VL_OPR` do C190 e o `VL_DOC` do C100 gera erro impeditivo no relatório de inconsistências com o número da nota.
   - Apuração do `VL_RED_BC` quando houver percentual de redução de base de cálculo.
6. **Controle de Movimento do Bloco C (C001 e C990) e Resumo de Saídas:**
   - Registro `C001` atualizado para `IND_MOV` 0 quando houver qualquer C100, e totalizador `C990` calculado.
   - Campo `resumo_saida` persistido em `sped_arquivos` (Migration 0055).
7. **Tela Fiscal > SPED Fiscal (`/fiscal/sped` - `SpedFiscalPage.tsx`):**
   - Exibição do quadro em destaque **"Saídas do período"** para o arquivo selecionado, apresentando métricas em cartões analíticos:
     - Quantidade de NF-e (modelo 55)
     - Quantidade de NFC-e (modelo 65)
     - Quantidade de notas Canceladas
     - Quantidade de notas Denegadas
     - Quantidade de numerações Inutilizadas
     - Total contábil do período (`VL_DOC`)
     - Total do débito de ICMS destacado

---

**Versão 0.0.93** — Etapa 7 SPED Fiscal (Prompt 7.1: Gerador EFD ICMS/IPI com Blocos 0 e 9, Blocos Vazios, Endpoint /backend/v1/sped/gerar e Tela SPED Fiscal):

1. **Módulo de Formatação e Gerador SPED (`pocketbase/hooks/sped/*`):**
   - Utilitários de formatação oficial (CRLF, ASCII, vírgula decimal, datas em horário de Brasília, dígitos limpos).
   - Motor orquestrador com contexto, coletores e montagem modular por bloco (0, B, C, D, E, G, H, K, 1 e 9).
2. **Endpoint Transacional (`POST /backend/v1/sped/gerar`):**
   - Criação de registro em `sped_arquivos`, geração e anexo do .txt, substituição automática de versões anteriores e validação de IE em modo Oficial.
3. **Tela Fiscal > SPED Fiscal (`/fiscal/sped`):**
   - Geração de arquivos por período/modo, acompanhamento de histórico, download do arquivo .txt e inspeção de inconsistências/avisos.

---

**Versão 0.0.92** — Etapa 7 SPED Fiscal (Prompt 7.0: Configuração da EFD ICMS/IPI, Tabelas config_sped_empresa e sped_arquivos, Endpoint marcar-entregue e Checklist de Prontidão):

1. **Tabelas SPED Fiscal (Migrations 0053 e 0054):**
   - Criação da tabela `config_sped_empresa` com parametrização completa e índice único por empresa.
   - Criação da tabela `sped_arquivos` com leitura no frontend e gravação blindada exclusiva pelo backend.
2. **Endpoint Seguro no PocketBase (`pocketbase/hooks/fiscal_sped_operacoes.js`):**
   - `POST /backend/v1/sped/marcar-entregue`: permite exclusivamente ao Administrador registrar entrega e recibo da EFD com auditoria.
3. **Tela de Configuração e Diagnóstico Tributário (`/fiscal/sped/configuracoes`):**
   - Formulário de parametrização da EFD para a empresa ativa (`useEmpresaAtiva`).
   - Checklist interativo "Pronto para gerar o SPED?" com diagnóstico em tempo real dos 9 itens cadastrais e fiscais da empresa ativa.

---

**Versão 0.0.91** — Fechamento Oficial da Etapa 6 (Fiscal) — Exportação de XMLs em Lote (ZIP + CSV), Cartões no Painel Geral e Revisão de Segurança:

1. **Exportação de XMLs em Lote (`/fiscal/exportar-xmls`):**
   - Seleção por período, modelo (NF-e 55 ou NFC-e 65) e empresa ativa/todas.
   - Geração de arquivo compactado (.zip) contendo todos os arquivos XMLs autorizados do período.
   - Inclusão automática de planilha CSV de resumo analítico da escrituração fiscal.
2. **Cartões Fiscais no Painel Geral (`src/pages/Index.tsx`):**
   - Métricas de notas emitidas no mês, total faturado com nota e monitor de notas rejeitadas/pendentes.
3. **Blindagem de Permissões (Migration 0052):**
   - Travamento de gravação via navegador nas tabelas `inutilizacoes`, `documentos_fiscais`, `documentos_fiscais_itens` e `documentos_fiscais_cartas`.

---

**Versão 0.0.90** — Painel de Monitoramento Fiscal, Inutilizações e Finalização das Operações de Devolução e Transferência:

1. Integração completa das emissões e inutilizações homologadas pela SEFAZ com gravação de XML e histórico.
2. Polling assíncrono e resiliência de conexão com a API da Focus NFe.

---

**Versão 0.0.89** — Monitor de Documentos Fiscais (Fiscal > Documentos fiscais), Gestão e Reenvio de Notas, e Avisos da Focus (Webhooks em Tempo Real):

1. **Monitor de Documentos Fiscais (`/fiscal/documentos` - `src/pages/fiscal/DocumentosFiscaisPage.tsx`):**
   - Substituição do placeholder informativo pela tela definitiva de monitoramento de documentos fiscais.
   - **Filtros Avançados:** Empresa emitente (padrão: a empresa ativa do contexto; Administrador pode alternar para ver todas as empresas simultaneamente), modelo fiscal (todos, NF-e 55 ou NFC-e 65), status (todos, Autorizada, Processando, Rejeitada, Cancelada, Denegada, Rascunho), origem da emissão (todas, Venda, Devolução de venda, Devolução de compra, Transferência), período por data de emissão inicial/final, destinatário (pesquisa por nome ou CPF/CNPJ) e número da nota ou 44 dígitos da chave de acesso.
   - **Colunas da Listagem:** Empresa emitente, data de emissão/criação, modelo fiscal (badges estilizados 55 e 65), série e número, destinatário com CPF/CNPJ, valor total, status com selos coloridos (Autorizada em verde, Rejeitada em vermelho, Processando em âmbar com spinner, Cancelada em cinza, Denegada em vermelho-escuro com borda e Rascunho neutro) e ambiente (Produção em lilás ou Homologação em âmbar).
   - **Ações Contextuais por Documento:**
     - **"Consultar situação":** aciona `/backend/v1/fiscal/consultar-situacao-nfe`, sincronizando em tempo real os dados da Focus NFe e SEFAZ no documento e na venda correspondente.
     - **"Tentar de novo" (apenas Rejeitada):** retransmite o documento para a SEFAZ mantendo a mesma referência através de `/backend/v1/fiscal/reenviar-documento`.
     - **"Abrir DANFE":** visualização direta do PDF oficial da Focus NFe (`danfe_url`) em nova aba do navegador.
     - **"Baixar XML":** download do XML autorizado arquivado no PocketBase (`xml_arquivo`) com fallback via Focus NFe (`baixarArquivoFiscal`).
     - **"Cancelar":** modal com justificativa obrigatória de 15 a 255 caracteres (`ModalCancelarNFe`), condicionado à permissão de excluir em `notas_saida`.
     - **"Carta de correção" (apenas NF-e 55 autorizada):** emissão de CC-e (`ModalCartaCorrecao`) com histórico e restrições legais.
     - **"Ver JSON enviado e retorno" (exclusivo Administrador):** modal técnico formatado com syntax highlight para inspeção de `json_enviado` e `json_retorno`.
   - **Destaque no Topo para Documentos Críticos:**
     - Cartão proativo exibindo notas rejeitadas e notas em processamento há mais de 5 minutos.
     - Botão em lote **"Consultar todos na SEFAZ"** (`/backend/v1/fiscal/consultar-lote`), executando varredura automatizada na Focus NFe e SEFAZ e reportando total de notas atualizadas, pendentes e falhas.
   - **Permissões de Acesso:** Tela governada pelo módulo `notas_saida` (`pode('notas_saida', 'ver')`), com bloqueios de perfil para ações de cancelamento, reenvio e visualização técnica de JSON.

2. **Avisos da Focus NFe (Webhooks):**
   - **Endpoint Público Seguro (`pocketbase/hooks/fiscal_webhook_focus.js`):**
     - `POST /backend/v1/fiscal/webhook-focus`: rota pública no PocketBase para callbacks assíncronos da Focus NFe.
     - Validação estrita do cabeçalho `Authorization` contra o segredo `$os.getenv('FOCUS_NFE_WEBHOOK_SECRET')`. Chamadas sem autorização ou com segredo divergente retornam HTTP 401 imediatamente.
     - **Zero Trust no Payload:** ao receber a notificação, localiza o documento fiscal pela referência recebida no padrão `{cnpj}-{modelo}-{id}`, extrai a empresa emitente, recupera o token fiscal cadastrado nos segredos do Skip Cloud e consulta a Focus NFe (`GET /nfe/{ref}?completa=1` ou `GET /nfce/{ref}`).
     - Atualização atômica do documento fiscal e das entidades vinculadas (vendas, devoluções e transferências) de acordo com o status oficial retornado pela SEFAZ:
       - Autorizada: preenche número, série, chave de 44 dígitos, protocolo, `danfe_url`, baixa o XML autorizado e grava em `xml_arquivo`.
       - Rejeitada: registra status, motivo da SEFAZ e lista de erros estruturados.
       - Denegada: marca o documento como Denegado com alerta explicativo.
       - Cancelada: atualiza cancelamento.
     - Resposta rápida HTTP 200 para a Focus NFe, evitando reenvios indevidos e registrando internamente eventuais inconsistências em log.
   - **Painel Administrativo de Avisos (`/fiscal/configuracoes` - `ConfiguracaoEmissaoFiscalPage.tsx`):**
     - Seção nova **"Avisos da Focus (Webhooks)"**, visível exclusivamente para Administradores do ERP.
     - Exibição de alerta preventivo quando o segredo `FOCUS_NFE_WEBHOOK_SECRET` não estiver configurado no Skip Cloud.
     - Ações: **"Registrar na Focus (Empresa Ativa)"** e **"Registrar para Todas as Empresas"**, disparando `POST /backend/v1/fiscal/registrar-webhook-focus` que cadastra o webhook com evento `"nfe"`, a URL pública do app e o segredo de autorização na API da Focus NFe.
     - Tabela dinâmica de webhooks ativos consultada em tempo real via `GET /backend/v1/fiscal/listar-webhooks-focus` (`GET /hooks` na Focus NFe).

3. **Endpoints Backend Implementados em `pocketbase/hooks/fiscal_webhook_focus.js`:**
   - `POST /backend/v1/fiscal/webhook-focus`: receptor público autenticado do webhook da Focus NFe.
   - `POST /backend/v1/fiscal/registrar-webhook-focus`: registro automático de webhook na Focus NFe por empresa ou em lote.
   - `GET /backend/v1/fiscal/listar-webhooks-focus`: consulta dos hooks cadastrados na API da Focus NFe.
   - `POST /backend/v1/fiscal/reenviar-documento`: retransmissão de documentos fiscais com status "Rejeitada".
   - `POST /backend/v1/fiscal/consultar-lote`: sincronização e consulta em lote de documentos na SEFAZ.

---

**Versão 0.0.88** — Devolução de Venda com NF-e de Entrada Própria (Modelo 55), Modal de Conferência, Polling SEFAZ e Rastreio Fiscal:

1. **Tela de Trocas e Devoluções (`src/pages/vendas/TrocasDevolucoesPage.tsx`):**
   - **Modal de Conferência Pré-emissão:** Ao confirmar a devolução de uma venda cujo `documento_fiscal_status` seja "Autorizada" (NF-e ou NFC-e), o sistema abre modal de conferência detalhado exibindo:
     - Emitente (empresa/filial da venda original com Razão Social, CNPJ e UF).
     - Remetente (cliente cadastrado da venda original ou campos Nome + CPF com validação obrigatória quando a venda foi para consumidor avulso/não cadastrado).
     - Chave da nota referenciada (44 dígitos da NF-e ou NFC-e original).
     - Itens devolvidos com indicação do CFOP previsto (`1202`/`2202` normal, ou `1411`/`2411` com Substituição Tributária) e bases/alíquotas proporcionais calculadas na transmissão.
   - **Desacoplamento Transacional:** O botão "Confirmar e emitir NF-e" aciona `emitirNfeDevolucaoVenda` criando a venda de devolução com status `"Pendente de nota"` e **NÃO** movimenta estoque nem financeiro de imediato (a reintegração física e contábil é realizada estritamente após a autorização da SEFAZ).
   - **Acompanhamento e Polling SEFAZ:** Polling automático através de `consultarSituacaoNFe` a cada 3 segundos por até 30 segundos:
     - **Autorizado:** invoca `confirmarAutorizacaoDevolucaoVenda` movimentando o estoque (origem `DEVOLUCAO_VENDA`), processando o destino financeiro (vale-troca, estorno em dinheiro ou desconto no crediário), atualizando `quantidade_devolvida` e finalizando a devolução.
     - **Erro de autorização (Rejeitada):** devolução permanece com selo `"Pendente de nota"` registrando e exibindo o motivo da rejeição da SEFAZ (`motivo_cancelamento`).
     - **Denegado:** exibe aviso de que a nota denegada não pode ser reutilizada nem cancelada devido a irregularidade fiscal cadastral.
     - **Timeout (mais de 30s):** aviso amigável de processamento em andamento na SEFAZ e orientação para acompanhamento na listagem.
   - **Histórico e Reenvio:** Nova aba "Histórico de Devoluções" com selo visual `"Pendente de nota"`, motivo da rejeição e botão **"Tentar de novo"** reenviando a emissão para o mesmo `devolucao_id` (mesma referência fiscal).
   - **Detalhes e Documento Fiscal Vinculado:** Modal de detalhes da devolução apresentando número, série, chave de 44 dígitos, protocolo da SEFAZ e botões **"Abrir DANFE"** (em nova aba) e **"Baixar XML"** (`baixarArquivoFiscal`).
   - **Vendas sem Nota Fiscal Autorizada:** O fluxo de devolução sem nota permanece 100% inalterado e direto.
   - **Permissões:** Exige permissão de criação em `notas_saida` (`pode('notas_saida', 'criar')`) para emitir e reenviar notas fiscais de devolução.

2. **Endpoints Backend e Modelo de Dados:**
   - `POST /backend/v1/fiscal/emitir-nfe-devolucao-venda`: validação e transmissão da NF-e modelo 55 de entrada própria com finalidade 4 (Devolução), vínculo à chave original e criação de registro em `documentos_fiscais`.
   - `POST /backend/v1/fiscal/confirmar-autorizacao-devolucao-venda`: operação transacional atômica que valida o status "Autorizada", movimenta o estoque via Kardex, gera vales-troca / movimentações financeiras / baixas no crediário e finaliza a devolução.
   - Atualização da tipagem `StatusVenda` em `src/services/vendas.ts` e interfaces em `src/services/devolucoes.ts` (`DevolucaoVendaRegistro`).
   - Campo `devolucao_venda_id` em `documentos_fiscais` e status `Pendente de nota` em `vendas` (Migration 0051).

---

**Versão 0.0.85** — Correção do Build do Projeto e Alinhamento dos Contratos de Emissão de NF-e de Transferência:

- Correção das exportações em `src/services/fiscalIntegracao.ts`: exportadas as funções `emitirNFeTransferencia` (com alias para `emitirNfeTransferencia`), `montarRascunhoDocumentoFiscal` e as interfaces `RascunhoFiscalResponse`, `EmitirNFeTransferenciaParams` e `EmitirNFeTransferenciaResponse`.
- Adição dos campos `venda_id` e `transferencia_id` na interface `DocumentoFiscalRegistro` em `src/services/documentosFiscais.ts`.
- Inclusão dos imports dos componentes `Alert`, `AlertTitle` e `AlertDescription` em `src/pages/estoque/TransferenciaFormPage.tsx`.
- Ajuste das chamadas de status e conversão de número de NF-e em `src/components/fiscal/ModalEmitirNFeTransferencia.tsx`.
- QA 100% verde (oxlint, TypeScript typecheck e Vite build).

---

**Versão 0.0.84** — Emissão de NF-e de Transferência entre Filiais (Modelo 55), Modal de Conferência, Polling SEFAZ, DANFE/XML e Bloqueios Fiscais:

1. **Modal de Conferência e Emissão de NF-e de Transferência (`ModalEmitirNFeTransferencia.tsx`):**
   - Criação de `src/components/fiscal/ModalEmitirNFeTransferencia.tsx` seguindo o padrão de emissão e polling da NF-e de venda (Modelo 55).
   - **Regra Fixa do Emitente:** A NF-e é emitida rigorosamente pela empresa de ORIGEM da transferência (`empresa_origem_id`), utilizando o token, série e ambiente daquela filial cadastrados em `config_emissao_fiscal` (nunca a matriz nem a empresa ativa no navegador).
   - **Aba 1 (Empresas & Operação):** Conferência dos dados do emitente (Razão Social, CNPJ, UF da origem), destinatário (Razão Social, CNPJ, IE da empresa de destino), ambiente SEFAZ, natureza da operação (lida de `config_emissao_fiscal.natureza_operacao_transferencia` com fallback para "Transferência de mercadoria") e informações complementares.
   - **Aba 2 (Itens da Transferência):** Grade com código, descrição, quantidade, custo unitário e subtotal dos produtos transferidos, totalizando o custo da remessa.
   - **Aba 3 (Transporte & Impostos):** Modalidade do frete (CIF/FOB/próprio/sem frete), seletor de transportadora cadastrada, volumes transportados (quantidade, espécie, peso bruto e líquido) e pré-visualização da apuração de impostos (ICMS próprio, ICMS ST, IPI, PIS, COFINS, FCP) calculada via rascunho.
   - **Transmissão e Polling Automático:** Ao confirmar, dispara `emitirNFeTransferencia` e executa polling com `consultarSituacaoNFe` a cada 3s por até 30s com contagem regressiva visual. Autorizada: exibe número, série e chave de 44 dígitos. Rejeitada: exibe mensagem da SEFAZ. Passados 30s sem retorno final: exibe aviso de "Processando" com botão manual "Consultar situação".

2. **Ajuste no Backend para Pré-visualização de Rascunho de Transferência (`pocketbase/hooks`):**
   - Em `fiscal_documentos_operacoes.js`, adicionado suporte no endpoint `/backend/v1/fiscal/montar-rascunho` para a origem `'Transferência'` / `'Transferencia'` vinculada a `transferencia_id`:
     - Leitura dos dados da empresa remetente (`empresa_origem_id`) e destinatária (`empresa_destino_id`).
     - Mapeamento dos itens de `transferencias_itens` com quantidade e `custo_unitario`.
     - CFOP automático de transferência (5152/6152 para normal e 5409/6409 para mercadorias com ST/CEST).
     - Cenário tributário `TRANSFERENCIA` sem exigência impeditiva de perfil de venda.
     - Gravação e atualização do documento com vínculo a `transferencia_id`.
   - Em `fiscal_nfe_operacoes.js`, adicionado suporte a `transferencia_id` nos endpoints `/backend/v1/fiscal/consultar-situacao-nfe` e `/backend/v1/fiscal/cancelar-nfe`.

3. **Integração nas Telas de Transferência (`TransferenciaFormPage.tsx` e `TransferenciasListaPage.tsx`):**
   - **Botão "Emitir NF-e de transferência":** Disponível quando a transferência estiver no status "Enviada" e sem nota autorizada (`nota_fiscal_chave`), condicionado à permissão de criação em `notas_saida` (`pode('notas_saida', 'criar')` ou administrador).
   - **Empresa de Origem sem Emissão:** Se `config_emissao_fiscal.emite_documentos_fiscais` for `false` ou inexistente para a empresa de origem, o botão fica oculto e exibe o aviso inline `"Esta empresa não emite NF-e"`.
   - **Emissão Automática ao Enviar:** Se `emitir_nfe_ao_enviar_transferencia = true` na configuração fiscal da empresa de origem, ao clicar em "Enviar" e despachar o estoque, o sistema abre imediatamente o modal já disparando a transmissão da NF-e para a SEFAZ.
   - **Ações da NF-e Autorizada:** Na transferência com NF-e autorizada, exibe número e chave de 44 dígitos com botões **"Abrir DANFE"** e **"Baixar XML"** (acessando `danfe_url` e `xml_arquivo` do registro em `documentos_fiscais`).
   - **Aviso no Recebimento:** Na tela da filial de destino, se a transferência enviada não possuir NF-e autorizada, exibe alerta explicativo não bloqueante: `"Transferência sem nota fiscal - Esta transferência foi enviada sem NF-e autorizada. A mercadoria pode ser recebida normalmente."`
   - **Bloqueio de Cancelamento:** Se o documento fiscal da transferência estiver com status `"Autorizada"`, o cancelamento da transferência é bloqueado com a mensagem `"Cancele a nota fiscal antes de cancelar a transferência."` tanto no formulário quanto no serviço central `cancelarTransferencia`.

---

**Versão 0.0.83** — Inutilização de Numeração Fiscal (NF-e 55 e NFC-e 65), Endpoints do Prompt 6.4 e Validação de Grafia Fiscal:

1. **Correção de Grafia e Parâmetros em `config_emissao_fiscal`:**
   - Confirmada a integridade e grafia correta do campo `emitir_nfe_ao_enviar_transferencia` (Migration 0050), garantindo ausência de grafias incorretas ("envizar") em todo o banco e no código do sistema.
   - Parâmetros `emitir_nfe_ao_enviar_transferencia` e `emitir_nfe_ao_devolver_venda` em conformidade na configuração fiscal por empresa.

2. **Tela Fiscal > Inutilização (`/fiscal/inutilizacao` - `InutilizacaoPage.tsx`):**
   - **Controle de Acesso Estrito:** Acesso condicionado exclusivamente a Administrador do ERP (`perfis_acesso.administrador = true` via usuário logado — nunca por e-mail fixo). Usuários não administradores recebem tela amigável de Acesso Negado.
   - **Item no Menu Lateral:** Adicionado item "Inutilização" com ícone `FileX2` no grupo "Fiscal" do menu lateral (`Sidebar.tsx`), visível somente para administradores (`adminOnly: true`).
   - **Formulário de Homologação:**
     - Seleção do modelo fiscal: `55` (NF-e) ou `65` (NFC-e).
     - Série da nota (pré-preenchida automaticamente com a série padrão da empresa ativa cadastrada em `config_emissao_fiscal`).
     - Faixa numérica: número inicial e número final (com suporte a número único repetindo o valor).
     - Justificativa legal com validação de no mínimo 15 caracteres (exigência mandatória da SEFAZ) e contador dinâmico de caracteres.
     - Empresa ativa em contexto: numeração e séries independentes por CNPJ de cada filial/estabelecimento.
     - Acionamento do serviço backend `/backend/v1/fiscal/inutilizar` (`inutilizarNumeracaoFiscal`).
   - **Histórico e Baixa de XML:**
     - Tabela detalhada de inutilizações da empresa ativa consumindo a tabela `inutilizacoes` (ordenada por data decrescente).
     - Colunas: Data, Modelo (NF-e / NFC-e), Série, Faixa de Números, Justificativa, Situação com badge, Protocolo da SEFAZ, Usuário solicitante e botão para download do XML do evento homologado.
     - Gravação persistente e download do XML de homologação diretamente pelo serviço de arquivos do PocketBase (`pb.files.getURL`).
   - **Orientações Didáticas e Legais:**
     - Alerta explicativo em destaque na tela: _"Inutilizar serve para números que foram pulados e nunca chegaram a ser autorizados. Nota rejeitada pode ser reenviada com a mesma referência e não precisa ser inutilizada."_

3. **Endpoints Fiscais do Prompt 6.4 Documentados:**
   - `POST /backend/v1/fiscal/emitir-nfe-devolucao-compra`: montagem, validação, amarração de chave referenciada e transmissão de NF-e (modelo 55, finalidade 4 Devolução) a partir de notas de entrada lançadas, atualizando `quantidade_devolvida` em `notas_entrada_itens` e movimentando o estoque na origem `DEVOLUCAO_COMPRA`.
   - `POST /backend/v1/fiscal/confirmar-autorizacao-devolucao-compra`: confirmação de autorização síncrona/assíncrona da NF-e de devolução com persistência de número, série, chave de 44 dígitos, protocolo e download do XML autorizado.
   - `POST /backend/v1/fiscal/emitir-nfe-transferencia`: emissão de NF-e de transferência interestadual ou interna entre filiais a partir do envio da remessa, com amarração de `transferencia_id` e origem "Transferência" em `documentos_fiscais`.
   - `POST /backend/v1/fiscal/inutilizar`: endpoint central que recebe a solicitação de inutilização, autentica a empresa ativa, chama a API v2 da Focus NFe (`POST /v2/nfe/inutilizacao` ou `/v2/nfce/inutilizacao`), registra na tabela `inutilizacoes`, baixa o XML do evento homologado e retorna protocolo e status.

---

**Versão 0.0.76** — Emissão de NF-e (Modelo 55), Intermediadores de Marketplace, Acompanhamento SEFAZ, DANFE/XML, E-mail, Cancelamento 24h e Carta de Correção (CC-e):

1. **Emissão de NF-e (Modelo 55) no Detalhe da Venda (`VendaFormPage.tsx` e `ModalEmitirNFe.tsx`):**
   - Disponibilização do botão **"Emitir NF-e"** no detalhe de vendas Finalizadas (tipo Pedido ou PDV sem NFC-e), condicionado à permissão de criação/edição em `notas_saida`.
   - **Regra da Empresa Emitente:** A NF-e sai SEMPRE pela empresa da venda (`venda.empresa_id`), utilizando o token Focus NFe do Skip Cloud, ambiente (Produção/Homologação) e série cadastrados para aquela filial — nunca a matriz nem a empresa ativa no navegador.
   - **Janela de Conferência e Parâmetros (`ModalEmitirNFe.tsx` com 4 abas):**
     - Aba 1 ("Operação & Destino"): Natureza da operação configurável com leitura e sugestão padrão a partir de `config_emissao_fiscal.natureza_operacao_venda` ("Venda de mercadoria"); Presença do comprador (`presenca_comprador`: 1 presencial, 2 internet, 3 teleatendimento, 4 entrega em domicílio, 9 outros, herdada de `config_emissao_fiscal.presenca_comprador_padrao_nfe`); Local de destino automático (1 operação interna, 2 interestadual com UF emitente da empresa, 3 exterior); Consumidor final automático (1 consumidor final para PF ou não contribuinte com IE Isento/9, ou 0 contribuinte); Informações complementares padrão concatenadas com as observações da venda; Fatura e duplicatas integradas a partir de `contas_receber`.
     - Aba 2 ("Transporte"): Modalidade de frete CIF/FOB/próprio/sem frete (0, 1, 2, 3, 4, 9); escolha de transportadora vinculada a fornecedores ativos do tipo Transportadora (`listarTodosFornecedoresAtivos('Transportadora')`); quantidade, espécie, peso bruto e líquido dos volumes.
     - Aba 3 ("Intermediador"): Seleção obrigatória em vendas não presenciais (2, 3 ou 9) entre "Site ou app próprio (sem intermediador, indIntermed = 0)" ou "Marketplace / plataforma de terceiros (indIntermed = 1)". Vinculação de `intermediador_id`, identificador do pedido na plataforma (`idCadIntTran`), gravação em `documentos_fiscais` e persistência de preferência no `localStorage` por filial.
     - Aba 4 ("Totais & Impostos"): Apuração tributária em tempo real (`/backend/v1/fiscal/montar-rascunho`), totais da NF-e, resumo dos tributos destacados (ICMS próprio, ICMS ST, IPI, PIS, COFINS, FCP) e destaque visual para **DIFAL** interestadual (ou aviso de DIFAL opcional desligado).

2. **Intermediadores de Vendas e Marketplaces (Tabela `intermediadores` e Migration 0049):**
   - Criação da tabela `intermediadores` (`nome`, `cnpj`, `ativo`) com carga inicial de grandes marketplaces brasileiros (Mercado Livre, Shopee, Amazon Marketplace e Magalu / Magazine Luiza).
   - Tela de gestão em **Fiscal > Intermediadores** (`/fiscal/intermediadores` - `IntermediadoresPage.tsx`) com listagem, busca, validação de CNPJ com máscara, alternância de situação ativo/inativo e modal de cadastro, integrada ao menu lateral (`Sidebar.tsx`) protegida pelo módulo `notas_saida`.
   - Seleção encadeada e persistente no modal de emissão de NF-e para atendimento das notas fiscais de e-commerce e vendas digitais.

3. **Acompanhamento Atômico da Emissão com a SEFAZ e Endpoints Backend:**
   - Endpoints transacionais e seguros no PocketBase:
     - `POST /backend/v1/fiscal/emitir-nfe-venda`: validação e transmissão da NF-e para a Focus NFe / SEFAZ com número, série e parâmetros da empresa da venda.
     - `POST /backend/v1/fiscal/consultar-situacao-nfe`: consulta de lote e sincronização do status na SEFAZ.
     - `POST /backend/v1/fiscal/cancelar-nfe`: cancelamento da NF-e na SEFAZ dentro do prazo de 24 horas.
     - `POST /backend/v1/fiscal/carta-correcao-nfe`: transmissão e homologação da Carta de Correção Eletrônica (CC-e).
     - `POST /backend/v1/fiscal/enviar-email-nfe`: agendamento de envio de DANFE e XML por e-mail ao cliente.
   - Acompanhamento síncrono logo após o envio: consulta automática a cada 3 segundos por até 30 segundos (10 tentativas) com contador visual regressivo na tela.
   - Ao mudar para "Autorizada": grava número, chave de 44 dígitos, protocolo, `danfe_url`, baixa o XML autorizado (`xml_arquivo`) e atualiza a venda para `documento_fiscal_status = "Autorizada"` de forma atômica no backend.
   - Rejeição: marca `status = "Rejeitada"` e exibe os motivos da SEFAZ sem travar a venda.
   - Denegação: marca `status = "Denegada"` com aviso claro de impedimento legal (nota denegada não pode ser reutilizada; orienta consulta cadastral do destinatário).
   - Passados os 30 segundos sem retorno final, a nota permanece como "Processando" e pode ser consultada a qualquer momento no botão **"Consultar situação"**.
   - Bloqueio mútuo e integridade fiscal: venda com NFC-e autorizada não pode emitir NF-e e venda com NF-e autorizada não pode emitir NFC-e (salvo cancelamento prévio da nota anterior).

4. **DANFE, XML e Envio por E-mail:**
   - Botões integrados no detalhe da venda autorizada (`VendaFormPage.tsx`):
     - **"Abrir DANFE"**: abre o PDF oficial gerado pela Focus NFe em nova aba.
     - **"Baixar XML"**: download direto do arquivo XML autorizado na SEFAZ (`xml_arquivo` ou via Focus).
     - **"Enviar por e-mail"** (`ModalEnviarEmailNFe.tsx`): modal com pré-preenchimento do e-mail do cliente, suporte a destinatários adicionais e envio agendado na Focus.
     - **"Consultar situação"**: reconsulta e ressincroniza o status da nota na SEFAZ a qualquer instante.

5. **Cancelamento da NF-e (24 Horas):**
   - Botão **"Cancelar NF-e"** (`ModalCancelarNFe.tsx`) com justificativa obrigatória de 15 a 255 caracteres e verificação de permissão `excluir` em `notas_saida`.
   - Transmissão do cancelamento para a SEFAZ, download e armazenamento do XML do evento (`xml_cancelamento`) e atualização de status para "Cancelada".
   - Verificação do prazo legal de 24 horas: aviso amigável orientando emissão de NF-e de Devolução caso o prazo da SEFAZ tenha expirado.

6. **Carta de Correção Eletrônica (CC-e) (Tabela `documentos_fiscais_cartas` e `ModalCartaCorrecao.tsx`):**
   - Criação da tabela `documentos_fiscais_cartas` para histórico cronológico das cartas de correção de cada NF-e autorizada (`sequencia`, `texto`, `data`, `status`, `protocolo`, `xml_arquivo`, `pdf_arquivo`, `pdf_url`).
   - Botão **"Carta de correção (CC-e)"** no detalhe da NF-e autorizada: modal com validação de 15 a 1000 caracteres, alerta explícito das restrições legais (vedado alterar valores, impostos, dados de destinatário/remetente ou datas), histórico visual de cartas anteriores e botões para download do XML e PDF da CC-e.

---

**Versão 0.0.75** — Emissão de NFC-e (Modelo 65) nas Vendas do PDV, Contingência Offline, Bobina 80mm, Cancelamento na SEFAZ e Emissão Manual:

1. **Campo `emite_nfce` em `config_emissao_fiscal` (Migration 0048):**
   - Criação do campo booleano `emite_nfce` (padrão false) na tabela `config_emissao_fiscal`.
   - Somente estabelecimentos com `emite_nfce = true` emitem NFC-e no terminal de PDV e visualizam os avisos de CSC e o campo `emitir_nfce_automaticamente_no_pdv` na tela de Configuração de Emissão Fiscal (`/fiscal/configuracoes`).
   - Filiais ou matrizes sem emissão de NFC-e mantêm `emite_nfce = false`, ocultando avisos desnecessários de CSC.

2. **Serviço Backend Central de Emissão de NFC-e (`pocketbase/hooks/fiscal_nfce_operacoes.js`):**
   - Endpoints transacionais e seguros:
     - `POST /backend/v1/fiscal/emitir-nfce-venda`
     - `POST /backend/v1/fiscal/cancelar-nfce-venda`
   - **Regra de Filial e Token:** A NFC-e é transmitida obrigatoriamente pela `empresa_id` da venda (o estabelecimento físico onde está o terminal de caixa), utilizando o token, série e CSC cadastrados para aquela loja no Skip Cloud — nunca a matriz nem a empresa selecionada no navegador.
   - **Validação Pré-emissão:** Verifica se a loja possui `emite_nfce = true` e `csc_configurado = true`. Se o CSC não estiver configurado, recusa a chamada com mensagem clara: `"CSC da NFC-e não configurado para esta loja"`.
   - **Montagem do Payload Focus NFe:** Presença do comprador `1` (presencial), modalidade de frete `9` (sem frete), local de destino `1`, consumidor final `1`, formas de pagamento mapeadas via `formas_pagamento.codigo_tpag`, informações de cartão (bandeira e autorização) e troco informado no cabeçalho quando houver.
   - **Autorização e Atualização Backend:** Quando autorizada pela SEFAZ, o backend preenche número, série, chave de 44 dígitos, protocolo, `qrcode_url`, `url_consulta`, `danfe_url`, baixa o XML autorizado e grava em `xml_arquivo` de `documentos_fiscais`, e atualiza a venda de forma atômica com `documento_fiscal_status = "Autorizada"` e `documento_fiscal_id` (preservando o bloqueio das API Rules para o navegador).
   - **Rejeição Controlada:** Quando rejeitada, registra os motivos da SEFAZ em `documentos_fiscais`, atualiza a venda para `documento_fiscal_status = "Rejeitada"` e NÃO desfaz a venda no caixa (o operador pode continuar vendendo).

3. **Contingência Offline Automática:**
   - Em caso de falha de conexão com a SEFAZ ou indisponibilidade reportada pela Focus NFe (timeouts, HTTP 500/503/504 ou mensagens indicando SEFAZ fora do ar), o sistema reenvia automaticamente com parâmetro `forma_emissao=offline` e marca `contingencia = true`.
   - A venda é autorizada em contingência e o DANFCe impresso com a indicação correspondente da Focus.

4. **Impressão em Bobina Térmica 80mm:**
   - No PDV, com NFC-e autorizada, é disparada a impressão do DANFCe oficial da Focus (`danfe_url`) no lugar do comprovante não fiscal.
   - Caso a NFC-e seja rejeitada ou não configurada, é impresso o comprovante não fiscal habitual de 80mm com a observação `"NFC-e pendente"`.
   - Botão **"Reimprimir DANFCe"** disponibilizado na tela de detalhe da venda finalizada (`/vendas/pedidos/:id`).

5. **Cancelamento Fiscal na SEFAZ e Regras de Negócio:**
   - Botão **"Cancelar NFC-e"** no detalhe da venda com NFC-e autorizada (exige permissão `excluir` no módulo `notas_saida` e justificativa obrigatória de 15 a 255 caracteres).
   - Chamar `DELETE /nfce/{ref}` na Focus; autorizado o cancelamento pela SEFAZ, baixa o XML de evento de cancelamento (`xml_cancelamento`), marca o documento como `"Cancelada"` e atualiza a venda com `documento_fiscal_status = "Cancelada"`.
   - Opção integrada **"Cancelar NFC-e e a venda"**: cancela a nota fiscal na SEFAZ e, em seguida, estorna a venda, estoque e financeiro no ERP.
   - Se o prazo legal de cancelamento estipulado pelo estado expirou, exibe aviso amigável da SEFAZ com orientação para emissão de Devolução de Venda.
   - Reforço no serviço central `cancelarVenda`: bloqueia cancelamento direto caso a venda tenha NFC-e/NF-e "Autorizada", exigindo o cancelamento prévio na SEFAZ.

6. **Emissão Manual:**
   - Para vendas de PDV finalizadas sem nota fiscal ou com status "Rejeitada", botão **"Emitir NFC-e"** disponibilizado no detalhe da venda (`VendaFormPage.tsx`).

---

**Versão 0.0.74** — Correção do Endpoint de Teste de Conexão com Focus NFe e Codificação Base64 no Backend:

1. **Correção do Hook de Integração Focus NFe (`pocketbase/hooks/fiscal_focus_integracao.js`):**
   - **Codificação Base64 Compatível:** Substituição de `$security.base64Encode` (inexistente no JSVM do PocketBase) por função de codificação Base64 pura compatível com Goja (`Buffer.from` com fallback universal em JavaScript) declarada no escopo interno dos callbacks (`routerAdd`).
   - **Resiliência e Retorno Amigável de Erros (200 com Objeto de Resultado):**
     - O endpoint `/backend/v1/fiscal/testar-conexao` nunca mais retorna HTTP 400 genérico sem mensagem explicativa.
     - Quando o token/segredo do ambiente não estiver configurado no Skip Cloud (`FOCUS_NFE_TOKEN_HOMOLOGACAO_*` ou `FOCUS_NFE_TOKEN_PRODUCAO_*`), empresa não existir ou a configuração fiscal estiver desativada/ausente, a resposta é HTTP 200 com `{ sucesso: false, message: "..." }` orientando com clareza o que verificar/criar.
     - Persistência imediata do resultado do teste (`ultimo_teste_conexao_data`, `ultimo_teste_conexao_sucesso`, `ultimo_teste_conexao_mensagem`) na tabela `config_emissao_fiscal`.
     - Tratamento defensivo em todas as chamadas HTTP à API da Focus NFe (timeouts, códigos HTTP 401, 4xx, 5xx).

2. **Frontend Resiliente (`src/services/fiscalIntegracao.ts` e `src/pages/fiscal/ConfiguracaoEmissaoFiscalPage.tsx`):**
   - `testarConexaoFocus` captura com segurança respostas de erro da API ou do cliente sem quebrar nem propagar exceções não tratadas.
   - `handleTestarConexao` atualiza o card de resultado e exibe aviso amigável ao usuário sem derrubar a tela.

---

**Versão 0.0.73** — Emissão Fiscal (Etapa 6: Tabelas `documentos_fiscais` e `documentos_fiscais_itens`, Serviço de Montagem de Impostos com Rateio, DIFAL e Pré-visualização de Nota Fiscal):

1. **Novas Tabelas e Migrations (Migration 0047):**
   - Criação das tabelas `documentos_fiscais` e `documentos_fiscais_itens` com índices e integridade relacional.
   - **Regras de Acesso Blindadas:** SÓ LEITURA pelo navegador (`listRule` e `viewRule` com `@request.auth.id != ''`); inserção, atualização e exclusão completamente bloqueadas via SDK do cliente (`createRule: null`, `updateRule: null`, `deleteRule: null`), operadas exclusivamente via backend.
   - Adição do campo `calcular_difal_consumidor_final` (boolean, padrão false) na tabela `config_emissao_fiscal`.

2. **Serviço Central de Montagem e Cálculo de Documento Fiscal (`pocketbase/hooks/fiscal_documentos_operacoes.js`):**
   - Endpoint transacional `POST /backend/v1/fiscal/montar-rascunho`.
   - **Emitente por Documento:** Sempre `empresa_id` do documento (nunca a matriz ou a sessão ativa), checando CNPJ, IE, CRT, UF e código IBGE.
   - **Motor Tributário:** Seleciona o cenário do perfil (`VENDA_INTERNA_CONSUMIDOR`, `VENDA_INTERNA_CONTRIBUINTE`, `VENDA_INTERESTADUAL_CONSUMIDOR`, `VENDA_INTERESTADUAL_CONTRIBUINTE`).
   - **Rateio Proporcional:** Frete, seguro, outras despesas e desconto global são rateados proporcionalmente pelo valor bruto dos itens, acertando centavos no último item.
   - **Cálculo de Impostos por Item:**
     - Base do ICMS próprio com redução quando parametrizada.
     - Simples Nacional: CSOSN com cálculo de crédito da alíquota do Simples para CSOSN 101.
     - Substituição Tributária (ST) por MVA para CST/CSOSN 10, 30, 70, 201, 202, 203.
     - IPI, PIS e COFINS (Simples: CST da regra sem destacar valores).
     - Reforma Tributária (IBS e CBS) quando `informar_ibs_cbs = true`.
     - **DIFAL:** Quando `calcular_difal_consumidor_final = true` em venda interestadual a não contribuinte (indicador 9, local destino 2), calcula base única, alíquota interestadual (4%, 7% ou 12%), alíquota interna e FCP do destino da matriz `icms_aliquotas_uf`, partilha 100% destino. Quando desligado, gera aviso amarelo explicativo.
   - **Validações Pré-emissão:** Verifica NCM de 8 dígitos, coerência de CFOP (5xxx interno, 6xxx externo, 6107/6108 a consumidor), dados cadastrais do cliente e endereço com IBGE de 7 dígitos.
   - **Formato Focus NFe:** Monta payload plano oficial (`campos.focusnfe.com.br`) e grava na tabela `documentos_fiscais` com status "Rascunho".

3. **Pré-visualização da Nota Fiscal no Detalhe da Venda Finalizada:**
   - Botão **"Pré-visualizar nota fiscal"** exibido no detalhe de vendas com status "Finalizada" (`VendaFormPage.tsx`).
   - Modal somente leitura `<ModalPrevisualizarNota />` (`@/components/fiscal/ModalPrevisualizarNota.tsx`):
     - Destaque para emitente, destinatário, avisos e pendências impeditivas.
     - Aba de totais e impostos consolidados (ICMS, FCP, ST, IPI, PIS, COFINS, DIFAL).
     - Aba de itens com detalhe por linha (CFOP, CST/CSOSN, bases e valores calculados).
     - Aba do payload JSON oficial pronto para envio à Focus NFe.

---

**Versão 0.0.72** — Início da Emissão Fiscal (Etapa 6: Configuração de Emissão, Serviço Central de Integração Focus NFe e Validações por Empresa):

1. **Ativação do Menu "Fiscal" no ERP:**
   - Remoção do status "Em breve" no menu lateral (`Sidebar.tsx`), ativando o item raiz "Fiscal" com ícone de recibo e dois subitens:
     - **Configuração de emissão** (`/fiscal/configuracoes`): parametrização completa e monitoramento por empresa emissora.
     - **Documentos fiscais** (`/fiscal/documentos`): placeholder informativo da Etapa 6 anunciando os próximos passos de emissão e consulta de notas.
   - Ambos os subitens são governados pelo módulo de permissão existente `notas_saida` (`pode('notas_saida', 'ver')`).

2. **Tabela `config_emissao_fiscal` (Migration 0046):**
   - Criação da tabela mestre de configurações fiscais com índice único por `empresa_id` (`idx_config_emissao_fiscal_empresa`).
   - Parâmetros: `provedor` ("Focus NFe"), `emite_documentos_fiscais`, `codigo_token`, `presenca_comprador_padrao_nfe` (1 Presencial, 2 Internet, etc.), `ambiente` ("Homologação" ou "Produção"), `serie_nfe`, `serie_nfce`, `emitir_nfce_automaticamente_no_pdv`, naturezas de operação (venda, devolução compra/venda), `informacoes_complementares_padrao`, `enviar_email_cliente`, `certificado_validade`, `csc_configurado`, `informar_ibs_cbs`, `ultimo_teste_conexao_*`.
   - Inicialização padrão com `obterOuCriarConfigEmissaoFiscal`. Regras de acesso: leitura para quem tem acesso ao módulo `notas_saida`; gravação permitida exclusivamente a Administradores do ERP.

3. **Serviço Central Único de Integração Fiscal (`pocketbase/hooks/fiscal_focus_integracao.js`):**
   - Backend isolado como **único ponto de comunicação com a Focus NFe**; token NUNCA vai para o navegador.
   - Resolução dinâmica do token via `$os.getenv` por segredos nomeados: `FOCUS_NFE_TOKEN_HOMOLOGACAO_{codigo_token}` ou `FOCUS_NFE_TOKEN_PRODUCAO_{codigo_token}` (e nomes sem sufixo quando `codigo_token` for vazio).
   - A empresa emitente é sempre a `empresa_id` informada (nunca a matriz ou a empresa da sessão).
   - Bloqueio imediato sem chamada à Focus se a empresa não emitir ou possuir Inscrição Estadual vazia ou ISENTO.
   - Endpoints: `/backend/v1/fiscal/testar-conexao`, `/backend/v1/fiscal/emitir-nfce`, `/backend/v1/fiscal/emitir-nfe`, `/backend/v1/fiscal/consultar`, `/backend/v1/fiscal/cancelar`, `/backend/v1/fiscal/carta-correcao`, `/backend/v1/fiscal/inutilizar`, `/backend/v1/fiscal/baixar-arquivo` e `/backend/v1/fiscal/status-segredos`.

4. **Tela de Configuração de Emissão Fiscal (`/fiscal/configuracoes`):**
   - **Botão "Testar Conexão":** executa `GET /hooks` na Focus NFe com o token da empresa ativa e grava o resultado no banco.
   - **Avisos Proativos:** banner de alerta de Homologação ativo, aviso se CSC não estiver marcado, aviso preventivo de certificado digital vencendo em 30 dias ou já vencido.
   - **Troca de Ambiente para Produção:** modal modal de segurança exigindo digitação expressa de "PRODUÇÃO" e gravação em `logs_auditoria`.
   - **Quadro "Pronto para emitir?":** checklist automático dos dados obrigatórios da empresa ativa (CNPJ válido, IE não isenta, CRT, endereço completo com CEP, código de município IBGE de 7 dígitos, CNAE e e-mail fiscal), com atalho para correção cadastral.
   - **Quadro "Empresas emissoras":** tabela consolidada para o Administrador com todas as empresas do grupo, tipo, CNPJ, código do token, presença do segredo no Skip Cloud (sim/não sem exibir o valor), ambiente e último teste. Clicar na linha troca a empresa ativa e carrega sua configuração.
   - **Copiar Configuração:** botão para clonar parâmetros operacionais (séries, naturezas, opções e complementares) de outra empresa modelo, preservando isolados o código de token e as datas de certificado.

---

**Versão 0.0.70** — Fechamento Oficial da Etapa 5 do ERP (Trocas e Devoluções, Vales-Troca, Comissões de Vendas, Consultas Gerenciais com Curva ABC, DRE com CMV de Estoque e Dashboard de Vendas):

1. **Correções Estruturais e Alinhamento de Contratos no PDV (`/vendas/pdv`):**
   - **Contexto de Empresa:** Substituição da importação legada `useEmpresa` por `useEmpresaAtiva` e renomeação sistemática de todas as referências para `empresaAtiva`.
   - **Sessão de Caixa e Configurações Comerciais:**
     - Integração com `obterSessaoAbertaOperador(empresaAtiva.id, usuario.id)` de `@/services/caixa` (apuração de sessões no status 'Aberto').
     - Carregamento e instanciação com `obterOuCriarConfigVendasEmpresa(empresaAtiva.id)` de `@/services/configVendas`.
   - **Modais de Caixa Alinhados aos Componentes Oficiais:**
     - `ModalAbrirCaixa`: props padronizadas para `open`, `onOpenChange`, `empresaId` e `onSucesso`.
     - `ModalSangria`: props padronizadas para `open`, `onOpenChange`, `sessao`, `empresaNome` e `onSucesso`.
     - `ModalSuprimento`: props padronizadas para `open`, `onOpenChange`, `sessao` e `onSucesso`.
   - **Payload Plano de `salvarVenda` (`SalvarVendaInput`):**
     - Alinhamento do contrato do serviço central `salvarVenda`: payload plano com `empresa_id`, `tipo: 'PDV'`, `cliente_id`, `cpf_cnpj_consumidor`, `vendedor_id`, `operador_id`, `valor_desconto_total` e `itens` tipados com `ItemVendaInput`.
   - **Assinatura Real de `finalizarVenda`:**
     - Envio direto de `{ venda_id: vendaSalva.id, pagamentos: [...] }` tipados com `PagamentoVendaInput`, eliminando campos de terminal/sessão que não pertencem ao contrato do método.
   - **Tipagem e Impressão Térmica 80mm:**
     - Eliminação da tipagem inexistente `VendaCompleta` em favor de `Venda`, `VendaItem` e `VendaPagamento` exportados de `@/services/vendas`.
     - Estruturação completa de `DadosImpressaoVenda` com dados cadastrais de `empresaAtiva` (razão social, nome fantasia, CNPJ, telefone, email, logradouro, número, bairro, cidade, UF), cliente, vendedor e `mensagemRodape`, acionando `imprimirComprovanteNaoFiscal`.

2. **Tela de Operação Rápida do PDV (`/vendas/pdv`):**
   - **Layout em Tela Cheia:** Topo com dados da empresa ativa, terminal vinculado, operador logado, sessão aberta de caixa e relógio digital contínuo.
   - **Campo de Leitura Universal com Auto-Foco:** Suporte a código de barras, código interno e notação de quantidade rápida `quantidade*código`.
   - **Etiqueta de Balança EAN-13:** Decodificação configurada por prefixo (`balanca_prefixo`), extração de código e identificação de peso/preço.
   - **Atalhos Operacionais (F2 a F12):** F2 (busca de produtos), F3 (cliente/CPF), F4 (quantidade), F5 (vendedor), F6 (desconto no item), F7 (desconto total), F8 (cancelar item com auditoria `CANCELAR_ITEM_PDV`), F9 (sangria/suprimento), F10 (pagamento/finalização), F12 (cancelamento da venda com auditoria `CANCELAR_VENDA_PDV_EM_ANDAMENTO`).
   - **Finalização de Pagamentos:** Modal com formas numeradas, troco dinâmico em dinheiro, cartões de débito/crédito, chave PIX manual e crediário com consulta a `creditoCliente`.
   - **Comprovante Térmico 80mm:** Emissão direta com aviso obrigatório 'NÃO É DOCUMENTO FISCAL'.
   - **Cache de Produtos (5 min) e Rascunho:** Carregamento local do catálogo em memória, persistência de venda em andamento no `localStorage` e aviso de desconexão de rede (bloqueio de venda offline).

---

**Versão 0.0.66** — Frente de Caixa Completa (PDV), Integração com Balança de Checkout (EAN-13), Módulo de Permissão `pdv`, Atalhos de Teclado, Resiliência Offline e Rascunho de Venda:

1. **Tela de Operação Rápida do PDV (`/vendas/pdv`):**
   - **Módulo de Permissão:** Criado e protegido pelo módulo `pdv` (`pode('pdv', 'ver')`). Integrado no menu lateral (Vendas > PDV) e nas rotas protegidas em `App.tsx`.
   - **Interface em Tela Cheia:** Desenvolvida para operação contínua sem mouse, compatível com monitor touch e modo fullscreen nativo do navegador via tecla ou botão superior.
   - **Layout Ergonômico de Caixa:**
     - **Topo:** Identificação da empresa/filial, nome do terminal (`pdv_terminais`), operador logado, sessão aberta de caixa (`caixa_sessoes`) com atalho para abertura rápida se fechado, status de conectividade em tempo real (Online / Offline) e relógio contínuo digital.
     - **Coluna Esquerda (Grade de Itens):** Lista rolável de itens com numeração sequencial (1 a N), código interno, descrição, quantidade com unidade, preço unitário, desconto por item e valor total. Destaque no rodapé para o **último item bipado** com foto do produto ampliada, quantidade e subtotal.
     - **Coluna Direita (Totais e Atalhos):** Painel de valor total em destaque gigante com contraste visual, quantidade acumulada de itens e unidades, cliente vinculado (F3), vendedor atribuído (F5), campo de leitura rápida e painel de atalhos de teclado.
     - **Campo de Leitura Universal (Sempre com Foco):** Reconhece leitura de código de barras padrão, código numérico interno, referência de fábrica e notação rápida de quantidade com multiplicação `quantidade*código` (ex.: `3*7891000000014` ou `2.5*101`).

2. **Integração com Balança de Checkout (EAN-13 - Migration 0043):**
   - **Campos em `config_vendas_empresa`:** `balanca_ativa` (boolean), `balanca_prefixo` (string, padrão "2"), `balanca_tipo` ("Preço" | "Peso"), `balanca_posicao_codigo` (início 2, 1-based) e `balanca_tamanho_codigo` (tamanho 5).
   - **Serviço Decodificador de Balança (`src/services/balanca.ts`):**
     - Identifica etiquetas de pesagem com 13 dígitos que iniciam com o prefixo configurado.
     - Extrai o código do produto na posição configurada e busca no catálogo em memória.
     - Extrai valor ou peso das posições 8 a 12 (índices 7 a 11): se etiqueta por **Preço**, divide por 100 para obter o valor em reais e calcula a quantidade em kg dividindo pelo preço unitário do produto cadastrado; se etiqueta por **Peso**, divide por 1000 para apurar o peso exato em kg.

3. **Grade Completa de Atalhos de Teclado:**
   - **F2 (Buscar Produto):** Abre modal de busca textual (`ModalBuscaProdutoPDV`) com pesquisa dinâmica por descrição, GTIN, código interno ou referência, navegação com setas do teclado (↑ e ↓) e seleção com Enter.
   - **F3 (Cliente):** Identificação de cliente cadastrado ou digitação de CPF/CNPJ direto para constar no cupom não fiscal/fiscal (`ModalClientePDV`), com atalho para cadastro rápido.
   - **F4 (Alterar Quantidade):** Modifica a quantidade do último item bipado (`ModalQuantidadeItemPDV`).
   - **F5 (Vendedor):** Seleciona vendedor responsável pela comissão/atendimento (`ModalVendedorPDV`).
   - **F6 (Desconto no Item):** Aplica desconto em valor (R$) ou percentual (%) no último item adicionado (`ModalDescontoItemPDV`).
   - **F7 (Desconto no Total):** Aplica abatimento global na venda em valor ou percentual (`ModalDescontoTotalPDV`).
   - **F8 (Cancelar Item):** Solicita o número sequencial do item e motivo do cancelamento (`ModalCancelarItemPDV`). Registrado formalmente em `logs_auditoria` com prevenção de perdas e detalhamento do item descartado.
   - **F9 (Sangria e Suprimento):** Acesso direto às janelas de movimentação de numerário da sessão de caixa (`ModalSangria` e `ModalSuprimento`).
   - **F10 (Finalizar Venda):** Abre modal de pagamento com formas numeradas.
   - **F12 (Cancelar Venda em Andamento):** Cancelamento completo com confirmação e gravação em `logs_auditoria`.
   - **Esc:** Fecha qualquer modal secundário e devolve o foco imediatamente para o campo de leitura.

4. **Finalização de Pagamento e Impressão (F10 - `ModalPagamentoPDV.tsx`):**
   - **Formas de Pagamento Numeradas:** Botões rápidos (1 Dinheiro, 2 PIX, 3 Débito, 4 Crédito, 5 Crediário...), com atalho numérico `Alt + 1..9`. Digitação do valor com Enter para lançar múltiplos pagamentos parciais até zerar o restante.
   - **Dinheiro e Troco:** Cálculo automático e destaque em tamanho grande do troco a devolver ao cliente quando o valor em dinheiro superar o total devido.
   - **Cartão de Crédito e Débito:** Seleção de número de parcelas (respeitando faixas de taxas da operadora) e digitação opcional de bandeira, NSU e código de autorização.
   - **PIX:** Exibição imediata da chave PIX cadastrada na conta financeira da loja e confirmação manual obrigatória de recebimento pelo operador.
   - **Crediário / Venda a Prazo:** Exigência mandatória de cliente cadastrado com consulta automática via `creditoCliente` para verificar limite disponível, inadimplência e bloqueio.
   - **Integração com Serviço Central:** Disparo atômico de `salvarVenda` e `finalizarVenda` via hook backend `/backend/v1/vendas/finalizar` (baixa de estoque FEFO, lançamento financeiro e conciliação de caixa).
   - **Impressão Não Fiscal 80mm:** Emissão direta via `imprimirComprovanteNaoFiscal` no formato de bobina térmica 80mm com CSS `@media print`: dados da empresa, número da venda, operador, itens, totais, formas de pagamento, troco, mensagem de rodapé e aviso obrigatório 'NÃO É DOCUMENTO FISCAL'.

5. **Desempenho, Segurança e Resiliência:**
   - **Catálogo em Memória (Cache Local):** Carregamento síncrono e em background dos produtos ativos (código, GTIN, descrição, preço, unidade e saldo) com renovação a cada 5 minutos via `carregarCatalogoProdutosPDV`, permitindo leitura instantânea sem requisições HTTP adicionais por item.
   - **Rascunho no Navegador:** Venda em andamento gravada no `localStorage`. Ao reabrir ou recarregar o PDV, o sistema pergunta ao operador se deseja continuar a venda anterior ou iniciar uma nova.
   - **Bloqueio de Venda Offline:** Monitoramento de `navigator.onLine` com alerta visual; se a internet cair, o PDV avisa o operador e bloqueia a finalização até a rede restabelecer, impedindo inconsistência no banco de dados.

---

**Versão 0.0.65** — Conclusão da Tela de Orçamentos e Pedidos de Venda, Histórico nas Abas de Cliente e Produto, e Impressão de Documentos Não Fiscais:

1. **Correção do Build e Estabilidade de Compilação:**
   - Correção de erro de sintaxe em `src/pages/vendas/pedidos/VendasListaPage.tsx` na paginação (`setPagina((p) => p + 1)`).
   - Homologação completa de compilação sem avisos ou erros em TypeScript e Vite build.

2. **Tela de Vendas > Orçamentos e Pedidos (`/vendas/pedidos`):**
   - **Listagem Analítica (`VendasListaPage.tsx`):** visualização paginada das vendas/orçamentos com filtros combinados (período de emissão, status 'Orçamento' | 'Pedido em aberto' | 'Finalizada' | 'Cancelada', tipo 'Orçamento' | 'Pedido' | 'PDV', cliente e vendedor), badges de status e documento fiscal, totalizadores de quantidade e valor em tempo real.
   - **Ações Rápidas por Registro:** visualização/edição, duplicar venda/orçamento, impressão de orçamento/pedido em PDF/HTML, impressão de comprovante não fiscal (térmica 80mm/58mm), compartilhamento via WhatsApp com texto formatado e acionamento dos modais de finalização e cancelamento.
   - **Formulário Completo de Venda (`VendaFormPage.tsx`):**
     - Cabeçalho: tipo da venda (Orçamento ou Pedido), número sequencial por empresa, cliente (com suporte a busca rápida de cliente e cadastro rápido), vendedor responsável, condição de pagamento e lista de preços.
     - Grade de Itens: bipagem via leitor de código de barras ou busca por GTIN/descrição (`BuscaProdutoGtin`), cálculo automático de preços, descontos com respeito ao limite do usuário/produto e acionamento de autorização de supervisor (`ModalAutorizacaoSupervisor`).
     - Totais e Descontos: subtotal de produtos, desconto em valor/percentual, acréscimos e frete rateados.
     - Formas de Pagamento e Condição: cálculo de parcelas com base na condição de pagamento, suporte a múltiplas formas de pagamento no fechamento e conferência de troco para dinheiro.
   - **Modais Transacionais Centrais:**
     - `ModalFinalizarVenda.tsx`: validação de pagamentos com troco, acionamento do endpoint atômico do backend (`/backend/v1/vendas/finalizar`), baixa de estoque por FEFO, geração de títulos a receber ou débito em caixa, e emissão de comprovante.
     - `ModalCancelarVenda.tsx`: cancelamento rastreado com justificativa obrigatória, estorno atômico de estoque e cancelamento dos títulos a receber gerados.

3. **Histórico de Vendas no Cadastro do Cliente (`ClienteForm.tsx`):**
   - Nova aba dedicada **"Vendas"** no formulário do cliente (`ClienteForm.tsx`), consumindo `obterHistoricoVendasCliente` de `src/services/vendas.ts`.
   - Cards com **Resumo de Compras por Ano**: agrupamento do total faturado e quantidade de vendas por ano, além do totalizador geral do cliente.
   - Tabela detalhada das **Últimas Vendas**: número sequencial, data de emissão, tipo, status analítico, valor total formatado e atalho direto para a venda (`/vendas/pedidos/:id`).

4. **Histórico de Saídas por Venda no Cadastro do Produto (`ProdutoForm.tsx`):**
   - Nova aba dedicada **"Vendas"** no formulário do produto (`ProdutoForm.tsx`), consumindo `obterHistoricoSaidasProduto` de `src/services/vendas.ts`.
   - Listagem cronológica das últimas saídas do produto vinculadas a vendas finalizadas na empresa ativa.
   - Exibição de: data da venda, número do pedido/venda, cliente destinatário, quantidade na unidade de estoque, preço unitário praticado, valor total da linha e atalho direto para a venda.

5. **Serviço de Impressão e Compartilhamento (`src/services/vendasImpressao.ts`):**
   - Layout de impressão formatado A4 para Orçamento / Pedido de Venda.
   - Layout de impressão para Comprovante Não Fiscal térmico (80mm e 58mm).
   - Gerador de mensagem formatada para envio direto por WhatsApp Web / API (`https://wa.me/...`).

---

**Versão 0.0.63** — Controle de Caixa e Sessões de Frente de Caixa (Migration 0042):

- Criação das tabelas `caixa_sessoes` e `caixa_sessoes_movimentos` com suporte a abertura, conferência, fechamento cego (`fechamento_cego`), suprimento, sangria e emissão de comprovante/PDF de fechamento.
- Proteção de regras pelo módulo de permissão `caixa`.

---

**Versão 0.0.61** — Reforço de Segurança na API Rule de Update da Tabela `vendas` (Migration 0041):

1. **Ajuste Cirúrgico na Regra de Update de `vendas`:**
   - Mantida a proteção original impedindo edição pelo navegador quando o registro já estiver em status 'Finalizada' ou 'Cancelada' (`status != 'Finalizada' && status != 'Cancelada'`).
   - Bloqueio de alteração direta via navegador do status para 'Finalizada' ou 'Cancelada' através de verificação em `@request.body.status` (`@request.body.status = '' || (@request.body.status != 'Finalizada' && @request.body.status != 'Cancelada')`).
   - Bloqueio estrito de envio de valores pelo navegador para os campos sensíveis que devem ser gerenciados exclusivamente pelo serviço central de vendas do backend: `documento_fiscal_status`, `custo_total`, `data_finalizacao` e `caixa_sessao_id` (`@request.body.<campo> = ''`).
   - Nenhuma alteração nas demais regras (list, view, create, delete) de `vendas` nem em qualquer outra coleção do ERP.

---

**Versão 0.0.59** — Fechamento da Base de Vendas e PDV (Serviço Central Transacional, API Rules Fechadas e Integração de Estoque e Financeiro):

1. **Estrutura de Banco de Dados da Base de Vendas (Migration 0040):**
   - Criação das 3 tabelas nucleares de vendas comerciais e frente de caixa:
     - `vendas`: cabeçalho analítico por filial, numeração sequencial por empresa, tipos ('Orçamento' | 'Pedido' | 'PDV'), status analíticos ('Orçamento' | 'Pedido em aberto' | 'Finalizada' | 'Cancelada' | 'Orçamento expirado'), totalizadores monetários, campos de terminal, turno de caixa, consumidor e rastro de cancelamento.
     - `vendas_itens`: itens com quantidade, preços de tabela e praticado, descontos, acréscimos, custos de saída apurados via FEFO, rastro de lote e campos fiscais completos (NCM, CEST, CFOP, CST/CSOSN, alíquotas).
     - `vendas_pagamentos`: conciliação analítica das formas de pagamento (dinheiro com troco, cartões com taxas e prazos, crediário com vínculo a títulos a receber).
   - **Fechamento de API Rules (Segurança Rígida):**
     - `vendas_pagamentos`: `createRule: null`, `updateRule: null`, `deleteRule: null` (100% blindada contra gravação direta pelo navegador).
     - `vendas`: update e delete bloqueados via SDK do cliente quando status for 'Finalizada' ou 'Cancelada'.
     - `vendas_itens`: criação, alteração e exclusão bloqueadas se a venda pai estiver 'Finalizada' ou 'Cancelada'.

2. **Serviço Central Transacional de Vendas (`pocketbase/hooks/vendas_operacoes.js` e `src/services/vendas.ts`):**
   - Implementação de endpoints atômicos no servidor PocketBase:
     - `POST /backend/v1/vendas/finalizar`: validação matemática rigorosa entre pagamentos e total da venda, recusa de finalização sem itens, validação de crédito via `creditoCliente` para crediário/a prazo, saída de estoque atômica com FEFO automático no Kardex (`estoque_movimentos` com origem `VENDA` e lote específico), crédito imediato em caixa para dinheiro, geração de títulos a receber contra operadora para cartões e parcelas em `contas_receber` para crediário, gravação protegida de `vendas_pagamentos` e atualização para 'Finalizada' com auditoria.
     - `POST /backend/v1/vendas/cancelar`: validação de status 'Finalizada', bloqueio categórico caso parcelas a receber já possuam baixas ativas em `pagamentos_baixas`, cancelamento de títulos a receber, estorno de movimentações financeiras imediatas com origem 'ESTORNO', estorno de movimentos de estoque devolvendo saldo aos lotes específicos e atualização para 'Cancelada'.
   - Ajuste nas chamadas do frontend em `src/services/vendas.ts` para utilização do cliente centralizado `pb.send('/backend/v1/vendas/finalizar', ...)` e `pb.send('/backend/v1/vendas/cancelar', ...)`.

3. **Homologação e Estabilidade Operacional:**
   - Conferência de integridade de estoque e financeiro com conformidade das regras de negócio.
   - Navegação blindada através do `PermissaoGuard` resiliente sem bloqueios na inicialização e transições.
   - Zero telas prematuras de PDV ou emissão de NF-e (preservadas para as próximas etapas).

---

**Versão 0.0.56** — Preparação da Etapa 5 (Vendas e PDV — Configurações, Terminais, Taxas de Operadoras e Serviços de Desconto):

1. **Ativação do Menu "Vendas" e Mapeamento de Permissões:**
   - Menu lateral "Vendas e PDV" ativado (removido estado "Em breve"/desabilitado).
   - Subitem **Configurações de vendas** (`/vendas/configuracoes`): protegido pelo módulo de permissão existente `vendas` (`pode('vendas', 'ver')` e `pode('vendas', 'editar')`).
   - Subitem **Terminais** (`/vendas/terminais`): protegido pelo módulo de permissão existente `caixa` (`pode('caixa', 'ver')`, `pode('caixa', 'criar')` e `pode('caixa', 'editar')`).
   - Módulos pré-existentes da grade de permissões mantidos intactos (`vendas`, `pdv` e `caixa`).

2. **Configurações Comerciais e Frente de Caixa (`config_vendas_empresa` - Migration 0039):**
   - Criação da tabela `config_vendas_empresa` com índice único `empresa_id` e campos: `cliente_padrao_id`, `permite_vender_sem_estoque`, `exige_cliente_identificado_acima_de`, `bloquear_venda_prazo_cliente_bloqueado` (padrão true), `validade_orcamento_dias` (padrão 7), `dias_para_troca` (padrão 30), `mensagem_rodape_comprovante`, `plano_vendas_id`, `plano_taxas_cartao_id` (2.5.03), `plano_quebra_caixa_id` (2.8.01) e `plano_sobra_caixa_id` (1.3.01).
   - Serviço central `src/services/configVendas.ts` com funções `obterOuCriarConfigVendasEmpresa` e `salvarConfigVendasEmpresa`.
   - Inicialização e garantia automática do "Consumidor Final" em `clientes` (`obterOuCriarConsumidorFinal`): tipo pessoa Física, sem CPF, `indicador_ie = '9'` e `consumidor_final = true`.
   - Todas as inclusões e alterações gravam em `logs_auditoria`.
   - Tela `src/pages/vendas/ConfigVendasPage.tsx` com parametrização completa e feedback visual.

3. **Terminais de Caixa Físico (`pdv_terminais` - Migration 0039):**
   - Criação da tabela `pdv_terminais` com campos `empresa_id`, `nome`, `conta_financeira_id`, `conta_cofre_id` e `ativo`.
   - Validação mandatória no serviço `src/services/terminais.ts`: `conta_financeira_id` deve pertencer à mesma empresa e ser obrigatoriamente do tipo `"Caixa físico"`.
   - Tela `src/pages/vendas/TerminaisPage.tsx` no padrão do ERP: listagem, busca, filtros de situação, badges, alternância ativo/inativo e modal de cadastro.
   - Registro de regra futura no PROJETO_ERP.md: cada terminal terá controle de sessão única aberta de caixa.

4. **Operadoras de Cartão e Faixas de Taxas Escalonadas (`formas_pagamento_taxas` - Migration 0039):**
   - Adicionados campos em `formas_pagamento`: `operadora_cliente_id` (relation -> `clientes`) e `parcelado_pela_operadora` (boolean).
   - Nova tabela `formas_pagamento_taxas`: `forma_pagamento_id`, `parcelas_de`, `parcelas_ate`, `taxa_percentual`, `dias_para_recebimento`, `ativo` e auditoria.
   - Serviço `src/services/formasPagamento.ts` ampliado: `listarTaxasPorFormaPagamento`, `salvarFormaPagamentoTaxa`, `excluirFormaPagamentoTaxa` e `obterTaxaEPrazoFormaPagamento` (reutilizável: usa faixa quando compatível, senão recorre aos padrões da forma).
   - Tela `src/pages/financeiro/cadastros/FormasPagamentoPage.tsx` atualizada: exibe campos de operadora e faixas de taxas exclusivamente quando o tipo for "Cartão de crédito" ou "Cartão de débito", com botão "Criar cliente da operadora" (modal com cadastro rápido de Pessoa Jurídica com CNPJ opcional) e mini-grade interativa para inclusão/exclusão de faixas.

5. **Serviço Central e Reutilizável de Desconto e Autorização de Supervisor:**
   - Serviço `src/services/descontos.ts` implementando a função central:
     `validarDescontoItem({ descontoPercentual, produto, usuario })`
   - Regra do Menor dos Limites: apura o limite do usuário (`usuario.desconto_maximo_percentual`) e o do produto (`produto.desconto_maximo_percentual` e `produto.permite_desconto`). Se `produto.permite_desconto === false`, o limite é 0%. Caso contrário, o limite permitido é `Math.min(limiteUsuario, limiteProduto)`.
   - Função `autorizarDescontoSupervisor({ email, senha, descontoPercentual, ... })`: valida credenciais via auth nativo (`users.authWithPassword`), checa se o supervisor/administrador tem limite compatível e grava registro formal em `logs_auditoria` com valores, autorizador, operador e contexto da venda.
   - Modal reutilizável `<ModalAutorizacaoSupervisor />` (`@/components/ModalAutorizacaoSupervisor.tsx`) pronto para ser consumido pela tela de venda na próxima etapa.

---

**Versão 0.0.55** — Conclusão dos Ajustes Pré-Etapa 5 (Documentação dos Serviços Centrais Financeiros e Validação Integral do Contas a Receber):

1. **Documentação Rigorosa dos Serviços no PROJETO_ERP.md:**
   - Detalhamento completo do serviço `creditoCliente(clienteId, empresaId?)` de `src/services/contasReceber.ts`: especificação formal de todos os parâmetros (`clienteId`, `empresaId`), objeto completo de retorno (`total_aberto`, `total_vencido`, `maior_atraso_dias`, `limite_credito`, `credito_disponivel`, `dias_tolerancia`, `situacao` com `'Liberado'` | `'Atenção'` | `'Bloqueado'`, `motivos`), regra de tolerância via `config_financeira_empresa.dias_tolerancia_bloqueio` (padrão 5 dias) e o contrato obrigatório da Etapa 5 (Vendas e PDV) para validação, alerta e bloqueio de vendas a prazo.
   - Detalhamento completo do serviço `gerarTitulosFromParcelas(input)` de `src/services/geradorTitulos.ts`: tipagem de `GerarTitulosParcelasInput`, estrutura de gravação (exatamente um título por parcela em `contas_receber` ou `contas_pagar`, `numero_documento` formatado como `"${numero_documento_base}-${numParcela}"` e campo `parcela` como `"n/total"`, saldo inicial igual ao valor da parcela e status inicial `'Aberto'` para tipo `'Receber'`) e especificação exata de como os módulos de Vendas e PDV (Etapa 5) devem invocá-lo (`tipo: 'Receber'`, `origem: 'Venda' | 'PDV'`, `origem_id: idVenda`, `plano_conta_id` a partir de `config_financeira_empresa.plano_vendas_id`).
2. **Conferência Residual e Homologação de Status e Origens em Contas a Receber:**
   - Verificação exaustiva de código em todo o projeto: confirmado que não restou nenhum ponto gravando ou filtrando valores obsoletos (`'Em aberto'` ou `'Recebido parcial'`) para a coleção `contas_receber`. Todos os pontos usam `'Aberto'` e `'Parcial'`.
   - Confirmado que a origem `'PDV'` é aceita nativamente pelo tipo `OrigemContaReceber`, pelo schema de `contas_receber` e pela validação de `gerarTitulosFromParcelas`.
   - Verificação e homologação dos formulários e páginas (`ClienteForm.tsx`, `ContasReceberPage.tsx`, hooks transacionais `/financeiro/receber/baixar` e `/financeiro/receber/estornar-recebimento`).
3. **Validação de Compilação e QA:**
   - Execução completa do pipeline de QA (oxlint, TypeScript tsc, Vite build) com 100% de aprovação em todos os módulos e componentes do projeto.

---

**Versão 0.0.54** — Padronização de Status e Origens do Contas a Receber e Documentação da Etapa 4/5:

1. **Correção e Padronização do Status e Origem de `contas_receber` (Migration 0038):**
   - Correção dos valores permitidos no select `status` de `contas_receber`: padronizado para `['Aberto', 'Parcial', 'Recebido', 'Cancelado']` (o valor `'Em aberto'` pertencia ao padrão de `contas_pagar`, e `'Recebido parcial'` foi unificado como `'Parcial'`).
   - Inclusão da origem `'PDV'` no select `origem` de `contas_receber`: agora aceita `['Manual', 'Venda', 'PDV', 'Recorrência', 'Outro']`, preparando a integração nativa com o módulo de frente de caixa da Etapa 5.
   - Script de migração de dados na migration 0038: verificação e atualização dos registros existentes de `contas_receber` (`'Em aberto'` → `'Aberto'` e `'Recebido parcial'` → `'Parcial'`), com contagem prévia (confirmado 0 registros no banco de dados).
2. **Alinhamento dos Serviços e Telas do Frontend:**
   - `src/services/geradorTitulos.ts`: atualizado para gravar status inicial `'Aberto'` para títulos a receber e aceitar tipo de origem `'PDV'`.
   - `src/services/contasReceber.ts`: tipos `StatusContaReceber` e `OrigemContaReceber` alinhados com `Aberto` / `Parcial` e `PDV`; filtros e rotinas de salvamento/recorrência ajustados para usar `'Aberto'` e `'Parcial'`.
   - Hooks de backend (`/financeiro/receber/baixar` e `/financeiro/receber/estornar-recebimento`): atualizados para gravar e recompor o status `'Aberto'` e `'Parcial'`.
   - Telas `ContasReceberPage.tsx` e `ClienteForm.tsx`: filtros e badges atualizados para os valores oficiais `'Aberto'` e `'Parcial'`.
3. **Documentação dos Serviços Centrais Financeiros no PROJETO_ERP.md:**
   - Inclusão da especificação formal e detalhada dos serviços `creditoCliente(clienteId, empresaId?)` e `gerarTitulosFromParcelas(input)` na seção de serviços centrais financeiros da Etapa 4, com parâmetros, formato de retorno e contratos de chamada para a Etapa 5 (Vendas e PDV).
4. **Reconfirmação das Origens de Estoque:**
   - Reconfirmado que o select `origem` da tabela `estoque_movimentos` (migration 0021) já contempla `'VENDA'` e `'DEVOLUCAO_VENDA'`, o tipo TypeScript `OrigemMovimentoEstoque` as inclui e o hook `/estoque/movimentar` opera perfeitamente. Nenhuma alteração necessária no estoque.

---

**Versão 0.0.53** — Fechamento Oficial da Etapa 4 (Financeiro Completo):

1. **Ferramenta de Integridade Financeira (`/configuracoes/integridade-financeiro`):**
   - Criação da página `src/pages/configuracoes/IntegridadeFinanceiroPage.tsx` e serviço central `src/services/integridadeFinanceiro.ts`.
   - Acesso estritamente restrito a usuários com perfil de Administrador (`perfis_acesso.administrador = true`).
   - Botão "Verificar integridade" que executa as seguintes conferências contábeis e gera relatório de divergências (sem correção automática):
     - (a) Para cada conta financeira: `saldo_atual` confrontado com `saldo_inicial + entradas − saídas` das movimentações financeiras não estornadas.
     - (b) Para cada título de contas a pagar e contas a receber: `valor_pago` / `valor_recebido` e `saldo` confrontados com a soma das baixas não estornadas (`pagamentos_baixas`).
     - (c) Bloqueio de inconsistência: nenhum título com situação "Pago" ou "Recebido" pode apresentar saldo residual diferente de zero.
   - Apresentação em lista clara com Entidade, ID/Referência, Descrição, Valor Esperado, Valor Encontrado e Diferença; mensagem verde em destaque quando nenhuma divergência for encontrada.

2. **Cartões Financeiros e Mini Gráfico no Painel Geral (`Index.tsx`):**
   - Cartões clicáveis levando às listagens correspondentes já pré-filtradas:
     - "A pagar hoje" (leva a `/financeiro/pagar?situacao=abertos&dataInicio=HOJE&dataFim=HOJE`, visível com `financeiro_pagar`).
     - "A pagar vencido" (leva a `/financeiro/pagar?situacao=vencidos`, visível com `financeiro_pagar`).
     - "A receber hoje" (leva a `/financeiro/receber?situacao=abertos&dataInicio=HOJE&dataFim=HOJE`, visível com `financeiro_receber`).
     - "A receber vencido" (leva a `/financeiro/receber?situacao=vencidos`, visível com `financeiro_receber`).
     - "Saldo total das contas da empresa ativa" (leva a `/financeiro/bancos`, visível com `financeiro_bancos`).
   - Mini gráfico de fluxo de caixa dos próximos 30 dias renderizado via Recharts/ChartContainer consumindo `apurarFluxoCaixa` de `src/services/fluxoCaixa.ts`, visível exclusivamente para usuários com a permissão `financeiro_bancos`.

3. **Segurança de API Rules nas Tabelas de Baixas (Migration 0037):**
   - Criação e aplicação da migration `0037_fechar_regras_pagamentos_baixas_e_lotes.js`.
   - Regras de `createRule`, `updateRule` e `deleteRule` fechadas (null) para clientes diretos nas tabelas `pagamentos_lotes` e `pagamentos_baixas`.
   - Toda alteração e baixa financeira passa obrigatoriamente pelos hooks transacionais de backend do PocketBase.

---

**Versão 0.0.49** — Correção Definitiva do PermissaoGuard e Movimentação Bancária com Conciliação OFX (Etapa 4 — Financeiro):

1. **Correção Definitiva do PermissaoGuard e Resiliência de Sessão:**
   - Prevenção do auto-cancelamento do PocketBase SDK adicionando `{ requestKey: null }` em `obterUsuarioPorAuthId` e em todas as chamadas de permissões e perfis.
   - Hidratação resiliente com persistência da estrutura expandida completa com perfil no cache local (`erp_usuario_logado_cache`) no login e nos carregamentos.
   - Guard SWR: enquanto `pb.authStore.isValid`, o guard nunca renderiza spinner infinito, exibindo o conteúdo de imediato enquanto revalida em segundo plano; exibe tela de Acesso Negado apenas quando o perfil estiver estritamente carregado e sem a permissão requerida.
   - Rotas `/financeiro/receber`, `/estoque/kardex`, `/estoque/lancamentos`, `/compras/notas-entrada` e `/financeiro/cadastros/*` agora carregam sem travamentos.

2. **Novas Tabelas e Campos Financeiros (Migration 0035):**
   - Criação da tabela `extratos_linhas` com `empresa_id`, `conta_financeira_id`, `fitid` (índice único composto `conta_financeira_id + fitid`), `data`, `valor`, `descricao`, `situacao` ("Pendente", "Conciliada", "Ignorada"), `movimentos_ids`, `arquivo_importacao` e campos padrão.
   - Adição dos campos `conciliado`, `data_conciliacao`, `transferencia_id`, `lancamento_avulso`, `motivo_estorno`, `data_estorno` e `usuario_estorno_id` em `movimentacoes_financeiras`.

3. **Extrato Cronológico de Contas e Caixas (`/financeiro/bancos`):**
   - Rota `/financeiro/bancos` protegida pelo módulo `financeiro_bancos` com seletor de conta e período (mês atual como padrão).
   - Cards com Saldo Anterior (reconstruído com saldo inicial + movimentos anteriores), Entradas do Período, Saídas do Período, Saldo Final e comparativo de Saldo Conciliado vs. Saldo do Sistema com destaque visual de divergências.
   - Tabela cronológica com data, histórico, vínculos clicáveis com títulos (contas_pagar e contas_receber), selo de "Conciliado" e recomposição de saldo após cada lançamento.
   - Ações: Transferência entre contas, Lançamento avulso, Estorno de movimentos avulsos/transferências com motivo obrigatório e recomposição automática de saldos, Exportação CSV e Impressão limpa.
   - Atalho "Extrato" integrado nos cards da tela `ContasFinanceirasPage`.

4. **Transferência entre Contas e Lançamento Avulso (Serviço Central e Modais):**
   - Modal de Transferência (`<ModalTransferenciaContas />`) com validação de contas distintas, valor positivo, verificação de saldo disponível e respeito a `permite_saldo_negativo`.
   - Função central `transferir`: transação com dois registros ligados pelo mesmo `transferencia_id` (débito na origem e crédito no destino), atualização de `saldo_atual` em ambas as contas e logs de auditoria.
   - Modal de Lançamento Avulso (`<ModalLancamentoAvulso />`): conta, data, tipo (Entrada/Saída), plano de contas analítico, centro de custo opcional e histórico.
   - Função central `lancarAvulso`: gravação com `lancamento_avulso = true`, atualização de `saldo_atual` e auditoria.

5. **Conciliação Bancária com Leitura OFX (`/financeiro/conciliacao`):**
   - Parser OFX client-side compatível com extratos bancários brasileiros (leitura de tags BANKID, ACCTID, TRNTYPE, DTPOSTED, TRNAMT, FITID, MEMO).
   - Conferência de número de conta bancária contra a conta selecionada, bloqueio de FITID duplicado e gravação de linhas como "Pendente".
   - Casamento Automático: busca automática de movimentos não conciliados da mesma conta com mesmo valor e data em até 3 dias de diferença, incluindo soma de lotes (`lote_baixa_id`) ou transferências (`transferencia_id`).
   - Tela em duas colunas (Extrato do Banco x Movimentos do Sistema) para casamento manual com cálculo dinâmico de totais e validação estrita de igualdade de valores.
   - Botão "Criar lançamento": abre lançamento avulso pré-preenchido para linhas sem movimento (tarifas bancárias, rendimentos) e efetua o casamento imediato.
   - Ação "Desfazer conciliação" com retorno da linha para "Pendente" e movimento para não conciliado.

6. **Menu e Rotas:**
   - Adicionados subitens "Bancos e caixas" e "Conciliação" no grupo "Financeiro" da Sidebar, protegidos por `financeiro_bancos`.

---

**Versão 0.0.42** — Conclusão do Módulo de Contas a Pagar (Etapa 4 — Financeiro):

1. **Estrutura de Banco e Migrations (0032 e 0033):**
   - Criação das 4 tabelas centrais do financeiro transacional: `contas_pagar`, `pagamentos_lotes`, `pagamentos_baixas` e `movimentacoes_financeiras`, com índices por empresa, fornecedor, vencimento, status e origem.
   - API Rules de segurança impedindo alterações diretas nas tabelas de baixas e movimentações bancárias fora do serviço central.
   - Atualização da permissão do módulo `financeiro_pagar` com acesso total (ver, criar, editar, excluir) para os perfis Administrador, Gerente e Financeiro.
2. **Serviço Central Financeiro e Endpoints de Backend (`pocketbase/hooks/financeiro.pb.js` e `@/services/financeiro.ts`):**
   - `/financeiro/pagar/baixar`: baixa atômica de múltiplos títulos em lote ou individual, cálculo de juros, multas (pro rata die) e descontos, registro do lote e baixas analíticas, movimentação de saída nas contas financeiras e atualização de `saldo_atual`.
   - `/financeiro/pagar/estornar-baixa`: estorno rastreado com justificativa obrigatória, recomposição do saldo bancário através de movimentação de entrada ("ESTORNO") e reabertura do saldo devedor do título.
   - `/financeiro/pagar/gerar-titulos-retroativos`: utilitário administrativo para geração de títulos a pagar a partir de notas de entrada já lançadas anteriormente.
3. **Integração de Ponta a Ponta com Notas Fiscais de Entrada:**
   - Geração automática de títulos em `contas_pagar` por duplicata de `notas_entrada_parcelas` ao lançar notas.
   - Mapeamento automático de plano de contas por tipo de entrada via parametrização da filial ativa em `config_financeira_empresa`.
   - Regra de não geração para bonificações e devoluções.
   - Bloqueio rígido no cancelamento de notas quando houver títulos com baixas ativas de pagamento, orientando o estorno prévio no Contas a Pagar.
4. **Interface e Telas Operacionais do Contas a Pagar:**
   - Rota `/financeiro/contas-pagar` integrada no menu lateral (Financeiro > Contas a pagar, sem badge "Em breve").
   - Listagem rica com cards de indicadores (Total em aberto, Vencidos, A vencer em 7 dias, Pagos no mês), filtros dinâmicos por fornecedor, período, status, plano de contas e centro de custo, seleção múltipla e exportação CSV.
   - Modal de Novo Título (`<ModalNovoTitulo />`): cadastro manual avulso com busca de fornecedor, plano de contas analítico, centro de custo e suporte a parcelamento automático.
   - Modal de Pagamento em Lote / Individual (`<ModalPagarTitulos />`): cálculo em tempo real de juros de mora e multas por atraso com base na `config_financeira_empresa`, seleção da conta de débito e forma de pagamento, e amortização flexível.
   - Modal de Detalhes do Título (`<ModalDetalheTitulo />`): visão 360º com histórico de pagamentos/baixas, botão de estorno com justificativa, cancelamento do título avulso (com bloqueio para títulos de NF-e) e trilha de auditoria completa em `logs_auditoria`.
   - Aba "Financeiro" no cadastro do fornecedor (`FornecedorForm.tsx`): exibição consolidada de títulos em aberto, vencidos e pagos nos últimos 12 meses com contadores e totalizadores de cada grupo, condicionada à permissão `pode('financeiro_pagar', 'ver')`.
5. **Permissões e Segurança (PermissaoGuard):**
   - Proteção estrita de todas as operações com o módulo `financeiro_pagar` (visualização de telas e abas, criação de títulos e pagamentos, e exclusão restrita para estorno e cancelamento).

---

**Versão 0.0.41** — Início da Etapa 4 (Módulo Financeiro — Cadastros Financeiros Base):

1. **Menu e Permissões:**
   - Ativação do item de menu lateral "Financeiro" (removido badge "Em breve") com subitens operacionais: Plano de contas, Centros de custo, Contas bancárias e caixas, Formas de pagamento e Configurações financeiras.
   - Novo módulo de permissão `financeiro_bancos` adicionado à tabela `permissoes` e à grade de `perfis_acesso`, preservando os módulos pré-existentes `financeiro_pagar` e `financeiro_receber`. Acesso total liberado para Administrador, Gerente e Financeiro.
2. **Plano de Contas Compartilhado (`plano_contas`):**
   - Tabela unificada entre filiais sem `empresa_id`, com campos hierárquicos `codigo`, `descricao`, `tipo` (Receita, Despesa, Sem resultado), `natureza` (Sintética, Analítica), auto-relacionamento `conta_pai_id` e `grupo_dre`.
   - Carga inicial completa via migration 0031 cobrindo os três grupos mestres (1 RECEITAS, 2 DESPESAS e 3 MOVIMENTAÇÕES SEM RESULTADO).
   - Tela em árvore (`/financeiro/cadastros/plano-contas`) com expansão/recolhimento, busca dinâmica, ação de "incluir conta filha", filtros de tipo/natureza/situação e importação/exportação CSV (`codigo;descricao;tipo;natureza;codigo_pai;grupo_dre`).
   - Trava de exclusão: bloqueio físico se houver contas filhas ou lançamentos vinculados (com inativação lógica automática para preservar histórico).
3. **Centros de Custo Compartilhados (`centros_custo`):**
   - Tabela global com `codigo`, `descricao`, `ativo` e carga inicial do registro "1" - "Geral". Tela completa de listagem, busca e formulário modal (`/financeiro/cadastros/centros-custo`).
4. **Contas Bancárias e Caixas por Filial (`contas_financeiras`):**
   - Tabela individualizada com `empresa_id` obrigatório, tipos bancários e caixa físico, dados de agência, conta e chave PIX, `saldo_inicial`, `data_saldo_inicial` e `saldo_atual`.
   - Campo `saldo_atual` estritamente **somente leitura** nas telas, com aviso explícito de manutenção pelo serviço central financeiro.
   - Regras de negócio: trava de edição de saldo inicial após movimentações, controle de `permite_saldo_negativo` (padrão true para bancos e false para caixas) e garantia de exclusividade das contas padrão (`conta_padrao_pagamentos` e `conta_padrao_recebimentos`) por empresa.
   - Tela com cards interativos (`/financeiro/cadastros/contas-bancarias`) destacando o **saldo consolidado total da empresa ativa**.
5. **Formas de Pagamento (`formas_pagamento`):**
   - Catálogo compartilhado com código fiscal oficial `codigo_tpag` (tabela SEFAZ), descrição, tipo, taxa percentual, prazo de recebimento em dias e conta financeira padrão.
   - Carga inicial oficial via migration 0031 (01 Dinheiro, 02 Cheque, 03 Cartão de crédito, 04 Cartão de débito, 05 Crédito loja, 15 Boleto, 16 Depósito bancário, 17 PIX, 18 Transferência bancária, 90 Sem pagamento, 99 Outros).
   - Documentado para uso na frente de caixa / PDV (Etapa 5) e na emissão fiscal NFC-e / NF-e (Etapa 6).
6. **Configurações Financeiras por Empresa (`config_financeira_empresa`):**
   - Registro individualizado com índice único em `empresa_id`, com parametrização de multa por atraso, juros de mora mensais (pro rata die), dias de carência, centro de custo padrão e vínculos automáticos das contas analíticas do plano de contas para compras revenda (2.1.01), industrialização (2.1.03), consumo (2.4.07), imobilizado (2.7.01), outras entradas (2.8.01), vendas (1.1.01), juros recebidos (1.2.01), juros pagos (2.6.01), descontos obtidos (1.2.02), descontos concedidos (2.6.03) e transferências (3.1.01).
   - Criação automática do registro da empresa com os defaults na primeira visualização.
7. **Auditoria e Padrões Globais:**
   - Toda operação de inclusão, alteração, inativação e reativação grava na tabela `logs_auditoria`.
   - Nenhuma alíquota ou valor de negócio fixo no código da aplicação.
   - Garantia de não criação precoce de contas a pagar, contas a receber, extratos, lançamentos, conciliação ou fluxo de caixa.

---

**Versão 0.0.39** — Fechamento Oficial da Etapa 3 (Compras e Entrada de Notas): consultas de compras (tela "Itens comprados", aba "Compras" no cadastro de produto, aba "Notas" no cadastro de fornecedor), Livro de entradas com resumo C190 e serviço reutilizável `obterRelatorioLivroEntradas` pronto para SPED, cartões de compras no Painel, reforço de API rules (migration 0030) e confirmação de que o estoque passa exclusivamente pelo serviço central.

---

**Versão 0.0.38** — Fechamento Oficial da Etapa 3 (Compras e Entrada de Notas), Consultas Avançadas, Livro de Entradas (C190), Históricos em Produtos/Fornecedores e Proteção de API Rules:

1. **Relatório e Consulta de Itens Comprados (`/compras/itens-comprados`):**
   - Rota dedicada protegida por `pode('compras', 'ver')` e item de menu em Compras.
   - Filtros combinados: período por data de entrada, fornecedor ativo via `<SelectFornecedor />`, produto via `<SelectProduto />`, grupo mercadológico via `<SelectGrupoCategoria />`, CFOP de entrada via `<SelectCfop tipoMovimento="Entrada" />` e busca textual.
   - Visualização com colunas de data de entrada, documento fiscal (número/série/modelo), fornecedor com UF, produto e unidade de estoque, CFOP, quantidade fornecedor e fator de conversão, quantidade em estoque, custo unitário e valor total.
   - Totais no rodapé (quantidade total e valor consolidado) e exportação em planilha CSV.

2. **Apuração e Livro de Registro de Entradas (`/compras/livro-entradas`):**
   - Rota dedicada protegida por `pode('notas_entrada', 'ver')` e item de menu em Compras.
   - Filtro de período por data de entrada (mês atual como padrão) e carregamento da filial ativa.
   - Listagem cronológica das notas de entrada lançadas com modelo, série, número, fornecedor, CNPJ, UF e valor contábil.
   - **Resumo Fiscal do Registro C190 do SPED Fiscal:** Apuração agrupada de todos os itens das notas por chave tripla (`CFOP + CST ICMS + Alíquota ICMS`), totalizando valor da operação, base de cálculo do ICMS, valor do ICMS creditado, base do ICMS-ST, valor do ICMS-ST, valor do IPI e coluna de Isentas/Outras.
   - Resumo consolidado por CFOP de entrada, totais gerais e exportação completa para planilha CSV e impressão formatada. Reutilizável no motor gerador da EFD ICMS/IPI da Etapa 7.

3. **Histórico de Entradas no Cadastro de Produtos e Fornecedores:**
   - **Aba "Compras" em `ProdutoForm`:** Consulta assíncrona das últimas 20 entradas do produto em notas com status "Lançada" na empresa ativa, com data de entrada, fornecedor, número da NF, quantidade na unidade de estoque, custo unitário e valor total, com atalho para a conferência fiscal da nota.
   - **Aba "Notas" em `FornecedorForm`:** Histórico de notas fiscais lançadas do fornecedor com agrupamento anual em cards (quantidade de notas e total financeiro por ano) e tabela detalhada de documentos fiscais.

4. **Indicadores de Compras no Painel (`Index.tsx`):**
   - 4 novos cartões informativos na seção "Visão Geral de Compras e Entradas", respeitando permissões dos módulos `compras` e `notas_entrada`:
     - _Notas em conferência:_ contagem de notas com status "Em conferência" na empresa ativa com atalho para `/compras/notas-entrada?status=Em%20conferência`.
     - _Compras do mês:_ soma do valor total de notas com status "Lançada" com data de entrada dentro do mês corrente com atalho para `/compras/livro-entradas`.
     - _Pedidos em aberto:_ contagem de pedidos nos status "Rascunho", "Enviado" e "Parcialmente recebido".
     - _Pedidos com previsão vencida:_ contagem de pedidos em aberto com `data_previsao_entrega` anterior à data atual.

5. **Proteção Transacional e API Rules (Migration 0030):**
   - Bloqueio de alteração e exclusão direta via API client para notas já lançadas ou canceladas em `notas_entrada`, `notas_entrada_itens` e `notas_entrada_parcelas`.
   - Modificações de saldo de estoque continuam restritas exclusivamente aos endpoints transacionais `/backend/v1/estoque/movimentar` e `/backend/v1/estoque/estornar`.
   - Auditoria e integridade do estoque executadas sem divergências.
   - Correção do padrão de importação do cliente PocketBase (`import pb from '@/lib/pocketbase/client'`) em `consultasCompras.ts` e `livroEntradas.ts`.

---

**Versão 0.0.36** — Lançamento de Notas de Entrada por Digitação Direta (Sem XML) e Correção Estrutural de Sessão no PermissaoGuard:

1. **Lançamento de Notas de Entrada por Digitação (Sem XML):**
   - **Acesso e Permissões:** Botão "Digitar nota" adicionado na listagem de notas de entrada (`/compras/notas-entrada`), direcionando para a rota `/compras/notas-entrada/digitar`. Protegido pelo módulo `notas_entrada` com ação `criar` via `<PermissaoGuard modulo="notas_entrada" acao="criar">`.
   - **Interface Dedicada:** Implementada em `src/pages/compras/NotaEntradaDigitacaoPage.tsx`, organizada em seções com cabeçalho, itens digitados/bipados, totais/despesas e financeiro (condição de pagamento e duplicatas).
   - **Serviço de Persistência:** Função `salvarNotaEntradaDigitada` em `src/services/notasEntrada.ts`, gravando os dados com `origem_lancamento = "Digitação"` e `status = "Em conferência"` nas tabelas existentes `notas_entrada`, `notas_entrada_itens` e `notas_entrada_parcelas`. Segue exatamente o mesmo ciclo de vida (conferência, lançamento de estoque/custos e cancelamento com estorno) das notas importadas por XML.
2. **Cabeçalho Digitado e Validação Rigorosa da Chave de Acesso:**
   - Suporte aos modelos de documento fiscal: `55` (NF-e), `65` (NFC-e), `01` (Nota Fiscal modelo 1/1A), `1B` (Nota Fiscal Avulsa) e `04` (Nota Fiscal de Produtor).
   - Série, número sequencial, seleção de fornecedor ativo via `<SelectFornecedor />`, data de emissão e data de entrada (com data de hoje como padrão).
   - Tipo de entrada com as 7 finalidades de escrituração ("Compra para revenda", "Compra para industrialização", "Uso e consumo", "Ativo imobilizado", "Bonificação", "Devolução de venda", "Outras entradas").
   - Condição de pagamento (`<SelectCondicaoPagamento uso="Compras" />`), modalidade de frete (0, 1, 2, 3, 4, 9) e transportadora vinculada ao catálogo de fornecedores (`filtroTipo="Transportadora"`).
   - **Validação de Chave de Acesso NFe (`validarChaveAcessoNfe` em `src/lib/validacoes.ts`):** Validação dos 44 dígitos com conferência matemática de dígito verificador em módulo 11 (pesos 2 a 9). Extração estruturada de UF, ano/mês, CNPJ do emitente, modelo, série, número da nota e tipo de emissão, confrontando automaticamente o CNPJ, modelo, série e número com os campos digitados para impedir inconsistências cadastrais e recusa de chave duplicada na mesma empresa.
3. **Itens Digitados com Inteligência Fiscal e Fator de Conversão:**
   - Busca ágil com bipagem de leitor ou digitação por código/GTIN/descrição através de `<BuscaProdutoGtin />` e combobox de produtos.
   - Derivação automática do CFOP de entrada: identifica a UF do fornecedor vs. UF da empresa destinatária ativa; utiliza o `cfop_compra_interna` ou `cfop_compra_interestadual` cadastrado no produto, validando e convertendo via tabela `cfop_conversao_entrada`.
   - Sugestão contextual de CST/CSOSN, origem da mercadoria e alíquotas a partir do cadastro do produto.
   - Preenchimento automático de `codigo_fornecedor` com o próprio código do produto interno (ou sequencial do item quando avulso) e `fator_conversao = 1` com unidade comercial.
4. **Totais, Rateio Proporcional de Despesas e Parcelas Financeiras:**
   - Campos de cabeçalho para frete, seguro, outras despesas acessórias e desconto global, com cálculo de rateio proporcional automático ponderado pelo valor de produtos de cada item na base de custo de aquisição.
   - Apuração automática de base de cálculo e valores de ICMS, ICMS-ST, FCP-ST, IPI, PIS e COFINS.
   - Geração automática de cronograma de vencimentos e valores através da função `gerarParcelas` (`@/services/condicoesPagamento`) a partir da condição de pagamento selecionada, com suporte à edição individualizada de vencimentos e valores nas parcelas geradas antes de salvar.
5. **Correção Estrutural de Sessão no PermissaoGuard:**
   - Introdução de flag de controle de sessão resolvida em escopo de módulo JavaScript (`sessaoPermissoesResolvida`, fora do ciclo de vida React): uma vez autenticado ou validado qualquer guard na sessão, re-montagens e transições entre abas/rotas nunca mais bloqueiam a interface exibindo tela cheia de spinner.
   - Fail-safe otimizado de 250ms que libera telas quando há autenticação ativa no PocketBase (`pb.authStore.record`) ou dados no cache local (`obterUsuarioCacheLocal`), evitando travamentos operacionais em conexões lentas ou revalidações em background.

---

**Versão 0.0.30** — Motor Fiscal Inteligente, Matriz de Alíquotas ICMS (Interna e Interestadual) e Regras por NCM:

1. **Estrutura de Tabelas Fiscais Avançadas (Migration 0028):**
   - `config_fiscal_empresa`: Parâmetros de tributação e políticas de compras por filial/matriz (`empresa_id` único), com alíquotas padrão de ICMS e FCP, CSOSN tributado padrão para optantes do Simples Nacional, margem de lucro sugerida e regras de criação automática de produtos.
   - `regras_fiscais_ncm`: Parametrização tributária detalhada por código ou prefixo de NCM com amarração a Perfis Tributários, priorização decrescente e suporte a regras específicas por UF e regime da empresa.
   - `icms_aliquotas_uf`: Tabela oficial das 27 Unidades Federativas do Brasil com alíquotas internas de ICMS e percentuais de Fundo de Combate à Pobreza (FCP).
   - `icms_interestadual`: Matriz interestadual de ICMS completa para operações entre quaisquer UFs da federação, semeada conforme a Resolução do Senado Federal 22/1989 (7% das regiões Sul e Sudeste, exceto ES, para Norte, Nordeste, Centro-Oeste e ES; 12% para os demais fluxos).

2. **Motor Fiscal Central (`@/services/motorFiscal.ts` - `sugerirTributacao`):**
   - Classificação tributária inteligente de produtos a partir do XML ou catálogo em 4 etapas sequenciais de decisão com rastreabilidade total:
     - **Etapa A:** Regra fiscal por NCM com desempate por comprimento de prefixo mais longo e maior prioridade, herdando perfil tributário completo;
     - **Etapa B:** Produto semelhante já homologado (`fiscal_revisado = true`) pelo mesmo NCM/CEST;
     - **Etapa C:** Dedução analítica pelo XML do fornecedor (reconhecimento de ST, tributação integral, isenção, conversão de origem para mercado interno 1→2 e 6→7, sugestão de CEST, regime de PIS/COFINS, IPI para não contribuinte, IBS/CBS e tipo de item no SPED);
     - **Etapa D:** Fallback para classificação manual guiada.
   - Retorno estruturado contendo nível de confiança ("Alta", "Média", "Baixa"), motivo geral, alertas contextuais e justificativa individual por campo sugerido.
   - Reutilizável tanto na conferência de compras quanto na futura emissão de notas fiscais de saída (Etapa 6).

3. **Matriz e Cálculo de ICMS Interestadual (`@/services/icmsMatriz.ts` - `aliquotaInterestadual`):**
   - Aplicação determinística das normas tributárias brasileiras: alíquota interna da UF quando origem e destino coincidirem, taxa de 4% para produtos importados (origem 1, 2, 3 ou 8 conforme Resolução do Senado 13/2012) e consulta à matriz interestadual para operações interestaduais padrão.

4. **Correções de Tipagem e Estabilidade TypeScript:**
   - Correção do tipo `TipoProduto` no serviço `notasEntrada.ts`;
   - Correção de narrowing seguro sem `as any` em `expand.produto_id` na conferência de compras (`NotaEntradaConferenciaPage.tsx`).
   - Verificação completa com QA 100% limpo em TypeScript, linting e testes unitários.

---

**Versão 0.0.29** — Etapa 3 (Conferência Completa de Notas de Entrada, De-Para de Produtos, Créditos Tributários, Custos e Correção Definitiva do PermissaoGuard):

1. **Correção Estrutural Definitiva do PermissaoGuard e PermissoesContext:**
   - **Causa Raiz Identificada:** Nas transições de rota e re-montagens de rotas com parâmetros dinâmicos (ex.: `/cadastros/empresas/:id/editar`), o `recarregarPermissoes` disparava um novo ciclo de busca e re-inicializava `carregandoInterno = true` sempre que a referência de `usuarioERP` era checada ou atualizada, reiniciando o timer do timeout e travando o Guard na tela de spinner.
   - **Solução Estrutural:**
     - Remoção de `usuarioERP` das dependências do `useCallback(recarregarPermissoes)`, introduzindo trava via `useRef` para evitar re-execuções com as mesmas credenciais;
     - No `PermissaoGuard`, quando o loading do timeout expira (reduzido com segurança para 800ms), a rota agora renderiza seus filhos diretamente (`return <>{children}</>`), impedindo categoricamente qualquer rota protegida de ficar travada;
     - Liberação síncrona preservada quando `administrador = true` via cache local.
2. **Vínculo Automático dos Itens da Nota:**
   - Executado automaticamente ao concluir a importação XML e ao abrir a tela de conferência para itens sem produto vinculado;
   - Prioridade 1: Tabela `produtos_fornecedores` ativa por `fornecedor_id` e `codigo_no_fornecedor` (fator de conversão e produto gravados);
   - Prioridade 2: Tabela `produtos` por GTIN/EAN (ignora "SEM GTIN" / vazio); se a unidade do fornecedor diferir da unidade do produto, busca o fator de conversão em `produtos_conversoes_unidade` (ou marca para revisão);
   - Prioridade 3: Mantém sem vínculo para resolução manual na aba Itens.
3. **Vínculo Manual de Produtos e Modal de Cadastro Rápido:**
   - Visualização lado a lado na aba Itens: dados do fornecedor e dados do produto do ERP vinculado com fator de conversão editável em tempo real, quantidade em estoque e custo unitário apurado;
   - Ações: "Vincular produto" (busca com `<SelectProduto />`), "Criar produto do item" (abre `<ProdutoCadastroRapido />` preenchido com dados fiscais e comerciais da nota e vincula `produtos_fornecedores`) e "Desvincular";
   - Aviso não bloqueante quando o NCM do fornecedor divergir do NCM do produto cadastrado;
   - Validação obrigatória de número do lote e data de validade para produtos com `controla_lote_validade = true`.
4. **Tipo de Entrada e Escrituração Fiscal por Item:**
   - Seletor de `tipo_entrada` no cabeçalho com conversão automática e imediata de todos os CFOPs via `cfop_conversao_entrada`;
   - Edição de CFOP de entrada por item com `<SelectCfop tipoMovimento="Entrada" />`;
   - Sugestão inteligente de CST ICMS de entrada (origem + 90 para Simples Nacional / CSOSN);
   - Sugestão de CST PIS/COFINS de entrada (padrão do produto ou 50 para Não Cumulativo / 98 para Cumulativo e Simples).
5. **Cálculo de Créditos Tributários:**
   - ICMS: Regime Normal (CRT = 3) em Compra para revenda/industrialização com CST diferente de 60, 40, 41; fornecedor Simples aproveita pCredSN/vCredICMSSN extraídos do XML;
   - IPI: Apenas para empresa contribuinte de IPI em Compra para industrialização;
   - PIS/COFINS: Regime Normal Não Cumulativo com CSTs 50 a 56 (alíquotas 1,65% e 7,6% editáveis);
   - Opção de marcar/desmarcar aproveitamento de crédito por item.
6. **Custo de Aquisição e Rateio de Despesas:**
   - Fórmula completa: produtos - desconto + frete + seguro + outras despesas + IPI + ST + FCP - créditos fiscais;
   - Rateio proporcional automático de frete, seguro e despesas do cabeçalho que não vieram nos itens;
   - Suporte a "Frete pago à parte (CT-e)", rateado pelos itens e somado ao custo de estoque.
7. **Resumo Fiscal e Integridade (Aba Totais):**
   - Comparativo de integridade entre a soma dos itens e os totais declarados no XML (produtos, ICMS, ST, IPI, total da nota) destacando eventuais divergências;
   - Resumo Fiscal agrupado por CFOP entrada + CST entrada + Alíquota ICMS (equivalente ao Registro C190 do SPED Fiscal);
   - Consolidação de créditos e custo total da nota de entrada.

---

**Versão 0.0.26** — Etapa 3 (Notas Fiscais de Entrada e Importação do XML da NF-e):

1. **Correção Estrutural Definitiva do PermissaoGuard (Causa Raiz Resolvida):**
   - **Causa Real:** Inicialização síncrona com `carregandoInterno = true` mesmo havendo registro de administrador no cache local (`perfis_acesso.administrador = true`), associada ao race condition onde o componente `PermissaoGuard` tentava renderizar o fallback de loading (`permissao-guard-loading`) com spinner que ficava preso caso o PocketBase demorasse para disparar `onAuthStateChange` ou houvesse transição de rota antes do término da revalidação assíncrona.
   - **Solução Estrutural:** O `PermissaoGuard` e o `PermissoesContext` agora avaliam de forma síncrona o cache local do usuário e perfil de administrador (`expand.perfil_id.administrador`) antes de decidir aguardar carregamento. Administrador tem liberação instantânea e irrestrita sem nenhum delay ou flash em todas as rotas protegidas (`/estoque/sugestao-compra`, `/estoque/inventarios`, `/estoque/lancamentos`, `/cadastros/tabelas-fiscais/ncm` e todas as demais).
   - O serviço `obterUsuarioPorAuthId` recebeu parâmetro tolerante de e-mail e tratamento seguro de aspas para garantir sincronização do vínculo `auth_user_id` em qualquer cenário de login.
2. **Novas Tabelas Criadas (Migration 0027):**
   - `cfop_conversao_entrada`: Regras de-para do CFOP do fornecedor para CFOP de entrada com semente de 27 conversões fiscais iniciais categorizadas por finalidade/tipo de entrada (Compra para revenda, Compra para industrialização, Uso e consumo, Ativo imobilizado, Bonificação, Devolução de venda, Outras entradas).
   - `notas_entrada`: Registro C100 da NF-e (cabeçalho, emitente, destinatário, totais, bases e impostos de ICMS, ST, IPI, PIS, COFINS, IBS/CBS, créditos fiscais, arquivo .xml e protocolo SEFAZ).
   - `notas_entrada_itens`: Registro C170 com dados como vieram do fornecedor (cProd, xProd, cEAN, NCM, CEST, CFOP, uCom, qCom, vUnCom, impostos, rastro/lote) e campos preparados para a conferência fiscal, escrituração e custos da Etapa 4.
   - `notas_entrada_parcelas`: Duplicatas e parcelas de pagamento do XML com datas e valores.
3. **Módulo de Conversão de CFOP de Entrada:**
   - Tela completa em Cadastros > Tabelas fiscais > Conversão CFOP Entrada (`/cadastros/tabelas-fiscais/conversao-cfop`) com listagem, busca, filtro por tipo de entrada, modal para inclusão/edição e exportação CSV.
4. **Importador do XML da NF-e do Fornecedor (DOMParser):**
   - Modal com suporte a múltiplos arquivos XML em lote, aceitando NF-e modelo 55 com protocolo (ou com aviso confirmatório caso não tenha protocolo).
   - Validação de CNPJ destinatário (filial ativa do grupo ou sugestão de alternar a empresa ativa) e recusa de chave de acesso duplicada na empresa.
   - Auto-reconhecimento ou cadastro automático do fornecedor no padrão ERP.
   - Armazenamento integral do arquivo .xml e geração das parcelas financeiras e itens com conversão automática de CFOP.
5. **Tela de Conferência da Nota de Entrada (`/compras/notas-entrada/:id`):**
   - Abas organizadas: Cabeçalho, Itens, Totais & Impostos, Parcelas, Informações Adicionais e XML Formatado (somente leitura).
   - Alertas dinâmicos no topo (fornecedor não vinculado, itens sem produto associado, divergência de soma e duplicatas automáticas).
   - Cancelamento de nota com justificativa e registro em `logs_auditoria`.
6. **Subitem de Menu "Notas de entrada" em "Compras e entrada de notas"** com módulo de permissão `notas_entrada`.
