import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  obterRelatorioLivroEntradas,
  RelatorioLivroEntradasResultado,
} from '@/services/livroEntradas'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  FileText,
  DollarSign,
  TrendingDown,
  Layers,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export const LivroEntradasPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  // Período padrão: primeiro ao último dia do mês corrente
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [dataFim, setDataFim] = useState<string>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
  })

  const [carregando, setCarregando] = useState<boolean>(true)
  const [relatorio, setRelatorio] = useState<RelatorioLivroEntradasResultado | null>(null)

  const carregarRelatorio = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await obterRelatorioLivroEntradas({
        empresaId: empresaAtiva.id,
        dataInicio,
        dataFim,
      })
      setRelatorio(res)
    } catch (err: unknown) {
      console.error('Erro ao gerar Livro de Entradas:', err)
      toast({
        title: 'Erro na geração do Livro',
        description: err instanceof Error ? err.message : 'Falha ao buscar dados fiscais',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, dataInicio, dataFim, toast])

  useEffect(() => {
    carregarRelatorio()
  }, [carregarRelatorio])

  // Exportar CSV
  const handleExportarCsv = () => {
    if (!relatorio || relatorio.notas.length === 0) {
      toast({
        title: 'Nenhum dado para exportar',
        description: 'Não há notas lançadas no período selecionado.',
      })
      return
    }

    const linhasGerais: string[] = []

    // 1. Cabeçalho Empresa
    linhasGerais.push(`"LIVRO DE REGISTRO DE ENTRADAS - MODELO P1/A"`)
    linhasGerais.push(
      `"Empresa";"${relatorio.empresa.razao_social || ''}";"CNPJ";"${relatorio.empresa.cnpj || ''}";"UF";"${relatorio.empresa.uf || ''}"`,
    )
    linhasGerais.push(`"Periodo";"${dataInicio} ate ${dataFim}"`)
    linhasGerais.push('')

    // 2. Seção de Documentos Fiscais
    linhasGerais.push('"DOCUMENTOS FISCAIS"')
    linhasGerais.push(
      [
        'Data Entrada',
        'Data Emissao',
        'Modelo',
        'Serie',
        'Numero',
        'Fornecedor',
        'CNPJ',
        'UF',
        'Valor Contabil (R$)',
        'Chave de Acesso',
      ].join(';'),
    )

    for (const n of relatorio.notas) {
      linhasGerais.push(
        [
          n.data_entrada,
          n.data_emissao,
          n.modelo,
          n.serie,
          n.numero,
          `"${(n.fornecedor_nome || '').replace(/"/g, '""')}"`,
          n.fornecedor_cnpj || '',
          n.fornecedor_uf || '',
          n.valor_contabil.toFixed(2).replace('.', ','),
          n.chave_acesso || '',
        ].join(';'),
      )
    }

    linhasGerais.push('')
    linhasGerais.push(
      `"TOTAL CONTABIL";"";"";"";"";"";"";"";"${relatorio.totaisGerais.valorContabilTotal.toFixed(2).replace('.', ',')}"`,
    )
    linhasGerais.push('')

    // 3. Resumo C190 (Fiscal por CFOP / CST / Alíquota)
    linhasGerais.push('"RESUMO FISCAL POR CFOP / CST / ALIQUOTA (SPED REGISTRO C190)"')
    linhasGerais.push(
      [
        'CFOP',
        'CST/CSOSN',
        'Aliq ICMS (%)',
        'Valor Operacao (R$)',
        'Base ICMS (R$)',
        'Valor ICMS (R$)',
        'Base ICMS ST (R$)',
        'Valor ICMS ST (R$)',
        'Valor IPI (R$)',
        'Isentas / Outras (R$)',
      ].join(';'),
    )

    for (const r of relatorio.resumoC190) {
      linhasGerais.push(
        [
          r.cfop,
          r.cst,
          r.aliquota.toFixed(2).replace('.', ','),
          r.valorOperacao.toFixed(2).replace('.', ','),
          r.baseIcms.toFixed(2).replace('.', ','),
          r.valorIcms.toFixed(2).replace('.', ','),
          r.baseIcmsSt.toFixed(2).replace('.', ','),
          r.valorIcmsSt.toFixed(2).replace('.', ','),
          r.valorIpi.toFixed(2).replace('.', ','),
          (r.isentasOutras || 0).toFixed(2).replace('.', ','),
        ].join(';'),
      )
    }

    linhasGerais.push('')

    // 4. Totais por CFOP
    linhasGerais.push('"TOTAIS POR CFOP DE ENTRADA"')
    linhasGerais.push(
      [
        'CFOP',
        'Valor Operacao (R$)',
        'Base ICMS (R$)',
        'Valor ICMS (R$)',
        'Base ST (R$)',
        'Valor ST (R$)',
        'Valor IPI (R$)',
        'Isentas / Outras (R$)',
      ].join(';'),
    )

    for (const c of relatorio.totaisPorCfop) {
      linhasGerais.push(
        [
          c.cfop,
          c.valorOperacao.toFixed(2).replace('.', ','),
          c.baseIcms.toFixed(2).replace('.', ','),
          c.valorIcms.toFixed(2).replace('.', ','),
          c.baseIcmsSt.toFixed(2).replace('.', ','),
          c.valorIcmsSt.toFixed(2).replace('.', ','),
          c.valorIpi.toFixed(2).replace('.', ','),
          c.isentasOutras.toFixed(2).replace('.', ','),
        ].join(';'),
      )
    }

    // Gerar download do arquivo CSV
    const conteudoCsv = linhasGerais.join('\r\n')
    const blob = new Blob(['\uFEFF' + conteudoCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `livro_entradas_${dataInicio}_a_${dataFim}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: 'Livro de entradas exportado com sucesso.',
    })
  }

  // Imprimir Relatório
  const handleImprimir = () => {
    window.print()
  }

  const totais = relatorio?.totaisGerais

  return (
    <div className="space-y-6">
      {/* Estilos para impressão limpa */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #secao-livro-entradas-impressao,
          #secao-livro-entradas-impressao * {
            visibility: visible;
          }
          #secao-livro-entradas-impressao {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 16px;
            font-size: 10px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Cabeçalho da Tela (oculto na impressão) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600" />
            Livro de Entradas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Conferência fiscal de notas fiscais de entrada lançadas e apuração do Registro C190
            (SPED).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={!relatorio || relatorio.notas.length === 0}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            disabled={!relatorio || relatorio.notas.length === 0}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarRelatorio}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin text-blue-600' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtro por Período de Entrada (oculto na impressão) */}
      <Card className="no-print border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 text-xs">
            <div className="flex-1">
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Data de Entrada Inicial *
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex-1">
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Data de Entrada Final *
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={carregarRelatorio}
              disabled={carregando}
              className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              Consultar Livro
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Regra fiscal: a apuração do Livro de Entradas e do SPED considera a{' '}
            <strong>data de entrada</strong> no estabelecimento, mesmo que a emissão tenha ocorrido
            em período anterior.
          </p>
        </CardContent>
      </Card>

      {/* Cartões de Indicadores Gerais (oculto na impressão) */}
      {totais && (
        <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">Notas Lançadas</span>
                <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
                  {totais.totalNotas}
                </div>
                <span className="text-[11px] text-slate-400">no período de entrada</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">Valor Contábil Total</span>
                <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
                  R${' '}
                  {totais.valorContabilTotal.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <span className="text-[11px] text-slate-400">total das notas fiscais</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">
                  Base / Valor ICMS Próprio
                </span>
                <div className="text-lg font-bold tracking-tight text-indigo-700 font-mono mt-1">
                  R${' '}
                  {totais.valorIcmsTotal.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <span className="text-[11px] text-slate-400">
                  Base: R${' '}
                  {totais.baseIcmsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">ICMS ST + IPI</span>
                <div className="text-lg font-bold tracking-tight text-amber-700 font-mono mt-1">
                  R${' '}
                  {(totais.valorIcmsStTotal + totais.valorIpiTotal).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <span className="text-[11px] text-slate-400">
                  ST: R$ {totais.valorIcmsStTotal.toFixed(2)} | IPI: R${' '}
                  {totais.valorIpiTotal.toFixed(2)}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingDown size={20} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO / CONTEÚDO PRINCIPAL */}
      <div id="secao-livro-entradas-impressao" className="space-y-6">
        {/* Cabeçalho do Relatório */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 uppercase">
                Livro de Registro de Entradas (Modelo P1/A)
              </h2>
              <p className="text-xs text-slate-500">
                {empresaAtiva?.razao_social || 'Empresa Ativa'} — CNPJ: {empresaAtiva?.cnpj || '—'}{' '}
                — UF: {empresaAtiva?.uf || '—'}
              </p>
            </div>
            <div className="text-xs text-slate-600 font-mono mt-2 sm:mt-0">
              Período de Entrada:{' '}
              <span className="font-semibold text-slate-900">
                {dataInicio ? new Date(dataInicio).toLocaleDateString('pt-BR') : '—'}
              </span>{' '}
              a{' '}
              <span className="font-semibold text-slate-900">
                {dataFim ? new Date(dataFim).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* 1. SEÇÃO DE DOCUMENTOS FISCAIS */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>1. Relação de Documentos Fiscais Escriturados</span>
              <span className="text-[11px] font-normal text-slate-500">
                {relatorio?.notas.length || 0} documento(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {carregando ? (
              <div className="p-8 text-center text-slate-500">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mb-1" />
                <p className="text-xs">Carregando dados do Livro de Entradas...</p>
              </div>
            ) : !relatorio || relatorio.notas.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs">
                  Nenhuma nota fiscal lançada encontrada no período selecionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">Data Entrada</th>
                      <th className="py-2 px-3">Mod</th>
                      <th className="py-2 px-3">Série</th>
                      <th className="py-2 px-3">Número</th>
                      <th className="py-2 px-3">Data Emissão</th>
                      <th className="py-2 px-3">Fornecedor</th>
                      <th className="py-2 px-3">CNPJ</th>
                      <th className="py-2 px-3">UF</th>
                      <th className="py-2 px-3 text-right">Valor Contábil</th>
                      <th className="py-2 px-3 text-center no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.notas.map((n) => (
                      <tr key={n.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {n.data_entrada
                            ? new Date(n.data_entrada).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.modelo}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.serie || '0'}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                          {n.numero}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {n.data_emissao
                            ? new Date(n.data_emissao).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="py-2 px-3 max-w-[220px] truncate" title={n.fornecedor_nome}>
                          {n.fornecedor_nome}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {n.fornecedor_cnpj || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.fornecedor_uf}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          R${' '}
                          {n.valor_contabil.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap no-print">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] text-blue-600 hover:text-blue-800 p-1"
                          >
                            <Link to={`/compras/notas-entrada/${n.id}/conferencia`}>Ver Nota</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={8} className="py-2.5 px-3 text-right uppercase text-[11px]">
                        Total Contábil Geral ({relatorio.notas.length} notas):
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 text-sm whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorContabilTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="no-print"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. RESUMO FISCAL POR CFOP / CST / ALÍQUOTA (SPED C190) */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>2. Resumo da Apuração por CFOP / CST / Alíquota (Registro C190 do SPED)</span>
              <span className="text-[11px] font-normal text-slate-500">
                {relatorio?.resumoC190.length || 0} combinação(ões)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!relatorio || relatorio.resumoC190.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <p className="text-xs">Nenhum item escriturado para apuração C190.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">CFOP</th>
                      <th className="py-2 px-3">CST/CSOSN</th>
                      <th className="py-2 px-3 text-right">Alíq ICMS</th>
                      <th className="py-2 px-3 text-right">Valor Operação</th>
                      <th className="py-2 px-3 text-right">Base ICMS</th>
                      <th className="py-2 px-3 text-right">Valor ICMS</th>
                      <th className="py-2 px-3 text-right">Base ICMS ST</th>
                      <th className="py-2 px-3 text-right">Valor ST</th>
                      <th className="py-2 px-3 text-right">Valor IPI</th>
                      <th className="py-2 px-3 text-right">Isentas/Outras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.resumoC190.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.cfop}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{r.cst}</td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700">
                          {r.aliquota.toFixed(2)}%
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-medium text-slate-900 whitespace-nowrap">
                          R$ {r.valorOperacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {r.baseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-semibold text-blue-700 whitespace-nowrap">
                          R$ {r.valorIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {r.baseIcmsSt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-amber-700 whitespace-nowrap">
                          R$ {r.valorIcmsSt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {r.valorIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-500 whitespace-nowrap">
                          R${' '}
                          {(r.isentasOutras || 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[10px]">
                        Totais da Apuração C190:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.valorOperacao, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.baseIcms, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-blue-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.valorIcms, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.baseIcmsSt, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.valorIcmsSt, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + b.valorIpi, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoC190
                          .reduce((a, b) => a + (b.isentasOutras || 0), 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. CONSOLIDAÇÃO / TOTAIS POR CFOP */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              3. Consolidação Final por CFOP de Entrada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!relatorio || relatorio.totaisPorCfop.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <p className="text-xs">Nenhum dado por CFOP.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">CFOP de Entrada</th>
                      <th className="py-2 px-3 text-right">Valor Operação</th>
                      <th className="py-2 px-3 text-right">Base ICMS</th>
                      <th className="py-2 px-3 text-right">Valor ICMS</th>
                      <th className="py-2 px-3 text-right">Base ICMS ST</th>
                      <th className="py-2 px-3 text-right">Valor ST</th>
                      <th className="py-2 px-3 text-right">Valor IPI</th>
                      <th className="py-2 px-3 text-right">Isentas/Outras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.totaisPorCfop.map((c) => (
                      <tr key={c.cfop} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          CFOP {c.cfop}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-medium text-slate-900 whitespace-nowrap">
                          R$ {c.valorOperacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {c.baseIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-semibold text-blue-700 whitespace-nowrap">
                          R$ {c.valorIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {c.baseIcmsSt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-amber-700 whitespace-nowrap">
                          R$ {c.valorIcmsSt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {c.valorIpi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-500 whitespace-nowrap">
                          R$ {c.isentasOutras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td className="py-2.5 px-3 text-right uppercase text-[10px]">
                        Total Geral Escriturado:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm text-emerald-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorContabilTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.baseIcmsTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-blue-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorIcmsTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.baseIcmsStTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorIcmsStTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorIpiTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.isentasOutrasTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default LivroEntradasPage
