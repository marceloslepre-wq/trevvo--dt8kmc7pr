import React from 'react'
import { Link } from 'react-router-dom'
import { FileCode, ArrowRight, Calculator, Percent, Layers, FileCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const TabelasFiscaisHubPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <FileCode className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tabelas Fiscais</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Parâmetros tributários, códigos fiscais padrão SEFAZ, alíquotas de ICMS e regras por
          operação.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Card Códigos Fiscais - Ativo */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <FileCode className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">Códigos Fiscais</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              CST ICMS, CSOSN, CST IPI, PIS/COFINS, Origem da mercadoria, Tipo de Item SPED, CRT, IE
              do Destinatário e Reforma Tributária (IBS/CBS).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/codigos">
                Acessar Códigos Fiscais
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card CFOP - Em breve */}
        <Card className="border-slate-200 shadow-xs bg-slate-50/50 flex flex-col justify-between opacity-80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-slate-100 text-slate-400 rounded-lg">
                <Layers className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-semibold text-slate-400 border-slate-200"
              >
                Em breve
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-700">
              CFOP (Naturezas de Operação)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Códigos Fiscais de Operações e Prestações de entradas e saídas estaduais,
              interestaduais e exterior.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button disabled variant="outline" className="w-full text-xs">
              Módulo em desenvolvimento
            </Button>
          </CardContent>
        </Card>

        {/* Card NCM e CEST - Em breve */}
        <Card className="border-slate-200 shadow-xs bg-slate-50/50 flex flex-col justify-between opacity-80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-slate-100 text-slate-400 rounded-lg">
                <FileCheck className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-semibold text-slate-400 border-slate-200"
              >
                Em breve
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-700">NCM e CEST</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Nomenclatura Comum do Mercosul e Código Especificador da Substituição Tributária com
              alíquotas IBPT.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button disabled variant="outline" className="w-full text-xs">
              Módulo em desenvolvimento
            </Button>
          </CardContent>
        </Card>

        {/* Card Alíquotas de ICMS por Estado - Em breve */}
        <Card className="border-slate-200 shadow-xs bg-slate-50/50 flex flex-col justify-between opacity-80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-slate-100 text-slate-400 rounded-lg">
                <Percent className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-semibold text-slate-400 border-slate-200"
              >
                Em breve
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-700">
              Matriz de ICMS Interestadual
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Tabela de alíquotas internas e interestaduais (4%, 7%, 12%, 18%) e FCP (Fundo de
              Combate à Pobreza).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button disabled variant="outline" className="w-full text-xs">
              Módulo em desenvolvimento
            </Button>
          </CardContent>
        </Card>

        {/* Card Regras Tributárias Automáticas - Em breve */}
        <Card className="border-slate-200 shadow-xs bg-slate-50/50 flex flex-col justify-between opacity-80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-slate-100 text-slate-400 rounded-lg">
                <Calculator className="h-6 w-6" />
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-semibold text-slate-400 border-slate-200"
              >
                Em breve
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-700">
              Regras e Perfis Tributários
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Motor de regras fiscais automáticas por tipo de operação, destinatário (consumidor
              final / revenda) e UF.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button disabled variant="outline" className="w-full text-xs">
              Módulo em desenvolvimento
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default TabelasFiscaisHubPage
