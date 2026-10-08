migrate(
  (app) => {
    // Atualiza a permissão do módulo financeiro_pagar para os perfis padrão:
    // Administrador, Gerente e Financeiro -> pode_ver, pode_criar, pode_editar, pode_excluir = true
    // Demais perfis -> false

    const perfis = app.findRecordsByFilter('perfis_acesso', 'ativo = true', 'nome', 100, 0)
    const permissoesCol = app.findCollectionByNameOrId('permissoes')

    for (const perfil of perfis) {
      const nome = perfil.getString('nome')
      const isAdmin = perfil.getBool('administrador') || nome === 'Administrador'
      const temAcessoTotal = isAdmin || nome === 'Gerente' || nome === 'Financeiro'

      let permRecord
      try {
        permRecord = app.findFirstRecordByData('permissoes', 'perfil_id', perfil.id)
        // Como pode haver várias permissões por perfil, buscamos pelo filtro perfil_id + modulo
        const lista = app.findRecordsByFilter(
          'permissoes',
          `perfil_id = '${perfil.id}' && modulo = 'financeiro_pagar'`,
          '',
          1,
          0,
        )
        if (lista.length > 0) {
          permRecord = lista[0]
        } else {
          permRecord = new Record(permissoesCol)
          permRecord.set('perfil_id', perfil.id)
          permRecord.set('modulo', 'financeiro_pagar')
        }
      } catch (_) {
        permRecord = new Record(permissoesCol)
        permRecord.set('perfil_id', perfil.id)
        permRecord.set('modulo', 'financeiro_pagar')
      }

      permRecord.set('pode_ver', temAcessoTotal)
      permRecord.set('pode_criar', temAcessoTotal)
      permRecord.set('pode_editar', temAcessoTotal)
      permRecord.set('pode_excluir', temAcessoTotal)
      permRecord.set('ativo', true)

      app.save(permRecord)
    }
  },
  (app) => {
    // Revert: volta Financeiro pode_excluir para false se necessário
    try {
      const perfis = app.findRecordsByFilter('perfis_acesso', "nome = 'Financeiro'", '', 1, 0)
      if (perfis.length > 0) {
        const perfilFinanceiro = perfis[0]
        const lista = app.findRecordsByFilter(
          'permissoes',
          `perfil_id = '${perfilFinanceiro.id}' && modulo = 'financeiro_pagar'`,
          '',
          1,
          0,
        )
        if (lista.length > 0) {
          lista[0].set('pode_excluir', false)
          app.save(lista[0])
        }
      }
    } catch (_) {}
  },
)
