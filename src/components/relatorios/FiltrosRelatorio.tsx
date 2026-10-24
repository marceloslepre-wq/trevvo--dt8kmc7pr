import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar,
  Building2,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Filter,
  CheckSquare,
  Square,
  SlidersHorizontal,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  PeriodoRelatorio,
  TipoAtalhoPeriodo,
  calcularPeriodoPorAtalho,
  validarPeriodoMaximo366Dias,
  formatarDataBr,
  formatarDataHoraEmissao,
} from '@/services/relatorios'

export interface FiltrosRelatorioState {
  empresasIds: string[]
  verSoTotal: boolean
  periodo: PeriodoRelatorio
  atalhoPeriodo: TipoAtalhoPeriodo
  incluirNotasTeste?: boolean
}

export interface FiltrosRelatorioProps {
  /** Título do relatório para o cabeçalho de impressão e identificação */
  tituloRelatorio?: string
  /** Subtítulo ou descrição curta */
  subtituloRelatorio?: string
  /** Se o relatório suporta a opção de incluir notas fiscais de homologação/teste */
  suportaNotasTeste?: boolean
  /** Estado atual dos filtros controlados */
  filtros: FiltrosRelatorioState
  /** Callback quando qualquer filtro sofrer alteração */
  onChange: (novosFiltros: FiltrosRelatorioState) => void
  /** Callback para disparar a consulta / filtragem */
  onFiltrar?: () => void
  /** Callback ao clicar em Exportar CSV */
  onExportarCsv?: () => void
  /** Callback ao clicar em Imprimir (opcional; se omitido, chama window.print) */
  onImprimir?: () => void
  /** Indica se os dados estão sendo carregados */
  carregando?: boolean
  /** Desabilita os botões de exportar ou filtrar */
  desabilitado?: boolean
  /** Conteúdo extra para filtros específicos (produto, cliente, fornecedor, fiscal, financeiro - preparado para 8.0b) */
  children?: React.ReactNode
  /** Seção extra de filtros complementares */
  filtrosExtras?: React.ReactNode
}

export const ATALHOS_PERIODO: { id: TipoAtalhoPeriodo; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'ultimos_30', label: 'Últimos 30 dias' },
  { id: 'ultimos_90', label: 'Últimos 90 dias' },
  { id: 'ultimos_365', label: 'Últimos 365 dias' },
  { id: 'personalizado', label: 'Personalizado' },
]

