import { useNavigate } from 'react-router-dom'
import { Barcode, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/** Tela inicial do Trevvo Móvel (o cabeçalho do sistema vem do MovelLayout). */
export default function MovelHomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-slate-50">
      <main className="min-h-0 w-full min-w-0 flex-1 space-y-3 px-4 py-6">
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
            <Button
              className="h-14 w-full justify-start gap-3 text-base"
              onClick={() => navigate('/movel/venda')}
            >
              <ShoppingCart className="h-5 w-5" /> Nova venda
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
