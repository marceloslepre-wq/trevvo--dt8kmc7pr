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
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

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

### Todas as Tabelas Criadas (35 tabelas)

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

## Versão Atual do Projeto

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
