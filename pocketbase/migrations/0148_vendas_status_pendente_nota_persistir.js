/// <reference path="../types.d.ts" />

// Persiste a opção 'Pendente de nota' no select 'status' da coleção vendas.
// A 0147 alterou campo.values de uma cópia e o schema ao vivo continuou sem a opção
// (POST vendas com status 'Pendente de nota' volta 400 "Invalid value Pendente de nota").
// Aqui a lista é reescrita pelo próprio campo dentro da coleção, por nome e por índice.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    const alvo = 'Pendente de nota'

    const montarLista = (campo) => {
      const lista = []
      const atuais = campo.values || []
      for (let i = 0; i < atuais.length; i++) lista.push(String(atuais[i]))
      if (lista.indexOf(alvo) < 0) lista.push(alvo)
      return lista
    }

    const campoPorNome = col.fields.getByName('status')
    if (campoPorNome && campoPorNome.type === 'select') {
      campoPorNome.values = montarLista(campoPorNome)
    }

    for (let i = 0; i < col.fields.length; i++) {
      const f = col.fields[i]
      if (f && f.name === 'status' && f.type === 'select') {
        f.values = montarLista(f)
      }
    }

    app.save(col)
  },
  (app) => {
    // sem rollback: remover a opção quebraria devoluções já gravadas com esse status
  },
)
