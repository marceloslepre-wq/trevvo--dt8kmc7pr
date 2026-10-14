import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserCheck, Check } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Usuario } from '@/services/usuarios'

interface ModalVendedorPDVProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  vendedorAtualId?: string
  empresaId: string
  onConfirmar: (vendedor: Usuario | null) => void
}

export const ModalVendedorPDV: React.FC<ModalVendedorPDVProps> = ({
  aberto,
  onOpenChange,
  vendedorAtualId,
  empresaId,
  onConfirmar,
}) => {
  const [vendedores, setVendedores] = useState<Usuario[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string>(vendedorAtualId || '')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setSelecionadoId(vendedorAtualId || '')
      carregarVendedores()
    }
  }, [aberto, vendedorAtualId])

  const carregarVendedores = async () => {
    setCarregando(true)
    try {
      const res = await pb.collection('usuarios').getFullList<Usuario>({
        filter: 'ativo = true && e_vendedor = true',
        sort: 'nome',
      })
      setVendedores(res)
    } catch (err) {
      console.warn('Erro ao carregar vendedores:', err)
    } finally {
      setCarregando(false)
    }
  }

  const handleSalvar = () => {
    const v = vendedores.find((item) => item.id === selecionadoId) || null
    onConfirmar(v)
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 text-white border-slate-700 p-6">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-blue-400" />
            Selecionar Vendedor (F5)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-1 bg-slate-950/60">
            {/* Opção sem vendedor */}
            <div
              onClick={() => setSelecionadoId('')}
              className={`flex items-center justify-between p-2.5 rounded cursor-pointer text-xs ${
                !selecionadoId
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>Sem Vendedor Atribuído (Venda Balcão)</span>
              {!selecionadoId && <Check size={16} className="text-white" />}
            </div>

            {vendedores.map((v) => {
              const ativo = selecionadoId === v.id
              return (
                <div
                  key={v.id}
                  onClick={() => setSelecionadoId(v.id)}
                  className={`flex items-center justify-between p-2.5 rounded cursor-pointer text-xs ${
                    ativo
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-medium">{v.nome}</div>
                    <div className="text-[10px] opacity-75">{v.email}</div>
                  </div>
                  {ativo && <Check size={16} className="text-white shrink-0 ml-2" />}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800 pt-3 flex justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-xs"
          >
            Cancelar (Esc)
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSalvar}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5"
          >
            Confirmar (Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
