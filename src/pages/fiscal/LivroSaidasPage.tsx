import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  obterRelatorioLivroSaidas,
  RelatorioLivroSaidasResultado,
  LinhaLivroSaida,
} from '@/services/livroSaidas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  FileText,
  DollarSign,
  TrendingUp,
  Layers,
  Filter,
  AlertTriangle,
  Globe,
  RotateCcw,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import SelectCliente from '@/components/SelectCliente'
import { obterConfigFiscalEmpresa } from '@/services/configEmissaoFiscal'

const UFS_BRASIL = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

export const LivroSaidasPage: React.FC = () => {
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

  // Filtros Fiscais do Prompt 8.0b / 8.1
  const [modelo, setModelo] = useState<'todos' | '55' | '65'>('todos')
  const [cfopFiltro, setCfopFiltro] = useState<string>('')
  const [cstFiltro, setCstFiltro] = useState<string>('')
  const [situacaoFiltro, setSituacaoFiltro] = useState<
    'todos' | 'normal' | 'cancelada' | 'denegada' | 'inutilizada'
  >('todos')
  const [ufDestinoFiltro, setUfDestinoFiltro] = useState<string>('todos')
  const [clienteIdFiltro, setClienteIdFiltro] = useState<string>('')
  const [incluirNotasTeste, setIncluirNotasTeste] = useState<boolean>(false)

  // Em ambiente de homologação as notas de teste já devem vir incluídas por padrão
  useEffect(() => {
    let cancelado = false
    setIncluirNotasTeste(false)
    if (!empresaAtiva?.id) return
    obterConfigFiscalEmpresa(empresaAtiva.id)
      .then((cfg) => {
        if (!cancelado && cfg?.ambiente === 'Homologação') {
          setIncluirNotasTeste(true)
        }
      })
      .catch(() => {
        /* sem config de emissão: mantém o padrão false */
      })
    return () => {
      cancelado = true
    }
  }, [empresaAtiva?.id])

  const [painelFiltrosAberto, setPainelFiltrosAberto] = useState<boolean>(false)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [relatorio, setRelatorio] = useState<RelatorioLivroSaidasResultado | null>(null)

  const carregarRelatorio = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const res = await obterRelatorioLivroSaidas({
        empresaId: empresaAtiva.id,
        dataInicio,
        dataFim,
        incluirTeste: incluirNotasTeste,
        filtros: {
          modelo,
          cfop: cfopFiltro.trim() || undefined,
          cst: cstFiltro.trim() || undefined,
          situacao: situacaoFiltro,
          ufDestino: ufDestinoFiltro,
          clienteId: clienteIdFiltro || undefined,
        },
      })
      setRelatorio(res)
    } catch (err: unknown) {
      console.error('Erro ao gerar Livro de Saídas:', err)
      toast({
        title: 'Erro na geração do Livro de Saídas',
        description: err instanceof Error ? err.message : 'Falha ao buscar dados fiscais',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva?.id,
    dataInicio,
    dataFim,
    incluirNotasTeste,
    modelo,
    cfopFiltro,
    cstFiltro,
    situacaoFiltro,
    ufDestinoFiltro,
    clienteIdFiltro,
    toast,
  ])

  useEffect(() => {
    carregarRelatorio()
  }, [carregarRelatorio])

  // Limpar filtros avançados
  const handleLimparFiltros = () => {
    setModelo('todos')
    setCfopFiltro('')
    setCstFiltro('')
    setSituacaoFiltro('todos')
    setUfDestinoFiltro('todos')
    setClienteIdFiltro('')
    setIncluirNotasTeste(false)
  }

  const temFiltroAvancadoAtivo = useMemo(() => {
    return (
      modelo !== 'todos' ||
      cfopFiltro.trim() !== '' ||
      cstFiltro.trim() !== '' ||
      situacaoFiltro !== 'todos' ||
      ufDestinoFiltro !== 'todos' ||
      clienteIdFiltro !== '' ||
      incluirNotasTeste
    )
  }, [
    modelo,
    cfopFiltro,
    cstFiltro,
    situacaoFiltro,
    ufDestinoFiltro,
    clienteIdFiltro,
    incluirNotasTeste,
  ])

  // Exportar CSV completo nos moldes da Etapa 8 (BOM UTF-8, ponto e vírgula, vírgula decimal)
  const handleExportarCsv = () => {
    if (!relatorio || relatorio.linhas.length === 0) {
      toast({
        title: 'Nenhum dado para exportar',
        description: 'Não há documentos fiscais de saída no período selecionado.',
      })
      return
    }

    const linhasGerais: string[] = []

    // 1. Cabeçalho Empresa e Período
    linhasGerais.push('"LIVRO DE REGISTRO DE SAÍDAS - MODELO P2/A"')
    linhasGerais.push(
      `"Empresa";"${relatorio.empresa.razao_social || ''}";"CNPJ";"${relatorio.empresa.cnpj || ''}";"UF";"${relatorio.empresa.uf || ''}"`,
    )
    linhasGerais.push(`"Periodo";"${dataInicio} ate ${dataFim}"`)
    if (relatorio.incluiNotasTeste) {
      linhasGerais.push('"AVISO";"INCLUI NOTAS DE TESTE (HOMOLOGACAO)"')
    }
    linhasGerais.push('')

    // 2. Seção 1: Relação de Documentos e Inutilizações
    linhasGerais.push('"1. DOCUMENTOS FISCAIS DE SAÍDA E INUTILIZAÇÕES"')
    linhasGerais.push(
      [
        'Data Emissao',
        'Modelo',
        'Serie',
        'Numero',
        'Chave de Acesso',
        'Destinatario',
        'CNPJ/CPF',
        'UF Destino',
        'CFOP Principal',
        'Valor Contabil (R$)',
        'Base ICMS (R$)',
        'Valor ICMS (R$)',
        'Base ICMS ST (R$)',
        'Valor ICMS ST (R$)',
        'Valor IPI (R$)',
        'DIFAL Destino (R$)',
        'Situacao',
      ].join(';'),
    )

    for (const lin of relatorio.linhas) {
      linhasGerais.push(
        [
          lin.data,
          lin.modelo,
          lin.serie,
          lin.numero,
          lin.chave,
          `"${(lin.destinatario_nome || '').replace(/"/g, '""')}"`,
          lin.destinatario_cnpj_cpf || '',
          lin.destinatario_uf || '',
          lin.cfop_principal || '',
          lin.valor_contabil.toFixed(2).replace('.', ','),
          lin.base_icms.toFixed(2).replace('.', ','),
          lin.valor_icms.toFixed(2).replace('.', ','),
          lin.base_icms_st.toFixed(2).replace('.', ','),
          lin.valor_icms_st.toFixed(2).replace('.', ','),
          lin.valor_ipi.toFixed(2).replace('.', ','),
          lin.valor_difal.toFixed(2).replace('.', ','),
          lin.situacao.toUpperCase(),
        ].join(';'),
      )
    }

    linhasGerais.push('')
    linhasGerais.push(
      `"TOTAL CONTÁBIL";"";"";"";"";"";"";"";"";"${relatorio.totaisGerais.valorContabilTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.baseIcmsTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.valorIcmsTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.baseIcmsStTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.valorIcmsStTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.valorIpiTotal.toFixed(2).replace('.', ',')}";"${relatorio.totaisGerais.valorDifalTotal.toFixed(2).replace('.', ',')}"`,
    )
    linhasGerais.push('')

    // 3. Seção 2: Resumo por CFOP, CST e Alíquota
    linhasGerais.push('"2. RESUMO POR CFOP, CST E ALÍQUOTA (SPED REGISTRO C190)"')
    linhasGerais.push(
      [
        'CFOP',
        'CST/CSOSN',
        'Aliq ICMS (%)',
        'Valor Contabil (R$)',
        'Base ICMS (R$)',
        'Valor ICMS (R$)',
        'Base ICMS ST (R$)',
        'Valor ICMS ST (R$)',
        'Valor IPI (R$)',
        'Isentas ou Nao Tributadas (R$)',
        'Outras (R$)',
      ].join(';'),
    )

    for (const r of relatorio.resumoCfopCstAliquota) {
      linhasGerais.push(
        [
          r.cfop,
          r.cst,
          r.aliquota.toFixed(2).replace('.', ','),
          r.valor_contabil.toFixed(2).replace('.', ','),
          r.base_icms.toFixed(2).replace('.', ','),
          r.valor_icms.toFixed(2).replace('.', ','),
          r.base_icms_st.toFixed(2).replace('.', ','),
          r.valor_icms_st.toFixed(2).replace('.', ','),
          r.valor_ipi.toFixed(2).replace('.', ','),
          r.isentas.toFixed(2).replace('.', ','),
          r.outras.toFixed(2).replace('.', ','),
        ].join(';'),
      )
    }

    linhasGerais.push('')

    // 4. Seção 3: Resumo por UF de Destino (Vendas Interestaduais)
    linhasGerais.push('"3. RESUMO POR UF DE DESTINO (OPERAÇÕES INTERESTADUAIS E INTERNAS)"')
    linhasGerais.push(
      [
        'UF Destino',
        'Tipo Operacao',
        'Quantidade Documentos',
        'Valor Contabil (R$)',
        'Valor ICMS (R$)',
        'Valor DIFAL Destino (R$)',
      ].join(';'),
    )

    for (const u of relatorio.resumoUfDestino) {
      linhasGerais.push(
        [
          u.uf,
          u.ehInterestadual ? 'Interestadual' : 'Interna',
          u.quantidade_documentos,
          u.valor_contabil.toFixed(2).replace('.', ','),
          u.valor_icms.toFixed(2).replace('.', ','),
          u.valor_difal.toFixed(2).replace('.', ','),
        ].join(';'),
      )
    }

    // Gerar download do arquivo CSV
    const conteudoCsv = linhasGerais.join('\r\n')
    const blob = new Blob(['\uFEFF' + conteudoCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `livro_saidas_${dataInicio}_a_${dataFim}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Exportação concluída',
      description: 'Livro de saídas exportado com sucesso para CSV.',
    })
  }

  const handleImprimir = () => {
    window.print()
  }

  const totais = relatorio?.totaisGerais

  const renderBadgeSituacao = (sit: LinhaLivroSaida['situacao']) => {
    switch (sit) {
      case 'normal':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] uppercase font-bold">
            Normal
          </Badge>
        )
      case 'cancelada':
        return (
          <Badge
            variant="outline"
            className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] uppercase font-bold"
          >
            Cancelada
          </Badge>
        )
      case 'denegada':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] uppercase font-bold">
            Denegada
          </Badge>
        )
      case 'inutilizada':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] uppercase font-bold">
            Inutilizada
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Estilos para impressão limpa */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #secao-livro-saidas-impressao,
          #secao-livro-saidas-impressao * {
            visibility: visible;
          }
          #secao-livro-saidas-impressao {
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
            Livro de Registro de Saídas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Conferência fiscal de documentos fiscais emitidos (NF-e/NFC-e), apuração do ICMS por
            CFOP/CST e resumo interestadual.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportarCsv}
            disabled={!relatorio || relatorio.linhas.length === 0}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Exportar CSV
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            disabled={!relatorio || relatorio.linhas.length === 0}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900"
          >
            <Printer className="h-4 w-4 text-slate-600" />
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

      {/* Faixa destacada se estiver incluindo notas de homologação */}
      {relatorio?.incluiNotasTeste && (
        <div className="p-3 bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wide rounded-md flex items-center justify-center gap-2 shadow-xs">
          <AlertTriangle className="h-4 w-4 text-slate-950" />
          <span>INCLUI NOTAS DE TESTE (HOMOLOGAÇÃO) — NÃO UTILIZAR PARA RECOLHIMENTO OFICIAL</span>
        </div>
      )}

      {/* Filtros Principais e Fiscais */}
      <Card className="no-print border-slate-200">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 text-xs">
            <div className="flex-1">
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Data de Emissão Inicial *
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
                Data de Emissão Final *
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

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPainelFiltrosAberto(!painelFiltrosAberto)}
                className={`h-9 px-3 text-xs gap-1.5 ${
                  temFiltroAvancadoAtivo
                    ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                    : 'text-slate-700'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Filtros fiscais</span>
                {temFiltroAvancadoAtivo && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                )}
              </Button>

              <Button
                type="button"
                onClick={carregarRelatorio}
                disabled={carregando}
                className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                Consultar Livro
              </Button>
            </div>
          </div>

          {/* Painel expansível de Filtros Fiscais do 8.0b */}
          {painelFiltrosAberto && (
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Filtros Fiscais Avançados (8.0b)</span>
                {temFiltroAvancadoAtivo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleLimparFiltros}
                    className="h-6 text-[11px] text-slate-500 hover:text-slate-900 gap-1 p-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Limpar filtros
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                {/* Modelo */}
                <div>
                  <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                    Modelo Fiscal
                  </Label>
                  <Select
                    value={modelo}
                    onValueChange={(v) => setModelo(v as 'todos' | '55' | '65')}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Modelos</SelectItem>
                      <SelectItem value="55">NF-e (Mod. 55)</SelectItem>
                      <SelectItem value="65">NFC-e (Mod. 65)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* CFOP */}
                <div>
                  <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                    CFOP (ex: 5102, 6102)
                  </Label>
                  <Input
                    type="text"
                    placeholder="Filtrar CFOP..."
                    value={cfopFiltro}
                    onChange={(e) => setCfopFiltro(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                {/* CST */}
                <div>
                  <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                    CST / CSOSN (ex: 00, 102)
                  </Label>
                  <Input
                    type="text"
                    placeholder="Filtrar CST..."
                    value={cstFiltro}
                    onChange={(e) => setCstFiltro(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                {/* Situação */}
                <div>
                  <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                    Situação da Linha
                  </Label>
                  <Select
                    value={situacaoFiltro}
                    onValueChange={(v) =>
                      setSituacaoFiltro(
                        v as 'todos' | 'normal' | 'cancelada' | 'denegada' | 'inutilizada',
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Situação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as Situações</SelectItem>
                      <SelectItem value="normal">Normal (Autorizada)</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                      <SelectItem value="denegada">Denegada</SelectItem>
                      <SelectItem value="inutilizada">Inutilizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* UF Destino */}
                <div>
                  <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                    UF de Destino
                  </Label>
                  <Select value={ufDestinoFiltro} onValueChange={setUfDestinoFiltro}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="UF Destino" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as UFs</SelectItem>
                      {UFS_BRASIL.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Switch de Notas de Homologação */}
                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      id="switch-notas-teste"
                      checked={incluirNotasTeste}
                      onCheckedChange={setIncluirNotasTeste}
                    />
                    <Label
                      htmlFor="switch-notas-teste"
                      className="text-[11px] font-medium text-slate-700 cursor-pointer"
                    >
                      Incluir notas de teste
                    </Label>
                  </div>
                </div>
              </div>

              {/* Filtro por Cliente */}
              <div className="max-w-md pt-1">
                <Label className="text-[11px] font-medium text-slate-600 mb-1 block">
                  Filtrar por Destinatário / Cliente
                </Label>
                <SelectCliente
                  value={clienteIdFiltro}
                  onChange={(val) => setClienteIdFiltro(val || '')}
                  placeholder="Pesquisar cliente por nome ou CNPJ..."
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Regra fiscal: a apuração do Livro de Saídas considera a <strong>data de emissão</strong>{' '}
            dos documentos no horário oficial de Brasília (UTC-3), totalizando operações
            autorizadas, e registrando canceladas, denegadas e inutilizações com valores zerados.
          </p>
        </CardContent>
      </Card>

      {/* Cartões de Indicadores Gerais (oculto na impressão) */}
      {totais && (
        <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">Documentos / Linhas</span>
                <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
                  {totais.totalLinhas}
                </div>
                <span className="text-[11px] text-slate-400">
                  {totais.totalNormais} autorizadas · {totais.totalCanceladas} canc. ·{' '}
                  {totais.totalInutilizadas} inut.
                </span>
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
                <span className="text-[11px] text-slate-400">faturamento das saídas</span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-500">ICMS Débito das Saídas</span>
                <div className="text-xl font-bold tracking-tight text-indigo-700 font-mono mt-1">
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
                <span className="text-xs font-medium text-slate-500">ICMS ST + IPI + DIFAL</span>
                <div className="text-lg font-bold tracking-tight text-amber-700 font-mono mt-1">
                  R${' '}
                  {(
                    totais.valorIcmsStTotal +
                    totais.valorIpiTotal +
                    totais.valorDifalTotal
                  ).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <span className="text-[11px] text-slate-400">
                  ST: R$ {totais.valorIcmsStTotal.toFixed(2)} | DIFAL: R${' '}
                  {totais.valorDifalTotal.toFixed(2)}
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO / CONTEÚDO PRINCIPAL (3 QUADROS) */}
      <div id="secao-livro-saidas-impressao" className="space-y-6">
        {/* Cabeçalho do Relatório */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 uppercase">
                Livro de Registro de Saídas (Modelo P2/A)
              </h2>
              <p className="text-xs text-slate-500">
                {empresaAtiva?.razao_social || 'Empresa Ativa'} — CNPJ: {empresaAtiva?.cnpj || '—'}{' '}
                — UF: {empresaAtiva?.uf || '—'}
              </p>
            </div>
            <div className="text-xs text-slate-600 font-mono mt-2 sm:mt-0">
              Período de Emissão:{' '}
              <span className="font-semibold text-slate-900">
                {dataInicio ? new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              </span>{' '}
              a{' '}
              <span className="font-semibold text-slate-900">
                {dataFim ? new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* QUADRO 1: LINHAS POR DOCUMENTO E INUTILIZAÇÃO */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>1. Relação de Documentos Fiscais de Saída e Inutilizações</span>
              <span className="text-[11px] font-normal text-slate-500">
                {relatorio?.linhas.length || 0} linha(s) escriturada(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {carregando ? (
              <div className="p-8 text-center text-slate-500">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full mb-1" />
                <p className="text-xs">Carregando dados do Livro de Saídas...</p>
              </div>
            ) : !relatorio || relatorio.linhas.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs">
                  Nenhum documento fiscal de saída ou inutilização encontrado no período
                  selecionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3">Mod</th>
                      <th className="py-2 px-3">Série</th>
                      <th className="py-2 px-3">Número</th>
                      <th className="py-2 px-3">Destinatário</th>
                      <th className="py-2 px-3">UF</th>
                      <th className="py-2 px-3">CFOP</th>
                      <th className="py-2 px-3 text-right">Valor Contábil</th>
                      <th className="py-2 px-3 text-right">Base ICMS</th>
                      <th className="py-2 px-3 text-right">Valor ICMS</th>
                      <th className="py-2 px-3 text-right">Base ST</th>
                      <th className="py-2 px-3 text-right">Valor ST</th>
                      <th className="py-2 px-3 text-right">IPI</th>
                      <th className="py-2 px-3 text-center">Situação</th>
                      <th className="py-2 px-3 text-center no-print">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.linhas.map((n) => (
                      <tr
                        key={n.id}
                        className={`hover:bg-slate-50 ${
                          n.situacao !== 'normal' ? 'bg-slate-50/50 text-slate-400' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {n.data
                            ? new Date(n.data + 'T12:00:00').toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.modelo}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.serie || '0'}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                          {n.numero}
                        </td>
                        <td
                          className="py-2 px-3 max-w-[180px] truncate"
                          title={n.destinatario_nome}
                        >
                          {n.destinatario_nome}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">{n.destinatario_uf}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {n.cfop_principal || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          R${' '}
                          {n.valor_contabil.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          R${' '}
                          {n.base_icms.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-700 whitespace-nowrap">
                          R${' '}
                          {n.valor_icms.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          R${' '}
                          {n.base_icms_st.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-amber-700 whitespace-nowrap">
                          R${' '}
                          {n.valor_icms_st.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          R${' '}
                          {n.valor_ipi.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {renderBadgeSituacao(n.situacao)}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap no-print">
                          {n.tipo === 'documento' ? (
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] text-blue-600 hover:text-blue-800 p-1"
                            >
                              <Link to="/fiscal/documentos">Ver Nota</Link>
                            </Button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Inutilizada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={7} className="py-2.5 px-3 text-right uppercase text-[11px]">
                        Total Contábil Geral ({relatorio.linhas.length} linhas):
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 text-sm whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.valorContabilTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.totaisGerais.baseIcmsTotal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-800 whitespace-nowrap">
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
                      <td colSpan={2} className="no-print"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* QUADRO 2: RESUMO POR CFOP, CST E ALÍQUOTA (SPED C190) */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>2. Resumo da Apuração por CFOP, CST e Alíquota (Itens das Saídas)</span>
              <span className="text-[11px] font-normal text-slate-500">
                {relatorio?.resumoCfopCstAliquota.length || 0} combinação(ões)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!relatorio || relatorio.resumoCfopCstAliquota.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <p className="text-xs">Nenhum item escriturado para apuração por CFOP/CST.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">CFOP</th>
                      <th className="py-2 px-3">CST/CSOSN</th>
                      <th className="py-2 px-3 text-right">Alíq ICMS</th>
                      <th className="py-2 px-3 text-right">Valor Contábil</th>
                      <th className="py-2 px-3 text-right">Base ICMS</th>
                      <th className="py-2 px-3 text-right">Valor ICMS</th>
                      <th className="py-2 px-3 text-right">Base ICMS ST</th>
                      <th className="py-2 px-3 text-right">Valor ICMS ST</th>
                      <th className="py-2 px-3 text-right">Isentas / Não Trib.</th>
                      <th className="py-2 px-3 text-right">Outras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.resumoCfopCstAliquota.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.cfop}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{r.cst}</td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700">
                          {r.aliquota.toFixed(2)}%
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-medium text-slate-900 whitespace-nowrap">
                          R${' '}
                          {r.valor_contabil.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {r.base_icms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-semibold text-indigo-700 whitespace-nowrap">
                          R$ {r.valor_icms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                          R$ {r.base_icms_st.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-amber-700 whitespace-nowrap">
                          R$ {r.valor_icms_st.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-600 whitespace-nowrap">
                          R$ {r.isentas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right text-slate-500 whitespace-nowrap">
                          R$ {r.outras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={3} className="py-2.5 px-3 text-right uppercase text-[10px]">
                        Totais do Resumo por CFOP/CST:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.valor_contabil, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.base_icms, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.valor_icms, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.base_icms_st, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.valor_icms_st, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.isentas, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoCfopCstAliquota
                          .reduce((a, b) => a + b.outras, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* QUADRO 3: RESUMO POR UF DE DESTINO */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                3. Resumo por UF de Destino (Vendas Interestaduais e Internas)
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                {relatorio?.resumoUfDestino.length || 0} UF(s) atendida(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!relatorio || relatorio.resumoUfDestino.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <p className="text-xs">Nenhum dado por UF de destino.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="py-2 px-3">UF de Destino</th>
                      <th className="py-2 px-3">Tipo da Operação</th>
                      <th className="py-2 px-3 text-center">Documentos</th>
                      <th className="py-2 px-3 text-right">Valor Contábil</th>
                      <th className="py-2 px-3 text-right">ICMS Próprio</th>
                      <th className="py-2 px-3 text-right">DIFAL Destino (EC 87/15)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {relatorio.resumoUfDestino.map((u) => (
                      <tr key={u.uf} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <span className="w-6 text-center py-0.5 rounded-sm bg-slate-100 border border-slate-200">
                            {u.uf}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {u.ehInterestadual ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-medium"
                            >
                              Interestadual
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 font-medium"
                            >
                              Interna ({u.uf})
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-center text-slate-700">
                          {u.quantidade_documentos}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-medium text-slate-900 whitespace-nowrap">
                          R${' '}
                          {u.valor_contabil.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-semibold text-indigo-700 whitespace-nowrap">
                          R$ {u.valor_icms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-semibold text-amber-700 whitespace-nowrap">
                          R$ {u.valor_difal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={2} className="py-2.5 px-3 text-right uppercase text-[10px]">
                        Total Geral por UF:
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {relatorio.resumoUfDestino.reduce((a, b) => a + b.quantidade_documentos, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoUfDestino
                          .reduce((a, b) => a + b.valor_contabil, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoUfDestino
                          .reduce((a, b) => a + b.valor_icms, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-800 whitespace-nowrap">
                        R${' '}
                        {relatorio.resumoUfDestino
                          .reduce((a, b) => a + b.valor_difal, 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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

export default LivroSaidasPage
