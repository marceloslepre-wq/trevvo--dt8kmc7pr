migrate(
  (app) => {
    // 1. Atualizar collection permissoes para aceitar 'condicoes_pagamento' no select modulo
    const permissoesCol = app.findCollectionByNameOrId('permissoes')
    const moduloField = permissoesCol.fields.getByName('modulo')
    if (moduloField) {
      const novosValores = [
        'painel',
        'empresas',
        'usuarios',
        'perfis_acesso',
        'clientes',
        'fornecedores',
        'produtos',
        'marcas',
        'grupos_categorias',
        'unidades_medida',
        'tabelas_fiscais',
        'condicoes_pagamento',
        'estoque',
        'compras',
        'notas_entrada',
        'financeiro_pagar',
        'financeiro_receber',
        'vendas',
        'pdv',
        'caixa',
        'notas_saida',
        'sped',
        'relatorios',
        'configuracoes',
      ]
      moduloField.values = novosValores
      app.save(permissoesCol)
    }

    // 2. Adicionar permissão padrão de condicoes_pagamento para perfis existentes
    // Regra da tarefa: Administrador, Gerente e Financeiro -> total (ver/criar/editar/excluir)
    // Vendedor/Caixa e Estoquista -> só ver
    // Contador -> ver (pelo padrão fiscal)
    const perfis = app.findRecordsByFilter('perfis_acesso', '', '', 100, 0)
    for (let p = 0; p < perfis.length; p++) {
      const perfil = perfis[p]
      const nome = perfil.getString('nome')
      const isAdmin = perfil.getBool('administrador') || nome === 'Administrador'

      let podeVer = false
      let podeCriar = false
      let podeEditar = false
      let podeExcluir = false

      if (isAdmin || ['Administrador', 'Gerente', 'Financeiro'].includes(nome)) {
        podeVer = true
        podeCriar = true
        podeEditar = true
        podeExcluir = true
      } else if (['Estoquista', 'Vendedor/Caixa', 'Contador'].includes(nome)) {
        podeVer = true
        podeCriar = false
        podeEditar = false
        podeExcluir = false
      }

      let permRecord = null
      try {
        const exist = app.findRecordsByFilter(
          'permissoes',
          `perfil_id = '${perfil.id}' && modulo = 'condicoes_pagamento'`,
          '',
          1,
          0,
        )
        if (exist && exist.length > 0) {
          permRecord = exist[0]
        }
      } catch (_) {}

      if (!permRecord) {
        permRecord = new Record(permissoesCol)
        permRecord.set('perfil_id', perfil.id)
        permRecord.set('modulo', 'condicoes_pagamento')
      }

      permRecord.set('ativo', true)
      permRecord.set('pode_ver', podeVer)
      permRecord.set('pode_criar', podeCriar)
      permRecord.set('pode_editar', podeEditar)
      permRecord.set('pode_excluir', podeExcluir)
      app.save(permRecord)
    }

    // 3. Adicionar condicao_pagamento_id em clientes e fornecedores
    const condicoesColId = app.findCollectionByNameOrId('condicoes_pagamento').id

    const clientesCol = app.findCollectionByNameOrId('clientes')
    if (!clientesCol.fields.getByName('condicao_pagamento_id')) {
      clientesCol.fields.add(
        new RelationField({
          name: 'condicao_pagamento_id',
          required: false,
          collectionId: condicoesColId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      clientesCol.addIndex('idx_clientes_condicao_pagamento', false, 'condicao_pagamento_id', '')
      app.save(clientesCol)
    }

    const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
    if (!fornecedoresCol.fields.getByName('condicao_pagamento_id')) {
      fornecedoresCol.fields.add(
        new RelationField({
          name: 'condicao_pagamento_id',
          required: false,
          collectionId: condicoesColId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      fornecedoresCol.addIndex(
        'idx_fornecedores_condicao_pagamento',
        false,
        'condicao_pagamento_id',
        '',
      )
      app.save(fornecedoresCol)
    }
  },
  (app) => {
    // Reversão segura
    try {
      const clientesCol = app.findCollectionByNameOrId('clientes')
      clientesCol.removeIndex('idx_clientes_condicao_pagamento')
      clientesCol.fields.removeByName('condicao_pagamento_id')
      app.save(clientesCol)
    } catch (_) {}

    try {
      const fornecedoresCol = app.findCollectionByNameOrId('fornecedores')
      fornecedoresCol.removeIndex('idx_fornecedores_condicao_pagamento')
      fornecedoresCol.fields.removeByName('condicao_pagamento_id')
      app.save(fornecedoresCol)
    } catch (_) {}
  },
)
