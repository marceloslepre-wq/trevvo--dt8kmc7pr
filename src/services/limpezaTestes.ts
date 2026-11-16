import pb from '@/lib/pocketbase/client'

export interface LimpezaItem {
  grupo: string
  tabela: string
  registros: number
  acao: 'apagar' | 'ajustar'
  detalhe?: string
}

export interface LimpezaPrevia {
  sucesso: boolean
  versao_hook?: string
  assinante: { id: string; nome: string }
  empresas: { id: string; nome: string }[]
  cliente_mantido: { id: string; nome: string } | null
  usuarios_removidos: { nome: string; email: string }[]
  itens: LimpezaItem[]
  erros: { tabela: string; erro: string }[]
}

export interface LimpezaResultado {
  sucesso: boolean
  message: string
  resultado: { tabela: string; apagados?: number; ajustado?: string }[]
}

const ROTA = '/backend/v1/master/limpeza-testes-v2'

export async function obterPreviaLimpeza(): Promise<LimpezaPrevia> {
  return pb.send<LimpezaPrevia>(ROTA, { method: 'POST', body: { acao: 'previa' } })
}

export async function baixarBackupLimpeza(): Promise<unknown> {
  return pb.send<unknown>(ROTA, { method: 'POST', body: { acao: 'backup' } })
}

export async function executarLimpeza(confirmacao: string): Promise<LimpezaResultado> {
  return pb.send<LimpezaResultado>(ROTA, {
    method: 'POST',
    body: { acao: 'executar', confirmacao },
  })
}
