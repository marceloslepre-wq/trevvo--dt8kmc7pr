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
- condicao_pagamento_padrao (texto livre, ex: "30/60/90")
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
- condicao_pagamento_padrao (texto livre, ex: "28 DDL", "30/60/90")
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
