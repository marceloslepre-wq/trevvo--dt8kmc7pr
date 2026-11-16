import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import GuardaRota from './GuardaRota'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'

/** Iniciais do nome do usuário (ex.: "Ana Paula Silva" -> "AS"). */
const iniciais = (nome?: string) => {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * LAYOUT DO TREVVO MÓVEL (fora do Layout desktop, sem Sidebar/Header do ERP).
 *
 * Feito para caber SEMPRE em telas de celular (360–412px), sem zoom:
 * - coluna em 100dvh (não 100vh) com cabeçalho fino de UMA linha (máx. 56px),
 *   conteúdo com rolagem própria e nada de rolagem horizontal;
 * - todas as larguras em porcentagem/min-w-0 — nenhum filho pode empurrar a
 *   página para fora da tela;
 * - a guarda de permissões continua a mesma (GuardaRota, tabela de rotas).
 */
export default function MovelLayout() {
  const { user, logout } = useAuth()
  const { empresaAtiva } = useEmpresaAtiva()
  const nomeEmpresa = empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden overflow-hidden bg-slate-100 font-sans text-slate-900">
      {/* Cabeçalho fino de uma linha (máx. 56px): empresa + iniciais + sair */}
      <header className="flex h-14 max-h-14 min-h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">
            {nomeEmpresa}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600"
        >
          {iniciais(user?.name)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1 px-2 text-slate-600 hover:text-slate-900"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </header>

      {/* Conteúdo: cada tela preenche e controla a própria rolagem vertical */}
      <GuardaRota>
        <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </GuardaRota>
    </div>
  )
}
