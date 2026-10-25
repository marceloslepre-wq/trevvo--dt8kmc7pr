import pb from '@/lib/pocketbase/client'
import { registrarAuditoria } from '@/services/auditoria'

export interface Usuario {
  id: string
  ativo: boolean
  auth_user_id?: string
  nome: string
  email: string
  cpf?: string
  telefone?: string
  foto?: string
  perfil_id: string
  empresa_padrao_id?: string
  assinante_id?: string
  desconto_maximo_percentual: number
  comissao_percentual: number
  e_vendedor: boolean
  e_caixa: boolean
  ultimo_acesso?: string
  created_by?: string
  updated_by?: string
  created?: string
  updated?: string
  // Relações expandidas
  expand?: {
    perfil_id?: {
      id: string
      nome: string
      administrador: boolean
    }
    empresa_padrao_id?: {
      id: string
      codigo: number
      nome_fantasia: string
      razao_social: string
    }
  }
}

const STORAGE_KEY_USUARIO_CACHE = 'erp_usuario_logado_cache'

export function obterUsuarioCacheLocal(authIdOrEmail?: string): Usuario | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USUARIO_CACHE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Usuario
    if (
      authIdOrEmail &&
      parsed.auth_user_id !== authIdOrEmail &&
      parsed.email?.toLowerCase() !== authIdOrEmail.toLowerCase()
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function salvarUsuarioCacheLocal(usuario: Usuario | null) {
  if (typeof window === 'undefined') return
  try {
    if (!usuario) {
      localStorage.removeItem(STORAGE_KEY_USUARIO_CACHE)
    } else {
      localStorage.setItem(STORAGE_KEY_USUARIO_CACHE, JSON.stringify(usuario))
    }
  } catch {
    // quota ou storage inacessível
  }
}

export interface UsuarioEmpresa {
  id: string
  usuario_id: string
  empresa_id: string
  ativo: boolean
  expand?: {
    empresa_id?: {
      id: string
      codigo: number
      nome_fantasia: string
      razao_social: string
      tipo: string
    }
  }
}

export interface ListarUsuariosParams {
  busca?: string
  perfil_id?: string
  empresa_id?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
  page?: number
  perPage?: number
  ordenacao?: string
}

export async function listarUsuarios(params: ListarUsuariosParams = {}) {
  const page = params.page || 1
  const perPage = params.perPage || 20
  const condicoes: string[] = []

  if (params.busca && params.busca.trim()) {
    const b = params.busca.trim().replace(/['"]/g, '')
    condicoes.push(`(nome ~ '${b}' || email ~ '${b}' || cpf ~ '${b}')`)
  }

  if (params.perfil_id && params.perfil_id !== 'todos') {
    condicoes.push(`perfil_id = '${params.perfil_id}'`)
  }

  if (params.situacao === 'ativos') {
    condicoes.push('ativo = true')
  } else if (params.situacao === 'inativos') {
    condicoes.push('ativo = false')
  }

  const filter = condicoes.length > 0 ? condicoes.join(' && ') : ''
  const sort = params.ordenacao || 'nome'

  const res = await pb.collection('usuarios').getList<Usuario>(page, perPage, {
    filter,
    sort,
    expand: 'perfil_id,empresa_padrao_id',
  })

  return res
}

export async function obterUsuario(id: string): Promise<Usuario> {
  return await pb.collection('usuarios').getOne<Usuario>(id, {
    expand: 'perfil_id,empresa_padrao_id',
  })
}

export async function obterEmpresasDoUsuario(usuarioId: string): Promise<UsuarioEmpresa[]> {
  return await pb.collection('usuarios_empresas').getFullList<UsuarioEmpresa>({
    filter: `usuario_id = '${usuarioId}'`,
    expand: 'empresa_id',
  })
}

export async function obterUsuarioPorAuthId(
  authId: string,
  emailParam?: string,
): Promise<Usuario | null> {
  if (authId) {
    try {
      const res = await pb
        .collection('usuarios')
        .getFirstListItem<Usuario>(`auth_user_id = '${authId}'`, {
          expand: 'perfil_id,empresa_padrao_id',
          requestKey: null,
        })
      if (res) {
        salvarUsuarioCacheLocal(res)
        return res
      }
    } catch (err: unknown) {
      // Se abortado ou falha transitória, checa se há cache válido
      const cache = obterUsuarioCacheLocal()
      if (cache && (cache.auth_user_id === authId || !cache.auth_user_id)) {
        return cache
      }
    }
  }

  try {
    const email = (emailParam || pb.authStore.record?.email || '').trim().toLowerCase()
    if (email) {
      const safeEmail = email.replace(/['"]/g, '')
      const porEmail = await pb
        .collection('usuarios')
        .getFirstListItem<Usuario>(`email = '${safeEmail}'`, {
          expand: 'perfil_id,empresa_padrao_id',
          requestKey: null,
        })
      if (porEmail) {
        // Se encontramos por e-mail e auth_user_id estava vazio ou desatualizado, auto-vincula
        if (authId && porEmail.auth_user_id !== authId) {
          try {
            await pb
              .collection('usuarios')
              .update(porEmail.id, { auth_user_id: authId }, { requestKey: null })
            porEmail.auth_user_id = authId
          } catch {
            // falha não bloqueia
          }
        }
        salvarUsuarioCacheLocal(porEmail)
        return porEmail
      }
    }
  } catch {
    // Ignora erro no fallback
  }
  return obterUsuarioCacheLocal()
}

export async function criarUsuarioComLogin(dados: {
  nome: string
  email: string
  password: string
  perfil_id: string
  cpf?: string
  telefone?: string
  empresa_padrao_id?: string | null
  desconto_maximo_percentual?: number
  comissao_percentual?: number
  e_vendedor?: boolean
  e_caixa?: boolean
  empresas_ids: string[]
}) {
  const res = await pb.send('/backend/v1/usuarios-admin/criar', {
    method: 'POST',
    body: dados,
  })

  // Registrar auditoria
  await registrarAuditoria({
    tabela: 'usuarios',
    registro_id: res.usuario_id,
    acao: 'inclusao',
    valores_depois: {
      nome: dados.nome,
      email: dados.email,
      perfil_id: dados.perfil_id,
      cpf: dados.cpf,
      telefone: dados.telefone,
      empresas_ids: dados.empresas_ids,
    },
  })

  return res
}

export async function atualizarUsuario(
  id: string,
  dados: {
    nome?: string
    email?: string
    perfil_id?: string
    cpf?: string
    telefone?: string
    empresa_padrao_id?: string | null
    desconto_maximo_percentual?: number
    comissao_percentual?: number
    e_vendedor?: boolean
    e_caixa?: boolean
    ativo?: boolean
    empresas_ids?: string[]
  },
) {
  const antes = await obterUsuario(id)

  const payload: Record<string, unknown> = {
    updated_by: pb.authStore.record?.id || null,
  }

  if (dados.nome !== undefined) payload.nome = dados.nome.trim()
  if (dados.email !== undefined) payload.email = dados.email.trim().toLowerCase()
  if (dados.perfil_id !== undefined) payload.perfil_id = dados.perfil_id
  if (dados.cpf !== undefined) payload.cpf = dados.cpf
  if (dados.telefone !== undefined) payload.telefone = dados.telefone
  if (dados.empresa_padrao_id !== undefined)
    payload.empresa_padrao_id = dados.empresa_padrao_id || null
  if (dados.desconto_maximo_percentual !== undefined)
    payload.desconto_maximo_percentual = dados.desconto_maximo_percentual
  if (dados.comissao_percentual !== undefined)
    payload.comissao_percentual = dados.comissao_percentual
  if (dados.e_vendedor !== undefined) payload.e_vendedor = dados.e_vendedor
  if (dados.e_caixa !== undefined) payload.e_caixa = dados.e_caixa
  if (dados.ativo !== undefined) payload.ativo = dados.ativo

  const atualizado = await pb.collection('usuarios').update<Usuario>(id, payload)

  // Sincronizar empresas vinculadas se empresas_ids foi enviado
  if (dados.empresas_ids) {
    const atuais = await pb.collection('usuarios_empresas').getFullList<UsuarioEmpresa>({
      filter: `usuario_id = '${id}'`,
    })

    const atuaisMap = new Map<string, UsuarioEmpresa>()
    atuais.forEach((ue) => atuaisMap.set(ue.empresa_id, ue))

    const novasEmpresas = new Set(dados.empresas_ids)

    // Desativar ou deletar quem não está na nova lista
    for (const ue of atuais) {
      if (!novasEmpresas.has(ue.empresa_id)) {
        await pb.collection('usuarios_empresas').delete(ue.id)
      }
    }

    // Inserir os que não existiam
    for (const empId of dados.empresas_ids) {
      if (!atuaisMap.has(empId)) {
        await pb.collection('usuarios_empresas').create({
          usuario_id: id,
          empresa_id: empId,
          ativo: true,
          created_by: pb.authStore.record?.id || null,
          updated_by: pb.authStore.record?.id || null,
        })
      }
    }
  }

  await registrarAuditoria({
    tabela: 'usuarios',
    registro_id: id,
    acao: 'alteracao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

export async function inativarUsuario(id: string) {
  const antes = await obterUsuario(id)
  const atualizado = await pb.collection('usuarios').update<Usuario>(id, {
    ativo: false,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'usuarios',
    registro_id: id,
    acao: 'inativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

export async function ativarUsuario(id: string) {
  const antes = await obterUsuario(id)
  const atualizado = await pb.collection('usuarios').update<Usuario>(id, {
    ativo: true,
    updated_by: pb.authStore.record?.id || null,
  })

  await registrarAuditoria({
    tabela: 'usuarios',
    registro_id: id,
    acao: 'ativacao',
    valores_antes: antes as unknown as Record<string, unknown>,
    valores_depois: atualizado as unknown as Record<string, unknown>,
  })

  return atualizado
}

export async function redefinirSenhaUsuario(usuario_id: string, nova_senha: string) {
  const res = await pb.send('/backend/v1/usuarios-admin/redefinir-senha', {
    method: 'POST',
    body: { usuario_id, nova_senha },
  })
  return res
}
