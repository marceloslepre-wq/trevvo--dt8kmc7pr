import React from 'react'
import { usePermissoes, AcaoPermissao } from '@/contexts/PermissoesContext'
import { ModuloSistema } from '@/services/perfis'
import AcessoNegado from '@/components/AcessoNegado'

interface PermissaoGuardProps {
  modulo: ModuloSistema | string
  acao?: AcaoPermissao
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const PermissaoGuard: React.FC<PermissaoGuardProps> = ({
  modulo,
  acao = 'ver',
  children,
  fallback,
}) => {
  const { pode, carregando } = usePermissoes()

  if (carregando) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
        Verificando permissões de acesso...
      </div>
    )
  }

  const permitido = pode(modulo, acao)

  if (!permitido) {
    if (fallback !== undefined) {
      return <>{fallback}</>
    }
    return <AcessoNegado />
  }

  return <>{children}</>
}

export default PermissaoGuard
