import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './layout/Sidebar'
import { Header } from './layout/Header'
import GuardaRota from './GuardaRota'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // PDV em modo tela cheia: recolhe o menu lateral ao montar o PDV e restaura
  // ao sair (o próprio PDV tem o botão "Sair do PDV" que volta ao ERP).
  const ehPdv = location.pathname.startsWith('/vendas/pdv')
  const colapsouPeloPdv = useRef(false)
  useEffect(() => {
    if (ehPdv && !colapsouPeloPdv.current) {
      colapsouPeloPdv.current = true
      setCollapsed(true)
    } else if (!ehPdv && colapsouPeloPdv.current) {
      colapsouPeloPdv.current = false
      setCollapsed(false)
    }
  }, [ehPdv])

  // Auto-colapsar em telas tablet (641px - 1024px)
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      if (width >= 641 && width <= 1024) {
        setCollapsed(true)
      } else if (width > 1024) {
        // Desktop restaura ou mantém
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      className={`bg-slate-100 flex flex-col font-sans text-slate-900 ${
        ehPdv ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Sidebar Retrátil / Drawer */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        isMobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Conteúdo principal com deslocamento sincronizado da sidebar */}
      <div
        className={`flex-1 flex flex-col transition-[margin-left] duration-200 ease-in-out ${
          collapsed ? 'md:ml-16' : 'md:ml-60'
        }`}
      >
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />
        <main
          className={
            ehPdv
              ? 'flex-1 min-h-0 w-full flex flex-col'
              : 'flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto'
          }
        >
          {/* Guarda de permissões pela tabela única de rotas (src/config/tabelaRotas.ts).
              Protege TODAS as rotas do layout com uma mudança só, inclusive abrindo URL direto. */}
          <GuardaRota>
            <Outlet />
          </GuardaRota>
        </main>
      </div>
    </div>
  )
}
