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
  Grid,
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

        {/* Card Conversão de CFOP de Entrada - Ativo */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <ArrowRight className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Conversão de CFOP de Entrada
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              De-para fiscal automático do CFOP do fornecedor para escrituração interna na
              importação de NF-e por finalidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/conversao-cfop">
                Acessar Conversão de CFOP
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card Perfis Tributários - Ativo */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Calculator className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">Perfis Tributários</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Modelos de tributação completos com 8 cenários (venda interna, interestadual,
              devolução e compra) para ICMS, ST, IPI, PIS, COFINS e IBS/CBS.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/perfis">
                Acessar Perfis Tributários
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card Regras Fiscais por NCM */}
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
              Regras Fiscais por NCM
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Regras automáticas por prefixo de NCM, UF de destino e regime tributário para o motor
              fiscal sugerir classificação com alta confiança.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/regras-ncm">
                Acessar Regras NCM
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Card Matriz de ICMS Interestadual */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg">
                <Grid className="h-6 w-6" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium">
                Ativo
              </Badge>
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Matriz de ICMS Interestadual
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Tabela 27x27 de alíquotas interestaduais (Resolução 22/1989) e alíquotas internas das
              27 UFs para emissão de saídas e DIFAL.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild className="w-full bg-purple-600 hover:bg-purple-700 text-white">
              <Link to="/cadastros/tabelas-fiscais/matriz-icms">
                Acessar Matriz de ICMS
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
export default TabelasFiscaisHubPage
