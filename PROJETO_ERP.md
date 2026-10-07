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
- created_by (relation -> users, opcional)
- updated_by (relation -> users, opcional)
- created (autodate, onCreate)
- updated (autodate, onCreate, onUpdate)

Regras: Armazena a identidade visual e nome que personalizam cabeçalho, tela de login e menu lateral. A cor principal alimenta as variáveis CSS globais (`--primary`, `--sidebar-primary`, `--ring`, `--brand-color`). Alterações gravam em `logs_auditoria`.

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

### Todas as Tabelas Criadas (26 tabelas)

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
25. `configuracoes`: Nome do sistema, arquivo de logotipo e cor temática primária.
26. `condicoes_pagamento`: Condições de pagamento com prazos, entrada, juros, desconto e dia fixo.

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

### Serviços Centrais de Estoque (`@/services/estoque.ts`)

⚠ **REGRA DE ARQUITETURA MANDATÓRIA (EM DESTAQUE):**
Nenhuma tela ou componente do sistema tem permissão para gravar, editar ou excluir diretamente nas tabelas `estoque_saldos` ou `estoque_movimentos`. Toda e qualquer alteração de saldo ou histórico deve transitar única e exclusivamente pelo serviço central do backend (`/backend/v1/estoque/movimentar` e `/backend/v1/estoque/estornar`), acessível através das funções `movimentarEstoque()` e `estornarMovimento()`.

#### 1. `movimentarEstoque(itens)`

Movimenta o estoque de múltiplos itens em transação atômica. Valida permissões do usuário, consistência de unidades inteiras/fracionadas, estoque negativo (respeitando `permite_estoque_negativo`), expande automaticamente componentes de produtos do tipo "Kit" por meio de `produtos_kit_itens`, calcula o custo médio ponderado e atualiza `estoque_saldos` e `estoque_movimentos` com auditoria.

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
   - Grade cronológica imutável com: Data/Hora, Origem, Documento (tipo e número), Entrada, Saída, Saldo Resultante, Custo Unitário, Custo Médio Ponderado, Valor Total e Operador/Motivo.
   - Movimentos estornados aparecem riscados e com link para o identificador do estorno.
   - Botão "Estornar" em lançamentos manuais e ajustes, solicitando motivo detalhado, exclusivo para usuários com permissão de excluir em estoque (`pode('estoque', 'excluir')`).
   - Exportação para planilha CSV e botão de impressão formatada para ficha física.

3. `/estoque/lancamentos` (`@/pages/estoque/LancamentosEstoquePage.tsx`):
   - Aba "Novo Lançamento": formulário ágil com tipos mapeados para origens do Kardex:
     - _Saldo inicial_ → `SALDO_INICIAL` (permite data retroativa de implantação, custo obrigatório);
     - _Ajuste de entrada_ → `AJUSTE_ENTRADA` (motivo obrigatório, custo opcional herdando custo médio);
     - _Ajuste de saída_ → `AJUSTE_SAIDA` (motivo obrigatório, valida saldo negativo se filial não permitir);
     - _Perda/avaria_ → `PERDA` (motivo obrigatório, custo oculto);
     - _Consumo interno_ → `CONSUMO_INTERNO` (motivo obrigatório, custo oculto);
     - _Bonificação recebida_ → `BONIFICACAO_ENTRADA` (custo obrigatório);
     - _Bonificação enviada_ → `BONIFICACAO_SAIDA` (custo oculto).
   - Grade de itens com leitor de código de barras GTIN integrado: bipar com leitor ou pressionar Enter adiciona o item com quantidade 1 ou soma 1 caso já esteja na grade.
   - Exibe saldo atual (só leitura) e calcula o saldo após em tempo real.
   - Gravação em lote através da função `movimentarEstoque(itens)` com modal de resumo pós-gravação.
   - Aba "Lançamentos Realizados": histórico agrupado por documento de lote com filtros de período, tipo de operação e usuário operador.
   - Modal de Importação de Saldo Inicial por CSV (`<ImportarSaldoInicialModal />`) com colunas `codigo_ou_gtin;quantidade;custo_unitario`, validação linha a linha, prévia e acusação de erros antes de gravar.

4. Aba "Estoque" no Cadastro de Produtos (`@/components/ProdutoAbaEstoque.tsx`):
   - Exibe, em modo só leitura no formulário do produto, a tabela com saldo físico, custo médio e valor em estoque em cada filial autorizada ao usuário.
   - Exibe os últimos 10 movimentos na filial ativa com badge de tipo/origem, quantidades e link direto para o Kardex completo.

### Novos Componentes Reutilizáveis de Estoque

- `<BuscaProdutoGtin />` (`@/components/BuscaProdutoGtin`): Campo de busca com suporte prioritário para bipagem de código de barras (GTIN/EAN) ou digitação de código numérico, com dropdown de sugestões e gatilho imediato de seleção.
- `<SaldoTodasFiliaisModal />` (`@/components/SaldoTodasFiliaisModal`): Modal que recebe um produto e lista o saldo físico, custo médio e situação em todas as empresas acessíveis pelo usuário logado.
- `<ImportarSaldoInicialModal />` (`@/components/ImportarSaldoInicialModal`): Modal completo para importação de saldo inicial de implantação via planilha CSV, com modelo para download, verificação de consistência e gravação transacional.
- `<ProdutoAbaEstoque />` (`@/components/ProdutoAbaEstoque`): Componente para abas de formulários de produtos com saldo por filial e histórico recente de movimentos.

### Permissões do Módulo Estoque

- `pode('estoque', 'ver')`: acesso às telas de Posição de Estoque, Kardex e consulta de lançamentos.
- `pode('estoque', 'criar')`: permissão para efetuar lançamentos manuais e importar saldo inicial.
- `pode('estoque', 'excluir')`: permissão para realizar o estorno de lançamentos e ajustes no Kardex.

## Versão Atual do Projeto

**Versão 0.0.18** — Implementação completa das telas e fluxos do módulo Estoque: Posição de Estoque com filtros e saldos por filial, Kardex com recomposição retroativa e estornos, Lançamentos manuais de ajustes com leitor de código de barras GTIN e importação de saldo inicial por CSV, aba Estoque no formulário de produtos e ativação do menu Estoque.
