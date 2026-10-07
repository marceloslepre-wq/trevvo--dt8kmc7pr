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
  const { pode, carregando, administrador } = usePermissoes()

  // 1. Administrador tem liberação instantânea e irrestrita sem aguardar nada
  if (administrador) {
    return <>{children}</>
  }

  // 2. Se a permissão já foi checada e concedida
  if (pode(modulo, acao)) {
    return <>{children}</>
  }

  // 3. Enquanto estiver carregando as permissões do perfil
  if (carregando) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500 text-sm">
        <div className="h-7 w-7 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-medium text-slate-700">Carregando permissões...</p>
        <p className="text-xs text-slate-400 mt-1">
          Aguarde um instante enquanto validamos seu acesso.
        </p>
      </div>
    )
  }

  // 4. Se carregou e não tem permissão
  if (fallback !== undefined) {
    return <>{fallback}</>
  }
  return <AcessoNegado />
}

export default PermissaoGuard
