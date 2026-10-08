import pb from '@/lib/pocketbase/client'

export type AcaoAuditoria = 'inclusao' | 'alteracao' | 'inativacao' | 'ativacao' | 'exclusao'

export interface LogAuditoriaItem {
  id?: string
  usuario_id?: string
  usuario_nome?: string
  empresa_id?: string
  tabela: string
  registro_id: string
  acao: AcaoAuditoria
  valores_antes?: Record<string, unknown> | null
  valores_depois?: Record<string, unknown> | null
  created?: string
}

export interface FiltrosAuditoria {
  data_inicio?: string
  data_fim?: string
  usuario_id?: string
  tabela?: string
  registro_id?: string
  acao?: string
  page?: number
  perPage?: number
}

export async function registrarAuditoria(params: {
  tabela: string
  registro_id: string
  acao: AcaoAuditoria
  empresa_id?: string | null
  valores_antes?: Record<string, unknown> | null
  valores_depois?: Record<string, unknown> | null
}) {
  try {
    const user = pb.authStore.record
    await pb.collection('logs_auditoria').create({
      usuario_id: user?.id || null,
      usuario_nome: (user?.name as string) || (user?.email as string) || 'Sistema',
      empresa_id: params.empresa_id || null,
      tabela: params.tabela,
      registro_id: params.registro_id,
      acao: params.acao,
      valores_antes: params.valores_antes || null,
      valores_depois: params.valores_depois || null,
    })
  } catch (err) {
    console.warn('Não foi possível gravar log de auditoria:', err)
  }
}

export async function listarLogsAuditoria(filtros: FiltrosAuditoria = {}) {
  const page = filtros.page || 1
  const perPage = filtros.perPage || 20

  const condicoes: string[] = []

  if (filtros.data_inicio) {
    condicoes.push(`created >= '${filtros.data_inicio} 00:00:00'`)
  }
  if (filtros.data_fim) {
    condicoes.push(`created <= '${filtros.data_fim} 23:59:59'`)
  }
  if (filtros.usuario_id && filtros.usuario_id !== 'todos') {
    condicoes.push(`usuario_id = '${filtros.usuario_id}'`)
  }
  if (filtros.tabela && filtros.tabela !== 'todas') {
    condicoes.push(`tabela = '${filtros.tabela}'`)
  }
  if (filtros.registro_id) {
    condicoes.push(`registro_id = '${filtros.registro_id}'`)
  }
  if (filtros.acao && filtros.acao !== 'todas') {
    condicoes.push(`acao = '${filtros.acao}'`)
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''

  const res = await pb.collection('logs_auditoria').getList<LogAuditoriaItem>(page, perPage, {
    filter,
    sort: '-created',
  })

  return res
}
