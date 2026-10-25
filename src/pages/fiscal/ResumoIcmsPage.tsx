import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { obterResumoIcmsMes, ResumoIcmsMesResultado } from '@/services/livroSaidas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Scale,
  RefreshCw,
  Printer,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Info,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const MESES = [
  { valor: 1, nome: 'Janeiro' },
  { valor: 2, nome: 'Fevereiro' },
  { valor: 3, nome: 'Março' },
  { valor: 4, nome: 'Abril' },
  { valor: 5, nome: 'Maio' },
  { valor: 6, nome: 'Junho' },
  { valor: 7, nome: 'Julho' },
  { valor: 8, nome: 'Agosto' },
  { valor: 9, nome: 'Setembro' },
  { valor: 10, nome: 'Outubro' },
  { valor: 11, nome: 'Novembro' },
  { valor: 12, nome: 'Dezembro' },
]

export const ResumoIcmsPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const dataAtual = new Date()
  const [ano, setAno] = useState<number>(dataAtual.getFullYear())
  const [mes, setMes] = useState<number>(dataAtual.getMonth() + 1)
  const [incluirTeste, setIncluirTeste] = useState<boolean>(false)

  const [carregando, setCarregando] = useState<boolean>(true)
  const [resumo, setResumo] = useState<ResumoIcmsMesResultado | null>(null)

  const carregarResumo = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const dados = await obterResumoIcmsMes({
        empresaId: empresaAtiva.id,
        ano,
        mes,
        incluirTeste,
      })
      setResumo(dados)
    } catch (err: unknown) {
      console.error('Erro ao calcular Resumo do ICMS:', err)
      toast({
        title: 'Erro ao apurar ICMS do mês',
        description: err instanceof Error ? err.message : 'Falha ao buscar registros fiscais',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, ano, mes, incluirTeste, toast])

  useEffect(() => {
    carregarResumo()
  }, [carregarResumo])

  const anosDisponiveis = [
    dataAtual.getFullYear() + 1,
    dataAtual.getFullYear(),
    dataAtual.getFullYear() - 1,
    dataAtual.getFullYear() - 2,
    dataAtual.getFullYear() - 3,
  ]

  const debitos = resumo?.debitos
  const creditos = resumo?.creditos
  const apuracao = resumo?.apuracaoGerencial
  const sped = resumo?.spedOficial

  return (
    <div className="space-y-6">
      {/* Estilos para impressão limpa */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #secao-resumo-icms-impressao,
          #secao-resumo-icms-impressao * {
            visibility: visible;
          }
          #secao-resumo-icms-impressao {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            font-size: 11px;
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
            <Scale className="h-6 w-6 text-indigo-600" />
            Resumo da Apuração do ICMS do Mês
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Conferência gerencial de débitos das saídas, créditos das entradas/transferências e
            confronto com o Registro E110 do SPED Fiscal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!resumo}
            className="h-9 gap-1.5 text-xs text-slate-700 hover:text-slate-900"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            Imprimir Resumo
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarResumo}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin text-indigo-600' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* AVISO MANDATÓRIO DO PROMPT 8.1 */}
      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-3 shadow-xs">
        <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <span className="font-bold uppercase tracking-wide">Aviso Importante:</span> Esta tela é
          uma <strong>conferência gerencial</strong> baseada nos documentos fiscais emitidos e nas
          notas de entrada lançadas no sistema. A{' '}
          <strong>apuração oficial para recolhimento e obrigações tributárias</strong> é a
          escriturada no arquivo do <strong>SPED Fiscal (EFD ICMS/IPI)</strong> e transmitida à
          SEFAZ.
        </div>
      </div>

      {/* Seleção do Mês/Ano e Opções */}
      <Card className="no-print border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700">Mês de Referência:</span>
              </div>

              {/* Mês */}
              <div className="w-36">
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.valor} value={String(m.valor)}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ano */}
              <div className="w-28">
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                onClick={carregarResumo}
                disabled={carregando}
                className="h-9 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Recalcular
              </Button>
            </div>

            {/* Switch de notas de teste */}
            <div className="flex items-center gap-2">
              <Switch
                id="switch-teste-icms"
                checked={incluirTeste}
                onCheckedChange={setIncluirTeste}
              />
              <Label
                htmlFor="switch-teste-icms"
                className="text-xs font-medium text-slate-700 cursor-pointer"
              >
                Incluir notas em homologação
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ÁREA DE IMPRESSÃO / CONTEÚDO PRINCIPAL */}
      <div id="secao-resumo-icms-impressao" className="space-y-6">
        {/* Cabeçalho do Relatório */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 uppercase">
                Conferência da Apuração do ICMS — {MESES.find((m) => m.valor === mes)?.nome}/{ano}
              </h2>
              <p className="text-xs text-slate-500">
                {empresaAtiva?.razao_social || 'Empresa'} — CNPJ: {empresaAtiva?.cnpj || '—'} — UF:{' '}
                {empresaAtiva?.uf || '—'}
              </p>
            </div>
            <div className="text-xs text-slate-500 font-mono mt-2 sm:mt-0 text-right">
              Período: {resumo?.periodo.dataInicio} a {resumo?.periodo.dataFim}
            </div>
          </div>
        </div>

        {/* QUADRO COMPARATIVO LADO A LADO: DÉBITOS VS CRÉDITOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* COLUNA ESQUERDA: DÉBITOS (SAÍDAS) */}
          <Card className="border-indigo-100 shadow-xs">
            <CardHeader className="py-3 px-4 bg-indigo-50/70 border-b border-indigo-100 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight className="h-4 w-4 text-indigo-700" />
                Débitos do Mês (Livro de Saídas)
              </CardTitle>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-indigo-700 hover:text-indigo-900 p-1 no-print"
              >
                <Link to="/fiscal/livro-saidas" className="gap-1 flex items-center">
                  <span>Abrir Livro Saídas</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Documentos Autorizados (NF-e/NFC-e)</span>
                <span className="font-mono font-semibold text-slate-900">
                  {debitos?.quantidadeDocumentos || 0} docs
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Valor Contábil das Saídas</span>
                <span className="font-mono font-medium text-slate-900">
                  R${' '}
                  {debitos?.valorContabilSaidas.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Base de Cálculo do ICMS Próprio</span>
                <span className="font-mono font-medium text-slate-700">
                  R$ {debitos?.baseIcmsSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">ICMS ST Destacado nas Saídas</span>
                <span className="font-mono font-medium text-amber-700">
                  R$ {debitos?.icmsStSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">DIFAL Interestadual Consumidor Final</span>
                <span className="font-mono font-medium text-amber-700">
                  R$ {debitos?.difalDestino.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 bg-indigo-50/50 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-indigo-950 uppercase">
                  Total de Débitos ICMS Próprio:
                </span>
                <span className="text-base font-bold font-mono text-indigo-800">
                  R${' '}
                  {debitos?.icmsProprioSaidas.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* COLUNA DIREITA: CRÉDITOS (ENTRADAS + TRANSFERÊNCIAS) */}
          <Card className="border-emerald-100 shadow-xs">
            <CardHeader className="py-3 px-4 bg-emerald-50/70 border-b border-emerald-100 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowDownRight className="h-4 w-4 text-emerald-700" />
                Créditos do Mês (Entradas & Transferências)
              </CardTitle>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-emerald-700 hover:text-emerald-900 p-1 no-print"
              >
                <Link to="/compras/livro-entradas" className="gap-1 flex items-center">
                  <span>Abrir Livro Entradas</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Notas de Entrada Lançadas</span>
                <span className="font-mono font-semibold text-slate-900">
                  {creditos?.quantidadeNotasEntrada || 0} notas
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Valor Contábil das Entradas</span>
                <span className="font-mono font-medium text-slate-900">
                  R${' '}
                  {creditos?.valorContabilEntradas.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Base de Cálculo dos Créditos Aproveitados</span>
                <span className="font-mono font-medium text-slate-700">
                  R${' '}
                  {creditos?.baseIcmsEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Crédito ICMS das Compras (Livro de Entradas)</span>
                <span className="font-mono font-medium text-emerald-800">
                  R${' '}
                  {creditos?.icmsAproveitadoEntradas.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                <span className="text-slate-600">Crédito ICMS de Transferências Recebidas</span>
                <span className="font-mono font-medium text-emerald-800">
                  R${' '}
                  {creditos?.icmsTransferenciasRecebidas.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/50 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-950 uppercase">
                  Total de Créditos Aproveitados:
                </span>
                <span className="text-base font-bold font-mono text-emerald-800">
                  R${' '}
                  {creditos?.icmsAproveitadoTotal.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* QUADRO DO SALDO GERENCIAL DO MÊS */}
        <Card className="border-slate-300 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-100/80 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>Saldo Gerencial do Mês (Débitos - Créditos)</span>
              <span className="text-[11px] font-normal text-slate-500">
                Mês {mes}/{ano}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Situação Estimada:</span>
                  {apuracao?.situacao === 'a_recolher' ? (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-xs font-bold uppercase">
                      ICMS a Recolher
                    </Badge>
                  ) : apuracao?.situacao === 'credor' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-bold uppercase">
                      Saldo Credor para o Mês Seguinte
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-800 border-slate-300 text-xs font-bold uppercase">
                      Saldo Zerado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {apuracao?.situacao === 'a_recolher'
                    ? 'Débitos de saídas superam os créditos aproveitados de entradas.'
                    : apuracao?.situacao === 'credor'
                      ? 'Créditos aproveitados superam os débitos de saídas gerando saldo credor a transportar.'
                      : 'Débitos e créditos estão exatamente equilibrados.'}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] uppercase font-bold text-slate-500 block">
                  {apuracao?.situacao === 'a_recolher'
                    ? 'Valor Estimado a Recolher'
                    : 'Saldo Credor a Transportar'}
                </span>
                <span
                  className={`text-3xl font-extrabold font-mono ${
                    apuracao?.situacao === 'a_recolher' ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  R${' '}
                  {(apuracao?.situacao === 'a_recolher'
                    ? apuracao?.valorRecolher
                    : apuracao?.saldoCredorTransportar || 0
                  )?.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QUADRO DE CONFRONTO COM O REGISTRO E110 DO SPED FISCAL (SE EXISTIR ARQUIVO) */}
        <Card className="border-slate-300 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                Confronto com a Apuração Oficial do SPED Fiscal (Registro E110)
              </span>
              {sped ? (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold uppercase">
                  Arquivo SPED Encontrado ({sped.status})
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] font-medium"
                >
                  Nenhum SPED gerado para o mês
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {!sped ? (
              <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-lg">
                <p className="text-xs">
                  Ainda não há arquivo do SPED Fiscal gerado no sistema para o período{' '}
                  <span className="font-mono font-bold">
                    {mes < 10 ? `0${mes}` : mes}
                    {ano}
                  </span>
                  .
                </p>
                <div className="mt-2 no-print">
                  <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                    <Link to="/fiscal/sped">Gerar SPED Fiscal do Mês</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
                  <div>
                    <span className="text-slate-500 block text-[11px]">
                      Recibo de Entrega / ID:
                    </span>
                    <span className="font-mono font-medium text-slate-800">
                      {sped.reciboEntrega || sped.arquivoId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Status no ERP:</span>
                    <span className="font-semibold text-slate-800">{sped.status}</span>
                  </div>
                  <div className="sm:text-right no-print">
                    <Button
                      asChild
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-indigo-600"
                    >
                      <Link to={`/fiscal/sped/${sped.arquivoId}/relatorio`}>
                        Ver Relatório de Conferência do SPED →
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/60 text-[10px] font-bold text-slate-700 uppercase">
                        <th className="py-2 px-3">Linha / Rubrica de Apuração</th>
                        <th className="py-2 px-3 text-right">Gerencial (Livros)</th>
                        <th className="py-2 px-3 text-right">SPED Oficial (E110)</th>
                        <th className="py-2 px-3 text-right">Diferença</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-800">
                          Total de Débitos por Saídas (Campo 02)
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-700 font-semibold">
                          R${' '}
                          {debitos?.icmsProprioSaidas.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-900">
                          R${' '}
                          {sped.e110Debitos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Math.abs(sped.diferencaDebitos) > 0.05
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          R${' '}
                          {sped.diferencaDebitos.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          {Math.abs(sped.diferencaDebitos) <= 0.05 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Igual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-semibold">
                              <AlertCircle className="h-3.5 w-3.5" /> Divergência
                            </span>
                          )}
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-slate-800">
                          Total de Créditos por Entradas (Campo 06)
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                          R${' '}
                          {creditos?.icmsAproveitadoTotal.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-900">
                          R${' '}
                          {sped.e110Creditos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Math.abs(sped.diferencaCreditos) > 0.05
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          R${' '}
                          {sped.diferencaCreditos.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          {Math.abs(sped.diferencaCreditos) <= 0.05 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Igual
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-semibold">
                              <AlertCircle className="h-3.5 w-3.5" /> Divergência
                            </span>
                          )}
                        </td>
                      </tr>

                      <tr className="bg-slate-50/70 font-semibold">
                        <td className="py-2 px-3 font-sans text-slate-900">
                          ICMS a Recolher no Período (Campo 11)
                        </td>
                        <td className="py-2 px-3 text-right text-rose-700 font-bold">
                          R${' '}
                          {(apuracao?.valorRecolher || 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-900 font-bold">
                          R${' '}
                          {sped.e110IcmsRecolher.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            Math.abs(sped.diferencaRecolher) > 0.05
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          R${' '}
                          {sped.diferencaRecolher.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          {Math.abs(sped.diferencaRecolher) <= 0.05 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Conferido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                              <AlertTriangle className="h-3.5 w-3.5" /> Diferença
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {Math.abs(sped.diferencaRecolher) > 0.05 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                    <strong>Motivo comum de divergência:</strong> O SPED E110 considera também o
                    saldo credor transportado do mês anterior (Campo 09), outros créditos (Campo 07)
                    e outros débitos / estornos (Campos 03 e 04), enquanto a apuração gerencial
                    confronta o fluxo direto de notas emitidas e notas lançadas no mês corrente.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ResumoIcmsPage
