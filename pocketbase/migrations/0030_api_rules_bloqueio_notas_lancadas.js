migrate(
  (app) => {
    // 1. notas_entrada: não pode atualizar se status for Lançada ou Cancelada
    // e exclusão é proibida diretamente pela API para qualquer status (cancelamento vira status 'Cancelada', não delete)
    try {
      const colNotas = app.findCollectionByNameOrId('notas_entrada')
      if (colNotas) {
        colNotas.updateRule = "@request.auth.id != '' && status = 'Em conferência'"
        colNotas.deleteRule = "@request.auth.id != '' && status = 'Em conferência'"
        app.save(colNotas)
      }
    } catch (e) {
      console.warn('Erro ao atualizar regras de notas_entrada:', e)
    }

    // 2. notas_entrada_itens: só pode atualizar/deletar se a nota vinculada estiver 'Em conferência'
    try {
      const colItens = app.findCollectionByNameOrId('notas_entrada_itens')
      if (colItens) {
        colItens.createRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        colItens.updateRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        colItens.deleteRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        app.save(colItens)
      }
    } catch (e) {
      console.warn('Erro ao atualizar regras de notas_entrada_itens:', e)
    }

    // 3. notas_entrada_parcelas: só pode atualizar/deletar se a nota vinculada estiver 'Em conferência'
    try {
      const colParcelas = app.findCollectionByNameOrId('notas_entrada_parcelas')
      if (colParcelas) {
        colParcelas.createRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        colParcelas.updateRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        colParcelas.deleteRule =
          "@request.auth.id != '' && @collection.notas_entrada.id = nota_id && @collection.notas_entrada.status = 'Em conferência'"
        app.save(colParcelas)
      }
    } catch (e) {
      console.warn('Erro ao atualizar regras de notas_entrada_parcelas:', e)
    }
  },
  (app) => {
    try {
      const colNotas = app.findCollectionByNameOrId('notas_entrada')
      if (colNotas) {
        colNotas.updateRule = "@request.auth.id != ''"
        colNotas.deleteRule = "@request.auth.id != ''"
        app.save(colNotas)
      }
      const colItens = app.findCollectionByNameOrId('notas_entrada_itens')
      if (colItens) {
        colItens.createRule = "@request.auth.id != ''"
        colItens.updateRule = "@request.auth.id != ''"
        colItens.deleteRule = "@request.auth.id != ''"
        app.save(colItens)
      }
      const colParcelas = app.findCollectionByNameOrId('notas_entrada_parcelas')
      if (colParcelas) {
        colParcelas.createRule = "@request.auth.id != ''"
        colParcelas.updateRule = "@request.auth.id != ''"
        colParcelas.deleteRule = "@request.auth.id != ''"
        app.save(colParcelas)
      }
    } catch (_) {}
  },
)
