import React from 'react'
import { Building2 } from 'lucide-react'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'

interface LogoProps {
  collapsed?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const Logo: React.FC<LogoProps> = ({ collapsed = false, className = '', size = 'md' }) => {
  const { config, logoUrl } = useConfiguracoes()

  const iconSizeClasses = {
    sm: 'w-7 h-7 rounded-md text-sm',
    md: 'w-9 h-9 rounded-lg text-base',
    lg: 'w-11 h-11 rounded-xl text-lg',
  }

  const iconDim = {
    sm: 16,
    md: 20,
    lg: 24,
  }

  const nome = config?.nome_sistema || 'ERP Gestão Comercial'
  const partes = nome.split(' ')
  const principal = partes[0] || 'ERP'
  const subtitulo = partes.slice(1).join(' ') || 'Comercial'

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {logoUrl ? (
        <div
          className={`flex items-center justify-center overflow-hidden rounded-lg bg-white border border-slate-200 shadow-xs flex-shrink-0 ${iconSizeClasses[size]}`}
        >
          <img src={logoUrl} alt={nome} className="w-full h-full object-contain p-0.5" />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center text-white shadow-sm flex-shrink-0 ${iconSizeClasses[size]}`}
          style={{ backgroundColor: config?.cor_principal || '#2563eb' }}
        >
          <Building2 size={iconDim[size]} className="stroke-[2.2]" />
        </div>
      )}
      {!collapsed && (
        <div className="flex flex-col leading-none min-w-0">
          <span className="font-bold tracking-tight text-slate-900 text-base truncate">
            {principal}
          </span>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5 truncate">
            {subtitulo}
          </span>
        </div>
      )}
    </div>
  )
}
