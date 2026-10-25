import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'

/**
 * Hook para obter o assinante_id ativo do usuário atual no ERP.
 * Reutiliza os dados já cacheados no EmpresaContext e PermissoesContext.
 */
export function useAssinanteId(): string | null {
  const { assinanteId } = useEmpresaAtiva()
  const { usuarioERP } = usePermissoes()

  return assinanteId || usuarioERP?.assinante_id || null
}
