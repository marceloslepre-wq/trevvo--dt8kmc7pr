/// <reference path="../types.d.ts" />

/**
 * Rota de teste temporária (pode ser apagada depois do teste).
 * GET /backend/v1/claude/ping
 *
 * Serve apenas para verificar se código de backend enviado pelo GitHub
 * entra em funcionamento depois de "Sincronizar do GitHub" + "Publicar".
 * Não lê nem grava nenhum dado do sistema.
 */
routerAdd('GET', '/backend/v1/claude/ping', (c) => {
  return c.json(200, {
    sucesso: true,
    mensagem: 'Backend vindo do GitHub está funcionando.',
    origem: 'pull request do Claude',
  })
})
