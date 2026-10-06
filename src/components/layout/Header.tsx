import React from 'react'
import { Menu, LogOut, Building, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface HeaderProps {
  onOpenMobileMenu: () => void
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { user, logout } = useAuth()

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ')
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      }
      return name.slice(0, 2).toUpperCase()
    }
    if (email) {
      return email.slice(0, 2).toUpperCase()
    }
    return 'AD'
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Lado esquerdo: hambúrguer mobile + nome do sistema */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
          aria-label="Abrir menu de navegação"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 text-sm md:text-base hidden sm:inline">
            ERP Gestão Comercial
          </span>
          <span className="font-semibold text-slate-800 text-sm sm:hidden">ERP Comercial</span>
        </div>
      </div>

      {/* Centro: Seletor de Empresa Ativa */}
      <div className="flex items-center gap-2 max-w-xs w-full mx-2 md:mx-4">
        <div className="w-full">
          <Select disabled>
            <SelectTrigger
              className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
              title="Nenhuma empresa cadastrada no momento"
            >
              <div className="flex items-center gap-2 truncate">
                <Building size={14} className="text-slate-400 flex-shrink-0" />
                <SelectValue placeholder="Selecione a empresa" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma" disabled>
                Nenhuma empresa cadastrada
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lado direito: Perfil do usuário e Ação Sair */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Dropdown do perfil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none">
              <Avatar className="h-8 w-8 rounded-full border border-slate-200 bg-blue-50 text-blue-700">
                <AvatarFallback className="text-xs font-semibold">
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col text-left leading-tight">
                <span className="text-xs font-medium text-slate-800 max-w-[130px] truncate">
                  {user?.name || 'Administrador'}
                </span>
                <span className="text-[11px] text-slate-500 max-w-[130px] truncate">
                  {user?.email}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-slate-900">
                  {user?.name || 'Administrador'}
                </p>
                <p className="text-xs leading-none text-slate-500 truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-slate-500 cursor-default">
              <User className="mr-2 h-4 w-4" />
              <span>Perfil do usuário</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-xs text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4 text-red-500" />
              <span>Sair do sistema</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Botão Sair visível diretamente */}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="text-xs font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border-slate-200 h-8 gap-1.5 px-2.5 transition-colors"
          title="Encerrar sessão"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>
    </header>
  )
}
