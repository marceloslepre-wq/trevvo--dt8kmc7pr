import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'

export default function Index() {
  const { user } = useAuth()
  const userName = user?.name || 'Administrador'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel</h1>
        <p className="text-sm text-slate-500 mt-1">Visão geral do ERP de gestão comercial</p>
      </div>

      <Card className="border-slate-200 bg-white shadow-xs">
        <CardContent className="p-8 sm:p-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl flex-shrink-0 mt-0.5 border border-blue-100">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Bem-vindo ao sistema, {userName}!
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                A fundação do ERP comercial está configurada. Os módulos de cadastros, estoque,
                compras, financeiro, vendas e fiscal serão construídos nas próximas etapas do
                projeto.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
