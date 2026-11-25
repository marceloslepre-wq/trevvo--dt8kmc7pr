/// <reference path="../types.d.ts" />

// Acrescenta 'Pendente de nota' ao select 'status' da coleção vendas (devolução com NF-e).
// As migrations 0051, 0147, 0148 e 0149 alteravam campo.values e o schema ao vivo não
// mudou. Aqui o campo 'status' é removido e recriado com a lista completa, mantendo
// required, maxSelect e as opções existentes.
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

    col.fields.removeByName('status')
    col.fields.add(
      new SelectField({
        name: 'status',
        required: true,
        values: lista,
        maxSelect: 1,
      }),
    )
    app.save(col)
  },
  (app) => {
    // sem rollback: remover a opção quebraria devoluções já gravadas com esse status
  },
)
