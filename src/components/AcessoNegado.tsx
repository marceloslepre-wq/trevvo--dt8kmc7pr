import React from 'react'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { destinoInicial } from '@/components/destinoInicial'
import { usePermissoes } from '@/contexts/PermissoesContext'

interface AcessoNegadoProps {
  mensagem?: string
}

export const AcessoNegado: React.FC<AcessoNegadoProps> = ({
  mensagem = 'Você não possui permissão para acessar esta funcionalidade. Solicite acesso ao administrador do sistema.',
}) => {
  const navigate = useNavigate()
  const { pode, administrador } = usePermissoes()
  // Botão "Ir para o início": mesmo destino que a rota "/" resolveria para
  // este perfil (painel -> PDV -> primeira rota permitida do menu). Sem
  // nenhuma rota permitida, fica em /painel (mostrará Acesso negado).
  const irParaInicio = () => {
    const destino = destinoInicial(pode, administrador)
    navigate(destino || '/painel')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4 shadow-xs">
        <ShieldAlert size={36} />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Acesso Negado</h1>
      <p className="text-slate-600 mt-2 max-w-md text-sm leading-relaxed">{mensagem}</p>
      <div className="mt-6 flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Voltar
        </Button>
        <Button onClick={irParaInicio} className="bg-blue-600 hover:bg-blue-700 text-white">
          Ir para o início
        </Button>
      </div>
    </div>
  )
}

export default AcessoNegado
