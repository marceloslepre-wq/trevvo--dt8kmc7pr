import pb from '@/lib/pocketbase/client'
import type { ArtigoAjuda } from '@/config/ajudaArtigos'

/**
 * "Pergunte ao Trevvo": envia a pergunta e os artigos de ajuda mais parecidos para o
 * hook POST /backend/v1/ajuda/perguntar, que chama o agente de ajuda do Skip.
 * O agente deve responder só com base nos artigos e nas telas enviadas.
 */

export interface RespostaAjuda {
  resposta: string
  conversation_id?: string
}

export class ChatAjudaIndisponivel extends Error {}

export async function perguntarAoTrevvo(
  pergunta: string,
  artigos: ArtigoAjuda[],
  telas: { rota: string; rotulo: string; grupo: string }[],
  conversationId?: string,
): Promise<RespostaAjuda> {
  try {
    const res = await pb.send('/backend/v1/ajuda/perguntar', {
      method: 'POST',
      body: {
        pergunta,
        conversation_id: conversationId || '',
        artigos: artigos.map((a) => ({
          titulo: a.titulo,
          caminho: a.caminho,
          rota: a.rota,
          passos: a.passos,
          dicas: a.dicas || [],
        })),
        telas,
      },
    })
    return {
      resposta: String(res?.resposta || '').trim(),
      conversation_id: res?.conversation_id || undefined,
    }
  } catch (err: any) {
    // Rota ainda não criada no backend (chat não ligado)
    if (err?.status === 404) throw new ChatAjudaIndisponivel('chat não ligado')
    throw new Error(err?.response?.message || err?.message || 'Falha ao falar com o Trevvo')
  }
}
