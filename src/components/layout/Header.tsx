import React, { useState } from 'react'
import { Menu, LogOut, Building, User, ShieldAlert, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { Button } from '@/components/ui/button'
import { sairPainelClienteMaster } from '@/services/master'
import { toast } from '@/hooks/use-toast'
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
  const {
    empresas,
    empresaAtiva,
    selecionarEmpresa,
    carregando,
    assinante,
    modoMaster,
    recarregarEmpresas,
  } = useEmpresaAtiva()
  const { perfil, administrador } = usePermissoes()
  const { config, logoUrl } = useConfiguracoes()
  const [saindoModoMaster, setSaindoModoMaster] = useState(false)

  const handleSairModoMaster = async () => {
    try {
      setSaindoModoMaster(true)
      const res = await sairPainelClienteMaster()
      if (res && res.sucesso) {
        toast({
          title: 'Modo master desativado',
          description: 'Você voltou para o painel da HOSPITAL HOME.',
        })
        await recarregarEmpresas()
        window.location.href = '/master'
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao sair do modo master',
          description: res?.message || 'Falha ao retornar para o painel de origem.',
        })
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao sair do modo master',
        description: err?.message || 'Erro inesperado ao desativar o modo master.',
      })
    } finally {
      setSaindoModoMaster(false)
    }
  }

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
    <header className="sticky top-0 z-20 flex flex-col w-full">
      {/* Faixa fixa no topo: Modo Master (Prompt 9.7b2 - Requisito 1) */}
      {modoMaster && (
        <div className="w-full bg-amber-500 text-slate-950 px-4 py-2 flex items-center justify-between shadow-md border-b border-amber-600 font-medium text-xs sm:text-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-slate-950" />
            <span>
              Você está no painel de <strong>{assinante?.nome || 'Cliente'}</strong> (modo master)
            </span>
            {assinante?.numero_licenca && (
              <span className="hidden md:inline-block text-[11px] bg-amber-600/30 text-slate-950 px-2 py-0.5 rounded font-mono">
                {assinante.numero_licenca}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSairModoMaster}
            disabled={saindoModoMaster}
            className="h-7 sm:h-8 bg-slate-950 text-white hover:bg-slate-900 hover:text-white border-none font-semibold text-xs flex items-center gap-1.5 shadow"
          >
            {saindoModoMaster ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Sair do painel do cliente
          </Button>
        </div>
      )}

      <div className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
            aria-label="Abrir menu de navegação"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            {logoUrl && (
              <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain rounded md:hidden" />
            )}
            <span className="font-semibold text-slate-800 text-sm md:text-base hidden sm:inline truncate max-w-[240px]">
              {config?.nome_sistema || 'ERP Gestão Comercial'}
            </span>
            <span className="font-semibold text-slate-800 text-sm sm:hidden truncate max-w-[150px]">
              {config?.nome_sistema || 'ERP Comercial'}
            </span>
          </div>
        </div>

        {/* Centro: Seletor de Empresa Ativa */}
        <div className="flex items-center gap-2 max-w-md w-full mx-2 md:mx-4">
          <div className="w-full">
            <Select
              value={empresaAtiva ? empresaAtiva.id : ''}
              onValueChange={(val) => selecionarEmpresa(val)}
              disabled={carregando || empresas.length === 0}
            >
              <SelectTrigger
                className={`h-9 text-xs border-slate-200 ${
                  empresas.length === 0
                    ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-50 font-medium text-slate-800'
                }`}
                title={
                  empresas.length === 0
                    ? 'Nenhuma empresa cadastrada ou ativa'
                    : 'Selecione a empresa ativa para operações'
                }
              >
                <div className="flex items-center gap-2 truncate">
                  <Building size={14} className="text-blue-600 flex-shrink-0" />
                  <SelectValue
                    placeholder={carregando ? 'Carregando empresas...' : 'Selecione a empresa'}
                  >
                    {empresaAtiva ? (
                      <span className="truncate">
                        {empresaAtiva.codigo} -{' '}
                        {empresaAtiva.nome_fantasia || empresaAtiva.razao_social} (
                        {empresaAtiva.tipo})
                      </span>
                    ) : (
                      'Nenhuma empresa cadastrada'
                    )}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent>
                {empresas.length === 0 ? (
                  <SelectItem value="nenhuma" disabled>
                    Nenhuma empresa cadastrada
                  </SelectItem>
                ) : (
                  empresas.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id} className="text-xs">
                      <span className="font-semibold text-slate-700">{emp.codigo}</span> -{' '}
                      <span>{emp.nome_fantasia || emp.razao_social}</span>{' '}
                      <span className="text-slate-400 text-[11px]">({emp.tipo})</span>
                    </SelectItem>
                  ))
                )}
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
                  <span className="text-[10px] text-blue-600 font-medium max-w-[130px] truncate">
                    {administrador ? 'Administrador' : perfil?.nome || 'Operador'}
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
                  <p className="text-xs font-medium text-blue-600">
                    Perfil: {administrador ? 'Administrador' : perfil?.nome || 'Operador'}
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
      </div>
    </header>
  )
}
