import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  apurarInadimplencia,
  ResumoInadimplencia,
  InadimplenciaClienteItem,
  InadimplenciaEmpresaLinha,
} from '@/services/inadimplencia'
import { buscarNomesEmpresas } from '@/services/filtroMultiempresa'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  ExternalLink,
  Phone,
  Mail,
  ShieldAlert,
  Clock,
  Building2,
} from 'lucide-react'

export const InadimplenciaPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const navigate = useNavigate()

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    clientes_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(() => ['pessoas_clientes'], [])

  const [resumo, setResumo] = useState<ResumoInadimplencia | null>(null)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [busca, setBusca] = useState<string>('')
  const [clienteDetalhe, setClienteDetalhe] = useState<InadimplenciaClienteItem | null>(null)

  // Multiempresa: usar TODAS as empresas marcadas, não só a primeira (padrão Fluxo de Caixa)
  const empresasEfetivas: string[] = (filtros.empresas_ids || []).filter(Boolean).length
    ? (filtros.empresas_ids || []).filter(Boolean)
    : empresaAtiva?.id
      ? [empresaAtiva.id]
      : []
  // "Ver só o total consolidado" (FiltrosRelatorio): oculta a quebra por empresa
  const verSoTotal = filtros.ver_so_total === true

  // Nomes das empresas para o painel "Totais por Empresa" (padrão Fluxo de Caixa)
  const [nomesEmpresas, setNomesEmpresas] = useState<Record<string, string>>({})
  useEffect(() => {
    buscarNomesEmpresas(empresasEfetivas).then(setNomesEmpresas)
  }, [empresasEfetivas.join(',')])

  const carregarDados = useCallback(async () => {
    if (empresasEfetivas.length === 0) return
    setCarregando(true)
    try {
      const res = await apurarInadimplencia(empresasEfetivas)
      setResumo(res)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar inadimplência',
        description: err?.message || 'Falha ao buscar títulos vencidos.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresasEfetivas.join(',')])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Filtragem dos clientes por busca textual e clientes selecionados no filtro comum
  const clientesFiltrados = useMemo(() => {
    if (!resumo) return []
    let lista = resumo.clientes

    if (filtros.clientes_ids && filtros.clientes_ids.length > 0) {
      lista = lista.filter((c) => filtros.clientes_ids!.includes(c.clienteId))
    }

    if (!busca.trim()) return lista
    const termo = busca.toLowerCase()
    return lista.filter(
      (c) =>
        c.nomeCliente.toLowerCase().includes(termo) ||
        (c.cpfCnpj && c.cpfCnpj.includes(termo)) ||
        (c.email && c.email.toLowerCase().includes(termo)) ||
        (c.telefone && c.telefone.includes(termo)) ||
        (c.celular && c.celular.includes(termo)),
    )
  }, [resumo, busca, filtros.clientes_ids])

  // Exportar CSV
  const exportarCSV = () => {
    if (!resumo || resumo.clientes.length === 0) {
      toast({ title: 'Sem dados para exportar' })
      return
    }

    const cabecalho =
      'Codigo_Cliente;Cliente;CPF_CNPJ;Telefone;Celular;Email;Total_Vencido;Qtd_Titulos;Faixa_1_30;Faixa_31_60;Faixa_61_90;Faixa_Mais_90;Maior_Atraso_Dias\n'

    const linhas = resumo.clientes
      .map(
        (c) =>
          `"${c.codigoCliente || ''}";"${c.nomeCliente}";"${c.cpfCnpj || ''}";"${
            c.telefone || ''
          }";"${c.celular || ''}";"${c.email || c.emailNfe || ''}";${c.totalVencido.toFixed(
            2,
          )};${c.qtdTitulosVencidos};${c.faixa1a30.toFixed(2)};${c.faixa31a60.toFixed(
            2,
          )};${c.faixa61a90.toFixed(2)};${c.faixaMais90.toFixed(2)};${c.maiorAtrasoDias}`,
      )
      .join('\n')

    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `relatorio_inadimplencia_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const abrirAbaFinanceiroCliente = (clienteId: string) => {
    if (!clienteId || clienteId === 'sem_cliente') {
      toast({ title: 'Cliente não vinculado a este título' })
      return
    }
    navigate(`/cadastros/clientes/${clienteId}/editar?aba=financeiro`)
  }

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="financeiro_inadimplencia"
        tituloRelatorio="Relatório de Inadimplência"
        subtituloRelatorio="Acompanhe títulos a receber vencidos em aberto por cliente e faixas de atraso (aging list)."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarDados}
        onExportarCsv={exportarCSV}
        carregando={carregando}
        filtrosExtras={
          <div className="space-y-1 min-w-[240px]">
            <label className="text-[11px] font-semibold text-slate-600 block">Busca Rápida</label>
            <input
              type="text"
              placeholder="Nome, CPF/CNPJ, telefone ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
            />
          </div>
        }
      />

      {/* Cartões com Totais por Faixas */}
      {resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="border-rose-200 bg-rose-50/40 shadow-2xs col-span-2 lg:col-span-1">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-rose-800 uppercase flex items-center justify-between">
                <span>Total Inadimplente</span>
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl font-black font-mono text-rose-700">
                R$ {resumo.totalGeralVencido.toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-600/80">
                {resumo.totalClientesInadimplentes} cliente(s) • {resumo.totalTitulosVencidos}{' '}
                título(s)
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-amber-50/20 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-amber-800 uppercase flex items-center justify-between">
                <span>1 a 30 dias</span>
                <Clock className="w-3.5 h-3.5 text-amber-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-amber-900">
                R$ {resumo.totalFaixa1a30.toFixed(2)}
              </div>
              <p className="text-[11px] text-amber-700/80">Atraso recente</p>
            </CardContent>
          </Card>

          <Card className="border-orange-100 bg-orange-50/20 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-orange-800 uppercase flex items-center justify-between">
                <span>31 a 60 dias</span>
                <Clock className="w-3.5 h-3.5 text-orange-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-orange-900">
                R$ {resumo.totalFaixa31a60.toFixed(2)}
              </div>
              <p className="text-[11px] text-orange-700/80">Cobrança ativa</p>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/20 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-rose-800 uppercase flex items-center justify-between">
                <span>61 a 90 dias</span>
                <Clock className="w-3.5 h-3.5 text-rose-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-rose-900">
                R$ {resumo.totalFaixa61a90.toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-700/80">Alerta de crédito</p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50/40 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-red-900 uppercase flex items-center justify-between">
                <span>Mais de 90 dias</span>
                <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-red-900">
                R$ {resumo.totalFaixaMais90.toFixed(2)}
              </div>
              <p className="text-[11px] text-red-700 font-medium">Inadimplência crítica</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Totais por Empresa (oculto quando "Ver só o total consolidado" está marcado ou 1 empresa) */}
      {!verSoTotal && empresasEfetivas.length > 1 && (resumo?.porEmpresa.length || 0) > 0 && (
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">Totais por Empresa</h3>
              <Badge variant="outline" className="text-[10px]">
                {empresasEfetivas.length} empresas no filtro
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2 px-3">Empresa</th>
                    <th className="py-2 px-3 text-right">Qtd Clientes</th>
                    <th className="py-2 px-3 text-right">Qtd Títulos</th>
                    <th className="py-2 px-3 text-right">1 a 30 d</th>
                    <th className="py-2 px-3 text-right">31 a 60 d</th>
                    <th className="py-2 px-3 text-right">61 a 90 d</th>
                    <th className="py-2 px-3 text-right">&gt; 90 d</th>
                    <th className="py-2 px-3 text-right">Total Vencido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(resumo?.porEmpresa || []).map((e: InadimplenciaEmpresaLinha) => (
                    <tr key={e.empresaId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {nomesEmpresas[e.empresaId] ||
                          (e.empresaId === '(sem empresa)' ? 'Sem empresa' : e.empresaId)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {e.qtdClientes}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {e.qtdTitulosVencidos}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-amber-800">
                        R$ {e.totalFaixa1a30.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-orange-800">
                        R$ {e.totalFaixa31a60.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-rose-800">
                        R$ {e.totalFaixa61a90.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-red-800">
                        R$ {e.totalFaixaMais90.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-rose-700">
                        R$ {e.totalVencido.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td className="py-2 px-3 text-slate-900">Total Geral</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      {resumo?.totalClientesInadimplentes || 0}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900">
                      {resumo?.totalTitulosVencidos || 0}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-900">
                      R$ {resumo?.totalFaixa1a30.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-orange-900">
                      R$ {resumo?.totalFaixa31a60.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-900">
                      R$ {resumo?.totalFaixa61a90.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-red-900">
                      R$ {resumo?.totalFaixaMais90.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-rose-800">
                      R$ {resumo?.totalGeralVencido.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contador de Clientes */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Mostrando <strong>{clientesFiltrados.length}</strong> de{' '}
          <strong>{resumo?.clientes.length || 0}</strong> clientes inadimplentes
        </span>
      </div>

      {/* Tabela de Inadimplência por Cliente */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="text-xs">
                <TableHead className="w-[280px]">Cliente / Contato</TableHead>
                <TableHead className="text-right w-[110px] text-amber-800">1 a 30 d</TableHead>
                <TableHead className="text-right w-[110px] text-orange-800">31 a 60 d</TableHead>
                <TableHead className="text-right w-[110px] text-rose-800">61 a 90 d</TableHead>
                <TableHead className="text-right w-[110px] text-red-800">&gt; 90 d</TableHead>
                <TableHead className="text-right w-[130px] font-bold text-rose-900">
                  Total Vencido
                </TableHead>
                <TableHead className="text-center w-[90px]">Maior Atraso</TableHead>
                <TableHead className="w-[140px] text-right pr-4">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                    Apurando carteira de inadimplência...
                  </TableCell>
                </TableRow>
              ) : clientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                    Nenhum cliente inadimplente encontrado. Parabéns, a carteira está em dia!
                  </TableCell>
                </TableRow>
              ) : (
                clientesFiltrados.map((c) => {
                  const contatoTelefone = c.celular || c.telefone
                  const contatoEmail = c.email || c.emailNfe

                  return (
                    <TableRow key={c.clienteId} className="text-xs hover:bg-slate-50/80">
                      <TableCell>
                        <div className="font-semibold text-slate-900">
                          {c.codigoCliente ? `${c.codigoCliente} - ` : ''}
                          {c.nomeCliente}
                        </div>
                        {c.cpfCnpj && (
                          <div className="text-[11px] text-slate-500 font-mono">{c.cpfCnpj}</div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-600">
                          {contatoTelefone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {contatoTelefone}
                            </span>
                          )}
                          {contatoEmail && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {contatoEmail}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono text-amber-900">
                        {c.faixa1a30 > 0 ? `R$ ${c.faixa1a30.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-orange-900">
                        {c.faixa31a60 > 0 ? `R$ ${c.faixa31a60.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-rose-900">
                        {c.faixa61a90 > 0 ? `R$ ${c.faixa61a90.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono text-red-900 font-semibold">
                        {c.faixaMais90 > 0 ? `R$ ${c.faixaMais90.toFixed(2)}` : '-'}
                      </TableCell>

                      <TableCell className="text-right font-mono font-bold text-rose-700">
                        R$ {c.totalVencido.toFixed(2)}
                        <div className="text-[10px] font-normal text-slate-400">
                          {c.qtdTitulosVencidos} título(s)
                        </div>
                      </TableCell>

                      <TableCell className="text-center font-mono font-medium">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            c.maiorAtrasoDias > 90
                              ? 'bg-red-50 text-red-800 border-red-300'
                              : c.maiorAtrasoDias > 30
                                ? 'bg-orange-50 text-orange-800 border-orange-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {c.maiorAtrasoDias} d
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setClienteDetalhe(c)}
                            className="h-7 px-2 text-xs text-slate-600 hover:text-blue-700"
                            title="Ver títulos vencidos"
                          >
                            Títulos ({c.qtdTitulosVencidos})
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirAbaFinanceiroCliente(c.clienteId)}
                            className="h-7 px-2 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                            title="Abrir aba Financeiro no cadastro do cliente"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1 text-blue-600" />
                            Financeiro
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal com Títulos Vencidos do Cliente */}
      <Dialog
        open={Boolean(clienteDetalhe)}
        onOpenChange={(open) => !open && setClienteDetalhe(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between text-slate-900">
              <span>Títulos Vencidos: {clienteDetalhe?.nomeCliente}</span>
              {clienteDetalhe && (
                <span className="font-mono text-sm px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                  Total: R$ {clienteDetalhe.totalVencido.toFixed(2)}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {clienteDetalhe?.titulos.length || 0} título(s) em aberto vencidos
            </DialogDescription>
          </DialogHeader>

          {/* Quebra por empresa do cliente (o mesmo cliente pode ter títulos em
              mais de uma empresa — painel somente com 2+ empresas no detalhe) */}
          {empresasEfetivas.length > 1 && clienteDetalhe && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Array.from(new Set(clienteDetalhe.titulos.map((t) => t.empresaId))).map((eid) => {
                const titulosEmpresa = clienteDetalhe.titulos.filter((t) => t.empresaId === eid)
                const totalEmpresa = titulosEmpresa.reduce((acc, t) => acc + t.saldoDevedor, 0)
                return (
                  <div
                    key={eid}
                    className="flex items-center gap-2 text-[11px] border border-slate-200 bg-slate-50 rounded-md px-2 py-1"
                  >
                    <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
                    <span className="font-medium text-slate-700">
                      {nomesEmpresas[eid || ''] ||
                        (eid === '(sem empresa)' ? 'Sem empresa' : eid) ||
                        'Empresa'}
                    </span>
                    <span className="font-mono text-rose-700 font-semibold">
                      {titulosEmpresa.length} tít. • R$ {totalEmpresa.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pt-2">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="text-xs">
                  <TableHead className="w-[100px]">Documento</TableHead>
                  {empresasEfetivas.length > 1 && (
                    <TableHead className="w-[140px]">Empresa</TableHead>
                  )}
                  <TableHead className="w-[90px]">Vencimento</TableHead>
                  <TableHead className="w-[80px] text-center">Atraso</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right w-[110px]">Saldo Devedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clienteDetalhe?.titulos.map((t) => (
                  <TableRow key={t.id} className="text-xs hover:bg-slate-50">
                    <TableCell className="font-mono font-medium">
                      {t.numeroDocumento} ({t.parcela})
                    </TableCell>
                    {empresasEfetivas.length > 1 && (
                      <TableCell className="text-slate-600 text-[11px]">
                        {nomesEmpresas[t.empresaId || ''] ||
                          (t.empresaId === '(sem empresa)' ? 'Sem empresa' : t.empresaId)}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-slate-600">{t.dataVencimento}</TableCell>
                    <TableCell className="text-center font-mono">
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          t.diasAtraso > 90
                            ? 'bg-red-50 text-red-800'
                            : t.diasAtraso > 30
                              ? 'bg-orange-50 text-orange-800'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {t.diasAtraso} d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700">{t.descricao}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-rose-700">
                      R$ {t.saldoDevedor.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="pt-3 border-t flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (clienteDetalhe) {
                  abrirAbaFinanceiroCliente(clienteDetalhe.clienteId)
                }
              }}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Abrir Financeiro do Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default InadimplenciaPage
