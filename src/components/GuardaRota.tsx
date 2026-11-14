import React from 'react'
import { useLocation, Navigate } from 'react-router-dom'
import PermissaoGuard from '@/components/PermissaoGuard'
import AcessoNegado from '@/components/AcessoNegado'
import { exigenciaDaRota } from '@/config/tabelaRotas'
import { useDestinoInicial } from '@/components/destinoInicial'

/**
 * GUARDA DE ROTA PELA TABELA ÚNICA (src/config/tabelaRotas.ts)
 *
 * Envolve as rotas do layout protegido e decide o módulo/ação exigidos pela
 * localização atual, usando a mesma fonte de verdade do menu lateral (Sidebar).
 * - Rota na tabela: exige pode(modulo, acaoMinima) via PermissaoGuard.
 * - Rota fora da tabela: só administrador.
 * - Administrador (perfis_acesso.administrador = true): acesso total (regra do próprio pode()).
 *
 * - Rota raiz (/): redireciona (Navigate replace) para o destino inicial do
 *   perfil — caso espelhado do /painel, porque RedirecionarRaiz renderiza
 *   DENTRO do GuardaRota e seria substituído por "Acesso negado" antes de rodar.
 *
 * Usa useLocation (não window.location) para reavaliar a cada navegação do Router
 * sem setState em render — apenas deriva o exigido e delega ao PermissaoGuard,
 * que já é resiliente contra "Maximum update depth exceeded".
 */
export const GuardaRota: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const exigencia = exigenciaDaRota(location.pathname)
  const destino = useDestinoInicial()

  // /painel sem pode_ver no módulo painel: redireciona (Navigate replace) para
  // o destino inicial do perfil (/vendas/pdv ou primeira rota permitida do
  // menu) — nunca mostra "Acesso negado". Se o destino calculado for o próprio
  // /painel ou se não houver NENHUMA rota permitida, mostra Acesso negado
  // (defesa contra loop de redirecionamento — item 5 da rodada).
  if (location.pathname === '/painel' && destino !== '/painel' && destino !== location.pathname) {
    if (destino) {
      return <Navigate to={destino} replace />
    }
    return <AcessoNegado />
  }

  // Rota raiz (/): mesmo caso do /painel — o RedirecionarRaiz fica dentro do
  // GuardaRota e não chega a rodar, então a guarda redireciona direto para o
  // destino inicial do perfil (ex.: /vendas/pdv para o Vendedor/Caixa).
  if (location.pathname === '/') {
    if (destino && destino !== '/') {
      return <Navigate to={destino} replace />
    }
    return <AcessoNegado />
  }

  if (!exigencia) {
    // Rota fora da tabela (ex.: telas internas sem item próprio): só administrador
    return (
      <PermissaoGuard modulo="__nenhum__" acao="ver">
        {children}
      </PermissaoGuard>
    )
  }

  return (
    <PermissaoGuard modulo={exigencia.modulo} acao={exigencia.acao}>
      {children}
    </PermissaoGuard>
  )
}

export default GuardaRota
