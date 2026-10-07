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
  const { pode, carregando, administrador, perfil } = usePermissoes()

  // ESTADO 1: Administrador ou permissão já confirmada → Conteúdo imediato
  if (administrador || perfil?.administrador || perfil?.nome?.toLowerCase() === 'administrador') {
    return <>{children}</>
  }

  if (pode(modulo, acao)) {
    return <>{children}</>
  }

  // ESTADO 2: Carregando assincronamente as permissões → Spinner explícito
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

  // ESTADO 3: Carregou e não possui a permissão requerida → Tela de Acesso Negado (ou fallback)
  if (fallback !== undefined) {
    return <>{fallback}</>
  }
  return <AcessoNegado />
}

export default PermissaoGuard
