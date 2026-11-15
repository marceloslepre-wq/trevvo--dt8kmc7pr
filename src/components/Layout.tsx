import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { Sidebar } from './layout/Sidebar'
import { Header } from './layout/Header'
import GuardaRota from './GuardaRota'
import { Button } from '@/components/ui/button'
import { usePermissoes } from '@/contexts/PermissoesContext'

const CHAVE_BANNER_MOVEL = 'erp_banner_movel_dispensado'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { pode } = usePermissoes()

  // Aviso pós-login em tela pequena: sugere a versão celular (Trevvo Móvel),
  // sem redirecionamento forçado. Dispensável por sessão (sessionStorage).
  const [bannerDispensado, setBannerDispensado] = useState(
    () => sessionStorage.getItem(CHAVE_BANNER_MOVEL) === '1',
  )
  const ehMovel = location.pathname.startsWith('/movel')
  const telaPequena = typeof window !== 'undefined' && window.innerWidth < 768
  const mostrarBannerMovel = telaPequena && pode('produtos', 'ver') && !bannerDispensado && !ehMovel

  const dispensarBannerMovel = () => {
    sessionStorage.setItem(CHAVE_BANNER_MOVEL, '1')
    setBannerDispensado(true)
  }

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
      {mostrarBannerMovel && (
        <div className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sky-900">
          <Smartphone className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs">
            Você está em uma tela pequena. Use o Trevvo Móvel para consultar produtos no balcão.
          </p>
          <Button
            size="sm"
            className="h-8 shrink-0 bg-sky-600 hover:bg-sky-700"
            onClick={() => {
              dispensarBannerMovel()
              navigate('/movel')
            }}
          >
            Abrir versão celular
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-sky-700"
            onClick={dispensarBannerMovel}
            aria-label="Dispensar aviso"
          >
            ✕
          </Button>
        </div>
      )}

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
