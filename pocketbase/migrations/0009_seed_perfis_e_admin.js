migrate(
  (app) => {
    const perfisCol = app.findCollectionByNameOrId('perfis_acesso')
    const permissoesCol = app.findCollectionByNameOrId('permissoes')
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const usuariosEmpresasCol = app.findCollectionByNameOrId('usuarios_empresas')
    const empresasCol = app.findCollectionByNameOrId('empresas')

    const modulos = [
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

    // Definição dos perfis iniciais
    const perfisIniciais = [
      {
        nome: 'Administrador',
        descricao: 'Acesso total irrestrito ao sistema e a todas as empresas',
        administrador: true,
        // Administrador tem tudo true em todas as permissões
        permissoes: (mod) => ({ ver: true, criar: true, editar: true, excluir: true }),
      },
      {
        nome: 'Gerente',
        descricao: 'Gestão geral da empresa (usuarios, perfis e configuracoes apenas visualização)',
        administrador: false,
        permissoes: (mod) => {
          if (mod === 'usuarios' || mod === 'perfis_acesso' || mod === 'configuracoes') {
            return { ver: true, criar: false, editar: false, excluir: false }
          }
          return { ver: true, criar: true, editar: true, excluir: true }
        },
      },
      {
        nome: 'Financeiro',
        descricao:
          'Operações financeiras, contas a pagar, receber, clientes, fornecedores e relatórios',
        administrador: false,
        permissoes: (mod) => {
          if (
            ['financeiro_pagar', 'financeiro_receber', 'clientes', 'fornecedores'].includes(mod)
          ) {
            return { ver: true, criar: true, editar: true, excluir: false }
          }
          if (mod === 'relatorios' || mod === 'painel') {
            return { ver: true, criar: false, editar: false, excluir: false }
          }
          return { ver: false, criar: false, editar: false, excluir: false }
        },
      },
      {
        nome: 'Estoquista',
        descricao:
          'Controle de estoque, compras, notas de entrada, produtos e cadastros relacionados',
        administrador: false,
        permissoes: (mod) => {
          if (
            [
              'produtos',
              'estoque',
              'compras',
              'notas_entrada',
              'marcas',
              'grupos_categorias',
              'unidades_medida',
            ].includes(mod)
          ) {
            return { ver: true, criar: true, editar: true, excluir: false }
          }
          if (mod === 'fornecedores' || mod === 'painel') {
            return { ver: true, criar: false, editar: false, excluir: false }
          }
          return { ver: false, criar: false, editar: false, excluir: false }
        },
      },
      {
        nome: 'Vendedor/Caixa',
        descricao: 'Frente de caixa, PDV, vendas, clientes e consulta de produtos',
        administrador: false,
        permissoes: (mod) => {
          if (['vendas', 'pdv', 'caixa', 'clientes'].includes(mod)) {
            return { ver: true, criar: true, editar: false, excluir: false }
          }
          if (mod === 'produtos' || mod === 'painel') {
            return { ver: true, criar: false, editar: false, excluir: false }
          }
          return { ver: false, criar: false, editar: false, excluir: false }
        },
      },
      {
        nome: 'Contador',
        descricao: 'Acesso para conferência fiscal e contábil em modo somente leitura',
        administrador: false,
        permissoes: (mod) => {
          if (
            [
              'tabelas_fiscais',
              'notas_entrada',
              'notas_saida',
              'sped',
              'produtos',
              'empresas',
              'relatorios',
              'painel',
            ].includes(mod)
          ) {
            return { ver: true, criar: false, editar: false, excluir: false }
          }
          return { ver: false, criar: false, editar: false, excluir: false }
        },
      },
    ]

    let adminPerfilId = null

    for (let i = 0; i < perfisIniciais.length; i++) {
      const pDef = perfisIniciais[i]
      let pRecord
      try {
        pRecord = app.findFirstRecordByData('perfis_acesso', 'nome', pDef.nome)
      } catch (_) {
        pRecord = new Record(perfisCol)
        pRecord.set('nome', pDef.nome)
        pRecord.set('descricao', pDef.descricao)
        pRecord.set('administrador', pDef.administrador)
        pRecord.set('ativo', true)
        app.save(pRecord)
      }

      if (pDef.administrador) {
        adminPerfilId = pRecord.id
      }

      // Preenche as permissões para os 23 módulos
      for (let m = 0; m < modulos.length; m++) {
        const modName = modulos[m]
        const permRules = pDef.permissoes(modName)

        let permRecord
        try {
          const existing = app.findRecordsByFilter(
            'permissoes',
            `perfil_id = '${pRecord.id}' && modulo = '${modName}'`,
            '',
            1,
            0,
          )
          if (existing && existing.length > 0) {
            permRecord = existing[0]
          }
        } catch (_) {}

        if (!permRecord) {
          permRecord = new Record(permissoesCol)
          permRecord.set('perfil_id', pRecord.id)
          permRecord.set('modulo', modName)
        }

        permRecord.set('ativo', true)
        permRecord.set('pode_ver', Boolean(permRules.ver))
        permRecord.set('pode_criar', Boolean(permRules.criar))
        permRecord.set('pode_editar', Boolean(permRules.editar))
        permRecord.set('pode_excluir', Boolean(permRules.excluir))
        app.save(permRecord)
      }
    }

    // 2. Vincular o usuário administrador existente (marceloslepre@gmail.com) na tabela usuarios
    try {
      const authUser = app.findAuthRecordByEmail('_pb_users_auth_', 'marceloslepre@gmail.com')
      if (authUser && adminPerfilId) {
        let usuarioRecord
        try {
          usuarioRecord = app.findFirstRecordByData('usuarios', 'email', 'marceloslepre@gmail.com')
        } catch (_) {
          usuarioRecord = new Record(usuariosCol)
          usuarioRecord.set('email', 'marceloslepre@gmail.com')
        }

        usuarioRecord.set('nome', authUser.getString('name') || 'Marcelo Lepre')
        usuarioRecord.set('auth_user_id', authUser.id)
        usuarioRecord.set('perfil_id', adminPerfilId)
        usuarioRecord.set('ativo', true)
        usuarioRecord.set('desconto_maximo_percentual', 0)
        usuarioRecord.set('comissao_percentual', 0)
        usuarioRecord.set('e_vendedor', false)
        usuarioRecord.set('e_caixa', false)

        // Definir empresa padrão como a primeira empresa encontrada (se houver)
        try {
          const empresas = app.findRecordsByFilter('empresas', 'ativo = true', 'codigo', 1, 0)
          if (empresas && empresas.length > 0) {
            usuarioRecord.set('empresa_padrao_id', empresas[0].id)
          }
        } catch (_) {}

        app.save(usuarioRecord)

        // Vincular o administrador a todas as empresas existentes
        try {
          const todasEmpresas = app.findRecordsByFilter('empresas', '', '', 100, 0)
          for (let e = 0; e < todasEmpresas.length; e++) {
            const emp = todasEmpresas[e]
            try {
              const jaExiste = app.findRecordsByFilter(
                'usuarios_empresas',
                `usuario_id = '${usuarioRecord.id}' && empresa_id = '${emp.id}'`,
                '',
                1,
                0,
              )
              if (!jaExiste || jaExiste.length === 0) {
                const ueRec = new Record(usuariosEmpresasCol)
                ueRec.set('usuario_id', usuarioRecord.id)
                ueRec.set('empresa_id', emp.id)
                ueRec.set('ativo', true)
                app.save(ueRec)
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão segura
  },
)
