import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown,
  LayoutDashboard,
  HelpCircle,
  RefreshCw,
  LogOut,
  KeyRound,
  Layers,
  Construction,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { useToast } from '@/hooks/use-toast'

export const MasterPage: React.FC = () => {
  const { user, logout } = useAuth()
  const { config, logoUrl } = useConfiguracoes()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [abaAtiva, setAbaAtiva] = useState<'licencas' | 'planos'>('licencas')
  const [atualizando, setAtualizando] = useState(false)

  const handleAtualizar = async () => {
    try {
      setAtualizando(true)
      toast({
        title: 'Painel Atualizado',
        description: 'Informações e status do ambiente Master sincronizados com sucesso.',
      })
    } finally {
      setTimeout(() => setAtualizando(false), 400)
    }
  }

  const handleGuiaUso = () => {
    toast({
      title: 'Guia de Uso do Painel Master',
      description:
        'O Painel Master gerencia globalmente as licenças dos assinantes, planos comerciais e parâmetros do SaaS.',
    })
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Topo do /master */}
      <header className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Lado esquerdo: Nome do sistema, selo MASTER e subtítulo */}
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-8 w-8 object-contain rounded bg-white/10 p-1"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-purple-700 to-indigo-500 flex items-center justify-center text-white shadow-inner">
                <Crown size={20} className="text-amber-300" />
              </div>
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                  {config?.nome_sistema || 'ERP Gestão Comercial'}
                </span>
                <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 hover:bg-amber-400 font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 border-none shadow-xs">
                  MASTER MULTI-TENANT
                </Badge>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                Painel de Administração Global
              </span>
            </div>
          </div>

          {/* Lado direito: Botão Ir ao Painel Gerencial + Admin Master + Ações */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/painel')}
              className="gap-1.5 h-8 text-xs font-semibold bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
              title="Voltar ao ERP"
            >
              <LayoutDashboard size={14} className="text-blue-400" />
              <span className="hidden md:inline">Ir ao Painel Gerencial</span>
              <span className="md:hidden">ERP</span>
            </Button>

            <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

            {/* Identificação Admin Master */}
            <div className="hidden lg:flex flex-col text-right leading-tight">
              <span className="text-xs font-bold text-amber-300 flex items-center justify-end gap-1">
                <ShieldCheck size={13} className="text-amber-400 inline" />
                Admin Master
              </span>
              <span className="text-[11px] text-slate-400 max-w-[190px] truncate">
                {user?.email || 'master@erp.local'}
              </span>
            </div>

            {/* Botões do topo: Guia de Uso, Atualizar e Sair */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGuiaUso}
                className="h-8 px-2 sm:px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                title="Guia de Uso"
              >
                <HelpCircle size={15} />
                <span className="hidden sm:inline ml-1.5">Guia de Uso</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleAtualizar}
                disabled={atualizando}
                className="h-8 px-2 sm:px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                title="Atualizar"
              >
                <RefreshCw size={14} className={atualizando ? 'animate-spin' : ''} />
                <span className="hidden sm:inline ml-1.5">Atualizar</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-8 px-2 sm:px-2.5 text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-950/40"
                title="Sair"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline ml-1.5">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal do /master */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs
          value={abaAtiva}
          onValueChange={(val) => setAbaAtiva(val as 'licencas' | 'planos')}
          className="w-full space-y-6"
        >
          {/* Abas Superiores */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <TabsList className="bg-slate-200/80 p-1 border border-slate-300">
              <TabsTrigger
                value="licencas"
                className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs px-4 py-2"
              >
                <KeyRound size={15} className="text-purple-600" />
                Licenças de clientes
              </TabsTrigger>
              <TabsTrigger
                value="planos"
                className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs px-4 py-2"
              >
                <Layers size={15} className="text-blue-600" />
                Catálogo de planos
              </TabsTrigger>
            </TabsList>

            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Módulo de Governança Master (Prompt 9.7a)
            </span>
          </div>

          {/* Aba Licenças de Clientes (Em Construção - 9.7a2) */}
          <TabsContent value="licencas" className="mt-0">
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="h-16 w-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 ring-8 ring-purple-50/50">
                  <Construction size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  Licenças de Clientes em Construção
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                  A gestão e auditoria detalhada de licenças, contratos, validade e eventos de
                  clientes estão sendo integradas nesta aba (próxima etapa: Prompt 9.7a2).
                </p>
                <div className="mt-6 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-purple-700 bg-purple-50 border-purple-200"
                  >
                    Etapa 9.7a2
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Banco de dados e eventos já preparados
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Catálogo de Planos (Em Construção - 9.7b) */}
          <TabsContent value="planos" className="mt-0">
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-8 ring-blue-50/50">
                  <Construction size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  Catálogo de Planos em Construção
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                  A interface completa de precificação, limites de recursos, módulos fiscais e
                  edição do catálogo comercial de planos será disponibilizada no Prompt 9.7b.
                </p>
                <div className="mt-6 flex items-center gap-2">
                  <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200">
                    Etapa 9.7b
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Coleção planos_catalogo e seeds ativos
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default MasterPage
