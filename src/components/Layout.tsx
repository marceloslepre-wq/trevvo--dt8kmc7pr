import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './layout/Sidebar'
import { Header } from './layout/Header'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
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
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
