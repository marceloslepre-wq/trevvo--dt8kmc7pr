import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { ROTAS } from '@/config/tabelaRotas'

/**
 * DESTINO DA ROTA RAIZ "/" E DO /painel
 *
 * Fonte única de verdade: tabelaRotas (ROTAS) + permissões do perfil (usePermissoes).
 * Resolve, para o usuário logado, para onde "/" (com ou sem query string) e o
 * botão "Ir para o início" da tela Acesso negado devem levar:
 *
 * 1. /painel          — se tem pode_ver no módulo "painel" (ou é administrador);
 * 2. /vendas/pdv      — se tem pode_ver no módulo "pdv";
 * 3. primeira rota permitida do menu — varredura na ordem da tabela, nunca
 *    oculta no menu, com pode(modulo, acaoMinima).
 * 4. null — nada permitido (usuário sem nenhuma rota): o chamador decide
 *    (GuardaRota mostra Acesso negado em vez de redirecionar em loop).
 */
export function destinoInicial(
  pode: (modulo: string, acao?: string) => boolean,
  administrador: boolean,
): string | null {
  if (administrador || pode('painel', 'ver')) return '/painel'
  if (pode('pdv', 'ver')) return '/vendas/pdv'
  const primeira = ROTAS.filter((r) => !r.ocultoNoMenu).find((r) => pode(r.modulo, r.acaoMinima))
  return primeira ? primeira.rota : null
}

/** Hook: destino calculado para o usuário atual (pode ser null = nada permitido) */
export const useDestinoInicial = (): string | null => {
  const { pode, administrador } = usePermissoes()
  return destinoInicial(pode, administrador)
}

/**
 * Redirecionador da rota raiz "/" (com ou sem query string).
 * NUNCA passa pela exigência de módulo do GuardaRota: resolve o destino pelo
 * perfil (mesma lógica acima). Se o destino cair na própria rota atual,
 * renderiza AcessoNegado em vez de redirecionar para si mesmo (evita loop).
 */
export const RedirecionarRaiz: React.FC = () => {
  const destino = useDestinoInicial()
  const location = useLocation()

  if (destino && destino !== location.pathname) {
    return <Navigate to={destino} replace />
  }

  // Sem nenhuma rota permitida (ou destino caindo na própria rota — defesa
  // contra loop de redirecionamento): deixa o Layout renderizar o que vier e
  // o GuardaRota mostrar Acesso negado normalmente.
  return null
}

export default RedirecionarRaiz