export const FiltrosRelatorio: React.FC<FiltrosRelatorioProps> = ({
  tituloRelatorio,
  subtituloRelatorio,
  suportaNotasTeste = false,
  filtros,
  onChange,
  onFiltrar,
  onExportarCsv,
  onImprimir,
  carregando = false,
  desabilitado = false,
  children,
  filtrosExtras,
}) => {
  const { empresas, empresaAtiva } = useEmpresaAtiva()
  const [empresasAbertas, setEmpresasAbertas] = useState(false)
  const [extrasAbertos, setExtrasAbertos] = useState(false)
  const [dataHoraEmissao] = useState<string>(() => formatarDataHoraEmissao())

  // Inicializa a empresa ativa caso a lista esteja vazia
  useEffect(() => {
    if ((!filtros.empresasIds || filtros.empresasIds.length === 0) && empresaAtiva) {
      onChange({
        ...filtros,
        empresasIds: [empresaAtiva.id],
      })
    }
  }, [empresaAtiva, filtros, onChange])

  // Validação dos 366 dias
  const validacaoPeriodo = useMemo(() => {
    return validarPeriodoMaximo366Dias(filtros.periodo.dataInicio, filtros.periodo.dataFim)
  }, [filtros.periodo.dataInicio, filtros.periodo.dataFim])

  // Ações de seleção de empresas
  const handleToggleEmpresa = useCallback(
    (empresaId: string) => {
      const jaMarcada = filtros.empresasIds.includes(empresaId)
      let novaLista: string[]
      if (jaMarcada) {
        // Não deixa ficar sem nenhuma selecionada
        if (filtros.empresasIds.length === 1) return
        novaLista = filtros.empresasIds.filter((id) => id !== empresaId)
      } else {
        novaLista = [...filtros.empresasIds, empresaId]
      }
      onChange({
        ...filtros,
        empresasIds: novaLista,
      })
    },
    [filtros, onChange],
  )

  const handleMarcarTodasEmpresas = useCallback(() => {
    const todosIds = empresas.map((e) => e.id)
    onChange({
      ...filtros,
      empresasIds: todosIds,
    })
  }, [empresas, filtros, onChange])

  const handleDesmarcarTodasEmpresas = useCallback(() => {
    // Mantém pelo menos a empresa ativa selecionada
    const padraoId = empresaAtiva?.id || empresas[0]?.id
    onChange({
      ...filtros,
      empresasIds: padraoId ? [padraoId] : [],
    })
  }, [empresaAtiva, empresas, filtros, onChange])

  const handleTrocarAtalho = useCallback(
    (atalho: TipoAtalhoPeriodo) => {
      if (atalho === 'personalizado') {
        onChange({
          ...filtros,
          atalhoPeriodo: 'personalizado',
        })
        return
      }
      const novoPeriodo = calcularPeriodoPorAtalho(atalho)
      onChange({
        ...filtros,
        atalhoPeriodo: atalho,
        periodo: novoPeriodo,
      })
    },
    [filtros, onChange],
  )

  const handleMudarDataInicio = useCallback(
    (dataInicio: string) => {
      onChange({
        ...filtros,
        atalhoPeriodo: 'personalizado',
        periodo: {
          ...filtros.periodo,
          dataInicio,
        },
      })
    },
    [filtros, onChange],
  )

  const handleMudarDataFim = useCallback(
    (dataFim: string) => {
      onChange({
        ...filtros,
        atalhoPeriodo: 'personalizado',
        periodo: {
          ...filtros.periodo,
          dataFim,
        },
      })
    },
    [filtros, onChange],
  )

  const handleImprimirPadrao = useCallback(() => {
    if (onImprimir) {
      onImprimir()
    } else {
      window.print()
    }
  }, [onImprimir])

  // Nomes das empresas marcadas para resumo
  const resumoEmpresas = useMemo(() => {
    if (filtros.empresasIds.length === 0) return 'Nenhuma selecionada'
    if (filtros.empresasIds.length === empresas.length && empresas.length > 1) {
      return `Todas as empresas (${empresas.length})`
    }
    if (filtros.empresasIds.length === 1) {
      const e = empresas.find((item) => item.id === filtros.empresasIds[0])
      return e
        ? `${e.codigo ? `${e.codigo} - ` : ''}${e.nome_fantasia || e.razao_social}`
        : '1 empresa'
    }
    return `${filtros.empresasIds.length} empresas selecionadas`
  }, [filtros.empresasIds, empresas])

  const temMaisDeUmaEmpresa = empresas.length > 1
  const maisDeUmaEmpresaMarcada = filtros.empresasIds.length > 1

  return (
    <div className="space-y-4">
      {/* ========================================================
          CABEÇALHO EXCLUSIVO PARA IMPRESSÃO (visível só no print)
          ======================================================== */}
      <div className="hidden print:block border-b-2 border-slate-800 pb-3 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold uppercase text-slate-900 tracking-tight">
              {tituloRelatorio || 'Relatório Gerencial'}
            </h1>
            {subtituloRelatorio && (
              <p className="text-xs text-slate-600 mt-0.5">{subtituloRelatorio}</p>
            )}
            <div className="text-xs text-slate-700 mt-1 space-y-0.5">
              <p>
                <span className="font-semibold">Empresa(s): </span>
                {resumoEmpresas}
                {filtros.verSoTotal &&
                  maisDeUmaEmpresaMarcada &&
                  ' (Exibindo apenas total consolidado)'}
              </p>
              <p>
                <span className="font-semibold">Período de Apuração: </span>
                {formatarDataBr(filtros.periodo.dataInicio)} até{' '}
                {formatarDataBr(filtros.periodo.dataFim)}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-700">ERP Comercial</p>
            <p>Emissão: {dataHoraEmissao}</p>
          </div>
        </div>

        {/* Faixa destacada quando inclui notas de teste */}
        {suportaNotasTeste && filtros.incluirNotasTeste && (
          <div className="mt-2 py-1 px-2.5 bg-amber-100 border border-amber-300 text-amber-900 font-bold text-center text-xs uppercase tracking-wider rounded">
            ⚠ INCLUI NOTAS DE TESTE (HOMOLOGAÇÃO)
          </div>
        )}
      </div>

      {/* ========================================================
          FAIXA NA TELA: INCLUI NOTAS DE TESTE
          ======================================================== */}
      {suportaNotasTeste && filtros.incluirNotasTeste && (
        <div className="print:hidden bg-amber-500 text-slate-950 font-extrabold text-xs uppercase tracking-widest text-center py-1.5 px-4 rounded-md shadow-xs animate-pulse">
          INCLUI NOTAS DE TESTE (HOMOLOGAÇÃO)
        </div>
      )}

      {/* ========================================================
          CARD PRINCIPAL DE FILTROS (TELA)
          ======================================================== */}
      <Card className="print:hidden border-slate-200 shadow-xs bg-white">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Linha 1: Seleção de Empresas e Opções de Multiempresa */}
          {temMaisDeUmaEmpresa && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                    Empresas ({filtros.empresasIds.length} de {empresas.length} selecionadas)
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] bg-white font-normal text-slate-700"
                  >
                    {resumoEmpresas}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleMarcarTodasEmpresas}
                    className="h-7 text-xs text-slate-700 hover:text-blue-700"
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    Marcar todas
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDesmarcarTodasEmpresas}
                    className="h-7 text-xs text-slate-700 hover:text-slate-900"
                  >
                    <Square className="h-3.5 w-3.5 mr-1 text-slate-400" />
                    Desmarcar todas
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEmpresasAbertas(!empresasAbertas)}
                    className="h-7 text-xs bg-white border-slate-200"
                  >
                    {empresasAbertas ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5 mr-1" />
                        Ocultar lista
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1" />
                        Ver lista
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Lista expansível de empresas com código, nome e CNPJ */}
              {empresasAbertas && (
                <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {empresas.map((emp) => {
                    const marcada = filtros.empresasIds.includes(emp.id)
                    return (
                      <label
                        key={emp.id}
                        className={`flex items-start gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                          marcada
                            ? 'bg-blue-50/60 border-blue-200 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Checkbox
                          checked={marcada}
                          onCheckedChange={() => handleToggleEmpresa(emp.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="font-semibold text-slate-900 truncate">
                            {emp.codigo ? `[${emp.codigo}] ` : ''}
                            {emp.nome_fantasia || emp.razao_social}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            CNPJ: {emp.cnpj || 'Não informado'}
                          </div>
                          {emp.tipo && (
                            <span className="inline-block text-[9px] uppercase px-1 rounded bg-slate-200/70 text-slate-600 mt-1 font-semibold">
                              {emp.tipo}
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Alternância: Ver só o total quando mais de uma empresa marcada */}
              {maisDeUmaEmpresaMarcada && (
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <Checkbox
                      checked={filtros.verSoTotal}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...filtros,
                          verSoTotal: Boolean(checked),
                        })
                      }
                    />
                    <span>
                      Ver só o total consolidado (oculta colunas e quadros individuais por empresa)
                    </span>
                  </label>
                  {!filtros.verSoTotal && (
                    <span className="text-[11px] text-slate-500 italic">
                      Mostrando cada empresa separada + total consolidado
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Linha 2: Período com Atalhos e Datas Personalizadas */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Calendar className="h-4 w-4 text-slate-500" />
                Período de Consulta (máx. 366 dias)
              </Label>
              {validacaoPeriodo.valido && (
                <span className="text-[11px] text-slate-500">
                  {validacaoPeriodo.dias} {validacaoPeriodo.dias === 1 ? 'dia' : 'dias'}{' '}
                  selecionados
                </span>
              )}
            </div>

            {/* Botões de Atalhos de Período */}
            <div className="flex flex-wrap items-center gap-1.5">
              {ATALHOS_PERIODO.map((atalho) => {
                const ativo = filtros.atalhoPeriodo === atalho.id
                return (
                  <Button
                    key={atalho.id}
                    type="button"
                    variant={ativo ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleTrocarAtalho(atalho.id)}
                    className={`h-7 text-xs px-2.5 ${
                      ativo
                        ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {atalho.label}
                  </Button>
                )
              })}
            </div>

            {/* Inputs de Data Inicial e Final */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-slate-600">Data Inicial</Label>
                <Input
                  type="date"
                  value={filtros.periodo.dataInicio}
                  onChange={(e) => handleMudarDataInicio(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-slate-600">Data Final</Label>
                <Input
                  type="date"
                  value={filtros.periodo.dataFim}
                  onChange={(e) => handleMudarDataFim(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>

              {/* Opção notas fiscais de homologação / teste */}
              {suportaNotasTeste && (
                <div className="sm:col-span-2 flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <Checkbox
                      checked={Boolean(filtros.incluirNotasTeste)}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...filtros,
                          incluirNotasTeste: Boolean(checked),
                        })
                      }
                    />
                    <span>Incluir notas de teste (ambiente de homologação)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Mensagem de Erro de Validação de Período (> 366 dias ou início > fim) */}
            {!validacaoPeriodo.valido && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{validacaoPeriodo.mensagem}</span>
              </div>
            )}
          </div>

          {/* Filtros complementares (slot para próxima etapa 8.0b) */}
          {(children || filtrosExtras) && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setExtrasAbertos(!extrasAbertos)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                  <span>Filtros adicionais</span>
                  {extrasAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {extrasAbertos && (
                <div className="pt-1">
                  {children}
                  {filtrosExtras}
                </div>
              )}
            </div>
          )}

          {/* Linha 3: Barra de Ações: Filtrar, Exportar CSV e Imprimir */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {onFiltrar && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onFiltrar}
                  disabled={carregando || !validacaoPeriodo.valido || desabilitado}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  {carregando ? 'Carregando...' : 'Atualizar consulta'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onExportarCsv && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onExportarCsv}
                  disabled={carregando || !validacaoPeriodo.valido || desabilitado}
                  className="h-8 text-xs border-slate-200 text-slate-700 hover:text-slate-900 bg-white"
                  title="Exportar dados formatados para o Excel (.csv com BOM UTF-8 e ponto e vírgula)"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  Exportar CSV
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImprimirPadrao}
                disabled={carregando || !validacaoPeriodo.valido || desabilitado}
                className="h-8 text-xs border-slate-200 text-slate-700 hover:text-slate-900 bg-white"
                title="Imprimir relatório ou salvar em PDF com cabeçalho formatado"
              >
                <Printer className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                Imprimir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
