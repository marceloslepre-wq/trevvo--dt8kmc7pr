import pb from '@/lib/pocketbase/client'

export interface Intermediador {
  id: string
  nome: string
  cnpj: string
  ativo: boolean
  created?: string
  updated?: string
}

export async function listarIntermediadores(apenasAtivos = false): Promise<Intermediador[]> {
  const filter = apenasAtivos ? 'ativo = true' : ''
  return await pb.collection('intermediadores').getFullList<Intermediador>({
    filter,
    sort: 'nome',
  })
}

export async function obterIntermediadorPorId(id: string): Promise<Intermediador | null> {
  try {
    return await pb.collection('intermediadores').getOne<Intermediador>(id)
  } catch (_) {
    return null
  }
}

export async function criarIntermediador(dados: {
  nome: string
  cnpj: string
  ativo?: boolean
}): Promise<Intermediador> {
  const payload = {
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.replace(/\D/g, ''),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    created_by: pb.authStore.record?.id,
  }
  return await pb.collection('intermediadores').create<Intermediador>(payload)
}

export async function atualizarIntermediador(
  id: string,
  dados: {
    nome?: string
    cnpj?: string
    ativo?: boolean
  },
): Promise<Intermediador> {
  const payload: Record<string, unknown> = {
    updated_by: pb.authStore.record?.id,
  }
  if (dados.nome !== undefined) payload.nome = dados.nome.trim()
  if (dados.cnpj !== undefined) payload.cnpj = dados.cnpj.replace(/\D/g, '')
  if (dados.ativo !== undefined) payload.ativo = dados.ativo

  return await pb.collection('intermediadores').update<Intermediador>(id, payload)
}

export async function excluirIntermediador(id: string): Promise<boolean> {
  return await pb.collection('intermediadores').delete(id)
}
