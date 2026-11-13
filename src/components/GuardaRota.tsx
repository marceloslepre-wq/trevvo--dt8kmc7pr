import React from 'react'
import { useLocation } from 'react-router-dom'
import PermissaoGuard from '@/components/PermissaoGuard'
import { exigenciaDaRota } from '@/config/tabelaRotas'

/**
 * GUARDA DE ROTA PELA TABELA ÚNICA (src/config/tabelaRotas.ts)
 *
 * Envolve as rotas do layout protegido e decide o módulo/ação exigidos pela
 * localização atual, usando a mesma fonte de verdade do menu lateral (Sidebar).
 * - Rota na tabela: exige pode(modulo, acaoMinima) via PermissaoGuard.
 * - Rota fora da tabela: só administrador.
 * - Administrador (perfis_acesso.administrador = true): acesso total (regra do próprio pode()).
 *
 * Usa useLocation (não window.location) para reavaliar a cada navegação do Router
 * sem setState em render — apenas deriva o exigido e delega ao PermissaoGuard,
 * que já é resiliente contra "Maximum update depth exceeded".
 */
export const GuardaRota: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const exigencia = exigenciaDaRota(location.pathname)

  if (!exigencia) {
    // Rota fora da tabela (ex.: /painel, telas internas sem item próprio): só administrador
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
