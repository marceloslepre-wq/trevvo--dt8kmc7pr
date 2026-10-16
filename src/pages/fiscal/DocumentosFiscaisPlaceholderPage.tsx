import React from 'react'
import { FileText, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'

export const DocumentosFiscaisPlaceholderPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Documentos Fiscais (NF-e e NFC-e)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão, monitoramento, autorização e impressão de notas fiscais emitidas por{' '}
            <span className="font-semibold text-slate-800">
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa ativa'}
            </span>
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-amber-50 text-amber-700 border-amber-200">
          Etapa 6 • Em breve
        </Badge>
      </div>

      <Card className="border-slate-200 shadow-xs bg-white">
        <CardContent className="py-12 px-6 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-inner">
            <Sparkles className="w-8 h-8 stroke-[1.8]" />
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-xl font-semibold text-slate-800">
              Módulo de Emissão Fiscal em Construção
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              O serviço central de integração com a Focus NFe já está ativo no backend. Nas próximas
              mensagens da Etapa 6, esta tela reunirá o histórico completo de notas emitidas (NF-e
              modelo 55 e NFC-e modelo 65), permitindo consulta de status na SEFAZ, cancelamento,
              emissão de CC-e, inutilização de numeração e download de DANFE/XML.
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-left text-xs space-y-2">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>O que você já pode fazer agora:</span>
            </div>
            <ul className="list-disc pl-5 text-slate-600 space-y-1">
              <li>Configurar os tokens de Homologação e Produção por empresa</li>
              <li>Testar a conexão com a API da Focus NFe</li>
              <li>Verificar o checklist "Pronto para emitir?" dos dados cadastrais</li>
              <li>Definir séries, naturezas de operação e informações complementares</li>
            </ul>
          </div>

          <div>
            <Button asChild className="gap-2">
              <Link to="/fiscal/configuracoes">
                Acessar Configuração de Emissão
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default DocumentosFiscaisPlaceholderPage
