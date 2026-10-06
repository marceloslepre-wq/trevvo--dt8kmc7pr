import React from 'react'
import { Building2 } from 'lucide-react'

interface LogoProps {
  collapsed?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const Logo: React.FC<LogoProps> = ({ collapsed = false, className = '', size = 'md' }) => {
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

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div
        className={`flex items-center justify-center bg-blue-600 text-white shadow-sm flex-shrink-0 ${iconSizeClasses[size]}`}
      >
        <Building2 size={iconDim[size]} className="stroke-[2.2]" />
      </div>
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight text-slate-900 text-base">ERP Gestão</span>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 mt-0.5">
            Comercial
          </span>
        </div>
      )}
    </div>
  )
}
