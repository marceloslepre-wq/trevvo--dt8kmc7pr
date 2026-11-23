// Chat "Pergunte ao Trevvo": consome o agente nativo "ajuda-do-trevvo".
// O agente é definido/gerenciado no painel Skip Cloud; este hook apenas o consome.
routerAdd(
  'POST',
  '/backend/v1/ajuda/perguntar',
  (e) => {
    const userId = e.auth ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('auth required')

    const body = e.requestInfo().body || {}

    // 1) Validação da pergunta
    const perguntaBruta = String(body.pergunta || '').trim()
    if (!perguntaBruta) return e.badRequestError('A pergunta é obrigatória.')
    const pergunta = perguntaBruta.substring(0, 500)

    const conversationId = String(body.conversation_id || '').trim()

    const artigosBrutos = Array.isArray(body.artigos) ? body.artigos : []
    const artigos = artigosBrutos.slice(0, 4)
    const telasBrutas = Array.isArray(body.telas) ? body.telas : []
    const telas = telasBrutas.slice(0, 150)

    // Helper declarado dentro do callback (JSVM não aceita funções no topo).
    const linhasDePassos = (passos) => {
      const lista = Array.isArray(passos) ? passos : []
      const linhas = []
      for (let i = 0; i < lista.length; i++) {
        linhas.push('   ' + (i + 1) + '. ' + String(lista[i] || ''))
      }
      return linhas.join('\n')
    }

    const linhasDeDicas = (dicas) => {
      const lista = Array.isArray(dicas) ? dicas : []
      const linhas = []
      for (let i = 0; i < lista.length; i++) {
        linhas.push('   - ' + String(lista[i] || ''))
      }
      return linhas.join('\n')
    }

    // 2) Mensagem única para o agente
    const blocos = []
    blocos.push('PERGUNTA DO USUÁRIO: ' + pergunta)
    blocos.push('')
    blocos.push('ARTIGOS DE AJUDA:')
    if (artigos.length === 0) {
      blocos.push('(nenhum artigo encontrado para esta pergunta)')
    }
    for (let i = 0; i < artigos.length; i++) {
      const a = artigos[i] || {}
      blocos.push('- ' + String(a.titulo || ''))
      blocos.push('  Caminho: ' + String(a.caminho || ''))
      blocos.push('  Rota: ' + String(a.rota || ''))
      const passos = linhasDePassos(a.passos)
      if (passos) {
        blocos.push('  Passos:')
        blocos.push(passos)
      }
      const dicas = linhasDeDicas(a.dicas)
      if (dicas) {
        blocos.push('  Dicas:')
        blocos.push(dicas)
      }
    }
    blocos.push('')
    blocos.push('TELAS QUE ESTE USUÁRIO PODE ABRIR:')
    for (let i = 0; i < telas.length; i++) {
      const t = telas[i] || {}
      blocos.push(
        String(t.rotulo || '') + ' (' + String(t.grupo || '') + '): ' + String(t.rota || ''),
      )
    }
    const mensagem = blocos.join('\n')

    // 3) Chamada ao agente nativo (sem streaming)
    try {
      const resultado = $ai.agent('ajuda-do-trevvo').chat({
        user_id: userId,
        conversation_id: conversationId || null,
        message: mensagem,
      })

      // 4) Resposta
      return e.json(200, {
        resposta: resultado.content || '',
        conversation_id: resultado.conversation_id || conversationId || '',
      })
    } catch (err) {
      // 5) Registra só o tipo do erro — nunca o token nem a pergunta
      let tipo = typeof err
      if (err && err.constructor && err.constructor.name) {
        tipo = String(err.constructor.name)
      }
      console.error('ajuda_trevvo: falha ao consultar o agente (' + tipo + ')')
      return e.json(500, { message: 'Não foi possível falar com o Trevvo agora.' })
    }
  },
  $apis.requireAuth(),
)
