import pb from '@/lib/pocketbase/client'

export interface Inutilizacao {
  id: string
  empresa_id: string
  modelo: '55' | '65'
  serie: string
  numero_inicial: number
  numero_final: number
  justificativa: string
  status?: string
  protocolo?: string
  mensagem_sefaz?: string
  xml_arquivo?: string
  usuario_id?: string
  data_inutilizacao?: string
  ativo?: boolean
  created?: string
  updated?: string
  expand?: {
    usuario_id?: {
      id: string
      name?: string
      email?: string
    }
  }
}

export async function listarInutilizacoes(empresaId: string): Promise<Inutilizacao[]> {
  if (!empresaId) return []
  return await pb.collection('inutilizacoes').getFullList<Inutilizacao>({
    filter: `empresa_id = '${empresaId}'`,
    sort: '-created',
    expand: 'usuario_id',
  })
}

export function obterUrlDownloadXmlInutilizacao(item: Inutilizacao): string | null {
  if (!item.xml_arquivo) return null
  return pb.files.getURL(item, item.xml_arquivo)
}
