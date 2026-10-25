import PocketBase from 'pocketbase'

const PB_URL =
  process.env.VITE_POCKETBASE_URL ||
  'https://erp-de-gestao-comercial-24560.shrd03.internal.goskip.dev'

const COLS = [
  'produtos',
  'clientes',
  'fornecedores',
  'marcas',
  'grupos',
  'categorias',
  'condicoes_pagamento',
  'plano_contas',
  'centros_custo',
  'formas_pagamento',
  'perfis_tributarios',
  'regras_fiscais_ncm',
  'configuracoes',
  'relatorios_filtros_salvos',
  'relatorios_salvos',
  'empresas',
  'usuarios',
  'perfis_acesso',
]

const ASSINANTE_ID = 'wqxiw7olvkup3sm'

async function run() {
  const pb = new PocketBase(PB_URL)

  console.log('--- Autenticando com marceloslepre@gmail.com ---')
  const authData = await pb
    .collection('users')
    .authWithPassword('marceloslepre@gmail.com', 'Skip@Pass')
  console.log('Autenticado com sucesso:', authData.record.email, '| tipo:', authData.record.tipo)

  console.log('\n--- 1. Conferência das 18 coleções ---')
  const contagens = []
  for (const col of COLS) {
    try {
      const allRecords = await pb.collection(col).getFullList({ requestKey: null })
      const total = allRecords.length
      const semAssinante = allRecords.filter((r) => !r.assinante_id).length
      const outroAssinante = allRecords.filter(
        (r) => r.assinante_id && r.assinante_id !== ASSINANTE_ID,
      ).length
      const hospitalHome = allRecords.filter((r) => r.assinante_id === ASSINANTE_ID).length

      contagens.push({
        colecao: col,
        total,
        semAssinante,
        outroAssinante,
        hospitalHome,
      })
    } catch (err) {
      console.error(`Erro ao consultar ${col}:`, err.message || err)
    }
  }

  console.table(contagens)

  console.log('\n--- 2. Testes de Gravação, Leitura e Exclusão com Usuário Master ---')

  // A. Marca
  console.log('\n[TESTE MARCA]')
  const marcaCriada = await pb.collection('marcas').create({
    nome: 'TESTE 9.2B MARCA',
    fabricante: 'TESTE 9.2B FABRICANTE',
    ativo: true,
  })
  console.log('Marca criada ID:', marcaCriada.id, '| assinante_id:', marcaCriada.assinante_id)
  if (marcaCriada.assinante_id !== ASSINANTE_ID) {
    throw new Error(`Assinante_id divergente na marca: ${marcaCriada.assinante_id}`)
  }

  const marcaEditada = await pb.collection('marcas').update(marcaCriada.id, {
    fabricante: 'TESTE 9.2B FABRICANTE EDITADO',
  })
  console.log(
    'Marca editada:',
    marcaEditada.fabricante,
    '| assinante_id mantido:',
    marcaEditada.assinante_id,
  )

  // B. Cliente
  console.log('\n[TESTE CLIENTE]')
  const clienteCriado = await pb.collection('clientes').create({
    tipo_pessoa: 'Física',
    nome_razao_social: 'TESTE 9.2B CLIENTE',
    cpf_cnpj: '999.888.777-66',
    ativo: true,
  })
  console.log('Cliente criado ID:', clienteCriado.id, '| assinante_id:', clienteCriado.assinante_id)
  if (clienteCriado.assinante_id !== ASSINANTE_ID) {
    throw new Error(`Assinante_id divergente no cliente: ${clienteCriado.assinante_id}`)
  }

  const clienteEditado = await pb.collection('clientes').update(clienteCriado.id, {
    nome_fantasia: 'TESTE 9.2B FANTASIA',
  })
  console.log(
    'Cliente editado:',
    clienteEditado.nome_fantasia,
    '| assinante_id mantido:',
    clienteEditado.assinante_id,
  )

  // C. Forma de Pagamento
  console.log('\n[TESTE FORMA PAGAMENTO]')
  const formaCriada = await pb.collection('formas_pagamento').create({
    descricao: 'TESTE 9.2B FORMA',
    codigo_tpag: '99',
    tipo: 'Outros',
    ativo: true,
    taxa_percentual: 0,
    dias_para_recebimento: 0,
  })
  console.log('Forma criada ID:', formaCriada.id, '| assinante_id:', formaCriada.assinante_id)
  if (formaCriada.assinante_id !== ASSINANTE_ID) {
    throw new Error(`Assinante_id divergente na forma: ${formaCriada.assinante_id}`)
  }

  const formaEditada = await pb.collection('formas_pagamento').update(formaCriada.id, {
    descricao: 'TESTE 9.2B FORMA EDITADA',
  })
  console.log(
    'Forma editada:',
    formaEditada.descricao,
    '| assinante_id mantido:',
    formaEditada.assinante_id,
  )

  // D. Produto
  console.log('\n[TESTE PRODUTO]')
  const prodCriado = await pb.collection('produtos').create({
    descricao: 'TESTE 9.2B PRODUTO SABONETE',
    gtin: '7899999999991',
    tipo: 'Produto',
    preco_venda: 19.9,
    ativo: true,
    marca_id: marcaCriada.id,
  })
  console.log('Produto criado ID:', prodCriado.id, '| assinante_id:', prodCriado.assinante_id)
  if (prodCriado.assinante_id !== ASSINANTE_ID) {
    throw new Error(`Assinante_id divergente no produto: ${prodCriado.assinante_id}`)
  }

  const prodEditado = await pb.collection('produtos').update(prodCriado.id, {
    descricao: 'TESTE 9.2B PRODUTO SABONETE EDITADO',
    preco_venda: 24.5,
  })
  console.log(
    'Produto editado:',
    prodEditado.descricao,
    '| preco:',
    prodEditado.preco_venda,
    '| assinante_id mantido:',
    prodEditado.assinante_id,
  )

  // E. Teste do serviço de busca de produtos do PDV
  console.log('\n[TESTE BUSCA PRODUTOS DO PDV]')
  const prodsPDV = await pb.collection('produtos').getFullList({
    filter: 'ativo = true',
    sort: 'descricao',
    requestKey: null,
  })
  console.log(`PDV encontrou ${prodsPDV.length} produto(s) ativo(s).`)
  const achouTeste = prodsPDV.find((p) => p.id === prodCriado.id)
  if (!achouTeste) {
    throw new Error('Produto de teste não foi retornado na listagem do PDV!')
  }
  console.log(
    'Produto de teste localizado pelo PDV:',
    achouTeste.descricao,
    '| GTIN:',
    achouTeste.gtin,
  )

  // F. Exclusão de todos os registros de teste
  console.log('\n--- 3. Exclusão dos registros de teste ---')
  await pb.collection('produtos').delete(prodCriado.id)
  console.log('Produto de teste excluído.')

  await pb.collection('marcas').delete(marcaCriada.id)
  console.log('Marca de teste excluída.')

  await pb.collection('clientes').delete(clienteCriado.id)
  console.log('Cliente de teste excluído.')

  await pb.collection('formas_pagamento').delete(formaCriada.id)
  console.log('Forma de pagamento de teste excluída.')

  console.log('\nTodos os registros de teste foram devidamente removidos!')
}

run().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
