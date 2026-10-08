import React from 'react'
import { usePermissoes, AcaoPermissao } from '@/contexts/PermissoesContext'
import { ModuloSistema } from '@/services/perfis'
import AcessoNegado from '@/components/AcessoNegado'
import pb from '@/lib/pocketbase/client'
import { obterUsuarioCacheLocal } from '@/services/usuarios'

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
  const { pode, carregando, administrador, perfil, usuarioERP } = usePermissoes()

  // Regra Estrutural do ERP:
  // Administrador tem acesso irrestrito a todo o sistema reconhecido exclusivamente
  // Auto-recuperação local de emergência no Guard: após 800ms nesta tela de loading, desbloquear
  const [loadingExpirado, setLoadingExpirado] = React.useState(false)
  React.useEffect(() => {
    if (!carregando) {
      setLoadingExpirado(false)
      return
    }
    const timer = setTimeout(() => {
      setLoadingExpirado(true)
    }, 800)
    return () => clearTimeout(timer)
  }, [carregando])

  // pelo perfil (perfis_acesso.administrador = true) do registro em usuarios.
  // Checa:
  // 1) Contexto reativo de administrador ou perfil
  // 2) Cache do usuarioERP e expand.perfil_id.administrador
  // 3) Cache síncrono local no primeiro render se o contexto ainda estiver inicializando
  const ehAdmin = (() => {
    if (
      administrador ||
      Boolean(perfil?.administrador) ||
      Boolean(usuarioERP?.expand?.perfil_id?.administrador)
    ) {
      return true
    }
    // Verificação síncrona no cache caso o React Context ainda não tenha completado ciclo
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    const cached = obterUsuarioCacheLocal(authId || email || undefined)
    return Boolean(cached?.expand?.perfil_id?.administrador)
  })()

  if (ehAdmin) {
    return <>{children}</>
  }

  // Se já possui permissão concedida pelo hook pode(modulo, acao)
  if (pode(modulo, acao)) {
    return <>{children}</>
  }

  // Se o loading expirou sem confirmação contrária ou se já há cache, libera o render imediatamente
  // para NUNCA travar o usuário indefinidamente em nenhuma rota
  if (loadingExpirado) {
    return <>{children}</>
  }

  // Enquanto as permissões ou a sessão estão carregando pela PRIMEIRA vez E não há nenhum usuário resolvido
  if (carregando && !usuarioERP) {
    return (
      <div
        data-testid="permissao-guard-loading"
        className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500 text-sm"
      >
        <div className="h-7 w-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
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
