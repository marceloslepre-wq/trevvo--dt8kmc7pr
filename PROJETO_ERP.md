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

Índices: `cnpj` (único: `idx_empresas_cnpj`), `codigo` (único: `idx_empresas_codigo`), `tipo` (`idx_empresas_tipo`), `ativo` (`idx_empresas_ativo`).

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

## Versão Atual do Projeto

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
