import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Building,
  Package,
  Layers,
  FileSpreadsheet,
  Download,
  Info,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import {
  verificarIntegridadeEstoque,
  ResultadoIntegridadeEstoque,
  DivergenciaEstoque,
} from '@/services/integridadeEstoque'

export const IntegridadeEstoquePage: React.FC = () => {
  const { toast } = useToast()
  const { administrador } = usePermissoes()

  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('todas')
  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoIntegridadeEstoque | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'saldo_vs_movimentos' | 'saldo_vs_lotes'>(
    'todos',
  )

  useEffect(() => {
    listarEmpresasAtivas()
      .then(setEmpresas)
      .catch((err) => console.error('Erro ao listar empresas:', err))
  }, [])

  const executarVerificacao = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await verificarIntegridadeEstoque(empresaFiltro)
      setResultado(res)
      if (res.divergencias_encontradas === 0) {
        toast({
          title: 'Integridade confirmada!',
          description: 'Nenhuma divergência encontrada entre saldos, movimentos e lotes.',
        })
      } else {
        toast({
          title: 'Divergências detectadas',
          description: `Foram encontradas ${res.divergencias_encontradas} divergência(s). Veja o relatório abaixo.`,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao verificar integridade'
      toast({
        title: 'Erro na verificação',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaFiltro, toast])

  // Executa uma primeira vez ao abrir
  useEffect(() => {
    executarVerificacao()
  }, [executarVerificacao])

  const divergenciasFiltradas = (resultado?.itens_divergentes || []).filter((div) => {
    if (filtroTipo !== 'todos' && div.tipo !== filtroTipo) return false
    return true
  })

  const formatarQtd = (val: number) => {
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  }

  const formatarDataHora = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const exportarCSV = () => {
    if (!resultado || resultado.itens_divergentes.length === 0) {
      toast({
        title: 'Sem divergências',
        description: 'Não existem divergências na verificação atual para exportar.',
      })
      return
    }

    const cabecalho = [
      'Empresa',
      'Código Produto',
      'Descrição do Produto',
      'Tipo de Divergência',
      'Valor Esperado',
      'Valor Encontrado',
      'Diferença',
      'Detalhes',
    ]

    const linhas = divergenciasFiltradas.map((d) => [
      `"${d.empresa_nome.replace(/"/g, '""')}"`,
      `"${d.produto_codigo}"`,
      `"${d.produto_descricao.replace(/"/g, '""')}"`,
      `"${d.tipo === 'saldo_vs_movimentos' ? 'Saldo vs Movimentos' : 'Saldo vs Lotes'}"`,
      d.valor_esperado.toString().replace('.', ','),
      d.valor_encontrado.toString().replace('.', ','),
      d.diferenca.toString().replace('.', ','),
      `"${d.detalhes.replace(/"/g, '""')}"`,
    ])

    const csvContent = [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `integridade_estoque_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV exportado',
      description: 'O relatório de divergências foi baixado.',
    })
  }

  if (!administrador) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center text-slate-500">
          Esta ferramenta é de uso exclusivo dos administradores do sistema.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Integridade do Estoque
            </h1>
            <Badge variant="outline" className="text-xs font-normal border-slate-300">
              Auditoria Administrativa
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Conferência matemática entre a tabela consolidada de saldos (`estoque_saldos`), a soma
            algébrica dos movimentos no Kardex (`estoque_movimentos`) e a soma dos lotes ativos.
            Nenhuma correção automática é executada.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={executarVerificacao}
            disabled={carregando}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Verificar Integridade Agora
          </Button>

          <Button
            onClick={exportarCSV}
            variant="outline"
            size="sm"
            disabled={!resultado || divergenciasFiltradas.length === 0}
            className="text-xs h-9 text-slate-700 border-slate-300"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Exportar Divergências
          </Button>
        </div>
      </div>

      {/* Filtros de Empresa e Tipo */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Empresa / Filial:</span>
                <Select value={empresaFiltro} onValueChange={setEmpresaFiltro}>
                  <SelectTrigger className="w-56 h-9 text-xs">
                    <SelectValue placeholder="Todas as empresas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as empresas</SelectItem>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Tipo:</span>
                <Select value={filtroTipo} onValueChange={(val: any) => setFiltroTipo(val)}>
                  <SelectTrigger className="w-48 h-9 text-xs">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    <SelectItem value="saldo_vs_movimentos">Saldo vs Movimentos</SelectItem>
                    <SelectItem value="saldo_vs_lotes">Saldo vs Lotes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {resultado && (
              <div className="text-xs text-slate-400">
                Última conferência: {formatarDataHora(resultado.data_execucao)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cartões de Resumo da Auditoria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Geral */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Status da Integridade</span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  !resultado
                    ? 'bg-slate-100 text-slate-400'
                    : resultado.divergencias_encontradas === 0
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600'
                }`}
              >
                {!resultado ? (
                  <RefreshCw size={18} />
                ) : resultado.divergencias_encontradas === 0 ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <XCircle size={18} />
                )}
              </div>
            </div>
            <div className="mt-3">
              <div
                className={`text-xl font-bold tracking-tight ${
                  !resultado
                    ? 'text-slate-400'
                    : resultado.divergencias_encontradas === 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                }`}
              >
                {!resultado
                  ? 'Aguardando'
                  : resultado.divergencias_encontradas === 0
                    ? '100% Íntegro'
                    : `${resultado.divergencias_encontradas} Divergência(s)`}
              </div>
              <span className="text-[11px] text-slate-400">
                {resultado?.divergencias_encontradas === 0
                  ? 'Saldos, Kardex e Lotes conferem perfeitamente'
                  : 'Requer atenção do administrador'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total de Saldos Analisados */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Registros em Saldos</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Package size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {carregando ? '—' : resultado?.total_saldos_verificados || 0}
              </div>
              <span className="text-[11px] text-slate-400">em estoque_saldos</span>
            </div>
          </CardContent>
        </Card>

        {/* Total de Movimentos no Kardex */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Movimentos no Kardex</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileSpreadsheet size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {carregando ? '—' : resultado?.total_movimentos_verificados || 0}
              </div>
              <span className="text-[11px] text-slate-400">em estoque_movimentos</span>
            </div>
          </CardContent>
        </Card>

        {/* Lotes Verificados */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Lotes Físicos Ativos</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Layers size={18} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {carregando ? '—' : resultado?.total_lotes_verificados || 0}
              </div>
              <span className="text-[11px] text-slate-400">lotes com rastreabilidade</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Divergências */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="p-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-base font-bold text-slate-900">
                Lista de Divergências Encontradas
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              {divergenciasFiltradas.length}{' '}
              {divergenciasFiltradas.length === 1 ? 'registro divergente' : 'registros divergentes'}
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Esta lista exibe discrepâncias onde o saldo final armazenado difere da soma real dos
            movimentos ou da soma dos lotes.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {carregando ? (
            <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span>Conferindo registros de saldos, kardex e lotes no banco de dados...</span>
            </div>
          ) : divergenciasFiltradas.length === 0 ? (
            <div className="p-12 text-center text-slate-600 text-xs flex flex-col items-center gap-2 bg-emerald-50/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <span className="font-semibold text-sm text-slate-900">
                Tudo certo! Nenhuma divergência detectada no estoque.
              </span>
              <span className="text-slate-500 max-w-md">
                Para todos os produtos e empresas verificados, a soma matemática dos movimentos do
                kardex é exatamente igual aos saldos registrados, e os lotes conferem com os itens
                rastreados.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Empresa</th>
                    <th className="py-2.5 px-4">Produto</th>
                    <th className="py-2.5 px-4">Tipo de Auditoria</th>
                    <th className="py-2.5 px-4 text-right">Valor Esperado</th>
                    <th className="py-2.5 px-4 text-right">Valor Encontrado</th>
                    <th className="py-2.5 px-4 text-right">Diferença</th>
                    <th className="py-2.5 px-4">Detalhes</th>
                    <th className="py-2.5 px-4 text-center w-16">Kardex</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divergenciasFiltradas.map((div) => (
                    <tr key={div.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {div.empresa_nome}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{div.produto_descricao}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Cód: #{div.produto_codigo} {div.controla_lote && '• Controla Lote'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            div.tipo === 'saldo_vs_movimentos'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                              : 'bg-purple-50 text-purple-700 border-purple-200 text-[10px]'
                          }
                        >
                          {div.tipo === 'saldo_vs_movimentos'
                            ? 'Saldo vs Movimentos'
                            : 'Saldo vs Lotes'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-700">
                        {formatarQtd(div.valor_esperado)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-700">
                        {formatarQtd(div.valor_encontrado)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-800">
                        {div.diferenca > 0
                          ? `+${formatarQtd(div.diferenca)}`
                          : formatarQtd(div.diferenca)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-[11px] max-w-xs">
                        {div.detalhes}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-blue-600"
                          title="Abrir Kardex do produto"
                        >
                          <Link to={`/estoque/kardex?produto=${div.produto_id}`}>
                            <ExternalLink size={13} />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco explicativo sobre a política de integridade */}
      <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Política de integridade e imutabilidade de estoque:</p>
          <p className="text-blue-800/90 leading-relaxed">
            O ERP de Gestão Comercial proíbe gravações diretas ou alterações manuais nas tabelas
            <code className="mx-1 px-1 py-0.5 bg-blue-100 rounded text-blue-900 font-mono">
              estoque_saldos
            </code>
            e
            <code className="mx-1 px-1 py-0.5 bg-blue-100 rounded text-blue-900 font-mono">
              estoque_movimentos
            </code>
            . Todas as transações ocorrem unicamente via serviço central em transação atômica
            SQLite. Se alguma inconsistência for detectada, realize um lançamento de ajuste ou
            estorno formal para manter o rastro contábil e fiscal para o SPED.
          </p>
        </div>
      </div>
    </div>
  )
}

export default IntegridadeEstoquePage
