import pb from '@/lib/pocketbase/client'
import { obterUsuarioPorAuthId, obterUsuarioCacheLocal } from './usuarios'

/**
 * Resolve o id do registro de "usuarios" (ERP) do usuário logado a partir do id
 * do login (coleção users). Campos como vendas.operador_id apontam para a
 * coleção usuarios — gravar o id do login neles causa erro 400 de relação
 * ("Failed to find all relation records with the provided ids").
 * Não encontrando, devolve undefined para gravar vazio sem quebrar.
 */
export async function resolverOperadorErpId(): Promise<string | undefined> {
  const authUserId = pb.authStore.record?.id || undefined
  if (!authUserId) return undefined
  try {
    const erp =
      (await obterUsuarioPorAuthId(authUserId).catch(() => null)) ||
      obterUsuarioCacheLocal(authUserId)
    if (erp && (!erp.auth_user_id || erp.auth_user_id === authUserId)) return erp.id
  } catch {
    // sem registro ERP: grava vazio
  }
  return undefined
}
