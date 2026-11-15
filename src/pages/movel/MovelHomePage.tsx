import { useNavigate } from 'react-router-dom'
import { Barcode, ShoppingCart, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'

/** Tela inicial do Trevvo Móvel (mobile-first, fora da Sidebar do desktop). */
export default function MovelHomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresaAtiva()

  const nomeEmpresa = empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Cabeçalho fino: empresa ativa + usuário */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{nomeEmpresa}</p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <User className="h-3 w-3" /> {user?.name || 'Usuário'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-3 px-4 py-6">
        <p className="text-center text-lg font-bold text-slate-900">Trevvo Móvel</p>

        {/* Botões grandes (mín. 48px de altura) */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <Button
              className="h-14 w-full justify-start gap-3 text-base"
              onClick={() => navigate('/movel/consulta')}
            >
              <Barcode className="h-5 w-5" /> Consultar produto
            </Button>
            <Button className="h-14 w-full justify-start gap-3 text-base" disabled>
              <ShoppingCart className="h-5 w-5" /> Nova venda
              <span className="ml-auto text-xs font-normal text-slate-400">em breve</span>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
