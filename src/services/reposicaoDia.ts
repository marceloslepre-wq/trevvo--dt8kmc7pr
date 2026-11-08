import pb from '@/lib/pocketbase/client'

export interface RespostaReposicaoDia {
  sucesso: boolean
  criada?: boolean
  message?: string
  transferencia_id?: string
  itens?: number
}

/**
 * Gera a "Reposição do dia": transferência em RASCUNHO (origem = empresa de
 * reposição configurada, destino = empresa selecionada) com os produtos e
 * quantidades vendidos pela empresa de destino na data informada.
 * O envio e a NF-e de transferência seguem o fluxo normal da tela de Transferências.
 */
export async function gerarReposicaoDoDia(
  empresaId: string,
  data: string,
): Promise<RespostaReposicaoDia> {
  if (!empresaId || !data) {
    throw new Error('Informe a empresa e a data para gerar a reposição do dia.')
  }

  return pb.send<RespostaReposicaoDia>('/backend/v1/transferencias/reposicao-do-dia', {
    method: 'POST',
    body: { empresa_id: empresaId, data },
  })
}
