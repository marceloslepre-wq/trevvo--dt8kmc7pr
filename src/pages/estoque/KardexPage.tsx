import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  consultarKardexMultiempresa,
  buscarSaldosIniciaisMultiempresa,
  KardexResposta,
  KardexEmpresaSecao,
} from '@/services/kardex'
import { estornarMovimento } from '@/services/estoque'
import { buscarNomesEmpresas } from '@/services/filtroMultiempresa'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import { KardexTabela, KardexLinha } from '@/components/estoque/KardexTabela'
import {
  KardexTotaisPorEmpresa,
  KardexSecaoEmpresa,
  KardexEmpresaLinha,
} from '@/components/estoque/KardexPainelEmpresa'
import { toast } from '@/hooks/use-toast'
import { ModalAutorizacaoSupervisor } from '@/components/ModalAutorizacaoSupervisor'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select as SelectFiltro,
  SelectContent as SelectContentFiltro,
  SelectItem as SelectItemFiltro,
  SelectTrigger as SelectTriggerFiltro,
  SelectValue as SelectValueFiltro,
} from '@/components/ui/select'
import { Package, Building2, Download, Printer, Search, X } from 'lucide-react'

export const KardexPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { usuario } = useAuth()

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    produtos_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(() => ['estoque_produtos'], [])

  const [resumo, setResumo] = useState<KardexResposta | null>(null)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [busca, setBusca] = useState<string>('')
  const [produtoSel, setProdutoSel] = useState<{ id: string; nome: string } | null>(null)
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'Entrada' | 'Saída'>('TODOS')
  const [origemFiltro, setOrigemFiltro] = useState<string>('TODAS')

  // Multiempresa: usar TODAS as empresas marcadas, não só a primeira (padrão da série 307–312)
  const empresasEfetivas: string[] = (filtros.empresas_ids || []).filter(Boolean).length
    ? (filtros.empresas_ids || []).filter(Boolean)
    : empresaAtiva?.id
      ? [empresaAtiva.id]
      : []
  // "Ver só o total consolidado" (FiltrosRelatorio): oculta quebra por empresa
  const verSoTotal = filtros.ver_so_total === true
  const multiempresa = empresasEfetivas.length > 1 && !verSoTotal

  // Nomes das empresas para as seções e painel "Totais por Empresa"
  const [nomesEmpresas, setNomesEmpresas] = useState<Record<string, string>>({})
  useEffect(() => {
    buscarNomesEmpresas(empresasEfetivas).then(setNomesEmpresas)
  }, [empresasEfetivas.join(',')])

  const dataInicio = (filtros.data_inicio as string) || ''
  const dataFim = (filtros.data_fim as string) || ''

  const carregarDados = useCallback(async () => {
    if (empresasEfetivas.length === 0 || !dataInicio || !dataFim) return
    setCarregando(true)
    try {
      const [res, saldosIni] = await Promise.all([
        consultarKardexMultiempresa({
          empresaIds: empresasEfetivas,
          produtoIds: filtros.produtos_ids || [],
          dataInicio,
          dataFim,
          tipo: tipoFiltro !== 'TODOS' ? (tipoFiltro as 'Entrada' | 'Saída') : undefined,
          origem: origemFiltro !== 'TODAS' ? origemFiltro : undefined,
        }),
        buscarSaldosIniciaisMultiempresa({
          empresaIds: empresasEfetivas,
          produtoIds: filtros.produtos_ids || [],
          dataInicio,
        }),
      ])
      setResumo({ ...res, saldoInicialPorEmpresa: saldosIni })
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar Kardex',
        description: err?.message || 'Falha ao buscar movimentações de estoque.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresasEfetivas.join(','),
    dataInicio,
    dataFim,
    (filtros.produtos_ids || []).join(','),
    tipoFiltro,
    origemFiltro,
  ])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // ===== Extração de dados (multiempresa OU empresa única) =====
  const secoes = useMemo<KardexEmpresaSecao[]>(() => resumo?.secoes || [], [resumo])

  // Consolidado: soma empresas por produto
  const consolidado = useMemo(() => {
    if (!resumo)
      return {
        saldoInicial: { quantidade: 0, custo_medio: 0, valor_total: 0 },
        movimentos: [] as KardexLinha[],
        saldoFinal: { quantidade: 0, custo_medio: 0, valor_total: 0 },
      }
    const mapa = new Map<
      string,
      { id: string; quantidade: number; custo_medio: number; valor_total: number }
    >()
    for (const [empId, si] of Object.entries(resumo.saldoInicialPorEmpresa || {})) {
      const atual = mapa.get(empId) || { id: empId, quantidade: 0, custo_medio: 0, valor_total: 0 }
      atual.quantidade += si.quantidade
      atual.valor_total += si.valor_total
      mapa.set(empId, atual)
    }
    const saldoInicial = {
      quantidade: Array.from(mapa.values()).reduce((a, s) => a + s.quantidade, 0),
      custo_medio: 0,
      valor_total: Array.from(mapa.values()).reduce((a, s) => a + s.valor_total, 0),
    }
    // Movimentos concatenados (ordenados por data asc — já vem do serviço)
    const movs: KardexLinha[] = []
    for (const sec of secoes) {
      for (const m of sec.movimentos) {
        movs.push({ ...m, id: `${sec.empresaId}:${m.id}` })
      }
    }
    movs.sort((a, b) => a.data_movimento.localeCompare(b.data_movimento))
    const saldoFinal = resumo.saldoFinalConsolidado || saldoInicial
    return { saldoInicial, movimentos: movs, saldoFinal }
  }, [resumo, secoes])

  const linhasExibidas = useMemo(() => {
    const lista = verSoTotal ? consolidado.movimentos : secoes.flatMap((s) => s.movimentos)
    if (!busca.trim()) return lista
    const termo = busca.toLowerCase()
    return lista.filter(
      (m) =>
        m.documento_numero?.toLowerCase().includes(termo) ||
        m.numero_lote?.toLowerCase().includes(termo) ||
        m.usuario_nome?.toLowerCase().includes(termo) ||
        m.motivo?.toLowerCase().includes(termo),
    )
  }, [verSoTotal, consolidado.movimentos, secoes, busca])

  // Painel "Totais por Empresa" (padrão Inadimplência/Fluxo de Caixa)
  const totaisPorEmpresa = useMemo<KardexEmpresaLinha[]>(() => {
    return secoes.map((sec) => {
      let entradasQtd = 0
      let saidasQtd = 0
      let entradasValor = 0
      let saidasValor = 0
      for (const m of sec.movimentos) {
        if (m.estornado) continue
        if (m.tipo === 'Entrada') {
          entradasQtd += m.quantidade
          entradasValor += m.valor_total
        } else {
          saidasQtd += m.quantidade
          saidasValor += m.valor_total
        }
      }
      return {
        empresaId: sec.empresaId,
        qtdMovimentos: sec.movimentos.length,
        entradasQtd,
        saidasQtd,
        entradasValor,
        saidasValor,
        saldoFinalQtd: sec.saldoFinal.quantidade,
        saldoFinalValor: sec.saldoFinal.valor_total,
        movimentos: [],
      }
    })
  }, [secoes])

  // ===== Estorno (supervisor) =====
  const [movEstorno, setMovEstorno] = useState<KardexLinha | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [modalSupervisor, setModalSupervisor] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [empresaEstorno, setEmpresaEstorno] = useState<string | null>(null)

  const pedirEstorno = (l: KardexLinha, empresaId: string) => {
    setMovEstorno(l)
    setEmpresaEstorno(empresaId)
    setMotivoEstorno('')
    setModalSupervisor(true)
  }

  const confirmarEstorno = async (
    sucesso: boolean,
    dadosAutorizacao?: { usuario: string; senha: string },
  ) => {
    setModalSupervisor(false)
    if (!sucesso || !movEstorno || !empresaEstorno) return
    if (!motivoEstorno.trim()) {
      toast({ title: 'Informe o motivo do estorno', variant: 'destructive' })
      return
    }
    setProcessando(true)
    try {
      await estornarMovimento(movEstorno.id, motivoEstorno.trim())
      toast({ title: 'Movimento estornado com sucesso' })
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao estornar movimento',
        description: err?.message || 'Falha no estorno de estoque.',
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
    }
    // dadosAutorizacao contém credenciais do supervisor — validação é feita no backend
  }

  // ===== CSV =====
  const exportarCSV = () => {
    const sep = ';'
    const linhasCSV: string[] = []
    const cab =
      [
        'Empresa',
        'Data/Hora',
        'Origem',
        'Documento',
        'Lote',
        'Entrada',
        'Saída',
        'Saldo Físico',
        'Custo Unitário',
        'Custo Médio',
        'Valor Total',
        'Operador/Motivo',
      ].join(sep) + '\n'

    const addLinhas = (nomeEmpresa: string, movs: KardexLinha[]) => {
      for (const m of movs) {
        linhasCSV.push(
          [
            `"${nomeEmpresa}"`,
            `"${new Date(m.data_movimento).toLocaleString('pt-BR')}"`,
            `"${m.origem}"`,
            `"${m.documento_tipo ? `${m.documento_tipo} ${m.documento_numero || ''}` : ''}"`,
            `"${m.numero_lote || ''}"`,
            m.tipo === 'Entrada' ? m.quantidade : 0,
            m.tipo === 'Saída' ? m.quantidade : 0,
            m.saldo_posterior,
            m.custo_unitario,
            m.custo_medio_posterior,
            m.valor_total,
            `"${m.usuario_nome || m.motivo || ''}"`,
          ].join(sep),
        )
      }
    }

    if (verSoTotal) {
      addLinhas('CONSOLIDADO', linhasExibidas)
    } else {
      for (const sec of secoes) {
        const nome = nomesEmpresas[sec.empresaId] || sec.empresaId
        addLinhas(nome, sec.movimentos)
      }
    }

    const blob = new Blob([cab + linhasCSV.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `kardex_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ===== Impressão =====
  const imprimir = () => {
    window.print()
  }

  // Filtro local de tipo/origem aplicado ao renderizar (o serviço já filtra, aqui é redundância segura)
  const linhasTabela = useMemo(() => {
    return linhasExibidas.filter(
      (m) =>
        (tipoFiltro === 'TODOS' || m.tipo === tipoFiltro) &&
        (origemFiltro === 'TODAS' || m.origem === origemFiltro),
    )
  }, [linhasExibidas, tipoFiltro, origemFiltro])

  return (
    <div className="space-y-6">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="estoque_kardex"
        tituloRelatorio="Kardex"
        subtituloRelatorio="Histórico de movimentações de estoque por produto e empresa, com saldo inicial, entradas, saídas e posição final."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarDados}
        onExportarCsv={exportarCSV}
        carregando={carregando}
        filtrosExtras={
          <div className="flex gap-2 items-end flex-wrap">
            <div className="space-y-1 min-w-[140px]">
              <label className="text-[11px] font-semibold text-slate-600 block">Tipo</label>
              <SelectFiltro value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as any)}>
                <SelectTriggerFiltro className="text-xs h-9">
                  <SelectValueFiltro placeholder="Tipo" />
                </SelectTriggerFiltro>
                <SelectContentFiltro>
                  <SelectItemFiltro value="TODOS">Todos</SelectItemFiltro>
                  <SelectItemFiltro value="Entrada">Entradas</SelectItemFiltro>
                  <SelectItemFiltro value="Saída">Saídas</SelectItemFiltro>
                </SelectContentFiltro>
              </SelectFiltro>
            </div>
            <div className="space-y-1 min-w-[140px]">
              <label className="text-[11px] font-semibold text-slate-600 block">Origem</label>
              <SelectFiltro value={origemFiltro} onValueChange={setOrigemFiltro}>
                <SelectTriggerFiltro className="text-xs h-9">
                  <SelectValueFiltro placeholder="Origem" />
                </SelectTriggerFiltro>
                <SelectContentFiltro>
                  <SelectItemFiltro value="TODAS">Todas</SelectItemFiltro>
                  <SelectItemFiltro value="COMPRA">Compra</SelectItemFiltro>
                  <SelectItemFiltro value="VENDA">Venda</SelectItemFiltro>
                  <SelectItemFiltro value="AJUSTE_ENTRADA">Ajuste de Entrada</SelectItemFiltro>
                  <SelectItemFiltro value="AJUSTE_SAIDA">Ajuste de Saída</SelectItemFiltro>
                  <SelectItemFiltro value="TRANSFERENCIA_ENTRADA">Transf. Entrada</SelectItemFiltro>
                  <SelectItemFiltro value="TRANSFERENCIA_SAIDA">Transf. Saída</SelectItemFiltro>
                  <SelectItemFiltro value="INVENTARIO_ENTRADA">Inventário Entrada</SelectItemFiltro>
                  <SelectItemFiltro value="INVENTARIO_SAIDA">Inventário Saída</SelectItemFiltro>
                  <SelectItemFiltro value="DEVOLUCAO_COMPRA">Devolução Compra</SelectItemFiltro>
                  <SelectItemFiltro value="DEVOLUCAO_VENDA">Devolução Venda</SelectItemFiltro>
                  <SelectItemFiltro value="BONIFICACAO_ENTRADA">
                    Bonificação Entrada
                  </SelectItemFiltro>
                  <SelectItemFiltro value="BONIFICACAO_SAIDA">Bonificação Saída</SelectItemFiltro>
                  <SelectItemFiltro value="PERDA">Perda</SelectItemFiltro>
                  <SelectItemFiltro value="CONSUMO_INTERNO">Consumo Interno</SelectItemFiltro>
                  <SelectItemFiltro value="SALDO_INICIAL">Saldo Inicial</SelectItemFiltro>
                  <SelectItemFiltro value="ESTORNO">Estorno</SelectItemFiltro>
                </SelectContentFiltro>
              </SelectFiltro>
            </div>
            <div className="space-y-1 min-w-[200px]">
              <label className="text-[11px] font-semibold text-slate-600 block">Busca Rápida</label>
              <Input
                type="text"
                placeholder="Documento, lote, operador ou motivo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>
        }
      />

      {/* Cards de resumo geral */}
      {resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-slate-200 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-slate-700 uppercase flex items-center justify-between">
                <span>Movimentos no Período</span>
                <Package className="w-4 h-4 text-slate-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-xl font-black font-mono text-slate-900">
                {verSoTotal
                  ? linhasExibidas.length
                  : secoes.reduce((a, s) => a + s.movimentos.length, 0)}
              </div>
              <p className="text-[11px] text-slate-500">
                {verSoTotal ? 'Consolidado (todas as empresas)' : `${secoes.length} empresa(s)`}
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/30 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-emerald-800 uppercase">
                Entradas (qtd)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-emerald-900">
                {verSoTotal
                  ? (consolidado.movimentos || [])
                      .filter((m) => !m.estornado && m.tipo === 'Entrada')
                      .reduce((a, m) => a + m.quantidade, 0)
                      .toLocaleString('pt-BR', { minimumFractionDigits: 4 })
                  : totaisPorEmpresa
                      .reduce((a, e) => a + e.entradasQtd, 0)
                      .toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-rose-200 bg-rose-50/30 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-rose-800 uppercase">
                Saídas (qtd)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-rose-900">
                {verSoTotal
                  ? (consolidado.movimentos || [])
                      .filter((m) => !m.estornado && m.tipo === 'Saída')
                      .reduce((a, m) => a + m.quantidade, 0)
                      .toLocaleString('pt-BR', { minimumFractionDigits: 4 })
                  : totaisPorEmpresa
                      .reduce((a, e) => a + e.saidasQtd, 0)
                      .toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/30 shadow-2xs">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold text-blue-800 uppercase">
                Saldo Final (R$)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold font-mono text-blue-900">
                {(verSoTotal
                  ? consolidado.saldoFinal.valor_total
                  : totaisPorEmpresa.reduce((a, e) => a + e.saldoFinalValor, 0)
                ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <p className="text-[11px] text-blue-700/80">
                {verSoTotal ? 'Soma das empresas' : 'Soma dos saldos finais por empresa'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Painel Totais por Empresa (oculto com "Ver só o total consolidado" ou 1 empresa) */}
      {!verSoTotal && empresasEfetivas.length > 1 && totaisPorEmpresa.length > 0 && (
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">Totais por Empresa</h3>
              <Badge variant="outline" className="text-[10px]">
                {empresasEfetivas.length} empresas no filtro
              </Badge>
            </div>
            <KardexTotaisPorEmpresa
              porEmpresa={totaisPorEmpresa}
              nomesEmpresas={nomesEmpresas}
              saldoInicialPorEmpresa={resumo?.saldoInicialPorEmpresa || {}}
            />
          </CardContent>
        </Card>
      )}

      {/* CORPO PRINCIPAL */}
      {verSoTotal ? (
        /* ===== Modo consolidado: uma única tabela, sem seções ===== */
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-500" />
                Movimentações Consolidadas (todas as empresas)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={imprimir} className="text-xs h-8">
                  <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={exportarCSV} className="text-xs h-8">
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
              </div>
            </CardTitle>
            <CardDescription className="text-xs">
              Saldos somados entre empresas — não representa posição física de nenhuma loja isolada.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <KardexTabela
              linhas={linhasTabela}
              saldoInicial={consolidado.saldoInicial}
              dataInicio={dataInicio}
              podeExcluir={false}
              onEstornar={() => {}}
            />
          </CardContent>
        </Card>
      ) : multiempresa ? (
        /* ===== Multiempresa: UMA SEÇÃO POR EMPRESA — saldos nunca misturados ===== */
        secoes.map((sec) => {
          const linhas = sec.movimentos.filter(
            (m) =>
              (tipoFiltro === 'TODOS' || m.tipo === tipoFiltro) &&
              (origemFiltro === 'TODAS' || m.origem === origemFiltro) &&
              (!busca.trim() ||
                m.documento_numero?.toLowerCase().includes(busca.toLowerCase()) ||
                m.numero_lote?.toLowerCase().includes(busca.toLowerCase()) ||
                m.usuario_nome?.toLowerCase().includes(busca.toLowerCase()) ||
                m.motivo?.toLowerCase().includes(busca.toLowerCase())),
          )
          return (
            <Card key={sec.empresaId} className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <KardexSecaoEmpresa
                    empresaId={sec.empresaId}
                    nomeEmpresa={nomesEmpresas[sec.empresaId] || sec.empresaId}
                    saldoInicial={
                      resumo?.saldoInicialPorEmpresa?.[sec.empresaId] || {
                        quantidade: 0,
                        custo_medio: 0,
                        valor_total: 0,
                      }
                    }
                    saldoFinal={sec.saldoFinal}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nome = (nomesEmpresas[sec.empresaId] || sec.empresaId).replace(
                          /[^\w]+/g,
                          '_',
                        )
                        const cab =
                          'Data/Hora;Origem;Documento;Lote;Entrada;Saída;Saldo Físico;Custo Unitário;Custo Médio;Valor Total;Operador/Motivo\n'
                        const lin = sec.movimentos
                          .map((m) =>
                            [
                              `"${new Date(m.data_movimento).toLocaleString('pt-BR')}"`,
                              `"${m.origem}"`,
                              `"${m.documento_tipo ? `${m.documento_tipo} ${m.documento_numero || ''}` : ''}"`,
                              `"${m.numero_lote || ''}"`,
                              m.tipo === 'Entrada' ? m.quantidade : 0,
                              m.tipo === 'Saída' ? m.quantidade : 0,
                              m.saldo_posterior,
                              m.custo_unitario,
                              m.custo_medio_posterior,
                              m.valor_total,
                              `"${m.usuario_nome || m.motivo || ''}"`,
                            ].join(';'),
                          )
                          .join('\n')
                        const blob = new Blob([cab + lin], { type: 'text/csv;charset=utf-8;' })
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement('a')
                        link.setAttribute('href', url)
                        link.setAttribute('download', `kardex_${nome}.csv`)
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }}
                      className="text-xs h-8"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> CSV
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <KardexTabela
                  linhas={linhas}
                  saldoInicial={
                    resumo?.saldoInicialPorEmpresa?.[sec.empresaId] || {
                      quantidade: 0,
                      custo_medio: 0,
                      valor_total: '0.00' as any as number,
                    }
                  }
                  dataInicio={dataInicio}
                  podeExcluir={true}
                  onEstornar={(l) => pedirEstorno(l, sec.empresaId)}
                />
              </CardContent>
            </Card>
          )
        })
      ) : (
        /* ===== Empresa única: comportamento anterior ===== */
        (() => {
          const sec = secoes[0]
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-slate-500" />
                    Movimentações do Período
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={imprimir} className="text-xs h-8">
                      <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportarCSV}
                      className="text-xs h-8"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> CSV
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <KardexTabela
                  linhas={linhasTabela}
                  saldoInicial={
                    sec
                      ? resumo?.saldoInicialPorEmpresa?.[sec.empresaId] || {
                          quantidade: 0,
                          custo_medio: 0,
                          valor_total: 0,
                        }
                      : { quantidade: 0, custo_medio: 0, valor_total: 0 }
                  }
                  dataInicio={dataInicio}
                  podeExcluir={true}
                  onEstornar={(l) => pedirEstorno(l, sec?.empresaId || '')}
                />
              </CardContent>
            </Card>
          )
        })()
      )}

      {/* Estado vazio global */}
      {!carregando && secoes.length === 0 && (
        <Card className="border-slate-200">
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">
              Nenhuma movimentação encontrada para os filtros selecionados.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Ajuste o período, as empresas ou os produtos no filtro.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBusca('')
                setTipoFiltro('TODOS')
                setOrigemFiltro('TODAS')
                setFiltros({ ...filtros, produtos_ids: [] })
              }}
              className="mt-4"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Modal Estorno */}
      <Dialog
        open={Boolean(movEstorno)}
        onOpenChange={(open) => {
          if (!open) {
            setMovEstorno(null)
            setMotivoEstorno('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Estornar Movimento de Estoque
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Será criado um movimento inverso com o mesmo custo, mantendo o histórico íntegro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {movEstorno && (
              <div className="text-xs bg-slate-50 border rounded-md p-3 space-y-1">
                <div>
                  <strong>Origem:</strong> {movEstorno.origem}
                </div>
                <div>
                  <strong>Quantidade:</strong> {movEstorno.quantidade} ({movEstorno.tipo})
                </div>
                <div>
                  <strong>Data:</strong>{' '}
                  {new Date(movEstorno.data_movimento).toLocaleString('pt-BR')}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Motivo do estorno *</Label>
              <Textarea
                value={motivoEstorno}
                onChange={(e) => setMotivoEstorno(e.target.value)}
                placeholder="Descreva o motivo do estorno (obrigatório)"
                className="text-xs min-h-[70px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setMovEstorno(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={processando || !motivoEstorno.trim()}
              onClick={() => {
                setMovEstorno(null)
                setModalSupervisor(true)
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Confirmar e Autorizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Autorização de Supervisor */}
      <ModalAutorizacaoSupervisor open={modalSupervisor} onClose={confirmarEstorno} />
    </div>
  )
}

export default KardexPage
