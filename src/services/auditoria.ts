import pb from '@/lib/pocketbase/client'

export type AcaoAuditoria = 'inclusao' | 'alteracao' | 'inativacao' | 'ativacao' | 'exclusao'

export interface LogAuditoriaItem {
  id?: string
  usuario_id?: string
  usuario_nome?: string
  tabela: string
  registro_id: string
  acao: AcaoAuditoria
  valores_antes?: Record<string, unknown> | null
  valores_depois?: Record<string, unknown> | null
  created?: string
}

export async function registrarAuditoria(params: {
  tabela: string
  registro_id: string
  acao: AcaoAuditoria
  valores_antes?: Record<string, unknown> | null
  valores_depois?: Record<string, unknown> | null
}) {
  try {
    const user = pb.authStore.record
    await pb.collection('logs_auditoria').create({
      usuario_id: user?.id || null,
      usuario_nome: user?.name || user?.email || 'Sistema',
      tabela: params.tabela,
      registro_id: params.registro_id,
      acao: params.acao,
      valores_antes: params.valores_antes || null,
      valores_depois: params.valores_depois || null,
    })
  } catch (err) {
    // Falha em log de auditoria não deve derrubar o fluxo principal, mas registramos no console
    console.warn('Não foi possível gravar log de auditoria:', err)
  }
}
