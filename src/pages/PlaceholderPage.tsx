import React from 'react'
import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface PlaceholderPageProps {
  title: string
  subtitle?: string
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  subtitle = 'Módulo em construção',
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>

      <Card className="border-slate-200 shadow-xs bg-white">
        <CardContent className="py-16 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Construction className="w-8 h-8 stroke-[1.8]" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h2 className="text-lg font-semibold text-slate-800">Em construção</h2>
            <p className="text-sm text-slate-500">
              Esta funcionalidade será implementada nas próximas etapas de desenvolvimento do ERP.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
