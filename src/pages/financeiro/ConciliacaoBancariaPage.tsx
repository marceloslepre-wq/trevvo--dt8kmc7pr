import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import pb from '@/lib/pocketbase/client'
import { ContaFinanceira, listarContasFinanceiras } from '@/services/contasFinanceiras'
import {
  ExtratoLinha,
  MovimentoExtratoItem,
  parseOFX,
  importarExtratoOfx,
  conciliarAutomaticamente,
  conciliarManual,
  desfazerConciliacao,
  alternarIgnorarLinhaExtrato,
  HeaderOfxInfo,
} from '@/services/movimentacoesExtratos'
import { ModalLancamentoAvulso } from './ModalLancamentoAvulso'
import { toast } from '@/hooks/use-toast'
import {
  UploadCloud,
  CheckCheck,
  Link as LinkIcon,
  RotateCcw,
  PlusCircle,
  FileText,
  AlertTriangle,
  Building,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  XCircle,
  EyeOff,
} from 'lucide-react'

export const ConciliacaoBancariaPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()

  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [contaId, setContaId] = useState<string>('')

  // Linhas do extrato importado
  const [linhasExtrato, setLinhasExtrato] = useState<ExtratoLinha[]>([])
  const [filtroSituacaoExtrato, setFiltroSituacaoExtrato] = useState<
    'Pendente' | 'Conciliada' | 'Ignorada' | 'Todas'
  >('Pendente')

  // Movimentos do sistema da conta
  const [movimentosSistema, setMovimentosSistema] = useState<MovimentoExtratoItem[]>([])
  const [filtroMovimentosConciliados, setFiltroMovimentosConciliados] = useState<boolean>(false)

  const [carregando, setCarregando] = useState<boolean>(false)

  // Seleções para Casamento Manual
  const [linhasSelecionadasIds, setLinhasSelecionadasIds] = useState<string[]>([])
  const [movimentosSelecionadosIds, setMovimentosSelecionadosIds] = useState<string[]>([])

  // Modal de Importação OFX
  const [modalImportarAberto, setModalImportarAberto] = useState<boolean>(false)
  const [arquivoNome, setArquivoNome] = useState<string>('')
  const [ofxParseado, setOfxParseado] = useState<HeaderOfxInfo | null>(null)
  const [avisoContaDivergente, setAvisoContaDivergente] = useState<string | null>(null)
  const [bloquearImportacao, setBloquearImportacao] = useState<boolean>(false)
  const [importando, setImportando] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Modal de Lançamento Avulso pré-preenchido
  const [modalAvulsoAberto, setModalAvulsoAberto] = useState<boolean>(false)
  const [dadosAvulsoLinha, setDadosAvulsoLinha] = useState<
    | {
        contaId?: string
        data?: string
        tipo?: 'Entrada' | 'Saída'
        valor?: number
        historico?: string
        linhaExtratoId?: string
      }
    | undefined
  >(undefined)

  // Carregar contas ativas da empresa
  useEffect(() => {
    if (empresaAtiva?.id) {
      listarContasFinanceiras({ empresa_id: empresaAtiva.id, situacao: 'ativos' }).then((res) => {
        setContas(res)
        if (res.length > 0 && !contaId) {
          const padrao = res.find((c) => c.tipo !== 'Caixa físico') || res[0]
          setContaId(padrao.id)
        }
      })
    }
  }, [empresaAtiva?.id])

  const contaAtual = useMemo(() => contas.find((c) => c.id === contaId), [contas, contaId])

  // Carregar dados da conciliação para a conta selecionada
  const carregarDados = useCallback(async () => {
    if (!empresaAtiva?.id || !contaId) return

    try {
      setCarregando(true)

      // 1. Linhas de extrato
      let filtroExtratos = `empresa_id = '${empresaAtiva.id}' && conta_financeira_id = '${contaId}' && ativo = true`
      if (filtroSituacaoExtrato !== 'Todas') {
        filtroExtratos += ` && situacao = '${filtroSituacaoExtrato}'`
      }

      const resExtratos = await pb.collection('extratos_linhas').getFullList<ExtratoLinha>({
        filter: filtroExtratos,
        sort: '-data,-created',
        requestKey: null,
      })
      setLinhasExtrato(resExtratos)

      // 2. Movimentos do sistema
      let filtroMov = `empresa_id = '${empresaAtiva.id}' && conta_financeira_id = '${contaId}' && ativo = true && estornado = false`
      if (!filtroMovimentosConciliados) {
        filtroMov += ` && conciliado = false`
      }

      const resMovimentos = await pb
        .collection('movimentacoes_financeiras')
        .getFullList<MovimentoExtratoItem>({
          filter: filtroMov,
          sort: '-data_movimento,-created',
          requestKey: null,
        })
      setMovimentosSistema(resMovimentos)

      // Limpa seleções manuais ao recarregar
      setLinhasSelecionadasIds([])
      setMovimentosSelecionadosIds([])
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar conciliação',
        description: err?.message || 'Falha ao buscar lançamentos.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, contaId, filtroSituacaoExtrato, filtroMovimentosConciliados])

  useEffect(() => {
    if (contaId) {
      carregarDados()
    }
  }, [contaId, carregarDados])

  // Manipular upload do arquivo OFX
  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoNome(file.name)
    setAvisoContaDivergente(null)
    setBloquearImportacao(false)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      try {
        const parsed = parseOFX(text)
        setOfxParseado(parsed)

        // Conferência contra a conta financeira escolhida
        if (contaAtual) {
          const numContaCadastrada = (contaAtual.conta || '').replace(/\D/g, '')
          const acctIdArquivo = (parsed.acctId || '').replace(/\D/g, '')

          if (acctIdArquivo && numContaCadastrada && !acctIdArquivo.includes(numContaCadastrada)) {
            setAvisoContaDivergente(
              `Atenção: A conta informada no arquivo (${parsed.acctId}) parece diferente do número cadastrado na conta (${contaAtual.conta}). Verifique antes de continuar.`,
            )
          }
        }
      } catch (err) {
        toast({
          title: 'Erro ao ler arquivo OFX',
          description: 'O arquivo não possui formato OFX legível.',
          variant: 'destructive',
        })
      }
    }
    reader.readAsText(file)
  }

  // Confirmar Importação OFX
  const handleConfirmarImportacao = async () => {
    if (!empresaAtiva?.id || !contaId || !ofxParseado) return

    if (ofxParseado.transacoes.length === 0) {
      toast({
        title: 'Arquivo sem transações',
        description: 'Não foram encontradas linhas de transação (STMTTRN) no arquivo selecionado.',
        variant: 'destructive',
      })
      return
    }

    try {
      setImportando(true)
      const res = await importarExtratoOfx({
        empresaId: empresaAtiva.id,
        contaFinanceiraId: contaId,
        arquivoNome,
        transacoes: ofxParseado.transacoes,
      })

      toast({
        title: 'Importação concluída',
        description: `${res.novasInseridas} transações novas importadas. ${res.ignoradasDuplicadas} já haviam sido importadas anteriormente (FITID duplicado).`,
      })

      setModalImportarAberto(false)
      setOfxParseado(null)
      setArquivoNome('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Recarrega os dados da conciliação
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro na importação',
        description: err?.message || 'Falha ao gravar linhas do extrato.',
        variant: 'destructive',
      })
    } finally {
      setImportando(false)
    }
  }

  // Executar Casamento Automático
  const handleCasamentoAutomatico = async () => {
    if (!empresaAtiva?.id || !contaId) return

    try {
      setCarregando(true)
      const res = await conciliarAutomaticamente({
        empresaId: empresaAtiva.id,
        contaFinanceiraId: contaId,
      })

      if (res.casamentosRealizados > 0) {
        toast({
          title: 'Conciliação Automática Concluída',
          description: `${res.casamentosRealizados} conciliações realizadas com sucesso.`,
        })
      } else {
        toast({
          title: 'Nenhum casamento encontrado',
          description:
            'Nenhuma linha pendente encontrou movimento correspondente (mesmo valor e data com até 3 dias de diferença).',
        })
      }

      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro no casamento automático',
        description: err?.message || 'Falha ao conciliar.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // Totais das Seleções Manuais
  const totalExtratoSelecionado = useMemo(() => {
    return linhasExtrato
      .filter((l) => linhasSelecionadasIds.includes(l.id))
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0)
  }, [linhasExtrato, linhasSelecionadasIds])

  const totalSistemaSelecionado = useMemo(() => {
    return movimentosSistema
      .filter((m) => movimentosSelecionadosIds.includes(m.id))
      .reduce((acc, m) => {
        const v = Number(m.valor) || 0
        return acc + (m.tipo === 'Entrada' ? v : -v)
      }, 0)
  }, [movimentosSistema, movimentosSelecionadosIds])

  const diferencaManual = useMemo(() => {
    return Number((totalExtratoSelecionado - totalSistemaSelecionado).toFixed(2))
  }, [totalExtratoSelecionado, totalSistemaSelecionado])

  const podeCasarManual =
    linhasSelecionadasIds.length > 0 &&
    movimentosSelecionadosIds.length > 0 &&
    Math.abs(diferencaManual) <= 0.009

  // Executar Casamento Manual
  const handleCasarManual = async () => {
    if (!podeCasarManual) return

    try {
      setCarregando(true)
      await conciliarManual({
        linhasIds: linhasSelecionadasIds,
        movimentosIds: movimentosSelecionadosIds,
      })

      toast({
        title: 'Conciliado com sucesso',
        description: 'Lançamentos casados com êxito.',
      })

      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro na conciliação',
        description: err?.message || 'Falha ao casar lançamentos selecionados.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // Desfazer Conciliação
  const handleDesfazerConciliacao = async (linha: ExtratoLinha) => {
    try {
      setCarregando(true)
      await desfazerConciliacao(linha.id)
      toast({
        title: 'Conciliação desfeita',
        description: 'Linha retornou para situação Pendente.',
      })
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao desfazer',
        description: err?.message || 'Falha ao desfazer conciliação.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // Alternar Ignorar Linha
  const handleAlternarIgnorar = async (linha: ExtratoLinha) => {
    const ignorar = linha.situacao !== 'Ignorada'
    try {
      setCarregando(true)
      await alternarIgnorarLinhaExtrato(linha.id, ignorar)
      toast({
        title: ignorar ? 'Linha ignorada' : 'Linha restaurada para pendente',
      })
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // Abrir Modal de Lançamento Avulso pré-preenchido
  const abrirCriarLancamentoParaLinha = (linha: ExtratoLinha) => {
    const tipo = linha.valor >= 0 ? 'Entrada' : 'Saída'
    setDadosAvulsoLinha({
      contaId,
      data: linha.data,
      tipo,
      valor: Math.abs(linha.valor),
      historico: linha.descricao,
      linhaExtratoId: linha.id,
    })
    setModalAvulsoAberto(true)
  }

  return (
    <div className="space-y-6">
      {/* Topo / Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-emerald-600" />
            Conciliação Bancária com OFX
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Importe seu extrato bancário, faça o cruzamento automático e case as sobras com o
            sistema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setModalImportarAberto(true)}
            className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UploadCloud className="w-4 h-4 mr-1.5" />
            Importar OFX
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCasamentoAutomatico}
            disabled={carregando || linhasExtrato.length === 0}
            className="text-xs h-9 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          >
            <CheckCheck className="w-4 h-4 mr-1.5 text-emerald-600" />
            Casamento Automático
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="text-xs h-9"
          >
            <RotateCcw className={`w-3.5 h-3.5 mr-1 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Seleção de Conta Bancária */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">Conta Financeira</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger className="text-xs h-9 bg-white">
                  <SelectValue placeholder="Selecione a conta..." />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} • {c.tipo} {c.banco_nome ? `(${c.banco_nome})` : ''} — Saldo: R${' '}
                      {Number(c.saldo_atual || 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex sm:justify-end gap-3 text-xs pt-3 sm:pt-0">
              <div className="bg-white px-3 py-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Saldo Sistema
                </span>
                <span className="font-mono font-bold text-slate-800 text-sm">
                  R$ {Number(contaAtual?.saldo_atual || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BARRA FIXA / FLUTUANTE DE CASAMENTO MANUAL QUANDO HOUVER ITENS SELECIONADOS */}
      {(linhasSelecionadasIds.length > 0 || movimentosSelecionadosIds.length > 0) && (
        <Card className="bg-blue-900 text-white shadow-lg border-none sticky top-2 z-20">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-blue-200">
                  Extrato Selecionado ({linhasSelecionadasIds.length}):
                </span>
                <span className="font-mono font-bold text-sm">
                  R$ {totalExtratoSelecionado.toFixed(2)}
                </span>
              </div>

              <div className="text-blue-300">•</div>

              <div className="flex items-center gap-1.5">
                <span className="text-blue-200">
                  Sistema Selecionado ({movimentosSelecionadosIds.length}):
                </span>
                <span className="font-mono font-bold text-sm">
                  R$ {totalSistemaSelecionado.toFixed(2)}
                </span>
              </div>

              <div className="text-blue-300">•</div>

              <div className="flex items-center gap-1.5">
                <span className="text-blue-200">Diferença:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    Math.abs(diferencaManual) <= 0.009 ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  R$ {diferencaManual.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLinhasSelecionadasIds([])
                  setMovimentosSelecionadosIds([])
                }}
                className="text-xs h-8 text-blue-200 hover:text-white hover:bg-blue-800"
              >
                Limpar Seleção
              </Button>
              <Button
                size="sm"
                onClick={handleCasarManual}
                disabled={!podeCasarManual || carregando}
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
              >
                <LinkIcon className="w-3.5 h-3.5 mr-1" />
                Casar Lançamentos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TELA EM DUAS COLUNAS: EXTRATO DO BANCO X MOVIMENTOS DO SISTEMA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLUNA 1: EXTRATO BANCÁRIO */}
        <Card className="border-slate-200 shadow-sm flex flex-col">
          <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/70 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                Extrato Bancário (OFX)
              </CardTitle>
              <p className="text-[11px] text-slate-500">
                {linhasExtrato.length} lançamentos encontrados
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={filtroSituacaoExtrato}
                onValueChange={(v) =>
                  setFiltroSituacaoExtrato(v as 'Pendente' | 'Conciliada' | 'Ignorada' | 'Todas')
                }
              >
                <SelectTrigger className="text-[11px] h-7 w-28 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendente">Pendentes</SelectItem>
                  <SelectItem value="Conciliada">Conciliadas</SelectItem>
                  <SelectItem value="Ignorada">Ignoradas</SelectItem>
                  <SelectItem value="Todas">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[600px] divide-y divide-slate-100">
            {linhasExtrato.length === 0 ? (
              <div className="text-center py-12 px-4 text-xs text-slate-500 space-y-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p>Nenhuma linha de extrato encontrada com o filtro selecionado.</p>
                <p className="text-[11px] text-slate-400">
                  Clique em &quot;Importar OFX&quot; para enviar o arquivo baixado do internet
                  banking.
                </p>
              </div>
            ) : (
              linhasExtrato.map((linha) => {
                const ehCredito = linha.valor >= 0
                const selecionado = linhasSelecionadasIds.includes(linha.id)
                const isPendente = linha.situacao === 'Pendente'

                return (
                  <div
                    key={linha.id}
                    className={`p-3 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${
                      selecionado ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {isPendente && (
                        <Checkbox
                          checked={selecionado}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setLinhasSelecionadasIds((prev) => [...prev, linha.id])
                            } else {
                              setLinhasSelecionadasIds((prev) =>
                                prev.filter((id) => id !== linha.id),
                              )
                            }
                          }}
                          className="mt-0.5"
                        />
                      )}

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500 text-[11px]">{linha.data}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] py-0 h-4 font-normal ${
                              linha.situacao === 'Conciliada'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : linha.situacao === 'Ignorada'
                                  ? 'bg-slate-100 text-slate-500 border-slate-300'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {linha.situacao}
                          </Badge>
                        </div>
                        <div className="font-medium text-slate-900 leading-snug">
                          {linha.descricao}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          FITID: {linha.fitid}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1 shrink-0">
                      <div
                        className={`font-mono font-bold text-sm ${
                          ehCredito ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {ehCredito ? '+' : ''} R$ {linha.valor.toFixed(2)}
                      </div>

                      {/* Ações da linha */}
                      <div className="flex items-center justify-end gap-1">
                        {isPendente && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirCriarLancamentoParaLinha(linha)}
                              className="h-6 px-1.5 text-[10px] text-emerald-700 hover:bg-emerald-50"
                              title="Criar lançamento avulso correspondente e casar"
                            >
                              <PlusCircle className="w-3 h-3 mr-1" />
                              Criar Lançamento
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAlternarIgnorar(linha)}
                              className="h-6 px-1.5 text-[10px] text-slate-500 hover:text-slate-800"
                              title="Ignorar esta linha"
                            >
                              <EyeOff className="w-3 h-3" />
                            </Button>
                          </>
                        )}

                        {linha.situacao === 'Conciliada' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDesfazerConciliacao(linha)}
                            className="h-6 px-1.5 text-[10px] text-amber-700 hover:bg-amber-50"
                            title="Desfazer conciliação desta linha"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Desfazer
                          </Button>
                        )}

                        {linha.situacao === 'Ignorada' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAlternarIgnorar(linha)}
                            className="h-6 px-1.5 text-[10px] text-blue-600 hover:bg-blue-50"
                            title="Restaurar para pendente"
                          >
                            Restaurar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* COLUNA 2: MOVIMENTOS DO SISTEMA (NÃO CONCILIADOS) */}
        <Card className="border-slate-200 shadow-sm flex flex-col">
          <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/70 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" />
                Movimentos do Sistema
              </CardTitle>
              <p className="text-[11px] text-slate-500">
                {movimentosSistema.length} lançamentos a conciliar
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                <Checkbox
                  checked={filtroMovimentosConciliados}
                  onCheckedChange={(c) => setFiltroMovimentosConciliados(Boolean(c))}
                />
                <span>Exibir conciliados</span>
              </label>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[600px] divide-y divide-slate-100">
            {movimentosSistema.length === 0 ? (
              <div className="text-center py-12 px-4 text-xs text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p>Todos os movimentos desta conta estão conciliados!</p>
                <p className="text-[11px] text-slate-400">
                  Marque &quot;Exibir conciliados&quot; para consultar o histórico completo.
                </p>
              </div>
            ) : (
              movimentosSistema.map((mov) => {
                const ehEntrada = mov.tipo === 'Entrada'
                const selecionado = movimentosSelecionadosIds.includes(mov.id)

                return (
                  <div
                    key={mov.id}
                    className={`p-3 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${
                      selecionado ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!mov.conciliado && (
                        <Checkbox
                          checked={selecionado}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setMovimentosSelecionadosIds((prev) => [...prev, mov.id])
                            } else {
                              setMovimentosSelecionadosIds((prev) =>
                                prev.filter((id) => id !== mov.id),
                              )
                            }
                          }}
                          className="mt-0.5"
                        />
                      )}

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500 text-[11px]">
                            {mov.data_movimento ? mov.data_movimento.slice(0, 10) : ''}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] py-0 h-4 font-normal ${
                              mov.conciliado
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {mov.conciliado ? 'Conciliado' : 'Pendente'}
                          </Badge>
                          {mov.documento_numero && (
                            <span className="text-[10px] text-slate-400">
                              #{mov.documento_numero}
                            </span>
                          )}
                        </div>

                        <div className="font-medium text-slate-900 leading-snug">
                          {mov.historico}
                        </div>

                        <div className="text-[10px] text-slate-400">Origem: {mov.origem}</div>
                      </div>
                    </div>

                    <div className="text-right space-y-1 shrink-0">
                      <div
                        className={`font-mono font-bold text-sm ${
                          ehEntrada ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {ehEntrada ? '+' : '-'} R$ {mov.valor.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL DE IMPORTAÇÃO DE EXTRATO OFX */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <UploadCloud className="w-5 h-5 text-blue-600" />
              Importar Extrato Bancário (OFX)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Selecione o arquivo .OFX ou .OFC gerado pelo seu internet banking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Conta de Destino</Label>
              <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-xs">
                <span className="font-bold text-slate-900">{contaAtual?.nome}</span> •{' '}
                {contaAtual?.banco_nome || 'Banco'} (Ag: {contaAtual?.agencia || '-'} / CC:{' '}
                {contaAtual?.conta || '-'})
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="arquivo_ofx_input" className="text-xs font-semibold text-slate-700">
                Arquivo .OFX
              </Label>
              <input
                id="arquivo_ofx_input"
                ref={fileInputRef}
                type="file"
                accept=".ofx,.ofc,text/plain"
                onChange={handleSelecionarArquivo}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-md p-1"
              />
            </div>

            {avisoContaDivergente && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{avisoContaDivergente}</span>
              </div>
            )}

            {ofxParseado && (
              <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-slate-800">Resumo da Leitura do Arquivo:</div>
                <div className="text-slate-600">
                  • Total de transações identificadas:{' '}
                  <span className="font-bold font-mono text-blue-700">
                    {ofxParseado.transacoes.length}
                  </span>
                </div>
                {ofxParseado.bankId && (
                  <div className="text-slate-600">
                    • Código Banco no Arquivo: {ofxParseado.bankId}
                  </div>
                )}
                {ofxParseado.acctId && (
                  <div className="text-slate-600">• Conta no Arquivo: {ofxParseado.acctId}</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalImportarAberto(false)}
              disabled={importando}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarImportacao}
              disabled={!ofxParseado || importando || bloquearImportacao}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {importando ? 'Importando...' : 'Confirmar Importação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE LANÇAMENTO AVULSO PARA LINHA SEM MOVIMENTO */}
      <ModalLancamentoAvulso
        aberto={modalAvulsoAberto}
        onOpenChange={setModalAvulsoAberto}
        dadosIniciais={dadosAvulsoLinha}
        onSucesso={async (novoMovimentoId) => {
          if (dadosAvulsoLinha?.linhaExtratoId && novoMovimentoId) {
            // Casa automaticamente a linha com o recém-lançado
            try {
              await conciliarManual({
                linhasIds: [dadosAvulsoLinha.linhaExtratoId],
                movimentosIds: [novoMovimentoId],
              })
              toast({
                title: 'Conciliado com sucesso',
                description: 'O lançamento avulso foi criado e já vinculado à linha do extrato.',
              })
            } catch (err: any) {
              console.error('Erro ao casar automático pós-criação:', err)
            }
          }
          carregarDados()
        }}
      />
    </div>
  )
}
export default ConciliacaoBancariaPage
