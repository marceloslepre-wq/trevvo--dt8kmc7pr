import React, { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Building,
  DollarSign,
  TrendingDown,
  TrendingUp,
  FileText,
  Lock,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  verificarIntegridadeFinanceiro,
  ResultadoIntegridadeFinanceiro,
  DivergenciaFinanceira,
} from '@/services/integridadeFinanceiro'
import AcessoNegado from '@/components/AcessoNegado'

export default function IntegridadeFinanceiroPage() {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { administrador } = usePermissoes()

  const [executando, setExecutando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoIntegridadeFinanceiro | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const [apenasEmpresaAtiva, setApenasEmpresaAtiva] = useState(true)

  // Apenas Administradores (perfis_acesso.administrador = true) têm acesso a esta ferramenta
  if (!administrador) {
    return (
      <AcessoNegado mensagem="A ferramenta de verificação de integridade financeira é restrita a usuários com perfil de Administrador do sistema." />
    )
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val)
  }

  const formatarDataHora = (dataIso: string) => {
    try {
      const d = new Date(dataIso)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return dataIso
    }
  }

  const rodarVerificacao = async () => {
    try {
      setExecutando(true)
      const empId = apenasEmpresaAtiva && empresaAtiva ? empresaAtiva.id : undefined
      const res = await verificarIntegridadeFinanceiro(empId)
      setResultado(res)

      if (res.totalDivergencias === 0) {
        toast({
          title: 'Integridade Financeira OK',
          description:
            'Nenhuma divergência foi encontrada nos saldos de contas e títulos verificados.',
        })
      } else {
        toast({
          title: 'Divergências detectadas',
          description: `Foram encontradas ${res.totalDivergencias} divergência(s) nas conferências financeiras.`,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      console.error('Erro ao verificar integridade financeira:', err)
      toast({
        title: 'Erro na verificação',
        description: err.message || 'Falha ao executar as checagens financeiras no banco.',
        variant: 'destructive',
      })
    } finally {
      setExecutando(false)
    }
  }

  // Filtragem do relatório
  const divergenciasFiltradas = (resultado?.divergencias || []).filter((div) => {
    if (filtroCategoria !== 'todos' && div.categoria !== filtroCategoria) {
      return false
    }
    if (buscaTexto.trim()) {
      const term = buscaTexto.toLowerCase()
      const matchDesc = div.descricao.toLowerCase().includes(term)
      const matchRef = (div.referenciaCodigo || '').toLowerCase().includes(term)
      const matchDet = div.detalhes.toLowerCase().includes(term)
      if (!matchDesc && !matchRef && !matchDet) return false
    }
    return true
  })

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Verificar Integridade do Financeiro
            </h1>
            <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 font-normal">
              Auditoria de Saldos
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Conferência minuciosa entre saldos das contas bancárias, movimentações registradas e
            baixas de títulos a pagar e a receber. Esta ferramenta gera apenas{' '}
            <strong className="text-slate-700">relatório de divergências</strong> sem alterar dados
            automaticamente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={rodarVerificacao}
            disabled={executando}
            className="gap-2 shadow-xs bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 ${executando ? 'animate-spin' : ''}`} />
            {executando ? 'Conferindo...' : 'Verificar integridade'}
          </Button>
        </div>
      </div>

      {/* Card informativo de regras conferidas */}
      <Card className="border-slate-200 bg-slate-50/50 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600" />
            Conferências Executadas pelo Auditor
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Regras de integridade contábil-financeira do ERP:
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700">
            <li className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-semibold text-slate-900 block mb-1">
                (a) Contas Financeiras:
              </span>
              Saldo atual = saldo inicial + entradas − saídas das movimentações financeiras não
              estornadas.
            </li>
            <li className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-semibold text-slate-900 block mb-1">
                (b) Títulos a Pagar e Receber:
              </span>
              Valor pago / recebido e saldo devem ser rigorosamente iguais à soma das baixas não
              estornadas.
            </li>
            <li className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="font-semibold text-slate-900 block mb-1">
                (c) Status "Pago" / "Recebido":
              </span>
              Nenhum título liquidado com situação "Pago" ou "Recebido" pode apresentar saldo em
              aberto diferente de zero.
            </li>
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={apenasEmpresaAtiva}
                onChange={(e) => setApenasEmpresaAtiva(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Restringir conferência à empresa ativa{' '}
                {empresaAtiva ? `(${empresaAtiva.nome_fantasia || empresaAtiva.razao_social})` : ''}
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Resultados ou Placeholder de execução */}
      {resultado && (
        <div className="space-y-4">
          {/* Métricas do Diagnóstico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-500">Contas Analisadas</span>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                    {resultado.totalContasAnalisadas}
                  </div>
                  <span className="text-[11px] text-slate-400">contas correntes / caixas</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <DollarSign size={20} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-500">A Pagar Analisados</span>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                    {resultado.totalTitulosPagarAnalisados}
                  </div>
                  <span className="text-[11px] text-slate-400">títulos de fornecedores</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <TrendingDown size={20} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-500">A Receber Analisados</span>
                  <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                    {resultado.totalTitulosReceberAnalisados}
                  </div>
                  <span className="text-[11px] text-slate-400">títulos de clientes</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-slate-200 shadow-xs ${
                resultado.totalDivergencias > 0
                  ? 'border-rose-300 bg-rose-50/20'
                  : 'border-emerald-300 bg-emerald-50/20'
              }`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-500">Divergências</span>
                  <div
                    className={`text-2xl font-bold tracking-tight mt-1 ${
                      resultado.totalDivergencias > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {resultado.totalDivergencias}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {resultado.totalDivergencias === 0
                      ? 'tudo em conformidade'
                      : 'requerem averiguação'}
                  </span>
                </div>
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    resultado.totalDivergencias > 0
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {resultado.totalDivergencias > 0 ? (
                    <ShieldAlert size={20} />
                  ) : (
                    <ShieldCheck size={20} />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Banner de Nenhuma Divergência Encontrada */}
          {resultado.totalDivergencias === 0 ? (
            <Card className="border-emerald-200 bg-emerald-50/60 shadow-xs">
              <CardContent className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-900">
                    Nenhuma divergência encontrada
                  </h3>
                  <p className="text-xs text-emerald-700 mt-1 max-w-md">
                    Todos os saldos de contas financeiras conferem exatamente com as movimentações
                    registradas, e os títulos a pagar/receber estão 100% coerentes com os pagamentos
                    e baixas efetuados.
                  </p>
                </div>
                <span className="text-[11px] text-emerald-600 font-mono">
                  Última checagem: {formatarDataHora(resultado.dataExecucao)}
                </span>
              </CardContent>
            </Card>
          ) : (
            /* Relatório de Divergências Encontradas */
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      Relatório de Divergências Detectadas ({divergenciasFiltradas.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Executado em {formatarDataHora(resultado.dataExecucao)}. Verifique as
                      inconsistências listadas abaixo para análise contábil.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        placeholder="Buscar por descrição/ref..."
                        value={buscaTexto}
                        onChange={(e) => setBuscaTexto(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>

                    <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                      <SelectTrigger className="h-8 text-xs w-44">
                        <Filter className="w-3 h-3 mr-1.5 text-slate-400" />
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos" className="text-xs">
                          Todas as categorias
                        </SelectItem>
                        <SelectItem value="conta_financeira" className="text-xs">
                          Contas Financeiras
                        </SelectItem>
                        <SelectItem value="conta_pagar" className="text-xs">
                          Contas a Pagar
                        </SelectItem>
                        <SelectItem value="conta_receber" className="text-xs">
                          Contas a Receber
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-slate-50/70">
                      <TableRow className="text-[11px] text-slate-600">
                        <TableHead className="py-2.5 px-4 font-semibold">Entidade</TableHead>
                        <TableHead className="py-2.5 px-4 font-semibold">ID / Referência</TableHead>
                        <TableHead className="py-2.5 px-4 font-semibold">Descrição</TableHead>
                        <TableHead className="py-2.5 px-4 text-right font-semibold">
                          Valor Esperado
                        </TableHead>
                        <TableHead className="py-2.5 px-4 text-right font-semibold">
                          Valor Encontrado
                        </TableHead>
                        <TableHead className="py-2.5 px-4 text-right font-semibold">
                          Diferença
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {divergenciasFiltradas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                            Nenhuma divergência corresponde aos filtros aplicados.
                          </TableCell>
                        </TableRow>
                      ) : (
                        divergenciasFiltradas.map((div) => {
                          const ehPositivo = div.diferenca > 0
                          return (
                            <TableRow
                              key={div.id}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              <TableCell className="py-2.5 px-4 whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-medium ${
                                    div.categoria === 'conta_financeira'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : div.categoria === 'conta_pagar'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {div.categoriaRotulo}
                                </Badge>
                                {div.empresaNome && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                    <Building size={10} />
                                    <span className="truncate max-w-[120px]">
                                      {div.empresaNome}
                                    </span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                {div.referenciaCodigo || div.referenciaId}
                                <div className="text-[9px] text-slate-400 font-normal">
                                  ID: {div.referenciaId}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-4 max-w-sm">
                                <div className="font-medium text-slate-900">{div.descricao}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                  {div.detalhes}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-4 text-right font-mono font-medium text-slate-700 whitespace-nowrap">
                                {formatarMoeda(div.valorEsperado)}
                              </TableCell>
                              <TableCell className="py-2.5 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                                {formatarMoeda(div.valorEncontrado)}
                              </TableCell>
                              <TableCell
                                className={`py-2.5 px-4 text-right font-mono font-bold whitespace-nowrap ${
                                  ehPositivo ? 'text-rose-700' : 'text-amber-700'
                                }`}
                              >
                                {ehPositivo ? '+' : ''}
                                {formatarMoeda(div.diferenca)}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Estado Inicial sem Execução */}
      {!resultado && (
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText size={26} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Auditoria Financeira Pronta para Execução
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Clique no botão "Verificar integridade" acima para rodar as conferências em tempo
                real contra as contas e títulos do banco de dados.
              </p>
            </div>
            <Button
              onClick={rodarVerificacao}
              disabled={executando}
              className="gap-2 shadow-xs bg-blue-600 hover:bg-blue-700 text-white mt-2"
            >
              <RefreshCw className={`w-4 h-4 ${executando ? 'animate-spin' : ''}`} />
              {executando ? 'Conferindo...' : 'Verificar integridade'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
