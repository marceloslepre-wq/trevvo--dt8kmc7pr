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

## Auditoria

- Inclusões, alterações e inativações de cadastros gravam em logs_auditoria: usuário, data/hora, tabela, registro, ação, valores antes e depois.

## Fiscal

- Nenhuma alíquota fica fixa no código: tudo vem de cadastro.
- Códigos fiscais (CST, CSOSN, CFOP, NCM, CEST, origem) sempre validados contra as tabelas fiscais do sistema.

## Tabelas

(acrescentar aqui cada tabela criada, com seus campos)
