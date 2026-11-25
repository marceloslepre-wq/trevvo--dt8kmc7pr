/// <reference path="../types.d.ts" />

// Acrescenta 'Pendente de nota' ao select 'status' da coleção vendas.
// Usada pela devolução de venda com NF-e (devolucoes.ts e hooks fiscais gravam esse status).
// As migrations 0051, 0147 e 0148 não deixaram a opção no schema ao vivo; esta reescreve
// a lista do campo por inteiro, preservando as opções existentes.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    const alvo = 'Pendente de nota'
    const campo = col.fields.getByName('status')
    if (!campo || campo.type !== 'select') return

    const lista = []
    const atuais = campo.values || []
    for (let i = 0; i < atuais.length; i++) lista.push(String(atuais[i]))
    if (lista.indexOf(alvo) >= 0) return
    lista.push(alvo)

    campo.values = lista
    app.save(col)
  },
  (app) => {
    // sem rollback: remover a opção quebraria devoluções já gravadas com esse status
  },
)
