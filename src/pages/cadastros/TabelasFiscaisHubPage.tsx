import React from 'react'
import { Link } from 'react-router-dom'
import {
  FileCode,
  Layers,
  FileCheck,
  Percent,
  Calculator,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const TabelasFiscaisHubPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tabelas Fiscais</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestão centralizada de parâmetros fiscais, classificações, NCM, CEST, CFOP e códigos
          tributários brasileiros.
        </p>
      </div>

      {/* Grid de Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card Códigos Fiscais */}
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

        {/* Card NCM */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <FileCheck className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Classificação Fiscal (NCM)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Nomenclatura Comum do Mercosul de 8 dígitos, alíquotas IPI, vigências e importação
              oficial do Siscomex ou planilha CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/ncm">
                Acessar NCM
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card CEST */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                <Layers className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Substituição Tributária (CEST)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Código Especificador da Substituição Tributária (7 dígitos), relacionamento com NCMs
              ou prefixos e importação CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-amber-600 hover:bg-amber-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/cest">
                Acessar CEST
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card CFOP */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              CFOP (Naturezas de Operação)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Códigos de 4 dígitos com determinação automática de tipo de movimento, abrangência,
              impacto no estoque e financeiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/cfop">
                Acessar CFOP
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
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
