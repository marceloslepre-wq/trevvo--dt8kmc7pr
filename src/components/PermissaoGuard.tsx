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

  // Se o usuário já é reconhecido como administrador de imediato, libera sem esperar
  if (!administrador && carregando) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500 text-sm">
        <div className="h-7 w-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-medium text-slate-700">Carregando permissões...</p>
        <p className="text-xs text-slate-400 mt-1">
          Aguarde um instante enquanto validamos seu acesso.
        </p>
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
