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

// Variável de módulo persistente enquanto a janela do navegador estiver aberta
// Se qualquer permissão foi resolvida ou qualquer guard já renderizou com sucesso,
// novas navegações nunca bloqueiam exibindo tela inteira de carregamento.
let sessaoPermissoesResolvida = false

export const PermissaoGuard: React.FC<PermissaoGuardProps> = ({
  modulo,
  acao = 'ver',
  children,
  fallback,
}) => {
  const { pode, carregando, administrador, perfil, usuarioERP } = usePermissoes()

  // Auto-recuperação local com fail-safe imediato:
  // Se a sessão já liberou uma vez ou se tivermos usuário/admin em cache, nunca bloqueia.
  const [loadingExpirado, setLoadingExpirado] = React.useState(() => sessaoPermissoesResolvida)

  React.useEffect(() => {
    if (sessaoPermissoesResolvida) {
      setLoadingExpirado(true)
      return
    }

    if (!carregando) {
      sessaoPermissoesResolvida = true
      return
    }

    const timer = setTimeout(() => {
      sessaoPermissoesResolvida = true
      setLoadingExpirado(true)
    }, 250)

    return () => clearTimeout(timer)
  }, [carregando])

  // Reconhecimento imediato de Admin (Contexto, Usuario ERP ou Cache síncrono no localStorage)
  const ehAdmin = (() => {
    if (
      administrador ||
      Boolean(perfil?.administrador) ||
      Boolean(usuarioERP?.expand?.perfil_id?.administrador)
    ) {
      return true
    }
    const authId = pb.authStore.record?.id
    const email = pb.authStore.record?.email
    const cached = obterUsuarioCacheLocal(authId || email || undefined)
    return Boolean(cached?.expand?.perfil_id?.administrador)
  })()

  if (ehAdmin) {
    sessaoPermissoesResolvida = true
    return <>{children}</>
  }

  // Se já possui permissão concedida pelo hook pode(modulo, acao)
  if (pode(modulo, acao)) {
    sessaoPermissoesResolvida = true
    return <>{children}</>
  }

  // Se o usuário está autenticado no PocketBase OU possui usuárioERP / cache:
  // Se ainda estiver em fase de carregamento das permissões, renderiza o children otimista (SWR)
  // em vez de bloquear com spinner. Isso elimina 100% qualquer travamento de tela em navegações subsequentes.
  const temAuthAtiva = Boolean(pb.authStore.isValid && pb.authStore.record)
  const temCache = Boolean(
    obterUsuarioCacheLocal(pb.authStore.record?.id || pb.authStore.record?.email || undefined),
  )

  if (carregando && (temAuthAtiva || temCache || usuarioERP || sessaoPermissoesResolvida)) {
    return <>{children}</>
  }

  // Se a sessão já foi resolvida nesta janela OU o timeout de 250ms expirou:
  if (sessaoPermissoesResolvida || loadingExpirado) {
    if (carregando) {
      return <>{children}</>
    }
    if (pode(modulo, acao)) {
      return <>{children}</>
    }
    if (fallback !== undefined) {
      return <>{fallback}</>
    }
    return <AcessoNegado />
  }

  if (temAuthAtiva || temCache || usuarioERP) {
    if (pode(modulo, acao)) {
      return <>{children}</>
    }
    if (fallback !== undefined) {
      return <>{fallback}</>
    }
    return <AcessoNegado />
  }

  // 3) Carregamento a frio absoluto sem nenhuma credencial inicial no cache (máximo 250ms até o timer disparar)
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

export default PermissaoGuard
