import pb from '@/lib/pocketbase/client'
import { obterUsuarioCacheLocal } from '@/services/usuarios'

/**
 * Retorna o assinante_id ativo a partir de múltiplos fallbacks resilientes:
 * 1. Campo explícito já informado
 * 2. Record de autenticação do PocketBase (pb.authStore.record.assinante_id)
 * 3. Cache do usuário logado no localStorage (erp_usuario_logado_cache)
 * 4. Empresa ativa em cache (erp_empresa_ativa_id / empresas)
 */
export function obterAssinanteIdAtivo(assinanteIdInformado?: string | null): string | null {
  if (
    assinanteIdInformado &&
    typeof assinanteIdInformado === 'string' &&
    assinanteIdInformado.trim()
  ) {
    return assinanteIdInformado.trim()
  }

  const authRecord = pb.authStore.record as {
    assinante_id?: string
    id?: string
    email?: string
  } | null

  if (authRecord?.assinante_id) {
    return authRecord.assinante_id
  }

  const userCache = obterUsuarioCacheLocal(authRecord?.id || authRecord?.email)
  if (userCache?.assinante_id) {
    return userCache.assinante_id
  }

  // Fallback: tentar ler cache local de empresa ativa ou usuário geral
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cacheGeral = localStorage.getItem('erp_usuario_logado_cache')
      if (cacheGeral) {
        const parsed = JSON.parse(cacheGeral)
        if (parsed?.assinante_id) {
          return parsed.assinante_id
        }
      }
    }
  } catch {
    // silencioso
  }

  return null
}

/**
 * Anexa o assinante_id ativo ao payload para operações de CREATE.
 * Lança erro ou retorna o payload preenchido.
 */
export function comAssinanteId<T extends Record<string, unknown>>(
  dados: T,
  assinanteIdParam?: string | null,
): T & { assinante_id: string } {
  const assinanteId = obterAssinanteIdAtivo(
    assinanteIdParam || (dados.assinante_id as string | undefined),
  )

  return {
    ...dados,
    assinante_id: assinanteId || '',
  }
}

/**
 * Sanitiza o payload para operações de UPDATE/PATCH:
 * Remove assinante_id (regras PocketBase barram com @request.body.assinante_id:isset = false),
 * id, collectionId, collectionName, created, updated, created_by, expand.
 */
export function sanitizarPayloadUpdate<T extends Record<string, unknown>>(
  dados: T,
  opcoesExtras?: { manterUpdatedBy?: boolean },
): Record<string, unknown> {
  const {
    assinante_id: _a,
    id: _i,
    collectionId: _c1,
    collectionName: _c2,
    created: _c,
    updated: _u,
    created_by: _cb,
    expand: _exp,
    ...resto
  } = dados

  const payloadLimpo: Record<string, unknown> = { ...resto }

  if (!opcoesExtras?.manterUpdatedBy && 'updated_by' in payloadLimpo) {
    // mantido se passado explicitamente ou sobrescrito pelo chamador
  }

  return payloadLimpo
}
