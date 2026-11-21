// @ts-check
/// <reference path="../types.d.ts" />

/**
 * Migration 0137: limpa referências órfãs (relações que apontam para registros apagados)
 *
 * Causa do erro ao abrir caixa em 21/11/2026:
 *   "updated_by: Failed to find all relation records with the provided ids."
 * A limpeza de testes de 16/11 apagou usuários de teste (e outros registros) por SQL
 * direto. Registros que ficaram (contas financeiras, terminais, configs etc.) ainda
 * guardavam created_by/updated_by desses usuários. Qualquer app.save() nesses registros
 * falha na validação da relação. Ex.: suprimento automático salva a conta do cofre.
 *
 * O que faz: em todas as coleções (não view), para cada campo relation de seleção única
 * e NÃO obrigatório, zera o valor quando o id não existe mais na coleção de destino.
 * Campos obrigatórios e de seleção múltipla são ignorados (só listados no log).
 * Idempotente: rodar de novo não muda nada.
 */
migrate(
  (app) => {
    let colecoes = []
    try {
      colecoes = app.findAllCollections()
    } catch (errC) {
      console.log('[0137] erro ao listar coleções: ' + errC)
      return
    }

    let totalZerados = 0
    const avisos = []

    for (let i = 0; i < colecoes.length; i++) {
      const col = colecoes[i]
      if (!col || col.type === 'view' || col.system) continue
      const tabela = col.name

      const campos = col.fields || []
      for (let j = 0; j < campos.length; j++) {
        const f = campos[j]
        if (!f) continue
        // Em goja, Field.Type() é método; aceita também propriedade por garantia
        const tipo = typeof f.type === 'function' ? f.type() : f.type
        if (tipo !== 'relation') continue

        let destino = ''
        try {
          const colDestino = app.findCollectionByNameOrId(f.collectionId)
          if (!colDestino || colDestino.type === 'view') continue
          destino = colDestino.name
        } catch (_) {
          continue
        }

        const nome = f.name
        const multiplo = Number(f.maxSelect || 1) > 1

        try {
          if (multiplo || f.required) {
            // Não altera: múltipla seleção ou obrigatório (zerar quebraria a validação)
            avisos.push(tabela + '.' + nome)
            continue
          }

          const res = app
            .db()
            .newQuery(
              'UPDATE [' + tabela + '] SET [' + nome + "] = '' WHERE [" + nome + "] != '' AND [" +
                nome + '] NOT IN (SELECT id FROM [' + destino + '])',
            )
            .execute()
          let afetados = 0
          try {
            afetados = Number(res.rowsAffected()) || 0
          } catch (_) {}
          if (afetados > 0) {
            totalZerados += afetados
            console.log('[0137] ' + tabela + '.' + nome + ' -> ' + afetados + ' referência(s) órfã(s) zerada(s)')
          }
        } catch (errU) {
          console.log('[0137] erro em ' + tabela + '.' + nome + ': ' + errU)
        }
      }
    }

    console.log('[0137] total de referências órfãs zeradas: ' + totalZerados)
    if (avisos.length) console.log('[0137] campos ignorados (obrigatórios ou múltiplos): ' + avisos.join('; '))
  },
  (app) => {
    // Down: no-op. Os ids apagados não existem mais para restaurar.
  },
)
