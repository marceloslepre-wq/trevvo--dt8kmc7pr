import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Tag,
  Download,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { Lote, listarLotes, classificarSituacaoLote } from '@/services/lotes'
import { SelectProduto } from '@/components/SelectProduto'

export const LotesValidadePage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { config } = useConfiguracoes()

  // Dias de alerta configurado (padrão 30)
  const diasAlertaConfig = config.dias_alerta_validade || 30

  // Filtros
  const [produtoId, setProdutoId] = useState<string>('')
  const [situacaoFiltro, setSituacaoFiltro] = useState<'todos' | 'vencido' | 'alerta' | 'ok'>(
    'todos',
  )
  const [dataValidadeInicio, setDataValidadeInicio] = useState<string>('')
  const [dataValidadeFim, setDataValidadeFim] = useState<string>('')
  const [apenasComSaldo, setApenasComSaldo] = useState<boolean>(false)
  const [buscaTexto, setBuscaTexto] = useState<string>('')

  // Dados
  const [lotes, setLotes] = useState<Lote[]>([])
  const [carregando, setCarregando] = useState<boolean>(false)

  // Carregar Lotes
  const carregarLotes = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)
    try {
      const dados = await listarLotes({
        empresaId: empresaAtiva.id,
        produtoId: produtoId || undefined,
        situacao: situacaoFiltro,
        dataValidadeInicio: dataValidadeInicio || undefined,
        dataValidadeFim: dataValidadeFim || undefined,
        apenasComSaldo: apenasComSaldo,
        diasAlerta: diasAlertaConfig,
      })
      setLotes(dados)
    } catch (err) {
      console.error('Erro ao carregar lotes:', err)
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva,
    produtoId,
    situacaoFiltro,
    dataValidadeInicio,
    dataValidadeFim,
    apenasComSaldo,
    diasAlertaConfig,
  ])

  useEffect(() => {
    carregarLotes()
  }, [carregarLotes])

  // Filtro de texto no cliente (número do lote ou produto)
  const lotesFiltrados = useMemo(() => {
    if (!buscaTexto.trim()) return lotes
    const t = buscaTexto.toLowerCase()
    return lotes.filter((l) => {
      const num = l.numero_lote.toLowerCase()
      const desc = l.expand?.produto_id?.descricao?.toLowerCase() || ''
      const cod = String(l.expand?.produto_id?.codigo || '').toLowerCase()
      return num.includes(t) || desc.includes(t) || cod.includes(t)
    })
  }, [lotes, buscaTexto])

  // Contadores de resumo
  const resumo = useMemo(() => {
    let vencidos = 0
    let alerta = 0
    let ok = 0
    let totalSaldo = 0

    lotes.forEach((l) => {
      const cls = classificarSituacaoLote(l.data_validade, diasAlertaConfig)
      if (cls.situacao === 'vencido') vencidos++
      else if (cls.situacao === 'alerta') alerta++
      else ok++

      totalSaldo += l.quantidade || 0
    })

    return {
      total: lotes.length,
      vencidos,
      alerta,
      ok,
      totalSaldo,
    }
  }, [lotes, diasAlertaConfig])

  // Formatação
  const formatarQtd = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  }

  const formatarData = (dataStr?: string) => {
    if (!dataStr) return '—'
    try {
      const parte = dataStr.includes('T') ? dataStr.split('T')[0] : dataStr.slice(0, 10)
      const [ano, mes, dia] = parte.split('-')
      if (ano && mes && dia) return `${dia}/${mes}/${ano}`
      return dataStr
    } catch {
      return dataStr
    }
  }

  // Exportar CSV
  const handleExportarCsv = () => {
    if (lotesFiltrados.length === 0) return

    const colunas = [
      'Empresa',
      'Código Produto',
      'Descrição do Produto',
      'Número do Lote',
      'Data Fabricação',
      'Data Validade',
      'Dias para Vencer',
      'Situação',
      'Saldo Quantidade',
      'Observação',
    ]

    const linhas = lotesFiltrados.map((l) => {
      const p = l.expand?.produto_id
      const cls = classificarSituacaoLote(l.data_validade, diasAlertaConfig)
      const empNome = empresaAtiva?.razao_social || ''
      const fab = formatarData(l.data_fabricacao)
      const val = formatarData(l.data_validade)
      const qtd = (l.quantidade || 0).toFixed(4).replace('.', ',')

      return [
        `"${empNome}"`,
        `"${p?.codigo || ''}"`,
        `"${p?.descricao?.replace(/"/g, '""') || ''}"`,
        `"${l.numero_lote}"`,
        `"${fab}"`,
        `"${val}"`,
        cls.diasParaVencer,
        `"${cls.rotulo}"`,
        qtd,
        `"${(l.observacao || '').replace(/"/g, '""')}"`,
      ]
    })

    const csvContent =
      '\uFEFF' + [colunas.join(';'), ...linhas.map((row) => row.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `lotes_validade_${empresaAtiva?.nome_fantasia || 'empresa'}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Lotes e Validade</h1>
            {empresaAtiva && (
              <Badge
                variant="outline"
                className="text-xs font-normal border-slate-300 text-slate-700"
              >
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Rastreamento de número de lote, fabricação, validade e controle de vencimento (FEFO)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarLotes}
            disabled={carregando}
            className="h-9 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={lotesFiltrados.length === 0}
            className="h-9 text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Total de Lotes */}
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Total de Lotes</span>
              <Tag className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono">{resumo.total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Saldo consolidado:{' '}
              <strong className="text-slate-800">{formatarQtd(resumo.totalSaldo)}</strong>
            </div>
          </CardContent>
        </Card>

        {/* Vencidos (Vermelho) */}
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider flex items-center justify-between">
              <span>Vencidos</span>
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-xl font-bold text-rose-700 mt-1 font-mono">{resumo.vencidos}</div>
            <div className="text-[11px] text-rose-600 mt-0.5">
              Saída permitida apenas por Perda ou Ajuste
            </div>
          </CardContent>
        </Card>

        {/* Alerta de Validade (Amarelo) */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center justify-between">
              <span>Vencem em até {diasAlertaConfig} dias</span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold text-amber-700 mt-1 font-mono">{resumo.alerta}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">
              Prioridade máxima na saída (FEFO)
            </div>
          </CardContent>
        </Card>

        {/* Regulares (Verde) */}
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-3.5">
            <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
              <span>Dentro da Validade</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">{resumo.ok}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">
              Validade superior a {diasAlertaConfig} dias
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
            {/* Busca textual */}
            <div className="md:col-span-4">
              <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Buscar por Lote ou Produto
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <Input
                  type="text"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  placeholder="Número do lote, código ou descrição..."
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            {/* Filtro por Produto específico */}
            <div className="md:col-span-4">
              <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Filtrar Produto
              </Label>
              <SelectProduto
                value={produtoId}
                onChange={(id) => setProdutoId(id || '')}
                placeholder="Todos os produtos com lote..."
              />
            </div>

            {/* Situação */}
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Situação
              </Label>
              <Select
                value={situacaoFiltro}
                onValueChange={(val) =>
                  setSituacaoFiltro(val as 'todos' | 'vencido' | 'alerta' | 'ok')
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  <SelectItem value="vencido">Vencidos (Vermelho)</SelectItem>
                  <SelectItem value="alerta">Vencendo em breve (Amarelo)</SelectItem>
                  <SelectItem value="ok">OK (Verde)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkbox Apenas com Saldo */}
            <div className="md:col-span-2 flex items-center h-9">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={apenasComSaldo}
                  onChange={(e) => setApenasComSaldo(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Apenas com saldo &gt; 0</span>
              </label>
            </div>
          </div>

          {/* Segunda linha de filtros: período de validade */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 items-end">
            <div>
              <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Validade Inicial
              </Label>
              <Input
                type="date"
                value={dataValidadeInicio}
                onChange={(e) => setDataValidadeInicio(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                Validade Final
              </Label>
              <Input
                type="date"
                value={dataValidadeFim}
                onChange={(e) => setDataValidadeFim(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setProdutoId('')
                  setSituacaoFiltro('todos')
                  setDataValidadeInicio('')
                  setDataValidadeFim('')
                  setApenasComSaldo(false)
                  setBuscaTexto('')
                }}
                className="h-8 text-xs"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Lotes */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Produto</th>
                <th className="p-2.5">Número do Lote</th>
                <th className="p-2.5 text-center">Fabricação</th>
                <th className="p-2.5 text-center">Validade</th>
                <th className="p-2.5 text-center">Dias para Vencer</th>
                <th className="p-2.5 text-right">Saldo do Lote</th>
                <th className="p-2.5 text-center">Situação</th>
                <th className="p-2.5">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Carregando lotes da filial...</span>
                  </td>
                </tr>
              ) : lotesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Tag className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Nenhum lote encontrado</p>
                    <p className="text-[11px] mt-0.5">
                      Nenhum lote atende aos critérios dos filtros selecionados.
                    </p>
                  </td>
                </tr>
              ) : (
                lotesFiltrados.map((lote) => {
                  const p = lote.expand?.produto_id
                  const unid = p?.expand?.unidade_id?.sigla || 'UN'
                  const cls = classificarSituacaoLote(lote.data_validade, diasAlertaConfig)

                  return (
                    <tr
                      key={lote.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        cls.situacao === 'vencido' ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Produto */}
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900">
                          <span className="font-mono text-blue-700 mr-1.5">#{p?.codigo}</span>
                          {p?.descricao || 'Produto'}
                        </div>
                      </td>

                      {/* Número do Lote */}
                      <td className="p-2.5 font-mono font-bold text-slate-800">
                        {lote.numero_lote}
                      </td>

                      {/* Fabricação */}
                      <td className="p-2.5 text-center font-mono text-slate-500">
                        {formatarData(lote.data_fabricacao)}
                      </td>

                      {/* Validade */}
                      <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                        {formatarData(lote.data_validade)}
                      </td>

                      {/* Dias para Vencer */}
                      <td className="p-2.5 text-center font-mono">
                        {cls.diasParaVencer < 0 ? (
                          <span className="text-rose-600 font-bold">
                            Vencido há {Math.abs(cls.diasParaVencer)} dia(s)
                          </span>
                        ) : cls.diasParaVencer === 0 ? (
                          <span className="text-amber-600 font-bold">Vence hoje</span>
                        ) : (
                          <span
                            className={
                              cls.situacao === 'alerta'
                                ? 'text-amber-700 font-bold'
                                : 'text-slate-700'
                            }
                          >
                            {cls.diasParaVencer} dia(s)
                          </span>
                        )}
                      </td>

                      {/* Quantidade */}
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatarQtd(lote.quantidade)} {unid}
                      </td>

                      {/* Situação */}
                      <td className="p-2.5 text-center">
                        {cls.situacao === 'vencido' ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-semibold text-[10px]">
                            Vencido
                          </Badge>
                        ) : cls.situacao === 'alerta' ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px]">
                            {cls.rotulo}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-[10px]">
                            OK
                          </Badge>
                        )}
                      </td>

                      {/* Observações */}
                      <td
                        className="p-2.5 text-slate-500 max-w-xs truncate"
                        title={lote.observacao}
                      >
                        {lote.observacao || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default LotesValidadePage
