import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RotateCcw,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Printer,
  FileText,
  DollarSign,
  Ticket,
  CreditCard,
  Building2,
  Clock,
  ArrowRight,
  Send,
  Loader2,
  Download,
  ExternalLink,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { obterOuCriarConfigVendasEmpresa } from '@/services/configVendas'
import { obterVendaCompleta, listarVendas, Venda, VendaItem } from '@/services/vendas'
import {
  processarDevolucao,
  ItemDevolucaoInput,
  DestinoDevolucaoTipo,
  ResultadoDevolucao,
  listarValesTroca,
  ValeTroca,
  DevolucaoVendaRegistro,
} from '@/services/devolucoes'
import {
  emitirNfeDevolucaoVenda,
  confirmarAutorizacaoDevolucaoVenda,
  consultarSituacaoNFe,
  baixarArquivoFiscal,
} from '@/services/fiscalIntegracao'
import { obterDocumentoFiscalDaVenda, DocumentoFiscalRegistro } from '@/services/documentosFiscais'
import { ModalAutorizacaoSupervisor } from '@/components/ModalAutorizacaoSupervisor'
import pb from '@/lib/pocketbase/client'

export const TrocasDevolucoesPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const { toast } = useToast()

  const podeCriarVendas = pode('vendas', 'criar')
  const podeEmitirNotas = pode('notas_saida', 'criar')

  // Aba ativa: "Nova Troca/Devolução", "Histórico de Devoluções" ou "Histórico de Vales-Troca"
  const [abaAtiva, setAbaAtiva] = useState<'nova' | 'historico' | 'vales'>('nova')

  // Configuração da empresa (dias_para_troca)
  const [diasParaTroca, setDiasParaTroca] = useState<number>(30)

  // 1. Busca da venda original
  const [termoBusca, setTermoBusca] = useState('')
  const [dataBusca, setDataBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [vendasEncontradas, setVendasEncontradas] = useState<Venda[]>([])

  // Venda original selecionada para devolução
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null)
  const [itensVendaOriginal, setItensVendaOriginal] = useState<VendaItem[]>([])
  const [carregandoItens, setCarregandoItens] = useState(false)

  // Itens selecionados para devolver: Map<venda_item_id, quantidade_devolver>
  const [itensParaDevolver, setItensParaDevolver] = useState<Record<string, number>>({})

  // Destino do valor
  const [destino, setDestino] = useState<DestinoDevolucaoTipo>('vale_troca')
  const [diasValidadeVale, setDiasValidadeVale] = useState<number>(30)
  const [contaFinanceiraId, setContaFinanceiraId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [contasFinanceiras, setContasFinanceiras] = useState<Array<{ id: string; nome: string }>>(
    [],
  )

  // Controle de autorização do supervisor se prazo excedido
  const [prazoExcedido, setPrazoExcedido] = useState(false)
  const [diasCorridos, setDiasCorridos] = useState(0)
  const [supervisorAutorizado, setSupervisorAutorizado] = useState(false)
  const [modalSupervisorAberto, setModalSupervisorAberto] = useState(false)

  // Estado de processamento e modal de comprovante/impressão
  const [processando, setProcessando] = useState(false)
  const [resultadoSucesso, setResultadoSucesso] = useState<ResultadoDevolucao | null>(null)
  const [modalComprovanteAberto, setModalComprovanteAberto] = useState(false)

  // Listagem de vales-troca
  const [valesLista, setValesLista] = useState<ValeTroca[]>([])
  const [carregandoVales, setCarregandoVales] = useState(false)
  const [filtroValeStatus, setFiltroValeStatus] = useState('todos')
  const [filtroValeCodigo, setFiltroValeCodigo] = useState('')

  // 4. Fluxo de NF-e de entrada própria de devolução
  const [docFiscalVendaOrig, setDocFiscalVendaOrig] = useState<DocumentoFiscalRegistro | null>(null)
  const [modalConferenciaNFeAberto, setModalConferenciaNFeAberto] = useState(false)
  const [clienteAvulsoNome, setClienteAvulsoNome] = useState('')
  const [clienteAvulsoCpf, setClienteAvulsoCpf] = useState('')
  const [erroValidacaoClienteAvulso, setErroValidacaoClienteAvulso] = useState('')

  // Polling e estado de transmissão
  const [faseTransmissao, setFaseTransmissao] = useState<
    'idle' | 'enviando' | 'polling' | 'sucesso' | 'erro' | 'timeout' | 'denegado'
  >('idle')
  const [tempoPolling, setTempoPolling] = useState(0)
  const [mensagemTransmissao, setMensagemTransmissao] = useState('')
  const [modalTransmissaoAberto, setModalTransmissaoAberto] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Histórico de Devoluções
  const [devolucoesLista, setDevolucoesLista] = useState<DevolucaoVendaRegistro[]>([])
  const [carregandoDevolucoes, setCarregandoDevolucoes] = useState(false)
  const [devolucaoDetalhe, setDevolucaoDetalhe] = useState<DevolucaoVendaRegistro | null>(null)
  const [docFiscalDetalhe, setDocFiscalDetalhe] = useState<DocumentoFiscalRegistro | null>(null)
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false)
  const [reemitindoId, setReemitindoId] = useState<string | null>(null)
  const [baixandoXml, setBaixandoXml] = useState(false)

  // Carrega configurações da empresa e contas financeiras
  useEffect(() => {
    if (!empresaAtiva?.id) return
    obterOuCriarConfigVendasEmpresa(empresaAtiva.id)
      .then((cfg) => {
        setDiasParaTroca(cfg.dias_para_troca ?? 30)
      })
      .catch(() => setDiasParaTroca(30))

    pb.collection('contas_financeiras')
      .getFullList({
        filter: `empresa_id = '${empresaAtiva.id}' && ativo = true`,
        sort: 'nome',
      })
      .then((res) => {
        setContasFinanceiras(res.map((c) => ({ id: c.id, nome: (c as any).nome })))
        if (res.length > 0) setContaFinanceiraId(res[0].id)
      })
      .catch(() => setContasFinanceiras([]))
  }, [empresaAtiva?.id])

  // Busca vendas originais
  const handleBuscarVendas = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!empresaAtiva?.id) return

    setBuscando(true)
    try {
      const res = await listarVendas({
        empresa_id: empresaAtiva.id,
        status: 'Finalizada',
        termo_busca: termoBusca.trim() || undefined,
        data_inicio: dataBusca || undefined,
        data_fim: dataBusca || undefined,
        por_pagina: 15,
      })
      // Filtra para remover vendas do tipo Devolução da lista de origem
      setVendasEncontradas(res.items.filter((v) => v.tipo !== 'Devolução'))
    } catch {
      toast({
        title: 'Erro na busca',
        description: 'Não foi possível localizar as vendas.',
        variant: 'destructive',
      })
    } finally {
      setBuscando(false)
    }
  }

  // Ao selecionar uma venda original
  const handleSelecionarVenda = async (venda: Venda) => {
    setVendaSelecionada(venda)
    setCarregandoItens(true)
    setItensParaDevolver({})
    setSupervisorAutorizado(false)

    // Calcula diferença em dias da emissão
    const dtEmissao = new Date((venda.data_emissao || venda.created || '').slice(0, 10))
    const dtHoje = new Date(new Date().toISOString().slice(0, 10))
    const diffTime = dtHoje.getTime() - dtEmissao.getTime()
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
    setDiasCorridos(diffDays)

    const excedeu = diffDays > diasParaTroca
    setPrazoExcedido(excedeu)

    try {
      const comp = await obterVendaCompleta(venda.id)
      setItensVendaOriginal(comp.itens)

      // Se a venda tem status fiscal Autorizada, carregar documento fiscal para conferência
      if (venda.documento_fiscal_status === 'Autorizada') {
        let doc = null
        if (venda.documento_fiscal_id) {
          try {
            doc = await pb
              .collection('documentos_fiscais')
              .getOne<DocumentoFiscalRegistro>(venda.documento_fiscal_id)
          } catch {
            /* intentionally ignored */
          }
        }
        if (!doc) {
          doc = await obterDocumentoFiscalDaVenda(venda.id, '55')
          if (!doc) {
            doc = await obterDocumentoFiscalDaVenda(venda.id, '65')
          }
        }
        setDocFiscalVendaOrig(doc)

        // Se venda não tem cliente vinculado, pré-popular ou limpar campos avulsos
        const nomeCli =
          (venda.expand as any)?.cliente_id?.nome_razao_social ||
          (venda.expand as any)?.cliente_id?.nome ||
          doc?.destinatario_nome ||
          ''
        const cpfCli =
          venda.cpf_cnpj_consumidor ||
          (venda.expand as any)?.cliente_id?.cpf_cnpj ||
          doc?.destinatario_cpf_cnpj ||
          ''
        setClienteAvulsoNome(nomeCli)
        setClienteAvulsoCpf(cpfCli)
      } else {
        setDocFiscalVendaOrig(null)
      }
    } catch {
      toast({
        title: 'Erro ao carregar itens',
        description: 'Falha ao buscar os itens da venda selecionada.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoItens(false)
    }
  }

  // Manipular quantidade a devolver de um item
  const handleAlterarQtdItem = (itemId: string, maximo: number, valorStr: string) => {
    const num = parseFloat(valorStr.replace(',', '.'))
    if (isNaN(num) || num <= 0) {
      const copy = { ...itensParaDevolver }
      delete copy[itemId]
      setItensParaDevolver(copy)
      return
    }
    const valFinal = Math.min(maximo, Math.max(0, num))
    setItensParaDevolver((prev) => ({
      ...prev,
      [itemId]: valFinal,
    }))
  }

  // Resumo de valores dos itens selecionados para devolução
  const resumoDevolucao = useMemo(() => {
    let valorTotal = 0
    let totalItens = 0
    const listaItensInput: ItemDevolucaoInput[] = []

    itensVendaOriginal.forEach((it) => {
      const qtdDev = itensParaDevolver[it.id] || 0
      if (qtdDev > 0) {
        totalItens += qtdDev
        const precoUnit = Number(it.preco_unitario) || 0
        const qtdVendida = Number(it.quantidade) || 1
        const descTot = Number(it.desconto_valor) || 0
        const descUnit = qtdVendida > 0 ? descTot / qtdVendida : 0
        const unitLiq = Math.max(0, precoUnit - descUnit)
        const subtotal = Number((qtdDev * unitLiq).toFixed(2))
        valorTotal += subtotal

        listaItensInput.push({
          venda_item_id: it.id,
          produto_id: it.produto_id,
          descricao: it.descricao,
          unidade: it.unidade || 'UN',
          quantidade: qtdDev,
          preco_unitario: unitLiq,
          custo_unitario: Number(it.custo_unitario) || 0,
          lote_id: it.lote_id || undefined,
        })
      }
    })

    return {
      valorTotal: Number(valorTotal.toFixed(2)),
      totalItens,
      itensInput: listaItensInput,
    }
  }, [itensVendaOriginal, itensParaDevolver])

  // Executa polling da situação da NF-e na SEFAZ (a cada 3s por até 30s)
  const iniciarPollingNfe = useCallback(
    (documentoId: string, devolucaoId: string) => {
      setFaseTransmissao('polling')
      setTempoPolling(0)
      setMensagemTransmissao('Consultando autorização na SEFAZ...')

      let tentativas = 0
      const maxTentativas = 10 // 10 * 3s = 30s

      if (pollingRef.current) clearInterval(pollingRef.current)

      pollingRef.current = setInterval(async () => {
        tentativas++
        setTempoPolling(tentativas * 3)

        try {
          const resConsulta = await consultarSituacaoNFe({ documento_id: documentoId })

          if (resConsulta.status === 'Autorizada') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setFaseTransmissao('sucesso')
            setMensagemTransmissao(
              `NF-e autorizada pela SEFAZ! Chave: ${resConsulta.chave || '-'}. Confirmando movimentações...`,
            )

            // Chamar confirmação de autorização para movimentar estoque e financeiro
            try {
              const resConf = await confirmarAutorizacaoDevolucaoVenda({
                devolucao_id: devolucaoId,
                documento_id: documentoId,
                destino,
                dias_validade_vale: destino === 'vale_troca' ? diasValidadeVale : undefined,
                conta_financeira_id: destino === 'dinheiro_volta' ? contaFinanceiraId : undefined,
              })

              setMensagemTransmissao(
                `Devolução concluída com sucesso! ${
                  resConf.vale_troca_codigo ? `Vale gerado: ${resConf.vale_troca_codigo}` : ''
                }`,
              )
              toast({
                title: 'NF-e Autorizada e Devolução Concluída!',
                description: `Estoque e financeiro movimentados. NF-e nº ${resConsulta.numero || ''}.`,
              })

              // Limpar seleção
              setVendaSelecionada(null)
              setItensVendaOriginal([])
              setItensParaDevolver({})
              setModalConferenciaNFeAberto(false)
            } catch (errConf: any) {
              setMensagemTransmissao(
                `Nota autorizada, mas ocorreu erro na finalização: ${errConf?.message || 'Falha'}`,
              )
            }
          } else if (resConsulta.status === 'Rejeitada') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setFaseTransmissao('erro')
            const motivo =
              resConsulta.mensagem_sefaz || resConsulta.message || 'Nota rejeitada pela SEFAZ'
            setMensagemTransmissao(
              `Rejeição da SEFAZ: ${motivo}. Devolução mantida como "Pendente de nota".`,
            )
            toast({
              title: 'NF-e Rejeitada pela SEFAZ',
              description: motivo,
              variant: 'destructive',
            })
          } else if (resConsulta.status === 'Denegada') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setFaseTransmissao('denegado')
            const motivo =
              resConsulta.mensagem_sefaz || resConsulta.message || 'Uso denegado pela SEFAZ'
            setMensagemTransmissao(
              `Aviso: Nota DENEGADA pela SEFAZ. ${motivo}. Nota fiscal denegada não pode ser reutilizada nem cancelada.`,
            )
            toast({
              title: 'NF-e Denegada pela SEFAZ',
              description: 'Nota fiscal denegada não pode ser reutilizada.',
              variant: 'destructive',
            })
          } else if (tentativas >= maxTentativas) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setFaseTransmissao('timeout')
            setMensagemTransmissao(
              'A SEFAZ ainda está processando a nota fiscal. A devolução permanece como "Pendente de nota" e será atualizada automaticamente na próxima consulta.',
            )
            toast({
              title: 'Processamento em andamento',
              description:
                'O retorno da SEFAZ demorou mais de 30s. Acompanhe a devolução na lista para reconsultar.',
            })
          }
        } catch (errQuery: any) {
          if (tentativas >= maxTentativas) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setFaseTransmissao('timeout')
            setMensagemTransmissao('Tempo limite atingido. A devolução segue pendente de nota.')
          }
        }
      }, 3000)
    },
    [destino, diasValidadeVale, contaFinanceiraId, toast],
  )

  // Ao fechar ou desmontar, limpar polling
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Submissão do processamento da devolução
  const handleConfirmarDevolucao = async () => {
    if (!empresaAtiva?.id || !vendaSelecionada) return
    if (resumoDevolucao.itensInput.length === 0) {
      toast({
        title: 'Nenhum item selecionado',
        description: 'Informe ao menos uma quantidade para devolução.',
        variant: 'destructive',
      })
      return
    }

    // Prazo excedido sem autorização
    if (prazoExcedido && !supervisorAutorizado) {
      setModalSupervisorAberto(true)
      return
    }

    // Venda original tem nota fiscal autorizada (NF-e ou NFC-e)?
    const temNotaAutorizada = vendaSelecionada.documento_fiscal_status === 'Autorizada'

    if (temNotaAutorizada) {
      // Abre modal de conferência da NF-e de entrada própria antes de processar
      setErroValidacaoClienteAvulso('')
      setModalConferenciaNFeAberto(true)
      return
    }

    // Venda original SEM nota autorizada: fluxo atual inalterado, sem nota
    setProcessando(true)
    try {
      const res = await processarDevolucao({
        empresa_id: empresaAtiva.id,
        venda_origem_id: vendaSelecionada.id,
        itens: resumoDevolucao.itensInput,
        destino,
        observacao,
        conta_financeira_id: destino === 'dinheiro_volta' ? contaFinanceiraId : undefined,
        dias_validade_vale: destino === 'vale_troca' ? diasValidadeVale : undefined,
      })

      setResultadoSucesso(res)
      setModalComprovanteAberto(true)

      toast({
        title: 'Devolução concluída com sucesso!',
        description: `Devolução #${res.numero_devolucao} registrada.`,
      })

      // Limpar formulário de devolução
      setVendaSelecionada(null)
      setItensVendaOriginal([])
      setItensParaDevolver({})
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar devolução.'
      toast({
        title: 'Erro na devolução',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
    }
  }

  // Confirma e emite a NF-e de devolução de venda
  const handleConfirmarEEmitirNFe = async () => {
    if (!empresaAtiva?.id || !vendaSelecionada) return

    // Validação de cliente quando a venda não tem cliente vinculado
    const clienteId = vendaSelecionada.cliente_id
    let nomeFinal = clienteAvulsoNome.trim()
    let cpfFinal = clienteAvulsoCpf.replace(/\D/g, '')

    if (!clienteId && (!nomeFinal || !cpfFinal)) {
      setErroValidacaoClienteAvulso('Nome e CPF do cliente são obrigatórios para emissão da NF-e.')
      return
    }
    if (cpfFinal && cpfFinal.length !== 11 && cpfFinal.length !== 14) {
      setErroValidacaoClienteAvulso('CPF ou CNPJ inválido (deve conter 11 ou 14 dígitos).')
      return
    }

    setProcessando(true)
    setFaseTransmissao('enviando')
    setMensagemTransmissao('Criando registro de devolução pendente de nota...')
    setModalTransmissaoAberto(true)

    try {
      // 1. Criar devolução com status 'Pendente de nota' (sem tocar estoque nem financeiro)
      const resDev = await processarDevolucao({
        empresa_id: empresaAtiva.id,
        venda_origem_id: vendaSelecionada.id,
        itens: resumoDevolucao.itensInput,
        destino,
        observacao,
        conta_financeira_id: destino === 'dinheiro_volta' ? contaFinanceiraId : undefined,
        dias_validade_vale: destino === 'vale_troca' ? diasValidadeVale : undefined,
        com_emissao_nfe: true,
      })

      const devolucaoId = resDev.venda_devolucao_id

      setMensagemTransmissao('Transmitindo NF-e de devolução para a SEFAZ...')

      // 2. Transmitir NF-e para a Focus NFe
      const resEnvio = await emitirNfeDevolucaoVenda({
        devolucao_id: devolucaoId,
        cliente_nome: nomeFinal || undefined,
        cliente_cpf: cpfFinal || undefined,
      })

      if (!resEnvio.sucesso && resEnvio.status === 'Rejeitada') {
        setFaseTransmissao('erro')
        setMensagemTransmissao(`Rejeição: ${resEnvio.message || 'Erro na transmissão'}`)
        return
      }

      if (resEnvio.ja_autorizada) {
        setFaseTransmissao('sucesso')
        setMensagemTransmissao('NF-e já estava autorizada. Confirmando devolução...')
        await confirmarAutorizacaoDevolucaoVenda({
          devolucao_id: devolucaoId,
          documento_id: resEnvio.documento_id || '',
          destino,
          dias_validade_vale: destino === 'vale_troca' ? diasValidadeVale : undefined,
          conta_financeira_id: destino === 'dinheiro_volta' ? contaFinanceiraId : undefined,
        })
        setMensagemTransmissao('Devolução autorizada e finalizada com sucesso!')
        return
      }

      const docId = resEnvio.documento_id
      if (docId) {
        // 3. Polling de consultarSituacaoNFe a cada 3s por até 30s
        iniciarPollingNfe(docId, devolucaoId)
      } else {
        setFaseTransmissao('timeout')
        setMensagemTransmissao('Nota transmitida. Acompanhe a autorização na lista de devoluções.')
      }
    } catch (err: any) {
      setFaseTransmissao('erro')
      setMensagemTransmissao(`Erro: ${err?.message || 'Falha ao emitir NF-e de devolução.'}`)
    } finally {
      setProcessando(false)
    }
  }

  // Reenviar emissão de devolução que ficou "Pendente de nota"
  const handleTentarDeNovo = async (dev: DevolucaoVendaRegistro) => {
    setReemitindoId(dev.id)
    setFaseTransmissao('enviando')
    setMensagemTransmissao(`Reenviando NF-e da Devolução #${dev.numero}...`)
    setModalTransmissaoAberto(true)

    try {
      const resEnvio = await emitirNfeDevolucaoVenda({
        devolucao_id: dev.id,
      })

      if (!resEnvio.sucesso && resEnvio.status === 'Rejeitada') {
        setFaseTransmissao('erro')
        setMensagemTransmissao(`Rejeição da SEFAZ: ${resEnvio.message || 'Falha no envio'}`)
        carregarDevolucoes()
        return
      }

      if (resEnvio.ja_autorizada) {
        setFaseTransmissao('sucesso')
        setMensagemTransmissao('NF-e já está autorizada na SEFAZ. Finalizando devolução...')
        await confirmarAutorizacaoDevolucaoVenda({
          devolucao_id: dev.id,
          documento_id: resEnvio.documento_id || dev.documento_fiscal_id || '',
        })
        carregarDevolucoes()
        return
      }

      const docId = resEnvio.documento_id || dev.documento_fiscal_id
      if (docId) {
        iniciarPollingNfe(docId, dev.id)
      } else {
        setFaseTransmissao('timeout')
        setMensagemTransmissao('NF-e transmitida. Consulte a situação em instantes.')
      }
    } catch (err: any) {
      setFaseTransmissao('erro')
      setMensagemTransmissao(`Erro ao reenviar: ${err?.message || 'Falha na comunicação.'}`)
    } finally {
      setReemitindoId(null)
      carregarDevolucoes()
    }
  }

  // Carregar histórico de devoluções
  const carregarDevolucoes = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregandoDevolucoes(true)
    try {
      const res = await pb.collection('vendas').getList<DevolucaoVendaRegistro>(1, 50, {
        filter: `empresa_id = '${empresaAtiva.id}' && tipo = 'Devolução' && ativo = true`,
        sort: '-created',
        expand: 'venda_origem_id,cliente_id,documento_fiscal_id',
      })
      setDevolucoesLista(res.items)
    } catch {
      //
    } finally {
      setCarregandoDevolucoes(false)
    }
  }, [empresaAtiva?.id])

  useEffect(() => {
    if (abaAtiva === 'historico') {
      carregarDevolucoes()
    }
  }, [abaAtiva, carregarDevolucoes])

  // Abrir detalhe da devolução
  const handleAbrirDetalheDevolucao = async (dev: DevolucaoVendaRegistro) => {
    setDevolucaoDetalhe(dev)
    setDocFiscalDetalhe(null)
    setModalDetalheAberto(true)

    // Se possui documento fiscal vinculado, carregar registro detalhado
    if (dev.documento_fiscal_id) {
      try {
        const doc = await pb
          .collection('documentos_fiscais')
          .getOne<DocumentoFiscalRegistro>(dev.documento_fiscal_id)
        setDocFiscalDetalhe(doc)
      } catch {
        //
      }
    } else {
      // Tentar buscar por devolucao_venda_id
      try {
        const docs = await pb
          .collection('documentos_fiscais')
          .getList<DocumentoFiscalRegistro>(1, 1, {
            filter: `devolucao_venda_id = '${dev.id}'`,
            sort: '-created',
          })
        if (docs.items.length > 0) {
          setDocFiscalDetalhe(docs.items[0])
        }
      } catch {
        //
      }
    }
  }

  // Baixar XML da nota fiscal
  const handleBaixarXml = async (docId?: string) => {
    if (!docId && !docFiscalDetalhe?.id) return
    const idFinal = docId || docFiscalDetalhe?.id || ''
    if (!empresaAtiva?.id || !idFinal) return

    setBaixandoXml(true)
    try {
      const res = await baixarArquivoFiscal({
        empresaId: empresaAtiva.id,
        caminho: `documentos_fiscais/${idFinal}/xml`,
      })

      if (res.sucesso && res.conteudo) {
        const blob = new Blob([res.conteudo], { type: 'application/xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `nfe_devolucao_${docFiscalDetalhe?.numero || idFinal}.xml`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast({ title: 'Download concluído', description: 'Arquivo XML baixado com sucesso.' })
      } else {
        // Fallback para arquivo anexado no PocketBase se existir
        if (docFiscalDetalhe?.xml_arquivo) {
          const urlPb = pb.files.getURL(docFiscalDetalhe, docFiscalDetalhe.xml_arquivo)
          window.open(urlPb, '_blank')
        } else {
          toast({
            title: 'XML não disponível',
            description: res.message || 'Arquivo XML ainda não disponível na SEFAZ.',
            variant: 'destructive',
          })
        }
      }
    } catch (err: any) {
      if (docFiscalDetalhe?.xml_arquivo) {
        const urlPb = pb.files.getURL(docFiscalDetalhe, docFiscalDetalhe.xml_arquivo)
        window.open(urlPb, '_blank')
      } else {
        toast({
          title: 'Erro no download',
          description: err?.message || 'Falha ao baixar XML da NF-e.',
          variant: 'destructive',
        })
      }
    } finally {
      setBaixandoXml(false)
    }
  }

  // Carregar vales-troca
  const carregarVales = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregandoVales(true)
    try {
      const res = await listarValesTroca({
        empresaId: empresaAtiva.id,
        status: filtroValeStatus,
        termoBusca: filtroValeCodigo || undefined,
      })
      setValesLista(res.items)
    } catch {
      //
    } finally {
      setCarregandoVales(false)
    }
  }, [empresaAtiva?.id, filtroValeStatus, filtroValeCodigo])

  useEffect(() => {
    if (abaAtiva === 'vales') {
      carregarVales()
    }
  }, [abaAtiva, carregarVales])

  // Impressão do comprovante do Vale-Troca
  const handleImprimirVale = (vale: ValeTroca) => {
    const janela = window.open('', '_blank', 'width=450,height=600')
    if (!janela) return
    const clienteNome = (vale.expand as any)?.cliente_id?.nome || 'Portador'

    janela.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vale-Troca ${vale.codigo}</title>
        <style>
          body { font-family: monospace; font-size: 13px; margin: 20px; line-height: 1.4; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .border { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; margin: 12px 0; }
          .code { font-size: 20px; letter-spacing: 2px; text-align: center; font-weight: bold; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="center bold">${empresaAtiva?.nome_fantasia || 'ERP COMERCIAL'}</div>
        <div class="center">COMPROVANTE DE VALE-TROCA</div>
        <div class="border">
          <div><strong>Código:</strong></div>
          <div class="code">${vale.codigo}</div>
          <div><strong>Valor Original:</strong> R$ ${Number(vale.valor).toFixed(2)}</div>
          <div><strong>Saldo Atual:</strong> R$ ${Number(vale.saldo).toFixed(2)}</div>
          <div><strong>Cliente:</strong> ${clienteNome}</div>
          <div><strong>Validade:</strong> ${vale.validade ? new Date(vale.validade + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem expiração'}</div>
          <div><strong>Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="center" style="font-size: 11px;">
          Apresente este vale no caixa para abater em novas compras no PDV ou Balcão.
        </div>
        <script>
          window.print();
        </script>
      </body>
      </html>
    `)
    janela.document.close()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <RotateCcw className="h-7 w-7 text-blue-600" />
            Trocas e Devoluções de Vendas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Reintegração ao estoque, emissão de vale-troca, estorno financeiro e abatimento de
            crediário.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={abaAtiva === 'nova' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAbaAtiva('nova')}
            className="text-xs h-9"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Nova Devolução
          </Button>

          <Button
            variant={abaAtiva === 'historico' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAbaAtiva('historico')}
            className="text-xs h-9"
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Histórico de Devoluções
          </Button>

          <Button
            variant={abaAtiva === 'vales' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAbaAtiva('vales')}
            className="text-xs h-9"
          >
            <Ticket className="h-3.5 w-3.5 mr-1.5" />
            Vales-Troca Emitidos
          </Button>
        </div>
      </div>

      {abaAtiva === 'nova' ? (
        <div className="space-y-6">
          {/* PASSO 1: Buscar a venda original */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-600" />
                1. Localizar Venda Original
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Busque pelo número da venda, cliente ou data de emissão. Prazo padrão de troca da
                empresa: <strong>{diasParaTroca} dias</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleBuscarVendas} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Número da Venda ou Cliente
                  </Label>
                  <Input
                    placeholder="Ex: 1042 ou nome do cliente..."
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <div className="w-[180px] space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Data da Venda</Label>
                  <Input
                    type="date"
                    value={dataBusca}
                    onChange={(e) => setDataBusca(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={buscando}
                  className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  {buscando ? 'Buscando...' : 'Buscar'}
                </Button>
              </form>

              {/* Lista de Vendas Encontradas */}
              {vendasEncontradas.length > 0 && !vendaSelecionada && (
                <div className="border border-slate-200 rounded-md overflow-hidden mt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">Venda #</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Cliente</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Total (R$)</TableHead>
                        <TableHead className="text-xs text-center w-24">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendasEncontradas.map((v) => {
                        const clienteNome =
                          (v.expand as any)?.cliente_id?.nome_razao_social ||
                          (v.expand as any)?.cliente_id?.nome ||
                          v.cpf_cnpj_consumidor ||
                          'Consumidor'
                        return (
                          <TableRow key={v.id} className="hover:bg-blue-50/40">
                            <TableCell className="text-xs font-semibold font-mono">
                              #{v.numero}
                            </TableCell>
                            <TableCell className="text-xs">
                              {v.data_emissao
                                ? new Date(v.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
                                : '-'}
                            </TableCell>
                            <TableCell className="text-xs">{clienteNome}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">
                                {v.tipo}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono font-medium">
                              R$ {Number(v.valor_total).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSelecionarVenda(v)}
                                className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8"
                              >
                                Selecionar
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PASSO 2: Itens da venda selecionada e seleção das quantidades devolvidas */}
          {vendaSelecionada && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      2. Venda #{vendaSelecionada.numero} Selecionada
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Escolha os itens e as quantidades devolvidas. A quantidade máxima é o saldo
                      não devolvido.
                    </CardDescription>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVendaSelecionada(null)}
                    className="text-xs h-8"
                  >
                    Trocar Venda
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Alerta de Prazo Excedido */}
                {prazoExcedido && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-xs text-amber-900">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Prazo de troca excedido ({diasCorridos} dias corridos desde a emissão /
                        limite: {diasParaTroca} dias).
                      </p>
                      <p className="text-[11px] text-amber-700">
                        {supervisorAutorizado ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Autorização de supervisor concedida com sucesso.
                          </span>
                        ) : (
                          'A conclusão desta troca/devolução exigirá autorização de um supervisor com senha.'
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tabela de Itens da Venda */}
                {carregandoItens ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Carregando itens...</p>
                ) : (
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Qtd Vendida</TableHead>
                          <TableHead className="text-xs text-right">Já Devolvida</TableHead>
                          <TableHead className="text-xs text-right">Saldo Disp.</TableHead>
                          <TableHead className="text-xs text-right">Preço Líq. (R$)</TableHead>
                          <TableHead className="text-xs text-center w-36">Qtd a Devolver</TableHead>
                          <TableHead className="text-xs text-right">Subtotal (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensVendaOriginal.map((it) => {
                          const qtdVendida = Number(it.quantidade) || 0
                          const qtdJaDevolvida = Number(it.quantidade_devolvida) || 0
                          const saldoDevolvivel = Math.max(0, qtdVendida - qtdJaDevolvida)
                          const qtdDevolver = itensParaDevolver[it.id] || 0

                          const precoUnit = Number(it.preco_unitario) || 0
                          const descTot = Number(it.desconto_valor) || 0
                          const descUnit = qtdVendida > 0 ? descTot / qtdVendida : 0
                          const unitLiq = Math.max(0, precoUnit - descUnit)
                          const subtotal = Number((qtdDevolver * unitLiq).toFixed(2))

                          return (
                            <TableRow key={it.id}>
                              <TableCell className="text-xs font-medium">
                                <div>{it.descricao}</div>
                                {it.expand?.lote_id && (
                                  <span className="text-[10px] text-slate-400">
                                    Lote: {it.expand.lote_id.numero_lote}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {qtdVendida} {it.unidade}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono text-slate-500">
                                {qtdJaDevolvida}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono font-semibold text-blue-600">
                                {saldoDevolvivel}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                R$ {unitLiq.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Input
                                  type="number"
                                  min={0}
                                  max={saldoDevolvivel}
                                  step={it.unidade === 'UN' ? 1 : 0.001}
                                  disabled={saldoDevolvivel <= 0}
                                  value={itensParaDevolver[it.id] ?? ''}
                                  onChange={(e) =>
                                    handleAlterarQtdItem(it.id, saldoDevolvivel, e.target.value)
                                  }
                                  placeholder="0"
                                  className="text-xs h-8 w-24 mx-auto text-center font-mono"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono font-bold">
                                R$ {subtotal.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* PASSO 3: Destino do valor e confirmação */}
          {vendaSelecionada && resumoDevolucao.itensInput.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  3. Destino do Valor (R$ {resumoDevolucao.valorTotal.toFixed(2)})
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Defina como o cliente receberá a compensação da devolução.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Opção 1: Vale-troca */}
                  <div
                    onClick={() => setDestino('vale_troca')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'vale_troca'
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <Ticket className="h-4 w-4 text-blue-600" />
                      Vale-Troca (Crédito Loja)
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Gera um código único de cupom com validade configurável para abatimento em
                      compras no PDV ou Balcão.
                    </p>
                  </div>

                  {/* Opção 2: Dinheiro de volta */}
                  <div
                    onClick={() => setDestino('dinheiro_volta')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'dinheiro_volta'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      Dinheiro de Volta (Caixa/Banco)
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Registra saída avulsa no caixa físico ou conta bancária na conta analítica
                      2.2.05 (Devoluções de vendas).
                    </p>
                  </div>

                  {/* Opção 3: Abater do crediário */}
                  <div
                    onClick={() => setDestino('abater_crediario')}
                    className={`cursor-pointer p-4 rounded-lg border text-left transition-all ${
                      destino === 'abater_crediario'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 mb-1">
                      <CreditCard className="h-4 w-4 text-indigo-600" />
                      Abater do Crediário
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Concede desconto/baixa direta nos títulos em aberto no Contas a Receber da
                      própria venda original.
                    </p>
                  </div>
                </div>

                {/* Campos adicionais por tipo de destino */}
                {destino === 'vale_troca' && (
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 max-w-sm space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Validade do Vale (dias)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={diasValidadeVale}
                      onChange={(e) => setDiasValidadeVale(Number(e.target.value) || 30)}
                      className="text-xs h-8 bg-white w-32"
                    />
                  </div>
                )}

                {destino === 'dinheiro_volta' && (
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 max-w-sm space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Conta Financeira de Saída
                    </Label>
                    <select
                      value={contaFinanceiraId}
                      onChange={(e) => setContaFinanceiraId(e.target.value)}
                      className="text-xs h-8 w-full bg-white border border-slate-200 rounded px-2"
                    >
                      {contasFinanceiras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Motivo / Observação da Devolução
                  </Label>
                  <Input
                    placeholder="Ex: Produto com defeito de fabricação ou tamanho incorreto..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="text-xs h-9 bg-white"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs text-slate-600">
                    Total a Devolver:
                    <span className="text-base font-bold text-slate-900 ml-2 font-mono">
                      R$ {resumoDevolucao.valorTotal.toFixed(2)}
                    </span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      processando ||
                      !podeCriarVendas ||
                      (vendaSelecionada?.documento_fiscal_status === 'Autorizada' &&
                        !podeEmitirNotas)
                    }
                    onClick={handleConfirmarDevolucao}
                    className={`text-xs h-9 text-white gap-2 ${
                      vendaSelecionada?.documento_fiscal_status === 'Autorizada'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {vendaSelecionada?.documento_fiscal_status === 'Autorizada' ? (
                      <>
                        <Send className="h-4 w-4" />
                        <span>{processando ? 'Processando...' : 'Conferir e Emitir NF-e'}</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        <span>{processando ? 'Processando...' : 'Finalizar Devolução'}</span>
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : abaAtiva === 'historico' ? (
        /* ABA 2: Histórico de Devoluções de Vendas */
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Histórico de Devoluções de Venda
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Consulte devoluções finalizadas e com status &quot;Pendente de nota&quot; com
                  opção de reenvio fiscal.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={carregarDevolucoes}
                disabled={carregandoDevolucoes}
                className="text-xs h-8 gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${carregandoDevolucoes ? 'animate-spin' : ''}`}
                />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {carregandoDevolucoes ? (
              <p className="text-xs text-slate-400 py-6 text-center">Carregando devoluções...</p>
            ) : devolucoesLista.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhuma devolução de venda registrada nesta empresa.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Devolução #</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Venda Origem</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs text-right">Total (R$)</TableHead>
                      <TableHead className="text-xs text-center">Situação</TableHead>
                      <TableHead className="text-xs">Nota Fiscal</TableHead>
                      <TableHead className="text-xs text-center w-36">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devolucoesLista.map((dev) => {
                      const clienteNome =
                        (dev.expand as any)?.cliente_id?.nome_razao_social ||
                        (dev.expand as any)?.cliente_id?.nome ||
                        dev.cpf_cnpj_consumidor ||
                        'Consumidor'
                      const numOrig = (dev.expand as any)?.venda_origem_id?.numero
                      const doc = (dev.expand as any)?.documento_fiscal_id
                      const ehPendente = dev.status === 'Pendente de nota'

                      return (
                        <TableRow
                          key={dev.id}
                          className={ehPendente ? 'bg-amber-50/40' : undefined}
                        >
                          <TableCell className="text-xs font-mono font-bold text-slate-900">
                            #{dev.numero}
                          </TableCell>
                          <TableCell className="text-xs">
                            {dev.created ? new Date(dev.created).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {numOrig ? `#${numOrig}` : '-'}
                          </TableCell>
                          <TableCell className="text-xs">{clienteNome}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold">
                            R$ {Number(dev.valor_total).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {ehPendente ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-100 text-amber-800 border-amber-300"
                              >
                                Pendente de nota
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300"
                              >
                                {dev.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {doc?.numero ? (
                              <div className="font-mono text-[11px]">
                                NF-e nº {doc.numero} (Série {doc.serie || '1'})
                              </div>
                            ) : dev.documento_fiscal_status ? (
                              <Badge variant="outline" className="text-[10px]">
                                {dev.documento_fiscal_status}
                              </Badge>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                            {ehPendente && dev.motivo_cancelamento && (
                              <div
                                className="text-[10px] text-red-600 line-clamp-1 mt-0.5"
                                title={dev.motivo_cancelamento}
                              >
                                Motivo: {dev.motivo_cancelamento}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {ehPendente && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={reemitindoId === dev.id || !podeEmitirNotas}
                                  onClick={() => handleTentarDeNovo(dev)}
                                  title="Tentar de novo a emissão da NF-e"
                                  className="text-xs h-7 px-2 text-amber-700 border-amber-300 hover:bg-amber-100 bg-amber-50"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 mr-1 ${
                                      reemitindoId === dev.id ? 'animate-spin' : ''
                                    }`}
                                  />
                                  Tentar de novo
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAbrirDetalheDevolucao(dev)}
                                title="Ver Detalhes"
                                className="text-xs h-7 px-2 text-slate-700"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Detalhe
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ABA 3: Vales-Troca Emitidos */
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-blue-600" />
                  Vales-Troca Registrados
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Consulte os cupons de crédito loja emitidos para clientes e seus saldos.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filtrar por código..."
                  value={filtroValeCodigo}
                  onChange={(e) => setFiltroValeCodigo(e.target.value)}
                  className="text-xs h-8 w-40 bg-white"
                />
                <select
                  value={filtroValeStatus}
                  onChange={(e) => setFiltroValeStatus(e.target.value)}
                  className="text-xs h-8 bg-white border border-slate-200 rounded px-2"
                >
                  <option value="todos">Todos status</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Usado">Usado</option>
                  <option value="Expirado">Expirado</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {carregandoVales ? (
              <p className="text-xs text-slate-400 py-6 text-center">Carregando vales...</p>
            ) : valesLista.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum vale-troca encontrado.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs text-right">Valor Original (R$)</TableHead>
                      <TableHead className="text-xs text-right">Saldo Restante (R$)</TableHead>
                      <TableHead className="text-xs">Validade</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-center w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valesLista.map((vale) => {
                      const clienteNome = (vale.expand as any)?.cliente_id?.nome || 'Portador'
                      return (
                        <TableRow key={vale.id}>
                          <TableCell className="text-xs font-mono font-bold text-blue-700">
                            {vale.codigo}
                          </TableCell>
                          <TableCell className="text-xs">{clienteNome}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            R$ {Number(vale.valor).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-emerald-600">
                            R$ {Number(vale.saldo).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {vale.validade
                              ? new Date(vale.validade + 'T00:00:00').toLocaleDateString('pt-BR')
                              : 'Sem expiração'}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                vale.status === 'Ativo'
                                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                  : vale.status === 'Usado'
                                    ? 'border-slate-300 text-slate-600 bg-slate-50'
                                    : 'border-red-300 text-red-700 bg-red-50'
                              }`}
                            >
                              {vale.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleImprimirVale(vale)}
                              title="Imprimir Vale"
                              className="text-xs h-7 w-7 p-0"
                            >
                              <Printer className="h-3.5 w-3.5 text-slate-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de Autorização do Supervisor para Troca Fora do Prazo */}
      <ModalAutorizacaoSupervisor
        aberto={modalSupervisorAberto}
        onOpenChange={setModalSupervisorAberto}
        descontoPercentual={0}
        empresaId={empresaAtiva?.id}
        origem="troca_devolucao_prazo"
        produtoNome={`Devolução Venda #${vendaSelecionada?.numero} fora do prazo (${diasCorridos} dias / limite ${diasParaTroca})`}
        onAutorizado={() => {
          setSupervisorAutorizado(true)
          setModalSupervisorAberto(false)
          toast({
            title: 'Supervisor Autorizou',
            description: 'A troca fora do prazo foi autorizada. Prossiga com a finalização.',
          })
        }}
      />

      {/* Modal de Comprovante de Devolução Concluída */}
      <Dialog open={modalComprovanteAberto} onOpenChange={setModalComprovanteAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Devolução #{resultadoSucesso?.numero_devolucao} Registrada!
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Estoque atualizado e valor compensado.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-700">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span>Valor Total Devolvido:</span>
                <span className="font-bold text-slate-900">
                  R$ {resultadoSucesso?.valor_total.toFixed(2)}
                </span>
              </div>
              {resultadoSucesso?.vale_troca && (
                <div className="flex justify-between text-blue-700 font-bold">
                  <span>Código do Vale-Troca:</span>
                  <span>{resultadoSucesso.vale_troca.codigo}</span>
                </div>
              )}
            </div>

            {resultadoSucesso?.vale_troca && (
              <p className="text-[11px] text-slate-500">
                O cliente pode utilizar este código diretamente na forma de pagamento
                &quot;Vale-troca&quot; no PDV ou no balcão.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {resultadoSucesso?.vale_troca && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (resultadoSucesso?.vale_troca) {
                    handleImprimirVale(resultadoSucesso.vale_troca)
                  }
                }}
                className="text-xs gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir Vale-Troca
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setModalComprovanteAberto(false)}
              className="text-xs bg-slate-900 text-white"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 1: Conferência Pré-emissão da NF-e de Entrada Própria */}
      <Dialog open={modalConferenciaNFeAberto} onOpenChange={setModalConferenciaNFeAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Conferência da NF-e de Entrada Própria (Devolução de Venda)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Revise os dados fiscais da nota fiscal de entrada própria antes da transmissão para a
              SEFAZ.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Emitente & Remetente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="font-semibold text-slate-700 block mb-0.5">
                  Emitente (Nossa Empresa):
                </span>
                <p className="text-slate-900 font-medium">
                  {empresaAtiva?.razao_social || empresaAtiva?.nome_fantasia}
                </p>
                <p className="text-slate-500 text-[11px] font-mono">
                  CNPJ: {empresaAtiva?.cnpj || '-'} | UF: {empresaAtiva?.uf || '-'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-0.5">
                  Remetente (Cliente da Venda Original):
                </span>
                {vendaSelecionada?.cliente_id ? (
                  <>
                    <p className="text-slate-900 font-medium">
                      {(vendaSelecionada.expand as any)?.cliente_id?.nome_razao_social ||
                        (vendaSelecionada.expand as any)?.cliente_id?.nome ||
                        'Cliente cadastrado'}
                    </p>
                    <p className="text-slate-500 text-[11px] font-mono">
                      CPF/CNPJ:{' '}
                      {(vendaSelecionada.expand as any)?.cliente_id?.cpf_cnpj ||
                        vendaSelecionada.cpf_cnpj_consumidor ||
                        '-'}
                    </p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-amber-800 text-[11px] font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Venda sem cliente cadastrado. Informe Nome e CPF para a NF-e:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <Label className="text-[11px]">Nome / Razão Social</Label>
                        <Input
                          value={clienteAvulsoNome}
                          onChange={(e) => setClienteAvulsoNome(e.target.value)}
                          placeholder="Nome completo do consumidor..."
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">CPF / CNPJ</Label>
                        <Input
                          value={clienteAvulsoCpf}
                          onChange={(e) => setClienteAvulsoCpf(e.target.value)}
                          placeholder="Apenas números..."
                          className="h-8 text-xs bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {erroValidacaoClienteAvulso && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {erroValidacaoClienteAvulso}
              </div>
            )}

            {/* Chave de Acesso Referenciada */}
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1">
              <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-blue-600" />
                Chave da Nota Referenciada (44 dígitos):
              </span>
              <p className="font-mono text-xs text-blue-950 font-semibold break-all">
                {docFiscalVendaOrig?.chave_acesso ||
                  (vendaSelecionada as any)?.documento_referenciado_chave ||
                  'Chave da nota original vinculada no documento fiscal'}
              </p>
              <p className="text-[11px] text-blue-700">
                Modelo: {docFiscalVendaOrig?.modelo === '65' ? 'NFC-e (65)' : 'NF-e (55)'} |
                Finalidade de emissão: <strong>4 - Devolução de mercadoria</strong> (Entrada
                própria).
              </p>
            </div>

            {/* Itens Devolvidos com CFOP Previsto e Impostos Proporcionais */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  Itens Devolvidos &amp; CFOP Previsto:
                </span>
                <span className="text-slate-500 text-[11px]">
                  Total: <strong>R$ {resumoDevolucao.valorTotal.toFixed(2)}</strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-[11px]">Item / Descrição</TableHead>
                      <TableHead className="text-[11px] text-right">Qtd</TableHead>
                      <TableHead className="text-[11px] text-right">Valor Unit.</TableHead>
                      <TableHead className="text-[11px] text-center">CFOP Previsto</TableHead>
                      <TableHead className="text-[11px] text-right">Total (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumoDevolucao.itensInput.map((it, idx) => {
                      // Determinar se tem ST aproximado ou CFOP
                      const cfopPrevisto =
                        empresaAtiva?.uf &&
                        docFiscalVendaOrig?.destinatario_uf &&
                        empresaAtiva.uf !== docFiscalVendaOrig.destinatario_uf
                          ? '2202'
                          : '1202'

                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs font-medium">
                            {it.descricao}
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Custo Unit: R$ {Number(it.custo_unitario).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {it.quantidade} {it.unidade}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            R$ {Number(it.preco_unitario).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold text-blue-700">
                            {cfopPrevisto}{' '}
                            <span className="text-[10px] font-normal text-slate-500">
                              (ou 1411/2411 c/ ST)
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold">
                            R$ {Number(it.quantidade * it.preco_unitario).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * As bases de cálculo e alíquotas de ICMS, PIS e COFINS são calculadas
                proporcionalmente aos valores da nota fiscal de origem no momento da transmissão
                para a SEFAZ.
              </p>
            </div>

            {/* Aviso de Movimentação Condicionada à Autorização */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-1">
              <span className="font-semibold flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Atenção ao fluxo fiscal de devolução:
              </span>
              <p className="text-[11px] text-amber-800">
                O estoque e o financeiro (vale-troca, estorno em dinheiro ou crediário){' '}
                <strong>NÃO serão movimentados de imediato</strong>. O sistema manterá a devolução
                com status <strong>&quot;Pendente de nota&quot;</strong> e só confirmará a
                reintegração após a SEFAZ autorizar a NF-e.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalConferenciaNFeAberto(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={processando || !podeEmitirNotas}
              onClick={handleConfirmarEEmitirNFe}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{processando ? 'Transmitindo...' : 'Confirmar e emitir NF-e'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Acompanhamento de Transmissão / Polling da NF-e */}
      <Dialog
        open={modalTransmissaoAberto}
        onOpenChange={(aberto) => {
          if (!aberto && (faseTransmissao === 'polling' || faseTransmissao === 'enviando')) {
            // Não fecha durante envio
            return
          }
          setModalTransmissaoAberto(aberto)
          if (!aberto) {
            if (
              faseTransmissao === 'sucesso' ||
              faseTransmissao === 'erro' ||
              faseTransmissao === 'timeout'
            ) {
              setAbaAtiva('historico')
              carregarDevolucoes()
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              {faseTransmissao === 'polling' || faseTransmissao === 'enviando' ? (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              ) : faseTransmissao === 'sucesso' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : faseTransmissao === 'denegado' ? (
                <AlertTriangle className="h-5 w-5 text-purple-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              {faseTransmissao === 'polling'
                ? 'Aguardando Retorno da SEFAZ...'
                : faseTransmissao === 'enviando'
                  ? 'Transmitindo NF-e...'
                  : faseTransmissao === 'sucesso'
                    ? 'Devolução Autorizada!'
                    : faseTransmissao === 'denegado'
                      ? 'NF-e Denegada pela SEFAZ'
                      : faseTransmissao === 'timeout'
                        ? 'Processamento em Andamento'
                        : 'Rejeição na Emissão Fiscal'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {faseTransmissao === 'polling'
                ? `Consultando situação a cada 3s (${tempoPolling}s decorridos de até 30s)...`
                : 'Status da operação fiscal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3 text-xs">
            <div
              className={`p-3.5 rounded-lg border ${
                faseTransmissao === 'sucesso'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : faseTransmissao === 'denegado'
                    ? 'bg-purple-50 border-purple-200 text-purple-900'
                    : faseTransmissao === 'erro'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : faseTransmissao === 'timeout'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <p className="leading-relaxed font-medium">{mensagemTransmissao}</p>
            </div>

            {faseTransmissao === 'denegado' && (
              <p className="text-[11px] text-purple-800">
                Uma nota fiscal denegada decorre de irregularidade fiscal do emitente ou
                destinatário. Ela não pode ser corrigida nem reutilizada.
              </p>
            )}

            {faseTransmissao === 'timeout' && (
              <p className="text-[11px] text-slate-500">
                A nota segue pendente na fila da SEFAZ. Você pode acompanhar e reconsultar na aba{' '}
                <strong>Histórico de Devoluções</strong>.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              disabled={faseTransmissao === 'enviando' || faseTransmissao === 'polling'}
              onClick={() => {
                setModalTransmissaoAberto(false)
                setAbaAtiva('historico')
                carregarDevolucoes()
              }}
              className="text-xs bg-slate-900 text-white"
            >
              Entendido / Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Detalhes da Devolução e Documento Fiscal Vinculado */}
      <Dialog open={modalDetalheAberto} onOpenChange={setModalDetalheAberto}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Detalhes da Devolução #{devolucaoDetalhe?.numero}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informações gerais da devolução e dados da nota fiscal vinculada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Cabeçalho */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono">
              <div>
                <span className="text-slate-500 text-[10px] block font-sans">Situação:</span>
                <span className="font-bold text-slate-900">
                  {devolucaoDetalhe?.status === 'Pendente de nota' ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 border-amber-300"
                    >
                      Pendente de nota
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-emerald-100 text-emerald-800 border-emerald-300"
                    >
                      {devolucaoDetalhe?.status}
                    </Badge>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block font-sans">Valor Total:</span>
                <span className="font-bold text-slate-900">
                  R$ {Number(devolucaoDetalhe?.valor_total).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block font-sans">Data:</span>
                <span>
                  {devolucaoDetalhe?.created
                    ? new Date(devolucaoDetalhe.created).toLocaleDateString('pt-BR')
                    : '-'}
                </span>
              </div>
            </div>

            {/* Motivo se pendente */}
            {devolucaoDetalhe?.motivo_cancelamento && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Motivo da Rejeição / Pendência Fiscal:
                </span>
                <p className="text-[11px] leading-relaxed">
                  {devolucaoDetalhe.motivo_cancelamento}
                </p>
              </div>
            )}

            {/* Dados do Documento Fiscal Vinculado */}
            {docFiscalDetalhe ? (
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2">
                <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-blue-600" />
                  Documento Fiscal Vinculado (NF-e Modelo 55):
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block font-sans text-[10px]">Número:</span>
                    <span className="font-bold">{docFiscalDetalhe.numero || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-sans text-[10px]">Série:</span>
                    <span>{docFiscalDetalhe.serie || '1'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-sans text-[10px]">Status:</span>
                    <Badge variant="outline" className="text-[10px]">
                      {docFiscalDetalhe.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-sans text-[10px]">Protocolo:</span>
                    <span>{docFiscalDetalhe.protocolo || '-'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-100">
                  <span className="text-slate-500 block text-[10px]">
                    Chave de Acesso (44 dígitos):
                  </span>
                  <span className="font-mono text-[11px] font-semibold break-all text-blue-950">
                    {docFiscalDetalhe.chave_acesso || '-'}
                  </span>
                </div>

                {/* Botões Abrir DANFE e Baixar XML */}
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  {docFiscalDetalhe.danfe_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(docFiscalDetalhe.danfe_url, '_blank')}
                      className="text-xs h-8 gap-1.5 bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir DANFE
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={baixandoXml}
                    onClick={() => handleBaixarXml(docFiscalDetalhe.id)}
                    className="text-xs h-8 gap-1.5 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <Download className={`h-3.5 w-3.5 ${baixandoXml ? 'animate-spin' : ''}`} />
                    Baixar XML
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-2">
                Nenhum documento fiscal autorizado vinculado a esta devolução.
              </p>
            )}

            {/* Ação de tentar de novo se estiver Pendente de nota */}
            {devolucaoDetalhe?.status === 'Pendente de nota' && (
              <div className="pt-2 border-t border-slate-200 flex justify-end">
                <Button
                  size="sm"
                  disabled={reemitindoId === devolucaoDetalhe.id || !podeEmitirNotas}
                  onClick={() => {
                    setModalDetalheAberto(false)
                    handleTentarDeNovo(devolucaoDetalhe)
                  }}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tentar de novo
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModalDetalheAberto(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
