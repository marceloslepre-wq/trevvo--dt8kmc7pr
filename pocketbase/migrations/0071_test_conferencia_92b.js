// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0071: Conferência e teste do Prompt 9.2b (idempotente)
 * 1. Garante que todos os registros existentes nas 18 coleções possuem assinante_id preenchido com HOSPITAL HOME (wqxiw7olvkup3sm)
 * 2. Realiza o teste rápido de CRUD e busca de produtos do PDV em nome do usuário master marceloslepre@gmail.com
 * 3. Remove os registros de teste criados
 */
migrate(
  (app) => {
    const assinanteHomeId = 'wqxiw7olvkup3sm'
    const colecoes18 = [
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

    console.log('[0071] Iniciando conferência e garantia de assinante_id nas 18 coleções...')
    for (let i = 0; i < colecoes18.length; i++) {
      const colName = colecoes18[i]
      try {
        app
          .db()
          .newQuery(
            `UPDATE ${colName} SET assinante_id = '${assinanteHomeId}' WHERE assinante_id IS NULL OR assinante_id = ''`,
          )
          .execute()
      } catch (err) {
        console.warn(`[0071] Aviso ao atualizar ${colName}:`, err)
      }
    }

    // Teste rápido de CRUD com o usuário master
    console.log('[0071] Executando teste rápido de gravação, leitura e exclusão (Prompt 9.2b)...')
    try {
      // 1. Criar Marca de Teste
      const marcasCol = app.findCollectionByNameOrId('marcas')
      const marcaRec = new Record(marcasCol)
      marcaRec.set('nome', 'TESTE 9.2B MARCA')
      marcaRec.set('fabricante', 'TESTE 9.2B FABRICANTE')
      marcaRec.set('ativo', true)
      marcaRec.set('assinante_id', assinanteHomeId)
      app.save(marcaRec)
      const marcaId = marcaRec.id
      console.log(
        '[0071] Marca de teste criada com sucesso:',
        marcaId,
        'assinante_id:',
        marcaRec.getString('assinante_id'),
      )

      // Edição
      marcaRec.set('fabricante', 'TESTE 9.2B FABRICANTE EDITADO')
      app.save(marcaRec)
      console.log('[0071] Marca de teste editada com sucesso.')

      // 2. Criar Cliente de Teste
      const clientesCol = app.findCollectionByNameOrId('clientes')
      const clienteRec = new Record(clientesCol)
      clienteRec.set('tipo_pessoa', 'Física')
      clienteRec.set('nome_razao_social', 'TESTE 9.2B CLIENTE')
      clienteRec.set('cpf_cnpj', '999.888.777-66')
      clienteRec.set('indicador_ie', '9')
      clienteRec.set('consumidor_final', true)
      clienteRec.set('ativo', true)
      clienteRec.set('assinante_id', assinanteHomeId)
      app.save(clienteRec)
      const clienteId = clienteRec.id
      console.log(
        '[0071] Cliente de teste criado com sucesso:',
        clienteId,
        'assinante_id:',
        clienteRec.getString('assinante_id'),
      )

      // Edição
      clienteRec.set('nome_fantasia', 'TESTE 9.2B FANTASIA')
      app.save(clienteRec)
      console.log('[0071] Cliente de teste editado com sucesso.')

      // 3. Criar Forma de Pagamento de Teste
      const formasCol = app.findCollectionByNameOrId('formas_pagamento')
      const formaRec = new Record(formasCol)
      formaRec.set('descricao', 'TESTE 9.2B FORMA')
      formaRec.set('codigo_tpag', '99')
      formaRec.set('tipo', 'Outros')
      formaRec.set('taxa_percentual', 0)
      formaRec.set('dias_para_recebimento', 0)
      formaRec.set('ativo', true)
      formaRec.set('assinante_id', assinanteHomeId)
      app.save(formaRec)
      const formaId = formaRec.id
      console.log(
        '[0071] Forma de pagamento de teste criada com sucesso:',
        formaId,
        'assinante_id:',
        formaRec.getString('assinante_id'),
      )

      // Edição
      formaRec.set('descricao', 'TESTE 9.2B FORMA EDITADA')
      app.save(formaRec)
      console.log('[0071] Forma de pagamento de teste editada com sucesso.')

      // 4. Criar Produto de Teste
      const prodsCol = app.findCollectionByNameOrId('produtos')
      const prodRec = new Record(prodsCol)
      prodRec.set('descricao', 'TESTE 9.2B PRODUTO SABONETE')
      prodRec.set('gtin', '7899999999991')
      prodRec.set('tipo', 'Produto')
      prodRec.set('preco_venda', 19.9)
      prodRec.set('ativo', true)
      prodRec.set('marca_id', marcaId)
      prodRec.set('assinante_id', assinanteHomeId)
      app.save(prodRec)
      const prodId = prodRec.id
      console.log(
        '[0071] Produto de teste criado com sucesso:',
        prodId,
        'assinante_id:',
        prodRec.getString('assinante_id'),
      )

      // Edição
      prodRec.set('preco_venda', 24.5)
      prodRec.set('descricao', 'TESTE 9.2B PRODUTO SABONETE EDITADO')
      app.save(prodRec)
      console.log('[0071] Produto de teste editado com sucesso.')

      // 5. Conferência da busca de produtos do PDV
      const prodsEncontrados = app.findRecordsByFilter(
        'produtos',
        "ativo = true && gtin = '7899999999991'",
        '-created',
        1,
        0,
      )
      if (!prodsEncontrados || prodsEncontrados.length === 0) {
        throw new Error('[0071] Falha no teste de busca do PDV: produto de teste não encontrado!')
      }
      console.log(
        '[0071] Busca do PDV encontrou o produto:',
        prodsEncontrados[0].getString('descricao'),
      )

      // 6. Exclusão dos registros de teste
      app.delete(prodRec)
      console.log('[0071] Produto de teste excluído.')
      app.delete(marcaRec)
      console.log('[0071] Marca de teste excluída.')
      app.delete(clienteRec)
      console.log('[0071] Cliente de teste excluído.')
      app.delete(formaRec)
      console.log('[0071] Forma de pagamento de teste excluída.')

      console.log('[0071] Teste 9.2b concluído com sucesso e registros limpos!')
    } catch (testErr) {
      console.error('[0071] Erro no teste 9.2b:', testErr)
      throw testErr
    }
  },
  (app) => {},
)
