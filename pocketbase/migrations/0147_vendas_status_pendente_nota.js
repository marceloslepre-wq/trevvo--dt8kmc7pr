/// <reference path="../types.d.ts" />

// Garante a opção 'Pendente de nota' no status de vendas (devolução com NF-e).
// A 0051 deveria ter incluído, mas o select atual do banco não tem a opção:
// POST vendas com status 'Pendente de nota' volta 400 "Invalid value Pendente de nota".
// Monta um array NOVO (não altera a lista retornada pelo campo, que pode ser uma cópia).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    const campo = col.fields.getByName('status')
    if (!campo || campo.type !== 'select') return
    const atuais = []
    const lista = campo.values || []
    for (let i = 0; i < lista.length; i++) atuais.push(String(lista[i]))
    if (atuais.indexOf('Pendente de nota') >= 0) return
    atuais.push('Pendente de nota')
    campo.values = atuais
    app.save(col)
  },
  (app) => {
    // sem rollback: remover a opção quebraria devoluções já gravadas com esse status
  },
)
