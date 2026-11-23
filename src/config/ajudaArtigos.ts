/**
 * AJUDA DO TREVVO — artigos "como faço para...".
 *
 * Usados por:
 *  (a) barra "Buscar no Trevvo" (Ctrl+K), busca local, sem IA;
 *  (b) chat "Pergunte ao Trevvo": os artigos mais parecidos com a pergunta vão como
 *      contexto para o agente, que responde só com base neles (não inventa caminho).
 *
 * Cada artigo aponta para uma rota da tabelaRotas: a permissão do usuário decide se o
 * artigo aparece (mesma regra do menu). Ao mudar uma tela, atualize o artigo aqui.
 */

export interface ArtigoAjuda {
  id: string
  /** Pergunta como o usuário escreveria */
  titulo: string
  /** Rota da tela (a mesma da tabelaRotas); o botão "Abrir tela" leva para ela */
  rota: string
  /** Caminho no menu, para o usuário se localizar */
  caminho: string
  /** Palavras e sinônimos que o usuário pode digitar */
  termos: string[]
  /** Passo a passo, em linguagem simples */
  passos: string[]
  /** Avisos e regras importantes (prazos, permissões) */
  dicas?: string[]
}

export const ARTIGOS_AJUDA: ArtigoAjuda[] = [
  // ---------------- Fiscal ----------------
  {
    id: 'cancelar-nota',
    titulo: 'Como cancelar uma nota fiscal (NF-e ou NFC-e)?',
    rota: '/fiscal/documentos',
    caminho: 'Fiscal > Documentos Fiscais',
    termos: [
      'cancelar nota',
      'cancelamento',
      'cancelar nfe',
      'cancelar nfce',
      'cancelar cupom',
      'anular nota',
      'sefaz',
    ],
    passos: [
      'Abra Fiscal > Documentos Fiscais.',
      'Escolha a empresa e localize a nota (pesquise pelo número, pela chave de 44 dígitos ou pelo cliente).',
      'Na linha da nota com status Autorizada, clique no ícone de X vermelho "Cancelar nota na SEFAZ".',
      'Escreva a justificativa (mínimo de 15 caracteres) e confirme.',
      'Aguarde o retorno da SEFAZ: o status muda para Cancelada.',
    ],
    dicas: [
      'A SEFAZ permite cancelar em até 24 horas depois da autorização. Depois disso, a orientação é emitir uma nota de devolução.',
      'Se a nota é de uma venda, prefira cancelar pela venda (Vendas e PDV > Orçamentos e Pedidos > Opções > Cancelar Venda): assim o estoque e o financeiro também são estornados.',
      'O botão só aparece para quem tem permissão de excluir em Notas de saída.',
    ],
  },
  {
    id: 'cancelar-venda',
    titulo: 'Como cancelar uma venda já finalizada?',
    rota: '/vendas/pedidos',
    caminho: 'Vendas e PDV > Orçamentos e Pedidos',
    termos: [
      'cancelar venda',
      'estornar venda',
      'desfazer venda',
      'venda errada',
      'cancelar pedido',
      'estorno',
    ],
    passos: [
      'Abra Vendas e PDV > Orçamentos e Pedidos (as vendas do PDV também aparecem aqui; use o filtro de origem PDV).',
      'Na linha da venda, clique em Opções > Cancelar Venda.',
      'Se a venda tem NF-e ou NFC-e autorizada, marque a opção para cancelar a nota fiscal junto.',
      'Escreva o motivo do cancelamento e confirme.',
    ],
    dicas: [
      'O cancelamento estorna os pagamentos, cancela os títulos a receber e devolve os itens ao estoque. Não tem volta.',
      'A opção só aparece para quem tem permissão de excluir em Vendas (normalmente o gerente).',
      'Prazo da nota na SEFAZ: até 24 horas. Passou do prazo, faça uma devolução (Trocas e Devoluções).',
    ],
  },
  {
    id: 'carta-correcao',
    titulo: 'Como fazer uma Carta de Correção (CC-e)?',
    rota: '/fiscal/documentos',
    caminho: 'Fiscal > Documentos Fiscais',
    termos: [
      'carta de correcao',
      'cce',
      'cc-e',
      'corrigir nota',
      'erro na nota',
      'corrigir endereco',
    ],
    passos: [
      'Abra Fiscal > Documentos Fiscais e localize a NF-e autorizada.',
      'Clique no ícone "Carta de Correção (CC-e)" na linha da nota.',
      'Escreva o texto da correção (entre 15 e 1000 caracteres).',
      'Clique em Transmitir Carta de Correção.',
    ],
    dicas: [
      'Só vale para NF-e (modelo 55). NFC-e não aceita carta de correção.',
      'A CC-e não pode corrigir valores, impostos, alíquotas, dados que mudem o remetente ou o destinatário, nem a data de emissão ou saída.',
    ],
  },
  {
    id: 'nota-rejeitada',
    titulo: 'A nota foi rejeitada. Como reenviar?',
    rota: '/fiscal/documentos',
    caminho: 'Fiscal > Documentos Fiscais',
    termos: [
      'rejeitada',
      'rejeicao',
      'reenviar nota',
      'tentar de novo',
      'erro sefaz',
      'nota nao autorizou',
    ],
    passos: [
      'Abra Fiscal > Documentos Fiscais e filtre o status Rejeitada.',
      'Leia o motivo da rejeição na linha da nota.',
      'Corrija a causa (por exemplo, o cadastro do cliente ou o fiscal do produto).',
      'Clique no ícone "Tentar de novo (Reenviar)" na linha da nota.',
    ],
    dicas: [
      'No PDV, quando a NFC-e é rejeitada, a venda continua válida: você pode reenviar na hora ou depois pelo monitor fiscal.',
    ],
  },
  {
    id: 'danfe-xml',
    titulo: 'Como abrir o DANFE ou baixar o XML de uma nota?',
    rota: '/fiscal/documentos',
    caminho: 'Fiscal > Documentos Fiscais',
    termos: ['danfe', 'xml', 'imprimir nota', 'segunda via', 'baixar xml', 'pdf da nota'],
    passos: [
      'Abra Fiscal > Documentos Fiscais e localize a nota.',
      'Clique em "Abrir DANFE" para ver ou imprimir.',
      'Clique em "Baixar XML autorizado" para salvar o XML.',
    ],
  },
  {
    id: 'inutilizar',
    titulo: 'Como inutilizar uma numeração de nota?',
    rota: '/fiscal/inutilizacao',
    caminho: 'Fiscal > Inutilização de Numeração',
    termos: ['inutilizar', 'inutilizacao', 'pulou numero', 'numero pulado', 'quebra de sequencia'],
    passos: [
      'Abra Fiscal > Inutilização de Numeração.',
      'Escolha o modelo (NF-e ou NFC-e) e a série.',
      'Informe o número inicial e o final da faixa que foi pulada.',
      'Escreva a justificativa (mínimo de 15 caracteres) e envie.',
    ],
    dicas: ['Use apenas para números que nunca foram usados em nota autorizada.'],
  },
  {
    id: 'exportar-xmls',
    titulo: 'Como enviar os XMLs do mês para a contabilidade?',
    rota: '/fiscal/exportar-xmls',
    caminho: 'Fiscal > Exportar XMLs',
    termos: ['exportar xml', 'xmls do mes', 'contador', 'contabilidade', 'zip', 'enviar xml'],
    passos: [
      'Abra Fiscal > Exportar XMLs.',
      'Escolha a empresa, o mês e o ano.',
      'Gere o pacote e baixe o arquivo ZIP.',
      'Envie o ZIP para a contabilidade.',
    ],
    dicas: [
      'O ZIP traz notas de saída autorizadas e canceladas, cartas de correção, inutilizações, entradas e uma planilha resumo. Guarde os XMLs por 5 anos.',
    ],
  },
  {
    id: 'sped',
    titulo: 'Como gerar o SPED Fiscal do mês?',
    rota: '/fiscal/sped',
    caminho: 'Fiscal > SPED Fiscal',
    termos: ['sped', 'efd', 'efd icms ipi', 'escrituracao', 'pva', 'arquivo fiscal'],
    passos: [
      'Abra Fiscal > SPED Fiscal com a empresa certa selecionada no topo.',
      'Escolha o mês (o padrão é o mês anterior) e gere o arquivo.',
      'Confira o relatório de conferência e baixe o arquivo .txt.',
      'Valide e transmita no PVA da Receita (veja o quadro "Como entregar" na própria tela).',
    ],
    dicas: ['Confira antes o Livro de Saídas e o Resumo ICMS do mesmo mês.'],
  },
  {
    id: 'livro-saidas',
    titulo: 'Onde vejo o Livro de Saídas e o ICMS a recolher?',
    rota: '/fiscal/livro-saidas',
    caminho: 'Fiscal > Livro de Saídas (e Fiscal > Resumo ICMS)',
    termos: ['livro de saidas', 'resumo icms', 'icms a recolher', 'apuracao icms', 'livro fiscal'],
    passos: [
      'Abra Fiscal > Livro de Saídas, escolha a empresa e o período.',
      'Para o valor a recolher, abra Fiscal > Resumo ICMS no mesmo período.',
    ],
  },

  // ---------------- PDV e caixa ----------------
  {
    id: 'abrir-caixa',
    titulo: 'Como abrir o caixa?',
    rota: '/vendas/caixa',
    caminho: 'Vendas e PDV > Controle de Caixa (ou F9 no PDV)',
    termos: [
      'abrir caixa',
      'abertura de caixa',
      'fundo de troco',
      'iniciar turno',
      'caixa fechado',
    ],
    passos: [
      'Abra Vendas e PDV > Controle de Caixa e clique em Abrir Caixa. No PDV, a tecla F9 também abre o caixa quando ele está fechado.',
      'Escolha o terminal e informe o fundo de troco.',
      'Confirme. Agora o PDV já pode vender.',
    ],
    dicas: [
      'Só abre caixa quem tem a opção "é caixa" marcada no cadastro do usuário.',
      'Se o terminal aparece ocupado, outro usuário está com uma sessão aberta nele.',
    ],
  },
  {
    id: 'fechar-caixa',
    titulo: 'Como fechar o caixa?',
    rota: '/vendas/caixa',
    caminho: 'Vendas e PDV > Controle de Caixa > Fechar Meu Caixa',
    termos: [
      'fechar caixa',
      'fechamento',
      'encerrar caixa',
      'conferir caixa',
      'diferenca de caixa',
    ],
    passos: [
      'Abra Vendas e PDV > Controle de Caixa e clique em Fechar Meu Caixa (também dá para fechar pelo PDV e pelo celular).',
      'Conte o dinheiro da gaveta e digite os valores contados de cada forma de pagamento (o fechamento é "às cegas").',
      'Confirme. O sistema mostra a diferença, se houver.',
      'Se quiser, use Imprimir Relatório em PDF.',
    ],
    dicas: ['O supervisor confere depois em Ver Detalhes > Conferir como Supervisor.'],
  },
  {
    id: 'sangria',
    titulo: 'Como fazer sangria ou suprimento de caixa?',
    rota: '/vendas/caixa',
    caminho: 'Vendas e PDV > Controle de Caixa (ou F9 no PDV com o caixa aberto)',
    termos: ['sangria', 'suprimento', 'retirar dinheiro', 'colocar troco', 'retirada do caixa'],
    passos: [
      'Com o caixa aberto, abra Vendas e PDV > Controle de Caixa, ou aperte F9 no PDV.',
      'Escolha Sangria (retirada) ou Suprimento (entrada de troco).',
      'Informe o valor e o motivo e confirme.',
    ],
  },
  {
    id: 'vender-pdv',
    titulo: 'Como fazer uma venda no PDV?',
    rota: '/vendas/pdv',
    caminho: 'Vendas e PDV > PDV',
    termos: [
      'vender',
      'venda balcao',
      'pdv',
      'frente de caixa',
      'atalhos pdv',
      'teclas pdv',
      'nfce',
    ],
    passos: [
      'Abra Vendas e PDV > PDV com o caixa aberto.',
      'Leia o código de barras ou aperte F2 para localizar o produto.',
      'F3 identifica o cliente (CPF na nota), F5 escolhe o vendedor.',
      'F4 altera a quantidade, F6 dá desconto no item, F7 no total, F8 cancela um item.',
      'F10 abre o pagamento: escolha as formas e confirme com F10. A NFC-e é emitida em seguida.',
    ],
    dicas: [
      'F12 cancela a venda em andamento (fica registrado na auditoria).',
      'Depois da NFC-e, a tela oferece copiar o link, enviar por WhatsApp ou e-mail, ou imprimir.',
    ],
  },
  {
    id: 'contingencia',
    titulo: 'A SEFAZ caiu. Como emitir em contingência?',
    rota: '/vendas/pdv',
    caminho: 'Vendas e PDV > PDV',
    termos: ['contingencia', 'sefaz fora', 'sem internet', 'offline', 'sefaz caiu', 'nota nao sai'],
    passos: [
      'Finalize a venda normalmente no PDV.',
      'Se a NFC-e não for autorizada, o aviso de rejeição aparece. Clique em Emitir em contingência.',
      'A nota é emitida em contingência e enviada à SEFAZ quando ela voltar.',
    ],
    dicas: [
      'Use a contingência só quando a SEFAZ estiver fora. Erro de cadastro deve ser corrigido e reenviado.',
    ],
  },
  {
    id: 'venda-celular',
    titulo: 'Como vender ou consultar preço pelo celular?',
    rota: '/movel',
    caminho: 'Vendas e PDV > Trevvo Móvel',
    termos: ['celular', 'movel', 'telefone', 'consulta preco', 'camera', 'venda pelo celular'],
    passos: [
      'No celular, abra o Trevvo e entre em Trevvo Móvel.',
      'Consulta: leia o código de barras com a câmera para ver preço e estoque de cada loja.',
      'Venda: com o caixa do terminal PDV Móvel aberto, monte o carrinho, receba e emita a NFC-e. O cupom pode ir por WhatsApp.',
    ],
  },
  {
    id: 'troca-devolucao',
    titulo: 'Como fazer uma troca ou devolução de cliente?',
    rota: '/vendas/trocas',
    caminho: 'Vendas e PDV > Trocas e Devoluções',
    termos: ['troca', 'devolucao', 'devolver', 'vale troca', 'cliente devolveu', 'reembolso'],
    passos: [
      'Abra Vendas e PDV > Trocas e Devoluções.',
      'Busque a venda original (número, cliente ou data).',
      'Marque os itens e as quantidades devolvidas.',
      'Escolha como devolver: vale-troca, dinheiro de volta ou abater do crediário.',
      'Confirme. Se a venda teve nota, o sistema prepara a NF-e de devolução.',
    ],
    dicas: ['Passou do prazo de troca da empresa, é preciso a autorização do supervisor.'],
  },
  {
    id: 'pedido-orcamento',
    titulo: 'Como fazer um orçamento ou pedido com NF-e?',
    rota: '/vendas/pedidos',
    caminho: 'Vendas e PDV > Orçamentos e Pedidos > Novo',
    termos: [
      'orcamento',
      'pedido',
      'nfe para cliente',
      'venda com nota',
      'converter orcamento',
      'venda empresa',
    ],
    passos: [
      'Abra Vendas e PDV > Orçamentos e Pedidos e crie um novo.',
      'Escolha o cliente, adicione os produtos e as condições de pagamento.',
      'Salve como orçamento ou como pedido. Um orçamento vira pedido em Opções > Converter em Pedido.',
      'Finalize o pedido e emita a NF-e.',
    ],
  },

  // ---------------- Estoque ----------------
  {
    id: 'transferencia',
    titulo: 'Como transferir mercadoria entre lojas?',
    rota: '/estoque/transferencias',
    caminho: 'Estoque > Transferências > Nova Transferência',
    termos: [
      'transferencia',
      'transferir',
      'mandar para loja',
      'enviar mercadoria',
      'filial',
      'reposicao do dia',
    ],
    passos: [
      'Abra Estoque > Transferências e clique em Nova Transferência.',
      'Escolha a loja de origem e a de destino e adicione os produtos.',
      'Clique em Confirmar Envio da Transferência.',
      'Na lista, clique em Emitir NF-e de transferência.',
      'Na loja de destino, abra a transferência e use Receber e Conferir.',
    ],
    dicas: [
      'O botão Reposição do dia monta sozinho a transferência do que a loja 01 vendeu sem estoque.',
    ],
  },
  {
    id: 'ajustar-estoque',
    titulo: 'Como ajustar o estoque de um produto?',
    rota: '/estoque/lancamentos',
    caminho: 'Estoque > Lançamentos Manuais',
    termos: [
      'ajustar estoque',
      'acertar estoque',
      'entrada manual',
      'saida manual',
      'perda',
      'avaria',
      'quebra',
    ],
    passos: [
      'Abra Estoque > Lançamentos Manuais.',
      'Escolha o produto, o tipo (entrada ou saída) e a quantidade.',
      'Informe o motivo e salve.',
    ],
    dicas: [
      'Para contar a loja inteira, use Estoque > Inventários. Para ver o histórico do produto, use Estoque > Kardex.',
    ],
  },
  {
    id: 'inventario',
    titulo: 'Como fazer um inventário (contagem de estoque)?',
    rota: '/estoque/inventarios',
    caminho: 'Estoque > Inventários',
    termos: ['inventario', 'contagem', 'balanco', 'contar estoque'],
    passos: [
      'Abra Estoque > Inventários e crie um novo.',
      'Escolha os produtos e digite as quantidades contadas.',
      'Finalize: o sistema ajusta as diferenças no estoque.',
    ],
  },
  {
    id: 'ver-estoque',
    titulo: 'Como ver o estoque e o histórico de um produto?',
    rota: '/estoque/posicao',
    caminho: 'Estoque > Posição de Estoque (e Estoque > Kardex)',
    termos: [
      'ver estoque',
      'saldo',
      'quanto tem',
      'kardex',
      'historico do produto',
      'movimentacao',
    ],
    passos: [
      'Abra Estoque > Posição de Estoque para o saldo atual da empresa selecionada.',
      'Abra Estoque > Kardex e escolha o produto para ver cada entrada e saída.',
    ],
  },

  // ---------------- Compras ----------------
  {
    id: 'nota-entrada-xml',
    titulo: 'Como lançar uma nota de compra pelo XML?',
    rota: '/compras/notas-entrada',
    caminho: 'Compras > Notas de Entrada > Importar XML NF-e',
    termos: [
      'nota de entrada',
      'xml fornecedor',
      'importar xml',
      'lancar nota',
      'compra',
      'entrada de mercadoria',
    ],
    passos: [
      'Abra Compras > Notas de Entrada e clique em Importar XML NF-e.',
      'Escolha o arquivo XML que o fornecedor enviou.',
      'Na conferência, ligue cada item a um produto do Trevvo (ou deixe o sistema criar).',
      'Confira valores e impostos e lance a nota. O estoque e o contas a pagar são atualizados.',
    ],
    dicas: ['Sem XML, use Digitar nota.'],
  },
  {
    id: 'pedido-compra',
    titulo: 'Como fazer um pedido de compra ao fornecedor?',
    rota: '/compras/pedidos',
    caminho: 'Compras > Pedidos de Compra',
    termos: ['pedido de compra', 'comprar', 'fornecedor', 'sugestao de compra', 'repor estoque'],
    passos: [
      'Abra Compras > Pedidos de Compra e crie um novo.',
      'Escolha o fornecedor e adicione os produtos.',
      'Salve e envie ao fornecedor.',
    ],
    dicas: ['Estoque > Sugestão de Compra mostra o que está acabando.'],
  },

  // ---------------- Financeiro ----------------
  {
    id: 'pagar-conta',
    titulo: 'Como pagar (dar baixa em) uma conta?',
    rota: '/financeiro/contas-pagar',
    caminho: 'Financeiro > Contas a Pagar',
    termos: [
      'pagar conta',
      'baixa',
      'baixar titulo',
      'boleto',
      'conta a pagar',
      'fornecedor pagar',
    ],
    passos: [
      'Abra Financeiro > Contas a Pagar e filtre o vencimento.',
      'Na linha do título, clique em Pagar (ou selecione vários para pagar em lote).',
      'Escolha a conta financeira, a data e o valor pago e confirme.',
    ],
    dicas: ['Para lançar uma conta nova, use Novo título.'],
  },
  {
    id: 'receber-conta',
    titulo: 'Como registrar um recebimento de cliente?',
    rota: '/financeiro/receber',
    caminho: 'Financeiro > Contas a Receber',
    termos: [
      'receber',
      'recebimento',
      'cliente pagou',
      'conta a receber',
      'baixa recebimento',
      'fiado',
    ],
    passos: [
      'Abra Financeiro > Contas a Receber e localize o título do cliente.',
      'Clique em Receber (ou selecione vários para receber em lote).',
      'Escolha a conta financeira, a data e o valor e confirme.',
    ],
    dicas: ['Financeiro > Inadimplência mostra quem está em atraso.'],
  },
  {
    id: 'fluxo-caixa',
    titulo: 'Onde vejo o fluxo de caixa e o DRE?',
    rota: '/financeiro/fluxo-caixa',
    caminho: 'Financeiro > Fluxo de Caixa (e Financeiro > DRE)',
    termos: ['fluxo de caixa', 'dre', 'resultado', 'lucro', 'saldo bancario', 'extrato'],
    passos: [
      'Abra Financeiro > Fluxo de Caixa e escolha o período.',
      'Para o resultado do mês, abra Financeiro > DRE.',
      'Para o extrato de cada conta, abra Financeiro > Extrato Bancário.',
    ],
  },

  // ---------------- Cadastros ----------------
  {
    id: 'novo-produto',
    titulo: 'Como cadastrar um produto novo?',
    rota: '/cadastros/produtos',
    caminho: 'Cadastros > Produtos > Novo Produto',
    termos: [
      'cadastrar produto',
      'novo produto',
      'incluir produto',
      'codigo de barras',
      'ean',
      'preco',
    ],
    passos: [
      'Abra Cadastros > Produtos e clique em Novo Produto.',
      'Preencha descrição, unidade, código de barras (EAN), marca e categoria.',
      'Na aba fiscal, escolha o perfil tributário e confira NCM e CEST.',
      'Informe preço e custo e salve. O código é gerado sozinho.',
    ],
    dicas: [
      'Produtos médicos: preencha o registro ANVISA. Produtos marcados "fiscal não revisado" aparecem em Cadastros > Conferência fiscal.',
    ],
  },
  {
    id: 'novo-cliente',
    titulo: 'Como cadastrar um cliente?',
    rota: '/cadastros/clientes',
    caminho: 'Cadastros > Clientes (ou F3 no PDV)',
    termos: ['cadastrar cliente', 'novo cliente', 'cpf', 'cnpj cliente', 'endereco cliente'],
    passos: [
      'Abra Cadastros > Clientes e crie um novo.',
      'Informe CPF ou CNPJ, nome, endereço e contatos e salve.',
    ],
    dicas: ['No PDV, F3 permite cadastrar um cliente rápido sem sair da venda.'],
  },
  {
    id: 'novo-fornecedor',
    titulo: 'Como cadastrar um fornecedor?',
    rota: '/cadastros/fornecedores',
    caminho: 'Cadastros > Fornecedores',
    termos: ['cadastrar fornecedor', 'novo fornecedor', 'fornecedor'],
    passos: [
      'Abra Cadastros > Fornecedores e crie um novo.',
      'Informe CNPJ, razão social, IE e endereço e salve.',
    ],
    dicas: ['Ao importar o XML de uma compra, o fornecedor pode ser criado automaticamente.'],
  },
  {
    id: 'novo-usuario',
    titulo: 'Como criar um usuário e dar permissões?',
    rota: '/cadastros/usuarios',
    caminho: 'Configurações > Usuários (e Configurações > Perfis de acesso)',
    termos: [
      'usuario',
      'novo usuario',
      'permissao',
      'acesso',
      'senha',
      'funcionario',
      'perfil de acesso',
      'login',
    ],
    passos: [
      'Abra Configurações > Perfis de acesso e confira (ou crie) o perfil com as telas que a pessoa pode ver.',
      'Abra Configurações > Usuários e crie o usuário.',
      'Escolha o perfil de acesso e as empresas (lojas) que ele pode usar.',
      'Para operar o caixa, marque a opção de caixa. Salve.',
    ],
  },

  // ---------------- Marketplaces ----------------
  {
    id: 'saude-anuncios',
    titulo: 'Como ver anúncios pausados ou com problema no Mercado Livre?',
    rota: '/configuracoes/mercado-livre',
    caminho: 'Configurações > Integração Mercado Livre > Saúde dos anúncios',
    termos: [
      'anuncio pausado',
      'mercado livre',
      'ml',
      'saude dos anuncios',
      'anuncio bloqueado',
      'politica',
      'anvisa',
    ],
    passos: [
      'Abra Configurações > Integração Mercado Livre.',
      'No quadro Saúde dos anúncios, veja os anúncios com problema (a verificação roda todo dia de manhã).',
      'Use os filtros Política, Pausado sem motivo e Estoque divergente.',
      'Clique em Verificar agora para atualizar na hora. O link de cada anúncio abre no Mercado Livre.',
    ],
  },
  {
    id: 'conectar-shopee',
    titulo: 'Como conectar a loja da Shopee?',
    rota: '/configuracoes/shopee',
    caminho: 'Configurações > Integração Shopee',
    termos: ['shopee', 'conectar shopee', 'integracao shopee', 'marketplace'],
    passos: [
      'Abra Configurações > Integração Shopee com a empresa certa selecionada.',
      'Clique em Conectar à Shopee e autorize com a conta do vendedor.',
      'De volta ao Trevvo, clique em Testar conexão.',
    ],
    dicas: [
      'Só administrador conecta. O Partner ID e a chave precisam estar configurados no servidor.',
    ],
  },

  // ---------------- Geral ----------------
  {
    id: 'trocar-empresa',
    titulo: 'Como trocar de loja (empresa) no sistema?',
    rota: '/painel',
    caminho: 'Barra do topo > seletor de empresa',
    termos: ['trocar empresa', 'trocar loja', 'mudar loja', 'outra filial', 'empresa ativa'],
    passos: [
      'No topo da tela, clique no seletor de empresa.',
      'Escolha a loja. Telas e relatórios passam a mostrar os dados dela.',
    ],
    dicas: ['Com o caixa aberto no PDV, a troca de empresa fica bloqueada.'],
  },
  {
    id: 'relatorios',
    titulo: 'Onde ficam os relatórios?',
    rota: '/relatorios',
    caminho: 'Relatórios > Central de Relatórios',
    termos: [
      'relatorio',
      'vendas por periodo',
      'relatorio de vendas',
      'curva abc',
      'comissao',
      'exportar csv',
    ],
    passos: [
      'Abra Relatórios > Central de Relatórios.',
      'Escolha o relatório, a empresa (ou todas) e o período.',
      'Use Exportar CSV para levar para o Excel.',
    ],
  },
]
