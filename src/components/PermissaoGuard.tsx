import React from 'react'
import { usePermissoes, AcaoPermissao } from '@/contexts/PermissoesContext'
import { ModuloSistema } from '@/services/perfis'
import AcessoNegado from '@/components/AcessoNegado'
import pb from '@/lib/pocketbase/client'

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
  const { pode, carregando, administrador, perfil } = usePermissoes()

  // Regra Estrutural do ERP:
  // Administrador tem acesso irrestrito a todo o sistema reconhecido exclusivamente
  // pelo perfil (perfis_acesso.administrador = true) do registro em usuarios.
  const ehAdmin = administrador || Boolean(perfil?.administrador)

  if (ehAdmin) {
    return <>{children}</>
  }

  // Se já possui permissão concedida
  if (pode(modulo, acao)) {
    return <>{children}</>
  }

  // Enquanto as permissões estão carregando para usuário comum
  if (carregando) {
    return (
      <div
        data-testid="permissao-guard-loading"
        className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500 text-sm"
      >
        <div className="h-7 w-7 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-medium text-slate-700">Carregando permissões...</p>
        <p className="text-xs text-slate-400 mt-1">
          Aguarde um instante enquanto validamos seu acesso.
        </p>
      </div>
    )
  }

  // Não possui a permissão requerida
  if (fallback !== undefined) {
    return <>{fallback}</>
  }
  return <AcessoNegado />
}

export default PermissaoGuard
